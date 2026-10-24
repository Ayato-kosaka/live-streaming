#!/usr/bin/env python3
"""EC2 の上で動く。Chrome を CDP（デバッグポート）で操作する小さな道具。

手元からは `ec2.py put` でこのファイルを `/home/ubuntu/cdp/cdp.py` に置き、
`ec2.py run` で送る短い python から `sys.path.insert(0, "/home/ubuntu/cdp"); from cdp import *`
で使う。

    up("suzuri")            # ~/cdp-suzuri で Chrome を起動（無ければ既定のプロファイルから1回だけ複製。拡張などは写さない）
    t = tab()               # いちばん手前のタブ
    t.go("https://suzuri.jp/")
    t.js("document.title")
    t.click_at(x, y)        # 本物のクリック（Input.dispatchMouseEvent）
    t.shot("/home/ubuntu/shots/a.jpg")   # 手元へは ec2.py get で持ち帰る

## なぜ既定のプロファイルを直接使わないか

Chrome 136 以降は、既定の user-data-dir（~/.config/google-chrome）では
デバッグポートを開かない。なので、サイトごとに複製したディレクトリで起動する。
**複製は無いときだけ。** 以後はその複製が正で、ログインし直したセッションもそこに残る。
複製し直したいときは `up(name, reseed=True)`。

## 起動したまま、何回にも分けて触る

Chrome は `setsid nohup` で SSM のコマンドから切り離して起動する。
1回の send-command が終わっても Chrome は残るので、次の send-command で
同じタブの続きから触れる。**閉じるのは `down(name)`**（Browser.close で閉じる。
pkill だけだとセッションが書き戻されなかった回がある＝Doneru で踏んだ）。

## 束を2人で同時に触らない（札。2026-10-24）

同じ束（`~/cdp-<名前>`）を2人が同時に触ると、タブを閉じ合い、入力が混ざる（10-24 01:01 UTC、投稿の担当2人が
fish の Chrome で同時に `tt_post.py` を回し、片方の `fresh_tab` がもう片方のタブを閉じた）。呼ぶ側が札を取るのを
覚えていてくれる形では守れないので、Chrome を開く・タブを拾う共通の所で守る。`up(name)`・`tab(name)`・`pages(name)` は、
**列 `name` の札を持っていなければ、このプロセスの pid で取る**（`hold(name)`。持てるまで待つ。
ほかの人が持っていれば、何番目で誰が持っているかを出す）。pid の札なので、このプロセスが終われば
（kill -9 でも）次の確かめで消える。手元のセッションが `ec2.py lease` / `ec2.py hold` で取った札は、
`ec2.py run` が `EC2_QUEUE_TICKET` で渡してくるので、取り直さずにそれを使う（自分の札を待って詰まらない）。
EC2 に `ec2-queue` が無い・答えないときは、札なしで進む（Chrome の道具を止めない。止める側の守りは idle-stop が持つ）。

## 版の番号（CDP_VERSION。2026-10-24）

札を入れた日のうちに、EC2 の `/home/ubuntu/cdp/cdp.py` が札を取らない古い版に戻っていた。古い枝のセッションが、
使うたびに手元の版を置き直す道具（`ec2_exec.sh`・`post.py send`）で書き戻した。だから EC2 の上の `cdp-heal`
（`cdp_heal.sh`）が、ここが**正の版**（`ec2.py guard` が `/usr/local/lib/ec2-chrome/cdp.py` に置く）より小さい番号に
なったら、すぐ正の版に戻す。手元から置く道具（`ec2.py put`・`ec2_exec.sh`・`ec2.py guard`）も、EC2 のほうが
大きい番号なら置かない。**中身を変えて master に入れるときは番号を上げる**（上げないと、EC2 に残っている
同じ番号の古い中身が戻されずに残る）。番号の行が無い版は 0（札の前の版と、札を入れた最初の版 #1027）。
呼び名（`up(name)` など）は変えない。古い枝の道具が、戻された版をそのまま呼ぶ。
"""
import atexit, base64, json, os, re, subprocess, sys, time, urllib.request

