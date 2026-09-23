"""偽の Firestore と偽の GitHub で、**落ちているの映し方を実際に動かして確かめる。**

    python python/ingest_down_selftest.py

**本番には1バイトも出ない。** Firestore にも GitHub にも届かないし、
資格情報もネットワークも要らない（`ingest_down.py` が外に出る口は
`read_note(db)` と `Gh` の3つだけなので、そこを偽物に差し替える）。

確かめるのは12:

  1. 通っている → 落ちた で issue が **1本**開く（セッション切れは**その晩に**）
  2. **落ちたまま2晩**でも issue は**増えない**。同じ晩に2回走っても
     **PATCH は打たない**。日が変わって日数が動いた晩だけ本文が書き換わる
  3. **入り直したら**、その issue が**閉じる**
  4. **ずっと通っている**と何も起きない（**閉じた issue を開け直さない**）
  5. 人が手で**タイトルを変えた**issue でも、見えない印で見つけて同じ1本を使う
  6. **本文にもログにも、名前・どねID・チャンネルIDが1文字も出ない**
     （0 を信じる前に、**仕込んだ字で探し方が当たること**を先に見る）
  7. `--apply` を付けなくても **GET は1回通り、POST と PATCH は 0回**
  8. **歯止めを3つ、1つずつ外すと落ちる**
  9. **読めなかったら（403）赤くして止まる**（終了コード 1 と、1行のログ）
 10. **0件が返っても落ちない**（ラベルがまだ無い晩＝いまの本番の状態）
 11. **1晩の失敗では開かない。2晩で開く**（`STALE_DAYS` の境目）
 12. **札が無い晩・未来の日付・見たことのない結果**で、勝手に開かない

## 11 と 12 が、この確かめの本体

「落ちている」を決めるのは `assess()` ひとつで、そこを間違えると
**空振りの issue が毎晩開く**か、**本当に落ちた朝に黙る**かのどちらかになる。
どちらも、この仕組みを作った意味を消す。だから境目を両側から踏む。

取り込みは 20:30 UTC の予定だが**実測で1時間49分〜3時間32分遅れて走る**ので、
「最後に入ってから28時間」はふつうの姿。1晩の `error` も実際にある
（2026-09-06）。**そこで開いてはいけない。**
逆に `session_expired` は**入り直すまで絶対に直らない**ので、
日数を待たずにその晩に開く。この2つを混ぜていないことを別々に見る。

## 6 の測りかた

このリポジトリは公開で、Actions のログも issue も誰でも読める。
「出していないつもり」ではなく、**出たものを見る。**
`sys.stdout` と `sys.stderr` を二股にして出力を丸ごと溜め、最後にそこを探す。
**数え方は `tools/logident.py` に寄せる**（自前の正規表現を持つと探し方が
2つになり、片方を直し忘れたときに食い違う）。

札（`islandDoneruHealth/last`）は Firestore から来るもので、**中身が
いつまでも想定どおりだとは限らない。** だからここでは、偽の札に
チャンネルID・ハンドル・どねID を**わざと混ぜて**回す。
札を丸ごとログへ流す1行が生えた日に、ここが落ちる。

**回すあいだは `GITHUB_ACTIONS=true` を立てておく。** 毎晩これが走るのは
Actions の中で、公開のログに積まれるのはそのときの字だから。

## 8 がなぜ要るか

落ちないテストは何も見ていない。1・5・11 は、歯止めが壊れていても
**たまたま同じ結果になれば通ってしまう。** だから1つずつ外して、
そのとき確かに落ちることを見る。こうしておけば ○ が証拠になる。
"""

import importlib.util
import io
import os
import sys
import urllib.error

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# 実際の出力を溜める袋。**ingest_down（＝basicConfig）を読み込む前に**
# 二股にしておく。logging のハンドラは作られた時点の stream を握る。
# ログは stderr へ出るので、**両方**を溜める必要がある
BUF = io.StringIO()
REAL_OUT, REAL_ERR = sys.stdout, sys.stderr


