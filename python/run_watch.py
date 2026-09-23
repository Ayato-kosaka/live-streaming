"""**Actions の run を読んで、issue 1本に映す**係が、みんなで使う土台。

`python/bake_down.py`（毎晩の焼き直しが止まっている）と
`python/ship_down.py`（本番への配りが赤い）が、ここを共有している。

## なぜ分けたか

この2つは**見る相手が違うだけ**で、作法はまったく同じ:

- 無人で走った、いちばん新しい完了した run を1本だけ見る
- そのあと人が手で押して通っていたら、その回は判断を保留する
- 止まっていれば issue を**1本だけ**開き、直ったら**自分で閉じる**
- **立て直さない。**同じ1本を、見えない印で引いて書き換える
- 分からない朝は**開きも閉じもしない**
- 止まっていても赤くしない。**届かないときだけ赤くする**

写経で2本目を書くと、**片方だけ直した日に黙って食い違う。**
「分からない朝に閉じない」のような、**間違えると仕組みそのものが無意味になる
決まり**が2か所にあるのがいちばん危ない。だから決まりはここ1か所に置いて、
**何を見るか（どのワークフロー・どの step・どういう本文か）だけ**を各係が持つ。

## ここに置くもの / 置かないもの

| ここ（共通の作法） | 各係（見る相手ごと） |
| --- | --- |
| どの run を見るか（`pick_run`） | 何が「無人」か（`is_unattended`） |
| 手押しで直っていないか（`fixed_by_hand`） | どのワークフローか（ファイル名） |
| 何をするか（`decide`） | どの step が何を意味するか |
| GitHub を叩く口（`Gh`） | issue の題・本文・ラベル |
| 終了コードの決め（`act`） | |

**「無人」の決め方まで共通にしない。** 焼き直しは `schedule` と `workflow_run` で
無人だが、**配りは違う。** あちらを起こすのは焼き直しの最後の
`gh workflow run` なので、**毎晩の配りも `workflow_dispatch` で走る。**
event で見ると、毎晩の配りが全部「手押し」に見えて**一生 issue が立たない。**
だから `pick_run` は判定そのものを持たず、**受け取る。**
"""

import json
import logging
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone

sys.path.insert(0, __file__.rsplit("/", 1)[0])

# **同じ1本の見つけ方は借りる。** ここが `donor_calls.py` と違っていると、
# 片方だけ直したときに黙って二重に issue が立つ。
#
# ただし `donor_calls` は `config.py` ごしに `BQ_PROJECT_ID` を要求する。
# **この土台に乗る係は BigQuery も Firestore も1行も触らない**（読むのは
# GitHub だけ）ので、その値は要らない。止まっていることを知らせる係が、
# **関係のない設定が1つ欠けただけで動かない**形にしたくないので、借りるための
# 置き場だけ埋める。本物が環境にあればそちらがそのまま使われる（`setdefault`）。
os.environ.setdefault("BQ_PROJECT_ID", "run-watch-reads-no-bigquery")

from donor_calls import PLAN, find_issue  # noqa: E402,F401  （各係が再輸出する）

logger = logging.getLogger(__name__)

# **止まっていると言ってよい終わりかた。**
# `startup_failure` を入れてあるのは、あれが「ワークフロー自体が起動できなかった」
# ＝**1つも動いていない**から。run は残るが step は1つも走っていない
RED = ("failure", "timed_out", "startup_failure")

# **通ったと言ってよい終わりかた。** ここに無いもの（`cancelled` など）は
# どちらとも言わない
GREEN = ("success",)

# 何本さかのぼって無人の run を探すか。手で何度も押した日でも足りる数
PER_PAGE = 50

API = "https://api.github.com"


def pick_run(runs: list, is_unattended):
    """**無人で走った、いちばん新しい完了した run** を1本選ぶ。

    GitHub は新しい順に返してくるが、**並びを当てにしない。** `id` は同じ
    ワークフローの中では増える一方なので、そこで並べ直す。

    Args:
        runs: `/actions/workflows/…/runs` の `workflow_runs`
        is_unattended: run を1本受け取って「押した人がいないか」を返す関数

    Returns:
        run（辞書）か、1本も無ければ None
    """
    mine = [r for r in (runs or [])
            if r.get("status") == "completed" and is_unattended(r)]
    if not mine:
        return None
    return sorted(mine, key=lambda r: r.get("id") or 0)[-1]


