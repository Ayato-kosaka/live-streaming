"""Takeout の zip を、EC2 のログイン済み Chrome（`~/cdp-gphotos`）で1つずつ落とす。

    python3 takeout_dl.py list                 # 部品の数と大きさだけ（URL は出さない）
    python3 takeout_dl.py get <番号> <置き場>   # 1つ落として、置いたファイルの名前を1行出す

EC2 の `/home/ubuntu/cdp/`（`cdp.py` の隣）に置いて回す。**列 `gphotos` の札の中で。**

## なぜ Chrome で落とすか
Takeout の落とし口は Google のログインの cookie を見る。cookie を Chrome の外へ
出して curl で落とすと、あやとの Google のセッションを箱の外に持ち出すことになる。
だから Chrome に落とさせ、こちらはディスクに出来たファイルだけを読む。

## なぜ1つずつか
EC2 のディスクは空きが数 GB しかない。2GB の zip を1つ落とす → 読む（`scan --delete`）
→ 消す、を繰り返す。落とし口は1週間生きているので、途中で止まっても番号から続けられる。

## 本人確認が出たら
落とすときに Google がパスワードを聞き直すことがある。そのときは**打たずに**
終了コード 3 と `AUTH_REQUIRED` を出して止まる（画面はそのまま残す）。
あやとに頼むのは、その画面を出したまま（`/ask-ayato`）。
"""
from __future__ import annotations

import json
import sys
import time
from pathlib import Path

sys.path.insert(0, "/home/ubuntu/cdp")

MANAGE = "https://takeout.google.com/manage"
WAIT_SEC = 45 * 60

# 落とし口の a を拾う JS。字（"Download"）に頼らず、行き先の形で拾う（言語が変わっても外れない）
LINKS_JS = """[...document.querySelectorAll('a[href*="takeout/download"]')]
  .filter(a => a.offsetParent)
  .map(a => {const r = a.closest('tr,li,div'); return {t: (r && r.innerText || '').replace(/\\s+/g,' ').slice(0,80)}})"""


def _tab():
    from cdp import tab, up  # EC2 の上にしか無い

    up("gphotos")
    t = tab("gphotos")
    t.go(MANAGE, wait=6)
    return t


def _auth_needed(t) -> bool:
    return "accounts.google.com" in (t.js("location.host") or "")


def cmd_list() -> int:
    t = _tab()
    if _auth_needed(t):
        print("AUTH_REQUIRED")
        return 3
    links = t.js(LINKS_JS) or []
    print(json.dumps({"parts": len(links), "rows": [x["t"] for x in links]}, ensure_ascii=False))
    return 0


def _done_files(d: Path) -> set[str]:
    return {p.name for p in d.iterdir() if p.suffix == ".zip"}


def cmd_get(i: int, out: str) -> int:
    d = Path(out)
    d.mkdir(parents=True, exist_ok=True)
    t = _tab()
    if _auth_needed(t):
        print("AUTH_REQUIRED")
        return 3
    t.call("Browser.setDownloadBehavior", behavior="allow", downloadPath=str(d), eventsEnabled=True)
    before = _done_files(d)
    n = t.js(f"""(()=>{{const a=[...document.querySelectorAll('a[href*="takeout/download"]')].filter(a=>a.offsetParent);
      if(!a[{i}]) return a.length; a[{i}].removeAttribute('target'); a[{i}].click(); return -1}})()""")
    if n != -1:
        print(f"NO_PART {i} of {n}")
        return 2
    t0 = time.time()
    while time.time() - t0 < WAIT_SEC:
        time.sleep(5)
        if _auth_needed(t):
            print("AUTH_REQUIRED")
            return 3
        partial = [p for p in d.iterdir() if p.suffix == ".crdownload"]
        new = _done_files(d) - before
        if new and not partial:
            name = sorted(new)[0]
            print(json.dumps({"file": name, "bytes": (d / name).stat().st_size}))
            return 0
    print("TIMEOUT")
    return 4


def main(argv: list[str]) -> int:
    if argv[:1] == ["list"]:
        return cmd_list()
    if len(argv) == 3 and argv[0] == "get":
        return cmd_get(int(argv[1]), argv[2])
    print(__doc__)
    return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
