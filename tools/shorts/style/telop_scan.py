#!/usr/bin/env python3
"""参考ショートの1秒1コマから、焼き込みの字（題の札・字幕・大きい字・帯）を探して数える（#1403 の F）。

    python3 tools/shorts/style/telop_scan.py <reference を開いた置き場> <出力の置き場>

置き場は取り込みの reference を開いたもの（`sheets/`・`sheets.csv`・`meta.json`、あれば `transcript.json`）。
字は「明るい塗り（白・黄・桃）のすぐ隣に暗い縁か影がある画素」が横に詰まった所として探す（縁取りの字・影つきの字）。

出力（どれも参考の画そのものなので、リポジトリに入れない。`style_reference.md` の 1 の決まり）:
  telop.json          コマごとの帯: 縦の位置 yc（画面の高さの割合）・字の高さ h1920（1920 の縦に直した px。縁と2行を含む）・
                      幅 wfrac（画面の幅の割合）・塗りと縁の色
  telop_summary.json  動かない帯（6割以上のコマの同じ所にある帯＝題の帯・シリーズの帯・枠）と、それを除いた字の数:
                      字が出ている秒の割合・縦の位置の中央値・字の高さの中央値と上位1割・大きい字（中央値の 1.45倍以上）の秒と、
                      その秒に言っている語（whisper）
  telop_pick.jpg      人が見る10コマ（0・1・2秒、大きい字の秒、字のある真ん中の秒、最後）
  telop.jpg           全コマを半分の大きさで並べ、探した帯を緑の枠で描いたもの（探し違いを人が見る）

外れかた: 画の中の看板・白い服の縞を字と取る、白い地の白い字（縁なし）を取り落とす、2行の字幕を1つの帯にする。
数は目安で、書体・縁・大きくした言葉は人が telop_pick.jpg で見て付ける。
"""
from __future__ import annotations

import csv
import json
import sys
from pathlib import Path

import cv2
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "ingest"))
from media import sheet_cell  # noqa: E402  （取り込みのシートと同じ並び）


def tiles(d: Path) -> tuple[list[tuple[float, np.ndarray]], tuple[int, int]]:
    """シートを1コマずつに切る。並びと大きさは取り込みの reference（4×3・長辺 480）と同じ。"""
    rows = list(csv.DictReader(open(d / "sheets.csv")))
    meta = json.loads((d / "meta.json").read_text()) if (d / "meta.json").exists() else {}
    w, h = int(meta.get("width") or 1080), int(meta.get("height") or 1920)
    if h >= w:
        tw, th, grid = int(round(480 * w / h / 2) * 2), 480, (4, 3)
    else:
        tw, th, grid = 480, int(round(480 * h / w / 2) * 2), (3, 4)
    out = []
    for r in rows:
        img = cv2.imread(str(d / r["file"]))
        t0 = float(r["from"])
        for i in range(int(r["frames"])):
            x, y = sheet_cell(i, grid, (tw, th))
            out.append((round(t0 + i, 2), img[y:y + th, x:x + tw]))
    return out, (tw, th)


