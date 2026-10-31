"""BGM の大きさの物差し（`bgm_gap.py`）が狂っていないかの見張り。**音のファイルも ffmpeg も使わない。**

    python3 tools/shorts/style/bgm_gap_selftest.py

終了コード 0=物差しは合っている / 1=狂っている（差が ±1.5dB を外れた） /
2=確かめられなかった（numpy が無い・対照が外れた・値が数でない）。

## 何を見るか

`bgm_gap.py` は、参考のショートの「声 − 話している間の BGM」（D_speech）を混ざった1本から測り、
こちらの BGM の大きさ（style.json の `bgm_rms_dbfs`）をそれに合わせる元になる。**物差しが 3dB 狂えば、
書き出しの BGM が 3dB 狂う**のに、どこも赤くならない。だから答えの分かっている音で毎回当てる。

1. numpy で「声らしい音」（真ん中に1本・基本周波数が揺れる倍音・音節の山・摩擦音・息継ぎの間）と
   「BGM らしい音」（左右に広がる 1/f の雑音と和音。参考と同じく mid が side より 6dB ほど大きい）を作る
2. 声の大きさと BGM の大きさを、**この見張りが自分で**（`bgm_gap.py` の部品を使わずに）K 特性・
   125〜5000Hz で測り、差がちょうど 8 / 13.5 / 19dB になるように BGM を混ぜる
3. 混ぜた1本を `bgm_gap.py` の分け方（`separate_ms` → `metrics`）で測り、差が ±1.5dB に入るか
   （2026-10-16 に本物の声と3曲で照合した誤差は最大 1.06dB。その外は物差しが壊れたとみる）
4. 束から測る側（`stems_bands` → `metrics`。`match` が設定を計算するときに使う）も、13.5dB で ±1.5dB
5. BGM が左右同じ（モノラル）なら `side_vs_mid_db` が −30 を下回り、`measure` が止まる側に倒れる

## 対照（`docs/island-standards.md` §15）

本物を測る前に、**この見張りが落ちられるか**を先に見る。

- 判定: 1.4dB ずれは通し、1.6dB ずれは落とす
- **作った音が「分け方が壊れていても気づける」難しさか**: BGM の mid を side と同じ大きさと決め打つ
  （分けずに side だけで BGM を見積もる）壊れた物差しで測ると、±1.5dB を外れること。
  BGM がほとんど side にある音で当てていると、分け方を壊しても緑のまま——それを止める

1つでも外れたら、本物の数字は出さずに 2 で落ちる。
"""

from __future__ import annotations

import math
import sys
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

try:
    import numpy as np
    import bgm_gap as bg  # noqa: E402
except ImportError as e:  # numpy が無い箱。「測れなかった」を「通った」と同じ顔にしない
    print(f"NG  確かめられない（{e}）。numpy が要る")
    sys.exit(2)

TOL_DB = 1.5                 # 2026-10-16 の照合の最大誤差 1.06dB に、作った音のぶんの余裕を足した
TARGETS_DB = (8.0, 13.5, 19.0)
DUR_S = 16.0
SR = bg.SR
SEED = 20261016


# ---------------------------------------------------------------- 答えを自分で測る（bgm_gap.py を使わない）

def k_power(f: np.ndarray) -> np.ndarray:
    """ITU-R BS.1770 の K 特性（48kHz の係数）の |H(f)|^2。

    `bgm_gap.py` にも同じ式があるが、**写して使わない**——あちらの係数が壊れたら、ここの答えまで
    一緒に動いて気づけなくなる。係数は規格の表のとおり。
    """
    z1 = np.exp(-2j * np.pi * f / SR)
    shelf_b, shelf_a = (1.53512485958697, -2.69169618940638, 1.19839281085285), (1.0, -1.69065929318241, 0.73248077421585)
    hp_b, hp_a = (1.0, -2.0, 1.0), (1.0, -1.99004745483398, 0.99007225036621)

    def h(b, a):
        return (b[0] + b[1] * z1 + b[2] * z1 * z1) / (a[0] + a[1] * z1 + a[2] * z1 * z1)

    return np.abs(h(shelf_b, shelf_a) * h(hp_b, hp_a)) ** 2


def weighted(x: np.ndarray) -> np.ndarray:
    """K 特性をかけ、125〜5000Hz だけを残した波形（1本まるごとの FFT）。"""
    X = np.fft.rfft(x)
    f = np.fft.rfftfreq(len(x), 1 / SR)
    keep = (f >= 125) & (f < 5000)
    return np.fft.irfft(X * np.sqrt(k_power(f)) * keep, len(x))


