"""**円に直せなかった投げ銭が台帳に残っているあいだ、issue を1本だけ開く。**

    python3 python/fx_tips_watch.py            # 数えて、何をするつもりかを出す
    python3 python/fx_tips_watch.py --apply    # issue を開ける／書き換える／閉じる

終了コード **0=数えて issue を合わせた（直せていないものが在っても 0）/
1=GitHub に届かなかった / 2=台帳を読めなかった（判定していない）**
（`docs/island-standards.md` §15）。

## なぜ要るか（2026-10-18。#951）

円以外の投げ銭は、**その日のレートで円に直してから足す**ようになった
（あやとの決め。`docs/island-money.md`）。直すのは取り込みのとき1回きりで
（`python/island_tips.py` の `yen_of`）、引く先は
`https://api.frankfurter.dev`（`python/fx_rate.py`）。

**直せないことがある。**

| 何が | どうなる |
| --- | --- |
| 台湾ドル（TWD / NT$） | この口が持っていない。**いつ引いても直らない** |
| 口が落ちている晩 | その晩の取り込みでは直らない（翌晩には直る） |
| 返事の形が違う | 同上 |
| 換算を入れる前に入った行 | 埋め直すまで直らない（`python/admin/fx_backfill.py`） |

**直せなかったぶんは足さない。0 にもしない**（`docs/island-standards.md` 10）。
足さないということは、**その人の貢献額がそのぶん足りない**ということで、
島の順位でも貯金箱でも月末のふりかえりでも足りないまま出る。

`build_residents.py` は「**N件は円に直せていない**」と毎晩ログに出すが、
**あのログは誰も見に行かない。画面にも出ない。**
2026-10-18 まで、外貨そのものを2年近く黙って落としていたのが同じ形
（`docs/island-misses.md` #290）。だからここでやるのは1つ——
**直せていないものが残っているあいだ、issue を開けておく。**

## 窓を置かない。**台帳ぜんぶを見る**

前は直近90日（島が順位を数えている窓）で切っていた。**いまは切らない。**

円に直せなかった行は、**その月のふりかえりから永久に抜け続ける。**
90日で切ると、1月のスパチャが直っていないことを3月以降だれも知らない——
なのに `/months` の1月のページには、その人が足りないまま出ている。
**残っているかぎり残っている問題**なので、窓では消さない。

**直れば、ひとりでに閉じる。** 埋め直し（`python/admin/fx_backfill.py`）か
翌晩の取り込みで `amountJpy` が入れば、次の晩に 0件 になって閉じる。

## 本文に書くもの / 書かないもの

**件数・通貨・理由・日付まで。** チャンネルID・名前・どねID・1件ずつの額は
1文字も書かない。issue は公開で、誰でも読める（`python/logsafe.py`）。
**そもそも `survey()` が持ち帰らない**ので、出しようがない。

## 待ちの札は `待ち-システム`

**直しかたはこちらが持っている**（埋め直すか、TWD をどうするかを決める）。
`待ち-あやと` は付けない——あやとに決めてもらうことが残っているなら、
それは `#951` のような別の1本にする（`docs/island-tickets.md` 1章
「迷ったら `待ち-システム`」）。**メンションも入れない。**

## 赤くしない

**直っていないものが何件在っても 0 で終わる。** 赤で知らせるのをやめるために
作ったものが、自分で赤を積んだら元に戻る。落ちるのは
「GitHub に届かない」（1）と「**台帳が読めない**」（2）だけ——
どちらも**この仕組みそのものが動いていない**ほう。
"""

import argparse
import logging
import os
import sys

sys.path.insert(0, __file__.rsplit("/", 1)[0])

# **`run_watch` より先に読む。** あちらは取り込まれた時点で `BQ_PROJECT_ID` に
# 仮の値を置く（GitHub しか読まない係のための逃がし）。あとから読むと、
# 本物の代わりに仮の名前で Firestore を引いて、**「台帳が読めない」に化ける。**
PROJECT = os.environ.get("BQ_PROJECT_ID", "")

