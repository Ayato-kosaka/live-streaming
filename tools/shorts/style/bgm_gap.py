#!/usr/bin/env python3
"""ナレーションと BGM の差（dB）を、混ざった1本の音から測る道具。

## 何を測るか

参考のショートは「声と BGM が混ざった完成品」しか手に入らない。こちらの書き出しは束（stem）を
別々に持っているが、比べるには**同じ物差し**で測らないと意味がない。この道具は、混ざった1本から
「声の大きさ − 話している間の BGM の大きさ」（**D_speech**、dB。大きいほど BGM が小さい）を出し、
こちらの書き出しをどう動かせば参考と同じ差になるかまで計算する。

## 測りかた（M/S 法）

合成音声のナレーションは**真ん中に1本**（左右が同じ）で置かれ、BGM は左右に広がっている
——という、ショートでほぼ必ず成り立つ形を使う。

- side = (L−R)/2 には声が入らない（左右が同じものは消える）。**side は BGM だけの探り針**になる。
- mid = (L+R)/2 には声と BGM の真ん中ぶんが入る。
- BGM の mid と side の比 a(f) を、声の無いコマ（mid の声の帯が side に比べて小さいコマ。
  下から10%、前後2コマも声が無いもの）から帯ごとに出し、全コマの BGM を a(f)·side + side で見積もる。
  声は mid から BGM の見積もりを引いた残り。
- K 特性（ITU-R BS.1770）で重み付けし、100ms ごとの大きさにする。
- 声が鳴っている 100ms（声の大きい所から 20dB 以内、かつ BGM より大きい）で
  「声の大きさ − その間の BGM の大きさ」= **D_speech**。声の無い 100ms の BGM で D_gap。
- 効果音（side が前後2秒の中央値より 6dB 以上跳ねる 100ms）は、BGM の比較から外す。
- side だけで「話している間に BGM が下がっているか（ダッキング）」も見る（a(f) の仮定が要らない）。

分けかたには誤差がある。`validate` は、こちらの書き出しの本物の束から測った値と、
混ぜたものを分けて測った値を突き合わせる。`synth` は声の束を本物のまま BGM を別の曲に差し替え、
いくつかの大きさで誤差を出す（曲が変わっても狂わないかを見る）。`--chain` を付けると、参考の音が
通った道（投稿の AAC → YouTube の Opus → 取り込みの AAC）を真似て3回符号化してから測る。
2026-10-16 の照合（声は本物・BGM 3曲×3音量・符号化3回の9通り）では、125〜5000Hz の D_speech の
誤差（分けて測った値 − 本当の値）は平均 −0.20dB・ばらつき 0.65・最大 1.06dB。125〜1500Hz は
平均 −0.67dB、**2500〜5000Hz は平均 +3.24dB・最大 8.4dB で当てにならない**（目安だけ）。
ダッキングありのこちらの書き出し（A.mp4）を分けて測ると、本当の値より 1.6dB 小さく出た。

物差しが狂っていないかは `bgm_gap_selftest.py` が、作った声と BGM を既知の差で混ぜて毎回見る。

BGM がほぼモノラル（side が mid より 30dB 以上小さい）だと測れないので、そのときは止まる。
**試して捨てた方法**: REPET-SIM（似たコマの中央値を背景とみなす）は、話し続ける声どうしが
似ているので声を背景に漏らし、話している間の BGM を 8.5dB 大きく見積もった。

## 使いかた

  python3 bgm_gap.py measure  REF.mp4 [--out ref.json]
  python3 bgm_gap.py truth    WORK_DIR                 # render の work（stem_*.f32 と plan.json）から本当の値
  python3 bgm_gap.py validate WORK_DIR [--media A.mp4]  # 束から測った本当の値と、混ぜて分けて測った値の差
  python3 bgm_gap.py synth    WORK_DIR --bgm X.mp3 [--bgm Y.mp3] [--gains -34,-28,-22] [--chain TMP]
  python3 bgm_gap.py match    WORK_DIR --target ref.json [--bias -0.2 --bias-lo -0.67 --bias-hi 3.24]
  python3 bgm_gap.py loud     MEDIA                    # 全体の LUFS / LRA / TP（ffmpeg ebur128）

WORK_DIR は `tools/shorts/render/render.py` が残す作業の置き場（`stem_narration.f32`・`stem_bgm.f32`・
`bgm_norm.wav`・`plan.json`）。`match` は style.json の audio（bgm_rms_dbfs・duck_db・duck_hi_db）を
どう動かせば参考と同じ差になるかを、render.py の audio_stems と同じ折れ線で BGM の束を作り直して確かめる。
**render.py のダッキングの式を変えたら、下の `resynth_bgm` も同じに直す**（写しなので、ずれても赤くならない）。

## 出力

JSON（`--out` に書き、同じものを標準出力にも出す）。`measure` の読みどころは `blind.main.D_speech_db`
（125〜5000Hz・K 特性）、`blind.speech_ratio`（話している割合）、`side_vs_mid_db`、`loudness`。
`match` は `rows[]` に案ごとの bgm_rms_dbfs・duck_db・duck_hi_db と、作り直した束での本当の差。

依存: numpy と ffmpeg だけ（`measure` の読み込みと `loud` が ffmpeg を使う）。
"""
from __future__ import annotations

