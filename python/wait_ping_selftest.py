"""**`待ち-あやと` が付いたら機械が必ず鳴らす**——その見分けを、こしらえた issue で当てる。

    python3 python/wait_ping_selftest.py              # 足を当てて、対照も回す
    python3 python/wait_ping_selftest.py --no-drill   # 足だけ（対照の中から呼ぶ）
    BREAK=again python3 python/wait_ping_selftest.py --no-drill  # 守りを1本外す

**GitHub にも Firestore にも1バイトも出ない。** `python/ticket_labels.py` の
素の関数だけを呼ぶ。

終了コード 0=通った / 1=落ちた / **2=数えるものが無い・対照が外れた**
（`docs/island-standards.md` §15）。

## なぜ要るか

あやと（2026-10-28・チャット）:

> なぜ通知してない？運用徹底してよ

まとめ役が4本の issue に `待ち-あやと` を付けたまま、`call_ayato.yml` を
1本も回していなかった（`docs/island-misses.md` #306）。**手順に書くのは
対策ではない**ので、札そのものを引き金にした（`.github/workflows/wait_ping.yml`）。

鳴らす仕掛けの難しいところは2つで、どちらも**静かに外れる。**

- **鳴らないほう。** 誰も赤くならない。あやとの目には何も起きていない
  （#306 そのもの）
- **重なるほう。** 毎回2通鳴ると、そのうち読まれなくなる
  （`docs/island-tickets.md`「全部にメンションを入れない」）

## 対照は、足の数だけ要る

守りは足の数だけあって、**別々に折れる。** `BREAK=<足>` で1本ずつ外せる。

| 足 | 折れると | `BREAK` |
| --- | --- | --- |
| 札が付いた・書き足した、だけを見る | 札を外した・書き直した、でも鳴る | `event` |
| 付いた札の名前を見る | ほかの札を付けても鳴る | `label` |
| 札つきで開いた issue も見る | 札を付けて開いた issue で鳴らない | `opened` |
| 閉じた issue を外す | 閉じるときの一言で鳴る | `closed` |
| issue の札を見る | 札の無い issue へのコメントで鳴る | `wait` |
| 機械を外す | 機械の書き込みで鳴る | `bot` |
| あやとのアカウントだけを見る | ほかの人の書き込みで鳴る | `owner` |
| 署名を見る | **あやと本人の返事で鳴る**（答えた人を呼ぶ） | `sig` |
| 重ねない | `call_ayato` のあと・続けて書いたあとに、2通目が鳴る | `again` |
| あやとの返事で、前の呼び出しは使い終わり | 答えたあとに札を付け直しても鳴らない | `reset` |
| あやとのアカウントの `@` は飛んでいない | **セッションが自分で書いた `@` を「呼んだ」と読む**（#306 の根） | `self` |
| 引用・囲いの `@` は飛んでいない | 字としてだけ在る `@` を「呼んだ」と読む | `live` |
| issue の本文も数える | 機械が本文で呼んで開いた issue で、重ねて鳴る | `body` |
| 待ったあとの札で決める | 待つあいだに答えた・閉じた issue で鳴る | `fresh` |
| 鳴らす字が飛ぶ形 | 鳴らしたつもりで1通も飛ばない | `text` |

**1本ずつ折れることを、毎回こちらで当てる**（`--no-drill` を付けずに回すと、
足ごとに自分を子として起こして、**その足の印を付けた判定だけが落ちる**ことを見る）。
まとめて1つにすると、同じ足を何回も折っているだけになっていても緑に見える。
判定が2つの足に印を持つことはある（「待つあいだに答えた」は `fresh` と `wait` の
両方が無いと外れない）。印と落ちたものが**1つ残らず一致する**ことを見る。
"""

import argparse
import json
import os
import subprocess
import sys

sys.path.insert(0, __file__.rsplit("/", 1)[0])

