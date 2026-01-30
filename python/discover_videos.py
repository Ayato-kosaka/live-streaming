"""
YouTube アーカイブ動画 Discovery エントリポイント

YouTube Data API から completed 動画を検索し、BigQuery に登録する。
オーケストレーションのみを担当する。
"""

import sys
import traceback
from datetime import datetime

from config import DISCOVERY_LOOKBACK_DAYS
from logging_util import setup_logger, get_run_id
from youtube_api.discovery import discover_completed_videos
from bq.repository import upsert_discovered_videos
from bq.client import close_bigquery_client


# ============================================================================
# メイン処理
# ============================================================================

def main() -> int:
    """
    メイン処理
    
    Returns:
        終了コード（0: 成功、1: エラー）
    """
    # ロガー初期化
    logger = setup_logger("youtube_discovery")
    run_id = get_run_id()
    
    logger.info("=" * 80)
    logger.info("YouTube アーカイブ動画 Discovery 処理を開始")
    logger.info(f"Run ID: {run_id}")
    logger.info("=" * 80)
    
    try:
        # Discovery: YouTube API から completed 動画を検索
        logger.info(f"lookback_days: {DISCOVERY_LOOKBACK_DAYS}")
        discovered_videos = discover_completed_videos(
            lookback_days=DISCOVERY_LOOKBACK_DAYS,
            logger=logger
        )
        
        if not discovered_videos:
            logger.info("発見された動画はありません。終了します。")
            return 0
        
        logger.info(f"発見: {len(discovered_videos)} 動画")
        
        # BigQuery に UPSERT
        logger.info("BigQuery に UPSERT 中...")
        insert_count = 0
        update_count = 0
        
        for discovered in discovered_videos:
            upsert_discovered_videos(discovered)
            
            # ログ出力（推定）
            # NOTE: BigQuery MERGE では INSERT/UPDATE の判別が難しいため、
            # すべて「UPSERT」として扱う。詳細はログで確認。
            logger.debug(
                f"UPSERT: {discovered.video_id} | "
                f"{discovered.title[:50]}... | "
                f"actualStartTime: {discovered.actual_start_time.isoformat() if discovered.actual_start_time else 'N/A'}"
            )
        
        logger.info(f"UPSERT 完了: {len(discovered_videos)} 動画")
        
        logger.info("=" * 80)
        logger.info("Discovery 処理が正常に完了しました")
        logger.info("=" * 80)
        
        return 0
        
    except KeyboardInterrupt:
        logger.warning("処理が中断されました（Ctrl+C）")
        return 1
    except Exception as e:
        logger.error(f"予期しないエラーが発生しました: {str(e)}")
        logger.error(traceback.format_exc())
        return 1
    finally:
        # クリーンアップ
        close_bigquery_client()


# ============================================================================
# エントリポイント
# ============================================================================

if __name__ == "__main__":
    sys.exit(main())
