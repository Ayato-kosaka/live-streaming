#!/usr/bin/env python3
"""EC2 の上で動く（置き場 /home/ubuntu/cdp/cf_ec2.py）。Chrome（~/cdp-cloudflare）で Cloudflare を触る。
手元からは cf.py が置いて呼ぶ。直に呼ぶときも CHECK_ONLY の意味は同じ。

    python3 cf_ec2.py login                          # 「Google」で入る。CHECK_ONLY=1 ならアカウントの選択で押さずに止まる
    python3 cf_ec2.py check                          # 入っているかだけ見る（Google の画面は1枚も開かない）
    python3 cf_ec2.py dns-add TYPE NAME CONTENT …    # DNS only で足す。CHECK_ONLY=1 なら足さずに見るだけ
    python3 cf_ec2.py token [--name 名前] [--secret 名前]   # DNS の編集だけのトークンを作って Secret へ。CHECK_ONLY=1 なら作らない

最後の行は必ず `RESULT: <札> …`（手元の cf.py はこれを読む）。札は
LOGGED_IN / NOT_LOGGED_IN / CHECK_ONLY / EXPIRED / STOP / DONE。

## スマホを鳴らさない守り（Guard）

accounts.google.com の画面（Document）への要求は、出る前に Fetch で1本ずつ止めて見る。
`/challenge/` は**開いた時点で**あやとのスマホに通知が飛ぶ（2026-11-11・11-13 に、確かめずに開いて鳴らした）。
だから「あやとのアカウントを sha256 で当てて押した直後」の `/challenge/dp` だけを通し、それ以外の `/challenge/`
（パスワード・SMS・認証アプリ…）は要求ごと落とす。CHECK_ONLY と check・dns-add・token では1本も通さない。
画面を見てから止めるのでは遅い（開いた時点で鳴る）ので、要求の段で止める。

## 値を出さない

API トークンの値は、ページの中の fetch の答えから python の変数に入り、確かめと `gh secret set` の stdin に渡すだけ。
標準出力・ファイル・SSM のログには、長さと HTTP の答えしか出さない。
"""
import hashlib, json, os, pwd, re, signal, subprocess, sys, time, urllib.error, urllib.parse, urllib.request

sys.path.insert(0, "/home/ubuntu/cdp")
import cdp  # noqa: E402

NAME = "cloudflare"                       # Chrome の束と札の列の名前（~/cdp-cloudflare）
ZONE = "ayato-arigato.com"
REPO = "Ayato-kosaka/live-streaming"
DASH = "https://dash.cloudflare.com"
# あやとの Cloudflare（Google）のアカウント。公開リポジトリなので、メールを小文字にしたものの SHA-256 だけを持つ
# （Doneru・SUZURI と同じアカウント。google_login.py の AYATO_SHA256 と同じ値）
ACCOUNT_SHA256 = "fc610098750871be3c2dbc1490ffff5de0e60d720b520366f993698fa8bb4adc"
CHECK_ONLY = os.environ.get("CHECK_ONLY") == "1"
CHALLENGE_FILE = "/tmp/cloudflare_challenge.txt"
SHOTS = "/home/ubuntu/shots"
WAIT_DP_SEC = 300                          # 数字の窓（Google の通知は5分で切れる）
# ここに居るあいだは「入っていない」（ログイン・登録・Cloudflare 側の本人確認の画面）
OUT_PATHS = ("/login", "/sign-up", "/two-factor", "/email-verify", "/forgot", "/password-reset", "/fedbootstrap")


def say(*a):
    print(*a, flush=True)


def mask(m):
    m = m or ""
    return m[0] + "***" + m[m.index("@"):] if "@" in m else (m[:1] + "***" if m else "")


def sha(m):
    return hashlib.sha256((m or "").strip().lower().encode()).hexdigest()


class Result(Exception):
    def __init__(self, code, msg, rc):
        super().__init__(msg)
        self.code, self.msg, self.rc = code, msg, rc


def _term(signum, frame):
    # timeout（SIGTERM）で切られても finally の down を通す（閉じずに落ちるとセッションが書き戻されない）
    raise Result("STOP", f"時間切れで止められた（signal {signum}）", 3)


signal.signal(signal.SIGTERM, _term)


# ---------------------------------------------------------------- Chrome と守り

