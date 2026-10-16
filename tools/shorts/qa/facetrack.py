"""顔の箱を、コマをまたいでつなぐ（1〜2コマだけ出る箱を顔として数えないため）。

字と顔の検査（textface.py）と、書き出しの顔よけ（render/render.py）が同じこれを使う。
どちらかだけ線を変えると「書き出しは顔でないと見て避けなかった箱で、検査が落ちる」が起きる。
標準の道具だけで書く（書き出しの道具からも、名前を名指しして読めるように）。
"""
from __future__ import annotations

MIN_RUN = 3      # 顔として数える、続いた検出の数（毎コマ探して 0.1秒）
RUN_GAP = 1      # つなぐときに空いてよいコマ（検出の取りこぼし1コマはつなぐ）
RUN_IOU = 0.3    # 隣のコマの箱と、これだけ重なれば同じ顔


def iou(a, b) -> float:
    ix = max(0, min(a[0] + a[2], b[0] + b[2]) - max(a[0], b[0]))
    iy = max(0, min(a[1] + a[3], b[1] + b[3]) - max(a[1], b[1]))
    inter = ix * iy
    return inter / float(a[2] * a[3] + b[2] * b[3] - inter or 1)


def keep_persistent(per_frame: list[list], min_run: int = MIN_RUN, gap: int = RUN_GAP,
                    iou_min: float = RUN_IOU) -> list[list]:
    """コマごとの箱の並び（[x, y, w, h, ...]）から、続けて出た箱だけを残す。

    隣のコマ（gap コマまで空いてよい）でいちばん重なる箱につなぎ、min_run 個以上つながった列の箱だけを返す。
    実測（yk-by7R7iPA の p3、2026-10-16）: 食べ物（パン）を顔と間違えた箱が 1コマと 2コマ、
    ぼかした人の体・車輪が 1〜2コマずつ。配信者本人の顔は数十コマ続く。
    """
    tracks: list[dict] = []
    live: list[dict] = []
    for f, boxes in enumerate(per_frame):
        live = [t for t in live if f - t["last"] <= gap + 1]
        taken: set = set()
        for k, b in enumerate(boxes):
            best, bs = None, iou_min
            for t in live:
                if id(t) in taken or t["last"] == f:
                    continue
                s = iou(t["box"], b)
                if s >= bs:
                    best, bs = t, s
            if best is None:
                best = {"members": [], "last": f, "box": b}
                tracks.append(best)
                live.append(best)
            best["members"].append((f, k))
            best["last"], best["box"] = f, b
            taken.add(id(best))
    keep = {m for t in tracks if len(t["members"]) >= min_run for m in t["members"]}
    return [[b for k, b in enumerate(boxes) if (f, k) in keep] for f, boxes in enumerate(per_frame)]
