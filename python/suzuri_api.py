#!/usr/bin/env python3
"""SUZURI の公式 API（`https://suzuri.jp/api/v1`）を呼ぶ。GitHub Actions の `SUZURI API` から回す。

    python3 python/suzuri_api.py materials                     # 自分のデザインの一覧
    python3 python/suzuri_api.py characters [--dry-run]        # 島に居てグッズになっていない人を作る
    python3 python/suzuri_api.py create  --title … --texture <URL|ファイル|island:🦄> [--dry-run] [--delete-after]
    python3 python/suzuri_api.py update  <デザインid> [--title …] [--description …] [--price 300]
    python3 python/suzuri_api.py delete  <デザインid> [--dry-run]
    python3 python/suzuri_api.py preview <商品id> --scale 0.8 [--offset-x 0] [--offset-y 0]
    python3 python/suzuri_api.py probe   0 --item can-badge --scale 0.8   # 大きさを保存できるか試す（0 = 試し用を作って消す）

鍵は環境変数 `SUZURI_API_KEY`（あやとの API キー。SUZURI の開発者画面の「API Key」）。

## API でできること・できないこと（2026-10-09 にドキュメントを読んだ）

| | できる |
| --- | --- |
| デザインを作る（絵は URL かデータ URI）・題・本文・利益・品目・消す | ○ |
| 品目ごとの「領域に合わせる」（`resizeMode`: contain / cover） | ○ |
| **品目ごとの大きさ・位置（scale / offsetX / offsetY）を保存** | **ドキュメントには無いが、できる**（下） |

**`PUT /materials/{id}` の `products[]` に `scale` / `offsetX` / `offsetY` を載せると保存される**
（2026-10-09 に `probe` で確かめた。試し用のデザインで 0.8 を送り、見本の絵の URL が
`png.0.8+0.0+0.0` に変わった）。なので5品目とも作れる: 作る（POST）→ すぐ大きさを入れる（PUT）→
読み直して確かめる。大きさの決め方は EC2 のスキルと同じ `suzuri_common.layout()`。

## ログは誰でも読める

このリポジトリは公開で、Actions のログも公開。**出すのはデザインの id・題・品目・状態コードだけ。**
売上・ユーザ情報（メール）を返す口（`/user`・`/user/sold`・`/user/analytics/*`・`/activities`）は
呼べないようにしてある。鍵はログに出さない（GitHub が伏せるが、こちらでも出さない）。
"""
import argparse
import base64
import io
import json
import os
import sys
import time
import urllib.error
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from suzuri_common import DESCRIPTION, ITEM_IDS, SAMPLE_VARIANT, TITLE, layout, prep, transparent  # noqa: E402

BASE = "https://suzuri.jp/api/v1"
USER_ID = 2272949            # ayato_arigato（編集画面の data-current-user の id）
SERIES = "カサ・アヤトの住人"
ISLAND = "https://live-streaming-d3cac.web.app/island-api/characters"
# 作る品目。缶バッジとパネルの大きさは、作った直後に PUT で入れる（POST で効くかは確かめていない）
SAFE_ITEMS = ["sticker", "acrylic-keychain", "can-badge", "mug", "acrylic-panel"]
# 公開のログに中身を出してはいけない口
PRIVATE = ("/user/sold", "/user/analytics", "/activities", "/user?", "/user/")


def _key():
    k = os.environ.get("SUZURI_API_KEY", "").strip()
    if not k:
        sys.exit("SUZURI_API_KEY が無い。リポジトリの Secret に入れる（あやとの操作）")
    return k


