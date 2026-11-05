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
| 大きさ | 1通り（full / light）の合計 6MB（6,000,000 バイト）以内 |
| 画質 | `--work` に焼く前の連番の絵が全部あれば（`fx_stage.py all --keep`）、コマごとに PSNR（黒の上に重ねた色）を取る。中央 PSNR_MIN 以上。キーフレーム（2秒おき）で前のコマから PSNR_DIP を超えて落ちない。滞在は尻 → 頭でも PSNR_DIP を超えて変わらない（どちらも、低い側が PSNR_SEEN 以上なら見ない）。透明の差の平均 0.01 以下 |
| 本のつなぎ | 登場の尻 → 滞在の頭、滞在の尻 → 締めの頭の差が、端の隣どうしの差の 2.5 倍（と 1.0）を超えない |
| 締めの尻 | 最後のコマの透明の最大 0.02 以下（消えきる） |
| 滞在の継ぎ目 | 尻のコマ → 頭のコマの差が、滞在の中のいちばん大きいコマ送りの差（2秒のキーフレームの段を含む）以下。頭は必ずキーフレームなので、尻→頭には圧縮の質の段が乗る。動きそのものの継ぎ目は `--script` で圧縮の前に測る |
| 透明 | 焼いたコマ（`<work>/_samples`）と読み直した透明の差の平均 0.02 以下。透明だった所（0.02 未満）が 97% 以上 透明のまま |
| front の顔 | front の全コマで、キャラ絵の顔の丸（中心 360,590・半径 74）の透明の最大が 6/255 以下 |
| front は光と粒だけ | front の各コマで、透明 0.6 超の所が箱の 2% 以下（物の面が無い） |
| light の滞在 | light の back の滞在で、覆い（透明の平均）が 0.06 以下（配信の景色がほぼ見える） |
| 〜999円の場所 | 段1は箱の下 30%・段2は下 1/3・段3は下 1/2 より上に、透明 0.1 超が 0.5% 以下 |
| キャラが出たら薄く（段4） | 登場のキャラ絵が出る直前のコマは全面（back の透明の平均 0.5 以上）。滞在の back は縁だけ: 透明の平均 0.2 以下、真ん中（キャラ絵と字の所 x 140〜580・y 300〜1100）の透明の平均 0.03 以下 |

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
MAX_VARIANT_BYTES = 6_000_000
# 画質の決まり（1万円の段の `blender/t7_pack.py` の check と同じ見方）。前の焼き方（2パスの VBR）は、段5 の滞在で
# 輪の頭が尻より 3.2dB 良く（31.4 → 28.2）、2秒おきにくっきりさが変わった。跳ねの物差しはそれより厳しく 1.5dB にした。
# 中央の下限は、絵の細かい段（霧・粒・窓）が 1通り 6MB に収まる所（段5 の滞在で 29〜30dB）から。
# 前の焼き方は同じ大きさで 29.0dB だった
PSNR_MIN = 28.0
PSNR_DIP = 1.5
PSNR_SEEN = 40.0
LOW_TOP = {1: 0.70, 2: 2 / 3, 3: 0.5}  # 箱の高さのこの割合より上に物を出さない（段1は下 30%・段2は下 1/3・段3は下 1/2）
# 全面の景色で出て、キャラ絵が出たら縁だけに薄く引く段（あやと 2026-11-05「1,000は、キャラが登場したら背景薄くする」。#1095）。
# 段 → (出る前の全面の下限, 滞在の透明の平均の上限, 滞在の真ん中の透明の平均の上限)。
# 真ん中はキャラ絵と字が出る所。縁（左右の崖・上の帯の舟のまわり・下の隅）は少し残してよいので、全体の上限は真ん中より緩い。
# 2026-11-05 に焼いた段4: 出る直前 0.81・滞在 0.14・真ん中 0.009（前の全面のままの版は滞在 0.81 で、ここで落ちる）
THIN = {4: (0.5, 0.2, 0.03)}
MID = (slice(300, 1100), slice(140, 580))


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


