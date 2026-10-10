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

## 2026-10-10 から、見るものが3つ増えた

あやと（#716）:

> **「うん」とか出すのやめて。採用するわけない。個性がなさすぎる。**
> あと**候補が少なくてしっくりこない**。

  11. **採点表**（あやとが挙げた字が出たか）を、本文の頭に出す。
      **出なかったものは理由と、データで見つかった近い字まで出す**
  12. **門で落ちた字**を出す。「個性のない字が落ちた」は
      **候補が0本でも通る**（`docs/island-misses.md` #19）
  13. **1人1区切りで、番号を振って出す。**
      10本を横に並べると読めないし、番号が無いと返せない

そして**採点表のことばは、公開のログに1文字も出してはいけない。**
`client_payload` から来るので、**ARGS と同じ顔でログに出る道が1本できた。**

## 確かめるもの

  1. **`apply` 無しでは1本も貼らない**
  2. `apply` を付けると**貼る**（本文が渡る）
  3. ログと注記に、**名前も候補のことばも採点表のことばも1文字も出ない**
  4. **候補の出た人が先、出なかった人が後**。中は名前順（強さで並べない）。
     **名前と数の向きが逆の人を1人入れてある**——数の多い人が名前でも
     先だと、強い順に並べ替えても同じ並びになって、見分けがつかない
  5. **候補が0本の人も、行として出る**
  6. 候補は**番号つきで、回数・日数・何人が言ったかと一緒に**出る
  7. **島ぜんぶの回数も、割合の点も、本文に出さない**
  8. 同じことばが2本になっている人を**書く**
  9. **人数が足りなければ、足りないと書く**
  10. 入れ物が空なら **2 で止まる**（0人と「読めなかった」を混ぜない）
  11〜13. 上の3つ
  14. **入れ物の中身といまの式が食い違ったら、ログで言う**

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

# **注記（`::notice::`）の道も通す。** ここを立てないと、
# その1行だけ見張りを素通りする
os.environ["GITHUB_ACTIONS"] = "true"
os.environ.setdefault("BQ_PROJECT_ID", "stamp-line-table-selftest")

import stamp_line_table as tbl  # noqa: E402
from _fake_fs import FakeDb, cid  # noqa: E402

# **1文字でも公開のログに出たら落とすもの。**
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
MINE_A1 = "えがたえがた"
# **末尾に句点のある字。** 機械が落とすので、元の字と出す字が違う
MINE_A2_SRC = "ねむいよ。"
MINE_A2 = "ねむいよ"
MINE_B1 = "ほなちがうか"
MINE_B2 = "ほなちがうか！！"
# **島のみんなが言う字。** 門で落ちる。**候補の表に出たら落とす**
PLAIN = "こんばんは"
# **あやとが挙げた字（採点表）。** `client_payload` で渡す
SHEET_GOT = MINE_A1          # 候補に出る
SHEET_NONE = "そんなこと言ってない"   # データに無い

