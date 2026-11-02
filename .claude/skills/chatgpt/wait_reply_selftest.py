"""**`chatgpt.wait_reply` が、絵だけの返事も終わりと分かり、描いている途中では終わりにしないことの見張り。**
本物の ChatGPT には触らない。手元の Chromium に偽の会話の画面を出して、本物の `chatgpt.py` をそのまま当てる。

    python3 .claude/skills/chatgpt/wait_reply_selftest.py
    python3 .claude/skills/chatgpt/wait_reply_selftest.py image_only      # 足を1本だけ
    python3 .claude/skills/chatgpt/wait_reply_selftest.py --cut no_drawing image_more   # 対照を1つだけ

終了コード 0=通った / 1=落ちた / **2=回せない（Chromium か websocket-client が無い・外す字が見つからない）**
（`docs/island-standards.md` §15）。要るのは Chromium（`/opt/pw-browsers` か `$CHROME`）と `websocket-client`。

## なぜ要るか（2026-11-03）

長い会話の続きで ChatGPT に絵を頼み、絵だけで字の無い返事が来ると、`wait_reply` が終わりを読めずに900秒の時間切れまで
待った（2回）。会話を開き直すと絵はできていた。描く担当2人は「いちばん後ろの絵が替わって落ち着いたら終わり」の回避を
自前で書いた。前の作りは返事を「送る前の往復の数より後ろ」で探していたが、長い会話は画面の外の往復を外す（同じ会話で
数えると 10・12・8 と動いた）。画面の名前も出し直しのたびに変わる（2026-11-02 に `data-message-author-role`・右上の
「More」が消えた）ので、本物で1回通っただけでは、次に変わった日に同じ形で待ち続ける。名前を剥がした画面・往復の数が
増えない画面でも通るかを、ここで見る。

## 偽の画面

`/c/<足>` を開くと、足ごとの筋書きの画面を出す。入力欄に字を入れて「Send」を押すと問いが出て、そこからの経過秒で
返事の形が決まる（送った時刻は sessionStorage。**読み直しても、サーバーに残った返事のように続きから出る**）。
絵は canvas から作った blob: で、読み直すと識別が変わる（本物と同じ）。描いている途中の絵は `filter: blur(…)`。

| 足 | 筋書き | 通る条件 |
| --- | --- | --- |
| `text` | 字の返事を3秒かけて書く（止めるボタンが出る） | 書き終わった字を返す |
| `image_only` | **名前の無い画面**（1往復の箱・役の属性・止めるボタンが無い）で、ぼかした下絵 → 7秒あけて次の下絵 → 本番の絵。字は無い | 本番の絵が出てから `""` を返す。`images()` は本番の1枚だけ |
| `image_more` | 前の問いと前の絵がある会話の続きで、絵だけの返事。送った問いが画面に出るまで 3.5 秒遅れ（その間は前の絵が「いちばん後ろの問いより後ろ」に居る）。途中で読み直す | 前の絵で終わりにしない。新しい絵の1枚だけ |
| `text_image` | 字が先に出て、そのあと絵を描く | 絵が描き終わってから字を返す |
| `image_loading` | **名前の無い画面**で、2026-11-03 に本物で見た形: 絵の img を出さずに `image-gen-loading-game-board`（canvas）と「Creating image 13%」→「Sketching it out 37%」を出し、描き終わると一度に絵に替わる。進みの字は返事の最後の箱に置く（`ask()` と同じく絵を待たない） | 進みの字で終わりにしない。絵が出てから `""` |
| `virtual` | 長い会話。送ると上の往復が外れて、数えた往復の数が送る前と同じ | 時間切れにならずに字を返す |
| `legacy` | `virtual` と同じ画面に、前の呼び方（送る前の往復の数）で待つ | 時間切れにならずに字を返す |

## 対照（§15）

`CUTS` が `chatgpt.py` の字を1か所だけ書き換えた写しで足を回し、**外した守りの足が落ちる**ことを確かめる。
外す字が本物に見つからなければ 2。

| 対照 | 外す守り | 落ちる足 |
| --- | --- | --- |
| `no_drawing` | 絵のぼかしを見る | `image_only`・`image_more`（下絵で終わりにする） |
| `no_before_keys` | 送る前からあった絵を外す | `image_more`（前の絵で終わりにする） |
| `no_image_path` | 絵だけの返事の道（前の作りと同じく字を待つ） | `image_only`・`image_more`（時間切れ） |
| `count_only` | 往復の数で返事を探さない（前の作り） | `virtual`・`legacy`（時間切れ） |
| `no_pending` | 読み込みの箱を見る | `image_loading`（進みの字を返す） |

回し役（`python/selftest_runner.py`）は `.claude/skills/chatgpt` を降りないので、**`chatgpt.py` の待ちかたを触ったら手で回す**
（4分ほど）。
"""

