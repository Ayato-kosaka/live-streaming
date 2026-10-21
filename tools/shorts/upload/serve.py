"""録画を受け取るページを作る・届いたものを ffprobe で見る（Actions の入口）。

    python3 tools/shorts/upload/serve.py plan    # 依頼を読んで、要る道具を GITHUB_OUTPUT に書く
    python3 tools/shorts/upload/serve.py run     # 依頼をこなして、結果を暗号化して作業枝へ返す

`.github/workflows/shorts_upload.yml` から呼ぶ。依頼は作業枝の `shorts/upload/<name>.json`
（作業箱の `ask.py` が積む）か workflow_dispatch の入力。

| action | すること |
| --- | --- |
| `page` | 枠を署名し、1枚のページをプレビューチャンネル（7日）に配り、CORS と寿命の決まりをそろえ、ブラウザと同じ要求で上げてみる。ページの URL を返す |
| `probe` | `uploads/<name>/` に届いた録画を、署名付き URL のまま ffprobe で読み、落とし直して sha256 を出す |
| `drop` | `uploads/<name>/` を消す（消さなくても30日で消える） |
| `drive` | 共有フォルダ（リンクで閲覧可）を落とし、書き出しに渡せる形に揃えて `uploads/<name>/` に置き、署名付き GET（3日）とコマ一覧を返す（`drive.py`） |

結果は依頼の公開鍵で包み（`tools/shorts/ingest/seal.py` の形）、作業枝の
`shorts/.work/upload/<name>/<action>/` に置く。**同じ commit で依頼ファイルを下ろす。**
ログに出すのは、名前・数・秒・成否・権限の ○/✕ だけ。URL とファイル名は出さない。
"""

from __future__ import annotations

import datetime as dt
import json
import os
import re
import secrets
import shutil
import sys
import tempfile
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE.parent / "preview"))
sys.path.insert(0, str(HERE.parent / "ingest"))
import branch as br  # noqa: E402
import seal  # noqa: E402
from req import Bad, compare_files, norm_pem, out_branch  # noqa: E402

ROOT = HERE.parents[2]
REQ_DIR = "shorts/upload/"
ACTIONS = ("page", "probe", "drop", "drive", "cas")
NAME = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$")
RETRIES = 8
STALL_MS = 60_000


# ---------------------------------------------------------------- 依頼

def read_request(req: dict, origin: str) -> dict:
    name = str(req.get("name") or "")
    if not NAME.match(name):
        raise Bad(f"{origin}: name の形が違う: {name!r}（英数字と . _ - で64字まで）")
    action = req.get("action") or "page"
    if action not in ACTIONS:
        raise Bad(f"{origin}: action は {ACTIONS} のどれか")
    pem, fp = norm_pem(req.get("pubkey", ""))
    nonce = str(req.get("nonce") or "")
    if not re.match(r"^[A-Za-z0-9_-]{8,64}$", nonce):
        raise Bad(f"{origin}: nonce が無い・形が違う")
    slots = req.get("slots", 12)
    if not isinstance(slots, int) or not 1 <= slots <= 30:
        raise Bad(f"{origin}: slots は 1〜30")
    want_hash = req.get("hash", True)
    if isinstance(want_hash, str):
        want_hash = want_hash.lower() not in ("false", "0", "no", "")
    folder = str(req.get("folder") or "")
    if action == "drive":
        import drive

        if not drive.FOLDER.match(folder):
            raise Bad(f"{origin}: drive には folder（共有フォルダの ID）が要る")
    shas = req.get("sha256") or []
    if action == "cas" and (not isinstance(shas, list) or not 1 <= len(shas) <= 300
                            or not all(re.match(r"^[0-9a-f]{64}$", str(x)) for x in shas)):
        raise Bad(f"{origin}: cas には sha256 の並び（1〜300）が要る")
    return {"name": name, "action": action, "pubkey": pem, "pubkey_sha256": fp, "nonce": nonce,
            "slots": slots, "hash": bool(want_hash), "req": origin, "folder": folder, "sha256": shas}


