"""Doneru の投げ銭を名簿に足す（手で流す版）。

中身は `python/doneru_supporters.py` そのもの。**写しは持たない**（2つに
分けると、片方だけ直した日に挙動が変わる）。ここは入力の受け取り方だけを
「管理スクリプトを実行」の形（ARGS の JSON）に合わせる薄い口。

毎日のぶんは、チャット取り込みのワークフローからあちらが走る。
ここを使うのは、対応表（`python/donors_seed.json` → `donors_import`）を
直したあとに、その場で流し直したいとき。

    script: doneru_pull
    args:   {"days": 3}                 … 誰が入るか見るだけ（既定）
    args:   {"days": 3, "apply": true}  … 名簿に書く
    args:   {"day": "2026-09-06", "apply": true}

**既定は書かない。** 本番の名簿なので、先に何が入るかを出す。

終了コードは本体と同じで、**紐付け待ちの どねID が残っていると 1**。
ここから流したときも、ワークフローが赤くなることで気づける。
"""

import os
import sys

from _fs import args, log

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import doneru_supporters  # noqa: E402


def main() -> None:
    a = args()
    argv = [sys.argv[0]]
    if a.get("day"):
        argv += ["--day", str(a["day"])]
    else:
        argv += ["--days", str(int(a.get("days", 3)))]
    if not a.get("apply", False):
        argv.append("--dry-run")

    log.info("引数: %s", " ".join(argv[1:]))
    sys.argv = argv
    raise SystemExit(doneru_supporters.main())


main()
