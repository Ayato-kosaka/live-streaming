"""**ショート動画の承認ゲート**が、人の承認だけを通すかを、こしらえた issue で当てる。

    python3 tools/shorts/gate_selftest.py              # 足を全部回し、対照（BREAK）まで当てる
    python3 tools/shorts/gate_selftest.py --no-drill   # 足だけ（手元で直しているとき）
    BREAK=app python3 tools/shorts/gate_selftest.py    # 守りを1本外して回す（その足だけ落ちる）

**GitHub には1バイトも出ない。** コメントの形は REST の実物（`gate_fixtures.json`。
2026-10-15 に取った4通り）を写して、本文と id と時刻だけを差し替える。

終了コード 0=通った / 1=落ちた / **2=数えるものが無い・対照が外れた**
（`docs/island-standards.md` §15）。

## 守りは足の数だけ、別々に折れる

`tools/shorts/gate.py` の守りを1本ずつ差し替えて（`BREAK=`）、**その足だけ**が
赤くなることを、この見張り自身が毎回確かめる。まとめて1つにすると、同じ足を
何度折っていても緑に見える。

| `BREAK` | 外す守り | 落ちる足 |
| --- | --- | --- |
| `app` | Claude の App を通ったコメントを弾く | `app` |
| `approver` | 承認者の表に無い人を弾く | `approver` |
| `assoc` | オーナー・メンバー・共同作業者だけを数える | `assoc` |
| `edited` | 書き換えられた人のコメントを数えない | `edited` |
| `stale` | その関所のいちばん新しい提出だけを承認できる | `stale` |
| `sha` | 承認された版と sha256 が一致したときだけ通す | `sha` |
| `deleted` | 元のコメントが消えたら通さない（記録を信じない） | `deleted` |
| `fake` | 記録は github-actions[bot] のものだけ | `fake` |
| `forged` | 記録を、元のコメントから導き直したものと突き合わせる | `forged` |
| `recedit` | 書き換えられた記録を数えない | `recedit` |
| `subedit` | 書き換えられた提出を承認しない | `subedit` |
| `newer` | 承認のあとに新しい版が出たら通さない | `newer` |
| `revoked` | 承認のあとの差し戻しが承認を消す | `revoked` |
| `tamper` | 差し戻しの記録が壊れていても、前の承認を生き返らせない | `tamper` |
| `option` | 案は提出に並んでいるものから（企画も、案ごとの動画も） | `option` |
| `bare` | 案ごとの動画は、出す案を書かないと承認しない | `bare` |
| `optlist` | 動画の提出の案の並びが読めなければ承認しない | `optlist` |
| `optmatch` | 記録の「出してよい案」も、元のコメントから導き直したものと突き合わせる | `forged` |
| `extra` | 案を選ぶ承認の1行目は案だけ（`/approve` は断り、短い返事は命令として読まない。黙って広げない） | `extra` |
| `shortopts` | 短い返事が指すのは、いちばん新しい提出が案を持つときだけ | `short_noopts` |
| `shortname` | 承認者の名前でない短い返事は、会話として黙って流す | `short_quiet` |
| `shortlabel` | 札の無い issue の短い返事には返事をしない | `short_quiet` |
| `multi` | 企画の承認は案1つか全部（`A C` を A に黙って縮めない） | `plan_multi` |
| `outsider` | 外の人の提出を数えない | `outsider` |
| `dup` | 同じ版が2つある提出は承認しない | `dup` |
| `manifest` | 提出の sha256 が files の中身と合わなければ承認しない | `manifest` |
| `head` | 機械可読ブロックは本文の1行目だけ | `head` |

外さない足もある: `ok_plan` `ok_video` `ok_all` `ok_choice` `ok_short` `ok_noplan` `phone` `quiet`
`limit_pat` `config`。
どの `BREAK` でも、これらは**通ったまま**でないといけない（守りを外したら関係ない足まで
落ちる、は守りが混ざっている印）。

`limit_pat` は**限界の記録**。個人のトークン（PAT）で書かれたコメントは
`performed_via_github_app` が `null` で、あやと本人と見分けられない——だから通る。
守りを強くしてこの足が落ちたら、`gate.md` の「守れないこと」も書き直す。
"""

from __future__ import annotations

import contextlib
import copy
import hashlib
import io
import json
import os
import subprocess
import sys
import tempfile
from datetime import datetime, timedelta, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parent.parent
sys.path.insert(0, str(HERE))

import gate as G  # noqa: E402

FIXTURES = HERE / "gate_fixtures.json"
WORKFLOW = REPO / ".github" / "workflows" / "shorts_gate.yml"

# 承認者は本番の表（Ayato-kosaka）に、関係（association）の足を当てるための1人を足す
AP = ["Ayato-kosaka", "helper-x"]

FAILED: dict[str, list[str]] = {}
CHECKED = 0

BREAKS: dict[str, str] = {
    "app": "app", "approver": "approver", "assoc": "assoc", "edited": "edited",
    "stale": "stale", "sha": "sha", "deleted": "deleted", "fake": "fake",
    "forged": "forged", "recedit": "recedit", "subedit": "subedit", "newer": "newer",
    "revoked": "revoked", "tamper": "tamper",
    "option": "option", "outsider": "outsider", "dup": "dup", "manifest": "manifest",
    "head": "head", "bare": "bare", "optlist": "optlist",
    # 記録の突き合わせから「出してよい案」だけを抜く。落ちるのは偽の記録の足（forged）
    "optmatch": "forged",
    "extra": "extra", "multi": "plan_multi",
    "shortopts": "short_noopts", "shortname": "short_quiet", "shortlabel": "short_quiet",
}


def ok(leg: str, cond: bool, what: str) -> None:
    global CHECKED
    CHECKED += 1
    if not QUIET:
        print(f"  {'○' if cond else '✕'} [{leg}] {what}")
    if not cond:
        FAILED.setdefault(leg, []).append(what)


# ---------------------------------------------------------------- 守りを外す（対照）
# **本物の判定に当てる。** gate.py の守りの関数を、直す前の楽な作りに差し替える

