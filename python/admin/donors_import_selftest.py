"""偽の Firestore で、**投げ銭の対応表を入れる道具の下見を確かめる。**

    python3 python/admin/donors_import_selftest.py

**本番には1バイトも出ない。** Firestore も BigQuery も資格情報も要らない
（`donors_import.py` が触る口を偽物に差し替えてある）。確かめるのは6つ:

  1. **下見と apply が同じ数を出す。** 「画面のぶんを残した」まで一致する
     （ここが壊れていた。下見 0人 → apply 6人）
  2. **下見は1バイトも書かない。** `set()` が1回も呼ばれず、書く口を
     叩いた瞬間に `ReadOnly` で止まる
  3. **下見でも Firestore を引いている。** 引いた回数が種の行数ぶんある
  4. **force を下見で付けると、潰れる行の数が出る。** force の有る無しで
     下見の数が変わる（前は1文字も変わらなかった）
  5. apply は画面から直した行を**書き替えない**。force を付けたときだけ書く
  6. **出力を grep して、どねID・呼び名・チャンネルIDが0件**
     （0件を信じる前に、**その探し方が仕込んだ字に当たること**と、
     **手元で回せば同じ道からそれが出ること**を先に見る）

## なぜ「引いた回数」まで数えるのか（3）

「下見が本当の数を出す」は、結果の数だけでは言えない。**種のほうに
たまたま `editedAt` 付きが1行も無ければ、繋いでいなくても 0 で一致する。**
偽の Firestore に `get()` が何回来たかを数えさせて、繋いだかどうかは
数ではなく回数で言う。

## 6 の測りかた

このリポジトリは公開で、Actions のログも誰でも読める。
どねID が1つ出れば「誰がいつ投げ銭したか」に等しいものが積まれる。
「出していないつもり」ではなく、**出たものを見る。**

そして**0件を、そのまま結論にしない**（`docs/island-misses.md` #78）。
同じ道を手元の扱いでもう1回通して、そこには出ることを見る。
出なければ、0件は「隠せている」ではなく「通っていない」。
`sys.stdout` と `sys.stderr` を二股にして出力を丸ごと溜め、最後にそこを
正規表現で探す（`log` は stderr へ出るので、**両方**を溜める必要がある）。

探す形は本番と同じ。どねID は21桁の数字、呼び名は `@` で始まる語、
チャンネルIDは `UC` + 22文字（`python/donors_seed.json` と
`chat_messages.author_channel_id` の実物）。**形の違うもので試すと、
本番では効かない字を探すことになる。**
"""

import io
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# 実際の出力を溜める袋。**donors_import（＝_fs の basicConfig）を読み込む
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
os.environ.setdefault("BQ_PROJECT_ID", "donors-import-selftest")

# **公開の場と同じ扱いで走らせる。** 1人ずつの明細が出ない側で測らないと、
# 「出ていない」のか「そもそも出さない道を通っただけ」なのか分からない
os.environ["GITHUB_ACTIONS"] = "true"

import _fs  # noqa: E402
import donors_import  # noqa: E402

# ---------------------------------------------------------------- 偽の中身

# チャンネルID。本番は `UC` + 22文字
def channel_id(n: int) -> str:
    abc = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_"
    out = []
    v = n * 2654435761 + 999
    for _ in range(22):
        v = (v * 1103515245 + 12345) & 0x7FFFFFFF
        out.append(abc[v % len(abc)])
    return "UC" + "".join(out)


def viewer_pk(n: int) -> str:
    """どねID。本番は21桁の数字。"""
    v = (n * 7919 + 13) % 1000
    return f"{1000000000000000000 + v * 977:021d}"[-21:]


def make_seed() -> list:
    """種。**本番と同じ形にする。**

    30行のうち 24行が呼び名を持ち（＝チャンネルIDが引ける）、
    6行は呼び名が無くて `label` だけ。本番の今日の中身と同じ割合。
    """
    rows = []
    for i in range(24):
        rows.append({
            "viewerPk": viewer_pk(i),
            "handle": f"@ひめひめ-{i:02d}z",
            "label": None,
            "isOwner": i == 0,
        })
    for i in range(24, 30):
        rows.append({
            "viewerPk": viewer_pk(i),
            "handle": None,
            "label": f"よびな{i:02d}",
            "isOwner": False,
        })
    return rows


