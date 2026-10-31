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
import channels as ch
import decrypt
from req import Bad, norm_pem

HERE = Path(__file__).resolve().parent
PROJECT = SITE = "live-streaming-d3cac"
# 寿命は名前で決める（下書きは1日。`channels.expires_for`）。これは本番の版の寿命
EXPIRES = ch.EXPIRES["final"]
# 本番の配り（firebase-hosting-deploy-prod.yml）と同じ大きな版にそろえる
FIREBASE_TOOLS = "firebase-tools@13"
# 確認の道具（tools/sprites）と同じ版。ブラウザはランナーにある Google Chrome を使う
# （Playwright の Chromium は H.264 を再生できない）
PLAYWRIGHT = "playwright-core@1.56.0"
CHROME = "/usr/bin/google-chrome"
CHANNEL = ch.CHANNEL
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
        # 理由の字は、秘密（URL・チャンネル名・アカウント・トークン）を伏せてからログと結果に出す。
        # 2026-10-31 に両方の道で続けて落ちたとき、ここが「終了 1」だけで、原因を字で言えなかった
        why = ch.error_of(r.stdout, log.read_text(encoding="utf-8", errors="replace"))
        raise Bad(f"firebase {args[0]} が通らなかった（終了 {r.returncode}）: {why or '理由の字が無い'}")
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


def place(tools: Path, site: Path, name: str, log: Path, api=None) -> dict:
    """片づけてから、新しいチャンネルに配って札を付ける（2つの道で同じ形。`channels.py` の頭）。

    返すのは channel・url・expire・expires（`7d` / 下書きは `1d`）・tidy（片づけの数）・labelled。
    片づけと札が落ちても配りは続ける。配りが上限で落ちたら、そのときの数を字に添える。
    """
    try:
        api = api or ch.Api()
    except Exception as e:  # noqa: BLE001  資格情報が読めなくても、配りは firebase-tools が別に読む
        api, tidy = None, {"error": type(e).__name__}
    else:
        try:
            tidy = ch.tidy(api)
        except Exception as e:  # noqa: BLE001  片づけられなくても、空きがあれば配れる
            tidy = {"error": type(e).__name__}
    if "error" in tidy:
        print(f"  ::warning::配る前の片づけができなかった（{tidy['error']}）。そのまま配る")
    else:
        print(f"  配る前のチャンネル {tidy['before']}本（上限 {tidy['cap']}）。期限切れ {tidy['dead']}本"
              f"・空けるために {len(tidy['room'])}本を消して {tidy['after']}本"
              + (f"・消せなかった {tidy['failed']}本" if tidy["failed"] else ""))
    channel = "sp-" + secrets.token_hex(10)
    assert CHANNEL.match(channel) and channel != "live"
    expires = ch.expires_for(name)
    try:
        d = firebase(tools, ["hosting:channel:deploy", channel, "--expires", expires], site, log)
    except Bad as e:
        if "quota" in str(e) and "error" not in tidy:
            raise Bad(f"{e}（配る前 {tidy['after']}本・上限 {tidy['cap']}。消してよいもの"
                      "（期限切れ・下書き・同じ回の古い版）が無かった）") from None
        raise
    url, expire = find_url(d.get("result"))
    if not url:
        raise Bad("配ったが URL が返ってこなかった")
    labelled = False
    if api is not None:
        try:
            api.label(channel, ch.labels_for(name))
            labelled = True
        except Exception as e:  # noqa: BLE001  札が無くても見られる。片づけの対象にならないだけ
            print(f"  ::warning::札を付けられなかった（{type(e).__name__}）。このチャンネルは期限まで残る")
    return {"channel": channel, "url": url, "expire": expire, "expires": expires, "tidy": tidy,
            "labelled": labelled, "api": api}


