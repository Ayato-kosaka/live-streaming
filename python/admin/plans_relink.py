"""掲示板に出ている提案を、Git 側に立った企画ページへ結び付ける。

**既定では1行も書かない。** 何が起きるかを出すだけ。書くときは
`{"apply": true}` を付ける。

ARGS 例:
  {}                        … 何が起きるか出すだけ
  {"apply": true}           … 結び付けて、二重になっている行をしまう
  {"plan": "georgia-bye"}   … その企画1つだけ見る

## なぜ要るのか

企画の入れ物は1つ（`islandStreamEvent`）で、掲示板に出た提案も、Git 側に
立った企画も、同じ入れ物に入る。**この2つが二重になっていた。**

#202 の種入れ（`streamevents_import.py`）は、`stream_events_seed.json` の
企画を**書類IDを企画のidにして**作る。そのとき、同じ企画がもう掲示板に
提案として出ていることを見ていなかった。結果、ジョージアバイバイと
海外出発二周年は、

- 掲示板に出ている提案（`status: proposed`・`planId` なし）
- 種で作られた行（`status: next`・`planId` あり・`board: false`）

の2行になり、**掲示板に出るほうはいつまでも「提案」のまま**だった。
あやとが「清書したはずなのに提案ステータス」と言ったのがこれ。

## どう直すか

**掲示板に出ているほうを残す。** あやと（や視聴者さん）が書いた行で、
ハートも名前も付いている。そちらに `planId` を入れて段を「これから」に上げ、
**種で作られた空の行はしまう**（消さない。`archived` にすると
`eventsOnDay` からも `/me` の選び札からも外れる）。

## しまってよい行かどうかは、数えてから決める

種の行に**カード画像・配信ID・ハート・書いた人**のどれかが付いていたら、
そこには人の操作が乗っている。**しまわない。** ログに出して、手で決める。
（フード＆ワイン祭りは掲示板に提案が無く、種の行に画像が1枚付いている。
 だからここでは1件も触らない。）
"""

import json
import os
import time

from _fs import args, db, log

SEED = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    "stream_events_seed.json",
)

EVENTS = "islandStreamEvent"
IMAGES = "islandStreamEventImage"


def ymd(v) -> str:
    """日付をそろえる。**掲示板から出た行は 2026-9-11 のことがある。**

    画面から出した行の `date` は、打った人の端末が組んだ字がそのまま入る。
    種（`stream_events_seed.json`）は 2026-09-11 と0を詰めてある。
    字として比べると別物になり、**同じ企画なのに結び付かない。**

    実際にそれで `japan-2years` が1件だけ取り残された。しかも
    「候補なし」で黙って飛ばしていたので、`手で決める 0件` と出ていた。
    """
    t = str(v or "").strip()
    if not t:
        return ""
    part = t.replace("/", "-").split("-")
    if len(part) != 3:
        return t
    try:
        return "%04d-%02d-%02d" % (int(part[0]), int(part[1]), int(part[2]))
    except ValueError:
        return t


def seed_plans() -> list:
    """種のうち、Git 側に企画ページがあるもの（`planId` を持つ行）。"""
    with open(SEED, encoding="utf-8") as f:
        rows = json.load(f)["events"]
    return [r for r in rows if r.get("planId")]