DOC = {
    "a": "a" + "0123456789abcdef" * 2,
    "b": "b" + "0123456789abcdef" * 2,
    "c": "c" + "0123456789abcdef" * 2,
    "d": "d" + "0123456789abcdef" * 2,
}
CH = {"a": cid("aa"), "b": cid("bb"), "c": cid("cc"), "d": cid("dd")}
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
    """4人ぶんの偽の Firestore。**いまの式で選び直したものと揃っている。**

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
    r = [
        (CH["a"], MINE_A1, 12, 6),
        (CH["a"], MINE_A2_SRC, 5, 4),
        # **島のみんなが言う字を、いちばん多く言っている人。**
        # 門が効いていなければ、ここが候補の1位に来る
        (CH["a"], PLAIN, 200, 60),
        (CH["b"], MINE_B1, 7, 5),
        (CH["b"], PLAIN, 20, 9),
        (CH["d"], MINE_D1, 3, 3),
    ]
    r += [(m, PLAIN, 30, 12) for m in MOB]
    return r


POSTED: list = []


def fake_post(issue, body, comment=0):
    """貼ったことにする。**本文と、貼り替え先を取っておく。**

    Args:
        issue: issue の番号
        body: 本文
        comment: 書き替えるコメントの番号（0 なら新しく貼る）

    Returns:
        偽のコメント番号
    """
    POSTED.append((issue, body, comment))
    return comment or (1000 + len(POSTED))


SHEET = [{"name": NAME_A, "lines": [SHEET_GOT]},
         {"name": NAME_B, "lines": [SHEET_NONE], "words": ["ちがうか"]},
         {"name": NAME_D, "lines": []}]


def run(apply: bool, data=None, comment=0) -> int:
    """1回動かす。

    Args:
        apply: 貼るか
        data: 偽の Firestore（省略すると4人ぶん）
        comment: 書き替えるコメントの番号

    Returns:
        終了コード
    """
    POSTED.clear()
    fake = data if data is not None else fake_db()
    tbl.db = lambda: fake
    tbl.island = lambda days: bqrows()  # noqa: ARG005
    tbl.post = fake_post
    # **採点表は `client_payload` から渡す。** ARGS に置かない
    body = {"check": SHEET}
    if apply:
        body["apply"] = True
    if comment:
        body["comment"] = comment
    fd, path = tempfile.mkstemp(suffix=".json")
    with os.fdopen(fd, "w", encoding="utf-8") as f:
        json.dump({"client_payload": body}, f)
    os.environ["GITHUB_EVENT_PATH"] = path
    os.environ["ARGS"] = "{}"
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
    issue, body, where = POSTED[0] if POSTED else (0, "", 0)
    check(where == 0, "既定では**新しく貼る**（書き替えない）")
    check(issue == 716, "既定の行き先は #716")
    check(body.endswith("_Generated by [Claude Code](https://claude.ai/code)_"),
          "末尾に手順どおりの署名が付く")

    print("== 本文の中身 ==")
    for i, nm in enumerate((NAME_A, NAME_B, NAME_C, NAME_D)):
        check(nm in body, f"名前が本文に出る（{i + 1}人目）")
    for i, t in enumerate((MINE_A1, MINE_A2, MINE_B1)):
        check(t in body, f"候補のことばが本文に出る（{i + 1}本目）")
    check("| 1 | えがたえがた | その人だけ | 12 | 6 |" in body,
          "**番号・ことば・何人が言ったか・回数・日数が1行で出る**")
    check("| 2 | ねむいよ |" in body, "**2本目には2番が付く**")
    # 並び: 候補の出た人（名前順）→ 出なかった人
    i_got = body.index("### 候補が出た人")
    i_non = body.index("### 候補が1本も出なかった人")
    check(i_got < i_non, "**候補の出た人が先、出なかった人が後**")
    # **名前は採点表にも出る。** 並びを見るときは「候補が出た人」より
    # 後ろから探す——頭から探すと、採点表に出た1件を数えてしまう
    at_a = body.index(NAME_A, i_got)
    at_b = body.index(NAME_B, i_got)
    at_d = body.index(NAME_D, i_got)
    check(i_got < at_a < i_non, "候補の出た人は、前の区切りに入る")
    check(body.index(NAME_C, i_got) > i_non,
          "**候補が0本の人も、行として出る**（後ろの表）")
    # 名前順。`NAME_A`（い）→ `NAME_B`（や）
    check(at_a < at_b, "中は名前順（**強い順ではない**）")
    check("4人" in body, "人数を書く")
    check("25人そろっていません" in body, "**足りないと書く**")
    # **名前順かどうかは、名前と数の向きが逆の人を1人入れて見る。**
    # 数の多い人が名前でも先だと、強い順に並べても同じ並びになる
    check(at_d < at_a < at_b,
          "**名前順に並んでいる**（数のいちばん小さい人が先頭）")
    # 選び方の内側（島ぜんぶの回数・割合・点）を本文に出さない
    for w in ("割合 0", "島ぜんぶで", "点が", "スコア"):
        check(w not in body, f"選び方の内側を本文に出さない（{w}）")

    print("== 採点表（あやとが挙げた字が出たか）==")
    i_sheet = body.index("### あやとが挙げた字が、出たか")
    check(i_sheet < i_got, "**採点表は候補の前に出す**（ここが合否）")
    check("2本のうち、候補に出たのは 1本" in body,
          "**何本中何本出たかを書く**")
    check(SHEET_GOT in body[i_sheet:i_got], "挙げた字が表に並ぶ")
    check("**出た**" in body[i_sheet:i_got], "出たものは「出た」と書く")
    check(SHEET_NONE in body[i_sheet:i_got], "出なかった字も並ぶ")
    check("**データに無い**" in body[i_sheet:i_got],
          "**データに無いものは「データに無い」と書く**")
    check("ちがうか" in body[i_sheet:i_got]
          and MINE_B1 in body[i_sheet:i_got],
          "**語で探したぶんも並べる**（うろ覚えのぶん）")
    check("（挙げていない）" in body[i_sheet:i_got],
          "字を挙げていない人も行として出す")
    check(f"| **短さ** | {tbl.GOOD_LEN}字までは" in body,
          "**短さの字数を手で書いていない**（式から出す）")
    check("言い方の揺れまで探したうえで" in body,
          "**探し方を書く**（探さずに「無い」と言っていない）")
    check("あやとが挙げた字は、こちらの門より強い" in body[i_sheet:i_got],
          "**門より、あやとの挙げた字のほうが強いと書く**"
          "（名セリフかどうかを決めるのはあやと）")

    print("== 門で落ちた字 ==")
    i_gate = body.index("### 門で落ちた字")
    check(PLAIN in body[i_gate:], "**門で落ちた字そのものを出す**")
    check(PLAIN not in body[i_got:i_non],
          "**門で落ちた字は、候補の区切りに出さない**")
    check("| 14人 | 200 |" in body[i_gate:],
          "落ちた字に、何人が言ったかと回数を並べる")

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
    _, body2, _w2 = POSTED[0] if POSTED else (0, "", 0)
    check(f"「{MINE_B1}」／「{MINE_B2}」" in body2,
          "**同じことばが2本になっている人を書く**")
    check("入れ物の中身と、いま選び直したものが 1 人ぶん食い違います"
          in BUF.getvalue(),
          "**入れ物が古いことを、ログで言う**")

    print("== 同じ表を貼り直す（書き替え）==")
    rc = run(apply=True, comment=424242)
    check(rc == 0, "書き替えても 0 で終わる")
    check(POSTED and POSTED[0][2] == 424242,
          "**渡したコメントを書き替える**（新しく積まない）")
    check("セリフの表: #716 に 1 コメント書き替えました" in BUF.getvalue(),
          "書き替えたと注記に出す")

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
    # **ここで確かめる字を、確かめの名前に入れない。**
    # 入れると、この見張り自身の出力に出てしまって必ず落ちる
    for i, nm in enumerate((NAME_A, NAME_B, NAME_C, NAME_D)):
        check(nm not in logged, f"**名前が公開のログに出ない**（{i + 1}人目）")
    for i, t in enumerate((MINE_A1, MINE_A2, MINE_A2_SRC, MINE_B1, MINE_B2,
                           MINE_D1, SHEET_NONE)):
        check(t not in logged,
              f"**ことばが公開のログに出ない**（{i + 1}本目）")
    for ch in CH.values():
        check(ch not in logged, "**チャンネルIDが公開のログに出ない**")
    for d in DOC.values():
        check(d not in logged, "**図鑑の書類IDが公開のログに出ない**")
    check("採点表: 2 本中 1 本が候補に出た" in logged,
          "**採点表は、本数と記号だけログに出す**")

    print("== 入れ物が空 ==")
    rc = run(apply=True, data=FakeDb({"islandStampLine": {},
                                      "islandCharacter": {}}))
    check(rc == 2, "**0人なら 2 で止まる**（読めなかったと混ぜない）")
    check(not POSTED, "0人のときは1本も貼らない")

    print(("通りました" if BAD == 0 else f"落ちました（{BAD} 件）"))
    return 1 if BAD else 0


if __name__ == "__main__":
    sys.exit(main())
