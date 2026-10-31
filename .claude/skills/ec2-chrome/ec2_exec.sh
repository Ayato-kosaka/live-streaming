#!/bin/bash
# EC2 を起こす → 列の札を取る → SSM で渡したスクリプトを実行 → 札を返す → **止めてよければ止める**、の土台。
#   usage: .claude/skills/ec2-chrome/ec2_exec.sh <remote-script-file> [exec-timeout-seconds]
#   列は EC2_QUEUE_LANE（既定 exec。doneru-cookie の入口は doneru を渡す）
#
# 起きっぱなしの箱を何回にも分けて触るときは ec2.py run を使う。
# 起こしたあと、実行の前に cdp.py を EC2 へ置き直す（リポジトリの版と食い違わないように。EC2 のほうが新しければ置かない）。
#
# **止めるのは ec2.py stop を通す（2026-10-24）。** 前はここで無条件に stop-instances を打っていて、
# ほかの担当やあやとが使っている最中でも止めていた。いまは、ほかの SSM・鍵・遠隔デスクトップ・札
# （ec2-queue）を見てから止め、使っている人が居れば止めずに「idle-stop に任せる」とログに書く
# （誰も使わなくなって30分で、EC2 の上の見張りが止める）。
#
# **スクラッチパッドに毎回コピーを作らず、必ずこの固定パスから実行すること。**
# 権限クラシファイアは「その場で生成した名前の無いスクリプト」を繰り返しブロックする。
# .claude/settings.json の allow ルールはこのパスに対して書いてあるので、
# ここから実行するかぎり `aws ssm` 込みで通る（詳細は SKILL.md「権限クラシファイア」節）。
#
# 引数の <remote-script-file> は EC2 上で実行される内容であって、ローカルでは実行しない。
# 生成先はスクラッチパッドで構わない（実行するのは常にこのファイル）。
set -uo pipefail

REMOTE_FILE="${1:?usage: ec2_exec.sh <remote-script-file> [timeout]}"
EXEC_TIMEOUT="${2:-3000}"
INSTANCE_ID="${EC2_CHROME_INSTANCE_ID:-i-0684d39b0c1b1abb6}"
REGION="${EC2_CHROME_REGION:-ap-northeast-1}"
AWSP="aws --profile sandbox --region $REGION"
LOG="${EC2_CHROME_LOG:-/tmp/ec2_exec.log}"
PARAMS_FILE="${EC2_CHROME_PARAMS:-/tmp/ec2_exec_params.json}"
HERE="$(cd "$(dirname "$0")" && pwd)"
EC2PY="$HERE/ec2.py"
LANE="${EC2_QUEUE_LANE:-exec}"
log() { echo "[$(date -u +%H:%M:%S)] $*" | tee -a "$LOG"; }

if [ "${EC2_EXEC_INNER:-}" != 1 ]; then
  # ---- 外側: 札を持って内側を回し、返したあとで、止めてよければ止める ----
  : > "$LOG"
  STOP_DONE=0
  cleanup() {
    local exit_code=$?
    if [ "$STOP_DONE" -eq 0 ]; then
      STOP_DONE=1
      log "cleanup: 止めてよいかを見てから止める（trigger: exit code $exit_code）"
      local out rc=1 try
      for try in 1 2; do
        out=$(timeout 600 python3 "$EC2PY" stop 2>&1); rc=$?
        printf '%s\n' "$out" | tee -a "$LOG"
        [ "$rc" -eq 0 ] && break
        # 終わったばかりのコマンドの worker が少し残っていることがある。1回だけ置いて見直す
        [ "$try" -eq 1 ] && { log "止めなかった。${EC2_EXEC_RETRY_S:-20}秒おいて、もう1回だけ見る"; sleep "${EC2_EXEC_RETRY_S:-20}"; }
      done
      final_state=$(timeout 30 $AWSP ec2 describe-instances --instance-ids "$INSTANCE_ID" \
        --query 'Reservations[0].Instances[0].State.Name' --output text 2>>"$LOG")
      log "final state: $final_state"
      if [ "$rc" -ne 0 ]; then
        log "止めなかった: ほかの人が使っている（理由は上）。止めるのは idle-stop に任せる（誰も使わなくなって30分で EC2 の上の見張りが止める）"
      elif [ "$final_state" != "stopped" ]; then
        log "*** WARNING: 停止確認に失敗。AWSコンソールで手動確認・停止すること: $INSTANCE_ID ***"
      fi
    fi
    log "=== RUN FINISHED (exit $exit_code) ==="
    exit "$exit_code"
  }
  trap cleanup EXIT INT TERM
  [ -e "$REMOTE_FILE" ] || { log "remote script/dir $REMOTE_FILE is missing"; exit 1; }
  log "=== 列 $LANE の札を取って回す（EC2 が止まっていれば起こす） ==="
  # 札の待ち・心拍・返すのは ec2.py hold（心拍はそのプロセスの中のスレッド。切り離した裏では打たない）
  python3 "$EC2PY" hold "$LANE" --who "ec2_exec:$(basename "$REMOTE_FILE")" \
    --purpose "ec2_exec.sh $(basename "$REMOTE_FILE")" -- env EC2_EXEC_INNER=1 bash "$0" "$@" 2> >(tee -a "$LOG" >&2)
  exit $?
fi

