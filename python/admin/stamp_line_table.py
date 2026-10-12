"""スタンプのことばの候補を、**あやとと話すための表にして issue に貼る**（#716）。

    python python/admin/stamp_line_table.py

## なぜ、わざわざ Actions から貼るのか

**この箱（セッションの箱）から Firestore も BigQuery も引けない。**
だから中身を手元に持ってくる道が無い。持ってこられないなら、
**貼るところまでをここでやる**のが筋になる。

そのうえで、**公開の Actions ログには1文字も出さない。**
出すのは件数だけ（`notice` も同じ）。名前も候補のことばも、
行き先は **issue の本文ひとつ**で、途中のログには置かない。

あやと（2026-10-09）:

> 住人25人ぶんのセリフの件、チケットで会話しましょう。**名前やコメント出しても問題ない。**
>
> Aで進めて

名前とコメントは出してよい。**出さないのは金額・順位・それを当てられる数**
（`docs/island-money.md`）。だからこの表は:

- **並びに強さを使わない。** 候補の出た人・出なかった人の2つに分けて、
  中は名前順。**点の高い順に並べると、それがそのまま投げ銭の順位表になる**
- 出す数は**その人がその字を打った回数と日数、その字を島で何人が言ったか**まで。
  島ぜんぶの回数も、割合も、掛け算した点も出さない（選び方の内側を出すと、
  どれだけ投げたかを当てる手がかりになる）

## 2026-10-10 から、中身を作り直した

あやと（#716）:

> **「うん」とか出すのやめて。採用するわけない。個性がなさすぎる。**
> あと**候補が少なくてしっくりこない**。もっと**このセリフがその人っぽい！**ってのがあるはず

| 変えたところ | なぜ |
| --- | --- |
| **1人10本**（3本だった） | あやと「候補が少なくてしっくりこない」 |
| **1人1区切り**（1行に3本の表だった） | 10本を横に並べると読めない。番号で指して返せる形にする |
| **採点表を頭に置く** | あやとが挙げた10件が**出たか落ちたか**が合否。表の前に答えを出す |
| **門で落ちた字を出す** | 「ほかの人も言っている字が落ちた」は、**候補が0本でも通る**（`island-misses.md` #19）。落ちたほうも並べる |
| 「前の式との動き」を外した | 式を2回変えたので、**前の式の落ちた／上がったを並べても読めない。**
  いま要るのは「あやとの挙げた字が出たか」と「何が門で落ちたか」 |

## 採点表は、リポジトリに書かない

あやとが挙げた名セリフは**名前と字の組**なので、10人ぶんでも
「選ばれた25人の一部」そのものになる。git に残すと公開される
（#716 の決め）。渡すのは `repository_dispatch` の `client_payload` の
`check`（`stamp_line_suggest.payload()` が読む）。

## 何をするか

1. `islandStampLine` の書類を**ぜんぶ**読む（`channelId` の無い人も落とさない。
   **25人そろっているかを数えるのが仕事のうち**）
2. `islandCharacter`（図鑑）から**絵文字と名前**を引く
3. BigQuery から**島ぜんぶ**を引いて、回数・日数・**その字を何人が言ったか**と、
   **門で落ちた字**を作る（SQL は `stamp_line_suggest` と同じ1本）
4. 表にして、issue にコメントとして貼る

## 既定では1文字も貼らない

`{"apply": true}` を付けたときだけ貼る。下見では件数だけ出すので、
**貼る前に「25人そろったか・入れ物といまの式が食い違っていないか」を
確かめられる。**

入力:
  {}                      … 下見（**1文字も貼らない**）
  {"apply": true}         … 貼る
  {"issue": 716}          … どの issue に貼るか（既定 716）
  {"days": 365}           … さかのぼる日数（既定は全期間）
  {"check": [...]}        … 採点表（`client_payload` から）
"""

import json
import os
import sys
import urllib.error
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from _fs import args, db, log, notice  # noqa: E402
from stamp_line_suggest import (  # noqa: E402
    MAX_BYTES,
    PLAIN,
    PROJECT,
    match_sheet,
    name_of,
    payload,
    sheet_hits,
    sql_of,
)

