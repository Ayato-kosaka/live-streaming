"""偽の GitHub で、**配りが赤いことの映し方を実際に動かして確かめる。**

    python python/ship_down_selftest.py

**本番には1バイトも出ない。** GitHub に届かないし、資格情報もネットワークも
要らない（`ship_down.py` が外に出る口は `Gh` の5つだけなので、そこを偽物に
差し替える）。

確かめるのは12:

  1. **もう出ているのに赤い**回に issue が1本開く（本文の**1行目が「出ている」**）
  2. **出る前に止まった**回にも開く。**1行目が 1 と違う**（本番は無事なので）
  3. **配る step そのもの**が落ちた回は「出ていない」側（ひとつ前のまま）
  4. **また配れたら**、その issue が**閉じる**
  5. **同じ状態が続いている**あいだは **1バイトも書かない**
  6. **分からない回は、開きも閉じもしない**（`cancelled` ／ 無人の run が無い）
  7. **手で押した run は数えない**（検品の赤で開かない・検品の緑で閉じない）
 7b. ただし**赤いあとで手で押して通っていたら保留する**
  8. 人が手で**タイトルを変えた** issue でも、見えない印で同じ1本を使う
  9. `--apply` を付けなければ、**GET は通り、POST と PATCH は 0回**
 10. **歯止めを6つ、1つずつ外すと落ちる**
 11. **読めなかったら（403）赤くして止まる**／**繋ぎ先の名前が消えても止まる**
 12. **ワークフローの YAML と突き合わせる**（繋ぎ先の名前・配る step・見る step）

そのあとに、**本文にもログにも視聴者さんの素性が1文字も出ない**ことを数える。

## この係にしかない転び方が「出ているのに、出ていないと言う」

`bake_down.py` は「止まっているか」の1軸だが、こちらは2軸ある。
**「赤い」だけでは、本番を見に行くべきかどうかが決まらない。**

分け目は `action-hosting-deploy` の step で、**名前の表では決めない。**
本番の run #63 と #114 が、**同じ `🔐 Firestore ルールのデプロイ` /
`🔎 Firestore インデックスのデプロイ` で落ちていて、意味が逆**だった
（前者は配る step の前に置いてあったので skip ＝出ていない。後者は配ったあと）。
だからこの確かめの 1・2・3 は、**本番のその2本の並びをそのまま置いてある。**

## 10 がなぜ要るか

落ちない確かめは何も見ていない。1〜9 の ○ が「歯止めが効いている証拠」に
なるのは、**外したときに ✕ になるから**（`docs/island-misses.md` #99）。
外す歯止めは6つ——赤を見ない／無人かどうかを見ない／配る step を見分けない／
分からないを通ったに倒す／手押しの緑を見ない／繋ぎ先の名前を見ない。

## 12 がなぜ要るか（#105 と同じ轍）

偽の GitHub を何通り回しても、**それは全部「Python の中」**で、
ワークフローの YAML を1行も読んでいない。

`CLAUDE.md` にこう書いてある——**繋ぎはワークフローの `name:` で解決される。
あちらの名前を変えると黙って切れる。赤くならない。走らなくなるだけ。**
同じことが、**配る step の目印**（`action-hosting-deploy`）にも起きる。
外れると、出ているのに「出ていません」と言う issue が立つ。**赤くならないし、
issue も立つので、誰も気づかない。**
"""

import importlib.util
import io
import os
import sys
import urllib.error

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# 実際の出力を溜める袋。**ship_down（＝basicConfig）を読み込む前に**差し替える
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

import ship_down  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FLOW = os.path.join(ROOT, ".github", "workflows")

# この係のワークフロー。12 で、中の繋ぎ先を読む
SELF_YML = "ship_down.yml"


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
CID = "UCzzFAKE0000000000000003"
HANDLE = "@ふしぎな-fake3"
PK = "1000000003"

# run に**わざと混ぜる**人の跡。GitHub は `actor` も `head_commit.author` も
# 必ず付けてくるので、**これは仮定ではなく本番にあるもの。**
# run を丸ごとログへ流す1行が生えた日に、最後の数えで落ちる
DIRT = {
    "display_title": f"{CID} / {HANDLE} / {PK}",
    "head_commit": {"author": {"name": HANDLE, "email": "someone@example.com"}},
}

STARTED = "2026-09-19T03:28:37Z"


