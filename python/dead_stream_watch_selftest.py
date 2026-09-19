"""**`python/dead_stream_watch.py` と `python/build_dead_streams.py` が、
本当に拾うか・本当に黙るかを両側から見る。**

    python3 python/dead_stream_watch_selftest.py

終了コード 0=ぜんぶ通った / 1=外したものがある / 2=対照が1件も回っていない。

**ここはネットに出ない。** 出る側の対照（生きた id で 0件・死んだ id で 1件・
録画の無い id で `NO_REC`・届かない箱で 2）は見張り本体が毎回自分で回すもので、
ここで見るのは**口を持たない部分**だけ。

毎晩の焼き直し（`rebake.yml` の「押しても見られない配信の見張りが効くか」）から
回る。**繋ぐ前は、どこからも走っていなかった**——#520 で焼き込みから7本外した
日から、この対照は master で赤いまま2日残っていた（`island-misses.md` #125 #139）。

## なぜ「落ちるまで壊す」だけでは対照にならないか

`island-misses.md` #128 の決めごと1。判定の足を1本ずつ抜く。
ここでいう足は7本ある（`BREAK` は要らない。下の表のとおりに1行ずつ当てれば落ちる）。

| 足 | 抜くと何が起きるか |
| --- | --- |
| 拾う鍵（`videoId` / `"v"`） | 拾い漏らすと、見ていない配信が「見られる」に混ざる |
| 2段目の読み（`classify_player`） | `OK` に畳むと死にリンクが消える。逆に「消えている」と読むと、**締め出された返りが死にリンクに化ける**（実際に148本やった） |
| 終了コード（`decide`） | 見つかったのに 2 を返すと、本物の件数が「数えられなかった」に化ける |
| 隠すほうの種類（`FOREVER`） | 403 を入れると、**あやとが公開に戻した日に島が知らないまま隠し続ける** |
| 覚えるほうの種類（`WATCHED`） | 403 を落とすと、**毎晩17本ぶら下がって毎晩赤くなる。**「いつもの赤」に化けて、本当に1本死んだ晩に見分けがつかない |
| 今夜深く見るぶん（`pick_deep`） | 「もう見られないと知っているぶん」を外すと、**録画の無い id が1段目の 200 だけで「もどりました」に化けて**取り置きから外れ、翌晩また焼き込みに入る |
| 深く見た日（`merge_deep`） | 見られないものまで覚えると、次の晩に飛ばされて上と同じことが起きる |

**両側から当てる。** 「拾えること」だけでなく「拾ってはいけないものを
拾わないこと」も見る。焼き込みには 11字の別物（料理の合言葉 `french-toast`
のような slug や、`id: "..."`）が並んでいるので、当てずっぽうの正規表現は
**分母のほうを膨らませる。**

## 種は本番の `site/content/`

形を自分で書き起こすと、**読むほうの正規表現が本物に当たっているか**を
見ないまま通る。`onThisDay.ts` は `"v":"…"`（間に空白が無い）、
`cityStreams.ts` は `"videoId": "…"`、`countries.ts` は `videoId: "…"` と
3通りあるので、そこは本物で当てないと意味がない。

**先に「手をつけていない写しが、本番と同じ数になること」を見る**（§15）。
写しを作る途中で壊れても終了コードは同じなので、そこを見ないと対照にならない。

## 対照の id そのものも見る

見張りは「存在しない11字」を当てて 404 が返ることを対照にしている。
**YouTube の id は11字目に限られた字しか取れない**（`A E I M Q U Y c g k o s w 0 4 8`）。
そこを外すと oembed が 404 ではなく **400** を返し、対照が「拾えなかった」に化ける
（`XxXxWwW1111` で実際に踏んだ）。ネットに出ずに見られるので、ここで見る。
"""

from __future__ import annotations

import json
import os
import shutil
import subprocess
import re
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

# **直す前の写しを読まないように、先に焼いた pyc を捨てる。**
# `__pycache__` の pyc は「元の秒数と大きさが同じ」なら作り直されない。
# 見張りを1行だけ直して1秒以内に回すと、**直っていない中身で対照が通る**
# （実際に踏んだ。壊した対照を戻したのに、壊れたままの値で落ち続けた）
for _name in ("dead_stream_watch", "build_dead_streams"):
    for _pyc in (Path(__file__).resolve().parent / "__pycache__").glob(f"{_name}.*.pyc"):
        _pyc.unlink(missing_ok=True)

from dead_stream_watch import (  # noqa: E402
    BLIND, CONTENT, DEAD_CONTROL, FRONT, GONE, ID_RE, LIVE_CONTROL, LOGIN, NO_REC, OK,
    OTHER, PAGES, PLAY_CONTROL, PRIVATE, Probe, SIDE, Sighting, Verdict, classify_player,
    decide, is_throttled, probe_all, scan_dir,
)

import build_dead_streams as build  # noqa: E402
import dead_stream_watch as watch  # noqa: E402  足を抜くときに触るのはこちら

