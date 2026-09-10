#!/usr/bin/env python3
"""北欧の見どころの写真を、URL ごとに落としておく。

    python3 tools/sprites/wikiphotos.py

**ブラウザからは upload.wikimedia.org に出られないが、curl では取れる**
（`CLAUDE.md`）。落としてあれば `tools/sprites/wantshot.mjs` が
**1件ずつ本物を**返す。落とさずに撮ると、見どころが何件並んでも全部
おなじ絵（`og.png`）で写って、並びの良し悪しが分からない。

**まとめて叩かない。** 並列で146本取りにいったら、112本が Wikimedia の
エラーページ（HTML）で返ってきた。それをそのまま置くと、絵が壊れた行に
見えて「写真が無い」と読み違える。1本ずつ取って、**画像でなければ捨てる。**
"""
import glob
import hashlib
import json
import os
import subprocess
import time

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
SRC = os.path.join(ROOT, "site", "content", "nordic")
OUT = "/tmp/wiki"
SKIP = {"citymaps.json", "geo.json", "index.json", "map.json"}
UA = "ayato-island-shot/1.0 (https://live-streaming-d3cac.web.app)"


def urls():
    seen = []
    for f in sorted(glob.glob(os.path.join(SRC, "*.json"))):
        if os.path.basename(f) in SKIP:
            continue
        for s in json.load(open(f, encoding="utf-8"))["spots"]:
            u = s.get("img")
            if u and u not in seen:
                seen.append(u)
    return seen


def main():
    os.makedirs(OUT, exist_ok=True)
    got = bad = 0
    for u in urls():
        p = os.path.join(OUT, hashlib.sha1(u.encode()).hexdigest() + ".img")
        if _is_img(p):  # もう取ってある
            got += 1
            continue
        subprocess.run(["curl", "-s", "--retry", "3", "--retry-delay", "2",
                        "-A", UA, "-o", p, u], check=False)
        time.sleep(0.4)
        if _is_img(p):
            got += 1
        else:
            # エラーページ（HTML）が返ったもの。**置いておかない**
            if os.path.exists(p):
                os.remove(p)
            bad += 1
            print("取れなかった:", u[:110])
    print(f"{got}枚 / 取れなかった {bad}枚  → {OUT}")


def _is_img(p):
    if not os.path.exists(p) or os.path.getsize(p) < 800:
        return False
    head = open(p, "rb").read(12)
    return head[:3] == b"\xff\xd8\xff" or head[:8] == b"\x89PNG\r\n\x1a\n" or head[:4] == b"RIFF"


if __name__ == "__main__":
    main()
