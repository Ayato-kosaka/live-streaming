"""**非公開だった配信が公開に戻っていたら、`WAITING` に戻して取り込みに渡す。**

**毎晩ひとりでに走る**（`.github/workflows/failed_reentry_nightly.yml`。6章）。
下は、その場で確かめたいとき・先に少しだけ戻したいときの手押し。

    Actions > 管理スクリプトを実行 > script = failed_reentry
    ARGS  {}                        測って数えるだけ（**既定は下見。1バイトも書かない**）
          {"apply": true}           戻せるものを `WAITING` に戻す
          {"apply": true, "limit": 2}  先に少しだけ

終了コード（**下見と apply で意味が違う。下の表のとおり**）

| | 下見（既定） | `{"apply": true}` |
| --- | --- | --- |
| 0 | ぜんぶ測れて、**戻せるものは無かった** | 戻し終えて、数え直しも合った |
| 1 | **戻せるものが見つかった**（`{"apply": true}` で戻す） | 書いたあとの数え直しが合わない／**戻せるものが在るのに今夜の枠に空きが無い** |
| 2 | **数えられていない**（対照が落ちた・測れなかったぶんが残って 0本 と言えない） | 同じ。**1行も書いていない** |

## 何のための道具か（issue #532）

`youtube_chat.videos` の `FAILED` のうち37本は「**非公開（403）でチャットを
引けなかった**」ぶん。**あやとが公開に戻せば引ける。** ところが拾い直す枠
（`python/bq/queries.py` の `QUERY_SELECT_TARGET_VIDEOS`）はこうなっている。

| 枠 | 拾う状態 | 窓 |
| --- | --- | --- |
| `fresh` | `PENDING` / `WAITING` / **`FAILED`** | 7日以内だけ |
| `late` | `PENDING` / `WAITING` | 7日より古いぶん（1晩 `LATE_LANE_MAX_VIDEOS` 本） |

**7日を過ぎた `FAILED` は、どちらの枠にも入らない。** 37本は 2025年〜2026年7月の
配信なので、公開に戻った翌晩も、その次の晩も、永久に拾われない。
**戻す道はあっても、受ける道がない。**

ここがその受け口。**枠のほうは1行も変えない**（今夜も無人で走るものなので、
同じ日に2度触らない）。状態を `WAITING` に戻すだけで、あとは既存の `late` の枠が
翌晩に拾う。拾ったあとは `handle_failure` / `handle_no_chat_file` が必ず
「7日超」と判定するので、**1本につき1回試して `SUCCEEDED` か `SKIPPED` で終わる。**
`WAITING` には戻らないし、溜まらない。

## 1. 公開に戻ったことを、どうやって知るか

**測るのは `python/dead_stream_watch.py` の目そのもの。** oembed で1段目、
`youtubei/v1/player` で2段目——毎晩 `build_dead_streams.py` が714本に当てている
のと**同じ関数**を呼ぶ（`probe_all`）。判定器は増やさない。

**ただし、あの毎晩のぶんは覆いきれない。** あれが見ているのは
「島が名指ししている714本」で、37本のうち島に出ているのは15本。
残り22本は**どの焼き込みにも出てこない**ので、毎晩の測りには一度も入らない。
だからここは**候補を自分で列挙して、自分で測る。**

  - 覆う相手を広げるだけで、**測りかたは借りたまま**
  - 毎晩ではなく**人が押したときだけ**測る（37本で2〜3分）。37本を毎晩
    ぶら下げると、`#521` で潰した「毎晩赤い見張りは誰も読まない」に戻る

戻すのは**2段とも通ったものだけ**（`OK`）。1段目が 200 でも、2段目が
「録画が無い」と言うものは戻さない——チャットも残っていないので、
枠を1本使って `SKIPPED` になるだけ。

## 2. 拾う相手は `FAILED` だけではない（`SKIPPED` も見る）

戻したものが翌晩の取り込みでこけると、`handle_failure` が7日超と判定して
**`SKIPPED`（終端）に落とす。** `FAILED` だけを見ていると、**一度戻して
取りこぼした配信が、二度とここに出てこない。**

だから引くのは **`FAILED` と `SKIPPED` の、非公開の印を持つ行**。
印は `failed_terminate.PRIVATE` から**借りる**。2か所に書くと、片方だけ
直した日に取り違える（あちらは「非公開を絶対に終端へ落とさない」ために
同じ印を使っている。**向きは逆だが、見ているものは同じ**）。

## 3. 戻したものが、本物の取りこぼしを押し出さないようにする

`late` の枠は1晩 `LATE_LANE_MAX_VIDEOS` 本で、並びは `first_seen_at ASC`。
戻した37本は**どれも古い**ので、そのまま全部戻すと**枠の先頭に居座って、
本物の取りこぼしを2晩ぶん押し出す**（`docs/island-misses.md` #149 が、
まさにその押し出しを1件見つけた回）。

だから戻す本数は、**今夜の枠の空きぶんだけ。**

  1. **本物の `QUERY_SELECT_TARGET_VIDEOS` をそのまま流して**、今夜 `late` から
     何本出るかを数える（#149 の決めごと「絞りのある仕組みで『動いていない』と
     言う前に、その晩に絞りが何本出したかを数える」。**枠の定義を書き写さない**）
  2. 空き＝`LATE_LANE_MAX_VIDEOS` − その本数
  3. そのうえで**1回 `MAX_PER_RUN` 本まで。** 空きが 20本あっても一度には戻さない。
     押すのは人なので、続きは押し直せばよい。枠に余白を残しておく

枠が測れなかったら（口が落ちた・SQL が通らない）、**空きを 0 と読んで書かない。**
「測れなかった」を「空いていた」と読むと、そこが押し出しの元になる
（`docs/island-standards.md` §10）。

## 4. 縛り

- **既定は下見。1バイトも書かない。** 下見のあいだは `SELECT` 以外を
  **口のところで塞ぐ**（`_ReadOnlyClient`。呼ぶ側に `if apply:` を書き忘れても止まる）
- **対照を、本物を1行も読む前に回す。** 1つでも外れたら本物の数字を出さずに 2
  （`drill()` と、測る側の `dead_stream_watch.run_control()`）
- **公開ログに素性を出さない。** 出るのは件数・状態・日付・`video_id` だけ。
  `video_id` は島の画面に出ている公開の値。**題名は1列も引かない**し、
  `last_error_detail` も印字しない。ARGS にも名前を取らない
- 書き換えるのは **`status` と `next_retry_at` の2つだけ。**
  `attempt_count` / `last_attempt_at` は動かさない（**試していないから**）。
  `last_error_code` / `last_error_detail` も残す——`WAITING` は「次の晩に
  もう一度試す」という状態であって「何も起きなかった」ではない
  （`mark_video_waiting` が 2026-09-18 に同じ形へ直っている。#123 の決めごと13）

## 5. 対照（`docs/island-standards.md` §15）

**答えの分かっている仕込みで、自分を先に試す**（`drill()`）。本物の SQL を
sqlite に直して、本番と同じ形の表に当てる。

| | 見るもの | 抜ける足 |
| --- | --- | --- |
| A | 非公開の印を持つ `FAILED` / `SKIPPED` **だけ**を id まで一致で拾う | `select` |
| B | 戻すのは `OK` だけ（非公開・録画なし・消えた・測れずは戻さない） | `kind` |
| C | 枠の空きぶんしか戻さない（空き0なら0本／1回 `MAX_PER_RUN` 本まで） | `cap` |
| D | 測れなかったぶんが残っていたら「戻すものは無い」と**言わない**（2） | `blind` |
| E | 同値の組を入れる順を変えても、**選ぶ顔ぶれが変わらない**（#149） | `order` |
| F | 下見のあいだ、`UPDATE` が**口のところで止まる** | `dry` |

`BREAK=select|kind|cap|blind|order|dry` で足を1本だけ抜ける。
**抜いた足の対照が必ず落ちる**ことを `failed_reentry_selftest.py` が毎回見る
（#128 の決めごと1。「6つ当てた」は、6つが同じ足を折っているなら1つ）。
**「その1つだけが落ちる」ではない**——足を抜くと巻き添えで落ちる対照もある
（`cap` を抜くと C のほかに E も落ちる）。見るのは
**どの足を抜いても、必ず対応する対照が落ちること。**

## 6. 毎晩ひとりでに走る（2026-09-19 から）

`.github/workflows/failed_reentry_nightly.yml` が、`Fetch Doneru Donations` の
完了に `workflow_run` で繋いで**毎晩 `{"apply": true}` で回す**（cron は保険）。
**手で押す道はそのまま**（`run_admin_script.yml` から `script = failed_reentry`。
そちらの既定は下見）。

手で押すだけの形をやめたのは、**あやとが公開に戻しても、誰かが押すまで永久に
戻ってこない**から。赤くならない——画面に配信が1本出ないだけで、run はどこも
緑で終わる。「鳴る仕組みが構造的に鳴りえない」形だった。

繋ぎ先を1本にしてあるのと、`rebake.yml` の step にしなかった理由は、
あちらのファイルの頭に測った数字ごと書いてある。要点だけ:

  - 晩に2回走ると、外当てが倍になり、**枠も1晩10本ぶん**食う（3章の決めが崩れる）
  - `rebake` は `site/content/` を焼いて master に push し Hosting まで配る。
    直近11回のうち7回が赤で、相乗りすると**こちらの赤が見分けられない**

**上限（`MAX_PER_RUN`）と枠の空きは、繋いでも1バイトも変えていない。**
毎晩ぶんの ARGS に `limit` を渡さないのも同じ理由で、何本戻すかの決めを
ワークフロー側に散らさない。ここを見張るのは:

  - `python/admin/failed_reentry_selftest.py` の 14〜16
    （**ワークフローの字から ARGS を取り出して**、本物を回す）
  - `python/failed_reentry_nightly_selftest.py`
    （繋ぎ先の `name:`・繋ぎの本数・毎晩ぶんの既定・`continue-on-error` の隠し）
"""

