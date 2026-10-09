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
- 出す数は**その人がその字を打った回数**まで。島ぜんぶで言われた回数も、
  割合も、掛け算した点も出さない（選び方の内側を出すと、どれだけ
  投げたかを当てる手がかりになる）

## 何をするか

1. `islandStampLine` の書類を**ぜんぶ**読む（`channelId` の無い人も落とさない。
   **25人そろっているかを数えるのが仕事のうち**）
2. `islandCharacter`（図鑑）から**絵文字と名前**を引く
3. BigQuery から**その人がその字を何回打ったか**を数える
   （`suggested` に回数は入っていないので、ここで数え直す）
4. 表にして、issue にコメントとして貼る

## 既定では1文字も貼らない

`{"apply": true}` を付けたときだけ貼る。下見では件数だけ出すので、
**貼る前に「25人そろったか・重複があるか」を確かめられる。**

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

sys.path.insert(
    0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from logsafe import mask  # noqa: E402
from stamp_line_pick import norm, tally  # noqa: E402

PROJECT = os.environ.get("BQ_PROJECT_ID", "live-streaming-d3cac")
DATASET = os.environ.get("BQ_DATASET", "youtube_chat")

# 流してよい量の上限。`stamp_line_suggest.py` と同じ
MAX_BYTES = 1 << 30  # 1GiB

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
        1人1辞書（`id` `channelId` `emoji` `name` `suggested` `lines` `nochar`）
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
        out.append({
            "id": d.id,
            "channelId": ch,
            "emoji": (cv.get("emoji") or "").strip(),
            "name": name,
            "suggested": [x for x in (v.get("suggested") or [])
                          if isinstance(x, str) and x.strip()],
            "lines": [x for x in (v.get("lines") or [])
                      if isinstance(x, str) and x.strip()],
            "nochar": not c.exists,
        })
    return out


def counts_of(rows: list, days: int) -> dict:
    """その人がその字を何回打ったかを、BigQuery から数える。

    `suggested` には回数が入っていない（`stamp_line_suggest.py` は
    ことばだけを置く）ので、ここで数え直す。**数えるのは
    「その人の回数」だけ**で、島ぜんぶの回数も割合も返さない。

    Args:
        rows: `fetch_rows()` の結果
        days: さかのぼる日数（0 なら全期間）

    Returns:
        `{channelId: {鍵: 回数}}`
    """
    want = {r["channelId"] for r in rows if r["channelId"]}
    if not want:
        return {}

    from google.cloud import bigquery  # BQ を使うときだけ要る

    bq = bigquery.Client(project=PROJECT)
    window = ""
    if days > 0:
        window = ("AND published_at >= TIMESTAMP_SUB("
                  f"CURRENT_TIMESTAMP(), INTERVAL {days} DAY)")
    # **この人たちのぶんだけ引く。** 島ぜんぶの回数は出さないので、
    # ここで全員を引く必要がない（`stamp_line_suggest.py` は割合を
    # 出すために島ぜんぶを引いている。こちらは要らない）。
    # 名簿は**問い合わせの引数**で渡す。SQL の字に混ぜない
    sql = f"""
    SELECT author_channel_id AS ch, message_text AS t, COUNT(*) AS n
    FROM `{PROJECT}.{DATASET}.chat_messages`
    WHERE event_type = 'TEXT'
      AND message_text IS NOT NULL
      AND author_channel_id IN UNNEST(@who)
      {window}
    GROUP BY ch, t
    """
    cfg = bigquery.QueryJobConfig(
        query_parameters=[
            bigquery.ArrayQueryParameter("who", "STRING", sorted(want))
        ],
    )
    dry = bigquery.QueryJobConfig(
        query_parameters=cfg.query_parameters,
        dry_run=True, use_query_cache=False)
    est = bq.query(sql, job_config=dry)
    mb = est.total_bytes_processed / (1 << 20)
    log.info("見積もり: %.1f MB（上限 %.0f MB）", mb, MAX_BYTES / (1 << 20))
    if est.total_bytes_processed > MAX_BYTES:
        log.error("上限を超えるので**引きません**。days を小さくしてください")
        sys.exit(1)

    bqrows = [(r["ch"], r["t"], int(r["n"] or 0))
              for r in bq.query(sql, job_config=cfg).result()]
    log.info("数え上げ: %d 通り（この人たちのぶんだけ）", len(bqrows))
    own, _ = tally(bqrows)
    # **回数だけに縮める。** 打った形（`raw`）は要らないので持ち回らない
    return {ch: {k: slot["n"] for k, slot in box.items()}
            for ch, box in own.items()}


# markdown として読まれてしまう字。**逃がさないと、その人が打った形で
# 読めなくなる**（`_ねむい_` が斜体になる、`|` で欄が割れる、
# `<b>` が消える）。GitHub は ASCII の記号を `\` で逃がせる
MD = "\\`*_[]<>&|~#"


def cell(text: str) -> str:
    """表のます1つ。**読まれ方だけ逃がす。字そのものは直さない。**

    送り仮名も語尾も、その人が打った形のまま出す
    （`python/stamp_line_pick.py`「字そのものは書き換えない」）。
    ここで足すのは `\` だけで、**GitHub の画面では元の字に戻る。**

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

    `pick()` は打った形が同じものを落とすが、鍵（`norm`）が同じで
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


def table_of(rows: list, counts: dict, top: int) -> list:
    """表の行を作る。**強さで並べない。**

    Args:
        rows: `fetch_rows()` の結果
        counts: `counts_of()` の結果
        top: 候補の欄の数

    Returns:
        markdown の行の一覧
    """
    head = ["絵文字", "名前"] + [f"候補{i + 1}" for i in range(top)]
    head.append("何回言ったか")
    out = ["| " + " | ".join(head) + " |",
           "| " + " | ".join([":--:", ":--"] + ["---"] * top + ["--:"]) + " |"]
    for r in rows:
        said = counts.get(r["channelId"], {})
        cands = r["suggested"][:top]
        cols = [r["emoji"] or "", cell(r["name"] or "（名前が引けません）")]
        cols += [cell(t) for t in cands] + [""] * (top - len(cands))
        # **回数は候補と同じ並びで。** 候補が無い人は空のまま
        ns = [said.get(norm(t)) for t in cands]
        cols.append(" / ".join("?" if n is None else str(n) for n in ns))
        out.append("| " + " | ".join(cols) + " |")
    return out


def body_of(rows: list, counts: dict, top: int) -> str:
    """貼る本文。

    Args:
        rows: `fetch_rows()` の結果
        counts: `counts_of()` の結果
        top: 候補の欄の数

    Returns:
        markdown
    """
    got = sorted([r for r in rows if r["suggested"]],
                 key=lambda r: (r["name"] or "￿", r["id"]))
    non = sorted([r for r in rows if not r["suggested"]],
                 key=lambda r: (r["name"] or "￿", r["id"]))
    dups = [(r, dup_of(r)) for r in rows]
    dups = [(r, d) for r, d in dups if d]
    decided = [r for r in rows if r["lines"]]

    p = []
    p.append("## 住人25人ぶんのセリフ候補")
    p.append("")
    p.append("`islandStampLine` に入っている中身を、そのまま表にしました。"
             "**島の面には1文字も出していません**——ここで話すための表です。")
    p.append("")
    p.append("本文は**その人が打った形のまま**です"
             "（絵文字・URL・前後の空白だけ落として、送り仮名も語尾も直していません）。")
    p.append("")
    p.append(f"| | |\n| --- | ---: |\n| 入れ物に入っている | **{len(rows)}人** |"
             f"\n| 候補が出た | **{len(got)}人** |"
             f"\n| 候補が1本も出なかった | **{len(non)}人** |")
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
    p += table_of(got, counts, top)
    p.append("")
    p.append("「何回言ったか」は、**その人がその字を打った回数**です"
             "（候補と同じ並び）。")
    p.append("")
    p.append("### 候補が1本も出なかった人")
    p.append("")
    p.append("チャットが少ない人ではなく、**口ぐせが無い人**"
             "（毎回ちがうことを言う人）です。機械では拾えないので、"
             "**ここはあやとの知っていることのほうが早い**と思います。")
    p.append("")
    p += table_of(non, counts, top)
    p.append("")
    if dups:
        p.append("### 同じことばが2本になっている人")
        p.append("")
        for r, d in dups:
            # **組ごとに並べる。** どれとどれが同じことばなのかが要る
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

    counts = counts_of(rows, days)
    got = [r for r in rows if r["suggested"]]
    non = [r for r in rows if not r["suggested"]]
    dups = [r for r in rows if dup_of(r)]
    # **回数が引けなかった候補を、黙って通さない。** 表では `?` になる
    unknown = sum(1 for r in got for t in r["suggested"][:top]
                  if counts.get(r["channelId"], {}).get(norm(t)) is None)
    log.info("候補が出た %d 人 / 1本も出なかった %d 人 / "
             "同じことばが2本の人 %d 人 / 回数が引けなかった候補 %d 本",
             len(got), len(non), len(dups), unknown)

    body = body_of(rows, counts, top)
    parts = chunks(body)
    log.info("本文: %d 字 / %d コメント", len(body), len(parts))
    # **名前が引けない人数も注記に出す。** ログは置き場から配られて
    # 口からは読めないので、下見で確かめられるのは注記だけ。
    # ここに出していないと「名前のかわりに『引けません』が25行並ぶ」が
    # 貼ってからしか分からない
    notice(f"セリフの表{'（下見）' if not apply else ''}: "
           f"{len(rows)}人 / 候補あり {len(got)}人 / 候補なし {len(non)}人 / "
           f"重複 {len(dups)}人 / 回数不明 {unknown}本 / "
           f"名前が引けない {len(noname)}人 / 図鑑に居ない {len(nochar)}人 / "
           f"{len(parts)}コメント")

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
