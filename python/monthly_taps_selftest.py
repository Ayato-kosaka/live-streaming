"""**タップ数の見張りが、ちゃんと落ちられるか**を見る。

    python3 python/monthly_taps_selftest.py
    # 0=通った / 1=見張りが鳴るべきところで鳴らない / 2=数えるものが無い

## なぜ対照から見るのか（`docs/island-standards.md` §15）

タップ数は**人が渡す**ので、渡し忘れが必ず起きる。その受け皿が
ここだが、**見張りそのものが鳴らなくなっていたら
何も守っていない。** 本物の台帳を見る前に、偽の台帳をこしらえて
「足りなければ 1、揃っていれば 0」が出ることを確かめる。

揃っている本番の台帳だけを見ていると、**どんな壊れ方をしても 0 が出る**
見張りと区別がつかない。

## 見るもの

| 偽の台帳 | 出てほしい |
| --- | --- |
| ぜんぶ揃っている | 足りない 0件 |
| 1ヶ月ぶん欠けている | その月だけ 1件 |
| 欄はあるが `taps` が無い | その月だけ 1件（**「0」と「無い」は別**） |
| `taps` が数ではない / 負の数 | 壊れとして拾う |
| 月末配信の無い月が台帳にある | 余りとして拾う |
| **これから来る月**のタップ数が無い | **鳴らない**（配信が終わるまで存在しない） |
| **過ぎた月**のタップ数が無い | 鳴る（渡し忘れ） |

**両側で取る。** 「未来だから鳴らさない」だけを入れると、
過ぎた月の渡し忘れまで黙る見張りになる——それは緑のままの死体で、
対照にならない（`docs/island-standards.md` §15）。
猶予（`GRACE_DAYS`）も、**切れる前日と当日の両方**を当てる。
片側だけだと、猶予を何日に変えても対照が通ってしまう。

対照が1つでも外れたら、本物の台帳は1行も見ずに 2 で帰る。
"""

import json
import sys
import tempfile
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

from build_monthly import periods  # noqa: E402
from monthly_taps import (GRACE_DAYS, bad, due, jst_today,  # noqa: E402
                          load, missing, save)

KEYS = ["2026-01", "2026-02", "2026-03"]

# 偽の `FINALS`。**本物から切り離す**——本物は月が増えるたびに変わるので、
# そこに対照をぶら下げると、来月ひとりでに意味が変わる
FAKE = [
    {"key": "2026-01", "final": "2026-01-31"},
    {"key": "2026-02", "final": "2026-02-28"},
    {"key": "2026-03", "final": "2026-03-28"},
]
# この日から見ると、1月と2月の配信は過ぎていて、3月の配信はまだ来ていない
FAKE_TODAY = date(2026, 3, 10)


def judge(ps: list, months: dict, today: date) -> tuple:
    """月の表と台帳を突き合わせて、出す行と終了コードを決める。

    **本物も偽物もここを通す。** 判定を `main()` に書くと、
    対照で当てられるのは数えかたの部品までになり、
    「結局どの終了コードになるか」は誰も見ないままになる。

    Args:
        ps: `{"key", "final"}` の並び（`build_monthly.periods()` の返り）
        months: 台帳（`load()` の返り）
        today: JST の今日

    Returns:
        `(印字する行, 終了コード)`
    """
    keys = [p["key"] for p in ps]
    ready, waiting = due(ps, today)
    gone = missing(ready, months)
    broken = bad(months)
    extra = sorted(set(months) - set(keys))

    lines = []
    for k in gone:
        lines.append("NG %s のタップ数が渡っていません" % k)
    for k, why in broken:
        lines.append("NG %s のタップ数が読めません（%s）" % (k, why))
    for k in extra:
        lines.append("NG %s は月末配信の無い月なのに台帳にあります" % k)
    for p in ps:
        if p["key"] in waiting:
            lines.append("%s は %s の配信待ち（タップ数はそのあと）"
                         % (p["key"], p["final"]))
    # §15。「足りない 0件」は、何ヶ月ぶんを見たのかと一緒でないと読めない
    lines.append("タップ数 %d / %d ヶ月（配信待ち %d ヶ月）"
                 % (len(ready) - len(gone), len(ready), len(waiting)))
    return lines, (1 if (gone or broken or extra) else 0)


