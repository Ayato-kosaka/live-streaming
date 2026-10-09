#!/usr/bin/env python3
"""EC2 の上で動く。ログイン済みの Chrome（cdp.py の "suzuri"）で SUZURI を触る。

手元から `ec2.py put` で `/home/ubuntu/cdp/suzuri_ops.py` に置き、
`ec2.py run` で送る短い python から使う:

    import sys; sys.path.insert(0, "/home/ubuntu/cdp")
    from suzuri_ops import *
    t = open_tab()
    m, ps = read(t, 18855523)                 # デザインと品目を、編集画面に埋まっている JSON から読む
    upload(t, "/home/ubuntu/suzuri/prep/x.png", 18855523)   # 絵の差し替え（None なら新しいデザイン）
    set_items(t, 18855523, ITEMS)             # 売る品目を決める（無いものは非公開に）
    set_text(t, 18855523, title, description) # 題・本文・利益

## なぜ画面の JSON と、画面と同じ呼び出しを使うか

編集画面（/account/materials/{id}）は Backbone で書かれていて、デザインと品目は
`.editor-step01` の `data-material` / `data-products` に JSON で埋まっている。
画面の字や画像を読むより、これを読むほうが確実（品目ごとの大きさ `scale` まで取れる）。

書くほうも、画面の「保存する」が送るのと**同じ要求**をそのページの中から送る:

- 題・本文・利益: `PUT /account/materials/{id}`（`{material: {...}}`）
- 品目: `POST /account/materials/{id}/products/bulk_upsert`（`{attrs: [...]}`）
- 削除: `DELETE /account/materials/{id}`

絵のアップロードだけは、画面のファイル欄（`input#material-texture`）にファイルを渡して、
SUZURI 自身のアップロード処理（presign → lens へ送る → デザインを保存）に任せる。
手で真似ると、署名やサイズの書き戻しを1つ落としただけで壊れたデザインができる。
"""
import json, sys, time
sys.path.insert(0, "/home/ubuntu/cdp")
from cdp import Tab, down, up, tab, where  # noqa: E402
from suzuri_common import *  # noqa: E402,F401,F403  大きさ・下ごしらえ・透過・題と本文

BASE = "https://suzuri.jp"

def fresh_tab():
    """新しいタブを開いて、それ以外を閉じる。**1デザインごとに呼ぶ。**
    編集画面は 146品目ぶんの見本の絵を読み込むので、同じタブで8件ほど続けると
    CDP が返らなくなった（2026-10-09 に2回）。タブを替えると描画のプロセスも替わる"""
    import urllib.request
    port = up("suzuri", BASE + "/account/materials")
    old = [p for p in json.load(urllib.request.urlopen(f"http://localhost:{port}/json/list")) if p["type"] == "page"]
    t = tab("suzuri", new=True)
    for p in old:
        try:
            urllib.request.urlopen(f"http://localhost:{port}/json/close/{p['id']}", timeout=10)
        except Exception:
            pass
    t.go(BASE + "/account/materials", wait=1)
    return t


def retrying(fn, *args, **kw):
    """CDP が返らなくなったら Chrome ごと起こし直して、1回だけやり直す。
    fn の1つ目の引数はタブ（やり直すときは新しいタブを渡す）"""
    try:
        return fn(fresh_tab(), *args, **kw)
    except Exception as e:
        if "timed out" not in repr(e).lower():
            raise
        print(f"retry after {e!r}: restarting chrome", flush=True)
        down("suzuri")
        return fn(fresh_tab(), *args, **kw)


def open_tab():
    """suzuri.jp を開いているタブを1枚だけ残して返す。
    ほかのサイトのタブで fetch('/account/...') を投げると、そのサイトに飛んで空が返る"""
    import urllib.request
    port = up("suzuri", BASE + "/account/materials")
    pages = [p for p in json.load(urllib.request.urlopen(f"http://localhost:{port}/json/list")) if p["type"] == "page"]
    keep = next((p for p in pages if "suzuri.jp" in p["url"]), pages[0])
    for p in pages:
        if p["id"] != keep["id"]:
            urllib.request.urlopen(f"http://localhost:{port}/json/close/{p['id']}")
    try:
        t = Tab(port, keep, timeout=15)
        t.ws.settimeout(60)
        if "suzuri.jp" not in (t.url() or ""):
            t.go(BASE + "/account/materials")
        return t
    except Exception as e:
        # タブが固まっている（WebSocket が返らない）。Chrome ごと起こし直す
        print(f"open_tab: tab unresponsive ({e!r}); restarting chrome", flush=True)
        down("suzuri")
        port = up("suzuri", BASE + "/account/materials")
        t = tab("suzuri")
        t.go(BASE + "/account/materials")
        return t


