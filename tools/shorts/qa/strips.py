#!/usr/bin/env python3
"""人の目の検査のための帯の絵（mp4 1本につき JPEG 1枚＋JSON）。

    python3 tools/shorts/qa/strips.py out.mp4 [work_dir] [--out PREFIX]

書くもの（`.claude/skills/viral-shorts-creator/references/production.md` の 3）:
  (a) はじめの帯: 0・0.5・1・2・3・4.5 秒（0秒目がいちばん強い画か）
  (b) ナレーションの行ごとの帯: 行の頭から 1秒ごと、時刻とその行の字幕つき
      （真ん中の1コマだけの一覧では、行の前半の何も無いカウンターを見落とした）
  (c) 弱い画の見当: 字の箱を除いた画の「粗い形の量」が少ない間が 2秒以上続き、
      顔も写っていない所に赤い枠。**needs-human の手がかりで、合否ではない**

出力: PREFIX.jpg（人が見る1枚）と PREFIX.json（同じ中身を機械が読む形）。既定の PREFIX は
`<mp4 の名前>.strips`。終了コードは 0（読めなければ 2）。弱い画があっても落とさない。

## 弱い画の物差し（なぜそれか）

「細かさ」（ラプラシアンの分散・そのままの辺の量）では分けられなかった。歩道のレンガは
細かい模様で辺が多く、焼き場の串（強い画）より「細かい」と出る。人が弱いと言った画は、
**大きな形が少ない**——一色の金属やガラスの面、遠目に一様な歩道。だから 270x480 に縮めた画を
さらに 1/8（34x60）にして辺を数える（`e8` = 辺の強さ 20 を越える画素の割合、字の箱は除く）。
レンガの目は 1/8 で均され、串・肉・棚の商品は形として残る。

1本目（yk-by7R7iPA、人が見た6本の yt 版）で測った値（4コマ/秒、2秒の窓の中央値）:

| 区間 | 人の判定 | e8（各コマ） | 窓の中央値 | 印 |
| --- | --- | --- | --- | --- |
| B 10.8〜13.2 秒（何も無いカウンター） | 弱い | 0.799〜0.834 | 0.801〜0.843 | 9/10 コマ |
| C 15〜24 秒（歩道） | 弱い | 0.683〜0.792 | 0.704〜0.741 | 36/36 |
| A 0.5〜3 秒（回る肉の串） | 強い | 0.832〜0.885 | 0.849〜0.869 | 0/10 |
| B 5.8〜9 秒（スーパーの棚） | 強い | 0.919〜0.952 | 0.888〜0.947 | 0/13 |

線は 0.835（窓の中央値。カウンターのふつうの値 0.80〜0.82 と、串のいちばん低い 0.849 の間。
カウンターの頭の 10.8 秒だけは、窓に前の通路が入って 0.843 になり印が付かない）。
自撮りで話している顔は大きな形が少なく 0.73〜0.80 に出るが、顔が主役の画なので、顔
（書き出しで 96px 以上・肌色の箱）が写っているコマは数えない。
"""
from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

from common import ffprobe, load_plan, rate  # noqa: E402

OPENING = [0.0, 0.5, 1.0, 2.0, 3.0, 4.5]
FPS = 4                  # 物差しを取る間隔（コマ/秒）
SW, SH = 270, 480        # 物差しを取る大きさ（書き出しの 1/4）
E8_SCALE = 0.125
E8_EDGE = 20.0
WEAK_E8 = 0.835          # 2秒の窓の中央値がこれ未満なら、大きな形が少ない
WEAK_MIN_SEC = 2.0       # これ以上続いたら知らせる
WIN_SEC = 2.0            # 中央値を取る窓
THUMB_W, THUMB_H = 160, 284
PER_LINE = 8


