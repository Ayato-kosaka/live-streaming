"""**国の面（`/travel/<国>`）の「この国であったこと」に添える、配信1本の1〜2行を、議事録から焼く。**

    python3 python/stream_digest.py           # 焼く（site/content/streamDigest.ts）
    python3 python/stream_digest.py --check   # 焼かずに、焼いてあるものが今の議事録と同じかだけ（違えば 1）

終了コード 0=焼けた・同じ / 1=焼いたものが古い / **2=焼くものが1本も無い**（`docs/island-standards.md` §15）。

`python3 python/stream_notes.py index` が月の目次を書いたあとに、これも呼ぶ（議事録が増えた日に、
国の面も追いつく）。見張りは `python/stream_digest_selftest.py`（焼いてあるものが古いと赤）。

## なぜ要るか（#1262）

ブルガリアの国の面は、「この国であったこと」に配信のカードを並べるだけで、本文が166字しか無かった。
イギリスの面は同じ畳みに「ロンドンが奇跡的に晴れた日」のような一言（人が書いた見どころ）を持っている。
歩いている最中の国は見どころがまだ書かれないので、**議事録の「ひとことで」の頭から**1〜2行を借りる。
手で書くと、議事録を直した日から面が古くなる。

## どの回を焼くか

議事録の `- 場所:` の頭が、寄せる表（`python/data/guide/cities.json`）の国に寄る回だけ。
表に在る国＝街のガイドを作っている国で、「この国であったこと」に配信を並べるのもその国（歩いている最中の国）。
全部の回を焼くと、使わない字を何百本も抱える。

## 1〜2行の選びかた

- 「ひとことで」を「。」で切って、頭の1文。40字に届かなければ2文目まで（それ以上は足さない）
- **`@名前` と伏せ字（〇〇）の入った文は使わない。** 議事録は視聴者さんの名前を書いてよいが、国の面は
  その人を知らない人が読む。素性を伏せた跡（〇〇）も面に出さない
- 使える文が無い回は焼かない（カードだけが出る）
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import guide_facts as gf  # noqa: E402  議事録の場所の行の読みかたと、国への寄せかた
import stream_notes as sn  # noqa: E402  manifest と「ひとことで」の読みかた

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "site/content/streamDigest.ts"

SHORT = 40          # 1文目がこれに届かなければ、2文目まで
MAX_SENTENCES = 2
NG = re.compile(r"[@＠]|〇〇|○○")


def pick(gist: str) -> str:
    """「ひとことで」から、面に出す1〜2文。使える文が無ければ空"""
    sents = [s.strip() + "。" for s in gist.split("。") if s.strip()]
    ok = [s for s in sents if not NG.search(s)]
    out: list[str] = []
    for s in ok:
        out.append(s)
        if len("".join(out)) >= SHORT or len(out) >= MAX_SENTENCES:
            break
    return "".join(out)


def digests(streams: Path, table: dict) -> list[tuple[str, str, str]]:
    """（開始の日時, 動画の id, 1〜2行）を古い順に。表の国に寄る回だけ"""
    rows = []
    for r in sn.read_manifest(streams):
        md = sn.md_path(streams, r)
        vid = (r.get("video_id") or "").strip()
        if not vid or not md.exists():
            continue
        notes = gf.read_notes(md)
        country, _, _ = gf.resolve_place(notes["place"], table)
        if not country:
            continue
        line = pick(sn.section(notes["text"], "## ひとことで"))
        if line:
            rows.append((r.get("start_jst") or "", vid, line))
    rows.sort()
    return rows


def render(rows: list[tuple[str, str, str]]) -> str:
    # 1本1塊で `"videoId": "…"` と書く。押しても見られない配信の見張り（`dead_stream_watch.py`）が
    # この形で配信を拾うので、id を鍵にした表にすると見張りから見えなくなる
    body = ",\n".join(
        f"  {{ \"videoId\": {json.dumps(v)}, \"date\": {json.dumps(d[:10])}, \"text\": {json.dumps(t, ensure_ascii=False)} }}"
        for d, v, t in rows
    )
    return (
        "/**\n"
        " * 配信1本の1〜2行。国の面の「この国であったこと」の畳みに添える。\n"
        " * python/stream_digest.py が議事録（streams/YYYY/MM/<stem>.md）の「ひとことで」から焼く。\n"
        " * 手で編集せず、議事録を直して焼き直すこと。\n"
        " */\n"
        "const ROWS: { videoId: string; date: string; text: string }[] = [\n"
        f"{body}\n"
        "];\n\n"
        "/** 動画の id → 1〜2行 */\n"
        "export const STREAM_DIGEST: Record<string, string> = Object.fromEntries(ROWS.map((r) => [r.videoId, r.text]));\n"
    )


def bake(streams: Path = sn.STREAMS, table_path: Path = gf.TABLE, out: Path = OUT, check: bool = False) -> int:
    rows = digests(streams, gf.load_table(table_path))
    if not rows:
        print("::error::焼くものが1本も無い（議事録が読めない・表の国に寄る回が無い）")
        return 2
    text = render(rows)
    now = out.read_text(encoding="utf-8") if out.exists() else ""
    if check:
        if now != text:
            print(f"::error::{out.relative_to(ROOT) if out.is_relative_to(ROOT) else out} が議事録より古い。"
                  "python3 python/stream_digest.py で焼き直す")
            return 1
        print(f"同じ（{len(rows)}本）")
        return 0
    if now != text:
        out.write_text(text, encoding="utf-8")
        print(f"焼いた: {out.name}（{len(rows)}本）")
    else:
        print(f"変わらない: {out.name}（{len(rows)}本）")
    return 0


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="国の面に添える、配信1本の1〜2行を議事録から焼く")
    ap.add_argument("--check", action="store_true", help="焼かずに、焼いてあるものが今の議事録と同じかだけ")
    a = ap.parse_args(argv)
    return bake(check=a.check)


if __name__ == "__main__":
    sys.exit(main())
