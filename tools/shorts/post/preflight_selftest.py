"""**出す前の関所（`preflight.py`）と、`post.py` がそれを段の中で呼んでいるかの見張り。EC2 にも GitHub にも触らない。**

    python3 tools/shorts/post/preflight_selftest.py
    BREAK=article python3 tools/shorts/post/preflight_selftest.py   # 守りを1つ外した版で回す（対照の子）

終了コード 0=通った / 1=落ちた / 2=数えるものが無い・外す字が見つからない（`docs/island-standards.md` §15）。
台は `tools/shorts/feedback/legs.py`（外す字はその場で読み込む。写しを置かない）。`post.py` の `ec2` は偽物、台帳は使い捨ての写し。

| 足 | 確かめること |
| --- | --- |
| `approval` | あやと本人のコメントは通り、こちらの署名つき・bot の呼び出し・ほかの書き手・URL が無いは止める（F-002） |
| `approval_wire` | `post.py` の投稿の段は、承認が無ければ EC2 に触らずに止まり、通ったらコメントID を台帳の行に残す |
| `one` | ほかの案の pending（6時間以内）があれば、投稿の段が EC2 に触らずに止まる。同じ案・古い pending では止めない（F-085） |
| `article` | 記事のリンクが無い投稿文を止め、在れば通す（F-097） |
| `credit` | ポケットサウンドのクレジット・TikTok の #ポケットサウンド が無ければ止める（F-038） |
| `bgm` | 指示書の曲が pocket_csikos でなければ止める。あやとのコメントの URL を `not_csikos` に書いた回は通す（F-038） |
| `rounds` | あやとに見せた版が上限を越えたら、訳が無ければ止める（F-044） |
| `send_wire` | `post.py send` が、関所に当たる投稿文・指示書の無い送りを、送る前に止める |
| `instagram` | YouTube・TikTok に出した案（11-22 から）に Instagram が無ければ `clean` が止まる。そろっていれば片づける（F-090） |
| `plain` | 囲みの字だけの原稿は通し、`<details>` の外の表・囲みの中の欄の区切り・行番号は止める（F-098） |
| `gray` | 規約・権利を理由に「使えない・外す」と書いた行は、黒の前例の URL（`前例: https://…`）が無ければ止める。前例があれば・グレーとして使うと書けば・囲みの中なら通す。`issue-text` が止まる（F-001） |
| `looks` | 指示書の字の見た目（look_sheet.py の指紋）が控えに在れば通し、字幕の色を変えた様式は止める。音だけ変えた様式は同じ見た目。控えの chosen の行に URL が無い・baseline が増えたら止める（F-084） |
| `looks_wire` | `send` の関所が見た目を数え、`remote.py up` が下書きでない書き出しの前に見た目の関所を呼ぶ |
| `looks_pick` | 控えに足す（look_sheet.py chosen）のは、見本のコメントに印が在り、あやと本人が見本のあとに選んだときだけ |
| `gates_named` | 帳面の当てる場所の `post:<関所>` が全部 `GATES` に在り、`GATES` の鍵が全部どこかの項目に名指されている |
| `passed` | あやとが通して出した ①〜④ の投稿文（記事・クレジット）は通る |
"""
from __future__ import annotations

import contextlib
import io
import json
import re
import sys
import tempfile
import types
from contextlib import redirect_stdout
from datetime import datetime, timedelta, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
sys.path.insert(0, str(ROOT / "tools/shorts/feedback"))
sys.path.insert(0, str(ROOT / "python"))
sys.path.insert(0, str(HERE))
import legs  # noqa: E402

LEDGER_MD = ROOT / ".claude/skills/viral-shorts-creator/references/ayato_feedback.md"
VIDEOS = ROOT / "shorts/videos"

