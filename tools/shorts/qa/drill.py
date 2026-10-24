"""**ショートの品質チェック（check.py）が、落ちるときに落ちるか**を、わざと壊した動画で当てる道具。

見張りは2本に分けて呼ぶ（1本 5分の上限に余裕を持たせるため。どちらも clean を作り直す）:

    python3 tools/shorts/qa/qa_selftest.py         # 音・字（ずれ・置き場）・形式の壊し方
    python3 tools/shorts/qa/qa_video_selftest.py   # 絵・長さの壊し方（透かし・顔・黒・止まり・61秒）
    python3 tools/shorts/qa/drill.py all --keep DIR  # 両方を1回で。作った動画と報告を DIR に残す

カットの選び方の3つ（長さ・似た見た目の連続・止め絵）の壊し方は、書き出しを通さない合成の足だけなので
3本目の見張り `cuts_selftest.py` に置いた（この2本は上限 5分の手前にいる）。ここでは clean が3つとも
通ることだけを当てる。

終了コード 0=全部思ったとおり / 1=思ったとおりでない足がある / **2=数えるものが無い**
（ffmpeg・OpenCV・顔の検出器・書体のどれかが無い。「通った」とは言わない）。

## 何を当てるか

壊れていない1本（clean）は**20の検査が全部 pass**。壊した1本ごとに、
**壊したところを見る検査だけが落ち、ほかは pass のまま**であること（字と顔の検査は字なしの版で
しか測れないので、字なしの版を渡さない足では not-checkable が正しい）。
落ちないなら、その検査は何も見ていない（緑は2通りに読める。CLAUDE.md）。
関係ない検査まで落ちるなら、検査が混ざっている。

| 壊し方 | 落ちるはずの検査 | 見張り |
| --- | --- | --- |
| 61秒にする（同じ動画をつなぐ） | container | qa_video |
| faststart を外す（moov を後ろに） | container | qa |
| 音を 8dB 下げる | loudness | qa |
| BGM を 12dB 上げる（声との差 5〜6dB。線は 9dB） | voice_vs_bgm | qa |
| 2行目の声の頭に 6コマの無音（字幕が声より 6コマ早い） | subtitle_sync | qa |
| 字幕を y=1300 に下げる（安全領域の下 1248 を越える） | safe_area | qa |
| BGM を外す（声の間が 2〜3秒無音） | silence | qa |
| 1行目の声を割る（頭が平ら。RMS は元のまま） | clipping | qa |
| 元の音を下げずに入れる（カットの audio_db = 0） | original_audio | qa |
| 1〜3秒に PRISM Live の透かしを貼る | watermark | qa_video |
| ぼかしていない顔を2秒貼る | faces（needs-human） | qa_video |
| ぼかした顔を2秒貼る | どれも落ちない（検出はされ、ぼかし済みと判定されること） | qa_video |
| 字なしの版の、1行目の字幕の下に、ぼかしていない顔を 1.3秒貼る（仕上がりは clean のまま） | text_on_face | qa_video |
| 2秒を真っ黒にする | black | qa_video |
| 2秒を止める | frozen | qa_video |
| （動画ではなく1コマ）強い模様の隣の一色の地 | 透かしの守り（平らな地を測らない）を外すと 0.40 以上に化け、守りがあれば化けないこと | qa_video |
| （時間割だけ）2行目の字幕をそのまま強調の字にする | text_dup | qa |
| （時間割だけ）字幕にもタイトルにも無い強調の字（「Pulë ＝ 鶏」） | text_dup は pass | qa |
| （時間割だけ）はじめの3秒、タイトル・強調・字幕の3つに「ショート」 | text_dup（3つ並びの線だけで落ちる） | qa |
| 合成の6秒（前半は形のある画、後半は細かい粒だけの灰色） | strips.py の弱い画の印が後半にだけ付く | qa_video |
| clean を strips.py に通す | 行の帯が行の数だけ・絵と JSON が書ける | qa_video |
| （時間割だけ）1行目の字幕を、試写で割れた字（「1回700｜円やって！」「作りす｜ぎやろ！」「1ミリも貢献して｜へんて！」・行の頭の読点）に差し替える ほか2本 | line_breaks（表は `linebreak_legs`） | qa |
| （時間割だけ）同じ字を、割ってよい所で割る・割らない | line_breaks は pass | qa |
| （時間割だけ）【大】の字に人が決めた割れ目「1回｜700円やって！」（manual_breaks）／同じ割れ目を人が決めずに／「1回7｜00円」「貢献して｜へんて」と決める | 通る／落ちる／落ちる | qa |
| （関数だけ）人が決めた割れ目を書き出しに渡す（render.py の manual_split・fit_lines の fixed） | 正しい指定はそのとおり描き、固い決まりに当たる指定では止まる（`lb_render_manual`） | qa |
| （関数だけ）書き出しの割り方（render.py の fit_lines・wrap）に、割れた字8つを【大】3つの見た目×4つの幅で割らせる | 割れ目が全部、割ってよい所にある（`lb_render`） | qa |
| （時間割と元素材だけ）使った区間の元素材で、同じ絵を4コマずつ繰り返す ほか4本 | source_stutter（表は `stutter_legs`） | qa |
| （関数だけ）配信の時刻の書きかた（299.97秒 → 0:05:00.0） | common.hms | qa |
| （時間割と場面の絵だけ）同じ区間を4回・同じ素材の別の時刻を4回 ほか5本 | shot_reuse（表は `reuse_legs`） | qa_video |

時間割だけの足は、いまの render.py が強調の字（テロップ）を描かないので、clean の時間割に強調の字を
足した写しで text_dup だけを回す（絵には字が無いので、ほかの検査は回さない）。

元素材のカクつきと使い回しの足も、書き出しを通さない。どちらの検査も出来上がりの画素ではなく、
時間割から戻った元素材とカットの並びを見るので、時間割と素材だけを差し替えれば当たる（書き出しを
足すと、1本 5分の上限に入らない）。足ごとに2つの検査を両方回し、壊したほうだけが落ちることを見る。
clean は本物の書き出しで19本を回すので、2つの検査が本物の時間割で落ちないことはそちらで当たる。

## 素材と書き出し

`make_assets.py` と同じ作り（testsrc2 の絵・220Hz の音・和音の BGM）を、**配信と同じ
720x1280 で 10.5秒だけ**作る（make_assets.py は 60秒を2本で2分かかり、見張りの5分に入らない）。
声は合成（倍音の母音）。書き出しは本物の `render.py` を、x264 の preset だけ ultrafast にした
様式の写しで回す。書体が無い箱（CI）では、箱にある書体を同じ名前で置く（検査は字の形を見ない）。

### 最後の音量合わせ（書き出しにまだ無い段の代わり）

2026-10-15 時点の render.py の書き出しは、例の指示書で -17.2 LUFS・トゥルーピーク -0.8 dBTP、
この素材で -15 LUFS 前後で、loudness の線（-14±1.5 / -1 以下）に届かないことがある。
**検査の線を書き出しに合わせて緩めることはしない。** ここでは書き出しのあとに「一定の音量を
足して、-2dBFS のリミッター」を当てて clean を作る（書き出しに足すべき段の代わり。
書き出しが -14 LUFS で出すようになれば、足す音量が 0 に近づくだけ）。素の書き出しの値は毎回出す。

## 速さ

顔と透かしの検出は、同じ画素のコマに2度かけない（common.frame_memo）。壊し方の多くは
clean の一部のコマだけを変える（貼る・黒くする・止める）ので、変えないコマは無劣化で
符号化し直し、clean と画素ごと同じに保つ。映像のビット列が clean と同じ版（音だけ変えた版）は、
絵の検査の結果を clean から引き継ぐ（同じ入力から同じ答え）。
"""
from __future__ import annotations

import argparse
import contextlib
import copy
import io
import json
import math
import os
import shutil
import subprocess
import sys
import tempfile
import time
import wave
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parent.parent.parent
RENDER = HERE.parent / "render"
sys.path.insert(0, str(HERE))

SR = 48000
FPS = 30
N = 315          # 10.5秒。7（顔）と 15（透かし）の公倍数にしておくと、つないだ 61秒の版で
                 # 見本のコマが clean と同じ画素になり、検出を2度しない
SEC = N / FPS


def need() -> list[str]:
    """回すのに要るもの。無いものを並べる（1つでもあれば 2 で帰る）。"""
    miss = []
    for t in ("ffmpeg", "ffprobe"):
        if not shutil.which(t):
            miss.append(f"{t}（apt install ffmpeg）")
    import importlib.util
    # budoux: 書き出しが行を割る所と、字の改行の検査（line_breaks）が割ってよい所を決める。無いと割り方が決まらない
    for mod, pip in (("numpy", "numpy"), ("PIL", "Pillow"), ("budoux", "budoux")):
        if importlib.util.find_spec(mod) is None:
            miss.append(f"{mod}（pip install {pip}）")
    try:
        import cv2
        import faces
        if faces.detector(cv2) is None:
            miss.append(f"顔の検出器（OpenCV {cv2.__version__} に Haar が無い。pip install 'opencv-python-headless<5'）")
    except ImportError:
        miss.append("OpenCV（pip install 'opencv-python-headless<5'）")
    return miss


def sh(cmd: list[str], **kw):
    return subprocess.run(cmd, check=True, capture_output=True, **kw)


# ---------------------------------------------------------------- 素材

