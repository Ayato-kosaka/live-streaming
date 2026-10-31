#!/usr/bin/env python3
"""0秒目に置く画（冒頭3秒の画）の候補を、その配信の素材から測って3つ挙げ、いまの0秒目と並べた絵を作る。

    python3 tools/shorts/plan/hook.py <spec_X.json> --material <復号した材料/videoId> \\
        --clips <取り込んだ窓の index.json> [--clips <あとから足した窓の index.json>] \\
        [--current <書き出した X.mp4>] --out <置き場>

出来るもの: `<置き場>/hook_<案>.jpg`（いまの0秒目＋候補3つ）と `hook_<案>.json`（測った値・上位20）。
**決めるのは人。** 道具は測れるもので並べるだけで、「その動画の答え（オチ）を先に見せる画か」は人が見る
（手順は viral-shorts-creator の `references/production.md` 3 と `script_writing.md` 1）。

## 何を測るか（どれも 216x384 に縮めて、透かしの帯を落としてから）

| 物差し | 何を見ているか |
| --- | --- |
| 色の強さ | Hasler と Süsstrunk の colorfulness。くすんだ壁・歩道・暗い車内は低い |
| 暖色の寄り | 画の真ん中（横 15〜85%・縦 20〜80%）のうち、赤〜黄で鮮やかな画素の割合。料理・黄色いバスの寄りで高い |
| くっきり | 真ん中のラプラシアンの分散。ぶれた画は低い |
| 動き | 取り込みの `visual.csv`（1秒ごとの隣のコマとの差）。止まった画は低い |
| 顔の寄り | YuNet でいちばん大きい顔の面積の割合。2人以上写っていれば「第三者の顔」の印（ぼかしが要る） |
| 山場 | その時刻が、spec の後ろ6割にある【大】か「上がる」感情の行の画か（その動画の答えに近い画） |

点 ＝ 色の強さ・暖色の寄りの順位（各1）＋くっきり・動き・顔の順位（各0.5）＋山場（1）− 暗い画（1）。
順位は候補の中での百分位（物差しの目盛りを揃えるため）。上から、**場面の違う**3つを選ぶ
（場面は取り込みの `scenes.csv` の変わりめで区切る。同じ場面の似た画を3つ並べても、選ぶ意味が無い）。

## 候補にする画

- 取り込んだ窓（`clips`）の全部を1秒ごと（その短い動画のために取った素材）
- 取り込みのコンタクトシート（配信まるごと10秒ごと）。窓の外の画は、選んだら `clips` で取り込み直す
- どちらも、その動画の話の範囲（spec の行の時刻の最初から最後まで、前後 `--margin` 秒）に入るものだけ
"""
from __future__ import annotations

import argparse
import bisect
import csv
import json
import re
import subprocess
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont

HERE = Path(__file__).resolve().parent
RENDER = HERE.parent / "render"
YUNET = RENDER / "models" / "face_detection_yunet_2023mar.onnx"
TW, TH = 216, 384          # 測る大きさ（アーカイブのシートの1コマと同じ）
KEEP_H = 1192 / 1280       # PRISM Live の透かしの帯より上だけ使う（render の style.json の watermarks）
MIN_APART = 8.0            # 候補どうしをこれだけ離す（同じ場面の隣のコマを3つ並べない）
FONTS = [RENDER / "fonts" / "MPLUSRounded1c-Black.ttf", Path("/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc"),
         Path("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf")]


def sec(s: str) -> float:
    p = [float(x) for x in s.strip().split(":")]
    while len(p) < 3:
        p.insert(0, 0.0)
    return p[0] * 3600 + p[1] * 60 + p[2]


def hms(t: float) -> str:
    t = max(0.0, t)
    return f"{int(t // 3600)}:{int(t % 3600 // 60):02d}:{t % 60:04.1f}"


def font(size: int):
    for p in FONTS:
        try:
            return ImageFont.truetype(str(p), size)
        except OSError:
            continue
    return ImageFont.load_default()


def row_times(spec: dict) -> list[tuple[int, float, float]]:
    """spec の行ごとの（行の番号, 始まり, 終わり）。src は「0:59:22」か「0:48:38.3–0:48:40.1」"""
    out = []
    for i, r in enumerate(spec["rows"]):
        for s in r.get("src") or []:
            m = re.match(r"^(.+?)[–-](\d+:\d+:[\d.]+)$", s)
            a, b = (sec(m.group(1)), sec(m.group(2))) if m else (sec(s), sec(s) + 2.0)
            out.append((i, a, b))
    return out


