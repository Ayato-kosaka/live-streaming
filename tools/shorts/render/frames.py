#!/usr/bin/env python3
"""書き出した mp4 から、指定したコマを jpg に抜く（見た目の確認用）。

    python3 frames.py out.mp4 OUTDIR 5 120 300 ...
"""
import subprocess
import sys
from pathlib import Path


def main():
    src, outdir, *frames = sys.argv[1:]
    Path(outdir).mkdir(parents=True, exist_ok=True)
    for f in frames:
        out = Path(outdir) / f"{Path(src).stem}_f{int(f):04d}.jpg"
        subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", src,
                        "-vf", f"select=eq(n\\,{int(f)})", "-frames:v", "1", "-q:v", "3", str(out)],
                       check=True)
        print(out)


if __name__ == "__main__":
    main()
