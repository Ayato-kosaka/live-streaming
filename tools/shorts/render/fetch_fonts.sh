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

# 大きい字の「白・黒縁の揺れ」と「筆の拡大」の書体（Kaisei Tokumin ExtraBold、OFL）。
# 参考のショート（HPJrXDpkfuo）の字形といちばん重なった（2026-10-16 の計測）。版を固定して確かめる
kt="$dir/KaiseiTokumin-ExtraBold.ttf"
[ -s "$kt" ] || curl -sSfL -o "$kt" \
  https://raw.githubusercontent.com/google/fonts/main/ofl/kaiseitokumin/KaiseiTokumin-ExtraBold.ttf
echo "bf44bb3e23cc703bfb19111833f78e651998d0a2b1863eff9e88cecb38a8bc53  $kt" | sha256sum -c -

# 感情の字幕の書体（どれも OFL）。不安・落胆・困惑は Yusei Magic（手書きの揺れ）、喜び・おいしいは
# Hachi Maru Pop（丸い手書き）、ワクワク・決意は Mochiy Pop One（太いポップ）。あやとの直し（#926、
# 2026-10-16「もっと感情に合わせてフォントとか色変えて欲しい」）で、統括が字形を見比べて選んだ
while read -r sum name path; do
  f="$dir/$name"
  [ -s "$f" ] || curl -sSfL -o "$f" "https://raw.githubusercontent.com/google/fonts/main/ofl/$path/$name"
  echo "$sum  $f" | sha256sum -c -
done <<'FONTS'
82098615f39ed9da6a8ccc674b9006e49c70dd5b775a7a1697f6bedd22ce25a2 YuseiMagic-Regular.ttf yuseimagic
78408910c8f1a2f174a279cbc1484b48b71780039eba3fe1be2bfcc5d4df3f98 HachiMaruPop-Regular.ttf hachimarupop
9e009430e1316c271a5f34759c6b65fc343c4e806f193042528887e7235a92c6 MochiyPopOne-Regular.ttf mochiypopone
FONTS

# 顔の見つけ役（face_scan.py）が使う YuNet（OpenCV Zoo、MIT）。git には入れない。
# raw.githubusercontent.com は LFS の札（131バイト）しか返さないので、media の側から取る。
# 中身が札でないことを、LFS の札に書かれた sha256 で確かめる。
mdir="$(cd "$(dirname "$0")" && pwd)/models"
mkdir -p "$mdir"
yunet="$mdir/face_detection_yunet_2023mar.onnx"
[ -s "$yunet" ] || curl -sSfL -o "$yunet" \
  https://media.githubusercontent.com/media/opencv/opencv_zoo/main/models/face_detection_yunet/face_detection_yunet_2023mar.onnx
echo "8f2383e4dd3cfbb4553ea8718107fc0423210dc964f9f4280604804ed2552fa4  $yunet" | sha256sum -c -
