"""検査用の合成素材を作る（verify.py のカット照合は、この素材の焼き込みを読む）。

    python3 make_assets.py OUTDIR [source] [source_h] [bgm]


- source.mp4: 1080x1920 / 30fps / 60秒。コマごとに「フレーム番号」を
  12ビットの白黒の箱（y=150）と大きな数字で焼き込む。書き出した結果から
  元のどのコマかを機械で読み戻すため。
- bgm.wav: 和音のアルペジオを 45 秒。著作権の無い合成音。
- ナレーションは render.py が open_jtalk で行ごとに作る。

verify.py の BARCODE と、ここの箱の置き場は同じ数でないといけない。
"""
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
ASSETS = Path(sys.argv[1]) if len(sys.argv) > 1 else HERE / "assets"
FONT = HERE / "fonts" / "MPLUSRounded1c-Black.ttf"

BITS = 12
BOX = 70
STEP = 80
X0 = 60
Y0 = 150


def source(name="source.mp4", size="1080x1920", label="SRC", box=BOX, step=STEP, x0=X0, y0=Y0, ty=1380):
    vf = [
        f"drawtext=fontfile='{FONT}':text='{label} %{{frame_num}}':fontsize=150:"
        f"fontcolor=white:borderw=8:bordercolor=black:x=(w-tw)/2:y={ty}"
    ]
    for k in range(BITS):
        x = x0 + k * step
        bit = f"mod(trunc(n/pow(2\\,{k}))\\,2)"
        vf.append(f"drawbox=x={x}:y={y0}:w={box}:h={box}:color=white:t=fill:enable='eq({bit}\\,1)'")
        vf.append(f"drawbox=x={x}:y={y0}:w={box}:h={box}:color=black:t=fill:enable='eq({bit}\\,0)'")
    cmd = [
        "ffmpeg", "-hide_banner", "-loglevel", "error", "-y",
        "-f", "lavfi", "-i", f"testsrc2=size={size}:rate=30:duration=60",
        "-f", "lavfi", "-i", "sine=frequency=220:sample_rate=48000:duration=60",
        "-vf", ",".join(vf),
        "-c:v", "libx264", "-preset", "fast", "-crf", "18", "-g", "30", "-pix_fmt", "yuv420p",
        "-c:a", "aac", "-b:a", "128k", "-shortest", str(ASSETS / name),
    ]
    subprocess.run(cmd, check=True)


def bgm():
    # C - Am - F - G を 8 分音符のアルペジオで。2 秒で1和音、45 秒。
    chords = [[261.63, 329.63, 392.00], [220.00, 261.63, 329.63],
              [174.61, 220.00, 261.63], [196.00, 246.94, 293.66]]
    # aevalsrc の式: 0.25 秒ごとに和音の音を順に鳴らし、各音は指数減衰
    parts = []
    for ci, ch in enumerate(chords):
        for ni in range(8):
            f = ch[ni % 3] * (2 if ni >= 4 else 1)
            t0 = ci * 2 + ni * 0.25
            parts.append((t0, f))
    # 8 秒周期で繰り返す
    terms = []
    for t0, f in parts:
        tt = f"(mod(t,8)-{t0})"
        terms.append(f"gte({tt},0)*exp(-6*{tt})*sin(2*PI*{f}*t)")
    bass = "0.35*sin(2*PI*(if(lt(mod(t,8),2),65.41,if(lt(mod(t,8),4),55,if(lt(mod(t,8),6),43.65,49))))*t)"
    expr = f"0.22*({'+'.join(terms)})+{bass}*0.5"
    cmd = ["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi",
           "-i", f"aevalsrc='{expr}':s=48000:d=45", "-ac", "2",
           "-af", "loudnorm=I=-16:TP=-1.5:LRA=11", "-ar", "48000", str(ASSETS / "bgm.wav")]
    subprocess.run(cmd, check=True)


if __name__ == "__main__":
    ASSETS.mkdir(parents=True, exist_ok=True)
    what = sys.argv[2:] or ["source", "source_h", "bgm"]
    if "source" in what:
        source()
    if "source_h" in what:
        # 横長（配信アーカイブと同じ 16:9）。バーコードは中央に小さく置く
        # （9:16 に切り抜いても全部写るように）。
        source("source_h.mp4", "1920x1080", "H", box=40, step=46, x0=960 - 6 * 46, y0=100, ty=700)
    if "bgm" in what:
        bgm()
