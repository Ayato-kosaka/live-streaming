"""**`FAILED` のうち、二度と試す先が無い26本を `SKIPPED`（終端）へ落とす。**

    Actions > 管理スクリプトを実行 > script = failed_terminate
    ARGS  {}                何本を、どの理由で、どう変えるかを出すだけ（**既定は下見**）
          {"apply": true}   実際に書く

終了コード 0=通った / 1=書いたあとの数え直しが合わない / **2=対照が落ちた・
数が合わない**（`docs/island-standards.md` §15）。**2 のときは1行も書いていない。**

## なぜ要るのか（`docs/island-misses.md` #123）

拾い直す枠（`python/bq/queries.py`）に入るのは `PENDING` / `WAITING` だけで、
7日以内の枠は `FAILED` も見るが7日で切れる。つまり
**7日を過ぎた `FAILED` は、拾い直されもせず `SKIPPED` にも落ちない。**
63本が、出口の無いところに半年居た。

63本の理由は 2026-09-18 に全部あててある（#123 の「追記・その3」）。
**再取得で直るものは0本だった。**

| 理由 | 本数 | 実測 |
| --- | --- | --- |
| 非公開 | 37 | 37本とも 403 のまま |
| `NO_CHAT_FILE` | 20 | 20本とも録画に `live_chat` のトラックが無い |
| 録画が無い | 3 | 戻らない |
| 配信前に当てた | 2 | 1本は 404、1本は録画なし。戻らない |
| 削除ずみ | 1 | 戻らない |

**戻らないと分かっている26本を、理由を持たせたまま `SKIPPED` に落とす。**
`FAILED` は「また試すかもしれない」という意味の状態なのに、この26本には
二度と試す先が無い（#123 の決めごと8「終わりのない状態を作らない」）。
落とせば `WAITING` の側で既に動いている決めごと（`handle_no_chat_file` が
7日超で `SKIPPED` に落とす）と**同じ形**になり、状態の意味が表の中で1つに揃う。

## 非公開の37本は触らない

**ここがいちばん危ない取り違え。** 非公開はあやとが公開に戻せる。
`SKIPPED` に落としてしまうと、戻した日に島が知らないまま隠し続けることになる
（#139 で、焼き込みの取り置きに 403 を入れないと決めたのと同じ理由）。
戻ったときに拾い直す道は別に決める。

だから引く条件は「終端の理由のどれかに当たる」だけでは足りない。
**`NOT (非公開)` を必ず先に掛ける**（`where_terminal()`）。
そのうえで CASE は非公開を先頭に置き、**CASE の理由と WHERE の選びが
1行でも食い違ったら書かない**（`disagreements()`）。片方だけ直した日に、
黙って非公開が混ざらないようにするため。

## 消さないもの

- `last_error_code` / `last_error_detail` は**そのまま残す。**
  「なぜ終わったか」が消えると、半年後に数える人がまた測り直すことになる
  （#123 の決めごと13。実際に今日それをやった）
- `attempt_count` / `last_attempt_at` も動かさない。**試していないから。**
  書き換えるのは `status` と、終端が持たない `next_retry_at` の2つだけ
  （本番の `FAILED` 63本は既に全部 NULL。`mark_video_skipped` と形を揃える）

## 数が合わなかったら書かない

いま26本のはず。**引いた数が1本でも違ったら、1行も書かずに 2 で落ちる。**
表は毎晩動くので、黙って違う本数に手を入れない。想定は `WANT`（下）に
理由ごとに置いてある。**本数が変わったなら、まず測り直す。**

## 対照（`docs/island-standards.md` §15）

**本番を1行も引く前に、答えの分かっている仕込みで自分を試す**（`drill()`）。
本物の SQL を sqlite に直して、本番と同じ形の表に当てる。

| | 見るもの | 落ちたら |
| --- | --- | --- |
| A | 本番と同じ形（20/3/1/2/37）から、**26本ちょうど**を id まで一致で拾う | 2 |
| B | 非公開37本を**1本も拾わない**（`has been removed` の字も入った意地悪な1行を含む） | 2 |
| C | 表が動いた写し（`NO_CHAT_FILE` が21本）で**書かないと判断する** | 2 |
| D | 知らない理由の行が1つでもあれば**書かないと判断する** | 2 |
| E | 下見のあいだ、`UPDATE` が**口のところで止まる** | 2 |

`BREAK=private|count|other|dry` を渡すと足を1本だけ抜ける。
**その足が守っていた対照だけが落ちる**ことを `failed_terminate_selftest.py`
が毎回見る（#128 の決めごと1。「4つ当てた」は、4つが同じ足を折っているなら1つ）。
"""

