"""キッチンカーの外装・内装の**型の絵**を、3D の寸法表から作る。

    python3 tools/van3d/template.py            # 型の絵を書き直す（tools/van3d/ に4枚）
    python3 tools/van3d/template.py --check    # 書いてある型の絵が、寸法表から作った絵と同じかだけ見る

寸法表は `site/components/legends/kitchen/van3d/dims.json`（3D と同じ1枚）。1m = 150px、絵は 1536×1024
（ChatGPT の横長の絵と同じ大きさ）。区画の中は外から見たとおりの向き（内装は中から見たとおりの向き）。

| 書く絵 | 何 |
| --- | --- |
| `template-exterior.png` | 外装の型。5つの面の区画・窓（青）・窓口の扉（橙の点線）・車輪で隠れる所（灰）・使わない所（濃い灰）・庇の垂れと白の区画。右の余白に約束ごと |
| `template-interior.png` | 内装の型。内壁4枚の区画・窓口の穴・仕切りの通り抜け・台より下（家具で隠れる） |
| `guide-left.png`・`guide-right.png` | 横の面を1枚の絵で描く組（マジョリカ）のための下絵。字なし。横の区画を 1536 幅に伸ばし、上下の切れる帯を灰にした |

字（約束ごと・区画の名前）は区画の外にだけ置く（区画の中に字があると、描いた絵に字が写る）。
寸法表を直したら、この道具で書き直し、`skin_pack.py` で貼り直す。
"""
from __future__ import annotations

import io
import json
import math
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
DIMS = ROOT / "site/components/legends/kitchen/van3d/dims.json"

WHITE = (255, 255, 255)
REGION = (238, 241, 244)
UNUSED = (206, 212, 219)
EDGE = (154, 163, 173)
WIN = (216, 232, 248)
WIN_LINE = (74, 144, 217)
HATCH = (230, 126, 34)
HIDDEN = (201, 206, 214)
INK = (86, 96, 107)
VAL = (255, 214, 226)

FONTS = [
    "/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc",
    "/usr/share/fonts/opentype/ipafont-gothic/ipag.ttf",
    "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
]


def load() -> dict:
    return json.loads(DIMS.read_text(encoding="utf-8"))


def font(size: int):
    for f in FONTS:
        if Path(f).exists():
            return ImageFont.truetype(f, size)
    return None


def smooth(a: float, b: float, v: float) -> float:
    t = max(0.0, min(1.0, (v - a) / (b - a)))
    return t * t * (3 - 2 * t)


def setback(d: dict, y: float) -> float:
    """運転席の前を寝かせる量（van.ts の setback と同じ式）"""
    c = d["cab"]
    h0, h1 = c["hood"]
    tan = math.tan(math.radians(c["rake"]))
    return smooth(c["belt"], c["belt"] + h0, y) * h1 + max(0.0, y - (c["belt"] + h0)) * tan


def nose(d: dict, y: float) -> float:
    return d["cab"]["x"][1] - setback(d, y)


class Sheet:
    """区画の中の (s, t)（外から見て左→右・下→上）と、メートルの座標の行き来"""

    def __init__(self, d: dict, kind: str = "exterior"):
        self.d = d
        self.sh = d[kind]
        self.span = self.sh["span"]

    def reg(self, name: str) -> list[int]:
        return self.sh["regions"][name]

    def px(self, name: str, s: float, t: float) -> tuple[float, float]:
        x, y, w, h = self.reg(name)
        return (x + s * w, y + (1 - t) * h)

    @staticmethod
    def frac(v: float, a: list[float]) -> float:
        return (v - a[0]) / (a[1] - a[0])

    def side(self, name: str, x: float, y: float) -> tuple[float, float]:
        """横の面の点（m）→ 区画の px。left は前が左、right は前が右"""
        s = self.frac(x, self.span["x"])
        return self.px(name, 1 - s if name == "left" else s, self.frac(y, self.span["y"]))

    def end(self, name: str, z: float, y: float) -> tuple[float, float]:
        """前・後ろの面。front は左端が車の右（+z）、back は左端が車の左"""
        s = self.frac(z, self.span["z"])
        return self.px(name, 1 - s if name == "front" else s, self.frac(y, self.span["y"]))

    def roof(self, x: float, z: float) -> tuple[float, float]:
        return self.px("roof", self.frac(x, self.span["x"]), 1 - self.frac(z, self.span["z"]))


