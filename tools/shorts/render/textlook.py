"""字の見た目（look）と、出入りの動き（anim）。どちらも様式（style の JSON）だけで決まる。

参考の動画に合わせて書体・縁・色・影・動きを変えるときは、コードではなく様式を書き換える。
ここは「様式に書いてあることを、そのとおりに描く」だけにしてある。

## look（字の見た目）

    {"fill": "#FFFFFF" | ["#上", "#下"] | {"stops": [[0.0, "#FBEE1E"], [0.35, "#FDFCA1"], [1.0, "#FAE707"]]},
     "fill_mode": "line" | "block",       # グラデーションを行ごとに掛けるか、全体に1回か（既定 line）
     "outline": [{"color": "#EF0101", "width_em": 0.057}, {"color": "#000000", "width": 9}],
                                           # 縁。字の輪郭から外へ、内側の層から順に（幅は px か em。足し算で外へ）
                                           # "rough": {"amp": 2.5, "scale": 3} で外側をざらつかせる
     "glow": {"color": "#EBD050", "half_px": 16, "extent_px": 35}          # 縁の外の発光（半分になる距離・消える距離）
           | {"stops": [[0.5, "#F9B4EA"], [6.5, "#F24BAB"], [18, "transparent"]]},  # 輪郭からの距離ごとの色
     "backing": {"type": "grunge", "color": "#FFFFFF", "extent_px": 35, "seed": 7},  # 字のまわりのかすれた地
     "shadow": {"dx": 0, "dy": 8, "blur": 0, "color": "#000000", "alpha": 0.45},
     "box": {"color": "#000000", "alpha": 1.0, "radius": 28},
     "pad": [x, y], "line_gap": 8, "line_pitch_em": 1.073, "tracking": -0.04,   # 字間・行の送りは em
     "highlight": {"fill": "#F9D342", "scale": 1.12},
     "flag": {"height_em": 0.82, "side_em": 0.09, "edge_em": 0.022}}   # 字の中の国旗（下の「国旗」。既定は FLAG_DEFAULT）

古い書き方（color・stroke・stroke_color・strokes・bg・bg_alpha・pad_x・pad_y・radius・line_gap・
highlight_color・highlight_scale・shadow_dy・shadow_alpha）も look_of がそのまま読む。

縁と発光は、字の形からの距離（2倍の細かさで測る）で塗る。だから 4.5px・6.5px のような半端な幅もそのまま出る。

## 国旗（字の中に 🇦🇱 と書く）

字に国旗の絵文字（地域指示子2つ。🇦🇱 = U+1F1E6 U+1F1F1）があれば、そこに国旗の絵を1字ぶんとして置く。
書体（M PLUS）には絵文字の字形が無いので、そのまま描くと豆腐（□□）になる。絵は `flags/<小文字の2字>.png`
（`flags.py` が足す。出どころと許諾は `flags/README.md`）。国旗も字の形として縁・発光・影を受ける
（その行の字と同じ縁で囲まれ、地の上で字と同じ重さに見える）。塗りは字の色ではなく国旗の絵。
国旗の無い字は、これまでと1画素も変わらない（国旗を探す前に、無ければ元の道をそのまま通る）。

## anim（出入り）

    {"in":   {"frames": 13, "scale": {"keys": [[0, 0.29], [8, 1.09], [12, 1.01]]}},
     "hold": {"type": "shake", "dx_sd": 13.5, "dx_max": 21, "dy_sd": 19, "dy_max": 36},
     "out":  {"frames": 4, "ease": "in_quad", "alpha": [1, 0]}}

値が2つなら ease の曲線で frames コマかけて動かし、frames 個並べればコマごとの値そのもの、
`{"keys": [[コマ, 値], …]}` ならそのコマの値を直線でつなぐ（計測した曲線をそのまま写す）。
`step` は1つの値を何コマ続けるか（既定 1）。動かせるのは scale・alpha・dx・dy（画素）・rotate（度）・
sharp（1 でくっきり、0.15 で字の高さの1割ほどぼける。`sharp_blur_em` で変えられる）。
hold の shake は、出ている間ずっと位置だけを毎コマでたらめに跳ねさせる（乱数の種は字ごとに固定）。
動画の0コマ目から出ている字は、出の動きをしない（止めて見たときに、0コマ目が出来上がった字であるように）。
"""
from __future__ import annotations

import functools
import math
import re
import sys
import zlib
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

SS = 2  # 縁と発光を測る細かさ（2倍で描いて縮める）

# ---------------------------------------------------------------- 国旗

