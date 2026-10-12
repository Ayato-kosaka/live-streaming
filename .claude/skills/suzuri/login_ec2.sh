#!/bin/bash
# EC2 の Chrome で SUZURI に「Google でログイン」し直す。手元から回す。
#   usage: bash .claude/skills/suzuri/login_ec2.sh          # 押して入る（あやとのスマホに通知が飛ぶ）
#          bash .claude/skills/suzuri/login_ec2.sh wait     # 走っている回の続きを待つ（数字を伝えたあと）
#          bash .claude/skills/suzuri/login_ec2.sh code 123456   # あやとがくれたメールの確認コードを渡して、続きを待つ
#
# 出るもの（その場で turn を終えて、あやとに書く）:
#   CHALLENGE: … numbers=[...]   Google のスマホ確認。数字をあやとに伝える → あとで `wait`
#   CODE-NEEDED                  SUZURI があやとのメールに確認コードを送った。コードをもらう → `code <数字>`
#   FINISHED: … result: ok       入れた
#
# EC2 では login.py を切り離して走らせ、こちらは数字が出た瞬間に1行出して抜ける。
# ログイン全体を SSM の1コマンドで回すと、出力は終わってからまとめて届くので、
# 数字が見えたときには5分の窓が閉じている（Doneru で 2026-10-01 に踏んだ）。
# **数字が出たら、その turn ですぐあやとに書いて終える。** 結果は `wait` で見る。
set -uo pipefail
cd "$(dirname "$0")/../../.."
EC2="python3 .claude/skills/ec2-chrome/ec2.py"
LOG=/home/ubuntu/suzuri/login.log

if [ "${1:-}" = code ]; then
  [[ "${2:-}" =~ ^[0-9]{4,8}$ ]] || { echo "usage: login_ec2.sh code <数字4〜8桁>"; exit 1; }
  S=$(mktemp)
  # login.py は ubuntu で走っていて、読んだら消す。root で置くと /tmp の sticky で消せない
  echo "sudo -u ubuntu sh -c 'umask 077; echo $2 > /tmp/suzuri_code.txt'; echo placed" > "$S"
  $EC2 run "$S" 30 | head -1; rm -f "$S"
  set -- wait
fi

if [ "${1:-}" != wait ]; then
  [ "$($EC2 state)" = running ] || { echo "EC2 が起きていない（ec2.py start で起こす）"; exit 1; }
  $EC2 put .claude/skills/ec2-chrome/cdp.py /home/ubuntu/cdp/cdp.py >/dev/null
  $EC2 put .claude/skills/ec2-chrome/google_login.py /home/ubuntu/cdp/google_login.py >/dev/null
  $EC2 put .claude/skills/suzuri/login.py /home/ubuntu/cdp/login.py >/dev/null
  S=$(mktemp)
  cat > "$S" <<EOF
mkdir -p /home/ubuntu/suzuri && chown -R ubuntu:ubuntu /home/ubuntu/cdp /home/ubuntu/suzuri
rm -f /tmp/suzuri_challenge.txt
cd /home/ubuntu/cdp && sudo -u ubuntu setsid nohup sh -c 'python3 login.py; echo "exit \$?"' > $LOG 2>&1 < /dev/null &
sleep 2; echo started
EOF
  $EC2 run "$S" 60 | head -1; rm -f "$S"
fi

SEEN=""   # 渡し済みのコード待ちの行。コードを読むまでの数秒に、同じ行でもう一度 CODE-NEEDED を出さない
[ "${1:-}" = wait ] && SEEN=$($EC2 run <(echo "grep code-needed /tmp/suzuri_challenge.txt 2>/dev/null") 30 2>/dev/null | grep code-needed)
for _ in $(seq 1 120); do
  S=$(mktemp)
  echo "cat /tmp/suzuri_challenge.txt 2>/dev/null; echo ---; cat $LOG" > "$S"
  OUT=$($EC2 run "$S" 30 2>/dev/null); rm -f "$S"
  CH=$(printf '%s\n' "$OUT" | sed -n '1,/^---$/p' | grep numbers= | tail -1)
  BODY=$(printf '%s\n' "$OUT" | sed -n '/^---$/,$p' | grep -v '^---$\|ssm status')
  if printf '%s\n' "$BODY" | grep -q '^exit '; then echo "FINISHED:"; printf '%s\n' "$BODY"; exit 0; fi
  PENDING=$(printf '%s\n' "$OUT" | sed -n '1,/^---$/p' | grep -c '^done$')
  if [ "${1:-}" != wait ] && [ -n "$CH" ] && [ "$PENDING" = 0 ]; then
    echo "CHALLENGE: $CH"; exit 0
  fi
  CN=$(printf '%s\n' "$OUT" | sed -n '1,/^---$/p' | grep code-needed | tail -1)
  if [ -n "$CN" ] && [ "$CN" != "$SEEN" ] && [ "$PENDING" = 0 ]; then
    echo "CODE-NEEDED: SUZURI があやとのメールに確認コードを送った。もらったら login_ec2.sh code <数字>"; exit 0
  fi
  sleep 3
done
echo "TIMEOUT: 10分待った。$LOG を読む"
