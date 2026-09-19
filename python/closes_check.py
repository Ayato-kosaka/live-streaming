"""**「issue を直した PR」に `Closes #NNN` が入っているか**を、PR ごとに見る。

    python3 python/closes_check.py                    # PR の本文を読む（PR_BODY）
    python3 python/closes_check.py --body-file b.md --open 3,11,147
    python3 python/closes_check.py --body-file b.md   # 開いている issue は GitHub から引く

終了コード 0=通った / 1=**`Closes` が抜けている** / 2=数えるものが無い。

## なぜ要るか

PR の本文に `Closes #NNN` が在れば、**マージした瞬間に GitHub が
ひとりでに閉じる。** 人の記憶も手順書も要らない。
**この仕組みはもう在るのに、使えていなかった。**

直近30本のマージ済み PR を数えた（2026-09-19）:

| | 本数 |
| --- | --- |
| `Closes` / `Fixes` / `Resolves` が在る | **1本（3%）** |
| 本文が `#NNN` に触れている | 29本 |

つまり、閉じるのは毎回人の手だった。だから閉じ忘れる。

## 落ちる条件を、わざと狭くしてある

**「`#NNN` に触れているのに `Closes` が無い」で落とすと、28本が赤くなる。**
このリポジトリでは `#173` のような番号が **`docs/island-misses.md` の節番号**
としても使われていて、そちらのほうが多い。関係ない PR まで赤くすると、
そのうち誰も読まなくなる。

だから落ちるのは、次を**両方**満たすときだけ:

1. 本文が **いま開いている issue の番号** に触れている
2. その番号に `Closes` / `Fixes` / `Resolves` が付いていない

直近30本に当てると **1本**（3%）。しかもその1本は節番号の巻き添えなので、
**逃がし方**を用意してある——本文に `#147 は閉じない` と1行書けば通る。

## 題名は見ない

このリポジトリの PR の題名は、ほぼ全部が `（#173）` のような節番号で
終わっている。題名まで見ると、節番号と issue 番号の区別がつかない。
**見るのは本文だけ。**
"""

import argparse
import json
import logging
import os
import re
import sys
import urllib.error
import urllib.parse
import urllib.request

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
logger = logging.getLogger(__name__)

API = "https://api.github.com"

# GitHub が「マージしたら閉じる」と解釈する書きかた。
# https://docs.github.com/issues/tracking-your-work-with-issues/using-issues/linking-a-pull-request-to-an-issue
# **ここに無い書きかたは閉じない。** 「#123 を直した」では閉じてくれない
CLOSING = re.compile(
    r"(?i)\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\s*:?\s*#(\d+)")

# 本文の中の `#123`。URL の中の `#issuecomment-…` は数字で始まらないので当たらない
REF = re.compile(r"(?<![\w/])#(\d+)\b")

# **逃がし方。** 節番号の巻き添えや、指してはいるが閉じない issue のため。
# 1行書けば通る。書いた人が「分かっていて閉じない」と言えるようにする
EXCUSE = re.compile(r"#(\d+)\s*(?:は|を)?\s*閉じない")


def referenced(text: str) -> set:
    """本文が触れている issue 番号。"""
    return {int(n) for n in REF.findall(text or "")}


def closed_by(text: str) -> set:
    """本文が「マージしたら閉じる」と宣言している issue 番号。"""
    return {int(n) for n in CLOSING.findall(text or "")}


def excused(text: str) -> set:
    """本文が「これは閉じない」と断っている issue 番号。"""
    return {int(n) for n in EXCUSE.findall(text or "")}


def missing(text: str, open_numbers) -> list:
    """**`Closes` が抜けている**開いた issue の番号を返す。

    Args:
        text: PR の本文
        open_numbers: いま開いている issue の番号（集合か並び）

    Returns:
        番号の並び（小さい順）。無ければ空
    """
    live = set(open_numbers or ())
    return sorted((referenced(text) & live) - closed_by(text) - excused(text))


def open_numbers_from_github(repo: str, token: str) -> list:
    """いま開いている issue の番号を引く。**PR は落とす。**"""
    out = []
    for page in range(1, 11):
        q = urllib.parse.urlencode({"state": "open", "per_page": 100, "page": page})
        req = urllib.request.Request(f"{API}/repos/{repo}/issues?{q}")
        req.add_header("Accept", "application/vnd.github+json")
        req.add_header("X-GitHub-Api-Version", "2022-11-28")
        req.add_header("Authorization", f"Bearer {token}")
        with urllib.request.urlopen(req, timeout=30) as r:
            got = json.loads(r.read() or "[]")
        out += [i["number"] for i in got if not i.get("pull_request")]
        if len(got) < 100:
            break
    return out


def report(left: list, total: int) -> str:
    """落ちたときに出す文。**何を書けば通るか**まで書く。"""
    names = " ".join(f"#{n}" for n in left)
    return "\n".join([
        f"この PR は、開いている issue {names} を指していますが、"
        f"`Closes #…` が付いていません。",
        "",
        "この PR で片づくなら、本文に1行足してください（マージで自動的に閉じます）:",
        "",
        "    Closes " + " ".join(f"#{n}" for n in left),
        "",
        "片づかないなら、こう書けば通ります:",
        "",
        "    " + " ".join(f"#{n} は閉じない" for n in left),
        "",
        f"（見た番号は、いま開いている issue {total}本 のぶんだけです。"
        "`docs/island-misses.md` の節番号は見ていません）",
    ])


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--body-file", default="",
                    help="PR の本文が入ったファイル。既定は環境変数 PR_BODY")
    ap.add_argument("--open", default="",
                    help="開いている issue の番号（カンマ区切り）。"
                         "省くと GitHub から引く")
    a = ap.parse_args()

    if a.body_file:
        with open(a.body_file, encoding="utf-8") as f:
            text = f.read()
    else:
        text = os.getenv("PR_BODY", "")

    if a.open:
        live = [int(x) for x in a.open.split(",") if x.strip()]
    else:
        repo = os.getenv("GITHUB_REPOSITORY", "")
        token = os.getenv("GITHUB_TOKEN") or os.getenv("GH_TOKEN") or ""
        if not repo or not token:
            logger.error("GITHUB_REPOSITORY と GITHUB_TOKEN が要ります")
            return 2
        try:
            live = open_numbers_from_github(repo, token)
        except (urllib.error.URLError, OSError, ValueError) as e:
            logger.error("開いている issue を引けませんでした: %s", str(e)[:200])
            return 2

    # **0本は「数えるものが無い」。** 引けていないのに「抜けなし」と言わない
    # （`docs/island-standards.md` §15）
    if not live:
        logger.error("開いている issue を1本も引けませんでした（数えるものが無い）")
        return 2

    left = missing(text, live)
    logger.info("開いている issue %d本 のうち、この PR が指しているのは %d本"
                "／そのうち Closes が付いていないのは %d本",
                len(live), len(referenced(text) & set(live)), len(left))
    if not left:
        return 0

    print(report(left, len(live)))
    return 1


if __name__ == "__main__":
    sys.exit(main())
