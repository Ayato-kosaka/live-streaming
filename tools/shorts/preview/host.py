"""下見を Firebase Hosting のプレビューチャンネルに置く（Actions 側。`serve.py` から呼ぶ）。

## なぜ Hosting か

GCS の署名付き URL が本命だが、Actions のサービスアカウントに Storage の権限が無い
（`gcs.py` の頭）。**Hosting のチャンネルへ配る権限はある**（本番の配りに同じ鍵を使っている）。
プレビューチャンネルは**決めた日数で消える**（ここでは7日）。URL を知っていれば誰でも見られるが、
あやとは「パブリックバケットでもよい」「動画のレビューは非公開に無理にする必要ない」（2026-10-16）。
チャンネル名に乱数（80bit）を使い、noindex を付ける。URL は暗号化して作業枝に返し
（リポジトリに平文で積まない）、ログにも出さない。制作 issue には貼ってよい。

**本番のサイト（live チャンネル）には触らない。** 配るのは `hosting:channel:deploy` だけで、
チャンネル名は `sp-<乱数>` の形しか通さない。本番の firebase.json・public は使わず、
ランナーの一時の場所に「下見の動画と1枚のページ」と一時の設定だけを置いて配る。

## 作業箱 → ランナー（動画の受け渡し）

作業箱から Hosting にも Actions のキャッシュにも届かない。届くのは git だけ。
**このランナーがその場で作った鍵**で包んでもらう:

1. ここで RSA 鍵を作り、公開鍵を作業枝の `shorts/.work/preview/<name>/inbox.json` に置く
2. 作業箱がその公開鍵で動画を包んで `…/<name>/upload/` に積む（`seal.py` の形・45MB ずつ）
3. ここで開き、依頼の sha256 と突き合わせてから配る。**秘密鍵はランナーと一緒に消える**
   （長く生きる鍵で公開の履歴を守らない）。積んだ暗号文は、結果を置く commit で下ろす

## 配ったあとに見ること（ランナーから。作業箱からは *.web.app に届かない）

- ファイルごとに URL から落とし直して、sha256 が依頼と一致する
- 範囲の要求（Range）に 206 で返る（iPhone の Safari は範囲で読む）
- スマホの幅（390px）のヘッドレスの Chrome でページを開き、動画が全部再生できる・横にあふれない
  （`playcheck.mjs`。撮った絵は暗号化した結果にだけ入れる）
"""

from __future__ import annotations

import datetime as dt
import hashlib
import html
import json
import os
import re
import secrets
import shutil
import subprocess
import time
from pathlib import Path

import branch as br
import decrypt
from req import Bad, norm_pem

HERE = Path(__file__).resolve().parent
PROJECT = SITE = "live-streaming-d3cac"
EXPIRES = "7d"
# 本番の配り（firebase-hosting-deploy-prod.yml）と同じ大きな版にそろえる
FIREBASE_TOOLS = "firebase-tools@13"
# 確認の道具（tools/sprites）と同じ版。ブラウザはランナーにある Google Chrome を使う
# （Playwright の Chromium は H.264 を再生できない）
PLAYWRIGHT = "playwright-core@1.56.0"
CHROME = "/usr/bin/google-chrome"
CHANNEL = re.compile(r"^sp-[0-9a-f]{20}$")
UPLOAD_WAIT = 1200


def keypair(d: Path) -> tuple[Path, str, str]:
    d.mkdir(parents=True, exist_ok=True)
    priv = d / "inbox.pem"
    subprocess.run(["openssl", "genpkey", "-algorithm", "RSA", "-pkeyopt", "rsa_keygen_bits:3072",
                    "-out", str(priv)], check=True, capture_output=True)
    os.chmod(priv, 0o600)
    pub = subprocess.run(["openssl", "pkey", "-in", str(priv), "-pubout"], check=True,
                         capture_output=True, text=True).stdout
    pem, fp = norm_pem(pub)
    return priv, pem, fp


def prewarm(tools: Path) -> subprocess.Popen:
    """firebase-tools と playwright-core を、作業箱の荷物を待つあいだに入れておく。"""
    tools.mkdir(parents=True, exist_ok=True)
    log = open(tools / "npm.log", "w")
    return subprocess.Popen(["npm", "install", "--prefix", str(tools), "--no-audit", "--no-fund",
                             "--loglevel=error", FIREBASE_TOOLS, PLAYWRIGHT],
                            stdout=log, stderr=subprocess.STDOUT)


def sha256_file(p: Path) -> str:
    h = hashlib.sha256()
    with open(p, "rb") as f:
        for b in iter(lambda: f.read(1 << 20), b""):
            h.update(b)
    return h.hexdigest()


