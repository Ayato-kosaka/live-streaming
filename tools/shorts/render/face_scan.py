#!/usr/bin/env python3
"""顔を見つけて、ぼかしの箱を決める手伝いをする（決めるのは人。これは見落としを減らす道具）。

    python3 tools/shorts/render/face_scan.py edit.json OUTDIR [--every 5] [--score 0.5]
    python3 tools/shorts/render/face_scan.py --mp4 out.mp4 OUTDIR [--every 3]      # 書き出したものを見回る

- 指示書のカットごとに、元素材のコマを every コマおきに YuNet（OpenCV Zoo）に通す
- 見つけた顔を、コマをまたいで「同じ人」の列（track）につなぐ。列ごとに、ぼかしに貼れる形
  （元動画の時刻つきの keys）を出す。**本人（カメラを持っている人）かどうかは、絵を見て人が決める**
- 指示書に書いてあるぼかしの箱が、見つけた顔を覆っているかも数える（覆っていない顔は UNCOVERED）
- カットごとに、始め・1/4・真ん中・3/4・終わりと、覆っていない顔のあるコマを並べた絵を出す

**ぼかしの帳面に書く（`--book`）。** 撮影の素材（#1441）の顔は、組む前に素材ごとに通す:

    python3 tools/shorts/render/face_scan.py --footage ffdb9709b1 --footage f285e3b71f OUTDIR --book <blur.json>

作業用（`SHORTS_FOOTAGE_DIR/<ID>.mp4`）を頭から終わりまで every コマおきに見て、列ごとの箱を帳面の `regions`
（`from_t` は `<ID> <秒>`）に、通した記録を帳面の `footage.<ID>`（sha256・通した範囲）に書く。撮影の素材に写るのは
カメラを持つあやと以外の人なので、**大きすぎる箱（看板・体の誤検出。幅が画の 20% を越える）を除いて全部**入れる。
箱は face_scan の箱をさらに 0.35 ずつ広げ、列の前4コマ・後5コマまで掛ける（ホットワインの回 D で決めた大きさ）。
`build_edit.py --blur <blur.json>` が撮影の素材のカットに掛け、記録の無い素材のカットは組まずに止まる。
検出の漏れ（横顔・小さい顔）は、OUTDIR の絵を見て帳面に手で足す（`note` を `face_scan` で始めない箱は、取り直しても残る）。
指示書を通すとき（`edit.json OUTDIR --book <blur.json> --cuts 3,5`）は、名指したカットの列を帳面に足す。配信の窓のカットは
本人が写るので、本人の写らないカット（店の人・人混み）だけを名指す。

`--mp4` は書き出した mp4 を見回る。ぼかした顔は見つからないはず（見つかったら潰し方が弱い）。
見つかった顔を全部絵にするので、それが本人だけかを目で確かめる。

YuNet の重みは fetch_fonts.sh が models/ に落とす（MIT。git には入れない）。
"""
from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import render as R  # noqa: E402

MODEL = HERE / "models" / "face_detection_yunet_2023mar.onnx"
FONT = HERE / "fonts" / "MPLUSRounded1c-Black.ttf"


def detector(cv2, w: int, h: int, score: float):
    if not MODEL.exists():
        sys.exit(f"顔の重みが無い: {MODEL}（tools/shorts/render/fetch_fonts.sh を回す）")
    return cv2.FaceDetectorYN.create(str(MODEL), "", (w, h), score, 0.3, 50)


def detect(cv2, det, rgb: np.ndarray) -> list[dict]:
    _, faces = det.detect(cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR))
    out = []
    for f in faces if faces is not None else []:
        x, y, w, h = [float(v) for v in f[:4]]
        out.append({"rect": [round(x), round(y), round(w), round(h)], "score": round(float(f[-1]), 3)})
    return out


def iou(a, b) -> float:
    ax1, ay1, bx1, by1 = a[0] + a[2], a[1] + a[3], b[0] + b[2], b[1] + b[3]
    iw = max(0, min(ax1, bx1) - max(a[0], b[0]))
    ih = max(0, min(ay1, by1) - max(a[1], b[1]))
    inter = iw * ih
    return inter / max(1e-9, a[2] * a[3] + b[2] * b[3] - inter)


