"""配信の「ここを切る」を出す。**読むだけ。**

ショート（60秒）に収まる区間を、コメントの重なりから選んで並べる。
切り抜きそのもの（動画の編集）はここではやらない。出すのは
**開始と終了のタイムコード・YouTube の時刻つきリンク・その時間帯のコメント**まで。

## どこから読むか

コメントの置き場は2つあって、**配信からの経過時間で使い分ける。**

| いつ | どこ | 誰が入れる |
| --- | --- | --- |
| 配信中〜その日のうち | Firestore `streamChatMessages` | `collectLiveChat`（5分おき） |
| 翌日以降 | BigQuery `chat_messages` | 毎晩の `fetch_chat_data`（yt-dlp） |

アーカイブのチャットは YouTube 側の都合で1日ほど遅れて出る。**配信の当日に
切りたいなら Firestore しかない**（#153）。`source` を省くと、Firestore に
その配信のぶんがあればそちらを、無ければ BigQuery を見る。

## 山＝面白い、ではない

コメントが重なった時刻は「何かが起きた」の目印でしかない。何が起きたかは
**本文を読まないと分からない**ので、候補ごとにその時間帯のコメントを出す。
数字だけ見て切ると、あいさつが重なっただけのところを切ることになる。

そのため、はじめの1分と終わりの3分は候補から外してある（`build_stream_peaks.py`
と同じ理由。「おつかれさま」が重なるのは話の中身ではない）。

## 0分がどこか（**当日ぶんはここを間違えやすい**）

タイムコードは「配信が始まってから何秒か」。起点は `videos.actual_start_time`、
無ければ YouTube の `liveStreamingDetails.actualStartTime` から取る。

**いちばん古いコメントを0分にしない。** キャッシュ（`streamChatMessages`）は
`collectLiveChat` が動き出したところから溜まるので、配信の途中から溜まり
はじめた日は、そこが0分になってしまう。2026-09-11 の配信で実際に
**2時間18分ずれた。** どちらからも起点が取れなかったときは代用するが、
**ずれている可能性があることを出力に書く**（黙って出さない）。

## コメントは、出来事の**あと**に来る

あやと（#153）「その正確な時間っていうのが大体1、2分ずれると思う」。
笑ったから打つので、打たれた時刻には**もう終わっている。** そこを切ると
オチだけの動画になる。だから切り出しは山の頭より `lead` 秒だけ前から始める。
それでも数十秒はずれるので、`pad` 秒だけ広く取った「編集用の長め」も併記する。

ARGS 例:
  {}                                    いちばん新しい配信を見る
  {"video": "_kxbsXWzddQ"}
  {"video": "...", "top": 3, "sec": 45}
  {"source": "live"}                    Firestore だけ見る（配信当日）
  {"source": "archive"}                 BigQuery だけ見る
  {"rows_file": "/tmp/rows.json"}       手元で試すとき（[{"s","a","t"}...]）

出すもの（1本あたり3〜4行）:
  順位 / 切り出す区間 / youtu.be の時刻つきリンク / コメント数・人数・笑いの数 /
  編集用の長めの区間と yt-dlp の指定 / その時間帯のコメント
"""

import json
import os
import re
import sys
from collections import defaultdict

from _fs import args, db, log