import argparse
import json
import math
import re
import subprocess
import sys
from pathlib import Path

import numpy as np

SR = 48000
N_FFT = 2048
HOP = 480                 # 10ms
BLOCK = 10                # 100ms = 10 コマ
SPEECH_RANGE_DB = 20      # 声の大きい所（95 パーセンタイル）から何 dB 以内を「話している」とみなすか
GAP_PCT = 10              # 声の無いコマ: mid の声の帯の超過が下から何 % か
GAP_ERODE = 2             # その前後何コマも声が無いこと（声の尻尾を拾わない）
SFX_JUMP_DB = 6           # 効果音: side が前後2秒の中央値より何 dB 跳ねたら外すか
EDGES = np.array([20] + list(np.geomspace(63, 16000, 25)) + [24000])
# 比べる帯。125Hz より下と 5kHz より上は、符号化（AAC・Opus）が side に撒くノイズと、
# 帯ごとの見積もりのばらつきで狂う（2026-10-16 の照合で、20Hz〜24kHz の全帯は AAC を通すと −4dB ずれた）
BANDS = {"main": (125, 5000), "lo": (125, 1500), "hi": (2500, 5000)}
BAND_K = {"main": True, "lo": False, "hi": False}   # main だけ K 特性（聴こえ方に寄せる）。帯ごとは重み無し
VOICE_BANDS_FOR_GAP = (250, 8000)                    # 声の有無を見る帯（摩擦音の「す・し」も拾う）


# ---------------------------------------------------------------- 入出力

def load(path: str | Path) -> np.ndarray:
    """音を (n, 2) の float64 にして返す。.f32 は render.py の stem_*.f32（48k・2ch・LE）。"""
    p = Path(path)
    if p.suffix == ".f32":
        return np.fromfile(p, dtype="<f4").astype(np.float64).reshape(-1, 2)
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", str(p), "-vn", "-ac", "2", "-ar", str(SR),
                          "-f", "f32le", "-"], capture_output=True, check=True).stdout
    return np.frombuffer(raw, dtype="<f4").astype(np.float64).reshape(-1, 2)


def loudness(path: str | Path) -> dict:
    """ffmpeg の ebur128 で、全体の I（LUFS）・LRA・トゥルーピーク（dBTP）。"""
    r = subprocess.run(["ffmpeg", "-hide_banner", "-nostats", "-i", str(path), "-vn",
                        "-af", "ebur128=peak=true", "-f", "null", "-"], capture_output=True, text=True)
    s = r.stderr[r.stderr.rfind("Summary:"):]
    g = lambda pat: float(re.search(pat, s).group(1))  # noqa: E731
    return {"integrated_lufs": g(r"I:\s+(-?[\d.]+) LUFS"), "lra_lu": g(r"LRA:\s+(-?[\d.]+) LU"),
            "true_peak_dbtp": g(r"Peak:\s+(-?[\d.]+) dBFS")}


# ---------------------------------------------------------------- スペクトル

