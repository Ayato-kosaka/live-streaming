"""企画1案の仕様（JSON）から、絵コンテの表（Markdown）と、静止画を並べた1枚の絵を作る。

    python3 tools/shorts/plan/storyboard.py <spec.json> <復号した材料/videoId> <出力フォルダ> [--name A]

出来るもの: `<出力フォルダ>/table_<名前>.md` と `storyboard_<名前>.jpg`。名前は `--name`、無ければ spec のファイル名
`spec_<名前>.json` の <名前>、それも無ければ spec の `id`（2案の回で A と B が同じ id でも上書きしない）。

spec の形（実物は shorts/videos/<videoId>/p2/spec.json）:

    {"id": "A", "title_card": "🇫🇷 題の札",
     "rows": [{"line": "ナレーション1文", "src": ["0:53:10–0:53:13"], "still": "0:53:10",
               "visual": "映像", "telop": "テロップ", "fx": "演出", "hold": 0.0,
               "crop": [x0, y0, x1, y1], "blur": [[x0, y0, x1, y1]]}]}

- **絵の各コマの下に、秒・元動画の時刻と、その行の原稿を入れる。** 原稿の無い絵コンテは、
  どのコマで何を言うのかが分からず、見てもらえない（あやと 2026-10-18、`docs/island-misses.md` #287）
- 見出しの題は `title`、無ければ `title_card`（1次の spec は題の札だけのことが多い。国旗の絵文字と改行は外す）、どちらも無ければ空
- still は "H:MM:SS"（2つ目の引数の配信）か "videoId@H:MM:SS"・"videoId H:MM:SS"（ほかの配信）。無ければ src の1つ目の頭
  （書きかたは `material.py`）。ほかの配信は、2つ目の引数と同じ置き場に並んだ `<videoId>/` から取る。前提を画で埋めるのに、
  ほかの回の画を混ぜるため。**地図の行**（`27:46:40.0` から。`tools/shorts/hookmap` の刺し素材）は配信の画が無いので、
  灰色の札「地図（刺し素材）」を置く
- 行の長さ ＝ 記号を除いた字数 ÷ 毎秒の字数 ＋ 0.25秒の間 ＋ hold。毎秒の字数は、声を様式の上限の倍率
  （`tools/shorts/render/style.json` の `narration.max_tempo`）で読んだ速さ。書き出しの尺と同じ物差しで割り付ける
- 1コマは刻みのいちばん細かいシート（zoom・窓の見る用のシート `clips/`・アーカイブ）から切る。シートの並び
  （1x1・2x2・5x4・6x5、縦長・横長）はシートの寸法と配信の縦横から割り出す
- crop は 0〜1 の比で書く箱。字を読ませたい行は、元のコマのその部分を寄せて見せる
- blur は 0〜1 の比で書く箱（コマの上での位置）。**第三者の顔が映るコマには必ず付ける**（絵コンテは issue に貼るので）
"""
import argparse
import json
import re
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

sys.path.insert(0, str(Path(__file__).parent))
import material as M  # noqa: E402
import readtime  # noqa: E402
from material import sec  # noqa: E402  frame_at.py も sec をここから読む

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
NO_HEAD = "、。，．・：；！？!?）」』】〉》…ー〜～"   # 行の頭に来させない字
MAP = "map"                  # 地図の行の印（配信の画が無い）


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


def parse(still: str, default: str) -> tuple[str, float]:
    """'0:53:10' / 'kunXt2sXnFQ@0:17:24.5' / 'kunXt2sXnFQ 0:17:24.5' →（回, 秒）"""
    v, _ = M.split_ref(still)
    return v or default, sec(still)


def still_of(r: dict) -> str:
    """その行の絵にする秒。still、無ければ src の1つ目の頭（回の名前つきなら、それも付けて）"""
    if r.get("still"):
        return str(r["still"])
    v, a, _ = M.span((r.get("src") or [""])[0])
    h, rem = divmod(a, 3600)
    return M.ref(v, f"{int(h)}:{int(rem // 60):02d}:{rem % 60:04.1f}")


def title_of(spec: dict) -> str:
    """見出しの題。title、無ければ title_card（国旗の絵文字・字の形の選びの印・改行は外す。和文の書体に字形が無く豆腐になる）"""
    t = spec.get("title") or spec.get("title_card") or ""
    t = re.sub(r"[\U0001F1E6-\U0001F1FF\uFE0F]", "", str(t))
    return re.sub(r"\s*\n\s*", "", t).strip()


