"""`islandNextPlans` を `islandStreamEvent` へ移して、企画の種を入れる。#202

**既定では1行も書かない。** 何が起きるかを出すだけ。書くときは
`{"apply": true}` を付ける。

## 何をするか

1. **移す** — `islandNextPlans/{id}` を `islandStreamEvent/{id}` へ**同じ
   書類IDで**写す。もう向こうにある書類は触らない（画面から直したものを
   戻さないため）。**元は消さない。** 全部動いてから消す
2. **種を入れる** — `python/stream_events_seed.json` の企画を入れる。
   Git 側の企画（`site/content/plans.ts`）と、北欧◯日目

## なぜ種が要るのか

カードは「企画 → その企画のカード画像 × その企画に当たる投げ銭」で
できる。**企画レコードが無い日は、写真を貼ってもどこにも付かない。**
Git にしか無い企画（ジョージアバイバイなど）と、そもそも企画として
持っていなかった北欧◯日目に、入れ物を作る。

## 1日に企画は何本でも立つ

9月11日は4本（ジョージアバイバイ／海外出発二周年／ヒッチハイクで
北欧へ／北欧旅の出発日）。**1本に畳まない。** カードは当たった企画
すべてに配られる。

## 種で、同じ企画をもう1件作らない

**掲示板に出ている提案が、そのまま Git 側の企画になることがある。**
そこを見ずに種を入れて、ジョージアバイバイと海外出発二周年が2行になった
（掲示板に出るほうは `planId` を持たないので、清書してあっても
「提案」の札が付いたままだった）。`planId` をもう別の行が持っていたら、
種は作らない。結び付けるのは `plans_relink.py`。

## 種は上書きしない

`editedAt` か `updatedAt` が入っている書類は、画面から直したもの。
種で戻すと、あやとが直した題や日付が翌朝に消える
（`python/admin/donors_import.py` と同じ決め）。

ARGS 例:
  {}                                   … 何が起きるか出すだけ
  {"apply": true}                      … 移して、種を入れる
  {"apply": true, "only": "seed"}      … 種だけ
  {"apply": true, "only": "copy"}      … 移すだけ
  {"apply": true, "force_seed": true}  … 種で上書きする（戻すとき）
"""

import json
import os

from _fs import args, db, log, show

SEED = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    "stream_events_seed.json",
)

OLD = "islandNextPlans"
NEW = "islandStreamEvent"


def copy_over(client, apply: bool) -> None:
    """旧コレクションを新コレクションへ写す。**元は消さない。**

    Args:
        client: Firestore クライアント
        apply: 実際に書くか
    """
    old = {d.id: (d.to_dict() or {}) for d in client.collection(OLD).stream()}
    new = {d.id: (d.to_dict() or {}) for d in client.collection(NEW).stream()}
    log.info("%s: %d件 / %s: %d件", OLD, len(old), NEW, len(new))

    todo = [(k, v) for k, v in old.items() if k not in new]
    log.info("写すもの: %d件（もう向こうにある %d件は触らない）",
             len(todo), len(old) - len(todo))
    for k, v in todo[:20]:
        log.info("  %s  %s", k, show(v.get("title")))
    if len(todo) > 20:
        log.info("  …ほか %d件", len(todo) - 20)
    if not apply or not todo:
        return

    batch = client.batch()
    n = 0
    for k, v in todo:
        # videoIds は #202 で足した欄。移すときに空で作っておく
        v.setdefault("videoIds", [])
        batch.set(client.collection(NEW).document(k), v)
        n += 1
        if n >= 400:
            batch.commit()
            batch = client.batch()
            n = 0
    if n:
        batch.commit()
    log.info("%d件 写しました", len(todo))


