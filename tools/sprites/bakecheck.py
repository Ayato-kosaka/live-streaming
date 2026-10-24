"""Actions で焼いた絵を、焼く前の絵と並べて確かめる。

    python3 tools/sprites/bakecheck.py --before <焼く前の sprites> --after <焼いた先> \\
        --check-dir <見比べ用に焼いた先> --names food-cheese-cut --check food-pepper \\
        --sheet /tmp/sheet.png [--b64]
    python3 tools/sprites/bakecheck.py unsheet <落としたログ> <書き出す .png>

終了コード 0=通った / 1=色が抜けている・焼けていない / 2=見るものが無い。

## なぜ要るか

焼くほうは、素材が欠けていても**何も言わずに通る。**
`Textures/colormap.png` が無いとまっ白な料理が焼ける（2026-10-17 の人参。README）。
キットの版が違うと、同じ名前でも形や色の違う絵が焼ける（README「いま配られているキットは新しい」）。
どちらも焼いた人が絵を開かないと分からないので、**色の付いているはずの絵を1枚
（`food-pepper`、オレンジ）別の置き場に焼いて、いまの絵と画素で比べる。**

- 見比べの絵（`--check`）は**コミットしない。** 別の置き場に焼くので、いまの絵は書き換わらない
- 色が抜けていたら 1 で止める。ワークフローはそこでコミットに進まない
- 形や色が違っていても止めない（新しい絵は焼けている）。違うと**大きく出す**ので、出した人が見る

## 絵を持ち帰る

この作業箱からは Actions の artifact もログの zip も落とせない（blob の宛先で 403）。
`mcp__github__get_job_logs` でログの字は読めるので、並べた絵を **base64 でログに出し**
（`--b64`）、`unsheet` で絵に戻す。絵は CC0 の素材を焼いたもので、公開のログに出してよい。
"""
import argparse
import base64
import colorsys
import io
import os
import re
import sys

from PIL import Image, ImageDraw

# 縮めて比べる大きさ。比べるのは形と色なので、細部の網目は要らない
CMP = 160
# 並べる1マスの大きさ
CELL = 220
# 「同じ絵」とみなす差（不透明度を掛けた RGB の平均の差、0〜255）
# 同じキットで同じ絵を焼き直すと、webp の揺れで 1 前後になる
SAME = 4.0
# 色が抜けたとみなす境目。いまの絵の彩度の半分を割ったら抜けている
FADE = 0.5
B64_BEGIN = "BAKE-SHEET-BEGIN"
B64_END = "BAKE-SHEET-END"
B64_WIDTH = 2000


def pixels(im):
    """画素の並び。Pillow 12 から getdata が古い名前になった（14 で消える）。"""
    get = getattr(im, "get_flattened_data", None)
    return get() if get else im.getdata()


def load(path):
    return Image.open(path).convert("RGBA") if path and os.path.exists(path) else None


def saturation(im):
    """不透明な画素の、彩度の平均（0〜1）。まっ白・灰色に焼けると 0 に寄る。"""
    small = im.copy()
    small.thumbnail((CMP, CMP))
    tot = w = 0.0
    for r, g, b, a in pixels(small):
        if a < 128:
            continue
        _, _, s = colorsys.rgb_to_hls(r / 255, g / 255, b / 255)
        tot += s
        w += 1
    return tot / w if w else 0.0


def mean_rgb(im):
    small = im.copy()
    small.thumbnail((CMP, CMP))
    px = [(r, g, b) for r, g, b, a in pixels(small) if a >= 128]
    if not px:
        return (0, 0, 0)
    return tuple(round(sum(c[i] for c in px) / len(px)) for i in range(3))


def diff(a, b):
    """2枚を同じ大きさに縮めて、不透明度を掛けた RGB の差の平均（0〜255）。"""
    size = (CMP, max(1, round(CMP * a.height / a.width)))
    xa = a.resize(size, Image.LANCZOS)
    xb = b.resize(size, Image.LANCZOS)
    tot = 0.0
    n = 0
    for pa, pb in zip(pixels(xa), pixels(xb)):
        for i in range(3):
            tot += abs(pa[i] * pa[3] - pb[i] * pb[3]) / 255
        tot += abs(pa[3] - pb[3])
        n += 4
    return tot / n if n else 0.0


