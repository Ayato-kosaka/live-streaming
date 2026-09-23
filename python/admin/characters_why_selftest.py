"""偽の Firestore で、`characters_why` の**振る舞いを実際に動かして確かめる。**

    python3 python/admin/characters_why_selftest.py

**本番には1バイトも出ない。** Firestore も BigQuery も YouTube も資格情報も
要らない（`characters_why` が触る口を偽物に差し替えてある）。
`node` と `app/alertbox/matching.utils.ts` だけは**本物を動かす**——
ゆるい鍵が本物かどうかは、本物を動かさないと確かめようがない。

確かめるのは7つ:

  1. **対照が素で通る**（壊していない写しが通ることを先に見る。
     `docs/island-standards.md` §15 の決めごと）
  2. **`BREAK=` の6本が、その足**だけ**を落とす。**
     「4通りに壊した」がどれも同じ足なら1通り。番号まで見る
  3. **10人ぶんの表から、1人も欠けない**（呼び名を1つも持たない人も出る）
  4. **ゆるい一致が 0人 と 1人以上 に割れる**（片側に寄ったら 1 で落ちる）
  5. **公開の場（`GITHUB_ACTIONS=true`）で、出力に素性が1文字も無い。**
     呼び名・表示名・ハンドル・チャンネルID・書類IDのどれも
  6. **対照。** `GITHUB_ACTIONS` を外すと書類IDが素で出る。
     ここが出ないなら、5 の 0件は「消えた」ではなく
     **「そもそも何も出ていない」**
  7. **1バイトも書かない**（`_fs.readonly()` が塞ぐ）

## 終了コード

  0 … 通った / 1 … 見つかった / 2 … 数えられなかった（node で本物を動かせない）
"""

import io
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# 実際の出力を溜める袋。**characters_why（＝_fs の basicConfig）を
# 読み込む前に**二股にしておく。logging のハンドラは作られた時点の
# stream を握るため
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
os.environ.setdefault("BQ_PROJECT_ID", "characters-why-selftest")

import characters_why as cw  # noqa: E402
from _fs import ReadOnly, readonly  # noqa: E402

# ---------------------------------------------------------------- 偽の中身
#
# **本物の名前もチャンネルIDも1つも入っていない。** 形だけ似せた作り物。

CID = {k: "UCwhy" + f"{i:02d}" + "seibutsudummy00000"
       for i, k in enumerate(["nami", "aoi", "other", "gone", "taken1",
                              "taken2", "tip"])}

# 書類ID は、本番と同じくドライブの画像 id に似せる（名前は入っていない）
DOC = {k: "1" + k[:1].upper() + "zZ" + f"{i:02d}" + "dummyCharacterDoc0"
       for i, k in enumerate(["nami", "kana", "none", "noname", "tip",
                              "handle", "full1", "full2"])}

# 図鑑の呼び名と、チャットの表示名。**作り物の字**
N_NAMI = "なみのり"
N_KANA = "あおいとり"
T_KANA = "アオイトリ"
N_NONE = "みどりのかぜ"
N_TIP = "ゆうやけ"
T_TIP = "ユウヤケ"
HANDLE = "@dummyhandle999"

SECRETS = [N_NAMI, N_KANA, T_KANA, N_NONE, N_TIP, T_TIP, HANDLE] \
    + list(CID.values()) + list(DOC.values())

CHARS = [
    # 1. 完全一致でも当たる
    (DOC["nami"], {"emoji": "🐚", "aliases": [N_NAMI], "channelName": "",
                   "createdAt": "2026-01-02T03:04:05Z",
                   "editedAt": "2026-02-03T00:00:00Z",
                   "images": {"plain": {"url": "x"}, "scene": {"url": "y"}}}),
    # 2. **かな／カナ。** 完全一致では外れる。ここがこの道具を作る理由
    (DOC["kana"], {"emoji": "🦀", "aliases": [N_KANA], "channelName": "",
                   "createdAt": "2026-01-03T00:00:00Z",
                   "images": {"plain": {"url": "x"}}}),
    # 3. どこにも居ない
    (DOC["none"], {"emoji": "🐟", "aliases": [N_NONE], "channelName": "",
                   "createdAt": "2025-11-01T00:00:00Z", "images": {}}),
    # 4. **呼び名を1つも持たない人。** 落とさない
    (DOC["noname"], {"emoji": "🐙", "aliases": [], "channelName": "",
                     "createdAt": "2025-10-01T00:00:00Z", "images": {}}),
    # 5. チャットには居ないが、**投げ銭の台帳には名前で当たる**
    (DOC["tip"], {"emoji": "🦑", "aliases": [N_TIP], "channelName": "",
                  "createdAt": "2026-03-04T00:00:00Z",
                  "images": {"plain": {"url": "x"}}}),
    # 6. ハンドルしか持っていない（呼び名は0件だが、理由が違う）
    (DOC["handle"], {"emoji": "🐡", "aliases": [], "channelName": HANDLE,
                     "createdAt": "2026-03-05T00:00:00Z", "images": {}}),
    # 7-8. **もう `channelId` が入っている人。** 表には出ない
    (DOC["full1"], {"emoji": "🐳", "channelId": CID["taken1"],
                    "aliases": [], "images": {}}),
    (DOC["full2"], {"emoji": "🐬", "channelId": CID["taken2"],
                    "aliases": [], "images": {}}),
]