def apply_break(name: str) -> None:
    if name == "app":
        G._app_ok = lambda c: True
    elif name == "approver":
        G._is_approver = lambda c, a: True
    elif name == "assoc":
        G._assoc_ok = lambda c: True
    elif name == "edited":
        G._unedited = lambda c: True
    elif name == "stale":
        G._is_latest = lambda s, subs: True
    elif name == "sha":
        G._sha_matches = lambda d, sha: True
    elif name == "deleted":
        real = G._source_lookup

        def lazy(by_id, rec):
            # 元のコメントが無ければ、記録を信じて組み立て直す（いちばん楽な作り）
            c = real(by_id, rec)
            if c is not None:
                return c
            opt = rec.get("option") or " ".join(rec.get("options") or [])
            return {"id": rec["comment_id"], "body": f"/{rec['kind']} {rec['gate']} {rec['version']} {opt}",
                    "user": {"login": rec["approver"], "type": "User", "id": rec["approver_id"]},
                    "author_association": "OWNER", "performed_via_github_app": None,
                    "created_at": rec["comment_created_at"], "updated_at": rec["comment_created_at"],
                    "html_url": rec["comment_url"],
                    "issue_url": f"https://api.github.com/repos/x/y/issues/{rec['issue']}"}
        G._source_lookup = lazy
    elif name == "fake":
        G._is_bot_record = lambda c: True
    elif name == "forged":
        G._record_matches = lambda rec, d, c: True
    elif name == "recedit":
        G._record_unedited = lambda c: True
    elif name == "subedit":
        G._submission_unedited = lambda c: True
    elif name == "newer":
        G._still_latest = lambda d, latest: True
    elif name == "revoked":
        G._decision_for = lambda ds: next((d for d in reversed(ds) if d.kind == "approve"), None)
    elif name == "tamper":
        G._no_later_objection = lambda *a, **k: True
    elif name == "option":
        G._option_ok = lambda o, s: True
    elif name == "outsider":
        G._submitter_ok = lambda c, a: True
    elif name == "dup":
        G._unique_version = lambda s, subs: True
    elif name == "manifest":
        G._manifest_ok = lambda files, sha: True
    elif name == "head":
        import re

        def anywhere(body, tag):
            m = re.search(rf"<!--\s*{re.escape(tag)}\s+(.*?)\s*-->", body or "", re.S)
            return m.group(1) if m else None
        G.find_block = anywhere
    elif name == "bare":
        G._choice_given = lambda opts, sub: True
    elif name == "optlist":
        G._video_options_ok = lambda opts: True
    elif name == "optmatch":
        G.MATCH_KEYS = tuple(k for k in G.MATCH_KEYS if k != "options")
    elif name == "extra":
        G._line_clean = lambda cmd: True
    elif name == "multi":
        G._one_plan_option = lambda cmd: True
    elif name == "shortopts":
        G._short_target = lambda sub: sub is not None
    elif name == "shortname":
        G._short_author = lambda c, a: True
    elif name == "shortlabel":
        G._answers_unlabeled = lambda cmd: True


# ---------------------------------------------------------------- こしらえる材料

def load_shapes() -> dict[str, dict]:
    data = json.loads(FIXTURES.read_text(encoding="utf-8"))
    return {k: v["comment"] for k, v in data["shapes"].items()}


SHAPES: dict[str, dict] = {}


def H(b: bytes) -> str:
    return hashlib.sha256(b).hexdigest()


def files(*pairs: tuple[str, bytes]) -> list[dict]:
    return [{"name": n, "sha256": H(b), "bytes": len(b)} for n, b in pairs]


PLAN = {v: files(("plan.md", f"企画 {v}".encode())) for v in ("p1", "p2", "p3")}
VIDEO = {v: files(("short.mp4", f"mp4 {v}".encode()), ("post.json", f'{{"title":"{v}"}}'.encode()))
         for v in ("v1", "v2")}


def sha(fs: list[dict]) -> str:
    return G.manifest_sha(fs)


class Thread:
    """issue 1本ぶんのコメント。id は増える一方、時刻は1本ごとに1分進む。"""

    def __init__(self, number: int = 950, labels=("shorts",)):
        self.number = number
        self.labels = list(labels)
        self.comments: list[dict] = []
        self.next_id = 7_000_000_000
        self.clock = datetime(2026, 10, 15, 0, 0, 0, tzinfo=timezone.utc)
        self.api = FakeGitHub(self)

    def stamp(self) -> str:
        self.clock += timedelta(minutes=1)
        return self.clock.strftime("%Y-%m-%dT%H:%M:%SZ")

    def add(self, shape: str, body: str, login: str | None = None,
            assoc: str | None = None) -> dict:
        c = copy.deepcopy(SHAPES[shape])
        self.next_id += 1
        cid = self.next_id
        at = self.stamp()
        base = "https://api.github.com/repos/Ayato-kosaka/live-streaming"
        c.update(id=cid, body=body, created_at=at, updated_at=at,
                 url=f"{base}/issues/comments/{cid}",
                 issue_url=f"{base}/issues/{self.number}",
                 html_url=f"https://github.com/Ayato-kosaka/live-streaming/issues/{self.number}#issuecomment-{cid}")
        if login:
            c["user"]["login"] = login
            c["user"]["id"] = 900000 + len(login)
        if assoc:
            c["author_association"] = assoc
        self.comments.append(c)
        return c

    def edit(self, c: dict, body: str | None = None) -> None:
        if body is not None:
            c["body"] = body
        c["updated_at"] = self.stamp()

    def delete(self, c: dict) -> None:
        self.comments = [x for x in self.comments if x["id"] != c["id"]]

    def bots(self) -> list[dict]:
        return [c for c in self.comments if c["user"]["login"] == G.BOT_LOGIN]

    def submit(self, gate: str, version: str, fs: list[dict], shape: str = "claude_app",
               options: list[str] | None = None) -> dict:
        body = (G.submission_block(gate, version, fs, options)
                + f"\n\n## {version} を出します\n（人が読む本文）")
        c = self.add(shape, body)
        self.api.feed(c)
        return c

    def say(self, body: str, shape: str = "human", **kw) -> tuple[dict, str]:
        """人（または AI）が書く → ワークフローが受け取る。返すのは（コメント, 要約）。"""
        c = self.add(shape, body, **kw)
        return c, self.api.feed(c)


class FakeGitHub:
    """`gate.GitHub` と同じ口。書いたコメントは、本物の bot の形で issue に足す。"""

    def __init__(self, t: Thread):
        self.t = t
        self.calls: list[tuple] = []
        self.labels: set[str] = set()

    def feed(self, c: dict, action: str = "created", labels=None) -> str:
        event = {"action": action,
                 "issue": {"number": self.t.number,
                           "labels": [{"name": x} for x in (self.t.labels if labels is None else labels)]},
                 "comment": copy.deepcopy(c)}
        return G.handle_event(event, self, AP, recorded_at=self.t.stamp())

    def get_comment(self, cid):
        self.calls.append(("get", cid))
        hit = next((c for c in self.t.comments if c["id"] == cid), None)
        return copy.deepcopy(hit)

    def list_comments(self, issue):
        self.calls.append(("list", issue))
        return copy.deepcopy(self.t.comments)

    def post_comment(self, issue, body):
        self.calls.append(("post", issue))
        return self.t.add("bot", body)

    def add_labels(self, issue, labels):
        self.calls.append(("label+", tuple(labels)))
        self.labels |= set(labels)

    def remove_label(self, issue, label):
        self.calls.append(("label-", label))
        self.labels.discard(label)


def req(t: Thread, gate: str, sha256: str):
    """後段の確かめ。通れば ("ok", 判定)、止まれば (理由, 例外)。"""
    try:
        d = G.require_approval(t.number, gate, sha256, comments=copy.deepcopy(t.comments),
                               approvers=AP)
        return "ok", d
    except G.Refused as e:
        return e.reason, e


def refused_reason(c: dict) -> str | None:
    data = G.load_block(G.find_block(c.get("body"), G.REFUSED_TAG))
    return (data or {}).get("reason")


def record_of(c: dict) -> dict | None:
    return G.load_block(G.find_block(c.get("body"), G.RECORD_TAG))


def approved_plan(version: str = "p1", option: str = "B") -> tuple[Thread, dict]:
    """企画 p1 を出して、あやとが承認した issue。"""
    t = Thread()
    t.say("こんにちは。企画を出します")
    t.submit("plan", version, PLAN[version])
    c, _ = t.say(f"/approve plan {version} {option}")
    return t, c


