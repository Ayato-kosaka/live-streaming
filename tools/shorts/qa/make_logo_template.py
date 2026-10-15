#!/usr/bin/env python3
"""配信の「PRISM Live」の透かしの型（assets/prism_live.png）を、取り込みのコンタクトシートから作り直す。

    python3 tools/shorts/qa/make_logo_template.py SHEETS_DIR [SHEETS_DIR ...]

SHEETS_DIR は取り込み（tools/shorts/ingest）の `zoom-*/sheets/`（2列・1コマ 404x720 のもの）。
**たくさんのコマの中央値を取る。** 透かしは画面の同じ所にずっと焼き込まれていて、その下の景色は
コマごとに変わる。中央値を取ると景色は灰色にならされ、透かしだけが白く残る（2026-10-15、
yk-by7R7iPA の 1,086 コマで作った）。

型は「コンタクトシートの縮尺（元の 720x1280 の 0.5625 倍）」のまま持つ。探すときは、
書き出しのコマを同じ縮尺まで縮めてから当てる（拡大した型はぼやけて、当たりが鈍る）。
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image

HERE = Path(__file__).resolve().parent
OUT = HERE / "assets" / "prism_live.png"
META = HERE / "assets" / "prism_live.json"

TILE_W, TILE_H, GAP, HEAD, LABEL = 404, 720, 4, 30, 50   # tools/shorts/ingest/media.py の make_sheets と同じ数
SRC_W, SRC_H = 720, 1280
# 透かしの在りか（コマの右下）を大きめに切ってから、明るい画素で詰める
ROI = (200, 640, 404, 712)


def tiles(dirs: list[Path]) -> np.ndarray:
    out = []
    for d in dirs:
        for p in sorted(d.glob("*.jpg")):
            im = np.asarray(Image.open(p).convert("L"))
            H, W = im.shape
            if W != 2 * TILE_W + 3 * GAP:
                continue
            for r in range(2):
                for c in range(2):
                    x, y = GAP + c * (TILE_W + GAP), HEAD + GAP + r * (TILE_H + LABEL + GAP)
                    if y + TILE_H > H:
                        continue
                    t = im[y:y + TILE_H, x:x + TILE_W]
                    # 最後のシートの空きマスは地の色（24,24,24）一色。中央値に混ぜない
                    if t.std() > 8:
                        out.append(t)
    return np.stack(out) if out else np.zeros((0, TILE_H, TILE_W), np.uint8)


def main():
    dirs = [Path(a) for a in sys.argv[1:]]
    if not dirs:
        sys.exit(__doc__)
    t = tiles(dirs)
    if len(t) < 50:
        sys.exit(f"コマが {len(t)} しか無い（中央値で景色をならすには少なくとも 50 要る）")
    x0, y0, x1, y1 = ROI
    roi = t[:, y0:y1, x0:x1].astype(np.float32)
    med = np.median(roi, axis=0)
    # 透かしの画素: 中央値が明るい所。景色の中央値は 60〜90 の灰色に落ちる
    logo = med > 150
    ys, xs = np.nonzero(logo)
    pad = 4
    bx0, by0 = max(0, xs.min() - pad), max(0, ys.min() - pad)
    bx1, by1 = min(med.shape[1], xs.max() + 1 + pad), min(med.shape[0], ys.max() + 1 + pad)
    gray = np.clip(med[by0:by1, bx0:bx1], 0, 255).astype(np.uint8)
    alpha = np.where(logo[by0:by1, bx0:bx1], 255, 128).astype(np.uint8)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    Image.fromarray(np.stack([gray, alpha], axis=-1), "LA").save(OUT)
    sx, sy = TILE_W / SRC_W, TILE_H / SRC_H
    meta = {
        "_note": "make_logo_template.py が書く。scale は「元の配信（720x1280）の画素 → 型の画素」の倍率",
        "scale": round((sx + sy) / 2, 5),
        "box_in_source": [round((x0 + bx0) / sx), round((y0 + by0) / sy),
                          round((bx1 - bx0) / sx), round((by1 - by0) / sy)],
        "frames_used": int(len(t)),
        "size": [int(gray.shape[1]), int(gray.shape[0])],
    }
    META.write_text(json.dumps(meta, ensure_ascii=False, indent=1) + "\n")
    print(json.dumps(meta, ensure_ascii=False))


if __name__ == "__main__":
    main()
