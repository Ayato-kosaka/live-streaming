"""偽の Firestore と偽の GitHub で、**呼び出しの映し方を実際に動かして確かめる。**

    python python/donor_calls_selftest.py

**本番には1バイトも出ない。** Firestore にも GitHub にも届かないし、
資格情報もネットワークも要らない（`donor_calls.py` が外に出る口は
`load_table(db)` と `Gh` の3つだけなので、そこを偽物に差し替える）。

確かめるのは8つ:

  1. 待ち **0人 → 1人** で issue が **1本**開く
  2. **2晩続けて 1人**でも issue は**増えない**（同じ1本のまま）。
     人数が変わった晩は**同じ1本の本文が書き換わる**
  3. **1人 → 0人**で、その issue が**閉じる**
  4. **0人のまま**は何も起きない（**閉じた issue を開け直さない**）
  5. 人が手で**タイトルを変えた**issue でも、見えない印で見つけて同じ1本を使う
  6. **本文にもログにも、名前・どねID・チャンネルIDが1文字も出ない**
     （0 を信じる前に、**仕込んだ字で探し方が当たること**を先に見る）
  7. `--apply` を付けないと **GitHub API を1回も叩かない**（呼ばれた回数 0）
  8. **歯止めを1つ外すと落ちる**（見つけ方をタイトル一致に戻すと、
     5 が 2本になる）

## 6 の測りかた

このリポジトリは公開で、Actions のログも issue も誰でも読める。
「出していないつもり」ではなく、**出たものを見る。**
`sys.stdout` と `sys.stderr` を二股にして出力を丸ごと溜め、最後にそこを探す。
**数え方は `tools/logident.py` に寄せる**（自前の正規表現を持つと探し方が
2つになり、片方を直し忘れたときに食い違う。`python/logsafe_selftest.py` と同じ）。

**回すあいだは `GITHUB_ACTIONS=true` を立てておく。** 毎晩これが走るのは
Actions の中で、公開のログに積まれるのはそのときの字だから。手元で回した
ときの字はどこにも残らないので、そちらを測っても公開の場の話にならない
（分け方が「本番かどうか」ではなく「公開の場に出るかどうか」である理由は
`python/logsafe.py` の docstring にある）。**消したのではなく振り分けた**
ことは 6b で別に見る。

ここは実際に1件捕まえている。日付が読めない書類を指す `logsafe.mask()` の
1行が、立てずに回すと どねID をそのまま出していた。

仕込む偽のデータは**本番と同じ形**にする。どねID は10桁、チャンネルIDは
`UC` + 22文字、ハンドルは `@…`。形が違うと、本番では効かない字を探して
「0件」と言うことになる（`docs/island-misses.md` #79）。

## 8 がなぜ要るか

落ちないテストは何も見ていない。5 は「タイトルを変えても同じ1本を使う」だが、
**見つけ方が壊れていても、たまたま1本のままなら通ってしまう。**
わざと見つけ方をタイトル一致に差し替えて、**そのとき確かに2本になる**ことを
見ておく。こうしておけば、5 の ○ は「見えない印で引けている」の証拠になる。
"""

import importlib.util
import io
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# 実際の出力を溜める袋。**donor_calls（＝basicConfig）を読み込む前に**
# 二股にしておく。logging のハンドラは作られた時点の stream を握る。
# `log` は stderr へ出るので、**両方**を溜める必要がある
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
os.environ.setdefault("BQ_PROJECT_ID", "donor-calls-selftest")

