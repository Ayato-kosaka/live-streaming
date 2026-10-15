"""**手元から**、口の札を Actions に1枚だけ取りに行く（#785）。

ここは Actions の中では動かない。動かすのは手元（このセッションの箱）で、
`owner_handoff` を1回押して、封をして返ってきた札をほどき、**押した実行を
その場で消す**ところまでを1本にしてある。

    from _handoff import fetch
    tok = fetch()          # {"id": …, "fs": …, "exp": …}

    # 札が本当に通るかを見るだけ（読むだけ・本番に1バイトも書かない）
    BQ_PROJECT_ID=live-streaming-d3cac python3 python/admin/_handoff.py

## なぜ手元に札が要るのか

視聴者さんの絵と「ハンドル↔絵」の対応表を、**公開リポジトリに入れない。**
枝でも、一時的でも入れない（#785。枝はこの箱からは落とせない）。
だから絵は手元に置いたまま、**手元から島の口へ直に送る。**
そのための札だけを Actions から持ってくる。考え方は `owner_handoff` の頭に。

## 手元に無いもの

この箱には Google の既定の身分（ADC）が無い。`google.auth.default()` は
`DefaultCredentialsError` で落ちるので、**札は自分では作れない。**
`FIREBASE_SERVICE_ACCOUNT` を持っているのは Actions だけで、そこは変えられない。

## 押した実行は、その場で消す

実行の `head_sha` も入力も、**公開の実行ページに出る**（#785 はそれで
絵の載った commit の SHA が公開に残った）。ここで押す実行には絵も名前も
載らないが、**残す理由も無い。** ほどけたら消して、消えたことまで見る。

**消すのは自分が押した実行だけ。** 同じワークフローを誰かが同時に押して
いることがあるので、**封がほどけたものだけ**を自分のものとみなす。
"""

import gzip
import json
import os
import subprocess
import sys
import time
from datetime import datetime, timedelta, timezone

from _fs import log
from _seal import join, keypair, unpack, unseal

REPO = "Ayato-kosaka/live-streaming"
WORKFLOW = "run_admin_script.yml"
SCRIPT = "owner_handoff"

#: 札を取りに行く枝。master に入るまでは `HANDOFF_REF` で指す
DEFAULT_REF = "master"

#: 実行が終わるまで待つ上限（秒）。`concurrency: admin-script` で
#: 他の実行の後ろに並ぶことがあるので、長めに取る
WAIT = 1200


def gh(path: str, method: str = "GET", fields=()) -> dict:
    """`gh api` を1回。**返りが空なら {} を返す。**"""
    cmd = ["gh", "api", "-X", method, path]
    for f in fields:
        cmd += ["-f", f]
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode != 0:
        raise SystemExit(f"gh api {method} {path} が落ちました: {r.stderr.strip()[:200]}")
    out = (r.stdout or "").strip()
    return json.loads(out) if out else {}


def annotations(run_id: int) -> list:
    """その実行が出した注記の本文を全部。

    ログ本体は置き場（Azure Blob）から配られていて、この箱の gh は
    **口からは読めない**（`refusing a redirect to results-receiver…`）。
    注記だけが口から読める唯一の返り道。
    """
    out = []
    jobs = gh(f"repos/{REPO}/actions/runs/{run_id}/jobs").get("jobs") or []
    for j in jobs:
        for a in gh(f"repos/{REPO}/check-runs/{j['id']}/annotations") or []:
            out.append(a.get("message") or "")
    return out


def drop(run_id: int) -> bool:
    """実行を消して、**消えたことまで見る。**"""
    subprocess.run(
        ["gh", "api", "-X", "DELETE", f"repos/{REPO}/actions/runs/{run_id}"],
        capture_output=True, text=True,
    )
    r = subprocess.run(
        ["gh", "api", f"repos/{REPO}/actions/runs/{run_id}"],
        capture_output=True, text=True,
    )
    gone = r.returncode != 0 and "404" in (r.stderr or "") + (r.stdout or "")
    log.info("実行 %s: %s", run_id, "消しました" if gone else "**消えていません**")
    return gone


