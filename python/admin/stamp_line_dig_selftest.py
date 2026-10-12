"""偽の Firestore・偽の BigQuery で `stamp_line_dig` を**動かして確かめる**。

    python3 python/admin/stamp_line_dig_selftest.py

**本番には1文字も出ない。** Firestore も BigQuery も GitHub も叩かない。

## なぜ、これを書いたか

この道具は **`stamp_line_table` と同じく、名前と本人のコメントを公開の
issue に貼る。** そのうえで、**門を外して**引くのがここだけの仕事なので、
外れると戻らないのが4つある。

  1. **公開の Actions ログに、名前かことばか探した語が出る**（消せない）
  2. **下見のつもりで貼ってしまう**（通知はもう飛んでいる）
  3. **Firestore に書いてしまう**——ここは**1バイトも書かない**口で、
     掘ったものをそのまま置くと**あやとが見ていない字が提案に出る**
  4. **点の高い順に並べて貼る**——並びがそのまま協力の順位表になる
     （`docs/island-money.md`）

どれも赤くならない。

## 確かめるもの

  1. **`apply` 無しでは1本も貼らない**
  2. `apply` を付けると**貼る**
  3. **Firestore に1バイトも書かない**（`apply` を付けても）
  4. **門を外して引けている**——`stamp_line_suggest` が落とす字
     （島のほかの人も言っている字）が、**ちゃんと別の表に出る**
  5. **1回しか言っていない字も出る**（`suggest` の10本では見えない下）
  6. **いま候補に出ている字には印が付く**（消さない）
  7. **語で探したぶんが出る。無かった語は「1本もありません」と書く**
  8. **こちらが剥がした切れ端は出さない**（1行まるごと打った字だけ）
  9. 並びは**回数の多い順**で、**点は1つも出さない**
  10. **名前から引けない人は数えて返す**（黙って落とさない）
  11. **名前を1つも渡さなくても掘れる**——`suggested` が2本以上
      残っている人（＝まだ決めかねている人）を入れ物から集める。
      **本人が `lines` を書いた人と、1本に決まった人は掘らない**
      （`workflow_dispatch` から押すための道。名簿を入力に取らない）
  12. `words` を1本の字（読点区切り）で渡しても、掘る人ぜんぶに当たる
  13. 掘る相手が1人もいなければ **2 で止まる**（0人と「読めなかった」を
      混ぜない）
  14. ログと注記に、**名前もことばも探した語も1文字も出ない**

終了コード: 0=通った / 1=落ちた
"""

import io
import json
import os
import sys
import tempfile

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

# **注記（`::notice::`）の道も通す。**
os.environ["GITHUB_ACTIONS"] = "true"
os.environ.setdefault("BQ_PROJECT_ID", "stamp-line-dig-selftest")

import stamp_line_dig as dig  # noqa: E402
from _fake_fs import FakeDb, cid  # noqa: E402

NAME_A = "みどりのひと"
HANDLE_A = "@midori-no-hito"
NAME_B = "そらのひと"
NAME_C = "ゆきのひと"
# 入れ物のだれにも当たらない名前
NONAME = "だれでもないひと"

# その人しか言っていない字（回数の多いほう・少ないほう）
MINE_A1 = "ぬるぬるぽんぽん"
MINE_A2 = "まめまめキューン"
# **1回しか言っていない字。** `suggest` の10本では見えない下にいる
MINE_A3 = "そらがきれいだね"
# **島のみんなも言う字。** いまの門で落ちるが、その人がいちばん言う
SHARED = "ぱちぱち"
# **島のみんなの字。** その人のものではない（割合で落ちる）
PLAIN = "こんばんは"
# 語で探す字と、探しても無い語
WORD_HIT = "まめまめ"
WORD_MISS = "ぜったいにいわないことば"

DOC = {
    "a": "a" + "0123456789abcdef" * 2,
    "b": "b" + "0123456789abcdef" * 2,
    "c": "c" + "0123456789abcdef" * 2,
}
CH = {"a": cid("aa"), "b": cid("bb"), "c": cid("cc")}
MOB = [cid(f"m{i}") for i in range(12)]

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


def fake_db() -> FakeDb:
    """偽の Firestore。

    Returns:
        偽の Firestore
    """
    return FakeDb({
        "islandStampLine": {
            DOC["a"]: {"channelId": CH["a"], "suggested": [MINE_A1],
                       "suggestedFrom": [MINE_A1]},
            DOC["b"]: {"channelId": CH["b"], "suggested": []},
            # **チャンネルIDの無い人。** 掘れないので数えて返す
            DOC["c"]: {"channelId": "", "suggested": []},
        },
        "islandCharacter": {
            DOC["a"]: {"emoji": "🐧", "channelName": HANDLE_A,
                       "aliases": [NAME_A]},
            DOC["b"]: {"emoji": "🦔", "channelName": NAME_B},
            DOC["c"]: {"emoji": "🐢", "aliases": [NAME_C]},
        },
    })


