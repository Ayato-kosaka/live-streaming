"""**取りこぼしの見張り（`watch.py`）の見張り。GitHub には1度も触らない。** 要るのは Python だけ。

    python3 tools/shorts/feedback/watch_selftest.py
    BREAK=signed python3 tools/shorts/feedback/watch_selftest.py   # 守りを1つ外した版で回す（対照の子）

終了コード 0=通った / 1=落ちた / 2=数えるものが無い・外す字が見つからない（`docs/island-standards.md` §15）。
回し役（`python/selftest_runner.py`）が `tools/shorts/` を降りて拾い、`shorts_selftest.yml` と
`shorts_feedback_watch.yml`（本番を触る前）が名指しでも回す。

`watch.main()` の GitHub の口（`gh`）を偽物に差し替えて、**本物の `main()`** を回す。偽物は決めた issue・
コメント・枝の帳面を返し、書く口（`create` / `patch`）は呼ばれたことを控えるだけ。帳面は使い捨ての置き場に作る。

| 足 | 確かめること |
| --- | --- |
| `missing_red` | 帳面に無いあやとのコメント → 1（赤） |
| `feedback_green` / `other_green` | 「指摘」か「指摘ではないコメント」に足す → 0（緑） |
| `signed_ignored` | 末尾にこちらの署名があるコメントは数えない |
| `quoted_sig_counts` | 署名を引用（`>`）の中に写しただけのあやとのコメントは数える |
| `not_owner_ignored` | bot（`github-actions[bot]` の呼び出し）とほかの人のコメントは数えない |
| `call_ignored` | あやとの名前で書かれていても、bot の呼び出しの字を持つものは数えない |
| `wrong_issue` | 帳面の URL の issue 番号が違えば、入っていない |
| `branch_union` | 帳面が作業枝にだけあっても、`--branches` なら入っている |
| `grace` | 書いてから3時間未満は数えない。`--grace-hours 0` なら数える |
| `zero` | 札 shorts の issue が0本・あやとのコメントが0件 → 2（0 を答えにしない） |
| `no_ledger` | 帳面を1つも読めない → 2 |
| `unreachable` | GitHub に届かない → 2。`--apply` でも何も書かない |
| `apply_create` | 取りこぼしがあれば、題・札・待ちの札つきで issue を1本立てる。本文に URL、コメントの字は写さない |
| `apply_close` | 取りこぼしが無くなれば、開いている issue を閉じる |
| `apply_noop_unknown` | 数えられない日は、開いている issue を閉じない |
"""
from __future__ import annotations

import atexit
import io
import logging
import sys
import tempfile
import urllib.error
from contextlib import redirect_stderr, redirect_stdout
from datetime import datetime, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(ROOT / "python"))
import legs  # noqa: E402
from ticket_labels import OWNER_LOGIN, SIGNATURE, WAIT_STYLE, WAIT_US  # noqa: E402

NOW = datetime(2026, 10, 21, 12, 0, tzinfo=timezone.utc)
OLD = "2026-10-19T03:00:00Z"
YOUNG = "2026-10-21T11:00:00Z"
U = "https://github.com/Ayato-kosaka/live-streaming/issues/{}#issuecomment-{}"
TEXT = "題が現実的じゃなくてつまらん"

CUTS = {
    "signed": ("watch.py", "    if signed_by_system(body):\n        return False\n", "    if False:\n        return False\n",
               # 「あやとのコメント0件」の足は、こちらの書き込みだけの issue で作ってあるので一緒に落ちる
               {"signed_ignored", "zero"}, "こちらの署名を見ない"),
    "owner": ("watch.py", "    if login.lower() != OWNER_LOGIN.lower():\n", "    if False:\n",
              {"not_owner_ignored"}, "書き手を見ない"),
    "call": ("watch.py", "    if CALL in body:\n", "    if False:\n", {"call_ignored"}, "呼び出しの字を見ない"),
    "grace": ("watch.py", "            if at is not None and now - at < timedelta(hours=grace_hours):\n", "            if False:\n",
              {"grace"}, "書いたばかりのコメントも数える"),
    "issue_match": ("watch.py", 'e["issue"] not in refs.get(e["id"], ())', 'e["id"] not in refs',
                    {"wrong_issue"}, "issue の番号を見ない"),
    "union": ("watch.py", "            texts += have\n", "            texts += []\n", {"branch_union"}, "枝の帳面を合わせない"),
    "zero": ("watch.py", '    if not got or not (counted or a["young"]):\n', "    if False:\n",
             {"zero", "unreachable", "apply_noop_unknown"}, "0本・0件・読めないを「取りこぼし無し」にする"),
    "no_ledger": ("watch.py", "    if refs is None:\n", "    refs = refs or {}\n    if False:\n",
                  {"no_ledger"}, "帳面が読めなくても数える"),
    "body_url": ("watch.py", "        rows.append(f\"| #{e['issue']} {title} | {e['at'][:10]} | {e['url']} |\")\n",
                 "        rows.append(f\"| #{e['issue']} {title} | {e['at'][:10]} |\")\n",
                 {"apply_create"}, "本文に URL を書かない"),
    "apply_gate": ("watch.py", "    if not apply:\n        logger.info(", "    if True:\n        logger.info(",
                   {"apply_create", "apply_close"}, "--apply でも書かない"),
}