import ticket_labels as TL  # noqa: E402
from ticket_labels import (  # noqa: E402
    HANDLE, OWNER_LOGIN, PING, PING_WHY, QUIET_ALREADY, QUIET_BOT,
    QUIET_CLOSED, QUIET_EVENT, QUIET_NO_WAIT, QUIET_NOT_OWNER,
    QUIET_NOT_SIGNED, QUIET_OTHER_LABEL, SIGNATURE, SKIP_BOT, WAIT_AYATO,
    WAIT_US,
)

# 子を1本起こすときの上限。素の関数だけなので、1秒もかからない
TIMEOUT_SEC = 60

# ---- 守りを外す足（対照）------------------------------------------------
# **本物の判定に当てる。** こしらえた写しを折っても、本番の足が
# 生きているかは分からない
LEGS = ("event", "label", "opened", "closed", "wait", "bot", "owner", "sig",
        "again", "reset", "self", "live", "body", "fresh", "text")
BREAK = os.environ.get("BREAK", "")
if BREAK and BREAK not in LEGS:
    print(f"✕ BREAK={BREAK!r} は知らない足です（{', '.join(LEGS)}）")
    sys.exit(2)

# 受け取りだけで決まる足は、その答えを「鳴らす」にすり替えて外す
# （`wait_flip_selftest.py` の `bot` と同じ外しかた）
_AS_PING = {"event": QUIET_EVENT, "label": QUIET_OTHER_LABEL,
            "closed": QUIET_CLOSED, "wait": QUIET_NO_WAIT, "bot": QUIET_BOT,
            "owner": QUIET_NOT_OWNER, "sig": QUIET_NOT_SIGNED}
_real_trigger = TL.wait_ping_trigger
_real_from_event = TL.ping_from_event


def _owner(c) -> bool:
    return TL._is_owner(TL._flat(c)["login"])


if BREAK in _AS_PING:
    def _broken_trigger(*a, **k):
        v = _real_trigger(*a, **k)
        return PING if v == _AS_PING[BREAK] else v
    TL.wait_ping_trigger = _broken_trigger  # type: ignore
elif BREAK == "opened":
    def _no_opened(event_name, action, *a, **k):
        if event_name == "issues" and action == "opened":
            return QUIET_EVENT
        return _real_trigger(event_name, action, *a, **k)
    TL.wait_ping_trigger = _no_opened  # type: ignore
elif BREAK == "again":
    TL.already_called = lambda _h: False  # type: ignore
elif BREAK == "reset":
    # 字のとおりの決まり（「最後の**システムの**コメントより後に」）。
    # あやと本人の返事では、前の呼び出しが使い終わりにならない
    def _reset_only_signed(history):
        called = False
        for c in history or []:
            c = TL._flat(c)
            if _owner(c):
                if TL.signed_by_system(c["body"]):
                    called = False
            elif TL.mention_live(c["body"]):
                called = True
        return called
    TL.already_called = _reset_only_signed  # type: ignore
elif BREAK == "self":
    # 誰が書いたかを見ずに、生きた `@` を「呼んだ」と読む
    def _anyone_calls(history):
        called = False
        for c in history or []:
            c = TL._flat(c)
            if TL.mention_live(c["body"]):
                called = True
            elif _owner(c):
                called = False
        return called
    TL.already_called = _anyone_calls  # type: ignore
elif BREAK == "live":
    # 字として在れば「呼んだ」と読む
    def _raw_handle(history):
        called = False
        for c in history or []:
            c = TL._flat(c)
            if _owner(c):
                called = False
            elif HANDLE in c["body"]:
                called = True
        return called
    TL.already_called = _raw_handle  # type: ignore
elif BREAK == "body":
    TL.ping_history = (  # type: ignore
        lambda _issue, comments: [TL._flat(c) for c in comments or []])
elif BREAK == "fresh":
    TL.ping_from_event = (  # type: ignore
        lambda name, ev, _issue, comments: _real_from_event(name, ev, None,
                                                             comments))
elif BREAK == "text":
    TL.wait_ping_text = (  # type: ignore
        lambda: f"`{HANDLE}` 返事をお願いします（すぐ上の書き込みです）。\n")


