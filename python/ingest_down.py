"""**毎晩の取り込みが落ちていること**を、GitHub issue 1本に映し続ける。

    python python/ingest_down.py            # いまどうなっているかを出すだけ
    python python/ingest_down.py --apply    # issue を開ける／書き換える／閉じる

## なぜ要るか

Doneru の取り込み（`fetch_doneru_donations.yml`）は cookie ひとつで動いていて、
**切れたら、あやとが入れ直すまで二度と通らない。**
2026-09-13 と 09-14 に3回続けて `session_expired` で落ちていたのに、
**見つかったのは偶然だった。**

毎晩の確認は取り込み本体（`schedule_fetch_chat`）の緑だけを見ていて、
Doneru のほうは手順から漏れていた。#294 に「毎晩の手順から漏れていたので
そこは直します」と書いてあるのに、その晩に見たのは**予定の声かけに
「2本とも見ろ」と書いてあったから**で、仕組みは何も変わっていなかった。

**手順書に足すだけでは、次の晩に忘れる。** 赤は Actions の一覧の中にしか
出ないし、**「起きたこと」であって「いま残っていること」ではない。**
次の晩に緑が1本積まれれば、前の晩の赤は画面の下へ流れていく。

だから直し方は「もっと目立つ赤」ではない。`python/donor_calls.py` と同じ形で、
**いまの状態そのものを、人が毎日見る場所（issue の一覧）に置き続ける。**
落ちているあいだは開いたまま、入り直したらこちらで閉じる。

## 見るのは「いまの状態」だけ

読むのは Firestore の `islandDoneruHealth/last` **1枚だけ。**
`python/doneru_health.py` が毎晩、BigQuery の `doneru_ingest_runs`
（取り込みを試した記録。1回＝1行）から写している札で、ここには

- `okDay` — Doneru のぶんが**最後に BigQuery へ入った日**（日本時間）
- `lastOutcome` — **いちばん新しい実行**の結果（`ok` / `session_expired` / `error`）

が入っている。ログでも、前回の結果でも、ワークフローの終了コードでもない。
前の晩の結果を持ち回ると、持ち回りが1回ずれただけで
「直ったのに開いたまま」「落ちているのに閉じたまま」になる。
**毎回いまの札を読み直して、そこへ合わせる。**

札そのものが無い晩は「落ちている」と言わない。**読めないことと、
止まっていることは別のもの**（`docs/island-standards.md` 10章）。
倒れる方向は黙る側へ。

## 「落ちている」の合図は2つあって、強さが違う

**混ぜない。** 混ぜると、待たなくていいものを待つことになる。

| 合図 | 直るか | どうするか |
| --- | --- | --- |
| `lastOutcome` が `session_expired` | **入り直すまで絶対に直らない** | **その晩に出す** |
| `okDay` が古い | 遅れや1晩の失敗でも古くなる | **2日**待ってから出す |

## 本文に書くのは「あやとがこれから何をすればいいか」だけ

何日入っていないか、いつまで入っているか、どこを直すか、手順書の場所。
**仕組みの説明を書かない**（`CLAUDE.md`「画面で、システムの仕様を説明しない」）。
どういう条件でこの issue が開いたかは中の話で、読む人には要らない。

**名前・どねID・チャンネルID・金額は1文字も書かない。** issue も公開。

## 既定は書かない。**でも、読みには毎回行く**

`--apply` を付けたときだけ GitHub に**書く**。付けなければ1バイトも書かない。

**読むほうは、`--apply` が無くても毎回1回通す。** 取り込みが通っている晩が
何か月も続けば、書く道は一度も通らない。そのあいだに資格が切れても、
権限が外れても、ラベルの引き方が間違っていても、
**はじめて本当に要る夜（cookie が切れた朝）まで気づけない。**
気づかないことを直すために作った道具が、自分の壊れ方に気づけないのでは
元も子もない（`python/donor_calls.py` と同じ理由。#399）。

## 赤くしない

**取り込みが落ちていても 0 で終わる。** 赤で知らせるのをやめるために
作ったものが、自分で赤を積んだら元に戻る。落ちていることは issue に出ている。

**ただし「届かない」は別の話で、そこは 1 で落ちる。**
札が読めない・GitHub に届かない・権限が無いは、**この仕組みそのものが
動いていない**ということなので、黙って 0 で終わると issue が古いまま
誰も気づかない。*落ちている*は赤くしない。*届かない*は赤くする。
"""