FLAG_RE = re.compile("[\U0001F1E6-\U0001F1FF]{2}")
FLAG_DIR = Path(__file__).resolve().parent / "flags"
# どれも 2026-10-21 にホステルの回の題の札（1080x1920）で見比べて決めた:
# 高さ 0.82em: 0.74 / 0.82 / 0.90 を並べ、かなの字（M PLUS で 0.79em）と同じ重さに見えたもの。0.90 は字より目立つ。
#   横長の国旗（カタール 11:28）は幅 max_width_em で止め、そのぶん低くする（行の幅を国旗が食わない）
# 横の余白 0.09em ずつ: 国旗と隣の字の縁どうしが重なって1つの塊に見えないだけ空ける
# 角の丸み 0.1（高さに対して）: 丸ゴシックの字の角に寄せる
# 内側の縁 edge_em（白）: 黒い箱の上で、黒を含む国旗（ドイツ・エストニア）の上の辺が箱に溶けて消えた。
#   国旗の形の内側に細い明るい縁を引いて、四角の輪郭を残す（外へは広げない。字の置き場は変わらない）
FLAG_DEFAULT = {"height_em": 0.82, "max_width_em": 1.5, "side_em": 0.09, "radius_em": 0.1,
                "edge_em": 0.022, "edge_color": "#FFFFFF", "edge_alpha": 0.85}
# 国旗の縦の真ん中を、ベースラインから上へ 0.35em に置く（漢字「国」の字形が −0.81〜+0.10em、
# かな「ア」が −0.74〜+0.05em で、どちらも真ん中がここ。M PLUS Rounded 1c で測った）
FLAG_CENTER_EM = 0.35


def has_flag(text: str) -> bool:
    return bool(FLAG_RE.search(text or ""))


def flag_code(pair: str) -> str:
    """地域指示子2つ（🇦🇱）を ISO 3166-1 の2字（AL）に。"""
    return "".join(chr(ord(c) - 0x1F1E6 + ord("A")) for c in pair)


def flag_emoji(code: str) -> str:
    """ISO 3166-1 の2字（AL）を、国旗の絵文字（🇦🇱）に。"""
    return "".join(chr(0x1F1E6 + ord(c) - ord("A")) for c in code.upper())


def flag_cfg(fl: dict | None) -> dict:
    return {**FLAG_DEFAULT, **(fl or {})}


@functools.lru_cache(maxsize=None)
def flag_source(code: str) -> Image.Image:
    """国旗の元の絵（RGBA）。無ければ止める（豆腐や別の国の旗を黙って焼かない）。"""
    path = FLAG_DIR / f"{code.lower()}.png"
    if not path.exists():
        sys.exit(f"国旗の絵が無い: {flag_emoji(code)} {code}（python3 tools/shorts/render/flags.py add {code} で足して、"
                 f"flags/ ごとコミットする）")
    return Image.open(path).convert("RGBA")


def flag_box(code: str, size: float, fl: dict | None = None) -> tuple[float, float]:
    """大きさ size の字の中に置く国旗の (幅, 高さ)（px）。幅は国旗の縦横比のまま（スイスは正方形のまま）。"""
    c = flag_cfg(fl)
    src = flag_source(code)
    h = c["height_em"] * size
    w = min(h * src.width / src.height, c["max_width_em"] * size)
    return w, w * src.height / src.width


def flag_img(code: str, w: float, h: float, c: dict, size: float) -> Image.Image:
    """幅 w・高さ h に縮めて角を丸め、内側に明るい縁を引いた国旗（RGBA）。size は字の大きさ（縁の太さの基準）。

    角の型は4倍で描いて縮める（ギザを出さない）。
    """
    import cv2
    W, H = max(1, round(w)), max(1, round(h))
    img = flag_source(code).resize((W, H), Image.LANCZOS)
    r = c["radius_em"] * H
    if r > 0:
        m = Image.new("L", (W * 4, H * 4), 0)
        ImageDraw.Draw(m).rounded_rectangle([0, 0, W * 4 - 1, H * 4 - 1], radius=r * 4, fill=255)
        m = m.resize((W, H), Image.LANCZOS)
        a = np.minimum(np.asarray(img.getchannel("A")), np.asarray(m))
        img.putalpha(Image.fromarray(a))
    ew = c.get("edge_em", 0) * size
    if ew > 0:
        arr = np.asarray(img, dtype=np.float32)
        al = arr[..., 3] / 255
        # 国旗の形の内側で、輪郭からの距離が ew までの帯（外の地との境目は国旗の濃さのまま）
        inside = cv2.distanceTransform(np.pad((al >= 0.5).astype(np.uint8), 1), cv2.DIST_L2, 5)[1:-1, 1:-1]
        band = np.clip(ew - inside + 0.5, 0, 1) * c.get("edge_alpha", 1.0)
        col = np.asarray(hex_rgba(c.get("edge_color", "#FFFFFF"))[:3], dtype=np.float32)
        arr[..., :3] = arr[..., :3] * (1 - band[..., None]) + col * band[..., None]
        img = Image.fromarray(np.clip(arr, 0, 255).round().astype(np.uint8), "RGBA")
    return img


def split_flags(text: str) -> list[str]:
    """字と国旗に分ける（国旗は1つずつ、字は続くかぎり1つに）。"""
    out, pos = [], 0
    for m in FLAG_RE.finditer(text):
        if m.start() > pos:
            out.append(text[pos:m.start()])
        out.append(m.group(0))
        pos = m.end()
    if pos < len(text):
        out.append(text[pos:])
    return out


