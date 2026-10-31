"""**投稿の台帳（`posted.py`）の見張り。EC2 には1度も触らない。**

    python3 tools/shorts/post/posted_selftest.py
    BREAK=done python3 tools/shorts/post/posted_selftest.py   # 守りを1つ外した版で回す（対照の子）

終了コード 0=通った / 1=落ちた / **2=数えるものが無い・外す字が見つからない**
（`docs/island-standards.md` §15）。

回し役（`python/selftest_runner.py`）が `tools/shorts/` を降りて拾う。要るのは Python だけ。

## 何を見るか

`post.py` の `ec2` を偽物に差し替えて、**本物の `post.main()`** を回す。偽物は呼ばれた命令を
控えて、決めた返事（`RESULT {...}` の1行）を返すだけで、外には出ない。台帳は使い捨ての写し。
本物の `posted.json` は読むだけ。

この守りは「止める」と「通す」の両方が壊れうる。止めすぎると、別の案・別の場所まで出せなくなり、
`--again` を毎回付ける癖がついて守りが無いのと同じになる。だから両方を足にする。

| 足 | 確かめること |
| --- | --- |
| `done_stops` | 同じ動画 × 同じ場所が done → 止まる。EC2 に1度も触らない。出ている投稿 ID を出す |
| `pending_stops` | pending → 止まる。EC2 に触らない。`mark --done` と `--again` の一手を出す |
| `again_passes` | `--again` なら通る。前の記録は消さない |
| `other_place_passes` | 場所が違えば通る（YouTube に出した動画を TikTok へ） |
| `other_sha_passes` | sha256 が違えば通る（同じ案でも、書き直した動画） |
| `pending_first` | 投稿を頼んだ時点で pending が書いてある。返事が来ずに落ちたら pending のまま |
| `done_after` | 成功して ID が取れたら done（YouTube は video_id、TikTok は URL の数字） |
| `busy_rollback` | 遠隔デスクトップが使われていて何も始まらなかった回は、pending を残さない |
| `dry_skips` | `tt-post --dry` は台帳を見ない・書かない |
| `needs_sha` | sha256 が分からない投稿は、EC2 に触らずに止まる |
| `broken_stops` | 台帳が読めなければ止まる（空として通さない）。台帳を上書きしない |
| `mark` | 人が見て確かめた結果を done にできる。URL を ID として渡すと断る |
| `real_ledger` | git に入っている台帳に、台帳より前に出した6件が done で残っている |

## 守りを1つずつ外す（§15「対照は、足の数だけ用意する」）

下の `CUTS` が、`post.py` / `posted.py` の**本物の字**を1か所だけ書き換えた写しを作り、
それで足を全部回す。**外した守りの足だけが落ちる**ことを確かめる（ほかの足まで落ちたら、
足どうしが同じところを見ている＝足の数ほど守れていない）。外す字が本物に見つからなければ 2 で落ちる
（字を直したのに、ここを直し忘れた）。

`python/mutation_drill.py` も、隣の `posted.py` の比較を全部ひっくり返して当てる。
"""

from __future__ import annotations

import contextlib
import importlib.util
import io
import json
import os
import shutil
import subprocess
import sys
import tempfile
import traceback
import types
from contextlib import redirect_stdout
from pathlib import Path

HERE = Path(__file__).resolve().parent
BREAK = os.environ.get("BREAK", "")

