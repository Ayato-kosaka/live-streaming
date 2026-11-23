#!/usr/bin/env python3
"""参考ショートの音（取り込みの reference に `audio: true` で頼んだ `audio.mka`）から、効果音の候補・BGM の落ち・
カットが曲の拍に乗っているか・声の位置を数え、人が効果音を見つける音の絵を作る（#1403 の F）。

    python3 tools/shorts/style/sfx_scan.py <reference を開いた置き場> <出力の置き場>

置き場は `audio.mka`（元の音の束。左右つき）と、あれば `transcript.json`（whisper の語の時刻）・`scenes.csv`（カット）。
出力（参考の音から作ったものなので、リポジトリに入れない）:
  scan.json     候補（立ち上がりの秒・長さ・はね上がった帯の数と周波数・4kHz より上の割合・声の頭か・形の見当・
                同じ音の繰り返しの束）・声の割合と大きさ・side（左右の差。BGM がよく出る）の大きさ・
                BGM の落ち（side が前後3秒より 15dB 以上 0.2〜3秒落ちた所）・カットが拍に乗る割合と偶然の割合
  overview.jpg  22秒ごとの段に、音の絵（80Hz〜16kHz の対数）・side の細い帯・声（緑）・カット（白）・見る候補（▲。同じ音の束は水色）
  tiles.jpg     見る候補ごとの音の絵（1.2秒ずつ）。効果音の形を見分ける

**候補は効果音そのものではない。** 合成の音（声＋オーケストラの BGM＋効果音5つ）で試すと、声の音節と BGM の音の頭も拾い、
27 の候補のうち本物は5つだった（2026-11-23）。効果音は同じ波形なので何度使っても同じ形になる（`repeat_groups`）が、
BGM の太鼓も同じ形で繰り返す。決めるのは人で、overview.jpg の音の絵を見て付ける。
数えかたは、効果音の位置と種類が指示書で分かっているこちらの回（ヨーグルトの FgLkHZofCT8。edit_p1.json の sfx[]）で先に当てる。
"""
from __future__ import annotations

import csv
import json
import subprocess
import sys
from pathlib import Path

import numpy as np

SR = 48000
NFFT = 2048
HOP = 480  # 10ms
FPS = SR / HOP
BANDS = [(30, 150), (150, 400), (400, 1200), (1200, 3000), (3000, 6000), (6000, 12000),
         (12000, 20000)]


def load(path: Path) -> np.ndarray:
    raw = subprocess.run(["ffmpeg", "-v", "error", "-nostdin", "-i", str(path), "-f", "f32le",
                          "-ac", "2", "-ar", str(SR), "-"], capture_output=True, check=True).stdout
    return np.frombuffer(raw, np.float32).reshape(-1, 2)


