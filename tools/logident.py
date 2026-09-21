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

**オーナー（あやと）自身のチャンネルIDだけは数えない。** 落とすには、
数える側のシェルに `YOUTUBE_CHANNEL_ID` を差してから回す。
差していなければ、そのぶんも数える（理由は `OWNER_CHANNEL_ID_ENV` のところ）。
"""

import argparse
import contextlib
import os
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

# **オーナー（あやと）の GitHub の名乗りは、視聴者さんの素性ではない。**
#
# 機械が立てる issue は本文に `@Ayato-kosaka` を書く。書かないと通知が
# 1通も飛ばず、「気づいてほしいから機械に立てさせた issue」が当の本人に
# 届かない（2026-09-19 の #478 がそれだった）。
# ここで数えてしまうと、**届けるために書いた1行が毎回「漏れ」として赤くなる。**
#
# 落とすのはこの名乗り1つだけ。ほかのハンドルはこれまでどおり数える。
OWNER_HANDLES = ("Ayato-kosaka",)

# **オーナー（あやと）自身の YouTube チャンネルID も、視聴者さんの素性ではない。**
#
# 毎晩の取り込みのログに、本人のチャンネルIDが出る。出しているのは
# こちらのスクリプトではなく **Actions 自身**で、step の頭に `env:` の一覧を
# そのまま echo している（2026-09-13 に6回、2026-09-20 の回は7回）。
# つまり**こちらが1文字も印字しなくても出る。**
#
# 消すには `YOUTUBE_CHANNEL_ID` を Variables から Secrets へ移すしかなく、
# それは #298 でお願いしていた。2026-09-21、あやとの答えは「varibles で良い」
# ——**移さない。これからも出続ける。**
#
# 数えたままにすると、毎晩の素性チェックが**必ず 0 にならない。**
# 「7件あるけど本人のぶんだから大丈夫」を人が毎回覚えることになり、
# **その覚えておくやつが、そのうち見落としになる**（2026-09-13 は実際に、
# その脇に並んでいた視聴者さん約25人ぶんを危うく見落とした）。
#
# **値はここに書かない。** 環境変数から読む。本人のものとはいえ、除外リストに
# 焼いた値はチャンネルを替えた日に黙って外れるし、公開のリポジトリに素性を
# 1つ増やすことでもある。
OWNER_CHANNEL_ID_ENV = "YOUTUBE_CHANNEL_ID"


def owner_channel_ids() -> tuple:
    """除くオーナー自身のチャンネルID。**呼ぶたびに環境変数を読む。**

    読み込み時に1度だけ見る形にしないのは、呼ぶ側（この下の `selftest()` や
    見張りの検査）が環境変数を差し替えてから数えられるようにするため。

    Returns:
        除く ID の組。**未設定なら空**——つまり1つも除かない。
        形が違う値（空・ハンドル・切れた ID）も空に倒す。
        除きすぎて 0 に見えるほうが、数えすぎより危ない
    """
    raw = os.environ.get(OWNER_CHANNEL_ID_ENV, "").strip()
    return (raw,) if raw and CHANNEL_ID.fullmatch(raw) else ()


@contextlib.contextmanager
def owner_env(value):
    """`YOUTUBE_CHANNEL_ID` を差し替えて、抜けるときに戻す（`None` で未設定）。

    確かめる側が、**手元や CI にたまたま置いてある値に左右されない**ように
    するためのもの。本番の口はこれを使わない。
    """
    was = os.environ.get(OWNER_CHANNEL_ID_ENV)
    if value is None:
        os.environ.pop(OWNER_CHANNEL_ID_ENV, None)
    else:
        os.environ[OWNER_CHANNEL_ID_ENV] = value
    try:
        yield
    finally:
        if was is None:
            os.environ.pop(OWNER_CHANNEL_ID_ENV, None)
        else:
            os.environ[OWNER_CHANNEL_ID_ENV] = was


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

    # **落とすのはオーナー自身のぶん1つだけ。** ほかはこれまでどおり数える。
    # 消すほう（`sub`）ではなく**数えるほう**から落とすのは、本人の ID の中の
    # 10 桁を どねID として二重に数えないための `sub` が、本人のぶんにも要るから。
    owners = owner_channel_ids()
    channel_ids = [c for c in channel_ids if c not in owners]

    handles = [m for m in HANDLE.findall(masked)
               # 末尾のピリオドは文の切れ目であってハンドルの一部ではない。
               # 落としてから長さを見ないと `@v4.` が 3 文字に化ける。
               if len(m.rstrip(".")) >= HANDLE_MIN
               and m.rstrip(".") not in OWNER_HANDLES]

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
        "@Ayato-kosaka",                # オーナーの名乗り。視聴者さんではない
    ]
    text = "\n".join(hits + misses)

    want = {"channel_id": 2, "handle": 4, "doneru_id": 2, "email": 1}

    ok = True

    # ここは**環境変数を外して**回す。手元や CI にたまたま
    # `YOUTUBE_CHANNEL_ID` が差してあると、上の仕込みが1つ黙って落ちて、
    # 「仕込み 2 / 検出 1」の理由が分からなくなる。
    # オーナーのぶんは、下の3本の足で名指しで見る。
    with owner_env(None):
        got = count(text)

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

    # --- オーナー自身のチャンネルID（足は3本。**1本外したら1本だけ落ちる**）
    #
    # 除外を足すと、**壊れかたが2つ**になる。数えすぎ（オーナーのぶんが残る）と
    # 除きすぎ（他人のぶんまで落ちる）で、後者のほうが危ない——0 が
    # 「漏れていない」に見えるので、誰も見に行かなくなる。
    # だから**別々の足で**見る。1本が落ちたら、どちらが壊れたかがそのまま出る。
    #
    # 仕込みは全部こしらえもの。**本番の値は1つも置かない**（この出力も
    # 公開のログに積まれる）。`UC` + 22 文字の形だけ本番に合わせる。
    owner = "UC" + "zzFAKEowner".ljust(22, "0")
    other_a = "UC" + "zzFAKEotherA".ljust(22, "0")
    other_b = "UC" + "zzFAKEotherB".ljust(22, "0")

    with owner_env(owner):
        # 足1. 環境変数を差したら、オーナーのぶんは数えない。
        #      **除外を外すと、ここだけが落ちる。**
        legs = [("環境変数あり: オーナーのぶんは数えない",
                 0, count(owner)["channel_id"])]

        # 足2. **他人の** ID は、これまでどおり数える。
        #      除外が広すぎる（環境変数があると全部落とす）と、ここだけが落ちる。
        #      **オーナーのぶんを混ぜない。** 混ぜると、足1が壊れた回
        #      （除外を外した回）にこちらまで 3 で落ちて、**数えすぎと
        #      除きすぎのどちらが起きたのかが読めなくなる。**
        legs.append(("環境変数あり: 他人の ID は数える",
                     2, count("\n".join([other_a, other_b]))["channel_id"]))

    with owner_env(None):
        # 足3. 環境変数が無ければ、オーナーのぶんも数える（＝これまでの振る舞い）。
        #      値をコードに直書きすると、ここだけが落ちる。
        legs.append(("環境変数なし: オーナーのぶんも数える",
                     1, count(owner)["channel_id"]))

    for label, w, g in legs:
        mark = "OK " if g == w else "NG "
        if g != w:
            ok = False
        print(f"{mark}{label}: 仕込み {w} / 検出 {g}")

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
