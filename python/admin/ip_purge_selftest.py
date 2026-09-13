"""偽の Firestore で、`ip` の片づけの**振る舞いを実際に動かして確かめる。**

    python3 python/admin/ip_purge_selftest.py

**本番には1バイトも出ない。** Firestore も BigQuery も資格情報も要らない
（`ip_purge.py` が触る口を偽物に差し替えてある）。確かめるのは7つ:

  1. 既定は空回しで、**1バイトも書かない**（件数だけ出る）
  2. `ip` を持たない書類は**触られない**（まとめ書きに1件も入らない）
  3. 消えるのは `ip` だけで、**ほかの欄が1つも変わらない**
  4. `ip: null`（欄はあるが中身が空）も落ちる
  5. **まとめ書きで消す。** 450件が 2回のコミットで終わる（450回ではない）
  6. 消したあとの**数え直しが 0**。書類の数は1件も減らない
  7. **出力を grep して、IP らしき字と書類IDが0件**
     （0件を信じる前に、**その探し方が仕込んだ字に当たること**を先に見る）

## なぜ「コミットの回数」を数えるのか（5）

「まとめ書きになっているか」は、結果（消えた件数）だけでは言えない。
1件ずつ往復しても消えた件数は同じに見える。**偽の Firestore に、
`commit()` が何回来たかを数えさせて**、件数ではなく回数で言う。

## 7 の測りかた

このリポジトリは公開で、Actions のログも誰でも読める。
IP が1つでも出たら、書いた人がどこから書いたかが誰にでも読める。
「出していないつもり」ではなく、**出たものを見る。**
`sys.stdout` と `sys.stderr` を二股にして出力を丸ごと溜め、最後にそこを
正規表現で探す（`log` は stderr へ出るので、**両方**を溜める必要がある）。

探す形は本番と同じ。IP は説明用に予約された範囲（203.0.113.0/24・
198.51.100.0/24・2001:db8::/32）、書類IDは Firestore の自動採番と同じ
20文字の英数字にしてある。**形の違うもので試すと、本番では効かない字を
探すことになる。**
"""

import io
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# 実際の出力を溜める袋。**ip_purge（＝_fs の basicConfig）を読み込む前に**
# 二股にしておく。logging のハンドラは作られた時点の stream を握るため
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
os.environ.setdefault("BQ_PROJECT_ID", "ip-purge-selftest")

import ip_purge  # noqa: E402

# ---------------------------------------------------------------- 偽の中身

# 欄を消す印。本物（firestore.DELETE_FIELD）の代わり。
# **ただの目印なので、ライブラリが無い箱でも動く**
MARK = object()

# 本番と同じ形の IP。説明用に予約されている範囲を使う
IPV4 = ["203.0.113.7", "198.51.100.42", "203.0.113.201"]
IPV6 = ["2001:db8:85a3::8a2e:370:7334", "2001:db8::1"]


def doc_id(n: int) -> str:
    """Firestore の自動採番と同じ形（20文字の英数字）。"""
    abc = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"
    out = []
    v = n * 2654435761 + 12345
    for _ in range(20):
        v = (v * 1103515245 + 12345) & 0x7FFFFFFF
        out.append(abc[v % len(abc)])
    return "".join(out)


class Ref:
    """DocumentReference のかわり。どの入れ物のどのIDかだけ持つ。"""

    def __init__(self, store, col, key):
        self.store = store
        self.col = col
        self.key = key

    def apply(self, patch: dict) -> None:
        """`update` の中身を当てる。**渡された欄だけ触る。**"""
        d = self.store[self.col][self.key]
        for k, v in patch.items():
            if v is MARK:
                d.pop(k, None)
            else:
                d[k] = v


class Snap:
    """DocumentSnapshot のかわり。`select` で絞ったぶんだけ返す。"""

    def __init__(self, ref, data, fields):
        self.reference = ref
        self.id = ref.key
        # **projection を本物どおりに再現する。** 欄が無ければ鍵ごと返らない
        self._data = {k: v for k, v in data.items() if fields is None or k in fields}

    def to_dict(self):
        return dict(self._data)


class Query:
    def __init__(self, store, col, fields=None, cap=None):
        self.store, self.col, self.fields, self.cap = store, col, fields, cap

    def select(self, fields):
        return Query(self.store, self.col, list(fields), self.cap)

    def limit(self, n):
        return Query(self.store, self.col, self.fields, n)

    def stream(self):
        items = list(self.store.get(self.col, {}).items())
        if self.cap is not None:
            items = items[: self.cap]
        for key, data in items:
            yield Snap(Ref(self.store, self.col, key), data, self.fields)


