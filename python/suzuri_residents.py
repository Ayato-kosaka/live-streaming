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

`site/content/suzuriGoods.ts` は**この script の出力**。毎晩の焼き直し
（`.github/workflows/rebake.yml`）の10本目として回る。手で足すと、次に焼いたとき黙って消える。

**グッズを作っているのは別のワークフロー**（`SUZURI API` の `characters`）だが、
焼き直しはそちらに相乗りさせていない。`rebake.yml` は commit と push、Hosting の
起動、やせたときの関所、凍りの見張りを**もう全部持っている**ので、そこへ1行
足すだけで同じ守りが効く。作った晩と焼く晩がずれるぶん（どちらも取り込みの
完了から起きるので、同じ晩のうち）は、札が1日遅れて出るだけ。

**名簿を焼いたあとに焼く。** `ALL` のいちばん後ろに置いてあるのは、
`rebake.yml` の関所が名簿（`residents.ts`）と帳尻を合わせる（`match`）ため——
先に焼くと、**前の晩の名簿と今晩のグッズ**を突き合わせることになる。

## やせたら焼かない（関所）

**鍵が無いときの出どころは、公開の検索の面**。あそこはこちらの持ちものでは
ないので、組み方が変われば正規表現は黙って0件になる。そのまま焼くと
`GOODS_BY_EMOJI` が空になり、**島じゅうの「グッズを買う」札が
いっぺんに消える。** 消えたことは画面に出ない——札は「無ければ出さない」
作りなので（`goodsOf()` が `null` を返す）、**誰も赤くならない。**

だから `rebake.yml` の step「中の数が縮んでいないか」と同じ考えで、
**書く前に止める**（`gate()`）。止めた回は **2** で終わる
（`tools/nordic_sun.py` が座標の無い街で断るのと同じコード）。

### 物差しは「前の晩に焼いてあった鍵」。ただし**島から抜けた人は分母の外**

前の版と引き比べるだけだと、**正しい縮みまで止まる。** 名簿
（`residents.ts` ＝ 直近90日で来てくれている人）から誰かが抜けた晩は、
`pairs` もそのぶん減るのが正しい。`characterBox.ts` が「前の版」を
物差しにして毎晩止まりかけたのと同じ形（`rebake.yml` の
`characterBox.ts` の注。103 → 100 は**正しい縮み**だった）。

減った鍵は2つに分ける。

| | 何が起きたか | どうするか |
| --- | --- | --- |
| 島に**もう居ない**印 | 名簿から抜けた（90日来ていない） | **通す**（分母の外） |
| 島に**まだ居る**印 | あやとがデザインを下げた／引き方が壊れた | **数える** |

### しきい値 5%（＝`KEEP` 95）の出どころ

2026-10-13 に実測した3つのあいだに置いた。**しきい値から作った数は1つも無い。**

| 何が起きたとき | 島に居るのに引けない鍵 | 割合 |
| --- | ---: | ---: |
| あやとがデザインを1つ下げた | 1 | **1.01%**（1/99） |
| 検索の面を1ページ取りこぼした | **24** | **24.2%**（24/99） |
| 検索の面の組み方が変わった | 99 | 100% |

1ページが24件なのは、実際に `https://suzuri.jp/search?q=カサ・アヤトの住人`
を引いて数えた（2026-10-13。99件は5ページに分かれる）。`from_search()` は
**途中で切れてもそこまでのぶんを返す**ので、1ページ落ちは起こりうる。

5% は 1.01 と 24.2 のあいだ。いまの99件なら**4件まで通って、5件で止まる**
（`python/suzuri_gate_selftest.py` が境目の両隣を実測して印字する）。
`rebake.yml` の `shorts.ts` が「1本非公開になっても 1.2% なので 0.95」と
置いているのと同じ形で、同じ数にそろえてある。

名簿の側は19晩ぶん実測した（`site/content/residents.ts` の git。
2026-09-25〜10-13）。**抜け 0人 / 入り 2人**で、一晩で名簿が縮んだことは
まだ一度も無い。いつか縮む側（90日来ていない人が落ちる）なので、
そこは割合ではなく**分母の外**に出してある——何人まとめて抜けても通る。