def approved_video() -> tuple[Thread, dict]:
    t, _ = approved_plan()
    t.submit("video", "v1", VIDEO["v1"])
    c, _ = t.say("/approve video v1")
    return t, c


def choice_video() -> Thread:
    """企画 p1 を出し（承認はチャットで済んでいて issue には無い）、案ごとの動画 v1（A・B・C）を
    出した issue（#926 の形）。"""
    t = Thread()
    t.say("こんにちは。企画を出します")
    t.submit("plan", "p1", PLAN["p1"])
    t.submit("video", "v1", VIDEO["v1"], options=["A", "B", "C"])
    return t


def silent(t: Thread, text: str, **kw) -> tuple[int, int]:
    """書いても bot が何も書かないか。（増えた bot のコメント数, 増えた GitHub の口の数）。"""
    bots, calls = len(t.bots()), len(t.api.calls)
    t.say(text, **kw)
    return len(t.bots()) - bots, len(t.api.calls) - calls


def cli(t: Thread, *argv: str) -> tuple[int, str]:
    """`gate.py` の CLI を、GitHub の代わりにこの issue を読ませて回す（後段が実際に呼ぶ口）。"""
    class Local:
        def __init__(self, *a, **k):
            pass

        def list_comments(self, issue):
            return copy.deepcopy(t.comments)

    saved = G.GitHub, G.load_approvers
    G.GitHub, G.load_approvers = Local, (lambda *a, **k: list(AP))
    out = io.StringIO()
    try:
        with contextlib.redirect_stdout(out):
            code = G.main(list(argv))
    finally:
        G.GitHub, G.load_approvers = saved
    return code, out.getvalue()


def require_json(t: Thread, gate: str, sha256: str) -> tuple[int, dict | None]:
    code, text = cli(t, "require", "--issue", str(t.number), "--gate", gate, "--sha256", sha256)
    try:
        return code, json.loads(text)
    except ValueError:
        return code, None


# ---------------------------------------------------------------- 足（通る側）

def leg_ok_plan() -> None:
    leg = "ok_plan"
    t, c = approved_plan()
    bot = t.bots()[-1]
    rec = record_of(bot) or {}
    ok(leg, rec.get("kind") == "approve" and rec.get("gate") == "plan"
       and rec.get("version") == "p1" and rec.get("option") == "B",
       "あやとの `/approve plan p1 B` を、github-actions[bot] が承認として記録する")
    ok(leg, rec.get("sha256") == sha(PLAN["p1"]) and rec.get("approver") == "Ayato-kosaka"
       and rec.get("comment_id") == c["id"] and rec.get("comment_url") == c["html_url"]
       and rec.get("issue") == t.number and bool(rec.get("recorded_at")),
       "記録に 関所・版・sha256・案・承認者・元コメントの id と URL・時刻・issue が入る")
    ok(leg, "gate1-approved" in t.api.labels, "承認したら gate1-approved が付く")
    why, d = req(t, "plan", sha(PLAN["p1"]))
    ok(leg, why == "ok" and d.option == "B" and d.version == "p1",
       f"後段の確かめが通り、選んだ案 B が返る（{why}）")


def leg_ok_video() -> None:
    leg = "ok_video"
    t, _ = approved_video()
    ok(leg, "gate2-approved" in t.api.labels, "動画を承認したら gate2-approved が付く")
    why, d = req(t, "video", sha(VIDEO["v1"]))
    ok(leg, why == "ok" and d.version == "v1", f"動画 v1 の確かめが通る（{why}）")
    # 本物のファイルで sha256 を出す口（後段はこれを呼ぶ）
    with tempfile.TemporaryDirectory() as tmp:
        a, b = Path(tmp, "short.mp4"), Path(tmp, "post.json")
        a.write_bytes(b"mp4 v1")
        b.write_bytes(b'{"title":"v1"}')
        got = G.bundle([b, a])
        ok(leg, got["sha256"] == sha(VIDEO["v1"]),
           "ファイルから出した sha256 が、提出に書いたものと一致する（渡す順に依らない）")
    rec = record_of(t.bots()[-1]) or {}
    ok(leg, rec.get("gate") == "video" and rec.get("option") is None and "options" not in rec,
       "案の無い動画の記録は、いままでと同じ形（options を持たない）")
    code, got = require_json(t, "video", sha(VIDEO["v1"]))
    ok(leg, code == 0 and got is not None and got.get("version") == "v1" and got.get("options") is None,
       f"案の無い動画の require は 0 で、options は null（1本だけ。終了コード {code}）")
    u, _ = approved_plan()
    u.submit("video", "v1", VIDEO["v1"])
    u.say("/approve video v1 B いいね")
    why, d = req(u, "video", sha(VIDEO["v1"]))
    ok(leg, why == "ok" and d.options is None,
       f"案の無い動画では、うしろに書いた字をいままでどおり読み流す（{why}）")
    u.say("/approve video v1 いいですね、これで出してください")
    why, d = req(u, "video", sha(VIDEO["v1"]))
    ok(leg, record_of(u.bots()[-1]) is not None and why == "ok" and d.options is None,
       f"案の無い動画は、1行目にひとことを書いた承認もいままでどおり通る（{why}）")
    t.submit("video", "v2", VIDEO["v2"])
    ok(leg, "gate2-approved" not in t.api.labels, "新しい版が出たら gate2-approved が外れる")


def leg_ok_all() -> None:
    leg = "ok_all"
    t, c = approved_plan(option="全部")
    bot = t.bots()[-1]
    rec = record_of(bot) or {}
    ok(leg, rec.get("kind") == "approve" and rec.get("option") == "ALL"
       and rec.get("comment_id") == c["id"] and "options" not in rec,
       "あやとの `/approve plan p1 全部` を、案 ALL の承認として記録する（企画の記録の形は前のまま）")
    ok(leg, "企画 p1 は、全部の案（A・B・C）を作ると記録しました" in bot["body"],
       "記録の文に、作る案（A・B・C）が出る")
    ok(leg, "gate1-approved" in t.api.labels, "全部の承認でも gate1-approved が付く")
    why, d = req(t, "plan", sha(PLAN["p1"]))
    ok(leg, why == "ok" and d.option == "ALL" and d.options == ["A", "B", "C"],
       f"後段の確かめが通り、ALL と、作ってよい案 A・B・C が返る（{why}）")
    code, got = require_json(t, "plan", sha(PLAN["p1"]))
    ok(leg, code == 0 and got is not None and got.get("option") == "ALL"
       and got.get("options") == ["A", "B", "C"],
       "require の JSON: 企画の option は字のまま ALL、options は A・B・C")
    u, _ = approved_plan(option="B")
    code, got = require_json(u, "plan", sha(PLAN["p1"]))
    ok(leg, code == 0 and got is not None and got.get("option") == "B" and got.get("options") == ["B"],
       "1文字の承認なら option は B のまま、options は B だけ（前の形を崩さない）")
    for word in ("all", "ALL", "All", "ぜんぶ", "全", "全案", "すべて", "全て", "ＡＬＬ"):
        v, _ = approved_plan(option=word)
        ok(leg, (record_of(v.bots()[-1]) or {}).get("option") == "ALL",
           f"`/approve plan p1 {word}` も全部（ALL）として記録する")
    w = Thread()
    w.submit("plan", "p1", PLAN["p1"])
    w.say("／承認　企画　１　全部")
    ok(leg, (record_of(w.bots()[-1]) or {}).get("option") == "ALL",
       "日本語・全角の `／承認　企画　１　全部` も同じ")


