#!/usr/bin/env python3
"""ポーズ絵（poses/<仮装>/*.png）を WebP（q90）に変えて、poses.json の file を書き換える道具。

    python3 tools/alert-theme/poses_webp.py public/alert/themes/halloween/poses [--quality 90] [--keep-png]

なぜ: アラートで使う絵の合計が 6.6MB で、上限の 6MB を超えた（2026-10-24）。いちばん重いのは
ポーズ絵（1枚 300〜440KB の PNG）なので、ここだけ WebP にする。

確かめること（変えたあと、1枚ずつ出す）:
- 透過が残っている（透明な画素の数が PNG とぴったり同じ。alpha は可逆で入れる）
- 境目ににじみが出ていない: 濃い地（紺）と明るい地（白）の2つに重ねて、**境目の帯**
  （半透明の画素と、透明から 2px 以内の不透明な画素）だけで PNG と WebP の差の p99 を見る。
  絵の中身のほうは、有損失の圧縮なので全体に小さな差が散る（それはにじみではない）。
  中身は PSNR で見る。**ただし描かれる大きさ（元の半分）に縮めてから測る。** 有損失の WebP は
  色を縦横半分の細かさで持つので、等倍だと q100 でも 33dB 台に張り付く（2026-10-24 に q90/95/100 で
  32.9/33.5/33.7dB）。絵は面の上でいちばん大きくて元の 4 割（段4の魔女が面の高さの 0.4）なので、
  半分に縮めたところが見える細かさの上限
- 大きさ（KB）

差が大きい絵があれば 1 で抜ける（PNG は消える。やり直すときは git から戻して --quality を上げる）。
"""
import argparse
import io
import json
import os
import sys

import numpy as np
from PIL import Image

EDGE_P99 = 40  # 境目の帯の差（0〜255）の p99。これを超えたら「にじみ」
# 半分に縮めた絵の PSNR（dB）。これを下回ったら「荒れ」。いちばん細かい魔女の fly で校正した:
# q30 30.3 / q50 32.5 / q80 35.0 / q90 36.4 / q95 37.1。q90 の差がいちばん大きい 200px 四方を
# 2倍に拡げて並べても見分けがつかなかったので、q90 と同じかそれより良いことを合格にする
PSNR_MIN = 36.0


def dilate(mask):
    """上下左右に 1px 広げる"""
    out = mask.copy()
    out[1:] |= mask[:-1]
    out[:-1] |= mask[1:]
    out[:, 1:] |= mask[:, :-1]
    out[:, :-1] |= mask[:, 1:]
    return out


def composite(img, bg):
    base = Image.new("RGBA", img.size, bg + (255,))
    base.alpha_composite(img)
    return np.asarray(base.convert("RGB")).astype(int)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("root")
    ap.add_argument("--quality", type=int, default=90)
    ap.add_argument("--keep-png", action="store_true")
    a = ap.parse_args()
    bad = 0
    total_png = total_webp = 0
    for name in sorted(os.listdir(a.root)):
        d = os.path.join(a.root, name)
        pj = os.path.join(d, "poses.json")
        if not os.path.isfile(pj):
            continue
        meta = json.load(open(pj))
        for pose, p in meta.get("poses", {}).items():
            src = os.path.join(d, p["file"])
            if not src.endswith(".png"):
                continue
            png = Image.open(src).convert("RGBA")
            buf = io.BytesIO()
            png.save(buf, "WEBP", quality=a.quality, method=6, alpha_quality=100)
            webp = Image.open(io.BytesIO(buf.getvalue())).convert("RGBA")
            a0 = np.asarray(png)[..., 3]
            a1 = np.asarray(webp)[..., 3]
            clear = a0 == 0
            near = dilate(dilate(clear))
            band = ((a0 > 0) & (a0 < 255)) | (near & ~clear)
            content = a0 > 0
            edge = 0.0
            psnr = 99.0
            for bg in [(20, 24, 48), (255, 255, 255)]:
                c0 = composite(png, bg)
                c1 = composite(webp, bg)
                diff = np.abs(c0 - c1).max(axis=2)
                if band.any():
                    edge = max(edge, float(np.percentile(diff[band], 99)))
                if content.any():
                    half = (max(1, png.size[0] // 2), max(1, png.size[1] // 2))
                    h0 = np.asarray(Image.fromarray(c0.astype(np.uint8)).resize(half, Image.LANCZOS)).astype(float)
                    h1 = np.asarray(Image.fromarray(c1.astype(np.uint8)).resize(half, Image.LANCZOS)).astype(float)
                    hm = np.asarray(Image.fromarray(content.astype(np.uint8) * 255).resize(half, Image.NEAREST)) > 0
                    mse = float(((h0 - h1) ** 2)[hm].mean()) if hm.any() else 0.0
                    psnr = min(psnr, 99.0 if mse == 0 else 10 * np.log10(255 ** 2 / mse))
            transparent = (int(clear.sum()), int((a1 == 0).sum()))
            ok = edge <= EDGE_P99 and psnr >= PSNR_MIN and transparent[0] == transparent[1]
            out = src[:-4] + ".webp"
            open(out, "wb").write(buf.getvalue())
            kb0 = os.path.getsize(src) / 1024
            kb1 = len(buf.getvalue()) / 1024
            total_png += kb0
            total_webp += kb1
            print(f"{name}/{pose}: {kb0:.0f}KB → {kb1:.0f}KB  透明 {transparent[0]}→{transparent[1]}  "
                  f"境目の差 p99 {edge:.0f}  PSNR {psnr:.1f}dB  {'OK' if ok else 'だめ'}")
            if not ok:
                bad += 1
            p["file"] = os.path.basename(out)
            if not a.keep_png:
                os.remove(src)
        json.dump(meta, open(pj, "w"), ensure_ascii=False, indent=1)
        open(pj, "a").write("\n")
    print(f"合計 {total_png:.0f}KB → {total_webp:.0f}KB")
    sys.exit(1 if bad else 0)


if __name__ == "__main__":
    main()
