#!/usr/bin/env python3
"""EC2 の上で動く。SUZURI の**卓上カレンダー**（品目 733・面 january〜december・型 9140 white/2027）を、
画面の ✏️ と同じ GraphQL で**非公開のまま**組み、見本を大きく取る。ubuntu として回す。

    python3 suzuri_calendar.py build <置き場>          # <置き場>/01-a.png〜12-a.png と text.json（title, description）から組む
    python3 suzuri_calendar.py shots <デザインid> <置き場> [大きさ=1530]   # 12か月の見本を <置き場>/big-<month>.jpg に

公開は `suzuri_ops.py publish <デザインid>`（空打ちは `--dry-run`）。

## なぜ画面の裏の GraphQL か（2026-10-14）

公式の API（`suzuri_api.yml`）は、品目 733 を POST でも PUT でも 403 で断る。
画面では「1月の絵でデザインを作る → ✏️ から残り11か月の絵を足す」になっていて、✏️ の画面（お手入れ）は
`/graphql` に `CreateMaterial` → presign → lens2 へ POST → `UpdateMaterial` で**題の無い素材**を上げ、
`CreateProduct(itemId: 733, prints: [{materialId, place, primary, resizeMode}...])` で12面を一度に組む。
同じ要求をページの中から送る。2〜12月の素材は一覧に「題なし・非公開」で並ぶ（Tシャツの裏の絵と同じ扱い）。

**済んだところは `<置き場>/state.json` から飛ばす。** 途中で止まっても、同じコマンドをもう一度流せば続きから進む。
1月のデザインは上げる前の一覧と比べて増えた1件を拾う（やり直しで2つ作らない。ops.md の 7）。
"""
import base64, io, json, os, sys, time, urllib.parse, urllib.request
sys.path.insert(0, "/home/ubuntu/cdp")
from suzuri_ops import *  # noqa: E402,F401,F403
from suzuri_ops import _ajax  # noqa: E402

MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august",
          "september", "october", "november", "december"]


def gql(t, query, variables=None):
    js = f"""(async () => {{
      const tok = document.querySelector('meta[name=csrf-token]')?.content;
      const r = await fetch('/graphql', {{method: 'POST', credentials: 'include',
        headers: {{'X-CSRF-Token': tok, 'Content-Type': 'application/json', 'Accept': 'application/json'}},
        body: JSON.stringify({{query: {json.dumps(query)}, variables: {json.dumps(variables or {})}}})}});
      return [r.status, (await r.text()).slice(0, 200000)];
    }})()"""
    st, body = t.js(js, await_promise=True)
    try:
        return st, json.loads(body)
    except Exception:
        return st, body


def upload_material(t, path):
    """✏️ の画面と同じ手順で、題の無い素材を1つ作って絵を上げる。戻り値は ['ok', 素材id, …] か、落ちた段の名前"""
    raw = open(path, "rb").read()
    b64 = base64.b64encode(raw).decode()
    js = f"""(async () => {{
      const tok = document.querySelector('meta[name=csrf-token]')?.content;
      const H = {{'X-CSRF-Token': tok, 'Content-Type': 'application/json', 'Accept': 'application/json'}};
      const g = async (query, variables) => {{
        const r = await fetch('/graphql', {{method: 'POST', credentials: 'include', headers: H, body: JSON.stringify({{query, variables}})}});
        return await r.json(); }};
      const c = await g('mutation CreateMaterial($textureUpdatedAt: BigInt!) {{ createMaterial(input: {{textureUpdatedAt: $textureUpdatedAt}}) {{ id }} }}',
                        {{textureUpdatedAt: Math.round(Date.now() / 1000)}});
      const id = c.data?.createMaterial?.id;
      if (!id) return ['create', null, JSON.stringify(c).slice(0, 1500)];
      const p = await fetch('/account/uploads/presigns', {{method: 'POST', credentials: 'include', headers: H,
        body: JSON.stringify({{lens: {{klass: 'Material', id: id, ext: 'png'}}}})}});
      const pj = await p.json();
      const u = pj.uploadPresign;
      if (!u) return ['presign', id, p.status + ' ' + JSON.stringify(pj).slice(0, 1500)];
      const bin = Uint8Array.from(atob({json.dumps(b64)}), ch => ch.charCodeAt(0));
      const d = await fetch(u.uploadUrl, {{method: 'POST', mode: 'cors', headers: {{'Content-Type': 'image/png', 'X-Lens2-Token': u.token}}, body: new Blob([bin])}});
      if (!d.ok) return ['lens2', id, d.status + ' ' + (await d.text()).slice(0, 1500)];
      const dj = await d.json();
      const m = await g('mutation UpdateMaterial($material: UpdateMaterialAttributes!) {{ updateMaterial(input: {{attributes: $material}}) {{ id }} }}',
        {{material: {{id: id, textureFileName: {json.dumps(os.path.basename(path))}, textureContentType: 'image/png', textureFileSize: {len(raw)},
                     textureWidth: dj.original_meta.size.width, textureHeight: dj.original_meta.size.height}}}});
      if (m.errors) return ['update', id, JSON.stringify(m).slice(0, 1500)];
      return ['ok', id, ''];
    }})()"""
    return t.js(js, await_promise=True)