def hex_rgba(h: str, alpha: float = 1.0) -> tuple:
    h = h.lstrip("#")
    a = int(h[6:8], 16) / 255 if len(h) == 8 else 1.0
    return (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16), round(alpha * a * 255))


def look_of(st: dict) -> dict:
    """様式の1区画（caption・title など）から look を取り出す（古い書き方も読む）。"""
    lk = dict(st.get("look") or {})
    lk.setdefault("fill", st.get("fill", st.get("color", "#FFFFFF")))
    if "outline" not in lk:
        strokes = lk.pop("strokes", None)
        if strokes is None:
            sw = st.get("stroke", 0)
            strokes = [{"width": sw, "color": st.get("stroke_color", "#000000")}] if sw else []
        # 古い strokes は「字の輪郭から測った太さ」の重ね。細い順に並べて、差を層の幅にする
        acc, out = 0.0, []
        for s in sorted(strokes, key=lambda s: s["width"]):
            if s["width"] > acc:
                out.append({"color": s["color"], "width": s["width"] - acc})
                acc = s["width"]
        lk["outline"] = out
    if "box" not in lk and st.get("bg") and st.get("bg_alpha", 1.0) > 0:
        lk["box"] = {"color": st["bg"], "alpha": st.get("bg_alpha", 1.0), "radius": st.get("radius", 0)}
    lk.setdefault("pad", [st.get("pad_x", 0), st.get("pad_y", 0)])
    lk.setdefault("line_gap", st.get("line_gap", 0))
    if "shadow" not in lk and st.get("shadow_dy"):
        lk["shadow"] = {"dx": 0, "dy": st["shadow_dy"], "alpha": st.get("shadow_alpha", 0.45)}
    if "highlight" not in lk and st.get("highlight_color"):
        lk["highlight"] = {"fill": st["highlight_color"], "scale": st.get("highlight_scale", 1.0)}
    return lk


def layer_widths(lk: dict, size: float) -> list[float]:
    """縁の層ごとの幅（px）。width_em は字の大きさに比例させる（縮めたら縁も細くなる）。"""
    return [float(o["width_em"]) * size if "width_em" in o else float(o.get("width", 0)) for o in lk.get("outline", [])]


def outline_total(lk: dict, size: float) -> float:
    return sum(layer_widths(lk, size))


def margin_of(lk: dict, size: float) -> float:
    """字の輪郭の外に、絵が広がる幅（縁・発光・地・影）。"""
    m = outline_total(lk, size)
    g = lk.get("glow")
    if g:
        m += g["extent_px"] if "extent_px" in g else max(s[0] for s in g["stops"])
    b = lk.get("backing")
    if b:
        m = max(m, outline_total(lk, size) + b.get("extent_px", 0))
    sh = lk.get("shadow")
    if sh:
        m = max(m, outline_total(lk, size) + max(abs(sh.get("dx", 0)), abs(sh.get("dy", 0))) + 2 * sh.get("blur", 0))
    return m


def stroke_width(lk: dict, size: float = 0) -> int:
    """縁の外側までの幅（px、切り上げ）。折り返しの幅の見積もりに使う。"""
    return math.ceil(outline_total(lk, size))


def advance(text: str, font: ImageFont.FreeTypeFont, tracking: float, fl: dict | None = None) -> float:
    """字の送りの合計。国旗は1字として、絵の幅と両側の余白（side_em）で数える。"""
    if not has_flag(text):
        return font.getlength(text) + tracking * font.size * len(text)
    c = flag_cfg(fl)
    total = 0.0
    for seg in split_flags(text):
        if FLAG_RE.fullmatch(seg):
            total += flag_box(flag_code(seg), font.size, c)[0] + 2 * c["side_em"] * font.size + tracking * font.size
        else:
            total += font.getlength(seg) + tracking * font.size * len(seg)
    return total


def text_width(lines: list[str], lk: dict, font: ImageFont.FreeTypeFont) -> float:
    """描いたときの絵の幅の見積もり（字の幅＋外へ広がる幅の両側＋余白）。"""
    tr = lk.get("tracking", 0.0)
    return max(advance(ln, font, tr, lk.get("flag")) for ln in lines) + 2 * margin_of(lk, font.size) \
        + 2 * lk.get("pad", [0, 0])[0]


def _color_stops(fill) -> list[tuple[float, tuple]]:
    if isinstance(fill, str):
        return [(0.0, hex_rgba(fill)), (1.0, hex_rgba(fill))]
    if isinstance(fill, dict):
        return [(float(p), hex_rgba(c)) for p, c in fill["stops"]]
    cols = [hex_rgba(c) for c in fill]
    if len(cols) == 1:
        return [(0.0, cols[0]), (1.0, cols[0])]
    return [(k / (len(cols) - 1), c) for k, c in enumerate(cols)]


