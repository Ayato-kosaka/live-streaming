"""月ごとのふりかえり（`/months`）を、本番の値から焼く。**手で直さない。**

    python3 python/build_monthly.py --build              # BigQuery から焼く
    python3 python/build_monthly.py --build --src dump.json  # 取り置きから焼く

出来上がるのは `site/content/months.ts` ひとつ。
これまで月末配信のページは **1枚ずつ手で書いた HTML**（`public/2026MM_monthly_review.html`）
だけで、2026年1月〜7月は1枚も無かった。手で書き続けるかぎり来月また1枚増えて、
いつか止まる——実際に止まっていた。だから**元のデータから作る**形に替えた。

## 期間の決め方

**前回の月末配信の日 〜 今回の月末配信の前日**（`docs/island-money.md` 5章）。
「月初〜月末」ではない。出席の分母も、投げ銭も、はじめましての人数も、
**全部この同じ期間**で数える。

期間の端（月末配信の日）だけは人が決める。暦からは当てられないので
（実測で 1/31・2/28・3/28・4/25・5/31・6/28・7/26・8/29・9/26。
「その月の最終日」だったのは1回だけ）、`FINALS` に書いてある。
**新しい月を足すときは、ここに1行足すだけ。**

## 配信日の境目は 6:00 JST

0時をまたいだ続き枠は前日に寄せる（`docs/island-money.md` 5章、
`/monthly-review` の3章）。`build_residents.py` は UTC で切っていて、
あちらは実質 18:00 JST が境目になる——**昼に始まった配信が前の日に入る。**
月ごとの面は「その日なにがあったか」を並べる面なので、
決めのとおり 6:00 JST で切る。

## 出席の数えかた（`/monthly-review` 3章のとおり）

- **日ごとに集計。** 同じ日に何枠あっても1日
- **分母は、期間内に配信があった日数**（`denom`）
- **コメント消失日**（配信はあったのにチャットが1件も残っていない日）は、
  **当時すでに来ていた人（初コメントがその日以前）を出席扱い**にする。
  その日を分母から外さないのは、配信はあったから。外すと、
  消えた日が多い月ほど分母が小さくなって、他の月と比べられなくなる
- **個人別のコメント数は焼かない。** 画面にも出さない（嫌がる人が多い）。
  ここが持つのは「何日来たか」だけ

## 投げ銭の額は貢献額

**式は `python/fund_box.py` の `viewer_yen()` ひとつ**（スパチャ ÷ 2 + Doneru）。
ここでは割り算をしない。名寄せは図鑑（`islandCharacter`）が正なので、
順位そのものは `python/admin/monthly_tips_run.py` が Actions で作る
（Firestore の名簿はこの箱から読めない）。こちらはその出力を取り置きから読む。

**月ごとの面に実額は1円も出さない**（`docs/island-money.md` 2章の例外）。
ここに入るのも貢献額だけ。

### 取り置きの無い月は、焼いてあるものを据え置く

`--tips` の置き場（既定 `python/data/monthly_tips`）は **git に入っていない。**
`monthly_tips_run` が Actions のログに出した JSON を、人が手元へ置くだけのもの。
だから**走者（`rebake.yml`）の手元には1枚も無い。**

ここが素直に「無ければ 0 件」と焼くと、毎晩の焼き直しに繋いだ瞬間に
**9ヶ月ぶんの順位と貢献額がまるごと消えて master に入る。**
縮みの関所（`rebake.yml` の「中の数が縮んでいないか」）は止めてくれるが、
止まるのは commit だけで、**毎晩が赤になるだけ**で誰も得をしない。

なので、**その月の JSON が無いときは、いま焼いてある `months.ts` の
`tipTotal` と `tips` をそのまま持ち越す。** 読むのは `ts_read`（自前の
正規表現で TS を読まない）。持ち越した月は走らせたときにログへ名指しで出す。

JSON が**在って中身が空**のときは持ち越さない。あれは「その月は0円だった」と
人が決めた結果で、取り置きが無いのとは別のこと。

## タップ数

置き場は `python/data/monthly_taps.json`（取り置き）。**焼き込みに直接書かない。**
取る道具（`tools/youtube_taps.py`）が書き戻す先が画面のファイルになると、
人が直した字と機械が書いた値が同じ場所で混ざる。
渡っていない月があれば `python/monthly_taps_selftest.py` が鳴る（毎 PR）。
"""

