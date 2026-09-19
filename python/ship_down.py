"""**本番への配りが赤いこと**を、GitHub issue 1本に映し続ける。

    python python/ship_down.py            # いまどうなっているかを出すだけ
    python python/ship_down.py --apply    # issue を開ける／書き換える／閉じる
    python python/ship_down.py --from x.json   # 手元の run を食わせる（GitHub を読まない）

## なぜ要るか

毎晩の**焼き直し**（`rebake.yml`）が赤いときは、`python/bake_down.py` が
issue を1本立てる。ところが**配り**（`firebase-hosting-deploy-prod.yml`）が
赤いときに、**立てるものが1つも無かった。**

そして配りを起こしているのは、**焼き直しの最後の step**
（`rebake.yml` の `gh workflow run firebase-hosting-deploy-prod.yml`）だけ。
つまり **配りが赤くなっても、誰も気づかない。**

配りの中には「配った面が、面として配られているか」（本番の面のひと回り）も
「無い道が、ちゃんと 404 で返っているか」も入っている。
**本番が壊れても黙ったまま**になる、というのがこの穴の意味。

赤は Actions の一覧の中にしか出ないうえ、**「起きたこと」であって
「いま残っていること」ではない**（`ingest_down.yml` の頭）。次の晩に緑が積まれれば
下へ流れていく。だから赤を強くするのではなく、**いまの状態そのものを、人が毎日
見る場所（issue の一覧）に置く。**

作法は `python/bake_down.py` と同じで、**決まりは `python/run_watch.py` に
共有してある**（写経すると、片方だけ直した日に黙って食い違う）。
ここが持つのは、**配りに固有の2つ**だけ:

1. 何を「無人」と呼ぶか
2. どの step で落ちたかが、**何を意味するか**

## 1. 配りの「無人」は、event では分からない

焼き直しは `schedule` と `workflow_run` で無人だが、**配りは違う。**
配りには `workflow_dispatch` しか無く、**毎晩の1回もそこを通る**
（焼き直しの最後の step が `gh workflow run` で押している）。
event で見ると毎晩の配りが全部「手押し」に見えて、**一生 issue が立たない。**

分かれ目は**押した人**のほう。毎晩のぶんは `github-actions[bot]` が押していて、
検品で押したぶんには人の名前が付く。実測（直近20本）でも、この2つしか無い。

手で押したぶんを混ぜない理由は、`bake_down.py` と同じ——**押した人がその場で
見ている。** 見ている赤を issue にしても、気づかないことは1つも減らない。
そのうえ検品の押しは**出してよくない木から押すことがある**ので、そこが赤くても
「明日からの島」の話ではない。

**ただし、赤いあとで人が手で押して通していたら、その回は判断を保留する。**
手押しでも配る道は同じなので、そこが緑なら**もう本番は直っている。**

## 2. 「もう出ているのか、出る前に止まったのか」を先に言う

配りは step が11本あって、**落ちる場所で意味が全然違う。**
「赤いです」だけでは、本番を見に行くべきかどうかも分からない。

分け目は **`action-hosting-deploy`（配る step）そのもの。**
名前ではなく**その step より前か後か**で見る。理由は本番の実例:

- run #63（2026-09-04）は `🔐 Firestore ルールのデプロイ` で落ちたが、当時それは
  **配る step より前**に置いてあって、配るほうは skip された＝**出ていない**
- run #114（2026-09-09）は `🔎 Firestore インデックスのデプロイ` で落ちたが、
  こちらは**配ったあと**＝**もう出ている**

同じ step 名で、意味が逆になる。**名前の表を持つと、並べ替えた日に嘘をつく。**

落ちた step が複数あるときは、**いちばん早いもの**を採る。後ろの step は
`if: !cancelled()` で走り続けるので、**最初に落ちたところが「出たかどうか」を
決めている。**

| どこで落ちたか | 本番は | issue の1行目 |
| --- | --- | --- |
| 配る step より前 | **出ていない**（ひとつ前のまま） | まだ出ていません |
| 配る step そのもの | **出ていない**（ひとつ前のまま） | まだ出ていません |
| 配る step より後 | **もう出ている** | もう出ています |
| 配る step が読めない | 分からない | 読めません |

**何を直すか**は step の名前から言う（書き出し／数え／ルール／索引／
出したあとの見張り）。出たかどうかとは別の軸なので、両方書く。

## メンションは「もう出ている」ときだけ

別の担当（`claude/ticket-keep`）が「**あやとにしかできないこと待ちのものだけ
メンションする**」という線引きを作っている。配りの赤は本来こちらで直せるので、
その線引きなら呼ばない側。

**ただし、この案件は明日クロージングする。** 明日からは、押し直せる手が
あやとしか居ない。それでも全部呼ぶと、通知が積まれて読まれなくなる
（狼少年にしたら、いちばん要る日に効かない）。だから分ける:

- **出る前に止まった赤**は呼ばない。島はひとつ前のまま無事に出ていて、
  **次の晩の配りが通れば、この issue はひとりでに閉じる。** 1晩待てる
- **もう出ているのに赤い**ときだけ呼ぶ。視聴者さんが見ている面が壊れている
  かもしれず、**下ろす／配り直すの判断が要る。** 1晩待てない

## 分からない回は、開きも閉じもしない

run が1本も無い・`cancelled` で終わっている——これは**「読めていない」で
あって「壊れている」ではない**（`docs/island-standards.md` 15章）。
ここで「通っている」に倒すと、**直っていない issue を「直った」と言って閉じる。**

## 繋ぎが切れたら、赤くする

この係を起こすのは `workflow_run`＝**相手の `name:`。**
「Firebase Hosting Deploy」を書き換えると**黙って切れる。走らなくなるだけで、
赤も出ない。** だから走った回に毎回、`.github/workflows/` を読んで
**繋ぎ先の名前がまだ実在するか**を見る（`run_watch.linked_names`）。
無ければ **1 で落ちる**——これは「配りが赤い」ではなく
**この仕組みが動いていない**ほうなので、赤くしてよい。

読む側は `name:` を使わない。**ファイル名で引く**ので、そちらは黙って切れない。

**繋ぎが生きているかは、`Fetch Doneru Donations` を `probe: true` で押すと
確かめられる**（1バイトも書かずに40秒で終わる。`CLAUDE.md`）。
そのために、繋ぎ先にあれを1本入れてある。**本番を汚さずに、この係が起きるかだけ
を見られる**——配りを押して確かめると、本番へ配ってしまう。

## 赤くしない／赤くする

**配りが赤くても 0 で終わる。** 赤で知らせるのをやめるために作ったものが、
自分で赤を積んだら元に戻る。1 で落ちるのは、届かない・権限が無い・
繋ぎ先の名前が消えた＝**この仕組みそのものが動いていない**ときだけ。
"""

