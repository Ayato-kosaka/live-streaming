"""チャンネルIDと名前の辞書を、手で作り直す。

中身は `python/island_channels.py` そのもの。**写しは持たない。**
毎日のぶんはチャット取り込みのワークフローからあちらが走る。ここは、
入れたばかりで辞書がまだ空のときや、作り直したいときの口。

    script: channels_pull
    args:   {}              … 何件変わるか見るだけ（既定）
    args:   {"apply": true} … Firestore に書く

**既定は書かない。** 初回は2,000件を超えるので、先に件数を見る。
"""

import os
import sys

from _fs import args, log

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import island_channels  # noqa: E402


def main() -> None:
    a = args()
    argv = [sys.argv[0]]
    if not a.get("apply", False):
        argv.append("--dry-run")
    log.info("引数: %s", " ".join(argv[1:]) or "（そのまま流します）")
    sys.argv = argv
    raise SystemExit(island_channels.main())


main()