def font(size: int):
    """和文の書ける書体。書き出しの書体（fetch_fonts.sh）→ 箱の和文書体 → 無ければ既定。"""
    cands = [HERE.parent / "render" / "fonts" / "MPLUSRounded1c-Black.ttf",
             Path("/usr/share/fonts/opentype/ipafont-gothic/ipag.ttf"),
             Path("/usr/share/fonts/truetype/fonts-japanese-gothic.ttf"),
             Path("/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc")]
    if os.environ.get("SHORTS_FONTS_DIR"):
        cands.insert(0, Path(os.environ["SHORTS_FONTS_DIR"]) / "MPLUSRounded1c-Black.ttf")
    # 和文の無い箱（CI）でも止めない。DejaVu なら字幕は豆腐になるが、時刻と枠は読める
    cands.append(Path("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"))
    for p in cands:
        if p.exists():
            try:
                return ImageFont.truetype(str(p), size)
            except OSError:
                continue
    try:
        return ImageFont.load_default(size)
    except TypeError:  # Pillow 10.1 より前
        return ImageFont.load_default()


def frames_small(mp4: Path) -> np.ndarray:
    raw = subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-i", str(mp4), "-map", "0:v:0",
                          "-vf", f"fps={FPS},scale={SW}:{SH}:flags=area", "-f", "rawvideo", "-pix_fmt", "rgb24", "-"],
                         check=True, capture_output=True).stdout
    return np.frombuffer(raw, np.uint8).reshape(-1, SH, SW, 3)


def overlay_mask(plan: dict | None, f: int, W: int) -> np.ndarray:
    """そのコマで字の箱がある所を False にした面（字は画の強さに数えない）。"""
    m = np.ones((SH, SW), bool)
    s = SW / W
    for o in (plan or {}).get("overlays", []) or []:
        if int(o["from"]) <= f < int(o["to"]):
            x0, y0 = int(o["x"] * s) - 2, int(o["y"] * s) - 2
            x1, y1 = int((o["x"] + o["w"]) * s) + 2, int((o["y"] + o["h"]) * s) + 2
            m[max(0, y0):y1, max(0, x0):x1] = False
    return m


def e8(cv2, img: np.ndarray, m: np.ndarray) -> float:
    """1/8 に縮めた画の、辺の強さが E8_EDGE を越える画素の割合（字の箱を除く）。"""
    g = cv2.cvtColor(img, cv2.COLOR_RGB2GRAY).astype(np.float32)
    w, h = int(SW * E8_SCALE), int(SH * E8_SCALE)
    g = cv2.resize(g, (w, h), interpolation=cv2.INTER_AREA)
    mm = cv2.resize(m.astype(np.uint8), (w, h), interpolation=cv2.INTER_NEAREST).astype(bool)
    if mm.sum() < 50:
        return float("nan")
    mag = np.hypot(cv2.Sobel(g, cv2.CV_32F, 1, 0), cv2.Sobel(g, cv2.CV_32F, 0, 1))
    return float((mag[mm] > E8_EDGE).mean())


def face_in(cv2, det, img: np.ndarray) -> bool:
    """主役になる大きさの顔が写っているか（270x480 で 24px 以上 ＝ 書き出しで 96px 以上、肌色の箱）。"""
    if det is None:
        return False
    import faces
    name, run, wants_gray = det
    src = cv2.cvtColor(img, cv2.COLOR_RGB2GRAY) if wants_gray else cv2.cvtColor(img, cv2.COLOR_RGB2BGR)
    for (x, y, w, h) in run(src):
        if faces.skin_share(cv2, img, x, y, w, h) >= faces.SKIN_MIN:
            return True
    return False


def weak_stretches(vals: np.ndarray, face: np.ndarray) -> tuple[list[dict], np.ndarray]:
    n = len(vals)
    half = int(WIN_SEC * FPS / 2)
    med = np.array([np.nanmedian(vals[max(0, i - half):i + half]) if np.isfinite(vals[max(0, i - half):i + half]).any()
                    else np.nan for i in range(n)])
    # 顔は前後 0.5 秒にも効かせる（検出がコマごとに瞬くので）
    k = FPS // 2
    face_near = np.array([face[max(0, i - k):i + k + 1].any() for i in range(n)])
    weak = (med < WEAK_E8) & ~face_near
    out, i = [], 0
    while i < n:
        if weak[i]:
            j = i
            while j < n and weak[j]:
                j += 1
            if (j - i) / FPS >= WEAK_MIN_SEC:
                out.append({"from_s": round(i / FPS, 2), "to_s": round(j / FPS, 2),
                            "e8_median": round(float(np.nanmedian(vals[i:j])), 3)})
            i = j
        else:
            i += 1
    return out, med


