"""字幕だけの道（quick_captions.py・captions.lines・retry.sh・ワークフローの captions の job）の見張り。
**YouTube にも GitHub にも触らない。**

    python3 tools/shorts/ingest/quick_captions_selftest.py
    BREAK=skip python3 tools/shorts/ingest/quick_captions_selftest.py   # 守りを1つ外した版で回す（対照の子）

終了コード 0=通った / 1=落ちた / **2=数えるものが無い・外す字が見つからない**
（`docs/island-standards.md` §15）。

回し役（`python/selftest_runner.py`）が `tools/shorts/` を降りて拾う。要るのは openssl（封と開け）・
PyYAML（ワークフローを読む）・bash と coreutils の timeout（retry.sh）。どれも Selftests に在る。
yt-dlp は偽物（この見張りが一時フォルダに書く `yt_dlp` パッケージ。`python -m yt_dlp` で起きて、
口ごとに決めた返事をし、呼ばれた引数を控える）。

## 何を見るか

| 足 | 確かめること |
| --- | --- |
| `cmd` | yt-dlp に頼むのは字幕（自動・手動、ja-orig と ja）と info.json だけ。**媒体の形式（`-f`・`-S`・区間・まとめ）を頼まない・`--skip-download` が在る**。口・PO Token・Cookie は fetch と同じ形で渡る |
| `order` | ja-orig（話した言葉のまま）が ja より先。無ければ ja・vtt。空のファイルは取れたと数えない |
| `lines` | 1行1文: 1.2秒を越える息つぎ・句点・40字で切り、言い始めの秒が行の頭に付く。語の時刻の無い vtt は1行1つ |
| `fetch` | ボット確認の口は飛ばして次の口で取る・ja の字幕が無いと口2つが揃って言ったら見切る・断られ続けても5つの口で止まる・前に通った口から当たる・消された動画は1回で見切る |
| `seal` | 一周（偽の gate → 偽の yt-dlp → 整える → 封）。置くのは manifest・key.enc・payload.enc だけ。平文の manifest に題名も字幕も出ない。開くと 1行1文の captions.txt と題・長さがある。**封をしたら平文が残らない** |
| `gate` | gate が「止める」なら YouTube に当たらない（偽の yt-dlp が1度も呼ばれない）。「取らなかった」封を置いて 1 で帰る |
| `retry` | retry.sh: 通れば1回だけ・上限を越えたら切って1回だけ取り直す（止まったまま待たない）・2回とも駄目なら 1 |
| `ffmpeg` | ffmpeg.sh（偽の sudo / apt-get / dpkg / curl と、ffmpeg の無い PATH で）: 入っていれば apt に触らない・apt が通れば apt（`--no-install-recommends`・man-db の索引の作り直しを止めてから）・apt が止まったら上限で2回切って GitHub の静的ビルドの**版の決まった枝**（8.1 → 9.0。master の夜間版は当てない）に切り替える・枝が落とせなければ次の枝・名前と違う版（夜間版）を名乗るものは置かない・どれも落とせなければ 1・ffmpeg があれば書体だけ頼み、入らなくても進む |
| `workflow` | captions の job: plan のあと・fetch と同じ concurrency の枠・`contents: write` と `actions: read`・GH_TOKEN・Cookie の写しを必ず消す・ffmpeg も whisper も入れない。fetch はこの job のあと（`!cancelled()` で、字幕の道が無い回も走る）。道具を入れる段（captions / fetch / analyze）は apt・pip・npm・clone を全部 retry.sh に通し、段に `timeout-minutes` がある |

## 守りを1つずつ外す（§15「対照は、足の数だけ用意する」）

下の `CUTS` が本物の字を1か所だけ書き換えた写し（ingest の階・tools/clip/fetch.py・ワークフロー）を作り、
それで足を全部回す。**外した守りの足だけが落ちる**ことを確かめる。外す字が本物に見つからなければ
2 で落ちる（字を直したのに、ここを直し忘れた）。
"""

from __future__ import annotations

import importlib
import json
import os
import shutil
import subprocess
import sys
import tempfile
import time
import traceback
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
WF_REL = ".github/workflows/shorts_ingest.yml"
BREAK = os.environ.get("BREAK", "")