def leg_ok_choice() -> None:
    leg = "ok_choice"
    t = choice_video()
    sub = G.parse_submission(t.comments[-1])
    ok(leg, sub is not None and sub.options == ["A", "B", "C"] and not sub.broken,
       "案ごとの動画の提出は、案 A・B・C を持って読める")
    for text, want in (("/approve video v1 B", ["B"]),
                       ("/approve video v1 B C", ["B", "C"]),
                       ("/approve video v1 C,A\nよろしくお願いします", ["A", "C"]),
                       ("/approve video v1 B・C", ["B", "C"]),
                       ("/approve video v1 B ・ C、", ["B", "C"]),
                       ("/Approve Video V1 b案 c案", ["B", "C"]),
                       ("/approve video v1 全部", ["A", "B", "C"]),
                       ("／承認　動画　１　ぜんぶ", ["A", "B", "C"])):
        u = choice_video()
        u.say(text)
        rec = record_of(u.bots()[-1]) or {}
        why, d = req(u, "video", sha(VIDEO["v1"]))
        ok(leg, rec.get("options") == want and rec.get("option") is None and why == "ok"
           and d.options == want and "gate2-approved" in u.api.labels,
           f"{text!r} は {'・'.join(want)} を出してよいと記録し、後段もそれで通る（{why}）")
    u = choice_video()
    u.say("/approve video v1 B C")
    body = u.bots()[-1]["body"]
    ok(leg, "動画 v1 の B案・C案を、投稿してよいと記録しました" in body,
       "記録の文に、出してよい案（B案・C案）が出る")
    code, got = require_json(u, "video", sha(VIDEO["v1"]))
    ok(leg, code == 0 and got is not None and set(got) == set(G.REQUIRE_KEYS)
       and got["options"] == ["B", "C"] and got["option"] is None and got["version"] == "v1"
       and got["sha256"] == sha(VIDEO["v1"]) and got["approver"] == "Ayato-kosaka"
       and got["issue"] == u.number and bool(got["record_url"]),
       f"require の JSON: 出してよい案 options が B・C、版・sha256・承認者・記録の URL も入る（{code}）")
    # 提出のブロックを作る口（後段の担当が呼ぶ）
    with tempfile.TemporaryDirectory() as tmp:
        a, b, m = Path(tmp, "short.mp4"), Path(tmp, "post.json"), Path(tmp, "plan.md")
        a.write_bytes(b"mp4 v1")
        b.write_bytes(b'{"title":"v1"}')
        m.write_bytes("企画 p1".encode())
        w = Thread()
        code, text = cli(w, "submission", "--issue", "950", "--gate", "video", "--options", "a,b,c",
                         str(a), str(b))
        blk = G.load_block(G.find_block(text, G.SUBMISSION_TAG)) or {}
        ok(leg, code == 0 and blk.get("options") == ["A", "B", "C"] and blk.get("version") == "v1"
           and blk.get("sha256") == sha(VIDEO["v1"]),
           "`gate.py submission --gate video --options A,B,C` が、案つきの動画のブロックを作る")
        code, text = cli(w, "submission", "--issue", "950", "--gate", "video", str(a), str(b))
        blk = G.load_block(G.find_block(text, G.SUBMISSION_TAG)) or {}
        ok(leg, code == 0 and blk.get("gate") == "video" and "options" not in blk,
           "`--options` を付けなければ、いままでどおり案の無い動画のブロック")
        code, text = cli(w, "submission", "--issue", "950", "--gate", "plan", str(m))
        blk = G.load_block(G.find_block(text, G.SUBMISSION_TAG)) or {}
        ok(leg, code == 0 and blk.get("options") == ["A", "B", "C"],
           "企画は `--options` を付けなければ、いままでどおり A・B・C")


def leg_ok_short() -> None:
    leg = "ok_short"
    for text in ("B", "Ｂ案", "案B"):
        t = Thread()
        t.submit("plan", "p1", PLAN["p1"])
        t.say(text)
        bot = t.bots()[-1]
        rec = record_of(bot) or {}
        why, d = req(t, "plan", sha(PLAN["p1"]))
        ok(leg, rec.get("gate") == "plan" and rec.get("version") == "p1" and rec.get("option") == "B"
           and "企画 p1 は、B案で作ると記録しました" in bot["body"] and why == "ok" and d.option == "B",
           f"企画への短い返事 {text!r} を、企画 p1 の B案として記録し、文にもそう書く（{why}）")
    t = Thread()
    t.submit("plan", "p1", PLAN["p1"])
    t.say("全部\nチャットで言ったとおりです")
    rec = record_of(t.bots()[-1]) or {}
    ok(leg, rec.get("option") == "ALL" and req(t, "plan", sha(PLAN["p1"]))[0] == "ok",
       "企画への `全部` を ALL として記録する（2行目は自由に書いてよい）")
    for text, want in (("B", ["B"]), ("B C", ["B", "C"]), ("ｂ・ｃ", ["B", "C"]),
                       ("全部", ["A", "B", "C"]), ("ぜんぶ", ["A", "B", "C"])):
        u = choice_video()
        u.say(text)
        bot = u.bots()[-1]
        rec = record_of(bot) or {}
        why, d = req(u, "video", sha(VIDEO["v1"]))
        sentence = f"動画 v1 の {'・'.join(o + '案' for o in want)}を、投稿してよいと記録しました"
        ok(leg, rec.get("gate") == "video" and rec.get("options") == want and sentence in bot["body"]
           and why == "ok" and d.options == want and "gate2-approved" in u.api.labels,
           f"動画への短い返事 {text!r} は、いちばん新しい動画 v1 の {'・'.join(want)} として記録する（{why}）")
    u = choice_video()
    u.say("B")
    ok(leg, req(u, "plan", sha(PLAN["p1"]))[0] == "no_record",
       "短い返事は、いちばん新しい提出（動画）にだけ効く（ひとつ前の企画は承認しない）")


def leg_ok_noplan() -> None:
    leg = "ok_noplan"
    t = Thread()
    t.submit("video", "v1", VIDEO["v1"])                # 企画の提出も承認も無い
    t.say("/approve video v1")
    why, d = req(t, "video", sha(VIDEO["v1"]))
    ok(leg, why == "ok" and d.version == "v1" and "gate2-approved" in t.api.labels,
       f"企画の承認が無くても、動画の承認だけで後段が通る（{why}）")
    u = choice_video()
    u.say("/approve video v1 B")
    why, d = req(u, "video", sha(VIDEO["v1"]))
    ok(leg, why == "ok" and d.options == ["B"],
       f"企画を出していても承認していなくても、案ごとの動画は承認できる（{why}）")
    v, _ = approved_plan(option="A")
    v.submit("video", "v1", VIDEO["v1"], options=["A", "B", "C"])
    v.say("/approve video v1 B")
    why, d = req(v, "video", sha(VIDEO["v1"]))
    ok(leg, why == "ok" and d.options == ["B"],
       f"企画で A を選んでいても、Gate 2 で B を承認したら B を出せる（{why}）")
    v.say("/reject plan p1 やっぱり違う")
    why, _ = req(v, "video", sha(VIDEO["v1"]))
    ok(leg, why == "ok" and "gate2-approved" in v.api.labels,
       f"動画の承認のあとに企画を差し戻しても、動画の承認は残る（札も外れない。{why}）")


