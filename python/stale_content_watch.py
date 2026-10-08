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

## 5つの見かた

| 見かた | 何が起きたら赤いか | どの本に付けるか |
| --- | --- | --- |
| `LATEST` | 中の**いちばん新しい過去の日付**が、今日から `days` 日より前 | 増えていくもの（料理・声・ショート） |
| `COVERS` | 中の**いちばん先の日付**が、要るところまで届いていない | 先ぶんの表（旅程） |
| `SNAP` | **取った日**が、その旅のためのものになっていない | 旅ごとに取り直す写し（街の店） |
| `KEYS` | **上流の鍵が、下流に無い**（1件でも） | 人が上流を書いたら続けて焼くもの（①b） |
| `SHARE` | 上流の鍵のうち**下流に無いものの割合**が `share`% を超えた | 全部そろわないのが普通のもの（セリフ） |

`COVERS` と `SNAP` は、どちらも**章（旅）で切る。** 向きが逆なだけ——
`COVERS` は「いちばん**先**が、要るところまで届いているか」、`SNAP` は
「いちばん**新しい**（＝取った）日が、その旅のうちに在るか」。
日だけで測ると、どちらも**旅が終わった日から消しようのない赤**になる。

`KEYS` と `SHARE` を分けてあるのは、**「1件も欠けてはいけない」と「欠けていて
当たり前」を同じ判定にすると、後者が永遠に赤いまま誰にも読まれなくなる**から。
料理の引用は品ごとに1件ずつ要る（`KEYS`）が、住人のセリフは持たない人が
共通のセリフに落ちる作りで、全員ぶん書き切ることを求めていない（`SHARE`）。

`KEYS` と `SHARE` は日付を見ない。`kitchenTalk.ts` は**日付を1つも持っていない**ので、
日で測ろうとすると一生鳴れない。見るべきは「`recipes.ts` に在る品が焼かれているか」で、
これは人が上流を書いた翌日から赤くなってほしい。だから猶予を置いていない。

## `COVERS` は「今日まで」ではない。**旅が終わっていれば、旅の最終日まで**

先ぶんの表（旅程 `nordic.ts`）は、旅のあいだは今日まで
届いていないと困る。**だが旅が終わったら、そこで止まっているのが正しい。**
終わった旅の旅程が今日まで伸びていたら、そちらのほうが嘘になる。

ここが「いつでも今日まで」だったので、北欧の旅が終わった 2026-09-27 の翌々日から、
毎晩の焼き直しが2本ぶん赤くなり続けた。**直っているものを不具合として鳴らす見張りは、
鳴らない見張りと同じくらい悪い**（`docs/island-standards.md` §13）。

**だからといって「終わった旅は見ない」にはしない。** 無条件に外すと、
**次の旅が始まった晩から、古い表のまま緑になる。** 旅程を1日も足さずに出発しても、
誰も鳴らさない。それは `shorts.ts` が127日止まっても緑だったのと同じ形（#119）。

| 旅 | 表がどこまで要るか |
| --- | --- |
| まだ終わっていない（進んでいる・これから） | **今日**（＋`days` 日） |
| もう終わった | **旅の最終日** |

## 日の出の表（`nordicSun.ts`）は、日でも章でも測らない

ここも `COVERS` で見ていた（2026-10-07 まで）。**満たしようのない赤の一歩前**だった。
焼くほう（`tools/nordic_sun.py`）が旅の初日・最終日・街を**手で持っていた**ので、

- 旅程が1日のびた日から赤くなる
- `todo` のとおり `python3 tools/nordic_sun.py` を回しても、**赤は消えない**
  （同じ17日を焼き直すだけ。実測で確かめた）
- 消すには**焼くほうのソースを人が書き換える**しかなかった

日の出・日の入りは**緯度経度と日付から計算で出る。** 人の頭の中にしか無いのは
旅程だけなので、**人を待つ理由が1つも無かった**（`docs/island-misses.md` #203）。

いまは焼く日と焼く街を旅程から引いて、`rebake.yml` が毎晩焼く。
ここが見るのは「**旅程の日が全部焼かれているか**」（`KEYS`。上流 `nordic.ts`）。
**旅が終わったかどうかを見る必要がなくなった**——旅程が止まれば表も止まり、
両方が同じ日で止まるので、章を引かなくても食い違いだけが出る。

## 企画の表（`plans.ts`）は、ここでは見ない

一度ここで「いちばん先の企画が今日以降か」を見た（2026-10-06）。**満たしようの
ない赤になった。** あやとの返事（2026-10-07、#673）が「これからの予定はとくになし」
で、**0件が正常な状態**だったので、人が何をしてもこの赤は消せない。
消しようのない赤は、鳴らない見張りと同じだけ悪い（§13 §15）。

**見るものを間違えていた。** 企画が0件なのは不具合ではない。不具合は
「0件のときに、画面が**行ってきた企画を「これから」として出す**」ことで、
それは表の日付ではなく画面の作りの話。見ているのは
`site/selftest/leadplan_selftest.mjs`（先が0件のとき `leadPlan()` が
何も返さないこと・画面が `nextPlan()` を使っていないこと）。

## 「旅が終わったか」を、その表の中から決めない

終わったかどうかを**その本のいちばん先の日付**から決めると、どんなに古い表でも
「そこで終わった旅」に見える。**いつでも通る見張り**ができあがる（§15）。

出どころは `site/content/chapters.ts` の章ひとつ（`BOOKS` の `chapter` に slug を書く）。
あちらは島の連なり・表紙・`/now` がすでに見ているもので、**旅が終わったかどうかの
唯一の出どころ。** 終わりの決めかたも `chapters.ts` の `ended()` に合わせてある——
`to` が入っていればそれ、空なら `plannedDays` ぶんか、次の章が始まる前日の早いほう。
**`to` は旅から帰った本人が手で入れる欄なので、そこだけを見ると永久に閉じない。**