# ---- 数える -------------------------------------------------------------
RESULTS = []   # (何を見たか, 印の付いた足, 通ったか)


def ok(cond: bool, what: str, legs=()) -> None:
    """1件見る。`legs` は、**その足を外したら落ちるはず**の印。"""
    RESULTS.append((what, tuple(legs), bool(cond)))
    if not QUIET:
        print(f"  {'○' if cond else '✕'} {what}")


QUIET = False

# ---- こしらえる材料 -----------------------------------------------------
# **GitHub が返す形に合わせてある**（`user.login` / `user.type` / `body`）。
# セッションのコメントは、末尾が署名（`wait_flip_selftest.py` と同じ形）
BOT = "github-actions[bot]"
WAIT = [{"name": "質問"}, {"name": WAIT_AYATO}]
NO_WAIT = [{"name": "質問"}]
SYSTEM_SIDE = [{"name": "質問"}, {"name": WAIT_US}]

# `call_ayato.yml` が書く形（`github-actions[bot]`・行頭に生きた `@`）
CALL = (f"{HANDLE} 判断をお願いします。\n\nA案かB案か\n\n"
        "---\n_あやと島案内鳥が呼んでいます_")


def ours(text: str) -> str:
    """セッションが書いたコメント（署名つき）。"""
    return f"{text}\n\n---\n{SIGNATURE}"


def c_sys(text="数えました。11人中4.2人です"):
    return {"user": {"login": OWNER_LOGIN, "type": "User"}, "body": ours(text)}


def c_ayato(text="A案で。"):
    return {"user": {"login": OWNER_LOGIN, "type": "User"}, "body": text}


def c_bot(body=CALL, login=BOT, utype="Bot"):
    return {"user": {"login": login, "type": utype}, "body": body}


def issue(labels=WAIT, state="open", login=OWNER_LOGIN, utype="User",
          body="どちらにするか決めてください", number=1043):
    return {"number": number, "labels": labels, "state": state,
            "user": {"login": login, "type": utype}, "body": body}


def labeled(iss=None, label=WAIT_AYATO, action="labeled"):
    return {"action": action, "label": {"name": label},
            "issue": iss if iss is not None else issue()}


def commented(c, iss=None, action="created"):
    return {"action": action, "comment": c,
            "issue": iss if iss is not None else issue()}


def run(name, ev, comments=(), fresh=None):
    """ワークフローと同じ道で決める。`fresh` は待ったあとに読み直した issue
    （渡さなければ、受け取りと同じものが返ってきたことにする）。"""
    now = fresh if fresh is not None else ev.get("issue")
    return TL.ping_from_event(name, ev, now, list(comments))


def pinged(name, ev, comments=(), fresh=None) -> bool:
    v, text, _ = run(name, ev, comments, fresh)
    return v == PING and bool(text)


def verdict(name, ev, comments=(), fresh=None) -> str:
    return run(name, ev, comments, fresh)[0]


