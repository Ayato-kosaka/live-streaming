"""
YouTube アーカイブチャット取得システム - エントリポイント

このスクリプトは orchestration（オーケストレーション）のみを担当する。
詳細な処理は各モジュールにカプセル化されている。

実行フロー:
1. 取得対象動画を BigQuery から取得
2. 各動画について:
   a. yt-dlp でチャットデータをダウンロード
   b. JSONL ファイルをパース
   c. BigQuery に MERGE（idempotent）
   d. 状態を更新（SUCCEEDED/FAILED/WAITING/SKIPPED）
3. 実行結果をログ出力
"""

import sys
import traceback
from datetime import datetime, timezone

# モジュールのインポート
from config import (
    ERROR_CODE_YTDLP_FAILED,
    ERROR_CODE_NO_CHAT_FILE,
    ERROR_CODE_PARSE_FAILED,
    ERROR_CODE_BQ_MERGE_FAILED,
    ERROR_CODE_UNKNOWN,
)
from logging_util import setup_logger, get_run_id, VideoLogger
from models.types import ProcessingResult, VideoStatus
from bq.repository import (
    get_target_videos,
    update_video,
    merge_chat_messages,
    mark_video_processing_started,
    mark_video_succeeded,
    mark_video_failed,
    mark_video_waiting,
    mark_video_skipped,
)
from bq.client import close_bigquery_client
from youtube_chat.downloader import (
    check_ytdlp_installed,
    get_ytdlp_version,
    download_chat_data,
)
from youtube_chat.parser import parse_chat_file
from utils.filesystem import (
    ensure_output_directory,
    chat_file_exists,
    cleanup_chat_file,
    cleanup_output_directory,
    find_chat_file_path,
)
from utils.time import (
    should_retry_within_24h,
    should_skip_after_7days,
    calculate_next_retry_at,
)


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
    logger = setup_logger()
    run_id = get_run_id()
    
    logger.info("=" * 80)
    logger.info("YouTube アーカイブチャット取得処理を開始")
    logger.info(f"Run ID: {run_id}")
    logger.info("=" * 80)
    
    try:
        # 事前チェック
        if not check_ytdlp_installed():
            logger.error("yt-dlp がインストールされていません")
            return 1
        
        yt_dlp_version = get_ytdlp_version()
        logger.info(f"yt-dlp バージョン: {yt_dlp_version}")
        
        # 出力ディレクトリ確保
        ensure_output_directory()
        
        # 取得対象動画を BigQuery から取得
        logger.info("取得対象動画を BigQuery から取得中...")
        videos = get_target_videos()
        logger.info(f"処理対象動画数: {len(videos)}")
        
        if not videos:
            logger.info("処理対象の動画がありません。終了します。")
            return 0
        
        # 各動画を処理
        results = []
        for video in videos:
            result = process_video(video, yt_dlp_version, run_id)
            results.append(result)
        
        # 実行結果サマリー
        print_summary(results, logger)
        
        logger.info("=" * 80)
        logger.info("処理が正常に完了しました")
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
        cleanup_output_directory()
        close_bigquery_client()


# ============================================================================
# 動画単位の処理
# ============================================================================

def process_video(video, yt_dlp_version: str, run_id: str) -> ProcessingResult:
    """
    1つの動画を処理
    
    Args:
        video: Video オブジェクト
        yt_dlp_version: yt-dlp のバージョン
        run_id: 実行ID
        
    Returns:
        ProcessingResult オブジェクト
    """
    video_logger = VideoLogger(video.video_id)
    video_logger.info("処理を開始")
    
    # 処理結果の初期化
    result = ProcessingResult(
        video_id=video.video_id,
        success=False,
        status=VideoStatus.FAILED,
        yt_dlp_version=yt_dlp_version,
    )
    
    try:
        # 処理開始をマーク（attempt_count 増加）
        video = mark_video_processing_started(video, yt_dlp_version)
        update_video(video)
        video_logger.info(f"試行回数: {video.attempt_count}")
        
        # yt-dlp でチャットデータをダウンロード
        video_logger.info("yt-dlp でチャットデータをダウンロード中...")
        success, error_msg = download_chat_data(video.video_id)
        
        if not success:
            # yt-dlp 実行失敗
            result.error_code = ERROR_CODE_YTDLP_FAILED
            result.error_detail = error_msg
            video_logger.error(f"yt-dlp 実行失敗: {error_msg[:100]}")
            try:
                handle_failure(video, result, video_logger)
            except Exception as ee:
                video_logger.error(f"handle_failure 自体が失敗: {ee}")
                video_logger.error(traceback.format_exc())
            return result
        
        video_logger.info("yt-dlp 実行成功")
        
        # チャットファイルの存在確認
        if not chat_file_exists(video.video_id):
            # チャットファイルが存在しない → 24h ルール適用
            result.error_code = ERROR_CODE_NO_CHAT_FILE
            result.error_detail = "チャットファイルが生成されませんでした"
            result.chat_file_exists = False
            video_logger.warning("チャットファイルが存在しません")
            handle_no_chat_file(video, result, video_logger)
            return result
        
        result.chat_file_exists = True
        video_logger.info("チャットファイルを確認")
        
        # JSONL ファイルをパース
        video_logger.info("チャットデータをパース中...")
        chat_file_path = find_chat_file_path(video.video_id)
        if not chat_file_path:
            result.error_code = ERROR_CODE_NO_CHAT_FILE
            result.error_detail = "チャットファイルが生成されませんでした（探索結果なし）"
            result.chat_file_exists = False
            handle_no_chat_file(video, result, video_logger)
            return result
        
        messages, stats = parse_chat_file(
            chat_file_path,
            video.video_id,
            run_id,
            video_logger
        )
        
        result.parsed_message_count = stats.parsed_messages
        result.skipped_line_count = stats.skipped_lines
        result.event_type_counts = dict(stats.event_type_counts)
        
        video_logger.info(f"パース完了: {stats.parsed_messages} メッセージ（{stats.skipped_lines} 行スキップ）")
        
        # メッセージが0件の場合も 24h ルール適用
        if len(messages) == 0:
            result.error_code = ERROR_CODE_NO_CHAT_FILE
            result.error_detail = "パース結果が0件でした"
            video_logger.warning("パース結果が0件です")
            handle_no_chat_file(video, result, video_logger)
            return result
        
        # BigQuery に MERGE
        video_logger.info(f"BigQuery に {len(messages)} メッセージを MERGE 中...")
        merged_count = merge_chat_messages(messages)
        result.merged_message_count = merged_count
        video_logger.info(f"MERGE 完了: {merged_count} メッセージ")
        
        # 成功
        video = mark_video_succeeded(video)
        update_video(video)
        
        result.success = True
        result.status = VideoStatus.SUCCEEDED
        video_logger.info("処理が成功しました")
        
        # チャットファイルをクリーンアップ
        cleanup_chat_file(video.video_id)
        
        return result
        
    except Exception as e:
        # 予期しない例外
        result.error_code = ERROR_CODE_UNKNOWN
        result.error_detail = f"{type(e).__name__}: {str(e)}"
        video_logger.error(f"予期しないエラー: {str(e)}")
        video_logger.error(traceback.format_exc())
        try:
            handle_failure(video, result, video_logger)
        except Exception as ee:
            video_logger.error(f"handle_failure 自体が失敗: {ee}")
            video_logger.error(traceback.format_exc())
        return result


