#!/usr/bin/env python3
"""EC2 の上で動く（置き場 /home/ubuntu/cdp/cf_ec2.py）。Chrome（~/cdp-cloudflare）で Cloudflare に入り、**読む**。
手元からは cf.py が置いて呼ぶ。直に呼ぶときも CHECK_ONLY の意味は同じ。

    python3 cf_ec2.py login      # 入る。ログイン画面の「覚えたアカウントの行」（無ければ「Google」）を sha256 で当てて押す。
                                 # CHECK_ONLY=1 なら押す前に止まる（スマホは鳴らない）
    python3 cf_ec2.py check      # 入っているかだけ見る（何も押さない。Google の本人確認は1枚も開かない）
    python3 cf_ec2.py dns-list   # ayato-arigato.com のいまの DNS を `  REC {json}` で1本1行（手元の cf.py が表にする）

最後の行は必ず `RESULT: <札> …`（手元の cf.py はこれを読む）。札は
LOGGED_IN / NOT_LOGGED_IN / CHECK_ONLY / EXPIRED / STOP / DONE。

## 読むだけ

DNS を足す・API トークンを作る・GitHub の Secret に入れる、の口は持たない。
2026-11-13 にダッシュボードの中から DNS を足そうとしたら、Cloudflare の WAF が 403（Attention Required）で止めた。
あれは Cloudflare の守りなので、ヘッダを写す・足すなどで抜けようとしない。DNS はあやとがスマホの Cloudflare で入れる
（手元の cf.py dns-plan が、その打つ表を出す）。

## スマホを鳴らさない守り（Guard）

accounts.google.com の画面（Document）への要求は、出る前に Fetch で1本ずつ止めて見る。
`/challenge/` は**開いた時点で**あやとのスマホに通知が飛ぶ（2026-11-11・11-13 に、確かめずに開いて鳴らした）。
だから「あやとのアカウントを sha256 で当てて押した直後」の `/challenge/dp` だけを通し、それ以外の `/challenge/`
（パスワード・SMS・認証アプリ…）は要求ごと落とす。CHECK_ONLY と check・dns-list では1本も通さない。
画面を見てから止めるのでは遅い（開いた時点で鳴る）ので、要求の段で止める。
"""
import hashlib, json, os, signal, sys, time, urllib.parse, urllib.request

sys.path.insert(0, "/home/ubuntu/cdp")
import cdp  # noqa: E402

NAME = "cloudflare"                       # Chrome の束と札の列の名前（~/cdp-cloudflare）
ZONE = "ayato-arigato.com"
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

def open_tab():
    cdp.up(NAME, "about:blank")
    ps = cdp.pages(NAME)
    # よそのタブ（落ちたあとの復元など）は閉じて1枚にする（手前のよそのタブを拾わないように）
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
        self.fix_prompt = True   # 「Google」から入るときだけ、入口に prompt=select_account を足す（覚えた行から入るときは触らない）
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
            self.entry = True
            q = urllib.parse.parse_qsl(sp.query, keep_blank_values=True)
            pr = " ".join(v for k, v in q if k == "prompt").split()
            if self.fix_prompt and "select_account" not in pr:
                # 「Google」の入口は Cloudflare が prompt=select_account を自分で付けている（2026-11-13 に見た）。
                # 付いていなければ足して開き直す。付けないと、Google は覚えたアカウントの本人確認へ直行する（Doneru で 2026-11-11）
                say(f"  guard: {cdp.where(u)} に prompt=select_account を足して開き直す（元: {' '.join(pr) or 'なし'}）")
                send(self.t, "Fetch.failRequest", requestId=rid, errorReason="Aborted")
                q = [(k, v) for k, v in q if k != "prompt"] + [("prompt", " ".join(["select_account"] + pr))]
                nav(self.t, urllib.parse.urlunsplit(sp._replace(query=urllib.parse.urlencode(q, quote_via=urllib.parse.quote))))
                return
            say(f"  guard: {cdp.where(u)}（prompt: {' '.join(pr) or 'なし'}）")
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


def ready(t):
    try:
        return t.js("document.readyState") == "complete"
    except Exception:
        return False


# ---------------------------------------------------------------- ダッシュボードの中から読む

# 2026-11-13 に 200 で通った形そのまま: /api/v4/… を同じ origin へ、cookie つきで、ヘッダは x-cross-site-security: dash だけ。
# 通ったのは /zones?name=…・/zones/<id>/dns_records・/system/bootstrap。読みにだけ使う（method は渡さない＝GET だけ）。
# 書き（DNS を足す）は同じ日に WAF の 403 で止まった。あれは Cloudflare の守りなので抜けようとしない（SKILL.md 6）
READ = r"""(path => fetch('/api/v4' + path, {credentials: 'include', headers: {'x-cross-site-security': 'dash'}})
  .then(async r => { let j = null; try { j = await r.json(); } catch (e) {} return {status: r.status, json: j}; })
  .catch(e => ({status: -1, json: null})))(%s)"""