# 外す守り: 名前 → (ファイル（ingest の階か、リポジトリの根からの道）, 本物の字, 書き換えた字, 落ちるはずの足, 何を外すか)
CUTS: dict[str, tuple[str, str, str, set[str], str]] = {
    "skip": ("quick_captions.py", '        "--skip-download",\n', "",
             {"cmd"}, "媒体を落とさない（--skip-download）を外す"),
    "orig": ("quick_captions.py", 'LANGS = ("ja-orig", "ja")', 'LANGS = ("ja", "ja-orig")',
             {"order"}, "話した言葉のままの字幕（ja-orig）を先に選ぶのをやめる"),
    "gap": ("captions.py", "(prev is not None and t - prev > gap)", "(False)",
            {"lines"}, "息つぎで行を切るのをやめる"),
    "split": ("captions.py", "words += [(t, piece) for piece in SENT_SPLIT.split(w) if piece]",
              "words.append((t, w))", {"lines"}, "長い1語の中の句点で切らない"),
    "lone": ("captions.py", "        if w.strip() and not w.strip().strip(PUNCT):\n",
             "        if False:\n", {"lines"}, "句点だけの語を1行にする"),
    "nocaps": ("quick_captions.py", "        if no_caps >= NO_CAPS_AGREE:\n",
               "        if False:\n", {"fetch"}, "字幕が無いと揃って言われても見切らない"),
    "plain": ("quick_captions.py", "    shutil.rmtree(p, ignore_errors=True)\n", "    return\n",
              {"seal"}, "封をしたあとに平文を消さない"),
    "gate": ("quick_captions.py", "            if v.ok:\n", "            if True:\n",
             {"gate"}, "gate が止めても YouTube に当たりに行く"),
    # ffmpeg.sh は retry.sh の上に乗っている（apt を2回切ってから静的ビルドへ）ので、そちらも落ちる
    "once": ("retry.sh", "for n in 1 2; do", "for n in 1; do",
             {"retry", "ffmpeg"}, "止まったものを取り直さない"),
    "limit": ("retry.sh", '  cmd=(timeout --kill-after=15 "$lim" "$@")', '  cmd=("$@")',
              {"retry"}, "上限を置かない（止まったら待ち続ける）"),
    "needs": (WF_REL, "    needs: [plan, captions]\n", "    needs: plan\n",
              {"workflow"}, "fetch を字幕の道のあとにしない（同じ run で Cookie を2か所が握る）"),
    "wrap": (WF_REL, "          bash tools/shorts/ingest/ffmpeg.sh\n",
             "          sudo apt-get install -y -qq ffmpeg\n",
             {"workflow"}, "fetch の ffmpeg を上限なしの apt-get に戻す"),
    "static": ("ffmpeg.sh", '"${R[@]}" 180 curl -fsSL', 'exit 1; curl -fsSL',
               {"ffmpeg"}, "apt が詰まったときに静的ビルドへ切り替えない"),
    # 静的ビルドを master の夜間版に戻す（#1015。2026-10-23 に夜間版で -vsync が消えていて検査が止まった）
    "nightly": ("ffmpeg.sh", 'urls+=("$v|$BASE/ffmpeg-n${v}-latest-linux64-gpl-${v}.tar.xz")',
                'urls+=("$v|$BASE/ffmpeg-master-latest-linux64-gpl.tar.xz")',
                {"ffmpeg"}, "静的ビルドを版の決まった枝ではなく master の夜間版から落とす"),
    "vercheck": ("ffmpeg.sh", 'if [ "$got" != "url" ] && [[ "$ver" != "ffmpeg version n${got}"* ]]; then',
                 "if false; then", {"ffmpeg"}, "枝の名前で落としたものが別の版を名乗っても置く"),
    "nextbranch": ("ffmpeg.sh", '  echo "::warning::静的ビルド（${u%%|*}）が落とせない。次を当てる"\n',
                   "  break\n", {"ffmpeg"}, "最初の枝が落とせなければ、次の枝を当てずに諦める"),
    "present": ("ffmpeg.sh", 'if [ "${#need[@]}" -eq 0 ]; then', "if false; then",
                {"ffmpeg"}, "入っていても apt に触る"),
    "mandb": ("ffmpeg.sh", 'sudo rm -f "${MANDB_FLAG:-/var/lib/man-db/auto-update}"', ":",
              {"ffmpeg"}, "man-db の索引の作り直しを止めずに apt で入れる"),
}

TITLE = "偽の題（題名は平文に出ない）"
WORD = "フォカッチャ"

# 生の文字列（r'''…'''）にしない。`"鍵": "値"` を含む生の文字列は、TS を字で読む正規表現の
# 見張り（python/ts_readers_selftest.py）が「読み手が生えた」と数える
FAKE_MAIN = '''
import json, os, sys
from pathlib import Path
a = sys.argv[1:]
if "--version" in a:
    print("2026.10.01-fake")
    sys.exit(0)
with open(os.environ["FAKE_YT_LOG"], "a", encoding="utf-8") as f:
    f.write(json.dumps(a) + "\\n")
plan = json.loads(os.environ.get("FAKE_YT_PLAN") or "{}")
client = next((x.split("=", 1)[1] for x in a if x.startswith("youtube:player_client=")), "")
mode = plan.get(client, plan.get("*", "ok"))
if mode == "bot":
    print("ERROR: [youtube] x: Sign in to confirm you're not a bot", file=sys.stderr)
    sys.exit(1)
if mode == "unavail":
    print("ERROR: [youtube] x: Video unavailable", file=sys.stderr)
    sys.exit(1)
d = Path(a[a.index("-o") + 1]).parent
caps = {} if mode == "nocaps" else {"ja-orig": [{}], "ja": [{}]}
(d / "src.info.json").write_text(json.dumps({"id": a[-1][-11:], "title": os.environ["FAKE_TITLE"],
    "duration": 3725, "automatic_captions": caps, "subtitles": {}}, ensure_ascii=False))
if mode == "nocaps":
    sys.exit(0)
w = os.environ["FAKE_WORD"]
ev = [{"tStartMs": 0, "dDurationMs": 4000, "segs": [{"utf8": "こんにちは"},
       {"utf8": "今日は", "tOffsetMs": 600}, {"utf8": "パンを", "tOffsetMs": 1100},
       {"utf8": "焼きます", "tOffsetMs": 1500}]},
      {"tStartMs": 2000, "aAppend": 1, "segs": [{"utf8": "\\n"}]},
      {"tStartMs": 6000, "dDurationMs": 3000, "segs": [{"utf8": w}, {"utf8": "です", "tOffsetMs": 500}]},
      {"tStartMs": 3723000, "dDurationMs": 1500, "segs": [{"utf8": "おわり"}]}]
(d / "src.ja-orig.json3").write_text(json.dumps({"events": ev}, ensure_ascii=False))
'''


