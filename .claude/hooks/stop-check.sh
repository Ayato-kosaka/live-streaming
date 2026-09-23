#!/usr/bin/env bash
# **出し切っていないのに turn を終わらせない。**
#
# ## なぜ要るか
#
# あやとの言葉（2026-09-22）:
#
#   > 毎回止まるのいい加減にやめろや。システム運営者として話にならん。
#
# 1日で何度も「緑になりしだいマージします」「押してみてください」で
# turn を終えた。**CLAUDE.md に「可否を預けるな」と書いてあるのに、預けた。**
# 文章では止まらなかったので、ここで止める。
#
# 見るのは git だけ。**この箱のトークンはダミーで GitHub API に通らない**ので、
# PR の状態は引けない。引けないものを引いたふりをしない。
# 代わりに「枝に commit があるのに master に入っていない」を出す。
#
# 終了コード 2 = 止める（標準エラーがこちらに返る）。0 = 通す。
set -uo pipefail
cd "$(git rev-parse --show-toplevel 2>/dev/null || exit 0)" || exit 0

msg=""
b=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo '')

# **配ってあるぶんは、この数から外す。**
#
# 2026-09-23、エージェント2人がこの作業ディレクトリを共有していて、
# あちらの書きかけを「未コミット」として毎回止めた。**文は「誰かの作業中
# なら任せて良い」と言っているのに、コードにその逃げ道が無かった。**
# 文が嘘をついている見張りは、読む側が無視するようになる。
#
# `.claude/.handoff` に、いま配ってある先の**道のあたま**を1行ずつ書く。
# 配るときに書いて、上がってきたら消す（`/hand-off` の手順）。
# **ここに書いていないものは、今までどおり止める。**
hoff=".claude/.handoff"
skip() {
  # 覚え書きそのものは、いつでも外す（git に入れないもの）
  [ "$1" = "$hoff" ] && return 0
  [ -f "$hoff" ] || return 1
  while IFS= read -r pre; do
    case "$pre" in ''|'#'*) continue ;; esac
    case "$1" in "$pre"*) return 0 ;; esac
  done < "$hoff"
  return 1
}

mine=""; theirs=0
while IFS= read -r line; do
  [ -z "$line" ] && continue
  path=${line#???}
  if skip "$path"; then theirs=$((theirs + 1)); else mine="${mine}${line}
"; fi
done <<EOF
$(git status --porcelain 2>/dev/null)
EOF

n=$(printf '%s' "$mine" | grep -c . || true)
if [ "${n:-0}" -gt 0 ]; then
  msg="${msg}**未コミットが ${n} 件ある**（配ってあるぶんは除いて数えた）。
$(printf '%s' "$mine" | head -10)

自分のものなら commit して push する。
誰かに配ってあるものなら、**\`.claude/.handoff\` にその道を書く**（\`/hand-off\`）。
"
fi

# 2. 未 push
if [ -n "$b" ] && git rev-parse --abbrev-ref '@{u}' >/dev/null 2>&1; then
  a=$(git rev-list --count '@{u}..HEAD' 2>/dev/null || echo 0)
  if [ "${a:-0}" -gt 0 ]; then
    msg="${msg}**未 push の commit が ${a} 件ある**（${b}）。push する。
"
  fi
fi

[ -z "$msg" ] && note_only=1 || note_only=0

# 3. master に入っていない自分の枝。**これは止めない。念を押すだけ。**
#
# 2026-09-22、これで止めるようにしたら**毎回止まった。** CI が回っている
# あいだは当たり前にこの状態になるのに、hook からは「CI 待ち」と
# 「投げ出し」の区別がつかない（この箱のトークンはダミーで PR の状態を
# 引けない）。**区別できないもので止めると、正しく待っている回も止まる。**
#
# 止めるのは「literally まだ保存していない」1と2だけにして、ここは
# 目に入る場所に文を出すだけにする。**行動を変えるのは読む側の仕事。**
warn=""
if [ -n "$b" ] && [ "$b" != "master" ] && git rev-parse origin/master >/dev/null 2>&1; then
  ahead=$(git rev-list --count origin/master.."$b" 2>/dev/null || echo 0)
  if [ "${ahead:-0}" -gt 0 ]; then
    warn="**${b} に、master へ入っていない commit が ${ahead} 件ある。**

PR は作ったか。CI は見たか。**緑なら、自分でマージする。**
「緑になりしだいマージします」で終わらない——それが可否を預けるということ。
待っているなら、**何をどれだけ待っているか**を言ってから終わる。
"
  fi
fi

if [ -n "$msg" ]; then
  {
    echo "──────── 終わる前に ────────"
    printf '%s' "$msg"
    [ -n "$warn" ] && printf '\n%s' "$warn"
    echo "────────────────────────────"
  } >&2
  exit 2
fi

if [ -n "$warn" ]; then
  {
    echo "──────── 念のため ────────"
    printf '%s' "$warn"
    echo "──────────────────────────"
  } >&2
fi
exit 0