import argparse
import json
import logging
import os
import sys
from datetime import datetime, timezone

sys.path.insert(0, __file__.rsplit("/", 1)[0])

# **作法は `python/run_watch.py` と共有する**（`python/bake_down.py` と同じ土台）。
# どの run を見るか・分からない回は開きも閉じもしない・立て直さずに書き換える、
# は全部あちら。ここが持つのは配りに固有のところだけ
import run_watch  # noqa: E402
from run_watch import PLAN, RED, decide, find_issue, quiet_days  # noqa: E402,F401

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)

# 見張る相手。**ファイル名で引く。** 表示名（`name:`）は人が読みやすく変えるもので、
# 変えた日に黙って別のワークフローを見にいく／0件になる。
# ファイル名なら、消えたときは 404 で赤くなる
WORKFLOW_FILE = "firebase-hosting-deploy-prod.yml"

# この係を**起こす**繋ぎ先（`ship_down.yml` の `workflow_run`）。
# こちらは `name:` で解決されるので、**書き換えられると黙って切れる。**
# 走った回ごとに、この名前がまだ実在するかを見る
LINKED_NAMES = ("Firebase Hosting Deploy", "Fetch YouTube Chat Data",
                "Fetch Doneru Donations")

# 毎晩の配りを押している主。`rebake.yml` の最後の step が
# `gh workflow run` で押すので、`github-actions[bot]` になる。
# **人が検品で押したぶんには、人の名前が付く**（実測でこの2つしか無い）
BOT = "github-actions[bot]"

# event で無人と分かるぶん。配りにはいまこの2つの入口が無いが、
# **あとで cron を足した日に、黙って手押し扱いにしない**ために見ておく
UNATTENDED_EVENTS = ("schedule", "workflow_run")

# **配る step。ここが分け目。** `uses:` に名前を付けていないので、GitHub は
# `Run FirebaseExtended/action-hosting-deploy@v0` と呼ぶ。名前を付けられても
# 拾えるように、**入っている字**で探す（`ship_down_selftest.py` が、この字で
# 引ける step が `firebase-hosting-deploy-prod.yml` に実在するかを毎回見ている）
DEPLOY_MARK = "action-hosting-deploy"

