"""**毎晩の焼き直しが新しくなっていないこと**を、GitHub issue 1本に映し続ける。

    python python/bake_down.py            # いまどうなっているかを出すだけ
    python python/bake_down.py --apply    # issue を開ける／書き換える／閉じる

## なぜ要るか

2026-09-16、定時の焼き直し（`rebake.yml`）が **TypeError で2秒で落ちた**。
焼き直しは1本目で止まるので、residents も stream_peaks も on_this_day も
city_streams も回らず、**島の数字が丸ごと1日止まった**（`docs/island-misses.md` #105）。
同じ理由でその日のうちにもう1回落ちた。

**そのあいだ issue は1本も立っていない。** 直近30本の run のうち赤はその2本だけで、
対応する issue は0件。見つかったのは、こちらがたまたま Actions を見に行ったからで、
**仕組みではなかった。**

`ingest_down.yml` の頭に、もう答えが書いてある:

> 赤は Actions の一覧の中にしか出ないうえ、**「起きたこと」であって
> 「いま残っていること」ではない。** 次の晩に緑が積まれれば下へ流れていく。
> だから赤を強くするのではなく、**いまの状態そのものを、人が毎日見る場所
> （issue の一覧）に置く。**

取り込み（Doneru）にはその見張りが在るのに、**焼き直しには無かった。**
今日の件は、まさにそのコメントが書いているとおりの消え方をした。
形は `python/donor_calls.py` と `python/ingest_down.py` に合わせる。新しい流儀は作らない。

## 見るのは「いまの状態」だけ

読むのは **`rebake.yml` の、いちばん新しい完了した run 1本。**
前の晩の結果を持ち回らない。持ち回りが1回ずれただけで「直ったのに開いたまま」
「落ちているのに閉じたまま」になる。**毎回いまの run を読み直して、そこへ合わせる。**

**数えるのは無人で走ったぶんだけ**（`schedule` と `workflow_run`）。手で押した run を
混ぜない。理由は2つあって、どちらもこの仕組みの目的そのもの:

- 手で押した run は**押した人がその場で見ている。** 見ている赤を issue にしても、
  気づかないことは1つも減らない
- 手押しの既定は `dry_run: true` で、**通っても1バイトも master に入らない。**
  「新しくなった」の証拠にならないものを緑として読むと、止まっているのに閉じる

**ただし、赤いあとで人が手で押して通していたら、その朝は判断を保留する。**
手押しでも `焼く` も `凍っていないか` も同じように通るので、**そこが緑なら
焼くのはもう直っている。** それを無視して issue を立てると、直した直後に
「止まっています」と言うことになる（2026-09-16 の本番がまさにこの形で、
05:34 と 08:33 が赤、そのあと 08:37 に手で押して緑だった）。

保留は**開きも閉じもしない**ので、既に開いている issue は開いたまま残る。
**黙り続けることはない。** 手押しが緑なら次の無人の1回も緑になるはずで、
ならなければその1回で開く。判断を1晩ぶん先送りするだけ。

## 「新しくなっていない」の合図は2つ。**直し方が違うので、本文で書き分ける**

`rebake.yml` は2通りで赤くなる。視聴者さんから見ればどちらも「島の数字が古い」の
1つなので、**issue は同じ1本**を使う。

| 合図 | どういう赤か | 直し方 |
| --- | --- | --- |
| **焼くのが落ちた** | 途中で止まった（今日の TypeError） | 赤い step を開いて直す |
| **凍っていた** | 焼けたが、中身が何日も動いていない | 上流か、引いている先を疑う |

**どちらかは、自分では判定しない。** 何が正常かは `docs/island-fresh.md` と
`rebake.yml` の step「凍っていないか」が既に決めている。ここがもう一度書くと、
しきい値が2か所になって、片方を直し忘れた日に食い違う。
だから見るのは**「凍っていたら赤くする」という step が落ちたかどうか**だけ。
あちらの判定に乗る。

## 分からない晩は、開きも閉じもしない

run が1本も見つからない・`cancelled` で終わっている——これは
**「読めていない」であって「止まっている」ではない**（`docs/island-standards.md` 10章）。

`ingest_down.py` は「分からない＝落ちていない」に倒しているが、**ここはもう一段黙る。**
あちらが読むのは毎晩必ず書き換わる札1枚で、読めないのは異常な晩だけ。
こちらが読むのは run の一覧で、**手で押したぶんしか無い日**は正常にありうる。
そこで「落ちていない」に倒すと、**開いている issue を「直った」と言って閉じる。**
直っていないものを閉じるのは、黙るより悪い。

## 本文に書くのは「あやとがこれから何をすればいいか」だけ

どちらの赤かと、どこを開くか。**仕組みの説明を書かない**
（`CLAUDE.md`「画面で、システムの仕様を説明しない」）。

**日付も run の番号も書かない。** 毎晩変わる字を入れると、状態が1つも動いていない晩に
本文だけが書き換わって、通知が積まれる。積まれると読まれなくなる。
「いつから」は issue 自身が持っている（GitHub が「N日前に開きました」と出す）。

**視聴者さんの素性を1文字も書かない。** issue も Actions のログも公開。
出してよいのは日付・件数・ファイル名・ワークフロー名だけ。ここが扱うのは
ワークフローと step の名前しかないので、**そもそも素性が手元に来ない。**

## 既定は書かない。**でも、読みには毎回行く**

`--apply` を付けたときだけ GitHub に**書く**。付けなければ1バイトも書かない。

**読むほうは、`--apply` が無くても毎回1回通す。** 焼き直しが通っている朝が
何か月も続けば、書く道は一度も通らない。そのあいだに資格が切れても、
権限（`actions: read` / `issues: write`）が外れても、ラベルの引き方が間違っていても、
**はじめて本当に要る朝まで気づけない**（`python/ingest_down.py` と同じ理由）。

## 赤くしない

**焼き直しが止まっていても 0 で終わる。** 赤で知らせるのをやめるために作ったものが、
自分で赤を積んだら元に戻る。止まっていることは issue に出ている。

**ただし「届かない」は別の話で、そこは 1 で落ちる。**
run が読めない・GitHub に届かない・権限が無いは、**この仕組みそのものが動いていない**
ということなので、黙って 0 で終わると issue が古いまま誰も気づかない。
*止まっている*は赤くしない。*届かない*は赤くする。
"""

