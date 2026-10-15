#!/bin/bash
# テロップの書体（M PLUS Rounded 1c、OFL）を google/fonts から落とす。
# git には入れない（1本 3.6MB あり、取り直せるので）。
set -euo pipefail
dir="$(cd "$(dirname "$0")" && pwd)/fonts"
mkdir -p "$dir"
base=https://raw.githubusercontent.com/google/fonts/main/ofl/mplusrounded1c
for f in MPLUSRounded1c-ExtraBold.ttf MPLUSRounded1c-Black.ttf; do
  [ -s "$dir/$f" ] || curl -sSfL -o "$dir/$f" "$base/$f"
done
# 版の中身が変わったら、書き出しの見た目も変わる。変わったことに気づけるように控える。
(cd "$dir" && sha256sum MPLUSRounded1c-*.ttf)
