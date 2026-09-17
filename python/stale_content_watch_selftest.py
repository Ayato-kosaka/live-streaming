"""**`python/stale_content_watch.py` が、本当に鳴るか・本当に黙るかを両側から見る。**

    python3 python/stale_content_watch_selftest.py

終了コード 0=ぜんぶ通った / 1=外したものがある。

## なぜ「落ちるまで古くする」だけでは対照にならないか

`island-misses.md` #125 の決めごと1。はじめに書きかけたのは
「その本が赤くなるまで、日付を1日ずつ古くする」だけだった。**それだと
しきい値をゆるめても素通りする**——`recipes.ts` を 60日から 9999日にしても、
9999日古くすれば赤くなるので「効いている」と出る。

だからここは、**しきい値の値そのものから作らない数**を2つずつ持っている。

| | どこから来た数か |
| --- | --- |
| `green` | **実測した、正常な空き**（`recipes.ts` なら直近1年の2番目に長い空き44日） |
| `red` | **実際に止まっていた長さ**（`shorts.ts` なら #119 の127日より上の130日） |

`green` で鳴ったら狼少年、`red` で黙ったら寝ている。**どちらも落とす。**
しきい値を書き換えた人は、この表も一緒に見ることになる。

## 種は本番の `site/content/`

形を自分で書き起こすと、**読むほうの正規表現が本物に当たっているか**を
見ないまま通る。`kitchenTalk.ts` の鍵は `"slug": {`、`recipes.ts` の鍵は
`slug: "…"` で形が違うので、そこは本物で当てないと意味がない。

**先に「手をつけていない写しが、本番と同じ判定になること」を見る**（§15）。
写しを作る途中で壊れても終了コードは同じなので、そこを見ないと対照にならない。

## 終了コードは、口から実測する

判定だけ見て「2 を返すはず」と書かない。3通りの置き場を作って
`stale_content_watch.py` を**そのまま呼び、返ってきた数を見る**。
"""

from __future__ import annotations

import re
import shutil
import subprocess
import sys
import tempfile
from datetime import date, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from stale_content_watch import (  # noqa: E402
    BOOKS,
    CONTENT,
    COVERS,
    KEY_RE,
    KEYS,
    LATEST,
    SKIP,
    Facts,
    iter_string_dates,
    judge,
    scan,
    scan_dir,
)

REPO = Path(__file__).resolve().parent.parent
TODAY = date(2026, 9, 17)

# **しきい値から作らない2つの数。** 上の docstring を読んでから触る。
#   green … これだけ古くても「正常な空き」。鳴ったら狼少年
#   red   … これだけ古ければ「止まっている」。黙ったら寝ている
# 出どころは `site/content/*.ts` の日付の間隔を実測したもの（2026-09-17）。
TWO_SIDES: dict[str, tuple[int, int]] = {
    "recipes.ts": (44, 130),  # 実測の空き 44 / 58 / 68 / 102 / 127日
    "voices.ts": (48, 130),  # 48 / 57 / 94 / 106 / 180日
    "site.ts": (14, 60),  # 人が手で書く updatedAt。2週間は普通、2ヶ月は放置
    "streamTypes.ts": (28, 130),  # 直近1年の最大は28日
    "countries.ts": (120, 200),  # 最大120日（旅のあいだは増えない）
    "plans.ts": (30, 130),
    "apps.ts": (102, 200),  # 2026-02-26 → 06-08 の102日
    "chapters.ts": (126, 400),  # 章の間隔の中央値126日
    "legends.ts": (222, 400),  # 2025-05-07 → 12-15 の222日
    "shorts.ts": (45, 130),  # 130 は #119 の127日のすぐ上
    "chapterStreams.ts": (130, 400),  # 章が閉じる間隔は3〜6ヶ月
    # COVERS の2本は「あと何日ぶん残っているか」。負が古い側
    "nordic.ts": (5, -1),
    "nordicSun.ts": (5, -1),
}


def _rewrite_dates(src: str, when: date) -> str:
    """文字列リテラルの中の日付を、全部 `when` にする。**コメントは触らない。**

    読むほうと**同じ `iter_string_dates` を使う**。別の正規表現で書き換えると、
    「書き換えたつもりのところを読むほうが見ていない」がそのまま通る。
    """
    out = []
    at = 0
    for a, b, _ in iter_string_dates(src):
        out.append(src[at:a])
        out.append(when.isoformat())
        at = b
    out.append(src[at:])
    return "".join(out)


def _drop_key(src: str, name: str, key: str) -> str:
    """その本から鍵を1つ消す（行ごと）。`KEYS` の赤い側を作るのに使う。"""
    rx = KEY_RE[name]
    lines = [ln for ln in src.splitlines(keepends=True) if not (m := rx.match(ln)) or m.group(1) != key]
    return "".join(lines)