def prep_profile():
    """Chrome を起こす前に、終わるときにセッションの cookie も書き戻させる（起動の設定を「前回の続き」に）。
    Cloudflare のダッシュボードの cookie に期限の無いもの（ブラウザを閉じたら消えるもの）が混ざっていると、
    down で閉じたとたんにログインが消え、DNS を足すたびにあやとのスマホを鳴らすことになる。Chrome が
    セッションの cookie を残すのは、起動したときの設定が「前回の続き」のときだけなので、起こす前に書く"""
    cdp.hold(NAME)
    if cdp._alive(cdp._port(NAME)):
        return
    pref = f"{cdp._udd(NAME)}/Default/Preferences"
    if not os.path.exists(pref):
        return  # 初回は up() が既定のプロファイルから写す。写したあと次の回から効く
    try:
        j = json.load(open(pref))
    except ValueError:
        say("  profile: Preferences が読めない。触らずに進む")
        return
    s = j.setdefault("session", {})
    if s.get("restore_on_startup") == 1:
        return
    s["restore_on_startup"] = 1
    tmp = pref + ".cf"
    json.dump(j, open(tmp, "w"), separators=(",", ":"))
    u = pwd.getpwnam("ubuntu")
    os.chown(tmp, u.pw_uid, u.pw_gid)
    os.replace(tmp, pref)
    say("  profile: 起動の設定を「前回の続き」にした（閉じてもセッションの cookie を残す）")


def open_tab():
    prep_profile()
    cdp.up(NAME, "about:blank")
    ps = cdp.pages(NAME)
    # 「前回の続き」で開いたタブは閉じて1枚にする（tab() が手前のよそのタブを拾わないように）
    for p in ps[1:]:
        try:
            urllib.request.urlopen(f"http://localhost:{cdp._port(NAME)}/json/close/{p['id']}", timeout=5)
        except Exception:
            pass
    return cdp.Tab(cdp._port(NAME), ps[0], timeout=30, strict=False)


def send(t, method, **params):
    """答えを待たずに送る。Page.navigate は Fetch で止めた要求と待ち合わせて固まるので、これで送る"""
    t.n += 1
    t.ws.send(json.dumps({"id": t.n, "method": method, "params": params}))


def nav(t, url):
    send(t, "Page.navigate", url=url)


class Guard:
    """accounts.google.com の画面への要求を、出る前に1本ずつ見る（頭の「スマホを鳴らさない守り」）"""

    def __init__(self, t):
        self.t = t
        self.allow_dp = False    # あやとのアカウントを押した直後だけ True（CHECK_ONLY では立たない）
        self.stop = None         # 落とした理由（最初の1つ）。呼ぶ側が見て止まる
        self.entry = False
        t.call("Fetch.enable", patterns=[{"urlPattern": "https://accounts.google.com/*",
                                          "resourceType": "Document", "requestStage": "Request"}])

    def _one(self, p):
        rid, u = p["requestId"], p["request"]["url"]
        sp = urllib.parse.urlsplit(u)
        if "/challenge" in sp.path:
            if "/challenge/dp" in sp.path and self.allow_dp:
                say(f"  guard: 通す {cdp.where(u)}（あやとのアカウントを押した直後）")
                send(self.t, "Fetch.continueRequest", requestId=rid)
                return
            send(self.t, "Fetch.failRequest", requestId=rid, errorReason="BlockedByClient")
            why = "password" if "/challenge/pwd" in sp.path else f"challenge {sp.path}"
            say(f"  guard: 落とした {cdp.where(u)}（開いていない。スマホは鳴っていない）")
            self.stop = self.stop or why
            return
        if sp.path.startswith("/o/oauth2/") and not self.entry:
            # Cloudflare の入口は prompt=select_account を自分で付けている（2026-11-13 に見た）。
            # 付いていなければ足して開き直す。付けないと、Google は覚えたアカウントの本人確認へ直行する（Doneru で 2026-11-11）
            self.entry = True
            q = urllib.parse.parse_qsl(sp.query, keep_blank_values=True)
            pr = " ".join(v for k, v in q if k == "prompt").split()
            if "select_account" not in pr:
                say(f"  guard: {cdp.where(u)} に prompt=select_account を足して開き直す（元: {' '.join(pr) or 'なし'}）")
                send(self.t, "Fetch.failRequest", requestId=rid, errorReason="Aborted")
                q = [(k, v) for k, v in q if k != "prompt"] + [("prompt", " ".join(["select_account"] + pr))]
                nav(self.t, urllib.parse.urlunsplit(sp._replace(query=urllib.parse.urlencode(q, quote_via=urllib.parse.quote))))
                return
            say(f"  guard: {cdp.where(u)}（prompt: {' '.join(pr)}）")
        send(self.t, "Fetch.continueRequest", requestId=rid)

    def pump(self, sec=0.0):
        """止まっている要求を片づけながら sec 秒待つ。ほかの知らせは使わないので捨てる"""
        t, end = self.t, time.time() + sec
        while True:
            evs, t.events = t.events, []
            for m in evs:
                if m.get("method") == "Fetch.requestPaused":
                    self._one(m["params"])
            left = end - time.time()
            # 知らせが絶えず来ても（Network の知らせなど）時間で抜ける。最後に読んだ分は上で片づけてある
            if left <= 0:
                break
            t.ws.settimeout(max(0.05, min(0.5, left)))
            try:
                m = json.loads(t.ws.recv())
                if "method" in m:
                    t.events.append(m)
            except Exception:
                pass
        t.ws.settimeout(30)