def left_db() -> FakeDb:
    """**まだ決まっていない人**を見分けるための偽の Firestore。

    Returns:
        偽の Firestore
    """
    return FakeDb({
        "islandStampLine": {
            # まだ決めかねている（候補が2本以上残っている）
            DOC["a"]: {"channelId": CH["a"],
                       "suggested": [MINE_A1, MINE_A2]},
            # **もう1本に決まった人**（`arrange` が置いたあとの姿）
            DOC["b"]: {"channelId": CH["b"], "suggested": [SHARED]},
            # **本人が決めた人**（本人の字が勝つので掘らない）
            DOC["c"]: {"channelId": CH["c"], "lines": ["きめた"],
                       "suggested": [MINE_A1, MINE_A2]},
        },
        "islandCharacter": {
            DOC["a"]: {"emoji": "🐧", "aliases": [NAME_A]},
            DOC["b"]: {"emoji": "🦔", "channelName": NAME_B},
            DOC["c"]: {"emoji": "🐢", "aliases": [NAME_C]},
        },
    })


def bqrows() -> list:
    """偽の数え上げ。`(チャンネルID, 字, 回数, 日数)`。

    Returns:
        並び
    """
    r = [
        (CH["a"], MINE_A1, 12, 6),
        (CH["a"], MINE_A2, 4, 2),
        (CH["a"], MINE_A3, 1, 1),
        # その人がいちばん言うが、ほかにも言う人が居る字
        (CH["a"], SHARED, 90, 20),
        # 島のみんなの字（その人のものではない）
        (CH["a"], PLAIN, 10, 5),
        (CH["b"], SHARED, 5, 3),
        (CH["b"], PLAIN, 8, 4),
    ]
    r += [(m, PLAIN, 30, 12) for m in MOB]
    r += [(m, SHARED, 2, 1) for m in MOB[:4]]
    return r


POSTED: list = []


def fake_post(issue, body, comment=0):
    """貼ったことにする。

    Args:
        issue: issue の番号
        body: 本文
        comment: 書き替えるコメントの番号

    Returns:
        偽のコメント番号
    """
    POSTED.append((issue, body, comment))
    return comment or (1000 + len(POSTED))


# **`@` 付き・前後に空白のある書かれかた**でも引けること（`fold_name`）
TYPED_A = f" @{NAME_A} "

WHO = [{"name": TYPED_A, "words": [WORD_HIT, WORD_MISS]},
       {"name": NAME_B},
       # 名前から引けない人（黙って落とさない）
       {"name": NONAME},
       # チャンネルIDの無い人（数えるものが無い）
       {"name": NAME_C}]


def run_left(words=None, data=None) -> tuple:
    """**名前を1つも渡さずに**動かす。

    Args:
        words: 掘る人ぜんぶに当てる語
        data: 偽の Firestore

    Returns:
        (終了コード, 偽の Firestore)
    """
    POSTED.clear()
    fake = data if data is not None else left_db()
    dig.db = lambda: fake
    dig.island = lambda days: bqrows()  # noqa: ARG005
    dig.post = fake_post
    body = {"apply": True}
    if words is not None:
        body["words"] = words
    fd, path = tempfile.mkstemp(suffix=".json")
    with os.fdopen(fd, "w", encoding="utf-8") as f:
        json.dump({"client_payload": body}, f)
    os.environ["GITHUB_EVENT_PATH"] = path
    os.environ["ARGS"] = "{}"
    return dig.main(), fake


def run(apply: bool, who=None, data=None) -> tuple:
    """1回動かす。

    Args:
        apply: 貼るか
        who: 掘る相手（省略すると `WHO`）
        data: 偽の Firestore

    Returns:
        (終了コード, 偽の Firestore)
    """
    POSTED.clear()
    fake = data if data is not None else fake_db()
    dig.db = lambda: fake
    dig.island = lambda days: bqrows()  # noqa: ARG005
    dig.post = fake_post
    body = {"who": WHO if who is None else who}
    if apply:
        body["apply"] = True
    fd, path = tempfile.mkstemp(suffix=".json")
    with os.fdopen(fd, "w", encoding="utf-8") as f:
        json.dump({"client_payload": body}, f)
    os.environ["GITHUB_EVENT_PATH"] = path
    os.environ["ARGS"] = "{}"
    return dig.main(), fake


