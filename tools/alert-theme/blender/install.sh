#!/usr/bin/env bash
# runner に Blender を入れる（`.github/workflows/alert_blender.yml` から）。この作業箱では回さない。
#   bash tools/alert-theme/blender/install.sh <blender-x.y.z-linux-x64.tar.xz> [入れる先 ~/blender]
# 画面の無い描き方（-b）でも、Blender は X と GL の部品を読み込んで起きる。runner に無い分だけ apt で足す
set -euo pipefail
tarball="$1"
dest="${2:-$HOME/blender}"
sudo apt-get update -qq
sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq --no-install-recommends \
  libxi6 libxkbcommon0 libxxf86vm1 libxfixes3 libxrender1 libgl1 libegl1 libsm6 libice6 > /dev/null
mkdir -p "$dest"
tar -xJf "$tarball" -C "$dest" --strip-components=1
"$dest/blender" -b --factory-startup -noaudio --version | head -1