def call(method, path, body=None, query=None, tries=3):
    if path == "/user" or path.startswith(PRIVATE):
        sys.exit(f"{path} は売上・ユーザ情報を返す口なので、公開のログから呼ばない")
    url = BASE + path + ("?" + "&".join(f"{k}={v}" for k, v in query.items()) if query else "")
    data = json.dumps(body).encode() if body is not None else None
    for i in range(tries):
        req = urllib.request.Request(url, data=data, method=method, headers={
            "Authorization": f"Bearer {_key()}", "Content-Type": "application/json", "Accept": "application/json",
            "User-Agent": "ayato-island/1.0 (+https://live-streaming-d3cac.web.app)"})
        try:
            with urllib.request.urlopen(req, timeout=120) as r:
                raw = r.read()
                left = r.headers.get("X-Ratelimit-Remaining")
                if left is not None and int(left) < 3:
                    # 残りが少なければ、戻るまで待つ（作る口にはレートリミットがある）
                    reset = r.headers.get("X-Ratelimit-Reset")
                    print(f"  ratelimit: 残り {left}（reset {reset}）。30秒待つ", flush=True)
                    time.sleep(30)
                return r.status, (json.loads(raw) if raw else {})
        except urllib.error.HTTPError as e:
            msg = e.read()[:500].decode("utf-8", "replace")
            if e.code in (429, 502, 503) and i < tries - 1:
                time.sleep(10 * (i + 1))
                continue
            return e.code, {"error": msg}
    return 0, {"error": "no response"}


def materials():
    """自分のデザインを全部（50件ずつ）"""
    out, off = [], 0
    while True:
        st, r = call("GET", "/materials", query={"userId": USER_ID, "limit": 50, "offset": off})
        if st != 200:
            sys.exit(f"GET /materials {st}: {r}")
        out += r.get("materials", [])
        if not r.get("meta", {}).get("hasNext"):
            return out
        off += 50


def texture_of(src):
    """URL ならそのまま、ファイルなら余白を落として正方形にし、データ URI にする"""
    if src.startswith("http"):
        return src
    buf = io.BytesIO()
    from PIL import Image
    Image.open(src).save(buf, "PNG", optimize=True)
    return "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode()


def products_for(items, src=None, placement=False):
    """API の products。placement=True のときだけ scale / offset も載せる（probe で試すため）"""
    lay = {x["item"]: x for x in layout(src)} if (placement and src) else {}
    out = []
    for it in items:
        p = {"itemId": ITEM_IDS[it], "exemplaryItemVariantId": SAMPLE_VARIANT[it], "published": True}
        if it in lay:
            for k in ("scale", "offsetX", "offsetY"):
                if k in lay[it]:
                    p[k] = lay[it][k]
        out.append(p)
    return out


def local_src(texture, work="/tmp/suzuri"):
    """絵を手元のファイルにして、透過を確かめ、余白を落とした正方形にする。
    **大きさ（scale）は上げた絵の画素数に掛かる**ので、上げる絵と大きさを決める絵は同じファイルにする"""
    os.makedirs(work, exist_ok=True)
    if texture.startswith("island:"):
        # 「island:🦄」で、島のキャラの背景なしの絵を指す
        want = norm(texture.split(":", 1)[1])
        chars = json.load(urllib.request.urlopen(urllib.request.Request(ISLAND, headers={"User-Agent": "ayato-island/1.0"}), timeout=60))["characters"]
        hit = [c for c in chars if norm(c["emoji"]) == want]
        if len(hit) != 1:
            sys.exit(f"島に {texture} のキャラが {len(hit)} 人")
        texture = hit[0]["plain"]["full"]
    raw = texture
    if texture.startswith("http"):
        raw = f"{work}/dl-{abs(hash(texture))}.png"
        open(raw, "wb").write(urllib.request.urlopen(urllib.request.Request(texture, headers={"User-Agent": "ayato-island/1.0"}), timeout=120).read())
    if not transparent(raw):
        sys.exit(f"背景が抜けていない絵は上げない: {texture[:80]}")
    dst = f"{work}/prep-{os.path.basename(raw)}"
    prep(raw, dst)
    return dst


def create(title, description, texture, items, price=300, dry=False, src=None):
    """作る → 大きさを入れる → 読み直して確かめる"""
    src = src or local_src(texture)
    texture = src
    body = {"title": title, "description": description, "price": price, "texture": texture_of(texture),
            "products": products_for(items)}
    if dry:
        print(f"  dry-run: POST /materials {title!r} items={items} texture={'data-uri' if body['texture'].startswith('data:') else body['texture'][:60]}")
        return None
    st, r = call("POST", "/materials", body)
    if st != 200:
        sys.exit(f"POST /materials {st}: {r}")
    m = r["material"]
    print(f"  created {m['id']} {m['title']!r} products={[p['item']['name'] for p in r.get('products', [])]}")
    try:
        set_layout(m["id"], items, src)
    except BaseException:
        # 大きさが入らないまま売り場に残すと、缶バッジとパネルが切れたまま売られる。消して止まる
        st, _ = call("DELETE", f"/materials/{m['id']}")
        print(f"  大きさが入らなかったので消した {m['id']} -> {st}")
        raise
    return m["id"]