from __future__ import annotations

import http.server
import importlib.util
import json
import os
import shutil
import socket
import subprocess
import sys
import tempfile
import threading
import time
import urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent
CDP_DIR = HERE.parent / "ec2-chrome"

# ------------------------------------------------------------------ 偽の画面

PAGE = r"""<!doctype html><html><head><meta charset="utf-8"><title>fake</title>
<style>.sr-only{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0)} img{width:256px;height:256px}</style>
</head><body><nav>サイドバー</nav><main><div id="conv"></div>
<form id="f"><div class="ProseMirror" contenteditable="true" aria-label="Ask ChatGPT"></div>
<button type="button" id="send" aria-label="Send">↑</button></form></main>
<script>
const LEG = location.pathname.split('/').pop();
const NAMED = LEG !== 'image_only' && LEG !== 'image_loading';
const K = 'fake-' + LEG;
const st = JSON.parse(sessionStorage.getItem(K) || 'null') || {prompt: null, at: null};
const imgCache = {};
// 絵は canvas から blob: で作る（読み直すと URL が変わる）。色で中身を変える
const makeImg = color => new Promise(res => {
  const c = document.createElement('canvas'); c.width = c.height = 512;
  const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, 512, 512);
  g.fillStyle = color; g.beginPath(); g.arc(256, 256, 180, 0, 7); g.fill();
  c.toBlob(b => res(URL.createObjectURL(b)));
});
const blobFor = async name => imgCache[name] || (imgCache[name] = await makeImg(name.split(':')[0]));
// 前からある会話（足ごと）
const HISTORY = {
  text: [],
  image_only: [],
  image_more: [['user', '前の問い：赤い丸'], ['assistant', '', 'red:final']],
  text_image: [],
  image_loading: [],
  virtual: Array.from({length: 6}, (_, i) => [[ 'user', '前の問い' + i], ['assistant', '前の答え' + i]]).flat(),
};
// 送ってからの秒 → 返事の形 {text, img: 'color:stage', blur, busy}
const STORY = {
  text: s => s < 0.8 ? {busy: true, text: ''} : s < 3 ? {busy: true, text: '四十七'.slice(0, Math.ceil((s - 0.8) / 0.8))} : {text: '四十七'},
  image_only: s => s < 1 ? {} : s < 8 ? {img: 'blue:p1', blur: 14} : s < 12 ? {img: 'blue:p2', blur: 6} : {img: 'blue:final'},
  image_more: s => s < 1 ? {} : s < 8 ? {img: 'green:p1', blur: 14} : s < 12 ? {img: 'green:p2', blur: 6} : {img: 'green:final'},
  text_image: s => s < 2 ? {busy: true, text: 'はい、描きます。'} : s < 9 ? {text: 'はい、描きます。', img: 'blue:p1', blur: 10} : {text: 'はい、描きます。', img: 'blue:final'},
  image_loading: s => s < 1 ? {} : s < 3.5 ? {loading: 'Creating image 13%'} : s < 7 ? {loading: 'Sketching it out 37%'} : {img: 'blue:final'},
  virtual: s => s < 1 ? {busy: true} : {text: '四十七'},
};
// 問いが画面に出るまでの遅れ（その間は、前の問いの後ろに前の絵が居る）
const USER_DELAY = {image_more: 3.5};
const conv = document.getElementById('conv');
const turnBox = (role, inner, state) => {
  const box = document.createElement('div');
  if (NAMED) box.setAttribute('data-talvt-turn-state', state || 'complete');
  const h = document.createElement('h4'); h.className = 'sr-only';
  h.textContent = role === 'user' ? 'You said:' : 'ChatGPT said:';
  if (NAMED && role === 'assistant') h.setAttribute('data-conversation-role', 'assistant');
  const body = document.createElement('div'); body.innerHTML = inner;
  if (NAMED && role === 'user') body.setAttribute('data-user-message-bubble', '');
  box.append(h, body); return box;
};
const imgHtml = async (name, blur) => '<div data-testid="generated-image-gallery"><div' + (blur ? ' style="filter: blur(' + blur + 'px)"' : '') +
  '><img alt="Generated image 1" src="' + await blobFor(name) + '"></div></div>';
let last = '';
async function render() {
  const s = st.at ? (Date.now() - st.at) / 1000 : -1;
  const r = s >= 0 ? STORY[LEG](s) : null;
  const shown = !!st.prompt && s >= (USER_DELAY[LEG] || 0);
  const key = JSON.stringify([shown, r]);
  if (key === last) return; last = key;
  const parts = [];
  let hist = HISTORY[LEG];
  // 長い会話: 送ったら上の往復が画面から外れる（数えた往復が送る前と同じになる）
  if (LEG === 'virtual' && st.at) hist = hist.slice(2);
  for (const [role, text, img] of hist)
    parts.push(turnBox(role, (role === 'user' ? '<div dir="auto">' + text + '</div>' : '<p>' + text + '</p>') + (img ? await imgHtml(img, 0) : '')));
  if (shown) {
    parts.push(turnBox('user', '<div dir="auto">' + st.prompt + '</div>'));
    if (r && (r.text !== undefined || r.img || r.loading))
      parts.push(turnBox('assistant', (r.text ? '<p>' + r.text + '</p>' : '') + (r.img ? await imgHtml(r.img, r.blur) : '')
        + (r.loading ? '<div role="group" data-testid="image-gen-loading-game-board"><canvas width="376" height="332"></canvas></div><p>' + r.loading + '</p>' : ''),
        r.busy ? 'in_progress' : 'complete'));
  }
  conv.replaceChildren(...parts);
  const f = document.getElementById('f');
  f.querySelectorAll('[aria-label="Stop streaming"]').forEach(e => e.remove());
  if (NAMED && r && r.busy) { const b = document.createElement('button'); b.type = 'button'; b.setAttribute('aria-label', 'Stop streaming'); b.textContent = '■'; f.append(b); }
}
document.getElementById('send').onclick = () => {
  const e = document.querySelector('.ProseMirror');
  st.prompt = e.innerText.trim(); st.at = Date.now(); e.innerText = '';
  sessionStorage.setItem(K, JSON.stringify(st)); render();
};
render(); setInterval(render, 200);
</script></body></html>"""


