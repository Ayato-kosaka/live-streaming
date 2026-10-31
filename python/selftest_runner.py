"""**見張り（`*_selftest.py`）をまとめて回して、落ちたものを並べる。**

    python3 python/selftest_runner.py              # 拾えるもの全部
    python3 python/selftest_runner.py --list       # 何を回すかだけ出す
    python3 python/selftest_runner.py --list --json  # 同じものを機械で読む形で
    python3 python/selftest_runner.py --only-drill # 対照だけ回して帰る
    python3 python/selftest_runner.py path/to/a_selftest.py …  # 指定のものだけ（1本ずつ）
    python3 python/selftest_runner.py --jobs 1     # 並べずに1本ずつ（既定は CI で CPU の数・手元で2本）

終了コード 0=ぜんぶ通った / 1=落ちたものがある /
**2=数えるものが無い**（`docs/island-standards.md` §15）。

## なぜ要るか

2026-09-18 まで、このリポジトリには **`pull_request` で走るワークフローが
1本も無かった。** 見張りは全部、毎晩の焼き直し（`rebake.yml`）などの中でしか
走っていない——つまり **master にマージして、本番に配ったあと。**

その日に実害が2つ出た。

1. `python/dead_stream_watch_selftest.py` が **master で赤いまま2日残った**
   （#520 が対照の前提を壊した）。どこからも走っていなかったので誰も気づかない
2. **その赤い見張りを抱えたまま #520 をマージして、本番に配った**

同じ日に棚卸ししたら、**どこからも走っていない見張りが12本**あった
（`python/admin/` の9本＋`public_ids` `text_expires_watch` `name_tail`）。
`python/admin/` の3本（`donors_import` / `firestore_delete` / `ip_purge`）は
**消す道具を守っている見張り**で、いちばん走っていてほしいものが走っていなかった。

## 拾い方は「全部拾って、外すものだけ名前で断る」

`SKIP` に名前が無いものは**黙って回る。** 逆（回すものを表に並べる）にすると、
**見張りを足した日に表へ書き足し忘れても赤くならない**——#125 で踏んだ
「書いたのに走らない」がそのまま戻ってくる。外す側を書かせれば、
足した人は何もしなくても繋がる。

外してよいのは「外に出る・鍵が要る・遅い」ものだけ。毎 PR で落ちる見張りを
混ぜると**赤が意味を失う**ので、そこは `SKIP` に理由ごと書く。

**拾うのは Python の `*_selftest.py` と、`site/selftest/` と
`functions/selftest/` と `tools/sprites/` の `*_selftest.mjs`。**
`site` の mjs 4本（`chatdown` / `chatter` / `folk` / `roster`）は
2026-09-18 まで `rebake.yml` の中でしか走っていなかった——つまり
**マージして配ったあと。** `functions` の6本（`cards_*` / `clean`）は
**どこからも走っていなかった**（同じ日に `python/watch_census_selftest.py`
で数えて出た。値段は `MJS_ROOTS` のところに測って書いてある）。

繋がなかった理由は「`site/node_modules` の `tsc` が要る。`npm ci`（site）は
Expo 丸ごとで重い」だったが、**その前提が2つとも違っていた。**

| 測ったこと | 実測（2026-09-18。この箱） |
| --- | --- |
| `site` の `npm ci` | **14秒 / 114 パッケージ**。`site/package.json` は next・react・firebase と型だけの別パッケージで、Expo は1つも入らない |
| リポジトリ直下の `npm install --no-save typescript` | **19〜34秒 / 1,452 パッケージ**。直下の `package.json` が Expo の側なので、**こちらが Expo 丸ごと**（CI では20秒） |
| mjs 4本を回す | 9秒（folk 2.2 / roster 3.3 / chatdown 1.9 / chatter 1.5） |

つまり **`site` のほうが軽い。** 重いと思っていたほうを既に毎回入れていた。

直下の `npm install` は**そのままにしてある。** `name_tail_selftest.py` が
求めているのは typescript **5系**で、それを決めているのが直下の
`package.json`（`^5.3.3`）だから。空の置き場に `npm install typescript` を
すると2秒で済むが、入るのは **7系**（別物の API）で、`ts.transpileModule` が
無く name_tail が 2 で落ちる。**実際に当てて確かめた。**
版を手で書いて逃がすと、`package.json` と2か所に版が散る。

mjs が要るもの（実測で切り分け）:

| | typescript だけ（直下） | + `site/node_modules/typescript` | + `@types/node` |
| --- | --- | --- | --- |
| `chatdown` | ○ | ○ | ○ |
| `folk` / `roster` | ✕（`site/node_modules/.bin/tsc` を名指し） | ○ | ○ |
| `chatter` | ✕ | ✕（`Cannot find type definition file for 'node'`） | ○ |

**`npm ci`（site）で3つとも入る。** 上2つだけを手で置く道もあるが、
置いたものと `site/package.json` がずれる形なので取らない。

## 対照（`docs/island-standards.md` §15）

**回し役そのものが落ちられるか**を、本物の見張りを1本も回す前に見る。
偽の見張りをこしらえて、

  - 通るものだけ（py と mjs を1本ずつ） → **0**
  - **py が1本落ちる** → **1**（しかも落ちた名前が出る）
  - **mjs が1本落ちる** → **1**（同上）
  - 1本も拾えない → **2**

を実測する。1つでも外れたら、本物の数字を1つも出さずに 2 で落ちる。

**py と mjs を別々に落とす**のは、回しかたが違うから（`python3` と `node`）。
片方だけ当てると、**mjs を起こす側が丸ごと壊れていても 0 が出る**——
「壊し方を4通り当てた」が同じ足を折っているだけ、と同じ形
（`docs/island-standards.md` §15 の決めごと「対照は、足の数だけ用意する」）。
「いつも緑の CI」は、何も守っていないのに守っている気にさせる——
それがいちばん高くつく。

## 並べて回す（2026-10-24）

見張りが増えるたびに伸びて、PR #1031 の run では全部回す step が **17分**
（job の上限 20分）になった。次に1本足すと上限に当たって取り消される。
手元で1本ずつ回すと **実 14分 / user+sys 14分**——4コアのうち1つしか
使っていなかった。だから**CI では既定で CPU の数だけ並べる**。手元の作業箱は
何人もが同時に使うので2本まで（`--jobs` か `SELFTEST_JOBS` で変えられる。
名指しで回すときは今までどおり1本ずつ）。

並べると、**同じものに書く2本が互いを壊す**（嘘の赤・嘘の緑）。
全部の見張りを1本ずつ strace にかけて、どこへ書くかを控えてから決めた。
**同じものに書く見張りは、同じ列（`LANES`）に入れて1本ずつ回す**:

  - `functions/selftest/` の見張りは、どれも `tsc` で `functions/lib/` へ
    書き出してから、その `lib` を読む。並べると、片方が書いている途中の
    `lib` をもう片方が読む
  - `characters_name_match` と `characters_why` は、**同じ名前の一時ファイル**
    （`RUNNER_TEMP` か `TMPDIR` の下の `_name_match_harness.cjs`）を書いて node に読ませる

列の外の見張りは、リポジトリの中へも `.git` へも1バイトも書かない
（`__pycache__` を除く。あれは書き出してから名前を付け替えるので、読む側が
半端なものを掴まない）。固定の名前の一時ファイルを2本が書き合う所も、
ポートを握る見張りも無い。
**新しく足す見張りがリポジトリの中や、固定の名前の一時ファイルへ書くなら、`LANES` に足すこと。**

**見張りの環境は1本ずつ回していたときと1文字も変えない**（例外は1つだけ。
下の「古い pyc を読まない」の `PYTHONPYCACHEPREFIX`）。はじめは
`TMPDIR` を1本ずつ別の部屋に差し替えて書き合いを避けたが、CI で
`mutation_drill_selftest.py` が嘘の赤を出した。あれは「同じ置き場で走っている
見張りを拾えるか」を、`mutation_drill.busy()` が**頭から90文字で切った命令の行**に
一時の道に置いた見張りの名前が見えるかで確かめている。CI の命令は87文字で
**3文字の余りで収まっていた**のが、部屋の道のぶん115文字に伸びて名前が切れた。
環境を変えると、どこかの見張りの前提が黙って外れる。並べるだけにする。

列は1本ずつしか進まないので、列そのものが壁時計になる。`functions/selftest/` の
列は 23本で、並べた手元の回で **425秒——全部回すのと同じ長さ**だった。1本 10秒が
ほぼ全部 `tsc` で、**23本が同じ src から同じ lib を1本ずつ作り直していた。**
だから見張りの側を `tsc -b` にした（src が lib より新しいときだけ書き出す。
src を変えれば作り直し、型の誤りでは今までどおり落ちる）。列は **72秒**になった。

対照も足した（下の `drill()`）。同じ列の2本が重ならないこと・**列の外の2本は
本当に重なること**（並べたつもりで1本ずつ回っていても、0 は出てしまうので）を、
偽の見張りで毎回測る。

## 古い pyc を読まない（2026-10-26）

この作業箱の `python/__pycache__/recipe_lag_watch.cpython-313.pyc` が、元ファイルと
中身で食い違っていた（178行目の `when > cut` が、バイトコードでは `when < cut`）。
Python が pyc を使うかどうかは**元ファイルの時刻（秒）と大きさ**しか見ない。
2026-10-23 に手で `>` を `<` にして見張りが落ちるのを確かめ、**同じ1秒のうちに戻した**ので、
記録は元と同じまま中身だけが書き換えたほうになり、3日のあいだ `recipe_lag_watch.py` は
「遅れ0件」と言いながら何も見ていなかった（見張りは 1 で落ちた。pyc を消すと 0）。
CI は毎回まっさらな取り出しなので当たらない。**手元の作業箱でだけ、見張りが黙って外れる。**
（`dead_stream_watch_selftest.py` は前に同じ穴を踏んで、自分の守る2本の pyc だけを頭で消している）

だから**子には、回ごとに空の pyc の置き場を渡す**（`PYTHONPYCACHEPREFIX`）。子も孫も
（環境を受け継ぐかぎり）置き場の `__pycache__` を読まず、ソースから作り直す。回の中では
1つの置き場を分け合う——回の中で見張りがリポジトリの `.py` を書き換えることは無い
（上の「列の外の見張りは、リポジトリの中へも1バイトも書かない」）ので、回の中では古くならない。
環境を作り直して孫を起こす見張り（`env={"PATH": …}` の形）の孫は守れないので、
**手で実物を書き換えて試したら、戻したあと `__pycache__` を消す**（CLAUDE.md）。

この環境の差は、命令の行にも `TMPDIR` にも出ない（上の `busy()` の 90文字の件は踏まない）。
速さは測った（2026-10-26。この箱で2本ずつ、177本）: 壁時計 455秒 → 450秒（揺れの内）、
CPU（user）12分12秒 → 12分29秒（+2%）。増えるのは、標準の部品と `google-cloud-*` を
回の中で1度コンパイルし直すぶん（`photos_selftest.py` 1本なら、空の置き場で 0.9秒 → 2.8〜3.9秒、
2本目からは 0.85秒）。子ごとに空にすると、この 2〜3秒を毎回払うので、回ごとにした。
`drill()` は下の対照のぶん 1.9秒 → 2.6秒。

対照は `drill()` にある。元と時刻・大きさが同じで中身だけ違う pyc を置いて回し、
元のとおりに判定されること。**守りだけを外した回し役**（`FRESH_PYC = False`）では、
同じ箱が毒の pyc のほうで判定されて赤くなること（毒が本物である証拠）。

## `BQ_PROJECT_ID` を置いていくのはなぜか

`python/config.py` は読み込まれた時点で `BQ_PROJECT_ID` が無いと投げる。
見張りは BigQuery のクライアントを全部偽物に差し替えてあるので、
**この値はどこにも届かない**（届く道が残っていたら、でたらめな名前で
落ちてほしい）。置かないと `python/backup/photos_selftest.py` が
「環境変数が無い」だけで赤くなり、手元と CI で結果が変わる。
"""

