#!/bin/bash
# 一键切换或彻底还原 U11 别墅 3D 版本 (V1 经典原版 <-> V2 融合增强版)
set -e
DIR="$(cd "$(dirname "$0")" && pwd)"

if [ "$1" = "v1" ] || [ "$1" = "restore" ]; then
  echo "正在彻底还原至【V1 经典原版 (backup_v1_classic)】..."
  cp "$DIR/backup_v1_classic/index.html" "$DIR/index.html"
  cp "$DIR/backup_v1_classic/app.js" "$DIR/app.js"
  cp "$DIR/backup_v1_classic/data/u11_building_data.json" "$DIR/data/u11_building_data.json"
  cp "$DIR/backup_v1_classic/data/u11_building_data.js" "$DIR/data/u11_building_data.js"
  cp "$DIR/backup_v1_classic/data/u11_dimensions.csv" "$DIR/data/u11_dimensions.csv"
  cp "$DIR/backup_v1_classic/models/u11_villa_4f.glb" "$DIR/models/u11_villa_4f.glb"
  cp "$DIR/backup_v1_classic/models/u11_villa_4f.obj" "$DIR/models/u11_villa_4f.obj"
  cp "$DIR/backup_v1_classic/screenshots/"*.png "$DIR/screenshots/"
  echo "✅ 已 100% 彻底还原至【V1 经典原版】！"
elif [ "$1" = "v2" ]; then
  if [ -d "$DIR/backup_v2_enhanced" ]; then
    echo "正在切换至【V2 融合增强版 (backup_v2_enhanced)】..."
    cp "$DIR/backup_v2_enhanced/index.html" "$DIR/index.html"
    cp "$DIR/backup_v2_enhanced/app.js" "$DIR/app.js"
    cp "$DIR/backup_v2_enhanced/data/u11_building_data.json" "$DIR/data/u11_building_data.json"
    cp "$DIR/backup_v2_enhanced/data/u11_building_data.js" "$DIR/data/u11_building_data.js"
    cp "$DIR/backup_v2_enhanced/data/u11_dimensions.csv" "$DIR/data/u11_dimensions.csv"
    cp "$DIR/backup_v2_enhanced/models/u11_villa_4f.glb" "$DIR/models/u11_villa_4f.glb"
    cp "$DIR/backup_v2_enhanced/models/u11_villa_4f.obj" "$DIR/models/u11_villa_4f.obj"
    cp "$DIR/backup_v2_enhanced/screenshots/"*.png "$DIR/screenshots/"
    echo "✅ 已切换至【V2 融合增强版】！"
  else
    echo "V2 备份目录尚未生成。"
  fi
else
  echo "用法:"
  echo "  bash switch_version.sh v1       # 彻底还原为 V1 经典原版"
  echo "  bash switch_version.sh v2       # 切换为 V2 融合增强版"
  echo "  或直接双击打开 backup_v1_classic/index.html 浏览 V1 经典原版"
fi
