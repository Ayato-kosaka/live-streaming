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
# 3. それでも ffmpeg が無ければ、GitHub の静的ビルド（BtbN/FFmpeg-Builds）の**版の決まった枝**を落として置く。
#    書体（fonts-dejavu-core）は無くても進む（media.py は PIL の既定の書体に落ちる）
#
# **master の夜間版は使わない（#1015、2026-10-23）。** 前はここが `ffmpeg-master-latest` だった。
# ショートの見張りの CI で apt が2回切られて夜間版（N-127941-g303510f9d1-20261022）に落ちた晩、
# `-vsync` が消えていて（9.0 の枝から）書き出しの検査が終了コード 8 で止まり、`+` で長くつないだ select の式も
# 深さの上限（8.1 の枝から）で止まった。夜間版は毎晩変わるので、落ちた理由が run ごとに違いうる。
# 枝（`ffmpeg-nX.Y-latest`）は点の版（n8.1.3 → n8.1.4）しか動かない。枝は古い順に当てる（8.1 → 9.0）。
# 2026-10-23 に手元で、品質チェックの見張り2本（qa_selftest・qa_video_selftest）と selectexpr_selftest が
# n8.1.3・n9.0.2 で通ることを確かめた。同じ日の夜間版（N-127941）は、式と -vsync を直したあとも
# qa の similar_run が、字なしの版を持たない壊し方13本で落ちた（clean は通る。ほかに clipped の loudness）。
# BtbN の latest に置かれる枝は新しい2本だけ（2026-10-23 は 8.1 と 9.0。7.1 はもう無い）なので、
# **どの枝も落とせなければ、夜間版に逃げずに赤くして止まる。** そのときは FFMPEG_STATIC_BRANCHES の既定を
# いま置かれている枝に上げる（tools/shorts/render/selectexpr_selftest.py を、その版の ffmpeg で回してから）。
#
# 切り替えたことは `::warning::` で run の頁に出す（ログが読めない箱からも注記は読める）。
# 見張り: tools/shorts/ingest/quick_captions_selftest.py（leg ffmpeg）
# 書き出し（shorts_render.yml の「道具を入れる」）も、この道のまま呼ぶ。置き場や引数を変えるときは、
# あちらと見張り tools/shorts/render/install_selftest.py も直す
set -uo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
R=(bash "$here/retry.sh")
BIN="${FFMPEG_BIN:-/usr/local/bin}"
# 当てる枝（古い順）。FFMPEG_STATIC_URL を渡せば、枝を当てずにその1つだけを落とす（見張りの偽物用）
BRANCHES="${FFMPEG_STATIC_BRANCHES:-8.1 9.0}"
BASE="https://github.com/BtbN/FFmpeg-Builds/releases/download/latest"

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

echo "::warning::apt で ffmpeg が入らない。GitHub の静的ビルド（版の決まった枝: ${FFMPEG_STATIC_URL:-$BRANCHES}）に切り替える"
tmp="$(mktemp -d)"
# 「枝|URL」を当てる順に並べる（FFMPEG_STATIC_URL があればそれ1つ。枝が決まらないので版は聞かない）
if [ -n "${FFMPEG_STATIC_URL:-}" ]; then
  urls=("url|$FFMPEG_STATIC_URL")
else
  urls=()
  for v in $BRANCHES; do urls+=("$v|$BASE/ffmpeg-n${v}-latest-linux64-gpl-${v}.tar.xz"); done
fi
got=""
for u in "${urls[@]}"; do
  if "${R[@]}" 180 curl -fsSL --retry 3 --connect-timeout 20 -o "$tmp/ffmpeg.tar.xz" "${u#*|}"; then
    got="${u%%|*}"
    break
  fi
  echo "::warning::静的ビルド（${u%%|*}）が落とせない。次を当てる"
done
if [ -z "$got" ]; then
  echo "::error::apt でも、版の決まった静的ビルド（${FFMPEG_STATIC_URL:-$BRANCHES}）でも ffmpeg が入らない。" \
       "夜間版には逃げない（#1015）。BtbN の latest に今ある枝を見て、ffmpeg.sh の FFMPEG_STATIC_BRANCHES を上げる"
  exit 1
fi
tar -xJf "$tmp/ffmpeg.tar.xz" -C "$tmp" || exit 1
ff="$(find "$tmp" -type f -name ffmpeg -path '*/bin/*' | head -1)"
fp="$(find "$tmp" -type f -name ffprobe -path '*/bin/*' | head -1)"
[ -n "$ff" ] && [ -n "$fp" ] || { echo "!! 静的ビルドに ffmpeg / ffprobe が無い"; exit 1; }
# 名前は枝でも、中身が別の版（夜間版など）なら置かない。置く前に、落とした物そのものに版を聞く
ver="$("$ff" -version 2>/dev/null | head -1)"
if [ "$got" != "url" ] && [[ "$ver" != "ffmpeg version n${got}"* ]]; then
  echo "::error::${got} の枝のはずの静的ビルドが「${ver:0:60}」と名乗る。版の分からないものは置かない"
  exit 1
fi
sudo install -m 0755 "$ff" "$fp" "$BIN/"
rm -rf "$tmp"
have || { echo "!! 静的ビルドを置いたが ffmpeg が見えない（$BIN が PATH に無い？）"; exit 1; }
echo "::warning::静的ビルドを置いた: $(ffmpeg -version | head -1 | cut -c1-60)（作業箱の 6.1.1 とは版が違う）"
