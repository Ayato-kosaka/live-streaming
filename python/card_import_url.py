"""写真の取り込みの受け取り口（tar 1本ぶんの署名付き PUT URL）を、作業箱から1コマンドでもらう。

    python3 python/card_import_url.py --batch 2026-11-14-takeout
    # → 標準出力に URL が1行だけ出る（1時間で切れる）。上げかた:
    #   curl --fail -T batch.tar "$(python3 python/card_import_url.py --batch …)"

やること: この回だけの鍵を作る → Actions（`card_import.yml` の mode=url）を起こす →
結果（公開鍵で包んだ URL）が作業枝に届くのを待つ → 開いて URL を出す → 作業枝の暗号文と鍵を消す。

**なぜこの形か。** 作業箱には GCP の資格情報が無い。URL を作れるのは Actions だけで、
Actions のログは公開。URL は持っている人なら誰でも上げられる鍵なので、
`tools/shorts/preview/put.py` と同じく「この回だけの鍵で包んで作業枝に返す」。
秘密鍵はリポジトリの外の一時の場所にだけ置き、終わったら消す。

標準出力には URL だけ。進み具合は標準エラーに出す（`$(…)` でそのまま渡せるように）。
"""

from __future__ import annotations

import argparse
import json
import secrets
import shutil
import subprocess
import sys
import tempfile
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(ROOT / "tools/shorts/preview"))
sys.path.insert(0, str(ROOT / "tools/shorts/ingest"))
import branch as br  # noqa: E402
import card_import_actions as cia  # noqa: E402
import decrypt  # noqa: E402

REPO = "Ayato-kosaka/live-streaming"
WORKFLOW = "card_import.yml"
BRANCH = "claude/card-import-inbox"


def say(msg: str) -> None:
    print(msg, file=sys.stderr, flush=True)


def keypair(td: Path) -> tuple[Path, str]:
    priv = td / "priv.pem"
    subprocess.run(["openssl", "genpkey", "-algorithm", "RSA", "-pkeyopt", "rsa_keygen_bits:3072",
                    "-out", str(priv)], check=True, capture_output=True)
    pub = subprocess.run(["openssl", "pkey", "-in", str(priv), "-pubout"], check=True,
                         capture_output=True, text=True).stdout
    return priv, pub


def dispatch(batch: str, pub: str, nonce: str, branch: str, ref: str) -> None:
    args = ["gh", "api", "-X", "POST", f"repos/{REPO}/actions/workflows/{WORKFLOW}/dispatches",
            "-f", f"ref={ref}", "-f", "inputs[mode]=url", "-f", f"inputs[batch]={batch}",
            "-f", f"inputs[pubkey]={pub}", "-f", f"inputs[nonce]={nonce}",
            "-f", f"inputs[branch]={branch}"]
    r = subprocess.run(args, capture_output=True, text=True)
    if r.returncode != 0:
        raise RuntimeError(f"ワークフローを起こせなかった: {r.stderr.strip()[:300]}")


def wait(branch: str, rel: str, timeout: float, every: float = 6) -> str:
    """作業枝に結果の manifest が現れるまで待つ。枝がまだ無い間も待つ（初めての回は Actions が作る）。"""
    t0 = time.time()
    while True:
        try:
            sha = br.fetch(branch)
            if br.read_json(sha, f"{rel}/manifest.json") is not None:
                return sha
        except RuntimeError:
            pass
        if time.time() - t0 > timeout:
            raise TimeoutError(f"{timeout:.0f}秒待っても結果が来ない（Actions の「写真の取り込み」を見る）")
        time.sleep(every)


def open_url(sha: str, rel: str, priv: Path, out: Path) -> dict:
    with tempfile.TemporaryDirectory(dir=out) as td:
        d = br.extract(sha, rel, Path(td))
        ok, msg = decrypt.open_one(d, priv, decrypt.pub_fp(priv), out)
    if not ok:
        raise RuntimeError(f"開けない: {msg}")
    # 開く先は manifest の dest（card_import_actions.seal_url の `cardimport/<nonce>`）
    nonce = rel.rsplit("/", 1)[1]
    return json.loads((out / "cardimport" / nonce / "inbox.json").read_text(encoding="utf-8"))


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--batch", required=True, help="取り込みの名前（manifest の batch と同じ）")
    ap.add_argument("--branch", default=BRANCH, help="結果を置く作業枝（claude/ で始まる）")
    ap.add_argument("--ref", default="master", help="ワークフローを起こす枝")
    ap.add_argument("--timeout", type=float, default=900)
    a = ap.parse_args(argv)
    cia.inbox_object(a.batch)
    nonce = secrets.token_urlsafe(18)
    rel = cia.result_dir(nonce)
    # 秘密鍵と、開いた URL はリポジトリの外にだけ置く（decrypt.py もそれを見る）
    td = Path(tempfile.mkdtemp(prefix="cardimport-"))
    try:
        if decrypt.inside_git(td):
            raise RuntimeError("一時の場所が git の中にある。TMPDIR をリポジトリの外にする")
        priv, pub = keypair(td)
        say(f"Actions を起こす（{a.batch}）")
        dispatch(a.batch, pub, nonce, a.branch, a.ref)
        sha = wait(a.branch, rel, a.timeout)
        say("結果が届いた。開く")
        out = td / "out"
        out.mkdir()
        body = open_url(sha, rel, priv, out)
        if body.get("batch") != a.batch or not str(body.get("put", "")).startswith("https://"):
            raise RuntimeError("届いた中身が頼んだ回のものでない")
        print(body["put"], flush=True)
        say(f"URL は {body.get('put_expires')} まで。置いた tar は1日で消える"
            "（その前に card_import.yml の mode=ingest を回す）")
        try:
            br.push_change(a.branch, {}, [rel],
                           "写真の取り込みの受け取り口の暗号文を下ろす\n\n"
                           "開き終わったので、包んだ URL を作業枝に残さない。")
        except RuntimeError as e:
            say(f"暗号文を下ろせなかった（残っていても鍵が無いので開けない）: {e}")
        return 0
    finally:
        shutil.rmtree(td, ignore_errors=True)


if __name__ == "__main__":
    try:
        sys.exit(main())
    except (cia.Bad, RuntimeError, TimeoutError) as e:
        say(f"!! {e}")
        sys.exit(1)
