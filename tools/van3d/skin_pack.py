"""キッチンカーの外装・内装の**柄を型の区画へ貼り込み**、3D に貼る絵と `skins.json` を書く。

    python3 tools/van3d/skin_pack.py <組> --src <置き場>          # 貼って書く
    python3 tools/van3d/skin_pack.py <組> --src <置き場> --dry    # 書かずに、大きさと色だけ出す

置き場に置くもの（`tools/van3d/SKIN.md`）: `tile.png`・`band.png`・`left.png`・`right.png`・`front.png`・`back.png`・
`interior.png`・`spec.json`。区画は 3D の寸法表（`site/components/legends/kitchen/van3d/dims.json`）から引く。

`spec.json` の例（どの鍵も省ける）::

    {"mode": "tile",              // tile（柄を敷く）| panel（横を1枚の絵で）
     "tile_m": 0.6,               // 柄1枚の幅（m）
     "band": [0.39, 0.86],        // 下の帯の高さ（m）。null で帯なし
     "roof": "body",              // body（地の色）| tile
     "roof_edge": null,           // 屋根の縁の色（例 "#f2c230"）
     "valance": "stripes",        // stripes（縞の舌）| noren（のれん。帯の絵を敷く）
     "colors": {"body": "#ffffff", "accent": "#c8372d", "awning": ["#c8372d", "#ffffff"]},
     "interior": {"base": "#f8f1e4", "strength": 0.3, "lower": false, "band_y": null}}

書くもの: `site/public/legends/<企画>/skins/<組>.webp`（1536×1024）・`skins/<組>-1024.webp`・`interiors/<組>.webp`、
`skins.json`（ほかの組の行は残す）。alt は材料（`book.json` の `looks[].lead`・`interior.lead`）の字をそのまま使う。
予算（外装 250KB・1024版 150KB・内装 150KB）に入らなければ、1枚も書かずに止まる。
"""
from __future__ import annotations

import argparse
import colorsys
import io
import json
import sys
from pathlib import Path

from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
from template import ROOT, Sheet, load  # noqa: E402

BUDGET = {"exterior": 250_000, "exterior1024": 150_000, "interior": 150_000}
DEFAULT_SLUG = "nomad-kitchen-car"


def hexrgb(h: str) -> tuple[int, int, int]:
    h = h.lstrip("#")
    return (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16))


def rgbhex(c) -> str:
    return "#" + "".join(f"{int(v):02x}" for v in c[:3])


def opened(src: Path, name: str) -> Image.Image | None:
    p = src / name
    return Image.open(p).convert("RGB") if p.exists() else None


def tiled(tile: Image.Image, px: int, size: tuple[int, int], origin=(0, 0)) -> Image.Image:
    """柄を px 角に縮め、絵ぜんぶに敷く（格子は絵の原点から。隣り合う区画で柄がつながる）"""
    t = tile.resize((px, px), Image.LANCZOS)
    out = Image.new("RGB", size)
    ox, oy = origin
    for y in range(-(oy % px), size[1], px):
        for x in range(-(ox % px), size[0], px):
            out.paste(t, (x, y))
    return out


def strip(band: Image.Image, h: int, w: int) -> Image.Image:
    """帯の絵を高さ h に縮め、横へ w まで並べる"""
    bw = max(1, round(band.width * h / band.height))
    b = band.resize((bw, h), Image.LANCZOS)
    out = Image.new("RGB", (w, h))
    for x in range(0, w, bw):
        out.paste(b, (x, 0))
    return out


def cover(im: Image.Image, w: int, h: int) -> Image.Image:
    """縦横比を保って区画を覆うように縮め、真ん中を切る"""
    k = max(w / im.width, h / im.height)
    r = im.resize((max(w, round(im.width * k)), max(h, round(im.height * k))), Image.LANCZOS)
    x = (r.width - w) // 2
    y = (r.height - h) // 2
    return r.crop((x, y, x + w, y + h))


