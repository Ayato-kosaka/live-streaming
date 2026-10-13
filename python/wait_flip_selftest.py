"""**あやとが答えたら待ち札が裏返る**——その見分けを、こしらえたコメントで当てる。

    python3 python/wait_flip_selftest.py

    BREAK=sig    python3 python/wait_flip_selftest.py  # 署名を見ない足にする
    BREAK=loose  python3 python/wait_flip_selftest.py  # 署名を「どこかに在れば」に緩める
    BREAK=bot    python3 python/wait_flip_selftest.py  # 機械を見ない足にする
    BREAK=label  python3 python/wait_flip_selftest.py  # 札を読まない足にする
    BREAK=keep   python3 python/wait_flip_selftest.py  # 他の札を残さない足にする
    BREAK=miss   python3 python/wait_flip_selftest.py  # 取りこぼしを拾わない足にする
    BREAK=window python3 python/wait_flip_selftest.py  # いくらでも遡る足にする

**GitHub にも Firestore にも1バイトも出ない。** `python/ticket_labels.py` の
素の関数だけを呼ぶ。

終了コード 0=通った / 1=落ちた / **2=数えるものが無い**
（`docs/island-standards.md` §15）。

## なぜ要るか

あやとの言葉（2026-10-13）:

> あと、返信したのに「あやと待ち」にするのはやめて欲しい

裏返す仕掛けの難しいところは**見分け**で、しかも**著者では分からない。**
セッションが書くコメントも、GitHub 上の著者は `Ayato-kosaka`
（セッションはあやと本人のトークンで書いている）。見分けの印は
**末尾の署名**1行だけ。

## 対照は、足の数だけ要る

守りは7本あって、**別々に折れる。**

| 足 | 折れると | `BREAK` |
| --- | --- | --- |
| 署名を見る | セッションのコメントで裏返る（あやとが書いていないのに「答えた」ことになる） | `sig` |
| 署名を**末尾でだけ**数える | あやとが引用で貼った署名で**裏返らなくなる**（静かな失敗） | `loose` |
| 機械を外す | 毎晩の呼び出しで裏返る | `bot` |
| 札を見る | 札の無い issue に札が生える | `label` |
| 他の札を残す | `整備` や `donor-calls` が黙って消える | `keep` |
| 取りこぼしを拾う | 届かなかった回が、誰にも気づかれずに残る | `miss` |
| 遡りすぎない | 昔の備忘1行で、審査待ちの issue が「システムの番」になる | `window` |

**1本ずつ折れることを実測してある。** まとめて1つの `BREAK` にすると、
同じ足を7回折っているだけになっていても緑に見える。

最後の1本は、本番に当てて出てきた（2026-10-13）。窓が無いと、いま
`待ち-あやと` の4本のうち **#147 が裏返る**——最後のコメントは確かに
あやと本人だが、中身は 2026-09-22 の備忘1行で、審査を待っているのは
いまもあやと。**見回りは「届かなかったぶんを翌日までに拾う」ものであって、
昔のコメントを読み直して札を付け替えるものではない。**

## 署名が引用・囲いの中にしか無いときは、**裏返す**

決めた理由はこちら側の代償で選んだ。

- **裏返らなかったのは静かな失敗。** 誰も赤くならず、あやとの目には
  「答えたのに、まだあやと待ち」としか映らない——いま直している不具合そのもの
- **間違って裏返ったほうは安い。** 札がシステム側に移るだけで、
  読むのはシステム自身。次に聞くときに `待ち-あやと` を付け直す。
  `ticket_labels` の既定（迷ったら `待ち-システム`）とも向きが同じ

なので `signed_by_system()` は `mention_live()` と同じ作りにして、
**引用・囲い・字下げの中の署名を数えない。**
"""

import os
import sys
from datetime import datetime, timezone

sys.path.insert(0, __file__.rsplit("/", 1)[0])