import donor_calls  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def _load_logident():
    """`tools/logident.py` を読み込む。**数え方はあちら1か所に寄せる。**"""
    path = os.path.join(ROOT, "tools", "logident.py")
    spec = importlib.util.spec_from_file_location("logident", path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


logident = _load_logident()

# ---------------------------------------------------------------- 偽のデータ

# **本番と同じ形**（どねID は10桁 / チャンネルIDは `UC` + 22文字 / `@…`）
PK_A = "1000000001"      # 紐付け待ちの人
PK_B = "1000000002"      # あとから増える紐付け待ちの人
PK_LINKED = "1000000003"  # もう紐付いている人
PK_UNLINKED = "1000000004"  # 表にはあるが YouTube が分からない人（数えない）
CID = "UCzzFAKE0000000000000001"
HANDLE = "@ふしぎな-fake1"
LABEL_A = "ふしぎな視聴者さん"
LABEL_B = "もうひとりの視聴者さん"

# 待ちが0人の晩。**表が空なのではない。** 紐付いている人と、
# 紐付いていないだけの人（`unlinked`）は入っている
T0 = {
    PK_LINKED: {"viewerPk": PK_LINKED, "handle": HANDLE, "channelId": CID,
                "label": LABEL_A, "state": "linked",
                "firstSeenAt": "2025-04-01T09:00:00+00:00"},
    PK_UNLINKED: {"viewerPk": PK_UNLINKED, "handle": None, "channelId": None,
                  "label": LABEL_B, "state": "unlinked",
                  "firstSeenAt": "2026-01-05T10:00:00+00:00"},
}

# 待ちが1人の晩
T1 = dict(T0, **{
    PK_A: {"viewerPk": PK_A, "handle": None, "channelId": None,
           "label": LABEL_A, "state": "new",
           # 22:05 JST（＝13:05 UTC）。日本時間では 9月10日
           "firstSeenAt": "2026-09-10T13:05:00+00:00",
           "updatedAt": "2026-09-11T22:41:00+00:00"},
})

# 待ちが2人の晩
T2 = dict(T1, **{
    PK_B: {"viewerPk": PK_B, "handle": None, "channelId": None,
           "label": LABEL_B, "state": "new",
           "firstSeenAt": "2026-06-02T11:20:00+00:00"},
})

# `firstSeenAt` も `updatedAt` も読めない書類。人数には入るが日付には入らない
T_BAD = dict(T0, **{
    PK_A: {"viewerPk": PK_A, "state": "new", "firstSeenAt": "きのう"},
})


# ---------------------------------------------------------------- 偽の口

class Snap:
    """DocumentSnapshot のかわり。"""

    def __init__(self, key, data):
        self.id = key
        self._d = data

    def to_dict(self):
        return dict(self._d)


class Col:
    def __init__(self, store, name):
        self.store, self.name = store, name

    def stream(self):
        for k, v in self.store.get(self.name, {}).items():
            yield Snap(k, v)


class FakeDb:
    """偽の Firestore。`islandDonors` だけ持つ。"""

    def __init__(self, donors: dict):
        self.store = {"islandDonors": donors}

    def collection(self, name):
        return Col(self.store, name)


class FakeGh:
    """偽の GitHub。**呼ばれた回数と、issue の本数を数える。**

    「増えていないか」は結果（開いている issue の数）だけでは言えない。
    1本消してもう1本立てても、開いている数は同じ 1 に見える。
    **立てた回数そのもの**を数える。
    """

    def __init__(self):
        self.issues: list = []
        self.calls = 0      # API を叩いた回数（`--apply` なしで 0 を見る）
        self.created = 0    # 立てた回数
        self.patched = 0    # 書き換えた回数
        self._next = 1

    def list_issues(self, label: str) -> list:
        self.calls += 1
        return [dict(i) for i in self.issues if label in i["labels"]]

    def create(self, title: str, text: str, label: str) -> dict:
        self.calls += 1
        self.created += 1
        i = {"number": self._next, "title": title, "body": text,
             "state": "open", "labels": [label]}
        self._next += 1
        self.issues.append(i)
        return dict(i)

    def patch(self, number: int, payload: dict) -> dict:
        self.calls += 1
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
                if donor_calls.MARK in (i.get("body") or "")]


def night(gh, donors: dict, apply: bool = True) -> dict:
    """1晩ぶん回す。**本番と同じ道**（読む → 数える → 合わせる）を通す。"""
    w = donor_calls.count_waiting(donor_calls.load_table(FakeDb(donors)))
    return donor_calls.run(gh, w, apply=apply)


# ---------------------------------------------------------------- 確かめる

FAILED: list = []


def ck(name: str, cond: bool, got) -> None:
    mark = "○" if cond else "✕"
    print(f"    {mark} {name}: {got}")
    if not cond:
        FAILED.append(name)


