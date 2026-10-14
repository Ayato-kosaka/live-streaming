"""`python/recipe_lag_watch.py` の見張り。

    python3 python/recipe_lag_watch_selftest.py

## 対照

数えるだけの道具は、数えかたが壊れると静かに通る。**先に落ちることを見る。**

  wide  … `ご飯|料理` まで拾う広い当てかたに戻す → イラン歩き旅を丸ごと拾う。
          外れが出ることを、この見張りが言えなければ意味がない
  nodays… 「何日たったら」をやめる → 今日やった配信まで「遅れている」と言う
  noempty… 数えるものが無くても 2 を出さない → 焼けていないのが片づいたに見える

終了コード 0=通った / 1=落ちた。
"""

import os
import re
import sys
import tempfile
from datetime import date
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

import recipe_lag_watch as R  # noqa: E402

BREAK = os.environ.get("BREAK", "")
bad = 0


def ok(name, got, want):
    global bad
    good = got == want
    print(f"  {'○' if good else '✕'} {name}: {got}" + ("" if good else f"（欲しかったのは {want}）"))
    if not good:
        bad += 1
        print(f"::error::{name}: 出た={got} / 欲しかったのは={want}")


if BREAK == "wide":
    R.COOK = re.compile(r"クッキング|作ろ|つくろ|作りま|つくりま|料理|ごはん|ご飯|飯作|自炊")

print("[1] 題名から料理の名前を読む")
CASES = [
    ("アルバニアでチーズケーキつくろか！", "チーズケーキ"),
    ("カズベキでアクアパッツァの材料買います", "アクアパッツァの材料買いま"),
    ("北欧旅まであと２日！トトロクッキング！", "トトロクッキング"),
]
for title, _ in CASES:
    g = R.guess(title)
    # **「当たっているか」ではなく「何か返すか」を見る。** 当てる道具ではない
    ok(f"候補が出る: {title[:20]}", bool(g), True)
# 読めないものは空を返す。**当てずっぽうを返さない**のがこの道具の要
ok("読めないものは空", R.guess("あ"), "")
ok("長すぎるものは空", R.guess("あ" * 40), "")

print("[2] 本物の焼き込みで、いま遅れが無い")
late = R.lagging(R.DEFAULT_DAYS)
ok("遅れ 0件", len(late), 0)

print("[3] 対照：図鑑から10月の2品を抜いたら、鳴るか")
# **本物のファイルは触らない。** 読んだ字から videoId を抜いて、戻り値だけ差し替える
real = R.recipe_videos(R.RECIPES.read_text(encoding="utf-8"))
keep = R.recipe_videos
try:
    R.recipe_videos = lambda src: real - {"yGEacTlskmY", "0BqO781Gq2Q"}
    out = R.lagging(R.DEFAULT_DAYS)
    got = {r["videoId"] for r in out}
    ok("**抜いた2本が鳴る**", got, {"yGEacTlskmY", "0BqO781Gq2Q"})
    g = {r["videoId"]: r["guess"] for r in out}
    ok("チーズケーキの名前が題名から読める", "チーズケーキ" in g.get("yGEacTlskmY", ""), True)
finally:
    R.recipe_videos = keep

print("[4] 対照：広い当てかたに戻すと、料理でない回を拾う")
wide = re.compile(r"クッキング|作ろ|つくろ|作りま|つくりま|料理|ごはん|ご飯|飯作|自炊")
rows = R.streams(R.STREAMS.read_text(encoding="utf-8"))
miss = [t for _, v, t in rows if v not in real and wide.search(t)]
# イラン歩き旅（「一緒にご飯食べにイランまで歩く」）が入っていること。
# **広い当てかたが駄目な理由を、この見張りが実測で持っている**
ok("広い当てかたは料理でない回を拾う（だから狭めた）", len(miss) >= 10, True)
ok("いまの当てかたは拾わない", len([t for _, v, t in rows if v not in real and R.COOK.search(t)]),
   0 if BREAK != "wide" else len(miss))

print("[5] 数えるものが無ければ 2")
with tempfile.TemporaryDirectory() as tmp:
    empty = Path(tmp) / "x.ts"
    empty.write_text("export const CITY_STREAMS = {};\n", encoding="utf-8")
    keep_s = R.STREAMS
    try:
        R.STREAMS = empty
        sys.argv = ["recipe_lag_watch.py"]
        code = R.main()
    finally:
        R.STREAMS = keep_s
    ok("**0件ではなく 2 で止まる**", code, 2)

print()
print(f"{'✕ ' + str(bad) + '件 落ちた' if bad else '○ ぜんぶ通った'}")
sys.exit(1 if bad else 0)
