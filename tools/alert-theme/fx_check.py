#!/usr/bin/env python3
"""投げ銭の段の動画（`fx_stage.py` が書き出したもの）を、約束どおりかを数で確かめる（#1095）。

    python3 tools/alert-theme/fx_check.py <fx の置き場> [--tiers 5,4] [--work <焼いた置き場>] [--sheet <一覧.jpg>] [--script <台本>…]

終了コード:
    0 = 見た段は全部、約束どおり
    1 = 約束から外れた所がある（どこが外れたかを出す）
    2 = 確かめられなかった（manifest が無い・動画が読めない・ffmpeg が無い）

見るもの（段ごと。動画は libvpx で読み直す＝ブラウザと同じく透明の流れも展開する）:

| 項目 | 合格 |
| --- | --- |
| 形 | 720×1280・30コマ/秒・VP8・透明の流れつき（`alpha_mode=1`）。manifest の秒がコマ数と合う |
| 大きさ | 1段の合計 6MB 以内 |
| 滞在の継ぎ目 | 尻のコマ → 頭のコマの差が、滞在の中のいちばん大きいコマ送りの差（2秒のキーフレームの段を含む）以下。頭は必ずキーフレームなので、尻→頭には圧縮の質の段が乗る。動きそのものの継ぎ目は `--script` で圧縮の前に測る |
| 本のつなぎ | 登場の尻 → 滞在の頭、滞在の尻 → 締めの頭も同じ物差しで出す（目安。合否には入れない） |
| 透明 | 焼いたコマ（`<work>/_samples`）と読み直した透明の差の平均 0.02 以下。透明だった所（0.02 未満）が 97% 以上 透明のまま |
| front の顔 | front の全コマで、キャラ絵の顔の丸（中心 360,590・半径 74）の透明の最大が 6/255 以下 |
| front は光と粒だけ | front の各コマで、透明 0.6 超の所が箱の 2% 以下（物の面が無い） |
| light の滞在 | light の back の滞在で、覆い（透明の平均）が 0.06 以下（配信の景色がほぼ見える） |
| 〜999円の場所 | 段1は箱の下 30%・段2は下 1/3・段3は下 1/2 より上に、透明 0.1 超が 0.5% 以下 |

`--script` を渡すと、台本から滞在の「最後の次のコマ」（位相 1）を焼いて、頭のコマ（位相 0）と比べる
（動画の圧縮を通さない、継ぎ目そのものの差。0 に近いほどよい）。
`--sheet` は、各段の数コマを紫と緑の地に重ねた一覧（地の色を替えた2枚で、透明が抜けているかを目で見る）。
"""
import argparse
import json
import os
import shutil
import subprocess
import sys

import numpy as np
from PIL import Image, ImageDraw

W, H, FPS = 720, 1280, 30
FACE = (360.0, 590.0, 74.0)
MAX_TIER_BYTES = 6 * 1024 * 1024
LOW_TOP = {1: 0.70, 2: 2 / 3, 3: 0.5}  # これより上（割合）に物を出さない


class Unchecked(Exception):
    pass


def decode(path):
    """VP8 の透明つきを RGBA で読む（libvpx。ffmpeg 既定の展開器は透明を捨てる）"""
    if not shutil.which("ffmpeg"):
        raise Unchecked("ffmpeg が無い")
    r = subprocess.run(["ffmpeg", "-v", "error", "-c:v", "libvpx", "-i", path, "-f", "rawvideo", "-pix_fmt", "rgba", "-"],
                       capture_output=True)
    if r.returncode != 0:
        raise Unchecked(f"読めない: {path}: {r.stderr.decode()[:200]}")
    a = np.frombuffer(r.stdout, np.uint8)
    n = a.size // (W * H * 4)
    if n == 0:
        raise Unchecked(f"コマが無い: {path}")
    return a[:n * W * H * 4].reshape(n, H, W, 4)


def probe(path):
    r = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries",
                        "stream=codec_name,width,height,r_frame_rate:stream_tags=alpha_mode", "-of", "json", path],
                       capture_output=True, text=True)
    if r.returncode != 0:
        raise Unchecked(f"ffprobe が読めない: {path}")
    s = json.loads(r.stdout)["streams"][0]
    return s


def premul(f):
    x = f.astype(np.float32) / 255
    return np.concatenate([x[..., :3] * x[..., 3:4], x[..., 3:4]], -1)


def diff(a, b):
    return float(np.abs(premul(a) - premul(b)).mean() * 255)


def face_mask():
    yy, xx = np.mgrid[0:H, 0:W]
    return np.hypot(xx - FACE[0], yy - FACE[1]) <= FACE[2]