def covered(face, f: int, regs: list[dict]) -> float:
    """顔の箱のうち、ぼかしの箱に入っている割合（いちばん多く覆う1つで）。"""
    best = 0.0
    for reg in regs:
        r = R.interp_rect(reg, f)
        if not r:
            continue
        iw = max(0, min(face[0] + face[2], r[0] + r[2]) - max(face[0], r[0]))
        ih = max(0, min(face[1] + face[3], r[1] + r[3]) - max(face[1], r[1]))
        best = max(best, iw * ih / max(1, face[2] * face[3]))
    return best


def tracks_of(dets: list[tuple[int, dict]], gap: int) -> list[list[tuple[int, dict]]]:
    """コマ順の検出を、重なり（IoU）か近さで「同じ人」の列につなぐ。"""
    tracks: list[list[tuple[int, dict]]] = []
    for f, d in sorted(dets, key=lambda z: z[0]):
        best, bs = None, 0.0
        for tr in tracks:
            lf, ld = tr[-1]
            if f == lf or f - lf > gap:
                continue
            a, b = ld["rect"], d["rect"]
            s = iou(a, b)
            dist = np.hypot(a[0] + a[2] / 2 - b[0] - b[2] / 2, a[1] + a[3] / 2 - b[1] - b[3] / 2)
            if s < 0.1 and dist > 0.8 * max(a[2], b[2]):
                continue
            s = max(s, 0.1)
            if s > bs:
                best, bs = tr, s
        if best is None:
            tracks.append([(f, d)])
        else:
            best.append((f, d))
    return tracks


def grow(rect, k: float = 0.35) -> list[int]:
    """顔の箱を広げる（髪・耳・あごまで。YuNet の箱は目鼻口に寄っていて、輪郭が残る）。"""
    x, y, w, h = rect
    return [round(x - w * k), round(y - h * k * 1.2), round(w * (1 + 2 * k)), round(h * (1 + 2.2 * k))]


def tile(rgb: np.ndarray, boxes: list[tuple[list, tuple, str]], label: str, tw: int = 300) -> Image.Image:
    h, w = rgb.shape[:2]
    s = tw / w
    im = Image.fromarray(rgb).resize((tw, round(h * s)), Image.LANCZOS)
    d = ImageDraw.Draw(im)
    f = ImageFont.truetype(str(FONT), 14)
    for r, color, text in boxes:
        x, y, bw, bh = [v * s for v in r]
        d.rectangle([x, y, x + bw, y + bh], outline=color, width=3)
        d.text((x + 2, max(0, y - 16)), text, fill=color, font=f, stroke_width=2, stroke_fill=(0, 0, 0))
    d.rectangle([0, 0, tw, 20], fill=(0, 0, 0))
    d.text((3, 2), label, fill=(255, 255, 255), font=f)
    return im