def read(t, path):
    r = t.call("Runtime.evaluate", expression=READ % json.dumps(path), awaitPromise=True, returnByValue=True)
    v = (r.get("result") or {}).get("value") or {}
    return v.get("status"), (v.get("json") or {})


def errs(j):
    return "; ".join(f"{e.get('code')} {e.get('message')}" for e in (j.get("errors") or [])) or "-"


def zone_seen(t):
    """ゾーンが読めるか。('in', ゾーン) / ('other', 何件見えたか) / (None, HTTP の答え)。
    ayato-arigato.com がちょうど1つ見えれば、その持ち主（あやとのアカウント）で入っている"""
    st, j = read(t, "/zones?name=" + urllib.parse.quote(ZONE))
    if st != 200:
        return None, st
    zs = j.get("result") or []
    return ("in", zs[0]) if len(zs) == 1 else ("other", f"{ZONE} が {len(zs)} 件")


def dash_state(t, g, sec=35):
    """ダッシュボードを開き、入っているかを決める。('in', ゾーン) / ('other', 説明) / ('out', いまの場所)"""
    nav(t, DASH + "/")
    end, first_out = time.time() + sec, None
    while time.time() < end:
        g.pump(1)
        if g.stop:
            raise Result("STOP", f"ダッシュボードを開いただけで Google の本人確認へ行こうとした（{g.stop}）。落とした", 3)
        u = urllib.parse.urlsplit(href(t))
        if u.netloc != "dash.cloudflare.com" or not ready(t):
            continue
        if u.path.startswith(OUT_PATHS):
            first_out = first_out or time.time()
            if time.time() - first_out > 4:   # 一瞬だけ /login を通る画面があるので、居座ったら決める
                return "out", u.path
            continue
        s, info = zone_seen(t)
        if s:
            return s, info
    return "out", cdp.where(href(t))


def need_login(t, g):
    s, info = dash_state(t, g)
    if s == "out":
        raise Result("NOT_LOGGED_IN", f"Cloudflare に入っていない（{info}）。cf.py start → wait を先に", 4)
    if s == "other":
        raise Result("STOP", f"入ってはいるが {info}（あやとのアカウントではない？）。何もしない", 3)
    say(f"  zone: {ZONE} status={info.get('status')} ns={info.get('name_servers')}")
    return info


# ---------------------------------------------------------------- login

# Cloudflare のログイン画面。覚えたアカウントの行（2026-11-13 に、前に「この端末に覚える」で入ったので出た）と「Google」。
# 行はメールの字を持つ押しどころ。どれを押すかは Python が sha256 で決める（位置で選ばない）
CF_LOGIN = r"""(() => { const vis = e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  const label = e => (e.innerText || e.getAttribute('aria-label') || '').trim();
  const els = [...document.querySelectorAll('button,a,[role=button]')].filter(vis);
  const rows = els.filter(e => /@/.test(e.innerText || '') && !/^remove/i.test(label(e)));
  window.__cfrows = rows;
  const g = els.find(e => /^(continue with |sign in with )?google$/i.test(label(e)));
  let google = null;
  if (g) { g.scrollIntoView({block: 'center'}); const r = g.getBoundingClientRect(); google = [r.x + r.width / 2, r.y + r.height / 2]; }
  return {google, saved: rows.map((e, i) => ({i, mail: ((e.innerText || '').match(/[\w.+-]+@[\w-]+(\.[\w-]+)+/) || [''])[0].toLowerCase()}))}; })()"""

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

# 当てた行を画面の中へ送って座標を取り直し、その点で当たる要素の最寄りの押しどころがその行（か、その中の同じ行の字）かを見る。
# 違えば押さない（隣の行や「消す」の印を押さないように）
AIM = r"""((key, sel, i) => { const e = (window[key] || [])[i]; if (!e) return null; e.scrollIntoView({block: 'center', behavior: 'instant'});
  const r = e.getBoundingClientRect(), x = r.x + r.width / 2, y = r.y + r.height / 2, h = document.elementFromPoint(x, y);
  const row = h && h.closest(sel), lb = row ? (row.innerText || row.getAttribute('aria-label') || '').trim() : '';
  return {x, y, ok: !!row && (row === e || (e.contains(row) && !/^remove/i.test(lb))), hit: h ? h.tagName.toLowerCase() : null}; })(%s, %s, %d)"""