import argparse
import logging
import sys
from datetime import datetime, timezone

sys.path.insert(0, __file__.rsplit("/", 1)[0])

# **作法は `python/run_watch.py` と共有する。** あちらに「どの run を見るか」
# 「分からない朝は開きも閉じもしない」「立て直さずに書き換える」が置いてある。
# 同じものを写して持つと、**片方だけ直した日に黙って食い違う**
# （`python/ship_down.py` が同じ土台に乗っている）。
# ここが持つのは**焼き直しに固有のところ**——どの step が何を意味するか、と本文。
#
# `find_issue` は `donor_calls.py` のものが `run_watch` ごしに来る。
# ここが `donor_calls` と違う探し方をすると、黙って二重に issue が立つ。
import run_watch  # noqa: E402
from run_watch import (  # noqa: E402,F401
    GREEN,
    PLAN,
    RED,
    decide,
    find_issue,
    quiet_days,
)

# **待ちの相手の札。** 焼き直しの赤は**こちらで直せる**ので、
# あやとへのメンションは入れない（毎晩鳴るものに毎晩メンションすると、
# そのうち誰も読まなくなる。`python/ticket_labels.py` の表）
from ticket_labels import WAIT_STYLE, WAIT_US  # noqa: E402

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)

# 見張る相手。**ファイル名で引く。** 表示名（`name:`）は人が読みやすく変えるもので、
# 変えた日に黙って別のワークフローを見にいく／0件になる。
# ファイル名なら、消えたときは 404 で赤くなる
WORKFLOW_FILE = "rebake.yml"

