"""**その日の配信のコメントを、Firestore から丸ごと読む。**

    ARGS='{"video":"GBYHxJQGlCY"}' python python/admin/chat_day.py

## なぜ要るか

コメントの出どころは2つあって、**当日ぶんは片方にしか無い。**

| 出どころ | いつのぶん | 誰が入れるか |
| --- | --- | --- |
| BigQuery `chat_messages` | **前の晩まで** | 毎晩の取り込み（yt-dlp） |
| Firestore `streamChatMessages` | **今日のぶん** | `collectLiveChat`（5分おき） |

取り込みは 20:00 UTC の予定で、実際は1〜3時間半遅れる。しかも **yt-dlp が
429（Too Many Requests）で落ちる晩がある**（2026-09-20 の `GBYHxJQGlCY` が
それで、配信の翌朝になっても BigQuery に1件も無かった）。

`clip_cuts` は同じ置き場を読んでいるが、**返すのは盛り上がった区間だけ**で、
日誌を書くにも振り返りを作るにも足りない。**その日を頭から終わりまで読む口**が
無かったので、「BigQuery に来ていないので数えられない」で止まっていた。
止まるなという指摘（あやと 2026-09-20「直近分は Firestore みろよ」）がここ。

## 出すもの・出さないもの

出すのは **`経過時間  @名前  本文`** の3つだけ。`clip_cuts` が既に出している
のと同じ形で、**YouTube の公開チャットを開けば誰でも読めるもの**に揃えてある。

**出さない**:

- **金額**（`purchase_amount_text` / `amount`）。誰がいくら、が読めてしまう
- **チャンネルID**・**書類ID**・**どねID**。人を一意に指す値
- 投げ銭かどうかの印すら、**額が推せる形では出さない**（`[投げ銭]` だけ）

このリポジトリは公開で、Actions のログも誰でも読める。増やすときはここを読む。

## 1バイトも書かない

読むだけ。クライアントは `_fs.readonly` で包んであるので、書こうとすると落ちる。

## 起点は配信の開始時刻

`clip_cuts.stream_start_ms` をそのまま使う。**いちばん古いコメントを0分に
しない**——溜めはじめが遅かった日に、丸ごとずれた数字をずれていない顔で出す
ことになる（2026-09-11 に 2時間18分ずれた）。取れなかったら**そう言う**。

ARGS:
  {"video":"GBYHxJQGlCY"}     … 配信を1本指定する
  {}                          … いちばん新しい配信
  {"limit": 2000}             … 出す行数の上限（既定 4000）
  {"paid": true}              … 投げ銭の行だけ
"""

import sys

from _fs import args, db, log, readonly
from clip_cuts import SKIP_AUTHOR, SKIP_TEXT, hms, stream_start_ms

# 出す行数の上限。Actions のログは 1回で数MBまでなので、そこに収まる数
MAX_LINES = 4000


def latest_video(client) -> str:
    """いちばん新しく溜めはじめた配信。`streamChatRuns` の栞から選ぶ。"""
    docs = sorted(
        client.collection("streamChatRuns").stream(),
        key=lambda d: (d.to_dict() or {}).get("startedAt", 0),
        reverse=True,
    )
    return docs[0].id if docs else ""


def main() -> None:
    """エントリポイント。"""
    a = args()
    client = readonly(db())
    video = str(a.get("video") or "") or latest_video(client)
    if not video:
        log.error("配信が1本も溜まっていません（streamChatRuns が空）")
        raise SystemExit(2)

    limit = int(a.get("limit") or MAX_LINES)
    paid_only = bool(a.get("paid"))

    docs = list(
        client.collection("streamChatMessages").where("videoId", "==", video).stream()
    )
    msgs = [m for m in (d.to_dict() or {} for d in docs) if m.get("at")]
    if not msgs:
        # **0件と「読めなかった」を混ぜない。** 溜まっていないのか、配信IDが
        # 違うのかで、次にやることが変わる
        log.error("[%s] このIDで溜まっているコメントが1件もありません", video)
        raise SystemExit(2)

    base, origin = stream_start_ms(video)
    if base is None:
        # 代用はするが、**代用したと言う。** 言わないと、ずれた数字が
        # ずれていない顔で日誌に入る
        base = min(int(m["at"]) for m in msgs)
        origin = "いちばん古いコメント（**丸ごとずれている可能性があります**）"

    rows = []
    for m in msgs:
        s = (int(m["at"]) - base) // 1000
        if s < 0:
            continue
        name = m.get("name", "")
        text = (m.get("text") or "").replace("\n", " ").strip()
        if name in SKIP_AUTHOR or text in SKIP_TEXT:
            continue
        # **額は読まない。** 投げ銭かどうかだけを、印として持つ
        paid = bool(m.get("kind") and m.get("kind") != "text")
        if paid_only and not paid:
            continue
        rows.append((s, name, text, paid))
    rows.sort(key=lambda r: r[0])

    log.info("[%s] %d件 / %d人 / 起点: %s", video, len(rows),
             len({r[1] for r in rows}), origin or "（不明）")
    log.info("金額・チャンネルID・書類IDは出しません（公開のログなので）")
    log.info("-" * 60)
    for s, name, text, paid in rows[:limit]:
        log.info("%s  %s%s  %s", hms(s), "[投げ銭] " if paid else "", name, text)
    if len(rows) > limit:
        log.info("…ほか %d件（`limit` を上げると出ます）", len(rows) - limit)


main()
