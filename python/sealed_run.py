"""封つきの管理スクリプトを**手元から**1回押して、返ってきたものをほどく。

    python3 python/sealed_run.py doneru_msgs_sealed '{"from":"2026-09-26","to":"2026-10-30"}'
    python3 python/sealed_run.py tips_sealed '{"from":"2026-09-26","to":"2026-10-30"}' --out /tmp/x.json

`pubkey` は**こちらが足す。** 引数に書かない。

## なぜ要るか

値を作れるのは Actions だけ（この箱に Google の既定の身分が無い）で、
**Actions のログは公開。** だから実額と素性は封をして返してもらう。
その押しかたと受け取りかたが、これまで `_handoff.py` の中に
`owner_handoff` 決め打ちで1本あるだけだった。**封を出す口は増える**ので、
押す側を1本に出しておく。

ログ本体は置き場（Azure Blob）から配られていて、この箱の `gh` は口から
読めない。**注記だけが唯一の返り道**なので、封は `_seal.chunks()` で
切って注記に出してもらい、ここで拾って繋ぐ。

## 自分の実行だけを見る

同じワークフローを誰かが同時に押していることがある。**封がほどけた
ものだけ**を自分のものとみなす（`_handoff.fetch()` と同じ考え方）。
"""

import argparse
import gzip
import json
import os
import subprocess
import sys
import time
from datetime import datetime, timedelta, timezone

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "admin"))

from _seal import join, keypair, unpack, unseal  # noqa: E402

REPO = "Ayato-kosaka/live-streaming"
WORKFLOW = "run_admin_script.yml"

#: 実行が終わるまで待つ上限（秒）。`concurrency: admin-script` で
#: 他の実行の後ろに並ぶことがあるので長めに取る
WAIT = 1800


def gh(path: str, method: str = "GET", fields=()) -> dict:
    """`gh api` を1回。**返りが空なら {} を返す。**"""
    cmd = ["gh", "api", "-X", method, path]
    for f in fields:
        cmd += ["-f", f]
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode != 0:
        raise SystemExit(f"gh api {method} {path} が落ちました: {r.stderr.strip()[:300]}")
    out = (r.stdout or "").strip()
    return json.loads(out) if out else {}


def annotations(run_id: int) -> list:
    """その実行が出した注記の本文を全部。"""
    out = []
    for j in gh(f"repos/{REPO}/actions/runs/{run_id}/jobs").get("jobs") or []:
        for a in gh(f"repos/{REPO}/check-runs/{j['id']}/annotations") or []:
            out.append(a.get("message") or "")
    return out


def candidates(ref: str, since: datetime) -> list:
    """自分が押したかもしれない実行。新しい順。"""
    q = (f"repos/{REPO}/actions/workflows/{WORKFLOW}/runs"
         f"?event=workflow_dispatch&per_page=20")
    out = []
    for r in gh(q).get("workflow_runs") or []:
        if r.get("head_branch") != ref:
            continue
        born = datetime.fromisoformat(r["created_at"].replace("Z", "+00:00"))
        if born >= since:
            out.append(r)
    return out


def run(script: str, args: dict, ref: str, wait: int = WAIT):
    """押して、待って、ほどいて返す。

    Args:
        script: `python/admin/` の中の名前（`.py` は付けない）
        args: スクリプトへの入力。`pubkey` はこちらが足す
        ref: スクリプトが載っている枝
        wait: 実行の終わりを待つ上限（秒）

    Returns:
        ほどけた中身（JSON として読めたらその値、読めなければ bytes）
    """
    pem, pub = keypair()
    since = datetime.now(timezone.utc) - timedelta(minutes=2)

    print(f"押します: {script}（枝 {ref}）", file=sys.stderr)
    gh(
        f"repos/{REPO}/actions/workflows/{WORKFLOW}/dispatches", "POST",
        [f"ref={ref}", f"inputs[script]={script}",
         "inputs[args]=" + json.dumps({**args, "pubkey": pub})],
    )

    seen, end = set(), time.time() + wait
    while time.time() < end:
        time.sleep(15)
        for r in candidates(ref, since):
            if r["id"] in seen or r.get("status") != "completed":
                continue
            try:
                plain = unseal(unpack(join(annotations(r["id"]))), pem)
            except Exception as e:  # noqa: BLE001
                # 他人の実行か、**自分の実行が封を出す前に落ちたか。**
                # どちらか決められないので、名指しして次を見る
                seen.add(r["id"])
                print(f"  実行 {r['id']} は封を出していません（{type(e).__name__}）"
                      f" {r.get('conclusion')}", file=sys.stderr)
                continue
            # 封の中は畳んであることがある（`owner_handoff` と同じ）
            if plain[:2] == b"\x1f\x8b":
                plain = gzip.decompress(plain)
            print(f"  実行 {r['id']} から受け取りました（{len(plain)} バイト）",
                  file=sys.stderr)
            try:
                return json.loads(plain)
            except ValueError:
                return plain
        print(f"  まだ終わっていません（あと {int(end - time.time())} 秒まで待ちます）",
              file=sys.stderr)
    raise SystemExit(
        f"封が返ってきませんでした。枝 {ref} の「管理スクリプトを実行」で、"
        f"{since:%H:%M} 以降に始まった実行を見てください")


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("script", help="python/admin/ の中の名前（.py は付けない）")
    p.add_argument("args", nargs="?", default="{}", help="入力の JSON")
    p.add_argument("--ref", default=None, help="枝（既定はいまの枝）")
    p.add_argument("--out", default=None, help="書き出す先。無ければ標準出力")
    a = p.parse_args()

    ref = a.ref or subprocess.run(
        ["git", "rev-parse", "--abbrev-ref", "HEAD"],
        capture_output=True, text=True, check=True).stdout.strip()

    got = run(a.script, json.loads(a.args), ref)
    body = (got if isinstance(got, bytes)
            else json.dumps(got, ensure_ascii=False, indent=1).encode())
    if a.out:
        with open(a.out, "wb") as f:
            f.write(body)
        print(f"書いた {a.out}（{len(body)} バイト）", file=sys.stderr)
    else:
        sys.stdout.buffer.write(body)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
