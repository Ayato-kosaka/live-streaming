"""島の投げ銭（`islandSiteTips`）を台帳（`islandTips`）と貯金箱に畳むところの見張り。#1405

    python3 python/island_tips_selftest.py

**BigQuery にも Firestore にも1バイトも出ない。** 資格情報も要らない。
`python/island_tips.py` の `main()` を、偽の Firestore と偽の配信の時間帯で
**そのまま回す**（取り込みの本体ごと通す。部品だけ呼ぶと、繋ぎ忘れが通る）。

見るのは7つ。

  1. **テストの支払い（`livemode` が偽）は、台帳にも貯金箱にも入らない**
     （決定の記録 0017 の7。字の `"true"` も本番と読まない）
  2. **返金・払い戻しの請求は入らない。入っていた行は、あとで外れる**
  3. **同じ支払いを2回読んでも1行**（書類IDは `island:<session>` の SHA-1。
     2回目は1件も書かない）
  4. **`channelId` はそのまま入る。** 日・時刻・配信は Doneru と同じ当て方
  5. **読めなかった晩に、台帳の島の行を消さない**（読めたのに0件の晩も）
  6. **Doneru と島が、同じ時間帯・同じ選び方の SQL を使う**（当て方を2つにしない）。
     `--probe`（本番の Doneru の時刻で島の当て方を確かめる口）が違いを数えられること
  7. **貯金箱（`fund_daily.py`）が `fund.box.island` を `box()` で焼く**

## 対照（`BREAK=`。`docs/island-standards.md` §15）

**本物のファイルの字を書き換えた写しを読み込んで回す**（リポジトリは1バイトも
変わらない）。字が見つからなければ対照を当てられないので 2 で帰る。

  livemode … `fund_box.island_counts()` から `livemode` の守りを抜く → [1] だけが落ちる

終了コード 0=通った / 1=落ちた / 2=確かめが1つも無い・対照を当てられない。
"""

import contextlib
import hashlib
import importlib
import io
import os
import sys
import types
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

# `config.py` は BQ_PROJECT_ID が無いと読み込めない。**偽の値を置く**（どこにも出ない）
os.environ.setdefault("BQ_PROJECT_ID", "island-tips-selftest-touches-nothing")

BREAK = os.environ.get("BREAK", "")


def _stub(name: str, **attrs) -> None:
    """入っていない箱でも読み込めるように、名前だけの偽物を置く。

    本物が入っている箱（CI）では本物がそのまま使われる。**ここで使う口は
    全部あとで偽物に差し替える**ので、中身は要らない。
    """
    try:
        importlib.import_module(name)
        return
    except Exception:  # noqa: BLE001
        pass
    mod = types.ModuleType(name)
    mod.__path__ = []
    for k, v in attrs.items():
        setattr(mod, k, v)
    sys.modules[name] = mod
    if "." in name:
        parent, child = name.rsplit(".", 1)
        if parent in sys.modules:
            setattr(sys.modules[parent], child, mod)


_stub("google")
_stub("google.cloud")
_stub("google.cloud.bigquery")
_stub("google.cloud.firestore", Client=object)

# **対照：仕込みを先に刺す。** 本物の字を書き換えた写しを `fund_box` として読ませる
if BREAK == "livemode":
    src = (HERE / "fund_box.py").read_text(encoding="utf-8")
    guard = '(v or {}).get("livemode") is True and '
    if src.count(guard) != 1:
        print(f"✕ 対照を当てられない: fund_box.py に `{guard}` が {src.count(guard)} か所")
        sys.exit(2)
    broken = types.ModuleType("fund_box")
    broken.__file__ = str(HERE / "fund_box.py")
    exec(compile(src.replace(guard, ""), broken.__file__, "exec"), broken.__dict__)
    sys.modules["fund_box"] = broken
elif BREAK:
    print(f"✕ 知らない対照: BREAK={BREAK}")
    sys.exit(2)

import fund_box as fb  # noqa: E402
import fund_daily as FD  # noqa: E402
import island_tips as I  # noqa: E402

FAILED: list = []
PROBES: list = []


def ok(name, got, want):
    """1つ確かめる。"""
    PROBES.append(name)
    if got == want:
        print(f"  ○ {name}: {got}")
        return
    FAILED.append(name)
    print(f"  ✕ {name}: {got}（欲しかったのは {want}）")


# ------------------------------------------------------------ 偽の Firestore


