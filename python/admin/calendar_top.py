"""卓上カレンダー（#786）の住人——**その月の投げ銭ランキング上位7人**——を、本番の値で数える。

    script: calendar_top
    args:   {"from": "2026-01", "to": "2026-12"}     … 暦の月（日本時間）ごと
            {"periods": {"2026-09c": ["2026-08-29", "2026-09-25"]}}
                                                    … 期間を直に（月末配信の期間など）

**1バイトも書かない。** 手順は `docs/goods-calendar.md` 2章の3。

## 数え方は月末と1本

1か月ぶんを `monthly_tips_run.standing()` に渡すだけ。問い合わせ（スパチャ・
Doneru・円以外のスパチャ）も、台帳（`islandTips`。円に直した額と**島の投げ銭**）も、
名寄せと順位（`monthly_tips.standings()`）も、月末の授賞式と同じもの。
**式（`fund_box.viewer_yen()`）も問い合わせも、ここに写さない。**

### なぜ BigQuery の1本（前の `tools/goods/calcast/rank.sql`）をやめたか（#1405）

島の投げ銭（決定の記録 0017）は BigQuery に入らず、台帳にしか無い。SQL の中で
順位まで付けると、貢献額の式（`DIV(sc, 2) + dn`）を SQL にもう1本持つことになり、
**3つ目の出どころが入った日に、そこだけ抜けた。** 同じ理由で、円以外のスパチャ
（#951。台帳の換算）と Doneru の寄せ（#1067。`doneru/dedup.py`）も抜けていた——
どれも月末の側にだけ足されて、写しには届いていなかった。

## 上位7人の切りかた

**順位が7以内の人を全部**（同額の7位は全員。`docs/goods-calendar.md` 1章）。
同じ額の人の並びは `rank()` が名前で決める。図鑑に当たらなかった人も、順位には
入れたまま「図鑑なし」で出す（絵が無いので描かない、を決めるのは人。消すと
8位以下が繰り上がったように見える）。

## ログに出すもの（**公開のログ**）

**順位・呼び名・図鑑のID だけ。額は出さない**（`tools/goods/calcast/README.md`）。
月末配信の期間でない月の額は、授賞式でも `/months` でも出していない額で、
例外（`docs/island-money.md` 2.1）の外にある。図鑑のIDは絵の URL に入っている値で、
月末（`monthly_tips_run`）も出している。チャンネルID・どねIDは出さない。
"""

import json
import os
import re
import sys
from datetime import date

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from _fs import args, db, log, readonly  # noqa: E402
from _seal import chunks  # noqa: E402
import monthly_tips_run as mtr  # noqa: E402

#: 何位までを住人にするか（`docs/goods-calendar.md` 1章）
TOP = 7

#: 一度に数えてよい月の数。**押し間違いで何年ぶんも回さない**ための線
MONTHS_MAX = 24

_MONTH = re.compile(r"^(\d{4})-(\d{2})$")
_DAY = re.compile(r"^\d{4}-\d{2}-\d{2}$")


def months(a: str, b: str) -> list:
    """`2026-01` から `2026-12` までの暦の月を、`(名前, 初日, 末日)` の並びにする。

    Args:
        a: 始まりの月（`YYYY-MM`。この月を含む）
        b: 終わりの月（この月を含む）

    Returns:
        `("2026-01", "2026-01-01", "2026-01-31")` の並び。形が違えば ValueError
    """
    ma, mb = _MONTH.match(str(a or "")), _MONTH.match(str(b or ""))
    if not ma or not mb:
        raise ValueError("from / to は YYYY-MM で渡す")
    y, m = int(ma[1]), int(ma[2])
    end = (int(mb[1]), int(mb[2]))
    if not (1 <= m <= 12 and 1 <= end[1] <= 12) or (y, m) > end:
        raise ValueError("from / to の月が読めない（from が to より後）")
    out = []
    while (y, m) <= end:
        ny, nm = (y + 1, 1) if m == 12 else (y, m + 1)
        last = date.fromordinal(date(ny, nm, 1).toordinal() - 1)
        out.append((f"{y:04d}-{m:02d}", f"{y:04d}-{m:02d}-01", last.isoformat()))
        y, m = ny, nm
        if len(out) > MONTHS_MAX:
            raise ValueError(f"一度に数えるのは {MONTHS_MAX}か月まで")
    return out


