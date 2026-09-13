"""偽の Firestore で、**1書類を消す道具の縛りを実際に動かして確かめる。**

    python3 python/admin/firestore_delete_selftest.py

**本番には1バイトも出ない。** Firestore も資格情報も要らない
（`firestore_delete.py` が触る口を偽物に差し替えてある）。確かめるのは6つ:

  1. **既定は空回しで、1件も消えない。** `apply` を渡すまで `delete()` が
     1回も呼ばれない
  2. **表（`DELETABLE`）に無い入れ物は、`apply` を付けても消えない。**
     しかも**引きもしない**（生きた台帳を手元へ持ってこない）
  3. **表にある入れ物は `apply` で消える。** 消えるのは指した1書類だけで、
     同じ入れ物の隣の書類は1件も減らない
  4. 無い書類を指しても落ちない（0件で静かに終わる）
  5. **消したつもりを作らない。** 消えていなければ 1 で落ちる
  6. **出力を grep して、書類IDもコレクション名も中身も0件**
     （0件を信じる前に、**その探し方が仕込んだ字に当たること**を先に見る）

## なぜ「引いたかどうか」まで数えるのか（2）

表に無い入れ物を弾くのは、**引く前でなければ意味が薄い。** 引いてから弾くと、
視聴者さんの書いた字が Actions の走る箱の中に一度は載る。**弾く位置**は
結果（消えた件数）だけでは言えないので、偽の Firestore に
`get()` が何回来たかを数えさせて、位置のほうで言う。

## 6 の測りかた

このリポジトリは公開で、Actions のログも誰でも読める。
書類IDが1つ出れば、`islandRate` なら端末IDが、`islandHearts` なら
「誰がどの付箋を押したか」がそのまま読める。
「出していないつもり」ではなく、**出たものを見る。**
`sys.stdout` と `sys.stderr` を二股にして出力を丸ごと溜め、最後にそこを
正規表現で探す（`log` は stderr へ出るので、**両方**を溜める必要がある）。

探す形は本番と同じ。書類IDは Firestore の自動採番と同じ20文字の英数字、
上限の印は `{種別}_{日付}_{端末ID}`（`takeQuota()` の実物）、端末IDは
`crypto.randomUUID()` と同じ36文字（`site/lib/api.ts`）。
**形の違うもので試すと、本番では効かない字を探すことになる。**
"""

import io
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# 実際の出力を溜める袋。**firestore_delete（＝_fs の basicConfig）を読み込む
# 前に**二股にしておく。logging のハンドラは作られた時点の stream を握るため
BUF = io.StringIO()
REAL_OUT, REAL_ERR = sys.stdout, sys.stderr


class Tee:
    """画面にも出しつつ、袋にも同じものを入れる。"""

    def __init__(self, *ws):
        self.ws = ws

    def write(self, s):
        for w in self.ws:
            w.write(s)
        return len(s)

    def flush(self):
        for w in self.ws:
            try:
                w.flush()
            except Exception:  # noqa: BLE001
                pass


sys.stdout = Tee(REAL_OUT, BUF)
sys.stderr = Tee(REAL_ERR, BUF)

# `_fs` が読む `config.py` は、この環境変数が無いと import の時点で落ちる。
# ここで作る Firestore クライアントは偽物なので**本物の名前は要らない**が、
# 無いと確かめそのものが起動できない。**手元の値を上書きはしない**
os.environ.setdefault("BQ_PROJECT_ID", "firestore-delete-selftest")

import firestore_delete  # noqa: E402

# ---------------------------------------------------------------- 偽の中身

# 端末ID。本番は `crypto.randomUUID()`（36文字）
CID = "3f2a1c88-5b7e-4d61-9a03-8e1f20c4b7d5"


def doc_id(n: int) -> str:
    """Firestore の自動採番と同じ形（20文字の英数字）。"""
    abc = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"
    out = []
    v = n * 2654435761 + 12345
    for _ in range(20):
        v = (v * 1103515245 + 12345) & 0x7FFFFFFF
        out.append(abc[v % len(abc)])
    return "".join(out)


class Snap:
    """DocumentSnapshot のかわり。"""

    def __init__(self, data):
        self._data = data

    @property
    def exists(self) -> bool:
        return self._data is not None

    def to_dict(self):
        return None if self._data is None else dict(self._data)


class Ref:
    """DocumentReference のかわり。**引いた回数と消した回数を数える。**"""

    def __init__(self, client, col, key):
        self.client, self.col, self.key = client, col, key

    def get(self):
        self.client.gets.append((self.col, self.key))
        return Snap(self.client.store.get(self.col, {}).get(self.key))

    def delete(self):
        self.client.deletes.append((self.col, self.key))
        self.client.store.get(self.col, {}).pop(self.key, None)