class Ctx:
    """足に渡すもの。ing（ingest の階）・root（ワークフローの根）・tmp（使い捨て）。"""

    def __init__(self, ing: Path, root: Path, tmp: Path):
        self.ing, self.root, self.tmp = ing, root, tmp
        fake = tmp / "fake" / "yt_dlp"
        fake.mkdir(parents=True, exist_ok=True)
        # 名前を字のまま書かない。見張りの棚卸し（python/watch_census_selftest.py）が、見張りの中に
        # 出てくる `○○.py` を呼んでいる先として引き、python/ の下の同じ名前と取り違えて止まる
        (fake / ("__init__" + ".py")).write_text("")
        (fake / ("__main__" + ".py")).write_text(FAKE_MAIN)
        self.log = tmp / "fake.log"
        os.environ["PYTHONPATH"] = str(tmp / "fake")
        os.environ.update(FAKE_YT_LOG=str(self.log), FAKE_TITLE=TITLE, FAKE_WORD=WORD,
                          FAKE_YT_PLAN="{}")
        os.environ.pop("CLIP_COOKIES_FILE", None)
        sys.path.insert(0, str(ing))
        self.qc = importlib.import_module("quick_captions")
        self.captions = importlib.import_module("captions")
        self.gate = importlib.import_module("gate")
        self.decrypt = importlib.import_module("decrypt")
        self.plan = importlib.import_module("plan")
        self._key = None

    def calls(self) -> list[list[str]]:
        if not self.log.exists():
            return []
        return [json.loads(x) for x in self.log.read_text().splitlines() if x.strip()]

    def key(self) -> tuple[Path, str]:
        if self._key is None:
            priv = self.tmp / "k.pem"
            subprocess.run(["openssl", "genpkey", "-algorithm", "RSA", "-pkeyopt",
                            "rsa_keygen_bits:2048", "-out", str(priv)], check=True,
                           capture_output=True)
            pub = subprocess.run(["openssl", "pkey", "-in", str(priv), "-pubout"], check=True,
                                 capture_output=True, text=True).stdout
            self._key = (priv, pub)
        return self._key

    def stub_gate(self, ok: bool):
        g = self.gate

        class Stub:
            calls = 0

            def heading(self):
                return "見るワークフロー（偽）"

            def wait(self):
                Stub.calls += 1
                return g.Verdict(ok, "clear" if ok else "timeout",
                                 "偽 → 通る" if ok else "60分待っても終わらない: 偽 → 止める")

        stub = Stub()
        self.qc.Gate = type("G", (), {"from_env": staticmethod(lambda **kw: stub)})
        return Stub

    def run_main(self, name: str, ok_gate: bool, plan: dict) -> tuple[int, Path, Path, dict]:
        """quick_captions.main を1本ぶん回す。（rc, 封の置き場, RUNNER_TEMP, item）。"""
        priv, pub = self.key()
        it = self.plan.items_of({"mode": "captions", "videos": ["VusdZVyjgjQ"], "pubkey": pub},
                                "selftest")[0]
        base = self.tmp / name
        rt, sealed = base / "rt", base / "sealed"
        rt.mkdir(parents=True)
        items = base / "items.json"
        items.write_text(json.dumps({"include": [it]}))
        os.environ["FAKE_YT_PLAN"] = json.dumps(plan)
        old = (sys.argv, os.environ.get("RUNNER_TEMP"))
        os.environ["RUNNER_TEMP"] = str(rt)
        sys.argv = ["quick_captions.py", str(items), str(sealed)]
        try:
            rc = self.qc.main()
        finally:
            sys.argv = old[0]
            if old[1] is None:
                os.environ.pop("RUNNER_TEMP", None)
            else:
                os.environ["RUNNER_TEMP"] = old[1]
        return rc, sealed / it["key"], rt, it


# ---------------------------------------------------------------- 足

def leg_cmd(c: Ctx) -> list[str]:
    bad = []
    ck = c.tmp / "cookies.txt"
    ck.write_text("# Netscape HTTP Cookie File\n.youtube.com\tTRUE\t/\tTRUE\t0\tX\tY\n")
    os.environ["CLIP_COOKIES_FILE"] = str(ck)
    try:
        a = c.qc.sub_cmd("tv", c.tmp / "d", "VusdZVyjgjQ")
    finally:
        os.environ.pop("CLIP_COOKIES_FILE", None)
    for flag in ("--skip-download", "--write-auto-subs", "--write-subs", "--write-info-json"):
        if flag not in a:
            bad.append(f"{flag} が無い")
    langs = a[a.index("--sub-langs") + 1] if "--sub-langs" in a else ""
    if set(langs.split(",")) != {"ja-orig", "ja"}:
        bad.append(f"字幕の言語が ja-orig と ja でない（{langs!r}）")
    for flag in ("-f", "-S", "--download-sections", "--merge-output-format", "--write-comments"):
        if flag in a:
            bad.append(f"媒体の形式を頼んでいる（{flag}）")
    if "youtube:player_client=tv" not in a:
        bad.append("口（player_client）が渡っていない")
    if not any(x.startswith("youtubepot-bgutilscript:server_home=") for x in a):
        bad.append("PO Token（bgutil）が渡っていない")
    if "--cookies" not in a or a[a.index("--cookies") + 1] != str(ck):
        bad.append("Cookie の写しが渡っていない")
    if not a[-1].endswith("watch?v=VusdZVyjgjQ"):
        bad.append(f"動画の URL が最後に無い（{a[-1]}）")
    return bad


def leg_order(c: Ctx) -> list[str]:
    bad = []
    d = c.tmp / "order"
    d.mkdir()
    (d / "src.ja.json3").write_text("{}")
    (d / "src.ja-orig.vtt").write_text("WEBVTT\n")
    got = c.qc.pick_sub(d)
    if not got or got[0] != "ja-orig":
        bad.append(f"ja と ja-orig が両方あるのに ja-orig を選ばない（{got}）")
    (d / "src.ja-orig.vtt").write_text("")
    got = c.qc.pick_sub(d)
    if not got or got[1].name != "src.ja.json3":
        bad.append(f"空の ja-orig を取れたと数えた（{got}）")
    (d / "src.ja.json3").unlink()
    (d / "src.ja.vtt").write_text("WEBVTT\n")
    got = c.qc.pick_sub(d)
    if not got or got[1].name != "src.ja.vtt":
        bad.append(f"json3 が無いとき vtt に落ちない（{got}）")
    return bad