class Batch:
    """WriteBatch のかわり。**commit まで1バイトも当てない。**"""

    def __init__(self, client):
        self.client = client
        self.buf = []

    def update(self, ref, patch):
        self.buf.append((ref, patch))

    def commit(self):
        self.client.commits += 1
        self.client.touched.extend(r.key for r, _ in self.buf)
        for ref, patch in self.buf:
            ref.apply(patch)
        self.buf = []


class Fake:
    """偽の Firestore。commit の回数と、触った書類IDを数える。"""

    def __init__(self, store):
        self.store = store
        self.commits = 0
        self.touched: list[str] = []

    def collection(self, name):
        return Query(self.store, name)

    def batch(self):
        return Batch(self)


def make_store() -> dict:
    """本番に似せた中身を作る。

    `islandNotes` は 450件（`ip` あり）＋ 30件（`ip` なし）。
    450 にしてあるのは、**まとめ書きの区切り（400）をまたぐ**ため。
    またがない数で試すと、1回のコミットで終わってしまって区切りが確かめられない。
    """
    notes = {}
    for i in range(450):
        v = None if i % 30 == 0 else (
            IPV6[i % len(IPV6)] if i % 7 == 0 else IPV4[i % len(IPV4)]
        )
        notes[doc_id(i)] = {
            "theme": "nordic",
            "text": f"付箋の本文 {i}",
            "by": None if i % 3 else "まこも",
            "hearts": i % 5,
            "byOwner": False,
            "hidden": False,
            "archived": False,
            "cid": f"cid-{i:06d}",
            "uid": None,
            "createdAt": 1757000000000 + i,
            "ip": v,
        }
    for i in range(450, 480):
        # あとから貼られたぶん（もう `ip` を取っていない）
        notes[doc_id(i)] = {
            "theme": "island",
            "text": f"付箋の本文 {i}",
            "by": None,
            "hearts": 0,
            "byOwner": False,
            "hidden": False,
            "archived": False,
            "cid": f"cid-{i:06d}",
            "uid": None,
            "createdAt": 1757000000000 + i,
        }
    events = {}
    for i in range(12):
        e = {
            "title": f"企画 {i}",
            "by": "まこも",
            "hearts": 0,
            "status": "proposed",
            "hidden": False,
            "archived": False,
            "cid": f"cid-e{i:05d}",
            "uid": None,
            "createdAt": 1757000000000 + i,
            "updatedAt": 1757000000000 + i,
        }
        if i < 9:
            e["ip"] = IPV4[i % len(IPV4)] if i % 4 else IPV6[i % len(IPV6)]
        events[doc_id(1000 + i)] = e
    # 控えの入れ物。**本番と同じく少ない**（8件。うち5件が `ip` を持つ）。
    # 数が少ない入れ物でも、まとめ書きが1回で終わって落ちないことを見る
    ideas = {}
    for i in range(8):
        v = {
            "text": f"むかしの案 {i}",
            "createdAt": 1756000000000 + i,
        }
        if i < 5:
            v["ip"] = IPV4[i % len(IPV4)]
        ideas[doc_id(2000 + i)] = v
    return {"islandNotes": notes, "islandStreamEvent": events,
            "islandIdeas": ideas}


def deep(store: dict) -> dict:
    """中身の控え（見比べ用）。"""
    return {c: {k: dict(v) for k, v in d.items()} for c, d in store.items()}


# ---------------------------------------------------------------- 確かめる

FAILED: list = []


def ck(name: str, cond: bool, got) -> None:
    mark = "○" if cond else "✕"
    print(f"    {mark} {name}: {got}")
    if not cond:
        FAILED.append(name)


def has_ip(store: dict) -> int:
    return sum(1 for d in store.values() for v in d.values() if "ip" in v)


