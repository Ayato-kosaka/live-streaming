"""絵の検査: 真っ黒なコマ／止まったコマ。

全コマを 1/8（135x240）の白黒で見る。字（タイトル・字幕）は動画の間ずっと同じ所に出ているので、
字の箱は数えない（黒い画面にタイトルだけ、を黒と言えるように。字幕だけ変わる止まった画面を、
止まっていると言えるように）。
"""
from __future__ import annotations

import numpy as np

from common import FAIL, HUMAN, PASS, Ctx, overlays, result, runs

DIV = 8
BLACK_Y = 24            # 限られた範囲（16〜235）の黒は 16。圧縮の揺れを見て 24 まで黒とみなす
BLACK_SHARE = 0.98      # 字の外の 98% 以上が黒なら、黒いコマ（夜道でも街灯や看板が 2% は光る）
BLACK_FAIL_FRAMES = 3   # 3コマ（0.1秒）以上続けば、目に見える黒。1〜2コマは人が見る（つなぎの瞬き）
FROZEN_MAD = 0.5        # 隣のコマとの差の平均（0〜255）がこれ未満なら「同じコマ」。
                        # 合成素材で、止めたコマは 0.0〜0.1、動いているコマは 3 以上だった
FROZEN_MAX_SEC = 1.5    # 1.5秒を超えて止まっていたら落とす（あやとの決め）


def text_mask(ctx: Ctx, h: int, w: int) -> np.ndarray:
    """字の箱（時間割の全部の重ね物）を True にした小さい面。時間割が無ければ様式の置き場から。"""
    m = np.zeros((h, w), dtype=bool)
    ovs = overlays(ctx.plan)
    if ovs:
        boxes = [(o["x"], o["y"], o["w"], o["h"]) for o in ovs]
    else:
        st = ctx.style
        ti, cap = st["title"], st["caption"]
        boxes = [(st["safe"]["left"], ti["top"], st["safe"]["right"] - st["safe"]["left"], 260),
                 ((ctx.W - cap["max_width"]) // 2, cap["center_y"] - 140, cap["max_width"], 280)]
    for x, y, bw, bh in boxes:
        x0, y0 = max(0, int(x) // DIV - 1), max(0, int(y) // DIV - 1)
        x1, y1 = min(w, (int(x) + int(bw)) // DIV + 2), min(h, (int(y) + int(bh)) // DIV + 2)
        m[y0:y1, x0:x1] = True
    return m


def check_black(ctx: Ctx) -> dict:
    g = ctx.gray_small
    n, h, w = g.shape
    keep = ~text_mask(ctx, h, w)
    px = g[:, keep]
    share = np.mean(px < BLACK_Y, axis=1)
    black = share >= BLACK_SHARE
    rr = runs(black)
    th = {"black_luma_lt": BLACK_Y, "share_ge": BLACK_SHARE, "fail_frames_ge": BLACK_FAIL_FRAMES}
    m = {"frames": n, "black_frames": int(black.sum()),
         "runs": [{"from": a, "to": b, "sec": round((b - a) / ctx.fps, 2)} for a, b in rr][:20],
         "masked_share": round(float(1 - keep.mean()), 3)}
    long_ = [(a, b) for a, b in rr if b - a >= BLACK_FAIL_FRAMES]
    short = [(a, b) for a, b in rr if b - a < BLACK_FAIL_FRAMES]
    problems = [f"{a / ctx.fps:.2f}〜{b / ctx.fps:.2f} 秒（{b - a}コマ）が真っ黒" for a, b in long_]
    if long_:
        status = FAIL
    elif short:
        status = HUMAN
        problems = [f"{a}コマ目から {b - a}コマだけ黒（つなぎの瞬き？目で見る）" for a, b in short]
    else:
        status = PASS
    return result("black", "黒いコマ", status, f"黒いコマ {int(black.sum())} / {n}", measured=m,
                  thresholds=th, problems=problems)


def check_frozen(ctx: Ctx) -> dict:
    g = ctx.gray_small.astype(np.int16)
    n, h, w = g.shape
    keep = ~text_mask(ctx, h, w)
    if n < 2:
        return result("frozen", "止まったコマ", FAIL, f"コマが {n} つしかない", problems=["コマが足りない"])
    d = np.abs(g[1:][:, keep] - g[:-1][:, keep]).mean(axis=1)
    # 真っ黒が続く間も「同じコマ」だが、それは黒の検査が言う。2つの検査で同じ所を2度落とさない
    black = np.mean(g[:, keep] < BLACK_Y, axis=1) >= BLACK_SHARE
    same = (d < FROZEN_MAD) & ~(black[1:] & black[:-1])
    rr = runs(same)
    lim = int(round(FROZEN_MAX_SEC * ctx.fps))
    th = {"same_if_mean_abs_diff_lt": FROZEN_MAD, "max_sec": FROZEN_MAX_SEC}
    longest = max([b - a for a, b in rr] or [0])
    m = {"frames": n, "longest_still_sec": round((longest + 1) / ctx.fps, 2) if longest else 0.0,
         "median_diff": round(float(np.median(d)), 2),
         "runs": [{"from": a, "to": b + 1, "sec": round((b - a + 1) / ctx.fps, 2)} for a, b in rr if b - a >= 15][:20]}
    # 同じコマの対が lim 個続く ＝ lim+1 コマが同じ ＝ FROZEN_MAX_SEC を超えて止まっている
    bad = [(a, b) for a, b in rr if b - a >= lim]
    problems = [f"{a / ctx.fps:.2f}〜{(b + 1) / ctx.fps:.2f} 秒（{(b - a + 1) / ctx.fps:.2f} 秒）絵が止まっている"
                for a, b in bad]
    return result("frozen", "止まったコマ", FAIL if bad else PASS,
                  f"いちばん長く止まった間 {m['longest_still_sec']} 秒", measured=m, thresholds=th,
                  problems=problems)
