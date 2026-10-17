"""ショートの書き出しを GitHub Actions で並べて回す（作業箱 → GCS → ランナー → GCS → 作業箱）。

    # 作業箱で（本番の段: 書き出し・双子・品質チェック・帯の絵）
    python3 tools/shorts/render/remote.py up --name yk-v2r --key <秘密鍵.pem> --out <リポジトリの外> \\
        edit_A.json edit_B.json edit_C.json
    # 下書きの段（縦横半分・双子なし・最低限の検査）
    python3 tools/shorts/render/remote.py up --draft --name yk-v2d … edit_A.json edit_B.json edit_C.json

    # Actions の中で（.github/workflows/shorts_render.yml から）
    python3 tools/shorts/render/remote.py prepare | job | report

## なぜ

作業箱（4コア）で3本を順に回すと、1本 書き出し4分＋双子4分＋検査5分で、1周 約42分かかった。
ランナーは1台4コアで、公開リポジトリでは何台でも並べられる。3本 × (本体・双子) の6台に分ければ、
1周は「いちばん遅い1本の 書き出し＋検査」になる（あやと 2026-10-16「GitHub actions に汎用並列マシン
作っても良いよ」）。

## 流れ

1. 作業箱: 指示書（edit_*.json）が指している素材・声・BGM を全部集め、中身の sha256 で名前を付け
   （`render/cas/<sha256>`。同じ素材は2回上げない）、指示書の道をその名前に書き換える。
   依頼 `shorts/render/<name>.json`（sha256 と大きさの並び・公開鍵・乱数だけ）を作業枝に積む
2. prepare（1台）: GCS に無いものだけ、上げる署名付き URL（1時間）を作り、公開鍵で包んで
   `shorts/.work/render/<name>/inbox/` に置く。作業箱が上げ終わるまで GCS を見て待つ
3. 作業箱: その URL で GCS に直に上げる（作業箱から storage.googleapis.com へは 25〜45MB/秒出た）
4. job（本数 × 本体・双子）: GCS から読んで書き出す。本体は品質チェック・帯の絵・一覧の絵まで作り、
   出来たもの（mp4・検査の json/md・帯・一覧・時間割・work 一式）を GCS に置く。双子は同じ指示書を
   別のランナーで書き、sha256 だけを置く（同じ指示書から同じバイト列が出るか）
5. report（1台）: 結果を集め、見る URL（7日）を作って公開鍵で包み、`shorts/.work/render/<name>/` に置く
6. 作業箱: 開いて、出来たものを `--out/<name>/<id>/` に落とし、sha256 を確かめる

**artifact は使わない**（公開リポジトリの artifact は誰でも落とせる。作業箱からは取りにも行けない）。
受け渡しは GCS の非公開バケット（`tools/shorts/preview/gcs.py`）だけ。

## 同じものが出るか

ランナーの道具を作業箱にそろえてある（ubuntu-24.04 の apt の ffmpeg 6.1.1・x264 0.164、
Python 3.13、numpy 2.5.3・Pillow 12.3.0・opencv-python-headless 5.0.0.93・budoux 0.9.3、
書体と YuNet は fetch_fonts.sh が sha256 で確かめる）。書き出すのは**作業枝に push してある版の
render.py**。手元で直した道具は push してから回す。
"""

from __future__ import annotations

import argparse
import concurrent.futures as cf
import datetime as dt
import hashlib
import json
import os
import re
import secrets
import shutil
import subprocess
import sys
import tarfile
import tempfile
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
sys.path.insert(0, str(HERE.parent / "preview"))
sys.path.insert(0, str(HERE.parent / "ingest"))
import branch as br  # noqa: E402
import decrypt  # noqa: E402
import seal  # noqa: E402
from req import Bad, compare_files, norm_pem  # noqa: E402

BRANCH = "claude/serene-darwin-sf09tt"
REQ_DIR = "shorts/render/"
CAS = "render/cas/"
NAME = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$")
ID = re.compile(r"^[A-Za-z0-9_-]{1,16}$")
HEX64 = re.compile(r"^[0-9a-f]{64}$")
MAX_ITEMS = 6
MAX_OBJECTS = 300
MAX_BYTES = 3 * 1024 ** 3
PUT_TTL = dt.timedelta(hours=1)
GET_TTL = dt.timedelta(days=7)
UPLOAD_WAIT = 1500
MEDIA = (".mp4", ".mov", ".mkv", ".m4a", ".wav", ".mp3", ".aac", ".flac", ".png", ".jpg", ".jpeg",
         ".webp", ".json", ".ttf", ".otf")