def href(t):
    try:
        return t.js("location.href") or ""
    except Exception:
        return ""


def wait_loaded(t, g, sec=20):
    end = time.time() + sec
    while time.time() < end:
        g.pump(0.5)
        try:
            if t.js("document.readyState") == "complete":
                return True
        except Exception:
            pass
    return False


# ---------------------------------------------------------------- ダッシュボードの API（ページの中から）

# ダッシュボードの画面が送るのと同じ形（2026-11-13 に cf-shared-auth の JS で見た）:
# /api/v4/… を same-origin で、X-ATOK（window.bootstrap.atok）と X-Cross-Site-Security: dash を付ける
API = r"""(async (method, path, body) => {
  let atok = window.bootstrap && window.bootstrap.atok;
  if (!atok) { try { const r = await fetch('/api/v4/system/bootstrap', {credentials: 'same-origin', headers: {'X-Cross-Site-Security': 'dash'}});
    const seek = o => { if (!o || typeof o !== 'object') return null; if (typeof o.atok === 'string') return o.atok;
      for (const v of Object.values(o)) { const x = seek(v); if (x) return x; } return null; };
    atok = seek(await r.json()); } catch (e) {} }
  const h = {'X-Cross-Site-Security': 'dash'}; if (atok) h['X-ATOK'] = atok;
  if (body !== null) h['Content-Type'] = 'application/json';
  const r = await fetch('/api/v4' + path, {method, credentials: 'same-origin', headers: h, body: body === null ? undefined : JSON.stringify(body)});
  let j = null; try { j = await r.json(); } catch (e) {}
  return {status: r.status, atok: !!atok, json: j};
})(%s, %s, %s)"""


def api(t, method, path, body=None):
    r = t.call("Runtime.evaluate", expression=API % (json.dumps(method), json.dumps(path), json.dumps(body)),
               awaitPromise=True, returnByValue=True)
    v = (r.get("result") or {}).get("value") or {}
    return v.get("status"), (v.get("json") or {})


def errs(j):
    return "; ".join(f"{e.get('code')} {e.get('message')}" for e in (j.get("errors") or [])) or "-"


def whoami(t):
    """入っていれば (True, 伏せたメール, あやとのアカウントか)。入っていなければ (False, HTTP の答え, None)"""
    st, j = api(t, "GET", "/user")
    em = ((j.get("result") or {}).get("email") or "") if st == 200 and j.get("success") else ""
    if not em:
        return False, st, None
    return True, mask(em), sha(em) == ACCOUNT_SHA256


def dash_state(t, g, sec=35):
    """ダッシュボードを開き、入っているかを決める。(True, 伏せたメール, 一致) / (False, いまの場所, None)"""
    nav(t, DASH + "/")
    end, first_login = time.time() + sec, None
    while time.time() < end:
        g.pump(1)
        if g.stop:
            raise Result("STOP", f"ダッシュボードを開いただけで Google の本人確認へ行こうとした（{g.stop}）。落とした", 3)
        u = urllib.parse.urlsplit(href(t))
        if u.netloc != "dash.cloudflare.com":
            continue
        try:
            if t.js("document.readyState") != "complete":
                continue
        except Exception:
            continue
        ok, a, b = whoami(t)
        if ok:
            return True, a, b
        if u.path.startswith(OUT_PATHS):
            first_login = first_login or time.time()
            if time.time() - first_login > 4:   # 一瞬だけ /login を通る画面があるので、居座ったら決める
                return False, u.path, None
    return False, cdp.where(href(t)), None


def need_login(t, g):
    ok, who, match = dash_state(t, g)
    if not ok:
        raise Result("NOT_LOGGED_IN", f"Cloudflare に入っていない（{who}）。cf.py start → wait を先に", 4)
    say(f"  logged in: {who} あやとのアカウント={match}")
    if not match:
        raise Result("STOP", "入っているのがあやとのアカウントではない。何もしない", 3)