class Tee:
    """画面にも出しつつ、袋にも同じものを入れる。"""

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

# `config.py` は BQ_PROJECT_ID が無いと読み込めない。**偽の値を置く。**
# この確かめは BigQuery も Firestore も1度も触らないので中身は何でもよく、
# 逆に本物を置くと、鍵の要る箱でしか回せない確かめになってしまう
os.environ.setdefault("BQ_PROJECT_ID", "ingest-down-selftest")

import ingest_down  # noqa: E402
import ticket_labels  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def _load_logident():
    """`tools/logident.py` を読み込む。**数え方はあちら1か所に寄せる。**"""
    path = os.path.join(ROOT, "tools", "logident.py")
    spec = importlib.util.spec_from_file_location("logident", path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


logident = _load_logident()

# ---------------------------------------------------------------- 偽の札

TODAY = "2026-09-14"

# **本番と同じ形**（どねID は10桁 / チャンネルIDは `UC` + 22文字 / `@…`）。
# 形が違うと、本番では効かない字を探して「0件」と言うことになる
# （`docs/island-misses.md` #79）
CID = "UCzzFAKE0000000000000001"
HANDLE = "@ふしぎな-fake1"
PK = "1000000001"

# 札に**わざと混ぜる**余計な中身。`doneru_health.py` はいまこれを書かないが、
# 書くようになった日に「札を丸ごとログへ」の1行が生えても気づけるようにする
DIRT = {"detail": f"{CID} / {HANDLE} / {PK}", "note": f"見た人: {HANDLE}"}


def note(ok_day, outcome, **extra):
    """札を1枚こしらえる。**形は `python/doneru_health.py` が書くものと同じ。**"""
    return {
        "at": f"{TODAY}T22:41:00+00:00",
        "okAt": f"{ok_day}T20:41:00Z" if ok_day else None,
        "okDay": ok_day,
        "lastAt": f"{TODAY}T20:41:00Z",
        "lastOutcome": outcome,
        "runs": 340,
        **DIRT,
        **extra,
    }


N_OK = note(TODAY, "ok")                       # ふつうの晩
N_1DAY = note("2026-09-13", "error")           # 1晩だけ入らなかった
N_2DAY = note("2026-09-12", "error")           # 2晩続けて入らなかった
N_3DAY = note("2026-09-11", "error")           # 3晩目
N_EXP = note(TODAY, "session_expired")         # 今日入ったが、その後で切れた
N_EXP2 = note("2026-09-12", "session_expired")  # 切れたまま2日
N_FUTURE = note("2026-09-20", "ok")            # 札のほうが壊れている
# 見たことのない結果。**`session_expired` を含んでいても**、そのままでは
# 効かせない（札は外から来るもの。部分一致で拾うと、何が入っても開く）
N_WEIRD = note(TODAY, f"session_expired: {CID}")


# ---------------------------------------------------------------- 偽の口

class Snap:
    """DocumentSnapshot のかわり。"""

    def __init__(self, data):
        self._d = data
        self.exists = data is not None

    def to_dict(self):
        return dict(self._d) if self._d is not None else None


class Doc:
    def __init__(self, data):
        self._d = data

    def get(self):
        return Snap(self._d)


class Col:
    def __init__(self, data):
        self._d = data

    def document(self, name):
        return Doc(self._d if name == ingest_down.DOCUMENT else None)


class FakeDb:
    """偽の Firestore。`islandDoneruHealth/last` の1枚だけ持つ。"""

    def __init__(self, data):
        self._d = data

    def collection(self, name):
        return Col(self._d if name == ingest_down.COLLECTION else None)


class FakeGh:
    """偽の GitHub。**動詞ごとに叩いた回数と、issue の本数を数える。**

    「増えていないか」は結果（開いている issue の数）だけでは言えない。
    1本消してもう1本立てても、開いている数は同じ 1 に見える。
    **立てた回数そのもの**を数える。

    読みと書きを別々に数えるのは、`--apply` なしの晩に見たいのが
    「1バイトも触っていない」ではなく**「読んだが書いていない」**だから。
    """

    def __init__(self):
        self.issues: list = []
        self.gets = 0       # GET（`--apply` なしでも 1以上 を見る）
        self.created = 0    # POST（立てた回数）
        self.patched = 0    # PATCH（書き換えた回数）
        self.commented = 0  # コメント（**あやとを呼んだ回数**）
        self.pings: list = []
        self._next = 1

    def list_issues(self, label: str) -> list:
        self.gets += 1
        return [dict(i) for i in self.issues if label in i["labels"]]

    def create(self, title: str, text: str, label: str, wait: str = "") -> dict:
        self.created += 1
        i = {"number": self._next, "title": title, "body": text,
             "state": "open", "labels": [label] + ([wait] if wait else [])}
        self._next += 1
        self.issues.append(i)
        return dict(i)

    def comment(self, number: int, text: str) -> dict:
        self.commented += 1
        self.pings.append(text)
        return {"id": self.commented}

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
                if ingest_down.MARK in (i.get("body") or "")]