# ---- 1. 鳴らす側 --------------------------------------------------------
def case_ping() -> None:
    print("\n[1] 鳴らす（鳴らないのが #306 そのもの）")

    # 本文で聞いて、札を付けた。コメントは1本も無い
    ok(pinged("issues", labeled()), "札が付いた（本文で聞いて、コメント無し）→ 鳴らす")
    q = c_sys()
    ok(pinged("issues", labeled(), [q]), "問いを書いてから札を付けた → 鳴らす")
    ok(pinged("issue_comment", commented(q), [q]),
       "待ち札の issue にシステムが書き足した → 鳴らす")
    ok(pinged("issues", {"action": "opened", "issue": issue()}),
       "札を付けて開いた → 鳴らす（`labeled` が来ない日のため）", ["opened"])

    # #306 の根。**セッションが自分で書いた `@` は1通も飛んでいない**
    q_at = c_sys(f"{HANDLE} A案かB案か決めてください")
    ok(pinged("issue_comment", commented(q_at), [q_at]),
       "セッションが自分で `@` を書いていても、それは飛んでいない → 鳴らす", ["self"])
    ok(pinged("issues", labeled(issue(body=f"{HANDLE} 決めてください")), []),
       "セッションが本文に `@` を書いて開いても、飛んでいない → 鳴らす", ["self"])

    # あやとが答えて、また聞いた（札を付け直した）
    ok(pinged("issues", labeled(), [q, c_bot(), c_ayato()]),
       "あやとが答えたあとに札を付け直した → 鳴らす（前の呼び出しは使い終わり）",
       ["reset"])
    ok(pinged("issues", labeled(), [q, c_bot(), c_ayato(), c_sys("追加で聞きます")]),
       "あやとが答えて、システムがまた聞いた → 鳴らす")

    # 字としてだけ在る `@`（飛んでいない）
    ok(pinged("issues", labeled(), [q, c_bot(f"今週の棚卸し: `{HANDLE}` 待ち 3本")]),
       "機械の書き込みに `@` がバッククォートの中だけ → 呼んだことにしない → 鳴らす",
       ["live"])
    ok(pinged("issues", labeled(), [q, c_bot(f"> {HANDLE} 判断をお願いします")]),
       "引用の中だけの `@` → 呼んだことにしない → 鳴らす", ["live"])

    # 口を叩く前の答え
    ok(TL.ping_trigger_from_event("issue_comment", commented(q))[0] == PING,
       "口を叩く前の答えも「鳴らす見込みが在る」")
    ok(TL.ping_trigger_from_event("issue_comment", commented(q))[1] == 1043,
       "issue の番号を取り出す")


# ---- 2. 鳴らさない側（受け取りだけで決まる）---------------------------
def case_quiet_event() -> None:
    print("\n[2] 鳴らさない（受け取りだけで決まる。口を1回も叩かない）")
    q = c_sys()

    # event
    for name, ev, what in (
        ("issues", labeled(action="unlabeled"), "札を外した"),
        ("issues", {"action": "closed", "issue": issue()}, "閉じた"),
        ("issues", {"action": "edited", "issue": issue()}, "本文を書き直した"),
        ("issue_comment", commented(q, action="edited"), "コメントを書き直した"),
        ("issue_comment", commented(q, action="deleted"), "コメントを消した"),
        ("pull_request", labeled(), "issue でも issue_comment でもない"),
    ):
        ok(verdict(name, ev, [q]) == QUIET_EVENT, f"{what} → 鳴らさない", ["event"])
    ok(TL.ping_trigger_from_event("", {})[0] == QUIET_EVENT,
       "空の受け取りでも落ちない", ["event"])
    ok(TL.ping_trigger_from_event("issue_comment", None)[0] == QUIET_EVENT,
       "受け取りが無くても落ちない", ["event"])

    # label
    ok(verdict("issues", labeled(label="質問"), [q]) == QUIET_OTHER_LABEL,
       "待ち-あやと の issue に、ほかの札を足した → 鳴らさない", ["label"])
    ok(verdict("issues", labeled(issue(labels=SYSTEM_SIDE), label=WAIT_US), [q])
       == QUIET_OTHER_LABEL,
       "待ち-システム を付けた → 鳴らさない", ["label"])

    # closed
    ok(verdict("issues", labeled(issue(state="closed")), [q]) == QUIET_CLOSED,
       "閉じた issue に札を付けた → 鳴らさない", ["closed"])
    closing = issue(state="closed")
    ok(verdict("issue_comment", commented(q, closing), [q]) == QUIET_CLOSED,
       "閉じた issue にシステムが書いた → 鳴らさない", ["closed"])

    # wait
    for labels, what in ((NO_WAIT, "札の無い"), (SYSTEM_SIDE, "待ち-システム の"),
                         ([], "札の欄が空の")):
        ok(verdict("issue_comment", commented(q, issue(labels=labels)), [q])
           == QUIET_NO_WAIT,
           f"{what} issue にシステムが書いた → 鳴らさない", ["wait"])
    ok(verdict("issues", {"action": "opened", "issue": issue(labels=NO_WAIT)})
       == QUIET_NO_WAIT,
       "札を付けずに開いた → 鳴らさない", ["wait", "opened"])

    # bot
    signed_bot = c_bot(ours("機械の書き込み"))
    ok(verdict("issue_comment", commented(signed_bot), [q, signed_bot])
       == QUIET_BOT,
       "github-actions[bot] の書き込み（署名つきでも）→ 鳴らさない", ["bot"])
    typeless = c_bot(ours("型が来ない"), login="some[bot]", utype="")
    ok(verdict("issue_comment", commented(typeless), [q, typeless]) == QUIET_BOT,
       "type が載っていなくても、login の [bot] で外す", ["bot"])

    # owner
    other = {"user": {"login": "someone-else", "type": "User"},
             "body": ours("横から失礼します")}
    ok(verdict("issue_comment", commented(other), [q, other]) == QUIET_NOT_OWNER,
       "あやとのアカウント以外が書いた → 鳴らさない", ["owner"])

    # sig
    reply = c_ayato()
    ok(verdict("issue_comment", commented(reply), [q, c_bot(), reply])
       == QUIET_NOT_SIGNED,
       "あやと本人の返事（署名なし）→ 鳴らさない", ["sig"])
    quoted = c_ayato(f"> まとめました\n> \n> ---\n> {SIGNATURE}\n\nA案で。")
    ok(verdict("issue_comment", commented(quoted), [q, c_bot(), quoted])
       == QUIET_NOT_SIGNED,
       "あやとが引用でシステムの署名を貼った → 鳴らさない", ["sig"])


