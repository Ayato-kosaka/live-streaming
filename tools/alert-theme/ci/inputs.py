"""確かめに使う地（背景）とキャラ絵を、その場で用意する（`run.py prep` が呼ぶ）。

## 地は合成する

本物の配信画面の写真（スクラッチの `bg/prism-*.jpg`）は**本人の顔が写っているので使わない**。
Actions に上げれば公開のログと artifact に出る。代わりに、字の濃さで**いちばん厳しくなる地**を作る:

| 置く名前（`alert-ink.mjs` が読む名前） | 中身 | なぜ |
| --- | --- | --- |
| `prism-street.jpg` | 白 | 明るい字が負ける |
| `prism-face.jpg` | 黒 | 暗い縁取りが効かない |
| `prism-alert-now.jpg` | 明暗の縞 | 1つの字の上で地が白と黒に割れる |
| `prism-alert-fish.jpg` | 中間の灰の雑音 | 明るい字にも暗い字にも、比がいちばん出にくい明るさ |

`alert-ink.mjs` は4つの名前を決め打ちで読む（道具の既定は変えない）ので、名前はそのまま借りて、
中身が何かは `bg.json` に書く（digest はそちらの名前で出す）。録画と一覧の地は `scene.jpg`
（空・街並み・地面を模した絵。人は写らない）。

## キャラ絵は本物を落として、形と画風を散らす

`tools/sprites/avatars.py` が名簿の絵を `/tmp/avatars/<icon>.png` に落とす（runner からは lh3 に届く）。
そこから、中身の外接矩形の縦横比・余白・透明の有無・色の数で**端と真ん中を拾って** 12 人にする
（縦長・横長・余白が多い・余白が無い・地が不透明・色が少ない（ステッカー風）・色が多い（3D 風）…）。
届かなかったら、リポジトリの絵で足して、足りなかったことを `chars.json` の `ok: false` に残す
（digest で ❌ になる。黙って同じ絵で数えない）。
"""

import glob
import json
import os
import shutil

import numpy as np
from PIL import Image, ImageDraw

W, H = 1080, 1920
BG_NAMES = {"street": "白", "face": "黒", "alert-now": "明暗の縞", "alert-fish": "灰の雑音"}


