"""**街のガイドの台本の道具（`python/guide_book_build.py`）が、書き損じを止め、台本と JSON の食い違いを見つけるか。**

    python3 python/guide_book_build_selftest.py

終了コード 0=通った / 1=落ちた / **2=数えるものが無い**（本物の台本が1本も無い。`docs/island-standards.md` §15）。

外へは出ない（座標を引く口は、こしらえた返事を食わせる）。こしらえた台本は一時の置き場に書く。

| 確かめ | 落ちるべきもの |
| --- | --- |
| 本物 | ブカレストの台本から書いたものが、いまの guidebook.json・compose.json と同じ（`build --check` が 0） |
| 食い違い | JSON を手で1字直すと `--check` が 1 |
| 書き損じ | SRC に無い出どころの鍵・geo.json に無い座標・photos.json に無い写真・STORES に無い店 → 1（どの鍵かを言う） |
| 台本が無い | 2 |
| 出どころを集める | やりたいことの `src` は、窓の事実の出どころを重ねずに集める |
| 座標 | 国の表の枠の外の点を捨てる。全部外なら書かずに 1。在る鍵は引き直さない |
"""

from __future__ import annotations

import io
import json
import shutil
import sys
import tempfile
from contextlib import redirect_stdout
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import guide_book_build as gb  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
REAL = "romania/bucharest"
OK: list[str] = []
NG: list[str] = []


def ok(name: str, good: bool, got="") -> None:
    (OK if good else NG).append(f"{name}{'' if good else f'（{got}）'}")


def quiet(f, *a, **k):
    buf = io.StringIO()
    with redirect_stdout(buf):
        rc = f(*a, **k)
    return rc, buf.getvalue()


SCRIPT = '''
SEEN = "2026-11-19"
TOWN = "testville"
MAPS_AREA = "Test"
DISH_LOCAL_SRC = "a"
SRC = {"a": ("出どころA", "https://example.org/a"), "b": ("出どころB", "https://example.org/b")}
STORES = {"shop": store("shop", "店", "Shop", "center", "p1", "店の理由。", s("a"))}
todos = [todo("t1", "見たい！", "見出し", {"what": [t("事実1", "a")], "why": [t("事実2", "a", "b")]}, ph="do")]
see = [{"key": "x", "photo": photo("ph1", "写真"), **at("p1")}]
eat = [dish("d1", "料理", "Dish", ["local"], False, False, t("料理の字", "a"), ["shop"])]
book = {"todo": todos, "see": see, "eat": {"items": eat}}
compose = {"title": "x"}
'''


def city(tmp: Path, script: str) -> str:
    d = tmp / "python/data/guide/xx/testville"
    d.mkdir(parents=True, exist_ok=True)
    (d / "book.py").write_text(script, encoding="utf-8")
    (d / "geo.json").write_text(json.dumps({"p1": {"lat": 1.5, "lon": 2.5, "name": "点1", "osm": "https://www.openstreetmap.org/node/1"}}), encoding="utf-8")
    (d / "photos.json").write_text(json.dumps({"ph1": {"file": "X.jpg", "by": "誰か", "lic": "CC BY 4.0", "alt": "", "w": 1000}}), encoding="utf-8")
    (tmp / "python/data/guide/cities.json").write_text(json.dumps(
        {"countries": {"xx": {"cities": {"testville": {"bbox": [1.0, 2.0, 2.0, 3.0], "trips": {"far": {"bbox": [10.0, 11.0, 10.0, 11.0]}}}}}}}),
        encoding="utf-8")
    return "xx/testville"