def case1_open():
    print("\n[1] 待ち 0人 → 1人 で、issue が1本開く")
    gh = FakeGh()

    r = night(gh, T0)
    ck("0人の晩にしたこと", r["action"] == "noop", r["action"])
    ck("立てた回数", gh.created == 0, gh.created)

    r = night(gh, T1)
    ck("1人になった晩にしたこと", r["action"] == "create", r["action"])
    ck("立てた回数", gh.created == 1, gh.created)
    ck("開いている issue の本数", len(gh.opened()) == 1, len(gh.opened()))
    ck("本文に人数が入っている", "**1人**" in gh.issues[0]["body"], "入っている")
    ck("本文に「いつから」が入っている（日本時間の日付）",
       "2026-09-10" in gh.issues[0]["body"], "入っている")
    ck("本文に見えない印が入っている",
       donor_calls.MARK in gh.issues[0]["body"], "入っている")
    return gh


def case2_same(gh):
    print("\n[2] 2晩続けて待ちがいても、issue は増えない")

    # まったく同じ晩。**本文が変わらないなら触らない**（毎晩「編集しました」を
    # 積まない）。増えていないことは「立てた回数」で言う
    r = night(gh, T1)
    ck("同じ1人のままの晩にしたこと", r["action"] == "noop", r["action"])
    ck("立てた回数（増えていない）", gh.created == 1, gh.created)
    ck("書き換えた回数（触っていない）", gh.patched == 0, gh.patched)
    ck("この仕組みが持つ issue の本数", len(gh.mine()) == 1, len(gh.mine()))

    # 人数が増えた晩。**同じ1本の本文が書き換わるだけ**
    r = night(gh, T2)
    ck("2人になった晩にしたこと", r["action"] == "update", r["action"])
    ck("立てた回数（やはり増えていない）", gh.created == 1, gh.created)
    ck("この仕組みが持つ issue の本数", len(gh.mine()) == 1, len(gh.mine()))
    ck("書き換わった人数", "**2人**" in gh.issues[0]["body"], "2人になった")
    ck("いちばん古い人の日付が前に出た",
       "2026-06-02" in gh.issues[0]["body"], "2026-06-02")
    ck("issue の番号が変わっていない", r["number"] == 1, r["number"])
    return gh


def case3_close(gh):
    print("\n[3] 待ちが 1人 → 0人 で、その issue が閉じる")
    r = night(gh, T0)
    ck("したこと", r["action"] == "close", r["action"])
    ck("閉じた issue の番号", r["number"] == 1, r["number"])
    ck("開いている issue の本数", len(gh.opened()) == 0, len(gh.opened()))
    ck("issue そのものは残っている（消していない）",
       len(gh.mine()) == 1, len(gh.mine()))
    return gh


def case4_stay_closed(gh):
    print("\n[4] 0人のままなら何も起きない（閉じた issue を開け直さない）")
    was = (gh.created, gh.patched)
    r = night(gh, T0)
    ck("したこと", r["action"] == "noop", r["action"])
    ck("立てた回数・書き換えた回数（どちらも増えない）",
       (gh.created, gh.patched) == was, (gh.created, gh.patched))
    ck("開いている issue の本数", len(gh.opened()) == 0, len(gh.opened()))

    # もう1晩置いても同じ
    night(gh, T0)
    ck("2晩置いても開いていない", len(gh.opened()) == 0, len(gh.opened()))
    return gh


def case5_renamed(gh):
    print("\n[5] 人がタイトルを変えても、見えない印で同じ1本を使う")
    # 人が手で書き換えた形。絵文字も足されている
    gh.issues[0]["title"] = "🔗 投げ銭の紐付け（あとでやる）"
    before = gh.issues[0]["number"]

    r = night(gh, T1)
    ck("したこと", r["action"] == "reopen", r["action"])
    ck("使った issue の番号（同じ1本）", r["number"] == before, r["number"])
    ck("立てた回数（増えていない）", gh.created == 1, gh.created)
    ck("この仕組みが持つ issue の本数", len(gh.mine()) == 1, len(gh.mine()))
    ck("開き直っている", len(gh.opened()) == 1, len(gh.opened()))
    ck("タイトルは人が付けたまま（戻していない）",
       gh.issues[0]["title"] == "🔗 投げ銭の紐付け（あとでやる）",
       "そのまま")
    return gh


