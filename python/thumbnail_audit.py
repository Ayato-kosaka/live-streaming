"""
サムネイル棚卸し

配信のサムネのうち「未編集のもの」を洗い出す。
未編集 = YouTube が勝手に作ったサムネのままになっているもの。
縦で撮った配信だと、左右に黒帯が入った縦長の絵がそのまま出てしまう。

判定はサムネの画像そのものを見て決める。API では
「カスタムサムネかどうか」が取れないため（thumbnails は自動でも custom でも同じ形で返る）、
次の2つの手がかりを使う。

  1. 左右に無地の黒帯があるか        → 縦配信をそのまま横に収めた絵
  2. 自動生成の候補フレーム(maxres1〜3)と一致するか
                                     → 16:9 の配信で、候補のどれかをそのまま使っている

出力は JSON。GitHub Actions から呼んで、結果を issue や画面に流す想定。

  python python/thumbnail_audit.py --out /tmp/thumbnail_audit.json
"""

import argparse
import io
import json
import os
import sys
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from typing import Any, Dict, List, Optional

import numpy as np
from PIL import Image

from config import BQ_PROJECT_ID, BQ_DATASET, BQ_TABLE_VIDEOS
from logging_util import setup_logger

# 黒帯とみなす条件。1列ぶんの標準偏差と明るさで見る
BAR_STD_MAX = 8.0
BAR_MEAN_MAX = 40.0

# 左右の帯が横幅のこの割合を超えたら「縦をそのまま横にした」とみなす
PILLAR_RATIO = 0.25

# 自動候補との距離がこの値以下なら「同じ絵」とみなす（16x16 の dHash、256bit）
DHASH_SAME_MAX = 12

THUMB_BASE = "https://i.ytimg.com/vi"


def _opener() -> urllib.request.OpenerDirector:
    proxy = os.environ.get("HTTPS_PROXY") or os.environ.get("https_proxy")
    handler = (
        urllib.request.ProxyHandler({"https": proxy, "http": proxy})
        if proxy
        else urllib.request.BaseHandler()
    )
    op = urllib.request.build_opener(handler)
    op.addheaders = [("User-Agent", "Mozilla/5.0")]
    return op


def fetch(url: str) -> Optional[bytes]:
    try:
        with _opener().open(url, timeout=30) as r:
            body = r.read()
    except Exception:
        return None
    # 存在しないサイズを頼むと 404 の代わりに小さな灰色画像が返ることがある
    return body if len(body) > 2000 else None


def dhash(im: Image.Image, size: int = 16) -> np.ndarray:
    a = np.asarray(im.convert("L").resize((size + 1, size), Image.LANCZOS), dtype=np.int16)
    return (a[:, 1:] > a[:, :-1]).flatten()


def measure_bars(im: Image.Image) -> Dict[str, Any]:
    """左右の黒帯の幅と、中身のアスペクト比を測る"""
    a = np.asarray(im.convert("RGB"), dtype=np.float32)
    h, w, _ = a.shape
    col_std = a.std(axis=(0, 2))
    col_mean = a.mean(axis=(0, 2))

    def run(reverse: bool) -> int:
        idx = range(w - 1, -1, -1) if reverse else range(w)
        n = 0
        for i in idx:
            if col_std[i] < BAR_STD_MAX and col_mean[i] < BAR_MEAN_MAX:
                n += 1
            else:
                break
        return n

    left, right = run(False), run(True)
    inner = w - left - right
    return {
        "left": left,
        "right": right,
        "pillar": round((left + right) / w, 3),
        "inner_aspect": round(inner / h, 3) if h else 0.0,
    }


def inspect(video_id: str, date: str, title: str) -> Dict[str, Any]:
    body = fetch(f"{THUMB_BASE}/{video_id}/maxresdefault.jpg")
    source = "maxres"
    if body is None:
        body = fetch(f"{THUMB_BASE}/{video_id}/hqdefault.jpg")
        source = "hq"
    if body is None:
        # 非公開・削除済みだとサムネごと消える
        return {"video_id": video_id, "date": date, "title": title, "verdict": "missing"}

    current = Image.open(io.BytesIO(body)).convert("RGB")
    bars = measure_bars(current)

    # 自動生成の候補フレームと見比べる。縦配信だと候補側は横に切り取られるので
    # 一致しないことが多い。その場合は黒帯の判定に頼る。
    d_current = dhash(current)
    distances: List[int] = []
    for n in (1, 2, 3):
        cand = fetch(f"{THUMB_BASE}/{video_id}/maxres{n}.jpg")
        if cand is None:
            continue
        try:
            distances.append(
                int(np.count_nonzero(d_current != dhash(Image.open(io.BytesIO(cand)).convert("RGB"))))
            )
        except Exception:
            continue
    dmin = min(distances) if distances else None

    if bars["pillar"] >= PILLAR_RATIO:
        verdict = "raw-vertical"
    elif dmin is not None and dmin <= DHASH_SAME_MAX:
        verdict = "raw-16x9"
    else:
        verdict = "edited"

    return {
        "video_id": video_id,
        "date": date,
        "title": title,
        "verdict": verdict,
        "source": source,
        "dmin": dmin,
        **bars,
    }


def load_videos(limit: Optional[int]) -> List[Dict[str, str]]:
    from bq.client import get_bigquery_client

    sql = f"""
        SELECT video_id, title,
               FORMAT_TIMESTAMP('%Y-%m-%d', actual_start_time, 'Asia/Tokyo') AS date
        FROM `{BQ_PROJECT_ID}.{BQ_DATASET}.{BQ_TABLE_VIDEOS}`
        ORDER BY actual_start_time DESC
    """
    if limit:
        sql += f" LIMIT {int(limit)}"
    return [dict(r) for r in get_bigquery_client().query(sql).result()]


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="thumbnail_audit.json")
    ap.add_argument("--limit", type=int, default=None, help="直近この本数だけ見る")
    ap.add_argument("--workers", type=int, default=12)
    args = ap.parse_args()

    logger = setup_logger("thumbnail_audit")
    videos = load_videos(args.limit)
    logger.info(f"{len(videos)} 本のサムネを見る")

    with ThreadPoolExecutor(max_workers=args.workers) as ex:
        rows = list(ex.map(lambda v: inspect(v["video_id"], v["date"], v["title"]), videos))

    counts: Dict[str, int] = {}
    for r in rows:
        counts[r["verdict"]] = counts.get(r["verdict"], 0) + 1
    logger.info(f"内訳: {counts}")

    with open(args.out, "w", encoding="utf-8") as f:
        json.dump({"counts": counts, "videos": rows}, f, ensure_ascii=False, indent=1)
    logger.info(f"書き出し: {args.out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
