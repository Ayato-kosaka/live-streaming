"""SUZURI の「住人でもステッカーでもないグッズ」の札に出す1枚を焼く。

    python3 tools/goods/shopgoods.py            # ぜんぶ焼いて site/public/goods/ に置く
    python3 tools/goods/shopgoods.py --only towel --out /tmp       # 1枚だけ試す

## なぜ要るのか

`/goods` の SUZURI の欄は、長いあいだ**店への外部リンク1本**だった。
店の一覧は JS で描かれるので、押した先で探さないと何が在るのか分からない。
住人グッズ（100）とあやとステッカー（5）は、それぞれの面から行けるように
なったが、**どちらからも行けないものが6つ残った**（あやと 2026-10-13）。

ここで焼くのは、そのうちの5つと、あとから出たカレンダー（2026-10-15）。
残る1つ（イギリスのトート）は
`suzuri-tote.webp` としてもう置いてある（`shopshot.py` が置いた1枚）ので
焼き直さない。**同じ絵を2つ持たない。**

## 元絵のありか

`shopshot.py` と同じで、商品の**見本の絵**（`lens.suzuri.jp`）。
**店の OG 画像（`og.suzuri.jp/materials/<id>.webp`）は使わない**——
あちらには SUZURI 自身の透かしとロゴが焼き込まれていて、
**よその会社のマークは焼かない**という決め（`shopshot.py` の頭）に反する。

見本の URL は `SUZURI API` ワークフローの `sample` が出す:

    workflow_id: suzuri_api.yml / command: sample / args: 21142564 21142563 …

`h=` は向こうが付けた署名で、こちらでは作れない。絵を差し替えたら取り直す。

## Tシャツだけ「背中」を焼く

2枚とも、**前は胸に小さな印が1つあるだけの白いTシャツ**で、
札の大きさ（スマホで 165px 角）に縮めると**2枚が見分けられない。**
絵として立っているのは背中のほう（やりとりの画面／地球）なので、そちらを焼く。

背中は SUZURI では**別のデザイン**として登録されている（`sub_materials`。
題なし・非公開の 21142557 と 21142560 がそれ）。見本の URL もそちら側の id で引く。

## 大きさ

560x560 webp q78。札に出るのは 165 CSS px（390px のスマホで2列）なので
dpr3 でちょうど足りる。**中身は長い辺 490px に収める**——
`suzuri-tote.webp` の中身がその大きさで、並べたときに重さを揃えるため
（揃えないと、横長のタオルだけが遠くに置いてあるように見える）。
"""

import argparse
import pathlib
import subprocess
import sys

from PIL import Image, ImageChops

ROOT = pathlib.Path(__file__).resolve().parents[2]
DEST_DIR = ROOT / "site/public/goods"

SIDE = 560
# 中身の長い辺。`suzuri-tote.webp` の実測（489px）に合わせてある
BOX = 490

# 焼くもの。`name` が置き先のファイル名、`url` が見本の絵。
#
# **`id` は札のリンク先のデザイン id ではない。** Tシャツの2枚は背中を焼くので、
# 見本を引く id が裏（`sub_materials`）のほうになる。リンク先の id は
# `site/content/goods.ts` の `SHOP_GOODS` が持っている。
LENS = "https://lens.suzuri.jp/v3/1024x1024"
SHOTS = [
    (
        "suzuri-towel",
        f"{LENS}/face-towel/free/white/21142564/1791850979-6929x2992.png.contain.webp"
        "?h=df35cbbde94ac8fc181cddd18228365104a023ce&printed=true",
    ),
    (
        "suzuri-pouch-numbers",
        f"{LENS}/fairtrade-cotton-canvas-zip-pouch-m-for-shop/m/natural/21142563/"
        "1791850976-1062x826.png.contain.webp"
        "?h=fe8e4727c1a3d2fa2e592a5a8a1e37b22ab5e29a&printed=true",
    ),
    (
        "suzuri-pouch-bus",
        f"{LENS}/fairtrade-cotton-canvas-zip-pouch-m-for-shop/m/natural/21142561/"
        "1791850972-1062x826.png.contain.webp"
        "?h=5625c74651d229fe7447b237d095bd9f858b1b90&printed=true",
    ),
    # 卓上カレンダー（21154506。2026-10-15 公開）。1月のページを正面から。
    # 見本の出どころは `lens2.suzuri.jp/render/desk-calendar`（`shopshot.py` の右上と同じ1枚）。
    # この箱から届かない日は、落とした写真を `--src` に `suzuri-calendar.webp` の名前で置く
    # （中身が jpg でも Pillow は中身で読む）
    (
        "suzuri-calendar",
        "https://lens2.suzuri.jp/render/desk-calendar?color=white&size=2027"
        "&image_size=1530x1530&original_image_size=1254x1254"
        "&source_path=materials%2Ftextures%2F21154506%2F1791991945-1254x1254.png"
        "&source_version=1791991945&angle=january&adjustment=.0.5893%2B0.0%2B0.0"
        "&output_format=jpg&token=eyJhbGciOiJIUzI1NiJ9.eyJsYXlvdXQiOnsic2hvdCI6eyJpdGVtIjoiZGVzay1jYWxlbmRhciIsImNvbG9yIjoiIiwic2l6ZSI6IiIsImFuZ2xlIjoiIn0sImFkanVzdG1lbnQiOnsic2NhbGUiOjEsIm9mZnNldF94IjowLCJvZmZzZXRfeSI6MH0sIm9yaWdpbmFsX3NpemUiOnsid2lkdGgiOjAsImhlaWdodCI6MH0sIm91dHB1dF9zaXplIjp7IndpZHRoIjowLCJoZWlnaHQiOjB9fSwic291cmNlX3BhdGgiOiIiLCJzb3VyY2VfdmVyc2lvbiI6MCwidmlvbGF0aW9uIjpmYWxzZSwib3V0cHV0X2Zvcm1hdCI6IiJ9"
        ".dBrZVnUn9-CThPGqgOmHZEsa1bpETwKxKU_dJjczdVU",
    ),
    # 付箋「誰にでも似合うトレーナー」（2026-10-18）から作ったスウェット（21191111）。紺の前
    (
        "suzuri-sweat-aytearth",
        f"{LENS}/sweat/s/navy/21191111/1792438144-2520x2992.png.contain.webp"
        "?h=f031f4561685ed46c7d1b530d4d7cd677c98c612&printed=true",
    ),
    # 付箋「すてきなTシャツ」（2026-10-14）から作ったTシャツ（21191982）。黒の前。
    # 胸の1行がこのTシャツの顔なので、ほかの2枚と違って前を焼く
    (
        "suzuri-tee-noreturn",
        f"{LENS}/t-shirt/s/black/front/21191982/1792451519-2520x2992.png.contain.webp"
        "?h=21016184894ce267059fae1ad42ba527477f349d&printed=true",
    ),
    # Tシャツ2枚は背中。id は裏のデザイン（21142560 / 21142557）
    (
        "suzuri-tee-globe",
        f"{LENS}/t-shirt/s/white/back/21142560/1791850968-2520x2992.png.webp"
        "?h=0c23c25ca34c69dc9a0919f54656ebcda0aa12d8&printed=true",
    ),
    (
        "suzuri-tee-chat",
        f"{LENS}/t-shirt/s/white/back/21142557/1791850963-2520x2992.png.webp"
        "?h=b76dc36bc82b31cb1d9b0e837769d4392e6b3d47&printed=true",
    ),
]


