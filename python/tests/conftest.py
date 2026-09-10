"""テストの下ごしらえ。

`python/` を import パスに足して、`config.py` が要る環境変数を差し込む。
**BigQuery には繋がない。** ここで見るのは時刻の分岐だけなので、
`update_video`（唯一の書き込み口）はテスト側で差し替える。
"""

import os
import pathlib
import sys

# config.py は BQ_PROJECT_ID が無いと import した時点で落ちる。
# 繋ぎ先ではなく「値が入っていること」だけを見ているので、偽の名前でよい。
os.environ.setdefault("BQ_PROJECT_ID", "test-project")

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))
