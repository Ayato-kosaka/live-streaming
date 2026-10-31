#!/usr/bin/env python3
"""書き出した1本から、担当が目で見る絵と、頭の BGM・終わりの札の数を作る（Actions の job が回す。手元でも同じ）。

    python3 tools/shorts/render/proof.py out.mp4 out.work --prefix <置き場>/<id> [--crops <検査の切り抜き>]

できるもの（`<prefix>.…`）:

| ファイル | 中身 |
| --- | --- |
| `sheet1s.jpg` | 1秒に1コマ（字を重ねたまま）。左上に秒。0秒目の画・場面の流れ・ぼかし忘れ・透かしの残りを見る |
| `texts.jpg` | 字（題の札・字幕・【大】・注）を1つずつ、出ている間のコマから原寸の周りで切り抜いて並べたもの。語の途中の割れ・はみ出しを見る。終わりの注（CTA）は最後のコマから |
| `faces.jpg` | 品質チェックの顔の切り抜き（`check.py --crops`）を並べたもの。顔は人の目で決める |
| `proof.json` | 頭の音（最初の1秒をコマごとに。仕上がりと BGM の束）・BGM の頭で飛ばした秒・終わりの札が最後のコマに描かれているか |

前は担当が手元で同じものを書いて回していた（1秒ごとのコマ一覧・字の切り抜き一覧）。書き出しと同じ箱で作れば、
担当は mp4 を落とさずに、この絵と JSON だけを読めば済む（#1011）。

## 終わりの札を「描かれている」と言う決め

時間割（plan.json）の注のうち `end_note` の印のあるもの（様式の `end_note` が足したもの。F-042）について、
最後のコマで、字ありの書き出しと字なしの版（`work/no_text.mp4`）の札の箱の中の差の平均が `DRAWN_DIFF` を越えるか。
字なしの版が無い（顔よけを切った様式・下書き）ときは、時間割だけで見て `drawn` は null にする。
"""
from __future__ import annotations

import argparse
import json
import math
import subprocess
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont

# 同じ階の selectexpr.py を読む（ほかの道具から import されたときも。後ろに足すので、呼んだ側の同名を隠さない）
if str(Path(__file__).resolve().parent) not in sys.path:
    sys.path.append(str(Path(__file__).resolve().parent))
from selectexpr import select_expr  # noqa: E402

HERE = Path(__file__).resolve().parent
SR = 48000
# 札の箱の中の、字ありと字なしの差の平均（0〜255）。札は半透明の黒（0.72）の地に白い字なので、
# どんな画の上でも 40 以上の差になる。符号化の揺れは 3 前後
DRAWN_DIFF = 12.0
TILE_W = 540


def font(size: int) -> ImageFont.FreeTypeFont:
    for name in ("MPLUSRounded1c-Black.ttf", "MPLUSRounded1c-ExtraBold.ttf"):
        p = HERE / "fonts" / name
        if p.exists():
            return ImageFont.truetype(str(p), size)
    return ImageFont.load_default()


def size_of(mp4: Path) -> tuple[int, int, int]:
    out = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-count_packets",
                          "-show_entries", "stream=width,height,nb_read_packets", "-of", "json", str(mp4)],
                         check=True, capture_output=True, text=True).stdout
    s = json.loads(out)["streams"][0]
    return int(s["width"]), int(s["height"]), int(s.get("nb_read_packets") or 0)


def grab(mp4: Path, frames: list[int], W: int, H: int) -> dict[int, np.ndarray]:
    """コマ番号で選んで1回の復号で取る（-ss で1枚ずつ取るより速く、コマを取り違えない）。"""
    uniq = sorted(set(frames))
    if not uniq:
        return {}
    # 式は selectexpr.py で組む（1秒ごとの一覧は60コマを超える。`+` で横につなぐと新しい ffmpeg は101項で止まる）
    raw = subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-i", str(mp4), "-vf",
                          f"select={select_expr(uniq)}",
                          "-fps_mode", "passthrough", "-f", "rawvideo", "-pix_fmt", "rgb24", "-"],
                         check=True, capture_output=True).stdout
    arr = np.frombuffer(raw, dtype=np.uint8).reshape(-1, H, W, 3)
    return dict(zip(uniq, arr))


def tile(tiles: list[Image.Image], cols: int, gap: int = 8, bg=(200, 200, 200)) -> Image.Image:
    if not tiles:
        return Image.new("RGB", (TILE_W, 60), bg)
    rows = [tiles[i:i + cols] for i in range(0, len(tiles), cols)]
    tw = max(t.width for t in tiles)
    W = tw * cols + gap * (cols - 1)
    H = sum(max(t.height for t in r) for r in rows) + gap * (len(rows) - 1)
    out = Image.new("RGB", (W, H), bg)
    y = 0
    for r in rows:
        for k, t in enumerate(r):
            out.paste(t, (k * (tw + gap), y))
        y += max(t.height for t in r) + gap
    return out