def drill() -> list:
    """偽の台帳と偽の `FINALS` で、数えるほうが正しく数えるかを見る。

    Returns:
        外れたことの一覧（空なら通った）
    """
    bads = []

    full = {k: {"taps": 1000} for k in KEYS}
    if missing(KEYS, full) != []:
        bads.append("揃っているのに足りないと言った")

    gone = {k: v for k, v in full.items() if k != "2026-02"}
    if missing(KEYS, gone) != ["2026-02"]:
        bads.append("欠けている月を拾えない")

    # **「0」と「渡っていない」は別。** 0 タップの月は 0 と書いてあるべき
    none = dict(full, **{"2026-03": {"src": "hand"}})
    if missing(KEYS, none) != ["2026-03"]:
        bads.append("taps の欄が無い月を拾えない")
    zero = dict(full, **{"2026-03": {"taps": 0}})
    if missing(KEYS, zero) != []:
        bads.append("0 タップを「渡っていない」と読んだ")

    if [k for k, _ in bad(dict(full, **{"2026-01": {"taps": "52874"}}))] != ["2026-01"]:
        bads.append("数でない taps を拾えない")
    if [k for k, _ in bad(dict(full, **{"2026-01": {"taps": -1}}))] != ["2026-01"]:
        bads.append("負の taps を拾えない")
    if bad(full) != []:
        bads.append("まともな台帳を壊れていると言った")

    bads += drill_future()
    bads += drill_jst()

    # 読み書きがひと回りするか。**書いて読んで同じ**でないと、
    # 取る道具が書き戻した値が次に消える
    with tempfile.TemporaryDirectory() as d:
        p = Path(d) / "t.json"
        p.write_text(json.dumps({"_": "のこる", "months": {}}), encoding="utf-8")
        save({"2026-01": {"taps": 7}}, p)
        back = json.loads(p.read_text(encoding="utf-8"))
        if back.get("_") != "のこる":
            bads.append("書き戻しで説明の行が消える")
        if load(p) != {"2026-01": {"taps": 7}}:
            bads.append("書いた値が読み戻せない")
    return bads


def drill_future() -> list:
    """**「まだ来ていない」と「渡し忘れ」を取り違えないか**を、両側で当てる。

    見るのは終了コード。鳴らないほうだけ当てると、
    **何があっても鳴らない見張り**が対照を通ってしまう。

    Returns:
        外れたことの一覧
    """
    bads = []
    done = {"2026-01": {"taps": 1000}, "2026-02": {"taps": 2000}}
    cases = [
        ("過ぎた月のタップ数が無い",
         FAKE, {"2026-01": {"taps": 1000}}, FAKE_TODAY, 1),
        ("これから来る月のタップ数が無い",
         FAKE, done, FAKE_TODAY, 0),
        ("過ぎた月も未来の月も揃っている",
         FAKE, dict(done, **{"2026-03": {"taps": 3000}}), FAKE_TODAY, 0),
        ("台帳の値が壊れている",
         FAKE, dict(done, **{"2026-02": {"taps": "2000"}}), FAKE_TODAY, 1),
        # 猶予の境目。**前日は黙り、当日に鳴る**——この2本が無いと、
        # `GRACE_DAYS` をいくつに変えても対照が通る
        ("配信の %d 日後（猶予が切れた日）に渡っていない" % GRACE_DAYS,
         FAKE[2:], {}, date(2026, 3, 28) + timedelta(days=GRACE_DAYS), 1),
        ("配信の %d 日後（猶予の中）に渡っていない" % (GRACE_DAYS - 1),
         FAKE[2:], {}, date(2026, 3, 28) + timedelta(days=GRACE_DAYS - 1), 0),
    ]
    for name, ps, months, today, want in cases:
        lines, code = judge(ps, months, today)
        print("対照 %s → 終了コード %d（期待 %d）" % (name, code, want))
        for ln in lines:
            print("       %s" % ln)
        if code != want:
            bads.append("%s: 終了コード %d（期待 %d）" % (name, code, want))
    return bads


def drill_jst() -> list:
    """**日本時間で切れているか。** UTC のまま判定すると、まる1日ずれる。

    Returns:
        外れたことの一覧
    """
    bads = []
    # 日本の 11/01 の未明（UTC ではまだ 10/31）
    if jst_today(datetime(2026, 10, 31, 22, 0, tzinfo=timezone.utc)) != date(2026, 11, 1):
        bads.append("UTC の 10/31 22:00 を JST の 11/01 と読めない")
    # 日本の 11/03 の夜（UTC ではまだ 11/03 の昼）
    if jst_today(datetime(2026, 11, 3, 14, 59, tzinfo=timezone.utc)) != date(2026, 11, 3):
        bads.append("UTC の 11/03 14:59 を JST の 11/03 と読めない")
    return bads


def main() -> int:
    bads = drill()
    if bads:
        for b in bads:
            print("NG 対照: %s" % b)
        return 2
    print("対照 OK")

    ps = periods()
    if not ps:
        print("NG 数える月が1つもありません")
        return 2
    lines, code = judge(ps, load(), jst_today())
    for ln in lines:
        print(ln)
    return code


if __name__ == "__main__":
    sys.exit(main())
