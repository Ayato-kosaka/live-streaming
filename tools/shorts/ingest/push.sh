#!/usr/bin/env bash
# 暗号化したものだけを、依頼を push した作業枝の shorts/.work/<dest>/ に置く。
#
# 並んだ解析の job が同じ枝へ同時に push するので、断られたら
# 枝の先を取り直して置き直す（ばらつかせた間をあけて8回）。
# rebase にしないのは、置き場が job ごとに別で、取り直して上に積めば済むから。
#
# **平文を置かないことをここでも見る。** sealed に manifest.json / key.enc /
# payload.enc(.NNN) 以外が混ざっていたら、1つも置かずに落ちる。
set -euo pipefail
: "${BRANCH:?}" "${DEST:?}" "${KEY:?}" "${RUNNER_TEMP:?}"

case "$BRANCH" in
  claude/*) ;;
  *) echo "!! claude/ 以外の枝には置かない: $BRANCH"; exit 1 ;;
esac
case "$DEST" in
  *..*|/*|"") echo "!! 置き場の道が変: $DEST"; exit 1 ;;
esac

src="$RUNNER_TEMP/sealed"
for f in "$src"/*; do
  case "$(basename "$f")" in
    manifest.json|key.enc|payload.enc|payload.enc.[0-9][0-9][0-9]) ;;
    *) echo "!! 置かないはずのものが混ざっている: $(basename "$f")"; exit 1 ;;
  esac
  # GitHub は 100MB を超えるファイルの push を断る。断られてから8回粘るより、
  # 置く前に止める（seal.py は 45MB で切るので、ここに掛かるのは切り忘れ）
  if [ "$(stat -c %s "$f")" -ge $((90 * 1024 * 1024)) ]; then
    echo "!! 90MB 以上のファイルがある: $(basename "$f")（seal.py の切り方を見る）"
    exit 1
  fi
done

git config user.name "github-actions[bot]"
git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
target="shorts/.work/$DEST"

for i in 1 2 3 4 5 6 7 8; do
  git fetch --quiet --depth=1 origin "$BRANCH"
  git checkout --quiet -B shorts-ingest-out FETCH_HEAD
  rm -rf "$target"
  mkdir -p "$target"
  cp "$src"/* "$target"/
  git add -A "$target"
  if git diff --cached --quiet; then
    echo "変わりなし"
    exit 0
  fi
  git commit --quiet -F - <<EOF
ショートの材料を暗号化して置く（${KEY}・run ${RUN_ID:-?}）

見どころ探しの材料（字幕・コンタクトシート・数値の時系列）は統括が
手元で復号して読む。リポジトリが公開なので、置くのは暗号文と
「何がいくつ・何バイト・成否」だけの manifest.json に限る。
EOF
  if git push --quiet origin "HEAD:refs/heads/$BRANCH"; then
    echo "置いた: $target"
    exit 0
  fi
  # 37本を12本ずつ並べると、同じ秒に何本も積みに来る。待ちを揃えると
  # 揃ってまたぶつかるので、ばらつかせる
  w=$(( (RANDOM % 8) + 2 * i ))
  echo "push を断られた。${w}秒あけて取り直す"
  sleep "$w"
done
echo "!! 8回とも push できなかった"
exit 1
