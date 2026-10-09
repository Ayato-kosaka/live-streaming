"""偽の Firestore・偽の BigQuery で `stamp_line_table` を**動かして確かめる**。

    python3 python/admin/stamp_line_table_selftest.py

**本番には1文字も出ない。** Firestore も BigQuery も GitHub も叩かない。

## なぜ、これを書いたか

この道具は**名前と、本人のコメントから取った字を、公開の issue に貼る。**
あやとが「名前やコメント出しても問題ない」と言ったのは **issue の中**の
話なので、外れると戻らないのが3つある。

  1. **公開の Actions ログに、名前か候補のことばが出る**（消せない）
  2. **下見のつもりで貼ってしまう**（issue のコメントは消せるが、
     通知はもう飛んでいる）
  3. **強い順に並べて貼る**——並びがそのまま協力の順位表になる
     （`docs/island-money.md`）

どれも赤くならない。

## 2026-10-09 から、見るものが3つ増えた

**式を変えたなら、どの字がどう動いたかを出すまでが仕事**（あやと）。
だから「表が貼れた」では足りない。

  11. **「何日にわたって言ったか」が、候補と同じ並びで出る**
  12. **落ちた字・上がった字・前と変わらなかった人数が出る**
  13. **元の字と出す字の両方が出る**（直していないものは、
      一覧に出てこないことで分かる）

そして動きの突き合わせは**鍵で**やる。字でやると、末尾の句点を落として
あるだけのものが「1本落ちて1本上がった」に化けて、**本当に動いた字が
埋もれる。**

## 確かめるもの

  1. **`apply` 無しでは1本も貼らない**
  2. `apply` を付けると**貼る**（本文が渡る）
  3. ログと注記に、**名前も候補のことばも1文字も出ない**
  4. **候補の出た人が先、出なかった人が後**。中は名前順（強さで並べない）。
     **名前と数の向きが逆の人を1人入れてある**——数の多い人が名前でも
     先だと、強い順に並べ替えても同じ並びになって、見分けがつかない
  5. **候補が0本の人も、行として出る**
  6. 「何回言ったか」「何日にわたって」は**候補と同じ並び**で出る
  7. **島ぜんぶの回数も、割合の点も、本文に出さない**
  8. 同じことばが2本になっている人を**書く**
  9. **人数が足りなければ、足りないと書く**
  10. 入れ物が空なら **2 で止まる**（0人と「読めなかった」を混ぜない）
  11〜13. 上の3つ
  14. **入れ物の中身といまの式が食い違ったら、ログで言う**
      （`stamp_line_suggest` を流し直す前に貼ろうとしている）

終了コード: 0=通った / 1=落ちた
"""

import io
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
os.environ.setdefault("BQ_PROJECT_ID", "stamp-line-table-selftest")

import stamp_line_table as tbl  # noqa: E402
from _fake_fs import FakeDb, cid  # noqa: E402

# **1文字でも出力に出たら落とすもの。**
NAME_A = "いそぎんちゃく座"
NAME_B = "やまびこ用務員"
NAME_C = "こだまの観測者"
# **名前はいちばん先、数はいちばん小さい人。** 並べ替えが名前順か
# 強さ順かを、ここ1人で見分ける
NAME_D = "あいさつ番"
MINE_D1 = "どうも"
# **`channelName` に入っているのはハンドル。** 名前のかわりにこれが
# 並んだら落とす
HANDLE_A = "@isoginchaku-za"
MINE_A1 = "いやぁまいったね"
# **末尾に句点のある字。** 機械が落とすので、元の字と出す字が違う
MINE_A2_SRC = "ねむいよ。"
MINE_A2 = "ねむいよ"
MINE_B1 = "そうきたか"
MINE_B2 = "そうきたか！！"
# **その場かぎりの実況。** 前の式では1位だが、1日に固まっている
EVENT = "特大花火が打ち上がりました"

DOC = {
    "a": "a" + "0123456789abcdef" * 2,
    "b": "b" + "0123456789abcdef" * 2,
    "c": "c" + "0123456789abcdef" * 2,
    "d": "d" + "0123456789abcdef" * 2,
}
CH = {"a": cid("aa"), "b": cid("bb"), "c": cid("cc"), "d": cid("dd")}

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


