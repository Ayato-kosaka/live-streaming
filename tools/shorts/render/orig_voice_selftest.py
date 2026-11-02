"""**元の声の行（帳面 F-051）が、AI の声と同じか少し上に聞こえる大きさで書き出されるか。品質チェックがそれを見ているか。**

    python3 tools/shorts/render/orig_voice_selftest.py
    BREAK=fit python3 tools/shorts/render/orig_voice_selftest.py   # 守りを1つ外した版で回す（対照の子）

終了コード 0=通った / 1=落ちた / **2=数えるものが無い・外す字が見つからない**
（`docs/island-standards.md` §15）。

あやと（2026-11-02、#1086）「配信の声の音量が前回小さくて聞こえづらかったので注意してね」。浸水の回 v3 の元の声2行は、
書き出しが行全体の「話している間の RMS」で AI の声と同じ −16dBFS に揃えていて、検査の「声と BGM の差」も行全体の RMS で
同じに見えた。配信の音はエネルギーが低い側（部屋鳴り・こもり・揺れ）に寄っているので、声の帯（300〜3400Hz）の
話している所だけを測ると AI の声より 0.8dB・3.1dB 小さかった。直したのは3か所:

- `orig_voice.py` — 物差し（`voice_level_db`）と、配信の声を整える処理（`clean`）・揃える処理（`fit`）
- `render.py` — 時間割に元の声の印を運び（`plan`）、元の声の行だけ「整える → AI の声の真ん中 + 0.5dB」で揃える（`audio_stems`）
- `../qa/audio.py` — 「声と BGM の差」に、元の声の行を AI の声の行と同じ物差しで比べる線（−0.5〜+3dB）

要るのは ffmpeg・numpy・Pillow（書き出しの `render.py` を読む）。Selftests には numpy が無いので、回し役
（`python/selftest_runner.py`）の SKIP に理由つきで載せ、`.github/workflows/shorts_selftest.yml` が名指しで回す。

## 何を見るか

声は合成する（倍音の母音を音節で区切ったもの）。AI の声は明るく雑音の無い声、元の声は同じ形の声に
「45Hz の揺れ・120〜300Hz のこもり・薄い言葉の帯・途切れない雑音・2ms の打音」を足した配信の声。
**物差しの手計算は `orig_voice.py` を使わずに書く**（見張りが本物と同じ式を借りると、本物が壊れても一緒に壊れて緑のまま）。

| 足 | 確かめること |
| --- | --- |
| `measure` | 物差し: 1kHz の正弦（振幅 0.1）が −23.01dB。45Hz の揺れ（振幅 0.5）や 6kHz を足しても動かない（声の帯の外）。半分が無音でも動かない（門）。12dB 小さい後半は数え、26dB 小さい後半は数えない（いちばん大きい窓から 20dB の門） |
| `clean` | 整える: 50Hz より下が声の帯より 20dB 以上下がる・120〜250Hz のこもりが 3dB 以上下がる・言葉のない所の雑音が話している所に比べて 3〜12dB 下がる・言葉の帯（500〜3000Hz）の形は元のまま（相関 0.9 以上）・長さが同じ |
| `plan_flag` | 書き出しの時間割（`plan`）が、指示書の行の `orig_voice` を音の束の行まで運ぶ（AI の声の行には付けない） |
| `stems` | 書き出しの声の束（`audio_stems`）: 元の声の行が、AI の声の行の真ん中より 0〜+1dB（声の帯の話している所）。AI の声の行は前のまま「話している間の RMS」−16dBFS。元の声の行の 50Hz より下は声の帯より 15dB 以上下・頂点は 0.95 以下で平らな頂点が無い。AI の声の行が無い回も落ちずに揃う |
| `qa_rows` | 品質チェックの比べ方（`orig_voice_rows`）: 揃えた束は落ちない。前の書き出し（行全体の RMS で −16dBFS）の束は「元の声」で落ちる・+5dB の叫びも落ちる・元の声の行が無ければ何も言わない・AI の声の行が無ければ比べない |
| `qa_check` | 品質チェックの「声と BGM の差」そのもの（`check_voice_vs_bgm`）: 前の書き出しの束で fail（理由に「元の声」）・揃えた束で pass（要約に「元の声」） |

## 守りを1つずつ外す（§15「対照は、足の数だけ用意する」）

下の `CUTS` が本物の字を1か所だけ書き換えた写しを作り、それで足を全部回す。**外した守りの足だけが落ちる**
ことを確かめる。外す字が本物に見つからなければ 2 で落ちる（字を直したのに、ここを直し忘れた）。
"""
from __future__ import annotations