def receive(req: dict, branch: str, priv: Path, fp: str, tmp: Path) -> tuple[Path, dict]:
    name = req["name"]
    rel = f"shorts/.work/preview/{name}/upload"
    sha, _ = br.wait_json(branch, f"{rel}/manifest.json",
                          lambda d: d.get("nonce") == req["nonce"], UPLOAD_WAIT)
    raw = tmp / "raw"
    raw.mkdir(parents=True, exist_ok=True)
    d = br.extract(sha, rel, raw)
    inbox = tmp / "in"
    inbox.mkdir(parents=True, exist_ok=True)
    ok, why = decrypt.open_one(d, priv, fp, inbox)
    shutil.rmtree(raw, ignore_errors=True)
    if not ok:
        raise Bad(f"作業箱の荷物を開けない（{why.split('  ')[0][:80]}）")
    got = inbox / f"preview-in/{name}"
    bad = []
    for f in req["files"]:
        p = got / f["name"]
        if not p.is_file():
            bad.append(f"{f['name']} が無い")
        elif p.stat().st_size != f["bytes"] or sha256_file(p) != f["sha256"]:
            bad.append(f"{f['name']} の大きさか sha256 が依頼と違う")
    if bad:
        raise Bad("受け取ったものが依頼と合わない: " + " / ".join(bad))
    meta_p = got / "meta.json"
    meta = json.loads(meta_p.read_text(encoding="utf-8")) if meta_p.is_file() else {}
    return got, meta


def fmt_sec(s) -> str:
    try:
        s = float(s)
    except (TypeError, ValueError):
        return ""
    return f"{int(s // 60)}:{int(round(s % 60)):02d}" if s >= 60 else f"{s:.0f}秒"


def page_html(req: dict, meta: dict) -> str:
    """動画を並べるだけのページ。題・長さ・<video playsinline controls>。"""
    items = {i.get("name"): i for i in meta.get("items") or []}
    title = html.escape(meta.get("title") or f"下見 {req['name']}")
    out = ['<!doctype html><html lang="ja"><head><meta charset="utf-8">',
           '<meta name="viewport" content="width=device-width,initial-scale=1">',
           '<meta name="robots" content="noindex,nofollow,noarchive">',
           '<meta name="referrer" content="no-referrer">',
           f"<title>{title}</title><style>",
           "html,body{margin:0;background:#111;color:#eee}",
           'body{font-family:-apple-system,"Hiragino Sans","Noto Sans JP",system-ui,sans-serif}',
           "main{max-width:480px;margin:0 auto;padding:16px 16px 40px;box-sizing:border-box}",
           "h1{font-size:17px;margin:4px 0 18px;font-weight:700}",
           "section{margin:0 0 32px}",
           "h2{font-size:16px;line-height:1.45;margin:0 0 4px;font-weight:700}",
           "p{margin:0 0 10px;color:#aaa;font-size:13px}",
           "video{display:block;width:100%;height:auto;aspect-ratio:9/16;background:#000;"
           "border-radius:10px}",
           "</style></head><body><main>", f"<h1>{title}</h1>"]
    for f in req["files"]:
        name = f["name"]
        if not name.lower().endswith((".mp4", ".mov", ".m4v", ".webm")):
            continue
        it = items.get(name, {})
        label = html.escape(it.get("label") or Path(name).stem)
        head = html.escape(it.get("title") or "")
        dur = fmt_sec(it.get("duration"))
        src = html.escape(name)
        out.append(f"<section><h2>{label}{'　' + head if head else ''}</h2>"
                   f"{'<p>' + dur + '</p>' if dur else ''}"
                   # `#t=0.001` は iPhone で最初のコマを見せるため（無いと黒い四角のまま）
                   f'<video src="{src}#t=0.001" controls playsinline preload="metadata"></video>'
                   "</section>")
    out.append("</main></body></html>")
    return "\n".join(out) + "\n"


def make_site(req: dict, got: Path, meta: dict, tmp: Path) -> Path:
    site = tmp / "site"
    pub = site / "public"
    pub.mkdir(parents=True, exist_ok=True)
    for f in req["files"]:
        dst = pub / f["name"]
        dst.parent.mkdir(parents=True, exist_ok=True)
        os.replace(got / f["name"], dst)
    (pub / "index.html").write_text(page_html(req, meta), encoding="utf-8")
    # 一時の設定。本番の firebase.json（書き換え・転送の決まり）は持ち込まない
    (site / "firebase.json").write_text(json.dumps({"hosting": {
        "site": SITE, "public": "public",
        "headers": [{"source": "**", "headers": [
            {"key": "X-Robots-Tag", "value": "noindex, nofollow, noarchive"},
            {"key": "Referrer-Policy", "value": "no-referrer"}]}]}}, indent=1), encoding="utf-8")
    return site


