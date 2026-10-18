#!/usr/bin/env python3
"""手元のファイル（動画・投稿文・絵）を EC2 へ送り、EC2 の上で sha256 を照合する。

    python3 tools/shorts/post/send.py put <手元> <EC2> [<手元> <EC2> ...]
    python3 tools/shorts/post/send.py clean <EC2のディレクトリ> [...]   # 送った動画を消す

## 中身を SSM のコマンドに載せない

前は中身を base64 に割って SSM の send-command に載せていた。そうすると**中身が EC2 の
SSM エージェントのログ（`/var/log/amazon/ssm/amazon-ssm-agent.log*`）にそのまま残る。**
送ったあとにログを消していたが、操作の記録を消すのはやめた（2026-10-18、安全確認に
「監査ログの改ざん」として止められた）。**ログには触らない。** 代わりに、中身がログに載らない道で送る:

1. Actions に署名付き URL を頼む（`tools/shorts/preview/` の依頼。place は `transfer`）。
   結果は、この回だけの鍵で包んで作業枝に返ってくる（開いたら作業枝から下ろす）
2. ここから GCS の `transfer/` に直に上げる（PUT・1時間）
3. EC2 に `curl` で落とさせ、EC2 の上で sha256 を照らす。**SSM のコマンドに載るのは URL だけ**
4. 照らし終わったら（途中で落ちても）GCS のものをすぐ消す。以後その URL は 404

URL は3時間で切れ、置いたものも1日で消える（`gcs.py` の `TRANSFER_*`）。EC2 のログに URL が
残るのは仕方ないが、そのころには何も指していない。**URL はここでも標準出力・コミット・issue に出さない。**
鍵と URL を開いた場所は、この回だけの一時の場所（リポジトリの外）で、終わったら消す。

同じものが EC2 に在れば（sha256 が同じなら）送らない。途中で落ちたら同じ引数で回し直す。
"""
import hashlib, json, os, re, secrets, shlex, shutil, subprocess, sys, tempfile, time
from pathlib import Path

# EC2 の家。手元の道具に直書きしない（tools/sprites/rootcheck.mjs）
EC2_HOME = "/home/ubuntu"

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
sys.path.insert(0, str(ROOT / ".claude" / "skills" / "ec2-chrome"))
sys.path.insert(0, str(HERE.parent / "preview"))
sys.path.insert(0, str(HERE.parent / "ingest"))
import ec2  # noqa: E402
import branch as br  # noqa: E402
import decrypt  # noqa: E402

BRANCH = "claude/serene-darwin-sf09tt"
CHUNK = 1 << 20
# EC2 の / は空きが少ない（2026-10-18 に 482MB）。落とすぶんに足して、これだけは残す
DISK_MARGIN = 200 * 1024 * 1024
WAIT = 900


def sha256_file(p: Path) -> str:
    h = hashlib.sha256()
    with open(p, "rb") as f:
        for b in iter(lambda: f.read(CHUNK), b""):
            h.update(b)
    return h.hexdigest()


def remote(cmd: str, t: int = 60) -> str:
    """EC2 で回して標準出力を返す。**落ちても cmd は出さない**（URL が入っていることがある）。"""
    for k in range(3):
        try:
            st, out = ec2.run(cmd, t, quiet=True)
            if st == "Success":
                return out
            print(f"  EC2 のコマンドが {st}（{k + 1}回目）", flush=True)
        except SystemExit as e:
            print("  EC2 に送れなかった:", str(e)[:120], flush=True)
        time.sleep(3 + 3 * k)
    raise RuntimeError("EC2 のコマンドが3回とも通らなかった")


def on_ec2(pairs: list[tuple[Path, str, str, int]]) -> dict[str, str]:
    """EC2 に在るものの sha256（無ければ空）。"""
    script = "".join(f"[ -f {shlex.quote(r)} ] && echo {i} $(sha256sum {shlex.quote(r)} | cut -c1-64) || echo {i} -\n"
                     for i, (_, r, _, _) in enumerate(pairs))
    got = {}
    for line in remote(script).splitlines():
        sp = line.split()
        if len(sp) == 2 and sp[0].isdigit():
            got[pairs[int(sp[0])][1]] = "" if sp[1] == "-" else sp[1]
    return got


