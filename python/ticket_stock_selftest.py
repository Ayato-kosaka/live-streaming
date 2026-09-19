"""毎週の棚卸しを、**こしらえた issue の一覧**で動かして確かめる。

    python3 python/ticket_stock_selftest.py

**GitHub に1バイトも出ない。** `Gh` は偽物に差し替えて回す。

終了コード 0=通った / 1=落ちた / **2=数えるものが無い**。

## いちばん大事なのは対照

棚卸しは、**何も見ていなくてもそれらしい本文を出せる。**
表の形さえ合っていれば、中身が空でも「まとめが出ています」と言える。
だから2つの壊し方を当てて、**別々に落ちる**ことを見る。

| 壊し方 | 落ちるはずのもの | 落ちてはいけないもの |
| --- | --- | --- |
| `nostale`（30日の線を外す） | 動いていないものが名指しされない | 待ちの相手は出たまま |
| `nolabel`（札を読まない） | 待ちの相手が出ない・メンションも消える | 動いていないものは出たまま |

**片方を外したときに両方落ちるなら、それは対照ではない**（どちらが効いて
いるのか分からない。`docs/island-misses.md` #128 の決めごと1）。

## 鳴らしかたも見る

本文を書き換えても通知は飛ばないので、鳴らすのはコメント。
**同じ週に2回走っても2回鳴らさない**ことまで見る（繋ぎ先が2本あるので、
同じ曜日に2回走ることが実際にある）。
"""

import sys

sys.path.insert(0, __file__.rsplit("/", 1)[0])

import ticket_stock as ts  # noqa: E402
from ticket_labels import (  # noqa: E402
    AFTER_TRIP, HANDLE, WAIT_AYATO, WAIT_US, mention_live,
)

TODAY = "2026-09-19"

FAILED = []
CHECKED = 0


def ok(cond: bool, what: str) -> None:
    global CHECKED
    CHECKED += 1
    print(f"  {'○' if cond else '✕'} {what}")
    if not cond:
        FAILED.append(what)


def issue(number, title, labels=(), created="2026-09-01", updated="2026-09-18",
          body="", state="open", pr=False, comments=0):
    """こしらえた issue 1本。GitHub が返すのと同じ形にする。"""
    d = {
        "number": number, "title": title, "state": state,
        "labels": [{"name": x} for x in labels],
        "created_at": f"{created}T00:00:00Z",
        "updated_at": f"{updated}T00:00:00Z",
        "comments": comments,
        "body": body,
    }
    if pr:
        d["pull_request"] = {"url": "…"}
    return d


# こしらえた一覧。**本番の値は1つも置かない。**
#  - 動いていないもの2本（100日・60日）
#  - あやと待ち2本・こちら待ち1本・旅のあと1本・札の無いもの1本
#  - pull request 1本（落ちるはず）
#  - 棚卸しそのもの1本（落ちるはず）
FAKE = [
    issue(3, "ずっと開いている", [WAIT_US], "2025-01-01", "2026-06-11"),   # 100日
    issue(11, "札が無くて、ずっと開いている", [], "2025-02-01", "2026-07-21"),  # 60日
    issue(100, "鍵を作り直してほしい", [WAIT_AYATO], "2026-09-10", "2026-09-18"),
    issue(101, "紐付けてほしい", [WAIT_AYATO], "2026-09-12", "2026-09-19"),
    issue(102, "こちらで直す", [WAIT_US], "2026-09-15", "2026-09-18"),
    issue(103, "旅が終わってから", [AFTER_TRIP], "2026-09-11", "2026-09-17"),
    issue(104, "まだ札を付けていない", [], "2026-09-16", "2026-09-18"),
    issue(200, "これは PR", [], "2026-09-18", "2026-09-18", pr=True),
    issue(300, "棚卸しそのもの", ["ticket-stock"], "2026-09-19", "2026-09-19",
          body=ts.MARK + "\n\n…"),
]


def read(breaks=(), said=None) -> tuple:
    """こしらえた一覧から、まとめの中身と本文を作る。"""
    s = ts.summarize(ts.survey(FAKE, TODAY, breaks, said), TODAY, breaks)
    return s, ts.body(s)


def has_stale(text: str) -> bool:
    """**動いていないものが名指しされているか**（30日の線が効いているか）。"""
    return "#3 " in text and "#11 " in text and f"{ts.STALE_DAYS}日以上" in text


