#TIMEOUT=900
#!/bin/sh
# EC2 上で走る。ログイン済み Chrome から _dt を平文で読み（CDP。復号不要）、
# 切れていれば「Google でログイン → アカウント選択 → 同意」だけを CDP で押して取り直し、
# api.doneru.jp で妥当性を確かめてから gh で DONERU_COOKIE に入れる。
# **値はログにも標準出力にも出さない。** 出すのは「形」と HTTP コードだけ。
# **パスワード欄が出たら何も打たずに終了コード3で止まる。** そこから先はあやとの手。
set -u
REPO="Ayato-kosaka/live-streaming"
# Google / Doneru のセッションが残っているのは既定のプロファイル（nanitabeyo の作業で作ったもの）。
# ただし Chrome 136 以降は既定の user-data-dir ではデバッグポートを開かないので、
# そこから複製した別ディレクトリで起動する。複製は無いときだけ（以後はこちらが正）。
SRC_UDD="/home/ubuntu/.config/google-chrome"
PROFILE="/home/ubuntu/doneru-chrome"
PORT=9222
DT_FILE=/tmp/.doneru_dt
# どこで抜けても Chrome を閉じてからにする。閉じずに止めると、取り直したセッションが EBS に書き戻されない
trap 'pkill -u ubuntu -f "user-data-dir=${PROFILE}" 2>/dev/null; sleep 5; rm -f "$DT_FILE"' EXIT

# Ubuntu の pip は PEP 668 で素のままだと入れてくれない。apt を先に試す。
python3 -c 'import websocket' 2>/dev/null || apt-get install -y -qq python3-websocket >/dev/null 2>&1 \
  || pip3 install --quiet --break-system-packages websocket-client >/dev/null 2>&1
python3 -c 'import websocket' 2>/dev/null || { echo "ERROR: websocket-client を入れられない"; exit 1; }

# 画面（Xvfb :20）が無ければ立てる
pgrep -f 'Xvfb :20' >/dev/null || { sudo -u ubuntu sh -c 'nohup Xvfb :20 -screen 0 1280x900x24 >/tmp/xvfb.log 2>&1 &'; sleep 2; }

if [ ! -d "$PROFILE/Default" ]; then
  echo "seed: $SRC_UDD/Default を $PROFILE に複製"
  mkdir -p "$PROFILE" && cp -a "$SRC_UDD/Default" "$SRC_UDD/Local State" "$PROFILE/" && chown -R ubuntu:ubuntu "$PROFILE"
fi
# 前回の起動が残した鍵を外す（Chrome は動いていない前提。動いていれば起動し直す）
pkill -u ubuntu -f "user-data-dir=${PROFILE}" 2>/dev/null; sleep 2
rm -f "$PROFILE"/Singleton*

# 1. デバッグポート付きで起動
sudo -u ubuntu -i -- sh -c "export DISPLAY=:20; nohup google-chrome \
  --user-data-dir=${PROFILE} --remote-debugging-port=${PORT} \
  --no-first-run --no-default-browser-check https://doneru.jp/ \
  >/tmp/chrome_doneru.log 2>&1 & sleep 20; echo launched"
curl -s "http://localhost:${PORT}/json/version" >/dev/null || { echo "ERROR: デバッグポートが開かない"; tail -5 /tmp/chrome_doneru.log; exit 1; }

# 2. CDP で _dt を読む。無ければログインボタンを押していく（値は DT_FILE にだけ書く）
rm -f "$DT_FILE"
python3 - "$DT_FILE" <<'PY'
import json, os, re, sys, time, urllib.request, websocket
out = sys.argv[1]
BASE = "http://localhost:9222"

def pages():
    return [t for t in json.load(urllib.request.urlopen(BASE + "/json/list")) if t["type"] == "page"]

class Tab:
    def __init__(self, t):
        self.ws = websocket.create_connection(t["webSocketDebuggerUrl"], timeout=30); self.n = 0
    def call(self, method, **params):
        self.n += 1; self.ws.send(json.dumps({"id": self.n, "method": method, "params": params}))
        while True:
            m = json.loads(self.ws.recv())
            if m.get("id") == self.n: return m.get("result", {})
    def js(self, expr):
        return self.call("Runtime.evaluate", expression=expr, returnByValue=True).get("result", {}).get("value")

def where(url):  # クエリには鍵が乗ることがあるので、ホストとパスだけ出す
    m = re.match(r"https?://([^/?#]+)([^?#]*)", url or ""); return (m.group(1) + m.group(2)) if m else url

def read_dt(tab):
    for c in tab.call("Network.getCookies", urls=["https://doneru.jp/", "https://api.doneru.jp/"]).get("cookies", []):
        if c["name"] == "_dt" and "doneru.jp" in c["domain"] and c.get("expires", 0) > time.time() + 3600:
            return c["value"]

