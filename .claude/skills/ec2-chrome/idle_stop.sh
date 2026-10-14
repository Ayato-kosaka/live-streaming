#!/bin/sh
# EC2 の上で root の cron が5分ごとに回す。**誰も使っていない時間が IDLE_MIN 分続いたら、EC2 を止める。**
#
# 手元（セッション）から止めるのを当てにしない。セッションは利用の上限やコンテナの作り直しで
# 唐突に切れる。2026-10-13 にそれで、一括が 16:36 に終わったあと 17:22 まで誰も止めずに起きていた
# （あやとが気づいて止めた）。止めるのは、止まらずに残る側（EC2）に持たせる。
#
# 「使っている」とみなすもの（どれか1つでもあれば、時計を巻き戻す）:
#   - 起きてから GRACE_MIN 分以内（起こしたセッションが最初のコマンドを送るまでの間）
#   - SSM のコマンドが走っている（セッションが何かを流している最中）
#   - 鍵のファイルが STALE_H 時間以内に触られている（裏で回している一括。長い一括は鍵を触り続ける）
#   - Chrome リモートデスクトップの画面に、IDLE_MIN 分以内に人の入力がある（あやとが入っている）
#
# **武装は /etc/idle-stop/armed の中身が `behavior=stop` のときだけ。** 無ければ「止めるはずだった」と書くだけ。
# 中から shutdown したときの動きは、インスタンスの「シャットダウン動作」の設定で決まる（停止 / 終了）。
# 終了だと EC2 そのものが消える。こちらの権限では設定を読めない（ec2:DescribeInstanceAttribute も、
# EC2 の役割からの StopInstances も拒否）ので、**あやとがコンソールで「停止」を見てから武装した**
# （2026-10-14。#857）。空の armed を touch しただけでは止めない（うっかり武装して EC2 を消す道を残さない）。
set -u
IDLE_MIN=${IDLE_MIN:-30}
GRACE_MIN=${GRACE_MIN:-20}
STALE_H=${STALE_H:-6}
STATE=/var/lib/idle-stop
LOG=/var/log/idle-stop.log
LOCKS="/home/ubuntu/locks/* /home/ubuntu/chatgpt/LOCK /home/ubuntu/stamp/RUNNING"
mkdir -p "$STATE"
now=$(date +%s)
why=""

up=$(cut -d. -f1 /proc/uptime)
[ "$up" -lt $((GRACE_MIN * 60)) ] && why="boot"

if [ -z "$why" ] && pgrep -f ssm-document-worker >/dev/null 2>&1; then
  why="ssm"
fi

if [ -z "$why" ]; then
  for f in $LOCKS; do
    [ -f "$f" ] || continue
    age=$(( now - $(stat -c %Y "$f") ))
    if [ "$age" -lt $((STALE_H * 3600)) ]; then why="lock:$f"; break; fi
  done
fi

if [ -z "$why" ] && command -v xprintidle >/dev/null 2>&1; then
  for d in /tmp/.X11-unix/X*; do
    n=":${d##*/X}"
    ms=$(DISPLAY=$n XAUTHORITY=/home/ubuntu/.Xauthority sudo -u ubuntu xprintidle 2>/dev/null) || continue
    if [ "${ms:-999999999}" -lt $((IDLE_MIN * 60000)) ]; then why="desktop$n"; break; fi
  done
fi

if [ -n "$why" ]; then
  echo "$now" > "$STATE/last"
  exit 0
fi

last=$(cat "$STATE/last" 2>/dev/null || echo "$now")
idle=$(( (now - last) / 60 ))
[ "$idle" -lt "$IDLE_MIN" ] && exit 0

if [ "$(cat /etc/idle-stop/armed 2>/dev/null)" = "behavior=stop" ]; then
  echo "$(date -u +%FT%TZ) idle ${idle}min -> shutdown" >> "$LOG"
  # 止める前に、開いている Chrome にセッションを書き戻させる（pkill だけだとログインが残らないことがある）
  pkill -TERM -u ubuntu -f 'user-data-dir=/home/ubuntu/cdp-' 2>/dev/null
  sleep 10
  /sbin/shutdown -h now
else
  echo "$(date -u +%FT%TZ) idle ${idle}min -> would shutdown (not armed)" >> "$LOG"
  echo "$now" > "$STATE/last"
fi