def _ramp(stops, u: np.ndarray) -> np.ndarray:
    """0〜1 の位置 u（1次元）ごとの色（RGBA の float）。"""
    ps = np.array([p for p, _ in stops])
    cs = np.array([c for _, c in stops], dtype=np.float64)
    return np.stack([np.interp(u, ps, cs[:, k]) for k in range(4)], axis=-1)


def _noise(shape, scale: float, seed: int) -> np.ndarray:
    """-1〜1 のなめらかな乱れ（種で決まる）。scale は乱れの粒の大きさ（px）。"""
    import cv2
    rng = np.random.default_rng(seed)
    n = rng.standard_normal(shape).astype(np.float32)
    if scale > 0:
        n = cv2.GaussianBlur(n, (0, 0), scale)
    n /= max(float(np.abs(n).max()), 1e-6)
    return n


def text_img(lines: list[str], lk: dict, font: ImageFont.FreeTypeFont, marks: list[list[bool]] | None = None,
             max_width: int | None = None, seed: int = 0) -> Image.Image:
    """行ごとに中央揃えで字を置いた絵（RGBA）。下から 地の箱 → かすれた地 → 影 → 発光 → 縁（外から内へ）→ 塗り。

    marks（字ごとの強調の印）があれば、その字だけ highlight の色と大きさにする。大きくして max_width を
    越える行が出るなら、色だけ変える。
    """
    import cv2
    size = font.size
    path = font.path
    widths = layer_widths(lk, size)
    W_out = sum(widths)
    pad_x, pad_y = lk.get("pad", [0, 0])
    tracking = lk.get("tracking", 0.0)
    marks = marks or [[False] * len(ln) for ln in lines]
    hlk = lk.get("highlight") or {}
    scale = hlk.get("scale", 1.0) if any(any(m) for m in marks) else 1.0
    f1 = ImageFont.truetype(path, size * SS)
    f2 = ImageFont.truetype(path, round(size * scale) * SS) if scale != 1.0 else f1

    def runs(ln, mk, f_big):
        out, k = [], 0
        while k < len(ln):
            j = k
            while j < len(ln) and mk[j] == mk[k]:
                j += 1
            out.append((ln[k:j], f_big if mk[k] else f1, mk[k]))
            k = j
        return out

    fl = flag_cfg(lk.get("flag")) if any(has_flag(ln) for ln in lines) else None

    def measure(f_big):
        rs = [runs(ln, mk, f_big) for ln, mk in zip(lines, marks)]
        return rs, [sum(advance(t, f, tracking, fl) for t, f, _ in r) for r in rs]

    rows, adv = measure(f2)
    m = margin_of(lk, size)
    if f2 is not f1 and max_width and max(adv) / SS > max_width - 2 * pad_x - 2 * m:
        f2 = f1
        rows, adv = measure(f2)
    asc = max(f1.getmetrics()[0], f2.getmetrics()[0])
    desc = max(f1.getmetrics()[1], f2.getmetrics()[1])
    if lk.get("line_pitch_em"):
        pitch = lk["line_pitch_em"] * size * SS
    else:
        pitch = asc + desc + lk.get("line_gap", 0) * SS
    text_w = math.ceil(max(adv))
    text_h = math.ceil((len(lines) - 1) * pitch + asc + desc)
    M = math.ceil(m * SS) + 2
    iw = text_w + 2 * M + 2 * pad_x * SS
    ih = text_h + 2 * M + 2 * pad_y * SS
    fill_m = Image.new("L", (iw, ih), 0)
    hl_m = Image.new("L", (iw, ih), 0)
    df, dh = ImageDraw.Draw(fill_m), ImageDraw.Draw(hl_m)
    bands = []
    flags = []  # 置いた国旗（絵, 左上の x, y）。2倍の細かさの座標
    y = M + pad_y * SS
    for r, a in zip(rows, adv):
        x = M + pad_x * SS + (text_w - a) / 2
        bands.append((y, y + asc + desc))
        for t, f, on in r:
            pieces = list(t) if tracking else [t]
            if fl and has_flag(t):
                # 国旗は地域指示子2つで1つ。1字ずつに割ると旗にならないので、先に字と国旗に分ける
                pieces = [q for seg in split_flags(t)
                          for q in ([seg] if FLAG_RE.fullmatch(seg) or not tracking else list(seg))]
            for pc in pieces:
                if fl and FLAG_RE.fullmatch(pc):
                    code = flag_code(pc)
                    fw, fh = flag_box(code, f.size, fl)
                    im = flag_img(code, fw, fh, fl, f.size)
                    fx = round(x + fl["side_em"] * f.size)
                    fy = round(y + asc - FLAG_CENTER_EM * f.size - im.height / 2)
                    flags.append((im, fx, fy))
                else:
                    (dh if on else df).text((x, y + asc), pc, font=f, anchor="ls", fill=255)
                x += advance(pc, f, tracking, fl)
        y += pitch
    fa = np.asarray(fill_m, dtype=np.float32) / 255
    ha = np.asarray(hl_m, dtype=np.float32) / 255
    glyph = np.maximum(fa, ha)
    if flags:
        # 国旗も字の形として数える（縁・発光・影がその行の字と同じように国旗を囲む）。塗りは国旗の絵で、最後に重ねる
        fm = Image.new("L", (iw, ih), 0)
        for im, fx, fy in flags:
            fm.paste(im.getchannel("A"), (fx, fy))
        glyph = np.maximum(glyph, np.asarray(fm, dtype=np.float32) / 255)
    # 字の形の外側の、輪郭からの距離（1倍の px）。中は 0
    dist = cv2.distanceTransform((glyph < 0.5).astype(np.uint8), cv2.DIST_L2, 5) / SS

    def band_alpha(width_px, rough=None, salt=0):
        w = np.full(dist.shape, width_px, dtype=np.float32)
        if rough:
            w = w + rough.get("amp", 2.0) * _noise(dist.shape, rough.get("scale", 3.0) * SS, seed * 131 + salt)
        a = np.clip((w - dist) * SS + 0.5, 0, 1)
        return np.maximum(a, glyph)

    out = np.zeros((ih, iw, 4), dtype=np.float32)  # 色は 0〜255、濃さは 0〜1（重ね終わるまで別に持つ）

    def over(rgb, alpha):
        """out の上に、色 rgb（(…,3) か (3,)）を濃さ alpha で重ねる。"""
        a = alpha[..., None]
        out[..., :3] = out[..., :3] * (1 - a) + np.asarray(rgb, dtype=np.float32) * a
        out[..., 3] = out[..., 3] * (1 - alpha) + alpha

    bx = lk.get("box")
    if bx:
        box = Image.new("L", (iw, ih), 0)
        ImageDraw.Draw(box).rounded_rectangle([M - 2, M - 2, iw - M + 1, ih - M + 1],
                                              radius=bx.get("radius", 0) * SS, fill=255)
        c = hex_rgba(bx["color"], bx.get("alpha", 1.0))
        over(c[:3], np.asarray(box, dtype=np.float32) / 255 * c[3] / 255)
    bk = lk.get("backing")
    if bk:
        # かすれた地: 輪郭から extent_px まで、外へ行くほど薄く、粒で欠ける（スプレーで吹いたような白）
        ext = float(bk.get("extent_px", 30)) + W_out
        coarse = _noise(dist.shape, 5 * SS, seed * 7 + 1)
        fine = _noise(dist.shape, 0.8 * SS, seed * 7 + 2)
        edge = np.clip(1 - dist / max(ext * 1.8, 1e-6), 0, 1)
        # extent_px あたりまではほぼ白で埋まり、その外 0.8 倍ぶんは粒になって切れる（参考の「しかーし！」の地）
        a = np.clip((edge + bk.get("rough", 0.35) * coarse + 0.25 * fine) * 2.6 - 0.5, 0, 1)
        a = a * (fine > -0.55)
        c = hex_rgba(bk.get("color", "#FFFFFF"))
        over(c[:3], a * c[3] / 255)
    outer = band_alpha(W_out, (lk.get("outline") or [{}])[-1].get("rough"), 99) if W_out > 0 else glyph
    sh = lk.get("shadow")
    if sh:
        a = (outer * sh.get("alpha", 0.45)).astype(np.float32)
        if sh.get("blur"):
            a = cv2.GaussianBlur(a, (0, 0), sh["blur"] * SS)
        M2 = np.float32([[1, 0, sh.get("dx", 0) * SS], [0, 1, sh.get("dy", 0) * SS]])
        a = cv2.warpAffine(a, M2, (iw, ih))
        over(hex_rgba(sh.get("color", "#000000"))[:3], a)
    g = lk.get("glow")
    if g:
        if "stops" in g:
            # 輪郭からの距離ごとの色。最後の色の所まではほぼ不透明、そこから "transparent" の距離で消える
            st = [(float(p), c) for p, c in g["stops"]]
            opaque = [(p, hex_rgba(c)) for p, c in st if c != "transparent"]
            end = max(p for p, c in st if c == "transparent") if any(c == "transparent" for _, c in st) else st[-1][0]
            last = opaque[-1][0]
            d = np.maximum(dist - W_out, 0)
            cols = _ramp([(p, c) for p, c in opaque], np.clip(d, opaque[0][0], last).ravel()).reshape(*d.shape, 4)
            a = np.where(d <= last, 1.0, np.clip(1 - (d - last) / max(end - last, 1e-6), 0, 1)) * cols[..., 3] / 255
            a = np.where(dist <= 0, 1.0, a) * (dist <= end + W_out)
            over(cols[..., :3], a.astype(np.float32) * g.get("alpha", 1.0))
        else:
            d = np.maximum(dist - W_out, 0)
            ext = float(g.get("extent_px", 20))
            half = float(g.get("half_px", ext / 2))
            p = math.log(0.5) / math.log(max(1e-6, 1 - half / ext))
            a = np.power(np.clip(1 - d / ext, 0, 1), p) * g.get("alpha", 1.0)
            over(hex_rgba(g["color"])[:3], a.astype(np.float32))
    # 縁: 外の層から塗り、内の層を上に重ねる
    acc = np.cumsum(widths) if widths else []
    for k in range(len(widths) - 1, -1, -1):
        o = lk["outline"][k]
        a = band_alpha(float(acc[k]), o.get("rough"), k)
        over(hex_rgba(o["color"])[:3], a)
    fb = bands if lk.get("fill_mode", "line") == "line" else [(bands[0][0], bands[-1][1])]
    for mask, fill in ((fa, lk.get("fill", "#FFFFFF")), (ha, hlk.get("fill", lk.get("fill", "#FFFFFF")))):
        if mask.max() <= 0:
            continue
        stops = _color_stops(fill)
        u = np.zeros(ih, dtype=np.float64)
        for a0, b0 in fb:
            ys = np.arange(ih)
            sel = ys >= a0
            u[sel] = np.clip((ys[sel] - a0) / max(1, b0 - a0), 0, 1)
        col = _ramp(stops, u)  # (ih, 4)
        over(col[:, None, :3].repeat(iw, axis=1), mask * (col[:, None, 3] / 255))
    for im, fx, fy in flags:
        fc = Image.new("RGBA", (iw, ih), (0, 0, 0, 0))
        fc.paste(im, (fx, fy))
        a = np.asarray(fc, dtype=np.float32)
        over(a[..., :3], a[..., 3] / 255)
    rgba = np.dstack([np.clip(out[..., :3], 0, 255), np.clip(out[..., 3] * 255, 0, 255)]).round().astype(np.uint8)
    big = Image.fromarray(rgba, "RGBA")
    # 縮めるときは濃さを掛けた色で（縁の外に黒いにじみを出さない）
    small = big.convert("RGBa").resize((math.ceil(iw / SS), math.ceil(ih / SS)), Image.LANCZOS).convert("RGBA")
    return small