def row(n: int, conclusion: str, who: str = ship_down.BOT,
        at: str = STARTED) -> dict:
    """run を1本こしらえる。**形は Actions の口が返すものと同じ。**

    配りには `workflow_dispatch` しか無い。**毎晩のぶんもそこを通る**ので、
    分かれ目は `triggering_actor`（実測どおり）。
    """
    return {
        "id": 9000 + n,
        "run_number": n,
        "event": "workflow_dispatch",
        "status": "completed",
        "conclusion": conclusion,
        "run_started_at": at,
        "created_at": at,
        "actor": {"login": who, "email": "someone@example.com"},
        "triggering_actor": {"login": who},
        **DIRT,
    }


# 人が検品で押したぶん。**押した人がその場で見ているので、混ぜない**
HUMAN = "some-person"

# ---- step の並び。**本番の run をそのまま置いてある**

# **配ったあとで落ちた回（本番 run #114 / 2026-09-09）。**
# 索引のデプロイが赤い＝**もう出ている**
STEPS_AFTER = [
    {"name": "Set up job", "number": 1, "conclusion": "success"},
    {"name": "Run actions/checkout@v5", "number": 2, "conclusion": "success"},
    {"name": "🏗️ `.env` ファイルの作成", "number": 3, "conclusion": "success"},
    {"name": "Run npm ci && npm run build:web", "number": 4, "conclusion": "success"},
    {"name": "Run FirebaseExtended/action-hosting-deploy@v0", "number": 5,
     "conclusion": "success"},
    {"name": "🔐 Firestore ルールのデプロイ", "number": 6, "conclusion": "success"},
    {"name": "🔐 Storage ルールのデプロイ", "number": 7, "conclusion": "success"},
    {"name": "🔎 Firestore インデックスのデプロイ", "number": 8,
     "conclusion": "failure"},
]

# **配る前に止まった回（本番 run #63 / 2026-09-04）。**
# 当時はルールのデプロイが配る step の**前**にあって、配るほうが skip された。
# **同じ step 名なのに、上とは意味が逆**——名前の表で決めてはいけない証拠
STEPS_BEFORE = [
    {"name": "Set up job", "number": 1, "conclusion": "success"},
    {"name": "Run actions/checkout@v5", "number": 2, "conclusion": "success"},
    {"name": "🏗️ `.env` ファイルの作成", "number": 3, "conclusion": "success"},
    {"name": "Run npm ci && npm run build:web", "number": 4, "conclusion": "success"},
    {"name": "🔐 Firestore ルールのデプロイ", "number": 5, "conclusion": "failure"},
    {"name": "Run FirebaseExtended/action-hosting-deploy@v0", "number": 6,
     "conclusion": "skipped"},
]

# **配る step そのものが落ちた回。** 島はひとつ前のまま
STEPS_DEPLOY = [
    {"name": "Run npm ci && npm run build:web", "number": 4, "conclusion": "success"},
    {"name": "配るものが、ぜんぶ書き出せているか", "number": 5, "conclusion": "success"},
    {"name": "Run FirebaseExtended/action-hosting-deploy@v0", "number": 6,
     "conclusion": "failure"},
    {"name": "🔐 Firestore ルールのデプロイ", "number": 7, "conclusion": "skipped"},
    {"name": "配った面が、面として配られているか", "number": 11, "conclusion": "skipped"},
]

# **書き出しが落ちた回。** これも出ていない側
STEPS_BUILD = [
    {"name": "Run npm ci && npm run build:web", "number": 4, "conclusion": "failure"},
    {"name": "Run FirebaseExtended/action-hosting-deploy@v0", "number": 6,
     "conclusion": "skipped"},
    # 後ろの2本は `if: !cancelled()` なので走り続ける。**ここが赤くても、
    # 出たのはひとつ前のもの。** いちばん早い赤を採らないと嘘になる
    {"name": "無い道が、ちゃんと 404 で返っているか", "number": 10,
     "conclusion": "success"},
    {"name": "配った面が、面として配られているか", "number": 11,
     "conclusion": "failure"},
]

# **配ったあと、面のひと回りが赤くなった回。** いちばん怖い形——
# 本番はもう出ていて、出したものが壊れている
STEPS_SWEEP = [
    {"name": "Run npm ci && npm run build:web", "number": 4, "conclusion": "success"},
    {"name": "Run FirebaseExtended/action-hosting-deploy@v0", "number": 6,
     "conclusion": "success"},
    {"name": "🔎 Firestore インデックスのデプロイ", "number": 9, "conclusion": "success"},
    {"name": "配った面が、面として配られているか", "number": 11, "conclusion": "failure"},
]

