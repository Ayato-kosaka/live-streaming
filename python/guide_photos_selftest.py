"""**借りた写真を島の置き場から配る道具（`python/guide_photos.py`）が、落ちるときに落ちるか。**

    python3 python/guide_photos_selftest.py

終了コード 0=通った / 1=落ちた / **2=数えるものが無い**（`docs/island-standards.md` §15）。

ネットワークには出ない。取りに行く口（`get`）と待つ口（`sleep`）を差し替え、小さな置き場をこしらえて食わせる。
最後の節だけ、本物の面（2つの街・北欧の6か国・企画）を `check()` で見る——**焼いた面に Wikimedia の絵が
1本でも残るか、面が指す写真が置き場に無ければ赤**。数えた道が0本なら（置き場が動いて何も見ていない）2で落ちる。

## 何を見るか

| 節 | 守り | 崩れると |
| --- | --- | --- |
| 名前 | Commons のファイル名だけで置き場の名前が決まる（% と空白の違いで別の名前にならない） | 焼く道具が引く道と、置いた絵の名前がずれる |
| 幅 | 求めた幅に、置いた幅（120・500・960／北欧は 250・500・960／企画は 960）を当てる | ピンに 960 を読む・1920 の道が残る |
| 面 | 面ごとの置き場と道・北欧はその国の `img` `big` だけ（控えの `fbs` と、ほかの国は拾わない）・企画は出どころのリンクから名前を引く・頭で面を選ぶ・北欧の国が `build_nordic.py` と同じ | 面に出ない写真まで取りに行く・企画の写真を誰も落とさない |
| 消えた写真 | Commons から消えた写真（`GONE`）は取りに行かず、焼く道具が「写真なし」で焼く。表の名前がどの材料にも無ければ（外し忘れ）落とす | 割れた絵の枠が出る・表が腐る |
| 材料 | 写真の欄と upload の URL を拾い、960 より大きいかを覚える | 落とさない写真が出る・元より大きい縮小を求める |
| 取る | 置いた写真は取り直さない・1枚ごとに間を空ける・429 は待って取り直す・名乗る | Wikimedia に締め出される |
| 置く | 3つの幅・元より大きくしない・透けた PNG を黒くしない | ピンが黒い丸・ぼけた拡大 |
| 確かめ | 焼いたものに Wikimedia の絵が残る・置き場に無い道・ピンの 120 が無い、を落とす | 面が白い丸のまま緑 |
| 欄を組む | ファイルのページから作者・ライセンス（出してよいものを先に）・元の幅 | 作者の欄に CSS が入る・GFDL を選ぶ |
"""

from __future__ import annotations

import json
import re
import sys
import tempfile
import urllib.error
from io import BytesIO
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import guide_photos as gp  # noqa: E402

FAILS: list[str] = []
SEEN = 0


def ok(cond: bool, what: str) -> None:
    global SEEN
    SEEN += 1
    if not cond:
        FAILS.append(what)
        print(f"  NG {what}")


def jpeg(w: int, h: int) -> bytes:
    from PIL import Image

    b = BytesIO()
    Image.new("RGB", (w, h), (30, 120, 200)).save(b, "JPEG")
    return b.getvalue()


def png_clear(w: int, h: int) -> bytes:
    from PIL import Image

    b = BytesIO()
    Image.new("RGBA", (w, h), (0, 0, 0, 0)).save(b, "PNG")
    return b.getvalue()


def http(code: int) -> urllib.error.HTTPError:
    return urllib.error.HTTPError("https://upload.wikimedia.org/x", code, "x", None, None)  # type: ignore[arg-type]


KEY = "north-macedonia/skopje"
T960 = "https://upload.wikimedia.org/wikipedia/commons/thumb/4/40/08_Skopje.jpg/960px-08_Skopje.jpg"
T500 = "https://upload.wikimedia.org/wikipedia/commons/thumb/4/40/08_Skopje.jpg/500px-08_Skopje.jpg"