class Col:
    def __init__(self, client, name):
        self.client, self.name = client, name

    def document(self, key):
        return Ref(self.client, self.name, key)


class Fake:
    """偽の Firestore。引いた先と消した先を1件ずつ覚える。"""

    def __init__(self, store):
        self.store = store
        self.gets: list = []
        self.deletes: list = []

    def collection(self, name):
        return Col(self, name)


def make_store() -> dict:
    """本番に似せた中身を作る。

    **表にあるものと、表に無いものを両方入れる。** 表に無いほうには
    視聴者さんの字とお金を入れてある（弾けていなければ grep に出る）。
    """
    rate = {}
    for kind in ("note", "visit", "poll"):
        rate[f"{kind}_2026-09-13_{CID}"] = {
            "n": 3, "kind": kind, "day": "2026-09-13",
            "updatedAt": 1757700000000,
        }
    remote = {doc_id(1): {"sessionId": doc_id(1), "at": "/", "step": 2}}
    roulette = {doc_id(2): {"options": ["あたり", "はずれ"], "spun": 1}}
    review = {doc_id(3): {"scene": 2, "step": 5, "ts": 1757700000000,
                          "confetti": 0}}
    # ---- ここから下は**表に無い**入れ物。1文字も消えてはいけない
    notes = {
        doc_id(10 + i): {
            "theme": "nordic",
            "text": f"付箋の本文 {i}",
            "cid": CID,
            "createdAt": 1757000000000 + i,
        }
        for i in range(3)
    }
    tips = {
        doc_id(20 + i): {"yen": 500 + i, "channelId": doc_id(900 + i),
                         "at": 1757000000000 + i}
        for i in range(2)
    }
    visits = {"2026-09-13": {"n": 42, "day": "2026-09-13"}}
    return {
        "islandRate": rate,
        "islandRemote": remote,
        "rouletteSessions": roulette,
        "monthlyReview": review,
        "islandNotes": notes,
        "islandTips": tips,
        "islandVisits": visits,
    }


# 表に無い入れ物（確かめの中でだけ使う。**本番の判断は firestore_delete 側**）
LOCKED = tuple(
    c for c in make_store() if c not in firestore_delete.DELETABLE
)


def deep(store: dict) -> dict:
    """中身の控え（見比べ用）。"""
    return {c: {k: dict(v) for k, v in d.items()} for c, d in store.items()}


def one(store: dict, col: str) -> str:
    """その入れ物の書類を1つ選ぶ（**手でIDを書かない**）。"""
    return next(iter(store[col]))


def total(store: dict) -> int:
    return sum(len(d) for d in store.values())


# ---------------------------------------------------------------- 確かめる

FAILED: list = []


def ck(name: str, cond: bool, got) -> None:
    """**got に名前もIDも入れない。** ここも grep の対象になる。"""
    mark = "○" if cond else "✕"
    print(f"    {mark} {name}: {got}")
    if not cond:
        FAILED.append(name)


def call(client, col, doc, apply):
    """走らせて、返り値か止まった番号を返す。"""
    try:
        return firestore_delete.run(client, col, doc, apply)
    except SystemExit as e:
        return f"exit:{e.code}"


def case1_dry():
    print("\n[1] 既定は空回し。表にあるものでも1件も消えない")
    store = make_store()
    was, n0 = deep(store), total(store)
    c = Fake(store)
    outs = [call(c, col, one(store, col), False)
            for col in firestore_delete.DELETABLE]
    ck("表にある入れ物の数", len(outs) == len(firestore_delete.DELETABLE),
       len(outs))
    ck("消した件数（ぜんぶ 0）", set(outs) == {0}, sorted(set(map(str, outs))))
    ck("delete() が呼ばれた回数", len(c.deletes) == 0, len(c.deletes))
    ck("書類の数（減っていない）", total(store) == n0, total(store))
    ck("中身が1文字も変わっていない", deep(store) == was, "変わっていない")


def case2_locked():
    print("\n[2] 表に無い入れ物は、apply を付けても消えない")
    store = make_store()
    was, n0 = deep(store), total(store)
    c = Fake(store)
    outs = [call(c, col, one(store, col), True) for col in LOCKED]
    ck("表に無い入れ物の数（確かめた数）", len(outs) == len(LOCKED), len(outs))
    ck("止まりかた（ぜんぶ exit:2）", set(outs) == {"exit:2"},
       sorted(set(map(str, outs))))
    ck("delete() が呼ばれた回数", len(c.deletes) == 0, len(c.deletes))
    # **引く前に弾く。** 弾いたあとに引いていたら、台帳が手元に載っている
    ck("get() が呼ばれた回数（引く前に弾く）", len(c.gets) == 0, len(c.gets))
    ck("書類の数（減っていない）", total(store) == n0, total(store))
    ck("中身が1文字も変わっていない", deep(store) == was, "変わっていない")