class Gh403:
    """**読みにいくと 403 を返す**偽の GitHub。

    資格が切れた・`issues` の権限が外れた・リポジトリの指定が違う、の形。
    書く側は呼ばれたら例外にする。**読めていないのに書きにいったら異常。**
    """

    def __init__(self):
        self.gets = 0
        self.created = 0
        self.patched = 0

    def list_issues(self, label: str) -> list:
        self.gets += 1
        raise urllib.error.HTTPError(
            "https://api.github.com/repos/…/issues", 403, "Forbidden", {}, None)

    def create(self, *a, **k):
        raise AssertionError("読めていないのに書きにいった")

    def patch(self, *a, **k):
        raise AssertionError("読めていないのに書きにいった")

    def comment(self, *a, **k):
        raise AssertionError("読めていないのに呼びにいった")


# 偽の資格。**ログに出ない形のものを置く**（出たら 6 で拾われる）
FAKE_REPO = "example-owner/example-repo"
FAKE_TOKEN = "fake-token-for-selftest"


# ---------------------------------------------------------------- 回す

def look(data, today: str = TODAY) -> dict:
    """札を読んで `assess()` まで通す。**本番と同じ道。**"""
    return ingest_down.assess(
        ingest_down.read_note(FakeDb(data)), today)


def night(gh, data, apply: bool = True, today: str = TODAY) -> dict:
    """1晩ぶん回す（読む → 見立てる → 合わせる）。"""
    return ingest_down.run(gh, look(data, today), apply=apply)


def act(gh, data, apply: bool = False, today: str = TODAY):
    """`ingest_down.act()` を、偽の GitHub と偽の資格で回して終了コードを取る。

    `act` は資格を環境変数から読んで `Gh` を作るので、**その `Gh` ごと
    差し替える。** 本番の形（資格を見る → 読む → 必要なら書く）をそのまま通す。
    """
    real = ingest_down.Gh
    ingest_down.Gh = lambda repo, token: gh
    os.environ["GITHUB_REPOSITORY"] = FAKE_REPO
    os.environ["GITHUB_TOKEN"] = FAKE_TOKEN
    try:
        return ingest_down.act(look(data, today), apply=apply)
    finally:
        ingest_down.Gh = real
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


def case1_open():
    print("\n[1] 通っている → 落ちた で、issue が1本開く")
    gh = FakeGh()

    r = night(gh, N_OK)
    ck("通っている晩にしたこと", r["action"] == "noop", r["action"])
    ck("立てた回数", gh.created == 0, gh.created)

    # **セッション切れは、日数を待たずにその晩。** 入り直すまで直らないので
    r = night(gh, N_EXP)
    ck("セッションが切れた晩にしたこと", r["action"] == "create", r["action"])
    ck("立てた回数", gh.created == 1, gh.created)
    ck("開いている issue の本数", len(gh.opened()) == 1, len(gh.opened()))
    b = gh.issues[0]["body"]
    ck("本文に「入れ直すまで戻りません」が入っている",
       "入れ直すまで戻りません" in b, "入っている")
    ck("本文に貼り替える先が入っている", "DONERU_COOKIE" in b, "入っている")
    ck("本文に手順書の場所が入っている", "docs/island-db.md" in b, "入っている")
    ck("本文に見えない印が入っている", ingest_down.MARK in b, "入っている")
    ck("タイトルは作るときだけ", gh.issues[0]["title"] == ingest_down.TITLE,
       "そのまま")
    return gh


