"""顔の箱を、コマをまたいでつなぐ（1〜4コマだけ出る箱を顔として数えないため）。

字と顔の検査（textface.py）と、書き出しの顔よけ（render/render.py）が同じこれを使う。
どちらかだけ線を変えると「書き出しは顔でないと見て避けなかった箱で、検査が落ちる」が起きる。
標準の道具だけで書く（書き出しの道具からも、名前を名指しして読めるように）。
"""
from __future__ import annotations

# 顔として数える、続いた検出の数（毎コマ探して 0.17秒）。初めは 3 にしたが、C の集金の場面で手を顔と
# 間違えた箱がちょうど 3コマ続いた（点 0.72・肌色 0.99）。本物の顔は数十コマ続くので 5 にした
MIN_RUN = 5
RUN_GAP = 1      # つなぐときに空いてよいコマ（検出の取りこぼし1コマはつなぐ）
RUN_IOU = 0.3    # 隣のコマの箱と、これだけ重なれば同じ顔

# 字を被せてはいけない所は「目と鼻」（あやとの直し #926、2026-10-16「口くらいなら被っても良い」）。
# 顔の箱の上端（YuNet の箱は額から）から鼻の下まで。鼻の下は、鼻の先の点から口の点（左右の口角の真ん中）
# へ NOSE_TO_MOUTH だけ下りた所（鼻の先の点は鼻の頭なので、小鼻の下はそれより下）。
NOSE_TO_MOUTH = 0.4
# 目と鼻の点が無い見つけ役（Haar）のとき、箱の高さのこの割合までを目と鼻とみなす。
# yk-by7R7iPA の p3 の YuNet の箱 1,000件あまりで「鼻の下 ÷ 箱の高さ」を測った値の上のほう
HAAR_ZONE = 0.72


def guard_zone(x: float, y: float, w: float, h: float, lm: list | None = None) -> list[float]:
    """顔の箱から、字を被せない「目と鼻」の箱 [x, y, w, 高さ] を作る。

    lm は YuNet の5点（右目 x,y・左目 x,y・鼻 x,y・右口角 x,y・左口角 x,y。箱と同じ画素）。
    """
    if lm and len(lm) >= 10:
        ny, my = lm[5], (lm[7] + lm[9]) / 2
        bottom = ny + NOSE_TO_MOUTH * max(0.0, my - ny)
        return [x, y, w, max(1.0, min(h, bottom - y))]
    return [x, y, w, h * HAAR_ZONE]


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