import os
import re
import sqlite3
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from config import (  # noqa: E402
    BQ_DATASET,
    BQ_PROJECT_ID,
    BQ_TABLE_VIDEOS,
    LATE_LANE_MAX_VIDEOS,
    MAX_RETRY_PERIOD_SECONDS,
    MAX_VIDEOS_PER_RUN,
)
from bq.queries import QUERY_SELECT_TARGET_VIDEOS  # noqa: E402

import dead_stream_watch as watch  # noqa: E402
from _fs import args, log  # noqa: E402

# **非公開の印は、ここで持たない。** `failed_terminate` が「非公開を終端へ
# 落とさない」ために使っている印を、そのまま借りる。同じ字を2か所に書くと、
# 片方だけ直した日に取り違える。あちらを消すなら、ここも一緒に見直すこと
# （消せば `failed_reentry_selftest.py` が赤くなる。黙って外れはしない）
from failed_terminate import PRIVATE  # noqa: E402

TABLE = f"{BQ_PROJECT_ID}.{BQ_DATASET}.{BQ_TABLE_VIDEOS}"

# 拾う状態。**`SKIPPED` も見る**（頭の2章）
CANDIDATE_STATUS = ("FAILED", "SKIPPED")

# 1回の実行で戻す本数の上限。**枠（1晩 20本）を一度に埋めない。**
# 押すのは人なので、続きは押し直せばよい。ここを 20 にすると、押した翌晩の
# 枠が戻したぶんで埋まり、本物の取りこぼしが1晩ぶん後ろへ回る（#149）
MAX_PER_RUN = 5