class Snap:
    """引いた書類1件。"""

    def __init__(self, doc_id, v):
        self.id = doc_id
        self.exists = v is not None
        self._v = v

    def to_dict(self):
        return dict(self._v) if self._v is not None else None


class Ref:
    """書類を指すもの。"""

    def __init__(self, db, col, doc_id):
        self.db, self.col, self.id = db, col, doc_id

    def get(self):
        return Snap(self.id, self.db.data.get(self.col, {}).get(self.id))

    def set(self, v, merge=False):
        self.db.put(self.col, self.id, v, merge)


class Query:
    """`where(...)` / `order_by(...).limit(...)` の結果。"""

    def __init__(self, rows):
        self.rows = rows

    def limit(self, n):
        return Query(self.rows[:n])

    def stream(self):
        return [Snap(k, v) for k, v in self.rows]


class Col:
    """入れ物。**読めない入れ物**は `stream()` で例外を投げる。"""

    def __init__(self, db, name):
        self.db, self.name = db, name

    def _rows(self):
        if self.name in self.db.down:
            raise RuntimeError(f"{self.name} は読めない（偽）")
        return sorted(self.db.data.get(self.name, {}).items())

    def stream(self):
        return Query(self._rows()).stream()

    def where(self, field, op, value):
        assert op == "==", op
        return Query([(k, v) for k, v in self._rows() if v.get(field) == value])

    def order_by(self, field, direction=None):
        rows = [(k, v) for k, v in self._rows() if field in v]
        return Query(sorted(rows, key=lambda kv: kv[1][field],
                            reverse=direction == "DESCENDING"))

    def limit(self, n):
        return Query(self._rows()[:n])

    def document(self, doc_id):
        return Ref(self.db, self.name, doc_id)


class Batch:
    """まとめ書き。`commit()` で初めて入る。"""

    def __init__(self, db):
        self.db, self.ops = db, []

    def set(self, ref, v, merge=False):
        self.ops.append(("set", ref, v, merge))

    def delete(self, ref):
        self.ops.append(("delete", ref, None, False))

    def commit(self):
        for op, ref, v, merge in self.ops:
            if op == "set":
                self.db.put(ref.col, ref.id, v, merge)
            else:
                self.db.writes.append(("delete", ref.col, ref.id))
                self.db.data.get(ref.col, {}).pop(ref.id, None)
        self.ops = []


class Db:
    """偽の Firestore。`data[入れ物][書類ID] = 中身`。書いた跡は `writes`。"""

    def __init__(self, data=None, down=()):
        self.data = data if data is not None else {}
        self.down = set(down)
        self.writes = []

    def put(self, col, doc_id, v, merge):
        self.writes.append(("set", col, doc_id))
        box = self.data.setdefault(col, {})
        if merge:
            box[doc_id] = _deep(box.get(doc_id) or {}, v)
        else:
            box[doc_id] = dict(v)

    def collection(self, name):
        return Col(self, name)

    def get_all(self, refs):
        return [r.get() for r in refs]

    def batch(self):
        return Batch(self)


def _deep(a: dict, b: dict) -> dict:
    """`merge=True` の混ぜ方（入れ子の辞書は欄ごとに混ぜる。Firestore と同じ）。"""
    out = dict(a)
    for k, v in b.items():
        out[k] = _deep(out[k], v) if isinstance(v, dict) and isinstance(out.get(k), dict) else v
    return out


# ------------------------------------------------------------ 偽のデータ

# 形は本物と同じ（`UC` + 22文字・`cs_live_…`）。**値は全部こしらえもの**
CID_A = "UCzzFAKEisland000000001"
CID_B = "UCzzFAKEisland000000002"
# 2026-11-23 15:30 UTC = 2026-11-24 00:30 JST（**日本時間で翌日に切れる**）
PAID_A = 1795447800000
PAID_B = PAID_A + 60_000
VIDEO = {"video_id": "vFAKE0000001", "started_ms": PAID_A - 3_600_000}
# 配信の時間帯に当たった時刻だけを返す（`SQL_ISLAND` の偽物）。B は配信の外
HITS = {PAID_A: VIDEO, PAID_B: {"video_id": None, "started_ms": None}}


def site(**over):
    """`islandSiteTips` 1件（本番の払い・まだ `paid`）。"""
    v = {"livemode": True, "uid": "uFAKE", "channelId": CID_A,
         "displayNameSnapshot": "ふしぎな視聴者さん", "amount": 1000,
         "currency": "JPY", "message": "（こしらえ）", "paidAt": PAID_A,
         "paymentIntentId": "pi_FAKE", "settlementAmount": 960, "status": "paid"}
    v.update(over)
    return v


