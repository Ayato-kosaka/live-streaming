#!/usr/bin/env python3
"""公開のログに**個人を指すもの**が何件出ているかを数える。

## なぜ「件数だけ」なのか

このリポジトリは公開で、Actions のログも誰でも読める。
漏れを数えるための道具が漏れた値をそのまま印字したら、
その出力を貼った先（issue・PR・報告）が新しい漏れになる。
**だから値は一切出さない。件数だけを出す。**

## なぜ `--selftest` が要るのか

「0 件でした」は、探し方が壊れていても同じ顔で返ってくる。
実際に、チャンネルIDの 22 文字を 23 文字と書いた探し方が 0 を返して
「漏れていない」と読み違えかけたことがある（`docs/island-misses.md` #79）。
**仕込んだ数がそのまま返ることを先に見てからでないと、0 は証拠にならない。**

使い方:

    python tools/logident.py --selftest          # まずこれ
    python tools/logident.py ログ1.txt ログ2.txt  # ファイルごとに件数
    cat ログ.txt | python tools/logident.py       # 標準入力も可
"""

import argparse
import re
import sys

# YouTube のチャンネルID。`UC` のあと **ちょうど 22 文字**。
# 前後の先読み・後読みは、23 文字以上の似た並び（生成された ID の一部など）を
# 「22 文字ぶんだけ切り取って当たり」にしないため。ここを緩めると数が水増しされる。
CHANNEL_ID = re.compile(r"(?<![A-Za-z0-9_-])UC[A-Za-z0-9_-]{22}(?![A-Za-z0-9_-])")

# YouTube のハンドル。`@` のあとに続く字。
# **ASCII に限らない。** 今夜のログには仮名だけのハンドルが並んでいた。
# `\w` は Unicode なので仮名・漢字・全角英数を拾い、読点や括弧では止まる。
# 後読みで `@` の直前が語の字・ピリオド・ハイフンでないことを見るのは、
# メールアドレスの `@` をハンドルとして二重に数えないため。
HANDLE = re.compile(r"(?<![\w.\-])@([\w.\-]+)")

# ハンドルの最低の長さ。YouTube のハンドルは 3 文字以上と決まっている。
# ここが効くのは、ワークフローのログに必ず出る `actions/checkout@v4` のような
# 版の指定を弾くため。**2 文字で切ると、あれが全部ハンドルとして数えられる。**
HANDLE_MIN = 3

# どねID。**ちょうど 10 桁**。
# 前後に見るのは数字だけではなく、英字・`_`・`-` も含める。
# ランナーが必ず出す `Worker ID: ***…-8892-0123456789ab***` のような UUID の
# 断片が、数字だけの境界では 10 桁として当たってしまう。
# **毎晩のログを「0 なら合格」で読めるようにするのが目的**なので、
# 毎回出る決まりきったノイズは、探し方のほうで落としておく。
DONERU_ID = re.compile(r"(?<![0-9A-Za-z_-])\d{10}(?![0-9A-Za-z_-])")

# メールアドレス。表に出す気のないものが紛れていないかを見るため。
EMAIL = re.compile(r"[\w.+-]+@[\w-]+(?:\.[\w-]+)+")

KINDS = ("channel_id", "handle", "doneru_id", "email")


def count(text: str) -> dict:
    """文字列に含まれる、個人を指すものの件数を種類ごとに返す。

    Args:
        text: 調べる文字列（ログ1ファイルぶんを想定）

    Returns:
        種類名 -> 件数。値そのものは返さない
    """
    # メールを先に取って、その並びを消してから数える。
    # 消さないと、メールの中の数字やドメインを どねID・ハンドルとして
    # 二重に数えることになる。
    emails = EMAIL.findall(text)
    masked = EMAIL.sub(" ", text)

    # チャンネルIDも取ったら消す。`UC…0123456789…` のように 10 桁の並びを
    # 含む ID があり、消さずに数えると どねID として二重に数える
    # （selftest がこれを実際に捕まえた）。
    channel_ids = CHANNEL_ID.findall(masked)
    masked = CHANNEL_ID.sub(" ", masked)

    handles = [m for m in HANDLE.findall(masked)
               # 末尾のピリオドは文の切れ目であってハンドルの一部ではない。
               # 落としてから長さを見ないと `@v4.` が 3 文字に化ける。
               if len(m.rstrip(".")) >= HANDLE_MIN]

    return {
        "channel_id": len(channel_ids),
        "handle": len(handles),
        "doneru_id": len(DONERU_ID.findall(masked)),
        "email": len(emails),
    }