def guide_band(im: Image.Image, region: list[int]) -> Image.Image:
    """横の1枚（3:2。下絵 guide-*.png の上に描いたもの）から、区画に入る帯を切る（上下の灰の帯を捨てる）"""
    x, y, w, h = region
    k = im.width / w
    band = h * k
    top = (im.height - band) / 2
    return im.crop((0, round(top), im.width, round(top + band))).resize((w, h), Image.LANCZOS)


def dilate(im: Image.Image, regions: dict, free: dict, d: int = 4) -> None:
    """区画の外へ縁の色を d px 伸ばす（縮めた絵でよその色がにじまない）"""
    for name, (x, y, w, h) in regions.items():
        f = free.get(name, "")
        if "t" in f:
            im.paste(im.crop((x, y, x + w, y + 1)).resize((w, d)), (x, y - d))
        if "b" in f:
            im.paste(im.crop((x, y + h - 1, x + w, y + h)).resize((w, d)), (x, y + h))
        if "l" in f:
            im.paste(im.crop((x, y, x + 1, y + h)).resize((d, h)), (x - d, y))
        if "r" in f:
            im.paste(im.crop((x + w - 1, y, x + w, y + h)).resize((d, h)), (x + w, y))


def pick_colors(im: Image.Image) -> dict:
    """柄から地の色・差し色・庇の縞の2色を拾う（spec.json の colors が無いとき）"""
    q = im.resize((96, 96)).quantize(8)
    pal = q.getpalette()[: 8 * 3]
    counts = sorted(q.getcolors(), reverse=True)
    cols = [tuple(pal[i * 3 : i * 3 + 3]) for _, i in counts]
    body = cols[0]

    def sat(c):
        h, l, s = colorsys.rgb_to_hls(*(v / 255 for v in c))
        return s * (1 - abs(2 * l - 1))

    rest = [c for c in cols[1:] if sum(abs(a - b) for a, b in zip(c, body)) > 90] or cols[1:] or [body]
    accent = max(rest, key=sat)
    light = max(cols, key=lambda c: sum(c))
    return {"body": rgbhex(body), "accent": rgbhex(accent), "awning": [rgbhex(accent), rgbhex(light if light != accent else (255, 255, 255))]}


def webp(im: Image.Image, budget: int) -> tuple[bytes, int]:
    for q in range(90, 34, -6):
        b = io.BytesIO()
        im.save(b, "WEBP", quality=q, method=6)
        if b.tell() <= budget:
            return b.getvalue(), q
    return b.getvalue(), -1


