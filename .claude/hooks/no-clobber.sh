#!/usr/bin/env bash
# **既にある道具を、新規作成のつもりで書き潰させない。**
#
# ## なぜ要るか
#
# 2026-09-22、撮り比べの道具を `tools/sprites/atlasshot.mjs` という名前で
# 書いて、**同名の既存の道具（`/atlas` の島の模型を撮るもの）を上書きした。**
# `docs/island-misses.md` から3か所で名指しされている道具だった。
# `git status` の ` M` に気づいて戻せたが、気づかなければ黙って消えていた。
#
# 道具が1本消えても、**赤くならない。** 次にそれを呼ぶ人が「無い」と言うまで
# 誰も気づかない。だから書く前に止める。
#
# 直すときは Edit を使う。**Write は「新しく作る」ためのもの**として扱う。
#
# 標準入力に {"tool_name": "...", "tool_input": {"file_path": "..."}} が来る。
# 終了コード 2 = 止める（標準エラーがこちらに返る）。
set -uo pipefail
root=$(git rev-parse --show-toplevel 2>/dev/null || echo .)
payload=$(cat)

p=$(printf '%s' "$payload" | python3 -c '
import json, sys
try:
    d = json.load(sys.stdin)
except Exception:
    print(""); raise SystemExit
if d.get("tool_name") != "Write":
    print(""); raise SystemExit
print((d.get("tool_input") or {}).get("file_path", ""))
' 2>/dev/null)

[ -z "$p" ] && exit 0
case "$p" in /*) f="$p" ;; *) f="$root/$p" ;; esac
[ -f "$f" ] || exit 0

# 見張るのは「呼ばれて初めて効くもの」。画面や手引きは対象外
rel=${f#"$root"/}
case "$rel" in
  tools/*|python/*|.github/workflows/*|.claude/hooks/*) ;;
  *) exit 0 ;;
esac

{
  echo "**${rel} は既にあります。Write で丸ごと置き換えようとしています。**"
  echo
  echo "  $(wc -l < "$f") 行 / 最後に触られたのは $(git log -1 --format=%ad --date=short -- "$rel" 2>/dev/null || echo '不明')"
  echo
  echo "道具が1本消えても**赤くなりません。** 次に呼ぶ人が「無い」と言うまで誰も気づきません。"
  echo
  echo "  直したいなら → **Edit** を使う"
  echo "  新しく作りたいなら → **別の名前にする**（同名が既にあります）"
  echo "  本当に丸ごと作り直すなら → 先に Read で中身を見て、何を捨てるか言ってから"
} >&2
exit 2