**日付をここに書かない。** 「2026-09-27 を過ぎたら」と書くと、次の旅でそのまま嘘になる。

## 鍵の取りかたは `KEY_OF` に「どこから」だけを書く（`KEY_FN` は例外）

**字を読むのは `python/ts_read.py` の1本だけ**（`docs/island-misses.md` #208）。
ここに書くのは「どの並び（または表）の、どの欄か」だけで、読み方は書かない。
2026-10-07 までは本ごとに正規表現が7本あって、どれも**字下げの深さ**を
当てにしていた。行の折り方が変わればその人が黙って消える形だった。

**旅程（`nordic.ts`）だけは `KEY_FN` を通る。** 字で見ると `date: "…"` が
3か所に出てくる（`ROUTE` の区間・`DAYS` の行・`NORDIC_LOG` の日誌）ので、
`("DAYS", "date")` と書いても**焼くほう（`tools/nordic_sun.py`）と同じ答えに
ならない**——あちらは `read_trip()` を通して「日付の無い行は読み落としに数える」
ところまでやっている。`DAYS` の外に1日でも書かれた瞬間に
「焼かれていない日」が立って、焼いても消えない赤になる。
**同じ答えが要るものは、同じ口を通す。**

## 日付は、コメントから拾わない

`site/content/*.ts` にはコメントの中にも日付が書いてある
（`characterBox.ts` の「あやと『大きさも不揃い』2026-09-10」など）。
**あれは中身ではない。** 拾うと、データが半年止まっていても
「きのう誰かがコメントを直した」だけで新しく見える。

とくに `chapterStats.ts` / `chapterStreams.ts` は冒頭に
「数えた日: YYYY-MM-DD」を書く。**焼くたびに今日になる**ので、
そのまま最大値を取ると、中の数字が1つも動いていない晩でも「今日ぶん」に見える。

だから拾うのは **`"..."` の中に在る日付だけ**（`ts_read.string_spans`）。
注釈を落としてから数えるのは `island-misses.md` #125 の決めごと2と同じ形。

## 判定はファイルを読まない

`judge()` は「本の名前 → 見つけた日付と鍵」の辞書を受け取るだけで、口も
ファイルも持たない。**仕込んだ値で赤くなることと鳴らないことを、両側から
手元で見られる**ようにするため（`python/stale_content_watch_selftest.py`）。

## 印字に入れないもの

