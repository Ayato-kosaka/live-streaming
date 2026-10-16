"""下見を GCS の非公開の置き場に上げて、あやとが開ける「見る用の URL（7日）」を手元に書く（作業箱側）。

    # 上げる（依頼を出す → Actions が署名 → 開く → 上げる → 落とし直して確かめる → URL を書く）
    python3 tools/shorts/preview/put.py up --name yk-v2 --key <秘密鍵.pem> --out <リポジトリの外> \\
        --urls <リポジトリの外>/v2_urls.txt A.mp4 B.mp4 C.mp4
    # 見られるか・非公開のままかをもう一度見る
    python3 tools/shorts/preview/put.py check  --name yk-v2 --out <同じ>
    # 投稿が済んだら消す（消す URL は7日もつ。過ぎたら置き場の寿命の14日で消える）
    python3 tools/shorts/preview/put.py delete --name yk-v2 --out <同じ>

## 流れ

1. 依頼 `shorts/preview/<name>.json`（ファイル名・公開鍵・乱数）を作業枝に1 commit で置く
   （作業ツリーには触らない。git の索引を一時ファイルにして積む）。master に入ったあとは
   `--via dispatch` で workflow_dispatch から起こせる
2. `.github/workflows/shorts_preview.yml` が、ファイルごとに上げる URL（PUT・1時間）と
   見る URL・消す URL（7日）を作り、公開鍵で暗号化して `shorts/.work/preview/<name>/` に置く
3. ここで取り込んで開く（`tools/shorts/ingest/decrypt.py` と同じ開けかた。**リポジトリの外に**）
4. 3本を並べて上げる → 見る URL で落とし直して sha256 を突き合わせる →
   署名なしの道で 403 になる（非公開）ことを見る
5. 見る URL の一覧を `--urls` に書く。作業枝の依頼と暗号文は下ろす（`--keep-branch` で残す）

## 守っていること

- **見る URL は、持っている人なら誰でも開ける鍵。** 公開の issue・PR・コミット・ログに書かない。
  あやとにはチャットで渡す。ここでも標準出力には出さない（`--urls` のファイルにだけ書く）
- 開いた URL（上げる・消すを含む）は `--out` の下にだけ置く。`--out` がリポジトリの中なら断る
- 落とし直した sha256 が1本でも合わなければ、URL の一覧を書かずに落ちる
"""

from __future__ import annotations

import argparse
import concurrent.futures as cf
import datetime as dt
import hashlib
import json
import os
import secrets
import subprocess
import sys
import tarfile
import tempfile
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
sys.path.insert(0, str(HERE.parent / "ingest"))
import decrypt  # noqa: E402

REPO = "Ayato-kosaka/live-streaming"
BRANCH = "claude/serene-darwin-sf09tt"
JST = dt.timezone(dt.timedelta(hours=9))
CHUNK = 1 << 20


# ---- git（作業ツリーに触らずに、作業枝へ積む・作業枝から読む）----------------------

def git(*a: str, env: dict | None = None, data: bytes | None = None) -> str:
    r = subprocess.run(["git", "-C", str(ROOT), *a], env=env, input=data, capture_output=True)
    if r.returncode != 0:
        raise RuntimeError(f"git {a[0]} が落ちた: {r.stderr.decode(errors='replace').strip()[:300]}")
    return r.stdout.decode()


def fetch(branch: str) -> str:
    git("fetch", "--quiet", "origin", branch)
    return git("rev-parse", "FETCH_HEAD").strip()


def push_change(branch: str, adds: dict[str, bytes], removes: list[str], message: str) -> str | None:
    """作業枝の先に、足す・消すを1 commit で積む。断られたら取り直して6回まで。"""
    for i in range(6):
        base = fetch(branch)
        with tempfile.TemporaryDirectory() as td:
            env = dict(os.environ, GIT_INDEX_FILE=str(Path(td) / "index"))
            git("read-tree", base, env=env)
            for path, data in adds.items():
                sha = git("hash-object", "-w", "--stdin", data=data).strip()
                git("update-index", "--add", "--cacheinfo", f"100644,{sha},{path}", env=env)
            for prefix in removes:
                for p in git("ls-tree", "-r", "--name-only", base, "--", prefix).splitlines():
                    if p:
                        git("update-index", "--force-remove", p, env=env)
            tree = git("write-tree", env=env).strip()
        if tree == git("rev-parse", f"{base}^{{tree}}").strip():
            return None
        commit = git("commit-tree", tree, "-p", base, "-m", message).strip()
        r = subprocess.run(["git", "-C", str(ROOT), "push", "--quiet", "origin",
                            f"{commit}:refs/heads/{branch}"], capture_output=True)
        if r.returncode == 0:
            return commit
        time.sleep(2 + i * 2)
    raise RuntimeError("作業枝に6回とも積めなかった")