# ---------------------------------------------------------------- 出入りの動き

def _out_bounce(u: float) -> float:
    n, d = 7.5625, 2.75
    if u < 1 / d:
        return n * u * u
    if u < 2 / d:
        u -= 1.5 / d
        return n * u * u + 0.75
    if u < 2.5 / d:
        u -= 2.25 / d
        return n * u * u + 0.9375
    u -= 2.625 / d
    return n * u * u + 0.984375


EASES = {
    "linear": lambda u: u,
    "in_quad": lambda u: u * u,
    "out_quad": lambda u: 1 - (1 - u) ** 2,
    "out_cubic": lambda u: 1 - (1 - u) ** 3,
    "in_out_sine": lambda u: 0.5 - 0.5 * math.cos(math.pi * u),
    "out_back": lambda u: 1 + 2.70158 * (u - 1) ** 3 + 1.70158 * (u - 1) ** 2,
    "out_elastic": lambda u: 0.0 if u <= 0 else 1.0 if u >= 1 else
    2 ** (-10 * u) * math.sin((u * 10 - 0.75) * (2 * math.pi / 3)) + 1,
    "out_bounce": _out_bounce,
}
PROPS = ("scale", "alpha", "dx", "dy", "rotate", "sharp")
IDENTITY = {"scale": 1.0, "alpha": 1.0, "dx": 0.0, "dy": 0.0, "rotate": 0.0, "sharp": 1.0}


