#!/usr/bin/env python3
"""1万円の段（段7）: Blender が描いた層を重ねて、full / light の2通りの透明つき WebM にする。

    python3 tools/alert-theme/blender/t7_pack.py compose <描いた絵の置き場> <作業の置き場>
    python3 tools/alert-theme/blender/t7_pack.py encode  <作業の置き場> <書き出し先>      # t7-*.webm と manifest-t7.json
    python3 tools/alert-theme/blender/t7_pack.py sheet   <作業の置き場> <一覧.jpg> [--bg <配信画面.jpg>]
    python3 tools/alert-theme/blender/t7_pack.py check   <書き出し先> [--work <作業の置き場>]  # 秒・大きさ・継ぎ目（本の境目も）・顔の穴・透明の差
    python3 tools/alert-theme/blender/t7_pack.py demo    <書き出し先> --bg <配信画面.jpg> --char <キャラ絵.png> --out <録画.mp4>
    python3 tools/alert-theme/blender/t7_pack.py install <書き出し先> public/alert/themes/castle/fx   # 動画を置き、manifest.json の段7だけ書く

`check` の終了コード: 0 = 約束どおり / 1 = 外れている所が在る / 2 = 数えられなかった（動画が無い・読めない）

## 層（Blender の view layer がそのまま動画の層）
- back = 空・城・あやと（`castle_t7.py`）。front = 前の粒
- Blender の色は「黒の上に重ねた色」（光のにじみ込み）。透明は物の透明だけなので、
  にじみの所は **色の明るさを透明にする**（`A = max(物の透明, 色のいちばん明るい成分 × GLOW_ALPHA)`、色は `C / A`）。
  暗い配信の上では光が足し算に近く乗り、明るい配信の上でも白く溶けない
- 箱の縁で 0 に溶かす（`EDGE`。四角い暗い箱を浮かせない）
- front は、投げた人のキャラ絵の顔のあたりに穴（`FACE`）。キャラごとの顔の位置は再生の側が持つので、ここは広めに

## full と light（`scratchpad/novfx/CONTRACT.md`）
- full … 叩き台どおり。城が画面いっぱいのまま滞在する
- light … 門の光からキャラ絵が出たら（`REVEAL`）、城と夜空が 0.9 秒で金の光の線になって消え、右上の満月と塔の先
  （紋章のように）・あやと・前の粒（縁のきらめき）だけ残す。2026-11-04 の試しで「左右と下の帯を残す」にしたら、
  城に四角い穴が開いたように見えたのでやめた。あやとの形は、振付け（`t7_motion.pose`）の板の位置から作る（`ayato_mask`。Blender で別に描くと、
  城をもう1回組み立てることになって1コマの秒が倍になる）。締めで城が貯金箱へ縮むときに、また見える。**登場までは full と同じ**（あやとの意見「キャラが出たら薄く」）
"""
import argparse
import glob
import json
import math
import os
import subprocess
import sys
from concurrent.futures import ProcessPoolExecutor

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import t7_motion as MO  # noqa: E402
import t7_plan as P  # noqa: E402

W, H = P.W, P.H
ROOT = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
LAYERS = ("back", "front")
VARIANTS = ("full", "light")
GLOW_ALPHA = 1.0