def case3_apply():
    print("\n[3] 表にある入れ物は apply で消える。消えるのは指した1つだけ")
    store = make_store()
    was, n0 = deep(store), total(store)
    c = Fake(store)
    picked = {col: one(store, col) for col in firestore_delete.DELETABLE}
    outs = [call(c, col, key, True) for col, key in picked.items()]
    ck("消した件数（ぜんぶ 1）", set(outs) == {1}, sorted(set(map(str, outs))))
    ck("delete() が呼ばれた回数",
       len(c.deletes) == len(picked), len(c.deletes))
    ck("書類の数（指したぶんだけ減った）",
       total(store) == n0 - len(picked), total(store))
    # 指した書類だけが消えていること
    gone = [col for col, key in picked.items() if key in store[col]]
    ck("指したのに残っている入れ物", not gone, len(gone))
    rest = {
        c2: {k: v for k, v in d.items() if picked.get(c2) != k}
        for c2, d in was.items()
    }
    ck("隣の書類が1つでも変わったか", deep(store) == rest, "変わっていない")
    # 表に無い入れ物には指1本触れていない
    touched = {col for col, _ in c.deletes} & set(LOCKED)
    ck("表に無い入れ物を触った回数", not touched, len(touched))


def case4_missing():
    print("\n[4] 無い書類を指しても、落ちずに 0 件")
    store = make_store()
    n0 = total(store)
    c = Fake(store)
    col = next(iter(firestore_delete.DELETABLE))
    out = call(c, col, doc_id(777), True)
    ck("消した件数", out == 0, out)
    ck("delete() が呼ばれた回数", len(c.deletes) == 0, len(c.deletes))
    ck("書類の数（減っていない）", total(store) == n0, total(store))


def case5_notgone():
    print("\n[5] 消えていなければ 1 で落ちる（消したつもりを作らない）")
    store = make_store()
    col = next(iter(firestore_delete.DELETABLE))
    key = one(store, col)

    class Stubborn(Fake):
        """`delete()` が効かない Firestore。**消したつもり**を作って見せる。"""

        def collection(self, name):
            outer = self

            class C(Col):
                def document(self, k):
                    r = Ref(outer, name, k)
                    r.delete = lambda: outer.deletes.append((name, k))
                    return r

            return C(self, name)

    c = Stubborn(store)
    out = call(c, col, key, True)
    ck("止まりかた", out == "exit:1", out)
    ck("残っている書類", key in store[col], "残っている")


def case_grep():
    """**出力を grep する。** ここだけは袋を読むので、最後に回す。"""
    print("\n[6] 出力に書類IDもコレクション名も中身も出ていない")
    text = BUF.getvalue().split("[6の結果]")[0]
    cols = "|".join(sorted(make_store(), key=len, reverse=True))
    shapes = {
        "コレクション名": rf"\b({cols})\b",
        "書類ID（20文字の英数字）": r"\b[A-Za-z0-9]{20}\b",
        "端末ID（UUID）":
            r"\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}"
            r"-[0-9a-f]{4}-[0-9a-f]{12}\b",
        "上限の印の書類ID（種別_日付_端末ID）": r"[a-z]+_\d{4}-\d{2}-\d{2}_",
        "書類の中身（人の書いた字）": r"付箋の本文",
    }
    # **先に、探し方が効くことを確かめる。** 正規表現が間違っていれば、
    # 何が出ていても「0件」と言える。0件を信じる前に、当たることを見る
    # （`docs/island-misses.md` #19）
    bait = (
        f"INFO islandNotes / {doc_id(0)} / {CID} / "
        f"note_2026-09-13_{CID} / 付箋の本文 0"
    )
    for label, pat in shapes.items():
        ck(f"{label} — 探し方が当たる（仕込んだ字で）",
           len(re.findall(pat, bait)) > 0, "当たる")

    for label, pat in shapes.items():
        n = len(re.findall(pat, text))
        ck(f"{label} の出現回数", n == 0, n)
    print(f"    （grep した出力は {len(text)} 文字）")


def main() -> int:
    print("=== 偽の Firestore で1書類を消す（本番には1バイトも出ない） ===")
    case1_dry()
    case2_locked()
    case3_apply()
    case4_missing()
    case5_notgone()
    print("\n[6の結果]")
    case_grep()
    sys.stdout, sys.stderr = REAL_OUT, REAL_ERR
    print()
    if FAILED:
        print(f"✕ 通らなかった確かめ {len(FAILED)} 件: {', '.join(FAILED)}")
        return 1
    print("○ ぜんぶ通りました")
    return 0


if __name__ == "__main__":
    sys.exit(main())
