#TIMEOUT=1200
#!/bin/sh
# EC2 上で走る。ログイン済み Chrome から _dt を平文で読み（CDP。復号不要）、
# 切れていれば「Google でログイン → アカウント選択 → 同意」だけを CDP で押して取り直し、
# api.doneru.jp で妥当性を確かめてから gh で DONERU_COOKIE に入れる。
# **値はログにも標準出力にも出さない。** 出すのは「形」と HTTP コードだけ。
# **パスワード欄・本人確認（2段階）が出たら何も押さずに終了コード3で止まる。** そこから先はあやとの手。
set -u
REPO="Ayato-kosaka/live-streaming"
# Chrome の起こし方・プロファイルの複製・CDP の繋ぎ方は、共通の土台（.claude/skills/ec2-chrome/cdp.py）に任せる。
# ec2_exec.sh が実行の前に /home/ubuntu/cdp/cdp.py を置き直している。
# ログインが残っているのは ~/doneru-chrome（cdp.up("doneru") がここを使う。無ければ既定のプロファイルから1回だけ複製）
# DONERU_CHROME=<名前> は試すとき用。doneru-chrome を ~/cdp-<名前> に写したものを使い、本物を汚さない
export DONERU_CHROME="${DONERU_CHROME:-doneru}"
if [ "$DONERU_CHROME" = doneru ]; then PROFILE="/home/ubuntu/doneru-chrome"; else PROFILE="/home/ubuntu/cdp-${DONERU_CHROME}"; fi
DT_FILE=/tmp/.doneru_dt
# CHECK_ONLY=1 のときは、_dt が生きているかを見るだけで、ログインは押さない・Secret も入れない。
# **試すときはこれで回す。** ログインを押すと /challenge/ が開き、その場であやとのスマホに通知が飛ぶ
export CHECK_ONLY="${CHECK_ONLY:-0}"
# STOP_BEFORE_ACCOUNT=1 のときは、_dt が生きていてもログインの道を進み、アカウント選択で
# 押す直前の確かめ（elementFromPoint）まで出して止める。アカウントを押さないので /challenge/ は開かない
export STOP_BEFORE_ACCOUNT="${STOP_BEFORE_ACCOUNT:-0}"
# どこで抜けても Chrome を閉じてからにする。閉じずに止めると、取り直したセッションが EBS に書き戻されない
trap 'pkill -u ubuntu -f "user-data-dir=${PROFILE}" 2>/dev/null; sleep 5; rm -f "$DT_FILE" "$DT_FILE.browser" /tmp/doneru_challenge.txt /tmp/doneru_choice.txt' EXIT

[ -f /home/ubuntu/cdp/cdp.py ] || { echo "ERROR: /home/ubuntu/cdp/cdp.py が無い（ec2_exec.sh から回したか）"; exit 1; }
python3 -c 'import websocket' 2>/dev/null || apt-get install -y -qq python3-websocket >/dev/null 2>&1 \
  || pip3 install --quiet --break-system-packages websocket-client >/dev/null 2>&1
python3 -c 'import websocket' 2>/dev/null || { echo "ERROR: websocket-client を入れられない"; exit 1; }

# 1. デバッグポート付きで起動（もう動いていればそのまま使う）
python3 -c 'import os, sys; sys.path.insert(0, "/home/ubuntu/cdp"); from cdp import up; print("chrome port", up(os.environ["DONERU_CHROME"], "https://doneru.jp/"))' \
  || { echo "ERROR: デバッグポートが開かない"; tail -5 "/tmp/chrome-${DONERU_CHROME}.log"; exit 1; }