def ask_urls(work: Path, name: str, ents: list[dict]) -> dict:
    """Actions に transfer/ の署名付き URL を頼み、この回の鍵で開いて urls.json の中身を返す。"""
    key = work / "key.pem"
    subprocess.run(["openssl", "genpkey", "-algorithm", "RSA", "-pkeyopt", "rsa_keygen_bits:3072",
                    "-out", str(key)], check=True, capture_output=True)
    key.chmod(0o600)
    pub = subprocess.run(["openssl", "pkey", "-in", str(key), "-pubout"], check=True,
                         capture_output=True, text=True).stdout
    nonce = secrets.token_hex(12)
    req = {"name": name, "place": "transfer", "action": "up", "files": ents,
           "pubkey": pub, "nonce": nonce}
    br.push_change(BRANCH, {f"shorts/preview/{name}.json":
                            (json.dumps(req, ensure_ascii=False, indent=1) + "\n").encode()}, [],
                   f"EC2 へ渡すもの {name} の受け渡しの URL を頼む（transfer）\n\n"
                   "中身を SSM のコマンドに載せると EC2 のエージェントのログに残るので、GCS に置いて "
                   "EC2 には URL だけを渡す。依頼に置くのはファイル名・大きさ・sha256・公開鍵・乱数だけ。")
    print(f"URL を頼んだ（{name}）。Actions の「ショートの下見を置く」を待つ", flush=True)
    try:
        sha, _ = br.wait_json(BRANCH, f"shorts/.work/preview/{name}/manifest.json",
                              lambda d: d.get("nonce") == nonce, WAIT)
    except TimeoutError:
        raise RuntimeError(f"{WAIT}秒待っても URL が来ない（Actions の「ショートの下見を置く」を見る）") from None
    try:
        with tempfile.TemporaryDirectory(dir=work) as td:
            d = br.extract(sha, f"shorts/.work/preview/{name}", Path(td))
            ok, msg = decrypt.open_one(d, key, decrypt.pub_fp(key), work)
        if not ok:
            raise RuntimeError(f"開けない: {msg}")
        dest = work / "preview" / name
        run = json.loads((dest / "run.json").read_text(encoding="utf-8"))
        if not (dest / "urls.json").is_file():
            raise RuntimeError(f"Actions で署名できなかった: {run.get('error')}\n  聞いた結果: "
                               f"{json.dumps(run.get('probe'), ensure_ascii=False)}")
        body = json.loads((dest / "urls.json").read_text(encoding="utf-8"))
        days = ((run.get("probe") or {}).get("transfer") or {}).get("days")
        if days:
            print("  バケットの寿命: " + "  ".join(f"{p} {d}日" for p, d in days.items()), flush=True)
        return body
    finally:
        # 暗号文も作業枝に溜めない（依頼は serve.py が結果と同じ commit で下ろしてある）
        br.push_change(BRANCH, {}, [f"shorts/preview/{name}.json", f"shorts/.work/preview/{name}"],
                       f"EC2 へ渡すもの {name} の URL の暗号文を下ろす\n\n"
                       "作業箱で開いて使い終えた。作業枝に溜めない。")


