"""偽の Firestore で `stamp_line_seed` を**実際に動かして確かめる**（#716）。

    python3 python/admin/stamp_line_seed_selftest.py

**本番には1バイトも出ない。** Firestore も資格情報も要らない。

## なぜ、これを書いたか

この道具が間違えたときに壊れるのは、**誰が選ばれたかという名簿そのもの。**

- 名簿を1件でもログに出したら、**公開の Actions ログに順位表が残る**
  （元に戻せない）
- 流し直しで `lines` を潰したら、**本人が決めたことばが消える**
  （人の字なので戻らない）

どちらも赤くならない。だから、ここで数える。

## 確かめるもの

  1. **`apply` 無しでは書き込みが1回も呼ばれない**（下見）
  2. `apply` を付けると、**`channelId` / `pickedAt` / `seededAt` だけ**が入る
  3. **すでに在る書類の `lines` と `suggested` を潰さない**
  4. **図鑑に居ない id は、書類を作らない**
  5. **形の変な id（短い・記号・重なり）を落とす**
  6. **channelId が空の人は、黙って通さず数えて出す**
  7. 出力に**書類IDもチャンネルIDも1文字も出ない**（指紋だけ）
  8. 名簿は **`client_payload` から読む**（ARGS からは読まない）

## 7 が本命

1〜6 は「決め方」の確かめで、**ログに何が出たか**はそこには出ない。
入力は Actions の伏せ字にも守られているが、**伏せ字は保険**で、
出さないのが本体。だから出力を丸ごと溜めて、仕込んだ字を1つずつ当てる。
"""

import io
import json
import os
import sys
import tempfile

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# 出力を丸ごと溜める袋。**`_fs` の basicConfig を読み込む前に**二股にする。
# logging のハンドラは作られた時点の stream を握るため
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
# 偽物しか触らないので**本物の名前は要らない**
os.environ.setdefault("BQ_PROJECT_ID", "stamp-line-seed-selftest")

import stamp_line_seed as seed  # noqa: E402
from _fs import ReadOnly, readonly  # noqa: E402

# ---------------------------------------------------------------- 偽の中身

# 偽のチャンネルID。**本物の形（`UC` + 22文字）から1文字ずらしてある。**
# このファイルは公開のリポジトリに残るので、本物の形で並べない
# （`tools/logident.py` が数えたものが0でなくなると、本物が混ざった日に
# 気づけなくなる。`characters_link_selftest.py` と同じ決め）


def cid(tag: str) -> str:
    """偽のチャンネルID。

    Args:
        tag: 見分けるための短い字

    Returns:
        `UC` + 21文字
    """
    return "UC" + (tag + "0123456789abcdefghijk")[:21]


# 図鑑の書類ID（本番と同じ32桁の形）
DOC = {
    "fresh": "a" + "0123456789abcdef" * 2,   # まだ入れ物に無い人
    "had": "b" + "0123456789abcdef" * 2,     # もう決めてくれている人
    "nochan": "c" + "0123456789abcdef" * 2,  # 図鑑に channelId が無い人
    "ghost": "d" + "0123456789abcdef" * 2,   # **図鑑に居ない**
}

CH = {
    "fresh": cid("fresh"),
    "had": cid("had"),
}

# **本人が決めたことば。** これが1文字でも消えたら落とす
KEPT = ["もうきめた", "これにする"]
KEPT_SUG = ["ていあん1", "ていあん2", "ていあん3"]


class FakeDoc:
    """書類1件。"""

    def __init__(self, store, name, doc_id):
        self._store = store
        self._name = name
        self.id = doc_id

    def get(self):
        """引く。

        Returns:
            書類の姿
        """
        v = self._store.data.get(self._name, {}).get(self.id)
        return FakeSnap(self.id, v)

    def set(self, patch, merge=False):
        """置く。**何を置いたかを跡に残す。**

        Args:
            patch: 置く中身
            merge: 混ぜるか
        """
        self._store.writes.append(
            {"collection": self._name, "id": self.id,
             "patch": dict(patch), "merge": merge})
        box = self._store.data.setdefault(self._name, {})
        if merge:
            box[self.id] = {**(box.get(self.id) or {}), **patch}
        else:
            box[self.id] = dict(patch)