import importlib.util
import json
import math
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
BREAK = os.environ.get("BREAK", "")
SR = 48000
FPS = 30
SPF = SR // FPS

# 名前: (ファイル（render/ からの道）, 本物の字, 外した字, 落ちるはずの足, 何を外したか)
# 書き出しの声が AI の声より 0.5dB 以上小さくなる外し方では、品質チェックの足（qa_rows の「揃えた束は落ちない」・
# qa_check の「揃えた束で pass」）も落ちるのが正しい。品質チェックが書き出しの崩れを拾った、ということ。
# 揺れ（hpf）・整え（no_clean）を外すと、揺れと打音が頂点を食って、上げても声の帯が届かない（−5〜−6dB）
CUTS: dict[str, tuple[str, str, str, set[str], str]] = {
    "flag": ("render.py", "                      **({\"orig_voice\": True} if ln.get(\"orig_voice\") else {})})\n",
             "                      })\n",
             {"plan_flag"}, "時間割に元の声の印を運ばない（音の束で AI の声と同じ揃え方になる）"),
    "fit": ("render.py", "        y, got = OV.fit(y, target, ov_cfg)\n",
            "        y = y * db(au[\"narration_rms_dbfs\"]) / max(speech_rms(y), 1e-9)\n"
            "        got = {\"gain_db\": 0.0, \"voice_db\": 0.0, \"limited_db\": 0.0}\n",
            {"stems", "qa_rows", "qa_check"}, "元の声の行を前と同じ「話している間の RMS」で揃える（言葉の帯が小さいまま）"),
    "no_clean": ("render.py", "        y, info = OV.clean(x, ov_cfg)\n",
                 "        y, info = x.astype(np.float64), {}\n",
                 {"stems", "qa_rows", "qa_check"}, "元の声を整えずに揃える（揺れ・こもり・雑音がそのまま）"),
    "hpf": ("orig_voice.py", "    hp = ramp(f, *c[\"hpf_hz\"])\n", "    hp = 1.0\n",
            {"clean", "stems", "qa_rows", "qa_check"}, "80Hz より下の揺れを切らない"),
    "deboom": ("orig_voice.py", "    deboom = 10 ** (c[\"deboom_db\"] * (1 - ramp(f, *c[\"deboom_hz\"])) / 20)\n",
               "    deboom = 1.0\n", {"clean", "stems"}, "こもりの帯を下げない（こもりが頂点を食って、声の帯が目標に 0.7dB 届かない）"),
    "nr": ("orig_voice.py", "    y, nr = denoise(y, c)\n", "    nr = 0.0\n",
           {"clean"}, "話していない所の雑音を下げない"),
    "band": ("orig_voice.py", "    y = band(x, *VOICE_BAND_HZ, sr=sr)\n", "    y = x\n",
             {"measure", "stems", "qa_rows", "qa_check"}, "物差しが声の帯の外（揺れ・こもり）まで数える（v3 の揃え方と同じ見落とし）"),
    "gate": ("orig_voice.py", "    keep = p >= top * 10 ** (-GATE_DB / 10)\n", "    keep = p >= 0\n",
             {"measure"}, "物差しが話していない所（無音・小さすぎる所）まで数える"),
    "peak": ("orig_voice.py", "        y, lim = limit_peak(x * 10 ** (gain / 20), c[\"peak\"], sr)\n",
             "        y, lim = x * 10 ** (gain / 20), 0.0\n",
             {"stems"}, "揃えたあとの頂点を抑えない（16bit の wav に書くと割れる）"),
    "qa_min": ("../qa/audio.py", "        if not ORIG_VS_AI_MIN_DB <= d <= ORIG_VS_AI_MAX_DB:\n",
               "        if d > ORIG_VS_AI_MAX_DB:\n",
               {"qa_rows", "qa_check"}, "品質チェックが、AI の声より小さい元の声を落とさない"),
    "qa_max": ("../qa/audio.py", "        if not ORIG_VS_AI_MIN_DB <= d <= ORIG_VS_AI_MAX_DB:\n",
               "        if d < ORIG_VS_AI_MIN_DB:\n",
               {"qa_rows"}, "品質チェックが、飛び出した叫びを落とさない"),
    "qa_rms": ("../qa/audio.py", "        lv.append(voice_level_db(narr[s:e]))\n",
               "        lv.append(rms_db(narr[s:e]))\n",
               {"qa_rows", "qa_check"}, "品質チェックが行全体の RMS で比べる（v3 を通した見方）"),
    "qa_wire": ("../qa/audio.py", "        return result(\"voice_vs_bgm\", title, FAIL if bad or ov_bad else PASS, summ,\n",
                "        return result(\"voice_vs_bgm\", title, FAIL if bad else PASS, summ,\n",
                {"qa_check"}, "比べた結果を「声と BGM の差」の合否に入れない"),
}


