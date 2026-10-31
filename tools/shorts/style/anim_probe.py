#!/usr/bin/env python3
"""参考動画の字が「出る・いる・消える」ところを、元のコマ数（元の fps）のまま測る道具。

## 何を測るか

字の出かた・消えかたは、ふつうに再生して見ても速すぎて分からない（2026-10-16 の参考は、
ほぼ全部が1コマで出て1コマで消えていた）。頼んだ区間を元の fps のまま1コマずつ抜き、

- コマごとの塗りの外接矩形・重心・面積・平均の色（どのコマで出て、どのコマで消え、揺れているか）
- 連続画像（1コマずつ並べた1枚。目で「カットか、ふわっとか」を見る）

を出す。倍率・濃さ・ぼけの曲線まで測るのは `anim_curve.py`（ここで抜いたコマを読む）。

## 使いかた

  python3 anim_probe.py grab    VIDEO EVENTS.json --out DIR [--only ID,ID]   # 区間ごとに帯を抜いて .npy に
  python3 anim_probe.py measure EVENTS.json --out DIR [--only ...]           # コマごとの矩形・面積・色 → JSON
  python3 anim_probe.py strip   EVENTS.json --out DIR [--only ...] [--strip-out DIR]   # 連続画像

EVENTS.json:

  {"band": [y0, y1], "scale": 0.5,
   "events": [{"id", "role", "t0", "t1", "fill", "edge", "roi": [x0, y0, x1, y1],
               "label", "view": [x0, y0, x1, y1], "strip": {"first", "count", "step", "cols", "tile_w"}}]}

- 座標はすべて**元の動画の画素**。`band` は抜く横帯（縦の範囲。全幅を抜く）、`scale` は抜いたものを
  何倍で持つか（4K を 0.5 倍で持つと、1区間 0.7秒で 300MB ほど）
- `t0` / `t1` は動画の秒。`fill` / `edge` は font_match.py の色の分類の名前（`edge` を省くと塗りの色だけで拾う）
- `roi` は字が出る範囲（測るのはその中だけ）。`view` は連続画像に写す範囲（省くと roi）

動画の縦横と fps は **grab のときに ffprobe で動画から読み**、`grab_<id>.json` に残す
（measure・strip・anim_curve.py はそこから読む）。60fps の参考でも 30fps の参考でも同じ形で回る。

## 出力

- `<out>/grab_<id>.npy`（抜いたコマ。参考の動画そのものなので**リポジトリには置かない**）と `grab_<id>.json`
- `<out>/anim_measure.json` … id ごとに `fps` と `rows[]`（`frame` = 動画の頭を 0 とした元の fps のコマ番号・
  `t`・`area`・`x0 x1 y0 y1 cx cy`（元の画素）・`mean_rgb`）。字が無いコマは `area` だけ
- `<strip-out or out>/anim_<id>.png` … 連続画像（各コマに番号と秒）
"""
from __future__ import annotations

import argparse
import json
import subprocess
import sys
from fractions import Fraction
from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFont

sys.path.insert(0, str(Path(__file__).resolve().parent))
import font_match as fm  # noqa: E402


def probe(video: str) -> dict:
    """動画の縦横と fps（r_frame_rate）。取り込みの clips は CFR に揃えてあるので、これがコマの刻み。"""
    r = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries",
                        "stream=width,height,r_frame_rate", "-of", "json", video],
                       capture_output=True, text=True, check=True)
    st = json.loads(r.stdout)["streams"][0]
    return {"width": int(st["width"]), "height": int(st["height"]), "fps": float(Fraction(st["r_frame_rate"]))}