# ---------------------------------------------------------------- 形の決まった面（マスク）
def smoothstep(a, b, x):
    t = np.clip((x - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)


def masks():
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    side = np.minimum(xx, W - 1 - xx)
    edge = smoothstep(0, 0.07 * W, side) * smoothstep(0, 0.035 * H, yy) * smoothstep(0, 0.03 * H, H - 1 - yy)
    d = np.sqrt(((xx - 360) / 195) ** 2 + ((yy - 600) / 185) ** 2)
    face = smoothstep(1.0, 1.4, d)
    # light の版で残す所: 満月と、その前の高い塔の先（右上の紋章のように）
    dm = np.hypot(xx - 512, yy - 200)
    moon = 0.9 * (1 - smoothstep(140, 260, dm))
    return dict(edge=edge, face=face, moon=moon)


def ease_io(x):
    x = min(1.0, max(0.0, x))
    return 0.5 - 0.5 * math.cos(math.pi * x)


def ramp(t, a, b):
    return min(1.0, max(0.0, (t - a) / (b - a)))


def _rot_xyz(rx, ry, rz):
    """Blender の Euler XYZ（X → Y → Z の順に回す）"""
    cx, sx, cy, sy, cz, sz = math.cos(rx), math.sin(rx), math.cos(ry), math.sin(ry), math.cos(rz), math.sin(rz)
    Rx = np.array([[1, 0, 0], [0, cx, -sx], [0, sx, cx]])
    Ry = np.array([[cy, 0, sy], [0, 1, 0], [-sy, 0, cy]])
    Rz = np.array([[cz, -sz, 0], [sz, cz, 0], [0, 0, 1]])
    return Rz @ Ry @ Rx


def _persp_coeffs(dst, src):
    """PIL の PERSPECTIVE 用: 出来上がり（画面）の点 dst → 元の絵の点 src に写す8つの数"""
    A, b = [], []
    for (x, y), (u, v) in zip(dst, src):
        A.append([x, y, 1, 0, 0, 0, -u * x, -u * y])
        A.append([0, 0, 0, x, y, 1, -v * x, -v * y])
        b += [u, v]
    return np.linalg.solve(np.array(A, float), np.array(b, float)).tolist()


_AY = {}
# light の版のあやとの形は、絵の半分の大きさで作る（画面のあやとは幅 300px ほど。絵は 1239px あって細かすぎる）
AY_DOWN = 2


def _bilinear(img, sx, sy):
    h, w = img.shape
    x0 = np.clip(np.floor(sx).astype(np.int32), 0, w - 2)
    y0 = np.clip(np.floor(sy).astype(np.int32), 0, h - 2)
    fx, fy = np.clip(sx - x0, 0, 1), np.clip(sy - y0, 0, 1)
    a = img[y0, x0] * (1 - fx) + img[y0, x0 + 1] * fx
    b = img[y0 + 1, x0] * (1 - fx) + img[y0 + 1, x0 + 1] * fx
    return a * (1 - fy) + b * fy


# 形が動いて絵の四角の外へ出る分の余白（絵の px・元の大きさで）。マントが開くと裾が外へ 70px ほど出る
AY_PAD = 96


def warp_board(al, name, vals, down=1, pad=0):
    """板の形の動き（面の中の dx, dy）を、絵の透明に当てる。t7_motion.deform_px と同じ式（Blender のシェイプキーと同じ形）。
    動いた先の画素は、元の p - d(p) から取る（動きは絵の数 % なので、逆写像の近似で足りる）。
    al は周りに pad（縮めた後の px）の余白を足した絵。Blender の板は格子ごと外へ動くので、ここでも四角の外へ出す"""
    if not any(abs(v) > 1e-6 for v in vals.values()):
        return al
    h, w = al.shape
    g = 48
    xs, ys = np.linspace(0, w - 1, g), np.linspace(0, h - 1, g)
    DX = np.zeros((g, g), np.float32)
    DY = np.zeros((g, g), np.float32)
    for j, y in enumerate(ys):
        for i, x in enumerate(xs):
            dx, dy, _ = MO.board_offset_px(name, vals, (x - pad) * down, (y - pad) * down)
            DX[j, i], DY[j, i] = dx / down, dy / down
    DX = np.asarray(Image.fromarray(DX, "F").resize((w, h), Image.BILINEAR))
    DY = np.asarray(Image.fromarray(DY, "F").resize((w, h), Image.BILINEAR))
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    return _bilinear(al, xx - DX, yy - DY).astype(np.float32)


def ayato_mask(clip, t):
    """そのコマで、あやとの絵が画面のどこを覆うか（0〜1）。Blender の板と同じ寸法・同じカメラの式で写す。
    縦と横の大きさが別のとき（降り立つときのつぶれ）と、マントのはためき（シェイプキー）も同じに当てる"""
    p = MO.pose(clip, t)
    out = np.zeros((H, W), np.float32)
    cam = p["obj:cam:loc"]
    lens = p["cam:lens"]
    for name in MO.AYATO_POSES:
        op = p[f"val:{name}_op"]
        if op <= 0:
            continue
        if name not in _AY:
            im = Image.open(os.path.join(ROOT, MO.AYATO_POSES[name]["file"])).convert("RGBA").split()[3]
            im = im.resize((im.width // AY_DOWN, im.height // AY_DOWN), Image.LANCZOS)
            _AY[name] = np.pad(np.asarray(im).astype(np.float32) / 255, AY_PAD // AY_DOWN)
        al = warp_board(_AY[name], name, MO.board_vals(p, name), AY_DOWN, AY_PAD // AY_DOWN)
        ah, aw = al.shape
        w, h, ox, oz = MO.ayato_plane(name)
        # 余白のぶん、板の四角を広げる（m）
        pm = (AY_PAD // AY_DOWN) * AY_DOWN * MO.AYATO_M_PER_PX
        w, h, ox, oz = w + 2 * pm, h + 2 * pm, ox + pm, oz + pm
        sv = p[f"obj:{name}:scale"]
        sv = sv if isinstance(sv, tuple) else (sv, sv, sv)
        R = _rot_xyz(*p[f"obj:{name}:rot"])
        loc = np.array(p[f"obj:{name}:loc"])
        local = [(-ox, -oz), (w - ox, -oz), (w - ox, h - oz), (-ox, h - oz)]
        src = [(0, ah), (aw, ah), (aw, 0), (0, 0)]
        dst = []
        for lx, ly in local:
            q = loc + R @ np.array([lx * sv[0], ly * sv[1], 0.0])
            sx, sy, _ = P.project(tuple(q), cam, lens)
            dst.append((sx, sy))
        img = Image.fromarray((np.clip(al, 0, 1) * 255).astype(np.uint8), "L")
        m = img.transform((W, H), Image.PERSPECTIVE, _persp_coeffs(dst, src), Image.BILINEAR)
        out = np.maximum(out, np.asarray(m).astype(np.float32) / 255 * op)
    return out


def gold_lines(layer, amt):
    """絵の明るさの縁を、金の光の線にする（足し算に近い層）。amt は 0〜1（場所ごとでもよい）"""
    C, _ = layer
    lum = C @ np.array([0.3, 0.59, 0.11], np.float32)
    gy, gx = np.gradient(lum)
    e = np.clip((np.hypot(gx, gy) - 0.022) * 10, 0, 1)
    e = np.asarray(Image.fromarray((e * 255).astype(np.uint8), "L").filter(ImageFilter.GaussianBlur(0.8))).astype(np.float32) / 255
    a = np.clip(e * 1.3, 0, 1) * amt
    gold = np.array([1.0, 0.8, 0.42], np.float32)
    return a[..., None] * gold, a


def light_weight(clip, t):
    """light の版の薄さ（0 = full と同じ / 1 = 縁だけ）"""
    if clip == "intro":
        return ease_io(ramp(t, P.REVEAL, P.REVEAL + 0.9))
    if clip == "stay":
        return 1.0
    return 1 - ease_io(ramp(t, 0.15, 0.7))


# ---------------------------------------------------------------- 描いた絵を読む
def index_raw(raw):
    """{(本, コマ): {"dir": 置き場, "frame": Blender のコマ, "enc": 透明の入れ方}}"""
    out = {}

    def run_of(path):
        # raw/<run>/<artifact>/meta.json。あとの run（描き直し）の絵が、前の run の同じコマに勝つように順に読む
        parts = os.path.relpath(path, raw).split(os.sep)
        return (int(parts[0]) if parts[0].isdigit() else 0, path)
    for meta in sorted(glob.glob(os.path.join(raw, "**", "meta.json"), recursive=True), key=run_of):
        m = json.load(open(meta))
        d = os.path.dirname(meta)
        for f in m["frames"]:
            out[(f["clip"], f["i"])] = {"dir": d, "frame": f["frame"], "enc": m.get("alpha_encoding", "raw"), "sec": f["sec"]}
    return out


def srgb_to_lin(v):
    return np.where(v <= 0.04045, v / 12.92, ((v + 0.055) / 1.055) ** 2.4)


def read_layer(rec, layer):
    d, f = rec["dir"], rec["frame"]
    c = Image.open(os.path.join(d, layer, f"c_{f:04d}.png")).convert("RGB")
    a = Image.open(os.path.join(d, layer, f"a_{f:04d}.png"))
    a = np.asarray(a).astype(np.float32)
    a = a / (65535.0 if a.max() > 255.5 else 255.0)
    if rec["enc"] != "raw":
        a = srgb_to_lin(a)
    if c.size != (W, H):
        c = c.resize((W, H), Image.LANCZOS)
        a = np.asarray(Image.fromarray(a, "F").resize((W, H), Image.LANCZOS))
    C = np.asarray(c).astype(np.float32) / 255.0
    return C, np.clip(a, 0, 1)


def over(top, bot):
    Ct, At = top
    Cb, Ab = bot
    k = (1 - At)[..., None]
    return Ct + k * Cb, At + (1 - At) * Ab


def scale(layer, m):
    C, A = layer
    return C * m[..., None], A * m


# ごくかすかな透明を 0 に落とす境と、色を平らにする透明の幅（層ごと。0〜1）。
# back は城の縁の溶け（EDGE）にも掛かるので幅を狭く。front は金の粒だけで、平らにする色もほぼ同じ金
FAINT = {"back": 1 / 255, "front": 2 / 255}
FLAT_A = {"back": 0.06, "front": 0.12}


def straight(layer, faint=0.0, flat=0.0):
    """黒の上に重ねた色 → 色と透明（straight）。焼く動画を小さくするため、見えない所を整える

    - 透明が `faint` 以下の所は 0 にする（光のにじみの裾。見えないのに、画面の6割に透明 1〜2/255 が広がっていた）
    - 透明がかすかな所（`flat` まで）の色は、そのコマの見えている所の平均の色に寄せて平らにする。
      `C / A` は透明がかすかな所でも明るい色相のまま広がるので、見えない所の色に符号量を払っていた。
      2026-11-04 の final で、front の intro が同じ焼き方のまま 4,199KB → 1,221KB（見た目の差は最大 7.9/255）
    """
    C, A = layer
    A = np.maximum(A, np.clip(C.max(axis=2) * GLOW_ALPHA, 0, 1))
    S = np.clip(C / np.maximum(A, 1e-4)[..., None], 0, 1)
    if faint > 0:
        A = np.clip((A - faint) / (1 - faint), 0, 1)
    if flat > 0:
        vis = A > 0.2
        base = S[vis].mean(axis=0) if vis.any() else np.array([1.0, 0.84, 0.55], np.float32)
        w = smoothstep(0.0, flat, A)[..., None]
        S = S * w + base * (1 - w)
    return np.dstack([S, A])


def save_rgba(rgba, path):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    Image.fromarray((np.clip(rgba, 0, 1) * 255 + 0.5).astype(np.uint8), "RGBA").save(path, compress_level=1)


_M = None


def _compose_one(job):
    global _M
    if _M is None:
        _M = masks()
    (clip, i), rec, work = job
    t = P.clip_time(clip, i)
    L = {name: read_layer(rec, name) for name in LAYERS}
    wl = light_weight(clip, t)
    ay = ayato_mask(clip, t) if wl > 0 else None
    for v in VARIANTS:
        w = wl if v == "light" else 0.0
        keep = _M["moon"] if ay is None else np.maximum(_M["moon"], ay)
        back = scale(L["back"], _M["edge"] * (1 - w + w * keep))
        if 0.0 < w < 1.0:
            # 薄くなる途中だけ、城が金の光の線になって消える（あやとの「光の線で描いて、キャラが出たら薄く」）
            back = over(gold_lines(L["back"], math.sin(math.pi * w) ** 1.2 * (1 - keep)), back)
        front = scale(L["front"], _M["edge"] * _M["face"] * (1 - 0.3 * w))
        save_rgba(straight(back, FAINT["back"], FLAT_A["back"]), os.path.join(work, v, "back", clip, f"{i:04d}.png"))
        save_rgba(straight(front, FAINT["front"], FLAT_A["front"]), os.path.join(work, v, "front", clip, f"{i:04d}.png"))
    return clip, i


def compose(raw, work, jobs=4):
    idx = index_raw(raw)
    if not idx:
        print("描いた絵が無い", file=sys.stderr)
        return 2
    todo = [((c, i), rec, work) for (c, i), rec in sorted(idx.items())]
    with ProcessPoolExecutor(jobs) as ex:
        for k, _ in enumerate(ex.map(_compose_one, todo, chunksize=4)):
            if k % 30 == 0:
                print(f"  重ねた {k + 1}/{len(todo)}", flush=True)
    secs = sorted(r["sec"] for r in idx.values())
    json.dump({"frames": len(idx), "sec_median": secs[len(secs) // 2], "sec_max": secs[-1],
               "have": {c: sorted(i for (cc, i) in idx if cc == c) for c in P.CLIPS}},
              open(os.path.join(work, "frames.json"), "w"), ensure_ascii=False)
    print(f"重ねた: {len(idx)} コマ（1コマ 中央値 {secs[len(secs) // 2]:.1f} 秒・最長 {secs[-1]:.1f} 秒）")
    return 0


# ---------------------------------------------------------------- 動画にする
# 1本ごとの大きさの予算（KB）。1通り（full / light）の6本で 5,270KB ≒ 5.4MB。約束の 6MB に余裕を残す。
# 2026-11-04 の final は「-b:v＋-crf 10」で焼き、-b:v の目標を無視して full 15.1MB・light 16.1MB になった
# （透明の流れが色と同じ率で別に焼かれるので、実の大きさは -b:v の 1.5〜2 倍に出る）。率ではなく大きさで決める
BUDGET_KB = {("back", "intro"): 2600, ("back", "stay"): 900, ("back", "outro"): 550,
             ("front", "intro"): 750, ("front", "stay"): 330, ("front", "outro"): 140}
# 予算から -b:v を出すときの、実の大きさ ÷ 名目（-b:v × 秒）の見込み。外れたら焼き直しで合わせる
# （2026-11-04 の run 41790472318 で 1.9〜2.2 倍だった）
OVERSHOOT = 2.0
# 率の限り（kbps）。上げ下げは1回につき2倍まで
KBPS = (40, 8000)
# 画質の上限と下限（VP8 の量子化の段。小さいほど良い）。
# **率に -maxrate / -bufsize の枠を付けない。** 付けると、絵を丸ごと描き直すキーフレームに符号量が回らず、
# 2秒おきにレンガの模様が消えて窓の色までずれた（run 41790472318。PSNR がキーフレームで 3〜4dB 落ちる）。
# 上限（QMIN）も決めるのは、頭のコマだけ飛び抜けて良く焼かれ、輪の継ぎ目で「くっきり → ぼやけ」が毎回出るのを防ぐため。
# back は、率で決まるふだんの画質（PSNR 31〜33dB）に近い 32。26 だと stay の頭が尻より 3.8dB 良く、3秒ごとに城がくっきりした
# （run 41794553426）。front は光の粒だけで軽いので 10。粗く焼くと、締めの最後のコマに透明 8/255 が残った。
# back の締めも 32 だと最後のコマに透明 7/255 が残った（run 41796475424）。締めは1回しか流れず、輪の頭の跳ねが無いので 16
QMIN = {("back", "intro"): 32, ("back", "stay"): 32, ("back", "outro"): 16,
        ("front", "intro"): 10, ("front", "stay"): 10, ("front", "outro"): 10}
QMAX = (50, 56, 60)


def ff(*args):
    subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", *args], check=True)


def name_of(v, layer, clip):
    return f"t7-{v}-{layer}-{clip}.webm"


def _encode_one(src, p, kbps, qmin, qmax):
    # 透明は別の VP8 の流れ。キーフレームを2秒おきに固定して色とそろえる（PR #1089 の頭出しの崩れ）
    ff("-framerate", str(P.FPS), "-i", os.path.join(src, "%04d.png"), "-vf", "format=yuva420p",
       "-c:v", "libvpx", "-pix_fmt", "yuva420p", "-auto-alt-ref", "0", "-b:v", f"{kbps}k",
       "-crf", str(qmin), "-qmin", str(qmin), "-qmax", str(qmax), "-deadline", "good", "-cpu-used", "0",
       "-g", str(P.FPS * 2), "-keyint_min", str(P.FPS * 2), "-force_key_frames", "expr:gte(t,n_forced*2)", "-an", p)
    return os.path.getsize(p) / 1024


def _encode_budget(job):
    """予算の大きさに収まるまで、率を直して焼き直す（5回まで）。予算の 88% を切ったら、上げて焼き直す。
    率を下げても縮まなくなったら（画質の下限 QMAX に当たっている）、下限を1段ゆるめる"""
    src, p, layer, clip, n = job
    budget = BUDGET_KB[(layer, clip)]
    kbps = min(KBPS[1], max(KBPS[0], int(budget * 8.192 / (n / P.FPS) / OVERSHOOT)))
    qi = 0
    tries = []
    for _ in range(5):
        kb = _encode_one(src, p, kbps, QMIN[(layer, clip)], QMAX[qi])
        tries.append((kbps, QMAX[qi], round(kb)))
        if 0.88 * budget <= kb <= budget:
            break
        if kb > budget and len(tries) >= 2 and tries[-2][1] == QMAX[qi] and tries[-2][2] - kb < 0.03 * kb and qi + 1 < len(QMAX):
            qi += 1
            continue
        nxt = min(KBPS[1], max(KBPS[0], int(kbps * min(2.0, max(0.5, budget / kb * 0.96)))))
        if nxt == kbps:
            break
        kbps = nxt
    if kb > budget:
        # 最後が予算を超えたら、いちばん大きかった予算内の焼き方で焼き直す（無ければ、そのまま。check が合計で落とす）
        ok = [t for t in tries if t[2] <= budget]
        if ok:
            kbps, qmax, _ = max(ok, key=lambda t: t[2])
            kb = _encode_one(src, p, kbps, QMIN[(layer, clip)], qmax)
            tries.append((kbps, qmax, round(kb)))
    return p, budget, tries


def encode(work, out, jobs=4):
    from concurrent.futures import ThreadPoolExecutor
    os.makedirs(out, exist_ok=True)
    done = {}
    todo = []
    for v in VARIANTS:
        for layer in ("back", "front"):
            for clip, n in P.CLIPS.items():
                src = os.path.join(work, v, layer, clip)
                have = len(glob.glob(os.path.join(src, "*.png")))
                if have != n:
                    print(f"  {v}/{layer}/{clip}: {have}/{n} コマしか無いので焼かない")
                    continue
                todo.append((src, os.path.join(out, name_of(v, layer, clip)), layer, clip, n))
                done.setdefault(v, {}).setdefault(layer, {})[clip] = name_of(v, layer, clip)
    # libvpx は1本につき CPU 1本しか使わないので、本ごとに並べる
    with ThreadPoolExecutor(jobs) as ex:
        for p, budget, tries in ex.map(_encode_budget, todo):
            print(f"  {os.path.basename(p):28s} {tries[-1][2]:6d}KB（予算 {budget}KB・焼いた率・画質の下限・大きさ {tries}）", flush=True)
    entry = {"variants": done, "revealAt": P.REVEAL, "introDur": P.INTRO, "stayDur": P.STAY, "outroDur": P.OUTRO}
    json.dump({"7": entry}, open(os.path.join(out, "manifest-t7.json"), "w"), ensure_ascii=False, indent=1)
    return 0


# ---------------------------------------------------------------- 一覧
def fake_bg():
    """配信画面の代わり（runner には本物の配信画面を置かない）: 明るい昼の街と暗い部屋を半分ずつ"""
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    day = np.dstack([0.62 + 0.1 * (yy / H), 0.66 + 0.05 * (xx / W), 0.7 - 0.1 * (yy / H)])
    night = np.dstack([0.08 + 0.05 * (yy / H), 0.07 + 0.02 * (xx / W), 0.1 + 0.04 * (yy / H)])
    return day, night


def comp_on(bg, rgba):
    a = rgba[..., 3:4]
    return rgba[..., :3] * a + bg * (1 - a)


def load_rgba(p):
    return np.asarray(Image.open(p).convert("RGBA")).astype(np.float32) / 255.0


def sheet(work, path, bg=None, picks=None, frames_dir=None):
    fr = json.load(open(os.path.join(work, "frames.json")))
    have = fr["have"]
    if picks is None:
        picks = [(c, i) for c in P.CLIPS for i in have[c]]
        if len(picks) > 24:
            step = len(picks) / 24
            picks = [picks[int(k * step)] for k in range(24)]
    if bg:
        im = Image.open(bg).convert("RGB")
        # 配信画面（1080×1920）の、広げたアラートの箱のあたり（76,445 から幅 927）を 720×1280 に
        box = im.crop((76, 272, 76 + 927, 272 + 1648)).resize((W, H), Image.LANCZOS)
        bgs = [np.asarray(box).astype(np.float32) / 255.0]
    else:
        bgs = list(fake_bg())
    tiles = []
    for v in VARIANTS:
        for b in bgs:
            row = []
            for c, i in picks:
                pb = os.path.join(work, v, "back", c, f"{i:04d}.png")
                pf = os.path.join(work, v, "front", c, f"{i:04d}.png")
                if not os.path.exists(pb):
                    continue
                x = comp_on(comp_on(b, load_rgba(pb)), load_rgba(pf))
                if frames_dir and b is bgs[-1] and (v == "full" or c != "intro" or i / P.FPS >= P.REVEAL):
                    os.makedirs(frames_dir, exist_ok=True)
                    Image.fromarray((np.clip(x, 0, 1) * 255).astype(np.uint8)).save(
                        os.path.join(frames_dir, f"{v}-{c}-{i:03d}.jpg"), quality=84)
                t = Image.fromarray((np.clip(x, 0, 1) * 255).astype(np.uint8)).resize((W // 4, H // 4), Image.LANCZOS)
                ImageDraw.Draw(t).text((4, 4), f"{v} {c} {i / P.FPS:.1f}s", fill=(255, 255, 0))
                row.append(t)
            tiles.append(row)
    cols = max(len(r) for r in tiles)
    sh = Image.new("RGB", (cols * (W // 4 + 4) + 4, len(tiles) * (H // 4 + 4) + 4), (30, 30, 30))
    for r, row in enumerate(tiles):
        for k, t in enumerate(row):
            sh.paste(t, (4 + k * (W // 4 + 4), 4 + r * (H // 4 + 4)))
    os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
    sh.save(path, quality=88)
    print(path)
    return 0


# ---------------------------------------------------------------- 動画を読む
def decode(path):
    """透明つきの VP8 を RGBA で1コマずつ読む（libvpx で読まないと透明が落ちる）"""
    cmd = ["ffmpeg", "-hide_banner", "-loglevel", "error", "-c:v", "libvpx", "-i", path, "-f", "rawvideo", "-pix_fmt", "rgba", "-"]
    pr = subprocess.Popen(cmd, stdout=subprocess.PIPE)
    n = W * H * 4
    while True:
        buf = pr.stdout.read(n)
        if len(buf) < n:
            break
        yield np.frombuffer(buf, np.uint8).reshape(H, W, 4)
    pr.wait()


def probe_dur(path):
    out = subprocess.run(["ffprobe", "-v", "error", "-count_frames", "-select_streams", "v:0", "-show_entries",
                          "stream=nb_read_frames", "-of", "csv=p=0", path], capture_output=True, text=True)
    return int(out.stdout.strip() or 0)


def _vs_src(frames, src_dir):
    """焼いた動画を libvpx で読み戻して、焼く前の絵（work の PNG）と比べる。Chrome も透明の流れは libvpx で読むので、
    ここで合えば画面でも合う。返すのは (透明の差の平均, 透明の差がいちばん悪いコマ, コマごとの PSNR)。
    PSNR は黒の上に重ねた色（色 × 透明）で取る。見えない所の色（平らにしてある）は数えない"""
    da, ps = [], []
    for k, f in enumerate(frames):
        sp = os.path.join(src_dir, f"{k:04d}.png")
        if not os.path.exists(sp):
            return None
        s = np.asarray(Image.open(sp).convert("RGBA")).astype(np.float32) / 255
        g = f.astype(np.float32) / 255
        da.append(float(np.mean(np.abs(g[..., 3] - s[..., 3]))))
        mse = float(np.mean((g[..., :3] * g[..., 3:4] - s[..., :3] * s[..., 3:4]) ** 2))
        ps.append(min(60.0, 10 * math.log10(1 / max(mse, 1e-10))))
    return float(np.mean(da)), float(np.max(da)), ps


# 画質の決まり（焼く前の絵との PSNR）。キーフレーム（2秒おき）で崩れると、その1つ前のコマから大きく落ちる。
# 中央からの落ちでは見ない（消えていく本は、空に近いコマの PSNR が高すぎて中央が当てにならない）。
# 低い側が PSNR_SEEN 以上なら見ない（46dB の front で 3dB 変わっても、差は 1/255 ほどで目に見えない）
PSNR_MIN = 30.0
PSNR_DIP = 3.0
PSNR_SEEN = 40.0


def _psnr_dips(ps, loop):
    """キーフレームの所の (コマ, 前のコマからの落ち dB)。loop なら輪の尻 → 頭も（頭が飛び抜けて良い・悪いも跳ねに見える）"""
    out = [(k, ps[k - 1] - ps[k]) for k in range(P.FPS * 2, len(ps), P.FPS * 2) if ps[k] < PSNR_SEEN]
    if loop and min(ps[-1], ps[0]) < PSNR_SEEN:
        out.append((0, abs(ps[-1] - ps[0])))
    return out


def _seen(f):
    """見えている色（色 × 透明）と透明。透明な所の色は画面に出ないので、継ぎ目の差に数えない"""
    f = f.astype(np.float32)
    return np.dstack([f[..., :3] * f[..., 3:4] / 255, f[..., 3:4]])


def _jump(a, b):
    """2コマの差（0〜255）。見えている色と透明で測る（2026-11-04: light の front で、見えない所の色の差だけで
    境目が隣どうしの 2.5 倍になった。見えている色では 0.92 と 0.89 で、跳ねは無かった）"""
    return float(np.mean(np.abs(_seen(a) - _seen(b))))


def check(out, work=None):
    """約束（CONTRACT.md）どおりか。0 = 約束どおり / 1 = 外れている / 2 = 数えられない

    `work`（重ねた PNG の置き場）を渡すと、焼いた動画の透明が焼く前の絵と合っているかも数える（runner の pack で回す）"""
    bad = []
    files = {(v, layer, clip): os.path.join(out, name_of(v, layer, clip)) for v in VARIANTS for layer in ("back", "front") for clip in P.CLIPS}
    missing = [os.path.basename(p) for p in files.values() if not os.path.exists(p)]
    if missing:
        print("無い:", missing)
        return 2
    M = masks()
    face = M["face"] < 0.05
    for v in VARIANTS:
        tot = sum(os.path.getsize(files[(v, ly, c)]) for ly in ("back", "front") for c in P.CLIPS)
        print(f"{v}: 合計 {tot / 1e6:.2f}MB（目安 6MB）")
        if tot > 6.0e6:
            bad.append(f"{v} の合計 {tot / 1e6:.2f}MB")
    # 本と本の境目（intro の尻 → stay の頭、stay の尻 → outro の頭）に使う、端のコマと隣どうしの差
    ends = {}
    for (v, layer, clip), p in files.items():
        n = probe_dur(p)
        want = P.CLIPS[clip]
        frames = list(decode(p))
        if n != want or len(frames) != want:
            bad.append(f"{os.path.basename(p)} のコマ数 {n}/{len(frames)}（{want}）")
            continue
        ends[(v, layer, clip)] = (frames[0], frames[-1], float(np.median(
            [_jump(frames[k + 1], frames[k]) for k in range(max(0, len(frames) - 10), len(frames) - 1)]
            + [_jump(frames[k + 1], frames[k]) for k in range(0, min(9, len(frames) - 1))])))
        if work:
            r = _vs_src(frames, os.path.join(work, v, layer, clip))
            if r is None:
                bad.append(f"{os.path.basename(p)} の焼く前の絵が work に無い")
            else:
                ps = r[2]
                med = float(np.median(ps))
                kmin = int(np.argmin(ps))
                print(f"  {os.path.basename(p):28s} 焼く前の絵と: 透明の差 平均 {r[0]:.4f}・いちばん悪いコマ {r[1]:.4f}"
                      f" / PSNR 中央 {med:.1f}dB・最低 {ps[kmin]:.1f}dB（{kmin} コマ目）")
                if r[0] > 0.01:
                    bad.append(f"{os.path.basename(p)} の透明が焼く前の絵と {r[0]:.4f} 違う（0.01 まで）")
                if med < PSNR_MIN:
                    bad.append(f"{os.path.basename(p)} の画質 PSNR 中央 {med:.1f}dB（{PSNR_MIN}dB から）")
                for k, d in _psnr_dips(ps, clip == "stay"):
                    if d > PSNR_DIP:
                        bad.append(f"{os.path.basename(p)} の {k} コマ目（キーフレーム）で画質が {d:.1f}dB 変わる")
        a = np.stack([f[..., 3] for f in frames]).astype(np.float32) / 255
        cover = float(np.mean(a > 0.1))
        msg = f"  {os.path.basename(p):28s} {os.path.getsize(p) / 1024:6.0f}KB 覆う {cover * 100:4.1f}%"
        if layer == "front":
            fz = float(a[:, face].max())
            msg += f" 顔の穴の濃さ最大 {fz:.3f}"
            if fz > 0.04:
                bad.append(f"{os.path.basename(p)} の顔の穴に {fz:.3f}")
        if clip == "stay":
            # 継ぎ目: 最後のコマ → 頭のコマの差が、ふつうの隣どうしの差と比べて大きすぎないか
            seam = _jump(frames[-1], frames[0])
            step = float(np.median([_jump(frames[k + 1], frames[k]) for k in range(0, len(frames) - 1, 9)]))
            msg += f" 継ぎ目 {seam:.2f}（隣どうし {step:.2f}）"
            if seam > max(2.5 * step, 1.0):
                bad.append(f"{os.path.basename(p)} の継ぎ目 {seam:.2f} > 隣どうし {step:.2f} の 2.5 倍")
        if clip == "outro":
            last = float(a[-1].max())
            msg += f" 最後のコマの濃さ最大 {last:.3f}"
            if last > 0.02:
                bad.append(f"{os.path.basename(p)} の最後のコマが透明でない（{last:.3f}）")
        print(msg)
    # 本と本の境目。再生の側は intro → stay（くり返し）→ outro と途切れずにつなぐので、そこで跳ねないか
    for v in VARIANTS:
        for layer in ("back", "front"):
            for c0, c1 in (("intro", "stay"), ("stay", "outro")):
                if (v, layer, c0) not in ends or (v, layer, c1) not in ends:
                    continue
                _, last, s0 = ends[(v, layer, c0)]
                first, _, s1 = ends[(v, layer, c1)]
                j = _jump(last, first)
                step = max(s0, s1)
                print(f"  {v}-{layer} {c0} → {c1} の境目 {j:.2f}（端の隣どうし {step:.2f}）")
                if j > max(2.5 * step, 1.0):
                    bad.append(f"{v}-{layer} の {c0} → {c1} の境目 {j:.2f} > 隣どうし {step:.2f} の 2.5 倍")
    # 書き出し先なら manifest-t7.json、public（install のあと）なら manifest.json の段7
    mp = os.path.join(out, "manifest-t7.json")
    if os.path.exists(mp):
        man = json.load(open(mp))["7"]
    elif os.path.exists(os.path.join(out, "manifest.json")):
        man = json.load(open(os.path.join(out, "manifest.json"))).get("tiers", {}).get("7")
        if man is None:
            print("manifest.json に段7が無い")
            return 2
    else:
        print("manifest が無い")
        return 2
    for k, want in (("introDur", P.INTRO), ("stayDur", P.STAY), ("outroDur", P.OUTRO)):
        if abs(man[k] - want) > 1e-6:
            bad.append(f"manifest の {k}")
    if not (0 < man["revealAt"] < man["introDur"]):
        bad.append("revealAt が intro の中に無い")
    for b in bad:
        print("NG", b)
    print("OK" if not bad else f"外れ {len(bad)} 件")
    return 1 if bad else 0


# ---------------------------------------------------------------- 見せる用の録画
def font(size):
    for p in ("/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc", "/usr/share/fonts/opentype/ipafont-gothic/ipag.ttf", "/usr/share/fonts/truetype/noto/NotoSansCJK-Bold.ttc",
              "/usr/share/fonts/opentype/noto/NotoSansCJK-Black.ttc", "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"):
        if os.path.exists(p):
            return ImageFont.truetype(p, size)
    return ImageFont.load_default()


def char_layer(char_path, name, amount):
    """投げた人のキャラ絵（枠 137,486〜583,1024 に収める）と、その上下中央の字。720×1280 の RGBA"""
    ch = Image.open(char_path).convert("RGBA")
    bb = ch.getbbox()
    if bb:
        ch = ch.crop(bb)
    bw, bh = 446, 538
    k = min(bw / ch.width, bh / ch.height)
    ch = ch.resize((int(ch.width * k), int(ch.height * k)), Image.LANCZOS)
    cl = Image.new("RGBA", (W, H))
    cx, cy = 137 + bw // 2, 486 + bh // 2
    cl.paste(ch, (cx - ch.width // 2, cy - ch.height // 2), ch)
    tx = Image.new("RGBA", (W, H))
    d = ImageDraw.Draw(tx)
    f1, f2 = font(44), font(78)
    for text, f, y, col in ((name, f1, cy - 40, (255, 255, 255)), (amount, f2, cy + 34, (255, 64, 72))):
        d.text((cx, y), text, font=f, fill=col, anchor="mm", stroke_width=8, stroke_fill=(20, 10, 30))
    return np.asarray(cl).astype(np.float32) / 255, np.asarray(tx).astype(np.float32) / 255


def demo(out, bg, char, path, stay_loops=4, name="テストさん", amount="¥10,000"):
    """配信画面に、full（左）と light（右）を並べた縦の録画。キャラ絵は revealAt で出す"""
    im = Image.open(bg).convert("RGB")
    # 広げた箱（幅 927）に 9:16 の動画を、画面の下の端まで（上は 272 から）
    BX, BY, BW = 76, 272, 927
    BH = BW * 16 // 9
    base = np.asarray(im).astype(np.float32) / 255
    CL, TX = char_layer(char, name, amount)
    seq = [("intro", 0)] + [("stay", k) for k in range(stay_loops)] + [("outro", 0)]
    enc = subprocess.Popen(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgb24",
                            "-s", "1440x1280", "-r", str(P.FPS), "-i", "-", "-c:v", "libx264", "-preset", "medium", "-crf", "20",
                            "-pix_fmt", "yuv420p", "-movflags", "+faststart", path], stdin=subprocess.PIPE)
    lbl = font(40)
    t_all = 0.0
    pad = int(0.8 * P.FPS)
    blank = np.zeros((H, W, 4), np.uint8)
    reveal_t = None
    for clip, _ in seq:
        gens = {(v, ly): decode(os.path.join(out, name_of(v, ly, clip))) for v in VARIANTS for ly in ("back", "front")}
        n = P.CLIPS[clip]
        for i in range(n):
            t = i / P.FPS
            if clip == "intro" and reveal_t is None and t >= P.REVEAL:
                reveal_t = t_all
            # キャラ絵: revealAt でぽんと出る（0.35 秒で 0.6 → 1.05 → 1）。締めの頭から消える
            if reveal_t is None:
                ck = 0.0
                cs = 0.6
            else:
                dt = t_all - reveal_t
                ck = min(1.0, dt / 0.15)
                cs = 0.6 + 0.45 * min(1, dt / 0.22) - 0.05 * max(0.0, min(1, (dt - 0.22) / 0.13))
            if clip == "outro":
                ck *= max(0.0, 1 - t / 0.5)
            panels = []
            for v in VARIANTS:
                b = next(gens[(v, "back")], blank).astype(np.float32) / 255
                f = next(gens[(v, "front")], blank).astype(np.float32) / 255
                layer = comp_on(np.zeros((H, W, 3), np.float32), b)
                a = b[..., 3:4]
                if ck > 0:
                    cimg = CL
                    if abs(cs - 1) > 1e-3:
                        ci = Image.fromarray((CL * 255).astype(np.uint8), "RGBA")
                        sw, sh2 = int(W * cs), int(H * cs)
                        ci = ci.resize((sw, sh2), Image.LANCZOS)
                        canvas = Image.new("RGBA", (W, H))
                        canvas.paste(ci, ((W - sw) // 2, int(755 - 755 * cs)), ci)
                        cimg = np.asarray(canvas).astype(np.float32) / 255
                    ca = cimg[..., 3:4] * ck
                    layer = cimg[..., :3] * ca + layer * (1 - ca)
                    a = ca + a * (1 - ca)
                    ta = TX[..., 3:4] * ck
                    layer = TX[..., :3] * ta + layer * (1 - ta)
                    a = ta + a * (1 - ta)
                fa = f[..., 3:4]
                layer = f[..., :3] * fa + layer * (1 - fa)
                a = fa + a * (1 - fa)
                # 箱へ（1080×1920 の配信画面の上）
                big = Image.fromarray((np.dstack([np.clip(layer, 0, 1), np.clip(a, 0, 1)]) * 255).astype(np.uint8), "RGBA").resize((BW, BH), Image.BILINEAR)
                frame = Image.fromarray((base * 255).astype(np.uint8))
                frame.paste(big, (BX, BY), big)
                fr = frame.resize((720, 1280), Image.BILINEAR)
                ImageDraw.Draw(fr).text((16, 12), v, font=lbl, fill=(255, 255, 255), stroke_width=4, stroke_fill=(0, 0, 0))
                panels.append(np.asarray(fr))
            enc.stdin.write(np.hstack(panels).tobytes())
            t_all += 1 / P.FPS
        for g in gens.values():
            for _ in g:
                pass
    still = np.hstack([np.asarray(Image.fromarray((base * 255).astype(np.uint8)).resize((720, 1280), Image.BILINEAR))] * 2)
    for _ in range(pad):
        enc.stdin.write(still.tobytes())
    enc.stdin.close()
    enc.wait()
    print(path, f"{t_all:.1f} 秒")
    return 0


def install(src, dest):
    """焼いた動画を public へ置き、manifest.json の段7だけを書き換える（ほかの段は別の担当が書くので触らない）"""
    import shutil
    os.makedirs(dest, exist_ok=True)
    for p in sorted(glob.glob(os.path.join(src, "t7-*.webm"))):
        shutil.copyfile(p, os.path.join(dest, os.path.basename(p)))
        print("置いた", os.path.basename(p))
    frag = json.load(open(os.path.join(src, "manifest-t7.json")))
    mp = os.path.join(dest, "manifest.json")
    man = json.load(open(mp)) if os.path.exists(mp) else {}
    man.setdefault("tiers", {})["7"] = frag["7"]
    man["tiers"] = dict(sorted(man["tiers"].items(), key=lambda kv: int(kv[0])))
    with open(mp, "w", encoding="utf-8") as fh:
        json.dump(man, fh, ensure_ascii=False, indent=2)
        fh.write("\n")
    print(mp)
    return 0


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("cmd", choices=["compose", "encode", "sheet", "check", "demo", "install"])
    ap.add_argument("a")
    ap.add_argument("b", nargs="?")
    ap.add_argument("--bg")
    ap.add_argument("--char")
    ap.add_argument("--out")
    ap.add_argument("--jobs", type=int, default=4)
    ap.add_argument("--loops", type=int, default=4)
    ap.add_argument("--frames-dir")
    ap.add_argument("--work", help="check: 重ねた PNG の置き場（焼いた動画の透明を、焼く前の絵と突き合わせる）")
    x = ap.parse_args()
    if x.cmd == "compose":
        return compose(x.a, x.b, x.jobs)
    if x.cmd == "encode":
        return encode(x.a, x.b)
    if x.cmd == "sheet":
        return sheet(x.a, x.b, x.bg, frames_dir=x.frames_dir)
    if x.cmd == "check":
        return check(x.a, x.work)
    if x.cmd == "install":
        return install(x.a, x.b)
    return demo(x.a, x.bg, x.char, x.out, x.loops)


if __name__ == "__main__":
    sys.exit(main())