sys.path.insert(
    0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from logsafe import mask  # noqa: E402
from stamp_line_pick import (  # noqa: E402
    GOOD_LEN,
    MANY_SPEAKERS,
    TOP,
    gated,
    norm,
    pick_all,
    shape_check,
    tally,
    texts_of,
)

# 既定の行き先。**番号は素性ではない**ので、これは ARGS に置いてよい
ISSUE = 716

# そろっているはずの人数（#716 で決めた25人）
WANT = 25

# 1コメントに入れる上限。GitHub の上限は 65,536 字だが、読む人のために
# ここで切る。**切るときは行の境で切る**（表の途中で切ると表が壊れる）
CHUNK = 40000

# 門で落ちた字を、1人あたり何本出すか
GATED = 3


def fetch_rows(client) -> list:
    """`islandStampLine` の書類をぜんぶ読んで、図鑑の絵文字と名前を足す。

    **`channelId` の無い人も、図鑑に居ない人も落とさない。**
    落とすと「25人そろっているか」が数えられなくなる。

    Args:
        client: Firestore クライアント

    Returns:
        1人1辞書（`id` `channelId` `emoji` `name` `suggested` `from`
        `lines` `nochar`）
    """
    chars = client.collection("islandCharacter")
    out = []
    for d in client.collection("islandStampLine").list_documents():
        snap = d.get()
        if not snap.exists:
            continue
        v = snap.to_dict() or {}
        ch = v.get("channelId") or ""
        ch = ch.strip() if isinstance(ch, str) else ""
        # 図鑑（＝絵と名前の正。`docs/island-db.md` 3.4）
        c = chars.document(d.id).get()
        cv = (c.to_dict() or {}) if c.exists else {}
        sug = [x for x in (v.get("suggested") or [])
               if isinstance(x, str) and x.strip()]
        src = [x for x in (v.get("suggestedFrom") or [])
               if isinstance(x, str) and x.strip()]
        # **元の字が揃っていない書類は、揃っていないまま持つ。**
        # ここで埋めると「直していない」と「元が分からない」が同じ顔になる
        out.append({
            "id": d.id,
            "channelId": ch,
            "emoji": (cv.get("emoji") or "").strip(),
            "name": name_of(cv),
            "suggested": sug,
            "from": src,
            "lines": [x for x in (v.get("lines") or [])
                      if isinstance(x, str) and x.strip()],
            "nochar": not c.exists,
        })
    return out


def island(days: int) -> list:
    """島ぜんぶの数え上げを BigQuery から引く。

    **SQL は `stamp_line_suggest` と同じ1本を使う。** 2か所に書くと、
    片方だけ直した日に「表と、置いたもの」が黙って食い違う。

    島ぜんぶを引くのは、**その字を島で何人が言っているかを出すため**。
    門が見ているのがそれなので、選ばれた人のぶんだけでは表にできない。

    Args:
        days: さかのぼる日数（0 なら全期間）

    Returns:
        `(チャンネルID, 字, 回数, 日数)` の並び
    """
    from google.cloud import bigquery  # BQ を使うときだけ要る

    bq = bigquery.Client(project=PROJECT)
    sql = sql_of(days)
    # **流す前に見積もる。** 超えたら引かずに止める
    est = bq.query(sql, job_config=bigquery.QueryJobConfig(
        dry_run=True, use_query_cache=False))
    mb = est.total_bytes_processed / (1 << 20)
    log.info("見積もり: %.1f MB（上限 %.0f MB）", mb, MAX_BYTES / (1 << 20))
    if est.total_bytes_processed > MAX_BYTES:
        log.error("上限を超えるので**引きません**。days を小さくしてください")
        sys.exit(1)
    rows = [(r["ch"], r["t"], r["n"], r["d"]) for r in bq.query(sql).result()]
    log.info("数え上げ: %d 通り（島ぜんぶ）", len(rows))
    return rows


# markdown として読まれてしまう字。**逃がさないと、その人が打った形で
# 読めなくなる**（`_ねむい_` が斜体になる、`|` で欄が割れる、
# `<b>` が消える）。GitHub は ASCII の記号を `\` で逃がせる
MD = "\\`*_[]<>&|~#"


def cell(text: str) -> str:
    """表のます1つ。**読まれ方だけ逃がす。字そのものは直さない。**

    ここで足すのは `\\` だけで、**GitHub の画面では元の字に戻る。**

    Args:
        text: 出す字

    Returns:
        表に入れてよい形
    """
    out = []
    for c in (text or ""):
        if c in MD:
            out.append("\\")
        out.append(c)
    return "".join(out)


def dup_of(row: dict) -> list:
    """1人の候補の中で、**同じことばが2本になっていないか。**

    `pick()` は言い方が重なるものを落とすが、鍵（`norm`）が同じで
    打った形だけが違うもの（「ありがとう」と「ありがとー」）は
    別のものとして残りうる。**そこは人が見て決めるので、表に書く。**

    Args:
        row: `fetch_rows()` の1件

    Returns:
        同じ鍵になった打ちかたの組の一覧（組は2本以上）
    """
    seen: dict = {}
    for t in row["suggested"]:
        seen.setdefault(norm(t), []).append(t)
    return [v for v in seen.values() if len(v) > 1]


def who_said(counts, text: str) -> str:
    """その字を**島で何人が言ったか**を、読める字にする。

    Args:
        counts: `tally()` の結果
        text: 字

    Returns:
        「その人だけ」か「◯人」。引けなければ `?`
    """
    n = counts.speakers(text)
    if not n:
        return "?"
    return "その人だけ" if n <= 1 else f"{n}人"


def one_block(r: dict, counts, top: int) -> list:
    """1人ぶんの区切り。**番号で指して返せる形にする。**

    Args:
        r: `fetch_rows()` の1件
        counts: `tally()` の結果
        top: 出す本数

    Returns:
        markdown の行の一覧
    """
    out = [f"#### {r['emoji']} {cell(r['name'] or '（名前が引けません）')}", ""]
    out.append("| | ことば | 言ったのは | 回数 | 何日 |")
    out.append("| --: | --- | :-- | --: | --: |")
    for i, t in enumerate(r["suggested"][:top]):
        said = counts.said(r["channelId"], t) if r["channelId"] else {}
        out.append(
            f"| {i + 1} | {cell(t)} | {who_said(counts, t)} | "
            f"{said.get('n', '?')} | {said.get('d', '?')} |")
    out.append("")
    return out


def gate_block(rows: list, counts, top: int = GATED) -> list:
    """**門で落ちた字**の表。

    「個性のない字が落ちている」は**候補が0本でも通る**ので、
    落ちたほうも並べる（`docs/island-misses.md` #19）。

    Args:
        rows: `fetch_rows()` の結果
        counts: `tally()` の結果
        top: 1人あたりの本数

    Returns:
        markdown の行の一覧
    """
    out = ["| 絵文字 | 名前 | 落ちたことば | 島で何人が言ったか | 回数 |",
           "| :--: | :-- | --- | :-- | --: |"]
    n = 0
    # **ここも名前順。** 入れ物の並び（＝選ばれた順）で出すと、
    # それがそのまま協力の順位表になる
    for r in sorted(rows, key=lambda r: (r["name"] or "￿", r["id"])):
        if not r["channelId"]:
            continue
        for g in gated(counts.own.get(r["channelId"], {}), counts, top):
            if g["why"] != "人数":
                continue
            out.append(
                f"| {r['emoji']} | {cell(r['name'])} | {cell(g['text'])} | "
                f"{g['people']}人 | {g['n']} |")
            n += 1
    return out if n else []


def sheet_block(hits: list) -> list:
    """**採点表**（あやとが挙げた字が出たか）の表。

    Args:
        hits: `sheet_hits()` の結果

    Returns:
        markdown の行の一覧
    """
    say = {
        "出": "**出た**",
        "外": "候補の外（10本に入らなかった）",
        "門": "**落とした**（島のほかの人も言っている）",
        "割": "**落とした**（その字の半分以上がほかの人のもの）",
        "回": "**落とした**（2人以上が言っていて、1回しか言っていない）",
        "形": "**落とした**（字の形。長すぎる・短すぎる）",
        "揺": "言い方がすこし違う字で**在る**",
        "無": "**データに無い**",
        "？": "名前が入れ物に当たらない",
        "空": "あやとが字を挙げていない",
    }
    out = ["| 人 | あやとが挙げた字 | どうなったか | データで見つかったもの |",
           "| :-- | --- | :-- | --- |"]
    for h in hits:
        found = []
        for x in h["near"][:3] + h["words"][:3]:
            # **何人が言ったかまで出す。** 「門で落とした」と言うだけでは、
            # あやとに「どれくらいみんなが言っているのか」が分からない
            said = (f"「{cell(x['text'])}」{x['n']}回・"
                    + ("その人だけ" if (x.get("people") or 0) <= 1
                       else f"島で{x['people']}人"))
            if x.get("how") and x["how"] != "同じ":
                said += f"（{x['how']}）"
            if x.get("no"):
                said += f" ← **候補の{x['no']}番**"
            found.append(said)
        if h["how"] == "空":
            # **字を挙げていない人には、候補の本数を出す。**
            # ここに「1本も無い」と出すと、候補が無いように読める。
            # **語で探したぶんが在れば、そちらを先に出す**——
            # うろ覚えで挙げてもらったぶんは、ここにしか出てこない
            found.append(f"候補は {len(h['got'])}本あります" if h["got"]
                         else "候補も1本も出ていません")
        # **探したのに1本も無かった語は、語の名前ごと書く。**
        # 書かないと「探していない」と同じに読める（あやと「データに
        # 無いものは、はっきり書く」）
        if h.get("miss"):
            found.append(
                "／".join(f"「{cell(w)}」" for w in h["miss"])
                + "で探しましたが、**チャットには1本もありません**")
        if not found and h["how"] == "出":
            found = ["—"]
        out.append(
            f"| {cell(h['name'])} | {cell(h['line']) or '（挙げていない）'} | "
            f"{say.get(h['how'], h['how'])} | "
            + ("／".join(found) if found else "**1本も無い**") + " |")
    return out


def fixed_of(rows: list) -> list:
    """**元の字と、出す字が違うもの。**

    Args:
        rows: `fetch_rows()` の結果

    Returns:
        `[(行, 元の字, 出す字)]`
    """
    out = []
    for r in rows:
        for i, t in enumerate(r["suggested"]):
            src = r["from"][i] if i < len(r["from"]) else ""
            if src and src != t:
                out.append((r, src, t))
    return out


def body_of(rows: list, counts, hits: list, top: int) -> str:
    """貼る本文。

    Args:
        rows: `fetch_rows()` の結果
        counts: `tally()` の結果
        hits: `sheet_hits()` の結果
        top: 候補の本数

    Returns:
        markdown
    """
    got = sorted([r for r in rows if r["suggested"]],
                 key=lambda r: (r["name"] or "￿", r["id"]))
    non = sorted([r for r in rows if not r["suggested"]],
                 key=lambda r: (r["name"] or "￿", r["id"]))
    dups = [(r, d) for r, d in ((r, dup_of(r)) for r in rows) if d]
    decided = [r for r in rows if r["lines"]]
    fixed = fixed_of(rows)
    named = [h for h in hits if h["line"]]
    plain_left = [t for r in rows for t in r["suggested"]
                  if norm(t) in {norm(p) for p in PLAIN}]

    p = []
    p.append("## 住人25人ぶんの**名セリフ**候補（作り直しました）")
    p.append("")
    p.append("あやと（2026-10-10）:")
    p.append("")
    p.append("> **「うん」とか出すのやめて。採用するわけない。"
             "個性がなさすぎる。**")
    p.append("> あと**候補が少なくてしっくりこない**。"
             "もっと**このセリフがその人っぽい！**ってのがあるはず")
    p.append("")
    p.append("**前の表は消していません。** 上のコメントと並べて読めます。")
    p.append("")
    p.append("### どこを外していたか")
    p.append("")
    p.append("前の晩に「日常で使える言葉を優先」と言われて、"
             "**日常度（何日にわたって言ったか）を主軸にしました。**"
             "それが行きすぎです。")
    p.append("")
    p.append("**毎日使う言葉は、誰でも使います。** だから日数で並べると、"
             "いちばん個性のない字が上に来る——「うん」が 92日、"
             "「うんうん」が 87日。らしさは √ で**弱めて**あったので、"
             "日数の差で簡単に負けていました。")
    p.append("")
    p.append("**狙いは「日常で使える」ではなく「名セリフ」。** 軸を入れ替えました。")
    p.append("")
    p.append("### 選び方——**門が1つ、式が1本**")
    p.append("")
    p.append("```")
    p.append(f"門: 島で {MANY_SPEAKERS}人以上が言っている字は、"
             "その人の名セリフではない")
    p.append("点 = らしさ² × ∛回数 × 短さ")
    p.append("```")
    p.append("")
    p.append("| | 何を見ているか | なぜ |")
    p.append("| --- | --- | --- |")
    p.append("| **門** | その字を、**島で何人が言ったか** | "
             "ここが「個性のない字」を落とす唯一の関所。"
             "**重みではなく門**にしたのは、重みだと回数の多さで"
             "押し返されるから（「うん」は 296回ある） |")
    p.append("| **らしさ** | その字のうち、その人が言った割合 | "
             "**2乗で効かせます。** 前は √ で弱めていた——そこが外した場所 |")
    p.append("| **回数** | 何回言ったか | **3乗根。** 効かせるが殴らせない。"
             "回数で殴ると、**回数の少ない名セリフがいちばん先に落ちる** |")
    # **字数を手で書かない。** 式のほうを直した日に、ここが黙って嘘になる
    p.append(f"| **短さ** | {GOOD_LEN}字までは下駄なし、長いほど薄く | "
             "スタンプの1枚に乗るのは短い字。ただし薄めかたを弱めました——"
             "**長い名セリフを殺さないため** |")
    p.append("| 日数 | 何日にわたって言ったか | "
             "**点に入れていません。同点のときの並べ替えだけ** |")
    p.append("")
    p.append("**語の表（禁止ワード）は作っていません。** "
             "落とすのは「何人が言ったか」という数だけで、語の中身は"
             "1文字も見ていません。「うん」「はい」「こんばんは」"
             "「ありがとう」は、名指しではなく**人数で**落ちています。")
    p.append("")
    p.append("**島でその人しか言っていない字は、1回でも候補にします。** "
             "「まめまめキューン」のような名セリフは回数が少ないので、"
             "回数で門を作ると**狙っているものから先に落ちます**。")
    p.append("")

    # ---- 採点表（**ここが合否**）
    p.append("### あやとが挙げた字が、出たか")
    p.append("")
    if named:
        p.append(f"**{len(named)}本のうち、候補に出たのは "
                 f"{sum(1 for h in named if h['how'] == '出')}本**です。")
        p.append("")
    p += sheet_block(hits)
    p.append("")
    p.append("**あやとが挙げた字は、こちらの門より強いです。** "
             "「落とした」と書いてあっても、**「それでいく」と書いてもらえれば"
             "そのまま入れます**——門は機械が「島のみんなの字だ」と"
             "数えただけで、その人の名セリフかどうかを決めるのは"
             "あやとのほうです。")
    p.append("")
    p.append("**「データに無い」は、言い方の揺れまで探したうえで言っています**"
             "（「ばあい」「ばぁい」「ばーい」、「コンバンワ」「コン バンワ」を"
             "同じものとして探しました）。**配信中の声で言っていて、"
             "チャットには打たれていない字**は、ここには出てきません。")
    p.append("")

    p.append(f"| | |\n| --- | ---: |\n| 入れ物に入っている | **{len(rows)}人** |"
             f"\n| 候補が出た | **{len(got)}人** |"
             f"\n| 候補が1本も出なかった | **{len(non)}人** |"
             f"\n| 1人あたりの候補 | **最大 {top}本**（前は3本） |")
    if len(rows) != WANT:
        p.append("")
        p.append(f"> **{WANT}人そろっていません**（{len(rows)}人）。"
                 "`stamp_line_seed` を流し直す必要があります。")
    p.append("")
    p.append("**並びは名前順です。強い順ではありません**"
             "（点の高い順に並べると、それがそのまま協力の順位表になるので）。")
    p.append("")
    p.append("### 候補が出た人")
    p.append("")
    p.append("**番号で指して返してください**"
             "（「3番でいく」「1番をこう言い換えて」「この人は外す」）。")
    p.append("")
    for r in got:
        p += one_block(r, counts, top)
    p.append("「言ったのは」は**その字を島で何人が言ったか**、"
             "「回数」「何日」は**その人がその字を打った回数と日数**です。")
    p.append("")
    p.append("**候補はぜんぶ、島のだれかが1行まるごとそう打った字です。** "
             "こちらで作った字も、切れ端も1本もありません"
             "（長い行を縮めて使える長さにする、ということはしていません）。")
    p.append("")
    p.append("**回数が 1 の行は、その人が1度だけ言ったことばです。** "
             "くり返して言っていることばが見つからなかった人ほど、"
             "そういう行が下に並びます——**そこはあやとの知っていることのほうが"
             "早い**と思います（思いつくことばをそのまま書いてもらえれば入れます）。")
    p.append("")
    p.append("### 候補が1本も出なかった人")
    p.append("")
    p.append("チャットが少ない人ではなく、**そのまま出せる字が無い人**です"
             "（毎回ちがうことを言う人、島のみんなと同じ字しか打っていない人）。"
             "機械では拾えないので、**ここはあやとの知っていることのほうが早い**"
             "と思います。")
    p.append("")
    if non:
        p.append("| 絵文字 | 名前 |")
        p.append("| :--: | :-- |")
        for r in non:
            p.append(f"| {r['emoji']} | "
                     f"{cell(r['name'] or '（名前が引けません）')} |")
    else:
        p.append("**1人もいません。** 25人ぜんぶに候補が出ました。")
    p.append("")

    # ---- 門で落ちた字
    p.append("### 門で落ちた字（島のほかの人も言っている字）")
    p.append("")
    p.append("**前の表に出ていた字が、ここに落ちています。** "
             "落ちたものを出さないと、「個性のない字が落ちた」は"
             "**候補が0本でも通ってしまいます**。")
    p.append("")
    block = gate_block(rows, counts)
    if block:
        p += block
    else:
        p.append("**1本もありません。**")
    p.append("")
    if plain_left:
        p.append(f"> **個性のない字が {len(plain_left)}本、候補に残っています。** "
                 "門のしきいが緩いので、下げます。")
        p.append("")

    # ---- 手を入れた字
    p.append("### 手を入れた字")
    p.append("")
    if fixed:
        p.append("| 絵文字 | 名前 | 元の字 | 出す字 |")
        p.append("| :--: | :-- | --- | --- |")
        for r, src, t in sorted(fixed, key=lambda f: (f[0]["name"] or "￿",
                                                      f[0]["id"], f[2])):
            p.append(f"| {r['emoji']} | {cell(r['name'])} | "
                     f"{cell(src)} | {cell(t)} |")
        p.append("")
        p.append("**ここに無いものは、1文字も直していません。** "
                 "機械が触ってよいのは末尾の句読点だけです。")
    else:
        p.append("**1本もありません。** 候補はぜんぶ、"
                 "その人が打った形のままです。")
    p.append("")

    if dups:
        p.append("### 同じことばが2本になっている人")
        p.append("")
        for r, d in dups:
            # **組ごとに並べる。** どれとどれが同じことばなのかが要る。
            # 囲いに `` ` `` を使わない——ことばの中に `` ` `` が
            # 入っていたら囲いが割れる
            p.append(f"- {r['emoji']} {cell(r['name'])} — "
                     + " / ".join("／".join(f"「{cell(x)}」" for x in g)
                                  for g in d))
        p.append("")
        p.append("**どちらかを別のことばに替えます。** 入れ替えたい字があれば"
                 "そう書いてください。")
        p.append("")
    else:
        p.append("1人の中で**同じことばが2本になっているところは、ありません**。")
        p.append("")
    if decided:
        p.append(f"### 本人がもう決めた人（{len(decided)}人）")
        p.append("")
        p.append("| 絵文字 | 名前 | 本人が決めたことば |")
        p.append("| :--: | :-- | --- |")
        for r in sorted(decided, key=lambda r: (r["name"] or "￿", r["id"])):
            p.append(f"| {r['emoji']} | {cell(r['name'])} | "
                     + "／".join(f"「{cell(x)}」" for x in r["lines"]) + " |")
        p.append("")
        p.append("**こちらは本人の字なので、こちらからは触りません。**")
        p.append("")
    p.append("### 返しかた")
    p.append("")
    p.append("人ごとに、**何番でいくか／この言い方にしてほしいか／"
             "この人は外すか**を書いてください。"
             "絵文字か名前で指してもらえれば引けます。")
    p.append("")
    # **0人のときに「0人と、」と書かない。** 0 を人数の言い方に流し込むと、
    # 数は合っているのに読めない字になる（`island-standards` §16 と同じ形）
    who_left = (f"**候補が0本の{len(non)}人**と、" if non else "")
    p.append(f"{who_left}**上の採点表で「データに無い」「言い方がすこし違う」"
             "になったぶん**は、あやとの思いつくことばをそのまま"
             "書いてもらえれば入れます（1本20字まで・4本まで）。")
    p.append("")
    p.append("なお、**本人も `/me` から自分で書き替えられます**"
             "（決めたことばはこちらからは触りません）。"
             "ここで決めたものは提案として入れ直すので、"
             "**本人が気に入らなければ本人の字が勝ちます**。")
    return "\n".join(p)


def chunks(text: str, limit: int = CHUNK) -> list:
    """長すぎるときに**行の境で**切り分ける。

    Args:
        text: 本文
        limit: 1コメントの上限

    Returns:
        本文の一覧（1つなら切らない）
    """
    if len(text) <= limit:
        return [text]
    out, cur = [], []
    n = 0
    for line in text.split("\n"):
        if n + len(line) + 1 > limit and cur:
            out.append("\n".join(cur))
            cur, n = [], 0
        cur.append(line)
        n += len(line) + 1
    if cur:
        out.append("\n".join(cur))
    return out


def post(issue: int, body: str, comment: int = 0) -> int:
    """issue にコメントを貼る（`comment` を渡すと**そのコメントを書き替える**）。

    **ここが唯一、名前とことばが外へ出る口。** 貼ったものは公開の
    issue に出るが、ログには1文字も出さない（出すのは字数だけ）。

    **書き替えの道があるのは、同じ表を貼り直すことがあるから。**
    選び方を直して流し直すたびに新しいコメントが積まれると、
    **あやとがどれを読めばいいのか分からなくなる**（古い表は残すが、
    それは「別の選び方で出した表」であって、同じ選び方の貼り直しとは違う）。

    Args:
        issue: issue の番号
        body: 本文
        comment: 書き替えるコメントの番号（0 なら新しく貼る）

    Returns:
        コメントの番号（落ちたら 0）
    """
    token = os.getenv("GH_TOKEN") or os.getenv("GITHUB_TOKEN") or ""
    repo = os.getenv("GITHUB_REPOSITORY") or "Ayato-kosaka/live-streaming"
    if not token:
        log.error("GH_TOKEN がありません。貼れません")
        return 0
    where = (f"https://api.github.com/repos/{repo}/issues/comments/{comment}"
             if comment else
             f"https://api.github.com/repos/{repo}/issues/{issue}/comments")
    req = urllib.request.Request(
        where,
        data=json.dumps({"body": body}).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {token}",
            "Accept": "application/vnd.github+json",
            "Content-Type": "application/json",
            "User-Agent": "stamp-line-table",
        },
        method="PATCH" if comment else "POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as res:
            got = json.loads(res.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        # **返ってきた本文は出さない。** こちらが送った字が映って返る
        log.error("貼れませんでした: HTTP %s", e.code)
        return 0
    except OSError as e:
        log.error("貼れませんでした: %s", type(e).__name__)
        return 0
    return int(got.get("id") or 0)


# 貼るときに末尾へ付けるもの（手順で決まっている）
SIGN = "\n\n---\n_Generated by [Claude Code](https://claude.ai/code)_"


def main() -> int:
    """エントリポイント。

    Returns:
        0=通った / 2=相手が1人もいない / 3=貼れなかった
    """
    a = payload()
    apply = bool(a.get("apply"))
    issue = int(a.get("issue") or ISSUE)
    # **貼り替え先。** 同じ選び方の表を貼り直すときだけ渡す
    comment = int(a.get("comment") or 0)
    days = int(a.get("days") or 0)
    top = int(a.get("top") or TOP)

    rows = fetch_rows(db())
    if not rows:
        # **0人と「読めなかった」を同じ顔で返さない**（island-standards 10）
        log.error("`islandStampLine` が空です。先に stamp_line_seed を流してください")
        return 2
    nochar = [r for r in rows if r["nochar"]]
    nochan = [r for r in rows if not r["channelId"]]
    noname = [r for r in rows if not r["name"]]
    log.info("入れ物: %d 人（そろっているべき %d 人）", len(rows), WANT)
    if len(rows) != WANT:
        log.warning("**%d 人そろっていません**（%d 人）", WANT, len(rows))
    if nochar:
        log.warning("図鑑に居ない %d 人（指紋: %s）", len(nochar),
                    " ".join(mask(r["id"], public=True) for r in nochar))
    if nochan:
        log.warning("channelId の無い %d 人（**回数が出せません**）", len(nochan))
    if noname:
        log.warning("名前が引けない %d 人", len(noname))

    bqrows = island(days)
    if not bqrows:
        log.error("コメントが1件も引けませんでした")
        return 2
    chans = [r["channelId"] for r in rows if r["channelId"]]
    counts = tally(bqrows, who=chans)
    now = pick_all(bqrows, chans, top=top, counts=counts)
    sheet = match_sheet(shape_check(a.get("check")),
                        [{"name": r["name"], "channelId": r["channelId"],
                          "id": r["id"]} for r in rows])
    hits = sheet_hits(sheet, counts, now)

    got = [r for r in rows if r["suggested"]]
    non = [r for r in rows if not r["suggested"]]
    dups = [r for r in rows if dup_of(r)]
    fixed = fixed_of(rows)
    named = [h for h in hits if h["line"]]
    # **回数が引けなかった候補を、黙って通さない。** 表では `?` になる
    unknown = sum(1 for r in got for t in r["suggested"][:top]
                  if not (counts.said(r["channelId"], t) if r["channelId"]
                          else {}))
    # **入れ物の中身と、いま選び直したものが揃っているか。**
    # 揃っていなければ、`stamp_line_suggest` を流し直す前に貼ろうとしている
    stale = sum(1 for r in rows if r["channelId"]
                and r["suggested"][:top] != texts_of(now.get(r["channelId"],
                                                             []))[:top])
    # **個性のない字が、置いてあるものに残っていないか**（対照。判定に使わない）
    plain_left = sum(1 for r in rows for t in r["suggested"]
                     if norm(t) in {norm(x) for x in PLAIN})
    # 門で落ちた字の本数
    down = sum(1 for r in rows if r["channelId"]
               for g in gated(counts.own.get(r["channelId"], {}), counts,
                              GATED) if g["why"] == "人数")
    log.info("候補が出た %d 人 / 1本も出なかった %d 人 / "
             "同じことばが2本の人 %d 人 / 回数が引けなかった候補 %d 本",
             len(got), len(non), len(dups), unknown)
    log.info("採点表: %d 本中 %d 本が候補に出た（内訳 %s）",
             len(named), sum(1 for h in named if h["how"] == "出"),
             " ".join(f"{i + 1}:{h['how']}" for i, h in enumerate(hits)))
    log.info("門で落ちた字: %d 本 / 個性のない字が候補に残った本数: %d 本",
             down, plain_left)
    log.info("手を入れた字 %d 本", len(fixed))
    if plain_left:
        log.warning("**個性のない字が %d 本残っています。** "
                    "門のしきいを下げてください", plain_left)
    if stale:
        log.warning(
            "**入れ物の中身と、いま選び直したものが %d 人ぶん食い違います。** "
            "先に stamp_line_suggest を apply で流してください", stale)

    body = body_of(rows, counts, hits, top)
    parts = chunks(body)
    log.info("本文: %d 字 / %d コメント", len(body), len(parts))
    # **名前が引けない人数も注記に出す。** ログは置き場から配られて
    # 口からは読めないので、下見で確かめられるのは注記だけ
    notice(f"セリフの表{'（下見）' if not apply else ''}: "
           f"{len(rows)}人 / 候補あり {len(got)}人 / 候補なし {len(non)}人 / "
           f"重複 {len(dups)}人 / 回数不明 {unknown}本 / "
           f"名前が引けない {len(noname)}人 / 図鑑に居ない {len(nochar)}人 / "
           f"採点表 {sum(1 for h in named if h['how'] == '出')}/{len(named)} / "
           f"門で落ちた {down}本 / 個性のない字 {plain_left}本 / "
           f"手を入れた {len(fixed)}本 / "
           f"入れ物と食い違い {stale}人 / {len(parts)}コメント")

    if not apply:
        log.info("下見なので**1文字も貼っていません**。"
                 '貼るには {"apply": true} を付けてください')
        return 0

    if comment and len(parts) > 1:
        # **切り分けたものを1つのコメントに書き替えられない。**
        # 黙って1本目だけ書き替えると、残りが消える
        log.error("本文が %d つに分かれるので、書き替えられません", len(parts))
        return 3
    ids = []
    for i, part in enumerate(parts):
        tail = SIGN if i == len(parts) - 1 else ""
        head = "" if len(parts) == 1 else f"（{i + 1}/{len(parts)}）\n\n"
        cid = post(issue, head + part + tail, comment)
        if not cid:
            log.error("%d 本目が貼れませんでした。%d 本は貼れています",
                      i + 1, len(ids))
            return 3
        ids.append(cid)
    how = "書き替えました" if comment else "貼りました"
    log.info("%s: #%d に %d コメント", how, issue, len(ids))
    notice(f"セリフの表: #{issue} に {len(ids)} コメント{how}")
    return 0


# **自己点検から読み込まれたときは走らない。**
if __name__ == "__main__":
    sys.exit(main())
