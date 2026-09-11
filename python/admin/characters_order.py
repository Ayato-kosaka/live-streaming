"""キャラクターに「作成順」を入れる。**絵は触らない。番号を1つ書くだけ。**

ARGS 例:
  {}                  … 何番になるかを出すだけ（1行も書かない）
  {"apply": true}     … islandCharacter に `order` を書く

## なぜ要るか

あやとの言葉（2026-09-11）:

> 全員分を、キャラクター作成順に出せば良い。

図鑑（`/friends`）を全員ぶんにするとき、並び順が要る。いま持っているのは
`createdAt` だけで、**あれは移行した時刻**であって作った順ではない。しかも
移行は途中で1度落ちて再開しているので、**65人目までと残りで順番が入れ替わって
いる。** 使えない。

## 「作成順」を何から決めるか

**Viewers 表の行の並び。** 新しい人は下に足されていくので、上から順が
そのまま作った順になる。1人が何行も持つ（名前が複数）ので、
**その人の Icon が最初に出てきた行**を、その人の順番とする。

**日付の列があるなら、そちらを使う。** どんな列があるかは表を見ないと
分からないので、まず出して、あれば使う。無ければ行の並びに落とす。
どちらを使ったかは必ずログに出す（**あとから「何順なのか」を推測させない**）。

## 表が消えたあとは

この番号は Firestore に入るので、**一度入れれば表が無くても並ぶ。**
これから足す人は、画面から作った時刻（`createdAt`）が後ろに来るので、
その順で末尾に並ぶ。
"""

import json
import os
import sys
import urllib.request

from _fs import args, db, log

COLLECTION = "islandCharacter"
VIEWERS_URL = os.getenv("EXPO_PUBLIC_GAS_API_URL") or os.getenv("VIEWERS_TABLE_URL")
UA = {"User-Agent": "Mozilla/5.0 (island-character-order)"}

#: 日付が入っていそうな列の名前。**見つかった順に1つだけ使う。**
DATE_COLS = ("createdAt", "CreatedAt", "date", "Date", "作成日", "日付")


def viewers() -> list:
    """Viewers 表を読む。**読むだけ。**"""
    if not VIEWERS_URL:
        log.error("EXPO_PUBLIC_GAS_API_URL がありません")
        sys.exit(1)
    req = urllib.request.Request(VIEWERS_URL + "?table=Viewers", headers=UA)
    with urllib.request.urlopen(req, timeout=60) as r:
        j = json.loads(r.read())
    if not j.get("ok"):
        log.error("Viewers 表が読めません: %s", j.get("error"))
        sys.exit(1)
    return j.get("data") or []


def main() -> None:
    a = args()
    apply = bool(a.get("apply"))
    rows = viewers()
    log.info("Viewers 表 %d行", len(rows))

    cols = sorted({k for r in rows for k in r})
    log.info("列: %s", cols)
    date_col = next((c for c in DATE_COLS if c in cols), "")
    log.info(
        "順番の決めかた: %s",
        f"列「{date_col}」の日付" if date_col else "**行の並び**（日付の列が無い）",
    )

    # Icon が最初に出てきた行を、その人の順番とする
    first: dict = {}
    for i, r in enumerate(rows):
        icon = str(r.get("Icon") or "").strip()
        if not icon or icon in first:
            continue
        first[icon] = {"row": i, "date": str(r.get(date_col) or "") if date_col else ""}

    order = sorted(
        first.items(),
        key=lambda kv: (kv[1]["date"] or "￿", kv[1]["row"]) if date_col else kv[1]["row"],
    )
    log.info("Icon の並び %d人", len(order))

    client = db()
    have = {d.id for d in client.collection(COLLECTION).select([]).stream()}
    log.info("islandCharacter に入っている %d人", len(have))

    hit = [(cid, n) for n, (cid, _) in enumerate(order) if cid in have]
    miss = [cid for cid, _ in order if cid not in have]
    log.info("番号を付けられる %d人 / 表にあるが島に無い %d人", len(hit), len(miss))
    # **島にあるが表に無い人**は、画面から足した人。末尾へ回す（createdAt 順）
    extra = sorted(have - {cid for cid, _ in order})
    if extra:
        log.info("表に無い（画面から足した）%d人は、番号の後ろへ回します", len(extra))

    if not apply:
        log.info("空回しです（1行も書いていません）。書くには {\"apply\": true}")
        for cid, n in hit[:5]:
            log.info("  例: %s → order=%d", cid[:10] + "…", n)
        return

    batch = client.batch()
    n_written = 0
    for i, (cid, _n) in enumerate(hit):
        batch.set(client.collection(COLLECTION).document(cid), {"order": i}, merge=True)
        n_written += 1
        # Firestore のまとめ書きは500件まで。97人なので1回で足りるが、
        # 人が増えても落ちないように区切っておく
        if n_written % 400 == 0:
            batch.commit()
            batch = client.batch()
    # 表に無い人は、表にある人の**後ろ**（画面から足した順は createdAt が持つ）
    for j, cid in enumerate(extra):
        batch.set(
            client.collection(COLLECTION).document(cid),
            {"order": len(hit) + j},
            merge=True,
        )
        n_written += 1
    batch.commit()
    log.info("order を %d人ぶん書きました", n_written)


if __name__ == "__main__":
    main()