# ---- 3. 重ねない ---------------------------------------------------------
def case_again() -> None:
    print("\n[3] 重ねない（もう呼んであれば鳴らさない）")
    q = c_sys()

    ok(verdict("issues", labeled(), [q, c_bot()]) == QUIET_ALREADY,
       "問いを書いて `call_ayato` を回したあとに札を付けた → 重ねない", ["again"])
    ok(verdict("issue_comment", commented(q), [q, c_bot()]) == QUIET_ALREADY,
       "書き足したあと、待つあいだに `call_ayato` が鳴らした → 重ねない", ["again"])
    # 続けて2本書いた。1本目の回が鳴らしたあと、2本目の回が読む並び
    q2 = c_sys("補足です")
    ping = c_bot(TL.wait_ping_text())
    ok(verdict("issue_comment", commented(q2), [q, q2, ping]) == QUIET_ALREADY,
       "同じ issue に続けて書いた（前の回がもう鳴らした）→ 重ねない",
       ["again", "text"])
    # 鳴らしたあとにシステムがまた聞いたら、それは新しい問い
    q3 = c_sys("別のことを聞きます")
    ok(pinged("issue_comment", commented(q3), [q, ping, q3]),
       "鳴らしたあとにシステムが新しく聞いた → また鳴らす")

    # 機械が本文に `@` を入れて開いた issue（`donor_calls` ほか）
    machine = issue(login=BOT, utype="Bot",
                    body=f"{HANDLE} 投げ銭の紐付けを待っています。\n\n（表）")
    ok(verdict("issues", labeled(machine), []) == QUIET_ALREADY,
       "機械が本文で呼んで開いた issue → 重ねない", ["again", "body"])
    ok(verdict("issues", {"action": "opened", "issue": machine}) == QUIET_ALREADY,
       "機械が本文で呼んで、札つきで開いた → 重ねない",
       ["again", "body", "opened"])

    # 待つあいだに状況が変わった（読み直した札と状態で決める）
    reply = c_ayato()
    flipped = issue(labels=SYSTEM_SIDE)
    ok(verdict("issue_comment", commented(q), [q, reply], fresh=flipped)
       == QUIET_NO_WAIT,
       "待つあいだに、あやとが答えて札が裏返った → 鳴らさない", ["fresh", "wait"])
    closed = issue(state="closed")
    ok(verdict("issue_comment", commented(q), [q], fresh=closed) == QUIET_CLOSED,
       "書いてすぐ閉じた（`gh issue close --comment`）→ 鳴らさない",
       ["fresh", "closed"])