def make_root(d: Path, guide: dict, baked: str = "") -> Path:
    f = d / gp.PLACES[KEY]["from"][0][0]
    f.parent.mkdir(parents=True, exist_ok=True)
    f.write_text(json.dumps(guide, ensure_ascii=False), encoding="utf-8")
    b = d / gp.PLACES[KEY]["baked"][0]
    b.parent.mkdir(parents=True, exist_ok=True)
    b.write_text(baked, encoding="utf-8")
    return d


def names() -> None:
    print("名前")
    a = gp.stem("08 Skopje.jpg")
    ok(a == gp.stem("08_Skopje.jpg") == gp.stem("File:08%20Skopje.jpg"), "空白・_・%20・File: で同じ名前になる")
    ok(a.startswith("08-skopje-") and len(a) == len("08-skopje-") + 8, f"英数字の頭＋MD5 の8字（{a}）")
    ok(gp.stem("Sv_Spas.jpg") != gp.stem("Sv_Spas.JPG"), "拡張子の大小が違えば別の写真")
    c = gp.stem("Саат-кула_во_Скопје.jpg")
    ok(len(c) == 8 and all(ch in "0123456789abcdef" for ch in c), f"英数字の無い名前は MD5 だけ（{c}）")
    ok(gp.UP.match(T960).group(1) == "08_Skopje.jpg" and gp.UP.match(T960).group(2) == "960", "upload の URL から名前と幅")


def widths() -> None:
    print("幅")
    for asked, want in ((None, 960), (60, 120), (120, 120), (121, 500), (250, 500), (330, 500), (500, 500), (501, 960), (960, 960), (1920, 960)):
        ok(gp.slot(asked) == want, f"{asked} 幅には {want} を当てる（{gp.slot(asked)}）")
    nw = gp.widths_of("nordic/finland")
    for asked, want in ((120, 250), (250, 250), (251, 500), (500, 500), (960, 960), (1100, 960), (None, 960)):
        ok(gp.slot(asked, nw) == want, f"北欧: {asked} 幅には {want} を当てる（{gp.slot(asked, nw)}）")
    ok(gp.slot(500, gp.widths_of("plans")) == 960 and gp.slot(None, gp.widths_of("plans")) == 960, "企画は 960 だけ")


NSRC = {
    "spots": {
        "フィンランド": [
            {"id": "s000",
             "img": "https://upload.wikimedia.org/wikipedia/commons/thumb/c/c4/Suomenlinna_%28Kustaanmiekka%29_island.JPG/640px-Suomenlinna_%28Kustaanmiekka%29_island.JPG",
             "big": "https://upload.wikimedia.org/wikipedia/commons/thumb/c/c4/Suomenlinna_%28Kustaanmiekka%29_island.JPG/1100px-Suomenlinna_%28Kustaanmiekka%29_island.JPG",
             "fbs": "https://upload.wikimedia.org/wikipedia/commons/c/c4/Fallback_only.JPG|https://commons.wikimedia.org/wiki/Special:FilePath/Fallback_only.JPG?width=900",
             "cm": "https://commons.wikimedia.org/wiki/File:Suomenlinna_%28Kustaanmiekka%29_island.JPG"},
            {"id": "s001", "img": "", "big": ""},
        ],
        "ノルウェー": [{"img": "https://upload.wikimedia.org/wikipedia/commons/thumb/1/12/Norway_only.jpg/640px-Norway_only.jpg"}],
    }
}

PLANS_TS = """export const PLANS = [{
    photos: [
      {
        src: "/next/photos/%s-960.webp",
        alt: "観覧車",
        credit: "Wikimedia Commons (CC BY-SA 2.0)",
        creditHref: "https://commons.wikimedia.org/wiki/File:Tbilisi_-_Mtatsminda_Park_(9460953464).jpg",
      },
    ],
    links: [{ label: "公式", href: "https://commons.wikimedia.org/wiki/Main_Page" }],
}];
"""


