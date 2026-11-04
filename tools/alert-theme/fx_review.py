#!/usr/bin/env python3
"""投げ銭の段の動画を、本物の配信画面に重ねた**縦の確かめ用の録画**にする（#1095。仮の重ね）。

    python3 tools/alert-theme/fx_review.py <fx の置き場> --tier 5 --bg <配信画面の置き場> --char <キャラ絵.png> --out <録画.mp4>
           [--reps 3] [--name なまえ] [--amount 2000]

再生の土台は別の担当が作る。ここは「書き出した動画が、配信の上でどう見えるか」を先に見るための仮の重ね:

- 配信画面（`<bg>/prism-street.jpg`・`prism-face.jpg`。本人の顔が写るので git に入れない）の、
  投げ銭のとき手で広げた箱（1080×1920 の 76,445 から幅 927。下は画面の端で切れる）に、
  back → 投げた人のキャラ絵（`revealAt` でぽんと出る）→ 名前と額 → front の順に重ねる
- 流す順は 登場 → 滞在を `--reps` 回 → 締め
- 1,000円〜（2通りある段）は、full と light を左右に並べる。上が昼の街、下が顔

キャラ絵と字の置き場は叩き台ペラ一の枠（キャラ絵 137,486〜583,1024・字 44,694〜676,822、720×1280 の座標）。
字は再生の側が描くもの（縁取り・1字ずつ弾む）とは違う、位置を見るための仮の字。
"""
import argparse
import json
import os
import subprocess

import numpy as np
from PIL import Image, ImageDraw, ImageFont

W, H, FPS = 720, 1280, 30
BOX = (76, 445, 927)  # 配信画面（1080×1920）の上の、広げた箱
CELL = (540, 960)
CHAR_BOX = (137, 486, 583, 1024)
TEXT_BOX = (44, 694, 676, 822)
FONT = "/usr/share/fonts/opentype/ipafont-gothic/ipag.ttf"


def reader(path, scale):
    """透明つき VP8 を1コマずつ（縮めて）読む"""
    w, h = scale
    p = subprocess.Popen(["ffmpeg", "-v", "error", "-c:v", "libvpx", "-i", path, "-vf", f"scale={w}:{h}:flags=area",
                          "-f", "rawvideo", "-pix_fmt", "rgba", "-"], stdout=subprocess.PIPE)
    n = w * h * 4
    while True:
        b = p.stdout.read(n)
        if len(b) < n:
            break
        yield np.frombuffer(b, np.uint8).reshape(h, w, 4)
    p.wait()


def over(dst, src, x=0, y=0):
    """dst（float RGB 0〜1）に src（uint8 RGBA）を重ねる"""
    h, w = src.shape[:2]
    H_, W_ = dst.shape[:2]
    x0, y0, x1, y1 = max(0, x), max(0, y), min(W_, x + w), min(H_, y + h)
    if x1 <= x0 or y1 <= y0:
        return
    s = src[y0 - y:y1 - y, x0 - x:x1 - x].astype(np.float32) / 255
    a = s[..., 3:4]
    dst[y0:y1, x0:x1] = s[..., :3] * a + dst[y0:y1, x0:x1] * (1 - a)