# **通貨の読み方も、置き場も、島から借りる。** 取りこぼしているのは
# あちらなので、2か所に書くと片方だけ動いた日に食い違う
from build_residents import MAIN_CURRENCY, TIPS  # noqa: E402

# **足してよい円の取り出しも、島と同じ1本。** ここが「直っている／いない」を
# 決めるので、別の読み方を作ると issue と島の数が食い違う
import fx_rate  # noqa: E402

# **作法は `python/run_watch.py` と共有する。** あちらに「分からない朝は
# 開きも閉じもしない」「立て直さずに同じ1本を書き換える」「題は作るときだけ」が
# 置いてある。写して持つと、**片方だけ直した日に黙って食い違う。**
import run_watch  # noqa: E402
from run_watch import PLAN, decide, find_issue  # noqa: E402,F401
from ticket_labels import WAIT_STYLE, WAIT_US  # noqa: E402

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)

# この係が住んでいるワークフロー。**ログと、繋がっているかの確かめに使う**
WORKFLOW_FILE = "fx_tips_watch.yml"

# **同じ1本を引くための、見えない印。** 題では引かない（人が書き換える）
MARK = "<!-- fx-tips -->"

# 一覧で色分けするための札
LABEL = "fx-tips"

# 題は**作るときだけ**送る（`run_watch.apply_plan`）
TITLE = "円に直せなかった投げ銭が、貢献額に足されていません"

# 円に直すと決めた issue。**本文から必ず指す**ので、読んだ人が
# 「どういう決めで直しているのか」を辿れる
ASK = 951

# 埋め直す道具。**本文に必ず書く。** issue が「困っている」とだけ言って
# 直しかたを言わないと、読んだ人がまた自力で探すことになる（#290 の決めごと4）
FIX = "python/admin/fx_backfill.py"


def currency_of(doc) -> str:
    """台帳の1行から通貨コードを読む。**島と同じ読み方。**

    空と `None` は円として読む（Doneru は本番で全件 NULL＝円）。
    大文字に揃えるのも島と同じ——揃えないと `jpy` が外貨に化ける。
    読み方が食い違うと、**島が落としている行とここが数える行がずれる。**

    Args:
        doc: 台帳（`islandTips`）の1行

    Returns:
        `JPY` `CAD` のような通貨コード
    """
    return str((doc or {}).get("currency") or MAIN_CURRENCY).upper()


def survey(rows) -> dict:
    """台帳の行から、**直せていない件数と理由と日付だけ**を数える。

    **額もチャンネルIDも名前も、1つも持ち帰らない。** 持ち帰ると、
    本文やログに出す枝がいつか生える（`python/donor_calls.py` と同じ考え方）。

    **窓で切らない。** 直せていない行は、その月のふりかえりから永久に
    抜け続ける（docstring の「窓を置かない」）。

    Args:
        rows: 台帳の行（辞書）の並び

    Returns:
        {"rows": 見た件数, "fx": 円以外の件数, "stuck": **直せていない**件数,
         "by": {(通貨, 理由): 件数}, "last": いちばん新しい日,
         "down": 直せていないものが在るか}
    """
    seen = 0
    fx = 0
    stuck = 0
    by: dict = {}
    last = None
    for doc in rows or []:
        seen += 1
        cur = currency_of(doc)
        if cur == MAIN_CURRENCY:
            continue
        fx += 1
        # **足す側と同じ1本で見る**（`python/fx_rate.py` の `row_yen`）。
        # 別の読み方を作ると、島が足している行を issue が「直っていない」と
        # 言う（逆も起きる）
        yen, why = fx_rate.row_yen(doc)
        if yen is not None:
            continue
        if why == "amount":
            # **額そのものが読めない行。** レートを引いても直らないので、
            # ここに数えると issue が永久に閉じない。島のほうも別に数えて
            # いる（`build_residents.fetch_tips` の `no_amount`）
            continue
        stuck += 1
        by[(cur, why)] = by.get((cur, why), 0) + 1
        day = str((doc or {}).get("day") or "")
        if day and (last is None or day > last):
            last = day
    return {"rows": seen, "fx": fx, "stuck": stuck, "by": by, "last": last,
            "down": stuck > 0}


