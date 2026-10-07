"""**いま人の手入れを待っている欄だけ**を数えて、常設の issue の区画に映す。

    python3 python/upkeep_watch.py            # 数えて出すだけ
    python3 python/upkeep_watch.py --apply    # issue の区画を書き換える
    python3 python/upkeep_watch.py --dir /tmp/写し --today 2026-10-03   # 仕込みで回す

終了コード **0=数えられた（手入れ待ちが在っても 0）/ 1=GitHub に届かない・
書く先が違う / 2=数えられない**（`docs/island-standards.md` §15）。

## なぜ要るか

2026-09-29 からの12晩、毎晩の焼き直し（`rebake.yml`）が続けて赤かった。
原因は4つで、**性質が2種類に分かれていた。**

| 赤 | 正体 | どちら |
| --- | --- | --- |
| キャラクターの箱の関所が永久に断る | 正しい状態でも緑にならない | **仕組みの不具合** |
| `og.png` が枠を埋められない | 同上 | **仕組みの不具合** |
| 終わった旅に「今日まで届いていろ」と要求 | 同上 | **仕組みの不具合** |
| `albania.from` が空（着いたのに入れていない） | **人が欄を埋めていない** | **整備の漏れ** |

**「人が埋めれば消える赤」は4本のうち1本だけ**だった。4本は `bake_down` の
issue 1本（`#511`）にまとまって出ていて、そこから「どれが人待ちか」は読めない。
しかも `#511` は16日間ずっと開いていたので、一覧の中で背景になっていた。

知らせる仕組みは**正しく鳴っていた。** 鳴り方が1本に混ざっていたのが問題で、
だから**人の手入れ待ちだけを、別の札に分けて出す。**

## 出す先は、常設の札ひとつ。**新しく立てない**

`#664`（`整備` の札）の本文の中に区画を切って、**その中だけ**を書き換える。
印の付け方は `python/bake_down.py` と同じ（HTML コメントは描かれないので、
読む人には見えないまま、こちらからは確実に引ける）。

**区画の外は1バイトも触らない。** あそこには人が手で書いた経緯が入っている。
本文を丸ごと差し替える作り（`run_watch.apply_plan`）を借りなかったのはこれが理由。

## 何を「手入れ待ち」と呼ぶか

2つの口から集める。**しきい値をここに1つも書かない。**

| 口 | どこが決めているか |
| --- | --- |
| 焼き込みが古い（`site/content/*.ts`） | `python/stale_content_watch.py` の `BOOKS` |
| 旅が進んで欄が空いた | この下の `TRIGGERS` |

## 引き金が見るのは、`chapters.ts` だけではない

ここは長いあいだ `chapters.ts` の欄（着いた日・歩いた国・滞在日数）しか
見ていなかった。**`chapters.ts` の欄しか足せない形**だったので、
*埋まっていないのに札に出ないもの*が4つ残っていた（2026-10-06 に数えた）。

| 引き金 | 何が空いていたか | 何が起きていたか |
| --- | --- | --- |
| 閉じた章の滞在 | `countries.ts` の `sweden` の `to` | **アルバニアの配信11本が「スウェーデン」として焼かれた** |
| いまの章の滞在 | `countries.ts` に `albania` の滞在が無い | 同じことの根っこ |
| 島の便り | `/island-api/state` の `current` が8日前 | **`/now` が「9/27 ストックホルムを発つ」を今週の予定として出していた** |
| 年表のいま | `/about` の `STORY` にいまの章の行が無い | 「ここまでと、いま」が24日止まっていた |

だから引き金に渡すものを `World` にまとめた。**引き金は自分でファイルも
口も開かない**——渡されたものを見るだけなので、仕込みで両側を当てられる。

**読めなかったものは、空で渡さない。** 空を渡すと、その引き金が
「空いていない」と答えて毎晩通る。どれも「数えられない」に積んで、
区画を書き換えずに止まる。

**日数はここに1つも書かない。** 便りの古さの境目は画面と同じものを使う
（`site/lib/place.ts` の `PLACE_STALE_DAYS` を読む）。読めなければ
「数えられない」で止める——既定値を置くと、あちらの書きかたが変わった日に
黙ってすり替わって、画面と札が別のことを言う。

前者は**あちらの判定をそのまま借りる。** 同じ日数を2か所に書くと、片方を
直し忘れた日に食い違う（`docs/island-fresh.md` 2章と同じ決めごと）。
借りたうえで、**持ち主が「人」の赤だけ**をこちらへ出す。

## 持ち主の振り分け

`stale_content_watch` が既に `BOOKS` で持ち主を持っている。それを使う。

| 持ち主 | どちらへ | なぜ |
| --- | --- | --- |
| 人 | **整備の漏れ** | 人の頭の中にしかない。待っても埋まらない |
| 外の地図 | **整備の漏れ** | `tools/nordic/shops.py` はどのワークフローにも載っていない。人が回す |
| 機械 / 導出 / 言葉 | **仕組みの不具合** | 焼くほうが動いていない。`bake_down` の側 |
| 機械/上流が人（①b） | **既定は仕組み。上流も同じ回で赤いときだけ整備** | 下に |

①b（`kitchenTalk.ts` `legendDays.ts`）は「人が上流に1行足したら、機械が続けて
焼く」もの。焼けていない＝**焼くほうが動いていない**が既定。
ただし**上流（人の表）も同じ回で赤い**なら、人の手のほうが先に止まっている。
そのときは人が上流を埋めるのが先で、焼きはあとから付いてくるので整備へ出す。

**迷ったら仕組みへ倒す。** 整備の札に機械の赤が混ざると、この札がまた
「読んでも自分の出番が無い一覧」になって背景に戻る。`#511` が16日かけて
見せたのはそれで、**混ぜる側のほうが怖い。**

## 「急ぐ」と「急がない」を分ける

全部を同じ赤さで並べると、札がまた背景になる。
**急ぐ**のは、埋まっていないせいで**島がいま間違ったものを出している**もの
（`from` が空だと、島は前の章に居続ける——`site/lib/stay.ts`）。
**急がない**のは、まだ決まっていないので空で正しいことがあるもの
（`countries` `plannedDays`）。

## 本文に書くのは「どのファイルの、どの欄に、何を入れるか」だけ

**仕組みの説明を書かない**（`CLAUDE.md`「画面で、システムの仕様を説明しない」）。
どういう条件でここに出しているかは中の話で、読む人には要らない。

**0件でも区画を空にしない。** 空だと「measure していない」のか「無い」のかが
分からない。「いま手入れ待ちはありません」と、**測った日**をいっしょに置く
（`docs/island-standards.md` §15。0 は、数えた証拠と並べないと読めない）。

測った日が毎日変わるので、手入れ待ちが1つも動かない日も本文は書き換わる。
**それでよい**——本文の書き換えでは GitHub は誰にも通知しない
（`python/ticket_labels.py`「本文を書き換えても飛ばない」）ので、雑音は積まれない。

## 赤くしない

**手入れ待ちが何件あっても 0 で終わる。** 赤で知らせるのをやめるために作った
ものが自分で赤を積んだら、また一覧の中で埋もれる。

落ちるのは**この係そのものが動いていない**とき:

- 数えられない（`chapters.ts` を読み落とした・`BOOKS` と置き場が食い違う）… **2**
- GitHub に届かない／書く先が違う（`#664` が消えた・札が外れた）… **1**

*手入れが溜まっている*は赤くしない。*測れない*と*届かない*は赤くする。

## 視聴者さんの素性を出さない

このリポジトリは公開で、Actions のログも issue も誰でも読める。
ここが扱うのは**ファイル名・章の slug・欄の名・日付・件数**だけで、
チャンネルID・名前・ハンドル・どねID は手元にすら来ない
（`stale_content_watch` が `names=False` の本を名指ししないので、
借りてくる赤の行にも入らない）。口より手前で `python/logsafe_selftest.py` を
通してあるのは、**生えた日に気づく**ため。
"""