def build(d):
    st_path = f"{d}/state.json"
    state = json.load(open(st_path)) if os.path.exists(st_path) else {"subs": {}}
    save = lambda: json.dump(state, open(st_path, "w"), indent=1)  # noqa: E731
    text = json.load(open(f"{d}/text.json"))
    t = fresh_tab()
    if not state.get("main"):
        known = set(list_ids(t))
        mid = None
        try:
            mid = upload(t, f"{d}/01-a.png", None)
        finally:
            new = [i for i in list_ids(t) if i not in known]
            if len(new) == 1:
                mid = new[0]
            elif len(new) > 1:
                sys.exit(f"知らないデザインが {len(new)} 件増えた: {new}（手で見る）")
        if not mid:
            sys.exit("1月のデザインができていない")
        state["main"] = mid
        save()
    mid = state["main"]
    print("main", mid, flush=True)
    if not state.get("text"):
        # **非公開**（published: false）で入れる。公開は決めた時刻に suzuri_ops.py publish で
        st, r = _ajax(t, "PUT", f"/account/materials/{mid}",
                      {"material": {"title": text["title"], "description": text["description"], "price": 300, "published": False}})
        if st != 200:
            sys.exit(f"material PUT {st}: {str(r)[:300]}")
        _, ps = read(t, mid)
        pub = [p for p in ps if p["published"]]
        if pub:  # 新しいデザインに画面が既定の品目を出していたら下ろす
            _ajax(t, "POST", f"/account/materials/{mid}/products/bulk_upsert", {"attrs": [
                {"published": False, "itemId": p["item"]["id"], "exemplaryItemVariantId": None, "exemplaryAngle": p.get("exemplaryAngle"),
                 "scale": p.get("scale"), "offsetX": p.get("offsetX"), "offsetY": p.get("offsetY"),
                 "quantityLimit": p.get("quantityLimit"), "secret": False} for p in pub]})
        state["text"] = True
        save()
    for i in range(1, 12):
        m = f"{i + 1:02d}"
        if state["subs"].get(m):
            continue
        r = upload_material(t, f"{d}/{m}-a.png")
        print(m, str(r)[:300], flush=True)
        if not r or r[0] != "ok":
            if r and r[1]:  # 作りかけの素材は覚えておく（手で消す）
                state.setdefault("broken", []).append(r[1])
                save()
            sys.exit(f"{m} の素材が上がらなかった")
        state["subs"][m] = r[1]
        save()
    t.go("https://suzuri.jp/account/materials", wait=1)
    if not state.get("product"):
        # CONTAIN: 正方形の絵を面に収める（切らない）。SUZURI が scale を決める（2027年版で 0.5893）
        prints = [{"materialId": str(mid), "place": "january", "primary": True, "resizeMode": "CONTAIN"}]
        prints += [{"materialId": str(state["subs"][f"{i + 1:02d}"]), "place": MONTHS[i], "primary": False,
                    "resizeMode": "CONTAIN"} for i in range(1, 12)]
        q = """mutation($i: ID!, $p: [CreatePrintAttributes!]!) { createProduct(input: {attributes: {itemId: $i, prints: $p}}) {
                 id isPublished prints { id place material { id } } } }"""
        st, r = gql(t, q, {"i": "733", "p": prints})
        pid = (((r or {}).get("data") or {}).get("createProduct") or {}).get("id") if isinstance(r, dict) else None
        if not pid:
            sys.exit(f"品目ができなかった: {st} {json.dumps(r, ensure_ascii=False)[:1500]}")
        state["product"] = pid
        save()
    m, ps = read(t, mid)
    cal = next(p for p in ps if p["item"]["id"] == 733)
    print(json.dumps({"material": mid, "product": state["product"], "published": m["published"],
                      "prints": [(p.get("place"), (p.get("material") or {}).get("id")) for p in cal.get("prints") or []],
                      "sampleUrl": cal.get("sampleUrl")}, ensure_ascii=False, indent=1))
    down("suzuri")


