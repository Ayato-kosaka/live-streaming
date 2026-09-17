"""**いま手を動かす必要がある用事**を、GitHub issue 1本に映し続ける。

    python python/donor_calls.py            # 何人待っているかを出すだけ
    python python/donor_calls.py --apply    # issue を開ける／書き換える／閉じる

## なぜ要るか

投げ銭してくれたのに どねID が YouTube と紐付いていない人がいると、
`python/doneru_supporters.py` は終了コード 1 で落ちる。毎晩の取り込みが
それで赤くなる。**その赤が、実際に3回見逃された。**

赤は Actions の一覧の中にしか出ない。見に行かないと分からないし、
**「起きたこと」であって「いま残っていること」ではない。**
次の晩に緑が1本積まれれば、前の晩の赤は画面の下へ流れていく。
`docs/island-misses.md` にも「2晩続けて赤い夜の取り込みの呼び出しに、
誰も答えていない」が残っている。

だから直し方は「もっと目立つ赤」ではない。**いまの状態そのものを、
人が毎日見る場所（issue の一覧）に置き続ける。** 用事が残っているあいだは
開いたまま、終わったらこちらで閉じる。

## 見るのは「いまの状態」だけ

数えるのは **Firestore の `islandDonors`**（`state: "new"` の書類）。
ログでも、前回の結果でも、取り込みの終了コードでもない。
前の晩の結果を持ち回ると、持ち回りが1回ずれただけで
「終わった用事が開いたまま」「残っている用事が閉じたまま」になる。
**毎回いまの状態を数え直して、そこへ合わせる。**

`state` の値は `python/doneru_supporters.py` と `python/admin/donors_import.py`
が書いている:

| 値 | 意味 | ここで数えるか |
| --- | --- | --- |
| `new` | **表に無い どねID が投げ銭してきた。** あやとが紐付けるまで進まない | **数える** |
| `unlinked` | 表にはあるが YouTube のアカウントが分からない | 数えない |
| `linked` | 紐付いている | 数えない |

`unlinked` を入れないのは、あれが**あやたがもう知っている**もので、
手を動かして直せるとは限らないから（あちらの docstring にも
「直しようのないもので毎日赤くなる」と書いてある）。
直せない用事を毎日並べると、並んでいること自体が読み飛ばされる。

**ただし、ログには `state` ごとの件数を全部出す**（`state_counts()`）。
issue に出すかどうかと、**何人いるのかを見られるかどうかは別の話。**
2026-09-17 の晩は「対応表 30件 / 紐付け待ち 0人」しかログに無く、
同じ晩の台帳が「紐付いていないぶん 1件」と言っていたのに、
**その1件がどこにも出ていなかった。** 出すのは件数だけで、
issue を開く条件は1バイトも変えていない。

**開いているあいだの本文にも、`unlinked` の人数を1行出す**
（`survey()` が数え、`body()` が書く）。数に入れないのは上のとおりだが、
**何人いるのかを黙っているのは別の話。** ログは見に行かないと出てこない。
紐付け作業をしているその場で目に入らなければ、あの人たちがいること自体が
誰にも見えない。ここも**開く条件は1バイトも変えていない。**

## 同じ1本を、どうやって見つけるか

**タイトルでは探さない。** タイトルは人が変える（読みやすくしたり、
絵文字を足したり）。変えられた瞬間に見失って、翌晩もう1本増える。

引くのは**固定のラベル**（`donor-calls`）と、本文に埋めた**見えない印**
（`<!-- donor-calls -->`）の両方。ラベルだけだと人が外したときに増えるし、
印だけだと issue を全部なめることになる。

## 本文に書くのは「あやとがこれから何をすればいいか」だけ

人数と、どこの画面から直すか、いつから待っているか。それだけ。
**仕組みの説明を書かない**（`CLAUDE.md`「画面で、システムの仕様を説明しない」）。
どういう条件でこの issue が開いたかは中の話で、読む人には要らない。

**名前・どねID・チャンネルIDは1文字も書かない。** issue も公開。
誰なのかは `/me` の画面に出ているので、ここには要らない
（考え方は `python/logsafe.py` の docstring にそのまま書いてある）。

## 既定は書かない。**でも、読みには毎回行く**

`--apply` を付けたときだけ GitHub に**書く**。付けなければ1バイトも書かない
（何人待っていて、どうするつもりかを出すだけ）。
毎晩ひとりでに走るものなので、押し間違いで issue が開いたり閉じたりするのを
手元から確かめられるようにしておく。

**読むほうは、`--apply` が無くても毎回1回通す。**
待ちが0人の晩が続くと、書く道は何か月も一度も通らない。そのあいだに
資格が切れても、権限が外れても、ラベルの引き方が間違っていても、
**はじめて本当に要る夜（誰かが投げ銭してくれた深夜）まで気づけない。**
気づかないことを直すために作った道具が、自分の壊れ方に気づけないのでは
元も子もない。

毎回 `list_issues` を1回叩けば、**資格・権限・リポジトリの指定・ラベルでの
引き方がその晩に生きていたこと**がログに残る。待ちが0人でも残る。
GET 1回は API 制限（5,000/時）から見て無いに等しい。

`python/*.py` は `--dry-run`（既定で書く）の流儀が多いが、ここは
**`python/admin/` 側の `apply`（既定で書かない）に合わせる。**
あちらと同じで、これは毎晩の取り込みそのものではなく、**外を触る片づけ**
だから（`python/admin/ip_purge.py` と同じ形）。

## 赤くしない

**用事が何人残っていても 0 で終わる。**
**赤で知らせるのをやめるために作ったもの**が、自分で赤を積んだら元に戻る。
残っている用事は issue のほうに出ている。

**ただし「届かない」は別の話で、そこは 1 で落ちる。**
401 / 403 / 404 / つながらない、は**この仕組みそのものが動いていない**
ということなので、黙って 0 で終わると issue が古いまま誰も気づかない。
*用事*は赤くしない。*届かない*は赤くする。
"""