from __future__ import annotations

import argparse
import importlib.util
import json
import marshal
import os
import subprocess
import sys
import tempfile
import threading
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent          # python/
REPO = HERE.parent

# **mjs の見張りは、ここにしか無い。** 場所が変わったら黙って減るので、
# 下の「表が腐っていないか」で、無ければ数字を1つも出さずに 2 で落とす。
#
# `functions/selftest/` の6本は 2026-09-18 まで**どこからも走っていなかった**
# （`python/watch_census_selftest.py` を書いて、はじめて名指しで出た）。
# 守っているのは**公開の口から素性を落とすところ**——`GET /cards` の応答に
# チャンネルIDが残らないこと（`docs/island-incident-2026-09-14-cards.md`）。
# #126 の決めごと1「素性・鍵・お金が動くものは、繋ぐ理由を探すほうに倒す」。
#
# 値段は測った（2026-09-18）: `functions` の `npm ci` が **CI で 8秒**
# （この箱では 10秒 / 663 パッケージ）、6本で **CI で 65秒**
# （1本 10.8秒。この箱では 15秒。**中身ではなく、1本ずつ自分で `tsc` を
# 通すぶん**）。`CARDS_LIB_DIR` を渡せばその 10秒は消えるが、あれは
# 「壊した写しで回す」ための口なので、本物の `lib` を指させない
# `tools/sprites/` の `*_selftest.mjs` も拾う（2026-09-18 から。38本 → 39本）。
# いま在るのは `preclaim_selftest.mjs` 1本で、**焼いた HTML を読む道具
# （`preclaim.mjs`）の判定だけ**を見る。道具そのものは書き出しとブラウザが
# 要るので毎 PR では回せないが、腐るのは判定の側（正規表現は1文字直せば
# 黙って穴が開き、出るのは「0件」）。だから判定だけ切り出して繋ぐ。
# `tools/sprites/node_modules` は CI に入らないので、**`playwright-core` を
# import しないこと**が、ここに置ける条件（`preclaim.mjs` は回すときに初めて読む）。
# 値段は測った（2026-09-18。この箱）: **0.9秒**（子を8つ起こすぶんがほとんど）。
#
# **名前は MJS だが、`discover()` は py も拾う**（`tools/sprites/charbox_selftest.py` がそれで回っている）。
# `tools/shorts/` はショート動画の置き場（2026-10-15 から）。下の階（`ingest/` `render/` …）の
# 見張りは、ここに置けば書き足さずに繋がる（rglob で降りる）。
# 値段（何件・何秒）はここに書かない。守りを足すたびに増えて、書いた日から古くなる。
# 回したときに、この回し役の行（秒）に出る。
MJS_ROOTS = (
    REPO / "site" / "selftest",
    REPO / "functions" / "selftest",
    REPO / "tools" / "sprites",
    REPO / "tools" / "shorts",
    # EC2 を止める前の守り（stop_guard_selftest.py）。置き場が `.claude/` の下で、どこからも走っていなかった
    REPO / ".claude" / "skills" / "ec2-chrome",
)

