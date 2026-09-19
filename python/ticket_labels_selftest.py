"""札の読みかたと、**メンションが本当に飛ぶ形か**を、こしらえた本文で確かめる。

    python3 python/ticket_labels_selftest.py

**GitHub にも Firestore にも1バイトも出ない。** 素の関数だけを呼ぶ。

終了コード 0=通った / 1=落ちた / **2=数えるものが無い**。

## なぜ要るか

「あやとにメンションを入れた」は、**入れただけでは確かめたことにならない。**
GitHub はコードブロック・引用・バッククォートの中の `@名前` を飛ばさない。
字としては在るのに1通も届かない、という形が一番起きやすい。

そしてもう1つ。**本文を書き換えても通知は飛ばない。** 毎晩同じ issue の
本文を差し替える形（`donor_calls` / `bake_down` / `ingest_down`）では、
本文にメンションを置いただけだと**開いた最初の1回しか届かない。**

## 対照は、片側だけでは足りない

- **飛ぶ形で落ちないこと**（素の行・箇条書きの行では True）
- **飛ばない形で通らないこと**（囲い・引用・バッククォートでは False）

片方だけだと、`mention_live()` を `return True` に書き換えても通る。
"""

import sys

sys.path.insert(0, __file__.rsplit("/", 1)[0])

from ticket_labels import (  # noqa: E402
    AFTER_TRIP, HANDLE, WAIT_AYATO, WAIT_US,
    mention_live, ping_text, should_ping, wait_of,
)

FAILED = []
CHECKED = 0


def ok(cond: bool, what: str) -> None:
    """1件見る。落ちたら名前を控える。"""
    global CHECKED
    CHECKED += 1
    print(f"  {'○' if cond else '✕'} {what}")
    if not cond:
        FAILED.append(what)


def case_wait_of() -> None:
    print("\n[1] 付いている札から、待ちの相手を1つ選ぶ")
    ok(wait_of([{"name": WAIT_AYATO}]) == WAIT_AYATO, "あやと待ちを読む")
    ok(wait_of(["待ち-こちら"]) == WAIT_US, "名前だけの並びでも読む")
    ok(wait_of([{"name": "bug"}, {"name": AFTER_TRIP}]) == AFTER_TRIP,
       "関係ない札が混ざっていても読む")
    ok(wait_of([]) == "", "1つも付いていなければ空")
    ok(wait_of(None) == "", "札の欄そのものが無くても落ちない")
    # 2つ付いていたら、**あやと待ちを先に採る。** 両方数えると分母が壊れる
    ok(wait_of([{"name": WAIT_US}, {"name": WAIT_AYATO}]) == WAIT_AYATO,
       "2つ付いていたら、あやと待ちのほうを1つだけ採る")


def case_mention_live() -> None:
    print("\n[2] メンションが、本当に飛ぶ形で入っているか")

    # ---- 飛ぶ側（ここが落ちたら、本物のメンションを見落とす）
    ok(mention_live(f"{HANDLE} 対応表をお願いします。"), "素の行は飛ぶ")
    ok(mention_live(f"やってほしいこと\n\n- {HANDLE} 鍵を作り直す"),
       "箇条書きの中でも飛ぶ")
    ok(mention_live(f"文の途中に {HANDLE} が来ても飛ぶ"), "行の途中でも飛ぶ")

    # ---- 飛ばない側（ここが通ったら、「入れた」が嘘になる）
    ok(not mention_live(f"```\n{HANDLE}\n```"), "コードブロックの中は飛ばない")
    ok(not mention_live(f"~~~\n{HANDLE}\n~~~"), "~~~ の囲いの中も飛ばない")
    ok(not mention_live(f"> {HANDLE} お願いします"), "引用の中は飛ばない")
    ok(not mention_live(f"    {HANDLE}"), "4つの空白で始まる行は飛ばない")
    ok(not mention_live(f"`{HANDLE}` と書いてあるだけ"),
       "バッククォートで囲むと飛ばない")
    ok(not mention_live("あやとにお願いします"), "名乗りが無ければ飛ばない")

    # 囲いを閉じたあとの行は、また飛ぶ側に戻る
    ok(mention_live(f"```\nここは中\n```\n{HANDLE} ここは外"),
       "囲いを閉じたあとの行は飛ぶ")

    # 出す文そのものが飛ぶ形か。**ここが落ちたら、鳴らしても届かない**
    ok(mention_live(ping_text("投げ銭の紐付け")), "鳴らすときのコメントは飛ぶ形")


def case_should_ping() -> None:
    print("\n[3] コメントで鳴らすかどうか")
    was = f"{HANDLE} お願いします"
    plain = "まだ誰も待っていません"

    # あやと待ちでないものは、何をしても鳴らさない
    for act in ("create", "reopen", "update", "close", "noop"):
        ok(not should_ping(act, plain, False),
           f"あやと待ちでなければ鳴らさない（{act}）")

    ok(not should_ping("create", "", True),
       "開くときは鳴らさない（本文のメンションで飛ぶ）")
    ok(should_ping("reopen", was, True),
       "開き直したら鳴らす（状態を変えるだけでは飛ばない）")
    ok(should_ping("update", plain, True),
       "本文にメンションが無かったところへ入れたら鳴らす")
    ok(not should_ping("update", was, True),
       "もうメンションが入っている本文の書き換えでは鳴らさない")
    ok(not should_ping("noop", was, True), "何もしない回は鳴らさない")
    ok(not should_ping("close", was, True), "閉じる回は鳴らさない")

    # **飛ばない形で入っていたら、入っていないのと同じ。**
    # ここが通らないと「囲いの中に書いてあるから鳴らさない」という
    # いちばん静かな壊れ方をする
    ok(should_ping("update", f"`{HANDLE}`", True),
       "囲いの中にしか無い本文は、入っていない扱いで鳴らす")


def case_control() -> None:
    """**対照。** 判定を寝かせたら落ちることを、その場で当てて見る。"""
    print("\n[4] 対照（守りを外したら落ちるか）")

    # いつも True を返す `mention_live` だと、飛ばない形が通ってしまう
    always = lambda _t: True  # noqa: E731
    bad = [t for t in (f"```\n{HANDLE}\n```", f"> {HANDLE}", f"`{HANDLE}`")
           if always(t)]
    ok(len(bad) == 3,
       "いつも「飛ぶ」と答える判定なら、飛ばない3つが素通りする（だから両側を見る）")

    # 札を見ない判定だと、待ちの相手が1本も出せない
    blind = lambda _l: ""  # noqa: E731
    ok(blind([{"name": WAIT_AYATO}]) == "" and wait_of([{"name": WAIT_AYATO}]),
       "札を見ない判定にすると、あやと待ちが空になる")


def main() -> int:
    print("=== 札の読みかたと、メンションが飛ぶ形かを確かめる ===")
    print("（GitHub にも Firestore にも1バイトも出ません）")
    case_wait_of()
    case_mention_live()
    case_should_ping()
    case_control()

    print()
    if CHECKED == 0:
        print("✕ 1件も見ていません（数えるものが無い）")
        return 2
    if FAILED:
        print(f"✕ {CHECKED}件中 {len(FAILED)}件 落ちました: {', '.join(FAILED)}")
        return 1
    print(f"○ {CHECKED}件ぜんぶ通りました（飛ぶ側と飛ばない側の両方を見た）")
    return 0


if __name__ == "__main__":
    sys.exit(main())
