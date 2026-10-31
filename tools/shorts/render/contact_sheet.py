#!/usr/bin/env python3
"""書き出した mp4 から、行ごとの真ん中の1コマ（字を重ねたまま）を並べた1枚を作る。

    python3 tools/shorts/render/contact_sheet.py out.mp4 work_dir sheet.jpg [--cols 6] [--at middle|start|end]

行 ＝ ナレーションの1行（plan.json の narration）。行の始まりから次の行の始まりまで。
見るためのもの: 字のはみ出し・違う場面・ぼかし忘れ・透かしの残り・真っ黒なコマ。
"""
from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont

# 同じ階の selectexpr.py を読む（ほかの道具から import されたときも。後ろに足すので、呼んだ側の同名を隠さない）
if str(Path(__file__).resolve().parent) not in sys.path:
    sys.path.append(str(Path(__file__).resolve().parent))
from selectexpr import select_expr  # noqa: E402

HERE = Path(__file__).resolve().parent
TW, TH = 270, 480  # 1コマの大きさ（1080x1920 の 1/4）


def grab(path: Path, frames: list[int], W: int, H: int) -> dict[int, np.ndarray]:
    uniq = sorted(set(frames))
    # 式は selectexpr.py で組む（行が100を超えると、`+` で横につないだ式を新しい ffmpeg が受け付けない）。
    # `-vsync 0` は 9.0 で消えた（Unrecognized option）。同じ意味の `-fps_mode passthrough` は 5.1 から在る
    raw = subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-i", str(path),
                          "-vf", f"select={select_expr(uniq)}", "-fps_mode", "passthrough", "-f", "rawvideo",
                          "-pix_fmt", "rgb24", "-"],
                         check=True, capture_output=True).stdout
    arr = np.frombuffer(raw, dtype=np.uint8).reshape(-1, H, W, 3)
    return dict(zip(uniq, arr))


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("mp4", type=Path)
    ap.add_argument("work", type=Path)
    ap.add_argument("out", type=Path)
    ap.add_argument("--cols", type=int, default=6)
    ap.add_argument("--at", default="middle", choices=["middle", "start", "end"])
    a = ap.parse_args()
    p = json.loads((a.work / "plan.json").read_text())
    W, H = p["size"]
    fps = p["fps"]
    starts = [ln["at"] for ln in p["narration"]] + [p["frames"]]
    rows = [(s, e) for s, e in zip(starts, starts[1:])]
    pick = {"middle": lambda s, e: (s + e) // 2, "start": lambda s, e: s + 2, "end": lambda s, e: e - 3}[a.at]
    frames = [pick(s, e) for s, e in rows]
    imgs = grab(a.mp4, frames, W, H)
    font = ImageFont.truetype(str(HERE / "fonts" / "MPLUSRounded1c-Black.ttf"), 18)
    small = ImageFont.truetype(str(HERE / "fonts" / "MPLUSRounded1c-Black.ttf"), 15)
    cols = a.cols
    nrow = (len(rows) + cols - 1) // cols
    lab_h = 58
    sheet = Image.new("RGB", (cols * (TW + 4) + 4, nrow * (TH + lab_h + 4) + 40), (24, 24, 24))
    d = ImageDraw.Draw(sheet)
    d.text((8, 8), f"{a.mp4.name}  {p['frames'] / fps:.2f}秒  {len(rows)}行（各行の{a.at}のコマ）",
           fill=(255, 255, 255), font=font)
    for k, ((s, e), f) in enumerate(zip(rows, frames)):
        x0 = 4 + (k % cols) * (TW + 4)
        y0 = 40 + (k // cols) * (TH + lab_h + 4)
        tile = Image.fromarray(imgs[f]).resize((TW, TH), Image.LANCZOS)
        sheet.paste(tile, (x0, y0))
        d.text((x0 + 4, y0 + TH + 2), f"{k}: {s / fps:.1f}–{e / fps:.1f}秒  f{f}", fill=(255, 230, 80), font=font)
        text = p["narration"][k]["text"]
        d.text((x0 + 4, y0 + TH + 26), text[:17] + ("…" if len(text) > 17 else ""), fill=(220, 220, 220),
               font=small)
    a.out.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(a.out, quality=85)
    print(a.out)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