JST = dt.timezone(dt.timedelta(hours=9))
# 本体の job が GCS に置くもの（work 一式は tar.gz にまとめる）
OUT_FILES = ("{id}.mp4", "{id}.qa.json", "{id}.qa.md", "{id}_strips.jpg", "{id}_strips.json",
             "{id}.sheet.jpg", "{id}.plan.json", "{id}.work.tgz")
# 検査を4つに分けて同時に回す（1本ずつ順だと 200秒あまり。どれも1コアしか使わず、4コアが遊ぶ）。
# 重いもの（安全域 70秒・透かし 60秒・字と顔 40秒・字幕 35秒）を別々の組に置く
QA_GROUPS = (("safe_area",), ("watermark", "black", "frozen"), ("text_on_face", "faces"),
             ("container", "loudness", "voice_vs_bgm", "subtitle_sync", "text_dup", "silence",
              "clipping", "original_audio"))


def sha256_file(p: Path) -> str:
    h = hashlib.sha256()
    with open(p, "rb") as f:
        for b in iter(lambda: f.read(1 << 20), b""):
            h.update(b)
    return h.hexdigest()


def now() -> float:
    return round(time.time(), 1)


# ---------------------------------------------------------------- 作業箱: 指示書を集める

def collect(edit_path: Path, objects: dict[str, Path]) -> bytes:
    """指示書が指すファイルを全部 objects（sha256 → 道）に足し、道を `in/<sha256><拡張子>` に書き換える。

    書き出しは指示書の場所から相対の道を解く（render.py の resolve）。ランナーでは指示書と同じ所に
    `in/` を作って並べるので、書き換えた指示書はそのまま読める。様式（style）も指示書の隣にあれば
    同じように運ぶ（無ければランナーのリポジトリの tools/shorts/render/ のものを使う。作業箱と同じ）。
    """
    base = edit_path.resolve().parent
    edit = json.loads(edit_path.read_text(encoding="utf-8"))
    memo: dict[str, str] = {}

    def swap(s: str) -> str:
        if s in memo:
            return memo[s]
        p = Path(s) if Path(s).is_absolute() else base / s
        if Path(s).suffix.lower() in MEDIA and p.is_file():
            h = sha256_file(p)
            objects[h] = p
            memo[s] = f"in/{h}{p.suffix.lower()}"
        else:
            memo[s] = s
        return memo[s]

    def walk(x):
        if isinstance(x, dict):
            return {k: walk(v) for k, v in x.items()}
        if isinstance(x, list):
            return [walk(v) for v in x]
        if isinstance(x, str):
            return swap(x)
        return x

    out = walk(edit)
    return (json.dumps(out, ensure_ascii=False, indent=1) + "\n").encode()


def item_id(edit_path: Path) -> str:
    m = re.match(r"^edit_(.+)\.json$", edit_path.name)
    s = m.group(1) if m else edit_path.stem
    return re.sub(r"[^A-Za-z0-9_-]", "_", s)[:16]


def pubkey_of(priv: Path) -> str:
    return subprocess.run(["openssl", "pkey", "-in", str(priv), "-pubout"], check=True,
                          capture_output=True, text=True).stdout


def open_sealed(sha: str, rel: str, priv: Path, out: Path) -> Path:
    with tempfile.TemporaryDirectory(dir=out) as td:
        d = br.extract(sha, rel, Path(td))
        ok, msg = decrypt.open_one(d, priv, decrypt.pub_fp(priv), out)
    if not ok:
        raise RuntimeError(f"開けない: {msg}")
    return out / json.loads((br.git("show", f"{sha}:{rel}/manifest.json")))["dest"]


def put_one(path: Path, url: str) -> tuple[int, float]:
    import requests

    t0 = time.time()
    with open(path, "rb") as f:
        r = requests.put(url, data=f, headers={"Content-Type": "application/octet-stream"},
                         timeout=(30, 1800))
    return r.status_code, time.time() - t0


def get_one(url: str, dest: Path) -> tuple[int, str, float]:
    import requests

    t0 = time.time()
    h = hashlib.sha256()
    dest.parent.mkdir(parents=True, exist_ok=True)
    with requests.get(url, stream=True, timeout=(30, 1800)) as r:
        if r.status_code != 200:
            return r.status_code, "", time.time() - t0
        with open(dest, "wb") as f:
            for b in r.iter_content(1 << 20):
                f.write(b)
                h.update(b)
    return 200, h.hexdigest(), time.time() - t0