def case_pr_and_bad():
    print("\n[5b] 紛れ込むもの（pull request・読めない日付）")
    gh = FakeGh()
    # `/issues` は pull request も返す。見えない印を持つ PR を混ぜておく。
    # 拾ってしまうと、PR の本文を毎晩書き換えにいくことになる
    gh.issues.append({
        "number": 99, "title": "呼び出しの仕組み", "state": "open",
        "labels": [donor_calls.LABEL],
        "body": "この PR で " + donor_calls.MARK + " を入れます",
        "pull_request": {"url": "…"},
    })
    r = night(gh, T1)
    ck("PR は使わず、新しく1本立てた", r["action"] == "create", r["action"])
    ck("使った番号が PR ではない", r["number"] != 99, r["number"])

    # 日付が読めない書類。**人数には入る**（用事は残っているから）
    gh2 = FakeGh()
    w = donor_calls.count_waiting(donor_calls.load_table(FakeDb(T_BAD)))
    ck("読めない日付でも人数に入る", w["n"] == 1, w["n"])
    ck("日付は入れない（嘘を置かない）", w["since"] is None, w["since"])
    r = night(gh2, T_BAD)
    ck("issue は立つ", r["action"] == "create", r["action"])
    ck("本文に「いつから」の行が無い",
       "から待っています" not in gh2.issues[0]["body"], "無い")


def case7_no_apply():
    print("\n[7] --apply を付けないと、GitHub API を1回も叩かない")
    gh = FakeGh()
    r = night(gh, T2, apply=False)
    ck("API を叩いた回数", gh.calls == 0, gh.calls)
    ck("立てた回数", gh.created == 0, gh.created)
    ck("書き換えた回数", gh.patched == 0, gh.patched)
    ck("したこと", r["action"] == "dry", r["action"])

    # 数えるほうは動いている（黙って 0 を返しているのではない）
    w = donor_calls.count_waiting(donor_calls.load_table(FakeDb(T2)))
    ck("数えるほうは動いている", w["n"] == 2, w["n"])


def case8_broken():
    """**歯止めを1つ外すと落ちることを見せる。**

    5 の「タイトルを変えても同じ1本」を、見つけ方をタイトル一致に
    差し替えて回す。**そのとき確かに2本になる**なら、5 の ○ は
    「見えない印で引けている」の証拠になる。
    """
    print("\n[8] 歯止めを外すと落ちる（見つけ方をタイトル一致に戻す）")
    gh = FakeGh()
    night(gh, T1)                       # 1本立つ
    gh.issues[0]["title"] = "🔗 投げ銭の紐付け（あとでやる）"  # 人が書き換える

    real = donor_calls.find_issue

    def by_title(issues, mark=donor_calls.MARK):
        """外した歯止め: タイトルの一致で探す（人が変えたら見失う）。"""
        for i in issues:
            if i.get("title") == donor_calls.TITLE:
                return i
        return None

    donor_calls.find_issue = by_title
    try:
        night(gh, T1)
    finally:
        donor_calls.find_issue = real

    ck("外したら立てた回数が2になる", gh.created == 2, gh.created)
    ck("外したら issue が2本に増える", len(gh.mine()) == 2, len(gh.mine()))

    # 戻したら1本のまま（差し替えが残っていないことの確認）
    gh2 = FakeGh()
    night(gh2, T1)
    gh2.issues[0]["title"] = "🔗 投げ銭の紐付け（あとでやる）"
    night(gh2, T1)
    ck("戻したら1本のまま", len(gh2.mine()) == 1, len(gh2.mine()))


