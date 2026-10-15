"""`shorts/.work/` に届いた暗号文を、秘密鍵で開いて**リポジトリの外に**展開する。

    git fetch origin claude/serene-darwin-sf09tt && git merge --ff-only FETCH_HEAD
    python3 tools/shorts/ingest/decrypt.py --key ~/keys/ref_private.pem --out /path/outside/repo
    python3 tools/shorts/ingest/decrypt.py --key K --out O shorts/.work/yk-by7R7iPA/archive

置き場を指さなければ `shorts/.work/` の下の manifest.json を全部見る。
展開先は `<out>/<dest>/`（例 `<out>/yk-by7R7iPA/archive/`、
`<out>/channels/cheethann3/shorts/`）。前に開いたものは消してから開き直す。

## 守っていること

- **展開先がリポジトリの中なら断る**（上に `.git` がある場所）。平文の字幕や画を
  うっかり `git add` しないため。逃がす道（--force など）は作らない
- 鍵が合わない（manifest の `pubkey_sha256` と秘密鍵の公開側が違う）ものは開かない
- HMAC が合わないものは展開しない（CBC は壊れても黙って何かを返すので）
- 秘密鍵・AES 鍵の値はどこにも出さない（openssl とは標準入出力でだけやりとりする）

## 切った暗号文（payload.enc.000, .001 …）

seal.py は暗号文が 45MB を超えると切って置く（GitHub が 100MB を超えるファイルを
断るため）。manifest の `encrypted_files` に**つなぐ順**で並んでいるので、
その順に1つずつ sha256 を確かめ、つないだ全体に HMAC を掛けて確かめてから、
同じ順に openssl へ流し込む。1つだけの `payload.enc`（前からの形）も同じ道で開く。

**全体をメモリに載せない。** clips は暗号文が数百MB になる。1MB ずつ読んで流し、
復号した tar.gz は展開先の隣の一時ファイルに受けて、展開したら消す。
"""

from __future__ import annotations

import argparse
import hashlib
import hmac
import json
import os
import shutil
import subprocess
import sys
import tarfile
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]


def inside_git(p: Path) -> Path | None:
    p = p.resolve()
    for a in [p, *p.parents]:
        if (a / ".git").exists():
            return a
    return None


def pub_fp(priv: Path) -> str:
    der = subprocess.run(["openssl", "pkey", "-in", str(priv), "-pubout", "-outform", "DER"],
                         capture_output=True, check=True).stdout
    return hashlib.sha256(der).hexdigest()


CHUNK = 1 << 20


def _chunks(path: Path):
    with open(path, "rb") as fh:
        for b in iter(lambda: fh.read(CHUNK), b""):
            yield b


