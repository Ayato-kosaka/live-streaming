#!/bin/sh
# EC2 の上で動く（/usr/local/sbin/cdp-heal。ec2.py guard が置く）。
# **/home/ubuntu/cdp/cdp.py の版の番号が、正の版より小さく（または無く）なったら、すぐ正の版に戻す。**
#
# なぜ要るか（2026-10-24）: 札（ec2-queue）の要は、cdp.py の up/tab/pages が札を持っていなければ自分で取ること
# （ほかのセッションが古い呼び方をしても効く）。ところが札を入れた日の 10:10 UTC、EC2 の cdp.py が札を取らない
# 古い版に戻っていた。古い枝で動いている別のセッションが、使うたびに手元の cdp.py を置き直す道具
# （ec2_exec.sh・post.py send）で自分の版を書き戻した。「いちばん最後に置いたセッションの版が効く」形では、
# 古い枝が1回置くだけで札の守りが黙って外れる。古い枝の道具はこちらから直せないので、戻すのは EC2 の側に持たせる。
#
#   cdp-heal check <なぜ>   生きている版（/home/ubuntu/cdp/cdp.py）が正の版より小さければ戻し、ログに1行書く。
#                           systemd の cdp-heal.path（書かれた瞬間）と、cron の5分ごと（保険）が呼ぶ
#   cdp-heal place <候補>   手元の道具が置くとき（ec2.py put が、この字ごと送ってその場で回す。EC2 に cdp-heal が
#                           まだ無くても効くように）。候補の版が EC2 の版（生きている版と正の版の大きいほう）より
#                           小さければ置かない。同じか大きければ置く
#   cdp-heal canon <候補>   ec2.py guard が正の版を置くとき。今の正の版より小さければ置かない（古い枝の guard が下げない）
#   cdp-heal install        cdp-heal.path / cdp-heal.service と /etc/cron.d/cdp-heal を入れる（何度でもよい）
#   cdp-heal status         いまの版・sha256・見張りの状態を1行で
#
# 版は cdp.py の `CDP_VERSION = <数>` の行（行頭から）。行が無ければ 0、ファイルが無ければ -1。
# **番号が正の版と同じか大きいものは触らない**（新しい枝のセッションが置いた新しい版を生かす）。
# 正の版を置き換えるのは guard だけ。生きている版のほうが大きくても、正の版には上げない。
#
# 置き場はこの頭の変数にだけ書く（.claude/skills/ec2-chrome/cdp_heal_selftest.py が、ここを差し替えて回す）。
set -u
LIVE=/home/ubuntu/cdp/cdp.py
CANON=/usr/local/lib/ec2-chrome/cdp.py
LOG=/var/log/cdp-heal.log
UNITS=/etc/systemd/system
CRON=/etc/cron.d/cdp-heal
SELF=/usr/local/sbin/cdp-heal
OWNER=ubuntu:ubuntu
ROOT_OWNER=root:root
SETTLE=1

ver() {
  [ -f "$1" ] || { echo -1; return 0; }
  v=$(sed -n 's/^CDP_VERSION *= *\([0-9]\{1,9\}\).*/\1/p' "$1" | head -n 1)
  echo "${v:-0}"
}

sha() { if [ -f "$1" ]; then sha256sum "$1" | cut -c1-16; else echo "-"; fi; }

desc() { case "$1" in -1) echo "（ファイルが無い）" ;; 0) echo "0（番号なし）" ;; *) echo "$1" ;; esac; }

