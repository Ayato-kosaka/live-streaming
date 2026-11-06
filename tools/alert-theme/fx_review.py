#!/usr/bin/env python3
"""投げ銭の段の動画を、本物の配信画面に重ねた**縦の確かめ用の録画**にする（#1095。仮の重ね）。

    python3 tools/alert-theme/fx_review.py <fx の置き場> --tier 5 --bg <配信画面の置き場> --char <キャラ絵.png>… --out <録画.mp4>
           [--reps 3] [--name なまえ] [--amount 2000]

再生の土台は別の担当が作る。ここは「書き出した動画が、配信の上でどう見えるか」を先に見るための仮の重ね:

- 配信画面（`<bg>/prism-street.jpg`・`prism-face.jpg`。本人の顔が写るので git に入れない）の、
  投げ銭のとき手で広げた箱（1080×1920 の 76,445 から幅 927。下は画面の端で切れる）に、
  back → 投げた人のキャラ絵（`revealAt` でぽんと出る）→ 名前と額 → front の順に重ねる
- 流す順は 登場 → 滞在を `--reps` 回 → 締め
- 列はキャラ絵ごと（`--char` に何人でも。大きい頭・縦長・横長を混ぜて、主役が隠れないかを同じ秒で見比べる）。
  2通りある段は通りごとにも列を分ける。上が昼の街、下が顔。3列を超えたら1マスを小さくする

キャラ絵は再生の側と同じ置き方（箱の上 headroom〜下の端 manifest の charBottom（無ければ 0.98）・幅いっぱい・中身で収める・revealAt から 0.85 秒でふくらむ。
`fx_hero.py` の CharLayout）。叩き台の枠（中央の 446×538）で置いていた間は、縦長の絵があやとを隠すのが見えなかった。
字はキャラ絵の真ん中の高さ。再生の側が描くもの（縁取り・1字ずつ弾む）とは違う、位置を見るための仮の字。
"""
import argparse
import json
import os
import subprocess

import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFont

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import fx_hero  # noqa: E402  キャラ絵の置き方（再生の側と同じ）

W, H, FPS = 720, 1280, 30
BOX = (76, 445, 927)  # 配信画面（1080×1920）の上の、広げた箱
CELL = (540, 960)
CELL_SMALL = (360, 640)  # 3列を超えるとき（1マスを小さくして、横に並べる）
# 段ごとのキャラ絵の箱の上の空き（再生の側の themes.ts の video.headroom と同じ）
HEADROOM = {1: 0.17, 2: 0.22, 3: 0.2, 4: 0.2, 5: 0.2, 6: 0.2, 7: 0.2}
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