def leg_lines(c: Ctx) -> list[str]:
    bad = []
    L = c.captions.lines
    rows = [{"start": 0.0, "text": "a", "words": [{"t": 0.0, "w": "あ"}, {"t": 0.4, "w": "い"},
                                                  {"t": 0.8, "w": "う"}]},
            {"start": 1.5, "text": "b", "words": [{"t": 1.5, "w": "え"}, {"t": 1.9, "w": "お"}]},
            {"start": 5.0, "text": "c", "words": [{"t": 5.0, "w": "か"}, {"t": 5.3, "w": "き。"},
                                                  {"t": 5.6, "w": "く"}]}]
    got = L(rows)
    want = [(0.0, "あいうえお"), (5.0, "かき。"), (5.6, "く")]
    if got != want:
        bad.append(f"行の切りかたが違う: {got}（欲しいのは {want}）")
    long = [{"start": 0.0, "text": "x", "words": [{"t": i * 0.2, "w": "あいう"} for i in range(20)]}]
    got = L(long)
    if not got or max(len(s) for _, s in got) > 42 or len(got) < 2:
        bad.append(f"40字で切っていない（{[len(s) for _, s in got]}）")
    vtt = [{"start": 10.0, "end": 12.0, "text": "一つめ"}, {"start": 20.0, "end": 21.0, "text": "二つめ"}]
    if L(vtt) != [(10.0, "一つめ"), (20.0, "二つめ")]:
        bad.append(f"語の時刻の無い字幕（vtt）が1行1つにならない（{L(vtt)}）")
    # 語の時刻を持たない長い1語（VusdZVyjgjQ に 128字のものがあった）は、中の句点で切る。
    # 息つぎのあとの句点だけの語は、前の文の尻に付ける（「。」1字の行を作らない）
    big = [{"start": 30.0, "text": "x", "words": [{"t": 30.0, "w": "一つめ。二つめ?三つ"}]},
           {"start": 33.0, "text": "y", "words": [{"t": 33.0, "w": "。"}]},
           {"start": 40.0, "text": "z", "words": [{"t": 40.0, "w": "四つ"}]},
           {"start": 45.0, "text": "w", "words": [{"t": 45.0, "w": "。"}]}]
    want = [(30.0, "一つめ。"), (30.0, "二つめ?"), (30.0, "三つ。"), (40.0, "四つ。")]
    if L(big) != want:
        bad.append(f"1語の中の句点で切らない・句点だけの行を作る: {L(big)}（欲しいのは {want}）")
    return bad


def leg_fetch(c: Ctx) -> list[str]:
    bad = []
    qc = c.qc
    clients = qc.download.clip.CLIENTS

    def go(name: str, plan: dict, first=None) -> dict:
        os.environ["FAKE_YT_PLAN"] = json.dumps(plan)
        return qc.fetch_one({"video": "VusdZVyjgjQ"}, c.tmp / f"fetch-{name}", first)

    r = go("bot1", {clients[0]: "bot", "*": "ok"})
    if not (r["ok"] and r["client"] == clients[1] and len(r["tries"]) == 2):
        bad.append(f"ボット確認の口を飛ばして次の口で取れない（{r['client']}・{len(r['tries'])}回）")
    if not (c.tmp / "fetch-bot1" / "src.ja-orig.json3").is_file():
        bad.append("取れたのに字幕のファイルが無い")
    r = go("nocaps", {"*": "nocaps"})
    if r["ok"] or len(r["tries"]) != qc.NO_CAPS_AGREE or "まだ無い" not in (r["why"] or ""):
        bad.append(f"字幕が無いと口{qc.NO_CAPS_AGREE}つが言っても見切らない（{len(r['tries'])}回・{r['why']}）")
    r = go("allbot", {"*": "bot"})
    if r["ok"] or len(r["tries"]) != qc.MAX_CLIENTS:
        bad.append(f"断られ続けても {qc.MAX_CLIENTS}つの口で止まらない（{len(r['tries'])}回）")
    r = go("first", {"*": "ok"}, first="web_safari")
    if not r["tries"] or r["tries"][0]["client"] != "web_safari":
        bad.append("前に通った口から当たらない")
    r = go("gone", {"*": "unavail"})
    if r["ok"] or len(r["tries"]) != 1:
        bad.append(f"消された動画（Video unavailable）を1回で見切らない（{len(r['tries'])}回）")
    return bad