def text_bands(fr: np.ndarray) -> list[dict]:
    hsv = cv2.cvtColor(fr, cv2.COLOR_BGR2HSV)
    v, s = hsv[:, :, 2].astype(np.int16), hsv[:, :, 1].astype(np.int16)
    gray = cv2.cvtColor(fr, cv2.COLOR_BGR2GRAY).astype(np.int16)
    bright = (gray > 195) | ((v > 200) & (s > 90))
    dark = gray < 60
    k = np.ones((3, 3), np.uint8)
    near_dark = cv2.dilate(dark.astype(np.uint8), k).astype(bool)
    near_bright = cv2.dilate(bright.astype(np.uint8), k).astype(bool)
    edge = (bright & near_dark) | (dark & near_bright)
    H, W = edge.shape
    # 横に詰めて字の行のかたまりにする
    m = cv2.morphologyEx(edge.astype(np.uint8), cv2.MORPH_CLOSE, np.ones((3, 9), np.uint8))
    n, _, stats, _ = cv2.connectedComponentsWithStats(m, 8)
    bands = []
    for j in range(1, n):
        x, y, w, h, _ = stats[j]
        if h < 6 or h > H * 0.16 or w < W * 0.10:
            continue
        box = edge[y:y + h, x:x + w]
        if box.mean() < 0.12:
            continue
        # 字らしく、行の中で明暗が細かく切り替わる（看板の太い縁や空の境目を落とす）
        if np.abs(np.diff(box.astype(np.int8), axis=1)).sum(1).mean() < 3:
            continue
        sub = fr[y:y + h, x:x + w]
        bsel, dsel = bright[y:y + h, x:x + w], dark[y:y + h, x:x + w]
        bands.append({"x": int(x), "y": int(y), "w": int(w), "h": int(h),
                      "fill": np.median(sub[bsel], 0)[::-1].astype(int).tolist() if bsel.sum() > 5 else None,
                      "line": np.median(sub[dsel], 0)[::-1].astype(int).tolist() if dsel.sum() > 5 else None})
    return sorted(bands, key=lambda b: b["y"])


def color_name(rgb):
    if rgb is None:
        return None
    r, g, b = rgb
    if max(rgb) > 200 and max(rgb) - min(rgb) < 40:
        return "白"
    if r > 180 and g > 160 and b < 120:
        return "黄"
    if r > 180 and g < 120 and b < 120:
        return "赤"
    if r > 180 and b > 140 and g < 150:
        return "桃"
    if b > 160 and r < 150:
        return "青"
    if g > 160 and r < 150 and b < 150:
        return "緑"
    if r > 180 and 100 <= g <= 180 and b < 100:
        return "橙"
    return f"{r},{g},{b}"


def words_at(d: Path, t: float, span: float = 0.9) -> str:
    p = d / "transcript.json"
    if not p.exists():
        return ""
    return "".join(w["word"] for s in json.loads(p.read_text()).get("segments", []) for w in s.get("words") or []
                   if w.get("start") is not None and t - span <= w["start"] <= t + span).strip()


def summarize(d: Path, res: list[dict]) -> dict:
    n = len(res)
    keys: dict = {}
    for r in res:
        for b in r["bands"]:
            keys.setdefault((round(b["yc"] * 50), round(b["h1920"] / 16)), set()).add(r["t"])
    fixed = {k for k, ts in keys.items() if len(ts) >= 0.6 * n}
    dyn = [{"t": r["t"], "bands": [b for b in r["bands"] if (round(b["yc"] * 50), round(b["h1920"] / 16)) not in fixed]}
           for r in res]
    shown = [x for x in dyn if x["bands"]]
    hs = [b["h1920"] for x in shown for b in x["bands"]]
    ycs = [b["yc"] for x in shown for b in x["bands"]]
    med_h = float(np.median(hs)) if hs else 0.0
    big = []
    for x in dyn:
        for b in x["bands"]:
            if med_h and b["h1920"] >= 1.45 * med_h and b["wfrac"] >= 0.2:
                big.append({"t": x["t"], "h": b["h1920"], "yc": b["yc"], "fill": b["fill_name"], "words": words_at(d, x["t"])})
                break
    fills: dict = {}
    for x in shown:
        for b in x["bands"]:
            fills[b["fill_name"]] = fills.get(b["fill_name"], 0) + 1
    return {"frames": n, "fixed_bands": [{"yc": k[0] / 50, "h": k[1] * 16} for k in sorted(fixed)],
            "text_ratio": round(len(shown) / n, 2) if n else None,
            "yc_median": round(float(np.median(ycs)), 2) if ycs else None,
            "yc_q": [round(float(np.percentile(ycs, q)), 2) for q in (10, 90)] if ycs else None,
            "h_median": round(med_h), "h_q90": round(float(np.percentile(hs, 90))) if hs else None,
            "w_median": round(float(np.median([max(b["wfrac"] for b in x["bands"]) for x in shown])), 2) if shown else None,
            "big_count": len(big), "big": big[:14],
            "fills": dict(sorted(fills.items(), key=lambda kv: -kv[1])[:5])}, dyn