def firebase(tools: Path, args: list[str], cwd: Path, log: Path) -> dict:
    """firebase-tools を --json で回す。**出力はファイルにだけ受ける**（URL が混ざるので）。"""
    exe = tools / "node_modules/.bin/firebase"
    env = dict(os.environ, NO_UPDATE_NOTIFIER="1", FIREBASE_CLI_EXPERIMENTS="")
    with open(log, "w") as fe:
        r = subprocess.run([str(exe), *args, "--project", PROJECT, "--json", "--non-interactive"],
                           cwd=cwd, env=env, stdout=subprocess.PIPE, stderr=fe, text=True)
    try:
        d = json.loads(r.stdout or "{}")
    except json.JSONDecodeError:
        d = {}
    if r.returncode != 0 or d.get("status") != "success":
        raise Bad(f"firebase {args[0]} が通らなかった（終了 {r.returncode}）")
    return d


def find_url(d) -> tuple[str, str]:
    if isinstance(d, dict):
        if isinstance(d.get("url"), str) and d["url"].startswith("https://"):
            return d["url"].rstrip("/"), d.get("expireTime", "")
        for v in d.values():
            u = find_url(v)
            if u[0]:
                return u
    return "", ""


def verify_http(url: str, req: dict) -> list[dict]:
    import requests

    out = []
    for f in req["files"]:
        u = f"{url}/{f['name']}"
        h = hashlib.sha256()
        n = 0
        t0 = time.time()
        with requests.get(u, stream=True, timeout=(30, 600)) as r:
            st = r.status_code
            if st == 200:
                for b in r.iter_content(1 << 20):
                    h.update(b)
                    n += len(b)
        sec = time.time() - t0
        rg = requests.get(u, headers={"Range": "bytes=0-1"}, timeout=30)
        out.append({"name": f["name"], "status": st, "bytes": n, "sec": round(sec, 1),
                    "sha256_ok": st == 200 and h.hexdigest() == f["sha256"],
                    "range_status": rg.status_code,
                    "noindex": "noindex" in rg.headers.get("x-robots-tag", "")})
    return out


def playback(url: str, tools: Path, tmp: Path) -> dict:
    shots = tmp / "shots"
    shots.mkdir(parents=True, exist_ok=True)
    env = dict(os.environ, NODE_PATH=str(tools / "node_modules"), CHROME=CHROME)
    # playwright-core を tools から引けるよう、道具を tools の隣に写してから回す
    script = tools / "playcheck.mjs"
    shutil.copy(HERE / "playcheck.mjs", script)
    r = subprocess.run(["node", str(script), url + "/", str(shots)], env=env, cwd=tools,
                       capture_output=True, text=True, timeout=240)
    try:
        d = json.loads((r.stdout or "").strip().splitlines()[-1])
    except (json.JSONDecodeError, IndexError):
        d = {"error": f"playcheck が結果を返さなかった（終了 {r.returncode}）"}
    d["shot"] = str(shots / "phone.jpg") if (shots / "phone.jpg").is_file() else None
    return d


def summarize_play(p: dict) -> str:
    vids = p.get("videos") or []
    ok = sum(1 for v in vids if v.get("played"))
    lay = p.get("layout") or {}
    over = lay.get("scrollW", 0) > lay.get("innerW", 1)
    return (f"スマホ幅 {lay.get('innerW', '?')}px で {ok}/{len(vids)}本 再生"
            f"・横あふれ {'あり' if over else 'なし'}・JS エラー {len(p.get('errors') or [])}件")


