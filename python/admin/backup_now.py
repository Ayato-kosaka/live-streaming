"""退避を1回まわす（`python/backup/run.py` の口）。

毎晩は `.github/workflows/backup.yml` が回す。ここは**手で1回まわしたいとき**と、
新しいワークフローがまだ master に無いあいだの入口。

ARGS 例:
  {}                    … 実際に取る
  {"dry_run": true}     … 何をどれだけ取るかだけ出す（1バイトも書かない）
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from _fs import args  # noqa: E402
from backup import run  # noqa: E402

a = args()
sys.argv = ["run.py"] + (["--dry-run"] if a.get("dry_run") else [])
raise SystemExit(run.main())
