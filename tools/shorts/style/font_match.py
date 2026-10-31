#!/usr/bin/env python3
"""参考動画の字と、候補の書体で描いた同じ字を、二値化した字形の重なり（IoU）で比べる道具。

## 何を測るか

「参考の字は何の書体か」を、候補の書体ぜんぶに同じ字を描かせて、形の重なりで順位を付ける。

1. 参考のコマから字の「塗り」だけを取り出す（縁の色で囲まれた内側のうち、塗りの色の画素）。
2. 斜体（CapCut の斜体はせん断）を、候補ごとに −0.15〜+0.15 の傾きで戻してみて、字ごとの IoU が
   いちばん高い傾きを採る。
3. 候補の書体の字送りを目安に1字ずつに分け、候補の同じ字を外接矩形を揃えて重ね、IoU を出す
   （字の大きさ・字間の差を除き、形だけを比べる）。縁取りが塗りに重なって字が細って見えるぶんを、
   字の高さの −4〜+6% の太らせ・細らせで1つ探して補う（`char_iou`。補う前は `char_iou_raw`）。
4. 行ぜんたいの IoU も出す（字間・字幅の癖まで含めた近さ）。行の高さを揃え、横の倍率だけを探す。

この道具と他の道具（`font_sheet.py`・`style_measure.py`・`anim_probe.py`・`anim_curve.py`）は、
色の分け方（`classes`）と塗りの取り出し（`extract`）をここから借りる。

## 使いかた

  python3 font_match.py SPEC.json --fonts DIR --out DIR [--only ID]

- SPEC.json は `{"samples": [{"id", "role", "frame", "box": [x0, y0, x1, y1], "text", "edge", "fill", ...}]}`。
  `frame` は参考から抜いた1コマ（元の画素のまま。PNG）。相対の道なら SPEC.json の置き場から読む。
  `box` はそのコマの中で字の行を囲む矩形（元の画素）。`text` はその行の字（空白は無視）。
  `edge` / `fill` は下の `classes` の名前（縁＝囲む色、塗り＝字の色）。任意で `min_area`・`close`・`shears`
- `--fonts` は候補の書体（.ttf / .otf）を置いた場所。下の階まで拾う。字の無い書体（豆腐になる）は飛ばす

## 出力

`<out>/font_match.json` に見本ごとの `ranking`（字ごとの IoU の高い順。`char_iou`・`char_iou_raw`・
`char_iou_min`・`line_iou`・`slant`・`erode_px`）。同じ置き場で回し直すと、見本ごとに上書きで足す。
`<out>/mask_<id>.png` は取り出した塗り（取り出しがうまくいったかを目で見る用）。
標準出力に、見本ごとの上位5本。
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFont


def hsv(rgb: np.ndarray) -> np.ndarray:
    return cv2.cvtColor(rgb, cv2.COLOR_RGB2HSV).astype(np.int32)


def classes(rgb: np.ndarray) -> dict:
    r, g, b = [rgb[..., i].astype(np.int32) for i in range(3)]
    mx, mn = np.maximum(np.maximum(r, g), b), np.minimum(np.minimum(r, g), b)
    h = hsv(rgb)
    H, S, V = h[..., 0], h[..., 1], h[..., 2]
    return {
        "dark": mx < 95,
        "white": (mn >= 195) & (mx - mn < 60),
        "notwhite": ~((mn >= 170) & (mx - mn < 70)),
        "yellow": (H >= 8) & (H <= 40) & (S >= 70) & (V >= 140),
        "red": ((H <= 9) | (H >= 168)) & (S >= 110) & (V >= 80),
        "darkred": ((r - g >= 25) & (r - b >= 25)) | (mx < 60),
        "pink": (H >= 135) & (H <= 175) & (S >= 50) & (V >= 120),
        "light": (V >= 140) & (S < 70),
        "black": mx < 110,
    }


def extract(rgb: np.ndarray, edge: str, fill: str, min_area: int, close: int = 0) -> np.ndarray:
    """縁（edge）で囲まれ、画像の端に触れていない領域のうち、塗り（fill）の色の画素。"""
    c = classes(rgb)
    E = c[edge]
    n, lab, st, _ = cv2.connectedComponentsWithStats((~E).astype(np.uint8), connectivity=4)
    Hh, Ww = E.shape
    keep = np.zeros(n, bool)
    for i in range(1, n):
        x, y, w, h, a = st[i]
        if x == 0 or y == 0 or x + w >= Ww or y + h >= Hh:
            continue
        keep[i] = True
    inside = keep[lab]
    m = inside & c[fill]
    if close:
        k = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (close, close))
        m = cv2.morphologyEx(m.astype(np.uint8), cv2.MORPH_CLOSE, k).astype(bool)
    n, lab, st, _ = cv2.connectedComponentsWithStats(m.astype(np.uint8), connectivity=8)
    out = np.zeros_like(m)
    for i in range(1, n):
        if st[i, 4] >= min_area:
            out |= lab == i
    return out


def shear(mask: np.ndarray, k: float) -> np.ndarray:
    """x' = x + k*(y - cy)。k>0 で上が右に倒れた字を、k<0 を渡してまっすぐに戻す。"""
    h, w = mask.shape
    pad = int(abs(k) * h) + 2
    M = np.float32([[1, k, pad - k * h / 2], [0, 1, 0]])
    return cv2.warpAffine(mask.astype(np.uint8) * 255, M, (w + 2 * pad, h), flags=cv2.INTER_LINEAR) > 127