CUTS = {
    "owner": ("preflight.py", "    if not (is_ayato or _is_ayato())(c):\n", "    if False:\n", {"approval", "approval_wire"},
              "あやと本人のコメントかを見ない"),
    "no_ref": ("preflight.py", "    if not ref:\n        return None, (", "    if False:\n        return None, (", {"approval", "approval_wire"},
               "承認のコメントが無くても通す"),
    "wire_approval": ("post.py", "    cid, why = preflight.approval(getattr(a, \"approval\", None))\n    if why:\n",
                      "    cid, why = preflight.approval(getattr(a, \"approval\", None))\n    if False:\n", {"approval_wire"},
                      "post.py が承認の関所の答えで止まらない"),
    "record": ("post.py", ", a.again, approval=str(cid))", ", a.again)", {"approval_wire"}, "承認のコメントID を台帳に残さない"),
    "one": ("preflight.py", 'if r["state"] == "pending" and r["plan"] != plan and', 'if False and', {"one"}, "ほかの案の pending を数えない"),
    "one_old": ("preflight.py", " and now - _at(r[\"at\"]) < timedelta(hours=hours)]", "]", {"one"}, "止まった古い pending でも止める"),
    "article": ("preflight.py", "for where, t in texts(post) if not ARTICLE.search(t)]", "for where, t in texts(post) if False]",
                {"article", "send_wire"}, "記事のリンクを見ない"),
    "credit": ("preflight.py", "for where, t in texts(post) if CREDIT not in t]", "for where, t in texts(post) if False]",
               {"credit"}, "クレジットを見ない"),
    "bgm": ("preflight.py", "    if CSIKOS.search(name):\n        return []\n", "    if True:\n        return []\n", {"bgm"},
            "曲の名前を見ない"),
    "bgm_exempt": ("preflight.py", "    if APPROVED_BY.search(str(b.get(\"not_csikos\") or \"\")):\n",
                   "    if b.get(\"not_csikos\"):\n", {"bgm"}, "あやとのコメントの URL が無い訳でも、別の曲を通す"),
    "rounds": ("preflight.py", "    if n <= ROUNDS_MAX or (why or \"\").strip():\n", "    if True:\n", {"rounds"}, "版の数を見ない"),
    "send_edit": ("preflight.py", "    if edit_path is None:\n        return out + [", "    if False:\n        return out + [", {"send_wire"},
                  "指示書が無くても送る"),
    "wire_send": ("post.py", "    if stops:\n        print(\"止めた（送る前の関所）", "    if False:\n        print(\"止めた（送る前の関所）", {"send_wire"},
                  "post.py send が関所の答えで止まらない"),
    "ig": ("preflight.py", 'if "instagram" not in v and', 'if False and', {"instagram"}, "Instagram の抜けを数えない"),
    "wire_clean": ("post.py", "    if miss:\n        print(\"止めた: Instagram に出ていない案がある", "    if False:\n        print(\"止めた: Instagram に出ていない案がある",
                   {"instagram"}, "post.py clean が Instagram の抜けで止まらない"),
    "table": ("preflight.py", "        if details <= 0 and TABLE.match(ln):\n", "        if False:\n", {"plain"}, "表を見ない"),
    "fence": ("preflight.py", "        if fence:\n            for rx, what in IN_FENCE_BAD:", "        if False:\n            for rx, what in IN_FENCE_BAD:",
              {"plain"}, "囲みの中を見ない"),
    # ---- 2026-11-27: 控えの F-001・F-084 ----
    "gray": ("preflight.py", "        if r and b:\n", "        if False:\n", {"gray"}, "規約を理由に外すと書いた行を見ない"),
    "gray_prec": ("preflight.py", "    if PRECEDENT.search(text):\n        return []\n", "", {"gray"}, "黒の前例を並べても止める"),
    "gray_fence": ("preflight.py", "        if fence:\n            continue\n        r, b =", "        r, b =", {"gray"},
                   "囲みの中（原稿の字）の「規約」まで数える"),
    "wire_gray": ("preflight.py", "plain_why(body) + gray_why(body) if", "plain_why(body) if", {"gray"}, "issue-text がグレーの関所を呼ばない"),
    "looks": ("preflight.py", '    if fp not in {r.get("fp") for r in d["looks"]}:\n', "    if False:\n", {"looks", "looks_wire"},
              "控えに無い見た目を通す"),
    "looks_url": ("preflight.py", "        if not ok:\n", "        if False:\n",
                  {"looks"}, "URL の無い chosen の行（手で足した行）を数える"),
    "looks_base": ("preflight.py", "    if len(base) > LOOKS_BASELINE:\n", "    if False:\n", {"looks"}, "baseline を増やせる"),
    "wire_looks_send": ("preflight.py", " + looks_why(Path(edit_path))", "", {"looks_wire"}, "send が見た目の関所を呼ばない"),
    "wire_looks_up": ("remote.py", "            stops = [w for e in a.edits for w in preflight.looks_why(Path(e))]\n",
                      "            stops = []\n", {"looks_wire"}, "remote.py up が見た目の関所を呼ばない"),
    "pick_mark": ("look_sheet.py", '    if sheet.get("marker") not in str(c1.get("body") or ""):\n', "    if False:\n", {"looks_pick"},
                  "見本の印の無いコメントでも、見本を出したことにする"),
    "pick_owner": ("look_sheet.py", "    if not is_ayato(c2):\n", "    if False:\n", {"looks_pick"}, "あやと本人でない返事でも、選んだことにする"),
    "pick_order": ("look_sheet.py", '    elif str(c2.get("created_at") or "") < str(c1.get("created_at") or ""):\n', "    elif False:\n",
                   {"looks_pick"}, "見本より前の返事でも、選んだことにする"),
}