REPO = Path(__file__).resolve().parent.parent
WATCH = REPO / "python" / "dead_stream_watch.py"
BUILD = REPO / "python" / "build_dead_streams.py"

# YouTube の id の11字目に立てる字。**ここを外すと oembed は 400 を返す**
TAIL_OK = set("AEIMQUYcgkosw048")

# **数（本数もファイル数も）を、ここに写さない。**
# 焼き直しは毎晩 videos を足すので、今日の数を書くと**翌朝には赤くなり、
# 誰かが数字を書き換えるだけの作業になる。** そうやって手で合わせる見張りは
# いずれ黙らされる（`docs/island-standards.md` 15章・`docs/island-misses.md` #102）。
#
# 2026-09-19 まで `WANT_FILES = 9` と手で書いてあった。**あれは「縮んでいないか」
# しか見ていない。** 焼き込みが1本増えても、その1本が新しい書きかたなら
# `files` に出てこないので、9 のまま通る。実際に `chapterStreams.ts`（717本）・
# `shorts.ts`（83本）・`streamPeaks.ts`（267本）が**分母に1行も出ていなかった**
# （#168）。数える代わりに、**構造で見る**（下の `QUOTED` / `_shape`）。
#
# 見たいのは「拾う側が黙って縮んでいないか」なので、**別の拾いかたと
# 突き合わせる。** 下の6通りは本物の規則を**写していない**（本物は1本の
# 正規表現で、こちらは書きかたごとに1本ずつ）。ここで拾えたものは、
# 本物でも必ず拾えていないとおかしい。分母が増えても減っても、この関係は変わらない
SUBSET_RE = [
    re.compile(r'"v"\s*:\s*"([A-Za-z0-9_-]{11})"'),
    re.compile(r'videoId\s*:\s*"([A-Za-z0-9_-]{11})"'),
    re.compile(r'\bvideo:\s*"([A-Za-z0-9_-]{11})"'),
    re.compile(r'\["\d{4}-\d\d-\d\d",\s"([A-Za-z0-9_-]{11})"'),
    re.compile(r'"([A-Za-z0-9_-]{11})":\{"k"'),
    re.compile(r'\bid:\s"([A-Za-z0-9_-]{11})",\sdate:'),
]

# 引用符の中の11字ぜんぶ。**分母をこちらから出す**ための、いちばん広い網。
# 「配信IDの形をしているのに、見たファイルに1行も出ていない焼き込み」が
# 在ったら落ちる——これなら、**次に足された焼き込みが黙って落ちることは無い**
QUOTED = re.compile(r'"([A-Za-z0-9_-]{11})"')


def _shape(v: str) -> bool:
    """配信IDの形をしているか。**本物の `looks_like_video` を呼ばない。**

    呼ぶと、あちらが壊れたときにこちらも同じだけ壊れて対照にならない。
    ここは仕様のほうを写す——11字目は16通り、小文字と `-` だけの11字は slug。
    """
    return v[10] in TAIL_OK and any(c.isupper() or c.isdigit() for c in v)


# 足を1本ずつ抜く旗（`docs/island-standards.md` §15「対照は、足の数だけ用意する」）。
# **どれを抜いても同じ1件で落ちるなら、それは1本の足しかない。**
#
# | `BREAK` | 抜くもの | 落ちる項目 |
# | --- | --- | --- |
# | `narrow` | 名前で分からない書きかた（`LOOSE_RE`）を見ない＝2026-09-19 まで本番がこれ | こぼれ・分母・面の表 |
# | `novideo` | `video:` だけ見ない | 分母（`nordic.ts` が消える）・面の表 |
# | `nogate` | 形の確かめ（`looks_like_video`）を外す | 配信ではない11字を拾わない |
# | `nopages` | 面の表から、新しく見えた焼き込みを落とす | 面の表 |
BREAK = os.environ.get("BREAK", "")
LEGS = ("narrow", "novideo", "nogate", "nopages")


def _apply_break() -> None:
    """`BREAK` の足を、本物のモジュールから抜く。"""
    if BREAK == "narrow":
        watch.LOOSE_RE = re.compile(r"(?!)")
    elif BREAK == "novideo":
        watch.VIDEO_RE = re.compile(r'"?(?:videoId|v)"?:\s*"([A-Za-z0-9_-]{11})"')
    elif BREAK == "nogate":
        watch.looks_like_video = lambda v: True
    elif BREAK == "nopages":
        for name in ("chapterStreams.ts", "shorts.ts", "streamPeaks.ts",
                     "legendDays.ts", "countryStats.ts", "nordic.ts"):
            watch.PAGES.pop(name, None)


def _is_day(x: str) -> bool:
    return len(x) == 10 and x[4] == "-" and x[7] == "-" and x.replace("-", "").isdigit()