def tight_pad(m: np.ndarray, pad: int = 4) -> np.ndarray:
    t = tight(m)
    return np.pad(t, pad)


def tight(m: np.ndarray) -> np.ndarray:
    ys, xs = np.where(m)
    if len(xs) == 0:
        return m
    return m[ys.min():ys.max() + 1, xs.min():xs.max() + 1]


def load_font(path: Path, size: int) -> ImageFont.FreeTypeFont:
    f = ImageFont.truetype(str(path), size)
    if "[" in path.name:  # 可変書体は一番太く
        try:
            axes = f.get_variation_axes()
            f.set_variation_by_axes([a["maximum"] for a in axes])
        except Exception:
            pass
    return f


def render(font: ImageFont.FreeTypeFont, text: str) -> np.ndarray:
    l, t, r, b = font.getbbox(text)
    im = Image.new("L", (r - l + 40, b - t + 40), 0)
    ImageDraw.Draw(im).text((20 - l, 20 - t), text, font=font, fill=255)
    return np.array(im) > 127


def has_glyphs(path: Path, text: str) -> bool:
    """字が書体に無いと豆腐（.notdef）になる。豆腐と同じ形の字があれば無いとみなす。"""
    f = load_font(path, 64)
    tofu = render(f, "￿")
    for ch in set(text):
        if ch.isspace():
            continue
        g = render(f, ch)
        if g.shape == tofu.shape and (g == tofu).all():
            return False
    return True


def iou(a: np.ndarray, b: np.ndarray) -> float:
    u = (a | b).sum()
    return float((a & b).sum() / u) if u else 0.0


def fit_to(g: np.ndarray, shape: tuple[int, int]) -> np.ndarray:
    return cv2.resize(tight(g).astype(np.uint8) * 255, (shape[1], shape[0]), interpolation=cv2.INTER_AREA) > 127