def main() -> int:
    if not (gb.city_dir(REAL) / "book.py").exists():
        print(f"::error::本物の台本が無い: {gb.GUIDE / REAL / 'book.py'}")
        return 2

    # 1. 本物
    rc, out = quiet(gb.build, REAL, check=True)
    ok("本物: ブカレストの台本から書いたものが、いまの JSON と同じ", rc == 0, out.strip())

    with tempfile.TemporaryDirectory() as t:
        tmp = Path(t)
        # 2. 食い違い（本物の写しを1字だけ直す）
        d = tmp / gb.GUIDE / REAL
        d.parent.mkdir(parents=True)
        shutil.copytree(gb.city_dir(REAL), d)
        shutil.copy(ROOT / gb.GUIDE / "cities.json", tmp / gb.GUIDE / "cities.json")
        rc, _ = quiet(gb.build, REAL, root=tmp, check=True)
        ok("写しの置き場でも本物は同じ（下の対照の前提）", rc == 0, rc)
        p = d / "compose.json"
        p.write_text(p.read_text(encoding="utf-8").replace("ブカレスト", "ブカレスド", 1), encoding="utf-8")
        rc, out = quiet(gb.build, REAL, root=tmp, check=True)
        ok("食い違い: JSON を手で1字直すと 1", rc == 1 and "compose.json" in out, (rc, out.strip()))

        # 3. こしらえた台本
        key = city(tmp, SCRIPT)
        book, _ = gb.run(key, tmp)
        srcs = [x["url"] for x in book["todo"][0]["src"]]
        ok("出どころを集める: 同じ出どころは1回だけ・並びは窓の順", srcs == ["https://example.org/a", "https://example.org/b"], srcs)
        ok("描いた絵の当て（ph=\"do\"）", book["todo"][0]["photo"] == {"drawn": "do"}, book["todo"][0].get("photo"))
        ok("写真の alt を台本の字で入れる", book["see"][0]["photo"]["alt"] == "写真", book["see"][0]["photo"])
        ok("店の座標と出どころ", book["eat"]["items"][0]["stores"][0]["coord_src"][0]["url"].endswith("/node/1"), book["eat"]["items"][0]["stores"][0])
        ok("todo の既定の街は TOWN", book["todo"][0]["town"] == "testville", book["todo"][0]["town"])
        rc, _ = quiet(gb.build, key, root=tmp)
        written = (gb.city_dir(key, tmp) / "guidebook.json").read_text(encoding="utf-8")
        ok("書いたものは道具の形（dumps）と同じ", rc == 0 and written == gb.dumps(book), rc)
        rc, _ = quiet(gb.build, key, root=tmp, check=True)
        ok("書いた直後の --check は 0", rc == 0, rc)

        for name, bad, want in (
            ("SRC に無い出どころの鍵", SCRIPT.replace('t("事実1", "a")', 't("事実1", "zz")'), "出どころの鍵「zz」"),
            ("geo.json に無い座標", SCRIPT.replace('**at("p1")', '**at("p9")'), "座標の鍵「p9」"),
            ("photos.json に無い写真", SCRIPT.replace('photo("ph1"', 'photo("ph9"'), "写真の鍵「ph9」"),
            ("STORES に無い店", SCRIPT.replace('["shop"])]', '["nope"])]'), "店の鍵「nope」"),
            ("材料を作っていない台本", SCRIPT.replace("book = {", "boo = {"), "`book`"),
        ):
            k = city(tmp, bad)
            rc, out = quiet(gb.build, k, root=tmp)
            ok(f"書き損じ: {name} → 1 で鍵を言う", rc == 1 and want in out, (rc, out.strip()))
        (gb.city_dir(key, tmp) / "book.py").unlink()
        rc, _ = quiet(gb.build, key, root=tmp)
        ok("台本が無い → 2", rc == 2, rc)

        # 4. 座標（こしらえた返事。外へは出ない）
        key = city(tmp, SCRIPT)
        calls: list[str] = []

        def fake(url: str):
            calls.append(url)
            if "inside" in url:
                return [{"lat": "50", "lon": "50", "osm_type": "node", "osm_id": 7, "name": "遠い同名"},
                        {"lat": "1.2", "lon": "2.2", "osm_type": "way", "osm_id": 8, "name": "近い本物", "type": "museum"}]
            if "trip" in url:
                return [{"lat": "10.5", "lon": "10.5", "osm_type": "node", "osm_id": 9, "name": "日帰り先"}]
            return [{"lat": "50", "lon": "50", "osm_type": "node", "osm_id": 10, "name": "枠の外だけ"}]

        rc, _ = quiet(gb.geo, key, ["a=inside", "b=trip", "c=outside", "p1=again"], root=tmp, get=fake, sleep=lambda s: None)
        g = json.loads((gb.city_dir(key, tmp) / "geo.json").read_text(encoding="utf-8"))
        ok("座標: 枠の外の1件目を捨て、枠の中の点を取る", g.get("a", {}).get("osm") == "https://www.openstreetmap.org/way/8", g.get("a"))
        ok("座標: 日帰りの枠の中も取る", g.get("b", {}).get("lat") == 10.5, g.get("b"))
        ok("座標: 全部が枠の外なら書かずに 1", rc == 1 and "c" not in g, (rc, sorted(g)))
        ok("座標: 在る鍵は引き直さない", not any("again" in c for c in calls), calls)

    for line in OK:
        print(f"  ○ {line}")
    for line in NG:
        print(f"  ✕ {line}")
    print(f"{'○' if not NG else '✕'} {len(OK) + len(NG)}件みて、{len(NG)}件 落ちた")
    return 1 if NG else 0


if __name__ == "__main__":
    sys.exit(main())
