"""下見を置いて、あやとがスマホで開ける URL（7日）を手元に書く（作業箱側）。

    # 置く（依頼 → Actions → 受け渡し → 配る・確かめる → URL を書く）
    python3 tools/shorts/preview/put.py up --name yk-v2 --key <秘密鍵.pem> --out <リポジトリの外> \\
        --urls <リポジトリの外>/v2_urls.txt A.mp4 B.mp4 C.mp4
    # 投稿が済んだら消す（hosting はチャンネルごと。どちらも7日で勝手に見られなくなる）
    python3 tools/shorts/preview/put.py delete --name yk-v2 --key <同じ> --out <同じ>
    # GCS の道だけ: 見られるか・非公開のままかをもう一度見る
    python3 tools/shorts/preview/put.py check  --name yk-v2 --out <同じ>
    # hosting のチャンネルを数える（sha256・作った時刻・消える時刻・札。名前は手元の記録と突き合わせる）
    python3 tools/shorts/preview/put.py list --key <同じ> --out <同じ> [--known <sha256→名前の json>]
    # sha256 で指していくつも消す（依頼にチャンネル名を書かない）
    python3 tools/shorts/preview/put.py delete --key <同じ> --out <同じ> --sha256 <64桁> --sha256 <64桁>

置き場は2つ（`--place`）。いまは **hosting**（Firebase Hosting のプレビューチャンネル）。
**gcs**（非公開バケットの署名付き URL。#938 で 2026-10-17 から）は作業箱から直に上げるので速い（37秒）が、
並べたページは無い（README の「GCS の道」）。

## hosting の流れ

1. 依頼 `shorts/preview/<name>.json`（ファイル名・大きさ・sha256・公開鍵・乱数）を作業枝に積む
   （作業ツリーには触らない。`branch.py`）
2. Actions がその場で作った公開鍵を `shorts/.work/preview/<name>/inbox.json` に置く
3. ここで動画と `meta.json`（題・長さ）をその公開鍵で包んで `…/<name>/upload/` に積む
4. Actions が開いて sha256 を確かめ、プレビューチャンネル（7日で消える）に配り、
   落とし直しの sha256・範囲の要求・スマホ幅での再生を見て、URL をこちらの公開鍵で包んで返す
5. ここで開いて URL の一覧を `--urls` に書く。作業枝の暗号文は下ろす

## gcs の流れ

依頼 → Actions がファイルごとの PUT（1時間）・GET/DELETE（7日）の URL を作って返す →
ここから直に上げる → GET で落とし直して sha256 を突き合わせ、署名なしの道が 403 になる
（非公開）ことを見る → URL の一覧を書く

## 守っていること

- **見る URL は、持っている人なら誰でも開ける鍵。** 下見は 制作 issue に貼ってよい
  （あやと 2026-10-16「動画のレビューは非公開に無理にする必要ない」）。ただしリポジトリには
  平文で入れない（作業枝には暗号文だけ）。ここでも標準出力には出さず、`--urls` のファイルに書く
- 開いた結果（URL・チャンネル名・スマホ幅の絵）は `--out` の下にだけ置く。リポジトリの中なら断る
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
import shutil
import subprocess
import sys
import tempfile
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE.parent / "ingest"))
import branch as br  # noqa: E402
import decrypt  # noqa: E402
import seal  # noqa: E402

REPO = "Ayato-kosaka/live-streaming"
BRANCH = "claude/serene-darwin-sf09tt"
JST = dt.timezone(dt.timedelta(hours=9))
CHUNK = 1 << 20
# mp4 は gzip でほとんど縮まない。包むのに時間をかけても運ぶ量は変わらない
seal.LEVEL.setdefault("preview-in", 1)
VIDEO = (".mp4", ".mov", ".m4v", ".webm")


# ---- 依頼を出す・待つ・開く --------------------------------------------------------

def pubkey_of(priv: Path) -> str:
    return subprocess.run(["openssl", "pkey", "-in", str(priv), "-pubout"], check=True,
                          capture_output=True, text=True).stdout


def request(a, req: dict) -> None:
    """依頼を出す。push＝依頼ファイルを作業枝に積む / dispatch＝master のワークフローを起こす。"""
    if a.via == "dispatch":
        args = ["gh", "api", "-X", "POST",
                f"repos/{REPO}/actions/workflows/shorts_preview.yml/dispatches", "-f", "ref=master",
                "-f", f"inputs[branch]={a.branch}"]
        for k in ("name", "place", "action", "pubkey", "nonce"):
            args += ["-f", f"inputs[{k}]={req.get(k, '')}"]
        chs = req.get("channel_sha256", "")
        args += ["-f", f"inputs[files]={json.dumps(req.get('files', []))}",
                 "-f", f"inputs[channel_sha256]={','.join(chs) if isinstance(chs, list) else chs}"]
        subprocess.run(args, check=True, capture_output=True)
        return
    body = json.dumps(req, ensure_ascii=False, indent=1) + "\n"
    br.push_change(a.branch, {f"shorts/preview/{a.name}.json": body.encode()}, [],
                   f"ショートの下見 {a.name} を頼む（{req['place']}/{req['action']}）\n\n"
                   "作業箱には GCP の資格情報も Hosting への道も無いので、Actions に置いてもらう。"
                   "依頼に置くのはファイル名・大きさ・sha256・公開鍵・乱数だけ。")


def wait_result(a, nonce: str, timeout: float) -> tuple[str, dict]:
    try:
        return br.wait_json(a.branch, f"shorts/.work/preview/{a.name}/manifest.json",
                            lambda d: d.get("nonce") == nonce, timeout)
    except TimeoutError:
        raise RuntimeError(f"{timeout:.0f}秒待っても結果が来ない"
                           "（Actions の「ショートの下見を置く」を見る）") from None


def open_result(a, sha: str) -> tuple[dict | None, dict, Path]:
    """(urls.json, run.json, 開いた場所)。"""
    out = Path(a.out)
    out.mkdir(parents=True, exist_ok=True)
    priv = Path(a.key)
    with tempfile.TemporaryDirectory(dir=out) as td:
        d = br.extract(sha, f"shorts/.work/preview/{a.name}", Path(td))
        ok, msg = decrypt.open_one(d, priv, decrypt.pub_fp(priv), out)
    if not ok:
        raise RuntimeError(f"開けない: {msg}")
    dest = out / "preview" / a.name
    run = json.loads((dest / "run.json").read_text(encoding="utf-8"))
    body = (json.loads((dest / "urls.json").read_text(encoding="utf-8"))
            if (dest / "urls.json").is_file() else None)
    return body, run, dest


def cleanup_branch(a) -> None:
    if a.keep_branch:
        return
    c = br.push_change(a.branch, {}, [f"shorts/preview/{a.name}.json",
                                      f"shorts/.work/preview/{a.name}"],
                       f"ショートの下見 {a.name} の暗号文を下ろす\n\n"
                       "結果は作業箱で開いて使い終えた。作業枝に溜めない。")
    print("作業枝の暗号文を下ろした" if c else "作業枝に下ろすものが無かった")


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


def expires_jst(body: dict) -> dt.datetime:
    return dt.datetime.fromisoformat(body["get_expires"].replace("Z", "+00:00")).astimezone(JST)


def write_urls(path: Path, body: dict, rows: list[dict]) -> None:
    exp = expires_jst(body)
    lines = [f"# ショートの下見 {body['name']}（見られるのは {exp:%Y-%m-%d %H:%M} JST まで）",
             "# この URL は持っている人なら誰でも開ける。issue には貼ってよい（あやと 2026-10-16）。"
             "コミットには入れない", ""]
    if body.get("page"):
        lines += [f"まとめて見る  {body['page']}", ""]
    for r in rows:
        lines.append(f"{r['name']}  {r['get']}")
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    path.chmod(0o600)


def probe_files(files: list[Path], titles: dict[str, str]) -> tuple[list[dict], dict]:
    """依頼に載せる (名前・大きさ・sha256) と、荷物に入れる meta（題・長さ）。"""
    with cf.ThreadPoolExecutor(len(files)) as ex:
        sums = list(ex.map(sha256_file, files))
    ents = [{"name": f.name, "bytes": f.stat().st_size, "sha256": s} for f, s in zip(files, sums)]
    items = []
    for f in files:
        it = {"name": f.name, "label": f.stem}
        if f.suffix.lower() in VIDEO and shutil.which("ffprobe"):
            r = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration",
                                "-of", "csv=p=0", str(f)], capture_output=True, text=True)
            try:
                it["duration"] = round(float(r.stdout.strip()), 2)
            except ValueError:
                pass
        # 題は引数で渡したものか、同じフォルダの post_<名前>.json（投稿文）から
        t = titles.get(f.name)
        post = f.with_name(f"post_{f.stem}.json")
        if not t and post.is_file():
            try:
                t = (json.loads(post.read_text(encoding="utf-8")).get("youtube") or {}).get("title")
            except json.JSONDecodeError:
                t = None
        if t:
            it["title"] = t
        items.append(it)
    return ents, {"items": items}


def up_hosting(a, files: list[Path], ents: list[dict], meta: dict, T: dict, t0: float) -> dict:
    """依頼 → 受け取り口 → 包んで積む → 結果を待つ。urls.json の中身を返す。"""
    nonce = secrets.token_hex(12)
    req = {"name": a.name, "place": "hosting", "action": "up", "files": ents,
           "pubkey": pubkey_of(Path(a.key)), "nonce": nonce}
    if a.title:
        meta["title"] = a.title
    request(a, req)
    T["request"] = time.time() - t0
    print(f"依頼を出した（{a.via}・{T['request']:.0f}秒）。Actions の受け取り口を待つ")
    _, inbox = br.wait_json(a.branch, f"shorts/.work/preview/{a.name}/inbox.json",
                            lambda d: d.get("nonce") == nonce, a.timeout)
    T["inbox"] = time.time() - t0
    print(f"受け取り口が開いた（{T['inbox']:.0f}秒）。包んで積む")
    with tempfile.TemporaryDirectory(dir=a.out) as td:
        td = Path(td)
        stage = td / "stage"
        stage.mkdir()
        for f in files:
            try:
                os.link(f, stage / f.name)
            except OSError:
                shutil.copy(f, stage / f.name)
        (stage / "meta.json").write_text(json.dumps(meta, ensure_ascii=False, indent=1) + "\n",
                                         encoding="utf-8")
        item = {"key": f"preview-in__{a.name}", "mode": "preview-in",
                "dest": f"preview-in/{a.name}", "pubkey": inbox["pubkey"],
                "pubkey_sha256": inbox["pubkey_sha256"], "req": f"shorts/preview/{a.name}.json"}
        sealed = td / "sealed"
        man = seal.seal(item, stage, sealed, {"stages": {"upload": "ok"},
                                              "counts": {"files": len(files)}})
        man["nonce"] = nonce
        seal.write_json(sealed / "manifest.json", man)
        T["sealed"] = time.time() - t0
        adds = {f"shorts/.work/preview/{a.name}/upload/{p.name}": p
                for p in sorted(sealed.iterdir())}
        br.push_change(a.branch, adds, [],
                       f"ショートの下見 {a.name} の動画を、Actions の受け取り口の鍵で包んで積む\n\n"
                       "作業箱から Hosting に届かないので git で渡す。鍵はランナーがその場で作った"
                       "もので、ランナーと一緒に消える。結果を置くときに Actions が下ろす。")
        mb = sum(p.stat().st_size for p in sealed.iterdir()) / 1e6
    T["pushed"] = time.time() - t0
    print(f"積んだ（暗号文 {mb:.0f}MB・包む {T['sealed'] - T['inbox']:.0f}秒・"
          f"積む {T['pushed'] - T['sealed']:.0f}秒）。配り終わるのを待つ")
    sha, rman = wait_result(a, nonce, a.timeout)
    T["result"] = time.time() - t0
    body, run, dest = open_result(a, sha)
    if not body:
        raise RuntimeError(f"Actions で置けなかった: {run.get('error')}")
    print(f"結果が来た（{T['result']:.0f}秒・status={rman.get('status')}）。ランナーで確かめたこと:")
    for c in body.get("checks") or []:
        print(f"  {c['name']}: 落とし直し HTTP {c['status']}  sha256 "
              f"{'一致' if c['sha256_ok'] else '!! 不一致'}  範囲 {c['range_status']}"
              f"  noindex {'○' if c.get('noindex') else '✕'}")
    p = body.get("playback") or {}
    lay = p.get("layout") or {}
    for v in p.get("videos") or []:
        print(f"  スマホ幅 {lay.get('innerW')}px: {v.get('file')} "
              f"{'再生できた' if v.get('played') else '!! 再生できない'}（{v.get('advanced')}秒進んだ・"
              f"{v.get('w')}x{v.get('h')}・幅 {(v.get('box') or {}).get('w')}px）")
    if lay:
        print(f"  横あふれ {'!! あり' if lay.get('scrollW', 0) > lay.get('innerW', 1) else 'なし'}"
              f"・JS エラー {len(p.get('errors') or [])}件"
              f"・絵 {dest / 'phone.jpg' if (dest / 'phone.jpg').is_file() else '無し'}")
    print(f"  ランナーの時間: {json.dumps(body.get('timing'), ensure_ascii=False)}")
    if not body.get("ok"):
        raise RuntimeError(f"ランナーの確かめで落ちた: {body.get('problems')}")
    return body


def up_gcs(a, files: list[Path], ents: list[dict], T: dict, t0: float) -> dict:
    nonce = secrets.token_hex(12)
    request(a, {"name": a.name, "place": "gcs", "action": "up", "files": ents,
                "pubkey": pubkey_of(Path(a.key)), "nonce": nonce})
    T["request"] = time.time() - t0
    print(f"依頼を出した（{a.via}・{T['request']:.0f}秒）。Actions の署名を待つ")
    sha, man = wait_result(a, nonce, a.timeout)
    T["signed"] = time.time() - t0
    body, run, _ = open_result(a, sha)
    if not body:
        raise RuntimeError(f"Actions で署名できなかった: {run.get('error')}\n  聞いた権限: "
                           f"{json.dumps(run.get('probe'), ensure_ascii=False)}")
    print(f"署名が来た（{T['signed']:.0f}秒）")
    ents_by = {e["name"]: e for e in body["files"]}
    local = {e["name"]: e["sha256"] for e in ents}
    with cf.ThreadPoolExecutor(len(files)) as ex:
        ups = dict(zip([f.name for f in files],
                       ex.map(lambda f: upload(f, ents_by[f.name]), files)))
    T["uploaded"] = time.time() - t0
    for n, u in ups.items():
        mb = u["bytes"] / 1e6
        print(f"  上げた {n}: HTTP {u['status']}  {mb:.1f}MB  {u['sec']}秒"
              f"（{mb / max(u['sec'], 0.1):.1f}MB/秒）")
    if any(u["status"] != 200 for u in ups.values()):
        raise RuntimeError("上げられなかったものがある")
    with cf.ThreadPoolExecutor(len(files)) as ex:
        downs = dict(zip(ents_by, ex.map(lambda n: download_sha(ents_by[n]["get"]), ents_by)))
    T["verified"] = time.time() - t0
    ng = []
    for f in files:
        st, h, n, sec = downs[f.name]
        plain = plain_status(ents_by[f.name]["plain"])
        same = st == 200 and h == local[f.name]
        private = plain in (401, 403)
        print(f"  確かめた {f.name}: 落とし直し HTTP {st} {n / 1e6:.1f}MB {sec:.1f}秒  sha256 "
              f"{'一致' if same else '不一致'}（{local[f.name][:8]}…）  署名なし HTTP {plain}"
              f"（{'非公開' if private else '!! 公開されている'}）")
        if not (same and private):
            ng.append(f.name)
    if ng:
        raise RuntimeError(f"確かめで落ちた: {ng}（URL の一覧は書かない）")
    return body


def cmd_up(a) -> int:
    files = [Path(f) for f in a.files]
    for f in files:
        if not f.is_file():
            print(f"!! ファイルが無い: {f}")
            return 1
    if len({f.name for f in files}) != len(files):
        print("!! 同じ名前のファイルが2つある（置き場ではファイル名で並べる）")
        return 1
    for p in (Path(a.out), Path(a.urls)):
        g = decrypt.inside_git(p if p.exists() else p.parent)
        if g:
            print(f"!! {p} はリポジトリ（{g}）の中。URL を置かないので断る")
            return 1
    Path(a.out).mkdir(parents=True, exist_ok=True)
    titles = dict(t.split("=", 1) for t in a.label or [])
    T: dict[str, float] = {}
    t0 = time.time()
    ents, meta = probe_files(files, titles)
    T["sha256"] = time.time() - t0
    try:
        body = (up_hosting(a, files, ents, meta, T, t0) if a.place == "hosting"
                else up_gcs(a, files, ents, T, t0))
    except (RuntimeError, TimeoutError) as e:
        print(f"!! {e}")
        return 1
    rows = [dict(e, get=next(x["get"] for x in body["files"] if x["name"] == e["name"]))
            for e in ents]
    write_urls(Path(a.urls), body, rows)
    T["done"] = time.time() - t0
    print(f"見る URL を書いた: {a.urls}（{len(rows)}本・{expires_jst(body):%m/%d %H:%M} JST まで）")
    cleanup_branch(a)
    T["total"] = time.time() - t0
    timing = {k: round(v, 1) for k, v in T.items()}
    timing.update(place=a.place, files=len(rows), bytes=sum(e["bytes"] for e in ents),
                  at=dt.datetime.now(JST).isoformat(), runner=body.get("timing"))
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
    if body.get("place") == "hosting":
        # 作業箱からは *.web.app に届かない（proxy が 403）。確かめはランナーが配った直後にやった
        print("hosting は作業箱から見に行けない。配った直後にランナーで確かめた結果:")
        for c in body.get("checks") or []:
            print(f"  {c['name']}: sha256 {'一致' if c['sha256_ok'] else '不一致'}"
                  f"  範囲 {c['range_status']}")
        print(f"  見られるのは {expires_jst(body):%Y-%m-%d %H:%M} JST まで")
        return 0 if body.get("ok") else 1
    bad = 0
    for e in body["files"]:
        r = requests.get(e["get"], headers={"Range": "bytes=0-0"}, timeout=30)
        plain = plain_status(e["plain"])
        ok = r.status_code in (200, 206) and plain in (401, 403)
        bad += 0 if ok else 1
        print(f"  {e['name']}: 見る URL HTTP {r.status_code}  署名なし HTTP {plain}"
              f"  {'OK' if ok else 'NG'}")
    return 1 if bad else 0


def list_name(a, verb: str) -> str:
    return a.name or f"pv-{verb}-{dt.datetime.now(JST):%Y%m%d-%H%M%S}-{secrets.token_hex(2)}"


def cmd_list(a) -> int:
    a.name = list_name(a, "list")
    nonce = secrets.token_hex(12)
    request(a, {"name": a.name, "place": "hosting", "action": "list", "files": [],
                "pubkey": pubkey_of(Path(a.key)), "nonce": nonce})
    print("数える依頼を出した。Actions を待つ")
    sha, _ = wait_result(a, nonce, a.timeout)
    res, run, dest = open_result(a, sha)
    cleanup_branch(a)
    if not res:
        print(f"!! 数えられなかった: {run.get('error')}")
        return 1
    known = json.loads(Path(a.known).read_text(encoding="utf-8")) if a.known else {}
    c = res["census"]
    print(f"チャンネル {c['all']}本（下見 {c['preview']}・ほか {c['other']}）  内訳 "
          f"{json.dumps(c['kinds'], ensure_ascii=False)}  上限 {c.get('cap')}")
    for r in res["channels"]:
        name = (r.get("labels") or {}).get("shorts-name") or (known.get(r["channel_sha256"]) or {}).get("name")
        print(f"  {r['channel_sha256'][:12]}  {'live' if r['live'] else '下見' if r['preview'] else 'ほか'}"
              f"  作った {str(r.get('create'))[:16]}  消える {str(r.get('expire') or '-')[:16]}"
              f"  {name or '（手元に記録なし）'}")
    print(f"一覧の全部: {dest / 'urls.json'}")
    return 0


def cmd_delete(a) -> int:
    import requests

    if a.sha256:
        # sha256 で指して消す（いくつでも）。チャンネル名は依頼（公開）に書かない
        a.name = list_name(a, "delete")
        nonce = secrets.token_hex(12)
        request(a, {"name": a.name, "place": "hosting", "action": "delete", "files": [],
                    "channel_sha256": a.sha256, "pubkey": pubkey_of(Path(a.key)), "nonce": nonce})
        print(f"{len(a.sha256)}本を消す依頼を出した。Actions を待つ")
        sha, _ = wait_result(a, nonce, a.timeout)
        res, run, _ = open_result(a, sha)
        cleanup_branch(a)
        if not res:
            print(f"!! 消せなかった: {run.get('error')}")
            return 1
        for r in res.get("results") or []:
            print(f"  {r['channel_sha256'][:12]}  "
                  f"{'消した' if r.get('deleted') else r.get('why', '消していない')}"
                  f"  そのあと HTTP {r.get('after_status', '-')}  {'404 を見た' if r.get('gone') else '!! まだ見える'}")
        return 0 if res.get("ok") else 1
    if not a.name:
        print("!! --name（up のときの名前）か --sha256 を渡す")
        return 1
    body = load_body(a)
    if body.get("place") == "hosting":
        # チャンネル名そのものは依頼（公開）に書かない。sha256 で指して、ランナーが一覧から探す
        if not a.key:
            print("!! hosting を消すには --key が要る（結果を開くため）")
            return 1
        nonce = secrets.token_hex(12)
        request(a, {"name": a.name, "place": "hosting", "action": "delete", "files": [],
                    "channel_sha256": body["channel_sha256"],
                    "pubkey": pubkey_of(Path(a.key)), "nonce": nonce})
        print("消す依頼を出した。Actions を待つ")
        sha, _ = wait_result(a, nonce, a.timeout)
        res, run, _ = open_result(a, sha)
        cleanup_branch(a)
        if not res:
            print(f"!! 消せなかった: {run.get('error')}")
            return 1
        print("チャンネルを消した" if res.get("deleted") else "もう無かった（期限で消えたか、消し済み）")
        return 0
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
    for name in ("up", "check", "delete", "list"):
        p = sub.add_parser(name)
        p.add_argument("--name", required=name in ("up", "check"), help="下見の名前（英数字と . _ -）")
        p.add_argument("--out", required=True, help="開いた URL を置く場所（リポジトリの外）")
        if name in ("up", "delete", "list"):
            p.add_argument("--key", required=name in ("up", "list"), help="RSA 秘密鍵（PEM）")
            p.add_argument("--branch", default=BRANCH, help="依頼と結果を置く作業枝（claude/…）")
            p.add_argument("--via", choices=("push", "dispatch"), default="push",
                           help="push＝依頼ファイルを作業枝に置く / dispatch＝master のワークフローを起こす")
            p.add_argument("--timeout", type=float, default=900)
            p.add_argument("--keep-branch", action="store_true", help="作業枝の暗号文を残す")
        if name == "delete":
            p.add_argument("--sha256", action="append", default=[],
                           help="消すチャンネル名の sha256（64桁。いくつも渡せる。put.py list で見る）")
        if name == "list":
            p.add_argument("--known", default="", help="sha256 → {name} の json（手元の記録。名前を添えるだけ）")
        if name == "up":
            p.add_argument("--urls", required=True, help="見る URL の一覧を書くファイル（リポジトリの外）")
            p.add_argument("--place", choices=("hosting", "gcs"), default="hosting",
                           help="hosting＝プレビューチャンネル（いまの既定）/ gcs＝非公開バケットの署名付き URL（速い・ページ無し）")
            p.add_argument("--title", default="", help="ページの見出し（無ければ「下見 <name>」）")
            p.add_argument("--label", action="append",
                           help="動画の題 NAME=題（無ければ同じフォルダの post_<名前>.json の題）")
            p.add_argument("files", nargs="+")
    a = ap.parse_args()
    if a.cmd in ("up", "delete", "list") and not a.branch.startswith("claude/"):
        print("!! 作業枝は claude/ で始まる名前にする")
        return 1
    return {"up": cmd_up, "check": cmd_check, "delete": cmd_delete, "list": cmd_list}[a.cmd](a)


if __name__ == "__main__":
    sys.exit(main())