def cmd_up(a) -> int:
    out = Path(a.out)
    for p in (out,):
        g = decrypt.inside_git(p if p.exists() else p.parent)
        if g:
            print(f"!! {p} はリポジトリ（{g}）の中。出来たもの・URL を置かないので断る")
            return 1
    out.mkdir(parents=True, exist_ok=True)
    T: dict[str, float] = {}
    t0 = time.time()
    objects: dict[str, Path] = {}
    items = []
    stage = Path(tempfile.mkdtemp(dir=out, prefix=".edits-"))
    try:
        for e in a.edits:
            ep = Path(e)
            body = collect(ep, objects)
            h = hashlib.sha256(body).hexdigest()
            (stage / h).write_bytes(body)
            objects[h] = stage / h
            items.append({"id": item_id(ep), "edit": h})
        if len({i["id"] for i in items}) != len(items):
            print("!! 指示書の名前（edit_<id>.json の id）が重なっている")
            return 1
        objs = [{"sha256": h, "bytes": p.stat().st_size} for h, p in sorted(objects.items())]
        T["collect"] = time.time() - t0
        total = sum(o["bytes"] for o in objs)
        print(f"集めた: 指示書 {len(items)}本・ファイル {len(objs)}個・{total / 1e6:.0f}MB"
              f"（{T['collect']:.0f}秒）")
        nonce = secrets.token_hex(12)
        req = {"name": a.name, "nonce": nonce, "pubkey": pubkey_of(Path(a.key)),
               "draft": bool(a.draft), "twin": not a.draft and not a.no_twin,
               "items": items, "objects": objs}
        br.push_change(a.branch, {f"{REQ_DIR}{a.name}.json":
                                  (json.dumps(req, ensure_ascii=False, indent=1) + "\n").encode()}, [],
                       f"ショートの書き出し {a.name} を Actions に頼む（{'下書き' if a.draft else '本番'}・"
                       f"{len(items)}本）\n\n作業箱で3本を順に回すと1周40分かかる。ランナーに並べて回す。"
                       "依頼に置くのは sha256 と大きさ・公開鍵・乱数だけ（中身は GCS の非公開の置き場へ）。")
        T["request"] = time.time() - t0
        print(f"依頼を出した（{T['request']:.0f}秒）。上げる URL を待つ")
        rel = f"shorts/.work/render/{a.name}/inbox"
        sha, _ = br.wait_json(a.branch, f"{rel}/manifest.json", lambda d: d.get("nonce") == nonce,
                              a.timeout)
        dest = open_sealed(sha, rel, Path(a.key), out)
        puts = json.loads((dest / "puts.json").read_text(encoding="utf-8"))
        T["inbox"] = time.time() - t0
        print(f"上げる URL が来た（{T['inbox']:.0f}秒）。GCS に無いもの {len(puts)}個を上げる")
        with cf.ThreadPoolExecutor(4) as ex:
            res = dict(zip(puts, ex.map(lambda h: put_one(objects[h], puts[h]), puts)))
        bad = [h for h, (st, _) in res.items() if st != 200]
        up_mb = sum(objects[h].stat().st_size for h in puts) / 1e6
        T["uploaded"] = time.time() - t0
        print(f"上げた {len(puts) - len(bad)}/{len(puts)}個・{up_mb:.0f}MB"
              f"（{T['uploaded'] - T['inbox']:.0f}秒）。書き出しを待つ")
        if bad:
            print(f"!! 上げられなかった: {len(bad)}個")
            return 1
    finally:
        shutil.rmtree(stage, ignore_errors=True)

    rel = f"shorts/.work/render/{a.name}"
    sha, man = br.wait_json(a.branch, f"{rel}/manifest.json", lambda d: d.get("nonce") == nonce,
                            a.timeout)
    T["result"] = time.time() - t0
    dest = open_sealed(sha, rel, Path(a.key), out)
    rep = json.loads((dest / "report.json").read_text(encoding="utf-8"))
    print(f"結果が来た（{T['result']:.0f}秒・status={man.get('status')}）")
    got_dir = out / a.name
    jobs = []
    for it in rep["items"]:
        for f in it.get("files", []):
            jobs.append((it["id"], f))
    with cf.ThreadPoolExecutor(4) as ex:
        dl = list(ex.map(lambda j: (j, get_one(j[1]["get"], got_dir / j[0] / j[1]["name"])), jobs))
    T["downloaded"] = time.time() - t0
    ng = [j[1]["name"] for j, (st, h, _) in dl if st != 200 or h != j[1]["sha256"]]
    for it in rep["items"]:
        tw = it.get("twin")
        print(f"  {it['id']}: {it.get('status')}  mp4 {str(it.get('sha256'))[:8]}…"
              + (f"  双子 {'一致' if tw.get('same') else '!! 不一致'}" if tw else "")
              + f"  検査 {it.get('qa', {}).get('overall')}（{json.dumps(it.get('qa', {}).get('counts'), ensure_ascii=False)}）"
              + f"  書き出し {it.get('render_seconds')}秒")
    print(f"  ランナー: {json.dumps(rep.get('timing'), ensure_ascii=False)}")
    if ng:
        print(f"!! 落とし直しの sha256 が合わない: {ng}")
    if not a.keep_branch:
        br.push_change(a.branch, {}, [f"{REQ_DIR}{a.name}.json", rel],
                       f"ショートの書き出し {a.name} の暗号文を下ろす\n\n作業箱で開いて使い終えた。作業枝に溜めない。")
    T["total"] = time.time() - t0
    (dest / "timing_box.json").write_text(json.dumps({k: round(v, 1) for k, v in T.items()},
                                                     indent=1), encoding="utf-8")
    print(f"出来たもの: {got_dir}")
    print("時間（起動からの秒）: " + "  ".join(f"{k} {v:.0f}" for k, v in T.items()))
    return 1 if ng or any(it.get("status") != "ok" for it in rep["items"]) else 0