# ---- 4. 鳴らす字 --------------------------------------------------------
def case_text() -> None:
    print("\n[4] 鳴らす字が、本当に飛ぶ形か")
    q = c_sys()
    v, text, _ = run("issues", labeled(), [q])
    ok(v == PING and text == TL.wait_ping_text(), "鳴らすときは、決まった字を返す")
    ok(TL.mention_live(text), "`@` が飛ぶ形で入っている（囲い・引用・バッククォートの外）",
       ["text"])
    ok(text.splitlines()[0].startswith(HANDLE), "`@` は1行目の頭", ["text"])
    # 鳴らした書き込みが並びに載ったら、次の回は「もう呼んだ」と読む
    ok(TL.already_called([TL._flat(q), {"login": BOT, "type": "Bot",
                                        "body": text}]),
       "鳴らした書き込みを、次の回が「もう呼んだ」と読める", ["text", "again"])
    lines = [x for x in text.splitlines() if x.strip()]
    ok(len(lines) <= 3, f"短い（字のある行が {len(lines)}行。本文1行と署名）")

    # **issue の中身を1文字も持ち込まない**（題名にも本文にも素性が在りうる）
    secret = "視聴者のなまえUCxxxxxxxxxxxxxxxxxxxxxx"
    _, t2, _ = run("issues", labeled(issue(body=secret)),
                   [c_sys(secret)])
    ok(t2 == text and secret not in t2, "issue の中身が変わっても、字は変わらない")
    ok(not TL.signed_by_system(text), "システムの署名は付けない（あやと本人の返事とも、"
                                      "セッションの書き込みとも見分けがつく）")
    # 鳴らした書き込みで、待ち札が裏返らない（`wait_flip` は機械を外す）
    ok(TL.flip_verdict("created", BOT, "Bot", text, WAIT) == SKIP_BOT,
       "鳴らした書き込みで、待ち札は裏返らない")
    ok(TL.missed_flips([{"number": 1, "labels": WAIT,
                         "comments": [{"login": BOT, "type": "Bot",
                                       "body": text}]}]) == [],
       "裏返し損ねの見回りにも挙がらない")


# ---- 5. 並びの読みかた ---------------------------------------------------
def case_shape() -> None:
    print("\n[5] GitHub の形を読む")
    h = TL.ping_history(issue(login=BOT, utype="Bot", body="本文"),
                        [c_sys(), {"login": OWNER_LOGIN, "type": "User",
                                   "body": "そろえた形"}])
    ok([x["login"] for x in h] == [BOT, OWNER_LOGIN, OWNER_LOGIN],
       "本文を先頭に、古い順に並べる", ["body"])
    ok(h[0]["type"] == "Bot" and h[2]["body"] == "そろえた形",
       "GitHub の形（user.login）でも、そろえた形（login）でも読む", ["body"])
    ok(TL.ping_history(None, None) == [], "issue もコメントも無くても落ちない")
    ok(not TL.already_called(None), "並びが無ければ、まだ呼んでいない")
    ok(TL.ping_from_event("issues", labeled(), None, None)[0] == PING,
       "読み直しが無ければ、受け取りの issue で決める")
    ok(all(v in PING_WHY for v in
           (PING, QUIET_EVENT, QUIET_OTHER_LABEL, QUIET_CLOSED, QUIET_NO_WAIT,
            QUIET_BOT, QUIET_NOT_OWNER, QUIET_NOT_SIGNED, QUIET_ALREADY)),
       "どの答えにも、要約に出す訳がある")
    ok(isinstance(TL.PING_SETTLE_SECONDS, int)
       and 30 <= TL.PING_SETTLE_SECONDS <= 600,
       f"待つ秒数が、`call_ayato` の書き込みより長く、ジョブの上限より短い"
       f"（{TL.PING_SETTLE_SECONDS}秒）")


