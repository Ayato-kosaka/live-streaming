"""描いた絵・フリー素材の絵を、書き出しが1カットとして扱える「絵の窓」にする（帳面 F-014、4回目 #1187）。

    python3 tools/shorts/render/art_clips.py --video artPcwP2v04 --kind generated --out <置き場>/art a.png b.png …
    # → <置き場>/art/01_a.mp4 … と index.json。指示書は --clips <置き場>/art/index.json で、ほかの配信の窓と並べて引く
    #    （overrides の cuts[].t に「artPcwP2v04 0:01:00.0」のように書く。何枚目が何秒からかは最後に出す）

あやと（#1187、2026-11-14）:「あまりにも映像がセリフと一致してないので、フリー素材を使うか、チャットGPTで画像生成する
なりで、わかりやすくして欲しい」。配信に写っていない物（壊れた画面・業者のおじさん・日本に返された荷物）を、本人の顔で
代えていた。絵を入れる口が書き出しに無かった。

## なぜ mp4 にするのか（書き出しを触らない）

書き出し（`render.py`）と指示書の組み立て（`build_edit.py`）は、素材を「取り込みの窓（30fps の mp4）と、その台帳
（同じ置き場の `index.json`）」として読む。絵を同じ形にすれば、どちらも1字も変えずに絵を1カットとして扱える
（寄せ・字幕・顔よけ・検査が配信の窓と同じ道を通る）。絵1枚ごとに、同じ絵を `--sec` 秒並べた mp4（無音の音つき。
音の束が元の音を読みに来ても落ちない）を作る。

**動きは焼き込まない。** 寄せ（時間割の `zoom`）は書き出しが掛ける。焼き込むと、止め絵の検査（`qa/still.py`）が
画素で「動いている」と読んでしまい、止め絵と見分けられない（still.py の「弱いところ」）。

## 台帳の印（`art`）

窓ごとに `art`（`generated`＝画像生成・`free`＝フリー素材）と、元の絵の名前（`art_image`）と sha256 を書く。
止め絵の検査は、この印の付いた窓だけを「絵のカット」として扱い、**時間割の寄せで動いているときだけ**通す
（動かない絵のカットは、今までどおり止め絵で落ちる）。印の無い止め絵（配信の1コマを止めたもの）は今までどおり落ちる。
Actions では素材が sha256 の名前に並び替わるので、印は `remote.py` が指示書の素材の欄に写して運ぶ（`stream_info`）。

## 絵の形

縦長の絵（ChatGPT の縦は 1024x1536）をそのまま使う。書き出しは配信の窓と同じく、下の透かしの帯ぶん（7%）を切ってから
cover で 9:16 に収めるので、左右が 1割ずつ・下が 7% 見えなくなる。大事な物は真ん中に置いてもらう。
透明な所は白で埋める（mp4 に透明は無い。黒になると絵の地と合わない）。
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import subprocess
import sys
import tempfile
from pathlib import Path

FPS = 30
KINDS = ("generated", "free")      # 画像生成 / フリー素材
GAP = 60                           # 窓どうしを、配信の時刻で何秒離して並べるか（同じ配信の 10秒以内を「同じ場面」と読む検査がある）
VIDEO = re.compile(r"^[A-Za-z0-9_-]{11}$")   # 指示書の秒に付ける回の名前と同じ形（build_edit が読む）


def hms(t: float) -> str:
    h, r = divmod(int(round(t * 10)), 36000)
    m, r = divmod(r, 600)
    return f"{h}:{m:02d}:{r / 10:04.1f}"


def flatten(src: Path, dst: Path) -> tuple[int, int]:
    """透明を白で埋め、幅と高さを偶数にした RGB の PNG（yuv420p は奇数の辺を持てない）。"""
    from PIL import Image
    im = Image.open(src)
    im.load()
    if im.mode in ("RGBA", "LA", "P"):
        im = im.convert("RGBA")
        bg = Image.new("RGBA", im.size, (255, 255, 255, 255))
        bg.alpha_composite(im)
        im = bg
    im = im.convert("RGB")
    w, h = im.width - im.width % 2, im.height - im.height % 2
    im = im.crop((0, 0, w, h))
    im.save(dst)
    return w, h


def encode(png: Path, out: Path, sec: float) -> None:
    """同じ絵を sec 秒・30fps。色は配信の窓と同じ bt709 の tv の幅で書く（書き出しの color_matrix がそう読む）。"""
    cmd = ["ffmpeg", "-hide_banner", "-loglevel", "error", "-y",
           "-loop", "1", "-framerate", str(FPS), "-i", str(png),
           "-f", "lavfi", "-i", "anullsrc=r=48000:cl=stereo",
           "-t", f"{sec:.3f}", "-r", str(FPS),
           "-vf", "scale=out_color_matrix=bt709:out_range=tv,format=yuv420p",
           "-c:v", "libx264", "-preset", "medium", "-tune", "stillimage", "-crf", "16",
           "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709", "-color_range", "tv",
           "-c:a", "aac", "-b:a", "96k", "-shortest", "-movflags", "+faststart", str(out)]
    subprocess.run(cmd, check=True)


def frames_of(mp4: Path) -> int:
    r = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-count_packets",
                        "-show_entries", "stream=nb_read_packets", "-of", "csv=p=0", str(mp4)],
                       capture_output=True, text=True, check=True)
    return int(r.stdout.strip())


def build(images: list[Path], out: Path, video: str, kind: str, sec: float, notes: dict[str, str]) -> dict:
    out.mkdir(parents=True, exist_ok=True)
    clips = []
    with tempfile.TemporaryDirectory() as td:
        for n, src in enumerate(images, 1):
            flat = Path(td) / f"{n:02d}.png"
            w, h = flatten(src, flat)
            name = f"{n:02d}_{src.stem}.mp4"
            encode(flat, out / name, sec)
            start = (n - 1) * GAP
            fr = frames_of(out / name)
            clips.append({"n": n, "range": f"{hms(start)}-{hms(start + sec)}", "start": float(start),
                          "end": float(start + fr / FPS), "file": name, "ok": True, "fps": float(FPS), "frames": fr,
                          "width": w, "height": h, "art": kind, "art_image": src.name,
                          "art_sha256": hashlib.sha256(src.read_bytes()).hexdigest(),
                          **({"art_note": notes[src.stem]} if src.stem in notes else {})})
    idx = {"video": video, "art": True,
           "_note": "art_clips.py が作った絵の窓（配信ではない）。start / end は窓を引き分けるための仮の秒",
           "clips": clips}
    (out / "index.json").write_text(json.dumps(idx, ensure_ascii=False, indent=1), encoding="utf-8")
    return idx


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("images", nargs="+", type=Path)
    ap.add_argument("--out", type=Path, required=True, help="絵の窓の置き場（リポジトリの外）")
    ap.add_argument("--video", required=True, help="指示書の秒に付ける名前（英数字と _- の11字。配信の id と重ねない）")
    ap.add_argument("--kind", choices=KINDS, required=True, help="generated＝画像生成 / free＝フリー素材")
    ap.add_argument("--sec", type=float, default=8.0, help="1枚の窓の長さ（カットは3秒未満なので、寄せの余りを見て 8秒）")
    ap.add_argument("--notes", type=Path, help="絵の名前（拡張子なし）→ 何を描いた絵か、の JSON（台帳に写す）")
    a = ap.parse_args(argv)
    if not VIDEO.match(a.video):
        sys.exit(f"--video は英数字と _- の11字（指示書の「<名前> 0:01:00.0」の形で読むため）: {a.video!r}")
    missing = [str(p) for p in a.images if not p.is_file()]
    if missing:
        sys.exit(f"絵が無い: {missing}")
    notes = json.loads(a.notes.read_text(encoding="utf-8")) if a.notes else {}
    idx = build(a.images, a.out, a.video, a.kind, a.sec, notes)
    for c in idx["clips"]:
        print(f"{a.video} {hms(c['start'])}  ← {c['art_image']}（{c['frames']}コマ・{c['width']}x{c['height']}）")
    return 0


if __name__ == "__main__":
    sys.exit(main())
