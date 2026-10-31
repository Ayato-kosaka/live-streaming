"""**重い見張り（`重い見張り` ワークフロー）が赤いあいだ、issue を1本だけ開いておく。**

    python3 python/heavy_down.py --results "browserwatch=success,reachwatch=failure"
    python3 python/heavy_down.py --results "..." --apply   # 実際に issue を触る

終了コード 0=この仕組みは動いた（赤くても 0）/ **1=GitHub に届かなかった**。

## なぜ要るか（2026-10-16。#273）

`browserwatch` と `reachwatch` は、2026-10-16 まで `Selftests` の中に居た。
あやとの「CIがめっちゃ時間使っててマージがなかなかできない」を受けて
`heavy_watch.yml` へ移したが、**移した瞬間に穴が開く。**

PR に居たあいだは、赤ければ**マージできない**ので誰かが必ず見る。
master と毎晩だけになると、赤は **Actions の一覧の中にしか出ない**——
しかもあれは「起きたこと」であって「**いま残っていること**」ではない
（`ingest_down.yml` の頭）。次の晩に緑が積まれれば下へ流れていく。

`bake_down`（焼き直しが止まっている）と `ship_down`（配りが赤い）が
それぞれ同じ穴を塞いでいて、**重い見張りのぶんだけ空いていた。**
「**master が赤いまま誰も知らない**」を作らないために、ここを足した。

## `bake_down` / `ship_down` と違うのは、run を読まないところ

あの2つは**別のワークフローの run を API で読む。** ここは
**見ている2本と同じ run の中に居る**ので、読みにいく必要がない。
`needs.*.result` を文字列で受け取るだけ。

読まないほうが良いのは、`ship_down` が踏んだ穴（自分がまだ走っている
あいだに下流を押すので、下流は `?status=completed` で**ひとつ前の run** を
読んでしまう。だから `for_run` で番号を渡して待たせている）が
**そもそも起きない**から。

## 分からないときは、開きも閉じもしない

`cancelled` と `skipped` は「**落ちているかどうかを読めなかった**」。
ここを緑に倒すと、ランナーが死んだ晩に、開いている issue を
「直った」と言って閉じる。いちばん悪い（`run_watch.decide()` の表）。

打ち切り（job の `timeout-minutes` 超過）は GitHub では `failure` で返るので、
そちらは**赤に数える**（`reachwatch` が実際に 20% それで止まっている）。

## 赤くしない

**重い見張りが赤くても 0 で終わる。** 赤で知らせるのをやめるために作った
ものが、自分で赤を積んだら元に戻る。赤くなるのは「GitHub に届かない」
＝**この仕組みそのものが動いていない**ときだけ（`run_watch.act()`）。
"""

import argparse
import logging
import os
import sys

sys.path.insert(0, __file__.rsplit("/", 1)[0])

# **作法は `python/run_watch.py` と共有する。** あちらに「分からない朝は
# 開きも閉じもしない」「立て直さずに同じ1本を書き換える」「題は作るときだけ」が
# 置いてある。写して持つと、**片方だけ直した日に黙って食い違う。**
import run_watch  # noqa: E402
from run_watch import PLAN, decide, find_issue  # noqa: E402,F401

# **待ちの相手の札。** 重い見張りの赤は**こちらで直せる**ので、
# あやとへのメンションは入れない（`python/ticket_labels.py` の表）
from ticket_labels import WAIT_STYLE, WAIT_US  # noqa: E402

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)

# 見ている相手。**ログと本文に出すだけ**（run は読まない）
WORKFLOW_FILE = "heavy_watch.yml"

# **同じ1本を引くための、見えない印。** 題では引かない（人が書き換える）
MARK = "<!-- watch-down -->"

# 一覧で色分けするための札
LABEL = "watch-down"

# 題は**作るときだけ**送る（`run_watch.apply_plan`）
TITLE = "重い見張り（ブラウザ）が、master で赤いままです"

# **赤と言ってよい結果。** `timed_out` は job の打ち切りで、GitHub の
# `needs.*.result` では `failure` に畳まれて来るが、念のため両方見る
RED = ("failure", "timed_out")

# **通ったと言ってよい結果。** ここに無いもの（`cancelled` / `skipped`）は
# **どちらとも言わない**
GREEN = ("success",)

# どの job が何を見ているか。**本文に出して、開いた人がどこを直すか分かるように**
WHAT = {
    "browserwatch": "焼いた面の姿（歩いた国の数・図鑑の絵・札の行き先・"
                    "貼られたときの顔・運ぶ量・歩ける島・JS前の字・焼いた日付・"
                    "仕様の説明・振り返り資料）",
    "reachwatch": "押しどころに指が届くか（覆い・48px割れ）",
}


def parse_results(text: str) -> dict:
    """`"a=success,b=failure"` を辞書にする。**読めない字は捨てない。**

    捨てると、渡し方を間違えた日に「見る相手が0本」＝緑になる
    （`docs/island-standards.md` §15）。読めないものは `"?"` で残して、
    下の `assess()` が「分からない」に倒す。

    Args:
        text: ワークフローが組み立てた `job=result` の並び

    Returns:
        {job 名: result}
    """
    out: dict[str, str] = {}
    for part in (text or "").split(","):
        part = part.strip()
        if not part:
            continue
        job, _, res = part.partition("=")
        out[job.strip()] = res.strip() or "?"
    return out


