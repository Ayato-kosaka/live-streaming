"""付箋を読む依頼（`shorts/stickies/<名前>.json` か workflow_dispatch の入力）を読んで、
1件ずつ `OUT/NN/item.json` に置く。Actions の「依頼を読む」から呼ぶ。

    python3 tools/shorts/stickies/order.py "$RUNNER_TEMP/stickies"
    python3 tools/shorts/stickies/order.py --check shorts/stickies/x.json   # 手元で形だけ見る

    {"theme": "shorts-idea", "limit": 300, "pubkey": "-----BEGIN PUBLIC KEY-----…"}

| 欄 | 意味 | 既定 |
| --- | --- | --- |
| `theme` | 付箋のテーマ（島の `THEME_ID` と同じ形）。**空ならテーマ横断の新着** | `shorts-idea` |
| `limit` | 何枚まで読むか（1〜300。島の口が 300 で切るので、それより上は受けない） | 300 |
| `pubkey` | 応答を包む作業箱の公開鍵。RSA 2048bit 以上（ingest と同じ形・同じ確かめかた） | 必須 |

**push のときは、その push で足された・書き換えられた依頼だけを拾う**（ingest の plan.py と
同じ compare の読みかた）。置いてある依頼を全部拾うと、1件足すたびに過去の依頼が全部走り直す。

**依頼の置き場を `shorts/requests/` にしないのは、ショートの取り込み（`shorts_ingest.yml`）が
そこを見ているから。** 同じ置き場に付箋の依頼を置くと、取り込みも起きて「mode が無い」で赤くなる。
"""

from __future__ import annotations

import json
import os
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "ingest"))
from plan import Bad, compare_files, norm_pem, out_branch  # noqa: E402

ROOT = HERE.parents[2]
REQ_DIR = "shorts/stickies/"
# 島の口（functions/src/islandApi.ts の THEME_ID）と同じ形。形の違う宛先は口が 400 で断るので、
# 1分かけて Actions を起こしてから断られるより、ここで止める
THEME_ID = re.compile(r"^[a-z][a-z0-9-]{1,39}$")
DEFAULT_THEME = "shorts-idea"
# 島の口は 300 より上を黙って 300 に丸める（clampPage）。丸めたまま「300 頼んで 300 来た」と
# 読むと、続きがあるのか分からなくなるので、上限の外は受けない
MAX_LIMIT = 300
# テーマ横断の置き場の名前。THEME_ID は英小文字で始まるので、`_` で始まる名前は
# 本物のテーマとぶつからない（`all` だと、表に無い宛先として誰かが貼れてしまう）
ALL = "_all"
MAX_REQS = 5


def read_request(req: dict, origin: str) -> dict:
    theme = req.get("theme", DEFAULT_THEME)
    theme = "" if theme is None else str(theme).strip()
    if theme and not THEME_ID.match(theme):
        raise Bad(f"{origin}: theme の形が違う: {theme!r}（英小文字・数字・- で40字まで。空ならテーマ横断）")
    raw = req.get("limit", MAX_LIMIT)
    try:
        limit = int(str(raw).strip())
    except ValueError:
        raise Bad(f"{origin}: limit が数でない: {raw!r}") from None
    if not 1 <= limit <= MAX_LIMIT:
        raise Bad(f"{origin}: limit は 1〜{MAX_LIMIT}（来たのは {limit}）")
    pem, fp = norm_pem(req.get("pubkey", ""))
    slot = theme or ALL
    # 形は seal.py の item に合わせる（key / mode / dest / pubkey / pubkey_sha256 / req）。
    # そうしておけば ingest の decrypt.py がそのまま開ける
    return {"key": f"stickies__{slot}", "mode": "stickies", "dest": f"stickies/{slot}",
            "theme": theme, "limit": limit, "pubkey": pem, "pubkey_sha256": fp, "req": origin}


def changed_requests() -> list[str]:
    """この push で足された・書き換えられた依頼。"""
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
        return [read_request({"theme": g("IN_THEME", ""), "limit": g("IN_LIMIT", "") or MAX_LIMIT,
                              "pubkey": g("IN_PUBKEY", "")}, "workflow_dispatch")]
    files = changed_requests()
    print(f"この push で来た依頼: {len(files)}件")
    return [read_request(json.loads((ROOT / f).read_text(encoding="utf-8")), f) for f in files]


def main() -> int:
    if len(sys.argv) > 2 and sys.argv[1] == "--check":
        for f in sys.argv[2:]:
            r = read_request(json.loads(Path(f).read_text(encoding="utf-8")), f)
            print(f"ok  {r['dest']}  {r['limit']}枚まで  鍵 {r['pubkey_sha256'][:16]}…")
        return 0
    if len(sys.argv) != 2:
        print("使い方: order.py OUT_DIR  /  order.py --check 依頼.json …")
        return 1
    out = Path(sys.argv[1])
    # 同じ置き場が2回来たら、あとのほうを使う（ingest と同じ）
    uniq: dict[str, dict] = {}
    for r in requests_now():
        uniq[r["dest"]] = r
    items = list(uniq.values())
    if len(items) > MAX_REQS:
        raise Bad(f"1回に {MAX_REQS}件まで（来たのは {len(items)}件）")
    branch = out_branch()
    for i, it in enumerate(items):
        d = out / f"{i:02d}"
        d.mkdir(parents=True, exist_ok=True)
        (d / "item.json").write_text(json.dumps(it, ensure_ascii=False), encoding="utf-8")
        # 置く step が読む。push.sh の KEY はコミットの見出しにだけ使われるので、読める名前にする
        (d / "dest").write_text(it["dest"], encoding="utf-8")
        (d / "label").write_text(f"付箋 {it['theme'] or 'テーマ横断'}", encoding="utf-8")
        print(f"  {it['dest']}  {it['limit']}枚まで  鍵 {it['pubkey_sha256'][:16]}…  ← {it['req']}")
    gh_out = os.environ.get("GITHUB_OUTPUT")
    if gh_out:
        with open(gh_out, "a", encoding="utf-8") as f:
            f.write(f"count={len(items)}\nbranch={branch}\n")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Bad as e:
        print(f"::error::付箋の依頼を受けられない: {e}")
        sys.exit(1)
