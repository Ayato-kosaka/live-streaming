#!/usr/bin/env python3
"""**キャラクターの箱を焼く関所（`charbox.judge`）が、断るときに断るかを見る。**

    python3 tools/sprites/charbox_selftest.py
    BREAK=count python3 tools/sprites/charbox_selftest.py   # 直す前の判定を当てる
    BREAK=blind  python3 tools/sprites/charbox_selftest.py  # 何でも通す判定を当てる

終了コード 0=通った / 1=落ちた / **2=数えるものが無い**（`docs/island-standards.md` §15）。

**網にも本番にも触らない。** 偽の id の集合だけで回る。`PIL` も偽物を
差し込んでから `charbox` を読むので、Pillow が入っていない箱でも動く
（判定は絵を1枚も開かない）。

## なぜ要るか

`tools/sprites/charbox.py` の関所は、**毎晩ひとりでに走って master へ
押し込む run（`.github/workflows/rebake.yml`）の中にしか無い。**
つまり読む人がいない。

2026-10-03 に、その関所が**自分では二度と緑にならない形**で止まっていた。
判定が「人数」だけを見ていた（`len(rows) < had` なら断る）ので、
**本当に人が消えた日から永久に断り続ける。**

| | 数（本番の実測。2026-10-03） |
| --- | --- |
| `characterBox.ts` の箱 | 103 |
| 口が返した人 | 100（4人が Firestore から消え、1人増えた） |

4人ぶん測れないのは当たり前なので毎晩断り、新しく入った1人の箱は永久に
焼かれず、`python/stale_content_watch.py` が毎晩赤くなっていた。
**4日以上、焼き直しのワークフローが赤で終わり続けた。**

直したあとの判定は「数」ではなく「人」で比べる。だから**両側から当てる**:

- **守りたかったもの**（口が落ちた・絵が落とせなかった回）は、そのまま断る
- **本当に消えた人**のぶんは、箱からも消えて先へ進む

片側だけ見ると、`judge()` を `return True, ""` に書き換えても通る。
断る側だけ見ても、何にでも赤を出す関所と区別がつかない。

## 判定の規則は、ここに書き写さない

`charbox` から `judge` と `FLOOR_SHARE` を**そのまま取り込んで**回す。
写すと、本体のしきい値を動かした日にここが黙って古いままになり、
**「通りました」が本体と関係ない字になる**（`docs/island-misses.md` #125 と同じ形）。
"""

import math
import os
import sys
import tempfile
import types

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

# **本物の Pillow を読まない。** 判定は絵を1枚も開かないので、
# ここで偽物を差し込んでおけば Pillow の無い箱でも回る
# （手本は `python/admin/` の見張りが `_fs` を差し替えてから import する形）。
_pil = types.ModuleType("PIL")
_image = types.ModuleType("PIL.Image")


def _never(*_a, **_k):
    raise AssertionError("見張りの中で絵を開こうとした（判定は絵を見ないはず）")


_image.open = _never
_pil.Image = _image
sys.modules["PIL"] = _pil
sys.modules["PIL.Image"] = _image

from charbox import EXPECT_ENV, FLOOR_SHARE, baked_ids, judge  # noqa: E402
import charbox  # noqa: E402


def _no_net(*_a, **_k):
    raise AssertionError("見張りの中で網に出ようとした")


# 判定は網に出ないが、**出られないことを機械で保証しておく**
charbox.fetch = _no_net

FAILED = []
CHECKED = 0

# ---- 仕込み。本番と同じ形（103箱 / 口100人 / 消えた4人 / 新しい1人）----
HAD = {f"old{i:03d}" for i in range(103)}        # いま入っている箱 103
GONE = {f"old{i:03d}" for i in range(4)}         # Firestore から消えた4人
NEW = {"cf129e7ea06f499693a002543dcd7c29"}       # 2026-10-02 に足した人
API = (HAD - GONE) | NEW                         # 口が返す 100人


def ok(cond: bool, what: str) -> None:
    global CHECKED
    CHECKED += 1
    print(f"  {'○' if cond else '✕'} {what}")
    if not cond:
        FAILED.append(what)


def ran(had, rows, api, expect=None) -> bool:
    """判定を1回回して、書いてよいかだけを返す。"""
    good, why = judge(had, rows, api, expect)
    print(f"      → {why}")
    return good


def case_gone() -> None:
    print("\n[1] 本当に消えた人のぶんは書ける（これが止まっていた）")
    # 口に居る100人は全員測れた。消える4箱は、口にも居ない
    ok(ran(HAD, API, API) is True,
       f"103箱・口100人・消えた4人が口にも居ない → 書く"
       f"（前の判定は {len(API)} < {len(HAD)} で断っていた）")


def case_unexplained() -> None:
    print("\n[2] まだ名簿に居るのに箱が消えるときは断る（守りたかったもの）")
    # 口には居るが絵が落とせなかった1人。既存の `no_art` がこの形で入る
    lost = "old050"
    ok(ran(HAD, API - {lost}, API) is False,
       f"絵が落とせなかった1人（口には居る）→ 断る")
    # 口が丸ごと落ちたのではなく、絵の置き場だけが落ちた回。
    # 口は 100人を返しているので床は通るが、測れたのは 0人
    ok(ran(HAD, set(), API) is False,
       "口は 100人を返したが1人も測れなかった（絵の置き場が落ちた）→ 断る")


