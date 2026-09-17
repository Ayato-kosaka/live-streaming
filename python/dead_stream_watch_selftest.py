"""**`python/dead_stream_watch.py` が、本当に拾うか・本当に黙るかを両側から見る。**

    python3 python/dead_stream_watch_selftest.py

終了コード 0=ぜんぶ通った / 1=外したものがある / 2=対照が1件も回っていない。

**ここはネットに出ない。** 出る側の対照（生きた id で 0件・死んだ id で 1件・
録画の無い id で `NO_REC`・届かない箱で 2）は見張り本体が毎回自分で回すもので、ここで見るのは
**口を持たない部分**——どこから配信IDを拾うか、yt-dlp の言い分をどう読むか、
終了コードをどう決めるか——の3つ。

## なぜ「落ちるまで壊す」だけでは対照にならないか

`island-misses.md` #128 の決めごと1。判定の足を1本ずつ抜く。
ここでいう足は3本ある。

| 足 | 抜くと何が起きるか |
| --- | --- |
| 拾う鍵（`videoId` / `"v"`） | 拾い漏らすと、見ていない配信が「見られる」に混ざる |
| 2段目の読み（`classify_player`） | `OK` に畳むと死にリンクが消える。逆に「消えている」と読むと、**締め出された返りが死にリンクに化ける**（実際に148本やった） |
| 終了コード（`decide`） | 見つかったのに 2 を返すと、本物の件数が「数えられなかった」に化ける |

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
for _pyc in (Path(__file__).resolve().parent / "__pycache__").glob("dead_stream_watch.*.pyc"):
    _pyc.unlink(missing_ok=True)

from dead_stream_watch import (  # noqa: E402
    BLIND, CONTENT, DEAD_CONTROL, FRONT, GONE, LIVE_CONTROL, NO_REC, OK, OTHER,
    PAGES, PLAY_CONTROL, PRIVATE, Probe, SIDE, Sighting, Verdict, classify_player,
    decide, is_throttled, scan_dir,
)

REPO = Path(__file__).resolve().parent.parent
WATCH = REPO / "python" / "dead_stream_watch.py"

# YouTube の id の11字目に立てる字。**ここを外すと oembed は 400 を返す**
TAIL_OK = set("AEIMQUYcgkosw048")

# 配信を名指ししている焼き込みの本数。**中身ではなく形**なので、
# 毎晩の焼き直しでは動かない（動くのは面を1つ足したときだけ）
WANT_FILES = 9

# **本数そのものは、ここに写さない。**
# 焼き直しは毎晩 videos を足すので、今日の数（2026-09-17 は 719）を書くと
# **翌朝には赤くなり、誰かが数字を書き換えるだけの作業になる。**
# そうやって手で合わせる見張りは、いずれ黙らされる
# （`docs/island-standards.md` 15章・`docs/island-misses.md` #102）。
#
# 見たいのは「拾う側が黙って縮んでいないか」なので、**別の拾いかたと
# 突き合わせる。** 下の2通りはどちらも本物の規則より狭いので、
# ここで拾えたものは本物でも必ず拾えていないとおかしい。
# 分母が増えても減っても、この関係は変わらない
SUBSET_RE = [
    re.compile(r'"v"\s*:\s*"([A-Za-z0-9_-]{11})"'),
    re.compile(r'videoId\s*:\s*"([A-Za-z0-9_-]{11})"'),
]


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
    real, real_files = scan_dir(CONTENT)
    check("配信を名指ししている焼き込みの本数", len(real_files), WANT_FILES)

    # **狭い拾いかたで拾えたものが、本物からこぼれていないか。**
    # 数を写さずに「縮んでいない」を見るのはこれ（上の SUBSET_RE の注）
    subset: set[str] = set()
    for f in sorted(CONTENT.rglob("*.ts")):
        t = f.read_text(encoding="utf8", errors="replace")
        for rx in SUBSET_RE:
            subset.update(rx.findall(t))
    # **落ちたときに270本ぶん並べない。** 公開のログに流れるので、
    # 件数と頭の5本で足りる（どれか1本を追えば原因は同じ）
    missed = sorted(subset - set(real))
    shown = f"{len(missed)}本 こぼれた（例 {missed[:5]}）" if missed else "0本"
    check("狭い拾いかたで拾えた配信が、本物からこぼれていない", shown, "0本")
    print(f"    （狭い拾いかた {len(subset)} 本 / 本物 {len(real)} 本 を突き合わせた）")

    # 3通りの書き方が、3本とも当たっているか。**どれか1つ欠けても本数は近い値になる**
    for name, shape in (
        ("onThisDay.ts", '"v":"…"（空白なし）'),
        ("cityStreams.ts", '"videoId": "…"'),
        ("countries.ts", 'videoId: "…"'),
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
    # 2段目の対照は、**島が実際に名指ししている「押すと見られない」配信**。
    # 架空の id では、oembed が 200 を返す道そのものを通らない
    for v in PLAY_CONTROL:
        check(f"2段目の対照 {v} は、島が実際に名指ししている配信", v in real, True)
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

    print(f"対照 {len(ok) + len(ng)}件中 {len(ok)}件通った")
    for line in ng:
        print(f"::error::{line}")
    if not ok:
        print("::error::対照が0件です。種（site/content）が読めていません")
        return 2
    return 1 if ng else 0


if __name__ == "__main__":
    sys.exit(main())