def fetch(url: str, dest: pathlib.Path) -> pathlib.Path:
    """**curl で取る。** この箱のブラウザは外へ出られないが、curl は出られる。

    `-f` を付ける。付けないと 4xx でも 0 で終わって、**エラーの HTML を
    絵として掴む**（`shopshot.py` と同じ理由）。
    """
    subprocess.run(
        ["curl", "-fsSL", "--retry", "3", "--max-time", "60", "-o", str(dest), url],
        check=True,
    )
    return dest


def ink(rgb: Image.Image, thr: int = 246) -> Image.Image:
    """絵のあるところだけを白く返す（`shopshot.py` の同名のものと同じ考え方）。

    **明るさだけで見ない。** タオルの黄色は明るいので、暗さだけで判定すると
    地と見分けが付かない。色の付き具合（RGB の幅）も合わせて見る。
    """
    dark = rgb.convert("L").point(lambda v: 255 if v < thr else 0)
    r, g, b = rgb.split()
    hi = ImageChops.lighter(ImageChops.lighter(r, g), b)
    lo = ImageChops.darker(ImageChops.darker(r, g), b)
    tint = ImageChops.difference(hi, lo).point(lambda v: 255 if v > 12 else 0)
    return ImageChops.lighter(dark, tint)


def bake(src: Image.Image) -> Image.Image:
    """白地を落として、560角の真ん中に長い辺 490px で置き直す。"""
    rgb = src.convert("RGB")
    bb = ink(rgb).getbbox()
    if bb is None:
        raise SystemExit("絵が1画素も無い（取れた中身がエラーの頁かもしれない）")
    art = rgb.crop(bb)
    w, h = art.size
    s = BOX / max(w, h)
    art = art.resize((max(1, round(w * s)), max(1, round(h * s))), Image.LANCZOS)
    canvas = Image.new("RGB", (SIDE, SIDE), (255, 255, 255))
    canvas.paste(art, ((SIDE - art.width) // 2, (SIDE - art.height) // 2))
    return canvas


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=str(DEST_DIR), help="置き先の folder")
    ap.add_argument("--src", default="/tmp/suzuri-shopgoods", help="落としてきた元絵の置き場")
    ap.add_argument("--only", default="", help="1枚だけ焼く（`towel` のような末尾の字でよい）")
    args = ap.parse_args()

    src = pathlib.Path(args.src)
    src.mkdir(parents=True, exist_ok=True)
    out_dir = pathlib.Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)

    todo = [s for s in SHOTS if not args.only or args.only in s[0]]
    if not todo:
        raise SystemExit(f"--only {args.only!r} に当たるものが無い")

    for name, url in todo:
        raw = src / f"{name}.webp"
        if not raw.exists():
            fetch(url, raw)
        dest = out_dir / f"{name}.webp"
        bake(Image.open(raw)).save(dest, "WEBP", quality=78, method=6)
        print(f"{dest} {dest.stat().st_size} bytes")
    return 0


if __name__ == "__main__":
    sys.exit(main())