from __future__ import annotations

import argparse
import json
import logging
import re
import sys
import urllib.error
import urllib.request
from dataclasses import dataclass, field
from datetime import date, datetime
from pathlib import Path
from typing import Callable

sys.path.insert(0, str(Path(__file__).resolve().parent))

# **焼き込みの判定は、まるごとあちらに乗る。** 日数も割合も1つも持ってこない
import stale_content_watch as stale  # noqa: E402

# GitHub を叩く口。**`run_watch.Gh` をそのまま借りる**（`_call` の作法・ラベルの
# 作り方・資格の見かたを写経すると、片方だけ直した日に食い違う）。
# ただし `apply_plan` は借りない——あれは本文を**丸ごと**差し替える
import run_watch  # noqa: E402

# **`site/content/*.ts` を字で読むのは、このリポジトリで1本だけ**（`python/ts_read.py`）。
# 国の滞在もここの部品（`code_only` `array_body` `objects` `fields`）で読む。
# **`python/stays.py` の `read_countries()` は借りられない**——あちらは
# 置き場が決め打ちで、仕込みの写しを食わせられない（対照が作れない）
import ts_read  # noqa: E402
from ts_read import read_chapters  # noqa: E402

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)

REPO_ROOT = Path(__file__).resolve().parent.parent
CONTENT = REPO_ROOT / "site" / "content"
CHAPTERS_TS = "site/content/chapters.ts"
COUNTRIES_TS = "site/content/countries.ts"
ABOUT_TSX = "site/app/about/page.tsx"
PLACE_TS = "site/lib/place.ts"

# 島の便り。**打つのはあやとで、スマホから**（`POST /island-api/current`。
# 画面は `/me` の「いまどこ」＝`site/components/me/TripTools.tsx`）
STATE_URL = "https://live-streaming-d3cac.web.app/island-api/state"
# **印の中に印を入れない。** `Gap.where` は丸ごと `…` で囲まれるので、
# ここに ` を置くと入れ子になって、札の上で字が崩れる
STATE_WHERE = "/me の「いまどこ」（島の便り）"

# 書き込む先。**常設の札1本だけ。新しく立てない。**
# 番号で引くのは、この札が「旅がつぎの国へ移ったときの手入れ」という
# 中身の決まった1本だから（毎晩こしらえ直すものではない）
ISSUE_NUMBER = 664

# **書いてよい札か**を見るための印。番号だけを信じて書くと、番号を取り違えた
# ときに関係のない issue の本文を毎晩書き換えることになる
ISSUE_LABEL = "整備"

# 本文に切る区画。GitHub は HTML コメントを描かないので、読む人には
# 見えないまま、こちらからは確実に引ける（`bake_down.MARK` と同じ手）
BEGIN = "<!-- upkeep:begin -->"
END = "<!-- upkeep:end -->"

# 持ち主の振り分け先
UPKEEP = "整備の漏れ"   # 人が欄を埋めれば消える
SYSTEM = "仕組みの不具合"  # 焼くほうが動いていない（`bake_down` の側）

# `stale_content_watch.BOOKS` の持ち主 → どちらか。
# **①b（`MACHINE_HUMAN`）はここに置かない**（上流を見てから決める。`side_of`）
SIDE_OF_WHO = {
    stale.HUMAN: UPKEEP,
    # OpenStreetMap の店（`nordicShops.ts`）。`tools/nordic/shops.py` は
    # `rebake.yml` にも、ほかのどのワークフローにも載っていない。
    # **待っても誰も回さない**ので、人の手入れ
    stale.OUTSIDE: UPKEEP,
    stale.MACHINE: SYSTEM,
    stale.DERIVED: SYSTEM,
    stale.WORDS: SYSTEM,
}


