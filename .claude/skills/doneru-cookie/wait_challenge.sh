#!/bin/bash
# 本人確認の数字が EC2 の画面に出た瞬間に、それを1行出して抜ける。
#   usage: bash .claude/skills/doneru-cookie/wait_challenge.sh <ec2_exec の出力ファイル>
#
# ec2_exec.sh を run_in_background で起こした直後に、これを**前で**（待つ形で）回す。
# 抜けたら、その turn ですぐあやとに数字を書いて turn を終える。
#
# 前で回すのは ec2_exec.sh の出力ではなくこちら。ec2_exec.sh の出力は SSM が
# 終わってからまとめて届くので、そちらを待つと数字は5分の待ちが切れたあとに見える
# （2026-10-01 にそれで1回ぶん、あやとの通知を無駄にした）。
set -uo pipefail
RUN_OUT="${1:?usage: wait_challenge.sh <ec2_exec output file>}"
A="aws --profile sandbox --region ap-northeast-1"
ID=i-0684d39b0c1b1abb6
# 前の回の数字を拾わないように、起こした時刻より新しいものだけを見る
SINCE=$(( $(date +%s) - 120 ))

for _ in $(seq 1 120); do
  if grep -qE "final state|RUN FINISHED" "$RUN_OUT" 2>/dev/null; then
    echo "NO-CHALLENGE: 本人確認を経ずに終わった。出力を読む:"; grep -E "OK:|STOP|existing _dt|fetch|HTTP" "$RUN_OUT"
    exit 0
  fi
  cid=$($A ssm send-command --instance-ids $ID --document-name AWS-RunShellScript \
    --parameters 'commands=["cat /tmp/doneru_challenge.txt 2>/dev/null || true"]' \
    --query Command.CommandId --output text 2>/dev/null) || { sleep 5; continue; }
  sleep 3
  cur=$($A ssm get-command-invocation --command-id "$cid" --instance-id $ID \
    --query StandardOutputContent --output text 2>/dev/null | head -1)
  ts=${cur%% *}
  if [[ "$ts" =~ ^[0-9]+$ ]] && [ "$ts" -ge "$SINCE" ] && [[ "$cur" == *numbers=* ]]; then
    echo "CHALLENGE: $cur"
    exit 0
  fi
  sleep 2
done
echo "TIMEOUT: 10分待っても数字が出なかった。$RUN_OUT を読む"