# 戻してよい測定結果。**2段とも通ったものだけ**
BACK = watch.OK

# 測った結果の振り分け。**「まだ非公開」と「測れなかった」を混ぜない**
BUCKETS = ("back", "private", "norec", "gone", "blind")
BUCKET_LABEL = {
    "back": "**公開に戻っていた**（押せば見られる）",
    "private": "まだ非公開・ログインが要る（あやとが戻すのを待つ）",
    "norec": "公開だが**録画が無い**（チャットも残っていない。戻さない）",
    "gone": "消えている（404。戻らない）",
    "blind": "**測れなかった**（0本ではない。届かなかっただけかもしれない）",
}

# 足の名前。**知らない名前を渡したら落とす**（書き間違いで対照が黙らないように）
LEGS = ("select", "kind", "cap", "blind", "order", "dry")


def leg() -> str:
    """いま抜いている足。`BREAK=` で渡す。ふだんは空。"""
    b = (os.getenv("BREAK") or "").strip()
    if b and b not in LEGS:
        raise SystemExit(f"BREAK に使えるのは {', '.join(LEGS)} だけです: {b}")
    return b


# ============================================================================
# SQL。**題名は1列も引かない**（ログは公開）
# ============================================================================

def where_candidate() -> str:
    """拾う相手。**非公開の印を持つ `FAILED` / `SKIPPED`。**"""
    states = ", ".join(f"'{s}'" for s in CANDIDATE_STATUS)
    if leg() == "select":
        # 足を抜いた写し。非公開の印を見ていない
        return f"status IN ({states})"
    return f"status IN ({states}) AND ({PRIVATE})"


def select_sql() -> str:
    """候補を引く。並びは #149 と同じで、**一意に決まるところまで**書く。"""
    return f"""
SELECT
  video_id,
  status,
  first_seen_at,
  last_attempt_at,
  attempt_count,
  last_error_code
FROM `{TABLE}`
WHERE {where_candidate()}
ORDER BY
  first_seen_at ASC,
  last_attempt_at ASC,
  video_id ASC
"""


