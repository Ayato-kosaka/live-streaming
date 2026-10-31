"""顔の検査: ぼかしていない顔が残っていないか。残っていたら、人が見て決める（配信者本人か）。

機械が決めないこと: 「この顔は配信者（あやと）か」。顔の切り抜きと時刻を並べて、人に渡す。
機械が決めること: 「この顔はぼかしてあるか」。顔の箱の中の細かさ（ラプラシアンの分散）が、
すぐ外の細かさよりずっと小さければ、ぼかしてある。

検出器は2つのどちらか:
  - YuNet（OpenCV の顔検出 CNN。opencv_zoo の `face_detection_yunet_2023mar.onnx`）。重みは
    環境変数 SHORTS_QA_YUNET → `qa/models/` → 書き出しの道具の `render/models/`（`fetch_fonts.sh` が
    sha256 を確かめて落とす）の順に探し、在れば使う。書き出しの顔よけ・Actions の書き出し（remote.py）と同じ重み
  - Haar（OpenCV 4 の wheel に同梱。OpenCV 5 で削られた）。重みがどこにも無いときだけ。横顔の型も足す。
    顔でないものを顔と数えやすく、字と顔の検査が嘘の不合格を出す（v3 の B で7行）。だから重みが手元に
    在るのに Haar に落ちないよう、`render/models/` も既定で見る
どちらも無ければ not-checkable（「顔は無かった」とは言わない）。
"""
from __future__ import annotations

import os

import numpy as np
from PIL import Image

from common import HERE, HUMAN, NA, PASS, RENDER, Ctx, frame_memo, iter_frames, result

STEP = 7                 # 30/7 = 4.3 コマ/秒（あやとの決め: 4コマ/秒以上）
DET_SCALE = 0.5          # 540x960 で探す。いちばん小さい顔は 24px → 書き出しで 48px
MIN_FACE = 24
# ぼかしの判定。顔の箱を 64x64 に縮めた細かさ（ラプラシアンの分散）が、まわりの輪の
# 細かさの 0.25 倍未満、かつ 30 未満ならぼかしてある。
# 実測（公有の顔 95px・64x64 に縮めて）: そのまま 862 / ガウス σ2 で 63 / σ4 で 18 / σ8 で 5。
# 書き出し側のぼかし（モザイク＋ぼかし）は 5 未満。まわり（街並み）は 100〜600。
# 景色ごとぼやけている（手ぶれ）ときは、輪も小さいので「ぼかしてある」と言わない（人に回る）
BLUR_RATIO = 0.25
BLUR_ABS = 30.0
TRACK_GAP = 3            # 同じ所の顔が、この数の見本（コマ）以内に続けば同じ顔として束ねる
# Haar は字や模様を顔と間違える（合成素材の大きな数字、街の壁の模様）。箱の真ん中 60% の
# 肌色（YCrCb）の割合が 0.25 未満なら顔でないとして捨てる。取り込みの 272 コマで当てたら、
# 本物の顔（配信者・通りすがり 6人）は全部 0.78 以上、捨てたのは壁・看板・服だけだった。
# 弱いところ: 青や緑の照明の下の顔は肌色に入らず、見逃す（README の「弱いところ」）
SKIN_MIN = 0.25
YUNET_SCORE = 0.6        # YuNet の点の線（書き出しの顔よけが、チェックと同じ線で選び直すときに読む）
YUNET_NAME = "face_detection_yunet_2023mar.onnx"


