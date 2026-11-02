"""「YouTube ライブから切り出した動画」と一目で分かる小さな札（帳面 F-064・制作 #1097）。

あやと（2026-11-02）「YouTubeライブってわかる表紙を上部左寄せに入れたいなぁ。綺麗にいれれる？」。
画面の上・左寄せに、0コマ目から最後まで出す。見た目（`look`）・置き場・大きさは様式の `live_badge` で決まる。

**既定は出さない**（`enabled: false`）。出さない回は `config` が None を返し、書き出しはここを1つも通らない
（時間割にも何も足さない）。だから札を入れる前の回は、書き出しが1バイトも変わらない。

## 置き場（README の「YouTube ライブの札」に測った表）

- 上: y=372。YouTube の上のチップ（「登録チャンネル」「ライブ」「急上昇」）の下端が y=355
  （あやとのスマホのスクショを、透かしの位置で 1080x1920 に合わせて測った）。安全領域の上 360 から 12px 下げる
- 左: x=120（安全領域の左。TikTok の広告の型紙の左 120・YouTube は縦長の画面で左右 47px が切れる）
- 上の置き場は、題の札（y 380〜）と左上の注（x 120・y 400）が使っていた。札を出す回は、
  **題の札・全編のタイトル・左上の注を、札の下（札の下端＋gap）へ下げる**（`make_room`）。
  題の札の下端の限り（380+456=836。下の字幕と右のボタン列 y≥840 に掛けない）は動かさないので、
  下げたぶん `max_height` を縮める（長い題は字が少し小さくなる。札と題を重ねるより、題を詰めるほうを取った）
- 字幕・【大】の字の上端の限りと、テロップの置き場の上端も、札の下にする（`render.py` の `top_limit`・layout）

## 見た目

様式の `looks` に、左から並べる「区画」（`segments`）で書く。区画ごとに地の色と、中に並べるもの
（`text`・`dot`・`play`）。地のある区画を並べたものは、外側の端を半円に丸めた1枚の札になる。
3倍の大きさで描いて縮める（丸・三角の縁と字のにじみを揃える）。動かさない（品質チェックが
どのコマでも同じ絵として探せる。目立ちすぎないように、点滅もしない）。

YouTube の公式のロゴ（赤い角丸の再生ボタン・YouTube の字のロゴ）は使わない。ブランドの決まり
（YouTube Brand Resources）では、ロゴとアイコンの使い道はどれも申請（Brand Use Request Form）して
承認を取るもので、改変も禁じている。ここにあるのは、こちらで描いた丸・三角と、様式の書体の字だけ。
"""
from __future__ import annotations

import copy
import math
import sys
from pathlib import Path
from typing import Callable

from PIL import Image, ImageDraw, ImageFont

SS = 3                       # 何倍で描いて縮めるか
REF = "ライブLIVEYouTube配信"  # 字の縦の真ん中を決める見本（仮名と英字の両方の高さを入れる）


def config(style: dict) -> dict | None:
    """様式の live_badge を、選んだ見た目（look）と合わせて返す。出さない回は None。"""
    lb = style.get("live_badge") or {}
    if not lb.get("enabled"):
        return None
    looks = lb.get("looks") or {}
    name = lb.get("look")
    if name not in looks:
        sys.exit(f"live_badge の look「{name}」が looks に無い（{', '.join(looks)}）")
    cfg = {k: v for k, v in lb.items() if k not in ("looks",) and not k.startswith("_")}
    cfg["spec"] = looks[name]
    return cfg


def hex_rgba(h: str, alpha: float = 1.0) -> tuple:
    h = h.lstrip("#")
    return (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16), round(alpha * 255))


def _font(font_for: Callable[[str], Path], key: str, px: float) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(str(font_for(key)), max(1, round(px)))