# ---------------------------------------------------------------- Actions: 依頼を読む

def read_request(req: dict, origin: str) -> dict:
    name = str(req.get("name") or "")
    if not NAME.match(name):
        raise Bad(f"{origin}: name の形が違う")
    pem, fp = norm_pem(req.get("pubkey", ""))
    nonce = str(req.get("nonce") or "")
    if not re.match(r"^[A-Za-z0-9_-]{8,64}$", nonce):
        raise Bad(f"{origin}: nonce が無い")
    items = req.get("items") or []
    objs = req.get("objects") or []
    if not 1 <= len(items) <= MAX_ITEMS or len(objs) > MAX_OBJECTS:
        raise Bad(f"{origin}: 指示書は1〜{MAX_ITEMS}本・ファイルは{MAX_OBJECTS}個まで")
    for it in items:
        if not ID.match(str(it.get("id"))) or not HEX64.match(str(it.get("edit"))):
            raise Bad(f"{origin}: items の形が違う")
    for o in objs:
        if not HEX64.match(str(o.get("sha256"))) or not isinstance(o.get("bytes"), int):
            raise Bad(f"{origin}: objects の形が違う")
    if sum(o["bytes"] for o in objs) > MAX_BYTES:
        raise Bad(f"{origin}: 合計 {MAX_BYTES // 1024 ** 3}GB まで")
    if {it["edit"] for it in items} - {o["sha256"] for o in objs}:
        raise Bad(f"{origin}: 指示書が objects に無い")
    return {"name": name, "nonce": nonce, "pubkey": pem, "pubkey_sha256": fp, "req": origin,
            "draft": bool(req.get("draft")), "twin": bool(req.get("twin")) and not req.get("draft"),
            "items": items, "objects": objs}


def the_request() -> dict:
    ev = json.loads(Path(os.environ["GITHUB_EVENT_PATH"]).read_text(encoding="utf-8"))
    before = ev.get("before") or ""
    head = ev.get("after") or os.environ.get("GITHUB_SHA", "")
    if not before.strip("0"):
        before = (ev.get("repository") or {}).get("default_branch") or "master"
    files = [f for f in compare_files(before, head)
             if f.startswith(REQ_DIR) and f.endswith(".json") and f.count("/") == 2
             and (ROOT / f).is_file()]
    if not files:
        raise Bad("この push に依頼が無い")
    if len(files) > 1:
        print(f"依頼が {len(files)}件。1回に1件だけ回す（{files[0]}）")
    return read_request(json.loads((ROOT / files[0]).read_text(encoding="utf-8")), files[0])


def storage():
    sys.path.insert(0, str(HERE.parent / "preview"))
    import gcs

    client, _ = gcs.client_and_creds()
    return client, client.bucket(gcs.BUCKET)


def out_branch() -> str:
    b = os.environ.get("GITHUB_REF_NAME", "")
    if not b.startswith("claude/"):
        raise Bad(f"結果を置く枝は claude/ で始まる名前にする（{b!r}）")
    return b