def case2_same(gh):
    print("\n[2] 落ちたまま2晩でも issue は増えない")

    # **同じ晩に2回走る形。** 取り込みと Doneru の両方に繋いであるので、
    # 2本とも走った晩は2回回る。札も日数も同じなので、本文も同じ
    r = night(gh, N_EXP)
    ck("同じ晩の2回目にしたこと", r["action"] == "noop", r["action"])
    ck("立てた回数（増えていない）", gh.created == 1, gh.created)
    ck("書き換えた回数（PATCH も打たない）", gh.patched == 0, gh.patched)
    ck("この仕組みが持つ issue の本数", len(gh.mine()) == 1, len(gh.mine()))

    # 日が変わって、入っていない日数が動いた晩。**同じ1本の本文が変わるだけ**
    r = night(gh, N_EXP2)
    ck("日数が動いた晩にしたこと", r["action"] == "update", r["action"])
    ck("立てた回数（やはり増えていない）", gh.created == 1, gh.created)
    ck("この仕組みが持つ issue の本数", len(gh.mine()) == 1, len(gh.mine()))
    ck("本文に「いつまで入っているか」が出た",
       "2026-09-12" in gh.issues[0]["body"], "2026-09-12")
    ck("issue の番号が変わっていない", r["number"] == 1, r["number"])

    # その次の晩、また同じなら触らない
    r = night(gh, N_EXP2)
    ck("変わらない晩は触らない", r["action"] == "noop", r["action"])
    ck("書き換えた回数（1回だけ）", gh.patched == 1, gh.patched)
    return gh


def case3_close(gh):
    print("\n[3] 入り直して通ったら、その issue が閉じる")
    r = night(gh, N_OK)
    ck("したこと", r["action"] == "close", r["action"])
    ck("閉じた issue の番号", r["number"] == 1, r["number"])
    ck("開いている issue の本数", len(gh.opened()) == 0, len(gh.opened()))
    ck("issue そのものは残っている（消していない）",
       len(gh.mine()) == 1, len(gh.mine()))
    return gh


def case4_stay_closed(gh):
    print("\n[4] 通っているあいだは何も起きない（閉じた issue を開け直さない）")
    was = (gh.created, gh.patched)
    r = night(gh, N_OK)
    ck("したこと", r["action"] == "noop", r["action"])
    ck("立てた回数・書き換えた回数（どちらも増えない）",
       (gh.created, gh.patched) == was, (gh.created, gh.patched))
    ck("開いている issue の本数", len(gh.opened()) == 0, len(gh.opened()))

    night(gh, N_OK)
    ck("2晩置いても開いていない", len(gh.opened()) == 0, len(gh.opened()))
    return gh


def case5_renamed(gh):
    print("\n[5] 人がタイトルを変えても、見えない印で同じ1本を使う")
    # 人が手で書き換えた形。絵文字も足されている
    gh.issues[0]["title"] = "🍪 Doneru の cookie（あとで入れ直す）"
    before = gh.issues[0]["number"]

    r = night(gh, N_2DAY)
    ck("したこと", r["action"] == "reopen", r["action"])
    ck("使った issue の番号（同じ1本）", r["number"] == before, r["number"])
    ck("立てた回数（増えていない）", gh.created == 1, gh.created)
    ck("この仕組みが持つ issue の本数", len(gh.mine()) == 1, len(gh.mine()))
    ck("開き直っている", len(gh.opened()) == 1, len(gh.opened()))
    ck("タイトルは人が付けたまま（戻していない）",
       gh.issues[0]["title"] == "🍪 Doneru の cookie（あとで入れ直す）",
       "そのまま")
    return gh


