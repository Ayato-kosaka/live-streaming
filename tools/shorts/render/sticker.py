"""札で重ねる（指示書の `stickers[]`。#1284 の T1・帳面 F-080）。

外の画像（あやと島カードの写真・ガイドの絵・描いた絵）を、**動いている配信の画の上に**、白い縁と影のついた
札にして重ねる。全面の止め絵に差し替えると、画が止まる（あやと #959「静止画はやめて欲しい」）。札なら、
まわりの配信の画は動いたまま、見せたい物だけを高い画質で見せられる（参考の5本に止め絵は1枚も無かった）。

形は `edit_mock/insert_line12.jpg`（ヨーグルトの回の12行目）: 少し傾けた写真に白い縁・下にやわらかい影。
出るときは小さい所から一度大きくなって落ち着き（ポン）、いるあいだは少し漂い、消えるときは薄くなる。

## 何が正か

- 置き場は**書き出しの画素**（1080x1920）。`x` / `y` は札の真ん中、`w` は写真の幅（縁を含まない）
- コマは**できあがりのコマ番号**（`from` は含む、`to` は含まない。テロップ・注と同じ）
- 札は**字なしの版にも入れる**（画の一部。字ではない）。品質チェックは字を「字ありと字なしの差」で探すので、
  札を字と数えない。顔よけも札の上の顔を避ける
- 見た目の既定は様式の `sticker`。指示書の札ごとに上書きする（`shadow` と `drift` は中の欄ごとに重ねる）

## 同じものが出るか

札の絵（写真・縁・影）は Pillow で1回だけ作る（整数で混ぜる）。コマごとの傾け・拡大は OpenCV の warpAffine の
8bit の線形補間（固定小数）で、写像の係数は 1e-9 に丸めてから渡す（三角関数の最後の桁が CPU で違っても、
同じ係数になるように）。重ねるのは premultiplied の整数の式で、字の重ね（`render.Overlay`）と同じ形。
"""
from __future__ import annotations

import math
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageOps

OUTS = ("fade", "pop", "cut")
# 指示書の札に書ける欄（書き間違いを黙って既定に落とさない）
KEYS = {"image", "from", "to", "x", "y", "w", "crop", "rotate", "border", "border_color", "radius", "shadow",
        "pop", "drift", "out", "out_frames", "note"}
SS = 4   # 角の丸みを描く倍率（4倍で描いて縮める。Pillow の角丸は縁を滑らかにしない）


def config(it: dict, style: dict) -> dict:
    """様式の既定（`sticker`）に札の欄を重ねる。shadow / drift は中の欄ごと（false なら無し）。"""
    base = {k: v for k, v in (style.get("sticker") or {}).items() if not k.startswith("_")}
    cfg = {**base, **it}
    for k in ("shadow", "drift"):
        b, v = base.get(k), it.get(k)
        if isinstance(b, dict) and isinstance(v, dict):
            cfg[k] = {**b, **v}
    return cfg


def plan_items(edit: dict, style: dict, base: Path, total: int, W: int, H: int, fps: int, resolve) -> list[dict]:
    """指示書の stickers[] を、書き出しが使う形（欄を全部埋めた dict）にする。おかしければ書き出さずに止める。"""
    out = []
    for i, it in enumerate(edit.get("stickers") or []):
        where = f"stickers[{i}]"
        bad = sorted(set(it) - KEYS)
        if bad:
            sys.exit(f"{where}: 知らない欄 {bad}（書ける欄: {sorted(KEYS)}）")
        cfg = config(it, style)
        if not cfg.get("image"):
            sys.exit(f"{where}: image（重ねる画像のファイル）が無い")
        path = resolve(base, cfg["image"])
        if not Path(path).is_file():
            sys.exit(f"{where}: 画像が無い: {path}")
        a, b = int(cfg["from"]), min(int(cfg["to"]), total)
        if not 0 <= a < b:
            sys.exit(f"{where}: from {cfg['from']}・to {cfg['to']} が動画（{total} コマ）の中に無い")
        x, y, w = float(cfg["x"]), float(cfg["y"]), float(cfg["w"])
        if not (0 <= x <= W and 0 <= y <= H):
            sys.exit(f"{where}: 札の真ん中 ({x}, {y}) が画面（{W}x{H}）の外")
        if not 0 < w <= W:
            sys.exit(f"{where}: w {w} は 0 より大きく {W} 以下")
        pop = [float(v) for v in (cfg.get("pop") or [])]
        if any(v <= 0 for v in pop):
            sys.exit(f"{where}: pop の倍率は 0 より大きく（{pop}）")
        how = cfg.get("out", "fade")
        if how not in OUTS:
            sys.exit(f"{where}: out は {OUTS} のどれか（{how!r}）")
        sh = cfg.get("shadow")
        dr = cfg.get("drift")
        crop = cfg.get("crop")
        if crop is not None and (len(crop) != 4 or crop[2] <= 0 or crop[3] <= 0):
            sys.exit(f"{where}: crop は画像の画素の [x, y, w, h]（{crop}）")
        out.append({
            "from": a, "to": b, "path": str(path), "x": x, "y": y, "w": w,
            "crop": [int(v) for v in crop] if crop else None,
            "rotate": float(cfg.get("rotate", 0)), "border": int(cfg.get("border", 0)),
            "border_color": cfg.get("border_color", "#FFFFFF"), "radius": int(cfg.get("radius", 0)),
            "shadow": ({"dx": float(sh.get("dx", 0)), "dy": float(sh.get("dy", 0)),
                        "blur": float(sh.get("blur", 0)), "alpha": float(sh.get("alpha", 0))}
                       if isinstance(sh, dict) and sh.get("alpha", 0) > 0 else None),
            "pop": pop,
            "drift": ({"px": float(dr.get("px", 0)), "deg": float(dr.get("deg", 0)),
                       "period_s": float(dr.get("period_s", 3.0))}
                      if isinstance(dr, dict) and (dr.get("px") or dr.get("deg")) else None),
            "out": how, "out_frames": int(cfg.get("out_frames", 0)) if how != "cut" else 0,
            "fps": fps, "seed": i,
            **({"note": str(cfg["note"])} if cfg.get("note") else {}),
        })
    return out