def leg_seal(c: Ctx) -> list[str]:
    bad = []
    stub = c.stub_gate(True)
    rc, d, rt, it = c.run_main("seal", True, {"*": "ok"})
    if rc != 0:
        bad.append(f"字幕が取れたのに 0 で帰らない（{rc}）")
    if stub.calls != 1:
        bad.append(f"gate を1本ごとに通らない（{stub.calls}回）")
    names = sorted(p.name for p in d.iterdir()) if d.is_dir() else []
    if names != ["key.enc", "manifest.json", "payload.enc"]:
        bad.append(f"置くものが manifest・key.enc・payload.enc だけでない（{names}）")
        return bad
    man_text = (d / "manifest.json").read_text(encoding="utf-8")
    if TITLE in man_text or WORD in man_text:
        bad.append("平文の manifest に題名か字幕が出ている")
    man = json.loads(man_text)
    if man.get("status") != "ok" or man.get("dest") != "VusdZVyjgjQ/captions" \
            or not (man.get("counts") or {}).get("caption_lines"):
        bad.append(f"manifest の状態・置き場・行数が違う（{man.get('status')}・{man.get('dest')}・"
                   f"{man.get('counts')}）")
    left = [p for p in rt.rglob("*") if p.is_file()]
    if left:
        bad.append(f"封をしたあとに平文が残っている（{[str(p.relative_to(rt)) for p in left][:4]}）")
    priv, _ = c.key()
    out = c.tmp / "seal-open"
    out.mkdir()
    ok, msg = c.decrypt.open_one(d, priv, c.decrypt.pub_fp(priv), out)
    if not ok:
        bad.append(f"開けない（{msg}）")
        return bad
    o = out / "VusdZVyjgjQ" / "captions"
    txt = (o / "captions.txt").read_text(encoding="utf-8") if (o / "captions.txt").exists() else ""
    rows = [ln for ln in txt.splitlines() if ln.startswith("[")]
    # 切りかたそのものは lines の足が見る。ここは「封の中に読む形がある」まで
    if not rows or not rows[0].startswith("[0:00:00] こんにちは") or WORD not in txt \
            or not txt.startswith(f"# {TITLE}\n"):
        bad.append(f"開いた captions.txt が頭に題・`[H:MM:SS] 文` の並びでない（{rows[:3]}）")
    meta = json.loads((o / "meta.json").read_text(encoding="utf-8"))
    if meta.get("title") != TITLE or meta.get("duration") != 3725 or meta.get("duration_hms") != "1:02:05":
        bad.append(f"題・長さが meta.json に無い（{meta.get('duration')}）")
    media = [p.name for p in o.rglob("*") if p.suffix in (".mkv", ".mp4", ".webm", ".m4a", ".opus")]
    if media:
        bad.append(f"媒体が封に入っている（{media}）")
    return bad


def leg_gate(c: Ctx) -> list[str]:
    bad = []
    before = len(c.calls())
    c.stub_gate(False)
    rc, d, rt, it = c.run_main("gate", False, {"*": "ok"})
    if len(c.calls()) != before:
        bad.append(f"gate が止めたのに yt-dlp を {len(c.calls()) - before}回呼んだ")
    if rc != 1:
        bad.append(f"取らなかったのに 1 で帰らない（{rc}）")
    if not (d / "manifest.json").is_file():
        bad.append("取らなかった封（manifest）を置かない")
    elif json.loads((d / "manifest.json").read_text()).get("status") != "failed":
        bad.append("取らなかった封の status が failed でない")
    else:
        priv, _ = c.key()
        out = c.tmp / "gate-open"
        out.mkdir()
        ok, _ = c.decrypt.open_one(d, priv, c.decrypt.pub_fp(priv), out)
        run = json.loads((out / "VusdZVyjgjQ/captions/run.json").read_text()) if ok else {}
        if "Cookie を使い始めなかった" not in ((run.get("fetch") or {}).get("why") or ""):
            bad.append("取らなかった理由が run.json に無い")
    return bad


def leg_retry(c: Ctx) -> list[str]:
    bad = []
    sh = c.ing / "retry.sh"
    cnt = c.tmp / "retry-count"
    job = c.tmp / "retry-job.sh"
    # 1回目は first の通りに振る舞い、2回目からは second の通り
    job.write_text('n=$(cat "$CNT" 2>/dev/null || echo 0); n=$((n+1)); echo "$n" > "$CNT"\n'
                   'if [ "$n" -eq 1 ]; then eval "$FIRST"; else eval "$SECOND"; fi\n')
    env = dict(os.environ, CNT=str(cnt), RETRY_PAUSE="0")

    def go(first: str, second: str, lim: int = 2) -> tuple[int, int, float]:
        cnt.unlink(missing_ok=True)
        t0 = time.time()
        try:
            r = subprocess.run(["bash", str(sh), str(lim), "bash", str(job)],
                               env=dict(env, FIRST=first, SECOND=second), capture_output=True,
                               text=True, timeout=60)
            rc = r.returncode
        except subprocess.TimeoutExpired:
            rc = -1
        n = int(cnt.read_text()) if cnt.exists() else 0
        return rc, n, time.time() - t0

    rc, n, _ = go("exit 0", "exit 0")
    if (rc, n) != (0, 1):
        bad.append(f"通ったのに走り直した・0 で帰らない（rc={rc}・{n}回）")
    rc, n, dt = go("sleep 20", "exit 0")
    if (rc, n) != (0, 2) or dt > 12:
        bad.append(f"止まったものを上限で切って取り直さない（rc={rc}・{n}回・{dt:.0f}秒）")
    rc, n, _ = go("exit 3", "exit 3")
    if (rc, n) != (1, 2):
        bad.append(f"2回とも駄目なのに 1 で帰らない・取り直しが1回でない（rc={rc}・{n}回）")
    return bad


