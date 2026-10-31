"""SUZURI の札「全部見る」に並べる「商品の例」の1枚（2×2）を焼く。

    python3 tools/goods/shopshot.py           # 焼いて site/public/goods/suzuri-goods.webp に置く
    python3 tools/goods/shopshot.py --out /tmp/x.webp   # 置き先を変えて試す
    python3 tools/goods/shopshot.py --out /tmp/x.webp --stand-in calendar=/tmp/cal.png
                                              # 写真の無いマスに仮の絵を入れて、見た目だけ見る

## なぜ自前で焼くのか

前は SUZURI が自分で作っている店の絵（`og.suzuri.jp/users/2272949.webp`）の
右半分を切って貼っていた。**どれが写るかは向こうが決める**ので、
あやとが「バナナにして」と言っても、こちらでは選べなかった。

なので、商品1つずつの絵を取ってきて、こちらで2×2に組む。
**どれを写すかが、こちらの手に戻る。**

## 何を写すか（あやと 2026-10-14）

> 「全部見る」の画像は以下に変更して欲しい
> 左上: トートバッグ / 右上: カレンダー / 左下: バナナキーホルダー /
> 右下: 歩いているあやとのキーホルダー

| マス | 何 | SUZURI のデザイン |
| --- | --- | --- |
| 左上 | トート「あやとのイギリスぶらぶら」 | 17391744（升目のトートと同じ1枚を使う） |
| 右上 | 卓上カレンダー「あやと 旅の思い出カレンダー 2027」（1月のページ） | 21154506 |
| 左下 | アクリルキーホルダー「カサ・アヤトの住人 🍌」 | 17392036 |
| 右下 | アクリルキーホルダー「あやと ― 歩いているあやと」 | 21116648 |

前の組み（2026-10-09〜）はバナナの缶バッジ・ステッカー・キーホルダーと、
右下に島の STOP のステッカー（店に無い絵を、ふちを付けて抜いていた）。
**4マスとも店で買えるものの写真になったので、抜く手（`diecut`）と
落ち影（`drop`）は外した。**

## 写真の無いマスがあるうちは、本番の置き場に焼かない

`CELLS` の `src` が `None` のマスがあると、焼かずに止まる。
仮の絵（`--stand-in`）を入れた回は、`site/public/goods/suzuri-goods.webp` には
**書かずに 2 で帰る**——**見た目を確かめるための回**で、配る絵ではない。
`--out` で別の置き場を渡したときだけ焼く。
（カレンダーの写真が出品前に無かったあいだ、2026-10-14 にこれで組みを見た）

マスを替えて焼いたら `site/content/goods.ts` の `SUZURI.shot.alt` を下の `ALT` に
替える（絵と字が食い違う日を作らない）。

## 字も値段も焼かない

焼くのは**商品の絵だけ**。値段・個数・品ぞろえは向こうが持っていて、
焼くと変わった日から嘘になる（`site/content/goods.ts` の `SUZURI`）。
**よその会社のマークも焼かない**——1つずつ取れば、そもそも印の入っていない
見本の絵が手に入る。**`og.suzuri.jp` の絵は使わない**（SUZURI の透かしと
ロゴが焼き込まれている）。

## 元絵のありか

商品の**見本の絵**（`lens.suzuri.jp`）。URL は `SUZURI API` ワークフロー
（`suzuri_api.yml`）の `command: sample`、`args: <デザイン id …>` が出す。
出てくる `tpl` の `{width}x{height}` を `1530x1530`、`{size}` `{color}` を見本の値、
`[/angle]` を `/front` に埋めたものが下の URL（2026-10-14 に 21116648 と
17392036 で引いた。run 38549583556）。**`h=` は向こうが付けた署名で、
こちらでは作れない。** 絵を差し替えたら取り直す。寸法は署名に入っていないので、
1530 で取れる（ワークフローが同じ署名で 1530 を取れている）。

カレンダーは見本の絵の出どころが別で、`lens2.suzuri.jp/render/desk-calendar`
（`angle=january` で1月のページ）。こちらも `token=` は向こうの署名。

**この箱からは `lens.suzuri.jp` に届かない日がある**（2026-10-14 は proxy が
CONNECT を 403 で断った）。そのときは、届く所で落とした絵を1つの置き場に
集めて `--src` に渡す。`CELLS` の `local` に書いた名前のどれかが在れば、
取りに行かずにそちらを使う——`sample` の成果物（`suzuri-sheet`。
`.claude/skills/suzuri/fetch_artifact.sh` で持ち帰る）の `<id>-<品目>-front.img` と、
EC2 で落とした写真の名前（2026-10-15 に焼いたときの名前）の両方を並べてある。

## 大きさと重さ

560x560 / webp q78 で 30KB 前後。画面に出るのは 176 CSS px（390px のスマホ）
なので、dpr3 でちょうど足りる。**ここを大きくしても画面では1画素も変わらない。**
"""