# 外す守り: 名前 → (ファイル, 本物の字, 書き換えた字, 落ちるはずの足, 何を外すか)
CUTS: dict[str, tuple[str, str, str, set[str], str]] = {
    "done": ("posted.py", "        return done_msg(r)\n", "        return None\n",
             {"done_stops"}, "done の記録で止めない"),
    "pending": ("posted.py", "        return pending_msg(r)\n", "        return None\n",
                {"pending_stops"}, "pending の記録で止めない"),
    "again": ("posted.py", "    if again:\n        return None\n", "    if False:\n        return None\n",
              {"again_passes"}, "--again を見ない"),
    "place": ("posted.py", 'r["sha256"] == sha and r["place"] == place', 'r["sha256"] == sha',
              {"other_place_passes"}, "場所を見ずに引く"),
    "sha": ("posted.py", 'r["sha256"] == sha and r["place"] == place', 'r["place"] == place',
            {"other_sha_passes"}, "sha256 を見ずに引く"),
    "wire": ("post.py", "    stop = posted.refusal(rows, sha, place, a.again)\n", "    stop = None\n",
             {"done_stops", "pending_stops"}, "post.py が台帳を引かない"),
    "late": ("post.py",
             "    stop = posted.refusal(rows, sha, place, a.again)\n"
             "    if stop:\n        print(stop)\n        return 1\n"
             "    # 台帳に書く sha256 が、実際に上げるもの（EC2 に送った mp4）と同じであること\n"
             "    if not remote_sha_ok(a, sha):\n        return 1\n",
             "    if not remote_sha_ok(a, sha):\n        return 1\n"
             "    stop = posted.refusal(rows, sha, place, a.again)\n"
             "    if stop:\n        print(stop)\n        return 1\n",
             {"done_stops", "pending_stops"}, "台帳を引くのを EC2 に触ったあとにする"),
    "begin": ("posted.py", "    rows.append(rec)\n    save(rows, path)\n    return rec\n", "    return rec\n",
              {"pending_first"}, "始める前に pending を書かない"),
    "finish": ("post.py", '    done = bool(r.get("ok") and vid)\n', "    done = False\n",
               {"done_after"}, "成功しても done に書き換えない"),
    "busy": ("post.py", "        posted.forget(rec)\n", "        pass\n",
             {"busy_rollback"}, "何も始まらなかった回の pending を消さない"),
    "dry": ("post.py", "    if a.dry:\n        # 投稿の手前までの確かめ", "    if False:\n        # 投稿の手前までの確かめ",
            {"dry_skips"}, "--dry でも台帳を引く"),
    "nosha": ("post.py", "    if not s:\n        return None, ", "    if False:\n        return None, ",
              {"needs_sha"}, "sha256 が無くても先へ進む"),
    "broken": ("posted.py", '        raise Broken(f"台帳 {p} が JSON として読めない: {e}")\n', "        return []\n",
               {"broken_stops"}, "読めない台帳を空として扱う"),
    "idform": ("posted.py",
               "    if not (isinstance(vid, str) and ID_RE[place].fullmatch(vid)):\n        raise Refused",
               "    if False:\n        raise Refused",
               {"mark"}, "mark が ID の形を見ない"),
}

# 台帳より前に出した6件（#926）。消えたら、その動画をもう一度出せてしまう
BACKFILL = [
    ("yk-by7R7iPA/A", "youtube", "Do04EoViYdU", "652410cb"),
    ("yk-by7R7iPA/A", "tiktok", "7697445174338751765", "652410cb"),
    ("yk-by7R7iPA/B", "youtube", "rVGC150Y3hA", "19e6cbc6"),
    ("yk-by7R7iPA/B", "tiktok", "7697584644493036820", "19e6cbc6"),
    ("yk-by7R7iPA/C", "youtube", "W96gFSEKxZs", "0ebed6b3"),
    ("yk-by7R7iPA/C", "tiktok", "7697607097986370836", "0ebed6b3"),
]

SHA_X = "a" * 64
SHA_Y = "b" * 64
YT_ID = "selftestYT1"
TT_ID = "7000000000000000001"
PLAN = "selftest000/A"
YT = ["yt-draft", "--video", "selftest000", "--option", "A"]
TT = ["tt-post", "--video", "selftest000", "--option", "A"]

