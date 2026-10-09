"""偽の Firestore・偽の BigQuery で `stamp_line_suggest` を**動かして確かめる**。

    python3 python/admin/stamp_line_suggest_selftest.py

**本番には1バイトも出ない。** Firestore も BigQuery も資格情報も要らない。

## なぜ、これを書いたか

選び方そのものは `python/stamp_line_pick_selftest.py` が見ている。
ここが見るのは**出し入れのところ**で、外れると戻らないのが2つある。

  1. **`lines` を書いてしまう**（本人が決めたことばが流し直しで消える。人の字）
  2. **候補のことばをログに出してしまう**（公開の Actions ログに残る。
     本人のコメントから取った字なので、並べれば「誰が何を言っているか」）

どちらも赤くならない。

## 確かめるもの

  1. **相手は入れ物の書類から集める**（名簿を渡さない）
  2. `channelId` の無い書類は**数えて出す**（黙って落とさない）
  3. **`apply` 無しでは書き込みが1回も呼ばれない**
  4. `apply` を付けると、**`suggested` と `suggestedAt` だけ**が入る
  5. **1本も出なかった人には、空の提案を置かない**
  6. 出力に**候補のことばもチャンネルIDも書類IDも1文字も出ない**
  7. **相手が0人なら 2 で止まる**（0人と「読めなかった」を混ぜない）

終了コード: 0=通った / 1=落ちた
"""

import io
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

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

os.environ.setdefault("BQ_PROJECT_ID", "stamp-line-suggest-selftest")

import stamp_line_suggest as sug  # noqa: E402
from _fake_fs import FakeDb, cid  # noqa: E402

# **候補になる口ぐせ。** これが1文字でも出力に出たら落とす
MINE = "いやぁまいったね"
MINE2 = "ねむい"
MINE3 = "そうきたか"
# **本人が決めたことば。** 1文字でも消えたら落とす
KEPT = ["もうきめた"]

DOC = {
    "a": "a" + "0123456789abcdef" * 2,
    "b": "b" + "0123456789abcdef" * 2,
    "nochan": "c" + "0123456789abcdef" * 2,
}
CH = {"a": cid("aa"), "b": cid("bb")}

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


class FakeBq:
    """偽の BigQuery。見積もりと引きだけ。"""

    def __init__(self, rows, mb=12.0):
        self.rows = rows
        self.mb = mb
        self.dry = 0
        self.ran = 0

    def query(self, sql, job_config=None):
        """引く（または見積もる）。

        Args:
            sql: SQL
            job_config: 設定（`dry_run` を見る）

        Returns:
            結果の姿
        """
        if job_config is not None and getattr(job_config, "dry_run", False):
            self.dry += 1
            return type("Dry", (), {
                "total_bytes_processed": int(self.mb * (1 << 20))})()
        self.ran += 1
        rows = [{"ch": c, "t": t, "n": n} for c, t, n in self.rows]
        return type("Job", (), {"result": lambda self_: rows})()


def store() -> FakeDb:
    """偽の Firestore。**入れ物に3件**。

    Returns:
        偽の db
    """
    fake = FakeDb()
    fake.data["islandStampLine"] = {
        DOC["a"]: {"channelId": CH["a"], "lines": list(KEPT), "pickedAt": 1},
        DOC["b"]: {"channelId": CH["b"], "lines": [], "pickedAt": 1},
        # **channelId の無い書類。** 候補を出せない
        DOC["nochan"]: {"channelId": "", "lines": [], "pickedAt": 1},
    }
    return fake


def rows() -> list:
    """偽の数え上げ。**b には候補が1本も出ない。**

    Returns:
        `(チャンネルID, 字, 回数)` の並び
    """
    return [
        (CH["a"], MINE, 6),
        (CH["a"], MINE2, 4),
        (CH["a"], MINE3, 3),
        # b は短い相槌しか打っていない。**1本も出ない**
        (CH["b"], "w", 50),
        (CH["b"], "888", 30),
    ]