@dataclass(frozen=True)
class Gap:
    """空いている欄ひとつ。**ここに仕組みの説明を入れない。**

    `where` と `what` で「どのファイルの、どの欄に、何を入れるか」が1行になる。
    """

    where: str      # 「`site/content/chapters.ts` の `albania` の `from`」
    what: str       # 「島に着いた日（YYYY-MM-DD）」
    urgent: bool    # 急ぐか（島がいま間違ったものを出しているか）

    def line(self) -> str:
        return f"- {self.where} ← {self.what}"


@dataclass
class World:
    """引き金が見るもの、ぜんぶ。**引き金は自分でファイルを開かない。**

    前はここが `rows`（章）だけだった。**`chapters.ts` の欄しか見ていない
    引き金しか足せない形**で、実際に「埋まっていないのに札に出ないもの」が
    4つ残っていた（歩いた国の滞在・いまの章の滞在・島の便り・年表）。

    読むところを1か所にまとめてあるので、引き金は**渡されたものを見るだけ。**
    仕込みで両側を当てられるのも、ここが素の値だから。
    """

    today: date
    rows: list[dict]                  # `chapters.ts` の章（読めたもの）
    countries: list[dict]             # `countries.ts` の国 → 滞在
    itineraries: set[str]             # 旅程のある章の slug（`site/content/<slug>.ts`）
    about: str                        # `/about` の年表の字（`STEPS` の中身）
    current: dict                     # 島の便り（`/island-api/state` の `current`）
    stale_days: int                   # `site/lib/place.ts` の `PLACE_STALE_DAYS`

    def chapter_now(self) -> dict | None:
        """いまの章。**始まっていて、まだ終わっていない本線。**

        終わりの決めかたを自分で持たない（`to` の字だけを見る）のは、
        `running_without_days()` と同じ。
        """
        got = [r for r in self.rows
               if not r["branchOf"] and not r["to"]
               and (d := _as_date(r["from"]) or _as_date(r["opensAt"])) and d <= self.today]
        return got[-1] if got else None

    def ended_chapters(self) -> list[dict]:
        """もう終わった章。**最終日の当日はまだ終わっていない**（`Span.ended`）。"""
        return [r for r in self.rows
                if (d := _as_date(r["to"])) and d < self.today]


@dataclass(frozen=True)
class Trigger:
    """章が進んだときに空く欄ひとつぶんの見かた。

    **1行で足せる形にしてある。** 次に増える引き金は、関数を1つ書いて
    `TRIGGERS` に1行足すだけ。見るものは `World` が全部そろえて渡す。
    """

    name: str                             # ログに出す名
    urgent: bool                          # 急ぐ側か
    find: Callable[[World], list[Gap]]


def _as_date(s: str) -> date | None:
    """`YYYY-MM-DD`（頭10文字でよい）を日付に。読めなければ None。"""
    try:
        return datetime.strptime((s or "")[:10], "%Y-%m-%d").date()
    except ValueError:
        return None


def _field(slug: str, key: str) -> str:
    return f"`{CHAPTERS_TS}` の `{slug}` の `{key}`"


# ---------------------------------------------------------------- 読むところ
#
# **引き金は、ここで読んだものだけを見る。** 自分でファイルも口も開かない。
# そうしておかないと、仕込みで両側（鳴る／黙る）を当てられない。


@dataclass(frozen=True)
class CountryRead:
    """`countries.ts` を読んだ結果。**判定はしない。数だけ添える。**"""

    rows: list[dict] = field(default_factory=list)
    declared: int = 0  # ファイルが名乗っている国の数（`slug: "` の数）

    @property
    def missed(self) -> int:
        """名乗っているのに読めなかった数。**0 でなければ呼ぶ側が止める。**"""
        return self.declared - len(self.rows)


def read_countries(src: str) -> CountryRead:
    """`countries.ts` から「国 → 滞在（`from` / `to`）」を読む。

    **字を読むのは `python/ts_read.py` の部品**（`code_only` でコメントを
    落とし、`array_body` で `COUNTRIES` を切り、`objects` と `fields` で
    1国ずつ）。新しい読み方をここに書かない——`chapters.ts` が3通りに
    読まれていたときに、北欧の章が片方からだけ落ちた（`ts_read.py` の頭）。

    `stays` は入れ子なので `fields()` からは出てこない（あちらは
    `note:` の本文に `to: "…"` と書いてあるのを欄と読まないように、
    入れ子を飛ばす作りになっている）。ここだけ名指しで切り出す。

    **読み落としは数で捕まえる。** 書き方が変われば落ちるのは避けられないので、
    落ちたことが分かるようにする（`CountryRead.missed`）。

    Args:
        src: `site/content/countries.ts` の中身そのもの

    Returns:
        `CountryRead`。**`missed` を見ずに `rows` だけ使わないこと**
    """
    body = ts_read.array_body(ts_read.code_only(src), "COUNTRIES")
    rows = []
    for obj in ts_read.objects(body):
        f = ts_read.fields(obj)
        slug = f.get("slug")
        if not slug:
            continue
        rows.append({"slug": slug, "name": f.get("name", ""),
                     "stays": _stays_in(obj)})
    return CountryRead(rows=rows, declared=len(ts_read.SLUG_RE.findall(body)))


def _stays_in(obj: str) -> list[dict]:
    """国1つぶんの `{…}` から `stays: [{ from, to }, …]` を取る。

    `[` の対応は `ts_read.close_at` に任せる（文字列の中の括弧を数えない）。
    `from` も `to` も**無ければ空の字**で返す——呼ぶ側に `.get()` を
    書かせない（書かせると、綴り違いが「欄が無い」に化けて黙って通る）。
    """
    m = re.search(r"\bstays\s*:\s*\[", obj)
    if not m:
        return []
    i = m.end() - 1
    inner = obj[i + 1: ts_read.close_at(obj, i)]
    out = []
    for one in ts_read.objects(inner):
        f = ts_read.fields(one)
        out.append({"from": f.get("from", ""), "to": f.get("to", "")})
    return out


