"""**ショートの品質チェックが落ちるときに落ちるか**（音・字（ずれ・置き場）・形式・元素材のカクつきの壊し方）。

    python3 tools/shorts/qa/qa_selftest.py [--keep DIR]

壊し方の表・素材・速さの工夫は `drill.py` の頭に書いてある。絵・長さの壊し方（透かし・顔・黒・
止まり・61秒）は `qa_video_selftest.py`。1本 5分の上限（python/selftest_runner.py）に余裕を持たせるため
2本に分けた。

終了コード 0=思ったとおり / 1=思ったとおりでない / 2=数えるものが無い（ffmpeg・OpenCV・書体）。
"""
import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import drill  # noqa: E402

if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--keep", type=Path, help="作った動画と報告を残す置き場")
    sys.exit(drill.run("qa", ap.parse_args().keep))