def anim_frames(spec: dict | None) -> list[dict]:
    """出か入りの1段の、コマごとの状態（scale・alpha・dx・dy・rotate・sharp）。"""
    if not spec:
        return []
    n = int(spec.get("frames", 0))
    if n <= 0:
        return []
    ease = EASES[spec.get("ease", "linear")]
    step = int(spec.get("step", 1))
    out = []
    for k in range(n):
        st = dict(IDENTITY)
        for name in PROPS:
            v = spec.get(name)
            if v is None:
                continue
            if isinstance(v, dict):
                ks = sorted(v["keys"])
                st[name] = float(np.interp(k, [p for p, _ in ks], [q for _, q in ks]))
            elif len(v) == n:
                st[name] = float(v[k])
            elif len(v) == 2:
                u = k / (n - 1) if n > 1 else 1.0
                st[name] = v[0] + (v[1] - v[0]) * ease(u)
            else:
                st[name] = float(v[min(len(v) - 1, round(k * (len(v) - 1) / max(1, n - 1)))])
        out += [st] * (step * (int(spec.get("first_hold", 1)) if k == 0 else 1))
    return out


def text_seed(text: str) -> int:
    """字ごとに決まる乱数の種（同じ字なら毎回同じ揺れ。書き出しが毎回同じになる）。"""
    return zlib.crc32(text.encode("utf-8")) & 0x7FFFFFFF


