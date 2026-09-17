"""**焼き込み（`site/content/*.ts`）が古くなっていないかを、中身だけで見る。**

    python3 python/stale_content_watch.py
    python3 python/stale_content_watch.py --dir /tmp/写し --today 2026-09-17

終了コード 0=通った / 1=古いものがあった / **2=数えるものが無い**。

## なぜ要るか

焼き込みは35本あるのに、**古くなったら鳴るものが付いているのは6本だけ**だった
（`rebake.yml` の step「凍っていないか」の `WATCH`。9本並んでいるが3本は 0＝見ない）。
残りは何ヶ月古くなっても赤くならない。実際に:

| 何 | どれだけ止まっていたか |
| --- | --- |
| `shorts.ts` | **127日**（2026-05-12 → 09-13。`island-misses.md` #119） |
| `countryStats.ts` | **4ヶ月**（2026-05-06 から。#104） |
| `kitchenTalk.ts` | `recipes.ts` の `french-toast`（2026-05-25）が**いまも入っていない** |

どれも毎晩緑だった。**緑は「落ちなかった」としか言っていない。**

## `rebake.yml` の「凍っていないか」と、どう分担するか

**軸が違う。日数を2か所に置かない。**

| | 何を見るか | どこから読むか | 何本 |
| --- | --- | --- | --- |
| 凍り（`rebake.yml`） | 焼き直したのに**ファイルの字面が動かない** | git の履歴 | 毎晩焼く6本 |
| ここ | 焼き込みの**中に書いてある日付**が今日から離れた | ファイルの中だけ | 上の6本を**除いた**29本 |

**あちらが日数を持っている6本を、ここでは判定しない**（`BOOKS` で `SKIP_REBAKE`）。
同じことを2か所で判定すると、片方を直し忘れた日に食い違う
（`docs/island-fresh.md` 2章「凍っているかどうかを、見張りはもう一度判定しない」）。
判定しないが**表には出す。** 黙って抜くと、次に読む人が「なぜここだけ無いのか」を
調べ直すことになるし、**35本ぶん並んでいないと分母にならない**
（`docs/island-standards.md` §15）。

## 3つの見かた

| 見かた | 何が起きたら赤いか | どの本に付けるか |
| --- | --- | --- |
| `LATEST` | 中の**いちばん新しい過去の日付**が、今日から `days` 日より前 | 増えていくもの（料理・声・ショート） |
| `COVERS` | 中の**いちばん先の日付**が、もう今日に届いていない | 先ぶんの表（旅程・日の出） |
| `KEYS` | **上流の鍵が、下流に無い** | 人が上流を書いたら続けて焼くもの（①b） |

`KEYS` だけは日付を見ない。`kitchenTalk.ts` は**日付を1つも持っていない**ので、
日で測ろうとすると一生鳴れない。見るべきは「`recipes.ts` に在る品が焼かれているか」で、
これは人が上流を書いた翌日から赤くなってほしい。だから猶予を置いていない。

## 日付は、コメントから拾わない

`site/content/*.ts` にはコメントの中にも日付が書いてある
（`characterBox.ts` の「あやと『大きさも不揃い』2026-09-10」など）。
**あれは中身ではない。** 拾うと、データが半年止まっていても
「きのう誰かがコメントを直した」だけで新しく見える。

とくに `chapterStats.ts` / `chapterStreams.ts` は冒頭に
「数えた日: YYYY-MM-DD」を書く。**焼くたびに今日になる**ので、
そのまま最大値を取ると、中の数字が1つも動いていない晩でも「今日ぶん」に見える。

だから拾うのは **`"..."` の中に在る日付だけ**（`_string_spans`）。
注釈を落としてから数えるのは `island-misses.md` #125 の決めごと2と同じ形。

## 判定はファイルを読まない

`judge()` は「本の名前 → 見つけた日付と鍵」の辞書を受け取るだけで、口も
ファイルも持たない。**仕込んだ値で赤くなることと鳴らないことを、両側から
手元で見られる**ようにするため（`python/stale_content_watch_selftest.py`）。

## 印字に入れないもの

このリポジトリは公開。出すのは**ファイル名・日付・件数・slug（料理や伝説の合言葉）**
だけで、視聴者さんのチャンネルID・名前・どねID・コメント本文は1文字も出さない
（`voices.ts` と `kitchenTalk.ts` には本文とアイコンが入っているが、ここは読まない）。
"""