def expect(store: dict) -> dict:
    """**数えたい値を、仕込みから導く。** 手で書いた数を置かない。

    仕込みを足したり減らしたりしたときに、期待値だけ古いまま残ると
    「通らない確かめ」ではなく「間違ったことを確かめる確かめ」になる。
    まとめ書きの回数は入れ物ごとに `BATCH` で割って切り上げる
    （`ip_purge.run` が入れ物ごとに流すため）。
    """
    with_ip = {c: sum(1 for v in d.values() if "ip" in v) for c, d in store.items()}
    total = sum(len(d) for d in store.values())
    return {
        "with_ip": sum(with_ip.values()),
        "no_ip": total - sum(with_ip.values()),
        "commits": sum(
            -(-n // ip_purge.BATCH) for n in with_ip.values() if n
        ),
    }


def case1_dry():
    print("\n[1] 既定は空回し。1バイトも書かない")
    store = make_store()
    exp = expect(store)
    was = deep(store)
    c = Fake(store)
    gone = ip_purge.run(c, apply=False, mark=MARK, cap=100000)
    ck("落とした件数", gone == 0, gone)
    ck("まとめ書きの回数", c.commits == 0, c.commits)
    ck("中身が1文字も変わっていない", deep(store) == was, "変わっていない")
    ck("ip を持つ書類の数（変わらない）",
       has_ip(store) == exp["with_ip"], has_ip(store))


def case2_apply():
    print("\n[2〜6] {\"apply\": true} で落とす")
    store = make_store()
    exp = expect(store)
    was = deep(store)
    no_ip = {k for d in was.values() for k, v in d.items() if "ip" not in v}
    c = Fake(store)
    gone = ip_purge.run(c, apply=True, mark=MARK, cap=100000)

    ck("落とした件数", gone == exp["with_ip"], gone)

    # 2. ip を持たない書類は触られない
    ck("ip を持たない書類の数", len(no_ip) == exp["no_ip"], len(no_ip))
    ck("そのうち触られたもの", not (no_ip & set(c.touched)),
       len(no_ip & set(c.touched)))
    ck("触った書類の数＝落とした件数",
       len(c.touched) == exp["with_ip"], len(c.touched))

    # 3. 消えるのは ip だけ
    diff = []
    for col, docs in store.items():
        for key, now in docs.items():
            old = dict(was[col][key])
            old.pop("ip", None)
            if now != old:
                diff.append(key)
    ck("ip 以外の欄が変わった書類", not diff, len(diff))

    # 4. ip: null（欄はあるが空）も落ちる
    nulls = [k for d in was.values() for k, v in d.items()
             if "ip" in v and v["ip"] is None]
    ck("もともと ip: null だった数", len(nulls) == 15, len(nulls))
    ck("そのうち欄が残っているもの",
       not [k for k in nulls
            if any("ip" in d.get(k, {}) for d in store.values())], 0)

    # 5. まとめ書き（450 + 9 → 2回 + 1回）
    ck("まとめ書きの回数（1件ずつではない）",
       c.commits == exp["commits"] and c.commits < exp["with_ip"], c.commits)

    # 6. 数え直しが 0 / 書類の数は減らない
    ck("ip が残っている数", has_ip(store) == 0, has_ip(store))
    ck("islandNotes の書類の数", len(store["islandNotes"]) == 480,
       len(store["islandNotes"]))
    ck("islandStreamEvent の書類の数", len(store["islandStreamEvent"]) == 12,
       len(store["islandStreamEvent"]))


def case7_again():
    print("\n[6b] 二度流しても落ちない（残り0件のときは何も書かない）")
    store = make_store()
    c1 = Fake(store)
    ip_purge.run(c1, apply=True, mark=MARK, cap=100000)
    c2 = Fake(store)
    gone = ip_purge.run(c2, apply=True, mark=MARK, cap=100000)
    ck("2回目に落とした件数", gone == 0, gone)
    ck("2回目のまとめ書きの回数", c2.commits == 0, c2.commits)


def case_grep():
    """**出力を grep する。** ここだけは袋を読むので、最後に回す。"""
    print("\n[7] 出力に IP も書類IDも1文字も出ていない")
    text = BUF.getvalue().split("[7の結果]")[0]
    shapes = {
        "IPv4 の形": r"\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}",
        "IPv6 の形（: を2つ以上含む塊）":
            r"\b[0-9A-Fa-f]{0,4}:[0-9A-Fa-f]{0,4}:[0-9A-Fa-f:]*",
        "書類ID（20文字の英数字）": r"\b[A-Za-z0-9]{20}\b",
        "端末ID（cid-…）": r"cid-[0-9a-z]+",
        "付箋の本文": r"付箋の本文",
    }
    # **先に、探し方が効くことを確かめる。** 正規表現が間違っていれば、
    # 何が出ていても「0件」と言える。0件を信じる前に、当たることを見る
    bait = (
        "INFO 203.0.113.7 / 2001:db8:85a3::8a2e:370:7334 / "
        f"{doc_id(7)} / cid-000007 / 付箋の本文 7"
    )
    for label, pat in shapes.items():
        ck(f"{label} — 探し方が当たる（仕込んだ字で）",
           len(re.findall(pat, bait)) > 0, "当たる")

    for label, pat in shapes.items():
        n = len(re.findall(pat, text))
        ck(f"{label} の出現回数", n == 0, n)
    # 仕込んだ値そのものも、念のため名指しで探す
    for v in IPV4 + IPV6:
        if v in text:
            ck("仕込んだ IP がそのまま出ている", False, "出ている")
            break
    else:
        ck("仕込んだ IP がそのまま出ていない", True, "0 件")
    print(f"    （grep した出力は {len(text)} 文字）")


def main() -> int:
    print("=== 偽の Firestore で ip の片づけを動かす（本番には1バイトも出ない） ===")
    case1_dry()
    case2_apply()
    case7_again()
    print("\n[7の結果]")
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
