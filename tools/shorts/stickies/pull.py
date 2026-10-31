"""島の付箋を1件ぶん読んで、暗号化する。**平文はこの1回の中で消す。**

    python3 tools/shorts/stickies/pull.py "$RUNNER_TEMP/stickies/00/item.json"

item.json は order.py が置いたもの。読んだ応答は `$RUNNER_TEMP` の下にだけ書き、
seal.py（ingest と同じ形）で包んで、item.json の隣の `sealed/` に
manifest.json / key.enc / payload.enc を置く。作業枝に積むのは次の step（push.sh）。

## ログに出すのは数だけ

付箋には視聴者さんの表示名と本文が入る。島では、あやとが「しまう」で下ろせるし、
本人が名前を変えることもできる。**git の履歴と Actions のログは、あとから消せない**
（リポジトリもログも公開）。だからここで出すのは、HTTP の状態・バイト数・枚数・
返事済みの枚数・いちばん新しい付箋の日（JST）・続きがあるか、だけ。

- **テーマの名前も応答からは出さない。** 島の口は表に無い宛先にも貼れる（`docs/island-api.md` 4章）
  ので、宛先の名前そのものを視聴者さんが決められる
- **例外の文面も出さない。型の名前だけ。** `int('…')` や日付の読み損ないは、読めなかった値を
  文面に入れて返す。openssl が落ちたときの `CalledProcessError` は、AES の鍵を渡した引数ごと文面に入る
- curl の言うことも出さない（終了コードだけ）。本文は `-o` で書くだけで、標準出力には来ない

## 落とすもの（赤くする）

200 でない・本文が空・JSON でない（Hosting は口が無いと 200 で HTML を返すことがある）・
`notes` が無い・**0枚**。0枚を緑にしないのは、テーマの綴りを1字間違えても島の口は
200 と空の一覧を返すから。「頼みが無い」と「読む先を間違えた」が同じ緑になる。

終了コード 0=読んで包んだ / 1=上のどれかで落とした（何も置かない） /
2=回せない（curl・openssl・RUNNER_TEMP が無い、平文を git の中に書くことになる）。
"""

from __future__ import annotations

import datetime as dt
import json
import os
import shutil
import subprocess
import sys
import tempfile
import urllib.parse
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "ingest"))
from seal import seal  # noqa: E402

BASE = "https://live-streaming-d3cac.web.app/island-api"
JST = dt.timezone(dt.timedelta(hours=9))
# 見張り（pull_selftest.py）だけが手元の偽の口へ向ける。ほかの宛先へは向けさせない
# （読む先が変わると、ここで守っているものの前提が全部変わる）
LOOPBACK = "http://127.0.0.1:"


class Fail(Exception):
    """ログに出してよい理由だけを持つ。"""


def inside_git(p: Path) -> Path | None:
    p = p.resolve()
    for a in [p, *p.parents]:
        if (a / ".git").exists():
            return a
    return None


def base_url() -> str:
    b = os.environ.get("STICKIES_BASE") or BASE
    if b != BASE and not b.startswith(LOOPBACK):
        raise Fail(f"読む先は {BASE} だけ（STICKIES_BASE が別の宛先を指している）")
    return b


def fetch(item: dict, body: Path) -> tuple[int, int]:
    q = {"limit": str(item["limit"])}
    if item.get("theme"):
        q["theme"] = item["theme"]
    url = f"{base_url()}/stickies?{urllib.parse.urlencode(q)}"
    # 30秒で見切る。島の口は Hosting → Functions で、冷えていても数秒で返る。
    # 5xx と時間切れは curl が2回まで取り直す（--retry は 500/502/503/504/408/429 を拾う）
    r = subprocess.run(
        ["curl", "-sS", "--connect-timeout", "10", "--max-time", "30", "--retry", "2",
         "--retry-delay", "3", "-H", "Accept: application/json", "-o", str(body),
         "-w", "%{http_code}", url],
        capture_output=True, text=True)
    if r.returncode != 0:
        raise Fail(f"curl が終了コード {r.returncode} で止まった（届かない・時間切れ）")
    code = int(r.stdout.strip() or 0)
    return code, body.stat().st_size if body.exists() else 0