def fixed_by_hand(runs: list, run, is_unattended) -> bool:
    """**その run のあとに、人が手で押して通しているか。**

    手で押しても通る道は同じなので、**そこが緑ならもう直っている。**
    無視して issue を立てると、直した直後に「止まっています」と言うことになる。

    `id` で比べるのは `pick_run()` と同じ理由（並びを当てにしない）。

    Args:
        runs: 引いてきた run ぜんぶ
        run: `pick_run()` が選んだ1本か None
        is_unattended: `pick_run()` に渡したのと同じ関数

    Returns:
        あとから人が押して通っていれば True
    """
    if not run:
        return False
    return any(not is_unattended(r)
               and r.get("status") == "completed"
               and r.get("conclusion") in GREEN
               and (r.get("id") or 0) > (run.get("id") or 0)
               for r in (runs or []))


def decide(issue, want: str, down) -> str:
    """**何をするか**を決める。GitHub を触らない素の関数。

    | いま | issue | すること |
    | --- | --- | --- |
    | 止まっている | 無い | `create` — 1本開く |
    | 止まっている | 閉じている | `reopen` — **同じ1本**を開け直す |
    | 止まっている | 開いていて本文が違う | `update` — 本文だけ書き換える |
    | 止まっている | 開いていて本文が同じ | `noop` — **触らない** |
    | 直った | 開いている | `close` — 自分で閉じる |
    | 直った | 閉じている／無い | `noop` — **開け直さない** |
    | **分からない** | どれでも | `noop` — **開きも閉じもしない** |

    本文が同じなら触らないのは、毎朝「編集しました」を積まないため。
    **1日に2回走ることが実際にある**（繋ぎ先を2本にしてあるので）。

    `down` が None のときに `close` へ落ちないことが、この関数の肝。
    **落ちているかどうかを読めなかった朝に、開いている issue を「直った」と
    言って閉じるのが、いちばん悪い。**

    Args:
        issue: `find_issue()` が選んだ1本か None
        want: いま入れたい本文
        down: True（止まっている）/ False（通っている）/ None（分からない）

    Returns:
        "create" / "reopen" / "update" / "close" / "noop"
    """
    if down is None:
        return "noop"
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


def quiet_days(at, now: datetime):
    """いちばん新しい無人の run から、いま何日たったか。

    **issue には使わない。** 繋ぎ（`workflow_run`）が黙って切れた形がこれなので、
    ログに1行出すためだけの数。

    Args:
        at: run の始まった時刻（ISO の文字列）か None
        now: いま（timezone 付き）

    Returns:
        日数（float）。読めなければ None
    """
    if not isinstance(at, str):
        return None
    try:
        t = datetime.fromisoformat(at.replace("Z", "+00:00"))
    except (ValueError, TypeError):
        return None
    if t.tzinfo is None:
        t = t.replace(tzinfo=timezone.utc)
    return (now - t).total_seconds() / 86400


def linked_names(flow_dir: str) -> set:
    """`.github/workflows/` に在る**ワークフローの表示名**をぜんぶ拾う。

    **繋ぎ（`workflow_run`）は相手の `name:` で解決される。** あちらの名前を
    書き換えると黙って切れる——赤くならない。走らなくなるだけ。
    だから走った回に毎回、**繋ぎ先の名前がまだ実在するか**を見る。

    PyYAML は使わない。**この土台に乗る係は pip を1つも通らない**（本番の1回で
    入れているのは、確かめが YAML を読むぶんだけ）ので、ここは行頭の `name:` を
    素直に拾う。入れ子の `name:` は行頭に来ないので混ざらない。

    Args:
        flow_dir: `.github/workflows/` の場所

    Returns:
        表示名の集合。ディレクトリが無ければ空（**測れないだけ**なので落とさない）
    """
    out = set()
    if not os.path.isdir(flow_dir):
        return out
    for f in sorted(os.listdir(flow_dir)):
        if not f.endswith((".yml", ".yaml")):
            continue
        with open(os.path.join(flow_dir, f), encoding="utf-8") as fh:
            for line in fh:
                if line.startswith("name:"):
                    out.add(line[len("name:"):].strip().strip("\"'"))
                    break
    return out


