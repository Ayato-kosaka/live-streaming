"""企画1案の仕様（JSON）から、絵コンテの表（Markdown）と、静止画を並べた1枚の絵を作る。

    python3 tools/shorts/plan/storyboard.py <spec.json> <復号した材料/videoId> <出力フォルダ>

spec の形（実物は shorts/videos/<videoId>/p2/spec.json）:

    {"id": "A", "title": "仮タイトル",
     "rows": [{"line": "ナレーション1文", "src": ["0:53:10–0:53:13"], "still": "0:53:10",
               "visual": "映像", "telop": "テロップ", "fx": "演出", "hold": 0.0,
               "crop": [x0, y0, x1, y1], "blur": [[x0, y0, x1, y1]]}]}

- **絵の各コマの下に、秒・元動画の時刻と、その行の原稿を入れる。** 原稿の無い絵コンテは、
  どのコマで何を言うのかが分からず、見てもらえない（あやと 2026-10-18、`docs/island-misses.md` #287）
- still は "H:MM:SS"（2つ目の引数の配信）か "videoId@H:MM:SS"（ほかの配信）。ほかの配信は、
  2つ目の引数と同じ置き場に並んだ `<videoId>/` から取る。前提を画で埋めるのに、ほかの回の画を混ぜるため
- 行の長さ ＝ 記号を除いた字数 ÷ 毎秒の字数 ＋ 0.25秒の間 ＋ hold。毎秒の字数は、声を様式の上限の倍率
  （`tools/shorts/render/style.json` の `narration.max_tempo`）で読んだ速さ。書き出しの尺と同じ物差しで割り付ける
- 1コマは zoom（刻みの細かいもの）を先に、無ければアーカイブのシートから切る。シートの並び（1x1・2x2・5x4、縦長・横長）は
  シートの寸法と配信の縦横から割り出す
- crop は 0〜1 の比で書く箱。字を読ませたい行は、元のコマのその部分を寄せて見せる
- blur は 0〜1 の比で書く箱（コマの上での位置）。**第三者の顔が映るコマには必ず付ける**（絵コンテは issue に貼るので）
"""
import csv
import json
import math
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

sys.path.insert(0, str(Path(__file__).parent))
import readtime  # noqa: E402

HERE = Path(__file__).parent
STYLE = HERE.parent / "render" / "style.json"
# 日本語の書体。apt の fonts-ipafont-gothic を先に、無ければ Noto の CJK
FONTS = ["/usr/share/fonts/opentype/ipafont-gothic/ipag.ttf",
         "/usr/share/fonts/truetype/fonts-japanese-gothic.ttf",
         "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc"]
W, H = 270, 480
PAD = 6
# Fish の声（Holiday Twist）を上限の 1.4倍で読んで毎秒6.8字（`references/script_writing.md` 6）。
# 上限の倍率が変わったら、同じ比で速さも変わる
CPS_PER_TEMPO = 6.8 / 1.4
GAP, HEAD = 4, 30            # シートの並び（tools/shorts/ingest/media.py の make_sheets と同じ）
NO_HEAD = "、。，．・：；！？!?）」』】〉》…ー〜～"   # 行の頭に来させない字


def font(size: int) -> ImageFont.FreeTypeFont:
    for f in FONTS:
        if Path(f).exists():
            return ImageFont.truetype(f, size)
    raise SystemExit("日本語の書体が無い: " + " / ".join(FONTS))


def max_tempo() -> float:
    try:
        return float(json.load(open(STYLE))["narration"]["max_tempo"])
    except (OSError, KeyError, TypeError, ValueError):
        return 1.4


def sec(s: str) -> float:
    p = [float(x) for x in s.strip().split(":")]
    while len(p) < 3:
        p.insert(0, 0)
    return p[0] * 3600 + p[1] * 60 + p[2]


def parse(still: str, default: str) -> tuple[str, float]:
    if "@" in still:
        v, t = still.split("@", 1)
        return v, sec(t)
    return default, sec(still)


def rows_with_time(spec: dict, cps: float) -> tuple[list, float]:
    t, out = 0.0, []
    for r in spec["rows"]:
        d = readtime.chars(r.get("line") or "") / cps + 0.25 + float(r.get("hold", 0))
        out.append((t, t + d, r))
        t += d
    return out, t