# 焼き直しが**凍りで**赤くなったときに落ちる step の名前（`rebake.yml`）。
# **凍っているかどうかの判定は、あちらが持っている。** ここはその結果に乗るだけ。
# あちらの step 名を変えるとここが外れるので、`bake_down_selftest.py` が
# 「この名前の step が `rebake.yml` に実在するか」を毎回見ている
FROZEN_STEP = "凍っていたら赤くする"

# **「古い」は「落ちた」ではない。** 焼き直しはちゃんと通っていて、
# 人しか新しくできない焼き込みが置いていかれているだけ。直す先が
# まるで違う（ワークフローを見に行っても何も落ちていない）ので、
# 仕分けを分ける。ここを足さなかった数時間は「焼くのが落ちた」の
# issue が立つ形だった
STALE_STEP = "焼き込みが古くなっていないか"

# **出したあとに鳴る見張り。** ここが赤いのは「焼き直しが落ちた」ではない。
# 焼き直しは通り、master にも入り、本番にも配り終わったあとで、別のことを
# 見に行った見張りが1本鳴っている。
#
# 分けないと、issue の見出しが「島の数字が焼き直せていません。島に出ている数は
# きのうのままです」になる。**数はちゃんと新しくなっているのに。**
# あやとは run を開いて、落ちていない焼き直しを探すことになる。
#
# **名前が変わったら気づけるように、`bake_down_selftest.py` が
# 「この名前の step が `rebake.yml` に実在するか」を毎回見ている。**
# 実在しなくなった名前は、ここに書いてあっても一生当たらない（＝黙って
# 「焼くのが落ちた」に戻る）ので、赤くして気づく
WATCH_STEPS = (
    "ショートの棚を取り直せたか",
    "ショートの一覧に届いたか",
    "分かち合う絵を撮り直せたか",
    "セリフの届いていない人がいないか",
    "取り込みが詰まっていないか",
    # 島が名指ししている配信が1本押せなくなった、という赤。
    # **焼き直しは通っている**——測るほうは `continue-on-error` で回していて、
    # ここは配り終わったうしろに立てる印だけ。仕分けを分けないと
    # 「島の数字が焼き直せていません。島に出ている数はきのうのままです」の
    # issue が立つ。**数はちゃんと新しくなっているのに**
    "押しても見られない配信が増えたか",
    # 住人の絵の大きさを測り直せなかった、という赤。**ここが1本抜けていた**
    # （2026-09-23 22:39 の run がこれで落ちて、`#511` に「島に出ている数は
    # きのうのままです」と出た。**その回は 22:50:57 に master へ入り、
    # 22:51:01 に配り終わっている**）。同じ形の抜けがもう出ないように、
    # `bake_down_selftest.py` が**配りのうしろの step を全部数えて**、
    # この表と付き合わせる（`island-misses.md` #187）
    "絵の大きさを測り直せたか",
)

# **配りのうしろに在るが、赤くならない step。** 見張りではないので、
# ここに名前を置いて「数え落としではない」と言えるようにしておく。
# `bake_down_selftest.py` が「配りのうしろの step は、`WATCH_STEPS` か
# `FROZEN_STEP` か `STALE_STEP` か、この表のどれか」を両側から見る
AFTER_DEPLOY_NOT_RED = (
    "配っていないときの案内",           # dry_run / deploy off のときの案内
    "落ちたときに、どこで落ちたかを残す",  # `if: failure()` の記録係
)