def main() -> int:
    """エントリポイント。

    Returns:
        0=通った / 1=落ちた
    """
    print("== 下見（apply なし）==")
    rc, fake = run(apply=False)
    check(rc == 0, "下見は 0 で終わる")
    check(not POSTED, "**下見では1本も貼らない**")
    check(fake.writes == [], "**下見では Firestore に1バイトも書かない**")

    print("== 貼る（apply あり）==")
    rc, fake = run(apply=True)
    check(rc == 0, "0 で終わる")
    check(len(POSTED) == 1, "1本貼った")
    check(fake.writes == [],
          "**貼るときも Firestore に1バイトも書かない**")
    body = POSTED[0][1] if POSTED else ""

    print("== 掘れているか ==")
    check(MINE_A2 in body, "いまの候補に無い字が出ている")
    check(MINE_A3 in body,
          "**1回しか言っていない字も出ている**（10本の下）")
    check(SHARED in body,
          "**門で落ちている字も、別の表に出ている**")
    check(PLAIN not in body,
          "**その人のものではない字は出さない**（割合で落ちる）")
    check("いまの1番" in body,
          "**いま候補に出ている字には印が付く**（消さない）")
    check(MINE_A1 in body, "いまの候補も消さずに出す")

    print("== 語で探す ==")
    check(f"「{WORD_HIT}」" in body and MINE_A2 in body,
          "語で探したぶんが出ている")
    check("1本もありません" in body,
          "**探して無かった語は、はっきり書く**")

    print("== 並びと、出さないもの ==")
    # **回数の多い順。** 点は1つも出さない
    check(body.index(MINE_A2) < body.index(MINE_A3),
          "**回数の多い順**に並んでいる")
    for bad in ("点", "らしさ", "score"):
        check(f"{bad}=" not in body, f"本文に {bad} の値を出さない")

    print("== 引けない人 ==")
    check("2人は名前から引けませんでした" in body,
          "**名前から引けない人を、黙って落とさず数えて書く**")

    print("== 名前を渡さずに掘る ==")
    rc, fake = run_left()
    check(rc == 0 and len(POSTED) == 1, "名前を1つも渡さなくても掘れる")
    left = POSTED[0][1] if POSTED else ""
    check(NAME_A in left,
          "**候補が2本以上残っている人**（まだ決めかねている人）は掘る")
    check(NAME_B not in left,
          "**もう1本に決まった人は掘らない**")
    check(NAME_C not in left,
          "**本人が決めた人は掘らない**（本人の字が勝つ）")
    check(fake.writes == [], "ここでも Firestore に1バイトも書かない")

    rc, fake = run_left(words=f"{WORD_HIT}、{WORD_MISS}")
    left = POSTED[0][1] if POSTED else ""
    check(rc == 0 and f"「{WORD_HIT}」" in left,
          "**読点区切りの1本でも、語として受け取る**")
    check("1本もありません" in left, "無かった語も、掘る人ぜんぶに当てる")

    print("== 入力が足りない ==")
    rc, fake = run(apply=True, who=[])
    check(rc == 2 and not POSTED,
          "**掘る相手が1人もいなければ 2 で止まる**")
    rc, fake = run(apply=True, who="これは並びではない")
    check(rc == 2 and not POSTED, "**形が違えば 2 で止まる**")
    rc, fake = run(apply=True, who=[{"name": NONAME}])
    check(rc == 1 and not POSTED,
          "**1人も引けなければ 1 で止まる**（貼らない）")

    print("== 公開のログ ==")
    logged = BUF.getvalue()
    for v in (MINE_A1, MINE_A2, MINE_A3, SHARED, PLAIN,
              WORD_HIT, WORD_MISS):
        check(v not in logged, "**ことばが公開のログに出ない**")
    for v in (NAME_A, NAME_B, NAME_C, HANDLE_A, NONAME, TYPED_A.strip()):
        check(v not in logged, "**名前が公開のログに出ない**")
    for v in list(CH.values()) + list(DOC.values()):
        check(v not in logged, "**識別子が公開のログに出ない**")
    check("::notice::" in logged, "注記（::notice::）が出ている")
    for ln in [x for x in logged.splitlines()
               if x.startswith("::notice::")]:
        check(all(v not in ln for v in
                  (MINE_A1, MINE_A2, MINE_A3, SHARED, WORD_HIT, NAME_A,
                   NAME_B, NONAME, HANDLE_A, TYPED_A.strip())
                  + tuple(CH.values())
                  + tuple(DOC.values())),
              "注記に件数しか出ていない")

    print(("通りました" if BAD == 0 else f"落ちました（{BAD} 件）"))
    return 1 if BAD else 0


if __name__ == "__main__":
    sys.exit(main())