# 集計の粒度。10秒より細かくしても、コメントは秒単位で揺れるので意味が無い
BIN = 10
# 1人がその区間に何件打っても、数えるのは3件まで。
# **これが無いと「1人が連打しただけ」が1位に来る。** 手元の作り物で実際にそうなった
CAP = 3
# 候補として出す最低線。`build_stream_peaks.py` と同じ考え方で、
# 「その配信の中で飛び出している（倍率）」と「絶対数」の両方を見る。
# **足りなければ本数を減らす。** 無い日に何か出すために下げると、全部が信用されなくなる
#
# 絶対数を 8 から 6 に下げてある。本番の 2026-09-07（コメント351件・2時間26分）で
# 試したら、8 では3本しか残らず、**実際にいちばん湧いていた「ストップ！」の
# 連呼（6件・4人）が落ちた。** 1分あたりの平均が 2.4件の配信で 8件を求めるのは
# 平均の3.3倍で、倍率の下限（2.0倍）より厳しく、絶対数のほうが効いてしまっていた。
MIN_MSGS = 6
MIN_RATIO = 2.0
MIN_PEOPLE = 3
# 件数が足りなくても、**別々の人がこれだけ同時に笑っていたら候補にする。**
# あやとの言う「わろた・www が急に増えた瞬間」（#153）。
#
# **本番の 2026-09-07 では、この道は1本も拾わなかった。** そこで拾いたかった
# 「9割種言うてたやん」（3人が続けて同じツッコミ）には、w も 笑 も絵文字も
# 入っていない。**笑っている場面と、笑いの印が書かれる場面は別。**
# つまりこの規則は「みんなが w を打った瞬間」には効くが、上のような場面は
# **数えても出てこない。読んで拾うしかない**（スキルの3章がその手順）。
MIN_LAUGH = 3
# 定型のあいさつ。**山として数えない。**
# 「said hi」は YouTube が出す入室の合図で、盛り上がりではない
SKIP_TEXT = {"said hi"}
# 配信者自身の告知 bot（monthly-review と同じ除外）
SKIP_AUTHOR = {"@あやとグルメアプリ"}
# 笑っている印。あやとの言う「わろた・www が急に増えた瞬間」を数えるため（#153）
LAUGH = re.compile(
    r"(w{2,}|ｗ{2,}|笑|草|わろ|rolling_on_the_floor_laughing"
    r"|face_with_tears_of_joy|grinning_squinting_face)"
)


def hms(sec: int) -> str:
    """0:00:00 の形。"""
    sec = max(0, int(sec))
    return f"{sec // 3600}:{sec % 3600 // 60:02d}:{sec % 60:02d}"


def from_bq(video: str | None) -> tuple[str, list[dict], str]:
    """BigQuery の `chat_messages`。**配信1本ぶんに絞ってから引く。**"""
    from google.cloud import bigquery

    sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    from config import BQ_DATASET, BQ_PROJECT_ID  # noqa: E402

    ds = f"{BQ_PROJECT_ID}.{BQ_DATASET}"
    client = bigquery.Client(project=BQ_PROJECT_ID)

    if not video:
        # コメントが1件でも入っている配信のうち、いちばん新しいもの。
        # videos だけ見ると、取り込み待ち（WAITING）の空の配信を掴む
        sql = f"""
        SELECT v.video_id FROM `{ds}.videos` v
        WHERE v.status = 'SUCCEEDED' AND v.actual_start_time IS NOT NULL
        ORDER BY v.actual_start_time DESC LIMIT 1
        """
        rows = list(client.query(sql).result())
        if not rows:
            return "", [], ""
        video = rows[0]["video_id"]

    # published_at で切ってからでないとテーブル全体を舐める（分割列がそれ）
    sql = f"""
    WITH v AS (
      SELECT video_id, actual_start_time FROM `{ds}.videos`
      WHERE video_id = @v AND actual_start_time IS NOT NULL
    )
    SELECT CAST(TIMESTAMP_DIFF(c.published_at, v.actual_start_time, SECOND) AS INT64) AS s,
           c.author_name AS a, c.message_text AS t
    FROM `{ds}.chat_messages` c JOIN v USING (video_id)
    WHERE c.published_at BETWEEN v.actual_start_time
                            AND TIMESTAMP_ADD(v.actual_start_time, INTERVAL 12 HOUR)
      AND c.event_type IN ('TEXT', 'PAID')
      AND TIMESTAMP_DIFF(c.published_at, v.actual_start_time, SECOND) BETWEEN 0 AND 21600
    ORDER BY s
    """
    job = client.query(
        sql,
        job_config=bigquery.QueryJobConfig(
            query_parameters=[bigquery.ScalarQueryParameter("v", "STRING", video)]
        ),
    )
    return video, [dict(r) for r in job.result()], "videos.actual_start_time"