# ============================================================================
# エラーハンドリング
# ============================================================================

def handle_no_chat_file(video, result: ProcessingResult, logger: VideoLogger) -> None:
    """
    チャットファイルが存在しない／0件の場合の処理
    
    24h ルール:
    - first_seen_at から 24h 以内 → WAITING（翌日リトライ）
    - 24h 経過後 → FAILED
    
    7日ルール:
    - first_seen_at から 7日超 → SKIPPED
    """
    now = datetime.now(timezone.utc)
    
    # 7日ルールチェック（優先）
    if should_skip_after_7days(video.first_seen_at, now):
        video = mark_video_skipped(
            video,
            result.error_code,
            result.error_detail + " (7日超過)"
        )
        result.status = VideoStatus.SKIPPED
        logger.info("7日超過のため SKIPPED に移行")
    
    # 24h ルールチェック
    elif should_retry_within_24h(video.first_seen_at, now):
        next_retry_at = calculate_next_retry_at(video.first_seen_at, now)
        video = mark_video_waiting(video, next_retry_at)
        result.status = VideoStatus.WAITING
        logger.info(f"24h 以内のため WAITING に移行（次回: {next_retry_at.isoformat()}）")
    
    else:
        # 24h 経過後も取得できない → FAILED
        video = mark_video_failed(
            video,
            result.error_code,
            result.error_detail,
            next_retry_at=None
        )
        result.status = VideoStatus.FAILED
        logger.warning("24h 経過後も取得できないため FAILED")
    
    update_video(video)


def handle_failure(video, result: ProcessingResult, logger: VideoLogger) -> None:
    """
    処理失敗時の処理
    
    7日ルール:
    - first_seen_at から 7日超 → SKIPPED
    - 7日以内 → FAILED（リトライなし）
    """
    now = datetime.now(timezone.utc)
    
    # 7日ルールチェック
    if should_skip_after_7days(video.first_seen_at, now):
        video = mark_video_skipped(
            video,
            result.error_code,
            result.error_detail + " (7日超過)"
        )
        result.status = VideoStatus.SKIPPED
        logger.info("7日超過のため SKIPPED に移行")
    else:
        video = mark_video_failed(
            video,
            result.error_code,
            result.error_detail,
            next_retry_at=None
        )
        result.status = VideoStatus.FAILED
        logger.warning("処理失敗のため FAILED")
    
    update_video(video)


# ============================================================================
# サマリー出力
# ============================================================================

def print_summary(results: list[ProcessingResult], logger) -> None:
    """
    実行結果のサマリーを出力
    
    Args:
        results: ProcessingResult のリスト
        logger: ロガー
    """
    logger.info("-" * 80)
    logger.info("実行結果サマリー")
    logger.info("-" * 80)
    
    # ステータス別カウント
    status_counts = {}
    for result in results:
        status = result.status.value
        status_counts[status] = status_counts.get(status, 0) + 1
    
    for status, count in sorted(status_counts.items()):
        logger.info(f"  {status}: {count} 動画")
    
    # 成功した動画の詳細
    succeeded = [r for r in results if r.success]
    if succeeded:
        logger.info("")
        logger.info(f"成功: {len(succeeded)} 動画")
        total_messages = sum(r.merged_message_count for r in succeeded)
        logger.info(f"  総メッセージ数: {total_messages}")
    
    # 失敗した動画の詳細
    failed = [r for r in results if not r.success]
    if failed:
        logger.info("")
        logger.info(f"失敗/待機/スキップ: {len(failed)} 動画")
        for result in failed:
            logger.info(f"  [{result.video_id}] {result.status.value}: {result.error_code}")


# ============================================================================
# エントリポイント
# ============================================================================

if __name__ == "__main__":
    sys.exit(main())