def leg_phone() -> None:
    leg = "phone"
    want = ("approve", "plan", "p1", "B")
    for text in ("／ａｐｐｒｏｖｅ　ｐｌａｎ　ｐ１　Ｂ", "/Approve Plan P1 b", "/承認 企画 1 B案",
                 "\n\n  /approve plan p01 案B\nよろしくお願いします", "/ approve plan p1 B"):
        cmd = G.parse_command(text)
        got = cmd and (cmd.kind, cmd.gate, cmd.version, cmd.option)
        ok(leg, got == want and not cmd.error, f"{text.strip()[:24]!r} を {want} と読む")
    cmd = G.parse_command("/却下 動画 v2 音が大きい")
    ok(leg, cmd is not None and (cmd.kind, cmd.gate, cmd.version) == ("reject", "video", "v2"),
       "`/却下 動画 v2 理由` を差し戻しと読む")
    cmd = G.parse_command("/revise 冒頭をもっと短く")
    ok(leg, cmd is not None and cmd.kind == "revise" and cmd.gate is None,
       "版を書かない `/revise 直してほしい点` を受ける（いちばん新しい提出への依頼）")
    for text in ("> /approve plan p1 B", "approve plan p1 B", "/approvex plan p1 B", "いいですね"):
        ok(leg, G.parse_command(text) is None, f"{text!r} は命令ではない（引用の中も数えない）")
    for text, err in (("/approve plan p1", "no_option"), ("/approve plan v1 B", "bad_version"),
                      ("/approve", "syntax")):
        cmd = G.parse_command(text)
        ok(leg, cmd is not None and cmd.error == err, f"{text!r} は {err} で断る")
    # 書式を間違えたら、書き方の例が返る
    t = Thread()
    t.submit("plan", "p1", PLAN["p1"])
    t.say("/approve plan")
    ok(leg, refused_reason(t.bots()[-1]) == "syntax" and G.EXAMPLES in t.bots()[-1]["body"],
       "書式が読めないときは、例を添えて断る")


def leg_quiet() -> None:
    leg = "quiet"
    t = Thread()
    t.say("いいですね")
    ok(leg, t.api.calls == [], "命令でも提出でもないコメントでは、GitHub の口を1回も叩かない")

    def no_table():
        raise G.Unreadable("承認者の表が無い")
    try:
        line = G.handle_event({"action": "created", "issue": {"number": 1, "labels": []},
                               "comment": {"id": 1, "body": "いいですね"}}, t.api, no_table)
    except G.Unreadable:
        line = ""
    ok(leg, line.startswith("対象外"),
       "対象外のコメントでは承認者の表を読まない（表が読めない日に、関係ない issue まで赤くしない）")
    u = Thread(labels=())
    u.say("/approve plan p1 B", login="stranger", assoc="NONE")
    ok(leg, u.api.calls == [], "札の無い issue の外の人の命令には、返事をしない")
    u.say("/approve plan p1 B")
    ok(leg, [x[0] for x in u.api.calls] == ["post"] and refused_reason(u.bots()[-1]) == "no_label",
       "札の無い issue でも、あやとの名前の命令には「札が無い」と返す（黙って何も起きない、をしない）")
    v = Thread()
    c = v.add("human", "/approve plan p1 B")
    v.api.feed(c, action="edited")
    ok(leg, v.api.calls == [], "書き換えの受け取り（edited）では何もしない")
    w = Thread()
    w.add("claude_app", "<!-- shorts-submission {こわれた -->\n本文")
    w.api.feed(w.comments[-1])
    ok(leg, refused_reason(w.bots()[-1]) == "submission_broken",
       "読めない提出には「読めない」と返す（出した側が気づける）")
    x = Thread()
    x.submit("plan", "p1", PLAN["p1"])
    ok(leg, not any(k == "post" for k, *_ in x.api.calls), "正しい提出には何も書かない（札を外すだけ）")


def leg_limit_pat() -> None:
    leg = "limit_pat"
    t = Thread()
    t.submit("plan", "p1", PLAN["p1"])
    t.say("/approve plan p1 B", shape="pat_null")
    why, _ = req(t, "plan", sha(PLAN["p1"]))
    ok(leg, why == "ok",
       "（限界）PAT で書かれた App が null のコメントは、あやと本人と見分けられず通る——gate.md の「守れないこと」")


def leg_config() -> None:
    leg = "config"
    try:
        got = G.load_approvers()
    except G.Unreadable:
        got = None
    ok(leg, got == ["Ayato-kosaka"], f"本番の承認者の表は Ayato-kosaka だけ（{got}）")
    text = WORKFLOW.read_text(encoding="utf-8") if WORKFLOW.is_file() else ""
    ok(leg, "python3 tools/shorts/gate.py record --event \"$GITHUB_EVENT_PATH\"" in text,
       "ワークフローが gate.py の record を、受け取りのファイルで呼ぶ")
    lines = text.splitlines()
    picks: list[str] = []
    for i, line in enumerate(lines):
        if line.strip() == "sparse-checkout: |":
            for nxt in lines[i + 1:]:
                if not nxt.startswith(" " * 12) or not nxt.strip():
                    break
                picks.append(nxt.strip())
    ok(leg, picks and all((REPO / p).is_file() for p in picks)
       and "tools/shorts/gate.py" in picks and "shorts/config/approvers.json" in picks,
       f"ワークフローが取る2本（{picks}）が、名前どおり在る（名前を変えたら黙って落ちる）")
    ok(leg, "${{ github.event.comment.body }}" not in "\n".join(
        x for x in lines if not x.lstrip().startswith("#")),
        "コメントの本文をシェルやログに差し込んでいない")


# ---------------------------------------------------------------- 足（弾く側）

def leg_app() -> None:
    leg = "app"
    t = Thread()
    t.submit("plan", "p1", PLAN["p1"])
    t.say("/approve plan p1 B", shape="claude_app")
    reply = t.bots()[-1]
    ok(leg, refused_reason(reply) == "app" and "Claude の App" in reply["body"],
       "Claude の App から書いた `/approve` は「App からは数えない」と断る")
    ok(leg, "gate1-approved" not in t.api.labels, "札も付かない")
    why, _ = req(t, "plan", sha(PLAN["p1"]))
    ok(leg, why != "ok", f"後段も通らない（{why}）")
    for text in ("B", "全部"):
        u = choice_video()
        u.say(text, shape="claude_app")
        why, _ = req(u, "video", sha(VIDEO["v1"]))
        ok(leg, refused_reason(u.bots()[-1]) == "app" and "gate2-approved" not in u.api.labels
           and why != "ok",
           f"Claude の App から書いた短い返事 {text!r} も数えない（{why}）")


def leg_approver() -> None:
    leg = "approver"
    t = Thread()
    t.submit("plan", "p1", PLAN["p1"])
    t.say("/approve plan p1 B", login="someone-else", assoc="COLLABORATOR")
    ok(leg, refused_reason(t.bots()[-1]) == "not_approver", "承認者の表に無い共同作業者は断る")
    t.say("/approve plan p1 B", shape="bot")
    ok(leg, refused_reason(t.bots()[-1]) in ("not_approver", "app"), "bot の `/approve` も数えない")
    ok(leg, req(t, "plan", sha(PLAN["p1"]))[0] != "ok", "後段も通らない")


