"""元の声の行（spec の `orig_voice`。帳面 F-051）の声を、聞こえる大きさに揃える。

あやと（2026-11-02、#1086）: 「配信の声の音量が前回小さくて聞こえづらかったので注意してね」。

浸水の回（flood-p2-v3）の元の声2行は、書き出しの「話している間の RMS」（render.py の speech_rms）で
AI の声と同じ −16dBFS に揃っていた。検査の「声と BGM の差」も行全体の RMS で測るので、どの行も同じに見えた。
ところが配信の音は、話している所のエネルギーの多くが 125〜500Hz（部屋鳴り・マイクの近さ・こもり）と
80Hz より下（揺れ・ゴロゴロ）にあり、言葉が聞き分けられる 500〜3000Hz が AI の声より 8〜15dB 薄い。
RMS で揃えると、その「聞こえない帯」に音量を使い切って、言葉の帯が小さいまま残る。声の帯
（300〜3400Hz）で話している所だけを測ると、AI の声の真ん中より 0.8dB・3.1dB 小さかった。

だからここでは:

1. **測る**（`voice_level_db`）: 声の帯 300〜3400Hz だけを取り、50ms ごとの大きさのうち、いちばん大きい窓から
   20dB 以内の窓（話している所）の平均。品質チェック（qa/audio.py）も**この1本を読む**（写さない）
2. **整える**（`clean`）: 80Hz より下を切る・こもりの帯（〜250Hz）と高い側の荒れ（6kHz〜）を少し下げる・
   話していない所の雑音を軽く下げる（最大 10dB）・山を軽く抑える（1.5:1）。どれも声の質を変えない深さに留める
3. **揃える**（`fit`）: 同じ動画の AI の声の行を同じ物差しで測った真ん中に、`over_ai_db`（既定 +1dB）を足した大きさへ

numpy だけで、同じ入力から同じ出力（FFT とブロックの計算だけ。乱数を使わない）。
"""
from __future__ import annotations

import math

import numpy as np

SR = 48000

# ---------------------------------------------------------------- 物差し（書き出しと品質チェックが同じこれを読む）

# 声の帯。電話の帯域と同じ 300〜3400Hz。言葉の聞き分けはほぼこの中で決まり、BGM が声を隠すのもこの帯。
# 80Hz より下の揺れや、配信の圧縮で痩せた 4kHz より上は、大きさに数えない
VOICE_BAND_HZ = (300.0, 3400.0)
# 窓は 50ms（render.py の speech_rms と同じ。1音節より短く、子音1つより長い）
FRAME_S = 0.05
# いちばん大きい窓から 20dB 以内を「話している所」と読む（speech_rms と同じ線）。息継ぎ・語の間・頭と尻の無音は数えない
GATE_DB = 20.0


def band(x: np.ndarray, lo: float, hi: float, sr: int = SR) -> np.ndarray:
    """lo〜hi Hz だけを残す（1本まるごとの FFT。位相は動かさない）。"""
    n = len(x)
    if n == 0:
        return x.astype(np.float64)
    X = np.fft.rfft(x.astype(np.float64))
    f = np.fft.rfftfreq(n, 1 / sr)
    X[(f < lo) | (f > hi)] = 0
    return np.fft.irfft(X, n)


def voice_level_db(x: np.ndarray, sr: int = SR) -> float:
    """話している所だけの、声の帯の大きさ（dBFS）。音が無ければ -inf。

    1本の声（1ch）を渡す。2ch なら平均してから渡す。
    """
    x = np.asarray(x, dtype=np.float64)
    if x.ndim > 1:
        x = x.mean(axis=1)
    w = int(round(sr * FRAME_S))
    k = len(x) // w
    if k == 0:
        return -math.inf
    y = band(x, *VOICE_BAND_HZ, sr=sr)
    p = np.mean(y[: k * w].reshape(k, w) ** 2, axis=1)
    top = float(p.max())
    if top <= 1e-20:
        return -math.inf
    keep = p >= top * 10 ** (-GATE_DB / 10)
    return 10 * math.log10(float(p[keep].mean()))


# ---------------------------------------------------------------- 整える