TIPS = [
    ("tip1", {"displayNameSnapshot": T_TIP, "channelId": CID["tip"]}),
    ("tip2", {"displayNameSnapshot": N_NAMI, "channelId": ""}),
    ("tip3", {"displayNameSnapshot": "だれでもない", "channelId": ""}),
]

CHANNELS = {
    CID["nami"]: {"days": 61, "lastAt": "2026-09-20T10:00:00Z"},
    CID["aoi"]: {"days": 7, "lastAt": "2025-12-31T10:00:00Z"},
}

CHAT_ROWS = [(CID["nami"], 1204), (CID["aoi"], 88), (CID["other"], 5),
             (CID["gone"], 2)]

TITLES = {
    CID["nami"]: (cw.nm.GOT, N_NAMI),
    CID["aoi"]: (cw.nm.GOT, T_KANA),
    CID["other"]: (cw.nm.GOT, "まったくべつのひと"),
    CID["gone"]: (cw.nm.GONE, ""),
}


class Doc:
    """偽の書類。"""

    def __init__(self, key, data, exists=True):
        self.id = key
        self._d = dict(data)
        self.exists = exists

    def to_dict(self):
        return dict(self._d)

    def get(self):
        """書類の指し先から引く（本物の `DocumentReference.get()`）。"""
        return self


class Query:
    """偽の問い合わせ。**読むだけ。**"""

    def __init__(self, docs):
        self._docs = list(docs)

    def select(self, fields):
        # 本物と同じく**一覧**しか受け取らない（字を渡すと本番は空で返る）
        if not isinstance(fields, (list, tuple)):
            raise TypeError("select には一覧を渡す")
        return self

    def limit(self, n):
        return Query(self._docs[:n])

    def get(self):
        return list(self._docs)

    def stream(self):
        return iter(self._docs)


class Col(Query):
    """偽の入れ物。"""

    def __init__(self, docs, box):
        super().__init__(docs)
        self._box = box

    def document(self, key):
        for d in self._docs:
            if d.id == key:
                return d
        return Doc(key, {}, exists=False)

    def set(self, *a, **k):
        self._box["writes"] += 1

    def update(self, *a, **k):
        self._box["writes"] += 1


class FakeDb:
    """偽の Firestore。**書かれた回数を数える。**"""

    def __init__(self, box):
        self._box = box
        self._cols = {
            "islandCharacter": [Doc(k, v) for k, v in CHARS],
            "islandTips": [Doc(k, v) for k, v in TIPS],
            "islandChannels": [Doc(k, v) for k, v in CHANNELS.items()],
        }

    def collection(self, name):
        return Col(self._cols.get(name, []), self._box)

    def batch(self):
        self._box["writes"] += 1
        return self


# ---------------------------------------------------------------- 確かめ

FAIL: list = []


def bad(msg: str) -> None:
    """落ちた理由を積む。"""
    FAIL.append(msg)


# BREAK の名前 -> 落ちてほしい足の番号
LEGS = {"loose": "1", "keep": "2", "blind": "3", "split": "4",
        "secret": "5", "write": "6"}


def check_control() -> None:
    """1 と 2。**素で通ること**を先に見てから、足を1本ずつ抜く。"""
    os.environ.pop("BREAK", None)
    clean = cw.run_control()
    if clean:
        bad("(1) 壊していない写しで対照が落ちた: " + " / ".join(clean))
        return
    for name, leg in LEGS.items():
        os.environ["BREAK"] = name
        got = cw.run_control()
        os.environ.pop("BREAK", None)
        if not got:
            bad(f"(2) BREAK={name} で対照が落ちなかった（足 {leg} が守っていない）")
            continue
        legs = sorted({m.group(1) for m in
                       (re.match(r"\((\d)\)", x) for x in got) if m})
        if legs != [leg]:
            bad(f"(2) BREAK={name} で落ちたのは足 {legs}。欲しいのは ['{leg}']")