def leg_assoc() -> None:
    leg = "assoc"
    t = Thread()
    t.submit("plan", "p1", PLAN["p1"])
    t.say("/approve plan p1 B", login="helper-x", assoc="CONTRIBUTOR")
    ok(leg, refused_reason(t.bots()[-1]) == "association",
       "表に名前があっても、オーナー・メンバー・共同作業者でなければ断る")
    ok(leg, req(t, "plan", sha(PLAN["p1"]))[0] != "ok", "後段も通らない")


def leg_edited() -> None:
    leg = "edited"
    t, c = approved_plan()
    t.edit(c)
    why, _ = req(t, "plan", sha(PLAN["p1"]))
    ok(leg, why == "source_edited", f"承認のあとに元のコメントが書き換えられたら止める（{why}）")
    u = Thread()
    u.submit("plan", "p1", PLAN["p1"])
    c = u.add("human", "/approve plan p1 B")
    u.edit(c)
    u.api.feed(c)
    ok(leg, refused_reason(u.bots()[-1]) == "edited", "走る前に書き換えられたコメントも数えない")


def leg_stale() -> None:
    leg = "stale"
    t = Thread()
    t.submit("plan", "p1", PLAN["p1"])
    t.submit("plan", "p2", PLAN["p2"])
    t.say("/approve plan p1 B")
    reply = t.bots()[-1]
    ok(leg, refused_reason(reply) == "stale" and "p2" in reply["body"],
       "古い版 p1 の承認は「最新は p2」と断る")
    ok(leg, req(t, "plan", sha(PLAN["p1"]))[0] != "ok", "後段も p1 では通らない")


def leg_sha() -> None:
    leg = "sha"
    t, _ = approved_video()
    with tempfile.TemporaryDirectory() as tmp:
        a, b = Path(tmp, "short.mp4"), Path(tmp, "post.json")
        a.write_bytes(b"mp4 v1")
        b.write_bytes(b'{"title":"v1!"}')          # 投稿文が1バイト変わった
        changed = G.bundle([a, b])["sha256"]
    why, _ = req(t, "video", changed)
    ok(leg, why == "sha", f"承認後に投稿文が1バイト変わったら止める（{why}）")


def leg_deleted() -> None:
    leg = "deleted"
    t, c = approved_plan()
    t.delete(c)
    why, _ = req(t, "plan", sha(PLAN["p1"]))
    ok(leg, why == "source_deleted", f"元のコメントが消えたら、記録が残っていても止める（{why}）")


def leg_fake() -> None:
    leg = "fake"
    for shape in ("claude_app", "pat_null"):
        t = Thread()
        t.submit("plan", "p1", PLAN["p1"])
        c = t.add("human", "/approve plan p1 B")      # ワークフローが走らなかった
        d = G.judge(c, G.before(t.comments, c), AP)
        t.add(shape, G.record_body(d, t.stamp()))     # 正しい中身の記録を、bot 以外が書く
        why, _ = req(t, "plan", sha(PLAN["p1"]))
        ok(leg, d.ok and why == "fake_record",
           f"中身が正しくても、bot 以外（{shape}）が書いた記録では通さない（{why}）")


def leg_forged() -> None:
    leg = "forged"
    t = Thread()
    t.submit("plan", "p1", PLAN["p1"])
    c = t.add("human", "/approve plan p1 B")          # 記録はまだ無い
    d = G.judge(c, G.before(t.comments, c), AP)
    other = sha(PLAN["p3"])
    d.sha256 = other                                   # 別の中身を指す記録を、bot に書かせる
    t.add("bot", G.record_body(d, t.stamp()))
    why, _ = req(t, "plan", other)
    ok(leg, why == "record_mismatch",
       f"本物の承認コメントを指していても、sha256 が提出と違う bot の記録は通さない（{why}）")
    u = choice_video()
    c = u.add("human", "/approve video v1 B")          # 記録はまだ無い
    d = G.judge(c, G.before(u.comments, c), AP)
    d.options = ["A", "B", "C"]                         # B だけの承認を、全部に水増しした記録
    u.add("bot", G.record_body(d, u.stamp()))
    why, _ = req(u, "video", sha(VIDEO["v1"]))
    ok(leg, d.ok and why == "record_mismatch",
       f"B だけを承認したコメントを指して、A・B・C を出してよいと書いた bot の記録は通さない（{why}）")
    w = Thread()
    w.submit("plan", "p1", PLAN["p1"])
    c = w.add("human", "/approve plan p1 A")
    d = G.judge(c, G.before(w.comments, c), AP)
    d.option, d.options = G.ALL, ["A", "B", "C"]        # A だけの承認を「全部」にした記録
    w.add("bot", G.record_body(d, w.stamp()))
    why, _ = req(w, "plan", sha(PLAN["p1"]))
    ok(leg, d.ok and why == "record_mismatch",
       f"A だけを承認したコメントを指して、全部（ALL）と書いた bot の記録は通さない（{why}）")


def leg_recedit() -> None:
    leg = "recedit"
    t, _ = approved_plan()
    t.edit(t.bots()[-1])
    why, _ = req(t, "plan", sha(PLAN["p1"]))
    ok(leg, why == "record_edited", f"bot の記録が書き換えられたら止める（{why}）")


def leg_subedit() -> None:
    leg = "subedit"
    t = Thread()
    s = t.submit("plan", "p1", PLAN["p1"])
    t.edit(s)
    t.say("/approve plan p1 B")
    ok(leg, refused_reason(t.bots()[-1]) == "submission_edited", "書き換えた提出は承認しない")
    u, _ = approved_plan()
    sub = next(c for c in u.comments if G.find_block(c["body"], G.SUBMISSION_TAG))
    u.edit(sub)
    why, e = req(u, "plan", sha(PLAN["p1"]))
    ok(leg, why == "source_invalid" and "submission_edited" in str(e.detail),
       f"承認のあとに提出が書き換えられたら止める（{why}）")


def leg_newer() -> None:
    leg = "newer"
    t, _ = approved_plan()
    t.submit("plan", "p2", PLAN["p2"])
    why, _ = req(t, "plan", sha(PLAN["p1"]))
    ok(leg, why == "newer", f"承認した p1 のあとに p2 が出たら、p1 では通さない（{why}）")


def leg_revoked() -> None:
    leg = "revoked"
    t, _ = approved_plan()
    t.say("/reject plan p1 やっぱり違う")
    ok(leg, record_of(t.bots()[-1]).get("kind") == "reject" and "gate1-approved" not in t.api.labels,
       "差し戻しを記録し、gate1-approved を外す")
    why, _ = req(t, "plan", sha(PLAN["p1"]))
    ok(leg, why == "rejected", f"承認のあとの差し戻しで止まる（{why}）")
    u, _ = approved_plan()
    u.say("/revise 冒頭をもっと短く")
    why, _ = req(u, "plan", sha(PLAN["p1"]))
    ok(leg, why == "revise_requested", f"承認のあとの直しの依頼で止まる（{why}）")