# EC2 の返事（`RESULT {...}` の1行）。形は yt_post.py / tt_post.py の result() と同じ
YT_OK = 'RESULT {"ok": true, "video_id": "%s"}' % YT_ID
TT_OK = 'RESULT {"ok": true, "posted": true, "urls": ["https://www.tiktok.com/@x/video/%s"]}' % TT_ID
DRY_OK = 'RESULT {"ok": true, "dry": true}'
# 2026-10-17 の C の TikTok の形: 返事の行が来ないまま切れる
CUT_OFF = "websocket._exceptions.WebSocketTimeoutException: timed out"
BUSY = 'WAIT: desktop input within 7 min (1000ms, xi2)\nRESULT {"ok": false, "error": "desktop_busy"}'


class Fake:
    """`ec2` の代わり。呼ばれた命令を控えて、決めた返事を返すだけ。外には出ない"""

    def __init__(self, sha: str, reply: str, on_post=None) -> None:
        self.sha, self.reply, self.on_post = sha, reply, on_post
        self.calls: list[str] = []

    def run(self, script: str, timeout: int = 600, quiet: bool = False):
        self.calls.append(script)
        if "sha256sum" in script:
            return 0, self.sha + "\n"
        if self.on_post:
            self.on_post()
        return 0, self.reply

    def put(self, local: str, remote: str) -> None:
        self.calls.append(f"put {remote}")

    def posts(self) -> list[str]:
        """投稿を頼んだ命令（EC2 で yt_post.py / tt_post.py を起こす行）"""
        return [c for c in self.calls if "yt_post.py draft" in c or "tt_post.py post" in c]


def load_tools(src: Path):
    """`src` に在る post.py / posted.py を読む。`ec2` は偽物の入れ物に差し替える"""
    box = types.ModuleType("ec2")
    # post.py は Chrome を触る段を列の札（ec2.lease）で挟む。札は ec2-chrome の ec2_queue_selftest.py が見るので、
    # ここでは何もしない札にして、どの列を取ったかだけ控える
    box.leases = []

    @contextlib.contextmanager
    def lease(lane, who=None, purpose="", **kw):
        box.leases.append(lane)
        yield "fake-ticket"
    box.lease, box.default_who, box.QueueError = lease, (lambda: "selftest"), type("QueueError", (Exception,), {})
    sys.modules["ec2"] = box
    for n in ("post", "posted"):
        sys.modules.pop(n, None)
    spec = importlib.util.spec_from_file_location("post", src / "post.py")
    post = importlib.util.module_from_spec(spec)
    sys.modules["post"] = post
    spec.loader.exec_module(post)
    posted = sys.modules["posted"]
    if Path(posted.__file__).resolve().parent != src.resolve():
        print(f"✕ 読んだ posted.py が {src} のものではない: {posted.__file__}")
        sys.exit(2)
    return post, posted, box


class Bench:
    """足を回す台。台帳は使い捨ての置き場に作る"""

    def __init__(self, src: Path, tmp: Path) -> None:
        self.post, self.posted, self.box = load_tools(src)
        self.tmp = tmp
        self.n = 0

    def ledger(self, rows) -> Path:
        self.n += 1
        p = self.tmp / f"posted_{self.n}.json"
        if isinstance(rows, str):
            p.write_text(rows, encoding="utf-8")
        else:
            self.posted.save(rows, str(p))
        self.posted.LEDGER = str(p)
        return p

    def call(self, fake: Fake, argv: list[str]) -> tuple[int, str]:
        self.box.run, self.box.put = fake.run, fake.put
        buf = io.StringIO()
        try:
            with redirect_stdout(buf):
                rc = self.post.main(argv)
        except SystemExit as e:
            rc = e.code if isinstance(e.code, int) else 1
        except Exception:
            rc = 1
            buf.write(traceback.format_exc())
        return rc, buf.getvalue()

    def rows(self) -> list[dict]:
        return json.loads(Path(self.posted.LEDGER).read_text(encoding="utf-8"))

    def last(self, sha: str, place: str):
        return self.posted.latest(self.rows(), sha, place)


def rec(sha: str, place: str, state: str, vid) -> dict:
    return {"plan": PLAN, "place": place, "state": state, "id": vid, "sha256": sha,
            "at": "2026-10-17T00:00:00Z"}