def start_ms_from_bq(video: str) -> int | None:
    """`videos.actual_start_time` を epoch ミリ秒で。無ければ None。"""
    try:
        from google.cloud import bigquery

        sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
        from config import BQ_DATASET, BQ_PROJECT_ID  # noqa: E402

        ds = f"{BQ_PROJECT_ID}.{BQ_DATASET}"
        client = bigquery.Client(project=BQ_PROJECT_ID)
        sql = f"""
        SELECT UNIX_MILLIS(actual_start_time) AS ms FROM `{ds}.videos`
        WHERE video_id = @v AND actual_start_time IS NOT NULL LIMIT 1
        """
        job = client.query(
            sql,
            job_config=bigquery.QueryJobConfig(
                query_parameters=[bigquery.ScalarQueryParameter("v", "STRING", video)]
            ),
        )
        rows = list(job.result())
        return int(rows[0]["ms"]) if rows and rows[0]["ms"] is not None else None
    except Exception as e:  # 読めないだけ。次の手（YouTube）へ落とす
        log.info("videos.actual_start_time を読めませんでした: %s", e)
        return None


def start_ms_from_youtube(video: str) -> int | None:
    """YouTube の `liveStreamingDetails.actualStartTime`。無ければ None。

    **配信当日は BigQuery にまだ行が無い。** Discovery が拾うのは翌朝なので、
    その日のうちに切りたいときは、こちらしか起点を知らない。
    """
    try:
        from datetime import datetime

        sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
        from youtube_api.client import (  # noqa: E402
            execute_api_request,
            get_youtube_client,
        )

        yt = get_youtube_client(log)
        res = execute_api_request(
            yt.videos().list(part="liveStreamingDetails", id=video), logger=log
        )
        items = res.get("items") or []
        if not items:
            return None
        raw = (items[0].get("liveStreamingDetails") or {}).get("actualStartTime")
        if not raw:
            return None
        t = datetime.fromisoformat(str(raw).replace("Z", "+00:00"))
        return int(t.timestamp() * 1000)
    except Exception as e:
        log.info("YouTube から actualStartTime を取れませんでした: %s", e)
        return None


def stream_start_ms(video: str) -> tuple[int | None, str]:
    """配信が始まった時刻（epoch ミリ秒）と、その出どころ。

    **ここを間違えると、出すタイムコードが全部ずれる。**
    2026-09-11 の配信で実際に 2時間18分ずれた。キャッシュ（`streamChatMessages`）が
    配信の途中から溜まりはじめた日で、いちばん古いコメントを0分として
    数えていたため。溜まりはじめる時刻は `collectLiveChat` が動き出した時刻で、
    配信の開始とは何の関係もない。
    """
    ms = start_ms_from_bq(video)
    if ms is not None:
        return ms, "videos.actual_start_time"
    ms = start_ms_from_youtube(video)
    if ms is not None:
        return ms, "YouTube の actualStartTime"
    return None, ""