# 本人確認の画面に出ているアカウント（見えている字から。無ければ属性から）
EMAILS = r"""(() => { const re = /[\w.+-]+@[\w-]+(\.[\w-]+)+/g, s = new Set();
  ((document.body && document.body.innerText) || '').match(re)?.forEach(m => s.add(m.toLowerCase()));
  if (!s.size) document.querySelectorAll('[data-email],[data-identifier]').forEach(e => [e.getAttribute('data-email'), e.getAttribute('data-identifier')].forEach(v => (v || '').match(re)?.forEach(m => s.add(m.toLowerCase()))));
  return [...s]; })()"""

# dp の画面に大きく出る照合用の数字（1〜3桁だけの字の塊）
NUMS = r"""[...document.querySelectorAll('body *')].filter(e => e.children.length === 0 && e.offsetParent !== null && /^\d{1,3}$/.test((e.innerText || '').trim())).map(e => e.innerText.trim())"""


def click(t, x, y):
    for typ in ("mouseMoved", "mousePressed", "mouseReleased"):
        t.call("Input.dispatchMouseEvent", type=typ, x=x, y=y, button="left", clickCount=1)


def aim(t, key, sel, i):
    t.js(AIM % (json.dumps(key), json.dumps(sel), i))
    time.sleep(0.5)
    p = t.js(AIM % (json.dumps(key), json.dumps(sel), i)) or {"ok": False}
    say(f"  押す前の確かめ: [{i}] 座標=({round(p.get('x', -1))},{round(p.get('y', -1))}) 当たる要素={p.get('hit')} 行の中={p['ok']}")
    if not p["ok"]:
        raise Result("STOP", "押す座標があやとのアカウントの行に当たらない。押していない", 3)
    return p


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


def login_screen(t, g):
    """ログイン画面で、覚えたアカウントの行か「Google」が出るまで最大25秒待つ。
    描き終わるまで空に見え、行とボタンが同じ瞬間に出るとは限らないので、見えてから2秒置いて読み直したものを使う"""
    nav(t, DASH + "/login")
    for _ in range(25):
        g.pump(1)
        c = t.js(CF_LOGIN) if "dash.cloudflare.com/login" in href(t) else None
        if c and (c.get("saved") or c.get("google")):
            g.pump(2)
            return t.js(CF_LOGIN) or c
    say("  shot:", shot_masked(t, f"{SHOTS}/cf_login_stuck.jpg"))
    raise Result("STOP", f"ログイン画面に、覚えたアカウントの行も「Google」も出ない（{cdp.where(href(t))}）。押していない", 3)


def login():
    t = open_tab()
    g = Guard(t)
    if os.path.exists(CHALLENGE_FILE):
        os.remove(CHALLENGE_FILE)
    s, info = dash_state(t, g)
    if s == "in":
        raise Result("LOGGED_IN", "もう入っていた（何も押していない）", 0)
    if s == "other":
        raise Result("STOP", f"入ってはいるが {info}（あやとのアカウントではない？）。押していない", 3)
    c = login_screen(t, g)
    rows = c.get("saved") or []
    hit = [r["i"] for r in rows if sha(r["mail"]) == ACCOUNT_SHA256]
    if rows:
        say(f"  saved: 覚えたアカウントの行 {len(rows)} 件、一致 {hit}")
        for r in rows:
            say(f"    [{r['i']}] {mask(r['mail'])} 一致={r['i'] in hit}")
    chose = False   # あやとのアカウント（覚えた行か、Google の選択）を押したか。押したあとの同意だけ押す
    if hit:
        # いつもの道（2026-11-13 の実測。スマホは鳴らずにダッシュボードに着いた）
        p = aim(t, "__cfrows", "button,a,[role=button]", hit[0])
        if CHECK_ONLY:
            say("  shot:", shot_masked(t, f"{SHOTS}/cf_chooser.jpg", (p["x"], p["y"])), f"{SHOTS}/cf_chooser.jpg")
            nav(t, "about:blank")
            raise Result("CHECK_ONLY", "覚えたアカウントの行で止めた（押していない。Google には進んでいない）", 0)
        # 覚えたアカウントからは、Google が選択の画面を飛ばして数字の画面へ来ることがある（画面のアカウントは on_dp が照らす）。
        # 入口の prompt は書き換えない（実測の道は書き換えずに通った。select_account を足すと別の道になる）
        g.allow_dp, g.fix_prompt, chose = True, False, True
        say(f"  press: 覚えたアカウントの行 [{hit[0]}] {mask(rows[hit[0]]['mail'])}")
        click(t, p["x"], p["y"])
    else:
        # あやとの行が無いとき（覚えが消えた・Chrome の束を作り直した・よその行だけ）は「Google」から。
        # Google の選択と dp を通るのでスマホが鳴る（2026-11-13 に、この道で1通鳴らした・#1202）
        if not c.get("google"):
            say("  shot:", shot_masked(t, f"{SHOTS}/cf_login_stuck.jpg"))
            raise Result("STOP", "覚えたアカウントの行にあやとのアカウントが無く、「Google」も無い。何も押していない", 3)
        x, y = c["google"]
        say(f"  press: Cloudflare の「Google」 ({round(x)},{round(y)})（あやとの覚えた行が無い）")
        time.sleep(0.5)
        click(t, x, y)
    follow(t, g, chose)