# ---- 足 ---------------------------------------------------------------

def leg_done_stops(b: Bench):
    out = []
    for place, argv, vid, reply in (("tiktok", TT, TT_ID, TT_OK), ("youtube", YT, YT_ID, YT_OK)):
        p = b.ledger([rec(SHA_X, place, "done", vid)])
        before = p.read_bytes()
        f = Fake(SHA_X, reply)
        rc, text = b.call(f, argv + ["--sha", SHA_X])
        out += [(f"{place}: 止まる（終了コード {rc}）", rc != 0),
                (f"{place}: EC2 に1度も触らない（{len(f.calls)}回）", f.calls == []),
                (f"{place}: 出ている投稿 ID {vid} を出す", vid in text),
                (f"{place}: 台帳を書き換えない", p.read_bytes() == before)]
    return out


def leg_pending_stops(b: Bench):
    p = b.ledger([rec(SHA_X, "tiktok", "pending", None)])
    before = p.read_bytes()
    f = Fake(SHA_X, TT_OK)
    rc, text = b.call(f, TT + ["--sha", SHA_X])
    return [(f"止まる（終了コード {rc}）", rc != 0),
            (f"EC2 に1度も触らない（{len(f.calls)}回）", f.calls == []),
            ("出ていれば mark --done --id … の一手を、sha256 ごと出す",
             f"mark --place tiktok --sha {SHA_X} --done --id" in text),
            ("出ていなければ --again の一手を出す", "--again" in text),
            ("台帳を書き換えない", p.read_bytes() == before)]


def leg_again_passes(b: Bench):
    b.ledger([rec(SHA_X, "tiktok", "done", TT_ID)])
    f = Fake(SHA_X, TT_OK)
    b.call(f, TT + ["--sha", SHA_X, "--again"])
    old = [r for r in b.rows() if r.get("id") == TT_ID and r["at"] == "2026-10-17T00:00:00Z"]
    return [(f"投稿を頼む（{len(f.posts())}回）", len(f.posts()) == 1),
            ("前の done の記録を消さない", len(old) == 1)]


def leg_other_place_passes(b: Bench):
    b.ledger([rec(SHA_X, "youtube", "done", YT_ID)])
    f = Fake(SHA_X, TT_OK)
    b.call(f, TT + ["--sha", SHA_X])
    return [(f"YouTube に出した動画を TikTok へ: 投稿を頼む（{len(f.posts())}回）", len(f.posts()) == 1)]


def leg_other_sha_passes(b: Bench):
    b.ledger([rec(SHA_X, "tiktok", "done", TT_ID)])
    f = Fake(SHA_Y, TT_OK)
    b.call(f, TT + ["--sha", SHA_Y])
    return [(f"書き直した動画（別の sha256）: 投稿を頼む（{len(f.posts())}回）", len(f.posts()) == 1)]


def leg_pending_first(b: Bench):
    b.ledger([])
    seen = {}
    f = Fake(SHA_X, CUT_OFF, on_post=lambda: seen.update(r=b.last(SHA_X, "tiktok")))
    rc, text = b.call(f, TT + ["--sha", SHA_X])
    at_post = (seen.get("r") or {}).get("state")
    after = (b.last(SHA_X, "tiktok") or {}).get("state")
    return [(f"投稿を頼んだ時点で pending が書いてある（{at_post}）", at_post == "pending"),
            (f"返事が来ずに落ちた: 終了コード {rc}", rc != 0),
            (f"落ちたあとも pending のまま（{after}）", after == "pending"),
            ("次の一手（mark --done / --again）を出す", "mark --place tiktok" in text and "--again" in text)]


def leg_done_after(b: Bench):
    out = []
    for place, argv, vid, reply in (("tiktok", TT, TT_ID, TT_OK), ("youtube", YT, YT_ID, YT_OK)):
        b.ledger([])
        f = Fake(SHA_X, reply)
        rc, _ = b.call(f, argv + ["--sha", SHA_X])
        r = b.last(SHA_X, place) or {}
        out += [(f"{place}: 成功して終了コード 0（{rc}）", rc == 0),
                (f"{place}: done（{r.get('state')}）・投稿 ID {r.get('id')}",
                 r.get("state") == "done" and r.get("id") == vid and r.get("plan") == PLAN)]
    return out