# **master に入る手前で回る判定器（自己テスト）。** ここが赤いのは
# **「島のデータが古い」ではない**——判定するほうが落ちていて、焼いたものは
# 1バイトも commit されずに止まっている。**7本は焼く前、3本（site のもの）は
# 焼いたあと・commit の前**で、どちらも「この回のぶんが入らない」という点で同じ。
#
# 分けないと、issue の見出しが「島の数字が焼き直せていません。島に出ている数は
# きのうのままです」になる。**データは1バイトも古くなっていないのに**、
# あやとは焼き直しのログを探しに行くことになる（`#511` が2日そうだった）。
#
# **手で並べた一覧ではない。** `bake_down_selftest.py` が `rebake.yml` を読んで、
# **配りより前で `*_selftest` を行の頭から起こしている step** を数え、この表と
# 両側から突き合わせる。片側だけだと、step を1本足した日に黙って外れる
SELFTEST_STEPS = (
    "またいだ呼び出しが合っているか",
    "詰まりの見張りが効くか",
    "焼いた並びが毎回同じか",
    "やせを止める関所が効くか",
    "島を歩く人の選びかたが変わっていないか",
    "焼き込みが古くなっていないかの見張りが効くか",
    "押しても見られない配信の見張りが効くか",
    "表紙の島が、投げ銭と出席の両方を見て人を選んでいるか",
    "えらばれかたの式が、決めたとおりか",
    "コメントが読めなかったとき、黙って飲み込んでいないか",
)

# **この係にとっての「無人」。** `workflow_dispatch` は手で押したぶんで、
# 既定が `dry_run: true` なので、通っても master には1バイトも入らない。
#
# **ここは係ごとに違う。** 配りの見張り（`ship_down.py`）が起こされるのは
# 焼き直しの最後の `gh workflow run` なので、あちらは毎晩の1回も
# `workflow_dispatch` で走る。だから `run_watch` は判定を持たずに受け取る
UNATTENDED = ("schedule", "workflow_run")


def unattended(r: dict) -> bool:
    """その run に、押した人がいなかったか。"""
    return r.get("event") in UNATTENDED


# 焼き直しが何日走っていなかったら、**ログに1行**書くか。
# **issue にはしない。** 走っていないのは「落ちた」とも「凍った」とも違うし、
# この係自身が焼き直しの完了に繋いである以上、走っていない朝はこちらも
# 起きていないことがある。狼少年にする前に、まずログで様子を見る
QUIET_DAYS = 3

# 本文に埋める見えない印。GitHub は HTML コメントを描かないので、
# 読む人には見えないまま、こちらからは確実に引ける。
# **タイトルでは探さない**（人が読みやすく書き換える）
MARK = "<!-- bake-down -->"

# 固定のラベル。印と両方で引く。片方だけだと、人がラベルを外した朝に
# もう1本増える／issue を全部なめることになる
LABEL = "bake-down"

# タイトルは**作るときだけ**入れて、あとは触らない。
# どちらの赤かは本文が持つ（タイトルに入れると、落ちた↔凍ったで毎回書き換わって、
# 書き換えた人と綱引きになる）
TITLE = "島の数字が、新しくなっていません"


def pick_run(runs: list):
    """**無人で走った、いちばん新しい完了した run** を1本選ぶ（`run_watch`）。"""
    return run_watch.pick_run(runs, unattended)


def fixed_by_hand(runs: list, run) -> bool:
    """**その run のあとに、人が手で押して通しているか**（`run_watch`）。

    手押しでも `焼く` も `凍っていないか` も同じように通るので、**そこが緑なら
    焼くのはもう直っている。** 無視して issue を立てると、直した直後に
    「止まっています」と言うことになる。
    """
    return run_watch.fixed_by_hand(runs, run, unattended)