def case_grow() -> None:
    print("\n[3] 増えるだけのときは通る")
    grown = HAD | {"brandnew001"}
    ok(ran(HAD, grown, grown) is True, "新しい人が1人足された → 書く")


def case_floor() -> None:
    print("\n[4] 口そのものが壊れている回は断る（床）")
    ok(ran(HAD, set(), set()) is False, "口が0人を返した → 断る")
    # 床がどこに在るかを実測で出す。**写さずに本体の `FLOOR_SHARE` から出す**
    floor = max(1, math.ceil(len(HAD) * FLOOR_SHARE))
    near = set(sorted(API)[:floor])
    under = set(sorted(API)[:floor - 1])
    ok(ran(HAD, near, near) is True,
       f"ちょうど床（口 {floor}人＝{len(HAD)}箱の {FLOOR_SHARE:.0%}）→ 書く")
    ok(ran(HAD, under, under) is False,
       f"床を1人割る（口 {floor - 1}人）→ 断る")
    # 箱が1つも無い初回でも、0人は通さない（空の表を焼かせない）
    ok(ran(set(), set(), set()) is False, "箱が0・口も0（初回に口が落ちた）→ 断る")


def case_waive() -> None:
    print(f"\n[5] 床は、数を見たうえでなら降ろせる（{EXPECT_ENV}）")
    few = set(sorted(API)[:50])
    ok(ran(HAD, few, few, "50") is True, "口50人・50 と書いた → 書く")
    ok(ran(HAD, few, few, "49") is False,
       "口50人・49 と書いた（数が合わない）→ 断る。置けば通る口にしない")
    # **0人は降ろせない。** ここを降ろせるようにすると、降ろす口が全消しの引き金になる
    ok(ran(HAD, set(), set(), "0") is False,
       "口0人・0 と書いた → それでも断る（0人は降ろせない）")


def case_same() -> None:
    print("\n[6] 何も変わらないときは通る")
    ok(ran(HAD, HAD, HAD) is True, "箱・測れた人・口が同じ103人 → 書く")


def case_parse() -> None:
    """**分母。** 箱の id が読めなければ、判定は何も守らない。

    `baked_ids()` が 0 を返すと `had` が空になり、床も 1人に落ちて
    **どんな焼き直しも通る。** 正規表現を1文字直せば黙ってそうなるので、
    本物のファイルに当たることと、`noArt` を箱と数えないことを見る。
    """
    print("\n[7] 箱の id の読みかた（これが外れると判定が何も守らない）")
    real = len(baked_ids())
    ok(real > 0, f"本物の `site/content/characterBox.ts` から {real}箱 読めた")
    text = (
        'const BOX: Record<string, CharBox> = {\n'
        '  "aaa": [0, 0, 1, 1, 1],\n'
        '  "bbb": [0.1, 0.2, 0.3, 0.4, 1],\n'
        '};\n'
        'export const CHARACTER_BOX_BAKED = {\n'
        '  at: "2026-10-03",\n'
        '  people: 2,\n'
        '  boxes: 2,\n'
        '  noArt: [\n'
        '    "zzz",\n'
        '  ],\n'
        '} as const;\n'
    )
    with tempfile.TemporaryDirectory() as tmp:
        p = os.path.join(tmp, "characterBox.ts")
        with open(p, "w", encoding="utf-8") as f:
            f.write(text)
        got = baked_ids(p)
    ok(got == {"aaa", "bbb"},
       f"箱2つだけを拾い、`noArt` の id（zzz）を箱と数えない → {sorted(got)}")
    ok(baked_ids(os.path.join(HERE, "no-such-file.ts")) == set(),
       "ファイルが無ければ空（初回。例外で落ちない）")


