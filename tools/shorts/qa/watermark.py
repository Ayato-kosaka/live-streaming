"""透かしの検査: 配信ソフトの「PRISM Live」（元の配信の右下）が、書き出しに残っていないか。

元の配信（720x1280）は、書き出しで 1.5 倍（cover）になり、透かしの帯を切り落とすならもう少し
大きくなる（下 7% を捨てて 1.61 倍）。寄せ（ズーム）が入ればさらに大きい。だから倍率を
0.85〜2.7 倍のあいだで変えて探し、いちばん似ている所を出す。場所も決め打ちしない
（左右の寄せ・上下の寄せで動く）。

**明るさの大きな段差は消してから当てる（高域だけを比べる）。** そのまま当てると、透かしの
後ろに色の帯や空と建物の境目があるだけで似ている度合いが 0.5 まで落ちた（字の形より、
後ろの段差のほうが大きく効く）。字の線の太さ（型で 2〜3px）より広いぼかしを引いておけば、
後ろの段差はほぼ消えて、字の形だけが残る。
"""
from __future__ import annotations

import json

import numpy as np
from PIL import Image

from common import FAIL, HERE, HUMAN, NA, PASS, Ctx, frame_memo, iter_frames, result

TPL = HERE / "assets" / "prism_live.png"
TPL_META = HERE / "assets" / "prism_live.json"

# 型と似ている度合い（高域どうしの正規化相互相関）。線は実測で決めた（2026-10-15。README の表）:
#   透かしが残ったコマ … 型を作るのに使っていない区間 132コマで いちばん低い 0.885（寄せた形で 0.916）、
#                       別の配信（hk）32コマで いちばん低い 0.703、合成の色の帯の上で 0.780
#   透かしを消したコマ … 下を切り落とした 132コマで いちばん高い 0.274、描き埋めた 132コマで 0.273、
#                       合成素材で 0.258（平らな地を測らない守りを入れる前は、切り落としで 0.434 が出ていた）
# 0.55 以上は残っている。0.40〜0.55 は、消したコマのいちばん高い値より十分上なので、薄く残っていないか人が見る
FAIL_SCORE = 0.55
HUMAN_SCORE = 0.40
# 倍率は粗く探してから、いちばん良かった倍率のまわりを 1% 刻みで詰める。
# 型は 160px あるので、倍率が 2% ずれると端で 3px ずれ、似ている度合いが 0.15 ほど落ちる
# （高域を引く前の測りで、5% 刻みだけだと 1.5 倍ちょうどの透かしが 0.52 まで落ちた）。
# 1.5 は cover（720→1080）、1.6135 は下の帯を切り落としたときの倍率で、どちらもよく出るので必ず見る
# 0.85 は横長の配信を blur で入れたとき（1280→1080）。2.75 より寄せると、元の画の 1/3 も残らない
ZOOMS = sorted({round(0.85 * 1.07 ** k, 4) for k in range(0, 18)} | {1.5, 1.6135})  # 0.85〜2.68 倍
REFINE = [0.97, 0.98, 0.99, 1.01, 1.02, 1.03]
STEP = 15  # 2コマ/秒。透かしは配信に焼き込まれていて、カットの間ずっと同じ所にある
FLAT_STD = 0.15  # 窓の揺れがこれ（型の揺れに対する比）未満なら、平らな地として似ている度合いを測らない
HP_SIGMA = 3.0  # 型の縮尺での画素。別の配信のいちばん低いコマが σ1.5 で 0.654、σ3 で 0.70 台（消したコマは同じくらい）


def load_template():
    im = Image.open(TPL)
    g, a = im.split()
    meta = json.loads(TPL_META.read_text())
    return np.asarray(g), np.asarray(a), meta


def highpass(cv2, x: np.ndarray, sigma: float) -> np.ndarray:
    x = x.astype(np.float32)
    return x - cv2.GaussianBlur(x, (0, 0), sigma) if sigma > 0 else x


