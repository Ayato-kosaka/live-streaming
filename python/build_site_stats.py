#!/usr/bin/env python3
"""表紙の**受け皿の数字**を、口から取り直して `site/content/site.ts` に焼く。

    python3 python/build_site_stats.py              # 取り直して焼く（毎晩ぶんはこれ）
    python3 python/build_site_stats.py --dry-run    # 焼かずに、何がどう変わるかだけ出す
    python3 python/build_site_stats.py --from FILE  # 口の代わりに、落としてある JSON を読む

終了コード **0=焼いた（または変わらなかった）** /
**3=口に届かなかった**（1バイトも書いていない。こちらの落ち度ではない）/
**1=口は答えたが、焼けない中身だった**（欄が欠けた・0 が返った・縮んだ・先の日付）。

## なぜ要るか

`STATS_FALLBACK` は、口（`GET /island-api/state`）が返らない日に表紙へ出る
受け皿の数字。**落ちた日ほど本当らしく見えないと困る**ところなのに、
**人が手で打ち直す決まりになっていた。**

2026-10-07 に測ったら、33日古かった。

| | 焼き込み（2026-09-04） | 口（2026-10-06） |
| --- | --- | --- |
| 配信 | 747本 | **800本** |
| コメント | 125,262 | **148,399** |
| 人 | 2,215 | **2,333** |
| 配信した日 | 610日 | **649日** |

**この4つは人の頭の中にない。** `python/island_daily_stats.py` が毎晩
BigQuery から数えて Firestore（`island/state.stats`）に書き、口がそれを
そのまま返している。機械で取れる数を人に打たせていたので、口が落ちた日に
**1ヶ月前の数字が表紙に出る**形だった（`docs/island-fresh.md` 1章の仕分けで
言えば、②に置いてあったものが①だった。`shorts.ts` と同じ外し方）。

## どこから取るか

**公開の口そのまま**（`GET /island-api/state` の `stats`）。BigQuery ではない。

理由は、焼きたいものが「BigQuery を数え直した値」ではなく
**「口が返す数の写し」**だから。画面は口が返れば上書きするので、
受け皿が口と食い違っていたら、口が落ちた日だけ数字が飛ぶ。
同じ数を2通りに数えると、必ずいつか食い違う（`docs/island-db.md` 3章）。

鍵も資格情報も要らない（`tools/sprites/charbox.py` と同じ道）。

## 焼くのは `STATS_FALLBACK` の中の5つだけ

| 欄 | 焼くか | なぜ |
| --- | --- | --- |
| `streams` `streamDays` `comments` `people` | **焼く** | 口が数えている |
| `updatedAt` | **焼く** | 口の `stats.updatedAt`（その数を数えた日）の写し |
| `recipes` | 触らない | `RECIPES.length` から数えている（手で書かないと決めた欄） |
| `since` | 触らない | 初回の配信日。増えも減りもしない |
| `SITE` `PROFILE` `NOW_FALLBACK` `LINKS` | **触らない** | 本人から聞いた事実・画面に出す言葉 |

**同じファイルに人の欄が同居している。** だから当てるのは
`export const STATS_FALLBACK = {` 〜 `};` の中だけで、そこから外れた1バイトでも
動いたら書かずに落ちる（`patch()` の最後の突き合わせ）。
`site.ts` を丸ごと書き出す形にしなかったのは、そうすると
**あやとが書いた文（`PROFILE.body`）をこちらが持つ**ことになるから。

## 取れなかったときは、焼かない

**ここが本丸。** 口が落ちた晩に 0 や欠けた値を焼くと、受け皿が壊れる。
受け皿が出るのは**まさに口が落ちた日**なので、
「口が落ちた日に備えて置いてある数字を、口が落ちた日に壊す」ことになる。

断る形は5つ。どれも**1バイトも書かずに引き下がる**。

| 何が起きたか | 終了コード |
| --- | --- |
| 口に届かない・返事が JSON でない・`stats` が無い | **3**（向こうの都合。赤にしない） |
| 欄が1つでも欠けている | 1 |
| 数が 0 以下・整数でない | 1 |
| いま焼いてある数より**縮んだ** | 1 |
| `updatedAt` が焼いてあるものより**古い**／**明日より先** | 1 |

先の日付を断るのは、見張り（`python/stale_content_watch.py` の `LATEST`）が
**その1回で永久に緑になる**から。`2099-01-01` を焼いたら、二度と鳴らない。

縮みは**ここと関所の2段で見る。二重ではなく層が違う**
（`.github/workflows/rebake.yml` の step「中の数が縮んでいないか」の表と同じ分担）。
ここが見るのは「**口がおかしな数を返した**」で、あちらが見るのは
「**焼いた結果がやせた**」。ここを抜ける形（焼く前のファイルが読めない等）が
あっても、出口でもう一度数で止まる。
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import urllib.request
from datetime import date, datetime, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "site" / "content" / "site.ts"

API = os.getenv("ISLAND_API") or "https://live-streaming-d3cac.web.app/island-api"

# 待つ上限。毎晩ひとりでに走るので、返らない相手にぶら下がり続けない
TIMEOUT = 20

# 焼く数の欄。**並びは `site.ts` に書いてある順**（差分が読みやすい）
NUMBERS = ("streams", "streamDays", "comments", "people")

# 焼く日付の欄（口がその数を数えた日）
STAMP = "updatedAt"

# 当てる範囲。**ここから外は1バイトも触らない**
BLOCK_HEAD = "export const STATS_FALLBACK = {"

DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")


class Unreachable(Exception):
    """口に届かなかった。**こちらの落ち度ではない**ので、赤にしない（終了コード 3）。"""


class Unusable(Exception):
    """口は答えたが、焼けない中身だった。**人が見る話**（終了コード 1）。"""


# ---------------------------------------------------------------- 口を読む


def fetch_stats(url: str = "") -> dict:
    """`GET /island-api/state` の `stats` を取る。

    Args:
        url: 叩く先（省略時は本番の口）

    Returns:
        口が返した `stats` の辞書

    Raises:
        Unreachable: 届かない・JSON でない・`stats` が無い
    """
    target = url or f"{API}/state"
    try:
        with urllib.request.urlopen(target, timeout=TIMEOUT) as r:
            if r.status != 200:
                raise Unreachable(f"{target} が {r.status} を返しました")
            body = r.read()
    except Unreachable:
        raise
    except Exception as e:  # URLError / timeout / socket など、まとめて「届かない」
        raise Unreachable(f"{target} に届きませんでした（{type(e).__name__}: {e}）") from e
    try:
        doc = json.loads(body)
    except Exception as e:
        raise Unreachable(f"{target} の返事が JSON ではありません（{e}）") from e
    if not isinstance(doc, dict):
        raise Unreachable(f"{target} の返事が辞書ではありません（{type(doc).__name__}）")
    stats = doc.get("stats")
    if not isinstance(stats, dict) or not stats:
        # `stats: null` は Firestore の `island/state` に数字が無い状態。
        # **口は生きているので「届かなかった」ではない**が、ここで分けても
        # やることは同じ（焼かない）。向こうが直るまで待つ側に寄せる
        raise Unreachable(f"{target} が stats を返しませんでした（{stats!r}）")
    return stats


def read_from(path: Path) -> dict:
    """落としてある `/state` の JSON から `stats` を読む（`--from`）。

    本番を叩かずに確かめたいとき用。**中身の見かたは口と同じ道を通す**ので、
    「手元では通るのに本番で落ちる」が起きない。
    """
    try:
        doc = json.loads(path.read_text(encoding="utf-8"))
    except Exception as e:
        raise Unreachable(f"{path} が読めません（{e}）") from e
    if isinstance(doc, dict) and isinstance(doc.get("stats"), dict):
        return doc["stats"]
    if isinstance(doc, dict) and all(k in doc for k in NUMBERS):
        return doc  # `stats` の中身そのものを渡されたとき
    raise Unreachable(f"{path} に stats がありません")


# ---------------------------------------------------------------- 中身を見る


def pick(stats: dict, today: date) -> dict:
    """口の返事から、焼く5つだけを取り出して確かめる。

    **欠けている・0 以下・整数でない・先の日付は、ここで断る。**
    `True` は Python では `1` と等しいので、`bool` を明示的に外す
    （JSON の `true` が「1本」として焼かれるのを防ぐ）。

    Args:
        stats: 口が返した `stats`
        today: きょう（先の日付を断る物差し）

    Returns:
        `{欄: 値}`（数4つ＋`updatedAt`）

    Raises:
        Unusable: 焼けない中身だった
    """
    out: dict = {}
    for k in NUMBERS:
        if k not in stats:
            raise Unusable(f"口の stats に `{k}` がありません")
        v = stats[k]
        if isinstance(v, bool) or not isinstance(v, int):
            raise Unusable(f"口の `{k}` が整数ではありません（{v!r}）")
        if v <= 0:
            raise Unusable(f"口の `{k}` が {v} です。0 は焼きません")
        out[k] = v

    s = stats.get(STAMP)
    if not isinstance(s, str) or not DATE_RE.match(s):
        raise Unusable(f"口の `{STAMP}` が日付ではありません（{s!r}）")
    try:
        when = datetime.strptime(s, "%Y-%m-%d").date()
    except ValueError as e:
        raise Unusable(f"口の `{STAMP}` が日付ではありません（{s!r}）") from e
    # **先の日付を焼かない。** 焼いた瞬間に `stale_content_watch.py` の `LATEST` が
    # 永久に緑になる（今日より新しい日付は「0日前」より若いので、二度と鳴らない）。
    # 1日の幅を持たせてあるのは、口が UTC の日付を書くため（日本時間の朝は1日先に見える）
    if when > today + timedelta(days=1):
        raise Unusable(f"口の `{STAMP}` が先の日付です（{s} / きょうは {today}）")
    out[STAMP] = s
    return out


def judge(old: dict, new: dict) -> None:
    """焼いてよいか。**縮んだら焼かない。**

    `.github/workflows/rebake.yml` の関所とは層が違う（あちらは出口で
    「やせた結果」を見る）。ここで見るのは「**口が前より小さい数を返した**」。
    4つはどれも**ぜんぶ数え上げた累積**なので、増えるか動かないかしかない。

    Args:
        old: いま焼いてある値（読めなければ空）
        new: 口から取った値

    Raises:
        Unusable: 縮んでいた／日付が巻き戻っていた
    """
    if not old:
        return  # 初めて焼く回。比べる相手が無い
    small = [(k, old[k], new[k]) for k in NUMBERS
             if k in old and isinstance(old[k], int) and new[k] < old[k]]
    if small:
        why = " / ".join(f"{k} {a:,} → {b:,}" for k, a, b in small)
        raise Unusable(f"口が前より小さい数を返しました（{why}）")
    if STAMP in old and isinstance(old[STAMP], str) and DATE_RE.match(old[STAMP]):
        if new[STAMP] < old[STAMP]:
            raise Unusable(f"口の `{STAMP}` が巻き戻っています（{old[STAMP]} → {new[STAMP]}）")


# ---------------------------------------------------------------- 焼くところ


def block_span(src: str) -> tuple[int, int]:
    """`STATS_FALLBACK = { … };` の中身の位置。**当ててよいのはここだけ。**

    Raises:
        Unusable: 見出しが無い／閉じていない（書き方が変わった）
    """
    at = src.find(BLOCK_HEAD)
    if at < 0:
        raise Unusable(f"`{BLOCK_HEAD}` が {OUT.name} に見当たりません")
    if src.find(BLOCK_HEAD, at + 1) >= 0:
        raise Unusable(f"`{BLOCK_HEAD}` が2つあります。どちらに焼くか決められません")
    lo = at + len(BLOCK_HEAD)
    hi = src.find("\n};", lo)
    if hi < 0:
        raise Unusable(f"`{BLOCK_HEAD}` が閉じていません")
    return lo, hi


def baked(src: str) -> dict:
    """いま焼いてある5つ。読めなかった欄は入らない。"""
    lo, hi = block_span(src)
    body = src[lo:hi]
    out: dict = {}
    for k in NUMBERS:
        m = re.search(rf"^\s+{k}: (\d+),$", body, re.M)
        if m:
            out[k] = int(m.group(1))
    m = re.search(rf'^\s+{STAMP}: "([^"]*)",$', body, re.M)
    if m:
        out[STAMP] = m.group(1)
    return out


def patch(src: str, values: dict) -> str:
    """`STATS_FALLBACK` の中の5行だけを書き換えた字面を返す。

    **当てたあとに突き合わせる。** 塊の外が1バイトでも動いていたら落ちる
    （`SITE` と `PROFILE` を守っているのはこの行）。行の数も、
    書き換えた行の数も数えて、思っていたところ以外が動いていないことを見る。

    Raises:
        Unusable: 当てる行が見つからない／塊の外が動いた／思っていない行が動いた
    """
    lo, hi = block_span(src)
    body = src[lo:hi]

    for k in NUMBERS:
        pat = re.compile(rf"^(\s+){k}: \d+,$", re.M)
        if len(pat.findall(body)) != 1:
            raise Unusable(f"`{k}:` の行が {len(pat.findall(body))} 本あります（1本のはず）")
        body = pat.sub(lambda m: f"{m.group(1)}{k}: {values[k]},", body)
    pat = re.compile(rf'^(\s+){STAMP}: "[^"]*",$', re.M)
    if len(pat.findall(body)) != 1:
        raise Unusable(f"`{STAMP}:` の行が {len(pat.findall(body))} 本あります（1本のはず）")
    body = pat.sub(lambda m: f'{m.group(1)}{STAMP}: "{values[STAMP]}",', body)

    out = src[:lo] + body + src[hi:]

    # ---- ここから下は**守り**。当てたつもりのところ以外が動いていないか ----
    #
    # **塊の在りかを、焼いたほうでもう一度読み直して**から外を比べる。
    # 上で切った位置をそのまま使うと、`out` は `src[:lo] + body + src[hi:]` を
    # つないだものなので、比べても必ず一致する（＝何も見ていない）。
    # 読み直せば「塊そのものが動いた・増えた」も、ここで落ちる。
    lo2, hi2 = block_span(out)
    if out[:lo2] != src[:lo] or out[hi2:] != src[hi:]:
        raise Unusable("塊の外が動きました。焼きません")
    before, after = src.split("\n"), out.split("\n")
    if len(before) != len(after):
        raise Unusable(f"行の数が変わりました（{len(before)} → {len(after)}）")
    moved = [i for i, (a, b) in enumerate(zip(before, after)) if a != b]
    allowed = re.compile(rf'^\s+(?:{"|".join(NUMBERS)}|{STAMP}): ')
    stray = [before[i] for i in moved if not allowed.match(before[i])]
    if stray:
        raise Unusable(f"焼く欄でない行が動きました: {stray[:3]}")
    return out


# ---------------------------------------------------------------- 回すところ


def main(argv: list[str] | None = None) -> int:
    """エントリポイント。"""
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true", help="焼かずに、差だけ出す")
    ap.add_argument("--url", default="", help="叩く先（省略時は本番の口）")
    ap.add_argument("--from", dest="src", default="", help="口の代わりに読む JSON")
    ap.add_argument("--out", default="", help="焼く先（省略時は site/content/site.ts）")
    args = ap.parse_args(argv)

    out = Path(args.out) if args.out else OUT
    if not out.is_file():
        print(f"::error::{out} がありません")
        return 1
    src = out.read_text(encoding="utf-8")

    # **口より先に、焼く先を読む。** 読めない形になっていたら、口を叩く前に止まる
    try:
        old = baked(src)
    except Unusable as e:
        print(f"::error::{out.name} の {BLOCK_HEAD} が読めません: {e}")
        return 1

    try:
        stats = read_from(Path(args.src)) if args.src else fetch_stats(args.url)
    except Unreachable as e:
        print(f"口に届きませんでした: {e}")
        print(f"{out.name} は前のままです（1バイトも書いていません）")
        return 3

    try:
        new = pick(stats, date.today())
        judge(old, new)
        text = patch(src, new)
    except Unusable as e:
        print(f"::error::口の返した中身を焼けません: {e}")
        print(f"{out.name} は前のままです（1バイトも書いていません）")
        return 1

    # 前 → 後 を並べる。**変わらなかった欄も出す**（「今日も同じだった」が読めるように）
    print(f"口: {args.url or args.src or f'{API}/state'}")
    for k in (*NUMBERS, STAMP):
        a, b = old.get(k, "（読めなかった）"), new[k]
        mark = "  " if a == b else "→ "
        a = f"{a:,}" if isinstance(a, int) else a
        b = f"{b:,}" if isinstance(b, int) else b
        print(f"  {mark}{k:<11} {a} → {b}")

    if text == src:
        print(f"{out.name} は口と同じでした。書いていません")
        return 0
    if args.dry_run:
        print(f"（見るだけ）{out.name} を書き換えずに終わります")
        return 0
    out.write_text(text, encoding="utf-8")
    print(f"{out.name} の STATS_FALLBACK を焼きました")
    return 0


if __name__ == "__main__":
    sys.exit(main())