def exterior(d: dict, src: Path, spec: dict, colors: dict) -> Image.Image:
    S = Sheet(d)
    W, H = d["exterior"]["size"]
    scale = d["scale"]
    regs = d["exterior"]["regions"]
    span = d["exterior"]["span"]
    body = hexrgb(colors["body"])
    im = Image.new("RGB", (W, H), body)
    mode = spec.get("mode", "tile")
    tile = opened(src, "tile.png")
    band = opened(src, "band.png")
    faces = ("left", "back", "right", "front")
    if mode == "tile":
        if not tile:
            raise SystemExit(f"{src}/tile.png が無い（mode が tile の組は柄が要る）")
        sheet = tiled(tile, max(8, round(spec.get("tile_m", 0.6) * scale)), (W, H))
        for name in faces + (("roof",) if spec.get("roof", "body") == "tile" else ()):
            x, y, w, h = regs[name]
            im.paste(sheet.crop((x, y, x + w, y + h)), (x, y))
    else:
        for name in ("left", "right"):
            p = opened(src, f"{name}.png")
            if not p:
                raise SystemExit(f"{src}/{name}.png が無い（mode が panel の組は横を1枚ずつ描く）")
            x, y, w, h = regs[name]
            im.paste(guide_band(p, regs[name]), (x, y))
        for name in ("front", "back"):
            p = opened(src, f"{name}.png")
            if p:
                x, y, w, h = regs[name]
                im.paste(cover(p, w, h), (x, y))
    # 下の帯（横・前・後ろ。区画の下から、同じ高さで）
    bh = spec.get("band", [span["y"][0], 0.86])
    if band and bh:
        y0 = round((span["y"][1] - bh[1]) * scale)
        hgt = round((bh[1] - bh[0]) * scale)
        row = strip(band, hgt, W)
        for name in faces:
            x, y, w, h = regs[name]
            im.paste(row.crop((x, 0, x + w, hgt)), (x, y + y0))
    # 屋根の縁
    if spec.get("roof_edge"):
        x, y, w, h = regs["roof"]
        e = hexrgb(spec["roof_edge"])
        k = round(0.08 * scale) + round(d["box"]["r"] * scale)
        for box in ((x, y, x + w, y + k), (x, y + h - k, x + w, y + h)):
            im.paste(Image.new("RGB", (box[2] - box[0], box[3] - box[1]), e), box[:2])
        im.paste(Image.new("RGB", (w - 2 * k, h - 2 * k), body), (x + k, y + k))
    # 庇の垂れ: 縞は舌1枚に1色、のれんは帯の絵（無ければ地の色）
    x, y, w, h = regs["valance"]
    if spec.get("valance", "stripes") == "noren":
        if band:
            im.paste(cover(band, w, h), (x, y))
        else:
            im.paste(Image.new("RGB", (w, h), hexrgb(colors["awning"][0])), (x, y))
    else:
        n = d["valance"]["stripes"]["n"]
        aw = [hexrgb(c) for c in colors["awning"]]
        for i in range(n):
            a = x + round(w * i / n)
            b = x + round(w * (i + 1) / n)
            im.paste(Image.new("RGB", (b - a, h), aw[i % 2]), (a, y))
    x, y, w, h = regs["white"]
    im.paste(Image.new("RGB", (w + 4, h + 4), (255, 255, 255)), (x - 2, y - 2))
    dilate(im, {k: v for k, v in regs.items() if k != "white"}, d["exterior"]["free"])
    del S
    return im