def case6_grep():
    """**出た字を探す。** 袋を読むので、ほかの確かめのあとに回す。

    見るのは2つ。**issue の本文**（公開）と、**ログ**（Actions は公開）。
    """
    print("\n[6] 本文にもログにも、名前・どねID・チャンネルIDが1文字も出ない")

    # **先に、探し方が当たることを見る。** 正規表現が壊れていれば、
    # 何が出ていても「0件」と言える。0 を信じる前に、仕込んだ字で当てる
    bait = f"{CID} / {HANDLE} / {PK_A} / {LABEL_A}"
    got = logident.count(bait)
    ck("探し方が当たる — チャンネルID", got["channel_id"] > 0, got["channel_id"])
    ck("探し方が当たる — ハンドル", got["handle"] > 0, got["handle"])
    ck("探し方が当たる — どねID", got["doneru_id"] > 0, got["doneru_id"])
    # 表示名は `logident` の守備範囲の外（形が決まっていない）。名指しで探す
    ck("探し方が当たる — 表示名", LABEL_A in bait, "当たる")

    # issue の本文。**公開の場に残るのはこちらが先**
    gh = FakeGh()
    night(gh, T2)
    night(gh, T1)
    text = "\n".join(i["body"] for i in gh.issues)
    n = logident.count(text)
    for k in logident.KINDS:
        ck(f"本文に出た数 — {k}", n[k] == 0, n[k])
    ck("本文に表示名が出ていない",
       LABEL_A not in text and LABEL_B not in text, "0 件")
    print(f"    （見た本文は {len(text)} 文字）")

    # ログ。ここまでの出力を丸ごと見る。**仕込んだ偽のデータそのもの**が
    # 並んでいるこのファイルの中身は数えない（袋に入っているのは出力だけ）
    log = BUF.getvalue().split("[6の結果]")[0]
    n = logident.count(log)
    for k in logident.KINDS:
        ck(f"ログに出た数 — {k}", n[k] == 0, n[k])
    ck("ログに表示名が出ていない",
       LABEL_A not in log and LABEL_B not in log, "0 件")
    print(f"    （見たログは {len(log)} 文字）")


def case6b_mask():
    """**消したのではなく、振り分けたこと**まで見る。

    6 の「0件」は、ログをまるごと出さなくしても同じ顔で通る。
    それだと手元で回したときに何も分からなくなる。
    日付が読めない書類を指す1か所（`logsafe.mask`）が、
    **公開では指紋・手元ではそのまま**になることを両方向で見る。
    """
    print("\n[6b] 消したのではなく、振り分けている（logsafe.mask）")
    os.environ["GITHUB_ACTIONS"] = "true"
    pub = f"待っている人の日付が読めません: {donor_calls.mask(PK_A)}"
    same = donor_calls.mask(PK_A)
    other = donor_calls.mask(PK_B)
    os.environ.pop("GITHUB_ACTIONS", None)
    hand = f"待っている人の日付が読めません: {donor_calls.mask(PK_A)}"

    ck("公開の場では出ない", sum(logident.count(pub).values()) == 0,
       sum(logident.count(pub).values()))
    ck("公開の場でも同じ人は同じ字", donor_calls.mask(PK_A, public=True) == same,
       "同じ")
    ck("違う人は違う字", same != other, "違う")
    ck("手元では出る（消していない）",
       sum(logident.count(hand).values()) > 0,
       sum(logident.count(hand).values()))
    # 戻しておく。この確かめだけのために外した
    os.environ["GITHUB_ACTIONS"] = "true"


def main() -> int:
    # **毎晩これが走るのは Actions の中。** 公開のログに積まれるのはそのときの
    # 字なので、同じ条件で回して、その出力を 6 で数える
    os.environ["GITHUB_ACTIONS"] = "true"
    print("=== 偽の Firestore と偽の GitHub で、呼び出しの映し方を動かす ===")
    print("（Firestore にも GitHub にも1バイトも出ません）")
    gh = case1_open()
    gh = case2_same(gh)
    gh = case3_close(gh)
    gh = case4_stay_closed(gh)
    gh = case5_renamed(gh)
    case_pr_and_bad()
    case7_no_apply()
    case8_broken()
    print("\n[6の結果]")
    case6_grep()
    case6b_mask()

    sys.stdout, sys.stderr = REAL_OUT, REAL_ERR
    print()
    if FAILED:
        print(f"✕ 通らなかった確かめ {len(FAILED)} 件: {', '.join(FAILED)}")
        return 1
    print("○ ぜんぶ通りました")
    return 0


if __name__ == "__main__":
    sys.exit(main())