def psnr_vs(frames, src_dir):
    """読み直したコマと、焼く前の絵（連番の PNG）の PSNR（黒の上に重ねた色。見えない所の色は数えない）と透明の差の平均"""
    ps, da = [], []
    names = sorted(f for f in os.listdir(src_dir) if f.endswith(".png"))
    for g8, nm in zip(frames, names):
        s = np.asarray(Image.open(os.path.join(src_dir, nm)).convert("RGBA"), np.float32) / 255
        g = g8.astype(np.float32) / 255
        mse = float(np.mean((g[..., :3] * g[..., 3:4] - s[..., :3] * s[..., 3:4]) ** 2))
        ps.append(min(60.0, 10 * np.log10(1 / max(mse, 1e-10))))
        da.append(float(np.mean(np.abs(g[..., 3] - s[..., 3]))))
    return ps, float(np.mean(da))


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
    notes.append(f"大きさ 合計 {total / 1e6:.2f}MB（{len(files)}本）")
    for variant in entry["variants"]:
        vt = sum(os.path.getsize(p) for (v, _, _), p in clips.items() if v == variant)
        notes.append(f"大きさ {variant} {vt / 1e6:.2f}MB")
        if vt > MAX_VARIANT_BYTES:
            bad.append(f"{variant} の合計が {vt / 1e6:.2f}MB（6MB を超えた）")
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
            # 下の何割だけを使ってよいか。それより上（箱の上から LOW_TOP の割合まで）を数える
            top = int(H * LOW_TOP[tier])
            over = float(((fr[:, :top, :, 3] > 25).mean(axis=(1, 2))).max())
            notes.append(f"{name}: 上の {round(LOW_TOP[tier] * 100)}% に出た量 最大 {over * 100:.2f}%")
            if over > 0.005:
                bad.append(f"{name}: 〜999円の段なのに、箱の上のほうに {over * 100:.1f}% 出ている")
        if tier in THIN and layer == "back" and clip in ("intro", "stay"):
            full_lo, stay_hi, mid_hi = THIN[tier]
            if clip == "intro":
                i = max(0, int(round((entry["revealAt"] - 0.1) * FPS)))
                a0 = float(fr[min(i, len(fr) - 1)][..., 3].mean() / 255)
                notes.append(f"{name}: キャラ絵が出る直前（{i}コマ目）の透明の平均 {a0:.3f}（全面）")
                if a0 < full_lo:
                    bad.append(f"{name}: キャラ絵が出る前が全面になっていない（透明の平均 {a0:.3f}・{full_lo} から）")
            else:
                a_all = float(fr[..., 3].mean() / 255)
                a_mid = float(fr[:, MID[0], MID[1], 3].mean() / 255)
                notes.append(f"{name}: 薄く引いたあとの透明の平均 {a_all:.3f}・真ん中 {a_mid:.3f}")
                if a_all > stay_hi or a_mid > mid_hi:
                    bad.append(f"{name}: キャラが出たあとに薄く引けていない（透明の平均 {a_all:.3f}・真ん中 {a_mid:.3f}。"
                               f"{stay_hi}・{mid_hi} まで）")
        cov = (fr[..., 3] > 25).mean(axis=(1, 2))
        notes.append(f"{name}: 画面の占め方（透明 0.1 超）平均 {cov.mean() * 100:.1f}%・最大 {cov.max() * 100:.1f}%")
    # 画質（焼く前の連番の絵が全部あるときだけ）
    for (variant, layer, clip), fr in dec.items():
        name = f"{variant}-{layer}-{clip}"
        src = os.path.join(work, variant, clip, layer) if work else None
        if not src or not os.path.isdir(src) or len([f for f in os.listdir(src) if f.endswith(".png")]) != len(fr):
            continue
        ps, da = psnr_vs(fr, src)
        med = float(np.median(ps))
        kf = [(k, ps[k - 1] - ps[k]) for k in range(2 * FPS, len(ps), 2 * FPS) if ps[k] < PSNR_SEEN]
        worst_kf = max((d for _, d in kf), default=0.0)
        msg = f"{name}: 画質 PSNR 中央 {med:.1f}dB・最低 {min(ps):.1f}dB・キーフレームの落ち 最大 {worst_kf:.2f}dB・透明の差 {da:.4f}"
        if clip == "stay":
            msg += f"・頭 {ps[0]:.1f}／尻 {ps[-1]:.1f}dB"
            if min(ps[0], ps[-1]) < PSNR_SEEN and abs(ps[-1] - ps[0]) > PSNR_DIP:
                bad.append(f"{name}: 滞在の頭と尻で画質が {abs(ps[-1] - ps[0]):.2f}dB 違う（輪の継ぎ目で跳ねる）")
        notes.append(msg)
        if med < PSNR_MIN:
            bad.append(f"{name}: 画質 PSNR 中央 {med:.1f}dB（{PSNR_MIN}dB から）")
        for k, d in kf:
            if d > PSNR_DIP:
                bad.append(f"{name}: {k}コマ目（キーフレーム）で画質が {d:.2f}dB 落ちる")
        if da > 0.01:
            bad.append(f"{name}: 透明が焼く前の絵と {da:.4f} 違う（0.01 まで）")
    # 本と本のつなぎ（再生の側は 登場 → 滞在のくり返し → 締め と途切れずにつなぐ）
    for variant in entry["variants"]:
        for layer in ("back", "front"):
            for c0, c1 in (("intro", "stay"), ("stay", "outro")):
                a_, b_ = dec.get((variant, layer, c0)), dec.get((variant, layer, c1))
                if a_ is None or b_ is None:
                    continue
                j = diff(a_[-1], b_[0])
                step = max(float(np.median([diff(a_[k], a_[k + 1]) for k in range(max(0, len(a_) - 10), len(a_) - 1)])),
                           float(np.median([diff(b_[k], b_[k + 1]) for k in range(0, min(9, len(b_) - 1))])))
                if j > max(2.5 * step, 1.0):
                    bad.append(f"{variant}-{layer}: {c0} → {c1} のつなぎの差 {j:.2f} が、端の隣どうし {step:.2f} の 2.5 倍を超えた")
    for (variant, layer, clip), fr in dec.items():
        if clip == "outro":
            last = int(fr[-1][..., 3].max())
            if last > 5:
                bad.append(f"{variant}-{layer}-outro: 最後のコマに透明 {last}/255 が残る（消えきっていない）")
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
