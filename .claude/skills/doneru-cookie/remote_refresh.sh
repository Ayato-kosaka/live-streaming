#TIMEOUT=1200
#!/bin/sh
# EC2 上で走る。ログイン済み Chrome から _dt を平文で読み（CDP。復号不要）、
# 切れていれば「Google でログイン → アカウント選択 → 同意」だけを CDP で押して取り直し、
# api.doneru.jp で妥当性を確かめてから gh で DONERU_COOKIE に入れる。
# **値はログにも標準出力にも出さない。** 出すのは「形」と HTTP コードだけ。
# **パスワード欄・本人確認（2段階）が出たら何も押さずに終了コード3で止まる。** そこから先はあやとの手。
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
trap 'pkill -u ubuntu -f "user-data-dir=${PROFILE}" 2>/dev/null; sleep 5; rm -f "$DT_FILE" "$DT_FILE.browser" /tmp/doneru_challenge.txt /tmp/doneru_choice.txt' EXIT

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
  --user-data-dir=${PROFILE} --remote-debugging-port=${PORT} --remote-allow-origins=http://localhost:${PORT} \
  --no-first-run --no-default-browser-check https://doneru.jp/ \
  >/tmp/chrome_doneru.log 2>&1 & sleep 20; echo launched"
curl -s "http://localhost:${PORT}/json/version" >/dev/null || { echo "ERROR: デバッグポートが開かない"; tail -5 /tmp/chrome_doneru.log; exit 1; }

# 2. CDP で _dt を読む。無ければログインボタンを押していく（値は DT_FILE にだけ書く）
rm -f "$DT_FILE" /tmp/doneru_choice.txt
python3 - "$DT_FILE" <<'PY'
import hashlib, json, os, re, sys, time, urllib.request, websocket
out = sys.argv[1]
BASE = "http://localhost:9222"
# Doneru（YouTube チャンネル ayato_arigato）に使う Google アカウント（あやと 2026-09-23）。
# リポジトリは公開なので、メールそのものではなく小文字にしたものの SHA-256 で照合する。
# 上を当て推量で押したら別のアカウントで本人確認に飛んだので、一致しなければ押さずに止める
# challenge/dp で待つ秒数。あやとがスマホを手にしているときだけ意味がある
# （通知は画面を開いた時点で飛ぶので、待っても待たなくても通知の数は変わらない）
WAIT_DP_SEC = 300
CHALLENGE_FILE = "/tmp/doneru_challenge.txt"
CHOICE_FILE = "/tmp/doneru_choice.txt"
# Doneru の配信者は YouTube チャンネル ayato_arigato。同じ Google アカウントに別のチャンネルがある
CHANNEL_RE = r"ayato|arigato|あやと"
# dp の画面に大きく出る照合用の数字（1〜3桁だけの字の塊）
NUMS = r"""[...document.querySelectorAll('body *')].filter(e => e.children.length === 0 && e.offsetParent !== null && /^\d{1,3}$/.test((e.innerText || '').trim())).map(e => e.innerText.trim())"""
ACCOUNT_SHA256 = "fc610098750871be3c2dbc1490ffff5de0e60d720b520366f993698fa8bb4adc"

def pages():
    return [t for t in json.load(urllib.request.urlopen(BASE + "/json/list")) if t["type"] == "page"]

class Tab:
    def __init__(self, t):
        # Origin を付けると Chrome 111+ は 403 で弾く（起動側の --remote-allow-origins と二重に塞ぐ）
        self.ws = websocket.create_connection(t["webSocketDebuggerUrl"], timeout=30, suppress_origin=True); self.n = 0
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

def api_in_browser():
    # ブラウザの中から寄付一覧の API を叩く。EC2 からの curl だけでは _dt の良し悪しを言い切れないのと、
    # _dt が本物でも「別の YouTube チャンネルで入っている」と 403 になるので、それもここで分かる
    tab.call("Page.navigate", url="https://doneru.jp/"); time.sleep(6)
    end = time.strftime("%Y-%m-%d", time.gmtime()); start = time.strftime("%Y-%m-%d", time.gmtime(time.time() - 7 * 86400))
    res = tab.call("Runtime.evaluate", awaitPromise=True, returnByValue=True, expression=
        "fetch('https://api.doneru.jp/streamer/donation-list/csv?start=%s&end=%s', {credentials: 'include'})"
        ".then(async r => { const t = await r.text(); return r.status + ' ' + (t.trim().startsWith('<') ? 'html' : (r.status == 200 ? 'csv' : t.slice(0, 80))) + ' lines=' + t.split('\\n').length; })"
        ".catch(e => 'error ' + e)" % (start, end))
    return str(res.get("result", {}).get("value"))