def shake_at(hold: dict, seed: int, j: int) -> tuple[float, float]:
    """揺れの j コマ目の位置のずれ（標準偏差 sd・最大 max で切る）。update_every コマごとに新しい値。"""
    every = int(hold.get("update_every", 1))
    # 出たコマから first_hold コマは同じ所（字幕の出だしを測る検査は、同じ絵が2コマ続くことで「出た」と読む）
    j = max(0, j - (int(hold.get("first_hold", 1)) - 1))
    rng = np.random.default_rng([seed, j // every])
    dx = float(np.clip(rng.standard_normal() * hold.get("dx_sd", 0), -hold.get("dx_max", 0), hold.get("dx_max", 0)))
    dy = float(np.clip(rng.standard_normal() * hold.get("dy_sd", 0), -hold.get("dy_max", 0), hold.get("dy_max", 0)))
    return dx, dy


def state_at(anim: dict | None, j: int, length: int, starts_at_zero: bool, seed: int = 0) -> dict:
    """出ている間の j コマ目（0 から）の状態。出の動きが先、入りの動きが後（短い字で重なったとき）。"""
    if not anim:
        return IDENTITY
    ins = [] if starts_at_zero else anim_frames(anim.get("in"))
    outs = anim_frames(anim.get("out"))
    st = None
    if j < len(ins):
        st = dict(ins[j])
    else:
        k = j - (length - len(outs))
        if 0 <= k < len(outs):
            st = dict(outs[k])
    st = st or dict(IDENTITY)
    hold = anim.get("hold") or {}
    if hold.get("type") == "shake":
        dx, dy = shake_at(hold, seed, j)
        st["dx"] += dx
        st["dy"] += dy
    return st


def shake_margin(anim: dict | None) -> tuple[float, float]:
    """揺れでいちばん大きく動く幅（置き場に収まるかを見るとき、その分を空ける）。"""
    hold = (anim or {}).get("hold") or {}
    if hold.get("type") != "shake":
        return 0.0, 0.0
    return float(hold.get("dx_max", 0)), float(hold.get("dy_max", 0))


def state_key(st: dict) -> tuple:
    return (round(st["scale"], 4), round(st["alpha"], 3), round(st["dx"]), round(st["dy"]), round(st["rotate"], 2),
            round(st.get("sharp", 1.0), 3))


def look_key(st: dict) -> tuple:
    """絵そのもの（位置のずれを除く）が同じかどうかの鍵。"""
    return (round(st["scale"], 4), round(st["alpha"], 3), round(st["rotate"], 2), round(st.get("sharp", 1.0), 3))


def blur_rgba(img: Image.Image, radius: float) -> Image.Image:
    """濃さを掛けた色でぼかす（透明な所の黒が縁に混ざらない）。"""
    import cv2
    if radius <= 0.05:
        return img
    a = np.asarray(img, dtype=np.float32)
    al = a[..., 3:4] / 255
    pre = np.dstack([a[..., :3] * al, al[..., 0]])
    pad = int(math.ceil(radius * 3))
    pre = cv2.copyMakeBorder(pre, pad, pad, pad, pad, cv2.BORDER_CONSTANT, value=0)
    pre = cv2.GaussianBlur(pre, (0, 0), radius)
    al2 = pre[..., 3:4]
    rgb = np.where(al2 > 1e-4, pre[..., :3] / np.maximum(al2, 1e-4), 0)
    out = np.dstack([np.clip(rgb, 0, 255), np.clip(al2 * 255, 0, 255)]).round().astype(np.uint8)
    return Image.fromarray(out, "RGBA")


def transform(img: Image.Image, st: dict, blur_px_at_015: float = 0.0) -> Image.Image:
    """状態どおりに大きさ・傾き・ぼけ・濃さを変えた絵（真ん中を動かさない前提で、置くのは呼ぶ側）。

    sharp は 1 でくっきり、0.15 で blur_px_at_015 のぼかし（その間は直線で）。
    """
    out = img
    if abs(st["scale"] - 1.0) > 1e-4:
        out = out.resize((max(1, round(img.width * st["scale"])), max(1, round(img.height * st["scale"]))),
                         Image.LANCZOS)
    if abs(st["rotate"]) > 1e-3:
        out = out.rotate(st["rotate"], resample=Image.BICUBIC, expand=True)
    sharp = st.get("sharp", 1.0)
    if sharp < 0.999 and blur_px_at_015 > 0:
        out = blur_rgba(out, (1 - sharp) / 0.85 * blur_px_at_015)
    if st["alpha"] < 0.999:
        a = out.getchannel("A").point(lambda v: round(v * max(0.0, st["alpha"])))
        out = out.copy()
        out.putalpha(a)
    return out


# ---------------------------------------------------------------- 集中線（字ではなく画の効果）

def speedlines(W: int, H: int, cfg: dict, seed: int, j: int) -> Image.Image:
    """画面の外から真ん中へ向かう白い放射線（集中線）。真ん中の楕円の中には入れない。コマごとに引き直す。"""
    every = int(cfg.get("update_every", 1))
    rng = np.random.default_rng([seed, 7919, j // every])
    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    cx, cy = cfg.get("cx", W / 2), cfg.get("cy", H / 2)
    rx, ry = cfg.get("inner_rx", 380), cfg.get("inner_ry", 520)
    R = math.hypot(W, H)
    n = int(cfg.get("count", 64))
    col = hex_rgba(cfg.get("color", "#FFFFFF"), cfg.get("alpha", 0.9))
    w0, w1 = cfg.get("width_px", [2, 9])
    for k in range(n):
        th = (k + rng.uniform(-0.45, 0.45)) * 2 * math.pi / n
        c, s = math.cos(th), math.sin(th)
        # 楕円の縁の距離から、少しずつ外へずらして始める
        r_in = 1 / math.sqrt((c / rx) ** 2 + (s / ry) ** 2) * rng.uniform(1.0, 1.45)
        wid = rng.uniform(w0, w1) * 2 * math.pi / n * R / (2 * math.pi) / 6
        wid = max(w0, min(w1 * 3, wid))
        ang = wid / R
        p_in = (cx + c * r_in, cy + s * r_in)
        p1 = (cx + math.cos(th - ang) * R, cy + math.sin(th - ang) * R)
        p2 = (cx + math.cos(th + ang) * R, cy + math.sin(th + ang) * R)
        d.polygon([p_in, p1, p2], fill=col)
    return img


# ---------------------------------------------------------------- キラキラ（字のまわりの画の効果）

def _star(size: float, color: tuple, glow_px: float, glow_color: tuple | None = None) -> Image.Image:
    """四角い星（4本の細い光と、真ん中の小さな菱形）。2倍で描いて縮める。

    glow_color: まわりの光の色（白い星は明るい地に溶けるので、金色の光で縁取って見えるようにする）。
    """
    s = max(3, int(round(size)))
    big = Image.new("RGBA", (s * 2 * SS, s * 2 * SS), (0, 0, 0, 0))
    d = ImageDraw.Draw(big)
    c = s * SS
    r, w = s * SS * 0.95, max(1.0, s * SS * 0.16)
    d.polygon([(c, c - r), (c + w, c), (c, c + r), (c - w, c)], fill=color)
    d.polygon([(c - r, c), (c, c - w), (c + r, c), (c, c + w)], fill=color)
    q = s * SS * 0.22
    d.polygon([(c, c - q), (c + q, c), (c, c + q), (c - q, c)], fill=color)
    img = big.resize((s * 2, s * 2), Image.LANCZOS)
    if glow_px > 0:
        src = img
        if glow_color is not None:
            src = Image.new("RGBA", img.size, glow_color[:3] + (0,))
            src.putalpha(img.getchannel("A").point(lambda v: round(v * glow_color[3] / 255)))
        halo = blur_rgba(src, glow_px)
        halo = halo.crop(((halo.width - img.width) // 2, (halo.height - img.height) // 2,
                          (halo.width + img.width) // 2, (halo.height + img.height) // 2))
        out = Image.new("RGBA", img.size, (0, 0, 0, 0))
        out.alpha_composite(halo)
        out.alpha_composite(img)
        img = out
    return img


def sparkle_specs(w: int, h: int, cfg: dict, seed: int, core: tuple | None = None) -> list[dict]:
    """粒の並び（置き場・大きさ・色・瞬く周期と位相）。行ごとに同じ種なので、毎回同じ粒になる。

    core = (cx, cy, rx, ry): 字のかたまりの楕円。この中には置かない（字の上に粒が乗ると読みにくい）。
    """
    rng = np.random.default_rng([seed, 4093])
    out = []
    s0, s1 = cfg.get("size_px", [10, 26])
    p0, p1 = cfg.get("period", [12, 24])
    cols = cfg.get("colors", ["#FFFFFF"])
    tries = 0
    while len(out) < int(cfg.get("count", 20)) and tries < 2000:
        tries += 1
        x, y = rng.uniform(0, w), rng.uniform(0, h)
        if core and ((x - core[0]) / max(1, core[2])) ** 2 + ((y - core[1]) / max(1, core[3])) ** 2 < 1:
            continue
        out.append({"x": x, "y": y, "size": rng.uniform(s0, s1), "color": cols[int(rng.integers(len(cols)))],
                    "period": int(rng.integers(p0, p1 + 1)), "phase": rng.uniform(0, 1)})
    return out


def sparkles(w: int, h: int, cfg: dict, specs: list[dict], j: int) -> Image.Image:
    """j コマ目のキラキラ（w×h の透明な絵）。粒ごとに明るさを sin の山で上げ下げし、明るいほど大きく。"""
    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    for sp in specs:
        u = (j / sp["period"] + sp["phase"]) % 1.0
        a = max(0.0, math.sin(2 * math.pi * u)) ** 1.5
        if a < 0.06:
            continue
        gc = hex_rgba(cfg["glow_color"], cfg.get("glow_alpha", 0.9) * a) if cfg.get("glow_color") else None
        st = _star(sp["size"] * (0.45 + 0.55 * a), hex_rgba(sp["color"], a), cfg.get("glow_px", 4) * max(a, 0.5), gc)
        img.alpha_composite(st, (int(round(sp["x"] - st.width / 2)), int(round(sp["y"] - st.height / 2))))
    return img