import argparse
import pathlib
import subprocess
import sys

from PIL import Image, ImageChops

ROOT = pathlib.Path(__file__).resolve().parents[2]
DEST = ROOT / "site/public/goods/suzuri-goods.webp"

SIDE = 560
CELL = SIDE // 2

LENS = "https://lens.suzuri.jp/v3/1530x1530"

# 4マス。**並びは 左上 → 右上 → 左下 → 右下**（あやと 2026-10-14 の指定の順）。
#
# - `src`: 見本の絵の URL か、リポジトリの中の道。**`None` はまだ写真が無いマス**
# - `local`: 届かない日に `--src` から拾う名前（先に在ったものを使う）
# - `box`: そのマスの中で絵を何px角に収めるか。品目ごとに形が違うので
#   （キーホルダーは輪のぶん縦に長い、トートは持ち手のぶん縦に長い）、
#   同じ数にすると見た目の重さが揃わない。**揃えるのは箱ではなく、見えかたのほう。**
CELLS = [
    {
        "name": "tote",
        # 升目のトートの札と**同じ1枚**（`shopgoods.py` の頭。同じ絵を2つ持たない）。
        # もう白地に焼いてあるので、絵のあるところだけ切り出して縮める
        "src": "site/public/goods/suzuri-tote.webp",
        "local": [],
        "box": 240,
    },
    {
        "name": "calendar",
        # デザイン 21154506（あやと 旅の思い出カレンダー 2027）。1月のページ。
        # 横に長い（暦と絵が左右に並ぶ）ので、箱を少し大きくして重さをそろえる
        "src": "https://lens2.suzuri.jp/render/desk-calendar?color=white&size=2027"
        "&image_size=1530x1530&original_image_size=1254x1254"
        "&source_path=materials%2Ftextures%2F21154506%2F1791991945-1254x1254.png"
        "&source_version=1791991945&angle=january&adjustment=.0.5893%2B0.0%2B0.0"
        "&output_format=jpg&token=eyJhbGciOiJIUzI1NiJ9.eyJsYXlvdXQiOnsic2hvdCI6eyJpdGVtIjoiZGVzay1jYWxlbmRhciIsImNvbG9yIjoiIiwic2l6ZSI6IiIsImFuZ2xlIjoiIn0sImFkanVzdG1lbnQiOnsic2NhbGUiOjEsIm9mZnNldF94IjowLCJvZmZzZXRfeSI6MH0sIm9yaWdpbmFsX3NpemUiOnsid2lkdGgiOjAsImhlaWdodCI6MH0sIm91dHB1dF9zaXplIjp7IndpZHRoIjowLCJoZWlnaHQiOjB9fSwic291cmNlX3BhdGgiOiIiLCJzb3VyY2VfdmVyc2lvbiI6MCwidmlvbGF0aW9uIjpmYWxzZSwib3V0cHV0X2Zvcm1hdCI6IiJ9"
        ".dBrZVnUn9-CThPGqgOmHZEsa1bpETwKxKU_dJjczdVU",
        "local": ["calendar-2027-january-1530.jpg"],
        "box": 252,
    },
    {
        "name": "banana-key",
        "src": f"{LENS}/acrylic-keychain/50x50mm/clear/front/17392036/"
        "1791579090-920x920.png.webp"
        "?h=60dd00e3bddce7acd9f7c288bfbba49b614b93e2&printed=true",
        "local": ["17392036-acrylic-keychain-front.img", "keychain-banana-17392036-1530.webp"],
        "box": 250,
    },
    {
        "name": "walk-key",
        "src": f"{LENS}/acrylic-keychain/50x50mm/clear/front/21116648/"
        "1791584788-1549x1549.png.webp"
        "?h=e6a16b8acb91bf1118441442973169bc3cfb594f&printed=true",
        "local": [
            "21116648-acrylic-keychain-front.img",
            "keychain-walking-ayato-21116648-1530.webp",
        ],
        "box": 250,
    },
]

# 焼いた1枚の alt。**写っているものだけを言う**（品ぞろえ・値段・個数を数えない）。
# 焼き直したら `site/content/goods.ts` の `SUZURI.shot.alt` をこれに替える
ALT = (
    "イギリスの地図が入ったトートバッグ・卓上カレンダー・"
    "バナナのキャラクターと歩いているあやとのアクリルキーホルダー"
)


def fetch(url: str, dest: pathlib.Path) -> pathlib.Path:
    """**curl で取る。** この箱のブラウザは外へ出られないが、curl は出られる日がある。

    `-f` を付ける。付けないと 4xx でも 0 で終わって、エラーの HTML を
    絵として掴む（`tools/sprites/prod.mjs` が同じところで1度転んでいる）。
    """
    subprocess.run(
        ["curl", "-fsSL", "--retry", "3", "--max-time", "40", "-o", str(dest), url],
        check=True,
    )
    return dest


