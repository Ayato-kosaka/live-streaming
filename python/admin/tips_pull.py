"""投げ銭の台帳（islandTips）を、手で作る。

中身は `python/island_tips.py` そのもの。**写しは持たない。**
毎日のぶんはチャット取り込みのワークフローからあちらが走る。ここは
**最初の1回（全期間）** と、作り直したいときの口。

    script: tips_pull
    args:   {"all": true}                … 全期間を出すだけ（既定は書かない）
    args:   {"all": true, "apply": true} … 全期間を書く
    args:   {"days": 7, "apply": true}   … 直近7日

**既定は書かない。** 最初の1回は1,000件を超えるので、先に件数を見る。

チャット取り込みごと回せば同じことは起きるが、**あちらは YouTube の
割り当てを食う**（Discovery が1回100ユニット）。台帳を入れ直したいだけの
ときに、配信の探索まで走らせる理由はない。
"""

import os
import sys

from _fs import args, log

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import island_tips  # noqa: E402


def main() -> None:
    a = args()
    argv = [sys.argv[0]]
    if a.get("all"):
        argv.append("--all")
    elif a.get("day"):
        argv += ["--day", str(a["day"])]
    else:
        argv += ["--days", str(int(a.get("days", 7)))]
    if not a.get("apply", False):
        argv.append("--dry-run")
    log.info("引数: %s", " ".join(argv[1:]))
    sys.argv = argv
    raise SystemExit(island_tips.main())


main()