AYATO = {"user": {"login": "Ayato-kosaka", "type": "User"}, "body": "Aは今出して"}
SIGNED = {"user": {"login": "Ayato-kosaka", "type": "User"},
          "body": "A で出します。\n\n_Generated by [Claude Code](https://claude.ai/code)_"}
CALLED = {"user": {"login": "Ayato-kosaka", "type": "User"}, "body": "@Ayato-kosaka あやと島案内鳥が呼んでいます。A でよいですか"}
BOT = {"user": {"login": "github-actions[bot]", "type": "Bot"}, "body": "A"}
COMMENTS = {101: AYATO, 102: SIGNED, 103: CALLED, 104: BOT}
URL = "https://github.com/Ayato-kosaka/live-streaming/issues/1446#issuecomment-{}"
SHA = "c" * 64
GOOD_POST = {
    "youtube": {"description": "…\n記事 https://ayato-arigato.com/travel/bulgaria/sofia/mekitsa\nBGM：ポケットサウンド – https://pocket-se.info/"},
    "tiktok": {"caption": "…\n記事 https://ayato-arigato.com/travel/bulgaria/sofia/mekitsa\nBGM：ポケットサウンド – https://pocket-se.info/\n#ブルガリア #ポケットサウンド"},
}
POCKET = {"bgm": {"path": "/tmp/x/bgm/pocket_csikos.mp3"}}
# 見た目の見張りの様式（控えには、この見た目だけを入れておく）。send の足の指示書（POCKET）は様式を書かないので style.json を引く
LOOK = {"fonts": {"caption": "MPLUSRounded1c-Black.ttf"}, "caption": {"font": "caption", "size": 66, "color": "#FFFFFF", "stroke": 8},
        "audio": {"bgm_rms_dbfs": -30}}