from __future__ import annotations

import os
import re
import sys
from dataclasses import dataclass, field
from datetime import date, datetime
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
CONTENT = REPO / "site" / "content"

DATE_RE = re.compile(r"\d{4}-\d{2}-\d{2}")

# 見かた
LATEST = "LATEST"  # いちばん新しい過去の日付が、今日から離れていないか
COVERS = "COVERS"  # いちばん先の日付が、まだ今日に届いているか
KEYS = "KEYS"  # 上流の鍵が、下流に全部あるか
SKIP = "SKIP"  # 見ない（理由を必ず書く）

# だれが新しくするか（`docs/island-fresh.md` 1章の仕分け）
MACHINE = "機械"  # 本番を読めば答えが出る。毎晩ひとりでに焼ける
MACHINE_HUMAN = "機械/上流が人"  # 人が上流を書いたあと、続けて焼く（①b）
HUMAN = "人"  # 人の頭の中にしかない
OUTSIDE = "外の地図"  # OpenStreetMap など、こちらの都合では変わらない
DERIVED = "導出"  # 他の焼き込みから作る。自分では何も持たない
WORDS = "言葉"  # 画面に出る文。日付を持たない


@dataclass(frozen=True)
class Book:
    """1本ぶんの仕分け。**`why` を空にしない**（読む人が調べ直すことになる）。"""

    who: str
    rule: str
    days: int
    why: str
    upstream: str = ""
    # **赤い行に、次にやることを1行そえる。** 「古い」と言われても、
    # 何をすれば緑になるかが本ごとに違う（料理は配信を見る、旅程は章を
    # 閉じる）。書かないと、読んだ人がまた調べ直すことになる
    todo: str = ""


# 鍵の集め方。`KEYS` の本と、その上流にだけ要る。
# **形が本ごとに違うので、1本ずつ書く**（`recipes.ts` は `slug: "..."`、
# `kitchenTalk.ts` は `"...": {` の鍵）。当てずっぽうの正規表現を1本で済ませない。
KEY_RE = {
    "recipes.ts": re.compile(r'^\s+slug: "([^"]+)"', re.M),
    "kitchenTalk.ts": re.compile(r'^\s+"([a-z0-9-]+)": \{', re.M),
    "legends.ts": re.compile(r'^\s+slug: "([^"]+)"', re.M),
    "legendDays.ts": re.compile(r'^\s+"([a-z0-9-]+)": \{', re.M),
}

# `rebake.yml` の step「凍っていないか」が日数を持っている本。
# **ここでは判定しない**（上の「どう分担するか」）。表には出す。
SKIP_REBAKE = "rebake.yml の「凍っていないか」が {}日で見ている。日数を2か所に置かない"


