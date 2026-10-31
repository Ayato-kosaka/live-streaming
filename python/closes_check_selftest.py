"""`Closes #NNN` の見張りを、こしらえた PR の本文で確かめる。

    python3 python/closes_check_selftest.py

**GitHub に1バイトも出ない。** 素の関数だけを呼ぶ。

終了コード 0=通った / 1=落ちた / **2=数えるものが無い**。

## 両側から当てる

- **抜けているものを見つける**（開いた issue を指していて `Closes` が無い）
- **関係ない PR で落ちない**（`docs/island-misses.md` の節番号・閉じた issue・
  `Closes` が付いているもの・逃がしの1行）

片側だけだと、`missing()` を `return []` に書き換えても通る。
落ちない側だけを見ても、いつも落ちる見張りと区別がつかない。

## ページ送りも当てる（2026-10-26）

開いている issue は `open_numbers_from_github()` が1ページ100本ずつ引き、
**100本に満たないページが来たら止まる**（`if len(got) < 100`）。ここが狂うと、

- 止まるのが早い … 101本目からが「閉じている issue」に見えて、`Closes` の抜けを素通りする
- 止まらない … 99本しか無いのに10ページ叩く（毎 PR で GitHub の上限を食う）

本体で比べているところは、門を除けばこの1行だけで、ここまでは見ていなかった
（`mutation_drill.py` でひっくり返して緑のままだった）。
`urlopen` を偽の口に差し替えて、99本・ちょうど100本・101本・PR 混じりの100本・
いつまでも満杯、を返し、**何ページ目まで頼んだか**と**何本引けたか**を当てる。
GitHub には出ない。

対照は [6] の「守りを外した写し」。本体の関数を字のまま写し、止まる行だけを
「止まらない」「1ページで止まる」に書き換えて同じ表に当て、**ページ送りの足だけが**落ちることを見る。

## 本物の PR にも当てる

こしらえた本文だけだと、**このリポジトリで実際にどうなるか**が分からない。
直近の PR から写した本文（節番号だけを指しているもの）を置いてあって、
そこで落ちないことまで見る。落ちるようなら、狭くした意味が無い。
"""

import inspect
import json
import re
import sys
import urllib.parse

sys.path.insert(0, __file__.rsplit("/", 1)[0])

import closes_check  # noqa: E402
from closes_check import (  # noqa: E402
    closed_by, excused, missing, open_numbers_from_github, referenced, report,
)

# いま開いている issue のつもりの番号
LIVE = [3, 11, 147, 450, 553]

FAILED = []
CHECKED = 0


def ok(cond: bool, what: str) -> None:
    global CHECKED
    CHECKED += 1
    print(f"  {'○' if cond else '✕'} {what}")
    if not cond:
        FAILED.append(what)


def case_parts() -> None:
    print("\n[1] 読みかた")
    ok(referenced("#450 を直した。#999 も見た") == {450, 999}, "番号を拾う")
    ok(referenced("https://example.com/issues/450#issuecomment-1") == set(),
       "URL の中の `#issuecomment-…` を番号と読まない")
    ok(closed_by("Closes #450") == {450}, "Closes を読む")
    ok(closed_by("closes #450\nFixes #553\nresolved #3") == {450, 553, 3},
       "Fixes / resolved も読む（大文字小文字は問わない）")
    ok(closed_by("#450 を直した") == set(),
       "「直した」では閉じない（GitHub が閉じてくれない書きかた）")
    ok(excused("#147 は閉じない") == {147}, "逃がしの1行を読む")
    # **囲いつきで断っても通る。** `REF` は囲いの中の番号も「触れている」と
    # 数えるので、逃がすほうが囲いを受けないと、このリポジトリのふだんの
    # 書きかた（`` `#804` ``）で断ったのに落ちる。2026-10-13 に PR 5本が
    # 続けてそれで赤くなった
    ok(excused("`#804` は閉じない") == {804}, "バッククォートで囲んだ番号でも逃げられる")
    ok(excused("#664 は閉じない。#804 も閉じない") == {664, 804},
       "2本目の「も閉じない」も読む")
    ok(excused("`#664` は閉じない。`#804` も閉じない") == {664, 804},
       "囲いと「も」が重なっても読む")
    # **逃がしは「閉じない」と書いたときだけ。** 近い字で勝手に逃がさない
    ok(excused("#147 を閉じる") == set(), "「閉じる」では逃げられない")
    ok(excused("#147 は閉じた") == set(), "「閉じた」でも逃げられない")