class Box:
    """足に渡すもの: 読み込んだ preflight と post、偽物の ec2、使い捨ての置き場。"""

    def __init__(self, pre, post, posted, ec2, tmp: Path):
        self.pre, self.post, self.posted, self.ec2, self.tmp = pre, post, posted, ec2, tmp
        self.n = 0

    def file(self, name: str, data) -> Path:
        self.n += 1
        p = self.tmp / f"{self.n}_{name}"
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(data if isinstance(data, str) else json.dumps(data, ensure_ascii=False), encoding="utf-8")
        return p

    def ledger(self, rows) -> Path:
        p = self.file("posted.json", "[]")
        self.posted.save(rows, str(p))
        self.posted.LEDGER = str(p)
        return p

    def call(self, argv) -> tuple:
        self.ec2.calls.clear()
        buf = io.StringIO()
        try:
            with redirect_stdout(buf):
                rc = self.post.main(argv)
        except SystemExit as e:
            rc = e.code if isinstance(e.code, int) else 1
        return rc, buf.getvalue()


def fake_ec2():
    box = types.ModuleType("ec2")
    box.calls = []

    @contextlib.contextmanager
    def lease(lane, who=None, purpose="", **kw):
        yield "fake"

    def run(script, timeout=600, quiet=False):
        box.calls.append(script)
        if "sha256sum" in script:
            return 0, SHA + "\n"
        return 0, 'RESULT {"ok": true, "video_id": "selftestYT9"}'
    box.lease, box.run, box.put = lease, run, (lambda *a, **k: box.calls.append("put"))
    box.default_who, box.QueueError = (lambda: "selftest"), type("QueueError", (Exception,), {})
    return box


_TMP = tempfile.TemporaryDirectory(prefix="preflight-selftest-")


def setup(cut):
    c = CUTS[cut] if cut else None
    sys.modules["ec2"] = ec2 = fake_ec2()
    for n in ("post", "posted", "preflight", "look_sheet"):
        sys.modules.pop(n, None)
    ls = legs.load(ROOT / "tools/shorts/style/look_sheet.py", "look_sheet", (c[1], c[2]) if c and c[0] == "look_sheet.py" else None)
    ls.CHOSEN = Path(tempfile.mkdtemp(dir=_TMP.name)) / "looks_chosen.json"
    ls.CHOSEN.write_text(json.dumps({"looks": [{"fp": ls.fingerprint(LOOK), "from": "baseline", "style": "見張り"}]}), encoding="utf-8")
    pre = legs.load(HERE / "preflight.py", "preflight", (c[1], c[2]) if c and c[0] == "preflight.py" else None)
    pre.FETCH = lambda cid: COMMENTS[cid]
    post = legs.load(HERE / "post.py", "post", (c[1], c[2]) if c and c[0] == "post.py" else None)
    # send は send.py（GCS と Actions）を起こす。守りを外した子が本当に送らないように、起こす口を偽物にする
    post.subprocess = types.SimpleNamespace(run=lambda *a, **k: types.SimpleNamespace(returncode=0))
    posted = sys.modules["posted"]
    box = Box(pre, post, posted, ec2, Path(tempfile.mkdtemp(dir=_TMP.name)))
    box.ls = ls
    remote = (ROOT / "tools/shorts/render/remote.py").read_text(encoding="utf-8")
    box.remote = remote.replace(c[1], c[2]) if c and c[0] == "remote.py" else remote
    return box


def now_iso(hours_ago: float = 0) -> str:
    return (datetime.now(timezone.utc) - timedelta(hours=hours_ago)).strftime("%Y-%m-%dT%H:%M:%SZ")


def row(plan, place, state, vid=None, at=None, sha=SHA):
    return {"plan": plan, "place": place, "state": state, "id": vid, "sha256": sha, "at": at or now_iso()}


# ---- 足 ----
def leg_approval(b):
    ok = b.pre.approval(URL.format(101))
    bare = b.pre.approval("101")
    return [("あやと本人のコメント（「Aは今出して」）は通り、ID を返す", ok == (101, None)),
            ("ID だけでも引ける", bare == (101, None)),
            ("こちらの署名（Generated by）つきは止める", b.pre.approval(URL.format(102))[1] is not None),
            ("bot の呼び出し（あやと島案内鳥が呼んでいます）は止める", b.pre.approval(URL.format(103))[1] is not None),
            ("ほかの書き手（github-actions[bot]）は止める", b.pre.approval(URL.format(104))[1] is not None),
            ("承認のコメントが無ければ止める", b.pre.approval(None)[1] is not None),
            ("URL の形でなければ止める", b.pre.approval("A")[1] is not None)]