def cases() -> None:
    case_ping()
    case_quiet_event()
    case_again()
    case_text()
    case_shape()


# ---- 対照: 足を1本ずつ外して、自分を子として起こす ------------------------
def run_self(leg: str) -> tuple:
    env = dict(os.environ)
    env["BREAK"] = leg
    r = subprocess.run([sys.executable, os.path.abspath(__file__),
                        "--no-drill", "--json"], capture_output=True, text=True,
                       env=env, timeout=TIMEOUT_SEC, check=False)
    try:
        got = json.loads(r.stdout.strip().splitlines()[-1])
    except (ValueError, IndexError):
        got = None
    return r.returncode, got, r.stdout + r.stderr


def drill() -> bool:
    """**足ごとに、その印を付けた判定だけが落ちるか**を見る。"""
    print("\n[対照] 守りを1本ずつ外して、その足の判定だけが落ちるか")
    good = True
    names = [w for w, _, _ in RESULTS]
    if len(set(names)) != len(names):
        print("  ✕ 判定の名前が重なっている（落ちたものを名前で突き合わせられない）")
        return False
    for leg in LEGS:
        want = {w for w, legs, _ in RESULTS if leg in legs}
        rc, got, _ = run_self(leg)
        if got is None:
            print(f"  ✕ BREAK={leg}: 子の答えが読めない（終了コード {rc}）")
            good = False
            continue
        fell = set(got.get("failed") or [])
        hit = bool(want) and fell == want and rc == 1
        good = good and hit
        print(f"  {'○' if hit else '✕'} BREAK={leg:<6} 落ちた {len(fell)}件"
              f" / 印 {len(want)}件")
        for w in sorted(fell - want):
            print(f"       印の無いものが落ちた: {w}")
        for w in sorted(want - fell):
            print(f"       印があるのに通った: {w}")
    # 知らない足を渡されたら、黙って全部の足を立てたまま通さない
    rc, _, out = run_self("shiranai-ashi")
    hit = rc == 2 and "知らない足" in out
    good = good and hit
    print(f"  {'○' if hit else '✕'} 知らない足 → 終了コード {rc}（欲しいのは 2）")
    return good


def main() -> int:
    global QUIET
    ap = argparse.ArgumentParser(add_help=True)
    ap.add_argument("--no-drill", action="store_true", help="対照を回さない（対照の中から）")
    ap.add_argument("--json", action="store_true", help="落ちた判定の名前を機械で読む形で出す")
    a = ap.parse_args()
    QUIET = a.json

    if not a.json:
        print("=== 待ち-あやと が付いたら、機械が鳴らすか ===")
        print("（GitHub にも Firestore にも1バイトも出ません）")
        if BREAK:
            print(f"**守りを1本外して回しています: BREAK={BREAK}**")
    try:
        cases()
    except Exception as e:  # noqa: BLE001
        # 判定が投げたら、それも「落ちた」。黙って緑にしない
        ok(False, f"判定が例外を投げた: {type(e).__name__}: {e}")

    failed = [w for w, _, passed in RESULTS if not passed]
    if a.json:
        print(json.dumps({"checked": len(RESULTS), "failed": failed},
                         ensure_ascii=False))
    if not RESULTS:
        if not a.json:
            print("✕ 1件も見ていません（数えるものが無い）")
        return 2
    if failed:
        if not a.json:
            print(f"\n✕ {len(RESULTS)}件中 {len(failed)}件 落ちました")
        return 1
    if not a.no_drill:
        if not drill():
            print("\n✕ 対照が外れた。**この見張りは、落ちるべきときに落ちられない**")
            return 2
    if not a.json:
        print(f"\n○ {len(RESULTS)}件ぜんぶ通りました（鳴らす側・鳴らさない側・"
              f"重ねない側・字の形を見た）")
    return 0


if __name__ == "__main__":
    sys.exit(main())