def run_tool(public: bool) -> tuple:
    """道具を丸ごと1回、偽の口で回す。

    Args:
        public: 公開の場（`GITHUB_ACTIONS`）として回すか

    Returns:
        （終了コード, 出た字, 書かれた回数）
    """
    box = {"writes": 0}
    keep_env = os.environ.get("GITHUB_ACTIONS")
    keep = (cw.db, cw.nm.chat_channels, cw.nm.fetch_titles, cw.island_icons)
    if public:
        os.environ["GITHUB_ACTIONS"] = "true"
    else:
        os.environ.pop("GITHUB_ACTIONS", None)
    cw.db = lambda: FakeDb(box)
    cw.nm.chat_channels = lambda: list(CHAT_ROWS)
    cw.nm.fetch_titles = lambda cids, budget=0: dict(TITLES)
    cw.island_icons = lambda root: {DOC["nami"]}
    at = len(BUF.getvalue())
    try:
        code = cw.main()
    finally:
        cw.db, cw.nm.chat_channels, cw.nm.fetch_titles, cw.island_icons = keep
        if keep_env is None:
            os.environ.pop("GITHUB_ACTIONS", None)
        else:
            os.environ["GITHUB_ACTIONS"] = keep_env
    return code, BUF.getvalue()[at:], box["writes"]


def check_run() -> None:
    """3〜7。**公開の場で1回、手元として1回**、同じ仕込みを回す。"""
    code, text, writes = run_tool(public=True)

    # 3. 1人も欠けない（`channelId` を持つ2人は表に出ない）
    body = [ln for ln in text.splitlines() if ln.startswith("#")]
    if len(body) != 6:
        bad(f"(3) 表に並んだのは {len(body)}人。欲しいのは 6人")
    if "**空いている（表のぶん）**     6人" not in text:
        bad("(3) まとめの人数が合わない")
    if "呼び名を1つも持たない          2人" not in text:
        bad("(3) 呼び名を持たない人の数え方が違う")

    # 4. 割れている（0人 と 1人以上 の両方が出る）
    if code != 0:
        bad(f"(4) 割れているのに終了コードが {code}（欲しいのは 0）")
    if "**0人（本当に居ない）4人**" not in text:
        bad("(4) ゆるい一致 0人 の数え方が違う")
    if "1人以上（当てられるかも）2人" not in text:
        bad("(4) ゆるい一致 1人以上 の数え方が違う")
    # **完全一致では外れる人が、ゆるい一致では当たる**（この道具を作る理由）
    kana = [ln for ln in body if "🦀" in ln]
    if len(kana) != 1 or not re.search(r"\s0\s+1\s", kana[0]):
        bad("(4) かな／カナの人が『完全0 / ゆる1』になっていない")

    # 5. 素性が1文字も出ない
    leak = sorted({s for s in SECRETS if s and s in text})
    if leak:
        bad(f"(5) 公開の場の出力に、仕込んだ素性が {len(leak)}件 出た")
    for pat, what in ((r"UC[A-Za-z0-9_-]{20,}", "チャンネルID"),
                      (r"@[A-Za-z0-9_.-]{3,}", "ハンドル")):
        if re.search(pat, text):
            bad(f"(5) 公開の場の出力に {what} の形が出た")

    # 7. 1バイトも書かない
    if writes:
        bad(f"(7) 偽の Firestore に {writes} 回書かれた")

    # 6. **対照。** 手元で回すと書類IDが素で出る
    code2, plain, _w = run_tool(public=False)
    if not any(DOC[k] in plain for k in ("nami", "kana")):
        bad("(6) 手元で回しても書類IDが素で出ない。"
            "5 の 0件は『消えた』ではなく『そもそも何も出ていない』")
    if code2 != 0:
        bad(f"(6) 手元の回で終了コードが {code2}")


def check_readonly() -> None:
    """7 の残り。**読むだけの写しに書けないこと**を、直に叩いて見る。"""
    box = {"writes": 0}
    src = readonly(FakeDb(box))
    try:
        src.collection("islandCharacter").document("x").update({"a": 1})
    except ReadOnly:
        pass
    except Exception as e:  # noqa: BLE001
        bad(f"(7) 読むだけの写しが思わぬ落ち方をした（{type(e).__name__}）")
    else:
        bad("(7) 読むだけの写しに書けてしまった")
    if box["writes"]:
        bad(f"(7) 読むだけの写しから {box['writes']} 回書かれた")


def main() -> int:
    """確かめて、終了コードを返す。"""
    os.environ.pop("BREAK", None)
    os.environ["ARGS"] = "{}"
    check_control()
    if any(x.startswith("(1)") for x in FAIL):
        # **本物を動かせていない。** 数えられなかったので 2
        for line in FAIL:
            print("  " + line, file=REAL_ERR)
        print("**確かめられませんでした**（本物の matching.utils.ts）",
              file=REAL_ERR)
        return 2
    check_run()
    check_readonly()
    if FAIL:
        print("", file=REAL_ERR)
        for line in FAIL:
            print("  " + line, file=REAL_ERR)
        print(f"characters_why: **{len(FAIL)}件** 見つかりました", file=REAL_ERR)
        return 1
    print("characters_why: 7つとも通りました"
          "（素で通る / BREAK 6本が足1本ずつ / 欠けない / 割れる / "
          "素性ゼロ / その対照 / 書かない）", file=REAL_ERR)
    return 0


if __name__ == "__main__":
    sys.exit(main())