def key(sid: str) -> str:
    """台帳の書類ID（`island_tips.doc_id` を通さずに、仕様の字から組む）。"""
    return hashlib.sha1(f"island:{sid}".encode("utf-8")).hexdigest()[:32]


def island_rows(db) -> dict:
    """台帳の島の行。"""
    return {k: v for k, v in db.data.get("islandTips", {}).items()
            if v.get("source") == "island"}


# 取り込みが素で出した字（`::warning::` の注記）。**受け止めて中身を見る。**
# 素通しにすると、この見張りの run に偽の注記が並ぶ
SAID: list = []


def run(db, *argv) -> int:
    """`island_tips.main()` を偽の口で回す。**スパチャと Doneru は0件**にする。"""
    I.firestore = types.SimpleNamespace(Client=lambda project=None: db)
    I.fetch_youtube = lambda d0, d1: []
    I.fetch_doneru = lambda d0, d1, donors: []
    I.window_hits = lambda ms: {m: HITS[m] for m in ms if m in HITS}
    old = sys.argv
    sys.argv = ["island_tips.py", *argv]
    out = io.StringIO()
    try:
        with contextlib.redirect_stdout(out):
            return I.main()
    finally:
        sys.argv = old
        SAID[:] = out.getvalue().splitlines()


def warned(word: str) -> bool:
    """直前の1回で、`word` を含む注記（`::warning::`）を出したか。"""
    return any(x.startswith("::warning::") and word in x for x in SAID)


# ------------------------------------------------------------ 確かめ


def case_livemode():
    """[1] テストの支払いは、台帳にも貯金箱にも入らない。"""
    print("\n[1] テストの支払い（livemode が偽）は、台帳にも貯金箱にも入らない")
    db = Db({"islandSiteTips": {
        "cs_live_A": site(),
        "cs_test_T": site(livemode=False, channelId=CID_B, amount=5000),
        # 字の "true" も、1 も、本番の払いと読まない
        "cs_test_S": site(livemode="true", channelId=CID_B, amount=7000),
        "cs_test_N": site(livemode=1, channelId=CID_B, amount=9000),
    }})
    run(db)
    ok("台帳に入ったのは本番の払いだけ", sorted(island_rows(db)), [key("cs_live_A")])
    got = fb.read_island(db)
    ok("貯金箱に足すのも本番の払いだけ", got["island"], 1000)
    ok("数に入れなかったものを数える", got["islandOut"], 3)


def case_refund():
    """[2] 返金・払い戻しの請求は入らない。入っていたら外れる。"""
    print("\n[2] 返金・払い戻しの請求は入らない。入っていた行は、あとで外れる")
    db = Db({"islandSiteTips": {
        "cs_live_A": site(),
        "cs_live_R": site(channelId=CID_B, paidAt=PAID_B),
        "cs_live_D": site(channelId=CID_B, paidAt=PAID_B + 1),
        "cs_live_X": site(status="refunded", paidAt=PAID_B + 2),
    }})
    run(db)
    ok("1晩め: 払われている3件が入る（返金済みの1件は入らない）",
       sorted(island_rows(db)), sorted(key(s) for s in ("cs_live_A", "cs_live_R", "cs_live_D")))
    db.data["islandSiteTips"]["cs_live_R"]["status"] = "refunded"
    db.data["islandSiteTips"]["cs_live_D"]["status"] = "disputed"
    db.writes.clear()
    run(db)
    ok("2晩め: 返金と払い戻しの請求になった行は台帳から外れる",
       sorted(island_rows(db)), [key("cs_live_A")])
    ok("外すのは行ごと消す（印を付けて残さない）",
       sorted(w[2] for w in db.writes if w[0] == "delete"),
       sorted(key(s) for s in ("cs_live_R", "cs_live_D")))
    ok("貯金箱にも入らない", fb.read_island(db)["island"], 1000)
    # 受け取りの書類ごと無くなった支払いも外れる（ほかの書類が読めているとき）
    del db.data["islandSiteTips"]["cs_live_X"]
    db.data["islandTips"][key("cs_live_G")] = {"source": "island", "channelId": CID_B}
    run(db)
    ok("受け取りの書類が無くなった行も外れる", sorted(island_rows(db)), [key("cs_live_A")])