SEED = make_seed()
# 表示名 → チャンネルID（本番は BigQuery。ここは引けた体にする）
FOUND = {d["handle"]: channel_id(i)
         for i, d in enumerate(SEED) if d.get("handle")}

# **画面から直してある行**（`editedAt` が入っている）。本番は6人だった。
# ここが下見で数えられるかが、この確かめの本体
EDITED = [d["viewerPk"] for d in SEED[:4]] + [d["viewerPk"] for d in SEED[26:28]]


def make_store() -> dict:
    """Firestore に入っている側。**editedAt のある行・無い行・`new` を混ぜる。**

    本番と同じ形にする（`docs/island-db.md` の `islandDonors`）。
    形を変えて確かめると、直っていないものが直って見える。
    """
    out = {}
    for i, d in enumerate(SEED):
        pk = d["viewerPk"]
        row = {
            "viewerPk": pk,
            "handle": d.get("handle"),
            "label": d.get("label"),
            "channelId": FOUND.get(d.get("handle")),
            "isOwner": bool(d.get("isOwner")),
            "state": "linked" if d.get("handle") else "unlinked",
            "updatedAt": "2026-09-01T22:41:00+00:00",
            "firstSeenAt": "2026-08-20T11:02:00+00:00",
        }
        if pk in EDITED:
            # あやとが `/me` から手で紐付けた行
            row["editedAt"] = "2026-09-12T13:20:00+00:00"
            row["handle"] = f"@てであてた-{i:02d}"
            row["channelId"] = channel_id(500 + i)
            row["state"] = "linked"
        out[pk] = row
    # **表に無い どねID が投げ銭してきた行**（`new`）。種には無いので、
    # 流しても触られてはいけない
    for i in range(3):
        pk = viewer_pk(900 + i)
        out[pk] = {
            "viewerPk": pk, "handle": None, "label": None,
            "channelId": None, "isOwner": False, "state": "new",
            "firstSeenAt": "2026-09-13T02:10:00+00:00",
        }
    return out


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
    """DocumentReference のかわり。**引いた回数と書いた回数を数える。**"""

    def __init__(self, client, col, key):
        self.client, self.col, self.key = client, col, key

    def get(self):
        self.client.gets.append((self.col, self.key))
        return Snap(self.client.store.get(self.col, {}).get(self.key))

    def set(self, data, merge=False):
        self.client.sets.append((self.col, self.key))
        d = self.client.store.setdefault(self.col, {})
        if merge:
            d.setdefault(self.key, {}).update(data)
        else:
            d[self.key] = dict(data)


class Col:
    def __init__(self, client, name):
        self.client, self.name = client, name

    def document(self, key):
        return Ref(self.client, self.name, key)


class Fake:
    """偽の Firestore。引いた先と書いた先を1件ずつ覚える。"""

    def __init__(self, store):
        self.store = store
        self.gets: list = []
        self.sets: list = []

    def collection(self, name):
        return Col(self, name)


def deep(store: dict) -> dict:
    """中身の控え（見比べ用）。"""
    return {c: {k: dict(v) for k, v in d.items()} for c, d in store.items()}


def go(apply: bool, force: bool):
    """本番と同じ組み立てで1回走らせる。

    Returns:
        （数えたもの, 偽の Firestore）
    """
    c = Fake({"islandDonors": make_store()})
    store = c if apply else _fs.readonly(c)
    got = donors_import.run(store, SEED, FOUND, apply, force)
    return got, c


# ---------------------------------------------------------------- 確かめる

FAILED: list = []


def ck(name: str, cond: bool, got) -> None:
    """**got に どねID も呼び名も入れない。** ここも grep の対象になる。"""
    mark = "○" if cond else "✕"
    print(f"    {mark} {name}: {got}")
    if not cond:
        FAILED.append(name)