def interior(d: dict, src: Path, spec: dict, colors: dict) -> Image.Image:
    W, H = d["interior"]["size"]
    scale = d["scale"]
    regs = d["interior"]["regions"]
    span = d["interior"]["span"]
    it = spec.get("interior", {})
    base = hexrgb(it.get("base", "#f8f1e4"))
    im = Image.new("RGB", (W, H), base)
    panel = opened(src, "interior.png")
    tile = opened(src, "tile.png")
    walls = ("left", "right", "back", "front")
    if panel:
        for name in walls:
            x, y, w, h = regs[name]
            im.paste(cover(panel, w, h), (x, y))
    elif tile:
        a = float(it.get("strength", 0.3))
        sheet = Image.blend(Image.new("RGB", (W, H), base), tiled(tile, max(8, round(spec.get("tile_m", 0.6) * scale)), (W, H)), a)
        for name in walls:
            x, y, w, h = regs[name]
            top = y + (h // 2 if it.get("lower") else 0)
            im.paste(sheet.crop((x, top, x + w, y + h)), (x, top))
    band = opened(src, "band.png")
    if band and it.get("band_y"):
        y0, y1 = it["band_y"]
        hgt = round((y1 - y0) * scale)
        row = Image.blend(Image.new("RGB", (W, hgt), base), strip(band, hgt, W), float(it.get("band_strength", 0.6)))
        for name in walls:
            x, y, w, h = regs[name]
            im.paste(row.crop((x, 0, x + w, hgt)), (x, y + round((span["y"][1] - y1) * scale)))
    x, y, w, h = regs["white"]
    im.paste(Image.new("RGB", (w + 4, h + 4), (255, 255, 255)), (x - 2, y - 2))
    dilate(im, {k: v for k, v in regs.items() if k != "white"}, d["interior"]["free"])
    return im


def alts(slug: str, look: str) -> tuple[str, str]:
    p = ROOT / f"python/data/legends/{slug}/book.json"
    if not p.exists():
        return "", ""
    for l in json.loads(p.read_text(encoding="utf-8")).get("looks", []):
        if l.get("id") == look:
            return l.get("lead", ""), (l.get("interior") or {}).get("lead", "")
    return "", ""


def main(argv: list[str]) -> None:
    ap = argparse.ArgumentParser(description="柄を型へ貼り込んで、3D の外装・内装の絵を書く")
    ap.add_argument("look", help="組の id（英小文字とハイフン）")
    ap.add_argument("--src", required=True, help="柄を置いた所")
    ap.add_argument("--slug", default=DEFAULT_SLUG)
    ap.add_argument("--out", default="", help="書く所（既定 site/public/legends/<企画>）")
    ap.add_argument("--dry", action="store_true")
    a = ap.parse_args(argv)
    import re

    if not re.fullmatch(r"[a-z0-9]+(-[a-z0-9]+)*", a.look):
        raise SystemExit(f"組の id が形に合わない: {a.look}")
    src = Path(a.src)
    if not src.is_dir():
        raise SystemExit(f"柄の置き場が無い: {src}")
    d = load()
    spec_p = src / "spec.json"
    spec = json.loads(spec_p.read_text(encoding="utf-8")) if spec_p.exists() else {}
    seed = opened(src, "tile.png") or opened(src, "right.png") or opened(src, "left.png")
    colors = {**(pick_colors(seed) if seed else {"body": "#f3eee4", "accent": "#e0574a", "awning": ["#e0574a", "#ffffff"]}), **spec.get("colors", {})}
    ext = exterior(d, src, spec, colors)
    inn = interior(d, src, spec, colors)
    small = ext.resize((1024, round(1024 * ext.height / ext.width)), Image.LANCZOS)
    out = Path(a.out) if a.out else ROOT / f"site/public/legends/{a.slug}"
    files = {}
    over = []
    for key, im, rel in (
        ("exterior", ext, f"skins/{a.look}.webp"),
        ("exterior1024", small, f"skins/{a.look}-1024.webp"),
        ("interior", inn, f"interiors/{a.look}.webp"),
    ):
        b, q = webp(im, BUDGET[key])
        files[rel] = b
        print(f"{rel}: {im.width}×{im.height} {len(b):,}B（予算 {BUDGET[key]:,}B・質 {q if q > 0 else '入らない'}）")
        if q < 0:
            over.append(rel)
    print(f"色: {json.dumps(colors, ensure_ascii=False)}・垂れ: {spec.get('valance', 'stripes')}")
    if over:
        print("予算に入らない: " + "・".join(over) + "（柄の細かさを下げるか、色の数を減らす）。1枚も書かない")
        sys.exit(1)
    if a.dry:
        return
    ext_alt, int_alt = alts(a.slug, a.look)
    if not ext_alt:
        print(f"注意: 材料（book.json の looks）に {a.look} が無いので、alt は空にした")
    for rel, b in files.items():
        p = out / rel
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_bytes(b)
    sj = out / "skins.json"
    data = json.loads(sj.read_text(encoding="utf-8")) if sj.exists() else {}
    base = f"/legends/{a.slug}"
    data[a.look] = {
        "src": f"{base}/skins/{a.look}.webp",
        "src1024": f"{base}/skins/{a.look}-1024.webp",
        "w": ext.width,
        "h": ext.height,
        "alt": ext_alt,
        "interior": {"src": f"{base}/interiors/{a.look}.webp", "w": inn.width, "h": inn.height, "alt": int_alt},
        "colors": colors,
        "valance": spec.get("valance", "stripes"),
    }
    sj.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"書いた: {out.relative_to(ROOT) if out.is_relative_to(ROOT) else out}/skins.json の {a.look}")


if __name__ == "__main__":
    main(sys.argv[1:])