class _H(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        body = PAGE.encode()
        self.send_response(200)
        self.send_header("content-type", "text/html; charset=utf-8")
        self.send_header("content-length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *a):
        pass


def _free_port():
    s = socket.socket()
    s.bind(("127.0.0.1", 0))
    p = s.getsockname()[1]
    s.close()
    return p


def _chrome():
    for c in [os.environ.get("CHROME", ""), "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
              *sorted(Path("/opt/pw-browsers").glob("chromium-*/chrome-linux*/chrome"), reverse=True)]:
        if c and Path(c).is_file():
            return str(c)
    return None


# ------------------------------------------------------------------ 足

LEGS = ["text", "image_only", "image_more", "text_image", "image_loading", "virtual", "legacy"]
POLL, SETTLE = 1, 2


def run_leg(cg, port, http_port, leg):
    """1本回して (通ったか, 何がどうだったか)"""
    import websocket
    b = websocket.create_connection(json.load(urllib.request.urlopen(f"http://127.0.0.1:{port}/json/version"))["webSocketDebuggerUrl"],
                                    timeout=15, suppress_origin=True)
    b.send(json.dumps({"id": 1, "method": "Target.createTarget", "params": {"url": "about:blank"}}))
    tid = None
    while tid is None:
        m = json.loads(b.recv())
        if m.get("id") == 1:
            tid = m["result"]["targetId"]
    p = next(x for x in json.load(urllib.request.urlopen(f"http://127.0.0.1:{port}/json/list")) if x["id"] == tid)
    t = cg.Tab(port, p, timeout=60)
    try:
        t.go(f"http://127.0.0.1:{http_port}/c/{'virtual' if leg == 'legacy' else leg}", wait=1)
        # legacy は前の呼び方（送る前の往復の数）
        before = len(cg.turns(t)) if leg == "legacy" else cg.mark(t)
        t0 = time.time()
        cg.send(t, "白い背景に丸をひとつ" if leg.startswith("image") or leg == "text_image" else "都道府県の数は")
        try:
            # 読み直しを試すのは image_more だけ（何も変わらない 4 秒で読み直す）
            text = cg.wait_reply(t, before, timeout=40, poll=POLL, settle=SETTLE,
                                 reload_every=4 if leg == "image_more" else 45,
                                 want_images=leg not in ("text", "virtual", "legacy", "image_loading"))
        except TimeoutError as e:
            return False, f"時間切れ（{round(time.time() - t0, 1)}秒）: {str(e)[:80]}"
        el = round(time.time() - t0, 1)
        imgs = cg.images(t, before=before if isinstance(before, dict) else None)
        shown = t.js("[...document.querySelectorAll('img[alt^=\"Generated image\"]')].map(i => i.closest('[style]') ? 'blur' : 'sharp')")
        want = {"text": ("四十七", 0, 3), "image_only": ("", 1, 12), "image_more": ("", 1, 12),
                "text_image": ("はい、描きます。", 1, 9), "image_loading": ("", 1, 7), "virtual": ("四十七", 0, 1),
                "legacy": ("四十七", 0, 1)}[leg]
        ok = text == want[0] and len(imgs) == want[1] and el >= want[2]
        return ok, f"{el}秒で {text!r}・絵 {len(imgs)}枚（画面の絵 {shown}）／ 待っていたもの {want[0]!r}・絵 {want[1]}枚・{want[2]}秒より後"
    finally:
        try:
            t.ws.close()
        except Exception:
            pass
        b.send(json.dumps({"id": 2, "method": "Target.closeTarget", "params": {"targetId": tid}}))
        b.close()


# ------------------------------------------------------------------ 対照（守りを1つずつ外す）

CUTS = {
    # 描いている途中（ぼかし）を見ない → 下絵で終わりにする
    "no_drawing": ("if (blurred(cs.filter) || blurred(cs.backdropFilter)) return 'blur';", "", ["image_only", "image_more"]),
    # 前からあった絵を外さない → 続きの会話で、前の絵で終わりにする
    "no_before_keys": ('if i["key"] not in before["keys"]]', ']', ["image_more"]),
    # 絵の返事の道を外す（前の作りと同じく、字が空なら待ち続ける） → 時間切れ
    "no_image_path": ("            if drawn and same >= settle:\n                return text or \"\"\n", "", ["image_only", "image_more"]),
    # 往復の数で返事を決める（前の作り） → 長い会話で待ち続ける
    "count_only": ('if idx is None or before.get("last_user", False) is False:', "if True:", ["virtual", "legacy"]),
    # 描いている途中の箱（読み込みの遊び・進みの字）を見ない → 進みの字を返事として返す
    "no_pending": ('bz = busy(t) or bool(r.get("pending"))', "bz = busy(t)", ["image_loading"]),
}


def load(src_text, tag):
    d = Path(tempfile.mkdtemp(prefix=f"cg-{tag}-"))
    shutil.copy(CDP_DIR / "cdp.py", d / "cdp.py")
    (d / "chatgpt.py").write_text(src_text, encoding="utf-8")
    sys.path.insert(0, str(d))
    for m in ("chatgpt", "cdp"):
        sys.modules.pop(m, None)
    spec = importlib.util.spec_from_file_location(f"chatgpt_{tag}", d / "chatgpt.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    sys.path.remove(str(d))
    shutil.rmtree(d, ignore_errors=True)
    return mod


def main(argv):
    try:
        import websocket  # noqa: F401
    except ImportError:
        print("websocket-client が無い（python3 -m pip install websocket-client）")
        return 2
    chrome = _chrome()
    if not chrome:
        print("Chromium が見つからない（$CHROME か /opt/pw-browsers）")
        return 2
    only = [a for a in argv if a in LEGS]
    cut_only = argv[argv.index("--cut") + 1] if "--cut" in argv else None
    src = (HERE / "chatgpt.py").read_text(encoding="utf-8")
    for name, (old, _new, _legs) in CUTS.items():
        if src.count(old) != 1:
            print(f"対照 {name}: 外す字が chatgpt.py に1か所だけ無い（{src.count(old)}か所）: {old[:60]!r}")
            return 2

    srv = http.server.ThreadingHTTPServer(("127.0.0.1", 0), _H)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    port = _free_port()
    udd = tempfile.mkdtemp(prefix="cg-udd-")
    proc = subprocess.Popen([chrome, "--headless=new", f"--remote-debugging-port={port}", f"--user-data-dir={udd}",
                             "--no-first-run", "--no-sandbox", "--remote-allow-origins=*", "about:blank"],
                            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        for _ in range(100):
            try:
                urllib.request.urlopen(f"http://127.0.0.1:{port}/json/version", timeout=1)
                break
            except Exception:
                time.sleep(0.2)
        bad = 0
        if cut_only:
            # 対照を1つだけ、足を選んで回す（落ちれば 0）
            old_, new_, legs = CUTS[cut_only]
            cut = load(src.replace(old_, new_), cut_only)
            for leg in only or legs:
                ok, why = run_leg(cut, port, srv.server_port, leg)
                print(f"  対照 {cut_only} / {leg}: {'落ちた（よい）' if not ok else '通ってしまった'} — {why}", flush=True)
                bad += ok
            return 1 if bad else 0
        cg = load(src, "real")
        for leg in only or LEGS:
            ok, why = run_leg(cg, port, srv.server_port, leg)
            print(f"{'○' if ok else '×'} {leg}: {why}", flush=True)
            bad += not ok
        if only:
            return 1 if bad else 0
        # 対照: 外した守りの足が落ちること（落ちなければ、その足は何も見ていない）
        for name, (old, new, legs) in CUTS.items():
            cut = load(src.replace(old, new), name)
            fell = []
            for leg in legs:
                ok, why = run_leg(cut, port, srv.server_port, leg)
                fell.append(not ok)
                print(f"  対照 {name} / {leg}: {'落ちた（よい）' if not ok else '通ってしまった'} — {why}", flush=True)
            if not all(fell):
                bad += 1
        return 1 if bad else 0
    finally:
        proc.terminate()
        try:
            proc.wait(10)
        except Exception:
            proc.kill()
        srv.shutdown()
        shutil.rmtree(udd, ignore_errors=True)


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
