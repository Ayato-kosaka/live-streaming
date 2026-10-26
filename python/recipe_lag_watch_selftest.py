"""`python/recipe_lag_watch.py` の見張り。

    python3 python/recipe_lag_watch_selftest.py

## 対照

数えるだけの道具は、数えかたが壊れると静かに通る。**先に落ちることを見る。**

  wide  … `ご飯|料理` まで拾う広い当てかたに戻す → イラン歩き旅を丸ごと拾う。
          外れが出ることを、この見張りが言えなければ意味がない
  nodays… 「何日たったら」をやめる → 今日やった配信まで「遅れている」と言う
  noempty… 数えるものが無くても 2 を出さない → 焼けていないのが片づいたに見える
  onelayer… 題名の枕を1枚しかはがさない → 「【速報】アルバニアで…」の候補に枕が残る
  gate  … 本体を素のまま読み込む（下の `quiet()` を通さない）

`nodays` は [7] の表で落ちる。`noempty` は main の中の字なので、ここからは外せない（[5] が見ている）。

## 読み込んだだけで main に入ったら、そこで止めて赤くする（2026-10-26）

本体の末尾 `if __name__ == "__main__": sys.exit(main())` の門が逆さになると、
**`import` しただけで main が走り、その `sys.exit(0)` で見張りが判定を1つも出さずに緑で終わる。**
`mutation_drill.py` が本体の比較7か所を全部ひっくり返した写しがこれで緑のままだった
（ひっくり返した比較どうしが打ち消し合ったのではない。門だけを逆さにした写しも緑だった）。
だから本体は `quiet()` を通して読み込み、main に入ったらその場で 1 を返す。

終了コード 0=通った / 1=落ちた。
"""

import contextlib
import io
import os
import re
import sys
import tempfile
from datetime import date, timedelta
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

BREAK = os.environ.get("BREAK", "")
bad = 0

#: 本体を読み込むあいだだけ渡す、本体が知らない引数（`quiet()`）
IMPORT_GUARD = "--recipe-lag-watch-selftest-import-guard"


def quiet(load, brk=""):
    """`load()` を呼ぶ。そのあいだに本体の main が走り出したら、何もさせずに止める。

    引数を本体の知らない字にしておくので、main は argparse で止まり、焼き込みも読まない。
    抜けてきた `SystemExit` はここで受ける——受けないと、それがそのまま見張りの終了コードになる。

    Returns:
        (load の戻り値, main に入ったならその終了コード／入らなければ None)
    """
    if brk == "gate":  # 対照：守りを外す（直す前と同じ、素の読み込み）
        return load(), None
    argv = sys.argv[:]
    sys.argv = [argv[0], IMPORT_GUARD]
    try:
        with contextlib.redirect_stderr(io.StringIO()):  # argparse の使いかたの表示は要らない
            return load(), None
    except SystemExit as e:
        return None, e.code
    finally:
        sys.argv = argv


def load_body():
    import recipe_lag_watch  # noqa: E402

    return recipe_lag_watch


R, entered = quiet(load_body, BREAK)
if entered is not None:
    print(f"✕ recipe_lag_watch を読み込んだだけで main に入った（終了コード {entered}）。"
          "直に起こされたときだけ main に入るはずの門が開いている")
    print("::error::recipe_lag_watch: 読み込んだだけで main に入った")
    sys.exit(1)


def ok(name, got, want):
    global bad
    good = got == want
    print(f"  {'○' if good else '✕'} {name}: {got}" + ("" if good else f"（欲しかったのは {want}）"))
    if not good:
        bad += 1
        print(f"::error::{name}: 出た={got} / 欲しかったのは={want}")


if BREAK == "wide":
    R.COOK = re.compile(r"クッキング|作ろ|つくろ|作りま|つくりま|料理|ごはん|ご飯|飯作|自炊")
if BREAK == "onelayer":
    # 枕を1枚はがしたところで打ち切る。`guess` の字を写して直すと写しを試すことになるので、
    # 本体が回数に使っている `range` だけを差し替える
    R.range = lambda n: range(1)
