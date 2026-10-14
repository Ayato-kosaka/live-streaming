#!/usr/bin/env bash
# 確認用ビルドを、**箱じゅうで1本ずつ**順番に回す。
#
#   tools/build.sh 3130          # NEXT_DIST_DIR=.next-3130 で1本
#
# 並列で `next build` が3本同時に走ると load average が130まで行って、箱が
# `cat /proc/loadavg` すら返さなくなる（4コア）。1本40秒なので、待ったほうが速い。
#
# ## 鍵は、この置き場の外に置く
#
# 前は `$root/.buildlock` だった。**worktree ごとに別の鍵になる。**
# このリポジトリは worktree を切って並行で作業するのがふつうなので、
# 「同時に1本だけ」と書いてあるのに**誰も待っていなかった。**
# 2026-10-14 に担当を10人並べたとき、`.buildlock` が8つ在った（＝8本が
# 鍵を取り合わずに走れた）。鍵は**箱に1つ**でないと意味がない。
#
# ## 始める前に、置き場を見る
#
# 同じ晩に箱の置き場が尽きた。`df` は「252G のうち 38G しか使っていないのに
# 空きが 4.7M」で、**書くほうだけが黙って失敗した。** 落ちたのはビルドではなく
# 道具の出力で、原因が見えなかった。`python/disk_guard.py` が、古い書き出しを
# 掃いてから「足りるか」を答える。足りなければ**始めない**（終了コード 2）。
set -euo pipefail
port="${1:?ポート番号を渡してください（例: tools/build.sh 3130）}"
root="$(cd "$(dirname "$0")/.." && pwd)"

python3 "$root/python/disk_guard.py"

echo "他のビルドが終わるのを待っています（箱じゅうで同時に1本だけ回します）..."
cd "$root/site"
exec flock /tmp/live-streaming-build.lock env NEXT_DIST_DIR=".next-$port" npx next build