def unknown() -> dict:
    """**読めなかった**ときの見立て。`survey()` と同じ形で、`down` だけ None。

    **0件と同じ顔にしない**（`docs/island-standards.md` 10・§15）。
    0件に倒すと、台帳が読めなかった朝に、開いている issue を
    「直った」と言って閉じる（`run_watch.decide()` の表）。
    """
    return {"rows": None, "fx": None, "stuck": None, "by": {}, "last": None,
            "down": None}


def read_ledger(db) -> list:
    """台帳（`islandTips`）を**全部**読む。**読むだけ。**

    **日付で絞らない。** 絞ると、絞った外に残っている直せていない行が
    「直った」に化けて、issue が閉じる（docstring の「窓を置かない」）。

    Args:
        db: Firestore のクライアント（偽物でもよい）

    Returns:
        1行ずつの辞書の並び。**額もチャンネルIDも、ここから先へ運ばない**
    """
    return [d.to_dict() or {} for d in db.collection(TIPS).stream()]


def look(db) -> dict:
    """台帳を読んで、数える。**読めなければ「分からない」。**

    Args:
        db: Firestore のクライアント（偽物でもよい）

    Returns:
        `survey()` の返り値
    """
    try:
        rows = read_ledger(db)
    except Exception as e:  # noqa: BLE001
        # 何で落ちたかは出すが、**中身は出さない**（ログは公開）
        logger.error("台帳（%s）を読めませんでした: %s", TIPS, str(e)[:200])
        return unknown()
    return survey(rows)


def body(a: dict) -> str:
    """issue の本文。**毎回まるごと組み直して、前と同じなら触らない。**

    `decide()` が本文の字で比べるので、**毎回変わる字を入れない。**
    窓の日付（`d0` / `d1`）は毎日動くので**入れない**——入れると毎晩
    「編集しました」が積まれて、本当に増えた晩が埋もれる。

    **人を指す字は1つも無い。** 件数と通貨コードと日付だけ
    （`python/logsafe.py`。この issue は公開）。

    Args:
        a: `look()` / `survey()` の返り値

    Returns:
        issue の本文。頭に見えない印が入る
    """
    rows = ["| 通貨 | 件数 | なぜ直せないか |", "| --- | ---: | --- |"]
    for (cur, why), n in sorted((a.get("by") or {}).items()):
        rows.append(f"| {cur} | {n} | {fx_rate.WHY.get(why, why)} |")
    return "\n".join([
        MARK,
        "",
        "**円に直せなかった投げ銭が、台帳に残っています。"
        "そのぶんは貢献額に1円も足されていません。**",
        "",
        f"直せていないのは **{a['stuck']}件**。"
        f"いちばん新しいのは **{a['last']}**。",
        "",
        *rows,
        "",
        "その人は、島の順位でも貯金箱でも月ごとのふりかえりでも、"
        "**そのぶん足りない額**で出ます。",
        "",
        "### 直しかた",
        "",
        f"1. 口が落ちていただけなら、`{FIX}` を `{{\"apply\": true}}` で流す",
        "2. その通貨をレートの口が持っていない（台湾ドルなど）なら、"
        f"どう足すかを決める（決めた経緯は #{ASK}）",
        "",
        "直って台帳に円が入れば、この issue はひとりでに閉じます。",
    ]) + "\n"