def case1_same():
    print("\n[1] 下見と apply が同じ数を出す（画面のぶんを残した数まで）")
    dry, _ = go(False, False)
    wet, _ = go(True, False)
    ck("下見の数", dry == wet, f"{dry}")
    ck("画面のぶんを残した数（仕込んだ数と一致）",
       dry["kept"] == len(EDITED), dry["kept"])
    ck("紐付いた人数", dry["linked"] == 24, dry["linked"])
    ck("まだの人数", dry["unlinked"] == 6, dry["unlinked"])


def case2_nowrite():
    print("\n[2] 下見は1バイトも書かない")
    c = Fake({"islandDonors": make_store()})
    was = deep(c.store)
    got = donors_import.run(_fs.readonly(c), SEED, FOUND, False, False)
    ck("set() が呼ばれた回数", len(c.sets) == 0, len(c.sets))
    ck("中身が1文字も変わっていない", deep(c.store) == was, "変わっていない")
    ck("書類の数", len(c.store["islandDonors"]) == len(was["islandDonors"]),
       len(c.store["islandDonors"]))
    # **口そのものが塞がっていること。** 呼ぶ側の `if apply:` を書き忘れても
    # 本番に書かない、と言えるのはここが立っているときだけ
    blocked = False
    try:
        _fs.readonly(c).collection("islandDonors").document("x").set({"a": 1})
    except _fs.ReadOnly:
        blocked = True
    ck("書く口を叩いたら止まる", blocked, "止まった")
    ck("止まったあとも書かれていない", len(c.sets) == 0, len(c.sets))
    ck("数は出ている（読めている）", got["kept"] == len(EDITED), got["kept"])


def case3_read():
    print("\n[3] 下見でも Firestore を引いている")
    _, c = go(False, False)
    ck("get() が呼ばれた回数（種の行数ぶん）",
       len(c.gets) == len(SEED), len(c.gets))
    ck("引いた先（ぜんぶ islandDonors）",
       {col for col, _ in c.gets} == {"islandDonors"}, len(set(c.gets)))


def case4_force():
    print("\n[4] force を下見で付けると、潰れる行の数が出る")
    plain, _ = go(False, False)
    forced, c = go(False, True)
    ck("force で塗り直す人数（仕込んだ数と一致）",
       forced["wiped"] == len(EDITED), forced["wiped"])
    ck("force のとき、残す人数は 0", forced["kept"] == 0, forced["kept"])
    ck("force の有る無しで下見の数が変わる", plain != forced, "変わる")
    ck("force を付けた下見でも set() は 0", len(c.sets) == 0, len(c.sets))
    # force を外したときに残る数＝force で潰れる数
    ck("外せば残る数と、潰れる数が一致",
       plain["kept"] == forced["wiped"], forced["wiped"])


def case5_apply():
    print("\n[5] apply は画面から直した行を書き替えない。force のときだけ書く")
    got, c = go(True, False)
    wrote = {key for _, key in c.sets}
    ck("書いた件数（種の行数 − 残した数）",
       len(c.sets) == len(SEED) - len(EDITED), len(c.sets))
    ck("画面から直した行を書いた数", not (wrote & set(EDITED)),
       len(wrote & set(EDITED)))
    # 画面から直した行の中身が1文字も変わっていないこと
    after = c.store["islandDonors"]
    base = make_store()
    same = [pk for pk in EDITED if after[pk] != base[pk]]
    ck("画面から直した行の中身が変わった数", not same, len(same))
    # 表に無い どねID（`new`）は、種に無いので触られない
    newbies = [k for k, v in base.items() if v.get("state") == "new"]
    ck("`new` の行を触った数", not (wrote & set(newbies)),
       len(wrote & set(newbies)))
    ck("`new` の行の中身が変わった数",
       all(after[k] == base[k] for k in newbies), 0)
    ck("残した人数", got["kept"] == len(EDITED), got["kept"])

    got2, c2 = go(True, True)
    wrote2 = {key for _, key in c2.sets}
    ck("force なら全行を書く", len(c2.sets) == len(SEED), len(c2.sets))
    ck("force で画面から直した行も書いた",
       set(EDITED) <= wrote2, len(set(EDITED) & wrote2))
    ck("force で塗り直した人数", got2["wiped"] == len(EDITED), got2["wiped"])
    # **初めて投げ銭した日は、塗り直しても消さない**
    kept_first = all(
        c2.store["islandDonors"][d["viewerPk"]].get("firstSeenAt")
        for d in SEED
    )
    ck("初めて投げ銭した日が残っている", kept_first, "残っている")