def text_layer(name, amount, size, cy):
    """名前と額（仮の字。白に黒の縁）。cy はキャラ絵の真ん中の高さ"""
    im = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    f1 = ImageFont.truetype(FONT, 46)
    f2 = ImageFont.truetype(FONT, 64)
    cx = W / 2
    for txt, f, y, col in ((name, f1, cy - 58, (255, 255, 255)), (f"¥{amount:,}", f2, cy - 6, (255, 196, 64))):
        tw = d.textlength(txt, font=f)
        d.text((cx - tw / 2, y), txt, font=f, fill=col, stroke_width=6, stroke_fill=(20, 12, 30))
    return np.asarray(im.resize(size, Image.LANCZOS))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("fx")
    ap.add_argument("--tier", type=int, required=True)
    ap.add_argument("--bg", required=True)
    ap.add_argument("--char", nargs="+", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--reps", type=int, default=3)
    ap.add_argument("--name", default="テストさん")
    ap.add_argument("--amount", type=int, default=None)
    o = ap.parse_args()
    man = json.load(open(os.path.join(o.fx, "manifest.json"), encoding="utf-8"))
    e = man["tiers"][str(o.tier)]
    variants = list(e["variants"])
    amount = o.amount or {1: 100, 2: 300, 3: 700, 4: 1500, 5: 3000, 6: 7000, 7: 10000}.get(o.tier, 1000)
    # 列: (通り, キャラ絵)。行: 配信画面（昼の街・顔）
    cols = [(v, ci) for v in variants for ci in range(len(o.char))]
    cell = CELL if len(cols) <= 3 else CELL_SMALL
    bw = round(BOX[2] * cell[0] / 1080)
    bh = round(bw * 16 / 9)
    bx, by = round(BOX[0] * cell[0] / 1080), round(BOX[1] * cell[1] / 1920)
    bgs = []
    for nm in ("street", "face"):
        im = Image.open(os.path.join(o.bg, f"prism-{nm}.jpg")).convert("RGB").resize(cell, Image.LANCZOS)
        bgs.append(np.asarray(im, np.float32) / 255)
    # キャラ絵（再生の側と同じ置き方。出るときのふくらみも）
    lays = [fx_hero.CharLayout(p, HEADROOM.get(o.tier, 0.2), e.get("charBottom", 0.98)) for p in o.char]
    char_cache = {}

    def char_at(ci, scale):
        key = (ci, round(scale, 3))
        if key not in char_cache:
            _, pm = lays[ci].mask(scale)
            a = np.clip(pm[..., 3:4], 1e-4, 1)
            rgba = np.dstack([np.where(pm[..., 3:4] > 1e-4, pm[..., :3] / a, 0), pm[..., 3:4]])
            im = Image.fromarray((np.clip(rgba, 0, 1) * 255 + 0.5).astype(np.uint8), "RGBA").resize((bw, bh), Image.LANCZOS)
            char_cache[key] = np.asarray(im)
        return char_cache[key]

    txts = [text_layer(o.name, amount, (bw, bh), lay.origin[1]) for lay in lays]
    n_i = round(e["introDur"] * FPS)
    n_s = round(e["stayDur"] * FPS)
    n_o = round(e["outroDur"] * FPS)
    seq = [("intro", n_i)] + [("stay", n_s)] * o.reps + [("outro", n_o)]
    out_w, out_h = cell[0] * len(cols), cell[1] * len(bgs)
    out_w += out_w % 2
    enc = subprocess.Popen(["ffmpeg", "-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{out_w}x{out_h}",
                            "-r", str(FPS), "-i", "-", "-c:v", "libx264", "-crf", "21", "-preset", "medium",
                            "-pix_fmt", "yuv420p", "-movflags", "+faststart", o.out], stdin=subprocess.PIPE)
    t_all = 0
    font = ImageFont.truetype(FONT, 22 if cell == CELL else 17)
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
            # キャラ絵: revealAt からふくらんで出て（再生の側と同じ）、締めで消える
            sc = fx_hero.pop_scale(T - e["revealAt"])
            ck = 0.0 if sc is None else min(1.0, (T - e["revealAt"]) / 0.12)
            if clip == "outro":
                ck *= 1 - i / max(1, n - 1)
            canvas = np.zeros((out_h, out_w, 3), np.float32)
            for col, (v, ci) in enumerate(cols):
                for ri, bg in enumerate(bgs):
                    c_ = bg.copy()
                    b = fr.get((v, "back"))
                    if b is not None:
                        over(c_, b, bx, by)
                    if ck > 0:
                        ca = char_at(ci, sc).copy()
                        ca[..., 3] = (ca[..., 3] * ck).astype(np.uint8)
                        over(c_, ca, bx, by)
                        ta = txts[ci].copy()
                        ta[..., 3] = (ta[..., 3] * ck).astype(np.uint8)
                        over(c_, ta, bx, by)
                    f = fr.get((v, "front"))
                    if f is not None:
                        over(c_, f, bx, by)
                    canvas[ri * cell[1]:(ri + 1) * cell[1], col * cell[0]:(col + 1) * cell[0]] = c_
            im = Image.fromarray((np.clip(canvas, 0, 1) * 255 + 0.5).astype(np.uint8))
            d = ImageDraw.Draw(im)
            for col, (v, ci) in enumerate(cols):
                tag = f"{v} " if len(variants) > 1 else ""
                d.text((col * cell[0] + 8, 6), f"段{o.tier} {tag}{lays[ci].name}  {T:4.1f}秒 {clip}", font=font, fill=(255, 255, 255),
                       stroke_width=3, stroke_fill=(0, 0, 0))
            enc.stdin.write(np.asarray(im).tobytes())
            t_all += 1
    enc.stdin.close()
    enc.wait()
    print(o.out, f"{t_all / FPS:.1f}秒", f"{out_w}x{out_h}", f"{os.path.getsize(o.out) / 1024 / 1024:.1f}MB")


if __name__ == "__main__":
    main()
