#!/usr/bin/env python3
"""**何も知らない視聴者役の返事から、✕ を数える。** 「ストレス1以上の行が無くなるまで直す」を、目で数えずに機械で数える。

    python3 tools/shorts/script/critic_viewer.py <視聴者役の返事.txt> <script.txt>          # ✕ と △ の表
    python3 tools/shorts/script/critic_viewer.py <視聴者役の返事.txt> <script.txt> --json   # 1行の JSON（plan.md の記録用）
    python3 tools/shorts/script/critic_viewer.py <視聴者役の返事.txt> <script.txt> --keep   # 通ったら、原稿の隣に viewer*.txt で置く

終了コード **0=通る（✕ が無い） / 1=落ちる / 2=返事の形が違う・行の数が原稿と合わない**。

返事の形は頼む文（`references/viewer_critic_prompt.md`「返す形」）の通り、1行に1つ
`行番号|ここまでの話|訳|○△×|いま頭にある問い|ストレス|次|なぜ|直し`、最後に `全体|…`。

帳面 F-070（**初見で意味が分かる × 続きが気になる、の両方を全部の行で**。絶対の決まり）の、字では決まらない中身をここで数える。

| ✕ | △ |
| --- | --- |
| ストレス 1 以上の行（初見で意味が分からない・置いていかれる） | 分かったが △（一拍考えた）でストレス 0 の行 |
| 分かったが × の行 | 「全体」の行で、いちばん離れそうと挙がった行 |
| 題の直後（2行目）から締めの2行前までに、「次」が 0 の行が2行続く（続きが気にならない） | |

## 本編集の1枚の関所（`brief.py` の `viewer_pass`。2026-11-27、帳面 F-100）

帳面 F-100（初見の人が耳で一度聞いて、1秒もストレスなく分かる一言一句）は4回言われ、当てる場所は人の目と頼む文だけだった。
視聴者役の返事は作業の置き場に残り、本編集に進むときに誰も数えていなかった。いまは、通った返事を `--keep` で原稿の隣
（`script.txt` なら `viewer.txt`・`script_A.txt` なら `viewer_A.txt`）に、原稿の指紋（読み上げる行の sha1 の頭16桁）を頭に付けて置く。
`brief.py edit` は `gate` を通してから1枚を作る: 返事が無い・指紋が今の原稿と違う（返事のあとで原稿を直した）・形が崩れている・
✕ が1つでも残る、のどれでも作らない。
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import lint as lint_mod  # noqa: E402

UNDERSTOOD = ("○", "△", "×")
KEEP_HEAD = "# 視聴者役の返事（critic_viewer.py --keep）。原稿の指紋 "
ROW = re.compile(r"^\s*(\d+)\s*\|")


def parse(text: str) -> tuple:
    """（行番号 → 欄, 全体の欄, 形の崩れ）。"""
    rows, whole, bad = {}, None, []
    for no, raw in enumerate(text.splitlines(), 1):
        ln = raw.strip().strip("`")
        if ln.startswith("全体|"):
            whole = [x.strip() for x in ln.split("|")]
            continue
        if not ROW.match(ln):
            continue
        f = [x.strip() for x in ln.split("|")]
        if len(f) < 7:
            bad.append(f"{no}行目: 欄が{len(f)}つ（9つのはず）")
            continue
        i = int(f[0])
        if f[3] not in UNDERSTOOD or not f[5].isdigit() or not f[6].isdigit():
            bad.append(f"{no}行目: 分かった（{f[3]}）・ストレス（{f[5]}）・次（{f[6]}）の形が違う")
            continue
        if i in rows:
            bad.append(f"{no}行目: 行 {i} が2回ある")
            continue
        rows[i] = {"got": f[3], "stress": int(f[5]), "next": int(f[6]), "why": f[7] if len(f) > 7 else "",
                   "fix": f[8] if len(f) > 8 else ""}
    return rows, whole, bad


def judge(rows: dict, lines: list, whole=None) -> dict:
    """{"fail": [(行, 理由)], "look": [...]}。"""
    n = len(lines)
    fail, look = [], []
    for i in sorted(rows):
        r = rows[i]
        if r["stress"] >= 1:
            fail.append((i, f"ストレス {r['stress']}（{r['why'] or '理由なし'}）。直し: {r['fix'] or '—'}（F-070 初見で意味が分かる）"))
        elif r["got"] == "×":
            fail.append((i, "分かったが ×（F-070）"))
        elif r["got"] == "△":
            look.append((i, "一拍考えた（△）"))
    last = lint_mod.closing_index(lines) - 2
    for i in range(3, last + 1):
        if rows.get(i - 1, {}).get("next") == 0 and rows.get(i, {}).get("next") == 0:
            fail.append((i, f"{i - 1}・{i}行目が続けて「次」0。続きが気にならない（F-070 続きが気になる）"))
    if whole and len(whole) > 1 and whole[1].isdigit():
        look.append((int(whole[1]), f"いちばん離れそうな行: {whole[2] if len(whole) > 2 else ''}"))
    return {"fail": fail, "look": look, "n": n}


def script_sha(lines: list) -> str:
    """原稿の指紋: 読み上げる行（空行・# の行・【】の印を除いた字）の sha1 の頭16桁。"""
    return hashlib.sha1("\n".join(lines).encode("utf-8")).hexdigest()[:16]