import argparse
import json
import logging
import os
import sys
import urllib.error
import urllib.request
from datetime import date, datetime, timezone

sys.path.insert(0, __file__.rsplit("/", 1)[0])

from config import BQ_PROJECT_ID  # noqa: E402
from doneru_supporters import jst_date  # noqa: E402

# **同じ1本の見つけ方は借りる。** ここが `donor_calls.py` と違っていると、
# 片方だけ直したときに黙って二重に issue が立つ。
# pull request を除くところも、開いているほうを先に取るところも同じでよい
from donor_calls import PLAN, find_issue  # noqa: E402

# **待ちの相手の札と、あやとの呼び方もここから借りる。**
# メンションの字を各所に散らすと、変わった日に半分だけ直る
from ticket_labels import (  # noqa: E402
    HANDLE, WAIT_AYATO, WAIT_STYLE, WAIT_US, ping_text, should_ping,
)

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)

# 札の置き場。`python/doneru_health.py` が書いているものをそのまま読む
COLLECTION = "islandDoneruHealth"
DOCUMENT = "last"

# 本文に埋める見えない印。GitHub は HTML コメントを描かないので、
# 読む人には見えないまま、こちらからは確実に引ける。
# **タイトルでは探さない**（人が読みやすく書き換える）
MARK = "<!-- ingest-down -->"

# 固定のラベル。印と両方で引く。片方だけだと、人がラベルを外した晩に
# もう1本増える／issue を全部なめることになる
LABEL = "ingest-down"

# タイトルは**作るときだけ**入れて、あとは触らない。
# 日数は本文が持つ（タイトルに入れると毎晩書き換わって、
# 書き換えた人と綱引きになる）
TITLE = "Doneru のぶんが、島に入っていません"

# ラベルの見た目。`donor-calls` と並ぶので、**別の色**にする。
# 一覧を眺めたときに「これは取り込みのほう」と色で分かるように
LABEL_COLOR = "b60205"
LABEL_DESC = "毎晩の取り込みが止まっている"

# 取り込みの結果として札に入りうる値（`python/fetch_doneru_donations.py`）。
# **ここに無い値はログに出さない。** 札は Firestore から来るもので、
# 中身が想定どおりだと決めつけて公開のログへ流すと、いつか何かが混ざる
OUTCOMES = ("ok", "session_expired", "error")

# **入り直すまで絶対に直らない**結果（`python/doneru_health.py` の docstring）。
# 待っても状況は良くならないので、**日数を待たずにその晩に出す。**
# 待つ意味があるのは「そのうち勝手に直るかもしれない」ときだけで、これは直らない。
# 9/13・9/14 に3回続けて落ちたのが、まさにこれだった
EXPIRED = "session_expired"

# 何日入っていなかったら issue を出すか。**島の画面（3日）より1日早い。**
#
# 島の `DONERU_STALE_DAYS`（`functions/src/islandApi.ts`）が3日なのは、
# **読む相手が視聴者さんだから。** ふだんの島に「止まっています」の1行が
# 余計に出ることのほうが、気づくのが1日遅れることより害が大きい。
#
# こちらの読む相手は**直せる人ひとり**で、出る場所も issue の一覧。
# 空振っても、次の晩に自分で閉じる。だから島より1日早くてよい。
#
# 1日では出さない理由は島と同じ。取り込みは 20:30 UTC の予定だが、
# **実測で1時間49分〜3時間32分遅れて走る**（`CLAUDE.md`）ので、
# 最後に入ってから28時間空いているのはふつうの姿。そして1晩だけの失敗は
# 実際にある（2026-09-06 の `error` は2回とも数分後の実行で入っている）。
#
# **2日＝2晩続けて入らなかった**なら、遅れでも1回の失敗でもない。
STALE_DAYS = 2

