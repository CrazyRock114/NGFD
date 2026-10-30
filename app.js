// ============================================================================
// U11 别墅四层 3D 重建与室内设计可视化引擎 (V2 Pro 融合增强版 & V1 经典原版双模实时切换)
// 100% 离线运行，无外部 CDN 依赖；支持：
// - 外墙浅暖灰褐手工砖墙肌理 + 全屋纯白内墙（双面法线差异化着色）
// - David Chipperfield 风格宁国府邸社区园林（砖石基座修剪高绿篱、极简静水池、西郊梧桐与香樟、邻栋环境）
// - 参数化门窗三维立面构造（2.2m 门头过梁、0.55m 窗台墙、2.7m 窗顶过梁、金属分格窗框与半透明玻璃、天井玻璃栏板）
// - 俯览墙体半高剖切（1.45m Cutaway）与第一人称漫游自动 3F 屋顶封顶 + 室内暖光照明切换
// - 3D 楼板表面原图 UV 贴合（支持将 300DPI 设计稿/原户型册直接贴在 3D 各层地面上）
// - 交互式卫星图红线拖拽比例尺标定、室内自动避雨（仅室外与中央天井落雨）、Open-Meteo 上海实时天气同步
// ============================================================================

const Vec3 = {
  create: (x=0, y=0, z=0) => new Float32Array([x, y, z]),
  add: (a, b) => [a[0]+b[0], a[1]+b[1], a[2]+b[2]],
  sub: (a, b) => [a[0]-b[0], a[1]-b[1], a[2]-b[2]],
  scale: (a, s) => [a[0]*s, a[1]*s, a[2]*s],
  dot: (a, b) => a[0]*b[0] + a[1]*b[1] + a[2]*b[2],
  cross: (a, b) => [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]],
  len: (a) => Math.hypot(a[0], a[1], a[2]),
  norm: (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0]/l, a[1]/l, a[2]/l]; },
  dist: (a, b) => Math.hypot(a[0]-b[0], a[1]-b[1], a[2]-b[2])
};

const Mat4 = {
  identity: () => new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]),
  multiply: (a, b) => {
    const out = new Float32Array(16);
    for (let i=0; i<4; i++) {
      for (let j=0; j<4; j++) {
        out[j*4+i] = a[0*4+i]*b[j*4+0] + a[1*4+i]*b[j*4+1] + a[2*4+i]*b[j*4+2] + a[3*4+i]*b[j*4+3];
      }
    }
    return out;
  },
  perspective: (fovyRad, aspect, near, far) => {
    const f = 1.0 / Math.tan(fovyRad / 2);
    const nf = 1 / (near - far);
    return new Float32Array([
      f / aspect, 0, 0, 0,
      0, f, 0, 0,
      0, 0, (far + near) * nf, -1,
      0, 0, (2 * far * near) * nf, 0
    ]);
  },
  ortho: (left, right, bottom, top, near, far) => {
    const lr = 1 / (left - right), bt = 1 / (bottom - top), nf = 1 / (near - far);
    return new Float32Array([
      -2 * lr, 0, 0, 0,
      0, -2 * bt, 0, 0,
      0, 0, 2 * nf, 0,
      (left + right) * lr, (top + bottom) * bt, (far + near) * nf, 1
    ]);
  },
  lookAt: (eye, center, up) => {
    const z = Vec3.norm(Vec3.sub(eye, center));
    let x = Vec3.cross(up, z);
    if (Vec3.len(x) < 1e-5) x = [1, 0, 0];
    else x = Vec3.norm(x);
    const y = Vec3.cross(z, x);
    return new Float32Array([
      x[0], y[0], z[0], 0,
      x[1], y[1], z[1], 0,
      x[2], y[2], z[2], 0,
      -Vec3.dot(x, eye), -Vec3.dot(y, eye), -Vec3.dot(z, eye), 1
    ]);
  },
  invert: (m) => {
    const inv = new Float32Array(16);
    inv[0] = m[5]*m[10]*m[15] - m[5]*m[11]*m[14] - m[9]*m[6]*m[15] + m[9]*m[7]*m[14] + m[13]*m[6]*m[11] - m[13]*m[7]*m[10];
    inv[4] = -m[4]*m[10]*m[15] + m[4]*m[11]*m[14] + m[8]*m[6]*m[15] - m[8]*m[7]*m[14] - m[12]*m[6]*m[11] + m[12]*m[7]*m[10];
    inv[8] = m[4]*m[9]*m[15] - m[4]*m[11]*m[13] - m[8]*m[5]*m[15] + m[8]*m[7]*m[13] + m[12]*m[5]*m[11] - m[12]*m[7]*m[9];
    inv[12] = -m[4]*m[9]*m[14] + m[4]*m[10]*m[13] + m[8]*m[5]*m[14] - m[8]*m[6]*m[13] - m[12]*m[5]*m[10] + m[12]*m[6]*m[9];
    inv[1] = -m[1]*m[10]*m[15] + m[1]*m[11]*m[14] + m[9]*m[2]*m[15] - m[9]*m[3]*m[14] - m[13]*m[2]*m[11] + m[13]*m[3]*m[10];
    inv[5] = m[0]*m[10]*m[15] - m[0]*m[11]*m[14] - m[8]*m[2]*m[15] + m[8]*m[3]*m[14] + m[12]*m[2]*m[11] - m[12]*m[3]*m[10];
    inv[9] = -m[0]*m[9]*m[15] + m[0]*m[11]*m[13] + m[8]*m[1]*m[15] - m[8]*m[3]*m[13] - m[12]*m[1]*m[11] + m[12]*m[3]*m[9];
    inv[13] = m[0]*m[9]*m[14] - m[0]*m[10]*m[13] - m[8]*m[1]*m[14] + m[8]*m[2]*m[13] + m[12]*m[1]*m[10] - m[12]*m[2]*m[9];
    inv[2] = m[1]*m[6]*m[15] - m[1]*m[7]*m[14] - m[5]*m[2]*m[15] + m[5]*m[3]*m[14] + m[13]*m[2]*m[7] - m[13]*m[3]*m[6];
    inv[6] = -m[0]*m[6]*m[15] + m[0]*m[7]*m[14] + m[4]*m[2]*m[15] - m[4]*m[3]*m[14] - m[12]*m[2]*m[7] + m[12]*m[3]*m[6];
    inv[10] = m[0]*m[5]*m[15] - m[0]*m[7]*m[13] - m[4]*m[1]*m[15] + m[4]*m[3]*m[13] + m[12]*m[1]*m[7] - m[12]*m[3]*m[5];
    inv[14] = -m[0]*m[5]*m[14] + m[0]*m[6]*m[13] + m[4]*m[1]*m[14] - m[4]*m[2]*m[13] - m[12]*m[1]*m[6] + m[12]*m[2]*m[5];
    inv[3] = -m[1]*m[6]*m[11] + m[1]*m[7]*m[10] + m[5]*m[2]*m[11] - m[5]*m[3]*m[10] - m[9]*m[2]*m[7] + m[9]*m[3]*m[6];
    inv[7] = m[0]*m[6]*m[11] - m[0]*m[7]*m[10] - m[4]*m[2]*m[11] + m[4]*m[3]*m[10] + m[8]*m[2]*m[7] - m[8]*m[3]*m[6];
    inv[11] = -m[0]*m[5]*m[11] + m[0]*m[7]*m[9] + m[4]*m[1]*m[11] - m[4]*m[3]*m[9] - m[8]*m[1]*m[7] + m[8]*m[3]*m[5];
    inv[15] = m[0]*m[5]*m[10] - m[0]*m[6]*m[9] - m[4]*m[1]*m[10] + m[4]*m[2]*m[9] + m[8]*m[1]*m[6] - m[8]*m[2]*m[5];
    let det = m[0]*inv[0] + m[1]*inv[4] + m[2]*inv[8] + m[3]*inv[12];
    if (Math.abs(det) < 1e-12) return Mat4.identity();
    det = 1.0 / det;
    for (let i=0; i<16; i++) inv[i] *= det;
    return inv;
  }
};

function triangulatePolygon2D(pts) {
  const n = pts.length;
  if (n < 3) return [];
  if (n === 3) return [[0, 1, 2]];
  if (n === 4) return [[0, 1, 2], [0, 2, 3]];
  let area = 0;
  for (let i=0; i<n; i++) {
    const p1 = pts[i], p2 = pts[(i+1)%n];
    area += (p1[0]*p2[1] - p2[0]*p1[1]);
  }
  const V = [];
  for (let i=0; i<n; i++) V.push(area >= 0 ? i : (n - 1 - i));
  const tris = [];
  let count = 2 * n;
  for (let v = n - 1; V.length > 2; ) {
    if ((count--) <= 0) break;
    let u = v; if (u >= V.length) u = 0;
    v = u + 1; if (v >= V.length) v = 0;
    let w = v + 1; if (w >= V.length) w = 0;
    const A = pts[V[u]], B = pts[V[v]], C = pts[V[w]];
    const cross = (B[0]-A[0])*(C[1]-A[1]) - (B[1]-A[1])*(C[0]-A[0]);
    if (cross < -1e-7) continue;
    let inside = false;
    for (let p=0; p<V.length; p++) {
      if (p === u || p === v || p === w) continue;
      const P = pts[V[p]];
      const c1 = (B[0]-A[0])*(P[1]-A[1]) - (B[1]-A[1])*(P[0]-A[0]);
      const c2 = (C[0]-B[0])*(P[1]-B[1]) - (C[1]-B[1])*(P[0]-B[0]);
      const c3 = (A[0]-C[0])*(P[1]-C[1]) - (A[1]-C[1])*(P[0]-C[0]);
      if (c1 >= -1e-6 && c2 >= -1e-6 && c3 >= -1e-6) { inside = true; break; }
    }
    if (!inside) {
      tris.push([V[u], V[v], V[w]]);
      V.splice(v, 1);
      count = 2 * V.length;
    }
  }
  return tris;
}

function pointInPoly2D(px, pz, poly) {
  let inside = false;
  for (let i=0, j=poly.length-1; i<poly.length; j=i++) {
    const xi = poly[i][0], zi = poly[i][1];
    const xj = poly[j][0], zj = poly[j][1];
    if (((zi > pz) !== (zj > pz)) && (px < (xj - xi) * (pz - zi) / (zj - zi + 1e-12) + xi)) {
      inside = !inside;
    }
  }
  return inside;
}

function hexToRgb(hex) {
  const h = (hex || '#F5F3EE').replace('#', '');
  const n = parseInt(h, 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

// Material Type IDs encoded in vertex alpha (aColor.a):
// < 0.95 = Semi-transparent Glass / Shadow / Water (alpha = matId)
// 1.0 = Smooth Matte / Pure Warm White Interior Wall
// 2.0 = David Chipperfield Light Warm Grey-Brown / Taupe Brick (宁国府邸浅暖灰褐手工砖石肌理)
// 3.0 = Warm Interior Oak / Travertine Flooring (室内暖白浅橡木/洞石纹理)
// 4.0 = Courtyard & Estate Lush Grass / Clipped Hedge Foliage (庭院与小区自然草坪/绿篱肌理)
// 5.0 = Courtyard Teak Wood Deck (庭院防腐柚木条纹甲板)
// 6.0 = Calacatta White Marble / Stone Surface (白色大花白大理石纹理)
// 7.0 = 3D Floor Slab UV Plan Texture Overlay (直接贴合在 3D 地面上的高清原始图纸)

const App = {
  data: null,
  gl: null,
  canvas: null,
  progMain: null,
  progLine: null,
  buffers: {},
  planTextures: {},
  versionMode: 'v2', // 'v2' (Enhanced Pro) or 'v1' (Classic Original)
  cameraMode: 'orbit',
  floorFilter: 'ALL',
  fovDeg: 84,
  walkSpeed: 3.4,
  eyeHeight: 1.66,
  wallCutHeight: 3.80,
  scaleFactor: 1.0,
  satRoofPts: [[431, 549], [610, 679]],
  oppositeBuildingMode: 'tianyuan', // Strictly 剑河路888号《田园别墅》per satellite map
  showPrivacyRays: true,
  stonePaintSeams: false, // Default false = seamless monolithic white real-stone paint (无瓷砖拼缝效果)
  floorMaterialMode: 'darkgrey', // 'darkgrey' (U2样板间黑灰色木地板) or 'wood' (原木色地板)
  furnitureStyleMode: 'u2_model', // 'u2_model' (U2样板房实拍高定风格) | 'design' (装饰参考稿261022原配风格) | 'minimal' (极简留白艺术画廊风)
  balustradeStyleMode: 'u2_steel', // 'u2_steel' (样式1: 白钢密竖杆+一体连续木扶手) | 'wood' (样式2: 全木质围栏) | 'glass' (样式3: 极简玻璃围挡)
  tianyuanVillaLabels: [],

  orbit: {
    target: [13.5, 1.8, -10.5],
    distance: 35.0,
    yaw: -0.35,
    pitch: 0.70,
    orthoZoom: 15.0
  },

  walk: {
    pos: [12.5, 0.0, -9.5],
    yaw: 0.0,
    pitch: 0.12,
    keys: {},
    joyX: 0.0,
    joyY: 0.0,
    joyActive: false,
    tourActive: false,
    tourWaypoints: [],
    tourIdx: 0
  },

  sun: {
    dir: [0.4, 0.85, 0.35],
    altitudeDeg: 65.0,
    azimuthDeg: 180.0,
    weather: 'sunny',
    skyColor: [0.56, 0.78, 0.95],
    sunIntensity: 1.0,
    ambientIntensity: 0.52,
    rainDrops: []
  },

  measure: {
    active: false,
    pts: [],
    segments: []
  },
  selectedFurnitureId: null,
  raycastTriangles: [],

  init() {
    this.data = JSON.parse(JSON.stringify(window.U11_BUILDING_DATA));
    this.recalculateElevationsAndStairs();
    const saved = localStorage.getItem('U11_SAVED_STATE_V7');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed.furniture) {
          this.data.furniture = parsed.furniture.filter(f => f.id !== '2f_platform_loungers' && f.id !== '3f_terrace_garden');
        }
        if (parsed.floorHeights) {
          for (const k of ['B1','1F','2F','3F']) {
            if (parsed.floorHeights[k]) this.data.floors[k].height = parsed.floorHeights[k];
          }
        }
        this.recalculateElevationsAndStairs();
      } catch (e) { console.warn(e); }
    }

    this.canvas = document.getElementById('gl-canvas');
    this.gl = this.canvas.getContext('webgl2', { antialias: true, preserveDrawingBuffer: true });
    if (!this.gl) {
      alert('您的浏览器不支持 WebGL2');
      return;
    }

    this.initShaders();
    this.initSatelliteCalibrationSVG();
    this.populateUI();
    this.rebuildGeometryBuffers();
    this.updateSunAndWeather();
    this.bindEvents();
    this.resize();
    requestAnimationFrame((t) => this.loop(t));
  },

  toggleVersionMode() {
    this.versionMode = (this.versionMode === 'v2') ? 'v1' : 'v2';
    const isV2 = (this.versionMode === 'v2');
    const btn = document.getElementById('btn-ver-toggle');
    const badge = document.getElementById('ver-badge');
    const hudVer = document.getElementById('hud-ver');
    const chkFen = document.getElementById('chk-fenestration');
    const chkRoof = document.getElementById('chk-walk-roof');
    const chkRoofCeil = document.getElementById('chk-roof-ceiling');
    const chkUV = document.getElementById('chk-3d-uv-overlay');

    if (isV2) {
      if (btn) { btn.textContent = '✨ 当前: V2 融合增强版 (点击切回 V1)'; btn.className = 'btn purple'; }
      if (badge) badge.textContent = 'U11~U8 四联 · V2 Pro';
      if (hudVer) { hudVer.textContent = 'V2 Pro 融合增强版'; hudVer.style.color = '#a78bfa'; }
      if (chkFen) chkFen.checked = true;
      if (chkRoof) chkRoof.checked = true;
      if (chkRoofCeil) this.syncRoofToggle(true);
    } else {
      if (btn) { btn.textContent = '⏪ 当前: V1 经典原版模式 (点击切至 V2)'; btn.className = 'btn warn'; }
      if (badge) badge.textContent = 'U11~U8 四联 · V1 Classic';
      if (hudVer) { hudVer.textContent = 'V1 Classic 经典原版'; hudVer.style.color = '#fbbf24'; }
      if (chkFen) chkFen.checked = false;
      if (chkRoof) chkRoof.checked = false;
      if (chkUV) chkUV.checked = false;
      this.setWallCutHeight(3.80);
    }
    this.rebuildGeometryBuffers();
  },

  togglePartyWallKnockthrough() {
    const chk = document.getElementById('chk-party-knock');
    const nextState = chk ? !chk.checked : false;
    this.syncPartyWallToggle(nextState);
  },

  syncPartyWallToggle(checked) {
    const chk = document.getElementById('chk-party-knock');
    if (chk) chk.checked = checked;
    const btn = document.getElementById('btn-party-toggle');
    if (btn) {
      btn.textContent = checked ? '🔗 二联户间墙: 已打通' : '🧱 二联户间墙: 保留填充墙';
      btn.className = checked ? 'btn success' : 'btn warn';
    }
    this.rebuildGeometryBuffers();
  },

  toggleStonePaintSeams() {
    this.syncStonePaintSeams(!this.stonePaintSeams);
  },

  syncStonePaintSeams(checked) {
    this.stonePaintSeams = !!checked;
    const chk = document.getElementById('chk-stone-seams');
    if (chk) chk.checked = this.stonePaintSeams;
    const btn = document.getElementById('btn-stone-seams');
    if (btn) {
      btn.textContent = this.stonePaintSeams ? '🧱 庭院真石漆: 带分格缝' : '🧱 庭院真石漆: 无拼缝';
      btn.className = this.stonePaintSeams ? 'btn warn' : 'btn success';
    }
    this.rebuildGeometryBuffers();
  },

  toggleFloorMaterial() {
    this.setFloorMaterial(this.floorMaterialMode === 'wood' ? 'darkgrey' : 'wood');
  },

  setFloorMaterial(mode) {
    this.floorMaterialMode = (mode === 'darkgrey') ? 'darkgrey' : 'wood';
    const sel = document.getElementById('sel-floor-mat');
    if (sel) sel.value = this.floorMaterialMode;
    const btn = document.getElementById('btn-floor-mat');
    if (btn) {
      if (this.floorMaterialMode === 'wood') {
        btn.textContent = '🪵 地板: 原木色地板';
        btn.className = 'btn warn';
      } else {
        btn.textContent = '🪨 地板: 黑灰色地板';
        btn.className = 'btn active';
      }
    }
    this.rebuildGeometryBuffers();
  },

  cycleFurnitureStyle() {
    const order = ['u2_model', 'design', 'minimal'];
    const nextIdx = (order.indexOf(this.furnitureStyleMode) + 1) % order.length;
    this.setFurnitureStyle(order[nextIdx]);
  },

  cycleBalustradeStyle() {
    const order = ['u2_steel', 'wood', 'glass'];
    const nextIdx = (order.indexOf(this.balustradeStyleMode) + 1) % order.length;
    this.setBalustradeStyle(order[nextIdx]);
  },

  setBalustradeStyle(mode) {
    const valid = ['u2_steel', 'wood', 'glass'];
    this.balustradeStyleMode = valid.includes(mode) ? mode : 'u2_steel';
    const sel = document.getElementById('sel-balustrade-style');
    if (sel) sel.value = this.balustradeStyleMode;
    const btn = document.getElementById('btn-balustrade-style');
    if (btn) {
      if (this.balustradeStyleMode === 'u2_steel') {
        btn.textContent = '栏杆: 1.白钢+一体木扶手';
        btn.className = 'btn active';
      } else if (this.balustradeStyleMode === 'wood') {
        btn.textContent = '栏杆: 2.全木质围栏';
        btn.className = 'btn warn';
      } else {
        btn.textContent = '栏杆: 3.极简无框玻璃围挡';
        btn.className = 'btn success';
      }
    }
    this.rebuildGeometryBuffers();
  },

  setFurnitureStyle(mode) {
    const valid = ['u2_model', 'design', 'minimal'];
    this.furnitureStyleMode = valid.includes(mode) ? mode : 'u2_model';
    const sel1 = document.getElementById('sel-furn-style');
    const sel2 = document.getElementById('sel-furn-style-edit');
    if (sel1) sel1.value = this.furnitureStyleMode;
    if (sel2) sel2.value = this.furnitureStyleMode;
    const btn = document.getElementById('btn-furn-style');
    if (btn) {
      if (this.furnitureStyleMode === 'u2_model') {
        btn.textContent = '🛋️ 家具: U2样板房风格';
        btn.className = 'btn purple';
      } else if (this.furnitureStyleMode === 'design') {
        btn.textContent = '🏛️ 家具: 装饰参考稿原配';
        btn.className = 'btn active';
      } else {
        btn.textContent = '🤍 家具: 极简留白画廊风';
        btn.className = 'btn success';
      }
    }
    this.rebuildGeometryBuffers();
  },

  cycleOppositeBuildingMode() {
    const order = ['multifamily', 'tianyuan', 'hybrid'];
    const nextIdx = (order.indexOf(this.oppositeBuildingMode) + 1) % order.length;
    this.setOppositeBuildingMode(order[nextIdx]);
  },

  setOppositeBuildingMode(mode) {
    this.oppositeBuildingMode = mode;
    const sel = document.getElementById('sel-opposite-mode');
    if (sel) sel.value = mode;
    const btn = document.getElementById('btn-opp-mode');
    if (btn) {
      const labels = {
        multifamily: '🏘️ 对岸: 4-5F一梯两户板楼(分级隐私窗)',
        tianyuan: '🏡 对岸: 田园别墅D30-D36(实测2.5-3F别墅)',
        hybrid: '🌆 对岸: 实测别墅+多层综合模式'
      };
      btn.textContent = labels[mode] || labels.multifamily;
    }
    this.rebuildGeometryBuffers();
  },

  togglePrivacySightlines() {
    this.showPrivacyRays = !this.showPrivacyRays;
    const chk = document.getElementById('chk-privacy-rays');
    if (chk) chk.checked = this.showPrivacyRays;
    const btn = document.getElementById('btn-privacy-toggle');
    if (btn) {
      btn.textContent = this.showPrivacyRays ? '👁️ 隐私视线与敏感窗: 开启' : '👁️ 隐私视线与敏感窗: 关闭';
      btn.className = this.showPrivacyRays ? 'btn warn' : 'btn';
    }
    this.rebuildGeometryBuffers();
  },

  toggleMobileSettings(open) {
    const panel = document.getElementById('left-panel');
    const btnOpen = document.getElementById('btn-open-settings-mobile');
    if (!panel) return;
    const shouldOpen = (typeof open === 'boolean') ? open : !panel.classList.contains('mobile-settings-open');
    panel.classList.toggle('mobile-settings-open', shouldOpen);
    if (btnOpen) {
      btnOpen.textContent = shouldOpen ? '✕ 关闭设置' : '⚙️ 设置';
      btnOpen.classList.toggle('active', shouldOpen);
    }
  },

  toggleQuickWallCut() {
    const isCut = this.wallCutHeight < 3.60;
    this.setWallCutHeight(isCut ? 3.80 : 1.45);
  },

  toggleRoofCeiling() {
    const chk = document.getElementById('chk-roof-ceiling');
    const nextState = chk ? !chk.checked : false;
    this.syncRoofToggle(nextState);
  },

  syncRoofToggle(checked) {
    const chk = document.getElementById('chk-roof-ceiling');
    if (chk) chk.checked = checked;
    const btn = document.getElementById('btn-roof-toggle');
    if (btn) {
      btn.textContent = checked ? '🏠 顶楼天花板: 显示' : '🏠 顶楼天花板: 隐藏';
      btn.className = checked ? 'btn success' : 'btn';
    }
    const mBtnRoof = document.getElementById('m-btn-roof');
    if (mBtnRoof) {
      mBtnRoof.classList.toggle('active', !!checked);
    }
    this.rebuildGeometryBuffers();
  },

  setWallCutHeight(val) {
    this.wallCutHeight = parseFloat(val);
    const rng = document.getElementById('rng-cut-height');
    const lbl = document.getElementById('lbl-cut-height');
    if (rng) rng.value = this.wallCutHeight;
    if (lbl) lbl.textContent = this.wallCutHeight >= 3.75 ? '满高' : `${this.wallCutHeight.toFixed(2)}m`;
    const mBtnCut = document.getElementById('m-btn-cut');
    if (mBtnCut) {
      const isCut = this.wallCutHeight < 3.60;
      mBtnCut.classList.toggle('warn-active', isCut);
      mBtnCut.textContent = isCut ? '✂️ 1.45m' : '✂️ 剖切';
    }
    this.rebuildGeometryBuffers();
  },

  initShaders() {
    const gl = this.gl;
    const vsMain = `#version 300 es
      layout(location=0) in vec3 aPos;
      layout(location=1) in vec3 aNorm;
      layout(location=2) in vec4 aColor;
      uniform mat4 uVP;
      out vec3 vPos;
      out vec3 vNorm;
      out vec4 vColor;
      void main() {
        vPos = aPos;
        vNorm = aNorm;
        vColor = aColor;
        gl_Position = uVP * vec4(aPos, 1.0);
      }
    `;
    const fsMain = `#version 300 es
      precision highp float;
      in vec3 vPos;
      in vec3 vNorm;
      in vec4 vColor;
      uniform vec3 uSunDir;
      uniform vec3 uSkyColor;
      uniform float uSunIntensity;
      uniform float uAmbient;
      uniform vec3 uEyePos;
      uniform float uIndoorWarmLight;
      uniform float uStonePaintSeams;
      uniform float uFloorMatMode;
      uniform sampler2D uPlanTex;
      uniform vec4 uPlanBounds; // (minX, maxX, minZ, maxZ)
      uniform float uPlanAlpha;
      out vec4 fragColor;

      float hash21(vec2 p) {
        p = fract(p * vec2(123.34, 456.21));
        p += dot(p, p + 45.32);
        return fract(p.x * p.y);
      }

      void main() {
        vec3 N = normalize(vNorm);
        vec3 L = normalize(uSunDir);
        vec3 baseCol = vColor.rgb;
        float matId = vColor.a;
        float alpha = 1.0;

        if (matId < 0.95) {
          // Semi-transparent glass / shadow
          alpha = matId;
        } else if (abs(matId - 1.0) < 0.1 && abs(N.y) < 0.35 && baseCol.r > 0.89 && baseCol.g > 0.88 && baseCol.b > 0.86) {
          // Material 1.0 (Interior Gallery-Grade Warm Matte White Plaster Wall, Photos 1, 2, 4, 5, 7, 10)
          // Features ultra-fine velvety plaster micro-texture, recessed flush shadow-gap skirting line at floor base, and warm indoor gallery bounce lighting!
          vec2 wuv = (abs(N.x) > 0.65) ? vPos.zy : vec2(vPos.x + vPos.z * 0.25, vPos.y);
          float microPlaster = (hash21(floor(wuv * 180.0)) - 0.5) * 0.012 + (hash21(floor(wuv * 45.0)) - 0.5) * 0.008;
          // Subtle recessed shadow-gap skirting line (暗藏式极简踢脚线微阴影) right above floor levels (0.0m, 3.50m, 7.00m)
          float flRelY = mod(max(vPos.y, 0.0), 3.50);
          float skirtShadow = smoothstep(0.018, 0.042, flRelY);
          float skirtLine = mix(0.76, 1.0, skirtShadow);
          float ndlWall = max(dot(N, L), 0.0);
          float galleryBounce = 0.84 + 0.12 * ndlWall + 0.04 * uIndoorWarmLight + microPlaster;
          vec3 warmGalleryWhite = clamp(vec3(0.992, 0.985, 0.972) * galleryBounce * skirtLine, 0.72, 0.995);
          float dist = length(vPos - uEyePos);
          float fog = clamp((dist - 65.0) / 180.0, 0.0, 0.22);
          fragColor = vec4(mix(warmGalleryWhite, uSkyColor, fog), 1.0);
          return;
        } else if (abs(matId - 2.0) < 0.1) {
          // Material 2.0: Authentic Model-Unit Pale Silver-Grey / Ash Handmade Kiln Brick (实拍图8：浅灰白/银灰手工青砖肌理，含横竖交错砌法)
          float u = (abs(N.y) > 0.7) ? vPos.x : ((abs(N.x) > 0.65) ? vPos.z : (vPos.x + vPos.z * 0.35));
          float v = (abs(N.y) > 0.7) ? vPos.z : vPos.y;
          float row = floor(v / 0.072);
          float isSoldier = step(4.5, mod(row, 6.0)); // Every 6th course has vertical/header relief texture as in Photo 8
          float bw = mix(0.24, 0.08, isSoldier);
          float col = floor((u + mod(row, 2.0) * 0.11) / bw);
          float fu = fract((u + mod(row, 2.0) * 0.11) / bw);
          float fv = fract(v / 0.072);
          float mortar = step(0.07, fu) * step(0.12, fv);
          float n1 = hash21(vec2(col, row)) - 0.5;
          float n2 = hash21(floor(vec2(u * 42.0, v * 42.0))) - 0.5;
          vec3 brickRgb = baseCol + vec3(n1 * 0.075 + n2 * 0.032, n1 * 0.072 + n2 * 0.030, n1 * 0.068 + n2 * 0.028);
          vec3 mortarRgb = vec3(0.84, 0.84, 0.82);
          baseCol = mix(mortarRgb, brickRgb, mortar);
        } else if (abs(matId - 9.0) < 0.1) {
          // Material 9.0: Courtyard & Outer Gallery Walkway Dark Charcoal-Slate Narrow Clay/Stone Pavers (实拍图3/6/9：外回廊地面与中庭深青灰/炭黑小条砖错缝工字铺装)
          float bx = floor(vPos.x / 0.085);
          float bz = floor((vPos.z + mod(bx, 2.0) * 0.14) / 0.28);
          float fx = fract(vPos.x / 0.085);
          float fz = fract((vPos.z + mod(bx, 2.0) * 0.14) / 0.28);
          float joint = step(0.075, fx) * step(0.035, fz);
          float bn = hash21(vec2(bx, bz)) - 0.5;
          float slateGrain = sin(vPos.z * 38.0 + bn * 4.0) * 0.012;
          float grit = (hash21(floor(vPos.xz * 65.0)) - 0.5) * 0.026;
          vec3 tileRgb = baseCol + vec3(bn * 0.048 + slateGrain + grit, bn * 0.046 + slateGrain + grit, bn * 0.050 + slateGrain + grit);
          vec3 mortarCol = vec3(0.38, 0.39, 0.38);
          baseCol = mix(mortarCol, tileRgb, joint);
        } else if (abs(matId - 3.0) < 0.1) {
          // Material 3.0: Selectable Flooring — Mode 0.0: Natural Warm Oak Wood (原木色地板) | Mode 1.0: U2 Model-Unit Smoked Charcoal-Dark-Grey Brushed Wide-Plank Wood Flooring (实拍图1/2/4/5/7黑灰色拉丝宽幅木地板)
          if (uFloorMatMode < 0.5) {
            // 🪵 原木色实木地板 (Natural Honey-Oak Wood Planks with longitudinal wood-grain fibers)
            float plankX = floor(vPos.x / 0.19);
            float plankZ = floor((vPos.z + mod(plankX, 2.0) * 0.65) / 1.35);
            float fx = fract(vPos.x / 0.19);
            float fz = fract((vPos.z + mod(plankX, 2.0) * 0.65) / 1.35);
            float seam = step(0.032, fx) * step(0.014, fz);
            float boardRand = hash21(vec2(plankX, plankZ)) - 0.5;
            float grainWave = sin(vPos.z * 48.0 + sin(vPos.x * 16.0 + boardRand * 6.0) * 2.4) * 0.5 + 0.5;
            float fineFiber = (hash21(floor(vec2(vPos.x * 95.0, vPos.z * 22.0))) - 0.5) * 0.028;
            vec3 oakBase = vec3(0.76, 0.56, 0.36) + vec3(boardRand * 0.055, boardRand * 0.042, boardRand * 0.025);
            vec3 oakGrain = oakBase + vec3((grainWave - 0.5) * 0.048 + fineFiber, (grainWave - 0.5) * 0.035 + fineFiber * 0.8, (grainWave - 0.5) * 0.020);
            vec3 grooveCol = vec3(0.42, 0.29, 0.17);
            baseCol = mix(grooveCol, oakGrain, seam);
          } else {
            // 🪨 U2 样板间黑灰色拉丝宽幅木地板 (Smoked Charcoal-Oak / Dark Umber-Slate Brushed Wide-Plank Wood Flooring, Photos 1, 2, 4, 5, 7)
            float plankX = floor(vPos.x / 0.22);
            float plankZ = floor((vPos.z + mod(plankX, 2.0) * 0.75) / 1.55);
            float fx = fract(vPos.x / 0.22);
            float fz = fract((vPos.z + mod(plankX, 2.0) * 0.75) / 1.55);
            float seam = step(0.026, fx) * step(0.011, fz);
            float boardRand = hash21(vec2(plankX, plankZ)) - 0.5;
            float cathGrain = sin(vPos.z * 42.0 + sin(vPos.x * 18.0 + boardRand * 5.0) * 2.2) * 0.5 + 0.5;
            float wireBrush = (hash21(floor(vec2(vPos.x * 110.0, vPos.z * 24.0))) - 0.5) * 0.026;
            vec3 smokedBase = vec3(0.23, 0.22, 0.21) + vec3(boardRand * 0.034, boardRand * 0.031, boardRand * 0.028);
            vec3 smokedGrain = smokedBase + vec3((cathGrain - 0.5) * 0.032 + wireBrush, (cathGrain - 0.5) * 0.029 + wireBrush, (cathGrain - 0.5) * 0.026 + wireBrush);
            vec3 grooveCol = vec3(0.11, 0.11, 0.10);
            baseCol = mix(grooveCol, smokedGrain, seam);
          }
        } else if (abs(matId - 4.0) < 0.1) {
          // Material 4.0: Natural Courtyard & Community Lawn / Foliar Texture
          float g1 = hash21(floor(vPos.xz * 18.0 + vPos.y * 12.0));
          float g2 = hash21(floor(vPos.xz * 5.0));
          float stripe = sin(vPos.x * 3.14159 * 0.8 + vPos.z * 0.5) * 0.022;
          baseCol = baseCol + vec3((g1 - 0.5)*0.048 + (g2 - 0.5)*0.035 + stripe);
        } else if (abs(matId - 5.0) < 0.1) {
          // Material 5.0: Courtyard Teak Decking
          float slat = fract(vPos.x * 7.5);
          float gap = step(0.08, slat);
          float grain = (hash21(vec2(floor(vPos.x * 7.5), floor(vPos.z * 2.0))) - 0.5) * 0.04;
          baseCol = mix(vec3(0.28, 0.20, 0.14), baseCol + vec3(grain), gap);
        } else if (abs(matId - 6.0) < 0.1) {
          // Material 6.0: White Calacatta Marble / Stone
          float v1 = sin(vPos.x * 3.5 + sin(vPos.z * 4.2) * 1.5);
          float vein = smoothstep(0.92, 0.99, abs(v1));
          baseCol = mix(baseCol, vec3(0.75, 0.76, 0.79), vein * 0.35);
        } else if (abs(matId - 7.0) < 0.1) {
          // Material 7.0: 3D Floor Slab UV Plan Overlay
          float u = clamp((vPos.x - uPlanBounds.x) / (uPlanBounds.y - uPlanBounds.x), 0.0, 1.0);
          float v = clamp((vPos.z - uPlanBounds.z) / (uPlanBounds.w - uPlanBounds.z), 0.0, 1.0);
          vec4 texCol = texture(uPlanTex, vec2(u, v));
          baseCol = texCol.rgb;
          alpha = uPlanAlpha;
        } else if (abs(matId - 8.0) < 0.1) {
          // Material 8.0: Bright Pure-White Granular Real-Stone Paint for Courtyard Facades (庭院内立面纯白细颗粒真石漆)
          vec2 uv = (abs(N.x) > 0.65) ? vPos.zy : vec2(vPos.x + vPos.z * 0.22, vPos.y);
          float gCoarse = hash21(floor(uv * 75.0)) - 0.5;
          float gMid    = hash21(floor(uv * 175.0 + 19.3)) - 0.5;
          float gFine   = hash21(floor(uv * 320.0 + 47.7)) - 0.5;
          float gX      = hash21(floor((uv + vec2(0.0032, 0.0)) * 220.0)) - 0.5;
          float gY      = hash21(floor((uv + vec2(0.0, 0.0032)) * 220.0)) - 0.5;
          float hCenter = gMid * 0.55 + gFine * 0.45;
          float dhdu    = (gX - hCenter) * 0.38;
          float dhdv    = (gY - hCenter) * 0.38;
          vec3 tangU    = (abs(N.x) > 0.65) ? vec3(0.0, 0.0, 1.0) : vec3(1.0, 0.0, 0.0);
          vec3 N_grain  = normalize(N + tangU * dhdu + vec3(0.0, dhdv, 0.0));
          // Crisp 3D micro-bump relief on a luminous pure-white quartz base (never dark grey in shadow!)
          float macroSun  = max(dot(N, L), 0.0);
          float grainBump = dot(N_grain - N, normalize(L + vec3(0.25, 0.75, 0.35))) * 0.15;
          float speckle   = gCoarse * 0.022 + gMid * 0.034 + gFine * 0.030;
          float seamU     = step(0.007, fract(uv.x / 1.80));
          float seamV     = step(0.009, fract(uv.y / 0.90));
          float seam      = (uStonePaintSeams > 0.5) ? mix(0.955, 1.0, seamU * seamV) : 1.0;
          // High-albedo courtyard white bounce light: shaded walls stay bright clean white (~0.89), sunlit walls reach ~0.99
          float whiteShade = 0.885 + 0.105 * macroSun + grainBump + speckle;
          vec3 whiteStoneLit = clamp(vec3(1.0, 0.996, 0.988) * whiteShade * seam, 0.80, 1.0);
          float dist = length(vPos - uEyePos);
          float fog = clamp((dist - 65.0) / 180.0, 0.0, 0.22);
          fragColor = vec4(mix(whiteStoneLit, uSkyColor, fog), 1.0);
          return;
        }

        float ndl = max(dot(N, L), 0.0);
        float hemi = 0.5 + 0.5 * N.y;
        vec3 ambColor = mix(vec3(0.54, 0.52, 0.49), vec3(0.97, 0.98, 1.0), hemi) * uAmbient;
        // Warm indoor lighting boost when walking indoors with roof closed
        vec3 warmIndoor = vec3(1.0, 0.93, 0.82) * uIndoorWarmLight * (0.65 + 0.35 * max(0.0, -N.y));
        float ao = (vPos.y < -0.1) ? 0.88 : 1.0;
        vec3 lit = baseCol * (ambColor + warmIndoor + ndl * uSunIntensity * vec3(1.0, 0.98, 0.93)) * ao;

        float dist = length(vPos - uEyePos);
        float fog = clamp((dist - 65.0) / 180.0, 0.0, 0.30);
        vec3 finalRgb = mix(lit, uSkyColor, fog);
        fragColor = vec4(finalRgb, alpha);
      }
    `;

    const vsLine = `#version 300 es
      layout(location=0) in vec3 aPos;
      layout(location=1) in vec4 aColor;
      uniform mat4 uVP;
      out vec4 vColor;
      void main() {
        vColor = aColor;
        gl_Position = uVP * vec4(aPos, 1.0);
      }
    `;
    const fsLine = `#version 300 es
      precision highp float;
      in vec4 vColor;
      out vec4 fragColor;
      void main() {
        fragColor = vColor;
      }
    `;

    this.progMain = this.createProgram(vsMain, fsMain);
    this.progLine = this.createProgram(vsLine, fsLine);
  },

  createProgram(vsSrc, fsSrc) {
    const gl = this.gl;
    const compile = (type, src) => {
      const s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
        console.error(gl.getShaderInfoLog(s));
      }
      return s;
    };
    const p = gl.createProgram();
    gl.attachShader(p, compile(gl.VERTEX_SHADER, vsSrc));
    gl.attachShader(p, compile(gl.FRAGMENT_SHADER, fsSrc));
    gl.linkProgram(p);
    return p;
  },

  getOrLoadPlanTexture(url) {
    const gl = this.gl;
    if (!gl || !gl.createTexture) return null;
    if (this.planTextures[url]) return this.planTextures[url];
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([245, 243, 238, 255]));
    if (typeof Image !== 'undefined') {
      const img = new Image();
      img.onload = () => {
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      };
      img.src = url;
    }
    this.planTextures[url] = tex;
    return tex;
  },

  update3DUVOverlay() {
    this.rebuildGeometryBuffers();
  },

  recalculateElevationsAndStairs() {
    const fls = this.data.floors;
    fls['B1'].elevation = -fls['B1'].height;
    fls['1F'].elevation = 0.0;
    fls['2F'].elevation = fls['1F'].height;
    fls['3F'].elevation = fls['1F'].height + fls['2F'].height;

    for (const r of this.data.rooms) {
      r.center[1] = fls[r.floor].elevation;
    }
    for (const f of this.data.furniture) {
      f.y = fls[f.floor].elevation;
    }

    // Align U9 & U8 SW staircases across B1..3F to the exact same vertical stairwell shaft as 2F_to_3F
    // so lower flights and railings never protrude into the 1F/2F/3F stairwell hall landing slabs!
    for (const prefix of ['u9_sw_stair', 'u8_sw_stair']) {
      const refSt = this.data.stairs.find(s => s.id === `${prefix}_2F_to_3F`);
      if (refSt) {
        for (const flSuffix of ['B1_to_1F', '1F_to_2F']) {
          const targetSt = this.data.stairs.find(s => s.id === `${prefix}_${flSuffix}`);
          if (targetSt && targetSt.steps.length === refSt.steps.length) {
            for (let i = 0; i < refSt.steps.length; i++) {
              targetSt.steps[i].poly = refSt.steps[i].poly.map(pt => [pt[0], pt[1]]);
              targetSt.steps[i].center[0] = refSt.steps[i].center[0];
              targetSt.steps[i].center[2] = refSt.steps[i].center[2];
              if (refSt.steps[i].rail_p0) targetSt.steps[i].rail_p0 = [...refSt.steps[i].rail_p0];
              if (refSt.steps[i].rail_p1) targetSt.steps[i].rail_p1 = [...refSt.steps[i].rail_p1];
            }
          }
        }
      }
    }

    const mapRange = {
      'B1_to_1F': [fls['B1'].elevation, fls['1F'].elevation],
      '1F_to_2F': [fls['1F'].elevation, fls['2F'].elevation],
      '2F_to_3F': [fls['2F'].elevation, fls['3F'].elevation]
    };
    for (const st of this.data.stairs) {
      let r = [0, 3.6];
      for (const k in mapRange) {
        if (st.id.includes(k)) r = mapRange[k];
      }
      st.y_start = r[0];
      st.y_end = r[1];
      const n = st.steps.length;
      const dy = (r[1] - r[0]) / n;
      for (let i=0; i<n; i++) {
        st.steps[i].y_bottom = Number((r[0] + i * dy).toFixed(3));
        st.steps[i].y_top = Number((r[0] + (i + 1) * dy).toFixed(3));
        st.steps[i].center[1] = st.steps[i].y_top;
      }
    }
  },

  rebuildGeometryBuffers() {
    const gl = this.gl;
    this.raycastTriangles = [];

    const chkExt = document.getElementById('chk-ext-walls')?.checked ?? true;
    const chkStruct = document.getElementById('chk-struct-walls')?.checked ?? true;
    const chkHighlight = document.getElementById('chk-highlight-struct')?.checked ?? false;
    const chkPart = document.getElementById('chk-part-walls')?.checked ?? true;
    const chkFurn = document.getElementById('chk-furniture')?.checked ?? true;
    const chkSlabs = document.getElementById('chk-slabs')?.checked ?? true;
    const chkStairs = document.getElementById('chk-stairs')?.checked ?? true;
    const chkCad = document.getElementById('chk-cad-lines')?.checked ?? false;
    const chkGrid = document.getElementById('chk-axis-grid')?.checked ?? true;
    const chkRoofCeiling = document.getElementById('chk-roof-ceiling')?.checked ?? true;
    const chkFen = (this.versionMode === 'v2') && (document.getElementById('chk-fenestration')?.checked ?? true);
    const chkWalkRoof = (this.versionMode === 'v2') && (document.getElementById('chk-walk-roof')?.checked ?? true);
    const chk3DUV = (this.versionMode === 'v2') && (document.getElementById('chk-3d-uv-overlay')?.checked ?? false);

    const posArr = [], normArr = [], colArr = [];
    const transPos = [], transNorm = [], transCol = []; // Separate alpha-blended glass & UV overlay buffer
    const linePos = [], lineCol = [];

    const pushTri = (p0, p1, p2, nx, ny, nz, rgba, recordRay=true) => {
      if (rgba[3] < 0.95 || Math.abs(rgba[3] - 7.0) < 0.1) {
        transPos.push(...p0, ...p1, ...p2);
        transNorm.push(nx, ny, nz, nx, ny, nz, nx, ny, nz);
        transCol.push(...rgba, ...rgba, ...rgba);
      } else {
        posArr.push(...p0, ...p1, ...p2);
        normArr.push(nx, ny, nz, nx, ny, nz, nx, ny, nz);
        colArr.push(...rgba, ...rgba, ...rgba);
      }
      if (recordRay) this.raycastTriangles.push([p0, p1, p2]);
    };

    const pushQuad = (p0, p1, p2, p3, nx, ny, nz, rgba, recordRay=true) => {
      pushTri(p0, p1, p2, nx, ny, nz, rgba, recordRay);
      pushTri(p0, p2, p3, nx, ny, nz, rgba, recordRay);
    };

    const pushLine = (p0, p1, rgba) => {
      linePos.push(...p0, ...p1);
      lineCol.push(...rgba, ...rgba);
    };

    const pushPrism = (poly, y0, y1, rgba, edgeRgba=null, recordRay=true, topCapRgba=null) => {
      const n = poly.length;
      if (n < 3 || y1 <= y0 + 0.005) return;
      for (let i=0; i<n; i++) {
        const [x1, z1] = poly[i];
        const [x2, z2] = poly[(i+1)%n];
        const dx = x2 - x1, dz = z2 - z1;
        const L = Math.hypot(dx, dz) || 1;
        const nx = dz / L, nz = -dx / L;
        pushQuad([x1, y0, z1], [x2, y0, z2], [x2, y1, z2], [x1, y1, z1], nx, 0, nz, rgba, recordRay);
        if (edgeRgba) {
          pushLine([x1, y1, z1], [x2, y1, z2], edgeRgba);
          pushLine([x1, y0, z1], [x1, y1, z1], edgeRgba);
        }
      }
      const tris = triangulatePolygon2D(poly);
      const topRgba = topCapRgba || [rgba[0], rgba[1], rgba[2], rgba[3] === 2.0 ? 1.0 : rgba[3]];
      const isOnFloorPlane = (Math.abs(y0) < 0.015 || Math.abs(y0 - 3.50) < 0.015 || Math.abs(y0 - 7.00) < 0.015 || Math.abs(y0 + 3.60) < 0.015 || Math.abs(y0 + 0.80) < 0.015);
      for (const [i0, i1, i2] of tris) {
        const a = poly[i0], b = poly[i1], c = poly[i2];
        pushTri([a[0], y1, a[1]], [c[0], y1, c[1]], [b[0], y1, b[1]], 0, 1, 0, topRgba, recordRay);
        if (!isOnFloorPlane) {
          pushTri([a[0], y0, a[1]], [b[0], y0, b[1]], [c[0], y0, c[1]], 0, -1, 0, topRgba, false);
        }
      }
    };

    // Dual-sided Exterior Wall Prism: Outer/Courtyard-facing faces use Light Warm Taupe Brick (Mat 2.0),
    // while Room-facing inner faces use Pure Warm White Plaster (Mat 1.0) so all interior walls are white!
    const pushExteriorWallPrism = (fl, poly, y0, y1, extBrickRgba, intWhiteRgba, topCapRgba, edgeRgba) => {
      const n = poly.length;
      if (n < 3 || y1 <= y0 + 0.005) return;
      let signedArea = 0;
      for (let i=0; i<n; i++) {
        const p1 = poly[i], p2 = poly[(i+1)%n];
        signedArea += (p1[0]*p2[1] - p2[0]*p1[1]);
      }
      const sgn = signedArea >= 0 ? 1.0 : -1.0;

      const cyStonePaintRgba = [1.0, 0.996, 0.988, 8.0];
      const getFaceMaterialCol = (mx, mz, nx, nz) => {
        const tx = mx + nx * 0.65;
        const tz = mz + nz * 0.65;
        if (fl !== 'B1') {
          const u11CyPoly = [[6.00, -3.80], [27.05, -3.80], [27.05, -18.15], [7.20, -14.05]];
          const u10CyPoly = [[31.80, -0.60], [49.90, -0.60], [49.90, -17.00], [31.80, -17.00]];
          if (pointInPoly2D(tx, tz, u11CyPoly) || pointInPoly2D(tx, tz, u10CyPoly)) {
            return cyStonePaintRgba;
          }
        }
        if (tz > -0.18) return extBrickRgba;
        const x_w = 0.13 + (tz / -18.35) * 2.57;
        if (tx < x_w + 0.18) return extBrickRgba;
        const x_e = 25.65 + (tz / -23.59) * 1.69;
        if (tx > x_e - 0.18 && tx < 28.0) return extBrickRgba;
        const z_n = -18.35 + ((tx - 2.70) / 24.64) * (-5.24);
        if (tz < z_n - 0.18) return extBrickRgba;
        return intWhiteRgba;
      };

      for (let i=0; i<n; i++) {
        const [x1, z1] = poly[i];
        const [x2, z2] = poly[(i+1)%n];
        const dx = x2 - x1, dz = z2 - z1;
        const L = Math.hypot(dx, dz) || 1;
        const nx = sgn * (dz / L), nz = sgn * (-dx / L);
        const mx = 0.5 * (x1 + x2), mz = 0.5 * (z1 + z2);
        const faceCol = getFaceMaterialCol(mx, mz, nx, nz);
        pushQuad([x1, y0, z1], [x2, y0, z2], [x2, y1, z2], [x1, y1, z1], nx, 0, nz, faceCol, true);
        if (edgeRgba) {
          pushLine([x1, y1, z1], [x2, y1, z2], edgeRgba);
          pushLine([x1, y0, z1], [x1, y1, z1], edgeRgba);
        }
      }
      const tris = triangulatePolygon2D(poly);
      for (const [i0, i1, i2] of tris) {
        const a = poly[i0], b = poly[i1], c = poly[i2];
        pushTri([a[0], y1, a[1]], [c[0], y1, c[1]], [b[0], y1, b[1]], 0, 1, 0, topCapRgba, true);
        pushTri([a[0], y0, a[1]], [b[0], y0, b[1]], [c[0], y0, c[1]], 0, -1, 0, intWhiteRgba, false);
      }
    };

    const pushBox = (cx, y0, cz, w, d, h, rotDeg, rgba, edgeRgba=[0.45,0.43,0.40,0.4], isSelected=false) => {
      const rad = rotDeg * Math.PI / 180;
      const cos = Math.cos(rad), sin = Math.sin(rad);
      const hw = w / 2, hd = d / 2;
      const local = [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]];
      const poly = local.map(([lx, lz]) => [
        cx + lx * cos - lz * sin,
        cz + lx * sin + lz * cos
      ]);
      const finalCol = isSelected ? [0.22, 0.74, 0.98, 1.0] : rgba;
      const finalEdge = isSelected ? [1.0, 0.85, 0.1, 1.0] : edgeRgba;
      pushPrism(poly, y0, y0 + h, finalCol, finalEdge, true);
    };

    const pushCylinder = (cx, y0, y1, cz, rBottom, rTop, segs, rgba, edgeRgba=null) => {
      const ptsB = [], ptsT = [];
      for (let i=0; i<segs; i++) {
        const a = (i / segs) * Math.PI * 2;
        const c = Math.cos(a), s = Math.sin(a);
        ptsB.push([cx + rBottom * c, y0, cz + rBottom * s]);
        ptsT.push([cx + rTop * c,    y1, cz + rTop * s]);
      }
      for (let i=0; i<segs; i++) {
        const ni = (i + 1) % segs;
        const a = ((i + 0.5) / segs) * Math.PI * 2;
        pushQuad(ptsB[i], ptsB[ni], ptsT[ni], ptsT[i], Math.cos(a), 0.25, Math.sin(a), rgba, true);
        pushTri([cx, y1, cz], ptsT[ni], ptsT[i], 0, 1, 0, rgba, true);
        if (edgeRgba) pushLine(ptsT[i], ptsT[ni], edgeRgba);
      }
    };

    // Helper: Build Parametric Architectural Window / Glazing / Door Opening (Codex Fusion Feature!)
    // Includes: Sill wall (0..sillH), Lintel wall (topH..wallH), Dark Bronze/Champagne Frame, Mullions every 1.45m, and Translucent Glass!
    const pushFenestrationSegment = (fl, x1, z1, x2, z2, y0, wallH, kind, extBrickRgba, intWhiteRgba) => {
      const dx = x2 - x1, dz = z2 - z1;
      const L = Math.hypot(dx, dz);
      if (L < 0.25 || wallH < 0.4) return;
      const thick = (kind === 'interior_door') ? 0.16 : 0.22;
      const nx = (-dz / L) * (thick * 0.5), nz = (dx / L) * (thick * 0.5);
      const poly = [[x1 + nx, z1 + nz], [x2 + nx, z2 + nz], [x2 - nx, z2 - nz], [x1 - nx, z1 - nz]];
      const frameCol = [0.27, 0.29, 0.26, 1.0]; // Refined architectural dark bronze-olive frame
      const glassCol = [0.68, 0.84, 0.88, this.cameraMode === 'walk' ? 0.22 : 0.32];
      const topCap = [0.64, 0.59, 0.53, 1.0];

      if (kind === 'interior_door' || kind === 'courtyard_door') {
        const doorH = Math.min(2.25, wallH);
        // Lintel wall above door (2.25m .. wallH)
        if (wallH > doorH + 0.05) {
          if (kind === 'courtyard_door') {
            pushExteriorWallPrism(fl, poly, y0 + doorH, y0 + wallH, extBrickRgba, intWhiteRgba, topCap, null);
          } else {
            pushPrism(poly, y0 + doorH, y0 + wallH, intWhiteRgba, [0.78,0.76,0.73,0.4], false);
          }
        }
        // Door frame jambs & header
        const jw = 0.05 / L;
        const pJ1 = [[x1+nx, z1+nz], [x1+dx*jw+nx, z1+dz*jw+nz], [x1+dx*jw-nx, z1+dz*jw-nz], [x1-nx, z1-nz]];
        const pJ2 = [[x2-dx*jw+nx, z2-dz*jw+nz], [x2+nx, z2+nz], [x2-nx, z2-nz], [x2-dx*jw-nx, z2-dz*jw-nz]];
        pushPrism(pJ1, y0, y0 + doorH, frameCol, null, false);
        pushPrism(pJ2, y0, y0 + doorH, frameCol, null, false);
        pushPrism(poly, y0 + doorH - 0.05, y0 + doorH, frameCol, null, false);
      } else {
        // Window or Floor-to-Ceiling Courtyard Glazing
        const sillH = (kind === 'courtyard_glazing') ? 0.08 : Math.min(0.55, wallH * 0.35);
        const winTop = Math.min(2.75, wallH);
        // 1. Sill low wall (0 .. sillH)
        if (sillH > 0.02) {
          pushExteriorWallPrism(fl, poly, y0, y0 + sillH, extBrickRgba, intWhiteRgba, frameCol, null);
        }
        // 2. Upper Lintel wall (winTop .. wallH)
        if (wallH > winTop + 0.04) {
          pushExteriorWallPrism(fl, poly, y0 + winTop, y0 + wallH, extBrickRgba, intWhiteRgba, topCap, [0.48,0.44,0.40,0.45]);
        }
        // 3. Window Frame, Mullions & Translucent Glass Pane (sillH .. winTop)
        if (winTop > sillH + 0.12) {
          pushPrism(poly, y0 + sillH, y0 + sillH + 0.04, frameCol, null, false);
          pushPrism(poly, y0 + winTop - 0.04, y0 + winTop, frameCol, null, false);
          const divs = Math.max(1, Math.ceil(L / 1.45));
          for (let i=0; i<=divs; i++) {
            const t = i / divs;
            const mx = x1 + dx * t, mz = z1 + dz * t;
            pushBox(mx, y0 + sillH, mz, 0.045, 0.06, winTop - sillH, 0, frameCol, null, false);
          }
          // Thin translucent glass quad
          const fnx = -dz / L, fnz = dx / L;
          pushQuad([x1, y0 + sillH + 0.04, z1], [x2, y0 + sillH + 0.04, z2], [x2, y0 + winTop - 0.04, z2], [x1, y0 + winTop - 0.04, z1], fnx, 0, fnz, glassCol, false);
        }
      }
    };

    // Helper: Build Grand Piano in 1F Living Room (三角钢琴：曲弧乌木亮光琴箱 + 琴腿 + 88键黑白琴键 + 谱架，严格收敛于 w×d 边界内)
    const pushGrandPiano = (cx, y0, cz, w, d, h, rotDeg, isSel) => {
      const ebonyCol = isSel ? [0.22, 0.74, 0.98, 1.0] : [0.16, 0.17, 0.18, 1.0];
      const goldCol  = [0.78, 0.66, 0.42, 1.0];
      const keyCol   = [0.98, 0.97, 0.94, 1.0];
      const rad = rotDeg * Math.PI / 180;
      const cos = Math.cos(rad), sin = Math.sin(rad);
      const toW = (lx, lz) => [cx + lx * cos - lz * sin, cz + lx * sin + lz * cos];

      // Curved grand piano rim polygon (tucked slightly back so keyboard + bench stay 100% inside [-0.48*d, +0.48*d])
      const rimLocal = [
        [-w*0.46, d*0.24], [w*0.46, d*0.24], [w*0.44, -d*0.14],
        [w*0.20, -d*0.44], [-w*0.15, -d*0.48], [-w*0.44, -d*0.34]
      ];
      const rimPoly = rimLocal.map(([lx, lz]) => toW(lx, lz));
      pushPrism(rimPoly, y0 + 0.68, y0 + 0.96, ebonyCol, [0.35,0.35,0.38,0.7], true);
      // Inner gold soundboard
      const innerPoly = rimLocal.map(([lx, lz]) => toW(lx*0.86, lz*0.84));
      pushPrism(innerPoly, y0 + 0.96, y0 + 0.98, goldCol, null, false);
      // Keyboard bed & white/black keys at front (+d*0.26)
      const [kx, kz] = toW(0, d*0.26);
      pushBox(kx, y0 + 0.66, kz, w*0.82, 0.20, 0.08, rotDeg, ebonyCol, null, isSel);
      pushBox(kx, y0 + 0.74, kz + 0.02, w*0.76, 0.14, 0.03, rotDeg, keyCol, [0.2,0.2,0.2,0.8], isSel);
      // 3 Piano Legs + Pianist Bench (strictly within +d*0.44)
      for (const [lx, lz] of [[-w*0.36, d*0.20], [w*0.36, d*0.20], [-w*0.12, -d*0.38]]) {
        const [px, pz] = toW(lx, lz);
        pushCylinder(px, y0, y0 + 0.68, pz, 0.04, 0.06, 8, ebonyCol, null);
      }
      const [bx, bz] = toW(0, d*0.42);
      pushBox(bx, y0, bz, 0.72, 0.26, 0.46, rotDeg, [0.95, 0.93, 0.89, 1.0], null, isSel);
    };

    const pushTree = (tx, y0, tz, scale=1.0, style='camphor') => {
      pushCylinder(tx, y0, y0 + 2.3 * scale, tz, 0.16 * scale, 0.10 * scale, 8, [0.42, 0.33, 0.25, 1.0], null);
      if (style === 'maple') {
        pushCylinder(tx, y0 + 1.3 * scale, y0 + 2.5 * scale, tz, 1.25 * scale, 0.75 * scale, 10, [0.34, 0.50, 0.28, 4.0], null);
        pushCylinder(tx + 0.22*scale, y0 + 2.0 * scale, y0 + 3.1 * scale, tz - 0.18*scale, 0.95 * scale, 0.35 * scale, 10, [0.39, 0.56, 0.31, 4.0], null);
      } else {
        pushCylinder(tx, y0 + 1.7 * scale, y0 + 3.3 * scale, tz, 1.42 * scale, 0.92 * scale, 10, [0.25, 0.47, 0.29, 4.0], null);
        pushCylinder(tx + 0.26*scale, y0 + 2.6 * scale, y0 + 4.2 * scale, tz - 0.16*scale, 1.12 * scale, 0.50 * scale, 10, [0.29, 0.53, 0.33, 4.0], null);
        pushCylinder(tx - 0.16*scale, y0 + 3.5 * scale, y0 + 4.9 * scale, tz + 0.16*scale, 0.76 * scale, 0.10 * scale, 10, [0.34, 0.58, 0.37, 4.0], null);
      }
    };

    const pushShrubCluster = (sx, y0, sz, scale=1.0) => {
      pushCylinder(sx, y0, y0 + 0.62 * scale, sz, 0.68 * scale, 0.42 * scale, 10, [0.26, 0.48, 0.28, 4.0], null);
      pushCylinder(sx + 0.52 * scale, y0, y0 + 0.48 * scale, sz + 0.22 * scale, 0.50 * scale, 0.30 * scale, 9, [0.32, 0.55, 0.33, 4.0], null);
      pushCylinder(sx - 0.38 * scale, y0, y0 + 0.38 * scale, sz + 0.35 * scale, 0.42 * scale, 0.24 * scale, 8, [0.22, 0.43, 0.25, 4.0], null);
    };

    const pushClippedHedge = (x1, z1, x2, z2, y0, width, hedgeH, withBrickPlinth=true) => {
      const dx = x2 - x1, dz = z2 - z1;
      const L = Math.hypot(dx, dz) || 1;
      const nx = (-dz / L) * (width * 0.5), nz = (dx / L) * (width * 0.5);
      const poly = [[x1 + nx, z1 + nz], [x2 + nx, z2 + nz], [x2 - nx, z2 - nz], [x1 - nx, z1 - nz]];
      let yStart = y0;
      if (withBrickPlinth) {
        pushPrism(poly, y0, y0 + 0.38, [0.68, 0.63, 0.57, 2.0], [0.48, 0.44, 0.40, 0.5], false);
        yStart = y0 + 0.38;
      }
      pushPrism(poly, yStart, y0 + hedgeH, [0.23, 0.44, 0.26, 4.0], [0.18, 0.35, 0.20, 0.4], false, [0.28, 0.51, 0.31, 4.0]);
    };

    const pushRefinedParasolSet = (cx, y0, cz, scale=1.0, rotDeg=0, isSelected=false) => {
      pushCylinder(cx, y0, y0 + 0.09, cz, 0.42, 0.38, 12, [0.35, 0.36, 0.38, 1.0], null);
      pushCylinder(cx, y0 + 0.09, y0 + 2.58, cz, 0.045, 0.04, 8, [0.25, 0.24, 0.22, 1.0], null);
      const segs = 12;
      const rMid = 1.05 * scale, rOut = 1.68 * scale;
      const yApex = y0 + 2.72, yMid = y0 + 2.50, yRim = y0 + 2.22;
      const canopyCol = isSelected ? [0.22, 0.74, 0.98, 1.0] : [0.97, 0.95, 0.91, 1.0];
      const ribCol = [0.38, 0.34, 0.28, 0.85];
      for (let i=0; i<segs; i++) {
        const a0 = (i / segs) * Math.PI * 2 + (rotDeg * Math.PI / 180);
        const a1 = ((i + 1) / segs) * Math.PI * 2 + (rotDeg * Math.PI / 180);
        const m0 = [cx + rMid * Math.cos(a0), yMid, cz + rMid * Math.sin(a0)];
        const m1 = [cx + rMid * Math.cos(a1), yMid, cz + rMid * Math.sin(a1)];
        const o0 = [cx + rOut * Math.cos(a0), yRim, cz + rOut * Math.sin(a0)];
        const o1 = [cx + rOut * Math.cos(a1), yRim, cz + rOut * Math.sin(a1)];
        const nx = Math.cos((a0+a1)*0.5)*0.35, nz = Math.sin((a0+a1)*0.5)*0.35;
        pushTri([cx, yApex, cz], m1, m0, nx, 0.92, nz, canopyCol, true);
        pushQuad(m0, m1, o1, o0, nx, 0.85, nz, canopyCol, true);
        pushLine(o0, o1, [0.82, 0.78, 0.70, 0.9]);
        pushLine([cx, y0 + 2.05, cz], m0, ribCol);
        pushLine(m0, o0, ribCol);
      }
      pushCylinder(cx, yApex, yApex + 0.08, cz, 0.08, 0.02, 8, [0.35, 0.32, 0.28, 1.0], null);
      pushCylinder(cx + 0.45, y0, y0 + 0.46, cz + 0.35, 0.52, 0.55, 16, [0.94, 0.92, 0.88, 6.0], [0.7,0.68,0.64,0.6]);
      const chairOffsets = [[-0.85, -0.55, 35], [1.15, -0.55, -35], [-0.75, 0.95, 145], [1.15, 0.95, -145]];
      for (const [ox, oz, cRot] of chairOffsets) {
        const chX = cx + ox, chZ = cz + oz;
        pushBox(chX, y0, chZ, 0.76, 0.78, 0.26, cRot, [0.55, 0.42, 0.29, 1.0], null, isSelected);
        pushBox(chX, y0 + 0.26, chZ, 0.72, 0.72, 0.14, cRot, [0.97, 0.96, 0.93, 1.0], null, isSelected);
        pushBox(chX, y0 + 0.40, chZ - 0.26, 0.72, 0.16, 0.36, cRot, [0.95, 0.93, 0.89, 1.0], null, isSelected);
      }
    };

    const extBrickColor = [0.73, 0.74, 0.72, 2.0]; // Pale silver-grey / ash handmade brick per Photo 8
    const intWhiteColor = [0.96, 0.96, 0.95, 1.0];

    // ========================================================================
    // 1. Authentic 11-Building Estate Site Plan from《户型册 U11.pdf》Page 1 (huxing_site.svg)
    // + South Community Public Greenbelt + 野奴泾河道 (River) + Opposite 野奴泾小区 First-Row 5F Buildings (Privacy Sightline Source)
    // ========================================================================
    this.estateUnits = [
      { id: 'Unit 10', name: 'Unit 10 (二联打通·50cm双墙+中空层)', center: [39.5, 10.8, -10.0] },
      { id: 'PARTY_WALL', name: '🔗 50cm户间墙 (20+10+20cm·填充墙4120/4000/1800)', center: [26.8, 4.2, -9.5] },
      { id: 'Unit 9',  name: 'Unit 9 (四层精模·20.93×26.90m)',  center: [60.2, 10.6, -6.7] },
      { id: 'Unit 8',  name: 'Unit 8 (四层精模·12°斜东墙)',    center: [82.8, 10.6, -4.3] },
      { id: 'Unit 7',  name: 'Unit 7',  center: [104.2, 10.6, -4.8] },
      { id: 'Unit 6',  name: 'Unit 6',  center: [121.5, 10.6, -25.8] },
      { id: 'Unit 12', name: 'Unit 12 (西侧邻栋)', center: [-23.3, 10.6, -17.6] },
      { id: 'Gate',    name: 'Gate / 13号物业用房 (高8.50m·低半层)', center: [-0.5, 8.8, -36.2] },
      { id: 'Unit 1',  name: 'Unit 1',  center: [39.5, 10.6, -44.1] },
      { id: 'Unit 2',  name: 'Unit 2 (实拍样板房)',  center: [61.5, 10.6, -46.8] },
      { id: 'Unit 3',  name: 'Unit 3',  center: [79.2, 10.6, -46.6] },
      { id: 'Unit 5',  name: 'Unit 5',  center: [107.6, 10.6, -48.0] },
      { id: 'RIVER',   name: '🌊 野奴泾河道 (距U11南墙8.4~10.4m · 河宽9.5m)', center: [16.0, 0.4, 14.5] }
    ];

    const chkPartyKnock = document.getElementById('chk-party-knock')?.checked ?? true;

    // Exact River & Footprint Polygons (Calibrated strictly from the user's Gaode satellite photo of 宁邸 & 田园别墅):
    // - U11 South wall (Z=0.02) to Estate SW Blue Boundary (River North Bank): 8.4m at pSW (X=0.14) to 10.4m at pSE (X=25.65)
    // - U10 South wall (stepped out to Z=3.55) to Estate SW Blue Boundary: 6.9m to 8.8m
    // - River Channel (野奴泾河道): width = 9.5m (River South Bank at Z = 17.9m ~ 21.9m)
    // - Opposite Riverbank: 100% 剑河路888号《田园别墅》(30幢, 31幢, 32幢, 33幢, 34幢, 35幢, 36幢 in Row 1, sitting North-South at rotDeg=-42°, NE corners at Z=18.6m~27.6m!)
    const riverZNorth = (x) => 8.4 + 0.105 * x;
    const riverWidth  = 9.5;
    // Full 4-Villa (U11 + U10 + U9 + U8) Footprint Cutout so exterior grass grid never overlaps any of the 4 villas!
    const combinedU11U10Loop = [
      [0.13, 0.04], [25.95, 0.04], [25.95, 3.55], [49.65, 3.55],
      [49.65, 6.80], [70.80, 6.80], [70.80, 9.75], [95.90, 9.75],
      [89.95, -18.40], [70.80, -18.40], [70.80, -22.45], [49.65, -22.45],
      [49.65, -24.20], [27.52, -24.20], [26.86, -23.59], [2.70, -18.34]
    ];

    this.tianyuanVillaLabels = [];
    const privacyHotspotWindows = [];
    const tianyuanFootprints2D = [];
    const dynamicExteriorWindows = [];
    const exteriorWallSegments2D = [];

    if (chkSlabs && this.floorFilter === 'ALL') {
      const siteGrassCol = [0.32, 0.52, 0.34, 4.0];
      const pubGreenCol  = [0.30, 0.54, 0.33, 4.0];
      const roadCol      = [0.46, 0.45, 0.43, 1.0];
      const curbCol      = [0.74, 0.71, 0.67, 1.0];
      const neighborRoofCol = extBrickColor;

      // 1A. Subdivided Watertight Ground Mesh around Combined U11+U10 Footprint (stopping North of the river channel!)
      const bLoop = [
        [-12.0, 6.8], [25.5, 9.8], [25.5, 10.5], [49.6, 12.8],
        [49.6, 13.5], [70.8, 15.2], [70.8, 15.8], [99.0, 18.2],
        [93.0, -25.0], [70.8, -26.5], [70.8, -28.0], [49.6, -28.5],
        [49.6, -30.0], [28.0, -30.0], [27.0, -29.5], [-12.0, -28.0]
      ];
      for (let edgeIdx = 0; edgeIdx < combinedU11U10Loop.length; edgeIdx++) {
        const nextIdx = (edgeIdx + 1) % combinedU11U10Loop.length;
        const uA = combinedU11U10Loop[edgeIdx], uB = combinedU11U10Loop[nextIdx];
        const bA = bLoop[edgeIdx], bB = bLoop[nextIdx];
        const segs = 6;
        for (let s = 0; s < segs; s++) {
          const t0 = s / segs, t1 = (s + 1) / segs;
          const p0 = [uA[0] + (uB[0]-uA[0])*t0, uA[1] + (uB[1]-uA[1])*t0];
          const p1 = [uA[0] + (uB[0]-uA[0])*t1, uA[1] + (uB[1]-uA[1])*t1];
          const q1 = [bA[0] + (bB[0]-bA[0])*t1, bA[1] + (bB[1]-bA[1])*t1];
          const q0 = [bA[0] + (bB[0]-bA[0])*t0, bA[1] + (bB[1]-bA[1])*t0];
          pushPrism([p0, p1, q1, q0], -0.25, -0.05, pubGreenCol, null, false);
        }
      }

      // Subdivided 6.5m x 6.5m Ground Grid across the site & opposite bank, EXCLUDING the river channel so the river water is 100% visible!
      const gStep = 6.5;
      for (let gx = -70.0; gx < 140.0; gx += gStep) {
        for (let gz = -70.0; gz < 98.0; gz += gStep) {
          const cx = gx + gStep * 0.5, cz = gz + gStep * 0.5;
          if (pointInPoly2D(cx, cz, combinedU11U10Loop)) continue;
          const zn = riverZNorth(cx);
          const zs = zn + riverWidth;
          if (gz + gStep > zn - 0.3 && gz < zs + 0.3) {
            if (gz < zn - 0.3) {
              pushPrism([[gx, gz], [gx + gStep, gz], [gx + gStep, riverZNorth(gx + gStep) - 0.3], [gx, zn - 0.3]], -0.28, -0.06, siteGrassCol, null, false);
            }
            if (gz + gStep > zs + 0.3) {
              pushPrism([[gx, zn + riverWidth + 0.3], [gx + gStep, riverZNorth(gx + gStep) + riverWidth + 0.3], [gx + gStep, gz + gStep], [gx, gz + gStep]], -0.28, -0.06, siteGrassCol, null, false);
            }
            continue;
          }
          pushPrism([[gx, gz], [gx + gStep, gz], [gx + gStep, gz + gStep], [gx, gz + gStep]], -0.28, -0.06, siteGrassCol, null, false);
        }
      }

      // 1B. Estate Internal Driveway, Gate Forecourt, West Garden Footpath & South Public Greenbelt Stroll Path (spanning U11..U8!)
      for (let i=0; i<8; i++) {
        const t0 = i / 8, t1 = (i + 1) / 8;
        const xA = -12 + 114 * t0, xB = -12 + 114 * t1;
        const zN0 = -26.8 - 4.2 * t0, zN1 = -26.8 - 4.2 * t1;
        const zS0 = -21.2 - 3.6 * t0, zS1 = -21.2 - 3.6 * t1;
        pushPrism([[xA, zS0], [xB, zS1], [xB, zN1], [xA, zN0]], -0.05, -0.01, roadCol, curbCol, false);
      }
      pushPrism([[16.5, -52.0], [26.8, -52.0], [26.8, -25.0], [16.5, -25.0]], -0.045, -0.01, roadCol, curbCol, false);
      pushPrism([[6.5, -24.2], [89.5, -25.2], [89.5, -18.4], [6.8, -18.6]], -0.04, -0.005, [0.78, 0.75, 0.70, 1.0], curbCol, false);
      pushPrism([[-3.6, 0.0], [-1.4, 0.0], [1.1, -18.2], [-1.1, -18.2]], -0.04, -0.01, [0.80, 0.77, 0.72, 1.0], curbCol, false);
      // South Community Public Greenbelt Stone Stroll Path (between U11/U10/U9/U8 South walls and river boundary)
      pushPrism([[-12.0, 4.6], [102.0, 16.5], [102.0, 17.7], [-12.0, 5.8]], -0.04, -0.005, [0.82, 0.79, 0.74, 1.0], curbCol, false);

      // Kele East Road (可乐东路) outside North Gate
      for (let i=0; i<8; i++) {
        const t0 = i / 8, t1 = (i + 1) / 8;
        const xA = -60 + 190 * t0, xB = -60 + 190 * t1;
        pushPrism([[xA, -38 - 29*t0], [xB, -38 - 29*t1], [xB, -48 - 29*t1], [xA, -48 - 29*t0]], -0.05, -0.01, [0.36, 0.37, 0.39, 1.0], curbCol, false);
      }

      // 1C. Unobstructed South River (野奴泾河道, Width = 9.5m, North Bank at Z = 8.4 + 0.08*X)
      const waterCol  = [0.14, 0.43, 0.56, 1.0];
      const bankStone = [0.68, 0.66, 0.62, 1.0];
      for (let i=0; i<16; i++) {
        const xA = -68.0 + i * 13.5;
        const xB = xA + 13.5;
        const znA = riverZNorth(xA), znB = riverZNorth(xB);
        const zsA = znA + riverWidth, zsB = znB + riverWidth;
        // North stone river embankment & parapet wall (Ningguo Mansion SW blue-line boundary)
        pushPrism([[xA, znA - 0.55], [xB, znB - 0.55], [xB, znB], [xA, znA]], -0.65, 0.28, bankStone, [0.45,0.43,0.40,0.7], false);
        // 9.5m wide blue-teal river water channel
        pushPrism([[xA, znA], [xB, znB], [xB, zsB], [xA, zsA]], -0.65, -0.10, waterCol, [0.32, 0.62, 0.75, 0.65], true);
        for (const frac of [0.25, 0.50, 0.75]) {
          const wzA = znA + riverWidth * frac, wzB = znB + riverWidth * frac;
          pushLine([xA + 1.0, -0.08, wzA], [xB - 1.0, -0.08, wzB], [0.48, 0.76, 0.88, 0.65]);
        }
        // South stone river embankment (《田园别墅》沿河驳岸)
        pushPrism([[xA, zsA], [xB, zsB], [xB, zsB + 0.55], [xA, zsA + 0.55]], -0.65, 0.28, bankStone, [0.45,0.43,0.40,0.7], false);
      }

      // 1D. Opposite Riverbank Compound: 100% 剑河路888号《田园别墅》(Countryside Villa) Calibrated 1:1 from Satellite Map!
      // - Every villa sits True North-South (坐北朝南, rotDeg = -42° in 3D scene), forming a sawtooth echelon (锯齿状/雁列式) along the river!
      // - Because each detached villa is 4-sided (四面开窗独栋别墅) and rotated -42° relative to the river:
      //   * Its Northeast Corner (东北角) points straight at the river (only 19.3m~22.8m from U11/U10's South wall!)
      //   * BOTH its North Facade (北立面, facing N-NE) AND its East Facade (东立面, facing E-NE) have 2F/3F Bedroom & Study Windows facing U11 & U10!
      const privacyActive = this.showPrivacyRays;

      // Helper: True 3D Cross-Hipped / 4-Slope Terracotta Villa Roof (十字坡/四坡红棕瓦屋顶 + 挑檐)
      const pushVillaCrossHipRoof = (toW, hw, hd, yBase, roofH, roofCol, eaveCol, hasCrossGable=true) => {
        const ov = 0.40;
        const ePoly = [toW(-hw - ov, -hd - ov), toW(hw + ov, -hd - ov), toW(hw + ov, hd + ov), toW(-hw - ov, hd + ov)];
        pushPrism(ePoly, yBase, yBase + 0.20, eaveCol, [0.45, 0.42, 0.38, 0.6], false);
        const y0 = yBase + 0.20, y1 = yBase + roofH;
        const rHalfW = Math.max(0.8, hw - hd * 0.60);
        const pNW = toW(-hw - ov*0.4, -hd - ov*0.4), pNE = toW(hw + ov*0.4, -hd - ov*0.4);
        const pSE = toW(hw + ov*0.4,  hd + ov*0.4), pSW = toW(-hw - ov*0.4,  hd + ov*0.4);
        const rW  = toW(-rHalfW, 0.0),               rE  = toW(rHalfW, 0.0);
        pushQuad([pNW[0], y0, pNW[1]], [pNE[0], y0, pNE[1]], [rE[0], y1, rE[1]], [rW[0], y1, rW[1]], 0, 0.72, -0.68, roofCol, true);
        pushQuad([pSE[0], y0, pSE[1]], [pSW[0], y0, pSW[1]], [rW[0], y1, rW[1]], [rE[0], y1, rE[1]], 0, 0.72,  0.68, roofCol, true);
        pushTri([pSW[0], y0, pSW[1]], [pNW[0], y0, pNW[1]], [rW[0], y1, rW[1]], -0.68, 0.72, 0, roofCol, true);
        pushTri([pNE[0], y0, pNE[1]], [pSE[0], y0, pSE[1]], [rE[0], y1, rE[1]],  0.68, 0.72, 0, roofCol, true);
        pushLine([rW[0], y1 + 0.03, rW[1]], [rE[0], y1 + 0.03, rE[1]], [0.35, 0.20, 0.16, 0.9]);
        if (hasCrossGable) {
          // Cross-gable ridge projecting towards North & East (matching satellite roof ridges)
          const gN = toW(hw * 0.25, -hd - 0.55), gC = toW(hw * 0.25, 0.0);
          pushLine([gN[0], y1 - 0.15, gN[1]], [gC[0], y1 + 0.02, gC[1]], [0.35, 0.20, 0.16, 0.9]);
        }
      };

      // Helper: Render a window on North (-lz), South (+lz), East (+lx), or West (-lx) facade of a Tianyuan Villa
      const pushVillaWindow = (toW, face, u0, u1, vFace, wy0, wy1, sensitivity) => {
        let glassCol, frameCol;
        if (privacyActive) {
          if (sensitivity === 'high') {
            glassCol = [0.96, 0.24, 0.20, 1.0]; // 🔴 High-sensitivity 2F/3F North & East Bedroom/Study Windows facing U11/U10
            frameCol = [1.00, 0.88, 0.25, 1.0];
          } else if (sensitivity === 'med') {
            glassCol = [0.95, 0.64, 0.18, 1.0]; // 🟠 Medium-sensitivity 1F Window / High-sill Bath Window
            frameCol = [0.75, 0.48, 0.12, 0.9];
          } else if (sensitivity === 'low') {
            glassCol = [0.22, 0.68, 0.88, 1.0]; // 🔵 Low-sensitivity Stairwell Window
            frameCol = [0.15, 0.45, 0.65, 0.9];
          } else {
            glassCol = [0.26, 0.38, 0.46, 1.0];
            frameCol = [0.38, 0.39, 0.40, 0.8];
          }
        } else {
          glassCol = (sensitivity === 'high') ? [0.28, 0.44, 0.54, 1.0] : [0.34, 0.46, 0.52, 1.0];
          frameCol = [0.32, 0.34, 0.36, 0.9];
        }

        let wPoly, sPoly, mPt;
        if (face === 'N' || face === 'S') {
          const sgn = (face === 'N') ? -1 : 1;
          const zOut = vFace + sgn * 0.06, zIn = vFace - sgn * 0.04;
          wPoly = [toW(u0, zOut), toW(u1, zOut), toW(u1, zIn), toW(u0, zIn)];
          sPoly = [toW(u0 - 0.06, vFace + sgn * 0.12), toW(u1 + 0.06, vFace + sgn * 0.12), toW(u1 + 0.06, vFace), toW(u0 - 0.06, vFace)];
          mPt   = toW(0.5 * (u0 + u1), vFace + sgn * 0.07);
        } else {
          const sgn = (face === 'E') ? 1 : -1;
          const xOut = vFace + sgn * 0.06, xIn = vFace - sgn * 0.04;
          wPoly = [toW(xIn, u0), toW(xOut, u0), toW(xOut, u1), toW(xIn, u1)];
          sPoly = [toW(vFace, u0 - 0.06), toW(vFace + sgn * 0.12, u0 - 0.06), toW(vFace + sgn * 0.12, u1 + 0.06), toW(vFace, u1 + 0.06)];
          mPt   = toW(vFace + sgn * 0.07, 0.5 * (u0 + u1));
        }
        pushPrism(wPoly, wy0, wy1, glassCol, frameCol, true);
        pushPrism(sPoly, wy0 - 0.06, wy0, [0.78, 0.75, 0.70, 1.0], null, false);
        if (Math.abs(u1 - u0) >= 1.15) {
          pushLine([mPt[0], wy0, mPt[1]], [mPt[0], wy1, mPt[1]], frameCol);
        }
      };

      // Builder: Authentic 2.5~3F Detached Villa of 剑河路888号《田园别墅》
      // Sitting North-South (rotDeg = -42°), with both North (-lz) & East (+lx) facades facing across the river towards U11 & U10!
      const pushTianyuanDetachedVilla = (code, cx, cz, w=13.0, d=11.0, rotDeg=-42, isFrontRow=true, roleDesc='') => {
        const storeyH = 2.95;
        const h2F     = 2 * storeyH;       // 5.90m (1F+2F main eaves)
        const h3F     = 2.85 * storeyH;    // 8.40m (3F top suite/gable eaves)
        const rad = rotDeg * Math.PI / 180;
        const cos = Math.cos(rad), sin = Math.sin(rad);
        const toW = (lx, lz) => [cx + lx * cos - lz * sin, cz + lx * sin + lz * cos];
        const hw = w * 0.5, hd = d * 0.5;

        const stoneCol  = [0.77, 0.72, 0.64, 1.0]; // 1F Warm sandstone rusticated base
        const stuccoCol = [0.92, 0.89, 0.82, 1.0]; // 2F/3F Warm cream-ochre villa stucco
        const roofCol   = [0.58, 0.33, 0.26, 1.0]; // Terracotta red-brown pitched roof tiles (matching satellite photo!)
        const eaveCol   = [0.84, 0.81, 0.75, 1.0];

        // 1. Main 1F & 2F Villa Footprint
        const mainPoly = [toW(-hw, -hd), toW(hw, -hd), toW(hw, hd), toW(-hw, hd)];
        tianyuanFootprints2D.push({ code, poly: mainPoly });
        pushPrism(mainPoly, 0.0, 2.95, stoneCol, [0.52, 0.49, 0.44, 0.6], true);
        pushPrism(mainPoly, 2.95, h2F, stuccoCol, [0.58, 0.55, 0.50, 0.55], true, eaveCol);

        // 2. North-East Protruding Bay (-hw*0.10 .. hw*0.72, projecting 0.75m North) & East Bay (projecting 0.60m East)
        const nBayPoly = [toW(-hw*0.10, -hd - 0.75), toW(hw*0.72, -hd - 0.75), toW(hw*0.72, -hd), toW(-hw*0.10, -hd)];
        pushPrism(nBayPoly, 0.0, h3F, stuccoCol, [0.55, 0.52, 0.48, 0.6], true, eaveCol);
        const eBayPoly = [toW(hw, -hd*0.55), toW(hw + 0.60, -hd*0.55), toW(hw + 0.60, hd*0.35), toW(hw, hd*0.35)];
        pushPrism(eBayPoly, 0.0, h3F, stuccoCol, [0.55, 0.52, 0.48, 0.6], true, eaveCol);

        // 3. 3F Upper Villa Volume + North-West Setback Terrace Balustrade
        const topPoly = [toW(-hw*0.52, -hd*0.78), toW(hw*0.88, -hd*0.78), toW(hw*0.88, hd*0.80), toW(-hw*0.52, hd*0.80)];
        pushPrism(topPoly, h2F, h3F, stuccoCol, [0.58, 0.55, 0.50, 0.55], true, eaveCol);
        // 3F North-West corner terrace balustrade
        const terPoly = [toW(-hw, -hd), toW(-hw*0.52, -hd), toW(-hw*0.52, -hd*0.15), toW(-hw, -hd*0.15)];
        pushPrism(terPoly, h2F, h2F + 1.05, eaveCol, [0.50, 0.48, 0.44, 0.6], false);

        // 4. Cross-Hipped Terracotta Roof (total ridge height ≈ 10.35m)
        pushVillaCrossHipRoof(toW, hw*0.82, hd*0.82, h3F, 1.95, roofCol, eaveCol, true);

        // 5. Authentic Detached Villa Windows on BOTH North Facade (-lz) AND East Facade (+lx) facing U11~U8!
        for (let flIdx = 0; flIdx < 3; flIdx++) {
          const fy = flIdx * storeyH;
          const isUpper = (flIdx >= 1); // 2F & 3F windows have direct sightlines over riverbank hedges

          // --- A. NORTH FACADE (-lz, facing North-Northeast towards U11~U8) ---
          // A1. North-West Stairwell / Bath Window (🔵/🟠)
          if (flIdx < 2) {
            pushVillaWindow(toW, 'N', -hw*0.78, -hw*0.32, -hd, fy + 1.30, fy + 2.25, flIdx === 0 ? 'low' : 'med');
          }
          // A2. North-East Bay Study / Secondary Bedroom Large Casement Window (🔴 核心北向常驻敏感窗: 宽 1.65m × 高 1.45m)
          const nWinSens = (isFrontRow && isUpper) ? 'high' : 'med';
          pushVillaWindow(toW, 'N', hw*0.04, hw*0.56, -hd - 0.75, fy + 0.85, fy + 2.30, nWinSens);
          if (isUpper) {
            const pNWc = toW(hw*0.30, -hd - 0.82);
            privacyHotspotWindows.push({
              x: pNWc[0], y: fy + 1.55, z: pNWc[1],
              nx: sin, nz: -cos,
              fl: flIdx + 1, code, face: '北立面', isFrontRow,
              tag: `${code} ${flIdx+1}F北卧/书房窗`
            });
          }

          // --- B. EAST FACADE (+lx, facing East-Northeast towards U11~U8!) ---
          // Because detached villas have 4-sided fenestration and sit at -42°, the East Facade faces directly across the river too!
          // B1. East Protruding Bay Bedroom / Living Window (🔴 核心东向常驻敏感窗: 宽 1.60m × 高 1.45m)
          const eWinSens = (isFrontRow && isUpper) ? 'high' : 'med';
          pushVillaWindow(toW, 'E', -hd*0.38, hd*0.16, hw + 0.60, fy + 0.85, fy + 2.30, eWinSens);
          if (isUpper) {
            const pEWc = toW(hw + 0.68, -hd*0.11);
            privacyHotspotWindows.push({
              x: pEWc[0], y: fy + 1.55, z: pEWc[1],
              nx: cos, nz: sin,
              fl: flIdx + 1, code, face: '东立面', isFrontRow,
              tag: `${code} ${flIdx+1}F东主卧/套房窗`
            });
          }
          // B2. East South-Wing Secondary Bath High Window (🟠)
          if (flIdx < 2) {
            pushVillaWindow(toW, 'E', hd*0.48, hd*0.76, hw, fy + 1.40, fy + 2.20, 'med');
          }

          // --- C. SOUTH FACADE (+lz, facing away from river into villa's private south garden) ---
          pushVillaWindow(toW, 'S', -hw*0.65, -hw*0.10, hd, fy + 0.45, fy + 2.35, 'south');
          pushVillaWindow(toW, 'S',  hw*0.15,  hw*0.70, hd, fy + 0.45, fy + 2.35, 'south');
        }

        // Record 3D Roof Label for viewport display matching the user's Gaode satellite screenshot
        this.tianyuanVillaLabels.push({
          code,
          roleDesc,
          isFrontRow,
          center: [cx, h3F + 2.35, cz]
        });
      };

      // Exact 1:1 Satellite-Calibrated Positions of All 20 Villas in 剑河路888号《田园别墅》:
      // 1) First Row along Southwest Bank of 野奴泾河道 (NW -> SE):
      pushTianyuanDetachedVilla('30幢', -44.66, 20.49, 12.6, 10.8, -42, false, '正对12号楼');
      pushTianyuanDetachedVilla('31幢', -15.78, 27.02, 12.8, 11.0, -42, true,  '东立面斜对U11西/南');
      pushTianyuanDetachedVilla('32幢',   5.84, 27.88, 13.2, 11.2, -42, true,  '正对U11主起居室/南窗(22.4m)');
      pushTianyuanDetachedVilla('33幢',  22.23, 30.72, 13.2, 11.2, -42, true,  '正对U11东段与U10西段(23.7m)');
      pushTianyuanDetachedVilla('34幢',  45.03, 32.94, 13.2, 11.2, -42, true,  '正对U10南向核心区(23.9m)');
      pushTianyuanDetachedVilla('35幢',  63.95, 36.02, 12.8, 11.0, -42, true,  '斜对U10东南侧与9号楼');
      pushTianyuanDetachedVilla('36幢',  75.09, 40.83, 12.8, 11.0, -42, true,  '正对9号/8号楼');
      pushTianyuanDetachedVilla('44幢', 127.78, 53.40, 12.8, 11.0, -42, false, '东南角近东门');

      // 2) Second & Third Rows of 《田园别墅》(SW of Row 1, visible in satellite photo; 41幢 & 40幢 align with gaps between 32/33/34幢!):
      pushTianyuanDetachedVilla('29幢',    -29.14, 35.65, 12.6, 10.8, -42, false, '二排偏西');
      pushTianyuanDetachedVilla('24幢',    -43.50, 44.80, 12.4, 10.6, -42, false, '三排偏西');
      pushTianyuanDetachedVilla('14+13幢', -20.21, 53.90, 15.2, 11.0, -42, false, '双拼别墅');
      pushTianyuanDetachedVilla('41幢',     15.95, 47.49, 13.6, 11.4, -42, true,  '透过32/33幢缝隙斜视U11');
      pushTianyuanDetachedVilla('42幢',     -0.63, 65.73, 13.0, 11.0, -42, false, '三排中区');
      pushTianyuanDetachedVilla('92幢',    -14.50, 76.50, 12.6, 10.8, -42, false, '四排西区');
      pushTianyuanDetachedVilla('40幢',     46.53, 47.98, 13.0, 11.0, -42, true,  '透过33/34幢缝隙斜视U10');
      pushTianyuanDetachedVilla('37幢',     53.44, 58.58, 13.0, 13.0, -42, false, '三排东区');

      // 3) South Horizontal Rows in Satellite Photo (82号, 80号, 78号 & 74号, 72号, 70号):
      pushTianyuanDetachedVilla('82号',  57.48, 73.87, 13.4, 10.8, -42, false, '南排');
      pushTianyuanDetachedVilla('80号',  76.07, 63.27, 13.4, 10.8, -42, false, '南排');
      pushTianyuanDetachedVilla('78号',  96.03, 51.55, 13.4, 10.8, -42, false, '南排东端');
      pushTianyuanDetachedVilla('74号',  67.93, 88.54, 13.4, 10.8, -42, false, '南二排');
      pushTianyuanDetachedVilla('72号',  87.88, 76.83, 13.4, 10.8, -42, false, '南二排');
      pushTianyuanDetachedVilla('70号', 106.48, 66.23, 13.4, 10.8, -42, false, '南二排');
      // Note: 3D Privacy Sightline Rays are now generated dynamically after Section 3A (once all actual exterior windows of U11~U8 are constructed)!

      // 1E. Neighboring Villas (Unit 9, 8, 7, 6, 12, Gate, 1, 2, 3, 5) — Note: Unit 10 is now modeled in full 4-story interior detail below!
      const pushNeighborVilla = (poly, h=10.25, hasCourtyard=true) => {
        pushPrism(poly, 0.0, h, extBrickColor, [0.46, 0.42, 0.38, 0.55], false, neighborRoofCol);
        if (hasCourtyard && poly.length >= 4) {
          let cx = 0, cz = 0;
          for (const p of poly) { cx += p[0]; cz += p[1]; }
          cx /= poly.length; cz /= poly.length;
          const cyHole = poly.map(p => [cx + (p[0] - cx) * 0.46, cz + (p[1] - cz) * 0.46]);
          pushPrism(cyHole, h - 0.35, h + 0.04, [0.26, 0.32, 0.36, 1.0], [0.45, 0.42, 0.38, 0.7], false, [0.28, 0.46, 0.30, 4.0]);
        }
      };

      // Note: Unit 9 (U9) and Unit 8 (U8) are now modeled in full 4-story (B1/1F/2F/3F) CAD interior & courtyard detail below!
      // Unit 7 (U7) West wall is recalibrated to cleanly abut U8's true CAD 12.00° East wall ((95.822, 9.67) -> (89.870, -18.33)) with a 27cm party wall gap!
      const polyU7 = [[96.82, 13.15], [121.30, 4.50], [119.65, 1.35], [106.75, -21.40], [90.80, -16.50], [90.35, -17.30]];
      pushNeighborVilla(polyU7, 10.25, true);
      const polyU6 = [[119.92, 1.35], [138.25, -13.40], [126.15, -36.00], [124.80, -38.50], [119.70, -34.95], [106.25, -22.30]];
      pushNeighborVilla(polyU6, 10.25, true);
      const polyU12 = [[-45.59, -5.11], [-12.98, -5.21], [-10.32, -27.64], [-9.39, -36.09], [-43.16, -26.59]];
      pushNeighborVilla(polyU12, 10.25, true);
      const polyGate = [[-10.31, -27.68], [19.33, -33.85], [16.31, -45.92], [-9.42, -37.30]];
      pushNeighborVilla(polyGate, 8.50, false);
      const polyU1 = [[27.90, -34.54], [51.40, -34.58], [50.72, -56.96], [27.42, -50.35]];
      pushNeighborVilla(polyU1, 10.25, true);
      // Unit 2 (U2 实拍样板房): East-row middle villa opposite U9 (X=51.65..71.45)
      const polyU2 = [[51.65, -32.78], [71.45, -32.78], [70.46, -63.49], [50.88, -58.06]];
      pushNeighborVilla(polyU2, 10.25, false);
      const u2CyHole = [[56.10, -39.20], [66.80, -39.20], [66.30, -54.80], [55.60, -52.20]];
      pushPrism(u2CyHole, 0.05, 10.30, [0.99, 0.99, 0.98, 8.0], [0.76, 0.42, 0.26, 0.85], false, [0.26, 0.28, 0.30, 9.0]);
      // Unit 3 (U3): opposite U8 across the internal driveway (X=71.70..93.80)
      const polyU3 = [[71.70, -32.77], [93.80, -34.02], [85.38, -67.63], [70.75, -64.61]];
      pushNeighborVilla(polyU3, 10.25, true);
      const polyU5 = [[94.42, -31.74], [115.95, -41.29], [121.23, -44.67], [119.56, -47.91], [110.86, -60.34], [85.42, -67.64]];
      pushNeighborVilla(polyU5, 10.25, true);

      // 1F. Estate Perimeter Hedges & Trees along the South Public Greenbelt & Opposite Tianyuan Villa Riverbank
      pushClippedHedge(-52.0, 2.5, 0.0, 7.8, -0.05, 0.70, 1.50, true);
      pushClippedHedge(0.0, 7.8, 52.0, 13.3, -0.05, 0.70, 1.50, true);
      pushClippedHedge(52.0, 13.3, 105.0, 18.8, -0.05, 0.70, 1.50, true);

      const shrubCoords = [
        [-4.8, -14.5, 0.90], [-5.2, -8.5, 0.95], [-5.0, -2.5, 0.90],
        [4.0, 3.5, 0.90], [12.5, 4.2, 0.88], [21.5, 4.8, 0.90],
        [32.5, 6.2, 0.90], [42.5, 6.8, 0.88], [55.5, 9.5, 0.90],
        [65.5, 10.2, 0.88], [78.5, 12.2, 0.90], [90.5, 13.0, 0.88]
      ];
      for (const [sx, sz, sc] of shrubCoords) pushShrubCluster(sx, -0.05, sz, sc);

      const treeCoords = [
        [-7.5, -16.0, 1.10, 'camphor'], [-7.2, -9.5, 1.05, 'maple'], [-7.8, -2.5, 1.12, 'camphor'],
        [-6.5, 3.5, 1.05, 'camphor'], [2.5, 6.2, 1.02, 'maple'], [10.5, 6.8, 1.08, 'camphor'],
        [18.8, 7.5, 1.04, 'maple'], [28.5, 8.8, 1.08, 'camphor'], [38.5, 9.8, 1.04, 'maple'],
        [47.5, 10.8, 1.08, 'camphor'], [58.0, 12.2, 1.06, 'maple'], [68.0, 13.2, 1.08, 'camphor'],
        [79.5, 14.5, 1.05, 'maple'], [91.5, 15.6, 1.08, 'camphor'],
        [12.0, -24.2, 0.95, 'maple'], [21.5, -25.8, 1.02, 'camphor'],
        // Opposite riverbank trees between 田园别墅 31~36幢
        [-26.0, 18.2, 1.05, 'camphor'], [-3.5, 19.8, 1.08, 'camphor'], [14.0, 21.2, 1.05, 'maple'],
        [34.5, 23.2, 1.08, 'camphor'], [55.0, 25.5, 1.05, 'maple'], [76.0, 27.8, 1.08, 'camphor'], [96.0, 29.8, 1.05, 'maple']
      ];
      for (const [tx, tz, sc, st] of treeCoords) pushTree(tx, -0.05, tz, sc, st);
    }

    // ========================================================================
    // 2. Central Courtyard Landscapes for BOTH U11 & U10 (1F Gardens + 2F/3F Outer Gallery Walkways & Balustrades)
    // ========================================================================
    if (chkSlabs) {
      const cyPoly = this.data.courtyard_void['1F_courtyard_polygon'];
      const u10CyPoly = [[33.85, -3.74], [45.38, -3.74], [45.38, -16.68], [34.68, -16.68]];
      if (this.floorFilter === 'ALL' || this.floorFilter === '1F' || this.floorFilter === '2F' || this.floorFilter === '3F') {
        // U11 1F Courtyard (Dark charcoal-slate narrow brick pavers per Photos 3, 6, 9)
        pushPrism(cyPoly, -0.22, -0.02, [0.27, 0.29, 0.30, 9.0], [0.20, 0.22, 0.23, 0.7], true);
        // Photo 3 & Photo 9: Tall multi-stem Sycamore/Plane trees (法国梧桐) rising from 1F courtyard through 2F/3F + trailing green vines on 2F gallery edge
        // (Removed the oversized SW tree at [12.4, -7.8] in U11 courtyard that clipped into the outer gallery walkway)
        const y2Cy = this.data.floors['2F'].elevation;
        const y3Cy = this.data.floors['3F'].elevation;
        for (const [stx, stz, hTop] of [[19.6, -12.6, y3Cy + 1.8], [36.8, -11.8, y3Cy + 1.6], [59.2, -9.2, y3Cy + 1.6], [81.2, -6.8, y3Cy + 1.6]]) {
          pushCylinder(stx, 0.0, hTop, stz, 0.18, 0.07, 9, [0.44, 0.41, 0.36, 1.0], null);
          pushCylinder(stx - 0.18, 2.2, hTop + 0.3, stz + 0.15, 0.10, 0.045, 8, [0.48, 0.45, 0.39, 1.0], null);
          pushCylinder(stx + 0.10, y2Cy + 0.8, y2Cy + 2.8, stz - 0.10, 1.35, 0.95, 10, [0.33, 0.52, 0.28, 4.0], null);
          pushCylinder(stx - 0.15, y3Cy - 0.6, hTop + 0.6, stz + 0.12, 1.55, 0.85, 10, [0.38, 0.57, 0.31, 4.0], null);
        }
        // Photo 3: Hanging green vines cascading down from 2F courtyard gallery edge
        for (let vx = 9.2; vx <= 19.8; vx += 0.55) {
          const vLen = 0.85 + 0.45 * Math.sin(vx * 3.7);
          pushBox(vx, y2Cy - vLen, -5.32, 0.16, 0.08, vLen, 0, [0.22, 0.42, 0.24, 4.0], null, false);
        }
        const lawnPoly = [
          [8.2, -6.4], [19.6, -6.4], [20.4, -8.5], [20.5, -14.0],
          [19.0, -14.9], [9.4, -13.0], [8.4, -11.5]
        ];
        pushPrism(lawnPoly, -0.02, 0.02, [0.31, 0.54, 0.36, 4.0], [0.24, 0.42, 0.28, 0.6], true);
        for (let i=0; i<6; i++) {
          pushBox(8.8 + i*0.52, 0.02, -6.5 - i*0.32, 0.40, 0.30, 0.03, -12, [0.90, 0.88, 0.84, 1.0], null);
        }
        const deckPoly = [
          [10.4, -7.2], [17.2, -7.2], [17.8, -7.8], [18.0, -11.4],
          [17.3, -12.0], [11.2, -11.2], [10.5, -10.5]
        ];
        pushPrism(deckPoly, 0.02, 0.07, [0.64, 0.48, 0.33, 5.0], [0.42, 0.30, 0.20, 0.7], true);

        const planterWest = [[8.6, -8.4], [8.8, -10.4], [10.2, -11.0], [10.4, -10.5], [9.2, -9.9], [9.0, -8.4]];
        const planterNorth = [[15.8, -11.2], [16.0, -13.4], [18.4, -14.0], [18.4, -13.0], [17.0, -12.6], [16.4, -11.3]];
        pushPrism(planterWest, 0.02, 0.44, [0.90, 0.88, 0.83, 6.0], [0.65,0.62,0.58,0.6], true);
        pushPrism(planterNorth, 0.02, 0.44, [0.90, 0.88, 0.83, 6.0], [0.65,0.62,0.58,0.6], true);
        pushTree(17.6, 0.02, -13.1, 0.65, 'maple');
        pushShrubCluster(9.6, 0.02, -11.8, 0.62);
        pushShrubCluster(14.2, 0.02, -12.8, 0.65);
        pushShrubCluster(19.2, 0.02, -9.8, 0.65);

        // U10 1F Central Courtyard (-0.10m sunken basin + -0.015m perimeter veranda + 1F Recessed North Porch & SE Patio per PDF P2)
        const u10Veranda1F = [[31.72, -2.18], [46.25, -2.18], [46.25, -16.78], [32.76, -16.78]];
        pushPrism(u10Veranda1F, -0.22, -0.03, [0.27, 0.29, 0.30, 9.0], [0.22, 0.24, 0.25, 0.6], true);
        const u10Basin1F = [[33.40, -3.74], [44.90, -3.74], [44.90, -15.25], [34.20, -15.25]];
        pushPrism(u10Basin1F, -0.24, -0.02, [0.25, 0.27, 0.28, 9.0], [0.20, 0.22, 0.23, 0.6], true);
        const u10Lawn = [[34.27, -4.45], [44.07, -4.45], [44.07, -14.55], [34.92, -14.55]];
        pushPrism(u10Lawn, -0.02, 0.01, [0.31, 0.54, 0.36, 4.0], [0.24, 0.42, 0.28, 0.6], true);
        const u10Deck = [[36.12, -6.4], [42.12, -6.4], [42.12, -12.8], [36.32, -12.8]];
        pushPrism(u10Deck, 0.01, 0.06, [0.64, 0.48, 0.33, 5.0], [0.42, 0.30, 0.20, 0.7], true);
        // 1F Recessed North Entrance Porch (X=41.50..46.15, Z=-22.48..-16.51) & 1F SE Recessed Patio (X=40.90..44.35, Z=-0.18..3.42)
        const u10NorthPorch1F = [[41.50, -16.51], [46.15, -16.51], [46.15, -22.48], [41.50, -22.48]];
        const u10SEPatio1F = [[40.90, 3.42], [44.35, 3.42], [44.35, -0.18], [40.90, -0.18]];
        pushPrism(u10NorthPorch1F, -0.20, -0.015, [0.89, 0.87, 0.83, 6.0], [0.58, 0.56, 0.52, 0.6], true);
        pushPrism(u10SEPatio1F, -0.20, -0.015, [0.87, 0.85, 0.80, 3.0], [0.58, 0.56, 0.52, 0.6], true);
        pushTree(35.12, 0.01, -13.6, 0.62, 'maple');
        pushTree(42.92, 0.01, -5.6, 0.62, 'maple');
        if (chkFurn) {
          pushRefinedParasolSet(39.12, 0.06, -9.6, 0.95, 10, false);
        }

        // U9 1F Central Courtyard (X=55.32..67.45, Z=-0.33..-16.03) + 1F North Entrance Porch & South Loggia per U9 平面示意.pdf P2
        const u9Veranda1F = [[55.32, 1.12], [67.45, 1.12], [67.45, -14.58], [55.32, -14.58]];
        pushPrism(u9Veranda1F, -0.22, -0.03, [0.27, 0.29, 0.30, 9.0], [0.22, 0.24, 0.25, 0.6], true);
        const u9Basin1F = [[56.88, -0.44], [66.05, -0.44], [66.05, -13.02], [56.88, -13.02]];
        pushPrism(u9Basin1F, -0.24, -0.02, [0.25, 0.27, 0.28, 9.0], [0.20, 0.22, 0.23, 0.6], true);
        const u9Lawn = [[57.65, -1.20], [65.25, -1.20], [65.25, -12.25], [57.65, -12.25]];
        pushPrism(u9Lawn, -0.02, 0.01, [0.31, 0.54, 0.36, 4.0], [0.24, 0.42, 0.28, 0.6], true);
        const u9Deck = [[59.10, -3.35], [63.80, -3.35], [63.80, -10.05], [59.10, -10.05]];
        pushPrism(u9Deck, 0.01, 0.06, [0.64, 0.48, 0.33, 5.0], [0.42, 0.30, 0.20, 0.7], true);
        const u9NorthPorch1F = [[63.22, -14.58], [67.45, -14.58], [67.45, -20.18], [63.22, -20.18]];
        const u9SouthLoggia1F = [[63.57, 6.72], [66.35, 6.72], [66.35, 3.12], [63.57, 3.12]];
        pushPrism(u9NorthPorch1F, -0.20, -0.015, [0.89, 0.87, 0.83, 6.0], [0.58, 0.56, 0.52, 0.6], true);
        pushPrism(u9SouthLoggia1F, -0.20, -0.015, [0.87, 0.85, 0.80, 3.0], [0.58, 0.56, 0.52, 0.6], true);
        pushTree(58.45, 0.01, -11.15, 0.62, 'maple');
        pushTree(64.35, 0.01, -2.65, 0.62, 'maple');
        if (chkFurn) {
          pushRefinedParasolSet(61.45, 0.06, -6.73, 0.95, -8, false);
        }

        // U8 1F Central Courtyard (X=76.52..xEastU8(Z)-3.27, Z=-1.08..-17.88) + 1F North Entrance Porch & South Loggia per U8 平面示意.pdf P2
        const xEU8 = (z) => 89.870 + ((z + 18.33) / 28.00) * 5.952;
        const u8Veranda1F = [[76.52, 4.07], [xEU8(4.07) - 3.27, 4.07], [xEU8(-12.73) - 3.27, -12.73], [76.52, -12.73]];
        pushPrism(u8Veranda1F, -0.22, -0.03, [0.27, 0.29, 0.30, 9.0], [0.22, 0.24, 0.25, 0.6], true);
        const u8Basin1F = [[78.08, 2.51], [xEU8(2.51) - 4.65, 2.51], [xEU8(-11.17) - 4.65, -11.17], [78.08, -11.17]];
        pushPrism(u8Basin1F, -0.24, -0.02, [0.25, 0.27, 0.28, 9.0], [0.20, 0.22, 0.23, 0.6], true);
        const u8Lawn = [[78.85, 1.75], [xEU8(1.75) - 5.40, 1.75], [xEU8(-10.35) - 5.40, -10.35], [78.85, -10.35]];
        pushPrism(u8Lawn, -0.02, 0.01, [0.31, 0.54, 0.36, 4.0], [0.24, 0.42, 0.28, 0.6], true);
        const u8Deck = [[80.40, -0.45], [85.80, -0.45], [85.20, -8.05], [80.40, -8.05]];
        pushPrism(u8Deck, 0.01, 0.06, [0.64, 0.48, 0.33, 5.0], [0.42, 0.30, 0.20, 0.7], true);
        const u8NorthPorch1F = [[81.58, -12.73], [86.60, -12.73], [86.60, -18.33], [81.58, -18.33]];
        const u8SouthLoggia1F = [[85.62, 9.67], [88.40, 9.67], [88.40, 6.07], [85.62, 6.07]];
        pushPrism(u8NorthPorch1F, -0.20, -0.015, [0.89, 0.87, 0.83, 6.0], [0.58, 0.56, 0.52, 0.6], true);
        pushPrism(u8SouthLoggia1F, -0.20, -0.015, [0.87, 0.85, 0.80, 3.0], [0.58, 0.56, 0.52, 0.6], true);
        pushTree(79.80, 0.01, -9.05, 0.62, 'maple');
        pushTree(86.40, 0.01, 0.35, 0.62, 'maple');
        if (chkFurn) {
          pushRefinedParasolSet(83.00, 0.06, -4.33, 0.95, 12, false);
        }
      }



      // Helper: 3-Mode Switchable Courtyard & Gallery Balustrade System with 100% Monolithic Mitered Continuous Handrail (一体连续无砖块拼缝扶手):
      //   Mode 1 ('u2_steel'): U2 Model-Unit White Vertical Flat-Steel Balusters + Dark Bluestone Curb + Monolithic Continuous Teak Handrail
      //   Mode 2 ('wood'):     Warm Solid Teak/Walnut Wood Balustrade (Wood Curb + Vertical Wood Balusters & Posts + Monolithic Continuous Wood Handrail)
      //   Mode 3 ('glass'):    Minimalist Tempered Laminated Glass Balustrade (Dark-Bronze Base Shoe + Translucent Glass Panels + Monolithic Continuous Top Handrail)
      const pushGalleryBalustrade3D = (loopPts, yBase, railH=1.08, skipIndices=[]) => {
        const bMode = this.balustradeStyleMode || 'u2_steel';
        const m = loopPts.length;
        if (m < 2) return;

        // Material colors (using matId = 1.0 on handrails so the shader NEVER slices the handrail into brick/decking slats!)
        const curbCol = (bMode === 'wood')
          ? [0.44, 0.27, 0.16, 1.0]
          : [0.22, 0.24, 0.25, 1.0];
        const subRailCol = (bMode === 'wood')
          ? [0.58, 0.34, 0.19, 1.0]
          : [0.97, 0.97, 0.96, 1.0];
        const barCol = (bMode === 'wood')
          ? [0.56, 0.33, 0.18, 1.0]
          : [0.97, 0.97, 0.96, 1.0];
        const topRailCol = [0.64, 0.35, 0.19, 1.0]; // Smooth monolithic warm Burmese-teak/walnut solid wood (matId=1.0 -> zero brick seams!)
        const glassPanelCol = [0.70, 0.85, 0.90, 0.34];

        // Compute exact mitered corner offsets at each vertex of loopPts so the handrail, sub-rails, and curb form a 100% continuous ribbon around corners!
        const edgeNorms = [];
        for (let i=0; i<m; i++) {
          const pA = loopPts[i], pB = loopPts[(i+1)%m];
          const dx = pB[0] - pA[0], dz = pB[1] - pA[1];
          const L = Math.hypot(dx, dz) || 1;
          edgeNorms.push([-dz / L, dx / L]);
        }
        const miterPts = (halfW) => {
          const outPts = [], inPts = [];
          for (let i=0; i<m; i++) {
            const nPrev = edgeNorms[(i - 1 + m) % m];
            const nCurr = edgeNorms[i];
            let mx = nPrev[0] + nCurr[0], mz = nPrev[1] + nCurr[1];
            const mLen = Math.hypot(mx, mz);
            if (mLen < 1e-4) { mx = nCurr[0]; mz = nCurr[1]; }
            else { mx /= mLen; mz /= mLen; }
            const dot = Math.max(0.45, mx * nCurr[0] + mz * nCurr[1]);
            const s = halfW / dot;
            const pt = loopPts[i];
            outPts.push([pt[0] + mx * s, pt[1] + mz * s]);
            inPts.push([pt[0] - mx * s, pt[1] - mz * s]);
          }
          return [outPts, inPts];
        };

        const [curbOut, curbIn] = miterPts(0.062);
        const [subOut,  subIn]  = miterPts(0.020);
        const [woodOut, woodIn] = miterPts(0.044);

        for (let i=0; i<m; i++) {
          if (skipIndices.includes(i)) continue;
          const ni = (i + 1) % m;
          const p1 = loopPts[i], p2 = loopPts[ni];
          const dx = p2[0] - p1[0], dz = p2[1] - p1[1];
          const segL = Math.hypot(dx, dz) || 1;
          const rotDeg = Math.atan2(dx, dz) * 180 / Math.PI;
          const [nx, nz] = edgeNorms[i];

          // 1. Mitered Base Curb / Shoe Channel (no cross-wise end-cap lines -> seamless continuous base)
          const cH = (bMode === 'glass') ? 0.068 : 0.026;
          const cPoly = [curbOut[i], curbOut[ni], curbIn[ni], curbIn[i]];
          pushPrism(cPoly, yBase - 0.025, yBase + cH, curbCol, null, true);

          if (bMode === 'glass') {
            // Style 3: Pure Frameless Tempered Laminated Glass Balustrade (无顶扶手极简超白夹胶玻璃围挡: top edge is clean polished glass!)
            const gBot = yBase + cH;
            const gTop = yBase + railH;
            pushQuad([p1[0], gBot, p1[1]], [p2[0], gBot, p2[1]], [p2[0], gTop, p2[1]], [p1[0], gTop, p1[1]], nx, 0, nz, glassPanelCol, true);
            // Clean polished glass top edge highlight (no wooden/metal top handrail cap!)
            pushLine([p1[0], gTop, p1[1]], [p2[0], gTop, p2[1]], [0.86, 0.96, 0.99, 0.72]);
            const nPanels = Math.max(1, Math.round(segL / 1.45));
            for (let k=1; k<nPanels; k++) {
              const t = k / nPanels;
              const gx = p1[0] + dx * t, gz = p1[1] + dz * t;
              pushLine([gx, gBot + 0.02, gz], [gx, gTop - 0.01, gz], [0.85, 0.94, 0.96, 0.48]);
            }
          } else {
            // 2. Mitered Monolithic Continuous Top Handrail for Style 1 & Style 2 (一体连续无断缝顶扶手, edgeRgba=null so zero brick-like cross lines!)
            const wPoly = [woodOut[i], woodOut[ni], woodIn[ni], woodIn[i]];
            pushPrism(wPoly, yBase + railH - 0.045, yBase + railH, topRailCol, null, true);
            pushLine([woodOut[i][0], yBase + railH, woodOut[i][1]], [woodOut[ni][0], yBase + railH, woodOut[ni][1]], [0.42, 0.22, 0.11, 0.55]);
            pushLine([woodIn[i][0],  yBase + railH, woodIn[i][1]],  [woodIn[ni][0],  yBase + railH, woodIn[ni][1]],  [0.42, 0.22, 0.11, 0.55]);
            // Style 1 ('u2_steel') & Style 2 ('wood'): Continuous Mitered Sub-Rails + Closely-Spaced 3D Vertical Balusters
            const sPoly = [subOut[i], subOut[ni], subIn[ni], subIn[i]];
            pushPrism(sPoly, yBase + 0.026, yBase + 0.054, subRailCol, null, false);
            pushPrism(sPoly, yBase + railH - 0.082, yBase + railH - 0.054, subRailCol, null, false);
            const spacing = (bMode === 'wood') ? 0.135 : 0.115;
            const nBars = Math.max(2, Math.floor(segL / spacing));
            const barH = (railH - 0.054) - 0.054;
            for (let b=0; b<=nBars; b++) {
              const t = b / nBars;
              const bx = p1[0] + dx * t, bz = p1[1] + dz * t;
              const isPost = (b === 0 || b === nBars || (b % 12 === 0));
              const bw = isPost ? 0.042 : (bMode === 'wood' ? 0.028 : 0.020);
              const bd = isPost ? 0.042 : (bMode === 'wood' ? 0.034 : 0.030);
              const bh = isPost ? (railH - 0.068) : barH;
              pushBox(bx, yBase + 0.026, bz, bw, bd, bh, rotDeg, barCol, null, false);
            }
          }
        }
      };

      // 2F Outdoor Walkways, Platforms & Balustrades around Voids (U11 & U10)
      if (this.floorFilter === 'ALL' || this.floorFilter === '2F') {
        const y2 = this.data.floors['2F'].elevation;
        const sThick2 = this.data.floors['2F'].slab_thickness || 0.18;
        // 1. U11 2F East Platform Perimeter (flush with 1F->2F Courtyard Stair East edge X=22.82 & extending North to Z=-18.02, unified 0.18m slab thickness)
        const darkSlateTileCol = [0.25, 0.27, 0.28, 9.0]; // Photo 6: Dark charcoal-slate narrow brick gallery pavers
        const platPoly = [[22.82, -5.36], [25.95, -5.36], [26.85, -18.02], [22.82, -17.15]];
        pushPrism(platPoly, y2 - sThick2, y2, darkSlateTileCol, [0.20, 0.22, 0.24, 0.7], true);
        // Top landing slab right at the exit of U11 1F->2F Courtyard Straight Stair (X=21.45..23.40, Z=-15.35..-18.02)
        const cyStairTopLanding2F = [[21.45, -15.35], [23.40, -15.35], [23.40, -18.02], [21.45, -17.55]];
        pushPrism(cyStairTopLanding2F, y2 - sThick2, y2, darkSlateTileCol, [0.20, 0.22, 0.24, 0.6], true);
        // 2. U11 Flush Pocket Landscape Garden (齐平园景小花园: X=23.05..25.25, Z=-10.32..-11.92, zero downward ceiling protrusion)
        const pocketBorderPoly = [[23.05, -10.32], [25.25, -10.32], [25.25, -11.92], [23.05, -11.92]];
        const pocketMossPoly   = [[23.22, -10.48], [25.08, -10.48], [25.08, -11.76], [23.22, -11.76]];
        pushPrism(pocketBorderPoly, y2, y2 + 0.002, [0.84, 0.83, 0.80, 6.0], [0.58, 0.56, 0.52, 0.6], false);
        pushPrism(pocketMossPoly,   y2, y2 + 0.004, [0.42, 0.58, 0.36, 4.0], null, false);
        pushCylinder(23.65, y2, y2 + 0.14, -10.85, 0.24, 0.16, 7, [0.62, 0.60, 0.57, 6.0], null);
        pushCylinder(24.72, y2, y2 + 0.11, -11.42, 0.18, 0.12, 6, [0.66, 0.64, 0.60, 6.0], null);
        pushShrubCluster(23.85, y2, -11.35, 0.26);

        const walkSouth = [[6.55, -5.36], [22.85, -5.36], [22.85, -7.01], [6.75, -7.01]];
        const walkWest  = [[6.55, -7.01], [8.25, -7.01], [8.97, -13.60], [7.45, -13.60]];
        const walkNorth = [[7.45, -13.60], [26.85, -18.02], [26.70, -15.35], [21.65, -15.35], [8.97, -12.50]];
        pushPrism(walkSouth, y2 - sThick2, y2, darkSlateTileCol, [0.20, 0.22, 0.24, 0.6], true);
        pushPrism(walkWest,  y2 - sThick2, y2, darkSlateTileCol, [0.20, 0.22, 0.24, 0.6], true);
        pushPrism(walkNorth, y2 - sThick2, y2, darkSlateTileCol, [0.20, 0.22, 0.24, 0.6], true);

        const void2F = [[8.20, -7.01], [22.85, -7.01], [22.85, -15.35], [21.65, -15.35], [8.97, -12.50]];
        // Skip segment 2 ([22.85,-15.35]->[21.65,-15.35]) where the 1F->2F Courtyard Stair arrives at 2F!
        pushGalleryBalustrade3D(void2F, y2, 1.08, [2]);

        // 3. U10 2F Courtyard Gallery Walkways + Open 2F East Platform Pocket Garden (flush with u10_courtyard_stair East edge X=46.08, unified 0.18m thickness!)
        const u10PlatPoly = [[46.08, -2.18], [49.26, -2.18], [49.26, -16.78], [46.08, -16.78]];
        pushPrism(u10PlatPoly, y2 - sThick2, y2, darkSlateTileCol, [0.20, 0.22, 0.24, 0.7], true);
        const u10BorderPoly = [[46.85, -7.20], [48.95, -7.20], [48.95, -12.60], [46.85, -12.60]];
        const u10MossPoly   = [[47.02, -7.38], [48.78, -7.38], [48.78, -12.42], [47.02, -12.42]];
        pushPrism(u10BorderPoly, y2, y2 + 0.002, [0.84, 0.83, 0.80, 6.0], [0.58, 0.56, 0.52, 0.6], false);
        pushPrism(u10MossPoly,   y2, y2 + 0.004, [0.42, 0.58, 0.36, 4.0], null, false);
        pushCylinder(47.45, y2, y2 + 0.15, -8.35, 0.26, 0.17, 7, [0.62, 0.60, 0.57, 6.0], null);
        pushCylinder(48.32, y2, y2 + 0.12, -11.15, 0.22, 0.14, 6, [0.66, 0.64, 0.60, 6.0], null);
        pushShrubCluster(47.62, y2, -8.85, 0.28);
        pushShrubCluster(48.18, y2, -10.75, 0.25);

        const u10WalkS = [[31.72, -2.18], [46.25, -2.18], [46.25, -3.74], [31.84, -3.74]];
        const u10WalkW = [[31.84, -3.74], [33.40, -3.74], [34.20, -15.22], [32.66, -15.22]];
        const u10WalkN = [[32.66, -15.22], [46.25, -15.22], [46.25, -16.78], [32.76, -16.78]];
        for (const wPoly of [u10WalkS, u10WalkW, u10WalkN]) {
          pushPrism(wPoly, y2 - sThick2, y2, darkSlateTileCol, [0.20, 0.22, 0.24, 0.6], true);
        }
        // U10 2F Courtyard Balustrade: skip segment 1 ([45.00,-3.74]->[46.08,-3.74], top exit of 1F->2F Courtyard Stair!)
        const u10Void2F = [[33.40, -3.74], [45.00, -3.74], [46.08, -3.74], [46.08, -15.22], [34.20, -15.22]];
        pushGalleryBalustrade3D(u10Void2F, y2, 1.08, [1]);

        // 4. U9 2F Courtyard Gallery Walkways + Open 2F East Platform Pocket Garden (flush with u9_courtyard_stair East edge X=67.23, unified 0.18m thickness!)
        const u9PlatPoly = [[67.23, 1.12], [70.46, 1.12], [70.46, -14.58], [67.23, -14.58]];
        pushPrism(u9PlatPoly, y2 - sThick2, y2, darkSlateTileCol, [0.20, 0.22, 0.24, 0.7], true);
        const u9BorderPoly = [[68.05, -4.05], [70.15, -4.05], [70.15, -9.45], [68.05, -9.45]];
        const u9MossPoly   = [[68.22, -4.23], [69.98, -4.23], [69.98, -9.27], [68.22, -9.27]];
        pushPrism(u9BorderPoly, y2, y2 + 0.002, [0.84, 0.83, 0.80, 6.0], [0.58, 0.56, 0.52, 0.6], false);
        pushPrism(u9MossPoly,   y2, y2 + 0.004, [0.42, 0.58, 0.36, 4.0], null, false);
        pushCylinder(68.65, y2, y2 + 0.15, -5.20, 0.26, 0.17, 7, [0.62, 0.60, 0.57, 6.0], null);
        pushCylinder(69.52, y2, y2 + 0.12, -8.00, 0.22, 0.14, 6, [0.66, 0.64, 0.60, 6.0], null);
        pushShrubCluster(68.82, y2, -5.70, 0.28);
        pushShrubCluster(69.38, y2, -7.60, 0.25);

        const u9WalkS = [[55.32, 1.12], [67.45, 1.12], [67.45, -0.44], [55.32, -0.44]];
        const u9WalkW = [[55.32, -0.44], [56.88, -0.44], [56.88, -13.02], [55.32, -13.02]];
        const u9WalkN = [[55.32, -13.02], [67.45, -13.02], [67.45, -14.58], [55.32, -14.58]];
        for (const wPoly of [u9WalkS, u9WalkW, u9WalkN]) {
          pushPrism(wPoly, y2 - sThick2, y2, darkSlateTileCol, [0.20, 0.22, 0.24, 0.6], true);
        }
        // Skip segment 1 ([66.05,-0.44]->[67.23,-0.44], top exit of U9 1F->2F Courtyard Stair!)
        const u9Void2F = [[56.88, -0.44], [66.05, -0.44], [67.23, -0.44], [67.23, -13.02], [56.88, -13.02]];
        pushGalleryBalustrade3D(u9Void2F, y2, 1.08, [1]);

        // 5. U8 2F Courtyard Gallery Walkways + Angled 12.00° 2F East Platform Pocket Garden (flush with u8_courtyard_stair East edge, unified 0.18m thickness!)
        const xEU8_2 = (z) => 89.870 + ((z + 18.33) / 28.00) * 5.952;
        const u8PlatPoly = [[xEU8_2(4.07) - 3.45, 4.07], [xEU8_2(4.07) - 0.19, 4.07], [xEU8_2(-12.73) - 0.19, -12.73], [xEU8_2(-12.73) - 3.45, -12.73]];
        pushPrism(u8PlatPoly, y2 - sThick2, y2, darkSlateTileCol, [0.20, 0.22, 0.24, 0.7], true);
        const u8BorderPoly = [[xEU8_2(-1.65) - 2.65, -1.65], [xEU8_2(-1.65) - 0.55, -1.65], [xEU8_2(-7.05) - 0.55, -7.05], [xEU8_2(-7.05) - 2.65, -7.05]];
        const u8MossPoly   = [[xEU8_2(-1.83) - 2.48, -1.83], [xEU8_2(-1.83) - 0.72, -1.83], [xEU8_2(-6.87) - 0.72, -6.87], [xEU8_2(-6.87) - 2.48, -6.87]];
        pushPrism(u8BorderPoly, y2, y2 + 0.002, [0.84, 0.83, 0.80, 6.0], [0.58, 0.56, 0.52, 0.6], false);
        pushPrism(u8MossPoly,   y2, y2 + 0.004, [0.42, 0.58, 0.36, 4.0], null, false);
        pushShrubCluster(91.05, y2, -3.20, 0.28);
        pushShrubCluster(90.65, y2, -5.70, 0.25);

        const u8WalkS = [[76.52, 4.07], [xEU8_2(4.07) - 3.27, 4.07], [xEU8_2(2.51) - 3.27, 2.51], [76.52, 2.51]];
        const u8WalkW = [[76.52, 2.51], [78.08, 2.51], [78.08, -11.17], [76.52, -11.17]];
        const u8WalkN = [[76.52, -11.17], [xEU8_2(-11.17) - 3.27, -11.17], [xEU8_2(-12.73) - 3.27, -12.73], [76.52, -12.73]];
        for (const wPoly of [u8WalkS, u8WalkW, u8WalkN]) {
          pushPrism(wPoly, y2 - sThick2, y2, darkSlateTileCol, [0.20, 0.22, 0.24, 0.6], true);
        }
        // Skip segment 1 (top exit of U8 1F->2F Courtyard Stair!)
        const u8StairExitW = xEU8_2(2.51) - 3.45 - 1.32;
        const u8Void2F = [[78.08, 2.51], [u8StairExitW, 2.51], [xEU8_2(2.51) - 3.45, 2.51], [xEU8_2(-11.17) - 3.45, -11.17], [78.08, -11.17]];
        pushGalleryBalustrade3D(u8Void2F, y2, 1.08, [1]);
      }

      // Tall Courtyard Feature Trees in U11, U10, U9 & U8 2F Pocket Gardens!
      if ((this.floorFilter === 'ALL' || this.floorFilter === '2F' || this.floorFilter === '3F') && chkFurn) {
        const y2Base = this.data.floors['2F'].elevation;
        const y3Top  = this.data.floors['3F'].elevation;
        for (const [tx, tz] of [[24.18, -11.12], [47.90, -9.85], [69.05, -6.73], [90.95, -4.33]]) {
          pushCylinder(tx, y2Base, y3Top + 0.35, tz, 0.14, 0.065, 9, [0.40, 0.32, 0.25, 1.0], null);
          pushCylinder(tx - 0.12, y2Base + 1.85, y3Top + 0.65, tz + 0.10, 0.08, 0.04, 8, [0.42, 0.34, 0.26, 1.0], null);
          pushCylinder(tx + 0.05, y2Base + 2.15, y2Base + 3.25, tz - 0.05, 1.08, 0.78, 10, [0.27, 0.49, 0.30, 4.0], null);
          pushCylinder(tx - 0.18, y3Top - 0.45, y3Top + 0.75, tz + 0.14, 1.22, 0.82, 10, [0.31, 0.54, 0.33, 4.0], null);
          pushCylinder(tx + 0.16, y3Top + 0.35, y3Top + 1.45, tz - 0.12, 0.92, 0.32, 10, [0.36, 0.59, 0.36, 4.0], null);
        }
      }

      // 3F Outdoor Roof Terraces & 3D White Vertical Balustrades with Wood Handrail around Voids (U11 & U10)
      if (this.floorFilter === 'ALL' || this.floorFilter === '3F') {
        const y3 = this.data.floors['3F'].elevation;
        const sThick3 = this.data.floors['3F'].slab_thickness || 0.18;
        const terSouth = [[6.30, -3.97], [25.85, -3.97], [26.06, -7.01], [6.65, -7.01]];
        const terWest  = [[6.55, -7.01], [8.25, -7.01], [8.97, -13.60], [7.45, -13.60]];
        const terNorth = [[7.45, -13.60], [26.96, -18.02], [26.72, -16.25], [8.97, -12.50]];
        const darkSlateTileCol3F = [0.25, 0.27, 0.28, 9.0];
        pushPrism(terSouth, y3 - sThick3, y3, darkSlateTileCol3F, [0.20, 0.22, 0.24, 0.7], true);
        pushPrism(terWest,  y3 - sThick3, y3, darkSlateTileCol3F, [0.20, 0.22, 0.24, 0.7], true);
        pushPrism(terNorth, y3 - sThick3, y3, darkSlateTileCol3F, [0.20, 0.22, 0.24, 0.7], true);
        // Skip segment 1 ([26.06,-7.01]->[26.72,-16.25]) so NO balustrade is placed on U11's 3F East wall!
        const void3F = this.data.courtyard_void['3F_void_opening'];
        pushGalleryBalustrade3D(void3F, y3, 1.08, [1]);

        // U10 3F Setback Terraces (South setback Z=-0.78..-3.74, West gallery, North terrace, unified 0.18m thickness) & Void Balustrades
        const u10TerS = [[31.62, -0.78], [49.33, -0.78], [49.33, -3.74], [31.84, -3.74]];
        const u10TerW = [[31.84, -3.74], [33.40, -3.74], [34.20, -15.22], [32.66, -15.22]];
        const u10TerN = [[32.66, -15.22], [49.33, -15.22], [49.33, -16.78], [32.76, -16.78]];
        for (const tPoly of [u10TerS, u10TerW, u10TerN]) {
          pushPrism(tPoly, y3 - sThick3, y3, darkSlateTileCol3F, [0.20, 0.22, 0.24, 0.7], true);
        }
        // Skip segment 1 ([49.33,-3.74]->[49.33,-15.22]) so NO balustrade is placed along U10's solid full-height 3F East wall!
        const u10Void3F = [[33.40, -3.74], [49.33, -3.74], [49.33, -15.22], [34.20, -15.22]];
        pushGalleryBalustrade3D(u10Void3F, y3, 1.08, [1]);

        // U9 3F Setback Terraces (U9 平面示意.pdf P4) & Void Balustrade (skip East wall segment 1!)
        const u9TerS = [[55.32, 2.52], [70.50, 2.52], [70.50, -0.44], [55.32, -0.44]];
        const u9TerW = [[55.32, -0.44], [56.88, -0.44], [56.88, -13.02], [55.32, -13.02]];
        const u9TerN = [[55.32, -13.02], [70.50, -13.02], [70.50, -14.58], [55.32, -14.58]];
        for (const tPoly of [u9TerS, u9TerW, u9TerN]) {
          pushPrism(tPoly, y3 - sThick3, y3, darkSlateTileCol3F, [0.20, 0.22, 0.24, 0.7], true);
        }
        const u9Void3F = [[56.88, -0.44], [70.50, -0.44], [70.50, -13.02], [56.88, -13.02]];
        pushGalleryBalustrade3D(u9Void3F, y3, 1.08, [1]);

        // U8 3F Setback Terraces (U8 平面示意.pdf P4) & Void Balustrade (skip angled East wall segment 1!)
        const xEU8_3 = (z) => 89.870 + ((z + 18.33) / 28.00) * 5.952;
        const u8TerS = [[76.52, 5.47], [xEU8_3(5.47) - 0.18, 5.47], [xEU8_3(2.51) - 0.18, 2.51], [76.52, 2.51]];
        const u8TerW = [[76.52, 2.51], [78.08, 2.51], [78.08, -11.17], [76.52, -11.17]];
        const u8TerN = [[76.52, -11.17], [xEU8_3(-11.17) - 0.18, -11.17], [xEU8_3(-12.73) - 0.18, -12.73], [76.52, -12.73]];
        for (const tPoly of [u8TerS, u8TerW, u8TerN]) {
          pushPrism(tPoly, y3 - sThick3, y3, darkSlateTileCol3F, [0.20, 0.22, 0.24, 0.7], true);
        }
        const u8Void3F = [[78.08, 2.51], [xEU8_3(2.51) - 0.18, 2.51], [xEU8_3(-11.17) - 0.18, -11.17], [78.08, -11.17]];
        pushGalleryBalustrade3D(u8Void3F, y3, 1.08, [1]);
      }
    }

    // ========================================================================
    // 3. Build Each Floor (B1, 1F, 2F, 3F) for BOTH U11 and U10 + 50cm Party Wall
    // ========================================================================
    const floorOrder = ['B1', '1F', '2F', '3F'];
    for (const fl of floorOrder) {
      if (this.floorFilter !== 'ALL' && this.floorFilter !== fl) continue;
      const fd = this.data.floors[fl];
      const y0 = fd.elevation;
      // Stop B1/1F/2F walls at the underside of the upper floor slab (fd.height - fd.slab_thickness - 0.005)
      // so lower-floor white wall top caps NEVER coplanarly Z-fight with the upper floor's walking surface!
      const maxClearWallH = (fl !== '3F') ? (fd.height - (fd.slab_thickness || 0.18) - 0.005) : fd.height;
      const effWallH = (this.cameraMode === 'walk')
        ? maxClearWallH
        : Math.min(maxClearWallH, this.wallCutHeight);
      const y1 = y0 + effWallH;

      // 3.0 Watertight Floor Slabs for BOTH U11 & U10 + 3D UV Plan Overlay
      if (chkSlabs) {
        const slabCol = (this.floorMaterialMode === 'darkgrey')
          ? [0.24, 0.25, 0.27, 3.0]
          : [0.76, 0.56, 0.36, 3.0];
        const u11Cy1FPoly = [[22.75, -5.50], [6.56, -5.50], [7.49, -13.88], [23.11, -17.02]];
        const u11Loop2FPoly = [[0.14, 0.02], [25.65, 0.02], [26.04, -5.35], [6.30, -5.36], [7.49, -13.88], [26.96, -18.02], [27.34, -23.59], [2.70, -18.34]];
        const u11Loop3FPoly = [[0.14, 0.02], [25.65, 0.02], [25.92, -3.96], [6.12, -3.97], [7.49, -13.88], [26.96, -18.02], [27.34, -23.59], [2.70, -18.34]];
        const rawCells = fd.slab_cells || [fd.slab_polygon];
        const cells = (fl === 'B1') ? rawCells : rawCells.filter(cell => {
          let cx = 0, cz = 0;
          for (const p of cell) { cx += p[0]; cz += p[1]; }
          cx /= cell.length; cz /= cell.length;
          // Exclude raw grid cells inside NW Spiral Stairwell box (replaced by exact polar-meshed landing & outer ring below)
          if (cx >= 2.74 && cx <= 7.78 && cz >= -18.74 && cz <= -13.70) return false;
          // Exclude raw grid cells inside SE Secondary Stairwell box (replaced by exact rectangular landing & perimeter strips below)
          if (cx >= 19.30 && cx <= 25.95 && cz >= -3.98 && cz <= 0.02) return false;
          // Exclude raw grid cells protruding into 1F Central Courtyard or outside 2F/3F indoor footprints
          if (fl === '1F' && pointInPoly2D(cx, cz, u11Cy1FPoly)) return false;
          if (fl === '2F' && !pointInPoly2D(cx, cz, u11Loop2FPoly)) return false;
          if (fl === '3F' && !pointInPoly2D(cx, cz, u11Loop3FPoly)) return false;
          return true;
        });
        const clampU11InnerSlabPt = (pt) => {
          if (fl === 'B1') return pt;
          let px = pt[0], pz = pt[1];
          const znIn = -18.34 + ((px - 2.70) / 24.64) * (-5.25) + 0.16;
          if (pz < znIn) pz = znIn;
          if (pz > -0.14) pz = -0.14;
          const xwIn = 0.14 + ((-pz) / 18.36) * 2.56 + 0.16;
          if (px < xwIn) px = xwIn;
          const xeIn = 25.65 + ((-pz) / 23.61) * 1.69 - 0.16;
          if (px > xeIn) px = xeIn;
          return [px, pz];
        };
        for (const rawCell of cells) {
          const cell = rawCell.map(clampU11InnerSlabPt);
          const tris = triangulatePolygon2D(cell);
          for (const [i0, i1, i2] of tris) {
            const a = cell[i0], b = cell[i1], c = cell[i2];
            pushTri([a[0], y0, a[1]], [c[0], y0, c[1]], [b[0], y0, b[1]], 0, 1, 0, slabCol, true);
            pushTri([a[0], y0 - fd.slab_thickness, a[1]], [b[0], y0 - fd.slab_thickness, b[1]], [c[0], y0 - fd.slab_thickness, c[1]], 0, -1, 0, [0.78,0.77,0.75,1.0], false);
            if (chk3DUV && (this.floorFilter === fl || (this.floorFilter === 'ALL' && fl === '1F'))) {
              pushTri([a[0], y0 + 0.018, a[1]], [c[0], y0 + 0.018, c[1]], [b[0], y0 + 0.018, b[1]], 0, 1, 0, [1.0, 1.0, 1.0, 7.0], false);
            }
          }
        }
        const poly = fd.slab_polygon.map(clampU11InnerSlabPt);
        for (let i=0; i<poly.length; i++) {
          const p1 = poly[i], p2 = poly[(i+1)%poly.length];
          pushLine([p1[0], y0, p1[1]], [p2[0], y0, p2[1]], [0.45, 0.45, 0.45, 0.7]);
        }

        // U11 Exact Staircase Cutout & Landing Slabs (1F, 2F, 3F)
        if (fl !== 'B1') {
          const u11StairSlabPatches = [];
          // 1. NW Main Spiral Staircase (scx=5.250, scz=-16.149, sRin=0.950m, sRout=2.400m):
          //    - Central circular eye (r < 0.950m) is 100% open void on 1F, 2F, 3F.
          //    - Spiral step sector (from aEnd counter-clockwise through North -90° to 380° = +20°) is 100% open stairwell void.
          //    - Southern Landing Sector (from +20.0° to aEnd: 150° on 1F, 155° on 2F, 160° on 3F) is 100% solid annular landing (r = 0.950m .. 2.400m).
          //    - Outer corner ring (r = 2.400m out to X=[2.56..7.78], Z=[-18.74..-13.70], clamped to North outer wall) is 100% solid floor slab.
          const scx = 5.250, scz = -16.149, sRin = 0.950, sRout = 2.400;
          const aStart = 20.0;
          const aEnd = (fl === '1F') ? 150.0 : ((fl === '2F') ? 155.0 : 160.0);
          const degBreaks = [];
          const nLandSeg = 16, nVoidSeg = 28;
          for (let k = 0; k <= nLandSeg; k++) degBreaks.push(aStart + (aEnd - aStart) * (k / nLandSeg));
          for (let k = 1; k <= nVoidSeg; k++) degBreaks.push(aEnd + (380.0 - aEnd) * (k / nVoidSeg));
          const clampSpiralOuterPt = (deg) => {
            const rad = deg * Math.PI / 180.0;
            const cs = Math.cos(rad), sn = Math.sin(rad);
            let rBox = 99.0;
            if (cs > 1e-4) rBox = Math.min(rBox, (7.78 - scx) / cs);
            if (cs < -1e-4) rBox = Math.min(rBox, (2.56 - scx) / cs);
            if (sn > 1e-4) rBox = Math.min(rBox, (-13.70 - scz) / sn);
            if (sn < -1e-4) rBox = Math.min(rBox, (-18.74 - scz) / sn);
            rBox = Math.max(sRout + 0.02, rBox);
            let px = scx + rBox * cs;
            let pz = scz + rBox * sn;
            const znWall = -18.34 + ((px - 2.70) / 24.64) * (-5.25) + 0.14;
            if (pz < znWall) pz = znWall;
            return [px, pz];
          };
          for (let k = 0; k < degBreaks.length - 1; k++) {
            const d0 = degBreaks[k], d1 = degBreaks[k + 1];
            const r0 = d0 * Math.PI / 180.0, r1 = d1 * Math.PI / 180.0;
            const c0 = Math.cos(r0), s0 = Math.sin(r0);
            const c1 = Math.cos(r1), s1 = Math.sin(r1);
            const pOut0 = [scx + sRout * c0, scz + sRout * s0];
            const pOut1 = [scx + sRout * c1, scz + sRout * s1];
            const pBox0 = clampSpiralOuterPt(d0);
            const pBox1 = clampSpiralOuterPt(d1);
            u11StairSlabPatches.push([pOut0, pBox0, pBox1, pOut1]);
            if (k < nLandSeg) {
              const pIn0 = [scx + sRin * c0, scz + sRin * s0];
              const pIn1 = [scx + sRin * c1, scz + sRin * s1];
              u11StairSlabPatches.push([pIn0, pOut0, pOut1, pIn1]);
            }
          }

          // 2. SE Secondary Staircase (second_stair, shaft X=[21.50..25.45], Z=[-3.45..-0.30]):
          //    - Both flights (Z=-1.42..-0.30 and Z=-3.45..-2.33) and half-landing (X=24.30..25.45) remain 100% open void.
          u11StairSlabPatches.push(
            // West entry/exit landing (X=19.20..21.50, Z=0.02..-3.98)
            [[19.20, 0.02], [21.50, 0.02], [21.50, -3.98], [19.20, -3.98]],
            // North corridor strip north of stairwell enclosure wall (Z=-3.45..-3.98)
            [[21.50, -3.45], [25.85, -3.45], [25.85, -3.98], [21.50, -3.98]],
            // South outer wall strip south of south flight (Z=0.02..-0.30)
            [[21.50, 0.02], [25.65, 0.02], [25.65, -0.30], [21.50, -0.30]],
            // East outer wall strip east of half-landing (X=25.45..25.85, Z=-0.30..-3.45)
            [[25.45, -0.30], [25.65, -0.30], [25.85, -3.45], [25.45, -3.45]],
            // Central flight divider strip (X=21.50..24.30, Z=-1.42..-2.33)
            [[21.50, -1.42], [24.30, -1.42], [24.30, -2.33], [21.50, -2.33]]
          );
          if (fl === '1F' || fl === '2F') {
            // Bridge South-East Hall from Z=-3.97 to Z=-5.36
            u11StairSlabPatches.push([[19.20, -3.97], [25.95, -3.97], [26.02, -5.36], [19.20, -5.36]]);
          }
          if (fl === '1F') {
            // Bridge 1F North-East indoor corridor & utility room up to U11 East wall (staying east of cyLoop1F X=23.11)
            u11StairSlabPatches.push(
              [[23.11, -14.50], [26.60, -14.50], [26.85, -18.25], [23.11, -18.25]],
              [[20.20, -16.85], [23.11, -16.85], [23.11, -18.25], [20.20, -18.25]]
            );
          } else {
            // Bridge 2F & 3F North-East indoor rooms strictly north of the angled courtyard wall ([7.45,-13.60]->[26.96,-18.02])
            u11StairSlabPatches.push(
              [[20.20, -16.65], [26.85, -18.02], [26.95, -18.35], [20.20, -18.35]]
            );
          }
          for (const patch of u11StairSlabPatches) {
            pushPrism(patch.map(clampU11InnerSlabPt), y0 - fd.slab_thickness, y0, slabCol, [0.55, 0.53, 0.50, 0.45], true);
          }
        }

        // U10 Watertight Floor Slabs (with Central Courtyard Void, Stairwells, B1 Lightwells, 1F Recessed Courts & 3F [X] Voids cut out!)
        // Exact stairwell cutouts: u10_sw_stair steps #1 & #22 end at Z=-1.95; u10_nw_stair steps #1 & #22 start at Z=-18.35!
        const u10SlabStrips = (fl === 'B1') ? [
          // South wing (East of SW stair X=28.62) + Full B1 base under SW stair
          [[25.92, 3.47], [49.54, 3.47], [49.54, -5.43], [26.20, -5.43]],
          // North strip between lightwells & North wall (including NW stair B1 base)
          [[26.72, -11.55], [49.54, -11.55], [49.54, -22.43], [27.56, -22.43]],
          // Far-North semi-basement apron
          [[31.62, -22.43], [33.91, -22.43], [33.91, -24.18], [31.62, -24.18]],
          // West gallery strip along party wall
          [[26.20, -5.43], [33.64, -5.43], [33.64, -11.55], [26.72, -11.55]],
          // Middle strip between two B1 sunken courtyard lightwells
          [[33.64, -9.88], [40.14, -9.88], [40.14, -11.55], [33.64, -11.55]],
          [[38.39, -5.43], [40.14, -5.43], [40.14, -9.88], [38.39, -9.88]],
          [[40.14, -5.43], [43.34, -5.43], [43.34, -8.55], [40.14, -8.55]],
          // East strip along U10 East wall
          [[43.34, -5.43], [49.54, -5.43], [49.54, -11.55], [43.34, -11.55]]
        ] : (fl === '1F') ? [
          // 1F South-West Living Room (X=28.62..40.90, Z=3.42..-2.18, flush with South outer wall Z=3.42)
          [[28.62, 3.42], [40.90, 3.42], [40.90, -2.18], [28.62, -2.18]],
          // 1F SW Stairwell North Entrance Threshold & Perimeter Strips (meeting step #1 & step #22 at Z=-1.95!)
          [[26.15, -1.95], [28.62, -1.95], [28.62, -2.18], [26.20, -2.18]],
          [[25.81, 3.42], [28.64, 3.42], [28.64, 3.18], [25.81, 3.18]],
          [[25.81, 3.42], [26.22, 3.42], [26.22, -1.95], [26.15, -1.95]],
          [[27.16, 2.05], [27.62, 2.05], [27.62, -1.95], [27.16, -1.95]],
          // 1F South-Mid Corridor north of SE Recessed Patio (X=40.90..44.35, Z=-0.18..-2.18)
          [[40.90, -0.18], [44.35, -0.18], [44.35, -2.18], [40.90, -2.18]],
          // 1F South-East Suite (X=44.35..49.45, Z=3.42..-2.18)
          [[44.35, 3.42], [49.45, 3.42], [49.45, -2.18], [44.35, -2.18]],
          // 1F West Gallery along party wall (X=26.20..31.72 -> 32.76, Z=-2.18..-16.78)
          [[26.20, -2.18], [31.72, -2.18], [32.76, -16.78], [27.24, -16.78]],
          // 1F Elevator & Stair Lobby (X=27.24..31.46, Z=-16.78..-18.35 meeting NW stair step #1 & step #22 at Z=-18.35!)
          [[27.24, -16.78], [31.46, -16.78], [31.46, -18.35], [27.36, -18.35]],
          [[28.76, -18.35], [30.38, -18.35], [30.38, -21.05], [28.76, -21.05]],
          [[27.36, -18.35], [27.68, -18.35], [27.68, -22.48], [27.56, -22.48]],
          [[27.56, -22.12], [31.50, -22.12], [31.50, -22.48], [27.56, -22.48]],
          // 1F North-West Wing (X=31.46..41.50, Z=-16.78..-22.48; east of NW stair, west of North Recessed Entrance Porch)
          [[31.46, -16.78], [41.50, -16.78], [41.50, -22.48], [31.46, -22.48]],
          // 1F North-East Wing (X=46.15..49.45, Z=-16.78..-22.48; east of North Recessed Entrance Porch)
          [[46.15, -16.78], [49.45, -16.78], [49.45, -22.48], [46.15, -22.48]],
          // 1F East Kitchen & Service Wing (X=46.25..49.45, Z=-2.18..-16.78)
          [[46.25, -2.18], [49.45, -2.18], [49.45, -16.78], [46.25, -16.78]]
        ] : (fl === '2F') ? [
          // 2F South Wing Suites (X=28.62..49.45, Z=3.42..-2.18, flush with South outer wall Z=3.42)
          [[28.62, 3.42], [49.45, 3.42], [49.45, -2.18], [28.62, -2.18]],
          // 2F SW Stairwell North Entrance Threshold & Perimeter Strips (meeting step #1 & step #22 at Z=-1.95!)
          [[26.15, -1.95], [28.62, -1.95], [28.62, -2.18], [26.20, -2.18]],
          [[25.81, 3.42], [28.64, 3.42], [28.64, 3.18], [25.81, 3.18]],
          [[25.81, 3.42], [26.22, 3.42], [26.22, -1.95], [26.15, -1.95]],
          [[27.16, 2.05], [27.62, 2.05], [27.62, -1.95], [27.16, -1.95]],
          // 2F West Gallery along party wall (X=26.20..31.72 -> 32.76, Z=-2.18..-16.88)
          [[26.20, -2.18], [31.72, -2.18], [32.76, -16.88], [26.75, -16.88]],
          // 2F Elevator & Stair Lobby (X=27.00..31.46, Z=-16.78..-18.35 meeting NW stair step #1 & step #22 at Z=-18.35!)
          [[27.00, -16.78], [31.46, -16.78], [31.46, -18.35], [27.36, -18.35]],
          [[28.76, -18.35], [30.38, -18.35], [30.38, -21.05], [28.76, -21.05]],
          [[27.36, -18.35], [27.68, -18.35], [27.68, -22.48], [27.56, -22.48]],
          [[27.56, -22.12], [31.50, -22.12], [31.50, -22.48], [27.56, -22.48]],
          // 2F North Wing Suites (X=31.46..49.45, Z=-16.78..-22.48, flush with North outer wall Z=-22.48)
          [[31.46, -16.78], [49.45, -16.78], [49.45, -22.48], [31.46, -22.48]]
        ] : [
          // 3F South Wing Continuous Watertight Slab (X=28.62..49.45, Z=3.42..-0.78 — no missing slab holes, flush to X=49.45 East wall!)
          [[28.62, 3.42], [49.45, 3.42], [49.45, -0.78], [28.62, -0.78]],
          // 3F West Gallery & SW Stairwell Threshold (meeting SW Stairwell at Z=-1.95!)
          [[28.62, -0.78], [31.62, -0.78], [31.72, -1.95], [28.62, -1.95]],
          [[26.15, -1.95], [31.72, -1.95], [32.76, -16.78], [27.24, -16.78]],
          [[25.81, 3.42], [28.64, 3.42], [28.64, 3.18], [25.81, 3.18]],
          [[25.81, 3.42], [26.22, 3.42], [26.22, -1.95], [26.15, -1.95]],
          [[27.16, 2.05], [27.62, 2.05], [27.62, -1.95], [27.16, -1.95]],
          // 3F Elevator & Stair Lobby (X=27.24..31.46, Z=-16.78..-18.35 meeting NW stair at Z=-18.35!)
          [[27.24, -16.78], [31.46, -16.78], [31.46, -18.35], [27.36, -18.35]],
          [[28.76, -18.35], [30.38, -18.35], [30.38, -21.05], [28.76, -21.05]],
          [[27.36, -18.35], [27.68, -18.35], [27.68, -22.48], [27.56, -22.48]],
          [[27.56, -22.12], [31.50, -22.12], [31.50, -22.48], [27.56, -22.48]],
          // 3F North Wing Continuous Watertight Slab (X=31.46..49.45, Z=-16.78..-22.48)
          [[31.46, -16.78], [49.45, -16.78], [49.45, -22.48], [31.46, -22.48]]
        ];
        for (const strip of u10SlabStrips) {
          pushPrism(strip, y0 - fd.slab_thickness, y0, slabCol, [0.55, 0.53, 0.50, 0.45], true);
        }
        // B1 Sunken Courtyard Lightwells & North Semi-Basement Colonnade Columns in U10
        if (fl === 'B1') {
          const lw1 = [[33.64, -5.43], [38.39, -5.43], [38.39, -9.88], [33.64, -9.88]];
          const lw2 = [[40.14, -8.55], [43.34, -8.55], [43.34, -11.55], [40.14, -11.55]];
          pushPrism(lw1, y0 - 0.35, y0 - 0.05, [0.32, 0.53, 0.36, 4.0], [0.5, 0.5, 0.48, 0.7], true);
          pushPrism(lw2, y0 - 0.35, y0 - 0.05, [0.32, 0.53, 0.36, 4.0], [0.5, 0.5, 0.48, 0.7], true);
        }

        // U9 Watertight Floor Slabs (B1, 1F, 2F, 3F — SW stair unified to Z=2.52..6.47 so Z=1.12..2.52 is 100% solid landing on all floors!)
        const u9StairPerimeterStrips = [
          [[49.72, 6.72], [53.92, 6.72], [53.92, 6.47], [49.72, 6.47]],
          [[49.72, 6.47], [49.95, 6.47], [49.95, 2.52], [49.72, 2.52]],
          [[51.72, 5.32], [52.08, 5.32], [52.08, 2.52], [51.72, 2.52]],
          [[49.72, -19.93], [53.92, -19.93], [53.92, -20.18], [49.72, -20.18]],
          [[49.72, -14.58], [49.95, -14.58], [49.95, -19.93], [49.72, -19.93]],
          [[51.72, -14.58], [52.08, -14.58], [52.08, -18.78], [51.72, -18.78]]
        ];
        const u9SlabStrips = (fl === 'B1') ? [
          [[49.72, 6.72], [70.65, 6.72], [70.65, -4.55], [49.72, -4.55]],
          [[49.72, -4.55], [56.50, -4.55], [56.50, -10.15], [49.72, -10.15]],
          [[62.10, -4.55], [70.65, -4.55], [70.65, -10.15], [62.10, -10.15]],
          [[49.72, -10.15], [70.65, -10.15], [70.65, -22.38], [49.72, -22.38]]
        ] : (fl === '1F') ? [
          [[53.85, 6.72], [63.57, 6.72], [63.57, 1.12], [53.85, 1.12]],
          [[63.57, 3.12], [66.35, 3.12], [66.35, 1.12], [63.57, 1.12]],
          [[66.35, 6.72], [70.65, 6.72], [70.65, 1.12], [66.35, 1.12]],
          [[49.72, 2.52], [55.32, 2.52], [55.32, -14.58], [49.72, -14.58]],
          [[53.85, -14.58], [55.32, -14.58], [55.32, -20.18], [53.85, -20.18]],
          [[55.32, -14.58], [63.22, -14.58], [63.22, -20.18], [55.32, -20.18]],
          [[67.23, 1.12], [70.65, 1.12], [70.65, -20.18], [67.23, -20.18]],
          ...u9StairPerimeterStrips
        ] : (fl === '2F') ? [
          [[53.85, 6.72], [70.65, 6.72], [70.65, 1.12], [53.85, 1.12]],
          [[49.72, 2.52], [55.32, 2.52], [55.32, -14.58], [49.72, -14.58]],
          [[53.85, -14.58], [70.65, -14.58], [70.65, -20.18], [53.85, -20.18]],
          ...u9StairPerimeterStrips
        ] : [
          [[53.85, 6.72], [70.65, 6.72], [70.65, 2.52], [53.85, 2.52]],
          [[49.72, 2.52], [55.32, 2.52], [55.32, -6.98], [49.72, -6.98]],
          [[53.80, -6.98], [55.32, -6.98], [55.32, -9.53], [53.80, -9.53]],
          [[49.72, -9.53], [55.32, -9.53], [55.32, -14.58], [49.72, -14.58]],
          [[53.85, -14.58], [70.65, -14.58], [70.65, -20.18], [53.85, -20.18]],
          ...u9StairPerimeterStrips
        ];
        for (const strip of u9SlabStrips) {
          pushPrism(strip, y0 - fd.slab_thickness, y0, slabCol, [0.55, 0.53, 0.50, 0.45], true);
        }

        // U8 Watertight Floor Slabs (B1, 1F, 2F, 3F — SW stair unified to Z=5.47..9.42 so Z=4.07..5.47 is 100% solid landing on all floors!)
        const xEU8_s = (z) => 89.870 + ((z + 18.33) / 28.00) * 5.952;
        const u8StairPerimeterStrips = [
          [[70.92, 9.67], [75.12, 9.67], [75.12, 9.42], [70.92, 9.42]],
          [[70.92, 9.42], [71.15, 9.42], [71.15, 5.47], [70.92, 5.47]],
          [[72.92, 8.27], [73.28, 8.27], [73.28, 5.47], [72.92, 5.47]],
          [[70.92, -18.08], [75.12, -18.08], [75.12, -18.33], [70.92, -18.33]],
          [[70.92, -12.73], [71.15, -12.73], [71.15, -18.08], [70.92, -18.08]],
          [[72.92, -12.73], [73.28, -12.73], [73.28, -16.93], [72.92, -16.93]]
        ];
        const u8SlabStrips = (fl === 'B1') ? [
          [[70.92, 9.67], [xEU8_s(9.67), 9.67], [xEU8_s(-1.85), -1.85], [70.92, -1.85]],
          [[70.92, -1.85], [77.80, -1.85], [77.80, -7.45], [70.92, -7.45]],
          [[83.20, -1.85], [xEU8_s(-1.85), -1.85], [xEU8_s(-7.45), -7.45], [83.20, -7.45]],
          [[70.92, -7.45], [xEU8_s(-7.45), -7.45], [xEU8_s(-18.33), -18.33], [70.92, -18.33]]
        ] : (fl === '1F') ? [
          [[75.05, 9.67], [85.62, 9.67], [85.62, 4.07], [75.05, 4.07]],
          [[85.62, 6.07], [88.40, 6.07], [88.40, 4.07], [85.62, 4.07]],
          [[88.40, 9.67], [xEU8_s(9.67), 9.67], [xEU8_s(4.07), 4.07], [88.40, 4.07]],
          [[70.92, 5.47], [76.52, 5.47], [76.52, -12.73], [70.92, -12.73]],
          [[75.05, -12.73], [81.58, -12.73], [81.58, -18.33], [75.05, -18.33]],
          [[86.60, -12.73], [xEU8_s(-12.73), -12.73], [xEU8_s(-18.33), -18.33], [86.60, -18.33]],
          [[xEU8_s(4.07) - 3.45, 4.07], [xEU8_s(4.07), 4.07], [xEU8_s(-12.73), -12.73], [xEU8_s(-12.73) - 3.45, -12.73]],
          ...u8StairPerimeterStrips
        ] : (fl === '2F') ? [
          [[75.05, 9.67], [xEU8_s(9.67), 9.67], [xEU8_s(4.07), 4.07], [75.05, 4.07]],
          [[70.92, 5.47], [76.52, 5.47], [76.52, -12.73], [70.92, -12.73]],
          [[75.05, -12.73], [xEU8_s(-12.73), -12.73], [xEU8_s(-18.33), -18.33], [75.05, -18.33]],
          ...u8StairPerimeterStrips
        ] : [
          [[75.05, 9.67], [xEU8_s(9.67), 9.67], [xEU8_s(5.47), 5.47], [75.05, 5.47]],
          [[70.92, 5.47], [76.52, 5.47], [76.52, -6.68], [70.92, -6.68]],
          [[75.00, -6.68], [76.52, -6.68], [76.52, -9.23], [75.00, -9.23]],
          [[70.92, -9.23], [76.52, -9.23], [76.52, -12.73], [70.92, -12.73]],
          [[75.05, -12.73], [xEU8_s(-12.73), -12.73], [xEU8_s(-18.33), -18.33], [75.05, -18.33]],
          ...u8StairPerimeterStrips
        ];
        for (const strip of u8SlabStrips) {
          pushPrism(strip, y0 - fd.slab_thickness, y0, slabCol, [0.55, 0.53, 0.50, 0.45], true);
        }
        if (fl === 'B1') {
          const u9Lw = [[56.60, -4.65], [62.00, -4.65], [62.00, -10.05], [56.60, -10.05]];
          const u8Lw = [[77.90, -1.95], [83.10, -1.95], [83.10, -7.35], [77.90, -7.35]];
          pushPrism(u9Lw, y0 - 0.35, y0 - 0.05, [0.32, 0.53, 0.36, 4.0], [0.5, 0.5, 0.48, 0.7], true);
          pushPrism(u8Lw, y0 - 0.35, y0 - 0.05, [0.32, 0.53, 0.36, 4.0], [0.5, 0.5, 0.48, 0.7], true);
        }
      }

      // ======================================================================
      // 3A. Watertight Mitered Continuous Exterior Shell & Courtyard Facades (U11 & U10 + 50cm Party Wall!)
      // ======================================================================
      const yBottom = y0 - fd.slab_thickness;
      const extHighlightCol = [0.18, 0.42, 0.78, 1.0];
      const structHighlightCol = [0.88, 0.22, 0.18, 1.0];
      const highlightEdgeCol = [1.0, 0.85, 0.15, 1.0];
      const topBrickCap = [0.64, 0.59, 0.53, 1.0];
      const cyStonePaintCol = [1.0, 0.996, 0.988, 8.0]; // Pure-White Granular Real-Stone Paint (庭院内围墙纯白细颗粒真石漆)
      const topStoneCap = [0.98, 0.976, 0.968, 8.0];
      const frameCol = [0.27, 0.29, 0.26, 1.0];
      const glassCol = [0.68, 0.84, 0.88, this.cameraMode === 'walk' ? 0.22 : 0.32];

      const pushDirectedWallSpan = (oA, oB, iA, iB, yB, yT, nx, nz, topCol, capBottom=false, closeEnds=false, isCy=false) => {
        if (yT <= yB + 0.005) return;
        const outCol = chkHighlight ? extHighlightCol : (isCy ? cyStonePaintCol : extBrickColor);
        const inCol  = chkHighlight ? extHighlightCol : intWhiteColor;
        const defaultCap = isCy ? topStoneCap : topBrickCap;
        const capCol = chkHighlight ? extHighlightCol : (topCol === topBrickCap ? defaultCap : (topCol || defaultCap));
        pushQuad([oA[0], yB, oA[1]], [oB[0], yB, oB[1]], [oB[0], yT, oB[1]], [oA[0], yT, oA[1]], nx, 0, nz, outCol, true);
        pushQuad([iB[0], yB, iB[1]], [iA[0], yB, iA[1]], [iA[0], yT, iA[1]], [iB[0], yT, iB[1]], -nx, 0, -nz, inCol, true);
        if (topCol !== null) {
          pushQuad([oA[0], yT, oA[1]], [oB[0], yT, oB[1]], [iB[0], yT, iB[1]], [iA[0], yT, iA[1]], 0, 1, 0, capCol, true);
        }
        if (capBottom) {
          pushQuad([iA[0], yB, iA[1]], [iB[0], yB, iB[1]], [oB[0], yB, oB[1]], [oA[0], yB, oA[1]], 0, -1, 0, inCol, false);
        }
        if (closeEnds) {
          const tx = oB[0] - oA[0], tz = oB[1] - oA[1];
          const tL = Math.hypot(tx, tz) || 1;
          const ux = tx / tL, uz = tz / tL;
          pushQuad([iA[0], yB, iA[1]], [oA[0], yB, oA[1]], [oA[0], yT, oA[1]], [iA[0], yT, iA[1]], -ux, 0, -uz, outCol, false);
          pushQuad([oB[0], yB, oB[1]], [iB[0], yB, iB[1]], [iB[0], yT, iB[1]], [oB[0], yT, oB[1]], ux, 0, uz, outCol, false);
        }
        if (chkHighlight) {
          pushLine([oA[0], yT, oA[1]], [oB[0], yT, oB[1]], highlightEdgeCol);
          pushLine([iA[0], yT, iA[1]], [iB[0], yT, iB[1]], highlightEdgeCol);
        }
      };

      const pushMiteredWallLoop = (loopPts, edgeOpeningsList, wallThick=0.26, skipEdges=[], cyEdges=[]) => {
        const m = loopPts.length;
        const halfT = wallThick * 0.5;
        const edgeNorms = [];
        for (let i=0; i<m; i++) {
          const pA = loopPts[i], pB = loopPts[(i+1)%m];
          const dx = pB[0] - pA[0], dz = pB[1] - pA[1];
          const L = Math.hypot(dx, dz) || 1;
          edgeNorms.push([-dz / L, dx / L]);
        }
        const vOut = [], vIn = [];
        for (let i=0; i<m; i++) {
          const nPrev = edgeNorms[(i - 1 + m) % m];
          const nCurr = edgeNorms[i];
          let mx = nPrev[0] + nCurr[0], mz = nPrev[1] + nCurr[1];
          const mLen = Math.hypot(mx, mz);
          if (mLen < 1e-4) { mx = nCurr[0]; mz = nCurr[1]; }
          else { mx /= mLen; mz /= mLen; }
          const dot = Math.max(0.45, mx * nCurr[0] + mz * nCurr[1]);
          const s = halfT / dot;
          const pt = loopPts[i];
          vOut.push([pt[0] + mx * s, pt[1] + mz * s]);
          vIn.push([pt[0] - mx * s, pt[1] - mz * s]);
        }

        for (let i=0; i<m; i++) {
          if (skipEdges.includes(i)) continue;
          const ni = (i + 1) % m;
          const o0 = vOut[i], o1 = vOut[ni];
          const i0 = vIn[i],  i1 = vIn[ni];
          const [nx, nz] = edgeNorms[i];
          const lerp2 = (A, B, t) => [A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t];
          const L = Math.hypot(loopPts[ni][0] - loopPts[i][0], loopPts[ni][1] - loopPts[i][1]) || 1;
          const isCySpan = (fl !== 'B1') && (cyEdges === 'ALL' || (Array.isArray(cyEdges) && cyEdges.includes(i)));

          pushDirectedWallSpan(o0, o1, i0, i1, yBottom, y0 - 0.004, nx, nz, null, true, false, isCySpan);

          let curT = 0.0;
          const rawOps = edgeOpeningsList[i] || [];
          const flNum = (fl === '1F') ? 1 : (fl === '2F') ? 2 : (fl === '3F') ? 3 : 0;
          // Always record exterior window/door openings and solid wall segments from rawOps so privacy sightline rays
          // dynamically stay 100% synchronized with every window position & wall span!
          if (!isCySpan && flNum > 0) {
            let trackT = 0.0;
            const sortedRaw = [...rawOps].sort((a, b) => a[0] - b[0]);
            for (const [rt0, rt1, rKind] of sortedRaw) {
              if (rt0 > trackT + 0.002) {
                const sA = lerp2(o0, o1, trackT), sB = lerp2(o0, o1, rt0);
                exteriorWallSegments2D.push({ fl: flNum, x1: sA[0], z1: sA[1], x2: sB[0], z2: sB[1] });
              }
              const rwOA = lerp2(o0, o1, rt0), rwOB = lerp2(o0, o1, rt1);
              const openBot = (rKind === 'courtyard_door') ? y0 : (y0 + Math.min(0.58, fd.height * 0.35));
              const openTop = (rKind === 'courtyard_door') ? (y0 + Math.min(2.30, fd.height)) : (y0 + Math.min(2.75, fd.height));
              dynamicExteriorWindows.push({
                x: 0.5 * (rwOA[0] + rwOB[0]),
                y: 0.5 * (openBot + openTop),
                z: 0.5 * (rwOA[1] + rwOB[1]),
                nx, nz,
                fl: flNum, flKey: fl, kind: rKind,
                winLen: (rt1 - rt0) * L
              });
              trackT = rt1;
            }
            if (trackT < 0.998) {
              const sA = lerp2(o0, o1, trackT), sB = o1;
              exteriorWallSegments2D.push({ fl: flNum, x1: sA[0], z1: sA[1], x2: sB[0], z2: sB[1] });
            }
          }

          const sortedOps = (chkFen && fl !== 'B1') ? [...rawOps].sort((a, b) => a[0] - b[0]) : [];
          for (const [t0, t1, kind] of sortedOps) {
            if (t0 > curT + 0.002) {
              pushDirectedWallSpan(lerp2(o0, o1, curT), lerp2(o0, o1, t0), lerp2(i0, i1, curT), lerp2(i0, i1, t0), y0, y1, nx, nz, topBrickCap, false, true, isCySpan);
            }
            const wOA = lerp2(o0, o1, t0), wOB = lerp2(o0, o1, t1);
            const wIA = lerp2(i0, i1, t0), wIB = lerp2(i0, i1, t1);
            const mA  = lerp2(loopPts[i], loopPts[ni], t0), mB = lerp2(loopPts[i], loopPts[ni], t1);
            const winLen = (t1 - t0) * L;

            // Photo 8 & Photo 6: Flush-Wall Recessed Privacy Window/Door Reveal (内凹式窗套严格限制在墙体厚度 wOA..wIA 内部，内外墙面100%平整零突出!)
            const surroundStoneCol = [0.91, 0.90, 0.87, 6.0]; // Pale off-white precast stone reveal lining (Photo 8)
            const matteBlackFrame  = [0.13, 0.14, 0.15, 1.0]; // Matte black aluminum window frame (Photos 6 & 8)
            const rOA = wOA;
            const rOB = wOB;
            const rIA = wIA;
            const rIB = wIB;
            // Set the matte-black glazing frame 82% inward from the outer face toward the inner face (deep outer reveal, zero interior protrusion!)
            const gA  = lerp2(wOA, wIA, 0.82);
            const gB  = lerp2(wOB, wIB, 0.82);

            // Helper: Build flush stone-lined window reveal jambs, sill, and soffit strictly inside [wOA..wOB, wIA..wIB]
            const pushRecessedPrivacyBox = (yBot, yTopOpen, isExteriorBrick) => {
              const boxCol = isExteriorBrick ? surroundStoneCol : [0.96, 0.96, 0.95, 1.0];
              const jambT = Math.min(0.08, 0.07 / Math.max(0.5, winLen));
              const lJamb = [rOA, lerp2(rOA, rOB, jambT), lerp2(rIA, rIB, jambT), rIA];
              const rJamb = [lerp2(rOA, rOB, 1 - jambT), rOB, rIB, lerp2(rIA, rIB, 1 - jambT)];
              pushPrism(lJamb, yBot, yTopOpen, boxCol, [0.68, 0.66, 0.62, 0.45], false);
              pushPrism(rJamb, yBot, yTopOpen, boxCol, [0.68, 0.66, 0.62, 0.45], false);
              const boxPoly = [rOA, rOB, rIB, rIA];
              if (yBot > y0 + 0.03) {
                pushPrism(boxPoly, yBot, yBot + 0.06, boxCol, [0.68, 0.66, 0.62, 0.5], false);
              }
              pushPrism(boxPoly, yTopOpen - 0.06, yTopOpen, boxCol, [0.68, 0.66, 0.62, 0.5], false);
              if (isExteriorBrick && yBot > y0 + 0.15) {
                const spX = rOA[0] + (rOB[0] - rOA[0]) * 0.12 + nx * 0.03;
                const spZ = rOA[1] + (rOB[1] - rOA[1]) * 0.12 + nz * 0.03;
                pushBox(spX, yBot - 0.03, spZ, 0.05, 0.05, 0.035, 0, [0.35, 0.32, 0.28, 1.0], null, false);
              }
            };

            if (kind === 'courtyard_door') {
              const doorH = Math.min(2.30, effWallH);
              if (effWallH > doorH + 0.04) {
                pushDirectedWallSpan(wOA, wOB, wIA, wIB, y0 + doorH, y1, nx, nz, topBrickCap, true, true, isCySpan);
              }
              if (!chkHighlight) {
                pushRecessedPrivacyBox(y0, y0 + doorH, !isCySpan);
                const divs = Math.max(1, Math.round(winLen / 1.15));
                for (let k=0; k<=divs; k++) {
                  const kt = k / divs;
                  const mx = gA[0] + (gB[0] - gA[0]) * kt;
                  const mz = gA[1] + (gB[1] - gA[1]) * kt;
                  pushBox(mx, y0 + 0.05, mz, 0.05, 0.055, doorH - 0.10, 0, matteBlackFrame, null, false);
                }
                pushQuad([gA[0], y0 + 0.06, gA[1]], [gB[0], y0 + 0.06, gB[1]], [gB[0], y0 + doorH - 0.06, gB[1]], [gA[0], y0 + doorH - 0.06, gA[1]], nx, 0, nz, glassCol, false);
              }
            } else {
              const sillH = (kind === 'courtyard_glazing') ? 0.08 : Math.min(0.58, effWallH * 0.35);
              const winTop = Math.min(2.75, effWallH);
              if (sillH > 0.02) {
                pushDirectedWallSpan(wOA, wOB, wIA, wIB, y0, y0 + sillH, nx, nz, surroundStoneCol, false, true, isCySpan);
              }
              if (effWallH > winTop + 0.04) {
                pushDirectedWallSpan(wOA, wOB, wIA, wIB, y0 + winTop, y1, nx, nz, topBrickCap, true, true, isCySpan);
              }
              if (!chkHighlight && winTop > sillH + 0.12) {
                pushRecessedPrivacyBox(y0 + sillH, y0 + winTop, !isCySpan);
                // Photo 8 asymmetric matte-black window frame & transom/mullion at 42cm recessed depth
                const divs = Math.max(1, Math.ceil(winLen / 1.40));
                for (let k=0; k<=divs; k++) {
                  const kt = (divs === 2 && k === 1) ? 0.68 : (k / divs); // Photo 8 signature 2:1 asymmetric mullion split!
                  const mx = gA[0] + (gB[0] - gA[0]) * kt;
                  const mz = gA[1] + (gB[1] - gA[1]) * kt;
                  pushBox(mx, y0 + sillH + 0.05, mz, 0.055, 0.065, winTop - sillH - 0.10, 0, matteBlackFrame, null, false);
                }
                // Upper horizontal transom bar as seen in Photo 8
                const trY = y0 + sillH + (winTop - sillH) * 0.76;
                pushLine([gA[0], trY, gA[1]], [gB[0], trY, gB[1]], matteBlackFrame);
                pushQuad([gA[0], y0 + sillH + 0.06, gA[1]], [gB[0], y0 + sillH + 0.06, gB[1]], [gB[0], y0 + winTop - 0.06, gB[1]], [gA[0], y0 + winTop - 0.06, gA[1]], nx, 0, nz, glassCol, false);
              }
            }
            curT = t1;
          }
          if (curT < 0.998) {
            pushDirectedWallSpan(lerp2(o0, o1, curT), o1, lerp2(i0, i1, curT), i1, y0, y1, nx, nz, topBrickCap, false, curT > 0.002, isCySpan);
          }
          pushLine([o0[0], y1, o0[1]], [o1[0], y1, o1[1]], [0.46, 0.42, 0.38, 0.45]);
        }
      };

      // Helper: Build the 50cm Shared Party Wall between U11 and U10!
      // Consists of: 20cm U11 East Wall + 10cm Cavity (中空层) + 20cm U10 West Wall = 50cm total thickness!
      const push50cmPartyWallAssembly = () => {
        const xInU11 = (z) => 25.55 + (-z / 23.61) * 1.69;
        // Strictly keep B1 & 1F 100% solid, keep both South & North staircase walls 100% solid on all floors,
        // and open ONLY the 2F/3F corridor windows plus the widened 2.16m walkthrough doorway on 2F East (Z=-14.72..-16.88)!
        const infillZones = (fl === '3F')
          ? [
              [-5.60, -9.10, '3500mm', 'glazing_south'],
              [-12.12, -14.52, '2400mm', 'glazing_north']
            ]
          : (fl === '2F')
          ? [
              [-6.22, -10.22, '4000mm', 'glazing_south'],
              [-12.02, -14.52, '2500mm', 'glazing_north'],
              [-14.72, -16.88, '2160mm', 'connect_door']
            ]
          : [];

        const pushPartyPier50cm = (zA, zB, yB, yT) => {
          const xA = xInU11(zA), xB = xInU11(zB);
          const leafU11 = [[xA, zA], [xA + 0.20, zA], [xB + 0.20, zB], [xB, zB]];
          const cavity10 = [[xA + 0.20, zA], [xA + 0.30, zA], [xB + 0.30, zB], [xB + 0.20, zB]];
          const leafU10 = [[xA + 0.30, zA], [xA + 0.50, zA], [xB + 0.50, zB], [xB + 0.30, zB]];
          const mz = 0.5 * (zA + zB);
          const isCyFacing = (fl !== 'B1' && mz < -2.10 && mz > -18.10);
          const u11Col = chkHighlight ? structHighlightCol : (isCyFacing ? cyStonePaintCol : intWhiteColor);
          const u10Col = chkHighlight ? structHighlightCol : (isCyFacing ? cyStonePaintCol : intWhiteColor);
          const pierEdgeCol = (isCyFacing && !this.stonePaintSeams) ? null : [0.82, 0.81, 0.79, 0.4];
          const pierCapCol = isCyFacing ? topStoneCap : [0.86, 0.84, 0.81, 1.0];
          pushPrism(leafU11, yB, yT, u11Col, pierEdgeCol, true, pierCapCol);
          pushPrism(cavity10, yB, yT - 0.01, [0.42, 0.44, 0.48, 1.0], null, false, [0.35, 0.38, 0.42, 1.0]);
          pushPrism(leafU10, yB, yT, u10Col, pierEdgeCol, true, pierCapCol);
        };

        // Inset South start (-0.16m) inside U11 South brick wall and stop shared party wall at U10 North wall (-22.32m on 1F..3F)
        // so zero white interior party wall ever pokes outside the South or North exterior brick facades!
        const zPartySouth = -0.16;
        const zPartyNorth = (fl === 'B1') ? -23.42 : -22.32;
        const x0 = xInU11(zPartySouth), xN = xInU11(zPartyNorth);
        pushPrism([[x0, zPartySouth], [x0 + 0.50, zPartySouth], [xN + 0.50, zPartyNorth], [xN, zPartyNorth]], yBottom, y0 - 0.004, [0.90, 0.87, 0.82, 3.0], null, false);

        // Exposed North-East exterior wall wing of U11 (Z = -22.32 .. -23.59, where U11 extends 1.11m further North than U10)
        // Rendered with exterior kiln brick on the outer face and white plaster on the inner face!
        if (fl !== 'B1') {
          const zStepS = -22.32, zStepN = -23.59;
          const xStepS = xInU11(zStepS), xStepN = xInU11(zStepN);
          pushDirectedWallSpan(
            [xStepS + 0.28, zStepS], [xStepN + 0.28, zStepN],
            [xStepS, zStepS], [xStepN, zStepN],
            yBottom, y1, 1, 0, topBrickCap, true, true, false
          );
        }

        let curZ = zPartySouth;
        for (const [zStart, zEnd, labelMm, opKind] of infillZones) {
          if (curZ - zStart > 0.02) {
            pushPartyPier50cm(curZ, zStart, y0, y1);
          }
          const xS = xInU11(zStart), xE = xInU11(zEnd);
          const infillPoly = [[xS, zStart], [xS + 0.50, zStart], [xE + 0.50, zEnd], [xE, zEnd]];
          const blueCol = [0.05, 0.55, 1.0, 0.95];
          for (const yLine of [y0 + 0.025, y1 + 0.01]) {
            pushLine([xS, yLine, zStart], [xS + 0.50, yLine, zStart], blueCol);
            pushLine([xS + 0.50, yLine, zStart], [xE + 0.50, yLine, zEnd], blueCol);
            pushLine([xE + 0.50, yLine, zEnd], [xE, yLine, zEnd], blueCol);
            pushLine([xE, yLine, zEnd], [xS, yLine, zStart], blueCol);
          }
          if (chkPartyKnock) {
            const isDoor = (opKind === 'connect_door');
            const openH  = Math.min(isDoor ? 2.48 : 2.75, effWallH);
            if (effWallH > openH + 0.04) {
              pushPartyPier50cm(zStart, zEnd, y0 + openH, y1);
            }
            if (!chkHighlight && chkFen && fl !== 'B1') {
              if (opKind === 'glazing_south' || opKind === 'glazing_north') {
                // Floor-to-ceiling window frame & mullions between U11 2F East platform & U10 2F West gallery
                const sillH = 0.06;
                pushPrism(infillPoly, y0, y0 + sillH, frameCol, null, false);
                if (openH > 0.30) {
                  pushPrism(infillPoly, y0 + openH - 0.045, y0 + openH, frameCol, null, false);
                  const spanLen = Math.abs(zStart - zEnd);
                  const divs = Math.max(2, Math.round(spanLen / 1.30));
                  for (let k = 0; k <= divs; k++) {
                    const kt = k / divs;
                    const mz = zStart + (zEnd - zStart) * kt;
                    const mx = xInU11(mz) + 0.25;
                    pushBox(mx, y0 + sillH, mz, 0.12, 0.055, openH - sillH, 0, frameCol, null, false);
                  }
                  const gxS = xS + 0.25, gxE = xE + 0.25;
                  pushQuad([gxS, y0 + sillH + 0.02, zStart], [gxE, y0 + sillH + 0.02, zEnd], [gxE, y0 + openH - 0.02, zEnd], [gxS, y0 + openH - 0.02, zStart], -1, 0, 0, glassCol, false);
                }
              } else if (isDoor) {
                // Wide 2.16m Walkthrough Connecting Portal between U11 2F East & U10 2F West Gallery (Z=-14.72..-16.88)
                const jambS = [[xS, zStart], [xS + 0.50, zStart], [xS + 0.50, zStart - 0.04], [xS, zStart - 0.04]];
                const jambN = [[xE, zEnd + 0.04], [xE + 0.50, zEnd + 0.04], [xE + 0.50, zEnd], [xE, zEnd]];
                pushPrism(jambS, y0, y0 + openH, frameCol, null, false);
                pushPrism(jambN, y0, y0 + openH, frameCol, null, false);
                pushPrism(infillPoly, y0 + openH - 0.045, y0 + openH, frameCol, null, false);
                // Flush stone threshold bridging the 50cm party wall doorway
                pushPrism(infillPoly, y0 - fd.slab_thickness, y0, [0.88, 0.86, 0.82, 6.0], null, true);
              }
            }
          } else {
            pushPrism(infillPoly, y0, y1, [0.20, 0.62, 0.98, 0.38], blueCol, true);
          }
          curZ = zEnd;
        }
        if (curZ - zPartyNorth > 0.02) {
          pushPartyPier50cm(curZ, zPartyNorth, y0, y1);
        }
      };

      if (chkExt) {
        // 1. Build the 50cm Shared Party Wall Assembly (20cm U11 + 10cm Cavity + 20cm U10)
        push50cmPartyWallAssembly();

        // 2. U11 Exterior & Courtyard Walls (skipping Edge 1 on B1/1F and Edges 1 & 5 on 2F/3F because the 50cm Party Wall Assembly above handles the East shared boundary!)
        if (fl === 'B1') {
          const b1Loop = [[0.13, 0.04], [25.65, 0.04], [27.34, -23.59], [2.70, -18.34]];
          pushMiteredWallLoop(b1Loop, [[], [], [], []], 0.28, [1], []);
        } else if (fl === '1F') {
          const outer1F = [[0.14, 0.02], [25.65, 0.02], [27.34, -23.59], [2.70, -18.34]];
          const outerOps1F = [
            [[0.045, 0.198, 'window'], [0.451, 0.577, 'courtyard_door']],
            [],
            [[0.215, 0.432, 'courtyard_door'], [0.536, 0.706, 'window']],
            []
          ];
          pushMiteredWallLoop(outer1F, outerOps1F, 0.34, [1], []);

          const cyLoop1F = [[22.75, -5.50], [6.56, -5.50], [7.49, -13.88], [23.11, -17.02]];
          // Openings strictly placed inside architectural bays between B1-3F load-bearing columns/piers (zero hollowing of structural piers!)
          const cyOps1F = [
            [[0.06, 0.13, 'window'], [0.275, 0.485, 'courtyard_door'], [0.625, 0.880, 'courtyard_glazing']],
            [[0.475, 0.720, 'courtyard_door']],
            [[0.175, 0.310, 'courtyard_glazing'], [0.685, 0.920, 'courtyard_door']],
            [[0.04, 0.14, 'courtyard_door']]
          ];
          pushMiteredWallLoop(cyLoop1F, cyOps1F, 0.28, [], 'ALL');
        } else if (fl === '2F') {
          const loop2F = [
            [0.14, 0.02], [25.65, 0.02], [26.04, -5.35], [6.30, -5.36],
            [7.49, -13.88], [26.96, -18.02], [27.34, -23.59], [2.70, -18.34]
          ];
          const ops2F = [
            [[0.104, 0.287, 'window'], [0.444, 0.542, 'window']],
            [],
            [[0.045, 0.098, 'courtyard_door'], [0.365, 0.538, 'courtyard_door'], [0.675, 0.885, 'courtyard_glazing']],
            [[0.265, 0.495, 'courtyard_glazing']],
            [[0.175, 0.255, 'courtyard_glazing'], [0.320, 0.385, 'courtyard_door'], [0.650, 0.790, 'courtyard_door']],
            [],
            [[0.336, 0.443, 'window'], [0.545, 0.695, 'window']],
            []
          ];
          pushMiteredWallLoop(loop2F, ops2F, 0.32, [1, 5], [2, 3, 4]);
        } else if (fl === '3F') {
          const loop3F = [
            [0.14, 0.02], [25.65, 0.02], [25.92, -3.96], [6.12, -3.97],
            [7.49, -13.88], [26.96, -18.02], [27.34, -23.59], [2.70, -18.34]
          ];
          const ops3F = [
            [[0.046, 0.158, 'window'], [0.478, 0.597, 'window']],
            [],
            [[0.380, 0.548, 'courtyard_door'], [0.798, 0.888, 'courtyard_door']],
            [[0.405, 0.540, 'courtyard_glazing']],
            [[0.195, 0.255, 'courtyard_door'], [0.550, 0.720, 'courtyard_door']],
            [],
            [[0.172, 0.357, 'window'], [0.651, 0.732, 'window']],
            [[0.423, 0.663, 'window']]
          ];
          pushMiteredWallLoop(loop3F, ops3F, 0.32, [1, 5], [2, 3, 4]);
        }

        // 3. U10 Exterior Shell & Central Courtyard Facades (1:1 CAD coordinates from U11U10二联层高和户间示意.pdf Pages 1-4!)
        if (fl === 'B1') {
          const u10OuterB1 = [
            [26.05, 0.02], [25.90, 3.47], [49.54, 3.47], [49.54, -16.73],
            [33.91, -16.73], [33.91, -24.18], [27.56, -24.18]
          ];
          pushMiteredWallLoop(u10OuterB1, [[], [], [], [], [], [], []], 0.26, [6], []);
          // B1 North semi-basement colonnade outer frame & columns (X=33.91..49.54, Z=-22.43)
          for (const cx of [38.47, 43.37, 49.37]) {
            pushBox(cx, y0, -22.35, 0.45, 0.45, effWallH, 0, extBrickColor, [0.48, 0.44, 0.40, 0.5], false);
          }
        } else if (fl === '1F') {
          // 1F Outer Shell: Flush South-West facade (Z=3.42), SE Recessed Patio (40.90..44.35, Z=-0.18),
          // and North Recessed Entrance Court (41.50..46.15, Z=-16.51) — window recesses are handled purely by pushRecessedPrivacyBox!
          const u10Outer1F = [
            [26.05, 0.02],   // 0: SW party-wall step
            [25.81, 3.42],   // 1: South-West corner (flush South facade 25.81 -> 40.90)
            [40.90, 3.42],   // 2: SE patio outer W
            [40.90, -0.18],  // 3: SE patio inner W
            [44.35, -0.18],  // 4: SE patio inner E
            [44.35, 3.42],   // 5: South-East suite wall W
            [49.45, 3.42],   // 6: South-East corner
            [49.45, -22.48], // 7: North-East corner
            [46.15, -22.48], // 8: North Recessed Entrance Porch outer E
            [46.15, -16.51], // 9: North Recessed Entrance Porch inner E
            [41.50, -16.51], // 10: North Recessed Entrance Porch inner W
            [41.50, -22.48], // 11: North Recessed Entrance Porch outer W
            [27.56, -22.48]  // 12: North-West corner (connects back to 0 along 50cm party wall, skipped!)
          ];
          // Strictly per U11U10二联层高和户间示意.pdf P2:
          // - 1F South wall (1-A): ONLY 2 recessed windows in SW Living Room (X=32.10..34.40 & X=36.60..38.90); SE wing (44.35..49.45) is 100% solid brick!
          // - 1F North wall (1-Y): ONLY 1 small cloakroom shaft window (X=34.80..36.40); NE storage & NW stair are 100% solid brick!
          const u10Ops1F = [
            [],                                              // 0: SW step
            [[0.417, 0.569, 'window'], [0.715, 0.867, 'window']], // 1: ONLY 2 windows on 1F South-West Living Room (X=32.10..34.40, X=36.60..38.90)
            [],                                              // 2: SE loggia West wall (solid brick per CAD)
            [[0.20, 0.80, 'window']],                        // 3: SE loggia inner North window (Z=-0.18)
            [],                                              // 4: SE loggia East wall (solid brick per CAD)
            [],                                              // 5: SE suite South wall (44.35..49.45 — 100% solid brick per CAD, zero windows!)
            [],                                              // 6: Solid East boundary wall separating U10 from U9 (zero windows!)
            [],                                              // 7: NE storage North wall (46.15..49.45 — 100% solid brick per CAD!)
            [],                                              // 8: North Entrance Porch E wall (solid)
            [[0.22, 0.78, 'courtyard_door']],                // 9: Main North Entrance Door (Z=-16.51)
            [],                                              // 10: North Entrance Porch W wall (solid)
            [[0.366, 0.481, 'window']],                      // 11: NW wing North wall — ONLY 1 small window (X=34.80..36.40)!
            []                                               // 12: Party wall (skipped)
          ];
          pushMiteredWallLoop(u10Outer1F, u10Ops1F, 0.34, [12], []);

          // U10 1F True CAD Inner Courtyard Loop:
          const u10Cy1F = [[46.25, -2.18], [31.72, -2.18], [32.76, -16.78], [46.25, -16.78]];
          const u10CyOps1F = [
            [[0.27, 0.35, 'courtyard_door'], [0.48, 0.74, 'courtyard_glazing'], [0.86, 0.98, 'courtyard_glazing']],
            [[0.20, 0.46, 'courtyard_glazing'], [0.63, 0.81, 'courtyard_door']],
            [[0.16, 0.31, 'courtyard_glazing'], [0.36, 0.61, 'courtyard_glazing'], [0.66, 0.97, 'courtyard_door']],
            [[0.06, 0.16, 'courtyard_door']]
          ];
          pushMiteredWallLoop(u10Cy1F, u10CyOps1F, 0.28, [], 'ALL');
        } else if (fl === '2F') {
          // 2F Outer Shell: 100% Flat South Facade (Z=3.42) & Flat North Facade (Z=-22.48) — all window recesses handled purely within window openings!
          const u10Outer2F = [
            [26.05, 0.02],   // 0: SW party-wall step
            [25.81, 3.42],   // 1: South-West corner (flush South facade 25.81 -> 49.45, L=23.64m)
            [49.45, 3.42],   // 2: South-East corner
            [49.45, -22.48], // 3: North-East corner (flush North facade 49.45 -> 27.56, L=21.89m)
            [27.56, -22.48]  // 4: North-West corner (party wall 4->0 skipped)
          ];
          // Strictly per U11U10二联层高和户间示意.pdf P3:
          // - 2F South wall (25.81..49.45): ONLY 2 windows (X=34.00..36.50 & X=39.60..41.80); SW stair & SE bathroom are 100% solid brick!
          // - 2F North wall (49.45..27.56): ONLY 2 windows in Guest Bedrooms 1 & 2 (X=40.80..42.80 & X=34.20..36.40); NE bath & NW stair are 100% solid brick!
          const u10Ops2F = [
            [],                                              // 0
            [[0.346, 0.452, 'window'], [0.583, 0.676, 'window']], // 1: ONLY 2 windows on 2F South facade (X=34.00..36.50, X=39.60..41.80)
            [],                                              // 2: Solid East boundary wall separating U10 from U9 (zero windows!)
            [[0.304, 0.395, 'window'], [0.596, 0.697, 'window']], // 3: ONLY 2 windows on 2F North facade (X=40.80..42.80, X=34.20..36.40)
            []                                               // 4: Party wall (skipped)
          ];
          pushMiteredWallLoop(u10Outer2F, u10Ops2F, 0.34, [4], []);

          // U10 2F True CAD Inner Courtyard Loop (East side X=46.25..49.45 is the open 2F East Garden Platform — NO dividing wall at X=46.25!):
          const u10Cy2F = [[49.45, -2.18], [31.72, -2.18], [32.76, -16.78], [49.45, -16.78]];
          const u10CyOps2F = [
            [[0.06, 0.13, 'courtyard_door'], [0.20, 0.34, 'courtyard_glazing'], [0.45, 0.50, 'courtyard_door'], [0.70, 0.86, 'courtyard_glazing']],
            [[0.10, 0.30, 'courtyard_glazing'], [0.65, 0.90, 'courtyard_glazing']],
            [[0.13, 0.30, 'courtyard_glazing'], [0.37, 0.45, 'courtyard_door'], [0.62, 0.78, 'courtyard_glazing'], [0.85, 0.93, 'courtyard_door']],
            []
          ];
          pushMiteredWallLoop(u10Cy2F, u10CyOps2F, 0.28, [3], 'ALL');
        } else if (fl === '3F') {
          // 3F Outer Shell: 100% Flush South Facade (25.81..49.45, Z=3.42), Full-Height Solid East Boundary Wall (X=49.45, Z=3.42..-22.48),
          // and Flush North Facade (49.45..27.56, Z=-22.48) — all windows have uniform flush reveal!
          const u10Outer3F = [
            [26.05, 0.02],   // 0: SW party-wall step
            [25.81, 3.42],   // 1: South-West corner (flush South facade 25.81 -> 49.45, L=23.64m)
            [49.45, 3.42],   // 2: South-East corner (flush at X=49.45, no westward SE notch!)
            [49.45, -22.48], // 3: North-East corner (full-height solid East boundary wall X=49.45, Z=3.42..-22.48!)
            [27.56, -22.48]  // 4: North-West corner (party wall 4->0 skipped)
          ];
          // Strictly per U11U10二联层高和户间示意.pdf P4:
          // - 3F South wall (25.81..49.45): ONLY 1 window in Walk-in Closet (X=32.00..34.30); Bedroom & Bathroom South walls are 100% solid brick!
          // - 3F North wall (49.45..27.56): ONLY 1 window in Walk-in Closet (X=33.80..35.60); Master Bedroom & Bathroom North walls are 100% solid brick!
          const u10Ops3F = [
            [],                                              // 0
            [[0.262, 0.359, 'window']],                      // 1: ONLY 1 window on 3F South facade (X=32.00..34.30)
            [],                                              // 2: Full-height solid East boundary wall separating U10 from U9 (zero windows!)
            [[0.633, 0.715, 'window']],                      // 3: ONLY 1 window on 3F North facade (X=33.80..35.60)
            []                                               // 4: Party wall (skipped)
          ];
          pushMiteredWallLoop(u10Outer3F, u10Ops3F, 0.34, [4], []);

          // U10 3F True CAD Inner Courtyard & Setback Terrace Loop (extending flush to East boundary wall X=49.45):
          const u10Cy3F = [[49.45, -0.78], [31.62, -0.78], [32.76, -16.78], [49.45, -16.78]];
          const u10CyOps3F = [
            [[0.18, 0.32, 'courtyard_glazing'], [0.39, 0.47, 'courtyard_door'], [0.53, 0.75, 'courtyard_glazing']],
            [[0.29, 0.47, 'courtyard_glazing'], [0.69, 0.81, 'courtyard_glazing']],
            [[0.16, 0.39, 'courtyard_glazing'], [0.45, 0.53, 'courtyard_door'], [0.62, 0.80, 'courtyard_glazing']],
            []
          ];
          pushMiteredWallLoop(u10Cy3F, u10CyOps3F, 0.28, [3], 'ALL');
        }

        // 4. U9 Exterior Shell & Central Courtyard Facades (Exact stepped Z = 6.72 .. -20.18 per U9 平面示意.pdf & U11U10 PDF P1 3300mm step!)
        if (fl === 'B1') {
          const u9OuterB1 = [[49.72, 6.72], [70.65, 6.72], [70.65, -22.38], [49.72, -22.38]];
          pushMiteredWallLoop(u9OuterB1, [[], [], [], []], 0.28, [], []);
          for (const cx of [58.50, 62.75, 67.00]) {
            pushBox(cx, y0, -20.18, 0.45, 0.45, effWallH, 0, extBrickColor, [0.48, 0.44, 0.40, 0.5], false);
          }
        } else if (fl === '1F') {
          const u9Outer1F = [
            [49.72, 6.72],   // 0: SW corner
            [63.57, 6.72],   // 1: South Loggia outer W
            [63.57, 3.12],   // 2: South Loggia inner W
            [66.35, 3.12],   // 3: South Loggia inner E
            [66.35, 6.72],   // 4: South Loggia outer E
            [70.65, 6.72],   // 5: SE corner
            [70.65, -20.18], // 6: NE corner (solid East party wall shared with U8)
            [67.45, -20.18], // 7: North Entrance Porch outer E
            [67.45, -14.58], // 8: North Entrance Porch inner E
            [63.22, -14.58], // 9: North Entrance Porch inner W
            [63.22, -20.18], // 10: North Entrance Porch outer W
            [49.72, -20.18]  // 11: NW corner (solid West party wall shared with U10)
          ];
          // Strictly per U9 平面示意.pdf P2:
          // - 1F South wall (1-A): ONLY 1 window (2780mm bay at x=6.00..8.78m, X=55.97..58.25m); middle 5070mm & East 4300mm are 100% solid brick!
          // - 1F North wall (1-Y): ONLY 1 small shaft window (x=7.55..9.25m, X=57.35..58.85m); NE 3200mm & NW stair are 100% solid brick!
          const u9Ops1F = [
            [[0.451, 0.616, 'window']],                      // 0: ONLY 1 window on 1F South wall (X=55.97..58.25m)!
            [],                                              // 1: South Loggia W wall (solid brick per CAD)
            [[0.20, 0.80, 'window']],                        // 2: South Loggia N inner window
            [],                                              // 3: South Loggia E wall (solid brick per CAD)
            [],                                              // 4: East 4300mm South wall (100% solid brick, zero windows!)
            [],                                              // 5: Solid East party wall
            [],                                              // 6: NE 3200mm Storage North wall (100% solid brick, zero windows!)
            [],                                              // 7: North Porch E wall (solid)
            [[0.22, 0.78, 'courtyard_door']],                // 8: North Porch S Courtyard Door
            [[0.25, 0.72, 'courtyard_door']],                // 9: Main North Entrance Door into Entrance Hall per CAD P2!
            [[0.324, 0.435, 'window']],                      // 10: ONLY 1 small window on 1F North wall (X=57.35..58.85m)!
            []                                               // 11: Solid West party wall
          ];
          pushMiteredWallLoop(u9Outer1F, u9Ops1F, 0.34, [], []);

          const u9Cy1F = [[67.45, 1.12], [55.32, 1.12], [55.32, -14.58], [67.45, -14.58]];
          const u9CyOps1F = [
            [[0.20, 0.32, 'courtyard_door'], [0.45, 0.78, 'courtyard_glazing']],
            [[0.18, 0.44, 'courtyard_glazing'], [0.58, 0.76, 'courtyard_door']],
            [[0.15, 0.55, 'courtyard_glazing'], [0.66, 0.92, 'courtyard_door']],
            [[0.08, 0.20, 'courtyard_door']]
          ];
          pushMiteredWallLoop(u9Cy1F, u9CyOps1F, 0.28, [], 'ALL');
        } else if (fl === '2F') {
          // Strictly per U9 平面示意.pdf P3:
          // - 2F South wall (20930mm): ONLY 2 windows (2800mm bay at x=8.10..10.90m & 2150mm bay at x=12.25..14.40m); East 6530mm & West 8100mm are 100% solid brick!
          // - 2F North wall (20930mm): ONLY 2 windows (2500mm bay at x=6.95..9.45m & 1820mm bay at x=13.90..15.72m); East 5210mm & West 6950mm are 100% solid brick!
          const u9Outer2F = [[49.72, 6.72], [70.65, 6.72], [70.65, -20.18], [49.72, -20.18]];
          const u9Ops2F = [
            [[0.399, 0.509, 'window'], [0.597, 0.676, 'window']], // 0: ONLY 2 windows on 2F South facade (X=58.07..60.37m, X=62.22..63.87m)
            [],                                                  // 1: Solid East party wall
            [[0.259, 0.326, 'window'], [0.560, 0.656, 'window']], // 2: ONLY 2 windows on 2F North facade (X=63.83..65.23m, X=56.92..58.92m)
            []                                                   // 3: Solid West party wall
          ];
          pushMiteredWallLoop(u9Outer2F, u9Ops2F, 0.34, [], []);

          const u9Cy2F = [[70.65, 1.12], [55.32, 1.12], [55.32, -14.58], [70.65, -14.58]];
          const u9CyOps2F = [
            [[0.08, 0.16, 'courtyard_door'], [0.28, 0.52, 'courtyard_glazing'], [0.62, 0.72, 'courtyard_door'], [0.76, 0.90, 'courtyard_glazing']],
            [[0.14, 0.38, 'courtyard_glazing'], [0.44, 0.56, 'courtyard_door'], [0.64, 0.86, 'courtyard_glazing']],
            [[0.14, 0.36, 'courtyard_glazing'], [0.42, 0.62, 'courtyard_glazing'], [0.64, 0.72, 'courtyard_door'], [0.82, 0.92, 'courtyard_door']],
            []
          ];
          pushMiteredWallLoop(u9Cy2F, u9CyOps2F, 0.28, [3], 'ALL');
        } else if (fl === '3F') {
          // Strictly per U9 平面示意.pdf P4:
          // - 3F South wall (20930mm): ONLY 1 window in Walk-in Closet (2600mm bay at x=6.00..8.60m, X=55.97..58.07m); Bedroom 5000mm & Bath 4530mm are 100% solid brick!
          // - 3F North wall (20930mm): ONLY 1 window in Walk-in Closet (1700mm bay at x=6.20..7.90m, X=56.12..57.42m); Master Bedroom & Bath are 100% solid brick!
          const u9Outer3F = [[49.72, 6.72], [70.65, 6.72], [70.65, -20.18], [49.72, -20.18]];
          const u9Ops3F = [
            [[0.299, 0.399, 'window']],                      // 0: ONLY 1 window on 3F South facade (X=55.97..58.07m)
            [],                                              // 1: Full-height solid East party wall
            [[0.632, 0.694, 'window']],                      // 2: ONLY 1 window on 3F North facade (X=56.12..57.42m)
            []                                               // 3: Full-height solid West party wall
          ];
          pushMiteredWallLoop(u9Outer3F, u9Ops3F, 0.34, [], []);

          const u9Cy3F = [[70.65, 2.52], [55.32, 2.52], [55.32, -14.58], [70.65, -14.58]];
          const u9CyOps3F = [
            [[0.18, 0.36, 'courtyard_glazing'], [0.45, 0.56, 'courtyard_door'], [0.65, 0.85, 'courtyard_glazing']],
            [[0.26, 0.48, 'courtyard_glazing'], [0.66, 0.84, 'courtyard_glazing']],
            [[0.18, 0.42, 'courtyard_glazing'], [0.52, 0.62, 'courtyard_door'], [0.70, 0.88, 'courtyard_glazing']],
            []
          ];
          pushMiteredWallLoop(u9Cy3F, u9CyOps3F, 0.28, [3], 'ALL');
        }

        // 5. U8 Exterior Shell & Central Courtyard Facades (Exact stepped Z = 9.67 .. -18.33 per U8 平面示意.pdf P2/P3 1850mm step & 12.00° angled East facade!)
        const xEU8_w = (z) => 89.870 + ((z + 18.33) / 28.00) * 5.952;
        if (fl === 'B1') {
          const u8OuterB1 = [[70.92, 9.67], [95.822, 9.67], [89.870, -18.33], [70.92, -18.33]];
          pushMiteredWallLoop(u8OuterB1, [[], [], [], []], 0.28, [], []);
        } else if (fl === '1F') {
          const u8Outer1F = [
            [70.92, 9.67],    // 0: SW corner
            [85.62, 9.67],    // 1: South Loggia outer W
            [85.62, 6.07],    // 2: South Loggia inner W
            [88.40, 6.07],    // 3: South Loggia inner E
            [88.40, 9.67],    // 4: South Loggia outer E
            [95.822, 9.67],   // 5: SE corner (12.00° East wall starts)
            [89.870, -18.33], // 6: NE corner (12.00° East wall ends)
            [86.60, -18.33],  // 7: North Entrance Porch outer E
            [86.60, -12.73],  // 8: North Entrance Porch inner E
            [81.58, -12.73],  // 9: North Entrance Porch inner W
            [81.58, -18.33],  // 10: North Entrance Porch outer W
            [70.92, -18.33]   // 11: NW corner
          ];
          // Strictly per U8 平面示意.pdf P2:
          // - 1F South wall (24902mm): ONLY 1 window (2280mm clear width at x=6.65..8.93m, X=77.57..79.85m); middle 5520mm & East 7422mm are 100% solid brick!
          // - 1F North wall (18950mm): ONLY 1 small shaft window (x=5.60..7.00m); NE 3270mm & NW stair are 100% solid brick!
          const u8Ops1F = [
            [[0.452, 0.607, 'window']],                      // 0: ONLY 1 window on 1F South wall (X=77.57..79.85m, 2280mm)!
            [],                                              // 1: South Loggia W wall (solid brick per CAD)
            [[0.20, 0.80, 'window']],                        // 2: South Loggia N inner window
            [],                                              // 3: South Loggia E wall (solid brick per CAD)
            [],                                              // 4: East 7422mm South wall (100% solid brick, zero windows!)
            [],                                              // 5: 12.00° Angled East boundary wall (zero windows)
            [],                                              // 6: NE 3270mm North wall (100% solid brick, zero windows!)
            [],                                              // 7: North Porch E wall (solid)
            [[0.22, 0.78, 'courtyard_door']],                // 8: North Porch S Courtyard Door
            [[0.25, 0.72, 'courtyard_door']],                // 9: Main North Entrance Door into Entrance Hall per CAD P2!
            [[0.345, 0.460, 'window']],                      // 10: ONLY 1 small window on 1F North wall!
            []                                               // 11: Solid West party wall
          ];
          pushMiteredWallLoop(u8Outer1F, u8Ops1F, 0.34, [], []);

          const u8Cy1F = [
            [xEU8_w(4.07) - 3.27, 4.07],
            [76.52, 4.07],
            [76.52, -12.73],
            [xEU8_w(-12.73) - 3.27, -12.73]
          ];
          const u8CyOps1F = [
            [[0.18, 0.30, 'courtyard_door'], [0.44, 0.78, 'courtyard_glazing']],
            [[0.18, 0.44, 'courtyard_glazing'], [0.58, 0.76, 'courtyard_door']],
            [[0.16, 0.54, 'courtyard_glazing'], [0.66, 0.90, 'courtyard_door']],
            [[0.08, 0.20, 'courtyard_door']]
          ];
          pushMiteredWallLoop(u8Cy1F, u8CyOps1F, 0.28, [], 'ALL');
        } else if (fl === '2F') {
          // Strictly per U8 平面示意.pdf P3:
          // - 2F South wall (24902mm): ONLY 2 windows (3200mm bay at x=8.00..11.20m & 2500mm bay at x=15.25..17.75m); West 8000mm & East 7152mm are 100% solid brick!
          // - 2F North wall (18950mm): ONLY 2 windows (1550mm clear at x=6.85..8.40m & 1940mm clear at x=10.91..12.85m); West 6850mm & East 6100mm are 100% solid brick!
          const u8Outer2F = [[70.92, 9.67], [95.822, 9.67], [89.870, -18.33], [70.92, -18.33]];
          const u8Ops2F = [
            [[0.331, 0.440, 'window'], [0.622, 0.703, 'window']], // 0: ONLY 2 windows on 2F South facade (X=79.17..81.87m, X=86.42..88.42m)
            [],                                                  // 1: 12.00° Angled East boundary wall
            [[0.322, 0.424, 'window'], [0.557, 0.639, 'window']], // 2: ONLY 2 windows on 2F North facade (X=81.83..83.77m, X=77.77..79.32m)
            []                                                   // 3: Solid West party wall
          ];
          pushMiteredWallLoop(u8Outer2F, u8Ops2F, 0.34, [], []);

          const u8Cy2F = [
            [xEU8_w(4.07), 4.07],
            [76.52, 4.07],
            [76.52, -12.73],
            [xEU8_w(-12.73), -12.73]
          ];
          const u8CyOps2F = [
            [[0.08, 0.16, 'courtyard_door'], [0.28, 0.52, 'courtyard_glazing'], [0.60, 0.70, 'courtyard_door'], [0.74, 0.88, 'courtyard_glazing']],
            [[0.14, 0.38, 'courtyard_glazing'], [0.44, 0.56, 'courtyard_door'], [0.64, 0.86, 'courtyard_glazing']],
            [[0.14, 0.36, 'courtyard_glazing'], [0.42, 0.60, 'courtyard_glazing'], [0.63, 0.72, 'courtyard_door'], [0.82, 0.92, 'courtyard_door']],
            []
          ];
          pushMiteredWallLoop(u8Cy2F, u8CyOps2F, 0.28, [3], 'ALL');
        } else if (fl === '3F') {
          // Strictly per U8 平面示意.pdf P4:
          // - 3F South wall (24902mm): ONLY 1 window (1500mm clear width at x=6.55..8.05m, X=77.47..78.97m); entire Bedroom & Bathroom South walls are 100% solid brick!
          // - 3F North wall (18950mm): ZERO exterior windows on 1-W (rooms open onto the recessed 3F patio & central courtyard)!
          const u8Outer3F = [[70.92, 9.67], [95.822, 9.67], [89.870, -18.33], [70.92, -18.33]];
          const u8Ops3F = [
            [[0.263, 0.323, 'window']],                      // 0: ONLY 1 window (1500mm) on 3F South facade (X=77.47..78.97m)!
            [],                                              // 1: Full-height 12.00° Angled East boundary wall
            [],                                              // 2: 3F North outer wall has ZERO exterior windows per CAD P4!
            []                                               // 3: Solid West party wall
          ];
          pushMiteredWallLoop(u8Outer3F, u8Ops3F, 0.34, [], []);

          const u8Cy3F = [
            [xEU8_w(5.47), 5.47],
            [76.52, 5.47],
            [76.52, -12.73],
            [xEU8_w(-12.73), -12.73]
          ];
          const u8CyOps3F = [
            [[0.18, 0.36, 'courtyard_glazing'], [0.45, 0.56, 'courtyard_door'], [0.65, 0.85, 'courtyard_glazing']],
            [[0.26, 0.48, 'courtyard_glazing'], [0.66, 0.84, 'courtyard_glazing']],
            [[0.18, 0.42, 'courtyard_glazing'], [0.52, 0.62, 'courtyard_door'], [0.70, 0.88, 'courtyard_glazing']],
            []
          ];
          pushMiteredWallLoop(u8Cy3F, u8CyOps3F, 0.28, [3], 'ALL');
        }
      }

      // ======================================================================
      // 3B. Interior Load-Bearing Structural Walls & Partition Walls (U11, U10, U9 & U8)
      // ======================================================================
      const u10FloorData = this.data.u10?.floors?.[fl];
      const u9FloorData  = this.data.u9?.floors?.[fl];
      const u8FloorData  = this.data.u8?.floors?.[fl];
      const isU11OuterShellDuplicate = (poly) => {
        let minX = 999, maxX = -999, minZ = 999, maxZ = -999;
        let maxDw = -999, maxDn = -999, maxDs = -999, maxDe = -999, maxDcyN = -999;
        for (const p of poly) {
          if (p[0] < minX) minX = p[0]; if (p[0] > maxX) maxX = p[0];
          if (p[1] < minZ) minZ = p[1]; if (p[1] > maxZ) maxZ = p[1];
          const xw = 0.14 + (-p[1] / 18.36) * 2.56;
          const zn = -18.34 + ((p[0] - 2.70) / 24.64) * (-5.25);
          const xe = 25.55 + (-p[1] / 23.61) * 1.69;
          const zCyN = -13.88 + ((p[0] - 7.49) / 19.47) * (-4.14);
          maxDw = Math.max(maxDw, p[0] - xw);
          maxDn = Math.max(maxDn, p[1] - zn);
          maxDs = Math.max(maxDs, 0.02 - p[1]);
          maxDe = Math.max(maxDe, xe - p[0]);
          maxDcyN = Math.max(maxDcyN, Math.abs(p[1] - zCyN));
        }
        // 1. Skip walls that lie along U11's 4 outer perimeter walls (or recessed window outer strips on S/N facades)
        if (maxDw < 0.52 || maxDn < 0.52 || maxDs < 0.48 || maxDe < 0.28) return true;
        if (fl !== 'B1' && minZ < -18.70 && maxZ > -21.95 && minX >= 8.30 && maxX <= 20.10) return true;
        if (fl === 'B1') return false;
        // 2. Skip walls that duplicate the Courtyard perimeter loops already drawn by pushMiteredWallLoop
        if (minX >= 6.05 && maxX <= 7.65 && minZ >= -14.05 && maxZ <= -5.25) return true;
        if (fl !== '3F' && minZ >= -5.85 && maxZ <= -5.30 && minX >= 6.20 && maxX <= 26.35) return true;
        if (fl === '3F' && minZ >= -4.25 && maxZ <= -3.90 && minX >= 6.05 && maxX <= 20.55) return true;
        if (maxDcyN < 0.55 && minX >= 7.20 && maxX <= 24.50) return true;
        return false;
      };
      // Clamp any U11 interior wall vertex strictly inside the inner face of the West, East, North & South exterior brick walls
      // so transverse interior walls never poke through or Z-fight with the angled West/East/North exterior brick facades!
      const clampU11InteriorPolyToShell = (poly) => poly.map(([x, z]) => {
        const cz = Math.min(-0.16, z);
        const xwIn = 0.14 + (-cz / 18.36) * 2.56 + 0.19;
        const xeIn = 25.55 + (-cz / 23.61) * 1.69 - 0.03;
        const cx = Math.max(xwIn, Math.min(xeIn, x));
        const znIn = -18.34 + ((cx - 2.70) / 24.64) * (-5.25) + 0.19;
        return [cx, Math.max(znIn, cz)];
      });
      const getU11WallYRange = () => [y0, y1];
      if (chkStruct) {
        for (const w of fd.structural_walls) {
          if (w.type === 'exterior' || isU11OuterShellDuplicate(w.poly)) continue;
          const clampedPoly = clampU11InteriorPolyToShell(w.poly);
          const [wy0, wy1] = getU11WallYRange(clampedPoly);
          if (chkHighlight) {
            pushPrism(clampedPoly, wy0, wy1, structHighlightCol, highlightEdgeCol, true);
          } else {
            pushPrism(clampedPoly, wy0, wy1, intWhiteColor, [0.75, 0.73, 0.70, 0.45], true, [0.86, 0.84, 0.81, 1.0]);
          }
        }
        for (const extraFlData of [u10FloorData, u9FloorData, u8FloorData]) {
          if (extraFlData?.structural_walls) {
            for (const w of extraFlData.structural_walls) {
              if (chkHighlight) {
                pushPrism(w.poly, y0, y1, structHighlightCol, highlightEdgeCol, true);
              } else {
                pushPrism(w.poly, y0, y1, intWhiteColor, [0.75, 0.73, 0.70, 0.45], true, [0.86, 0.84, 0.81, 1.0]);
              }
            }
          }
        }
        // Solid Stairwell Enclosure Walls for U11, U10, U9 & U8 (inset inside outer brick shells so zero white wall pokes outside!)
        const stairEnclosureWalls = [
          // U11 SE Secondary Staircase (second_stair) North enclosure wall separating stairwell from corridor
          [[21.50, -3.42], [25.52, -3.42], [25.52, -3.62], [21.50, -3.62]],
          // U10 SW Staircase East enclosure wall (X=28.62..28.84, Z=3.24..-1.95)
          [[28.62, 3.24], [28.84, 3.24], [28.84, -1.95], [28.62, -1.95]],
          // U10 NW Staircase East enclosure wall (X=31.46..31.68, Z=-18.35..-22.30)
          [[31.46, -18.35], [31.68, -18.35], [31.68, -22.30], [31.46, -22.30]],
          // U9 SW Staircase East enclosure wall (X=53.85..54.05, Z=6.54..2.52)
          [[53.85, 6.54], [54.05, 6.54], [54.05, 2.52], [53.85, 2.52]],
          // U9 NW Staircase East enclosure wall (X=53.85..54.05, Z=-14.58..-20.00)
          [[53.85, -14.58], [54.05, -14.58], [54.05, -20.00], [53.85, -20.00]],
          // U8 SW Staircase East enclosure wall (X=75.05..75.25, Z=9.48..5.47)
          [[75.05, 9.48], [75.25, 9.48], [75.25, 5.47], [75.05, 5.47]],
          // U8 NW Staircase East enclosure wall (X=75.05..75.25, Z=-12.73..-18.14)
          [[75.05, -12.73], [75.25, -12.73], [75.25, -18.14], [75.05, -18.14]]
        ];
        if (fl === '3F') {
          stairEnclosureWalls.push([[20.56, -4.20], [25.52, -4.20], [25.52, -4.00], [20.56, -4.00]]);
        }
        for (const swPoly of stairEnclosureWalls) {
          if (chkHighlight) {
            pushPrism(swPoly, y0, y1, structHighlightCol, highlightEdgeCol, true);
          } else {
            pushPrism(swPoly, y0, y1, intWhiteColor, [0.75, 0.73, 0.70, 0.45], true, [0.86, 0.84, 0.81, 1.0]);
          }
        }
      }

      if (chkPart) {
        for (const w of fd.partition_walls) {
          if (isU11OuterShellDuplicate(w.poly)) continue;
          const clampedPoly = clampU11InteriorPolyToShell(w.poly);
          const [wy0, wy1] = getU11WallYRange(clampedPoly);
          pushPrism(clampedPoly, wy0, wy1, intWhiteColor, [0.78, 0.76, 0.73, 0.45], true);
        }
        for (const extraFlData of [u10FloorData, u9FloorData, u8FloorData]) {
          if (extraFlData?.partition_walls) {
            for (const w of extraFlData.partition_walls) {
              pushPrism(w.poly, y0, y1, intWhiteColor, [0.78, 0.76, 0.73, 0.45], true);
            }
          }
        }
        if (chkFen && fl !== 'B1') {
          const intDoors = [
            [5.05, -7.20, 5.05, -8.25], [20.08, -1.05, 20.08, -2.05],
            [16.70, -4.15, 17.65, -4.15], [9.50, -14.80, 10.45, -15.00]
          ];
          for (const [x1, z1, x2, z2] of intDoors) {
            pushFenestrationSegment(fl, x1, z1, x2, z2, y0, effWallH, 'interior_door', extBrickColor, intWhiteColor);
          }
        }
        // U11 Spiral Staircase Circular Void Inner-Eye Solid 3D Curved Balustrade (cx=5.250, cz=-16.149, R_in=0.955m)
        if (chkSlabs && fl !== 'B1') {
          const scx = 5.250, scz = -16.149, sRin = 0.955;
          const aStart = 20.0, aEnd = (fl === '1F' ? 150.0 : (fl === '2F' ? 155.0 : 160.0));
          const nArc = 24;
          const balH = Math.min(0.90, effWallH);
          const capH = 0.055;
          const balWallCol = [0.97, 0.96, 0.94, 1.0];
          const railCapCol = [0.46, 0.33, 0.22, 1.0];
          for (let k=0; k<nArc; k++) {
            const a0 = (aStart + (aEnd - aStart) * (k / nArc)) * Math.PI / 180;
            const a1 = (aStart + (aEnd - aStart) * ((k + 1) / nArc)) * Math.PI / 180;
            const r0 = sRin, r1 = sRin;
            const c0 = Math.cos(a0), s0 = Math.sin(a0);
            const c1 = Math.cos(a1), s1 = Math.sin(a1);
            const wallPoly = [
              [scx + (r0 - 0.035) * c0, scz + (r0 - 0.035) * s0],
              [scx + (r1 - 0.035) * c1, scz + (r1 - 0.035) * s1],
              [scx + (r1 + 0.035) * c1, scz + (r1 + 0.035) * s1],
              [scx + (r0 + 0.035) * c0, scz + (r0 + 0.035) * s0]
            ];
            const capPoly = [
              [scx + (r0 - 0.048) * c0, scz + (r0 - 0.048) * s0],
              [scx + (r1 - 0.048) * c1, scz + (r1 - 0.048) * s1],
              [scx + (r1 + 0.048) * c1, scz + (r1 + 0.048) * s1],
              [scx + (r0 + 0.048) * c0, scz + (r0 + 0.048) * s0]
            ];
            pushPrism(wallPoly, y0 - 0.04, y0 + balH, balWallCol, [0.76, 0.74, 0.70, 0.45], true);
            pushPrism(capPoly, y0 + balH, y0 + balH + capH, railCapCol, [0.32, 0.22, 0.14, 0.65], true);
          }
        }
      }

      // ======================================================================
      // 3C. Top-Floor (3F) Roof Ceiling & Brick Parapet for BOTH U11 and U10 (Toggleable via UI!)
      // ======================================================================
      if (fl === '3F' && chkRoofCeiling && this.cameraMode !== 'ortho') {
        const yRoof = y0 + fd.height;
        const roofThick = 0.22;
        const parapetH = 0.40;
        const roofTopCol = extBrickColor;
        const copingCol  = extBrickColor;
        // Separate U11 & U10 3F Roof into South Wing, West Gallery, and North Wing
        // so the Central Courtyards and 3F Setback Terraces remain open to the sky!
        const roofPolys = [
          [[0.14, 0.02], [25.65, 0.02], [25.92, -3.96], [6.12, -3.97]],
          [[0.14, 0.02], [6.12, -3.97], [7.49, -13.88], [2.70, -18.34]],
          [[2.70, -18.34], [7.49, -13.88], [26.96, -18.02], [27.34, -23.59]],
          // U10 3F South Wing Roof (Z = 3.42 .. -0.78, X = 25.81 .. 49.45 flush with East boundary wall)
          [[25.81, 3.42], [49.45, 3.42], [49.45, -0.78], [26.20, -0.78]],
          // U10 3F West Gallery Roof (X = 26.20..31.62 -> 32.76, Z = -0.78 .. -16.78)
          [[26.20, -0.78], [31.62, -0.78], [32.76, -16.78], [27.24, -16.78]],
          // U10 3F North Wing Roof (Z = -16.78 .. -22.48, X = 27.24 .. 49.45)
          [[27.24, -16.78], [49.45, -16.78], [49.45, -22.48], [27.56, -22.48]],
          // U9 3F South, West & North Wing Roofs
          [[49.72, 6.72], [70.65, 6.72], [70.65, 2.52], [49.72, 2.52]],
          [[49.72, 2.52], [55.32, 2.52], [55.32, -14.58], [49.72, -14.58]],
          [[49.72, -14.58], [70.65, -14.58], [70.65, -20.18], [49.72, -20.18]],
          // U8 3F South, West & North Wing Roofs (meeting 12.00° angled East boundary wall)
          [[70.92, 9.67], [95.822, 9.67], [94.930, 5.47], [70.92, 5.47]],
          [[70.92, 5.47], [76.52, 5.47], [76.52, -12.73], [70.92, -12.73]],
          [[70.92, -12.73], [91.060, -12.73], [89.870, -18.33], [70.92, -18.33]]
        ];
        for (const roofPoly of roofPolys) {
          const roofTris = triangulatePolygon2D(roofPoly);
          for (const [i0, i1, i2] of roofTris) {
            const a = roofPoly[i0], b = roofPoly[i1], c = roofPoly[i2];
            pushTri([a[0], yRoof, a[1]], [b[0], yRoof, b[1]], [c[0], yRoof, c[1]], 0, -1, 0, intWhiteColor, false);
            pushTri([a[0], yRoof + roofThick, a[1]], [c[0], yRoof + roofThick, c[1]], [b[0], yRoof + roofThick, b[1]], 0, 1, 0, roofTopCol, true);
          }
          for (let i=0; i<roofPoly.length; i++) {
            const pA = roofPoly[i], pB = roofPoly[(i+1)%roofPoly.length];
            const dx = pB[0] - pA[0], dz = pB[1] - pA[1];
            const L = Math.hypot(dx, dz) || 1;
            const nx = (-dz / L) * 0.14, nz = (dx / L) * 0.14;
            const paraPoly = [
              [pA[0] - dx*0.005 + nx, pA[1] - dz*0.005 + nz],
              [pB[0] + dx*0.005 + nx, pB[1] + dz*0.005 + nz],
              [pB[0] + dx*0.005 - nx, pB[1] + dz*0.005 - nz],
              [pA[0] - dx*0.005 - nx, pA[1] - dz*0.005 - nz]
            ];
            pushExteriorWallPrism('3F', paraPoly, yRoof, yRoof + parapetH, extBrickColor, extBrickColor, copingCol, [0.48, 0.44, 0.40, 0.5]);
          }
        }
      }

      // Elevator Cars & Brushed Champagne Frames for U11, U10, U9 & U8
      if (chkSlabs) {
        const elevU11 = [[4.10, -12.75], [5.90, -12.75], [5.90, -11.20], [4.10, -11.20]];
        const elevU10 = [[29.67, -16.55], [31.12, -16.55], [31.12, -15.01], [29.67, -15.01]];
        const elevU9  = [[52.35, -14.37], [53.85, -14.37], [53.85, -13.10], [52.35, -13.10]];
        const elevU8  = [[73.55, -12.53], [75.05, -12.53], [75.05, -11.07], [73.55, -11.07]];
        for (const ePoly of [elevU11, elevU10, elevU9, elevU8]) {
          pushPrism(ePoly, y0 - 0.10, y0 - 0.003, [0.85, 0.82, 0.76, 6.0], [0.65, 0.55, 0.40, 0.9], false);
        }
      }

      // CAD Vector Lines on Floor Slab (U11, U10, U9 & U8!)
      if (chkCad) {
        const yCad = y0 + 0.022;
        if (fd.cad_lines) {
          for (const seg of fd.cad_lines) {
            for (let i=0; i<seg.length-1; i++) {
              pushLine([seg[i][0], yCad, seg[i][1]], [seg[i+1][0], yCad, seg[i+1][1]], [0.35, 0.40, 0.46, 0.50]);
            }
          }
        }
        for (const extraFlData of [u10FloorData, u9FloorData, u8FloorData]) {
          if (extraFlData?.cad_lines) {
            for (const seg of extraFlData.cad_lines) {
              pushLine([seg[0][0], yCad, seg[0][1]], [seg[1][0], yCad, seg[1][1]], [0.25, 0.52, 0.68, 0.55]);
            }
          }
        }
      }
    }

    // ========================================================================
    // 3C. Dynamic Window-Driven 3D Privacy Sightline & 2D Occlusion Raycast Engine
    // Automatically syncs with all window openings in U11, U10, U9 & U8 (dynamicExteriorWindows)
    // and tests every ray against solid exterior wall spans (exteriorWallSegments2D) & opposite-bank villa footprints!
    // ========================================================================
    if (this.showPrivacyRays && privacyHotspotWindows.length > 0 && dynamicExteriorWindows.length > 0) {
      const segsIntersect2D = (ax, az, bx, bz, cx, cz, dx, dz) => {
        const ccw = (p1x, p1z, p2x, p2z, p3x, p3z) => (p3z - p1z) * (p2x - p1x) > (p2z - p1z) * (p3x - p1x);
        return (ccw(ax, az, cx, cz, dx, dz) !== ccw(bx, bz, cx, cz, dx, dz)) &&
               (ccw(ax, az, bx, bz, cx, cz) !== ccw(ax, az, bx, bz, dx, dz));
      };

      const isSightlineOccluded = (tgt, w) => {
        // Start slightly outside the window glazing face (10cm outward along window normal) so it doesn't self-intersect
        const ax = tgt.x + tgt.nx * 0.10, az = tgt.z + tgt.nz * 0.10;
        const bx = w.x + (w.nx || 0) * 0.10, bz = w.z + (w.nz || 0) * 0.10;
        // 1. Check against all solid exterior wall segments on the target window's floor
        for (const seg of exteriorWallSegments2D) {
          if (seg.fl !== tgt.fl) continue;
          if (segsIntersect2D(ax, az, bx, bz, seg.x1, seg.z1, seg.x2, seg.z2)) return true;
        }
        // 2. Check against opposite-bank Tianyuan Villa building footprints (excluding the source villa itself)
        for (const vf of tianyuanFootprints2D) {
          if (vf.code === w.code) continue;
          const poly = vf.poly;
          for (let i = 0; i < poly.length; i++) {
            const p1 = poly[i], p2 = poly[(i + 1) % poly.length];
            if (segsIntersect2D(ax, az, bx, bz, p1[0], p1[1], p2[0], p2[1])) return true;
          }
        }
        return false;
      };

      // 1. Front-Row Direct Window-to-Window Sightlines (31幢 ~ 36幢 -> actual South & West windows of U11, U10, U9 & U8)
      const riverFacingWindows = dynamicExteriorWindows.filter(win => win.nz > 0.35 || win.nx < -0.35);
      for (const tgt of riverFacingWindows) {
        const rayCol = (tgt.fl === 1)
          ? [0.98, 0.68, 0.18, 0.78] // 1F: Amber/Orange (filtered by riverbank trees & clipped hedges)
          : (tgt.fl === 2)
          ? [0.98, 0.24, 0.20, 0.92] // 2F: High-sensitivity Red-Orange
          : [0.98, 0.16, 0.16, 0.96]; // 3F: Critical-sensitivity Crimson Red

        const candidates = privacyHotspotWindows
          .filter(w => {
            if (!w.isFrontRow || w.code === '41幢' || w.code === '40幢') return false;
            if (w.fl !== Math.max(2, tgt.fl)) return false;
            const dx = w.x - tgt.x, dz = w.z - tgt.z;
            const dist = Math.hypot(dx, dz) || 1;
            const ux = dx / dist, uz = dz / dist;
            // Ensure ray exits forward out of the U11~U8 window face AND forward out of the Tianyuan Villa window face
            const dotTarget = ux * tgt.nx + uz * tgt.nz;
            const dotSource = (-ux) * (w.nx || 0) + (-uz) * (w.nz || -1);
            if (dotTarget < 0.20 || dotSource < 0.45) return false;
            return !isSightlineOccluded(tgt, w);
          })
          .map(w => ({ w, dist: Math.hypot(w.x - tgt.x, w.z - tgt.z) }))
          .sort((a, b) => a.dist - b.dist)
          .slice(0, 2);

        for (const { w } of candidates) {
          pushLine([w.x, w.y, w.z], [tgt.x, tgt.y, tgt.z], rayCol);
        }
      }

      // 2. Second-Row Gap Sightlines (41幢 through 32/33幢 gap & 40幢 through 33/34幢 gap -> closest unoccluded 3F South window)
      const south3FWindows = riverFacingWindows.filter(win => win.fl === 3 && win.nz > 0.35);
      for (const w of privacyHotspotWindows.filter(item => (item.code === '41幢' || item.code === '40幢') && item.fl === 3 && item.face === '北立面')) {
        const unoccluded3F = south3FWindows
          .filter(tgt => !isSightlineOccluded(tgt, w))
          .map(tgt => ({ tgt, dist: Math.hypot(w.x - tgt.x, w.z - tgt.z) }))
          .sort((a, b) => a.dist - b.dist);
        if (unoccluded3F.length > 0) {
          const { tgt } = unoccluded3F[0];
          pushLine([w.x, w.y, w.z], [tgt.x, tgt.y, tgt.z], [0.95, 0.52, 0.16, 0.85]);
        }
      }

      // 3. Dynamic Green Parapet Cut-Off Rays (屋顶女儿墙视线遮挡包络线: proving 3F opposite windows shoot into the sky above central courtyards)
      const fl3 = this.data.floors['3F'];
      const yParapet = fl3.elevation + fl3.height + 0.35;
      const parapetChecks = [
        { code: '32幢', px: 13.5, pz: -3.96, cyNorthZ: -13.88 },
        { code: '34幢', px: 38.5, pz: -0.78, cyNorthZ: -16.78 },
        { code: '35幢', px: 61.5, pz:  2.52, cyNorthZ: -14.58 },
        { code: '36幢', px: 82.0, pz:  5.47, cyNorthZ: -12.73 }
      ];
      for (const pc of parapetChecks) {
        const srcWin = privacyHotspotWindows.find(w => w.code === pc.code && w.fl === 3 && w.face === '北立面');
        if (srcWin && yParapet > srcWin.y) {
          const slope = (yParapet - srcWin.y) / (srcWin.z - pc.pz);
          const yHitSky = yParapet + slope * (pc.pz - pc.cyNorthZ);
          pushLine([srcWin.x, srcWin.y, srcWin.z], [pc.px, yParapet, pc.pz], [0.22, 0.88, 0.52, 0.88]);
          pushLine([pc.px, yParapet, pc.pz], [pc.px, yHitSky, pc.cyNorthZ], [0.16, 0.95, 0.48, 0.96]);
        }
      }
    }

    // ========================================================================
    // 4. Continuous Walkable Staircases with Solid 3D Helical Balustrades & Handrails (BOTH U11 and U10)
    // ========================================================================
    if (chkStairs) {
      // Helper: Build a continuous sloped 3D balustrade wall segment + solid top handrail cap between (pA at yBotA..yTopA) and (pB at yBotB..yTopB)
      // Supports exact per-vertex radial normals (rNxA,rNzA at A and rNxB,rNzB at B) so adjacent helical segments share 100% identical vertices!
      const pushSlopedBalustradeSegment = (pA, pB, rNxA, rNzA, rNxB, rNzB, halfThick, yBotA, yBotB, yTopA, yTopB, wallCol, capCol, drawStartCap = false, drawEndCap = false) => {
        const oxA = rNxA * halfThick, ozA = rNzA * halfThick;
        const oxB = rNxB * halfThick, ozB = rNzB * halfThick;
        const A_in  = [pA[0] - oxA, pA[1] - ozA], A_out = [pA[0] + oxA, pA[1] + ozA];
        const B_in  = [pB[0] - oxB, pB[1] - ozB], B_out = [pB[0] + oxB, pB[1] + ozB];
        const tx = pB[0] - pA[0], tz = pB[1] - pA[1];
        const tL = Math.hypot(tx, tz) || 1;
        const ux = tx / tL, uz = tz / tL;
        const mNx = 0.5 * (rNxA + rNxB), mNz = 0.5 * (rNzA + rNzB);
        // 1. Solid continuous sloped balustrade parapet wall
        pushQuad([A_out[0], yBotA, A_out[1]], [B_out[0], yBotB, B_out[1]], [B_out[0], yTopB, B_out[1]], [A_out[0], yTopA, A_out[1]],  mNx, 0,  mNz, wallCol, true);
        pushQuad([B_in[0],  yBotB, B_in[1]],  [A_in[0],  yBotA, A_in[1]],  [A_in[0],  yTopA, A_in[1]],  [B_in[0],  yTopB, B_in[1]],  -mNx, 0, -mNz, wallCol, true);
        pushQuad([A_in[0],  yBotA, A_in[1]],  [B_in[0],  yBotB, B_in[1]],  [B_out[0], yBotB, B_out[1]], [A_out[0], yBotA, A_out[1]], 0, -1, 0, wallCol, false);
        if (drawStartCap) {
          pushQuad([A_in[0],  yBotA, A_in[1]],  [A_out[0], yBotA, A_out[1]], [A_out[0], yTopA, A_out[1]], [A_in[0],  yTopA, A_in[1]], -ux, 0, -uz, wallCol, false);
        }
        if (drawEndCap) {
          pushQuad([B_out[0], yBotB, B_out[1]], [B_in[0],  yBotB, B_in[1]],  [B_in[0],  yTopB, B_in[1]],  [B_out[0], yTopB, B_out[1]],  ux, 0,  uz, wallCol, false);
        }
        // 2. Solid Continuous Sloped 3D Walnut / Bronze Handrail Cap (skipped when capCol === null for Frameless Glass Balustrade!)
        if (capCol) {
          const capHalf = halfThick + 0.014;
          const cxA = rNxA * capHalf, czA = rNzA * capHalf;
          const cxB = rNxB * capHalf, czB = rNzB * capHalf;
          const CA_in = [pA[0] - cxA, pA[1] - czA], CA_out = [pA[0] + cxA, pA[1] + czA];
          const CB_in = [pB[0] - cxB, pB[1] - czB], CB_out = [pB[0] + cxB, pB[1] + czB];
          const cH = 0.065;
          pushQuad([CA_out[0], yTopA, CA_out[1]], [CB_out[0], yTopB, CB_out[1]], [CB_out[0], yTopB + cH, CB_out[1]], [CA_out[0], yTopA + cH, CA_out[1]],  mNx, 0,  mNz, capCol, true);
          pushQuad([CB_in[0],  yTopB, CB_in[1]],  [CA_in[0],  yTopA, CA_in[1]],  [CA_in[0],  yTopA + cH, CA_in[1]],  [CB_in[0],  yTopB + cH, CB_in[1]],  -mNx, 0, -mNz, capCol, true);
          pushQuad([CA_out[0], yTopA + cH, CA_out[1]], [CB_out[0], yTopB + cH, CB_out[1]], [CB_in[0], yTopB + cH, CB_in[1]], [CA_in[0], yTopA + cH, CA_in[1]], 0, 1, 0, capCol, true);
          pushQuad([CA_in[0],  yTopA, CA_in[1]],  [CB_in[0],  yTopB, CB_in[1]],  [CB_out[0], yTopB, CB_out[1]], [CA_out[0], yTopA, CA_out[1]], 0, -1, 0, capCol, false);
          if (drawStartCap) {
            pushQuad([CA_in[0],  yTopA, CA_in[1]],  [CA_out[0], yTopA, CA_out[1]], [CA_out[0], yTopA + cH, CA_out[1]], [CA_in[0], yTopA + cH, CA_in[1]], -ux, 0, -uz, capCol, false);
          }
          if (drawEndCap) {
            pushQuad([CB_out[0], yTopB, CB_out[1]], [CB_in[0],  yTopB, CB_in[1]],  [CB_in[0],  yTopB + cH, CB_in[1]],  [CB_out[0], yTopB + cH, CB_out[1]],  ux, 0,  uz, capCol, false);
          }
          pushLine([CA_out[0], yTopA + cH, CA_out[1]], [CB_out[0], yTopB + cH, CB_out[1]], [0.32, 0.22, 0.14, 0.75]);
          pushLine([CA_in[0],  yTopA + cH, CA_in[1]],  [CB_in[0],  yTopB + cH, CB_in[1]],  [0.32, 0.22, 0.14, 0.75]);
        } else {
          pushLine([pA[0], yTopA, pA[1]], [pB[0], yTopB, pB[1]], [0.86, 0.96, 0.99, 0.72]);
        }
      };

      const stairBalWallCol = [0.97, 0.96, 0.94, 1.0]; // Gallery warm white solid parapet
      const stairRailCapCol = [0.46, 0.33, 0.22, 1.0]; // Sculpted walnut/bronze solid handrail cap

      for (const st of this.data.stairs) {
        if (this.floorFilter !== 'ALL') {
          const flElev = this.data.floors[this.floorFilter].elevation;
          const flTop = flElev + this.data.floors[this.floorFilter].height;
          if (st.y_end <= flElev + 0.05 || st.y_start >= flTop - 0.05) {
            if (!(this.floorFilter === 'B1' && st.id.includes('B1_to_1F'))) continue;
          }
        }
        const isMain = st.type === 'spiral';
        const isExtCourtyard = st.type === 'exterior_straight';
        const isU10Main = st.id.includes('u10_nw_stair');
        const stepCol = isExtCourtyard
          ? [0.25, 0.27, 0.29, 9.0]
          : ((isMain || isU10Main) ? [0.90, 0.84, 0.74, 1.0] : [0.88, 0.87, 0.84, 1.0]);
        const edgeCol = isExtCourtyard
          ? [0.20, 0.22, 0.24, 0.75]
          : ((isMain || isU10Main) ? [0.58, 0.48, 0.36, 0.85] : [0.52, 0.52, 0.50, 0.75]);
        const nSteps = st.steps.length;
        for (let i = 0; i < nSteps; i++) {
          const s = st.steps[i];
          const prevS = (i > 0) ? st.steps[i - 1] : null;
          const nextS = (i + 1 < nSteps) ? st.steps[i + 1] : null;
          pushPrism(s.poly, s.y_bottom - 0.10, s.y_top, stepCol, edgeCol, true);
          // Every step rises continuously from s.y_bottom at its entry edge (A) to s.y_top at its exit edge (B).
          // Because s.y_top(i) === s.y_bottom(i+1), yBotB(i) === yBotA(i+1) and yTopB(i) === yTopA(i+1)!
          const yBotA = s.y_bottom - 0.12;
          const yBotB = s.y_top - 0.12;
          const yTopA = s.y_bottom + 0.88;
          const yTopB = s.y_top + 0.88;

          if (isMain) {
            // U11 Main Spiral Staircase: continuous sloped helical balustrade & handrail (斜向连续螺旋实体护栏与扶手)!
            // Compute exact radial normals at vertex 0 (A) and vertex 1 (B) around spiral center (5.250, -16.149)
            // so step i's end vertices at B match step i+1's start vertices at A to 0.000mm!
            const scx = 5.250, scz = -16.149;
            const pIn0  = s.poly[0], pOut0 = s.poly[1], pOut1 = s.poly[2], pIn1 = s.poly[3];
            const dxA = pOut0[0] - scx, dzA = pOut0[1] - scz;
            const lA = Math.hypot(dxA, dzA) || 1;
            const rNxA = dxA / lA, rNzA = dzA / lA;
            const dxB = pOut1[0] - scx, dzB = pOut1[1] - scz;
            const lB = Math.hypot(dxB, dzB) || 1;
            const rNxB = dxB / lB, rNzB = dzB / lB;
            const isFirst = (i === 0), isLast = (i === nSteps - 1);
            pushSlopedBalustradeSegment(pOut0, pOut1, rNxA, rNzA, rNxB, rNzB, 0.036, yBotA, yBotB, yTopA, yTopB, stairBalWallCol, stairRailCapCol, isFirst, isLast);
            pushSlopedBalustradeSegment(pIn0,  pIn1,  rNxA, rNzA, rNxB, rNzB, 0.036, yBotA, yBotB, yTopA, yTopB, stairBalWallCol, stairRailCapCol, isFirst, isLast);
          } else if (isExtCourtyard && s.has_rail && s.rail_p0 && s.rail_p1) {
            // Courtyard Exterior Straight Stairs (1F->2F): stepped white real-stone-paint stringer + 3-mode balustrade with monolithic continuous handrail (matId=1.0)!
            const p0 = s.rail_p0, p1 = s.rail_p1;
            const rnx = s.rail_nx || -1.0, rnz = s.rail_nz || 0.0;
            const isFirst = !prevS || !prevS.has_rail;
            const isLast  = !nextS || !nextS.has_rail;
            const bMode = this.balustradeStyleMode || 'u2_steel';
            const postCol = (bMode === 'wood') ? [0.56, 0.33, 0.18, 1.0] : [0.97, 0.97, 0.96, 1.0];
            const monoCapCol = [0.64, 0.35, 0.19, 1.0];
            pushPrism(s.poly, st.y_start, s.y_bottom - 0.08, [0.99, 0.99, 0.98, 8.0], [0.78, 0.77, 0.74, 0.45], false);
            if (bMode === 'glass') {
              pushSlopedBalustradeSegment(p0, p1, rnx, rnz, rnx, rnz, 0.012, s.y_bottom, s.y_top, yTopA + 0.04, yTopB + 0.04, [0.70, 0.85, 0.90, 0.34], null, isFirst, isLast);
            } else {
              pushBox(p0[0], s.y_top, p0[1], 0.026, 0.026, 0.88, 0, postCol, null, false);
              pushBox(0.5*(p0[0]+p1[0]), 0.5*(s.y_bottom+s.y_top), 0.5*(p0[1]+p1[1]), 0.022, 0.022, 0.88, 0, postCol, null, false);
              pushSlopedBalustradeSegment(p0, p1, rnx, rnz, rnx, rnz, 0.026, yTopA, yTopB, yTopA + 0.04, yTopB + 0.04, postCol, monoCapCol, isFirst, isLast);
            }
          } else if (s.has_rail && s.rail_p0 && s.rail_p1) {
            // Indoor U-Staircases (U11 SE Secondary Stair, U10 NW Main Stair, U10 SW Secondary Stair): continuous sloped balustrade & walnut handrail!
            const rnx = s.rail_nx || 0.0, rnz = s.rail_nz || 1.0;
            const sameFlightPrev = prevS && prevS.has_rail && Math.abs((prevS.rail_nx || 0) - rnx) < 0.25 && Math.abs((prevS.rail_nz || 0) - rnz) < 0.25;
            const sameFlightNext = nextS && nextS.has_rail && Math.abs((nextS.rail_nx || 0) - rnx) < 0.25 && Math.abs((nextS.rail_nz || 0) - rnz) < 0.25;
            pushSlopedBalustradeSegment(s.rail_p0, s.rail_p1, rnx, rnz, rnx, rnz, 0.032, yBotA, yBotB, yTopA, yTopB, stairBalWallCol, stairRailCapCol, !sameFlightPrev, !sameFlightNext);
          }
        }
      }

      const flPairs = [
        ['B1', this.data.floors['B1'].elevation, this.data.floors['1F'].elevation],
        ['1F', this.data.floors['1F'].elevation, this.data.floors['2F'].elevation],
        ['2F', this.data.floors['2F'].elevation, this.data.floors['3F'].elevation]
      ];
      for (const [fKey, yA, yB] of flPairs) {
        if (this.floorFilter !== 'ALL' && this.floorFilter !== fKey) continue;
        // Photo 10 Inspiration: Minimalist Dark-Bronze Stairwell Wall Sconce with Upward & Downward Warm Light-Cone Wash!
        const flWallH = this.data.floors[fKey]?.height || (yB - yA);
        const effStairWallH = (this.cameraMode === 'walk') ? flWallH : Math.min(flWallH, this.wallCutHeight);
        if (chkStruct && chkExt && effStairWallH >= 1.95) {
          const wySconce = yA + Math.min(1.65, effStairWallH * 0.50);
          const upH   = Math.min(0.76, (yA + effStairWallH - 0.10) - (wySconce + 0.14));
          const downH = Math.min(0.72, (wySconce - (yA + 0.10)));
          const pushStairwellUpDownSconce = (wx, wy, wz, wallNx, wallNz) => {
            if (upH < 0.18 || downH < 0.18) return;
            const rotDeg = Math.atan2(wallNx, wallNz) * 180 / Math.PI;
            const tx = -wallNz, tz = wallNx;
            pushBox(wx + wallNx * 0.052, wy, wz + wallNz * 0.052, 0.12, 0.10, 0.14, rotDeg, [0.16, 0.15, 0.14, 1.0], [0.08, 0.08, 0.08, 0.9], false);
            pushBox(wx + wallNx * 0.052, wy + 0.138, wz + wallNz * 0.052, 0.10, 0.08, 0.012, rotDeg, [1.0, 0.96, 0.84, 1.0], null, false);
            pushBox(wx + wallNx * 0.052, wy - 0.008, wz + wallNz * 0.052, 0.10, 0.08, 0.012, rotDeg, [1.0, 0.96, 0.84, 1.0], null, false);
            const wEps = 0.012;
            const bx = wx + wallNx * wEps, bz = wz + wallNz * wEps;
            const outerBeamCol = [1.0, 0.91, 0.68, 0.34];
            const innerCoreCol = [1.0, 0.96, 0.82, 0.56];
            const fanW = 0.36, coreW = 0.18;
            pushTri([bx - tx*0.04, wy + 0.14, bz - tz*0.04], [bx + tx*fanW, wy + 0.14 + upH, bz + tz*fanW], [bx - tx*fanW, wy + 0.14 + upH, bz - tz*fanW], wallNx, 0, wallNz, outerBeamCol, false);
            pushTri([bx, wy + 0.14, bz], [bx + tx*coreW, wy + 0.14 + upH*0.66, bz + tz*coreW], [bx - tx*coreW, wy + 0.14 + upH*0.66, bz - tz*coreW], wallNx, 0, wallNz, innerCoreCol, false);
            pushTri([bx - tx*0.04, wy, bz - tz*0.04], [bx - tx*fanW, wy - downH, bz - tz*fanW], [bx + tx*fanW, wy - downH, bz + tz*fanW], wallNx, 0, wallNz, outerBeamCol, false);
            pushTri([bx, wy, bz], [bx - tx*coreW, wy - downH*0.66, bz - tz*coreW], [bx + tx*coreW, wy - downH*0.66, bz + tz*coreW], wallNx, 0, wallNz, innerCoreCol, false);
          };
          // Stairwell wall sconces mounted strictly on the interior face of stairwell walls (zero exterior protrusion!)
          pushStairwellUpDownSconce(2.420, wySconce, -14.655,  0.9905,  0.1377);
          pushStairwellUpDownSconce(4.546, wySconce, -18.520,  0.2087,  0.9780);
          pushStairwellUpDownSconce(23.50, wySconce,  -0.180,  0.0,    -1.0);
          pushStairwellUpDownSconce(29.54, wySconce, -22.300,  0.0,     1.0);
          pushStairwellUpDownSconce(27.32, wySconce,   3.240,  0.0,    -1.0);
          // U9 & U8 Stairwell Wall Sconces (Photo 10 inspiration)
          pushStairwellUpDownSconce(51.90, wySconce, -19.980,  0.0,     1.0);
          pushStairwellUpDownSconce(51.90, wySconce,   6.500,  0.0,    -1.0);
          pushStairwellUpDownSconce(73.10, wySconce, -18.120,  0.0,     1.0);
          pushStairwellUpDownSconce(73.10, wySconce,   9.450,  0.0,    -1.0);
        }
      }
    }

    // ========================================================================
    // 5. Multi-Style Switchable Interior Soft Furnishings (Zero Structural Modification, Zero Wall Overlap!)
    //    Supports: 'u2_model' (U2样板房实拍高定风格) | 'design' (装饰参考稿261022原配风格) | 'minimal' (极简留白画廊风)
    // ========================================================================
    if (chkFurn) {
      const styleMode = this.furnitureStyleMode || 'u2_model';
      const isU2Style = (styleMode === 'u2_model');
      const isMinStyle = (styleMode === 'minimal');

      // Append representative luxury soft furnishings for U10, U9 & U8 (strictly centered inside true CAD rooms with zero wall overlap!)
      const y1F_f = this.data.floors['1F'].elevation;
      const y2F_f = this.data.floors['2F'].elevation;
      const y3F_f = this.data.floors['3F'].elevation;
      const yB1_f = this.data.floors['B1'].elevation;
      const u10U9U8Furniture = [
        // U10 Soft Furnishings (100% Wall-Backed Headboards & Courtyard-Facing Sofas per CAD)
        { id: 'u10_1f_sofa',      floor: '1F', category: 'sofa',  x: 37.50, y: y1F_f, z: 1.65,  w: 3.1, d: 1.9, h: 0.82, rot: 180 },
        { id: 'u10_1f_dining',    floor: '1F', category: 'table', x: 46.72, y: y1F_f, z: 0.65,  w: 1.9, d: 1.9, h: 0.78, rot: 0 },
        { id: 'u10_2f_bed_n1',    floor: '2F', category: 'bed',   x: 38.25, y: y2F_f, z: -20.30,w: 1.85, d: 1.95, h: 0.95, rot: 90 },
        { id: 'u10_2f_bed_n2',    floor: '2F', category: 'bed',   x: 44.30, y: y2F_f, z: -20.30,w: 1.85, d: 1.95, h: 0.95, rot: 90 },
        { id: 'u10_2f_bed_s1',    floor: '2F', category: 'bed',   x: 32.80, y: y2F_f, z: 2.10,  w: 1.9, d: 1.95, h: 0.95, rot: 180 },
        { id: 'u10_2f_bed_s2',    floor: '2F', category: 'bed',   x: 44.05, y: y2F_f, z: 1.45,  w: 1.9, d: 1.95, h: 0.95, rot: 90 },
        { id: 'u10_3f_master',    floor: '3F', category: 'bed',   x: 39.75, y: y3F_f, z: -21.15,w: 2.0, d: 2.0, h: 1.02, rot: 0 },
        { id: 'u10_3f_south_bed', floor: '3F', category: 'bed',   x: 38.60, y: y3F_f, z: 2.10,  w: 1.9, d: 1.95, h: 0.95, rot: 180 },
        { id: 'u10_b1_table',     floor: 'B1', category: 'table', x: 38.52, y: yB1_f, z: -14.8, w: 2.0, d: 2.0, h: 0.78, rot: 0 },
        // U9 Soft Furnishings (per U9 平面示意.pdf P1-P4, 100% Wall-Backed Headboards & Courtyard-Facing Sofas)
        { id: 'u9_1f_sofa_w',     floor: '1F', category: 'sofa',  x: 60.40, y: y1F_f, z: 4.85,  w: 3.0, d: 1.8, h: 0.82, rot: 180 },
        { id: 'u9_1f_sofa_e',     floor: '1F', category: 'sofa',  x: 68.45, y: y1F_f, z: 4.85,  w: 2.2, d: 1.6, h: 0.82, rot: 180 },
        { id: 'u9_1f_dining',     floor: '1F', category: 'table', x: 52.00, y: y1F_f, z: -3.05, w: 1.8, d: 1.8, h: 0.78, rot: 0 },
        { id: 'u9_2f_family_sofa',floor: '2F', category: 'sofa',  x: 51.05, y: y2F_f, z: -6.35, w: 2.6, d: 1.6, h: 0.82, rot: -90 },
        { id: 'u9_2f_bed_n1',     floor: '2F', category: 'bed',   x: 59.80, y: y2F_f, z: -18.00,w: 1.85, d: 1.95, h: 0.95, rot: 90 },
        { id: 'u9_2f_bed_n2',     floor: '2F', category: 'bed',   x: 62.25, y: y2F_f, z: -18.00,w: 1.85, d: 1.95, h: 0.95, rot: -90 },
        { id: 'u9_2f_bed_s1',     floor: '2F', category: 'bed',   x: 65.10, y: y2F_f, z: 4.65,  w: 1.9, d: 1.95, h: 0.95, rot: 90 },
        { id: 'u9_3f_master_n',   floor: '3F', category: 'bed',   x: 61.55, y: y3F_f, z: -18.85,w: 2.0, d: 2.0, h: 1.02, rot: 0 },
        { id: 'u9_3f_bed_w',      floor: '3F', category: 'bed',   x: 51.05, y: y3F_f, z: -4.45, w: 1.85, d: 1.95, h: 0.95, rot: -90 },
        { id: 'u9_3f_bed_s',      floor: '3F', category: 'bed',   x: 60.85, y: y3F_f, z: 5.40,  w: 1.9, d: 1.95, h: 0.95, rot: 180 },
        { id: 'u9_b1_table',      floor: 'B1', category: 'table', x: 59.50, y: yB1_f, z: -1.75, w: 2.0, d: 2.0, h: 0.78, rot: 0 },
        // U8 Soft Furnishings (per U8 平面示意.pdf P1-P4, 100% Wall-Backed Headboards & Courtyard-Facing Sofas)
        { id: 'u8_1f_sofa_w',     floor: '1F', category: 'sofa',  x: 81.80, y: y1F_f, z: 7.80,  w: 3.1, d: 1.85, h: 0.82, rot: 180 },
        { id: 'u8_1f_sofa_e',     floor: '1F', category: 'sofa',  x: 91.50, y: y1F_f, z: 7.80,  w: 2.4, d: 1.7, h: 0.82, rot: 180 },
        { id: 'u8_1f_dining',     floor: '1F', category: 'table', x: 73.10, y: y1F_f, z: -0.05, w: 1.8, d: 1.8, h: 0.78, rot: 0 },
        { id: 'u8_2f_family_sofa',floor: '2F', category: 'sofa',  x: 72.05, y: y2F_f, z: -4.05, w: 2.6, d: 1.6, h: 0.82, rot: -90 },
        { id: 'u8_2f_bed_n1',     floor: '2F', category: 'bed',   x: 80.45, y: y2F_f, z: -16.20,w: 1.85, d: 1.95, h: 0.95, rot: 90 },
        { id: 'u8_2f_bed_n2',     floor: '2F', category: 'bed',   x: 85.05, y: y2F_f, z: -16.20,w: 1.85, d: 1.95, h: 0.95, rot: 90 },
        { id: 'u8_2f_bed_s1',     floor: '2F', category: 'bed',   x: 85.05, y: y2F_f, z: 8.35,  w: 1.9, d: 1.95, h: 0.95, rot: 180 },
        { id: 'u8_3f_master_n',   floor: '3F', category: 'bed',   x: 79.60, y: y3F_f, z: -17.00,w: 2.0, d: 2.0, h: 1.02, rot: 0 },
        { id: 'u8_3f_bed_w',      floor: '3F', category: 'bed',   x: 72.20, y: y3F_f, z: -3.30, w: 1.85, d: 1.95, h: 0.95, rot: -90 },
        { id: 'u8_3f_bed_s',      floor: '3F', category: 'bed',   x: 82.20, y: y3F_f, z: 8.35,  w: 1.9, d: 1.95, h: 0.95, rot: 180 },
        { id: 'u8_b1_table',      floor: 'B1', category: 'table', x: 80.50, y: yB1_f, z: 0.95,  w: 2.0, d: 2.0, h: 0.78, rot: 0 }
      ];
      const allFurn = this.data.furniture.concat(u10U9U8Furniture);

      for (const f of allFurn) {
        if (this.floorFilter !== 'ALL' && this.floorFilter !== f.floor) continue;
        const rgb = hexToRgb(f.color || '#F7F5F0');
        const isSel = (f.id === this.selectedFurnitureId);
        const softEdge = [0.68, 0.65, 0.60, 0.45];
        const rad = (f.rot || 0) * Math.PI / 180;
        const cos = Math.cos(rad), sin = Math.sin(rad);
        const toW = (lx, lz) => [f.x + lx * cos - lz * sin, f.z + lx * sin + lz * cos];

        if (f.id.includes('parasol')) {
          pushRefinedParasolSet(f.x, f.y + 0.07, f.z, 0.82, f.rot, isSel);
        } else if (f.category === 'piano') {
          pushGrandPiano(f.x, f.y, f.z, f.w, f.d, f.h, f.rot, isSel);
        } else if (f.category === 'sofa') {
          const isCompactBench = (f.id === '1f_entry_bench' || Math.min(f.w, f.d) < 1.75);
          if (isCompactBench) {
            // Compact Foyer Bench / Master Bedroom Lounge Chair (strictly within f.w × f.d, no overflowing coffee table or stools!)
            if (isU2Style && f.id === '3f_master_lounge') {
              // Photo 2 Olive-Green Tufted Pumpkin Lounge Chair & Ottoman inside 3F Master Suite
              pushCylinder(f.x, f.y, f.y + 0.66, f.z - 0.15, 0.50, 0.45, 12, [0.38, 0.48, 0.14, 1.0], null);
              pushCylinder(f.x, f.y, f.y + 0.35, f.z + 0.45, 0.32, 0.30, 12, [0.42, 0.52, 0.16, 1.0], null);
            } else {
              pushBox(f.x, f.y, f.z, f.w * 0.92, f.d * 0.85, 0.42, f.rot, [0.96, 0.95, 0.92, 1.0], softEdge, isSel);
              const [bx, bz] = toW(0, -f.d * 0.32);
              pushBox(bx, f.y + 0.42, bz, f.w * 0.90, f.d * 0.22, 0.30, f.rot, [0.94, 0.93, 0.89, 1.0], softEdge, isSel);
            }
          } else if (isU2Style) {
            // U2 Model Unit Style (Photos 1, 5, 7): All sub-parts (rug, bouclé sofa, brass lotus table, 2 walnut stools) strictly bounded within f.w × f.d!
            pushBox(f.x, f.y + 0.005, f.z, f.w * 1.00, f.d * 1.00, 0.016, f.rot, [0.87, 0.85, 0.81, 1.0], [0.72, 0.70, 0.66, 0.4], false);
            const [sx0, sz0] = toW(0, -f.d * 0.12);
            pushBox(sx0, f.y + 0.02, sz0, f.w * 0.94, f.d * 0.64, 0.40, f.rot, [0.96, 0.95, 0.92, 1.0], softEdge, isSel);
            const [bx, bz] = toW(0, -f.d * 0.36);
            pushBox(bx, f.y + 0.42, bz, f.w * 0.94, f.d * 0.18, 0.36, f.rot, [0.95, 0.94, 0.91, 1.0], softEdge, isSel);
            const [axL, azL] = toW(-f.w * 0.41, -f.d * 0.12);
            const [axR, azR] = toW( f.w * 0.41, -f.d * 0.12);
            pushBox(axL, f.y + 0.42, azL, f.w * 0.12, f.d * 0.60, 0.28, f.rot, [0.95, 0.94, 0.91, 1.0], softEdge, isSel);
            pushBox(axR, f.y + 0.42, azR, f.w * 0.12, f.d * 0.60, 0.28, f.rot, [0.95, 0.94, 0.91, 1.0], softEdge, isSel);
            // Sculptural Brass Lotus-Leaf Coffee Table (Photo 7) + 2 Walnut Round Stools (strictly inside +0.46*d)
            const [tx, tz] = toW(0, f.d * 0.26);
            const brassGold = [0.78, 0.65, 0.38, 1.0];
            for (let p = 0; p < 5; p++) {
              const pa = (p / 5) * Math.PI * 2;
              pushCylinder(tx + 0.14 * Math.cos(pa), f.y + 0.30, f.y + 0.34, tz + 0.14 * Math.sin(pa), 0.24, 0.26, 10, brassGold, null);
            }
            pushCylinder(tx, f.y, f.y + 0.30, tz, 0.07, 0.045, 8, brassGold, null);
            const [s1x, s1z] = toW(-f.w * 0.24, f.d * 0.32);
            const [s2x, s2z] = toW( f.w * 0.24, f.d * 0.32);
            for (const [sx, sz] of [[s1x, s1z], [s2x, s2z]]) {
              pushCylinder(sx, f.y, f.y + 0.36, sz, 0.15, 0.15, 10, [0.44, 0.28, 0.18, 1.0], null);
              pushCylinder(sx, f.y + 0.36, f.y + 0.42, sz, 0.16, 0.16, 12, [0.96, 0.95, 0.92, 1.0], null);
            }
          } else if (isMinStyle) {
            // Minimalist Gallery Style: Bleached Linen Low Modular Sofa + Monolithic Roman Travertine Plinth Coffee Table
            pushBox(f.x, f.y, f.z, f.w * 0.96, f.d * 0.86, 0.36, f.rot, [0.93, 0.92, 0.89, 1.0], softEdge, isSel);
            const [bx, bz] = toW(0, -f.d * 0.33);
            pushBox(bx, f.y + 0.36, bz, f.w * 0.94, f.d * 0.20, 0.30, f.rot, [0.91, 0.90, 0.87, 1.0], softEdge, isSel);
            const [tx, tz] = toW(0, f.d * 0.22);
            pushBox(tx, f.y, tz, f.w * 0.48, f.d * 0.32, 0.28, f.rot, [0.85, 0.82, 0.76, 6.0], softEdge, isSel);
          } else {
            // Original Design Reference Style (261022)
            pushBox(f.x, f.y, f.z, f.w * 0.96, f.d * 0.92, 0.12, f.rot, [0.76, 0.69, 0.58, 1.0], softEdge, isSel);
            pushBox(f.x, f.y + 0.12, f.z, f.w * 0.94, f.d * 0.88, 0.32, f.rot, [0.97, 0.96, 0.93, 1.0], softEdge, isSel);
            const [bx, bz] = toW(0, -f.d * 0.34);
            pushBox(bx, f.y + 0.44, bz, f.w * 0.94, f.d * 0.22, 0.38, f.rot, [0.95, 0.94, 0.90, 1.0], softEdge, isSel);
            const [axL, azL] = toW(-f.w * 0.41, 0);
            const [axR, azR] = toW( f.w * 0.41, 0);
            pushBox(axL, f.y + 0.44, azL, f.w * 0.13, f.d * 0.84, 0.28, f.rot, [0.95, 0.94, 0.90, 1.0], softEdge, isSel);
            pushBox(axR, f.y + 0.44, azR, f.w * 0.13, f.d * 0.84, 0.28, f.rot, [0.95, 0.94, 0.90, 1.0], softEdge, isSel);
            const [tx, tz] = toW(0, f.d * 0.15);
            pushCylinder(tx, f.y, f.y + 0.36, tz, Math.min(f.w, f.d)*0.24, Math.min(f.w, f.d)*0.24, 16, [0.94, 0.92, 0.88, 6.0], softEdge);
          }
        } else if (f.category === 'bed') {
          const baseCol = isU2Style ? [0.28, 0.19, 0.14, 1.0] : (isMinStyle ? [0.82, 0.74, 0.62, 1.0] : [0.90, 0.88, 0.83, 1.0]);
          const headCol = isU2Style ? [0.24, 0.16, 0.12, 1.0] : (isMinStyle ? [0.86, 0.82, 0.75, 1.0] : [0.93, 0.91, 0.87, 1.0]);
          const throwCol = isU2Style ? [0.42, 0.50, 0.22, 1.0] : (isMinStyle ? [0.88, 0.86, 0.82, 1.0] : [0.92, 0.89, 0.83, 1.0]);
          pushBox(f.x, f.y, f.z, f.w * 0.98, f.d * 0.98, 0.32, f.rot, baseCol, softEdge, isSel);
          const [mx, mz] = toW(0, 0.04);
          pushBox(mx, f.y + 0.32, mz, f.w * 0.90, f.d * 0.86, 0.24, f.rot, [0.98, 0.98, 0.96, 1.0], softEdge, isSel);
          const [dx, dz] = toW(0, f.d * 0.24);
          pushBox(dx, f.y + 0.33, dz, f.w * 0.90, f.d * 0.30, 0.25, f.rot, throwCol, softEdge, isSel);
          const [hx, hz] = toW(0, -f.d * 0.41);
          pushBox(hx, f.y + 0.32, hz, f.w * 0.98, 0.14, f.h - 0.28, f.rot, headCol, softEdge, isSel);
          const [pxL, pzL] = toW(-f.w * 0.22, -f.d * 0.24);
          const [pxR, pzR] = toW( f.w * 0.22, -f.d * 0.24);
          pushBox(pxL, f.y + 0.56, pzL, f.w * 0.28, 0.24, 0.14, f.rot, [0.99, 0.98, 0.96, 1.0], softEdge, isSel);
          pushBox(pxR, f.y + 0.56, pzR, f.w * 0.28, 0.24, 0.14, f.rot, [0.99, 0.98, 0.96, 1.0], softEdge, isSel);
        } else if (f.category === 'table') {
          // Table & chairs strictly bounded inside f.w × f.d (rTbl = 0.34*min, chair ring at rTbl + 0.12 with r=0.14 -> max radius 0.48*min!)
          const minDim = Math.min(f.w, f.d);
          const rTbl = minDim * 0.35;
          const pedCol = isU2Style ? [0.24, 0.16, 0.12, 1.0] : [0.85, 0.82, 0.76, 1.0];
          const topCol = isU2Style ? [0.22, 0.20, 0.19, 6.0] : [0.96, 0.95, 0.93, 6.0];
          const chCol  = isU2Style ? [0.95, 0.94, 0.90, 1.0] : [0.95, 0.93, 0.89, 1.0];
          pushCylinder(f.x, f.y, f.y + f.h - 0.06, f.z, rTbl * 0.32, rTbl * 0.22, 14, pedCol, null);
          pushCylinder(f.x, f.y + f.h - 0.06, f.y + f.h, f.z, rTbl, rTbl, 20, topCol, softEdge);
          pushCylinder(f.x, f.y + f.h, f.y + f.h + 0.03, f.z, rTbl * 0.52, rTbl * 0.52, 16, [0.98, 0.97, 0.95, 6.0], null);
          const nChairs = minDim > 2.0 ? 8 : 4;
          for (let i=0; i<nChairs; i++) {
            const ang = (i / nChairs) * Math.PI * 2;
            const chX = f.x + (rTbl + 0.12) * Math.cos(ang);
            const chZ = f.z + (rTbl + 0.12) * Math.sin(ang);
            pushCylinder(chX, f.y, f.y + 0.46, chZ, 0.14, 0.15, 10, chCol, null);
          }
        } else if (f.category === 'bath') {
          if (Math.min(f.w, f.d) < 1.45) {
            pushBox(f.x, f.y, f.z, f.w * 0.92, f.d * 0.88, 0.82, f.rot, [0.95, 0.94, 0.91, 6.0], softEdge, isSel);
            pushCylinder(f.x, f.y + 0.82, f.y + 0.92, f.z, Math.min(f.w, f.d)*0.28, Math.min(f.w, f.d)*0.32, 12, [0.99, 0.99, 1.0, 1.0], null);
          } else {
            const rTub = Math.min(0.54, Math.min(f.w, f.d) * 0.30);
            const [tx, tz] = toW(-f.w * 0.18, 0);
            const [vx, vz] = toW(f.w * 0.20, -f.d * 0.20);
            pushCylinder(tx, f.y, f.y + 0.56, tz, rTub * 0.92, rTub, 16, [0.98, 0.99, 1.0, 1.0], softEdge);
            pushBox(vx, f.y, vz, f.w * 0.46, Math.min(0.56, f.d * 0.38), 0.84, f.rot, [0.95, 0.94, 0.91, 6.0], softEdge, isSel);
          }
        } else if (f.category === 'kitchen' || f.category === 'island') {
          const cabCol = isU2Style ? [0.24, 0.16, 0.12, 1.0] : [0.94, 0.92, 0.88, 1.0];
          pushBox(f.x, f.y, f.z, f.w * 0.98, f.d * 0.98, f.h - 0.06, f.rot, cabCol, softEdge, isSel);
          pushBox(f.x, f.y + f.h - 0.06, f.z, f.w * 1.00, f.d * 1.00, 0.06, f.rot, [0.98, 0.98, 0.97, 6.0], softEdge, isSel);
        } else if (f.id === '1f_courtyard_green_island' || f.id === '3f_terrace_garden') {
          pushBox(f.x, f.y, f.z, f.w, f.d, 0.38, f.rot, [0.84, 0.82, 0.78, 1.0], softEdge, isSel);
          pushBox(f.x, f.y + 0.38, f.z, f.w * 0.92, f.d * 0.92, 0.22, f.rot, [0.28, 0.50, 0.33, 4.0], null, isSel);
        } else {
          pushBox(f.x, f.y, f.z, f.w, f.d, f.h, f.rot, [...rgb, 1.0], softEdge, isSel);
        }
      }

      // ======================================================================
      // 5B. U2 Model-Unit Signature Designer Furniture & Art Pieces (Photos 1, 2, 4, 5, 7)
      //     Every piece is mathematically verified for ZERO wall overlap, ZERO furniture collision,
      //     and 100% flush solid-structural-wall backing (never exceeding wall width or effWallH!).
      // ======================================================================
      if (isU2Style) {
        const walnutDark = [0.22, 0.14, 0.11, 1.0]; // Deep espresso/walnut fluted credenza
        const walnutWarm = [0.44, 0.28, 0.18, 1.0]; // Rotating walnut box shelves

        // Helper: Render Floor-to-Ceiling Rotating Walnut Bookshelf Column (clamped to effWallH) + Wall-Backed Credenza & Framed Tree-Branch Painting
        const pushWallBackedCredenzaAndBookshelf = (flKey, credX, credZ, credW, credD, artX, artZ, artW, artD, bookX, bookZ) => {
          if (this.floorFilter !== 'ALL' && this.floorFilter !== flKey) return;
          const fdCurr = this.data.floors[flKey];
          const y0 = fdCurr.elevation;
          const effH = (this.cameraMode === 'walk') ? fdCurr.height : Math.min(fdCurr.height, this.wallCutHeight);
          // 1. Low dark-walnut credenza placed with 7cm clearance in front of the solid structural wall
          pushBox(credX, y0, credZ, credW, credD, Math.min(0.76, effH - 0.10), 0, walnutDark, [0.14, 0.09, 0.07, 0.7], false);
          // 2. Framed tree-branch artwork mounted 100% flush on the solid structural wall (only when structural walls are visible and effH >= 2.25m so it NEVER sticks out above cut walls!)
          if (chkStruct && effH >= 2.25) {
            const artH = Math.min(1.05, effH - 1.20);
            pushBox(artX, y0 + 1.10, artZ, artW, artD, artH, 0, [0.96, 0.94, 0.89, 1.0], [0.20, 0.18, 0.16, 0.9], false);
            pushBox(artX - 0.005, y0 + 1.22, artZ, artW, artD * 0.72, artH * 0.76, 0, [0.76, 0.48, 0.34, 1.0], null, false);
          }
          // 3. Iconic Rotating Walnut Bookshelf Column on White Calacatta Marble Cube Base (strictly clamped to effH - 0.04m!)
          const colTopH = Math.min(fdCurr.height - 0.12, effH - 0.04);
          if (colTopH > 0.65) {
            pushBox(bookX, y0, bookZ, 0.40, 0.40, 0.34, 12, [0.96, 0.96, 0.95, 6.0], [0.65, 0.65, 0.65, 0.6], false);
            pushCylinder(bookX, y0 + 0.34, y0 + colTopH, bookZ, 0.042, 0.042, 8, walnutWarm, null);
            const maxTiers = Math.max(1, Math.min(7, Math.floor((colTopH - 0.52) / 0.36)));
            for (let tier = 0; tier < maxTiers; tier++) {
              const ty = y0 + 0.46 + tier * 0.36;
              const rotA = tier * 42 + 15;
              pushBox(bookX + 0.12 * Math.cos(rotA * Math.PI / 180), ty, bookZ + 0.12 * Math.sin(rotA * Math.PI / 180), 0.40, 0.28, 0.22, rotA, walnutWarm, [0.28, 0.18, 0.11, 0.7], false);
            }
          }
        };

        // 1F Placement: Backed by the 3.70m-long solid structural wall str_120 (West face X = 16.661, Z = [-4.097 .. -0.398])
        pushWallBackedCredenzaAndBookshelf('1F', 16.38, -2.15, 0.42, 2.00, 16.635, -2.15, 0.04, 1.10, 16.28, -3.55);

        // 2F Placement: Backed by the 3.55m-long solid structural wall str_54 (West face X = 10.015, Z = [-3.996 .. -0.449])
        pushWallBackedCredenzaAndBookshelf('2F', 9.74, -1.95, 0.42, 1.85, 9.990, -1.95, 0.04, 1.05, 9.65, -3.28);

        // B1 Playroom & 3-Panel Triptych Set (Photos 2 & 4): Placed in open B1_CENTRAL_CORE (X = 13.5..17.4, Z = -9.6..-6.1),
        // with the 3-Panel Topographic Wave Triptych mounted flush on the North face (Z = -5.845) of the 4.34m-wide solid structural wall str_90 (X = [13.286 .. 17.626])!
        if (this.floorFilter === 'ALL' || this.floorFilter === 'B1') {
          const fdB1 = this.data.floors['B1'];
          const yBV = fdB1.elevation;
          const effHB1 = (this.cameraMode === 'walk') ? fdB1.height : Math.min(fdB1.height, this.wallCutHeight);
          // 1. Giant Black & White Daisy Flower Rug at (15.46, -7.95)
          const rx = 15.46, rz = -7.95;
          pushCylinder(rx, yBV + 0.005, yBV + 0.018, rz, 1.15, 1.15, 16, [0.16, 0.18, 0.22, 1.0], null);
          for (let p = 0; p < 8; p++) {
            const a = (p / 8) * Math.PI * 2;
            pushCylinder(rx + 0.54 * Math.cos(a), yBV + 0.018, yBV + 0.025, rz + 0.54 * Math.sin(a), 0.42, 0.40, 10, [0.95, 0.94, 0.90, 1.0], null);
          }
          pushCylinder(rx, yBV + 0.025, yBV + 0.032, rz, 0.30, 0.30, 12, [0.16, 0.18, 0.22, 1.0], null);
          // 2. White Polar-Bear Sculptural Floor Pouf at (15.46, -8.85)
          pushBox(15.46, yBV + 0.03, -8.85, 0.78, 0.50, 0.40, -12, [0.98, 0.98, 0.97, 1.0], null, false);
          pushBox(15.74, yBV + 0.03, -8.90, 0.32, 0.30, 0.30, -12, [0.98, 0.98, 0.97, 1.0], null, false);
          // 3. Round Play Table + 4 Colorful Rabbit-Ear Chairs (Purple, Red, Yellow, Blue) at (14.65, -7.25)
          const tx = 14.65, tz = -7.25;
          pushCylinder(tx, yBV, yBV + 0.52, tz, 0.20, 0.20, 12, [0.68, 0.64, 0.66, 1.0], null);
          pushCylinder(tx, yBV + 0.52, yBV + 0.56, tz, 0.48, 0.48, 16, [0.78, 0.75, 0.77, 1.0], null);
          const chairCols = [
            [0.52, 0.16, 0.72, 1.0], // Purple chair
            [0.78, 0.10, 0.12, 1.0], // Red chair
            [0.82, 0.76, 0.12, 1.0], // Yellow chair
            [0.10, 0.38, 0.52, 1.0]  // Teal-Blue chair
          ];
          const chairOffsets = [[-0.34, 0.34, 35], [0.34, 0.34, -35], [-0.34, -0.34, 145], [0.34, -0.34, -145]];
          for (let c = 0; c < 4; c++) {
            const [ox, oz, crot] = chairOffsets[c];
            pushBox(tx + ox, yBV, tz + oz, 0.30, 0.30, 0.32, crot, chairCols[c], null, false);
            pushBox(tx + ox * 1.15, yBV + 0.32, tz + oz * 1.15, 0.28, 0.05, 0.48, crot, chairCols[c], null, false);
          }
          // 4. Olive-Green Tufted Pumpkin Armchair & Ottoman at (16.45, -7.25)
          pushCylinder(16.45, yBV, yBV + 0.66, -7.25, 0.46, 0.42, 12, [0.38, 0.48, 0.14, 1.0], null);
          pushCylinder(15.92, yBV, yBV + 0.35, -7.15, 0.30, 0.28, 12, [0.42, 0.52, 0.16, 1.0], null);
          // 5. 3-Panel Colorful Topographic Wave Triptych Artwork mounted 100% flush on North face (Z = -5.845) of str_90 (X = [13.286 .. 17.626])!
          if (chkStruct && effHB1 >= 2.25) {
            const tripH = Math.min(1.04, effHB1 - 1.20);
            for (const ox of [-0.92, 0.0, 0.92]) {
              pushBox(15.46 + ox, yBV + 1.10, -5.870, 0.80, 0.04, tripH, 0, [0.92, 0.42, 0.28, 1.0], [0.25, 0.45, 0.68, 0.9], false);
              pushBox(15.46 + ox, yBV + 1.21, -5.885, 0.62, 0.045, tripH * 0.76, 0, [0.95, 0.86, 0.72, 1.0], [0.78, 0.22, 0.18, 0.9], false);
            }
          }
        }
      }
    }

    // 6. Architectural Grid Axes & True North Vector (spanning all 4 villas U11 + U10 + U9 + U8: X = 0..98m)
    if (chkGrid) {
      const yG = this.floorFilter === 'B1' ? this.data.floors['B1'].elevation - 0.02 : -0.03;
      for (let x = 0; x <= 98; x += 2) {
        pushLine([x, yG, 6.0], [x, yG, -25.0], [0.35, 0.45, 0.58, 0.22]);
      }
      for (let z = 6; z >= -24; z -= 2) {
        pushLine([-2.0, yG, z], [98.0, yG, z], [0.35, 0.45, 0.58, 0.22]);
      }
      pushLine([0, yG+0.02, 0.8], [25.88, yG+0.02, 0.8], [0.92, 0.38, 0.28, 0.8]);
      pushLine([26.05, yG+0.02, 4.2], [49.45, yG+0.02, 4.2], [0.22, 0.65, 0.95, 0.85]);
      pushLine([49.72, yG+0.02, 6.0], [70.65, yG+0.02, 6.0], [0.20, 0.78, 0.52, 0.85]);
      pushLine([70.92, yG+0.02, 5.3], [95.82, yG+0.02, 5.3], [0.72, 0.45, 0.95, 0.85]);
      const nx = -Math.SQRT1_2, nz = -Math.SQRT1_2;
      pushLine([-1.5, 0.1, -19.0], [-1.5 + nx*3.5, 0.1, -19.0 + nz*3.5], [0.95, 0.22, 0.22, 1.0]);
    }

    // 7. Active Measurement Lines
    for (const seg of this.measure.segments) {
      pushLine(seg.p1, seg.p2, [1.0, 0.75, 0.0, 1.0]);
    }
    if (this.measure.pts.length === 1) {
      const p = this.measure.pts[0];
      pushLine([p[0]-0.2, p[1], p[2]], [p[0]+0.2, p[1], p[2]], [1.0, 0.2, 0.2, 1.0]);
      pushLine([p[0], p[1], p[2]-0.2], [p[0], p[1], p[2]+0.2], [1.0, 0.2, 0.2, 1.0]);
    }

    // Append translucent glass & UV overlay triangles after opaque geometry so depth + alpha blending works cleanly
    const allPos = posArr.concat(transPos);
    const allNorm = normArr.concat(transNorm);
    const allCol = colArr.concat(transCol);

    if (this.buffers.vaoMain) gl.deleteVertexArray(this.buffers.vaoMain);
    const vaoMain = gl.createVertexArray();
    gl.bindVertexArray(vaoMain);
    const makeBuf = (loc, data, size) => {
      const b = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, b);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(data), gl.STATIC_DRAW);
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0);
      return b;
    };
    makeBuf(0, allPos, 3);
    makeBuf(1, allNorm, 3);
    makeBuf(2, allCol, 4);
    this.buffers.vaoMain = vaoMain;
    this.buffers.countOpaque = posArr.length / 3;
    this.buffers.countTrans = transPos.length / 3;
    this.buffers.countMain = allPos.length / 3;

    if (this.buffers.vaoLine) gl.deleteVertexArray(this.buffers.vaoLine);
    const vaoLine = gl.createVertexArray();
    gl.bindVertexArray(vaoLine);
    makeBuf(0, linePos, 3);
    makeBuf(1, lineCol, 4);
    this.buffers.vaoLine = vaoLine;
    this.buffers.countLine = linePos.length / 3;

    gl.bindVertexArray(null);
    this.rebuildShadowAndWeatherBuffers();
  },

  rebuildShadowAndWeatherBuffers() {
    const gl = this.gl;
    if (!gl) return;
    if (this.buffers.vaoShadow) {
      gl.deleteVertexArray(this.buffers.vaoShadow);
      this.buffers.vaoShadow = null;
    }
    this.buffers.countShadow = 0;
  },

  updateSunAndWeather() {
    const dateStr = document.getElementById('inp-sun-date')?.value || '2026-06-21';
    const hourVal = parseFloat(document.getElementById('inp-sun-hour')?.value || '13.5');
    const hrs = Math.floor(hourVal);
    const mins = Math.round((hourVal - hrs) * 60);
    const lblHr = document.getElementById('lbl-sun-hour');
    if (lblHr) lblHr.textContent = `${String(hrs).padStart(2,'0')}:${String(mins).padStart(2,'0')}`;

    const dt = new Date(dateStr + 'T12:00:00');
    const start = new Date(dt.getFullYear(), 0, 0);
    const N = Math.floor((dt - start) / (1000 * 60 * 60 * 24));

    const latRad = 31.22 * Math.PI / 180;
    const declDeg = 23.44 * Math.sin((2 * Math.PI / 365) * (N - 81));
    const declRad = declDeg * Math.PI / 180;

    const solarHour = hourVal + (121.43 - 120.0) / 15.0;
    const hAngleRad = ((solarHour - 12.0) * 15.0) * Math.PI / 180;

    const sinAlt = Math.sin(latRad)*Math.sin(declRad) + Math.cos(latRad)*Math.cos(declRad)*Math.cos(hAngleRad);
    const altRad = Math.asin(Math.max(-1, Math.min(1, sinAlt)));
    const altDeg = altRad * 180 / Math.PI;

    const cosAz = (Math.sin(declRad) - Math.sin(altRad)*Math.sin(latRad)) / (Math.cos(altRad)*Math.cos(latRad) + 1e-9);
    let azDeg = Math.acos(Math.max(-1, Math.min(1, cosAz))) * 180 / Math.PI;
    if (solarHour > 12.0) azDeg = 360.0 - azDeg;

    this.sun.altitudeDeg = altDeg;
    this.sun.azimuthDeg = azDeg;

    const elAlt = document.getElementById('lbl-solar-alt');
    const elAzi = document.getElementById('lbl-solar-azi');
    const elCy  = document.getElementById('lbl-courtyard-sun');
    if (elAlt) elAlt.textContent = `${altDeg.toFixed(1)}°`;
    if (elAzi) elAzi.textContent = `${azDeg.toFixed(1)}°`;
    if (elCy) elCy.textContent =
      altDeg > 15 ? `阳光直射入天井 (高度角 ${altDeg.toFixed(0)}°)` :
      altDeg > 0  ? `低角度斜射采光 (高度角 ${altDeg.toFixed(0)}°)` : '夜间/日落暮光模式';

    const planAngleRad = (-135.0 + azDeg) * Math.PI / 180.0;
    const horiz = Math.cos(Math.max(0.08, altRad));
    const sy = Math.sin(Math.max(0.08, altRad));
    const sx = horiz * Math.cos(planAngleRad);
    const sz = horiz * Math.sin(planAngleRad);
    this.sun.dir = Vec3.norm([sx, sy, sz]);

    if (this.sun.weather === 'sunny') {
      this.sun.skyColor = altDeg > 5 ? [0.56, 0.78, 0.95] : [0.14, 0.18, 0.30];
      this.sun.sunIntensity = altDeg > 5 ? 0.88 : 0.25;
      this.sun.ambientIntensity = altDeg > 5 ? 0.56 : 0.28;
    } else if (this.sun.weather === 'cloudy') {
      this.sun.skyColor = [0.68, 0.73, 0.78];
      this.sun.sunIntensity = 0.30;
      this.sun.ambientIntensity = 0.68;
    } else if (this.sun.weather === 'rainy') {
      this.sun.skyColor = [0.38, 0.44, 0.52];
      this.sun.sunIntensity = 0.18;
      this.sun.ambientIntensity = 0.55;
      if (this.sun.rainDrops.length === 0) {
        for (let i=0; i<520; i++) {
          this.sun.rainDrops.push([
            Math.random() * 44 - 8,
            Math.random() * 18 - 1,
            -Math.random() * 38 + 6
          ]);
        }
      }
    }
    if (this.gl && this.buffers) this.rebuildShadowAndWeatherBuffers();
  },

  setSolarPreset(dateStr, hourVal) {
    document.getElementById('inp-sun-date').value = dateStr;
    document.getElementById('inp-sun-hour').value = hourVal;
    this.updateSunAndWeather();
  },

  setWeather(w) {
    this.sun.weather = w;
    for (const k of ['sunny', 'cloudy', 'rainy']) {
      document.getElementById('btn-w-' + k)?.classList.toggle('active', k === w);
    }
    const el = document.getElementById('lbl-weather-src');
    if (el) {
      el.textContent = '本地物理气象模拟 (非实时)';
      el.style.color = '#fbbf24';
    }
    this.updateSunAndWeather();
  },

  async fetchLiveShanghaiWeather() {
    const el = document.getElementById('lbl-weather-src');
    if (el) el.textContent = '正在请求 Open-Meteo 上海气象站...';
    try {
      const url = 'https://api.open-meteo.com/v1/forecast?latitude=31.22&longitude=121.43&current_weather=true&timezone=Asia%2FShanghai';
      const res = await fetch(url);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      const cw = data.current_weather;
      const code = cw.weathercode;
      let mode = 'sunny';
      if (code >= 51) mode = 'rainy';
      else if (code >= 2) mode = 'cloudy';
      this.setWeather(mode);
      if (el) {
        el.textContent = `Open-Meteo 实时数据 (${cw.temperature}°C, 风速 ${cw.windspeed}km/h, 观测时间 ${cw.time})`;
        el.style.color = '#10b981';
      }
    } catch (err) {
      if (el) {
        el.textContent = '离线/无外网环境：保持本地物理模拟天气 (绝不冒充实时数据)';
        el.style.color = '#fbbf24';
      }
    }
  },

  // Interactive Satellite Calibration Line (Codex Fusion Feature!)
  initSatelliteCalibrationSVG() {
    const svg = document.getElementById('sat-calib-svg');
    const grp = document.getElementById('sat-drag-group');
    if (!svg || !grp || !svg.addEventListener) return;

    const renderHandles = () => {
      const [a, b] = this.satRoofPts;
      const pxDist = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const mLen = (pxDist * 25.0 / 216.0).toFixed(2);
      const lbl = document.getElementById('lbl-sat-roof-len');
      if (lbl) lbl.textContent = `${mLen} m (${pxDist.toFixed(1)} px)`;
      grp.innerHTML = `
        <line x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}" stroke="#f59e0b" stroke-width="7" />
        <text x="${(a[0]+b[0])/2}" y="${(a[1]+b[1])/2 - 18}" fill="#fde68a" font-size="26" font-weight="bold" text-anchor="middle">候选屋顶 ≈ ${mLen}m</text>
        <circle data-idx="0" cx="${a[0]}" cy="${a[1]}" r="16" fill="#f59e0b" stroke="#fff" stroke-width="4" style="cursor:pointer;" />
        <circle data-idx="1" cx="${b[0]}" cy="${b[1]}" r="16" fill="#f59e0b" stroke="#fff" stroke-width="4" style="cursor:pointer;" />
      `;
    };
    renderHandles();

    let dragIdx = null;
    svg.addEventListener('pointerdown', (e) => {
      const idx = e.target.getAttribute('data-idx');
      if (idx !== null) {
        dragIdx = parseInt(idx, 10);
        svg.setPointerCapture(e.pointerId);
      }
    });
    svg.addEventListener('pointermove', (e) => {
      if (dragIdx === null) return;
      const rect = svg.getBoundingClientRect();
      const x = Math.max(20, Math.min(1200, ((e.clientX - rect.left) / rect.width) * 1220));
      const y = Math.max(20, Math.min(836, ((e.clientY - rect.top) / rect.height) * 856));
      this.satRoofPts[dragIdx] = [x, y];
      renderHandles();
    });
    svg.addEventListener('pointerup', () => { dragIdx = null; });
  },

  applySatelliteScale() {
    const [a, b] = this.satRoofPts;
    const mLen = Math.hypot(b[0] - a[0], b[1] - a[1]) * 25.0 / 216.0;
    this.scaleFactor = mLen / 25.880;
    const lbl = document.getElementById('lbl-calib-mode');
    if (lbl) {
      lbl.textContent = `卫星图候选标定 (${mLen.toFixed(2)}m, 倍率 ×${this.scaleFactor.toFixed(3)})`;
      lbl.style.color = '#fbbf24';
    }
    document.getElementById('btn-reset-design-scale')?.classList.remove('active');
    this.populateUI();
  },

  resetDesignScale() {
    this.scaleFactor = 1.0;
    const lbl = document.getElementById('lbl-calib-mode');
    if (lbl) {
      lbl.textContent = '设计稿下方轴线 25,880 mm (×1.000)';
      lbl.style.color = '#34d399';
    }
    document.getElementById('btn-reset-design-scale')?.classList.add('active');
    this.populateUI();
  },

  getActiveSpiralStepAt(x, z, currentY) {
    const scx = 5.250, scz = -16.149;
    const r = Math.hypot(x - scx, z - scz);
    if (r < 0.88 || r > 2.48) return null;
    // Project point radially into the mid-tread ring (r = 1.68m) so walking slightly against the curved handrail never misses the step polygon!
    const testX = scx + (x - scx) * (1.68 / (r || 1));
    const testZ = scz + (z - scz) * (1.68 / (r || 1));
    let bestStep = null, minDiff = 999;
    for (const st of this.data.stairs) {
      if (st.type !== 'spiral') continue;
      for (const s of st.steps) {
        if (pointInPoly2D(x, z, s.poly) || pointInPoly2D(testX, testZ, s.poly)) {
          const d = Math.abs(s.y_top - currentY);
          // Use 0.55m (3 risers) instead of 1.35m so walking on the floor landing never snaps down through the floor slab!
          if (d < 0.55 && d < minDiff) {
            minDiff = d;
            bestStep = s;
          }
        }
      }
    }
    return bestStep;
  },

  getFloorAndStairElevationAt(x, z, currentY) {
    const spStep = this.getActiveSpiralStepAt(x, z, currentY);
    if (spStep) return spStep.y_top;

    let bestStairY = null;
    let minDiff = 999;
    for (const st of this.data.stairs) {
      for (const s of st.steps) {
        if (pointInPoly2D(x, z, s.poly)) {
          const d = Math.abs(s.y_top - currentY);
          // Strict 0.55m vertical capture threshold prevents snapping through floor slabs onto lower stair flights!
          if (d < 0.55 && d < minDiff) {
            minDiff = d;
            bestStairY = s.y_top;
          }
        }
      }
    }
    if (bestStairY !== null) return bestStairY;

    const levels = [
      this.data.floors['B1'].elevation,
      this.data.floors['1F'].elevation,
      this.data.floors['2F'].elevation,
      this.data.floors['3F'].elevation
    ];
    let bestL = levels[0];
    for (const lv of levels) {
      if (Math.abs(lv - currentY) < Math.abs(bestL - currentY)) bestL = lv;
    }
    return bestL;
  },

  isPointCollidingWithWalls(x, y, z) {
    if (!document.getElementById('chk-collision')?.checked) return false;
    // 1. Solid Spiral Staircase Central Void & Balustrade Protection (cx=5.250, cz=-16.149):
    //    Never allow walking into the central void eye (r < 1.04m) on any floor or stair!
    const scx = 5.250, scz = -16.149;
    const sr = Math.hypot(x - scx, z - scz);
    if (sr < 1.04) return true;

    let flKey = '1F';
    for (const k of ['B1', '1F', '2F', '3F']) {
      const fd = this.data.floors[k];
      if (y >= fd.elevation - 0.3 && y < fd.elevation + fd.height - 0.2) {
        flKey = k; break;
      }
    }
    for (const st of this.data.stairs) {
      for (const s of st.steps) {
        if (pointInPoly2D(x, z, s.poly) && Math.abs(y - s.y_top) < 0.75) {
          if (st.type === 'spiral' && (sr < 1.05 || sr > 2.30)) return true;
          return false;
        }
      }
    }

    // 2. 50cm Shared Party Wall between U11 and U10 (X = xInU11(z) .. xInU11(z) + 0.50):
    //    Open ONLY on 2F at the widened walkthrough doorway Z = [-16.88 .. -14.72] when chk-party-knock is checked!
    const xParty = 25.55 + (-z / 23.61) * 1.69;
    if (z <= 0.02 && z >= -23.59 && x >= xParty - 0.04 && x <= xParty + 0.54) {
      const partyKnock = document.getElementById('chk-party-knock')?.checked ?? true;
      if (flKey === '2F' && partyKnock && z <= -14.72 && z >= -16.88) {
        return false; // Walk right through the 2.16m wide 2F East connecting doorway!
      }
      return true;
    }

    // Helper to skip superseded U11 East/Outer shell wall polygons in fd.structural_walls
    const isSupersededU11EastWall = (poly) => {
      let maxDe = -999;
      for (const p of poly) {
        const xe = 25.55 + (-p[1] / 23.61) * 1.69;
        maxDe = Math.max(maxDe, Math.abs(p[0] - xe));
      }
      return maxDe < 0.55;
    };

    const fd = this.data.floors[flKey];
    for (const w of fd.structural_walls) {
      if (isSupersededU11EastWall(w.poly)) continue;
      if (pointInPoly2D(x, z, w.poly)) return true;
    }
    if (document.getElementById('chk-part-walls')?.checked) {
      for (const w of fd.partition_walls) {
        if (isSupersededU11EastWall(w.poly)) continue;
        if (pointInPoly2D(x, z, w.poly)) return true;
      }
    }
    for (const unitKey of ['u10', 'u9', 'u8']) {
      const ufd = this.data[unitKey]?.floors?.[flKey];
      if (ufd) {
        for (const w of (ufd.structural_walls || [])) {
          if (pointInPoly2D(x, z, w.poly)) return true;
        }
        if (document.getElementById('chk-part-walls')?.checked) {
          for (const w of (ufd.partition_walls || [])) {
            if (pointInPoly2D(x, z, w.poly)) return true;
          }
        }
      }
    }
    return false;
  },

  startAutoStairTour(direction) {
    this.toggleMobileSettings(false);
    this.setCameraMode('walk');
    this.setFloorFilter('ALL');
    const pts = [];
    pts.push({ pos: [8.2, this.data.floors['B1'].elevation, -14.8], look: [5.5, this.data.floors['B1'].elevation, -16.0] });
    for (const flightId of ['main_spiral_B1_to_1F', 'main_spiral_1F_to_2F', 'main_spiral_2F_to_3F']) {
      const st = this.data.stairs.find(s => s.id === flightId);
      if (st) {
        for (let i=0; i<st.steps.length; i++) {
          const c = st.steps[i].center;
          const nextC = st.steps[Math.min(st.steps.length-1, i+2)].center;
          pts.push({ pos: [c[0], c[1], c[2]], look: [nextC[0], nextC[1], nextC[2]] });
        }
      }
      if (flightId === 'main_spiral_B1_to_1F') {
        const y = this.data.floors['1F'].elevation;
        pts.push({ pos: [6.2, y, -13.9], look: [7.5, y, -15.5] });
        pts.push({ pos: [7.2, y, -15.5], look: [7.0, y, -17.0] });
      } else if (flightId === 'main_spiral_1F_to_2F') {
        const y = this.data.floors['2F'].elevation;
        pts.push({ pos: [6.2, y, -13.9], look: [7.5, y, -15.5] });
        pts.push({ pos: [7.2, y, -15.5], look: [7.0, y, -17.0] });
      }
    }
    const y3 = this.data.floors['3F'].elevation;
    pts.push({ pos: [6.6, y3, -13.8], look: [12.0, y3, -12.0] });

    if (direction === '3F_to_B1') pts.reverse();
    this.walk.tourWaypoints = pts;
    this.walk.tourIdx = 0;
    this.walk.tourActive = true;
    this.walk.pos = [...pts[0].pos];
  },

  setCameraMode(mode) {
    const prevMode = this.cameraMode;
    this.cameraMode = mode;
    this.walk.tourActive = false;
    for (const m of ['orbit', 'ortho', 'walk']) {
      document.getElementById('btn-mode-' + m)?.classList.toggle('active', m === mode);
    }
    const fp = document.getElementById('fp-crosshair');
    if (fp) fp.style.display = (mode === 'walk') ? 'block' : 'none';
    const walkPad = document.getElementById('mobile-walk-pad');
    if (walkPad) {
      walkPad.style.display = (mode === 'walk') ? 'block' : 'none';
      if (mode !== 'walk') {
        this.walk.joyX = 0.0;
        this.walk.joyY = 0.0;
        this.walk.joyActive = false;
        walkPad.classList.remove('active');
        const knob = document.getElementById('joystick-knob');
        if (knob) knob.style.transform = 'translate(-50%, -50%)';
      }
    }
    const hudM = document.getElementById('hud-mode');
    if (hudM) {
      hudM.textContent =
        mode === 'orbit' ? '整栋自由俯览 (Perspective)' :
        mode === 'ortho' ? '正交平面俯视 (Orthographic)' :
        `第一人称漫游 (FOV ${this.fovDeg}°, ${this.walkSpeed}m/s, 3F封顶+暖光)`;
    }

    if (mode === 'ortho') {
      this.orbit.yaw = 0.0;
      this.orbit.pitch = 1.565;
      this.orbit.target = [13.6, 0.0, -11.2];
      this.orbit.orthoZoom = 14.5;
    }
    if (prevMode !== mode) {
      this.rebuildGeometryBuffers();
    }
    this.updatePlanOverlay();
  },

  setFloorFilter(fl) {
    this.floorFilter = fl;
    for (const k of ['ALL', 'B1', '1F', '2F', '3F']) {
      document.getElementById('btn-floor-' + k)?.classList.toggle('active', k === fl);
      document.getElementById('m-btn-floor-' + k)?.classList.toggle('active', k === fl);
    }
    const hudF = document.getElementById('hud-floor');
    if (hudF) hudF.textContent = fl === 'ALL' ? 'ALL (B1–3F 整栋完整加载)' : `${fl} 分层检视`;

    const planMap = {
      'B1': 'assets/plans/huxing-5.png',
      '1F': 'assets/plans/design-1.png',
      '2F': 'assets/plans/design-2.png',
      '3F': 'assets/plans/design-3.png'
    };
    if (planMap[fl]) {
      const s1 = document.getElementById('sel-overlay-plan');
      const s2 = document.getElementById('sel-compare-img');
      const im = document.getElementById('compare-img-el');
      if (s1) s1.value = planMap[fl];
      if (s2) s2.value = planMap[fl];
      if (im) im.src = planMap[fl];
    }
    this.rebuildGeometryBuffers();
    this.updatePlanOverlay();
  },

  goToPreset(preset) {
    this.toggleMobileSettings(false);
    this.setFloorFilter('ALL');
    if (preset === 'courtyard_up') {
      this.setCameraMode('walk');
      this.walk.pos = [14.2, 0.0, -9.8];
      this.walk.yaw = 0.25;
      this.walk.pitch = 0.62;
      document.getElementById('hud-mode').textContent = '1F 庭院仰望中央大天井与天空';
    } else if (preset === 'void_2f_down') {
      this.setCameraMode('walk');
      this.walk.pos = [21.2, this.data.floors['2F'].elevation, -10.5];
      this.walk.yaw = -1.35;
      this.walk.pitch = -0.48;
      document.getElementById('hud-mode').textContent = '2F 平台俯视 1F 中央庭院景观';
    } else if (preset === 'void_3f_down') {
      this.setCameraMode('walk');
      this.walk.pos = [16.5, this.data.floors['3F'].elevation, -5.5];
      this.walk.yaw = -0.15;
      this.walk.pitch = -0.55;
      document.getElementById('hud-mode').textContent = '3F 屋顶露台俯视中央天井';
    } else if (preset === 'main_stair') {
      this.setCameraMode('walk');
      this.walk.pos = [6.4, this.data.floors['1F'].elevation, -13.9];
      this.walk.yaw = -0.35;
      this.walk.pitch = 0.18;
      document.getElementById('hud-mode').textContent = '主旋转楼梯 B1–3F 垂直连通视角';
    } else if (preset === 'living_1f') {
      this.setCameraMode('walk');
      this.walk.pos = [3.5, 0.0, -3.2];
      this.walk.yaw = 1.45;
      this.walk.pitch = -0.05;
      document.getElementById('hud-mode').textContent = '1F 主起居室、三角钢琴与餐厅全景';
    } else if (preset === 'master_3f') {
      this.setCameraMode('walk');
      this.walk.pos = [12.5, this.data.floors['3F'].elevation, -17.5];
      this.walk.yaw = 1.35;
      this.walk.pitch = -0.08;
      document.getElementById('hud-mode').textContent = '3F 主卧套房与主卫空间 (含屋顶封板)';
    } else if (preset === 'u9_overview') {
      this.setCameraMode('orbit');
      this.syncRoofToggle(false);
      this.setWallCutHeight(2.35);
      this.orbit.target = [60.2, 3.0, -8.2];
      this.orbit.distance = 32.0;
      this.orbit.yaw = -0.18;
      this.orbit.pitch = 0.76;
      document.getElementById('hud-mode').textContent = 'U9 四层别墅中庭、二层东露台花园与室内全景视角';
    } else if (preset === 'u8_overview') {
      this.setCameraMode('orbit');
      this.syncRoofToggle(false);
      this.setWallCutHeight(2.35);
      this.orbit.target = [82.8, 3.0, -9.5];
      this.orbit.distance = 34.0;
      this.orbit.yaw = -0.22;
      this.orbit.pitch = 0.76;
      document.getElementById('hud-mode').textContent = 'U8 四层别墅中庭与 12.00° 斜切东立面全景视角';
    } else if (preset === 'four_villas_all') {
      this.setCameraMode('orbit');
      this.syncRoofToggle(false);
      this.setWallCutHeight(2.45);
      this.orbit.target = [48.5, 3.5, -10.0];
      this.orbit.distance = 68.0;
      this.orbit.yaw = -0.12;
      this.orbit.pitch = 0.78;
      document.getElementById('hud-mode').textContent = 'U11 + U10 + U9 + U8 南排四联四层别墅完整三维全景';
    } else if (preset === 'u11_u10_combined') {
      this.setCameraMode('orbit');
      this.syncRoofToggle(false);
      this.setWallCutHeight(1.45);
      this.orbit.target = [26.5, 1.5, -10.0];
      this.orbit.yaw = -0.15;
      this.orbit.pitch = 0.88;
      this.orbit.distance = 44.0;
      document.getElementById('hud-mode').textContent = 'U11+U10 二联全景与 50cm 户间墙 (20+10+20cm · 填充墙 4120/4000/1800mm 打通)';
    } else if (preset === 'river_privacy') {
      this.setCameraMode('orbit');
      this.showPrivacyRays = true;
      const chk = document.getElementById('chk-privacy-rays');
      if (chk) chk.checked = true;
      this.orbit.target = [18.0, 4.5, 24.0];
      this.orbit.yaw = 2.68;
      this.orbit.pitch = 0.42;
      this.orbit.distance = 78.0;
      this.rebuildGeometryBuffers();
      document.getElementById('hud-mode').textContent = '河对岸住宅北立面分级窗口 (🔴北次卧常驻窗 / 🟠厨卫高窗 / 🔵楼梯窗) 与 U11/U10 隐私视线包络';
    }
  },

  setFOV(val) {
    this.fovDeg = parseFloat(val);
    document.getElementById('lbl-fov').textContent = `${this.fovDeg}°`;
  },

  setWalkSpeed(val) {
    this.walkSpeed = parseFloat(val);
    document.getElementById('lbl-speed').textContent = `${this.walkSpeed.toFixed(1)}m/s`;
  },

  updateLayers() {
    this.rebuildGeometryBuffers();
  },

  switchTab(tabId, btnEl) {
    document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
    document.getElementById(tabId).classList.add('active');
    btnEl.classList.add('active');
  },

  toggleComparePanel() {
    const p = document.getElementById('compare-panel');
    p.classList.toggle('active');
    document.getElementById('btn-compare').classList.toggle('active', p.classList.contains('active'));
    setTimeout(() => this.resize(), 50);
  },

  changeCompareImage(src) {
    document.getElementById('compare-img-el').src = src;
  },

  updatePlanOverlay() {
    const img = document.getElementById('plan-overlay-img');
    const chk = document.getElementById('chk-plan-overlay')?.checked;
    if (!img) return;
    if (!chk) {
      img.style.display = 'none';
      return;
    }
    img.src = document.getElementById('sel-overlay-plan').value;
    img.style.opacity = document.getElementById('rng-overlay-alpha').value;
    img.style.display = 'block';
    img.style.left = '50%';
    img.style.top = '50%';
    img.style.height = '82%';
    img.style.transform = 'translate(-50%, -50%)';
  },

  populateUI() {
    const sel = document.getElementById('sel-furniture');
    if (sel) {
      sel.innerHTML = '';
      for (const f of this.data.furniture) {
        const opt = document.createElement('option');
        opt.value = f.id;
        opt.textContent = `[${f.floor}] ${f.name}`;
        sel.appendChild(opt);
      }
      if (this.data.furniture.length > 0 && !this.selectedFurnitureId) {
        this.selectFurnitureById(this.data.furniture[0].id, false);
      }
    }

    const wrap = document.getElementById('room-table-wrap');
    if (!wrap) return;
    const areaMult = this.scaleFactor * this.scaleFactor;
    let html = `<table style="width:100%;border-collapse:collapse;">
      <thead><tr style="background:#0f172a;color:#38bdf8;text-align:left;">
        <th style="padding:4px 5px;">层</th>
        <th style="padding:4px 5px;">空间名称</th>
        <th style="padding:4px 5px;">图注原值</th>
        <th style="padding:4px 5px;">模型实测</th>
      </tr></thead><tbody>`;
    for (const r of this.data.rooms) {
      const annStr = (r.annotated_area_m2 !== undefined && r.annotated_area_m2 !== null)
        ? `${r.annotated_area_m2}m²${r.area_note ? ' *' : ''}`
        : '<span style="color:#64748b;">未注</span>';
      const modVal = ((r.modeled_area_m2 || r.area_m2) * areaMult).toFixed(1);
      html += `<tr style="border-top:1px solid rgba(148,163,184,0.15);" title="${r.source}${r.area_note ? ' | ' + r.area_note : ''}">
        <td style="padding:4px 5px;font-weight:700;">${r.floor}</td>
        <td style="padding:4px 5px;">${r.name_zh}</td>
        <td style="padding:4px 5px;color:${r.area_note ? '#fbbf24' : '#38bdf8'};font-weight:600;">${annStr}</td>
        <td style="padding:4px 5px;color:#34d399;">${modVal}m²</td>
      </tr>`;
    }
    html += `</tbody></table>`;
    wrap.innerHTML = html;
  },

  selectFurnitureById(id, rebuild=true) {
    this.selectedFurnitureId = id;
    const f = this.data.furniture.find(item => item.id === id);
    if (!f) return;
    document.getElementById('sel-furniture').value = id;
    document.getElementById('inp-furn-x').value = f.x;
    document.getElementById('inp-furn-z').value = f.z;
    document.getElementById('inp-furn-rot').value = f.rot;
    document.getElementById('lbl-furn-rot').textContent = `${f.rot}°`;
    document.getElementById('inp-furn-w').value = f.w;
    document.getElementById('inp-furn-d').value = f.d;
    document.getElementById('inp-furn-h').value = f.h;
    if (rebuild) this.rebuildGeometryBuffers();
  },

  updateSelectedFurniture() {
    const f = this.data.furniture.find(item => item.id === this.selectedFurnitureId);
    if (!f) return;
    f.x = parseFloat(document.getElementById('inp-furn-x').value) || f.x;
    f.z = parseFloat(document.getElementById('inp-furn-z').value) || f.z;
    f.rot = parseFloat(document.getElementById('inp-furn-rot').value) || 0;
    f.w = Math.max(0.2, parseFloat(document.getElementById('inp-furn-w').value) || f.w);
    f.d = Math.max(0.2, parseFloat(document.getElementById('inp-furn-d').value) || f.d);
    f.h = Math.max(0.2, parseFloat(document.getElementById('inp-furn-h').value) || f.h);
    document.getElementById('lbl-furn-rot').textContent = `${f.rot}°`;
    this.rebuildGeometryBuffers();
  },

  updateBuildingHeights() {
    for (const k of ['B1', '1F', '2F', '3F']) {
      const val = parseFloat(document.getElementById('inp-h-' + k).value);
      if (val >= 2.2 && val <= 6.5) {
        this.data.floors[k].height = val;
      }
    }
    this.recalculateElevationsAndStairs();
    this.rebuildGeometryBuffers();
  },

  saveEditsToLocal() {
    const payload = {
      furniture: this.data.furniture,
      floorHeights: {
        B1: this.data.floors['B1'].height,
        '1F': this.data.floors['1F'].height,
        '2F': this.data.floors['2F'].height,
        '3F': this.data.floors['3F'].height
      }
    };
    localStorage.setItem('U11_SAVED_STATE_V7', JSON.stringify(payload));
    alert('已保存软装布局与建筑层高参数到本地存储 (刷新页面自动生效)！');
  },

  resetEdits() {
    localStorage.removeItem('U11_SAVED_STATE_V7');
    this.data = JSON.parse(JSON.stringify(window.U11_BUILDING_DATA));
    this.recalculateElevationsAndStairs();
    for (const k of ['B1', '1F', '2F', '3F']) {
      document.getElementById('inp-h-' + k).value = this.data.floors[k].height.toFixed(2);
    }
    this.selectFurnitureById(this.data.furniture[0].id, false);
    this.rebuildGeometryBuffers();
  },

  toggleMeasureMode() {
    this.measure.active = !this.measure.active;
    this.measure.pts = [];
    document.getElementById('btn-measure-toggle').classList.toggle('active', this.measure.active);
    document.getElementById('m-status').textContent = this.measure.active ? '请点击三维场景中第 1 个点' : '未开启';
  },

  clearMeasurements() {
    this.measure.pts = [];
    this.measure.segments = [];
    document.getElementById('m-dist').textContent = '-- m (-- mm)';
    document.getElementById('m-delta').textContent = '--';
    this.rebuildGeometryBuffers();
  },

  raycastFromScreen(clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect();
    const nx = ((clientX - rect.left) / rect.width) * 2 - 1;
    const ny = 1 - ((clientY - rect.top) / rect.height) * 2;
    const invVP = Mat4.invert(this.currentVPMatrix || Mat4.identity());

    const unproj = (x, y, z) => {
      const v = [
        invVP[0]*x + invVP[4]*y + invVP[8]*z + invVP[12],
        invVP[1]*x + invVP[5]*y + invVP[9]*z + invVP[13],
        invVP[2]*x + invVP[6]*y + invVP[10]*z + invVP[14],
        invVP[3]*x + invVP[7]*y + invVP[11]*z + invVP[15]
      ];
      return [v[0]/v[3], v[1]/v[3], v[2]/v[3]];
    };

    const pNear = unproj(nx, ny, -1);
    const pFar  = unproj(nx, ny, 1);
    const dir = Vec3.norm(Vec3.sub(pFar, pNear));

    let bestT = Infinity, hitPt = null;
    for (const [v0, v1, v2] of this.raycastTriangles) {
      const e1 = Vec3.sub(v1, v0);
      const e2 = Vec3.sub(v2, v0);
      const h = Vec3.cross(dir, e2);
      const a = Vec3.dot(e1, h);
      if (Math.abs(a) < 1e-7) continue;
      const f = 1.0 / a;
      const s = Vec3.sub(pNear, v0);
      const u = f * Vec3.dot(s, h);
      if (u < 0.0 || u > 1.0) continue;
      const q = Vec3.cross(s, e1);
      const v = f * Vec3.dot(dir, q);
      if (v < 0.0 || u + v > 1.0) continue;
      const t = f * Vec3.dot(e2, q);
      if (t > 0.05 && t < bestT) {
        bestT = t;
        hitPt = Vec3.add(pNear, Vec3.scale(dir, t));
      }
    }
    return hitPt;
  },

  downloadBlob(content, filename, mime) {
    const blob = new Blob([content], { type: mime });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
  },

  exportJSON() {
    this.downloadBlob(JSON.stringify(this.data, null, 2), 'u11_building_data_v2_pro.json', 'application/json');
  },

  exportCSV() {
    let rows = [['楼层', '编号', '中文名称', '英文名', '设计稿图注面积(m²)', '模型几何实测面积(m²)', '面宽(m)', '进深(m)', '标高(m)', '层高(m)', '尺寸来源与说明']];
    for (const r of this.data.rooms) {
      const fd = this.data.floors[r.floor];
      const ann = (r.annotated_area_m2 !== undefined && r.annotated_area_m2 !== null) ? r.annotated_area_m2 : '未直接标注';
      const mod = ((r.modeled_area_m2 || r.area_m2) * this.scaleFactor * this.scaleFactor).toFixed(2);
      rows.push([r.floor, r.id, r.name_zh, r.name_en, ann, mod, r.width_m, r.depth_m, fd.elevation, fd.height, r.source]);
    }
    const csvContent = '\uFEFF' + rows.map(r => r.map(c => `"${c}"`).join(',')).join('\n');
    this.downloadBlob(csvContent, 'u11_dimensions_v2_pro.csv', 'text/csv;charset=utf-8');
  },

  exportOBJ() {
    let lines = ['# U11 Villa 4-Story 3D Model Export (V2 Pro)', '# Units: meters'];
    let vIdx = 1;
    for (const [p0, p1, p2] of this.raycastTriangles) {
      lines.push(`v ${p0[0].toFixed(4)} ${p0[1].toFixed(4)} ${p0[2].toFixed(4)}`);
      lines.push(`v ${p1[0].toFixed(4)} ${p1[1].toFixed(4)} ${p1[2].toFixed(4)}`);
      lines.push(`v ${p2[0].toFixed(4)} ${p2[1].toFixed(4)} ${p2[2].toFixed(4)}`);
      lines.push(`f ${vIdx} ${vIdx+1} ${vIdx+2}`);
      vIdx += 3;
    }
    this.downloadBlob(lines.join('\n'), 'u11_villa_4f_v2_pro.obj', 'text/plain');
  },

  downloadPrebuiltGLB() {
    const a = document.createElement('a');
    a.href = 'models/u11_villa_4f.glb';
    a.download = 'u11_villa_4f.glb';
    a.click();
  },

  importJSONFile(ev) {
    const file = ev.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const obj = JSON.parse(e.target.result);
        if (obj.floors && obj.furniture) {
          this.data = obj;
          this.populateUI();
          this.rebuildGeometryBuffers();
          alert('成功加载建筑与软装 JSON 数据！');
        }
      } catch (err) { alert('JSON 解析失败: ' + err.message); }
    };
    reader.readAsText(file);
  },

  captureScreenshot() {
    const dataUrl = this.canvas.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = `U11_3D_View_${this.floorFilter}_${Date.now()}.png`;
    a.click();
  },

  bindEvents() {
    window.addEventListener('resize', () => this.resize());

    let dragging = false, dragBtn = 0, lastX = 0, lastY = 0, downX = 0, downY = 0;
    this.canvas.addEventListener('mousedown', (e) => {
      dragging = true; dragBtn = e.button;
      lastX = downX = e.clientX; lastY = downY = e.clientY;
    });
    window.addEventListener('mouseup', (e) => {
      if (dragging && Math.hypot(e.clientX - downX, e.clientY - downY) < 5) {
        this.onCanvasClick(e.clientX, e.clientY);
      }
      dragging = false;
    });
    this.canvas.addEventListener('contextmenu', e => e.preventDefault());

    window.addEventListener('mousemove', (e) => {
      if (!dragging) return;
      const dx = e.clientX - lastX, dy = e.clientY - lastY;
      lastX = e.clientX; lastY = e.clientY;

      if (this.cameraMode === 'walk') {
        this.walk.tourActive = false;
        this.walk.yaw += dx * 0.0045;
        this.walk.pitch = Math.max(-1.42, Math.min(1.42, this.walk.pitch - dy * 0.0045));
      } else if (this.cameraMode === 'orbit') {
        if (dragBtn === 2 || e.shiftKey) {
          const right = [Math.cos(this.orbit.yaw), 0, Math.sin(this.orbit.yaw)];
          const fwd   = [Math.sin(this.orbit.yaw), 0, -Math.cos(this.orbit.yaw)];
          const panSpeed = this.orbit.distance * 0.0015;
          this.orbit.target[0] -= (right[0]*dx - fwd[0]*dy) * panSpeed;
          this.orbit.target[2] -= (right[2]*dx - fwd[2]*dy) * panSpeed;
        } else {
          this.orbit.yaw += dx * 0.006;
          this.orbit.pitch = Math.max(0.08, Math.min(1.55, this.orbit.pitch + dy * 0.006));
        }
      } else if (this.cameraMode === 'ortho') {
        const scale = this.orbit.orthoZoom * 0.0022;
        this.orbit.target[0] -= dx * scale;
        this.orbit.target[2] -= dy * scale;
      }
    });

    this.canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      if (this.cameraMode === 'orbit') {
        this.orbit.distance = Math.max(3.0, Math.min(115.0, this.orbit.distance * (1 + e.deltaY * 0.001)));
      } else if (this.cameraMode === 'ortho') {
        this.orbit.orthoZoom = Math.max(3.0, Math.min(45.0, this.orbit.orthoZoom * (1 + e.deltaY * 0.001)));
      }
    }, { passive: false });

    // Mobile & Touch Screen Gestures: 1-finger orbit/look, 2-finger pinch zoom & pan, single-tap raycast
    // Filters out any touch active on #mobile-walk-pad so left thumb can steer joystick while right thumb rotates view!
    let touchCount = 0, tLastX = 0, tLastY = 0, tDownX = 0, tDownY = 0, pinchDist = 0, tMoved = false;
    const getCanvasTouches = (touchList) => {
      const arr = [];
      for (let i = 0; i < touchList.length; i++) {
        const t = touchList[i];
        if (t.target && t.target.closest && t.target.closest('#mobile-walk-pad')) continue;
        arr.push(t);
      }
      return arr;
    };
    this.canvas.addEventListener('touchstart', (e) => {
      const ct = getCanvasTouches(e.touches);
      if (ct.length === 1) {
        touchCount = 1;
        tMoved = false;
        tLastX = tDownX = ct[0].clientX;
        tLastY = tDownY = ct[0].clientY;
      } else if (ct.length >= 2) {
        touchCount = 2;
        tMoved = true;
        const dx = ct[0].clientX - ct[1].clientX;
        const dy = ct[0].clientY - ct[1].clientY;
        pinchDist = Math.hypot(dx, dy);
        tLastX = (ct[0].clientX + ct[1].clientX) * 0.5;
        tLastY = (ct[0].clientY + ct[1].clientY) * 0.5;
      }
    }, { passive: true });

    this.canvas.addEventListener('touchmove', (e) => {
      e.preventDefault();
      const ct = getCanvasTouches(e.touches);
      if (ct.length === 1 && touchCount === 1) {
        const cx = ct[0].clientX, cy = ct[0].clientY;
        const dx = cx - tLastX, dy = cy - tLastY;
        if (Math.hypot(cx - tDownX, cy - tDownY) > 6) tMoved = true;
        tLastX = cx; tLastY = cy;
        if (this.cameraMode === 'walk') {
          this.walk.tourActive = false;
          this.walk.yaw += dx * 0.005;
          this.walk.pitch = Math.max(-1.42, Math.min(1.42, this.walk.pitch - dy * 0.005));
        } else if (this.cameraMode === 'orbit') {
          this.orbit.yaw += dx * 0.0065;
          this.orbit.pitch = Math.max(0.08, Math.min(1.55, this.orbit.pitch + dy * 0.0065));
        } else if (this.cameraMode === 'ortho') {
          const scale = this.orbit.orthoZoom * 0.0025;
          this.orbit.target[0] -= dx * scale;
          this.orbit.target[2] -= dy * scale;
        }
      } else if (ct.length >= 2) {
        touchCount = 2;
        tMoved = true;
        const dx = ct[0].clientX - ct[1].clientX;
        const dy = ct[0].clientY - ct[1].clientY;
        const newDist = Math.hypot(dx, dy);
        const midX = (ct[0].clientX + ct[1].clientX) * 0.5;
        const midY = (ct[0].clientY + ct[1].clientY) * 0.5;
        const panDx = midX - tLastX, panDy = midY - tLastY;
        tLastX = midX; tLastY = midY;

        if (pinchDist > 10 && newDist > 10) {
          const ratio = pinchDist / newDist;
          if (this.cameraMode === 'orbit') {
            this.orbit.distance = Math.max(3.0, Math.min(115.0, this.orbit.distance * ratio));
          } else if (this.cameraMode === 'ortho') {
            this.orbit.orthoZoom = Math.max(3.0, Math.min(45.0, this.orbit.orthoZoom * ratio));
          }
        }
        pinchDist = newDist;

        if (this.cameraMode === 'orbit') {
          const right = [Math.cos(this.orbit.yaw), 0, Math.sin(this.orbit.yaw)];
          const fwd   = [Math.sin(this.orbit.yaw), 0, -Math.cos(this.orbit.yaw)];
          const panSpeed = this.orbit.distance * 0.0018;
          this.orbit.target[0] -= (right[0]*panDx - fwd[0]*panDy) * panSpeed;
          this.orbit.target[2] -= (right[2]*panDx - fwd[2]*panDy) * panSpeed;
        } else if (this.cameraMode === 'ortho') {
          const scale = this.orbit.orthoZoom * 0.0025;
          this.orbit.target[0] -= panDx * scale;
          this.orbit.target[2] -= panDy * scale;
        }
      }
    }, { passive: false });

    this.canvas.addEventListener('touchend', (e) => {
      const ct = getCanvasTouches(e.touches);
      if (touchCount === 1 && !tMoved && e.changedTouches.length === 1) {
        const ch = e.changedTouches[0];
        if (!ch.target || !ch.target.closest || !ch.target.closest('#mobile-walk-pad')) {
          this.onCanvasClick(ch.clientX, ch.clientY);
        }
      }
      if (ct.length === 0) {
        touchCount = 0;
      } else if (ct.length === 1) {
        touchCount = 1;
        tLastX = ct[0].clientX;
        tLastY = ct[0].clientY;
      }
    }, { passive: true });

    // 360° Game-Style Circular Analog Virtual Joystick (#mobile-walk-pad)
    const walkPad = document.getElementById('mobile-walk-pad');
    const joyKnob = document.getElementById('joystick-knob');
    if (walkPad && joyKnob) {
      let joyTouchId = null;
      let joyMouseDown = false;
      const maxRadius = 42;

      const updateJoystickFromPoint = (clientX, clientY) => {
        const rect = walkPad.getBoundingClientRect();
        const cx = rect.left + rect.width * 0.5;
        const cy = rect.top + rect.height * 0.5;
        const dx = clientX - cx;
        const dy = clientY - cy;
        const dist = Math.hypot(dx, dy);
        const clampedDist = Math.min(dist, maxRadius);
        const angle = Math.atan2(dy, dx);
        const kx = Math.cos(angle) * clampedDist;
        const ky = Math.sin(angle) * clampedDist;
        joyKnob.style.transform = `translate(calc(-50% + ${kx.toFixed(1)}px), calc(-50% + ${ky.toFixed(1)}px))`;
        const normX = kx / maxRadius;
        const normY = -ky / maxRadius; // Up on screen = positive forward (+Y)
        const mag = Math.hypot(normX, normY);
        if (mag < 0.08) {
          this.walk.joyX = 0.0;
          this.walk.joyY = 0.0;
        } else {
          this.walk.joyX = normX;
          this.walk.joyY = normY;
          this.walk.tourActive = false;
        }
      };

      const resetJoystick = () => {
        joyTouchId = null;
        joyMouseDown = false;
        this.walk.joyX = 0.0;
        this.walk.joyY = 0.0;
        this.walk.joyActive = false;
        walkPad.classList.remove('active');
        joyKnob.style.transform = 'translate(-50%, -50%)';
      };

      walkPad.addEventListener('touchstart', (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        if (ev.changedTouches.length > 0 && joyTouchId === null) {
          const t = ev.changedTouches[0];
          joyTouchId = t.identifier;
          this.walk.joyActive = true;
          walkPad.classList.add('active');
          updateJoystickFromPoint(t.clientX, t.clientY);
        }
      }, { passive: false });

      walkPad.addEventListener('touchmove', (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        if (joyTouchId === null) return;
        for (let i = 0; i < ev.touches.length; i++) {
          if (ev.touches[i].identifier === joyTouchId) {
            updateJoystickFromPoint(ev.touches[i].clientX, ev.touches[i].clientY);
            break;
          }
        }
      }, { passive: false });

      const onJoyTouchEnd = (ev) => {
        if (joyTouchId === null) return;
        for (let i = 0; i < ev.changedTouches.length; i++) {
          if (ev.changedTouches[i].identifier === joyTouchId) {
            ev.preventDefault();
            ev.stopPropagation();
            resetJoystick();
            break;
          }
        }
      };
      walkPad.addEventListener('touchend', onJoyTouchEnd, { passive: false });
      walkPad.addEventListener('touchcancel', onJoyTouchEnd, { passive: false });

      walkPad.addEventListener('mousedown', (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        joyMouseDown = true;
        this.walk.joyActive = true;
        walkPad.classList.add('active');
        updateJoystickFromPoint(ev.clientX, ev.clientY);
      });
      window.addEventListener('mousemove', (ev) => {
        if (!joyMouseDown) return;
        updateJoystickFromPoint(ev.clientX, ev.clientY);
      });
      window.addEventListener('mouseup', () => {
        if (joyMouseDown) resetJoystick();
      });
    }

    window.addEventListener('keydown', (e) => {
      if (['INPUT', 'SELECT'].includes(document.activeElement.tagName)) return;
      this.walk.keys[e.code] = true;
    });
    window.addEventListener('keyup', (e) => {
      this.walk.keys[e.code] = false;
    });
  },

  onCanvasClick(clientX, clientY) {
    const pt = this.raycastFromScreen(clientX, clientY);
    if (!pt) return;

    if (this.measure.active) {
      this.measure.pts.push(pt);
      if (this.measure.pts.length === 1) {
        document.getElementById('m-status').textContent = '已选起点，请点击第 2 个点';
        this.rebuildGeometryBuffers();
      } else if (this.measure.pts.length === 2) {
        const p1 = this.measure.pts[0], p2 = this.measure.pts[1];
        const dist = Vec3.dist(p1, p2) * this.scaleFactor;
        this.measure.segments.push({ p1, p2, dist });
        this.measure.pts = [];
        document.getElementById('m-status').textContent = '测距完成 (可继续点击测量下一组)';
        document.getElementById('m-dist').textContent = `${dist.toFixed(3)} m (${Math.round(dist*1000)} mm)`;
        document.getElementById('m-delta').textContent =
          `ΔX:${(Math.abs(p2[0]-p1[0])*this.scaleFactor).toFixed(2)}m, ΔY:${Math.abs(p2[1]-p1[1]).toFixed(2)}m, ΔZ:${(Math.abs(p2[2]-p1[2])*this.scaleFactor).toFixed(2)}m`;
        this.rebuildGeometryBuffers();
      }
      return;
    }

    let bestF = null, bestD = 1.8;
    for (const f of this.data.furniture) {
      if (this.floorFilter !== 'ALL' && this.floorFilter !== f.floor) continue;
      const d = Math.hypot(pt[0] - f.x, pt[2] - f.z);
      if (d < bestD && Math.abs(pt[1] - f.y) < 2.6) {
        bestD = d; bestF = f;
      }
    }
    if (bestF) {
      this.selectFurnitureById(bestF.id, true);
    }
  },

  resize() {
    const wrap = document.getElementById('canvas-wrap');
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = wrap.clientWidth * dpr;
    this.canvas.height = wrap.clientHeight * dpr;
    this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
  },

  updateWalkMovement(dt) {
    const k = this.walk.keys;
    let fwd = 0, right = 0;
    if (k['KeyW'] || k['ArrowUp']) fwd += 1;
    if (k['KeyS'] || k['ArrowDown']) fwd -= 1;
    if (k['KeyD'] || k['ArrowRight']) right += 1;
    if (k['KeyA'] || k['ArrowLeft']) right -= 1;
    if (Math.hypot(this.walk.joyX || 0, this.walk.joyY || 0) > 0.05) {
      fwd += this.walk.joyY;
      right += this.walk.joyX;
    }
    const mult = (k['ShiftLeft'] || k['ShiftRight']) ? 1.85 : 1.0;

    // Support WSAD / Arrow camera panning & Q/E rotation in Orbit (3D俯览) & Ortho (正交平面) modes!
    if (this.cameraMode !== 'walk') {
      if (this.cameraMode === 'orbit') {
        if (k['KeyQ']) this.orbit.yaw -= 1.4 * dt;
        if (k['KeyE']) this.orbit.yaw += 1.4 * dt;
        if (fwd !== 0 || right !== 0) {
          const len = Math.hypot(fwd, right);
          const scale = Math.min(1.0, len) / (len || 1);
          fwd *= scale; right *= scale;
          const panSpeed = Math.max(8.5, this.orbit.distance * 0.65) * mult;
          const sin = Math.sin(this.orbit.yaw), cos = Math.cos(this.orbit.yaw);
          this.orbit.target[0] += (sin * fwd + cos * right) * panSpeed * dt;
          this.orbit.target[2] += (-cos * fwd + sin * right) * panSpeed * dt;
        }
      } else if (this.cameraMode === 'ortho') {
        if (fwd !== 0 || right !== 0) {
          const len = Math.hypot(fwd, right);
          const scale = Math.min(1.0, len) / (len || 1);
          fwd *= scale; right *= scale;
          const panSpeed = Math.max(6.5, this.orbit.orthoZoom * 0.85) * mult;
          this.orbit.target[0] += right * panSpeed * dt;
          this.orbit.target[2] -= fwd * panSpeed * dt;
        }
      }
      return;
    }

    if (this.walk.tourActive && this.walk.tourWaypoints.length > 1) {
      const targetWp = this.walk.tourWaypoints[this.walk.tourIdx];
      const delta = Vec3.sub(targetWp.pos, this.walk.pos);
      const dist = Vec3.len(delta);
      const step = this.walkSpeed * dt * 0.95;
      if (dist <= step) {
        this.walk.pos = [...targetWp.pos];
        this.walk.tourIdx++;
        if (this.walk.tourIdx >= this.walk.tourWaypoints.length) {
          this.walk.tourActive = false;
        }
      } else {
        this.walk.pos = Vec3.add(this.walk.pos, Vec3.scale(delta, step / dist));
      }
      const lookDelta = Vec3.sub(targetWp.look, this.walk.pos);
      if (Vec3.len(lookDelta) > 0.05) {
        this.walk.yaw = Math.atan2(lookDelta[0], -lookDelta[2]);
        this.walk.pitch = Math.atan2(lookDelta[1], Math.hypot(lookDelta[0], lookDelta[2]));
      }
      return;
    }

    if (k['KeyQ']) this.walk.yaw -= 1.6 * dt;
    if (k['KeyE']) this.walk.yaw += 1.6 * dt;

    if (fwd !== 0 || right !== 0) {
      const len = Math.hypot(fwd, right);
      const mag = Math.min(1.0, len);
      fwd = (fwd / (len || 1)) * mag;
      right = (right / (len || 1)) * mag;
      const sin = Math.sin(this.walk.yaw), cos = Math.cos(this.walk.yaw);
      const dx = (sin * fwd + cos * right) * this.walkSpeed * mult * dt;
      const dz = (-cos * fwd + sin * right) * this.walkSpeed * mult * dt;

      const curX = this.walk.pos[0], curY = this.walk.pos[1], curZ = this.walk.pos[2];
      let nextX = curX + dx;
      let nextZ = curZ + dz;

      // Check if walker is currently on (or stepping onto) the U11 Main Spiral Staircase (scx=5.250, scz=-16.149)
      const scx = 5.250, scz = -16.149;
      const curSpStep  = this.getActiveSpiralStepAt(curX, curZ, curY);
      let   nextSpStep = this.getActiveSpiralStepAt(nextX, nextZ, curY);

      if (curSpStep || nextSpStep) {
        // 1. Solid Spiral Balustrade Edge Fall-Protection:
        //    When walking along the spiral flight (or near the inner void on landings), clamp radius to [1.06m, 2.28m]
        //    so walking into the inner or outer solid curved handrail smoothly slides along the curve and NEVER falls off!
        const nextR = Math.hypot(nextX - scx, nextZ - scz);
        const stepNum = (nextSpStep || curSpStep).step_num;
        const maxSteps = ((nextSpStep || curSpStep).y_top > 3.65) ? 21 : 24;
        const isMidFlight = (stepNum > 1 && stepNum < maxSteps);
        if (nextR < 1.06 || (( isMidFlight || nextSpStep ) && nextR > 2.28)) {
          const clampedR = Math.max(1.06, Math.min(2.28, nextR));
          nextX = scx + (nextX - scx) * (clampedR / (nextR || 1));
          nextZ = scz + (nextZ - scz) * (clampedR / (nextR || 1));
          nextSpStep = this.getActiveSpiralStepAt(nextX, nextZ, curY);
        }
      } else {
        // Even on the 1F/2F/3F landings, prevent stepping into the central spiral void eye (r < 1.06m)
        const nextRCheck = Math.hypot(nextX - scx, nextZ - scz);
        if (nextRCheck < 1.06) {
          nextX = scx + (nextX - scx) * (1.06 / (nextRCheck || 1));
          nextZ = scz + (nextZ - scz) * (1.06 / (nextRCheck || 1));
        }
      }

      let nextY = this.getFloorAndStairElevationAt(nextX, nextZ, curY);

      // Prevent falling off the side of any straight/secondary staircase when mid-flight
      if (Math.abs(nextY - curY) > 0.55) {
        // Try sliding along X or Z alone so walker stays on the stair tread
        const tryY_X = this.getFloorAndStairElevationAt(curX + dx, curZ, curY);
        const tryY_Z = this.getFloorAndStairElevationAt(curX, curZ + dz, curY);
        if (Math.abs(tryY_X - curY) <= 0.45) {
          nextX = curX + dx; nextZ = curZ; nextY = tryY_X;
        } else if (Math.abs(tryY_Z - curY) <= 0.45) {
          nextX = curX; nextZ = curZ + dz; nextY = tryY_Z;
        } else {
          nextX = curX; nextZ = curZ; nextY = curY;
        }
      }

      if (!this.isPointCollidingWithWalls(nextX, nextY, nextZ)) {
        // 2. Additive Auto-Yaw Steering Compensation on Spiral Stairs (走旋梯自动转向补偿，与手动视角无缝叠加):
        //    As the walker advances along the spiral arc from (curX, curZ) to (nextX, nextZ), automatically rotate
        //    walk.yaw by the exact angular delta dTheta traveled around (scx, scz). Manual mouse/key rotation stacks freely!
        const activeSp = this.getActiveSpiralStepAt(nextX, nextZ, nextY);
        if (curSpStep && activeSp) {
          const prevTheta = Math.atan2(curZ - scz, curX - scx);
          const nextTheta = Math.atan2(nextZ - scz, nextX - scx);
          let dTheta = nextTheta - prevTheta;
          while (dTheta > Math.PI) dTheta -= Math.PI * 2;
          while (dTheta < -Math.PI) dTheta += Math.PI * 2;
          this.walk.yaw += dTheta;
        }
        this.walk.pos[0] = nextX;
        this.walk.pos[2] = nextZ;
        this.walk.pos[1] += (nextY - this.walk.pos[1]) * Math.min(1, dt * 14);
      }
    }
  },

  updateDOMLabels(vp, width, height) {
    const gl = this.gl;
    if (this.buffers.vaoShadow && this.buffers.countShadow > 0) {
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.useProgram(this.progMain);
      gl.bindVertexArray(this.buffers.vaoShadow);
      gl.drawArrays(gl.TRIANGLES, 0, this.buffers.countShadow);
      gl.disable(gl.BLEND);
    }

    // Courtyard-only & Outdoor Rain Particle System (Indoor rooms stay 100% dry!)
    if (this.sun.weather === 'rainy' && this.sun.rainDrops.length > 0) {
      const rPos = [], rCol = [];
      const bldgOuter = [[0.14, 0.02], [25.65, 0.02], [27.34, -23.59], [2.70, -18.34]];
      const cyVoid = this.data.courtyard_void['1F_courtyard_polygon'];
      for (const d of this.sun.rainDrops) {
        d[1] -= 0.38;
        if (d[1] < -0.5) d[1] = 17.5;
        // Cull raindrops that fall inside the building roof envelope UNLESS they are inside the open-to-sky central courtyard!
        const inBuilding = pointInPoly2D(d[0], d[2], bldgOuter);
        const inCourtyard = pointInPoly2D(d[0], d[2], cyVoid);
        if (inBuilding && !inCourtyard && d[1] < 10.5) continue;
        rPos.push(d[0], d[1], d[2], d[0]-0.06, d[1]-0.82, d[2]+0.06);
        rCol.push(0.75, 0.85, 0.98, 0.65, 0.75, 0.85, 0.98, 0.22);
      }
      if (rPos.length > 0) {
        gl.useProgram(this.progLine);
        const vaoR = gl.createVertexArray();
        gl.bindVertexArray(vaoR);
        const bP = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, bP);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(rPos), gl.STREAM_DRAW);
        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
        const bC = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, bC);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(rCol), gl.STREAM_DRAW);
        gl.enableVertexAttribArray(1);
        gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 0, 0);
        gl.drawArrays(gl.LINES, 0, rPos.length / 3);
        gl.deleteBuffer(bP);
        gl.deleteBuffer(bC);
        gl.deleteVertexArray(vaoR);
      }
    }

    const container = document.getElementById('label-layer');
    const showLabels = document.getElementById('chk-room-labels')?.checked ?? false;
    container.innerHTML = '';

    const project = (pt) => {
      const x = pt[0], y = pt[1], z = pt[2];
      const cx = vp[0]*x + vp[4]*y + vp[8]*z + vp[12];
      const cy = vp[1]*x + vp[5]*y + vp[9]*z + vp[13];
      const cw = vp[3]*x + vp[7]*y + vp[11]*z + vp[15];
      if (cw <= 0.1) return null;
      const ndcX = cx / cw, ndcY = cy / cw;
      if (ndcX < -1.05 || ndcX > 1.05 || ndcY < -1.05 || ndcY > 1.05) return null;
      return [(ndcX * 0.5 + 0.5) * width, (0.5 - ndcY * 0.5) * height];
    };

    if (showLabels) {
      const areaMult = this.scaleFactor * this.scaleFactor;
      for (const r of this.data.rooms) {
        if (this.floorFilter !== 'ALL' && this.floorFilter !== r.floor) continue;
        if (this.floorFilter === 'ALL' && r.floor !== '3F' && r.id !== '1F_COURTYARD' && this.cameraMode === 'orbit') continue;
        const scr = project([r.center[0], r.center[1] + 0.65, r.center[2]]);
        if (!scr) continue;
        const div = document.createElement('div');
        div.className = 'label-3d';
        div.style.left = `${scr[0]}px`;
        div.style.top = `${scr[1]}px`;
        const annPart = (r.annotated_area_m2 !== undefined && r.annotated_area_m2 !== null)
          ? `图注 ${r.annotated_area_m2}m² · `
          : '';
        const modVal = ((r.modeled_area_m2 || r.area_m2) * areaMult).toFixed(1);
        div.innerHTML = `<b>[${r.floor}] ${r.name_zh}</b><span class="l-area">${annPart}实测 ${modVal}m²</span><span class="l-src">${r.width_m}×${r.depth_m}m | ${r.source}</span>`;
        container.appendChild(div);
      }
      if (this.floorFilter === 'ALL' && this.estateUnits && this.cameraMode !== 'walk') {
        for (const u of this.estateUnits) {
          const scr = project(u.center);
          if (!scr) continue;
          const div = document.createElement('div');
          div.className = 'label-3d';
          div.style.left = `${scr[0]}px`;
          div.style.top = `${scr[1]}px`;
          div.style.borderColor = u.id === 'Unit 10' ? '#f59e0b' : 'rgba(148, 163, 184, 0.45)';
          div.innerHTML = `<b style="color:${u.id === 'Unit 10' ? '#fbbf24' : '#e2e8f0'};">🏘️ ${u.name}</b><span class="l-src">原户型册总平图 1:1 坐标还原</span>`;
          container.appendChild(div);
        }
        if (this.tianyuanVillaLabels) {
          for (const v of this.tianyuanVillaLabels) {
            const scr = project(v.center);
            if (!scr) continue;
            const div = document.createElement('div');
            div.className = 'label-3d';
            div.style.left = `${scr[0]}px`;
            div.style.top = `${scr[1]}px`;
            div.style.borderColor = v.isFrontRow ? 'rgba(239, 68, 68, 0.75)' : 'rgba(148, 163, 184, 0.38)';
            div.style.background  = v.isFrontRow ? 'rgba(30, 15, 20, 0.88)' : 'rgba(15, 23, 42, 0.78)';
            div.innerHTML = `<b style="color:${v.isFrontRow ? '#fca5a5' : '#cbd5e1'};">🏡 田园别墅 ${v.code}</b>${v.roleDesc ? `<span class="l-src" style="color:${v.isFrontRow ? '#fcd34d' : '#94a3b8'};">${v.roleDesc}</span>` : ''}`;
            container.appendChild(div);
          }
        }
      }
    }

    for (const seg of this.measure.segments) {
      const mid = Vec3.scale(Vec3.add(seg.p1, seg.p2), 0.5);
      const scr = project([mid[0], mid[1] + 0.25, mid[2]]);
      if (!scr) continue;
      const div = document.createElement('div');
      div.className = 'label-3d measure-tag';
      div.style.left = `${scr[0]}px`;
      div.style.top = `${scr[1]}px`;
      div.textContent = `📏 ${seg.dist.toFixed(3)} m (${Math.round(seg.dist*1000)} mm)`;
      container.appendChild(div);
    }
  },

  lastTime: 0,
  loop(t) {
    const dt = Math.min(0.05, (t - this.lastTime) / 1000 || 0.016);
    this.lastTime = t;

    this.updateWalkMovement(dt);

    const gl = this.gl;
    const sc = this.sun.skyColor;
    gl.clearColor(sc[0], sc[1], sc[2], 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST);

    const aspect = this.canvas.width / Math.max(1, this.canvas.height);
    let proj, view, eyePos, camYaw = 0;

    if (this.cameraMode === 'walk') {
      eyePos = [this.walk.pos[0], this.walk.pos[1] + this.eyeHeight, this.walk.pos[2]];
      const cp = Math.cos(this.walk.pitch), sp = Math.sin(this.walk.pitch);
      const cy = Math.cos(this.walk.yaw), sy = Math.sin(this.walk.yaw);
      const center = [eyePos[0] + sy * cp, eyePos[1] + sp, eyePos[2] - cy * cp];
      proj = Mat4.perspective(this.fovDeg * Math.PI / 180, aspect, 0.15, 320.0);
      view = Mat4.lookAt(eyePos, center, [0, 1, 0]);
      camYaw = this.walk.yaw;
    } else if (this.cameraMode === 'ortho') {
      const h = this.orbit.orthoZoom;
      const w = h * aspect;
      proj = Mat4.ortho(-w, w, -h, h, 0.1, 220.0);
      eyePos = [this.orbit.target[0], 65.0, this.orbit.target[2] + 0.001];
      view = Mat4.lookAt(eyePos, this.orbit.target, [0, 0, -1]);
      camYaw = 0;
    } else {
      const cp = Math.cos(this.orbit.pitch), sp = Math.sin(this.orbit.pitch);
      const cy = Math.cos(this.orbit.yaw), sy = Math.sin(this.orbit.yaw);
      eyePos = [
        this.orbit.target[0] - sy * cp * this.orbit.distance,
        this.orbit.target[1] + sp * this.orbit.distance,
        this.orbit.target[2] + cy * cp * this.orbit.distance
      ];
      proj = Mat4.perspective(50 * Math.PI / 180, aspect, 0.2, 350.0);
      view = Mat4.lookAt(eyePos, this.orbit.target, [0, 1, 0]);
      camYaw = this.orbit.yaw;
    }

    const vp = Mat4.multiply(proj, view);
    this.currentVPMatrix = vp;

    const compassDeg = (-45 - (camYaw * 180 / Math.PI));
    const dialEl = document.getElementById('compass-dial');
    const needleEl = document.getElementById('compass-needle');
    if (dialEl) dialEl.style.transform = `rotate(${compassDeg}deg)`;
    if (needleEl) needleEl.style.transform = `rotate(${compassDeg}deg)`;
    const hudP = document.getElementById('hud-pos');
    if (hudP) hudP.textContent = `X:${eyePos[0].toFixed(1)}, Y:${eyePos[1].toFixed(1)}, Z:${eyePos[2].toFixed(1)} m`;

    gl.useProgram(this.progMain);
    gl.uniformMatrix4fv(gl.getUniformLocation(this.progMain, 'uVP'), false, vp);
    gl.uniform3fv(gl.getUniformLocation(this.progMain, 'uSunDir'), this.sun.dir);
    gl.uniform3fv(gl.getUniformLocation(this.progMain, 'uSkyColor'), this.sun.skyColor);
    gl.uniform1f(gl.getUniformLocation(this.progMain, 'uSunIntensity'), this.sun.sunIntensity);
    gl.uniform1f(gl.getUniformLocation(this.progMain, 'uAmbient'), this.sun.ambientIntensity);
    gl.uniform3fv(gl.getUniformLocation(this.progMain, 'uEyePos'), eyePos);
    const indoorWarm = (this.cameraMode === 'walk' && this.versionMode === 'v2' && (document.getElementById('chk-walk-roof')?.checked ?? true)) ? 0.22 : 0.0;
    gl.uniform1f(gl.getUniformLocation(this.progMain, 'uIndoorWarmLight'), indoorWarm);
    gl.uniform1f(gl.getUniformLocation(this.progMain, 'uStonePaintSeams'), this.stonePaintSeams ? 1.0 : 0.0);
    gl.uniform1f(gl.getUniformLocation(this.progMain, 'uFloorMatMode'), this.floorMaterialMode === 'darkgrey' ? 1.0 : 0.0);

    // Bind 3D UV Plan texture if enabled
    const chk3DUV = (this.versionMode === 'v2') && (document.getElementById('chk-3d-uv-overlay')?.checked ?? false);
    if (chk3DUV && gl.activeTexture) {
      const srcMode = document.getElementById('sel-3d-uv-source')?.value || 'design';
      const flTarget = (this.floorFilter === 'ALL') ? '1F' : this.floorFilter;
      const texMap = srcMode === 'booklet'
        ? { 'B1': 'assets/plans/huxing-5.png', '1F': 'assets/plans/huxing-2.png', '2F': 'assets/plans/huxing-3.png', '3F': 'assets/plans/huxing-4.png' }
        : { 'B1': 'assets/plans/huxing-5.png', '1F': 'assets/plans/design-1.png', '2F': 'assets/plans/design-2.png', '3F': 'assets/plans/design-3.png' };
      const tex = this.getOrLoadPlanTexture(texMap[flTarget] || 'assets/plans/design-1.png');
      if (tex) {
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.uniform1i(gl.getUniformLocation(this.progMain, 'uPlanTex'), 0);
        const bounds = (srcMode === 'booklet') ? [-7.6, 37.6, -31.2, 14.0] : [-5.2, 36.8, -26.2, 3.5];
        gl.uniform4fv(gl.getUniformLocation(this.progMain, 'uPlanBounds'), bounds);
        const alphaVal = parseFloat(document.getElementById('rng-3d-uv-alpha')?.value || '0.82');
        gl.uniform1f(gl.getUniformLocation(this.progMain, 'uPlanAlpha'), alphaVal);
      }
    }

    gl.bindVertexArray(this.buffers.vaoMain);
    if (this.buffers.countOpaque > 0) {
      gl.disable(gl.BLEND);
      gl.drawArrays(gl.TRIANGLES, 0, this.buffers.countOpaque);
    }
    if (this.buffers.countTrans > 0) {
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.drawArrays(gl.TRIANGLES, this.buffers.countOpaque, this.buffers.countTrans);
      gl.disable(gl.BLEND);
    }

    gl.useProgram(this.progLine);
    gl.uniformMatrix4fv(gl.getUniformLocation(this.progLine, 'uVP'), false, vp);
    gl.bindVertexArray(this.buffers.vaoLine);
    gl.drawArrays(gl.LINES, 0, this.buffers.countLine);

    gl.bindVertexArray(null);

    const wrap = document.getElementById('canvas-wrap');
    this.updateDOMLabels(vp, wrap.clientWidth, wrap.clientHeight);

    requestAnimationFrame((t) => this.loop(t));
  }
};

window.addEventListener('DOMContentLoaded', () => App.init());
