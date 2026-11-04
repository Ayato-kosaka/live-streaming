#!/usr/bin/env python3
"""1万円の段（段7）: Blender が描いた層を重ねて、full / light の2通りの透明つき WebM にする。

    python3 tools/alert-theme/blender/t7_pack.py compose <描いた絵の置き場> <作業の置き場>
    python3 tools/alert-theme/blender/t7_pack.py encode  <作業の置き場> <書き出し先>      # t7-*.webm と manifest-t7.json
    python3 tools/alert-theme/blender/t7_pack.py sheet   <作業の置き場> <一覧.jpg> [--bg <配信画面.jpg>]
    python3 tools/alert-theme/blender/t7_pack.py check   <書き出し先>                      # 秒・大きさ・継ぎ目・顔の穴
    python3 tools/alert-theme/blender/t7_pack.py demo    <書き出し先> --bg <配信画面.jpg> --char <キャラ絵.png> --out <録画.mp4>

`check` の終了コード: 0 = 約束どおり / 1 = 外れている所が在る / 2 = 数えられなかった（動画が無い・読めない）

## 層の重ね方（Blender の4つの層 → 動画の2つの層）
- back = あやと の下に 城、その下に 空（`castle_t7.py` の view layer）。front = 前の粒
- Blender の色は「黒の上に重ねた色」（光のにじみ込み）。透明は物の透明だけなので、
  にじみの所は **色の明るさを透明にする**（`A = max(物の透明, 色のいちばん明るい成分 × GLOW_ALPHA)`、色は `C / A`）。
  暗い配信の上では光が足し算に近く乗り、明るい配信の上でも白く溶けない
- 箱の縁で 0 に溶かす（`EDGE`。四角い暗い箱を浮かせない）
- front は、投げた人のキャラ絵の顔のあたりに穴（`FACE`）。キャラごとの顔の位置は再生の側が持つので、ここは広めに

## full と light（`scratchpad/novfx/CONTRACT.md`）
- full … 叩き台どおり。城が画面いっぱいのまま滞在する
- light … 門の光からキャラ絵が出たら（`REVEAL`）、城と夜空を 0.9 秒で薄くし、縁（左右の木・下の石畳・上の月と星）だけ残す。
  あやとと前の粒は残す。締めで城が貯金箱へ縮むときに、また見える。**登場までは full と同じ**（あやとの意見「キャラが出たら薄く」）
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
from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import t7_plan as P  # noqa: E402

W, H = P.W, P.H
LAYERS = ("sky", "scene", "ayato", "front")
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
    sides = 1 - smoothstep(0.09 * W, 0.2 * W, side)
    bottom = 1 - smoothstep(0.07 * H, 0.15 * H, H - 1 - yy)
    band = 0.8 * np.maximum(sides, bottom)
    skyband = 0.7 * (1 - smoothstep(0.12 * H, 0.3 * H, yy))
    return dict(edge=edge, face=face, band=band, skyband=skyband)


def ease_io(x):
    x = min(1.0, max(0.0, x))
    return 0.5 - 0.5 * math.cos(math.pi * x)


def ramp(t, a, b):
    return min(1.0, max(0.0, (t - a) / (b - a)))


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
    for meta in glob.glob(os.path.join(raw, "**", "meta.json"), recursive=True):
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


def straight(layer):
    C, A = layer
    A = np.maximum(A, np.clip(C.max(axis=2) * GLOW_ALPHA, 0, 1))
    S = np.clip(C / np.maximum(A, 1e-4)[..., None], 0, 1)
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
    for v in VARIANTS:
        w = light_weight(clip, t) if v == "light" else 0.0
        msc = _M["edge"] * (1 - w + w * _M["band"])
        msk = _M["edge"] * (1 - w + w * _M["skyband"])
        back = over(scale(L["ayato"], _M["edge"]), over(scale(L["scene"], msc), scale(L["sky"], msk)))
        front = scale(L["front"], _M["edge"] * _M["face"] * (1 - 0.3 * w))
        save_rgba(straight(back), os.path.join(work, v, "back", clip, f"{i:04d}.png"))
        save_rgba(straight(front), os.path.join(work, v, "front", clip, f"{i:04d}.png"))
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
BITRATE = {("back", "intro"): 3000, ("back", "stay"): 2600, ("back", "outro"): 2400,
           ("front", "intro"): 900, ("front", "stay"): 700, ("front", "outro"): 700}


def ff(*args):
    subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", *args], check=True)


def name_of(v, layer, clip):
    return f"t7-{v}-{layer}-{clip}.webm"


def encode(work, out):
    os.makedirs(out, exist_ok=True)
    done = {}
    for v in VARIANTS:
        for layer in ("back", "front"):
            for clip, n in P.CLIPS.items():
                src = os.path.join(work, v, layer, clip)
                have = len(glob.glob(os.path.join(src, "*.png")))
                if have != n:
                    print(f"  {v}/{layer}/{clip}: {have}/{n} コマしか無いので焼かない")
                    continue
                p = os.path.join(out, name_of(v, layer, clip))
                kb = BITRATE[(layer, clip)]
                # 透明は別の VP8 の流れ。キーフレームを2秒おきに固定して色とそろえる（PR #1089 の頭出しの崩れ）
                ff("-framerate", str(P.FPS), "-i", os.path.join(src, "%04d.png"), "-vf", "format=yuva420p",
                   "-c:v", "libvpx", "-pix_fmt", "yuva420p", "-auto-alt-ref", "0", "-b:v", f"{kb}k", "-crf", "10",
                   "-qmin", "4", "-qmax", "42", "-deadline", "good", "-cpu-used", "0", "-g", str(P.FPS * 2),
                   "-keyint_min", str(P.FPS * 2), "-force_key_frames", "expr:gte(t,n_forced*2)", "-an", p)
                done.setdefault(v, {}).setdefault(layer, {})[clip] = os.path.basename(p)
                print(f"  {os.path.basename(p):28s} {os.path.getsize(p) / 1024:7.0f}KB")
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


def sheet(work, path, bg=None, picks=None):
    fr = json.load(open(os.path.join(work, "frames.json")))
    have = fr["have"]
    if picks is None:
        picks = [(c, i) for c in P.CLIPS for i in have[c]]
        if len(picks) > 14:
            step = len(picks) / 14
            picks = [picks[int(k * step)] for k in range(14)]
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


def check(out):
    """約束（CONTRACT.md）どおりか。0 = 約束どおり / 1 = 外れている / 2 = 数えられない"""
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
    for (v, layer, clip), p in files.items():
        n = probe_dur(p)
        want = P.CLIPS[clip]
        frames = list(decode(p))
        if n != want or len(frames) != want:
            bad.append(f"{os.path.basename(p)} のコマ数 {n}/{len(frames)}（{want}）")
            continue
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
            f32 = [f.astype(np.float32) for f in (frames[-1], frames[0], frames[len(frames) // 2], frames[len(frames) // 2 + 1])]
            seam = float(np.mean(np.abs(f32[0] - f32[1])))
            step = float(np.median([np.mean(np.abs(frames[k + 1].astype(np.float32) - frames[k].astype(np.float32)))
                                    for k in range(0, len(frames) - 1, 9)]))
            msg += f" 継ぎ目 {seam:.2f}（隣どうし {step:.2f}）"
            if seam > max(2.5 * step, 1.0):
                bad.append(f"{os.path.basename(p)} の継ぎ目 {seam:.2f} > 隣どうし {step:.2f} の 2.5 倍")
        if clip == "outro":
            last = float(a[-1].max())
            msg += f" 最後のコマの濃さ最大 {last:.3f}"
            if last > 0.02:
                bad.append(f"{os.path.basename(p)} の最後のコマが透明でない（{last:.3f}）")
        print(msg)
    man = json.load(open(os.path.join(out, "manifest-t7.json")))["7"]
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
    for p in ("/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc", "/usr/share/fonts/truetype/noto/NotoSansCJK-Bold.ttc",
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


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("cmd", choices=["compose", "encode", "sheet", "check", "demo"])
    ap.add_argument("a")
    ap.add_argument("b", nargs="?")
    ap.add_argument("--bg")
    ap.add_argument("--char")
    ap.add_argument("--out")
    ap.add_argument("--jobs", type=int, default=4)
    ap.add_argument("--loops", type=int, default=4)
    x = ap.parse_args()
    if x.cmd == "compose":
        return compose(x.a, x.b, x.jobs)
    if x.cmd == "encode":
        return encode(x.a, x.b)
    if x.cmd == "sheet":
        return sheet(x.a, x.b, x.bg)
    if x.cmd == "check":
        return check(x.a)
    return demo(x.a, x.bg, x.char, x.out, x.loops)


if __name__ == "__main__":
    sys.exit(main())