# ---------------------------------------------------------------- 写しと読み込み

def fonts_dir(box: Path) -> Path | None:
    """本物の書体（fetch_fonts.sh）が無ければ、箱の太字を M PLUS の名前で置く（bgm_cta_selftest.py と同じ）。
    時間割（plan）が字幕の書体を引くので要る（字の形は見ない）。"""
    names = ["MPLUSRounded1c-ExtraBold.ttf", "MPLUSRounded1c-Black.ttf"]
    for d in [os.environ.get("SHORTS_FONTS_DIR"), str(HERE / "fonts")]:
        if d and all((Path(d) / n).exists() for n in names):
            return Path(d)
    cands = []
    for root in ("/usr/share/fonts", "/usr/local/share/fonts"):
        if os.path.isdir(root):
            cands += sorted(Path(root).rglob("*.ttf"))
    pick = next((p for p in cands if "Bold" in p.name), cands[0] if cands else None)
    if pick is None:
        return None
    d = box / "fonts"
    d.mkdir(exist_ok=True)
    for n in names:
        (d / n).symlink_to(pick)
    return d


def make_src(box: Path, cut: str | None) -> Path:
    """render/ と qa/ を写す（守りを1つ外すなら、その字だけ書き換える）。外す字が無ければ 2 で落ちる。"""
    src = box / "render"
    src.mkdir()
    for p in HERE.glob("*.py"):
        shutil.copy(p, src / p.name)
    for p in HERE.glob("*.json"):
        shutil.copy(p, src / p.name)
    shutil.copytree(HERE / "flags", src / "flags")
    shutil.copytree(HERE.parent / "qa", box / "qa", ignore=shutil.ignore_patterns("assets", "__pycache__"))
    if cut:
        fname, old, new, _, _ = CUTS[cut]
        f = (src / fname).resolve()
        text = f.read_text(encoding="utf-8")
        if text.count(old) != 1:
            print(f"✕ BREAK={cut}: 外す字が {fname} に {text.count(old)} か所（1か所のはず）。字を直したら CUTS も直す")
            sys.exit(2)
        f.write_text(text.replace(old, new), encoding="utf-8")
    return src


def load(name: str, path: Path):
    spec = importlib.util.spec_from_file_location(name, path)
    mod = importlib.util.module_from_spec(spec)
    sys.modules[name] = mod
    spec.loader.exec_module(mod)
    return mod


def load_all(src: Path):
    """写しの render.py・orig_voice.py・qa/audio.py を読む（前に読んだものは捨てる）。"""
    for name in ("render", "textlook", "flags", "orig_voice", "audio", "common"):
        sys.modules.pop(name, None)
    sys.path[:0] = [str(src), str(src.parent / "qa")]
    try:
        R = load("render", src / "render.py")
        OV = sys.modules["orig_voice"]
        A = load("audio", src.parent / "qa" / "audio.py")
    finally:
        del sys.path[:2]
    return R, OV, A


# ---------------------------------------------------------------- 手で書いた物差し（orig_voice.py を使わない）

def band_db_frames(x, lo: float, hi: float):
    """50ms ごとに、lo〜hi Hz のパワー（dB）。窓ごとの FFT（Parseval）で出す（本物は1本まるごとの FFT）。"""
    import numpy as np
    w = SR // 20
    k = len(x) // w
    fr = np.asarray(x[: k * w], dtype=np.float64).reshape(k, w)
    X = np.fft.rfft(fr, axis=1)
    f = np.fft.rfftfreq(w, 1 / SR)
    sel = (f >= lo) & (f <= hi)
    wt = np.where((f == 0) | (f == SR / 2), 1.0, 2.0)
    p = (np.abs(X[:, sel]) ** 2 * wt[sel]).sum(axis=1) / w ** 2
    return 10 * np.log10(np.maximum(p, 1e-30))


def voice_db(x) -> float:
    """話している所の声の帯: 300〜3400Hz だけを残した音の 50ms の窓のうち、いちばん大きい窓から 20dB 以内の窓の
    パワーの平均。帯は1本まるごとの FFT で切る（窓ごとの FFT だと、20Hz 刻みの窓に 250Hz のこもりが 300Hz の側へ
    漏れて、こもった声ほど大きく出る）。"""
    import numpy as np
    x = np.asarray(x, dtype=np.float64)
    n = len(x)
    X = np.fft.rfft(x)
    f = np.fft.rfftfreq(n, 1 / SR)
    y = np.fft.irfft(np.where((f >= 300) & (f <= 3400), X, 0), n)
    w = SR // 20
    k = n // w
    p = np.mean(y[: k * w].reshape(k, w) ** 2, axis=1)
    keep = p >= p.max() / 100
    return float(10 * np.log10(np.mean(p[keep])))