def true_gap_db(voice: np.ndarray, bgm: np.ndarray, speech: np.ndarray) -> float:
    """話している間の「声 − BGM」（dB）。BS.1770 と同じく左右の二乗を足す（声は左右同じなので 2 倍）。"""
    vw = weighted(voice)
    bl, br = weighted(bgm[:, 0]), weighted(bgm[:, 1])
    pv = float(np.mean(2 * vw[speech] ** 2))
    pb = float(np.mean(bl[speech] ** 2 + br[speech] ** 2))
    return 10 * math.log10(pv / pb)


# ---------------------------------------------------------------- 音を作る

def make_sounds() -> tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
    """（声 (n,)、BGM (n, 2)、話している区間の印 (n,) bool、モノラルの BGM (n, 2)）。"""
    rng = np.random.default_rng(SEED)
    n = int(DUR_S * SR)
    t = np.arange(n) / SR

    # 息継ぎの間で区切った句。区切りを 0.1 秒の刻みに置くのは、bgm_gap.py の 100ms のかたまりと
    # 揃えるため（かたまりの途中で声が切れると、そのかたまりの「話している間」の重みが測るたびに揺れる）
    segs, s = [], 0.3
    while True:
        on, off = round(rng.uniform(1.6, 3.0), 1), round(rng.uniform(0.4, 0.8), 1)
        if s + on > DUR_S - 0.3:
            break
        segs.append((int(round(s * SR)), int(round((s + on) * SR))))
        s += on + off
    ramp = int(0.01 * SR)
    win = 0.5 - 0.5 * np.cos(np.linspace(0, np.pi, ramp))
    phrase = np.zeros(n)
    for a, b in segs:
        phrase[a:b] = 1.0
        phrase[a:a + ramp] *= win
        phrase[b - ramp:b] *= win[::-1]
    speech = phrase > 0.999

    # 声: 基本周波数が揺れる倍音に、声道の山（650 / 1150 / 2600Hz）を付ける
    f0 = 165 + 25 * np.sin(2 * np.pi * 0.6 * t) + 10 * np.sin(2 * np.pi * 5.3 * t)
    phase = 2 * np.pi * np.cumsum(f0) / SR
    src = np.zeros(n)
    for k in range(1, 36):
        fk = 165.0 * k
        g = 0.06 + sum(amp * math.exp(-0.5 * (math.log(fk / fc) / bw) ** 2)
                       for fc, bw, amp in ((650, 0.25, 1.0), (1150, 0.22, 0.7), (2600, 0.2, 0.35)))
        src += g / math.sqrt(k) * np.sin(k * phase + rng.uniform(0, 2 * np.pi))
    syll = 0.35 + 0.65 * np.abs(np.sin(np.pi * 4.5 * t + rng.uniform(0, np.pi)))   # 1秒に 4.5 音節
    # 摩擦音（す・し）: 3〜8kHz の雑音を 60ms ずつ、句の中にまばらに
    noise = np.fft.rfft(rng.standard_normal(n))
    fr = np.fft.rfftfreq(n, 1 / SR)
    hiss = np.fft.irfft(noise * ((fr >= 3000) & (fr < 8000)), n)
    burst = np.zeros(n)
    for a, b in segs:
        for c in rng.uniform(a, b - 0.06 * SR, size=max(1, int((b - a) / SR * 1.5))):
            burst[int(c):int(c + 0.06 * SR)] = 1.0
    src /= np.sqrt(np.mean(src ** 2))
    hiss /= np.sqrt(np.mean(hiss ** 2))
    voice = (src * syll + 0.35 * hiss * burst) * phrase
    voice *= 0.1 / np.sqrt(np.mean(voice[speech] ** 2))      # 話している間で −20dBFS ほど

    # BGM: 1/f の雑音（左右で共通のぶん＋別々のぶん）と、左右で位相の違う和音
    def pink() -> np.ndarray:
        X = np.fft.rfft(rng.standard_normal(n))
        w = np.where((fr >= 60) & (fr <= 12000), 1 / np.sqrt(np.maximum(fr, 1.0)), 0.0)
        y = np.fft.irfft(X * w, n)
        return y / np.sqrt(np.mean(y ** 2))

    common, own_l, own_r = pink(), pink(), pink()
    chord = np.zeros((n, 2))
    for base in (220.0, 277.18, 329.63, 440.0, 554.37):
        for h in range(1, 5):
            for ch in range(2):
                chord[:, ch] += 0.25 / h * np.sin(2 * np.pi * (base * h + rng.uniform(-0.3, 0.3)) * t
                                                  + rng.uniform(0, 2 * np.pi))
    bgm = np.stack([common + 0.8 * own_l, common + 0.8 * own_r], axis=1) + chord
    bgm /= np.sqrt(np.mean(bgm ** 2))
    mono = np.repeat(bgm.mean(axis=1, keepdims=True), 2, axis=1)
    return voice, bgm, speech, mono