# **配る step が1つも見当たらない回。** 目印を書き換えられた形
STEPS_NO_PIVOT = [
    {"name": "Run npm ci && npm run build:web", "number": 4, "conclusion": "success"},
    {"name": "配った面が、面として配られているか", "number": 11, "conclusion": "failure"},
]

GREEN = [row(1, "success")]
AFTER = [row(2, "failure")]
BEFORE = [row(3, "failure")]
DEPLOY = [row(4, "failure")]
SWEEP = [row(5, "failure")]
CANCELLED = [row(6, "cancelled")]
BY_HAND_RED = [row(7, "failure", who=HUMAN)]
BY_HAND_OK = [row(8, "success", who=HUMAN)]

# **検品で押したあとに、毎晩のぶんが赤い並び。** 手押しの緑を先に見て
# 「通っている」と読むと、いちばん要る回に黙る
HAND_THEN_NIGHT = [row(20, "failure"), row(19, "success", who=HUMAN)]

# **赤いあとで人が押し直して通した並び。** 保留する
NIGHT_THEN_HAND = [row(22, "success", who=HUMAN), row(21, "failure")]


# ---------------------------------------------------------------- 偽の口

class FakeGh:
    """偽の GitHub。**口ごとに叩いた回数と、issue の本数を数える。**

    「増えていないか」は結果（開いている issue の数）だけでは言えない。
    1本消してもう1本立てても、開いている数は同じ 1 に見える。
    **立てた回数そのもの**を数える。
    """

    def __init__(self):
        self.issues: list = []
        self.run_gets = 0
        self.step_gets = 0
        self.gets = 0
        self.created = 0
        self.patched = 0
        self._next = 1
        self._runs: list = []
        self._steps: list = []

    def set(self, runs, steps=None):
        self._runs = list(runs or [])
        self._steps = list(steps or [])

    # ---- ship_down が使う5つ

    def runs(self, workflow_file: str) -> list:
        self.run_gets += 1
        # **ファイル名が違えば空。** 本物も、無いファイルには run を返さない
        if workflow_file != "firebase-hosting-deploy-prod.yml":
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
        return [i for i in self.issues
                if ship_down.MARK in (i.get("body") or "")]


