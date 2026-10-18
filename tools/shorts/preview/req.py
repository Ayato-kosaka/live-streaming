"""下見の依頼（`shorts/preview/<name>.json`）の読みかた。Actions と作業箱の両方で使う。

    {"name": "yk-v2", "place": "hosting", "action": "up",
     "files": [{"name": "A.mp4", "bytes": 30963869, "sha256": "6524…"}, …],
     "pubkey": "-----BEGIN PUBLIC KEY-----…", "nonce": "作業箱が作った乱数"}

| 欄 | 意味 |
| --- | --- |
| `place` | `hosting`（Firebase Hosting のプレビューチャンネル。いまの既定）/ `gcs`（非公開バケットの署名付き URL。#938 で付与）/ `transfer`（同じバケットの `transfer/`。EC2 へ渡す受け渡し。URL は3時間・置いたものは1日で消える。`tools/shorts/post/send.py`） |
| `action` | `up`（置く）/ `delete`（hosting のチャンネルを消す。`channel_sha256` で指す） |
| `files` | 置くファイル。hosting は大きさと sha256 が要る（ランナーが受け取ったものと、配ったあと落とし直したものを突き合わせる） |
| `pubkey` | 結果（URL）を包む作業箱の公開鍵。RSA 2048bit 以上 |
| `nonce` | 届いた結果がこの依頼のものかを、作業箱が平文の manifest で見分ける |

**平文の依頼に置くのは、名前・大きさ・sha256・公開鍵・乱数だけ。** 題（動画のタイトル）や
長さは、暗号化して渡す荷物の中（`meta.json`）に入れる。
"""

from __future__ import annotations

import json
import os
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "ingest"))
from plan import Bad, compare_files, norm_pem  # noqa: E402,F401

ROOT = HERE.parents[2]
REQ_DIR = "shorts/preview/"
PLACES = ("hosting", "gcs", "transfer")
ACTIONS = ("up", "delete")
NAME = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$")
SEG = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$")
HEX64 = re.compile(r"^[0-9a-f]{64}$")
MAX_FILES = 200
# hosting は1ファイル 2GB まで受けるが、作業枝に暗号文で積むので、ショートの下見の大きさに絞る
MAX_BYTES_HOSTING = 400 * 1024 * 1024
BRANCH_OK = re.compile(r"^claude/[A-Za-z0-9._/-]+$")


def check_files(files, origin: str, need_hash: bool) -> list[dict]:
    if isinstance(files, str):
        files = [f for f in re.split(r"[,\s]+", files) if f]
    if not files:
        raise Bad(f"{origin}: files が空")
    if len(files) > MAX_FILES:
        raise Bad(f"{origin}: 1回に {MAX_FILES} ファイルまで（来たのは {len(files)}）")
    out: list[dict] = []
    for f in files:
        ent = dict(f) if isinstance(f, dict) else {"name": str(f)}
        name = str(ent.get("name") or "")
        # 置き場の道にそのまま使うので、ASCII の名前に絞る（`..` も先頭の `/` も通さない）
        if not all(SEG.match(p) for p in name.split("/")):
            raise Bad(f"{origin}: ファイル名の形が違う: {name!r}（英数字と . _ - と / だけ）")
        if any(o["name"] == name for o in out):
            raise Bad(f"{origin}: 同じ名前が2回: {name!r}")
        if need_hash:
            if not HEX64.match(str(ent.get("sha256") or "")):
                raise Bad(f"{origin}: {name} の sha256 が無い・形が違う")
            if not isinstance(ent.get("bytes"), int) or ent["bytes"] <= 0:
                raise Bad(f"{origin}: {name} の bytes が無い")
        out.append({k: ent[k] for k in ("name", "bytes", "sha256") if k in ent})
    if need_hash and sum(o["bytes"] for o in out) > MAX_BYTES_HOSTING:
        raise Bad(f"{origin}: 合計 {MAX_BYTES_HOSTING // 2**20}MB まで")
    return out