def out_name(spec_path: Path, spec: dict, name: str | None) -> str:
    """出力の名前: --name → spec_<名前>.json の <名前> → spec の id"""
    if name:
        return name
    m = re.fullmatch(r"spec_(.+)\.json", spec_path.name)
    return m.group(1) if m else str(spec.get("id") or "x")


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
        md.append(f"| {a:.1f}–{b:.1f}秒 | {' / '.join(r.get('src') or [])} | {r.get('visual', '')} | "
                  f"{r.get('line') or '（無言）'} | {readtime.chars(r.get('line') or '')} | "
                  f"{r.get('telop', '')} | {r.get('fx', '')} |")
    n = sum(readtime.chars(r.get("line") or "") for _, _, r in rows)
    return "\n".join(md) + (f"\n\n合計 **{total:.1f}秒**・ナレーション **{n}字**（声を上限の {tempo:g}倍で読んだ"
                            f"毎秒{cps:.1f}字で割り付け、行のあいだの0.25秒と画だけの間を足した長さ）\n")


def frame(root: Path, vid: str, t: float) -> Image.Image:
    """その配信の t 秒の1コマ。刻みのいちばん細かいシート（zoom・窓の見る用のシート・アーカイブ）から。
    シートの端から刻みの半分（アーカイブなら ±5秒）までは、いちばん近いコマを使う。"""
    if M.is_map(t):
        return map_tile()
    base = root / vid
    if not base.is_dir():
        raise SystemExit(f"置き場に {vid} が無い: {base}（復号してから回す）")
    cands = []
    for d in sorted(base.glob("zoom-*")) + [base / "clips", base / "archive"]:
        for row in M.sheet_rows(d):
            ts = M.row_times(row)
            step = (ts[-1] - ts[0]) / (len(ts) - 1) if len(ts) > 1 else (10.0 if d.name == "archive" else 1.0)
            slack = max(0.5, step / 2)
            if ts[0] - slack <= t <= ts[-1] + slack:
                k = min(range(len(ts)), key=lambda j: abs(ts[j] - t))
                cands.append((step, d, d / row["file"], k, len(ts)))
    if not cands:
        raise SystemExit(f"見つからない: {vid} {t:.0f}秒（zoom にも窓のシートにもアーカイブにも無い）")
    step, d, f, k, n = min(cands, key=lambda c: c[0])
    wh = M.dims(d, base)
    if wh is None:
        raise SystemExit(f"{d} の縦横が分からない（meta.json が無い）")
    try:
        return M.cell(Image.open(f).convert("RGB"), k, n, *wh)
    except ValueError as e:
        raise SystemExit(str(e))


def map_tile() -> Image.Image:
    """地図の行の札（配信の画が無い。書き出しでは hookmap.py の mp4 が入る）"""
    im = Image.new("RGB", (W, H), (70, 78, 92))
    d = ImageDraw.Draw(im)
    d.text((W // 2, H // 2), "地図（刺し素材）", fill=(235, 235, 235), font=font(22), anchor="mm")
    return im


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
    hms = M.split_ref(still)[1]
    if M.is_map(sec(still)):
        return f"元 地図（{hms}）"
    return f"元 {hms}" if vid == default else f"元 {vid} {hms}"


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("spec", type=Path)
    ap.add_argument("material", type=Path, help="復号した材料の videoId の置き場。ほかの回は隣の置き場から読む")
    ap.add_argument("out", type=Path)
    ap.add_argument("--name", help="出力の名前（storyboard_<名前>.jpg）。既定は spec_<名前>.json の <名前>、無ければ spec の id")
    args = ap.parse_args(argv)
    spec = json.loads(args.spec.read_text())
    base, out = args.material, args.out
    root, default = base.parent, base.name
    name = out_name(args.spec, spec, args.name)
    out.mkdir(parents=True, exist_ok=True)
    tempo = max_tempo()
    cps = CPS_PER_TEMPO * tempo
    rows, total = rows_with_time(spec, cps)
    (out / f"table_{name}.md").write_text(table(rows, total, cps, tempo))

    f_time, f_src, f_line = font(20), font(15), font(19)
    lh = 25
    texts = [wrap(r.get("line") or "（無言）", f_line, W - 2 * PAD) for _, _, r in rows]
    lab_h = PAD + 24 + 20 + max(len(x) for x in texts) * lh + PAD
    tiles = []
    for (a, b, r), lines in zip(rows, texts):
        still = still_of(r)
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
    ImageDraw.Draw(sheet).text((8, 8), f"{name}「{title_of(spec)}」 絵コンテ（約{total:.0f}秒・{n}字・{len(rows)}行）",
                               fill=(255, 255, 255), font=font(24))
    for k, tl in enumerate(tiles):
        sheet.paste(tl, (4 + (k % cols) * (W + 4), 44 + (k // cols) * (th + 4)))
    sheet.save(out / f"storyboard_{name}.jpg", quality=82)
    print(f"{name}: {total:.1f}秒, {n}字, {len(rows)}行（毎秒{cps:.1f}字）")
    return 0


if __name__ == "__main__":
    sys.exit(main())
