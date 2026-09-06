"""「ストックホルムに着いた」を記録する・取り消す。

**旅が終わったという事実は、ここにしか無い。** これが入るまで、
`/next` の企画は「いま行っているところ」のままで、`/nordic` は
「ストックホルムまで」と言い続ける（`docs/nordic-depart.md`）。

ふだんはあやとが `/nordic` の旅程表のいちばん下、「着いた朝」の行にある
ボタンから押す（`site/components/nordic/GoalRow.tsx`）。ここは
**そちらが使えないときの逃げ道**と、日付を1日ずらしたいときのため。

「管理スクリプトを実行」（`.github/workflows/run_admin_script.yml`）から
`script: nordic_arrived` で呼ぶ。

ARGS 例:
  {}                            いま入っている値を見るだけ
  {"date": "2026-09-19"}        その日に着いた、と記録する
  {"date": ""}                  取り消す（まだ着いていないことにする）

**着いた日は、船がストックホルムに入った日**（`Day` の7日目）。
会えた日ではない。会えたかどうかはサイトのゴールにしていない
（`docs/nordic-fund.md` 1章）。
"""

import re

from _fs import args, db, log

DAY = re.compile(r"^\d{4}-\d{2}-\d{2}$")


def main() -> None:
    """エントリポイント。"""
    a = args()
    ref = db().collection("island").document("state")

    if "date" not in a:
        cur = (ref.get().to_dict() or {}).get("nordic") or {}
        log.info("island/state.nordic = %s", cur)
        return

    date = str(a["date"] or "").strip()
    if date and not DAY.match(date):
        log.error("date は YYYY-MM-DD で渡してください: %s", date)
        raise SystemExit(1)

    # 空で消さずに null を置く。項目そのものが消えると、
    # 「まだ読んでいない」と「着いていない」が画面から見分けられない
    ref.set({"nordic": {"arrivedOn": date or None}}, merge=True)
    log.info(
        "island/state.nordic.arrivedOn = %s",
        date or "(まだ着いていない)",
    )


main()
