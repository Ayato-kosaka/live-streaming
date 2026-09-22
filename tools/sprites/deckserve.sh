#!/usr/bin/env bash
# 振り返り資料を**本番と同じ形**で配る。
#   tools/sprites/deckserve.sh 4733
#   URL=http://localhost:4733/nordic_review.html node tools/sprites/deckwalk.mjs
#
# public/ だけを配ると、丸ゴシック（/fonts/maru-*.woff2）が 19本ぶん 404 になる。
# あれは site/public/fonts/ にあって、本番では npm run build:web が dist/ に
# 重ねるので同じ場所に並ぶ。**公開のときと同じ並びにしないと、
# 「JSエラー19件」が資料の不具合に見える。**
set -euo pipefail
PORT="${1:-4733}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
DIR="${TMPDIR:-/tmp}/decklike"
rm -rf "$DIR"; mkdir -p "$DIR"
# symlink で作る。写真が 3.5MB あるので、測るたびに写したくない
for f in "$ROOT"/public/*; do ln -s "$f" "$DIR/$(basename "$f")"; done
ln -s "$ROOT/site/public/fonts" "$DIR/fonts"
echo "配る場所: $DIR  →  http://localhost:$PORT/nordic_review.html"
exec python3 -m http.server "$PORT" --directory "$DIR"