MOCKS = {
    # sudo は頼まれたものをそのまま走らせる（root にはしない）
    "sudo": 'exec "$@"\n',
    "apt-get": ('echo "apt-get $*" >> "$FAKE_LOG"\n'
                'case "$*" in *update*) exit 0 ;; esac\n'
                'case "$FAKE_APT" in\n'
                '  hang) sleep 30 ;;\n'
                '  fail) exit 100 ;;\n'
                '  ok) case "$*" in *" ffmpeg"*) for b in ffmpeg ffprobe; do\n'
                '        printf \'#!/bin/sh\\necho "%s version apt"\\n\' "$b" > "$FFMPEG_BIN/$b";\n'
                '        chmod +x "$FFMPEG_BIN/$b"; done ;; esac ;;\n'
                'esac\n'),
    "dpkg": 'case "$1" in -s) case " $FAKE_DPKG_HAS " in *" $2 "*) exit 0 ;; esac; exit 1 ;; esac\nexit 0\n',
    "curl": ('echo "curl $*" >> "$FAKE_LOG"\n'
             '[ "$FAKE_CURL" = fail ] && exit 22\n'
             'case "$*" in *"${FAKE_CURL_FAIL_ON:-@@}"*) exit 22 ;; esac\n'
             'while [ "$#" -gt 0 ]; do [ "$1" = -o ] && { cp "$FAKE_TAR" "$2"; exit 0; }; shift; done\n'
             'exit 2\n'),
}
SYS_TOOLS = ("bash", "sh", "timeout", "sleep", "date", "mktemp", "tar", "xz", "find", "head", "cut",
             "rm", "install", "cat", "dirname", "cp", "chmod", "printf", "mkdir", "env")


def leg_ffmpeg(c: Ctx) -> list[str]:
    """ffmpeg.sh を、偽の sudo / apt-get / dpkg / curl と、ffmpeg の無い PATH で回す。"""
    bad = []
    base = c.tmp / "ffmpeg"
    mock, sysd = base / "mock", base / "sys"
    mock.mkdir(parents=True)
    sysd.mkdir()
    for name, body in MOCKS.items():
        (mock / name).write_text("#!/bin/bash\n" + body)
        (mock / name).chmod(0o755)
    for t in SYS_TOOLS:
        w = shutil.which(t)
        if not w:
            return [f"箱に {t} が無いので当てられない"]
        (sysd / t).symlink_to(w)
    # 静的ビルドの偽物（中に bin/ffmpeg と bin/ffprobe）。名乗る版ごとに: 8.1 の枝・9.0 の枝・
    # 枝の名前で置かれているのに中身が夜間版（ffmpeg.sh が置かずに止まるべきもの）
    tars = {}
    for key, ver in (("81", "n8.1.3-fake"), ("90", "n9.0.2-fake"), ("nightly", "N-127941-fake")):
        pkg = base / f"pkg-{key}" / "ffmpeg-static" / "bin"
        pkg.mkdir(parents=True)
        for b in ("ffmpeg", "ffprobe"):
            (pkg / b).write_text(f'#!/bin/sh\necho "{b} version {ver}"\n')
            (pkg / b).chmod(0o755)
        tars[key] = base / f"static-{key}.tar.xz"
        subprocess.run(["tar", "-cJf", str(tars[key]), "-C", str(base / f"pkg-{key}"), "."], check=True)

    def go(name: str, apt: str, have_ff: bool, args=(), curl: str = "ok", dpkg_has: str = "",
           tar: str = "81", fail_on: str = ""):
        binz = base / f"bin-{name}"
        binz.mkdir()
        if have_ff:
            for b in ("ffmpeg", "ffprobe"):
                (binz / b).write_text(f'#!/bin/sh\necho "{b} version here"\n')
                (binz / b).chmod(0o755)
        log = base / f"{name}.log"
        log.write_text("")
        flag = base / f"mandb-{name}"
        flag.write_text("")
        env = {"PATH": f"{mock}:{binz}:{sysd}", "FAKE_LOG": str(log), "FAKE_APT": apt,
               "MANDB_FLAG": str(flag),
               "FAKE_CURL": curl, "FAKE_TAR": str(tars[tar]), "FAKE_DPKG_HAS": dpkg_has,
               "FAKE_CURL_FAIL_ON": fail_on or "@@",
               "FFMPEG_BIN": str(binz), "RETRY_PAUSE": "0", "APT_UPDATE_SEC": "1",
               "APT_INSTALL_SEC": "1", "HOME": str(base)}
        t0 = time.time()
        try:
            r = subprocess.run([str(sysd / "bash"), str(c.ing / "ffmpeg.sh"), *args], env=env,
                               capture_output=True, text=True, timeout=90)
            rc = r.returncode
        except subprocess.TimeoutExpired:
            rc = -1
        ff = binz / "ffmpeg"
        # 偽の ffmpeg が名乗る出どころ（here / apt / 静的ビルドなら版の名前 n8.1.3-fake など）
        kind = ff.read_text().split("version ")[-1].strip().strip('"') if ff.exists() else None
        go.mandb_left = flag.exists()
        return rc, log.read_text().splitlines(), kind, time.time() - t0

    rc, calls, kind, _ = go("have", "ok", True)
    if rc != 0 or calls or not go.mandb_left:
        bad.append(f"入っているのに apt か curl に触った（rc={rc}・{calls[:2]}）")
    rc, calls, kind, _ = go("apt", "ok", False)
    inst = [x for x in calls if "install" in x]
    if rc != 0 or kind != "apt" or not inst or "--no-install-recommends" not in inst[0] \
            or any(x.startswith("curl") for x in calls):
        bad.append(f"apt が通るなら apt で入れる（--no-install-recommends・curl に触らない）（rc={rc}・{kind}）")
    if go.mandb_left:
        bad.append("apt で入れる前に man-db の索引の作り直しを止めていない")
    rc, calls, kind, dt = go("hang", "hang", False)
    inst = [x for x in calls if "install" in x]
    if rc != 0 or not str(kind).startswith("n8.1") or len(inst) != 2 or dt > 30:
        bad.append(f"apt が止まったら上限で2回切って静的ビルド（8.1 の枝）に切り替える"
                   f"（rc={rc}・{kind}・install {len(inst)}回・{dt:.0f}秒）")
    got = [x for x in calls if x.startswith("curl")]
    if len(got) != 1 or "/ffmpeg-n8.1-latest-linux64-gpl-8.1.tar.xz" not in got[0]:
        bad.append(f"静的ビルドを版の決まった枝（ffmpeg-n8.1-latest）から1回で落とさない（{got[:2]}）")
    # 8.1 の枝が下ろされていたら、9.0 の枝を当てる（夜間版には逃げない）
    rc, calls, kind, _ = go("next", "fail", False, tar="90", fail_on="ffmpeg-n8.1-")
    got = [x for x in calls if x.startswith("curl")]
    if rc != 0 or not str(kind).startswith("n9.0") or not got or "ffmpeg-n9.0-latest" not in got[-1]:
        bad.append(f"8.1 の枝が落とせないとき、9.0 の枝を当てて置かない（rc={rc}・{kind}・{got[-1:]}）")
    # 枝の名前で落としたのに、中身が夜間版を名乗る。置かずに 1
    rc, calls, kind, _ = go("liar", "fail", False, tar="nightly")
    if rc == 0 or kind is not None:
        bad.append(f"8.1 の枝のはずが夜間版を名乗るものを置いた（rc={rc}・{kind}）")
    # 止まるのではなく断られる apt（待たずに済む）で、静的ビルドも落とせない形
    rc, calls, kind, _ = go("nocurl", "fail", False, curl="fail")
    if rc == 0 or kind is not None:
        bad.append(f"静的ビルドも落とせないのに 0 で帰った（rc={rc}）")
    got = [x for x in calls if x.startswith("curl")]
    if any("master" in x for x in got) or not any("ffmpeg-n9.0-latest" in x for x in got):
        bad.append(f"どの枝も落とせないとき、夜間版に逃げた・枝を全部当てていない（{got}）")
    rc, calls, kind, _ = go("font", "fail", True, args=("fonts-dejavu-core",))
    inst = [x for x in calls if "install" in x]
    if rc != 0 or not inst or "fonts-dejavu-core" not in inst[0] or " ffmpeg" in inst[0]:
        bad.append(f"ffmpeg があるなら書体だけを頼み、入らなくても進む（rc={rc}・{inst[:1]}）")
    rc, calls, _, _ = go("fontok", "ok", True, args=("fonts-dejavu-core",),
                         dpkg_has="fonts-dejavu-core")
    if rc != 0 or calls:
        bad.append(f"書体も入っているのに apt に触った（{calls[:1]}）")
    return bad