def case11_boundary():
    """**1晩の失敗では開かない。2晩で開く。**

    ここが `STALE_DAYS` の境目。1日で開くと、**遅れただけの朝**に毎回開く
    （取り込みは実測で1時間49分〜3時間32分遅れる）。
    """
    print("\n[11] 1晩の失敗では開かない。2晩で開く")
    for name, data, want in (
        ("今日入っている（ok）", N_OK, False),
        ("1晩入っていない（error）", N_1DAY, False),
        ("2晩入っていない（error）", N_2DAY, True),
        ("3晩入っていない（error）", N_3DAY, True),
    ):
        a = look(data)
        ck(f"{name} → 落ちている？", a["down"] is want,
           f'{a["down"]}（{a["days"]}日前 / {a["why"]}）')

    # セッション切れだけは日数を待たない。**今日入っていても開く**
    a = look(N_EXP)
    ck("今日入っているがセッション切れ → 落ちている", a["down"] is True,
       f'{a["down"]}（{a["days"]}日前 / {a["why"]}）')

    # issue まで通して、実際に立つ／立たないを見る
    gh = FakeGh()
    night(gh, N_1DAY)
    ck("1晩だけの失敗で issue は立たない", gh.created == 0, gh.created)
    night(gh, N_2DAY)
    ck("2晩続いたら立つ", gh.created == 1, gh.created)


def case12_unknown():
    """**分からない晩に、勝手に開かない。**

    札が無い・日付が未来・見たことのない結果。どれも「読めていない」で
    あって「落ちている」ではない（`docs/island-standards.md` 10章）。
    倒れる方向は黙る側へ。
    """
    print("\n[12] 札が無い・未来の日付・見たことのない結果では開かない")

    a = look(None)
    ck("札が無い → 落ちていない", a["down"] is False, a["down"])
    ck("札が無い → 日付も持たない", a["okDay"] is None, a["okDay"])

    a = look(N_FUTURE)
    ck("未来の日付 → 数えない", a["days"] is None, a["days"])
    ck("未来の日付 → 落ちていない", a["down"] is False, a["down"])

    a = look(N_WEIRD)
    ck("見たことのない結果 → そのままでは効かせない",
       a["outcome"] is None, a["outcome"])
    ck("見たことのない結果 → 落ちていない", a["down"] is False, a["down"])

    a = look(note(None, "ok"))
    ck("最後に入った日が無い → 落ちていない", a["down"] is False, a["down"])

    # 日が無くても、切れていれば落ちている。**そのとき本文が壊れないこと**まで見る
    # （「いま入っているのは **分かりません** まで。」と書くと、読んだ人が止まる）
    a = look(note(None, "session_expired"))
    ck("日が無くても、切れていれば落ちている", a["down"] is True, a["down"])
    b = ingest_down.body(a)
    ck("日が無い晩は「◯◯まで」と書かない",
       "まで。" not in b and "いつまで入っているかが分かりません" in b,
       "言い換えている")

    gh = FakeGh()
    night(gh, None)
    night(gh, N_FUTURE)
    night(gh, N_WEIRD)
    ck("どれでも issue は立たない", gh.created == 0, gh.created)


def case_pr():
    print("\n[5b] pull request が混ざっても拾わない")
    gh = FakeGh()
    # `/issues` は pull request も返す。見えない印を持つ PR を混ぜておく。
    # 拾ってしまうと、PR の本文を毎晩書き換えにいくことになる
    gh.issues.append({
        "number": 99, "title": "落ちているを映す仕組み", "state": "open",
        "labels": [ingest_down.LABEL],
        "body": "この PR で " + ingest_down.MARK + " を入れます",
        "pull_request": {"url": "…"},
    })
    r = night(gh, N_2DAY)
    ck("PR は使わず、新しく1本立てた", r["action"] == "create", r["action"])
    ck("使った番号が PR ではない", r["number"] != 99, r["number"])


