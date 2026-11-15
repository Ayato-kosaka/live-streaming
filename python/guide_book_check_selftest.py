"""**ガイドブックの材料の見張り（`python/guide_book_check.py`）が、守りを1つ外した写しを、その札で落とすか。**

    python3 python/guide_book_check_selftest.py

ネットワークも鍵も要らない。本物の `guidebook.json` と `mymaps/` を一時ディレクトリへ写し、1か所だけ壊して当てる。
本物の材料にも `streams/` にも書かない（読むだけ）。

## なぜ要るか

見張りが緑を返すと、面を作る担当はその材料を「出どころつき・行ったは配信どおり」として使う。
**見張りが何も見ていなくても、緑は同じ緑に見える。** だから本物の材料が通ること（落ちすぎない）と、
1か所ずつ壊した写しが、壊した所の札で落ちること（何かは見ている）の両方を当てる。
いちばん大事なのは「行っていない街（オフリド）を行ったにする」2通り——
オフリドの項目にスコピエの配信の行を結ぶ・スコピエの項目の街だけをオフリドに書き換える——を、どちらも落とすこと（#324）。

## 対照

`guide_book_check.py` の比較を1つ壊すと、ここが赤くなる。`python3 python/mutation_drill.py python/guide_book_check_selftest.py`
でも当てられる。
"""

from __future__ import annotations

import contextlib
import copy
import io
import json
import shutil
import sys
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import guide_book_check as gb  # noqa: E402

KEY = "north-macedonia/skopje"
REAL = gb.ROOT / "python/data/guide" / KEY / "guidebook.json"
REAL_MAPS = REAL.parent / "mymaps"


def run(d: dict | None, tmp: Path, csv_edit=None) -> list[str]:
    book = tmp / "guidebook.json"
    maps = tmp / "mymaps"
    if maps.exists():
        shutil.rmtree(maps)
    shutil.copytree(REAL_MAPS, maps)
    if csv_edit:
        csv_edit(maps)
    if d is None:
        if book.exists():
            book.unlink()
    else:
        book.write_text(json.dumps(d, ensure_ascii=False), encoding="utf-8")
    b = gb.Book(KEY, root=gb.ROOT, book=book, mymaps=maps)
    b.check()
    return b.errors


def facts_ids(pred) -> str:
    """streams/ の行から、条件に合う行の id を1つ返す（確かめが要る行・チャットの行の対照に使う）。"""
    b = gb.Book(KEY)
    for fid, row in b.rows.items():
        if row["city"] == "skopje" and pred(row["it"]):
            return fid
    raise SystemExit(f"対照に使う行が streams/ に無い（{pred}）")


def fact_of(fid: str) -> dict:
    v, rest = fid.split("@")
    t, kind = rest.split("#")
    t = int(t)
    b = gb.Book(KEY)
    date = b.rows[fid]["date"]
    return {"id": fid, "ref": f"{date[5:]} {t // 3600}:{t % 3600 // 60:02d}:{t % 60:02d}", "video": v, "t": t, "kind": kind,
            "url": f"https://www.youtube.com/watch?v={v}&t={t}s"}