def backgrounds(dst):
    os.makedirs(dst, exist_ok=True)
    rng = np.random.default_rng(1117)
    white = np.full((H, W, 3), 255, np.uint8)
    black = np.zeros((H, W, 3), np.uint8)
    # 縞は 1 本 40px（436 幅の面に cover で敷くと 16px 前後。字の高さより細い）
    y = np.arange(H)[:, None, None]
    stripes = np.where((y // 40) % 2 == 0, 245, 10).astype(np.uint8).repeat(W, 1).repeat(3, 2)
    noise = np.clip(rng.normal(120, 38, (H, W, 1)), 0, 255).astype(np.uint8).repeat(3, 2)
    for name, arr in (("street", white), ("face", black), ("alert-now", stripes), ("alert-fish", noise)):
        Image.fromarray(arr).save(os.path.join(dst, f"prism-{name}.jpg"), quality=95)
    scene(rng).save(os.path.join(dst, "scene.jpg"), quality=90)
    with open(os.path.join(dst, "bg.json"), "w", encoding="utf-8") as f:
        json.dump(BG_NAMES, f, ensure_ascii=False)


def scene(rng):
    """録画の地。夕方の空・建物・地面。色と明るさが場所で変わる（白一色だと透け具合が見えない）"""
    img = Image.new("RGB", (W, H))
    d = ImageDraw.Draw(img)
    for yy in range(H):
        k = yy / H
        d.line([(0, yy), (W, yy)], fill=(int(70 + 150 * k), int(110 + 90 * k), int(190 - 60 * k)))
    x = 0
    while x < W:
        bw = int(rng.integers(90, 220))
        bh = int(rng.integers(500, 1300))
        c = tuple(int(v) for v in rng.integers(40, 200, 3))
        d.rectangle([x, H - 380 - bh, x + bw, H - 380], fill=c)
        for wy in range(H - 380 - bh + 30, H - 420, 70):
            for wx in range(x + 14, x + bw - 30, 46):
                if rng.random() < 0.6:
                    d.rectangle([wx, wy, wx + 22, wy + 34], fill=(255, 230, 150))
        x += bw + int(rng.integers(4, 30))
    d.rectangle([0, H - 380, W, H], fill=(85, 80, 78))
    for i in range(0, W, 120):
        d.rectangle([i, H - 200, i + 60, H - 186], fill=(235, 235, 225))
    return img


def _metrics(path):
    im = Image.open(path)
    im.load()
    rgba = np.asarray(im.convert("RGBA"))
    h, w = rgba.shape[:2]
    a = rgba[..., 3]
    alpha = float((a < 250).mean()) > 0.02
    if alpha:
        mask = a > 8
    else:
        corner = rgba[0, 0, :3].astype(int)
        mask = np.abs(rgba[..., :3].astype(int) - corner).max(-1) > 24
    ys, xs = np.nonzero(mask)
    if len(xs) == 0:
        return None
    bw, bh = int(xs.max() - xs.min() + 1), int(ys.max() - ys.min() + 1)
    px = rgba[mask][:, :3] // 32
    colors = int(len(np.unique(px[:: max(1, len(px) // 40000)], axis=0)))
    return {"w": w, "h": h, "aspect": round(bh / bw, 3), "fill": round(bw * bh / (w * h), 3), "alpha": alpha, "colors": colors}


def characters(src, dst, n=12, fallback=()):
    """src（avatars.py の置き場）から n 人を選んで dst に PNG で置く。選んだ理由と形を chars.json に"""
    os.makedirs(dst, exist_ok=True)
    found = sorted(p for p in glob.glob(os.path.join(src, "*.png")) if os.path.isfile(p))
    items = []
    for p in found:
        try:
            m = _metrics(p)
        except Exception:  # noqa: BLE001 壊れた絵は数えない（落ちた数は got に出る）
            m = None
        if m:
            items.append({"src": p, "id": os.path.splitext(os.path.basename(p))[0], **m})
    got = len(items)
    picks = []

    def take(label, item):
        if item and all(item["src"] != x["src"] for _, x in picks):
            picks.append((label, item))

    if items:
        by = lambda k: sorted(items, key=lambda x: (x[k], x["id"]))  # noqa: E731
        take("tall", by("aspect")[-1])
        take("wide", by("aspect")[0])
        take("pad", by("fill")[0])
        take("full", by("fill")[-1])
        take("opaque", next((x for x in by("aspect") if not x["alpha"]), None))
        take("flat", by("colors")[0])
        take("rich", by("colors")[-1])
        take("big", sorted(items, key=lambda x: (x["w"] * x["h"], x["id"]))[-1])
        # 残りは縦横比の並びから等間隔に（真ん中の形も入れる）
        line = by("aspect")
        k = 0
        while len(picks) < min(n, got) and k < 4 * n:
            take(f"mid{k}", line[int((k * 0.618 % 1) * (len(line) - 1))])
            k += 1
    short = n - len(picks)
    for p in fallback:
        if short <= 0:
            break
        if os.path.exists(p):
            m = _metrics(p)
            if m:
                picks.append((f"repo-{os.path.splitext(os.path.basename(p))[0]}", {"src": p, "id": os.path.basename(p), **m}))
                short -= 1
    out = []
    for i, (label, it) in enumerate(picks, 1):
        name = f"c{i:02d}-{label}"
        Image.open(it["src"]).convert("RGBA").save(os.path.join(dst, f"{name}.png"))
        out.append({"name": name, "id": it["id"], **{k: it[k] for k in ("w", "h", "aspect", "fill", "alpha", "colors")}})
    # 録画と一覧に使う1人: 縦横比がいちばん真ん中の人
    mid = sorted(out, key=lambda x: abs(x["aspect"] - float(np.median([o["aspect"] for o in out]))))[0]["name"] if out else None
    info = {"roster_found": len(found), "got": got, "used": len(out), "ok": got >= 10 and len(out) >= 10, "typical": mid, "chars": out}
    with open(os.path.join(os.path.dirname(dst), "chars.json"), "w", encoding="utf-8") as f:
        json.dump(info, f, ensure_ascii=False, indent=1)
    return info


def clear(path):
    if os.path.isdir(path):
        shutil.rmtree(path)