import argparse
import json
import logging
import os
import sys
import urllib.error
import urllib.request

sys.path.insert(0, __file__.rsplit("/", 1)[0])

from config import BQ_PROJECT_ID  # noqa: E402
from doneru_supporters import jst_date  # noqa: E402
from logsafe import mask  # noqa: E402

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)

# 本文に埋める見えない印。GitHub は HTML コメントを描かないので、
# 読む人には見えないまま、こちらからは確実に引ける。
# **タイトルでは探さない**（人が変えるため）
MARK = "<!-- donor-calls -->"

# 固定のラベル。印と両方で引く。片方だけだと、人がラベルを外した晩に
# もう1本増える／issue を全部なめることになる
LABEL = "donor-calls"

# タイトルは**作るときだけ**入れて、あとは触らない。
# 人が読みやすく書き換えたものを毎晩戻すと、書き換えた人と綱引きになる。
# 人数は本文が持つので、タイトルに数を入れない（入れると毎晩書き換わる）
TITLE = "投げ銭を、YouTube につなぐ"

# ラベルの見た目。無ければ作る（GitHub は issue に付けるときも作ってくれるが、
# 色と説明はそのとき付かないので、こちらで一度作っておく）
LABEL_COLOR = "d93f0b"
LABEL_DESC = "手を動かさないと進まない用事"

API = "https://api.github.com"

# `decide()` の返り値を、そのまま人の言葉にする。
# 見るだけで走らせた晩に「これから何をするつもりか」をログへ出すため
PLAN = {
    "create": "issue を1本 開きます",
    "reopen": "閉じている issue を開け直します",
    "update": "開いている issue の本文を書き換えます",
    "close": "開いている issue を閉じます",
    "noop": "何もしません",
}


def load_table(db) -> dict:
    """`islandDonors` をまるごと読む。

    Args:
        db: Firestore クライアント（偽物でもよい）

    Returns:
        どねID -> 書類
    """
    return {d.id: (d.to_dict() or {}) for d in db.collection("islandDonors").stream()}


def count_waiting(table: dict) -> dict:
    """**いま手を動かす必要がある用事**を数える。

    返すのは**人数と日付だけ。** 誰なのかは持ち回らない。
    持ち回ると、本文やログに出す枝がいつか生える。
    **そもそも手元に無ければ、出しようがない。**

    「いつから」は、その人が**最初に投げ銭してくれた日**（`firstSeenAt`）。
    無ければ、こちらが見つけた日（`updatedAt`）で代わりにする。
    どちらも `islandDonors` に ISO の文字列で入っている。

    Args:
        table: いまの `islandDonors`（どねID -> 書類）

    Returns:
        {"n": 人数, "since": いちばん古い人の日付（YYYY-MM-DD）か None}
    """
    n = 0
    since = None
    for pk, doc in (table or {}).items():
        if (doc or {}).get("state") != "new":
            continue
        n += 1
        at = doc.get("firstSeenAt") or doc.get("updatedAt")
        if not at:
            continue
        try:
            day = jst_date(str(at))
        except (ValueError, TypeError):
            # 日付が読めなくても人数は数える。**用事は残っているから。**
            # どの書類かは公開の場では指紋になる（`python/logsafe.py`）
            logger.warning("待っている人の日付が読めません: %s", mask(pk))
            continue
        if since is None or day < since:
            since = day
    return {"n": n, "since": since}


