#!/usr/bin/env python3
"""人が直す画面が出した差分（issue のコメント）を、編集指示書に当てる。

    python3 apply_patch.py edit.json comment.md --out edit2.json

コメントの中の ```json ... ``` を1つ読む。中身は
    {"edit": "<id>", "patch": {"title": "...", "captions": {"<行>": "..."},
                                "cuts": {"<番号>": {"in": N, "out": M}}}}

- 字幕の文字は、ナレーションの行に `caption` として書く（声はそのまま、字幕だけ変える）
- カットの長さが変わったら、そのカットより後ろのナレーションとテロップを同じだけずらす
  （画面でも同じ詰め方で下見している。ずらさないと声と映像がずれる）
"""
import argparse
import json
import re
import sys
from pathlib import Path


def extract(text: str) -> dict:
    m = re.search(r"```json\s*(\{.*?\})\s*```", text, re.S)
    if not m:
        sys.exit("コメントに ```json ... ``` が無い")
    return json.loads(m.group(1))


def apply(edit: dict, body: dict) -> dict:
    if body.get("edit") != edit.get("id"):
        sys.exit(f"別の動画の差分: {body.get('edit')} ≠ {edit.get('id')}")
    patch = body["patch"]
    if "title" in patch:
        edit.setdefault("title", {})["text"] = patch["title"]
    lines = edit.get("narration", {}).get("lines", [])
    for k, text in patch.get("captions", {}).items():
        lines[int(k)]["caption"] = text
    at, shifts = 0, []
    for i, c in enumerate(edit["cuts"]):
        old_end = at + c["out"] - c["in"]
        ov = patch.get("cuts", {}).get(str(i))
        if ov:
            if ov["out"] - ov["in"] < 1:
                sys.exit(f"{i}本目のカットの長さが 0 以下になる")
            c["in"], c["out"] = int(ov["in"]), int(ov["out"])
        delta = (c["out"] - c["in"]) - (old_end - at)
        if delta:
            shifts.append((old_end, delta))
        at += c["out"] - c["in"]
    for ln in lines:
        ln["at"] += sum(d for start, d in shifts if ln["at"] >= start)
    # テロップも同じだけずらす（行の頭から終わりまで出しているので、両端を動かす）
    for tp in edit.get("telops", []):
        tp["from"] += sum(d for start, d in shifts if tp["from"] >= start)
        tp["to"] += sum(d for start, d in shifts if tp["to"] >= start)
    return edit


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("edit", type=Path)
    ap.add_argument("comment", type=Path)
    ap.add_argument("--out", type=Path, required=True)
    a = ap.parse_args()
    edit = apply(json.loads(a.edit.read_text()), extract(a.comment.read_text()))
    a.out.write_text(json.dumps(edit, ensure_ascii=False, indent=2) + "\n")
    print(a.out)


if __name__ == "__main__":
    main()