def open_one(d: Path, priv: Path, fp: str, out_root: Path) -> tuple[bool, str]:
    man = json.loads((d / "manifest.json").read_text(encoding="utf-8"))
    if man.get("format") != "shorts-ingest/1":
        return False, f"知らない形 {man.get('format')}"
    if man.get("pubkey_sha256") != fp:
        return False, "鍵が違う（この秘密鍵で包んだものではない）"
    parts = man.get("encrypted_files") or []
    if not parts:
        return False, "暗号文の一覧（encrypted_files）が空"
    rel = man.get("dest") or d.relative_to(d.parents[1]).as_posix()
    if rel.startswith("/") or ".." in Path(rel).parts:
        return False, f"置き場の道が変: {rel}"
    keys = subprocess.run(
        ["openssl", "pkeyutl", "-decrypt", "-inkey", str(priv), "-in", str(d / "key.enc"),
         "-pkeyopt", "rsa_padding_mode:oaep", "-pkeyopt", "rsa_oaep_md:sha256",
         "-pkeyopt", "rsa_mgf1_md:sha256"], capture_output=True, check=True).stdout
    if len(keys) != 80:
        return False, "包んだ鍵の長さが違う"
    key, mkey, iv = keys[:32], keys[32:64], keys[64:]
    # 1. 切れ端を順に読み、1つずつの sha256 と、つないだ全体の HMAC を同時に取る
    hm = hmac.new(mkey, digestmod=hashlib.sha256)
    for p in parts:
        f = d / p["name"]
        if not f.is_file():
            return False, f"{p['name']} が無い（{len(parts)}個に切ってある。git pull し直す）"
        h = hashlib.sha256()
        for b in _chunks(f):
            h.update(b)
            hm.update(b)
        if h.hexdigest() != p["sha256"]:
            return False, f"{p['name']} の sha256 が合わない（取りこぼし？ git pull し直す）"
    if not hmac.compare_digest(hm.hexdigest(), man.get("hmac_sha256", "")):
        return False, "HMAC が合わない（暗号文が壊れている）"
    # 2. 確かめ終わってから、同じ順で openssl に流し込む。tar.gz は一時ファイルに受ける
    #    （展開先と同じ場所＝リポジトリの外。main で確かめてある）
    fd, name = tempfile.mkstemp(prefix=".payload-", suffix=".tar.gz", dir=out_root)
    os.close(fd)
    tmp = Path(name)
    try:
        with open(tmp, "wb") as fo:
            pr = subprocess.Popen(["openssl", "enc", "-d", "-aes-256-cbc", "-K", key.hex(),
                                   "-iv", iv.hex()], stdin=subprocess.PIPE, stdout=fo,
                                  stderr=subprocess.DEVNULL)
            fed = True
            try:
                for p in parts:
                    for b in _chunks(d / p["name"]):
                        pr.stdin.write(b)
                pr.stdin.close()
            except BrokenPipeError:  # openssl が途中で止まった（下の終了コードで断る）
                fed = False
            if pr.wait() != 0 or not fed:
                return False, "openssl が復号できなかった"
        dest = out_root / rel
        if dest.exists():
            shutil.rmtree(dest)
        dest.mkdir(parents=True)
        with tarfile.open(tmp, mode="r:gz") as tf:
            try:
                tf.extractall(dest, filter="data")
            except TypeError:  # 3.11 以前
                for m in tf.getmembers():
                    if m.name.startswith("/") or ".." in Path(m.name).parts:
                        raise RuntimeError(f"変な道 {m.name}")
                tf.extractall(dest)
    finally:
        tmp.unlink(missing_ok=True)
    n = sum(1 for p in dest.rglob("*") if p.is_file())
    size = sum(p.stat().st_size for p in dest.rglob("*") if p.is_file())
    return True, f"{dest}  {n}ファイル {size / 1e6:.1f}MB（status={man.get('status')}）"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--key", required=True, help="RSA 秘密鍵（PEM）")
    ap.add_argument("--out", required=True, help="展開先（リポジトリの外）")
    ap.add_argument("dirs", nargs="*", help="manifest.json のある置き場。無ければ全部")
    a = ap.parse_args()
    out = Path(a.out)
    out.mkdir(parents=True, exist_ok=True)
    g = inside_git(out)
    if g:
        print(f"!! 展開先 {out} はリポジトリ（{g}）の中。平文を置かないので断る")
        return 2
    priv = Path(a.key)
    fp = pub_fp(priv)
    dirs = [Path(x) for x in a.dirs] or sorted(
        p.parent for p in (ROOT / "shorts/.work").rglob("manifest.json"))
    if not dirs:
        print("開くものが無い（git pull した？）")
        return 2
    bad = 0
    for d in dirs:
        try:
            ok, msg = open_one(d, priv, fp, out)
        except (subprocess.CalledProcessError, OSError, ValueError, RuntimeError,
                tarfile.TarError) as e:
            ok, msg = False, f"{type(e).__name__}"
        print(f"{'OK' if ok else 'NG'}  {d}  {msg}")
        bad += 0 if ok else 1
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