def table(rows: list, total: float, cps: float, tempo: float) -> str:
    md = ["| 動画内 | 元動画 | 映像 | ナレーション | 字 | テロップ | 演出 |",
          "| --- | --- | --- | --- | --- | --- | --- |"]
    for a, b, r in rows:
        md.append(f"| {a:.1f}–{b:.1f}秒 | {' / '.join(r['src'])} | {r['visual']} | "
                  f"{r.get('line') or '（無言）'} | {readtime.chars(r.get('line') or '')} | "
                  f"{r.get('telop', '')} | {r.get('fx', '')} |")
    n = sum(readtime.chars(r.get("line") or "") for _, _, r in rows)
    return "\n".join(md) + (f"\n\n合計 **{total:.1f}秒**・ナレーション **{n}字**（声を上限の {tempo:g}倍で読んだ"
                            f"毎秒{cps:.1f}字で割り付け、行のあいだの0.25秒と画だけの間を足した長さ）\n")


def grid_of(sheet: Image.Image, n: int, vw: int, vh: int) -> tuple[int, int, int, int]:
    """シートの寸法から、列の数・1コマの幅と高さ・帯の高さを割り出す。

    zoom は 1x1・2x2、アーカイブは 5x4（横長は入れ替え）と、依頼ごとに並びが違う。決め打ちすると
    1x1 のシートで隣のコマにずれる（frame_at.py の 2x2 決め打ちがそれだった）。"""
    best = None
    for cols in range(1, 9):
        tw = (sheet.width - (cols + 1) * GAP) // cols
        if tw <= 0 or cols * tw + (cols + 1) * GAP != sheet.width:
            continue
        rows = math.ceil(n / cols)
        est = tw * vh / vw
        for th in range(int(est) - 6, int(est) + 7):
            lab = max(20, int(round(th * 0.07)))
            err = abs(HEAD + rows * (th + lab) + (rows + 1) * GAP - sheet.height)
            if best is None or err < best[0]:
                best = (err, cols, tw, th, lab)
    if best is None:
        raise SystemExit(f"シートの並びが割り出せない: {sheet.size}")
    return best[1:]


def frame(root: Path, vid: str, t: float) -> Image.Image:
    """その配信の t 秒の1コマ。zoom（刻みの細かいもの）を先に、無ければアーカイブ（±5秒）。"""
    base = root / vid
    if not base.is_dir():
        raise SystemExit(f"置き場に {vid} が無い: {base}（復号してから回す）")
    cands = []
    for d in sorted(base.glob("zoom-*")) + [base / "archive"]:
        if not (d / "sheets.csv").exists():
            continue
        zoom = d.name != "archive"
        for row in csv.DictReader(open(d / "sheets.csv")):
            a, b, n = float(row["from"]), float(row["to"]), int(row["frames"])
            slack = 0.5 if zoom else 5.0
            if a - slack <= t <= b + slack:
                step = (b - a) / (n - 1) if n > 1 else (1.0 if zoom else 10.0)
                k = max(0, min(n - 1, int(round((t - a) / step))))
                cands.append((step, d, d / row["file"], k, n))
    if not cands:
        raise SystemExit(f"見つからない: {vid} {t:.0f}秒（zoom にもアーカイブにも無い）")
    step, d, f, k, n = min(cands, key=lambda c: c[0])
    meta = d / "meta.json" if (d / "meta.json").exists() else base / "archive" / "meta.json"
    m = json.load(open(meta))
    im = Image.open(f).convert("RGB")
    cols, tw, th, lab = grid_of(im, n, int(m["width"]), int(m["height"]))
    r, c = divmod(k, cols)
    x, y = GAP + c * (tw + GAP), HEAD + GAP + r * (th + lab + GAP)
    return im.crop((x, y, x + tw, y + th))