def update_sql(ids: list[str]) -> str:
    """`WAITING` に戻す。**触るのは `status` と `next_retry_at` だけ。**

    `next_retry_at` を NULL にするのは、`late` の枠が
    「`next_retry_at` が NULL、または現在時刻以前」しか見ないため。
    `attempt_count` も `last_error_code` も動かさない（頭の4章）。
    """
    bad = [v for v in ids if not watch.ID_RE.fullmatch(v)]
    if bad:
        raise ValueError(f"配信IDの形（11字）でないものが混ざっています: {' '.join(bad)}")
    listed = ", ".join(f"'{v}'" for v in ids)
    return f"""
UPDATE `{TABLE}`
SET status = 'WAITING', next_retry_at = NULL
WHERE video_id IN ({listed})
  AND {where_candidate()}
"""


# **枠の混み具合は、枠そのものに聞く。** 条件を書き写すと、あちらが変わった
# 日に黙ってずれる（#149 の決めごと。数えかたは `ingest_watch.lane_last_night`）。
# 本物の `QUERY_SELECT_TARGET_VIDEOS` をそのまま内側に置いて、
# 「今夜出るぶんのうち、窓の外から来たのは何本か」だけを数える。
# **題名も1件も外へ出さない**（数えるだけ）
LANE_SQL = f"""
SELECT
  COUNTIF(
    first_seen_at IS NULL
    OR first_seen_at < TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL {MAX_RETRY_PERIOD_SECONDS} SECOND)
  ) AS late_n,
  COUNT(*) AS all_n
FROM (
{QUERY_SELECT_TARGET_VIDEOS}
)
"""

CENSUS_SQL = f"""
SELECT status, COUNT(*) AS n
FROM `{TABLE}`
GROUP BY status
ORDER BY status
"""


# ============================================================================
# 判定。**口を持たないので、仕込んだ行で手元から当てられる**（#123 の決めごと4）
# ============================================================================

def order_key(row: dict) -> tuple:
    """並べる鍵。**同値でも一意に決まるところまで**（#149）。

    `str()` を通すのは、BigQuery が `datetime`、sqlite が文字を返すから。
    どちらも同じ源の中では ISO の形なので、字で並べても順が変わらない。
    """
    return (str(row.get("first_seen_at") or ""),
            str(row.get("last_attempt_at") or ""),
            str(row.get("video_id")))


def sift(rows: list[dict], probes: dict) -> dict[str, list[str]]:
    """測った結果を振り分ける。**「まだ非公開」と「測れなかった」を混ぜない。**

    Args:
        rows: 候補の行
        probes: 配信ID -> `dead_stream_watch.Probe`

    Returns:
        振り分けの名前 -> 配信IDの一覧（並びは `order_key`）
    """
    out: dict[str, list[str]] = {k: [] for k in BUCKETS}
    for row in sorted(rows, key=order_key):
        vid = row["video_id"]
        p = probes.get(vid)
        kind = p.kind if p is not None else watch.BLIND
        if leg() == "kind":
            # 足を抜いた写し。**消えたもの以外を戻してしまう**
            out["back" if kind != watch.GONE else "gone"].append(vid)
            continue
        if kind == BACK:
            out["back"].append(vid)
        elif kind in (watch.PRIVATE, watch.LOGIN):
            out["private"].append(vid)
        elif kind == watch.NO_REC:
            out["norec"].append(vid)
        elif kind == watch.GONE:
            out["gone"].append(vid)
        else:
            # `BLIND` と、見たことのない返り（`OTHER`）。**0本と言わない**
            out["blind"].append(vid)
    return out


def room(lane_busy: int | None) -> int:
    """今夜の枠に、あと何本入れてよいか。

    Args:
        lane_busy: 今夜 `late` の枠から出るぶん（測れていなければ None）

    Returns:
        戻してよい本数。**測れていなければ 0**（空いていると読まない）
    """
    if leg() == "cap":
        # 足を抜いた写し。枠を見ずに何本でも戻す
        return 10 ** 6
    if lane_busy is None:
        return 0
    free = max(0, LATE_LANE_MAX_VIDEOS - lane_busy)
    return min(MAX_PER_RUN, free)