def places() -> None:
    print("面")
    import build_nordic

    ok(set(gp.NORDIC) == {s for s, _ in build_nordic.ROUTE_ORDER},
       f"北欧の国が build_nordic.py の ROUTE_ORDER と同じ（{sorted(gp.NORDIC)}）")
    n = "Suomenlinna_(Kustaanmiekka)_island.JPG"
    ok(gp.public("nordic/finland", n, 250) == f"/travel/finland/photos/{gp.stem(n)}-250.webp", "北欧は国の面の下（/travel/<国>/photos/）")
    ok(gp.public("plans", "A.jpg", 960) == f"/next/photos/{gp.stem('A.jpg')}-960.webp", "企画は /next/photos/")
    ok(gp.public("bulgaria/sofia", "A.jpg", 500) == f"/guide/bulgaria/sofia/photos/{gp.stem('A.jpg')}-500.webp", "街は前のまま")
    ok(gp.pick(["nordic"]) == ([f"nordic/{s}" for s in gp.NORDIC], []), f"頭で面を選ぶ（{gp.pick(['nordic'])}）")
    ok(gp.pick(["plans", "nordic/sweden", "nordi"]) == (["plans", "nordic/sweden"], ["nordi"]), "名前の途中では選ばない")
    ok(gp.pick([])[0] == list(gp.PLACES), "無ければ全部")
    ok(gp.UP.match(NSRC["spots"]["フィンランド"][0]["fbs"]).group(1) == "Fallback_only.JPG", "名前に `|` から先を入れない")

    with tempfile.TemporaryDirectory() as t:
        root = Path(t)
        src = root / gp.NORDIC["finland"][0]
        src.parent.mkdir(parents=True)
        src.write_text(json.dumps(NSRC, ensure_ascii=False), encoding="utf-8")
        w = gp.wanted("nordic/finland", root)
        ok(set(w) == {n}, f"その国の img と big だけ（控えの fbs・ほかの国は拾わない。{sorted(w)}）")
        ok(w[n]["big"] is True and "/960px-" in gp.source(n, w[n], 960), "1100 の縮小があれば 960 を取る")
        ok(gp.wanted("nordic/sweden", root) == {}, "その国の見どころが無ければ0（check の数えた数が減る）")

        d = gp.photo_dir("nordic/finland", root)
        d.mkdir(parents=True)
        for wd in (250, 500):
            (d / f"{gp.stem(n)}-{wd}.webp").write_bytes(b"x")
        ok(not gp.done("nordic/finland", n, root), "北欧は 250・500・960 が揃って済み")
        ok(gp.local("nordic/finland", NSRC["spots"]["フィンランド"][0]["img"], 250, root)
           == f"/travel/finland/photos/{gp.stem(n)}-250.webp", "北欧の材料の URL を置き場の 250 に")
        ok(gp.local("nordic/finland", NSRC["spots"]["フィンランド"][0]["big"], 960, root) is None, "置いていない 960 は None（焼く道具が止まる）")

        plans = root / "site/content/plans.ts"
        plans.parent.mkdir(parents=True, exist_ok=True)
        p = "Tbilisi_-_Mtatsminda_Park_(9460953464).jpg"
        plans.write_text(PLANS_TS % gp.stem(p), encoding="utf-8")
        w = gp.wanted("plans", root)
        ok(set(w) == {p} and w[p]["big"] is True, f"企画は出どころのリンクから名前を引き、縮小を先に頼む（{w}）")
        bad, seen = gp.check("plans", root)
        ok(any("揃っていない" in b for b in bad) and any("置き場に無い" in b for b in bad), "置いていなければ落とす")
        dp = gp.photo_dir("plans", root)
        dp.mkdir(parents=True)
        (dp / f"{gp.stem(p)}-960.webp").write_bytes(b"x")
        bad, seen = gp.check("plans", root)
        ok(not bad and seen == 2, f"置けば食い違い0（{bad} / {seen}）")
        plans.write_text((PLANS_TS % gp.stem(p)).replace("/next/photos/", "/travel/finland/photos/"), encoding="utf-8")
        bad, _ = gp.check("plans", root)
        ok(any("別の面" in b for b in bad), "別の面の置き場を指していれば落とす")

    # Commons から消えた写真: 取りに行かず、焼く道具は「写真なし」で焼く
    real_gone = gp.GONE
    try:
        gp.GONE = {n: "対照"}
        with tempfile.TemporaryDirectory() as t:
            root = Path(t)
            src = root / gp.NORDIC["finland"][0]
            src.parent.mkdir(parents=True)
            src.write_text(json.dumps(NSRC, ensure_ascii=False), encoding="utf-8")
            ok(gp.wanted("nordic/finland", root) == {}, "消えた写真は材料から外す（取りに行かない・揃っていなくても落とさない）")
        ok(gp.gone(NSRC["spots"]["フィンランド"][0]["big"]) and gp.gone("File:Suomenlinna (Kustaanmiekka) island.JPG"),
           "URL でもファイル名でも、消えた写真と分かる")
        ok(build_nordic.photo("finland", NSRC["spots"]["フィンランド"][0]["img"], 250) == "", "焼く道具は消えた写真を空で焼く（割れた絵の枠を出さない）")
    finally:
        gp.GONE = real_gone
    # 表が腐らない: 消えたと書いた写真が、どの材料にも無ければ（直したのに外し忘れた）落とす
    named: set[str] = set()
    for key, place in gp.PLACES.items():
        for rel, path, *fields in place["from"]:
            f = gp.ROOT / rel
            if f.exists():
                named |= {gp.norm(m.group(1)) for m in gp.UP.finditer(f.read_text(encoding="utf-8"))}
    stale = sorted(set(gp.GONE) - named)
    ok(not stale, f"消えた写真の表の名前が、どれかの材料に在る（無いもの {stale}）")
    ok(all(re.search(r"\d{4}-\d{2}-\d{2}", why) for why in gp.GONE.values()), "消えた写真の表に、いつ確かめたかの日付がある")