def why_red(steps: list) -> dict:
    """赤い run が、**どちらの理由で赤いか**を決める。

    **凍っているかどうかは、ここでは判定しない。** `rebake.yml` の
    「凍っていないか」が既に決めていて、その結果が step
    「凍っていたら赤くする」の成否に出ている。ここはそれを読むだけ。

    Args:
        steps: その run の step（`{"name": ..., "conclusion": ...}` の並び）

    Returns:
        {"why": "frozen" / "stale" / "watch" / "selftest" / "broken",
         "step": 落ちた step の名前か None}
    """
    failed = [s for s in (steps or []) if s.get("conclusion") in RED]
    # **1本の run で両方落ちることがある。** そのときは「焼くのが落ちた」に
    # 寄せない——どちらも「焼き直しそのものは動いている」側なので、
    # 先に書いてあるほう（凍り）を採る
    for s in failed:
        if s.get("name") == FROZEN_STEP:
            return {"why": "frozen", "step": FROZEN_STEP}
    for s in failed:
        if s.get("name") == STALE_STEP:
            return {"why": "stale", "step": STALE_STEP}
    # **焼き直しそのものが落ちているなら、そちらが先。** 見張りも一緒に
    # 鳴っている晩に「見張りが鳴っています」とだけ言うと、**落ちた焼き直しが
    # 見出しから消える。** 出したあとの見張り以外に落ちたものがあるかを先に見る
    hard = [s for s in failed
            if s.get("name") not in WATCH_STEPS
            and s.get("name") not in SELFTEST_STEPS
            and s.get("name") not in (FROZEN_STEP, STALE_STEP)]
    if not hard:
        # **自己テストを、出したあとの見張りより先に見る。** 自己テストが
        # 落ちた回は焼く手前で止まっているので、配り終わったあとに鳴る
        # 見張りより、そちらのほうが起きていることとして大きい。
        # 2026-09-24 05:46 の run が実際に両方落ちていた（step 13 と step 43）
        for s in failed:
            if s.get("name") in SELFTEST_STEPS:
                return {"why": "selftest", "step": s.get("name")}
        for s in failed:
            if s.get("name") in WATCH_STEPS:
                return {"why": "watch", "step": s.get("name")}
    # 落ちた step が読めなくても、**赤いことは分かっている。**
    # 名前が無いぶん本文は薄くなるが、黙るよりずっといい
    return {"why": "broken",
            "step": (hard[0]["name"] if hard
                     else failed[0]["name"] if failed else None)}


def assess(run, steps, by_hand: bool = False) -> dict:
    """**いま焼き直しが新しくなっているか**を決める。外を触らない素の関数。

    ここが全部:

    | run | どう見るか |
    | --- | --- |
    | 緑 | **新しくなっている** |
    | 赤 + step「凍っていたら赤くする」が落ちた | **凍っている** |
    | 赤 + 焼く前の自己テストだけが落ちた | **判定器が落ちた**（データは古くない） |
    | 赤 + それ以外 | **焼くのが落ちた** |
    | 赤 + **そのあと手で押して通っている** | **分からない**（1晩ぶん保留） |
    | `cancelled` など、どちらとも言えない | **分からない**（開きも閉じもしない） |
    | 無人の run が1本も無い | **分からない** |

    Args:
        run: `pick_run()` が選んだ1本か None
        steps: その run の step の並び（読めなければ None でよい）
        by_hand: `fixed_by_hand()` の返り値

    Returns:
        {"down": True/False/None,
         "why": "frozen"/"stale"/"watch"/"selftest"/"broken"/"byhand"/None,
         "step": 落ちた step か None, "at": run の始まった時刻か None}
    """
    if not run:
        return {"down": None, "why": None, "step": None, "at": None}

    at = run.get("run_started_at") or run.get("created_at")
    end = run.get("conclusion")

    if end in GREEN:
        return {"down": False, "why": None, "step": None, "at": at}
    if end in RED:
        if by_hand:
            # 赤いが、**そのあと人が手で押して通っている。**
            # 焼くのはもう直っているので、次の無人の1回まで判断を保留する
            return {"down": None, "why": "byhand", "step": None, "at": at}
        return {"down": True, "at": at, **why_red(steps)}
    # `cancelled` / `neutral` / まだ結論が付いていない。
    # **どちらとも言わない**（開いている issue を「直った」と言って閉じない）
    return {"down": None, "why": None, "step": None, "at": at}