import os
import sqlite3
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from config import BQ_DATASET, BQ_PROJECT_ID, BQ_TABLE_VIDEOS  # noqa: E402
from _fs import args, log  # noqa: E402

TABLE = f"{BQ_PROJECT_ID}.{BQ_DATASET}.{BQ_TABLE_VIDEOS}"

# ============================================================================
# 理由の引きかた
# ============================================================================

# 引く字は**本番の `last_error_detail` から写した**（2026-09-18 実測）。
#   yt-dlp 終了コード 1
#   ERROR: [youtube] <id>: Video unavailable. This video is private
# 63本のうち、下の5つのどれにも当たらない行は0本だった（`other` が 0）。
#
# `LIKE` にしてあるのは、**同じ字が sqlite でもそのまま動く**から。
# 正規表現にすると対照（`drill()`）が「書き換えた SQL」を見ることになり、
# 本物を確かめたことにならない。
PRIVATE = "last_error_detail LIKE '%This video is private%'"

# 終端。**もう試す先が無いと、当てて確かめたもの**（#123 追記その3）
TERMINAL: tuple[tuple[str, str, str, int], ...] = (
    # key, 見出し, 引く条件, 想定の本数
    ("nochat", "チャットの replay が残っていない（NO_CHAT_FILE）",
     "last_error_code = 'NO_CHAT_FILE'", 20),
    ("norec", "録画が無い",
     "last_error_detail LIKE '%This live stream recording is not available%'", 3),
    ("soon", "配信が始まる前に当てた",
     "last_error_detail LIKE '%This live event will begin in a few moments%'", 2),
    ("removed", "削除ずみ",
     "last_error_detail LIKE '%This video has been removed%'", 1),
)

# 触らないもの。**あやとが公開に戻せる**ので、終端に落としてはいけない
KEEP: tuple[tuple[str, str, str, int], ...] = (
    ("private", "非公開（あやとが戻せば取れる。ここでは触らない）", PRIVATE, 37),
)

# 理由ごとの想定。**ここが合わなければ1行も書かない**
WANT: dict[str, int] = {k: n for k, _, _, n in TERMINAL + KEEP}
WANT["other"] = 0  # 知らない理由。1本でもあれば、まず測るところから

# 見出し（出すときの並びは TERMINAL → KEEP → other）
LABEL: dict[str, str] = {k: t for k, t, _, _ in TERMINAL + KEEP}
LABEL["other"] = "**知らない理由**（測っていない。書かない）"

TERMINAL_KEYS = tuple(k for k, _, _, _ in TERMINAL)

# 足の名前。**知らない名前を渡したら落とす**（書き間違いで対照が黙らないように）
LEGS = ("private", "count", "other", "dry")


def leg() -> str:
    """いま抜いている足。`BREAK=` で渡す。ふだんは空。"""
    b = (os.getenv("BREAK") or "").strip()
    if b and b not in LEGS:
        raise SystemExit(f"BREAK に使えるのは {', '.join(LEGS)} だけです: {b}")
    return b


# ============================================================================
# SQL。**SELECT と UPDATE は同じ式から作る**（片方だけ直ると噛み合わなくなる）
# ============================================================================

def where_terminal() -> str:
    """終端に落とす相手。**非公開を先に外してから**、終端の理由で引く。"""
    ors = " OR ".join(f"({c})" for _, _, c, _ in TERMINAL)
    if leg() == "private":
        # 足を抜いた写し。非公開の守りが1枚も無い
        return f"status = 'FAILED' AND ({ors})"
    return f"status = 'FAILED' AND NOT ({PRIVATE}) AND ({ors})"


def case_reason() -> str:
    """1行ずつの理由。**非公開を先頭に置く**（混ざっている字に引きずられない）。"""
    order = KEEP + TERMINAL
    whens = " ".join(f"WHEN {c} THEN '{k}'" for k, _, c, _ in order)
    return f"CASE {whens} ELSE 'other' END"


def select_sql() -> str:
    """`FAILED` を全部引く。**題名は1列も引かない**（ログは公開）。"""
    return f"""
SELECT
  video_id,
  {case_reason()} AS reason,
  ({where_terminal()}) AS selected,
  attempt_count,
  last_attempt_at,
  last_error_code
FROM `{TABLE}`
WHERE status = 'FAILED'
ORDER BY reason, video_id
"""