def dashed(dr: ImageDraw.ImageDraw, pts: list[tuple[float, float]], fill, width: int = 3, dash: float = 10, gap: float = 7):
    for (x0, y0), (x1, y1) in zip(pts, pts[1:]):
        L = math.hypot(x1 - x0, y1 - y0)
        n = max(1, int(L // (dash + gap)))
        for i in range(n + 1):
            a = i * (dash + gap) / L
            b = min(1.0, (i * (dash + gap) + dash) / L)
            if a >= 1:
                break
            dr.line([(x0 + (x1 - x0) * a, y0 + (y1 - y0) * a), (x0 + (x1 - x0) * b, y0 + (y1 - y0) * b)], fill=fill, width=width)


def side_outline(d: dict) -> list[tuple[float, float]]:
    """横から見た車体の外形（m。後ろの下から反時計回り）。運転席は箱より低く、前の窓は寝ている"""
    bx, by = d["box"]["x"], d["box"]["y"]
    cy = d["cab"]["y"]
    pts = [(bx[0], by[0]), (bx[0], by[1]), (bx[1], by[1]), (bx[1], cy[1])]
    steps = 24
    for i in range(steps + 1):
        y = cy[1] - (cy[1] - d["cab"]["belt"]) * i / steps
        pts.append((nose(d, y), y))
    pts += [(d["cab"]["x"][1], cy[0])]
    return pts


def cab_window(d: dict) -> list[tuple[float, float]]:
    w = d["windows"]["cab"]
    y0, y1 = w["y"]
    return [(w["x0"], y0), (nose(d, y0) - w["inset"], y0), (nose(d, y1) - w["inset"], y1), (w["x0"], y1)]


def exterior(d: dict, with_text: bool = True) -> Image.Image:
    S = Sheet(d)
    W, H = d["exterior"]["size"]
    im = Image.new("RGB", (W, H), WHITE)
    dr = ImageDraw.Draw(im)
    for name in ("left", "back", "roof", "right", "front"):
        x, y, w, h = S.reg(name)
        dr.rectangle([x, y, x + w - 1, y + h - 1], fill=UNUSED)
    # 横: 車体の外形の中だけを使う
    for name in ("left", "right"):
        poly = [S.side(name, x, y) for x, y in side_outline(d)]
        dr.polygon(poly, fill=REGION)
        for ax in d["wheels"]["x"]:
            r = d["wheels"]["arch"] * d["scale"]
            cx, cy = S.side(name, ax, d["wheels"]["r"])
            dr.pieslice([cx - r, cy - r, cx + r, cy + r], 180, 360, fill=HIDDEN)
        win = [S.side(name, x, y) for x, y in cab_window(d)]
        dr.polygon(win, fill=WIN)
        dashed(dr, win + [win[0]], WIN_LINE)
        if name == "left":
            sw = d["windows"]["small"]
            pts = [S.side(name, sw["x"][0], sw["y"][0]), S.side(name, sw["x"][1], sw["y"][1])]
            box = [min(p[0] for p in pts), min(p[1] for p in pts), max(p[0] for p in pts), max(p[1] for p in pts)]
            dr.rectangle(box, fill=WIN)
            dashed(dr, [(box[0], box[1]), (box[2], box[1]), (box[2], box[3]), (box[0], box[3]), (box[0], box[1])], WIN_LINE)
        else:
            hx, hy = d["hatch"]["x"], d["hatch"]["y"]
            sh = d["hatch"]["shelf"]
            for y0, y1 in ((hy[0], hy[1]), (sh, hy[0])):
                a = S.side(name, hx[0], y1)
                b = S.side(name, hx[1], y0)
                dashed(dr, [a, (b[0], a[1]), b, (a[0], b[1]), a], HATCH)
        # 箱と運転席の継ぎ目（ここに大事な絵を置かない）
        jx = d["box"]["x"][1]
        a = S.side(name, jx - d["box"]["r"], d["cab"]["y"][1])
        b = S.side(name, jx, d["box"]["y"][0])
        dashed(dr, [(a[0], a[1]), (a[0], b[1])], EDGE, width=2, dash=6, gap=8)
        dashed(dr, [(b[0], a[1]), (b[0], b[1])], EDGE, width=2, dash=6, gap=8)
    # 前: 運転席の顔（下）と、箱の段（上）
    cz = d["cab"]["hw"]
    by, cy = d["box"]["y"], d["cab"]["y"]
    a = S.end("front", cz, cy[1])
    b = S.end("front", -cz, by[0])
    dr.rectangle([a[0], a[1], b[0], b[1]], fill=REGION)
    a = S.end("front", d["box"]["hw"], by[1])
    b = S.end("front", -d["box"]["hw"], cy[1])
    dr.rectangle([a[0], a[1], b[0], b[1]], fill=REGION)
    sw = d["windows"]["shield"]
    a = S.end("front", sw["z"], sw["y"][1])
    b = S.end("front", -sw["z"], sw["y"][0])
    dr.rounded_rectangle([a[0], a[1], b[0], b[1]], 12, fill=WIN)
    dashed(dr, [a, (b[0], a[1]), b, (a[0], b[1]), a], WIN_LINE)
    lh = d["lights"]["head"]
    for z in (lh["z"], -lh["z"]):
        cx, cyy = S.end("front", z, lh["y"])
        r = lh["r"] * d["scale"] * 1.15
        dr.ellipse([cx - r, cyy - r, cx + r, cyy + r], fill=HIDDEN)
    bu = d["bumper"]
    for name in ("front", "back"):
        a = S.end(name, d["box"]["hw"], bu["y"] + bu["h"] / 2)
        b = S.end(name, -d["box"]["hw"], by[0])
        dr.rectangle([min(a[0], b[0]), a[1], max(a[0], b[0]), b[1]], fill=HIDDEN)
    # 後ろ: 窓2つと灯り
    for z0, z1 in d["windows"]["rear"]["z"]:
        y0, y1 = d["windows"]["rear"]["y"]
        a = S.end("back", z0, y1)
        b = S.end("back", z1, y0)
        box = [min(a[0], b[0]), a[1], max(a[0], b[0]), b[1]]
        dr.rounded_rectangle(box, 10, fill=WIN)
        dashed(dr, [(box[0], box[1]), (box[2], box[1]), (box[2], box[3]), (box[0], box[3]), (box[0], box[1])], WIN_LINE)
    tl = d["lights"]["tail"]
    for z in (tl["z"], -tl["z"]):
        a = S.end("back", z - 0.08, tl["y"][1])
        b = S.end("back", z + 0.08, tl["y"][0] - 0.15)
        dr.rectangle([min(a[0], b[0]), a[1], max(a[0], b[0]), b[1]], fill=HIDDEN)
    # 屋根: 箱の屋根と運転席の屋根（前の窓より前は使わない）
    bx = d["box"]["x"]
    a = S.roof(bx[0], -d["box"]["hw"])
    b = S.roof(bx[1], d["box"]["hw"])
    dr.rectangle([a[0], a[1], b[0], b[1]], fill=REGION)
    a = S.roof(bx[1], -cz)
    b = S.roof(nose(d, cy[1]), cz)
    dr.rectangle([a[0], a[1], b[0], b[1]], fill=REGION)
    a = S.roof(-0.95 - 0.28, -0.28)
    b = S.roof(-0.95 + 0.28, 0.28)
    dr.rectangle([a[0], a[1], b[0], b[1]], fill=HIDDEN)
    # 区画の縁（丸い角で曲がる帯）
    band = round(d["box"]["r"] * d["scale"])
    for name in ("left", "back", "roof", "right", "front"):
        x, y, w, h = S.reg(name)
        dr.rectangle([x, y, x + w - 1, y + h - 1], outline=EDGE, width=2)
        dashed(dr, [(x + band, y + band), (x + w - band, y + band), (x + w - band, y + h - band), (x + band, y + h - band), (x + band, y + band)], (190, 196, 204), width=1, dash=4, gap=6)
    # 庇の垂れ（道具が塗る）と白（道具が塗る）
    x, y, w, h = S.reg("valance")
    n = d["valance"]["stripes"]["n"]
    for i in range(n):
        dr.rectangle([x + w * i / n, y, x + w * (i + 1) / n - 1, y + h - 1], fill=VAL if i % 2 == 0 else WHITE)
    dr.rectangle([x, y, x + w - 1, y + h - 1], outline=EDGE, width=2)
    x, y, w, h = S.reg("white")
    dr.rectangle([x, y, x + w - 1, y + h - 1], fill=WHITE, outline=EDGE, width=1)
    if with_text:
        legend(dr, d)
    return im


def legend(dr: ImageDraw.ImageDraw, d: dict) -> None:
    f1 = font(22)
    f2 = font(18)
    if not f1:
        return
    x0 = 1014
    y = 112
    lines = [
        (f1, "外装の型 1536×1024・1m = 150px"),
        (f2, "外から見たとおりの向きで描く"),
        (f2, ""),
        (f1, "区画（左上から）"),
        (f2, "左上: 左の横（運転席側。前が左）"),
        (f2, "その右: 後ろ（左端が車の左）"),
        (f2, "中: 屋根（上から。前が右・上端が車の左）"),
        (f2, "左下: 右の横（窓口の側。前が右）"),
        (f2, "その右: 前（左端が車の右）"),
        (f2, "右上の縞: 庇の垂れ（道具が塗る）"),
        (f2, "その下の白: 道具が使う（塗らない）"),
        (f2, ""),
        (f1, "色の約束"),
        (f2, "薄い灰: 描く所／濃い灰: 使わない所"),
        (f2, "青の点線: 窓（ガラスで隠れる）"),
        (f2, "橙の点線: 窓口の扉と台（開く。閉じると絵はつながる）"),
        (f2, "灰の半円・丸: 車輪・灯り・バンパーで隠れる"),
        (f2, "細い点線: 縁から 45px は丸い角で曲がる"),
        (f2, "縦の2本の点線: 箱と運転席の継ぎ目"),
        (f2, ""),
        (f1, "つながっている辺"),
        (f2, "左の横の右端 ＝ 後ろの左端"),
        (f2, "屋根の下端 ＝ 右の横の上端"),
        (f2, "右の横の右端 ＝ 前の左端"),
        (f2, ""),
        (f2, "区画の外は使わない。字・数字・ロゴを描かない"),
    ]
    for f, t in lines:
        if t:
            dr.text((x0, y), t, fill=INK, font=f)
        y += 30 if f is f1 else 27


def interior(d: dict, with_text: bool = True) -> Image.Image:
    S = Sheet(d, "interior")
    W, H = d["interior"]["size"]
    im = Image.new("RGB", (W, H), WHITE)
    dr = ImageDraw.Draw(im)
    sp = d["interior"]["span"]
    top = d["hatch"]["y"][0]

    def at(name: str, a: float, y: float) -> tuple[float, float]:
        if name in ("left", "right"):
            s = Sheet.frac(a, sp["x"])
            return S.px(name, s if name == "left" else 1 - s, Sheet.frac(y, sp["y"]))
        s = Sheet.frac(a, sp["z"])
        return S.px(name, 1 - s if name == "back" else s, Sheet.frac(y, sp["y"]))

    for name in ("left", "right", "back", "front"):
        x, y, w, h = S.reg(name)
        dr.rectangle([x, y, x + w - 1, y + h - 1], fill=REGION, outline=EDGE, width=2)
        # 台より下は家具で隠れやすい（薄く）
        a = at(name, sp["x"][0] if name in ("left", "right") else sp["z"][0], top)
        dr.rectangle([x, a[1], x + w - 1, y + h - 1], fill=(228, 232, 236))
    hx = d["hatch"]["x"]
    a = at("right", hx[0], d["hatch"]["y"][1])
    b = at("right", hx[1], d["hatch"]["shelf"])
    box = [min(a[0], b[0]), a[1], max(a[0], b[0]), b[1]]
    dr.rectangle(box, fill=UNUSED)
    dashed(dr, [(box[0], box[1]), (box[2], box[1]), (box[2], box[3]), (box[0], box[3]), (box[0], box[1])], HATCH)
    a = at("front", -0.42, 2.16)
    b = at("front", 0.42, 1.42)
    dr.rectangle([min(a[0], b[0]), a[1], max(a[0], b[0]), b[1]], fill=UNUSED)
    x, y, w, h = S.reg("white")
    dr.rectangle([x, y, x + w - 1, y + h - 1], fill=WHITE, outline=EDGE, width=1)
    f1, f2 = font(22), font(18)
    if with_text and f1:
        lines = [
            (f1, "内装の型 1536×1024・1m = 150px"),
            (f2, "中から見たとおりの向きで描く"),
            (f2, ""),
            (f2, "左上: 左の内壁（前が右）"),
            (f2, "その下: 右の内壁（窓口。前が左）"),
            (f2, "右上: 奥の壁（右端が車の左）"),
            (f2, "その下: 運転席の後ろの仕切り（右端が車の右）"),
            (f2, ""),
            (f2, "濃い灰: 穴（窓口・通り抜け）"),
            (f2, "下の薄い帯: 台より下（家具で隠れやすい）"),
            (f2, "右上の白: 道具が使う（塗らない）"),
            (f2, "字・数字・ロゴを描かない"),
        ]
        yy = 600
        for f, t in lines:
            if t:
                dr.text((8, yy), t, fill=INK, font=f)
            yy += 30 if f is f1 else 27
    return im


def guide(d: dict, name: str) -> Image.Image:
    """横の面を1枚で描く組の下絵（字なし）。横の区画を 1536 幅へ。上下の切れる帯は灰"""
    W, H = 1536, 1024
    x, y, w, h = d["exterior"]["regions"][name]
    k = W / w
    band = h * k
    top = (H - band) / 2
    small = exterior(d, with_text=False).crop((x, y, x + w, y + h)).resize((W, round(band)), Image.LANCZOS)
    im = Image.new("RGB", (W, H), (230, 233, 237))
    im.paste(small, (0, round(top)))
    return im


def outputs(d: dict) -> dict[str, Image.Image]:
    return {
        "template-exterior.png": exterior(d),
        "template-interior.png": interior(d),
        "guide-left.png": guide(d, "left"),
        "guide-right.png": guide(d, "right"),
    }


def png_bytes(im: Image.Image) -> bytes:
    b = io.BytesIO()
    im.save(b, "PNG", optimize=True)
    return b.getvalue()


def main(argv: list[str]) -> None:
    d = load()
    outs = outputs(d)
    if "--check" in argv:
        stale = []
        for name, im in outs.items():
            p = HERE / name
            if not p.exists():
                stale.append(f"{name}（無い）")
                continue
            old = Image.open(p).convert("RGB")
            if old.size != im.size or old.tobytes() != im.convert("RGB").tobytes():
                stale.append(name)
        if stale:
            print("寸法表と合わない型の絵: " + "・".join(stale) + "（python3 tools/van3d/template.py で書き直す）")
            sys.exit(1)
        print(f"型の絵 {len(outs)} 枚は寸法表どおり")
        return
    for name, im in outs.items():
        (HERE / name).write_bytes(png_bytes(im))
        print(f"書いた: tools/van3d/{name} {im.size[0]}×{im.size[1]}")


if __name__ == "__main__":
    main(sys.argv[1:])
