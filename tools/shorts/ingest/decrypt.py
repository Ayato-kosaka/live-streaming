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

## シートだけ開く（clips。`--sheets`）

clips の置き場には、mp4 の大きな封とは別に、見る用の小さな封（`sheets.key.enc`・
`sheets.enc`。シートと index.json ほか。数MB）がある（seal.py）。`--sheets` はそれだけを開き、
`<out>/<dest>/` の `sheets/` を入れ替える（先に開いた mp4 は消さない）。

    python3 tools/shorts/ingest/decrypt.py --key K --out O --sheets \\
        --branch claude/serene-darwin-sf09tt shorts/.work/weSZaHeQVlI/clips

**`--branch` は git を通さない。** 枝を fetch すると mp4 の暗号文（数百MB）も全部落ちてくる。
`--branch` は GitHub の API（`gh api`）で、その枝の先の commit から manifest.json と
開くのに要るファイルだけを取り、`<out>/.sealed/<dest>/` に置いてから開く。
置き場を指さなければ、その枝の `shorts/.work/` で小さな封を持つ置き場のうち、
**この鍵で包んだもの**を全部開く（ほかの担当の鍵のものは飛ばす）。

**中身は git の blob で取る（`git/blobs/<sha>`）。`contents/<道>` の raw では取らない。**
contents の raw は、GitHub が「文字だ」と見立てたファイルを UTF-8 に**書き換えて**返す。
2026-10-23、dRXae0mJw8M の `key.enc`（384バイトの乱数）が UTF-16BE の文字と見立てられ、
571バイトの文字列になって届いた（応答の Content-Length から 571。GitHub の側で化けている）。
包んだ鍵が壊れるので openssl が開けず、`CalledProcessError` とだけ出て止まった。
blob の raw は書き換えないうえ、届いたものの git の hash（`blob <長さ>\\0` + 中身の sha1）を
置き場の一覧にある blob の sha と突き合わせられる。合わなければ開かずに断る
（manifest に sha256 の無い `key.enc` も、これで守れる）。
"""

from __future__ import annotations

import argparse
import hashlib
import hmac
import json
import os
import re
import shutil
import subprocess
import sys
import tarfile
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
WORK = "shorts/.work"
# manifest に書いてある名前は、この形のものしか読まない（../ で置き場の外を読ませない）
PART_NAME = re.compile(r"^(payload|sheets)\.enc(\.\d{3})?$")
KEY_NAMES = ("key.enc", "sheets.key.enc")


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


def seal_of(man: dict, sheets: bool) -> tuple[str, list, str] | str:
    """開く封の (鍵のファイル, 暗号文の一覧, HMAC)。開けないときは理由の文。"""
    if sheets:
        s = man.get("sheets")
        if not s:
            return ("シートの封が無い（clips ではない・シートを作る前の回・切れずに"
                    "index.json が無い回。大きいほうを開く）")
        key_file, parts, mac = s.get("key_file"), s.get("encrypted_files") or [], s.get("hmac_sha256")
    else:
        key_file, parts, mac = "key.enc", man.get("encrypted_files") or [], man.get("hmac_sha256")
    if key_file not in KEY_NAMES:
        return f"鍵のファイル名が変: {key_file!r}"
    if not parts:
        return "暗号文の一覧（encrypted_files）が空"
    if any(not PART_NAME.match(str(p.get("name"))) for p in parts):
        return "暗号文のファイル名が変"
    return key_file, parts, mac or ""


def open_one(d: Path, priv: Path, fp: str, out_root: Path,
             sheets: bool = False) -> tuple[bool, str]:
    man = json.loads((d / "manifest.json").read_text(encoding="utf-8"))
    if man.get("format") != "shorts-ingest/1":
        return False, f"知らない形 {man.get('format')}"
    if man.get("pubkey_sha256") != fp:
        return False, "鍵が違う（この秘密鍵で包んだものではない）"
    picked = seal_of(man, sheets)
    if isinstance(picked, str):
        return False, picked
    key_file, parts, want_mac = picked
    rel = man.get("dest") or d.relative_to(d.parents[1]).as_posix()
    if rel.startswith("/") or ".." in Path(rel).parts:
        return False, f"置き場の道が変: {rel}"
    keys = subprocess.run(
        ["openssl", "pkeyutl", "-decrypt", "-inkey", str(priv), "-in", str(d / key_file),
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
    if not hmac.compare_digest(hm.hexdigest(), want_mac):
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
        if sheets:
            # 見る用だけ。先に開いた mp4 は残し、シートだけ入れ替える（古いシートを混ぜない）
            shutil.rmtree(dest / "sheets", ignore_errors=True)
        elif dest.exists():
            shutil.rmtree(dest)
        dest.mkdir(parents=True, exist_ok=True)
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
    if sheets:
        jpgs = sorted((dest / "sheets").glob("*.jpg"))
        if not jpgs:
            return False, (f"{dest}  開けたがシートが1枚も入っていない"
                           f"（manifest の stages.sheets={man.get('stages', {}).get('sheets')}）")
        size = sum(p.stat().st_size for p in jpgs)
        return True, (f"{dest}/sheets  シート {len(jpgs)}枚 {size / 1e6:.1f}MB"
                      f"（status={man.get('status')}）")
    n = sum(1 for p in dest.rglob("*") if p.is_file())
    size = sum(p.stat().st_size for p in dest.rglob("*") if p.is_file())
    return True, f"{dest}  {n}ファイル {size / 1e6:.1f}MB（status={man.get('status')}）"


# ---------------------------------------------------------------- --branch（git を通さずに取る）

def _repo() -> str:
    """owner/name。origin の URL の最後の2つ（取れなければ GITHUB_REPOSITORY）。"""
    try:
        url = subprocess.run(["git", "-C", str(ROOT), "remote", "get-url", "origin"],
                             capture_output=True, text=True, check=True).stdout.strip()
        m = re.search(r"([^/:]+)/([^/]+?)(?:\.git)?/?$", url)
        if m:
            return f"{m.group(1)}/{m.group(2)}"
    except (OSError, subprocess.CalledProcessError):
        pass
    return os.environ.get("GITHUB_REPOSITORY", "Ayato-kosaka/live-streaming")


def gh_get(api: str, to: Path | None = None, raw: bool = False) -> bytes:
    """`gh api` を1回。to があればそこへ書く（暗号文はバイト列のまま）。"""
    cmd = ["gh", "api"] + (["-H", "Accept: application/vnd.github.raw"] if raw else []) + [api]
    if to is None:
        return subprocess.run(cmd, capture_output=True, check=True).stdout
    to.parent.mkdir(parents=True, exist_ok=True)
    with open(to, "wb") as fh:
        subprocess.run(cmd, stdout=fh, stderr=subprocess.PIPE, check=True)
    return b""


def remote_dests(repo: str, sha: str, get=gh_get) -> list[str]:
    """その commit の shorts/.work/ で、小さな封（sheets.enc）を持つ置き場（dest）を並べる。"""
    def tree(t: str) -> list[dict]:
        return json.loads(get(f"repos/{repo}/git/trees/{t}"))["tree"]

    node = (json.loads(get(f"repos/{repo}/commits/{sha}"))["commit"]["tree"]["sha"])
    for part in WORK.split("/"):
        hit = [e for e in tree(node) if e["path"] == part and e["type"] == "tree"]
        if not hit:
            return []
        node = hit[0]["sha"]
    paths = [e["path"] for e in json.loads(get(f"repos/{repo}/git/trees/{node}?recursive=1"))["tree"]
             if e["type"] == "blob"]
    return sorted({p.rsplit("/", 1)[0] for p in paths
                   if re.search(r"/sheets\.enc(\.\d{3})?$", p)})


class Garbled(ValueError):
    """枝から取ったものが、枝の中身と1バイトでも違って届いた（開かない）。"""


def git_blob_sha(path: Path) -> str:
    """git がそのファイルに付ける blob の sha（`git hash-object` と同じ）。"""
    h = hashlib.sha1(f"blob {path.stat().st_size}\0".encode())
    for b in _chunks(path):
        h.update(b)
    return h.hexdigest()


def fetch_remote(repo: str, sha: str, rel: str, into: Path, fp: str | None, sheets: bool,
                 get=gh_get) -> tuple[Path | None, str]:
    """manifest.json と、開くのに要るファイルだけを取る。(置いた所, 一言) を返す。

    fp を渡すと、鍵が違う置き場は manifest だけ読んで飛ばす（None を返す）。
    1つでも枝の中身と違って届いたら `Garbled` で止める（化けたものを開きに行かない）。
    """
    d = into / rel
    if d.exists():
        shutil.rmtree(d)
    # 置き場の一覧で、名前ごとの blob の sha を先に知る（取ったあとの突き合わせに使う）
    listing = json.loads(get(f"repos/{repo}/contents/{WORK}/{rel}?ref={sha}"))
    blob_of = {e["name"]: e["sha"] for e in listing if e.get("type") == "file"}

    def gh_get_to(name: str) -> None:
        if name not in blob_of:
            raise Garbled(f"{name} が枝の置き場に無い")
        f = d / name
        get(f"repos/{repo}/git/blobs/{blob_of[name]}", f, raw=True)
        if git_blob_sha(f) != blob_of[name]:
            raise Garbled(f"{name} が枝の中身と違って届いた（{f.stat().st_size}バイト。"
                          "GitHub が文字に書き換えた？）ので開かない")

    gh_get_to("manifest.json")
    man = json.loads((d / "manifest.json").read_text(encoding="utf-8"))
    if fp and man.get("pubkey_sha256") != fp:
        return None, "鍵が違う（ほかの担当の鍵で包んだもの）ので飛ばした"
    picked = seal_of(man, sheets)
    if isinstance(picked, str):
        return d, picked  # 開く側（open_one）が同じ理由で断る
    key_file, parts, _ = picked
    for name in [key_file] + [p["name"] for p in parts]:
        gh_get_to(name)
    got = sum((d / p["name"]).stat().st_size for p in parts)
    return d, f"{1 + len(parts)}ファイル {got / 1e6:.1f}MB を取った"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--key", required=True, help="RSA 秘密鍵（PEM）")
    ap.add_argument("--out", required=True, help="展開先（リポジトリの外）")
    ap.add_argument("--sheets", action="store_true",
                    help="clips の見る用の小さな封（シートと index.json）だけを開く")
    ap.add_argument("--branch", help="git を通さず、この枝の先から要るファイルだけを API で取って開く")
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
    bad = 0
    if a.branch:
        dirs = []
        try:
            repo = _repo()
            sha = json.loads(gh_get(f"repos/{repo}/commits/{a.branch}"))["sha"]
            rels = [x.removeprefix(f"{WORK}/").strip("/") for x in a.dirs]
            if any(not r or ".." in Path(r).parts for r in rels):
                print(f"!! 置き場の道が変: {a.dirs}")
                return 2
            every = not rels
            if every and not a.sheets:
                # 大きいほうを全部 API で落とすくらいなら git で取り込むほうが早い
                print("!! --branch で置き場を指さないのは --sheets のときだけ（大きいほうは git で取る）")
                return 2
            if every:
                # get は呼ぶときに引く（見張りが偽の GitHub に差し替えて main ごと回せるように）
                rels = remote_dests(repo, sha, get=gh_get)
            print(f"{repo} の {a.branch}（{sha[:12]}）から {len(rels)}か所")
            for rel in rels:
                try:
                    d, msg = fetch_remote(repo, sha, rel, out / ".sealed", fp if every else None,
                                          a.sheets, get=gh_get)
                except Garbled as e:
                    # 1か所が化けても、ほかの置き場は開く。化けたところは数えて赤にする
                    print(f"NG  {rel}  {e}")
                    bad += 1
                    continue
                print(f"   {rel}  {msg}")
                if d:
                    dirs.append(d)
        except (subprocess.CalledProcessError, OSError, ValueError, KeyError) as e:
            print(f"!! 枝から取れなかった（{type(e).__name__}。gh が使えるか・枝の名前・置き場を見る）")
            return 2
    else:
        dirs = [Path(x) for x in a.dirs] or sorted(
            p.parent for p in (ROOT / WORK).rglob("manifest.json"))
    if not dirs:
        print("開くものが無い（git pull した？ --branch なら、枝にこの鍵の小さな封が無い）")
        return 1 if bad else 2
    for d in dirs:
        try:
            ok, msg = open_one(d, priv, fp, out, sheets=a.sheets)
        except (subprocess.CalledProcessError, OSError, ValueError, RuntimeError,
                tarfile.TarError) as e:
            ok, msg = False, f"{type(e).__name__}"
        print(f"{'OK' if ok else 'NG'}  {d}  {msg}")
        bad += 0 if ok else 1
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
