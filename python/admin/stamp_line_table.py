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
- 出す数は**その人がその字を打った回数と日数**まで。島ぜんぶで言われた
  回数も、割合も、掛け算した点も出さない（選び方の内側を出すと、どれだけ
  投げたかを当てる手がかりになる）

## 2026-10-09 から、3つ増えた

あやと:

> LINEスタンプとして、**日常で使える言葉を優先的に選別**してね
>
> その人いいそう！！！ってならば良いから少しアレンジしてもいいよ。

1. **「何日にわたって言ったか」を欄に出す。** いまいちばん強い軸なので、
   あやとが見て直せる形にする
2. **「前の式との動き」を出す。** 落ちた字・上がった字・前と変わらなかった人数。
   **式を変えたと言うだけでは、どの字がどう動いたか分からない**
3. **元の字と、出す字の両方を出す。** 機械が触るのは末尾の句読点だけだが、
   人が手を入れたぶんもここに並ぶ。**並んでいないものは1文字も直していない**

**前の式は手で写さない。** `stamp_line_pick.score_before()` で引き直す。
写すと、写し間違いが起きても赤くならない。

## 何をするか

1. `islandStampLine` の書類を**ぜんぶ**読む（`channelId` の無い人も落とさない。
   **25人そろっているかを数えるのが仕事のうち**）
