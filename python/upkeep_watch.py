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
| 章が進んで欄が空いた（`site/content/chapters.ts`） | この下の `TRIGGERS` |

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
import logging
import sys
from dataclasses import dataclass
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

# **`site/content/*.ts` を字で読むのは、このリポジトリで1本だけ**（`python/ts_read.py`）
from ts_read import read_chapters  # noqa: E402

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)

REPO_ROOT = Path(__file__).resolve().parent.parent
CONTENT = REPO_ROOT / "site" / "content"
CHAPTERS_TS = "site/content/chapters.ts"

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


@dataclass(frozen=True)
class Trigger:
    """章が進んだときに空く欄ひとつぶんの見かた。

    **1行で足せる形にしてある。** 次に増える引き金（島の名前、`/now` の字）は、
    関数を1つ書いて `TRIGGERS` に1行足すだけ。
    """

    name: str                             # ログに出す名
    urgent: bool                          # 急ぐ側か
    find: Callable[[list[dict], date], list[Gap]]


def _as_date(s: str) -> date | None:
    """`YYYY-MM-DD`（頭10文字でよい）を日付に。読めなければ None。"""
    try:
        return datetime.strptime((s or "")[:10], "%Y-%m-%d").date()
    except ValueError:
        return None


def _field(slug: str, key: str) -> str:
    return f"`{CHAPTERS_TS}` の `{slug}` の `{key}`"


def arrived_without_from(rows: list[dict], today: date) -> list[Gap]:
    """**着いたのに、着いた日が入っていない。**

    `opensAt`（開く予定の日時）を過ぎているのに `from` が空。
    ここが空だと `began()` が `opensAt` に落ちるところまでは動くが、
    旅が実際にいつ始まったかは**どこにも無い**ままになる。
    2026-09-29 からの5晩、焼き直しが止まったのがこの形。
    """
    out = []
    for r in rows:
        opens = _as_date(r["opensAt"])
        if opens and opens <= today and not r["from"]:
            out.append(Gap(_field(r["slug"], "from"),
                           "島に着いた日（`YYYY-MM-DD`）", urgent=True))
    return out


def ended_without_countries(rows: list[dict], today: date) -> list[Gap]:
    """**旅が終わったのに、歩いた国が入っていない。**

    `to` が入っている＝本人が「この章は終わった」と書いた章。
    そこが空だと、島の道しるべが1本も立たない。

    急がない側に置いてあるのは、**国を足すには `countries.ts` の側も
    いっしょに動かす**から（番号を振り直す。`content/countries.ts` の
    `BEFORE_STREAM`）。その日のうちに埋める類のものではない。
    """
    return [Gap(_field(r["slug"], "countries"),
                "その章で歩いた国（`countries.ts` の slug）", urgent=False)
            for r in rows if r["to"] and not r["countries"]]


def running_without_days(rows: list[dict], today: date) -> list[Gap]:
    """**いまの章に、何日いるかが入っていない。**

    `plannedDays` は島の大きさを決める（入っていないあいだは浜のぶんだけの島）。
    **決まっていないのに見立てを入れると「◯日の旅」が事実として絵に出る**ので、
    空で正しいことがある。だから急がない側。

    「いまの章」は、始まっていて（`from` か `opensAt` が今日まで来ている）
    まだ終わっていない（`to` が空）章。**終わりの決めかたを自分で持たない**ように
    `to` の字だけを見る。
    """
    out = []
    for r in rows:
        start = _as_date(r["from"]) or _as_date(r["opensAt"])
        if start and start <= today and not r["to"] and not r["plannedDays"]:
            out.append(Gap(_field(r["slug"], "plannedDays"),
                           "その島に何日いるか（数）", urgent=False))
    return out


# **引き金の表。1行で足せる。**
TRIGGERS: tuple[Trigger, ...] = (
    Trigger("着いた日", True, arrived_without_from),
    Trigger("歩いた国", False, ended_without_countries),
    Trigger("滞在日数", False, running_without_days),
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


def count(content_dir: Path, today: date, books: dict | None = None) -> Count:
    """**いま空いている欄**を数える。GitHub を1バイトも触らない。

    Args:
        content_dir: `site/content`（仕込みの写しを渡してもよい）
        today: きょう
        books: 仕分けの表（省略時は `stale.BOOKS`）

    Returns:
        `Count`
    """
    blind: list[str] = []

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

    gaps: list[Gap] = []
    for t in TRIGGERS:
        found = t.find(rows, today)
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