def google_logged_in(tab):
    return any(c["name"] == "SID" for c in tab.call("Network.getCookies", urls=["https://accounts.google.com/"]).get("cookies", []))

# 押す先を JS で探し、座標を返す。押すのは Input.dispatchMouseEvent（本物のクリック）。
# Google のボタンは Google Identity Services の iframe（accounts.google.com/gsi/button）の中に
# 描かれることがあり、上のページの JS からは .click() できないが、座標のクリックなら届く。
# 「Googleプライバシーポリシー」のような規約のリンクを押し続けたことがあるので、規約系は外す。
FIND = r"""(() => {
  const vis = e => { if (!e) return false; const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && e.offsetParent !== null; };
  const at = (e, kind) => { e.scrollIntoView({block: 'center'}); const r = e.getBoundingClientRect(); return {kind, x: r.x + r.width / 2, y: r.y + r.height / 2, diag: diag()}; };
  if ([...document.querySelectorAll('input[type=password]')].some(vis)) return {kind: 'PASSWORD'};
  const txt = e => (e.innerText || e.value || e.getAttribute('aria-label') || e.getAttribute('alt') || '').trim().replace(/\s+/g, ' ');
  const NG = /ポリシー|規約|policy|terms|ヘルプ|help|プライバシー|privacy/i;
  const clickables = () => [...document.querySelectorAll('button,a,[role=button],[role=link],input[type=submit],[data-identifier]')].filter(vis).filter(e => !NG.test(txt(e)));
  const diag = () => 'clickables=[' + clickables().map(e => e.tagName.toLowerCase() + ':' + txt(e).slice(0, 25) + (e.pathname ? '(' + e.pathname + ')' : '')).slice(0, 30).join(' | ').replace(/\S+@\S+/g, '<mail>') +
    '] iframes=[' + [...document.querySelectorAll('iframe')].filter(vis).map(f => { try { const u = new URL(f.src); return u.host + u.pathname; } catch (_) { return '?'; } }).join(' | ') + ']';
  if (location.host.includes('accounts.google.com') && location.pathname.includes('/oauth/delegation')) {
    const opts = [...document.querySelectorAll('[data-identifier],li,[role=link],[role=button],button')].filter(vis)
      .map(e => ({text: txt(e).replace(/\S+@\S+/g, '<mail>').slice(0, 60), ...(r0 => ({x: r0.x + r0.width / 2, y: r0.y + r0.height / 2}))(e.getBoundingClientRect())}))
      .filter(o => o.text);
    return {kind: 'google:delegation', options: opts};
  }
  if (location.host.includes('accounts.google.com')) {
    const acct = [...document.querySelectorAll('[data-identifier]')].filter(vis);
    if (acct.length) return {kind: 'google:chooser', accounts: acct.map(e => { const r0 = e.getBoundingClientRect(), r = {x: r0.x + r0.width / 2, y: r0.y + r0.height / 2}; return {id: (e.getAttribute('data-identifier') || '').toLowerCase(), x: r.x, y: r.y}; })};
    const b = clickables().find(e => /^(続行|次へ|許可|同意する|Continue|Allow|Next|I agree)$/i.test(txt(e)));
    if (b) return at(b, 'google:' + txt(b));
    return {kind: 'google:none', diag: diag()};
  }
  const gsi = [...document.querySelectorAll('iframe')].filter(vis).find(f => /accounts\.google\.com\/gsi/.test(f.src));
  if (gsi) return at(gsi, 'doneru:gsi-iframe');
  const g = clickables().find(e => /google/i.test(txt(e)));
  if (g) return at(g, 'doneru:' + txt(g).slice(0, 30));
  const l = clickables().find(e => /ログイン|log ?in|sign ?in|sign ?up|新規登録|はじめる|始める|get started|dashboard|ダッシュボード/i.test(txt(e)) || /login|signin|auth/i.test(e.pathname || ''));
  if (l) return at(l, 'doneru:' + txt(l).slice(0, 30));
  return {kind: 'doneru:none', diag: diag()};
})()"""

