#!/usr/bin/env python3
"""SUZURI の公式 API（`https://suzuri.jp/api/v1`）を呼ぶ。GitHub Actions の `SUZURI API` から回す。

    python3 python/suzuri_api.py materials                     # 自分のデザインの一覧
    python3 python/suzuri_api.py characters [--dry-run]        # 島に居てグッズになっていない人を作る
    python3 python/suzuri_api.py create  --title … --texture <URL|ファイル|island:🦄> [--dry-run] [--delete-after]
    python3 python/suzuri_api.py update  <デザインid> [--title …] [--description …] [--price 300]
    python3 python/suzuri_api.py delete  <デザインid> [--dry-run]
    python3 python/suzuri_api.py preview <商品id> --scale 0.8 [--offset-x 0] [--offset-y 0]
    python3 python/suzuri_api.py probe   0 --item can-badge --scale 0.8   # 大きさを保存できるか試す（0 = 試し用を作って消す）
    python3 python/suzuri_api.py sheet   <デザインid…> | --latest 5         # 5品目の見本を1枚に並べる（目で見る用）

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


def items(q=""):
    """品目の一覧（id・名前・刷れる面・見本にできる型）。新しい品目でグッズを作るとき、id と型を引く。
    出すのは品目の素性だけ（売上・ユーザ情報は返さない口）"""
    st, r = call("GET", "/items")
    if st != 200:
        sys.exit(f"GET /items {st}: {r}")
    q = q.lower()
    n = 0
    for it in r.get("items", []):
        name = f"{it.get('name', '')} {it.get('humanizeName', '')}"
        if q and q not in name.lower():
            continue
        n += 1
        vs = it.get("variants") or []
        ex = [v for v in vs if v.get("exemplary")] or vs[:1]
        ex = ex[0] if ex else {}
        print(f"{it['id']}\t{it.get('name')}\t{it.get('humanizeName')}\t面={','.join(it.get('availablePrintPlaces', []))}"
              f"\t型{ex.get('id')}({(ex.get('color') or {}).get('name')}/{(ex.get('size') or {}).get('name')})\t税込{it.get('minPriceWithTax')}〜")
        if q:
            # 絞ったときだけ、色ごとの型を1つずつ出す。見本の色（exemplary）を代表以外にしたいとき引く
            seen = {}
            for v in vs:
                seen.setdefault((v.get("color") or {}).get("name"), f"{v.get('id')}({(v.get('size') or {}).get('name')})")
            print("    色:", " ".join(f"{c}={x}" for c, x in seen.items()))
    print(f"{n} 品目")


# 刷る絵は、ワークフローを走らせた版から取る。枝で押せば、master に入れる前に `--trial` で見本を見られる
RAW = f"https://raw.githubusercontent.com/Ayato-kosaka/live-streaming/{os.environ.get('GITHUB_SHA') or 'master'}/"


def goods(spec_path, dry=False, pub=False, trial=False, only=None):
    """ほしいグッズの付箋（#goods-suzuri）から、1件ずつ品目を決めて作る。

    spec は `tools/goods/goods.json`。1件 = 1デザイン × 1品目。絵は `tools/goods/compose.sh` が
    刷る面と同じ大きさに組んだもの（リポジトリの `tools/goods/art/out/`）を、公開の URL で渡す。
    Tシャツは表を `texture`、裏を `sub_materials`（printSide=back）で渡す。

    **既定は非公開で作る**（`published: false`）。見本を目で見てから `publish` で出す。
    同じ題がすでにあれば作らない（押し直しても二重にならない）"""
    spec = json.load(open(spec_path))
    have = {(m.get("title") or "") for m in materials()}
    os.makedirs("/tmp/suzuri-sheet", exist_ok=True)
    made = []
    for g in spec:
        if only and g["key"] not in only:
            continue
        if g["title"] in have and not trial:
            print(f"  skip {g['title']!r}: 同じ題がもうある")
            continue
        prod = {"itemId": g["itemId"], "exemplaryItemVariantId": g["variant"], "published": pub, "resizeMode": "contain"}
        if g.get("back"):
            prod["sub_materials"] = [{"texture": RAW + g["back"], "printSide": "back", "enabled": True}]
        body = {"title": g["title"], "description": g["description"], "price": g.get("price", 300),
                "texture": RAW + g["front"], "products": [prod]}
        if dry:
            print(f"  dry-run: POST /materials {g['title']!r} item={g['itemId']} front={g['front']} back={g.get('back')} 公開={pub}")
            continue
        st, r = call("POST", "/materials", body)
        if st != 200:
            print(f"  **作れなかった** {g['title']!r} {st}: {r}")
            continue
        m = r["material"]
        pr = (r.get("products") or [{}])[0]
        made.append((g["key"], m["id"], pr))
        print(f"  created {m['id']} {m['title']!r} 公開={pr.get('published')} {pr.get('sampleUrl')}")
        print(f"    sample {pr.get('sampleImageUrl')}\n    tpl {pr.get('imageUrl')}")
        time.sleep(2)
    if made:
        time.sleep(20)  # 裏の絵（sub_materials）の見本は、少し遅れて焼かれるかもしれない
    for key, mid, pr in made:
        print("    prints:", json.dumps(pr.get("prints"), ensure_ascii=False)[:1500])
        print("    angleImageUrls:", json.dumps(pr.get("angleImageUrls"), ensure_ascii=False)[:800])
        print("    material:", json.dumps({k: v for k, v in (pr.get("material") or {}).items() if k not in ("user", "description")}, ensure_ascii=False)[:600])
        print(f"    応答の品目: キー={sorted(pr.keys())} 面={pr.get('item', {}).get('availablePrintPlaces')}")
        # 見本の絵（表・裏）。公開されている URL なので、ログインなしで取れる
        urls = {"sample": pr.get("sampleImageUrl")}
        sv = pr.get("sampleItemVariant") or {}
        size, color = (sv.get("size") or {}).get("name", "s"), (sv.get("color") or {}).get("name", "white")
        # 表と裏は別のファイル（裏の絵は sub_materials として別に登録される）なので、angleImageUrls を使う
        for ang in ("front", "back"):
            t = (pr.get("angleImageUrls") or {}).get(ang)
            if t:
                urls[ang] = (t.replace("{width}", "1530").replace("{height}", "1530")
                             .replace("{size}", size).replace("{color}", color))
        for name, u in urls.items():
            raw = _fetch(u) if u else None
            if raw:
                open(f"/tmp/suzuri-sheet/{key}-{name}.jpg", "wb").write(raw)
                print(f"    見本 {key}-{name}.jpg {len(raw)}B")
            else:
                print(f"    見本が取れなかった {key}-{name}")
    if trial:
        # 試作: 見本を取ったら、デザインごと消す（非公開のまま。売り場には1度も出ない）
        # 裏の絵は別のデザインとして登録されるので、表を消しても残る（題なし・非公開で一覧に溜まった）
        for key, mid, pr in made:
            subs = [(p.get("material") or {}).get("id") for p in pr.get("prints") or [] if p.get("place") != "front"]
            for i in [mid] + [s for s in subs if s and s != mid]:
                st, _ = call("DELETE", f"/materials/{i}")
                print(f"  試作を消した {key} {i} -> {st}")
        return
    summary = os.environ.get("GITHUB_STEP_SUMMARY")
    if summary and made:
        with open(summary, "a") as f:
            f.write("### ほしいグッズ\n\n")
            for key, mid, pr in made:
                f.write(f"- {key} → {pr.get('sampleUrl')}（デザイン {mid}、公開={pr.get('published')}）\n")


def sample(ids):
    """デザインごとに見本の絵を、大きく・表裏とも取って /tmp/suzuri-sheet/ に置く（成果物になる）。
    URL の `{width}x{height}` と `[/angle]` を埋める。取れた大きさと URL を出す（公開の URL なので出してよい）"""
    os.makedirs("/tmp/suzuri-sheet", exist_ok=True)
    for mid in ids:
        st, r = call("GET", "/products", query={"materialId": mid, "limit": 5})
        for p in (r.get("products") or []) if st == 200 else []:
            tpl = p.get("imageUrl") or ""
            sv = p.get("sampleItemVariant") or {}
            size, color = (sv.get("size") or {}).get("name", "s"), (sv.get("color") or {}).get("name", "white")
            print(f"{mid} {p['item']['name']} 公開={p.get('published')} {p.get('sampleUrl')}\n  sample {p.get('sampleImageUrl')}\n  tpl {tpl}")
            for ang in ["", "/front", "/back"]:
                u = (tpl.replace("{width}", "1530").replace("{height}", "1530").replace("{size}", size)
                     .replace("{color}", color).replace("[/angle]", ang))
                raw = _fetch(u, tries=1)
                name = f"{mid}-{p['item']['name']}{ang.replace('/', '-')}.img"
                if raw:
                    open(f"/tmp/suzuri-sheet/{name}", "wb").write(raw)
                print(f"  {'ok' if raw else '取れない'} {name} {len(raw) if raw else ''}")


def publish(material_id):
    """非公開で作ったグッズを公開する。品目は商品の一覧から引き直す（大きさは触らない）"""
    st, r = call("GET", "/products", query={"materialId": material_id, "limit": 50})
    if st != 200 or not r.get("products"):
        sys.exit(f"GET /products {st}: {r}")
    prods = [{"itemId": p["item"]["id"], "exemplaryItemVariantId": p["sampleItemVariant"]["id"], "published": True,
              "resizeMode": "contain"} for p in r["products"]]
    st, r = call("PUT", f"/materials/{material_id}", {"products": prods})
    print("PUT", material_id, st, r.get("error", ""))
    if st != 200:
        sys.exit(1)
    for p in r.get("products", []):
        print(f"  公開={p.get('published')} {p.get('sampleUrl')}")


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


SHEET = os.environ.get("SUZURI_SHEET", "/tmp/suzuri-sheet/sheet.jpg")


def _fetch(url, tries=4):
    """見本の絵。描きたての絵は lens が 502 を返すことがある（EC2 の sheet() でも踏んだ）ので取り直す"""
    for i in range(tries):
        try:
            return urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "ayato-island/1.0"}), timeout=60).read()
        except Exception as e:
            if i == tries - 1:
                print(f"    見本の絵が取れなかった: {e}")
                return None
            time.sleep(8 * (i + 1))


def sheet(ids, out=SHEET, cell=220):
    """デザインごとに1行、5品目の見本の絵を左から並べた1枚を作る。**合否は機械で決めない。目で見る**
    （缶バッジ・パネルが切れていないか／ほかの住人と大きさがそろっているか／上下に寄っていないか）。

    見本の絵はログイン無しで取れる公開の URL なので、EC2 の Chrome を使わずに Actions の中で作れる。
    できた絵は Actions の成果物（artifact）に置く（ワークフローの最後の step）"""
    from PIL import Image, ImageDraw
    from suzuri_common import ORDER
    label = 70
    im = Image.new("RGB", (label + cell * len(ORDER), 24 + cell * len(ids)), "white")
    d = ImageDraw.Draw(im)
    for j, it in enumerate(ORDER):
        d.text((label + j * cell + 6, 6), it, fill="black")
    rows = []
    for i, mid in enumerate(ids):
        y = 24 + i * cell
        d.text((6, y + cell // 2 - 6), f"{i + 1}\n{mid}", fill="black")
        got = []
        for j, it in enumerate(ORDER):
            url = sample_url(mid, it)
            raw = _fetch(url) if url else None
            if not raw:
                d.rectangle([label + j * cell + 4, y + 4, label + (j + 1) * cell - 4, y + cell - 4], outline="red", width=3)
                got.append(f"{it}: 無い")
                continue
            t = Image.open(io.BytesIO(raw)).convert("RGB")
            t.thumbnail((cell - 8, cell - 8))
            im.paste(t, (label + j * cell + (cell - t.width) // 2, y + (cell - t.height) // 2))
        rows.append((i + 1, mid, got))
    os.makedirs(os.path.dirname(out), exist_ok=True)
    im.save(out, quality=85)
    print(f"sheet: {len(ids)} 件 -> {out}")
    for n, mid, got in rows:
        print(f"  {n}. {mid}" + (f"  **{' / '.join(got)}**" if got else ""))
    summary = os.environ.get("GITHUB_STEP_SUMMARY")
    if summary:
        with open(summary, "a") as f:
            f.write(f"### 見本の一覧（{len(ids)} 件）\n\n成果物 `suzuri-sheet` に1枚。1行1デザイン、左から {' / '.join(ORDER)}\n\n")
            for n, mid, got in rows:
                f.write(f"{n}. https://suzuri.jp/ayato_arigato/{mid}/sticker/m/white" + (f" — **{' / '.join(got)}**" if got else "") + "\n")
    return out


def norm(e):
    return "".join(ch for ch in (e or "") if ch not in "️‍♂♀ ")


def characters(dry=False, items=SAFE_ITEMS, work="/tmp/suzuri"):
    """島に居て、題に絵文字の付いた住人グッズがまだ無い人を作る。

    突き合わせは**絵文字**で（題「カサ・アヤトの住人 ○」）。絵が描き直された人・島から居なくなった人の
    扱いは人の判断が入る場面があるので、ここでは作るだけ（`.claude/skills/suzuri/characters.md`）。
    **背景なしの絵に透過が無い人は作らない**（あやと 2026-10-09。🃏 がそうだった）。"""
    os.makedirs(work, exist_ok=True)
    # 題の無い下書き（title が null）が混ざっている。m.get("title", "") では None が返る
    titles = [(m.get("title") or "") for m in materials()]
    have = {norm(t.replace(SERIES, "").strip().split()[0]) for t in titles
            if t.startswith(SERIES) and t.replace(SERIES, "").strip()}
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
    if any(mid for _, mid in made):
        # 作ったものは、その場で見本を並べておく（目で見るのは /island-daily の 1-5）
        sheet([mid for _, mid in made if mid])
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
    c = sub.add_parser("goods"); c.add_argument("spec"); c.add_argument("--dry-run", action="store_true"); c.add_argument("--publish", action="store_true"); c.add_argument("--trial", action="store_true"); c.add_argument("--only", default="")
    c = sub.add_parser("sample"); c.add_argument("ids", type=int, nargs="+")
    c = sub.add_parser("publish"); c.add_argument("id", type=int)
    c = sub.add_parser("items"); c.add_argument("--q", default="", help="品目名（英字・日本語）に含まれる字。空なら全部")
    c = sub.add_parser("characters"); c.add_argument("--dry-run", action="store_true"); c.add_argument("--items", default=",".join(SAFE_ITEMS))
    c = sub.add_parser("create")
    c.add_argument("--title", required=True); c.add_argument("--description", default=""); c.add_argument("--price", type=int, default=300)
    c.add_argument("--texture", required=True); c.add_argument("--items", default=",".join(SAFE_ITEMS)); c.add_argument("--dry-run", action="store_true")
    c.add_argument("--delete-after", action="store_true", help="作って確かめたら消す（試し用）")
    c = sub.add_parser("update"); c.add_argument("id", type=int)
    # 品目は直させない。大きさ無しで品目を送ると、缶バッジ・パネルの大きさが既定に戻りうる
    c.add_argument("--title"); c.add_argument("--description"); c.add_argument("--price", type=int)
    c = sub.add_parser("delete"); c.add_argument("id", type=int, nargs="+"); c.add_argument("--dry-run", action="store_true")
    c = sub.add_parser("preview"); c.add_argument("id", type=int)
    c.add_argument("--scale", required=True); c.add_argument("--offset-x", default="0"); c.add_argument("--offset-y", default="0")
    c = sub.add_parser("probe"); c.add_argument("id", type=int); c.add_argument("--item", default="can-badge")
    c.add_argument("--scale", type=float, required=True); c.add_argument("--offset-x", type=float, default=0.0); c.add_argument("--offset-y", type=float, default=0.0)
    c = sub.add_parser("sheet"); c.add_argument("ids", type=int, nargs="*"); c.add_argument("--latest", type=int, default=0)
    a = ap.parse_args()

    if a.cmd == "materials":
        ms = materials()
        print(f"{len(ms)} 件")
        for m in ms:
            print(m["id"], "公開" if m.get("published") else "非公開", m.get("price"), m.get("title") or "（題なし）")
    elif a.cmd == "items":
        items(a.q)
    elif a.cmd == "goods":
        goods(a.spec, a.dry_run, a.publish, a.trial, a.only.split(",") if a.only else None)
    elif a.cmd == "sample":
        sample(a.ids)
    elif a.cmd == "publish":
        publish(a.id)
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
        bad = 0
        for i in a.id:
            if a.dry_run:
                print("dry-run: DELETE", i)
                continue
            st, r = call("DELETE", f"/materials/{i}")
            print("DELETE", i, st, r.get("error", ""))
            bad += st not in (200, 204)
        sys.exit(1 if bad else 0)
    elif a.cmd == "preview":
        st, r = call("GET", f"/products/{a.id}/placement_preview",
                     query={"scale": a.scale, "offsetX": a.offset_x, "offsetY": a.offset_y})
        print(st, r.get("previewUrl") or r)
    elif a.cmd == "sheet":
        ids = list(a.ids)
        if a.latest:
            # id は作った順に増える。新しいものから
            ids += sorted((m["id"] for m in materials() if m.get("published")), reverse=True)[:a.latest]
        if not ids:
            sys.exit("デザインの id か --latest N を渡す")
        sheet(ids)
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