def leg_busy_rollback(b: Bench):
    b.ledger([])
    f = Fake(SHA_X, BUSY)
    rc, _ = b.call(f, TT + ["--sha", SHA_X])
    rows = b.rows()
    return [(f"止まる（終了コード {rc}）", rc != 0),
            (f"pending を残さない（台帳 {len(rows)}件）", rows == [])]


def leg_dry_skips(b: Bench):
    p = b.ledger([rec(SHA_X, "tiktok", "done", TT_ID)])
    before = p.read_bytes()
    f = Fake(SHA_X, DRY_OK)
    rc, _ = b.call(f, TT + ["--dry", "--cover"])
    dry = [c for c in f.posts() if " --dry" in c]
    return [(f"done の動画でも、手前までの確かめは回る（{len(dry)}回・終了コード {rc}）", len(dry) == 1 and rc == 0),
            ("台帳を書き換えない", p.read_bytes() == before)]


def leg_needs_sha(b: Bench):
    out = []
    for name, argv in (("yt-draft", YT), ("tt-post", TT)):
        b.ledger([])
        f = Fake(SHA_X, TT_OK)
        rc, text = b.call(f, argv)
        out += [(f"{name}: --sha も --dir も無い → 止まる（終了コード {rc}）", rc != 0),
                (f"{name}: EC2 に触らない（{len(f.calls)}回）", f.calls == []),
                (f"{name}: 何を付ければいいかを言う", "sha256 が要る" in text)]
    return out


def leg_broken_stops(b: Bench):
    p = b.ledger('[{"plan": ')
    before = p.read_bytes()
    f = Fake(SHA_X, TT_OK)
    rc, text = b.call(f, TT + ["--sha", SHA_X])
    return [(f"止まる（終了コード {rc}）", rc != 0),
            (f"EC2 に触らない（{len(f.calls)}回）", f.calls == []),
            ("読めないと言う", "読めない" in text),
            ("読めない台帳を上書きしない", p.read_bytes() == before)]


def leg_mark(b: Bench):
    p = b.ledger([rec(SHA_X, "tiktok", "pending", None)])
    before = p.read_bytes()
    f = Fake(SHA_X, TT_OK)
    url = f"https://www.tiktok.com/@x/video/{TT_ID}"
    rc1, _ = b.call(f, ["mark", "--place", "tiktok", "--sha", SHA_X, "--done", "--id", url])
    same = p.read_bytes() == before
    rc2, _ = b.call(f, ["mark", "--place", "tiktok", "--sha", SHA_X, "--done", "--id", TT_ID])
    r = b.last(SHA_X, "tiktok") or {}
    return [(f"URL を ID として渡すと断る（終了コード {rc1}）・台帳はそのまま", rc1 != 0 and same),
            (f"ID なら pending → done（終了コード {rc2}・{r.get('state')}・{r.get('id')}）",
             rc2 == 0 and r.get("state") == "done" and r.get("id") == TT_ID),
            (f"mark は EC2 に触らない（{len(f.calls)}回）", f.calls == [])]


def leg_real_ledger(b: Bench):
    path = HERE / "posted.json"
    try:
        rows = b.posted.load(str(path))
    except Exception as e:  # noqa: BLE001 - 読めないこと自体を足の結果にする
        return [(f"git に入っている台帳が読める（{e}）", False)]
    out = [(f"git に入っている台帳が読める（{len(rows)}件）", True)]
    for plan, place, vid, head in BACKFILL:
        hit = [r for r in rows if r["plan"] == plan and r["place"] == place and r.get("id") == vid]
        good = len(hit) == 1 and hit[0]["state"] == "done" and hit[0]["sha256"].startswith(head)
        out.append((f"{plan} {place} {vid} が done（sha256 {head}…）", good))
    return out