def read_about_steps(src: str) -> str:
    """`/about` の年表（`STORY`）の中身だけ。見つからなければ空。

    **空と「行が無い」を取り違えない。** 空で返るのは *読めなかった* ときで、
    呼ぶ側はそれを「数えられない」として扱う（`count()`）。
    """
    return ts_read.array_body(ts_read.code_only(src), "STORY")


def read_place_stale_days(src: str) -> int:
    """`site/lib/place.ts` の `PLACE_STALE_DAYS`。読めなければ 0。

    **日数をここに書かない。** 画面（`placeOutdated`）とこの見張りが別の
    境目を持つと、島が「もう『いま』ではない」と言っている便りを、
    札のほうは「まだ新しい」と数える日が来る
    （`docs/island-fresh.md` 2章「日数を2か所に置かない」）。

    読めなかったら 0 を返して、呼ぶ側が**「数えられない」で止める。**
    既定値をここに置くと、あちらの書きかたが変わった日に黙ってすり替わる。
    """
    m = re.search(r"\bPLACE_STALE_DAYS\s*(?::\s*number\s*)?=\s*(\d+)",
                  ts_read.code_only(src))
    return int(m.group(1)) if m else 0


# 島の便りの `week` の行頭（「9/27 ストックホルムを発つ」）。
# **年は書かれていない。** 今日のいちばん近くに寄せて解く
WEEK_DAY_RE = re.compile(r"^\s*(\d{1,2})\s*/\s*(\d{1,2})\b")


def week_days(week, today: date) -> list[date]:
    """`week` の行の頭にある日付。**年は今日のいちばん近くに寄せる。**

    `week` は「今週やること」なので、どの行も今日の前後ひと月あたりに在る。
    年をまたぐ晩（12/30 の行を 1/2 に読む）にずれないよう、
    前年・今年・翌年の3つから**今日にいちばん近い**ものを採る。

    日付の付いていない行（「回る先はこれから」）は数えない。

    Args:
        week: 島の便りの `week`（字の並び。何が来るか分からない）
        today: きょう

    Returns:
        読めた日付だけ。並びはファイルのまま
    """
    out = []
    for line in (week if isinstance(week, list) else []):
        m = WEEK_DAY_RE.match(str(line))
        if not m:
            continue
        mm, dd = int(m.group(1)), int(m.group(2))
        got = []
        for y in (today.year - 1, today.year, today.year + 1):
            try:
                got.append(date(y, mm, dd))
            except ValueError:
                pass  # 2/30 のような字。日付ではないので数えない
        if got:
            out.append(min(got, key=lambda d: abs((d - today).days)))
    return out


@dataclass
class StateRead:
    """島の便りを読んだ結果。**届かなかったことを、空と同じ顔にしない。**"""

    current: dict = field(default_factory=dict)
    error: str = ""


def fetch_state(url: str = STATE_URL, tries: int = 3, timeout: int = 20) -> StateRead:
    """`/island-api/state` の `current` だけを取る。

    **`current` のほかは1つも持ち帰らない。** あの口は `residents` や
    `residentDays`（チャンネルIDが鍵）も返すので、手元に置いた時点で
    ログに混ざる道ができる。持ち帰らなければ混ざりようがない。

    届かなければ `error` を立てて返す。**呼ぶ側は「数えられない」で止める**
    ——届かなかった晩に「手入れ待ちはありません」と書くほうが悪い。

    Args:
        url: 口の在りか
        tries: 何回試すか（ひと呼吸おいて繰り返す）
        timeout: 1回あたりの待ち（秒）

    Returns:
        `StateRead`
    """
    why = ""
    for n in range(tries):
        try:
            with urllib.request.urlopen(url, timeout=timeout) as r:
                got = json.loads(r.read().decode("utf-8"))
            cur = got.get("current")
            if not isinstance(cur, dict):
                return StateRead(error=f"{url} の返事に `current` がありません")
            return StateRead(current=cur)
        except (urllib.error.URLError, OSError, ValueError) as e:
            # **本文を出さない。** 返事そのものに便りの字が入っている
            why = f"{type(e).__name__}（{n + 1}回目）"
    return StateRead(error=f"島の便り（{url}）に届きません: {why}")


def arrived_without_from(w: World) -> list[Gap]:
    """**着いたのに、着いた日が入っていない。**

    `opensAt`（開く予定の日時）を過ぎているのに `from` が空。
    ここが空だと `began()` が `opensAt` に落ちるところまでは動くが、
    旅が実際にいつ始まったかは**どこにも無い**ままになる。
    2026-09-29 からの5晩、焼き直しが止まったのがこの形。
    """
    out = []
    for r in w.rows:
        opens = _as_date(r["opensAt"])
        if opens and opens <= w.today and not r["from"]:
            out.append(Gap(_field(r["slug"], "from"),
                           "島に着いた日（`YYYY-MM-DD`）", urgent=True))
    return out


def ended_without_countries(w: World) -> list[Gap]:
    """**旅が終わったのに、歩いた国が入っていない。**

    `to` が入っている＝本人が「この章は終わった」と書いた章。
    そこが空だと、島の道しるべが1本も立たない。

    急がない側に置いてあるのは、**国を足すには `countries.ts` の側も
    いっしょに動かす**から（番号を振り直す。`content/countries.ts` の
    `BEFORE_STREAM`）。その日のうちに埋める類のものではない。
    """
    return [Gap(_field(r["slug"], "countries"),
                "その章で歩いた国（`countries.ts` の slug）", urgent=False)
            for r in w.rows if r["to"] and not r["countries"]]