# 版の番号（上の「版の番号」）。行の形は `cdp_heal.sh` の ver() が読む（行頭から `CDP_VERSION = <数>`）
CDP_VERSION = 2

HOME = "/home/ubuntu"
SRC_UDD = f"{HOME}/.config/google-chrome"
# サイト名 → ポート。並べて起動しても奪い合わないように、名前ごとに固定する
PORTS = {"doneru": 9222, "suzuri": 9223}
# 既定の Chrome から写さないもの（rsync の --exclude。Default の下）。
# あやとが遠隔デスクトップで使う普段の Chrome には、拡張（AdBlock・画面録画・VPN）・
# Google ドキュメントのオフライン・サービスワーカーのキャッシュが溜まっていて、まるごと写すと
# サイトごとに 1.2〜2.0G、7つで 10G を超えた（EC2 のディスク 29G のうち。#1013）。
# どれもログインとは関係が無い（ログインは Network/ の Cookie・Local Storage・Login Data）
SEED_SKIP = ["Extensions", "Local Extension Settings", "Extension State", "Extension Rules",
             "Extension Scripts", "Service Worker", "File System",
             "IndexedDB/https_drive.google.com_0.indexeddb.*", "IndexedDB/https_docs.google.com_0.indexeddb.*"]


QUEUE = "/usr/local/sbin/ec2-queue"
QUEUE_WAIT_S = int(os.environ.get("EC2_QUEUE_WAIT", "1800"))
QUEUE_POLL_S = 2     # 待ち札の聞き直しの間（EC2 の上なので安い）
_HELD = {}       # 列 → 札（このプロセスが持っているもの。取ったもの・渡されたもの）
_TAKEN = set()   # このプロセスが取った札（終わるときに返す）


def _q(*args, timeout=30):
    """ec2-queue を1回呼んで (終了コード, 答え) を返す。答えが読めなければ {"state": "error"}"""
    try:
        r = subprocess.run([QUEUE, "--json", *map(str, args)], capture_output=True, text=True, timeout=timeout)
    except (OSError, subprocess.TimeoutExpired) as e:
        return 1, {"state": "error", "why": repr(e)}
    for ln in reversed(r.stdout.splitlines()):
        if ln.startswith("EC2Q "):
            try:
                return r.returncode, json.loads(ln[5:])
            except ValueError:
                break
    return r.returncode, {"state": "error", "why": (r.stdout + r.stderr).strip()[-200:]}


def _say(msg):
    print(f"cdp: {msg}", file=sys.stderr, flush=True)


def _release_all():
    for tk in list(_TAKEN):
        _q("release", tk)
        _TAKEN.discard(tk)


def hold(name, purpose=None, wait=None):
    """列 name の札をこのプロセスで持つ（無ければ pid で取る。持てるまで待つ）。戻り値は札（無ければ None）"""
    if name in _HELD:
        return _HELD[name]
    mine = dict(x.split(":", 1) for x in os.environ.get("EC2_QUEUE_TICKET", "").split() if ":" in x)
    if name in mine and _q("owns", mine[name], name)[0] == 0:
        _HELD[name] = mine[name]
        return mine[name]
    if not os.access(QUEUE, os.X_OK):
        _say(f"{QUEUE} が無いので、列 {name} の札を取らずに進む（手元で ec2.py guard）")
        return None
    who = os.environ.get("EC2_QUEUE_WHO") or f"pid {os.getpid()}"
    prog = sys.argv[0] if sys.argv and sys.argv[0] not in ("", "-", "-c") else "python3 の標準入力"
    purpose = purpose or os.environ.get("EC2_QUEUE_PURPOSE") or f"{os.path.basename(prog)} の up({name})"
    end = time.time() + (QUEUE_WAIT_S if wait is None else wait)
    tk, said = None, None
    while True:
        args = ["take", name, "--pid", os.getpid(), "--who", who, "--purpose", purpose] + (["--ticket", tk] if tk else [])
        _, r = _q(*args)
        s = r.get("state")
        if s == "held":
            tk = r["ticket"]
            _HELD[name] = tk
            if not _TAKEN:
                atexit.register(_release_all)
            _TAKEN.add(tk)
            # 子のプロセスが同じ束を触っても、この札で通るように
            os.environ["EC2_QUEUE_TICKET"] = (os.environ.get("EC2_QUEUE_TICKET", "") + f" {name}:{tk}").strip()
            return tk
        if s == "waiting":
            tk = r["ticket"]
            h = r.get("holder") or {}
            msg = (f"列 {name} は {h.get('who')}（{h.get('purpose')}）が持っている。{r.get('pos')}番目に待つ" if h
                   else f"列 {name} の頭の待ち人を待つ（{r.get('pos')}番目）")
            if msg != said:
                _say(msg)
                said = msg
        elif s == "gone":
            tk = None
        elif s == "stopping":
            raise RuntimeError(f"EC2 を止めている最中（{r.get('by')}）。止まりきってから起こし直して流し直す")
        else:
            _say(f"ec2-queue が答えないので、列 {name} の札を取らずに進む（{r.get('why')}）")
            return None
        if time.time() > end:
            if tk:
                _q("release", tk)
            raise RuntimeError(f"列 {name} が空かない: {said}")
        time.sleep(QUEUE_POLL_S)


