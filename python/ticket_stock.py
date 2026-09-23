"""**開いている issue を毎週棚卸しして、まとめ1本に映し続ける。**

    python3 python/ticket_stock.py                 # 数えて出すだけ（1バイトも書かない）
    python3 python/ticket_stock.py --apply         # まとめの issue に書く
    python3 python/ticket_stock.py --out /tmp/a.md # 書き上がった本文をファイルにも出す
    python3 python/ticket_stock.py --from-json f.json --today 2026-09-19
                                                   # GitHub を読まずに、手元の写しで回す

終了コード 0=通った / 1=**届かなかった** / 2=数えるものが無い。

## なぜ要るか

あやとの言葉（2026-09-19）:

> 何度も言ってるが、チケットは終わったらクローズしろよ。**そろそろ永続化するとか対策打てよ。**

手順書（`.claude/skills/island-ship/SKILL.md` の6章）には**もう**
「出したら、その場で閉じる」と書いてある。それでも閉じ忘れが続いている。
**手順に書くのは対策ではない**（`docs/island-standards.md`）。

開いたままの issue は、**誰かが一覧を見に行かないと見えない。**
見に行かない週があれば、そのぶん静かに溜まる。25本のうち2本は
**588日と540日** 誰も触っていなかった（2026-09-19 実測）。
どちらも「忘れていた」のではなく、**思い出す機会が1度も来なかった。**

だから直し方は「もっと気をつける」ではない。**人が居なくても、
週に1回ひとりでに表へ出る**ようにする。

## 毎週 issue を立てない

立てると、棚卸しそのものが溜まる。**同じ1本の本文を書き換え続ける。**
見つけかたは `donor_calls` / `ingest_down` / `bake_down` と同じで、
固定のラベルと、本文に埋めた見えない印の両方で引く。

## 通知は、本文ではなくコメントで飛ぶ

**本文を書き換えても通知は1通も飛ばない。** 毎週ここを書き換えるだけでは、
あやとには何も届かない（`python/ticket_labels.py` の docstring）。
だから**あやと待ちが在る週だけ、コメントを1本足す。**

足しすぎないように `PING_COOLDOWN_DAYS` を置いてある。繋ぎ先が2本あるので
同じ週に2回走ることがあり、そのたびに鳴らすと雑音になる。

## 「誰待ちか」は題名ではなく札で読む

題名の【あやとの操作】は**人が読むもので、機械からは読めない。**
読むのは `待ち-あやと` / `待ち-システム` / `旅のあと` の3つだけ
（`python/ticket_labels.py`）。札が付いていないものは「札が無い」として
**数に出す。** 黙って落とすと、分母が合わなくなる
（`docs/island-standards.md` §15）。

## 赤くしない

**何本溜まっていても 0 で終わる。** 溜まっていることは、まとめのほうに出ている。
赤で知らせるのをやめるために作ったものが、自分で赤を積んだら元に戻る。

**ただし「届かない」は 1 で落ちる。** 読めない・書けない・権限が無いは、
この仕組みそのものが動いていないということ。黙って 0 で終わると、
まとめが古いまま誰も気づかない（`python/ingest_down.py` と同じ決め）。

## 対照（`BREAK=`）

**この道具は「何も見ていなくても、それらしい本文」を出せてしまう。**
だから2つの壊し方を自分で持っていて、`python/ticket_stock_selftest.py` が
そのたびに落ちることを見る。

| `BREAK=` | 何を外すか | 落ちるはずのもの |
| --- | --- | --- |
| `nostale` | 30日の線 | 動いていないものが1本も名指しされない |
| `nolabel` | 札を読むところ | 待ちの相手が1つも出ない／メンションも消える |

**2つは別々に落ちる。** 片方を外してももう片方は通ることまで見る。
"""

import argparse
import json
import logging
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
from datetime import date, datetime, timezone

sys.path.insert(0, __file__.rsplit("/", 1)[0])

from ticket_labels import (  # noqa: E402
    HANDLE, WAITS, WAIT_AYATO, mention_live, wait_of,
)

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)

API = "https://api.github.com"

# 本文に埋める見えない印。GitHub は HTML コメントを描かない。
# **タイトルでは探さない**（人が読みやすく書き換える）
MARK = "<!-- ticket-stock -->"

# 鳴らしたコメントに埋める印。**日付ごと**入れて、続けて鳴らさないために使う
PING_MARK = "<!-- ticket-stock-ping"