def _item_w(it: dict, k: float, font_for) -> float:
    """並べるもの1つの幅（k 倍の画素）。"""
    if "text" in it:
        f = _font(font_for, it.get("font", "caption"), it["size"] * k)
        tr = it.get("tracking", 0) * it["size"] * k
        w = sum(f.getlength(ch) for ch in it["text"]) + tr * max(0, len(it["text"]) - 1)
        return w + 2 * it.get("outline", {}).get("width", 0) * k
    if "dot" in it:
        d = it["dot"]
        return max(d["d"], (d.get("ring") or {}).get("d", 0)) * k
    if "play" in it:
        p = it["play"]
        return (p["w"] + 2 * (p.get("outline") or {}).get("width", 0)) * k
    raise ValueError(f"live_badge の並べるものが分からない: {it}")


def _draw_item(img: Image.Image, it: dict, x: float, H: float, k: float, font_for) -> None:
    dr = ImageDraw.Draw(img)
    cy = H / 2
    if "text" in it:
        size = it["size"] * k
        f = _font(font_for, it.get("font", "caption"), size)
        ow = it.get("outline", {}).get("width", 0) * k
        # 縦は見本の字のかたまりの真ん中を札の真ん中に（区画ごとに大きさが違っても、目の高さが揃う）
        t, b = f.getbbox(REF)[1], f.getbbox(REF)[3]
        y = cy - (t + b) / 2 + it.get("dy", 0) * k
        tr = it.get("tracking", 0) * size
        cx = x + ow
        for ch in it["text"]:
            dr.text((cx, y), ch, font=f, fill=hex_rgba(it["color"]),
                    stroke_width=round(ow), stroke_fill=hex_rgba(it["outline"]["color"]) if ow else None)
            cx += f.getlength(ch) + tr
    elif "dot" in it:
        d = it["dot"]
        w = _item_w(it, k, font_for)
        ccx = x + w / 2
        ring = d.get("ring")
        if ring:
            r = ring["d"] * k / 2
            dr.ellipse([ccx - r, cy - r, ccx + r, cy + r], fill=hex_rgba(ring["color"], ring.get("alpha", 1.0)))
        r = d["d"] * k / 2
        dr.ellipse([ccx - r, cy - r, ccx + r, cy + r], fill=hex_rgba(d["color"]))
    elif "play" in it:
        p = it["play"]
        ow = (p.get("outline") or {}).get("width", 0) * k
        w, h = p["w"] * k, p["h"] * k
        x0 = x + ow
        # 角の丸い三角（再生の印）。公式のロゴの角丸の四角は描かない。角は、細らせた三角に太い線を
        # 丸い継ぎ目で引いて丸める（縁の色 → 中の色の順に、同じ形を太さを変えて2回）
        rr = p.get("round", 0.12) * h
        tri = [(x0 + rr, cy - h / 2 + rr * 1.3), (x0 + w - rr * 1.2, cy), (x0 + rr, cy + h / 2 - rr * 1.3)]
        if ow:
            dr.polygon(tri, fill=hex_rgba(p["outline"]["color"]))
            dr.line(tri + [tri[0]], fill=hex_rgba(p["outline"]["color"]), width=round(2 * (rr + ow)), joint="curve")
            for q in tri:
                dr.ellipse([q[0] - rr - ow, q[1] - rr - ow, q[0] + rr + ow, q[1] + rr + ow],
                           fill=hex_rgba(p["outline"]["color"]))
        dr.polygon(tri, fill=hex_rgba(p["color"]))
        dr.line(tri + [tri[0]], fill=hex_rgba(p["color"]), width=round(2 * rr), joint="curve")
        for q in tri:
            dr.ellipse([q[0] - rr, q[1] - rr, q[0] + rr, q[1] + rr], fill=hex_rgba(p["color"]))