def _ajax(t, method, url, body=None):
    """ページの中から送る。CSRF の札はページの meta から取って付ける（jquery_ujs と同じ）"""
    js = f"""(async () => {{
      const tok = document.querySelector('meta[name=csrf-token]')?.content;
      const r = await fetch({json.dumps(url)}, {{method: {json.dumps(method)}, credentials: 'include',
        headers: Object.assign({{'X-CSRF-Token': tok, 'X-Requested-With': 'XMLHttpRequest', 'Accept': 'application/json'}},
                               {json.dumps(body is not None)} ? {{'Content-Type': 'application/json'}} : {{}}),
        body: {json.dumps(json.dumps(body)) if body is not None else 'undefined'}}});
      const text = await r.text();
      return [r.status, text.slice(0, 4000)];
    }})()"""
    st, text = t.js(js, await_promise=True)
    try:
        return st, json.loads(text)
    except Exception:
        return st, text


def read(t, mid):
    """編集画面に埋まっている JSON を読む。戻り値は (material, products)。
    **DOMParser に通さない。** 編集画面の HTML は 3.8MB あり、1件ごとに組み立てると
    タブが固まった（20件目あたりで WebSocket が返らなくなった）。属性2つだけを
    正規表現で抜き、実体参照（&quot; など）を戻す。
    **サーバーが返す生の HTML は属性を一重引用符で囲む**（`data-material='{&quot;id…'`）。
    DOM の outerHTML は二重引用符で見せるので、それに合わせて書くと1件も当たらない"""
    r = t.js(f"""fetch('/account/materials/{mid}').then(r => r.status == 200 ? r.text() : '').then(h => {{
      const un = s => s.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
      const m = h.match(/data-material=(["'])([^"']*)\\1/), p = h.match(/data-products=(["'])([^"']*)\\1/);
      return m && p ? [un(m[2]), un(p[2])] : null; }})""", await_promise=True)
    if not r:
        return None, None
    return json.loads(r[0]), json.loads(r[1])


def list_ids(t):
    ids = []
    for page in range(1, 10):
        r = t.js(f"""fetch('/account/materials?page={page}').then(r => r.text()).then(h => {{
          const d = new DOMParser().parseFromString(h, 'text/html');
          return [...new Set([...d.querySelectorAll('a[href^="/account/materials/"]')].map(a => a.getAttribute('href').split('/')[3]).filter(x => /^\\d+$/.test(x)))]; }})""", await_promise=True)
        new = [int(x) for x in r if int(x) not in ids]
        if not new:
            break
        ids += new
    return ids


def upload(t, path, mid=None, timeout=120):
    """絵を上げる。mid があればそのデザインの絵を差し替え、無ければ新しいデザインを作る。
    戻り値はデザインの id。"""
    import os
    # 無いパスを渡しても Chrome は黙って空のファイルを渡し、画面は「PNGまたはJPEG」と言うだけ。
    # 何が悪いか分からなくなるので、先にこちらで止める
    if not os.path.isfile(path):
        raise FileNotFoundError(path)
    before = read(t, mid)[0]["uploadedAt"] if mid else None
    t.go(f"{BASE}/account/materials/{mid}" if mid else f"{BASE}/account/materials/new", wait=4)
    # ページの中のファイル欄に渡す。blueimp の add が走り、SUZURI 自身の処理で上がる
    t.set_files("input#material-texture", [path])
    end = time.time() + timeout
    while time.time() < end:
        time.sleep(3)
        u = t.url()
        cur = int(u.rstrip("/").split("/")[-1]) if u.rstrip("/").split("/")[-1].isdigit() else None
        if cur:
            m = read(t, cur)[0]
            if m and m.get("filePath") and (mid is None or m["uploadedAt"] != before):
                # 画面の側の保存（2回目の save）が終わるのを少し待つ
                busy = t.js("!!document.querySelector('.progress canvas, .progress svg')")
                if not busy:
                    # 編集画面（3.8MB・146品目の見本）を開いたままにしない。タブが重くなる
                    t.go(f"{BASE}/account/materials", wait=1)
                    return cur
        err = t.js("(document.querySelector('#material-dropzone .error') || {}).innerText || ''")
        if err and err.strip():
            raise RuntimeError("upload error: " + err.strip())
    raise RuntimeError(f"upload timed out (url={where(t.url())})")


def set_items(t, mid, items, secret=False):
    """items: [{"item": "sticker", "scale": None, "offsetX": None, "offsetY": None, "variant": None}, ...]
    ここに無い品目で、いま売っているものは非公開にする（画面で✓を外すのと同じ）。"""
    _, ps = read(t, mid)
    want = {ITEM_IDS[i["item"]]: i for i in items}
    attrs = []
    for p in ps:
        iid = p["item"]["id"]
        if iid not in want and p["published"]:
            attrs.append({"published": False, "itemId": iid, "exemplaryItemVariantId": None, "exemplaryAngle": p.get("exemplaryAngle"),
                          "scale": p.get("scale"), "offsetX": p.get("offsetX"), "offsetY": p.get("offsetY"),
                          "quantityLimit": p.get("quantityLimit"), "secret": secret})
    for iid, i in want.items():
        attrs.append({"published": True, "itemId": iid, "exemplaryItemVariantId": i.get("variant") or SAMPLE_VARIANT[i["item"]], "exemplaryAngle": i.get("angle"),
                      "scale": i.get("scale"), "offsetX": i.get("offsetX"), "offsetY": i.get("offsetY"),
                      "quantityLimit": None, "secret": secret})
    return _ajax(t, "POST", f"/account/materials/{mid}/products/bulk_upsert", {"attrs": attrs})