def click(t, x, y):
    for typ in ("mouseMoved", "mousePressed", "mouseReleased"):
        t.call("Input.dispatchMouseEvent", type=typ, x=x, y=y, button="left", clickCount=1)

tab = Tab(pages()[0]); tab.call("Network.enable")
import atexit
def _close():
    try: tab.call("Browser.close")
    except Exception: pass
atexit.register(_close)
print("google SID in profile:", google_logged_in(tab))
dt = read_dt(tab); stale = None
print("existing _dt valid:", bool(dt))
if dt:
    bs = api_in_browser()
    print("existing _dt, browser fetch:", bs)
    if not bs.startswith("200"):
        print("  → 入っているが寄付一覧が読めない。ログインし直す"); stale = dt; dt = None
if not dt:
    # 配信者のログインは /auth/login?loginType=streamer の「Sign in with YouTube」で、その行き先が
    # /auth/youtube?type=streamer（あやと 2026-09-23）。直接行けば Google のアカウント選択から始まる。
    # （/login は存在しない。Return to Home の画面になる）
    tab.call("Page.navigate", url="https://doneru.jp/auth/youtube?type=streamer"); time.sleep(8)
    for step in range(15):
        # Google のログインは別窓で開くことがある。accounts.google.com の窓があればそちらを押す
        ps = pages(); g = [p for p in ps if "accounts.google.com" in p["url"]]
        d = [p for p in ps if "doneru" in p["url"]]
        cur = Tab(g[-1] if g else (d[-1] if d else ps[0]))
        # 読めない古い _dt（別のチャンネルで入ったもの）が残っているので、変わったものだけを受け取る
        dt = read_dt(tab)
        if dt and dt != stale: break
        dt = None
        url = cur.js("location.href"); r = cur.js(FIND) or {"kind": "none"}
        # 押す候補の一覧は、最初の1回と、押す先が見つからなかったときだけ出す
        if step == 0 or "x" not in r:
            print("  diag:", r.get("diag"))
        print(f"step {step}: {where(url)} -> {r['kind']}")
        if r["kind"] == "PASSWORD":
            print("STOP: パスワードを求められた。何も打たずに止める（あやとの手が要る）"); sys.exit(3)
        # /challenge/ は本人確認（dp = スマホに「はい」の通知、ipp = SMS、totp = 認証アプリ …）。
        # 開いた時点でスマホに通知が飛ぶので、待たずに止める。ここで粘ると毎回あやとを起こす
        # challenge/dp（スマホに「はい」＋数字の照合）だけは、あやとが手元で押せるように待つ。
        # 画面の数字は CHALLENGE_FILE に書く。こちらは別の SSM コマンドでそれを読んで、あやとに伝える
        if "accounts.google.com" in (url or "") and "/challenge/dp" in url and WAIT_DP_SEC > 0:
            nums = cur.js(NUMS) or []
            with open(CHALLENGE_FILE, "w") as f: f.write(f"{int(time.time())} numbers={nums}\n")
            os.chmod(CHALLENGE_FILE, 0o644)
            print(f"  challenge/dp: 画面の数字 {nums}。{WAIT_DP_SEC}秒待つ")
            t0 = time.time()
            while time.time() - t0 < WAIT_DP_SEC:
                time.sleep(5)
                ps = pages(); g = [p for p in ps if "accounts.google.com" in p["url"] and "/challenge/dp" in p["url"]]
                if not g or read_dt(tab): break
            print(f"  challenge/dp: {int(time.time() - t0)}秒で抜けた（{'まだ本人確認' if g else '先へ進んだ'}）")
            with open(CHALLENGE_FILE, "a") as f: f.write("done\n")
            if g and not read_dt(tab):
                print("STOP: 本人確認が通らなかった。何も押さずに止める"); sys.exit(3)
            time.sleep(4); continue
        if "accounts.google.com" in (url or "") and "/challenge/" in url:
            print(f"STOP: Google が本人確認を求めた（{where(url)}）。何も押さずに止める（あやとの手が要る）"); sys.exit(3)
        if r["kind"] == "google:delegation":
            # どの YouTube チャンネルで入るか。先頭（個人のチャンネル「あひる」）を押すと、
            # Doneru には入れるが寄付一覧が 403（userType=streamer の Forbidden）になる（2026-09-23）
            opts = r["options"]
            print("  delegation:", [o["text"] for o in opts])
            hit = [o for o in opts if re.search(CHANNEL_RE, o["text"], re.I)]
            if len(hit) != 1:
                # 決まらなければ選択肢を書き出し、こちらが SSM で CHOICE_FILE に番号を書くまで待つ
                with open(CHALLENGE_FILE, "w") as f: f.write("channels=" + json.dumps([o["text"] for o in opts], ensure_ascii=False) + "\n")
                os.chmod(CHALLENGE_FILE, 0o644)
                t0 = time.time(); hit = []
                while time.time() - t0 < WAIT_DP_SEC and not hit:
                    time.sleep(5)
                    if os.path.exists(CHOICE_FILE):
                        i = int(open(CHOICE_FILE).read().strip()); hit = [opts[i]]
                if not hit:
                    print("STOP: チャンネルを決められなかった。何も押さずに止める"); sys.exit(3)
            print("  delegation: 押す ->", hit[0]["text"])
            click(cur, hit[0]["x"], hit[0]["y"]); time.sleep(6); continue
        if r["kind"] == "google:chooser":
            hit = [i for i, a in enumerate(r["accounts"]) if hashlib.sha256(a["id"].encode()).hexdigest() == ACCOUNT_SHA256]
            print(f"  account chooser: {len(r['accounts'])} 件、一致 {hit}")
            if not hit:
                print("STOP: Doneru のアカウントが選択肢に無い。何も押さずに止める（あやとの手が要る）"); sys.exit(3)
            r = r["accounts"][hit[0]]
        if "x" in r: click(cur, r["x"], r["y"])
        time.sleep(6)
    if not dt:
        d = read_dt(tab); dt = d if d and d != stale else None