def badge_img(cfg: dict, font_for: Callable[[str], Path]) -> Image.Image:
    """札の絵（RGBA。左上が置き場の (x, y)）。大きさは様式の scale 倍。"""
    spec = cfg["spec"]
    sc = float(cfg.get("scale", 1.0))
    k = SS * sc
    H = float(spec.get("height", cfg.get("height", 56))) * k
    segs = spec["segments"]
    gap = spec.get("gap", 10) * k
    widths = []
    for sg in segs:
        pl, pr = sg.get("pad", [18, 18])
        its = sg["items"]
        w = pl * k + pr * k + sum(_item_w(it, k, font_for) for it in its) + sg.get("gap", spec.get("gap", 10)) * k * max(0, len(its) - 1)
        widths.append(w)
    del gap
    Wt = sum(widths)
    W3 = int(math.ceil(Wt / SS)) * SS
    H3 = int(math.ceil(H / SS)) * SS
    img = Image.new("RGBA", (W3, H3), (0, 0, 0, 0))
    # 地: 区画ごとの色を並べ、外側の端を丸めた札の形で切る
    if any(sg.get("bg") for sg in segs):
        ground = Image.new("RGBA", (W3, H3), (0, 0, 0, 0))
        dg = ImageDraw.Draw(ground)
        x = 0.0
        for sg, w in zip(segs, widths):
            if sg.get("bg"):
                dg.rectangle([round(x), 0, round(x + w), H3], fill=hex_rgba(sg["bg"], sg.get("bg_alpha", 1.0)))
            x += w
        mask = Image.new("L", (W3, H3), 0)
        rad = spec.get("radius", H3 / 2 / k) * k
        ImageDraw.Draw(mask).rounded_rectangle([0, 0, W3 - 1, H3 - 1], radius=round(rad), fill=255)
        a = ground.getchannel("A")
        from PIL import ImageChops
        ground.putalpha(ImageChops.multiply(a, mask))
        img.alpha_composite(ground)
    x = 0.0
    for sg, w in zip(segs, widths):
        cx = x + sg.get("pad", [18, 18])[0] * k
        for it in sg["items"]:
            _draw_item(img, it, cx, H3, k, font_for)
            cx += _item_w(it, k, font_for) + sg.get("gap", spec.get("gap", 10)) * k
        x += w
    return img.resize((W3 // SS, H3 // SS), Image.LANCZOS)


def make_room(style: dict, bottom: int, right: int) -> tuple[dict, dict]:
    """札の下端（＋gap）より上に掛かる、上の置き場の部品を下げた様式の写しと、動かしたものの控え。

    - 題の札（title_card）・全編のタイトル（title）: top を bottom へ。題の札は下端の限り（top + max_height）を
      動かさないよう、下げたぶん max_height を縮める（下の字幕・右のボタン列に掛けない限りは変えない）
    - 左上の注（note。終わりの札も同じ置き場）: 札と横に重なる（x が札の右端より左）なら y を bottom へ
    """
    st = copy.deepcopy(style)
    moved = {}
    for key in ("title_card", "title"):
        s = st.get(key)
        if s and s.get("top", 0) < bottom:
            d = bottom - s["top"]
            moved[f"{key}.top"] = [s["top"], bottom]
            s["top"] = bottom
            if s.get("max_height"):
                moved[f"{key}.max_height"] = [s["max_height"], s["max_height"] - d]
                s["max_height"] -= d
    nt = st.get("note")
    if nt and nt.get("y", 0) < bottom and nt.get("x", 0) < right:
        moved["note.y"] = [nt["y"], bottom]
        nt["y"] = bottom
    return st, moved


def place(style: dict, frames: int, font_for: Callable[[str], Path], work: Path) -> tuple[dict, Image.Image, dict] | None:
    """札を置く。出さない回は None（様式も時間割も触らない）。

    返すのは (時間割に残す札の控え, 札の絵, 上の置き場を空けた様式)。
    """
    cfg = config(style)
    if cfg is None:
        return None
    img = badge_img(cfg, font_for)
    x, y = int(cfg.get("x", 120)), int(cfg.get("y", 372))
    gap = int(cfg.get("gap", 16))
    st2, moved = make_room(style, y + img.height + gap, x + img.width)
    path = work / "live_badge.png"
    img.save(path)
    item = {"look": cfg["look"], "text": cfg["spec"].get("text", ""), "png": str(path),
            "x": x, "y": y, "w": img.width, "h": img.height, "from": 0, "to": frames,
            "gap": gap, "made_room": moved}
    return item, img, st2