def running_without_days(w: World) -> list[Gap]:
    """**いまの章に、何日いるかが入っていない。**

    `plannedDays` は島の大きさを決める（入っていないあいだは浜のぶんだけの島）。
    **決まっていないのに見立てを入れると「◯日の旅」が事実として絵に出る**ので、
    空で正しいことがある。だから急がない側。

    「いまの章」は、始まっていて（`from` か `opensAt` が今日まで来ている）
    まだ終わっていない（`to` が空）章。**終わりの決めかたを自分で持たない**ように
    `to` の字だけを見る。
    """
    out = []
    for r in w.rows:
        start = _as_date(r["from"]) or _as_date(r["opensAt"])
        if start and start <= w.today and not r["to"] and not r["plannedDays"]:
            out.append(Gap(_field(r["slug"], "plannedDays"),
                           "その島に何日いるか（数）", urgent=False))
    return out


def ended_with_open_stay(w: World) -> list[Gap]:
    """**章が閉じたのに、その章の国の滞在が開いたまま。**

    `countries.ts` の滞在は `to` が空のあいだ「**いまもここにいる**」の意味で、
    `python/stays.py` はそれ以降の配信を全部その国のものとして数える。
    章が次へ移ったのに空いたままだと、**次の国の配信が前の国として焼かれる。**

    実際にそうなっていた——北欧の章は 2026-09-27 に閉じたのに
    `sweden` の滞在が `to: ""` のままで、**アルバニアの配信11本が
    「スウェーデン」として焼かれていた。**

    見るのは「開いた滞在の `from` が、もう終わった章の中にあるか」。
    **いまの章の中で開いているのは正しい**（出国したあとに書く欄）。

    急ぐ側。**島がいま間違ったものを出している。**
    """
    ended = w.ended_chapters()
    out = []
    for c in w.countries:
        for s in c["stays"]:
            if s["to"]:
                continue
            start = _as_date(s["from"])
            if start is None:
                continue
            owner = [r for r in ended
                     if (a := _as_date(r["from"]) or _as_date(r["opensAt"]))
                     and a <= start <= _as_date(r["to"])]
            if owner:
                out.append(Gap(
                    f"`{COUNTRIES_TS}` の `{c['slug']}` の `stays` の `to`",
                    f"その国を出た日（`YYYY-MM-DD`）。"
                    f"章 `{owner[-1]['slug']}` は {owner[-1]['to']} に閉じている",
                    urgent=True))
    return out


def running_without_stay(w: World) -> list[Gap]:
    """**いまの章に、滞在の出どころが1つも無い。**

    `python/stays.py` が配信を国に振り分けるときに読むのは2つ——
    `countries.ts` の滞在と、その旅の旅程（`site/content/<章>.ts`）。
    いまの章にどちらも無いと、**その章の配信はどの国にも入らない。**

    出どころは2通りのどちらでもよい:

    - `countries.ts` に、**この章が始まってから始まる滞在**がある
      （前の章から開いたままの滞在は数えない。数えると
      `ended_with_open_stay` が見ている嘘が、ここでは「出どころ在り」に化ける）
    - `site/content/<章の slug>.ts` という旅程がある（北欧は `nordic.ts`）

    急がない側。**`COUNTRIES` は歩き終わってから書く決まり**で
    （`content/countries.ts` の `AHEAD_COUNTRIES` の注）、着いた当日に
    埋めるものではない。旗と名前だけは `AHEAD_COUNTRIES` が先に受けている。
    """
    now = w.chapter_now()
    if now is None:
        return []
    start = _as_date(now["from"]) or _as_date(now["opensAt"])
    if start is None:
        return []  # 着いた日が空いているほうは `arrived_without_from` が見ている
    if now["slug"] in w.itineraries:
        return []
    for c in w.countries:
        for s in c["stays"]:
            if (d := _as_date(s["from"])) and d >= start:
                return []
    return [Gap(f"`{COUNTRIES_TS}` の `COUNTRIES`",
                f"いまの島（`{now['slug']}`）の滞在（`from` と街）。"
                f"これが無いと、この章の配信がどの国にも入らない",
                urgent=False)]


def state_current_stale(w: World) -> list[Gap]:
    """**島の便り（`/island-api/state` の `current`）が、もう「いま」ではない。**

    `current` は `place` `word` `week` をまとめて持つ1つの箱で、`/now` は
    これを「**いまいる国と、今週やること**」として出している。
    あやとがスマホから打つ欄（`POST /island-api/current`）なので、
    **機械では新しくならない。** 整備の側。

    見るのは2つ。**片方だけでは、いつでも通る判定になる。**

    1. **打たれた日が古い**（`site/lib/place.ts` の `placeOutdated` と同じ境目。
       いまの章より前か、`PLACE_STALE_DAYS` 日より前か）。
       **日数は暦日で数える**——時刻で引くと、同じ便りが朝と夜で答えが変わる。
       画面は日本時間の暦日で切っていて、こちらは走った箱の暦日なので、
       **ちょうど境目の1日だけは、画面と答えが1日ずれることがある。**
       7日の境目に対して1日なので、札の読み手には効かない
    2. **`week` の行の頭の日付が、もう過ぎている**

    2 が要るのは、1 だけだと**章が始まった日に打てば、その章が何ヶ月
    続いても永久に「新しい」**から。実際に 2026-10-06、本番の `/now` は
    「9/27 ストックホルムを発つ」を**今週の予定**として出していた
    （章 `albania` の始まりも `updatedAt` も 2026-09-28）。

    急ぐ側。**島がいま間違ったものを出している。**

    **中身を印字しない。** 出すのは日付と件数だけ（`week` の字は
    あやとの言葉で、ここは公開の issue に出る）。
    """
    out = []
    cur = w.current
    said = _as_date(str(cur.get("updatedAt") or ""))
    now = w.chapter_now()
    began = (_as_date(now["from"]) or _as_date(now["opensAt"])) if now else None

    if said is None:
        out.append(Gap(f"`{STATE_WHERE}` の `place` と `word`",
                       "いまいる国と、ひとこと（**打たれた日が読めません**）",
                       urgent=True))
    else:
        age = (w.today - said).days
        if age > w.stale_days or (began is not None and said < began):
            out.append(Gap(
                f"`{STATE_WHERE}` の `place` と `word`",
                f"いまいる国と、ひとこと（いまの便りは {said}＝{age}日前。"
                f"{w.stale_days}日を超えたら「いま」ではない）",
                urgent=True))

    past = [d for d in week_days(cur.get("week"), w.today) if d < w.today]
    if past:
        out.append(Gap(
            f"`{STATE_WHERE}` の `week`",
            f"今週やること（**過ぎた日の行が {len(past)}行**。"
            f"いちばん古いのが {min(past)}）",
            urgent=True))
    return out