def stft(x: np.ndarray) -> np.ndarray:
    pad = np.pad(x, (NFFT // 2, NFFT // 2))
    n = 1 + (len(pad) - NFFT) // HOP
    idx = np.arange(NFFT)[None, :] + HOP * np.arange(n)[:, None]
    win = np.hanning(NFFT).astype(np.float32)
    out = np.empty((n, NFFT // 2 + 1), np.float32)
    for s in range(0, n, 2000):
        fr = pad[idx[s:s + 2000]] * win
        out[s:s + 2000] = np.abs(np.fft.rfft(fr, axis=1)).astype(np.float32)
    return out


def db(x):
    return 10 * np.log10(np.maximum(x, 1e-12))


def band_energy(mag: np.ndarray, freqs: np.ndarray) -> np.ndarray:
    p = mag ** 2
    return np.stack([db(p[:, (freqs >= a) & (freqs < b)].sum(1)) for a, b in BANDS], 1)


def speech_mask(n: int, words: list[tuple[float, float]]) -> np.ndarray:
    m = np.zeros(n, bool)
    for s, e in words:
        a, b = int(max(0, (s - 0.03) * FPS)), int(min(n, (e + 0.03) * FPS) + 1)
        m[a:b] = True
    return m


def read_words(d: Path) -> list[tuple[float, float, str]]:
    p = d / "transcript.json"
    if not p.exists():
        return []
    j = json.loads(p.read_text())
    out = []
    for s in j.get("segments", []):
        for w in s.get("words") or []:
            if w.get("start") is not None and w.get("end") is not None:
                out.append((float(w["start"]), float(w["end"]), w.get("word", "")))
        if not s.get("words"):
            out.append((float(s["start"]), float(s["end"]), s.get("text", "")))
    return out


def read_cuts(d: Path) -> list[float]:
    p = d / "scenes.csv"
    if not p.exists():
        return []
    return [float(r["t"]) for r in csv.DictReader(open(p))]


def describe(i: int, mid: np.ndarray, side: np.ndarray, bm: np.ndarray, bs: np.ndarray,
             freqs: np.ndarray, sp: np.ndarray) -> dict:
    n = len(bm)
    pre = slice(max(0, i - 15), max(1, i - 2))
    post = slice(i, min(n, i + 8))
    tot = db(10 ** (bm / 10) + 10 ** (bs / 10))  # mid と side を足した帯の強さ
    pre_e = tot[pre].mean(0)
    post_e = tot[post].max(0)
    rise = post_e - pre_e
    kb = int(np.argmax(rise))
    # 長さ: いちばん上がった帯が、上がる前 +3dB に戻るまで（2秒まで）
    dur = 0
    for j in range(i, min(n, i + 200)):
        if tot[j, kb] < pre_e[kb] + 3:
            break
        dur += 1
    pk = slice(i, min(n, i + max(3, min(dur, 30))))
    spec = (mid[pk] ** 2 + side[pk] ** 2).mean(0)
    band = (freqs >= 200) & (freqs <= 16000)
    sb = spec[band] + 1e-12
    centroid = float((freqs[band] * sb).sum() / sb.sum())
    flat = float(np.exp(np.mean(np.log(sb))) / np.mean(sb))
    side_rise = float(db((side[post] ** 2).sum(1)).max() - db((side[pre] ** 2).sum(1)).mean())
    mid_rise = float(db((mid[post] ** 2).sum(1)).max() - db((mid[pre] ** 2).sum(1)).mean())
    # 音の高さの動き（いちばん強い周波数の、始まりと終わり）
    seg = mid[i:min(n, i + max(4, min(dur, 60)))] + side[i:min(n, i + max(4, min(dur, 60)))]
    hb = (freqs >= 150) & (freqs <= 12000)
    f_track = freqs[hb][np.argmax(seg[:, hb], axis=1)] if len(seg) else np.array([0.0])
    f0, f1 = float(np.median(f_track[:3])), float(np.median(f_track[-3:]))
    in_speech = bool(sp[max(0, i - 2):min(n, i + 3)].any())
    kind = "noise"
    hi = rise[4:].max() if len(rise) > 4 else 0
    lo = rise[:2].max()
    if lo > 10 and lo >= hi and dur < 120:
        kind = "thud"
    elif flat > 0.25 and 0.12 <= dur / FPS <= 1.0 and centroid > 1500:
        kind = "whoosh"
    elif flat < 0.08 and centroid > 2500 and dur / FPS >= 0.4:
        kind = "chime"
    elif flat < 0.12 and dur / FPS < 0.4:
        kind = "pop"
    elif flat < 0.12:
        kind = "tonal"
    if in_speech and kind in ("noise", "tonal") and 300 < centroid < 3500:
        kind = "speechlike"
    return {"t": round(i / FPS, 2), "dur": round(dur / FPS, 2), "rise_db": round(float(rise[kb]), 1),
            "band": f"{BANDS[kb][0]}-{BANDS[kb][1]}", "centroid": round(centroid),
            "flat": round(flat, 3), "side_rise": round(side_rise, 1), "mid_rise": round(mid_rise, 1),
            "pitch": [round(f0), round(f1)], "in_speech": in_speech, "kind": kind,
            "level_db": round(float(tot[pk].max()), 1) if dur else round(float(tot[i].max()), 1)}


def log_bands(mag: np.ndarray, freqs: np.ndarray, n: int = 48, lo: float = 100, hi: float = 16000):
    edges = np.geomspace(lo, hi, n + 1)
    p = mag ** 2
    out = np.empty((p.shape[0], n), np.float32)
    for k, (a, b) in enumerate(zip(edges[:-1], edges[1:])):
        sel = (freqs >= a) & (freqs < b)
        out[:, k] = db(p[:, sel].sum(1)) if sel.any() else db(p[:, np.argmin(np.abs(freqs - a))])
    return out, edges


def excess_onsets(X: np.ndarray, edges: np.ndarray, sp_starts: np.ndarray, min_bands: int = 8,
                  thr: float = 14.0) -> list[dict]:
    """すぐ前 0.06〜0.6秒の中央値（BGM と話し声のならし）より thr dB 以上はね上がった帯が
    min_bands 本以上ある所を、効果音の候補にする。"""
    n, nb = X.shape
    pad = np.concatenate([np.repeat(X[:1], 60, 0), X], 0)
    from numpy.lib.stride_tricks import sliding_window_view
    win = sliding_window_view(pad, 55, axis=0)[: n]  # [t] = pad[t .. t+54] = X[t-60 .. t-6]
    B = np.median(win, axis=2)
    E = X - B
    cnt = (E > thr).sum(1)
    score = np.clip(E - 6, 0, None).sum(1)
    out = []
    last = -100
    for t in range(1, n - 1):
        if cnt[t] < min_bands or score[t] < score[t - 1] or score[t] < score[t + 1]:
            continue
        if t - last < 12:
            if out and score[t] > out[-1]["_s"]:
                out.pop()
            else:
                continue
        hot = E[t] > thr
        fc = np.sqrt(edges[:-1] * edges[1:])
        lo_f, hi_f = float(fc[hot].min()), float(fc[hot].max())
        hi_share = float(np.clip(E[t], 0, None)[fc > 4000].sum() / max(1e-6, np.clip(E[t], 0, None).sum()))
        # 長さ: はね上がった帯の強さが、前のならし +6dB を割るまで
        d = 0
        while t + d < n and d < 200 and ((X[t + d] - B[t]) > 6)[hot].mean() > 0.5:
            d += 1
        at_word = bool(sp_starts[max(0, t - 4):t + 3].any())
        out.append({"t": round(t / FPS, 2), "bands": int(cnt[t]), "score": round(float(score[t])),
                    "f": [round(lo_f), round(hi_f)], "hi_share": round(hi_share, 2), "dur": round(d / FPS, 2),
                    "at_word_start": at_word, "_s": float(score[t])})
        last = t
    for o in out:
        o.pop("_s", None)
    return out


def repeats(X: np.ndarray, cands: list[dict], lo_band: int = 14, span: int = 28, thr: float = 0.72) -> list[list[int]]:
    """同じ効果音は同じ波形なので、何度使っても音の絵が同じ形になる（話し声は二度と同じ形にならない）。
    候補ごとに頭から 0.28秒・800Hz より上の音の絵を切り、形の相関（前後2コマずらしの最大）で束ねる。"""
    n = X.shape[0]
    pats = []
    for c in cands:
        t = int(c["t"] * FPS)
        a, b = max(0, t - 2), min(n, t + span)
        p = X[a:b, lo_band:]
        if p.shape[0] < span:
            p = np.pad(p, ((0, span + 2 - p.shape[0]), (0, 0)), mode="edge")
        pats.append(p)

    def corr(p, q):
        best = -1.0
        for s in range(-2, 3):
            a = p[max(0, s):max(0, s) + span - 3]
            b = q[max(0, -s):max(0, -s) + span - 3]
            m = min(len(a), len(b))
            a, b = a[:m].ravel(), b[:m].ravel()
            a, b = a - a.mean(), b - b.mean()
            den = np.sqrt((a * a).sum() * (b * b).sum()) + 1e-9
            best = max(best, float((a * b).sum() / den))
        return best

    k = len(pats)
    groups = []
    used = set()
    for i in range(k):
        if i in used:
            continue
        g = [i]
        for j in range(i + 1, k):
            if j not in used and corr(pats[i], pats[j]) >= thr:
                g.append(j)
        if len(g) > 1:
            used.update(g)
            groups.append(g)
    return groups


def bgm_drops(side_db: np.ndarray, min_drop: float = 15.0) -> list[dict]:
    """side（左右の差＝ほぼ BGM）が、前後3秒の中央値より min_drop dB 以上 0.2〜3秒落ちた所（BGM を止めた溜め）。"""
    n = len(side_db)
    sm = np.convolve(side_db, np.ones(5) / 5, mode="same")
    out = []
    t = 0
    while t < n:
        a, b = max(0, t - 300), min(n, t + 300)
        ref = np.median(sm[a:b])
        if sm[t] < ref - min_drop:
            e = t
            while e < n and sm[e] < ref - min_drop + 5:
                e += 1
            if 20 <= e - t <= 300 and t > 30 and e < n - 30:
                out.append({"t": round(t / FPS, 2), "dur": round((e - t) / FPS, 2), "drop_db": round(float(ref - sm[t:e].min()), 1)})
            t = e + 1
        else:
            t += 1
    return out


def beat_sync(side: np.ndarray, freqs: np.ndarray, cuts: list[float]) -> dict:
    """BGM（side）の拍の周期と位相を見当し、カットが拍に乗っている割合を、偶然の割合と並べる。"""
    if len(cuts) < 4:
        return {}
    band = (freqs >= 60) & (freqs <= 8000)
    lm = np.log1p(side[:, band] * 50)
    env = np.maximum(0, np.diff(lm, axis=0, prepend=lm[:1])).sum(1)
    env = env - np.convolve(env, np.ones(50) / 50, mode="same")
    env = np.maximum(env, 0)
    lags = np.arange(int(0.33 * FPS), int(0.86 * FPS) + 1)
    ac = np.array([float((env[:-L] * env[L:]).sum()) for L in lags])
    if ac.max() <= 0:
        return {}
    L = int(lags[np.argmax(ac)])
    strength = float(ac.max() / (np.median(ac) + 1e-9))
    ph = int(np.argmax([env[p::L].sum() for p in range(L)]))
    period = L / FPS

    def hit(ts, tol=0.06):
        ok = 0
        for c in ts:
            k = round((c * FPS - ph) / L)
            ok += abs(c * FPS - (ph + k * L)) <= tol * FPS
        return ok / len(ts)
    rng = np.random.default_rng(0)
    base = np.mean([hit([c + rng.uniform(0, period) for c in cuts]) for _ in range(200)])
    return {"bpm": round(60 / period, 1), "strength": round(strength, 2), "on_beat": round(hit(cuts), 2),
            "chance": round(float(base), 2)}


def music_score(mag: np.ndarray, freqs: np.ndarray, mask: np.ndarray) -> float:
    """声の無いコマで、目立つ山（周りより 10dB 上）が前のコマと同じ所に続く割合。
    曲（伸ばす音）は続き、雑音は続かない。声は区間から外してある。"""
    band = (freqs >= 100) & (freqs <= 4000)
    m = db(mag[:, band] ** 2)
    if mask.sum() < 50:
        return float("nan")
    keep = np.where(mask)[0]
    keep = keep[keep > 0]
    hits, tot = 0, 0
    for i in keep[::3]:
        a, b = m[i], m[i - 1]
        if not (mask[i - 1]):
            continue
        base = np.median(a)
        pa = (a > base + 10) & (a >= np.roll(a, 1)) & (a >= np.roll(a, -1))
        pb = (b > np.median(b) + 10)
        pb = pb | np.roll(pb, 1) | np.roll(pb, -1)
        n = pa.sum()
        if n:
            hits += (pa & pb).sum()
            tot += n
    return round(hits / tot, 3) if tot else float("nan")


def main() -> int:
    d, out = Path(sys.argv[1]), Path(sys.argv[2])
    out.mkdir(parents=True, exist_ok=True)
    x = load(d / "audio.mka")
    dur = len(x) / SR
    mid_t, side_t = (x[:, 0] + x[:, 1]) / 2, (x[:, 0] - x[:, 1]) / 2
    mid, side = stft(mid_t), stft(side_t)
    freqs = np.fft.rfftfreq(NFFT, 1 / SR)
    bm, bs = band_energy(mid, freqs), band_energy(side, freqs)
    n = len(bm)
    words = read_words(d)
    sp = speech_mask(n, [(s, e) for s, e, _ in words])
    cuts = read_cuts(d)
    X, edges = log_bands(mid + side, freqs)
    starts = np.zeros(n, bool)
    for s, e, _ in words:
        starts[min(n - 1, int(s * FPS))] = True
    cand = excess_onsets(X, edges, starts)
    for c in cand:
        i = int(c["t"] * FPS)
        c.update({k: v for k, v in describe(i, mid, side, bm, bs, freqs, sp).items()
                  if k in ("centroid", "flat", "side_rise", "mid_rise", "pitch", "in_speech", "kind", "level_db")})
    # 声と BGM
    full = db((mid ** 2 + side ** 2).sum(1))
    loud = full > (np.percentile(full, 95) - 45)
    speech_lvl = float(np.median(full[sp & loud])) if (sp & loud).sum() > 20 else None
    gap = (~speech_mask(n, [(s - 0.25, e + 0.25) for s, e, _ in words])) & loud
    side_db = db((side ** 2).sum(1))
    mid_db = db((mid ** 2).sum(1))
    res = {
        "duration": round(dur, 2),
        "speech_ratio": round(float(sp.mean()), 3),
        "speech_level_db": None if speech_lvl is None else round(speech_lvl, 1),
        "gap_level_db": round(float(np.median(full[gap])), 1) if gap.sum() > 20 else None,
        "side_minus_mid_db": round(float(np.median(side_db[loud]) - np.median(mid_db[loud])), 1),
        "side_in_speech_db": round(float(np.median(side_db[sp & loud])), 1) if (sp & loud).sum() > 20 else None,
        "side_in_gap_db": round(float(np.median(side_db[gap])), 1) if gap.sum() > 20 else None,
        "music_score_gap": music_score(mid + side, freqs, gap),
        "music_score_side": music_score(side, freqs, loud),
        "cuts": cuts,
        "n_words": len(words),
        "candidates": cand,
    }
    for c in cand:
        c["vs_speech_db"] = None if speech_lvl is None else round(c["level_db"] - speech_lvl, 1)
        c["near_cut"] = bool(any(abs(c["t"] - ct) <= 0.25 for ct in cuts))
    res["bgm_drops"] = bgm_drops(side_db)
    res["beat_sync"] = beat_sync(side, freqs, cuts)
    # 効果音らしさの順（こちらのヨーグルトの回で当てた: はね上がった帯の数 ×（0.5＋4kHz より上の割合）、声の頭は 0.6倍）。
    # 0.35秒以内の候補は1つにまとめ、上位（尺 ÷ 3.5秒 の数）だけを「見る候補」にする。ヨーグルトの回では、指示書の効果音11個のうち
    # 9個が見る候補15に入った（風切り音の2つは立ち上がりが遅く、0.2秒あとの候補で当たる）。外れた2つは柔らかい音（キラ・ふわ）
    def sfx_score(c):
        return c["bands"] * (0.5 + c["hi_share"]) * (0.6 if c["at_word_start"] else 1.0)
    order = sorted(range(len(cand)), key=lambda i: -sfx_score(cand[i]))
    picked = []
    for i in order:
        if all(abs(cand[i]["t"] - cand[j]["t"]) > 0.35 for j in picked):
            picked.append(i)
        if len(picked) >= max(4, int(dur / 3.5)):
            break
    for r, i in enumerate(sorted(picked, key=lambda i: cand[i]["t"])):
        cand[i]["look"] = True
    for c in cand:
        c["sfx_score"] = round(sfx_score(c), 1)
    res["look"] = [cand[i]["t"] for i in sorted(picked, key=lambda i: cand[i]["t"])]
    groups = repeats(X, cand)
    for gi, g in enumerate(groups):
        for i in g:
            cand[i]["rep"] = gi
    res["repeat_groups"] = [[cand[i]["t"] for i in g] for g in groups]
    (out / "scan.json").write_text(json.dumps(res, ensure_ascii=False, indent=1))
    overview(out / "overview.jpg", mid, side, freqs, words, cuts, cand, dur, d.parent.name)
    tiles(out / "tiles.jpg", mid, side, freqs, cand)
    return 0


def overview(path: Path, mid, side, freqs, words, cuts, cand, dur, title, pps: int = 55, row_s: int = 22):
    """人が効果音を見つける絵: 22秒ごとの段に、音の絵（mid+side・80Hz〜16kHz の対数）と side だけの細い帯。
    下に 声（whisper の語。緑）・カット（白）・秒の目盛り・候補（黄の▲と番号）。"""
    from PIL import Image, ImageDraw, ImageFont
    # 色の段（暗い紫 → 赤 → 黄 → 白）。matplotlib の magma に似せた5点を直線でつなぐ（numpy と Pillow だけで描く）
    anchors = np.array([[0, 0, 4], [80, 18, 123], [183, 55, 121], [252, 137, 97], [252, 253, 191]], np.float32)

    def cmap(a):
        x = np.clip(a, 0, 1) * (len(anchors) - 1)
        i = np.minimum(x.astype(int), len(anchors) - 2)
        f = (x - i)[..., None]
        return (anchors[i] * (1 - f) + anchors[i + 1] * f) / 255.0
    try:
        font = ImageFont.truetype("/usr/share/fonts/opentype/ipafont-gothic/ipag.ttf", 12)
    except OSError:
        font = ImageFont.load_default()
    full = spec_img(mid + side, freqs, rows=130)
    sid = spec_img(side, freqs, rows=36)
    hi = np.percentile(full, 99.7)
    nrows = int(np.ceil(dur / row_s))
    rh = 130 + 36 + 30
    W = row_s * pps
    img = Image.new("RGB", (W + 10, nrows * rh + 22), (18, 18, 18))
    dr = ImageDraw.Draw(img)
    dr.text((4, 3), f"{title}  {dur:.1f}秒  段ごとに{row_s}秒・上: 音（80Hz〜16kHz）・細い帯: side（左右の差）・緑: 声・白: カット・▲: 候補",
            fill=(230, 230, 230), font=font)

    def to8(a, hi_):
        return (np.clip((a - (hi_ - 65)) / 65, 0, 1) * 255).astype(np.uint8)

    def colorize(a):
        return Image.fromarray((cmap(a / 255.0) * 255).astype(np.uint8))

    n = full.shape[1]
    for r in range(nrows):
        t0, t1 = r * row_s, min(dur, (r + 1) * row_s)
        a, b = int(t0 * FPS), min(n, int(t1 * FPS))
        if b <= a:
            continue
        w = int((t1 - t0) * pps)
        top = colorize(to8(full[:, a:b], hi)).resize((w, 130))
        sd = colorize(to8(sid[:, a:b], np.percentile(sid, 99.7))).resize((w, 36))
        y = 22 + r * rh
        img.paste(top, (5, y))
        img.paste(sd, (5, y + 131))
        yb = y + 168
        for s, e, _ in words:
            if e < t0 or s > t1:
                continue
            x0, x1 = 5 + int((max(s, t0) - t0) * pps), 5 + int((min(e, t1) - t0) * pps)
            dr.rectangle([x0, yb, max(x0 + 1, x1), yb + 4], fill=(60, 200, 90))
        for s in range(int(t0), int(t1) + 1):
            x = 5 + int((s - t0) * pps)
            dr.line([(x, yb + 6), (x, yb + (14 if s % 5 == 0 else 9))], fill=(190, 190, 190))
            if s % 2 == 0:
                dr.text((x + 2, yb + 12), str(s), fill=(190, 190, 190), font=font)
        for ct in cuts:
            if t0 <= ct < t1:
                x = 5 + int((ct - t0) * pps)
                dr.line([(x, y - 3), (x, y + 8)], fill=(255, 255, 255), width=2)
        for k, c in enumerate(cand):
            if t0 <= c["t"] < t1:
                x = 5 + int((c["t"] - t0) * pps)
                if not c.get("look"):
                    continue
                col = (80, 230, 255) if "rep" in c else (255, 220, 40)
                dr.polygon([(x - 4, y + 129), (x + 4, y + 129), (x, y + 121)], fill=col)
                lab = f"{k}" + (f"={chr(65 + c['rep'] % 26)}" if "rep" in c else "")
                dr.text((x + 3, y + 112), lab, fill=col, font=font)
    img.save(path, quality=80)


def tiles(path: Path, mid, side, freqs, cand):
    """見る候補ごとの音の絵（頭の 0.2秒前から 1.2秒・80Hz〜16kHz の対数）。効果音の形（シュッは広い帯の霞・ポンは短い音の筋・
    ドンは低い所の塊・キラは高い所の横の筋）を見分ける1枚。上の段が mid+side、下の細い段が side"""
    from PIL import Image, ImageDraw, ImageFont
    try:
        font = ImageFont.truetype("/usr/share/fonts/opentype/ipafont-gothic/ipag.ttf", 12)
    except OSError:
        font = ImageFont.load_default()
    look = [c for c in cand if c.get("look")]
    if not look:
        return
    full = spec_img(mid + side, freqs, rows=110)
    sid = spec_img(side, freqs, rows=30)
    hi, his = np.percentile(full, 99.7), np.percentile(sid, 99.7)
    tw, th, per = 150, 170, 8
    rows = (len(look) + per - 1) // per
    img = Image.new("RGB", (per * tw, rows * (th + 18)), (18, 18, 18))
    dr = ImageDraw.Draw(img)

    def gray(a, h):
        return Image.fromarray((np.clip((a - (h - 65)) / 65, 0, 1) * 255).astype(np.uint8)).convert("RGB")
    for k, c in enumerate(look):
        r, q = divmod(k, per)
        x, y = q * tw, r * (th + 18)
        a = max(0, int((c["t"] - 0.2) * FPS))
        b = min(full.shape[1], a + int(1.2 * FPS))
        if b - a < 2:
            continue
        img.paste(gray(full[:, a:b], hi).resize((tw - 6, 120)), (x + 3, y + 16))
        img.paste(gray(sid[:, a:b], his).resize((tw - 6, 30)), (x + 3, y + 138))
        dr.text((x + 3, y + 1), f"{c['t']:.2f}s b{c['bands']} hi{c['hi_share']}{' W' if c['at_word_start'] else ''}",
                fill=(255, 220, 40), font=font)
        mx = x + 3 + int((tw - 6) * 0.2 / 1.2)
        dr.line([(mx, y + 16), (mx, y + 22)], fill=(255, 255, 255))
    img.save(path, quality=82)


def spec_img(mag: np.ndarray, freqs: np.ndarray, rows: int = 160, fmax: float = 16000):
    """対数の周波数軸（80Hz〜fmax）に寄せた dB の絵（上が高い音）。"""
    edges = np.geomspace(80, fmax, rows + 1)
    cols = []
    for a, b in zip(edges[:-1], edges[1:]):
        sel = (freqs >= a) & (freqs < b)
        if not sel.any():
            sel = np.argmin(np.abs(freqs - (a + b) / 2))
            cols.append(mag[:, sel] ** 2)
        else:
            cols.append((mag[:, sel] ** 2).mean(1))
    im = db(np.stack(cols, 1)).T[::-1]
    return im


if __name__ == "__main__":
    sys.exit(main())