def at_hand() -> str:
    """**手元で回したときの**出力を、袋を汚さずに取る。

    公開の場の 0件が「出していない」なのか「そもそもその道を通っていない」
    なのかは、0件の側だけ見ても言えない（`docs/island-misses.md` #78）。
    同じ道を手元の扱いで1回通して、**そこには出ていること**を見る。
    """
    import logging

    sink = io.StringIO()
    h = logging.StreamHandler(sink)
    h.setFormatter(logging.Formatter("%(message)s"))
    lg = logging.getLogger("admin")
    was = lg.propagate
    lg.addHandler(h)
    # 袋（公開の場として grep する側）には1文字も混ぜない
    lg.propagate = False
    os.environ.pop("GITHUB_ACTIONS", None)
    try:
        c = Fake({"islandDonors": make_store()})
        donors_import.run(_fs.readonly(c), SEED, FOUND, False, False)
    finally:
        os.environ["GITHUB_ACTIONS"] = "true"
        lg.propagate = was
        lg.removeHandler(h)
    return sink.getvalue()


def case_grep():
    """**出力を grep する。** ここだけは袋を読むので、最後に回す。"""
    print("\n[6] 出力に どねID も呼び名も チャンネルID も出ていない")
    text = BUF.getvalue().split("[6の結果]")[0]
    shapes = {
        "どねID（21桁の数字）": r"\b\d{21}\b",
        "呼び名（@ で始まる語）": r"@[\w\-ぁ-んァ-ヶ一-龠]+",
        "チャンネルID（UC + 22文字）": r"\bUC[A-Za-z0-9_-]{22}\b",
    }
    # **0件が「隠した」なのか「通っていない」なのかを先に分ける。**
    # どねID と呼び名は、手元で回せば1人ずつ出る道を通っている。
    # そこに出ることを見てはじめて、公開の場の 0件を「隠せている」と読める
    mine = at_hand()
    for label in ("どねID（21桁の数字）", "呼び名（@ で始まる語）"):
        ck(f"{label} — 手元で回すと出る（隠しているから 0 だと言える）",
           len(re.findall(shapes[label], mine)) > 0, "出る")
    # チャンネルIDは、手元で回しても出ない。**この道具は一度も出さない**
    ck("チャンネルID — 手元で回しても出ない（そもそも出す道が無い）",
       len(re.findall(shapes["チャンネルID（UC + 22文字）"], mine)) == 0, 0)
    # **先に、探し方が効くことを確かめる。** 正規表現が間違っていれば、
    # 何が出ていても「0件」と言える。0件を信じる前に、当たることを見る
    # （`docs/island-misses.md` #19）
    bait = f"INFO {SEED[0]['viewerPk']}  linked  {SEED[0]['handle']}  " \
           f"{FOUND[SEED[0]['handle']]}"
    for label, pat in shapes.items():
        ck(f"{label} — 探し方が当たる（仕込んだ字で）",
           len(re.findall(pat, bait)) > 0, "当たる")

    for label, pat in shapes.items():
        n = len(re.findall(pat, text))
        ck(f"{label} の出現回数", n == 0, n)
    print(f"    （grep した出力は {len(text)} 文字）")


def main() -> int:
    print("=== 偽の Firestore で投げ銭の対応表を入れる（本番には1バイトも出ない） ===")
    case1_same()
    case2_nowrite()
    case3_read()
    case4_force()
    case5_apply()
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