# 固定のラベル。印と両方で引く
LABEL = "ticket-stock"
LABEL_COLOR = "bfd4f2"
LABEL_DESC = "開いている issue の棚卸し（毎週ひとりでに書き換わる）"

# タイトルは**作るときだけ**入れて、あとは触らない
TITLE = "開いたままの issue（毎週の棚卸し）"

# **何日動いていなかったら名指しするか。**
#
# 30日にしたのは、いま開いている25本の分布から決めた（2026-09-19 実測）。
# 7日で切ると23本が並んで「全部」になり、名指しの意味が無くなる。
# 90日で切ると2本しか残らないが、その2本は**588日と540日**放置されていた
# ——つまり90日は「もう手遅れ」の線。
# 30日＝1か月動いていないものは、**忘れられたと言ってよい。**
STALE_DAYS = 30

# 同じ週に2回鳴らさない。繋ぎ先が2本あるので、同じ曜日に2回走ることがある。
# 6日にしてあるのは、週に1回の鳴りを落とさないため（7日だと、走る時刻が
# 前の週より数分早い週に「まだ6日23時間」で黙る）
PING_COOLDOWN_DAYS = 6

# 1回に読む件数。開いている issue は25本なので1枚で足りるが、
# **増えた日に黙って切り捨てない**ように次の枚も読む
PER_PAGE = 100
MAX_PAGES = 10


def days_between(a: str, today: str):
    """`a`（ISO の時刻）から `today`（`YYYY-MM-DD`）まで何日か。

    読めなければ None。未来なら 0（時計のずれで負にしない）。

    Args:
        a: GitHub が返す `created_at` / `updated_at`
        today: 今日（UTC の `YYYY-MM-DD`）

    Returns:
        日数か None
    """
    if not isinstance(a, str):
        return None
    try:
        d = datetime.fromisoformat(a.replace("Z", "+00:00")).date()
        n = (date.fromisoformat(today) - d).days
    except (ValueError, TypeError):
        return None
    return max(n, 0)


def survey(issues: list, today: str, breaks=(), said=None) -> list:
    """引いてきた issue を、**数えられる形**に均す。GitHub を触らない。

    - pull request は落とす（`/issues` は PR も返す）
    - 棚卸しそのもの（`MARK` を持つ1本）は落とす。自分を数えない

    **「動いていない日数」に `updated_at` を使わない。**
    あれは札を1枚付けただけでも今日になる。2026-09-19 に25本へ札を付けたら、
    588日と540日 放置されていた2本が**その場で「0日」になった。**
    片づけの操作で、片づいていないことが見えなくなるのでは意味が無い。

    代わりに数えるのは「**最後に誰かが何か言ってから**」——立てた日と、
    いちばん新しいコメントの日の、遅いほう。札を付け替えても動かない。

    `BREAK=nolabel` のときは**札を読まない。** そうすると待ちの相手が
    全部「札が無い」に落ちる——`python/ticket_stock_selftest.py` が
    それを当てる。

    Args:
        issues: GitHub から返ってきた issue の一覧
        today: 今日（UTC の `YYYY-MM-DD`）
        breaks: 外す守り（`"nostale"` / `"nolabel"`）
        said: 番号 -> いちばん新しいコメントの時刻。無い番号は立てた日で数える

    Returns:
        `{"number", "title", "wait", "open_days", "idle_days"}` の並び。番号の小さい順
    """
    blind = "nolabel" in breaks
    said = said or {}
    rows = []
    for i in issues or []:
        if i.get("pull_request"):
            continue
        if MARK in (i.get("body") or ""):
            continue
        num = i.get("number")
        opened = days_between(i.get("created_at"), today)
        spoke = days_between(said.get(num), today)
        # コメントが無ければ、立てた日が「最後に誰かが言った日」。
        # 両方あるなら**新しいほう**＝日数の小さいほうを採る
        known = [x for x in (opened, spoke) if x is not None]
        idle = min(known) if known else None
        rows.append({
            "number": num,
            "title": (i.get("title") or "").strip(),
            "wait": "" if blind else wait_of(i.get("labels")),
            "open_days": opened,
            "idle_days": idle,
        })
    return sorted(rows, key=lambda r: r["number"] or 0)