def seed(client, apply: bool, force: bool) -> None:
    """種の企画を入れる。

    Args:
        client: Firestore クライアント
        apply: 実際に書くか
        force: 画面から直したものも上書きするか
    """
    with open(SEED, encoding="utf-8") as f:
        rows = json.load(f)["events"]
    col = client.collection(NEW)
    have = {d.id: (d.to_dict() or {}) for d in col.stream()}

    # **Git 側の企画1つに、結び付く行は1つだけ。**
    # 掲示板にもう同じ企画が出ていることを見ずに種を入れて、
    # ジョージアバイバイと海外出発二周年が2行になった。掲示板に出るほうは
    # `planId` を持たないので、清書してあっても「提案」のまま止まった。
    # しまってある行は数えない（付け替えの途中で行き止まりにしない）。
    held = {
        v.get("planId"): i
        for i, v in have.items()
        if v.get("planId") and v.get("archived") is not True
    }

    make, skip, twin = [], [], []
    for r in rows:
        cur = have.get(r["id"])
        # 画面から直したものは戻さない（donors_import と同じ決め）
        touched = bool(cur and (cur.get("editedAt") or cur.get("updatedAt")))
        if cur is not None and touched and not force:
            skip.append(r["id"])
            continue
        owner = held.get(r.get("planId"))
        if owner and owner != r["id"]:
            # もう別の行がこの企画を持っている。**もう1件作らない。**
            twin.append((r["id"], owner))
            continue
        make.append(r)

    log.info("種: %d件（入れる %d / 触らない %d / 二重なので作らない %d）",
             len(rows), len(make), len(skip), len(twin))
    for r in make:
        log.info("  %s  %s  %s", r["date"], r["id"], r["title"])
    if skip:
        log.info("  触らない: %s", ", ".join(skip))
    for i, owner in twin:
        log.info("  作らない: %s は %s がもう持っている", i, owner)
    if not apply or not make:
        return

    batch = client.batch()
    n = 0
    for r in make:
        doc = {
            "title": r["title"],
            "when": r.get("when", ""),
            "date": r["date"],
            "note": r.get("note", ""),
            "tags": [],
            "place": {"name": "", "area": "", "map": ""},
            "about": [],
            "links": [],
            "photos": [],
            "embeds": [],
            "hearts": 0,
            # 立っている企画なので「これから」。掲示板には出さない
            "status": "next",
            "planId": r.get("planId"),
            "source": r["source"],
            # **掲示板の一覧に出さない印。** hidden とは別もの。
            # hidden にするとカードの組み立てからも落ちる
            "board": False,
            "hidden": False,
            "archived": False,
            "videoIds": r.get("videoIds", []),
            "by": None,
            "uid": None,
            "cid": None,
            "createdAt": _created(r),
        }
        if doc["planId"] is None:
            doc.pop("planId")
        batch.set(col.document(r["id"]), doc, merge=True)
        n += 1
        if n >= 400:
            batch.commit()
            batch = client.batch()
            n = 0
    if n:
        batch.commit()
    log.info("種を %d件 入れました", len(make))


def _created(r: dict) -> int:
    """種の書類の `createdAt`。**日付から作る。**

    掲示板は `createdAt` の降順で引く。いま時刻を入れると、種の14件が
    みんなの提案より上に並ぶ（掲示板には出さないので実害は無いが、
    続きを引くときの区切りに使われる）。企画の日付そのものにしておく。

    Args:
        r: 種の1件

    Returns:
        ミリ秒
    """
    from datetime import datetime, timezone

    d = datetime.strptime(r["date"], "%Y-%m-%d").replace(tzinfo=timezone.utc)
    return int(d.timestamp() * 1000)


def main() -> None:
    a = args()
    apply = a.get("apply") is True
    only = a.get("only")
    client = db()
    if not apply:
        log.info("*** 出すだけです。書くには {\"apply\": true} を付けてください ***")
    if only in (None, "copy"):
        copy_over(client, apply)
    if only in (None, "seed"):
        seed(client, apply, a.get("force_seed") is True)


main()