def candidates(ref: str, since: datetime) -> list:
    """自分が押したかもしれない実行。新しい順。"""
    q = f"repos/{REPO}/actions/workflows/{WORKFLOW}/runs?event=workflow_dispatch&per_page=20"
    runs = gh(q).get("workflow_runs") or []
    out = []
    for r in runs:
        if r.get("head_branch") != ref:
            continue
        born = datetime.fromisoformat(r["created_at"].replace("Z", "+00:00"))
        if born >= since:
            out.append(r)
    return out


def fetch(ref: str | None = None, wait: int = WAIT) -> dict:
    """札を1枚取ってくる。**取れたら実行を消す。**

    Args:
        ref: `owner_handoff.py` が載っている枝（既定は master）
        wait: 実行の終わりを待つ上限（秒）

    Returns:
        {"id": 口に付ける札, "fs": Firestore の札, "exp": 切れる時刻}
    """
    if os.getenv("GITHUB_ACTIONS"):
        raise SystemExit("これは手元から回すものです（Actions の中では要りません）")
    ref = ref or os.getenv("HANDOFF_REF") or DEFAULT_REF
    pem, pub = keypair()
    since = datetime.now(timezone.utc) - timedelta(minutes=2)

    log.info("札を取りに行きます（枝 %s）", ref)
    gh(
        f"repos/{REPO}/actions/workflows/{WORKFLOW}/dispatches",
        "POST",
        [f"ref={ref}", f"inputs[script]={SCRIPT}",
         "inputs[args]=" + json.dumps({"pubkey": pub})],
    )

    seen = set()
    end = time.time() + wait
    while time.time() < end:
        time.sleep(10)
        for r in candidates(ref, since):
            if r["id"] in seen or r.get("status") != "completed":
                continue
            # **封がほどけたものだけが自分のもの。** 同じワークフローを
            # 誰かが同時に押していることがある。他人の実行は消さない
            try:
                blob = join(annotations(r["id"]))
                plain = unseal(unpack(blob), pem)
            except Exception as e:  # noqa: BLE001
                # 誰かの実行か、**自分の実行が封を出す前に落ちたか**。
                # どちらか決められないので消さない。落ちたほうなら、
                # 入力（公開鍵）しか載っていないが、人の手で消す
                seen.add(r["id"])
                log.info("実行 %s は封を出していません（他人のか、落ちたか）: %s",
                         r["id"], type(e).__name__)
                continue
            drop(r["id"])
            tok = json.loads(gzip.decompress(plain))
            left = int(tok.get("exp", 0)) - int(time.time())
            log.info("札を受け取りました（あと %d 分）", max(0, left // 60))
            return tok
        log.info("まだ終わっていません（あと %d 秒まで待ちます）", int(end - time.time()))
    raise SystemExit(
        f"札が返ってきませんでした。枝 {ref} の「管理スクリプトを実行」で、"
        f"{since:%H:%M} 以降に始まった実行を見て、残っていたら消してください"
    )


def firestore(tok: dict):
    """渡された札で Firestore につなぐ。**`db()` の手元版。**"""
    from google.cloud import firestore as fs
    from google.oauth2.credentials import Credentials

    sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    from config import BQ_PROJECT_ID

    return fs.Client(project=BQ_PROJECT_ID, credentials=Credentials(token=tok["fs"]))


def _probe() -> None:
    """札が本当に通るかを見る。**どちらも読むだけ。1バイトも書かない。**

    口のほうは `GET /stickies/waiting` で見る。**オーナーでないと 403** を
    返す口のうち、読むだけで済むのはこれだけ（`ownerUid` を通る）。
    身分（Identity Toolkit）に聞くだけでは「札が本物か」までしか分からず、
    **島の口がそれをオーナーとして受けるか**は分からない。
    """
    import requests

    from _owner import API_BASE

    tok = fetch()
    res = requests.get(
        f"{API_BASE}/stickies/waiting",
        headers={"authorization": f"Bearer {tok['id']}"}, timeout=60,
    )
    # **中身は出さない**（書類IDが入っている）。通ったかと、件数だけ
    log.info(
        "口の札: HTTP %s%s", res.status_code,
        "（オーナーとして通りました）" if res.status_code == 200 else "",
    )
    n = len(list(firestore(tok).collection("islandCharacter").limit(3).stream()))
    log.info("Firestore の札: %d件 読めました", n)


if __name__ == "__main__":
    _probe()