def captions_by_line(plan: dict) -> dict[int, str]:
    out: dict[int, list[str]] = {}
    for c in plan.get("captions", []) or []:
        if "line" in c:
            out.setdefault(int(c["line"]), []).append("／".join(c.get("lines") or []) or c.get("text", ""))
    return {k: " ／ ".join(v) for k, v in out.items()}


def make(mp4: Path, work: Path | None, prefix: Path, plate: Path | None = None) -> dict:
    import cv2
    pr = ffprobe(mp4)
    v = next(s for s in pr["streams"] if s.get("codec_type") == "video")
    W = int(v["width"])
    fps = rate(v.get("avg_frame_rate")) or 30.0
    plan = load_plan(work)
    small = frames_small(mp4)
    n = len(small)
    import faces
    det = faces.detector(cv2)
    vals = np.array([e8(cv2, small[i], overlay_mask(plan, int(i / FPS * fps), W)) for i in range(n)])
    # 顔は字なしの書き出し（work/no_text.mp4）で探す。字のあるコマでは、自撮りの顔にタイトルや
    # 強調の字が掛かって、Haar が1つも見つけなかった（A の 9〜14 秒）。無ければ字のあるコマで探す
    if plate is None and work is not None and (work / "no_text.mp4").exists():
        plate = work / "no_text.mp4"
    src = small
    if plate is not None:
        ps = frames_small(plate)
        if len(ps) >= n - 1:
            src = ps
        else:
            plate = None
    # 1コマ/秒で見て、その秒の4コマに広げる（重いので）
    face = np.zeros(n, bool)
    for i in range(0, n, FPS):
        if i < len(src) and face_in(cv2, det, src[i]):
            face[i:i + FPS] = True
    weak, med = weak_stretches(vals, face)

    def at(t: float) -> int:
        return min(n - 1, max(0, int(round(t * FPS))))

    rows = []
    caps = captions_by_line(plan) if plan else {}
    for i, ln in enumerate((plan or {}).get("narration", []) or []):
        t0, t1 = ln["at"] / plan["fps"], (ln["at"] + ln["frames"]) / plan["fps"]
        ts = [round(t0 + k, 2) for k in range(int(t1 - t0) + 1) if t0 + k < t1]
        if ts and t1 - ts[-1] > 0.6:
            ts.append(round(t1 - 0.25, 2))  # 行の終わり際も1枚
        rows.append({"line": i, "from_s": round(t0, 2), "to_s": round(t1, 2), "caption": caps.get(i, ""),
                     "text": ln.get("text", ""), "frames_s": ts,
                     "weak": [w for w in weak if w["from_s"] < t1 and w["to_s"] > t0]})
    rep = {"file": str(mp4), "work": str(work) if work else None,
           "status": "needs-human" if weak else "pass",
           "thresholds": {"weak_e8_lt": WEAK_E8, "window_sec": WIN_SEC, "min_sec": WEAK_MIN_SEC,
                          "sample_fps": FPS, "face_detector": det[0] if det else None},
           "face_source": str(plate) if plate else "字のあるコマ（字なしの書き出しが無い。字の掛かった顔は見逃す）",
           "face_seconds": [round(i / FPS, 2) for i in range(0, n, FPS) if face[i]],
           "opening_s": OPENING, "rows": rows, "weak": weak,
           "e8_per_sec": [None if not np.isfinite(x) else round(float(x), 3) for x in vals[::FPS]]}
    img = compose(mp4, small, at, rep, med)
    prefix.parent.mkdir(parents=True, exist_ok=True)
    img.save(prefix.with_suffix(".jpg"), quality=85)
    prefix.with_suffix(".json").write_text(json.dumps(rep, ensure_ascii=False, indent=1))
    return rep