def solid(im):
    """物そのもの（接地影を除いた濃い画素）だけを切り出す。meta.py の SOLID と同じ境目。"""
    box = im.getchannel("A").point(lambda v: 255 if v > 140 else 0).getbbox()
    return im.crop(box) if box else im


def same_thing(old, new):
    """物そのものを重ねて比べる。(差, 縦横比の違い)。

    絵の外枠は接地影の薄い裾で決まるので、焼く箱が違うだけで数px動く
    （作業箱で焼いた food-pepper と、ランナーで焼いたものが 320x173 と 320x177）。
    外枠のまま縮めて比べると、形も色も同じなのに輪郭が1〜2pxずれて「違う」と出る。
    キットの版が違うかを知りたいので、物そのものを切り出してから比べる。
    """
    a, b = solid(old), solid(new)
    ra, rb = a.width / a.height, b.width / b.height
    return diff(a, b), abs(ra - rb) / ra


def cell(im, label):
    """市松の地に絵を置いて、下に名前を書いた1マス。"""
    out = Image.new("RGBA", (CELL, CELL + 18), (255, 255, 255, 255))
    d = ImageDraw.Draw(out)
    for y in range(0, CELL, 16):
        for x in range(0, CELL, 16):
            if (x // 16 + y // 16) % 2:
                d.rectangle([x, y, x + 15, y + 15], fill=(226, 226, 226, 255))
    if im is None:
        d.text((8, CELL // 2), "(none)", fill=(160, 0, 0, 255))
    else:
        th = im.copy()
        th.thumbnail((CELL - 12, CELL - 12), Image.LANCZOS)
        out.alpha_composite(th, ((CELL - th.width) // 2, (CELL - th.height) // 2))
    # 字は ASCII だけ（PIL の既定の字は日本語を持っていない）
    d.text((4, CELL + 3), label[:34], fill=(0, 0, 0, 255))
    return out


def main(argv):
    ap = argparse.ArgumentParser()
    ap.add_argument("--before", required=True)
    ap.add_argument("--after", required=True)
    ap.add_argument("--check-dir", default="")
    ap.add_argument("--names", default="")
    ap.add_argument("--check", default="")
    ap.add_argument("--sheet", default="")
    ap.add_argument("--b64", action="store_true")
    a = ap.parse_args(argv)

    names = [n for n in a.names.split(",") if n]
    check = [n for n in a.check.split(",") if n]
    if not names and not check:
        print("見るものが無い")
        return 2

    rows = []  # 並べる行: [(絵, 名札), ...]
    lines = ["| 絵 | 前 | 後 | 彩度 前→後 | 平均色 後 | 差 | 判定 |", "| --- | --- | --- | --- | --- | --- | --- |"]
    bad = 0

    def compare(label, old, new, kind):
        nonlocal bad
        if new is None:
            lines.append(f"| `{label}` | | **無い** | | | | 焼けていない |")
            print(f"✕ {label}: 焼けた絵が無い")
            bad += 1
            return
        s_new = saturation(new)
        size_new = f"{new.width}x{new.height}"
        if old is None:
            lines.append(f"| `{label}` | — | {size_new} | — → {s_new:.2f} | {mean_rgb(new)} | — | 新しい絵 |")
            print(f"  {label}: 新しい絵 {size_new} 彩度 {s_new:.2f} 平均色 {mean_rgb(new)}")
            return
        s_old = saturation(old)
        d, skew = same_thing(old, new)
        faded = s_old > 0.08 and s_new < s_old * FADE
        same = d <= SAME and skew <= 0.02
        verdict = "**色が抜けた**" if faded else ("同じ" if same else "**違う**")
        lines.append(
            f"| `{label}` | {old.width}x{old.height} | {size_new} | {s_old:.2f} → {s_new:.2f} "
            f"| {mean_rgb(new)} | {d:.1f}（縦横比 {skew:.1%}） | {verdict} |"
        )
        print(
            f"  {label}: {old.width}x{old.height} → {size_new}  彩度 {s_old:.2f} → {s_new:.2f}"
            f"  物の差 {d:.1f}（縦横比 {skew:.1%}）  {verdict}"
        )
        if faded:
            bad += 1
            print(f"::error::{label} の色が抜けている（Textures/colormap.png が置けていない？）")
        elif not same and kind == "check":
            print(f"::warning::{label} が今の絵と違う。キットの版が違う（README「いま配られているキットは新しい」）")

    for n in check:
        row = []
        for sub in ("", "hero/"):
            old = load(os.path.join(a.before, f"{sub}{n}.webp"))
            new = load(os.path.join(a.check_dir, f"{sub}{n}.webp"))
            if old is None and new is None:
                continue
            compare(f"{sub}{n}", old, new, "check")
            row += [(old, f"now {sub}{n}"), (new, f"rebaked {sub}{n}")]
        rows.append(row)

    for n in names:
        old = load(os.path.join(a.before, f"{n}.webp"))
        new = load(os.path.join(a.after, f"{n}.webp"))
        compare(n, old, new, "name")
        row = [(old, f"before {n}"), (new, f"after {n}")]
        hero_old = load(os.path.join(a.before, f"hero/{n}.webp"))
        hero_new = load(os.path.join(a.after, f"hero/{n}.webp"))
        if hero_old is not None or hero_new is not None:
            compare(f"hero/{n}", hero_old, hero_new, "name")
            row.append((hero_new, f"after hero/{n}"))
            # 主役と一覧の絵は同じものか（同じ回に同じ部品で焼いたなら、縮めればほぼ重なる）
            if hero_new is not None and new is not None:
                d = diff(new, hero_new)
                lines.append(f"| `{n}` と `hero/{n}` | | | | | {d:.1f} | {'同じもの' if d <= SAME * 2 else '**別の絵**'} |")
                print(f"  {n} と hero/{n}: 差 {d:.1f}")
        wide_new = load(os.path.join(a.after, f"hero/{n}@2x.webp"))
        if wide_new is not None:
            print(f"  hero/{n}@2x: {wide_new.width}x{wide_new.height}")
            lines.append(f"| `hero/{n}@2x` | | {wide_new.width}x{wide_new.height} | | | | |")
        rows.append(row)

    table = "\n".join(lines)
    summary = os.environ.get("GITHUB_STEP_SUMMARY")
    if summary:
        with open(summary, "a") as fp:
            fp.write("### 焼いた絵と、焼く前の絵\n\n" + table + "\n\n")

    if a.sheet:
        cols = max(len(r) for r in rows) if rows else 1
        sheet = Image.new("RGBA", (cols * CELL, len(rows) * (CELL + 18)), (255, 255, 255, 255))
        for y, row in enumerate(rows):
            for x, (im, label) in enumerate(row):
                sheet.alpha_composite(cell(im, label), (x * CELL, y * (CELL + 18)))
        sheet.convert("RGB").save(a.sheet, optimize=True)
        print(f"並べた絵 → {a.sheet}")
        if a.b64:
            buf = io.BytesIO()
            sheet.convert("RGB").save(buf, "WEBP", quality=80)
            s = base64.b64encode(buf.getvalue()).decode()
            print(B64_BEGIN)
            for i in range(0, len(s), B64_WIDTH):
                print(s[i:i + B64_WIDTH])
            print(B64_END)

    print(f"{'NG' if bad else 'OK'}: 色が抜けた・焼けていない {bad} 件")
    return 1 if bad else 0


def unsheet(log, out):
    """ログの BAKE-SHEET-BEGIN〜END を絵に戻す。行頭の時刻（Actions が付ける）は落とす。"""
    text = open(log, encoding="utf-8", errors="replace").read().splitlines()
    take = False
    parts = []
    for line in text:
        body = re.sub(r"^\S*\d{4}-\d\d-\d\dT[\d:.]+Z\s?", "", line).strip()
        if body == B64_BEGIN:
            take, parts = True, []
            continue
        if body == B64_END:
            take = False
            continue
        if take:
            parts.append(body)
    if not parts:
        print(f"{log} に {B64_BEGIN} が無い")
        return 2
    im = Image.open(io.BytesIO(base64.b64decode("".join(parts))))
    im.save(out)
    print(f"{out}: {im.width}x{im.height}")
    return 0


if __name__ == "__main__":
    if len(sys.argv) == 4 and sys.argv[1] == "unsheet":
        sys.exit(unsheet(sys.argv[2], sys.argv[3]))
    sys.exit(main(sys.argv[1:]))