# 2. CDP で _dt を読む。無ければログインボタンを押していく（値は DT_FILE にだけ書く）
rm -f "$DT_FILE" /tmp/doneru_choice.txt
python3 - "$DT_FILE" <<'PY'
import hashlib, json, os, re, sys, time, urllib.parse
sys.path.insert(0, "/home/ubuntu/cdp")
import cdp
out = sys.argv[1]
CHECK_ONLY = os.environ.get("CHECK_ONLY") == "1"
STOP_BEFORE_ACCOUNT = os.environ.get("STOP_BEFORE_ACCOUNT") == "1"
NAME = os.environ.get("DONERU_CHROME", "doneru")
# Doneru（YouTube チャンネル ayato_arigato）に使う Google アカウント（あやと 2026-09-23）。
# リポジトリは公開なので、メールそのものではなく小文字にしたものの SHA-256 で照合する。
# 上を当て推量で押したら別のアカウントで本人確認に飛んだので、一致しなければ押さずに止める
# challenge/dp で待つ秒数。あやとがスマホを手にしているときだけ意味がある
# （通知は画面を開いた時点で飛ぶので、待っても待たなくても通知の数は変わらない）
WAIT_DP_SEC = 300
CHALLENGE_FILE = "/tmp/doneru_challenge.txt"
CHOICE_FILE = "/tmp/doneru_choice.txt"
# Doneru の配信者は YouTube チャンネル ayato_arigato。同じ Google アカウントに別のチャンネルがある
# 同じ Google アカウントに「あやと」「あやと と アプリ作り」などが並ぶので、名前が一致するものだけを押す
# （delegation の一覧は「<名前> Youtube」の形。li と中の要素が同じ字で重なって出る）
CHANNEL_RE = r"^ayato_arigato( Youtube)?$"
# 同じチャンネルの ID（公開の値。あやと 2026-11-11）。delegation の要素から取れればこちらで当てる
CHANNEL_ID = "UCCwutAH6ieHNvdyJAfSld7w"
# dp の画面に大きく出る照合用の数字（1〜3桁だけの字の塊）
NUMS = r"""[...document.querySelectorAll('body *')].filter(e => e.children.length === 0 && e.offsetParent !== null && /^\d{1,3}$/.test((e.innerText || '').trim())).map(e => e.innerText.trim())"""
ACCOUNT_SHA256 = "fc610098750871be3c2dbc1490ffff5de0e60d720b520366f993698fa8bb4adc"

def pages():
    return cdp.pages(NAME)

def Tab(t):
    # 土台の Tab。エラーを例外にしない（閉じかけの Google の窓に投げても止まらない、前の作りのまま）
    return cdp.Tab(cdp._port(NAME), t, timeout=30, strict=False)

def mask(m):  # メールは頭1字とドメインだけ出す
    return m[0] + "***" + m[m.index("@"):] if "@" in m else (m[:1] + "***" if m else "")

def wait_event(t, method, timeout):
    """t の CDP の知らせ method を1つ待って返す（来なければ None）"""
    end = time.time() + timeout
    try:
        while True:
            for i, m in enumerate(t.events):
                if m.get("method") == method:
                    return t.events.pop(i)
            if time.time() > end:
                return None
            t.ws.settimeout(max(0.5, end - time.time()))
            m = json.loads(t.ws.recv())
            if "method" in m:
                t.events.append(m)
    except Exception:
        return None
    finally:
        t.ws.settimeout(30)

def nav(t, url):
    # Page.navigate は行き先が決まるまで答えない。Fetch で止めた要求と待ち合わせて固まるので、答えを待たずに送る
    t.n += 1; t.ws.send(json.dumps({"id": t.n, "method": "Page.navigate", "params": {"url": url}}))