def plan(rows: list[dict], probes: dict, lane_busy: int | None,
         limit: int | None = None) -> tuple[list[str], dict[str, list[str]], int]:
    """戻す相手を決める。**読むだけ。**

    Returns:
        (今回戻す配信ID, 振り分け, 今回の上限)
    """
    got = sift(rows, probes)
    cap = room(lane_busy)
    if limit is not None:
        cap = min(cap, max(0, limit))
    back = got["back"]
    if leg() == "order":
        # 足を抜いた写し。**入ってきた順のまま**選ぶ（同値の組で顔ぶれが変わる）
        back = [r["video_id"] for r in rows if r["video_id"] in set(got["back"])]
    return back[:cap], got, cap


def verdict(got: dict[str, list[str]]) -> int:
    """下見の終了コード。**「0本」と「測れていない」を分ける。**

    見つかったものが1本でもあれば 1（測れなかったぶんが混ざっていても、
    見つかった本数は本物）。0本のまま測れなかったぶんが残っていたら 2
    ——`dead_stream_watch.py` と同じ決め。
    """
    if got["back"]:
        return 1
    if got["blind"] and leg() != "blind":
        return 2
    return 0


# ============================================================================
# 下見のあいだ、書く口を塞ぐ（**塞ぐのは口であって、判断ではない**）
# ============================================================================

class ReadOnly(Exception):
    """下見のつもりで、書きに行った。"""


class _ReadOnlyClient:
    """`SELECT` 以外を口のところで止める写し（`failed_terminate` と同じ筋）。"""

    def __init__(self, inner):
        self._inner = inner

    def query(self, sql, *a, **k):
        head = "\n".join(
            ln for ln in sql.splitlines() if not ln.strip().startswith("--")
        ).strip().upper()
        if not head.startswith("SELECT"):
            raise ReadOnly("下見では表に書けません（SELECT ではない問い合わせ）")
        return self._inner.query(sql, *a, **k)


# ============================================================================
# 測る。**`dead_stream_watch` の目をそのまま借りる**（判定器を2つ持たない）
# ============================================================================

def control() -> tuple[bool, list[str]]:
    """測る側の対照。**本物を1本も測る前に、両側から当てる。**"""
    return watch.run_control(deep=True)


def measure(vids: list[str]) -> dict:
    """候補を測る。1段目（oembed）を全部に、2段目（player）は 200 のものだけに。"""
    return watch.probe_all(vids, deep=True, quiet=False)


# ============================================================================
# 対照。**本番を1行も引く前に回す**
# ============================================================================

COLUMNS = (
    "video_id", "status", "first_seen_at", "next_retry_at", "attempt_count",
    "last_attempt_at", "last_error_code", "last_error_detail",
)

# 仕込みの `last_error_detail`。**本番から写した字**（id だけ差し替え）
DETAIL = {
    "private": "yt-dlp 終了コード 1\nERROR: [youtube] {id}: Video unavailable. This video is private\n",
    "norec": "yt-dlp 終了コード 1\nERROR: [youtube] {id}: This live stream recording is not available.\n",
    "nochat": "チャットファイルが生成されませんでした",
}


def to_sqlite(sql: str) -> str:
    """この箱の sqlite で回る形に直す。**直しきれない書き方が残ったら落とす。**

    書き換えた SQL を測っても、本物を確かめたことにはならない。知らない
    書き方が入ったら、素通しせずにここで止める。
    """
    out = re.sub(r"`[^`]*\.?videos`", "videos", sql)
    left = re.search(r"TIMESTAMP_\w+|INTERVAL|CURRENT_TIMESTAMP|COUNTIF|SAFE[._]|`|@", out)
    if left:
        raise SystemExit(
            f"この対照が知らない書き方が SQL に入っています: {left.group(0)}\n"
            f"{__file__} の to_sqlite に足してください（足さずに素通りさせない）"
        )
    return out


def _row(vid: str, status: str, kind: str | None,
         seen: str = "2026-02-01 00:00:00", tried: str | None = "2026-02-01 01:00:00") -> tuple:
    """仕込みの1行。`kind` が None なら理由を持たない。"""
    code = None
    if kind == "nochat":
        code = "NO_CHAT_FILE"
    elif kind is not None:
        code = "YTDLP_FAILED"
    detail = DETAIL[kind].format(id=vid) if kind is not None else None
    return (vid, status, seen, None, 1, tried, code, detail)