def set_layout(material_id, items, src):
    """缶バッジ・パネルなど、大きさを決める品目に scale / offset を入れ、読み直して確かめる。
    **品目は全部載せて送る**（1品目だけだと残りがどうなるかドキュメントに書いていない）"""
    prods = products_for(items, src, placement=True)
    st, r = call("PUT", f"/materials/{material_id}", {"products": prods})
    if st != 200:
        sys.exit(f"PUT /materials/{material_id} {st}: {r}")
    for p in prods:
        if "scale" not in p:
            continue
        it = next(k for k, v in ITEM_IDS.items() if v == p["itemId"])
        got, _ = placement_of(material_id, it)
        ok = bool(got) and abs(got[0] - p["scale"]) < 0.0015
        print(f"    {it}: scale {p['scale']} offset {p.get('offsetX')},{p.get('offsetY')} -> 見本 {got} {'ok' if ok else '**入っていない**'}")
        print(f"      {sample_url(material_id, it)}")
        if not ok:
            sys.exit(f"{material_id} の {it} に大きさが入らなかった")


def sample_url(material_id, item):
    st, r = call("GET", "/products", query={"materialId": material_id, "itemId": ITEM_IDS[item], "limit": 1})
    return (r.get("products") or [{}])[0].get("sampleImageUrl") if st == 200 else None


def placement_of(material_id, item):
    """いまの大きさと位置。商品一覧の見本の絵の URL に `…{幅}x{高さ}[.png].{scale}+{x}+{y}.webp` の形で埋まっている
    （API の応答に scale の欄は無い）。既定の大きさなら None"""
    import re
    st, r = call("GET", "/products", query={"materialId": material_id, "itemId": ITEM_IDS[item], "limit": 5})
    if st != 200 or not r.get("products"):
        return None, None
    url = r["products"][0].get("sampleImageUrl") or ""
    # 画面から上げた絵は「…-1024x1024.png.0.73+0.0+0.0.webp」、API で上げた絵は
    # 「…-1060x1060.0.953+0.0+0.0.webp」（.png が付かない）。どちらも読む
    m = re.search(r"-\d+x\d+(?:\.(?:png|jpe?g))?\.(-?[0-9.]+)([+-][0-9.]+)?([+-][0-9.]+)?\.(?:webp|png|jpg)", url)
    return (tuple(float(x) for x in m.groups() if x) if m else None), r["products"][0].get("id")


def probe(material_id, item, scale, ox=0.0, oy=0.0, items=None):
    """ドキュメントに書いていない scale / offset を PUT に載せ、保存されたかを読み直して確かめる。
    **保存されたら、元の値に戻して終わる**（試しで売り場を変えたままにしない）。
    保存できると分かれば、缶バッジとパネルもワークフローで作れる（`SAFE_ITEMS`）"""
    # 5品目ぶんのいまの値を読んで、目当ての品目だけ変えて全部を送る。
    # products に1品目だけ入れると、残りが外れる（非公開になる）かもしれない（ドキュメントに書いていない）
    from suzuri_common import ORDER
    ORDER = items or ORDER
    got = {it: placement_of(material_id, it) for it in ORDER}
    now = {it: v[0] for it, v in got.items()}
    alive = {it for it, v in got.items() if v[1]}
    before = now[item]
    print(f"前: {now} / 売り場にある品目 {sorted(alive)}")

    def put(sc, x, y):
        prods = []
        for it in ORDER:
            p = {"itemId": ITEM_IDS[it], "exemplaryItemVariantId": SAMPLE_VARIANT[it], "published": True}
            cur = (sc, x, y) if it == item else now[it]
            if cur:
                p.update(scale=cur[0], offsetX=(cur[1] if len(cur) > 1 else 0.0), offsetY=(cur[2] if len(cur) > 2 else 0.0))
            prods.append(p)
        st, r = call("PUT", f"/materials/{material_id}", {"products": prods})
        print(f"  PUT {item} scale={sc} offsetX={x} offsetY={y} -> {st} {r.get('error', '')}")
        return st
    put(scale, ox, oy)
    got2 = {it: placement_of(material_id, it) for it in ORDER}
    after_all = {it: v[0] for it, v in got2.items()}
    after = after_all[item]
    alive2 = {it for it, v in got2.items() if v[1]}
    print(f"後: {after_all} / 売り場にある品目 {sorted(alive2)}")
    if alive - alive2:
        print("**売り場から消えた品目がある**:", sorted(alive - alive2))
    lost = [it for it in ORDER if now[it] is not None and after_all[it] is None and it != item]
    if lost:
        print("**ほかの品目の大きさが既定に戻った**:", lost)
    saved = bool(after) and abs(after[0] - scale) < 0.0005
    print("結果:", "保存できた（scale が API で効く）" if saved else "保存されなかった（API では大きさを変えられない）")
    if saved and before:
        put(*(list(before) + [0.0, 0.0])[:3])
        back, _ = placement_of(material_id, item)
        print(f"戻した: {back}")
    summary = os.environ.get("GITHUB_STEP_SUMMARY")
    if summary:
        with open(summary, "a") as f:
            f.write(f"### probe {material_id} {item}\n\n- 前 {before} / 送った {scale},{ox},{oy} / 後 {after}\n- **{'保存できた' if saved else '保存されなかった'}**\n")


