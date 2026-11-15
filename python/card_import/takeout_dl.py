"""Takeout の zip を、EC2 のログイン済み Chrome（`~/cdp-gphotos`）で1つずつ落とす。

    python3 takeout_dl.py list <書き出しのID>                 # 部品の数（URL は出さない）
    python3 takeout_dl.py get <書き出しのID> <番号> <置き場>   # 1つ落として、置いたファイルの名前を1行出す

    python3 takeout_dl.py drive-list <控え.json>              # ドライブの Takeout の zip を数えて、ID を控えに書く
    python3 takeout_dl.py drive-get <控え.json> <番号> <置き場>  # 控えの n 番目を落とす

**既定はドライブ届け（drive-*）。** メールのリンクで届けた書き出しは、落とすたびに
Google がパスワードを聞き直す（2026-11-15 に本物で当たった）。ドライブから落とすぶんには
聞かれないので、18個を何時間かけて落としても、あやとの手は書き出しを作るときの1回で済む。

書き出しの ID は `https://takeout.google.com/manage` で行を開いた先の
`/manage/archive/<ID>`。落とし口はこの面にしか並ばない（一覧の面には無い）。

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

ARCHIVE = "https://takeout.google.com/manage/archive/{}"
WAIT_SEC = 45 * 60

# 落とし口の a を拾う JS。字（"Download"）に頼らず、行き先の形で拾う（言語が変わっても外れない）
LINKS_JS = """[...document.querySelectorAll('a[href*="takeout/download"]')]
  .filter(a => a.offsetParent)
  .map(a => ({t: (a.getAttribute('aria-label') || a.innerText || '').replace(/\\s+/g,' ').slice(0,80)}))"""


def _tab(archive: str):
    from cdp import tab, up  # EC2 の上にしか無い

    up("gphotos")
    t = tab("gphotos")
    t.go(ARCHIVE.format(archive), wait=6)
    return t


def _auth_needed(t) -> bool:
    return "accounts.google.com" in (t.js("location.host") or "")


def cmd_list(archive: str) -> int:
    t = _tab(archive)
    if _auth_needed(t):
        print("AUTH_REQUIRED")
        return 3
    links = t.js(LINKS_JS) or []
    print(json.dumps({"parts": len(links), "rows": [x["t"] for x in links]}, ensure_ascii=False))
    return 0


def _done_files(d: Path) -> set[str]:
    return {p.name for p in d.iterdir() if p.suffix == ".zip"}


def cmd_get(archive: str, i: int, out: str) -> int:
    d = Path(out)
    d.mkdir(parents=True, exist_ok=True)
    t = _tab(archive)
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


DRIVE_SEARCH = "https://drive.google.com/drive/search?q=takeout-"
DRIVE_GET = "https://drive.usercontent.google.com/download?id={}&export=download&authuser=0"


def cmd_drive_list(memo: str) -> int:
    """ドライブの検索の面を下まで送って、zip の名前と ID を拾う。控えは EC2 の中にだけ置く。"""
    from cdp import tab, up

    up("gphotos")
    t = tab("gphotos")
    t.go(DRIVE_SEARCH, wait=10)
    if _auth_needed(t):
        print("AUTH_REQUIRED")
        return 3
    found: dict[str, str] = {}
    for _ in range(30):
        rows = t.js("""[...document.querySelectorAll('[data-id]')].filter(e=>e.offsetParent)
          .map(e=>[(e.innerText.match(/takeout-[^\\s]*\\.zip/)||[''])[0], e.getAttribute('data-id')])
          .filter(r=>r[0])""") or []
        before = len(found)
        for name, fid in rows:
            found.setdefault(name, fid)
        # 一覧は見えたぶんだけ描く。いちばん下へ送って、増えなくなるまで
        t.js("""(()=>{const s=[...document.querySelectorAll('div')].filter(d=>d.scrollHeight>d.clientHeight+50&&getComputedStyle(d).overflowY!='visible').sort((a,b)=>b.scrollHeight-a.scrollHeight)[0]; if(s) s.scrollTop=s.scrollHeight})()""")
        time.sleep(2)
        if len(found) == before and _ > 2:
            break
    items = [{"name": n, "id": found[n]} for n in sorted(found)]
    Path(memo).write_text(json.dumps(items))
    print(json.dumps({"zips": len(items), "first": items[0]["name"] if items else None,
                      "last": items[-1]["name"] if items else None}))
    return 0


def cmd_drive_get(memo: str, i: int, out: str) -> int:
    from cdp import tab, up

    items = json.loads(Path(memo).read_text())
    if i >= len(items):
        print(f"NO_PART {i} of {len(items)}")
        return 2
    d = Path(out)
    d.mkdir(parents=True, exist_ok=True)
    name = items[i]["name"]
    if (d / name).exists():
        print(json.dumps({"file": name, "bytes": (d / name).stat().st_size, "already": True}))
        return 0
    up("gphotos")
    t = tab("gphotos")
    t.call("Browser.setDownloadBehavior", behavior="allow", downloadPath=str(d), eventsEnabled=True)
    before = _done_files(d)
    t.go(DRIVE_GET.format(items[i]["id"]), wait=6)
    if _auth_needed(t):
        print("AUTH_REQUIRED")
        return 3
    # 大きいファイルは「ウイルスを確かめられません」の面が先に出る。その面の送り出し（form）を押す
    t.js("""(()=>{const f=document.querySelector('form#download-form, form[action*="download"]'); if(f){f.submit(); return 'form'} return 'none'})()""")
    t0 = time.time()
    while time.time() - t0 < WAIT_SEC:
        time.sleep(5)
        partial = [p for p in d.iterdir() if p.suffix == ".crdownload"]
        new = _done_files(d) - before
        if new and not partial:
            got = sorted(new)[0]
            print(json.dumps({"file": got, "bytes": (d / got).stat().st_size}))
            return 0
    print("TIMEOUT")
    return 4


def main(argv: list[str]) -> int:
    if len(argv) == 2 and argv[0] == "drive-list":
        return cmd_drive_list(argv[1])
    if len(argv) == 4 and argv[0] == "drive-get":
        return cmd_drive_get(argv[1], int(argv[2]), argv[3])
    if len(argv) == 2 and argv[0] == "list":
        return cmd_list(argv[1])
    if len(argv) == 4 and argv[0] == "get":
        return cmd_get(argv[1], int(argv[2]), argv[3])
    print(__doc__)
    return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