このリポジトリは公開。出すのは**ファイル名・日付・件数・slug（料理や伝説の合言葉）**
だけで、視聴者さんのチャンネルID・名前・どねID・コメント本文は1文字も出さない。
**住人の icon も出さない**（`characterBox.ts` / `chatter.ts` は `names=False`。
出しても新しく漏れるものは無いが、「この人のセリフが無い」という名指しの一覧に
なるのは別の話）
（`voices.ts` と `kitchenTalk.ts` には本文とアイコンが入っているが、ここは読まない）。
"""

from __future__ import annotations

import os
import re
import sys
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

# **`site/content/*.ts` を字で読むのは、このリポジトリで1本だけ**（`python/ts_read.py`）。
# 同じものを3通りに書いていたので、北欧の章が1つの読み方からだけ落ちていた
import ts_read  # noqa: E402
from ts_read import read_chapters, read_trip  # noqa: E402

REPO = Path(__file__).resolve().parent.parent
CONTENT = REPO / "site" / "content"

DATE_RE = re.compile(r"\d{4}-\d{2}-\d{2}")

# 章（＝旅）の在りか。**`COVERS` の本は、終わったかどうかをここから引く。**
CHAPTERS_TS = "chapters.ts"

# 見かた
LATEST = "LATEST"  # いちばん新しい過去の日付が、今日から離れていないか
COVERS = "COVERS"  # いちばん先の日付が、要るところ（旅の最中なら今日、
                   # 終わった旅なら旅の最終日）まで届いているか
KEYS = "KEYS"  # 上流の鍵が、下流に全部あるか
SHARE = "SHARE"  # 上流の鍵のうち、下流に無いものの**割合**が share% を超えたか
SNAP = "SNAP"  # 旅ごとに取り直す写し。旅が終わったら、その旅のうちに取れていればよい
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
    # `SHARE` のしきい値（%）。**全部そろっていることを求めない本**に使う。
    # セリフは持たない人がいて当たり前で（持たない人は共通のセリフに落ちる）、
    # `KEYS` のように1人でも欠けたら赤にすると、永遠に赤いまま誰も読まなくなる。
    #
    # **「ここまでは当たり前」の上限。** ちょうどこの値のときは鳴らさない
    # （境目の決め方と、丸めを入れない理由は `over_share()`）
    share: int = 0
    # 欠けたものを**名指しで印字してよいか。** 料理や伝説の slug は出してよいが、
    # 住人の icon は出さない（この頭の「印字に入れないもの」）。数は出す
    names: bool = True
    # `COVERS` / `SNAP` の本が見る章の slug（`site/content/chapters.ts`）。
    # **旅が終わったかどうかの出どころはここ1つ。** その本の中の日付から
    # 決めると、どんなに古い表でも「そこで終わった旅」に見えて永久に緑になる。
    # `COVERS` / `SNAP` の本には必ず書く（書いていなければ「数えられない」で止まる）。
    #
    # **「どの旅にも属さない表」という逃げ道は置かない。** 一度 `ENDLESS` という
    # 章の名を作って `plans.ts` をそこに入れたが（2026-10-06）、あれは
    # **消しようのない赤**になった。先ぶんの表で章を名乗れないものは、
    # 日付で測る見張りの持ち物ではない（頭の「企画の表は、ここでは見ない」）
    chapter: str = ""
    # **赤い行に、次にやることを1行そえる。** 「古い」と言われても、
    # 何をすれば緑になるかが本ごとに違う（料理は配信を見る、旅程は章を
    # 閉じる）。書かないと、読んだ人がまた調べ直すことになる
    todo: str = ""


# 鍵の集め方。`KEYS` の本と、その上流にだけ要る。
#
# **形が本ごとに違うので、1本ずつ書く**（`recipes.ts` は並びの中の `slug`、
# `kitchenTalk.ts` は `Record<string, …>` の鍵）。ただし**読み方は書かない**——
# どの並び（または表）から、どの欄を取るかだけを書く。字を読むのは
# `python/ts_read.py` の1本（`ts_read.py` の頭）。
#
# 前はここに本ごとの正規表現が7本あった。どれも**字下げの深さ**を当てにしていて
# （`^\s+\{ icon: "`）、行の折り方が変わればその人が黙って消える形だった。
# `chapters.ts` の北欧が消えたのと同じ理由なので、同じところに寄せた。
#
# | 形 | 書きかた | 例 |
# | --- | --- | --- |
# | 並びの中の欄 | `("ARRAY", "欄")` | `recipes.ts` の `RECIPES` の `slug` |
# | 表の鍵 | `("MAP",)` | `kitchenTalk.ts` の `KITCHEN_TALK` |
KEY_OF: dict[str, tuple] = {
    "recipes.ts": (("RECIPES", "slug"),),
    "kitchenTalk.ts": (("KITCHEN_TALK",),),
    "legends.ts": (("LEGENDS", "slug"),),
    "legendDays.ts": (("LEGEND_DAYS",),),
    # **名簿。** Firestore の `islandCharacter` そのものが毎晩ここに焼かれる
    # （`residents.ts` の頭に「並んでいるのは、キャラクターの名簿そのもの」と
    # 書いてある）。**名簿は本番にしかない、ではなかった**（#132）
    "residents.ts": (("RESIDENTS", "icon"),),
    # 箱（`BOX` の鍵）と、測れなかった人（`CHARACTER_BOX_BAKED.noArt`）の
    # **両方**を鍵にする。測れない人を鍵に含めないと、絵の無い人がいる限り
    # 永久に赤くなる
    "characterBox.ts": (("BOX",), ("CHARACTER_BOX_BAKED", "noArt")),
    "chatter.ts": (("VOICES", "icon"),),
    # 焼いた日の出の表の、日の鍵。**表（`Record<string, …>`）の鍵そのもの**なので、
    # `("SUN_BY_DAY",)` で取れる。
    # 2026-10-07 までは `^\s+"(\d{4}-\d\d-\d\d)": \{$` と**字下げ1段と行末**を
    # 当てにしていた。焼くほう（`tools/nordic_sun.py`）が書く形と揃えてあったが、
    # 書く形が変わった日に**鍵が0件になって「数えられない」に化ける**
    "nordicSun.ts": (("SUN_BY_DAY",),),
}

# 鍵が「並びの欄」でも「表の鍵」でもない本。**`python/ts_read.py` の
# 名前つきの口を通す。**
#
# 旅程（`nordic.ts`）の日は、字で見ると `date: "…"` が3か所に出てくる——
# `ROUTE` の区間、`DAYS` の行、`NORDIC_LOG` の日誌。**どれも同じ旅の日**なので
# 字で拾っても今日は同じ答えになるが、**焼くほう（`tools/nordic_sun.py`）は
# `DAYS` だけを見ている。** 読み方を2つ持つと、`DAYS` の外に1日でも書かれた
# 瞬間に「焼かれていない日」が立って、**焼いても消えない赤**になる。
# `chapters.ts` を3通りに読んで北欧だけが落ちたのと同じ形（`python/ts_read.py` の頭）。
#
# **`DAYS` を `KEY_OF` の `("DAYS", "date")` で取らないのも同じ理由。**
# あれは「`DAYS` の中の `date` 欄」という読み方で、`read_trip()` が
# 「朝いる街を区間から引き直して、日付の無い行は読み落としに数える」ところまで
# やっているのと**別物**になる。焼くほうと同じ答えが要るので、同じ口を通す。
KEY_FN = {
    # 旅程の日。**焼くほうと同じ `read_trip` を通す**
    "nordic.ts": lambda src: [d.date for d in read_trip(src).days],
}


def keys_of(name: str, src: str) -> list[str]:
    """その本が名乗っている鍵を、書いてある順に。表に無い本は空。

    **読み落ちを数で止めない。** ここは「上流と比べて何人欠けているか」を
    数える側なので、落ちれば**上流との差として表に出る**（止めるのではなく
    赤くなるのが正しい）。数えるものが0件なら `judge()` が
    「数えられない」で止める（`docs/island-standards.md` §15）。

    Args:
        name: 本の名前（`"recipes.ts"`）
        src: その本の中身そのもの

    Returns:
        鍵の並び。重なりは落とさない（上流との差を数えるのに件数も使う）
    """
    # **名前つきの口がある本は、そちらを先に通す。** 焼くほうと同じ答えが
    # 要るものは、同じ口から引かないと食い違う（`KEY_FN` の注）
    if name in KEY_FN:
        return KEY_FN[name](src)
    out: list[str] = []
    for spec in KEY_OF.get(name, ()):
        if len(spec) == 1:
            # 表（`Record<string, …>`）の鍵
            out += [k for k, _ in ts_read.read_map(src, spec[0])]
            continue
        who, key = spec
        body = ts_read.array_body(ts_read.code_only(src), who)
        if body:
            # 並びの中の欄（`RECIPES` の `slug`）
            out += [
                v for o in ts_read.objects(body)
                if (v := ts_read.fields(o).get(key, ""))
            ]
            continue
        # 並びでなければ、表の中の `key: ["…", …]`（`CHARACTER_BOX_BAKED.noArt`）
        ob = ts_read.object_body(ts_read.code_only(src), who)
        if ob:
            out += ts_read.list_field(ob, key)
    return out

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
    "characterBox.ts": Book(
        MACHINE, KEYS, 0,
        "キャラクターの絵の中で実際に描かれている範囲（`tools/sprites/charbox.py`）。"
        "**名簿（Firestore `islandCharacter`）は `residents.ts` に毎晩そのまま焼かれている**"
        "ので、名簿に居て箱の無い人はファイルだけで数えられる（#132。"
        "前はここを「名簿は本番にしかない」として測っていなかった）。"
        "**絵が無くて測れない人は、焼くほうが `noArt` に名指しで置く**ので赤にならない。"
        "日では測らない——名簿は誰も入らない月があり、入った翌日に鳴ってほしい",
        upstream="residents.ts",
        names=False,
        todo="**待てば入る。** `rebake.yml` が `build_residents` と同じ回で焼くので、"
             "次の焼き直しは取り込みの後ろ（実測 21:49〜23:32 UTC）。"
             "**それより早く要るなら**、Actions の「島の数字を焼き直す」を "
             "`scripts: build_residents` / `dry_run: false` / `deploy: true` で押す"
             "（手で焼くだけなら `python3 tools/sprites/charbox.py`。"
             "絵が無い人は noArt に入って緑になる）",
    ),
    # --- 人が書く。**全員ぶんは求めない。割合で見る** ---
    "chatter.ts": Book(
        HUMAN, SHARE, 0,
        "島の住人が話すこと。**手で書く**ので、持っていない人は共通のセリフに落ちる。"
        "1人でも欠けたら赤（`KEYS`）にすると永遠に赤いままなので、"
        "**名簿のうちセリフの無い人の割合**で見る。しきい値の 50% は、"
        "**しきい値から作っていない実測2つ**のあいだに置いた: "
        "あやとに「台詞が普通すぎる」と言われた 2026-09-16 の朝が **80/102人＝78%**、"
        "その日に書き切ったあとが **27/102人＝26%**（どちらも git の実測）。"
        "26% 側で鳴らず、78% 側で鳴る。"
        "**実測2つは、ちょうど 50 のときにどちらへ倒すかを言っていない。** "
        "そこは `over_share()` で決めてある——**ちょうど 50 は鳴らさない**"
        "（日で見る本の「ちょうどしきい値の日は鳴らさない」と同じ向き）",
        upstream="residents.ts",
        share=50,
        todo="`python/admin/chatter_voices.py` で口調を拾って `chatter.ts` に書き足す",
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
        MACHINE, LATEST, 3,
        "`STATS_FALLBACK.updatedAt`。口（`/island-api/state`）が落ちた日にだけ出る"
        "受け皿の数字（配信本数・コメント数・人数）で、**落ちた日ほど本当らしく"
        "見えないと困る**。"
        "**長いあいだ `人` の 30日だった。** そこが間違いで、この4つは人の頭の中に"
        "無い——`python/island_daily_stats.py` が毎晩数えて口に置き、口がそのまま"
        "返している数の写し。機械で取れる数を人に打たせていたので、"
        "**33日古くなって赤が出た**（2026-10-07。焼き込み 747本 / 口 800本）。"
        "いまは `python/build_site_stats.py` が毎晩焼く。"
        "3日にしたのは、`updatedAt` が毎晩動くから——口は晩（UTC）に書くので"
        "**1日前はふつうに出る**（実測 2026-10-06 / きょう 2026-10-07）。"
        "2晩落ちても見のがし、3晩目で鳴る。"
        "**`rebake.yml` の「凍っていないか」には日数を置いていない**"
        "（あちらは 0＝見ない。日数を2か所に置かない）。"
        "**このファイルの `SITE` と `PROFILE` は人の欄で、ここでは測れていない**"
        "——どちらも日付を持たないので、`LATEST` に出てくるのは焼くほうの"
        "`updatedAt` だけ。測れていないものを「測った」と言わない（§15）。"
        "`PROFILE` の日付（誕生日・日本を出た日）は**事実なので古くならない**が、"
        "`SITE.description` と `PROFILE.body` は書き替わりうる。"
        "そこを見張るには「いつ書いた字か」が要るので、"
        "**先に `aboutWords.ts` と同じ形（本人の言葉に書いた日を添える）に"
        "してからでないと足せない**",
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
    "nordicShops.ts": Book(
        OUTSIDE, SNAP, 30,
        "街の店（OpenStreetMap、`tools/nordic/shops.py`）。焼くほうが"
        "**いちばん古い街を取った日**を `SHOPS_FETCHED` に書き戻す（#132。"
        "前は取った日がどこにも無くて測れなかった）。"
        "**30日は「旅をまたいだか」を見る値で、店の入れ替わりの速さではない**"
        "——OSM の店がどれくらいの速さで変わるかは、こちらからは測れない。"
        "この表は旅ごとに取り直すもので、いまの旅は17日（`chapters.ts` の `plannedDays`）。"
        "旅の前日に取って最終日まで使うと最大18日古くなるので、その上に置いた。"
        "**日だけで見ると、旅が終わった31日目に消しようのない赤が立つ**"
        "（終わった旅の店の表はそこで止まっているのが正しいのに、"
        "持ち主が `外の地図`＝人待ちなので、整備の札に永久に居座る）。"
        "だから旅の章で切る（`SNAP`）",
        chapter="nordic",
        todo="旅がまだなら `python3 tools/nordic/shops.py` を回して街の表を取り直す。"
             "終わった旅なら、**その旅のうちに取れていれば緑**なので、"
             "赤いときは店の表と `site/content/chapters.ts` の章の日付が食い違っている",
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
        "北欧の旅の旅程。出発前に全日ぶん確定するので、旅のあいだは今日まで届いて"
        "いて当たり前。**旅が終わったら、旅の最終日で止まっているのが正しい**"
        "（終わった旅の旅程が今日まで伸びていたら、そちらが嘘）。"
        "終わったかどうかは `chapters.ts` の `nordic` から引く（`covers_until`）",
        chapter="nordic",
        todo="旅がまだなら `site/content/nordic.ts` の `DAYS` と `ROUTE` に残りの日を足す。"
             "終わった旅で足りないなら、**旅程と `site/content/chapters.ts` の章の `to` が"
             "食い違っている**ので、どちらが正しいかを先に決める",
    ),
    "nordicSun.ts": Book(
        MACHINE_HUMAN, KEYS, 0,
        "旅の日ごとの日の出・日の入り（`tools/nordic_sun.py`）。尽きると、旅の面から"
        "明るさの欄が消える。**日では測らない。旅程（`nordic.ts`）の日が"
        "1日でも焼かれていなければ赤。**"
        "\n\n"
        "2026-10-07 まで `COVERS`（いちばん先の日付が旅の終わりまで届いているか）だった。"
        "**満たしようのない赤になりかけていた**——焼くほう（`tools/nordic_sun.py`）が"
        "初日・最終日・街を手で持っていて、毎晩の焼き直しにも乗っていなかったので、"
        "**次の旅で旅程が1日のびた日から、人が手で回すまで毎晩赤**になる。"
        "日の出は緯度経度と日付から計算で出る（外の口も BigQuery も要らない）ので、"
        "**人を待つ理由が1つも無かった**（`shorts.ts` #119 / `site.ts` #202 と同じ外し方）。"
        "\n\n"
        "いまは旅程から日と街を引いて `rebake.yml` が毎晩焼くので、"
        "**旅程がのびた晩に、ひとりでに追いつく。** 赤が立つのは"
        "「人が旅程を書いたが、まだ焼き直しが来ていない」あいだだけで、"
        "**その赤は次の晩に機械が消す**（`kitchenTalk.ts` と同じ①b の形）。"
        "猶予（`days`）を置いていないのはそのため",
        upstream="nordic.ts",
        todo="**待てば入る。** `rebake.yml` が毎晩焼く（取り込みの後ろ。実測 21:49〜23:32 UTC）。"
             "**それより早く要るなら** `python3 tools/nordic_sun.py`"
             "（`--check` で突き合わせだけもできる）。"
             "焼いても消えないなら、旅程に座標の無い街が入っている"
             "——焼くほうが名指しで断って 2 で止まる",
    ),
    # --- 見ない。理由つき ---
    "plans.ts": Book(
        HUMAN, SKIP, 0,
        "企画の表。**ここで日付を測らない。** あやとの返事（2026-10-07 / #673）が"
        "「これからの予定はとくになし」で、**先の予定が0件なのは正常な状態**。"
        "`COVERS`（いちばん先の日付が今日以降か）で見たら、人が何をしても消せない"
        "赤になり、毎晩の焼き直しがそれで赤くなった（§13 §15）。"
        "**本当の不具合は0件そのものではなく、0件のときに画面が"
        "「行ってきた」企画を「いま、いちばん近い企画」として出すこと。**"
        "見ているのは `site/selftest/leadplan_selftest.mjs`"
        "（先が0件なら `lib/leadPlan.ts` が何も返さない・画面が `nextPlan()` を"
        "読んでいない）。日付の表ではなく画面の作りを見る見張りなので、ここには置けない",
    ),
    "aboutWords.ts": Book(
        HUMAN, SKIP, 0,
        "2026-09-11 に本人が書いた文そのもの。**1字も直さない**ので、古くならない"
        "（`docs/island-fresh.md` 4章「本人の言葉には、書かれた日をいっしょに置く」）",
    ),
    "nordicFood.ts": Book(HUMAN, SKIP, 0, "旅先のふだんのごはんの読みもの。日付を1つも持たない"),
    "themes.ts": Book(HUMAN, SKIP, 0, "掲示板のテーマ。画面に出る言葉で、日付を持たない"),
    "voice.ts": Book(HUMAN, SKIP, 0, "島のことばづかい。画面に出る言葉"),
    "nights.ts": Book(HUMAN, SKIP, 0, "配信の時間の言い方。画面に出る言葉"),
    "roulette.ts": Book(HUMAN, SKIP, 0, "ルーレットの結果に投げる1行。画面に出る言葉"),
    "trip.ts": Book(DERIVED, SKIP, 0, "旅の面の入口。`nordic.ts` から組む"),
    "tripPlaces.ts": Book(DERIVED, SKIP, 0, "旅程で降りる街。`nordic.ts` から導出する"),
    "place.ts": Book(DERIVED, SKIP, 0, "打たれた場所から国と街を引く。`countries.ts` と `nordic.ts` から"),
    "planDays.ts": Book(DERIVED, SKIP, 0, "日付→企画の表。`plans.ts` と `nordic.ts` から組む"),
    "directory.ts": Book(DERIVED, SKIP, 0, "島にある紙ぜんぶの一覧。ほかの焼き込みを集めるだけ"),
    "walked.ts": Book(
        DERIVED, SKIP, 0,
        "歩いた国の数。`countries.ts` から画面が出てから数える。**自分では日付を持たない**"
        "（数が面ごとにそろっているかは `tools/sprites/walkedcount.mjs` が見る）",
    ),
}


# ---------------------------------------------------------------- 読むところ


def iter_string_dates(src: str) -> list[tuple[int, int, str]]:
    """文字列リテラルの中にある日付の位置と字。**対照はここを書き換えて作る。**"""
    out = []
    # **「どこが字で、どこが注釈か」を数えるのは `ts_read` の1本だけ。**
    # ここは前、同じ歩きを自前に持っていた（URL の `//` を注釈と読まないよう、
    # 文字列に入っているかを先に見る作り）。写しが2つあると、片方だけ直した日に
    # 見ているものが違う（`ts_read.py` の頭）
    for a, b in ts_read.string_spans(src):
        for m in DATE_RE.finditer(src, a, b):
            out.append((m.start(), m.end(), m.group(0)))
    return out


def _as_date(s: str) -> date | None:
    try:
        return datetime.strptime(s, "%Y-%m-%d").date()
    except ValueError:
        return None  # 2026-13-45 のような字。日付ではないので数えない


# ---------------------------------------------------------------- 章を読む
#
# **`site/content/chapters.ts` だけが、旅の始まりと終わりの出どころ。**
# 島の連なりも表紙も `/now` もここを見ている（`lib/stay.ts`）。
# 見張りだけ別のところから決めると、画面と見張りが別のことを言う日が来る。
#
# **字を読むのは `python/ts_read.py`。ここではやらない。** 同じものを3通りに
# 書いていたので、北欧の章が片方の読み方からだけ落ちて、島の数字から
# 9/12〜9/27 が丸ごと消えていた（`ts_read.py` の頭）。ここがやるのは、
# 読めた章から「始まりと終わり」を決めるところだけ。


@dataclass(frozen=True)
class Span:
    """章（＝旅）ひとつぶんの、始まった日と終わった日。

    `end` が `None` なのは「**終わりがまだ決まっていない**」であって、
    「終わった」ではない。読む側は必ず分けて扱う（`ended()`）。
    """

    slug: str
    start: date | None
    end: date | None

    def ended(self, today: date) -> bool:
        """その日、この旅はもう終わっていたか。**最終日の当日はまだ終わっていない。**"""
        return self.end is not None and self.end < today


def chapter_spans(src: str) -> list[Span]:
    """`chapters.ts` から章の始まりと終わりを読む。

    **決めかたは `chapters.ts` の `began()` / `ended()` に合わせる。**
    あちらと別の決めかたをすると、画面が「旅のとちゅう」と言っている晩に
    見張りだけ「終わった」と言う、という食い違いが出る（実際に出た。
    `chapters.ts` の `chapterRunning` の注）。

      始まり … `from`（事実）が先。空なら `opensAt`（予定）の日付
      終わり … `to` が入っていればそれ。空なら `plannedDays` ぶんか、
               **本線の次の章が始まる前日**の、早いほう

    `to` は旅から帰った本人が手で入れる欄なので、**そこだけを見ると永久に
    閉じない。** 次の章の始まりまで見るのは、そのための逃げ道。
    """
    rows = read_chapters(src).rows

    def start_of(f: dict) -> date | None:
        if f["from"]:
            return _as_date(f["from"])
        return _as_date(f["opensAt"][:10])

    # 次の章は**本線だけ**で数える（枝は本線の1歩ではない。`branchOf`）。
    # 枝を数えると、枝の出た日で親の章が閉じてしまう
    main = sorted(d for f in rows if not f["branchOf"] and (d := start_of(f)))

    out: list[Span] = []
    for f in rows:
        start = start_of(f)
        end = _as_date(f["to"])
        if end is None and start is not None:
            cands: list[date] = []
            if f["plannedDays"] > 0:
                cands.append(start + timedelta(days=f["plannedDays"] - 1))
            nxt = [d for d in main if d > start]
            if nxt:
                cands.append(nxt[0] - timedelta(days=1))
            end = min(cands) if cands else None
        out.append(Span(f["slug"], start, end))
    return out


@dataclass
class Facts:
    """1本を読んで分かったこと。**判定はしない。**"""

    name: str
    found: bool = False
    dates: list[date] = field(default_factory=list)
    keys: list[str] = field(default_factory=list)
    # `chapters.ts` だけが持つ。`COVERS` の本が「旅が終わったか」を引きにくる
    chapters: list[Span] = field(default_factory=list)
    # 名乗っているのに読めなかった章の数（`ts_read.ChapterRead.missed`）。
    # **0 でなければ「数えられない」。** 読み落とした章が先ぶんの表の持ち主
    # だったら、旅が終わったかどうかが分からないまま通ってしまう
    chapters_missed: int = 0


def scan(path: Path) -> Facts:
    """焼き込み1本を読む。**BigQuery も git も引かない。**"""
    f = Facts(name=path.name)
    if not path.is_file():
        return f
    f.found = True
    src = path.read_text(encoding="utf-8")
    seen = {d for _, _, s in iter_string_dates(src) if (d := _as_date(s))}
    f.dates = sorted(seen)
    f.keys = keys_of(path.name, src)
    if path.name == CHAPTERS_TS:
        # 2回読んでいるのは、`chapter_spans()` を「字を渡せば章が返る」形の
        # ままにしておきたいから（対照が仕込みの字をそのまま当てられる）。
        # `chapters.ts` は15KB なので、2回でも測れるほどの差は出ない
        f.chapters = chapter_spans(src)
        f.chapters_missed = read_chapters(src).missed
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


def over_share(missing: int, total: int, share: int) -> bool:
    """欠けた割合が、しきい値を**超えた**か。`SHARE` の本の境目はここ1か所。

    ## ちょうどしきい値のときは、鳴らさない

    `share` は「**ここまで欠けているのは当たり前**」の上限であって、
    「ここから先が普通」ではない。だから `>=` ではなく `>` で見る。
    日で見る本（`LATEST` / `COVERS`）が「ちょうどしきい値の日は鳴らさない」で
    そろえてあるので、**割合の本だけ逆向きにしない**。

    `chatter.ts` の 50% を決めた実測（78% で鳴る / 26% で鳴らない）は、
    **ちょうど 50 のときにどちらへ倒すかを何も言っていない。**
    言っていないものを実測から読み取ったふりをせず、
    「しきい値ちょうどは、まだ当たり前の側」と**ここで決めた**
    （2026-09-24。`island-misses.md` #187）。

    ## 丸めてから比べない

    前はここが `round(100 * missing / total) > share` だった。**割合を先に
    丸めるので、境目が実際の値から最大 0.5 ポイントずれる。** しかも
    Python の `round` は偶数側へ寄せるので、ずれ方が上下で違う:

    | 人数 | 本当の割合 | 丸めると | 丸めて比べると | 正しくは |
    | --- | --- | --- | --- | --- |
    | 101/200 | 50.5% | 50 | 通った | **赤**（50 を超えている） |
    | 50/99 | 50.505% | 51 | 赤 | 赤 |
    | 49/99 | 49.49% | 49 | 通った | 通った |

    **名簿の人数が変わるたびに境目が動く**ので、名簿が偶数のあいだは気づけない。
    整数のまま両辺に `total` を掛けて比べれば、丸めが1つも入らない。

    Args:
        missing: 下流に無い鍵の数
        total: 上流の鍵の数（0 を渡さないこと。呼ぶ前に「数えられない」で弾く）
        share: しきい値（%）

    Returns:
        しきい値を超えていれば True
    """
    return missing * 100 > share * total


def covers_until(span: Span, today: date, days: int) -> date:
    """先ぶんの表が、**どこまで届いていれば緑か。** `COVERS` の境目はここ1か所。

    ## 旅が終わっていれば、旅の最終日まで

    終わった旅の旅程が今日まで伸びていないのは、**正常。** 伸びていたら
    そちらのほうが嘘になる。ここが「いつでも今日まで」だったので、
    北欧の旅が終わったあと、毎晩の焼き直しが2本ぶん赤くなり続けた。

    ## まだ終わっていなければ、今日（＋`days` 日）まで

    **「終わった旅は見ない」にしない。** 無条件に外すと、**次の旅が
    始まった晩から、古い表のまま緑になる。** まだ始まっていない章も
    「終わっていない」側に入れる——出発前の旅程は全日ぶん確定しているので、
    今日まで届いていて当たり前（北欧は出発の2日前に確定していた）。

    ## 日付をここに書かない

    「2026-09-27 を過ぎたら」と書いた瞬間、次の旅で嘘になる。
    終わったかどうかは `chapters.ts` の章（`Span`）だけが知っている。

    Args:
        span: その本が属する章（`BOOKS` の `chapter`）
        today: きょう
        days: 旅のあいだに、今日より何日先まで要るか（`Book.days`）

    Returns:
        表のいちばん先の日付が、この日以上なら緑
    """
    if span.ended(today):
        return span.end  # `ended()` が True なら、終わりの日は必ず入っている
    return today + timedelta(days=days)


def snap_window(span: Span, today: date, days: int) -> tuple[date, date]:
    """旅ごとに取り直す写しが、**いつ取られていれば緑か。** `SNAP` の境目はここ1か所。

    ## 旅が終わっていれば、その旅のうちに取れていればよい

    `nordicShops.ts` は旅の街の店の表で、**旅が終われば、もう取り直さない。**
    日数だけで見ると、旅が終わった `days` 日後から**消しようのない赤**が立つ:

    - 終わった旅の店の表が古いのは**正常**（取り直すほうが嘘になる）
    - なのに持ち主は `外の地図`＝人待ちなので、`upkeep_watch` が整備の札に出す
    - **人が何をしても消えない。** 整備の札がまた「自分の出番が無い一覧」になる

    実際に 2026-10-14（旅の最終日 09-27 ＋ 取った日 09-13 から31日）に立つ
    ところだった。`nordic.ts` / `nordicSun.ts` で 2026-10-03 に直したのと同じ形。

    終わった旅で見るのは「**この旅のために取ったものか**」だけ:

    - 上は **旅の最終日**。それより後に取れていたら、旅が終わってから
      取り直したか、章の `to` が間違っている
    - 下は **旅の始まりの `days` 日前**。それより前なら、**ひとつ前の旅の表を
      持ち越している**（旅と旅のあいだは実測で最大126日空く）

    ## まだ終わっていなければ、今日から `days` 日前まで

    旅の最中は、日で見る本（`LATEST`）と同じ。**「終わった旅は見ない」に
    しない**——無条件に外すと、次の旅が始まっても古い表のまま緑になる。

    ## 日付をここに書かない

    終わったかどうかは `chapters.ts` の章（`Span`）だけが知っている。

    Args:
        span: その本が属する章（`BOOKS` の `chapter`）
        today: きょう
        days: 旅のあいだに許す古さ（`Book.days`）

    Returns:
        （いちばん古くていい日, いちばん新しくていい日）。**両端を含む**
    """
    if span.ended(today):
        return span.start - timedelta(days=days), span.end
    return today - timedelta(days=days), today


def span_of(book: Book, seen: dict[str, Facts]) -> tuple[Span | None, str]:
    """その本が属する章。**`COVERS` と `SNAP` が、ここ1か所から引く。**

    「どの章の表か書き忘れた」は、**読めなかった**として返す。
    黙って通すと、書き忘れた本が毎晩緑になる（§15）。

    Args:
        book: 仕分け1本ぶん
        seen: 本の名前 → `Facts`

    Returns:
        （章。読めなければ None, 読めなかった理由。読めていれば空）
    """
    if not book.chapter:
        return None, "どの章の表なのか（`Book.chapter`）が書いてありません"
    ch = seen.get(CHAPTERS_TS)
    spans = {s.slug: s for s in (ch.chapters if ch else [])}
    span = spans.get(book.chapter)
    if span is None or span.start is None:
        return None, (f"章 `{book.chapter}` を {CHAPTERS_TS} から読めません"
                      f"（読めた章 {len(spans)}個）")
    return span, ""


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

    # **章を読み落としていたら、先へ進まない。** 落ちた章が先ぶんの表の持ち主
    # だったら「旅が終わったか」が分からないまま通る。`chapterStats.ts` が
    # 北欧を丸ごと落としていたのが、これを見ていなかったから
    ch = seen.get(CHAPTERS_TS)
    if ch and ch.found and ch.chapters_missed:
        v.blind.append(
            f"{CHAPTERS_TS} が名乗っている章のうち {ch.chapters_missed}個を読めていません"
            f"（読めたのは {len(ch.chapters)}個）。`python/ts_read.py` の読み方か、"
            f"{CHAPTERS_TS} の書き方のどちらかが合っていません"
        )

    for name in sorted(books):
        b = books[name]
        f = seen.get(name)
        if f is None or not f.found:
            continue  # 上の blind で言った
        if b.rule == SKIP:
            v.results.append(Result(name, b.who, SKIP, 0, "見ない", b.why))
            continue

        if b.rule == SHARE:
            up = seen.get(b.upstream)
            if up is None or not up.found or not up.keys:
                v.blind.append(f"{name} の上流 {b.upstream} から鍵が取れません")
                v.results.append(Result(name, b.who, SHARE, b.share, "数えられない",
                                        f"上流 {b.upstream} の鍵が0件"))
                continue
            mine = set(f.keys)
            missing = [k for k in up.keys if k not in mine]
            # **`pct` は印字だけに使う。** 判定は `over_share` の整数どうしで見る
            pct = round(100 * len(missing) / len(up.keys))
            detail = (f"上流 {b.upstream} の {len(up.keys)}人 / ここ {len(f.keys)}人"
                      f" / 無い {len(missing)}人（{pct}%）")
            if over_share(len(missing), len(up.keys), b.share):
                # **誰が欠けているかは出さない。** icon は公開だが、ここに
                # 並べると「この人のセリフが無い」という名指しの一覧になる。
                # 拾うのは `python/admin/chatter_voices.py` の仕事
                v.red.append(
                    f"{name} が上流 {b.upstream} の {pct}% をまだ持っていません"
                    f"（しきい値 {b.share}% / {len(missing)}/{len(up.keys)}人）"
                    + (f" → {b.todo}" if b.todo else "")
                )
                v.results.append(Result(name, b.who, SHARE, b.share, "赤", detail))
            else:
                v.results.append(Result(name, b.who, SHARE, b.share, "通った", detail))
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
                    f"{name} に {b.upstream} の {len(missing)}件が焼かれていません"
                    + ("：" + ", ".join(missing[:10]) if b.names else "")
                    + (f" → {b.todo}" if b.todo else "")
                )
                v.results.append(Result(name, b.who, KEYS, 0, "赤",
                                        detail + f" / 欠け {len(missing)}"))
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

        if b.rule in (COVERS, SNAP):
            # **旅が終わったかどうかは、この本の中からは決めない。**
            # 自分の日付から決めると、どんなに古い表でも「そこで終わった旅」に
            # 見えて、永久に緑になる（§15）
            span, why = span_of(b, seen)
            if span is None:
                v.blind.append(
                    f"{name} は {b.rule} で見る本なのに、{why}。"
                    f"旅が終わったかどうかが決まらないので、通ったとは言いません"
                )
                v.results.append(Result(name, b.who, b.rule, b.days, "数えられない", why))
                continue

        if b.rule == SNAP:
            # 旅ごとに取り直す写し。**いちばん新しい日付＝取った日**
            took = f.dates[-1]
            lo, hi = snap_window(span, today, b.days)
            done = span.ended(today)
            detail = (
                f"取った日 {took} / 章 {b.chapter} "
                f"{span.start}〜{span.end or '終わり未定'}"
                f"（{'終わった' if done else '終わっていない'}）"
                f" / {lo}〜{hi} なら緑 / 日付 {len(f.dates)}件"
            )
            if not (lo <= took <= hi):
                v.red.append(
                    (f"{name} の表が、終わった旅（{b.chapter} {span.start}〜{span.end}）の"
                     f"ものではありません（取った日 {took} / {lo}〜{hi} なら緑）"
                     if done else
                     f"{name} が {(today - took).days}日前で止まっています"
                     f"（しきい値 {b.days}日 / 取った日 {took}）")
                    + (f" → {b.todo}" if b.todo else "")
                )
                v.results.append(Result(name, b.who, SNAP, b.days, "赤", detail))
            else:
                v.results.append(Result(name, b.who, SNAP, b.days, "通った", detail))
            continue

        if b.rule == COVERS:
            last = f.dates[-1]
            until = covers_until(span, today, b.days)
            done = span.ended(today)
            where = (
                f"章 {b.chapter} {span.start}〜{span.end or '終わり未定'}"
                f"（{'終わった' if done else '終わっていない'}）"
            )
            detail = (
                f"いちばん先の日付 {last} / {where}"
                f" / {until} まで要る / 日付 {len(f.dates)}件"
            )
            if last < until:
                v.red.append(
                    (f"{name} の表が、終わった旅（{b.chapter}）の最終日 {until} まで"
                     f"届いていません（いちばん先が {last}）"
                     if done else
                     f"{name} の表が今日に届いていません（いちばん先が {last} / "
                     f"{until} まで要る）")
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
        days = (f"{r.days}日" if r.rule in (LATEST, COVERS, SNAP)
                else f"{r.days}%" if r.rule == SHARE else "-")
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
