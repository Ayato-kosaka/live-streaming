#!/usr/bin/env bash
# 暗号化したものだけを、依頼を push した作業枝の shorts/.work/<dest>/ に置く。
#
# 並んだ解析の job が同じ枝へ同時に push するので、断られたら
# 枝の先を取り直して置き直す（ばらつかせた間をあけて8回）。
# rebase にしないのは、置き場が job ごとに別で、取り直して上に積めば済むから。
#
# **枝が消えていたら作り直す。** 作業枝は PR の head も兼ねていて、マージすると
# GitHub が枝を消す（delete_branch_on_merge）。解析は1時間近くかかるので、その間に
# マージされると fetch が「couldn't find remote ref」で落ち、解析の結果を丸ごと失う
# （2026-10-19 に4本ぶん失った。docs/island-misses.md #291）。だから枝が無いときは、
# この job が checkout した commit（この run の sha）の上に置いて、push で枝を作り直す。
# 2本が同時に「無い」と見て作りに来たら、遅いほうの push が断られ、次の回で
# できた枝を取って上に積む（下の繰り返しがそのまま受ける）。
#
# **平文を置かないことをここでも見る。** sealed に manifest.json / key.enc /
# payload.enc(.NNN) / sheets.key.enc / sheets.enc(.NNN)（clips の見る用の小さな封。seal.py）
# 以外が混ざっていたら、1つも置かずに落ちる。
#
# 見張り: tools/shorts/ingest/push_selftest.py（手元の bare リポジトリを origin にして回す）
set -euo pipefail
: "${BRANCH:?}" "${DEST:?}" "${KEY:?}" "${RUNNER_TEMP:?}"

case "$BRANCH" in
  claude/*) ;;
  *) echo "!! claude/ 以外の枝には置かない: $BRANCH"; exit 1 ;;
esac
case "$DEST" in
  *..*|/*|"") echo "!! 置き場の道が変: $DEST"; exit 1 ;;
esac

# 字幕だけの道（captions の job）は1つの job で何本も封をするので、置き場ごとに SEALED で指す
src="${SEALED:-$RUNNER_TEMP/sealed}"
[ -d "$src" ] || { echo "!! 封の置き場が無い: $src"; exit 1; }
for f in "$src"/*; do
  case "$(basename "$f")" in
    manifest.json|key.enc|payload.enc|payload.enc.[0-9][0-9][0-9]) ;;
    sheets.key.enc|sheets.enc|sheets.enc.[0-9][0-9][0-9]) ;;
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
# 枝が消えていたときに積む先。繰り返しの中では HEAD が動くので、先に控える
base="$(git rev-parse HEAD)"

for i in 1 2 3 4 5 6 7 8; do
  # `--exit-code` は「当たる枝が無い」ときだけ 2 を返す。通信が落ちた・読めないときは
  # 別の値（128 など）。**2 のときだけ作り直す。** 読めなかったことは、枝が無いことの
  # 証拠ではない。読めなかったときは前と同じく下の fetch に進み、そこで落ちる
  found=0
  git ls-remote --quiet --exit-code origin "refs/heads/$BRANCH" > /dev/null || found=$?
  if [ "$found" -eq 2 ]; then
    recreate=1
    echo "枝 $BRANCH が origin に無い（PR のマージで消えたとみられる）。この run の ${base:0:12} の上に置いて、枝を作り直す"
    git checkout --quiet -B shorts-ingest-out "$base"
  else
    recreate=0
    git fetch --quiet --depth=1 origin "$BRANCH"
    git checkout --quiet -B shorts-ingest-out FETCH_HEAD
  fi
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
    if [ "$recreate" -eq 1 ]; then
      # 注記にも出す。枝を消した側（マージした人）が、古い土台の枝が戻ったことを run の頭で読めるように
      echo "::warning::置いた: $target（枝 $BRANCH が消えていたので、${base:0:12} の上に作り直した）"
    else
      echo "置いた: $target"
    fi
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
