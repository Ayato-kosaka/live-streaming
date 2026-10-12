#!/bin/bash
# Actions の成果物（artifact）の zip を手元に持ち帰って開く。見本の一覧（suzuri-sheet）を目で見る用（#741）。
#   usage: bash .claude/skills/suzuri/fetch_artifact.sh '<download_url>' <出し先のディレクトリ>
#
# <download_url> は MCP の `actions_get`（method: download_workflow_run_artifact）が返す、
# 期限が数分の署名付き URL。置き場は productionresultssa<N>.blob.core.windows.net。
#
# この箱のネットワーク設定がその置き場を通さないとき（2026-10-12 はそうだった）は、
# EC2 に取りに行かせて ec2.py get で持ち帰る。EC2 はログイン無しで使う（SSM だけ）ので、
# SUZURI のログインが切れていても関係ない。EC2 が止まっていれば起こさずに止まる。
set -uo pipefail
URL="${1:?usage: fetch_artifact.sh <download_url> <out_dir>}"
OUT="${2:?usage: fetch_artifact.sh <download_url> <out_dir>}"
cd "$(dirname "$0")/../../.."
mkdir -p "$OUT"
ZIP="$OUT/artifact.zip"

if curl -sf --max-time 60 -o "$ZIP" "$URL"; then
  echo "直に取れた"
else
  echo "直には取れない（ネットワーク設定）。EC2 に取りに行かせる"
  EC2="python3 .claude/skills/ec2-chrome/ec2.py"
  [ "$($EC2 state)" = running ] || { echo "EC2 が止まっている。ec2.py start で起こすか、置き場をネットワーク設定で通す"; exit 1; }
  S=$(mktemp)
  # URL は署名付き。シェルに通さず、一重引用符で丸ごと渡す（URL に ' は入らない）
  printf "curl -sf --max-time 60 -o /tmp/artifact.zip '%s' && stat -c %%s /tmp/artifact.zip\n" "$URL" > "$S"
  $EC2 run "$S" 90 | head -1; rm -f "$S"
  $EC2 get /tmp/artifact.zip "$ZIP" || exit 1
  S=$(mktemp); echo "rm -f /tmp/artifact.zip" > "$S"; $EC2 run "$S" 30 >/dev/null; rm -f "$S"
fi
python3 -c "import zipfile,sys; z=zipfile.ZipFile(sys.argv[1]); z.extractall(sys.argv[2]); print(*z.namelist(), sep='\n')" "$ZIP" "$OUT"
rm -f "$ZIP"