def zone_id(t):
    st, j = api(t, "GET", "/zones?name=" + urllib.parse.quote(ZONE))
    zs = j.get("result") or []
    if st != 200 or len(zs) != 1:
        raise Result("STOP", f"ゾーン {ZONE} が1つに決まらない（HTTP {st}・{len(zs)}件・{errs(j)}）", 3)
    z = zs[0]
    say(f"  zone: {ZONE} id={z.get('id')} status={z.get('status')} plan={(z.get('plan') or {}).get('name')}")
    return z["id"]


# ---------------------------------------------------------------- login

# Google の画面で押す先を探す（Doneru の remote_refresh.sh の FIND を Cloudflare 用に削ったもの）
FIND = r"""(() => {
  const vis = e => { if (!e) return false; const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && e.offsetParent !== null; };
  const txt = e => (e.innerText || e.value || e.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' ');
  if ([...document.querySelectorAll('input[type=password]')].some(vis)) return {kind: 'PASSWORD'};
  const acct = [...document.querySelectorAll('[data-identifier]')].filter(vis);
  window.__acct = acct;
  if (acct.length) return {kind: 'chooser', accounts: acct.map(e => {
    const id = (e.getAttribute('data-identifier') || '').toLowerCase();
    return {id, state: ((e.innerText || '').match(/ログアウト[^\n]*|再度ログイン[^\n]*|Signed out|Sign in again|Session expired/i) || [''])[0]}; })};
  const NG = /ポリシー|規約|policy|terms|ヘルプ|help|プライバシー|privacy|別のアカウント|another account/i;
  const b = [...document.querySelectorAll('button,[role=button],input[type=submit]')].filter(vis).filter(e => !NG.test(txt(e)))
    .find(e => /^(続行|次へ|許可|同意する|Continue|Allow|Next|I agree)$/i.test(txt(e)));
  if (b) { b.scrollIntoView({block: 'center'}); const r = b.getBoundingClientRect(); return {kind: 'button:' + txt(b), x: r.x + r.width / 2, y: r.y + r.height / 2}; }
  return {kind: 'none', diag: [...document.querySelectorAll('button,a,[role=button]')].filter(vis).map(e => txt(e).slice(0, 25)).slice(0, 20).join(' | ').replace(/\S+@\S+/g, '<mail>')};
})()"""

# 当てた行を画面の中へ送って座標を取り直し、その点で当たる要素の最寄りの行がその行そのものかを見る（違えば押さない）
PRE = r"""(i => { const e = (window.__acct || [])[i]; if (!e) return null; e.scrollIntoView({block: 'center', behavior: 'instant'});
  const r = e.getBoundingClientRect(), x = r.x + r.width / 2, y = r.y + r.height / 2, h = document.elementFromPoint(x, y);
  const row = h && h.closest('[data-identifier]');
  return {x, y, ok: row === e, hit: h ? h.tagName.toLowerCase() : null}; })(%d)"""

# 本人確認の画面に出ているアカウント（見えている字から。無ければ属性から）
EMAILS = r"""(() => { const re = /[\w.+-]+@[\w-]+(\.[\w-]+)+/g, s = new Set();
  ((document.body && document.body.innerText) || '').match(re)?.forEach(m => s.add(m.toLowerCase()));
  if (!s.size) document.querySelectorAll('[data-email],[data-identifier]').forEach(e => [e.getAttribute('data-email'), e.getAttribute('data-identifier')].forEach(v => (v || '').match(re)?.forEach(m => s.add(m.toLowerCase()))));
  return [...s]; })()"""

# dp の画面に大きく出る照合用の数字（1〜3桁だけの字の塊）
NUMS = r"""[...document.querySelectorAll('body *')].filter(e => e.children.length === 0 && e.offsetParent !== null && /^\d{1,3}$/.test((e.innerText || '').trim())).map(e => e.innerText.trim())"""

# Cloudflare のログイン画面の「Google」（aria-label は Continue with Google。2026-11-13）
CF_GOOGLE = r"""(() => { const vis = e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  const b = [...document.querySelectorAll('button,a,[role=button]')].filter(vis).find(e =>
    /^(continue|sign in) with google$/i.test(e.getAttribute('aria-label') || '') || /^google$/i.test((e.innerText || '').trim()));
  if (!b) return null; b.scrollIntoView({block: 'center'}); const r = b.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; })()"""


def click(t, x, y):
    for typ in ("mouseMoved", "mousePressed", "mouseReleased"):
        t.call("Input.dispatchMouseEvent", type=typ, x=x, y=y, button="left", clickCount=1)