if dt:
    fd = os.open(out, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600); os.write(fd, dt.encode()); os.close(fd)
    print("got _dt")
    bs = api_in_browser()
    print("browser fetch:", bs)
    with open(out + ".browser", "w") as f: f.write(bs.split(" ")[0])
else:
    print("no _dt after login flow")
PY
RC=$?
[ "$RC" -eq 3 ] && exit 3
[ "$RC" -eq 0 ] || { echo "ERROR: CDP の手順が落ちた（exit $RC）。STDERR を見る"; exit 1; }
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
BROWSER=$(cat "${DT_FILE}.browser" 2>/dev/null); rm -f "${DT_FILE}.browser"
if [ "$CODE" = 200 ] && ! head -c1 /tmp/dt_check.out | grep -q '<'; then
  echo "csv rows (header 込み): $(wc -l < /tmp/dt_check.out)"
else
  # 403 の中身は Cloudflare の HTML か Doneru の応答か（値ではなく種類だけ出す）
  echo "curl body: $(head -c1 /tmp/dt_check.out | grep -q '<' && echo html || echo text), $(wc -c < /tmp/dt_check.out) bytes, cf: $(grep -c -i cloudflare /tmp/dt_check.out)"
  [ "$BROWSER" = 200 ] || { echo "ERROR: _dt が無効（curl ${CODE} / browser ${BROWSER}）"; rm -f /tmp/dt_check.out; exit 2; }
  echo "curl は弾かれたがブラウザでは 200。入れて、Actions の取り込みで確かめる"
fi
rm -f /tmp/dt_check.out

# 4. GitHub Secret に入れる（値は stdin。ログに出ない）
printf '%s' "$DT" | sudo -u ubuntu -i -- gh secret set DONERU_COOKIE --repo "$REPO" \
  && echo "OK: DONERU_COOKIE を更新しました（_dt length=${LEN}）"
sudo -u ubuntu -i -- gh secret list --repo "$REPO" | grep '^DONERU_COOKIE'