class Fake:
    """`watch.Gh` の代わり。外には出ない。"""

    WAIT = WAIT_US
    STYLE = WAIT_STYLE

    def __init__(self, issues, branches=None, fail=False, existing=None):
        self.issues, self.texts, self.fail = issues, branches or {}, fail
        self.existing = existing or []
        self.repo, self.token = "Ayato-kosaka/live-streaming", "t"
        self.made, self.patched = [], []

    def _gate(self):
        if self.fail:
            raise urllib.error.URLError("届かない（偽物）")

    def shorts_issues(self):
        self._gate()
        return [{"number": i["number"], "title": i["title"], "comments": len(i["comments"])} for i in self.issues]

    def comments(self, number):
        return next(i["comments"] for i in self.issues if i["number"] == number)

    def branches(self):
        self._gate()
        return list(self.texts)

    def ledger_at(self, b):
        return self.texts[b]

    def list_issues(self, label):
        self._gate()
        return self.existing

    def create(self, title, text, label):
        self.made.append((title, text, label))
        return {"number": 9001}

    def patch(self, number, payload):
        self.patched.append((number, payload))
        return {}


def cm(cid, body=TEXT, login=OWNER_LOGIN, kind="User", at=OLD):
    return {"id": cid, "html_url": U.format(975, cid), "user": {"login": login, "type": kind}, "created_at": at, "body": body}


def iss(*comments, number=975):
    return {"number": number, "title": "【ショート制作】ストックホルムの地下鉄の回", "comments": list(comments)}


def ledger_text(feedback=(), other=()):
    items = "".join(f"  - 2026-10-21 #{n} {U.format(n, c)}\n" for n, c in feedback)
    return ("# 帳面\n\n## 指摘\n\n### F-001 決まり\n\n- **言われた:**\n" + items +
            "- **分類:** 題\n- **あやとの言葉:**\n  > x\n- **決まり:** x\n- **直す前 → 直した後:** a → b\n"
            "- **当てる場所:** 人の目\n\n## 指摘ではないコメント\n\n" +
            "".join(f"- {U.format(n, c)}（承認）\n" for n, c in other))


class Bench:
    def __init__(self, W, tmp: Path):
        self.W, self.tmp, self.n = W, tmp, 0

    def run(self, fake, ledger=None, *args):
        """`watch.main()` を回して、終了コードを返す。ledger が None なら帳面を渡さない（読めない置き場）。"""
        self.n += 1
        p = self.tmp / f"ledger_{self.n}.md"
        if ledger is not None:
            p.write_text(ledger, encoding="utf-8")
        argv = ["--ledger", str(p), *args]
        out = io.StringIO()
        log = logging.getLogger("shorts_feedback_watch")
        h = logging.StreamHandler(out)
        log.addHandler(h)
        # 根の記録係（basicConfig）は本物の標準エラーを握っているので、そこへ流さない
        log.propagate = False
        try:
            with redirect_stdout(out), redirect_stderr(out):
                rc = self.W.main(argv, gh=fake, now=NOW)
        finally:
            log.removeHandler(h)
            log.propagate = True
        self.last = out.getvalue()
        return rc


def setup(cut):
    c = CUTS[cut] if cut else None
    legs.load(HERE / "ledger.py", "ledger")
    W = legs.load(HERE / "watch.py", "watch", (c[1], c[2]) if c else None)
    # 使い捨ての帳面の置き場。終わったら消す（対照の子も1つずつ作るので、残すと回すたびに溜まる）
    td = tempfile.TemporaryDirectory(prefix="watch_selftest_")
    atexit.register(td.cleanup)
    return Bench(W, Path(td.name))


# ---- 足 ----
def leg_missing_red(b):
    return [("帳面に無いあやとのコメント → 1", b.run(Fake([iss(cm(101))]), ledger_text()) == 1)]


def leg_feedback_green(b):
    return [("「指摘」の節に足す → 0", b.run(Fake([iss(cm(101))]), ledger_text(feedback=[(975, 101)])) == 0)]


def leg_other_green(b):
    return [("「指摘ではないコメント」に足す → 0", b.run(Fake([iss(cm(101), cm(102, "A"))]),
                                                   ledger_text(feedback=[(975, 101)], other=[(975, 102)])) == 0)]


def leg_signed_ignored(b):
    signed = cm(103, f"直しました。\n\n---\n{SIGNATURE}")
    return [("末尾にこちらの署名があるコメントは数えない", b.run(Fake([iss(cm(101), signed)]), ledger_text(feedback=[(975, 101)])) == 0)]


def leg_quoted_sig_counts(b):
    quoted = cm(104, f"> 直しました。\n> {SIGNATURE}\n\nまだ AI 臭い")
    return [("署名を引用に写しただけのあやとのコメントは数える（帳面に無ければ 1）",
             b.run(Fake([iss(cm(101), quoted)]), ledger_text(feedback=[(975, 101)])) == 1)]