def shot_masked(t, path, dot=None):
    """メールを伏せて（押すはずの点に赤い点を置いて）撮る"""
    t.js(r"""(() => { const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); let n;
      while ((n = w.nextNode())) n.nodeValue = n.nodeValue.replace(/\S+@\S+/g, '<mail>'); })()""")
    if dot:
        t.js(f"(() => {{ const d = document.createElement('div'); d.style.cssText = 'position:fixed;left:{dot[0] - 6}px;top:{dot[1] - 6}px;"
             "width:12px;height:12px;border-radius:6px;background:red;pointer-events:none;z-index:99999'; document.body.appendChild(d); }})()")
    return t.shot(path, quality=70)


def write_challenge(line):
    with open(CHALLENGE_FILE, "a" if line == "done" else "w") as f:
        f.write(line + "\n")
    os.chmod(CHALLENGE_FILE, 0o644)


def on_dp(t, g):
    """challenge/dp の画面。画面のアカウントを照らし、数字を出し、5分のうちに先へ進んだかを見る"""
    ems = t.js(EMAILS) or []
    ok = bool(ems) and all(sha(m) == ACCOUNT_SHA256 for m in ems)
    say(f"  challenge/dp: 画面のアカウント {[mask(m) for m in ems]} → {'あやとのアカウント' if ok else '違う／読めない'}")
    if not ok:
        nav(t, "about:blank")
        raise Result("STOP", "本人確認があやとのアカウントのものではない。数字は出さずに離れた（通知は1通出ている。押さなくてよい）", 3)
    nums = t.js(NUMS) or []
    write_challenge(f"{int(time.time())} numbers={nums}")
    say(f"CHALLENGE numbers={nums}")
    t0 = time.time()
    while time.time() - t0 < WAIT_DP_SEC:
        g.pump(3)
        if g.stop:
            break
        u = href(t)
        if u and "/challenge/dp" not in u:
            break
        n2 = t.js(NUMS) or []
        if n2 and n2 != nums:   # 画面が数字を出し直したら、手元にも出し直す
            nums = n2
            write_challenge(f"{int(time.time())} numbers={nums}")
            say(f"CHALLENGE numbers={nums}（出し直し）")
    else:
        write_challenge("done")
        nav(t, "about:blank")
        raise Result("EXPIRED", f"{WAIT_DP_SEC}秒のうちに押されなかった。数字の画面を離れた（その通知は押さなくてよい）", 5)
    write_challenge("done")
    if not g.stop:   # 落とした理由があれば、呼ぶ側がそれで止まる
        say(f"  challenge/dp: {int(time.time() - t0)}秒で先へ進んだ")


def logged_in_now(t):
    ok, who, match = whoami(t)
    if not ok:
        return False
    # 閉じても残るかの見当: 期限の無い cookie（閉じると消える側）が Cloudflare のどれだけにあるか（名前だけ）
    t.call("Network.enable")
    cs = t.call("Network.getCookies", urls=[DASH + "/", "https://cloudflare.com/"]).get("cookies", [])
    t.call("Network.disable")
    sess = sorted({c["name"] for c in cs if c.get("session")})
    say(f"  account: {who} あやとのアカウント={match}")
    say(f"  cookies: 期限つき {sum(1 for c in cs if not c.get('session'))} / 期限なし {len(sess)} {sess}")
    if not match:
        raise Result("STOP", "入ったのがあやとのアカウントではない", 3)
    return True