def material_and_local() -> None:
    print("材料と道")
    guide = {
        "see": [
            {"photo": {"file": "08 Skopje.jpg", "lic": "CC BY-SA 3.0", "w": 4320, "thumbs": {"500": T500, "960": T960}}},
            {"photo": {"file": "Tulumba.jpg", "lic": "CC0", "w": 500}},
            {"photo": {"file": "No_licence.jpg"}},
        ],
        "note": "https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Big_one.jpg/1920px-Big_one.jpg と "
        "https://upload.wikimedia.org/wikipedia/commons/c/cd/Small_one.jpg",
    }
    with tempfile.TemporaryDirectory() as t:
        root = make_root(Path(t), guide)
        w = gp.wanted(KEY, root)
        ok(set(w) == {"08_Skopje.jpg", "Tulumba.jpg", "Big_one.jpg", "Small_one.jpg"}, f"ライセンスを持つ欄と URL だけ拾う（{sorted(w)}）")
        ok(w["08_Skopje.jpg"]["w"] == 4320, "元の幅を覚える")
        ok(w["Big_one.jpg"]["big"] is True and w["Small_one.jpg"]["big"] is False, "960 以上の縮小があるかを覚える")
        ok("/thumb/" in gp.source("08_Skopje.jpg", w["08_Skopje.jpg"]) and "/960px-" in gp.source("08_Skopje.jpg", w["08_Skopje.jpg"]),
           "元が 960 より大きければ 960 の縮小を取る")
        ok("/thumb/" not in gp.source("Tulumba.jpg", w["Tulumba.jpg"]), "元が 960 以下なら元のファイルを取る（縮小は返らない）")
        ok("/960px-" in gp.source("Big_one.jpg", w["Big_one.jpg"]), "幅の分からない写真は、960 以上の縮小があれば 960")
        ok("/thumb/" not in gp.source("Small_one.jpg", w["Small_one.jpg"]), "幅の分からない写真で縮小が無ければ元のファイル")
        ok(gp.commons_url("08 Skopje.jpg", 960) == T960, "Commons の道は名前の MD5 で決まる")

        d = gp.photo_dir(KEY, root)
        d.mkdir(parents=True)
        s = gp.stem("08_Skopje.jpg")
        for wd in (120, 500):
            (d / f"{s}-{wd}.webp").write_bytes(b"x")
        ok(gp.local(KEY, T500, root=root) == f"/guide/{KEY}/photos/{s}-500.webp", "500 の URL は置き場の 500 に")
        ok(gp.local(KEY, T960, root=root) is None, "置いていない幅は None（焼く道具が止まる）")
        ok(gp.local(KEY, T960, 120, root) == f"/guide/{KEY}/photos/{s}-120.webp", "幅を渡せばそちら")
        ok(gp.local(KEY, "08 Skopje.jpg", 250, root) == f"/guide/{KEY}/photos/{s}-500.webp", "ファイル名でも引ける")
        ok(not gp.done(KEY, "08_Skopje.jpg", root), "3つ揃っていなければ済んでいない")


