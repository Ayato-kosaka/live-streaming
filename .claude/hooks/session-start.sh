#!/usr/bin/env bash
# **セッションの頭で、読み落としやすいものを突きつける。**
#
# ## なぜ要るか
#
# あやとの言葉（2026-09-21）:
#
#   > 私確認してコメントしましたよ？
#
# チャットで「確認しました」と言われて、それで終わったと思い込み、
# **同じ日に issue へ書かれていた9本ぶんの実質的な指示を読まなかった。**
# 2回やった。CLAUDE.md には「必ず既存 issue のコメントを読む」と書いてある。
# **書いてあるのに読み飛ばすので、頭で突きつける。**
#
# GitHub は引かない。この箱のトークンは14文字のダミーで API に通らないし、
# **黙って失敗する見張りは、無いほうがまし**（`docs/island-misses.md` #87）。
# 取ってくる代わりに、取りに行く手順を出す。
set -uo pipefail
cd "$(git rev-parse --show-toplevel 2>/dev/null || echo .)" || exit 0

echo "──────── 始める前に ────────"
echo
echo "1. **あやとの返事は issue にある。** チャットの一言で止めない。"
echo "   開いている issue を引いて、**最後のコメントが誰のものか**を見る:"
echo "     mcp__github__list_issues   state=open"
echo "     mcp__github__issue_read    method=get_comments（1本ずつ）"
echo "   「確認した」だけに見えても、**別の issue に指示が書いてある**ことがある。"
echo
echo "2. **可否を預けない。** 決めて、やって、報告する（CLAUDE.md）。"
echo "   「どちらにしますか」「押してみてください」で turn を終えない。"
echo "   仕様そのものが分からないときだけ issue で聞き、**答えを待つあいだも止まらない。**"
echo
echo "3. **待ち札には理由を書く。** \`待ち-あやと\` を付けるなら、"
echo "   その issue に「何を待っているか」を1行書く。書かないと届かない。"
echo

b=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo '-')
echo "いまの枝: $b"
d=$(git status --porcelain 2>/dev/null | wc -l)
[ "$d" -gt 0 ] && echo "**未コミットが $d 件ある。** 前のセッションの置き土産かもしれない。中身を見る"
echo "────────────────────────────"
exit 0