BOOKS: dict[str, Book] = {
    # --- 毎晩ひとりでに焼ける。rebake が日数を持っている（ここでは判定しない）---
    "chapterStats.ts": Book(
        MACHINE, SKIP, 0,
        SKIP_REBAKE.format(4) + "。中にある日付は「数えた日」1つだけで、焼くたび今日になる",
    ),
    "residents.ts": Book(MACHINE, SKIP, 0, SKIP_REBAKE.format(3) + "。日付を1つも持たない"),
    "streamPeaks.ts": Book(MACHINE, SKIP, 0, SKIP_REBAKE.format(10) + "。日付を1つも持たない"),
    "onThisDay.ts": Book(MACHINE, SKIP, 0, SKIP_REBAKE.format(4)),
    "cityStreams.ts": Book(MACHINE, SKIP, 0, SKIP_REBAKE.format(7)),
    "countryStats.ts": Book(
        MACHINE, SKIP, 0,
        SKIP_REBAKE.format(5)
        + "。中の日付は国ごとの「いちばん盛り上がった配信」の日で、新しさとは関係ない",
    ),
    # --- 毎晩ひとりでに焼けるが、rebake が見ていない ---
    "shorts.ts": Book(
        MACHINE, LATEST, 90,
        "YouTube のショートのタブを読む。rebake は 0（見ない）なので、**127日止まっても"
        "赤くならなかった**（#119）。実測の空きは 45 / 49 / 83 / 124 / 214日。"
        "124日ぶんが #119 そのもの。90日はその下に置いた。"
        "**214日の空きが本当の沈黙だったのかは、ファイルからは分からない**",
    ),
    "chapterStreams.ts": Book(
        MACHINE, LATEST, 300,
        "閉じた章のぶんだけ入る。章が閉じるまで動かないのが正常で、過去の章の長さは"
        "3〜6ヶ月。300日は「章が1つも閉じないまま1年近くたった」を拾うだけの床",
    ),
    # --- ①b 焼けるが、上流が人。**鍵で見る** ---
    "kitchenTalk.ts": Book(
        MACHINE_HUMAN, KEYS, 0,
        "`recipes.ts` の品ぜんぶに1件ずつ要る。**日付を1つも持たない**ので日では測れない。"
        "人が料理を足したら、その場で焼くもの（猶予を置かない）",
        upstream="recipes.ts",
    ),
    "legendDays.ts": Book(
        MACHINE_HUMAN, KEYS, 0,
        "`legends.ts` の伝説ぜんぶに1件ずつ要る。日付も持っているが、それは伝説の配信の日"
        "なので、**新しい伝説が足されたのに焼いていない**ほうが先に出る鍵で見る",
        upstream="legends.ts",
    ),
    # --- 人しか決められない。日で見る ---
    "recipes.ts": Book(
        HUMAN, LATEST, 60,
        "料理の日。間隔の中央値は2日、直近1年の最大は127日（2025-10-13→2026-02-17）。"
        "60日を超えた空きは直近1年で**その1回だけ**。あれが本当の休みだったのか"
        "スタンプ帳が止まっていたのかは**ファイルからは分からない**が、"
        "分からないほうを一度言うほうが、127日黙るよりいい",
    ),
    "voices.ts": Book(
        HUMAN, LATEST, 60,
        "他己紹介の抜粋。手で選ぶ（`python/voices_picks.json`）。間隔の中央値は6日、"
        "実測の空きは 48 / 57 / 94 / 106 / 180日",
    ),
    "site.ts": Book(
        HUMAN, LATEST, 30,
        "`STATS_FALLBACK.updatedAt`。口（`/island-api/state`）が落ちた日にだけ出る"
        "受け皿の数字（配信本数・コメント数・人数）で、**落ちた日ほど本当らしく"
        "見えないと困る**。ここだけ人が手で書く日付そのものが入っている",
    ),
    "streamTypes.ts": Book(
        HUMAN, LATEST, 60,
        "5つの型の代表配信を手で選ぶ。直近1年の空きは最大28日なので、60日はその倍",
    ),
    "countries.ts": Book(
        HUMAN, LATEST, 150,
        "歩いた国と滞在。**旅から帰った本人が書く**ので、旅のあいだは1行も増えない"
        "（いまの旅の滞在は `nordic.ts` から出す）。実測の空きは最大120日",
    ),
    "plans.ts": Book(
        HUMAN, LATEST, 60,
        "企画の選定。**中に過去の日付が2つしか無い**（ほかは `until` `when` の先ぶん）ので、"
        "測れているのは「いちばん新しい企画がいつのものか」だけ。60日は `streamTypes` に揃えた",
    ),
    "apps.ts": Book(
        HUMAN, LATEST, 120,
        "アプリの節目。直近1年の空きは最大102日（2026-02-26→06-08）。120日はその上",
    ),
    "chapters.ts": Book(
        HUMAN, LATEST, 240,
        "章（島）の区切り。2年で10章、間隔の中央値は126日。**日数で細かく測れる相手ではない**"
        "ので、240日は「1年近く章が動いていない」を拾うだけの床",
    ),
    "legends.ts": Book(
        HUMAN, LATEST, 300,
        "どれを伝説と呼ぶか。2年で8つ、実測の空きは最大222日。ここも床でしかない。"
        "**足したのに焼いていない**ほうは `legendDays.ts` の鍵が先に拾う",
    ),
    # --- 先ぶんの表。尽きたら鳴る ---
    "nordic.ts": Book(
        HUMAN, COVERS, 0,
        "いま歩いている旅の旅程。出発前に確定しているので古くはならないが、"
        "**旅の終わり（2026-09-27）を過ぎると、旅程が今日に届かなくなる。**"
        "そのときは面を次の章に替える時期",
        todo="旅が終わったので、北欧の章を閉じて6カ国を countries.ts に足す（issue #282）",
    ),
    "nordicSun.ts": Book(
        MACHINE, COVERS, 0,
        "旅の日ごとの日の出・日の入り（`tools/nordic_sun.py`）。旅程と同じ日数ぶんしか無い。"
        "尽きると、旅の面から明るさの欄が消える",
        todo="`nordic.ts` を新しくしてから `tools/nordic_sun.py` を回し直す（issue #282）",
    ),
    # --- 見ない。理由つき ---
    "aboutWords.ts": Book(
        HUMAN, SKIP, 0,
        "2026-09-11 に本人が書いた文そのもの。**1字も直さない**ので、古くならない"
        "（`docs/island-fresh.md` 4章「本人の言葉には、書かれた日をいっしょに置く」）",
    ),
    "characterBox.ts": Book(
        MACHINE, SKIP, 0,
        "キャラクターの絵の中で実際に描かれている範囲（`tools/sprites/charbox.py`）。"
        "**名簿（Firestore `islandCharacter`）に人が増えると古くなるが、名簿は本番に"
        "しかないので、ファイルだけでは何人ぶん足りないか分からない。**"
        "ここは「分からない」のまま置いてある",
    ),
    "chatter.ts": Book(
        HUMAN, SKIP, 0,
        "島の住人が話すこと。日付を1つも持たない。増えるのは名簿に人が増えたときで、"
        "**何人ぶん足りないかはファイルだけでは分からない**（`characterBox.ts` と同じ）",
    ),
    "nordicFood.ts": Book(HUMAN, SKIP, 0, "旅先のふだんのごはんの読みもの。日付を1つも持たない"),
    "nordicShops.ts": Book(
        OUTSIDE, SKIP, 0,
        "街の店（OpenStreetMap、`tools/nordic/shops.py`）。**いつ取ったかがどこにも"
        "書かれていない**（`nordic/shops.json` にも無い）ので、古いかどうかを測れない。"
        "測れるようにするなら、焼くほうに取った日を入れるのが先",
    ),
    "themes.ts": Book(HUMAN, SKIP, 0, "掲示板のテーマ。画面に出る言葉で、日付を持たない"),
    "voice.ts": Book(HUMAN, SKIP, 0, "島のことばづかい。画面に出る言葉"),
    "nights.ts": Book(HUMAN, SKIP, 0, "配信の時間の言い方。画面に出る言葉"),
    "roulette.ts": Book(HUMAN, SKIP, 0, "ルーレットの結果に投げる1行。画面に出る言葉"),
    "trip.ts": Book(DERIVED, SKIP, 0, "旅の面の入口。`nordic.ts` から組む"),
    "tripPlaces.ts": Book(DERIVED, SKIP, 0, "旅程で降りる街。`nordic.ts` から導出する"),
    "place.ts": Book(DERIVED, SKIP, 0, "打たれた場所から国と街を引く。`countries.ts` と `nordic.ts` から"),
    "planDays.ts": Book(DERIVED, SKIP, 0, "日付→企画の表。`plans.ts` と `nordic.ts` から組む"),
    "directory.ts": Book(DERIVED, SKIP, 0, "島にある紙ぜんぶの一覧。ほかの焼き込みを集めるだけ"),
}


