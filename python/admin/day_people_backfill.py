"""「その日いた人」の名簿（islandDayPeople）を、手で埋め直す。

中身は `python/island_day_people.py` そのもの。**写しは持たない。**
毎晩のぶんは `.github/workflows/rebake.yml` からあちらが走る。ここは
**最初の1回（過去ぶん）** と、作り直したいときの口。

    script: day_people_backfill
    args:   {}                             … 直近7日を出すだけ（既定は書かない）
    args:   {"days": 30}                   … 直近30日を出すだけ
    args:   {"days": 30, "apply": true}    … 直近30日を書く
    args:   {"day": "2026-09-13", "apply": true}  … その日だけ
    args:   {"all": true, "apply": true}   … 全期間

**既定は書かない。** 先に日ごとの人数を見る。

**名簿は足す方向にしか動かない。** 何度流しても人は減らないので、
埋め直しで壊れることはない（`island_day_people.py` の `merge_day`）。

チャット取り込みごと回せば同じことは起きるが、**あちらは YouTube の
割り当てを食う**（Discovery が1回100ユニット）。名簿を埋め直したいだけの
ときに、配信の探索まで走らせる理由はない（`tips_pull.py` と同じ考え）。
"""

import os
import sys

from _fs import args, log

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import island_day_people  # noqa: E402


def main() -> None:
    a = args()
    argv = [sys.argv[0]]
    if a.get("all"):
        argv.append("--all")
    elif a.get("day"):
        argv += ["--day", str(a["day"])]
    else:
        argv += ["--days", str(int(a.get("days", 7)))]
    if a.get("apply", False):
        argv.append("--apply")
    log.info("引数: %s", " ".join(argv[1:]))
    sys.argv = argv
    raise SystemExit(island_day_people.main())


main()