def has_wait(s: dict, text: str) -> bool:
    """**待ちの相手が出ているか**（札を読めているか）。"""
    return (len(s["ayato"]) == 2
            and len(s["by_wait"][WAIT_US]) == 2
            and len(s["by_wait"][AFTER_TRIP]) == 1
            and "あやとの手が要るもの" in text
            and mention_live(text))


def case_survey() -> None:
    print("\n[1] 数えかた")
    s, text = read()
    ok(s["total"] == 7, f"PR と棚卸しそのものを落として7本（いま {s['total']}本）")
    ok(len(s["unlabeled"]) == 2, "札の無いものを2本として**出す**（黙って落とさない）")
    ok(sum(len(v) for v in s["by_wait"].values()) + len(s["unlabeled"]) == s["total"],
       "待ちの相手ごとの本数を足すと、開いている本数に戻る（分母が合う）")
    ok(all(f"#{n}" not in text for n in (200, 300)),
       "PR と棚卸しそのものが本文に出てこない")


def case_normal() -> None:
    print("\n[2] ふつうに回したとき、両方とも出る")
    s, text = read()
    ok(has_stale(text), f"{ts.STALE_DAYS}日以上動いていない2本が名指しされる")
    ok(has_wait(s, text), "待ちの相手が3つとも出て、飛ぶ形のメンションが入る")
    ok(HANDLE in text and mention_live(text),
       f"{HANDLE} が、囲いにも引用にも入らずに本文に在る")
    ok("#104" in text, "札が無いものは、付けてほしいものとして名指しされる")


def case_idle_is_not_updated_at() -> None:
    """**札を1枚付けただけで、放置が消えないこと。**

    2026-09-19 に25本へ札を付けたら、`updated_at` は25本とも今日になった。
    そこを数えていたら、588日と540日 放置されていた2本が**その場で
    「0日」**になる。片づけの操作で、片づいていないことが見えなくなる。
    """
    print("\n[2b] 放置の数えかた（updated_at を見ていないこと）")

    # 札を付けた直後のつもり。`updated_at` は全部きょう
    touched = [dict(i, updated_at=f"{TODAY}T00:00:00Z") for i in FAKE]
    s = ts.summarize(ts.survey(touched, TODAY), TODAY)
    ok([r["number"] for r in s["stale"]] == [3, 11],
       "札を付け替えても、放置されている2本はそのまま名指しされる")

    # **コメントが付いたら、そこで消える**（誰かが何か言ったということ）
    s2 = ts.summarize(ts.survey(FAKE, TODAY, (), {3: "2026-09-15T00:00:00Z"}),
                      TODAY)
    ok([r["number"] for r in s2["stale"]] == [11],
       "コメントが付いたものは、放置から外れる")


def case_break_nostale() -> None:
    print("\n[3] 対照・30日の線を外す（BREAK=nostale）")
    s, text = read({"nostale"})
    ok(not has_stale(text), "**鳴らなくなる**（動いていないものが1本も名指しされない）")
    ok(has_wait(s, text), "待ちの相手のほうは落ちない（ここだけが効いている）")


def case_break_nolabel() -> None:
    print("\n[4] 対照・札を読まない（BREAK=nolabel）")
    s, text = read({"nolabel"})
    ok(not has_wait(s, text), "**待ちの相手が出なくなる**（メンションも消える）")
    ok(not mention_live(text), "あやと待ちが0本になるので、呼びかけも消える")
    ok(has_stale(text), "動いていないもののほうは落ちない（ここだけが効いている）")


def case_ping_gate() -> None:
    print("\n[5] 鳴らしかた")
    ok(ts.last_ping_day([]) is None, "1度も鳴らしていなければ None")
    ok(ts.last_ping_day([{"body": "ふつうのコメント"},
                         {"body": f"{ts.PING_MARK} 2026-09-12 -->\n\n…"}])
       == "2026-09-12", "鳴らしたコメントから日付を拾う")
    ok(ts.last_ping_day([{"body": f"{ts.PING_MARK} こわれた -->"}]) is None,
       "日付が読めないコメントは数えない")
    ok(ts.ping_due(None, TODAY), "1度も鳴らしていなければ鳴らす")
    ok(not ts.ping_due("2026-09-18", TODAY), "きのう鳴らしたなら、今日は黙る")
    ok(ts.ping_due("2026-09-12", TODAY), "1週間前なら、また鳴らす")
    s, _ = read()
    ok(mention_live(ts.ping_body(s)), "鳴らすコメントも、飛ぶ形で書けている")