# 既定（様式の audio.orig_voice で上書きできる）。浸水の回（6isSTrZEQ9U）の元の声2行と AI の声12行を、
# 話している所の帯ごとの大きさで比べて決めた（2026-11-02）。元の声は AI の声より 50〜80Hz が 17〜24dB・
# 125〜315Hz が 8〜11dB・5kHz より上が 6〜17dB 多く、500〜1250Hz が 3〜15dB 少なかった（声の帯で揃えたあと）。
# 多すぎる側だけを削り、足りない側は持ち上げない（持ち上げると配信の圧縮の荒れまで大きくなる）。
# どれも「声の質を変えない」深さ: 低い側を切るのは男声の地声（100〜150Hz）より下・こもりは −6dB・高い側は −4dB・
# 雑音は最大 10dB・山は 1.5:1
DEFAULTS = {
    # AI の声の真ん中より、この dB だけ上に揃える（あやと「聞こえづらかった」→ 同じか少し上）。+1 にすると、配信の声は
    # 高い側の残りで K 特性の大きさ（LUFS の重み）が声の帯より 0.5〜1.2dB 上に出て、浸水の回の「えぐいって」が
    # K 特性で AI の声より +2.1dB と飛び出した。+0.5 なら声の帯で +0.5・K 特性で +1.0〜+1.7 に収まる
    "over_ai_db": 0.5,
    "hpf_hz": [60.0, 110.0],    # ここから下を切る（60Hz で 0、110Hz で 1 へ余弦でつなぐ）。揺れ・ゴロゴロ・空調
    "deboom_db": -6.0,          # こもりの帯（部屋鳴り・マイクの近さ）を下げる量
    "deboom_hz": [250.0, 450.0],  # 250Hz より下を deboom_db、450Hz より上は 0dB（間は余弦）。声の帯 300Hz〜はほぼ触らない
    "hiss_db": -4.0,            # 高い側（配信の圧縮の荒れ・シャー）を下げる量
    "hiss_hz": [3500.0, 6000.0],  # 3500Hz より上で下げ始め、6000Hz より上は hiss_db
    "nr_max_db": 10.0,          # 雑音を下げる上限（深くすると水の中の声になる）
    "nr_over": 2.0,             # 雑音の見積もりの何倍までを雑音と読むか（パワー比）
    "nr_floor_pct": 10.0,       # 周波数ごとの雑音の見積もり（その行の窓のうち、静かな方から何 % の大きさ）
    "comp_ratio": 1.5,          # 山の抑え（threshold より上を 1/ratio に）。叫びの1音だけが飛び出て、続く語が小さいのをならす
    "comp_below_top_db": 10.0,  # threshold は「いちばん大きい 10ms」から何 dB 下か
    "comp_attack_s": 0.005,
    "comp_release_s": 0.08,
    "peak": 0.95,               # 揃えたあとの頂点の上限（wav の 16bit に書いても割れない）
}


def cfg_of(over: dict | None) -> dict:
    return {**DEFAULTS, **(over or {})}


def ramp(f: np.ndarray, a: float, b: float) -> np.ndarray:
    """a Hz で 0、b Hz で 1、間は余弦でなめらかに。"""
    u = np.clip((f - a) / max(b - a, 1e-9), 0, 1)
    return 0.5 - 0.5 * np.cos(np.pi * u)


def eq_curve(f: np.ndarray, c: dict) -> np.ndarray:
    """周波数ごとの倍率（振幅）。低い側を切る × こもりを下げる × 高い側の荒れを下げる。"""
    hp = ramp(f, *c["hpf_hz"])
    deboom = 10 ** (c["deboom_db"] * (1 - ramp(f, *c["deboom_hz"])) / 20)
    hiss = 10 ** (c["hiss_db"] * ramp(f, *c["hiss_hz"]) / 20)
    return hp * deboom * hiss


def equalize(x: np.ndarray, c: dict, sr: int = SR) -> np.ndarray:
    n = len(x)
    X = np.fft.rfft(x)
    return np.fft.irfft(X * eq_curve(np.fft.rfftfreq(n, 1 / sr), c), n)


