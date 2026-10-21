"""作業枝に置かれた付箋の暗号文を、手元で開いて表にする。**名前と本文はこの画面にだけ出す。**

    git fetch origin claude/serene-darwin-sf09tt
    python3 tools/shorts/stickies/read.py --key <スクラッチパッド>/keys/priv.pem --ref FETCH_HEAD
    python3 tools/shorts/stickies/read.py --key K --ref FETCH_HEAD --theme ""        # テーマ横断
    python3 tools/shorts/stickies/read.py --key K shorts/.work/stickies/shorts-idea  # 取り込んだ枝から

`--ref` は作業ツリーに触らずに git から3つ（manifest.json / key.enc / payload.enc）を抜いて開く。
統括のセッションが同じ clone で別の枝を開いていても、枝を切り替えずに読めるように。

開くのは ingest の `decrypt.py`（鍵が合うか・HMAC・リポジトリの外にしか展開しない）。
既定では一時の場所に開いて、表を出したら消す。中身（応答そのままの `stickies.json`）を
残したいときは `--out` に**リポジトリの外**を渡す。

**ここで出したものを、issue・コミット・企画・台本・投稿文に写さない。** 名前は特に。
YouTube のリンクは動画IDと時刻だけに直して出す（共有のリンクに付く `si=` は、
共有した人のアカウントに紐づく印なので、表に出すところで落としておく）。
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import subprocess
import sys
import tempfile
import urllib.parse
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "ingest"))
from decrypt import inside_git, open_one, pub_fp  # noqa: E402

ROOT = HERE.parents[2]
JST = dt.timezone(dt.timedelta(hours=9))
FILES = ("manifest.json", "key.enc", "payload.enc")


def jst(iso: object) -> str:
    try:
        t = dt.datetime.fromisoformat(str(iso).replace("Z", "+00:00"))
        return t.astimezone(JST).strftime("%Y-%m-%d %H:%M")
    except (ValueError, TypeError):
        return "?"


def clean_link(link: object) -> str:
    """YouTube は動画IDと時刻だけにする。それ以外はそのまま。"""
    s = str(link or "")
    if not s:
        return ""
    u = urllib.parse.urlsplit(s)
    host = (u.hostname or "").removeprefix("www.").removeprefix("m.")
    q = urllib.parse.parse_qs(u.query)
    vid = ""
    if host == "youtu.be":
        vid = u.path.strip("/")
    elif host == "youtube.com":
        parts = [p for p in u.path.split("/") if p]
        vid = (q.get("v") or [""])[0] if parts[:1] == ["watch"] else (
            parts[1] if len(parts) > 1 and parts[0] in ("live", "shorts") else "")
    if not vid:
        return s
    t = (q.get("t") or [""])[0].rstrip("s")
    return f"https://youtu.be/{vid}" + (f"?t={t}" if t.isdigit() else "")


def from_ref(ref: str, slot: str, into: Path) -> Path:
    """git の ref から暗号文を抜く（作業ツリーにも索引にも触らない）。"""
    d = into / "sealed"
    d.mkdir(parents=True)
    for name in FILES:
        r = subprocess.run(["git", "-C", str(ROOT), "show", f"{ref}:shorts/.work/stickies/{slot}/{name}"],
                           capture_output=True)
        if r.returncode != 0:
            raise SystemExit(f"!! {ref} に shorts/.work/stickies/{slot}/{name} が無い"
                             "（git fetch した？ 暗号文を45MB で切った回は read.py ではなく decrypt.py で開く）")
        (d / name).write_bytes(r.stdout)
    return d


def table(notes: list[dict]) -> str:
    head = ["id", "作成（JST）", "テーマ", "あやと", "♥", "返事", "名前", "リンク", "本文"]
    rows = [head]
    for n in notes:
        rows.append([str(n.get("id", "")), jst(n.get("createdAt")), str(n.get("theme", "")),
                     "○" if n.get("byOwner") else "", str(n.get("hearts", 0)),
                     "済" if n.get("reply") else "", str(n.get("by") or ""),
                     clean_link(n.get("link")),
                     " / ".join(str(n.get("text", "")).split("\n"))])
    return "\n".join(" | ".join(r) for r in rows)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--key", required=True, help="RSA 秘密鍵（PEM）。依頼に入れた公開鍵の対")
    ap.add_argument("--ref", help="暗号文を抜く git の ref（FETCH_HEAD・origin/claude/… など）")
    ap.add_argument("--theme", default="shorts-idea", help="どのテーマの置き場か。空ならテーマ横断")
    ap.add_argument("--out", help="開いた中身を残す場所（リポジトリの外）。無ければ表を出して消す")
    ap.add_argument("dir", nargs="?", help="manifest.json のある置き場（--ref の代わり）")
    a = ap.parse_args()
    slot = a.theme or "_all"
    priv = Path(a.key)
    with tempfile.TemporaryDirectory(prefix="stickies-read-") as td:
        td = Path(td)
        out = Path(a.out) if a.out else td / "open"
        out.mkdir(parents=True, exist_ok=True)
        if inside_git(out):
            print(f"!! 開く先 {out} はリポジトリの中。平文を置かないので断る")
            return 2
        if a.ref:
            d = from_ref(a.ref, slot, td)
        elif a.dir:
            d = Path(a.dir)
        else:
            d = ROOT / "shorts/.work/stickies" / slot
        if not (d / "manifest.json").is_file():
            print(f"!! {d} に manifest.json が無い（--ref で枝から読むか、枝を取り込む）")
            return 2
        man = json.loads((d / "manifest.json").read_text(encoding="utf-8"))
        ok, msg = open_one(d, priv, pub_fp(priv), out)
        if not ok:
            print(f"!! 開けなかった: {msg}")
            return 1
        base = out / man["dest"]
        doc = json.loads((base / "stickies.json").read_text(encoding="utf-8"))
        req = json.loads((base / "request.json").read_text(encoding="utf-8"))
        notes = doc.get("notes") or []
        print(f"{man['dest']}  {len(notes)}枚  読んだ {jst(req.get('fetched_at'))} JST"
              f"  続き {'あり' if doc.get('more') else 'なし'}  {man.get('run') or ''}")
        print(table(notes))
        if a.out:
            print(f"\n開いたもの: {base}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