class FakeSnap:
    """引いた結果。"""

    def __init__(self, doc_id, v):
        self.id = doc_id
        self.exists = v is not None
        self._v = v

    def to_dict(self):
        """中身。

        Returns:
            中身の辞書（無ければ None）
        """
        return dict(self._v) if self._v is not None else None


class FakeCollection:
    """入れ物。"""

    def __init__(self, store, name):
        self._store = store
        self._name = name

    def document(self, doc_id):
        """書類を指す。

        Args:
            doc_id: 書類ID

        Returns:
            書類
        """
        return FakeDoc(self._store, self._name, doc_id)

    def list_documents(self):
        """中の書類ぜんぶ。

        Returns:
            書類の一覧
        """
        return [FakeDoc(self._store, self._name, k)
                for k in self._store.data.get(self._name, {})]


class FakeDb:
    """偽の Firestore。`collection` だけ。"""

    def __init__(self):
        self.data = {
            "islandCharacter": {
                DOC["fresh"]: {"channelId": CH["fresh"], "emoji": "🐟"},
                DOC["had"]: {"channelId": CH["had"], "emoji": "🐰"},
                # **channelId が空の人。** 本番に18人いる形
                DOC["nochan"]: {"channelId": "", "emoji": "🐻"},
            },
            "islandStampLine": {
                DOC["had"]: {
                    "channelId": CH["had"],
                    "lines": list(KEPT),
                    "suggested": list(KEPT_SUG),
                    "pickedAt": 1,
                },
            },
        }
        self.writes = []

    def collection(self, name):
        """入れ物を指す。

        Args:
            name: 入れ物の名前

        Returns:
            入れ物
        """
        return FakeCollection(self, name)


BAD = 0


def check(name: str, ok: bool, why: str = "") -> None:
    """1件の確かめ。

    Args:
        name: 何を見ているか
        ok: 通ったか
        why: 落ちたときに出す中身（**偽の字だけ**）
    """
    global BAD
    if ok:
        print(f"  ok   {name}")
        return
    BAD += 1
    print(f"  NG   {name}" + (f" — {why}" if why else ""))


def run(picks, apply_it, use_event=True):
    """`stamp_line_seed.main()` を1回回す。

    Args:
        picks: 渡す名簿
        apply_it: 書くか
        use_event: 出来事の中身から渡すか（False なら ARGS）

    Returns:
        (終了コード, 偽の Firestore)
    """
    fake = FakeDb()
    seed.db = lambda: fake  # noqa: ARG005
    body = {"picks": picks}
    if apply_it:
        body["apply"] = True
    os.environ.pop("ARGS", None)
    os.environ.pop("GITHUB_EVENT_PATH", None)
    if use_event:
        with tempfile.NamedTemporaryFile(
                "w", suffix=".json", delete=False, encoding="utf-8") as f:
            json.dump({"action": "stamp-line", "client_payload": body}, f)
            os.environ["GITHUB_EVENT_PATH"] = f.name
    else:
        os.environ["ARGS"] = json.dumps(body)
    code = seed.main()
    return code, fake


print("# 0. 探し方が当たるか（先に見る）")
{}
code, fake = run([DOC["fresh"], DOC["had"]], False)
check("下見は 0 で終わる", code == 0, str(code))
check("図鑑に2人いる（空の図鑑と比べていない）",
      len(fake.data["islandCharacter"]) == 3)
check("入れ物にすでに1件ある", len(fake.data["islandStampLine"]) == 1)

print("\n# 1. 下見は1バイトも書かない")
check("書き込みが1回も呼ばれていない", fake.writes == [], str(fake.writes))
check("入れ物の件数が変わっていない",
      len(fake.data["islandStampLine"]) == 1)
# **下見のクライアントが本当に塞がっているか**を、その場で当てる。
# 塞がっていなければ「呼ばれていない」は空振り
try:
    readonly(fake).collection("islandStampLine").document("x").set({"a": 1})
    check("下見のクライアントは書けない", False, "書けてしまった")
except ReadOnly:
    check("下見のクライアントは書けない", True)

print("\n# 2. apply を付けると置く")
code, fake = run([DOC["fresh"], DOC["had"]], True)
check("0 で終わる", code == 0, str(code))
check("2件書いた", len(fake.writes) == 2, str(len(fake.writes)))
keys = sorted({k for w in fake.writes for k in w["patch"]})
check("触った欄は3つだけ",
      keys == ["channelId", "pickedAt", "seededAt"], ",".join(keys))