def chars() -> dict:
    """偽の図鑑。

    Returns:
        `islandCharacter` の中身
    """
    return {
        # **本番の形。** `channelName` は `@` 付きのハンドルで、
        # 呼び名は `aliases` に入っている（`characters_migrate`）
        DOC["a"]: {"emoji": "🐧", "channelName": HANDLE_A,
                   "aliases": [NAME_A]},
        # `aliases` が無い人は `channelName` に落ちる
        DOC["b"]: {"emoji": "🦔", "channelName": NAME_B},
        DOC["c"]: {"emoji": "🐢", "channelName": "",
                   "aliases": [NAME_C]},
        DOC["d"]: {"emoji": "🐌", "channelName": "", "aliases": [NAME_D]},
    }


def fake_db() -> FakeDb:
    """3人ぶんの偽の Firestore。**いまの式で選び直したものと揃っている。**

    Returns:
        偽の Firestore
    """
    return FakeDb({
        "islandStampLine": {
            # **わざと名前順と逆**に並べて入れる（並べ替えが効くかを見る）
            DOC["c"]: {"channelId": CH["c"], "suggested": []},
            DOC["b"]: {"channelId": CH["b"], "suggested": [MINE_B1],
                       "suggestedFrom": [MINE_B1]},
            DOC["a"]: {"channelId": CH["a"],
                       "suggested": [MINE_A1, MINE_A2],
                       "suggestedFrom": [MINE_A1, MINE_A2_SRC]},
            DOC["d"]: {"channelId": CH["d"], "suggested": [MINE_D1],
                       "suggestedFrom": [MINE_D1]},
        },
        "islandCharacter": chars(),
    })


def stale_db() -> FakeDb:
    """**入れ物が古い**偽の Firestore（同じことばが2本入っている）。

    Returns:
        偽の Firestore
    """
    return FakeDb({
        "islandStampLine": {
            DOC["b"]: {"channelId": CH["b"],
                       "suggested": [MINE_B1, MINE_B2],
                       "suggestedFrom": [MINE_B1, MINE_B2]},
        },
        "islandCharacter": chars(),
    })


def bqrows() -> list:
    """偽の数え上げ。`(チャンネルID, 字, 回数, 日数)`。

    Returns:
        並び
    """
    return [
        (CH["a"], MINE_A1, 12, 6),
        (CH["a"], MINE_A2_SRC, 5, 4),
        # b は**前の式では実況が1位**だった。1日に固まっているので落ちる
        (CH["b"], EVENT, 9, 1),
        (CH["b"], MINE_B1, 7, 5),
        (CH["d"], MINE_D1, 3, 3),
    ]


POSTED: list = []


def fake_post(issue, body):
    """貼ったことにする。**本文を取っておく。**

    Args:
        issue: issue の番号
        body: 本文

    Returns:
        偽のコメント番号
    """
    POSTED.append((issue, body))
    return 1000 + len(POSTED)


def run(apply: bool, data=None) -> int:
    """1回動かす。

    Args:
        apply: 貼るか
        data: 偽の Firestore（省略すると3人ぶん）

    Returns:
        終了コード
    """
    POSTED.clear()
    fake = data if data is not None else fake_db()
    tbl.db = lambda: fake
    tbl.island = lambda days: bqrows()  # noqa: ARG005
    tbl.post = fake_post
    os.environ["ARGS"] = '{"apply": true}' if apply else "{}"
    return tbl.main()