def _port(name):
    return PORTS.get(name, 9300 + sum(map(ord, name)) % 500)


def _udd(name):
    # doneru は先に作られていた名前（~/doneru-chrome）をそのまま使う
    return f"{HOME}/doneru-chrome" if name == "doneru" else f"{HOME}/cdp-{name}"


def _alive(port):
    try:
        urllib.request.urlopen(f"http://localhost:{port}/json/version", timeout=3)
        return True
    except Exception:
        return False


def up(name, url="about:blank", reseed=False):
    """Chrome を起動する。もう動いていれば何もしない。戻り値はポート。先に列 name の札を持つ（hold）"""
    hold(name)
    port, udd = _port(name), _udd(name)
    if _alive(port):
        return port
    if not subprocess.run(["pgrep", "-f", "Xvfb :20|Xorg :20"], capture_output=True).stdout:
        subprocess.run(["sudo", "-u", "ubuntu", "sh", "-c", "nohup Xvfb :20 -screen 0 1280x900x24 >/tmp/xvfb.log 2>&1 &"])
        time.sleep(2)
    if reseed or not os.path.isdir(f"{udd}/Default"):
        subprocess.run(["rm", "-rf", udd])
        os.makedirs(udd, exist_ok=True)
        skip = [f"--exclude=/Default/{p}" for p in SEED_SKIP]
        subprocess.run(["rsync", "-a", *skip, f"{SRC_UDD}/Default", f"{SRC_UDD}/Local State", udd + "/"], check=True)
        subprocess.run(["chown", "-R", "ubuntu:ubuntu", udd])
        print(f"seed: {SRC_UDD}/Default -> {udd}")
    subprocess.run(["sh", "-c", f"rm -f {udd}/Singleton*"])
    # --disable-extensions: 写した Preferences に拡張が載っていると、ファイルを消しても起動のたびに
    #   ウェブストアから入れ直す（cdp-fish で、消して 764M → 起動2回で 1.3G に戻った。2026-10-22）。
    #   CDP で触るのに拡張は要らない
    # --disable-component-update: Chrome が自分で落とす部品（component_crx_cache ほか）を増やさない
    # --disable-background-networking は足さない。同期やログインの更新まで止めるおそれがあり、
    #   Google のログインは一度まとめて切れている（#768）
    cmd = (f"export DISPLAY=:20; setsid nohup google-chrome --user-data-dir={udd} "
           f"--remote-debugging-port={port} --remote-allow-origins=http://localhost:{port} "
           f"--disable-extensions --disable-component-update "
           f"--no-first-run --no-default-browser-check --window-size=1280,900 '{url}' "
           f">/tmp/chrome-{name}.log 2>&1 < /dev/null & disown")
    subprocess.run(["sudo", "-u", "ubuntu", "-i", "--", "bash", "-c", cmd])
    for _ in range(40):
        if _alive(port):
            time.sleep(2)
            return port
        time.sleep(1)
    raise RuntimeError(f"debug port {port} never opened: " + open(f"/tmp/chrome-{name}.log").read()[-400:])


