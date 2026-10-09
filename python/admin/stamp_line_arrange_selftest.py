"""偽の Firestore で `stamp_line_arrange` を**動かして確かめる**（#716）。

    python3 python/admin/stamp_line_arrange_selftest.py

**本番には1バイトも出ない。** Firestore も資格情報も要らない。

## なぜ、これを書いたか

ここは**人が書いた字を、人の名前のついた書類に入れる口**なので、
外れると戻らないのが4つある。

  1. **`lines` を書いてしまう**（本人が決めたことばが消える。人の字）
  2. **`channelId` を落としてしまう**（本人が `/me` から自分のぶんを
     引けなくなる。`set` を `merge` なしでやると起きる）
  3. **元の字を落としてしまう**（表で「直したもの」と「直していないもの」が
     見分けられなくなる。あやとが「それは言わない」と言えない）
  4. **ことばが公開の Actions ログに出る**（消せない）

どれも赤くならない。

## 確かめるもの

  1. **`apply` 無しでは1バイトも書かない**
  2. `apply` を付けると、**`suggested` と `suggestedFrom` と
     `suggestedAt` だけ**が入る（**同じ長さ・同じ順**）
  3. **`lines` と `channelId` が残る**
  4. **元の字が無い行は置かない**
  5. **長すぎる字は置かない**（口が切る線と同じ）
  6. **入れ物に居ない書類には置かない**
  7. **3本より多くは置かない**
  8. 渡されたものが空なら **2 で止まる**
  9. ログと注記に、**ことばも書類IDも1文字も出ない**

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
        """書く。

        Args:
            s: 字

        Returns:
            書いた長さ
        """
        for w in self.ws:
            w.write(s)
        return len(s)

    def flush(self):
        """流す。"""
        for w in self.ws:
            try:
                w.flush()
            except Exception:  # noqa: BLE001
                pass


sys.stdout = Tee(REAL_OUT, BUF)
sys.stderr = Tee(REAL_ERR, BUF)

# **注記（`::notice::`）の道も通す。** ここを立てないと、
# その1行だけ見張りを素通りする
os.environ["GITHUB_ACTIONS"] = "true"
os.environ.setdefault("BQ_PROJECT_ID", "stamp-line-arrange-selftest")

import stamp_line_arrange as arr  # noqa: E402
from _fake_fs import FakeDb, cid  # noqa: E402

DOC = {
    "a": "a" + "0123456789abcdef" * 2,
    "b": "b" + "0123456789abcdef" * 2,
}
# **入れ物に居ない書類ID。** ここに置こうとしたら落とす
GONE = "z" + "0123456789abcdef" * 2
CH = {"a": cid("aa"), "b": cid("bb")}

# **本人が決めたことば。** 1文字でも消えたら落とす
KEPT = ["もうきめた"]
# 元の字と、手で直した字
SRC = "こんばんはお疲れ様です高評価押しましたよ"
FIXED = "こんばんはお疲れ様です"
# 直していない字（元の字と同じ）
SAME = "了解やで"
# **長すぎる字。** 置かない
TOO_LONG = "あ" * 21

BAD = 0


def check(ok: bool, what: str) -> None:
    """1つ確かめる。

    Args:
        ok: 通ったか
        what: 何を見たか
    """
    global BAD
    if not ok:
        BAD += 1
    print(("  OK   " if ok else "  NG   ") + what)


def store() -> FakeDb:
    """偽の Firestore。**入れ物に2件。**

    Returns:
        偽の db
    """
    return FakeDb({
        "islandStampLine": {
            DOC["a"]: {"channelId": CH["a"], "lines": list(KEPT),
                       "suggested": [SRC], "suggestedFrom": [SRC],
                       "pickedAt": 1},
            DOC["b"]: {"channelId": CH["b"], "lines": [], "pickedAt": 1},
        },
    })


def run(fix, apply_it, fake=None):
    """1回動かす。

    Args:
        fix: 渡すもの
        apply_it: 書くか
        fake: 偽の Firestore

    Returns:
        (終了コード, 偽の Firestore)
    """
    fake = fake or store()
    arr.db = lambda: fake
    body = {"fix": fix}
    if apply_it:
        body["apply"] = True
    os.environ["ARGS"] = json.dumps(body)
    os.environ.pop("GITHUB_EVENT_PATH", None)
    return arr.main(), fake


def main() -> int:
    """エントリポイント。

    Returns:
        0=通った / 1=落ちた
    """
    one = [{"id": DOC["a"],
            "lines": [{"text": FIXED, "from": SRC},
                      {"text": SAME, "from": SAME}]}]

    print("== 下見（apply なし）==")
    rc, fake = run(one, False)
    check(rc == 0, "下見は 0 で終わる")
    check(fake.writes == [], "**下見では1バイトも書かない**")

    print("== 書く（apply あり）==")
    rc, fake = run(one, True)
    check(rc == 0, "0 で終わる")
    check(len(fake.writes) == 1, "1人ぶんだけ書いた")
    patch = fake.writes[0]["patch"] if fake.writes else {}
    keys = sorted(patch)
    check(keys == ["suggested", "suggestedAt", "suggestedFrom"],
          "触った欄は3つだけ: " + ",".join(keys))
    check(fake.writes[0]["merge"] is True, "まるごと置き換えない（merge）")
    check("lines" not in patch, "**`lines` を送っていない**")
    check(patch.get("suggested") == [FIXED, SAME],
          "**出す字が、渡した順で入っている**")
    check(patch.get("suggestedFrom") == [SRC, SAME],
          "**元の字が、同じ長さ・同じ順で入っている**")
    got = fake.data["islandStampLine"][DOC["a"]]
    check(got.get("lines") == KEPT, "**本人が決めたことばが残っている**")
    check(got.get("channelId") == CH["a"], "**`channelId` が残っている**")

    print("== 置かないもの ==")
    rc, fake = run([{"id": DOC["a"], "lines": [{"text": FIXED}]}], True)
    check(rc == 2 and not fake.writes,
          "**元の字が無い行は置かない**（直したか分からなくなる）")
    rc, fake = run([{"id": DOC["a"],
                     "lines": [{"text": TOO_LONG, "from": SRC}]}], True)
    check(rc == 2 and not fake.writes, "**長すぎる字は置かない**")
    rc, fake = run([{"id": GONE,
                     "lines": [{"text": FIXED, "from": SRC}]}], True)
    check(rc == 1 and not fake.writes,
          "**入れ物に居ない書類には置かない**")
    rc, fake = run([{"id": DOC["a"], "lines": [
        {"text": "いちばん", "from": "いちばん"},
        {"text": "にばんめ", "from": "にばんめ"},
        {"text": "さんばんめ", "from": "さんばんめ"},
        {"text": "よばんめ", "from": "よばんめ"},
    ]}], True)
    check(len(fake.writes) == 1
          and len(fake.writes[0]["patch"]["suggested"]) == arr.MAX_LINES,
          f"**{arr.MAX_LINES} 本より多くは置かない**")
    rc, fake = run([], True)
    check(rc == 2 and not fake.writes, "**空なら 2 で止まる**")
    rc, fake = run("これは並びではない", True)
    check(rc == 2 and not fake.writes, "**形が違えば 2 で止まる**")

    print("== 公開のログ ==")
    logged = BUF.getvalue()
    for v in [SRC, FIXED, SAME, TOO_LONG] + KEPT:
        check(v not in logged, "**ことばが公開のログに出ない**")
    for v in list(CH.values()) + list(DOC.values()) + [GONE]:
        check(v not in logged, "**識別子が公開のログに出ない**")
    check("::notice::" in logged, "注記（::notice::）が出ている")
    for ln in [x for x in logged.splitlines() if x.startswith("::notice::")]:
        check(all(v not in ln for v in
                  [SRC, FIXED, SAME] + KEPT + list(CH.values())
                  + list(DOC.values())),
              "注記に件数しか出ていない")

    print(("通りました" if BAD == 0 else f"落ちました（{BAD} 件）"))
    return 1 if BAD else 0


if __name__ == "__main__":
    sys.exit(main())