# 落ちた step の名前 →「何を直すか」。**出たかどうかとは別の軸。**
# ここに無い名前でも困らない（`other` に落ちて、名前だけ本文に出る）
WHAT = {
    "配るものが、ぜんぶ書き出せているか": "missing",
    "🔐 Firestore ルールのデプロイ": "rules",
    "🔐 Storage ルールのデプロイ": "rules",
    "🔎 Firestore インデックスのデプロイ": "rules",
    "無い道が、ちゃんと 404 で返っているか": "notfound",
    "配った面が、面として配られているか": "sweep",
}

# 書き出しのところ。ここが落ちるのは「配れなかった」ではなく「作れなかった」
BUILD_STEPS = ("Run npm ci && npm run build:web",)

# 配りが何日走っていなかったら、**ログに1行**書くか。
# **issue にはしない**（`bake_down.py` の `QUIET_DAYS` と同じ理由）。
# 配りは毎晩、焼き込みが変わった晩だけ走るので、2〜3日空くのは正常にありうる
QUIET_DAYS = 4

# 本文に埋める見えない印。GitHub は HTML コメントを描かないので、
# 読む人には見えないまま、こちらからは確実に引ける。
# **タイトルでは探さない**（人が読みやすく書き換える）
MARK = "<!-- ship-down -->"

# 固定のラベル。印と両方で引く
LABEL = "ship-down"

# タイトルは**作るときだけ**入れて、あとは触らない。
# 出ているか出ていないかは本文が持つ（タイトルに入れると毎回書き換わって、
# 書き換えた人と綱引きになる）
TITLE = "島を本番に配るところが、赤くなっています"

# 呼ぶ相手。**「もう出ている」赤のときだけ**本文に入れる（docstring）
OWNER = "@Ayato-kosaka"


def unattended(r: dict) -> bool:
    """その run に、押した人がいなかったか。

    **配りは event では分からない**（毎晩のぶんも `workflow_dispatch`）。
    押した主が `github-actions[bot]` かどうかで見る。

    `triggering_actor` が無い古い run は `actor` に落ちる。どちらも読めなければ
    **手押し扱い**——「無人だと思って赤くする」より「黙る」ほうが安全。
    """
    if r.get("event") in UNATTENDED_EVENTS:
        return True
    who = (r.get("triggering_actor") or r.get("actor") or {}).get("login")
    return who == BOT


def pick_run(runs: list):
    """**無人で走った、いちばん新しい完了した run** を1本選ぶ（`run_watch`）。"""
    return run_watch.pick_run(runs, unattended)


def fixed_by_hand(runs: list, run) -> bool:
    """**その run のあとに、人が手で押して通しているか**（`run_watch`）。

    手で押しても配る道は同じなので、**そこが緑ならもう本番は直っている。**
    """
    return run_watch.fixed_by_hand(runs, run, unattended)


def where_broke(steps: list) -> dict:
    """**どこで落ちたか**を見て、「もう出ているか」と「何を直すか」を決める。

    分け目は `action-hosting-deploy` の step。**名前の表では決めない**
    （同じ step 名が、置き場所によって出たあと／出る前のどちらにもなる。
    本番の run #63 と #114 が実際にそうだった）。

    落ちた step が複数あるときは**いちばん早いもの**。後ろの step は
    `if: !cancelled()` で走り続けるので、最初に落ちたところが出たかどうかを決める。

    Args:
        steps: その run の step（`{"name", "number", "conclusion"}` の並び）

    Returns:
        {"out": True/False/None（もう出ているか）,
         "what": "build"/"missing"/"deploy"/"rules"/"notfound"/"sweep"/"other",
         "step": 落ちた step の名前か None}
    """
    rows = list(steps or [])
    failed = sorted((s for s in rows if s.get("conclusion") in RED),
                    key=lambda s: s.get("number") or 0)
    first = failed[0] if failed else None
    name = (first or {}).get("name")

    deploy = next((s for s in rows if DEPLOY_MARK in (s.get("name") or "")), None)

    # 配る step が見つからない＝**名前が変わったか、step が読めていない。**
    # 出たかどうかを言えないので、そこは None にして名前だけ出す
    if deploy is None or first is None:
        return {"out": None, "what": _what(name), "step": name}

    dn = deploy.get("number") or 0
    fn = first.get("number") or 0

    if fn == dn:
        # 配る step そのもの。**出ていない**（ひとつ前のまま）
        return {"out": False, "what": "deploy", "step": name}
    if fn < dn:
        # 配るより前で止まった。配る step は skip されている＝**出ていない**
        return {"out": False, "what": _what(name), "step": name}
    # 配ったあと。**配る step が緑でなければ、出たとは言えない**
    return {"out": deploy.get("conclusion") == "success",
            "what": _what(name), "step": name}