import argparse
import json
import os
import sys
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from ts_read import array_body, fields, nested_body, objects, read_array  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
OUT_TS = ROOT / "site" / "content" / "months.ts"
TAPS_JSON = ROOT / "python" / "data" / "monthly_taps.json"
RESIDENTS_TS = ROOT / "site" / "content" / "residents.ts"
PUBLIC_DIR = ROOT / "public"

PROJECT = "live-streaming-d3cac"
DATASET = "youtube_chat"

# 集計用の bot。本人の配信通知なので人ではない（`build_residents.py` と同じ）
BOT_NAME = "@あやとグルメアプリ"

# 毎月の月末配信の日（JST）。**暦から当てない。**
# `docs/island-standards.md` 16章「暦から当てにいく字は、当たらない日が必ず来る」。
# 新しい月を足すときは、ここに1行足す。直前の行が「前回の月末配信の日」になる。
FINALS = [
    "2025-12-31",  # 年越し24時間配信。2026-01 の期間の始まり
    "2026-01-31",
    "2026-02-28",
    "2026-03-28",
    "2026-04-25",
    "2026-05-31",
    "2026-06-28",
    "2026-07-26",
    "2026-08-29",
    "2026-09-26",
    "2026-10-31",  # あやと 2026-10-15「10月31日にやります」
]


def periods() -> list:
    """`FINALS` から、月ごとの期間を組む。

    Returns:
        `{"key", "from", "to", "final"}` の並び（古い順）
    """
    out = []
    for i in range(1, len(FINALS)):
        fin = FINALS[i]
        out.append({
            "key": fin[:7],
            "from": FINALS[i - 1],
            "to": day_before(fin),
            "final": fin,
        })
    return out


def day_before(d: str) -> str:
    """JST の日付を1日戻す。"""
    from datetime import date, timedelta

    y, m, dd = (int(x) for x in d.split("-"))
    return (date(y, m, dd) - timedelta(days=1)).isoformat()


# ---------------------------------------------------------------- BigQuery