def case_twice():
    """[3] 同じ支払いを2回読んでも1行。"""
    print("\n[3] 同じ支払いを2回読んでも1行")
    db = Db({"islandSiteTips": {"cs_live_A": site()}})
    run(db)
    first = dict(island_rows(db))
    db.writes.clear()
    run(db)
    ok("2回回しても島の行は1行", len(island_rows(db)), 1)
    ok("2回目は1件も書かない（中身が同じなら書かない）", db.writes, [])
    ok("書類IDは `island:<session>` の SHA-1 の頭32文字",
       list(first), [key("cs_live_A")])
    ok("取り込みの書類IDの作り方と同じ", I.doc_id("island:cs_live_A"), key("cs_live_A"))


def case_row():
    """[4] channelId はそのまま。日・時刻・配信は Doneru と同じ当て方。"""
    print("\n[4] 台帳の1行の中身")
    db = Db({"islandSiteTips": {"cs_live_A": site(), "cs_live_B": site(
        channelId=CID_B, paidAt=PAID_B, settlementAmount=None)}})
    run(db)
    a = db.data["islandTips"][key("cs_live_A")]
    b = db.data["islandTips"][key("cs_live_B")]
    ok("出どころは island", a["source"], "island")
    ok("元のIDは island:<checkoutSessionId>", a["sourceEventId"], "island:cs_live_A")
    ok("channelId は受け取りの書類のまま", (a["channelId"], b["channelId"]), (CID_A, CID_B))
    ok("日は払い終わった瞬間の日本時間（UTC の 15:30 は翌日）", a["day"], "2026-11-24")
    ok("時刻は paidAt のまま", a["donatedAt"], PAID_A)
    ok("配信の時間帯に当たれば videoId と始まりが入る",
       (a["videoId"], a["videoStartedAt"]), (VIDEO["video_id"], VIDEO["started_ms"]))
    ok("当たらなければ None（0 や空文字にしない）",
       (b["videoId"], b["videoStartedAt"]), (None, None))
    ok("額は払った額のまま・円", (a["amount"], a["currency"]), (1000, "JPY"))
    ok("手数料を引いた額は持つ（引けなければ None）",
       (a["settlementAmount"], b["settlementAmount"]), (960, None))
    ok("名前はアラートに出したもの", a["displayNameSnapshot"], "ふしぎな視聴者さん")
    ok("円なので換算の欄は空", (a["amountJpy"], a["fxWhy"]), (None, None))
    ok("メッセージと uid は台帳に持ち込まない", ("message" in a, "uid" in a), (False, False))


def case_unreadable():
    """[5] 読めなかった晩に、台帳の島の行を消さない。"""
    print("\n[5] 受け取りの書類が読めなかった晩")
    keep = {key("cs_live_A"): {"source": "island", "channelId": CID_A, "day": "2026-11-24"}}
    db = Db({"islandTips": dict(keep),
             "islandSiteTips": {"cs_live_Z": site(paidAt=PAID_B)}},
            down={"islandSiteTips"})
    rc = run(db)
    ok("読めなかった晩: 注記を出す", warned("読めない"), True)
    ok("読めなかった晩: 島の行は消えない", island_rows(db), keep)
    ok("読めなかった晩: 島の行を足しもしない（書いた跡が無い）", db.writes, [])
    ok("終了コードは 0（後ろのカード作りを止めない）", rc, 0)

    db = Db({"islandTips": dict(keep), "islandSiteTips": {}})
    run(db)
    ok("読めたのに0件の晩: 注記を出す", warned("0件"), True)
    ok("読めたのに0件で台帳に島の行が在る晩も、消さない", island_rows(db), keep)

    # 払われているのに時刻が読めない行は、入れないが在るものは消さない
    db = Db({"islandTips": dict(keep),
             "islandSiteTips": {"cs_live_A": site(paidAt=None)}})
    run(db)
    ok("時刻の読めない払い: 注記を出す", warned("paidAt"), True)
    ok("時刻の読めない払いは、在る行を消さない", island_rows(db), keep)
    # **両側。** ふつうの晩は注記を1つも出さない（出し続けると誰も読まなくなる）
    run(Db({"islandSiteTips": {"cs_live_A": site()}}))
    ok("ふつうの晩は注記を出さない", [x for x in SAID if x.startswith("::")], [])