def norm(e):
    return "".join(ch for ch in (e or "") if ch not in "️‍♂♀ ")


def characters(dry=False, items=SAFE_ITEMS, work="/tmp/suzuri"):
    """島に居て、題に絵文字の付いた住人グッズがまだ無い人を作る。

    突き合わせは**絵文字**で（題「カサ・アヤトの住人 ○」）。絵が描き直された人・島から居なくなった人の
    扱いは人の判断が入る場面があるので、ここでは作るだけ（`.claude/skills/suzuri/characters.md`）。
    **背景なしの絵に透過が無い人は作らない**（あやと 2026-10-09。🃏 がそうだった）。"""
    os.makedirs(work, exist_ok=True)
    have = {norm(m["title"].replace(SERIES, "").strip().split()[0])
            for m in materials() if m.get("title", "").startswith(SERIES) and m["title"].replace(SERIES, "").strip()}
    chars = json.load(urllib.request.urlopen(urllib.request.Request(ISLAND, headers={"User-Agent": "ayato-island/1.0"}), timeout=60))["characters"]
    todo = [c for c in chars if norm(c["emoji"]) not in have]
    todo.sort(key=lambda c: c.get("createdAt") or "")
    print(f"島 {len(chars)} 人 / SUZURI の住人 {len(have)} / まだグッズになっていない {len(todo)}")
    made, skipped = [], []
    for c in todo:
        raw = f"{work}/{len(made) + len(skipped)}.raw.png"
        src = f"{work}/{len(made) + len(skipped)}.png"
        open(raw, "wb").write(urllib.request.urlopen(c["plain"]["full"], timeout=120).read())
        if not transparent(raw):
            print(f"  skip {c['emoji']}: 背景なしの絵に透過が無い（島の絵を直してから）")
            skipped.append(c["emoji"])
            continue
        prep(raw, src)
        mid = create(TITLE.format(emoji=c["emoji"]), DESCRIPTION.format(emoji=c["emoji"]), src, items, 300, dry, src=src)
        made.append((c["emoji"], mid))
        time.sleep(2)
    print(f"作った {len(made)} / 透過が無くて作らなかった {len(skipped)} {''.join(skipped)}")
    summary = os.environ.get("GITHUB_STEP_SUMMARY")
    if summary:
        with open(summary, "a") as f:
            f.write(f"### SUZURI 住人グッズ\n\n- 島 {len(chars)} 人 / まだグッズになっていない {len(todo)}\n")
            for e, mid in made:
                f.write(f"- {e} → {'(dry-run)' if mid is None else f'https://suzuri.jp/ayato_arigato/{mid}/sticker/m/white'}\n")
            if skipped:
                f.write(f"- 透過が無くて作らなかった: {''.join(skipped)}\n")
    return made, skipped


