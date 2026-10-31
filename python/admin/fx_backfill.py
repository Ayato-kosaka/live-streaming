"""**台帳に残っている「円に直っていない投げ銭」を、その日のレートで埋める。**

    script: fx_backfill
    args:   {}                      … 下見（**1バイトも書かない**）
            {"apply": true}         … 書く
            {"apply": true, "limit": 3}   … 先に少しだけ
            {"day": "2026-01-09"}   … その日だけ見る

## なぜ要るか（2026-10-18。#951）

円以外の投げ銭を**その日のレートで円に直して足す**ようになったが、
直しているのは**取り込みのとき**（`python/island_tips.py` の `yen_of`）で、
取り込みが見るのは**直近7日**しかない（`DEFAULT_DAYS`）。

つまり、**換算を入れる前に台帳へ入った行は、放っておくと永久に直らない。**
2026-10-18 の本番には2件あった（2026-01-09 の CAD と 2026-05-07 の ILS）。
**どちらもその人の生涯でただ1回の投げ銭**なので、その2人は貢献額が丸ごと
0円 の人として島に立っていた（`docs/island-misses.md` #290）。

口が落ちていた晩に取りこぼしたぶんも、同じようにここで拾える。

## 何を書くか

触るのは4つの欄だけ——`amountJpy` / `fxRate` / `fxDate` / `fxWhy`。
**元の表記（`amount` / `currency`）には1バイトも触らない。** 直した値だけ
持つと、あとでレートを引き直して検算できなくなる。

書き方も `island_tips.py` と同じ `merge=True` で、**消す道が1本も無い。**
`same()` があの4つを見ているので、ここで入れた値は**次の晩の取り込みでも
書き換わらない**（同じレート・同じ日が返るので「変わっていない」になる）。

## **頼んだ日ではなく、返ってきた日**を入れる

土日のレートは存在しない。ECB は営業日しか出さないので、土曜の日付で
頼むと直前の営業日の値が返る。`fxDate` に入れるのは**返ってきた日**
（`python/fx_rate.py`）。頼んだ日を入れると、あとで検算したときに
「その日のレートなんて無い」になって合わなくなる。

## 直せなかったものは、**書かない**

台湾ドル（TWD / NT$）はこの口が持っていない。口が落ちていることもある。
**0 を入れない**（`docs/island-standards.md` 10）。何件がどの理由で
残ったかは出すので、残っているあいだは `fx-tips` の issue が開いたままになる
（`python/fx_tips_watch.py`）。

## ログ

このリポジトリは公開で、Actions のログも誰でも読める。
**出すのは件数・通貨・理由・レートと、書類IDの指紋だけ。**
チャンネルID・名前・元の表記（実額）は1文字も出さない
（`docs/island-money.md` 2章。`python/logsafe.py`）。
"""

import os
import sys

from _fs import args, db, log, notice, readonly

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import fx_rate  # noqa: E402
from logsafe import mask  # noqa: E402

# 台帳。**円に直した額が入るのはここだけ**
TIPS = "islandTips"

# 1回のまとめ書きに入れる上限。`python/island_tips.py` の BATCH と同じ
BATCH = 400


def stuck_rows(client, day=None) -> list:
    """**円に直っていない行**を拾う。読むだけ。

    絞り込みは手元でやる。`currency` で Firestore に投げると、
    **円以外が増えるたびに索引が要る**（`day` 1本の並べ替えだけなら
    自動でできる索引で足りる）。台帳は数千件なので全部読んでも安い。

    Args:
        client: Firestore のクライアント（読み専用でよい）
        day: その日だけ見るなら YYYY-MM-DD。省くと全部

    Returns:
        `{"id", "day", "amount", "currency"}` の並び
    """
    col = client.collection(TIPS)
    docs = col.where("day", "==", day).stream() if day else col.stream()
    out = []
    for d in docs:
        v = d.to_dict() or {}
        cur = str(v.get("currency") or fx_rate.TARGET).upper()
        if cur == fx_rate.TARGET:
            continue
        yen, why = fx_rate.row_yen(v)
        if yen is not None:
            continue
        # 額そのものが読めない行は、レートを引いても直らない
        if why == "amount":
            log.warning("額が読めない行が1件あります（指紋 %s）。"
                        "レートでは直りません", mask(d.id))
            continue
        out.append({"id": d.id, "day": str(v.get("day") or ""),
                    "amount": v.get("amount"), "currency": cur})
    # 日付順。**実行のたびに入れ替わらないように**、同じ日は書類IDで決める
    out.sort(key=lambda r: (r["day"], r["id"]))
    return out