def main() -> int:
    d, out = Path(sys.argv[1]), Path(sys.argv[2])
    out.mkdir(parents=True, exist_ok=True)
    frs, (tw, th) = tiles(d)
    scale = 1920 / th
    res = [{"t": t, "bands": [{**b, "yc": round((b["y"] + b["h"] / 2) / th, 3), "h1920": round(b["h"] * scale),
                               "wfrac": round(b["w"] / tw, 2), "fill_name": color_name(b["fill"]),
                               "line_name": color_name(b["line"])} for b in text_bands(fr)]} for t, fr in frs]
    (out / "telop.json").write_text(json.dumps(res, ensure_ascii=False))
    summ, dyn = summarize(d, res)
    (out / "telop_summary.json").write_text(json.dumps(summ, ensure_ascii=False, indent=1))
    # 探し違いを見る1枚（全コマを半分の大きさで、帯を緑の枠で）
    cols, sw, sh = 12, tw // 2, th // 2
    canvas = np.full((((len(frs) + cols - 1) // cols) * (sh + 14), cols * sw, 3), 30, np.uint8)
    for k, ((t, fr), r) in enumerate(zip(frs, res)):
        im = fr.copy()
        for b in r["bands"]:
            cv2.rectangle(im, (b["x"], b["y"]), (b["x"] + b["w"], b["y"] + b["h"]), (0, 255, 0), 2)
        y, x = divmod(k, cols)
        canvas[y * (sh + 14):y * (sh + 14) + sh, x * sw:(x + 1) * sw] = cv2.resize(im, (sw, sh))
        cv2.putText(canvas, f"{t:.0f}", (x * sw + 3, y * (sh + 14) + sh + 11), cv2.FONT_HERSHEY_SIMPLEX, 0.35, (230, 230, 230), 1)
    cv2.imwrite(str(out / "telop.jpg"), canvas, [cv2.IMWRITE_JPEG_QUALITY, 70])
    # 人が見る10コマ
    ts = [f[0] for f in frs]
    pick = [i for i in (0, 1, 2) if i < len(frs)]
    for b in summ["big"]:
        if b["t"] in ts and ts.index(b["t"]) not in pick and len(pick) < 7:
            pick.append(ts.index(b["t"]))
    mids = [ts.index(x["t"]) for x in dyn if x["bands"] and x["t"] in ts]
    for i in ((mids[len(mids) // 3], mids[2 * len(mids) // 3]) if mids else ()):
        if i not in pick and len(pick) < 9:
            pick.append(i)
    if frs and len(frs) - 1 not in pick:
        pick.append(len(frs) - 1)
    W, H = 216, 384
    sheet = np.full((2 * (H + 18), 5 * W, 3), 25, np.uint8)
    for k, i in enumerate(sorted(pick)[:10]):
        t, fr = frs[i]
        r, c = divmod(k, 5)
        sheet[r * (H + 18):r * (H + 18) + H, c * W:(c + 1) * W] = cv2.resize(fr, (W, H), interpolation=cv2.INTER_AREA)
        cv2.putText(sheet, f"{t:.0f}s", (c * W + 4, r * (H + 18) + H + 14), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (240, 240, 240), 1)
    cv2.imwrite(str(out / "telop_pick.jpg"), sheet, [cv2.IMWRITE_JPEG_QUALITY, 78])
    print(json.dumps({k: summ[k] for k in ("text_ratio", "yc_median", "h_median", "h_q90", "w_median", "big_count")},
                     ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())