import ticket_labels as TL  # noqa: E402
from ticket_labels import (  # noqa: E402
    AFTER_TRIP, FLIP, OWNER_LOGIN, SIGNATURE, SKIP_BOT, SKIP_NOT_CREATED,
    SKIP_NOT_OWNER, SKIP_NO_WAIT, SKIP_SIGNED, VERDICT_WHY,
    WAIT_AYATO, WAIT_US,
)

FAILED = []
CHECKED = 0

# ---- 守りを外す足（対照）------------------------------------------------
# **本物の判定に当てる。** こしらえた写しを折っても、本番の足が
# 生きているかは分からない
BREAK = os.environ.get("BREAK", "")
_KNOWN = ("", "sig", "loose", "bot", "label", "keep", "miss", "window")
if BREAK not in _KNOWN:
    print(f"✕ BREAK={BREAK!r} は知らない足です（{', '.join(_KNOWN[1:])}）")
    sys.exit(2)

_real_verdict = TL.flip_verdict

if BREAK == "sig":
    TL.signed_by_system = lambda _b: False          # type: ignore
elif BREAK == "loose":
    # 「どこかに在れば、こちらが書いたもの」。引用で貼られた署名に騙される
    TL.signed_by_system = lambda b: SIGNATURE in (b or "")  # type: ignore
elif BREAK == "bot":
    TL.flip_verdict = (  # type: ignore
        lambda a, lo, ty, bo, la:
        FLIP if _real_verdict(a, lo, ty, bo, la) == SKIP_BOT
        else _real_verdict(a, lo, ty, bo, la))
elif BREAK == "label":
    TL.flip_verdict = (  # type: ignore
        lambda a, lo, ty, bo, la:
        _real_verdict(a, lo, ty, bo, [{"name": WAIT_AYATO}]))
elif BREAK == "keep":
    TL.flipped_labels = lambda _la: [WAIT_US]        # type: ignore
elif BREAK == "miss":
    TL.missed_flips = lambda _is, **_k: []           # type: ignore
elif BREAK == "window":
    _real_missed = TL.missed_flips
    TL.missed_flips = (  # type: ignore
        lambda issues, now=None, within_days=None:
        _real_missed(issues, now=now, within_days=None))


def ok(cond: bool, what: str) -> None:
    """1件見る。落ちたら名前を控える。"""
    global CHECKED
    CHECKED += 1
    print(f"  {'○' if cond else '✕'} {what}")
    if not cond:
        FAILED.append(what)


# ---- こしらえる材料 -----------------------------------------------------
# **本物の形に合わせてある**（2026-10-13 に #804 の13本を実測）。
# 署名の前は `---` の区切りで、署名のうしろには1文字も無い
def ours(text: str) -> str:
    """セッションが書いたコメント（署名つき）。"""
    return f"{text}\n\n---\n{SIGNATURE}"


WAIT = [{"name": "質問"}, {"name": WAIT_AYATO}]
NO_WAIT = [{"name": "質問"}]
SYSTEM_SIDE = [{"name": "質問"}, {"name": WAIT_US}]


def ev(login=OWNER_LOGIN, user_type="User", body="", labels=WAIT,
       action="created", number=808) -> dict:
    """`issue_comment` の受け取りを、要るところだけ組む。"""
    return {
        "action": action,
        "issue": {"number": number, "labels": labels},
        "comment": {"body": body, "user": {"login": login, "type": user_type}},
    }


def verdict(**kw) -> str:
    """受け取りを組んで、答えだけ取り出す。"""
    return TL.flip_from_event(ev(**kw))[0]