def open_login(t):
    """配信者ログインの行き先を開き、Google の OAuth の入口に prompt=select_account を足して開き直す。
    doneru の入口は prompt=consent だけなので、2026-11-11 に doneru-chrome でログイン中なのが別のアカウント
    1つになると、Google は選択を飛ばしてそのアカウントの challenge/dp へ直行した（あやとのスマホに違うアカウントの通知が2回）。
    転送の途中の要求も止まる（Fetch の Request 段は転送の1歩ごとに来る。2026-11-11 に確かめた）。
    毎回選択を出させて、こちらが sha256 で当てた行だけを押す。選択より前に /challenge/ へ行こうとしたら止める"""
    t.call("Fetch.enable", patterns=[{"urlPattern": "https://accounts.google.com/*", "resourceType": "Document", "requestStage": "Request"}])
    nav(t, "https://doneru.jp/auth/youtube?type=streamer")
    added = False
    try:
        for _ in range(12):
            ev = wait_event(t, "Fetch.requestPaused", 10 if added else 25)
            if not ev:
                if added:
                    break   # 足したあとの転送が止まらずに着いた。どこに着いたかは下の手順が見る
                print("STOP: Google のログインの画面へ移らなかった"); sys.exit(3)
            rid, u = ev["params"]["requestId"], ev["params"]["request"]["url"]
            sp = urllib.parse.urlsplit(u)
            print(f"  open_login: 要求 {where(u)}")
            if "/challenge" in sp.path:
                t.call("Fetch.failRequest", requestId=rid, errorReason="BlockedByClient")
                print(f"STOP: アカウントを選ぶ前に本人確認へ進もうとした（{where(u)}）。開かずに止める"); sys.exit(3)
            if not added:
                if not sp.path.startswith("/o/oauth2/"):
                    t.call("Fetch.failRequest", requestId=rid, errorReason="BlockedByClient")
                    print(f"STOP: Google の最初の行き先が OAuth の入口ではない（{where(u)}）。開かずに止める"); sys.exit(3)
                q = urllib.parse.parse_qsl(sp.query, keep_blank_values=True)
                pr = " ".join(v for k, v in q if k == "prompt").split()
                added = True
                print(f"  open_login: {where(u)}（元の prompt: {' '.join(pr) or 'なし'}）に prompt=select_account を足して開き直す")
                # 転送の途中の要求は URL を書き換えられないことがあるので、落としてから足した URL を新しく開く
                # （doneru の state の cookie は、転送の答えを受けた時点で入っている）
                t.call("Fetch.failRequest", requestId=rid, errorReason="Aborted")
                q = [(k, v) for k, v in q if k != "prompt"] + [("prompt", " ".join(["select_account"] + [w for w in pr if w != "select_account"]))]
                nav(t, urllib.parse.urlunsplit(sp._replace(query=urllib.parse.urlencode(q, quote_via=urllib.parse.quote))))
                continue
            t.call("Fetch.continueRequest", requestId=rid)
            if "/accountchooser" in sp.path:
                break
    finally:
        t.call("Fetch.disable")
    time.sleep(6)

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
    // 押す直前に画面の中へ送れるように、要素を窓に控えておく（座標は送ったあとに取り直す）
    const els = [...document.querySelectorAll('[data-identifier],li,[role=link],[role=button],button')].filter(vis);
    window.__dlg = els;
    const opts = els.map((e, i) => ({i, text: txt(e).replace(/\S+@\S+/g, '<mail>').slice(0, 60), cid: [...new Set((e.outerHTML || '').match(/UC[\w-]{22}/g) || [])], ...(r0 => ({x: r0.x + r0.width / 2, y: r0.y + r0.height / 2}))(e.getBoundingClientRect())}))
      .filter(o => o.text);
    return {kind: 'google:delegation', options: opts};
  }
  if (location.host.includes('accounts.google.com')) {
    const acct = [...document.querySelectorAll('[data-identifier]')].filter(vis);
    window.__acct = acct;
    // 2026-11-11、3件に増えた選択で一致 [0] を25回押しても進まなかった。原因を推測で直さないために、
    // 押す前に各行の伏せたメール（頭1字＋ドメイン）・状態の字・押す座標で当たる要素が行の中かを返す
    if (acct.length) return {kind: 'google:chooser', accounts: acct.map(e => {
      const r0 = e.getBoundingClientRect(), r = {x: r0.x + r0.width / 2, y: r0.y + r0.height / 2};
      const id = (e.getAttribute('data-identifier') || '').toLowerCase(), h = document.elementFromPoint(r.x, r.y);
      return {id, x: r.x, y: r.y, rect: [r0.x, r0.y, r0.width, r0.height].map(Math.round),
        mask: id.includes('@') ? id[0] + '***' + id.slice(id.indexOf('@')) : (id ? id[0] + '***' : ''),
        state: ((e.innerText || '').match(/ログアウト[^\n]*|再度ログイン[^\n]*|Signed out|Sign in again|Session expired/i) || [''])[0],
        hit: h ? h.tagName.toLowerCase() + (h.getAttribute('role') ? '[role=' + h.getAttribute('role') + ']' : '') : null,
        hit_in: !!(h && e.contains(h))}; })};
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

# 一致した行を画面の中へ送ってから座標を取り直し、その座標で当たる要素の最寄りの [data-identifier] が
# その行そのものかを見る。違う行に当たるなら押さない（00:51 の25回は、押しても先へ進まなかった）
PRE = r"""(i => { const e = (window.__acct || [])[i]; if (!e) return null; e.scrollIntoView({block: 'center', behavior: 'instant'});
  const r = e.getBoundingClientRect(), x = r.x + r.width / 2, y = r.y + r.height / 2, h = document.elementFromPoint(x, y);
  const row = h && h.closest('[data-identifier]');
  return {x, y, ok: row === e, other: row && row !== e ? window.__acct.indexOf(row) : null,
    hit: h ? h.tagName.toLowerCase() + (h.getAttribute('role') ? '[role=' + h.getAttribute('role') + ']' : '') + (h.getAttribute('jsaction') ? '[jsaction]' : '') : null}; })(%d)"""
# 本人確認の画面に出ているアカウント（見えている字から。無ければ属性から）
EMAILS = r"""(() => { const re = /[\w.+-]+@[\w-]+(\.[\w-]+)+/g, s = new Set();
  ((document.body && document.body.innerText) || '').match(re)?.forEach(m => s.add(m.toLowerCase()));
  if (!s.size) document.querySelectorAll('[data-email],[data-identifier]').forEach(e => [e.getAttribute('data-email'), e.getAttribute('data-identifier')].forEach(v => (v || '').match(re)?.forEach(m => s.add(m.toLowerCase()))));
  return [...s]; })()"""

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
if dt and STOP_BEFORE_ACCOUNT:
    print("  STOP_BEFORE_ACCOUNT: _dt は確かめずにログインの道を進む（アカウントは押さない）"); stale = dt; dt = None
if dt:
    bs = api_in_browser()
    print("existing _dt, browser fetch:", bs)
    if not bs.startswith("200"):
        print("  → 入っているが寄付一覧が読めない。ログインし直す"); stale = dt; dt = None
if CHECK_ONLY:
    print("CHECK_ONLY: _dt は", "生きている（寄付一覧が読めた）" if dt else "切れている／読めない。ログインは押さずに止める")
    sys.exit(0 if dt else 4)
if not dt:
    # 配信者のログインは /auth/login?loginType=streamer の「Sign in with YouTube」で、その行き先が
    # /auth/youtube?type=streamer（あやと 2026-09-23）。直接行けば Google のアカウント選択から始まる。
    # （/login は存在しない。Return to Home の画面になる）
    open_login(tab)
    chooser_shown = False
    for step in range(25):
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
        if STOP_BEFORE_ACCOUNT and r["kind"] != "google:chooser":
            print("STOP: STOP_BEFORE_ACCOUNT なのにアカウント選択が出ていない。何も押さずに止める"); sys.exit(3)
        if r["kind"] == "PASSWORD":
            print("STOP: パスワードを求められた。何も打たずに止める（あやとの手が要る）"); sys.exit(3)
        # /challenge/ は本人確認（dp = スマホに「はい」の通知、ipp = SMS、totp = 認証アプリ …）。
        # 開いた時点でスマホに通知が飛ぶので、待たずに止める。ここで粘ると毎回あやとを起こす
        # challenge/dp（スマホに「はい」＋数字の照合）だけは、あやとが手元で押せるように待つ。
        # 画面の数字は CHALLENGE_FILE に書く。こちらは別の SSM コマンドでそれを読んで、あやとに伝える
        if "accounts.google.com" in (url or "") and "/challenge/dp" in url and WAIT_DP_SEC > 0:
            # 選んだのと別のアカウントの本人確認に着いたら、数字を出さずに離れる（2026-11-11 に2回それで鳴らした）
            ems = cur.js(EMAILS) or []
            ok = bool(ems) and all(hashlib.sha256(m.encode()).hexdigest() == ACCOUNT_SHA256 for m in ems)
            print(f"  challenge/dp: 画面のアカウント {[mask(m) for m in ems]} → {'Doneru のアカウント' if ok else '違う／読めない'}")
            if not ok:
                cur.call("Page.navigate", url="about:blank")
                print("STOP: 本人確認が Doneru のアカウントのものではない。数字は出さずに離れて止める（通知は1通出ているが、押さなくてよい）"); sys.exit(3)
            nums = cur.js(NUMS) or []
            with open(CHALLENGE_FILE, "w") as f: f.write(f"{int(time.time())} numbers={nums}\n")
            os.chmod(CHALLENGE_FILE, 0o644)
            print(f"  challenge/dp: 画面の数字 {nums}。{WAIT_DP_SEC}秒待つ")
            t0 = time.time()
            while time.time() - t0 < WAIT_DP_SEC:
                time.sleep(5)
                ps = pages(); g = [p for p in ps if "accounts.google.com" in p["url"] and "/challenge/dp" in p["url"]]
                if not g or (read_dt(tab) or stale) != stale: break
            print(f"  challenge/dp: {int(time.time() - t0)}秒で抜けた（{'まだ本人確認' if g else '先へ進んだ'}）")
            with open(CHALLENGE_FILE, "a") as f: f.write("done\n")
            if g and (read_dt(tab) or stale) == stale:
                print("STOP: 本人確認が通らなかった。何も押さずに止める"); sys.exit(3)
            time.sleep(4); continue
        if "accounts.google.com" in (url or "") and "/challenge/" in url:
            print(f"STOP: Google が本人確認を求めた（{where(url)}）。何も押さずに止める（あやとの手が要る）"); sys.exit(3)
        if r["kind"] == "google:delegation":
            # どの YouTube チャンネルで入るか。先頭（個人のチャンネル「あひる」）を押すと、
            # Doneru には入れるが寄付一覧が 403（userType=streamer の Forbidden）になる（2026-09-23）
            opts = r["options"]
            print("  delegation:", [o["text"] for o in opts])
            # まずチャンネル ID で当てる（要素の中にその ID だけが出ているもの）。取れなければ名前で
            ids = [o for o in opts if o.get("cid") == [CHANNEL_ID]]
            print(f"  delegation: チャンネル ID の出ている要素 {sum(1 for o in opts if o.get('cid'))} 件、{CHANNEL_ID} だけのもの {len(ids)} 件")
            if ids:
                hit = ids[-1:]   # 外側と内側が重なって出るので、内側（後ろ）を押す
            else:
                hit = [o for o in opts if re.search(CHANNEL_RE, o["text"], re.I)]
                if len({o["text"] for o in hit}) == 1: hit = hit[-1:]   # 同じ字の重なりは1つに（内側の要素を押す）
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
            # チャンネルが7つに増えて、ayato_arigato が窓の下にはみ出した（2026-10-18）。
            # 窓の外の座標を押しても何も起きず、同じ画面で4回空振りしたので、送ってから押す
            p = cur.js(f"(() => {{ const e = (window.__dlg || [])[{hit[0]['i']}]; if (!e) return null; e.scrollIntoView({{block: 'center'}}); const r = e.getBoundingClientRect(); return {{x: r.x + r.width / 2, y: r.y + r.height / 2}}; }})()") or hit[0]
            time.sleep(1); click(cur, p["x"], p["y"]); time.sleep(6); continue
        if r["kind"] == "google:chooser":
            hit = [i for i, a in enumerate(r["accounts"]) if hashlib.sha256(a["id"].encode()).hexdigest() == ACCOUNT_SHA256]
            print(f"  account chooser: {len(r['accounts'])} 件、一致 {hit}")
            if not chooser_shown:   # 25回同じ行を出さない。最初の1回だけ
                chooser_shown = True
                for i, a in enumerate(r["accounts"]):
                    print(f"    [{i}] {a.get('mask')} 一致={i in hit} 状態={a.get('state') or '-'} 押す座標=({round(a['x'])},{round(a['y'])}) rect={a.get('rect')} elementFromPoint={a.get('hit')} 行の中={a.get('hit_in')}")
            if not hit:
                print("STOP: Doneru のアカウントが選択肢に無い。何も押さずに止める（あやとの手が要る）"); sys.exit(3)
            p = cur.js(PRE % hit[0]); time.sleep(0.5); p = cur.js(PRE % hit[0]) or {"ok": False}
            print(f"  押す前の確かめ: [{hit[0]}] 座標=({round(p.get('x', -1))},{round(p.get('y', -1))}) elementFromPoint={p.get('hit')} 行の中={p['ok']}"
                  + (f"（当たるのは [{p['other']}] の行）" if p.get("other") is not None else ""))
            if not p["ok"]:
                print("STOP: 押す座標が Doneru のアカウントの行に当たらない。押さずに止める"); sys.exit(3)
            if STOP_BEFORE_ACCOUNT:
                # 確かめの絵: メールを伏せ、押すはずの座標に赤い点を置いて撮る（押さない）
                cur.js(r"""(() => { const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); let n;
                  while ((n = w.nextNode())) n.nodeValue = n.nodeValue.replace(/\S+@\S+/g, '<mail>'); })()""")
                cur.js(f"(() => {{ const d = document.createElement('div'); d.style.cssText = 'position:fixed;left:{p['x'] - 6}px;top:{p['y'] - 6}px;width:12px;height:12px;border-radius:6px;background:red;pointer-events:none;z-index:99999'; document.body.appendChild(d); }})()")
                print("  shot:", cur.shot("/home/ubuntu/shots/doneru_chooser.jpg", quality=70))
                print("STOP_BEFORE_ACCOUNT: 押せる行に当たることを確かめた。押さずに止める"); sys.exit(0)
            r = p
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
if [ "$STOP_BEFORE_ACCOUNT" = 1 ]; then echo "STOP_BEFORE_ACCOUNT: ここで止める（Secret は触らない。exit $RC）"; exit "$RC"; fi
if [ "$CHECK_ONLY" = 1 ]; then echo "CHECK_ONLY: ここで止める（Secret は触らない。exit $RC）"; exit "$RC"; fi
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