# 1本にかける上限。止まった見張りは「落ちた」であって「待つもの」ではない
TIMEOUT_SEC = 300

# **子には、回ごとに空の pyc の置き場を渡す**（頭の「古い pyc を読まない」）。
# False にするのは `drill()` の対照だけ（守りを外すと毒の pyc が読まれることを見る）
FRESH_PYC = True

# **同じものに書く見張りの列。** 列の中は1本ずつ、列の外とは並べて回す。
# 列の名前 → （入る見張り, なぜ）。`/` で終わるものは道の頭で決める——その置き場に
# 見張りを足した人が、ここを書き足さなくても列に入るように。
# 列の外の見張りが同じものに書かないことは、2026-10-24 に全部を strace にかけて確かめた
LANES: dict[str, tuple[tuple[str, ...], str]] = {
    "functions/lib": (
        ("functions/selftest/",),
        "どれも tsc で functions/lib/ へ書き出してから、その lib を読む"
        "（predeploy は npm run build で同じところへ書く）。"
        "並べると、片方が書いている途中の lib をもう片方が読む"),
    "_name_match_harness.cjs": (
        ("python/admin/characters_name_match_selftest.py",
         "python/admin/characters_why_selftest.py"),
        "どちらも RUNNER_TEMP（無ければ TMPDIR）の下の同じ名前のファイルへ、本物の"
        "突き合わせを動かす台を書いて node に読ませる。並べると、相手が書き直している途中の台を読む"),
}

# **先に起こすもの。順番だけの手がかりで、結果は変わらない。**
# 長い1本を最後に起こすと、ほかが終わったあと1本だけが走り続けて壁時計が伸びる。
# 外れても遅くなるだけ（どれだけかかったかは、回すたびに最後の「遅かった順」に出る）
SLOW_FIRST: tuple[str, ...] = (
    ".claude/skills/ec2-chrome/ec2_queue_selftest.py",
    "tools/shorts/ingest/quick_captions_selftest.py",
    "tools/shorts/script/brief_selftest.py",
    "tools/shorts/render/selectexpr_selftest.py",
    "tools/shorts/render/install_selftest.py",
    "python/mutation_drill_selftest.py",
    "tools/shorts/script/lint_selftest.py",
    ".claude/skills/ec2-chrome/cdp_heal_selftest.py",
    "python/counts_selftest.py",
    "tools/shorts/script/critic_gate_selftest.py",
    "tools/shorts/post/desktop_guard_selftest.py",
    "site/selftest/calendar_selftest.mjs",
)


def lane_of(rel: str) -> str | None:
    """その見張りが入る列。列に入らなければ None（何とでも並べてよい）。"""
    for lane, (members, _) in LANES.items():
        for m in members:
            if rel == m or (m.endswith("/") and rel.startswith(m)):
                return lane
    return None


