"""**ショートの品質チェック（check.py）が、落ちるときに落ちるか**を、わざと壊した動画で当てる道具。

見張りは2本に分けて呼ぶ（1本 5分の上限に余裕を持たせるため。どちらも clean を作り直す）:

    python3 tools/shorts/qa/qa_selftest.py         # 音・字（ずれ・置き場）・形式の壊し方
    python3 tools/shorts/qa/qa_video_selftest.py   # 絵・長さの壊し方（透かし・顔・黒・止まり・61秒）
    python3 tools/shorts/qa/drill.py all --keep DIR  # 両方を1回で。作った動画と報告を DIR に残す

終了コード 0=全部思ったとおり / 1=思ったとおりでない足がある / **2=数えるものが無い**
（ffmpeg・OpenCV・顔の検出器・書体のどれかが無い。「通った」とは言わない）。

## 何を当てるか

壊れていない1本（clean）は**12の検査が全部 pass**。壊した1本ごとに、
**壊したところを見る検査だけが落ち、ほかの11は pass のまま**であること。
落ちないなら、その検査は何も見ていない（緑は2通りに読める。CLAUDE.md）。
関係ない検査まで落ちるなら、検査が混ざっている。

| 壊し方 | 落ちるはずの検査 | 見張り |
| --- | --- | --- |
| 61秒にする（同じ動画をつなぐ） | container | qa_video |
| faststart を外す（moov を後ろに） | container | qa |
| 音を 8dB 下げる | loudness | qa |
| BGM を 8dB 上げる（声との差 9〜10dB） | voice_vs_bgm | qa |
| 2行目の声の頭に 6コマの無音（字幕が声より 6コマ早い） | subtitle_sync | qa |
| 字幕を y=1300 に下げる（安全領域の下 1248 を越える） | safe_area | qa |
| BGM を外す（声の間が 2〜3秒無音） | silence | qa |
| 1行目の声を割る（頭が平ら。RMS は元のまま） | clipping | qa |
| 元音声を下げない（source_db = 0） | original_audio | qa |
| 1〜3秒に PRISM Live の透かしを貼る | watermark | qa_video |
| ぼかしていない顔を2秒貼る | faces（needs-human） | qa_video |
| ぼかした顔を2秒貼る | どれも落ちない（検出はされ、ぼかし済みと判定されること） | qa_video |
| 2秒を真っ黒にする | black | qa_video |
| 2秒を止める | frozen | qa_video |
| （動画ではなく1コマ）強い模様の隣の一色の地 | 透かしの守り（平らな地を測らない）を外すと 0.47 以上に化け、守りがあれば化けないこと | qa_video |

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
import copy
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
    for mod, pip in (("numpy", "numpy"), ("PIL", "Pillow")):
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


def make_source(path: Path):
    """make_assets.py と同じ作り（testsrc2・220Hz）を、配信と同じ 720x1280 で。"""
    sh(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y",
        "-f", "lavfi", "-i", f"testsrc2=size=720x1280:rate={FPS}:duration={SEC + 5}",
        "-f", "lavfi", "-i", f"sine=frequency=220:sample_rate={SR}:duration={SEC + 5}",
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
# 元素材のコマ（out は含まない）。合わせて 315 コマ。
# 1行目の字幕が消える 57 コマ目から 2行目の 135 コマ目までは字幕が無い（2.6秒）。黒・止めるはここに入れる
CUTS = [(10, 115), (125, 230), (240, 345)]
GAP = (60, 120)    # 黒くする・止めるコマ [60, 120) = 2.0秒


def build_edit(box: Path, name: str, *, voices: dict[int, Path], style: Path, bgm: Path | None,
               bgm_db: float = 0.0, captions: bool = True, title: bool = True) -> Path:
    edit = {
        "version": 1, "id": f"qa-{name}", "style": style.name,
        "sources": {"s": {"path": str(box / "source.mp4")}},
        "cuts": [{"src": "s", "in": a, "out": b} for a, b in CUTS],
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
    "black": ("qa_video", "black", "fail"),
    "frozen": ("qa_video", "frozen", "fail"),
}


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
    from common import PASS, video_md5

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
            "bgm_loud": dict(voices=voices, style=st, bgm=bgm, bgm_db=8.0),
            "sync_late": dict(voices={**voices, 1: late}, style=st, bgm=bgm),
            "safe_low": dict(voices=voices, style=style_copy(box, "low", caption__center_y=1300), bgm=bgm),
            "no_bgm": dict(voices=voices, style=st, bgm=None),
            "clipped": dict(voices={**voices, 0: clipped}, style=st, bgm=bgm),
            "source_loud": dict(voices=voices, style=style_copy(box, "src", audio__source_db=0), bgm=bgm),
        }
        # 字なしの書き出し（plate）は、字の置き場を画素の差で見る足（safe_area の2つ目の測り）に使う
        want_jobs = [j for j in jobs if j in names or (j == "plate" and "safe_low" in names)]
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
            pl = plate if name in ("clean", "safe_low") else None
            t0 = time.monotonic()
            ctx = C.make_ctx(mp4, work, plate=pl, crops=box / f"{name}.qa")
            vkey = (video_md5(mp4), overlay_key(ctx.plan), str(pl))
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
                expect = want if cid == target else PASS
                if s != expect:
                    wrong.append(f"{cid}: {s}（欲しいのは {expect}）")
            if wrong:
                bad.append((name, wrong))
            failed = [cid for cid, s in got.items() if s != PASS]
            rows.append(("○" if not wrong else "✕", name, target or "（なし）", ", ".join(failed) or "（なし）",
                         round(time.monotonic() - t0, 1), "絵は clean と同じ" if reuse else ""))
            if keep:
                (box / f"{name}.qa.json").write_text(json.dumps(rep, ensure_ascii=False, indent=1, default=str))

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
        ]
        if plate is not None:
            floor.append(("safe_area が字なしと引いたコマ",
                          cl["safe_area"]["measured"].get("plate", {}).get("frames", 0), N // 7))
        for what, got_n, need_n in floor:
            if got_n < need_n:
                bad.append(("clean", [f"{what} が {got_n}（{need_n} 以上のはず）"]))
        extra = []
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
        print(f"○ {len(names)}通り、思ったとおり（clean は12本とも pass、壊した版は壊したところだけが落ちる）")
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