def _rounded(w: int, h: int, r: int) -> np.ndarray:
    """角丸の箱の形（0〜1 の float32）。SS 倍で描いて縮め、縁を滑らかにする。"""
    im = Image.new("L", (w * SS, h * SS), 0)
    ImageDraw.Draw(im).rounded_rectangle([0, 0, w * SS - 1, h * SS - 1], radius=max(0, r * SS), fill=255)
    return np.asarray(im.resize((w, h), Image.BOX), dtype=np.float32) / 255.0


def sprite(it: dict) -> dict:
    """札の絵（影・縁・写真）を premultiplied の RGBA（uint8）で1枚作る。札の真ん中の座標も返す。"""
    im = ImageOps.exif_transpose(Image.open(it["path"])).convert("RGB")
    if it.get("crop"):
        x, y, w, h = it["crop"]
        im = im.crop((x, y, x + w, y + h))
    pw = max(1, round(it["w"]))
    ph = max(1, round(im.height * pw / im.width))
    photo = np.asarray(im.resize((pw, ph), Image.LANCZOS), dtype=np.float32)
    b, r = max(0, it["border"]), max(0, it["radius"])
    fw, fh = pw + 2 * b, ph + 2 * b
    sh = it.get("shadow")
    # 影が札の外へ広がるぶんの余白（ぼかしの 3σ と、ずらしの大きいほう）
    pad = 2 + (math.ceil(3 * sh["blur"] + max(abs(sh["dx"]), abs(sh["dy"]))) if sh else 0)
    SW, SH = fw + 2 * pad, fh + 2 * pad
    frame_m = np.zeros((SH, SW), dtype=np.float32)
    frame_m[pad:pad + fh, pad:pad + fw] = _rounded(fw, fh, r + b if r else 0)
    photo_m = np.zeros((SH, SW), dtype=np.float32)
    photo_m[pad + b:pad + b + ph, pad + b:pad + b + pw] = _rounded(pw, ph, r)
    canvas = np.zeros((SH, SW, 3), dtype=np.float32)
    canvas[pad + b:pad + b + ph, pad + b:pad + b + pw] = photo
    pre = np.zeros((SH, SW, 3), dtype=np.float32)
    a = np.zeros((SH, SW), dtype=np.float32)
    if sh:
        # 影は画面の上で (dx, dy) に落ちるように、札を傾けるぶん逆に回してから札の絵の中でずらす
        t = math.radians(it["rotate"])
        ox = sh["dx"] * math.cos(t) + sh["dy"] * math.sin(t)
        oy = -sh["dx"] * math.sin(t) + sh["dy"] * math.cos(t)
        m = Image.fromarray(np.round(frame_m * 255).astype(np.uint8), "L")
        m = m.transform(m.size, Image.AFFINE, (1, 0, -round(ox), 0, 1, -round(oy)), resample=Image.NEAREST)
        if sh["blur"] > 0:
            m = m.filter(ImageFilter.GaussianBlur(sh["blur"]))
        a = np.asarray(m, dtype=np.float32) / 255.0 * sh["alpha"]
    if b:
        col = np.array([int(it["border_color"][k:k + 2], 16) for k in (1, 3, 5)], dtype=np.float32)
        pre = col * frame_m[:, :, None] + pre * (1 - frame_m[:, :, None])
        a = frame_m + a * (1 - frame_m)
    pre = canvas * photo_m[:, :, None] + pre * (1 - photo_m[:, :, None])
    a = photo_m + a * (1 - photo_m)
    a8 = np.round(a * 255).astype(np.uint8)
    pre8 = np.minimum(np.round(pre), a8[:, :, None]).astype(np.uint8)
    rgba = np.ascontiguousarray(np.dstack([pre8, a8]))
    return {"rgba": rgba, "cx": SW / 2, "cy": SH / 2, "size": [SW, SH], "card": [fw, fh]}


