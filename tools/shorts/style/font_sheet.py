#!/usr/bin/env python3
"""font_match.py の結果から、役割ごとの並べ画像（font_<role>.png）を作る。

## 何を見るか

`font_match.py` の IoU は数で、**数の近い2本のどちらが本当に近いかは目で見ないと分からない**
（M PLUS Rounded 1c Black と LINE Seed JP ExtraBold は字ごとの IoU が 0.761 と 0.762 だった）。
参考の字と候補の字を1字ずつ重ねて、どこがはみ出しているかを色で見せる。

各見本について:
  1段目 参考の切り出し（色そのまま）
  2段目 参考から取り出した塗り
  3段目以降 候補の書体で同じ字を、参考の1字ずつの外接矩形に合わせて重ねたもの
           （白=両方、水色=参考だけ、赤=候補だけ）。字ごとの IoU の平均を添える

## 使いかた

  python3 font_sheet.py SPEC.json RESULT.json --fonts DIR --out DIR [--top 3] [--pick role=font,font ...]

SPEC.json は font_match.py に渡したもの、RESULT.json はその出力（`<out>/font_match.json`）。
並べるのは太さの補正なしの IoU（形そのものの近さ）の上位 `--top` 本と、`--pick` で名指しした書体。

## 出力

`<out>/font_<role>.png`（役割ごとに1枚）。**参考の動画のコマが写るので、リポジトリには置かない。**
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont

sys.path.insert(0, str(Path(__file__).resolve().parent))
import font_match as fm  # noqa: E402

# 見出しの字（和文が要る）。箱に入っているものを順に探し、無ければ候補の書体から借りる
LABEL_FONTS = ("/usr/share/fonts/opentype/ipafont-gothic/ipag.ttf",
               "/usr/share/fonts/truetype/fonts-japanese-gothic.ttf",
               "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc")


def label_font(size: int = 26, extra: list[Path] | None = None):
    for p in [*LABEL_FONTS, *(extra or [])]:
        if Path(p).exists():
            return ImageFont.truetype(str(p), size)
    return ImageFont.load_default()


def overlay(m: np.ndarray, text: str, fp: Path, k: float) -> tuple[np.ndarray, float]:
    f = fm.load_font(fp, 360)
    adv = [max(f.getlength(ch), 1.0) for ch in text]
    up = fm.shear(m, -k)
    cells = fm.cuts_by_advance(up, adv)
    cand = np.zeros_like(up)
    ious = []
    for (x0, x1), ch in zip(cells, text):
        sub = up[:, x0:x1]
        ys, xs = np.where(sub)
        if len(xs) < 30:
            continue
        y0, y1, xa, xb = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
        r = sub[y0:y1, xa:xb]
        g = fm.fit_to(fm.glyph(fp, ch), r.shape)
        ious.append(fm.iou(r, g))
        cand[y0:y1, x0 + xa:x0 + xb] |= g
    rgb = np.zeros(up.shape + (3,), np.uint8)
    rgb[up & ~cand] = (60, 170, 255)
    rgb[cand & ~up] = (255, 70, 70)
    rgb[up & cand] = (255, 255, 255)
    return rgb, float(np.mean(ious)) if ious else 0.0


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("spec"); ap.add_argument("result")
    ap.add_argument("--fonts", required=True); ap.add_argument("--out", required=True)
    ap.add_argument("--pick", action="append", default=[], help="role=font1,font2（必ず並べる書体）")
    ap.add_argument("--top", type=int, default=3)
    a = ap.parse_args()
    spec = {s["id"]: s for s in json.loads(Path(a.spec).read_text())["samples"]}
    res = json.loads(Path(a.result).read_text())
    fonts = {p.name: p for p in Path(a.fonts).rglob("*.[ot]tf")}
    picks = {}
    for p in a.pick:
        role, names = p.split("=", 1)
        picks[role] = names.split(",")
    by_role: dict = {}
    for sid, r in res.items():
        r["ranking"].sort(key=lambda x: -x["char_iou_raw"])  # 太さの補正なしの順（形そのものの近さ）
        by_role.setdefault(r["role"], []).append(sid)
    lf = label_font(24, sorted(fonts.values()))
    W = 1400
    for role, sids in sorted(by_role.items()):
        blocks = []
        for sid in sids:
            s, r = spec[sid], res[sid]
            rgb = np.array(Image.open(fm.frame_path(a.spec, s)).convert("RGB"))
            x0, y0, x1, y1 = s["box"]
            crop = Image.fromarray(rgb[y0:y1, x0:x1])
            m0 = fm.extract(rgb[y0:y1, x0:x1], s["edge"], s["fill"], 1, s.get("close", 0))
            ys = np.where(m0.any(1))[0]
            hgt = (ys.max() - ys.min() + 1) if len(ys) else 1
            m = fm.tight_pad(fm.extract(rgb[y0:y1, x0:x1], s["edge"], s["fill"],
                                        s.get("min_area", int(0.004 * hgt * hgt)), s.get("close", 0)))
            text = s["text"].replace(" ", "")
            names = [x["font"] for x in r["ranking"][:a.top]]
            for n in picks.get(role, []):
                if n not in names and any(x["font"] == n for x in r["ranking"]):
                    names.append(n)
            rows = [("参考の切り出し", crop), ("参考の塗り（二値化）", Image.fromarray((m * 255).astype(np.uint8)).convert("RGB"))]
            for n in names:
                row = next(x for x in r["ranking"] if x["font"] == n)
                ov, sc = overlay(m, text, fonts[n], row["slant"])
                rank = [x["font"] for x in r["ranking"]].index(n) + 1
                rows.append((f"{rank}位 {n}  字ごとIoU {row['char_iou_raw']:.3f}（太さ補正後 {row['char_iou']:.3f}）  行IoU {row['line_iou']:.3f}",
                             Image.fromarray(ov)))
            blocks.append((f"{sid}「{s['text']}」 {Path(s['frame']).name} box={s['box']}", rows))
        # 描く
        parts = []
        for title, rows in blocks:
            parts.append(("title", title))
            for lab, im in rows:
                sc = min(1.0, (W - 20) / im.width)
                parts.append(("img", lab, im.resize((max(1, int(im.width * sc)), max(1, int(im.height * sc))))))
        H = sum(36 if p[0] == "title" else p[2].height + 34 for p in parts) + 20
        out = Image.new("RGB", (W, H), (32, 32, 36))
        d = ImageDraw.Draw(out)
        y = 10
        for p in parts:
            if p[0] == "title":
                d.text((10, y + 4), p[1], font=lf, fill=(255, 220, 120)); y += 36
            else:
                d.text((10, y + 2), p[1], font=lf, fill=(220, 220, 220)); y += 30
                out.paste(p[2], (10, y)); y += p[2].height + 4
        d.text((W - 520, 8), "白=両方 水色=参考だけ 赤=候補だけ", font=lf, fill=(200, 200, 200))
        Path(a.out).mkdir(parents=True, exist_ok=True)
        out.save(Path(a.out) / f"font_{role}.png")
        print("wrote", Path(a.out) / f"font_{role}.png", out.size)


if __name__ == "__main__":
    main()
