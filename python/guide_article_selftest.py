"""**旅のガイドの記事の道具（`python/guide_article.py`）が、崩した台本と崩した面をその足で落とすか。**

    python3 python/guide_article_selftest.py

終了コード 0=通った / 1=落ちた / **2=数えるものが無い**（`docs/island-standards.md` §15）。

ネットワークも書き出しも要らない。台本は本物（`python/data/guide/north-macedonia/skopje/prices.json`）を
写して1か所ずつ崩し、焼いた先は一時の置き場に向ける（リポジトリの焼いたものは書き換えない）。
面は小さな HTML をこしらえる。facts は本物の `streams/` を読む（0行なら 2 で落ちる）。

## 何を見るか

| 足 | 崩しかた | 落ちるところ |
| --- | --- | --- |
| （素） | 崩さない | 焼ける・見て通る（落ちすぎない） |
| 確かめが要る行 | 表の行を `verify` の行に結ぶ | 焼くとき |
| `numbers` | 地の文の額を、結んだ行に無い額に書き換える | 焼くとき |
| `quotes` | 1つの節に一言を2つ置く | 焼くとき・見るとき |
| 口調 | 地の文に「おすすめ」 | 焼くとき |
| `sum` | 足し算の合計の字を、部品の和と違う額にする | 見るとき |
| `rowlink` | 表の行から場面のリンクを外す（額の無い行） | 見るとき |
| 確かめが要る額 | 本文に、`verify` の行にしか無い額 | 見るとき（`guide_watch` の足） |

`BREAK` の名前が付いている足は、**その守りを抜くと同じ崩しが通ってしまう**ことまで見る
（落ちたのがその足のおかげだと分かるように。§15「対照は、足の数だけ用意する」）。
"""

from __future__ import annotations

import contextlib
import copy
import io
import json
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import guide_article as ga  # noqa: E402

ROOT = ga.ROOT
KEY = "north-macedonia/skopje/prices"
SCRIPT = ga.script_path(KEY)
TODAY = "2026-11-14"

bad = 0
seen = 0


def ok(name: str, got, want) -> None:
    global bad, seen
    seen += 1
    good = got == want
    print(f"  {'○' if good else '✕'} {name}: {got}{'' if good else f'（欲しかったのは {want}）'}")
    if not good:
        bad += 1
        print(f"::error::{name}: 出た={got} / 欲しかったのは={want}")


def quiet(fn, *a, **kw):
    buf = io.StringIO()
    with contextlib.redirect_stdout(buf):
        code = fn(*a, **kw)
    return code, buf.getvalue()


def bake_with(s: dict, brk: str = "") -> tuple[int, str]:
    with tempfile.TemporaryDirectory() as d:
        p = Path(d) / "prices.json"
        p.write_text(json.dumps(s, ensure_ascii=False), encoding="utf-8")
        if brk:
            ga.BREAK.add(brk)
        try:
            return quiet(ga.bake, KEY, today=TODAY, content=Path(d) / "out", script=p)
        finally:
            ga.BREAK.discard(brk)


def sec(s: dict, sid: str) -> dict:
    return next(x for x in s["sections"] if x["id"] == sid)


if not SCRIPT.exists():
    print(f"::error::台本が無い: {SCRIPT}")
    sys.exit(2)
BASE = json.loads(SCRIPT.read_text(encoding="utf-8"))

print("[1] 焼く: 崩していない台本は焼ける。リポジトリの焼いたものと同じ")
code, out = bake_with(BASE)
ok("素の台本", code, 0)
code, out = quiet(ga.bake, KEY, check=True)
ok("焼いたものが台本・材料と同じ（違えば python3 python/guide_article.py で焼き直す）", code, 0)

print("[2] 焼く: 崩した台本を落とす")
s = copy.deepcopy(BASE)
sec(s, "super")["table"]["rows"][0]["ref"] = "10-13 1:48:10"   # スーパーの会計（字幕が崩れて確かめが要る行）
code, out = bake_with(s)
ok("確かめが要る行に結んだ表", (code, "確かめが要る行" in out), (1, True))

s = copy.deepcopy(BASE)
blk = sec(s, "super")["body"][1]
blk["text"] = blk["text"].replace("100円。", "120円。")
code, out = bake_with(s)
ok("結んだ行に無い額", (code, "言っていない数" in out), (1, True))
code, _ = bake_with(s, "numbers")
ok("  BREAK=numbers なら通ってしまう（落としたのはこの足）", code, 0)