class Gh(run_watch.Gh):
    """GitHub を触る口。**中身は `run_watch.Gh`。ここが持つのは札の見た目だけ。**

    `Gh(repo, token)` の形を変えないこと。**確かめが `Gh` ごと偽物に
    差し替えている**（`fx_tips_watch_selftest.py`）。
    """

    # `bake-down` 5319e7 / `donor-calls` d93f0b / `ingest-down` b60205 /
    # `ship-down` 006b75 / `watch-down` 1d76db。**一覧で見分けられるように、
    # どれとも違う色**にする
    LABEL_COLOR = "d4c5f9"
    LABEL_DESC = "円に直せなかった投げ銭が、貢献額に足されていない"

    # **あやと待ちにしない。** 直しかたはこちらが持っている（docstring）
    WAIT = WAIT_US
    STYLE = WAIT_STYLE


def run(gh, a: dict, apply: bool = False) -> dict:
    """数えた結果に、issue を合わせる。

    **読むのは毎回。書くのは `apply` のときだけ。** `apply` でなくても
    `list_issues` は1回通す——通しておかないと、外貨の来ない何か月かのあいだ
    GitHub への道が一度も試されず、**本当に要る晩に落ちる**
    （`python/donor_calls.py` の「既定は書かない。でも、読みには毎回行く」）。

    Args:
        gh: `Gh` か、同じ口を持つ偽物
        a: `look()` の返り値
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

    # **分からない朝は本文を組まない。** 組んでも `decide()` は `noop` を
    # 返すが、`a["fx"]` が None のまま字にすると「None件」が残る
    want = body(a) if a["down"] else ""
    what = decide(issue, want, a["down"])

    if not apply:
        logger.info("--apply を付けていないので GitHub には書きません")
        logger.info("付けると: %s", PLAN[what])
        return {"action": "dry", "planned": what,
                "number": issue["number"] if issue else None}

    return run_watch.apply_plan(gh, what, issue, TITLE, want, LABEL, log=logger)


def say(a: dict) -> None:
    """見立てを1行にして出す。**件数と通貨と理由だけ。**"""
    if a["down"] is None:
        logger.info("台帳を読めていないので、issue は開きも閉じもしません")
        return
    logger.info("台帳 %d件 / 円以外 %d件（うち円に直せていない %d件）",
                a["rows"], a["fx"], a["stuck"])
    for (cur, why), n in sorted(a["by"].items()):
        logger.warning("  %s×%d：%s", cur, n, fx_rate.WHY.get(why, why))
    if a["stuck"]:
        logger.warning("  いちばん新しいのは %s。直すのは %s", a["last"], FIX)


def act(a: dict, apply: bool) -> int:
    """GitHub に当たって、**終了コードを返す。**

    *直せていないものが在る*は 0 のまま。*届かない*は 1、
    *台帳が読めない*は 2。

    **読めなかった朝も GitHub には当たる。** `decide()` が `noop` を返すので
    1バイトも書かないが、道が生きていることはその朝も確かめられる。
    """
    say(a)

    def once(gh):
        run(gh, a, apply=apply)

    rc = run_watch.act(once, WORKFLOW_FILE, lambda repo, token: Gh(repo, token),
                       log=logger)
    if rc:
        return rc
    return 2 if a["down"] is None else 0


def main() -> int:
    ap = argparse.ArgumentParser(
        description="円に直せなかった投げ銭が残っているあいだ、"
                    "issue を1本だけ開いておく")
    ap.add_argument("--apply", action="store_true",
                    help="issue を実際に開く／書き換える／閉じる")
    a = ap.parse_args()

    if not PROJECT:
        # **0件に倒さない。** 読めていないのだから、issue も触らない
        logger.error("BQ_PROJECT_ID が要ります（台帳を読む先）")
        return 2

    # **引数を読んでから取り込む。** import を先に置くと、`--help` まで
    # google-cloud-firestore の入っている箱でしか出せない
    from google.cloud import firestore

    return act(look(firestore.Client(project=PROJECT)), a.apply)


if __name__ == "__main__":
    sys.exit(main())