def case7_read_not_write():
    print("\n[7] --apply なしでも GitHub を読む（が、1バイトも書かない）")

    # (a) 落ちているのに issue が無い晩。**立てるつもりだが、立てない**
    gh = FakeGh()
    r, said = said_while(lambda: night(gh, N_2DAY, apply=False))
    ck("読んだ回数（GET）", gh.gets == 1, gh.gets)
    ck("立てた回数（POST）", gh.created == 0, gh.created)
    ck("書き換えた回数（PATCH）", gh.patched == 0, gh.patched)
    ck("issue は1本も増えていない", len(gh.issues) == 0, len(gh.issues))
    ck("したこと", r["action"] == "dry", r["action"])
    ck("するつもりだったこと", r.get("planned") == "create", r.get("planned"))
    ck("「読めた」がログに残る", "読めました" in said, "残る")
    ck("これから何をするかがログに出る",
       "issue を1本 開きます" in said, "出る")

    # (b) 開いている issue があって、また入るようになった晩。
    #     **閉じるつもりだが、閉じない**
    gh2 = FakeGh()
    night(gh2, N_2DAY)                   # 1本立てておく（ここは apply）
    before = (gh2.created, gh2.patched)
    r, said = said_while(lambda: night(gh2, N_OK, apply=False))
    ck("するつもりだったこと", r.get("planned") == "close", r.get("planned"))
    ck("使う issue の番号まで分かる", r["number"] == 1, r["number"])
    ck("書いた回数は増えていない",
       (gh2.created, gh2.patched) == before, (gh2.created, gh2.patched))
    ck("issue は開いたまま（閉じていない）",
       len(gh2.opened()) == 1, len(gh2.opened()))
    ck("いまの issue の状態がログに出る", "開いています" in said, "出る")


def case8_broken():
    """**歯止めを1つずつ外して、そのとき確かに落ちることを見せる。**

    落ちないテストは何も見ていない。1・5・11 の ○ が
    「歯止めが効いている証拠」になるのは、外したときに ✕ になるから。
    """
    print("\n[8] 歯止めを1つずつ外すと落ちる")

    # (a) 同じ1本の見つけ方を、タイトル一致に戻す（人が変えたら見失う）
    gh = FakeGh()
    night(gh, N_2DAY)
    gh.issues[0]["title"] = "🍪 Doneru の cookie（あとで入れ直す）"

    real = ingest_down.find_issue

    def by_title(issues, mark=ingest_down.MARK):
        for i in issues:
            if i.get("title") == ingest_down.TITLE:
                return i
        return None

    ingest_down.find_issue = by_title
    try:
        night(gh, N_2DAY)
    finally:
        ingest_down.find_issue = real
    ck("(a) タイトルで探すと issue が2本に増える",
       len(gh.mine()) == 2, len(gh.mine()))

    # (b) セッション切れの近道を外す（日数だけで判断する形に戻す）
    real_exp = ingest_down.EXPIRED
    ingest_down.EXPIRED = "__この値は札に入らない__"
    try:
        a = look(N_EXP)
    finally:
        ingest_down.EXPIRED = real_exp
    ck("(b) 近道を外すと、切れた晩に開かなくなる", a["down"] is False, a["down"])

    # (c) 待つ日数を1日に縮める（遅れただけの朝に開く形に戻す）
    real_days = ingest_down.STALE_DAYS
    ingest_down.STALE_DAYS = 1
    try:
        a = look(N_1DAY)
    finally:
        ingest_down.STALE_DAYS = real_days
    ck("(c) 1日に縮めると、1晩の失敗で開いてしまう", a["down"] is True, a["down"])

    # 戻したら元どおり（差し替えが残っていないことの確認）
    gh2 = FakeGh()
    night(gh2, N_2DAY)
    gh2.issues[0]["title"] = "🍪 Doneru の cookie（あとで入れ直す）"
    night(gh2, N_2DAY)
    ck("戻したら1本のまま", len(gh2.mine()) == 1, len(gh2.mine()))
    ck("戻したら切れた晩に開く", look(N_EXP)["down"] is True, "開く")
    ck("戻したら1晩では開かない", look(N_1DAY)["down"] is False, "開かない")


