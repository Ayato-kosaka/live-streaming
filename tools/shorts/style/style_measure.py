#!/usr/bin/env python3
"""参考の字の見た目を、元の画素のコマから測る（字の高さ・位置・縁の層と太さ・塗りのグラデ・発光・書体の px）。

## 何を測るか

`font_match.py` で書体が決まったあと、**同じ見た目を style.json に書くための数**を出す。

- 字の高さと位置: 塗りの外接矩形。高さ（1080 幅に直した px）・行の中心が画面の縦の何割か
- 縁の層: 塗りからの距離（距離変換）ごとに、その距離の画素がどの色に分類されるかの割合を出し、
  多数派が切り替わる距離を層の境とする（字の高さに対する比も出す）。`layers` に、塗りから外へ向かう
  縁の色の順（例 `["red", "dark"]`）を書いておくと、それぞれの太さを測る
- 塗りのグラデ: 塗りの画素を、行の上端〜下端を 10 等分した高さごとに平均した RGB
- 発光: 最後の縁の外側で、距離ごとの平均の色。外側（遠い所）の色との差が半分になる距離を半径とする
- 書体の px と字間（`--pick` を渡したとき）: 決めた書体で同じ字を描き、**塗りの高さが参考と同じになる
  font px** を出す。そのときの自然な行幅と参考の行幅の差を、字と字の間の数で割ったものが字間
  （`tracking_em` = font px に対する比）。2026-10-16 に字幕の 48px はこれで出した

座標はすべて、そのコマの元の画素で測り、1080 幅に直した値（`*_1080`）も並べる
（4K の参考なら 1/2 倍）。元の幅は**コマの画像から読む**ので、4K でも 1080p でも同じ形で回る。

## 使いかた

  python3 style_measure.py SPEC.json --out DIR [--only ID,ID] [--fonts DIR --pick ROLE=書体.ttf ...]

SPEC は font_match.py と同じ見本の一覧（`frame`・`box`・`text`・`edge`・`fill`、任意で `layers`・
`pad`（縁と発光を見るために箱の外へ広げる画素。既定は元の幅の 5.6%）・`max_dist`）。
`--pick` は役割（見本の `role`）ごとに決めた書体。`--fonts` の下からファイル名で探す。

## 出力

`<out>/style_measure.json` に見本ごとの `line_height_1080`・`center_y_over_height`・
`outline_layers[]`（層ごとの `width_px_1080`）・`fill_rgb_by_height_top_to_bottom`・`glow`・
（`--pick` を渡したら）`font_px_1080`・`tracking_em`。同じ置き場で回し直すと、見本ごとに上書きで足す。
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import cv2
import numpy as np
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
import font_match as fm  # noqa: E402

# 1080 幅に直すときの幅（style.json の canvas）
OUT_W = 1080


def font_fit(text: str, font_path: Path, ink_h_1080: float, ink_w_1080: float) -> dict:
    """塗りの高さが参考と同じになる font px と、そのときの字間（font px に対する比）。

    字の高さは書体の大きさに比例するので、大きく描いて比で直す（小さく描くと丸めで狂う）。
    """
    big = 400
    f = fm.load_font(font_path, big)
    t = fm.tight(fm.render(f, text))
    px = ink_h_1080 / t.shape[0] * big
    natural_w = t.shape[1] / big * px
    gaps = max(1, len(text) - 1)
    per_gap = (ink_w_1080 - natural_w) / gaps
    return {"font": font_path.name, "font_px_1080": round(px, 1), "natural_width_1080": round(natural_w, 1),
            "ref_width_1080": round(ink_w_1080, 1), "tracking_px_per_gap_1080": round(per_gap, 1),
            "tracking_em": round(per_gap / px, 3)}


def measure(s: dict, frame: Path) -> dict:
    rgb = np.array(Image.open(frame).convert("RGB"))
    H, W = rgb.shape[:2]
    k = OUT_W / W                      # 元の画素 → 1080 幅
    x0, y0, x1, y1 = s["box"]
    pad = s.get("pad", round(0.056 * W))
    X0, Y0, X1, Y1 = max(0, x0 - pad), max(0, y0 - pad), min(W, x1 + pad), min(H, y1 + pad)
    big = rgb[Y0:Y1, X0:X1]
    crop = rgb[y0:y1, x0:x1]
    m0 = fm.extract(crop, s["edge"], s["fill"], 1, s.get("close", 0))
    ys, xs = np.where(m0)
    if len(ys) == 0:
        sys.exit(f"{s['id']}: 箱の中に塗り（{s['fill']}、縁 {s['edge']}）が1画素も無い。box か色の名前を見直す")
    hgt = ys.max() - ys.min() + 1
    m = fm.extract(crop, s["edge"], s["fill"], s.get("min_area", int(0.004 * hgt * hgt)), s.get("close", 0))
    # 大きい切り出しの座標へ
    M = np.zeros(big.shape[:2], bool)
    M[y0 - Y0:y1 - Y0, x0 - X0:x1 - X0] = m
    ys, xs = np.where(M)
    fy0, fy1, fx0, fx1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
    lh = fy1 - fy0
    res = {"id": s["id"], "role": s["role"], "text": s["text"], "frame_size": [int(W), int(H)],
           "fill_bbox_src": [int(X0 + fx0), int(Y0 + fy0), int(X0 + fx1), int(Y0 + fy1)],
           "line_height_src": int(lh), "line_height_over_width": round(lh / W, 4),
           "line_height_1080": round(lh * k, 1), "line_width_over_width": round((fx1 - fx0) / W, 4),
           "line_width_1080": round((fx1 - fx0) * k, 1),
           "center_x_over_width": round((X0 + (fx0 + fx1) / 2) / W, 4),
           "center_y_over_height": round((Y0 + (fy0 + fy1) / 2) / H, 4),
           "center_y_1080": round((Y0 + (fy0 + fy1) / 2) * k, 1),
           "top_y_over_height": round((Y0 + fy0) / H, 4)}
    # 塗りのグラデ（行の上→下を 10 等分）
    prof = []
    for j in range(10):
        a, b = fy0 + lh * j / 10, fy0 + lh * (j + 1) / 10
        sel = M & (np.arange(M.shape[0])[:, None] >= a) & (np.arange(M.shape[0])[:, None] < b)
        prof.append([round(float(v), 1) for v in big[sel].mean(0)] if sel.sum() > 20 else None)
    res["fill_rgb_by_height_top_to_bottom"] = prof
    # 縁の層（塗りからの距離ごとの色の分類）
    dist = cv2.distanceTransform((~M).astype(np.uint8), cv2.DIST_L2, 5)
    c = fm.classes(big)
    names = s.get("layers", [s["edge"]])
    maxd = int(s.get("max_dist", 0.6 * lh))
    rows = []
    for d in range(1, maxd + 1):
        ring = (dist > d - 1) & (dist <= d)
        n = ring.sum()
        if n < 30:
            continue
        fr = {nm: round(float((ring & c[nm]).sum() / n), 3) for nm in set(names + ["dark", "white", "red", "yellow", "pink"])}
        col = big[ring].mean(0)
        rows.append({"d": d, "frac": fr, "rgb": [round(float(v), 1) for v in col]})
    res["ring_profile"] = rows
    # 層の境: 各層の割合が 0.5 を下回る最初の距離（その層が始まってから）
    bounds = []
    start = 0
    for nm in names:
        seen = False
        end = None
        for r in rows:
            if r["d"] <= start:
                continue
            if r["frac"][nm] >= 0.5:
                seen = True
            elif seen:
                end = r["d"] - 1
                break
        bounds.append({"layer": nm, "from_px_src": start, "to_px_src": end,
                       "width_px_src": None if end is None else end - start,
                       "width_over_line_height": None if end is None else round((end - start) / lh, 4),
                       "width_px_1080": None if end is None else round((end - start) * k, 1)})
        if end is None:
            break
        start = end
    res["outline_layers"] = bounds
    # 発光: 最後の縁の外の、距離ごとの色（外側の色との差が半分になる距離）
    if bounds and bounds[-1]["to_px_src"]:
        o = bounds[-1]["to_px_src"]
        outer = [r for r in rows if r["d"] > o]
        if len(outer) > 10:
            far = np.array(outer[-1]["rgb"])
            near = np.array(outer[0]["rgb"])
            dif = [float(np.linalg.norm(np.array(r["rgb"]) - far)) for r in outer]
            half = dif[0] / 2
            rad = next((r["d"] - o for r, v in zip(outer, dif) if v <= half), None)
            res["glow"] = {"just_outside_rgb": [round(float(v), 1) for v in near], "far_rgb": [round(float(v), 1) for v in far],
                           "diff_just_outside": round(dif[0], 1), "half_radius_px_src": rad,
                           "half_radius_px_1080": None if rad is None else round(rad * k, 1),
                           "half_radius_over_line_height": None if rad is None else round(rad / lh, 4)}
    return res


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("spec"); ap.add_argument("--out", required=True); ap.add_argument("--only", help="id をカンマで")
    ap.add_argument("--fonts", help="--pick の書体を探す置き場（下の階まで）")
    ap.add_argument("--pick", action="append", default=[], help="ROLE=書体のファイル名（役割ごとに決めた書体）")
    a = ap.parse_args()
    spec = json.loads(Path(a.spec).read_text())
    picks = dict(p.split("=", 1) for p in a.pick)
    fonts = {p.name: p for p in Path(a.fonts).rglob("*.[ot]tf")} if a.fonts else {}
    for role, name in picks.items():
        if name not in fonts:
            sys.exit(f"--pick {role}={name} の書体が --fonts の下に無い")
    out = {}
    for s in spec["samples"]:
        if a.only and s["id"] not in a.only.split(","):
            continue
        r = measure(s, fm.frame_path(a.spec, s))
        if s["role"] in picks:
            r.update(font_fit(s["text"].replace(" ", ""), fonts[picks[s["role"]]],
                              r["line_height_1080"], r["line_width_1080"]))
        out[s["id"]] = r
        print(s["id"], "h1080", r["line_height_1080"], f"cy {r['center_y_over_height']}",
              [(b["layer"], b["width_px_1080"]) for b in r["outline_layers"]],
              "glow", r.get("glow", {}).get("half_radius_px_1080"), r.get("glow", {}).get("just_outside_rgb"),
              "font_px", r.get("font_px_1080"), "tracking_em", r.get("tracking_em"))
    Path(a.out).mkdir(parents=True, exist_ok=True)
    p = Path(a.out) / "style_measure.json"
    old = json.loads(p.read_text()) if p.exists() else {}
    old.update(out)
    p.write_text(json.dumps(old, ensure_ascii=False, indent=1))


if __name__ == "__main__":
    main()
