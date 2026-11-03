"""ショートの数字を BigQuery に入れる（Actions の入口）。#921

    python3 tools/shorts/metrics/serve.py plan   # 依頼を読んで、数を GITHUB_OUTPUT に書く
    python3 tools/shorts/metrics/serve.py run    # 上げる URL を包んで置き、届いたら BigQuery に入れ、結果を包んで置く

`.github/workflows/shorts_metrics.yml` から呼ぶ。依頼は作業枝の `shorts/metrics/<name>.json`
（作業箱の `shorts_metrics.py ship` が積む。名前・公開鍵・乱数だけ）か workflow_dispatch の入力。

1. GCS の非公開バケットの `transfer/metrics/<name>/<乱数>/rows.json` に PUT できる署名付き URL（1時間）を作り、
   依頼の公開鍵で包んで（`ingest/seal.py`）作業枝の `shorts/.work/metrics/<name>/inbox/` に置く
2. EC2 がそこへ上げるのを待つ（WAIT_S まで）
3. 届いた JSON の形を見て（`shorts_metrics.check_rows`）、`CREATE TABLE IF NOT EXISTS` と MERGE で入れる
4. GCS のものを消す（落ちても消す。消し損ねても `transfer/` は1日で消える。`preview/gcs.py`）
5. 結果（時点ごとの行の数・sha256・成否）を包んで `shorts/.work/metrics/<name>/done/` に置き、
   同じ commit で依頼と inbox を下ろす

**なぜ Actions か。** 作業箱からは BigQuery に書かない決まり（あやと「BigQuery の許可がボトルネックに
なってるので、GitHub Action 使ってください」）。Actions は既存の `FIREBASE_SERVICE_ACCOUNT` で届く。
新しい秘密は足さない。Actions から EC2 へは届かない（AWS の鍵が無い）ので、EC2 に上げてもらう。

**ログに出すのは件数と成否だけ。** リポジトリも Actions のログも公開。落ちた理由も、BigQuery の返事に
SQL の切れ端（＝数字）が混ざりうるので、ログには型の名前だけを出し、中身は包んだ結果に入れる。
"""

from __future__ import annotations

import datetime as dt
import hashlib
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
import shorts_metrics as m  # noqa: E402
from req import Bad, compare_files, norm_pem, out_branch  # noqa: E402

ROOT = HERE.parents[2]
NAME = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$")
NONCE = re.compile(r"^[A-Za-z0-9_-]{8,64}$")
# EC2 が上げるまで待つ秒。作業箱は作業枝を5秒ごとに見て、開いて、SSM で EC2 に PUT させる（ふだん1〜2分）
WAIT_S = 20 * 60
# GCS の受け渡しの道（gcs.TRANSFER の下。1日で消える決まりがある）
SPACE = "transfer/metrics"
PUT_TTL = dt.timedelta(hours=1)
# 上げてくるものの上限。行は1本あたり5行・1行 1〜2KB なので、千本出しても 10MB に届かない
MAX_BYTES = 32 * 1024 * 1024


# ---------------------------------------------------------------- 依頼

def read_request(req: dict, origin: str) -> dict:
    name = str(req.get("name") or "")
    if not NAME.match(name):
        raise Bad(f"{origin}: name の形が違う: {name!r}（英数字と . _ - で64字まで）")
    pem, fp = norm_pem(req.get("pubkey", ""))
    nonce = str(req.get("nonce") or "")
    if not NONCE.match(nonce):
        raise Bad(f"{origin}: nonce が無い・形が違う")
    return {"name": name, "pubkey": pem, "pubkey_sha256": fp, "nonce": nonce, "req": origin}


def request_files(changed: list[str]) -> list[str]:
    """この push で来た依頼のファイル（置き場の直下の .json だけ。結果の置き場 shorts/.work/ は拾わない）"""
    return [f for f in changed if f.startswith(m.REQ_DIR) and f.endswith(".json") and f.count("/") == 2]


def requests_now() -> list[dict]:
    g = os.environ.get
    if g("GITHUB_EVENT_NAME") == "workflow_dispatch":
        return [read_request({"name": g("IN_NAME", ""), "pubkey": g("IN_PUBKEY", ""), "nonce": g("IN_NONCE", "")},
                             "workflow_dispatch")]
    ev = json.loads(Path(os.environ["GITHUB_EVENT_PATH"]).read_text(encoding="utf-8"))
    before = ev.get("before") or ""
    head = ev.get("after") or os.environ.get("GITHUB_SHA", "")
    if not before.strip("0"):
        before = (ev.get("repository") or {}).get("default_branch") or "master"
    # 消した依頼（作業箱が下ろしたもの）も push に載るが、ファイルが無いので拾わない
    files = [f for f in request_files(compare_files(before, head)) if (ROOT / f).is_file()]
    print(f"この push で来た依頼: {len(files)}件")
    return [read_request(json.loads((ROOT / f).read_text(encoding="utf-8")), f) for f in files]


# ---------------------------------------------------------------- 包んで作業枝へ