# ---------------------------------------------------------------- 読むところ


def _string_spans(src: str) -> list[tuple[int, int]]:
    """`"..."` `'...'` `` `...` `` の中身の位置。**コメントは入らない。**

    URL（`https://…`）が文字列の中に入っているので、`//` を見て
    コメントだと決める前に、文字列に入っているかどうかを先に見る。
    """
    out: list[tuple[int, int]] = []
    i, n = 0, len(src)
    while i < n:
        c = src[i]
        if c in "\"'`":
            j = i + 1
            start = j
            while j < n:
                if src[j] == "\\":
                    j += 2
                    continue
                if src[j] == c:
                    break
                j += 1
            out.append((start, min(j, n)))
            i = j + 1
            continue
        if c == "/" and i + 1 < n and src[i + 1] == "/":
            j = src.find("\n", i)
            i = n if j < 0 else j + 1
            continue
        if c == "/" and i + 1 < n and src[i + 1] == "*":
            j = src.find("*/", i + 2)
            i = n if j < 0 else j + 2
            continue
        i += 1
    return out


def iter_string_dates(src: str) -> list[tuple[int, int, str]]:
    """文字列リテラルの中にある日付の位置と字。**対照はここを書き換えて作る。**"""
    out = []
    for a, b in _string_spans(src):
        for m in DATE_RE.finditer(src, a, b):
            out.append((m.start(), m.end(), m.group(0)))
    return out