def periods_of(a: dict) -> list:
    """入力から、数える期間の並びを作る。`from`/`to`（暦の月）と `periods`（直に）を足せる。

    Args:
        a: `ARGS`

    Returns:
        `(名前, 初日, 末日)` の並び。名前の順
    """
    out = []
    if a.get("from") or a.get("to"):
        out += months(a.get("from"), a.get("to"))
    for name, span in sorted((a.get("periods") or {}).items()):
        d0, d1 = (list(span) + ["", ""])[:2]
        if not _DAY.match(str(d0)) or not _DAY.match(str(d1)) or d0 > d1:
            raise ValueError(f"periods の {name} が読めない（[YYYY-MM-DD, YYYY-MM-DD]）")
        out.append((str(name), str(d0), str(d1)))
    if not out:
        raise ValueError('数える期間が無い（{"from": "2026-01", "to": "2026-12"} など）')
    return out


def top(rows: list, n: int = TOP) -> list:
    """`rank()` の並びから、**順位が n 以内の人を全部**（同額の n 位は全員）。

    Args:
        rows: `monthly_tips.rank()` の返り値（貢献額の多い順）
        n: 何位まで

    Returns:
        同じ形の並び
    """
    return [r for r in rows if int(r["rank"]) <= n]


def shown(rows: list) -> list:
    """公開のログと注記に出す形。**額は落とす。** 出すのは順位・呼び名・図鑑のIDだけ
    （どの出どころで投げた人かも出さない。絵を描くのに要らない）。"""
    return [{"rank": r["rank"], "display": r["display"], "icon": r["char"] or None}
            for r in rows]


def count(ro, r, spans: list) -> dict:
    """期間ごとに順位を組んで、上位を返す。**額は持ったまま返す**（selftest が式と突き合わせる）。

    Args:
        ro: 読み専用のクライアント
        r: 図鑑（`monthly_tips_run.roster()`）
        spans: `periods_of()` の返り値

    Returns:
        名前 → `{"top", "people", "island_stuck", "fx_stuck"}`
    """
    out = {}
    for name, d0, d1 in spans:
        st = mtr.standing(ro, r, d0, d1)
        out[name] = {
            "span": [d0, d1],
            "top": top(st["rows"]),
            "people": len(st["rows"]),
            "island_stuck": st["island_stuck"],
            "fx_stuck": len(st["fx_stuck"]),
        }
    return out


def main() -> None:
    try:
        spans = periods_of(args())
    except ValueError as e:
        log.error("%s", e)
        sys.exit(1)
    log.info("数える期間 %d（日本時間）。**1バイトも書きません。額は出しません。**", len(spans))

    ro = readonly(db())
    r = mtr.roster(ro)
    got = count(ro, r, spans)

    for name, g in got.items():
        log.info("--- %s（%s 〜 %s）: 貢献した人 %d人 ---", name, g["span"][0], g["span"][1],
                 g["people"])
        # 足りないぶんがある月は、順位がそのぶんずれうる。**黙らない**
        if g["island_stuck"] or g["fx_stuck"]:
            log.warning("  足せなかった行: 島の投げ銭 %d件 / 円以外のスパチャ %d件"
                        "（月末の monthly_tips_run で名指しされる）",
                        g["island_stuck"], g["fx_stuck"])
        for x in shown(g["top"]):
            log.info("  %2d位 %-28s %s", x["rank"], x["display"],
                     x["icon"] or "（図鑑なし）")

    # `sheet.py` に渡す図鑑のIDの並びは、ここから持ち帰る（注記は作業箱の gh でも読める）
    out = json.dumps({name: shown(g["top"]) for name, g in got.items()},
                     ensure_ascii=False)
    print("JSON=" + out)
    for line in chunks(out):
        print("::notice::" + line)


if __name__ == "__main__":
    main()
