"""退避を1回まわす（`python/backup/run.py` の口）。

毎晩は `.github/workflows/backup.yml` が回す。ここは**手で1回まわしたいとき**と、
新しいワークフローがまだ master に無いあいだの入口。

ARGS 例:
  {}                    … 実際に取る
  {"dry_run": true}     … 何をどれだけ取るかだけ出す（1バイトも書かない）
"""

import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from backup import run  # noqa: E402

# **`_fs` を通さない。** あちらは import した時点で logging.basicConfig を張るので、
# backup 側のログと二重に出る（下見の実行で実際に全行2回出た）
a = json.loads(os.getenv("ARGS") or "{}")
sys.argv = ["run.py"] + (["--dry-run"] if a.get("dry_run") else [])
raise SystemExit(run.main())
