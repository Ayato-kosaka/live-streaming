"""**手で組んだ街の「行った」を焼く道具（`python/guidebook_went.py`）が、崩した組み立てをその1点で止めるか。**

    python3 python/guidebook_went_selftest.py

終了コード 0=通った / 1=落ちた / **2=数えるものが無い**（`docs/island-standards.md` §15）。

本物の組み立て（`python/data/guide/bulgaria/sofia/went.json`）と本物の facts を読み、**1点だけ崩した写し**を
一時の置き場で焼いて、止まる（1）かを見る。書くのは一時の置き場だけ（`site/content/` には書かない）。

## なぜ要るか

この道具が止めるから、面の「行った」の話に言っていない数が入らない・行っていない日の写真が乗らない・
確かめの済んでいない行が出ない。**止めなくなっても、焼けたものは同じ顔で焼ける。** 緑は「守れている」と
「何も見ていない」の2通りに読めるので、崩した写しを1つずつ当てる。

| 崩すもの | 守り |
| --- | --- |
| 話に、結んだ行に無い数 | 言っていない数を足さない（`guide_bake.Baker.allowed_numbers`） |
| カードの日が行った日に無い | 行った日の写真だけを、行った項目に |
| 一言を、本人の一言（quote）の無い場面の項目に | 一言の字は facts の場面の行から写す |
| 確かめが要る行（verify）を結ぶ | 確かめの済んでいない行を面に出さない |
| 場面が項目の行の外 | 場面のリンクは、その項目の行のうちの1つ |
| 話の行が項目の行の外 | 話は、その項目の行だけから |
| 使っていないカード | どこに出たかが追えない組み立てを残さない |
| 無い行 | 結びの打ち間違い |

最後に、指紋（最終更新）が中身の変わったときだけ進むかを見る。
"""

from __future__ import annotations

import copy
import contextlib
import io
import json
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import guide_bake as gb  # noqa: E402
import guidebook_went as gw  # noqa: E402

ROOT = gw.ROOT
KEY = "bulgaria/sofia"
REAL = ROOT / "python/data/guide" / KEY / gw.SCRIPT

CHECKED = 0
FAILED: list[str] = []


def ok(name: str, got, want) -> None:
    global CHECKED
    CHECKED += 1
    if got == want:
        print(f"  ○ {name}")
    else:
        print(f"  ✕ {name}（得た {got!r} / 欲しい {want!r}）")
        FAILED.append(name)


def bake(c: dict | None, d: Path, today: str = "2026-01-01") -> tuple[int, str]:
    """組み立て `c` を一時の置き場で焼く。`None` は組み立ての無い置き場"""
    p = d / "went.json"
    if c is None:
        p.unlink(missing_ok=True)
    else:
        p.write_text(json.dumps(c, ensure_ascii=False), encoding="utf-8")
    buf = io.StringIO()
    with contextlib.redirect_stdout(buf):
        code = gw.bake(KEY, today=today, content=d, script=p)
    return code, buf.getvalue()


if not REAL.exists():
    print(f"::error::本物の組み立てが無い（{REAL}）。見るものが無い")
    sys.exit(2)
base = json.loads(REAL.read_text(encoding="utf-8"))
items = base.get("items") or {}
if not items:
    print("::error::本物の組み立てに items が無い。見るものが無い")
    sys.exit(2)

print("[1] 本物の組み立ては焼ける・焼いてあるものと同じ")
with tempfile.TemporaryDirectory() as t:
    d = Path(t)
    code, out = bake(base, d)
    ok("本物の組み立ては 0 で焼ける", code, 0)
    g = gb.read_baked(gw.out_path(KEY, d)) or {}
    ok("行った項目が1つ以上焼けている（0なら何も見ていない）", len(g.get("items") or {}) > 0, True)
    ok("一言は facts から写っている（say に字がある）",
       all(v["went"]["say"] for v in (g.get("items") or {}).values() if "say" in v["went"]), True)
r = gw.bake(KEY, check=True)
ok("site/content の焼いたものが、いまの組み立てと facts と同じ（--check）", r, 0)


def first(pred) -> str | None:
    return next((k for k, v in items.items() if pred(k, v)), None)