# 戻すと決めたあとに新しい版が置かれ、それを古い正の版で潰す、という行き違いを止める。
# 正の版の置き場が無い EC2 には戻す人も居ないので、鍵も要らない
lock() {
  d=${CANON%/*}
  [ -d "$d" ] || return 0
  command -v flock >/dev/null 2>&1 || return 0
  exec 9>"$d/.lock" && flock -w 30 9
}

older() { [ "$1" -lt "$2" ]; }

check() {
  why=${1:-manual}
  lock || :
  vc=$(ver "$CANON")
  if [ "$vc" -lt 1 ]; then echo "NOCANON 正の版が無い（$CANON。手元で ec2.py guard）"; return 0; fi
  vl=$(ver "$LIVE")
  if older "$vl" "$vc"; then
    # 書いている途中を読んだかもしれない（cron は書きかけに当たりうる）。少し置いて読み直す。
    # 古い版を置いた道具が、置いた直後に sha256 を照らす間も与える（照らす前に戻すと、あちらが落ちる）
    sleep "$SETTLE"
    vl=$(ver "$LIVE")
  fi
  if ! older "$vl" "$vc"; then echo "OK live=$vl canon=$vc"; return 0; fi
  before=$(sha "$LIVE")
  d=${LIVE%/*}
  if [ ! -d "$d" ]; then mkdir -p "$d" && chown "$OWNER" "$d" 2>/dev/null; fi
  tmp="$LIVE.heal.$$"
  if ! { cp "$CANON" "$tmp" && chmod 644 "$tmp"; }; then rm -f "$tmp"; echo "FAIL 写せない: $tmp"; return 1; fi
  chown "$OWNER" "$tmp" 2>/dev/null
  if ! mv -f "$tmp" "$LIVE"; then rm -f "$tmp"; echo "FAIL 置けない: $LIVE"; return 1; fi
  echo "$(date -u +%FT%TZ) $why: $LIVE の版 $(desc "$vl")（sha256 $before）を、正の版 $vc（sha256 $(sha "$CANON")）に戻した" >> "$LOG"
  echo "HEALED $vl -> $vc"
}

place() {
  cand=$1
  [ -f "$cand" ] || { echo "FAIL 候補が無い: $cand"; return 1; }
  lock || :
  vn=$(ver "$cand")
  vl=$(ver "$LIVE")
  vc=$(ver "$CANON")
  top=$vl
  if [ "$vc" -gt "$top" ]; then top=$vc; fi
  if [ "$vn" -lt "$top" ]; then
    rm -f "$cand"
    echo "KEPT ec2=$top local=$vn"
    return 0
  fi
  chmod 644 "$cand"
  chown "$OWNER" "$cand" 2>/dev/null
  if ! mv -f "$cand" "$LIVE"; then rm -f "$cand"; echo "FAIL 置けない: $LIVE"; return 1; fi
  echo "PLACED $vn $(sha256sum "$LIVE" | cut -c1-64)"
}

canon() {
  cand=$1
  [ -f "$cand" ] || { echo "FAIL 候補が無い: $cand"; return 1; }
  lock || :
  vn=$(ver "$cand")
  vc=$(ver "$CANON")
  # 番号の無い版は正の版にしない（戻す先が札を取る版である、を番号で約束しているので）
  if [ "$vn" -lt 1 ]; then rm -f "$cand"; echo "FAIL 候補に番号が無い（CDP_VERSION）。正の版にしない"; return 1; fi
  if [ "$vn" -lt "$vc" ]; then rm -f "$cand"; echo "CANON-KEPT canon=$vc local=$vn"; return 0; fi
  d=${CANON%/*}
  # root だけが書ける置き場（ubuntu で動く Chrome の道具や、ほかの置き直しの道具が触れない）
  mkdir -p "$d" && chmod 755 "$d" && chown "$ROOT_OWNER" "$d" || { echo "FAIL 置き場を作れない: $d"; return 1; }
  if ! { chmod 644 "$cand" && chown "$ROOT_OWNER" "$cand" && mv -f "$cand" "$CANON"; }; then
    rm -f "$cand"; echo "FAIL 正の版を置けない: $CANON"; return 1
  fi
  echo "CANON $vn $(sha "$CANON")"
}

install_units() {
  mkdir -p "$UNITS" || return 1
  # PathChanged: 閉じた書き込み（> で書いた）・mv で置き換えた・消した、のどれでも起きる
  cat > "$UNITS/cdp-heal.path" <<UNIT
[Unit]
Description=cdp.py が書き換えられたら、正の版より古くないかを見る（ec2-chrome の SKILL.md 2.5）

[Path]
PathChanged=$LIVE
Unit=cdp-heal.service

[Install]
WantedBy=multi-user.target
UNIT
  cat > "$UNITS/cdp-heal.service" <<UNIT
[Unit]
Description=cdp.py が正の版より古ければ戻す

[Service]
Type=oneshot
ExecStart=$SELF check path
UNIT
  # 保険。.path が何かで止まっていても、5分で戻す（idle-stop と同じ5分ごと）
  printf '%s\n' 'SHELL=/bin/sh' "*/5 * * * * root $SELF check cron >/dev/null 2>&1" > "$CRON.new" \
    && chmod 644 "$CRON.new" && mv -f "$CRON.new" "$CRON" || return 1
  systemctl daemon-reload && systemctl enable cdp-heal.path >/dev/null 2>&1 && systemctl restart cdp-heal.path
}

status() {
  echo "cdp: live=$(ver "$LIVE") $(sha "$LIVE") canon=$(ver "$CANON") $(sha "$CANON")" \
    "path=$(systemctl is-active cdp-heal.path 2>/dev/null)" "cron=$(grep -o '^\*/5 [^>]*check cron' "$CRON" 2>/dev/null)"
}

case "${1:-}" in
  check) check "${2:-manual}" ;;
  place) place "${2:-}" ;;
  canon) canon "${2:-}" ;;
  install) install_units ;;
  status) status ;;
  *) echo "usage: cdp-heal check <なぜ> | place <候補> | canon <候補> | install | status" >&2; exit 2 ;;
esac