def google_logged_in(tab):
    return any(c["name"] == "SID" for c in tab.call("Network.getCookies", urls=["https://accounts.google.com/"]).get("cookies", []))

CLICK = r"""(() => {
  const vis = e => e && e.offsetParent !== null;
  if ([...document.querySelectorAll('input[type=password]')].some(vis)) return 'PASSWORD';
  const txt = e => (e.innerText || e.value || '').trim();
  const clickables = () => [...document.querySelectorAll('button,a,[role=button],[role=link],input[type=submit]')].filter(vis);
  if (location.host.includes('accounts.google.com')) {
    const acct = [...document.querySelectorAll('[data-identifier]')].filter(vis);
    if (acct.length) { acct[0].click(); return 'google:account(' + acct.length + ')'; }
    const b = clickables().find(e => /^(続行|次へ|許可|同意する|Continue|Allow|Next|I agree)$/i.test(txt(e)));
    if (b) { b.click(); return 'google:' + txt(b); }
    return 'google:none [' + clickables().map(txt).filter(Boolean).slice(0, 12).join(' | ').replace(/\S+@\S+/g, '<mail>') + ']';
  }
  const g = clickables().find(e => /google/i.test(txt(e)));
  if (g) { g.click(); return 'doneru:' + txt(g).slice(0, 30); }
  const l = clickables().find(e => /ログイン|login|sign ?in/i.test(txt(e)));
  if (l) { l.click(); return 'doneru:' + txt(l).slice(0, 30); }
  return 'doneru:none [' + clickables().map(txt).filter(Boolean).slice(0, 12).join(' | ') + ']';
})()"""

tab = Tab(pages()[0]); tab.call("Network.enable")
print("google SID in profile:", google_logged_in(tab))
dt = read_dt(tab)
print("existing _dt valid:", bool(dt))
if not dt:
    tab.call("Page.navigate", url="https://doneru.jp/login"); time.sleep(6)
    for step in range(15):
        # Google のログインは別窓で開くことがある。accounts.google.com の窓があればそちらを押す
        ps = pages(); g = [p for p in ps if "accounts.google.com" in p["url"]]
        cur = Tab(g[-1]) if g else Tab([p for p in ps if "doneru" in p["url"]][-1] if any("doneru" in p["url"] for p in ps) else ps[0])
        dt = read_dt(tab)
        if dt: break
        url = cur.js("location.href"); r = cur.js(CLICK)
        print(f"step {step}: {where(url)} -> {r}")
        if r == "PASSWORD":
            print("STOP: パスワードを求められた。何も打たずに止める（あやとの手が要る）"); sys.exit(3)
        time.sleep(6)
    dt = dt or read_dt(tab)
if dt:
    fd = os.open(out, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600); os.write(fd, dt.encode()); os.close(fd)
    print("got _dt")
else:
    print("no _dt after login flow")
PY
RC=$?
[ "$RC" -eq 3 ] && exit 3
[ -s "$DT_FILE" ] || { echo "ERROR: _dt を取れなかった。上の step の行を見て、押す所を足す"; exit 2; }
DT=$(cat "$DT_FILE"); rm -f "$DT_FILE"

# 3. 形の確認（値は出さない）＋ api.doneru.jp で 200 が返るか
LEN=$(printf '%s' "$DT" | wc -c | tr -d ' ')
echo "read _dt: length=${LEN} (期待 33)"
TODAY=$(date -u +%F); WEEKAGO=$(date -u -d '7 days ago' +%F)
CODE=$(curl -s -o /tmp/dt_check.out -w '%{http_code}' \
  -H "cookie: _dt=${DT}; __td_signed=true" \
  -H "origin: https://doneru.jp" -H "referer: https://doneru.jp/" \
  -H "user-agent: Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36" \
  "https://api.doneru.jp/streamer/donation-list/csv?start=${WEEKAGO}&end=${TODAY}")
echo "api.doneru.jp -> HTTP ${CODE}"
case "$CODE" in 200) : ;; *) echo "ERROR: _dt が無効（HTTP ${CODE}）"; exit 2 ;; esac
head -c1 /tmp/dt_check.out | grep -q '<' && { echo "ERROR: HTML が返った（ログイン画面/Cloudflare）"; exit 2; }
echo "csv rows (header 込み): $(wc -l < /tmp/dt_check.out)"; rm -f /tmp/dt_check.out

# 4. GitHub Secret に入れる（値は stdin。ログに出ない）
printf '%s' "$DT" | sudo -u ubuntu -i -- gh secret set DONERU_COOKIE --repo "$REPO" \
  && echo "OK: DONERU_COOKIE を更新しました（_dt length=${LEN}）"
sudo -u ubuntu -i -- gh secret list --repo "$REPO" | grep '^DONERU_COOKIE'