s = copy.deepcopy(BASE)
sec(s, "stay")["body"].append({"quote": "10-12 1:08:30#stay"})
code, out = bake_with(s)
ok("1節に一言2つ", (code, "1節に1つまで" in out), (1, True))
code, _ = bake_with(s, "quotes")
ok("  BREAK=quotes なら通ってしまう", code, 0)

s = copy.deepcopy(BASE)
sec(s, "super")["body"][0]["text"] += "おすすめ。"
code, out = bake_with(s)
ok("説明口調", (code, "説明口調" in out), (1, True))

print("[3] 見る: こしらえた面")
SUM_OK = 'data-sum="2400" data-parts="UQdkUSro9Ck:5910,CKJvprUMOgA:7680"'


def page(*, sum_attr: str = SUM_OK, sum_text: str = "約2,400円", extra: str = "", link: bool = True) -> str:
    row_link = '<a href="https://www.youtube.com/watch?v=NY9pzYrA-5o&amp;t=1260s">10/12</a>' if link else ""
    return (
        "<html><head><title>スコピエの物価</title></head><body>"
        '<article class="tg ta">'
        f'<section id="answer"><p>自炊なら1日 {sum_text}。</p><b {sum_attr}>{sum_text}</b>'
        "<ul><li>宿1泊 約1,400円</li><li>スーパーの買い出し1回 約1,000円</li></ul></section>"
        '<section id="super"><table><tbody>'
        '<tr><th>パスタ</th><td>75円</td><td><a href="https://www.youtube.com/watch?v=NY9pzYrA-5o&amp;t=1260s">10/12</a></td></tr>'
        f"<tr><th>城塞</th><td>無料</td><td>{row_link}</td></tr>"
        "</tbody></table>"
        '<a href="https://www.youtube.com/watch?v=NY9pzYrA-5o&amp;t=1290s">「<span data-quote="ayato">ディスカウントスーパーがある国が安いね</span>」</a>'
        f"{extra}</section></article></body></html>"
    )


def look(html: str, brk: str = "") -> tuple[int, str]:
    with tempfile.TemporaryDirectory() as d:
        p = Path(d) / "travel" / f"{KEY}.html"
        p.parent.mkdir(parents=True)
        p.write_text(html, encoding="utf-8")
        if brk:
            ga.BREAK.add(brk)
        try:
            return quiet(ga.watch, KEY, Path(d), ROOT / "streams")
        finally:
            ga.BREAK.discard(brk)


code, out = look(page())
ok("素の面", code, 0)
if code != 0:
    print(out)

code, out = look(page(sum_attr='data-sum="2500" data-parts="UQdkUSro9Ck:5910,CKJvprUMOgA:7680"', sum_text="約2,500円"))
ok("部品の和と違う合計", (code, "足し直した" in out), (1, True))
code, _ = look(page(sum_attr='data-sum="2500" data-parts="UQdkUSro9Ck:5910,CKJvprUMOgA:7680"', sum_text="約2,500円"), "sum")
ok("  BREAK=sum なら通ってしまう", code, 0)

code, out = look(page(extra='<a href="https://www.youtube.com/watch?v=UQdkUSro9Ck&amp;t=5910s">「<span data-quote="ayato">あのホステルめっちゃ良かった</span>」</a>'))
ok("1節に一言2つ（面）", (code, "1節に1つまで" in out), (1, True))
code, _ = look(page(extra='<a href="https://www.youtube.com/watch?v=UQdkUSro9Ck&amp;t=5910s">「<span data-quote="ayato">あのホステルめっちゃ良かった</span>」</a>'), "quotes")
ok("  BREAK=quotes なら通ってしまう", code, 0)

code, out = look(page(link=False))
ok("場面のリンクの無い表の行", (code, "場面のリンクが無い" in out), (1, True))
code, _ = look(page(link=False), "rowlink")
ok("  BREAK=rowlink なら通ってしまう", code, 0)

code, out = look(page(extra="<p>パンは1,600円もした。</p>"))
ok("確かめが要る行にしか無い額", (code, "確かめが要る行" in out), (1, True))

code, out = look(page().replace('class="tg ta"', 'class="ta"'))
ok("本文（article.tg）の無い面を通さない", code, 2)

print(f"見た {seen} 通り・落ちた {bad}")
if not seen:
    sys.exit(2)
sys.exit(1 if bad else 0)