if BREAK == "nodays":
    # 「何日たったら」を0日にする（今日の配信まで遅れに数える）
    R.timedelta = lambda days: timedelta(0)

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
# 枕が重なった題（本体の頭の説明にある「【速報】アルバニアで…」）。**1枚はがして止まらない**。
# 何か返すかだけを見ていると、枕が残ったまま「候補が出た」で通る
ok("重なった枕を全部はがす", R.guess("【速報】アルバニアでチーズケーキつくろか！"), "チーズケーキ")

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
# 本物の表で「拾わない」を見るときも、本体（`lagging`）と同じく配信から DEFAULT_DAYS 以内の回は数えない。
# 数えると、料理の配信があった翌日は図鑑に入るのを待っているだけで、毎回ここが赤くなる（#1015 で落ちた）
cut = date.today() - timedelta(days=R.DEFAULT_DAYS)


def settled(d: str) -> bool:
    try:
        return date.fromisoformat(d) <= cut
    except ValueError:
        return False


ok("いまの当てかたは拾わない", len([t for d, v, t in rows if v not in real and R.COOK.search(t) and settled(d)]),
   0 if BREAK != "wide" else len([t for d, v, t in rows if v not in real and wide.search(t) and settled(d)]))

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

print("[6] 対照：読み込んだだけで main に入る写しは、ここで止まる")
# 本体の門だけを逆さにした写しを、`quiet()` を通して読み込む。**本物のファイルは触らない**
GATE = 'if __name__ == "__main__":'
src = Path(R.__file__).read_text(encoding="utf-8")
ok("本体の末尾に門がある", GATE in src, True)
opened = src.replace(GATE, 'if __name__ != "__main__":')


def load_opened():
    ns = {"__name__": "recipe_lag_watch_opened", "__file__": R.__file__}
    exec(compile(opened, R.__file__, "exec"), ns)
    return ns


try:
    _, code = quiet(load_opened, BREAK)
    leaked = None
except SystemExit as e:  # 守りが無いと、写しの main の `sys.exit` がここまで抜けてくる
    code, leaked = None, e.code
ok("門の開いた写しは、main に入ったと分かる", code is not None, True)
ok("写しの終了コードが、この見張りの外へ抜けない", leaked, None)

print("[7] 作った表で、遅れの数えかたを当てる")
# 本物の焼き込みは毎晩変わるので、境目・図鑑にある/ない・料理の回か否か・重なり・読めない日付を
# 1行ずつ持った表を作って、鳴る回を名指しで当てる。今日を 10/20 に固定すると、3日の境目は 10/17。
# 料理の回の題は、いまの当てかたでも `wide` でも拾う字にしてある（`wide` の対照でここまで落ちないように）
TODAY = date(2026, 10, 20)
TABLE = [
    ("2026-10-17", "edge", "チーズケーキつくろか！"),     # ちょうど3日前 → 鳴る
    ("2026-10-18", "fresh", "チーズケーキつくろか！"),    # 2日前 → まだ待つ
    ("2026-10-10", "inbook", "トトロクッキング！"),        # 図鑑にある → 鳴らない
    ("2026-10-10", "talk", "北欧旅まであと２日！雑談"),     # 料理の回ではない → 鳴らない
    ("2026-10-12", "twice", "アクアパッツァつくります"),    # 2つの街に載っている → 1回だけ
    ("2026-10-12", "twice", "アクアパッツァつくります"),
    ("10月のどこか", "nodate", "トトロクッキング！"),       # 日付が読めない → 数えない
]
keep_v, keep_s = R.recipe_videos, R.streams
try:
    R.recipe_videos = lambda src: {"inbook"}
    R.streams = lambda src: list(TABLE)
    got = [r["videoId"] for r in R.lagging(R.DEFAULT_DAYS, today=TODAY)]
finally:
    R.recipe_videos, R.streams = keep_v, keep_s
ok("鳴るのは3日たった料理の回だけ、古い順に1回ずつ", got, ["twice", "edge"])

print()
print(f"{'✕ ' + str(bad) + '件 落ちた' if bad else '○ ぜんぶ通った'}")
sys.exit(1 if bad else 0)