def detector(cv2, also: tuple = (), full: bool = False):
    """（名前, 1コマの白黒 → 箱の並び）。無ければ None。

    YuNet の重みは、環境変数 SHORTS_QA_YUNET（在れば最優先）→ `qa/models/` → `render/models/` → also の順に探す。
    also: ほかに探す場所（呼ぶ側が足したいとき）。
    full: YuNet のとき、箱の後ろに5点（右目・左目・鼻・右口角・左口角の x,y）も返す（字と顔の検査が
    「目と鼻」の範囲を決めるのに使う）。Haar は点を持たないので箱だけ。
    """
    places = [os.environ.get("SHORTS_QA_YUNET") or HERE / "models" / YUNET_NAME, RENDER / "models" / YUNET_NAME, *also]
    model = next((str(m) for m in places if m and os.path.exists(m)), None)
    if model and hasattr(cv2, "FaceDetectorYN"):
        det = cv2.FaceDetectorYN.create(model, "", (320, 320), YUNET_SCORE, 0.3, 5000)

        def run_yunet(bgr):
            h, w = bgr.shape[:2]
            det.setInputSize((w, h))
            _, faces = det.detect(bgr)
            if faces is None:
                return []
            if full:
                return [tuple(int(v) for v in f[:4]) + tuple(float(v) for v in f[4:14]) for f in faces]
            return [tuple(int(v) for v in f[:4]) for f in faces]
        return "yunet", run_yunet, False
    if hasattr(cv2, "CascadeClassifier") and hasattr(cv2, "data"):
        root = cv2.data.haarcascades
        front = cv2.CascadeClassifier(root + "haarcascade_frontalface_default.xml")
        prof = cv2.CascadeClassifier(root + "haarcascade_profileface.xml")
        if front.empty():
            return None

        def run_haar(gray):
            out = []
            kw = dict(scaleFactor=1.1, minNeighbors=5, minSize=(MIN_FACE, MIN_FACE))
            for (x, y, w, h) in front.detectMultiScale(gray, **kw):
                out.append((x, y, w, h))
            if not prof.empty():
                # 横顔の型は左向きだけなので、左右を返してもう一度当てる
                for flip in (False, True):
                    g = gray[:, ::-1] if flip else gray
                    for (x, y, w, h) in prof.detectMultiScale(np.ascontiguousarray(g), **kw):
                        out.append((gray.shape[1] - x - w if flip else x, y, w, h))
            return out
        return "haar", run_haar, True
    return None