def login():
    t = open_tab()
    g = Guard(t)
    if os.path.exists(CHALLENGE_FILE):
        os.remove(CHALLENGE_FILE)
    # もう入っていれば押さない
    ok, who, match = dash_state(t, g)
    if ok:
        say(f"  account: {who} あやとのアカウント={match}")
        if not match:
            raise Result("STOP", "入っているのがあやとのアカウントではない。押していない", 3)
        raise Result("LOGGED_IN", "もう入っていた（本人確認は要らなかった）", 0)
    nav(t, DASH + "/login")
    c = None
    for _ in range(25):
        g.pump(1)
        c = t.js(CF_GOOGLE) if "dash.cloudflare.com/login" in href(t) else None
        if c:
            break
    if not c:
        say("  shot:", t.shot(f"{SHOTS}/cf_login_stuck.jpg", quality=60))
        raise Result("STOP", f"ログイン画面に「Google」が出ない（{cdp.where(href(t))}）。押していない", 3)
    say(f"  press: Cloudflare の「Google」 ({round(c[0])},{round(c[1])})")
    time.sleep(0.5)
    click(t, *c)
    pressed, shown, end = 0, False, time.time() + 90
    while time.time() < end:
        g.pump(1.5)
        if g.stop == "password":
            raise Result("STOP", "パスワード（Google のログインごと切れている。パスワードは打たない。あやとに入り直してもらう）", 3)
        if g.stop:
            raise Result("STOP", f"本人確認へ行こうとした（{g.stop}）。要求ごと落とした（スマホは鳴っていない）", 3)
        url = href(t)
        sp = urllib.parse.urlsplit(url)
        if sp.netloc == "dash.cloudflare.com":
            if sp.path.startswith(("/two-factor", "/email-verify")):
                raise Result("STOP", f"Cloudflare 側の本人確認（{sp.path}）。あやとの手が要る", 3)
            if not sp.path.startswith(OUT_PATHS) and logged_in_now(t):
                raise Result("LOGGED_IN", "ダッシュボードに着いた", 0)
            continue
        if sp.netloc != "accounts.google.com":
            continue
        if "/challenge/dp" in sp.path:
            on_dp(t, g)
            end = time.time() + 90     # 押されたあと、同意の画面を越えてダッシュボードに着くまで
            continue
        if "/challenge" in sp.path:
            # Google の画面は中で切り替わることもある（Document の要求が出ない）。守りをすり抜けて着いたら、すぐ離れる
            nav(t, "about:blank")
            raise Result("STOP", f"dp 以外の本人確認の画面（{sp.path}）。何も押さずに離れた", 3)
        r = t.js(FIND) or {"kind": "none"}
        if r["kind"] == "PASSWORD":
            raise Result("STOP", "パスワード（Google のログインごと切れている。パスワードは打たない。あやとに入り直してもらう）", 3)
        if r["kind"] == "chooser":
            acc = r["accounts"]
            hit = [i for i, a in enumerate(acc) if sha(a["id"]) == ACCOUNT_SHA256]
            if not shown:
                shown = True
                say(f"  account chooser: {len(acc)} 件、一致 {hit}  （{sp.netloc}{sp.path}）")
                for i, a in enumerate(acc):
                    say(f"    [{i}] {mask(a['id'])} 一致={i in hit} 状態={a.get('state') or '-'}")
            if not hit:
                raise Result("STOP", "あやとのアカウントが選択肢に無い。何も押していない", 3)
            p = t.js(PRE % hit[0])
            time.sleep(0.5)
            p = t.js(PRE % hit[0]) or {"ok": False}
            say(f"  押す前の確かめ: [{hit[0]}] 座標=({round(p.get('x', -1))},{round(p.get('y', -1))}) 当たる要素={p.get('hit')} 行の中={p['ok']}")
            if not p["ok"]:
                raise Result("STOP", "押す座標があやとのアカウントの行に当たらない。押していない", 3)
            if CHECK_ONLY:
                say("  shot:", shot_masked(t, f"{SHOTS}/cf_chooser.jpg", (p["x"], p["y"])), f"{SHOTS}/cf_chooser.jpg")
                nav(t, "about:blank")
                raise Result("CHECK_ONLY", "アカウントの選択で止めた（押していない。/challenge/ には進んでいない）", 0)
            if pressed >= 3:
                raise Result("STOP", "アカウントを3回押しても選択の画面のまま。止める", 3)
            g.allow_dp = True
            pressed += 1
            say(f"  press: [{hit[0]}] {mask(acc[hit[0]]['id'])}（{pressed}回目）")
            click(t, p["x"], p["y"])
            g.pump(4)
            continue
        if "x" in r and pressed:
            # アカウントを押したあとの同意（Continue / 続行）だけ押す。押す前の画面では何も押さない
            say(f"  press: {r['kind']}（{sp.path}）")
            click(t, r["x"], r["y"])
            g.pump(4)
            continue
        say(f"  wait: {sp.netloc}{sp.path} -> {r['kind']} {r.get('diag', '')}")
    say("  shot:", shot_masked(t, f"{SHOTS}/cf_login_stuck.jpg"))
    raise Result("STOP", f"先へ進まない（{cdp.where(href(t))}）", 3)


# ---------------------------------------------------------------- check

def check():
    t = open_tab()
    g = Guard(t)
    ok, who, match = dash_state(t, g)
    if ok:
        say(f"  account: {who} あやとのアカウント={match}")
        raise Result("LOGGED_IN", "入っている", 0)
    raise Result("NOT_LOGGED_IN", f"入っていない（{who}）", 4)


# ---------------------------------------------------------------- dns-add

