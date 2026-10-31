"""`doneru_donations` から「1件の寄付につき1行」を取り出す。#1067

    from doneru.dedup import dedup_sql
    sql = dedup_sql(BQ_PROJECT_ID, BQ_DATASET,
                    columns=["donor_name", "CAST(amount AS INT64) AS yen"],
                    where="donated_at IS NOT NULL AND DATE(donated_at, 'Asia/Tokyo') "
                          "BETWEEN @d0 AND @d1")

**引く側はここを通す。** 置き場（BigQuery）には同じ寄付が2行入っている。

## なぜ `donation_id` で寄せないのか

Doneru の CSV に**寄付1件ごとの ID が無い**（`どねID` は人のID）。なので
主キーは `python/doneru/normalizer.py` の `_fallback_id()` が
**レコードの中身まるごとの sha256** で作っている。

その「中身」に**精算状態（`status`：振込待ち／振込完了）と実際精算金額
（`settlement_amount`）が入っている。** つまり寄付が振り込まれて状態が
変わった瞬間に、同じ寄付が**別の鍵で生え直す。** MERGE は
`T.donation_id = S.donation_id` で突き合わせるので古い行には当たらず、
**古い行がそのまま残って2行になる。**

実測（2026-09-26〜2026-10-30）: 置き場の行 30 / 実際の寄付 26 /
重なっていた組 4。4組とも日・人・額・本文が同じで、違うのは精算状態だけ。
同じ期間の `振込完了` は4件で、重なった組も4組。
**振り込まれれば必ず起きる**（払われた寄付が、1件で2回数えられる）。

だから `GROUP BY donation_id` では1件に寄らない。**鍵そのものが
増えている**ので、寄せるには中身で見るしかない。

## `_fallback_id()` を直さないのはなぜか

直すと**既存の全行の鍵が変わって、もう一度全件が二重になる**
（MERGE が古い鍵に当たらない）。移行（古い行を落とす段取り）が要るので、
**この口は読む側で止める。** 元を直すのは別の変更。

## 残っている取りこぼし

**同じ人が同じ時刻に同じ額を同じ言葉で2回投げたぶんは、1件に寄る。**
`normalizer.normalize_all()` は中身が同じ行に `#1` `#2` と番号を振って
2件として残しているが、こちらの鍵（下の `KEY`）にはその番号が入らない。

番号を鍵に足しても直らない。精算状態が片方だけ変わると、2件がそれぞれ
別の sha256 になって**どちらも `#1`** になるので、番号では割れない。
**元（`_fallback_id`）から精算状態を外すまでは、ここは割り切る。**
"""

from typing import Any, Iterable, Mapping, Sequence

#: 振り込まれた行の `status`。**あとから来た真実**なので、こちらを残す
SETTLED = "振込完了"

#: 寄せる鍵。**日・人・額・本文が同じなら同じ寄付**という決め。
#: `status` と `settlement_amount` は入れない——そこが変わるから2行になる
KEY: tuple[str, ...] = ("viewer_pk", "donated_at", "amount", "message_text")

#: 同じ鍵の中で並べる順。`振込完了` が先、そのあと取り込みの新しいほう
ORDER = f"IF(status = '{SETTLED}', 0, 1), ingested_at DESC"

#: 窓関数の列名。`SELECT *` に混ざらないよう、外で落とす
RN = "_dedup_rn"


def dedup_key(row: Mapping[str, Any]) -> tuple:
    """1行から寄せる鍵を取り出す。SQL の `PARTITION BY` と同じもの。"""
    return tuple(row.get(c) for c in KEY)


def settled_rank(row: Mapping[str, Any]) -> int:
    """`振込完了` なら 0、それ以外は 1。SQL の `IF(...)` と同じもの。

    小さいほうを残す。
    """
    return 0 if row.get("status") == SETTLED else 1


def _ingested(row: Mapping[str, Any]) -> str:
    """取り込んだ時刻。無い行は**いちばん古い**として扱う。

    `None` を他の値と比べると落ちるので、空文字に落としておく
    （ISO の字は辞書順＝時刻順なので、字のまま比べてよい）。
    """
    got = row.get("ingested_at")
    return "" if got is None else str(got)


def better(a: Mapping[str, Any], b: Mapping[str, Any]) -> bool:
    """`a` のほうを残すか。SQL の `ORDER BY` と同じ順。

    `振込完了` が先。それでも並ばないときは取り込みの新しいほう。
    """
    ra, rb = settled_rank(a), settled_rank(b)
    if ra != rb:
        return ra < rb
    return _ingested(a) > _ingested(b)


def pick(rows: Iterable[Mapping[str, Any]]) -> list:
    """同じ鍵の行を1行に寄せる。**`rn = 1` を採るのと同じ判定。**

    SQL を手元で実行できないので、寄せの判定だけはここに割ってある
    （`python/doneru_dedup_selftest.py` がこの関数を見ている）。

    Args:
        rows: `doneru_donations` の行

    Returns:
        1件の寄付につき1行。並びは**鍵が最初に出てきた順**
    """
    best: dict = {}
    for row in rows:
        k = dedup_key(row)
        cur = best.get(k)
        if cur is None or better(row, cur):
            best[k] = row
    return list(best.values())


def dedup_sql(
    project: str,
    dataset: str,
    *,
    table: str = "doneru_donations",
    columns: Sequence[str] | str = "*",
    where: str = "",
) -> str:
    """1件の寄付につき1行だけ返す `SELECT` を組む。

    返すのは副問い合わせに置ける形なので、呼ぶ側は
    `FROM ({dedup_sql(...)})` と差し込む。**`GROUP BY donation_id` は
    残してよい**（donation_id の重複も依然ありうる）。

    Args:
        project: BigQuery のプロジェクトID
        dataset: データセット名
        table: 表の名前
        columns: 欲しい列。式に別名を付けたものでよい。既定は全部
        where: 絞り込み（`WHERE` は付けずに中身だけ）。
            **鍵（`KEY`）に入っている列だけで絞る**こと——
            `status` で絞ると、寄せる前に片方が消えて選べなくなる

    Returns:
        `SELECT` の字
    """
    cols = columns if isinstance(columns, str) else ",\n    ".join(columns)
    cond = where.strip() or "TRUE"
    return (
        f"SELECT * EXCEPT ({RN}) FROM (\n"
        f"  SELECT\n"
        f"    {cols},\n"
        f"    ROW_NUMBER() OVER (\n"
        f"      PARTITION BY {', '.join(KEY)}\n"
        f"      ORDER BY {ORDER}\n"
        f"    ) AS {RN}\n"
        f"  FROM `{project}.{dataset}.{table}`\n"
        f"  WHERE {cond}\n"
        f")\n"
        f"WHERE {RN} = 1"
    )