API = "https://api.github.com"


def read_note(db):
    """`islandDoneruHealth/last` を1枚読む。

    Args:
        db: Firestore クライアント（偽物でもよい）

    Returns:
        札の中身（辞書）。まだ1度も書かれていなければ None
    """
    snap = db.collection(COLLECTION).document(DOCUMENT).get()
    if not getattr(snap, "exists", False):
        return None
    return snap.to_dict() or {}


def days_since(ok_day, today: str):
    """最後に入った日から、今日まで何日か。どちらも日本時間の `YYYY-MM-DD`。

    未来の日付で None を返すのは、島の `doneruStaleDay()` と同じ決め。
    そこまで来たら札のほうが壊れているので、数えずに黙る。

    Args:
        ok_day: 札の `okDay`
        today: 今日（日本時間）

    Returns:
        日数。読めない・入っていない・未来なら None
    """
    if not isinstance(ok_day, str):
        return None
    try:
        n = (date.fromisoformat(today) - date.fromisoformat(ok_day)).days
    except (ValueError, TypeError):
        return None
    return None if n < 0 else n


def assess(note, today: str) -> dict:
    """**いま落ちているか**を決める。GitHub も Firestore も触らない素の関数。

    ここが全部。2つの合図を混ぜないのがこの関数の仕事:

    | 札 | 落ちているか |
    | --- | --- |
    | `lastOutcome` が `session_expired` | **落ちている**（日数を見ない） |
    | `okDay` が STALE_DAYS 日以上前 | **落ちている** |
    | それ以外 | 落ちていない |
    | 札が無い／`okDay` が読めない | **落ちていない**（黙る側へ倒す） |

    Args:
        note: `read_note()` が返した札か None
        today: 今日（日本時間の `YYYY-MM-DD`）

    Returns:
        {"down": bool, "why": "expired"/"stale"/None,
         "days": 日数か None, "okDay": 日付か None, "outcome": 結果か None}
    """
    note = note or {}
    ok_day = note.get("okDay") if isinstance(note.get("okDay"), str) else None
    days = days_since(ok_day, today)

    # **札から出すのは、見たことのある値だけ。** 想定外のものが入っていたら
    # 公開のログにも本文にも流さない（札は外から来るもの）
    outcome = note.get("lastOutcome")
    outcome = outcome if outcome in OUTCOMES else None

    if outcome == EXPIRED:
        return {"down": True, "why": "expired", "days": days,
                "okDay": ok_day, "outcome": outcome}
    if days is not None and days >= STALE_DAYS:
        return {"down": True, "why": "stale", "days": days,
                "okDay": ok_day, "outcome": outcome}
    return {"down": False, "why": None, "days": days,
            "okDay": ok_day, "outcome": outcome}