def case9_forbidden():
    """**読めなかったら赤くして止まる。**

    `--apply` が無くても GitHub を読むようにしたので、届かないことが
    毎晩分かる。分かったら 1 で落とす。*落ちている*は赤くしないが、
    *届かない*は赤くする（`ingest_down.py` の「赤くしない」）。
    """
    print("\n[9] 読めなかったら（403）、終了コード 1 で落ちる")

    # 握りつぶさずに投げ返すこと
    gh = Gh403()
    code = None
    try:
        ingest_down.run(gh, look(N_OK), apply=False)
    except urllib.error.HTTPError as e:
        code = e.code
    ck("--apply なしでも読みにいく", gh.gets == 1, gh.gets)
    ck("握りつぶさずに投げ返す", code == 403, code)

    got, said = said_while(lambda: act(Gh403(), N_OK, apply=False))
    ck("終了コード", got == 1, got)
    ck("HTTP の番号がログに出る", "403" in said, "出る")
    ck("どこを見ればいいかがログに出る", "権限" in said, "出る")

    # 落ちている晩でも同じ（状態に関係なく、届かないのは異常）
    got, _ = said_while(lambda: act(Gh403(), N_EXP2, apply=True))
    ck("落ちている晩でも終了コードは 1", got == 1, got)


def case10_empty():
    """**0件が返ってくる晩**（ラベルがまだ無い＝いまの本番の状態）。"""
    print("\n[10] 0件が返ってきても落ちない（ラベルがまだ無い晩）")
    gh = FakeGh()
    got, said = said_while(lambda: act(gh, N_OK, apply=False))
    ck("終了コード", got == 0, got)
    ck("読んだ回数（GET）", gh.gets == 1, gh.gets)
    ck("書いた回数（POST + PATCH）",
       gh.created + gh.patched == 0, gh.created + gh.patched)
    ck("「読めた」がログに残る", "0件" in said and "読めました" in said, "残る")
    ck("issue がまだ無いことが出る", "まだ1本もありません" in said, "出る")
    ck("これから何もしないと出る", "何もしません" in said, "出る")


def case6_grep():
    """**出た字を探す。** 袋を読むので、ほかの確かめのあとに回す。

    見るのは2つ。**issue の本文**（公開）と、**ログ**（Actions は公開）。
    """
    print("\n[6] 本文にもログにも、名前・どねID・チャンネルIDが1文字も出ない")

    # **先に、探し方が当たることを見る。** 正規表現が壊れていれば、
    # 何が出ていても「0件」と言える。0 を信じる前に、仕込んだ字で当てる
    bait = f"{CID} / {HANDLE} / {PK}"
    got = logident.count(bait)
    ck("探し方が当たる — チャンネルID", got["channel_id"] > 0, got["channel_id"])
    ck("探し方が当たる — ハンドル", got["handle"] > 0, got["handle"])
    ck("探し方が当たる — どねID", got["doneru_id"] > 0, got["doneru_id"])

    # issue の本文。**公開の場に残るのはこちらが先**
    gh = FakeGh()
    night(gh, N_EXP2)
    night(gh, N_3DAY)
    text = "\n".join(i["body"] for i in gh.issues)
    n = logident.count(text)
    for k in logident.KINDS:
        ck(f"本文に出た数 — {k}", n[k] == 0, n[k])
    print(f"    （見た本文は {len(text)} 文字）")

    # ログ。ここまでの出力を丸ごと見る。**仕込んだ偽のデータそのものが
    # 並んでいるこのファイルの中身は数えない**（袋に入っているのは出力だけ）
    log = BUF.getvalue().split("[6の結果]")[0]
    n = logident.count(log)
    for k in logident.KINDS:
        ck(f"ログに出た数 — {k}", n[k] == 0, n[k])
    print(f"    （見たログは {len(log)} 文字）")

    # **0 を「何も出していない」で作っていないこと**も見る。
    # 札には最初から汚れが混ぜてあるので、丸ごと流す1行が生えれば上が落ちる
    ck("札には汚れが混ぜてある（0 が素通りではない）",
       sum(logident.count(str(N_EXP2)).values()) > 0,
       sum(logident.count(str(N_EXP2)).values()))