def fetching() -> None:
    print("取る・置く")
    guide = {
        "see": [
            {"photo": {"file": "A_done.jpg", "lic": "CC0", "w": 2000}},
            {"photo": {"file": "B_busy.jpg", "lic": "CC0", "w": 2000}},
            {"photo": {"file": "C_small.png", "lic": "CC0", "w": 300}},
            {"photo": {"file": "D_gone.jpg", "lic": "CC0"}},
        ],
        "x": "https://upload.wikimedia.org/wikipedia/commons/thumb/e/ef/D_gone.jpg/960px-D_gone.jpg",
    }
    with tempfile.TemporaryDirectory() as t:
        root = make_root(Path(t), guide)
        d = gp.photo_dir(KEY, root)
        d.mkdir(parents=True)
        for wd in gp.WIDTHS:
            (d / f"{gp.stem('A_done.jpg')}-{wd}.webp").write_bytes(b"x")
        asked: list[str] = []
        slept: list[float] = []
        busy = {"n": 0}

        def get(url: str) -> bytes:
            asked.append(url)
            if "B_busy" in url:
                busy["n"] += 1
                if busy["n"] <= 2:
                    raise http(429)
                return jpeg(1200, 800)
            if "C_small" in url:
                return png_clear(300, 200)
            if "D_gone" in url:
                raise http(404)
            raise AssertionError(url)

        rc = gp.fetch(KEY, root, get=get, sleep=slept.append, log=lambda *_: None)
        ok(not any("A_done" in u for u in asked), "置いてある写真は取り直さない")
        ok(sum("B_busy" in u for u in asked) == 3, f"429 は待って取り直す（{sum('B_busy' in u for u in asked)} 回）")
        ok(gp.WAITS[0] in slept and gp.WAITS[1] in slept and gp.WAITS[2] not in slept, f"429 のあと、決めた秒だけ待つ（{slept}）")
        ok(slept.count(gp.GAP) >= 2, f"1枚ごとに間を空ける（{slept.count(gp.GAP)} 回）")
        ok(sum("D_gone" in u for u in asked) == 2 and not any("D_gone" in u and "/thumb/" in u for u in asked[-1:]),
           "960 の縮小が断られたら、元のファイルを1回だけ試す")
        ok(rc == 1, f"取れない写真があれば 1（{rc}）")
        from PIL import Image

        b = d / f"{gp.stem('B_busy.jpg')}"
        sizes = {wd: Image.open(f"{b}-{wd}.webp").size for wd in gp.WIDTHS}
        ok(sizes == {120: (120, 80), 500: (500, 333), 960: (960, 640)}, f"3つの幅で置く（{sizes}）")
        c = d / f"{gp.stem('C_small.png')}"
        cs = {wd: Image.open(f"{c}-{wd}.webp").size[0] for wd in gp.WIDTHS}
        ok(cs == {120: 120, 500: 300, 960: 300}, f"元より大きくしない（{cs}）")
        px = Image.open(f"{c}-500.webp").convert("RGB").getpixel((10, 10))
        ok(min(px) > 200, f"透けた PNG を黒い地にしない（{px}）")
        ok(not list(d.glob("*.tmp")), "書きかけの絵を残さない")
        ok(not (d / f"{gp.stem('D_gone.jpg')}-960.webp").exists(), "取れなかった写真は置かない")

        # 2回目は、置いたものを取りに行かない
        asked.clear()
        gp.fetch(KEY, root, get=get, sleep=lambda *_: None, log=lambda *_: None)
        ok(all("D_gone" in u for u in asked) and asked, f"2回目は、まだ置いていないものだけ（{len(asked)} 本）")

        # ずっと 429 なら、決めた回数で諦める
        tries = []

        def always(url: str) -> bytes:
            tries.append(url)
            raise http(429)

        ok(gp.pull("u", always, lambda *_: None, lambda *_: None) == (None, 429) and len(tries) == len(gp.WAITS) + 1,
           f"ずっと 429 なら {len(gp.WAITS) + 1} 回で諦める（{len(tries)}）")

        # 締め出されている最中に、元のファイル（数十 MB）へ逃げない
        tries.clear()
        gp.fetch(KEY, make_root(Path(t) / "b", {"x": "https://upload.wikimedia.org/wikipedia/commons/thumb/1/12/E_busy.jpg/960px-E_busy.jpg"}),
                 get=always, sleep=lambda *_: None, log=lambda *_: None)
        ok(tries and all("/thumb/" in u for u in tries), f"429 で諦めた写真は、元のファイルを取りに行かない（{len(tries)} 本）")

        # --gentle: 429 が1回でも返ったら、取り直さず・次の写真へも進まずに止める（締め出しを長引かせない）
        tries.clear()
        gslept: list[float] = []
        two = make_root(Path(t) / "g", {"x": "https://upload.wikimedia.org/wikipedia/commons/thumb/1/12/F_busy.jpg/960px-F_busy.jpg",
                                         "y": "https://upload.wikimedia.org/wikipedia/commons/thumb/1/13/G_busy.jpg/960px-G_busy.jpg"})
        grc = gp.fetch(KEY, two, get=always, sleep=gslept.append, log=lambda *_: None, gentle=True)
        ok(len(tries) == 1 and grc == 1, f"--gentle は 429 が1回で止める（叩いた {len(tries)} 本・{grc}）")
        ok(not gslept, f"--gentle は 429 のあと待って取り直さない（待った {gslept}）")
        ok(gp.GENTLE_GAP >= 60, f"--gentle の間は60秒以上（{gp.GENTLE_GAP}）")

        # Retry-After が決めた秒より長ければ、そちらを待つ
        waited: list[float] = []
        n = {"i": 0}

        def ra(url: str) -> bytes:
            n["i"] += 1
            if n["i"] == 1:
                raise urllib.error.HTTPError(url, 429, "x", {"Retry-After": "30"}, None)  # type: ignore[arg-type]
            return b"ok"

        ok(gp.pull("u", ra, waited.append, lambda *_: None) == (b"ok", 200) and waited == [30], f"Retry-After を守る（{waited}）")


