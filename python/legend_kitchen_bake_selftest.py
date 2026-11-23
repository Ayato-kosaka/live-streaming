"""`python/legend_kitchen_bake.py`（ノマドキッチンカーの面の中身を材料から焼く道具）の見張り。

    python3 python/legend_kitchen_bake_selftest.py

終了コード 0=通った / 1=落ちた / 2=数えるものが無い（材料が無い）。

## なぜ要るか（2026-11-23）

焼く道具は `--check` と終了コード 0/1/2 を持つ判定器なので、どこからも走らないと `python/watch_census_selftest.py` に止められる
（インドの `legend_book_bake_selftest.py` と同じ理由）。走っていても、材料が崩れたときに止まらなければ守りは空回りする。
だから本物で通り、壊した写しで止まることを、毎 PR の回し役（`python/selftest_runner.py`）で見る。1秒ほどで終わる。

## 何を見るか

1. **本物**: 焼いてあるもの（`site/content/legends/nomad-kitchen-car.ts`）が今の材料と同じ（`--check` が 0）。
   材料を直して焼き直し忘れると、面が古い字のまま出る
2. **対照**（材料の写しを壊して、止まるか。どれも 1 で、何も書かない）:
   材料の確かめが落ちる（暮らしの課題を1件消す・題に「あと◯日」）／組んだ最初の値がつまみの幅の外（売る数の上を、最初の1匹の
   売れる数より小さくする）／材料に書いた最初の値が刻みの上に無い（走る距離）／写真の許諾が足りない。材料が無い → 2
3. **式の手本**: 2つの最初の結果を比べる口が、違う2つを違うと言う。ひとことは先に当たったもの1つ（赤字が先）
4. **ひとことの表**: つまみの格子を全部回して、7つのどれかに必ず落ちる（数の合計が格子の数と同じ）
"""

from __future__ import annotations

import contextlib
import copy
import io
import itertools
import json
import shutil
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import legend_kitchen_bake as kb  # noqa: E402

bad = 0


def ok(name: str, got, want) -> None:
    global bad
    good = got == want
    print(f"  {'○' if good else '✕'} {name}: {got!r}{'' if good else f'（欲しかったのは {want!r}）'}")
    if not good:
        bad += 1
        print(f"::error::{name}: 出た={got!r} 欲しかったのは={want!r}")


if not (kb.DATA / "book.json").exists():
    print(f"::error::材料（{kb.DATA / 'book.json'}）が無い。数えられないので 2 で止める")
    sys.exit(2)

print("[1] 本物: 焼いてあるものが今の材料と同じ")
with contextlib.redirect_stdout(io.StringIO()):
    rc = kb.bake(check=True)
    named = kb.main([kb.SLUG, "--check"])
    other = kb.main(["india-street-food", "--check"])
ok("焼き直しが要らない（--check）", rc, 0)
ok("企画を名指ししても同じ（heavy_watch の legend の口の形）", named, 0)
ok("ほかの企画を名指しすると、焼かずに 2", other, 2)

print("[2] 対照: 材料の写しを壊すと、何も書かずに止まる")
real_book = json.loads((kb.DATA / "book.json").read_text(encoding="utf-8"))
real_photo = [{
    "id": f"p{i}", "img": f"https://upload.wikimedia.org/x/960px-p{i}.jpg", "thumb": f"https://upload.wikimedia.org/x/500px-p{i}.jpg",
    "page": f"https://commons.wikimedia.org/wiki/File:p{i}.jpg", "by": "撮った人", "lic": "CC BY-SA 4.0", "alt": "キッチンカー",
    "w": 960, "h": 640, "checked": "2026-11-23",
} for i in range(4)]