**0件は、割合を見る前に止める。** 分母が99でも0でも「100%失った」は
同じ字になるので、数えるものが無い側と混ぜない（`docs/island-standards.md` §15）。

対照は `python/suzuri_gate_selftest.py`（ネットも鍵も要らない）。

### `rebake.yml` の「中の数が縮んでいないか」と、**二重ではない。層が違う**

`site.ts` と同じ形（`rebake.yml` の `site.ts` の注）。

| | 何を見るか | 止めるもの |
| --- | --- | --- |
| ここ（`gate()`） | **売り場から引けた数**が、名簿を踏まえて説明のつく減り方か | **書くこと** |
| あちら（`match`） | **焼いた結果**が、名簿（`residents.ts`）と帳尻が合っているか | **commit** |

ここが無いと、売り場が0件を返した晩に**空の表が書かれ**、あちらが commit を
止める。止まるのは正しいが、**同じ晩に焼けた他の9本まで master に入らなくなる**
（`docs/island-misses.md` #105「1本が落ちても後ろを止めない」）。しかも次の晩も
同じ0件が焼けるので、**人が来るまで毎晩止まる。**
ここで書かずに引き下がれば、表は前のまま・他の9本は配られ、run の最後だけが赤くなる。

## まだグッズの無い人を、名指しで書く（`NO_GOODS`）

`rebake.yml` の関所が「グッズ＋まだ作っていない人＝名簿」で帳尻を合わせるので、
**作っていない人を名指しで置いておかないと、1人いるだけで永久に止まる。**
`characterBox.ts` の `noArt` と同じ形。

島はこの並びを読まない（札は `goodsOf()` が `null` を返せば出ない）。
**出ない理由を画面に書かないため**で、ここに在るのは見張りのための数え先
（`docs/island-standards.md` 6章）。
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
from dataclasses import dataclass, field

ROOT = pathlib.Path(__file__).resolve().parents[1]
DEST = ROOT / "site/content/suzuriGoods.ts"
SERIES = "カサ・アヤトの住人"
UA = {"User-Agent": "ayato-island/1.0 (+https://live-streaming-d3cac.web.app)"}
SEARCH = "https://suzuri.jp/search?q=" + urllib.parse.quote(SERIES)
ISLAND = "https://live-streaming-d3cac.web.app/island-api/characters"

# 焼き込みの鍵を名乗っている表。**字を読むのは `python/ts_read.py` の1本だけ**
# （`docs/island-misses.md` #208）。ここに正規表現を書かない——`render()` が
# 行の折り方を変えた日に、関所だけが黙って0件を読む形になる
MAP_NAME = "GOODS_BY_EMOJI"

# 関所。**前の晩に焼いてあった鍵のうち、何%が残っていれば書いてよいか。**
# 95 の出どころは頭の表（1件下げ 1.01% / 1ページ落ち 24.2% / 面が変わった 100%）
KEEP = 95

# 関所で止めたときの終了コード。0=焼いた / 1=`--check` で差があった / **2=止めた**
STOPPED = 2

sys.path.insert(0, str(ROOT / "python"))
import ts_read  # noqa: E402


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
    # **まだグッズの無い人。** 2字下げの `"印",` だけの行にする——`rebake.yml` の
    # 関所が上の行（`"印": "番号",`）と見分けてそれぞれ数えるので、形を変えない
    none = "\n".join(f'  "{e}",' for e in sorted(無))
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

/**
 * まだグッズの無い人の印。**島はここを読まない**（札は出さないだけ）。
 *
 * 置いてあるのは、毎晩の関所が「グッズ＋ここ＝名簿」で帳尻を合わせるため
 * （`.github/workflows/rebake.yml` の `suzuriGoods.ts` の `match`）。
 * 書かないと、グッズの無い人が1人いるだけで毎晩止まる。
 */
export const NO_GOODS: string[] = [
{none}
];

/** 印の揺れ（異体字セレクタ・結合子）を落とす。**焼くほうと同じ式。** */
const norm = (e: string) =>
  [...(e || "")].filter((c) => !"\\ufe0f\\u200d♂♀ ".includes(c)).join("");