def check_tier(fx, tier, entry, work=None, script=None, sheet_rows=None):
    bad, notes = [], []
    files = set()
    clips = {}
    for variant, v in entry["variants"].items():
        for layer in ("back", "front"):
            if v.get(layer) is None:
                continue
            for clip in ("intro", "stay", "outro"):
                f = v[layer][clip]
                p = os.path.join(fx, f)
                if not os.path.exists(p):
                    raise Unchecked(f"段{tier}: 動画が無い {f}")
                files.add(p)
                clips[(variant, layer, clip)] = p
    total = sum(os.path.getsize(p) for p in files)
    notes.append(f"大きさ 合計 {total / 1024 / 1024:.2f}MB（{len(files)}本）")
    if total > MAX_TIER_BYTES:
        bad.append(f"1段の合計が {total / 1024 / 1024:.2f}MB（6MB を超えた）")
    hole = face_mask()
    dec = {}
    for key, p in clips.items():
        s = probe(p)
        if s.get("codec_name") != "vp8" or s.get("width") != W or s.get("height") != H or s.get("r_frame_rate") != "30/1":
            bad.append(f"{os.path.basename(p)}: 形が違う {s}")
        if str(s.get("tags", {}).get("alpha_mode")) != "1":
            bad.append(f"{os.path.basename(p)}: 透明の流れが無い")
        fr = decode(p)
        dec[key] = fr
        want = entry[{"intro": "introDur", "stay": "stayDur", "outro": "outroDur"}[key[2]]]
        if abs(len(fr) / FPS - want) > 0.5 / FPS:
            bad.append(f"{os.path.basename(p)}: {len(fr)}コマ（{len(fr) / FPS:.3f}秒）が manifest の {want} と合わない")
    if not (0 < entry["revealAt"] <= entry["introDur"]):
        bad.append(f"revealAt {entry['revealAt']} が登場の動画の中に無い")
    for (variant, layer, clip), fr in dec.items():
        name = f"{variant}-{layer}-{clip}"
        if clip == "stay":
            adj = [diff(fr[i], fr[i + 1]) for i in range(len(fr) - 1)]
            seam = diff(fr[-1], fr[0])
            p90 = float(np.percentile(adj, 90))
            kf = adj[2 * FPS - 1] if len(adj) >= 2 * FPS else None
            notes.append(f"{name}: 継ぎ目（尻→頭）{seam:.3f} ／ 隣のコマの差 中央 {np.median(adj):.3f}・90% {p90:.3f}・最大 {max(adj):.3f}"
                         + (f"・2秒のキーフレームの段 {kf:.3f}" if kf is not None else ""))
            # 頭のコマは必ずキーフレームなので、尻→頭には「圧縮の質の段」が乗る（2秒おきの決まったキーフレームと同じ段）。
            # だから中のコマ送りのいちばん大きい差（キーフレームの段を含む）を超えたら外れとする
            if seam > max(adj) * 1.05 + 1e-6:
                bad.append(f"{name}: 継ぎ目の差 {seam:.3f} が、中のいちばん大きいコマ送りの差 {max(adj):.3f} を超えた")
            nxt = dec.get((variant, layer, "outro"))
            prv = dec.get((variant, layer, "intro"))
            if prv is not None:
                notes.append(f"{name}: 登場の尻→滞在の頭 {diff(prv[-1], fr[0]):.3f}")
            if nxt is not None:
                notes.append(f"{name}: 滞在の尻→締めの頭 {diff(fr[-1], nxt[0]):.3f}")
            if variant == "light" and layer == "back":
                cov = float(fr[..., 3].mean() / 255)
                notes.append(f"{name}: 覆い（透明の平均）{cov:.3f}")
                if cov > 0.06:
                    bad.append(f"{name}: light の滞在の覆いが {cov:.3f}（0.06 を超えた）")
        if layer == "front":
            fmax = int(fr[:, hole, 3].max())
            solid = float(((fr[..., 3] > 153).mean(axis=(1, 2))).max())
            notes.append(f"{name}: 顔の丸の透明 最大 {fmax}/255 ／ 透明 0.6 超の面 最大 {solid * 100:.2f}%")
            if fmax > 6:
                bad.append(f"{name}: キャラ絵の顔の丸に {fmax}/255 の物がある")
            if solid > 0.02:
                bad.append(f"{name}: 透明 0.6 超の面が {solid * 100:.1f}%（光と粒だけなら 2% 以下）")
        if tier in LOW_TOP and layer == "back":
            top = int(H * (1 - LOW_TOP[tier]))
            over = float(((fr[:, :top, :, 3] > 25).mean(axis=(1, 2))).max())
            notes.append(f"{name}: 上の {int((1 - LOW_TOP[tier]) * 100)}% に出た量 最大 {over * 100:.2f}%")
            if over > 0.005:
                bad.append(f"{name}: 〜999円の段なのに、箱の上のほうに {over * 100:.1f}% 出ている")
        cov = (fr[..., 3] > 25).mean(axis=(1, 2))
        notes.append(f"{name}: 画面の占め方（透明 0.1 超）平均 {cov.mean() * 100:.1f}%・最大 {cov.max() * 100:.1f}%")
    # 透明が正しく抜けたか（焼いたコマと比べる）
    samp = os.path.join(work, "_samples") if work else None
    if samp and os.path.isdir(samp):
        worst, keep = 0.0, 1.0
        for nm in sorted(os.listdir(samp)):
            variant, clip, layer, idx = nm[:-4].split("-")
            fr = dec.get((variant, layer, clip))
            if fr is None:
                continue
            i = int(idx)
            if i >= len(fr):
                continue
            src = np.asarray(Image.open(os.path.join(samp, nm)).convert("RGBA"), np.float32)[..., 3] / 255
            got = fr[i][..., 3].astype(np.float32) / 255
            d = float(np.abs(src - got).mean())
            clear = src < 0.02
            k = float((got[clear] < 0.05).mean()) if clear.any() else 1.0
            worst, keep = max(worst, d), min(keep, k)
        notes.append(f"透明: 焼いたコマとの差の平均 最大 {worst:.4f} ／ 透明だった所が透明のまま {keep * 100:.2f}%")
        if worst > 0.02 or keep < 0.97:
            bad.append(f"透明が崩れた（差 {worst:.4f}・残り {keep * 100:.2f}%）")
    else:
        notes.append("透明: 焼いたコマ（--work の _samples）が無いので、焼いたものとの比べはしていない")
    if script:
        sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
        import fx_stage as fs
        S = fs.load_script(script).Scene
        for variant in S.VARIANTS:
            st = S(variant)
            n = st.frames("stay")
            b0, f0 = st.draw(st.ctx("stay", 0))
            bn, fn = st.draw(st.ctx("stay", n))
            d = float(np.abs(b0 - bn).mean() * 255)
            notes.append(f"{variant}: 台本の継ぎ目（位相 0 と 1 の back の差、圧縮前）{d:.4f}")
            if d > 0.05:
                bad.append(f"{variant}: 台本の滞在が周期になっていない（位相 0 と 1 の差 {d:.4f}）")
    if sheet_rows is not None:
        sheet_rows.append((tier, entry, dec))
    return bad, notes