YT = ["yt-draft", "--video", "selftest000", "--option", "A", "--sha", SHA]


def leg_approval_wire(b):
    b.ledger([])
    rc0, text0 = b.call(YT)
    touched0 = list(b.ec2.calls)
    rc1, _ = b.call(YT + ["--approval", URL.format(102)])
    touched1 = list(b.ec2.calls)
    b.ledger([])
    rc2, _ = b.call(YT + ["--approval", URL.format(101)])
    rows = json.loads(Path(b.posted.LEDGER).read_text(encoding="utf-8"))
    return [(f"承認が無ければ止まる（{rc0}）・EC2 に触らない（{len(touched0)}回）", rc0 == 1 and not touched0 and "F-002" in text0),
            (f"署名つきのコメントでも止まる（{rc1}）・EC2 に触らない", rc1 == 1 and not touched1),
            (f"あやと本人のコメントなら出す（{rc2}）", rc2 == 0),
            ("台帳の行にコメントID（101）が残る", any(r.get("approval") == "101" for r in rows))]


def leg_one(b):
    other = row("other111/B", "tiktok", "pending", at=now_iso(1), sha="d" * 64)
    b.ledger([other])
    rc, text = b.call(YT + ["--approval", URL.format(101)])
    touched = list(b.ec2.calls)
    b.ledger([dict(other, at=now_iso(30))])
    rc_old, _ = b.call(YT + ["--approval", URL.format(101)])
    same = b.pre.others_pending([row("selftest000/A", "tiktok", "pending", sha="d" * 64)], "selftest000/A")
    return [(f"ほかの案が1時間前から pending なら止まる（{rc}）・EC2 に触らない", rc == 1 and not touched and "F-085" in text),
            (f"30時間前の止まった pending では止めない（{rc_old}。audit が出す）", rc_old == 0),
            ("同じ案の pending は数えない（台帳の refusal が見る）", same == [])]


def leg_article(b):
    bad = dict(GOOD_POST, tiktok={"caption": GOOD_POST["tiktok"]["caption"].replace("https://ayato-arigato.com/travel/bulgaria/sofia/mekitsa", "")})
    ig = dict(GOOD_POST, instagram={"caption": "記事なし"})
    return [("記事のリンクがあれば通す", b.pre.article_why(GOOD_POST) == []),
            ("TikTok のキャプションに無ければ止める", len(b.pre.article_why(bad)) == 1),
            ("Instagram のキャプションがあるなら、そこも見る", len(b.pre.article_why(ig)) == 1)]


def leg_credit(b):
    no_tag = dict(GOOD_POST, tiktok={"caption": GOOD_POST["tiktok"]["caption"].replace(" #ポケットサウンド", "")})
    no_yt = dict(GOOD_POST, youtube={"description": "記事 https://ayato-arigato.com/travel/x"})
    return [("クレジットと #ポケットサウンド があれば通す", b.pre.credit_why(GOOD_POST) == []),
            ("TikTok に #ポケットサウンド が無ければ止める", len(b.pre.credit_why(no_tag)) == 1),
            ("YouTube の説明にクレジットが無ければ止める", len(b.pre.credit_why(no_yt)) == 1)]


def leg_bgm(b):
    return [("pocket_csikos.mp3 は通す", b.pre.bgm_why(POCKET) == []),
            ("OtoLogic の版（csikos_fast.mp3）は止める", len(b.pre.bgm_why({"bgm": {"path": "x/csikos_fast.mp3"}})) == 1),
            ("曲が無ければ止める", len(b.pre.bgm_why({})) == 1),
            ("あやとが別の曲に決めた回（not_csikos にコメントの URL）は通す",
             b.pre.bgm_why({"bgm": {"path": "x/yurufuwa.mp3", "not_csikos": URL.format(5)}}) == []),
            ("not_csikos が URL でない訳（「猫の回だから」）なら止める",
             len(b.pre.bgm_why({"bgm": {"path": "x/yurufuwa.mp3", "not_csikos": "猫の回だから"}})) == 1)]