def down(name):
    port = _port(name)
    if not _alive(port):
        return
    import websocket
    v = json.load(urllib.request.urlopen(f"http://localhost:{port}/json/version"))
    try:
        ws = websocket.create_connection(v["webSocketDebuggerUrl"], timeout=10, suppress_origin=True)
        ws.send(json.dumps({"id": 1, "method": "Browser.close"}))
        time.sleep(5)
    except Exception:
        pass
    subprocess.run(["pkill", "-u", "ubuntu", "-f", f"user-data-dir={_udd(name)}"])


class Tab:
    def __init__(self, port, target, timeout=60, strict=True):
        """strict=False だと、CDP がエラーを返しても例外にせず空の結果を返す
        （Doneru のログイン手順は、閉じかけの窓に投げて黙って進む作りになっている）"""
        import websocket
        self.port, self.target, self.strict = port, target, strict
        # Origin を付けると Chrome 111+ は 403 で弾く
        self.ws = websocket.create_connection(target["webSocketDebuggerUrl"], timeout=timeout, suppress_origin=True)
        self.n = 0
        self.events = []
        self.call("Page.enable")
        self.call("DOM.enable")
        self.call("Runtime.enable")

    def call(self, method, **params):
        self.n += 1
        self.ws.send(json.dumps({"id": self.n, "method": method, "params": params}))
        while True:
            m = json.loads(self.ws.recv())
            if m.get("id") == self.n:
                if "error" in m and self.strict:
                    raise RuntimeError(f"{method}: {m['error']}")
                return m.get("result", {})
            if "method" in m:
                self.events.append(m)

    def js(self, expr, await_promise=False):
        r = self.call("Runtime.evaluate", expression=expr, returnByValue=True, awaitPromise=await_promise)
        if "exceptionDetails" in r:
            raise RuntimeError("js: " + json.dumps(r["exceptionDetails"])[:600])
        return r.get("result", {}).get("value")

    def go(self, url, wait=4):
        self.call("Page.navigate", url=url)
        self.wait_ready()
        time.sleep(wait)

    def wait_ready(self, timeout=30):
        end = time.time() + timeout
        while time.time() < end:
            try:
                if self.js("document.readyState") == "complete":
                    return True
            except Exception:
                pass
            time.sleep(0.5)
        return False

    def url(self):
        return self.js("location.href")

    def click_at(self, x, y):
        for typ in ("mouseMoved", "mousePressed", "mouseReleased"):
            self.call("Input.dispatchMouseEvent", type=typ, x=x, y=y, button="left", clickCount=1)

    def center(self, selector_js):
        """selector_js は要素を返す JS 式。画面の中に送ってから中心の座標を返す"""
        return self.js(f"""(() => {{ const e = {selector_js}; if (!e) return null;
            e.scrollIntoView({{block: 'center'}}); const r = e.getBoundingClientRect();
            return [r.x + r.width / 2, r.y + r.height / 2]; }})()""")

    def click(self, selector_js):
        c = self.center(selector_js)
        if not c:
            raise RuntimeError(f"not found: {selector_js[:120]}")
        time.sleep(0.3)
        self.click_at(*c)
        return c

    def type(self, text):
        self.call("Input.insertText", text=text)

    def key(self, key, code=None, vk=None):
        for typ in ("keyDown", "keyUp"):
            self.call("Input.dispatchKeyEvent", type=typ, key=key, code=code or key, windowsVirtualKeyCode=vk or 0)

    def set_files(self, css, paths):
        """<input type=file> にファイルを渡す（ダイアログを開かない）"""
        doc = self.call("DOM.getDocument", depth=-1, pierce=True)
        nid = self.call("DOM.querySelector", nodeId=doc["root"]["nodeId"], selector=css)["nodeId"]
        if not nid:
            raise RuntimeError(f"file input not found: {css}")
        self.call("DOM.setFileInputFiles", nodeId=nid, files=paths)

    def shot(self, path, full=False, quality=55, clip=None):
        p = {"format": "jpeg", "quality": quality}
        if full:
            m = self.call("Page.getLayoutMetrics")["cssContentSize"]
            p["clip"] = {"x": 0, "y": 0, "width": m["width"], "height": min(m["height"], 6000), "scale": 1}
            p["captureBeyondViewport"] = True
        if clip:
            p["clip"] = dict(clip, scale=1)
        data = base64.b64decode(self.call("Page.captureScreenshot", **p)["data"])
        os.makedirs(os.path.dirname(path), exist_ok=True)
        open(path, "wb").write(data)
        return len(data)

    def texts(self, limit=80):
        """押せそうなもの（ボタン・リンク）の字と行き先を並べる。画面の見当をつける用"""
        return self.js(f"""[...document.querySelectorAll('a,button,[role=button],input[type=submit]')]
          .filter(e => {{ const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; }})
          .map(e => (e.innerText || e.value || e.getAttribute('aria-label') || '').trim().replace(/\\s+/g, ' ').slice(0, 40)
               + (e.getAttribute('href') ? ' -> ' + e.getAttribute('href').slice(0, 80) : ''))
          .filter(s => s).slice(0, {limit})""")