def labeled(im: Image.Image, text: str, w: int = TILE_W) -> Image.Image:
    s = w / im.width
    im = im.resize((w, max(1, round(im.height * s))))
    lab = Image.new("RGB", (w, 40), "white")
    d = ImageDraw.Draw(lab)
    f = font(24)
    while text and d.textlength(text, font=f) > w - 12:
        text = text[:-1]
    d.text((6, 7), text, font=f, fill="black")
    out = Image.new("RGB", (w, 40 + im.height), "white")
    out.paste(lab, (0, 0))
    out.paste(im, (0, 40))
    return out


def sheet_1s(mp4: Path, fps: int, W: int, H: int, n: int, out: Path, cols: int = 10) -> int:
    frames = list(range(0, n, fps))
    got = grab(mp4, frames, W, H)
    tiles = []
    f = font(22)
    for fr in frames:
        im = Image.fromarray(got[fr]).resize((270, round(270 * H / W)))
        d = ImageDraw.Draw(im)
        d.rectangle((0, 0, 58, 26), fill=(0, 0, 0))
        d.text((5, 1), f"{fr // fps}s", font=f, fill=(255, 230, 0))
        tiles.append(im)
    tile(tiles, cols, gap=4, bg=(255, 255, 255)).save(out, quality=85)
    return len(tiles)


def text_items(plan: dict) -> list[tuple[str, dict, str, int]]:
    """(種類, 時間割の字, 読める字, 取るコマ)。字が出きったころ（出る動きのあと）。短い字は真ん中。"""
    items = []
    for t in plan.get("titles", []):
        items.append(("題", t, " / ".join(t.get("drawn") or t.get("lines") or [])))
    for c in plan.get("captions", []):
        kind = "【大】" + c["big"] if c.get("big") else (c.get("mood") or "字幕")
        items.append((kind, c, " / ".join(c.get("lines") or [])))
    for nt in plan.get("notes", []):
        items.append(("注(終わり)" if nt.get("end_note") else "注", nt, " / ".join(nt.get("lines") or [nt["text"]])))
    out = []
    for kind, it, txt in sorted(items, key=lambda z: z[1]["from"]):
        if it.get("end_note"):
            f = it["to"] - 1  # 終わりの札は、最後のコマで見る（F-042「最後の画」）
        else:
            f = min(it["to"] - 1, it["from"] + max(10, (it["to"] - it["from"]) // 2))
        out.append((kind, it, txt, f))
    return out


def texts_sheet(mp4: Path, plan: dict, W: int, H: int, out: Path, cols: int = 3) -> int:
    PW, PH = plan["size"]
    k = W / PW  # 下書きは縦横半分（置き場は本番の座標）
    items = text_items(plan)
    got = grab(mp4, [f for *_, f in items], W, H)
    fps = plan["fps"]
    tiles = []
    for kind, it, txt, f in items:
        im = Image.fromarray(got[f])
        x, y, w, h = it.get("x", 0), it.get("y", 0), it.get("w", PW), it.get("h", 200)
        pad = 40
        box = tuple(round(v * k) for v in (max(0, x - pad), max(0, y - pad), min(PW, x + w + pad), min(PH, y + h + pad)))
        tiles.append(labeled(im.crop(box), f"{f / fps:5.1f}s {kind}: {txt}"))
    tile(tiles, cols).save(out, quality=88)
    return len(tiles)


def faces_sheet(crops: Path, out: Path, cols: int = 6) -> int:
    files = sorted(crops.glob("face_*.jpg"))
    tiles = [labeled(Image.open(p).convert("RGB"), p.stem.replace("face_", ""), w=240) for p in files]
    if tiles:
        tile(tiles, cols).save(out, quality=85)
    return len(tiles)


def rms_db(x: np.ndarray) -> float:
    return round(20 * math.log10(max(float(np.sqrt(np.mean(x.astype(np.float64) ** 2))) if len(x) else 0.0, 1e-9)), 1)


def head_audio(mp4: Path, work: Path, fps: int, seconds: float = 1.0) -> dict:
    """最初の1秒を、コマごとの RMS（dBFS）で。仕上がり（mp4 の音）と BGM の束（work/stem_bgm.f32）の両方。"""
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", str(mp4), "-t", str(seconds), "-ac", "1", "-ar", str(SR),
                          "-f", "f32le", "-"], check=True, capture_output=True).stdout
    mix = np.frombuffer(raw, dtype="<f4")
    spf = SR // fps
    n = int(seconds * fps)
    out = {"mix_db": [rms_db(mix[i * spf:(i + 1) * spf]) for i in range(n)]}
    stem = work / "stem_bgm.f32"
    if stem.is_file():
        b = np.fromfile(stem, dtype="<f4", count=n * spf * 2).reshape(-1, 2).mean(axis=1)
        out["bgm_db"] = [rms_db(b[i * spf:(i + 1) * spf]) for i in range(n)]
        loud = [i for i, v in enumerate(out["bgm_db"]) if v > -60]
        out["bgm_first_frame"] = loud[0] if loud else None
    return out