def default_jobs(named: bool) -> int:
    """並べる本数の既定。名指しのときは今までどおり1本ずつ。"""
    raw = os.environ.get("SELFTEST_JOBS", "").strip()
    if raw:
        return max(1, int(raw))
    # 名指しで回すのは `shorts_selftest.yml`（書き出しの重い2本）と、対照を作るとき。
    # あちらは並べて確かめていないので、黙って並べない
    if named:
        return 1
    # 手元の作業箱（4コア）は何人もの担当が worktree を分けて同時に使う。各自が4本ずつ並べると
    # load average が跳ねて箱ごと止まりかける（CLAUDE.md「検証のしかた」の並列ビルドと同じ形）。
    # CI のランナーは1人で使うので、CPU の数だけ並べる
    cpus = max(1, os.cpu_count() or 1)
    return cpus if os.environ.get("GITHUB_ACTIONS") == "true" else min(2, cpus)

# **要約欄の行き先は、起動した時点で環境から取り上げる。**
#
# 見張りの中には、守っている本物の道具を子として起こすものがある
# （`stale_content_watch_selftest.py` / `text_expires_watch_selftest.py`）。
# あれが仕込みで作った偽の赤——「recipes.ts が 200日前で止まっています」——を
# そのまま GitHub の要約欄に書くので、**26本ぜんぶ通った回の要約が、
# 落ちた回とそっくりになる。** 見る人には見分けがつかない。
#
# 取り上げておけば、子は環境変数が無いので何も書かない
# （どの見張りも「欄が無ければ黙る」作りになっている）。
# **要約欄に書いてよいのは、ここだけ。**
SUMMARY_PATH = os.environ.pop("GITHUB_STEP_SUMMARY", None)

# **回さないもの。名前と、回さない理由。**
#
# ここに書いてよいのは「外に出る・鍵が要る・遅い」の3つだけ。
# 「たぶん落ちるから」で外さない——落ちるなら、それは見つけた不具合。
SKIP: dict[str, str] = {
    # 2026-09-18 から 2026-10-15 まで、外すものは1本も無かった。
    #
    # ショートの品質チェックの見張り2本は「遅い」で外す。本物の render.py で書き出した
    # 1本を14通りに壊して当て（ほかに、時間割と素材だけを差し替えた足が11本。検査は19項目）、
    # 2本で7〜9分かかり、ffmpeg と OpenCV 4 が要る。
    # Selftests は全部の PR で走り、その多くは島（site/）の直しでショートに触らない。
    # **外しただけでは走らなくなる**ので、ショートを触った PR では
    # `.github/workflows/shorts_selftest.yml` が名指しで回す（棚卸し
    # `python/watch_census_selftest.py` は、あちらの `run:` で「走っている」と数える）。
    # 手元では `python3 python/selftest_runner.py tools/shorts/qa/qa_selftest.py
    # tools/shorts/qa/qa_video_selftest.py`（名指しすれば、ここに載っていても回る）
    "tools/shorts/qa/qa_selftest.py":
        "遅い（書き出して壊す対照。2本で7〜9分・ffmpeg と OpenCV 4 が要る）。"
        "ショートを触った PR で .github/workflows/shorts_selftest.yml が回す",
    "tools/shorts/qa/qa_video_selftest.py":
        "遅い（書き出して壊す対照。2本で7〜9分・ffmpeg と OpenCV 4 が要る）。"
        "ショートを触った PR で .github/workflows/shorts_selftest.yml が回す",
    # カットの選び方の見張り（2026-10-21）は書き出しを通さず1分ほどだが、合成の場面を ffmpeg で作り、
    # 似た見た目の検査が本人の顔を OpenCV 4 の Haar で探す。どちらも Selftests に無い。守っている実物は
    # `tools/shorts/qa/` の下だけで、そこを触る PR では `shorts_selftest.yml` が名指しで回す
    "tools/shorts/qa/cuts_selftest.py":
        "ffmpeg と OpenCV 4 と numpy が要る（Selftests は入れていない。2026-10-21 確認）。守る実物は tools/shorts/qa/ の下だけで、"
        "そこを触る PR で .github/workflows/shorts_selftest.yml が名指しで回す",
    # BGM の大きさの物差しの見張り（2026-10-16）は**遅くない**（数秒）が、numpy が要る。
    # Selftests は numpy を入れていない（`python/requirements.txt` のどれも numpy を引かない。
    # 2026-10-16 に pip show で確かめた）。守っている実物（`tools/shorts/style/bgm_gap.py`）は
    # `tools/shorts/` の下にしか無く、そこを触る PR では必ず `shorts_selftest.yml` が走って
    # numpy も入れているので、**そちらで名指しで回せば見のがす PR は無い**。
    # 島の PR ぜんぶに依存を1つ足すより、こちらを取った
    "tools/shorts/style/bgm_gap_selftest.py":
        "numpy が要る（Selftests は入れていない。2026-10-16 確認）。守る実物は tools/shorts/ の下だけで、"
        "そこを触る PR で .github/workflows/shorts_selftest.yml が名指しで回す",
    # 題の札の国旗の見張り（2026-10-21）も同じ形。書き出しは通さず遅くないが、守っている
    # `textlook.py` が字の縁を numpy と OpenCV で描くので、絵を描いて画素を数えるには両方が要る
    "tools/shorts/render/flag_selftest.py":
        "numpy と OpenCV が要る（Selftests は入れていない）。守る実物は tools/shorts/render/ の下だけで、"
        "そこを触る PR で .github/workflows/shorts_selftest.yml が名指しで回す",
    # BGM の頭の無音と最後の札（あやと F-041・F-042、2026-10-21）。本物の書き出しを下書きで1回通すので
    # ffmpeg・numpy・Pillow・OpenCV・budoux が要る
    "tools/shorts/render/bgm_cta_selftest.py":
        "ffmpeg と numpy・OpenCV・budoux が要る（Selftests は入れていない）。守る実物は tools/shorts/render/ の下だけで、"
        "そこを触る PR で .github/workflows/shorts_selftest.yml が名指しで回す",
}

# 既定の引数。ここに載せたものは、載せた形でだけ回る
ARGS: dict[str, list[str]] = {
    # 本番を叩く側は PR では回さない。**対照（探し方が効くか）だけ**を回す。
    # 本番を読むほうは `python3 python/public_ids_selftest.py` を手で
    "python/public_ids_selftest.py": ["--offline"],
}