FREQS = np.fft.rfftfreq(N_FFT, 1 / SR)
BAND_ID = np.clip(np.searchsorted(EDGES, FREQS, side="right") - 1, 0, len(EDGES) - 2)


def k_weight_power(freqs: np.ndarray) -> np.ndarray:
    """ITU-R BS.1770 の K 特性（48kHz の係数）の |H(f)|^2。"""
    z = np.exp(-1j * 2 * np.pi * freqs / SR)
    b1, a1 = [1.53512485958697, -2.69169618940638, 1.19839281085285], [1, -1.69065929318241, 0.73248077421585]
    b2, a2 = [1.0, -2.0, 1.0], [1, -1.99004745483398, 0.99007225036621]
    h = lambda b, a: (b[0] + b[1] * z + b[2] * z ** 2) / (a[0] + a[1] * z + a[2] * z ** 2)  # noqa: E731
    return np.abs(h(b1, a1) * h(b2, a2)) ** 2


KW = k_weight_power(FREQS)
WIN = np.hanning(N_FFT + 1)[:-1]
SCALE = 2.0 / (np.sum(WIN ** 2) * N_FFT)  # パーセバル（片側）で平均二乗に直す


def band_power(x: np.ndarray, weight: np.ndarray | None) -> np.ndarray:
    """(n,) → (帯, コマ) の平均二乗。weight は周波数ごとの重み（K 特性など）。"""
    xp = np.pad(x, (N_FFT // 2, N_FFT // 2))
    T = 1 + (len(xp) - N_FFT) // HOP
    out = np.zeros((len(EDGES) - 1, T))
    w = np.ones_like(FREQS) if weight is None else weight
    for s in range(0, T, 2000):
        idx = np.arange(N_FFT)[None, :] + HOP * np.arange(s, min(T, s + 2000))[:, None]
        P = (np.abs(np.fft.rfft(xp[idx] * WIN, axis=1)) ** 2).T * SCALE * w[:, None]
        acc = np.zeros((len(EDGES) - 1, P.shape[1]))
        np.add.at(acc, BAND_ID, P)
        out[:, s:s + P.shape[1]] = acc
    return out


def ms_bands(x: np.ndarray) -> dict:
    """mid と side の、K 特性つきと重み無しの帯ごとの平均二乗。"""
    M = 0.5 * (x[:, 0] + x[:, 1])
    S = 0.5 * (x[:, 0] - x[:, 1])
    return {"M_k": band_power(M, KW), "S_k": band_power(S, KW), "M": band_power(M, None), "S": band_power(S, None)}


def blocks(v: np.ndarray) -> np.ndarray:
    T = v.shape[-1] // BLOCK
    return v[..., :T * BLOCK].reshape(*v.shape[:-1], T, BLOCK).mean(-1)


def band_sel(rng: tuple[float, float] | None) -> np.ndarray:
    """帯の中心がその範囲に入るもの。"""
    if rng is None:
        return np.ones(len(EDGES) - 1, bool)
    c = np.sqrt(EDGES[:-1] * EDGES[1:])
    return (c >= rng[0]) & (c < rng[1])


def db(p) -> float:
    m = float(np.mean(p)) if np.size(p) else 0.0
    return -0.691 + 10 * math.log10(m) if m > 0 else -120.0


def erode(g: np.ndarray, k: int) -> np.ndarray:
    out = g.copy()
    for s in range(1, k + 1):
        out[s:] &= g[:-s]
        out[:-s] &= g[s:]
    return out


def rolling_median(v: np.ndarray, half: int) -> np.ndarray:
    out = np.empty_like(v)
    for i in range(len(v)):
        out[i] = np.median(v[max(0, i - half):i + half + 1])
    return out


# ---------------------------------------------------------------- 分ける（M/S）

def separate_ms(x: np.ndarray) -> dict:
    """混ざった音から、声と BGM の帯ごとの平均二乗（コマごと）を見積もる。

    帯 i の BGM の mid/side 比 a_i は、「帯 i とその隣を除いた声の帯」で声が無いと判断したコマから出す。
    帯 i 自身で選ぶと、BGM の mid/side 比がたまたま小さい瞬間ばかり拾って a_i を小さく見積もる
    （選び方の偏り。帯ごとに ±2〜8dB 狂った）。
    """
    b = ms_bands(x)
    cent = np.sqrt(EDGES[:-1] * EDGES[1:])
    vb = np.where((cent >= VOICE_BANDS_FOR_GAP[0]) & (cent < VOICE_BANDS_FOR_GAP[1]))[0]
    nb = len(EDGES) - 1
    gaps = []
    for i in range(nb):
        use = [j for j in vb if abs(j - i) > 1]
        e = 10 * np.log10(b["M_k"][use].sum(0) + 1e-18) - 10 * np.log10(b["S_k"][use].sum(0) + 1e-18)
        g = erode(e <= np.percentile(e, GAP_PCT), GAP_ERODE)
        if g.sum() < 20:
            g = e <= np.percentile(e, GAP_PCT)
        gaps.append(g)
    # 左右が1ビットも違わない音（モノラルを2ch にしたもの）は side がちょうど 0 になる。
    # log10(0) で落ちると「測れない」の断りまで届かないので、床を敷く
    side_vs_mid = 10 * math.log10(max(b["S"].sum(), 1e-30) / max(b["M"].sum(), 1e-18))
    res = {"gap_frames_median": int(np.median([g.sum() for g in gaps])), "side_vs_mid_db": round(side_vs_mid, 2)}
    for key in ("k", ""):
        Mk, Sk = (b["M_k"], b["S_k"]) if key else (b["M"], b["S"])
        a = np.array([Mk[i, gaps[i]].sum() / max(Sk[i, gaps[i]].sum(), 1e-18) for i in range(nb)])
        bgm_m = a[:, None] * Sk
        # BS.1770 は L と R の平均二乗を足す: L^2 + R^2 = 2(M^2 + S^2)
        res["voice" + ("_k" if key else "")] = 2 * np.maximum(Mk - bgm_m, 0)
        res["bgm" + ("_k" if key else "")] = 2 * (bgm_m + Sk)
        if key == "k":
            res["a_db"] = np.round(10 * np.log10(a + 1e-18), 1).tolist()
            res["side_k"] = 2 * Sk
    return res


def stems_bands(voice: np.ndarray, bgm: np.ndarray) -> dict:
    """本物の束（声・BGM）の帯ごとの平均二乗。separate_ms と同じ形で返す。"""
    v, g = ms_bands(voice), ms_bands(bgm)
    return {"voice_k": 2 * (v["M_k"] + v["S_k"]), "bgm_k": 2 * (g["M_k"] + g["S_k"]),
            "voice": 2 * (v["M"] + v["S"]), "bgm": 2 * (g["M"] + g["S"]), "side_k": 2 * g["S_k"]}


# ---------------------------------------------------------------- 大きさ

def metrics(sep: dict, vad: np.ndarray | None = None) -> dict:
    def series(name: str, key: str) -> np.ndarray:
        sel = band_sel(BANDS[name])
        return blocks(sep[key + ("_k" if BAND_K[name] else "")][sel].sum(0))

    pv, pb = series("main", "voice"), series("main", "bgm")
    lv = 10 * np.log10(pv + 1e-18)
    lb = 10 * np.log10(pb + 1e-18)
    if vad is None:
        sp = (lv >= np.percentile(lv, 95) - SPEECH_RANGE_DB) & (lv >= lb)
    else:
        sp = vad[:len(pv)]
    # 効果音（side が跳ねる 100ms）は BGM の比較から外す
    side = blocks(sep["side_k"][band_sel(BANDS["main"])].sum(0))
    ls = 10 * np.log10(side + 1e-18)
    sfx = ls > rolling_median(ls, 10) + SFX_JUMP_DB
    use = ~sfx
    gap = ~sp & use
    spu = sp & use
    out = {"blocks": int(len(pv)), "speech_ratio": round(float(sp.mean()), 3),
           "gap_seconds": round(float(gap.sum()) * 0.1, 1), "sfx_seconds_excluded": round(float(sfx.sum()) * 0.1, 1)}
    for name in BANDS:
        v, g = series(name, "voice"), series(name, "bgm")
        V = db(v[sp])
        Bs = db(g[spu])
        Bg = db(g[gap]) if gap.sum() >= 10 else None
        out[name] = {"voice_db": round(V, 2), "bgm_during_speech_db": round(Bs, 2),
                     "bgm_in_gaps_db": None if Bg is None else round(Bg, 2),
                     "D_speech_db": round(V - Bs, 2), "D_gap_db": None if Bg is None else round(V - Bg, 2),
                     "duck_seen_db": None if Bg is None else round(Bs - Bg, 2)}
    # side だけで見るダッキング（a(f) の仮定が要らない。声は side に入らない）
    if gap.sum() >= 10:
        out["duck_seen_side_only_db"] = round(db(side[spu]) - db(side[gap]), 2)
    out["_sp"] = sp
    return out


def clean(m: dict) -> dict:
    return {k: v for k, v in m.items() if not k.startswith("_")}


# ---------------------------------------------------------------- render.py の work を読む

def work_stems(work: Path) -> tuple[np.ndarray, np.ndarray]:
    narr = load(work / "stem_narration.f32")
    bgm = load(work / "stem_bgm.f32")
    src = work / "stem_source.f32"
    if src.exists():
        bgm = bgm + load(src)  # 元の音も「声でないもの」（ダッキングも BGM と同じ）
    return narr, bgm


def truth_vad(narr: np.ndarray) -> np.ndarray:
    v = ms_bands(narr)
    sel = band_sel(BANDS["main"])
    pv = blocks((v["M_k"] + v["S_k"])[sel].sum(0))
    lv = 10 * np.log10(pv + 1e-18)
    return lv >= np.percentile(lv, 95) - SPEECH_RANGE_DB


def split_band(x: np.ndarray, lo_hz: float, hi_hz: float) -> tuple[np.ndarray, np.ndarray]:
    """render.py の split_band と同じ（1本まるごとの FFT。lo〜hi をコサインで受け渡す）。"""
    X = np.fft.rfft(x, axis=0)
    f = np.fft.rfftfreq(len(x), 1 / SR)
    u = np.clip((f - lo_hz) / (hi_hz - lo_hz), 0, 1)
    lo = np.fft.irfft(X * (0.5 * (1 + np.cos(np.pi * u)))[:, None], n=len(x), axis=0)
    return lo, x - lo


def resynth_bgm(work: Path, bgm_offset_db: float, duck_db: float, duck_hi_db: float) -> np.ndarray:
    """render.py の audio_stems と同じ折れ線で BGM の束を作り直す（bgm_norm.wav = ダッキング前）。
    bgm_offset_db は style.json の bgm_rms_dbfs を何 dB 動かすか。"""
    plan = json.loads((work / "plan.json").read_text())
    au = plan["style"]["audio"]
    fps = plan["fps"]
    n = plan["frames"] * (SR // fps)
    t = np.arange(n) / SR
    bgm = load(work / "bgm_norm.wav")[:n]
    if len(bgm) < n:
        bgm = np.vstack([bgm, np.zeros((n - len(bgm), 2))])
    low, low_hi = 10 ** (duck_db / 20), 10 ** ((duck_db + duck_hi_db) / 20)
    duck, duck_h = np.ones(n), np.ones(n)
    for ln in plan["narration"]:
        s, e = ln["at"] / fps, (ln["at"] + ln["frames"]) / fps
        k = np.clip(np.maximum((s - t) / au["attack_s"], (t - e) / au["release_s"]), 0, 1)
        duck = np.minimum(duck, low + (1 - low) * k)
        duck_h = np.minimum(duck_h, low_hi + (1 - low_hi) * k)
    fades = np.ones(n)
    if au.get("bgm_fade_out_s"):
        fades *= np.clip((n / SR - t) / au["bgm_fade_out_s"], 0, 1)
    if au.get("bgm_fade_in_s"):
        fades *= np.clip(t / au["bgm_fade_in_s"], 0, 1)
    g0 = 10 ** (bgm_offset_db / 20)
    lo, hi = split_band(bgm, *au.get("duck_hi_hz", [1500, 2500]))
    return lo * (g0 * duck * fades)[:, None] + hi * (g0 * duck_h * fades)[:, None]


def diff(bl: dict, tr: dict) -> dict:
    out = {}
    for band in BANDS:
        out[band] = {k: (None if bl[band][k] is None or tr[band][k] is None else round(bl[band][k] - tr[band][k], 2))
                     for k in ("voice_db", "bgm_during_speech_db", "bgm_in_gaps_db", "D_speech_db", "D_gap_db")}
    return out


# ---------------------------------------------------------------- 口

def cmd_measure(a) -> dict:
    x = load(a.media)
    sep = separate_ms(x)
    if sep["side_vs_mid_db"] < -30:
        sys.exit(f"side が mid より {-sep['side_vs_mid_db']:.0f}dB 小さい。BGM がほぼモノラルなので、この方法では測れない")
    return {"media": str(a.media), "method": method_note(), "duration_s": round(len(x) / SR, 2),
            "loudness": loudness(a.media), "side_vs_mid_db": sep["side_vs_mid_db"], "gap_frames_median": sep["gap_frames_median"],
            "bgm_mid_over_side_db_per_band": dict(zip([f"{int(lo)}-{int(hi)}" for lo, hi in zip(EDGES[:-1], EDGES[1:])],
                                                      sep["a_db"])),
            "blind": clean(metrics(sep))}


def cmd_truth(a) -> dict:
    narr, bgm = work_stems(Path(a.work))
    return {"work": str(a.work), "truth": clean(metrics(stems_bands(narr, bgm), truth_vad(narr)))}


def cmd_validate(a) -> dict:
    work = Path(a.work)
    narr, bgm = work_stems(work)
    vad = truth_vad(narr)
    tr = metrics(stems_bands(narr, bgm), vad)
    bl = metrics(separate_ms(narr + bgm))
    res = {"work": str(work), "truth": clean(tr), "blind_on_stem_mix": clean(bl), "blind_minus_truth": diff(bl, tr),
           "vad_agreement": round(float(np.mean(tr["_sp"] == bl["_sp"][:len(tr["_sp"])])), 3)}
    if a.media:
        x = load(a.media)
        bm = metrics(separate_ms(x))
        res["blind_on_media"] = clean(bm)
        res["media"] = str(a.media)
        res["media_loudness"] = loudness(a.media)
        # 仕上げ（一定の倍率＋リミッター）で全体が動くので、差（D）だけを比べる
        res["media_D_minus_truth_D"] = {b: round(bm[b]["D_speech_db"] - tr[b]["D_speech_db"], 2) for b in BANDS}
    return res


def codec_chain(x: np.ndarray, tmp: Path) -> np.ndarray:
    """参考の音が通った道（投稿の AAC → YouTube の Opus → 取り込みの AAC 192k）を真似て通す。"""
    tmp.mkdir(parents=True, exist_ok=True)
    raw = tmp / "mix.f32"
    x.astype("<f4").tofile(raw)
    steps = [(["-f", "f32le", "-ar", str(SR), "-ac", "2", "-i", str(raw)], ["-c:a", "aac", "-b:a", "256k"], "c1.m4a"),
             (["-i", str(tmp / "c1.m4a")], ["-c:a", "libopus", "-b:a", "144k"], "c2.opus"),
             (["-i", str(tmp / "c2.opus")], ["-c:a", "aac", "-b:a", "192k", "-ar", str(SR)], "c3.m4a")]
    for inp, enc, out in steps:
        subprocess.run(["ffmpeg", "-v", "error", "-y", *inp, *enc, str(tmp / out)], check=True)
    y = load(tmp / "c3.m4a")
    if len(y) < len(x):
        y = np.vstack([y, np.zeros((len(x) - len(y), 2))])
    return y[:len(x)]


def cmd_synth(a) -> dict:
    """声の束は本物のまま、BGM を別の曲に差し替えて（ダッキング無しで）混ぜ、分け方の誤差を見る。
    --chain で、参考と同じく符号化を3回通したものも測る。"""
    narr, _ = work_stems(Path(a.work))
    vad = truth_vad(narr)
    rows = []
    for path in a.bgm:
        other = load(path)
        reps = math.ceil(len(narr) / len(other))
        other = np.tile(other, (reps, 1))[:len(narr)]
        rms = math.sqrt(float(np.mean(other ** 2)))
        for g in [float(v) for v in a.gains.split(",")]:
            b = other * (10 ** (g / 20) / rms)
            tr = metrics(stems_bands(narr, b), vad)
            mix = narr + b
            if a.chain:
                mix = codec_chain(mix, Path(a.chain))
            bl = metrics(separate_ms(mix))
            r = {"bgm": Path(path).name, "bgm_rms_dbfs": g, "codec_chain": bool(a.chain)}
            for band in BANDS:
                r[band] = {"truth_D_speech": tr[band]["D_speech_db"], "blind_D_speech": bl[band]["D_speech_db"],
                           "err": round(bl[band]["D_speech_db"] - tr[band]["D_speech_db"], 2)}
            rows.append(r)
            print(json.dumps(r, ensure_ascii=False), file=sys.stderr)
    errs = {band: [r[band]["err"] for r in rows] for band in BANDS}
    summ = {band: {"mean": round(float(np.mean(v)), 2), "sd": round(float(np.std(v)), 2),
                   "max_abs": round(float(np.max(np.abs(v))), 2)} for band, v in errs.items()}
    return {"work": str(a.work), "rows": rows, "error_summary": summ}


def cmd_match(a) -> dict:
    """参考の差に合わせるには、style.json の audio をどう動かせばよいか。

    参考の値は「分けて測った値」なので、分け方の誤差（synth で出した平均。--bias）を引いて本当の差を推す。
    こちらは本物の束があるので本当の値で合わせ、作り直した束で確かめる。同じ物差し（分けて測る）での
    値も並べる。BGM の大きさは dB でそのまま効く（線形）ので、1点測れば差が出る。
    """
    work = Path(a.work)
    ref = json.loads(Path(a.target).read_text())["blind"]
    bias = {"main": a.bias, "lo": a.bias if a.bias_lo is None else a.bias_lo, "hi": a.bias if a.bias_hi is None else a.bias_hi}
    target = {b: round(ref[b]["D_speech_db"] - bias[b], 2) for b in BANDS}
    target_gap = {b: (None if ref[b]["D_gap_db"] is None else round(ref[b]["D_gap_db"] - bias[b], 2)) for b in BANDS}
    plan = json.loads((work / "plan.json").read_text())
    au = plan["style"]["audio"]
    narr, _ = work_stems(work)
    vad = truth_vad(narr)

    def run(name, off, duck, duck_hi):
        b = resynth_bgm(work, off, duck, duck_hi)
        tr = metrics(stems_bands(narr, b), vad)
        bl = metrics(separate_ms(narr + b))
        return {"name": name, "bgm_rms_dbfs": round(au["bgm_rms_dbfs"] + off, 1), "duck_db": round(duck, 1),
                "duck_hi_db": round(duck_hi, 1),
                "truth": {k: {kk: tr[k][kk] for kk in ("D_speech_db", "D_gap_db", "duck_seen_db")} for k in BANDS},
                "blind": {k: {kk: bl[k][kk] for kk in ("D_speech_db", "D_gap_db")} for k in BANDS}}

    rows = [run("いまの設定", 0.0, au["duck_db"], au.get("duck_hi_db", 0))]
    now = rows[0]["truth"]
    # 案1: ダッキングはそのまま、BGM 全体を上げて「話している間の差」を合わせる
    off1 = now["main"]["D_speech_db"] - target["main"]
    rows.append(run("案1: BGM を上げるだけ（ダッキングはそのまま）", off1, au["duck_db"], au.get("duck_hi_db", 0)))
    # 案2: 参考と同じくダッキングをやめ（duck 0）、話している間の差を合わせる
    r0 = run("（計算用: ダッキング無し・いまの大きさ）", 0.0, 0.0, 0.0)
    off2 = r0["truth"]["main"]["D_speech_db"] - target["main"]
    rows.append(run("案2: ダッキングをやめて参考と同じ形にする", off2, 0.0, 0.0))
    # 案3: ダッキングは浅く残す（声の頭を立てる）。話している間の差は参考に合わせ、間は少し持ち上がる
    duck3 = -3.0
    r3 = run("（計算用: duck -3・いまの大きさ）", 0.0, duck3, 0.0)
    off3 = r3["truth"]["main"]["D_speech_db"] - target["main"]
    rows.append(run("案3: ダッキングを -3dB に浅くし、高い側の追い下げもやめる", off3, duck3, 0.0))
    # 案4: ダッキングはやめ（duck 0）、高い側（duck_hi_hz より上）だけ声の間に下げて、全体と高い帯の両方を合わせる。
    # 曲の明るさの差を埋める（csikos は参考の曲より 2.5k〜5k が明るい）。大きさは dB でほぼ線形なので2回直せば収まる
    off4, hi4 = off2, 0.0
    for _ in range(3):
        r4 = run("（計算用）", off4, 0.0, hi4)
        off4 += r4["truth"]["main"]["D_speech_db"] - target["main"]
        hi4 = min(0.0, hi4 - (target["hi"] - r4["truth"]["hi"]["D_speech_db"]))
    rows.append(run("案4: ダッキングをやめ、高い側だけ声の間に下げて、全体と高い帯の両方を合わせる", off4, 0.0, hi4))
    return {"work": str(work), "target_file": str(a.target), "bias_used_db": bias,
            "ref_blind": {b: ref[b] for b in BANDS}, "target_true_D_speech": target, "target_true_D_gap": target_gap,
            "style_audio_now": {k: au.get(k) for k in ("narration_rms_dbfs", "bgm_rms_dbfs", "duck_db", "duck_hi_db",
                                                       "duck_hi_hz", "attack_s", "release_s")},
            "rows": rows}


def method_note() -> dict:
    return {"separation": "M/S（side は声を含まない BGM。BGM の mid/side 比を声の無いコマから帯ごとに出す）",
            "n_fft": N_FFT, "hop": HOP, "bands": len(EDGES) - 1, "gap_frames": f"mid の声帯の超過が下から{GAP_PCT}%・前後{GAP_ERODE}コマも",
            "block_s": BLOCK * HOP / SR, "weighting": "all は K 特性（BS.1770）、帯ごと（lo/hi）は重み無し",
            "speech": f"声の 95 パーセンタイルから {SPEECH_RANGE_DB}dB 以内 かつ 声 ≥ BGM",
            "sfx": f"side が前後2秒の中央値より {SFX_JUMP_DB}dB 以上跳ねる 100ms は BGM の比較から外す",
            "D_speech": "声の大きさ − 話している間の BGM の大きさ（dB）。大きいほど BGM が小さい"}


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    s = sub.add_parser("measure"); s.add_argument("media")
    s = sub.add_parser("truth"); s.add_argument("work")
    s = sub.add_parser("validate"); s.add_argument("work"); s.add_argument("--media")
    s = sub.add_parser("synth"); s.add_argument("work"); s.add_argument("--bgm", action="append", required=True)
    s.add_argument("--gains", default="-34,-28,-22")
    s.add_argument("--chain", help="符号化を3回通す（作業用の置き場を渡す）")
    s = sub.add_parser("match"); s.add_argument("work"); s.add_argument("--target", required=True)
    s.add_argument("--bias", type=float, default=0.0, help="分け方の誤差（synth の平均、blind − truth）。main 帯")
    s.add_argument("--bias-lo", type=float, help="lo 帯の誤差（省くと --bias）")
    s.add_argument("--bias-hi", type=float, help="hi 帯の誤差（省くと --bias）")
    s = sub.add_parser("loud"); s.add_argument("media")
    for p in sub.choices.values():
        p.add_argument("--out")
    a = ap.parse_args()
    if a.cmd == "loud":
        res = loudness(a.media)
    else:
        res = {"measure": cmd_measure, "truth": cmd_truth, "validate": cmd_validate,
               "synth": cmd_synth, "match": cmd_match}[a.cmd](a)
    txt = json.dumps(res, ensure_ascii=False, indent=1)
    if a.out:
        Path(a.out).write_text(txt + "\n")
    print(txt)


if __name__ == "__main__":
    main()
