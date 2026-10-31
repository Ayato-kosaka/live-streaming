"""置いてある文字起こしに、曲の区間の伏せ（#969）を後からかける。

    python3 python/stream_mask_music.py            # 書き換える
    python3 python/stream_mask_music.py --dry-run  # 数だけ出す

これから取るぶんは `python/stream_transcripts.py` が取ったその場で伏せる。これは
伏せる前に置いてしまった `streams/YYYY/MM/*.transcript.txt` のための入口。
何度かけても同じものになるので、2回目は「書き換えた 0本」になる。

一覧（manifest.tsv）の note にも、取ったときと同じ形で「曲の区間 N行を伏せた」を足す。
chars は触らない（伏せる前の字数のまま。`stream_transcripts.py` の write_one と同じ意味）。
**ログに字幕の中身を出さない**（歌詞を伏せるための道具が歌詞をログに出しては意味が無い）。
出すのは stem と数だけ。
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import stream_text as st  # noqa: E402

STREAMS = st.ROOT / "streams"
MANIFEST = STREAMS / "manifest.tsv"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    a = ap.parse_args()

    man = st.read_manifest(MANIFEST)
    by_stem = {r.get("stem"): r for r in man.values()}
    files = sorted(STREAMS.glob("*/*/*.transcript.txt"))
    changed, total, per = 0, 0, []
    for p in files:
        old = p.read_text(encoding="utf-8")
        new, n = st.mask_transcript(old)
        total += n
        per.append((n, p.name.removesuffix(".transcript.txt")))
        if new != old:
            changed += 1
            if not a.dry_run:
                p.write_text(new, encoding="utf-8")
        stem = f"{p.parent.parent.name}/{p.parent.name}/{p.name.removesuffix('.transcript.txt')}"
        row = by_stem.get(stem)
        if row is None:
            print(f"一覧に無い: {stem}")
            continue
        row["note"] = st.music_note(row.get("note", ""), n)
    if not a.dry_run:
        st.write_manifest(MANIFEST, man)

    hit = [x for x in per if x[0]]
    print(f"字幕 {len(files)}本のうち 曲の区間のある回 {len(hit)}本・{total}行 / 書き換えた {changed}本"
          + ("（dry-run）" if a.dry_run else ""))
    for n, stem in sorted(hit, reverse=True)[:5]:
        print(f"  {n:4d}行  {stem}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