def cases(real: dict) -> list[tuple[str, object, set[str], set[str]]]:
    """（名前, 写しを壊す関数, 出てほしい札, ほかに出てよい札）"""
    verify_id = facts_ids(lambda it: bool(it.get("verify")))
    via_id = facts_ids(lambda it: bool(it.get("via")))
    skopje_went = real["todo"][0]["went"]["facts"][0]

    def see0(d):
        return d["see"][0]

    def store0(d):
        return d["eat"]["items"][0]["stores"][0]

    def matka(d):
        return next(t for t in d["todo"] if t["town"] == "matka-canyon")

    def ohrid_item(d):
        d["see"].append({"key": "ohrid", "town": "ohrid", "name": "オフリド湖",
                         "what": {"text": "湖のほとりの古い街。", "src": copy.deepcopy(see0(d)["what"]["src"])},
                         "went": {"facts": [copy.deepcopy(skopje_went)]},
                         "scene": {k: skopje_went[k] for k in ("id", "video", "t", "url")}})

    csv_only = {"CSV が材料と食い違う"}
    return [
        ("出どころを外す", lambda d: see0(d)["what"].pop("src"), {"出どころの無い事実"}, set()),
        ("出どころが http", lambda d: see0(d)["what"]["src"][0].__setitem__("url", "http://example.com/"), {"https で始まらない"}, set()),
        ("見た日を外す", lambda d: see0(d)["what"]["src"][0].pop("seen"), {"見た日が無い"}, set()),
        ("店の座標を外す", lambda d: [store0(d).pop("lat"), store0(d).pop("lon")], {"座標の無い店"}, {"CSV を組めない"}),
        ("店がオフリドの座標", lambda d: store0(d).__setitem__("lat", 41.112794), {"枠の外"}, csv_only),
        ("座標の出どころを外す", lambda d: store0(d).pop("coord_src"), {"座標の出どころ"}, set()),
        ("行ったの行が無い", lambda d: d["todo"][0]["went"]["facts"][0].__setitem__("id", "XXXXXXXXXXX@1#place"), {"facts の行に辿れない"}, set()),
        ("行ったが確かめの要る行", lambda d: d["todo"][0]["went"]["facts"].__setitem__(0, fact_of(verify_id)), {"確かめが要る行"}, {"合わない"}),
        ("行ったがチャットの行", lambda d: d["todo"][0]["went"]["facts"].__setitem__(0, fact_of(via_id)), {"チャットが出どころ"}, {"合わない", "確かめが要る行"}),
        ("時刻がずれた結び", lambda d: d["todo"][0]["went"]["facts"][0].__setitem__("ref", "10-01 0:00:01"), {"ref"}, set()),
        ("場面の URL がずれる", lambda d: d["todo"][0]["went"]["facts"][0].__setitem__("url", "https://www.youtube.com/watch?v=x"), {"url が配信の時刻"}, set()),
        ("オフリドの項目にスコピエの行", ohrid_item, {"行っていない街", "合わない"}, set()),
        ("スコピエの項目の街をオフリドに", lambda d: d["todo"][0].__setitem__("town", "ohrid"), {"行っていない街", "合わない"}, set()),
        ("渓谷の項目にスコピエの行", lambda d: matka(d)["went"].__setitem__("facts", [copy.deepcopy(skopje_went)]), {"合わない"}, {"went の行に無い"}),
        ("行ったを true に", lambda d: see0(d).__setitem__("went", True), {"went は false か"}, csv_only),
        ("好みの印を置く", lambda d: d["eat"]["items"][0].__setitem__("mark", "good"), {"好みの印"}, set()),
        ("ハブの項目を落とす", lambda d: d["eat"]["went_notes"].pop(0), {"引き継いでいない"}, set()),
        ("ハブに無い鍵", lambda d: see0(d)["from_hub"].append("see/nowhere"), {"ハブに無い鍵"}, set()),
        ("ひとことが26字", lambda d: d["cover"]["catch"][0].__setitem__("text", "あ" * 26), {"25字を超える"}, set()),
        ("札が61字", lambda d: d["about"]["cards"][0].__setitem__("text", "あ" * 61), {"60字を超える"}, set()),
        ("やりたいことが9", lambda d: d["todo"].extend(copy.deepcopy(d["todo"][:3])), {"8まで"}, set()),
        ("見出しが31字", lambda d: d["todo"][0].__setitem__("head", "あ" * 31), {"30字を超える"}, set()),
        ("エリアが3", lambda d: d["about"].__setitem__("areas", d["about"]["areas"][:3]), {"4〜6"}, set()),
        ("多角形が3点", lambda d: d["about"]["areas"][0]["range"].__setitem__("polygon", d["about"]["areas"][0]["range"]["polygon"][:3]), {"4〜8点"}, set()),
        ("ひとことが9個", lambda d: d["basics"]["guide"][5]["phrases"].pop(), {"10個"}, set()),
        ("実用ガイドが5つ", lambda d: d["basics"]["guide"].pop(0), {"6つ"}, {"引き継いでいない"}),
        ("豚が null で理由なし", lambda d: next(it for it in d["eat"]["items"] if not it.get("pork_note")).__setitem__("pork", None), {"pork_note"}, set()),
        ("写真が ND", lambda d: d["todo"][0]["photo"]["commons"][0].__setitem__("lic", "CC BY-ND 4.0"), {"自由に使えるライセンス"}, set()),
        ("予算の足し算", lambda d: d["basics"]["budget"]["days"][0].__setitem__("total_yen", 9999), {"足し算"}, set()),
        ("写真が NC", lambda d: d["todo"][0]["photo"]["commons"][0].__setitem__("lic", "CC BY-NC 4.0"), {"自由に使えるライセンス"}, set()),
        ("行ったのに場面が無い", lambda d: d["todo"][0].pop("scene"), {"場面（scene）が無い"}, set()),
        ("場面が went に無い行", lambda d: d["todo"][0]["scene"].__setitem__("id", d["see"][2]["went"]["facts"][0]["id"]), {"went の行に無い"}, {"食い違う"}),
        ("行っていない項目にショート", lambda d: next(t for t in d["todo"] if not t["went"]).__setitem__("short", "frcgM9wiRr8"), {"行っていない項目に"}, set()),
        ("無いショート", lambda d: next(t for t in d["todo"] if t.get("short")).__setitem__("short", "XXXXXXXXXXX"), {"shorts.ts に無い"}, {"当てた理由"}),
        ("ほかの国のショート", lambda d: next(t for t in d["todo"] if t.get("short")).__setitem__("short", "qcWK52DE0X8"), {"北マケドニアのショートでない"}, {"当てた理由"}),
        ("ショートに理由が無い", lambda d: [s.pop("basis", None) for s in d["shorts"]["items"]], {"当てた理由"}, set()),
        ("写真の元の幅が無い", lambda d: d["todo"][0]["photo"]["commons"][0].pop("w"), {"元の幅"}, set()),
        ("写真の幅が勝手", lambda d: d["todo"][0]["photo"]["commons"][0]["thumbs"].__setitem__("500", "https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/x.jpg/400px-x.jpg"), {"500 幅"}, set()),
    ]