def put(pairs_in: list[tuple[str, str]]) -> bool:
    pairs = []
    for local, r in pairs_in:
        p = Path(local)
        if not p.is_file():
            sys.exit(f"!! ファイルが無い: {local}")
        if not r.startswith("/") or ".." in r.split("/"):
            sys.exit(f"!! EC2 の道は / から始まる道にする: {r}")
        pairs.append((p, r, sha256_file(p), p.stat().st_size))
    have = on_ec2(pairs)
    todo = []
    for p, r, digest, size in pairs:
        if have.get(r) == digest:
            print(f"{r}: もう在る（sha256 一致）", flush=True)
        else:
            todo.append((p, r, digest, size))
    if not todo:
        return True
    need = sum(t[3] for t in todo)
    dirs = sorted({os.path.dirname(r) for _, r, _, _ in todo})
    avail = remote(f"mkdir -p {' '.join(shlex.quote(d) for d in dirs)} && "
                   f"df --output=avail -B1 {shlex.quote(dirs[0])} | tail -1").strip()
    if not avail.isdigit() or int(avail) < need + DISK_MARGIN:
        sys.exit(f"!! EC2 の空きが足りない（空き {int(avail) / 1e6 if avail.isdigit() else 0:.0f}MB・"
                 f"送る {need / 1e6:.0f}MB・残したい {DISK_MARGIN / 1e6:.0f}MB）")

    import requests

    name = f"xfer-{time.strftime('%Y%m%d-%H%M%S')}-{secrets.token_hex(3)}"
    # 置き場の名前は番号にする（手元のファイル名は和文のことがあり、依頼は公開の枝に載る）
    ents = []
    for i, (p, _, digest, size) in enumerate(todo):
        ext = p.suffix.lower() if re.fullmatch(r"\.[a-z0-9]{1,8}", p.suffix.lower()) else ".bin"
        ents.append({"name": f"{i:02d}{ext}", "bytes": size, "sha256": digest})
    t0 = time.time()
    work = Path(tempfile.mkdtemp(prefix="send-"))
    ok_all = False
    body = None
    try:
        if decrypt.inside_git(work):
            sys.exit(f"!! 一時の場所 {work} がリポジトリの中。URL を開かないので断る")
        body = ask_urls(work, name, ents)
        by = {f["name"]: f for f in body["files"]}
        print(f"URL が来た（{time.time() - t0:.0f}秒）。GCS に上げる", flush=True)
        for e, (p, _, _, size) in zip(ents, todo):
            u = by[e["name"]]
            t1 = time.time()
            with open(p, "rb") as f:
                st = requests.put(u["put"], data=f, headers={"Content-Type": u["content_type"]},
                                  timeout=(30, 1800)).status_code
            print(f"  上げた {p.name}: HTTP {st}  {size / 1e6:.1f}MB  {time.time() - t1:.1f}秒", flush=True)
            if st != 200:
                raise RuntimeError(f"GCS に上げられなかった: {p.name}（HTTP {st}）")
        # EC2 で落とす。**SSM のコマンドに載るのは URL だけ。** 失敗の字にも URL を出さない
        # （curl -sS の失敗の字は「(22) … error: 403」の形で、URL を含まない）
        script = "set -u\n"
        for i, (e, (_, r, _, _)) in enumerate(zip(ents, todo)):
            q = shlex.quote(r)
            script += (f"if curl -fsS --retry 3 --retry-delay 2 -o {q}.part {shlex.quote(by[e['name']]['get'])} "
                       f"&& mv -f {q}.part {q} && chmod 644 {q}; "
                       f"then echo {i} $(sha256sum {q} | cut -c1-64); else rm -f {q}.part; echo {i} FAILED; fi\n")
        t1 = time.time()
        out = remote(script, 600)
        got = {}
        for line in out.splitlines():
            sp = line.split()
            if len(sp) == 2 and sp[0].isdigit():
                got[int(sp[0])] = sp[1]
        print(f"EC2 が落とした（{time.time() - t1:.0f}秒）", flush=True)
        ok_all = True
        for i, (_, r, digest, _) in enumerate(todo):
            ok = got.get(i) == digest
            ok_all &= ok
            print(f"  {r}: sha256 {'一致 ' + digest if ok else '!! 合わない（' + str(got.get(i))[:16] + '）'}",
                  flush=True)
        return ok_all
    finally:
        # 照らし終わったら（落ちても）すぐ消す。EC2 のログに載った URL が何も指さないように
        for f in (body or {}).get("files") or []:
            try:
                d = requests.delete(f["delete"], timeout=30).status_code
                after = requests.get(f["get"], headers={"Range": "bytes=0-0"}, timeout=30).status_code
            except requests.RequestException as e:
                d, after = type(e).__name__, "?"
            print(f"  GCS から消した {f['name']}: HTTP {d}  そのあと見る URL HTTP {after}"
                  f"{'' if after == 404 else '  !! まだ見える（URL は3時間で切れ、1日で寿命が消す）'}", flush=True)
        shutil.rmtree(work, ignore_errors=True)
        print(f"{'送れた' if ok_all else '!! 送れなかった'}（{time.time() - t0:.0f}秒）", flush=True)


def clean(dirs):
    """送った動画を EC2 から消す。**消すのは自分たちが置いたものだけ。SSM のログには触らない**
    （中身はもうログに載らない。上の「中身を SSM のコマンドに載せない」）"""
    script = "set -u\n"
    for d in dirs:
        if not d.startswith(f"{EC2_HOME}/shorts_post/") or ".." in d.split("/"):
            sys.exit(f"refuse: {d}（{EC2_HOME}/shorts_post の下だけ消す）")
        script += f"rm -rf {shlex.quote(d)}\n"
    script += "df -h / | tail -1\n"
    st, out = ec2.run(script, 60, quiet=True)
    print(out.strip())
    return st == "Success"


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else ""
    if cmd == "put" and len(sys.argv) >= 4 and len(sys.argv) % 2 == 0:
        try:
            sys.exit(0 if put(list(zip(sys.argv[2::2], sys.argv[3::2]))) else 1)
        except RuntimeError as e:
            sys.exit(f"!! {e}")
    elif cmd == "clean" and len(sys.argv) >= 3:
        sys.exit(0 if clean(sys.argv[2:]) else 1)
    else:
        sys.exit(__doc__)