def kept_path(script: Path) -> Path:
    """原稿の隣に置く返事の道（script.txt → viewer.txt・script_A.txt → viewer_A.txt）。"""
    stem = script.stem
    return script.with_name("viewer" + (stem[len("script"):] if stem.startswith("script") else "") + ".txt")


def check(text: str, lines: list) -> tuple:
    """（judge の結果, 形の崩れ）。返事に無い行・原稿に無い行も崩れに数える。"""
    rows, whole, bad = parse(text)
    miss = sorted(set(range(1, len(lines) + 1)) - set(rows))
    if miss:
        bad.append(f"返事に無い行: {miss}")
    extra = sorted(set(rows) - set(range(1, len(lines) + 1)))
    if extra:
        bad.append(f"原稿に無い行: {extra}")
    return judge(rows, lines, whole), bad


def gate(script: Path, reply: Path | None = None) -> None:
    """本編集の1枚を作る前の関所（F-100）。通らなければ ValueError（何が足りないか）。"""
    lines, _, _ = lint_mod.read_script(Path(script))
    p = Path(reply) if reply else kept_path(Path(script))
    how = f"視聴者役に回し、通った返事を `critic_viewer.py <返事> {Path(script).name} --keep` で置く（F-100）"
    if not p.is_file():
        raise ValueError(f"視聴者役の返事 {p.name} が原稿の隣に無い。{how}")
    text = p.read_text(encoding="utf-8")
    head = text.splitlines()[0] if text else ""
    if not head.startswith(KEEP_HEAD):
        raise ValueError(f"視聴者役の返事 {p.name} の頭に原稿の指紋が無い（手で写した返事は数えない）。{how}")
    if head[len(KEEP_HEAD):].strip() != script_sha(lines):
        raise ValueError(f"視聴者役の返事 {p.name} は、今の原稿より前の原稿のもの（返事のあとで原稿を直した）。{how}")
    res, bad = check(text, lines)
    if bad:
        raise ValueError(f"視聴者役の返事 {p.name} が決まりの形でない: {' / '.join(bad[:4])}。{how}")
    if res["fail"]:
        raise ValueError(f"視聴者役の返事 {p.name} に ✕ が {len(res['fail'])} 行残る（"
                         + "・".join(f"{i}行目" for i, _ in res["fail"][:6]) + "）。作文者が直して、視聴者役にもう一度回す（F-100）")


def main() -> int:
    ap = argparse.ArgumentParser(description="視聴者役の返事から ✕ を数える（F-070）")
    ap.add_argument("reply")
    ap.add_argument("script")
    ap.add_argument("--json", action="store_true")
    ap.add_argument("--keep", action="store_true", help="通ったら、原稿の指紋を頭に付けて原稿の隣（viewer*.txt）に置く（本編集の1枚の関所が読む）")
    a = ap.parse_args()
    try:
        text = Path(a.reply).read_text(encoding="utf-8")
        lines, _, _ = lint_mod.read_script(Path(a.script))
    except OSError as e:
        print(f"読めない: {e}", file=sys.stderr)
        return 2
    res, bad = check(text, lines)
    if bad:
        print("✕ 視聴者役の返事が決まりの形でない: " + " / ".join(bad[:8]), file=sys.stderr)
        return 2
    if a.json:
        print(json.dumps({"pass": not res["fail"], "fail": len(res["fail"]), "look": len(res["look"]),
                          "fail_lines": sorted({x[0] for x in res["fail"]})}, ensure_ascii=False))
    else:
        for i, why in res["fail"]:
            print(f"✕ {i}行目: {why}")
        for i, why in res["look"]:
            print(f"△ {i}行目: {why}")
        print(f"結果: {'落ちる' if res['fail'] else '通る'}（✕ {len(res['fail'])}・△ {len(res['look'])}）"
              + ("。✕ の行を作文者が直して、もう一度視聴者役に回す（5回まで）" if res["fail"] else ""))
    if a.keep and not res["fail"]:
        dest = kept_path(Path(a.script))
        dest.write_text(f"{KEEP_HEAD}{script_sha(lines)}\n" + text.rstrip("\n") + "\n", encoding="utf-8")
        print(f"置いた: {dest}（本編集の1枚の関所 brief.py の viewer_pass が読む）", file=sys.stderr)
    elif a.keep:
        print("置かない: ✕ が残っている返事は、本編集の関所を通らない", file=sys.stderr)
    return 1 if res["fail"] else 0


if __name__ == "__main__":
    sys.exit(main())