# ---- 内側: ec2.py hold の中で回る（EC2 は起きていて、EC2_QUEUE_TICKET に札がある） ----
log "=== 札: ${EC2_QUEUE_TICKET:-（なし）} ==="

# cdp.py（Chrome を CDP で触る道具）を毎回置き直す。EC2 に残っている古い版で動かさない。
# **ただし EC2 のほうが新しい版（番号が大きい）なら置かない**（下げない）。比べるのは ec2.py put
# （cdp_heal.sh の place）。前はここで直に base64 -d > cdp.py と書いていて、古い枝のこの道具が
# 札を取らない版を書き戻していた（2026-10-24。いまは EC2 の cdp-heal が戻す）
CDP_SRC="$HERE/cdp.py"
if [ -f "$CDP_SRC" ]; then
  log "cdp.py sync: $(timeout 300 python3 "$EC2PY" put "$CDP_SRC" /home/ubuntu/cdp/cdp.py 2>&1 | tail -1) (local $(sha256sum "$CDP_SRC" | cut -c1-16))"
fi

run_one_command() {
  # $1 = script file for this single SSM command; その1行目が "#TIMEOUT=<sec>" ならそれを EXEC_TIMEOUT として使う
  local SCRIPT_FILE="$1"
  local THIS_TIMEOUT="$EXEC_TIMEOUT"
  local FIRST_LINE
  FIRST_LINE=$(head -1 "$SCRIPT_FILE")
  case "$FIRST_LINE" in
    '#TIMEOUT='*) THIS_TIMEOUT="${FIRST_LINE#'#TIMEOUT='}"; tail -n +2 "$SCRIPT_FILE" > /tmp/ec2_exec_body.sh; SCRIPT_FILE=/tmp/ec2_exec_body.sh ;;
  esac

  # 札を EC2 の上のプロセスへ渡す（cdp.py の up() が、この札を他人の札と取り違えて待ち続けないように）
  local WITH_TICKET
  WITH_TICKET=$(mktemp)
  { [ -n "${EC2_QUEUE_TICKET:-}" ] && printf 'export EC2_QUEUE_TICKET=%q EC2_QUEUE_WHO=%q\n' "$EC2_QUEUE_TICKET" "${EC2_QUEUE_WHO:-ec2_exec}"
    cat "$SCRIPT_FILE"; } > "$WITH_TICKET"
  jq -n --rawfile s "$WITH_TICKET" --arg t "$((THIS_TIMEOUT + 120))" \
    '{commands: [$s], executionTimeout: [$t]}' > "$PARAMS_FILE"
  rm -f "$WITH_TICKET"

  log "--- send-command (timeout ${THIS_TIMEOUT}s): $1 ---"
  local CMD_ID
  CMD_ID=$(timeout 30 $AWSP ssm send-command \
    --instance-ids "$INSTANCE_ID" \
    --document-name AWS-RunShellScript \
    --timeout-seconds 600 \
    --parameters "file://$PARAMS_FILE" \
    --query 'Command.CommandId' --output text 2>>"$LOG")
  log "command id: $CMD_ID"
  if [ -z "$CMD_ID" ] || [ "$CMD_ID" = "None" ]; then log "send-command failed for $1"; return 1; fi

  local INV_STATUS="Pending" i
  for i in $(seq 1 $(( (THIS_TIMEOUT + 120) / 10 + 30 ))); do
    INV_STATUS=$(timeout 30 $AWSP ssm get-command-invocation \
      --command-id "$CMD_ID" --instance-id "$INSTANCE_ID" \
      --query 'Status' --output text 2>/dev/null)
    case "${INV_STATUS:-Pending}" in
      Success | Failed | Cancelled | TimedOut) break ;;
      *) sleep 10 ;;
    esac
  done
  log "invocation status: $INV_STATUS after ~$((i * 10))s"

  log "=== STDOUT ($1) ==="
  timeout 30 $AWSP ssm get-command-invocation --command-id "$CMD_ID" --instance-id "$INSTANCE_ID" \
    --query 'StandardOutputContent' --output text 2>&1 | tee -a "$LOG"
  log "=== STDERR ($1) ==="
  timeout 30 $AWSP ssm get-command-invocation --command-id "$CMD_ID" --instance-id "$INSTANCE_ID" \
    --query 'StandardErrorContent' --output text 2>&1 | tee -a "$LOG"
  [ "$INV_STATUS" = "Success" ]
}

if [ -d "$REMOTE_FILE" ]; then
  log "=== directory mode: running each *.sh in $REMOTE_FILE as a separate SSM command (same boot) ==="
  shopt -s nullglob
  CHUNK_FILES=("$REMOTE_FILE"/*.sh)
  shopt -u nullglob
  log "chunk count: ${#CHUNK_FILES[@]}"
  CHUNK_OK=0
  CHUNK_FAIL=0
  for CF in "${CHUNK_FILES[@]}"; do
    if run_one_command "$CF"; then
      CHUNK_OK=$((CHUNK_OK + 1))
    else
      CHUNK_FAIL=$((CHUNK_FAIL + 1))
      log "*** chunk failed/non-success, continuing to next chunk: $CF ***"
    fi
  done
  log "=== directory mode done: ok=$CHUNK_OK fail=$CHUNK_FAIL ==="
else
  run_one_command "$REMOTE_FILE" || log "*** single command did not succeed ***"
fi

log "=== done（札を返してから、外側が止めてよいかを見る） ==="