# `islandDonors.state` に入りうる値。**表に載っていない値は「その他」に
# まとめて数える。** 値そのものをログへ流さないため（このリポジトリは公開）。
# 書いているのは `python/doneru_supporters.py` と
# `python/admin/donors_import.py` の2本（上の表と同じ並び）。
STATES = ("new", "unlinked", "linked")


def state_counts(table: dict) -> dict:
    """`islandDonors` を `state` ごとに**数えるだけ。**

    **issue の中身も、開く条件も、ここは1バイトも動かさない**
    （数えているのは `count_waiting()` のほうで、あちらは触っていない）。
    足したのは**ログに出す内訳だけ。**

    なぜ要るか: 2026-09-17 の晩、ログには「対応表 30件 / 紐付け待ち 0人」
    しか出ていなかった。同じ晩の台帳は「Doneru で紐付いていないぶん 1件」と
    言っていたのに、**その1件がログのどこにも出ない。**
    `unlinked` が何人いるのかを、誰も見られる場所で言っていなかった。

    **出すのは件数だけ。** どねID も名前もチャンネルIDも持ち回らない
    （`count_waiting()` と同じ考え方。手元に無ければ出しようがない）。
    見たことのない `state` は値を出さずに「その他」へ入れる。

    Args:
        table: いまの `islandDonors`（どねID -> 書類）

    Returns:
        {"new": n, "unlinked": n, "linked": n, "other": n, "none": n}。
        **どの鍵も必ず在る**（0でも出す。「0人」と「数えていない」を
        同じ顔にしない）
    """
    out = {k: 0 for k in STATES}
    out["other"] = 0
    out["none"] = 0
    for _pk, doc in (table or {}).items():
        st = (doc or {}).get("state")
        if st is None or st == "":
            out["none"] += 1
        elif st in out:
            out[st] += 1
        else:
            out["other"] += 1
    return out


def survey(table: dict) -> dict:
    """`count_waiting()` に、**本文へ1行出すためだけの件数**を1つ足す。

    足すのは `unlinked`（表にはあるが YouTube が分からない人）の人数。
    **`count_waiting()` は触っていないし、`decide()` はここを見ない**ので、
    issue を開く／閉じる条件は1バイトも動いていない。

    数に混ぜないのは、あの人たちが**あやとが相手の YouTube を知らないかぎり
    減らない**から。混ぜると、永久に閉じない issue が1本増える
    （`CLAUDE.md`「issue を開けっぱなしにしない」）。
    それでも人数を出すのは、**いままでどこにも出ていなかった**から。
    2026-09-17 の本番は new 1 / unlinked 6 / linked 24 で、あの6人は
    このままだとカードが渡らないのに、誰も見られる場所に出ていなかった。

    Args:
        table: いまの `islandDonors`（どねID -> 書類）

    Returns:
        `count_waiting()` の返り値に `"unlinked"`（人数）を足したもの
    """
    w = count_waiting(table)
    w["unlinked"] = state_counts(table)["unlinked"]
    return w


def body(n: int, since, unlinked: int = 0) -> str:
    """issue の本文。**あやとがこれから何をすればいいかだけ。**

    仕組みの説明（どこを見て数えているか・どの条件で開くか）は書かない。
    中の話なので、読む人には要らない。

    Args:
        n: 待っている人数
        since: いちばん古い人の日付（YYYY-MM-DD）か None
        unlinked: YouTube のアカウントが分からない人数（0 なら書かない）

    Returns:
        本文。頭に見えない印が入る
    """
    lines = [
        MARK,
        "",
        f"投げ銭してくれた **{n}人** が、まだ YouTube につながっていません。"
        "このままだとカードが渡りません。",
        "",
        "`/me` の「投げ銭を、YouTube につなぐ」から紐付けてください。",
    ]
    if since:
        lines += ["", f"いちばん古い人は **{since}** から待っています。"]
    if unlinked:
        # **0人のときは書かない。** 「0人います」は読む人に何も渡さない
        lines += ["", f"ほかに **{unlinked}人** は、YouTube のアカウントが"
                      "分からないままです。この人たちにもカードが渡りません。"]
    return "\n".join(lines) + "\n"