def requests_now() -> list[dict]:
    g = os.environ.get
    if g("GITHUB_EVENT_NAME") == "workflow_dispatch":
        return [read_request({"name": g("IN_NAME", ""), "action": g("IN_ACTION", ""),
                              "pubkey": g("IN_PUBKEY", ""), "nonce": g("IN_NONCE", ""),
                              "hash": g("IN_HASH", "true"), "slots": int(g("IN_SLOTS") or 12)},
                             "workflow_dispatch")]
    ev = json.loads(Path(os.environ["GITHUB_EVENT_PATH"]).read_text(encoding="utf-8"))
    before = ev.get("before") or ""
    head = ev.get("after") or os.environ.get("GITHUB_SHA", "")
    if not before.strip("0"):
        before = (ev.get("repository") or {}).get("default_branch") or "master"
    files = [f for f in compare_files(before, head)
             if f.startswith(REQ_DIR) and f.endswith(".json") and f.count("/") == 2
             and (ROOT / f).is_file()]
    print(f"この push で来た依頼: {len(files)}件")
    return [read_request(json.loads((ROOT / f).read_text(encoding="utf-8")), f) for f in files]


# ---------------------------------------------------------------- page

def page_html(cfg: dict) -> str:
    tpl = (HERE / "page.html").read_text(encoding="utf-8")
    # <script type="application/json"> の中に置くので、`</` だけ崩す（署名付き URL に `<` は出ない）
    body = json.dumps(cfg, ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/")
    assert "__CONFIG__" in tpl
    return tpl.replace("__CONFIG__", body)


CSP = ("default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; "
       "connect-src https://storage.googleapis.com; img-src data:; base-uri 'none'; "
       "form-action 'none'; frame-ancestors 'none'")


def make_site(cfg: dict, tmp: Path) -> Path:
    site = tmp / "site"
    pub = site / "public"
    pub.mkdir(parents=True, exist_ok=True)
    (pub / "index.html").write_text(page_html(cfg), encoding="utf-8")
    # 一時の設定。本番の firebase.json（書き換え・転送の決まり）は持ち込まない。
    # ページに署名付き URL が入っているので、どこにも溜めない（no-store）
    import host

    (site / "firebase.json").write_text(json.dumps({"hosting": {
        "site": host.SITE, "public": "public",
        "headers": [{"source": "**", "headers": [
            {"key": "X-Robots-Tag", "value": "noindex, nofollow, noarchive"},
            {"key": "Referrer-Policy", "value": "no-referrer"},
            {"key": "Cache-Control", "value": "no-store"},
            {"key": "Content-Security-Policy", "value": CSP}]}]}}, indent=1), encoding="utf-8")
    return site


def check_page(url: str) -> dict:
    import requests

    r = requests.get(url, timeout=30)
    return {"status": r.status_code, "has_config": '"slots":[{' in r.text,
            "noindex": "noindex" in r.headers.get("x-robots-tag", ""),
            "csp": "connect-src https://storage.googleapis.com" in r.headers.get(
                "content-security-policy", ""),
            "no_store": "no-store" in r.headers.get("cache-control", "")}


def do_page(req: dict, tmp: Path) -> dict:
    import gcs
    import host
    import store

    T: dict[str, float] = {}
    t0 = time.time()
    tools = tmp / "tools"
    npm = host.prewarm(tools)
    client, creds = gcs.client_and_creds()
    bucket_name, perms = gcs.choose_bucket(client, creds)
    if "storage.buckets.update" not in (perms.get("bucket") or []):
        raise Bad("storage.buckets.update が無い（CORS と寿命の決まりを書けない）")
    b = client.bucket(bucket_name)
    life = store.ensure_lifecycle(b)
    prefix, slots, expires = store.sign_slots(b, req["name"], req["slots"])
    T["signed"] = time.time() - t0
    print(f"  枠を {len(slots)}本 署名した（7日）")
    cfg = {"id": secrets.token_hex(6), "slots": slots,
           "init_headers": dict(store.init_headers(), **{"Content-Type": "application/octet-stream"}),
           "meta_headers": dict(store.meta_headers(), **{"Content-Type": "application/json"}),
           "no308": {"X-GUploader-No-308": "yes"}, "chunk": store.CHUNK,
           "max_bytes": store.MAX_BYTES, "retries": RETRIES, "stall_ms": STALL_MS,
           "expires": expires.isoformat()}
    site = make_site(cfg, tmp)
    if npm.wait() != 0:
        raise Bad("firebase-tools を入れられなかった")
    T["tools"] = time.time() - t0
    channel = "sp-" + secrets.token_hex(10)
    assert host.CHANNEL.match(channel) and channel != "live"
    d = host.firebase(tools, ["hosting:channel:deploy", channel, "--expires", host.EXPIRES], site,
                      tmp / "deploy.log")
    url, channel_expire = host.find_url(d.get("result"))
    if not url:
        raise Bad("配ったが URL が返ってこなかった")
    origin = re.match(r"^(https://[^/]+)", url).group(1)
    T["deployed"] = time.time() - t0
    print(f"  チャンネルに配った（{T['deployed']:.0f}秒・{host.EXPIRES}で消える）")
    cors = store.ensure_cors(b, origin)
    T["cors"] = time.time() - t0
    st = store.selftest(b, prefix, origin)
    T["selftest"] = time.time() - t0
    pc = check_page(url + "/")
    print(f"  ページ: HTTP {pc['status']}  枠 {'○' if pc['has_config'] else '✕'}  noindex "
          f"{'○' if pc['noindex'] else '✕'}  CSP {'○' if pc['csp'] else '✕'}  no-store "
          f"{'○' if pc['no_store'] else '✕'}")
    print("  上げてみた（ブラウザと同じ要求）: "
          f"下見 {'○' if st.get('preflight_init', {}).get('ok') else '✕'}"
          f"（{st.get('preflight_init', {}).get('sec')}秒）"
          f"  枠を取る {st.get('claim', {}).get('first')}→{st.get('claim', {}).get('second')}"
          f"  始め {st.get('init', {}).get('status')}"
          f"  1切れ目 {st.get('piece', {}).get('status')}/{st.get('piece', {}).get('override') or '-'}"
          f"  聞く {st.get('ask', {}).get('status')}/{st.get('ask', {}).get('override') or '-'}"
          f"（308 のまま {st.get('ask_plain', {}).get('status')}）"
          f"  続きから {st.get('last', {}).get('from')}バイト目 → {st.get('last', {}).get('status')}"
          f"  md5 {'一致' if st.get('stored', {}).get('md5_ok') else '✕'}"
          f"  同じ名前でもう1本 {st.get('again', {}).get('init')}→{st.get('again', {}).get('final')}"
          f"（前のまま {'○' if st.get('again', {}).get('kept') else '✕'}）"
          f"  上限 {'効く' if st.get('cap', {}).get('enforced') else '効かない'}"
          f"  署名なし {st.get('plain_get')}")
    problems = list(life["problems"])
    if not st.get("ok"):
        problems.append("ランナーから上げてみたところで落ちた（selftest を見る）")
    if not all(pc[k] for k in ("has_config", "noindex", "csp", "no_store")) or pc["status"] != 200:
        problems.append("ページの中身か見出しが足りない")
    return {"format": "shorts-upload/1", "action": "page", "name": req["name"],
            "page": url + "/", "origin": origin, "channel": channel,
            "expires": expires.isoformat(), "channel_expires": channel_expire,
            "bucket": bucket_name, "prefix": prefix, "slots": len(slots), "chunk": store.CHUNK,
            "max_bytes": store.MAX_BYTES, "lifecycle": life, "cors": cors, "selftest": st,
            "page_check": pc, "config": cfg, "ok": not problems, "problems": problems,
            "timing": {k: round(v, 1) for k, v in T.items()}}


# ---------------------------------------------------------------- probe / drop

def do_probe(req: dict) -> dict:
    import gcs
    import store

    client, _ = gcs.client_and_creds()
    b = client.bucket(gcs.BUCKET)
    items = store.uploads(client, b, req["name"])
    print(f"  届いているもの: {len(items)}本")
    files = []
    for it in items:
        r = store.probe_one(b, it, req["hash"])
        s = r.get("summary") or {}
        v = s.get("video") or {}
        print(f"  {r['slot']}: {r['bytes'] / 1e6:.1f}MB  ffprobe {'○' if r['ffprobe_ok'] else '✕'}"
              f"（{r['ffprobe_sec']}秒）  映像 {'○' if v else '✕'}  音 {'○' if s.get('audio') else '✕'}"
              + (f"  sha256 {r['hash'].get('sec')}秒  md5 {'一致' if r.get('md5_ok') else '!! 不一致'}"
                 if req["hash"] else ""))
        files.append(r)
    bad = [f["slot"] for f in files if not f["ffprobe_ok"] or (req["hash"] and not f.get("md5_ok"))]
    return {"format": "shorts-upload/1", "action": "probe", "name": req["name"],
            "bucket": b.name, "at": dt.datetime.now(dt.timezone.utc).isoformat(),
            "files": files, "ok": not bad, "problems": [f"{s} が読めない・md5 が合わない" for s in bad]}


def do_cas(req: dict) -> dict:
    """書き出しの置き場（render/cas/<sha256>）に前に上げたものを、署名付き GET（1日）で返す。

    前の版の声や素材を作業箱で消したあとでも、同じバイト列を取り戻して次の版に使えるように
    （声を作り直すと読みが変わる。#998 v3）。
    """
    import gcs

    client, _ = gcs.client_and_creds()
    b = client.bucket(gcs.BUCKET)
    out = []
    for h in req["sha256"]:
        blob = b.get_blob(f"render/cas/{h}")
        out.append({"sha256": h, "bytes": blob.size if blob else None,
                    "url": blob.generate_signed_url(version="v4", method="GET",
                                                    expiration=dt.timedelta(days=1)) if blob else None})
    miss = [x["sha256"][:12] for x in out if not x["url"]]
    print(f"  在った: {len(out) - len(miss)}本 / 無い: {len(miss)}本")
    return {"format": "shorts-upload/1", "action": "cas", "name": req["name"], "files": out,
            "ok": not miss, "problems": [f"無い: {m}" for m in miss]}


def do_drop(req: dict) -> dict:
    import gcs
    import store

    client, _ = gcs.client_and_creds()
    b = client.bucket(gcs.BUCKET)
    blobs = list(client.list_blobs(b, prefix=f"{store.PREFIX}{req['name']}/"))
    for x in blobs:
        x.delete()
    left = len(list(client.list_blobs(b, prefix=f"{store.PREFIX}{req['name']}/")))
    print(f"  消した: {len(blobs)}個（残り {left}個）")
    return {"format": "shorts-upload/1", "action": "drop", "name": req["name"],
            "deleted": len(blobs), "left": left, "ok": left == 0, "problems": [] if not left else ["残った"]}


# ---------------------------------------------------------------- 結果を返す

def seal_result(req: dict, body: dict | None, err: str | None, extra: dict, tmp: Path) -> Path:
    rel = f"upload/{req['name']}/{req['action']}"
    out = tmp / "res"
    if out.exists():
        shutil.rmtree(out)
    out.mkdir(parents=True)
    if body:
        seal.write_json(out / "result.json", body)
    # drive はコマ一覧も一緒に包む（中身の写真なので平文では置かない）
    if (tmp / "drive_out" / "sheets").is_dir():
        shutil.copytree(tmp / "drive_out" / "sheets", out / "sheets")
    seal.write_json(out / "run.json", dict(extra, error=err, run=os.environ.get("RUN_URL")))
    dest = tmp / "sealed"
    item = {"key": f"upload__{req['name']}__{req['action']}", "mode": "upload", "dest": rel,
            "pubkey": req["pubkey"], "pubkey_sha256": req["pubkey_sha256"], "req": req["req"]}
    ok = bool(body) and body.get("ok", True)
    man = seal.seal(item, out, dest, {"stages": {req["action"]: "ok" if ok else "failed"}})
    # 届いた結果がどの依頼のものかを、作業箱が平文の manifest で見分けられるように
    man["nonce"] = req["nonce"]
    man["action"] = req["action"]
    seal.write_json(dest / "manifest.json", man)
    shutil.rmtree(out)
    return dest


def one(req: dict, branch: str, tmp: Path) -> bool:
    name, action = req["name"], req["action"]
    print(f"{name}: {action} ← {req['req']}")
    body, err, extra = None, None, {}
    t0 = time.time()
    try:
        if action == "drive":
            import drive

            body = drive.do_drive(req, tmp, tmp / "drive_out")
        elif action == "cas":
            body = do_cas(req)
        else:
            body = (do_page(req, tmp) if action == "page" else do_probe(req) if action == "probe"
                    else do_drop(req))
    except Exception as e:  # noqa: BLE001  落ちたことも暗号化して返す（作業箱が待ち続けないように）
        err = f"{type(e).__name__}: {e}"
        extra["probe"] = getattr(e, "probe", None)
        print(f"!! {name}: {e if isinstance(e, Bad) else type(e).__name__}")
    extra["sec"] = round(time.time() - t0, 1)
    dest = seal_result(req, body, err, extra, tmp)
    rel = f"shorts/.work/upload/{name}/{action}"
    adds = {f"{rel}/{p.name}": p for p in sorted(dest.iterdir())}
    br.push_change(branch, adds, [f"{REQ_DIR}{name}.json", rel],
                   f"録画の受け取り {name} の結果を暗号化して置く（{action}・run "
                   f"{os.environ.get('GITHUB_RUN_ID', '?')}）\n\n"
                   "ページの URL と署名は持っている人なら誰でも使える鍵なので、依頼の公開鍵で包んだ"
                   "ものだけを置く。依頼は同じ commit で下ろす。")
    ok = bool(body) and body.get("ok", True)
    print(f"  {name}: {'できた' if ok else '!! 落ちた（復号した run.json と result.json の problems を見る）'}"
          f"（{extra['sec']}秒）→ 暗号化して置いた")
    return ok


def main() -> int:
    cmd = sys.argv[1] if len(sys.argv) > 1 else "run"
    reqs = requests_now()
    if cmd == "plan":
        gh = os.environ.get("GITHUB_OUTPUT")
        line = (f"count={len(reqs)}\nffmpeg={'true' if any(r['action'] in ('probe', 'drive') for r in reqs) else 'false'}\n"
                f"drive={'true' if any(r['action'] == 'drive' for r in reqs) else 'false'}\n"
                f"node={'true' if any(r['action'] == 'page' for r in reqs) else 'false'}\n")
        if gh:
            with open(gh, "a", encoding="utf-8") as f:
                f.write(line)
        print(line.strip().replace("\n", "  "))
        return 0
    branch = out_branch()
    if not reqs:
        print("依頼なし")
        return 0
    bad = 0
    for r in reqs:
        with tempfile.TemporaryDirectory(dir=os.environ.get("RUNNER_TEMP")) as td:
            bad += 0 if one(r, branch, Path(td)) else 1
    return 1 if bad else 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Bad as e:
        print(f"!! 依頼を受けられない: {e}")
        sys.exit(1)