def make_sheet(rows, path):
    """各段の 登場の半ば・登場の尻・滞在の半ばを、紫と緑の地に（back の上に front を重ねて）"""
    tiles, labels = [], []
    bgs = {"紫": (255, 0, 255), "緑": (0, 200, 0)}
    for tier, entry, dec in rows:
        for variant in entry["variants"]:
            for clip, pos in (("intro", 0.5), ("intro", 1.0), ("stay", 0.5)):
                b = dec.get((variant, "back", clip))
                if b is None:
                    continue
                i = min(len(b) - 1, int(pos * (len(b) - 1)))
                f = dec.get((variant, "front", clip))
                for nm, col in bgs.items():
                    im = Image.new("RGBA", (W, H), col + (255,))
                    im.alpha_composite(Image.fromarray(b[i]))
                    if f is not None:
                        im.alpha_composite(Image.fromarray(f[min(i, len(f) - 1)]))
                    t = im.convert("RGB").resize((180, 320))
                    d = ImageDraw.Draw(t)
                    d.text((4, 4), f"t{tier} {variant} {clip} {i}", fill=(255, 255, 255))
                    tiles.append(t)
    cols = 12
    rws = (len(tiles) + cols - 1) // cols
    sh = Image.new("RGB", (cols * 184, max(1, rws) * 324), (255, 255, 255))
    for k, t in enumerate(tiles):
        sh.paste(t, ((k % cols) * 184, (k // cols) * 324))
    sh.save(path, quality=85)
    print("一覧:", path)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("fx")
    ap.add_argument("--tiers", default=None)
    ap.add_argument("--work", action="append", default=[], help="段ごとに 5=<置き場> の形で")
    ap.add_argument("--script", action="append", default=[], help="段ごとに 5=<台本> の形で")
    ap.add_argument("--sheet", default=None)
    o = ap.parse_args()
    try:
        mp = os.path.join(o.fx, "manifest.json")
        if not os.path.exists(mp):
            raise Unchecked(f"manifest が無い: {mp}")
        man = json.load(open(mp, encoding="utf-8"))
        tiers = [int(t) for t in o.tiers.split(",")] if o.tiers else sorted(int(t) for t in man.get("tiers", {}))
        works = dict(w.split("=", 1) for w in o.work)
        scripts = dict(s.split("=", 1) for s in o.script)
        rows = [] if o.sheet else None
        allbad = []
        for t in tiers:
            entry = man["tiers"].get(str(t))
            if entry is None:
                raise Unchecked(f"manifest に段{t} が無い")
            bad, notes = check_tier(o.fx, t, entry, works.get(str(t)), scripts.get(str(t)), rows)
            print(f"== 段{t}  revealAt {entry['revealAt']}・登場 {entry['introDur']}秒・滞在 {entry['stayDur']}秒・締め {entry['outroDur']}秒")
            for n in notes:
                print("  ", n)
            for b in bad:
                print("  ✗", b)
            if not bad:
                print("   ○ 約束どおり")
            allbad += bad
        if o.sheet:
            make_sheet(rows, o.sheet)
    except Unchecked as e:
        print("確かめられなかった:", e)
        return 2
    return 1 if allbad else 0


if __name__ == "__main__":
    sys.exit(main())