def leg_not_owner_ignored(b):
    bot = cm(105, "@Ayato-kosaka 判断をお願いします。", login="github-actions[bot]", kind="Bot")
    other = cm(106, "通りすがりです", login="someone-else")
    return [("bot とほかの人のコメントは数えない",
             b.run(Fake([iss(cm(101), bot, other)]), ledger_text(feedback=[(975, 101)])) == 0)]


def leg_call_ignored(b):
    call = cm(107, "@Ayato-kosaka 判断をお願いします。\n\n---\n_あやと島案内鳥が呼んでいます_")
    return [("あやとの名前でも、呼び出しの字を持つものは数えない",
             b.run(Fake([iss(cm(101), call)]), ledger_text(feedback=[(975, 101)])) == 0)]


def leg_wrong_issue(b):
    return [("帳面の URL の issue 番号が違えば入っていない → 1", b.run(Fake([iss(cm(101))]), ledger_text(feedback=[(976, 101)])) == 1)]


def leg_branch_union(b):
    def fake():
        return Fake([iss(cm(101))], branches={"master": None, "claude/x": ledger_text(feedback=[(975, 101)])})
    return [("作業枝にだけある帳面も --branches なら入っている → 0", b.run(fake(), ledger_text(), "--branches") == 0),
            ("--branches が無ければ手元の帳面だけ → 1", b.run(fake(), ledger_text()) == 1)]


def leg_grace(b):
    return [("書いてから1時間のコメントはまだ数えない → 0", b.run(Fake([iss(cm(101), cm(108, at=YOUNG))]), ledger_text(feedback=[(975, 101)])) == 0),
            ("--grace-hours 0 なら数える → 1", b.run(Fake([iss(cm(101), cm(108, at=YOUNG))]), ledger_text(feedback=[(975, 101)]),
                                                   "--grace-hours", "0") == 1)]


def leg_zero(b):
    only_ours = cm(109, f"出しました\n\n---\n{SIGNATURE}")
    return [("札 shorts の issue が0本 → 2", b.run(Fake([]), ledger_text()) == 2),
            ("あやとのコメントが0件 → 2", b.run(Fake([iss(only_ours)]), ledger_text()) == 2)]


def leg_no_ledger(b):
    return [("帳面を1つも読めない → 2", b.run(Fake([iss(cm(101))]), None) == 2)]


def leg_unreachable(b):
    rc = b.run(Fake([iss(cm(101))], fail=True), ledger_text())
    f = Fake([iss(cm(101))], fail=True)
    b.run(f, ledger_text(), "--apply")
    return [("GitHub に届かない → 2", rc == 2), ("--apply でも何も書かない", not f.made and not f.patched)]


def leg_apply_create(b):
    f = Fake([iss(cm(101))])
    rc = b.run(f, ledger_text(), "--apply")
    ok = len(f.made) == 1
    title, text, label = f.made[0] if ok else ("", "", "")
    return [("取りこぼしがあれば 1 で、issue を1本立てる", rc == 1 and ok),
            ("題・札が見張りのもの", title == b.W.TITLE and label == b.W.LABEL),
            ("本文に見えない印と、コメントの URL がある", b.W.MARK in text and U.format(975, 101) in text),
            ("本文にコメントの字を写さない", TEXT not in text)]


def leg_apply_close(b):
    open_one = {"number": 42, "state": "open", "body": b.W.MARK + "\n前の本文", "labels": [b.W.LABEL, WAIT_US]}
    f = Fake([iss(cm(101))], existing=[open_one])
    rc = b.run(f, ledger_text(feedback=[(975, 101)]), "--apply")
    return [("取りこぼしが無くなれば、開いている issue を閉じる",
             rc == 0 and f.patched and f.patched[0][0] == 42 and f.patched[0][1].get("state") == "closed")]


def leg_apply_noop_unknown(b):
    open_one = {"number": 42, "state": "open", "body": b.W.MARK + "\n前の本文", "labels": [b.W.LABEL, WAIT_US]}
    f = Fake([], existing=[open_one])
    rc = b.run(f, ledger_text(), "--apply")
    return [("数えられない日（issue 0本）は 2 で、開いている issue を閉じない", rc == 2 and not f.patched and not f.made)]


LEGS = {
    "missing_red": leg_missing_red, "feedback_green": leg_feedback_green, "other_green": leg_other_green,
    "signed_ignored": leg_signed_ignored, "quoted_sig_counts": leg_quoted_sig_counts,
    "not_owner_ignored": leg_not_owner_ignored, "call_ignored": leg_call_ignored, "wrong_issue": leg_wrong_issue,
    "branch_union": leg_branch_union, "grace": leg_grace, "zero": leg_zero, "no_ledger": leg_no_ledger,
    "unreachable": leg_unreachable, "apply_create": leg_apply_create, "apply_close": leg_apply_close,
    "apply_noop_unknown": leg_apply_noop_unknown,
}

if __name__ == "__main__":
    sys.exit(legs.main(Path(__file__).resolve(), LEGS, CUTS, setup))