def shots(mid, d, size=1530):
    """12か月の見本を大きく取る。

    見本の URL（`imageUrls`）は署名（token）に出力の大きさが入っていて、400px より大きくできない。
    品目の型（`item.productImageUrlTemplates`）は中身の空な token で、値を URL に埋めれば大きく描いてくれる。
    **`{lens2Adjustment}` は画面の JS と同じ `"." + scale+offsetX+offsetY` で渡す**（`.0.5893+0.0+0.0`）。
    JSON などで渡すと黙って無視され、絵が拡大されて四辺が切れた見本が返る（署名つきの 500px と画素で突き合わせて確かめた）。
    ログインなしで開ける URL なので、透かしの無い商品写真としてそのまま使える"""
    t = open_tab()
    st, r = gql(t, 'query { item(name: "desk-calendar") { productImageUrlTemplates } }')
    tpl = r["data"]["item"]["productImageUrlTemplates"]
    _, ps = read(t, mid)
    cal = next(p for p in ps if p["item"]["id"] == 733)
    down("suzuri")

    def payload(u):
        tok = u.split("token=")[1].split(".")[1]
        tok += "=" * (-len(tok) % 4)
        return json.loads(base64.urlsafe_b64decode(tok))

    src = {}
    for u in cal.get("imageUrls") or []:
        p = payload(u)
        src[p["layout"]["shot"]["angle"]] = p
    out = {}
    for a in MONTHS:
        p = src[a]
        lay, adj = p["layout"], p["layout"]["adjustment"]
        u = (tpl[a].replace("{color}", "white").replace("{size}", "2027").replace("{width}", str(size)).replace("{height}", str(size))
             .replace("{originalWidth}", str(lay["original_size"]["width"])).replace("{originalHeight}", str(lay["original_size"]["height"]))
             .replace("{texturePath}", urllib.parse.quote(p["source_path"], safe="")).replace("{uploadedAt}", str(p["source_version"]))
             .replace("{angle}", a).replace("{lens2Adjustment}", urllib.parse.quote(f".{adj['scale']}+{adj['offset_x']}+{adj['offset_y']}", safe=""))
             .replace("{ext}", "jpg"))
        for k in range(4):  # lens は描きたてだと 502 を返すことがある
            try:
                data = urllib.request.urlopen(u, timeout=120).read()
                open(f"{d}/big-{a}.jpg", "wb").write(data)
                out[a] = u
                print(a, len(data), flush=True)
                break
            except Exception as e:  # noqa: BLE001
                print(a, "retry", repr(e)[:120], flush=True)
                time.sleep(3 * (k + 1))
    json.dump(out, open(f"{d}/big-urls.json", "w"), indent=1)


if __name__ == "__main__":
    a = sys.argv[1:]
    if a[:1] == ["build"] and len(a) == 2:
        build(a[1])
    elif a[:1] == ["shots"] and len(a) in (3, 4):
        shots(int(a[1]), a[2], int(a[3]) if len(a) == 4 else 1530)
    else:
        sys.exit(__doc__)