def case_catches() -> None:
    print("\n[2] 抜けているものを、ちゃんと見つける")
    ok(missing("#450 の地図を直した", LIVE) == [450],
       "開いた issue を指していて Closes が無ければ、見つける")
    ok(missing("#450 と #553 を直した", LIVE) == [450, 553],
       "2本とも見つける")
    ok(missing("Closes #450\n\nついでに #553 も触った", LIVE) == [553],
       "片方だけ Closes が付いていたら、残りを見つける")


def case_quiet() -> None:
    print("\n[3] 関係ない PR で落ちない（ここが狭さの本体）")
    ok(missing("図鑑のマスから絵がはみ出していたのを直す（#167）", LIVE) == [],
       "`docs/island-misses.md` の節番号（開いていない番号）では落ちない")
    ok(missing("Closes #450", LIVE) == [], "Closes が付いていれば通る")
    ok(missing("#147 と同じ形の読み方を使う。#147 は閉じない", LIVE) == [],
       "逃がしの1行を書けば通る")
    ok(missing("", LIVE) == [], "本文が空でも落ちない")
    ok(missing("#999 を見た", LIVE) == [], "閉じている issue を指しても落ちない")
    # 直近の PR から写した本文の形。**このリポジトリで実際に落ちないこと**
    real = ("`channel_alias` の読み方をそのまま使います"
            "（同じ規則の2つめの写しを作らない。#167 と同じ形）\n\n"
            "## 押してほしいもの\n\n- `Selftests` が緑\n")
    ok(missing(real, [3, 11, 450, 553]) == [],
       "実際の PR の書きぶりで落ちない（節番号だけを指している）")


def case_report() -> None:
    print("\n[4] 落ちたときに出す文")
    text = report([450, 553], 25)
    ok("Closes #450 #553" in text, "そのまま貼れる1行を出す")
    ok("閉じない" in text, "逃がし方も書いてある")
    ok("島-misses" not in text and "見ていません" in text,
       "節番号を見ていないことを断っている")


# ---- ページ送り（偽の口。GitHub には出ない） ----------------------------

#: (何を当てるか, ページごとの本数, 1ページ目のうち PR の本数, 頼むはずのページ, 引けるはずの issue の本数)
PAGE_TABLE = [
    ("99本 → 1ページ目で止まる", [99], 0, [1], 99),
    ("ちょうど100本 → 2ページ目を見て、空なので止まる", [100, 0], 0, [1, 2], 100),
    ("101本 → 2ページ目の1本まで引く", [100, 1], 0, [1, 2], 101),
    # 満杯かどうかは**落とす前の本数**で決まる。落としたあと（70本）で数えると、ここで止まる
    ("1ページ目に PR が30本混じっても、満杯なら2ページ目へ送る", [100, 5], 30, [1, 2], 75),
    ("いつまでも満杯 → 10ページで打ち切る", [100] * 12, 0, list(range(1, 11)), 1000),
]


class _Resp:
    def __init__(self, body: bytes) -> None:
        self.body = body

    def read(self) -> bytes:
        return self.body

    def __enter__(self):
        return self

    def __exit__(self, *_a) -> None:
        return None


class FakeGitHub:
    """`/repos/…/issues?page=N` に、決めた本数を返す偽の口。**頼まれたページを控える。**"""

    def __init__(self, sizes: list, prs: int = 0) -> None:
        self.sizes, self.prs = sizes, prs
        self.asked: list = []
        self.queries: list = []

    def urlopen(self, req, timeout=None):
        q = urllib.parse.parse_qs(urllib.parse.urlparse(req.full_url).query)
        page = int(q["page"][0])
        self.asked.append(page)
        self.queries.append(q)
        n = self.sizes[page - 1] if page <= len(self.sizes) else 0
        start = sum(self.sizes[:page - 1])
        rows = []
        for i in range(n):
            row = {"number": start + i + 1}
            if page == 1 and i < self.prs:
                row["pull_request"] = {"url": "https://example.invalid/pr"}
            rows.append(row)
        return _Resp(json.dumps(rows).encode("utf-8"))


def pull_pages(fetch, sizes: list, prs: int = 0):
    """`fetch(repo, token)` を偽の口に向けて呼ぶ。返すのは (引けた番号, 偽の口)。"""
    fake = FakeGitHub(sizes, prs)
    keep = closes_check.urllib.request.urlopen
    closes_check.urllib.request.urlopen = fake.urlopen
    try:
        got = fetch("Ayato-kosaka/live-streaming", "fake-token")
    finally:
        closes_check.urllib.request.urlopen = keep
    return got, fake