def grab(video: str, info: dict, ev: dict, band: list[int], scale: float, out: Path) -> Path:
    y0, y1 = band
    fps = info["fps"]
    W = int(info["width"] * scale)
    H = int((y1 - y0) * scale)
    t0 = ev["t0"]
    n = int(round((ev["t1"] - ev["t0"]) * fps))
    # 頭のコマを正確に合わせるため、-ss は入力の前（符号化し直すので、手前のキーフレームから復号して正確に切れる）
    cmd = ["ffmpeg", "-v", "error", "-ss", f"{t0:.4f}", "-i", video, "-frames:v", str(n),
           "-vf", f"crop={info['width']}:{y1 - y0}:0:{y0},scale={W}:{H}:flags=area",
           "-f", "rawvideo", "-pix_fmt", "rgb24", "-"]
    raw = subprocess.run(cmd, capture_output=True, check=True).stdout
    arr = np.frombuffer(raw, dtype=np.uint8).reshape(-1, H, W, 3)
    p = out / f"grab_{ev['id']}.npy"
    np.save(p, arr)
    meta = {"id": ev["id"], "video": Path(video).name, "fps": fps, "t0": t0, "frame0": frame_index(t0, 0, fps),
            "frames": int(len(arr)), "src_size": [info["width"], info["height"]], "band": band, "scale": scale}
    (out / f"grab_{ev['id']}.json").write_text(json.dumps(meta, ensure_ascii=False, indent=1))
    return p


def grab_meta(out: Path, gid: str) -> dict:
    p = out / f"grab_{gid}.json"
    if not p.exists():
        sys.exit(f"{p} が無い。先に grab を回す")
    return json.loads(p.read_text())


def frame_index(t0: float, i: int, fps: float) -> int:
    return int(round(t0 * fps)) + i


def measure_frame(rgb: np.ndarray, ev: dict, band: list[int], scale: float) -> dict:
    x0, y0, x1, y1 = ev["roi"]
    bx0, by0 = int(x0 * scale), int((y0 - band[0]) * scale)
    bx1, by1 = int(x1 * scale), int((y1 - band[0]) * scale)
    crop = rgb[by0:by1, bx0:bx1]
    c = fm.classes(crop)
    if ev.get("edge"):
        m = fm.extract(crop, ev["edge"], ev["fill"], ev.get("min_area", 20))
    else:
        m = c[ev["fill"]]
        n, lab, st, _ = cv2.connectedComponentsWithStats(m.astype(np.uint8), connectivity=8)
        keep = np.zeros(n, bool)
        keep[1:] = st[1:, 4] >= ev.get("min_area", 20)
        m = keep[lab]
    ys, xs = np.where(m)
    if len(xs) < ev.get("min_px", 80):
        return {"area": int(len(xs))}
    # 外れ値（背景の同じ色）に引っ張られないよう、0.5〜99.5 パーセンタイルの外接
    X0, X1 = np.percentile(xs, [0.5, 99.5])
    Y0, Y1 = np.percentile(ys, [0.5, 99.5])
    col = crop[m].astype(np.float64)
    return {"area": int(len(xs)),
            # 元の画素の座標に戻す
            "x0": round(x0 + X0 / scale, 1), "x1": round(x0 + X1 / scale, 1),
            "y0": round(y0 + Y0 / scale, 1), "y1": round(y0 + Y1 / scale, 1),
            "cx": round(x0 + xs.mean() / scale, 1), "cy": round(y0 + ys.mean() / scale, 1),
            "mean_rgb": [round(v, 1) for v in col.mean(0)]}


def picked(spec: dict, only: str | None) -> list[dict]:
    return [ev for ev in spec["events"] if not only or ev["id"] in only.split(",")]


def cmd_grab(a):
    spec = json.loads(Path(a.events).read_text())
    out = Path(a.out); out.mkdir(parents=True, exist_ok=True)
    info = probe(a.video)
    print(f"動画 {info['width']}x{info['height']} {info['fps']:g}fps", flush=True)
    for ev in picked(spec, a.only):
        p = grab(a.video, info, ev, spec["band"], spec["scale"], out)
        print("grabbed", p, flush=True)