def broken(name: str, mutate) -> None:
    c = copy.deepcopy(base)
    if mutate(c) is False:
        print(f"  ・ {name}: 崩せる項目が組み立てに無い（数えない）")
        return
    with tempfile.TemporaryDirectory() as t:
        code, _ = bake(c, Path(t))
    ok(f"{name} → 止める", code, 1)


print("[2] 1点だけ崩した写しを止める")


def add_number(c):
    k = first(lambda k, v: v.get("story"))
    if not k:
        return False
    c["items"][k]["story"][0]["text"] += "あやとは987回ここへ来た。"


def wrong_day(c):
    k = first(lambda k, v: v.get("card"))
    if not k:
        return False
    card = c["items"][k]["card"]
    c["cards"][card]["day"] = "2020-01-01"


def say_no_quote(c):
    for k, v in c["items"].items():
        sec, _, iid = k.partition("/")
        if not v["scene"].endswith("#quote"):
            c["say"][sec] = iid
            return None
    return False


def verify_row(c):
    # 確かめが要る行（verify）を1本、項目と話に結ぶ（同じ街の本物の facts から探す）
    w = gw.Went(KEY)
    held = next((fid for fid, x in w.rows.items() if x["hold"] == "verify"), None)
    if not held:
        return False
    k = next(iter(c["items"]))
    c["items"][k]["facts"].append(held)
    c["items"][k]["story"][0]["facts"].append(held)


def scene_outside(c):
    ks = list(c["items"])
    if len(ks) < 2:
        return False
    other = c["items"][ks[1]]["scene"]
    if other in c["items"][ks[0]]["facts"]:
        return False
    c["items"][ks[0]]["scene"] = other


def story_outside(c):
    ks = list(c["items"])
    other = next((f for k in ks[1:] for f in c["items"][k]["facts"] if f not in c["items"][ks[0]]["facts"]), None)
    if not other:
        return False
    c["items"][ks[0]]["story"][0]["facts"].append(other)


def unused_card(c):
    c["cards"]["selftest-unused"] = {"id": "x", "day": "2026-11-13", "alt": "x"}


def missing_row(c):
    k = next(iter(c["items"]))
    c["items"][k]["facts"].append("xxxxxxxxxxx@1#place")


broken("話に、結んだ行に無い数", add_number)
broken("カードの日が行った日に無い", wrong_day)
broken("一言を、本人の一言の無い場面の項目に", say_no_quote)
broken("確かめが要る行（verify）を結ぶ", verify_row)
broken("場面が項目の行の外", scene_outside)
broken("話の行が項目の行の外", story_outside)
broken("使っていないカード", unused_card)
broken("無い行を結ぶ", missing_row)

print("[3] 組み立てが無ければ 2（0件を合格にしない）")
with tempfile.TemporaryDirectory() as t:
    code, _ = bake(None, Path(t))
    ok("組み立てが無い → 2", code, 2)

print("[4] 最終更新は、中身が変わったときだけ進む")
with tempfile.TemporaryDirectory() as t:
    d = Path(t)
    bake(base, d, today="2026-01-01")
    bake(base, d, today="2026-02-02")
    ok("中身が同じなら、前の日のまま", (gb.read_baked(gw.out_path(KEY, d)) or {}).get("updated"), "2026-01-01")
    c = copy.deepcopy(base)
    k = first(lambda k, v: v.get("story"))
    c["items"][k]["story"][0]["text"] = c["items"][k]["story"][0]["text"].rstrip("。") + "だった。"
    bake(c, d, today="2026-03-03")
    ok("話の字が変われば、その日に進む", (gb.read_baked(gw.out_path(KEY, d)) or {}).get("updated"), "2026-03-03")

print()
if CHECKED == 0:
    print("✕ 1つも数えなかった。**「通りました」とは言わない**")
    sys.exit(2)
if FAILED:
    print(f"✕ {CHECKED}件みて、{len(FAILED)}件 落ちた")
    for n in FAILED:
        print(f"   - {n}")
    sys.exit(1)
print(f"○ {CHECKED}件ぜんぶ通った")
sys.exit(0)