# ---- 1. 5通り（この仕事の肝）-------------------------------------------
def case_five() -> None:
    print("\n[1] 同じ著者・同じ issue で、5通りを当てる")

    # (1) あやと本人。署名が無い。**裏返る**
    ok(verdict(body="→これ、わたし打つの面倒なので仕組みを見直してください") == FLIP,
       "あやと本人（署名なし）→ 裏返る")

    # (2) セッション。**著者は同じ `Ayato-kosaka`。** 署名だけが違う
    ok(verdict(body=ours("数えました。11人中4.2人です")) == SKIP_SIGNED,
       "セッション（署名つき・著者は同じ）→ 裏返らない")

    # (3) 機械。`call_ayato` が鳴らすぶん
    ok(verdict(login="github-actions[bot]", user_type="Bot",
               body=f"{TL.HANDLE} 決めてください\n\n---\n_あやと島案内鳥が呼んでいます_",
               ) == SKIP_BOT,
       "github-actions[bot] → 裏返らない")

    # (4) そもそも札が無い。**ここがいちばん多い**（直近100本ぜんぶ）
    ok(verdict(body="ありがとう", labels=NO_WAIT) == SKIP_NO_WAIT,
       "札が付いていない issue → 何もしない")
    ok(verdict(body="ありがとう", labels=[]) == SKIP_NO_WAIT,
       "札の欄が空でも落ちない")
    ok(verdict(body="ありがとう", labels=SYSTEM_SIDE) == SKIP_NO_WAIT,
       "もう 待ち-システム なら、何もしない")

    # (5) 署名が引用・囲いの中にしか無い。**裏返る**と決めた
    ok(verdict(body=f"> まとめました\n> \n> ---\n> {SIGNATURE}\n\nA案で。") == FLIP,
       "引用の中の署名は数えない → 裏返る")
    ok(verdict(body=f"```\n{SIGNATURE}\n```\nこれを消して") == FLIP,
       "囲いの中の署名は数えない → 裏返る")
    ok(verdict(body=f"    {SIGNATURE}\nこれで。") == FLIP,
       "4つ空白で始まる行の署名も数えない → 裏返る")
    ok(verdict(body=f"`{SIGNATURE}` を外して") == FLIP,
       "バッククォートで囲んだ署名は、行に字が残るので数えない → 裏返る")


# ---- 2. 署名そのものの読みかた -----------------------------------------
def case_signature() -> None:
    print("\n[2] 署名を、末尾でだけ数える")

    # 本物にある2つの形（`\\n\\n---\\n` と `\\n\\n\\n---\\n`）
    ok(TL.signed_by_system(f"本文です。\n\n---\n{SIGNATURE}"), "本物の形（空行1つ）")
    ok(TL.signed_by_system(f"本文です。\n\n\n---\n{SIGNATURE}"), "本物の形（空行2つ）")
    ok(TL.signed_by_system(f"本文です。\n\n---\n{SIGNATURE}\n"),
       "うしろに改行があっても読む")
    ok(TL.signed_by_system(SIGNATURE), "署名しか無い本文も、こちらのもの")

    ok(not TL.signed_by_system(""), "空の本文は、こちらのものではない")
    ok(not TL.signed_by_system(None), "本文が無くても落ちない")
    ok(not TL.signed_by_system("ふつうの返事です"), "署名が無ければ、こちらのものではない")
    ok(not TL.signed_by_system(f"> {SIGNATURE}"), "引用の中だけなら数えない")
    ok(not TL.signed_by_system(f"```\n{SIGNATURE}\n```"), "囲いの中だけなら数えない")
    ok(not TL.signed_by_system(f"~~~\n{SIGNATURE}\n~~~"), "~~~ の囲いも同じ")
    ok(not TL.signed_by_system(f"{SIGNATURE}\n\nそのあとに書き足した"),
       "署名のうしろに字があれば、末尾ではない")
    ok(not TL.signed_by_system(f"{SIGNATURE}\n```\nあと\n```"),
       "署名のうしろに囲いが開いても、末尾ではない")
    ok(not TL.signed_by_system("_Generated by Claude Code_"),
       "似ているだけの字は通さない")