def discover(root: Path) -> list[Path]:
    """`*_selftest.py` と `*_selftest.mjs` を拾う。

    この回し役自身は `_selftest.py` で終わらないので、自分を拾うことはない。
    """
    out: list[Path] = []
    for suffix in ("py", "mjs"):
        out += sorted(
            p for p in root.rglob(f"*_selftest.{suffix}")
            if "__pycache__" not in p.parts and "node_modules" not in p.parts
        )
    return out


def label(path: Path, cwd: Path) -> str:
    """出すときの名前。cwd の外を名指しされたら、そのままの姿で出す。"""
    try:
        return path.relative_to(cwd).as_posix()
    except ValueError:
        return path.as_posix()


def run_one(path: Path, cwd: Path, env: dict) -> tuple[int, float, str]:
    """1本回して（終了コード, かかった秒, 最後の1行）を返す。"""
    rel = label(path, cwd)
    who = rel if not rel.startswith("/") else str(path)
    # mjs は node で回す。中の `SITE` は自分のファイルの場所から出しているので、
    # どこを cwd にしても同じところを見る（`rebake.yml` は site を cwd にしている）
    head = ["node"] if path.suffix == ".mjs" else [sys.executable]
    cmd = [*head, who, *ARGS.get(rel, [])]
    t0 = time.monotonic()
    try:
        r = subprocess.run(cmd, cwd=cwd, env=env, capture_output=True,
                           text=True, timeout=TIMEOUT_SEC, check=False)
        rc, out = r.returncode, (r.stdout + r.stderr)
    except subprocess.TimeoutExpired:
        # **黙って飛ばさない。** 止まったものは落ちたものとして数える
        rc, out = 1, f"{TIMEOUT_SEC} 秒で返ってこなかった"
    except OSError as e:
        # `node` が無い箱。**「回せなかった」を「通った」と同じ顔にしない**
        rc, out = 1, f"{head[0]} を動かせない: {e}"
    dt = time.monotonic() - t0
    tail = ""
    for line in reversed(out.splitlines()):
        if line.strip():
            tail = line.strip()[:160]
            break
    return rc, dt, tail


def drill() -> bool:
    """**回し役が落ちられるか**を、偽の見張りで先に見る。

    本物を1本も回す前に、0 と 1 と 2 が実測で出ることを確かめる。
    **py と mjs を別々に落とす**——回しかたが違う（`python3` と `node`）ので、
    片方だけ当てると mjs を起こす側が丸ごと壊れていても 0 が出る。
    1つでも外れたら False。
    """
    ok = True
    with tempfile.TemporaryDirectory() as tmp:
        box = Path(tmp)
        (box / "green_selftest.py").write_text("print('ok')\n", encoding="utf-8")
        (box / "also_green_selftest.py").write_text("print('ok')\n", encoding="utf-8")
        (box / "red_selftest.py").write_text(
            "import sys\nprint('わざと落とす')\nsys.exit(1)\n", encoding="utf-8")
        empty = box / "empty"
        empty.mkdir()
        # mjs だけが落ちる部屋。py は置かない——py が落ちて 1 になったのを
        # 「mjs で落ちた」と読まないため
        onlymjs = box / "onlymjs"
        onlymjs.mkdir()
        (onlymjs / "redjs_selftest.mjs").write_text(
            "console.log('わざと落とす');\nprocess.exit(1);\n", encoding="utf-8")

        # 上で `SUMMARY_PATH` を環境から取り上げてあるので、対照の子
        # （偽の見張り）も要約欄には1行も書けない
        env = dict(os.environ)

        def sub(root: Path, want: int, need: str | None,
                extra_args: tuple[str, ...] = ()) -> None:
            nonlocal ok
            r = subprocess.run(
                [sys.executable, str(Path(__file__).resolve()),
                 "--root", str(root), "--no-drill", *extra_args],
                capture_output=True, text=True, timeout=TIMEOUT_SEC,
                check=False, env=env)
            got = r.returncode
            hit = (need is None) or (need in r.stdout)
            mark = "○" if (got == want and hit) else "✕"
            if mark == "✕":
                ok = False
            extra = "" if need is None else f"・「{need}」が出た: {hit}"
            print(f"  {mark} {root.name} → 終了コード {got}（欲しいのは {want}）{extra}")

        print("[対照] 回し役そのものが、落ちるときに落ちるか")
        # py も mjs も通る → 0。**mjs が拾われていない**と、下の
        # 「mjs が1本落ちる」も静かに 2 になるので、先にここで拾えることを見る
        only_green = box / "onlygreen"
        only_green.mkdir()
        (only_green / "a_selftest.py").write_text("print('ok')\n", encoding="utf-8")
        (only_green / "b_selftest.py").write_text("print('ok')\n", encoding="utf-8")
        (only_green / "c_selftest.mjs").write_text(
            "console.log('ok');\n", encoding="utf-8")
        sub(only_green, 0, None)
        # py が1本落ちる → 1。**落ちた名前が出るところまで見る**
        sub(box, 1, "red_selftest.py")
        # mjs が1本落ちる → 1。node で起こす側が死んでいたらここで出る
        sub(onlymjs, 1, "redjs_selftest.mjs")
        # 1本も拾えない → 2。ここが 0 だと「ぜんぶ通りました」の嘘になる
        sub(empty, 2, None)

        # **並べかたの対照。** 上の箱の外に置く（`sub(box, …)` は下の階まで拾うので）
        with tempfile.TemporaryDirectory() as tmp2:
            two = Path(tmp2)
            # 偽の見張り。生きているあいだ箱の根に札を置き、ほかの札が見えたら「重なった」で落ちる。
            # 重なったときは札を残したまま帰る（相手にも見えるように。消すと相手は待ちきるまで帰らない）
            meet = (
                "import sys, time\n"
                "from pathlib import Path\n"
                "here = Path(__file__).resolve()\n"
                "box = here.parents[2]\n"
                "room = box\n"
                "mine = room / ('alive-' + here.stem)\n"
                "mine.touch()\n"
                "end = time.time() + float((box / 'hold').read_text())\n"
                "while time.time() < end:\n"
                "    if any(p != mine for p in room.glob('alive-*')):\n"
                "        print('重なった: ' + here.stem)\n"
                "        sys.exit(1)\n"
                "    time.sleep(0.02)\n"
                "mine.unlink()\n"
                "print('ok')\n")

            def put(root: Path, rel: str) -> None:
                (root / rel).parent.mkdir(parents=True, exist_ok=True)
                (root / rel).write_text(meet, encoding="utf-8")

            # 同じ列の2本は重ならない → 0。列が効いていなければ a と b が重なって 1 になる
            lanes = two / "lanes"
            put(lanes, "functions/selftest/a_selftest.py")
            put(lanes, "functions/selftest/b_selftest.py")
            (lanes / "hold").write_text("0.6", encoding="utf-8")
            sub(lanes, 0, None, ("--jobs", "4"))
            # 列の外の2本は、本当に重なる → 1。**並べたつもりで1本ずつ回っていると、
            # 上の 0 は何も確かめていない**ので、重なれば落ちることをここで見る。
            # 待ちは長めに取る（重なった時点で抜けるので、ふだんは一瞬で終わる）
            apart = two / "apart"
            put(apart, "elsewhere/x/a_selftest.py")
            put(apart, "elsewhere/x/b_selftest.py")
            (apart / "hold").write_text("8", encoding="utf-8")
            sub(apart, 1, "重なった", ("--jobs", "4"))

    if not stale_pyc_drill():
        ok = False
    print("  " + ("○ 回し役は落ちられる" if ok else "✕ 回し役の対照が外れた"))
    return ok