def summarize(rows: list, today: str, breaks=()) -> dict:
    """棚卸しの中身を組み立てる。**ここも GitHub を触らない素の関数。**

    `BREAK=nostale` のときは**動いていないものを1本も名指ししない。**
    30日の線が効いているかを、`python/ticket_stock_selftest.py` が
    ここで当てる。

    Args:
        rows: `survey()` の返り値
        today: 今日（UTC の `YYYY-MM-DD`）
        breaks: 外す守り

    Returns:
        `{"today", "total", "by_wait", "unlabeled", "stale", "ayato"}`
    """
    by_wait = {w: [r for r in rows if r["wait"] == w] for w in WAITS}
    unlabeled = [r for r in rows if not r["wait"]]

    if "nostale" in breaks:
        stale = []
    else:
        stale = [r for r in rows
                 if r["idle_days"] is not None and r["idle_days"] >= STALE_DAYS]
    stale = sorted(stale, key=lambda r: -(r["idle_days"] or 0))

    return {
        "today": today,
        "total": len(rows),
        "by_wait": by_wait,
        "unlabeled": unlabeled,
        "stale": stale,
        "ayato": by_wait[WAIT_AYATO],
    }


def _table(rows: list) -> list:
    """issue の並びを、読める表にする。**題名はそのまま出す**（issue も公開）。"""
    out = ["| issue | 開いてから | 最後に誰かが言ってから | 待ち |",
           "| --- | --- | --- | --- |"]
    for r in rows:
        od = f"{r['open_days']}日" if r["open_days"] is not None else "—"
        idl = f"{r['idle_days']}日" if r["idle_days"] is not None else "—"
        out.append(f"| #{r['number']} {r['title']} | {od} | {idl} | "
                   f"{r['wait'] or '札が無い'} |")
    return out


def body(s: dict) -> str:
    """まとめの本文。**読む人がこれから何をするかだけ。**

    どこを見て決めているか・何日で名指しする決まりかは書かない
    （`CLAUDE.md`「画面で、システムの仕様を説明しない」）。

    **`@Ayato-kosaka` は、囲いにも引用にも入れない。** 入れると字としては
    在るのに1通も飛ばない（`python/ticket_labels.mention_live()`）。

    Args:
        s: `summarize()` の返り値

    Returns:
        本文。頭に見えない印が入る
    """
    lines = [MARK, "",
             f"開いたままの issue が **{s['total']}本** あります"
             f"（{s['today']} に数えました）。", ""]

    lines += ["| 待ち | 本数 |", "| --- | --- |"]
    for w in WAITS:
        lines.append(f"| {w} | {len(s['by_wait'][w])} |")
    lines.append(f"| 札が無い | {len(s['unlabeled'])} |")
    lines.append("")

    # **あやと待ちが先。** ここが読まれなければ、この仕組みは何もしていない
    if s["ayato"]:
        lines.append(f"## あやとの手が要るもの（{len(s['ayato'])}本）")
        lines.append("")
        # ここが唯一の「飛ぶ」行。行の頭に置いて、囲いに巻き込まれないようにする
        lines.append(f"{HANDLE} 下の{len(s['ayato'])}本は、"
                     f"あやとが動かさないと進みません。")
        lines.append("")
        lines += _table(s["ayato"])
        lines.append("")

    if s["stale"]:
        lines.append(f"## {STALE_DAYS}日以上、誰も何も言っていないもの"
                     f"（{len(s['stale'])}本）")
        lines.append("")
        lines += _table(s["stale"])
        lines.append("")

    if s["unlabeled"]:
        lines.append(f"## 待ちの相手が決まっていないもの"
                     f"（{len(s['unlabeled'])}本）")
        lines.append("")
        lines.append("`待ち-あやと` / `待ち-システム` / `旅のあと` の"
                     "どれかを付けてください。")
        lines.append("")
        lines += _table(s["unlabeled"])
        lines.append("")

    if not s["ayato"] and not s["stale"] and not s["unlabeled"]:
        lines.append("待っているものも、止まっているものもありません。")
        lines.append("")

    return "\n".join(lines).rstrip() + "\n"


def find_issue(issues: list, mark: str = MARK):
    """棚卸しの**同じ1本**を選ぶ。

    `python/donor_calls.find_issue()` と同じ決め。タイトルでは探さない。
    開いているものを先に、無ければ閉じたもののうち番号のいちばん大きいもの。
    閉じたものを返すのは、次の週に**同じ1本を開け直す**ため。

    Args:
        issues: 引いてきた issue の一覧
        mark: 探す見えない印

    Returns:
        1本（辞書）か None
    """
    hit = [i for i in issues
           if not i.get("pull_request") and mark in (i.get("body") or "")]
    opened = sorted((i for i in hit if i.get("state") == "open"),
                    key=lambda i: i["number"])
    if opened:
        if len(opened) > 1:
            logger.warning("同じ印の issue が %d本 開いています。"
                           "いちばん古い #%d だけ使います",
                           len(opened), opened[0]["number"])
        return opened[0]
    closed = sorted((i for i in hit if i.get("state") != "open"),
                    key=lambda i: i["number"])
    return closed[-1] if closed else None


