"""**`chat_day` の振る舞いを、偽の Firestore で実際に動かして確かめる。**

    python3 python/admin/chat_day_selftest.py

終了コード 0=通った / 1=落ちた / **2=数えるものが無い**
（`docs/island-standards.md` §15）。

**本番にも資格情報にも触らない。** 偽のクライアントを差し込んで、
`chat_day.main()` をそのまま動かし、**ログに出た字**を見る。

## なぜ要るか

出した初日に、**930行ぜんぶに `[投げ銭]` の印が付いた**（2026-09-20）。
判定を `kind != "text"` と書いたが、Firestore に入るのは
`textMessageEvent` / `superChatEvent` で、**`"text"` は一度も使われない。**
字面を読むだけでは気づけない——`"text"` は**それらしく見える**から。

落ちても赤くならない種類の不具合でもある。件数も人数も正しく、
**印だけが嘘**だったので、ログを読んだ人が「35人が6時間で930件の投げ銭」を
信じるまで誰も気づかない。

## 何を見るか

| | 見るもの | 落ちたら |
| --- | --- | --- |
| 1 | `textMessageEvent` に投げ銭の印が**付かない** | 1 |
| 2 | `superChatEvent` に印が**付く** | 1 |
| 3 | `kind` が無い古い書類は、投げ銭では**ない**側 | 1 |
| 4 | **口の決まりと同じ条件**（`chatCapture.ts` の `keep` の後半をそのまま当てる） | 1 |
| 5 | bot（`@あやとグルメアプリ`）と `said hi` を落とす | 1 |
| 6 | `paid: true` のとき、投げ銭の行だけ出る | 1 |
| 7 | 起点が取れなかったら「**ずれている可能性**」と言う | 1 |
| 8 | 0件のときは**1行も出さずに 2**（「無い」と「読めなかった」を混ぜない） | 1 |
| 9 | 金額・チャンネルID・書類IDが**1文字も出ない** | 1 |
| 10 | **1バイトも書かない**（書く口を叩くと落ちる） | 1 |
| 11 | 対照。`BREAK=` で足を1本抜くと、**その足の対照だけが落ちる** | 1 |

**9 がいちばん大事。** ここは公開の Actions のログに出る。
足す人が1欄増やした日に、額やIDが混ざっていないことを数える。
"""

import io
import os
import subprocess
import sys
import types

HERE = os.path.dirname(os.path.abspath(__file__))
BREAK = os.environ.get("BREAK", "")
LEGS = ("paid", "bot", "base", "veil")

CHECKS = 0
FAILED: list[str] = []


def ck(name: str, ok: bool, got: object = "") -> None:
    """1件ぶん確かめて数える。"""
    global CHECKS
    CHECKS += 1
    print(f"  {'○' if ok else '✕'} {name}" + ("" if ok else f" … 実際: {got!r}"))
    if not ok:
        FAILED.append(name)


class FakeDoc:
    """Firestore の書類1枚ぶん。"""

    def __init__(self, data: dict) -> None:
        self._d = data

    def to_dict(self) -> dict:
        return dict(self._d)


class FakeQuery:
    """`where(...)` のあとに `stream()` を呼ぶところだけ。"""

    def __init__(self, rows: list[dict], video: str) -> None:
        self._rows, self._video = rows, video

    def stream(self):
        return [FakeDoc(r) for r in self._rows if r.get("videoId") == self._video]


class FakeCollection:
    """書こうとしたら落ちる置き場。**下見が本番を汚さないことを、ここで見る。**"""

    def __init__(self, rows: list[dict], wrote: list) -> None:
        self._rows, self._wrote = rows, wrote

    def where(self, field, op, value):  # noqa: ANN001 — Firestore の形に合わせる
        assert field == "videoId" and op == "=="
        return FakeQuery(self._rows, value)

    def stream(self):
        return [FakeDoc(r) for r in self._rows]

    def document(self, _id):  # noqa: ANN001
        self._wrote.append(_id)
        raise AssertionError("書こうとしました")