def manifest_at(sha: str, name: str) -> dict | None:
    try:
        return json.loads(git("show", f"{sha}:shorts/.work/preview/{name}/manifest.json"))
    except (RuntimeError, json.JSONDecodeError):
        return None


def extract(sha: str, name: str, into: Path) -> Path:
    """作業枝の暗号文を、作業ツリーを通さずに一時の場所へ出す。"""
    rel = f"shorts/.work/preview/{name}"
    r = subprocess.run(["git", "-C", str(ROOT), "archive", "--format=tar", sha, rel],
                       capture_output=True, check=True)
    tar = into / "a.tar"
    tar.write_bytes(r.stdout)
    with tarfile.open(tar) as tf:
        tf.extractall(into, filter="data")
    return into / rel


# ---- 依頼を出す・待つ・開く --------------------------------------------------------

def pubkey_of(priv: Path) -> str:
    return subprocess.run(["openssl", "pkey", "-in", str(priv), "-pubout"], check=True,
                          capture_output=True, text=True).stdout


def request(a, files: list[Path], nonce: str) -> None:
    names = [f.name for f in files]
    pub = pubkey_of(Path(a.key))
    if a.via == "dispatch":
        # master に入ってから。入力は依頼ファイルと同じ意味
        subprocess.run(["gh", "api", "-X", "POST",
                        f"repos/{REPO}/actions/workflows/shorts_preview.yml/dispatches",
                        "-f", "ref=master", "-f", f"inputs[name]={a.name}",
                        "-f", f"inputs[files]={','.join(names)}", "-f", f"inputs[pubkey]={pub}",
                        "-f", f"inputs[nonce]={nonce}", "-f", f"inputs[branch]={a.branch}"],
                       check=True, capture_output=True)
        return
    body = json.dumps({"name": a.name, "files": names, "pubkey": pub, "nonce": nonce},
                      ensure_ascii=False, indent=1) + "\n"
    push_change(a.branch, {f"shorts/preview/{a.name}.json": body.encode()}, [],
                f"ショートの下見 {a.name} の署名付き URL を頼む\n\n"
                "作業箱には GCP の資格情報が無いので、上げる・見る URL を Actions に作ってもらう。"
                "置くのは公開鍵とファイル名だけ。")


def wait_result(a, nonce: str, timeout: float) -> tuple[str, dict]:
    t0 = time.time()
    while time.time() - t0 < timeout:
        sha = fetch(a.branch)
        man = manifest_at(sha, a.name)
        if man and man.get("nonce") == nonce:
            return sha, man
        time.sleep(5)
    raise RuntimeError(f"{timeout:.0f}秒待っても結果が来ない（Actions の「ショートの下見を置く」を見る）")


def open_result(a, sha: str) -> dict:
    out = Path(a.out)
    out.mkdir(parents=True, exist_ok=True)
    priv = Path(a.key)
    with tempfile.TemporaryDirectory(dir=out) as td:
        d = extract(sha, a.name, Path(td))
        ok, msg = decrypt.open_one(d, priv, decrypt.pub_fp(priv), out)
    if not ok:
        raise RuntimeError(f"開けない: {msg}")
    dest = out / "preview" / a.name
    run = json.loads((dest / "run.json").read_text(encoding="utf-8"))
    if not (dest / "urls.json").is_file():
        raise RuntimeError(f"Actions で署名できなかった: {run.get('error')}\n  聞いた権限: "
                           f"{json.dumps(run.get('probe'), ensure_ascii=False)}")
    return json.loads((dest / "urls.json").read_text(encoding="utf-8"))


# ---- 上げる・確かめる -------------------------------------------------------------

def sha256_file(p: Path) -> str:
    h = hashlib.sha256()
    with open(p, "rb") as f:
        for b in iter(lambda: f.read(CHUNK), b""):
            h.update(b)
    return h.hexdigest()