def follow(t, g, chose):
    """押したあと。ダッシュボードに着く・Google の選択・数字の画面・同意を、90秒の窓で1つずつ片づける"""
    presses, shown, end = 0, False, time.time() + 90
    while time.time() < end:
        g.pump(1.5)
        if g.stop == "password":
            raise Result("STOP", "パスワード（Google のログインごと切れている。パスワードは打たない。あやとに入り直してもらう）", 3)
        if g.stop:
            raise Result("STOP", f"本人確認へ行こうとした（{g.stop}）。要求ごと落とした（スマホは鳴っていない）", 3)
        sp = urllib.parse.urlsplit(href(t))
        if sp.netloc == "dash.cloudflare.com":
            if sp.path.startswith(("/two-factor", "/email-verify")):
                raise Result("STOP", f"Cloudflare 側の本人確認（{sp.path}）。あやとの手が要る", 3)
            if not sp.path.startswith(OUT_PATHS) and ready(t):
                s, info = zone_seen(t)
                if s == "in":
                    raise Result("LOGGED_IN", f"ダッシュボードに着いた（{ZONE} が見える）", 0)
                if s == "other":
                    raise Result("STOP", f"入ったが {info}（あやとのアカウントではない？）", 3)
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
            p = aim(t, "__acct", "[data-identifier]", hit[0])
            if CHECK_ONLY:
                say("  shot:", shot_masked(t, f"{SHOTS}/cf_chooser.jpg", (p["x"], p["y"])), f"{SHOTS}/cf_chooser.jpg")
                nav(t, "about:blank")
                raise Result("CHECK_ONLY", "Google のアカウントの選択で止めた（押していない。/challenge/ には進んでいない）", 0)
            if presses >= 3:
                raise Result("STOP", "アカウントを3回押しても選択の画面のまま。止める", 3)
            g.allow_dp, chose = True, True
            presses += 1
            say(f"  press: [{hit[0]}] {mask(acc[hit[0]]['id'])}（{presses}回目）")
            click(t, p["x"], p["y"])
            g.pump(4)
            continue
        if "x" in r and chose:
            # あやとのアカウントを押したあとの同意（Continue / 続行）だけ押す。押す前の画面では何も押さない
            say(f"  press: {r['kind']}（{sp.path}）")
            click(t, r["x"], r["y"])
            g.pump(4)
            continue
        say(f"  wait: {sp.netloc}{sp.path} -> {r['kind']} {r.get('diag', '')}")
    say("  shot:", shot_masked(t, f"{SHOTS}/cf_login_stuck.jpg"))
    raise Result("STOP", f"先へ進まない（{cdp.where(href(t))}）", 3)


# ---------------------------------------------------------------- check / dns-list

def check():
    t = open_tab()
    g = Guard(t)
    s, info = dash_state(t, g)
    if s == "in":
        raise Result("LOGGED_IN", f"入っている（{ZONE} が見える）", 0)
    if s == "other":
        raise Result("STOP", f"入ってはいるが {info}（あやとのアカウントではない？）", 3)
    raise Result("NOT_LOGGED_IN", f"入っていない（{info}）", 4)


def dns_list():
    t = open_tab()
    g = Guard(t)
    z = need_login(t, g)
    recs, page = [], 1
    while True:
        st, j = read(t, f"/zones/{z['id']}/dns_records?per_page=100&page={page}")
        if st != 200:
            raise Result("STOP", f"DNS のレコードが読めない（HTTP {st}・{errs(j)}）", 3)
        recs += j.get("result") or []
        last = int((j.get("result_info") or {}).get("total_pages") or 1)
        if page >= min(last, 10):
            break
        page += 1
    for r in sorted(recs, key=lambda r: (r.get("name") or "", r.get("type") or "", r.get("content") or "")):
        say("  REC " + json.dumps({k: r.get(k) for k in ("type", "name", "content", "proxied", "ttl")}, ensure_ascii=False))
    raise Result("DONE", f"{ZONE} の DNS を {len(recs)} 本読んだ（読んだだけ。何も変えていない）", 0)


# ----------------------------------------------------------------

if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else "check"
    say(f"cf_ec2 {cmd} CHECK_ONLY={int(CHECK_ONLY)} start {time.strftime('%H:%M:%S', time.gmtime())} UTC")
    rc = 1
    try:
        if cmd == "login":
            login()
        elif cmd == "check":
            check()
        elif cmd == "dns-list":
            dns_list()
        else:
            raise Result("STOP", f"知らない呼びかた: {cmd}（login / check / dns-list だけ）", 2)
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