def body(a: dict) -> str:
    """issue の本文。**あやとがこれから何をすればいいかだけ。**

    どこを見て決めているか・どの run を読んだかは書かない。中の話なので、
    読む人には要らない。**日付も run の番号も入れない**（毎晩変わる字を入れると、
    状態が動いていない朝に本文だけが書き換わる）。

    Args:
        a: `assess()` の返り値

    Returns:
        本文。頭に見えない印が入る
    """
    if a["why"] == "stale":
        head = [
            "焼き直しは通っていますが、**人しか新しくできない焼き込みが"
            "置いていかれています。**",
            "",
            "**ワークフローは壊れていません。** どれがどれだけ古いかは、"
            "`島の数字を焼き直す` のいちばん新しい run の"
            "「焼き込みが古くなっていないか」の表に出ています。",
            "",
            "新しくするのは `/island-fresh`。料理・他己紹介・歩いた国は"
            "**配信を見ないと決まらない**ので、機械では埋まりません。",
        ]
    elif a["why"] == "watch":
        head = [
            "焼き直しは通っていて、**島に出ている数は新しくなっています。"
            "本番にも配り終わっています。**",
            "",
            f"鳴っているのは、そのあとの見張り **{a['step']}** です。",
            "",
            "`島の数字を焼き直す` のいちばん新しい run を開いて、その step の"
            "出している数を見てください。**焼き直しを押し直す必要はありません。**",
        ]
    elif a["why"] == "selftest":
        head = [
            "焼き直しは、**master に入る手前で止まりました。** 落ちたのは "
            f"**{a['step']}** ——見張りが効くかを見る自己テストです。",
            "",
            "**島のデータが古いのではなく、判定するほうが落ちています。** "
            "前の回までに焼けたぶんは、master にも本番にも入っています。",
            "",
            "`島の数字を焼き直す` のいちばん新しい run を開いて、その step の "
            "`::error::` の行を見てください。直せば次の回でひとりでに焼けます。",
        ]
    elif a["why"] == "frozen":
        head = [
            "焼き直しは通っていますが、**中身が動かなくなっている焼き込みがあります。**"
            "島に出ている数が、実際より古いままです。",
            "",
            "止まっているものは、`島の数字を焼き直す` のいちばん新しい run の"
            "「凍っていないか」の表に出ています。",
            "",
            "いちばん多いのは、そのスクリプトが本番を引かずに "
            "`python/data/*.json` の取り置きを焼き直している形です。",
        ]
    else:
        # **落ちた step の名前は出す。** ワークフローの中の名前なので公開してよく、
        # これがあるだけで開く前に見当が付く。無い朝は行ごと落とす
        where = (f"落ちたのは **{a['step']}** のところです。" if a["step"]
                 else "どこで落ちたかは、run を開くと出ています。")
        head = [
            "島の数字が焼き直せていません。**島に出ている数はきのうのままです。**",
            "",
            where,
            "",
            "`島の数字を焼き直す` のいちばん新しい run を開いて、赤い step を"
            "見てください。直したら `島の数字を焼き直す` を dry_run のまま押して、"
            "通ることを見てから dry_run を off にして押し直します。",
        ]

    return "\n".join([MARK, ""] + head + [
        "",
        "次の朝の焼き直しが通れば、この issue はひとりでに閉じます。",
    ]) + "\n"


class Gh(run_watch.Gh):
    """GitHub を触る口。**中身は `run_watch.Gh`。ここが持つのはラベルの色だけ。**

    `donor_calls.Gh` を借りないのは、あちらの `create()` があちらのラベルの色と
    説明を書き込むから。借りると**こちらのラベルが別の見た目で作られて、
    一覧で見分けが付かなくなる。** 色だけを上書きすれば、叩く口は共有できる。

    `Gh(repo, token)` の形を変えないこと。**確かめが `Gh` ごと偽物に
    差し替えている**（`bake_down_selftest.py` の `act()`）。
    """

    # `donor-calls`（d93f0b）と `ingest-down`（b60205）が既に居るので、
    # **赤系を避ける。** 一覧を眺めたときに「これは焼き直しのほう」と色で分かるように
    LABEL_COLOR = "5319e7"
    LABEL_DESC = "島の焼き込みが新しくなっていない"

    # **待ちの札も一緒に付ける。** 付いていないと毎週の棚卸し
    # （`python/ticket_stock.py`）が「札が無い」に数える。
    # **ここはあやと待ちではない**——焼き直しの赤はこちらで直せる。
    # 札を作って付けるところは `run_watch.Gh` が持っている（配りの見張りと同じ形）
    WAIT = WAIT_US
    STYLE = WAIT_STYLE