def grid(tiles: list[Image.Image], cols: int = 6) -> Image.Image:
    tw, th = tiles[0].size
    rows = (len(tiles) + cols - 1) // cols
    g = Image.new("RGB", (cols * (tw + 4) + 4, rows * (th + 4) + 4), (30, 30, 30))
    for i, t in enumerate(tiles):
        g.paste(t, (4 + (i % cols) * (tw + 4), 4 + (i // cols) * (th + 4)))
    return g


def hms(t: float) -> str:
    h, r = divmod(t, 3600)
    m, s = divmod(r, 60)
    return f"{int(h)}:{int(m):02d}:{s:05.2f}"


def scan_edit(edit_path: Path, out: Path, every: int, score: float, book_path: Path | None = None,
              pick: list[int] | None = None):
    edit, style, base = R.load(edit_path)
    fps = style["canvas"]["fps"]
    cuts = []
    for c in edit["cuts"]:
        sd = edit["sources"][c["src"]]
        src = R.source_path(base, sd)
        cuts.append({**c, "path": str(src), "meta": R.probe(src), "t0": float(sd.get("t0", 0)),
                     "footage": sd.get("footage")})
    report = scan_cuts(cuts, out, every, score, fps)
    (out / "faces.json").write_text(json.dumps(report, ensure_ascii=False, indent=1))
    if book_path is None:
        return
    # 名指したカットの列を帳面へ（撮影の素材は素材の秒で・配信の窓は配信の秒で）
    book = load_book(book_path)
    for k in pick or []:
        c, rep = cuts[k], report[k]
        fid = c["footage"]
        a, b = c["t0"] + c["in"] / fps, c["t0"] + c["out"] / fps
        drop_auto(book, fid, a, b)
        lim = TOO_WIDE * c["meta"]["w"]
        for tr in rep["tracks"]:
            reg = track_region(tr, fps, lim, (lambda t: secs(sec_of(t))) if fid else (lambda t: hms3(sec_of(t))))
            if not reg:
                continue
            ra, rb = max(a, reg.pop("from_s")), min(b, reg.pop("to_s"))
            book["regions"].append({"from_t": f"{fid} {secs(ra)}" if fid else hms3(ra),
                                    "to_t": f"{fid} {secs(rb)}" if fid else hms3(rb), **reg})
        if fid:
            book_footage(book, fid, ledger_sha(fid), [[a, b]], every, score)
    save_book(book_path, book)


def hms3(t: float) -> str:
    h, r = divmod(t, 3600)
    m, x = divmod(r, 60)
    return f"{int(h)}:{int(m):02d}:{x:06.3f}"


def scan_cuts(cuts: list[dict], out: Path, every: int, score: float, fps: int, prefix: str = "cut") -> list[dict]:
    """カットごとに顔を見つけて列にし、見る絵（OUTDIR/<prefix>NN.jpg）と列の一覧を返す。cuts[] は src・in・out・path・meta・t0"""
    cv2 = R.cv()
    report = []
    for k, c in enumerate(cuts):
        meta = c["meta"]
        cut = {**c, "w": meta["w"], "h": meta["h"], "color_space": meta["color_space"], "frames": c["out"] - c["in"]}
        t0 = c["t0"]
        det = detector(cv2, meta["w"], meta["h"], score)
        n = cut["frames"]
        want_tiles = {0, n // 4, n // 2, 3 * n // 4, n - 1}
        dets, frames_kept = [], {}
        for j, img in enumerate(R.decode_cut(cut, fps)):
            if j % every and j not in want_tiles and j != n - 1:
                continue
            f = c["in"] + j
            ds = detect(cv2, det, img)
            for d in ds:
                d["covered"] = round(covered(d["rect"], f, c.get("blur", [])), 2)
                dets.append((f, d))
            if j in want_tiles or any(d["covered"] < 0.8 for d in ds):
                frames_kept[f] = img
        trs = tracks_of(dets, gap=3 * every)
        tr_out = []
        for ti, tr in enumerate(trs):
            sizes = [d["rect"][2] for _, d in tr]
            keys = [{"t": hms(t0 + f / fps), "rect": grow(d["rect"])} for f, d in tr]
            # 箱の数を減らす（同じ動きの間は省く。始め・終わり・向きが変わるところは残す）
            if len(keys) > 2:
                thin = [keys[0]]
                for a, b in zip(keys[1:-1], keys[2:]):
                    if max(abs(x - y) for x, y in zip(a["rect"], thin[-1]["rect"])) > 0.15 * max(a["rect"][2], 1) \
                            or a is keys[-2]:
                        thin.append(a)
                thin.append(keys[-1])
                keys = thin
            tr_out.append({"track": ti, "frames": [tr[0][0], tr[-1][0]], "n": len(tr),
                           "max_w": max(sizes), "mean_score": round(float(np.mean([d["score"] for _, d in tr])), 2),
                           "uncovered": sum(d["covered"] < 0.8 for _, d in tr), "keys": keys})
        tiles = []
        for f in sorted(frames_kept):
            boxes = []
            for reg in c.get("blur", []):
                r = R.interp_rect(reg, f)
                if r:
                    boxes.append((r, (60, 220, 60), "blur"))
            for ti, tr in enumerate(trs):
                for ff, d in tr:
                    if ff == f:
                        col = (60, 160, 255) if d["covered"] >= 0.8 else (255, 60, 60)
                        boxes.append((d["rect"], col, f"T{ti} {d['score']:.2f}"))
            tiles.append(tile(frames_kept[f], boxes, f"{prefix}{k} f{f} {hms(t0 + f / fps)}"))
        if tiles:
            grid(tiles[:24]).save(out / f"{prefix}{k:02d}.jpg", quality=85)
        unc = sum(1 for _, d in dets if d["covered"] < 0.8)
        report.append({"cut": k, "row": c.get("row"), "src": c["src"], "in": c["in"], "out": c["out"],
                       "t": [hms(t0 + c["in"] / fps), hms(t0 + c["out"] / fps)], "detections": len(dets),
                       "uncovered": unc, "tracks": tr_out, "blur": c.get("blur", [])})
        print(f"{prefix}{k:02d} row{c.get('row')} {hms(t0 + c['in'] / fps)} 顔 {len(dets)} / 覆っていない {unc} / 列 {len(trs)}")
    return report


AUTO = "face_scan"       # 帳面の箱のうち、この道具が書いたもの（取り直すと入れ替わる。人の足した箱は残る）
PAD = 0.35               # 帳面に書くとき、grow した箱をさらに広げる割合（ホットワインの回 D の polish と同じ）
TOO_WIDE = 0.2037        # 画の幅のこの割合を越える「顔」は体・看板の誤検出（1080 幅で 220px。720 幅の配信は 160px）
LEDGER = HERE.parents[2] / "shorts" / "footage" / "index.json"


def secs(t: float) -> str:
    return f"{t:.3f}"


def track_region(tr: dict, fps: int, lim: float, when) -> dict | None:
    """face_scan の列（keys の t は when で秒に読む）→ 帳面の箱。大きすぎる列は None（誤検出）"""
    if tr["max_w"] > lim or max(k["rect"][2] for k in tr["keys"]) > lim:
        return None
    keys = []
    for k in tr["keys"]:
        x, y, w, h = k["rect"]
        px, py = w * PAD, h * PAD
        keys.append({"t": when(k["t"]), "rect": [round(x - px), round(y - py), round(w + 2 * px), round(h + 2 * py)]})
    return {"keys": keys, "from_s": sec_of(tr["keys"][0]["t"]) - 4 / fps, "to_s": sec_of(tr["keys"][-1]["t"]) + 5 / fps,
            "cells": 7,
            "note": f"{AUTO}（{len(tr['keys'])}箱・幅 {tr['max_w']}px まで）"}


def sec_of(t: str) -> float:
    h, m, x = str(t).split(":")
    return int(h) * 3600 + int(m) * 60 + float(x)


def load_book(path: Path) -> dict:
    if path.is_file():
        return json.loads(path.read_text())
    return {"_note": "ぼかしの帳面（tools/shorts/render/README.md「顔のぼかし」）。箱は元素材の画素。"
                     "撮影の素材の箱は from_t が '<ID> <秒>'、footage はその素材を face_scan.py に通した記録",
            "regions": []}


def save_book(path: Path, book: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(book, ensure_ascii=False, indent=1) + "\n")


def book_footage(book: dict, fid: str, sha: str | None, ranges: list[list[float]], every: int, score: float) -> None:
    rec = (book.setdefault("footage", {})).get(fid) or {}
    if sha and rec.get("sha256") and rec["sha256"] != sha:
        rec = {}   # 作業用が作り直された。前の範囲は捨てる
    got = (rec.get("scanned") or []) + ranges
    got.sort()
    merged: list[list[float]] = []
    for a, b in got:
        if merged and a <= merged[-1][1] + 1e-6:
            merged[-1][1] = max(merged[-1][1], b)
        else:
            merged.append([a, b])
    book["footage"][fid] = {"sha256": sha, "scanned": [[round(a, 3), round(b, 3)] for a, b in merged],
                            "every": every, "score": score}


def drop_auto(book: dict, src: str | None, a: float, b: float) -> None:
    """この道具が前に書いた箱のうち、同じ素材（撮影の素材の ID か、配信なら None）で [a, b) に掛かるものを外す"""
    keep = []
    for r in book["regions"]:
        f = str(r.get("from_t", "")).split(" ")
        fid = f[0] if len(f) == 2 else None
        ra = float(f[1]) if fid else sec_of(r["from_t"])
        rb = float(str(r["to_t"]).split(" ")[-1]) if fid else sec_of(r["to_t"])
        if str(r.get("note", "")).startswith(AUTO) and fid == src and ra < b and rb > a:
            continue
        keep.append(r)
    book["regions"] = keep


def ledger_sha(fid: str) -> str | None:
    if not LEDGER.is_file():
        return None
    return next((it.get("sha256") for it in json.loads(LEDGER.read_text()).get("items", []) if it["id"] == fid), None)


def scan_footage(ids: list[str], out: Path, every: int, score: float, book_path: Path) -> None:
    """撮影の素材の作業用を頭から終わりまで通し、列を帳面に書く（README の「ぼかしの帳面に書く」）"""
    book = load_book(book_path)
    for fid in ids:
        edit = {"sources": {"f": {"footage": fid}}, "cuts": []}
        path = R.source_path(HERE, edit["sources"]["f"])
        if not Path(path).is_file():
            sys.exit(f"撮影の素材の作業用が無い: {path}（footage.py look <配信> --videos で落とす）")
        meta = R.probe(Path(path))
        fps = round(meta["fps"])
        item = next((it for it in json.loads(LEDGER.read_text()).get("items", []) if it["id"] == fid), None) \
            if LEDGER.is_file() else None
        if item is None:
            sys.exit(f"撮影の素材 {fid} が台帳（{LEDGER}）に無い")
        n = int(float(item["seconds"]) * fps + 1e-6) - 1   # build_edit と同じ「使ってよい最後のコマ」まで
        report = scan_cuts([{"src": "f", "in": 0, "out": n, "path": str(path), "meta": meta, "t0": 0.0}],
                           out, every, score, fps, prefix=fid)
        lim = TOO_WIDE * meta["w"]
        drop_auto(book, fid, 0.0, n / fps)
        k = 0
        for tr in report[0]["tracks"]:
            reg = track_region(tr, fps, lim, lambda t: secs(sec_of(t)))
            if reg:
                book["regions"].append({"from_t": f"{fid} {secs(max(0.0, reg.pop('from_s')))}",
                                        "to_t": f"{fid} {secs(reg.pop('to_s'))}", **reg})
                k += 1
        book_footage(book, fid, ledger_sha(fid), [[0.0, n / fps]], every, score)
        print(f"{fid}: {n} コマ・列 {len(report[0]['tracks'])}・帳面に {k}（大きすぎる列を除いた）")
    save_book(book_path, book)


def scan_mp4(mp4: Path, out: Path, every: int, score: float):
    cv2 = R.cv()
    meta = R.probe(mp4)
    W, H = meta["w"], meta["h"]
    det = detector(cv2, W, H, score)
    raw = subprocess.Popen(
        ["ffmpeg", "-hide_banner", "-loglevel", "error", "-i", str(mp4), "-vf", f"select=not(mod(n\\,{every}))",
         "-fps_mode", "passthrough", "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], stdout=subprocess.PIPE)
    tiles, hits, k = [], [], 0
    while True:
        buf = raw.stdout.read(W * H * 3)
        if len(buf) < W * H * 3:
            break
        img = np.frombuffer(buf, dtype=np.uint8).reshape(H, W, 3)
        f = k * every
        ds = detect(cv2, det, img)
        if ds:
            hits.append({"frame": f, "faces": ds})
            tiles.append(tile(img, [(d["rect"], (255, 60, 60), f"{d['score']:.2f}") for d in ds],
                              f"f{f} {f / meta['fps']:.2f}s", tw=240))
        k += 1
    # ffmpeg が落ちると1コマも出ず、「顔のあるコマ 0」で通って見える（`-vsync 0` のままだと 9.0 でそうなる）。
    # 落ちたら落ちたと言う
    if raw.wait() != 0:
        raise RuntimeError(f"ffmpeg が {mp4} のコマを出せなかった（終了コード {raw.returncode}）")
    for i in range(0, len(tiles), 30):
        grid(tiles[i:i + 30]).save(out / f"mp4_faces_{i // 30:02d}.jpg", quality=85)
    (out / "mp4_faces.json").write_text(json.dumps(hits, ensure_ascii=False, indent=1))
    print(f"{mp4.name}: {k} コマを見て、顔のあるコマ {len(hits)}（絵 {(len(tiles) + 29) // 30} 枚）")


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("edit", type=Path, nargs="?")
    ap.add_argument("out", type=Path)
    ap.add_argument("--mp4", type=Path)
    ap.add_argument("--footage", action="append", help="撮影の素材の ID（何度でも）。作業用を頭から通して --book に書く")
    ap.add_argument("--book", type=Path, help="ぼかしの帳面（build_edit.py --blur に渡すもの）に列を書く")
    ap.add_argument("--cuts", help="指示書を通すとき、帳面に書くカットの番号（3,5,6）")
    ap.add_argument("--every", type=int, default=5)
    ap.add_argument("--score", type=float, default=0.5)
    a = ap.parse_args()
    a.out.mkdir(parents=True, exist_ok=True)
    if a.footage:
        if not a.book:
            sys.exit("--footage は --book（書く帳面）と一緒に")
        scan_footage(a.footage, a.out, a.every, a.score, a.book)
    elif a.mp4:
        scan_mp4(a.mp4, a.out, a.every, a.score)
    else:
        if a.cuts and not a.book:
            sys.exit("--cuts は --book と一緒に")
        scan_edit(a.edit, a.out, a.every, a.score, a.book, [int(x) for x in a.cuts.split(",")] if a.cuts else None)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