def text_layer(name, amount, size):
    """名前と額（仮の字。白に黒の縁）"""
    im = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    f1 = ImageFont.truetype(FONT, 46)
    f2 = ImageFont.truetype(FONT, 64)
    cx = (TEXT_BOX[0] + TEXT_BOX[2]) / 2
    for txt, f, y, col in ((name, f1, TEXT_BOX[1] + 6, (255, 255, 255)), (f"¥{amount:,}", f2, TEXT_BOX[1] + 56, (255, 196, 64))):
        tw = d.textlength(txt, font=f)
        d.text((cx - tw / 2, y), txt, font=f, fill=col, stroke_width=6, stroke_fill=(20, 12, 30))
    return np.asarray(im.resize(size, Image.LANCZOS))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("fx")
    ap.add_argument("--tier", type=int, required=True)
    ap.add_argument("--bg", required=True)
    ap.add_argument("--char", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--reps", type=int, default=3)
    ap.add_argument("--name", default="テストさん")
    ap.add_argument("--amount", type=int, default=None)
    o = ap.parse_args()
    man = json.load(open(os.path.join(o.fx, "manifest.json"), encoding="utf-8"))
    e = man["tiers"][str(o.tier)]
    variants = list(e["variants"])
    amount = o.amount or {1: 100, 2: 300, 3: 700, 4: 1500, 5: 3000, 6: 7000, 7: 10000}.get(o.tier, 1000)
    bw = round(BOX[2] * CELL[0] / 1080)
    bh = round(bw * 16 / 9)
    bx, by = round(BOX[0] * CELL[0] / 1080), round(BOX[1] * CELL[1] / 1920)
    bgs = []
    for nm in ("street", "face"):
        im = Image.open(os.path.join(o.bg, f"prism-{nm}.jpg")).convert("RGB").resize(CELL, Image.LANCZOS)
        bgs.append(np.asarray(im, np.float32) / 255)
    # キャラ絵（枠に収め、枠の下にそろえる）
    ch = Image.open(o.char).convert("RGBA")
    cw, chh = CHAR_BOX[2] - CHAR_BOX[0], CHAR_BOX[3] - CHAR_BOX[1]
    k = min(cw / ch.size[0], chh / ch.size[1])
    s = bw / W
    ch_full = ch.resize((max(1, round(ch.size[0] * k * s)), max(1, round(ch.size[1] * k * s))), Image.LANCZOS)
    ch_x = bx + round((CHAR_BOX[0] + (cw - ch.size[0] * k) / 2) * s)
    ch_y = by + round((CHAR_BOX[1] + (chh - ch.size[1] * k)) * s)
    txt = text_layer(o.name, amount, (bw, bh))
    n_i = round(e["introDur"] * FPS)
    n_s = round(e["stayDur"] * FPS)
    n_o = round(e["outroDur"] * FPS)
    seq = [("intro", n_i)] + [("stay", n_s)] * o.reps + [("outro", n_o)]
    cols = len(variants)
    out_w, out_h = CELL[0] * cols, CELL[1] * 2
    if cols == 1:
        out_w, out_h = CELL[0] * 2, CELL[1]
    enc = subprocess.Popen(["ffmpeg", "-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{out_w}x{out_h}",
                            "-r", str(FPS), "-i", "-", "-c:v", "libx264", "-crf", "21", "-preset", "medium",
                            "-pix_fmt", "yuv420p", "-movflags", "+faststart", o.out], stdin=subprocess.PIPE)
    t_all = 0
    font = ImageFont.truetype(FONT, 22)
    for clip, n in seq:
        rd = {}
        for v in variants:
            for layer in ("back", "front"):
                f = (e["variants"][v].get(layer) or {}).get(clip)
                if f:
                    rd[(v, layer)] = reader(os.path.join(o.fx, f), (bw, bh))
        for i in range(n):
            T = t_all / FPS
            fr = {kk: next(g, None) for kk, g in rd.items()}
            # キャラ絵: revealAt でぽんと出て、締めで消える
            if T < e["revealAt"]:
                ck = 0.0
            else:
                ck = min(1.0, (T - e["revealAt"]) / 0.22)
            if clip == "outro":
                ck *= 1 - i / max(1, n - 1)
            pop = 0.75 + 0.25 * (1 + 2.2 * (ck - 1) ** 3 + 1.2 * (ck - 1) ** 2) if ck < 1 else 1.0
            canvas = np.zeros((out_h, out_w, 3), np.float32)
            for ci, v in enumerate(variants):
                for ri, bg in enumerate(bgs):
                    cell = bg.copy()
                    b = fr.get((v, "back"))
                    if b is not None:
                        over(cell, b, bx, by)
                    if ck > 0:
                        cimg = ch_full
                        if pop != 1.0:
                            cimg = ch_full.resize((max(1, round(ch_full.size[0] * pop)), max(1, round(ch_full.size[1] * pop))))
                        ca = np.asarray(cimg).copy()
                        ca[..., 3] = (ca[..., 3] * ck).astype(np.uint8)
                        over(cell, ca, ch_x + (ch_full.size[0] - cimg.size[0]) // 2, ch_y + (ch_full.size[1] - cimg.size[1]))
                        ta = txt.copy()
                        ta[..., 3] = (ta[..., 3] * ck).astype(np.uint8)
                        over(cell, ta, bx, by)
                    f = fr.get((v, "front"))
                    if f is not None:
                        over(cell, f, bx, by)
                    if cols == 1:
                        x0, y0 = ri * CELL[0], 0
                    else:
                        x0, y0 = ci * CELL[0], ri * CELL[1]
                    canvas[y0:y0 + CELL[1], x0:x0 + CELL[0]] = cell
            im = Image.fromarray((np.clip(canvas, 0, 1) * 255 + 0.5).astype(np.uint8))
            d = ImageDraw.Draw(im)
            labels = variants if cols > 1 else ["昼の街", "顔"]
            for ci, lab in enumerate(labels):
                tag = {"full": "full（全面）", "light": "light（光の線・キャラが出たら薄く）"}.get(lab, lab)
                d.text((ci * CELL[0] + 10, 8), f"段{o.tier} {tag}  {T:4.1f}秒 {clip}", font=font, fill=(255, 255, 255),
                       stroke_width=3, stroke_fill=(0, 0, 0))
            enc.stdin.write(np.asarray(im).tobytes())
            t_all += 1
    enc.stdin.close()
    enc.wait()
    print(o.out, f"{t_all / FPS:.1f}秒", f"{os.path.getsize(o.out) / 1024 / 1024:.1f}MB")


if __name__ == "__main__":
    main()