def jst_day(iso: object) -> str | None:
    try:
        t = dt.datetime.fromisoformat(str(iso).replace("Z", "+00:00"))
    except ValueError:
        return None
    if t.tzinfo is None:
        return None
    return t.astimezone(JST).date().isoformat()


def count(raw: bytes) -> dict:
    if not raw:
        raise Fail("本文が空")
    try:
        doc = json.loads(raw.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError):
        raise Fail("本文が JSON として読めない（口が無いと Hosting は HTML を返す）") from None
    notes = doc.get("notes") if isinstance(doc, dict) else None
    if not isinstance(notes, list):
        raise Fail("本文に notes の並びが無い")
    if not notes:
        raise Fail("付箋が0枚（テーマの綴りを確かめる。綴りを間違えても口は 200 と空の一覧を返す）")
    days = [d for d in (jst_day(n.get("createdAt")) for n in notes if isinstance(n, dict)) if d]
    return {
        "notes": len(notes),
        "replied": sum(1 for n in notes if isinstance(n, dict) and n.get("reply")),
        "newest_jst": max(days) if days else None,
        "more": doc.get("more") is True,
    }


def pull(item_path: Path) -> int:
    rt = os.environ.get("RUNNER_TEMP")
    if not rt:
        print("::error::RUNNER_TEMP が無い（平文を置いてよい場所が決まらない）")
        return 2
    for tool in ("curl", "openssl"):
        if not shutil.which(tool):
            print(f"::error::{tool} が無い")
            return 2
    item = json.loads(item_path.read_text(encoding="utf-8"))
    sealed = item_path.parent / "sealed"
    if sealed.exists():
        shutil.rmtree(sealed)
    if inside_git(Path(rt)) or inside_git(item_path.parent):
        print("::error::平文を git の作業ツリーの中に書くことになるので断る")
        return 2
    plain = Path(tempfile.mkdtemp(prefix="stickies-plain-", dir=rt))
    try:
        out = plain / "out"
        out.mkdir()
        body = out / "stickies.json"
        code, size = fetch(item, body)
        if code != 200:
            raise Fail(f"島の口が HTTP {code} を返した（{size:,}バイト。本文はログに出さない）")
        # 200 で本文が空のとき、curl は -o のファイルを作らないことがある
        c = count(body.read_bytes() if body.exists() else b"")
        # 何を頼んで何が来たか。応答は1バイトも書き換えずに stickies.json のまま包む
        (out / "request.json").write_text(json.dumps(
            {"theme": item.get("theme") or "", "limit": item["limit"], "http": code, "bytes": size,
             "counts": c, "fetched_at": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
             "run": os.environ.get("RUN_URL")}, ensure_ascii=False, indent=1) + "\n",
            encoding="utf-8")
        man = seal(item, out, sealed, {"stages": {"fetch": "ok"}, "counts": c})
        print(f"読んだ: HTTP {code}・{size:,}バイト・{c['notes']}枚（返事済み {c['replied']}）・"
              f"いちばん新しい {c['newest_jst'] or '日付なし'}（JST）・続き {'あり' if c['more'] else 'なし'}")
        print(f"包んだ: {item['dest']}  暗号文 {man['bytes']['encrypted']:,}バイト  "
              f"鍵 {item['pubkey_sha256'][:16]}…")
        return 0
    except Fail as e:
        print(f"::error::付箋を読めなかった: {e}")
    except Exception as e:  # noqa: BLE001 — 文面に読んだ値や鍵が混ざるので、型の名前だけを出す
        print(f"::error::付箋を読めなかった: {type(e).__name__}（文面はログに出さない）")
    finally:
        # **平文はこの1回の中で消す。** 落ちたときも消す（次の step に平文を残さない）
        shutil.rmtree(plain, ignore_errors=True)
    # 落ちたときは、包みかけたものも残さない（次の step が半端な暗号文を積まないように）
    shutil.rmtree(sealed, ignore_errors=True)
    return 1


def main() -> int:
    if len(sys.argv) != 2:
        print("使い方: pull.py ITEM.json")
        return 2
    return pull(Path(sys.argv[1]))


if __name__ == "__main__":
    sys.exit(main())