def update_sql() -> str:
    """終端へ落とす。**理由（`last_error_code` / `last_error_detail`）は残す。**

    `next_retry_at` を NULL にするのは `mark_video_skipped` と形を揃えるため
    （本番の `FAILED` 63本は既に全部 NULL なので、いまは中身が変わらない）。
    """
    return f"""
UPDATE `{TABLE}`
SET status = 'SKIPPED', next_retry_at = NULL
WHERE {where_terminal()}
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

def tally(rows: list[dict]) -> dict[str, int]:
    """理由ごとに数える。出てこなかった理由は 0 で置く。"""
    out = {k: 0 for k in WANT}
    for r in rows:
        out[r["reason"]] = out.get(r["reason"], 0) + 1
    return out


def judge(counts: dict[str, int]) -> list[str]:
    """数が想定どおりか。返すのが空なら書いてよい。"""
    bad: list[str] = []
    if leg() != "other" and counts.get("other", 0) != 0:
        bad.append(f"知らない理由の行が {counts['other']} 本あります（先に測る）")
    if leg() != "count":
        for k in WANT:
            if k == "other":
                continue
            if counts.get(k, 0) != WANT[k]:
                bad.append(f"{k}: {counts.get(k, 0)} 本（想定 {WANT[k]} 本）")
    return bad


def disagreements(rows: list[dict]) -> list[str]:
    """CASE の理由と、WHERE の選びが食い違っていないか。

    データでは起きない。**片方だけ書き換えた日に鳴る**ための確かめ。
    非公開が1本でも選ばれていたら、ここで必ず出る。
    """
    bad: list[str] = []
    for r in rows:
        want = r["reason"] in TERMINAL_KEYS
        if bool(r["selected"]) != want:
            bad.append(
                f"{r['video_id']}: 理由は {r['reason']} なのに"
                f"{'選ばれています' if r['selected'] else '選ばれていません'}"
            )
    return bad


# ============================================================================
# 下見のあいだ、書く口を塞ぐ（**塞ぐのは口であって、判断ではない**）
# ============================================================================

class ReadOnly(Exception):
    """下見のつもりで、書きに行った。"""


class _ReadOnlyClient:
    """`SELECT` 以外を口のところで止める写し。

    呼ぶ側に `if apply:` を書き忘れても、ここで止まる（`_fs.readonly` と同じ筋）。
    """

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
# 対照。**本番を1行も引く前に回す**
# ============================================================================

# BigQuery 方言のうち、このスクリプトの SQL が使っている書き方だけを直す。
# **直しきれないものが1つでも残っていたら落とす**ので、SQL を書き換えたときに
# この対照が黙って意味を失うことはない。
def to_sqlite(sql: str) -> str:
    """この箱の sqlite で回る形に直す。`LIKE` も `CASE` もそのまま動く。"""
    import re
    out = re.sub(r"`[^`]*\.?videos`", "videos", sql)
    left = re.search(r"TIMESTAMP_\w+|INTERVAL|CURRENT_TIMESTAMP|SAFE[._]|`|@", out)
    if left:
        raise SystemExit(
            f"この対照が知らない書き方が SQL に入っています: {left.group(0)}\n"
            f"{__file__} の to_sqlite に足してください（足さずに素通りさせない）"
        )
    return out


COLUMNS = (
    "video_id", "status", "first_seen_at", "next_retry_at", "attempt_count",
    "last_attempt_at", "last_error_code", "last_error_detail",
)

# 仕込みの `last_error_detail`。**本番から写した字**（id だけ差し替え）
DETAIL = {
    "private": "yt-dlp 終了コード 1\nERROR: [youtube] {id}: Video unavailable. This video is private\n",
    "norec": "yt-dlp 終了コード 1\nERROR: [youtube] {id}: This live stream recording is not available.\n",
    "removed": "yt-dlp 終了コード 1\nERROR: [youtube] {id}: Video unavailable. This video has been removed by the uploader\n",
    "soon": "yt-dlp 終了コード 1\nERROR: [youtube] {id}: This live event will begin in a few moments.\n",
    "nochat": "チャットファイルが生成されませんでした",
}


def _row(vid: str, status: str, kind: str | None, detail: str | None = None) -> tuple:
    """仕込みの1行。`kind` が None なら理由を持たない（SUCCEEDED など）。"""
    code = None
    if kind == "nochat":
        code = "NO_CHAT_FILE"
    elif kind is not None:
        code = "YTDLP_FAILED"
    if detail is None and kind is not None:
        detail = DETAIL[kind].format(id=vid)
    return (vid, status, "2026-02-01 00:00:00", None, 2,
            "2026-02-01 01:00:00", code, detail)


def fixture(nochat: int = 20, extra: list[tuple] | None = None,
            mixed: bool = False) -> tuple[list[tuple], set[str]]:
    """本番と同じ形の表と、**そこから落ちるべき id の集合**。

    Args:
        nochat: `NO_CHAT_FILE` の本数（表が動いた写しを作るのに変える）
        extra: 足す行
        mixed: 非公開の1本に `has been removed` の字も混ぜる（意地悪な1行）
    """
    rows: list[tuple] = []
    want: set[str] = set()
    for i in range(nochat):
        vid = f"NOCHAT{i:04d}"
        rows.append(_row(vid, "FAILED", "nochat"))
        want.add(vid)
    for kind, n in (("norec", 3), ("soon", 2), ("removed", 1)):
        for i in range(n):
            vid = f"{kind.upper()}{i:04d}"
            rows.append(_row(vid, "FAILED", kind))
            want.add(vid)
    for i in range(37):
        vid = f"PRIV{i:04d}"
        if mixed and i == 0:
            # 非公開なのに、消された配信の字も入っている1行。
            # **落としてはいけない側**（あやとが戻せる）
            d = (DETAIL["private"].format(id=vid).rstrip("\n")
                 + " / This video has been removed by the uploader\n")
            rows.append(_row(vid, "FAILED", "private", d))
        else:
            rows.append(_row(vid, "FAILED", "private"))
    # `FAILED` 以外も混ぜる。**引くのは FAILED だけ**であることを見るため
    rows.append(_row("SUCC0000", "SUCCEEDED", None))
    rows.append(_row("WAIT0000", "WAITING", "nochat"))
    rows.append(_row("SKIP0000", "SKIPPED", "nochat"))
    if extra:
        rows += extra
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


def drill() -> bool:
    """対照。**本番を1行も引く前に回す。** 通れば True。"""
    ok = True

    def ck(name: str, good: bool, saw) -> None:
        nonlocal ok
        log.info("  %s %s（%s）", "OK  " if good else "NG  ", name, saw)
        if not good:
            ok = False

    log.info("[対照] 答えの分かっている仕込みで、自分を先に試す")

    # A: 本番と同じ形から、26本ちょうどを id まで一致で拾う
    rows, want = fixture()
    got = {r["video_id"] for r in rows_selected(rows)}
    ck("A 本番と同じ形から26本を拾う", got == want and len(want) == 26,
       f"{len(got)} 本 / 想定 {len(want)} 本")
    counts = tally(run_sqlite(rows))
    ck("A 理由ごとの数が想定どおり", judge(counts) == [], counts)

    # B: 非公開は1本も拾わない（字が混ざっていても）
    rows, want = fixture(mixed=True)
    sel = rows_selected(rows)
    priv = [r["video_id"] for r in sel if r["video_id"].startswith("PRIV")]
    ck("B 非公開を1本も拾わない", not priv, f"拾った非公開 {len(priv)} 本")
    ck("B 意地悪な1行を入れても26本のまま",
       {r["video_id"] for r in sel} == want, f"{len(sel)} 本")
    gap = disagreements(run_sqlite(rows))
    ck("B CASE と WHERE が食い違わない", gap == [], f"食い違い {len(gap)} 件")

    # C: 表が動いていたら書かない
    rows, _ = fixture(nochat=21)
    said = judge(tally(run_sqlite(rows)))
    ck("C 表が動いた写しでは書かない", said != [],
       said[0] if said else "**止まらなかった**")

    # D: 知らない理由があったら書かない
    rows, _ = fixture(extra=[_row("UNKNOWN0", "FAILED", None, "yt-dlp 終了コード 1\n見たことのない字\n")])
    said = judge(tally(run_sqlite(rows)))
    ck("D 知らない理由があれば書かない", said != [],
       said[0] if said else "**止まらなかった**")

    # E: 下見のあいだ、UPDATE が口のところで止まる
    blocked = dry_blocks()
    ck("E 下見では UPDATE が通らない", blocked,
       "止まる" if blocked else "**通ってしまった**")

    if not ok:
        log.error("対照が落ちました。本番の表は1行も引きません")
    return ok


def rows_selected(rows: list[tuple]) -> list[dict]:
    """仕込みの表のうち、`selected` が立った行。"""
    return [r for r in run_sqlite(rows) if r["selected"]]


def dry_blocks() -> bool:
    """下見の写しが、本当に `UPDATE` を止めるか。"""
    class _Boom:
        def query(self, sql, *a, **k):
            raise AssertionError("下見なのに本物の口へ抜けました")

    if leg() == "dry":
        return False  # 足を抜いた写し。塞ぎが無い
    try:
        _ReadOnlyClient(_Boom()).query(update_sql())
    except ReadOnly:
        return True
    except AssertionError:
        return False
    return False


# ============================================================================
# 出す
# ============================================================================

def show(rows: list[dict], counts: dict[str, int]) -> None:
    """1行ずつと、理由ごとの数。**題名は1文字も出さない**（ログは公開）。"""
    sel = [r for r in rows if r["selected"]]
    log.info("%s", "─" * 68)
    log.info("終端に落とす %d 本", len(sel))
    for r in sel:
        at = r["last_attempt_at"]
        log.info("  %s  %-8s  試行 %s 回  最後に試した日 %s",
                 r["video_id"], r["reason"], r["attempt_count"],
                 str(at)[:10] if at else "（無し）")
    log.info("%s", "─" * 68)
    for k in TERMINAL_KEYS:
        log.info("  落とす   %-8s %3d 本（想定 %d）  %s",
                 k, counts.get(k, 0), WANT[k], LABEL[k])
    for k, _, _, _ in KEEP:
        log.info("  触らない %-8s %3d 本（想定 %d）  %s",
                 k, counts.get(k, 0), WANT[k], LABEL[k])
    log.info("  その他   %-8s %3d 本（想定 %d）  %s",
             "other", counts.get("other", 0), WANT["other"], LABEL["other"])
    log.info("  FAILED 全部で %d 本", len(rows))


def census(client) -> dict[str, int]:
    """状態ごとの本数。**書く前と書いたあとで、これを並べて見る。**"""
    out = {r["status"]: r["n"] for r in [dict(x) for x in client.query(CENSUS_SQL).result()]}
    log.info("いまの表: %s", " / ".join(f"{k} {v}" for k, v in sorted(out.items())))
    return out


# ============================================================================

def main() -> int:
    """エントリポイント。**既定は下見。**"""
    a = args()
    apply = bool(a.get("apply"))

    if not drill():
        return 2

    from google.cloud import bigquery  # 読み込みは呼ばれたときに（_fs.db と同じ筋）

    client = bigquery.Client(project=BQ_PROJECT_ID)
    if not apply:
        # **下見のあいだは、書く口そのものを塞ぐ**（判断に頼らない）
        client = _ReadOnlyClient(client)

    before = census(client)
    rows = [dict(r) for r in client.query(select_sql()).result()]
    if not rows:
        log.error("FAILED の行が1つもありません。数えるものが無いので止めます")
        return 2

    counts = tally(rows)
    show(rows, counts)

    bad = judge(counts) + disagreements(rows)
    if bad:
        for b in bad:
            log.error("  合いません: %s", b)
        log.error("想定と違うので、1行も書かずに止めます（表が動いたなら、まず測り直す）")
        return 2

    if not apply:
        log.info("%s", "─" * 68)
        log.info('下見です。**1行も書いていません。** 書くには {"apply": true}')
        return 0

    job = client.query(update_sql())
    job.result()
    wrote = job.num_dml_affected_rows
    log.info("%d 行を SKIPPED に落としました", wrote)

    # 書いたあとに数え直す。**噛み合っていなければ 1 で落ちる**
    left = [dict(r) for r in client.query(select_sql()).result()]
    still = [r for r in left if r["selected"]]
    after = census(client)
    ok = True
    if wrote != len(rows) - WANT["private"]:
        log.error("書いた数が合いません（%s 行）", wrote)
        ok = False
    if still:
        log.error("まだ %d 行のこっています。判定と書き込みが噛み合っていません", len(still))
        ok = False
    if len(left) != WANT["private"]:
        log.error("FAILED が %d 本のこっています（非公開の %d 本だけのはず）",
                  len(left), WANT["private"])
        ok = False
    if after.get("SKIPPED", 0) - before.get("SKIPPED", 0) != wrote:
        log.error("SKIPPED の増えかたが書いた数と合いません")
        ok = False
    if not ok:
        return 1
    log.info("残りの FAILED は非公開の %d 本だけです（あやとが戻すまで触りません）",
             len(left))
    return 0


if __name__ == "__main__":
    sys.exit(main())
