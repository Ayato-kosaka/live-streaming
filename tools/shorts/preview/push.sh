#!/usr/bin/env bash
# 暗号化した署名付き URL を、作業枝の shorts/.work/<PLACE>/<name>/ に置く（Actions の中で）。
#
#   SEALED=$RUNNER_TEMP/sealed BRANCH=claude/… PLACE=preview bash tools/shorts/preview/push.sh
#
# 置き場の作りは tools/shorts/ingest/push.sh と同じ（断られたら取り直して8回まで）。
# 別に置いているのは、あちらは「材料」の1本ずつで、こちらは依頼ぶんを1回の commit に
# まとめて置くから。**平文を置かないことはここでも見る。** manifest.json / key.enc /
# payload.enc(.NNN) 以外が混ざっていたら、1つも置かずに落ちる。
set -euo pipefail
: "${SEALED:?}" "${BRANCH:?}" "${PLACE:?}"

case "$BRANCH" in
  claude/*) ;;
  *) echo "!! claude/ 以外の枝には置かない: $BRANCH"; exit 1 ;;
esac
case "$PLACE" in
  preview|render) ;;
  *) echo "!! 置き場の名前が変: $PLACE"; exit 1 ;;
esac

names=()
for d in "$SEALED"/*/; do
  [ -d "$d" ] || continue
  n="$(basename "$d")"
  case "$n" in
    *..*|"") echo "!! 名前が変: $n"; exit 1 ;;
  esac
  for f in "$d"*; do
    case "$(basename "$f")" in
      manifest.json|key.enc|payload.enc|payload.enc.[0-9][0-9][0-9]) ;;
      *) echo "!! 置かないはずのものが混ざっている: $n/$(basename "$f")"; exit 1 ;;
    esac
    if [ "$(stat -c %s "$f")" -ge $((90 * 1024 * 1024)) ]; then
      echo "!! 90MB 以上のファイルがある: $n/$(basename "$f")"
      exit 1
    fi
  done
  names+=("$n")
done
if [ "${#names[@]}" -eq 0 ]; then
  echo "置くものが無い"
  exit 0
fi

git config user.name "github-actions[bot]"
git config user.email "41898282+github-actions[bot]@users.noreply.github.com"

for i in 1 2 3 4 5 6 7 8; do
  git fetch --quiet --depth=1 origin "$BRANCH"
  git checkout --quiet -B shorts-preview-out FETCH_HEAD
  for n in "${names[@]}"; do
    t="shorts/.work/$PLACE/$n"
    rm -rf "$t"
    mkdir -p "$t"
    cp "$SEALED/$n"/* "$t"/
    git add -A "$t"
  done
  if git diff --cached --quiet; then
    echo "変わりなし"
    exit 0
  fi
  git commit --quiet -F - <<EOF
ショートの${PLACE}の署名付き URL を暗号化して置く（${names[*]}・run ${RUN_ID:-?}）

作業箱には GCP の資格情報が無いので、上げる・見る URL を Actions で作って渡す。
URL は持っている人なら誰でも使える鍵なので、依頼の公開鍵で包んだものだけを置く。
EOF
  if git push --quiet origin "HEAD:refs/heads/$BRANCH"; then
    echo "置いた: ${names[*]}"
    exit 0
  fi
  w=$(( (RANDOM % 8) + 2 * i ))
  echo "push を断られた。${w}秒あけて取り直す"
  sleep "$w"
done
echo "!! 8回とも push できなかった"
exit 1