def case_sql():
    """[6] Doneru と島で、同じ時間帯・同じ選び方の SQL。"""
    print("\n[6] 配信への当て方が Doneru と同じか")
    ok("Doneru の SQL が共通の時間帯を使う", I._WIN in I.SQL_DONERU, True)
    ok("島の SQL が共通の時間帯を使う", I._WIN in I.SQL_ISLAND, True)
    ok("Doneru の SQL が共通の選び方を使う", I._PICK in I.SQL_DONERU, True)
    ok("島の SQL が共通の選び方を使う", I._PICK in I.SQL_ISLAND, True)
    ok("時間帯の終わりは最後のチャット + 30分", "INTERVAL 30 MINUTE" in I._WIN, True)
    ok("またがったら始まりの新しいほう", "ORDER BY w.started_ms DESC LIMIT 1" in I._PICK, True)

    # `--probe`（本番の Doneru の時刻で島の当て方を確かめる口）が、違いを数えられるか。
    # **両側。** 同じなら 0、1件でも違えば 1、比べるものが無ければ 2
    dn = [{"donatedAt": PAID_A, "videoId": VIDEO["video_id"], "videoStartedAt": VIDEO["started_ms"]},
          {"donatedAt": PAID_B, "videoId": None, "videoStartedAt": None}]
    I.fetch_doneru = lambda d0, d1, donors: dn
    I.window_hits = lambda ms: {m: HITS[m] for m in ms if m in HITS}
    ok("probe: 当て方が全件同じなら 0", I.probe("d0", "d1"), 0)
    I.window_hits = lambda ms: {m: {"video_id": "vOTHER", "started_ms": 1} for m in ms}
    ok("probe: 1件でも違えば 1", I.probe("d0", "d1"), 1)
    I.fetch_doneru = lambda d0, d1, donors: []
    ok("probe: 比べるものが無ければ 2（0件を「同じ」と言わない）", I.probe("d0", "d1"), 2)


def case_box():
    """[7] 貯金箱が `fund.box.island` を `box()` で焼く。"""
    print("\n[7] 貯金箱（fund_daily.py）が島の投げ銭を焼く")
    db = Db({
        fb.C_SUPERCHAT: {"sc1": {"yen": 1001, "who": "a", "claim": ""}},
        fb.C_SPEND: {"sp1": {"yen": 300}},
        fb.C_GOAL: {"g1": {"from": "2026-11-01", "to": None, "label": "（偽）", "yen": 9}},
        fb.C_ISLAND: {"cs_live_A": site(), "cs_live_B": site(amount=500, paidAt=PAID_B),
                      "cs_live_R": site(amount=700, status="refunded"),
                      # 数に入れてよいのに額が読めない。**0 として足さない**
                      "cs_live_Q": site(amount=None)},
        "island": {"state": {"fund": {"superchat": 1, "box": {"keep": "残す"}}}},
    })
    FD.firestore = types.SimpleNamespace(Client=lambda project=None: db)
    FD.fb.bq_superchats = lambda project, dataset, days: []
    old = sys.argv
    sys.argv = ["fund_daily.py"]
    out = io.StringIO()
    try:
        with contextlib.redirect_stdout(out):
            note = FD.run()
    finally:
        sys.argv = old
    got = db.data["island"]["state"]["fund"]["box"]
    ok("fund.box.island は本番で払われ、いまも paid のものの合計", got["island"], 1500)
    ok("足した件数", got["islandCount"], 2)
    ok("額の読めない払いは件数で出る（足さない）", note["islandBroken"], 1)
    ok("額の読めない払いは注記にも出る",
       any(x.startswith("::warning::") and "額が読めず" in x
           for x in out.getvalue().splitlines()), True)
    ok("貯金箱は box() で、島は割らずに足す",
       note["box"], fb.box(1001, 0, 300, island_yen=1500))
    ok("スパチャは半分・島はそのまま（1001÷2 + 1500 − 300）", note["box"], 500 + 1500 - 300)
    ok("ほかの人が書いた欄を消さない（merge）",
       (db.data["island"]["state"]["fund"]["superchat"], got.get("keep")), (1, "残す"))


def main() -> int:
    print("=== 島の投げ銭を台帳と貯金箱に畳むところを、偽のデータで確かめる ===")
    print("（BigQuery にも Firestore にも1バイトも触りません）")
    if BREAK:
        print(f"*** 対照: BREAK={BREAK} ***")
    case_livemode()
    case_refund()
    case_twice()
    case_row()
    case_unreadable()
    case_sql()
    case_box()

    print()
    if not PROBES:
        print("✕ 確かめが1つもありませんでした（数えるものが無い）")
        return 2
    if FAILED:
        print(f"✕ 通らなかった確かめ {len(FAILED)} 件: {', '.join(FAILED)}")
        return 1
    print(f"○ {len(PROBES)} 件ぜんぶ通りました")
    return 0


if __name__ == "__main__":
    sys.exit(main())
