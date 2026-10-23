#!/usr/bin/env bash
# ffmpeg（と頼まれた apt の包み）を入れる。**apt が詰まったら、GitHub の静的ビルドに切り替える。**
#
#   bash tools/shorts/ingest/ffmpeg.sh                      # fetch の job（ffmpeg だけ）
#   bash tools/shorts/ingest/ffmpeg.sh fonts-dejavu-core    # analyze の job（シートの字の書体も）
#
# **なぜ要るか（#1014）。** 2026-10-22 の晩、apt-get install ffmpeg が何度も止まった。
# フォカッチャの回の analyze は道具の入れで32分、そのあとの clips の fetch は上限（retry.sh）で
# 4分ずつ2回切られて落ちた。ubuntu-latest が Ubuntu 26 へ移り始めた時期で（Actions の注記）、
# 鏡の側の詰まりは、こちらが待っても取り直しても戻らないことがある。そこで、
#
# 1. もう入っていれば何もしない（apt に触らない）
# 2. apt で入れる（--no-install-recommends。映像の駆動系など要らない包みを落とさない。
#    man-db の索引の作り直しも止める）。コマンドごとに上限を置き、止まったら1回だけ取り直す（retry.sh）
# 3. それでも ffmpeg が無ければ、GitHub の静的ビルド（BtbN/FFmpeg-Builds）を落として置く。
#    書体（fonts-dejavu-core）は無くても進む（media.py は PIL の既定の書体に落ちる）
#
# 切り替えたことは `::warning::` で run の頁に出す（ログが読めない箱からも注記は読める）。
# 見張り: tools/shorts/ingest/quick_captions_selftest.py（leg ffmpeg）
# 書き出し（shorts_render.yml の「道具を入れる」）も、この道のまま呼ぶ。置き場や引数を変えるときは、
# あちらと見張り tools/shorts/render/install_selftest.py も直す
set -uo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
R=(bash "$here/retry.sh")
BIN="${FFMPEG_BIN:-/usr/local/bin}"
URL="${FFMPEG_STATIC_URL:-https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-linux64-gpl.tar.xz}"

have() { command -v ffmpeg > /dev/null && command -v ffprobe > /dev/null; }

need=()
have || need+=(ffmpeg)
for p in "$@"; do
  dpkg -s "$p" > /dev/null 2>&1 || need+=("$p")
done
if [ "${#need[@]}" -eq 0 ]; then
  echo "ffmpeg と ${*:-（ほかの包みなし）} は入っている。apt に触らない"
  exit 0
fi

"${R[@]}" "${APT_UPDATE_SEC:-90}" sudo apt-get update -qq \
  || echo "::warning::apt-get update が通らない（上限で2回切った）。古い一覧のまま入れてみる"
# man-db の索引の作り直しを止める。包みを入れるたびに dpkg の trigger で走り、ランナーでは
# 何分もかかることがある（ffmpeg は依存が多く、man のページを持つ包みも多い）。
# ここで要るのは ffmpeg だけで、man は読まない
sudo rm -f "${MANDB_FLAG:-/var/lib/man-db/auto-update}"
if "${R[@]}" "${APT_INSTALL_SEC:-150}" sudo apt-get install -y -qq --no-install-recommends \
    -o DPkg::Lock::Timeout=60 "${need[@]}"; then
  have && { echo "apt で入れた: ${need[*]}"; exit 0; }
fi

if have; then
  echo "::warning::apt で ${need[*]} が入らなかった。ffmpeg はあるので続ける（書体が無ければ既定の書体になる）"
  exit 0
fi

echo "::warning::apt で ffmpeg が入らない。GitHub の静的ビルドに切り替える"
tmp="$(mktemp -d)"
"${R[@]}" 180 curl -fsSL --retry 3 --connect-timeout 20 -o "$tmp/ffmpeg.tar.xz" "$URL" || exit 1
tar -xJf "$tmp/ffmpeg.tar.xz" -C "$tmp" || exit 1
ff="$(find "$tmp" -type f -name ffmpeg -path '*/bin/*' | head -1)"
fp="$(find "$tmp" -type f -name ffprobe -path '*/bin/*' | head -1)"
[ -n "$ff" ] && [ -n "$fp" ] || { echo "!! 静的ビルドに ffmpeg / ffprobe が無い"; exit 1; }
sudo install -m 0755 "$ff" "$fp" "$BIN/"
rm -rf "$tmp"
have || { echo "!! 静的ビルドを置いたが ffmpeg が見えない（$BIN が PATH に無い？）"; exit 1; }
echo "静的ビルドを置いた: $(ffmpeg -version | head -1 | cut -c1-60)"