def body(a: dict) -> str:
    """issue の本文。**あやとがこれから何をすればいいかだけ。**

    どこを見て決めているか・何日で出す決まりかは書かない。中の話なので、
    読む人には要らない。**日付より細かいものは載せない**（時刻まで出すと、
    同じ晩に2回走ったときに本文が変わって、2回目も書き換えにいく）。

    Args:
        a: `assess()` の返り値

    Returns:
        本文。頭に見えない印が入る
    """
    # **日付が無い晩に「まで」と書かない。** 空欄や「不明」を差し込むより、
    # 行ごと言い換えるほうが読める（`docs/island-standards.md` 10章）
    ago = f"（{a['days']}日前）" if a["days"] else ""
    since = (f"いま入っているのは **{a['okDay']}** まで{ago}。" if a["okDay"]
             else "いつまで入っているかが分かりません。")

    if a["why"] == "expired":
        head = [
            "Doneru のぶんが、島に入らなくなっています。"
            "**セッションが切れているので、入れ直すまで戻りません。**",
            "",
            since,
            "",
            # **ここだけがメンションを入れる分岐。**
            # cookie を入れ直せるのはあやとだけで、待っても直らない。
            # 下の「何日も入っていない」ほうは、こちらが流し直せば入ることが
            # あるので入れない——毎晩鳴るものに毎晩メンションすると、
            # そのうち誰も読まなくなる
            f"{HANDLE} cookie を入れ直せるのはあやとだけなので、"
            "ここはお願いします。",
        ]
    else:
        n = a["days"]
        head = [
            f"Doneru のぶんが **{n}日** 島に入っていません。"
            if n else "Doneru のぶんが、島に入らなくなっています。",
            "",
            since,
            "",
            "まず `Fetch Doneru Donations` を workflow_dispatch で流し直して"
            "ください。それで入れば終わりです。入らなければ、"
            "セッションが切れています。",
        ]

    return "\n".join([MARK, ""] + head + [
        "",
        "1. https://doneru.jp にログインして、"
        "DevTools > Application > Cookies の `_dt` をコピーする",
        "2. Settings > Secrets and variables > Actions の "
        "`DONERU_COOKIE` を貼り替える",
        "3. `Fetch Doneru Donations` を workflow_dispatch で流し直す",
        "",
        "手順は `docs/island-db.md` の 6.4。",
    ]) + "\n"


def decide(issue, want: str, down: bool) -> str:
    """**何をするか**を決める。GitHub を触らない素の関数。

    | いま | issue | すること |
    | --- | --- | --- |
    | 落ちている | 無い | `create` — 1本開く |
    | 落ちている | 閉じている | `reopen` — **同じ1本**を開け直す |
    | 落ちている | 開いていて本文が違う | `update` — 本文だけ書き換える |
    | 落ちている | 開いていて本文が同じ | `noop` — **触らない** |
    | 通っている | 開いている | `close` — 自分で閉じる |
    | 通っている | 閉じている／無い | `noop` — **開け直さない** |

    本文が同じなら触らないのは、毎晩「編集しました」を積まないため。
    **1晩に2回走ることが実際にある**（取り込みと Doneru の両方に繋いである）。
    2回目は札も日数も同じなので、本文も同じになって何も書かない。

    Args:
        issue: `find_issue()` が選んだ1本か None
        want: いま入れたい本文
        down: いま落ちているか

    Returns:
        "create" / "reopen" / "update" / "close" / "noop"
    """
    if down:
        if issue is None:
            return "create"
        if issue.get("state") != "open":
            return "reopen"
        if (issue.get("body") or "").strip() != want.strip():
            return "update"
        return "noop"
    if issue is not None and issue.get("state") == "open":
        return "close"
    return "noop"