def _as_date(s: str) -> date | None:
    try:
        return datetime.strptime(s, "%Y-%m-%d").date()
    except ValueError:
        return None  # 2026-13-45 のような字。日付ではないので数えない


@dataclass
class Facts:
    """1本を読んで分かったこと。**判定はしない。**"""

    name: str
    found: bool = False
    dates: list[date] = field(default_factory=list)
    keys: list[str] = field(default_factory=list)


def scan(path: Path) -> Facts:
    """焼き込み1本を読む。**BigQuery も git も引かない。**"""
    f = Facts(name=path.name)
    if not path.is_file():
        return f
    f.found = True
    src = path.read_text(encoding="utf-8")
    seen = {d for _, _, s in iter_string_dates(src) if (d := _as_date(s))}
    f.dates = sorted(seen)
    if path.name in KEY_RE:
        f.keys = KEY_RE[path.name].findall(src)
    return f


def scan_dir(d: Path) -> dict[str, Facts]:
    """その置き場の `*.ts` を全部読む。**表に無いものも読む**（分母に入れる）。"""
    return {p.name: scan(p) for p in sorted(d.glob("*.ts"))}


# ---------------------------------------------------------------- 決めるところ


@dataclass
class Result:
    """1本ぶんの判定。`status` は 赤 / 通った / 見ない / 数えられない。"""

    name: str
    who: str
    rule: str
    days: int
    status: str
    detail: str


@dataclass
class Verdict:
    results: list[Result] = field(default_factory=list)
    red: list[str] = field(default_factory=list)
    blind: list[str] = field(default_factory=list)  # 数えられなかったもの（終了コード 2）

    @property
    def judged(self) -> list[Result]:
        return [r for r in self.results if r.rule != SKIP]

    @property
    def ok(self) -> bool:
        return not self.red and not self.blind


def judge(seen: dict[str, Facts], today: date, books: dict[str, Book] | None = None) -> Verdict:
    """読んだ結果を見て、赤にするかどうかを決める。**ファイルを開かない。**

    Args:
        seen: 本の名前 → `Facts`（`scan_dir` が返すもの）
        today: きょう
        books: 仕分けの表（省略時は `BOOKS`）

    Returns:
        Verdict
    """
    books = BOOKS if books is None else books
    v = Verdict()

    # **表と置き場が食い違っていたら、数より先に言う**（`island-standards.md` §15）。
    # 焼き込みが1本増えたのに表に足し忘れると、**その1本だけ誰も見ないまま**になる。
    for name in sorted(set(seen) - set(books)):
        v.blind.append(f"{name} が `BOOKS` の表にありません。仕分けを決めて足してください")
    for name in sorted(set(books) - set(seen)):
        v.blind.append(f"{name} が置き場にありません（表には在る）")

    for name in sorted(books):
        b = books[name]
        f = seen.get(name)
        if f is None or not f.found:
            continue  # 上の blind で言った
        if b.rule == SKIP:
            v.results.append(Result(name, b.who, SKIP, 0, "見ない", b.why))
            continue

        if b.rule == KEYS:
            up = seen.get(b.upstream)
            if up is None or not up.found:
                v.blind.append(f"{name} の上流 {b.upstream} が読めません")
                v.results.append(Result(name, b.who, KEYS, 0, "数えられない", f"上流 {b.upstream} が無い"))
                continue
            if not up.keys:
                v.blind.append(f"{b.upstream} から鍵が1つも取れません（{name} の上流）")
                v.results.append(Result(name, b.who, KEYS, 0, "数えられない", "上流の鍵が0件"))
                continue
            missing = [k for k in up.keys if k not in set(f.keys)]
            detail = f"上流 {b.upstream} の {len(up.keys)}件 / ここ {len(f.keys)}件"
            if missing:
                v.red.append(
                    f"{name} に {b.upstream} の {len(missing)}件が焼かれていません: "
                    + ", ".join(missing[:10])
                )
                v.results.append(Result(name, b.who, KEYS, 0, "赤", detail + f" / 欠け {len(missing)}"))
            else:
                v.results.append(Result(name, b.who, KEYS, 0, "通った", detail))
            continue

        if not f.dates:
            v.blind.append(f"{name} に日付が1つもありません（{b.rule} で見る本なのに数えるものが無い）")
            v.results.append(Result(name, b.who, b.rule, b.days, "数えられない", "日付が0件"))
            continue

        if b.rule == LATEST:
            past = [d for d in f.dates if d <= today]
            if not past:
                v.blind.append(f"{name} の日付が全部これから先です（いちばん古くて {f.dates[0]}）")
                v.results.append(Result(name, b.who, LATEST, b.days, "数えられない", "過去の日付が0件"))
                continue
            age = (today - past[-1]).days
            detail = f"いちばん新しい日付 {past[-1]}（{age}日前）/ 日付 {len(f.dates)}件"
            if age > b.days:
                v.red.append(f"{name} が {age}日前で止まっています（しきい値 {b.days}日 / 最新 {past[-1]}）")
                v.results.append(Result(name, b.who, LATEST, b.days, "赤", detail))
            else:
                v.results.append(Result(name, b.who, LATEST, b.days, "通った", detail))
            continue

        if b.rule == COVERS:
            last = f.dates[-1]
            left = (last - today).days
            detail = f"いちばん先の日付 {last}（あと{left}日）/ 日付 {len(f.dates)}件"
            if left < b.days:
                v.red.append(
                    f"{name} の表が今日に届いていません（いちばん先が {last} / "
                    f"あと{b.days}日ぶんは要る）"
                    + (f" → {b.todo}" if b.todo else "")
                )
                v.results.append(Result(name, b.who, COVERS, b.days, "赤", detail))
            else:
                v.results.append(Result(name, b.who, COVERS, b.days, "通った", detail))
            continue

        v.blind.append(f"{name} の見かた `{b.rule}` を知りません")
    return v