def versions(b, n: int) -> Path:
    base = b.tmp / f"vid{b.n}"
    b.n += 1
    for i in range(1, n + 1):
        (base / f"p{i}").mkdir(parents=True, exist_ok=True)
    e = base / f"p{n}" / f"edit_p{n}.json"
    e.write_text(json.dumps(POCKET), encoding="utf-8")
    return e


def leg_rounds(b):
    three, five = versions(b, 3), versions(b, 5)
    return [("あやとに見せた版が3つなら通す", b.pre.rounds_why(three, None) == []),
            ("5つなら、訳が無ければ止める", len(b.pre.rounds_why(five, None)) == 1),
            ("5つでも、訳を書けば通す", b.pre.rounds_why(five, "p2 の頼む文で題の決まりが抜けていた") == [])]


def leg_send_wire(b):
    d = b.tmp / f"send{b.n}"
    b.n += 1
    d.mkdir()
    (d / "A.mp4").write_bytes(b"x")
    bad = dict(GOOD_POST, youtube={"description": "BGM：ポケットサウンド – https://pocket-se.info/"})
    (d / "post_A.json").write_text(json.dumps(bad, ensure_ascii=False), encoding="utf-8")
    edit = versions(b, 1)
    rc_bad, text = b.call(["send", "--dir", str(d), "--video", "v", "--option", "A", "--edit", str(edit)])
    sent_bad = list(b.ec2.calls)
    (d / "post_A.json").write_text(json.dumps(GOOD_POST, ensure_ascii=False), encoding="utf-8")
    rc_noedit, text2 = b.call(["send", "--dir", str(d), "--video", "v", "--option", "A"])
    return [(f"記事の無い投稿文は送る前に止まる（{rc_bad}）・EC2 に何も送らない", rc_bad == 1 and not sent_bad and "F-097" in text),
            (f"指示書（--edit）が無ければ止まる（{rc_noedit}）", rc_noedit == 1 and "--edit" in text2)]


def leg_instagram(b):
    yt = row("v1/A", "youtube", "done", "abcdefghijk", at="2026-11-27T00:00:00Z")
    tt = row("v1/A", "tiktok", "done", "7000000000000000009", at="2026-11-27T00:01:00Z")
    old = row("v0/A", "youtube", "done", "abcdefghijl", at="2026-11-01T00:00:00Z")
    b.ledger([yt, tt, old])
    rc, text = b.call(["clean", "--video", "v1"])
    miss = b.pre.ig_missing([yt, tt, old])
    ig = row("v1/A", "instagram", "done", "4000000000000000001", at="2026-11-27T00:02:00Z")
    full = b.pre.ig_missing([yt, tt, ig, old])
    return [("11-27 に YouTube・TikTok に出て Instagram が無い案を数える（11-01 の案は数えない）", miss == ["v1/A"]),
            (f"clean が片づける前に止まる（{rc}）", rc == 1 and "F-090" in text),
            ("Instagram の done があれば数えない", full == [])]


GOOD_ISSUE = """### 案A

```
ブルガリアのめちゃくちゃ美味しい揚げパンを食べてみた！
行列店って書いてあった揚げパン屋に来たら……
```

<details><summary>根拠と画</summary>

| # | 届く文 | 画 |
| --- | --- | --- |
| 1 | 題 | 店の前 |

</details>
"""