LEGS = {
    "done_stops": leg_done_stops,
    "pending_stops": leg_pending_stops,
    "again_passes": leg_again_passes,
    "other_place_passes": leg_other_place_passes,
    "other_sha_passes": leg_other_sha_passes,
    "pending_first": leg_pending_first,
    "done_after": leg_done_after,
    "busy_rollback": leg_busy_rollback,
    "dry_skips": leg_dry_skips,
    "needs_sha": leg_needs_sha,
    "broken_stops": leg_broken_stops,
    "mark": leg_mark,
    "real_ledger": leg_real_ledger,
}


def run_legs(src: Path, tmp: Path, quiet: bool) -> tuple[list[str], int]:
    b = Bench(src, tmp)
    failed: list[str] = []
    checked = 0
    for name, fn in LEGS.items():
        res = fn(b)
        checked += len(res)
        bad = [what for what, ok in res if not ok]
        if bad:
            failed.append(name)
        if not quiet:
            print(f"[{name}]")
            for what, ok in res:
                print(f"  {'○' if ok else '✕'} {what}")
    return failed, checked


def cut_copy(name: str, dst: Path) -> None:
    """本物の post.py / posted.py を写して、守りを1つだけ外す。外す字が無ければ 2 で落ちる"""
    for f in ("post.py", "posted.py"):
        shutil.copy(HERE / f, dst / f)
    fname, old, new, _, _ = CUTS[name]
    text = (dst / fname).read_text(encoding="utf-8")
    if text.count(old) != 1:
        print(f"✕ BREAK={name}: 外す字が {fname} に {text.count(old)} か所（1か所のはず）。字を直したら CUTS も直す")
        sys.exit(2)
    (dst / fname).write_text(text.replace(old, new), encoding="utf-8")


def child(name: str) -> int:
    """守りを1つ外した写しで足を全部回し、落ちた足の名前を1行で返す（親が読む）"""
    if name not in CUTS:
        print(f"✕ BREAK={name} という守りは無い（{' / '.join(CUTS)}）")
        return 2
    with tempfile.TemporaryDirectory() as td:
        src, tmp = Path(td) / "src", Path(td) / "ledgers"
        src.mkdir()
        tmp.mkdir()
        cut_copy(name, src)
        failed, checked = run_legs(src, tmp, quiet=False)
    print("LEGS_FAILED " + json.dumps(sorted(failed)))
    if checked == 0:
        return 2
    return 1 if failed else 0


def drill() -> list[str]:
    """守りを1つずつ外して、**その守りの足だけ**が落ちるかを見る"""
    print("[対照] 守りを1つずつ外すと、その足だけが落ちるか")
    bad = []
    for name, (fname, _, _, want, why) in CUTS.items():
        env = dict(os.environ, BREAK=name)
        r = subprocess.run([sys.executable, str(Path(__file__).resolve())], capture_output=True,
                           text=True, env=env, timeout=120, check=False)
        line = [ln for ln in r.stdout.splitlines() if ln.startswith("LEGS_FAILED ")]
        got = set(json.loads(line[-1][len("LEGS_FAILED "):])) if line else None
        hit = got == want and r.returncode == 1
        print(f"  {'○' if hit else '✕'} BREAK={name}（{fname}: {why}）→ 落ちた足 "
              f"{sorted(got) if got is not None else '（読めない: ' + (r.stdout + r.stderr).strip()[-200:] + '）'}"
              f"（欲しいのは {sorted(want)}）")
        if not hit:
            bad.append(name)
    return bad


def main() -> int:
    if BREAK:
        return child(BREAK)
    with tempfile.TemporaryDirectory() as td:
        failed, checked = run_legs(HERE, Path(td), quiet=False)
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
        return 1
    print(f"○ {len(LEGS)}本の足（{checked}件）が通り、守り {len(CUTS)}個を1つずつ外すと、その足だけが落ちた")
    return 0


if __name__ == "__main__":
    sys.exit(main())