def fonts_dir(box: Path) -> Path | None:
    """render.py が読む書体。本物（fetch_fonts.sh）が無ければ、箱にある書体を同じ名前で置く。

    検査は字の形を見ない（絵を当てるだけ）ので、和文の無い書体（豆腐の四角）でも用は足りる。
    """
    names = ["MPLUSRounded1c-ExtraBold.ttf", "MPLUSRounded1c-Black.ttf"]
    for d in [os.environ.get("SHORTS_FONTS_DIR"), str(RENDER / "fonts")]:
        if d and all((Path(d) / n).exists() for n in names):
            return Path(d)
    cands = []
    for root in ("/usr/share/fonts", "/usr/local/share/fonts", "/System/Library/Fonts"):
        if os.path.isdir(root):
            cands += sorted(q for ext in ("*.ttf", "*.otf", "*.ttc") for q in Path(root).rglob(ext))
    pick = next((p for p in cands if "Bold" in p.name), cands[0] if cands else None)
    if pick is None:
        return None
    d = box / "fonts"
    d.mkdir(exist_ok=True)
    for n in names:
        (d / n).symlink_to(pick)
    return d


# 元素材の4つの場面（SCENE_SEC 秒ずつ）。どれも testsrc2 を、裏返し・明暗の反転・色相の回しで別の見た目にしたもの。
# clean は「3秒未満のカットを、隣と似ていない場面から1つずつ」でないと、カットの長さ・似た見た目の連続・
# 使い回しの検査で落ちる（2026-10-21 に足した検査。それまでの clean は 1場面から 3.5秒を3つで、今の線では両方落ちる）。
# 4つの場面は、どの2つも使い回しの線（色の分布の重なり 0.6・pHash 10ビット）の外にいること。隣どうしでなくても、
# 同じ素材のファイルの中で見た目が近いと、使い回しの検査が冒頭と終わりを「呼び戻し」と束ねて落とす
# （4つ目を hflip,vflip,hue=h=240 にしたら、字なしの版で1つ目と 0.619 になって落ちた）。いまの4つは、書き出した
# clean で測って、字なしの版で重なり 0.04〜0.33・pHash の違い 26〜42ビット、仕上がり（字の箱を除く）で
# pHash の違い 14〜50ビット（字の箱を平均で埋めるぶん近づく。線 10 との間は 4ビット）。3つ目を vflip,hue=h=120 に
# すると、仕上がりで1つ目と 12ビットまで近づいた。testsrc2 のままにしたのは、顔・透かし・字幕の検査がこの絵で
# 化けないと確かめてあるから
SCENES = ("null", "hflip,hue=h=60", "negate,hue=h=120", "hflip,vflip,hue=h=180")
SCENE_SEC = 4


def make_source(path: Path):
    """make_assets.py と同じ作り（testsrc2・220Hz）を、配信と同じ 720x1280 で。見た目の違う4場面をつなぐ。"""
    n = len(SCENES)
    parts = [f"[s{k}]trim={k * SCENE_SEC}:{(k + 1) * SCENE_SEC},setpts=PTS-STARTPTS,{vf}[v{k}]"
             for k, vf in enumerate(SCENES)]
    fc = (f"[0:v]split={n}" + "".join(f"[s{k}]" for k in range(n)) + ";" + ";".join(parts) + ";"
          + "".join(f"[v{k}]" for k in range(n)) + f"concat=n={n}:v=1:a=0,format=yuv420p[v]")
    dur = n * SCENE_SEC
    sh(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y",
        "-f", "lavfi", "-i", f"testsrc2=size=720x1280:rate={FPS}:duration={dur}",
        "-f", "lavfi", "-i", f"sine=frequency=220:sample_rate={SR}:duration={dur}",
        "-filter_complex", fc, "-map", "[v]", "-map", "1:a",
        "-c:v", "libx264", "-preset", "ultrafast", "-crf", "18", "-g", "30", "-pix_fmt", "yuv420p",
        "-c:a", "aac", "-b:a", "128k", "-shortest", str(path)])


def write_wav(path: Path, x, ch: int = 1):
    import numpy as np
    y = np.clip(np.asarray(x), -1, 1)
    pcm = np.round(y * 32767).astype("<i2")
    with wave.open(str(path), "wb") as w:
        w.setnchannels(ch)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm.tobytes())