def sealed(req: dict, part: str, files: dict[str, bytes], ok: bool, counts: dict, tmp: Path) -> dict[str, Path]:
    """files を依頼の公開鍵で包み、作業枝に積む {道: ファイル} を返す。平文の manifest には成否と行の数だけ"""
    src, dest = tmp / f"plain_{part}", tmp / f"sealed_{part}"
    for d in (src, dest):
        if d.exists():
            shutil.rmtree(d)
    src.mkdir(parents=True)
    for n, b in files.items():
        (src / n).write_bytes(b)
    rel = f"metrics/{req['name']}/{part}"
    item = {"key": f"metrics__{req['name']}__{part}", "mode": "metrics", "dest": rel,
            "pubkey": req["pubkey"], "pubkey_sha256": req["pubkey_sha256"], "req": req["req"]}
    man = seal.seal(item, src, dest, {"stages": {part: "ok" if ok else "failed"}, "counts": counts})
    # 届いた結果がどの依頼のものかを、作業箱が平文の manifest で見分けられるように
    man["nonce"] = req["nonce"]
    seal.write_json(dest / "manifest.json", man)
    shutil.rmtree(src)
    return {f"{m.WORK}/{req['name']}/{part}/{p.name}": p for p in sorted(dest.iterdir())}


# ---------------------------------------------------------------- 1件

def wait_blob(bucket, obj: str, wait_s: float = WAIT_S, every: float = 3):
    t0 = time.time()
    while time.time() - t0 < wait_s:
        b = bucket.get_blob(obj)
        if b is not None:
            return b
        time.sleep(every)
    raise Bad(f"{wait_s:.0f}秒待っても上がってこなかった")


def parse_upload(data: bytes) -> list[dict]:
    """上がってきた EC2 の JSON → 行（形を見る。数は出さない）"""
    if len(data) > MAX_BYTES:
        raise Bad(f"大きすぎる（{len(data)}バイト）")
    return m.check_rows(m.rows_of(json.loads(data.decode("utf-8"))))


def one(req: dict, branch: str, tmp: Path) -> bool:
    from google.api_core import exceptions as gx
    from google.cloud import bigquery

    import gcs

    name = req["name"]
    t0 = time.time()
    client, _ = gcs.client_and_creds()
    bucket = client.bucket(gcs.BUCKET)
    # 道に乱数を挟む。バケットは非公開なので道を知っても読めないが、名前から当てられる形にしない
    obj = f"{SPACE}/{name}/{secrets.token_hex(8)}/rows.json"
    blob = bucket.blob(obj)
    url = blob.generate_signed_url(version="v4", method="PUT", expiration=PUT_TTL, content_type="application/json")
    expires = (dt.datetime.now(dt.timezone.utc) + PUT_TTL).replace(microsecond=0).isoformat()
    adds = sealed(req, "inbox", {"put.json": json.dumps({"url": url, "content_type": "application/json",
                                                         "expires": expires}).encode()}, True, {}, tmp)
    del url
    br.push_change(branch, adds, [], f"ショートの数字 {name} の上げる URL を暗号化して置く（run "
                   f"{os.environ.get('GITHUB_RUN_ID', '?')}）\n\n"
                   "署名付き URL は持っている人なら誰でも使える鍵なので、依頼の公開鍵で包んだものだけを置く。")
    print(f"{name}: 上げる URL を包んで置いた（{time.time() - t0:.0f}秒）。EC2 が上げるのを待つ", flush=True)

    body: dict = {"format": "shorts-metrics-load/1", "name": name, "ok": False}
    try:
        b = wait_blob(bucket, obj)
        data = b.download_as_bytes()
        body.update(bytes=len(data), sha256=hashlib.sha256(data).hexdigest())
        rows = parse_upload(data)
        body["rows_in"] = len(rows)
        body["rows_in_by_checkpoint"] = m.counts(rows)["by_checkpoint"]
        bq = bigquery.Client(project=m.PROJECT)
        body.update(m.load_rows(bq, rows))
        body["ok"] = True
    except Exception as e:  # noqa: BLE001  落ちたことも包んで返す（作業箱が待ち続けないように）
        body["error"] = f"{type(e).__name__}: {str(e)[:500]}"
        print(f"!! {name}: {type(e).__name__}（中身は包んだ結果に入れた）", flush=True)
    finally:
        try:
            blob.delete()
        except gx.NotFound:
            pass
        except Exception as e:  # noqa: BLE001
            body["delete_error"] = type(e).__name__
    body["sec"] = round(time.time() - t0, 1)
    after = body.get("after") or {}
    adds = sealed(req, "done", {"result.json": json.dumps(body, ensure_ascii=False).encode()}, body["ok"],
                  {"rows_in": body.get("rows_in", 0), **{f"table_{k}": v for k, v in after.items()}}, tmp)
    br.push_change(branch, adds, [f"{m.REQ_DIR}{name}.json", f"{m.WORK}/{name}/inbox"],
                   f"ショートの数字 {name} を BigQuery に入れた結果を暗号化して置く（run "
                   f"{os.environ.get('GITHUB_RUN_ID', '?')}）\n\n依頼と上げる URL は同じ commit で下ろす。")
    if body["ok"]:
        before = body["before"]
        print(f"{name}: 入れた {body['rows_in']}行（{body['bytes']}バイト）。表の行 {sum(before.values())} → "
              f"{sum(after.values())}（" + "・".join(f"{k} {before.get(k, 0)}→{v}" for k, v in after.items())
              + f"）{body['sec']}秒", flush=True)
    return body["ok"]


def main() -> int:
    cmd = sys.argv[1] if len(sys.argv) > 1 else "run"
    reqs = requests_now()
    if cmd == "plan":
        line = f"count={len(reqs)}\n"
        gh = os.environ.get("GITHUB_OUTPUT")
        if gh:
            with open(gh, "a", encoding="utf-8") as f:
                f.write(line)
        print(line.strip())
        return 0
    if not reqs:
        print("依頼なし")
        return 0
    branch = out_branch()
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
