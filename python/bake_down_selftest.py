"""偽の GitHub で、**焼き直しが止まっているの映し方を実際に動かして確かめる。**

    python python/bake_down_selftest.py

**本番には1バイトも出ない。** GitHub に届かないし、資格情報もネットワークも
要らない（`bake_down.py` が外に出る口は `Gh` の5つだけなので、そこを偽物に差し替える）。

確かめるのは14:

  1. **焼くのが落ちた**朝に issue が **1本**開く（本文に、落ちた step の名前が出る）
  2. **凍っていた**朝にも issue が開く。**本文が 1 と違う**（直し方が違うので）
  3. **また焼けたら**、その issue が**閉じる**
  4. **同じ状態が続いている**あいだは **1バイトも書かない**
  5. 落ちた → 凍った と変わったら、**同じ1本**の本文だけ書き換わる
  6. **分からない朝は、開きも閉じもしない**（`cancelled` ／ 無人の run が無い）
  7. **手で押した run は数えない**（dry_run の緑で閉じない・手押しの赤で開かない）
 7b. ただし**赤いあとで手で押して通っていたら保留する**（2026-09-16 の本番の並び）
  8. 人が手で**タイトルを変えた** issue でも、見えない印で同じ1本を使う
  9. `--apply` を付けなければ、**GET は通り、POST と PATCH は 0回**
 10. **歯止めを5つ、1つずつ外すと落ちる**
 11. **読めなかったら（403）赤くして止まる**（終了コード 1 と、1行のログ）
 12. **0件が返っても落ちない**（ラベルがまだ無い朝＝いまの本番の状態）
 13. **ワークフローの YAML と突き合わせる**（繋ぎ先の名前・乗っている step の名前）

そのあとに、**本文にもログにも視聴者さんの素性が1文字も出ない**ことを数える。

## 6 と 7 が、この確かめの本体

「止まっている」を決めるのは `assess()` ひとつで、そこを間違えると
**空振りの issue が毎朝開く**か、**本当に止まった朝に黙る**かのどちらかになる。
どちらも、この仕組みを作った意味を消す。

そのうえで、**この係にしかない転び方が「分からない朝に閉じる」。**
`ingest_down.py` は読む元が毎晩必ず書き換わる札1枚なので、読めない朝は異常だけ。
こちらが読むのは run の一覧で、**手で押したぶんしか無い日**は正常にありうる。
そこで「止まっていない」に倒すと、**直っていないのに issue を閉じる。**
だから 6 と 7 を、閉じる側・開く側の両方から踏む。

## 13 がなぜ要るか（#105 と同じ轍）

`CLAUDE.md` にこう書いてある——**繋ぎはワークフローの `name:` で解決される。
あちらの名前を変えると黙って切れる。赤くならない。走らなくなるだけ。**

同じことが、乗っている step の名前にも起きる。`rebake.yml` の
「凍っていたら赤くする」を書き換えると、**凍った朝が「焼くのが落ちた」として
issue に出る。** 赤くならないし、issue も立つので、誰も気づかない。

#105 で外したのは、**確かめた面がどれも同じ側だった**こと。
偽の GitHub を何通り回しても、**それは全部「Python の中」**で、
ワークフローの YAML を1行も読んでいない。だからここで読む。

## 素性の数えかた

このリポジトリは公開で、Actions のログも issue も誰でも読める。
「出していないつもり」ではなく、**出たものを見る。**
`sys.stdout` と `sys.stderr` を二股にして出力を丸ごと溜め、最後にそこを探す。
**数え方は `tools/logident.py` に寄せる**（自前の正規表現を持つと探し方が
2つになり、片方を直し忘れたときに食い違う）。

この係が読む run には、**GitHub がふつうに入れてくる人の名前とメール**が付いてくる
（`actor` / `head_commit.author`）。いまは1つも読んでいないが、
**run を丸ごとログへ流す1行が生えた日に落ちる**ように、偽の run にわざと混ぜてある。
"""

import importlib.util
import io
import os
import sys
import urllib.error

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# 実際の出力を溜める袋。**bake_down（＝basicConfig）を読み込む前に**差し替える
REAL_OUT, REAL_ERR = sys.stdout, sys.stderr
BUF = io.StringIO()


class Tee:
    """書いたものを、画面と袋の両方へ流す。"""

    def __init__(self, *ws):
        self.ws = ws

    def write(self, s):
        for w in self.ws:
            w.write(s)
        return len(s)

    def flush(self):
        for w in self.ws:
            try:
                w.flush()
            except Exception:  # noqa: BLE001
                pass


sys.stdout = Tee(REAL_OUT, BUF)
sys.stderr = Tee(REAL_ERR, BUF)

import bake_down  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FLOW = os.path.join(ROOT, ".github", "workflows")

# この係のワークフロー。13 で、中の繋ぎ先を読む
SELF_YML = "bake_down.yml"