def seal_to(req: dict, files: dict[str, bytes], dest_rel: str, tmp: Path, status: str) -> dict:
    src = tmp / "plain"
    if src.exists():
        shutil.rmtree(src)
    src.mkdir(parents=True)
    for n, b in files.items():
        (src / n).write_bytes(b)
    dest = tmp / "sealed"
    if dest.exists():
        shutil.rmtree(dest)
    item = {"key": f"render__{req['name']}", "mode": "render", "dest": dest_rel,
            "pubkey": req["pubkey"], "pubkey_sha256": req["pubkey_sha256"], "req": req["req"]}
    man = seal.seal(item, src, dest, {"stages": {"render": status}})
    man["nonce"] = req["nonce"]
    seal.write_json(dest / "manifest.json", man)
    shutil.rmtree(src)
    return {f"shorts/.work/{dest_rel}/{p.name}": p for p in sorted(dest.iterdir())}


# ---------------------------------------------------------------- Actions: prepare

def cmd_prepare() -> int:
    t0 = time.time()
    req = the_request()
    branch = out_branch()
    name = req["name"]
    print(f"{name}: {'下書き' if req['draft'] else '本番'}・{len(req['items'])}本"
          f"（{', '.join(i['id'] for i in req['items'])}）・双子 {'あり' if req['twin'] else 'なし'}"
          f"・ファイル {len(req['objects'])}個 {sum(o['bytes'] for o in req['objects']) / 1e6:.0f}MB")
    client, bucket = storage()
    have = {b.name[len(CAS):]: b.size for b in client.list_blobs(bucket, prefix=CAS)}
    missing = [o for o in req["objects"] if have.get(o["sha256"]) != o["bytes"]]
    puts = {o["sha256"]: bucket.blob(CAS + o["sha256"]).generate_signed_url(
        version="v4", method="PUT", expiration=PUT_TTL, content_type="application/octet-stream")
        for o in missing}
    print(f"  GCS に在るもの {len(req['objects']) - len(missing)}個・無いもの {len(missing)}個"
          f"（{sum(o['bytes'] for o in missing) / 1e6:.0f}MB）")
    with tempfile.TemporaryDirectory() as td:
        adds = seal_to(req, {"puts.json": json.dumps(puts).encode()},
                       f"render/{name}/inbox", Path(td), "ok")
        br.push_change(branch, adds, [], f"ショートの書き出し {name} の上げる URL を暗号化して置く\n\n"
                       "GCS に無いものだけ。URL は依頼の公開鍵で包む。")
    t_inbox = time.time() - t0
    print(f"  上げる URL を置いた（{t_inbox:.0f}秒）。作業箱が上げ終わるのを待つ")
    want = {o["sha256"]: o["bytes"] for o in missing}
    t1 = time.time()
    while want:
        if time.time() - t1 > UPLOAD_WAIT:
            raise Bad(f"{UPLOAD_WAIT}秒待っても、上がっていないものが {len(want)}個ある")
        time.sleep(3)
        for h in list(want):
            b = bucket.get_blob(CAS + h)
            if b is not None and b.size == want[h]:
                want.pop(h)
    print(f"  全部そろった（{time.time() - t0:.0f}秒）")
    run = os.environ.get("GITHUB_RUN_ID", "local")
    prefix = f"render/{name}/{run}/"
    roles = ["main", "twin"] if req["twin"] else ["main"]
    meta = {"name": name, "prefix": prefix, "started": t0, "ready": now(), "inbox_s": round(t_inbox, 1),
            "uploaded_mb": round(sum(o["bytes"] for o in missing) / 1e6, 1),
            "draft": req["draft"], "twin": req["twin"], "items": req["items"]}
    bucket.blob(prefix + "prepare.json").upload_from_string(json.dumps(meta),
                                                             content_type="application/json")
    gh = os.environ.get("GITHUB_OUTPUT")
    if gh:
        with open(gh, "a", encoding="utf-8") as f:
            # **波括弧を出力に入れない。** サービスアカウントの鍵（複数行の JSON）は1行ずつ伏せ字に
            # 登録されるので、「{」と「}」だけの行も伏せ字になり、JSON の matrix は「秘密を含むかも」と
            # 捨てられた（2026-10-17、render の job が1本も起きなかった）。並びだけ渡し、掛け合わせは
            # Actions の matrix に任せる。指示書の sha256 と下書きかどうかは GCS の prepare.json から読む
            ids = [it["id"] for it in req["items"]]
            f.write(f"ids={json.dumps(ids)}\nroles={json.dumps(roles)}\nprefix={prefix}\n")
    return 0


# ---------------------------------------------------------------- Actions: job

def run(cmd: list[str], **kw) -> subprocess.CompletedProcess:
    return subprocess.run(cmd, **kw)