def _what(name) -> str:
    """落ちた step の名前から、**何を直すか**を引く。"""
    if name in WHAT:
        return WHAT[name]
    if name in BUILD_STEPS:
        return "build"
    return "other"


def assess(run, steps, by_hand: bool = False) -> dict:
    """**いま配りが通っているか**を決める。外を触らない素の関数。

    | run | どう見るか |
    | --- | --- |
    | 緑 | **配れている** |
    | 赤 | **配りが赤い**（どこで落ちたかは `where_broke()`） |
    | 赤 + **そのあと手で押して通っている** | **分からない**（1回ぶん保留） |
    | `cancelled` など、どちらとも言えない | **分からない**（開きも閉じもしない） |
    | 無人の run が1本も無い | **分からない** |

    Args:
        run: `pick_run()` が選んだ1本か None
        steps: その run の step の並び（読めなければ None でよい）
        by_hand: `fixed_by_hand()` の返り値

    Returns:
        {"down": True/False/None, "out": True/False/None,
         "what": 何を直すか, "step": 落ちた step か None, "at": 始まった時刻か None}
    """
    if not run:
        return {"down": None, "out": None, "what": None, "step": None, "at": None}

    at = run.get("run_started_at") or run.get("created_at")
    end = run.get("conclusion")

    if end in run_watch.GREEN:
        return {"down": False, "out": None, "what": None, "step": None, "at": at}
    if end in RED:
        if by_hand:
            # 赤いが、**そのあと人が手で押して通っている。**
            # 本番はもう直っているので、次の無人の1回まで判断を保留する
            return {"down": None, "out": None, "what": "byhand",
                    "step": None, "at": at}
        return {"down": True, "at": at, **where_broke(steps)}
    # `cancelled` / `neutral` / まだ結論が付いていない。**どちらとも言わない**
    return {"down": None, "out": None, "what": None, "step": None, "at": at}


def body(a: dict) -> str:
    """issue の本文。**あやとがこれから何をすればいいかだけ。**

    **1行目で「もう出ているのか、出る前に止まったのか」を言い分ける。**
    そこが分からないと、本番を見に行くべきかどうかも決められない。

    **日付も run の番号も書かない**（毎回変わる字を入れると、状態が1つも
    動いていない回に本文だけが書き換わって、通知が積まれる）。

    Args:
        a: `assess()` の返り値

    Returns:
        本文。頭に見えない印が入る
    """
    out = a.get("out")
    if out is True:
        first = ("**もう本番に出ています。** 配り終わったあとで赤くなりました。"
                 "視聴者さんが見ている面が、そのまま壊れているかもしれません。")
    elif out is False:
        first = ("**まだ本番には出ていません。** 配る前に止まったので、"
                 "島はひとつ前のままです。")
    else:
        first = ("**出ているかどうかが読めませんでした。**"
                 "先に本番を開いて、島が出ているかを見てください。")

    where = (f"落ちたのは **{a['step']}** のところです。" if a.get("step")
             else "どこで落ちたかは、run を開くと出ています。")

    how = {
        "build": "書き出し（`npm run build:web`）が通っていません。"
                 "手元で `cd site && NEXT_DIST_DIR=.next-verify npx next build` "
                 "を回すと、同じところで落ちます。",
        "missing": "書き出しに、配るはずの面が足りません。"
                   "`node tools/sprites/notfound.mjs --dist` が、どの面が"
                   "無いかを出します。",
        "deploy": "Hosting へ配るところで落ちています。資格"
                  "（`FIREBASE_SERVICE_ACCOUNT`）と、Firebase 側の様子を"
                  "見てください。",
        "rules": "面は配れていて、ルールか索引だけが入っていません。"
                 "**画面は動きますが、決めたとおりの守りになっていません。**",
        "notfound": "無い道が 404 で返らなくなっています。"
                    "`firebase.json` の受け皿（`\"**\" → /index.html`）が"
                    "戻っていないか見てください。",
        "sweep": "配った面をひと回りしたところで、面として配られていないものが"
                 "見つかりました。run を開くと、どの面かが出ています。",
    }.get(a.get("what"), "run を開いて、赤い step を見てください。")

    tail = ["", "直したら `Firebase Hosting Deploy` を手で押し直します。",
            "次の配りが通れば、この issue はひとりでに閉じます。"]

    # **呼ぶのは「もう出ている」ときだけ**（docstring「メンションは…」）。
    # 出る前に止まった赤は1晩待てるので、通知を積まない
    if out is True:
        tail += ["", f"{OWNER} 本番に出てしまっているので、"
                     "下ろすか配り直すかの判断が要ります。"]

    return "\n".join([MARK, "", first, "", where, "", how] + tail) + "\n"