def convert(rows) -> tuple:
    """1行ずつレートを引いて、**書く中身**を組む。外へ出るのはここだけ。

    Args:
        rows: `stuck_rows()` の返り値

    Returns:
        (書けるもの `[(書類ID, 中身)]`, 直せなかったもの `[(行, 理由)]`)
    """
    ready, left = [], []
    for r in rows:
        got = fx_rate.to_jpy(r["amount"], r["currency"], r["day"])
        if got["yen"] is None:
            left.append((r, got["why"]))
            continue
        ready.append((r, {
            "amountJpy": got["yen"],
            "fxRate": got["rate"],
            # **頼んだ日ではなく、返ってきた日**（土日は直前の営業日）
            "fxDate": got["date"],
            # 直ったので理由は消す。`island_tips.py` の `yen_of` と同じ形に
            # しておかないと、次の晩の取り込みが「変わった」と見て書き直す
            "fxWhy": None,
        }))
    return ready, left


def write(client, ready) -> int:
    """まとめて書く。**触るのは4つの欄だけ**（`merge=True`）。

    Args:
        client: Firestore のクライアント（**読み専用を渡すと止まる**）
        ready: `convert()` が組んだ `[(行, 中身)]`

    Returns:
        書いた件数
    """
    done = 0
    for i in range(0, len(ready), BATCH):
        batch = client.batch()
        for r, data in ready[i:i + BATCH]:
            batch.set(client.collection(TIPS).document(r["id"]), data,
                      merge=True)
        batch.commit()
        done += len(ready[i:i + BATCH])
    return done


def main() -> int:
    """下見して、直せるぶんだけ書く。

    Returns:
        終了コード。0=見た／書いた（直せないものが在っても 0。
        それは `fx-tips` の issue が持つ）
    """
    a = args()
    apply = bool(a.get("apply"))
    limit = int(a.get("limit") or 0)
    day = a.get("day") or None

    # **下見は書く口ごと塞ぐ**（`_fs.readonly`）。呼ぶ側の `if` を
    # 書き忘れても、そこで止まる
    live = db()
    client = live if apply else readonly(live)

    rows = stuck_rows(client, day)
    log.info("円に直っていない投げ銭 %d件%s", len(rows),
             f"（{day} だけ）" if day else "（台帳ぜんぶ）")
    if not rows:
        notice("円に直っていない投げ銭は0件でした")
        return 0

    if limit:
        rows = rows[:limit]
        log.info("そのうち先に %d件だけ見ます", len(rows))

    ready, left = convert(rows)
    for r, data in ready:
        # **額は出さない。** 出すのは日付・通貨・レートと、書類IDの指紋だけ
        log.info("  %s  %-4s  レート %s（レートの日 %s）  指紋 %s",
                 r["day"], r["currency"], data["fxRate"], data["fxDate"],
                 mask(r["id"]))
    for r, why in left:
        log.warning("  %s  %-4s  **直せません**（%s）  指紋 %s",
                    r["day"], r["currency"], fx_rate.WHY.get(why, why),
                    mask(r["id"]))

    # **注記にも内訳を出す。** Actions の生ログは口から読めない（置き場が
    # 別）ので、押したあとに何が動いたかを確かめられるのは注記だけ。
    # 出すのは**日付と通貨**まで——`fx-tips` の issue が公開で出しているのと
    # 同じ粒度で、額もチャンネルIDも入らない
    def digest(items) -> str:
        return " / ".join(f"{r['day']} {r['currency']}" for r in items) or "なし"

    if not apply:
        log.info("下見です。**1バイトも書いていません。**"
                 ' 書くには {"apply": true} を付けてください')
        notice(f"下見: 直せる {len(ready)}件（{digest([r for r, _ in ready])}）"
               f" / 直せない {len(left)}件（{digest([r for r, _ in left])}）")
        return 0

    done = write(live, ready)
    log.info("書きました: %d件。直せなかったのは %d件", done, len(left))
    notice(f"円に直した {done}件（{digest([r for r, _ in ready])}）"
           f" / 直せなかった {len(left)}件（{digest([r for r, _ in left])}）")
    if left:
        log.warning("直せなかったぶんは貢献額に入りません。"
                    "fx-tips の issue が開いたままになります")
    return 0


if __name__ == "__main__":
    sys.exit(main())