def read_request(req: dict, origin: str) -> dict:
    name = str(req.get("name") or "")
    if not NAME.match(name):
        raise Bad(f"{origin}: name の形が違う: {name!r}（英数字と . _ - で64字まで）")
    place = req.get("place") or "hosting"
    action = req.get("action") or "up"
    if place not in PLACES:
        raise Bad(f"{origin}: place は {PLACES} のどれか")
    if action not in ACTIONS or (action == "delete" and place != "hosting"):
        raise Bad(f"{origin}: action は up / delete（delete は hosting だけ）")
    pem, fp = norm_pem(req.get("pubkey", ""))
    nonce = str(req.get("nonce") or "")
    if not re.match(r"^[A-Za-z0-9_-]{8,64}$", nonce):
        raise Bad(f"{origin}: nonce が無い・形が違う")
    out = {"name": name, "place": place, "action": action, "pubkey": pem,
           "pubkey_sha256": fp, "nonce": nonce, "req": origin}
    if action == "delete":
        ch = str(req.get("channel_sha256") or "")
        if not HEX64.match(ch):
            raise Bad(f"{origin}: delete は channel_sha256（チャンネル名の sha256）が要る")
        out["channel_sha256"] = ch
        out["files"] = []
    else:
        out["files"] = check_files(req.get("files"), origin, need_hash=place == "hosting")
    return out


def changed_requests() -> list[str]:
    """この push で足された・書き換えられた依頼（ingest の plan.py と同じ読みかた）。"""
    ev = json.loads(Path(os.environ["GITHUB_EVENT_PATH"]).read_text(encoding="utf-8"))
    before = ev.get("before") or ""
    head = ev.get("after") or os.environ.get("GITHUB_SHA", "")
    if not before.strip("0"):
        before = (ev.get("repository") or {}).get("default_branch") or "master"
    seen: list[str] = []
    for f in compare_files(before, head):
        if f.startswith(REQ_DIR) and f.endswith(".json") and f.count("/") == 2 and f not in seen:
            seen.append(f)
    return [f for f in seen if (ROOT / f).is_file()]


def requests_now() -> list[dict]:
    g = os.environ.get
    if g("GITHUB_EVENT_NAME") == "workflow_dispatch":
        # 入力欄は1行。hosting の files は JSON（名前・大きさ・sha256 の並び）で渡す
        files = g("IN_FILES", "")
        try:
            files = json.loads(files)
        except json.JSONDecodeError:
            pass
        return [read_request({"name": g("IN_NAME", ""), "place": g("IN_PLACE", ""),
                              "action": g("IN_ACTION", ""), "files": files,
                              "channel_sha256": g("IN_CHANNEL_SHA256", ""),
                              "pubkey": g("IN_PUBKEY", ""), "nonce": g("IN_NONCE", "")},
                             "workflow_dispatch")]
    files = changed_requests()
    print(f"この push で来た依頼: {len(files)}件")
    return [read_request(json.loads((ROOT / f).read_text(encoding="utf-8")), f) for f in files]


def out_branch() -> str:
    b = (os.environ.get("IN_BRANCH") or "").strip() or os.environ.get("GITHUB_REF_NAME", "")
    if not BRANCH_OK.match(b):
        raise Bad(f"結果を置く枝は claude/ で始まる名前にする（来たのは {b!r}）")
    return b


def main() -> int:
    # 手元で依頼の形だけ見る: python3 tools/shorts/preview/req.py shorts/preview/x.json
    for f in sys.argv[1:]:
        r = read_request(json.loads(Path(f).read_text(encoding="utf-8")), f)
        print(f"ok  {r['name']}  {r['place']}/{r['action']}  {len(r['files'])}ファイル"
              f"  鍵 {r['pubkey_sha256'][:16]}…")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Bad as e:
        print(f"!! {e}")
        sys.exit(1)