def leg_workflow(c: Ctx) -> list[str]:
    import yaml

    bad = []
    doc = yaml.safe_load((c.root / WF_REL).read_text(encoding="utf-8"))
    jobs = doc.get("jobs") or {}
    cap, fetch, plan = jobs.get("captions") or {}, jobs.get("fetch") or {}, jobs.get("plan") or {}
    if not cap:
        return ["captions の job が無い"]
    needs = cap.get("needs")
    if needs not in ("plan", ["plan"]):
        bad.append(f"captions が plan のすぐあとでない（needs={needs}）")
    if "captions_count" not in str(cap.get("if")):
        bad.append("captions の job が captions_count を見て走らない")
    if (cap.get("concurrency") or {}).get("group") != (fetch.get("concurrency") or {}).get("group"):
        bad.append("captions が fetch と同じ concurrency の枠に入っていない")
    perm = cap.get("permissions") or {}
    if perm.get("contents") != "write" or perm.get("actions") not in ("read", "write"):
        bad.append(f"captions の権限が contents: write・actions: read でない（{perm}）")
    steps = {s.get("name"): s for s in cap.get("steps") or [] if s.get("name")}
    grab = steps.get("字幕だけ取って封をする") or {}
    env = grab.get("env") or {}
    if "quick_captions.py" not in str(grab.get("run")) or "GH_TOKEN" not in env \
            or "BGUTIL_HOME" not in env or "outputs.captions }}" not in str(env.get("ITEMS")):
        bad.append("字幕を取る段が quick_captions.py を、GH_TOKEN・BGUTIL_HOME・plan の captions つきで呼ばない")
    rm = steps.get("Cookie の写しを消す") or {}
    if "always()" not in str(rm.get("if")) or "clip_cookies" not in str(rm.get("run")):
        bad.append("Cookie の写しを必ず消す段が無い")
    put = steps.get("作業枝に置く") or {}
    if "push.sh" not in str(put.get("run")) or "SEALED=" not in str(put.get("run")):
        bad.append("作業枝に置く段が、封ごとに SEALED を指して push.sh を回さない")
    names = list(steps)
    if names.index("Cookie の写しを消す") > names.index("作業枝に置く") if \
            {"Cookie の写しを消す", "作業枝に置く"} <= set(names) else True:
        bad.append("Cookie の写しを消す前に作業枝に置いている（または段が無い）")
    allrun = " ".join(str(s.get("run")) for s in cap.get("steps") or [])
    if "ffmpeg" in allrun or "whisper" in allrun:
        bad.append("captions の job が ffmpeg か whisper を入れている（媒体を扱わないのに）")
    fneeds = fetch.get("needs") or []
    if "captions" not in fneeds or "plan" not in fneeds:
        bad.append(f"fetch が captions のあとでない（needs={fneeds}）")
    if "!cancelled()" not in str(fetch.get("if")) or "outputs.count" not in str(fetch.get("if")):
        bad.append("fetch が、字幕の道が無い・落ちた回に走らない（!cancelled() と count が無い）")
    outs = plan.get("outputs") or {}
    if "captions" not in outs or "captions_count" not in outs:
        bad.append("plan が captions / captions_count を出していない")
    opts = (((doc.get(True) or doc.get("on") or {}).get("workflow_dispatch") or {})
            .get("inputs") or {}).get("mode", {}).get("options") or []
    if "captions" not in opts:
        bad.append("workflow_dispatch の mode に captions が無い")
    for jn in ("captions", "fetch", "analyze"):
        st = [s for s in (jobs.get(jn) or {}).get("steps") or [] if s.get("name") == "道具を入れる"]
        if not st:
            bad.append(f"{jn} に「道具を入れる」の段が無い")
            continue
        if not st[0].get("timeout-minutes"):
            bad.append(f"{jn} の「道具を入れる」に timeout-minutes が無い")
        run = str(st[0].get("run"))
        if 'R="bash tools/shorts/ingest/retry.sh"' not in run:
            bad.append(f"{jn} の「道具を入れる」が retry.sh を使っていない")
        for ln in run.splitlines():
            s = ln.strip()
            if s.startswith("#"):
                continue
            if any(k in s for k in ("apt-get ", "pip install", "npm ", "git clone")) \
                    and not s.startswith(("$R ", "archive|reference) $R ")) \
                    and not s.startswith("https://"):
                bad.append(f"{jn}: 上限なしで走るコマンドがある（{s[:60]}）")
        if jn in ("fetch", "analyze") and "bash tools/shorts/ingest/ffmpeg.sh" not in run:
            bad.append(f"{jn} が ffmpeg を ffmpeg.sh（apt が詰まったら静的ビルド）で入れていない")
    return bad


