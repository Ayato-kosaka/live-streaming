#!/usr/bin/env python3
"""EC2 の上で動く。YouTube Studio を、ログイン済みの Chrome（~/cdp-ytstudio）から触る道具。

`ec2-chrome` の cdp.py の上に乗る。手元から `ec2.py put` で `/home/ubuntu/cdp/yt_studio.py` に置き、

    import sys; sys.path.insert(0, "/home/ubuntu/cdp")
    from yt_studio import *
    t = studio()                                   # Studio のタブを1枚だけ残して返す
    reqs = capture(t, url_of("videos/live"))       # 画面が裏で送る youtubei の要求と返事を全部拾う
    r = api(t, "creator/list_creator_videos", body) # 同じ要求をページの中から送る

## なぜ画面の字ではなく youtubei を読むか

Studio は画面の字を何段もの custom element の中に描く。字は言語設定で変わるし、
一覧は送らないと読み込まれない。**画面が裏で送っている `youtubei/v1/...` の要求は
JSON で、全部の列が揃っている。** 画面を開いて要求を拾い（capture）、
同じ形の要求をページの中から送り直す（api）ほうが確実。
"""
import json, sys, time, urllib.request
sys.path.insert(0, "/home/ubuntu/cdp")
from cdp import Tab, up, pages, where, _port

NAME = "ytstudio"
CH = "UCCwutAH6ieHNvdyJAfSld7w"
BASE = "https://studio.youtube.com"


def url_of(path=""):
    """`videos/live` → チャンネルのライブ一覧。`video/<id>/copyright` などは BASE 直下"""
    if path.startswith("video/"):
        return f"{BASE}/{path}"
    return f"{BASE}/channel/{CH}/{path}".rstrip("/")


def studio(url=None):
    """Studio のタブを1枚だけにして返す。タブが複数あると tab() が手前の1枚を拾って
    よそに要求を投げる（ec2-chrome の躓き）。最初の up はプロファイルの複製で数分かかる"""
    port = up(NAME, url or url_of())
    ps = pages(NAME)
    keep = next((p for p in ps if "studio.youtube.com" in p["url"]), ps[0])
    for p in ps:
        if p["id"] != keep["id"]:
            urllib.request.urlopen(f"http://localhost:{port}/json/close/{p['id']}")
    # 閉じた直後の /json/list には閉じたタブが残るので、取り直さずに keep をそのまま使う
    t = Tab(port, keep)
    if url:
        t.go(url, wait=6)
    elif "studio.youtube.com" not in t.url():
        t.go(url_of(), wait=6)
    return t


def drain(t, secs=3):
    """WebSocket に溜まっているイベントを吸い取る"""
    t.ws.settimeout(secs)
    try:
        while True:
            t.events.append(json.loads(t.ws.recv()))
    except Exception:
        pass
    t.ws.settimeout(60)


def capture(t, url=None, match="youtubei/v1/", wait=10, act=None):
    """url を開く（または act(t) を実行する）あいだに出た要求のうち、match を含むものを
    [{url, post, status, resp}] で返す。resp は JSON なら dict"""
    t.call("Network.enable", maxPostDataSize=500000)
    t.events.clear()
    if url:
        t.go(url, wait=wait)
    if act:
        act(t)
        time.sleep(wait)
    drain(t)
    reqs, status = {}, {}
    for e in t.events:
        m, p = e.get("method"), e.get("params", {})
        if m == "Network.requestWillBeSent" and match in p["request"]["url"]:
            reqs[p["requestId"]] = {"url": p["request"]["url"].split("?")[0].split("youtubei/v1/")[-1],
                                    "post": p["request"].get("postData", "")}
        elif m == "Network.responseReceived":
            status[p["requestId"]] = p["response"]["status"]
    out = []
    for rid, r in reqs.items():
        try:
            body = t.call("Network.getResponseBody", requestId=rid).get("body", "")
        except Exception as ex:
            body = f"ERR {str(ex)[:80]}"
        try:
            body = json.loads(body)
        except Exception:
            pass
        try:
            r["post"] = json.loads(r["post"])
        except Exception:
            pass
        out.append(dict(r, status=status.get(rid), resp=body))
    t.call("Network.disable")
    return out


# ページの中で SAPISIDHASH を作って youtubei を叩く。
# Studio の要求は Authorization に「SAPISIDHASH <時刻>_<sha1(時刻 SAPISID origin)>」を載せている。
# SAPISID は HttpOnly ではないので document.cookie から読める
_API_JS = r"""
(async (endpoint, body) => {
  const c = Object.fromEntries(document.cookie.split('; ').map(s => [s.split('=')[0], s.slice(s.indexOf('=') + 1)]));
  const sid = c['SAPISID'] || c['__Secure-3PAPISID'];
  const ts = Math.floor(Date.now() / 1000), origin = location.origin;
  const buf = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(`${ts} ${sid} ${origin}`));
  const hash = [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
  const ctx = ytcfg.get('INNERTUBE_CONTEXT');
  const full = Object.assign({context: ctx}, body);
  if (body.context) full.context = Object.assign({}, ctx, body.context);
  const headers = {'Content-Type': 'application/json', 'Authorization': `SAPISIDHASH ${ts}_${hash}`,
                   'X-Origin': origin, 'X-Goog-AuthUser': String(ytcfg.get('SESSION_INDEX') || 0)};
  const pid = ytcfg.get('DELEGATED_SESSION_ID'); if (pid) headers['X-Goog-PageId'] = pid;
  const r = await fetch(`/youtubei/v1/${endpoint}?alt=json&key=${ytcfg.get('INNERTUBE_API_KEY')}`,
                        {method: 'POST', credentials: 'include', headers, body: JSON.stringify(full)});
  return [r.status, await r.text()];
})
"""


def api(t, endpoint, body):
    """youtubei/v1/<endpoint> に body を送る。context は ytcfg のもので補う。戻り値は dict（失敗は例外）"""
    st, text = t.js(f"({_API_JS})({json.dumps(endpoint)}, {json.dumps(body)})", await_promise=True)
    if st != 200:
        raise RuntimeError(f"{endpoint}: HTTP {st}: {text[:300]}")
    return json.loads(text)


def dump(obj, path):
    with open(path, "w") as f:
        json.dump(obj, f, ensure_ascii=False, indent=1)
    return path