def make_bgm(path: Path):
    """make_assets.py の BGM と同じ和音（C-Am-F-G のアルペジオ＋ベース）を numpy で。"""
    import numpy as np
    n = int(SR * (SEC + 2))
    t = np.arange(n) / SR
    chords = [[261.63, 329.63, 392.00], [220.00, 261.63, 329.63], [174.61, 220.00, 261.63], [196.00, 246.94, 293.66]]
    bass = [65.41, 55.0, 43.65, 49.0]
    x = np.zeros(n)
    for k in range(int((SEC + 2) / 0.25)):
        ch = chords[(k // 8) % 4]
        f = ch[k % 3] * (2 if k % 8 >= 4 else 1)
        s = int(k * 0.25 * SR)
        tt = np.arange(n - s) / SR
        x[s:] += 0.22 * np.exp(-6 * tt) * np.sin(2 * np.pi * f * tt)
    x += 0.17 * np.sin(2 * np.pi * np.array(bass)[((t // 2) % 4).astype(int)] * t)
    x = x / np.max(np.abs(x)) * 0.5
    write_wav(path, np.stack([x, x], 1).reshape(-1), ch=2)


def voice(sec: float, f0: float, seed: int):
    """ナレーションの代わりの声（倍音の母音を、音節ごとに強弱）。頭から鳴る（字幕の出だしを測るため）。"""
    import numpy as np
    rng = np.random.default_rng(seed)
    n = int(sec * SR)
    t = np.arange(n) / SR
    f = f0 * (1 + 0.06 * np.sin(2 * np.pi * 2.3 * t + rng.uniform(0, 6)))
    ph = 2 * np.pi * np.cumsum(f) / SR
    x = np.zeros(n)
    for k in range(1, 30):
        fk = k * f0
        # 母音らしく、700 / 1200 / 2600Hz のあたりを持ち上げる
        g = sum(math.exp(-((fk - fc) / bw) ** 2) for fc, bw in ((700, 200), (1200, 250), (2600, 400))) + 0.15
        x += g / k ** 0.5 * np.sin(k * ph)
    syl = 0.55 + 0.45 * np.sin(2 * np.pi * 5.0 * t + rng.uniform(0, 6)) ** 2
    env = np.minimum(1, t / 0.004) * np.minimum(1, (sec - t) / 0.03)
    x = x * syl * env
    return x / np.max(np.abs(x)) * 0.6


LINES = [  # 出だし（コマ）・長さ（秒）・字幕
    (6, 1.5, "島のショートを、機械で確かめる。"),
    (135, 1.5, "字幕と声は、同じコマで出る。"),
    (240, 1.4, "最後まで、見てくれてありがとう。"),
]
# 元素材のコマ（out は含まない）。4場面から1つずつ、2.0秒・2.83秒・2.83秒・2.83秒で、合わせて 315 コマ。
# 1行目の字幕が消える 57 コマ目から 2行目の 135 コマ目までは字幕が無い（2.6秒）。黒・止めるはここに入れる。
# 黒・止める [60, 120) は、2つ目のカット（出来上がりの 60〜145 コマ）の中に収める。2つのカットにまたがると、
# 両方のカットの見本のコマが同じ黒・同じ止まった絵になって、似た見た目の連続まで落ちる（壊したところだけが落ちない）
CUTS = [(10, 70), (130, 215), (250, 335), (370, 455)]
GAP = (60, 120)    # 黒くする・止めるコマ [60, 120) = 2.0秒


def build_edit(box: Path, name: str, *, voices: dict[int, Path], style: Path, bgm: Path | None,
               bgm_db: float = 0.0, captions: bool = True, title: bool = True,
               cut_audio_db: float | None = None) -> Path:
    edit = {
        "version": 1, "id": f"qa-{name}", "style": style.name,
        "sources": {"s": {"path": str(box / "source.mp4")}},
        # 元の音は、書き出しの既定では消える。カットに audio_db を書いたときだけ、その dB で入る
        "cuts": [{"src": "s", "in": a, "out": b,
                  **({} if cut_audio_db is None else {"audio_db": cut_audio_db})} for a, b in CUTS],
        "narration": {"engine": "files", "lines": [
            {"at": at, "text": txt, "file": str(voices[i]), **({} if captions else {"caption": ""})}
            for i, (at, _, txt) in enumerate(LINES)]},
    }
    if title:
        edit["title"] = {"text": "品質チェックの\n練習問題"}
    if bgm is not None:
        edit["bgm"] = {"path": str(bgm), "db": bgm_db}
    p = box / f"{name}.edit.json"
    p.write_text(json.dumps(edit, ensure_ascii=False, indent=1))
    return p


def style_copy(box: Path, name: str, **over) -> Path:
    """repo の様式の写し。x264 だけ速くする（検査は画質の細部を見ない）。over で1か所だけ変える。"""
    st = json.loads((RENDER / "style.json").read_text())
    st["encode"]["preset"] = "ultrafast"
    # 顔よけ（字なしで1回書いて顔を探す）は切る。合成素材（testsrc2）に顔は無く、CI には YuNet の重みも無い。
    # 切ると work に no_text.mp4 が書かれないので、字なしの版を渡す足は今までどおり clean と safe_low だけ
    st.setdefault("avoid_faces", {})["enabled"] = False
    # 終わりの注の札（CTA。様式の end_note、あやと F-042）は足さない。字なしの版を渡さない足では、使い回しと
    # 似た見た目の連続が「全部の字の箱を除いた残り」で比べる（video.text_mask）。この練習問題の題は小さい
    # 1枚もので、CTA の箱（左上 y=400）が新しく除かれ、合成の場面どうしの違う所が消えて全部のカットが束になった
    # （2026-10-21、shot_reuse が11本で落ちた）。本物の回は題の札（y=380 から 359px）が同じ所を先に覆っていて、
    # 除く所は変わらない（銅像 p2 v8 で札あり・なしとも同じ判定）。CTA そのものは render/bgm_cta_selftest.py が見る
    st["end_note"] = {"enabled": False}
    for path, val in over.items():
        d = st
        keys = path.split("__")
        for k in keys[:-1]:
            d = d[k]
        d[keys[-1]] = val
    p = box / f"style_{name}.json"
    p.write_text(json.dumps(st, ensure_ascii=False, indent=1))
    return p


def render(box: Path, edit: Path, name: str, env: dict) -> tuple[Path, Path]:
    out, work = box / f"{name}.raw.mp4", box / f"{name}.work"
    r = subprocess.run([sys.executable, str(RENDER / "render.py"), str(edit), "--out", str(out), "--work", str(work)],
                       capture_output=True, text=True, env=env)
    if r.returncode != 0:
        raise RuntimeError(f"render.py が落ちた（{name}）: {r.stdout[-400:]} {r.stderr[-800:]}")
    return out, work


def master(src: Path, dst: Path, target: float = -14.0) -> dict:
    """書き出しにまだ無い「最後の音量合わせ」の代わり。一定の音量を足して、-2dBFS で頭を抑える。

    一定の音量なので、束（stem）と仕上がりの比は全体で同じ（検査は最小二乗で比を当てて直す）。
    """
    import audio
    before = audio.ebur128(src)
    g = target - before["integrated_lufs"]
    sh(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", str(src), "-map", "0",
        "-c:v", "copy", "-af", f"volume={g:.2f}dB,alimiter=limit=0.794:level=false:latency=1",
        "-c:a", "aac", "-b:a", "192k", "-ar", str(SR), "-movflags", "+faststart", str(dst)])
    return {"raw": before, "gain_db": round(g, 2)}


def lossless(src: Path, dst: Path, vf: str | None = None, inputs: list[str] | None = None,
             fc: str | None = None):
    """絵を変えて符号化し直す。**無劣化（qp 0）**で、変えていないコマを clean と画素ごと同じに保つ。"""
    cmd = ["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", str(src)] + (inputs or [])
    if fc:
        cmd += ["-filter_complex", fc, "-map", "[v]", "-map", "0:a"]
    else:
        cmd += ["-map", "0:v", "-map", "0:a"] + (["-vf", vf] if vf else [])
    cmd += ["-c:v", "libx264", "-preset", "ultrafast", "-qp", "0", "-pix_fmt", "yuv420p",
            "-c:a", "copy", "-movflags", "+faststart", str(dst)]
    sh(cmd)


def logo_png(box: Path) -> tuple[Path, int, int]:
    """型（assets/prism_live.png）を、書き出しの大きさ（元の 1.5 倍）の白い透かしにする。"""
    import numpy as np
    from PIL import Image
    import watermark
    g, a, meta = watermark.load_template()
    z = 1.5 / meta["scale"]
    w, h = int(round(g.shape[1] * z)), int(round(g.shape[0] * z))
    gi = np.asarray(Image.fromarray(g).resize((w, h), Image.BICUBIC))
    ai = np.asarray(Image.fromarray((a == 255).astype(np.uint8) * 255).resize((w, h), Image.BILINEAR))
    rgba = np.stack([gi, gi, gi, (ai * 0.92).astype(np.uint8)], -1)
    p = box / "prism.png"
    Image.fromarray(rgba, "RGBA").save(p)
    x, y = [int(round(v * 1.5)) for v in meta["box_in_source"][:2]]
    return p, x, y


def face_png(box: Path, blur: float) -> Path:
    import numpy as np
    from PIL import Image, ImageFilter
    im = Image.open(HERE / "assets" / "face_public_domain.jpg").convert("RGB").resize((255, 300), Image.BICUBIC)
    if blur:
        im = im.filter(ImageFilter.GaussianBlur(blur))
    p = box / f"face_b{blur:g}.png"
    Image.fromarray(np.asarray(im)).save(p)
    return p


def overlay_key(plan: dict | None) -> str:
    """字の絵の置き場・時間・中身。work の置き場（パス）は鍵に入れない（版ごとに違うので）。"""
    import hashlib
    from common import overlays
    out = []
    for o in overlays(plan):
        h = hashlib.md5(Path(o["png"]).read_bytes()).hexdigest() if o.get("png") and Path(o["png"]).exists() else ""
        out.append([o.get("kind"), o["x"], o["y"], o["w"], o["h"], o["from"], o["to"], h])
    return json.dumps(out)


def cuts_key(plan: dict | None) -> str:
    """時間割のカットのうち、絵とカットの選び方の検査に効く欄（音の欄 audio_db は入れない）。"""
    keys = ("path", "in", "out", "at", "frames", "crop", "zoom", "fit", "still", "image")
    return json.dumps([[c.get(k) for k in keys] for c in (plan or {}).get("cuts", [])], sort_keys=True, default=str)


def flat_control() -> tuple[bool, str]:
    """透かしの「平らな地は測らない」守りの対照（動画ではなく1コマで当てる）。

    一色の地では正規化相互相関の分母が 0 に近づき、OpenCV が 1.0 を返すことがある。書き出し担当の
    素材（testsrc の青い帯）で実際に「17/68 コマに透かし・似ている度合い 1.0」と出た。動画で
    再現しようとしたが、無劣化の一色の箱では化けなかった（化けるかどうかが、まわりの模様の強さと
    丸めの具合で決まる）。だから化けることを確かめた1コマ（強い模様の隣の一色の地）を作り、
    守りを外すと化けること・守りがあれば化けないことの両方を当てる。
    """
    import cv2
    import numpy as np
    import watermark
    rng = np.random.default_rng(0)
    g = np.clip(128 + rng.normal(0, 40, (1920, 1080)), 0, 255).astype(np.uint8)
    g = cv2.GaussianBlur(g, (0, 0), 2)
    g[1300:1800, 300:1080] = 29
    tpl, _, meta = watermark.load_template()
    keep = watermark.FLAT_STD
    try:
        watermark.FLAT_STD = 0.0
        broken = watermark.scan(cv2, g, tpl, meta["scale"])[0]
    finally:
        watermark.FLAT_STD = keep
    guarded = watermark.scan(cv2, g, tpl, meta["scale"])[0]
    msg = (f"平らな地の対照: 守りなし {broken:.3f}（{watermark.HUMAN_SCORE} 以上に化けるはず）"
           f" / 守りあり {guarded:.3f}（{watermark.HUMAN_SCORE} 未満のはず）")
    return broken >= watermark.HUMAN_SCORE and guarded < watermark.HUMAN_SCORE, msg


def text_dup_legs(C, clean: Path, cwork: Path, box: Path) -> list[tuple[str, str, str, str]]:
    """字の重なり（text_dup）の足。**時間割だけを書き換えて当てる。**

    いまの render.py（tools/shorts/render/）は強調の字（テロップ）を描かない（描く版は書き出し担当が
    作っている途中）。text_dup は時間割の字しか読まないので、clean の時間割に強調の字を1つ足した
    写しを作って、text_dup だけを回す（絵には字が無いので、ほかの検査は回さない）。
    """
    import shutil as _sh
    base = json.loads((cwork / "plan.json").read_text())
    fps = base["fps"]
    cap1 = next(o for o in base["overlays"] if o.get("kind") == "caption" and o.get("line") == 1) \
        if base.get("overlays") else next(c for c in base["captions"] if c.get("line") == 1)
    cap1_text = cap1.get("text") or "／".join(cap1.get("lines") or [])

    def telop(text, a, b):
        return {"kind": "telop", "text": text, "from": a, "to": b, "x": 200, "y": 700, "w": 680, "h": 120,
                "png": ""}

    legs = [
        # 2行目の字幕をそのまま強調にした（1本目の「あと20分」と同じ形）
        ("text_dup_repeat", "fail", [telop(cap1_text.replace("／", ""), cap1["from"], cap1["to"])], None),
        # 字幕にもタイトルにも無いことを足した（1本目の「Pulë ＝ 鶏」と同じ形）
        ("text_dup_adds", "pass", [telop("Pulë ＝ 鶏", cap1["from"], cap1["to"])], None),
        # はじめの3秒に、タイトル・強調・字幕の3つに同じ並び（強調と字幕の重なりは 6割未満）
        ("text_dup_triple", "fail", [telop("ショート45秒の巻", 6, int(1.9 * fps))], "島のショートの／練習問題"),
    ]
    out = []
    for name, want, add, title in legs:
        work = box / f"{name}.work"
        if work.exists():
            _sh.rmtree(work)
        work.mkdir()
        plan = copy.deepcopy(base)
        # 時間割の形は2通りある（overlays を書く書き出し・書かない書き出し）。どちらにも足す
        if plan.get("overlays"):
            plan["overlays"] += add
            if title:
                for o in plan["overlays"]:
                    if o.get("kind") == "title":
                        o["text"] = title
        else:
            plan.setdefault("telops", []).extend(add)
            if title:
                for t in plan.get("titles", []):
                    t["lines"] = title.split("／")
        (work / "plan.json").write_text(json.dumps(plan, ensure_ascii=False))
        ctx = C.make_ctx(clean, work, crops=box / f"{name}.qa")
        rep = C.run_checks(ctx, only=["text_dup"])
        r = rep["checks"][0]
        out.append((name, want, r["status"], r["summary"] + (f"／{r['problems'][0]}" if r["problems"] else "")))
    return out


def linebreak_legs(C, clean: Path, cwork: Path, box: Path) -> list[tuple[str, str, str, str]]:
    """字の改行（line_breaks）の足。**時間割の字だけを書き換えて当てる**（text_dup の足と同じ形）。

    2026-10-21 の試写で実際に出た割れ（地下鉄の回 p1・銅像の回 p2 のコマ一覧で見たもの）を、clean の時間割の
    1行目の字幕に差し替え、line_breaks だけを回す。正しく割った同じ字は通ること、書き出しが元の字（src）を
    書いていない古い時間割でも落ちること、描いた行が元の字に当たらなければ落ちることも見る。
    """
    import shutil as _sh
    base = json.loads((cwork / "plan.json").read_text())

    def big(src, lines, legacy=False, manual=None):
        c = {"line": 0, "big": "shake_white", "text": src, "lines": lines}
        if not legacy:
            c["src"] = src
        if manual:
            # 人が決めた割れ目（render.py が指示書の split から書く）
            c["manual_breaks"] = manual
        return c

    def plain(src, lines):
        return {"line": 0, "src": src, "lines": lines}

    legs = [
        # 地下鉄の回 p1 の 6〜7秒（数と単位の間）
        ("lb_yen", "fail", big("1回700円やって！", ["1回700", "円やって！"])),
        # 銅像の回 p2 の 4秒（budoux では1つの文節の真ん中）
        ("lb_sugi", "fail", big("作りすぎやろ！", ["作りす", "ぎやろ！"])),
        # 銅像の回 p2 の 36〜37秒（budoux は切れ目と言うが、関西の打ち消しの前）
        ("lb_hen", "fail", big("1ミリも貢献してへんて！", ["1ミリも貢献して", "へんて！"])),
        # 地下鉄の回 p1 の 13行目（550cabd7 で直した、行の頭の読点）
        ("lb_comma", "fail", plain("ほんでカフェ覗いてみたら、コーヒー720円。", ["ほんでカフェ覗いてみたら", "、コーヒー720円"])),
        # 書き出しが src を書いていない古い時間割でも、【大】の字（text）で当てて落ちる
        ("lb_legacy", "fail", big("作りすぎやろ！", ["作りす", "ぎやろ！"], legacy=True)),
        # 描いた行が元の字に当たらない（字幕だけ直して書き出し直していない、など）
        ("lb_unplaced", "fail", plain("1回700円やって！", ["1回800円やって！"])),
        # 同じ字を、割ってよい所で割った（または割らなかった）もの
        ("lb_ok", "pass", [big("1回700円やって！", ["1回700円やって！"]), big("作りすぎやろ！", ["作りすぎやろ！"]),
                           big("1ミリも貢献してへんて！", ["1ミリも", "貢献してへんて！"]),
                           plain("ほんでカフェ覗いてみたら、コーヒー720円。", ["ほんでカフェ覗いてみたら", "コーヒー720円"])]),
        # 人が決めた割れ目（【大】の split）。budoux の切れ目でない「1回｜700円」も、人が決めれば通る
        ("lb_manual_ok", "pass", [big("1回700円やって！", ["1回", "700円やって！"], manual=[2]),
                                  big("中身スカスカやないかい！", ["中身", "スカスカやないかい！"], manual=[2])]),
        # 同じ割れ目でも、人が決めていなければ落ちる（budoux の切れ目ではない）
        ("lb_unmarked", "fail", big("1回700円やって！", ["1回", "700円やって！"])),
        # 人が決めても、固い決まりに当たれば落ちる（数と単位の間・関西の打ち消しの前）
        ("lb_manual_bad", "fail", big("1回700円やって！", ["1回7", "00円やって！"], manual=[3])),
        ("lb_manual_hen", "fail", big("1ミリも貢献してへんて！", ["1ミリも貢献して", "へんて！"], manual=[8])),
    ]
    out = []
    for name, want, caps in legs:
        work = box / f"{name}.work"
        if work.exists():
            _sh.rmtree(work)
        work.mkdir()
        plan = copy.deepcopy(base)
        caps = caps if isinstance(caps, list) else [caps]
        f0 = plan["captions"][0]["from"] if plan.get("captions") else 0
        plan["captions"] = [{**c, "from": f0 + 10 * k, "to": f0 + 10 * k + 10} for k, c in enumerate(caps)] + \
            [c for c in plan.get("captions", []) if c.get("line") != 0]
        (work / "plan.json").write_text(json.dumps(plan, ensure_ascii=False))
        ctx = C.make_ctx(clean, work, crops=box / f"{name}.qa")
        r = C.run_checks(ctx, only=["line_breaks"])["checks"][0]
        out.append((name, want, r["status"], r["summary"] + (f"／{r['problems'][0]}" if r["problems"] else "")))
    return out


def linebreak_render_leg(fd: Path) -> list[tuple[str, bool, str]]:
    """書き出しの割り方そのもの（render.py の fit_lines・wrap）が、割ってよい所でしか割らないか。

    試写で割れた字を、割れたときと同じ見た目（様式 v3 の【大】の shake_white・brush_zoom・shake_red）と、
    わざと狭くした幅で割らせる。前の書き出しは、文節の切れ目だけで大きく出せないと「いちばん長い文節を真ん中で割る」
    「1字ずつ割る」をしていたので、狭い幅ほど割れた（「1回700｜円やって！」「作りす｜ぎやろ！」）。
    書体が無い箱（CI）では箱の書体を同じ名前で置くので、字の幅は本物と違う。割れ目が割ってよい所かどうかは、
    幅に関係なく成り立つはずの性質なので、それを見る。
    """
    os.environ["SHORTS_FONTS_DIR"] = str(fd)
    sys.path.insert(0, str(RENDER))
    import linebreak as LB
    import render as R
    from PIL import ImageFont
    st = R.load_style("style_v3.json", RENDER)

    def font(name):
        # CI は M PLUS の名前に箱の書体を置くだけなので、【大】の筆の書体（Kaisei Tokumin）は無い。字幕の書体で代える
        try:
            return R.font_path(st, name)
        except SystemExit:
            return R.font_path(st, "caption")

    texts = ["1回700円やって！", "作りすぎやろ！", "1ミリも貢献してへんて！", "船も乗れるねん！", "中身スカスカやないかい！",
             "北マケドニアさん、すいません。", "入口の横の駐車場から、日の入りぴったり！", "と思ってたら、野良犬が来た。"]
    bad, stopped, n = [], [], 0
    for look in ("shake_white", "brush_zoom", "shake_red"):
        ent = st["big"]["looks"][look]
        fpath = font(ent.get("font", st["big"]["font"]))
        for t in texts:
            for w in (840, 696, 420, 300):
                try:
                    # 狭い幅では「割らずに小さくした」の注意が出る（思ったとおりなので、報告には混ぜない）
                    with contextlib.redirect_stderr(io.StringIO()):
                        lines, size = R.fit_lines(t, ent.get("look", ent), fpath, ent.get("size", 100),
                                                  ent.get("min_size", 60), w, ent.get("max_lines", 2),
                                                  ent.get("wrap_below", 0), fold_floor=ent.get("fold_floor", 0))
                except SystemExit:
                    stopped.append(f"{look} 幅{w}: {t}")   # 割らずに止まるのは、割るより正しい（数えて出す）
                    continue
                n += 1
                r = LB.bad_breaks(t, lines)
                if r is None or r[0]:
                    bad.append(f"{look} 幅{w}: {'｜'.join(lines)}")
    cap = ImageFont.truetype(str(font("caption")), 48)
    for t in texts:
        for w in (300, 200):
            lines = R.wrap(t, cap, w)
            n += 1
            r = LB.bad_breaks(t, lines)
            if r is None or r[0]:
                bad.append(f"字幕 幅{w}: {'｜'.join(lines)}")
    out = [("lb_render", not bad and n > 0,
            f"書き出しの割り方 {n} 通り（【大】3つの見た目×{len(texts)}字×4幅、字幕の折り返し）で語の途中の割れ {len(bad)}"
            + (f"・割らずに止まった {len(stopped)}" if stopped else "")
            + (f"。{' / '.join(bad[:4])}" if bad else ""))]

    # 人が決めた割れ目（指示書の split）: 正しい指定はそのとおりの行で描き、固い決まりに当たる指定では止まる
    ent = st["big"]["looks"]["shake_white"]
    fpath = font(ent.get("font", st["big"]["font"]))
    said = {}
    for marked, want in (("1回｜700円やって！", "draw"), ("中身｜スカスカやないかい！", "draw"),
                         ("1回7｜00円やって！", "stop"), ("1ミリも貢献して｜へんて！", "stop"), ("て｜ことで", "stop")):
        text = marked.replace("｜", "")
        try:
            with contextlib.redirect_stderr(io.StringIO()):
                segs, pos = R.manual_split(text, marked, "見張り")
                lines, _ = R.fit_lines(text, ent.get("look", ent), fpath, ent.get("size", 100), ent.get("min_size", 60),
                                       696, ent.get("max_lines", 2), ent.get("wrap_below", 0),
                                       fold_floor=ent.get("fold_floor", 0), fixed=segs)
            got = "draw" if lines == marked.split("｜") else f"別の行 {lines}"
        except SystemExit:
            got = "stop"
        said[marked] = (got, want)
    wrong = {k: v for k, v in said.items() if v[0] != v[1]}
    out.append(("lb_render_manual", not wrong,
                f"人が決めた割れ目 {len(said)} 通り: 正しい指定はそのとおり描き、固い決まりに当たる指定（1回7｜00円・"
                f"貢献して｜へんて・仮名1字の行）は止まる" + (f"。違う: {wrong}" if wrong else "")))
    return out


def strips_legs(box: Path, clean: Path, cwork: Path) -> list[tuple[str, bool, str]]:
    """帯の絵（strips.py）の足。

    - 合成の6秒（前半3秒は中くらいの大きさの形が画面いっぱい、後半3秒は細かい粒だけの灰色）で、
      後半にだけ弱い画の印が付くこと（1本目の歩道＝細かい模様だけ、串・棚＝形がある、の作り直し）
    - clean（時間割つき）で、ナレーションの行ごとの帯が行の数だけ出て、絵と JSON が書けること
    実物の4区間（カウンター・歩道・串・棚）での値は README と strips.py の頭（この箱から CI へは
    持ち出せない動画なので、ここでは当てない）。
    """
    import numpy as np
    import strips
    p = box / "strips_synth.mp4"
    rate = 10  # strips.py は 4コマ/秒で見るので、10コマ/秒あれば足りる（30 だと 1GB を流すことになる）
    n = 6 * rate
    proc = subprocess.Popen(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-f", "rawvideo",
                             "-pix_fmt", "rgb24", "-s", "1080x1920", "-r", str(rate), "-i", "-",
                             "-c:v", "libx264", "-preset", "ultrafast", "-crf", "18", "-pix_fmt", "yuv420p", str(p)],
                            stdin=subprocess.PIPE)
    rng = np.random.default_rng(1)
    from PIL import Image as _Im
    for k in range(n):
        if k < n // 2:
            # 16px 四方の色の粒を滑らかにつないだ画（e8 0.95 前後。棚の 0.92〜0.95 と同じくらい）
            small = (rng.random((120, 68, 3)) * 255).astype(np.uint8)
            fr = np.asarray(_Im.fromarray(small).resize((1080, 1920), _Im.BICUBIC))
        else:
            fr = np.clip(128 + rng.normal(0, 10, (1920, 1080, 1)), 0, 255).astype(np.uint8).repeat(3, axis=2)
        proc.stdin.write(np.ascontiguousarray(fr).tobytes())
    proc.stdin.close()
    proc.wait()
    rep = strips.make(p, None, box / "strips_synth")
    weak = rep["weak"]
    in_strong = [w for w in weak if w["from_s"] < 2.5]
    in_weak = [w for w in weak if w["from_s"] < 6.0 and w["to_s"] > 3.5]
    ok1 = bool(in_weak) and not in_strong
    msg1 = f"弱い画の印 {weak}（3〜6秒にだけ付くはず）"
    rep2 = strips.make(clean, cwork, box / "strips_clean")
    ok2 = len(rep2["rows"]) == len(LINES) and (box / "strips_clean.jpg").exists() and (box / "strips_clean.json").exists()
    msg2 = f"行の帯 {len(rep2['rows'])} 本（{len(LINES)} 本のはず）・はじめの帯 {len(rep2['opening_s'])} 枚"
    return [("strips_weak", ok1, msg1), ("strips_rows", ok2, msg2)]


HELD_SIZE = (360, 640)


def held_sources(box: Path, src: Path, n: int) -> dict[str, Path]:
    """元素材のカクつきの足の素材。clean の元素材（testsrc2）を1回だけ読み、4本に書き分ける。

    - judder_in: 2つ目のカットが使う [125, 230) だけ、同じ絵を4コマずつ繰り返す（実質 7.5fps。
      p2 のカクカクの区間と同じ 75% 前後）。ほかのコマは元のまま
    - judder_out: 使っていない所（カットの間と後ろ）だけ繰り返す。使った区間は元のまま
    - fifteen: 全部を2コマずつ（実質 15fps。Hc-z52fs108 の配信の区間と同じ形。線の手前）
    - still: 頭の1コマを止めたまま（写真。止まった画はカクつかない）

    縦横は半分（360x640）にして書く（4本の符号化と、検査が元の大きさで読むぶんを軽くする。testsrc2 は
    半分でも隣のコマとの差が 2 前後あり、止まった画の線 1.0 より上で「動いている」と読まれる）。
    """
    W, H = HELD_SIZE
    used = [(a, b) for a, b in CUTS]
    hold_in = range(CUTS[1][0], CUTS[1][1])
    rules = {
        "judder_in": lambda k: k in hold_in,
        "judder_out": lambda k: not any(a <= k < b for a, b in used),
        "fifteen": lambda k: True,
        "still": None,
    }
    step = {"judder_in": 4, "judder_out": 4, "fifteen": 2}
    out = {name: box / f"src_{name}.mp4" for name in rules}
    encs = {name: subprocess.Popen(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-f", "rawvideo",
                                    "-pix_fmt", "rgb24", "-s", f"{W}x{H}", "-r", str(FPS), "-i", "-",
                                    "-c:v", "libx264", "-preset", "ultrafast", "-crf", "18", "-pix_fmt", "yuv420p",
                                    str(p)], stdin=subprocess.PIPE) for name, p in out.items()}
    dec = subprocess.Popen(["ffmpeg", "-hide_banner", "-loglevel", "error", "-i", str(src), "-map", "0:v:0",
                            "-vf", f"scale={W}:{H}:flags=area", "-frames:v", str(n), "-f", "rawvideo",
                            "-pix_fmt", "rgb24", "-"], stdout=subprocess.PIPE)
    held: dict[str, bytes] = {}
    first = None
    for k in range(n):
        buf = dec.stdout.read(W * H * 3)
        if len(buf) < W * H * 3:
            break
        first = first or buf
        for name, rule in rules.items():
            if rule is None:
                fr = first
            elif rule(k):
                # 繰り返す間は、step コマごとに新しい絵を取り、その間は同じ絵を出す（配信がコマを落とした形）
                if k % step[name] == 0 or name not in held:
                    held[name] = buf
                fr = held[name]
            else:
                held.pop(name, None)
                fr = buf
            encs[name].stdin.write(fr)
    dec.stdout.close()
    dec.wait()
    for e in encs.values():
        e.stdin.close()
        e.wait()
    return out


def scene_clip(path: Path, seed: int, hue: int, n: int = 60, face: bool = False,
               face_size: tuple[int, int] = (82, 96)) -> None:
    """使い回しの足の素材: 色味（hue）と模様（seed）が場面ごとに違い、横に流れる絵（270x480・30fps）。

    場面どうしは HSV の分布がほぼ重ならず（色相の箱が別）、模様も別なので pHash も遠い。
    流れているので、元素材のカクつきの検査は「動いていて、繰り返しが無い」と測る。
    face=True は、流れる地の上に公有の顔写真を据えた「本人が話す画」（高さ 2割。本人の画の線は 1割）。
    既定の大きさ（82x96）は、Haar が返す顔の箱が画面の高さの 0.098〜0.100 で、本人の画の線（0.10）の
    ちょうど上下に出る（2026-10-21 に測った）。線から離したい足は face_size で大きくする
    """
    import numpy as np
    from PIL import Image
    w, h, speed = 270, 480, 3
    rng = np.random.default_rng(seed)
    wide = w + speed * n
    sv = []
    for _ in range(2):
        small = (rng.random((h // 24 + 2, wide // 24 + 2)) * 255).astype(np.uint8)
        sv.append(np.asarray(Image.fromarray(small).resize((wide, h), Image.BICUBIC)))
    hh = (hue + (rng.random((h // 60 + 2, wide // 60 + 2)) * 14 - 7)).clip(0, 255).astype(np.uint8)
    hh = np.asarray(Image.fromarray(hh).resize((wide, h), Image.BICUBIC))
    s = (150 + sv[0] // 3).astype(np.uint8)
    v = (90 + sv[1] // 2).astype(np.uint8)
    field = np.stack([hh, s, v], -1)
    head = None
    if face:
        head = Image.open(HERE / "assets" / "face_public_domain.jpg").convert("RGB").resize(face_size, Image.BICUBIC)
    enc = subprocess.Popen(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgb24",
                            "-s", f"{w}x{h}", "-r", str(FPS), "-i", "-", "-c:v", "libx264", "-preset", "ultrafast",
                            "-crf", "18", "-pix_fmt", "yuv420p", str(path)], stdin=subprocess.PIPE)
    for t in range(n):
        rgb = Image.fromarray(np.ascontiguousarray(field[:, t * speed:t * speed + w]), "HSV").convert("RGB")
        if head is not None:
            rgb.paste(head, (94, 150))
        enc.stdin.write(rgb.tobytes())
    enc.stdin.close()
    enc.wait()


_SCENES: dict = {}


def scene_frames(path: Path):
    """場面の絵（270x480）を全部、1回だけ復号して持つ（1場面 60〜240コマで 23〜93MB）。"""
    import numpy as np
    if path not in _SCENES:
        raw = sh(["ffmpeg", "-hide_banner", "-loglevel", "error", "-i", str(path), "-f", "rawvideo",
                  "-pix_fmt", "rgb24", "-"]).stdout
        _SCENES[path] = np.frombuffer(raw, np.uint8).reshape(-1, 480, 270, 3)
    return _SCENES[path]


def synth_leg(box: Path, name: str, cuts: list[tuple[Path, int, int]]) -> tuple[Path, Path]:
    """カットの並びどおりに、場面の絵をつないだ下書きの大きさ（540x960）の mp4 と、その時間割を作る。

    書き出し（render.py）を通さないのは、見張りの5分に入れるため（素材の絵をそのまま並べるだけなので、
    寄せの無い書き出しと同じ絵になる）。時間割は下書きの形（draft・size 1080x1920）にし、
    検査が下書きを広げて測る道（common.iter_frames）をそのまま通す。
    """
    mp4, work = box / f"{name}.mp4", box / f"{name}.work"
    work.mkdir(exist_ok=True)
    enc = subprocess.Popen(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgb24",
                            "-s", "540x960", "-r", str(FPS), "-i", "-", "-c:v", "libx264", "-preset", "ultrafast",
                            "-crf", "18", "-pix_fmt", "yuv420p", "-movflags", "+faststart", str(mp4)],
                           stdin=subprocess.PIPE)
    plan_cuts, at = [], 0
    for src, a, b in cuts:
        frames = scene_frames(src)[a:b]
        assert len(frames) == b - a, (src, a, b, len(frames))
        # 縦横2倍（近いコマの画素を並べるだけ）。場面ごとに1回だけ復号して、足をまたいで使い回す
        enc.stdin.write(frames.repeat(2, axis=1).repeat(2, axis=2).tobytes())
        plan_cuts.append({"src": src.stem, "path": str(src), "in": a, "out": b, "at": at, "frames": b - a,
                          "crop": [0, 0, 270, 480]})
        at += b - a
    enc.stdin.close()
    enc.wait()
    (work / "plan.json").write_text(json.dumps({"fps": FPS, "size": [1080, 1920], "frames": at, "draft": True,
                                                "cuts": plan_cuts, "overlays": []}, ensure_ascii=False))
    return mp4, work


def run_both(C, box: Path, name: str, mp4: Path, work: Path) -> dict:
    """新しい2つの検査（元素材のカクつき・同じ画の使い回し）だけを回す。"""
    ctx = C.make_ctx(mp4, work, crops=box / f"{name}.qa")
    return {r["id"]: r for r in C.run_checks(ctx, only=["source_stutter", "shot_reuse"])["checks"]}


def stutter_legs(C, box: Path, clean: Path, cwork: Path) -> list[tuple[str, bool, str]]:
    """元素材のカクつき（source_stutter）の足。**clean の時間割の元素材だけを差し替える**（絵は clean のまま）。

    この検査は出来上がりの画素ではなく、時間割から戻った元素材の区間を見るので、書き出しを通さずに当てる。
    使い回しの検査も一緒に回し、こちらは落ちないこと（2つが混ざっていないこと）も見る。

    | 足 | 壊し方 | source_stutter | shot_reuse |
    | --- | --- | --- | --- |
    | stutter_in | 2つ目のカットの元の区間だけ、同じ絵を4コマずつ（実質 7.5fps） | fail（その区間だけ 6割超） | pass |
    | stutter_out | 使っていない所だけ繰り返す | pass（全区間とも 1割以下） | pass |
    | stutter_15fps | 全部を2コマずつ（Hc の配信の形） | pass（繰り返しは 4〜6割と測ったうえで） | pass |
    | stutter_still | 1コマを止めたまま（写真） | pass（全区間とも止まった画として数えない） | pass |
    | stutter_zoom_hint | stutter_in の2つ目のカットに、止まった切り出し（from == to）と動く寄せを付ける | どちらも fail。「ゆっくり寄せている」は動く寄せにだけ付く | — |
    """
    import shutil as _sh
    out = []
    base = json.loads((cwork / "plan.json").read_text())
    srcs = held_sources(box, box / "source.mp4", CUTS[-1][1] + 10)
    for name, key in (("stutter_in", "judder_in"), ("stutter_out", "judder_out"),
                      ("stutter_15fps", "fifteen"), ("stutter_still", "still")):
        work = box / f"{name}.work"
        if work.exists():
            _sh.rmtree(work)
        work.mkdir()
        plan = copy.deepcopy(base)
        for c in plan["cuts"]:
            c["path"] = str(srcs[key])
            c["crop"] = [0, 0, *HELD_SIZE]
        (work / "plan.json").write_text(json.dumps(plan, ensure_ascii=False))
        r = run_both(C, box, name, clean, work)
        st, ru = r["source_stutter"], r["shot_reuse"]
        reps = [x.get("repeat") for x in st["measured"].get("segments", [])]
        both = ru["status"] == "pass" and len(reps) == len(CUTS)
        if name == "stutter_in":
            ok = (both and st["status"] == "fail" and reps[1] is not None and reps[1] > 0.6
                  and all(x is not None and x <= 0.1 for k, x in enumerate(reps) if k != 1))
        elif name == "stutter_15fps":
            # 1コマおきの繰り返しを「繰り返し」と数えたうえで、線（6割）の手前に収まること
            ok = both and st["status"] == "pass" and all(x is not None and 0.4 <= x <= 0.6 for x in reps)
        elif name == "stutter_still":
            ok = both and st["status"] == "pass" and st["measured"].get("still_segments") == len(CUTS)
        else:
            ok = both and st["status"] == "pass" and all(x is not None and x <= 0.1 for x in reps)
        out.append((name, ok, f"source_stutter {st['status']}（区間ごとの繰り返し {reps}）／shot_reuse {ru['status']}"))

    # 寄せの言い添え: 動く寄せ（from != to）の区間にだけ「ゆっくり寄せている」を付ける。止まった切り出し
    # （from == to）に付けると、直す人を寄せ（無いもの）に向かわせる（2026-10-19、編集の担当が見つけた）
    hint = "ゆっくり寄せている"
    said = {}
    for kind, zoom in (("static", {"from": 1.3, "to": 1.3, "x": 0.5, "y": 0.5}),
                       ("moving", {"from": 1.27, "to": 1.33, "x": 0.5, "y": 0.5})):
        work = box / f"stutter_zoom_{kind}.work"
        if work.exists():
            _sh.rmtree(work)
        work.mkdir()
        plan = copy.deepcopy(base)
        for c in plan["cuts"]:
            c["path"] = str(srcs["judder_in"])
            c["crop"] = [0, 0, *HELD_SIZE]
        plan["cuts"][1]["zoom"] = zoom
        (work / "plan.json").write_text(json.dumps(plan, ensure_ascii=False))
        ctx = C.make_ctx(clean, work, crops=box / f"stutter_zoom_{kind}.qa")
        st = C.run_checks(ctx, only=["source_stutter"])["checks"][0]
        said[kind] = st["status"] == "fail" and any(hint in p for p in st["problems"])
    ok = said == {"static": False, "moving": True}
    out.append(("stutter_zoom_hint", ok, f"寄せの言い添え: 止まった切り出し {said['static']}（False のはず）・"
                                         f"動く寄せ {said['moving']}（True のはず）"))
    return out


def format_legs() -> list[tuple[str, bool, str]]:
    """配信の時刻の書きかた（common.hms）。0.1秒に丸めてから時・分・秒に割ること（割ってから丸めると
    299.97秒が 0:04:60.0 になった。2026-10-19、編集の担当が見つけた）。"""
    from common import hms
    want = {299.97: "0:05:00.0", 3599.96: "1:00:00.0", 59.94: "0:00:59.9", 0.0: "0:00:00.0", 396.5: "0:06:36.5",
            5441.04: "1:30:41.0"}
    got = {t: hms(t) for t in want}
    bad = {t: g for t, g in got.items() if g != want[t]}
    return [("hms_carry", not bad, f"時刻の書きかた {len(want) - len(bad)}/{len(want)} が思ったとおり"
                                   + (f"。違う: {bad}" if bad else ""))]


def reuse_legs(C, box: Path) -> list[tuple[str, bool, str]]:
    """同じ画の使い回し（shot_reuse）の足。場面の絵をつないだ下書きと、その時間割で当てる。

    出来上がりは素材の絵をそのまま並べるだけなので、書き出し（render.py）を通さない。
    元素材のカクつきの検査も一緒に回し、こちらは落ちないことも見る（場面は流れていて繰り返しが無い）。

    | 足 | 並べ方 | shot_reuse |
    | --- | --- | --- |
    | reuse_4x | 同じ場面の同じ区間を4回（間に別の場面） | fail（57%・4回） |
    | reuse_scene | 同じ素材の**別の時刻**を4回（1.7秒ずつ離す。p2 のベッドの形） | fail（47%・4回） |
    | reuse_presenter | reuse_scene と同じ並びで、場面に顔（高さ 2割）を据える | pass（本人の画どうしは束ねない） |
    | reuse_count | 同じ区間を短く4回 | fail（回数だけ。割合は 18%） |
    | reuse_share | 同じ区間を長く2回 | fail（割合だけ。57%・2回） |
    | reuse_none | 7場面とも別。A だけ行の境で2つに割って続けて並べる | pass（割った A は1回と数える） |
    | reuse_callback | 冒頭と終わりだけ同じ（21%・2回） | pass（呼び戻しと読む） |
    """
    scenes = {}
    for k, nm in enumerate("ABCDEFG"):
        scenes[nm] = box / f"scene_{nm}.mp4"
        scene_clip(scenes[nm], seed=10 + k, hue=k * 255 // 7)
    # 別の時刻を使う足の場面は 8秒。色は肌から遠い青（顔の検出器が地を顔と読まないように）
    S, P = box / "scene_S.mp4", box / "scene_P.mp4"
    scene_clip(S, seed=30, hue=170, n=240)
    scene_clip(P, seed=30, hue=170, n=240, face=True)
    A, B, Cs, D, E, F, G = (scenes[x] for x in "ABCDEFG")

    def spread(x):
        return [(x, 0, 20), (B, 0, 30), (x, 70, 90), (Cs, 0, 30), (x, 140, 160), (D, 0, 30), (x, 210, 230)]

    legs = {
        "reuse_4x": ([(A, 0, 30), (B, 0, 30), (A, 0, 30), (Cs, 0, 30), (A, 0, 30), (D, 0, 30), (A, 0, 30)],
                     "fail", lambda m: m["largest"]["runs"] == 4 and m["largest"]["share"] > 0.25),
        # 別の時刻どうしなので、束ねる前に顔を探していること（探して、本人の画ではないと読んだこと）も見る
        "reuse_scene": (spread(S), "fail",
                        lambda m: m["largest"]["runs"] == 4 and not m["presenter_cuts"] and m["faces_looked_cuts"] >= 1),
        "reuse_presenter": (spread(P), "pass",
                            lambda m: m["largest"] is None and len(m["presenter_cuts"]) == 4),
        "reuse_count": ([(A, 0, 10), (B, 0, 30), (A, 0, 10), (Cs, 0, 30), (A, 0, 10), (D, 0, 30), (A, 0, 10),
                         (E, 0, 30), (F, 0, 30), (G, 0, 30)],
                        "fail", lambda m: m["largest"]["runs"] == 4 and m["largest"]["share"] <= 0.25),
        "reuse_share": ([(A, 0, 60), (B, 0, 30), (Cs, 0, 30), (A, 0, 60), (D, 0, 30)],
                        "fail", lambda m: m["largest"]["runs"] == 2 and m["largest"]["share"] > 0.25),
        # A を行の境で2つに割って続けて並べる（1回と数える）ほかは、全部別の場面
        "reuse_none": ([(A, 0, 30), (A, 30, 60)] + [(x, 0, 30) for x in (B, Cs, D, E, F, G)], "pass",
                       lambda m: m["largest"] is None),
        "reuse_callback": ([(A, 0, 20), (B, 0, 30), (Cs, 0, 30), (D, 0, 30), (E, 0, 30), (F, 0, 30), (A, 0, 20)],
                           "pass", lambda m: m["largest"] is not None and m["largest"]["callback"]
                           and m["largest"]["runs"] == 2),
    }
    out = []
    for name, (cuts, want, shape) in legs.items():
        mp4, work = synth_leg(box, name, cuts)
        r = run_both(C, box, name, mp4, work)
        st, ru = r["source_stutter"], r["shot_reuse"]
        m = ru["measured"]
        try:
            fits = bool(shape(m))
        except (KeyError, TypeError):
            fits = False
        ok = ru["status"] == want and st["status"] == "pass" and m.get("cuts") == len(cuts) and fits
        out.append((name, ok, f"shot_reuse {ru['status']}（欲しいのは {want}。{ru['summary']}。"
                              f"本人の画 {m.get('presenter_cuts')}）／source_stutter {st['status']}"))
    return out


# ---------------------------------------------------------------- 当てる

# 名前 → （どちらの見張りか, 落ちるはずの検査, その判定）。None は「どれも落ちない」
CASES = {
    "clean": ("both", None, None),
    "long61": ("qa_video", "container", "fail"),
    "no_faststart": ("qa", "container", "fail"),
    "quiet": ("qa", "loudness", "fail"),
    "bgm_loud": ("qa", "voice_vs_bgm", "fail"),
    "sync_late": ("qa", "subtitle_sync", "fail"),
    "safe_low": ("qa", "safe_area", "fail"),
    "no_bgm": ("qa", "silence", "fail"),
    "clipped": ("qa", "clipping", "fail"),
    "source_loud": ("qa", "original_audio", "fail"),
    "watermark": ("qa_video", "watermark", "fail"),
    "face": ("qa_video", "faces", "needs-human"),
    "face_blurred": ("qa_video", None, None),
    "text_face": ("qa_video", "text_on_face", "fail"),
    "black": ("qa_video", "black", "fail"),
    "frozen": ("qa_video", "frozen", "fail"),
}


PLATE_ONLY = ("text_on_face",)   # 字なしの版（plate）が無ければ not-checkable になる検査


def run(half: str, keep: Path | None = None) -> int:
    """half: "qa"（音・字・形式）/ "qa_video"（絵・長さ）/ "all"。

    絵の検査（顔・透かし）が重いので、絵を変える版を qa_video にまとめ、2本の時間をほぼ揃えた
    （runner の上限は1本 5分。この箱で 2本とも 2〜3分）。
    """
    miss = need()
    if miss:
        print("✕ 回せない（数えるものが無い）: " + " / ".join(miss))
        return 2
    import check as C
    import numpy as np
    from common import NA, PASS, video_md5

    names = [n for n, (h, _, _) in CASES.items() if half == "all" or h in (half, "both")]
    t_all = time.monotonic()
    tmp = None
    if keep:
        box = keep.resolve()
        box.mkdir(parents=True, exist_ok=True)
    else:
        tmp = tempfile.TemporaryDirectory(prefix=f"{half}_selftest_")
        box = Path(tmp.name)
    try:
        fd = fonts_dir(box)
        if fd is None:
            print("✕ 回せない: 書体が1つも無い（tools/shorts/render/fetch_fonts.sh か、fonts-dejavu-core）")
            return 2
        env = dict(os.environ, SHORTS_FONTS_DIR=str(fd))
        t0 = time.monotonic()
        make_source(box / "source.mp4")
        make_bgm(box / "bgm.wav")
        voices = {}
        for i, (_, sec, _) in enumerate(LINES):
            voices[i] = box / f"voice{i}.wav"
            write_wav(voices[i], voice(sec, 120 + 25 * i, i))
        # 2行目の頭に 6コマ（200ms）の無音: 字幕は時間割どおり出るので、声より 6コマ早くなる
        late = box / "voice1_late.wav"
        write_wav(late, np.concatenate([np.zeros(SR // 5), voice(LINES[1][1], 145, 1)]))
        # 1行目を割る: 3倍にして ±1 で切り（平らな頂点）、元と同じ RMS まで下げる。
        # 下げないと、その行だけ大きくなって、音量を揃える書き出しが他の行を小さくし、
        # 声と BGM の差まで落ちる（割れとは別の検査が落ちる。実際に一度そうなった）
        v0 = voice(LINES[0][1], 120, 0)
        cl = np.clip(v0 * 3, -1, 1)
        cl *= np.sqrt(np.mean(v0 ** 2) / np.mean(cl ** 2))
        clipped = box / "voice0_clip.wav"
        write_wav(clipped, cl)
        st = style_copy(box, "base")
        print(f"[素材] {time.monotonic() - t0:.1f}秒（720x1280・{SEC}秒・声 {len(LINES)}行）")

        # ---- 書き出し（本物の render.py）
        bgm = box / "bgm.wav"
        jobs = {
            "clean": dict(voices=voices, style=st, bgm=bgm),
            "plate": dict(voices=voices, style=st, bgm=bgm, captions=False, title=False),
            "bgm_loud": dict(voices=voices, style=st, bgm=bgm, bgm_db=12.0),
            "sync_late": dict(voices={**voices, 1: late}, style=st, bgm=bgm),
            "safe_low": dict(voices=voices, style=style_copy(box, "low", caption__center_y=1300), bgm=bgm),
            "no_bgm": dict(voices=voices, style=st, bgm=None),
            "clipped": dict(voices={**voices, 0: clipped}, style=st, bgm=bgm),
            "source_loud": dict(voices=voices, style=st, bgm=bgm, cut_audio_db=0.0),
        }
        # 字なしの書き出し（plate）は、字の置き場を画素の差で見る足（safe_area の2つ目の測り）に使う
        want_jobs = [j for j in jobs if j in names or (j == "plate" and ({"safe_low", "text_face"} & set(names)))]
        made, raw_loud = {}, {}
        t0 = time.monotonic()
        for name in want_jobs:
            raw, work = render(box, build_edit(box, name, **jobs[name]), name, env)
            mp4 = box / f"{name}.mp4"
            raw_loud[name] = master(raw, mp4)
            made[name] = (mp4, work)
        print(f"[書き出し] {len(want_jobs)}本 {time.monotonic() - t0:.1f}秒")
        r0 = raw_loud["clean"]["raw"]
        print(f"[参考] render.py の素の書き出し: {r0['integrated_lufs']} LUFS / TP {r0['true_peak_dbtp']} dBTP"
              f" → 音量合わせ {raw_loud['clean']['gain_db']:+.2f}dB で clean を作った")

        clean, cwork = made["clean"]
        plate = made["plate"][0] if "plate" in made else None
        # ---- 書き出したあとに壊す
        t0 = time.monotonic()
        post = {}
        if "long61" in names:
            lst = box / "concat.txt"
            lst.write_text("".join(f"file '{clean}'\n" for _ in range(7)))
            sh(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-f", "concat", "-safe", "0", "-i", str(lst),
                "-t", "61", "-c", "copy", "-movflags", "+faststart", str(box / "long61.mp4")])
            post["long61"] = box / "long61.mp4"
        if "no_faststart" in names:
            sh(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", str(clean), "-map", "0", "-c", "copy",
                str(box / "no_faststart.mp4")])
            post["no_faststart"] = box / "no_faststart.mp4"
        if "quiet" in names:
            sh(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", str(clean), "-map", "0", "-c:v", "copy",
                "-af", "volume=-8dB", "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart",
                str(box / "quiet.mp4")])
            post["quiet"] = box / "quiet.mp4"
        if "watermark" in names:
            lp, lx, ly = logo_png(box)
            # 透かしを消し損ねたカットが1つある形（1〜3秒）。ほかのコマは clean と画素ごと同じ
            lossless(clean, box / "watermark.mp4", inputs=["-i", str(lp)],
                     fc=f"[0:v][1:v]overlay={lx}:{ly}:enable='between(t,1,3)'[v]")
            post["watermark"] = box / "watermark.mp4"
        for nm, blur in (("face", 0), ("face_blurred", 9)):
            if nm in names:
                fp = face_png(box, blur)
                lossless(clean, box / f"{nm}.mp4", inputs=["-i", str(fp)],
                         fc="[0:v][1:v]overlay=400:1300:enable='between(t,3,5)'[v]")
                post[nm] = box / f"{nm}.mp4"
        # 字と顔: 字なしの版の、1行目の字幕の下に、ぼかしていない顔を貼る（仕上がりの mp4 は clean のまま）。
        # 字と顔の検査は字なしの版で顔を探すので、これで「字が顔に被っている」になる。仕上がりに顔は無いので
        # 顔の検査は落ちず、字なしの版との差は安全領域の内側だけなので safe_area も落ちない
        text_face_plate = None
        if "text_face" in names and plate is not None:
            fp = face_png(box, 0)
            text_face_plate = box / "plate_text_face.mp4"
            lossless(plate, text_face_plate, inputs=["-i", str(fp)],
                     fc="[0:v][1:v]overlay=420:830:enable='between(t,0.3,1.6)'[v]")
            post["text_face"] = clean
        # 黒・止めるのは、1行目と2行目の字幕の間（字幕を消さない。消すと字の検査まで落ちる）
        if "black" in names:
            lossless(clean, box / "black.mp4",
                     vf=f"drawbox=x=0:y=0:w=iw:h=ih:color=black:t=fill:enable='between(n,{GAP[0]},{GAP[1] - 1})'")
            post["black"] = box / "black.mp4"
        if "frozen" in names:
            lossless(clean, box / "frozen.mp4",
                     fc=f"[0:v]split[a][b];[a][b]freezeframes=first={GAP[0]}:last={GAP[1]}:replace={GAP[0]}[v]")
            post["frozen"] = box / "frozen.mp4"
        print(f"[壊す] {len(post)}本 {time.monotonic() - t0:.1f}秒")

        # ---- 思ったとおりか
        inputs = {n: (post[n], cwork) for n in post}
        inputs.update({n: made[n] for n in made if n != "plate"})
        vcache: dict[tuple, list] = {}
        bad, rows, reports = [], [], {}
        for name in names:
            _, target, want = CASES[name]
            mp4, work = inputs[name]
            # 字なしとの差は、clean と字の置き場を変えた版で当てる（ほかの版は、時間割の絵で当てる足だけ）
            pl = plate if name in ("clean", "safe_low") else (text_face_plate if name == "text_face" else None)
            t0 = time.monotonic()
            ctx = C.make_ctx(mp4, work, plate=pl, crops=box / f"{name}.qa")
            vkey = (video_md5(mp4), overlay_key(ctx.plan), cuts_key(ctx.plan), str(pl))
            reuse = vkey in vcache
            rep = C.run_checks(ctx, skip=list(C.VIDEO_ONLY) if reuse else None)
            if reuse:
                rep["checks"] += [copy.deepcopy(r) for r in vcache[vkey]]
                order = list(C.CHECKS)
                rep["checks"].sort(key=lambda r: order.index(r["id"]))
            else:
                vcache[vkey] = [copy.deepcopy(r) for r in rep["checks"] if r["id"] in C.VIDEO_ONLY]
            reports[name] = rep
            got = {r["id"]: r["status"] for r in rep["checks"]}
            wrong = []
            if len(got) != len(C.CHECKS):
                wrong.append(f"検査が {len(got)} 本しか回っていない")
            for cid, s in got.items():
                # 字と顔の検査は字なしの版でしか測れない。渡していない足では not-checkable が正しい
                expect = want if cid == target else (NA if cid in PLATE_ONLY and pl is None else PASS)
                if s != expect:
                    wrong.append(f"{cid}: {s}（欲しいのは {expect}）")
            if wrong:
                bad.append((name, wrong))
            # 字なしの版を渡していない足の not-checkable（思ったとおり）は、落ちた検査に並べない
            failed = [cid for cid, s in got.items() if s != PASS and not (cid in PLATE_ONLY and pl is None and s == NA)]
            rows.append(("○" if not wrong else "✕", name, target or "（なし）", ", ".join(failed) or "（なし）",
                         round(time.monotonic() - t0, 1), "絵は clean と同じ" if reuse else ""))
            if keep:
                (box / f"{name}.qa.json").write_text(json.dumps(rep, ensure_ascii=False, indent=1, default=str))

        extra = []
        # ---- 分母: 「0件で通った」を通ったと読まない（docs/island-standards.md §15）
        cl = {r["id"]: r for r in reports["clean"]["checks"]}
        dur = N / FPS
        floor = [
            ("faces が見たコマ", cl["faces"]["measured"].get("frames", 0), math.floor(4 * dur)),
            ("watermark が見たコマ", cl["watermark"]["measured"].get("frames", 0), math.floor(2 * dur)),
            ("black が見たコマ", cl["black"]["measured"].get("frames", 0), N),
            ("subtitle_sync が測った行", sum(1 for r in cl["subtitle_sync"]["measured"].get("lines", [])
                                         if r.get("offset") is not None), len(LINES)),
            ("safe_area が見た字の絵", cl["safe_area"]["measured"].get("overlay_count", 0), 1 + len(LINES)),
            ("voice_vs_bgm が測った行", len(cl["voice_vs_bgm"]["measured"].get("lines", [])), len(LINES)),
            # 元素材の testsrc2 は動いているので、全区間とも「止まった画」ではなく割合を出すこと
            ("source_stutter が測った区間", cl["source_stutter"]["measured"].get("measured_segments", 0), len(CUTS)),
            ("shot_reuse が見たカット", cl["shot_reuse"]["measured"].get("cuts", 0), len(CUTS)),
            # カットの選び方の3つも、clean の全カットを見たうえで通ること（0件で通ったを通ったと読まない）
            ("cut_length が見たカット", cl["cut_length"]["measured"].get("plan_cuts", 0), len(CUTS)),
            ("similar_run が見たカット", cl["similar_run"]["measured"].get("cuts", 0), len(CUTS)),
            ("still_image が画素で測ったカット", cl["still_image"]["measured"].get("measured_cuts", 0), len(CUTS)),
            # 字の改行も、clean の字（題と字幕3行）を全部見たうえで通ること
            ("line_breaks が見た字のかたまり", cl["line_breaks"]["measured"].get("items", 0), 1 + len(LINES)),
        ]
        if plate is not None:
            floor.append(("safe_area が字なしと引いたコマ",
                          cl["safe_area"]["measured"].get("plate", {}).get("frames", 0), N // 7))
            # 字が出ているコマ（3行で 4.4秒ぶん）は全部見ること
            floor.append(("text_on_face が見たコマ", cl["text_on_face"]["measured"].get("frames", 0),
                          int(sum(sec for _, sec, _ in LINES) * FPS)))
        if "text_face" in reports:
            tf = {r["id"]: r for r in reports["text_face"]["checks"]}["text_on_face"]["measured"]
            extra.append(f"字と顔: 貼った顔に被った行 {len(tf.get('lines_on_face', []))}・顔のあるコマ {tf.get('frames_with_face', 0)}"
                         f"（続かずに捨てた箱 {tf.get('dropped_short', 0)}）")
        for what, got_n, need_n in floor:
            if got_n < need_n:
                bad.append(("clean", [f"{what} が {got_n}（{need_n} 以上のはず）"]))
        # render/verify.py（書き出しの道具の確かめ）の字幕の出入りの照合も、同じ clean で回り続けること
        sys.path.insert(0, str(RENDER))
        import verify
        vc = verify.check_captions(clean, json.loads((cwork / "plan.json").read_text()))
        extra.append(f"render/verify.py の字幕の出入り: {vc['checked']} 枚・食い違い {vc['bad_edges']}")
        if vc["checked"] < len(LINES) or vc["bad_edges"]:
            bad.append(("clean", [f"render/verify.py の字幕の出入りが {vc['bad_edges']} か所食い違う（{vc['checked']} 枚）"]))
        if "face_blurred" in reports:
            fb = {r["id"]: r for r in reports["face_blurred"]["checks"]}["faces"]["measured"]
            blurred_seen = sum(1 for t in fb.get("tracks", []) if t.get("blurred"))
            extra.append(f"ぼかした顔: 検出 {fb.get('detections', 0)} 件、うちぼかし済みと判定した束 {blurred_seen}")
            if blurred_seen == 0:
                bad.append(("face_blurred", ["ぼかした顔が1度も検出されなかった（ぼかしの判定を当てられていない）"]))
        if half in ("qa_video", "all"):
            ok, msg = flat_control()
            extra.append(msg)
            if not ok:
                bad.append(("flat", [msg]))
        if "face" in reports:
            fs = {r["id"]: r for r in reports["face"]["checks"]}["faces"]
            if not fs["artifacts"]:
                bad.append(("face", ["人に見せる顔の切り抜きが出ていない"]))
        if half in ("qa", "all"):
            for cid, fn in (("text_dup", text_dup_legs), ("line_breaks", linebreak_legs)):
                for name, want, got, summ in fn(C, clean, cwork, box):
                    ok = got == want
                    rows.append(("○" if ok else "✕", name, f"{cid}（{want}）", f"{cid}: {got}", 0.0,
                                 "時間割だけの足"))
                    extra.append(f"{name}: {summ}")
                    if not ok:
                        bad.append((name, [f"{cid}: {got}（欲しいのは {want}）"]))
        if half in ("qa_video", "all"):
            for name, ok, msg in strips_legs(box, clean, cwork):
                rows.append(("○" if ok else "✕", name, "strips の弱い画", msg, 0.0, "帯の絵"))
                if not ok:
                    bad.append((name, [msg]))
        # 元素材のカクつきの足は qa、使い回しの足は qa_video に置く（どちらも絵の検査だが、
        # 使い回しの足は顔を探すぶん重い。2本の時間を揃えて、1本 5分の上限に余裕を残すため）
        for want_half, fn, target in (("qa", lambda: stutter_legs(C, box, clean, cwork), "source_stutter"),
                                      ("qa", format_legs, "common.hms"),
                                      ("qa", lambda: linebreak_render_leg(fd), "render.py の割り方"),
                                      ("qa_video", lambda: reuse_legs(C, box), "shot_reuse")):
            if half not in (want_half, "all"):
                continue
            t0 = time.monotonic()
            legs = fn()
            per = round((time.monotonic() - t0) / max(1, len(legs)), 1)
            for name, ok, msg in legs:
                rows.append(("○" if ok else "✕", name, target, msg, per, "時間割と素材だけの足"))
                if not ok:
                    bad.append((name, [msg]))

        print()
        print("| | 壊し方 | 落ちるはずの検査 | 落ちた検査 | 秒 | |")
        print("| --- | --- | --- | --- | --- | --- |")
        for mark, name, target, failed, sec, note in rows:
            print(f"| {mark} | {name} | {target} | {failed} | {sec} | {note} |")
        print()
        for what, got_n, need_n in floor:
            print(f"  分母: {what} {got_n}（{need_n} 以上）")
        for e in extra:
            print(f"  {e}")
        print(f"\n全体 {time.monotonic() - t_all:.1f}秒")
        if bad:
            print("\n✕ 思ったとおりでない:")
            for name, ws in bad:
                for w in ws:
                    print(f"  {name}: {w}")
            return 1
        print(f"○ {len(names)}通り、思ったとおり（clean は{len(C.CHECKS)}本とも pass、壊した版は壊したところだけが落ちる）")
        return 0
    finally:
        if tmp is not None:
            tmp.cleanup()


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("half", choices=["qa", "qa_video", "all"])
    ap.add_argument("--keep", type=Path, help="作ったものを残す置き場")
    a = ap.parse_args()
    sys.exit(run(a.half, a.keep))