def cuts_by_advance(m: np.ndarray, adv: list[float]) -> list[tuple[int, int]]:
    """候補の書体の字送りを目安に、目安の ±35% の幅で列の投影がいちばん薄い所で切る。"""
    p = m.sum(0).astype(np.float64)
    xs = np.where(p > 0)[0]
    if len(xs) == 0:
        return []
    x0, x1 = int(xs.min()), int(xs.max()) + 1
    W = x1 - x0
    tot = sum(adv)
    pos = np.cumsum(adv)[:-1] / tot * W + x0
    avg = W / len(adv)
    cuts = [x0]
    for b in pos:
        lo, hi = int(max(cuts[-1] + 1, b - 0.35 * avg)), int(min(x1 - 1, b + 0.35 * avg))
        if hi <= lo:
            cuts.append(int(b)); continue
        seg = p[lo:hi]
        best = np.where(seg == seg.min())[0]
        c = lo + int(best[np.argmin(np.abs(lo + best - b))])
        cuts.append(c)
    cuts.append(x1)
    return [(cuts[i], cuts[i + 1]) for i in range(len(adv))]


_GLYPHS: dict = {}


def glyph(fp: Path, ch: str) -> np.ndarray:
    key = (str(fp), ch)
    if key not in _GLYPHS:
        _GLYPHS[key] = tight(render(load_font(fp, 360), ch))
    return _GLYPHS[key]


def weight_fit(g: np.ndarray, shape: tuple[int, int], r: int) -> np.ndarray:
    """字を参考の外接矩形に合わせたうえで、r 画素ぶん細らせる（r<0 は太らせる）。
    細らせるときは外接矩形を 2r 広げてから削る（縁取りが塗りの上に重なると、字は外接矩形ごと細る）。"""
    h, w = shape
    th, tw = max(1, h + 2 * r), max(1, w + 2 * r)
    x = cv2.resize(tight(g).astype(np.uint8) * 255, (tw, th), interpolation=cv2.INTER_AREA)
    if r:
        k = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * abs(r) + 1, 2 * abs(r) + 1))
        x = cv2.erode(x, k) if r > 0 else cv2.dilate(np.pad(x, abs(r)), k)
    x = x > 127
    # 真ん中を (h, w) に切り出す（足りなければ足す）
    H, W = x.shape
    out = np.zeros((h, w), bool)
    sy, sx = (H - h) // 2, (W - w) // 2
    ys, xs = max(0, sy), max(0, sx)
    yd, xd = max(0, -sy), max(0, -sx)
    hh, ww = min(h - yd, H - ys), min(w - xd, W - xs)
    out[yd:yd + hh, xd:xd + ww] = x[ys:ys + hh, xs:xs + ww]
    return out