def about_without_chapter(w: World) -> list[Gap]:
    """**`/about` の年表に、いまの章の行が無い。**

    「ここまでと、いま」を名乗る面（`site/app/about/page.tsx` の `STORY`）が、
    いまの島に触れていない。2026-10-06 の時点で、いちばん下の節目は
    2026-09-12「ジョージアを出て、北欧へ発った」で**24日止まっていた。**

    当たったとみなすのは2通り。**章の slug で引く道を1本に絞らない**——
    年表は `chapterFrom("nordic")`（章から引く）でも `on("georgia")`
    （国から引く）でも日付そのものでも節目を置ける。

    急がない側。**嘘を出しているのではなく、まだ書かれていない**だけ。
    何を節目と呼ぶかは人の頭の中にしかない。
    """
    now = w.chapter_now()
    if now is None or not w.about:
        return []
    start = _as_date(now["from"]) or _as_date(now["opensAt"])
    if start is None:
        return []
    slug = now["slug"]
    if f'"{slug}"' in w.about:
        return []
    for raw in re.findall(r'"(\d{4}-\d{2}-\d{2})"', w.about):
        if (d := _as_date(raw)) and d >= start:
            return []
    return [Gap(f"`{ABOUT_TSX}` の `STORY`",
                f"いまの島（`{slug}` / {start}〜）の節目を1行。"
                f"「ここまでと、いま」の年表が、いまに届いていない",
                urgent=False)]


# **引き金の表。1行で足せる。**
TRIGGERS: tuple[Trigger, ...] = (
    Trigger("着いた日", True, arrived_without_from),
    Trigger("歩いた国", False, ended_without_countries),
    Trigger("滞在日数", False, running_without_days),
    Trigger("閉じた章の滞在", True, ended_with_open_stay),
    Trigger("いまの章の滞在", False, running_without_stay),
    Trigger("島の便り", True, state_current_stale),
    Trigger("年表のいま", False, about_without_chapter),
)


def side_of(name: str, red_names: set[str], books: dict | None = None) -> str:
    """その焼き込みの赤を、**整備の漏れ**と**仕組みの不具合**のどちらに振るか。

    Args:
        name: 焼き込みの名（`voices.ts`）
        red_names: その回に赤かった焼き込みの名ぜんぶ（①b の上流を見るのに使う）
        books: 仕分けの表（省略時は `stale.BOOKS`）

    Returns:
        `UPKEEP` か `SYSTEM`
    """
    books = stale.BOOKS if books is None else books
    b = books.get(name)
    if b is None:
        # 表に無い本は `stale_content_watch` 側が「数えられない」で先に止める。
        # ここまで来たら仕組みの側（こちらで直す）
        return SYSTEM
    if b.who == stale.MACHINE_HUMAN:
        # **上流（人の表）も同じ回で赤いなら、人の手のほうが先に止まっている。**
        # そうでなければ焼くほうが動いていないので仕組み（既定）
        return UPKEEP if b.upstream in red_names else SYSTEM
    return SIDE_OF_WHO.get(b.who, SYSTEM)


@dataclass
class Count:
    """1回ぶんの数え。**GitHub もファイルも触らない素のまとめ。**"""

    urgent: list[str]      # 急ぐ行（本文に出る字そのもの）
    later: list[str]       # 急がない行
    system: list[str]      # 仕組みの側へ回した行（**区画に出さない**。ログだけ）
    blind: list[str]       # 数えられなかった理由
    today: date

    @property
    def waiting(self) -> int:
        return len(self.urgent) + len(self.later)

    @property
    def countable(self) -> bool:
        return not self.blind


def stale_gaps(v, red_names: set[str], books: dict | None = None
               ) -> tuple[list[str], list[str]]:
    """焼き込みの赤を、整備（人）と仕組みに振り分けて行にする。

    行の字は**あちらが書いたものをそのまま使う**（`Verdict.red`）。
    「何をすれば緑になるか」は本ごとに違っていて、あちらの `Book.todo` が
    もう持っている。ここで書き直すと、2か所に別の言い方が並ぶ。

    Args:
        v: `stale_content_watch.judge()` の返り値
        red_names: 赤かった焼き込みの名
        books: 仕分けの表

    Returns:
        （整備の行, 仕組みの行）
    """
    mine: list[str] = []
    theirs: list[str] = []
    for line in v.red:
        # 赤の行は、どれも**本の名から始まる**（`judge()` の4通りとも）。
        # **いちばん長く一致する名を採る**——`nordic.ts` と `nordicSun.ts` のように
        # 片方がもう片方の頭に見える名があると、集合をなめる順で結果が変わる
        name = max((n for n in red_names if line.startswith(n)),
                   key=len, default="")
        if not name:
            # 名が取れない行は、どちらとも言えない。**整備へ混ぜない**
            theirs.append(line)
            continue
        text = f"`site/content/{name}`{line[len(name):]}"
        (mine if side_of(name, red_names, books) == UPKEEP else theirs).append(text)
    return mine, theirs