def speech_rms_db(x) -> float:
    """話している間の RMS（全帯。50ms の窓のうち、いちばん大きい窓から 20dB 以内）。書き出しの AI の声の揃え方"""
    import numpy as np
    w = SR // 20
    k = len(x) // w
    p = np.mean(np.asarray(x[: k * w], dtype=np.float64).reshape(k, w) ** 2, axis=1)
    keep = p >= p.max() * 0.01
    return float(10 * np.log10(np.mean(p[keep])))


def band_total_db(x, lo: float, hi: float) -> float:
    import numpy as np
    d = band_db_frames(x, lo, hi)
    return float(10 * np.log10(np.mean(10 ** (d / 10))))


def low_vs_voice_db(x) -> float:
    """50Hz より下 ÷ 声の帯（300〜3400Hz）を、1本まるごとの FFT で（50ms の窓だと、20Hz 刻みの窓に
    120〜250Hz のこもりが漏れて、揺れを切っても切れていないように見える）。"""
    import numpy as np
    X = np.abs(np.fft.rfft(np.asarray(x, dtype=np.float64))) ** 2
    f = np.fft.rfftfreq(len(x), 1 / SR)
    return float(10 * np.log10(max(X[(f >= 20) & (f <= 50)].sum(), 1e-30) / max(X[(f >= 300) & (f <= 3400)].sum(), 1e-30)))


# ---------------------------------------------------------------- 合成の声

def syllables(n: int, spans: list[tuple[float, float]]):
    """音節の包絡（立ち上がりと終わりを 30ms の余弦で）。"""
    import numpy as np
    env = np.zeros(n)
    r = int(0.03 * SR)
    for a, b in spans:
        s, e = int(a * SR), int(b * SR)
        seg = np.ones(e - s)
        seg[:r] = 0.5 - 0.5 * np.cos(np.pi * np.arange(r) / r)
        seg[-r:] = seg[:r][::-1]
        env[s:e] = np.maximum(env[s:e], seg)
    return env


def vowel(n: int, f0: float, gains: list[tuple[float, float, float]]):
    """倍音の母音。gains は (中心 Hz, 幅 Hz, 振幅) の山の並び。f0 は 4Hz で ±2% 揺らす。"""
    import numpy as np
    t = np.arange(n) / SR
    ph = 2 * np.pi * f0 * (t + 0.02 / (2 * np.pi * 4) * np.sin(2 * np.pi * 4 * t))
    y = np.zeros(n)
    for k in range(1, int(5000 / f0)):
        fk = k * f0
        a = sum(g * math.exp(-0.5 * ((fk - c) / w) ** 2) for c, w, g in gains) + 0.02
        y += a / math.sqrt(k) * np.sin(k * ph + 0.37 * k)
    return y


SPANS = [(0.10, 0.45), (0.55, 0.85), (0.95, 1.40)]   # 3音節。間と頭・尻は無音（雑音だけ）
CLICKS = (0.20, 0.62)                                 # 打音（マイクに触れた・机を叩いた）の秒
DUR = 1.6


def ai_voice(level: float, f0: float = 120.0):
    """AI の声: 言葉の帯（500〜3000Hz）に山がある、雑音の無い明るい声。"""
    n = int(DUR * SR)
    return level * vowel(n, f0, [(600, 250, 1.0), (1500, 400, 0.8), (2600, 500, 0.5)]) * syllables(n, SPANS)


def stream_voice():
    """配信の声: 同じ形の声に、揺れ・こもり・薄い言葉の帯・途切れない雑音・打音を足す。音節の大きさも揃っていない。"""
    import numpy as np
    n = int(DUR * SR)
    t = np.arange(n) / SR
    env = syllables(n, SPANS) * np.where(t < 0.5, 1.0, np.where(t < 0.9, 0.5, 0.3))  # 叫んで、尻すぼみ
    speech = 0.12 * vowel(n, 125.0, [(180, 60, 3.0), (600, 250, 0.45), (1500, 400, 0.3), (2600, 500, 0.2)]) * env
    rumble = 0.08 * np.sin(2 * np.pi * 45 * t)
    rng = np.random.default_rng(1086)
    noise = rng.normal(0, 1, n)
    noise = np.fft.irfft(np.fft.rfft(noise) * (np.fft.rfftfreq(n, 1 / SR) < 8000), n)
    noise *= 0.004 / max(float(np.std(noise)), 1e-12)
    clicks = np.zeros(n)
    for c in CLICKS:
        i = int(c * SR)
        m = int(0.002 * SR)
        clicks[i:i + m] += 0.9 * np.exp(-np.arange(m) / (0.0004 * SR)) * np.sin(2 * np.pi * 2000 * np.arange(m) / SR)
    return speech + rumble + noise + clicks, speech