# **1本で済ませる。** 期間ごとに投げると回数が増えるだけで、読む列は同じ。
# 配信日は 6:00 JST で切る（上の説明）。
SQL = """
WITH periods AS (
  SELECT * FROM UNNEST([{periods}])
),
vraw AS (
  SELECT video_id, title, actual_start_time AS st,
    DATE(TIMESTAMP_SUB(actual_start_time, INTERVAL 6 HOUR), 'Asia/Tokyo') AS d,
    FORMAT_TIMESTAMP('%Y-%m-%d %H:%M', actual_start_time, 'Asia/Tokyo') AS jst
  FROM `{p}.{ds}.videos` WHERE actual_start_time IS NOT NULL
),
cm AS (
  SELECT author_channel_id AS cid, author_name AS nm, published_at AS pa, video_id,
    DATE(TIMESTAMP_SUB(published_at, INTERVAL 6 HOUR), 'Asia/Tokyo') AS d
  FROM `{p}.{ds}.chat_messages`
  WHERE event_type='TEXT' AND author_name != '{bot}' AND author_channel_id IS NOT NULL
),
firsts AS (SELECT cid, MIN(d) AS f FROM cm GROUP BY cid),
sdays AS (SELECT DISTINCT d FROM vraw),
haveday AS (SELECT DISTINCT d FROM cm),
-- **コメント消失日。** 配信はあったのに、チャットが1件も残っていない日
lost AS (SELECT d FROM sdays WHERE d NOT IN (SELECT d FROM haveday)),
plost AS (SELECT p.mk, l.d FROM periods p JOIN lost l ON l.d BETWEEN p.d0 AND p.d1),
vpeople AS (SELECT video_id, COUNT(DISTINCT cid) AS people FROM cm GROUP BY video_id),
att AS (
  SELECT p.mk, c.cid, COUNT(DISTINCT c.d) AS n, MAX(c.d) AS last_d,
    ARRAY_AGG(c.nm ORDER BY c.pa DESC LIMIT 1)[OFFSET(0)] AS name
  FROM periods p JOIN cm c ON c.d BETWEEN p.d0 AND p.d1
  GROUP BY p.mk, c.cid
),
-- 消えた日のぶん。**その日の前から来ていて、その日より後にも来ている人**だけ足す。
-- 「初コメントがその日以前」だけで足すと、たまたま1日だけ来た人にも
-- 消えた日の数だけ日数が付く。イランまで歩いた5月は消えた日が7つあって、
-- **1日だけ来た558人が全員「4日来た人」になった**（実測）。
-- 当時その人が来ていたことの証拠は、消えた日をまたいで前後に居ることのほう。
addl AS (
  SELECT a.mk, a.cid, COUNT(pl.d) AS extra
  FROM att a JOIN firsts f ON f.cid = a.cid
  LEFT JOIN plost pl ON pl.mk = a.mk AND pl.d > f.f AND pl.d < a.last_d
  GROUP BY a.mk, a.cid
),
attj AS (
  SELECT a.mk, COUNT(*) AS people,
    TO_JSON_STRING(ARRAY_AGG(STRUCT(a.name AS n, a.cid AS c, (a.n + x.extra) AS d)
      ORDER BY (a.n + x.extra) DESC, a.name)) AS js
  FROM att a JOIN addl x ON x.mk = a.mk AND x.cid = a.cid
  GROUP BY a.mk
),
stj AS (
  SELECT p.mk, TO_JSON_STRING(ARRAY_AGG(
    STRUCT(v.jst AS t, CAST(v.d AS STRING) AS d, v.title AS ti, v.video_id AS v,
           IFNULL(vp.people,0) AS p) ORDER BY v.st)) AS js
  FROM periods p JOIN vraw v ON v.d BETWEEN p.d0 AND p.d1
  LEFT JOIN vpeople vp ON vp.video_id = v.video_id
  GROUP BY p.mk
),
dn AS (
  SELECT p.mk, COUNT(DISTINCT s.d) AS denom
  FROM periods p JOIN sdays s ON s.d BETWEEN p.d0 AND p.d1 GROUP BY p.mk
),
ls AS (
  SELECT mk, STRING_AGG(CAST(d AS STRING), ' ' ORDER BY d) AS lost_list, COUNT(*) AS lost_days
  FROM plost GROUP BY mk
),
nw AS (
  SELECT p.mk, COUNT(*) AS newcomers
  FROM periods p JOIN firsts f ON f.f BETWEEN p.d0 AND p.d1 GROUP BY p.mk
)
SELECT p.mk, CAST(p.d0 AS STRING) AS d0, CAST(p.d1 AS STRING) AS d1,
  CAST(p.fin AS STRING) AS fin, dn.denom, IFNULL(ls.lost_days,0) AS lost_days,
  IFNULL(ls.lost_list,'') AS lost_list, IFNULL(nw.newcomers,0) AS newcomers,
  attj.people, attj.js AS att, stj.js AS streams
FROM periods p
JOIN dn ON dn.mk = p.mk LEFT JOIN ls ON ls.mk = p.mk LEFT JOIN nw ON nw.mk = p.mk
JOIN attj ON attj.mk = p.mk JOIN stj ON stj.mk = p.mk
ORDER BY p.mk
"""


def sql() -> str:
    """BigQuery に投げる1本を組み立てる。"""
    rows = []
    for i, p in enumerate(periods()):
        head = "STRUCT(" if i == 0 else "("
        tail = " AS mk, DATE '%s' AS d0, DATE '%s' AS d1, DATE '%s' AS fin)" % (
            p["from"], p["to"], p["final"]) if i == 0 else \
            ", DATE '%s', DATE '%s', DATE '%s')" % (p["from"], p["to"], p["final"])
        rows.append("%s'%s'%s" % (head, p["key"], tail))
    return SQL.format(periods=",\n    ".join(rows), p=PROJECT, ds=DATASET, bot=BOT_NAME)