def naming_header() -> None:
    print("名乗り")
    import urllib.request

    seen = {}

    class R:
        def __enter__(self):
            return self

        def __exit__(self, *a):
            return False

        def read(self):
            return b"ok"

    def fake(req, timeout=0):
        seen["ua"] = req.get_header("User-agent")
        return R()

    real = urllib.request.urlopen
    urllib.request.urlopen = fake
    try:
        gp._get("https://upload.wikimedia.org/x")
    finally:
        urllib.request.urlopen = real
    ua = seen.get("ua") or ""
    ok(ua == gp.UA and "/" in ua and "python" not in ua.lower(), f"道具の名前で名乗る（{ua}）")


def checking() -> None:
    print("確かめ")
    guide = {"see": [{"photo": {"file": "08 Skopje.jpg", "lic": "CC BY-SA 3.0", "w": 4320}}]}
    s = gp.stem("08_Skopje.jpg")
    good = f'{{"src": "/guide/{KEY}/photos/{s}-960.webp", "small": "/guide/{KEY}/photos/{s}-500.webp"}}'
    with tempfile.TemporaryDirectory() as t:
        root = make_root(Path(t), guide, good)
        d = gp.photo_dir(KEY, root)
        d.mkdir(parents=True)
        for wd in gp.WIDTHS:
            (d / f"{s}-{wd}.webp").write_bytes(b"x")
        bad, seen = gp.check(KEY, root)
        ok(not bad and seen == 3, f"揃っていれば食い違い0（{bad} / {seen}）")

        (root / gp.PLACES[KEY]["baked"][0]).write_text(good + f'\n"{T960}"', encoding="utf-8")
        bad, _ = gp.check(KEY, root)
        ok(any("Wikimedia" in b for b in bad), "焼いたものに Wikimedia の絵が1本でも残れば落とす")

        (root / gp.PLACES[KEY]["baked"][0]).write_text(good, encoding="utf-8")
        (d / f"{s}-120.webp").unlink()
        bad, _ = gp.check(KEY, root)
        ok(any(f"{s}-120.webp" in b for b in bad), "面が指していなくても、ピンの 120 が無ければ落とす")
        ok(any("揃っていない" in b for b in bad), "材料の写真が3つ揃っていなければ落とす")

        (d / f"{s}-120.webp").write_bytes(b"x")
        (root / gp.PLACES[KEY]["baked"][0]).write_text(good.replace(s, "nothing-here"), encoding="utf-8")
        bad, _ = gp.check(KEY, root)
        ok(any("nothing-here-960.webp" in b for b in bad), "面が指す道が置き場に無ければ落とす")

        (root / gp.PLACES[KEY]["baked"][0]).write_text(good.replace(KEY, "bulgaria/sofia"), encoding="utf-8")
        bad, _ = gp.check(KEY, root)
        ok(any("別の面" in b for b in bad), "別の街の置き場を指していれば落とす")

    with tempfile.TemporaryDirectory() as t:
        root = make_root(Path(t), {}, "")
        bad, seen = gp.check(KEY, root)
        ok(seen == 0, f"何も無ければ数えた数は0（{seen}。main が 2 で落ちる）")