def last_ping_day(comments: list):
    """**最後に鳴らした日**をコメントから拾う。

    どこかに控えを持つのではなく、鳴らしたコメント自身に日付を埋める。
    控えを別に持つと、控えだけ消えた週に鳴り続ける。

    Args:
        comments: `/issues/{n}/comments` の返り値

    Returns:
        `YYYY-MM-DD` か None
    """
    days = []
    for c in comments or []:
        b = c.get("body") or ""
        if PING_MARK not in b:
            continue
        tail = b.split(PING_MARK, 1)[1].strip()
        token = tail.split()[0] if tail.split() else ""
        try:
            days.append(date.fromisoformat(token).isoformat())
        except ValueError:
            continue
    return max(days) if days else None


def ping_due(last: str, today: str) -> bool:
    """**今週もう鳴らしたか**を見る。

    Args:
        last: 最後に鳴らした日（`last_ping_day()`）か None
        today: 今日

    Returns:
        鳴らしてよければ True
    """
    if not last:
        return True
    try:
        return (date.fromisoformat(today)
                - date.fromisoformat(last)).days >= PING_COOLDOWN_DAYS
    except ValueError:
        return True


def ping_body(s: dict) -> str:
    """鳴らすコメント。**1行と、日付の印だけ。**

    本文に何が書いてあるかはすぐ上に出ているので、繰り返さない。
    `HANDLE` を行の先頭に置く（囲いや引用に巻き込まれないため）。
    """
    return (f"{PING_MARK} {s['today']} -->\n\n"
            f"{HANDLE} あやとの手が要るものが **{len(s['ayato'])}本** "
            f"残っています。上の表を見てください。\n")


class Gh:
    """GitHub の issue を触る口。**ここだけが外に出る。**

    呼ぶ側（`run`）が使うのはこの5つだけ。偽物と差し替えられる。
    `donor_calls.Gh` から借りないのは、あちらの `create()` があちらの
    ラベルの色を書き込むため（借りると一覧で見分けが付かなくなる）。
    """

    def __init__(self, repo: str, token: str):
        self.repo = repo
        self.token = token

    def _call(self, method: str, path: str, payload=None):
        data = json.dumps(payload).encode("utf-8") if payload is not None else None
        req = urllib.request.Request(API + path, data=data, method=method)
        req.add_header("Accept", "application/vnd.github+json")
        req.add_header("X-GitHub-Api-Version", "2022-11-28")
        req.add_header("Authorization", f"Bearer {self.token}")
        if data is not None:
            req.add_header("Content-Type", "application/json")
        with urllib.request.urlopen(req, timeout=30) as r:
            raw = r.read()
        return json.loads(raw) if raw else {}

    def open_issues(self) -> list:
        """**開いている issue を全部**引く。枚をまたいでも落とさない。"""
        out = []
        for page in range(1, MAX_PAGES + 1):
            q = urllib.parse.urlencode(
                {"state": "open", "per_page": PER_PAGE, "page": page})
            got = self._call("GET", f"/repos/{self.repo}/issues?{q}")
            out += got
            if len(got) < PER_PAGE:
                break
        return out

    def labeled(self, label: str) -> list:
        """そのラベルの issue を、**閉じたものも含めて**引く。"""
        q = urllib.parse.urlencode(
            {"labels": label, "state": "all", "per_page": PER_PAGE})
        return self._call("GET", f"/repos/{self.repo}/issues?{q}")

    def comments(self, number: int) -> list:
        """いつ鳴らしたかを見るために、コメントを引く（新しい30件で足りる）。"""
        return self._call(
            "GET", f"/repos/{self.repo}/issues/{number}/comments?per_page=100")

    def last_said(self, number: int):
        """その issue で、**最後に誰かが何か言った時刻。**

        `updated_at` を使わないのは、あれが札を1枚付けただけでも今日に
        なるから（`survey()` の docstring）。無ければ None。
        """
        got = self.comments(number)
        at = [c.get("created_at") for c in got if c.get("created_at")]
        return max(at) if at else None

    def create(self, title: str, text: str, label: str) -> dict:
        try:
            self._call("POST", f"/repos/{self.repo}/labels",
                       {"name": label, "color": LABEL_COLOR,
                        "description": LABEL_DESC})
        except urllib.error.HTTPError as e:
            if e.code != 422:  # 422 は「もう在る」。それでよい
                raise
        return self._call("POST", f"/repos/{self.repo}/issues",
                          {"title": title, "body": text, "labels": [label]})

    def patch(self, number: int, payload: dict) -> dict:
        return self._call("PATCH", f"/repos/{self.repo}/issues/{number}", payload)

    def comment(self, number: int, text: str) -> dict:
        return self._call("POST", f"/repos/{self.repo}/issues/{number}/comments",
                          {"body": text})