def fixture() -> tuple[list[tuple], set[str]]:
    """本番と同じ形の表と、**そこから拾うべき id の集合。**"""
    rows: list[tuple] = []
    want: set[str] = set()
    for i in range(4):
        vid = f"PRIV{i:07d}"
        rows.append(_row(vid, "FAILED", "private"))
        want.add(vid)
    # 一度戻して、翌晩の取り込みでこけたぶん。**ここも拾う**（頭の2章）
    rows.append(_row("PRIVSKIP00A", "SKIPPED", "private"))
    want.add("PRIVSKIP00A")
    # 拾ってはいけないもの
    rows.append(_row("NOCHAT0000A", "FAILED", "nochat"))     # 理由が違う
    rows.append(_row("NOREC00000A", "FAILED", "norec"))      # 理由が違う
    rows.append(_row("PRIVWAIT00A", "WAITING", "private"))   # もう枠に居る
    rows.append(_row("SUCCEEDED0A", "SUCCEEDED", None))
    return rows, want


def run_sqlite(rows: list[tuple]) -> list[dict]:
    """仕込みの表に、**本物の SELECT** を当てる。"""
    con = sqlite3.connect(":memory:")
    con.execute("CREATE TABLE videos (" + ", ".join(COLUMNS) + ")")
    con.executemany(
        "INSERT INTO videos VALUES (" + ", ".join("?" * len(COLUMNS)) + ")", rows)
    cur = con.execute(to_sqlite(select_sql()))
    names = [d[0] for d in cur.description]
    return [dict(zip(names, r)) for r in cur.fetchall()]


def _probes(kinds: dict) -> dict:
    """仕込みの測定結果。"""
    return {v: watch.Probe(v, k, "（仕込み）") for v, k in kinds.items()}


def drill() -> bool:
    """対照。**本番を1行も引く前に回す。** 通れば True。"""
    ok = True

    def ck(name: str, good: bool, saw) -> None:
        nonlocal ok
        log.info("  %s %s（%s）", "OK  " if good else "NG  ", name, saw)
        if not good:
            ok = False

    log.info("[対照] 答えの分かっている仕込みで、自分を先に試す")

    # A: 非公開の印を持つ FAILED / SKIPPED だけを拾う
    rows, want = fixture()
    got = run_sqlite(rows)
    ids = {r["video_id"] for r in got}
    ck("A 非公開の印のある FAILED / SKIPPED だけを拾う", ids == want,
       f"{len(ids)} 本 / 想定 {len(want)} 本")

    # B: 戻すのは OK だけ
    kinds = {
        "PRIV0000000": watch.OK,        # 公開に戻った
        "PRIV0000001": watch.PRIVATE,   # まだ非公開
        "PRIV0000002": watch.NO_REC,    # 公開だが録画が無い
        "PRIV0000003": watch.GONE,      # 消えた
        "PRIVSKIP00A": watch.BLIND,     # 測れなかった
    }
    bag = sift(got, _probes(kinds))
    ck("B 戻すのは「押せば見られる」ものだけ", bag["back"] == ["PRIV0000000"],
       f"戻す {len(bag['back'])} 本")
    ck("B 非公開・録画なし・消えた・測れずは戻さない",
       (bag["private"], bag["norec"], bag["gone"], bag["blind"])
       == (["PRIV0000001"], ["PRIV0000002"], ["PRIV0000003"], ["PRIVSKIP00A"]),
       " / ".join(f"{k} {len(bag[k])}" for k in BUCKETS if k != "back"))

    # C: 枠の空きぶんしか戻さない
    many = [_row(f"BACK{i:07d}", "FAILED", "private") for i in range(12)]
    mrows = run_sqlite(many)
    mprobes = _probes({r["video_id"]: watch.OK for r in mrows})
    full, _, _ = plan(mrows, mprobes, lane_busy=LATE_LANE_MAX_VIDEOS)
    ck("C 枠が埋まっている晩は1本も戻さない", full == [], f"{len(full)} 本")
    tight, _, _ = plan(mrows, mprobes, lane_busy=LATE_LANE_MAX_VIDEOS - 3)
    ck("C 空きが3本なら3本だけ", len(tight) == 3, f"{len(tight)} 本")
    free, _, cap = plan(mrows, mprobes, lane_busy=0)
    ck("C 空いていても1回 %d 本まで" % MAX_PER_RUN,
       len(free) == MAX_PER_RUN and cap == MAX_PER_RUN, f"{len(free)} 本")
    unknown, _, _ = plan(mrows, mprobes, lane_busy=None)
    ck("C 枠が測れなかった回は1本も戻さない", unknown == [], f"{len(unknown)} 本")

    # D: 測れなかったぶんが残っていたら「戻すものは無い」と言わない
    blind_only = sift(got, _probes({r["video_id"]: watch.BLIND for r in got}))
    ck("D 測れなかっただけの回は 2（0本と言わない）", verdict(blind_only) == 2,
       f"終了コード {verdict(blind_only)}")
    all_seen = sift(got, _probes({r["video_id"]: watch.PRIVATE for r in got}))
    ck("D ぜんぶ測れて戻すものが無ければ 0", verdict(all_seen) == 0,
       f"終了コード {verdict(all_seen)}")

    # E: 同値の組を入れる順を変えても、顔ぶれが変わらない（#149）
    same = [_row(f"TIE{i:08d}", "FAILED", "private", seen="2026-05-30 10:05:41",
                 tried=None) for i in range(12)]
    srows = run_sqlite(same)
    sprobes = _probes({r["video_id"]: watch.OK for r in srows})
    one, _, _ = plan(srows, sprobes, lane_busy=0)
    two, _, _ = plan(list(reversed(srows)), sprobes, lane_busy=0)
    ck("E 同値の組は、入れる順を変えても同じ顔ぶれ", one == two and len(one) == MAX_PER_RUN,
       f"{len(one)} 本 / 一致 {one == two}")

    # F: 下見のあいだ、UPDATE が口のところで止まる
    ck("F 下見では UPDATE が通らない", dry_blocks(), "止まる" if dry_blocks() else "**通ってしまった**")

    if not ok:
        log.error("対照が落ちました。本番の表は1行も引きません")
    return ok