LEGS = {"cmd": leg_cmd, "order": leg_order, "lines": leg_lines, "fetch": leg_fetch,
        "seal": leg_seal, "gate": leg_gate, "retry": leg_retry, "ffmpeg": leg_ffmpeg,
        "workflow": leg_workflow}


def run_legs(ing: Path, root: Path, tmp: Path, quiet: bool = False) -> tuple[list[str], int]:
    c = Ctx(ing, root, tmp)
    failed, checked = [], 0
    for name, fn in LEGS.items():
        try:
            bad = fn(c)
        except Exception:  # noqa: BLE001 — 1本の足が倒れても残りの足を回す
            bad = ["例外: " + traceback.format_exc().strip().splitlines()[-1]]
        checked += 1
        if not quiet:
            print(f"  {'○' if not bad else '✕'} {name}" + ("" if not bad else "  " + " / ".join(bad)))
        if bad:
            failed.append(name)
    return failed, checked


def cut_copy(name: str, tmp: Path) -> tuple[Path, Path]:
    """本物を写して、CUTS の1か所だけ書き換える。（ingest の階, 根）。"""
    root = tmp / "repo"
    ing = root / "tools/shorts/ingest"
    shutil.copytree(HERE, ing, ignore=shutil.ignore_patterns("__pycache__"))
    (root / "tools/clip").mkdir(parents=True)
    shutil.copy(ROOT / "tools/clip/fetch.py", root / "tools/clip/fetch.py")
    (root / WF_REL).parent.mkdir(parents=True)
    shutil.copy(ROOT / WF_REL, root / WF_REL)
    rel, old, new, _, _ = CUTS[name]
    p = (root / rel) if "/" in rel else (ing / rel)
    text = p.read_text(encoding="utf-8")
    if text.count(old) != 1:
        print(f"✕ 外す字が {rel} に {text.count(old)}か所（1か所のはず）: {old!r}")
        sys.exit(2)
    p.write_text(text.replace(old, new), encoding="utf-8")
    return ing, root


def child(name: str) -> int:
    with tempfile.TemporaryDirectory() as td:
        ing, root = cut_copy(name, Path(td))
        work = Path(td) / "work"
        work.mkdir()
        failed, checked = run_legs(ing, root, work, quiet=False)
    print("LEGS_FAILED " + json.dumps(sorted(failed)))
    if checked == 0:
        return 2
    return 1 if failed else 0


def drill() -> list[str]:
    """守りを1つずつ外して、**その守りの足だけ**が落ちるかを見る"""
    print("[対照] 守りを1つずつ外すと、その足だけが落ちるか")
    bad = []
    for name, (_, _, _, want, why) in CUTS.items():
        env = {k: v for k, v in os.environ.items() if k != "PYTHONPATH"}
        env["BREAK"] = name
        r = subprocess.run([sys.executable, str(Path(__file__).resolve())], capture_output=True,
                           text=True, env=env, timeout=240, check=False)
        line = [ln for ln in r.stdout.splitlines() if ln.startswith("LEGS_FAILED ")]
        got = set(json.loads(line[-1][len("LEGS_FAILED "):])) if line else None
        hit = got == want and r.returncode == 1
        print(f"  {'○' if hit else '✕'} BREAK={name}（{why}）→ 落ちた足 "
              f"{sorted(got) if got is not None else '（読めない: ' + (r.stdout + r.stderr).strip()[-300:] + '）'}"
              f"（欲しいのは {sorted(want)}）")
        if not hit:
            bad.append(name)
    return bad


def main() -> int:
    if BREAK:
        return child(BREAK)
    print("[足] 本物で回す")
    with tempfile.TemporaryDirectory() as td:
        failed, checked = run_legs(HERE, ROOT, Path(td))
    os.environ.pop("PYTHONPATH", None)
    print()
    bad = drill()
    print()
    if checked == 0:
        print("✕ 1つも数えなかった。**「通りました」とは言わない**")
        return 2
    if failed or bad:
        if failed:
            print(f"✕ 落ちた足: {' / '.join(failed)}")
        if bad:
            print(f"✕ 対照が外れた: {' / '.join(bad)}（外しても、その足だけが落ちる形になっていない）")
        print("\nNG  字幕だけの道の見張り 落ちた")
        return 1
    print(f"○ {len(LEGS)}本の足が通り、守り {len(CUTS)}個を1つずつ外すと、その足だけが落ちた")
    print("\nOK  字幕だけの道の見張り 全部通った")
    return 0


if __name__ == "__main__":
    sys.exit(main())