def set_text(t, mid, title, description, price=300):
    return _ajax(t, "PUT", f"/account/materials/{mid}",
                 {"material": {"title": title, "description": description, "price": price, "published": True}})


def delete(t, mid):
    return _ajax(t, "DELETE", f"/account/materials/{mid}")


def product_images(t, mid):
    """売り場の見本の絵（lens が描いた 500x500）を品目ごとに返す。確かめる用。
    `sampleImageUrl` は向こうが署名（h=）まで付けて返してくれるので、そのまま開ける"""
    _, ps = read(t, mid)
    return {p["item"]["name"]: p.get("sampleImageUrl") for p in ps if p["published"]}


def sheet(t, mids, out, cell=180):
    """売り場の見本（品目ごとの絵）を1行1デザインで並べた1枚を焼く。目で確かめる用。
    **API が 200 を返しても、絵が切れていないかは分からない**（🦄 の缶バッジが切れていた）。"""
    import io, urllib.request
    from PIL import Image, ImageDraw
    rows = []
    for mid in mids:
        m, ps = read(t, mid)
        if not m:
            rows.append((mid, "(missing)", {}))
            continue
        imgs = {p["item"]["name"]: p.get("sampleImageUrl") for p in ps if p["published"]}
        rows.append((mid, m["title"], imgs))
    W = cell * (len(ORDER) + 1)
    sh = Image.new("RGB", (W, cell * len(rows)), "white")
    d = ImageDraw.Draw(sh)
    for r, (mid, title, imgs) in enumerate(rows):
        d.text((4, r * cell + 4), str(mid), fill="red")
        d.text((4, r * cell + 20), ",".join(k[:6] for k in imgs if k not in ORDER), fill="red")
        for c, k in enumerate(ORDER):
            u = imgs.get(k)
            if not u:
                d.text(((c + 1) * cell + 40, r * cell + 80), "NONE", fill="red")
                continue
            # lens は描きたての絵で 502 を返すことがある。少し待って取り直す
            for k2 in range(4):
                try:
                    im = Image.open(io.BytesIO(urllib.request.urlopen(u, timeout=60).read())).convert("RGB")
                    sh.paste(im.resize((cell, cell)), ((c + 1) * cell, r * cell))
                    break
                except Exception:
                    time.sleep(3 * (k2 + 1))
            else:
                d.text(((c + 1) * cell + 40, r * cell + 80), "FETCH FAIL", fill="red")
    sh.save(out, quality=70)
    return [(mid, title, sorted(imgs)) for mid, title, imgs in rows]


def create(t, src, title, description, price=300, known=None):
    """新しいデザインを作って、5品目と題・本文・利益まで入れる。戻り値はデザインの id。

    **やり直しで2つ作らない。** 絵を上げた直後に CDP が固まると、SUZURI には空のデザインが
    できているのに、こちらには id が返らない。上げる前の一覧（known）と比べて、増えた1件を拾う。
    一括で回すときは known を持ち回すと、毎回一覧を引かずに済む"""
    known = set(known) if known is not None else set(list_ids(t))
    mid = None
    try:
        mid = upload(t, src, None)
    finally:
        new = [i for i in list_ids(t) if i not in known]
        if len(new) == 1:
            mid = new[0]
        elif len(new) > 1:
            raise RuntimeError(f"知らないデザインが {len(new)} 件増えた: {new}（手で見る）")
    if not mid:
        raise RuntimeError("絵を上げたがデザインができていない")
    finish(t, mid, src, title, description, price)
    return mid


def swap(t, mid, src):
    """いまのデザインの絵を差し替えて、大きさを決め直す（題・本文・URL・売れた履歴はそのまま）"""
    upload(t, src, mid)
    st, r = set_items(t, mid, layout(src))
    if st != 200:
        raise RuntimeError(f"bulk_upsert {st}: {r}")


def finish(t, mid, src, title=None, description=None, price=300):
    """5品目と大きさ、（渡されれば）題・本文・利益を入れて、入ったことを読み直して確かめる"""
    st, r = set_items(t, mid, layout(src))
    if st != 200:
        raise RuntimeError(f"bulk_upsert {st}: {r}")
    if title is not None:
        st, r = set_text(t, mid, title, description, price)
        if st != 200:
            raise RuntimeError(f"material PUT {st}: {r}")
    m, ps = read(t, mid)
    pub = sorted(p["item"]["name"] for p in ps if p["published"])
    if pub != sorted(ORDER):
        raise RuntimeError(f"品目が揃っていない: {pub}")
    if title is not None and (m["title"] != title or m["price"] != price or not m["published"]):
        raise RuntimeError(f"題・利益・公開が入っていない: {m['title']!r} {m['price']} {m['published']}")


