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

# 1. 未コミット
n=$(git status --porcelain 2>/dev/null | wc -l)
if [ "$n" -gt 0 ]; then
  msg="${msg}**未コミットが ${n} 件ある。**
$(git status --porcelain 2>/dev/null | head -10)

誰かの作業中なら、その人に任せて良い（その場合は、誰の何かを言ってから終わる）。
自分のものなら commit して push する。
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

# 3. master に入っていない自分の枝
if [ -n "$b" ] && [ "$b" != "master" ] && git rev-parse origin/master >/dev/null 2>&1; then
  ahead=$(git rev-list --count origin/master.."$b" 2>/dev/null || echo 0)
  if [ "${ahead:-0}" -gt 0 ]; then
    msg="${msg}**${b} に、master へ入っていない commit が ${ahead} 件ある。**

PR は作ったか。CI は見たか。**緑なら、自分でマージする。**
「緑になりしだいマージします」で終わらない——それが可否を預けるということ。
マージできない理由があるなら、**その理由を1行で言ってから**終わる。
"
  fi
fi

[ -z "$msg" ] && exit 0
{
  echo "──────── 終わる前に ────────"
  printf '%s' "$msg"
  echo "────────────────────────────"
} >&2
exit 2