def main() -> int:
    ok: list[str] = []
    ng: list[str] = []
    if not REAL.exists():
        print(f"::error::本物の材料が無い: {REAL}")
        return 2
    real = json.loads(REAL.read_text(encoding="utf-8"))
    with tempfile.TemporaryDirectory() as t:
        tmp = Path(t)
        # 通るはずのもの: 本物の材料
        errs = run(copy.deepcopy(real), tmp)
        (ok if not errs else ng).append(f"本物の材料が通る（{len(errs)}件: {errs[:3]}）")
        for name, edit, want, allow in cases(real):
            d = copy.deepcopy(real)
            edit(d)
            errs = run(d, tmp)
            hit = {w for w in want if any(w in e for e in errs)}
            stray = [e for e in errs if not any(w in e for w in want | allow)]
            good = hit == want and not stray
            (ok if good else ng).append(f"{name}: 出てほしい {sorted(want)} / 出た {sorted(hit)} / ほかの札 {stray[:2]}")
        # CSV が古い
        errs = run(copy.deepcopy(real), tmp, csv_edit=lambda m: (m / "see.csv").write_text("古い\n", encoding="utf-8"))
        (ok if any("CSV が材料と食い違う" in e for e in errs) and len(errs) == 1 else ng).append(f"CSV が古い: {errs[:2]}")
        # 材料が無いときは 2
        with contextlib.redirect_stdout(io.StringIO()):
            rc = gb.main(["--book", str(tmp / "none.json"), KEY])
        (ok if rc == 2 else ng).append(f"材料が無いと 2（{rc}）")
    for line in ok:
        print(f"  ok  {line}")
    for line in ng:
        print(f"::error::{line}")
    print(f"\n対照 {len(ok) + len(ng)}件中 {len(ok)}件通った")
    if len(ok) + len(ng) == 0:
        print("::error::対照が0件です")
        return 2
    return 1 if ng else 0


if __name__ == "__main__":
    sys.exit(main())