def main():
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd", required=True)
    sub.add_parser("materials")
    c = sub.add_parser("characters"); c.add_argument("--dry-run", action="store_true"); c.add_argument("--items", default=",".join(SAFE_ITEMS))
    c = sub.add_parser("create")
    c.add_argument("--title", required=True); c.add_argument("--description", default=""); c.add_argument("--price", type=int, default=300)
    c.add_argument("--texture", required=True); c.add_argument("--items", default=",".join(SAFE_ITEMS)); c.add_argument("--dry-run", action="store_true")
    c.add_argument("--delete-after", action="store_true", help="作って確かめたら消す（試し用）")
    c = sub.add_parser("update"); c.add_argument("id", type=int)
    # 品目は直させない。大きさ無しで品目を送ると、缶バッジ・パネルの大きさが既定に戻りうる
    c.add_argument("--title"); c.add_argument("--description"); c.add_argument("--price", type=int)
    c = sub.add_parser("delete"); c.add_argument("id", type=int); c.add_argument("--dry-run", action="store_true")
    c = sub.add_parser("preview"); c.add_argument("id", type=int)
    c.add_argument("--scale", required=True); c.add_argument("--offset-x", default="0"); c.add_argument("--offset-y", default="0")
    c = sub.add_parser("probe"); c.add_argument("id", type=int); c.add_argument("--item", default="can-badge")
    c.add_argument("--scale", type=float, required=True); c.add_argument("--offset-x", type=float, default=0.0); c.add_argument("--offset-y", type=float, default=0.0)
    a = ap.parse_args()

    if a.cmd == "materials":
        ms = materials()
        print(f"{len(ms)} 件")
        for m in ms:
            print(m["id"], "公開" if m.get("published") else "非公開", m.get("price"), m.get("title"))
    elif a.cmd == "characters":
        characters(a.dry_run, [x for x in a.items.split(",") if x])
    elif a.cmd == "create":
        mid = create(a.title, a.description, a.texture, [x for x in a.items.split(",") if x], a.price, a.dry_run)
        if mid and a.delete_after:
            st, _ = call("DELETE", f"/materials/{mid}")
            print("消した", mid, st)
    elif a.cmd == "update":
        body = {k: v for k, v in {"title": a.title, "description": a.description, "price": a.price}.items() if v is not None}
        st, r = call("PUT", f"/materials/{a.id}", body)
        print("PUT", a.id, st, (r.get("error") if st != 200 else r.get("material", {}).get("title")))
        sys.exit(0 if st == 200 else 1)
    elif a.cmd == "delete":
        if a.dry_run:
            print("dry-run: DELETE", a.id); return
        st, r = call("DELETE", f"/materials/{a.id}")
        print("DELETE", a.id, st, r.get("error", ""))
        sys.exit(0 if st in (200, 204) else 1)
    elif a.cmd == "preview":
        st, r = call("GET", f"/products/{a.id}/placement_preview",
                     query={"scale": a.scale, "offsetX": a.offset_x, "offsetY": a.offset_y})
        print(st, r.get("previewUrl") or r)
    elif a.cmd == "probe":
        if a.id == 0:
            # 試し用のデザインを作って試し、すぐ消す。本物で試すと、API が大きさを無視したうえで
            # ほかの品目の大きさまで既定に戻すかもしれない（ドキュメントからは分からない）
            chars = json.load(urllib.request.urlopen(urllib.request.Request(ISLAND, headers={"User-Agent": "ayato-island/1.0"}), timeout=60))["characters"]
            tex = next(c for c in chars if c["emoji"] == "✝️")["plain"]["full"]
            st, r = call("POST", "/materials", {"title": "（試し・すぐ消します）", "description": "", "price": 300, "texture": tex,
                                               "products": products_for(["sticker", a.item])})
            if st != 200:
                sys.exit(f"試し用のデザインを作れなかった {st}: {r}")
            mid = r["material"]["id"]
            print("試し用のデザイン", mid)
            try:
                probe(mid, a.item, a.scale, a.offset_x, a.offset_y, items=["sticker", a.item])
            finally:
                st, _ = call("DELETE", f"/materials/{mid}")
                print("試し用のデザインを消した", mid, st)
        else:
            probe(a.id, a.item, a.scale, a.offset_x, a.offset_y)

if __name__ == "__main__":
    main()