def fetch() -> list:
    """BigQuery から1本引いて、行を辞書で返す。"""
    from google.cloud import bigquery

    client = bigquery.Client(project=PROJECT)
    rows = [dict(r) for r in client.query(sql()).result()]
    client.close()
    for r in rows:
        r["att"] = json.loads(r["att"])
        r["streams"] = json.loads(r["streams"])
    return rows


# ---------------------------------------------------------------- 焼く

def icons_by_channel() -> dict:
    """`content/residents.ts` から チャンネルID → 絵の id を引く表を作る。

    **ここで名寄せを自作しない。** `residents.ts` は
    `python/build_residents.py` が図鑑（`islandCharacter`）の `channelId` /
    `lookupKeys` で結んだ結果なので、当たっているものをそのまま借りるだけ。
    載っていない人（直近90日に居ない人・結べなかった人）は絵が付かず、
    頭文字の丸になる。

    **自前の正規表現で TS を読まない**（`python/ts_readers_selftest.py`）。
    読み手は `python/ts_read.py` ひとつ。

    Returns:
        `{channelId: icon}`
    """
    if not RESIDENTS_TS.exists():
        return {}
    got = read_array(RESIDENTS_TS.read_text(encoding="utf-8"), "RESIDENTS",
                     keys=("icon", "channel"), id_key="icon")
    return {r["channel"]: r["icon"] for r in got.rows if r["channel"] and r["icon"]}


def taps() -> dict:
    """タップ数の取り置きを読む。**無くても焼ける**（その月だけ出ない）。"""
    if not TAPS_JSON.exists():
        return {}
    d = json.loads(TAPS_JSON.read_text(encoding="utf-8"))
    return {k: int(v["taps"]) for k, v in (d.get("months") or {}).items()
            if isinstance(v, dict) and v.get("taps") is not None}


def review_pages() -> set:
    """`public/` に置いてある振り返り資料（OBS のページ）の月。

    **無い月は、無いことを画面で説明しない。** ただ出さない。
    """
    return {p.name[:4] + "-" + p.name[4:6]
            for p in PUBLIC_DIR.glob("20??_monthly_review.html")} | {
        p.name[:4] + "-" + p.name[4:6]
        for p in PUBLIC_DIR.glob("??????_monthly_review.html")}


def tips_of(key: str, src_dir: Path):
    """その月の投げ銭ランキング（`monthly_tips_run` が出した JSON）。

    **無いときは `None`。** 「0円だった月」（中身が空の JSON）と
    「取り置きがそもそも渡っていない月」を分ける——前者は焼いてよく、
    後者は焼くと**前に焼いた順位が消える**（上の説明）。

    Returns:
        `{"total", "rows"}`、または取り置きが無ければ `None`
    """
    f = src_dir / ("%s.json" % key)
    if not f.exists():
        return None
    return json.loads(f.read_text(encoding="utf-8"))


def baked_tips() -> dict:
    """**いま焼いてある `months.ts`** から、月ごとの投げ銭ぶんを読み返す。

    取り置きの渡っていない月を、前の版のまま据え置くために要る。
    読むのは `ts_read`（`python/ts_readers_selftest.py`。自前の正規表現で
    TS を読まない）。`tips` は入れ子の配列なので、字のまま借りて
    **1バイトも作り直さない。**

    Returns:
        `{月: {"total": 貢献額の合計, "body": tips の中身（字のまま）}}`
    """
    if not OUT_TS.exists():
        return {}
    out = {}
    for o in objects(array_body(OUT_TS.read_text(encoding="utf-8"), "MONTHS")):
        f = fields(o)
        key = f.get("key")
        if not key:
            continue
        total = f.get("tipTotal") or "0"
        out[key] = {
            "total": int(total) if total.isdigit() else 0,
            "body": nested_body(o, "tips"),
        }
    return out


def ts(v) -> str:
    """TypeScript の文字列に落とす。"""
    return json.dumps(v, ensure_ascii=False)


