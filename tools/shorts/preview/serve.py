"""下見の依頼を受けて、置いて、URL を暗号化して作業枝へ返す（Actions の入口）。

    python3 tools/shorts/preview/serve.py          # .github/workflows/shorts_preview.yml から

依頼の形は `req.py`、置き場ごとの中身は `host.py`（Firebase Hosting のプレビューチャンネル。
いまの既定）と `gcs.py`（非公開バケットの署名付き URL。#938 で付与。place が `transfer` のときは
EC2 へ渡す受け渡しの道 `transfer/`。`tools/shorts/post/send.py` が頼む）。

結果は依頼の公開鍵で包み（`tools/shorts/ingest/seal.py` と同じ形）、作業枝の
`shorts/.work/preview/<name>/` に置く。**同じ commit で依頼ファイル・受け取り口・作業箱の荷物を
下ろす**（Actions の push は次のワークフローを起こさないので、下ろしても依頼が走り直さない）。

**ログに出すのは、名前・数・秒・成否・権限の ○/✕ だけ。** URL・チャンネル名・題は出さない。
落ちた理由の全文（道が混ざりうる）は暗号化した `run.json` にだけ書く。
"""

from __future__ import annotations

import json
import os
import shutil
import sys
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE.parent / "ingest"))
import branch as br  # noqa: E402
import seal  # noqa: E402
from req import Bad, out_branch, requests_now  # noqa: E402


def seal_result(req: dict, body: dict | None, err: str | None, extra: dict, attach: list[Path],
                tmp: Path) -> Path:
    out = tmp / "res" / req["name"]
    if out.exists():
        shutil.rmtree(out)
    out.mkdir(parents=True)
    if body:
        seal.write_json(out / "urls.json", body)
    seal.write_json(out / "run.json", dict(extra, error=err, run=os.environ.get("RUN_URL")))
    for p in attach:
        shutil.copy(p, out / p.name)
    dest = tmp / "sealed" / req["name"]
    item = {"key": f"preview__{req['name']}", "mode": "preview",
            "dest": f"preview/{req['name']}", "pubkey": req["pubkey"],
            "pubkey_sha256": req["pubkey_sha256"], "req": req["req"]}
    ok = bool(body) and body.get("ok", True)
    man = seal.seal(item, out, dest, {"stages": {req["action"]: "ok" if ok else "failed"},
                                      "counts": {"files": len(req["files"])}})
    # 届いた結果がどの依頼のものかを、作業箱が平文の manifest で見分けられるように
    man["nonce"] = req["nonce"]
    man["place"] = req["place"]
    seal.write_json(dest / "manifest.json", man)
    shutil.rmtree(out)
    return dest


def one(req: dict, branch: str, tmp: Path) -> bool:
    import gcs
    import host

    name = req["name"]
    print(f"{name}: {req['place']}/{req['action']}  {len(req['files'])}ファイル"
          f"（{', '.join(f['name'] for f in req['files'][:10])}）← {req['req']}")
    body, err, extra, attach = None, None, {}, []
    try:
        if req["place"] in ("gcs", "transfer"):
            body, extra["probe"] = gcs.gcs_up(req)
            print(f"  署名した: {len(body['files'])}本")
        elif req["action"] == "delete":
            body, attach = host.delete(req, tmp)
        else:
            body, attach = host.up(req, branch, tmp)
    except Exception as e:  # noqa: BLE001  落ちたことも暗号化して返す（作業箱が待ち続けないように）
        err = f"{type(e).__name__}: {e}"
        extra["probe"] = getattr(e, "probe", None)
        print(f"!! {name}: {e if isinstance(e, Bad) else type(e).__name__}")
    dest = seal_result(req, body, err, extra, attach, tmp)
    adds = {f"shorts/.work/preview/{name}/{p.name}": p for p in sorted(dest.iterdir())}
    br.push_change(branch, adds, [f"shorts/preview/{name}.json", f"shorts/.work/preview/{name}"],
                   f"ショートの下見 {name} の結果を暗号化して置く（{req['place']}/{req['action']}・"
                   f"run {os.environ.get('GITHUB_RUN_ID', '?')}）\n\n"
                   "URL は持っている人なら誰でも開ける鍵なので、依頼の公開鍵で包んだものだけを置く。"
                   "依頼・受け取り口・作業箱の荷物は同じ commit で下ろす。")
    ok = bool(body) and body.get("ok", True)
    print(f"  {name}: {'できた' if ok else '!! 落ちた（復号した run.json と urls.json の problems を見る）'}"
          f" → 暗号化して置いた")
    return ok


def main() -> int:
    reqs = requests_now()
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