def denoise(x: np.ndarray, c: dict) -> tuple[np.ndarray, float]:
    """話していない所の雑音を軽く下げる（周波数ごとの門。下げるのは最大 nr_max_db）。

    雑音の大きさは、周波数ごとに「その行の窓のうち静かな方から nr_floor_pct %」で見積もる（行の中だけで決まる）。
    窓の大きさが雑音の nr_over 倍に届かない所を、届かない度合いに応じて下げる（ウィーナーの形）。
    倍率は時間と周波数の両方で隣となじませて、粒立った「ピロピロ」を出さない。返すのは (音, 雑音を下げた量 dB の中央値)。
    """
    nfft, hop = 1024, 256
    n = len(x)
    if n < nfft:
        return x, 0.0
    pad = nfft
    xp = np.concatenate([np.zeros(pad), x, np.zeros(pad + nfft)])
    win = np.hanning(nfft + 1)[:-1]
    m = 1 + (len(xp) - nfft) // hop
    idx = np.arange(nfft)[None, :] + hop * np.arange(m)[:, None]
    S = np.fft.rfft(xp[idx] * win, axis=1)
    P = np.abs(S) ** 2
    # 頭と尻に足したゼロの窓は雑音の見積もりに入れない
    real = (np.arange(m) * hop + nfft > pad) & (np.arange(m) * hop < pad + n)
    N = np.percentile(P[real], c["nr_floor_pct"], axis=0)
    snr = P / np.maximum(N[None, :] * c["nr_over"], 1e-20)
    g = np.clip(1 - 1 / np.maximum(snr, 1e-9), 0, 1)
    floor = 10 ** (-c["nr_max_db"] / 20)
    g = np.maximum(np.sqrt(g), floor)
    # 隣となじませる（時間 3窓・周波数 5本の移動平均）
    kt, kf = 3, 5
    gp = np.pad(g, ((kt // 2, kt // 2), (kf // 2, kf // 2)), mode="edge")
    acc = np.zeros_like(g)
    for i in range(kt):
        for j in range(kf):
            acc += gp[i:i + m, j:j + g.shape[1]]
    g = acc / (kt * kf)
    Y = np.fft.irfft(S * g, nfft, axis=1) * win
    y = np.zeros(len(xp))
    wsum = np.zeros(len(xp))
    for k in range(m):
        y[k * hop:k * hop + nfft] += Y[k]
        wsum[k * hop:k * hop + nfft] += win ** 2
    y = y / np.maximum(wsum, 1e-9)
    # 雑音の見積もりの窓（静かな方の 2割）で、どれだけ下げたか
    quiet = real & (P.sum(axis=1) <= np.percentile(P[real].sum(axis=1), 20))
    red = -20 * math.log10(max(float(np.median(g[quiet])), 1e-9)) if quiet.any() else 0.0
    return y[pad:pad + n], round(red, 2)


def compress(x: np.ndarray, c: dict, sr: int = SR) -> tuple[np.ndarray, float]:
    """山を軽く抑える（10ms ごとの RMS で、いちばん大きい所から comp_below_top_db 下より上を 1/ratio に）。

    返すのは (音, いちばん深く抑えた dB)。立ち上がり attack・戻り release で倍率をなめらかにする。
    """
    b = int(sr * 0.01)
    k = len(x) // b
    if k < 2:
        return x, 0.0
    r = np.sqrt(np.mean(x[: k * b].reshape(k, b) ** 2, axis=1))
    lv = 20 * np.log10(np.maximum(r, 1e-9))
    th = float(lv.max()) - c["comp_below_top_db"]
    want = np.where(lv > th, (th - lv) * (1 - 1 / c["comp_ratio"]), 0.0)
    a_k = math.exp(-0.01 / max(c["comp_attack_s"], 1e-4))
    r_k = math.exp(-0.01 / max(c["comp_release_s"], 1e-4))
    g = np.zeros(k)
    cur = 0.0
    for i in range(k):
        t = want[i]
        cur = a_k * cur + (1 - a_k) * t if t < cur else r_k * cur + (1 - r_k) * t
        g[i] = cur
    t_b = (np.arange(k) + 0.5) * b
    gs = np.interp(np.arange(len(x)), t_b, g)
    return x * 10 ** (gs / 20), round(float(-g.min()), 2)


def limit_peak(x: np.ndarray, peak: float, sr: int = SR) -> tuple[np.ndarray, float]:
    """頂点が peak を越える所だけ下げる（1ms ごとに要る倍率を出し、前後 5ms の最小で広げ、前後 2ms でならす）。

    広げた幅（5ms）がならす幅（2ms）と、ならした倍率を標本へ引き延ばす幅（1ms）の和より広いので、どの標本でも
    倍率は「その 1ms に要る倍率」以下に収まる（頂点は線を越えない）。標本を線に貼り付けないので、
    品質チェックの「声の平らな頂点」（同じ値が 4標本続く）も作らない。
    """
    top = float(np.max(np.abs(x))) if len(x) else 0.0
    if top <= peak:
        return x, 0.0
    b = sr // 1000
    k = math.ceil(len(x) / b)
    xp = np.concatenate([np.abs(x), np.zeros(k * b - len(x))])
    need = np.minimum(1.0, peak / np.maximum(xp.reshape(k, b).max(axis=1), 1e-12))
    rad = 5
    gp = np.pad(need, rad, mode="edge")
    gmin = np.min(np.stack([gp[i:i + k] for i in range(2 * rad + 1)]), axis=0)
    sm = np.convolve(np.pad(gmin, (2, 2), mode="edge"), np.ones(5) / 5, mode="valid")
    g = np.interp(np.arange(len(x)), (np.arange(k) + 0.5) * b, sm)
    return x * g, round(-20 * math.log10(max(float(g.min()), 1e-9)), 2)


def clean(x: np.ndarray, over: dict | None = None, sr: int = SR) -> tuple[np.ndarray, dict]:
    """配信の声を整える（低い側を切る・こもりと高い側の荒れを下げる・雑音を軽く下げる・山を軽く抑える）。大きさはまだ揃えない。"""
    c = cfg_of(over)
    x = np.asarray(x, dtype=np.float64)
    y = equalize(x, c, sr)
    y, nr = denoise(y, c)
    y, gr = compress(y, c, sr)
    return y, {"hpf_hz": c["hpf_hz"], "deboom_db": c["deboom_db"], "hiss_db": c["hiss_db"],
               "noise_reduced_db": nr, "comp_max_db": gr}


# 頂点を抑えたぶんを取り返すために足してよい倍率の上限（dB）。届かない目標を追いかけると、倍率だけが上がって
# 雑音まで持ち上がり、声は抑えに潰される（合成の声で、こもりを残すと +60dB まで上がった）。届かなければ
# 届かないまま返し、品質チェック（AI の声より −0.5dB 未満）に落としてもらう
MAX_MAKEUP_DB = 6.0


def fit(x: np.ndarray, target_db: float, over: dict | None = None, sr: int = SR) -> tuple[np.ndarray, dict]:
    """整えた声を、声の帯の大きさが target_db になるように上げ下げし、頂点を peak に収める。

    頂点を抑えると大きさが下がる（打音の多い声ほど、上げた倍率の一部が抑えに食われる）ので、測り直して倍率を
    直す。2回目からは割線法（前の2回の「倍率 → 大きさ」の傾き）で寄せ、0.05dB 以内か 8回で止める。
    足す倍率は MAX_MAKEUP_DB まで。傾きが 0.3 を切る（上げた倍率の 7割より多くが抑えに食われる）なら、それ以上は上げない。
    """
    c = cfg_of(over)
    now = voice_level_db(x, sr)
    if not math.isfinite(now):
        return x, {"gain_db": 0.0, "voice_db": now, "limited_db": 0.0}
    tried: list[tuple[float, float, np.ndarray, float]] = []
    gain = target_db - now
    top = gain + MAX_MAKEUP_DB
    for _ in range(8):
        y, lim = limit_peak(x * 10 ** (gain / 20), c["peak"], sr)
        got = voice_level_db(y, sr)
        tried.append((gain, got, y, lim))
        if abs(got - target_db) <= 0.05:
            break
        step = target_db - got
        if len(tried) >= 2 and abs(tried[-1][0] - tried[-2][0]) > 1e-9:
            slope = (tried[-1][1] - tried[-2][1]) / (tried[-1][0] - tried[-2][0])
            if slope < 0.3 and step > 0:
                break
            step /= max(slope, 0.3)
        nxt = min(gain + step, top)
        if abs(nxt - gain) < 1e-6:
            break
        gain = nxt
    # 目標にいちばん近かった回を返す
    gain, got, y, lim = min(tried, key=lambda t: abs(t[1] - target_db))
    return y, {"gain_db": round(gain, 2), "voice_db": round(got, 2), "limited_db": lim}