def run_checks(mp4: Path, work: Path, job: Path, iid: str, draft: bool) -> dict:
    """check.py を組ごとに同時に回し、1つの報告（json と md）にまとめる。並びと判定は check.py のまま。

    check.py はこの道具の中に import しない（あちらの `common` は qa/ のもの、こちらが先に読んだ
    `common` は ingest/ のもので、同じ名前がぶつかる）。並びと md は check.py を子として呼んで作る。
    """
    qa = HERE.parent / "qa"
    severity = {"pass": 0, "not-checkable": 1, "needs-human": 2, "fail": 3}  # qa/common.py の SEVERITY
    info = json.loads(subprocess.run(
        [sys.executable, "-c", "import sys, json; sys.path.insert(0, sys.argv[1]); import check; "
         "print(json.dumps({'order': list(check.CHECKS), 'draft': list(check.DRAFT_CHECKS)}))", str(qa)],
        capture_output=True, text=True, check=True).stdout)
    # 顔の検査の YuNet は qa/models/ に無い（fetch_fonts.sh が落とすのは render/models/）
    env = dict(os.environ, SHORTS_QA_YUNET=str(HERE / "models" / "face_detection_yunet_2023mar.onnx"))
    groups = ([("safe_area",), tuple(c for c in info["draft"] if c != "safe_area")] if draft
              else QA_GROUPS)
    procs = []
    for k, g in enumerate(groups):
        out = job / f"{iid}.qa{k}.json"
        procs.append((out, subprocess.Popen(
            [sys.executable, str(HERE.parent / "qa/check.py"), str(mp4), str(work), "--only", ",".join(g),
             "--json", str(out), "--crops", str(job / f"{iid}.qa")], cwd=job, env=env,
            stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, text=True)))
    checks, notes, errs = {}, [], []
    for out, p in procs:
        _, err = p.communicate()
        try:
            r = json.loads(out.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            errs.append((err or "")[-400:])
            continue
        checks.update({c["id"]: c for c in r["checks"]})
        notes += [n for n in r.get("notes", []) if n not in notes]
        out.unlink()
    ordered = [checks[c] for c in info["order"] if c in checks]
    worst = max((c["status"] for c in ordered), key=lambda s: severity[s], default="not-checkable")
    rep = {"file": str(mp4), "work": str(work), "plate": None, "overall": worst,
           "counts": {s: sum(c["status"] == s for c in ordered) for s in severity},
           "checks": ordered, "notes": notes + [f"検査が止まった組: {e}" for e in errs]}
    pj = job / f"{iid}.qa.json"
    pj.write_text(json.dumps(rep, ensure_ascii=False, indent=1, default=str), encoding="utf-8")
    md = subprocess.run([sys.executable, "-c", "import sys, json; sys.path.insert(0, sys.argv[1]); "
                         "import check; print(check.markdown(json.load(open(sys.argv[2]))), end='')",
                         str(qa), str(pj)], capture_output=True, text=True)
    (job / f"{iid}.qa.md").write_text(md.stdout, encoding="utf-8")
    rc = {"pass": 0, "fail": 1, "needs-human": 3, "not-checkable": 3}[worst]
    return {"overall": worst, "counts": rep["counts"], "rc": rc,
            "checks": {c["id"]: c["status"] for c in ordered}, "errors": errs}


def cpu_info() -> dict:
    """ランナーの CPU（同じ指示書でもバイト列が変わる元。README の「同じものが出るか」）。"""
    try:
        txt = Path("/proc/cpuinfo").read_text()
    except OSError:
        return {}
    model = next((ln.split(":", 1)[1].strip() for ln in txt.splitlines() if ln.startswith("model name")), "?")
    return {"model": model, "avx512": " avx512f" in txt}


def cmd_job() -> int:
    prefix = os.environ["PREFIX"]
    iid, role = os.environ["ITEM_ID"], os.environ["ROLE"]
    if not ID.match(iid) or role not in ("main", "twin"):
        raise Bad("matrix の形が違う")
    T: dict[str, float] = {"start": now()}
    client, bucket = storage()
    meta = json.loads(bucket.blob(prefix + "prepare.json").download_as_bytes())
    item = next(it for it in meta["items"] if it["id"] == iid)
    draft = bool(meta["draft"])
    job = Path(os.environ.get("RUNNER_TEMP", tempfile.gettempdir())) / "job"
    (job / "in").mkdir(parents=True, exist_ok=True)
    edit = json.loads(bucket.blob(CAS + item["edit"]).download_as_bytes())
    need = sorted(set(re.findall(r"in/([0-9a-f]{64})(\.[a-z0-9]+)", json.dumps(edit))))

    def fetch(h_ext):
        h, ext = h_ext
        p = job / "in" / f"{h}{ext}"
        bucket.blob(CAS + h).download_to_filename(str(p))
        if sha256_file(p) != h:
            raise Bad(f"GCS から読んだものの sha256 が違う（{h[:8]}…）")
        return p.stat().st_size

    with cf.ThreadPoolExecutor(8) as ex:
        sizes = list(ex.map(fetch, need))
    ep = job / f"edit_{iid}.json"
    ep.write_text(json.dumps(edit, ensure_ascii=False, indent=1), encoding="utf-8")
    T["inputs"] = now()
    print(f"{iid}/{role}: 素材 {len(need)}個 {sum(sizes) / 1e6:.0f}MB を読んだ"
          f"（{T['inputs'] - T['start']:.0f}秒）")
    name = f"{iid}.mp4" if role == "main" else f"{iid}_twin.mp4"
    mp4, work = job / name, job / f"{Path(name).stem}.work"
    r = run([sys.executable, str(HERE / "render.py"), str(ep), "--out", str(mp4), "--work", str(work)]
            + (["--draft"] if draft else []), cwd=job, capture_output=True, text=True)
    T["rendered"] = now()
    res = {"id": iid, "role": role, "draft": draft, "timing": T, "cpu": cpu_info(),
           "render_rc": r.returncode, "render_seconds": round(T["rendered"] - T["inputs"], 1)}
    print(f"  CPU: {res['cpu'].get('model')}（AVX-512 {'あり' if res['cpu'].get('avx512') else 'なし'}）")
    if r.returncode != 0 or not mp4.is_file():
        res["error"] = (r.stderr or "")[-1500:]
        print(f"!! 書き出しが落ちた（{r.returncode}）")
    else:
        res["sha256"] = sha256_file(mp4)
        res["bytes"] = mp4.stat().st_size
        print(f"  書き出した（{res['render_seconds']}秒）sha256 {res['sha256'][:8]}…")
    if role == "main" and "sha256" in res:
        res["qa"] = run_checks(mp4, work, job, iid, draft)
        T["checked"] = now()
        res["qa"]["seconds"] = round(T["checked"] - T["rendered"], 1)
        print(f"  検査 {res['qa'].get('overall')}（{res['qa'].get('seconds')}秒）"
              f" {json.dumps(res['qa'].get('counts'), ensure_ascii=False)}")
        # strips.py の --out は「名前の頭」で、拡張子を付け替える（A.strips → A.jpg）。_ でつなぐ
        st = run([sys.executable, str(HERE.parent / "qa/strips.py"), str(mp4), str(work),
                  "--out", str(job / f"{iid}_strips")], cwd=job, capture_output=True, text=True)
        if st.returncode != 0:
            res["strips_error"] = (st.stderr or "")[-600:]
        run([sys.executable, str(HERE / "contact_sheet.py"), str(mp4), str(work), str(job / f"{iid}.sheet.jpg")],
            cwd=job, capture_output=True)
        shutil.copy(work / "plan.json", job / f"{iid}.plan.json")
        with tarfile.open(job / f"{iid}.work.tgz", "w:gz", compresslevel=1) as tf:
            tf.add(work, arcname=f"{iid}.work")
            if (job / f"{iid}.qa").is_dir():
                tf.add(job / f"{iid}.qa", arcname=f"{iid}.qa")
        T["extras"] = now()
        files = []
        for pat in OUT_FILES:
            p = job / pat.format(id=iid)
            if p.is_file():
                bucket.blob(f"{prefix}{iid}/{p.name}").upload_from_filename(str(p))
                files.append({"name": p.name, "bytes": p.stat().st_size, "sha256": sha256_file(p)})
        res["files"] = files
        T["uploaded"] = now()
        print(f"  GCS に置いた {len(files)}個（{T['uploaded'] - T['extras']:.0f}秒）")
    bucket.blob(f"{prefix}result_{iid}_{role}.json").upload_from_string(
        json.dumps(res, ensure_ascii=False), content_type="application/json")
    return 0 if "sha256" in res else 1


# ---------------------------------------------------------------- Actions: report

def cmd_report() -> int:
    req = the_request()
    branch = out_branch()
    prefix = os.environ["PREFIX"]
    client, bucket = storage()
    meta = json.loads(bucket.blob(prefix + "prepare.json").download_as_bytes())
    results = {}
    for b in client.list_blobs(bucket, prefix=prefix + "result_"):
        r = json.loads(b.download_as_bytes())
        results[(r["id"], r["role"])] = r
    items, status_all = [], "ok"
    for it in req["items"]:
        m = results.get((it["id"], "main"))
        tw = results.get((it["id"], "twin"))
        out = {"id": it["id"]}
        if not m or "sha256" not in m:
            out.update(status="failed", error=(m or {}).get("error", "本体の結果が無い"))
            status_all = "failed"
            items.append(out)
            continue
        out.update(status="ok", sha256=m["sha256"], bytes=m["bytes"], qa=m.get("qa"),
                   render_seconds=m["render_seconds"], timing=m["timing"])
        if req["twin"]:
            out["twin"] = {"sha256": (tw or {}).get("sha256"), "same": bool(tw) and tw.get("sha256") == m["sha256"],
                           "render_seconds": (tw or {}).get("render_seconds")}
            if not out["twin"]["same"]:
                out["status"] = "twin-differs"
        files = []
        for f in m.get("files", []):
            blob = bucket.blob(f"{prefix}{it['id']}/{f['name']}")
            files.append(dict(f, get=blob.generate_signed_url(version="v4", method="GET",
                                                              expiration=GET_TTL)))
        out["files"] = files
        items.append(out)
        if out["status"] != "ok" and status_all == "ok":
            status_all = "partial"
    ends = [r["timing"].get("uploaded") or r["timing"].get("rendered") for r in results.values()]
    timing = {"prepare_ready_s": round(meta["ready"] - meta["started"], 1),
              "jobs_end_s": round(max(ends) - meta["started"], 1) if ends else None,
              "report_s": round(time.time() - meta["started"], 1), "uploaded_mb": meta.get("uploaded_mb")}
    rep = {"name": req["name"], "draft": req["draft"], "twin": req["twin"], "status": status_all,
           "items": items, "timing": timing, "prefix": prefix, "expires": (
               dt.datetime.now(dt.timezone.utc) + GET_TTL).isoformat(),
           "run": f"{os.environ.get('GITHUB_SERVER_URL', '')}/{os.environ.get('GITHUB_REPOSITORY', '')}"
                  f"/actions/runs/{os.environ.get('GITHUB_RUN_ID', '')}"}
    for it in items:
        tw = it.get("twin")
        print(f"{it['id']}: {it['status']}  {str(it.get('sha256'))[:8]}…"
              + (f"  双子 {'一致' if tw and tw['same'] else '不一致'}" if tw else "")
              + f"  検査 {(it.get('qa') or {}).get('overall')}")
    print(f"時間: {json.dumps(timing, ensure_ascii=False)}")
    with tempfile.TemporaryDirectory() as td:
        adds = seal_to(req, {"report.json": json.dumps(rep, ensure_ascii=False, indent=1).encode()},
                       f"render/{req['name']}", Path(td), "ok" if status_all == "ok" else "failed")
        br.push_change(branch, adds, [f"{REQ_DIR}{req['name']}.json", f"shorts/.work/render/{req['name']}"],
                       f"ショートの書き出し {req['name']} の結果を暗号化して置く（{status_all}・run "
                       f"{os.environ.get('GITHUB_RUN_ID', '?')}）\n\n見る URL は依頼の公開鍵で包む。"
                       "依頼と上げる URL は同じ commit で下ろす。")
    return 0 if status_all == "ok" else 1


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    sub = ap.add_subparsers(dest="cmd", required=True)
    p = sub.add_parser("up")
    p.add_argument("--name", required=True)
    p.add_argument("--key", required=True)
    p.add_argument("--out", required=True, help="出来たものを落とす場所（リポジトリの外）")
    p.add_argument("--branch", default=BRANCH)
    p.add_argument("--draft", action="store_true", help="下書きの段（縦横半分・双子なし・最低限の検査）")
    p.add_argument("--no-twin", action="store_true", help="本番の段で双子を回さない")
    p.add_argument("--timeout", type=float, default=2400)
    p.add_argument("--keep-branch", action="store_true")
    p.add_argument("edits", nargs="+")
    for n in ("prepare", "job", "report"):
        sub.add_parser(n)
    a = ap.parse_args()
    if a.cmd == "up":
        if not NAME.match(a.name) or not a.branch.startswith("claude/"):
            print("!! name は英数字と . _ -、作業枝は claude/ で始まる名前")
            return 1
        return cmd_up(a)
    return {"prepare": cmd_prepare, "job": cmd_job, "report": cmd_report}[a.cmd]()


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Bad as e:
        print(f"!! {e}")
        sys.exit(1)
