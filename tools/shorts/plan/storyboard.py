"""企画1案の仕様（JSON）から、絵コンテの表（Markdown）と、静止画を並べた1枚の絵を作る。

    python3 tools/shorts/plan/storyboard.py <spec.json> <復号した材料/videoId> <出力フォルダ>

spec の形（実物は shorts/videos/<videoId>/p1/spec_A.json）:

    {"id": "A", "title": "仮タイトル",
     "rows": [{"line": "ナレーション1文", "src": ["0:53:10–0:53:13"], "still": "0:53:10",
               "visual": "映像", "telop": "テロップ", "fx": "演出", "hold": 0.0,
               "blur": [[x0, y0, x1, y1]]}]}

- 行の長さ ＝ その行のナレーションを想定の速さ（readtime.EXPECTED）で読ませた秒 ＋ 0.25秒の間 ＋ hold
- still の1コマは frame_at.py が zoom（1秒刻み）かアーカイブのシート（10秒刻み）から切り出す
- blur は 0〜1 の比で書く箱。**第三者の顔が映るコマには必ず付ける**（絵コンテは issue に貼るので）
"""
import json
import subprocess
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

sys.path.insert(0, str(Path(__file__).parent))
import readtime  # noqa: E402

HERE = Path(__file__).parent
FONT = "/usr/share/fonts/opentype/ipafont-gothic/ipag.ttf"   # apt の fonts-ipafont-gothic
W, H = 270, 480


def rows_with_time(spec: dict) -> tuple[list, float]:
    t, out = 0.0, []
    for r in spec["rows"]:
        d = (readtime.jtalk(r["line"], readtime.EXPECTED) if r.get("line") else 0.0) + 0.25 + float(r.get("hold", 0))
        out.append((t, t + d, r))
        t += d
    return out, t


def table(rows: list, total: float) -> str:
    md = ["| 動画内 | 元動画 | 映像 | ナレーション | テロップ | 演出 |", "| --- | --- | --- | --- | --- | --- |"]
    for a, b, r in rows:
        md.append(f"| {a:.1f}–{b:.1f}秒 | {' / '.join(r['src'])} | {r['visual']} | "
                  f"{r.get('line') or '（無言）'} | {r.get('telop', '')} | {r.get('fx', '')} |")
    return "\n".join(md) + (f"\n\n合計 **{total:.1f}秒**（ナレーションは Open JTalk を{readtime.EXPECTED}倍速で"
                            "読ませた長さ。1.0倍なら約15%長い）\n")


def tile(base: Path, a: float, b: float, r: dict, tmp: Path) -> Image.Image:
    still = r.get("still", r["src"][0])
    subprocess.run([sys.executable, str(HERE / "frame_at.py"), str(base), still, str(tmp)],
                   check=True, capture_output=True)
    im = Image.open(tmp).convert("RGB").resize((W, H))
    for box in r.get("blur", []):
        x0, y0, x1, y1 = [int(v * s) for v, s in zip(box, (W, H, W, H))]
        im.paste(im.crop((x0, y0, x1, y1)).filter(ImageFilter.GaussianBlur(12)), (x0, y0))
    lab = Image.new("RGB", (W, 64), (0, 0, 0))
    d = ImageDraw.Draw(lab)
    d.text((6, 4), f"{a:.1f}–{b:.1f}秒", fill=(255, 230, 80), font=ImageFont.truetype(FONT, 22))
    d.text((6, 34), f"元 {still}", fill=(220, 220, 220), font=ImageFont.truetype(FONT, 18))
    t = Image.new("RGB", (W, H + 64))
    t.paste(im, (0, 0))
    t.paste(lab, (0, H))
    return t


def main() -> int:
    spec = json.load(open(sys.argv[1]))
    base, out = Path(sys.argv[2]), Path(sys.argv[3])
    out.mkdir(parents=True, exist_ok=True)
    rows, total = rows_with_time(spec)
    (out / f"table_{spec['id']}.md").write_text(table(rows, total))
    tmp = out / f"_tile_{spec['id']}.jpg"
    tiles = [tile(base, a, b, r, tmp) for a, b, r in rows]
    tmp.unlink(missing_ok=True)
    cols = 6
    nrow = (len(tiles) + cols - 1) // cols
    sheet = Image.new("RGB", (cols * (W + 4) + 4, nrow * (H + 68) + 44), (24, 24, 24))
    ImageDraw.Draw(sheet).text((8, 8), f"{spec['id']}案「{spec['title']}」 絵コンテ（約{total:.0f}秒）",
                               fill=(255, 255, 255), font=ImageFont.truetype(FONT, 24))
    for k, t in enumerate(tiles):
        sheet.paste(t, (4 + (k % cols) * (W + 4), 44 + (k // cols) * (H + 68)))
    sheet.save(out / f"storyboard_{spec['id']}.jpg", quality=82)
    print(f"{spec['id']}: {total:.1f}秒, {len(rows)}行")
    return 0


if __name__ == "__main__":
    sys.exit(main())
