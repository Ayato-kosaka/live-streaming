#!/usr/bin/env python3
"""SUZURI の公式 API（`https://suzuri.jp/api/v1`）を呼ぶ。GitHub Actions の `SUZURI API` から回す。

    python3 python/suzuri_api.py materials                     # 自分のデザインの一覧
    python3 python/suzuri_api.py characters [--dry-run]        # 島に居てグッズになっていない人を作る
    python3 python/suzuri_api.py create  --title … --texture <URL|ファイル> [--items sticker,mug] [--dry-run]
    python3 python/suzuri_api.py update  <デザインid> [--title …] [--description …] [--price 300] [--items …]
    python3 python/suzuri_api.py delete  <デザインid> [--dry-run]
    python3 python/suzuri_api.py preview <商品id> --scale 0.8 [--offset-x 0] [--offset-y 0]
    python3 python/suzuri_api.py probe   <デザインid> --item can-badge --scale 0.8   # 大きさを保存できるか試す

鍵は環境変数 `SUZURI_API_KEY`（あやとの API キー。SUZURI の開発者画面の「API Key」）。

## API でできること・できないこと（2026-10-09 にドキュメントを読んだ）

| | できる |
| --- | --- |
| デザインを作る（絵は URL かデータ URI）・題・本文・利益・品目・消す | ○ |
| 品目ごとの「領域に合わせる」（`resizeMode`: contain / cover） | ○ |
| **品目ごとの大きさ・位置（scale / offsetX / offsetY）を保存** | **書いていない**（見本の絵を見るだけの `placement_preview` はある） |

なので、ここで**既定で作るのはステッカー・キーホルダー・マグの3品目**（どれも既定の大きさで
きれいに出る。`.claude/skills/suzuri/ops.md` 5章）。缶バッジとパネルは大きさを決めないと
切れるので、`probe` で保存できると分かるまで入れない（あやと 2026-10-09: 「缶バッジも試行錯誤
しながらコツ掴めば、ワークフローで投入できそう」）。それまでは EC2 のスキル（`/suzuri`）で足す。

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
# API で既定の大きさのまま出せる3品目（缶バッジ・パネルは probe で確かめるまで入れない）
SAFE_ITEMS = ["sticker", "acrylic-keychain", "mug"]
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


def create(title, description, texture, items, price=300, dry=False, src=None):
    body = {"title": title, "description": description, "price": price, "texture": texture_of(texture),
            "products": products_for(items, src)}
    if dry:
        print(f"  dry-run: POST /materials {title!r} items={items} texture={'data-uri' if body['texture'].startswith('data:') else body['texture'][:60]}")
        return None
    st, r = call("POST", "/materials", body)
    if st != 200:
        sys.exit(f"POST /materials {st}: {r}")
    m = r["material"]
    print(f"  created {m['id']} {m['title']!r} products={[p['item']['name'] for p in r.get('products', [])]}")
    return m["id"]


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
        mid = create(TITLE.format(emoji=c["emoji"]), DESCRIPTION.format(emoji=c["emoji"]), src, items, 300, dry)
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
    c = sub.add_parser("update"); c.add_argument("id", type=int)
    c.add_argument("--title"); c.add_argument("--description"); c.add_argument("--price", type=int); c.add_argument("--items")
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
        create(a.title, a.description, a.texture, [x for x in a.items.split(",") if x], a.price, a.dry_run)
    elif a.cmd == "update":
        body = {k: v for k, v in {"title": a.title, "description": a.description, "price": a.price}.items() if v is not None}
        if a.items:
            body["products"] = products_for([x for x in a.items.split(",") if x])
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
        # ドキュメントに書いていない scale / offset を PUT に載せ、保存されたかを読み直す。
        # 「保存できる」と分かれば、缶バッジとパネルもワークフローで作れる
        p = {"itemId": ITEM_IDS[a.item], "exemplaryItemVariantId": SAMPLE_VARIANT[a.item], "published": True,
             "scale": a.scale, "offsetX": a.offset_x, "offsetY": a.offset_y}
        st, r = call("PUT", f"/materials/{a.id}", {"products": [p]})
        print("PUT", st, r.get("error", ""))
        for prod in r.get("products", []):
            if prod.get("item", {}).get("name") == a.item:
                print("返ってきた:", {k: prod.get(k) for k in ("scale", "offsetX", "offsetY", "resizeMode")},
                      "見本:", prod.get("sampleImageUrl"))


if __name__ == "__main__":
    main()