def main() -> int:
    ok: list[str] = []
    ng: list[str] = []

    def check(label: str, got, want) -> None:
        (ok if got == want else ng).append(f"{label}: 出た={got} ほしい={want}")

    # --- 1. 本番の焼き込みから、本当に拾えているか ---------------------------
    if not CONTENT.is_dir():
        print(f"::error::種がありません（{CONTENT}）", file=sys.stderr)
        return 2
    if BREAK:
        if BREAK not in LEGS:
            print(f"::error::BREAK={BREAK} は足の名前ではありません"
                  f"（使えるのは {', '.join(LEGS)}）", file=sys.stderr)
            return 2
        print(f"** BREAK={BREAK} —— 足を1本抜いてある。ここは落ちるのが正しい **")
        _apply_break()

    real, real_files = watch.scan_dir(CONTENT)

    # **狭い拾いかたで拾えたものが、本物からこぼれていないか。**
    # 数を写さずに「縮んでいない」を見るのはこれ（上の SUBSET_RE の注）
    subset: set[str] = set()
    for f in sorted(CONTENT.rglob("*.ts")):
        t = f.read_text(encoding="utf8", errors="replace")
        for rx in SUBSET_RE:
            subset.update(v for v in rx.findall(t) if _shape(v))
    # **落ちたときに270本ぶん並べない。** 公開のログに流れるので、
    # 件数と頭の5本で足りる（どれか1本を追えば原因は同じ）
    missed = sorted(subset - set(real))
    shown = f"{len(missed)}本 こぼれた（例 {missed[:5]}）" if missed else "0本"
    check("狭い拾いかたで拾えた配信が、本物からこぼれていない", shown, "0本")
    print(f"    （狭い拾いかた {len(subset)} 本 / 本物 {len(real)} 本 を突き合わせた）")

    # --- 1b. 分母を、こちらから数える（`WANT_FILES` の代わり）----------------
    # **「9本を見ました」を手で書かない。** 引用符の中の11字を全部あたって、
    # 配信IDの形をしたものが在るのに `files` に1行も出ていない焼き込みを並べる。
    # ここが空でないかぎり、**次に足された焼き込みが黙って落ちることは無い**
    holes: list[str] = []
    cand_files = 0
    cand_total = 0
    for f in sorted(CONTENT.rglob("*.ts")):
        t = f.read_text(encoding="utf8", errors="replace")
        cand = sorted({v for v in QUOTED.findall(t) if _shape(v)})
        if not cand:
            continue
        cand_files += 1
        cand_total += len(cand)
        if f.name not in real_files:
            holes.append(f"{f.name}（{len(cand)}本。例 {cand[:3]}）")
    print(f"    （配信IDの形をした11字を持つ焼き込み {cand_files} 本 / "
          f"見たファイル {len(real_files)} 本 / 形の通った11字 {cand_total} 個）")
    if cand_files == 0:
        print("::error::引用符の中に、配信IDの形をした11字が1つもありません"
              "（種が読めていない）", file=sys.stderr)
        return 2
    check("配信IDの形をした11字を持つのに、見たファイルに出ていない焼き込み", holes, [])

    # 本物が拾ったものが、ぜんぶ形の規則を通ること。
    # **通らないものが在ったら、形の規則のほうが狭すぎる**
    # （名前で分かる `videoId:` にはわざと形を当てていないので、ここで気づける）
    check("本物の拾ったものが、ぜんぶ形の規則を通る",
          sorted(v for v in real if not _shape(v))[:5], [])

    # 6通りの書き方が、6本とも当たっているか。**どれか1つ欠けても本数は近い値になる**
    for name, shape in (
        ("onThisDay.ts", '"v":"…"（空白なし）'),
        ("cityStreams.ts", '"videoId": "…"'),
        ("countries.ts", 'videoId: "…"'),
        ("nordic.ts", 'video: "…"'),
        ("chapterStreams.ts", '["日付", "…", …]'),
        ("streamPeaks.ts", '"…": {…}'),
        ("shorts.ts", 'id: "…"'),
    ):
        got = len([v for v, s in real.items() if name in s.files])
        check(f"{name} から拾えた本数が 0 でない（{shape}）", got > 0, True)

    with tempfile.TemporaryDirectory(prefix="deadwatch-") as tmp:
        root = Path(tmp)

        # --- 2. 手をつけていない写しが、本番と同じ数になる（§15）-------------
        copy = root / "same"
        shutil.copytree(CONTENT, copy)
        same, same_files = scan_dir(copy)
        check("手をつけていない写しの本数", len(same), len(real))
        check("手をつけていない写しのファイル数", len(same_files), len(real_files))

        # --- 3. 拾ってはいけないものを拾わない -------------------------------
        # 11字だが配信ではないもの。**当てずっぽうの正規表現はここで分母を膨らませる**
        trap = root / "trap"
        trap.mkdir()
        (trap / "notvideo.ts").write_text(
            'export const X = [\n'
            '  { slug: "french-toas", id: "abcdefghijk", name: "aaaaaaaaaaa" },\n'
            '  { icon: "01234567890", channelId: "UCxxxxxxxxxx" },\n'
            '];\n',
            encoding="utf8",
        )
        got, _ = scan_dir(trap)
        check("配信ではない11字を拾わない", sorted(got), [])

        # 逆側。**同じ置き場に本物を1本足したら、その1本だけ拾う**
        (trap / "real.ts").write_text('export const Y = [{ videoId: "K6OnRFxE6xg" }];\n',
                                      encoding="utf8")
        got, got_files = scan_dir(trap)
        check("本物を1本足したら、その1本だけ拾う", sorted(got), ["K6OnRFxE6xg"])
        check("配信の入っていないファイルは、見たファイルに数えない", got_files, ["real.ts"])

        # --- 4. どの面に出ているか・近くの日付 -------------------------------
        many = root / "many"
        many.mkdir()
        (many / "legends.ts").write_text(
            'export const L = [\n'
            '  { date: "2025-07-04", videoId: "p1-bliAqLJo", title: "x" },\n'
            '];\n', encoding="utf8")
        (many / "onThisDay.ts").write_text(
            'export const O = [{"d":"2025-07-04","v":"p1-bliAqLJo","t":"x"}];\n', encoding="utf8")
        got, _ = scan_dir(many)
        check("2つの面に出ている1本を、両方の面で数える",
              sorted(got["p1-bliAqLJo"].files), ["legends.ts", "onThisDay.ts"])
        check("近くにある日付を拾う", sorted(got["p1-bliAqLJo"].dates), ["2025-07-04"])

        # 日付が近くに無ければ、**埋めずに空**。嘘の日を出すほうが害が大きい
        nodate = root / "nodate"
        nodate.mkdir()
        (nodate / "a.ts").write_text(
            '// 2020-01-01 これは注釈で、この配信の日ではない\n'
            + "x\n" * 300
            + 'export const A = [{ videoId: "K6OnRFxE6xg" }];\n', encoding="utf8")
        got, _ = scan_dir(nodate)
        check("遠くにある日付は拾わない", sorted(got["K6OnRFxE6xg"].dates), [])

        # --- 5. 口を叩いたときの終了コード（ネットに出ない道だけ）------------
        empty = root / "empty"
        empty.mkdir()
        r = subprocess.run([sys.executable, str(WATCH), "--dir", str(empty)],
                           capture_output=True, text=True)
        check("置き場が空のときの終了コード", r.returncode, 2)

        r = subprocess.run([sys.executable, str(WATCH), "--dir", str(root / "ないところ")],
                           capture_output=True, text=True)
        check("置き場が無いときの終了コード", r.returncode, 2)

        r = subprocess.run([sys.executable, str(WATCH), "--ids"], capture_output=True, text=True)
        check("--ids のあとが空のときの終了コード", r.returncode, 2)

        # **`-` で始まる配信IDを、旗と間違えて黙って捨てない。**
        # 捨てると、渡した本数より少ない本数を測って、それを分母として出す
        # （`-BsqaHWdUpI` を渡したのに 8本しか測っていなかった）
        r = subprocess.run([sys.executable, str(WATCH), "--ids", "-BsqaHWdUpI", "--no-control",
                            "--no-deep", "--ないもの"], capture_output=True, text=True)
        check("配信IDの形でないものが混ざっていたら、測らずに止まる", r.returncode, 2)
        check("`-` で始まる配信IDを、形が違うと言わない",
              "-BsqaHWdUpI" in r.stderr, False)

        r = subprocess.run([sys.executable, str(WATCH), "--dir", str(trap), "--ids"],
                           capture_output=True, text=True)
        check("配信IDが1本も無い置き場では、ネットに出る前に止まる",
              "対照" in r.stdout, False)

    # --- 6. 2段目の読み。**両側から** ----------------------------------------
    # 字は 2026-09-17 に、既知の 403 5本・404 4本・録画なし 4本・生きている3本と、
    # **締め出されているときの返り**へ実際に当てて持ち帰ったもの。
    # **手で考えた文面を並べても対照にならない**
    says = (
        ("UNPLAYABLE", "This live stream recording is not available.", NO_REC),
        ("UNPLAYABLE", "このライブ ストリームの記録は、ご覧いただけません。", NO_REC),
        ("LIVE_STREAM_OFFLINE", "This live event will begin in a few moments.", NO_REC),
        # 実体をよこさないだけ＝**押せる**
        ("LOGIN_REQUIRED", "Sign in to confirm you\u2019re not a bot", OK),
        ("OK", "", OK),
        # **1段目と食い違うものは、ぜんぶ「分からない」。**
        # ここを「消えている」と読んだせいで、148本を誤って数えた
        ("ERROR", "Video unavailable", BLIND),
        ("UNPLAYABLE", "Video unavailable", BLIND),
        ("LOGIN_REQUIRED", "Private video", BLIND),
        ("LOGIN_REQUIRED", "Sign in to confirm your age", BLIND),
        ("UNPLAYABLE", "聞いたことのない断りかた", BLIND),
        ("UNPLAYABLE", "", BLIND),
        ("", "", BLIND),
    )
    for status, reason, want in says:
        check(f"2段目の答え「{status} / {reason[:32]}」", classify_player(status, reason), want)

    # **2段目が言ってよいのは3つだけ。** ここに `GONE` や `PRIVATE` が
    # 混ざると、締め出された返りが「島の死にリンク」に化ける
    check("2段目が返しうるのは、押せる・録画が無い・分からない の3つだけ",
          sorted({classify_player(a, b) for a, b, _ in says}), sorted({OK, NO_REC, BLIND}))
    for kind in (GONE, PRIVATE, OTHER):
        check(f"2段目は {kind} を返さない",
              any(classify_player(a, b) == kind for a, b, _ in says), False)

    # 締め出しの見分け。**本当に消えた配信と文面が同じで、status だけ違う**
    check("締め出されている返りを、締め出しとして拾う",
          is_throttled("UNPLAYABLE", "Video unavailable"), True)
    check("本当に消えた配信を、締め出しと読まない",
          is_throttled("ERROR", "Video unavailable"), False)
    check("録画が無い配信を、締め出しと読まない",
          is_throttled("UNPLAYABLE", "This live stream recording is not available."), False)
    check("生きている配信を、締め出しと読まない",
          is_throttled("LOGIN_REQUIRED", "Sign in to confirm you\u2019re not a bot"), False)

    # --- 7. 終了コードの決めかた。**足を1本ずつ抜く** ------------------------
    def verdict(kinds: list[str], blind_lines: list[str] | None = None) -> Verdict:
        probes = {f"v{i:011d}": Probe(f"v{i:011d}", k) for i, k in enumerate(kinds)}
        return Verdict(seen={k: Sighting() for k in probes}, probes=probes,
                       blind=list(blind_lines or []))

    check("ぜんぶ見られる → 0", decide(verdict([OK, OK, OK])), 0)
    check("1本でも見られない → 1", decide(verdict([OK, GONE, OK])), 1)
    check("録画が無いだけでも → 1", decide(verdict([OK, NO_REC])), 1)
    check("知らない返りでも → 1", decide(verdict([OK, OTHER])), 1)
    check("0件のまま測れなかったぶんが残る → 2（0件と言わない）",
          decide(verdict([OK, BLIND], ["測れなかった配信が 1本"])), 2)
    check("見つかったものがあるなら、測れなかったぶんがあっても 1",
          decide(verdict([GONE, BLIND], ["測れなかった配信が 1本"])), 1)

    # --- 8. 対照の id そのもの ----------------------------------------------
    for v in DEAD_CONTROL:
        check(f"死んだ側の対照 {v} は11字", len(v), 11)
        check(f"死んだ側の対照 {v} の11字目は、404 が返る字", v[-1] in TAIL_OK, True)
        check(f"死んだ側の対照 {v} は、島の焼き込みに入っていない", v in real, False)
    for v in LIVE_CONTROL:
        check(f"生きた側の対照 {v} は、島が実際に名指ししている配信", v in real, True)
    check("生きた側の対照は2本以上（1本が非公開になった晩に見張りごと止まらない）",
          len(LIVE_CONTROL) >= 2, True)
    # 2段目の対照は、**島が本物として持っている「押すと見られない」配信**。
    # 架空の id では、oembed が 200 を返す道そのものを通らない。
    #
    # **焼き込みに在ることを条件にしない。** #520 で戻らない7本を焼き込みから
    # 外したので、`LfUJ25h2f44` は `real` から消えた。そのとたんにここが落ちて、
    # **この対照は master で赤いまま残っていた**（どこからも走っていなかったので
    # 誰も気づかなかった。`docs/island-misses.md` #125）。
    # いま在るべき場所は取り置きのほう——**外した理由がまさに「押すと見られない」**なので、
    # そちらに在れば本物であることの証明になる
    known = set(real) | set(build.load(build.OUT)["ids"])
    for v in PLAY_CONTROL:
        check(f"2段目の対照 {v} は、島が本物として持っている配信"
              "（焼き込みか、押しても見られない取り置きのどちらか）", v in known, True)
        check(f"2段目の対照 {v} は、生きた側と重なっていない", v in LIVE_CONTROL, False)

    # --- 8b. 視聴者さんのものを持ち歩いていないか ----------------------------
    # `kitchenTalk.ts` と `voices.ts` には**表示名とアイコン**が入っていて、
    # 配信IDのすぐ隣に並んでいる。このリポジトリは公開で Actions のログも誰でも
    # 読めるので、**拾うのは配信IDと日付だけ**であることをここで見る
    carried = set()
    for sg in real.values():
        carried |= sg.files | sg.dates
    bad = sorted(x for x in carried
                 if "@" in x or x.startswith("UC") or not (x.endswith(".ts") or _is_day(x)))
    check("持ち歩いているのは、ファイル名と日付だけ", bad, [])
    check("配信IDに、名前らしきものが混ざっていない",
          sorted(v for v in real if "@" in v), [])

    # --- 9. 面の表に、抜けが無いか ------------------------------------------
    # **説明の無い焼き込みが1本でもあると、そこの死にリンクが「(面の説明がまだ無い)」
    # で流れる。** 焼き込みが1本増えた日に、静かに分母から落ちるのはここ
    check("配信を名指ししている焼き込みは、ぜんぶ面の表に載っている",
          sorted(set(real_files) - set(PAGES)), [])
    check("面の表に、もう配信を名指ししていない焼き込みが残っていない",
          sorted(set(PAGES) - set(real_files)), [])
    check("押し出す面と一覧の面で、面の表をちょうど覆っている",
          sorted(set(FRONT) | set(SIDE)), sorted(PAGES))
    check("押し出す面と一覧の面が重なっていない", sorted(set(FRONT) & set(SIDE)), [])

    # --- 10. 隠すほうと、覚えるほうを混ぜない --------------------------------
    # **ここが混ざると、この仕組みが在る意味が消える。**
    # 隠すほう（`dead_streams.json`）に 403 が入ると、あやとが公開に戻した日に
    # 島が知らないまま隠し続ける。覚えるほう（`dead_watch_seen.json`）に 403 が
    # 入らないと、**あやとが戻すまで毎晩17本ぶら下がって毎晩赤くなる。**
    # 毎晩赤いものは「いつもの赤」に化けて、本当に1本死んだ晩に見分けがつかない
    check("隠すほうに入れてよいのは、戻らない2種類だけ",
          sorted(build.FOREVER), sorted([GONE, NO_REC]))
    check("覚えるほうには、戻るほう（403 / 401）も入る",
          sorted(build.WATCHED), sorted([GONE, LOGIN, NO_REC, OTHER, PRIVATE]))
    for kind in (PRIVATE, LOGIN):
        check(f"隠すほうに {kind} を入れない", kind in build.FOREVER, False)
    for kind in (GONE, NO_REC, PRIVATE, LOGIN):
        check(f"覚えるほうは {kind} を覚える", kind in build.WATCHED, True)
    check("押せば見られるものは、どちらにも入れない",
          OK in build.FOREVER or OK in build.WATCHED, False)
    check("測れなかったものは、どちらにも入れない",
          BLIND in build.FOREVER or BLIND in build.WATCHED, False)

    # 隠すほうの入れ替えも、ここで両側から当てる（これまで対照が無かった）
    def probes_of(pairs) -> dict:
        return {v: Probe(v, k) for v, k in pairs}

    keep, added, dropped, _ = build.merge(
        {"aaaaaaaaaaa": {"kind": GONE, "since": "2026-01-01"}},
        probes_of([("aaaaaaaaaaa", GONE), ("bbbbbbbbbbb", PRIVATE),
                   ("ccccccccccc", NO_REC)]), "2026-09-18")
    check("隠すほう: 403 は足さない", sorted(keep), ["aaaaaaaaaaa", "ccccccccccc"])
    check("隠すほう: 最初に見つけた日は書き換えない",
          keep["aaaaaaaaaaa"]["since"], "2026-01-01")
    check("隠すほう: 新しく戻らなくなったものは足す", added, ["ccccccccccc"])
    _, _, dropped, _ = build.merge(
        {"aaaaaaaaaaa": {"kind": GONE, "since": "2026-01-01"}},
        probes_of([("aaaaaaaaaaa", PRIVATE)]), "2026-09-18")
    check("隠すほう: 403 に変わったら外す（戻せる相手を隠し続けない）",
          dropped, ["aaaaaaaaaaa（PRIVATE）"])
    keep, _, _, _ = build.merge(
        {"aaaaaaaaaaa": {"kind": GONE, "since": "2026-01-01"}},
        probes_of([("aaaaaaaaaaa", BLIND)]), "2026-09-18")
    check("隠すほう: 測れなかった晩に外さない", sorted(keep), ["aaaaaaaaaaa"])

    # --- 11. 今夜2段目に当てるぶんの選びかた（`pick_deep`）。**両側から** -----
    # 足は3本ある。**1本ずつ抜いて、そのたびに落ちること**を見る
    # （`docs/island-misses.md` #128 の決めごと1）
    live11 = [f"a{i:010d}" for i in range(5)]
    deep11 = {live11[0]: "2026-09-17",     # きのう見た
              live11[1]: "2026-01-01",     # うんと昔に見た
              live11[3]: "こわれた日付"}    # 読めない
    got = build.pick_deep(live11, deep11, known_bad=set(), today="2026-09-18")
    check("きのう深く見た id は、今夜は当てない", live11[0] in got, False)
    check("一度も深く見ていない id は、今夜当てる", live11[2] in got, True)
    check("30日たった id は、今夜当てる", live11[1] in got, True)
    check("日付が読めない id は、見直す側に倒す", live11[3] in got, True)
    got = build.pick_deep(live11, deep11, known_bad={live11[0]}, today="2026-09-18")
    check("もう「見られない」と知っている id は、きのう見ていても毎晩当てる",
          live11[0] in got, True)
    # **上限が効くこと**（毎晩の時間が読めなくなるのを止める）
    many = [f"b{i:010d}" for i in range(200)]
    check("初めて深く見るぶんに上限が効く",
          len(build.pick_deep(many, {}, set(), "2026-09-18", new_max=7)), 7)
    old = {v: "2026-01-01" for v in many}
    check("30日たったぶんに上限が効く",
          len(build.pick_deep(many, old, set(), "2026-09-18", recheck_max=9)), 9)
    check("30日たったぶんは、古い順に取る",
          build.pick_deep(["c0000000001", "c0000000002"],
                          {"c0000000001": "2026-02-02", "c0000000002": "2026-01-01"},
                          set(), "2026-09-18", recheck_max=1), ["c0000000002"])
    check("上限で溢れても、もう知っている見られないぶんは落とさない",
          "b0000000199" in build.pick_deep(many, {}, {"b0000000199"}, "2026-09-18",
                                           new_max=1), True)
    check("1段目が 200 と言っていない id は、選ばない",
          sorted(set(build.pick_deep(live11, deep11, {"zzzzzzzzzzz"}, "2026-09-18"))
                 - set(live11)), [])
    # 選んだ結果は `probe_all` に渡る。**渡していない id を混ぜたら止まる**
    # （#139 の決めごと7「分母は黙って縮む／膨らむ」）
    try:
        probe_all(["ddddddddddd"], deep=True, deep_pick=lambda _: ["eeeeeeeeeee"])
        check("2段目に、1段目を通っていない id を混ぜたら止まる", "通ってしまった", "止まる")
    except ValueError:
        check("2段目に、1段目を通っていない id を混ぜたら止まる", "止まる", "止まる")

    # --- 12. 深く見た日の覚えかた -------------------------------------------
    # **「押せば見られる」と分かったものだけ覚える。** 見られないもの・
    # 測れなかったものを覚えると、**次の晩に飛ばされて**、1段目の 200 だけで
    # 「もどりました」に化ける
    deep_now = build.merge_deep(
        {"aaaaaaaaaaa": "2026-01-01", "zzzzzzzzzzz": "2026-01-01"},
        ["aaaaaaaaaaa", "bbbbbbbbbbb", "ccccccccccc"],
        probes_of([("aaaaaaaaaaa", OK), ("bbbbbbbbbbb", NO_REC), ("ccccccccccc", BLIND)]),
        tracked={"aaaaaaaaaaa", "bbbbbbbbbbb", "ccccccccccc"}, today="2026-09-18")
    check("押せば見られると分かったら、その日を覚える",
          deep_now.get("aaaaaaaaaaa"), "2026-09-18")
    check("録画が無いと分かった id は、覚えに載せない（毎晩見直す）",
          "bbbbbbbbbbb" in deep_now, False)
    check("測れなかった id は、覚えに載せない（翌晩もう一度）",
          "ccccccccccc" in deep_now, False)
    check("島からも取り置きからも消えた id は、覚えから落とす",
          "zzzzzzzzzzz" in deep_now, False)

    # --- 13. 毎晩なんと言うか（`merge_seen`）。**両側から** ------------------
    was13 = {"aaaaaaaaaaa": {"kind": PRIVATE, "since": "2026-09-01"},
             "bbbbbbbbbbb": {"kind": NO_REC, "since": "2026-09-01"},
             "ccccccccccc": {"kind": GONE, "since": "2026-09-01"},
             "zzzzzzzzzzz": {"kind": PRIVATE, "since": "2026-09-01"}}
    tracked13 = {"aaaaaaaaaaa", "bbbbbbbbbbb", "ccccccccccc", "ddddddddddd"}
    after13, new13, back13, moved13, off13, blind13 = build.merge_seen(
        was13,
        probes_of([("aaaaaaaaaaa", PRIVATE),   # まだ見られない → 静か
                   ("bbbbbbbbbbb", OK),        # もどった
                   ("ccccccccccc", BLIND),     # 測れなかった
                   ("ddddddddddd", GONE)]),    # **新しく死んだ**
        tracked13, "2026-09-18")
    check("知っている id が、まだ見られない → 何も言わない",
          "aaaaaaaaaaa" in (new13 + back13 + moved13), False)
    check("知っている id が、まだ見られない → 覚えに残す",
          after13.get("aaaaaaaaaaa", {}).get("since"), "2026-09-01")
    check("知っている id が見られるようになった → もどった",
          back13, ["bbbbbbbbbbb（NO_REC→押せば見られる）"])
    check("もどった id は、覚えから外す", "bbbbbbbbbbb" in after13, False)
    check("測れなかった id は、覚えから外さない", "ccccccccccc" in after13, True)
    check("測れなかった id を、もどったと言わない", "ccccccccccc" in str(back13), False)
    check("知らなかった id が見られなくなった → 新しい", new13, ["ddddddddddd（GONE）"])
    check("新しく見られなくなった id の since は今日",
          after13.get("ddddddddddd", {}).get("since"), "2026-09-18")
    check("島からも取り置きからも消えた id は、覚えから外す", off13, ["zzzzzzzzzzz"])
    check("島から外れただけの id を、もどったと言わない",
          "zzzzzzzzzzz" in str(back13), False)
    check("測れなかったぶんを数えている", blind13, ["ccccccccccc"])

    # 種類が変わった（403 → 404 など）。**新しいとは言わないが、黙りもしない**
    _, new14, back14, moved14, _, _ = build.merge_seen(
        {"aaaaaaaaaaa": {"kind": PRIVATE, "since": "2026-09-01"}},
        probes_of([("aaaaaaaaaaa", GONE)]), {"aaaaaaaaaaa"}, "2026-09-18")
    check("知っている id の種類が変わった → 新しいとは言わない", new14, [])
    check("知っている id の種類が変わった → 黙りもしない",
          moved14, ["aaaaaaaaaaa（PRIVATE→GONE）"])
    check("種類が変わっただけで「もどった」と言わない", back14, [])

    # **覚えが空の朝は、17本ぜんぶが新顔になる＝赤い。** 安全な側に倒れること
    _, new15, _, _, _, _ = build.merge_seen(
        {}, probes_of([("aaaaaaaaaaa", PRIVATE)]), {"aaaaaaaaaaa"}, "2026-09-18")
    check("覚えが空なら、いま見られないものは新顔になる（黙らない側に倒れる）",
          new15, ["aaaaaaaaaaa（PRIVATE）"])

    # --- 14. 覚えの JSON に、素性が1文字も入らない --------------------------
    # 焼き込みには**表示名とアイコン**が配信IDの隣に並んでいる。このリポジトリは
    # 公開で Actions のログも誰でも読めるので、**書いた字そのもの**を見る
    with tempfile.TemporaryDirectory(prefix="deadseen-") as tmp:
        seen_path = Path(tmp) / "dead_watch_seen.json"
        build.save_seen(
            {"aaaaaaaaaaa": {"kind": PRIVATE, "since": "2026-09-18",
                             "files": ["cityStreams.ts"]}},
            {"bbbbbbbbbbb": "2026-09-18"}, seen_path)
        got = json.loads(seen_path.read_text(encoding="utf-8"))
        rows = list(got["ids"].values())
        keys = sorted({k for r in rows for k in r})
        check("覚えの1行が持つのは、種類・いつから・焼き込みのファイル名だけ",
              keys, ["files", "kind", "since"])
        check("覚えのファイル名は、焼き込みの `.ts` だけ",
              [f for r in rows for f in r.get("files", []) if not f.endswith(".ts")], [])
        check("覚えの配信IDは11字", [v for v in got["ids"] if not ID_RE.fullmatch(v)], [])
        check("深く見た日の一覧も、配信IDと日付だけ",
              [f"{v}={d}" for v, d in got["deep"].items()
               if not ID_RE.fullmatch(v) or not _is_day(d)], [])
        # 読み直して同じものになる（**次の晩がこれを引く**）
        again = build.load_seen(seen_path)
        check("書いたものを読み直せる", sorted(again["ids"]), ["aaaaaaaaaaa"])
        check("深く見た日も読み直せる", again["deep"], {"bbbbbbbbbbb": "2026-09-18"})
        check("覚えが無ければ空（投げない。空だと赤くなる側に倒れる）",
              build.load_seen(Path(tmp) / "ない.json"), {"ids": {}, "deep": {}})

        # --- 15. 測れなかった晩の終わりかた（ネットに出ない道だけ）----------
        # **数えるものが無い晩は、赤くしない・書かない・黙らない。**
        # ここは scan が先に落ちるので、口を1回も叩かない
        empty = Path(tmp) / "からっぽ"
        empty.mkdir()
        summary = Path(tmp) / "summary.md"
        env = dict(os.environ, GITHUB_STEP_SUMMARY=str(summary))
        r = subprocess.run([sys.executable, str(BUILD), "--data-dir", tmp,
                            "--dir", str(empty)], capture_output=True, text=True, env=env)
        check("数えるものが無い晩の終了コード（赤くしない）", r.returncode, 2)
        check("数えるものが無い晩は、run の1枚目に「測れませんでした」と残す",
              "測れませんでした" in summary.read_text(encoding="utf-8"), True)
        check("数えるものが無い晩に、増えた／増えていないを言い切らない",
              "1バイトも書き換えていません" in summary.read_text(encoding="utf-8"), True)
        check("数えるものが無い晩は、覚えを書き換えない",
              json.loads(seen_path.read_text(encoding="utf-8")) == got, True)

        r = subprocess.run([sys.executable, str(BUILD), "--data-dir", tmp,
                            "--dir", str(Path(tmp) / "ないところ")],
                           capture_output=True, text=True, env=env)
        check("置き場が無い晩の終了コード", r.returncode, 2)
        r = subprocess.run([sys.executable, str(BUILD), "--data-dir"],
                           capture_output=True, text=True, env=env)
        check("--data-dir のあとが空のときの終了コード", r.returncode, 2)

    print(f"対照 {len(ok) + len(ng)}件中 {len(ok)}件通った")
    for line in ng:
        print(f"::error::{line}")
    if not ok:
        print("::error::対照が0件です。種（site/content）が読めていません")
        return 2
    return 1 if ng else 0


if __name__ == "__main__":
    sys.exit(main())