def case_history() -> None:
    """**床を、実測の両側から挟む。**

    [4] の境目は `FLOOR_SHARE` から出しているので（写さないため）、
    **しきい値を動かしても境目が一緒に動いて気づけない。** だから
    「床がどこに在るべきか」は、しきい値ではなく**実測**で当てる。

    焼いた回ぶんの口の人数は `site/content/characterBox.ts` の
    `CHARACTER_BOX_BAKED.people` に残っていて、git から引ける（実測）:

      2026-09-09  22（名簿から。口を使う前）   2026-09-11  95
      2026-09-17 102   09-18 103   09-19 103   09-20 103
      09-21 103   09-22 103   09-23 103        2026-10-03 100

    **口の人数は、始まってから一度も頭打ち 103人の 92.2%（95人）を
    割っていない。** 唯一の減りは 103 → 100（-2.9%）。

    - 床が**高すぎる**と、この実測の晩が断られる（＝いまの詰まりが戻る）
    - 床が**低すぎる**と、口が壊れた形（0人・1人・10人）が通る（＝全消し）

    どちらに動かしてもここが赤くなる。
    """
    print("\n[8] 床を実測で挟む（しきい値を動かしたら、ここが赤くなる）")
    # 実測の晩。箱が N 個あって、口が M 人を返した回
    nights = [(22, 95), (95, 102), (102, 103), (103, 103), (103, 100)]
    bad = []
    for boxes, people in nights:
        had = {f"b{i:04d}" for i in range(boxes)}
        # 箱より口が多い晩は、箱ぜんぶが口にも居て、残りが新しい人。
        # 箱より口が少ない晩（103→100）は、足りないぶんが名簿から消えた人
        if people >= boxes:
            api = had | {f"n{i:04d}" for i in range(people - boxes)}
        else:
            api = set(sorted(had)[boxes - people:])
        if not judge(had, api, api)[0]:
            bad.append(f"{boxes}箱/口{people}人")
    ok(not bad,
       f"実測の{len(nights)}晩ぜんぶで書ける（断られた: {bad or 'なし'}）"
       f"——床が高すぎると、ここが落ちる")

    # 口が壊れた形。103箱に対して、この人数は「人が抜けた」ではない
    broken = [0, 1, 10, 50]
    slipped = [n for n in broken
               if judge(HAD, set(sorted(API)[:n]), set(sorted(API)[:n]))[0]]
    ok(not slipped,
       f"口が壊れた形（{', '.join(f'{n}人' for n in broken)}）はぜんぶ断る"
       f"（通ってしまった: {slipped or 'なし'}）——床が低すぎると、ここが落ちる")


def case_control() -> None:
    """**対照。** 上の各件が、本当に判定のおかげで出ているのかを見る。

    片側だけだと、`judge()` を書き換えても通ってしまう
    （`docs/island-standards.md` §15「対照は、足の数だけ用意する」）。
    """
    print("\n[9] 対照（判定を壊したら、上の件が落ちることを見る）")

    # (a) 直す前の判定（人数だけを見る）を当てる。[1] が断られるはず
    def count_only(had, rows, api, expect=None):
        if len(rows) < len(had):
            return False, "人数が減ったので書きません（直す前の判定）"
        return True, "書きます（直す前の判定）"

    ok(count_only(HAD, API, API)[0] is False,
       "直す前の判定（人数だけ）を当てると [1] が断られる＝これが止まっていた原因")

    # (b) 何でも通す判定を当てる。[2] と [4] が素通りするはず
    def blind(had, rows, api, expect=None):
        return True, "書きます（何も見ない判定）"

    slipped = [
        n for n, args in (
            ("絵が落とせなかった1人", (HAD, API - {"old050"}, API)),
            ("口が0人", (HAD, set(), set())),
        )
        if blind(*args)[0] and not judge(*args)[0]
    ]
    ok(len(slipped) == 2,
       f"何も見ない判定を当てると {len(slipped)}件が素通りする"
       f"（{' / '.join(slipped)}）＝だから [2] と [4] が要る")

    # (c) 「名簿にも居ない人」を見ない判定（消える箱をぜんぶ断る）を当てると、
    #     [1] が断られる。**ここが新しい判定の本体**
    def no_roster(had, rows, api, expect=None):
        if had - rows:
            return False, "箱が消えるので書きません（名簿を見ない判定）"
        return True, "書きます"

    ok(no_roster(HAD, API, API)[0] is False and judge(HAD, API, API)[0] is True,
       "名簿（口）を見ない判定を当てると [1] が断られる＝名簿で引くところが本体")


# **わざと壊して赤くする口。** 本体を書き換えずに「赤くなること」を見せる
BREAK = {
    "count": lambda had, rows, api, expect=None: (
        (False, "人数が減ったので書きません（直す前の判定）")
        if len(rows) < len(had) else (True, "書きます（直す前の判定）")),
    "blind": lambda had, rows, api, expect=None: (
        True, "書きます（何も見ない判定）"),
}


def main() -> int:
    print("=== キャラクターの箱を焼く関所を、偽の id で確かめる ===")
    print("（網にも本番にも1バイトも出ません）")
    brk = os.getenv("BREAK")
    if brk:
        if brk not in BREAK:
            print(f"✕ そんな壊しかたは無い: {brk}（在るのは {', '.join(BREAK)}）")
            return 2
        print(f"**BREAK={brk} で判定を壊してあります。落ちるのが正しい。**")
        globals()["judge"] = BREAK[brk]

    case_gone()
    case_unexplained()
    case_grow()
    case_floor()
    case_waive()
    case_same()
    case_parse()
    case_history()
    if not brk:
        # 対照は本物の判定でしか意味がない（壊した判定と二重に壊さない）
        case_control()

    print()
    if CHECKED == 0:
        print("✕ 1件も見ていません（数えるものが無い）")
        return 2
    if FAILED:
        print(f"✕ {CHECKED}件中 {len(FAILED)}件 落ちました:")
        for f in FAILED:
            print(f"    - {f}")
        return 1
    print(f"○ {CHECKED}件ぜんぶ通りました"
          f"（書く側・断る側・床・分母・対照の5とおりを見た）")
    return 0


if __name__ == "__main__":
    sys.exit(main())