def end_card(mp4: Path, work: Path, plan: dict, W: int, H: int, n: int) -> list[dict]:
    """様式が足した終わりの札が、最後のコマに描かれているか（字ありと字なしの版の差で見る）。"""
    PW = plan["size"][0]
    k = W / PW
    last = plan["frames"] - 1
    plate = work / "no_text.mp4"
    out = []
    a = grab(mp4, [last], W, H).get(last) if n else None
    b = None
    if plate.is_file() and not plan.get("draft"):
        pw, ph, _ = size_of(plate)
        if (pw, ph) == (W, H):
            b = grab(plate, [last], W, H).get(last)
    last_cut = plan["cuts"][-1]["at"] if plan.get("cuts") else None
    for nt in plan.get("notes", []):
        if not nt.get("end_note"):
            continue
        ent = {"text": nt["text"], "lines": nt.get("lines"), "from": nt["from"], "to": nt["to"],
               "box": [nt.get("x"), nt.get("y"), nt.get("w"), nt.get("h")], "last_cut_at": last_cut,
               "covers_last_frame": nt["from"] <= last < nt["to"],
               "covers_last_cut": last_cut is not None and nt["from"] <= last_cut, "drawn": None}
        if a is not None and b is not None and "x" in nt:
            x0, y0 = round(nt["x"] * k), round(nt["y"] * k)
            x1, y1 = x0 + round(nt["w"] * k), y0 + round(nt["h"] * k)
            d = float(np.abs(a[y0:y1, x0:x1].astype(np.int16) - b[y0:y1, x0:x1].astype(np.int16)).mean())
            ent["diff_vs_no_text"] = round(d, 1)
            ent["drawn"] = d > DRAWN_DIFF
        out.append(ent)
    return out


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("mp4", type=Path)
    ap.add_argument("work", type=Path)
    ap.add_argument("--prefix", type=Path, required=True, help="<置き場>/<id>。<id>.sheet1s.jpg ほかを書く")
    ap.add_argument("--crops", type=Path, help="品質チェックの切り抜きの置き場（check.py --crops）")
    a = ap.parse_args()
    plan = json.loads((a.work / "plan.json").read_text(encoding="utf-8"))
    W, H, n = size_of(a.mp4)
    fps = plan["fps"]
    a.prefix.parent.mkdir(parents=True, exist_ok=True)
    pre = str(a.prefix)
    res = {"frames": n, "size": [W, H], "seconds": round(n / fps, 3)}
    res["sheet1s"] = sheet_1s(a.mp4, fps, W, H, n, Path(pre + ".sheet1s.jpg"))
    res["texts"] = texts_sheet(a.mp4, plan, W, H, Path(pre + ".texts.jpg"))
    if a.crops and a.crops.is_dir():
        res["faces"] = faces_sheet(a.crops, Path(pre + ".faces.jpg"))
    res["bgm"] = {"head_trim_s": (plan.get("bgm") or {}).get("head_trim_s"),
                  "fade_in_s": (plan.get("bgm") or {}).get("fade_in_s")} if plan.get("bgm") else None
    res["head"] = head_audio(a.mp4, a.work, fps)
    res["end_notes"] = end_card(a.mp4, a.work, plan, W, H, n)
    # 顔を避けて字を動かした行（前の版と字の置き場が変わっていないかを、要約だけで見られるように）。
    # 同じ指示書でも、書き出す箱の CPU が変わると字なしの版の符号化が変わり、顔の箱が動いて字が動くことがある
    # （銅像 p2 の 7行目が、Actions では 216px 下へ動いた。2026-10-21）
    res["moved"] = [{k: f.get(k) for k in ("kind", "text", "from", "to", "how", "y_from", "y_to")}
                    for f in plan.get("face_avoid", []) if f.get("y_from") != f.get("y_to") or f.get("unresolved")]
    Path(pre + ".proof.json").write_text(json.dumps(res, ensure_ascii=False, indent=1), encoding="utf-8")
    print(json.dumps({k: v for k, v in res.items() if k != "head"}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())