class FakeGh:
    """偽の GitHub。**どこにも出ない。** 何をしたかだけ控える。"""

    def __init__(self, issues, stock=None, comments=(), said=None):
        self._issues = issues
        self._stock = stock
        self._comments = list(comments)
        self._said = said or {}
        self.did = []

    def last_said(self, number):
        return self._said.get(number)

    def open_issues(self):
        return list(self._issues) + ([self._stock] if self._stock else [])

    def labeled(self, label):
        return [self._stock] if self._stock else []

    def comments(self, number):
        return list(self._comments)

    def create(self, title, text, label):
        self.did.append(("create", text))
        return {"number": 999}

    def patch(self, number, payload):
        self.did.append(("patch", payload))
        return {}

    def comment(self, number, text):
        self.did.append(("comment", text))
        return {}


def case_run() -> None:
    print("\n[6] 書きにいくところ（偽の GitHub）")
    rows = [i for i in FAKE if i["number"] != 300]

    # 1回目 … まとめがまだ無い。開くだけで、コメントは足さない
    gh = FakeGh(rows)
    got = ts.run(gh, TODAY, apply=True)
    ok([w for w, _ in gh.did] == ["create"],
       "まだ無ければ1本開く（開いた回はコメントを足さない）")
    ok(not got["pinged"], "開いた回は、本文のメンションで飛ぶので鳴らさない")
    ok(mention_live(gh.did[0][1]), "開くときの本文に、飛ぶ形のメンションが在る")

    # 2回目 … 在って、本文が古い。書き換えて、コメントで鳴らす
    stock = issue(300, ts.TITLE, ["ticket-stock"], "2026-09-01", "2026-09-12",
                  body=ts.MARK + "\n\nふるい")
    gh = FakeGh(rows, stock)
    got = ts.run(gh, TODAY, apply=True)
    ok([w for w, _ in gh.did] == ["patch", "comment"],
       "本文を書き換えて、コメントで鳴らす（書き換えだけでは飛ばないため）")
    ok(got["pinged"], "鳴らしたと言っている")

    # 3回目 … 同じ週にもう1回走った。**2回鳴らさない**
    gh = FakeGh(rows, stock,
                comments=[{"body": f"{ts.PING_MARK} {TODAY} -->"}])
    got = ts.run(gh, TODAY, apply=True)
    ok("comment" not in [w for w, _ in gh.did],
       "同じ週に2回走っても、2回目は鳴らさない")

    # 4回目 … あやと待ちが0本。**鳴らさない**
    quiet = [i for i in rows if WAIT_AYATO not in [x["name"] for x in i["labels"]]]
    gh = FakeGh(quiet, stock)
    got = ts.run(gh, TODAY, apply=True)
    ok("comment" not in [w for w, _ in gh.did],
       "あやと待ちが0本の週は鳴らさない")
    ok(not mention_live(got["body"]),
       "あやと待ちが0本なら、本文にも呼びかけを書かない")

    # 5回目 … `--apply` を付けていない。**1バイトも書かない。でも読みには行く**
    gh = FakeGh(rows, stock)
    got = ts.run(gh, TODAY, apply=False)
    ok(gh.did == [], "--apply が無ければ、書く口を1つも押さない")
    ok(got["action"] == "dry" and got["summary"]["total"] == 7,
       "書かなくても、読んで数えるところは通る")


def main() -> int:
    print("=== 毎週の棚卸しを、こしらえた一覧で動かして確かめる ===")
    print("（GitHub に1バイトも出ません）")
    case_survey()
    case_normal()
    case_idle_is_not_updated_at()
    case_break_nostale()
    case_break_nolabel()
    case_ping_gate()
    case_run()

    print()
    if CHECKED == 0:
        print("✕ 1件も見ていません（数えるものが無い）")
        return 2
    if FAILED:
        print(f"✕ {CHECKED}件中 {len(FAILED)}件 落ちました: {', '.join(FAILED)}")
        return 1
    print(f"○ {CHECKED}件ぜんぶ通りました"
          f"（2つの壊し方が、それぞれ別のものだけを落とすところまで見た）")
    return 0


if __name__ == "__main__":
    sys.exit(main())