# 古い pyc の対照に使う、作り物の本体と見張り。毒は同じ長さの書き換え（`>` → `<`）
_JUDGE = "def late(when, cut):\n    return when > cut\n"
_JUDGE_BAD = _JUDGE.replace(">", "<")
_JUDGE_TEST = ("import sys\nsys.path.insert(0, __file__.rsplit('/', 1)[0])\n"
               "from judge import late\nsys.exit(0 if late(2, 1) else 1)\n")


def plant_stale_pyc(src: Path, text: str) -> Path:
    """`src` と時刻（秒）・大きさが同じで、中身だけ `text` の pyc を、置き場の `__pycache__` に置く。

    Python は pyc を使うかを記録（時刻・大きさ）でしか決めないので、これがそのまま読まれる。
    置く先は `importlib.util.cache_from_source` ではなく手で組む——あちらは自分の
    `sys.pycache_prefix` に従うので、外から置き場を渡されていると毒が置き場の外へ行く
    """
    st = src.stat()
    code = compile(text, str(src), "exec", dont_inherit=True)
    pyc = src.parent / "__pycache__" / f"{src.stem}.{sys.implementation.cache_tag}.pyc"
    pyc.parent.mkdir(exist_ok=True)
    pyc.write_bytes(importlib.util.MAGIC_NUMBER + bytes(4)
                    + (int(st.st_mtime) & 0xFFFFFFFF).to_bytes(4, "little")
                    + (st.st_size & 0xFFFFFFFF).to_bytes(4, "little")
                    + marshal.dumps(code))
    return pyc


def stale_pyc_drill() -> bool:
    """**古い pyc を読まないか**（頭の「古い pyc を読まない」）。

    2つの毒を当てる。守りのある回し役では元のとおりに判定され（0）、**守りだけを外した
    回し役**（`FRESH_PYC = False`）では毒のほうで判定される（1）ことを見る。後者が 0 なら、
    毒が毒になっていない（置きかたが壊れている）ので、前者の 0 は何も確かめていない。

      1. 置いていった毒——2026-10-23 に手で書き換えて同じ1秒で戻した形
      2. 回のあいだにできる毒——同じ長さに書き換えて1回まわし、同じ時刻で元に戻してもう1回。
         置き場を回ごとに作り直さず使い回すと（固定の道にする、など）、ここで落ちる
    """
    ok = True
    # 外から渡された置き場や「書かない」が残っていると、守りを外した側でも毒が読まれず、
    # 対照にならない
    env = {k: v for k, v in os.environ.items()
           if k not in ("PYTHONPYCACHEPREFIX", "PYTHONDONTWRITEBYTECODE")}

    def runner_rc(root: Path, guard: bool) -> int:
        args = ["--root", str(root), "--no-drill"]
        if guard:
            cmd = [sys.executable, str(Path(__file__).resolve()), *args]
        else:
            # 守りだけを外した回し役。ほかは1文字も変えない
            cmd = [sys.executable, "-c",
                   "import sys; sys.path.insert(0, sys.argv[1]); "
                   "import selftest_runner as R; R.FRESH_PYC = False; "
                   "sys.argv = ['selftest_runner.py', *sys.argv[2:]]; sys.exit(R.main())",
                   str(HERE), *args]
        return subprocess.run(cmd, capture_output=True, text=True, timeout=TIMEOUT_SEC,
                              check=False, env=env).returncode

    def box(at: Path) -> Path:
        at.mkdir()
        (at / "judge.py").write_text(_JUDGE, encoding="utf-8")
        (at / "judge_selftest.py").write_text(_JUDGE_TEST, encoding="utf-8")
        return at / "judge.py"

    def say(what: str, got: tuple, want: tuple) -> None:
        nonlocal ok
        hit = got == want
        ok = ok and hit
        print(f"  {'○' if hit else '✕'} {what} → 終了コード {'→'.join(map(str, got))}"
              f"（欲しいのは {'→'.join(map(str, want))}）")

    print("[対照] 古い pyc（元と時刻・大きさが同じで、中身が違う）を読まないか")
    with tempfile.TemporaryDirectory() as tmp:
        for guard in (True, False):
            tag = "" if guard else "（守りを外した回し役）"
            # 1. 置いていった毒
            src = box(Path(tmp) / f"left{int(guard)}")
            plant_stale_pyc(src, _JUDGE_BAD)
            say(f"置いていった毒の pyc がある{tag}", (runner_rc(src.parent, guard),),
                (0,) if guard else (1,))
            # 2. 回のあいだにできる毒。1回目は書き換えたほうなので、どちらでも赤
            src = box(Path(tmp) / f"between{int(guard)}")
            src.write_text(_JUDGE_BAD, encoding="utf-8")
            t = src.stat()
            first = runner_rc(src.parent, guard)
            src.write_text(_JUDGE, encoding="utf-8")
            os.utime(src, ns=(t.st_atime_ns, t.st_mtime_ns))
            say(f"書き換えて回し、同じ時刻・同じ大きさで戻してもう1回{tag}",
                (first, runner_rc(src.parent, guard)), (1, 0) if guard else (1, 1))
    return ok