def count(content_dir: Path, today: date, books: dict | None = None,
          site: Path | None = None, state: StateRead | None = None) -> Count:
    """**いま空いている欄**を数える。GitHub を1バイトも触らない。

    Args:
        content_dir: `site/content`（仕込みの写しを渡してもよい）
        today: きょう
        books: 仕分けの表（省略時は `stale.BOOKS`）
        site: `site/`（省略時は `content_dir` の親）。`app/about/page.tsx` と
            `lib/place.ts` をここから引く
        state: 島の便り（省略時は**口を叩いて取りに行く**）。
            **仕込みでは必ず渡す**——毎 PR で回る対照を本番の口に繋ぐと、
            本番が返らない日に関係のない PR が赤くなる
            （`python/watch_excuses.py` の `cardgo.mjs` と同じ理由）

    Returns:
        `Count`
    """
    blind: list[str] = []
    site = content_dir.parent if site is None else site

    # --- (a) 焼き込みが古い。**判定はあちらに乗る** ---
    seen = stale.scan_dir(content_dir)
    if not seen:
        return Count([], [], [], [f"{content_dir} に `*.ts` が1本もありません"], today)
    v = stale.judge(seen, today, books)
    blind += v.blind
    red_names = {r.name for r in v.results if r.status == "赤"}
    mine, theirs = stale_gaps(v, red_names, books)

    # --- (b) 章が進んで空いた欄 ---
    ch = content_dir / "chapters.ts"
    rows: list[dict] = []
    if not ch.is_file():
        blind.append(f"{CHAPTERS_TS} がありません")
    else:
        got = read_chapters(ch.read_text(encoding="utf-8"))
        if not got.declared:
            blind.append(f"{CHAPTERS_TS} が章を1つも名乗っていません")
        elif got.missed:
            # **読み落としたまま進まない。** 落ちた章の欄が空いていても、
            # 「空いていない」として黙ってしまう
            blind.append(
                f"{CHAPTERS_TS} の章を {got.missed}個 読み落としました"
                f"（名乗り {got.declared} / 読めた {len(got.rows)}）"
            )
        else:
            rows = got.rows

    # --- (c) 章のほかに、引き金が見るもの ---
    #
    # **読めなかったものは、黙って空で渡さない。** 空を渡すと、その引き金が
    # 「空いていない」と答えて毎晩通る（§15 の「いつでも通る見張り」）。
    # どれも「数えられない」に積んで、区画を書き換えずに止まる
    countries: list[dict] = []
    cs = content_dir / "countries.ts"
    if not cs.is_file():
        blind.append(f"{COUNTRIES_TS} がありません")
    else:
        got_c = read_countries(cs.read_text(encoding="utf-8"))
        if not got_c.declared:
            blind.append(f"{COUNTRIES_TS} が国を1つも名乗っていません")
        elif got_c.missed:
            blind.append(
                f"{COUNTRIES_TS} の国を {got_c.missed}個 読み落としました"
                f"（名乗り {got_c.declared} / 読めた {len(got_c.rows)}）"
            )
        else:
            countries = got_c.rows

    # 旅程のある章。**`site/content/<章の slug>.ts`** が在れば、その章の
    # 滞在はそこから出せる（北欧は `nordic.ts`）
    itineraries = {r["slug"] for r in rows
                   if r["slug"] and (content_dir / f"{r['slug']}.ts").is_file()}

    about = ""
    ab = site / "app" / "about" / "page.tsx"
    if not ab.is_file():
        blind.append(f"{ABOUT_TSX} がありません")
    else:
        about = read_about_steps(ab.read_text(encoding="utf-8"))
        if not about:
            blind.append(f"{ABOUT_TSX} から年表（`STORY`）を読めません")

    stale_days = 0
    pl = site / "lib" / "place.ts"
    if not pl.is_file():
        blind.append(f"{PLACE_TS} がありません")
    else:
        stale_days = read_place_stale_days(pl.read_text(encoding="utf-8"))
        if not stale_days:
            blind.append(
                f"{PLACE_TS} から `PLACE_STALE_DAYS` を読めません。"
                f"**既定値で代わりにしない**——画面と札が別の境目を持つことになる"
            )

    st = fetch_state() if state is None else state
    if st.error:
        blind.append(st.error)

    w = World(today=today, rows=rows, countries=countries,
              itineraries=itineraries, about=about,
              current=st.current, stale_days=stale_days)

    gaps: list[Gap] = []
    for t in TRIGGERS:
        found = t.find(w)
        logger.info("引き金「%s」… %d件", t.name, len(found))
        gaps += found

    urgent = mine + [g.line() for g in gaps if g.urgent]
    later = [g.line() for g in gaps if not g.urgent]
    return Count(urgent, later, theirs, blind, today)


def section(c: Count) -> str:
    """区画の中身。**印は含まない**（差し込むのは `splice`）。

    書くのは「どのファイルの、どの欄に、何を入れるか」だけ。
    **0件でも空にしない**——空だと「測っていない」と見分けが付かない。
    """
    out = ["### いま手入れを待っているもの", ""]
    if not c.waiting:
        out += ["いま手入れ待ちはありません。", ""]
    else:
        if c.urgent:
            out += ["**急ぐ**", ""] + c.urgent + [""]
        if c.later:
            out += ["**急がない**（決まってから埋めるもの）", ""] + c.later + [""]
    out.append(f"（{c.today} に数えました）")
    return "\n".join(out)


def splice(body: str, text: str) -> str:
    """いまの本文の、**区画の中だけ**を入れ替える。

    印がまだ無ければ**末尾に足す。** 人が手で書いた本文は1文字も動かさない。

    Args:
        body: いまの issue の本文
        text: 区画に入れる字（`section()`）

    Returns:
        新しい本文
    """
    block = f"{BEGIN}\n{text}\n{END}"
    body = body or ""
    a = body.find(BEGIN)
    b = body.find(END)
    if a < 0 or b < a:
        # まだ区画が無い。**本文のうしろに足す**（前に足すと、人が書いた
        # 見出しより上に機械の字が来る）
        return (body.rstrip() + "\n\n" + block + "\n") if body.strip() else block + "\n"
    return body[:a] + block + body[b + len(END):]