def write(path: Path, x) -> Path:
    import numpy as np
    subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-f", "f32le", "-ar", str(SR), "-ac", "1",
                    "-i", "-", "-c:a", "pcm_f32le", str(path)],
                   input=np.ascontiguousarray(x, dtype="<f4").tobytes(), check=True)
    return path


class Case:
    """合成の声4本（AI の声3行・元の声1行）と、書き出しの束を一度だけ作る。"""

    def __init__(self, d: Path, R):
        import numpy as np
        self.d, self.R = d, R
        self.raw, self.speech = stream_voice()
        self.files = [write(d / "ai0.wav", ai_voice(0.10)), write(d / "ai1.wav", ai_voice(0.03, 110.0)),
                      write(d / "orig.wav", self.raw), write(d / "ai2.wav", ai_voice(0.06, 130.0))]
        self.orig_row = 2
        self.style = R.load_style("style.json", R.HERE)
        frames = math.ceil(DUR * FPS)
        self.ats = [i * (frames + 8) for i in range(4)]
        self.n = (self.ats[-1] + frames + 30) * SPF
        lines = [{"at": a, "frames": frames, "file": str(f), "text": "テスト",
                  **({"orig_voice": True} if i == self.orig_row else {})} for i, (a, f) in enumerate(zip(self.ats, self.files))]
        self.plan = {"fps": FPS, "frames": self.n // SPF, "narration": lines, "bgm": None, "cuts": [], "audio_override": {}}
        work = d / "w_stems"
        work.mkdir()
        narr_p, _, _ = R.audio_stems(self.plan, self.style, d, work)
        self.stem = np.fromfile(narr_p, dtype="<f4").reshape(-1, 2)
        self.mono = self.stem.mean(axis=1).astype(np.float64)

    def line(self, x, i: int):
        a = self.ats[i] * SPF
        return x[a:a + math.ceil(DUR * FPS) * SPF]

    def old_stem(self):
        """前の書き出し（どの行も話している間の RMS で −16dBFS）の束。手で作る"""
        import numpy as np
        out = np.zeros(self.n)
        for i, f in enumerate(self.files):
            x = self.R.decode_audio(f, 1)[:, 0].astype(np.float64)
            x = x * 10 ** ((-16 - speech_rms_db(x)) / 20)
            a = self.ats[i] * SPF
            out[a:a + len(x)] += x
        return out


# ---------------------------------------------------------------- 足

def leg_measure(R, OV, A, case: Case) -> list[tuple[str, bool]]:
    import numpy as np
    t = np.arange(SR) / SR
    tone = 0.1 * np.sin(2 * np.pi * 1000 * t)
    want = 20 * math.log10(0.1 / math.sqrt(2))   # −23.01
    half = np.concatenate([tone[:SR // 2], np.zeros(SR // 2)])
    q12, q26 = 10 ** (-12 / 20), 10 ** (-26 / 20)
    soft = np.concatenate([tone[:SR // 2], q12 * tone[SR // 2:]])
    want_soft = 10 * math.log10((0.1 ** 2 / 2 + (0.1 * q12) ** 2 / 2) / 2)
    faint = np.concatenate([tone[:SR // 2], q26 * tone[SR // 2:]])
    cases = [("1kHz の正弦（振幅 0.1）", tone, want),
             ("＋45Hz の揺れ（振幅 0.5）", tone + 0.5 * np.sin(2 * np.pi * 45 * t), want),
             ("＋6kHz（振幅 0.3）", tone + 0.3 * np.sin(2 * np.pi * 6000 * t), want),
             ("後ろ半分が無音", half, want),
             ("後ろ半分が 12dB 小さい（数える）", soft, want_soft),
             ("後ろ半分が 26dB 小さい（数えない）", faint, want)]
    out = []
    for what, x, w in cases:
        got = OV.voice_level_db(x)
        out.append((f"{what}: {got:.2f}dB（手計算 {w:.2f}・±0.15）", abs(got - w) <= 0.15))
    out.append(("無音は -inf", OV.voice_level_db(np.zeros(SR)) == -math.inf))
    return out


def leg_clean(R, OV, A, case: Case) -> list[tuple[str, bool]]:
    import numpy as np
    x, sp = case.raw, case.speech
    y, info = OV.clean(x)
    out = [(f"長さが同じ（{len(x)} → {len(y)}）", len(y) == len(x) and bool(np.all(np.isfinite(y))))]
    rum0, rum1 = low_vs_voice_db(x), low_vs_voice_db(y)
    out.append((f"50Hz より下が声の帯より 20dB 以上下（{rum0:+.1f} → {rum1:+.1f}dB）", rum1 <= -20))
    boom0 = band_total_db(x, 120, 250) - band_total_db(x, 500, 3000)
    boom1 = band_total_db(y, 120, 250) - band_total_db(y, 500, 3000)
    out.append((f"120〜250Hz のこもりが言葉の帯に比べて 3dB 以上下がる（{boom0:+.1f} → {boom1:+.1f}dB）", boom1 <= boom0 - 3))
    # 言葉のない所（1.45〜1.6秒。雑音だけ）と、いちばん大きい音節（0.15〜0.4秒）の差
    gap = slice(int(1.45 * SR), int(1.6 * SR))
    loud = slice(int(0.15 * SR), int(0.40 * SR))

    def lv(v, s):
        return band_total_db(v[s], 300, 8000)
    g0, g1 = lv(x, gap) - lv(x, loud), lv(y, gap) - lv(y, loud)
    out.append((f"言葉のない所の雑音が、話している所に比べて 3〜12dB 下がる（{g0:+.1f} → {g1:+.1f}dB、{g0 - g1:.1f}dB）",
                3 <= g0 - g1 <= 12))
    # 言葉の帯の形: 元の（雑音・揺れを足す前の）声と、整えたあとの声の 500〜3000Hz の相関（話している所）
    def mid(v):
        n = len(v)
        f = np.fft.rfftfreq(n, 1 / SR)
        return np.fft.irfft(np.fft.rfft(v) * ((f >= 500) & (f <= 3000)), n)
    # 打音（声ではない）の前後 10ms は数えない
    on = np.abs(sp) > 0
    for c in CLICKS:
        on[int((c - 0.01) * SR):int((c + 0.012) * SR)] = False
    ref = mid(sp)[on]

    def corr(v):
        b = mid(v)[on]
        return float(np.dot(ref, b) / math.sqrt(float(np.dot(ref, ref)) * float(np.dot(b, b))))
    r0, r1 = corr(x), corr(y)
    out.append((f"言葉の帯（500〜3000Hz）の形が元のまま（雑音を足す前の声との相関 {r0:.3f} → {r1:.3f}・0.9 以上で、"
                f"整える前より 0.02 以上下がらない）", r1 >= 0.9 and r1 >= r0 - 0.02))
    return out


def leg_plan_flag(R, OV, A, case: Case) -> list[tuple[str, bool]]:
    d = case.d
    src = d / "src.mp4"
    if not src.exists():
        subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i",
                        "color=c=0x808080:s=180x320:r=30", "-t", "4", "-c:v", "libx264", "-pix_fmt", "yuv420p",
                        str(src)], check=True)
    e = {"version": 2, "id": "selftest-orig", "style": "style.json", "sources": {"s": {"path": str(src)}},
         "cuts": [{"src": "s", "in": 0, "out": 110}],
         "narration": {"engine": "files", "lines": [
             {"at": 0, "text": "AI", "caption": "", "file": str(case.files[0])},
             {"at": 55, "text": "元", "caption": "", "file": str(case.files[2]), "orig_voice": True}]}}
    ep = d / "edit_orig.json"
    ep.write_text(json.dumps(e, ensure_ascii=False), encoding="utf-8")
    ed, style, base = R.load(ep)
    work = d / "w_plan"
    work.mkdir(exist_ok=True)
    p = R.plan(ed, style, base, work)
    ln = p["narration"]
    return [(f"元の声の行に印（{ln[1].get('orig_voice')}）", ln[1].get("orig_voice") is True),
            (f"AI の声の行には印が無い（{ln[0].get('orig_voice')}）", "orig_voice" not in ln[0])]


def leg_stems(R, OV, A, case: Case) -> list[tuple[str, bool]]:
    import numpy as np
    out = []
    lv = [voice_db(case.line(case.mono, i)) for i in range(4)]
    ai = [v for i, v in enumerate(lv) if i != case.orig_row]
    ref = float(np.median(ai))
    d = lv[case.orig_row] - ref
    out.append((f"元の声の行が AI の声の真ん中 {ref:.2f} より {d:+.2f}dB（0〜+1）", 0 <= d <= 1))
    for i in range(4):
        if i == case.orig_row:
            continue
        s = speech_rms_db(case.line(case.mono, i))
        out.append((f"AI の声 {i}行目は前のまま話している間の RMS −16dBFS（{s:.2f}）", abs(s + 16) <= 0.05))
    o = case.line(case.mono, case.orig_row)
    rum = low_vs_voice_db(o)
    out.append((f"元の声の行の 50Hz より下が声の帯より 15dB 以上下（{rum:+.1f}dB）", rum <= -15))
    pk = float(np.max(np.abs(case.stem)))
    out.append((f"元の声の行の頂点 {pk:.3f}（0.95 以下）", float(np.max(np.abs(o))) <= 0.951))
    flat = 0
    ch = case.stem[:, 0]
    hot = np.abs(ch) >= 0.999 * pk
    same = np.concatenate([[False], np.abs(np.diff(ch)) <= 1e-6 * pk])
    run = 0
    for v in hot & same:
        run = run + 1 if v else 0
        flat += run == 3
    out.append((f"平らな頂点（同じ値が4標本）が無い（{flat}）", flat == 0))
    lvl = case.plan["narration"][case.orig_row].get("orig_level") or {}
    out.append((f"時間割に揃え方が残る（{sorted(lvl)}）", "voice_db" in lvl and "ai_median_voice_db" in lvl))
    # AI の声の行が無い回（全部が元の声）でも落ちずに揃う
    solo = {"fps": FPS, "frames": case.plan["frames"], "bgm": None, "cuts": [], "audio_override": {},
            "narration": [dict(case.plan["narration"][case.orig_row], at=0)]}
    for k in ("gain_db", "orig_level", "norm_file"):
        solo["narration"][0].pop(k, None)
    w2 = case.d / "w_solo"
    w2.mkdir(exist_ok=True)
    narr_p, _, _ = R.audio_stems(solo, case.style, case.d, w2)
    v = voice_db(np.fromfile(narr_p, dtype="<f4").reshape(-1, 2).mean(axis=1)[: len(case.raw)])
    out.append((f"AI の声の行が無い回も揃う（声の帯 {v:.2f}dB）", math.isfinite(v) and -30 < v < -5))
    return out


def leg_qa_rows(R, OV, A, case: Case) -> list[tuple[str, bool]]:
    plan = case.plan
    ok, bad = A.orig_voice_rows(case.mono, plan, SPF)
    out = [(f"揃えた束は落ちない（{bad}）", ok is not None and not bad and len(ok.get("lines", [])) == 1)]
    old = case.old_stem()
    o2, b2 = A.orig_voice_rows(old, plan, SPF)
    d2 = (o2 or {}).get("lines", [{}])[0].get("minus_ai_db")
    out.append((f"前の書き出し（RMS で揃えた）の束は落ちる（AI の声より {d2}dB・{b2}）", bool(b2) and "元の声" in b2[0]))
    loud = case.mono.copy()
    a = case.ats[case.orig_row] * SPF
    m = math.ceil(DUR * FPS) * SPF
    loud[a:a + m] *= 10 ** (5 / 20)
    _, b3 = A.orig_voice_rows(loud, plan, SPF)
    out.append((f"+5dB の叫びも落ちる（{b3}）", bool(b3)))
    none_ = {**plan, "narration": [{k: v for k, v in ln.items() if k != "orig_voice"} for ln in plan["narration"]]}
    o4, b4 = A.orig_voice_rows(case.mono, none_, SPF)
    out.append((f"元の声の行が無ければ何も言わない（{o4} / {b4}）", o4 is None and b4 == []))
    only = {**plan, "narration": [dict(ln, orig_voice=True) for ln in plan["narration"]]}
    o5, b5 = A.orig_voice_rows(case.mono, only, SPF)
    out.append((f"AI の声の行が無ければ比べない（{(o5 or {}).get('note')} / {b5}）", o5 is not None and "note" in o5 and b5 == []))
    return out


class FakeCtx:
    """check_voice_vs_bgm が読むものだけを持つ偽の Ctx（束はここで渡す。BGM は無音）。"""

    def __init__(self, plan: dict, narr):
        import numpy as np
        self.plan = plan
        self._st = {"narration": np.stack([narr, narr], axis=1), "bgm": np.zeros((len(narr), 2))}

    def stems_usable(self):
        return True, ""

    def stems(self):
        return self._st

    def stem_fit(self):
        return {"gain_narration": 1.0, "gain_bgm": 1.0}


def leg_qa_check(R, OV, A, case: Case) -> list[tuple[str, bool]]:
    bad = A.check_voice_vs_bgm(FakeCtx(case.plan, case.old_stem()))
    good = A.check_voice_vs_bgm(FakeCtx(case.plan, case.mono))
    return [(f"前の書き出しの束で fail（{bad['status']}・{bad['problems'][:1]}）",
             bad["status"] == A.FAIL and any("元の声" in p for p in bad["problems"])),
            (f"揃えた束で pass（{good['status']}・{good['summary']}）",
             good["status"] == A.PASS and "元の声" in good["summary"])]


LEGS = {
    "measure": leg_measure,
    "clean": leg_clean,
    "plan_flag": leg_plan_flag,
    "stems": leg_stems,
    "qa_rows": leg_qa_rows,
    "qa_check": leg_qa_check,
}


def run_legs(src: Path, d: Path) -> tuple[list[str], int]:
    R, OV, A = load_all(src)
    failed, checked = [], 0
    try:
        case = Case(d, R)
    except Exception as e:  # noqa: BLE001 — 束が作れなければ、束を読む足は全部落ちる（数えて赤にする）
        print(f"✕ 合成の声と束が作れない: {type(e).__name__}: {e}")
        return list(LEGS), 1
    for name, fn in LEGS.items():
        try:
            res = fn(R, OV, A, case)
        except SystemExit as e:
            res = [(f"途中で止まった: {e.code}", False)]
        except Exception as e:  # noqa: BLE001 — 足が落ちたことを、ほかの足を止めずに数える
            res = [(f"途中で落ちた: {type(e).__name__}: {e}", False)]
        checked += len(res)
        if any(not ok for _, ok in res):
            failed.append(name)
        print(f"[{name}]")
        for what, ok in res:
            print(f"  {'○' if ok else '✕'} {what}")
    return failed, checked


def child(name: str | None) -> int:
    """写し（守りを1つ外すならそれ）で足を全部回し、落ちた足の名前を1行で返す（親が読む）"""
    if name and name not in CUTS:
        print(f"✕ BREAK={name} という守りは無い（{' / '.join(CUTS)}）")
        return 2
    with tempfile.TemporaryDirectory() as td:
        box = Path(td)
        fd = fonts_dir(box)
        if fd is None:
            print("✕ 回せない: 書体が1つも無い（tools/shorts/render/fetch_fonts.sh か、fonts-dejavu-core）")
            return 2
        os.environ["SHORTS_FONTS_DIR"] = str(fd)
        src = make_src(box, name)
        d = box / "case"
        d.mkdir()
        failed, checked = run_legs(src, d)
    print("LEGS_FAILED " + json.dumps(sorted(failed)))
    if checked == 0:
        return 2
    return 1 if failed else 0


def drill() -> list[str]:
    """守りを1つずつ外して、**その守りの足だけ**が落ちるかを見る"""
    print("[対照] 守りを1つずつ外すと、その足だけが落ちるか")
    bad = []
    for name, (_, _, _, want, why) in CUTS.items():
        r = subprocess.run([sys.executable, str(Path(__file__).resolve())], capture_output=True, text=True,
                           env=dict(os.environ, BREAK=name), timeout=600, check=False)
        line = [ln for ln in r.stdout.splitlines() if ln.startswith("LEGS_FAILED ")]
        got = set(json.loads(line[-1][len("LEGS_FAILED "):])) if line else None
        hit = got == want and r.returncode == 1
        print(f"  {'○' if hit else '✕'} BREAK={name}（{why}）→ 落ちた足 "
              f"{sorted(got) if got is not None else '（読めない: ' + (r.stdout + r.stderr).strip()[-300:] + '）'}"
              f"（欲しいのは {sorted(want)}）")
        if not hit:
            bad.append(name)
    return bad


def main() -> int:
    try:
        import numpy  # noqa: F401
        from PIL import Image  # noqa: F401
    except ImportError as e:
        print(f"✕ 回せない: {e.name} が無い（numpy・Pillow が要る）")
        return 2
    if shutil.which("ffmpeg") is None:
        print("✕ 回せない: ffmpeg が無い")
        return 2
    if BREAK:
        return child(BREAK)
    rc = child(None)
    print()
    bad = drill()
    print()
    if rc == 2:
        print("✕ 1つも数えなかった。**「通りました」とは言わない**")
        return 2
    if rc or bad:
        if rc:
            print("✕ 本物で落ちた足がある（上の ✕）")
        if bad:
            print(f"✕ 対照が外れた: {' / '.join(bad)}（外しても、その足だけが落ちる形になっていない）")
        return 1
    print(f"○ {len(LEGS)}本の足が通り、守り {len(CUTS)}個を1つずつ外すと、その足だけが落ちた")
    return 0


if __name__ == "__main__":
    sys.exit(main())