# ---- 3. 裏返したあとの札 -----------------------------------------------
def case_labels() -> None:
    print("\n[3] 裏返したあとに、何の札が残るか")
    ok(TL.flipped_labels(WAIT) == ["質問", WAIT_US],
       "待ち-あやと だけが 待ち-システム に変わる")
    ok(TL.flipped_labels([{"name": "整備"}, {"name": WAIT_US},
                          {"name": WAIT_AYATO}]) == ["整備", WAIT_US],
       "両方付いていたら、待ち-システム を1つにまとめる")
    ok(TL.flipped_labels([{"name": WAIT_AYATO}, {"name": AFTER_TRIP}])
       == [WAIT_US, AFTER_TRIP],
       "旅のあと は触らない")
    ok(TL.flipped_labels(["donor-calls", WAIT_AYATO]) == ["donor-calls", WAIT_US],
       "名前だけの並びでも読む")
    ok(TL.flipped_labels(NO_WAIT) == ["質問"],
       "待ち-あやと が無ければ、1つも動かさない")
    ok(WAIT_AYATO not in TL.flipped_labels(WAIT), "待ち-あやと は必ず消える")
    # **他の札が残ることを、名前で見る。** 本数だけ見ると
    # 「全部消して 待ち-システム を1つ足す」でも通ってしまう
    ok("整備" in TL.flipped_labels([{"name": "整備"}, {"name": WAIT_AYATO}]),
       "関係ない札は、名前のまま残る")


# ---- 4. `action` と著者 -------------------------------------------------
def case_who() -> None:
    print("\n[4] いつ・誰が書いたか")
    ok(verdict(action="edited", body="あとから直しました") == SKIP_NOT_CREATED,
       "書き直しでは裏返さない（新しいコメントだけを見る）")
    ok(verdict(action="deleted", body="") == SKIP_NOT_CREATED,
       "消したときも裏返さない")
    ok(verdict(login="someone-else", body="横から失礼します") == SKIP_NOT_OWNER,
       "あやと以外のコメントでは裏返らない")
    ok(verdict(login="ayato-kosaka", body="小文字でも本人") == FLIP,
       "login の大文字小文字は見ない")
    ok(verdict(login="dependabot[bot]", user_type="Bot", body="更新") == SKIP_BOT,
       "ほかの機械も外す")
    ok(verdict(login="some[bot]", user_type="", body="型が来なくても") == SKIP_BOT,
       "type が載っていなくても、login の [bot] で外す")
    # 答えには**ぜんぶ訳がついている**（0件の回に「何を見たか」を出すため）
    ok(all(v in VERDICT_WHY for v in
           (FLIP, SKIP_NOT_CREATED, SKIP_NO_WAIT, SKIP_BOT, SKIP_NOT_OWNER,
            SKIP_SIGNED)),
       "どの答えにも、要約に出す訳がある")
    # 受け取りが壊れていても落ちない（落ちると issue_comment のたびに赤くなる）
    ok(TL.flip_from_event({})[0] == SKIP_NOT_CREATED, "空の受け取りでも落ちない")
    ok(TL.flip_from_event(None)[0] == SKIP_NOT_CREATED, "受け取りが無くても落ちない")
    ok(TL.flip_from_event(ev(body="A案で"))[1] == 808, "issue の番号を取り出す")


