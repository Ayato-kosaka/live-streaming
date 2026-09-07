"""YouTube のプロフィール写真を、手で取り込む。

中身は `python/island_channel_photos.py` そのもの。**写しは持たない。**
毎日のぶんはチャット取り込みのワークフローからあちらが走る。

ここを置いたのは、**あのジョブが一度も本番で動いていない**ため
（2026-09-07 に入れたばかり）。旅が始まるとあやとは確かめられないので、
出発前に1回通しておく。

    script: photos_pull
    args:   {}                          … 誰を引くか出すだけ（既定）
    args:   {"apply": true}             … 書く
    args:   {"apply": true, "max": 50}  … 人数を絞って試す

**既定は書かない。** YouTube の枠を使うので、誰を引くのか先に見る。
"""

import os
import sys

from _fs import args, log

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import island_channel_photos  # noqa: E402


def main() -> None:
    a = args()
    argv = [sys.argv[0]]
    if a.get("max"):
        argv += ["--max", str(int(a["max"]))]
    if a.get("days"):
        argv += ["--days", str(int(a["days"]))]
    if not a.get("apply", False):
        argv.append("--dry-run")
    log.info("引数: %s", " ".join(argv[1:]) or "（そのまま流します）")
    sys.argv = argv
    raise SystemExit(island_channel_photos.main())


main()
