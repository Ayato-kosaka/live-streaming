#!/bin/sh
# EC2 に venv を作る。何度流してもよい（入っているものは入れ直さない）。
#
#   sudo -u ubuntu -H sh /home/ubuntu/cardimport/app/card_import/setup.sh
#
# 置き場は /home/ubuntu/cardimport/（docs/card-import.md 1章）:
#   app/card_import/  道具（手元から ec2.py put で置く。公開のリポジトリと同じ中身）
#   venv/             torch（CPU 版）・open_clip・pillow-heif
#   hf/               CLIP の重み（HF_HOME。~/.cache に置くと Chrome の複製と同じ所を食う）
#   state.sqlite keep/ sheets/ out/   台帳と、選んだ写真
#
# torch は CPU 版の wheel（download.pytorch.org/whl/cpu）。既定の wheel は CUDA の部品を
# 引いて数GB になり、空きが 6.8GB しか無い箱に入らない。
set -eu
R=${CARD_IMPORT_ROOT:-/home/ubuntu/cardimport}
mkdir -p "$R/app" "$R/hf"
if [ ! -x "$R/venv/bin/python" ]; then
  python3 -m venv "$R/venv"
fi
P="$R/venv/bin/pip"
"$P" install --no-cache-dir -q --upgrade pip
"$R/venv/bin/python" -c "import torch" 2>/dev/null ||
  "$P" install --no-cache-dir -q torch torchvision --index-url https://download.pytorch.org/whl/cpu
"$R/venv/bin/python" -c "import open_clip, pillow_heif" 2>/dev/null ||
  "$P" install --no-cache-dir -q open_clip_torch pillow pillow-heif
# 重みを先に落としておく（scan の頭で待たない）
HF_HOME="$R/hf" "$R/venv/bin/python" -c "
import open_clip
open_clip.create_model_and_transforms('ViT-B-32', pretrained='laion2b_s34b_b79k')
print('CLIP の重み: 済み')"
du -sh "$R/venv" "$R/hf" 2>/dev/null || true
df -h "$R" | tail -1