# ---- 5. 取りこぼし（静かな失敗）----------------------------------------
def case_missed() -> None:
    """**裏返るはずだったのに裏返っていないもの**を、札とコメントから数える。"""
    print("\n[5] 届かなかった回を、あとから拾えるか")

    now = datetime(2026, 10, 13, 12, 0, tzinfo=timezone.utc)
    recent = "2026-10-13T09:00:00Z"
    old = "2026-09-22T08:03:42Z"   # #147 の備忘。21日前

    def at(c, when=recent):
        return dict(c, at=when)

    ayato = {"login": OWNER_LOGIN, "type": "User", "body": "A案で。"}
    us = {"login": OWNER_LOGIN, "type": "User", "body": ours("まとめました")}
    bot = {"login": "github-actions[bot]", "type": "Bot", "body": "呼んでいます"}
    ayato, us, bot = at(ayato), at(us), at(bot)

    rows = [
        # 裏返り損ね。**あやとが最後に書いたのに、まだ あやと待ち**
        {"number": 808, "labels": WAIT, "comments": [bot, ayato]},
        # こちらが最後に聞いている。待っているのは本当にあやと
        {"number": 809, "labels": WAIT, "comments": [ayato, us]},
        # 呼び出しの直後。まだ答えが来ていない
        {"number": 810, "labels": WAIT, "comments": [us, bot]},
        # もう裏返っている
        {"number": 811, "labels": SYSTEM_SIDE, "comments": [ayato]},
        # 札が無い
        {"number": 812, "labels": NO_WAIT, "comments": [ayato]},
        # コメントが1本も無い（本文で聞いて、まだ返事が無い）
        {"number": 813, "labels": WAIT, "comments": []},
    ]
    ok(TL.missed_flips(rows, now=now) == [808], "最後があやと本人のものだけを拾う")
    ok(TL.missed_flips([], now=now) == [], "1本も無ければ空")
    ok(TL.missed_flips(None, now=now) == [], "並びそのものが無くても落ちない")
    # **拾ったあとに当てると、もう何も出ない**（同じものを毎日触らない）
    after = [dict(r, labels=TL.flipped_labels(r["labels"]))
             if r["number"] in TL.missed_flips(rows, now=now) else r
             for r in rows]
    ok(TL.missed_flips(after, now=now) == [], "裏返したあとは、もう挙がらない")

    # ---- 遡りすぎない（本番に当てて出てきた足。#147）
    memo = [{"number": 147, "labels": WAIT,
             "comments": [at(bot, old), at(ayato, old)]}]
    ok(TL.missed_flips(memo, now=now) == [],
       "1週間より前のコメントは、もう拾わない（#147 の備忘で札を動かさない）")
    ok(TL.missed_flips(memo, now=now, within_days=None) == [147],
       "窓を外せば拾う（窓が効いていることを、両側から見る）")
    ok(TL.missed_flips([{"number": 1, "labels": WAIT,
                         "comments": [at(ayato, "2026-10-08T00:00:00Z")]}],
                       now=now) == [1],
       "5日前ならまだ窓の内側")
    # **日付が読めないものを、黙って外さない**（外すと見回りが0件で緑になる）
    ok(TL.missed_flips([{"number": 2, "labels": WAIT,
                         "comments": [at(ayato, "こわれた日付")]}],
                       now=now) == [2],
       "日付が読めなければ、内側に倒す")
    ok(TL.missed_flips([{"number": 3, "labels": WAIT,
                         "comments": [{"login": OWNER_LOGIN, "type": "User",
                                       "body": "A案で。"}]}], now=now) == [3],
       "日付の欄そのものが無くても、内側に倒す")


def main() -> int:
    print("=== あやとが答えたら、待ち札が裏返るか ===")
    print("（GitHub にも Firestore にも1バイトも出ません）")
    if BREAK:
        print(f"**守りを1本外して回しています: BREAK={BREAK}**")
    case_five()
    case_signature()
    case_labels()
    case_who()
    case_missed()

    print()
    if CHECKED == 0:
        print("✕ 1件も見ていません（数えるものが無い）")
        return 2
    if FAILED:
        print(f"✕ {CHECKED}件中 {len(FAILED)}件 落ちました: {', '.join(FAILED)}")
        return 1
    print(f"○ {CHECKED}件ぜんぶ通りました"
          f"（裏返る側・裏返らない側・拾い直す側の3つを見た）")
    return 0


if __name__ == "__main__":
    sys.exit(main())