def from_firestore(video: str | None) -> tuple[str, list[dict], str]:
    """配信中に溜めたぶん（`streamChatMessages`）。**その日のうちに切るならこちら。**

    3つめに返すのは**起点の出どころ**。空文字なら、配信の開始時刻が
    どこからも取れずにいちばん古いコメントで代用したという意味で、
    そのときタイムコードは**丸ごとずれている可能性がある**（呼び元が明記する）。
    """
    client = db()
    runs = client.collection("streamChatRuns")

    if not video:
        docs = sorted(
            (d for d in runs.stream()),
            key=lambda d: (d.to_dict() or {}).get("startedAt", 0),
            reverse=True,
        )
        if not docs:
            return "", [], ""
        video = docs[0].id

    run = runs.document(video).get()
    if not run.exists:
        return video, [], ""
    docs = list(
        client.collection("streamChatMessages").where("videoId", "==", video).stream()
    )
    msgs = [d.to_dict() or {} for d in docs]
    msgs = [m for m in msgs if m.get("at")]
    if not msgs:
        return video, [], ""

    # **起点は配信の開始時刻。** 溜め始めた時刻でも、いちばん古いコメントでもない。
    # 溜め始めるのは `collectLiveChat` が動き出したときで、配信の途中から
    # 溜まり始めた日はそこが0分になってしまう（2026-09-11 に 2時間18分ずれた）。
    base, origin = stream_start_ms(video)
    if base is None:
        # どちらからも取れなかった。**黙って代用しない。** ここを 0分 とみなすと、
        # 溜まり始めが遅かった日にずれた数字を、ずれていない顔で出すことになる
        base = min(int(m["at"]) for m in msgs)

    rows = []
    for m in msgs:
        s = (int(m["at"]) - base) // 1000
        if s < 0:
            # 開始時刻より前の打刻。起点が正しければ起きないので、混ぜない
            continue
        rows.append({"s": s, "a": m.get("name", ""), "t": m.get("text", "")})
    return video, sorted(rows, key=lambda r: r["s"]), origin


