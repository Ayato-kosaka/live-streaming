"""スタンプの**名セリフの候補を引いて、Firestore に置く**（#716）。

    python python/admin/stamp_line_suggest.py

## 何をするか

1. `islandStampLine` に在る書類（＝あやとが選んだ人）の `channelId` を集める
2. BigQuery の `chat_messages` から、**島ぜんぶの「同じ字を、誰が・何回・
   何日にわたって言ったか」**を引く
3. 選び方は `python/stamp_line_pick.py`（**名セリフか**——
   島のほかの人も言っている字は門で落とし、らしさ² × ∛回数 × 短さ で並べる）
4. 1人 **10本**を `suggested` に、**元の字**を `suggestedFrom` に置く

**名簿は要らない。** 入れ物に在る書類がそのまま相手なので、この口に
名簿を渡す必要がない（渡さないほうが安全）。

## 2026-10-10 から、下見が**較正**をする

あやと（#716）:

> **「うん」とか出すのやめて。採用するわけない。個性がなさすぎる。**
> もっと**このセリフがその人っぽい！**ってのがあるはず

門のしきい（`MANY_SPEAKERS` ＝ 何人までなら残すか）は、**当てて決める
ものであって、決めてから当てるものではない。** 1人だけ（完全に独占）に
すると、ほかの人が1回真似しただけで名セリフが落ちる。緩くすると
「うん」が残る。

だから下見（`apply` なし）は、**しきいを何通りか当てて、結果の数だけ**出す。

| 出すもの | 何のため |
| --- | --- |
| しきいごとの「候補が出た人数・候補の合計」 | 緩め過ぎ／厳し過ぎを見る |
| しきいごとの「**あやとが挙げた名セリフが候補に出た本数**」 | **ここが合否**（#716 の採点表） |
| しきいごとの「**個性のない字が残った本数**」 | 門が効いているか。0 でなければ出さない |

**あやとが挙げた字（採点表）はリポジトリに書かない。**
名前と字の組は、10人ぶんでも「あやとが選んだ人の一部」そのものなので、
git に残すと公開される（#716 の決め）。渡すのは
`repository_dispatch` の `client_payload` の `check`。

**`PLAIN`（個性のない字）だけは、ここに置いてよい。**
あやとが名指しした一般名詞で、誰のものでもない。しかも**選ぶ側は
1文字も見ていない**——門は「何人が言ったか」しか見ないので、
`PLAIN` は「門が効いているか」を当てる対照にしかならない。

## 出すもの・出さないもの

**出すのは件数と、`logsafe.mask()` の指紋だけ。**

出さないもの:

- チャンネルID・図鑑の書類ID・名前・ハンドル
- **候補のことばそのもの**。本人のコメントから取った字なので、
  並べれば「誰が何を言っているか」になる。本人が `/me` で読む
- **採点表のことばそのもの**（番号でしか出さない）

ここは公開のリポジトリで、Actions のログも誰でも読める。

## 本人が決めたことばは、絶対に触らない

触るのは `suggested` と `suggestedFrom` と `suggestedAt` の3つだけ。
`lines` を書くと、本人が決めたことばが流し直しで消える（人の字なので戻らない）。

## 流す前に見積もる

島ぜんぶのコメントを1回歩くので、**dry-run で測ってから流す。**
上限（1GiB）を超えたら引かずに止める（あやと「1GB超えるSQLは控えてくださいね」）。

入力（`apply` と `days` と `top` は ARGS でもよい。`check` は
**`client_payload` だけ**——ことばは公開のログに出る ARGS に置かない）:
  {}                  … 下見（**1バイトも書かない**）＋ しきいの較正
  {"apply": true}     … 置く
  {"days": 365}       … さかのぼる日数（既定は全期間）
  {"top": 10}         … 1人あたりの本数
  {"check": [{"name": "…", "lines": ["…"], "words": ["…"]}]}
                      … 採点表（あやとが挙げた名セリフ）
"""

