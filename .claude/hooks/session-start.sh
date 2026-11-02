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

# ── 道具が名指しするブラウザを、いまの箱の本物へ繋ぐ ──
#
# 確かめる道具の多くは `/opt/pw-browsers/chromium-1194/chrome-linux/chrome` を
# **直に名指し**している。2026-10-22 に作業箱のイメージが替わり、そこに在るのは
# `chromium-1243`（`chrome-linux64/chrome`）だけになった。`/opt/pw-browsers/chromium`
# がその本物を指している。道具を1本ずつ書き換える代わりに、**名指しの場所に
# 本物への link を置く。** 箱は毎回イメージから起きるので、毎回ここで置き直す。
# （`tools/sprites/chrome.mjs` は `chrome-linux/chrome` しか探さないので、
# 版を名指ししない道具もこの link で見つかるようになる）
#
# 何もしないとき:
#   - CI の上（`CI` / `GITHUB_ACTIONS`）。runner は playwright-core に 1194 を
#     自分で入れている。ここで繋ぐと、入れ損ねたことが隠れる
#   - 名指しの場所に、もう何かが在る（1194 が実在する箱・2回目からの起動）
#   - `chromium` が実行ファイルに行き着かない（繋ぐ先が無い）
# **作れなかったら黙って進む。** セッションの頭は止めない。
#
# `SESSION_HOOK_PW_ROOT` は見張り（`python/session_start_browser_selftest.py`）が
# 偽の置き場で回すための口。ふだんは渡さない。
pw="${SESSION_HOOK_PW_ROOT:-/opt/pw-browsers}"
want="$pw/chromium-1194/chrome-linux/chrome"
if [ -z "${CI:-}" ] && [ -z "${GITHUB_ACTIONS:-}" ] && [ ! -e "$want" ]; then
  # 行き先の消えた link（前のイメージの置き土産）は `-e` が偽になるので、ここへ来て
  # `ln -sfn` が置き換える
  real=$(readlink -f "$pw/chromium" 2>/dev/null)
  # `-x` だけだと置き場（ディレクトリ）も通るので、ふつうのファイルであることも見る
  if [ -n "$real" ] && [ -f "$real" ] && [ -x "$real" ] \
     && mkdir -p "${want%/*}" 2>/dev/null \
     && ln -sfn "$real" "$want" 2>/dev/null; then
    echo "ブラウザ: この箱に chromium-1194 が無いので、道具の名指し先 $want を $real へ繋いだ"
  fi
fi

echo "────────────────────────────"
exit 0