class Gh403:
    """**読みにいくと 403 を返す**偽の GitHub。

    資格が切れた・`actions: read` や `issues: write` の権限が外れた・
    リポジトリの指定が違う、の形。**読めていないのに書きにいったら異常。**
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

def once(gh: FakeGh, runs, steps=None, apply: bool = True):
    """1回ぶん回す（run を読む → 見立てる → issue を合わせる）。**本番と同じ道。**"""
    gh.set(runs, steps)
    a = ship_down.read_state(gh)
    return ship_down.run(gh, a, apply=apply), a


def act(gh, runs=None, steps=None, apply: bool = False, flow_dir=None):
    """`ship_down.act()` を、偽の GitHub と偽の資格で回して終了コードを取る。

    `act` は資格を環境変数から読んで `Gh` を作るので、**その `Gh` ごと差し替える。**
    """
    if isinstance(gh, FakeGh):
        gh.set(runs, steps)
    real = ship_down.Gh
    ship_down.Gh = lambda repo, token: gh
    os.environ["GITHUB_REPOSITORY"] = FAKE_REPO
    os.environ["GITHUB_TOKEN"] = FAKE_TOKEN
    try:
        return ship_down.act(apply=apply, flow_dir=flow_dir or FLOW)
    finally:
        ship_down.Gh = real
        os.environ.pop("GITHUB_REPOSITORY", None)
        os.environ.pop("GITHUB_TOKEN", None)


def said_while(fn):
    """`fn()` を回しているあいだに出た字だけを切り出す。"""
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


def case1_after():
    print("\n[1] 配ったあとで赤くなった回 → 「もう出ています」で issue を立てる")
    gh = FakeGh()

    r, _ = once(gh, GREEN)
    ck("通っている回にしたこと", r["action"] == "noop", r["action"])
    ck("立てた回数", gh.created == 0, gh.created)
    ck("通っている回は step を取りにいかない", gh.step_gets == 0, gh.step_gets)

    r, a = once(gh, AFTER, STEPS_AFTER)
    ck("見立て", (a["down"], a["out"], a["what"]) == (True, True, "rules"),
       (a["down"], a["out"], a["what"]))
    ck("落ちた step を拾えた", a["step"] == "🔎 Firestore インデックスのデプロイ",
       a["step"])
    ck("したこと", r["action"] == "create", r["action"])
    ck("開いている issue の本数", len(gh.opened()) == 1, len(gh.opened()))

    b = gh.issues[0]["body"]
    first = b.split("\n")[2]
    ck("1行目が「もう出ています」", first.startswith("**もう本番に出ています。**"),
       first[:24])
    ck("落ちた step の名前が本文に出る", "**🔎 Firestore インデックスのデプロイ**" in b,
       "出る")
    ck("出ている赤だけ、あやとを呼ぶ", ship_down.OWNER in b, "呼ぶ")
    ck("見えない印が入っている", ship_down.MARK in b, "入っている")
    ck("題は作るときだけ", gh.issues[0]["title"] == ship_down.TITLE, "そのまま")
    ck("日付も run の番号も入れていない",
       "2026-09" not in b and "#" not in b.replace(ship_down.MARK, ""), "入れていない")
    return gh


def case2_before():
    print("\n[2] 配る前に止まった回 → 「まだ出ていません」（1 と本文が違う）")
    gh = FakeGh()
    r, a = once(gh, BEFORE, STEPS_BEFORE)
    ck("見立て", (a["down"], a["out"]) == (True, False), (a["down"], a["out"]))
    ck("したこと", r["action"] == "create", r["action"])

    b = gh.issues[0]["body"]
    first = b.split("\n")[2]
    ck("1行目が「まだ出ていません」", first.startswith("**まだ本番には出ていません。**"),
       first[:26])
    ck("島はひとつ前のまま、と書いてある", "ひとつ前のまま" in b, "書いてある")
    ck("出ていない赤では、あやとを呼ばない", ship_down.OWNER not in b, "呼ばない")

    # **同じ step 名でも意味が逆になる。** 名前の表で決めていたら、ここが通らない
    after = ship_down.where_broke(STEPS_AFTER)
    before = ship_down.where_broke(STEPS_BEFORE)
    ck("同じルール系の step で、出た／出ていないが分かれる",
       (before["out"], after["out"]) == (False, True),
       (before["out"], after["out"]))
    return gh


def case3_deploy_and_build():
    print("\n[3] 配る step そのもの／書き出しが落ちた回")
    w = ship_down.where_broke(STEPS_DEPLOY)
    ck("配る step が落ちたら「出ていない」", (w["out"], w["what"]) == (False, "deploy"),
       (w["out"], w["what"]))

    w = ship_down.where_broke(STEPS_BUILD)
    ck("書き出しが落ちたら「出ていない」", (w["out"], w["what"]) == (False, "build"),
       (w["out"], w["what"]))
    ck("後ろの見張りが赤くても、いちばん早い赤を採る",
       w["step"] == "Run npm ci && npm run build:web", w["step"])

    w = ship_down.where_broke(STEPS_SWEEP)
    ck("面のひと回りが赤いのは「もう出ている」",
       (w["out"], w["what"]) == (True, "sweep"), (w["out"], w["what"]))

    w = ship_down.where_broke(STEPS_NO_PIVOT)
    ck("配る step が見当たらなければ、出たかどうかを言わない", w["out"] is None,
       w["out"])

    gh0 = FakeGh()
    once(gh0, DEPLOY, STEPS_DEPLOY)
    b0 = gh0.issues[0]["body"]
    ck("配れなかった回は「まだ出ていません」",
       "**まだ本番には出ていません。**" in b0, "そう出る")
    ck("配れなかった回は、あやとを呼ばない", ship_down.OWNER not in b0, "呼ばない")

    gh = FakeGh()
    once(gh, SWEEP, STEPS_SWEEP)
    b = gh.issues[0]["body"]
    ck("ひと回りが赤い回は、あやとを呼ぶ", ship_down.OWNER in b, "呼ぶ")
    ck("何を見ればいいかが本文に出る", "ひと回り" in b, "出る")


def case4_close(gh):
    print("\n[4] また配れたら、その issue が閉じる")
    r, _ = once(gh, GREEN)
    ck("したこと", r["action"] == "close", r["action"])
    ck("開いている issue の本数", len(gh.opened()) == 0, len(gh.opened()))
    ck("立て直していない", gh.created == 1, gh.created)

    r, _ = once(gh, GREEN)
    ck("閉じたあとに、もう一度緑でも何もしない", r["action"] == "noop", r["action"])
    return gh


def case5_same():
    print("\n[5] 同じ状態が続いているあいだは 1バイトも書かない")
    gh = FakeGh()
    once(gh, AFTER, STEPS_AFTER)
    before = (gh.created, gh.patched)
    once(gh, AFTER, STEPS_AFTER)
    once(gh, AFTER, STEPS_AFTER)
    ck("2回目・3回目で書いた回数", (gh.created, gh.patched) == before,
       (gh.created, gh.patched))

    print("\n[5b] 出ていない → 出ている に変わったら、同じ1本の本文だけ書き換わる")
    gh2 = FakeGh()
    once(gh2, BEFORE, STEPS_BEFORE)
    r, _ = once(gh2, AFTER, STEPS_AFTER)
    ck("したこと", r["action"] == "update", r["action"])
    ck("issue は1本のまま", len(gh2.mine()) == 1, len(gh2.mine()))
    ck("本文が入れ替わった", "**もう本番に出ています。**" in gh2.issues[0]["body"],
       "入れ替わった")


def case6_unknown():
    print("\n[6] 分からない回は、開きも閉じもしない")
    gh = FakeGh()
    r, a = once(gh, CANCELLED)
    ck("cancelled の見立て", a["down"] is None, a["down"])
    ck("したこと", r["action"] == "noop", r["action"])

    gh2 = FakeGh()
    once(gh2, AFTER, STEPS_AFTER)
    r, _ = once(gh2, CANCELLED)
    ck("開いている issue を閉じない", r["action"] == "noop", r["action"])
    ck("開いたまま", len(gh2.opened()) == 1, len(gh2.opened()))

    gh3 = FakeGh()
    r, a = once(gh3, [])
    ck("無人の run が1本も無いとき", (a["down"], r["action"]) == (None, "noop"),
       (a["down"], r["action"]))


def case7_by_hand():
    print("\n[7] 手で押した run は数えない")
    gh = FakeGh()
    r, a = once(gh, BY_HAND_RED, STEPS_AFTER)
    ck("検品の赤では開かない", (a["down"], gh.created) == (None, 0),
       (a["down"], gh.created))

    gh2 = FakeGh()
    once(gh2, AFTER, STEPS_AFTER)
    r, _ = once(gh2, HAND_THEN_NIGHT, STEPS_AFTER)
    ck("検品の緑が混ざっていても、毎晩のぶんの赤を見る",
       r["action"] == "noop" and len(gh2.opened()) == 1, len(gh2.opened()))

    gh3 = FakeGh()
    once(gh3, AFTER, STEPS_AFTER)
    r, _ = once(gh3, BY_HAND_OK)
    ck("検品の緑だけでは閉じない", r["action"] == "noop", r["action"])

    print("\n[7b] 赤いあとで手で押して通っていたら、その回は保留する")
    gh4 = FakeGh()
    r, a = once(gh4, NIGHT_THEN_HAND, STEPS_AFTER)
    ck("見立て", (a["down"], a["what"]) == (None, "byhand"), (a["down"], a["what"]))
    ck("したこと", r["action"] == "noop", r["action"])
    ck("保留のときは step を取りにいかない", gh4.step_gets == 0, gh4.step_gets)


def case8_renamed():
    print("\n[8] 人が題を書き換えても、同じ1本を使う")
    gh = FakeGh()
    once(gh, AFTER, STEPS_AFTER)
    gh.issues[0]["title"] = "配りが赤い（あとで見る）"
    once(gh, BEFORE, STEPS_BEFORE)
    ck("issue は1本のまま", len(gh.mine()) == 1, len(gh.mine()))
    ck("題は戻していない", gh.issues[0]["title"] == "配りが赤い（あとで見る）",
       "そのまま")

    print("\n[8b] pull request は掴まない（`/issues` は PR も返す）")
    gh2 = FakeGh()
    gh2.issues.append({"number": 99, "title": "PR", "state": "open",
                       "labels": [ship_down.LABEL],
                       "body": ship_down.MARK + "\n偽物",
                       "pull_request": {"url": "…"}})
    once(gh2, AFTER, STEPS_AFTER)
    ck("PR を書き換えず、issue を1本立てた", gh2.created == 1 and gh2.patched == 0,
       (gh2.created, gh2.patched))


def case9_read_not_write():
    print("\n[9] --apply を付けなければ、読むだけ")
    gh = FakeGh()
    r, a = once(gh, AFTER, STEPS_AFTER, apply=False)
    ck("run を読みにいった", gh.run_gets == 1, gh.run_gets)
    ck("issue も読みにいった", gh.gets == 1, gh.gets)
    ck("書いた回数", gh.created + gh.patched == 0, gh.created + gh.patched)
    ck("何をするつもりだったか", r["planned"] == "create", r["planned"])
    ck("したことは dry", r["action"] == "dry", r["action"])


def case10_breaks():
    """**歯止めを1つずつ外して、そのとき確かに落ちることを見せる。**"""
    print("\n[10] 歯止めを1つずつ外すと落ちる")

    # (a) 赤を見ない → 赤い回に issue が立たない
    real = ship_down.RED
    ship_down.RED = ()
    gh = FakeGh()
    try:
        r, a = once(gh, AFTER, STEPS_AFTER)
    finally:
        ship_down.RED = real
    ck("(a) 赤を見ないと、出ているのに issue が立たない",
       (a["down"], gh.created) == (None, 0), (a["down"], gh.created))

    # (b) 無人かどうかを見ない → **毎晩のぶんが全部「手押し」に見えて一生立たない**
    real_un = ship_down.unattended
    ship_down.unattended = lambda r: r.get("event") in ("schedule", "workflow_run")
    gh2 = FakeGh()
    try:
        r, a = once(gh2, AFTER, STEPS_AFTER)
    finally:
        ship_down.unattended = real_un
    ck("(b) event だけで無人を決めると、毎晩の赤が1本も見えない",
       (a["down"], gh2.created) == (None, 0), (a["down"], gh2.created))

    # (b2) 逆に、検品の押しまで数えると、見なくていい赤で issue が立つ
    ship_down.unattended = lambda r: True
    gh3 = FakeGh()
    try:
        once(gh3, BY_HAND_RED, STEPS_AFTER)
    finally:
        ship_down.unattended = real_un
    ck("(b2) 検品の押しまで数えると、見なくていい赤で立つ", gh3.created == 1,
       gh3.created)

    # (c) 配る step を見分けない → **出ているのに「出ていません」と言う**
    real_mark = ship_down.DEPLOY_MARK
    ship_down.DEPLOY_MARK = "この字はどの step にも入っていない"
    try:
        w = ship_down.where_broke(STEPS_AFTER)
        gh4 = FakeGh()
        once(gh4, AFTER, STEPS_AFTER)
    finally:
        ship_down.DEPLOY_MARK = real_mark
    ck("(c) 配る step の目印を外すと、出たかどうかを言えなくなる",
       w["out"] is None, w["out"])
    ck("(c) そのとき、あやとを呼ぶ本文にもならない",
       ship_down.OWNER not in gh4.issues[0]["body"], "呼ばない")

    # (d) 「分からない」を「通っている」に倒す → 直っていない issue が閉じる
    gh5 = FakeGh()
    once(gh5, AFTER, STEPS_AFTER)
    real_decide = ship_down.decide
    ship_down.decide = lambda issue, want, down: real_decide(issue, want, bool(down))
    try:
        r, _ = once(gh5, CANCELLED)
    finally:
        ship_down.decide = real_decide
    ck("(d) 分からないを通ったに倒すと、直っていない issue が閉じる",
       r["action"] == "close", r["action"])

    # (e) 手押しの緑を見ない → 直した直後に「赤いです」と言う
    real_hand = ship_down.fixed_by_hand
    ship_down.fixed_by_hand = lambda runs, run: False
    gh6 = FakeGh()
    try:
        once(gh6, NIGHT_THEN_HAND, STEPS_AFTER)
    finally:
        ship_down.fixed_by_hand = real_hand
    ck("(e) 手押しの緑を見ないと、直した直後に issue が立つ", gh6.created == 1,
       gh6.created)

    # (f) 繋ぎ先の名前を見ない → **黙って切れたことに気づけない**
    real_names = ship_down.LINKED_NAMES
    ship_down.LINKED_NAMES = ("この名前のワークフローは無い",)
    try:
        gone = ship_down.check_wiring(FLOW)
        code = act(FakeGh(), GREEN, apply=False)
    finally:
        ship_down.LINKED_NAMES = real_names
    ck("(f) 繋ぎ先が消えていたら見つかる", gone == ["この名前のワークフローは無い"],
       gone)
    ck("(f) そのとき終了コードは 1", code == 1, code)

    # 戻したら元どおり（差し替えが残っていないことの確認）
    gh7 = FakeGh()
    once(gh7, AFTER, STEPS_AFTER)
    ck("戻したら1本立つ", len(gh7.mine()) == 1, len(gh7.mine()))
    ck("戻したら「出ている」と読む",
       ship_down.where_broke(STEPS_AFTER)["out"] is True, "読む")
    ck("戻したら繋ぎ先は在る", ship_down.check_wiring(FLOW) == [], "在る")


def case11_forbidden():
    print("\n[11] 読めなかったら（403）、終了コード 1 で落ちる")
    gh = Gh403()
    code = None
    try:
        ship_down.read_state(gh)
    except urllib.error.HTTPError as e:
        code = e.code
    ck("run を読みにいく", gh.run_gets == 1, gh.run_gets)
    ck("握りつぶさずに投げ返す", code == 403, code)

    got, said = said_while(lambda: act(Gh403(), apply=False))
    ck("終了コード", got == 1, got)
    ck("HTTP の番号がログに出る", "403" in said, "出る")
    ck("どこを見ればいいかがログに出る", "権限" in said, "出る")

    print("\n[11b] 0件が返っても落ちない（ラベルがまだ無い日）")
    gh2 = FakeGh()
    got, _ = said_while(lambda: act(gh2, GREEN, apply=True))
    ck("終了コード", got == 0, got)
    ck("何も書いていない", gh2.created + gh2.patched == 0, gh2.created + gh2.patched)

    print("\n[11c] `.github/workflows/` が読めないときは、繋ぎを確かめない")
    got, said = said_while(
        lambda: act(FakeGh(), GREEN, apply=False, flow_dir="/no/such/dir"))
    ck("測れないだけでは落とさない", got == 0, got)
    ck("確かめていないことはログに出る", "確かめていません" in said, "出る")


def case12_yaml():
    """**ワークフローの YAML と突き合わせる。**

    偽の GitHub を何通り回しても、それは全部「Python の中」。
    ここで踏むのは、**壊れても赤くならない**もの。
    """
    print("\n[12] ワークフローの YAML と突き合わせる")
    import yaml

    names = {}
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
    ck("見張る相手が実在する", ship_down.WORKFLOW_FILE in docs,
       ship_down.WORKFLOW_FILE)

    # 2. **配る step の目印**が、その中に実在するか。
    #    外れると「出ているのに出ていません」と言う issue が立つ（赤くならない）
    rows = []
    for job in (docs.get(ship_down.WORKFLOW_FILE, {}).get("jobs") or {}).values():
        for s in (job.get("steps") or []):
            rows.append(s.get("name") or s.get("uses") or "")
    hit = [r for r in rows if ship_down.DEPLOY_MARK in r]
    ck(f"配る step が実在する（{len(rows)}個 見た）", len(hit) == 1,
       hit or "見つからない")

    # 3. 名前で見分けている step が、全部実在するか。
    #    実在しない名前はここに書いてあっても一生当たらず、黙って
    #    「どこかで落ちた」に落ちる
    missing = [n for n in ship_down.WHAT if n not in rows]
    ck(f"何を直すかを引く step が全部実在する（{len(ship_down.WHAT)}本）",
       not missing, missing or "ぜんぶ在る")
    missing = [n for n in ship_down.BUILD_STEPS
               if not any(n.endswith(r) or r.endswith(n) or n == r for r in rows)]
    ck("書き出しの step が実在する", not missing, missing or "在る")

    # 4. この係の繋ぎ先が、実在するワークフローの name: か。
    #    **PyYAML は `on:` を真偽値の True として読む**（YAML 1.1）ので、両方引く
    me = docs.get(SELF_YML) or {}
    trig = me.get("on") if isinstance(me.get("on"), dict) else me.get(True) or {}
    linked = (trig.get("workflow_run") or {}).get("workflows") or []
    ck("繋ぎ先が空ではない", len(linked) > 0, linked)
    for want in linked:
        ck(f"繋ぎ先の name: が実在する — {want}", want in names.values(),
           [f for f, n in names.items() if n == want] or "見つからない")

    # **Python 側が見ている名前と、YAML の繋ぎが同じか。**
    # ここがずれると、切れたことを確かめる仕組みのほうが嘘をつく
    ck("Python と YAML で、繋ぎ先が揃っている",
       sorted(linked) == sorted(ship_down.LINKED_NAMES),
       (sorted(linked), sorted(ship_down.LINKED_NAMES)))

    # 見張る相手そのものに繋いであるか
    ck("見張る相手の name: に繋いである",
       names.get(ship_down.WORKFLOW_FILE) in linked,
       names.get(ship_down.WORKFLOW_FILE))

    # 保険の cron（`CLAUDE.md`「cron は保険として残す」）
    ck("保険の cron が置いてある", bool(trig.get("schedule")), trig.get("schedule"))

    perm = me.get("permissions") or {}
    ck("run を読む権限が宣言されている", perm.get("actions") == "read",
       perm.get("actions"))
    ck("issue を書く権限が宣言されている", perm.get("issues") == "write",
       perm.get("issues"))

    # **焼き直しの見張りとラベルが別か。** 同じだと、片方が相手の issue を
    # 掴んで閉じにいく
    import bake_down
    ck("焼き直しの見張りと、ラベルも印も別",
       (ship_down.LABEL, ship_down.MARK) != (bake_down.LABEL, bake_down.MARK),
       (ship_down.LABEL, bake_down.LABEL))


def case13_real():
    """**本番の run を、そのまま食わせて通す。**

    偽の step を並べたのは全部こちらの手なので、`--from` で本番の1本を読む。
    形が変わった日（GitHub が返す字が変わった日）に、ここが落ちる。
    """
    print("\n[13] 本番の run（#114）を、そのまま読んで見立てる")
    path = os.path.join(ROOT, "python", "tests", "ship_down_runs.json")
    ck("取り置きが在る", os.path.exists(path), path)
    if not os.path.exists(path):
        return
    gh = ship_down.Canned(path)
    a = ship_down.read_state(gh)
    ck("見立て", (a["down"], a["out"], a["what"]) == (True, True, "rules"),
       (a["down"], a["out"], a["what"]))
    b = ship_down.body(a)
    ck("1行目が「もう出ています」", "**もう本番に出ています。**" in b.split("\n")[2],
       "そう出る")


def case_grep():
    """**出た字を探す。** 袋を読むので、ほかの確かめのあとに回す。"""
    print("\n[素性] 本文にもログにも、名前・どねID・チャンネルID・メールが出ない")

    # **先に、探し方が当たることを見る。** 0 を信じる前に、仕込んだ字で当てる
    bait = f"{CID} / {HANDLE} / {PK} / someone@example.com"
    got = logident.count(bait)
    ck("探し方が当たる — チャンネルID", got["channel_id"] > 0, got["channel_id"])
    ck("探し方が当たる — ハンドル", got["handle"] > 0, got["handle"])
    ck("探し方が当たる — どねID", got["doneru_id"] > 0, got["doneru_id"])
    ck("探し方が当たる — メール", got["email"] > 0, got["email"])

    # **両方の本文を数える。** 同じ issue を書き換えると、あとの1本しか
    # 残らない——オーナーを呼ぶほうが消えて、**数えていないのに 0 になる**
    gh = FakeGh()
    once(gh, AFTER, STEPS_AFTER)
    gh2 = FakeGh()
    once(gh2, BEFORE, STEPS_BEFORE)
    text = "\n".join(i["body"] for i in gh.issues + gh2.issues)

    # **本文に出てよい `@` は、オーナーの1つだけ。** ほかは1文字も出さない
    # （出ているのに出ていないと言わないため、ここは外してから数える）
    n = logident.count(text.replace(ship_down.OWNER, "（オーナー）"))
    for k in logident.KINDS:
        ck(f"本文に出た数 — {k}", n[k] == 0, n[k])
    only = logident.count(text)["handle"]
    ck("本文の @ は、オーナーのぶんだけ（呼ぶほうを数えている）", only == 1, only)
    print(f"    （見た本文は {len(text)} 文字）")

    log = BUF.getvalue().split("[素性の結果]")[0]
    n = logident.count(log.replace(ship_down.OWNER, "（オーナー）"))
    for k in logident.KINDS:
        ck(f"ログに出た数 — {k}", n[k] == 0, n[k])
    print(f"    （見たログは {len(log)} 文字）")

    # **0 を「何も出していない」で作っていないこと**も見る。
    # 偽の run には最初から人の跡が混ぜてあるので、丸ごと流す1行が生えれば上が落ちる
    ck("run には人の跡が混ぜてある（0 が素通りではない）",
       sum(logident.count(str(AFTER[0])).values()) > 0,
       sum(logident.count(str(AFTER[0])).values()))


def main() -> int:
    # **毎回これが走るのは Actions の中。** 公開のログに積まれるのはそのときの
    # 字なので、同じ条件で回して、その出力を最後に数える
    os.environ["GITHUB_ACTIONS"] = "true"
    print("=== 偽の GitHub で、配りが赤いことの映し方を動かす ===")
    print("（GitHub には1バイトも出ません）")
    gh = case1_after()
    case2_before()
    case3_deploy_and_build()
    case4_close(gh)
    case5_same()
    case6_unknown()
    case7_by_hand()
    case8_renamed()
    case9_read_not_write()
    case10_breaks()
    case11_forbidden()
    case12_yaml()
    case13_real()
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