class Gh(run_watch.Gh):
    """GitHub を触る口。**中身は `run_watch.Gh`。ここはラベルの色だけ持つ。**

    `Gh(repo, token)` の形を変えないこと。**確かめが `Gh` ごと偽物に
    差し替えている**（`ship_down_selftest.py` の `act()`）。
    """

    # `donor-calls`（d93f0b）`ingest-down`（b60205）`bake-down`（5319e7）が
    # 既に居るので、そのどれとも違う色にする。一覧を眺めたときに
    # 「これは配りのほう」と色で分かるように
    LABEL_COLOR = "fbca04"
    LABEL_DESC = "本番への配りが赤いまま"


def check_wiring(flow_dir: str) -> list:
    """**繋ぎ先の `name:` が、まだ実在するか。**

    ここが切れても**赤くならない。走らなくなるだけ**なので、走れた回に見ておく。

    Args:
        flow_dir: `.github/workflows/` の場所

    Returns:
        見つからなかった名前の並び。ディレクトリが読めなければ空
        （**測れないことと、切れていることは別**。`island-standards.md` 15章）
    """
    have = run_watch.linked_names(flow_dir)
    if not have:
        logger.warning("%s を読めなかったので、繋ぎ先の名前は確かめていません",
                       flow_dir)
        return []
    gone = [n for n in LINKED_NAMES if n not in have]
    logger.info("繋ぎ先の name: を %d本 見て、見つからないもの %d本",
                len(LINKED_NAMES), len(gone))
    return gone


def read_state(gh) -> dict:
    """**いまの配り**を読む。ここだけが run を取りにいく。

    step まで取りにいくのは**赤い run のときだけ。** 通っている回に
    もう1回叩いても、読むものが何も無い。

    Args:
        gh: `Gh` か、同じ口を持つ偽物

    Returns:
        `assess()` の返り値
    """
    runs = gh.runs(WORKFLOW_FILE)
    logger.info("%s の終わった run を %d本 読めました", WORKFLOW_FILE, len(runs))

    run = pick_run(runs)
    if run is None:
        logger.warning("そのうち無人で走ったものが1本もありません。"
                       "赤いとは見なしません")
        return assess(None, None)

    logger.info("いちばん新しい無人の run は #%s（%s で終わった）",
                run.get("run_number"), run.get("conclusion"))

    by_hand = fixed_by_hand(runs, run)

    steps = None
    # **step を取りにいくのは、赤くて、かつ保留でないときだけ。**
    # 保留なら本文を作らないので、読むものが無い
    if run.get("conclusion") in RED and not by_hand:
        steps = gh.steps_of(run["id"])
        logger.info("その run の step を %d個 読めました", len(steps))

    return assess(run, steps, by_hand)


def run(gh, a: dict, apply: bool = False) -> dict:
    """見た run に、issue を合わせる。

    **読むのは毎回。書くのは `apply` のときだけ。**
    `apply` でなくても `list_issues` は1回通す。ここを通しておかないと、
    配りが通っているあいだ GitHub への道が一度も試されず、**本当に要る回に
    落ちる**（`ingest_down.py` `bake_down.py` と同じ理由）。

    読めなかったときは**投げ返す。** 赤くするのは呼ぶ側。

    Args:
        gh: `Gh` か、同じ口を持つ偽物
        a: `assess()` の返り値
        apply: 本当に書くか

    Returns:
        {"action": ..., "planned": ..., "number": issue 番号か None}
        `action` は実際にしたこと（書かなかったときは `"dry"`）
    """
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

    return run_watch.apply_plan(gh, what, issue, TITLE, want, LABEL, log=logger)