def mix_at(voice: np.ndarray, bgm: np.ndarray, speech: np.ndarray, target_db: float) -> tuple[np.ndarray, np.ndarray]:
    """差がちょうど target_db になるように BGM を混ぜる。（混ぜた1本、混ぜた BGM）"""
    now = true_gap_db(voice, bgm, speech)
    g = 10 ** ((now - target_db) / 20)
    b = bgm * g
    return voice[:, None] + b, b


# ---------------------------------------------------------------- 測る（bgm_gap.py）

def blind_db(mix: np.ndarray) -> tuple[float, float]:
    m = bg.metrics(bg.separate_ms(mix))
    return m["main"]["D_speech_db"], m["speech_ratio"]


def naive_db(mix: np.ndarray) -> float:
    """壊れた物差し（対照）: BGM の mid を side と同じ大きさと決め打ち、分けずに測る。"""
    b = bg.ms_bands(mix)
    sep = {"voice_k": 2 * np.maximum(b["M_k"] - b["S_k"], 0), "bgm_k": 4 * b["S_k"],
           "voice": 2 * np.maximum(b["M"] - b["S"], 0), "bgm": 4 * b["S"], "side_k": 2 * b["S_k"]}
    return bg.metrics(sep)["main"]["D_speech_db"]


def within(got: float, want: float) -> bool:
    return math.isfinite(got) and abs(got - want) <= TOL_DB


def main() -> int:
    t0 = time.monotonic()
    print("[対照] この見張りが、落ちるときに落ちるか")
    ok = True

    def control(cond: bool, what: str) -> None:
        nonlocal ok
        print(f"  {'○' if cond else '✕'} {what}")
        ok = ok and cond

    control(within(13.5 + 1.4, 13.5), "1.4dB のずれは通す")
    control(not within(13.5 + 1.6, 13.5), "1.6dB のずれは落とす")
    control(not within(float("nan"), 13.5), "数でない値は落とす")

    voice, bgm, speech, mono = make_sounds()
    mix13, b13 = mix_at(voice, bgm, speech, 13.5)
    nv = naive_db(mix13)
    control(not within(nv, 13.5),
            f"分け方を壊した物差しは外れる（作った音で {nv:.2f}dB、答え 13.5dB）——作った音が易しすぎない")
    if not ok:
        print("\nNG  対照が外れた。本物の数字は出さない")
        return 2

    print("\n[本物] bgm_gap.py の物差し（答えはこの見張りが自分で測った値）")
    fails: list[str] = []
    side = bg.separate_ms(mix13)["side_vs_mid_db"]

    def check(cond: bool, what: str) -> None:
        print(f"  {'ok' if cond else 'NG'}  {what}")
        if not cond:
            fails.append(what)

    for want in TARGETS_DB:
        mix = mix13 if want == 13.5 else mix_at(voice, bgm, speech, want)[0]
        got, ratio = blind_db(mix)
        if not math.isfinite(got):
            print(f"NG  {want}dB の混ぜもので、測った値が数でない（{got}）")
            return 2
        check(within(got, want), f"混ぜた1本から分けて測る: 答え {want:.1f}dB → {got:.2f}dB"
                                 f"（ずれ {got - want:+.2f}・話している割合 {ratio:.2f}）")

    stems = bg.metrics(bg.stems_bands(np.repeat(voice[:, None], 2, axis=1), b13),
                       bg.truth_vad(np.repeat(voice[:, None], 2, axis=1)))["main"]["D_speech_db"]
    check(within(stems, 13.5), f"束から測る（match が使う側）: 答え 13.5dB → {stems:.2f}dB（ずれ {stems - 13.5:+.2f}）")

    mono_mix = voice[:, None] + mono * (b13.std() / max(mono.std(), 1e-12))
    mside = bg.separate_ms(mono_mix)["side_vs_mid_db"]
    check(math.isfinite(mside) and mside < -30,
          f"BGM が左右同じなら side_vs_mid_db が −30 を下回る（{mside:.1f}dB。左右に広がった BGM では {side:.1f}dB）")

    dt = time.monotonic() - t0
    if fails:
        print(f"\nNG  BGM の物差しが狂っている（{len(fails)}件、±{TOL_DB}dB の外）。{dt:.1f}秒")
        return 1
    print(f"\nOK  BGM の物差し {len(TARGETS_DB) + 2}件・対照 4件 全部通った（±{TOL_DB}dB）。{dt:.1f}秒")
    return 0


if __name__ == "__main__":
    sys.exit(main())