class Gh:
    """GitHub の issue を触る口。**ここだけが外に出る。**

    `donor_calls.Gh` と形は同じだが、**借りずに持つ。** あちらの `create()` は
    あちらのラベルの色と説明を書き込むので、借りるとこちらのラベルが
    「手を動かさないと進まない用事」の見た目で作られる。
    一覧で2つを見分けられなくなるのは、この仕組みの目的そのものに反する。

    偽物と差し替えられるように、呼ぶ側（`run`）はこの3つしか使わない。
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

    def list_issues(self, label: str) -> list:
        """そのラベルの issue を、**閉じたものも含めて**引く。

        閉じたものが要るのは、次に落ちたときに同じ1本を開け直すため。
        100件で足りる（このラベルが付くのは1本だけ）。
        """
        return self._call(
            "GET", f"/repos/{self.repo}/issues?labels={label}&state=all&per_page=100"
        )

    def create(self, title: str, text: str, label: str, wait: str = "") -> dict:
        # ラベルは issue に付けるときも作られるが、色も説明も付かない。
        # 一覧で見分けが付くように、先に作っておく（あれば 422 で、それでよい）
        #
        # **待ちの札も一緒に付ける。** 付いていないと毎週の棚卸し
        # （`python/ticket_stock.py`）から見えない。あれは題名の【】ではなく
        # 札しか読まない。どちらの札かは、落ち方で変わる
        # （セッション切れ＝あやと待ち／何日も入っていない＝こちら）
        names = [label] + ([wait] if wait else [])
        styles = {label: (LABEL_COLOR, LABEL_DESC)}
        styles.update({k: v for k, v in WAIT_STYLE.items()})
        for name in names:
            color, desc = styles[name]
            try:
                self._call("POST", f"/repos/{self.repo}/labels",
                           {"name": name, "color": color, "description": desc})
            except urllib.error.HTTPError as e:
                if e.code != 422:
                    raise
        return self._call("POST", f"/repos/{self.repo}/issues",
                          {"title": title, "body": text, "labels": names})

    def patch(self, number: int, payload: dict) -> dict:
        return self._call("PATCH", f"/repos/{self.repo}/issues/{number}", payload)

    def comment(self, number: int, text: str) -> dict:
        """コメントを1本足す。**通知が飛ぶのはここだけ。**

        本文を書き換えても、開き直しただけでも、GitHub は誰にも知らせない。
        """
        return self._call("POST", f"/repos/{self.repo}/issues/{number}/comments",
                          {"body": text})


def run(gh, a: dict, apply: bool = False) -> dict:
    """見た札に、issue を合わせる。

    **読むのは毎回。書くのは `apply` のときだけ。**
    `apply` でなくても `list_issues` は1回通す。ここを通しておかないと、
    取り込みが通っている晩のあいだ GitHub への道が一度も試されず、
    **本当に要る朝に落ちる**（docstring の「既定は書かない」）。

    読めなかったときは**投げ返す。** ここで握りつぶすと、届かないことが
    「何もしなくてよかった」と見分けが付かなくなる。赤くするのは呼ぶ側。

    Args:
        gh: `Gh` か、同じ3つを持つ偽物
        a: `assess()` の返り値
        apply: 本当に書くか

    Returns:
        {"action": ..., "planned": ..., "number": issue 番号か None}
        `action` は実際にしたこと（書かなかったときは `"dry"`）
    """
    # **ここは `apply` の有無にかかわらず通る。** 毎晩のログに
    # 「読めた」が1行残ることが、この仕組みが生きている唯一の証拠
    issues = gh.list_issues(LABEL)
    logger.info("GitHub の issue を読めました（ラベル %s で %d件）",
                LABEL, len(issues))

    issue = find_issue(issues, MARK)
    if issue is None:
        logger.info("この仕組みの issue はまだ1本もありません")
    else:
        logger.info("この仕組みの issue は #%s（いま%s）", issue["number"],
                    "開いています" if issue.get("state") == "open"
                    else "閉じています")

    want = body(a)
    what = decide(issue, want, a["down"])

    if not apply:
        logger.info("--apply を付けていないので GitHub には書きません")
        logger.info("付けると: %s", PLAN[what])
        return {"action": "dry", "planned": what,
                "number": issue["number"] if issue else None}

    # **メンションを入れるのは「セッション切れ」のときだけ。**
    # 何日も入っていないほうは、こちらが流し直せば入ることがある
    needs_ayato = a["why"] == "expired"

    if what == "create":
        made = gh.create(TITLE, want, LABEL,
                         WAIT_AYATO if needs_ayato else WAIT_US)
        logger.info("issue #%s を開きました", made.get("number"))
        return {"action": what, "planned": what, "number": made.get("number")}

    if what in ("reopen", "update"):
        # **タイトルは送らない。** 人が書き換えたものを毎晩戻さない
        payload = {"body": want}
        if what == "reopen":
            payload["state"] = "open"
        gh.patch(issue["number"], payload)
        logger.info("issue #%s を%sました", issue["number"],
                    "開き直し" if what == "reopen" else "書き換え")
        # **毎晩は鳴らさない。** 鳴るのは開き直したときと、
        # 「何日も入っていない」から「セッション切れ」に変わったとき
        if should_ping(what, issue.get("body") or "", needs_ayato):
            gh.comment(issue["number"],
                       ping_text("Doneru の cookie が切れています"))
            logger.info("issue #%s であやとを呼びました", issue["number"])
        return {"action": what, "planned": what, "number": issue["number"]}

    if what == "close":
        gh.patch(issue["number"], {"state": "closed",
                                   "state_reason": "completed"})
        logger.info("また入るようになったので issue #%s を閉じました",
                    issue["number"])
        return {"action": what, "planned": what, "number": issue["number"]}

    logger.info("変わっていないので触りません")
    return {"action": "noop", "planned": "noop",
            "number": issue["number"] if issue else None}


def act(a: dict, apply: bool) -> int:
    """GitHub に当たって、**終了コードを返す。**

    `--apply` の有無で分かれるのは「書くか」だけ。**資格を確かめて読みに行く
    ところは両方通る**ので、資格が要るのも両方。

    届かなかったら 1。ここは「取り込みが落ちているかどうか」とは別の話で、
    読めない＝**この仕組みが動いていない**ということ。黙って 0 で終わると、
    issue がいまの状態と食い違ったまま誰も気づかない。

    Args:
        a: `assess()` の返り値
        apply: 本当に書くか

    Returns:
        終了コード（0 か 1）
    """
    repo = os.getenv("GITHUB_REPOSITORY", "")
    token = os.getenv("GITHUB_TOKEN") or os.getenv("GH_TOKEN") or ""
    if not repo or not token:
        logger.error("GITHUB_REPOSITORY と GITHUB_TOKEN が要ります")
        return 1

    try:
        run(Gh(repo, token), a, apply=apply)
    except urllib.error.HTTPError as e:
        # 401/403 は資格か権限、404 はリポジトリの指定。**どれも本物の異常。**
        # 返ってきた本文は出さない（URL や名前が混じる。ログは公開）
        logger.error("GitHub の issue を読み書きできませんでした（HTTP %s %s）"
                     "。資格・権限（issues）・リポジトリの指定を見てください",
                     e.code, e.reason)
        return 1
    except (urllib.error.URLError, OSError, ValueError) as e:
        logger.error("GitHub に届きませんでした: %s", str(e)[:200])
        return 1
    return 0


def main() -> int:
    """エントリポイント。**落ちていても赤くしない**（届かないときだけ赤い）。"""
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true",
                    help="issue を実際に開く／書き換える／閉じる")
    a = ap.parse_args()

    # **引数を読んでから取り込む。** import を先に置くと、
    # `--help` まで google-cloud-firestore の入っている箱でしか出せない
    from google.cloud import firestore

    today = jst_date(datetime.now(timezone.utc).isoformat())
    try:
        note = read_note(firestore.Client(project=BQ_PROJECT_ID))
    except Exception as e:  # noqa: BLE001  何で落ちても、値そのものは出さない
        # 札が読めない＝この仕組みが動いていない。**赤くする。**
        logger.error("取り込みの札が読めませんでした: %s", type(e).__name__)
        return 1

    if note is None:
        # まだ1度も書かれていない。**落ちているとは言わない**（黙る側へ倒す）
        logger.warning("取り込みの札（%s/%s）がまだありません。"
                       "落ちているとは見なしません", COLLECTION, DOCUMENT)

    a2 = assess(note, today)
    logger.info("最後に入ったのは %s（%s）／ 最後の実行は %s ／ 今日は %s",
                a2["okDay"] or "分かりません",
                f"{a2['days']}日前" if a2["days"] is not None else "日数不明",
                a2["outcome"] or "分かりません", today)
    logger.info("いま取り込みは%s（%s）",
                "落ちています" if a2["down"] else "通っています",
                {"expired": "セッション切れ", "stale": f"{STALE_DAYS}日以上入っていない"}
                .get(a2["why"], "-"))

    # **`--apply` で分かれるのは「書くか」だけ。** 読みには毎回行く
    return act(a2, a.apply)


if __name__ == "__main__":
    sys.exit(main())