def build(rows: list, tips_dir: Path) -> str:
    """焼いた `months.ts` の中身を返す。"""
    icon = icons_by_channel()
    tap = taps()
    reviews = review_pages()
    prev = baked_tips()
    kept = []
    body = []
    for r in rows:
        key = r["mk"]
        y, m = int(key[:4]), int(key[5:7])
        streams = [
            "{d:%s,t:%s,title:%s,v:%s,p:%d}" % (
                ts(s["d"]), ts(s["t"][11:]), ts(s["ti"]), ts(s["v"]), int(s["p"]))
            for s in r["streams"]
        ]
        # **並べるのは2日以上来た人まで。** 1日だけの人は数で出す。
        # 5月は770人のうち558人が1日だけで、全部並べると「ランキング」ではなく
        # 名簿になる（しかも面がその1か月だけ4倍の背になる）。
        once = sum(1 for a in r["att"] if int(a["d"]) <= 1)
        attend = []
        for a in r["att"]:
            if int(a["d"]) <= 1:
                continue
            ic = icon.get(a["c"])
            attend.append("{n:%s,d:%d%s}" % (
                ts(a["n"]), int(a["d"]), ",i:" + ts(ic) if ic else ""))
        # **取り置きの無い月は、焼いてあるものを据え置く**（上の説明）。
        # 走者の手元に `python/data/monthly_tips` は無いので、ここが
        # 「無ければ0件」だと毎晩ぶんが順位をまるごと消しにかかる
        src = tips_of(key, tips_dir)
        if src is None:
            was = prev.get(key) or {"total": 0, "body": ""}
            tip_total, tips_body = was["total"], was["body"]
            if tip_total or tips_body:
                kept.append(key)
        else:
            tip_total = int(src["total"])
            tips_body = ", ".join(
                "{r:%d,n:%s,y:%d%s}" % (
                    int(x["rank"]), ts(x["display"]), int(x["yen"]),
                    ",i:" + ts(x["icon"]) if x.get("icon") else "")
                for x in src["rows"]
            )
        lost = [x for x in (r["lost_list"] or "").split(" ") if x]
        extra = ""
        if key in tap:
            extra += "\n    taps: %d," % tap[key]
        if key in reviews:
            extra += "\n    review: %s," % ts("/%s%02d_monthly_review.html" % (y, m))
        body.append(
            "  {\n"
            "    key: %s, year: %d, month: %d,\n"
            "    from: %s, to: %s, final: %s,\n"
            "    denom: %d, lost: [%s],\n"
            "    people: %d, newcomers: %d, once: %d,\n"
            "    tipTotal: %d,%s\n"
            "    streams: [%s],\n"
            "    attend: [%s],\n"
            "    tips: [%s],\n"
            "  },"
            % (ts(key), y, m, ts(r["d0"]), ts(r["d1"]), ts(r["fin"]),
               int(r["denom"]), ", ".join(ts(x) for x in lost),
               int(r["people"]), int(r["newcomers"]), once, tip_total, extra,
               ", ".join(streams), ", ".join(attend), tips_body)
        )
    # **据え置いた月は黙らない。** 黙ると「焼いたのだから新しい」と読まれる
    if kept:
        print("投げ銭の取り置き（%s）が無いので、焼いてあるものを据え置いた月: %s"
              % (tips_dir, " ".join(kept)))
    # **新しい月が上。** 開いた人がまず見たいのは、いちばん近い月
    return HEADER + "\n".join(reversed(body)) + FOOTER