class Gh(run_watch.Gh):
    """GitHub を触る口。**`run_watch.Gh` に、1本だけ読む口を足したもの。**

    `Gh(repo, token)` の形を変えないこと（確かめが `Gh` ごと偽物に差し替える）。
    """

    def issue(self, number: int) -> dict:
        """その番号の issue を1本。**一覧から探さない**（番号が決まっている）。"""
        return self._call("GET", f"/repos/{self.repo}/issues/{number}")


def writable(issue: dict) -> tuple[bool, str]:
    """その issue に書いてよいか。**書く前に必ず通す。**

    番号だけを信じて書くと、取り違えたときに関係のない issue の本文を
    毎晩書き換えることになる。見るのは3つ:

    - pull request ではない（`/issues` は PR も返す）
    - 開いている（人が閉じたなら、その判断に従って黙る）
    - `整備` の札が付いている **か**、もう区画が入っている
      （人が札を外しただけで毎晩赤くならないように、どちらかでよい）

    Returns:
        （書いてよいか, 理由）
    """
    if issue.get("pull_request"):
        return False, "pull request でした"
    labels = {x.get("name") if isinstance(x, dict) else x
              for x in (issue.get("labels") or [])}
    body = issue.get("body") or ""
    if ISSUE_LABEL not in labels and BEGIN not in body:
        return False, f"`{ISSUE_LABEL}` の札も、区画の印もありません"
    if issue.get("state") != "open":
        return False, "閉じています"
    return True, ""


def run(gh, c: Count, apply: bool = False) -> dict:
    """数えたものに、issue の区画を合わせる。

    **読むのは毎回。書くのは `apply` のときだけ。**
    `apply` でなくても issue を1回読みに行く。手入れ待ちが0件の日が何か月
    続いても、資格・権限・番号が生きているかを毎回試しておかないと、
    **はじめて本当に要る朝まで気づけない**（`python/bake_down.py` と同じ理由）。

    Returns:
        {"action": "update"/"noop"/"dry"/"skip", "number": …, "why": …}
    """
    issue = gh.issue(ISSUE_NUMBER)
    logger.info("issue #%s を読めました（いま%s）", ISSUE_NUMBER,
                "開いています" if issue.get("state") == "open" else "閉じています")

    ok, why = writable(issue)
    if not ok:
        logger.warning("#%s には書きません: %s", ISSUE_NUMBER, why)
        return {"action": "skip", "number": ISSUE_NUMBER, "why": why}

    if not c.countable:
        # **数えられていないのに「ありません」と書かない。**
        # 前の区画を残したまま黙るほうが、嘘を上書きするよりいい
        logger.warning("数えられていないので、区画は書き換えません")
        return {"action": "skip", "number": ISSUE_NUMBER, "why": "数えられない"}

    want = splice(issue.get("body") or "", section(c))
    if want == (issue.get("body") or ""):
        logger.info("区画が変わっていないので触りません")
        return {"action": "noop", "number": ISSUE_NUMBER, "why": ""}

    if not apply:
        logger.info("--apply を付けていないので GitHub には書きません")
        logger.info("付けると: #%s の区画を書き換えます", ISSUE_NUMBER)
        return {"action": "dry", "number": ISSUE_NUMBER, "why": ""}

    gh.patch(ISSUE_NUMBER, {"body": want})
    logger.info("issue #%s の区画を書き換えました", ISSUE_NUMBER)
    return {"action": "update", "number": ISSUE_NUMBER, "why": ""}


def say(c: Count) -> None:
    """数えたものを、ログに出す。**仕組みの側へ回したぶんも数で出す。**

    0 を「見ていないから 0」と見分けられるように、分母から出す
    （`docs/island-standards.md` §15）。
    """
    print(f"きょうは {c.today}。"
          f"手入れ待ち {c.waiting}件（急ぐ {len(c.urgent)} / 急がない {len(c.later)}）、"
          f"仕組みの側へ回したのが {len(c.system)}件")
    print()
    for head, lines in (("急ぐ", c.urgent), ("急がない", c.later)):
        print(f"  [{head}] {len(lines)}件")
        for line in lines:
            print(f"    {line}")
    print(f"  [仕組みの側（この札には出さない）] {len(c.system)}件")
    for line in c.system:
        print(f"    {line}")
    for line in c.blind:
        print(f"::error::数えられません: {line}")


def act(apply: bool, content_dir: Path, today: date) -> int:
    """数えて、issue に当てて、**終了コードを返す。**

    *手入れが溜まっている*は赤くしない。*測れない*と*届かない*は赤くする。
    """
    c = count(content_dir, today)
    say(c)

    def once(gh):
        run(gh, c, apply=apply)

    code = run_watch.act(once, f"issue #{ISSUE_NUMBER}",
                         lambda repo, token: Gh(repo, token), log=logger)
    if code:
        return code
    return 2 if not c.countable else 0


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true",
                    help=f"issue #{ISSUE_NUMBER} の区画を実際に書き換える")
    ap.add_argument("--dir", default=str(CONTENT), help="焼き込みの置き場")
    ap.add_argument("--today", default="", help="きょう（YYYY-MM-DD）")
    ap.add_argument("--no-github", action="store_true",
                    help="数えて出すだけ。GitHub に1バイトも当たらない")
    a = ap.parse_args()

    today = _as_date(a.today) if a.today else date.today()
    if today is None:
        print("--today は YYYY-MM-DD で渡してください", file=sys.stderr)
        return 2

    d = Path(a.dir)
    if not d.is_dir():
        print(f"置き場がありません: {d}", file=sys.stderr)
        return 2

    if a.no_github:
        c = count(d, today)
        say(c)
        print()
        print(section(c))
        return 2 if not c.countable else 0

    return act(a.apply, d, today)


if __name__ == "__main__":
    sys.exit(main())