def leg_tamper() -> None:
    leg = "tamper"
    t, _ = approved_plan()
    t.add("human", "/reject plan p1 やっぱり違う")     # ワークフローが走らなかった
    why, _ = req(t, "plan", sha(PLAN["p1"]))
    ok(leg, why == "objection", f"差し戻しの記録が無くても、前の承認を生き返らせない（{why}）")
    u, _ = approved_plan()
    c, _ = u.say("/reject plan p1 やっぱり違う")
    u.edit(c, "了解です")                               # 差し戻しを書き換えて消す
    why, _ = req(u, "plan", sha(PLAN["p1"]))
    ok(leg, why == "objection", f"差し戻しを書き換えて消しても、前の承認を生き返らせない（{why}）")


def leg_option() -> None:
    leg = "option"
    t = Thread()
    t.submit("plan", "p1", PLAN["p1"])
    t.say("/approve plan p1 D")
    ok(leg, refused_reason(t.bots()[-1]) == "bad_option", "提出に無い案 D は断る")
    for text in ("/approve video v1 D", "D"):
        u = choice_video()
        u.say(text)
        reply = u.bots()[-1]
        ok(leg, refused_reason(reply) == "bad_option" and "A・B・C" in reply["body"],
           f"動画の提出に無い案 {text!r} は、ある案を添えて断る")


def leg_outsider() -> None:
    leg = "outsider"
    t = Thread()
    t.submit("plan", "p1", PLAN["p1"])
    body = G.submission_block("plan", "p2", PLAN["p2"])
    t.add("human", body, login="stranger", assoc="NONE")
    t.api.feed(t.comments[-1])
    ok(leg, not any(k == "post" for k, *_ in t.api.calls), "外の人の提出には返事をしない")
    t.say("/approve plan p2 B")
    ok(leg, refused_reason(t.bots()[-1]) == "not_found", "外の人が出した p2 は、承認の対象にならない")
    t.say("/approve plan p1 B")
    ok(leg, record_of(t.bots()[-1]) is not None and req(t, "plan", sha(PLAN["p1"]))[0] == "ok",
       "外の人の偽の新しい版で、本物の p1 が「古い版」にされない")


def leg_dup() -> None:
    leg = "dup"
    t = Thread()
    t.submit("plan", "p1", PLAN["p1"])
    t.submit("plan", "p1", PLAN["p2"])
    ok(leg, refused_reason(t.bots()[-1]) == "duplicate", "同じ版を2回出したら、出した側に知らせる")
    t.say("/approve plan p1 B")
    ok(leg, refused_reason(t.bots()[-1]) == "duplicate", "同じ版が2つある提出は承認しない")


def leg_manifest() -> None:
    leg = "manifest"
    t = Thread()
    data = {"schema": 1, "gate": "plan", "version": "p1", "sha256": sha(PLAN["p2"]),
            "files": PLAN["p1"], "options": ["A", "B", "C"]}
    t.add("claude_app", G.dump_block(G.SUBMISSION_TAG, data) + "\n本文")
    t.say("/approve plan p1 B")
    ok(leg, refused_reason(t.bots()[-1]) == "submission_broken",
       "sha256 が files の中身と合わない提出は承認しない")


def leg_head() -> None:
    leg = "head"
    t, _ = approved_plan()
    genuine = t.bots()[-1]["body"]
    # call_ayato.yml の形（本文の頭に `@Ayato-kosaka …` が付く）で bot に記録を書かせる
    t.add("bot", "@Ayato-kosaka 判断をお願いします。\n\n" + genuine)
    found = G.records(t.comments)
    ok(leg, len(found) == 1, f"本文の途中に埋まった記録は、記録として数えない（{len(found)}件）")
    ok(leg, G.find_block("前置き\n" + G.submission_block("plan", "p9", PLAN["p1"]),
                         G.SUBMISSION_TAG) is None,
       "本文の途中に埋まった提出も、提出として数えない")


def leg_bare() -> None:
    leg = "bare"
    t = choice_video()
    t.say("/approve video v1")
    reply = t.bots()[-1]
    ok(leg, refused_reason(reply) == "choose_option" and "A・B・C" in reply["body"]
       and "/approve video v1 B" in reply["body"] and "全部" in reply["body"],
       "案ごとの動画に案を書かない `/approve video v1` は、ある案と書き方を添えて断る")
    t.say("/approve video v1 いいね！")
    ok(leg, refused_reason(t.bots()[-1]) == "choose_option",
       "案でない字だけを書いた承認も、全部とは読まない")
    ok(leg, "gate2-approved" not in t.api.labels, "札も付かない")
    code, _ = cli(t, "require", "--issue", str(t.number), "--gate", "video", "--sha256", sha(VIDEO["v1"]))
    ok(leg, req(t, "video", sha(VIDEO["v1"]))[0] != "ok" and code == 1,
       f"後段も通らない（require は {code}）")


def leg_optlist() -> None:
    leg = "optlist"
    for opts in (["A", "A"], ["ALL"], "ABC", ["a"], []):
        t, _ = approved_plan(option="全部")
        data = {"schema": 1, "gate": "video", "version": "v1", "sha256": sha(VIDEO["v1"]),
                "files": VIDEO["v1"], "options": opts}
        t.add("claude_app", G.dump_block(G.SUBMISSION_TAG, data) + "\n本文")
        t.api.feed(t.comments[-1])
        first = refused_reason(t.bots()[-1])
        t.say("/approve video v1 全部")
        ok(leg, first == "submission_broken" and refused_reason(t.bots()[-1]) == "submission_broken",
           f"案の並びが {opts!r} の動画の提出は、読めないと返し、承認もしない")
    try:
        G.submission_block("video", "v1", VIDEO["v1"], ["A", "A"])
        made = True
    except ValueError:
        made = False
    ok(leg, not made, "重なった案の動画のブロックは、作る口が作らない")


def leg_extra() -> None:
    leg = "extra"
    t = choice_video()
    for text in ("/approve video v1 B a nice one", "/approve video v1 B C いいね", "/approve video v1 全部 おねがいします"):
        t.say(text)
        reply = t.bots()[-1]
        ok(leg, refused_reason(reply) == "extra_text" and "1行目は案だけ" in reply["body"]
           and "2行目から" in reply["body"] and "/approve video v1 B C" in reply["body"],
           f"案ごとの動画で {text!r} は、案を広げも縮めもせず「1行目は案だけ」と断る")
    ok(leg, "gate2-approved" not in t.api.labels and req(t, "video", sha(VIDEO["v1"]))[0] != "ok",
       "札も付かず、後段も通らない")
    u = Thread()
    u.submit("plan", "p1", PLAN["p1"])
    u.say("/approve plan p1 B よろしく")
    reply = u.bots()[-1]
    ok(leg, refused_reason(reply) == "extra_text" and "/approve plan p1 B" in reply["body"],
       "企画も、1行目の案のうしろにひとことがあれば断る（例は企画の書き方）")
    ok(leg, "gate1-approved" not in u.api.labels and req(u, "plan", sha(PLAN["p1"]))[0] != "ok",
       "札も付かず、後段も通らない")
    for text in ("B いいね", "B a nice one", "全部 おねがいします", "A案の台本、もう少し短く"):
        w = choice_video()
        posted, _ = silent(w, text)
        ok(leg, posted == 0 and req(w, "video", sha(VIDEO["v1"]))[0] != "ok",
           f"短い返事でも1行目に案でない字がある {text!r} は、命令として読まない（返事も記録もしない）")