def decide(issue, want: str) -> str:
    """**何をするか**を決める。GitHub を触らない素の関数。

    棚卸しは**いつも在ってよい**ので、閉じることはしない
    （`donor_calls` などは用事が終わると閉じるが、ここは開いている
    issue がある限り出し続ける）。0本の週は「ありません」と書いた
    本文になるだけ。

    Args:
        issue: `find_issue()` が選んだ1本か None
        want: いま入れたい本文

    Returns:
        "create" / "reopen" / "update" / "noop"
    """
    if issue is None:
        return "create"
    if issue.get("state") != "open":
        return "reopen"
    if (issue.get("body") or "").strip() != want.strip():
        return "update"
    return "noop"


def run(gh, today: str, apply: bool = False, breaks=()) -> dict:
    """読んで、まとめを合わせる。**読むのは毎回。書くのは `apply` のときだけ。**

    `apply` でなくても読みには行く。あやと待ちが0本の週が続いても、
    GitHub への道がその週に生きていたことがログに残る
    （`python/donor_calls.py` と同じ理由）。

    Args:
        gh: `Gh` か、同じ口を持つ偽物
        today: 今日（UTC の `YYYY-MM-DD`）
        apply: 本当に書くか
        breaks: 外す守り

    Returns:
        `{"action", "number", "body", "summary", "pinged"}`
    """
    issues = gh.open_issues()
    logger.info("開いている issue を %d本 読めました", len(issues))

    # **コメントの在る issue だけ、最後に言われた日を取りに行く。**
    # 25本なら数回で済む（`comments` が 0 のものは叩かない）
    said = {}
    for i in issues:
        if i.get("pull_request") or not i.get("comments"):
            continue
        at = gh.last_said(i["number"])
        if at:
            said[i["number"]] = at

    rows = survey(issues, today, breaks, said)
    s = summarize(rows, today, breaks)
    want = body(s)

    # 棚卸しそのものは閉じていることがあるので、ラベルで引き直す。
    # **番号で重複を落としてから渡す。** 開いていると両方から返ってきて、
    # `find_issue()` が「2本開いています」と毎週いわれのない警告を出す
    pool = {i.get("number"): i for i in issues}
    pool.update({i.get("number"): i for i in gh.labeled(LABEL)})
    mine = find_issue(list(pool.values()))
    what = decide(mine, want)

    if not apply:
        logger.info("--apply を付けていないので GitHub には書きません（%s）", what)
        return {"action": "dry", "planned": what,
                "number": mine["number"] if mine else None,
                "body": want, "summary": s, "pinged": False}

    if what == "create":
        made = gh.create(TITLE, want, LABEL)
        num = made.get("number")
        logger.info("棚卸しの issue #%s を開きました", num)
        # 開いた回は、**本文のメンションで飛ぶ。** コメントは足さない
        return {"action": what, "planned": what, "number": num,
                "body": want, "summary": s, "pinged": False}

    num = mine["number"]
    if what in ("reopen", "update"):
        payload = {"body": want}
        if what == "reopen":
            payload["state"] = "open"
        gh.patch(num, payload)
        logger.info("棚卸しの issue #%s を%sました", num,
                    "開き直し" if what == "reopen" else "書き換え")
    else:
        logger.info("先週から変わっていないので、本文は触りません（#%s）", num)

    # **鳴らすのはここだけ。** 本文を書き換えても通知は飛ばない
    pinged = False
    if s["ayato"]:
        last = last_ping_day(gh.comments(num))
        if ping_due(last, today):
            gh.comment(num, ping_body(s))
            logger.info("あやと待ち %d本 について、コメントで呼びました",
                        len(s["ayato"]))
            pinged = True
        else:
            logger.info("最後に呼んだのが %s なので、今回は黙ります", last)
    else:
        logger.info("あやと待ちは0本なので、呼びません")

    return {"action": what, "planned": what, "number": num,
            "body": want, "summary": s, "pinged": pinged}