def scan(cv2, gray: np.ndarray, tpl: np.ndarray, scale: float, zooms=ZOOMS,
         hp: float | None = None) -> tuple[float, float, int, int]:
    """1コマの中で、型にいちばん似た所（似ている度合い, 倍率, x, y［書き出しの画素］）。"""
    hp = HP_SIGMA if hp is None else hp
    H, W = gray.shape
    th, tw = tpl.shape
    t = highpass(cv2, tpl, hp)
    floor = FLAT_STD * float(t.std())

    def at(z):
        f = scale / z
        sw, sh = int(round(W * f)), int(round(H * f))
        if sw <= tw or sh <= th:
            return (-1.0, z, 0, 0)
        small = highpass(cv2, cv2.resize(gray, (sw, sh), interpolation=cv2.INTER_AREA), hp)
        r = cv2.matchTemplate(small, t, cv2.TM_CCOEFF_NORMED)
        # 平らな所（一色の地）は、正規化の分母が 0 に近づいて 1.0 が出る（合成素材の青い帯で
        # 実際に「似ている度合い 1.0」が出た）。窓の中の揺れが型の揺れの FLAT_STD 倍に満たない
        # 所は、似ているかどうかを言えない所として外す
        s, sq = cv2.integral2(small)
        n = float(tw * th)
        ws = s[th:, tw:] - s[:-th, tw:] - s[th:, :-tw] + s[:-th, :-tw]
        wq = sq[th:, tw:] - sq[:-th, tw:] - sq[th:, :-tw] + sq[:-th, :-tw]
        std = np.sqrt(np.maximum(wq / n - (ws / n) ** 2, 0))
        r = np.where((std >= floor) & np.isfinite(r), r, -1.0).astype(np.float32)
        _, mx, _, loc = cv2.minMaxLoc(r)
        return (float(mx), z, int(round(loc[0] / f)), int(round(loc[1] / f)))

    coarse = sorted((at(z) for z in zooms), key=lambda r: -r[0])
    best = coarse[0]
    for k in REFINE:
        r = at(round(best[1] * k, 4))
        if r[0] > best[0]:
            best = r
    return best


def sample_frames(ctx: Ctx) -> list[int]:
    fr = set(range(0, ctx.nframes, STEP))
    for c in (ctx.plan or {}).get("cuts", []):
        a, n = int(c["at"]), int(c["frames"])
        fr |= {a + 1, a + n // 2, a + n - 2}
    return sorted(f for f in fr if 0 <= f < ctx.nframes)


def check(ctx: Ctx) -> dict:
    title = "透かし（PRISM Live）"
    th = {"fail_score": FAIL_SCORE, "human_score": HUMAN_SCORE, "zooms": f"{ZOOMS[0]}〜{ZOOMS[-1]}",
          "frames_per_sec": round(ctx.fps / STEP, 2)}
    try:
        import cv2
    except ImportError:
        return result("watermark", title, NA, "OpenCV が無い（pip install 'opencv-python-headless<5'）", thresholds=th)
    tpl, _, meta = load_template()
    rows = []
    for f, img in iter_frames(ctx.mp4, sample_frames(ctx), ctx.W, ctx.H):
        s, z, x, y = frame_memo("watermark", img,
                                lambda: scan(cv2, cv2.cvtColor(img, cv2.COLOR_RGB2GRAY), tpl, meta["scale"]))
        rows.append({"frame": f, "score": round(s, 3), "zoom": z, "x": x, "y": y})
    if not rows:
        return result("watermark", title, NA, "コマが読めなかった", thresholds=th)
    top = max(rows, key=lambda r: r["score"])
    hits = [r for r in rows if r["score"] >= FAIL_SCORE]
    maybe = [r for r in rows if HUMAN_SCORE <= r["score"] < FAIL_SCORE]
    artifacts = []
    if hits or maybe:
        r = top
        z = r["zoom"]
        w, h = int(meta["size"][0] / meta["scale"] * z), int(meta["size"][1] / meta["scale"] * z)
        artifacts.append(_crop(ctx, r["frame"], r["x"], r["y"], w, h, "watermark"))
    m = {"frames": len(rows), "best": top, "frames_over_fail": len(hits), "frames_in_human_band": len(maybe),
         "top5": sorted(rows, key=lambda r: -r["score"])[:5]}
    if hits:
        return result("watermark", title, FAIL,
                      f"{len(hits)}/{len(rows)} コマに残っている（いちばん似ている {top['score']}・{top['frame']}コマ目・"
                      f"{top['x']},{top['y']}）", measured=m, thresholds=th, artifacts=artifacts,
                      problems=[f"{r['frame']}コマ目 {r['x']},{r['y']} 似ている度合い {r['score']}" for r in hits[:5]])
    if maybe:
        return result("watermark", title, HUMAN, f"薄く残っているかもしれない（{top['score']}・{top['frame']}コマ目）",
                      measured=m, thresholds=th, artifacts=artifacts,
                      problems=[f"{r['frame']}コマ目 {r['x']},{r['y']} 似ている度合い {r['score']}" for r in maybe[:5]])
    return result("watermark", title, PASS, f"{len(rows)} コマで見つからない（いちばん似ている {top['score']}）",
                  measured=m, thresholds=th)


def _crop(ctx: Ctx, frame: int, x: int, y: int, w: int, h: int, tag: str) -> str:
    for f, img in iter_frames(ctx.mp4, [frame], ctx.W, ctx.H):
        pad = max(w, h) // 3
        x0, y0 = max(0, x - pad), max(0, y - pad)
        x1, y1 = min(ctx.W, x + w + pad), min(ctx.H, y + h + pad)
        p = ctx.out_dir / f"{tag}_f{f:05d}.jpg"
        p.parent.mkdir(parents=True, exist_ok=True)
        Image.fromarray(img[y0:y1, x0:x1]).save(p, quality=90)
        return str(p)
    return ""