def fit(im: Image.Image, under: Image.Image | None = None) -> Image.Image:
    """9:16 の枠に収める。横長（寄せた箱も）は幅に合わせてまん中に置き、上下は元のコマをぼかして埋める。"""
    if im.height / im.width >= H / W * 0.9:
        return im.resize((W, H))
    bg = (under or im).resize((W, H)).filter(ImageFilter.GaussianBlur(14))
    fg = im.resize((W, max(1, int(round(W * im.height / im.width)))))
    bg.paste(fg, (0, (H - fg.height) // 2))
    return bg


def wrap(text: str, f: ImageFont.FreeTypeFont, width: int) -> list[str]:
    """日本語を画素の幅で折り返す。句読点・閉じ括弧・長音は行の頭に送らず、前の行に付ける。"""
    out, cur = [], ""
    for ch in text:
        if cur and f.getlength(cur + ch) > width and ch not in NO_HEAD:
            out.append(cur)
            cur = ch
        else:
            cur += ch
    if cur:
        out.append(cur)
    return out


def tag(still: str, default: str) -> str:
    vid, _ = parse(still, default)
    hms = still.split("@", 1)[1] if "@" in still else still
    return f"元 {hms}" if vid == default else f"元 {vid} {hms}"


def main() -> int:
    if len(sys.argv) != 4:
        print(__doc__)
        return 2
    spec = json.load(open(sys.argv[1]))
    base, out = Path(sys.argv[2]), Path(sys.argv[3])
    root, default = base.parent, base.name
    out.mkdir(parents=True, exist_ok=True)
    tempo = max_tempo()
    cps = CPS_PER_TEMPO * tempo
    rows, total = rows_with_time(spec, cps)
    (out / f"table_{spec['id']}.md").write_text(table(rows, total, cps, tempo))

    f_time, f_src, f_line = font(20), font(15), font(19)
    lh = 25
    texts = [wrap(r.get("line") or "（無言）", f_line, W - 2 * PAD) for _, _, r in rows]
    lab_h = PAD + 24 + 20 + max(len(x) for x in texts) * lh + PAD
    tiles = []
    for (a, b, r), lines in zip(rows, texts):
        still = r.get("still") or r["src"][0].split("–")[0]
        vid, t = parse(still, default)
        src = frame(root, vid, t)
        if r.get("crop"):
            x0, y0, x1, y1 = r["crop"]
            box = (int(x0 * src.width), int(y0 * src.height), int(x1 * src.width), int(y1 * src.height))
            im = fit(src.crop(box), under=src)
        else:
            im = fit(src)
        for bx in r.get("blur", []):
            x0, y0, x1, y1 = [int(v * s) for v, s in zip(bx, (W, H, W, H))]
            im.paste(im.crop((x0, y0, x1, y1)).filter(ImageFilter.GaussianBlur(12)), (x0, y0))
        tl = Image.new("RGB", (W, H + lab_h), (0, 0, 0))
        tl.paste(im, (0, 0))
        d = ImageDraw.Draw(tl)
        y = H + PAD
        d.text((PAD, y), f"{a:.1f}–{b:.1f}秒", fill=(255, 230, 80), font=f_time)
        d.text((PAD, y + 24), tag(still, default), fill=(190, 190, 190), font=f_src)
        y += 24 + 20
        for ln in lines:
            d.text((PAD, y), ln, fill=(255, 255, 255), font=f_line)
            y += lh
        tiles.append(tl)

    cols = 6
    nrow = (len(tiles) + cols - 1) // cols
    th = H + lab_h
    n = sum(readtime.chars(r.get("line") or "") for _, _, r in rows)
    sheet = Image.new("RGB", (cols * (W + 4) + 4, nrow * (th + 4) + 44), (24, 24, 24))
    ImageDraw.Draw(sheet).text((8, 8), f"{spec['id']}「{spec['title']}」 絵コンテ（約{total:.0f}秒・{n}字・{len(rows)}行）",
                               fill=(255, 255, 255), font=font(24))
    for k, tl in enumerate(tiles):
        sheet.paste(tl, (4 + (k % cols) * (W + 4), 44 + (k // cols) * (th + 4)))
    sheet.save(out / f"storyboard_{spec['id']}.jpg", quality=82)
    print(f"{spec['id']}: {total:.1f}秒, {n}字, {len(rows)}行（毎秒{cps:.1f}字）")
    return 0


if __name__ == "__main__":
    sys.exit(main())
