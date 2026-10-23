#!/usr/bin/env python3
"""字が安全領域の外に出ていないかを、書き出したコマで測る（指示書の数字ではなく画素で）。

    python3 tools/shorts/render/render.py edit.json --out a.mp4 --work a.work
    python3 tools/shorts/render/render.py edit.json --out bare.mp4 --work bare.work --no-text
    python3 tools/shorts/render/safearea.py a.mp4 bare.mp4 [--every 2] [--json out.json]

同じ指示書を「字あり」「字なし」で書き出し、同じコマどうしの差が大きい画素を「字の画素」とする。
符号化の揺れ（x264 は字があるだけで周りの量子化も変わる）は、差の閾値と、小さな点を消す処理で落とす。
字の画素がひとつでも安全領域（style.json の safe）の外にあれば落ちる。
"""
from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent


def frames(path: Path, W: int, H: int, every: int):
    # `-vsync 0` は ffmpeg 9.0 で消えた（Unrecognized option）。同じ意味の `-fps_mode passthrough` は 5.1 から在る
    p = subprocess.Popen(["ffmpeg", "-hide_banner", "-loglevel", "error", "-i", str(path),
                          "-vf", f"select=not(mod(n\\,{every}))", "-fps_mode", "passthrough",
                          "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], stdout=subprocess.PIPE)
    size = W * H * 3
    while True:
        b = p.stdout.read(size)
        if len(b) < size:
            break
        yield np.frombuffer(b, dtype=np.uint8).reshape(H, W, 3)
    # ffmpeg が落ちても読めるのは「0コマ」で、字が1つも外に出ていない（通った）に見える。黙って通さない
    if p.wait() != 0:
        raise RuntimeError(f"ffmpeg が {path} のコマを出せなかった（終了コード {p.returncode}）")


def text_mask(a: np.ndarray, b: np.ndarray, thr: int) -> np.ndarray:
    import cv2
    d = np.abs(a.astype(np.int16) - b.astype(np.int16)).max(axis=2)
    m = (d > thr).astype(np.uint8)
    # 1〜2画素の点（符号化の揺れ）を消す。字の線は縁取りこみで 10 画素より太い
    m = cv2.morphologyEx(m, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
    return m.astype(bool)


def outside(mask: np.ndarray, safe: dict) -> np.ndarray:
    H, W = mask.shape
    ys, xs = np.mgrid[0:H, 0:W]
    right = np.where(ys >= safe["right_column_from_y"], safe["right_column_x"], safe["right"])
    bad = (ys < safe["top"]) | (ys >= safe["bottom"]) | (xs < safe["left"]) | (xs >= right)
    return mask & bad


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("with_text", type=Path)
    ap.add_argument("without_text", type=Path)
    ap.add_argument("--style", type=Path, default=HERE / "style.json")
    ap.add_argument("--every", type=int, default=2)
    ap.add_argument("--thr", type=int, default=48)
    ap.add_argument("--json", type=Path)
    a = ap.parse_args()
    style = json.loads(a.style.read_text())
    safe = style["safe"]
    W, H = style["canvas"]["width"], style["canvas"]["height"]
    bad_cache = None
    n = 0
    union = np.zeros((H, W), dtype=bool)
    worst = []
    for k, (x, y) in enumerate(zip(frames(a.with_text, W, H, a.every), frames(a.without_text, W, H, a.every))):
        m = text_mask(x, y, a.thr)
        union |= m
        if bad_cache is None:
            bad_cache = outside(np.ones((H, W), dtype=bool), safe)
        nb = int((m & bad_cache).sum())
        if nb:
            worst.append({"frame": k * a.every, "pixels_outside": nb})
        n += 1
    ys, xs = np.where(union)
    res = {"frames_checked": n, "every": a.every, "threshold": a.thr,
           "text_bbox": {"x0": int(xs.min()), "x1": int(xs.max()), "y0": int(ys.min()), "y1": int(ys.max())}
           if len(xs) else None,
           "text_pixels_below_y840_max_x": int(xs[ys >= safe["right_column_from_y"]].max())
           if (ys >= safe["right_column_from_y"]).any() else None,
           "frames_with_text_outside_safe": len(worst), "worst": sorted(worst, key=lambda z: -z["pixels_outside"])[:10],
           "safe": {k: safe[k] for k in ("top", "bottom", "left", "right", "right_column_from_y", "right_column_x")}}
    text = json.dumps(res, ensure_ascii=False, indent=1)
    if a.json:
        a.json.write_text(text)
    print(text)
    return 0 if not worst and n else 1


if __name__ == "__main__":
    sys.exit(main())
