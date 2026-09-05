#!/usr/bin/env bash
# 確認用ビルドを、1本ずつ順番に回す。
#
# 並列で作業していると `next build` が同時に3本走って load average が130まで行き、
# 箱がコマンドを返さなくなる（4コア）。1本あたり40秒なので、待ったほうが速い。
#
#   tools/build.sh 3130          # NEXT_DIST_DIR=.next-3130 で1本
#
# 待っているあいだは、他の人のビルドが終わるのを待つだけ。順番は来る。
set -euo pipefail
port="${1:?ポート番号を渡してください（例: tools/build.sh 3130）}"
root="$(cd "$(dirname "$0")/.." && pwd)"
echo "他のビルドが終わるのを待っています（同時に1本だけ回します）..."
cd "$root/site"
exec flock "$root/.buildlock" env NEXT_DIST_DIR=".next-$port" npx next build