check("まるごと置き換えない（merge）",
      all(w["merge"] for w in fake.writes))
check("channelId を図鑑から写している",
      fake.data["islandStampLine"][DOC["fresh"]]["channelId"] == CH["fresh"])

print("\n# 3. 本人が決めたことばを潰さない")
got = fake.data["islandStampLine"][DOC["had"]]
check("lines がそのまま残っている",
      got.get("lines") == KEPT, str(got.get("lines")))
check("suggested がそのまま残っている",
      got.get("suggested") == KEPT_SUG, str(got.get("suggested")))
check("lines を送っていない",
      all("lines" not in w["patch"] for w in fake.writes))
check("suggested を送っていない",
      all("suggested" not in w["patch"] for w in fake.writes))

print("\n# 4. 図鑑に居ない id は書類を作らない")
code, fake = run([DOC["fresh"], DOC["ghost"]], True)
check("0 で終わる", code == 0, str(code))
check("書いたのは1件だけ", len(fake.writes) == 1, str(len(fake.writes)))
check("居ない id の書類はできていない",
      DOC["ghost"] not in fake.data["islandStampLine"])
code, fake = run([DOC["ghost"]], True)
check("居ない id だけなら 1 で落ちる", code == 1, str(code))
check("1件も書いていない", fake.writes == [])

print("\n# 5. 形の変な id を落とす")
keep, bad = seed.shape_picks([
    DOC["fresh"],            # 使える
    DOC["fresh"],            # 重なり
    "ab",                    # 短すぎる
    "../../etc/passwd",      # 記号
    "",                      # 空
    None,                    # 字でない
    "a" * 200,               # 長すぎる
])
check("使えるのは1件", len(keep) == 1, str(len(keep)))
check("落ちたのは6件", bad == 6, str(bad))
check("配列でないものは空", seed.shape_picks("もじ") == ([], 0))
code, fake = run(["ab", ""], True)
check("使える id が1つも無ければ 2 で落ちる", code == 2, str(code))
check("1件も書いていない", fake.writes == [])

print("\n# 6. channelId が空の人は、数えて出す")
code, fake = run([DOC["nochan"]], True)
check("0 で終わる（書類は作る）", code == 0, str(code))
check("書いた", len(fake.writes) == 1)
check("channelId は空のまま",
      fake.data["islandStampLine"][DOC["nochan"]]["channelId"] == "")
out = BUF.getvalue()
check("「見られない」と言っている", "見られない" in out)

print("\n# 7. 名簿は client_payload から読む（ARGS からは読まない）")
code, fake = run([DOC["fresh"]], True, use_event=False)
check("ARGS でも手元では動く", code == 0, str(code))
# **出来事の中身が在るときは、そちらが勝つ。** ARGS に別のものを入れて確かめる
with tempfile.NamedTemporaryFile(
        "w", suffix=".json", delete=False, encoding="utf-8") as f:
    json.dump({"client_payload": {"picks": [DOC["fresh"]], "apply": True}}, f)
    os.environ["GITHUB_EVENT_PATH"] = f.name
os.environ["ARGS"] = json.dumps({"picks": [DOC["had"]]})
fake = FakeDb()
seed.db = lambda: fake  # noqa: ARG005
code = seed.main()
check("出来事の中身が勝つ",
      len(fake.writes) == 1 and fake.writes[0]["id"] == DOC["fresh"],
      str([w["id"] for w in fake.writes]))
os.environ.pop("ARGS", None)
os.environ.pop("GITHUB_EVENT_PATH", None)

print("\n# 8. 出力に、素性が1文字も出ていない")
out = BUF.getvalue()
for tag, v in [("書類ID", DOC["fresh"]), ("書類ID", DOC["had"]),
               ("書類ID", DOC["nochan"]), ("書類ID", DOC["ghost"]),
               ("チャンネルID", CH["fresh"]), ("チャンネルID", CH["had"])]:
    check(f"{tag}が出ていない（{v[:4]}…）", v not in out)
for v in KEPT + KEPT_SUG:
    check(f"本人のことばが出ていない（{v[:3]}…）", v not in out)
check("指紋は出ている（伏せ字ではなく追える形）", "#" in out)
print(f"  出た行: {len(out.splitlines())} 行")

print("")
if BAD:
    print(f"NG が {BAD} 件。")
    sys.exit(1)
print("ぜんぶ通った。")
