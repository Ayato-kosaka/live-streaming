"""北欧旅の「着いた」と「旅がおわった」を記録する・取り消す。

**この2つは別の出来事。** あやとの言葉（2026-09-06）:

> ストックホルム出るまでが北欧旅です。

9月20日の朝にストックホルムへ着いて、そこから7泊して、27日にティラナへ発つ。
着いた日で企画を終わらせると、いちばん長い滞在がまるごと
「もう行ってきた」になる（実際にそうなっていた）。

| Firestore | 何の事実か | 画面 |
| --- | --- | --- |
| `nordic.arrivedOn` | ストックホルムに着いた日 | `/nordic` の大きい字が「着いた」になる |
| `nordic.endedOn` | 旅が終わった（発った）日 | `/next` の企画が「行ってきた」になる |

ふだんはあやとが `/nordic` の旅程表のいちばん下、「着く」「旅のおわり」の
2行にあるボタンから押す（`site/components/nordic/GoalRow.tsx`）。ここは
**そちらが使えないときの逃げ道**と、日付を1日ずらしたいときのため。

「管理スクリプトを実行」（`.github/workflows/run_admin_script.yml`）から
`script: nordic_arrived` で呼ぶ。

ARGS 例:
  {}                              いま入っている値を見るだけ
  {"date": "2026-09-20"}          その日に着いた、と記録する
  {"date": ""}                    着いたのを取り消す
  {"ended": "2026-09-27"}         その日に旅が終わった、と記録する
  {"ended": ""}                   終わったのを取り消す

**着いた日は、船がストックホルムに入った日。** 会えた日ではない。
会えたかどうかはサイトのゴールにしていない（`docs/nordic-fund.md` 1章）。
"""

import re

from _fs import args, db, log

DAY = re.compile(r"^\d{4}-\d{2}-\d{2}$")

# 引数の名前 → Firestore の項目名。どちらも空文字で取り消せる。
FIELDS = {"date": "arrivedOn", "ended": "endedOn"}


def main() -> None:
    """エントリポイント。"""
    a = args()
    ref = db().collection("island").document("state")

    want = {k: v for k, v in FIELDS.items() if k in a}
    if not want:
        cur = (ref.get().to_dict() or {}).get("nordic") or {}
        log.info("island/state.nordic = %s", cur)
        return

    patch: dict[str, object] = {}
    for arg, field in want.items():
        date = str(a[arg] or "").strip()
        if date and not DAY.match(date):
            log.error("%s は YYYY-MM-DD で渡してください: %s", arg, date)
            raise SystemExit(1)
        # 空で消さずに null を置く。項目そのものが消えると、
        # 「まだ読んでいない」と「まだ起きていない」が画面から見分けられない
        patch[field] = date or None

    ref.set({"nordic": patch}, merge=True)
    for field, date in patch.items():
        log.info("island/state.nordic.%s = %s", field, date or "(まだ)")


main()