def skin_share(cv2, rgb: np.ndarray, x: int, y: int, w: int, h: int) -> float:
    roi = rgb[max(0, y + h // 5):y + 4 * h // 5, max(0, x + w // 5):x + 4 * w // 5]
    if roi.size == 0:
        return 0.0
    ycc = cv2.cvtColor(np.ascontiguousarray(roi), cv2.COLOR_RGB2YCrCb)
    cr, cb = ycc[..., 1], ycc[..., 2]
    return float(np.mean((cr >= 133) & (cr <= 180) & (cb >= 77) & (cb <= 135)))


def lapvar(cv2, g: np.ndarray, size: int = 64) -> float:
    s = cv2.resize(g, (size, size), interpolation=cv2.INTER_AREA)
    return float(cv2.Laplacian(s, cv2.CV_64F).var())


def sharpness(cv2, gray: np.ndarray, x: int, y: int, w: int, h: int) -> tuple[float, float]:
    """（顔の箱の細かさ, まわりの輪の細かさ）。どちらも 64px あたりに揃えて測る。"""
    H, W = gray.shape
    face = gray[max(0, y):min(H, y + h), max(0, x):min(W, x + w)]
    if face.size == 0:
        return 0.0, 0.0
    inner = lapvar(cv2, face)
    k = 0.6
    X0, Y0 = max(0, int(x - k * w)), max(0, int(y - k * h))
    X1, Y1 = min(W, int(x + w + k * w)), min(H, int(y + h + k * h))
    ring = gray[Y0:Y1, X0:X1]
    s = 64 / max(1, w)
    big = cv2.resize(ring, (max(8, int(ring.shape[1] * s)), max(8, int(ring.shape[0] * s))),
                     interpolation=cv2.INTER_AREA)
    lap = cv2.Laplacian(big, cv2.CV_64F)
    m = np.ones(lap.shape, bool)
    ix0, iy0 = int((x - X0) * s), int((y - Y0) * s)
    m[max(0, iy0 - 2):iy0 + 66, max(0, ix0 - 2):ix0 + 66] = False
    outer = float(lap[m].var()) if m.sum() > 100 else 0.0
    return inner, outer


def check(ctx: Ctx) -> dict:
    title = "顔（ぼかし）"
    th = {"frames_per_sec": round(ctx.fps / STEP, 2), "min_face_px": int(MIN_FACE / DET_SCALE),
          "blurred_if": f"細かさ < まわりの {BLUR_RATIO} 倍 かつ < {BLUR_ABS}"}
    try:
        import cv2
    except ImportError:
        return result("faces", title, NA, "OpenCV が無い（pip install 'opencv-python-headless<5'）", thresholds=th)
    d = detector(cv2)
    if d is None:
        return result("faces", title, NA,
                      f"顔の検出器が無い（OpenCV {cv2.__version__} に Haar が無く、YuNet の重みも無い）。"
                      "顔は人が全部見る", thresholds=th)
    name, run_det, wants_gray = d
    th["detector"] = name
    th["skin_min"] = SKIN_MIN
    frames = list(range(0, ctx.nframes, STEP))
    dets, dropped = [], 0

    def detect(img):
        gray = cv2.cvtColor(img, cv2.COLOR_RGB2GRAY)
        sm = cv2.resize(gray if wants_gray else cv2.cvtColor(img, cv2.COLOR_RGB2BGR),
                        (int(ctx.W * DET_SCALE), int(ctx.H * DET_SCALE)), interpolation=cv2.INTER_AREA)
        out = []
        for (x, y, w, h) in run_det(sm):
            X, Y, Wd, Hd = [int(round(v / DET_SCALE)) for v in (x, y, w, h)]
            skin = skin_share(cv2, img, X, Y, Wd, Hd)
            inner, outer = sharpness(cv2, gray, X, Y, Wd, Hd)
            out.append((X, Y, Wd, Hd, skin, inner, outer))
        return out

    for f, img in iter_frames(ctx.mp4, frames, ctx.W, ctx.H):
        for (X, Y, Wd, Hd, skin, inner, outer) in frame_memo(f"faces:{name}", img, lambda: detect(img)):
            if skin < SKIN_MIN:
                dropped += 1
                continue
            blurred = inner < BLUR_ABS and (outer <= 0 or inner < BLUR_RATIO * outer)
            dets.append({"frame": f, "t": round(f / ctx.fps, 2), "box": [X, Y, Wd, Hd], "skin": round(skin, 2),
                         "sharp": round(inner, 1), "around": round(outer, 1), "blurred": bool(blurred),
                         "_img": None if blurred else img[max(0, Y - Hd // 3):Y + Hd + Hd // 3,
                                                          max(0, X - Wd // 3):X + Wd + Wd // 3].copy()})
    tracks = _tracks(dets)
    open_ = [t for t in tracks if not t["blurred"]]
    artifacts = []
    for k, t in enumerate(open_):
        best = max((d_ for d_ in t["dets"] if d_["_img"] is not None), key=lambda d_: d_["sharp"], default=None)
        if best is not None and best["_img"].size:
            p = ctx.out_dir / f"face_{k:02d}_t{best['t']:06.2f}.jpg"
            p.parent.mkdir(parents=True, exist_ok=True)
            Image.fromarray(best["_img"]).save(p, quality=90)
            t["crop"] = str(p)
            artifacts.append(str(p))
    for d_ in dets:
        d_.pop("_img", None)
    rows = [{k: v for k, v in t.items() if k != "dets"} for t in tracks]
    m = {"detector": name, "frames": len(frames), "detections": len(dets), "not_skin_dropped": dropped,
         "tracks": rows, "unblurred_tracks": len(open_)}
    if open_:
        return result("faces", title, HUMAN,
                      f"ぼかしていない顔 {len(open_)} 件（配信者本人か、人が見る）",
                      measured=m, thresholds=th, artifacts=artifacts,
                      problems=[f"{t['from_t']}〜{t['to_t']}秒 {t['box']} 細かさ {t['sharp']}（まわり {t['around']}）"
                                f" → {t.get('crop', '')}" for t in open_])
    return result("faces", title, PASS,
                  f"{len(frames)} コマで顔 {len(dets)} 件・ぼかしていないもの 0 件", measured=m, thresholds=th)


def _tracks(dets: list[dict]) -> list[dict]:
    """同じ所に続けて出た顔を1件に束ねる（人が見る枚数を減らす）。ぼかしの有無は別々に束ねる。"""
    tracks: list[dict] = []
    for d in sorted(dets, key=lambda d: d["frame"]):
        x, y, w, h = d["box"]
        hit = None
        for t in tracks:
            if t["blurred"] != d["blurred"] or d["frame"] - t["last"] > TRACK_GAP * STEP:
                continue
            tx, ty, tw, th_ = t["box"]
            ix = max(0, min(x + w, tx + tw) - max(x, tx))
            iy = max(0, min(y + h, ty + th_) - max(y, ty))
            inter = ix * iy
            if inter / float(w * h + tw * th_ - inter) > 0.3:
                hit = t
                break
        if hit is None:
            tracks.append({"from_t": d["t"], "to_t": d["t"], "last": d["frame"], "box": d["box"],
                           "blurred": d["blurred"], "sharp": d["sharp"], "around": d["around"], "dets": [d]})
        else:
            hit.update({"to_t": d["t"], "last": d["frame"], "box": d["box"],
                        "sharp": max(hit["sharp"], d["sharp"])})
            hit["dets"].append(d)
    for t in tracks:
        t["count"] = len(t["dets"])
    return tracks