def pick(rows: list[dict], sec: int, top: int, lead: int) -> list[dict]:
    """コメントの重なりから、`sec` 秒に収まる区間を `top` 本選ぶ。"""
    live = [
        r
        for r in rows
        if r["a"] not in SKIP_AUTHOR and (r["t"] or "").strip() not in SKIP_TEXT
    ]
    if not live:
        return []

    end = max(r["s"] for r in live)
    nbin = end // BIN + 1
    per: dict[int, list[dict]] = defaultdict(list)
    for r in live:
        per[r["s"] // BIN].append(r)

    span = max(1, sec // BIN)
    avg = len(live) / max(1, nbin / span)  # 1窓あたりの平均コメント数

    cand = []
    for b in range(0, nbin - span + 1):
        # はじめの1分と終わりの3分は、あいさつが重なるだけなので候補から外す
        head = b * BIN
        if head < 60 or head + sec > end - 180:
            continue
        got = [m for i in range(b, b + span) for m in per.get(i, [])]
        if not got:
            continue
        who = {m["a"] for m in got}
        ratio = len(got) / avg if avg else 0
        # **1人が連打しただけのところを弾く。** 3人以上が同じ時間帯に
        # 反応しているかどうかが「重なった」の最低条件
        if len(who) < MIN_PEOPLE:
            continue
        # 点数は1人3件までで数える（CAP）。連打を弾くのは人数の下限だけでは足りない
        seen: dict[str, int] = defaultdict(int)
        fair = []
        for m in got:
            if seen[m["a"]] < CAP:
                seen[m["a"]] += 1
                fair.append(m)
        laugh = sum(1 for m in fair if LAUGH.search(m["t"] or ""))
        # 「たくさん書かれた」か「みんなが笑った」か、どちらかで通す
        if not (
            (len(got) >= MIN_MSGS and ratio >= MIN_RATIO) or laugh >= MIN_LAUGH
        ):
            continue
        cand.append(
            {
                "head": head,
                "msgs": len(got),
                "who": len(who),
                "laugh": laugh,
                # 笑いは重みを3倍にする。同じ件数なら笑っているほうを上に出す（#153）
                "score": len(fair) + 3 * laugh,
                "rows": got,
                "ratio": ratio,
            }
        )

    cand.sort(key=lambda c: (-c["score"], c["head"]))
    out: list[dict] = []
    for c in cand:
        # 選んだ区間と重なる・隣り合うものは捨てる。同じ山から5本出しても仕方がない
        # （ちょうど sec ずれた隣の窓は「重なっていない」ので、30秒ぶん余分に空ける）
        if any(abs(c["head"] - o["head"]) < sec + 30 for o in out):
            continue
        c["cut"] = max(0, c["head"] - lead)
        out.append(c)
        if len(out) >= top:
            break
    return out


def main() -> None:
    a = args()
    top = int(a.get("top", 5))
    sec = int(a.get("sec", 60))
    lead = int(a.get("lead", 20))
    pad = int(a.get("pad", 30))
    show = int(a.get("show", 12))
    src = a.get("source", "auto")
    video = a.get("video") or None

    if a.get("rows_file"):
        rows = json.loads(open(a["rows_file"], encoding="utf-8").read())
        video = video or "ROWS"
        used, origin = "rows_file", "rows_file の 0秒"
    else:
        rows, used, origin = [], "", ""
        if src in ("auto", "live"):
            video, rows, origin = from_firestore(video)
            used = "streamChatMessages（配信中に溜めたぶん）"
        if not rows and src in ("auto", "archive"):
            video, rows, origin = from_bq(video if src == "archive" else None)
            used = "BigQuery chat_messages（アーカイブ）"

    if not rows:
        log.info("コメントが1件も無い（video=%s source=%s）", video or "-", src)
        log.info("配信当日なら streamChatMessages、翌日以降なら BigQuery を見る。")
        log.info("どちらも空なら、溜めるほう（collectLiveChat）が動いていない。")
        raise SystemExit(3)

    cuts = pick(rows, sec, top, lead)
    log.info("配信 %s / コメント %d件 / 出どころ %s", video, len(rows), used)
    if origin:
        log.info("0分の起点: %s", origin)
    else:
        # **黙ってずれた数字を出さない。** 配信の開始時刻がどこからも取れず、
        # いちばん古いコメントを0分として数えている。溜まり始めが遅かった日は
        # その遅れぶん、下のタイムコードが丸ごと手前にずれる
        log.warning(
            "0分の起点が取れませんでした。**下のタイムコードはずれている"
            "可能性があります。** いちばん古いコメントを0分として数えています。"
        )
        log.warning(
            "確かめかた: YouTube でその配信を開き、いちばん下のコメントの"
            "話題が 0:00 付近にあるかを見る。ずれていれば、その差を足す。"
        )
    log.info("切り抜き候補 %d本（%d秒・山の %d秒前から）", len(cuts), sec, lead)
    if not cuts:
        log.info(
            "基準（%d人以上で、%d件以上かつ平均の%.1f倍以上、または笑い%d件以上）に"
            "届く時間帯がありません。この配信からは選べません。",
            MIN_PEOPLE, MIN_MSGS, MIN_RATIO, MIN_LAUGH,
        )
        return
    if len(cuts) < top:
        log.info("（基準に届いたのが %d本だけでした。数合わせはしません）", len(cuts))

    for i, c in enumerate(cuts, 1):
        s, e = c["cut"], c["cut"] + sec
        log.info("")
        log.info("[%d] %s〜%s  https://youtu.be/%s?t=%d", i, hms(s), hms(e), video, s)
        log.info(
            "    コメント %d件 / %d人 / 笑い %d件（この配信の平均の %.1f倍）",
            c["msgs"], c["who"], c["laugh"], c["ratio"],
        )
        log.info(
            "    編集用に長め: %s〜%s  yt-dlp --download-sections \"*%d-%d\"",
            hms(max(0, s - pad)), hms(e + pad), max(0, s - pad), e + pad,
        )
        for m in c["rows"][:show]:
            log.info("      %s  %s  %s", hms(m["s"]), m["a"], (m["t"] or "")[:60])
        if len(c["rows"]) > show:
            log.info("      …ほか %d件", len(c["rows"]) - show)


main()