def run_all(found: list[Path], cwd: Path, env: dict,
            jobs: int) -> list[tuple[Path, int, float, str]]:
    """`jobs` 本ずつ並べて回し、（道, 終了コード, 秒, 最後の1行）を拾った順で返す。

    **同じ列（`LANES`）の2本は重ねない。** 列の見張りを先頭に並べて、列が空けば
    すぐ次の1本が入るようにする——列は1本ずつしか進まないので、遅れて起こすと
    それだけ壁時計が伸びる。そのあとに `SLOW_FIRST`、残りは拾った順。
    終わった順に1行ずつ出す（行の形は1本ずつ回していたときと同じ）。
    """
    rels = [label(p, cwd) for p in found]
    slow = {n: i for i, n in enumerate(SLOW_FIRST)}

    def rank(i: int) -> tuple:
        rel = rels[i]
        if lane_of(rel) is not None:
            return (0, 0, i)
        if rel in slow:
            return (1, slow[rel], i)
        return (2, 0, i)

    pending = sorted(range(len(found)), key=rank)
    busy: set[str] = set()
    done: dict[int, tuple[int, float, str]] = {}
    cond = threading.Condition()
    def report(i: int, rc: int, dt: float, tail: str) -> None:
        mark = "○" if rc == 0 else "✕"
        print(f"  {mark} {rels[i]}  終了コード {rc}  {dt:.1f}秒")
        if rc != 0:
            print(f"      {tail}")

    def worker() -> None:
        while True:
            with cond:
                while True:
                    if not pending:
                        return
                    pick = next((i for i in pending
                                 if lane_of(rels[i]) not in busy), None)
                    if pick is not None:
                        break
                    cond.wait()
                pending.remove(pick)
                lane = lane_of(rels[pick])
                if lane is not None:
                    busy.add(lane)
            try:
                rc, dt, tail = run_one(found[pick], cwd, env)
            except BaseException as e:  # noqa: BLE001 — 回し役の中で倒れても、1本ぶんとして落とす
                rc, dt, tail = 1, 0.0, f"回し役が回しそこねた: {type(e).__name__}: {e}"[:160]
            with cond:
                if lane is not None:
                    busy.discard(lane)
                done[pick] = (rc, dt, tail)
                report(pick, rc, dt, tail)
                cond.notify_all()

    threads = [threading.Thread(target=worker, daemon=True)
               for _ in range(min(jobs, len(found)))]
    for t in threads:
        t.start()
    for t in threads:
        t.join()

    out = []
    for i, p in enumerate(found):
        # **回らなかったものを「通った」に数えない。** 起きないはずだが、起きたら落ちたとして出す
        rc, dt, tail = done.get(i, (1, 0.0, "回し役が回さなかった（並べる仕組みの不具合）"))
        if i not in done:
            report(i, rc, dt, tail)
        out.append((p, rc, dt, tail))
    return out


def summary(lines: list[str]) -> None:
    """GitHub の要約欄に書く。欄が無ければ何もしない（手元で回したとき）。"""
    p = SUMMARY_PATH
    if not p:
        return
    try:
        with open(p, "a", encoding="utf-8") as f:
            f.write("\n".join(lines) + "\n")
    except OSError as e:
        print(f"::warning::要約欄に書けなかった: {e}")