def _facts(name: str, src: str) -> Facts:
    """書き換えた字から `Facts` を作る。**読むほうの関数をそのまま通す。**"""
    f = Facts(name=name, found=True)
    seen = set()
    for _, _, s in iter_string_dates(src):
        try:
            seen.add(date(*map(int, s.split("-"))))
        except ValueError:
            pass
    f.dates = sorted(seen)
    if name in KEY_RE:
        f.keys = KEY_RE[name].findall(src)
    return f


def _status(seen: dict[str, Facts], name: str) -> str:
    v = judge(seen, TODAY)
    for r in v.results:
        if r.name == name:
            return r.status
    return "（表に無い）"


def main() -> int:
    src_of = {p.name: p.read_text(encoding="utf-8") for p in sorted(CONTENT.glob("*.ts"))}
    base = {n: _facts(n, s) for n, s in src_of.items()}

    ok: list[str] = []
    ng: list[str] = []

    def check(label: str, got, want) -> None:
        (ok if got == want else ng).append(f"{label}: 出た={got} ほしい={want}")

    # --- 0. 手をつけていない写しが、本番と同じ判定になるか（先に見る）---------
    real = judge(scan_dir(CONTENT), TODAY)
    copy = judge(base, TODAY)
    check("素の写しの赤が本番と同じ", copy.red, real.red)
    check("素の写しの数えられないが本番と同じ", copy.blind, real.blind)
    check("素の写しで見た本の数", len(copy.results), len(BOOKS))

    # --- 1. 判定する本が、表と食い違っていないか -----------------------------
    judged = {n for n, b in BOOKS.items() if b.rule != SKIP}
    dated = {n for n in judged if BOOKS[n].rule in (LATEST, COVERS)}
    check("両側の数を持っている本の数", sorted(TWO_SIDES), sorted(dated))

    # --- 2. しきい値そのものが動いていないか ---------------------------------
    # **`green` で鳴らず `red` で鳴る**、を日数の側からも押さえる。
    # ここが無いと、しきい値を1日にしても green の写しを作る側が一緒にずれる。
    for name, (green, red) in TWO_SIDES.items():
        b = BOOKS[name]
        if b.rule == LATEST:
            check(f"{name} のしきい値が実測の正常な空き({green}日)より広い", b.days >= green, True)
            check(f"{name} のしきい値が止まった長さ({red}日)より狭い", b.days < red, True)

    # --- 3. 本ごとに、正常な側と古い側の両方を当てる -------------------------
    for name, (green, red) in TWO_SIDES.items():
        b = BOOKS[name]
        for side, offset, want in (("正常", green, "通った"), ("古い", red, "赤")):
            if b.rule == LATEST:
                when = TODAY - timedelta(days=offset)
            else:  # COVERS は「あと何日ぶん残っているか」
                when = TODAY + timedelta(days=offset)
            seen = dict(base)
            seen[name] = _facts(name, _rewrite_dates(src_of[name], when))
            check(f"{name} を{side}側({offset}日)にしたとき", _status(seen, name), want)

        # ちょうどしきい値の日は鳴らさない（境界で1日ずれていないか）
        if b.rule == LATEST:
            seen = dict(base)
            seen[name] = _facts(name, _rewrite_dates(src_of[name], TODAY - timedelta(days=b.days)))
            check(f"{name} がちょうど{b.days}日前のとき", _status(seen, name), "通った")

    # --- 3b. コメントの中の日付を、中身と読んでいないか -----------------------
    # **ここが抜けると、いちばん静かに壊れる。** `chapterStats.ts` は冒頭に
    # 「数えた日: 今日」を書くし、どの本にも「あやと（2026-09-10）」のような
    # 注釈が入っている。拾ってしまうと、**中の数字が半年止まっていても
    # 「きのう誰かがコメントを直した」だけで新しく見える。**
    # 読み飛ばしを外しても上の対照は1件も落ちなかったので、名指しで足した。
    noise = TODAY.isoformat()
    for name in sorted(n for n in TWO_SIDES if BOOKS[n].rule == LATEST):
        red = TODAY - timedelta(days=TWO_SIDES[name][1])
        aged = _rewrite_dates(src_of[name], red)
        # **コメントの中の日付を、引用符ごと置く。** 引用符の無い注釈
        # （`数えた日: 2026-09-17`）は、そもそも文字列の外なので拾いようがない。
        # 危ないのは注釈の中に `"…"` が出てくるときで、コメントを読み飛ばさないと
        # そこが文字列に見える。実際に読み飛ばしを外して、ここだけが落ちる
        for label, comment in (
            ("行コメント", f'\n// 直した日は "{noise}"\n'),
            ("ブロックコメント", f'\n/* 前は date: "{noise}" と書いてあった */\n'),
            ("引用符のずれるコメント", f'\n/* don\'t 直した日は "{noise}" */\n'),
        ):
            seen = dict(base)
            seen[name] = _facts(name, comment + aged)
            check(f"{name} の{label}に今日の日付を足しても赤のまま", _status(seen, name), "赤")

    # 文字列の中の `//`（アイコンの URL）を、コメントの始まりと読まないか。
    # 読むと、そこから先の日付が丸ごと落ちて「日付0件」になる
    url = '[{ icon: "https://yt4.ggpht.com/x=s64", date: "2026-09-16" }]'
    check("文字列の中の URL の後ろの日付", [d.isoformat() for d in _facts("x.ts", url).dates], ["2026-09-16"])

    # --- 4. 鍵で見る本（①b）も両側から ---------------------------------------
    for name, b in BOOKS.items():
        if b.rule != KEYS:
            continue
        up = b.upstream
        # 正常な側: 上流から「下流に無い鍵」を消すと、欠けが0になる
        missing = [k for k in base[up].keys if k not in set(base[name].keys)]
        clean = src_of[up]
        for k in missing:
            clean = _drop_key(clean, up, k)
        seen = dict(base)
        seen[up] = _facts(up, clean)
        check(f"{name} の上流をそろえたとき", _status(seen, name), "通った")

        # 古い側: 下流から鍵を1つ落とすと赤
        seen = dict(base)
        seen[up] = _facts(up, clean)
        seen[name] = _facts(name, _drop_key(src_of[name], name, base[name].keys[0]))
        check(f"{name} から鍵を1つ落としたとき", _status(seen, name), "赤")

        # 上流が空なら「数えられない」（0件を通ったと読ませない。§15）
        seen = dict(base)
        seen[up] = Facts(name=up, found=True, dates=base[up].dates, keys=[])
        check(f"{name} の上流の鍵が0件のとき", _status(seen, name), "数えられない")

    # --- 5. 数えられない側 ---------------------------------------------------
    for name in sorted(dated):
        seen = dict(base)
        seen[name] = Facts(name=name, found=True, dates=[], keys=base[name].keys)
        check(f"{name} の日付が0件のとき", _status(seen, name), "数えられない")

    seen = dict(base)
    seen["newThing.ts"] = Facts(name="newThing.ts", found=True)
    check("表に無い本が置き場に増えたとき", bool(judge(seen, TODAY).blind), True)

    seen = {n: f for n, f in base.items() if n != "recipes.ts"}
    check("表に在る本が置き場から消えたとき", bool(judge(seen, TODAY).blind), True)

    # --- 6. 終了コードを、口から実測する -------------------------------------
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        green_dir = root / "green"
        shutil.copytree(CONTENT, green_dir)
        # 判定する本を全部「通る」側に寄せる。
        # **日付を先に、鍵をあとに書く。** `recipes.ts` は片方の本の上流で、
        # もう片方では日付で見る本。順を混ぜると、あとから書いたほうが
        # 先に直したところを元に戻す（実際に踏んだ）。
        for name, b in BOOKS.items():
            if b.rule == LATEST:
                (green_dir / name).write_text(
                    _rewrite_dates(src_of[name], TODAY - timedelta(days=1)), encoding="utf-8"
                )
            elif b.rule == COVERS:
                (green_dir / name).write_text(
                    _rewrite_dates(src_of[name], TODAY + timedelta(days=5)), encoding="utf-8"
                )
        for name, b in BOOKS.items():
            if b.rule != KEYS:
                continue
            up = b.upstream
            clean = (green_dir / up).read_text(encoding="utf-8")
            for k in [k for k in base[up].keys if k not in set(base[name].keys)]:
                clean = _drop_key(clean, up, k)
            (green_dir / up).write_text(clean, encoding="utf-8")

        red_dir = root / "red"
        shutil.copytree(green_dir, red_dir)
        (red_dir / "recipes.ts").write_text(
            _rewrite_dates(src_of["recipes.ts"], TODAY - timedelta(days=200)), encoding="utf-8"
        )

        blind_dir = root / "blind"
        shutil.copytree(green_dir, blind_dir)
        (blind_dir / "newThing.ts").write_text("export const X = 1;\n", encoding="utf-8")

        for label, d, want in (("通る", green_dir, 0), ("古い", red_dir, 1), ("数えられない", blind_dir, 2)):
            r = subprocess.run(
                [sys.executable, str(REPO / "python" / "stale_content_watch.py"),
                 "--dir", str(d), "--today", TODAY.isoformat()],
                capture_output=True, text=True,
            )
            check(f"口を叩いたときの終了コード（{label}）", r.returncode, want)

        # 置き場が空なら 2（数えるものが無い）
        empty = root / "empty"
        empty.mkdir()
        r = subprocess.run(
            [sys.executable, str(REPO / "python" / "stale_content_watch.py"), "--dir", str(empty)],
            capture_output=True, text=True,
        )
        check("置き場が空のときの終了コード", r.returncode, 2)

    # --- 出す ----------------------------------------------------------------
    print(f"対照 {len(ok) + len(ng)}件中 {len(ok)}件通った")
    for line in ng:
        print(f"::error::{line}")
    if not ok:
        print("::error::対照が0件です。種（site/content）が読めていません")
        return 1
    return 1 if ng else 0


if __name__ == "__main__":
    sys.exit(main())