def upload(path: Path, ent: dict) -> dict:
    import requests

    t0 = time.time()
    with open(path, "rb") as f:
        r = requests.put(ent["put"], data=f, headers={"Content-Type": ent["content_type"]},
                         timeout=(30, 1800))
    return {"status": r.status_code, "sec": round(time.time() - t0, 1),
            "bytes": path.stat().st_size}


def download_sha(url: str) -> tuple[int, str, int, float]:
    import requests

    t0 = time.time()
    h = hashlib.sha256()
    n = 0
    with requests.get(url, stream=True, timeout=(30, 1800)) as r:
        if r.status_code != 200:
            return r.status_code, "", 0, time.time() - t0
        for b in r.iter_content(CHUNK):
            h.update(b)
            n += len(b)
    return 200, h.hexdigest(), n, time.time() - t0


def plain_status(url: str) -> int:
    import requests

    return requests.get(url, timeout=30, headers={"Range": "bytes=0-0"}).status_code


def write_urls(path: Path, body: dict, rows: list[dict]) -> None:
    exp = dt.datetime.fromisoformat(body["get_expires"]).astimezone(JST)
    lines = [f"# ショートの下見 {body['name']}（見られるのは {exp:%Y-%m-%d %H:%M} JST まで）",
             "# この URL は持っている人なら誰でも開ける。公開の issue・PR・コミットに貼らない", ""]
    for r in rows:
        lines.append(f"{r['name']}  {r['get']}")
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    path.chmod(0o600)