def main() -> int:
    ap = argparse.ArgumentParser(add_help=True)
    ap.add_argument("paths", nargs="*", help="回すものを名指しする（対照を作るとき）")
    ap.add_argument("--root", default=None, help="拾いに行く場所（既定: python/）")
    ap.add_argument("--list", action="store_true", help="回さずに、回すものを並べる")
    ap.add_argument("--json", action="store_true",
                    help="`--list` の中身を機械で読む形で出す（`watch_census_selftest.py` が読む）")
    ap.add_argument("--only-drill", action="store_true", help="対照だけ回して帰る")
    ap.add_argument("--no-drill", action="store_true", help="対照を飛ばす（対照の中から呼ぶ用）")
    ap.add_argument("--jobs", type=int, default=None,
                    help="何本並べて回すか（既定: CPU の数。名指しのときは1。SELFTEST_JOBS でも変えられる）")
    a = ap.parse_args()

    # CI のログは行ごとに時刻が付く。溜めて最後に吐くと、どの見張りがいつ終わったかが読めない
    try:
        sys.stdout.reconfigure(line_buffering=True)
    except (AttributeError, ValueError):
        pass

    # `python/config.py` は読み込んだ時点で投げる。見張りの中では
    # BigQuery のクライアントが偽物に差し替わっているので、この値は届かない
    os.environ.setdefault("BQ_PROJECT_ID", "selftest-no-such-project")

    # 並べるだけ（`--list`）なら見張りを1本も回さないので、回し役の対照も要らない。
    # `mutation_drill.py` の `plan()` が `--list --json` を毎回呼ぶので、そのたびに
    # 対照（偽の見張りを並べて回す。2秒ほど）を払わせない
    if not a.no_drill and not a.list:
        if not drill():
            print("\n✕ 回し役の対照が外れた。**本物の見張りは1本も回していない**")
            summary(["### 見張り", "",
                     "**回し役の対照が外れた。見張りは1本も回していない。**"])
            return 2
        if a.only_drill:
            return 0
        print()

    root = Path(a.root).resolve() if a.root else HERE
    cwd = REPO if a.root is None else root

    skipped: list[tuple[str, str]] = []
    if a.paths:
        found = [Path(p).resolve() for p in a.paths]
        missing = [p for p in found if not p.is_file()]
        if missing:
            for p in missing:
                print(f"✕ 見つからない: {p}")
            return 2
    else:
        found = discover(root)
        # `--root` を渡されているのは対照の中から呼ばれたときだけ。
        # そこに本物の `SKIP` を当てても意味がないので、素の拾いだけを見る
        if a.root is None:
            # `python/` の外にある mjs は、rglob では届かない。名指しで足す
            for r in MJS_ROOTS:
                found += discover(r)
            # **`SKIP` が腐っていないか。** 名前が変わったのに表に残っていると、
            # 「外してある」つもりのものが黙って居なくなる（#125 と同じ形）。
            # mjs の置き場そのものが消えた（名前が変わった）ときも同じ形で
            # **黙って4本減る**ので、ここで一緒に見る
            rot = [n for n in list(SKIP) + list(ARGS)
                   if not (cwd / n).is_file()]
            # 列の表も同じ。名前が変わったのに表に残っていると、**並べてはいけない2本が
            # 黙って並ぶ**（赤くならず、ときどき嘘の赤・嘘の緑が出るだけ）
            for lane, (members, _) in LANES.items():
                for m in members:
                    if not ((cwd / m).is_dir() if m.endswith("/") else (cwd / m).is_file()):
                        rot.append(f"{m}（列 {lane}）")
            for r in MJS_ROOTS:
                if not r.is_dir():
                    rot.append(f"{label(r, cwd)}/（mjs の置き場が無い）")
            if rot:
                for n in rot:
                    print(f"✕ 表に在るのに、そのファイルが無い: {n}")
                print("拾いかたが壊れている。数字は1つも出さない")
                return 2
            skipped = sorted(SKIP.items())
            found = [p for p in found if label(p, cwd) not in SKIP]

    if not found:
        print("✕ 見張りを1本も拾えなかった（拾いに行った先: "
              f"{root}）。**「ぜんぶ通りました」とは言わない**")
        summary(["### 見張り", "", "**1本も拾えなかった。**"])
        return 2

    if a.list:
        if a.json:
            # **繋がっているかを数える道具（`python/watch_census_selftest.py`）は、
            # ここから取る。** あちらに glob を書き写させると、こちらの拾いかたを
            # 変えた日に黙ってずれる（2026-09-18 に実際にずれた）。
            # 出すのは JSON だけ。ほかの字を混ぜない
            print(json.dumps({
                "picked": [label(p, cwd) for p in found],
                "skipped": dict(skipped),
            }, ensure_ascii=False, sort_keys=True))
            return 0
        print(f"[見張り] {len(found)}本"
              + (f"（外したもの {len(skipped)}本）" if skipped else ""))
        for p in found:
            rel = label(p, cwd)
            print("  " + " ".join([rel, *ARGS.get(rel, [])]))
        for n, why in skipped:
            print(f"  — 外した {n} … {why}")
        return 0

    jobs = a.jobs if a.jobs is not None else default_jobs(bool(a.paths))
    jobs = max(1, jobs)
    if a.root is None and not a.paths:
        # 順番の手がかりが腐っても結果は変わらないので、落とさずに知らせるだけ
        for n in SLOW_FIRST:
            if not (cwd / n).is_file():
                print(f"::warning::SLOW_FIRST に在るのに、そのファイルが無い: {n}")

    print(f"[見張り] {len(found)}本を回す（{jobs}本ずつ並べる）"
          + (f"（外したもの {len(skipped)}本）" if skipped else ""))
    for n, why in skipped:
        print(f"  — 外した {n} … {why}")

    env = dict(os.environ)
    # 置き場は回の終わりに捨てる。次の回は、また空から作る
    with tempfile.TemporaryDirectory(prefix="selftest-pyc-",
                                     ignore_cleanup_errors=True) as pyc:
        if FRESH_PYC:
            env["PYTHONPYCACHEPREFIX"] = pyc
        t_all = time.monotonic()
        results = run_all(found, cwd, env, jobs)
        wall = time.monotonic() - t_all
    bad: list[tuple[str, int, str]] = [
        (label(p, cwd), rc, tail) for p, rc, _, tail in results if rc != 0]

    print()
    print(f"見た {len(found)}本 / 通った {len(found) - len(bad)}本 / "
          f"落ちた {len(bad)}本")
    total = sum(dt for _, _, dt, _ in results)
    print(f"壁時計 {wall:.0f}秒（{jobs}本ずつ並べた。1本ごとの秒を足すと {total:.0f}秒）")
    # 遅い見張りを、次に縮める人が探さなくて済むように
    print("遅かった順（上位10本）:")
    for p, _, dt, _ in sorted(results, key=lambda r: -r[2])[:10]:
        print(f"  {dt:6.1f}秒  {label(p, cwd)}")
    # **1本の上限に近づいたものは、赤くなる前に知らせる。** 並べると遅い1本はさらに伸びる
    # （CI で ec2_queue_selftest.py が1本ずつで148秒、並べて147〜212秒）。上限を越えると
    # 「落ちた」と数えるので、そうなってから気づくと、中身は壊れていないのに赤い PR が出る
    for p, rc, dt, _ in results:
        if rc == 0 and dt > TIMEOUT_SEC * 0.6:
            print(f"::warning::{label(p, cwd)} が {dt:.0f}秒かかった（1本の上限 {TIMEOUT_SEC}秒の"
                  f"{dt / TIMEOUT_SEC:.0%}）。上限に当たる前に中を縮める")

    head = [f"### 見張り {len(found) - len(bad)}/{len(found)} 本が通りました", ""]
    if bad:
        print("\n落ちた見張り:")
        head = [f"### 見張りが {len(bad)} 本落ちました", "",
                f"見た {len(found)}本 / 通った {len(found) - len(bad)}本", "",
                "| 見張り | 終了コード | 最後の1行 |", "| --- | --- | --- |"]
        for rel, rc, tail in bad:
            print(f"  ✕ {rel}（終了コード {rc}）")
            # 表の区切りと同じ字が本文に入ると、列がずれる
            safe = tail.replace("|", "\\|")
            head.append(f"| `{rel}` | {rc} | {safe} |")
        summary(head)
        return 1

    summary(head + [f"見た {len(found)}本、落ちたものはありません。"])
    print("○ ぜんぶ通りました")
    return 0


if __name__ == "__main__":
    sys.exit(main())