def compose(mp4: Path, small: np.ndarray, at, rep: dict, med: np.ndarray) -> Image.Image:
    f_head, f_lab, f_t = font(26), font(22), font(18)
    weak = rep["weak"]

    def is_weak(t):
        return any(w["from_s"] <= t < w["to_s"] for w in weak)

    def thumb(t):
        im = Image.fromarray(small[at(t)]).resize((THUMB_W, THUMB_H), Image.BILINEAR)
        d = ImageDraw.Draw(im)
        d.rectangle([0, 0, THUMB_W, 24], fill=(0, 0, 0))
        e = med[at(t)]
        d.text((4, 2), f"{t:.1f}s" + (f"  e8 {e:.2f}" if np.isfinite(e) else ""), font=f_t, fill=(255, 255, 255))
        if is_weak(t):
            d.rectangle([0, 0, THUMB_W - 1, THUMB_H - 1], outline=(230, 30, 30), width=5)
            d.text((6, THUMB_H - 26), "弱い画？", font=f_t, fill=(255, 60, 60))
        return im

    blocks: list[tuple[str, list[float]]] = [("はじめの帯（0・0.5・1・2・3・4.5 秒）", rep["opening_s"])]
    for r in rep["rows"]:
        lab = f"{r['line']}行目  {r['from_s']:.1f}〜{r['to_s']:.1f}秒  {r['caption'] or r['text']}"
        blocks.append((lab, r["frames_s"]))
    gap, lab_h = 8, 34
    W = PER_LINE * (THUMB_W + gap) + gap
    H = 50
    for _, ts in blocks:
        H += lab_h + ((len(ts) + PER_LINE - 1) // PER_LINE) * (THUMB_H + gap) + gap
    tail = [f"弱い画の見当（大きな形が少ない間が {WEAK_MIN_SEC:.0f}秒以上・顔なし）: "
            + ("無し" if not weak else "、".join(f"{w['from_s']}〜{w['to_s']}秒（e8 {w['e8_median']}）" for w in weak))]
    H += 40 * len(tail) + gap
    canvas = Image.new("RGB", (W, H), (24, 24, 24))
    d = ImageDraw.Draw(canvas)
    d.text((gap, 10), f"{Path(rep['file']).name}  人の目の検査の帯", font=f_head, fill=(255, 255, 255))
    y = 50
    for lab, ts in blocks:
        d.text((gap, y + 4), lab[:70], font=f_lab, fill=(255, 220, 90))
        y += lab_h
        for k, t in enumerate(ts):
            x = gap + (k % PER_LINE) * (THUMB_W + gap)
            if k and k % PER_LINE == 0:
                y += THUMB_H + gap
            canvas.paste(thumb(t), (x, y))
        y += THUMB_H + gap * 2
    for line in tail:
        d.text((gap, y + 6), line[:110], font=f_lab, fill=(255, 120, 120) if weak else (160, 220, 160))
        y += 40
    return canvas


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("mp4", type=Path)
    ap.add_argument("work", type=Path, nargs="?")
    ap.add_argument("--out", type=Path, help="出力の名前の頭（既定: <mp4>.strips）")
    ap.add_argument("--plate", type=Path, help="字なしの書き出し（顔を探す。既定: work/no_text.mp4）")
    a = ap.parse_args()
    if not a.mp4.exists():
        print(f"✕ 無い: {a.mp4}")
        return 2
    prefix = a.out or a.mp4.with_suffix(".strips")
    rep = make(a.mp4, a.work, prefix, a.plate)
    print(json.dumps({"jpg": str(prefix.with_suffix(".jpg")), "json": str(prefix.with_suffix(".json")),
                      "status": rep["status"], "weak": rep["weak"], "rows": len(rep["rows"])}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())