def cmd_up(a) -> int:
    files = [Path(f) for f in a.files]
    for f in files:
        if not f.is_file():
            print(f"!! ファイルが無い: {f}")
            return 2
    if len({f.name for f in files}) != len(files):
        print("!! 同じ名前のファイルが2つある（置き場ではファイル名で並べる）")
        return 2
    for p in (Path(a.out), Path(a.urls)):
        g = decrypt.inside_git(p.parent if not p.exists() else p)
        if g:
            print(f"!! {p} はリポジトリ（{g}）の中。URL を置かないので断る")
            return 2
    T: dict[str, float] = {}
    t0 = time.time()
    with cf.ThreadPoolExecutor(len(files)) as ex:
        local = dict(zip([f.name for f in files], ex.map(sha256_file, files)))
    T["sha256"] = time.time() - t0

    nonce = secrets.token_hex(12)
    request(a, files, nonce)
    T["request"] = time.time() - t0
    print(f"依頼を出した（{a.via}・{T['request']:.0f}秒）。Actions の署名を待つ")
    sha, man = wait_result(a, nonce, a.timeout)
    T["signed"] = time.time() - t0
    print(f"結果が来た（{T['signed']:.0f}秒・status={man.get('status')}）")
    body = open_result(a, sha)
    ents = {e["name"]: e for e in body["files"]}
    if set(ents) != {f.name for f in files}:
        print("!! 署名したファイルの並びが頼んだものと違う")
        return 1
    T["opened"] = time.time() - t0

    with cf.ThreadPoolExecutor(len(files)) as ex:
        ups = dict(zip([f.name for f in files], ex.map(lambda f: upload(f, ents[f.name]), files)))
    T["uploaded"] = time.time() - t0
    bad = [n for n, u in ups.items() if u["status"] != 200]
    for n, u in ups.items():
        mb = u["bytes"] / 1e6
        print(f"  上げた {n}: HTTP {u['status']}  {mb:.1f}MB  {u['sec']}秒"
              f"（{mb / max(u['sec'], 0.1):.1f}MB/秒）")
    if bad:
        print(f"!! 上げられなかった: {bad}")
        return 1

    with cf.ThreadPoolExecutor(len(files)) as ex:
        downs = dict(zip(ents, ex.map(lambda n: download_sha(ents[n]["get"]), ents)))
    T["verified"] = time.time() - t0
    rows, ng = [], []
    for f in files:
        st, h, n, sec = downs[f.name]
        plain = plain_status(ents[f.name]["plain"])
        same = st == 200 and h == local[f.name]
        private = plain in (401, 403)
        print(f"  確かめた {f.name}: 落とし直し HTTP {st} {n / 1e6:.1f}MB {sec:.1f}秒  sha256 "
              f"{'一致' if same else '不一致'}（{local[f.name][:8]}…）  署名なし HTTP {plain}"
              f"（{'非公開' if private else '!! 公開されている'}）")
        if not (same and private):
            ng.append(f.name)
        rows.append({"name": f.name, "get": ents[f.name]["get"], "sha256": local[f.name],
                     "bytes": f.stat().st_size, "plain_status": plain})
    if ng:
        print(f"!! 確かめで落ちた: {ng}（URL の一覧は書かない）")
        return 1
    write_urls(Path(a.urls), body, rows)
    T["done"] = time.time() - t0
    exp = dt.datetime.fromisoformat(body["get_expires"]).astimezone(JST)
    print(f"見る URL を書いた: {a.urls}（{len(rows)}本・{exp:%m/%d %H:%M} JST まで）")

    if not a.keep_branch:
        c = push_change(a.branch, {}, [f"shorts/preview/{a.name}.json",
                                       f"shorts/.work/preview/{a.name}"],
                        f"ショートの下見 {a.name} の依頼と暗号文を下ろす\n\n"
                        "URL は作業箱で開いて使い終えた。作業枝に溜めない。")
        print("作業枝の依頼と暗号文を下ろした" if c else "作業枝に下ろすものが無かった")
    T["total"] = time.time() - t0
    timing = {k: round(v, 1) for k, v in T.items()}
    timing.update(bucket=body["bucket"], files=len(rows),
                  bytes=sum(r["bytes"] for r in rows), at=dt.datetime.now(JST).isoformat())
    (Path(a.out) / "preview" / a.name / "timing.json").write_text(
        json.dumps(timing, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print("時間（起動からの秒）: " + "  ".join(f"{k} {v:.0f}" for k, v in T.items()))
    return 0


def load_body(a) -> dict:
    p = Path(a.out) / "preview" / a.name / "urls.json"
    if not p.is_file():
        raise SystemExit(f"!! {p} が無い（up を回した --out を渡す）")
    return json.loads(p.read_text(encoding="utf-8"))


def cmd_check(a) -> int:
    import requests

    body = load_body(a)
    bad = 0
    for e in body["files"]:
        r = requests.get(e["get"], headers={"Range": "bytes=0-0"}, timeout=30)
        plain = plain_status(e["plain"])
        ok = r.status_code in (200, 206) and plain in (401, 403)
        bad += 0 if ok else 1
        print(f"  {e['name']}: 見る URL HTTP {r.status_code}  署名なし HTTP {plain}"
              f"  {'OK' if ok else 'NG'}")
    return 1 if bad else 0


def cmd_delete(a) -> int:
    import requests

    body = load_body(a)
    bad = 0
    for e in body["files"]:
        r = requests.delete(e["delete"], timeout=30)
        after = requests.get(e["get"], headers={"Range": "bytes=0-0"}, timeout=30).status_code
        ok = r.status_code in (204, 404) and after == 404
        bad += 0 if ok else 1
        print(f"  消した {e['name']}: HTTP {r.status_code}  そのあと見る URL HTTP {after}"
              f"  {'OK' if ok else 'NG'}")
    return 1 if bad else 0


def main() -> int:
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd", required=True)
    for name in ("up", "check", "delete"):
        p = sub.add_parser(name)
        p.add_argument("--name", required=True, help="下見の名前（英数字と . _ -）")
        p.add_argument("--out", required=True, help="開いた URL を置く場所（リポジトリの外）")
        if name == "up":
            p.add_argument("--key", required=True, help="RSA 秘密鍵（PEM）")
            p.add_argument("--urls", required=True, help="見る URL の一覧を書くファイル（リポジトリの外）")
            p.add_argument("--branch", default=BRANCH, help="依頼と結果を置く作業枝（claude/…）")
            p.add_argument("--via", choices=("push", "dispatch"), default="push",
                           help="push＝依頼ファイルを作業枝に置く / dispatch＝master のワークフローを起こす")
            p.add_argument("--timeout", type=float, default=600)
            p.add_argument("--keep-branch", action="store_true", help="作業枝の依頼と暗号文を残す")
            p.add_argument("files", nargs="+")
    a = ap.parse_args()
    if a.cmd == "up" and not a.branch.startswith("claude/"):
        print("!! 作業枝は claude/ で始まる名前にする")
        return 2
    return {"up": cmd_up, "check": cmd_check, "delete": cmd_delete}[a.cmd](a)


if __name__ == "__main__":
    sys.exit(main())