def page_misses(fetch) -> list:
    """`PAGE_TABLE` のうち、`fetch` が外したものの名前。"""
    bad = []
    for label, sizes, prs, want_pages, want_n in PAGE_TABLE:
        got, fake = pull_pages(fetch, sizes, prs)
        if fake.asked != want_pages or len(got) != want_n or len(set(got)) != len(got):
            bad.append(label)
    return bad


def case_pages() -> None:
    print("\n[5] 開いている issue を、ページを送って全部引く（偽の口。GitHub には出ない）")
    for label, sizes, prs, want_pages, want_n in PAGE_TABLE:
        got, fake = pull_pages(open_numbers_from_github, sizes, prs)
        ok(fake.asked == want_pages and len(got) == want_n and len(set(got)) == len(got),
           f"{label}（頼んだページ {fake.asked[:3]}{'…' if len(fake.asked) > 3 else ''}"
           f" {len(fake.asked)}枚 / 引けた {len(got)}本）")
    got, fake = pull_pages(open_numbers_from_github, [100, 1])
    ok(101 in got, "2ページ目の番号（#101）が、開いている issue に入る")
    ok(all(q.get("per_page") == ["100"] and q.get("state") == ["open"] for q in fake.queries),
       "1ページに100本ずつ、開いているものだけを頼む（満杯とみなす本数と同じ）")
    got, _ = pull_pages(open_numbers_from_github, [100, 5], 30)
    ok(not any(n <= 30 for n in got), "PR（1〜30番）は、開いている issue に数えない")


def case_control() -> None:
    """**対照。** 狭くしすぎ／広げすぎの両方を当てる。"""
    print("\n[6] 対照")
    # 何も見ない判定だと、[2] の3件が全部素通りする
    blind = lambda _t, _l: []  # noqa: E731
    slipped = [t for t in ("#450 の地図を直した", "#450 と #553 を直した")
               if not blind(t, LIVE) and missing(t, LIVE)]
    ok(len(slipped) == 2,
       "何も見ない判定にすると、抜けが2件とも素通りする（だから [2] が要る）")

    # 開いているかどうかを見ない（番号ならなんでも拾う）判定だと、
    # 節番号だけの PR まで赤くなる
    wide = sorted(referenced("図鑑のマスから絵がはみ出していたのを直す（#167）"))
    ok(wide == [167] and missing("図鑑の…（#167）", LIVE) == [],
       "開いているかを見ない判定にすると、節番号の PR まで赤くなる（だから [3] が要る）")

    # **守りを外した写し。** 本体の関数を字のまま写し、止まる行だけを書き換えて
    # [5] の表に当てる。本物のファイルは触らない
    src = inspect.getsource(open_numbers_from_github)
    stop = re.compile(r"if len\(got\) [^:\n]+:")
    found = stop.findall(src)
    ok(len(found) == 1, "本体に、満杯でないページで止まる行が1つある")
    if len(found) != 1:
        return

    def copy(cond: str):
        ns = dict(vars(closes_check))
        exec(compile(stop.sub(f"if {cond}:", src), closes_check.__file__, "exec"), ns)
        return ns["open_numbers_from_github"]

    ok(page_misses(copy(found[0][3:-1])) == [],
       "書き換えずに写しただけなら、[5] の表は全部通る（写しかたのせいで落ちていない）")
    endless = page_misses(copy("False"))
    ok("99本 → 1ページ目で止まる" in endless and "いつまでも満杯 → 10ページで打ち切る" not in endless,
       f"止まる行を外した写しは、99本でも10ページ叩く（落ちたのは {len(endless)}件。だから [5] が要る）")
    eager = page_misses(copy("True"))
    ok("101本 → 2ページ目の1本まで引く" in eager and "99本 → 1ページ目で止まる" not in eager,
       f"1ページで止まる写しは、101本目を取りこぼす（落ちたのは {len(eager)}件。だから [5] が要る）")


def main() -> int:
    print("=== Closes の見張りを、こしらえた本文で確かめる ===")
    print("（GitHub に1バイトも出ません）")
    case_parts()
    case_catches()
    case_quiet()
    case_report()
    case_pages()
    case_control()

    print()
    if CHECKED == 0:
        print("✕ 1件も見ていません（数えるものが無い）")
        return 2
    if FAILED:
        print(f"✕ {CHECKED}件中 {len(FAILED)}件 落ちました: {', '.join(FAILED)}")
        return 1
    print(f"○ {CHECKED}件ぜんぶ通りました（見つける側と、落ちない側の両方を見た）")
    return 0


if __name__ == "__main__":
    sys.exit(main())