import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from _fs import args, db, log, notice, readonly  # noqa: E402

sys.path.insert(
    0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import stamp_line_pick as pick_mod  # noqa: E402
from logsafe import mask  # noqa: E402
from stamp_line_pick import (  # noqa: E402
    TOP,
    by_word,
    near,
    norm,
    pick_all,
    shape_check,
    tally,
    texts_of,
)

PROJECT = os.environ.get("BQ_PROJECT_ID", "live-streaming-d3cac")
DATASET = os.environ.get("BQ_DATASET", "youtube_chat")

# 流してよい量の上限。`chatter_one.py` と同じ
MAX_BYTES = 1 << 30  # 1GiB

# **個性のない字。** あやとが #716 で名指ししたものと、同じ形のもの。
#
# **選ぶ側は1文字も見ていない。** 門（`MANY_SPEAKERS`）が見るのは
# 「何人が言ったか」だけなので、ここに無い字でも、みんなが言っていれば
# 落ちる。この並びの役は**門が効いているかを当てること**だけ
# （`docs/island-standards.md` §15「対照」）。
PLAIN = ("うん", "うんうん", "はい", "こんばんは", "ありがとう", "そうですね")

# 較正で当てるしきい。**`MANY_SPEAKERS` もこの中に入れて並べる。**
# どれも「**この人数以上が言っていたら落とす**」——2 なら
# 「その人しか言っていない字だけ残す」。1 は入れない（全部落ちる）
GRID = (2, 3, 4, 5, 7, 10)


def sql_of(days: int) -> str:
    """島ぜんぶの「同じ字を、誰が・何回・何日にわたって言ったか」。

    **名前は SELECT しない**（`chatter_one.py` と同じ決め）。
    `event_type = 'TEXT'` に絞るのは、スパチャの本文をスタンプの候補に
    しないため——**金額の付いた1件を、口ぐせとして出したくない。**

    島ぜんぶを引くのは、**その字を島で何人が言っているかを見る**ため。
    選ばれた人のぶんだけ引くと、門が1人も落とせない。

    **日数は「配信の日」で切る。** 日本時間の 0 時で切ると、0時をまたいだ
    1回の配信が2日に数えられる。6時間ずらすのは `docs/island-money.md`
    5章「開始が 6:00 JST より前の続き枠は前日に寄せる」と同じ向き。
    （日数は点に入れないが、同点のときの並べ替えと、表に出す数に使う）

    Args:
        days: さかのぼる日数。0 なら全期間

    Returns:
        SQL
    """
    window = ""
    if days > 0:
        window = (
            "AND published_at >= "
            f"TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL {days} DAY)"
        )
    return f"""
    SELECT
      author_channel_id AS ch,
      message_text AS t,
      COUNT(*) AS n,
      COUNT(DISTINCT DATE(
        TIMESTAMP_SUB(published_at, INTERVAL 6 HOUR), 'Asia/Tokyo')) AS d
    FROM `{PROJECT}.{DATASET}.chat_messages`
    WHERE event_type = 'TEXT'
      AND message_text IS NOT NULL
      AND author_channel_id IS NOT NULL
      {window}
    GROUP BY ch, t
    """


def name_of(cv: dict) -> str:
    """図鑑の書類から**呼び名**を取る。

    **`aliases` が先。** `characters_migrate` が `@` 付きのハンドルだけを
    `channelName` に入れたので、あちらを先に見ると**名前のかわりに
    `@…` が並ぶ**（`python/admin/characters_why.py` 53行目と同じ読み）。

    Args:
        cv: `islandCharacter` の中身

    Returns:
        呼び名（無ければ空）
    """
    for a in ((cv or {}).get("aliases") or []):
        if isinstance(a, str) and a.strip():
            return a.strip()
    return ((cv or {}).get("channelName") or "").strip()


def people(client) -> list:
    """候補を出す相手。**入れ物に在る書類から集める。**

    Args:
        client: Firestore クライアント

    Returns:
        `[{"id", "channelId", "name"}]`。`channelId` の無い書類も入れる
        （**黙って落とさない**。数えるのが仕事のうち）
    """
    chars = client.collection("islandCharacter")
    out = []
    for d in client.collection("islandStampLine").list_documents():
        snap = d.get()
        if not snap.exists:
            continue
        ch = (snap.to_dict() or {}).get("channelId") or ""
        ch = ch.strip() if isinstance(ch, str) else ""
        c = chars.document(d.id).get()
        out.append({"id": d.id, "channelId": ch,
                    "name": name_of(c.to_dict() if c.exists else {})})
    return out


def payload() -> dict:
    """入力。**ことばは公開ログに出る ARGS からは取らない。**

    `client_payload`（`repository_dispatch`）が在ればそちらを優先して、
    無ければ ARGS。`arrange` と同じ道。

    Returns:
        入力の辞書
    """
    ev = os.getenv("GITHUB_EVENT_PATH") or ""
    got = dict(args())
    if ev and os.path.exists(ev):
        try:
            with open(ev, encoding="utf-8") as f:
                d = json.load(f)
        except (OSError, json.JSONDecodeError) as e:
            # **読めなかったら止める。** 空に落とすと「渡っていない」と
            # 同じ顔になって、0件が成功に見える
            log.error("出来事の中身が読めません: %s", e)
            sys.exit(2)
        v = d.get("client_payload")
        if isinstance(v, dict):
            got.update({k: x for k, x in v.items() if x is not None})
    return got


def fold_name(s: str) -> str:
    """名前の突き合わせ用。**先頭の `@` と前後の空白を落とすだけ。**

    図鑑の呼び名は `@` 付きのハンドルのことがある（`name_of`）。
    あやとは表の名前をそのまま書くので、そこだけ合わせる。

    Args:
        s: 名前

    Returns:
        畳んだ名前
    """
    return (s or "").strip().lstrip("@").strip().lower()


def match_sheet(sheet: list, folks: list) -> list:
    """採点表の名前を、**入れ物に居る人に当てる。**

    Args:
        sheet: `shape_check()` を通した採点表
        folks: `people()` の結果

    Returns:
        `sheet` の各件に `channelId` / `id` を足したもの（当たらなければ空）
    """
    by = {}
    for f in folks:
        by.setdefault(fold_name(f["name"]), f)
    out = []
    for one in sheet:
        f = by.get(fold_name(one["name"])) or {}
        got = dict(one)
        got["channelId"] = f.get("channelId") or ""
        got["id"] = f.get("id") or ""
        out.append(got)
    return out


def sheet_hits(sheet: list, counts, picks: dict) -> list:
    """採点表の1本ずつを、**出たか・落ちたか・データに無いか**に分ける。

    | `how` | 何 |
    | --- | --- |
    | `出` | 候補に出た |
    | `外` | その人が言っているが、候補の10本に入らなかった |
    | `門` / `割` / `回` / `形` | 関所で落ちた（どの関所かが入る） |
    | `無` | **その人のデータに無い**（言い方の揺れで探しても無い） |
    | `？` | 名前が入れ物に当たらない |
    | `空` | あやとが字を挙げていない（思い出せていない人） |

    Args:
        sheet: `match_sheet()` の結果
        counts: `tally()` の結果
        picks: `{channelId: [候補]}`

    Returns:
        `[{"name", "line", "how", "near", "words", "miss", "asked", "got"}]`。
        `miss` は**探したのに1本も無かった語**
    """
    out = []
    for one in sheet:
        ch = one.get("channelId") or ""
        own = (counts.own.get(ch) or {}) if ch else {}
        got = [t for t in texts_of(picks.get(ch, []))]
        folds = {pick_mod.fold(t) for t in got}
        # **見つかった字が、候補の何番なのかまで言う。**
        # 「在る」だけ言われても、あやとは候補の表を目で探し直すことになる
        where = {pick_mod.fold(t): i + 1 for i, t in enumerate(got)}

        def place(x: dict) -> dict:
            """候補の何番かを足す。

            Args:
                x: `near()` / `by_word()` の1件

            Returns:
                `no` を足したもの（候補に無ければ 0）
            """
            return dict(x, no=where.get(pick_mod.fold(x["text"]), 0))

        # **語ごとに、当たったか当たらなかったかを分けて持つ。**
        # まとめて3本に切ると、**当たった語の中身で埋まって、
        # 当たらなかった語が黙って消える**（あやとは1人に2つの語を
        # 挙げることがある。「ほなちがうか」と「◯◯だぞう」）
        words, miss = [], []
        for w in one.get("words") or []:
            hit = [place(dict(x, word=w)) for x in by_word(w, own, counts)]
            if hit:
                words += hit[:2]
            else:
                miss.append(w)
        # **何の語で探したかも持ち回る。** 「1本も無い」と言うときに、
        # **何で探して無かったのか**が出ないと、探していないのと同じに読める
        asked = list(one.get("words") or [])
        if not one["lines"]:
            out.append({"name": one["name"], "line": "", "how": "空",
                        "near": [], "words": words, "got": got,
                        "asked": asked, "miss": miss})
            continue
        for line in one["lines"]:
            if not ch:
                how, close = "？", []
            else:
                close = [place(x) for x in near(line, own, counts)]
                k = norm(line)
                f = pick_mod.fold(line)
                if f in folds:
                    how = "出"
                elif k in own:
                    ok, why, _ = pick_mod.gate_of(k, own[k], counts)
                    how = "外" if ok else {
                        "人数": "門", "割合": "割", "回数": "回"}.get(why, "形")
                elif close:
                    # **揺れで見つかったものは「無い」と言わない。**
                    # 本人は言っているが、字がすこし違う
                    how = "揺"
                else:
                    how = "無"
            out.append({"name": one["name"], "line": line, "how": how,
                        "near": close, "words": words, "got": got,
                        "asked": asked, "miss": miss})
    return out


def calibrate(rows, who, sheet, top: int) -> list:
    """門のしきいを**何通りか当てて、数だけ**返す。

    **本番に1バイトも書かない。** 下見のときだけ呼ぶ。

    Args:
        rows: BigQuery から引いた並び
        who: 相手のチャンネルID
        sheet: `match_sheet()` を通した採点表
        top: 1人あたりの本数

    Returns:
        `[{"many", "people", "lines", "hit", "of", "plain"}]`
    """
    was = pick_mod.MANY_SPEAKERS
    out = []
    try:
        for many in sorted(set(GRID) | {was}):
            pick_mod.MANY_SPEAKERS = many
            counts = tally(rows, who=who)
            got = pick_all(rows, who, top=top, counts=counts)
            hits = sheet_hits(sheet, counts, got)
            # **個性のない字が残っていないか。** 判定には使わない対照
            plain = sum(
                1 for cs in got.values() for t in texts_of(cs)
                if norm(t) in {norm(p) for p in PLAIN})
            named = [h for h in hits if h["line"]]
            out.append({
                "many": many,
                "people": len(got),
                "lines": sum(len(c) for c in got.values()),
                "hit": sum(1 for h in named if h["how"] == "出"),
                "of": len(named),
                "plain": plain,
            })
    finally:
        pick_mod.MANY_SPEAKERS = was
    return out


def main() -> int:
    """エントリポイント。

    Returns:
        0=通った / 1=上限を超えた / 2=相手が1人もいない
    """
    a = payload()
    apply = bool(a.get("apply"))
    days = int(a.get("days") or 0)
    top = int(a.get("top") or TOP)
    sheet = shape_check(a.get("check"))

    client = db()
    folks = people(readonly(client))
    who = {f["channelId"]: f["id"] for f in folks if f["channelId"]}
    if not folks:
        # **0人と「読めなかった」を同じ顔で返さない**（island-standards 10）。
        # ここは読めたうえで0人なので、そう言って 2 で終わる
        log.error(
            "候補を出す相手が1人もいません。"
            "先に stamp_line_seed を流してください")
        return 2
    blank = len(folks) - len(who)
    if blank:
        # **黙って通さない。** この人たちには候補を出せない
        log.warning(
            "channelId の無い書類が %d 件。**候補を出せない**"
            "（図鑑に channelId を入れるまで）", blank)
    log.info("候補を出す相手: %d 人", len(who))
    sheet = match_sheet(sheet, folks)
    if sheet:
        lost = [s["name"] for s in sheet if not s["channelId"]]
        log.info("採点表: %d 人ぶん（名前が当たらなかった %d 人）",
                 len(sheet), len(lost))

    from google.cloud import bigquery  # BQ を使うときだけ要る

    bq = bigquery.Client(project=PROJECT)
    sql = sql_of(days)
    # **流す前に見積もる。** 超えたら引かずに止める
    dry = bq.query(sql, job_config=bigquery.QueryJobConfig(
        dry_run=True, use_query_cache=False))
    mb = dry.total_bytes_processed / (1 << 20)
    log.info("見積もり: %.1f MB（上限 %.0f MB）", mb, MAX_BYTES / (1 << 20))
    if dry.total_bytes_processed > MAX_BYTES:
        log.error("上限を超えるので**引きません**。days を小さくしてください")
        return 1

    rows = [(r["ch"], r["t"], r["n"], r["d"]) for r in bq.query(sql).result()]
    log.info("数え上げ: %d 通り（島ぜんぶ）", len(rows))
    if not rows:
        log.error("コメントが1件も引けませんでした")
        return 2

    counts = tally(rows, who=list(who))
    got = pick_all(rows, list(who), top=top, counts=counts)
    log.info("鍵: %d 通り（言い切りに切って、島のことばを剥がしたあと）",
             len(counts.all_n))
    # **1本も出なかった人を、黙って落とさない。**
    none_of = [doc for ch, doc in who.items() if ch not in got]
    log.info("候補が出た %d 人 / 1本も出なかった %d 人", len(got), len(none_of))
    if none_of:
        log.warning(
            "1本も出なかった %d 人（指紋: %s）。**この人には提案を置かない**"
            "——空の提案を置くと、画面が「提案が無い」と「読めなかった」を"
            "見分けられなくなる",
            len(none_of), " ".join(mask(x, public=True) for x in none_of))
    # 何本出たかの散らばり。**中身は出さない**
    spread = {}
    for ch in got:
        spread[len(got[ch])] = spread.get(len(got[ch]), 0) + 1
    log.info("本数の散らばり: %s",
             " / ".join(f"{k}本 {v}人" for k, v in sorted(spread.items())))
    # **門が効いているか。** 個性のない字が1本でも残ったら、それは
    # しきいが緩い（**判定には使っていない対照**）
    plain_left = sum(1 for cs in got.values() for t in texts_of(cs)
                     if norm(t) in {norm(p) for p in PLAIN})
    log.info("個性のない字が候補に残った本数: %d 本（0 であること。"
             "門のしきいは %d 人以上で落とす）",
             plain_left, pick_mod.MANY_SPEAKERS)
    if plain_left:
        log.warning("**個性のない字が %d 本残っています。** "
                    "門のしきいを下げてください", plain_left)
    # **その人だけが言っている字の割合。** 門が何を残しているかの姿
    lone = sum(1 for cs in got.values() for c in cs if c["people"] <= 1)
    log.info("候補のうち、島でその人しか言っていない字: %d 本 / %d 本",
             lone, sum(len(c) for c in got.values()))
    # 機械が末尾の句読点を落とした本数。**言い方は変えていない**
    tidied = sum(1 for cs in got.values() for c in cs
                 if c["text"] != c["from"])
    log.info("末尾の句読点を落とした候補: %d 本", tidied)

    # ---- 採点表（**ことばは1文字も出さない。番号と記号だけ**）
    hits = []
    if sheet:
        hits = sheet_hits(sheet, counts, got)
        tag = " ".join(f"{i + 1}:{h['how']}" for i, h in enumerate(hits))
        named = [h for h in hits if h["line"]]
        log.info("採点表（#716 であやとが挙げた字）: %d 本中 **%d 本が候補に出た**",
                 len(named), sum(1 for h in named if h["how"] == "出"))
        log.info("内訳（番号は issue の並び。出=候補に出た / 外=候補の外 / "
                 "門割回形=関所 / 揺=言い方ちがいで在る / 無=データに無い / "
                 "？=名前が当たらない / 空=字を挙げていない）: %s", tag)
        # **注記にも出す。** ログは置き場（Azure Blob）から配られて
        # **口からは読めない**——押したあとに中身を確かめられるのは注記だけ
        # （`_fs.notice` の説明と同じ理由）。出るのは**番号と記号だけ**で、
        # ことばは1文字も通らない
        notice(f"採点表の内訳（出/外/門/割/回/形/揺/無/？/空）: {tag}")
    if not apply:
        # ---- 較正（**下見のときだけ**。しきいを当てて数を並べる）
        for g in calibrate(rows, list(who), sheet, top):
            here = ("  ← いまのしきい"
                    if g["many"] == pick_mod.MANY_SPEAKERS else "")
            line = (f"較正 しきい{g['many']}人以上で落とす: "
                    f"候補が出た {g['people']}人 / 候補 {g['lines']}本 / "
                    f"採点表 {g['hit']}/{g['of']} / "
                    f"個性のない字 {g['plain']}本{here}")
            log.info("%s", line)
            # **較正こそ注記に出す。** これを見てしきいを決めるのに、
            # ログが口から読めなければ、決める材料が1つも手に入らない
            notice(line)

    notice(
        f"候補{'（下見）' if not apply else ''}: 相手 {len(who)} 人 / "
        f"候補が出た {len(got)} 人 / 1本も出なかった {len(none_of)} 人 / "
        + " ".join(f"{k}本:{v}人" for k, v in sorted(spread.items()))
        + f" / 独占 {lone} 本 / 個性のない字 {plain_left} 本 / "
        + (f"採点表 {sum(1 for h in hits if h['how'] == '出')}"
           f"/{sum(1 for h in hits if h['line'])} / " if hits else "")
        + f"句読点を落とした {tidied} 本")

    if not apply:
        log.info("下見なので**1バイトも書いていません**。"
                 '置くには {"apply": true} を付けてください')
        return 0

    lines = client.collection("islandStampLine")
    now = _now()
    n = 0
    for ch, cands in got.items():
        # **触るのは suggested と suggestedFrom と suggestedAt だけ。**
        # `lines`（本人が決めたことば）には1バイトも書かない。
        # 2つの並びは**同じ長さ・同じ順**で置く——表が1本ずつ突き合わせる
        lines.document(who[ch]).set(
            {
                "suggested": [c["text"] for c in cands],
                "suggestedFrom": [c["from"] for c in cands],
                "suggestedAt": now,
            },
            merge=True,
        )
        n += 1
    log.info("置きました: %d 人ぶん", n)
    notice(f"候補: 置いた {n} 人ぶん")
    return 0


def _now() -> int:
    """いまの時刻（ミリ秒）。口（`stampLine.ts`）と同じ単位。

    Returns:
        エポックからのミリ秒
    """
    import time

    return int(time.time() * 1000)


# **自己点検から読み込まれたときは走らない。**
if __name__ == "__main__":
    sys.exit(main())