def state(it: dict, f: int) -> tuple[float, float, float, float, float]:
    """f コマ目の (倍率, 濃さ, ずれ x, ずれ y, 傾き)。出るときのポン・漂い・消えかた。"""
    i, n = f - it["from"], it["to"] - it["from"]
    s = it["pop"][i] if i < len(it["pop"]) else 1.0
    alpha = 1.0
    m = it["out_frames"]
    left = n - 1 - i   # このコマのあとに残るコマ
    if it["out"] != "cut" and m > 0 and left < m:
        u = (left + 1) / (m + 1)
        alpha = u
        if it["out"] == "pop":
            s *= 0.6 + 0.4 * u
    dx = dy = dt = 0.0
    dr = it.get("drift")
    if dr:
        # 周期の違う3つの揺れ（同じ形がすぐに繰り返して見えないように）。位相は札ごとに変える
        t = i / it["fps"]
        p = dr["period_s"]
        ph = 1.7 * it.get("seed", 0)
        dx = dr["px"] * math.sin(2 * math.pi * t / p + ph)
        dy = 0.7 * dr["px"] * math.sin(2 * math.pi * t / (p * 1.37) + ph + 1.1)
        dt = dr["deg"] * math.sin(2 * math.pi * t / (p * 1.13) + ph + 2.3)
    return s, alpha, round(dx, 6), round(dy, 6), round(dt, 6)


def draw(cv2, frame: np.ndarray, spr: dict, it: dict, f: int, k: int = 1) -> None:
    """f コマ目の札を frame（書き出しの大きさ。下書きは 1/k）に重ねる。"""
    s, alpha, dx, dy, dt = state(it, f)
    H, W = frame.shape[:2]
    cx, cy = spr["cx"], spr["cy"]
    # OpenCV の角度は反時計回りが正。指示書の rotate は時計回りが正（CSS の rotate と同じ）
    M = cv2.getRotationMatrix2D((cx, cy), -(it["rotate"] + dt), s / k)
    M[0, 2] += (it["x"] + dx) / k - cx
    M[1, 2] += (it["y"] + dy) / k - cy
    M = np.round(M, 9)
    SW, SH = spr["size"]
    pts = M @ np.array([[0, SW, 0, SW], [0, 0, SH, SH], [1, 1, 1, 1]], dtype=np.float64)
    x0, y0 = max(0, math.floor(pts[0].min())), max(0, math.floor(pts[1].min()))
    x1, y1 = min(W, math.ceil(pts[0].max()) + 1), min(H, math.ceil(pts[1].max()) + 1)
    if x1 <= x0 or y1 <= y0:
        return
    M2 = M.copy()
    M2[0, 2] -= x0
    M2[1, 2] -= y0
    wv = cv2.warpAffine(spr["rgba"], M2, (x1 - x0, y1 - y0), flags=cv2.INTER_LINEAR,
                        borderMode=cv2.BORDER_CONSTANT, borderValue=(0, 0, 0, 0))
    a = wv[:, :, 3:4].astype(np.uint16)
    pre = wv[:, :, :3].astype(np.uint16)
    if alpha < 1.0:
        fa = round(alpha * 256)
        a = (a * fa) >> 8
        pre = (pre * fa) >> 8
    roi = frame[y0:y1, x0:x1]
    roi[:] = np.minimum((roi.astype(np.uint16) * (255 - a) + 127) // 255 + pre, 255).astype(np.uint8)


def footprint(it: dict, spr: dict) -> list[int]:
    """出来上がり（倍率 1・漂いなし）の札の外接矩形（書き出しの画素 [x0, y0, x1, y1]。影は含めない）。"""
    fw, fh = spr["card"]
    t = math.radians(it["rotate"])
    hw = (abs(fw * math.cos(t)) + abs(fh * math.sin(t))) / 2
    hh = (abs(fw * math.sin(t)) + abs(fh * math.cos(t))) / 2
    return [round(it["x"] - hw), round(it["y"] - hh), round(it["x"] + hw), round(it["y"] + hh)]