class Gh:
    """GitHub を触る口。**ここだけが外に出る。**

    偽物と差し替えられるように、呼ぶ側はこの5つしか使わない
    （`runs` / `steps_of` / `list_issues` / `create` / `patch`）。

    ラベルの見た目だけは係ごとに違う（一覧でどの見張りのものか色で分かるように）。
    **継承して上書きする。** 引数で渡さないのは、`Gh(repo, token)` の形を
    変えないため——確かめが `Gh` ごと偽物に差し替えている。
    """

    LABEL_COLOR = "ededed"
    LABEL_DESC = ""

    # **待ちの札**（`python/ticket_labels.py` の `待ち-あやと` / `待ち-システム`）。
    # 付いていないと、毎週の棚卸し（`python/ticket_stock.py`）が「札が無い」に
    # 数える。空なら何も付けない。
    #
    # **中身が変わる係がある。** 配りの見張りは、同じ1本の issue が
    # 「出ていない（こちらで直せる）」と「もう出ている（あやとの判断が要る）」の
    # あいだを行き来するので、走るたびに入れ替える（`ship_down.run`）。
    # だからここは class の値であると同時に、**上書きしてよい**
    WAIT = ""

    # 待ちの札の色と説明（`ticket_labels.WAIT_STYLE`）。**先に作っておかないと
    # 色も説明も付かない札ができる。** 入れ替えの相手を知るのにも使う
    STYLE: dict = {}

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

    def runs(self, workflow_file: str) -> list:
        """そのワークフローの、**終わった** run を新しい順に引く。

        **ファイル名で引く**（表示名は人が変える）。手で押したぶんも混ざって
        返るので、選り分けるのは `pick_run()`。
        """
        f = urllib.parse.quote(workflow_file)
        got = self._call(
            "GET",
            f"/repos/{self.repo}/actions/workflows/{f}/runs"
            f"?status=completed&per_page={PER_PAGE}",
        )
        return got.get("workflow_runs", []) if isinstance(got, dict) else []

    def steps_of(self, run_id: int) -> list:
        """その run の step を、job をまたいで平らに並べて返す。"""
        got = self._call(
            "GET", f"/repos/{self.repo}/actions/runs/{run_id}/jobs?per_page={PER_PAGE}"
        )
        out = []
        for j in (got.get("jobs", []) if isinstance(got, dict) else []):
            out += j.get("steps") or []
        return out

    def list_issues(self, label: str) -> list:
        """そのラベルの issue を、**閉じたものも含めて**引く。

        閉じたものが要るのは、次に止まったときに同じ1本を開け直すため。
        """
        return self._call(
            "GET", f"/repos/{self.repo}/issues?labels={label}&state=all&per_page=100"
        )

    def create(self, title: str, text: str, label: str) -> dict:
        # ラベルは issue に付けるときも作られるが、色も説明も付かない。
        # 一覧で見分けが付くように、先に作っておく（あれば 422 で、それでよい）。
        # **待ちの札も一緒に。** 付いていないと毎週の棚卸しから見えない
        made = [(label, self.LABEL_COLOR, self.LABEL_DESC)]
        if self.WAIT:
            made.append((self.WAIT, *self.STYLE.get(self.WAIT, ("ededed", ""))))
        for name, color, desc in made:
            try:
                self._call("POST", f"/repos/{self.repo}/labels",
                           {"name": name, "color": color, "description": desc})
            except urllib.error.HTTPError as e:
                if e.code != 422:
                    raise
                # **既にある札は、色と説明を揃え直す。**
                # 422 は「もう在る」。以前はそこで諦めていたが、
                # **issue に付けた拍子に暗黙で作られた札**は色も説明も
                # 既定のままで、作り直す機会が二度と来ない
                # （2026-09-23 に `待ち-システム` が実際にそうなった）。
                # 名前が同じなら中身を送り直す。**送るのは色と説明だけ**で、
                # 名前は変えない（変えると付いている issue の札が動く）。
                try:
                    q = urllib.parse.quote(name)
                    self._call("PATCH", f"/repos/{self.repo}/labels/{q}",
                               {"color": color, "description": desc})
                except urllib.error.HTTPError:
                    # 揃わなくても issue は立てる。**見た目のために止めない**
                    pass
        return self._call("POST", f"/repos/{self.repo}/issues",
                          {"title": title, "body": text,
                           "labels": [n for n, _, _ in made]})

    def patch(self, number: int, payload: dict) -> dict:
        return self._call("PATCH", f"/repos/{self.repo}/issues/{number}", payload)

    def comment(self, number: int, text: str) -> dict:
        """コメントを1本足す。**通知が飛ぶのはここだけ。**

        本文を書き換えても GitHub は誰にも知らせない。開き直しただけでも
        飛ばない。だから「いま、あやとの番になった」ことを伝える口が要る
        （`python/ticket_labels.py` の `should_ping`）。
        """
        return self._call("POST",
                          f"/repos/{self.repo}/issues/{number}/comments",
                          {"body": text})


