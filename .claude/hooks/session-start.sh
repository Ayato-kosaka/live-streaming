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
# 2回やった。当時の CLAUDE.md には「必ず既存 issue のコメントを読む」と書いてあった。
# **書いてあるのに読み飛ばすので、頭で突きつける。**
#
# GitHub から引くのは、こちらの番の札（`待ち-システム`）の一覧だけ。
# ほかは取ってくる代わりに、取りに行く手順を出す。
# **黙って失敗する見張りは、無いほうがまし**（`docs/island-misses.md` #87）なので、
# 引けなかったときは「読めなかった（理由）」と言う。
set -uo pipefail
cd "$(git rev-parse --show-toplevel 2>/dev/null || echo .)" || exit 0

# ── こちらの番の issue（札 `待ち-システム`）を並べる ──
#
# 札 `待ち-システム` は「あやとが答えて、こちらの番」の印。あやとが返事をすると
# `待ち-あやと` からひとりでに裏返る（`docs/island-tickets.md` 5章）。
# ところが**裏返った札を探しに行くのは、セッションの記憶に預けられていた。**
# #147 で、あやとの「やって良いよ」を2日拾わなかった（`island-misses.md` #330）。
# 1. が「1本ずつ見ろ」と言うだけだったので、こちらの番のものは頭で並べる。
#
# - **引けなかったら、理由を1行出して進む。「0本」と黙らない。** 引けなかったのと
#   本当に0本なのが同じ字になると、#147 と同じ見落としに戻る
# - 5秒で切る。セッションの頭を待たせない
# - CI の上では引かない（ブラウザの段と同じ。そこはセッションの頭ではない）
# - 札の名前を URL に直に書かない。gh は URL を符号化しないので、日本語の札は
#   400 が返る（2026-11-17 に踏んだ）。`-f` で渡すと gh が符号化する
# - 並びは動いた順。答えが来たばかりのものが上に来る
# - この箱の GH_TOKEN は14文字のダミーだが、外へ出る道が本物の鍵を差し込むので
#   `gh api` は通る（2026-11-17 に確かめた）
#
# 見張りは `python/session_start_waits_selftest.py`（偽の gh を PATH の先頭に置いて回す）。
waits_us() {
  local wl="待ち-システム" why="" wo="" we rc
  if ! command -v gh >/dev/null 2>&1; then
    why="gh が無い"
  else
    we=$(mktemp 2>/dev/null) || we=/dev/null
    wo=$(timeout -k 1 5 gh api -X GET repos/Ayato-kosaka/live-streaming/issues --paginate \
           -f state=open -f labels="$wl" -f sort=updated -f per_page=100 \
           --jq '.[] | select(.pull_request|not) | "#\(.number) \(.title[0:40])"' 2>"$we")
    rc=$?
    if [ "$rc" -eq 124 ] || [ "$rc" -eq 137 ]; then
      why="5秒で返らなかった"
    elif [ "$rc" -ne 0 ]; then
      # gh は1行目に中身を言う（「HTTP 401: Bad credentials」など）
      why=$(grep -m1 . "$we" 2>/dev/null)
      why="${why:0:80}"
      why="${why:-gh が終了コード $rc で終わった}"
    fi
    [ "$we" != /dev/null ] && rm -f "$we"
  fi
  if [ -n "$why" ]; then
    echo "   $wl: 読めなかった（$why）"
  elif [ -z "$wo" ]; then
    echo "   $wl: 0本"
  else
    echo "   $wl: $(printf '%s\n' "$wo" | wc -l)本（あやとが答えて、こちらの番。動いた順）"
    printf '%s\n' "$wo" | sed 's/^/     /'
  fi
}

echo "──────── 始める前に ────────"
echo
echo "1. **あやとの返事は issue にある。** チャットの一言で止めない。"
echo "   開いている issue を引いて、**最後のコメントが誰のものか**を見る:"
echo "     mcp__github__list_issues   state=open"
echo "     mcp__github__issue_read    method=get_comments（1本ずつ）"
echo "   「確認した」だけに見えても、**別の issue に指示が書いてある**ことがある。"
[ -z "${CI:-}${GITHUB_ACTIONS:-}" ] && waits_us
echo
echo "2. **可否を預けない。** 決めて、やって、報告する（docs/island-standards.md §2）。"
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
