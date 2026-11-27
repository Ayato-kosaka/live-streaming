"""**画質の検査（check.py の `sharpness`。sharp.py）が、落ちるときに落ちるか。**

    python3 tools/shorts/qa/sharp_selftest.py [--keep DIR]

あやと（#1450、2026-11-26）「特にフックは画質悪いの使わないのを絶対ルールにしてるはず（飲んでるシーンとかは除く）」。
フック（題の札の間）に粗い配信の画があれば落ち、出来事そのものの画（`event`）は落とさず、本編の粗い画は同じ場面の
撮影の動画が台帳にあるときだけ人に回すことを、合成の素材と時間割だけで当てる（書き出しは通さない。
`cuts_selftest.py` と同じ作り）。

| 足 | 並べ方（0〜2秒がフック、2〜4秒が本編） | sharpness |
| --- | --- | --- |
| clean | フックは撮影の動画（細かい粒のある 1080x1920）、本編は粗い配信の画 | pass |
| hook_coarse | フックに粗い配信の画（720x1280 をぼかして広げたもの） | **fail** |
| hook_event | 同じ並びで、カットに `event`（飲む瞬間） | pass（落とさない。窓の中にもっと鮮明な秒は無い） |
| hook_sharp_stream | フックに配信の画だが、鮮明（線より上） | pass（種類ではなく鮮明さで決める） |
| body_near_footage | clean の本編の配信の時刻の 60秒あとに撮った、まだ使っていない撮影の動画が台帳にある | **needs-human** |
| body_used_footage | 同じ台帳で、その撮影の動画をフックで使っている | pass（見たうえで選んでいる） |
| map_hook | フックに配信でも撮影でもない平らな絵（地図の動画など） | pass（判定しない） |

終了コード 0=思ったとおり / 1=思ったとおりでない / 2=数えるものが無い（ffmpeg）。
"""
from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import sharp  # noqa: E402
from common import Ctx  # noqa: E402

FPS, W, H = 30, 1080, 1920


def ff(*args: str) -> None:
    subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", *args], check=True)


def assets(d: Path) -> dict:
    """細かい粒のある鮮明な素材・ぼかした配信の大きさの素材・平らな絵の素材（どれも 2秒）と、それをつないだ字なしの版。"""
    enc = ["-c:v", "libx264", "-preset", "ultrafast", "-crf", "20", "-pix_fmt", "yuv420p", "-r", str(FPS)]
    p = {k: d / f"{k}.mp4" for k in ("sharp", "coarse", "flat")}
    ff("-f", "lavfi", "-i", f"testsrc2=size={W}x{H}:rate={FPS}:duration=2", "-vf", "noise=alls=30", *enc, str(p["sharp"]))
    ff("-f", "lavfi", "-i", f"testsrc2=size=720x1280:rate={FPS}:duration=2", "-vf",
       f"gblur=sigma=2.5,scale={W}:{H}:flags=bicubic", *enc, str(p["coarse"]))
    ff("-f", "lavfi", "-i", f"color=c=0x3060a0:size={W}x{H}:rate={FPS}:duration=2", "-vf",
       "drawbox=x=300:y=700:w=480:h=520:color=0xe0d0a0:t=fill", *enc, str(p["flat"]))
    # 配信の窓の台帳（stream_of が読む）。sharp を配信として使う足のために、別の名前の写しも置く
    (d / "sharp_stream.mp4").symlink_to(p["sharp"].name)
    (d / "index.json").write_text(json.dumps({"video": "SYNTHvid000", "clips": [
        {"file": "coarse.mp4", "video": "SYNTHvid000", "start": 600.0},
        {"file": "sharp_stream.mp4", "video": "SYNTHvid000", "start": 900.0}]}))
    p["sharp_stream"] = d / "sharp_stream.mp4"
    return p


def plate(d: Path, name: str, first: Path, second: Path) -> Path:
    out = d / f"plate_{name}.mp4"
    ff("-i", str(first), "-i", str(second), "-filter_complex",
       "[0:v]trim=0:2,setpts=PTS-STARTPTS[a];[1:v]trim=0:2,setpts=PTS-STARTPTS[b];[a][b]concat=n=2:v=1[v]",
       "-map", "[v]", "-c:v", "libx264", "-preset", "ultrafast", "-crf", "20", "-pix_fmt", "yuv420p", str(out))
    return out


def plan_of(first: tuple[Path, dict], second: tuple[Path, dict]) -> dict:
    cuts = []
    for i, (path, extra) in enumerate((first, second)):
        cuts.append({"path": str(path), "in": 0, "out": 60, "at": 60 * i, "frames": 60, "row": i, **extra})
    return {"fps": FPS, "size": [W, H], "cuts": cuts, "titles": [{"from": 0, "to": 60, "text": "題"}]}


def run(keep: Path | None) -> int:
    if not shutil.which("ffmpeg"):
        print("✕ ffmpeg が無い（数えるものが無い）")
        return 2
    tmp = Path(tempfile.mkdtemp(prefix="sharp_selftest_"))
    d = keep or tmp
    d.mkdir(parents=True, exist_ok=True)
    p = assets(d)
    ledger = d / "footage_index.json"
    ledger.write_text(json.dumps({"items": []}))
    near = d / "footage_near.json"
    near.write_text(json.dumps({"items": [{"id": "ffsynth002", "desc": "合成の撮影の動画（この回でまだ使っていない）",
                                            "stream": {"video": "SYNTHvid000", "at": "0:11:01", "at_s": 661}}]}))
    foot = (p["sharp"], {"footage": "ffsynth001"})
    legs = [
        ("clean", foot, (p["coarse"], {}), ledger, "pass"),
        ("hook_coarse", (p["coarse"], {}), (p["coarse"], {}), ledger, "fail"),
        ("hook_event", (p["coarse"], {"event": "飲む瞬間の本人"}), (p["coarse"], {}), ledger, "pass"),
        ("hook_sharp_stream", (p["sharp_stream"], {}), (p["coarse"], {}), ledger, "pass"),
        ("body_near_footage", foot, (p["coarse"], {}), near, "needs-human"),
        ("body_used_footage", (p["sharp"], {"footage": "ffsynth002"}), (p["coarse"], {}), near, "pass"),
        ("map_hook", (p["flat"], {}), (p["coarse"], {}), ledger, "pass"),
    ]
    bad = 0
    for name, a, b, led, want in legs:
        sharp.FOOTAGE_INDEX = led
        pl = plate(d, name, a[0], b[0])
        ctx = Ctx(mp4=pl, work=None, style={}, out_dir=d / f"{name}.qa", plate=pl, plan=plan_of(a, b),
                  probe={}, W=W, H=H, fps=FPS, nframes=120, notes=[])
        r = sharp.check(ctx)
        ok = r["status"] == want
        bad += not ok
        vals = [(c["kind"], c["sharp"]) for c in r["measured"]["cuts"]]
        print(f"{'○' if ok else '✕'} {name}: {r['status']}（思ったのは {want}） {vals}")
        if not ok:
            for pr in r["problems"]:
                print(f"    {pr}")
    if keep is None:
        shutil.rmtree(tmp, ignore_errors=True)
    print("○ 思ったとおり" if not bad else f"✕ {bad} 本が思ったとおりでない")
    return 1 if bad else 0


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--keep", type=Path)
    sys.exit(run(ap.parse_args().keep))