2. `islandCharacter`（図鑑）から**絵文字と名前**を引く
3. BigQuery から**島ぜんぶ**を引いて、回数・日数と、
   **前の式／いまの式の選び直し**を作る（SQL は `stamp_line_suggest` と同じ1本）
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
"""

import json
import os
import sys
import urllib.error
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from _fs import args, db, log, notice  # noqa: E402
from stamp_line_suggest import MAX_BYTES, PROJECT, sql_of  # noqa: E402

sys.path.insert(
    0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from logsafe import mask  # noqa: E402
from stamp_line_pick import norm, pick_all, tally, texts_of  # noqa: E402

# 既定の行き先。**番号は素性ではない**ので、これは ARGS に置いてよい
ISSUE = 716

# そろっているはずの人数（#716 で決めた25人）
WANT = 25

# 1コメントに入れる上限。GitHub の上限は 65,536 字だが、読む人のために
# ここで切る。**切るときは行の境で切る**（表の途中で切ると表が壊れる）
CHUNK = 40000


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
        # **呼び名は `aliases` が先。** `characters_migrate` が
        # `@` 付きのハンドルだけを `channelName` に入れたので、
        # あちらを先に見ると**名前のかわりに `@…` が並ぶ**
        # （`python/admin/characters_why.py` 53行目と同じ読み）
        name = ""
        for a in (cv.get("aliases") or []):
            if isinstance(a, str) and a.strip():
                name = a.strip()
                break
        if not name:
            name = (cv.get("channelName") or "").strip()
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
            "name": name,
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

    島ぜんぶを引くのは、**らしさ（割合）を出すため**。割合は
    issue にも出さないが、**前の式といまの式で選び直す**のに要る。

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

    `pick()` は出す字が同じものを落とすが、鍵（`norm`）が同じで
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


def said_of(own: dict, row: dict, text: str) -> tuple:
    """その人がその字を**何回・何日**打ったか。

    Args:
        own: `tally()` の1つめ
        row: `fetch_rows()` の1件
        text: 候補の字

    Returns:
        `(回数, 日数)`。引けなければ `(None, None)`
    """
    slot = (own.get(row["channelId"]) or {}).get(norm(text))
    if not slot:
        return (None, None)
    return (slot["n"], slot.get("d"))


def table_of(rows: list, own: dict, top: int) -> list:
    """表の行を作る。**強さで並べない。**

    Args:
        rows: `fetch_rows()` の結果（並べ替えずみ）
        own: `tally()` の1つめ
        top: 候補の欄の数

    Returns:
        markdown の行の一覧
    """
    head = ["絵文字", "名前"] + [f"候補{i + 1}" for i in range(top)]
    head += ["何日にわたって", "何回言ったか"]
    out = ["| " + " | ".join(head) + " |",
           "| " + " | ".join([":--:", ":--"] + ["---"] * top
                             + ["--:", "--:"]) + " |"]
    for r in rows:
        cands = r["suggested"][:top]
        cols = [r["emoji"] or "", cell(r["name"] or "（名前が引けません）")]
        cols += [cell(t) for t in cands] + [""] * (top - len(cands))
        said = [said_of(own, r, t) for t in cands]
        # **候補と同じ並びで。** 引けなかったものは `?`
        cols.append(" / ".join("?" if d is None else str(d)
                               for _, d in said))
        cols.append(" / ".join("?" if n is None else str(n)
                               for n, _ in said))
        out.append("| " + " | ".join(cols) + " |")
    return out


def moved(before: dict, now: dict, rows: list) -> tuple:
    """**前の式といまの式で、どの字がどう動いたか。**

    **突き合わせるのは鍵（`norm`）で、字そのものではない。** 字で比べると、
    末尾の句点を落としただけのものが「1本落ちて1本上がった」に化けて、
    動きの一覧が**直した字で埋まる**（本当に動いた字が埋もれる）。

    Args:
        before: 前の式で選び直したもの `{ch: [候補]}`
        now: いまの式で選び直したもの
        rows: `fetch_rows()` の結果

    Returns:
        (落ちた `[(行, 候補)]`, 上がった `[(行, 候補)]`, 変わらなかった人数)
    """
    down, up, same = [], [], 0
    for r in rows:
        ch = r["channelId"]
        if not ch:
            continue
        was = {norm(c["text"]): c for c in before.get(ch, [])}
        got = {norm(c["text"]): c for c in now.get(ch, [])}
        if not was and not got:
            continue
        if set(was) == set(got):
            same += 1
            continue
        for t, c in was.items():
            if t not in got:
                down.append((r, c))
        for t, c in got.items():
            if t not in was:
                up.append((r, c))
    return down, up, same


def move_table(pairs: list) -> list:
    """落ちた・上がった字の表。

    Args:
        pairs: `[(行, 候補)]`

    Returns:
        markdown の行の一覧
    """
    out = ["| 絵文字 | 名前 | ことば | 何日にわたって | 何回言ったか | 字数 |",
           "| :--: | :-- | --- | --: | --: | --: |"]
    for r, c in sorted(pairs, key=lambda p: (p[0]["name"] or "￿",
                                             p[0]["id"], p[1]["text"])):
        out.append(
            f"| {r['emoji']} | {cell(r['name'])} | {cell(c['text'])} | "
            f"{c.get('d', '?')} | {c.get('n', '?')} | {len(c['text'])} |")
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


def body_of(rows: list, own: dict, before: dict, now: dict, top: int) -> str:
    """貼る本文。

    Args:
        rows: `fetch_rows()` の結果
        own: `tally()` の1つめ
        before: 前の式で選び直したもの
        now: いまの式で選び直したもの
        top: 候補の欄の数

    Returns:
        markdown
    """
    got = sorted([r for r in rows if r["suggested"]],
                 key=lambda r: (r["name"] or "￿", r["id"]))
    non = sorted([r for r in rows if not r["suggested"]],
                 key=lambda r: (r["name"] or "￿", r["id"]))
    dups = [(r, d) for r, d in ((r, dup_of(r)) for r in rows) if d]
    decided = [r for r in rows if r["lines"]]
    down, up, same = moved(before, now, rows)
    fixed = fixed_of(rows)

    p = []
    p.append("## 住人25人ぶんのセリフ候補（**日常で使えるかで選び直しました**）")
    p.append("")
    p.append("あやと（2026-10-09）:")
    p.append("")
    p.append("> LINEスタンプとして、**日常で使える言葉を優先的に選別**してね")
    p.append("")
    p.append("**前の表は消していません。** 上のコメントと並べて読めます。")
    p.append("")
    p.append("### 選び方")
    p.append("")
    p.append("**語の表（禁止ワード）は作っていません。** "
             "表を作ると、表の外でまた同じことが起きるので、"
             "データから出せる3つの掛け算にしました。")
    p.append("")
    p.append("```")
    p.append("点 = 何日にわたって言ったか × √その人らしさ × 短さ")
    p.append("```")
    p.append("")
    p.append("| | 何を見ているか | なぜ |")
    p.append("| --- | --- | --- |")
    p.append("| **日数** | 何日にわたって言ったか | **ここがいちばん強い。** "
             "毎日のように使う言葉はたくさんの日に散り、"
             "その場かぎりの実況は1日に固まる |")
    p.append("| **らしさ** | その人のことばか、みんなのことばか | "
             "前からある軸。**√ で弱めました**——"
             "珍しすぎる字は「その人らしい」けれど、本人も毎日は使わない |")
    p.append("| **短さ** | 8字までは下駄なし、長いほど薄く | "
             "LINE の1枚に乗るのは短い字。**20字は上限であって狙いではない** |")
    p.append("")
    p.append("**回数は点に入れていません。** 1日に20回より、"
             "20日に1回ずつのほうが口ぐせなので。")
    p.append("**1日で終わっている字は、候補から外しました**"
             "（2回言っていても、同じ日ならその日の出来事）。")
    p.append("")
    p.append(f"| | |\n| --- | ---: |\n| 入れ物に入っている | **{len(rows)}人** |"
             f"\n| 候補が出た | **{len(got)}人** |"
             f"\n| 候補が1本も出なかった | **{len(non)}人** |"
             f"\n| **前と候補が変わらなかった** | **{same}人** |")
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
    p += table_of(got, own, top)
    p.append("")
    p.append("「何日にわたって」と「何回言ったか」は、"
             "**その人がその字を打った日数と回数**です（候補と同じ並び）。")
    p.append("")
    p.append("### 候補が1本も出なかった人")
    p.append("")
    p.append("チャットが少ない人ではなく、**毎日のように言うことばが無い人**"
             "です（毎回ちがうことを言う人、その日のことだけを言う人）。"
             "機械では拾えないので、**ここはあやとの知っていることのほうが早い**"
             "と思います。")
    p.append("")
    p += table_of(non, own, top)
    p.append("")

    # ---- 前の式との動き
    p.append("### 前の式との動き")
    p.append("")
    p.append(f"**前と候補が1本も変わらなかったのは {same}人**です"
             "（全員入れ替わったなら、らしさを捨てています）。")
    p.append("")
    if down:
        p.append(f"#### 落ちた字（{len(down)}本）")
        p.append("")
        p += move_table(down)
        p.append("")
    else:
        p.append("**落ちた字はありません。**")
        p.append("")
    if up:
        p.append(f"#### 上がった字（{len(up)}本）")
        p.append("")
        p += move_table(up)
        p.append("")
    else:
        p.append("**上がった字はありません。**")
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
        p.append("**ここに無いものは、1文字も直していません。**")
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
    p.append("行ごとに、**このままでいい／この言い方にしてほしい／この人は外す**"
             "を書いてください。絵文字か名前で指してもらえれば引けます。")
    p.append("")
    p.append(f"**候補が0本の{len(non)}人**は、あやとの思いつくことばを"
             "そのまま書いてもらえれば入れます（1本20字まで・4本まで）。")
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


def post(issue: int, body: str) -> int:
    """issue にコメントを貼る。

    **ここが唯一、名前とことばが外へ出る口。** 貼ったものは公開の
    issue に出るが、ログには1文字も出さない（出すのは字数だけ）。

    Args:
        issue: issue の番号
        body: 本文

    Returns:
        コメントの番号（落ちたら 0）
    """
    token = os.getenv("GH_TOKEN") or os.getenv("GITHUB_TOKEN") or ""
    repo = os.getenv("GITHUB_REPOSITORY") or "Ayato-kosaka/live-streaming"
    if not token:
        log.error("GH_TOKEN がありません。貼れません")
        return 0
    req = urllib.request.Request(
        f"https://api.github.com/repos/{repo}/issues/{issue}/comments",
        data=json.dumps({"body": body}).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {token}",
            "Accept": "application/vnd.github+json",
            "Content-Type": "application/json",
            "User-Agent": "stamp-line-table",
        },
        method="POST",
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
    a = args()
    apply = bool(a.get("apply"))
    issue = int(a.get("issue") or ISSUE)
    days = int(a.get("days") or 0)
    top = int(a.get("top") or 3)

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
    own, _ = tally(bqrows)
    chans = [r["channelId"] for r in rows if r["channelId"]]
    now = pick_all(bqrows, chans, top=top)
    before = pick_all(bqrows, chans, top=top, before=True)

    got = [r for r in rows if r["suggested"]]
    non = [r for r in rows if not r["suggested"]]
    dups = [r for r in rows if dup_of(r)]
    down, up, same = moved(before, now, rows)
    fixed = fixed_of(rows)
    # **回数が引けなかった候補を、黙って通さない。** 表では `?` になる
    unknown = sum(1 for r in got for t in r["suggested"][:top]
                  if said_of(own, r, t)[0] is None)
    # **入れ物の中身と、いま選び直したものが揃っているか。**
    # 揃っていなければ、`stamp_line_suggest` を流し直す前に貼ろうとしている
    stale = sum(1 for r in rows if r["channelId"]
                and r["suggested"][:top] != texts_of(now.get(r["channelId"],
                                                             []))[:top])
    # 元の字が入っていない書類（古い流し方で置いたもの）
    nosrc = sum(1 for r in rows if r["suggested"] and not r["from"])
    log.info("候補が出た %d 人 / 1本も出なかった %d 人 / "
             "同じことばが2本の人 %d 人 / 回数が引けなかった候補 %d 本",
             len(got), len(non), len(dups), unknown)
    log.info("前の式との動き: 落ちた %d 本 / 上がった %d 本 / "
             "変わらなかった %d 人", len(down), len(up), same)
    log.info("手を入れた字 %d 本 / 元の字が入っていない書類 %d 件",
             len(fixed), nosrc)
    if stale:
        log.warning(
            "**入れ物の中身と、いま選び直したものが %d 人ぶん食い違います。** "
            "先に stamp_line_suggest を apply で流してください", stale)

    body = body_of(rows, own, before, now, top)
    parts = chunks(body)
    log.info("本文: %d 字 / %d コメント", len(body), len(parts))
    # **名前が引けない人数も注記に出す。** ログは置き場から配られて
    # 口からは読めないので、下見で確かめられるのは注記だけ
    notice(f"セリフの表{'（下見）' if not apply else ''}: "
           f"{len(rows)}人 / 候補あり {len(got)}人 / 候補なし {len(non)}人 / "
           f"重複 {len(dups)}人 / 回数不明 {unknown}本 / "
           f"名前が引けない {len(noname)}人 / 図鑑に居ない {len(nochar)}人 / "
           f"落ちた {len(down)}本 / 上がった {len(up)}本 / "
           f"変わらず {same}人 / 手を入れた {len(fixed)}本 / "
           f"入れ物と食い違い {stale}人 / {len(parts)}コメント")

    if not apply:
        log.info("下見なので**1文字も貼っていません**。"
                 '貼るには {"apply": true} を付けてください')
        return 0

    ids = []
    for i, part in enumerate(parts):
        tail = SIGN if i == len(parts) - 1 else ""
        head = "" if len(parts) == 1 else f"（{i + 1}/{len(parts)}）\n\n"
        cid = post(issue, head + part + tail)
        if not cid:
            log.error("%d 本目が貼れませんでした。%d 本は貼れています",
                      i + 1, len(ids))
            return 3
        ids.append(cid)
    log.info("貼りました: #%d に %d コメント", issue, len(ids))
    notice(f"セリフの表: #{issue} に {len(ids)} コメント貼りました")
    return 0


# **自己点検から読み込まれたときは走らない。**
if __name__ == "__main__":
    sys.exit(main())