class FakeClient:
    """`streamChatMessages` と `streamChatRuns` だけ返す。"""

    def __init__(self, msgs: list[dict], runs: list[dict]) -> None:
        self.msgs, self.runs, self.wrote = msgs, runs, []

    def collection(self, name: str):
        if name == "streamChatMessages":
            return FakeCollection(self.msgs, self.wrote)
        if name == "streamChatRuns":
            return FakeCollection(self.runs, self.wrote)
        raise AssertionError(f"知らない置き場を読みました: {name}")


def load(argv: dict, msgs: list[dict], base_ms: int | None):
    """`chat_day` を偽の `_fs` ごと読み込み直して、出た字を返す。

    Returns:
        (出た行のリスト, 終了コード, 偽クライアント)
    """
    for m in ("chat_day", "clip_cuts", "_fs"):
        sys.modules.pop(m, None)
    sys.path.insert(0, HERE)

    out: list[str] = []
    fake = FakeClient(msgs, [{"videoId": "v1"}])

    fs = types.ModuleType("_fs")
    fs.args = lambda: dict(argv)
    fs.db = lambda: fake
    fs.readonly = lambda c: c
    fs.log = types.SimpleNamespace(
        info=lambda f, *a: out.append(str(f) % a if a else str(f)),
        error=lambda f, *a: out.append(str(f) % a if a else str(f)),
    )
    sys.modules["_fs"] = fs

    import chat_day  # noqa: E402 — 偽の `_fs` を置いたあとでなければ読めない

    if BREAK == "paid":
        # **出した初日に踏んだ形をそのまま戻す。** ここを抜くと 1〜4 が落ちる
        chat_day.is_paid = lambda k: bool(k and k != "text")
    if BREAK == "bot":
        chat_day.SKIP_AUTHOR = set()
    if BREAK == "base":
        chat_day.stream_start_ms = lambda v: (0, "videos.actual_start_time")
    if BREAK == "veil":
        # 額を1つ混ぜる。**9 の対照**
        chat_day.MAX_LINES = 4000
        real = chat_day.hms
        chat_day.hms = lambda s: f"{real(s)} ¥1,000"
    if BREAK and BREAK not in LEGS:
        print(f"✕ 知らない足の名前です: {BREAK}（あるのは {', '.join(LEGS)}）")
        sys.exit(1)

    chat_day.stream_start_ms = (
        chat_day.stream_start_ms
        if BREAK == "base"
        else (lambda v: (base_ms, "videos.actual_start_time") if base_ms is not None
              else (None, ""))
    )

    code = 0
    try:
        chat_day.main()
    except SystemExit as e:
        code = int(e.code or 0)
    return out, code, fake


def rows() -> list[dict]:
    """本番と同じ形の1日ぶん。`kind` は口が入れる字をそのまま使う。"""
    b = 1_700_000_000_000
    return [
        {"videoId": "v1", "at": b + 10_000, "name": "@まこも-z3i",
         "text": "ついたね", "kind": "textMessageEvent"},
        {"videoId": "v1", "at": b + 20_000, "name": "@まーさん7286",
         "text": "おめでとう", "kind": "superChatEvent"},
        {"videoId": "v1", "at": b + 30_000, "name": "@たぃpi",
         "text": "きれい"},
        {"videoId": "v1", "at": b + 40_000, "name": "@あやとグルメアプリ",
         "text": "観光開始や！", "kind": "textMessageEvent"},
        {"videoId": "v1", "at": b + 50_000, "name": "@だれか",
         "text": "said hi", "kind": "textMessageEvent"},
        {"videoId": "v2", "at": b + 60_000, "name": "@べつの配信",
         "text": "こっちは出ない", "kind": "textMessageEvent"},
    ]