def leg_plain(b):
    table = "| # | 届く文 |\n| --- | --- |\n| 1 | 題 |\n"
    pipe = "```\n1. 題を読む\n```\n"
    secs = "```\n題を読む（0.0〜3.2秒）\n```\n"
    return [("囲みの字の原稿と、<details> に畳んだ表は通す", b.pre.plain_why(GOOD_ISSUE) == []),
            ("<details> の外の表は止める", len(b.pre.plain_why(table)) == 3),
            ("囲みの中の行番号は止める", len(b.pre.plain_why(pipe)) == 1),
            ("囲みの中の秒は止める", len(b.pre.plain_why(secs)) == 1)]


def leg_gray(b):
    bad = "Holiday Twist は規約で使えないので、A/B/C から選んでください"
    prec = bad + "\n前例: https://example.com/takedown/1"
    gray = "TikTok の規約の上ではグレーですが、運用の実績があるので EC2 の Chrome から出します"
    fenced = "```\n著作権フリーの曲は使わない\n```"
    f = b.file("issue.md", bad)
    with redirect_stdout(io.StringIO()):
        rc = b.pre.main(["issue-text", str(f)])
    return [("規約を理由に「使えない」と書いた行を止める", len(b.pre.gray_why(bad)) == 1),
            ("黒の前例の URL を並べれば通す", b.pre.gray_why(prec) == []),
            ("グレーとして使うと書いた行は通す", b.pre.gray_why(gray) == []),
            ("囲みの中（原稿の字）は数えない", b.pre.gray_why(fenced) == []),
            (f"issue-text が止まる（終了コード {rc}）", rc == 1)]


def _look_edit(b, style: dict) -> Path:
    d = b.tmp / f"look{b.n}"
    b.n += 1
    d.mkdir(parents=True)
    (d / "style_x.json").write_text(json.dumps(style, ensure_ascii=False), encoding="utf-8")
    e = d / "edit_x.json"
    e.write_text(json.dumps(dict(POCKET, style="style_x.json")), encoding="utf-8")
    return e


def leg_looks(b):
    same = _look_edit(b, LOOK)
    loud = _look_edit(b, dict(LOOK, audio={"bgm_rms_dbfs": -20}))
    yellow = _look_edit(b, dict(LOOK, caption=dict(LOOK["caption"], color="#F9D342")))
    out = [("控えに在る見た目の指示書は通す", b.pre.looks_why(same) == []),
           ("音だけ変えた様式は同じ見た目（通す）", b.pre.looks_why(loud) == []),
           ("字幕の色を変えた様式は止める", len(b.pre.looks_why(yellow)) == 1 and "F-084" in b.pre.looks_why(yellow)[0])]
    keep = b.ls.CHOSEN.read_text(encoding="utf-8")
    d = json.loads(keep)
    try:
        b.ls.CHOSEN.write_text(json.dumps({"looks": d["looks"] + [{"fp": b.ls.edit_fp(yellow), "from": "chosen"}]}), encoding="utf-8")
        hand = b.pre.looks_why(yellow)
        b.ls.CHOSEN.write_text(json.dumps({"looks": d["looks"] + [{"fp": f"{i:016x}", "from": "baseline"} for i in range(15)]}),
                               encoding="utf-8")
        grown = b.pre.looks_why(same)
    finally:
        b.ls.CHOSEN.write_text(keep, encoding="utf-8")
    return out + [("URL の無い chosen の行（手で足した行）は数えない", any("URL" in w for w in hand)),
                  ("baseline の行を増やしたら止める", any("baseline" in w for w in grown))]


def leg_looks_wire(b):
    yellow = _look_edit(b, dict(LOOK, caption=dict(LOOK["caption"], color="#F9D342")))
    stops = b.pre.send_problems(GOOD_POST, yellow)
    up = b.remote[b.remote.index("def cmd_up("):b.remote.index("def fetch_result(")]
    guard = up.find("        if not a.draft:\n")
    call = up.find("preflight.looks_why(Path(e))")
    return [("send の関所が、控えに無い見た目を止める", any("F-084" in w for w in stops)),
            ("remote.py up が、下書きでない書き出しの前（素材を集める前）に見た目の関所を呼ぶ",
             0 <= guard < call < up.find("body = collect(") and "if stops:" in up[call:])]