def flatten(im: Image.Image) -> Image.Image:
    """透過のある絵を白地に置く。**そのまま RGB にすると、透けていたところが
    黒くなって**、次の `ink` が絵の一部と読む（仮の絵に透過 PNG を渡すと起きる）。"""
    if im.mode in ("RGBA", "LA", "P"):
        rgba = im.convert("RGBA")
        base = Image.new("RGBA", rgba.size, (255, 255, 255, 255))
        base.alpha_composite(rgba)
        return base.convert("RGB")
    return im.convert("RGB")


def ink(rgb: Image.Image, thr: int) -> Image.Image:
    """絵のあるところだけを白く返す。

    **明るさだけで見ない。** バナナの黄色は明るいので、暗さだけで判定すると
    地と見分けが付かず、絵の上半分を切り落とす。色の付き具合（RGB の幅）も
    合わせて見る。
    """
    dark = rgb.convert("L").point(lambda v: 255 if v < thr else 0)
    r, g, b = rgb.split()
    hi = ImageChops.lighter(ImageChops.lighter(r, g), b)
    lo = ImageChops.darker(ImageChops.darker(r, g), b)
    tint = ImageChops.difference(hi, lo).point(lambda v: 255 if v > 12 else 0)
    return ImageChops.lighter(dark, tint)


def trim(im: Image.Image, thr: int = 246) -> Image.Image:
    """白地を落として、絵のあるところだけ返す。"""
    rgb = flatten(im)
    bb = ink(rgb, thr).getbbox()
    if bb is None:
        raise SystemExit("絵が1画素も無い（取れた中身がエラーの頁かもしれない）")
    return rgb.crop(bb)


def place(canvas: Image.Image, art: Image.Image, cx: float, cy: float, box: int) -> None:
    w, h = art.size
    s = min(box / w, box / h)
    nw, nh = max(1, round(w * s)), max(1, round(h * s))
    a = art.resize((nw, nh), Image.LANCZOS)
    canvas.paste(a, (round(cx - nw / 2), round(cy - nh / 2)))


def source_of(cell: dict, src_dir: pathlib.Path, stand_in: dict) -> tuple[pathlib.Path, bool]:
    """そのマスの元絵の在りかと、**それが仮の絵か**を返す。"""
    name = cell["name"]
    if name in stand_in:
        return stand_in[name], True
    src = cell["src"]
    if src is None:
        raise SystemExit(
            f"{name} の写真がまだ無い（CELLS の src が None）。"
            f"見た目だけ見るなら --stand-in {name}=<絵> と --out を渡す"
        )
    if not src.startswith("http"):
        return ROOT / src, False
    for local in cell["local"]:
        if (src_dir / local).exists():
            return src_dir / local, False
    f = src_dir / f"{name}.webp"
    if not f.exists():
        fetch(src, f)
    return f, False


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=str(DEST))
    ap.add_argument("--src", default="/tmp/suzuri-shots", help="落としてきた元絵の置き場")
    ap.add_argument(
        "--stand-in",
        action="append",
        default=[],
        metavar="NAME=PATH",
        help="写真の無いマスに仮の絵を入れる（配る置き場には焼かない）",
    )
    args = ap.parse_args()

    known = [c["name"] for c in CELLS]
    stand_in = {}
    for kv in args.stand_in:
        name, _, path = kv.partition("=")
        if name not in known or not path:
            raise SystemExit(f"--stand-in {kv!r}: マスの名前は {known} のどれか")
        stand_in[name] = pathlib.Path(path)

    out = pathlib.Path(args.out).resolve()
    # **仮の絵が1マスでも入る回は、配る置き場に書かない。**
    # 写真の無いマスが残っている回は、`source_of` が先に止める
    if stand_in and out == DEST.resolve():
        print("仮の絵（--stand-in）を入れた回は、配る置き場に焼かない。--out で別の置き場を渡す")
        return 2

    src_dir = pathlib.Path(args.src)
    src_dir.mkdir(parents=True, exist_ok=True)

    canvas = Image.new("RGB", (SIDE, SIDE), (255, 255, 255))
    q = CELL / 2
    spots = [(q, q), (CELL + q, q), (q, CELL + q), (CELL + q, CELL + q)]
    for cell, (cx, cy) in zip(CELLS, spots):
        f, temp = source_of(cell, src_dir, stand_in)
        place(canvas, trim(Image.open(f)), cx, cy, cell["box"])
        print(f"  {cell['name']:<11} {'仮 ' if temp else ''}{f}")

    out.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(out, "WEBP", quality=78, method=6)
    print(f"{out} {out.stat().st_size} bytes")
    if not stand_in:
        print(f"alt（site/content/goods.ts の SUZURI.shot.alt へ）: {ALT}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