def find_issue(issues: list, mark: str = MARK):
    """引いてきた issue の中から、**同じ1本**を選ぶ。

    **タイトルは見ない。** 見えない印が本文に入っているかだけで決める。

    開いているものを先に選ぶ。無ければ閉じたもののうち**いちばん新しい**
    （番号が大きい）ものを返す。閉じたものを返すのは、次にまた待ちが出たときに
    **同じ1本を開け直す**ため。毎回新しく立てると、同じ用事の抜け殻が溜まる。

    Args:
        issues: GitHub から返ってきた issue の一覧
        mark: 探す見えない印

    Returns:
        選んだ1本（辞書）か None
    """
    hit = [
        i for i in issues
        # `/issues` は pull request も返す。混ぜると PR を書き換えにいく
        if not i.get("pull_request") and mark in (i.get("body") or "")
    ]
    opened = sorted((i for i in hit if i.get("state") == "open"),
                    key=lambda i: i["number"])
    if opened:
        if len(opened) > 1:
            # 人が手で立てたぶんが混ざっている。**こちらは増やさない**ので、
            # いちばん古い1本だけ使う。残りは人が閉じる
            logger.warning("同じ印の issue が %d本 開いています。"
                           "いちばん古い #%d だけ使います",
                           len(opened), opened[0]["number"])
        return opened[0]
    closed = sorted((i for i in hit if i.get("state") != "open"),
                    key=lambda i: i["number"])
    return closed[-1] if closed else None