def dry_blocks() -> bool:
    """下見の写しが、本当に `UPDATE` を止めるか。"""
    class _Boom:
        def query(self, sql, *a, **k):
            raise AssertionError("下見なのに本物の口へ抜けました")

    if leg() == "dry":
        return False  # 足を抜いた写し。塞ぎが無い
    try:
        _ReadOnlyClient(_Boom()).query(update_sql(["PRIV0000000"]))
    except ReadOnly:
        return True
    except AssertionError:
        return False
    return False


# ============================================================================
# 本番を読む
# ============================================================================

def census(client) -> dict[str, int]:
    """状態ごとの本数。**書く前と書いたあとで、これを並べて見る。**"""
    out = {r["status"]: r["n"] for r in [dict(x) for x in client.query(CENSUS_SQL).result()]}
    log.info("いまの表: %s", " / ".join(f"{k} {v}" for k, v in sorted(out.items())))
    return out


def lane_busy(client) -> int | None:
    """今夜 `late` の枠から出るぶん。**測れなければ None**（空きは 0 と読む）。"""
    from google.cloud import bigquery

    cfg = bigquery.QueryJobConfig(query_parameters=[
        bigquery.ScalarQueryParameter("max_videos", "INT64", MAX_VIDEOS_PER_RUN),
        bigquery.ScalarQueryParameter("max_late_videos", "INT64", LATE_LANE_MAX_VIDEOS),
    ])
    try:
        got = [dict(r) for r in client.query(LANE_SQL, job_config=cfg).result()]
    except Exception as e:  # 口が落ちた・SQL が通らない。**空いていると読まない**
        # 文面に載るのは SQL と列の名前だけ（素性は1つも通らない）。
        # **黙って 0 本と読まない**ように、何で落ちたかは出す
        log.error("今夜の枠が数えられませんでした（%s: %s）。**空きは 0 と読みます**",
                  type(e).__name__, str(e)[:200].replace("\n", " "))
        return None
    if not got:
        log.error("今夜の枠を数える問い合わせが1行も返しませんでした")
        return None
    late_n, all_n = int(got[0]["late_n"]), int(got[0]["all_n"])
    log.info("今夜の取り込みが拾うぶん: %d 本（うち窓の外の枠から %d 本 / 上限 %d 本）",
             all_n, late_n, LATE_LANE_MAX_VIDEOS)
    return late_n


def show(rows: list[dict], bag: dict[str, list[str]], todo: list[str], cap: int) -> None:
    """数える。**題名も理由の本文も出さない**（ログは公開）。"""
    at = {r["video_id"]: r for r in rows}
    log.info("%s", "─" * 68)
    log.info("非公開で取れなかった配信: %d 本（FAILED / SKIPPED）", len(rows))
    for k in BUCKETS:
        log.info("  %-8s %3d 本  %s", k, len(bag[k]), BUCKET_LABEL[k])
    if bag["back"]:
        log.info("%s", "─" * 68)
        log.info("**公開に戻っていた %d 本**", len(bag["back"]))
        for vid in bag["back"]:
            r = at.get(vid, {})
            log.info("  %s  %-9s  見つけた日 %s  試行 %s 回",
                     vid, r.get("status"), str(r.get("first_seen_at"))[:10],
                     r.get("attempt_count"))
    if bag["blind"]:
        log.info("  **測れなかった %d 本**: %s", len(bag["blind"]), " ".join(bag["blind"]))
    log.info("%s", "─" * 68)
    log.info("今回戻せる上限: %d 本 / 実際に戻す: %d 本", cap, len(todo))
    if len(bag["back"]) > len(todo):
        log.info("  あと %d 本は次の回に回します（枠を一度に埋めないため）",
                 len(bag["back"]) - len(todo))