HEADER = '''/**
 * 月ごとのふりかえり。**手で直さない。**
 * `python/build_monthly.py` が BigQuery と投げ銭ランキングから焼く。
 *
 * ## 期間は「前回の月末配信の日 〜 今回の月末配信の前日」
 *
 * 「月初〜月末」ではない（`docs/island-money.md` 5章）。
 * 月末配信の日は暦から当たらないので（実測で最終日だったのは9回中1回）、
 * 焼くほうの `FINALS` に書いてある。
 *
 * ## 額は貢献額だけ
 *
 * `tips` に入っているのは **貢献額（スパチャ ÷ 2 + Doneru）** で、
 * 実額ではない。式は `python/fund_box.py` の `viewer_yen()` ひとつ。
 * **月ごとの面は、実額を出さない決めの唯一の例外**（`docs/island-money.md` 2章）。
 * ここの値を島のほかの面へ持ち出さない。
 *
 * ## 出席は日ごと・分母は配信のあった日数
 *
 * `attend` が持つのは「何日来たか」だけ。**個人別のコメント数は持たない**
 * （`/monthly-review` 3章。嫌がる人が多い）。`lost` はコメントの残っていない
 * 配信日で、その日は**当時すでに来ていた人を出席扱い**にしてある。
 */

/** その月の配信1本。`t` は始まった時刻（JST の HH:MM）、`d` は配信日。 */
export type MonthStream = {
  d: string;
  t: string;
  title: string;
  /** YouTube の videoId */
  v: string;
  /** その配信でコメントを書いた人の数。**1人ずつの数ではない** */
  p: number;
};

/**
 * 出席。`n` は呼び名、`d` は来た日数、`i` はキャラクターの絵の id。
 * **2日以上来た人だけ並ぶ**（1日だけの人は `once` の数で出す）。
 */
export type MonthAttend = { n: string; d: number; i?: string };

/** 投げ銭。`r` は順位（同額は同順位）、`y` は**貢献額**。 */
export type MonthTip = { r: number; n: string; y: number; i?: string };

export type Month = {
  /** `2026-01` */
  key: string;
  year: number;
  month: number;
  /** 期間のはじまり（前回の月末配信の日） */
  from: string;
  /** 期間のおわり（今回の月末配信の前日） */
  to: string;
  /** 今回の月末配信の日 */
  final: string;
  /** 出席の分母。期間内に配信があった日数 */
  denom: number;
  /** コメントの残っていない配信日 */
  lost: string[];
  /** その期間にコメントした人の数 */
  people: number;
  /** その期間にはじめてコメントした人の数 */
  newcomers: number;
  /** 1日だけ来てくれた人の数。`attend` には並べない（並べると名簿になる） */
  once: number;
  /** 貢献額の合計 */
  tipTotal: number;
  /** その月の月末配信アーカイブのリアクション数（合算） */
  taps?: number;
  /** 振り返り資料（OBS のページ）。無い月は持たない */
  review?: string;
  streams: MonthStream[];
  attend: MonthAttend[];
  tips: MonthTip[];
};

/** 新しい月が上。 */
export const MONTHS: Month[] = [
'''

FOOTER = """];

/** 毎月ねらっているタップ数。あやと「毎月5万目指してる」。 */
export const TAP_GOAL = 50000;

export const monthOf = (key: string): Month | undefined =>
  MONTHS.find((m) => m.key === key);
"""


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--build", action="store_true")
    ap.add_argument("--sql", action="store_true", help="投げる SQL を出す")
    ap.add_argument("--src", help="BigQuery の代わりに読む取り置き（JSON）")
    ap.add_argument("--tips", default=str(ROOT / "python" / "data" / "monthly_tips"),
                    help="monthly_tips_run の出した JSON の置き場")
    a = ap.parse_args()
    if a.sql:
        print(sql())
        return
    # **`--build` が無ければ1バイトも書かない。** 頭の説明にそう書いてあるのに
    # 判定が無く、引数なしで呼ぶと BigQuery を引いて焼いていた。
    # `rebake.yml` の「焼く」は既定の枝が `python python/<名前>.py` なので、
    # 付け忘れると**書く気の無い回に書く**ことになる（名指しの case を置いてある）
    if not a.build:
        print("::error::何も書いていません。焼くときは --build を付けてください")
        raise SystemExit(2)
    rows = json.loads(Path(a.src).read_text(encoding="utf-8")) if a.src else fetch()
    out = build(rows, Path(a.tips))
    OUT_TS.write_text(out, encoding="utf-8")
    print("%s … %d ヶ月" % (OUT_TS, len(rows)))


if __name__ == "__main__":
    main()
