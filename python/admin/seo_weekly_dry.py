"""Search Console の週の表を、**issue に書かずに**ログへ出す（`run_admin_script.yml` から）。

鍵（`FIREBASE_SERVICE_ACCOUNT`）が Search Console に通るかを、`seo_weekly.yml` を押す前に枝の上で確かめる口。
Search Console の権限・API の有効化を変えたあとにも使う。出るのは週の表と同じもの（狙う語以外の語は出さない）。
ARGS は読まない。
"""

import runpy
import sys
from pathlib import Path

sys.argv = ["seo_weekly.py", "--dry-run"]
runpy.run_path(str(Path(__file__).resolve().parent.parent / "seo_weekly.py"), run_name="__main__")