def say(a: dict) -> None:
    """見立てを1行にして出す。**長く走っていなければ、そこも1行足す。**"""
    logger.info("いま配りは%s（%s／%s）",
                {True: "赤いです", False: "通っています"}
                .get(a["down"], "どうなっているか分かりません"),
                {True: "もう出ている", False: "まだ出ていない"}
                .get(a.get("out"), "出たかどうかは読めない"),
                {"build": "書き出しが落ちた", "missing": "配るものが足りない",
                 "deploy": "配れなかった", "rules": "ルール／索引が入っていない",
                 "notfound": "404 が返っていない", "sweep": "配った面が赤い",
                 "other": "どこかで落ちた",
                 "byhand": "赤いが、そのあと手で押して通っているので保留"}
                .get(a.get("what"), "-"))

    d = quiet_days(a["at"], datetime.now(timezone.utc))
    if d is not None and d >= QUIET_DAYS:
        # **issue にはしない**（`QUIET_DAYS` の理由）。繋ぎが黙って切れた形が
        # これなので、ログに1行だけ残す
        logger.warning("無人の配りが %.1f日 走っていません。"
                       "繋ぎ（workflow_run）が切れていないか見てください", d)


class Canned:
    """**手元の JSON を、GitHub の代わりに返す口**（`--from`）。

    赤い側を確かめるのに、本番を赤くするわけにはいかない。
    本物の run を1本落としてきて食わせると、**本文までそのまま出せる。**

    ```bash
    python python/ship_down.py --from python/tests/ship_down_runs.json
    ```

    issue は**読むふりだけ**して空を返す。`--apply` と一緒には使えない。
    """

    def __init__(self, path: str):
        with open(path, encoding="utf-8") as f:
            d = json.load(f)
        self._runs = d.get("runs") or d.get("workflow_runs") or []
        self._steps = d.get("steps") or []

    def runs(self, workflow_file: str) -> list:
        return list(self._runs)

    def steps_of(self, run_id: int) -> list:
        return list(self._steps)

    def list_issues(self, label: str) -> list:
        return []

    def create(self, *a, **k):
        raise AssertionError("--from は読むだけ（GitHub には書かない）")

    def patch(self, *a, **k):
        raise AssertionError("--from は読むだけ（GitHub には書かない）")


def act(apply: bool, flow_dir: str = "") -> int:
    """GitHub に当たって、**終了コードを返す。**

    届かなかったら 1。**繋ぎ先の名前が消えていても 1。**
    どちらも「配りが赤い」ではなく、**この仕組みが動いていない**ほう。

    Args:
        apply: 本当に書くか
        flow_dir: `.github/workflows/` の場所（省略するとリポジトリのもの）

    Returns:
        終了コード（0 か 1）
    """
    def once(gh):
        a = read_state(gh)
        say(a)
        run(gh, a, apply=apply)

    # `Gh` を名前で解決するのは、**確かめがここを偽物に差し替えるから**
    code = run_watch.act(once, WORKFLOW_FILE,
                         lambda repo, token: Gh(repo, token), log=logger)

    gone = check_wiring(flow_dir or _flow_dir())
    if gone:
        # **黙って切れる唯一のところ。** 走らなくなるだけで赤も出ないので、
        # 走れているうちに気づく
        logger.error("繋ぎ先のワークフローが見つかりません: %s。"
                     "`ship_down.yml` の workflow_run と、相手の name: が"
                     "食い違っています（このままだと、配りが赤くても起きません）",
                     " / ".join(gone))
        return 1
    return code


def _flow_dir() -> str:
    """リポジトリの `.github/workflows/`。"""
    here = os.path.dirname(os.path.abspath(__file__))
    return os.path.join(os.path.dirname(here), ".github", "workflows")


def main() -> int:
    """エントリポイント。**配りが赤くても赤くしない**（届かないときだけ赤い）。"""
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true",
                    help="issue を実際に開く／書き換える／閉じる")
    ap.add_argument("--from", dest="canned", default="",
                    help="GitHub の代わりに、手元の JSON の run を読む（書かない）")
    a = ap.parse_args()

    if a.canned:
        if a.apply:
            logger.error("--from と --apply は一緒に使えません（読むだけです）")
            return 1
        gh = Canned(a.canned)
        st = read_state(gh)
        say(st)
        run(gh, st, apply=False)
        print()
        print(body(st))
        return 0

    # **`--apply` で分かれるのは「書くか」だけ。** 読みには毎回行く
    return act(a.apply)


if __name__ == "__main__":
    sys.exit(main())