# ---------------------------------------------------------------- 出すところ


def report(v: Verdict, today: date) -> None:
    """**分母から出す。**「赤 0本」だけでは、見ていないから0本と区別がつかない（§15）。"""
    skipped = [r for r in v.results if r.rule == SKIP]
    print(
        f"焼き込み {len(v.results)}本を見て、判定したのは {len(v.judged)}本"
        f"（見ないと決めたのが {len(skipped)}本）。きょうは {today}"
    )
    print()
    print(f"  {'本':22} {'だれが':14} {'見かた':7} {'しきい値':>6}  {'判定':10} 中身")
    for r in sorted(v.results, key=lambda r: (r.rule == SKIP, r.name)):
        days = f"{r.days}日" if r.rule in (LATEST, COVERS) else "-"
        print(f"  {r.name:22} {r.who:14} {r.rule:7} {days:>6}  {r.status:10} {r.detail}")

    for line in v.blind:
        print(f"::error::数えられません: {line}")
    for line in v.red:
        print(f"::error::{line}")

    summary = os.environ.get("GITHUB_STEP_SUMMARY")
    if summary:
        with open(summary, "a", encoding="utf-8") as f:
            f.write("\n### 焼き込みが古くなっていないか\n\n")
            f.write(f"{len(v.results)}本のうち {len(v.judged)}本を判定（{len(skipped)}本は見ない）\n\n")
            if v.ok:
                f.write("古くなっているものはありません。\n")
            for line in v.blind:
                f.write(f"- ⚠️ 数えられません: {line}\n")
            for line in v.red:
                f.write(f"- 🔴 {line}\n")


def main() -> int:
    argv = sys.argv[1:]
    d = CONTENT
    today = date.today()
    if "--dir" in argv:
        d = Path(argv[argv.index("--dir") + 1])
    if "--today" in argv:
        got = _as_date(argv[argv.index("--today") + 1])
        if got is None:
            print("--today は YYYY-MM-DD で渡してください", file=sys.stderr)
            return 2
        today = got

    if not d.is_dir():
        print(f"置き場がありません: {d}", file=sys.stderr)
        return 2
    seen = scan_dir(d)
    if not seen:
        print(f"数えるものがありません（{d} に *.ts が1本もない）", file=sys.stderr)
        return 2

    v = judge(seen, today)
    report(v, today)
    if v.blind:
        return 2
    return 1 if v.red else 0


if __name__ == "__main__":
    sys.exit(main())
