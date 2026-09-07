"""あやと島カードを、手で組み立てる。

中身は `python/island_cards.py` そのもの。**写しは持たない。**
毎日のぶんはチャット取り込みのワークフローからあちらが走る。ここは
台帳や画像を入れ直したあと、**その場でカードを作り直したい**ときの口。

    script: cards_build
    args:   {}              … 何ができるか出すだけ（既定）
    args:   {"apply": true} … 作る

**既定は書かない。** 誰にどのカードが渡るかを先に出す。
"""

import os
import sys

from _fs import args, log

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import island_cards  # noqa: E402


def main() -> None:
    a = args()
    argv = [sys.argv[0]]
    if not a.get("apply", False):
        argv.append("--dry-run")
    log.info("引数: %s", " ".join(argv[1:]) or "（そのまま作ります）")
    sys.argv = argv
    raise SystemExit(island_cards.main())


main()