def main() -> int:
    """エントリポイント。**既定は下見。**"""
    a = args()
    apply = bool(a.get("apply"))
    limit = a.get("limit")
    limit = int(limit) if isinstance(limit, (int, float)) and not isinstance(limit, bool) else None

    # **本物を1行も読む前に、両側から自分を試す**（`docs/island-standards.md` §15）
    if not drill():
        return 2
    log.info("[対照] 測る側（dead_stream_watch）を、生きた配信と死んだ配信で試す")
    ok, lines = control()
    for ln in lines:
        log.info("%s", ln)
    if not ok:
        log.error("測る側の対照が落ちました。**本番の数字は1つも出しません**")
        return 2

    from google.cloud import bigquery  # 読み込みは呼ばれたときに（_fs.db と同じ筋）

    client = bigquery.Client(project=BQ_PROJECT_ID)
    if not apply:
        # **下見のあいだは、書く口そのものを塞ぐ**（判断に頼らない）
        client = _ReadOnlyClient(client)

    before = census(client)
    rows = [dict(r) for r in client.query(select_sql()).result()]
    if not rows:
        log.info("非公開で取れなかった配信は1本もありません。やることはありません")
        return 0

    busy = lane_busy(client)
    log.info("%d 本を測ります（1段目 oembed → 2段目 player。2〜3分）", len(rows))
    probes = measure([r["video_id"] for r in rows])
    missing = [r["video_id"] for r in rows if r["video_id"] not in probes]
    if missing:
        log.error("渡した %d 本のうち %d 本の答えが返っていません。**数えられていません**",
                  len(rows), len(missing))
        return 2

    todo, bag, cap = plan(rows, probes, busy, limit)
    show(rows, bag, todo, cap)

    code = verdict(bag)
    if not apply:
        log.info("%s", "─" * 68)
        after = census(client)
        if after != before:
            log.error("下見のあいだに表が動きました。**書いてはいませんが、数え直してください**")
            log.error("  前: %s", before)
            log.error("  後: %s", after)
            return 2
        log.info("**前後で状態ごとの本数が同じです。1バイトも書いていません**")
        if code == 1:
            log.info('戻すには {"apply": true} を付けてください')
        elif code == 2:
            log.info("測れなかったぶんが残っています。**「0本」とは言えません**（押し直してください）")
        else:
            log.info("戻せるものはありません（ぜんぶ測れて、まだ非公開のままです）")
        return code

    if not todo:
        log.info("戻すものがありません。**1行も書いていません**")
        if code == 2:
            return 2
        if bag["back"]:
            # 戻せるものは在るのに、今夜の枠に空きが無い（または枠が測れなかった）。
            # **「やることなし」ではない。** 空いた日にもう一度押す
            log.error("戻せるものが %d 本ありますが、今夜の枠に空きがありません",
                      len(bag["back"]))
            return 1
        return 0

    job = client.query(update_sql(todo))
    job.result()
    wrote = job.num_dml_affected_rows
    log.info("%d 行を WAITING に戻しました", wrote)

    # 書いたあとに数え直す。**噛み合っていなければ 1 で落ちる**
    left = {r["video_id"] for r in [dict(x) for x in client.query(select_sql()).result()]}
    after = census(client)
    bad = []
    if wrote != len(todo):
        bad.append(f"書いた数が合いません（{wrote} 行 / 頼んだのは {len(todo)} 本）")
    still = sorted(set(todo) & left)
    if still:
        bad.append(f"戻したはずの {len(still)} 本が、まだ候補に残っています: {' '.join(still)}")
    if after.get("WAITING", 0) - before.get("WAITING", 0) != wrote:
        bad.append("WAITING の増えかたが、書いた数と合いません")
    if bad:
        for b in bad:
            log.error("  合いません: %s", b)
        return 1
    log.info("**次の晩の取り込みが、窓の外の枠で拾います**"
             "（1本につき1回試して SUCCEEDED か SKIPPED で終わります）")
    if len(bag["back"]) > len(todo):
        log.info("残り %d 本は、もう一度押してください", len(bag["back"]) - len(todo))
    return 0


if __name__ == "__main__":
    sys.exit(main())