def decide(rows: list, docs: dict, shots: dict, only=None) -> tuple:
    """何を結んで、何をしまうかを決める。**ここでは書かない。**

    Firestore から切り離してあるのは、本番に触らずに数を見るため。

    Args:
        rows: 種のうち `planId` を持つ行
        docs: 書類ID -> `islandStreamEvent` の中身
        shots: 書類ID -> 付いているカード画像の枚数
        only: 1つだけ見るときの Git 側の企画id

    Returns:
        (結ぶもの, しまうもの, 手で決めるもの)
    """
    link, fold, stuck = [], [], []
    for r in rows:
        git_id = r["planId"]
        if only and only != git_id:
            continue

        # もう結び付いている行（しまってあるものは数えない）
        held = [
            i for i, v in docs.items()
            if v.get("planId") == git_id and v.get("archived") is not True
        ]
        # 掲示板に出ている、同じ企画とみられる提案。
        # **題も日付も1字も違わないものだけ。** 似ているだけのものを拾うと、
        # 別の企画のページに結び付いた行ができる（画面側の判断と同じ規則）
        same = [
            i for i, v in docs.items()
            if v.get("board") is not False
            and not v.get("planId")
            and v.get("archived") is not True
            and str(v.get("title", "")).strip() == r["title"].strip()
            and ymd(v.get("date")) == ymd(r["date"])
        ]
        if not same:
            # **黙って飛ばさない。** すでに結び付いている行があるのに掲示板側の
            # 相手が見つからないのは、種を入れただけで済んでいる（正常）か、
            # 題か日付が食い違っている（要確認）かのどちらか。前者と区別が
            # つかないまま 0件 と出すと、取り残しに気づけない。
            if len(held) > 1:
                stuck.append((git_id, f"planId を持つ行が{len(held)}件あるのに、"
                                      f"掲示板側に題も日付も合う提案が無い: {held}"))
            continue
        if len(same) > 1:
            stuck.append((git_id, f"掲示板に同じ題の提案が{len(same)}件ある: {same}"))
            continue

        board_id = same[0]
        # 種で作られた行。中身が空のときだけしまう
        twin = [i for i in held if i != board_id]
        empty = []
        for i in twin:
            v = docs[i]
            why = []
            if shots.get(i):
                why.append(f"カード画像{shots[i]}枚")
            if v.get("videoIds"):
                why.append(f"配信{len(v['videoIds'])}本")
            if v.get("hearts"):
                why.append(f"ハート{v['hearts']}")
            if v.get("by") or v.get("uid") or v.get("cid"):
                why.append("書いた人が付いている")
            if why:
                stuck.append((git_id, f"{i} は空ではない（{'・'.join(why)}）"))
            else:
                empty.append(i)
        if len(empty) != len(twin):
            # 中身のある行が残る。**二重のまま結び付けない。**
            # 結ぶと、カードの付く行と掲示板の行が別々のまま固まる
            continue

        link.append((board_id, git_id, docs[board_id].get("title", "")))
        fold += [(i, board_id, git_id) for i in empty]
    return link, fold, stuck


def main() -> None:
    a = args()
    apply = a.get("apply") is True
    client = db()
    if not apply:
        log.info('*** 出すだけです。書くには {"apply": true} を付けてください ***')

    docs = {d.id: (d.to_dict() or {}) for d in client.collection(EVENTS).stream()}
    log.info("%s: %d件", EVENTS, len(docs))

    # 企画の行に付いているカード画像の枚数。**しまってよいかの判断に要る**
    shots: dict = {}
    for d in client.collection(IMAGES).stream():
        ev = (d.to_dict() or {}).get("streamEventId")
        if ev:
            shots[ev] = shots.get(ev, 0) + 1

    link, fold, stuck = decide(seed_plans(), docs, shots, a.get("plan"))

    for i, git_id, title in link:
        log.info("結ぶ: %s → planId=%s / 段を next へ（%s）", i, git_id, title)
    for i, board_id, git_id in fold:
        log.info("しまう: %s（%s と二重。中身は空）", i, board_id)
    for git_id, why in stuck:
        log.warning("手で決める: %s — %s", git_id, why)
    log.info("結ぶ %d件 / しまう %d件 / 手で決める %d件",
             len(link), len(fold), len(stuck))

    if not apply or not (link or fold):
        return

    now_ms = int(time.time() * 1000)
    batch = client.batch()
    col = client.collection(EVENTS)
    # **しまうほうを先に。** 同じ planId を持つ行が一瞬でも2つにならない
    # （サーバーの `/nextplans/:id/status` もそれを 409 で断る）
    for i, board_id, git_id in fold:
        batch.set(
            col.document(i),
            {"archived": True, "mergedInto": board_id, "updatedAt": now_ms},
            merge=True,
        )
    for i, git_id, _title in link:
        batch.set(
            col.document(i),
            {"status": "next", "planId": git_id, "updatedAt": now_ms},
            merge=True,
        )
    batch.commit()
    log.info("結び %d件 / しまい %d件 書きました", len(link), len(fold))


main()