def payoff_rows(spec: dict) -> set[int]:
    """山場の行: 後ろ6割にある【大】か「上がる」感情（mood が up_ で始まる）の行"""
    n = len(spec["rows"])
    return {i for i, r in enumerate(spec["rows"])
            if i >= 0.4 * n and (r.get("big") or str(r.get("mood") or "").startswith("up"))}


def fit(img: Image.Image) -> Image.Image:
    """縦長の1コマを、透かしの帯を落として測る大きさに揃える"""
    w, h = img.size
    return img.crop((0, 0, w, int(h * KEEP_H))).resize((TW, int(TH * KEEP_H)), Image.BILINEAR)


def clip_frames(index: Path) -> list[dict]:
    d = json.loads(index.read_text())
    out = []
    for c in d["clips"] if isinstance(d, dict) else d:
        if c.get("ok") is False:
            continue
        f = Path(c["file"])
        f = f if f.is_absolute() else index.parent / f
        raw = subprocess.run(["ffmpeg", "-v", "error", "-i", str(f), "-vf", f"fps=1,scale={TW}:{TH}",
                              "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], check=True, capture_output=True).stdout
        n = len(raw) // (TW * TH * 3)
        arr = np.frombuffer(raw[:n * TW * TH * 3], np.uint8).reshape(n, TH, TW, 3)
        for k in range(n):
            # fps=1 の k 枚目は、窓の頭から k+0.5 秒のあたり
            out.append({"t": float(c["start"]) + k + 0.5, "src": f"窓 {f.name}",
                        "img": fit(Image.fromarray(arr[k]))})
    return out


def sheet_frames(material: Path) -> list[dict]:
    """アーカイブのコンタクトシート（5×4 の格子・各コマの下に時刻の帯）から1コマずつ切り出す"""
    d = material / "archive"
    meta = json.loads((d / "meta.json").read_text()) if (d / "meta.json").exists() else {}
    aspect = float(meta.get("height") or 16) / float(meta.get("width") or 9)
    out = []
    cols, rows, gap, head = 5, 4, 4, 30      # ingest/analyze.py の archive の格子と、media.make_sheets の余白
    th = None
    for row in csv.DictReader(open(d / "sheets.csv")):
        a, b, n = float(row["from"]), float(row["to"]), int(row["frames"])
        step = (b - a) / (n - 1) if n > 1 else 10.0
        sheet = Image.open(d / row["file"]).convert("RGB")
        tw = (sheet.width - (cols + 1) * gap) // cols
        if th is None and n == cols * rows:
            # コマの高さは、埋まったシートの高さに合う値を、縦横の比のまわりで探す（帯の高さが高さの7%で丸まる）
            for cand in sorted(range(int(tw * aspect) - 4, int(tw * aspect) + 5), key=lambda v: abs(v - tw * aspect)):
                if head + rows * (cand + max(20, int(round(cand * 0.07)))) + (rows + 1) * gap == sheet.height:
                    th = cand
                    break
        h = th or round(tw * aspect)
        label = max(20, int(round(h * 0.07)))
        for k in range(n):
            r, c = divmod(k, cols)
            x, y = gap + c * (tw + gap), head + gap + r * (h + label + gap)
            out.append({"t": a + k * step, "src": "シート", "img": fit(sheet.crop((x, y, x + tw, y + h)))})
    return out


def visual_motion(material: Path) -> dict[int, tuple[float, float]]:
    out = {}
    p = material / "archive" / "visual.csv"
    if p.exists():
        for r in csv.DictReader(open(p)):
            out[int(float(r["t"]))] = (float(r["motion_mean"]), float(r["bright"]))
    return out


def colorfulness(a: np.ndarray) -> float:
    r, g, b = [a[..., i].astype(np.float64) for i in range(3)]
    rg, yb = r - g, 0.5 * (r + g) - b
    return float(np.hypot(rg.std(), yb.std()) + 0.3 * np.hypot(rg.mean(), yb.mean()))


def measure(c: dict, cv2, det) -> dict:
    a = np.asarray(c["img"])
    h, w = a.shape[:2]
    mid = a[int(h * 0.2):int(h * 0.8), int(w * 0.15):int(w * 0.85)]
    hsv = cv2.cvtColor(mid, cv2.COLOR_RGB2HSV)
    hue, s, v = hsv[..., 0], hsv[..., 1], hsv[..., 2]
    warm = ((hue <= 25) | (hue >= 165)) & (s > 90) & (v > 90)
    gray = cv2.cvtColor(mid, cv2.COLOR_RGB2GRAY)
    faces = []
    if det is not None:
        det.setInputSize((w, h))
        _, fs = det.detect(cv2.cvtColor(a, cv2.COLOR_RGB2BGR))
        faces = [] if fs is None else [float(f[2] * f[3]) / (w * h) for f in fs]
    return {"colorful": round(colorfulness(a), 2), "warm": round(float(warm.mean()), 4),
            "sharp": round(float(cv2.Laplacian(gray, cv2.CV_64F).var()), 1),
            "face": round(max(faces) if faces else 0.0, 4), "faces": len(faces),
            "bright": round(float(a.mean()), 1)}


def pct(vals: list[float]) -> list[float]:
    order = np.argsort(np.argsort(vals, kind="stable"), kind="stable")
    return list(order / max(1, len(vals) - 1))


def score_all(cands: list[dict], spec: dict, motion: dict) -> None:
    rt = row_times(spec)
    pay = payoff_rows(spec)
    for c in cands:
        near = [(min(abs(c["t"] - a), abs(c["t"] - b)) if not a <= c["t"] <= b else 0.0, i) for i, a, b in rt]
        d, i = min(near) if near else (99.0, None)
        c["row"] = i if d <= 3.0 else None
        c["payoff"] = c["row"] in pay
        mv = motion.get(int(c["t"]))
        c["m"]["motion"] = mv[0] if mv else 0.0
    keys = {"colorful": 1.0, "warm": 1.0, "sharp": 0.5, "motion": 0.5, "face": 0.5}
    ranks = {k: pct([c["m"][k] for c in cands]) for k in keys}
    for j, c in enumerate(cands):
        s = sum(w * ranks[k][j] for k, w in keys.items()) + (1.0 if c["payoff"] else 0.0)
        s -= 1.0 if c["m"]["bright"] < 40 else 0.0
        c["score"] = round(s, 3)
        c["ranks"] = {k: round(ranks[k][j], 2) for k in keys}


def scene_starts(material: Path) -> list[float]:
    """取り込みの `scenes.csv`（場面の変わりめ）の時刻。配信は1つの場面が数分続く"""
    p = material / "archive" / "scenes.csv"
    return sorted(float(r["t"]) for r in csv.DictReader(open(p))) if p.exists() else []


def pick(cands: list[dict], scenes: list[float], n: int = 3) -> list[dict]:
    """点の高い順に、**場面（scenes.csv の変わりめで区切った間）が互いに違う**ものを n 個。
    北マケドニアの B で、時刻（8秒）や見た目の差で離すだけだと、3つとも「同じバス停で同じ構図で食べている」画になり、
    選ぶ意味が無かった（縮めた絵の差は、同じ場面どうし 0.10〜0.21・別の場面 0.16〜0.32 で、線が引けなかった）"""
    out = []
    for c in sorted(cands, key=lambda c: -c["score"]):
        c["scene"] = bisect.bisect_right(scenes, c["t"])
        if all(abs(c["t"] - o["t"]) >= MIN_APART and c["scene"] != o["scene"] for o in out):
            out.append(c)
        if len(out) == n:
            break
    return out


def current_frame(mp4: Path) -> Image.Image:
    raw = subprocess.run(["ffmpeg", "-v", "error", "-ss", "0", "-i", str(mp4), "-frames:v", "1",
                          "-vf", "scale=540:960", "-f", "rawvideo", "-pix_fmt", "rgb24", "-"],
                         check=True, capture_output=True).stdout
    return Image.fromarray(np.frombuffer(raw, np.uint8).reshape(960, 540, 3))


def montage(tiles: list[tuple[Image.Image, list[str]]], title: str, out: Path) -> None:
    W, H, lab, gap, head = 360, 640, 132, 12, 56
    img = Image.new("RGB", (gap + len(tiles) * (W + gap), head + H + lab + gap), (20, 20, 20))
    d = ImageDraw.Draw(img)
    d.text((gap, 12), title, fill=(240, 240, 240), font=font(28))
    for k, (im, lines) in enumerate(tiles):
        x = gap + k * (W + gap)
        t = im.copy()
        t.thumbnail((W, H))
        img.paste(t, (x + (W - t.width) // 2, head))
        for j, s in enumerate(lines):
            d.text((x + 4, head + H + 6 + j * 31), s, fill=(255, 230, 120) if j == 0 else (230, 230, 230),
                   font=font(24 if j == 0 else 21))
    img.save(out, "JPEG", quality=88)


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("spec", type=Path)
    ap.add_argument("--material", type=Path, required=True, help="復号した材料の videoId の置き場（archive/ がある所）")
    ap.add_argument("--clips", type=Path, action="append", default=[], help="取り込んだ窓の index.json（複数可）")
    ap.add_argument("--current", type=Path, help="いまの書き出し（0秒目のコマを並べる）")
    ap.add_argument("--out", type=Path, required=True)
    ap.add_argument("--margin", type=float, default=60.0, help="spec の行の時刻の範囲の前後に足す秒（候補を探す範囲）")
    a = ap.parse_args()
    spec = json.loads(a.spec.read_text())
    import cv2
    det = cv2.FaceDetectorYN.create(str(YUNET), "", (TW, TH), 0.7, 0.3, 50) if YUNET.exists() else None
    if det is None:
        print(f"注意: 顔の重みが無い（{YUNET}。render/fetch_fonts.sh）。顔の寄りは 0 で数える", file=sys.stderr)
    cands = [c for p in a.clips for c in clip_frames(p)] + sheet_frames(a.material)
    # その動画の話の範囲（spec の行が指す時刻の最初から最後まで＋前後の余白）だけを候補にする。
    # 範囲を切らないと、同じ配信の別の案の画（C のバスに B のケバブ屋）が上に来る
    rt = row_times(spec)
    lo, hi = min(a0 for _, a0, _ in rt) - a.margin, max(b0 for _, _, b0 in rt) + a.margin
    cands = [c for c in cands if lo <= c["t"] <= hi]
    for c in cands:
        c["m"] = measure(c, cv2, det)
    score_all(cands, spec, visual_motion(a.material))
    top = pick(cands, scene_starts(a.material))
    a.out.mkdir(parents=True, exist_ok=True)
    sid = spec.get("id", "x")
    cur0 = rt[0][1] if rt else None

    def lines_of(c: dict, k: int) -> list[str]:
        r = c["row"]
        m = c["m"]
        return [f"候補{k}  点 {c['score']:.2f}" + ("  山場" if c["payoff"] else ""),
                f"{hms(c['t'])}  {c['src'][:16]}",
                f"行 {r if r is not None else '—'}" + (f" {spec['rows'][r]['line'][:11]}" if r is not None else "（spec の外）"),
                f"色{m['colorful']:.0f} 暖{m['warm'] * 100:.0f}% 動{m['motion']:.1f} 顔{m['face'] * 100:.0f}%"
                + (f" 人{m['faces']}" if m["faces"] > 1 else "")]
    tiles = []
    if a.current:
        same = [c for c in cands if cur0 is not None and abs(c["t"] - cur0) <= 1.0]
        cs = max(same, key=lambda c: c["score"]) if same else None
        tiles.append((current_frame(a.current), ["いまの0秒目" + (f"  点 {cs['score']:.2f}" if cs else ""),
                                                 f"{hms(cur0) if cur0 is not None else '—'}（spec の1行目）",
                                                 f"順位 {sorted(cands, key=lambda c: -c['score']).index(cs) + 1}/{len(cands)}" if cs else "",
                                                 ""]))
    for k, c in enumerate(top, 1):
        tiles.append((c["img"].resize((360, int(360 * c["img"].height / c["img"].width))), lines_of(c, k)))
    montage(tiles, f"{sid}: 0秒目の画の候補（測った順。決めるのは人）", a.out / f"hook_{sid}.jpg")
    rank = sorted(cands, key=lambda c: -c["score"])
    (a.out / f"hook_{sid}.json").write_text(json.dumps({
        "spec": str(a.spec), "candidates": len(cands), "current_t": cur0,
        "picked": [{k: v for k, v in c.items() if k != "img"} for c in top],
        "top20": [{k: v for k, v in c.items() if k != "img"} for c in rank[:20]]}, ensure_ascii=False, indent=1))
    print(json.dumps({"out": str(a.out / f"hook_{sid}.jpg"), "candidates": len(cands),
                      "picked": [(hms(c["t"]), c["src"], c["row"], c["score"]) for c in top]}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())