/** その人のグッズの売り場。**無ければ null**（札を出さない） */
export function goodsOf(emoji: string | undefined | null): string | null {{
  const id = emoji ? GOODS_BY_EMOJI[norm(emoji)] : undefined;
  return id ? `https://suzuri.jp/ayato_arigato/designs/${{id}}` : null;
}}
'''


def baked_keys(src: str) -> list[str]:
    """いま焼いてある印。**前の晩の物差し。** 読めなければ空。

    読むのは `python/ts_read.py`。`render()` が書く形（字下げ・引用符）に
    合わせた正規表現をここに持つと、**書く形を変えた日に関所だけが0件を読む**
    ——つまり「前は0件だったので、今晩どれだけ減っても通る」になる。
    """
    return [k for k, _ in ts_read.read_map(src, MAP_NAME)]


@dataclass(frozen=True)
class Gate:
    """関所ひと回ぶんの判定。**ファイルも口も持たない**（手元で両側から当てる）。"""

    ok: bool
    before: int                               # 前の晩に焼いてあった鍵の数
    now: int                                  # 今晩ひけた鍵の数
    left: list[str] = field(default_factory=list)   # 島から抜けたので減った印
    lost: list[str] = field(default_factory=list)   # 島に居るのに引けなかった印
    why: str = ""

    @property
    def line(self) -> str:
        """1行で。**分母から出す**（`docs/island-standards.md` §15）。"""
        return (f"前 {self.before}件 → 今 {self.now}件"
                f"／島から抜けた {len(self.left)}人"
                f"／島に居るのに引けなかった {len(self.lost)}人"
                f"（{KEEP}% 残っていれば書く）")


def gate(pairs: dict[str, str], baked: list[str], roster: set[str]) -> Gate:
    """**やせていたら書かない。** 判定はここ1か所（頭の「やせたら焼かない」）。

    Args:
        pairs: 今晩ひけた 印 → デザイン番号
        baked: いま焼いてある印（`baked_keys()`）
        roster: いま島に居る人の印（正規化ずみ）

    Returns:
        `Gate`。`ok` が False なら、1文字も書かずに `STOPPED` で終わる
    """
    now = set(pairs)
    # **0件は、割合を見る前に止める。** 分母が何件でも「100%失った」は同じ字に
    # なるので、数えるものが無い側と混ぜない
    if not now:
        return Gate(False, len(baked), 0, why="売り場から1件も引けませんでした")

    before = list(dict.fromkeys(baked))
    # 減った鍵を2つに分ける。**島から抜けた人は分母の外**——名簿が縮んだ晩に
    # 正しい縮みまで止めると、`characterBox.ts` が踏んだ「自分では二度と緑に
    # ならない関所」になる
    gone = [k for k in before if k not in now]
    left = [k for k in gone if k not in roster]
    lost = [k for k in gone if k in roster]

    # **割合を先に丸めない**（`stale_content_watch.over_share()` と同じ理由。
    # 丸めると境目が分母の人数で動く）。残った鍵が前の KEEP% を切ったら止める
    kept = len(before) - len(lost)
    if kept * 100 < KEEP * len(before):
        return Gate(
            False, len(before), len(now), left, lost,
            why=(f"島に居るのに引けなかった印が {len(lost)}件"
                 f"（前の {len(before)}件 のうち残ったのは {kept}件 ＝ "
                 f"{100 * kept / len(before):.1f}%。{KEEP}% を切りました）"),
        )
    return Gate(True, len(before), len(now), left, lost)


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

    had = DEST.read_text(encoding="utf-8") if DEST.exists() else ""
    # **書く前に止める。** ここから下は、関所を通ったものしか触らない
    g = gate(pairs, baked_keys(had), 有)
    print(f"関所: {g.line}")
    if not g.ok:
        print(f"::error::やせたので焼きません: {g.why}", file=sys.stderr)
        print("  売り場の引き方（`from_search` の正規表現）か、検索の面の組み方が"
              "変わっていないかを先に見てください", file=sys.stderr)
        return STOPPED

    out = render(pairs, len(chars), 無)
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
