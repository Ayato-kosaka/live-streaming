"""
あやと島の「いま」を更新するスクリプト。

GitHub Actions の workflow_dispatch から呼ばれる想定。
Claude Code に「今どこ更新して」と頼めば、これが走ってサイトに反映される。

環境変数:
  BQ_PROJECT_ID   Firestore のプロジェクトID
  ISLAND_PLACE    今どこ（例: ジョージア・トビリシ）
  ISLAND_WORD     ひとこと
  ISLAND_WEEK     今週やること。改行区切り
  ISLAND_THEME    島のテーマ（georgia / nordic / desert のいずれか）
"""

import logging
import os
import sys
from datetime import datetime, timedelta, timezone

from google.cloud import firestore

sys.path.insert(0, __file__.rsplit("/", 1)[0])

from config import BQ_PROJECT_ID  # noqa: E402

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)

JST = timezone(timedelta(hours=9))
THEMES = {"georgia", "nordic", "desert", "default"}


def main() -> int:
    """エントリポイント。空の項目は既存の値を残す。"""
    place = os.getenv("ISLAND_PLACE", "").strip()
    word = os.getenv("ISLAND_WORD", "").strip()
    week_raw = os.getenv("ISLAND_WEEK", "").strip()
    theme = os.getenv("ISLAND_THEME", "").strip()

    current = {"updatedAt": datetime.now(JST).strftime("%Y-%m-%d")}
    if place:
        current["place"] = place
    if word:
        current["word"] = word
    if week_raw:
        current["week"] = [ln.strip() for ln in week_raw.splitlines() if ln.strip()]
    if theme:
        if theme not in THEMES:
            logger.error("ISLAND_THEME が不正です: %s (%s のいずれか)", theme, THEMES)
            return 1
        current["theme"] = theme

    if len(current) == 1:
        logger.error("更新する項目がありません")
        return 1

    db = firestore.Client(project=BQ_PROJECT_ID)
    db.collection("island").document("state").set({"current": current}, merge=True)
    logger.info("island/state.current を更新しました: %s", current)
    return 0


if __name__ == "__main__":
    sys.exit(main())