def score_font(ref: np.ndarray, text: str, font_path: Path, shears=None) -> dict:
    """傾き（参考をまっすぐに戻す量）を候補ごとに探し、つぎに太さの差（縁取りの重なり）を1つ探して、
    字ごとの IoU の平均がいちばん高いものを採る。"""
    f = load_font(font_path, 360)
    chars = list(text)
    adv = [max(f.getlength(ch), 1.0) for ch in chars]
    shears = shears if shears is not None else [-0.15, -0.1, -0.05, 0.0, 0.05, 0.1, 0.15]
    best = None
    for k in shears:
        up = shear(ref, -k)
        cells = cuts_by_advance(up, adv)
        rs = [tight(up[:, x0:x1]) for x0, x1 in cells]
        per = [iou(r, fit_to(glyph(font_path, ch), r.shape)) for r, ch in zip(rs, chars) if r.size and r.sum() >= 30]
        sc = float(np.mean(per)) if per else 0.0
        if best is None or sc > best[0]:
            best = (sc, k, rs, up)
    sc0, k, rs, up = best
    hgt = tight(up).shape[0]
    bw = (sc0, 0, None)
    for frac in (-0.04, -0.03, -0.02, -0.01, 0.01, 0.02, 0.03, 0.04, 0.06):
        r = int(round(frac * hgt))
        if r == 0:
            continue
        per = [iou(rr, weight_fit(glyph(font_path, ch), rr.shape, r)) for rr, ch in zip(rs, chars) if rr.size and rr.sum() >= 30]
        sc = float(np.mean(per)) if per else 0.0
        if sc > bw[0]:
            bw = (sc, r, per)
    r = bw[1]
    per = bw[2] or [iou(rr, fit_to(glyph(font_path, ch), rr.shape)) for rr, ch in zip(rs, chars) if rr.size and rr.sum() >= 30]
    # 行ぜんたい: 高さを揃え、横の倍率を 0.80〜1.25 で探す（字間・字幅の癖まで含めた近さ。太さの補正はしない）
    line = tight(render(f, text))
    rt = tight(up)
    lbest = 0.0
    sy = rt.shape[0] / line.shape[0]
    for sx in np.arange(0.80, 1.251, 0.025):
        w = max(1, int(round(line.shape[1] * sy * sx)))
        g = cv2.resize(line.astype(np.uint8) * 255, (w, rt.shape[0]), interpolation=cv2.INTER_AREA) > 127
        W = max(w, rt.shape[1])
        A = np.zeros((rt.shape[0], W), bool); A[:, (W - rt.shape[1]) // 2:(W - rt.shape[1]) // 2 + rt.shape[1]] = rt
        B = np.zeros((rt.shape[0], W), bool); B[:, (W - w) // 2:(W - w) // 2 + w] = g
        lbest = max(lbest, iou(A, B))
    return {"char_iou": round(float(np.mean(per)), 4), "char_iou_raw": round(sc0, 4),
            "char_iou_min": round(float(np.min(per)), 4) if per else 0.0, "n_chars": len(per),
            "line_iou": round(lbest, 4), "slant": float(k), "erode_px": int(r),
            "erode_frac_of_height": round(r / hgt, 3), "height_px": int(hgt)}


def frame_path(spec_path: str | Path, s: dict) -> Path:
    """見本の `frame`。相対の道なら SPEC.json の置き場から読む（作業の置き場ごと動かせるように）。"""
    p = Path(s["frame"])
    return p if p.is_absolute() else Path(spec_path).resolve().parent / p


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("spec")
    ap.add_argument("--fonts", required=True, help="候補の書体の置き場（下の階まで拾う）")
    ap.add_argument("--out", required=True)
    ap.add_argument("--only", help="この id の見本だけ")
    a = ap.parse_args()
    spec = json.loads(Path(a.spec).read_text())
    out = Path(a.out); out.mkdir(parents=True, exist_ok=True)
    fonts = sorted(Path(a.fonts).rglob("*.[ot]tf"))
    if not fonts:
        sys.exit(f"候補の書体が1本も無い: {a.fonts}")
    results = {}
    for s in spec["samples"]:
        if a.only and s["id"] != a.only:
            continue
        rgb = np.array(Image.open(frame_path(a.spec, s)).convert("RGB"))
        x0, y0, x1, y1 = s["box"]
        crop = rgb[y0:y1, x0:x1]
        m0 = extract(crop, s["edge"], s["fill"], 1, s.get("close", 0))
        ys = np.where(m0.any(1))[0]
        hgt = (ys.max() - ys.min() + 1) if len(ys) else 1
        m = extract(crop, s["edge"], s["fill"], s.get("min_area", int(0.004 * hgt * hgt)), s.get("close", 0))
        m = tight_pad(m)
        text = s["text"].replace(" ", "")
        Image.fromarray((m * 255).astype(np.uint8)).save(out / f"mask_{s['id']}.png")
        rows = []
        for fp in fonts:
            if not has_glyphs(fp, text):
                continue
            rows.append({"font": fp.name, **score_font(m, text, fp, s.get("shears"))})
        rows.sort(key=lambda r: -r["char_iou"])
        results[s["id"]] = {"role": s["role"], "text": s["text"], "box": s["box"], "frame": Path(s["frame"]).name,
                            "mask_px": [int(m.shape[1]), int(m.shape[0])], "ranking": rows}
        print(s["id"], [(r["font"], r["char_iou"], r["line_iou"], r["slant"]) for r in rows[:5]], flush=True)
    p = out / "font_match.json"
    old = json.loads(p.read_text()) if p.exists() else {}
    old.update(results)
    p.write_text(json.dumps(old, ensure_ascii=False, indent=1))


if __name__ == "__main__":
    main()