def settle(placed: dict, name: str, ok: bool) -> dict:
    """確かめが通ったら、同じ回の古い版を消す。落ちた版は前の版を消さない（見られるものを残す）。"""
    if not ok:
        print("  確かめで落ちたので、同じ回の前の版は消さない")
        return {"retired": [], "failed": 0, "skipped": "確かめで落ちた"}
    if placed.get("api") is None or not placed.get("labelled"):
        return {"retired": [], "failed": 0, "skipped": "札が無い"}
    try:
        r = ch.retire(placed["api"], name, placed["channel"])
    except Exception as e:  # noqa: BLE001  古い版は7日で消える。新しい版は配れている
        print(f"  ::warning::同じ回の古い版を片づけられなかった（{type(e).__name__}）")
        return {"retired": [], "failed": 0, "error": type(e).__name__}
    print(f"  同じ回の古い版を {len(r['retired'])}本消した"
          + (f"（{', '.join(r['retired'])}）" if r["retired"] else "")
          + (f"・消せなかった {r['failed']}本" if r["failed"] else ""))
    return r


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
    placed = place(tools, site, req["name"], tmp / "deploy.log")
    channel, url, expire = placed["channel"], placed["url"], placed["expire"]
    T["deployed"] = time.time() - t0
    print(f"  チャンネルに配った（{T['deployed']:.0f}秒・{placed['expires']}で消える"
          f"・札 {'○' if placed['labelled'] else '✕'}）")
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
    settled = settle(placed, req["name"], not bad)
    body = {"format": "shorts-preview/1", "place": "hosting", "name": req["name"],
            "channel": channel, "channel_sha256": hashlib.sha256(channel.encode()).hexdigest(),
            "page": url + "/", "get_expires": expire or (
                dt.datetime.now(dt.timezone.utc) + dt.timedelta(days=7)).isoformat(),
            "files": [dict(f, get=f"{url}/{f['name']}") for f in req["files"]],
            "checks": checks, "playback": play, "ok": not bad, "problems": bad,
            "channels": {"tidy": placed["tidy"], "labelled": placed["labelled"], "retire": settled},
            "timing": {k: round(v, 1) for k, v in T.items()}}
    return body, [shot] if shot else []


def gone_after(urls: list[str], limit: float = 120) -> dict[str, int]:
    """消したチャンネルのページが 404 になるまで見る（CDN に残っているあいだは 200 が返りうる）。"""
    import requests

    st = {u: 0 for u in urls if u}
    t0 = time.time()
    while st and time.time() - t0 < limit:
        for u in [u for u, v in st.items() if v != 404]:
            try:
                st[u] = requests.get(u, timeout=30).status_code
            except requests.RequestException:
                st[u] = -1
        if all(v == 404 for v in st.values()):
            break
        time.sleep(10)
    return st


def delete(req: dict, tmp: Path) -> tuple[dict, list[Path]]:
    """sha256 で指したチャンネルを消す（依頼にはチャンネル名を書かない。一覧から探す）。

    1つ（字）でも、いくつも（並び）でも受ける。firebase-tools は入れない（REST で一覧・消す）。
    """
    want = req["channel_sha256"]
    many = isinstance(want, list)
    want = want if many else [want]
    api = ch.Api()
    chans = api.list()
    by = {ch.sha(ch.cid(c)): c for c in chans}
    rows, urls = [], []
    for w in want:
        c = by.get(w)
        if c is None:
            rows.append({"channel_sha256": w, "deleted": False, "gone": True, "why": "もう無い"})
            continue
        if not ch.is_preview(c):
            rows.append({"channel_sha256": w, "deleted": False, "gone": False,
                         "why": "下見のチャンネルの形ではないので消さない"})
            continue
        api.delete(ch.cid(c))
        rows.append({"channel_sha256": w, "deleted": True, "page": c.get("url", "")})
        urls.append(c.get("url", ""))
    st = gone_after(urls)
    for r in rows:
        if r.get("deleted"):
            r["after_status"] = st.get(r["page"], 0)
            r["gone"] = r["after_status"] == 404
    n_del = sum(1 for r in rows if r.get("deleted"))
    n_gone = sum(1 for r in rows if r.get("gone"))
    n_refused = sum(1 for r in rows if not r.get("deleted") and not r.get("gone"))
    print(f"  {len(want)}本を頼まれて、{n_del}本を消した（もう無かった {len(want) - n_del - n_refused}本・"
          f"断った {n_refused}本）。そのあとページが 404 になったもの {n_gone}本"
          f"（一覧は {len(chans)} → {len(chans) - n_del}本）")
    body = {"format": "shorts-preview/1", "place": "hosting", "name": req["name"],
            "results": rows, "census_before": ch.census(chans)}
    if not many:
        # 1つのときは今までの形（put.py delete が読む）
        r = rows[0]
        body.update(deleted=r.get("deleted", False), gone=r.get("gone", False),
                    after_status=r.get("after_status"), page=r.get("page"))
    body["ok"] = n_refused == 0 and all(r.get("gone") for r in rows)
    return body, []


def listing(req: dict) -> tuple[dict, list[Path]]:
    """チャンネルを数える。ログには数だけ、暗号化した結果には1本ずつ（sha256・時刻・札）。"""
    chans = ch.Api().list()
    c = ch.census(chans)
    kinds = "・".join(f"{k} {v}" for k, v in sorted(c["kinds"].items())) or "なし"
    print(f"  チャンネル {c['all']}本（下見 {c['preview']}・ほか {c['other']}。下見の内訳: {kinds}。"
          f"1日以内に消える {c['expire_within_1d']}本。上限 {c['cap'] or '未設定'}）")
    return {"format": "shorts-preview/1", "place": "hosting", "name": req["name"], "census": c,
            "channels": [ch.row(x) for x in sorted(chans, key=lambda x: x.get("createTime", ""))]}, []