def leg_plan_multi() -> None:
    leg = "plan_multi"
    for text in ("/approve plan p1 A C", "/approve plan p1 A,C", "/approve plan p1 全部 A"):
        t = Thread()
        t.submit("plan", "p1", PLAN["p1"])
        t.say(text)
        reply = t.bots()[-1]
        ok(leg, refused_reason(reply) == "plan_multi" and "案1つか全部" in reply["body"]
           and "gate1-approved" not in t.api.labels and req(t, "plan", sha(PLAN["p1"]))[0] != "ok",
           f"{text!r} は、1案に黙って縮めず「案1つか全部」と断る")
    t = Thread()
    t.submit("plan", "p1", PLAN["p1"])
    t.say("B C")
    reply = t.bots()[-1]
    ok(leg, refused_reason(reply) == "plan_multi" and "`B`" in reply["body"] and "`全部`" in reply["body"]
       and req(t, "plan", sha(PLAN["p1"]))[0] != "ok",
       "企画への短い返事 `B C` も、短い形の例（`B`・`全部`）を添えて断る")


def leg_short_noopts() -> None:
    leg = "short_noopts"
    t = Thread()
    t.submit("plan", "p1", PLAN["p1"])                 # 案のある企画のあとに
    t.submit("video", "v1", VIDEO["v1"])               # 案の無い動画が来た
    for text in ("B", "全部"):
        posted, _ = silent(t, text)
        ok(leg, posted == 0, f"いちばん新しい提出が案を持たないとき、{text!r} は命令ではない（返事をしない）")
    ok(leg, req(t, "video", sha(VIDEO["v1"]))[0] == "no_record"
       and req(t, "plan", sha(PLAN["p1"]))[0] == "no_record",
       "案の無い動画も、ひとつ前の企画も、承認されない")
    u = Thread()
    posted, _ = silent(u, "B")
    ok(leg, posted == 0, "提出が1つも無い issue の `B` も命令ではない")


def leg_short_quiet() -> None:
    leg = "short_quiet"
    t = choice_video()
    for login, assoc in (("stranger", "NONE"), ("someone-else", "COLLABORATOR")):
        posted, calls = silent(t, "B", login=login, assoc=assoc)
        ok(leg, posted == 0 and calls == 0,
           f"承認者でない {login}（{assoc}）の `B` は会話として流す（返事も、GitHub を読みにも行かない）")
    ok(leg, req(t, "video", sha(VIDEO["v1"]))[0] != "ok", "後段も通らない")
    u = Thread(labels=())
    u.submit("plan", "p1", PLAN["p1"])
    posted, calls = silent(u, "B")
    ok(leg, posted == 0 and calls == 0,
       "札の無い issue であやとが `B` と書いても、返事をしない（ほかの issue の問いへの答え）")


LEGS = [leg_ok_plan, leg_ok_video, leg_ok_all, leg_ok_choice, leg_ok_short, leg_ok_noplan,
        leg_phone, leg_quiet,
        leg_limit_pat, leg_config,
        leg_app, leg_approver, leg_assoc, leg_edited, leg_stale, leg_sha, leg_deleted,
        leg_fake, leg_forged, leg_recedit, leg_subedit, leg_newer, leg_revoked, leg_tamper,
        leg_option, leg_outsider, leg_dup, leg_manifest, leg_head,
        leg_bare, leg_optlist, leg_extra, leg_plan_multi, leg_short_noopts, leg_short_quiet]


def run_legs() -> None:
    for fn in LEGS:
        try:
            fn()
        except Exception as e:      # 落ち方が例外でも、どの足かを控えて次へ進む
            ok(fn.__name__[4:], False, f"例外: {type(e).__name__}: {e}")


def child(name: str) -> tuple[set[str], int]:
    """守りを1本外した自分を起こして、（落ちた足, 見た件数）を返す。"""
    env = dict(os.environ, BREAK=name)
    r = subprocess.run([sys.executable, str(Path(__file__).resolve()), "--legs-json"],
                       env=env, capture_output=True, text=True, timeout=120, check=False)
    try:
        got = json.loads(r.stdout.strip().splitlines()[-1])
        return set(got["failed"]), int(got["checked"])
    except (ValueError, IndexError, KeyError, TypeError):
        return {"（結果が読めない）"}, 0


def drill() -> bool:
    """守りを1本ずつ外して、**その足だけ**が落ちることを見る。"""
    print("\n[対照] 守りを1本ずつ外すと、その足だけが落ちるか")
    # **対照の対照。** 何も外さない子が、親と同じ件数を見て1本も落とさないこと。
    # ここが崩れていると、下の「その足だけ落ちた」は子の起こし方の不具合でも出る
    failed, seen = child(NOOP)
    good = failed == set() and seen == CHECKED
    print(f"  {'○' if good else '✕'} 何も外さない子  → 落ちた足: "
          f"{', '.join(sorted(failed)) or '（無し）'}・見た {seen}件（親は {CHECKED}件）")
    for name, leg in BREAKS.items():
        failed, seen = child(name)
        hit = failed == {leg} and seen == CHECKED
        good &= hit
        print(f"  {'○' if hit else '✕'} BREAK={name:<9} → 落ちた足: "
              f"{', '.join(sorted(failed)) or '（無し）'}（欲しいのは {leg} だけ）")
    return good


QUIET = "--legs-json" in sys.argv
# 対照の対照に使う、何も外さない印。手で渡すものではない
NOOP = "_noop"


def main() -> int:
    global SHAPES
    brk = os.environ.get("BREAK", "")
    if brk and brk not in BREAKS and brk != NOOP:
        print(f"✕ BREAK={brk!r} は知らない足です（{', '.join(BREAKS)}）")
        return 2
    try:
        SHAPES = load_shapes()
    except (OSError, ValueError, KeyError) as e:
        print(f"✕ 実物の形（{FIXTURES.name}）が読めない: {e}")
        return 2
    if set(SHAPES) != {"claude_app", "human", "bot", "pat_null"}:
        print(f"✕ 実物の形が足りない: {sorted(SHAPES)}")
        return 2
    if brk and brk != NOOP:
        apply_break(brk)

    if not QUIET:
        print("=== ショート動画の承認ゲート ===（GitHub には1バイトも出ません）")
        if brk:
            print(f"**守りを1本外して回しています: BREAK={brk}**")
    run_legs()

    if QUIET:
        print(json.dumps({"failed": sorted(FAILED), "checked": CHECKED}, ensure_ascii=False))
        return 1 if FAILED else 0

    print()
    if CHECKED == 0:
        print("✕ 1件も見ていません（数えるものが無い）")
        return 2
    if FAILED:
        print(f"✕ {CHECKED}件中 {sum(map(len, FAILED.values()))}件 落ちました"
              f"（足: {', '.join(sorted(FAILED))}）")
        return 1
    print(f"○ {CHECKED}件ぜんぶ通りました（足 {len(LEGS)}本）")
    if brk or "--no-drill" in sys.argv:
        return 0
    if not drill():
        print("\n✕ 対照が外れた。守りを外しても落ちない足か、関係ない足まで落ちる守りがある")
        return 2
    print(f"  ○ {len(BREAKS)}通りとも、外した守りの足だけが落ちた")
    return 0


if __name__ == "__main__":
    sys.exit(main())