def assess(results: dict) -> dict:
    """結果の並びから、**いま赤いかどうか**を決める。

    | 中身 | down |
    | --- | --- |
    | 1本でも `failure` / `timed_out` | True（赤い） |
    | ぜんぶ `success` | False（通っている） |
    | **それ以外**（`cancelled` / `skipped` / 空 / 読めない） | **None（分からない）** |

    空を緑に倒さないのが肝。渡し忘れた日に、開いている issue を閉じにいく。

    Args:
        results: `parse_results()` の返り値

    Returns:
        {"down": True/False/None, "red": 赤い job の名, "results": そのまま}
    """
    if not results:
        return {"down": None, "red": [], "results": results}
    red = sorted(j for j, r in results.items() if r in RED)
    if red:
        return {"down": True, "red": red, "results": results}
    if all(r in GREEN for r in results.values()):
        return {"down": False, "red": [], "results": results}
    return {"down": None, "red": [], "results": results}


def body(a: dict, run_url: str) -> str:
    """issue の本文。**毎回まるごと組み直して、前と同じなら触らない。**

    `decide()` が本文の字で比べるので、**走った時刻のような毎回変わる字を
    入れない。** 入れると毎晩「編集しました」が積まれる。
    run の URL は**赤い job の並びが変わったときだけ**変わる…のではないので、
    ここには入れずにログだけに出す。

    Args:
        a: `assess()` の返り値
        run_url: この run の URL（ログに出すだけ。本文には入れない）

    Returns:
        issue の本文
    """
    lines = [
        "**重い見張りが master で赤いままです。**",
        "",
        "PR の通り道からは外してあるので（#273）、ここが赤くても"
        "マージは止まりません。**止まらないぶん、ここを見てください。**",
        "",
        "落ちているもの:",
        "",
    ]
    for j in a["red"]:
        lines.append(f"- `{j}` — {WHAT.get(j, '（何を見ている job か、表に無い）')}")
    lines += [
        "",
        "`重い見張り` のいちばん新しい run を開いて、赤い step を見てください。"
        "直したら、`重い見張り` を手で押せばその場で確かめられます"
        "（押した回の既定は「見るだけ」なので、この issue は動きません）。",
        "",
        "次に通れば、この issue はひとりでに閉じます。",
    ]
    return "\n".join([MARK, ""] + lines) + "\n"


class Gh(run_watch.Gh):
    """GitHub を触る口。**中身は `run_watch.Gh`。ここが持つのは札の見た目だけ。**

    `Gh(repo, token)` の形を変えないこと。**確かめが `Gh` ごと偽物に
    差し替えている**（`heavy_down_selftest.py`）。
    """

    # `bake-down` が 5319e7（紫）、`donor-calls` が d93f0b、`ingest-down` が
    # b60205。**一覧で色で見分けられるように、どれとも違う色**にする
    LABEL_COLOR = "1d76db"
    LABEL_DESC = "重い見張り（ブラウザ）が master で赤い"

    # **こちらで直せる。** あやと待ちではない
    WAIT = WAIT_US
    STYLE = WAIT_STYLE


def run(gh, a: dict, run_url: str, apply: bool = False) -> dict:
    """見た結果に、issue を合わせる。

    **読むのは毎回。書くのは `apply` のときだけ。** `apply` でなくても
    `list_issues` は1回通す——通しておかないと、緑の晩のあいだ GitHub への道が
    一度も試されず、**本当に要る晩に落ちる。**

    Args:
        gh: `Gh` か、同じ口を持つ偽物
        a: `assess()` の返り値
        run_url: この run の URL（ログに出すだけ）
        apply: 本当に書くか

    Returns:
        {"action": ..., "planned": ..., "number": issue 番号か None}
    """
    issues = gh.list_issues(LABEL)
    logger.info("GitHub の issue を読めました（ラベル %s で %d件）", LABEL, len(issues))

    issue = find_issue(issues, MARK)
    if issue is None:
        logger.info("この仕組みの issue はまだ1本もありません")
    else:
        logger.info("この仕組みの issue は #%s（いま%s）", issue["number"],
                    "開いています" if issue.get("state") == "open" else "閉じています")

    want = body(a, run_url)
    what = decide(issue, want, a["down"])

    if not apply:
        logger.info("--apply を付けていないので GitHub には書きません")
        logger.info("付けると: %s", PLAN[what])
        return {"action": "dry", "planned": what,
                "number": issue["number"] if issue else None}

    return run_watch.apply_plan(gh, what, issue, TITLE, want, LABEL, log=logger)


def say(a: dict, run_url: str) -> None:
    """見立てを1行にして出す。**赤い job の名前まで出す。**"""
    logger.info("重い見張りは%s（%s）",
                {True: "赤いままです", False: "通っています"}
                .get(a["down"], "どうなっているか分かりません"),
                " / ".join(f"{j}={r}" for j, r in sorted(a["results"].items()))
                or "結果が1つも渡っていない")
    if run_url:
        logger.info("この run: %s", run_url)


def act(results: dict, run_url: str, apply: bool) -> int:
    """GitHub に当たって、**終了コードを返す。**

    *赤い*は 0 のまま。*届かない*は 1（`run_watch.act()`）。
    """
    a = assess(results)
    say(a, run_url)

    def once(gh):
        run(gh, a, run_url, apply=apply)

    return run_watch.act(once, WORKFLOW_FILE,
                         lambda repo, token: Gh(repo, token), log=logger)


def main() -> int:
    ap = argparse.ArgumentParser(
        description="重い見張りが赤いあいだ、issue を1本だけ開いておく")
    ap.add_argument("--results", default=os.environ.get("RESULTS", ""),
                    help='"browserwatch=success,reachwatch=failure" の形')
    ap.add_argument("--run-url", default=os.environ.get("RUN_URL", ""),
                    help="この run の URL（ログに出すだけ）")
    ap.add_argument("--apply", action="store_true",
                    help="issue を実際に開く／書き換える／閉じる")
    a = ap.parse_args()
    return act(parse_results(a.results), a.run_url, a.apply)


if __name__ == "__main__":
    sys.exit(main())