def up(req: dict, branch: str, tmp: Path) -> tuple[dict, list[Path]]:
    """(urls.json の中身, 結果に添えるファイル)。"""
    T: dict[str, float] = {}
    t0 = time.time()
    tools = tmp / "tools"
    npm = prewarm(tools)
    priv, pem, fp = keypair(tmp / "keys")
    br.push_change(branch, {f"shorts/.work/preview/{req['name']}/inbox.json": (json.dumps(
        {"nonce": req["nonce"], "pubkey": pem, "pubkey_sha256": fp,
         "run": os.environ.get("RUN_URL")}, indent=1) + "\n").encode()}, [],
        f"ショートの下見 {req['name']} の受け取り口を開く\n\n"
        "作業箱が動画を包むための公開鍵（このランナーがその場で作ったもの）。"
        "秘密鍵はランナーと一緒に消える。")
    T["inbox"] = time.time() - t0
    print(f"  受け取り口を開いた（{T['inbox']:.0f}秒）。作業箱の荷物を待つ")
    got, meta = receive(req, branch, priv, fp, tmp)
    priv.unlink()
    T["received"] = time.time() - t0
    print(f"  受け取った（{T['received']:.0f}秒）。{len(req['files'])}本とも sha256 が依頼と一致")
    site = make_site(req, got, meta, tmp)
    if npm.wait() != 0:
        raise Bad("firebase-tools / playwright-core を入れられなかった")
    T["tools"] = time.time() - t0
    channel = "sp-" + secrets.token_hex(10)
    assert CHANNEL.match(channel) and channel != "live"
    d = firebase(tools, ["hosting:channel:deploy", channel, "--expires", EXPIRES], site,
                 tmp / "deploy.log")
    url, expire = find_url(d.get("result"))
    if not url:
        raise Bad("配ったが URL が返ってこなかった")
    T["deployed"] = time.time() - t0
    print(f"  チャンネルに配った（{T['deployed']:.0f}秒・{EXPIRES}で消える）")
    checks = verify_http(url, req)
    T["verified"] = time.time() - t0
    for c in checks:
        print(f"  落とし直し {c['name']}: HTTP {c['status']} {c['bytes'] / 1e6:.1f}MB {c['sec']}秒"
              f"  sha256 {'一致' if c['sha256_ok'] else '!! 不一致'}  範囲 {c['range_status']}"
              f"  noindex {'○' if c['noindex'] else '✕'}")
    play = playback(url, tools, tmp)
    T["played"] = time.time() - t0
    print(f"  {summarize_play(play) if 'videos' in play else play.get('error')}")
    shot = Path(play.pop("shot")) if play.get("shot") else None
    bad = [c["name"] for c in checks if not (c["sha256_ok"] and c["range_status"] == 206)]
    vids = play.get("videos") or []
    n_vid = sum(1 for f in req["files"] if f["name"].lower().endswith((".mp4", ".mov", ".m4v")))
    if len([v for v in vids if v.get("played")]) < n_vid:
        bad.append("スマホ幅で再生できないものがある")
    body = {"format": "shorts-preview/1", "place": "hosting", "name": req["name"],
            "channel": channel, "channel_sha256": hashlib.sha256(channel.encode()).hexdigest(),
            "page": url + "/", "get_expires": expire or (
                dt.datetime.now(dt.timezone.utc) + dt.timedelta(days=7)).isoformat(),
            "files": [dict(f, get=f"{url}/{f['name']}") for f in req["files"]],
            "checks": checks, "playback": play, "ok": not bad, "problems": bad,
            "timing": {k: round(v, 1) for k, v in T.items()}}
    return body, [shot] if shot else []


def delete(req: dict, tmp: Path) -> tuple[dict, list[Path]]:
    tools = tmp / "tools"
    if prewarm(tools).wait() != 0:
        raise Bad("firebase-tools を入れられなかった")
    site = tmp / "empty"
    site.mkdir(parents=True, exist_ok=True)
    (site / "firebase.json").write_text('{"hosting": {"site": "%s", "public": "."}}' % SITE)
    d = firebase(tools, ["hosting:channel:list", "--site", SITE], site, tmp / "list.log")
    chans = (d.get("result") or {}).get("channels") or []
    hit = None
    for c in chans:
        cid = str(c.get("name", "")).rsplit("/", 1)[-1]
        if hashlib.sha256(cid.encode()).hexdigest() == req["channel_sha256"]:
            hit = (cid, c.get("url", ""))
    if not hit:
        print("  そのチャンネルはもう無い（期限で消えたか、消し済み）")
        return {"format": "shorts-preview/1", "place": "hosting", "name": req["name"],
                "deleted": False, "gone": True}, []
    cid, url = hit
    if not CHANNEL.match(cid):
        raise Bad("下見のチャンネルの形ではないので消さない")
    firebase(tools, ["hosting:channel:delete", cid, "--site", SITE, "--force"], site,
             tmp / "delete.log")
    # 消したあと、ページが本当に開けなくなったかを見る（CDN に残っているあいだは 200 が返りうる）
    import requests

    st, t0 = 0, time.time()
    while url and time.time() - t0 < 120:
        st = requests.get(url, timeout=30).status_code
        if st == 404:
            break
        time.sleep(10)
    print(f"  チャンネルを消した（そのあとページは HTTP {st}・{time.time() - t0:.0f}秒）")
    return {"format": "shorts-preview/1", "place": "hosting", "name": req["name"],
            "deleted": True, "gone": st == 404, "after_status": st, "page": url}, []