def run(apply_it, fake=None, bq=None, extra=None):
    """`stamp_line_suggest.main()` を1回回す。

    Args:
        apply_it: 置くか
        fake: 偽の Firestore
        bq: 偽の BigQuery
        extra: 追加の入力

    Returns:
        (終了コード, 偽の Firestore, 偽の BigQuery)
    """
    fake = fake or store()
    bq = bq or FakeBq(rows())
    sug.db = lambda: fake  # noqa: ARG005
    sug.bigquery = None
    os.environ.pop("GITHUB_EVENT_PATH", None)
    body = dict(extra or {})
    if apply_it:
        body["apply"] = True
    os.environ["ARGS"] = json.dumps(body)

    # **`google.cloud.bigquery` を偽物に差し替える。** この箱に本物は無い
    mod = type("M", (), {})()
    mod.Client = lambda project=None: bq  # noqa: ARG005
    mod.QueryJobConfig = lambda **kw: type("C", (), kw)()
    sys.modules["google.cloud.bigquery"] = mod
    code = sug.main()
    return code, fake, bq


print("# 0. 探し方が当たるか（先に見る）")
code, fake, bq = run(False)
check("下見は 0 で終わる", code == 0, str(code))
check("入れ物に3件ある", len(fake.data["islandStampLine"]) == 3)
check("BigQuery を見積もってから引いた", bq.dry == 1 and bq.ran == 1,
      f"dry={bq.dry} ran={bq.ran}")
out = BUF.getvalue()
check("相手は2人と数えた（channelId の無い1件を除いた）",
      "候補を出す相手: 2 人" in out)
check("1本も出なかった人を数えて出した",
      "候補が出た 1 人 / 1本も出なかった 1 人" in out)
check("channelId の無い書類を言っている", "候補を出せない" in out)

print("\n# 1. 下見は1バイトも書かない")
check("書き込みが1回も呼ばれていない", fake.writes == [], str(fake.writes))

print("\n# 2. apply を付けると、suggested だけが入る")
code, fake, bq = run(True)
check("0 で終わる", code == 0, str(code))
check("書いたのは1人ぶんだけ", len(fake.writes) == 1, str(len(fake.writes)))
check("書いた先は候補が出た人",
      fake.writes[0]["id"] == DOC["a"], fake.writes[0]["id"])
keys = sorted(fake.writes[0]["patch"])
check("触った欄は2つだけ", keys == ["suggested", "suggestedAt"], ",".join(keys))
check("まるごと置き換えない（merge）", fake.writes[0]["merge"] is True)
check("lines を送っていない", "lines" not in fake.writes[0]["patch"])
check("本人が決めたことばが残っている",
      fake.data["islandStampLine"][DOC["a"]]["lines"] == KEPT,
      str(fake.data["islandStampLine"][DOC["a"]]["lines"]))
check("3本置いた", len(fake.writes[0]["patch"]["suggested"]) == 3,
      str(fake.writes[0]["patch"]["suggested"]))
check("1本目は口ぐせ", fake.writes[0]["patch"]["suggested"][0] == MINE)

print("\n# 3. 1本も出なかった人には、空の提案を置かない")
check("その人の書類に suggested が入っていない",
      "suggested" not in fake.data["islandStampLine"][DOC["b"]],
      str(fake.data["islandStampLine"][DOC["b"]]))
check("channelId の無い書類にも入っていない",
      "suggested" not in fake.data["islandStampLine"][DOC["nochan"]])

print("\n# 4. 相手が0人なら 2 で止まる")
empty = FakeDb({"islandStampLine": {}})
code, _, bq2 = run(True, fake=empty)
check("2 で終わる", code == 2, str(code))
check("BigQuery を1回も引いていない", bq2.dry == 0 and bq2.ran == 0,
      f"dry={bq2.dry} ran={bq2.ran}")

print("\n# 5. 上限を超えたら引かない")
code, _, big = run(True, bq=FakeBq(rows(), mb=2048.0))
check("1 で終わる", code == 1, str(code))
check("見積もりだけで止まった", big.dry == 1 and big.ran == 0,
      f"dry={big.dry} ran={big.ran}")

print("\n# 6. 出力に、素性も候補のことばも1文字も出ていない")
out = BUF.getvalue()
for v in [MINE, MINE2, MINE3] + KEPT:
    check(f"ことばが出ていない（{v[:3]}…）", v not in out)
for v in list(CH.values()) + list(DOC.values()):
    check(f"識別子が出ていない（{v[:4]}…）", v not in out)
check("指紋は出ている（伏せ字ではなく追える形）", "#" in out)
print(f"  出た行: {len(out.splitlines())} 行")

print("")
if BAD:
    print(f"NG が {BAD} 件。")
    sys.exit(1)
print("ぜんぶ通った。")