def main() -> int:
    """エントリポイント。

    Returns:
        0=通った / 1=落ちた
    """
    print("== 下見（apply なし）==")
    rc = run(apply=False)
    check(rc == 0, "下見は 0 で終わる")
    check(not POSTED, "**下見では1本も貼らない**")

    print("== 貼る（apply あり）==")
    rc = run(apply=True)
    check(rc == 0, "貼ると 0 で終わる")
    check(len(POSTED) == 1, "1コメントで貼れている")
    issue, body = POSTED[0] if POSTED else (0, "")
    check(issue == 716, "既定の行き先は #716")
    check(body.endswith("_Generated by [Claude Code](https://claude.ai/code)_"),
          "末尾に手順どおりの署名が付く")

    print("== 本文の中身 ==")
    for nm in (NAME_A, NAME_B, NAME_C, NAME_D):
        check(nm in body, "名前が本文に出る（あやとと話すための表）")
    for t in (MINE_A1, MINE_A2, MINE_B1):
        check(t in body, "候補のことばが本文に出る")
    check("| 6 / 4 |" in body, "**日数が候補と同じ並びで出る**")
    check("| 12 / 5 |" in body, "**回数が候補と同じ並びで出る**")
    check("何日にわたって" in body, "日数の欄がある")
    # 並び: 候補の出た人（名前順）→ 出なかった人
    i_got = body.index("### 候補が出た人")
    i_non = body.index("### 候補が1本も出なかった人")
    check(i_got < i_non, "**候補の出た人が先、出なかった人が後**")
    check(i_got < body.index(NAME_A) < i_non,
          "候補の出た人は、前の表に入る")
    check(body.index(NAME_C) > i_non,
          "**候補が0本の人も、行として出る**（後ろの表）")
    # 名前順。`NAME_A`（い）→ `NAME_B`（や）
    check(body.index(NAME_A) < body.index(NAME_B),
          "中は名前順（**強い順ではない**）")
    check("4人" in body, "人数を書く")
    check("25人そろっていません" in body, "**足りないと書く**")
    # **名前順かどうかは、名前と数の向きが逆の人を1人入れて見る。**
    # 数の多い人が名前でも先だと、強い順に並べても同じ並びになる
    check(body.index(NAME_D) < body.index(NAME_A) < body.index(NAME_B),
          "**名前順に並んでいる**（数のいちばん小さい人が先頭）")
    # 選び方の内側（島ぜんぶの回数・割合・点）を本文に出さない
    for w in ("割合", "島ぜんぶ", "点が", "スコア"):
        check(w not in body, f"選び方の内側を本文に出さない（{w}）")

    print("== 前の式との動き ==")
    i_mv = body.index("### 前の式との動き")
    check("#### 落ちた字（1本）" in body, "**落ちた字の本数を書く**")
    check(EVENT in body[i_mv:], "**落ちた字そのものを出す**（目で見るため）")
    check(EVENT not in body[:i_mv],
          "**落ちた字を、候補の表には出さない**")
    check("上がった字はありません" in body,
          "上がった字が0本なら、0本と書く")
    check("変わらなかったのは 2人" in body,
          "**前と変わらなかった人数を書く**（全員入れ替わりを見つけるため）")
    check("| 1 | 9 | 13 |" in body,
          "落ちた字に、日数・回数・字数を並べる")

    print("== 元の字と、出す字 ==")
    i_fix = body.index("### 手を入れた字")
    check(MINE_A2_SRC in body[i_fix:], "**元の字を出す**")
    check("ここに無いものは、1文字も直していません" in body,
          "**直していないものが分かる形にする**")
    check(MINE_A2_SRC not in body[i_got:i_non],
          "候補の欄には、出す字のほうを並べる")

    print("== 入れ物が古い（同じことばが2本）==")
    rc = run(apply=True, data=stale_db())
    check(rc == 0, "それでも貼れる（止めない）")
    _, body2 = POSTED[0] if POSTED else (0, "")
    check("「そうきたか」／「そうきたか！！」" in body2,
          "**同じことばが2本になっている人を書く**")
    check("入れ物の中身と、いま選び直したものが 1 人ぶん食い違います"
          in BUF.getvalue(),
          "**入れ物が古いことを、ログで言う**")

    print("== 呼び名をどこから取るか ==")
    check(HANDLE_A not in body,
          "**`channelName` のハンドルを名前として出さない**")
    check("名前が引けません" not in body, "名前は4人とも引けている")

    print("== markdown に読まれてしまう字 ==")
    check(tbl.cell("_ねむい_") == "\\_ねむい\\_",
          "**下線は逃がす**（斜体にならない）")
    check(tbl.cell("a|b") == "a\\|b", "**縦棒は逃がす**（欄が割れない）")
    check(tbl.cell("ふつうの字") == "ふつうの字",
          "ふつうの字には1文字も足さない")

    print("== 公開のログ ==")
    logged = BUF.getvalue()
    for b in (body, body2):
        logged = logged.replace(b, "")
    for nm in (NAME_A, NAME_B, NAME_C, NAME_D):
        check(nm not in logged, "**名前が公開のログに出ない**")
    for t in (MINE_A1, MINE_A2, MINE_A2_SRC, MINE_B1, MINE_B2, EVENT,
              MINE_D1):
        check(t not in logged, "**候補のことばが公開のログに出ない**")
    for ch in CH.values():
        check(ch not in logged, "**チャンネルIDが公開のログに出ない**")
    for d in DOC.values():
        check(d not in logged, "**図鑑の書類IDが公開のログに出ない**")

    print("== 入れ物が空 ==")
    rc = run(apply=True, data=FakeDb({"islandStampLine": {},
                                      "islandCharacter": {}}))
    check(rc == 2, "**0人なら 2 で止まる**（読めなかったと混ぜない）")
    check(not POSTED, "0人のときは1本も貼らない")

    print(("通りました" if BAD == 0 else f"落ちました（{BAD} 件）"))
    return 1 if BAD else 0


if __name__ == "__main__":
    sys.exit(main())