def case13_mention():
    """**あやとを呼ぶのは「セッション切れ」のときだけ。**

    cookie を入れ直せるのはあやとだけで、待っても直らない。
    一方「何日も入っていない」ほうは、こちらが流し直せば入ることがある。
    **そこに毎晩メンションを付けると、そのうち誰も読まなくなる。**
    """
    print("\n[13] あやとを呼ぶところ")

    exp = ingest_down.body(ingest_down.assess(N_EXP2, TODAY))
    stale = ingest_down.body(ingest_down.assess(N_3DAY, TODAY))

    ck("セッション切れの本文には名乗りが在る",
       ticket_labels.HANDLE in exp, "在る")
    ck("しかも飛ぶ形（囲いにも引用にも入っていない）",
       ticket_labels.mention_live(exp), "飛ぶ")
    ck("何日も入っていないほうには入れない",
       ticket_labels.HANDLE not in stale, "入っていない")

    # 開く回は鳴らさない。本文のメンションで飛ぶ
    gh = FakeGh()
    night(gh, N_EXP2)
    ck("開いた回はコメントを足さない", gh.commented == 0, gh.commented)
    ck("開いた回の札は「待ち-あやと」",
       ticket_labels.WAIT_AYATO in gh.issues[0]["labels"],
       gh.issues[0]["labels"])

    # 「何日も入っていない」で開いた回の札は、こちら待ち
    gh2 = FakeGh()
    night(gh2, N_3DAY)
    ck("何日も入っていないほうの札は「待ち-システム」",
       ticket_labels.WAIT_US in gh2.issues[0]["labels"],
       gh2.issues[0]["labels"])
    ck("そちらではコメントも足さない", gh2.commented == 0, gh2.commented)

    # **「何日も入っていない」→「セッション切れ」に変わった晩に、1回だけ鳴る**
    night(gh2, N_EXP2)
    ck("こちら待ちからあやと待ちに変わったら、1回鳴らす",
       gh2.commented == 1, gh2.commented)
    ck("鳴らしたコメントも飛ぶ形",
       gh2.pings and ticket_labels.mention_live(gh2.pings[0]), "飛ぶ")

    # 翌晩も切れたままなら、もう鳴らさない
    night(gh2, note("2026-09-11", "session_expired"))
    ck("切れたままの翌晩は鳴らさない", gh2.commented == 1, gh2.commented)

    # **対照。** 分岐を外したら、いまの3つが全部ひっくり返る
    ck("メンションを入れる分岐が効いている"
       "（切れたときだけ True）",
       ingest_down.assess(N_EXP2, TODAY)["why"] == "expired"
       and ingest_down.assess(N_3DAY, TODAY)["why"] == "stale",
       "効いている")


def main() -> int:
    # **毎晩これが走るのは Actions の中。** 公開のログに積まれるのはそのときの
    # 字なので、同じ条件で回して、その出力を 6 で数える
    os.environ["GITHUB_ACTIONS"] = "true"
    print("=== 偽の Firestore と偽の GitHub で、落ちているの映し方を動かす ===")
    print("（Firestore にも GitHub にも1バイトも出ません）")
    gh = case1_open()
    gh = case2_same(gh)
    gh = case3_close(gh)
    gh = case4_stay_closed(gh)
    gh = case5_renamed(gh)
    case11_boundary()
    case12_unknown()
    case_pr()
    case7_read_not_write()
    case8_broken()
    case9_forbidden()
    case10_empty()
    case13_mention()
    print("\n[6の結果]")
    case6_grep()

    sys.stdout, sys.stderr = REAL_OUT, REAL_ERR
    print()
    if FAILED:
        print(f"✕ 通らなかった確かめ {len(FAILED)} 件: {', '.join(FAILED)}")
        return 1
    print("○ ぜんぶ通りました")
    return 0


if __name__ == "__main__":
    sys.exit(main())