PROXIABLE = {"A", "AAAA", "CNAME"}
SOLE = {"A", "AAAA", "CNAME"}        # 同じ名前に別の値を足すと、流れが割れる（A を2つ＝半分は違う所へ）


def fqdn(name):
    name = name.strip().rstrip(".").lower()
    if name in ("@", ZONE):
        return ZONE
    return name if name.endswith("." + ZONE) else f"{name}.{ZONE}"


def norm(typ, v):
    v = (v or "").strip()
    if typ == "TXT":
        # TXT は引用符つきで返ることがある（"..." と ... を同じものとして比べる）
        return v[1:-1] if len(v) >= 2 and v[0] == v[-1] == '"' else v
    if typ in ("CNAME", "NS", "MX"):
        return v.rstrip(".").lower()
    return v.lower()


def dns_add(argv):
    if not argv or len(argv) % 3:
        raise Result("STOP", "使いかた: dns-add TYPE NAME CONTENT [TYPE NAME CONTENT …]", 2)
    recs = [(argv[i].upper(), fqdn(argv[i + 1]), argv[i + 2]) for i in range(0, len(argv), 3)]
    t = open_tab()
    g = Guard(t)
    need_login(t, g)
    zid = zone_id(t)
    added = same = bad = 0
    for typ, name, content in recs:
        st, j = api(t, "GET", f"/zones/{zid}/dns_records?per_page=100&name=" + urllib.parse.quote(name))
        if st != 200 or not j.get("success"):
            say(f"  ERROR: {typ} {name} の今の値が読めない（HTTP {st}・{errs(j)}）。足さない")
            bad += 1
            continue
        ex = j.get("result") or []
        hit = [r for r in ex if r.get("type") == typ and norm(typ, r.get("content")) == norm(typ, content)]
        if hit:
            px = hit[0].get("proxied")
            say(f"  SAME: {typ} {name} {content} はもう在る（足さない）" + ("。**プロキシが入っている（橙の雲）。直していない**" if px else ""))
            same += 1
            continue
        clash = [r for r in ex if (typ in SOLE and r.get("type") == typ) or (typ == "CNAME") or (r.get("type") == "CNAME")]
        if clash:
            say(f"  CLASH: {typ} {name} には別の値がある {[(r.get('type'), r.get('content')) for r in clash]}。足さない（書き換えもしない）")
            bad += 1
            continue
        body = {"type": typ, "name": name, "content": content, "ttl": 1}
        if typ in PROXIABLE:
            body["proxied"] = False   # DNS only（灰色の雲）。橙にすると Firebase の証明書が進まない
        if CHECK_ONLY:
            say(f"  WOULD-ADD: {typ} {name} {content}（DNS only）")
            continue
        st, j = api(t, "POST", f"/zones/{zid}/dns_records", body)
        r = j.get("result") or {}
        if st == 200 and j.get("success"):
            say(f"  ADDED: {typ} {name} {content} proxied={r.get('proxied')} id={r.get('id')}")
            added += 1
        else:
            say(f"  ERROR: {typ} {name} を足せなかった（HTTP {st}・{errs(j)}）")
            bad += 1
    if CHECK_ONLY:
        raise Result("CHECK_ONLY", f"足していない（在る {same}・足す予定 {len(recs) - same - bad}・足せない {bad}）", 0)
    raise Result("DONE" if not bad else "STOP", f"足した {added}・もう在った {same}・足せなかった {bad}", 0 if not bad else 3)


# ---------------------------------------------------------------- token