def _load_logident():
    """`tools/logident.py` を読み込む。**数え方はあちら1か所に寄せる。**"""
    path = os.path.join(ROOT, "tools", "logident.py")
    spec = importlib.util.spec_from_file_location("logident", path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


logident = _load_logident()

# ---------------------------------------------------------------- 偽の run

# **本番と同じ形**（チャンネルIDは `UC` + 22文字 / `@…` / どねID は10桁）。
# 形が違うと、本番では効かない字を探して「0件」と言うことになる
# （`docs/island-misses.md` #79）
CID = "UCzzFAKE0000000000000002"
HANDLE = "@ふしぎな-fake2"
PK = "1000000002"

# run に**わざと混ぜる**人の跡。GitHub は `actor` も `head_commit.author` も
# 必ず付けてくるので、**これは仮定ではなく本番にあるもの。**
# run を丸ごとログへ流す1行が生えた日に、最後の数えで落ちる
DIRT = {
    "actor": {"login": HANDLE, "email": "someone@example.com"},
    "display_title": f"{CID} / {HANDLE} / {PK}",
    "head_commit": {"author": {"name": HANDLE, "email": "someone@example.com"}},
}

STARTED = "2026-09-16T05:34:00Z"


def row(n: int, conclusion: str, event: str = "schedule", at: str = STARTED) -> dict:
    """run を1本こしらえる。**形は Actions の口が返すものと同じ。**"""
    return {
        "id": 9000 + n,
        "run_number": n,
        "event": event,
        "status": "completed",
        "conclusion": conclusion,
        "run_started_at": at,
        "created_at": at,
        **DIRT,
    }


# **焼くのが落ちた朝。** 1本目で止まるので、あとの step は skipped
STEPS_BROKEN = [
    {"name": "リポジトリのチェックアウト", "conclusion": "success"},
    {"name": "またいだ呼び出しが合っているか", "conclusion": "success"},
    {"name": "焼く", "conclusion": "failure"},
    {"name": "中の数が縮んでいないか", "conclusion": "skipped"},
    {"name": bake_down.FROZEN_STEP, "conclusion": "skipped"},
]

# **凍っていた朝。** 最後まで通って、いちばん後ろだけが落ちる
# **古い朝。** 焼き直しは通っていて、人しか新しくできない本が置いていかれている
STEPS_STALE = [
    {"name": "リポジトリのチェックアウト", "conclusion": "success"},
    {"name": "焼く", "conclusion": "success"},
    {"name": "凍っていないか", "conclusion": "success"},
    {"name": "master に入れる", "conclusion": "success"},
    {"name": bake_down.FROZEN_STEP, "conclusion": "success"},
    {"name": bake_down.STALE_STEP, "conclusion": "failure"},
]

# **両方落ちた朝。** どちらも「焼き直しそのものは動いている」側なので、
# 「焼くのが落ちた」に寄せてはいけない
STEPS_FROZEN_AND_STALE = [
    {"name": "焼く", "conclusion": "success"},
    {"name": bake_down.FROZEN_STEP, "conclusion": "failure"},
    {"name": bake_down.STALE_STEP, "conclusion": "failure"},
]

# **出したあとの見張りが鳴った朝。** 焼き直しは通り、master にも入り、
# 本番にも配り終わっている。そのあとの見張りが1本鳴っているだけ
STEPS_WATCH = [
    {"name": "焼く", "conclusion": "success"},
    {"name": "master に入れる", "conclusion": "success"},
    {"name": "Hosting を配る", "conclusion": "success"},
    {"name": "分かち合う絵を撮り直せたか", "conclusion": "failure"},
    {"name": bake_down.FROZEN_STEP, "conclusion": "success"},
]

# **焼き直しも落ちて、見張りも鳴った朝。** 見張りに寄せると、
# **落ちた焼き直しが見出しから消える**
STEPS_BROKEN_AND_WATCH = [
    {"name": "焼く", "conclusion": "failure"},
    {"name": "分かち合う絵を撮り直せたか", "conclusion": "failure"},
]

STEPS_FROZEN = [
    {"name": "リポジトリのチェックアウト", "conclusion": "success"},
    {"name": "焼く", "conclusion": "success"},
    {"name": "凍っていないか", "conclusion": "success"},
    {"name": "master に入れる", "conclusion": "success"},
    {"name": bake_down.FROZEN_STEP, "conclusion": "failure"},
]

GREEN = [row(1, "success")]
BROKEN = [row(2, "failure")]
FROZEN = [row(3, "failure")]
CANCELLED = [row(4, "cancelled")]
BY_HAND_RED = [row(5, "failure", event="workflow_dispatch")]
BY_HAND_OK = [row(6, "success", event="workflow_dispatch")]
LINKED = [row(7, "success", event="workflow_run")]

# **2026-09-16 の本番そのもの。** 05:34 と 08:33 が赤で、そのあと 08:37 に
# 人が手で押して緑になった。並びは本番の `id` の順で置いてある
# （手押しの緑が**いちばん新しい**）
REAL = [
    row(33, "success", event="workflow_dispatch", at="2026-09-16T08:37:05Z"),
    row(32, "failure", event="workflow_run", at="2026-09-16T08:33:35Z"),
    row(31, "failure", event="schedule", at="2026-09-16T05:34:53Z"),
    row(30, "success", event="workflow_run", at="2026-09-15T23:05:54Z"),
]


# ---------------------------------------------------------------- 偽の口

class FakeGh:
    """偽の GitHub。**口ごとに叩いた回数と、issue の本数を数える。**

    「増えていないか」は結果（開いている issue の数）だけでは言えない。
    1本消してもう1本立てても、開いている数は同じ 1 に見える。
    **立てた回数そのもの**を数える。

    読みと書きを別々に数えるのは、`--apply` なしの朝に見たいのが
    「1バイトも触っていない」ではなく**「読んだが書いていない」**だから。
    """

    def __init__(self):
        self.issues: list = []
        self.run_gets = 0   # run の一覧を引いた回数
        self.step_gets = 0  # step を引いた回数（赤い朝だけ通るはず）
        self.gets = 0       # issue を引いた回数
        self.created = 0    # POST（立てた回数）
        self.patched = 0    # PATCH（書き換えた回数）
        self._next = 1
        self._runs: list = []
        self._steps: list = []

    def set(self, runs, steps=None):
        self._runs = list(runs or [])
        self._steps = list(steps or [])

    # ---- bake_down が使う5つ

    def runs(self, workflow_file: str) -> list:
        self.run_gets += 1
        # **ファイル名が違えば空。** 本物も、無いファイルには run を返さない
        if workflow_file != "rebake.yml":
            return []
        return [dict(r) for r in self._runs]

    def steps_of(self, run_id: int) -> list:
        self.step_gets += 1
        return [dict(s) for s in self._steps]

    def list_issues(self, label: str) -> list:
        self.gets += 1
        return [dict(i) for i in self.issues if label in i["labels"]]

    def create(self, title: str, text: str, label: str) -> dict:
        self.created += 1
        i = {"number": self._next, "title": title, "body": text,
             "state": "open", "labels": [label]}
        self._next += 1
        self.issues.append(i)
        return dict(i)

    def patch(self, number: int, payload: dict) -> dict:
        self.patched += 1
        for i in self.issues:
            if i["number"] == number:
                if "body" in payload:
                    i["body"] = payload["body"]
                if "state" in payload:
                    i["state"] = payload["state"]
                return dict(i)
        raise KeyError(number)

    # ---- 数えるための覗き口

    def opened(self) -> list:
        return [i for i in self.issues if i["state"] == "open"]

    def mine(self) -> list:
        """この仕組みが立てた issue（見えない印を持つもの）。"""
        return [i for i in self.issues
                if bake_down.MARK in (i.get("body") or "")]

    def wrote(self) -> int:
        return self.created + self.patched


class Gh403:
    """**読みにいくと 403 を返す**偽の GitHub。

    資格が切れた・`actions: read` や `issues: write` の権限が外れた・
    リポジトリの指定が違う、の形。書く側は呼ばれたら例外にする。
    **読めていないのに書きにいったら異常。**
    """

    def __init__(self):
        self.run_gets = 0

    def runs(self, workflow_file: str) -> list:
        self.run_gets += 1
        raise urllib.error.HTTPError(
            "https://api.github.com/repos/…/actions/workflows/…/runs",
            403, "Forbidden", {}, None)

    def steps_of(self, *a, **k):
        raise AssertionError("読めていないのに step を取りにいった")

    def list_issues(self, *a, **k):
        raise AssertionError("run が読めていないのに issue を読みにいった")

    def create(self, *a, **k):
        raise AssertionError("読めていないのに書きにいった")

    def patch(self, *a, **k):
        raise AssertionError("読めていないのに書きにいった")


# 偽の資格。**ログに出ない形のものを置く**（出たら最後の数えで拾われる）
FAKE_REPO = "example-owner/example-repo"
FAKE_TOKEN = "fake-token-for-selftest"


# ---------------------------------------------------------------- 回す

def morning(gh: FakeGh, runs, steps=None, apply: bool = True):
    """1朝ぶん回す（run を読む → 見立てる → issue を合わせる）。**本番と同じ道。**"""
    gh.set(runs, steps)
    a = bake_down.read_state(gh)
    return bake_down.run(gh, a, apply=apply), a


def act(gh, runs=None, steps=None, apply: bool = False):
    """`bake_down.act()` を、偽の GitHub と偽の資格で回して終了コードを取る。

    `act` は資格を環境変数から読んで `Gh` を作るので、**その `Gh` ごと差し替える。**
    本番の形（資格を見る → run を読む → issue を読む → 必要なら書く）をそのまま通す。
    """
    if isinstance(gh, FakeGh):
        gh.set(runs, steps)
    real = bake_down.Gh
    bake_down.Gh = lambda repo, token: gh
    os.environ["GITHUB_REPOSITORY"] = FAKE_REPO
    os.environ["GITHUB_TOKEN"] = FAKE_TOKEN
    try:
        return bake_down.act(apply=apply)
    finally:
        bake_down.Gh = real
        os.environ.pop("GITHUB_REPOSITORY", None)
        os.environ.pop("GITHUB_TOKEN", None)


def said_while(fn):
    """`fn()` を回しているあいだに出た字だけを切り出す。

    袋（`BUF`）は最初から溜まり続けているので、**前後の長さの差**を取る。
    """
    mark = len(BUF.getvalue())
    got = fn()
    return got, BUF.getvalue()[mark:]


# ---------------------------------------------------------------- 確かめる

FAILED: list = []


def ck(name: str, cond: bool, got) -> None:
    mark = "○" if cond else "✕"
    print(f"    {mark} {name}: {got}")
    if not cond:
        FAILED.append(name)


def case1_broken():
    print("\n[1] 焼くのが落ちた朝 → issue を立てる")
    gh = FakeGh()

    r, _ = morning(gh, GREEN)
    ck("通っている朝にしたこと", r["action"] == "noop", r["action"])
    ck("立てた回数", gh.created == 0, gh.created)
    ck("通っている朝は step を取りにいかない", gh.step_gets == 0, gh.step_gets)

    r, a = morning(gh, BROKEN, STEPS_BROKEN)
    ck("見立て", (a["down"], a["why"]) == (True, "broken"), (a["down"], a["why"]))
    ck("落ちた step を拾えた", a["step"] == "焼く", a["step"])
    ck("したこと", r["action"] == "create", r["action"])
    ck("立てた回数", gh.created == 1, gh.created)
    ck("開いている issue の本数", len(gh.opened()) == 1, len(gh.opened()))

    b = gh.issues[0]["body"]
    ck("本文に「きのうのまま」が入っている", "きのうのまま" in b, "入っている")
    ck("本文に落ちた step の名前が出る", "**焼く**" in b, "出る")
    ck("本文に、次にどう押すかが入っている", "dry_run" in b, "入っている")
    ck("本文に見えない印が入っている", bake_down.MARK in b, "入っている")
    ck("タイトルは作るときだけ", gh.issues[0]["title"] == bake_down.TITLE, "そのまま")
    ck("本文に日付も run の番号も入れていない",
       "2026-09" not in b and "#" not in b.replace(bake_down.MARK, ""), "入れていない")
    return gh


def case2_frozen():
    print("\n[2] 凍っていた朝 → issue を立てる（本文が [1] と違う）")
    gh = FakeGh()

    r, a = morning(gh, FROZEN, STEPS_FROZEN)
    ck("見立て", (a["down"], a["why"]) == (True, "frozen"), (a["down"], a["why"]))
    ck("乗った step", a["step"] == bake_down.FROZEN_STEP, a["step"])
    ck("したこと", r["action"] == "create", r["action"])
    ck("開いている issue の本数", len(gh.opened()) == 1, len(gh.opened()))

    frozen_body = gh.issues[0]["body"]
    broken_body = bake_down.body(
        {"down": True, "why": "broken", "step": "焼く", "at": STARTED})
    ck("本文が [1] と違う", frozen_body != broken_body, "違う")
    ck("凍りの本文に「凍っていないか」の表の場所が出る",
       "凍っていないか" in frozen_body, "出る")
    ck("凍りの本文に、まず疑うところが1つ出る",
       "python/data/*.json" in frozen_body, "出る")
    ck("落ちたほうの本文は、赤い step を開かせる",
       "赤い step" in broken_body, "出る")
    ck("凍りの本文には「赤い step を開け」と書かない",
       "赤い step" not in frozen_body, "書いていない")
    print(f"    （落ちた {len(broken_body)}文字 / 凍った {len(frozen_body)}文字）")
    return gh


def case2b_stale():
    """**古いのと落ちたのを、取り違えないか。**

    ここを分けなかったあいだ、焼き込みが1本古いだけで
    「焼くのが落ちた」の issue が立つ形だった。読んだ人は
    ワークフローを開きに行くが、そこには何も落ちていない。
    """
    print("\n[2b] 焼き込みが古い朝 → 「焼くのが落ちた」に寄せない")
    gh = FakeGh()

    r, a = morning(gh, FROZEN, STEPS_STALE)
    ck("見立て", (a["down"], a["why"]) == (True, "stale"), (a["down"], a["why"]))
    ck("乗った step", a["step"] == bake_down.STALE_STEP, a["step"])

    stale_body = gh.issues[0]["body"]
    broken_body = bake_down.body(
        {"down": True, "why": "broken", "step": "焼く", "at": STARTED})
    frozen_body = bake_down.body(
        {"down": True, "why": "frozen", "step": bake_down.FROZEN_STEP, "at": STARTED})
    ck("本文が「落ちた」と違う", stale_body != broken_body, "違う")
    ck("本文が「凍り」とも違う", stale_body != frozen_body, "違う")
    ck("**ワークフローは壊れていない、と書いてある**",
       "壊れていません" in stale_body, "書いてある")
    ck("新しくしかたの入口が出る", "/island-fresh" in stale_body, "出る")
    ck("古いほうの本文には「赤い step を開け」と書かない",
       "赤い step" not in stale_body, "書いていない")

    # **両方落ちた朝を、「焼くのが落ちた」に寄せない**（片側だけの対照にしない）
    both = bake_down.why_red(STEPS_FROZEN_AND_STALE)
    ck("凍りと古いが同じ朝に落ちても「落ちた」にしない",
       both["why"] != "broken", both["why"])
    ck("そのときは凍りを採る", both["why"] == "frozen", both["why"])
    print(f"    （落ちた {len(broken_body)}文字 / 凍った {len(frozen_body)}文字"
          f" / 古い {len(stale_body)}文字）")
    return gh


def case2c_watch():
    """**出したあとの見張りと、焼き直しの失敗を取り違えないか。**

    分けなかったあいだ、見張りが1本鳴るだけで
    「島の数字が焼き直せていません。島に出ている数はきのうのままです」の
    issue が立つ形だった。**数はちゃんと新しくなっているのに。**
    読んだ人は、落ちていない焼き直しを探しに行くことになる。
    """
    print("\n[2c] 出したあとの見張りが鳴った朝 → 「焼くのが落ちた」に寄せない")
    gh = FakeGh()

    r, a = morning(gh, FROZEN, STEPS_WATCH)
    ck("見立て", (a["down"], a["why"]) == (True, "watch"), (a["down"], a["why"]))
    ck("乗った step", a["step"] == "分かち合う絵を撮り直せたか", a["step"])

    watch_body = gh.issues[0]["body"]
    ck("**数は新しくなっている、と書いてある**",
       "新しくなっています" in watch_body, "書いてある")
    ck("**押し直さなくてよい、と書いてある**",
       "押し直す必要はありません" in watch_body, "書いてある")
    ck("鳴っている見張りの名前が出る",
       "分かち合う絵を撮り直せたか" in watch_body, "出る")
    ck("「きのうのまま」とは言わない", "きのうのまま" not in watch_body, "言わない")

    # **両方落ちた朝は、焼き直しのほうを採る。** ここを逆にすると、
    # 落ちた焼き直しが見出しから消える
    both = bake_down.why_red(STEPS_BROKEN_AND_WATCH)
    ck("焼き直しも落ちていたら「落ちた」を採る", both["why"] == "broken", both["why"])
    ck("乗るのは落ちた焼き直しのほう", both["step"] == "焼く", both["step"])
    return gh


def case3_close(gh):
    print("\n[3] また焼けたら → issue を閉じる")
    r, a = morning(gh, GREEN)
    ck("見立て", a["down"] is False, a["down"])
    ck("したこと", r["action"] == "close", r["action"])
    ck("閉じた issue の番号", r["number"] == 1, r["number"])
    ck("開いている issue の本数", len(gh.opened()) == 0, len(gh.opened()))
    ck("issue そのものは残っている（消していない）", len(gh.mine()) == 1, len(gh.mine()))
    return gh


def case4_same(gh):
    print("\n[4] 同じ状態が続いている → 1バイトも書かない")

    # (a) 止まったまま。**同じ日に2回走る形**（焼き直しと取り込みの両方に繋いである）
    gh2 = FakeGh()
    morning(gh2, BROKEN, STEPS_BROKEN)
    was = (gh2.created, gh2.patched)
    r, _ = morning(gh2, BROKEN, STEPS_BROKEN)
    ck("(a) 止まったままの2回目にしたこと", r["action"] == "noop", r["action"])
    ck("(a) 立てた回数（増えていない）", gh2.created == 1, gh2.created)
    ck("(a) 書き換えた回数（PATCH も打たない）", gh2.patched == 0, gh2.patched)
    r, _ = morning(gh2, BROKEN, STEPS_BROKEN)
    ck("(a) 3回目も何も書かない", (gh2.created, gh2.patched) == was,
       (gh2.created, gh2.patched))
    ck("(a) この仕組みが持つ issue の本数", len(gh2.mine()) == 1, len(gh2.mine()))

    # (b) 通ったまま。**閉じた issue を開け直さない**
    was = (gh.created, gh.patched)
    r, _ = morning(gh, GREEN)
    ck("(b) 通ったままの朝にしたこと", r["action"] == "noop", r["action"])
    morning(gh, LINKED)
    ck("(b) 2日置いても開いていない", len(gh.opened()) == 0, len(gh.opened()))
    ck("(b) 書いた回数（増えていない）", (gh.created, gh.patched) == was,
       (gh.created, gh.patched))
    return gh


def case5_switch():
    print("\n[5] 落ちた → 凍った に変わったら、同じ1本の本文だけ書き換わる")
    gh = FakeGh()
    morning(gh, BROKEN, STEPS_BROKEN)
    first = gh.issues[0]["body"]

    r, _ = morning(gh, FROZEN, STEPS_FROZEN)
    ck("したこと", r["action"] == "update", r["action"])
    ck("使った issue の番号（同じ1本）", r["number"] == 1, r["number"])
    ck("立てた回数（増えていない）", gh.created == 1, gh.created)
    ck("この仕組みが持つ issue の本数", len(gh.mine()) == 1, len(gh.mine()))
    ck("本文が入れ替わった", gh.issues[0]["body"] != first, "入れ替わった")
    ck("凍りの本文になっている", "凍っていないか" in gh.issues[0]["body"], "なっている")


def case6_unknown():
    """**分からない朝は、開きも閉じもしない。**

    ここがこの係にしかない転び方。`cancelled` や「無人の run が1本も無い」は
    「読めていない」であって「通った」ではない（`docs/island-standards.md` 10章）。
    **開いている issue を「直った」と言って閉じるのが、いちばん悪い。**
    """
    print("\n[6] 分からない朝は、開きも閉じもしない")

    for name, runs in (("run が1本も無い", []),
                       ("cancelled で終わった", CANCELLED)):
        a = bake_down.assess(bake_down.pick_run(runs), None)
        ck(f"{name} → 見立て", a["down"] is None, a["down"])

    # 開く側: 止まっていると言わない
    gh = FakeGh()
    morning(gh, [])
    morning(gh, CANCELLED)
    ck("どちらでも issue は立たない", gh.created == 0, gh.created)

    # 閉じる側: **開いている issue を閉じない**（こちらが本番）
    gh2 = FakeGh()
    morning(gh2, BROKEN, STEPS_BROKEN)
    r, _ = morning(gh2, CANCELLED)
    ck("開いているとき cancelled が来てもしたこと", r["action"] == "noop", r["action"])
    ck("issue は開いたまま", len(gh2.opened()) == 1, len(gh2.opened()))
    r, _ = morning(gh2, [])
    ck("run が1本も見えなくなっても開いたまま", len(gh2.opened()) == 1,
       len(gh2.opened()))


def case7_by_hand():
    """**手で押した run は数えない。**

    手押しの既定は `dry_run: true` で、**通っても1バイトも master に入らない。**
    それを緑として読むと、止まっているのに閉じる。
    赤いほうも、押した人がその場で見ているので issue にしない。
    """
    print("\n[7] 手で押した run は数えない")

    a = bake_down.assess(bake_down.pick_run(BY_HAND_RED), STEPS_BROKEN)
    ck("手で押した赤 → 見立て", a["down"] is None, a["down"])

    # 閉じる側: 止まっているあいだに手で押して通しても、閉じない
    gh = FakeGh()
    morning(gh, BROKEN, STEPS_BROKEN)
    r, _ = morning(gh, BY_HAND_OK)
    ck("手で押して通しただけでは閉じない", r["action"] == "noop", r["action"])
    ck("issue は開いたまま", len(gh.opened()) == 1, len(gh.opened()))

    # 次の朝、無人のぶんが通れば閉じる
    r, _ = morning(gh, BY_HAND_OK + GREEN)
    ck("無人のぶんが通れば閉じる", r["action"] == "close", r["action"])

    # 無人のものが混ざっていたら、手押しに埋もれず**無人のいちばん新しい1本**を取る
    got = bake_down.pick_run(GREEN + BY_HAND_RED + BROKEN)
    ck("手押しに埋もれずに無人のいちばん新しい1本を取る",
       got["id"] == BROKEN[0]["id"], got["run_number"])


def case7b_real():
    """**2026-09-16 の本番の並びで、狼少年にならないことを見る。**

    05:34（schedule）と 08:33（workflow_run）が赤で、08:37 に人が手で押して緑。
    無人のいちばん新しい1本は赤いが、**焼くのはもう直っている。**
    ここで issue を立てると、直した直後に「止まっています」と言うことになる。

    保留は**開きも閉じもしない**ので、既に開いている issue は残る。
    黙り続けることはない（次の無人の1回が赤ければ、その朝に開く）。
    """
    print("\n[7b] 赤いあとで手で押して通っていたら、その朝は保留する（本番の並び）")

    got = bake_down.pick_run(REAL)
    ck("無人のいちばん新しい1本", got["run_number"] == 32, got["run_number"])
    ck("そのあと手で押して通っている", bake_down.fixed_by_hand(REAL, got) is True,
       "通っている")

    gh = FakeGh()
    r, a = morning(gh, REAL, STEPS_BROKEN)
    ck("見立て", (a["down"], a["why"]) == (None, "byhand"), (a["down"], a["why"]))
    ck("したこと", r["action"] == "noop", r["action"])
    ck("issue は立たない", gh.created == 0, gh.created)
    ck("保留なので step も取りにいかない", gh.step_gets == 0, gh.step_gets)

    # **既に開いていたら、閉じない**（数字はまだ古いかもしれない）
    gh2 = FakeGh()
    morning(gh2, BROKEN, STEPS_BROKEN)
    r, _ = morning(gh2, REAL, STEPS_BROKEN)
    ck("開いている issue は閉じない", r["action"] == "noop", r["action"])
    ck("開いたまま", len(gh2.opened()) == 1, len(gh2.opened()))

    # **黙り続けない。** 次の無人の1回が赤ければ、その朝に開く
    gh3 = FakeGh()
    morning(gh3, REAL, STEPS_BROKEN)
    later = REAL + [row(34, "failure", event="schedule", at="2026-09-17T05:34:00Z")]
    r, _ = morning(gh3, later, STEPS_BROKEN)
    ck("次の無人の1回が赤ければ開く", r["action"] == "create", r["action"])

    # 手押しが**赤い**ぶんは保留にしない（直った証拠にならない）
    a = bake_down.assess(bake_down.pick_run(BROKEN + BY_HAND_RED), STEPS_BROKEN,
                         bake_down.fixed_by_hand(BROKEN + BY_HAND_RED,
                                                 bake_down.pick_run(BROKEN)))
    ck("手押しが赤いだけなら保留しない", a["down"] is True, a["down"])


def case8_renamed():
    print("\n[8] 人がタイトルを変えても、見えない印で同じ1本を使う")
    gh = FakeGh()
    morning(gh, BROKEN, STEPS_BROKEN)
    morning(gh, GREEN)          # いったん閉じる
    gh.issues[0]["title"] = "🥖 焼き直しが止まってる（あとで見る）"
    before = gh.issues[0]["number"]

    r, _ = morning(gh, FROZEN, STEPS_FROZEN)
    ck("したこと", r["action"] == "reopen", r["action"])
    ck("使った issue の番号（同じ1本）", r["number"] == before, r["number"])
    ck("立てた回数（増えていない）", gh.created == 1, gh.created)
    ck("この仕組みが持つ issue の本数", len(gh.mine()) == 1, len(gh.mine()))
    ck("開き直っている", len(gh.opened()) == 1, len(gh.opened()))
    ck("タイトルは人が付けたまま（戻していない）",
       gh.issues[0]["title"] == "🥖 焼き直しが止まってる（あとで見る）", "そのまま")


def case_pr():
    print("\n[8b] pull request が混ざっても拾わない")
    gh = FakeGh()
    # `/issues` は pull request も返す。見えない印を持つ PR を混ぜておく。
    # 拾ってしまうと、PR の本文を毎朝書き換えにいくことになる
    gh.issues.append({
        "number": 99, "title": "止まっているを映す仕組み", "state": "open",
        "labels": [bake_down.LABEL],
        "body": "この PR で " + bake_down.MARK + " を入れます",
        "pull_request": {"url": "…"},
    })
    r, _ = morning(gh, BROKEN, STEPS_BROKEN)
    ck("PR は使わず、新しく1本立てた", r["action"] == "create", r["action"])
    ck("使った番号が PR ではない", r["number"] != 99, r["number"])


def case9_read_not_write():
    print("\n[9] --apply なしでも GitHub を読む（が、1バイトも書かない）")

    # (a) 止まっているのに issue が無い朝。**立てるつもりだが、立てない**
    gh = FakeGh()
    (r, _), said = said_while(
        lambda: morning(gh, BROKEN, STEPS_BROKEN, apply=False))
    ck("run を引いた回数", gh.run_gets == 1, gh.run_gets)
    ck("step を引いた回数（赤いので取りにいく）", gh.step_gets == 1, gh.step_gets)
    ck("issue を引いた回数（GET）", gh.gets == 1, gh.gets)
    ck("書いた回数（POST + PATCH）", gh.wrote() == 0, gh.wrote())
    ck("issue は1本も増えていない", len(gh.issues) == 0, len(gh.issues))
    ck("したこと", r["action"] == "dry", r["action"])
    ck("するつもりだったこと", r.get("planned") == "create", r.get("planned"))
    ck("「読めた」がログに残る", "読めました" in said, "残る")
    ck("これから何をするかがログに出る", "issue を1本 開きます" in said, "出る")

    # (b) 開いている issue があって、また焼けた朝。**閉じるつもりだが、閉じない**
    gh2 = FakeGh()
    morning(gh2, BROKEN, STEPS_BROKEN)
    was = (gh2.created, gh2.patched)
    (r, _), said = said_while(lambda: morning(gh2, GREEN, apply=False))
    ck("するつもりだったこと", r.get("planned") == "close", r.get("planned"))
    ck("使う issue の番号まで分かる", r["number"] == 1, r["number"])
    ck("書いた回数は増えていない", (gh2.created, gh2.patched) == was,
       (gh2.created, gh2.patched))
    ck("issue は開いたまま（閉じていない）", len(gh2.opened()) == 1, len(gh2.opened()))
    ck("いまの issue の状態がログに出る", "開いています" in said, "出る")


def case10_broken_copy():
    """**歯止めを1つずつ外して、そのとき確かに落ちることを見せる。**

    落ちない確かめは何も見ていない。1・2・7・8 の ○ が「歯止めが効いている証拠」に
    なるのは、外したときに ✕ になるから（`docs/island-misses.md` #99）。
    """
    print("\n[10] 歯止めを1つずつ外すと落ちる")

    # (a) 乗っている step の名前を、実在しないものに変える。
    #     → 凍った朝が「焼くのが落ちた」として出る（赤くならないので気づけない）
    real = bake_down.FROZEN_STEP
    bake_down.FROZEN_STEP = "この名前の step は rebake.yml に無い"
    try:
        a = bake_down.assess(bake_down.pick_run(FROZEN), STEPS_FROZEN)
    finally:
        bake_down.FROZEN_STEP = real
    ck("(a) step の名前を外すと、凍りが「焼くのが落ちた」になる",
       a["why"] == "broken", a["why"])

    # (b) 見張る相手のファイル名を変える → run が1本も見えなくなる
    real_file = bake_down.WORKFLOW_FILE
    bake_down.WORKFLOW_FILE = "no_such_workflow.yml"
    gh = FakeGh()
    try:
        r, a = morning(gh, BROKEN, STEPS_BROKEN)
    finally:
        bake_down.WORKFLOW_FILE = real_file
    ck("(b) ファイル名を変えると、止まっている朝に何も立たない",
       (a["down"], gh.created) == (None, 0), (a["down"], gh.created))

    # (c) 「分からない」を「通っている」に倒す → 開いている issue を閉じてしまう
    gh2 = FakeGh()
    morning(gh2, BROKEN, STEPS_BROKEN)
    real_decide = bake_down.decide
    bake_down.decide = lambda issue, want, down: real_decide(issue, want, bool(down))
    try:
        r, _ = morning(gh2, CANCELLED)
    finally:
        bake_down.decide = real_decide
    ck("(c) 分からないを通ったに倒すと、直っていない issue が閉じる",
       r["action"] == "close", r["action"])

    # (d) 同じ1本の見つけ方を、タイトル一致に戻す（人が変えたら見失う）
    gh3 = FakeGh()
    morning(gh3, BROKEN, STEPS_BROKEN)
    gh3.issues[0]["title"] = "🥖 焼き直しが止まってる（あとで見る）"
    real_find = bake_down.find_issue

    def by_title(issues, mark=bake_down.MARK):
        for i in issues:
            if i.get("title") == bake_down.TITLE:
                return i
        return None

    bake_down.find_issue = by_title
    try:
        morning(gh3, FROZEN, STEPS_FROZEN)
    finally:
        bake_down.find_issue = real_find
    ck("(d) タイトルで探すと issue が2本に増える", len(gh3.mine()) == 2, len(gh3.mine()))

    # (e) 手押しの緑を見なくする → 直した直後の朝に issue が立つ（狼少年）
    real_hand = bake_down.fixed_by_hand
    bake_down.fixed_by_hand = lambda runs, run: False
    gh5 = FakeGh()
    try:
        morning(gh5, REAL, STEPS_BROKEN)
    finally:
        bake_down.fixed_by_hand = real_hand
    ck("(e) 手押しの緑を見ないと、直した直後の朝に issue が立つ",
       gh5.created == 1, gh5.created)

    # 戻したら元どおり（差し替えが残っていないことの確認）
    gh4 = FakeGh()
    morning(gh4, FROZEN, STEPS_FROZEN)
    gh4.issues[0]["title"] = "🥖 焼き直しが止まってる（あとで見る）"
    morning(gh4, BROKEN, STEPS_BROKEN)
    ck("戻したら1本のまま", len(gh4.mine()) == 1, len(gh4.mine()))
    ck("戻したら凍りを凍りと見る",
       bake_down.assess(bake_down.pick_run(FROZEN), STEPS_FROZEN)["why"] == "frozen",
       "見る")
    r, _ = morning(gh4, CANCELLED)
    ck("戻したら cancelled で閉じない", r["action"] == "noop", r["action"])


def case11_forbidden():
    """**読めなかったら赤くして止まる。**

    `--apply` が無くても GitHub を読むようにしたので、届かないことが毎朝分かる。
    分かったら 1 で落とす。*止まっている*は赤くしないが、*届かない*は赤くする。
    """
    print("\n[11] 読めなかったら（403）、終了コード 1 で落ちる")

    gh = Gh403()
    code = None
    try:
        bake_down.read_state(gh)
    except urllib.error.HTTPError as e:
        code = e.code
    ck("run を読みにいく", gh.run_gets == 1, gh.run_gets)
    ck("握りつぶさずに投げ返す", code == 403, code)

    got, said = said_while(lambda: act(Gh403(), apply=False))
    ck("終了コード", got == 1, got)
    ck("HTTP の番号がログに出る", "403" in said, "出る")
    ck("どこを見ればいいかがログに出る", "権限" in said, "出る")

    got, _ = said_while(lambda: act(Gh403(), apply=True))
    ck("--apply でも終了コードは 1", got == 1, got)


def case12_empty():
    """**0件が返ってくる朝**（ラベルがまだ無い＝いまの本番の状態）。"""
    print("\n[12] 0件が返ってきても落ちない（ラベルがまだ無い朝）")
    gh = FakeGh()
    got, said = said_while(lambda: act(gh, GREEN, apply=False))
    ck("終了コード", got == 0, got)
    ck("run を引いた回数", gh.run_gets == 1, gh.run_gets)
    ck("issue を引いた回数（GET）", gh.gets == 1, gh.gets)
    ck("書いた回数（POST + PATCH）", gh.wrote() == 0, gh.wrote())
    ck("「読めた」がログに残る", "0件" in said and "読めました" in said, "残る")
    ck("issue がまだ無いことが出る", "まだ1本もありません" in said, "出る")
    ck("これから何もしないと出る", "何もしません" in said, "出る")

    # 無人の run が1本も無い朝は、**黙るが、黙ったことはログに出す**
    gh2 = FakeGh()
    got, said = said_while(lambda: act(gh2, BY_HAND_OK, apply=True))
    ck("無人の run が無くても終了コードは 0", got == 0, got)
    ck("黙ったことがログに出る", "1本もありません" in said, "出る")
    ck("何も書いていない", gh2.wrote() == 0, gh2.wrote())

    # **何日も走っていない朝は、issue にはしないがログに1行出す**
    gh3 = FakeGh()
    old = [row(8, "success", at="2026-09-01T05:34:00Z")]
    got, said = said_while(lambda: act(gh3, old, apply=True))
    ck("何日も走っていないことがログに出る", "走っていません" in said, "出る")
    ck("それで issue は立てない", gh3.created == 0, gh3.created)


def case13_yaml():
    """**ワークフローの YAML と突き合わせる。**

    偽の GitHub を何通り回しても、それは全部「Python の中」で、
    **ワークフローの YAML を1行も読んでいない。** #105 で外したのが
    まさにそれ（確かめた面がどれも同じ側だった）ので、ここで別の面を踏む。

    見るのは3つ。どれも**壊れても赤くならない**もの:

    1. 見張る相手（`rebake.yml`）が実在するか
    2. 乗っている step（「凍っていたら赤くする」）が、その中に実在するか
    3. この係の `workflow_run` の繋ぎ先が、実在するワークフローの `name:` か
    """
    print("\n[13] ワークフローの YAML と突き合わせる")
    import yaml

    names = {}   # ファイル名 -> name:
    docs = {}
    for f in sorted(os.listdir(FLOW)):
        if not f.endswith((".yml", ".yaml")):
            continue
        with open(os.path.join(FLOW, f), encoding="utf-8") as fh:
            d = yaml.safe_load(fh) or {}
        docs[f] = d
        if isinstance(d, dict) and d.get("name"):
            names[f] = d["name"]
    print(f"    （`.github/workflows/` の {len(docs)}本を読んで、"
          f"うち {len(names)}本に name: があった）")

    # 1. 見張る相手が実在するか
    ck("見張る相手が実在する", bake_down.WORKFLOW_FILE in docs,
       bake_down.WORKFLOW_FILE)

    # 2. 乗っている step が、その中に実在するか
    steps = []
    for job in (docs.get(bake_down.WORKFLOW_FILE, {}).get("jobs") or {}).values():
        steps += [s.get("name") for s in (job.get("steps") or [])]
    ck(f"乗っている step が実在する（{len(steps)}個 見た）",
       bake_down.FROZEN_STEP in steps, bake_down.FROZEN_STEP)

    # **見張りの名前も、全部実在するか。** 実在しない名前はここに書いてあっても
    # 一生当たらず、黙って「焼くのが落ちた」に戻る。**赤くならずに戻る**ので、
    # 名前を1つずつ見る
    missing = [n for n in bake_down.WATCH_STEPS if n not in steps]
    ck(f"出したあとの見張りが全部実在する（{len(bake_down.WATCH_STEPS)}本）",
       not missing, missing or "ぜんぶ在る")

    # 3. この係の繋ぎ先が、実在するワークフローの name: か。
    #    **PyYAML は `on:` を真偽値の True として読む**（YAML 1.1）ので、両方引く
    me = docs.get(SELF_YML) or {}
    trig = me.get("on") if isinstance(me.get("on"), dict) else me.get(True) or {}
    linked = (trig.get("workflow_run") or {}).get("workflows") or []
    ck("繋ぎ先が空ではない", len(linked) > 0, linked)
    for want in linked:
        ck(f"繋ぎ先の name: が実在する — {want}", want in names.values(),
           [f for f, n in names.items() if n == want] or "見つからない")

    # 繋ぎ先に、見張る相手そのものが入っているか
    ck("見張る相手の name: に繋いである",
       names.get(bake_down.WORKFLOW_FILE) in linked,
       names.get(bake_down.WORKFLOW_FILE))

    # 保険の cron が置いてあるか（`CLAUDE.md`「cron は保険として残す」）
    ck("保険の cron が置いてある", bool(trig.get("schedule")), trig.get("schedule"))

    # この係が要る権限（run を読む・issue を書く）が宣言されているか。
    # 足りないと**本当に要る朝に 403 で落ちる**
    perm = me.get("permissions") or {}
    ck("run を読む権限が宣言されている", perm.get("actions") == "read",
       perm.get("actions"))
    ck("issue を書く権限が宣言されている", perm.get("issues") == "write",
       perm.get("issues"))


def case_grep():
    """**出た字を探す。** 袋を読むので、ほかの確かめのあとに回す。

    見るのは2つ。**issue の本文**（公開）と、**ログ**（Actions は公開）。
    """
    print("\n[素性] 本文にもログにも、名前・どねID・チャンネルID・メールが出ない")

    # **先に、探し方が当たることを見る。** 正規表現が壊れていれば、
    # 何が出ていても「0件」と言える。0 を信じる前に、仕込んだ字で当てる
    bait = f"{CID} / {HANDLE} / {PK} / someone@example.com"
    got = logident.count(bait)
    ck("探し方が当たる — チャンネルID", got["channel_id"] > 0, got["channel_id"])
    ck("探し方が当たる — ハンドル", got["handle"] > 0, got["handle"])
    ck("探し方が当たる — どねID", got["doneru_id"] > 0, got["doneru_id"])
    ck("探し方が当たる — メール", got["email"] > 0, got["email"])

    # issue の本文。**公開の場に残るのはこちらが先**
    gh = FakeGh()
    morning(gh, BROKEN, STEPS_BROKEN)
    morning(gh, FROZEN, STEPS_FROZEN)
    text = "\n".join(i["body"] for i in gh.issues)
    n = logident.count(text)
    for k in logident.KINDS:
        ck(f"本文に出た数 — {k}", n[k] == 0, n[k])
    print(f"    （見た本文は {len(text)} 文字）")

    # ログ。ここまでの出力を丸ごと見る
    log = BUF.getvalue().split("[素性の結果]")[0]
    n = logident.count(log)
    for k in logident.KINDS:
        ck(f"ログに出た数 — {k}", n[k] == 0, n[k])
    print(f"    （見たログは {len(log)} 文字）")

    # **0 を「何も出していない」で作っていないこと**も見る。
    # 偽の run には最初から人の跡が混ぜてあるので、丸ごと流す1行が生えれば上が落ちる
    ck("run には人の跡が混ぜてある（0 が素通りではない）",
       sum(logident.count(str(BROKEN[0])).values()) > 0,
       sum(logident.count(str(BROKEN[0])).values()))


def main() -> int:
    # **毎朝これが走るのは Actions の中。** 公開のログに積まれるのはそのときの
    # 字なので、同じ条件で回して、その出力を最後に数える
    os.environ["GITHUB_ACTIONS"] = "true"
    print("=== 偽の GitHub で、焼き直しが止まっているの映し方を動かす ===")
    print("（GitHub には1バイトも出ません）")
    gh = case1_broken()
    gh2 = case2_frozen()
    case2b_stale()
    case2c_watch()
    gh2 = case3_close(gh2)
    case4_same(gh2)
    case5_switch()
    case6_unknown()
    case7_by_hand()
    case7b_real()
    case8_renamed()
    case_pr()
    case9_read_not_write()
    case10_broken_copy()
    case11_forbidden()
    case12_empty()
    case13_yaml()
    print("\n[素性の結果]")
    case_grep()

    sys.stdout, sys.stderr = REAL_OUT, REAL_ERR
    print()
    if FAILED:
        print(f"✕ 通らなかった確かめ {len(FAILED)} 件: {', '.join(FAILED)}")
        return 1
    print("○ ぜんぶ通りました")
    return 0


if __name__ == "__main__":
    sys.exit(main())