def run(mut=None, photos=None) -> tuple[int, bool]:
    with tempfile.TemporaryDirectory() as d:
        base = Path(d)
        shutil.copy(kb.DATA / "art_order.json", base / "art_order.json")
        b = copy.deepcopy(real_book)
        if mut:
            mut(b)
        (base / "book.json").write_text(json.dumps(b, ensure_ascii=False), encoding="utf-8")
        if photos is not None:
            (base / "photos.json").write_text(json.dumps(photos, ensure_ascii=False), encoding="utf-8")
        out = base / "out.ts"
        # 壊した写しの止まりかた（`::error::` の行）は、ここでは読み捨てる（CI の注に出さない）
        with contextlib.redirect_stdout(io.StringIO()):
            rc = kb.bake(src=base, out=out)
        return rc, out.exists()


def input_of(b: dict, key: str) -> dict:
    return next(x for x in b["money"]["inputs"] if x["id"] == key)


ok("そのままの写しは焼ける", run(), (0, True))
ok("写真4枚を足した写しも焼ける", run(photos=real_photo), (0, True))
ok("暮らしの課題が1件足りない（材料の確かめが落ちる）", run(lambda b: b["issues"]["life"].pop()), (1, False))
ok("題に「あと3日」", run(lambda b: b["shorts"]["titles"].__setitem__(0, "あと3日でヨーロッパへ")), (1, False))
ok("最初の1匹の売れる数が、売る数のつまみの上を超える", run(lambda b: input_of(b, "sold").update(max=30)), (1, False))
ok("材料に書いた走る距離が、刻みの上に無い", run(lambda b: input_of(b, "drive-km").update(default=55)), (1, False))
ok("写真の許諾が足りない", run(photos=[{**real_photo[0], "lic": "All rights reserved"}, *real_photo[1:]]), (1, False))
with tempfile.TemporaryDirectory() as d:
    with contextlib.redirect_stdout(io.StringIO()):
        rc = kb.bake(src=Path(d), out=Path(d) / "out.ts")
    ok("材料が無い", rc, 2)

print("[3] 式の手本")
r0, v0, d0 = kb.starts(real_book)
ok("2つの最初の結果は同じ（本物）", kb.same_left(r0["left"], d0["left"]), True)
ok("違う2つの結果は違うと言う", kb.same_left(r0["left"], r0["left"] + 0.5), False)
base_r = {"left": 10.0, "sold": 30, "cap": 300, "demand": 30, "pricey": False, "unknown": False, "rate": 0.9}
ok("赤字が先（ほかに当たっても）", kb.say({**base_r, "left": -1.0, "pricey": True, "unknown": True, "rate": 0.1}), "loss")
ok("焼くのが追いつかない", kb.say({**base_r, "sold": 300, "demand": 400}), "bake")
ok("人が足りない", kb.say(base_r), "crowd")
ok("中身が分かりにくい", kb.say({**base_r, "demand": 250, "sold": 250, "unknown": True}), "unknown")
ok("うまく回る", kb.say({**base_r, "demand": 250, "sold": 250}), "good")
ok("刻みに丸める（0.5 は上へ）", (kb.snap(37.5, 1), kb.snap(0.325, 0.01), kb.snap(0.26 * 8, 0.1)), (38, 0.33, 2.1))

print("[4] ひとことの表: 格子を全部回して、7つのどれかに落ちる")
_, count = kb.say_table(real_book)
m = kb.Model(real_book)
pr = m.inputs["price"]
n_price = round((pr["max"] - pr["min"]) / pr["step"]) + 1
grid = sum(
    sum(1 for k in (1, 2, 3) for _ in itertools.combinations([i for i, x in m.fills.items() if f in x["foods"]], k))
    for f, food in m.foods.items() if food["sim"]
) * n_price * len(m.places)
ok("数の合計が格子の数と同じ", sum(count.values()), grid)
ok("ひとことの鍵は7つ", sorted(count), sorted(kb.SAY_ORDER))

print(f"\n{'通った' if not bad else f'{bad}件 落ちた'}")
sys.exit(1 if bad else 0)
