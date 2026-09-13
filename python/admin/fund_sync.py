"""豚の貯金箱の掃除を、手で流す。

中身は `python/fund_daily.py` そのもの。**写しは持たない**（2つに分けると、
片方だけ直した日に額が変わる）。ここは入力の受け取り方だけを
「管理スクリプトを実行」の形（ARGS の JSON）に合わせる薄い口。

毎晩のぶんは、チャット取り込みのワークフロー（`schedule_fetch_chat.yml`）から
あちらが走る。ここを使うのは、

  - 取り込みがこけた翌日に、もう一度そろえたいとき
  - 古いぶんを入れると決めたとき（`{"days": 400, "apply": true}`）

    script: fund_sync
    args:   {}                         … 何が入るか見るだけ（既定）
    args:   {"apply": true}            … 直近3日ぶんを控えに足して、合計を焼く
    args:   {"days": 400}              … **全期間の下見。** 何がいくら増えるか
    args:   {"days": 400, "apply": true, "sweep": true}
                                       … **全期間を書く。貯金箱の額が動く。**
                                          `sweep` が無いと 31日より前は書かない
                                          （押し間違いで額を動かさないため）

**既定は書かない。** 額の話なので、先に何がいくら増えるかを出す。
"""

import os
import sys

from _fs import args, log

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import fund_daily  # noqa: E402


def main() -> None:
    """エントリポイント。"""
    a = args()
    argv = [sys.argv[0], "--days", str(int(a.get("days", 3)))]
    if a.get("sweep", False):
        argv.append("--sweep")
    if not a.get("apply", False):
        argv.append("--dry-run")

    log.info("引数: %s", " ".join(argv[1:]))
    sys.argv = argv
    raise SystemExit(fund_daily.main())


main()