def decide(issue, want: str, n: int) -> str:
    """**何をするか**を決める。GitHub を触らない素の関数。

    ここが全部。振る舞いの決めは、この表のとおり:

    | いま | issue | すること |
    | --- | --- | --- |
    | 待ちがいる | 無い | `create` — 1本開く |
    | 待ちがいる | 閉じている | `reopen` — **同じ1本**を開け直す |
    | 待ちがいる | 開いていて本文が違う | `update` — 本文だけ書き換える |
    | 待ちがいる | 開いていて本文が同じ | `noop` — **触らない** |
    | 待ちが0 | 開いている | `close` — 自分で閉じる |
    | 待ちが0 | 閉じている／無い | `noop` — **開け直さない** |

    本文が同じなら触らないのは、毎晩「編集しました」を積まないため。
    人数も日付も変わらない晩は、通知が出るほうがおかしい。

    Args:
        issue: `find_issue()` が選んだ1本か None
        want: いま入れたい本文
        n: 待っている人数

    Returns:
        "create" / "reopen" / "update" / "close" / "noop"
    """
    if n > 0:
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

        閉じたものが要るのは、次に待ちが出たときに同じ1本を開け直すため。
        100件で足りる（このラベルが付くのは1本だけ）。
        """
        return self._call(
            "GET", f"/repos/{self.repo}/issues?labels={label}&state=all&per_page=100"
        )

    def create(self, title: str, text: str, label: str) -> dict:
        # ラベルは issue に付けるときも作られるが、色も説明も付かない。
        # 一覧で見分けが付くように、先に作っておく（あれば 422 で、それでよい）
        try:
            self._call("POST", f"/repos/{self.repo}/labels",
                       {"name": label, "color": LABEL_COLOR,
                        "description": LABEL_DESC})
        except urllib.error.HTTPError as e:
            if e.code != 422:
                raise
        return self._call("POST", f"/repos/{self.repo}/issues",
                          {"title": title, "body": text, "labels": [label]})

    def patch(self, number: int, payload: dict) -> dict:
        return self._call("PATCH", f"/repos/{self.repo}/issues/{number}", payload)


def run(gh, w: dict, apply: bool = False) -> dict:
    """数えた結果に、issue を合わせる。

    **読むのは毎回。書くのは `apply` のときだけ。**
    `apply` でなくても `list_issues` は1回通す。ここを通しておかないと、
    待ちが0人の晩が続くあいだ GitHub への道が一度も試されず、
    **本当に要る夜に落ちる**（docstring の「既定は書かない」）。

    読めなかったときは**投げ返す。** ここで握りつぶすと、届かないことが
    「何もしなくてよかった」と見分けが付かなくなる。赤くするのは呼ぶ側。

    Args:
        gh: `Gh` か、同じ3つを持つ偽物
        w: `count_waiting()` の返り値
        apply: 本当に書くか

    Returns:
        {"action": ..., "planned": ..., "number": issue 番号か None}
        `action` は実際にしたこと（書かなかったときは `"dry"`）、
        `planned` は `decide()` が決めたこと
    """
    n = w["n"]

    # **ここは `apply` の有無にかかわらず通る。** 毎晩のログに
    # 「読めた」が1行残ることが、この仕組みが生きている唯一の証拠
    issues = gh.list_issues(LABEL)
    logger.info("GitHub の issue を読めました（ラベル %s で %d件）",
                LABEL, len(issues))

    issue = find_issue(issues)
    if issue is None:
        logger.info("この仕組みの issue はまだ1本もありません")
    else:
        logger.info("この仕組みの issue は #%s（いま%s）", issue["number"],
                    "開いています" if issue.get("state") == "open"
                    else "閉じています")

    want = body(n, w["since"], w.get("unlinked", 0))
    what = decide(issue, want, n)

    if not apply:
        logger.info("--apply を付けていないので GitHub には書きません")
        logger.info("付けると: %s（紐付け待ち %d人）", PLAN[what], n)
        return {"action": "dry", "planned": what,
                "number": issue["number"] if issue else None}

    if what == "create":
        made = gh.create(TITLE, want, LABEL)
        logger.info("issue #%s を開きました（紐付け待ち %d人）",
                    made.get("number"), n)
        return {"action": what, "planned": what, "number": made.get("number")}

    if what in ("reopen", "update"):
        # **タイトルは送らない。** 人が書き換えたものを毎晩戻さない
        payload = {"body": want}
        if what == "reopen":
            payload["state"] = "open"
        gh.patch(issue["number"], payload)
        logger.info("issue #%s を%sました（紐付け待ち %d人）", issue["number"],
                    "開き直し" if what == "reopen" else "書き換え", n)
        return {"action": what, "planned": what, "number": issue["number"]}

    if what == "close":
        gh.patch(issue["number"], {"state": "closed",
                                   "state_reason": "completed"})
        logger.info("紐付け待ちが無くなったので issue #%s を閉じました",
                    issue["number"])
        return {"action": what, "planned": what, "number": issue["number"]}

    logger.info("変わっていないので触りません（紐付け待ち %d人）", n)
    return {"action": "noop", "planned": "noop",
            "number": issue["number"] if issue else None}


def act(w: dict, apply: bool) -> int:
    """GitHub に当たって、**終了コードを返す。**

    `--apply` の有無で分かれるのは「書くか」だけ。**資格を確かめて読みに行く
    ところは両方通る**ので、資格が要るのも両方。

    届かなかったら 1。ここは「用事が残っているかどうか」とは別の話で、
    読めない＝**この仕組みが動いていない**ということ。黙って 0 で終わると、
    issue がいまの状態と食い違ったまま誰も気づかない。

    Args:
        w: `count_waiting()` の返り値
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
        run(Gh(repo, token), w, apply=apply)
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
    """エントリポイント。**用事が残っていても赤くしない**（届かないときだけ赤い）。"""
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true",
                    help="issue を実際に開く／書き換える／閉じる")
    a = ap.parse_args()

    # **引数を読んでから取り込む。** import を先に置くと、
    # `--help` まで google-cloud-firestore の入っている箱でしか出せない
    from google.cloud import firestore

    db = firestore.Client(project=BQ_PROJECT_ID)
    table = load_table(db)
    w = survey(table)
    logger.info("対応表 %d件 / 紐付け待ち %d人", len(table), w["n"])
    # **内訳は件数だけ。** issue に出すかどうかはここでは決めない
    # （`count_waiting()` が数える条件も、`decide()` が開く条件も変えていない）
    c = state_counts(table)
    logger.info(
        "  state の内訳: new %d / unlinked %d / linked %d / その他 %d / 空 %d",
        c["new"], c["unlinked"], c["linked"], c["other"], c["none"],
    )
    if w["since"]:
        logger.info("いちばん古い人は %s から待っています", w["since"])

    # **`--apply` で分かれるのは「書くか」だけ。** 読みには毎回行く
    return act(w, a.apply)


if __name__ == "__main__":
    sys.exit(main())