def read_state(gh) -> dict:
    """**いまの焼き直し**を読む。ここだけが run を取りにいく。

    step まで取りにいくのは**赤い run のときだけ。** 通っている朝に
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
                       "止まっているとは見なしません")
        return assess(None, None)

    logger.info("いちばん新しい無人の run は #%s（%s で始まり、%s で終わった）",
                run.get("run_number"), run.get("event"), run.get("conclusion"))

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
    焼き直しが通っている朝のあいだ GitHub への道が一度も試されず、
    **本当に要る朝に落ちる**（docstring の「既定は書かない」）。

    読めなかったときは**投げ返す。** ここで握りつぶすと、届かないことが
    「何もしなくてよかった」と見分けが付かなくなる。赤くするのは呼ぶ側。

    Args:
        gh: `Gh` か、同じ口を持つ偽物
        a: `assess()` の返り値
        apply: 本当に書くか

    Returns:
        {"action": ..., "planned": ..., "number": issue 番号か None}
        `action` は実際にしたこと（書かなかったときは `"dry"`）
    """
    # **ここは `apply` の有無にかかわらず通る。** 毎朝のログに
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

    # **書くところは `run_watch` と共有する。** 立て直さない・タイトルは作るときだけ、
    # という作法をここで持ち直すと、配りの見張りと食い違う
    return run_watch.apply_plan(gh, what, issue, TITLE, want, LABEL, log=logger)


def act(apply: bool) -> int:
    """GitHub に当たって、**終了コードを返す。**

    run を読むのも issue を読むのも同じ資格（`GITHUB_TOKEN`）なので、
    **読むところは `--apply` の有無にかかわらず両方通る。**

    届かなかったら 1。ここは「焼き直しが止まっているかどうか」とは別の話で、
    読めない＝**この仕組みが動いていない**ということ。黙って 0 で終わると、
    issue がいまの状態と食い違ったまま誰も気づかない。

    Args:
        apply: 本当に書くか

    Returns:
        終了コード（0 か 1）
    """
    def once(gh):
        a = read_state(gh)
        say(a)
        run(gh, a, apply=apply)

    # `Gh` を名前で解決するのは、**確かめがここを偽物に差し替えるから**
    return run_watch.act(once, WORKFLOW_FILE,
                         lambda repo, token: Gh(repo, token), log=logger)


def say(a: dict) -> None:
    """見立てを1行にして出す。**走っていない朝は、そこも1行足す。**"""
    logger.info("いま焼き直しは%s（%s）",
                {True: "止まっています", False: "通っています"}
                .get(a["down"], "どうなっているか分かりません"),
                {"frozen": "凍っている", "stale": "焼き込みが古い",
                 "watch": "出したあとの見張りが鳴っている",
                 "broken": "焼くのが落ちた",
                 "byhand": "赤いが、そのあと手で押して通っているので保留"}
                .get(a["why"], "-"))

    d = quiet_days(a["at"], datetime.now(timezone.utc))
    if d is not None and d >= QUIET_DAYS:
        # **issue にはしない**（`QUIET_DAYS` の理由）。繋ぎが黙って切れた形が
        # これなので、ログに1行だけ残す
        logger.warning("無人の焼き直しが %.1f日 走っていません。"
                       "繋ぎ（workflow_run）が切れていないか見てください", d)


def main() -> int:
    """エントリポイント。**止まっていても赤くしない**（届かないときだけ赤い）。"""
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true",
                    help="issue を実際に開く／書き換える／閉じる")
    a = ap.parse_args()

    # **`--apply` で分かれるのは「書くか」だけ。** 読みには毎回行く
    return act(a.apply)


if __name__ == "__main__":
    sys.exit(main())