def token(argv):
    import argparse
    p = argparse.ArgumentParser(prog="cf_ec2.py token")
    p.add_argument("--name", default=f"github-actions dns {ZONE}")
    p.add_argument("--secret", default="CLOUDFLARE_API_TOKEN")
    a = p.parse_args(argv)
    if not re.fullmatch(r"[A-Z][A-Z0-9_]*", a.secret):
        raise Result("STOP", f"Secret の名前の形が違う: {a.secret}", 2)
    t = open_tab()
    g = Guard(t)
    need_login(t, g)
    zid = zone_id(t)
    st, j = api(t, "GET", "/user/tokens/permission_groups")
    pg = [x for x in (j.get("result") or []) if x.get("name") == "DNS Write"
          and "com.cloudflare.api.account.zone" in (x.get("scopes") or [])]
    if st != 200 or len(pg) != 1:
        raise Result("STOP", f"権限「DNS Write」（Zone → DNS → Edit）が1つに決まらない（HTTP {st}・{len(pg)}件・{errs(j)}）", 3)
    say(f"  permission: DNS Write id={pg[0]['id']}（Zone → DNS → Edit）")
    st, j = api(t, "GET", "/user/tokens?per_page=50")
    dup = [x for x in (j.get("result") or []) if x.get("name") == a.name]
    say(f"  tokens: 今あるもの {len(j.get('result') or [])} 本（HTTP {st}）・同じ名前 {len(dup)} 本")
    if dup:
        raise Result("STOP", f"同じ名前のトークンがもう在る（{a.name}・id {dup[0].get('id')}）。作らない（値は二度と出ないので、要るなら古いのを消してから）", 3)
    policies = [{"effect": "allow", "resources": {f"com.cloudflare.api.account.zone.{zid}": "*"},
                 "permission_groups": [{"id": pg[0]["id"], "name": "DNS Write"}]}]
    if CHECK_ONLY:
        say(f"  WOULD-CREATE: 「{a.name}」 DNS Write を {ZONE} だけに → Secret {a.secret}")
        raise Result("CHECK_ONLY", "作っていない", 0)
    st, j = api(t, "POST", "/user/tokens", {"name": a.name, "policies": policies})
    r = j.get("result") or {}
    value = r.get("value") or ""
    j = r = None   # 値の入った答えを持ち回らない
    if st != 200 or not value:
        raise Result("STOP", f"トークンを作れなかった（HTTP {st}）", 3)
    say(f"  created: 長さ {len(value)}（値は出さない。画面にも二度と出ない）")
    try:
        # 作ったトークンで、本物の API から確かめる（有効か・このゾーンの DNS が読めるか）
        def cfapi(path):
            req = urllib.request.Request("https://api.cloudflare.com/client/v4" + path, headers={"Authorization": "Bearer " + value})
            try:
                with urllib.request.urlopen(req, timeout=20) as res:
                    return res.status, json.load(res)
            except urllib.error.HTTPError as e:
                return e.code, {}
        s1, v1 = cfapi("/user/tokens/verify")
        s2, _ = cfapi(f"/zones/{zid}/dns_records?per_page=1")
        say(f"  verify: HTTP {s1} status={(v1.get('result') or {}).get('status')}・{ZONE} の DNS を読む: HTTP {s2}")
        if s1 != 200 or s2 != 200:
            raise Result("STOP", "作ったトークンが確かめで通らない。Secret には入れていない（トークンは Cloudflare に残っている）", 3)
        # 値は stdin で渡す（引数・環境変数・ファイルに置かない）。gh は EC2 の ubuntu がログイン済み（doneru-cookie と同じ）
        pr = subprocess.run(["sudo", "-u", "ubuntu", "-i", "--", "gh", "secret", "set", a.secret, "--repo", REPO],
                            input=value, text=True, capture_output=True)
    finally:
        value = None
    if pr.returncode:
        raise Result("STOP", f"gh secret set が落ちた（exit {pr.returncode}）: {pr.stderr.strip()[-200:]}", 3)
    ls = subprocess.run(["sudo", "-u", "ubuntu", "-i", "--", "gh", "secret", "list", "--repo", REPO], capture_output=True, text=True)
    say("  secret:", next((ln for ln in ls.stdout.splitlines() if ln.split()[:1] == [a.secret]), "（一覧に見えない）"))
    raise Result("DONE", f"{a.secret} に入れた（DNS Write を {ZONE} だけ。値は出していない）", 0)


# ----------------------------------------------------------------

if __name__ == "__main__":
    cmd, rest = (sys.argv[1] if len(sys.argv) > 1 else "check"), sys.argv[2:]
    say(f"cf_ec2 {cmd} CHECK_ONLY={int(CHECK_ONLY)} start {time.strftime('%H:%M:%S', time.gmtime())} UTC")
    rc = 1
    try:
        if cmd == "login":
            login()
        elif cmd == "check":
            check()
        elif cmd == "dns-add":
            dns_add(rest)
        elif cmd == "token":
            token(rest)
        else:
            raise Result("STOP", f"知らない呼びかた: {cmd}", 2)
        raise Result("STOP", "結果を決めずに終わった", 1)
    except Result as r:
        rc = r.rc
        say(f"RESULT: {r.code} {r.msg}")
    except Exception as e:  # noqa: BLE001
        say(f"RESULT: STOP 落ちた: {type(e).__name__}: {str(e)[:300]}")
    finally:
        # 閉じてからにする（閉じずに置くと、ログインしたセッションがディスクに書き戻されない）
        try:
            cdp.down(NAME)
        except Exception:
            pass
    sys.exit(rc)
