"""**国の面に添える1〜2行（`python/stream_digest.py`）が、名前と伏せ字を落とし、古くなったら赤くなるか。**

    python3 python/stream_digest_selftest.py

終了コード 0=通った / 1=落ちた / **2=数えるものが無い**（本物の議事録から1本も焼けない。§15）。

## 何を見るか

| 足 | 崩しかた | 正しい動き |
| --- | --- | --- |
| 頭の1文 | 「ひとことで」が長い1文＋2文目 | 1文目だけ |
| 短い1文 | 1文目が40字に届かない | 2文目まで（3文目は足さない） |
| 名前 | 1文目に `@名前` | その文を飛ばして次の文 |
| 伏せ字 | 1文目に〇〇 | その文を飛ばして次の文 |
| 表に無い国 | `- 場所:` が表に無い国 | 焼かない |
| 古い | 焼いたあとに議事録の「ひとことで」を書き換える | `--check` が 1 |
| 本物 | リポジトリの議事録と `site/content/streamDigest.ts` | `--check` が 0（議事録を足して焼き忘れると、ここで赤） |

材料は一時の置き場にこしらえる（リポジトリの焼いたものは書き換えない）。
"""

from __future__ import annotations

import contextlib
import io
import json
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import stream_digest as sd  # noqa: E402

LONG = "ブルガリア2日目、ソフィアの女性市場を見て回り、乳製品専門店で飲むヨーグルトを公園で試した回。"
SECOND = "ヨーグルトスープは別日に持ち越し。"
THIRD = "三つ目の文は足さない。"
SHORT = "バニツァを食べに行った回。"

TABLE = {
    "countries": {
        "bulgaria": {
            "name": "ブルガリア", "heads": ["ブルガリア"], "money": {}, "base": "sofia", "no_city": [],
            "cities": {"sofia": {"name": "ソフィア", "heads": ["ソフィア"], "places": {}, "trips": {}}},
        }
    }
}

HEAD = "video_id\tstart_jst\tstem\tcaption\tchars\tchat_count\tfetched_at\ttries\tnote\n"


def note(place: str, gist: str) -> str:
    return (f"# 2026-11-13 21:59 題\n- URL: https://www.youtube.com/watch?v=x / 長さ 1:00:00\n- 場所: {place}\n"
            f"- チャット 1件\n- 投げ銭 なし\n\n## ひとことで\n{gist}\n\n## 流れ\n### [0:00:00] 頭\nなし\n")


CASES = {
    "vLONG": ("ブルガリア・ソフィア（市場）", LONG + SECOND, LONG),
    "vSHORT": ("ブルガリア・ソフィア", SHORT + SECOND + THIRD, SHORT + SECOND),
    "vNAME": ("ブルガリア・ソフィア", "@まこも-z3i が来た回。" + LONG, LONG),
    "vMASK": ("ブルガリア", "〇〇に住む人と話した回。" + LONG, LONG),
    "vOTHER": ("トルコ・イスタンブール", LONG, None),
}


def build(d: Path) -> tuple[Path, Path, Path]:
    streams = d / "streams"
    (streams / "2026/11").mkdir(parents=True)
    lines = []
    for i, (vid, (place, gist, _)) in enumerate(CASES.items()):
        stem = f"2026-11-1{i}_2200_{vid}"
        lines.append(f"{vid}\t2026-11-1{i} 22:00\t2026/11/{stem}\tok\t100\t1\t2026-11-19\t1\t\n")
        (streams / f"2026/11/{stem}.md").write_text(note(place, gist), encoding="utf-8")
    (streams / "manifest.tsv").write_text(HEAD + "".join(lines), encoding="utf-8")
    table = d / "cities.json"
    table.write_text(json.dumps(TABLE, ensure_ascii=False), encoding="utf-8")
    return streams, table, d / "streamDigest.ts"


def run(**kw) -> int:
    with contextlib.redirect_stdout(io.StringIO()):
        return sd.bake(**kw)


def main() -> int:
    fails: list[str] = []

    def ok(label: str, cond: bool) -> None:
        print(f"  {'OK' if cond else 'NG'}  {label}")
        if not cond:
            fails.append(label)

    with tempfile.TemporaryDirectory() as tmp:
        d = Path(tmp)
        streams, table, out = build(d)
        ok("焼ける（終了 0）", run(streams=streams, table_path=table, out=out) == 0)
        got = {v: t for _, v, t in sd.digests(streams, sd.gf.load_table(table))}
        for vid, (_, _, want) in CASES.items():
            if want is None:
                ok(f"{vid}: 表に無い国は焼かない", vid not in got)
            else:
                ok(f"{vid}: {want[:16]}…", got.get(vid) == want)
        text = out.read_text(encoding="utf-8")
        ok("面の字に @ も〇〇も無い", "@" not in text and "〇〇" not in text)
        ok("焼いた直後は --check が 0", run(streams=streams, table_path=table, out=out, check=True) == 0)
        md = next((streams / "2026/11").glob("*vLONG.md"))
        md.write_text(note("ブルガリア・ソフィア", "書き換えた回。" + LONG), encoding="utf-8")
        ok("議事録を書き換えると --check が 1", run(streams=streams, table_path=table, out=out, check=True) == 1)
        empty = d / "empty"
        empty.mkdir()
        (empty / "manifest.tsv").write_text(HEAD, encoding="utf-8")
        ok("議事録が無ければ 2", run(streams=empty, table_path=table, out=d / "x.ts") == 2)

    # 本物: 議事録を足したのに焼き忘れると、ここで赤くなる
    real = run(check=True)
    if real == 2:
        print("  NG  本物の議事録から1本も焼けない（数えるものが無い）")
        return 2
    ok("本物: site/content/streamDigest.ts が議事録と同じ（違えば python3 python/stream_digest.py）", real == 0)

    print(f"\n{'落ちた: ' + str(len(fails)) if fails else 'ぜんぶ通った'}")
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())
