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

## 本物の PR にも当てる

こしらえた本文だけだと、**このリポジトリで実際にどうなるか**が分からない。
直近の PR から写した本文（節番号だけを指しているもの）を置いてあって、
そこで落ちないことまで見る。落ちるようなら、狭くした意味が無い。
"""

import sys

sys.path.insert(0, __file__.rsplit("/", 1)[0])

from closes_check import (  # noqa: E402
    closed_by, excused, missing, referenced, report,
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


def case_control() -> None:
    """**対照。** 狭くしすぎ／広げすぎの両方を当てる。"""
    print("\n[5] 対照")
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


def main() -> int:
    print("=== Closes の見張りを、こしらえた本文で確かめる ===")
    print("（GitHub に1バイトも出ません）")
    case_parts()
    case_catches()
    case_quiet()
    case_report()
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