def _relabel(issue, label: str, wait: str, style: dict):
    """いま付いている札を、**待ちの相手だけ入れ替えて**返す。

    落とすのは `style` に載っている札（＝待ちの家族）だけ。**人が足した札は
    そのまま残す**——ここで全部を置き換えると、手で貼った `旅のあと` が消える。

    Args:
        issue: いまの issue（`labels` は文字列でも `{"name": …}` でもよい）
        label: この係の札（必ず付ける）
        wait: 付けたい待ちの札（空なら触らない）
        style: 待ちの札の一覧（`ticket_labels.WAIT_STYLE`）

    Returns:
        送る札の並び。**いまと同じなら None**（同じものを送り直さない）
    """
    if not wait:
        return None
    now = []
    for x in (issue.get("labels") or []):
        name = x.get("name") if isinstance(x, dict) else x
        if isinstance(name, str):
            now.append(name)
    keep = [n for n in now if n not in style and n != label]
    want = [label, wait] + keep
    return None if set(want) == set(now) else want


def apply_plan(gh, what: str, issue, title: str, want: str, label: str,
               log=None) -> dict:
    """`decide()` が決めたことを、**実際に GitHub へ書く。**

    **立て直さない。** 開け直し・書き換えは同じ1本に `PATCH` を当てる。
    タイトルは**作るときだけ**送る（人が書き換えたものを毎朝戻さない）。

    Args:
        gh: `Gh` か、同じ口を持つ偽物
        what: `decide()` の返り値
        issue: `find_issue()` が選んだ1本か None
        title: 作るときの題
        want: 入れたい本文
        label: 付けるラベル
        log: ログを出す先（省略すると、この土台のもの）

    Returns:
        {"action": ..., "planned": ..., "number": issue 番号か None}
    """
    log = log or logger

    if what == "create":
        made = gh.create(title, want, label)
        log.info("issue #%s を開きました", made.get("number"))
        return {"action": what, "planned": what, "number": made.get("number")}

    if what in ("reopen", "update"):
        payload = {"body": want}
        if what == "reopen":
            payload["state"] = "open"
        # **待ちの相手が入れ替わることがある。** 配りの見張りは、同じ1本が
        # 「出ていない（こちらで直せる）」↔「もう出ている（あやとの判断が要る）」
        # を行き来する。札を置いたままにすると、毎週の棚卸しが**逆の数**を出す。
        #
        # 送るのは**入れ替わるときだけ**で、**人が足した札は残す**
        # （`STYLE` に載っている札＝待ちの家族だけを落としてから付け直す）
        swap = _relabel(issue, label, getattr(gh, "WAIT", ""),
                        getattr(gh, "STYLE", {}))
        if swap is not None:
            payload["labels"] = swap
        gh.patch(issue["number"], payload)
        log.info("issue #%s を%sました", issue["number"],
                 "開き直し" if what == "reopen" else "書き換え")
        return {"action": what, "planned": what, "number": issue["number"]}

    if what == "close":
        gh.patch(issue["number"], {"state": "closed", "state_reason": "completed"})
        log.info("直ったので issue #%s を閉じました", issue["number"])
        return {"action": what, "planned": what, "number": issue["number"]}

    log.info("変わっていないので触りません")
    return {"action": "noop", "planned": "noop",
            "number": issue["number"] if issue else None}


def act(once, workflow_file: str, gh_factory, log=None) -> int:
    """資格を見て、`once(gh)` を1回まわして、**終了コードを返す。**

    届かなかったら 1。ここは「見ている相手が止まっているかどうか」とは別の話で、
    読めない＝**この仕組みが動いていない**ということ。黙って 0 で終わると、
    issue がいまの状態と食い違ったまま誰も気づかない。

    *止まっている*は赤くしない。*届かない*は赤くする。

    Args:
        once: `gh` を1つ受け取って、読んで・見立てて・issue を合わせる関数
        workflow_file: 見張っている相手（ログに出すだけ）
        gh_factory: `(repo, token)` を受け取って口を作る関数
        log: ログを出す先

    Returns:
        終了コード（0 か 1）
    """
    log = log or logger
    repo = os.getenv("GITHUB_REPOSITORY", "")
    token = os.getenv("GITHUB_TOKEN") or os.getenv("GH_TOKEN") or ""
    if not repo or not token:
        log.error("GITHUB_REPOSITORY と GITHUB_TOKEN が要ります")
        return 1

    try:
        once(gh_factory(repo, token))
    except urllib.error.HTTPError as e:
        # 401/403 は資格か権限（`actions: read` と `issues: write` の両方が要る）、
        # 404 はリポジトリかワークフローのファイル名。**どれも本物の異常。**
        # 返ってきた本文は出さない（URL や名前が混じる。ログは公開）
        log.error("GitHub を読み書きできませんでした（HTTP %s %s）。資格・"
                  "権限（actions / issues）・%s の在りかを見てください",
                  e.code, e.reason, workflow_file)
        return 1
    except (urllib.error.URLError, OSError, ValueError) as e:
        log.error("GitHub に届きませんでした: %s", str(e)[:200])
        return 1
    return 0
