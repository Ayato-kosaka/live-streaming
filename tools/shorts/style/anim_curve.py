#!/usr/bin/env python3
"""出かたの曲線（倍率・濃さ・くっきり度・位置）を、落ち着いたコマの字形を型にして測る。

## 何を測るか

`anim_probe.py` の連続画像で「ふわっと出る」「拡大して出る」と分かった字について、コマごとに

- 倍率 s: 型を中心のまわりに s 倍したものと、各コマの塗りの重なり（IoU）が最大になる s（既定 0.2〜1.6）。
  位置は重心の差で合わせ、そのずれ（元の画素）も出す
- 濃さ（`toward_final_color`）: 型の画素の上で、そのコマの色が「字の色」にどれだけ寄っているか
  （`--from` のコマ＝字が出る前を 0、型のコマを 1 とした比）
- くっきり度（`sharpness_rel`）: 型の縁の画素の明るさの勾配の平均を、型のコマで 1 としたもの
  （ぼかしから出るときに小さい）

型 = `--ref-frame`（字が出来上がって落ち着いたコマ。元の fps のコマ番号）の塗りの画素。

## 使いかた

  python3 anim_curve.py EVENTS.json --out DIR --id EVENT --ref-frame N [--from F --to T] [--grabs ID,ID] [--scales 0.2,1.6,0.01]

EVENTS.json と DIR は `anim_probe.py` と同じ（先に `anim_probe.py grab` で `grab_<id>.npy` を作っておく）。
`--ref-frame`・`--from`・`--to` は**動画の頭を 0 とした元の fps のコマ番号**（`anim_probe.py strip` の
連続画像に焼いてある `#番号`）。区間が2つの grab にまたがるときは `--grabs` で足す。

## 出力

`<out>/curve_<id>.json` の `rows[]`（`frame`・`t`・`iou`・`scale`・`dx_src`・`dy_src`・
`toward_final_color`・`sharpness_rel`・`fill_px`）と `fps`。標準出力にも1コマ1行。
30fps の書き出しに写すときは、コマ番号を `fps / 30` で割って間引く（60fps なら偶数のコマ）。
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import cv2
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
import anim_probe as ap_  # noqa: E402
import font_match as fm  # noqa: E402


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("events"); ap.add_argument("--out", required=True)
    ap.add_argument("--id", required=True); ap.add_argument("--ref-frame", type=int, required=True)
    ap.add_argument("--from", dest="f0", type=int); ap.add_argument("--to", dest="f1", type=int)
    ap.add_argument("--grabs", default="", help="追加で読む grab の id（区間をまたぐとき）")
    ap.add_argument("--scales", default="0.2,1.6,0.01", help="倍率を探す 下限,上限,刻み")
    a = ap.parse_args()
    spec = json.loads(Path(a.events).read_text())
    evs = {e["id"]: e for e in spec["events"]}
    ev = evs[a.id]
    sc = spec["scale"]
    out = Path(a.out)
    fps = ap_.grab_meta(out, a.id)["fps"]
    frames = {}
    for gid in [a.id] + [g for g in a.grabs.split(",") if g]:
        if ap_.grab_meta(out, gid)["fps"] != fps:
            sys.exit(f"grab {gid} の fps が {a.id} と違う")
        arr = np.load(out / f"grab_{gid}.npy")
        base = ap_.frame_index(evs[gid]["t0"], 0, fps)
        for i, fr in enumerate(arr):
            frames.setdefault(base + i, fr)
    if a.ref_frame not in frames:
        sys.exit(f"--ref-frame {a.ref_frame} は抜いたコマ（{min(frames)}〜{max(frames)}）の外")
    x0, y0, x1, y1 = ev["roi"]
    bx0, by0, bx1, by1 = int(x0 * sc), int((y0 - spec["band"][0]) * sc), int(x1 * sc), int((y1 - spec["band"][0]) * sc)

    def crop(f):
        return frames[f][by0:by1, bx0:bx1]

    def fillmask(rgb):
        if ev.get("edge"):
            return fm.extract(rgb, ev["edge"], ev["fill"], 20)
        return fm.classes(rgb)[ev["fill"]]

    ref = crop(a.ref_frame)
    T = fillmask(ref)
    ys, xs = np.where(T)
    if len(xs) == 0:
        sys.exit(f"--ref-frame {a.ref_frame} に塗り（{ev['fill']}）が無い。字が出来上がったコマを選ぶ")
    cy, cx = ys.mean(), xs.mean()
    gray = lambda im: cv2.cvtColor(im, cv2.COLOR_RGB2GRAY).astype(np.float64)  # noqa: E731
    edge = cv2.morphologyEx(T.astype(np.uint8), cv2.MORPH_GRADIENT, np.ones((3, 3), np.uint8)) > 0

    def grad(im):
        g = gray(im)
        gx, gy = cv2.Sobel(g, cv2.CV_64F, 1, 0), cv2.Sobel(g, cv2.CV_64F, 0, 1)
        return np.hypot(gx, gy)

    g_ref = grad(ref)[edge].mean()
    fset = sorted(frames)
    f0 = a.f0 if a.f0 is not None else fset[0]
    f1 = a.f1 if a.f1 is not None else fset[-1]
    col_ref = ref[T].astype(np.float64).mean(0)
    pre = crop(f0)[T].astype(np.float64).mean(0)
    lo, hi, st = [float(v) for v in a.scales.split(",")]
    rows = []
    for f in range(f0, f1 + 1):
        if f not in frames:
            continue
        im = crop(f)
        M = fillmask(im)
        best = (0.0, 1.0, 0, 0)
        if M.sum() > 30:
            for s in np.arange(lo, hi + 1e-9, st):
                A = np.float32([[s, 0, cx - s * cx], [0, s, cy - s * cy]])
                Ts = cv2.warpAffine(T.astype(np.uint8), A, (T.shape[1], T.shape[0]), flags=cv2.INTER_NEAREST) > 0
                # 位置は重心の差で合わせる
                my, mx = np.where(M)
                ty, tx = np.where(Ts)
                if len(tx) == 0:
                    continue
                dx, dy = int(round(mx.mean() - tx.mean())), int(round(my.mean() - ty.mean()))
                Ts2 = np.roll(np.roll(Ts, dy, 0), dx, 1)
                v = fm.iou(M, Ts2)
                if v > best[0]:
                    best = (v, float(s), dx, dy)
        c = im[T].astype(np.float64).mean(0)
        den = np.linalg.norm(col_ref - pre)
        op = float(np.dot(c - pre, col_ref - pre) / den ** 2) if den > 1 else None
        rows.append({"frame": f, "t": round(f / fps, 4), "iou": round(best[0], 3), "scale": round(best[1], 3),
                     "dx_src": round(best[2] / sc, 1), "dy_src": round(best[3] / sc, 1),
                     "toward_final_color": None if op is None else round(op, 3),
                     "sharpness_rel": round(float(grad(im)[edge].mean() / g_ref), 3), "fill_px": int(M.sum())})
    dest = out / f"curve_{a.id}.json"
    dest.write_text(json.dumps({"id": a.id, "fps": fps, "ref_frame": a.ref_frame, "rows": rows},
                               ensure_ascii=False, indent=0))
    for r in rows:
        print(r["frame"], r["iou"], r["scale"], r["dx_src"], r["dy_src"], r["toward_final_color"], r["sharpness_rel"], r["fill_px"])


if __name__ == "__main__":
    main()