def pages(name):
    """束のタブの一覧。ほかのタブを全部閉じる道具（各スキルの fresh_tab）はこれで閉じる相手を拾うので、ここでも札を持つ"""
    hold(name)
    return [t for t in json.load(urllib.request.urlopen(f"http://localhost:{_port(name)}/json/list")) if t["type"] == "page"]


def tab(name="suzuri", index=0, new=False):
    hold(name)
    port = _port(name)
    if new:
        t = json.loads(urllib.request.urlopen(urllib.request.Request(f"http://localhost:{port}/json/new?about:blank", method="PUT")).read())
        return Tab(port, t)
    pages = [t for t in json.load(urllib.request.urlopen(f"http://localhost:{port}/json/list")) if t["type"] == "page"]
    return Tab(port, pages[index])


def where(url):
    """クエリには鍵が乗ることがあるので、ホストとパスだけ出す"""
    m = re.match(r"https?://([^/?#]+)([^?#]*)", url or "")
    return (m.group(1) + m.group(2)) if m else url


def fetch_image(url, out, name="web", min_px=600, wait=8):
    """ページを開き、いちばん大きい絵を**ページの中から**取ってファイルに書く。戻り値は (形式, バイト数, 幅, 高さ)。

    ChatGPT の共有リンク（https://chatgpt.com/s/m_…）で使った。絵の URL には期限付きの署名が
    付いていて（数分で切れる）、curl で後から取りに行けない。ページの中の fetch なら、
    そのときの署名とログインのまま取れる。ログインの要らないページなら、どのサイトでも同じ形で使える。

        python3 /home/ubuntu/cdp/cdp.py fetch-image <ページのURL> <書き出し先>
    """
    up(name, "about:blank")
    t = tab(name, new=True)
    try:
        t.go(url, wait=wait)
        r = t.js(f"""(async () => {{
          const im = [...document.images].filter(i => i.naturalWidth >= {min_px})
                       .sort((a, b) => b.naturalWidth * b.naturalHeight - a.naturalWidth * a.naturalHeight)[0];
          if (!im) return null;
          const b = await (await fetch(im.src)).blob();
          const data = await new Promise(res => {{ const fr = new FileReader(); fr.onload = () => res(fr.result.split(',')[1]); fr.readAsDataURL(b); }});
          return [b.type, data, im.naturalWidth, im.naturalHeight];
        }})()""", await_promise=True)
        if not r:
            raise RuntimeError(f"{min_px}px 以上の絵が無い: {where(url)}")
        data = base64.b64decode(r[1])
        os.makedirs(os.path.dirname(os.path.abspath(out)), exist_ok=True)
        open(out, "wb").write(data)
        return r[0], len(data), r[2], r[3]
    finally:
        try:
            t.call("Page.close")
        except Exception:
            pass


if __name__ == "__main__":
    import sys
    if len(sys.argv) >= 4 and sys.argv[1] == "fetch-image":
        print(fetch_image(sys.argv[2], sys.argv[3]))
    else:
        print("usage: cdp.py fetch-image <url> <out>")