def say(s: dict) -> None:
    """ログに、数えたものを出す。**分母から出す**（`docs/island-standards.md` §15）。"""
    logger.info("開いたまま %d本 ／ %s", s["total"],
                " ／ ".join(f"{w} {len(s['by_wait'][w])}本" for w in WAITS)
                + f" ／ 札が無い {len(s['unlabeled'])}本")
    logger.info("%d日以上、誰も何も言っていない %d本: %s", STALE_DAYS, len(s["stale"]),
                ", ".join(f"#{r['number']}" for r in s["stale"]) or "なし")


def act(today: str, apply: bool, out: str, breaks) -> int:
    """GitHub に当たって、**終了コードを返す。**

    届かなかったら 1。溜まっていることでは赤くしない。

    Args:
        today: 今日
        apply: 本当に書くか
        out: 本文を書き出す先（空なら書き出さない）
        breaks: 外す守り

    Returns:
        終了コード
    """
    repo = os.getenv("GITHUB_REPOSITORY", "")
    token = os.getenv("GITHUB_TOKEN") or os.getenv("GH_TOKEN") or ""
    if not repo or not token:
        logger.error("GITHUB_REPOSITORY と GITHUB_TOKEN が要ります")
        return 1

    try:
        got = run(Gh(repo, token), today, apply=apply, breaks=breaks)
    except urllib.error.HTTPError as e:
        # 返ってきた本文は出さない（URL や名前が混じる。ログは公開）
        logger.error("GitHub の issue を読み書きできませんでした（HTTP %s %s）"
                     "。資格・権限（issues: write）・リポジトリの指定を見てください",
                     e.code, e.reason)
        return 1
    except (urllib.error.URLError, OSError, ValueError) as e:
        logger.error("GitHub に届きませんでした: %s", str(e)[:200])
        return 1

    s = got["summary"]
    say(s)

    if out:
        with open(out, "w", encoding="utf-8") as f:
            f.write(got["body"])
        logger.info("書き上がった本文を %s に出しました", out)

    # **0本は「数えるものが無い」。** 引き方が壊れていても同じ顔で 0 を返すので、
    # ここは通さない（`docs/island-standards.md` §15）
    if s["total"] == 0:
        logger.error("開いている issue を1本も読めませんでした（数えるものが無い）")
        return 2
    return 0


def main() -> int:
    """エントリポイント。**溜まっていても赤くしない**（届かないときだけ赤い）。"""
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true",
                    help="まとめの issue を実際に開く／書き換える")
    ap.add_argument("--out", default="",
                    help="書き上がった本文を、このファイルにも出す")
    ap.add_argument("--today", default="",
                    help="今日（UTC の YYYY-MM-DD）。既定はいまの日付")
    ap.add_argument("--from-json", default="",
                    help="GitHub を読まずに、この JSON（issue の一覧）で回す")
    a = ap.parse_args()

    today = a.today or datetime.now(timezone.utc).date().isoformat()

    # `BREAK=` は対照のためだけに在る。**本番では空**
    breaks = {x for x in os.getenv("BREAK", "").split(",") if x}
    if breaks:
        logger.warning("守りを外して回しています（BREAK=%s）", ",".join(sorted(breaks)))

    if a.from_json:
        with open(a.from_json, encoding="utf-8") as f:
            issues = json.load(f)
        s = summarize(survey(issues, today, breaks), today, breaks)
        say(s)
        text = body(s)
        if a.out:
            with open(a.out, "w", encoding="utf-8") as f:
                f.write(text)
        else:
            print(text)
        if s["total"] == 0:
            return 2
        # **飛ぶ形で入っているかを、出す前に自分で見る。**
        # あやと待ちが在るのに飛ばない本文は、書けていないのと同じ
        if s["ayato"] and not mention_live(text):
            logger.error("あやと待ちが %d本 あるのに、飛ぶ形の %s が本文に無い",
                         len(s["ayato"]), HANDLE)
            return 1
        return 0

    return act(today, a.apply, a.out, breaks)


if __name__ == "__main__":
    sys.exit(main())