def cmd_measure(a):
    spec = json.loads(Path(a.events).read_text())
    out = Path(a.out)
    res = {}
    for ev in picked(spec, a.only):
        meta = grab_meta(out, ev["id"])
        fps = meta["fps"]
        arr = np.load(out / f"grab_{ev['id']}.npy")
        rows = []
        for i, fr in enumerate(arr):
            r = measure_frame(fr, ev, spec["band"], spec["scale"])
            r["i"] = i
            r["frame"] = frame_index(ev["t0"], i, fps)
            r["t"] = round(r["frame"] / fps, 4)
            rows.append(r)
        res[ev["id"]] = {"role": ev["role"], "fps": fps, "rows": rows}
    p = out / "anim_measure.json"
    old = json.loads(p.read_text()) if p.exists() else {}
    old.update(res)
    p.write_text(json.dumps(old, ensure_ascii=False, indent=0))
    print("wrote", p)


def cmd_strip(a):
    spec = json.loads(Path(a.events).read_text())
    out = Path(a.out)
    lf = label_font()
    for ev in picked(spec, a.only):
        fps = grab_meta(out, ev["id"])["fps"]
        arr = np.load(out / f"grab_{ev['id']}.npy")
        s = ev.get("strip", {})
        first, count, step = s.get("first", 0), s.get("count", 15), s.get("step", 1)
        x0, y0, x1, y1 = ev.get("view", ev["roi"])
        sc = spec["scale"]
        bx0, by0, bx1, by1 = int(x0 * sc), int((y0 - spec["band"][0]) * sc), int(x1 * sc), int((y1 - spec["band"][0]) * sc)
        tiles = []
        for k in range(count):
            i = first + k * step
            if i >= len(arr):
                break
            im = Image.fromarray(arr[i][by0:by1, bx0:bx1])
            tw = s.get("tile_w", 360)
            im = im.resize((tw, max(1, int(im.height * tw / im.width))))
            tiles.append((frame_index(ev["t0"], i, fps), im))
        if not tiles:
            print(f"{ev['id']}: strip の first が抜いたコマの外（{len(arr)}コマ）", file=sys.stderr)
            continue
        cols = s.get("cols", 5)
        tw, th = tiles[0][1].size
        rows = (len(tiles) + cols - 1) // cols
        canvas = Image.new("RGB", (cols * tw, rows * (th + 24) + 30), (30, 30, 34))
        d = ImageDraw.Draw(canvas)
        d.text((6, 4), f"{ev['id']}  {ev.get('label', '')}  {fps:g}fps のコマ番号（0 = 動画の頭）", font=lf, fill=(255, 220, 120))
        for k, (fi, im) in enumerate(tiles):
            x, y = (k % cols) * tw, 30 + (k // cols) * (th + 24)
            d.text((x + 4, y + 2), f"#{fi}  {fi / fps:.3f}s", font=lf, fill=(230, 230, 230))
            canvas.paste(im, (x, y + 22))
        dest = Path(a.strip_out or out)
        dest.mkdir(parents=True, exist_ok=True)
        p = dest / f"anim_{ev['id']}.png"
        canvas.save(p)
        print("wrote", p, canvas.size)


# 見出しの字（和文が要る）。箱に入っているものを順に探す
LABEL_FONTS = ("/usr/share/fonts/opentype/ipafont-gothic/ipag.ttf",
               "/usr/share/fonts/truetype/fonts-japanese-gothic.ttf",
               "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc")


def label_font(size=18):
    for p in LABEL_FONTS:
        if Path(p).exists():
            return ImageFont.truetype(p, size)
    return ImageFont.load_default()


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    s = sub.add_parser("grab"); s.add_argument("video"); s.add_argument("events")
    s = sub.add_parser("measure"); s.add_argument("events")
    s = sub.add_parser("strip"); s.add_argument("events"); s.add_argument("--strip-out")
    for p in sub.choices.values():
        p.add_argument("--out", required=True); p.add_argument("--only", help="id をカンマで")
    a = ap.parse_args()
    {"grab": cmd_grab, "measure": cmd_measure, "strip": cmd_strip}[a.cmd](a)


if __name__ == "__main__":
    main()