def report(label: str, counts: dict) -> None:
    """1ファイルぶんの件数を1行で出す。値は出さない。"""
    total = sum(counts.values())
    detail = "  ".join(f"{k}={counts[k]}" for k in KINDS)
    mark = "OK  " if total == 0 else "HIT "
    print(f"{mark}{label}: {detail}  (計 {total})")


def selftest() -> int:
    """仕込んだ数がそのまま返るかを見る。

    **当たるはずのもの**と**当たってはいけないもの**を両方入れる。
    片方だけだと、何にでも当たる探し方が通ってしまう。

    Returns:
        通れば 0、外れたら 1
    """
    # 当たるはずのもの
    hits = [
        "UCaaaaaaaaaaaaaaaaaaaaaa",   # UC + 22 文字
        "UC0123456789_-abcdefghij",   # 記号混じりも 22 文字
        "@handle_one",                # ASCII のハンドル
        "@たぃpi",                     # 仮名混じり（今夜のログに実在した形）
        "@abc-123",                   # ハイフンと数字
        "@あやと島",                    # 全部が非 ASCII
        "1234567890",                 # どねID（10 桁）
        "0987654321",
        "someone@example.com",        # メール
    ]
    # 当たってはいけないもの
    misses = [
        "UCtooshort21charsxxxxxx",     # UC + 21 文字
        "UCtoolong23charactersxxxx",    # UC + 23 文字
        "actions/checkout@v4",          # 版の指定。ハンドルではない
        "setup-python@v5",
        "123456789",                    # 9 桁
        "12345678901",                  # 11 桁
        "20260913223045",               # 日時の並び
        "Worker ID: df4f388c-e7ef-4ecd-8892-0123456789ab",  # UUID の断片
    ]
    text = "\n".join(hits + misses)

    want = {"channel_id": 2, "handle": 4, "doneru_id": 2, "email": 1}
    got = count(text)

    ok = True
    for k in KINDS:
        mark = "OK " if got[k] == want[k] else "NG "
        if got[k] != want[k]:
            ok = False
        print(f"{mark}{k}: 仕込み {want[k]} / 検出 {got[k]}")

    # 「当たってはいけないもの」だけを渡して 0 になることも別に見る。
    # 上の合計が合っていても、当たりと外れが相殺している場合がある。
    only_miss = count("\n".join(misses))
    if sum(only_miss.values()) != 0:
        ok = False
        print(f"NG  当たってはいけないものに当たった: "
              + "  ".join(f"{k}={only_miss[k]}" for k in KINDS))
    else:
        print("OK  当たってはいけないものには当たらない")

    print("selftest:", "通った" if ok else "落ちた")
    return 0 if ok else 1


def main() -> int:
    ap = argparse.ArgumentParser(description="ログに残った、個人を指すものの件数を数える（値は出さない）")
    ap.add_argument("paths", nargs="*", help="調べるファイル。省略すると標準入力")
    ap.add_argument("--selftest", action="store_true", help="探し方が効いているかを先に確かめる")
    args = ap.parse_args()

    if args.selftest:
        return selftest()

    if not args.paths:
        report("<stdin>", count(sys.stdin.read()))
        return 0

    total = 0
    for p in args.paths:
        with open(p, encoding="utf-8", errors="replace") as f:
            counts = count(f.read())
        total += sum(counts.values())
        report(p, counts)
    # 当たりが1件でもあれば終了コードを立てる。CI から回したときに気づけるように
    return 1 if total else 0


if __name__ == "__main__":
    sys.exit(main())