def leg_looks_pick(b):
    sheet = {"marker": "LOOKS:abcd1234", "looks": [{"name": "A", "fp": "1" * 16, "style": "a.json"},
                                                    {"name": "B", "fp": "2" * 16, "style": "b.json"}]}
    url = "https://github.com/Ayato-kosaka/live-streaming/issues/1266#issuecomment-{}"
    cs = {1: {"body": "見本です（見本の印 LOOKS:abcd1234）。どれが良いですか？", "created_at": "2026-11-27T01:00:00Z",
              "user": {"login": "Ayato-kosaka", "type": "User"}},
          2: {"body": "Bで", "created_at": "2026-11-27T02:00:00Z", "user": {"login": "Ayato-kosaka", "type": "User"}},
          3: {"body": "見本です", "created_at": "2026-11-27T01:00:00Z", "user": {"login": "Ayato-kosaka", "type": "User"}},
          4: {"body": "Bで", "created_at": "2026-11-27T02:00:00Z", "user": {"login": "github-actions[bot]", "type": "Bot"}},
          5: {"body": "Bで", "created_at": "2026-11-26T02:00:00Z", "user": {"login": "Ayato-kosaka", "type": "User"}}}

    def probs(c1, c2, pick="B"):
        return b.ls.chosen_problems(sheet, pick, url.format(c1), url.format(c2), fetch=lambda cid: cs[cid],
                                    is_ayato=lambda c: c["user"]["type"] == "User")
    return [("見本の印のあるコメントに、あやとが見本のあとで選んだなら足せる", probs(1, 2) == []),
            ("見本のコメントに印が無ければ足せない", len(probs(3, 2)) == 1),
            ("返事があやと本人でなければ足せない", len(probs(1, 4)) == 1),
            ("見本より前の返事では足せない", len(probs(1, 5)) == 1),
            ("見本に無い案は足せない", len(probs(1, 2, pick="C")) == 1)]


def leg_gates_named(b):
    led = LEDGER_MD.read_text(encoding="utf-8")
    named = set(re.findall(r"`post:([A-Za-z0-9_-]+)`", led))
    keys = set(b.pre.GATES)
    return [(f"帳面の post:（{sorted(named)}）が全部 GATES に在る", bool(named) and named <= keys),
            (f"GATES の鍵が全部、帳面のどこかの項目に名指されている（無いのは {sorted(keys - named)}）", keys <= named)]


def leg_passed(b):
    out = []
    for rel in ("KjB_aBsTIf0/p1/post_A.json", "sOvaH0tBzSg/p1/post_C.json", "aGOz5otlEs8/p1/post_A.json", "tr_YBmyLGUc/p1/post_D.json"):
        p = VIDEOS / rel
        if not p.exists():
            out.append((f"{rel} が無い", False))
            continue
        post = json.loads(p.read_text(encoding="utf-8"))
        got = b.pre.article_why(post) + b.pre.credit_why(post)
        out.append((f"{rel}（あやとが通して出した回）の記事とクレジットは通る" + (f" ← {got}" if got else ""), not got))
    return out


LEGS = {
    "approval": leg_approval, "approval_wire": leg_approval_wire, "one": leg_one, "article": leg_article, "credit": leg_credit,
    "bgm": leg_bgm, "rounds": leg_rounds, "send_wire": leg_send_wire, "instagram": leg_instagram, "plain": leg_plain,
    "gates_named": leg_gates_named, "passed": leg_passed,
    "gray": leg_gray, "looks": leg_looks, "looks_wire": leg_looks_wire, "looks_pick": leg_looks_pick,
}

if __name__ == "__main__":
    sys.exit(legs.main(Path(__file__).resolve(), LEGS, CUTS, setup))
