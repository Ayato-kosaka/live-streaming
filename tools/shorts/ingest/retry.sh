#!/usr/bin/env bash
# 道具を入れるコマンドを、上限つきで走らせ、止まったら1回だけ取り直す。
#
#   bash tools/shorts/ingest/retry.sh 秒 コマンド…
#   bash tools/shorts/ingest/retry.sh 180 sudo apt-get update -qq
#
# **なぜ要るか（#1014）。** ふだん20〜40秒で終わる「道具を入れる」が、2026-10-22 の
# フォカッチャの回（VusdZVyjgjQ）で32分止まった（apt か pip。どちらも黙って待ち続け、
# job の上限 330分まで誰も切らない）。止まったものは待っても戻らないことが多く、
# 取り直すと20秒で通る。だから1つのコマンドに上限を置き、越えたら切って1回だけやり直す。
#
# - `sudo` で始まるものは `sudo timeout …` にする。上限を root の側で数えないと、
#   root で走る apt-get や dpkg に切る合図が届かない
# - apt を途中で切ると dpkg が半端なまま残るので、取り直す前に `dpkg --configure -a`
# - 2回とも駄目なら 1 で帰る（step ごと赤くする。黙って次へ進まない）
#
# 見張り: tools/shorts/ingest/quick_captions_selftest.py（leg retry）
# 書き出し（shorts_render.yml の「道具を入れる」）も、この道のまま呼ぶ。置き場や引数を変えるときは、
# あちらと見張り tools/shorts/render/install_selftest.py も直す
set -uo pipefail
lim="${1:?上限の秒}"
shift
[ "$#" -gt 0 ] || { echo "!! コマンドが無い"; exit 2; }
if [ "$1" = "sudo" ]; then
  shift
  cmd=(sudo timeout --kill-after=15 "$lim" "$@")
else
  cmd=(timeout --kill-after=15 "$lim" "$@")
fi
what="${*:1:3}"
for n in 1 2; do
  t0=$(date +%s)
  "${cmd[@]}"
  rc=$?
  [ "$rc" -eq 0 ] && exit 0
  took=$(( $(date +%s) - t0 ))
  if [ "$rc" -eq 124 ] || [ "$rc" -eq 137 ]; then
    why="${lim}秒で終わらないので切った"
  else
    why="終了コード $rc"
  fi
  # 注記（::warning::）にも出す。ログが読めない箱からも、どこで止まったかが run の頁で読める
  echo "::warning::${what} … ${why}（${n}回目・${took}秒）"
  if [ "$n" -eq 1 ]; then
    case "$what" in
      # 片づけそのものにも上限を置く（trigger の続きで、これも止まることがある）
      *apt-get*|*dpkg*) sudo timeout --kill-after=10 "$lim" dpkg --configure -a || true ;;
    esac
    sleep "${RETRY_PAUSE:-10}"
    echo "   取り直す"
  fi
done
exit 1
