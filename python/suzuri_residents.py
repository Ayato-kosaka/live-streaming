#!/usr/bin/env python3
"""住人の絵文字 → SUZURI のデザイン番号を焼く（`site/content/suzuriGoods.ts`）。

    python3 python/suzuri_residents.py            # 焼き直す
    python3 python/suzuri_residents.py --check    # 焼き直さずに、いまの中身との差だけ出す

あやと（2026-10-13）:

> 住人ページ、あやとステッカーページから「グッズを買う」ボタンで
> https://suzuri.jp/ayato_arigato/designs/21142972 こんな感じの
> スズリデザインページへの導線あると良い。

## 突き合わせの鍵は、絵文字

住人グッズの題は「カサ・アヤトの住人 ○」で（`python/suzuri_common.py` の
`TITLE`）、○ がその人の印（島の `emoji`）。**島と SUZURI をつなぐ欄は
どこにも無い**ので、題から引く。毎晩グッズを作っている
`python/suzuri_api.py characters` も同じ鍵で「まだ作っていない人」を出している。

## 鍵が無くても焼ける

`SUZURI_API_KEY` があれば公式の API（`materials`）から引く。**無ければ、
公開の検索の面から引く**（`https://suzuri.jp/search?q=カサ・アヤトの住人`）。
あの面はサーバーで組まれていて、`data-name` に題、`href` にデザイン番号が
そのまま出ている。島の面に焼くのは**公開の売り場に出ている番号だけ**なので、
鍵の要らないほうでも同じ答えになる（2026-10-13 に両方は比べていない。
鍵はこの箱に無い）。

## 焼いたものは手で直さない

`site/content/suzuriGoods.ts` は**この script の出力**。グッズが増えるのは
毎晩の `SUZURI API` ワークフローなので、**焼き直しもそこに繋ぐ**のが本筋
（`.github/workflows/suzuri_api.yml` に1行。2026-10-13 時点では未）。
手で足すと、次に焼いたとき黙って消える。
"""
from __future__ import annotations

import argparse
import json
import os
import pathlib
import re
import sys
import time
import urllib.parse
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parents[1]
DEST = ROOT / "site/content/suzuriGoods.ts"
SERIES = "カサ・アヤトの住人"
UA = {"User-Agent": "ayato-island/1.0 (+https://live-streaming-d3cac.web.app)"}
SEARCH = "https://suzuri.jp/search?q=" + urllib.parse.quote(SERIES)
ISLAND = "https://live-streaming-d3cac.web.app/island-api/characters"

def norm(e: str) -> str:
    """絵文字の揺れを落とす。**`python/suzuri_api.py` の `norm` と同じ式。**

    異体字セレクタ（`️`）や結合子が入ると、同じ印が別物になる。"""
    return "".join(ch for ch in (e or "") if ch not in "️‍♂♀ ")


def from_search() -> dict[str, str]:
    """公開の検索の面から、題 → デザイン番号を集める。**鍵は要らない。**"""
    pair = re.compile(
        rf"data-name='{SERIES} ([^']*)'[^>]*>.*?href=\"/ayato_arigato/(\d+)/", re.S
    )
    got: dict[str, str] = {}
    for page in range(1, 40):
        url = SEARCH + (f"&page={page}" if page > 1 else "")
        try:
            h = urllib.request.urlopen(
                urllib.request.Request(url, headers=UA), timeout=60
            ).read().decode("utf-8", "replace")
        except Exception as e:  # 途中で切れても、そこまでのぶんは返す
            print(f"  {page}ページ目で止まりました: {e}", file=sys.stderr)
            break
        found = pair.findall(h)
        if not found:
            break
        for emoji, mid in found:
            got.setdefault(norm(emoji), mid)
        time.sleep(1)
    return got


def from_api() -> dict[str, str]:
    """公式の API から。**`SUZURI_API_KEY` が要る**（Actions の中）。"""
    sys.path.insert(0, str(ROOT / "python"))
    from suzuri_api import materials  # noqa: E402

    got: dict[str, str] = {}
    for m in materials():
        t = (m.get("title") or "").strip()
        if not t.startswith(SERIES):
            continue
        e = t[len(SERIES):].strip().split()
        if not e:
            continue
        got.setdefault(norm(e[0]), str(m["id"]))
    return got


def island() -> list[dict]:
    """島の住人。**絵文字を持っている人だけ**が突き合わせの相手。"""
    raw = urllib.request.urlopen(
        urllib.request.Request(ISLAND, headers=UA), timeout=60
    ).read()
    return json.loads(raw)["characters"]


def render(pairs: dict[str, str], 島: int, 無: list[str]) -> str:
    rows = "\n".join(f'  "{e}": "{i}",' for e, i in sorted(pairs.items()))
    return f'''/**
 * 住人の印 → SUZURI のデザイン番号。**`python/suzuri_residents.py` が焼く。**
 *
 * **手で直さない**（`CLAUDE.md`「自動生成ファイルを手で直さない」）。
 * 増やすのは毎晩の住人グッズのほうで、ここはその写し。
 *
 * 焼いた日の数: 島の住人 {島}人 / 売り場にある {len(pairs)}人 /
 * まだグッズの無い人 {len(無)}人。**無い人には札を出さない**
 * （出ない理由は画面に書かない。`docs/island-standards.md` 6章）。
 */
export const GOODS_BY_EMOJI: Record<string, string> = {{
{rows}
}};

/** 印の揺れ（異体字セレクタ・結合子）を落とす。**焼くほうと同じ式。** */
const norm = (e: string) =>
  [...(e || "")].filter((c) => !"\\ufe0f\\u200d♂♀ ".includes(c)).join("");

/** その人のグッズの売り場。**無ければ null**（札を出さない） */
export function goodsOf(emoji: string | undefined | null): string | null {{
  const id = emoji ? GOODS_BY_EMOJI[norm(emoji)] : undefined;
  return id ? `https://suzuri.jp/ayato_arigato/designs/${{id}}` : null;
}}
'''


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true", help="焼かずに、差だけ出す")
    ap.add_argument("--api", action="store_true", help="公式の API から引く（鍵が要る）")
    a = ap.parse_args()

    pairs = from_api() if (a.api or os.environ.get("SUZURI_API_KEY")) else from_search()
    chars = island()
    有 = {norm(c.get("emoji", "")) for c in chars if c.get("emoji")}
    # 島に居ない印は焼かない（消えた人・題を手で変えたもの）
    pairs = {e: i for e, i in pairs.items() if e in 有}
    無 = sorted(e for e in 有 if e not in pairs)
    print(f"島 {len(chars)}人 / 売り場にある {len(pairs)}人 / グッズの無い人 {len(無)}人 {''.join(無)}")

    out = render(pairs, len(chars), 無)
    had = DEST.read_text(encoding="utf-8") if DEST.exists() else ""
    if had == out:
        print("変わりません")
        return 0
    if a.check:
        print(f"差があります（{DEST}）")
        return 1
    DEST.write_text(out, encoding="utf-8")
    print(f"焼きました: {DEST}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