def case_paid() -> None:
    """1〜4: 投げ銭の印。"""
    print("[1] 投げ銭の印")
    b = 1_700_000_000_000
    out, code, _ = load({"video": "v1"}, rows(), b)
    body = [ln for ln in out if ln.startswith("0:00")]
    ck("終了コード 0", code == 0, code)
    plain = [ln for ln in body if "ついたね" in ln]
    paid = [ln for ln in body if "おめでとう" in ln]
    nokind = [ln for ln in body if "きれい" in ln]
    ck("textMessageEvent に印が付かない",
       bool(plain) and "[投げ銭]" not in plain[0], plain)
    ck("superChatEvent に印が付く",
       bool(paid) and "[投げ銭]" in paid[0], paid)
    ck("kind が無い書類は投げ銭ではない",
       bool(nokind) and "[投げ銭]" not in nokind[0], nokind)

    # **口の決まりと同じ条件か。** `chatCapture.ts` の `keep` の後半をそのまま当てる
    sys.path.insert(0, HERE)
    import chat_day  # noqa: E402
    same = all(
        chat_day.is_paid(k) == (k != "" and k != "textMessageEvent")
        for k in ("", "textMessageEvent", "superChatEvent", "superStickerEvent",
                  "membershipGiftingEvent", "text")
    )
    ck("口（chatCapture.keep）と同じ条件", same)


def case_filter() -> None:
    """5〜6: 落とすものと、投げ銭だけ。"""
    print("[2] 落とすもの・絞るもの")
    b = 1_700_000_000_000
    out, _, _ = load({"video": "v1"}, rows(), b)
    joined = "\n".join(out)
    ck("bot を落とす", "@あやとグルメアプリ" not in joined)
    ck("said hi を落とす", "said hi" not in joined)
    ck("別の配信の行が混ざらない", "こっちは出ない" not in joined)

    out2, _, _ = load({"video": "v1", "paid": True}, rows(), b)
    body2 = [ln for ln in out2 if ln.startswith("0:00")]
    ck("paid:true で投げ銭の行だけ", len(body2) == 1 and "おめでとう" in body2[0],
       body2)


def case_base() -> None:
    """7: 起点が取れなかったら、そう言う。"""
    print("[3] 起点")
    out, _, _ = load({"video": "v1"}, rows(), None)
    head = "\n".join(out[:2])
    ck("代用したと言う", "ずれている可能性" in head, head)


def case_empty() -> None:
    """8: 0件と「読めなかった」を混ぜない。"""
    print("[4] 0件")
    out, code, _ = load({"video": "v9"}, rows(), 1_700_000_000_000)
    ck("終了コード 2", code == 2, code)
    ck("1行も出さない", not [ln for ln in out if ln.startswith("0:")], out)


def case_veil() -> None:
    """9〜10: 出してはいけないものと、書かないこと。"""
    print("[5] 公開のログに出さないもの")
    b = 1_700_000_000_000
    out, _, fake = load({"video": "v1"}, rows(), b)
    joined = "\n".join(out)
    bad = [w for w in ("¥", "UC", "円", "amount", "channelId") if w in joined]
    ck("金額・チャンネルID・書類IDが出ない", not bad, bad)
    ck("1バイトも書かない", fake.wrote == [], fake.wrote)


def case_drill() -> None:
    """11: 対照。足を1本抜くと、その足の対照だけが落ちる。"""
    print("[6] 対照（この見張りそのものが効いているか）")
    if BREAK:
        print("  （足を抜いた回なので、対照は回しません）")
        return
    for leg in LEGS:
        env = dict(os.environ, BREAK=leg)
        p = subprocess.run([sys.executable, os.path.abspath(__file__)],
                           capture_output=True, text=True, env=env)
        ck(f"BREAK={leg} で落ちる", p.returncode != 0, p.returncode)
    env = dict(os.environ, BREAK="しらない足")
    p = subprocess.run([sys.executable, os.path.abspath(__file__)],
                       capture_output=True, text=True, env=env)
    ck("知らない足の名前は落とす", p.returncode != 0, p.returncode)


def main() -> int:
    """エントリポイント。"""
    print("=== 偽の Firestore で chat_day を動かす（本番には1行も出ない） ===")
    if BREAK:
        print(f"  （足を抜いています: {BREAK}）")
    case_paid()
    case_filter()
    case_base()
    case_empty()
    case_veil()
    case_drill()
    print()
    if CHECKS == 0:
        print("✕ 数えるものがありませんでした")
        return 2
    if FAILED:
        print(f"✕ 通らなかった確かめ {len(FAILED)} / {CHECKS} 件: {', '.join(FAILED)}")
        return 1
    print(f"○ {CHECKS} 件ぜんぶ通りました")
    return 0


if __name__ == "__main__":
    sys.exit(main())
