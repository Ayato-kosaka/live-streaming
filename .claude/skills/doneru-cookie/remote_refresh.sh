#!/bin/sh
# EC2 上で走る。ログイン済み Chrome から _dt を平文で読み（CDP。復号不要）、
# api.doneru.jp で妥当性を確かめてから gh で DONERU_COOKIE に入れる。
# **値はログにも標準出力にも出さない。** 出すのは「形」と HTTP コードだけ。
set -u
REPO="Ayato-kosaka/live-streaming"
PROFILE="/home/ubuntu/doneru-chrome"   # ログイン状態が EBS に残るプロファイル
PORT=9222

pip3 install --quiet websocket-client >/dev/null 2>&1 || true

# 1. ログイン済みプロファイルで Chrome をデバッグポート付きで起動（起動済みなら使い回す）
if ! curl -s "http://localhost:${PORT}/json/version" >/dev/null 2>&1; then
  sudo -u ubuntu -i -- sh -c "export DISPLAY=:20; nohup google-chrome \
    --user-data-dir=${PROFILE} --remote-debugging-port=${PORT} \
    --no-first-run --no-default-browser-check https://doneru.jp/ \
    >/tmp/chrome_doneru.log 2>&1 & sleep 25; echo launched"
fi

# 2. CDP で doneru.jp の _dt を読む（平文。cookie DB の復号は要らない）
DT=$(python3 - <<'PY'
import json, urllib.request, websocket
v = json.load(urllib.request.urlopen("http://localhost:9222/json/version"))
ws = websocket.create_connection(v["webSocketDebuggerUrl"], timeout=20)
ws.send(json.dumps({"id":1,"method":"Storage.getCookies"}))
while True:
    m = json.loads(ws.recv())
    if m.get("id") == 1: break
for c in m["result"]["result"]:
    if c["name"] == "_dt" and "doneru.jp" in c["domain"]:
        print(c["value"]); break
PY
)

# 3. 形の確認（値は出さない）＋ api.doneru.jp で 200 が返るか
LEN=$(printf '%s' "$DT" | wc -c | tr -d ' ')
echo "read _dt: length=${LEN} (期待 33)"
[ -n "$DT" ] || { echo "ERROR: _dt not found — EC2 の Chrome でログインが切れています。再ログインが要ります"; exit 2; }
TODAY=$(date -u +%F); WEEKAGO=$(date -u -d '7 days ago' +%F)
CODE=$(curl -s -o /tmp/dt_check.out -w '%{http_code}' \
  -H "cookie: _dt=${DT}; __td_signed=true" \
  -H "origin: https://doneru.jp" -H "referer: https://doneru.jp/" \
  -H "user-agent: Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36" \
  "https://api.doneru.jp/streamer/donation-list/csv?start=${WEEKAGO}&end=${TODAY}")
echo "api.doneru.jp -> HTTP ${CODE}"
case "$CODE" in 200) : ;; *) echo "ERROR: _dt が無効（HTTP ${CODE}）。再ログインが要ります"; exit 2 ;; esac
head -c1 /tmp/dt_check.out | grep -q '<' && { echo "ERROR: HTML が返った（ログイン画面/Cloudflare）。再ログインが要ります"; exit 2; }

# 4. GitHub Secret に入れる（値は stdin。ログに出ない）
printf '%s' "$DT" | sudo -u ubuntu -i -- gh secret set DONERU_COOKIE --repo "$REPO"
echo "OK: DONERU_COOKIE を更新しました（_dt length=${LEN}）"