PAGE = """<table><tr><td id="fileinfotpl&#95;aut" class="fileinfo-paramfield">Author</td>
<td><style>.mw-parser-output .x{color:red}</style><a href="/wiki/User:A">Diego&#32;Delso</a></td></tr></table>
<span class="licensetpl&#95;short" style="display:none;">GFDL</span>
<span class="licensetpl&#95;short" style="display:none;">CC BY-SA 4.0</span>
<span class="fileInfo">(1,536 × 2,048 pixels, file size: 905 KB)</span>"""


def page_parse() -> None:
    print("欄を組む")
    r = gp.parse_page("File:Skopje Clock Tower.JPG", PAGE, "2026-11-15")
    ok(r["by"] == "Diego Delso", f"作者の欄に CSS を入れない（{r['by']}）")
    ok(r["lic"] == "CC BY-SA 4.0", f"出してよいライセンスを先に選ぶ（{r['lic']}）")
    ok(r["w"] == 1536, f"元の幅（{r['w']}）")
    ok(sorted(r["thumbs"]) == ["250", "500", "960"] and all("/thumb/" in u for u in r["thumbs"].values()), "元より小さい縮小だけ")
    ok(r["page"].startswith("https://commons.wikimedia.org/wiki/File:Skopje_Clock_Tower.JPG"), f"元のページ（{r['page']}）")
    ok(r["alt"] == "", "alt は人が書く（道具は埋めない）")
    small = gp.parse_page("x.jpg", PAGE.replace("1,536", "400").replace("GFDL", "Public domain").replace("CC BY-SA 4.0", "GFDL"), "d")
    ok(small["lic"] == "PD" and sorted(small["thumbs"]) == ["250"], f"Public domain は PD・元が 400 なら 250 だけ（{small['lic']} {sorted(small['thumbs'])}）")


def real() -> None:
    print("本物の面（街・北欧・企画）")
    total = 0
    for key in gp.PLACES:
        bad, seen = gp.check(key)
        total += seen
        for b in bad[:5]:
            print(f"    {b}")
        ok(not bad, f"{key}: 焼いた面に Wikimedia の絵が無く、指す写真が全部置いてある（食い違い {len(bad)}）")
    if total == 0:
        print("::error::本物の面で数えた写真の道が0本（置き場が動いた？）")
        sys.exit(2)


def main() -> int:
    names()
    widths()
    places()
    material_and_local()
    fetching()
    naming_header()
    checking()
    page_parse()
    real()
    if SEEN == 0:
        return 2
    print(f"{SEEN} 件を見た・落ちた {len(FAILS)}")
    return 1 if FAILS else 0


if __name__ == "__main__":
    sys.exit(main())
