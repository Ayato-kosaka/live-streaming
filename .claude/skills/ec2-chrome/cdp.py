#!/usr/bin/env python3
"""EC2 の上で動く。Chrome を CDP（デバッグポート）で操作する小さな道具。

手元からは `ec2.py put` でこのファイルを `/home/ubuntu/cdp/cdp.py` に置き、
`ec2.py run` で送る短い python から `sys.path.insert(0, "/home/ubuntu/cdp"); from cdp import *`
で使う。

    up("suzuri")            # ~/cdp-suzuri で Chrome を起動（無ければ既定のプロファイルから1回だけ複製）
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
"""
import base64, json, os, re, subprocess, time, urllib.request

HOME = "/home/ubuntu"
SRC_UDD = f"{HOME}/.config/google-chrome"
# サイト名 → ポート。並べて起動しても奪い合わないように、名前ごとに固定する
PORTS = {"doneru": 9222, "suzuri": 9223}


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
    """Chrome を起動する。もう動いていれば何もしない。戻り値はポート"""
    port, udd = _port(name), _udd(name)
    if _alive(port):
        return port
    if not subprocess.run(["pgrep", "-f", "Xvfb :20|Xorg :20"], capture_output=True).stdout:
        subprocess.run(["sudo", "-u", "ubuntu", "sh", "-c", "nohup Xvfb :20 -screen 0 1280x900x24 >/tmp/xvfb.log 2>&1 &"])
        time.sleep(2)
    if reseed or not os.path.isdir(f"{udd}/Default"):
        subprocess.run(["rm", "-rf", udd])
        os.makedirs(udd, exist_ok=True)
        subprocess.run(["cp", "-a", f"{SRC_UDD}/Default", f"{SRC_UDD}/Local State", udd + "/"], check=True)
        subprocess.run(["chown", "-R", "ubuntu:ubuntu", udd])
        print(f"seed: {SRC_UDD}/Default -> {udd}")
    subprocess.run(["sh", "-c", f"rm -f {udd}/Singleton*"])
    cmd = (f"export DISPLAY=:20; setsid nohup google-chrome --user-data-dir={udd} "
           f"--remote-debugging-port={port} --remote-allow-origins=http://localhost:{port} "
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
    return [t for t in json.load(urllib.request.urlopen(f"http://localhost:{_port(name)}/json/list")) if t["type"] == "page"]


def tab(name="suzuri", index=0, new=False):
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
