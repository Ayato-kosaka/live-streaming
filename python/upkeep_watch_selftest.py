"""偽の GitHub で、**人の手入れ待ちだけを札に映せているか**を動かして確かめる。

    python3 python/upkeep_watch_selftest.py

終了コード 0=ぜんぶ通った / 1=外したものがある。

**本番には1バイトも出ない。** GitHub に届かないし、資格もネットワークも要らない
（`upkeep_watch.py` が外に出る口は `Gh` の数本だけなので、そこを偽物に差し替える）。

確かめるのは:

  1. **人の持ち分が赤 → 区画に出る**
  2. **機械の持ち分が赤 → 区画に出ない**（ここが抜けると、また全部が1本に混ざる）
  3. ①b（機械/上流が人）は、**上流も赤いときだけ**整備へ出る
  4. 章が進んで空いた欄が出る（着いた日・歩いた国・滞在日数）。**急ぐ／急がないが分かれる**
  5. **0件のときは「ありません」と、測った日**が出る（区画を空にしない）
  6. **人が手で書いた本文が消えない**（印の外を1文字も触らない）
  7. **`--apply` 無しでは1バイトも書かない**（読みには毎回行く）
  8. 書く先が違う／閉じている／札が無いときは**書かない**
  9. **数えられない回は、区画を書き換えない**（「ありません」で上書きしない）
 10. **届かなかったら 1 で落ちる**。手入れが溜まっているだけでは落ちない
 11. **わざと壊すと赤くなる**（振り分けを潰す・引き金を外す・印を変える）
 12. **本番の `site/content` を食わせて、いま何件出るかを印字する**
 13. **ワークフローの YAML と突き合わせる**（繋ぎ先の名前・権限・見張りの置き場）

そのあとに、**本文にもログにも視聴者さんの素性が1文字も出ない**ことを数える。

## 1 と 2 が、この確かめの本体

2026-09-29 からの12晩で分かったのは、**4本の赤のうち人待ちは1本だけ**だった
ということ。混ぜて1本の札に出すと、読む人は毎朝「自分の出番が無い一覧」を
見ることになって、そのうち見なくなる（`#511` が16日かけてそうなった）。

だから 2（機械の赤が**出ない**こと）を、1 と同じ重さで踏む。
**出るほうだけ確かめても、分けたことにならない。**

## 12 がなぜ要るか

仕込みの字だけで回すと、**本番の書き方が変わった日に、対照のほうが先に
易しくなる**（`python/ts_read_selftest.py` と同じ理由）。だから本番の
`site/content` をそのまま食わせて、

- いま数えられること（`blind` が 0 本）
- いま何件出るか

を印字する。**件数そのものは合否にしない**——人が欄を埋めれば減るのが正しい。
代わりに、**本番の焼き込みを「ずっと先の日」で測って**、人持ちの赤が整備へ、
機械持ちの赤が仕組みへ振り分けられることを見る。こちらは本番のデータを
使いながら、人が欄を埋めても動かない。
"""

from __future__ import annotations

import importlib.util
import io
import os
import sys
import urllib.error
from datetime import date
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# 実際の出力を溜める袋。**upkeep_watch（＝basicConfig）を読み込む前に**差し替える
REAL_OUT, REAL_ERR = sys.stdout, sys.stderr
BUF = io.StringIO()


class Tee:
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

import stale_content_watch as stale  # noqa: E402
import upkeep_watch as uw  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
CONTENT = ROOT / "site" / "content"

# この係のワークフロー。13 で、中の繋ぎ先と step の並びを読む
SELF_YML = "upkeep_watch.yml"


def _load_logident():
    """`tools/logident.py` を読み込む。**数え方はあちら1か所に寄せる。**"""
    path = ROOT / "tools" / "logident.py"
    spec = importlib.util.spec_from_file_location("logident", path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


logident = _load_logident()

# 偽の資格。**ログに出ない形のものを置く**（出たら最後の数えで拾われる）
FAKE_REPO = "example-owner/example-repo"
FAKE_TOKEN = "fake-token-for-selftest"

TODAY = date(2026, 10, 3)

# 人が手で書いた本文。**ここが1文字でも動いたら落とす**
HAND = """## このチケットは閉じない

旅がつぎの国へ移ったら、島のあちこちに手入れが要る。
あやと 2026-10-03「アルバニア島って名前だけど次いく国に合わせて場しょ名変える」。

| いつ | 何を |
| --- | --- |
| 着いた日 | `chapters.ts` の `from` |
| 旅が終わった | `countries` |
"""


# ---------------------------------------------------------------- 仕込みの焼き込み

def _ts(dates: list[str]) -> str:
    """日付だけ持った焼き込みの字。**文字列の中に置く**（コメントは数えられない）。"""
    body = ", ".join(f'"{d}"' for d in dates)
    return f"export const X = [{body}];\n"


# 仕込みの国の表。**閉じた滞在と、開いた滞在の両方**を持たせる。
# `sweden` は「いまもここにいる」（`to` が空）の形で、2026-10-06 の本番がこれ
COUNTRIES_OK = """export const COUNTRIES: Country[] = [
  {
    slug: "poland",
    name: "ポーランド",
    /* 読みにくい形をわざと残す。本番がこうなっている（注釈が欄に挟まる） */
    stays: [{ from: "2026-09-12", to: "2026-09-13", cities: ["ワルシャワ"] }],
    summary: "to: \\"2099-01-01\\" と本文に書いてあっても、欄ではない",
  },
  {
    slug: "sweden",
    name: "スウェーデン",
    stays: [{ from: "2026-09-20", to: "2026-09-27", cities: ["ストックホルム"] }],
  },
  {
    slug: "albania",
    name: "アルバニア",
    stays: [{ from: "2026-09-28", to: "", cities: ["ティラナ"] }],
  },
];
"""

# **閉じた章の国が、開いたまま**（2026-10-06 の本番がこれ）。
# アルバニアの配信11本が「スウェーデン」として焼かれていた形
COUNTRIES_SWEDEN_OPEN = COUNTRIES_OK.replace(
    'stays: [{ from: "2026-09-20", to: "2026-09-27", cities: ["ストックホルム"] }],',
    'stays: [{ from: "2026-09-20", to: "", cities: ["ストックホルム"] }],')

# **いまの章（albania）の滞在がどこにも無い**
COUNTRIES_NO_ALBANIA = COUNTRIES_OK.replace(
    '  {\n    slug: "albania",\n    name: "アルバニア",\n'
    '    stays: [{ from: "2026-09-28", to: "", cities: ["ティラナ"] }],\n  },\n', "")

# 国を読み落とす字（入れ子の中に国を書く）。**数えられない回**をこしらえる
COUNTRIES_MISSED = """export const COUNTRIES: Country[] = [
  { slug: "poland", name: "ポーランド", stays: [{ from: "2026-09-12", to: "2026-09-13" }],
    near: [{ slug: "ghost" }] },
];
"""

# 仕込みの年表（`/about` の `STORY`）。**いまの章の行が無い**側。
# 2026-10-06 の本番がこれで、いちばん下の節目が 2026-09-12 のまま24日止まっていた
ABOUT_NO_NOW = """const STORY: Step[] = [
  {
    date: on("georgia"),
    kind: "travel",
    what: "ジョージアに着いた",
  },
  {
    date: chapterFrom("nordic"),
    kind: "travel",
    what: "ジョージアを出て、北欧へ発った",
  },
];
"""

# いまの章の行が**章から**引いてある形（**既定**。埋まっている側）
ABOUT_FULL = ABOUT_NO_NOW.replace(
    "];\n", '  {\n    date: chapterFrom("albania"),\n    kind: "travel",\n'
            '    what: "アルバニアに着いた",\n  },\n];\n')

# いまの章の行が**日付そのもの**で置いてある形（章の slug は出てこない）
ABOUT_BY_DATE = ABOUT_NO_NOW.replace(
    "];\n", '  {\n    date: "2026-09-29",\n    kind: "travel",\n'
            '    what: "アルバニアに着いた",\n  },\n];\n')

# 仕込みの `site/lib/place.ts`。**数は1か所**（ここと画面が同じ境目を持つ）
PLACE_TS_SRC = """// いまどこの便りが、何日たったら「いま」ではなくなるか
export const PLACE_STALE_DAYS = 7;
"""


def make_state(updatedAt: str = "2026-10-02",
               week: list[str] | None = None) -> uw.StateRead:
    """仕込みの島の便り。**口は叩かない。**

    毎 PR で回る対照を本番の口に繋ぐと、本番が返らない日に関係のない PR が
    赤くなる（`python/watch_excuses.py` の `cardgo.mjs` と同じ理由）。
    """
    return uw.StateRead(current={
        "updatedAt": updatedAt,
        "week": ["10/4 ティラナを歩く", "回る先はこれから"] if week is None else week,
    })


# **口を叩かない。** 本物の `fetch_state` をここで塞ぐ。
# `count()` は `state` を渡さなければ口を叩きにいく作りなので、渡し忘れた
# 確かめが1つでもあると、**毎 PR の対照が本番の口に繋がる**（本番が返らない日に、
# 関係のない PR が赤くなる。`python/watch_excuses.py` の `cardgo.mjs` と同じ理由）。
# 塞いでおけば、渡し忘れても外には出ない
REAL_FETCH = uw.fetch_state
uw.fetch_state = lambda *a, **k: make_state()


def make_content(tmp: Path, *, voices: str = "2026-10-01",
                 shorts: str = "2026-10-01",
                 recipes: str = "2026-10-01",
                 kitchen_keys: list[str] | None = None,
                 chapters: str | None = None,
                 countries: str | None = None,
                 about: str | None = None,
                 place: str | None = None,
                 itinerary: str = "") -> Path:
    """`BOOKS` の表どおりに `*.ts` を並べた置き場をこしらえる。

    **表に在る本を1本も欠かさない。** 欠けると `judge()` が「置き場にありません」
    で `blind` を立てて、数えられなくなる（それ自体は正しい挙動なので、
    別の確かめで踏む）。

    章のほかに引き金が見るもの（国の表・年表・`PLACE_STALE_DAYS`）も、
    同じ木の下に置く。`count()` は `site` の下から `app/about/page.tsx` と
    `lib/place.ts` を引くので、**置き場の親が `site` になる。**
    """
    d = tmp / "content"
    d.mkdir(parents=True, exist_ok=True)
    (tmp / "app" / "about").mkdir(parents=True, exist_ok=True)
    (tmp / "app" / "about" / "page.tsx").write_text(
        ABOUT_FULL if about is None else about, encoding="utf-8")
    (tmp / "lib").mkdir(parents=True, exist_ok=True)
    (tmp / "lib" / "place.ts").write_text(
        PLACE_TS_SRC if place is None else place, encoding="utf-8")
    if itinerary:
        # 旅程（`site/content/<章の slug>.ts`）。在れば、その章の滞在は
        # `countries.ts` に無くてよい
        (d / f"{itinerary}.ts").write_text(_ts(["2026-09-28"]), encoding="utf-8")

    recipe_keys = ["gyoza", "carbonara"]
    kitchen_keys = recipe_keys if kitchen_keys is None else kitchen_keys

    # **並びの名前は本物に合わせる**（`stale_content_watch.KEY_OF`）。
    # 鍵を読むのは `ts_read` で、**どの並びから取るかを名前で決めている**ので、
    # 名前が違うと「鍵が0件」で数えられなくなって、確かめたいところまで届かない。
    # 名前で決めているのは、字下げの深さで決めると行の折り方が変わった日に
    # 黙って読めなくなるから（`python/ts_read.py` の頭）
    special = {
        # 人が書く本。日で見る（`LATEST`）
        "voices.ts": _ts([voices]),
        "recipes.ts": "export const RECIPES = [\n"
                      + "".join(f'  {{\n    slug: "{k}",\n    day: "{recipes}",\n  }},\n'
                               for k in recipe_keys)
                      + "];\n",
        # 機械が焼く本。日で見る
        "shorts.ts": _ts([shorts]),
        # ①b。上流は `recipes.ts`
        "kitchenTalk.ts": "const KITCHEN_TALK = {\n"
                          + "".join(f'  "{k}": {{}},\n' for k in kitchen_keys)
                          + "};\n",
        "legends.ts": 'export const LEGENDS = [\n  {\n    slug: "first",\n'
                      '    day: "2026-10-01",\n  },\n];\n',
        "legendDays.ts": 'const LEGEND_DAYS = {\n  "first": {},\n};\n',
        # 名簿と、そこから焼かれる箱・セリフ
        "residents.ts": 'export const RESIDENTS = [\n  { icon: "a", n: 1 },\n'
                        '  { icon: "b", n: 2 },\n];\n',
        "characterBox.ts": 'const BOX = {\n  "a": [0],\n  "b": [0],\n};\n',
        "chatter.ts": 'export const VOICES = [\n  {\n    icon: "a",\n  },\n'
                      '  {\n    icon: "b",\n  },\n];\n',
        "chapters.ts": CHAPTERS_OK if chapters is None else chapters,
        "countries.ts": COUNTRIES_OK if countries is None else countries,
        # 先ぶんの表。章 `nordic` が終わっているので、最終日まで在れば緑
        "nordic.ts": _ts(["2026-09-12", "2026-09-27"]),
        "nordicSun.ts": _ts(["2026-09-12", "2026-09-27"]),
        # 旅ごとに取り直す写し（`SNAP`）。終わった旅のうちに取ってある
        "nordicShops.ts": _ts(["2026-09-13"]),
        # 章を持たない先ぶんの表（`COVERS` / `ENDLESS`）。先の予定が1件は要る
        "plans.ts": _ts(["2026-10-01", "2026-12-24"]),
    }
    for name in stale.BOOKS:
        if name in special:
            (d / name).write_text(special[name], encoding="utf-8")
        else:
            # 残りは「今日の日付を1つ持った本」。どの見かたでも緑になる
            (d / name).write_text(_ts(["2026-10-01"]), encoding="utf-8")
    return d


# 仕込みの章。**本番と同じ形**（`slug:` と `name:` のあいだにコメントを挟む）
CHAPTERS_OK = """export const CHAPTERS: Chapter[] = [
  {
    slug: "nordic",
    /* 読みにくい形をわざと残す。本番がこうなっている */
    name: "北欧",
    from: "2026-09-12",
    to: "2026-09-27",
    countries: ["poland", "sweden"],
    opensAt: "2026-09-11T23:30:00+04:00",
    plannedDays: 17,
  },
  {
    slug: "albania",
    name: "アルバニア",
    from: "2026-09-28",
    to: "",
    countries: [],
    opensAt: "2026-09-28T00:00:00+09:00",
    plannedDays: 9,
  },
];
"""

# **着いたのに `from` が空**（2026-09-29 からの5晩がこの形）
CHAPTERS_NO_FROM = CHAPTERS_OK.replace(
    '    slug: "albania",\n    name: "アルバニア",\n    from: "2026-09-28",',
    '    slug: "albania",\n    name: "アルバニア",\n    from: "",')

# **旅が終わったのに歩いた国が空**
CHAPTERS_NO_COUNTRIES = CHAPTERS_OK.replace(
    '    countries: ["poland", "sweden"],', "    countries: [],")

# **いまの章に滞在日数が無い**（いまの本番がこれ）
CHAPTERS_NO_DAYS = CHAPTERS_OK.replace("    plannedDays: 9,\n", "")

# 章を読み落とす字（入れ子の中に章を書く）。**数えられない回**をこしらえる
CHAPTERS_MISSED = """export const CHAPTERS: Chapter[] = [
  { slug: "alpha", name: "ひとつめ", from: "2026-01-01", to: "2026-01-10",
    countries: ["x"], extra: [{ slug: "ghost" }] },
];
"""


# ---------------------------------------------------------------- 偽の GitHub

class FakeGh:
    """偽の GitHub。**読んだ回数と書いた回数を別々に数える。**

    `--apply` なしの朝に見たいのは「1バイトも触っていない」ではなく
    **「読んだが書いていない」**なので、分けて数える。
    """

    def __init__(self, body: str = HAND, state: str = "open",
                 labels=(uw.ISSUE_LABEL,), pr: bool = False):
        self.issues = {uw.ISSUE_NUMBER: {
            "number": uw.ISSUE_NUMBER, "title": "【整備・常設】旅がつぎの国へ移ったときの手入れ",
            "state": state, "labels": [{"name": n} for n in labels], "body": body,
            **({"pull_request": {"url": "…"}} if pr else {}),
        }}
        self.gets = 0
        self.patched = 0

    def issue(self, number: int) -> dict:
        self.gets += 1
        if number not in self.issues:
            raise urllib.error.HTTPError(
                "https://api.github.com/repos/…/issues/…", 404, "Not Found", {}, None)
        return dict(self.issues[number])

    def patch(self, number: int, payload: dict) -> dict:
        self.patched += 1
        self.issues[number].update(payload)
        return dict(self.issues[number])

    # ---- 覗き口

    def body(self) -> str:
        return self.issues[uw.ISSUE_NUMBER]["body"]

    def inside(self) -> str:
        """区画の中だけ。印が無ければ空。"""
        b = self.body()
        a, e = b.find(uw.BEGIN), b.find(uw.END)
        return "" if a < 0 or e < a else b[a + len(uw.BEGIN):e]

    def outside(self) -> str:
        """区画の外だけ。**ここが動いたら、人の書いたものを壊している。**"""
        b = self.body()
        a, e = b.find(uw.BEGIN), b.find(uw.END)
        return b if a < 0 else b[:a] + b[e + len(uw.END):]


class Gh404:
    """**読みにいくと 404 を返す**偽の GitHub（札が消えた形）。"""

    def __init__(self):
        self.gets = 0

    def issue(self, number: int) -> dict:
        self.gets += 1
        raise urllib.error.HTTPError(
            "https://api.github.com/repos/…/issues/…", 404, "Not Found", {}, None)

    def patch(self, *a, **k):
        raise AssertionError("読めていないのに書きにいった")


# ---------------------------------------------------------------- 回す

def act(gh, apply: bool = False, d: Path | None = None, today: date = TODAY) -> int:
    """`upkeep_watch.act()` を、偽の GitHub と偽の資格で回して終了コードを取る。"""
    real = uw.Gh
    uw.Gh = lambda repo, token: gh
    os.environ["GITHUB_REPOSITORY"] = FAKE_REPO
    os.environ["GITHUB_TOKEN"] = FAKE_TOKEN
    try:
        return uw.act(apply, d if d is not None else CONTENT, today)
    finally:
        uw.Gh = real
        os.environ.pop("GITHUB_REPOSITORY", None)
        os.environ.pop("GITHUB_TOKEN", None)


def said_while(fn):
    """`fn()` を回しているあいだに出た字だけを切り出す。"""
    mark = len(BUF.getvalue())
    got = fn()
    return got, BUF.getvalue()[mark:]


FAILED: list = []


def ck(name: str, cond: bool, got) -> None:
    mark = "○" if cond else "✕"
    print(f"    {mark} {name}: {got}")
    if not cond:
        FAILED.append(name)


# ---------------------------------------------------------------- 確かめる

def case1_human(tmp: Path):
    """**人の持ち分が赤 → 区画に出る。**"""
    print("\n[1] 人の持ち分が赤 → 区画に出る")
    # `voices.ts` は 人 / LATEST / 60日。200日前に倒す
    d = make_content(tmp / "c1", voices="2026-03-01")
    c = uw.count(d, TODAY)
    ck("数えられた（blind 0本）", c.countable, c.blind or "0本")
    ck("急ぐ側に1件出る", len(c.urgent) == 1, c.urgent)
    ck("出たのは voices.ts", "voices.ts" in "".join(c.urgent), c.urgent)
    ck("仕組みの側へは回っていない", len(c.system) == 0, c.system)
    ck("本文にファイルの道がそのまま出る",
       "`site/content/voices.ts`" in "".join(c.urgent), "出る")

    gh = FakeGh()
    act(gh, apply=True, d=d)
    ck("区画に出ている", "voices.ts" in gh.inside(), "出ている")


def case2_machine(tmp: Path):
    """**機械の持ち分が赤 → 区画に出ない。** ここが抜けると全部が1本に混ざる。"""
    print("\n[2] 機械の持ち分が赤 → 区画に出ない")
    # `shorts.ts` は 機械 / LATEST / 90日。200日前に倒す
    d = make_content(tmp / "c2", shorts="2026-03-01")
    c = uw.count(d, TODAY)
    ck("数えられた", c.countable, c.blind or "0本")
    ck("仕組みの側に1件回った", len(c.system) == 1, c.system)
    ck("回ったのは shorts.ts", "shorts.ts" in "".join(c.system), "shorts.ts")
    ck("**急ぐにも急がないにも出ない**", c.waiting == 0, c.waiting)

    gh = FakeGh()
    act(gh, apply=True, d=d)
    ck("**区画に shorts.ts が出ない**", "shorts.ts" not in gh.inside(), "出ない")
    ck("区画は「ありません」になる", "ありません" in gh.inside(), "なる")

    # 人と機械が同じ回に赤い朝。**人のぶんだけ出る**
    d2 = make_content(tmp / "c2b", shorts="2026-03-01", voices="2026-03-01")
    c2 = uw.count(d2, TODAY)
    ck("両方赤い朝 — 急ぐ", len(c2.urgent) == 1, c2.urgent)
    ck("両方赤い朝 — 仕組み", len(c2.system) == 1, c2.system)
    ck("両方赤い朝 — 区画に機械は出ない",
       "shorts.ts" not in "".join(c2.urgent + c2.later), "出ない")


def case3_upstream(tmp: Path):
    """**①b は、上流（人の表）も赤いときだけ整備へ。**"""
    print("\n[3] ①b（機械/上流が人）の振り分け")
    # (a) `kitchenTalk.ts` に上流の品が無い。上流（`recipes.ts`）は新しい
    d = make_content(tmp / "c3a", kitchen_keys=["gyoza"])
    c = uw.count(d, TODAY)
    ck("(a) 上流が新しいときは仕組みへ", "kitchenTalk.ts" in "".join(c.system), c.system)
    ck("(a) 区画には出ない", c.waiting == 0, c.waiting)

    # (b) 上流（`recipes.ts`）も同じ回で赤い。**人の手が先に止まっている**
    d = make_content(tmp / "c3b", kitchen_keys=["gyoza"], recipes="2026-03-01")
    c = uw.count(d, TODAY)
    joined = "".join(c.urgent + c.later)
    ck("(b) 上流も赤いときは整備へ", "kitchenTalk.ts" in joined, c.urgent)
    ck("(b) 上流そのものも整備に出る", "recipes.ts" in joined, "出る")

    # 素の関数としても両側を踏む（表を差し替えられる形になっているか）
    ck("side_of — 上流が緑なら仕組み",
       uw.side_of("kitchenTalk.ts", {"kitchenTalk.ts"}) == uw.SYSTEM, uw.SYSTEM)
    ck("side_of — 上流も赤なら整備",
       uw.side_of("kitchenTalk.ts", {"kitchenTalk.ts", "recipes.ts"}) == uw.UPKEEP,
       uw.UPKEEP)
    ck("side_of — 外の地図は整備（誰も回さない）",
       uw.side_of("nordicShops.ts", {"nordicShops.ts"}) == uw.UPKEEP, uw.UPKEEP)
    ck("side_of — 導出は仕組み",
       uw.side_of("walked.ts", {"walked.ts"}) == uw.SYSTEM, uw.SYSTEM)


def case4_chapters(tmp: Path):
    """**章が進んで空いた欄。** 急ぐ／急がないが分かれる。"""
    print("\n[4] 章が進んで空いた欄（急ぐ／急がない）")

    d = make_content(tmp / "c4a", chapters=CHAPTERS_NO_FROM)
    c = uw.count(d, TODAY)
    ck("着いたのに from が空 → 1件", c.waiting == 1, (c.urgent, c.later))
    ck("**急ぐ側に出る**", len(c.urgent) == 1 and "`from`" in c.urgent[0], c.urgent)
    ck("どの章のどの欄かが出る",
       "albania" in c.urgent[0] and "chapters.ts" in c.urgent[0], c.urgent[0])
    ck("何を入れるかが出る", "着いた日" in c.urgent[0], "出る")

    d = make_content(tmp / "c4b", chapters=CHAPTERS_NO_COUNTRIES)
    c = uw.count(d, TODAY)
    ck("終わった章の countries が空 → 急がない側",
       len(c.later) == 1 and "countries" in c.later[0], (c.urgent, c.later))
    ck("終わっていない章（albania）の空の countries は数えない",
       "albania" not in "".join(c.later), "数えない")

    d = make_content(tmp / "c4c", chapters=CHAPTERS_NO_DAYS)
    c = uw.count(d, TODAY)
    ck("いまの章に plannedDays が無い → 急がない側",
       len(c.later) == 1 and "plannedDays" in c.later[0], (c.urgent, c.later))

    # 全部埋まっていれば0件
    c = uw.count(make_content(tmp / "c4d"), TODAY)
    ck("ぜんぶ埋まっていれば0件", c.waiting == 0, (c.urgent, c.later))

    # **引き金は1行で足せる形か**（表を差し替えて見る）
    extra = uw.Trigger("仕込み", True,
                       lambda w: [uw.Gap("`どこか`", "なにか", True)])
    real = uw.TRIGGERS
    try:
        uw.TRIGGERS = real + (extra,)
        c = uw.count(make_content(tmp / "c4e"), TODAY)
    finally:
        uw.TRIGGERS = real
    ck("引き金を1行足すと、その件数が増える", c.waiting == 1, c.urgent)


def case5_zero(tmp: Path):
    """**0件のときは「ありません」と、測った日。** 区画を空にしない。"""
    print("\n[5] 0件のときは「ありません」と、測った日")
    d = make_content(tmp / "c5")
    c = uw.count(d, TODAY)
    ck("手入れ待ち0件", c.waiting == 0, c.waiting)

    gh = FakeGh()
    act(gh, apply=True, d=d)
    inside = gh.inside()
    ck("区画が空ではない", len(inside.strip()) > 0, f"{len(inside)}文字")
    ck("「ありません」と書いてある", "手入れ待ちはありません" in inside, "書いてある")
    ck("測った日が入っている", "2026-10-03" in inside, "入っている")
    ck("見出しが入っている", "いま手入れを待っているもの" in inside, "入っている")


def case6_hand(tmp: Path):
    """**人が手で書いた本文が消えない。** 印の外を1文字も触らない。"""
    print("\n[6] 人が手で書いた本文が消えない")
    d = make_content(tmp / "c6", voices="2026-03-01")

    # (a) まだ区画が無い本文。**うしろに足す**
    gh = FakeGh(body=HAND)
    act(gh, apply=True, d=d)
    ck("(a) 書き換えた回数", gh.patched == 1, gh.patched)
    ck("(a) 手で書いた本文がそのまま残る", HAND.strip() in gh.body(), "残る")
    ck("(a) 区画が足された", uw.BEGIN in gh.body() and uw.END in gh.body(), "足された")
    ck("(a) 区画は本文のうしろ", gh.body().index(uw.BEGIN) > gh.body().index("## この"),
       "うしろ")

    # (b) もう区画が在る本文を、2回書き換える。**外は1文字も動かない**
    before = gh.outside()
    d2 = make_content(tmp / "c6b")   # 0件に変わった
    act(gh, apply=True, d=d2)
    ck("(b) 区画の中が入れ替わった", "手入れ待ちはありません" in gh.inside(), "入れ替わった")
    ck("(b) 区画の外が1文字も動かない", gh.outside() == before, "動かない")
    ck("(b) 手で書いた表がまだ在る", "| 着いた日 | `chapters.ts` の `from` |" in gh.body(),
       "在る")

    # (c) 人が区画の**下**に書き足していても消さない
    gh2 = FakeGh(body=HAND)
    act(gh2, apply=True, d=d)
    gh2.issues[uw.ISSUE_NUMBER]["body"] += "\n## あとから足した節\n\nここも消さない。\n"
    act(gh2, apply=True, d=d2)
    ck("(c) 区画の下に足した節が残る", "あとから足した節" in gh2.body(), "残る")

    # (d) 変わっていない回は**書かない**
    was = gh2.patched
    act(gh2, apply=True, d=d2)
    ck("(d) 変わっていなければ PATCH を打たない", gh2.patched == was, gh2.patched)


def case7_dry(tmp: Path):
    """**`--apply` 無しでは1バイトも書かない。** 読みには毎回行く。"""
    print("\n[7] --apply 無しでは1バイトも書かない（読みには行く）")
    d = make_content(tmp / "c7", voices="2026-03-01")
    gh = FakeGh()
    (code, said) = said_while(lambda: act(gh, apply=False, d=d))
    ck("終了コード", code == 0, code)
    ck("issue を読んだ回数", gh.gets == 1, gh.gets)
    ck("**書いた回数 0**", gh.patched == 0, gh.patched)
    ck("本文が1文字も動いていない", gh.body() == HAND, "動いていない")
    ck("「読めました」がログに残る", "読めました" in said, "残る")
    ck("これから何をするかがログに出る", "書き換えます" in said, "出る")


def case8_wrong_target(tmp: Path):
    """**書く先が違う／閉じている／札が無いときは書かない。**"""
    print("\n[8] 書く先が怪しいときは書かない")
    d = make_content(tmp / "c8", voices="2026-03-01")

    for name, gh in (
        ("閉じている", FakeGh(state="closed")),
        ("札も印も無い", FakeGh(labels=())),
        ("pull request だった", FakeGh(pr=True)),
    ):
        code = act(gh, apply=True, d=d)
        ck(f"{name} → 書かない", gh.patched == 0, gh.patched)
        ck(f"{name} → それでも落ちない", code == 0, code)

    # **札を外されても、区画がもう在れば書く**（毎晩赤くしないため）
    gh = FakeGh(body=HAND + "\n" + uw.BEGIN + "\nふるい\n" + uw.END + "\n", labels=())
    act(gh, apply=True, d=d)
    ck("札が無くても、区画が在れば書く", gh.patched == 1, gh.patched)


def case9_blind(tmp: Path):
    """**数えられない回は、区画を書き換えない。**「ありません」で上書きしない。"""
    print("\n[9] 数えられない回は、区画を書き換えない")
    d = make_content(tmp / "c9", chapters=CHAPTERS_MISSED)
    c = uw.count(d, TODAY)
    ck("数えられないと分かる", not c.countable, c.blind)
    ck("読み落としの数が出る", "読み落とし" in "".join(c.blind), c.blind[:1])

    gh = FakeGh(body=HAND + "\n" + uw.BEGIN + "\nまえの区画\n" + uw.END + "\n")
    code = act(gh, apply=True, d=d)
    ck("書き換えない", gh.patched == 0, gh.patched)
    ck("前の区画が残る", "まえの区画" in gh.body(), "残る")
    ck("**終了コードは 2**（数えられない）", code == 2, code)

    # 表と置き場が食い違う回も「数えられない」
    d2 = tmp / "c9b" / "content"
    d2.mkdir(parents=True)
    (d2 / "voices.ts").write_text(_ts(["2026-10-01"]), encoding="utf-8")
    c2 = uw.count(d2, TODAY)
    ck("本が足りない置き場も数えられない", not c2.countable, len(c2.blind))


def case10_unreachable(tmp: Path):
    """**届かなかったら 1。** 手入れが溜まっているだけでは落ちない。"""
    print("\n[10] 届かなかったら 1（溜まっているだけでは落ちない）")
    d = make_content(tmp / "c10", voices="2026-03-01")

    gh = Gh404()
    code, said = said_while(lambda: act(gh, apply=True, d=d))
    ck("読みにいく", gh.gets == 1, gh.gets)
    ck("終了コード", code == 1, code)
    ck("HTTP の番号がログに出る", "404" in said, "出る")

    # 溜まっていても 0
    gh2 = FakeGh()
    code = act(gh2, apply=True, d=d)
    ck("手入れが溜まっていても終了コードは 0", code == 0, code)

    # 資格が無ければ 1（`run_watch.act`）
    real = uw.Gh
    uw.Gh = lambda repo, token: FakeGh()
    os.environ.pop("GITHUB_REPOSITORY", None)
    os.environ.pop("GITHUB_TOKEN", None)
    try:
        code = uw.act(True, d, TODAY)
    finally:
        uw.Gh = real
    ck("資格が無ければ 1", code == 1, code)


def case11_break(tmp: Path):
    """**歯止めを1つずつ外して、そのとき確かに落ちることを見せる。**

    落ちない確かめは何も見ていない。1・2・6 の ○ が「歯止めが効いている証拠」に
    なるのは、外したときに ✕ になるから（`docs/island-misses.md` #99）。
    """
    print("\n[11] わざと壊すと赤くなる")

    # (a) 振り分けを潰す（持ち主を見ずに全部を整備へ）
    #     → 機械の赤（`shorts.ts`）が区画に出る。**また1本に混ざる**
    d = make_content(tmp / "c11a", shorts="2026-03-01")
    real_side = uw.side_of
    uw.side_of = lambda name, red, books=None: uw.UPKEEP
    try:
        c = uw.count(d, TODAY)
    finally:
        uw.side_of = real_side
    ck("(a) 振り分けを潰すと、機械の赤が区画に出る",
       "shorts.ts" in "".join(c.urgent + c.later), c.urgent)
    c = uw.count(d, TODAY)
    ck("(a) 戻すと出ない", "shorts.ts" not in "".join(c.urgent + c.later), "出ない")

    # (b) 引き金を外す → 着いた日の空きが見えなくなる（5日止まった形に戻る）
    d = make_content(tmp / "c11b", chapters=CHAPTERS_NO_FROM)
    real_trig = uw.TRIGGERS
    try:
        uw.TRIGGERS = tuple(t for t in real_trig if t.name != "着いた日")
        c = uw.count(d, TODAY)
    finally:
        uw.TRIGGERS = real_trig
    ck("(b) 引き金を外すと、空いた from が見えなくなる", c.waiting == 0, c.waiting)
    c = uw.count(d, TODAY)
    ck("(b) 戻すと見える", c.waiting == 1, c.waiting)

    # (c) 区画の印を変える → 人が書いた本文のうしろに**2本目**が生える
    gh = FakeGh(body=HAND)
    act(gh, apply=True, d=d)
    real_begin = uw.BEGIN
    try:
        uw.BEGIN = "<!-- upkeep:ちがう -->"
        act(gh, apply=True, d=d)
    finally:
        uw.BEGIN = real_begin
    ck("(c) 印を変えると区画が2つになる", gh.body().count(uw.END) == 2,
       gh.body().count(uw.END))

    # (d) 「数えられない」を黙って通す → 「ありません」で上書きしてしまう
    d = make_content(tmp / "c11d", chapters=CHAPTERS_MISSED)
    gh2 = FakeGh(body=HAND + "\n" + uw.BEGIN + "\nまえの区画\n" + uw.END + "\n")
    real_count = uw.count
    uw.count = lambda *a, **k: uw.Count(
        [], [], [], [], TODAY)   # blind を落とした偽の数え
    try:
        act(gh2, apply=True, d=d)
    finally:
        uw.count = real_count
    ck("(d) blind を無視すると、前の区画が「ありません」で消える",
       "まえの区画" not in gh2.body(), "消える")


def case14_new_triggers(tmp: Path):
    """**新しい引き金4つを、鳴る側と黙る側の両方から当てる。**

    どれも「人が欄を埋めれば消える」側なので、**区画に出る**のが正しい。
    ここが抜けていたあいだ、4つとも**埋まっていないのに札に出なかった**。
    """
    print("\n[14] 章のほかを見る引き金4つ")

    # --- (1) 章が閉じたのに、その章の国の滞在が開いたまま -------------------
    d = make_content(tmp / "c14a", countries=COUNTRIES_SWEDEN_OPEN)
    c = uw.count(d, TODAY)
    ck("(1) 閉じた章の国が開いたまま → **急ぐ**側に1件",
       len(c.urgent) == 1 and "sweden" in c.urgent[0], (c.urgent, c.later))
    ck("(1) どのファイルのどの欄かが出る",
       "countries.ts" in c.urgent[0] and "`to`" in c.urgent[0], c.urgent[0])
    ck("(1) どの章が閉じたのかが出る", "nordic" in c.urgent[0], "出る")

    # 閉じれば消える（**満たしようのない見張りにしない**）
    c = uw.count(make_content(tmp / "c14b"), TODAY)
    ck("(1) 滞在を閉じれば消える", c.waiting == 0, (c.urgent, c.later))

    # **いまの章の中で開いているのは正しい。** 既定の仕込みの `albania` が
    # `to: ""` のままで0件、がそれ（出国したあとに書く欄）
    ck("(1) いまの章で開いている滞在は数えない",
       not any("albania" in x and "`to`" in x for x in c.urgent + c.later), "数えない")

    # --- (2) いまの章に、滞在の出どころが1つも無い -------------------------
    d = make_content(tmp / "c14c", countries=COUNTRIES_NO_ALBANIA)
    c = uw.count(d, TODAY)
    ck("(2) いまの章の滞在が無い → **急がない**側に1件",
       len(c.later) == 1 and "COUNTRIES" in c.later[0], (c.urgent, c.later))

    # 旅程（`site/content/<章>.ts`）が在れば、それが出どころ。
    # **ここが無いと、旅のあいだじゅう鳴り続ける**（北欧は 09-22 まで
    # `countries.ts` に1行も無く、旅程だけが持っていた）
    d = make_content(tmp / "c14d", countries=COUNTRIES_NO_ALBANIA, itinerary="albania")
    c = uw.count(d, TODAY)
    ck("(2) 旅程が在れば鳴らない", c.waiting == 0, (c.urgent, c.later))

    # **前の章から開いたままの滞在を、出どころに数えない。**
    # 数えると、(1) が見ている嘘がここでは「出どころ在り」に化ける
    d = make_content(tmp / "c14e",
                     countries=COUNTRIES_NO_ALBANIA.replace(
                         'stays: [{ from: "2026-09-20", to: "2026-09-27", cities: ["ストックホルム"] }],',
                         'stays: [{ from: "2026-09-20", to: "", cities: ["ストックホルム"] }],'))
    c = uw.count(d, TODAY)
    ck("(2) 前の章から開いたままの滞在は、出どころに数えない",
       any("COUNTRIES" in x for x in c.later), (c.urgent, c.later))

    # --- (3) 島の便りが、もう「いま」ではない ------------------------------
    d = make_content(tmp / "c14f")

    c = uw.count(d, TODAY, state=make_state(updatedAt="2026-10-02",
                                            week=["10/4 ティラナを歩く"]))
    ck("(3) 新しい便り × 先の予定 → 鳴らない", c.waiting == 0, (c.urgent, c.later))

    c = uw.count(d, TODAY, state=make_state(updatedAt="2026-09-28",
                                            week=["10/4 ティラナを歩く"]))
    ck("(3) 便りが5日前（しきい値 7日の内側）→ 鳴らない",
       c.waiting == 0, (c.urgent, c.later))

    # **日数の境目は、章の始まりから離れた日で当てる。** いまの章は 2026-09-28
    # 始まりなので、`TODAY`（2026-10-03）の7日前は章より前になってしまい、
    # **日数の足と章の足のどちらで鳴ったのか分からない。** 1週間ずらして当てる
    late = date(2026, 10, 10)
    c = uw.count(d, late, state=make_state(updatedAt="2026-10-03",
                                           week=["10/14 ティラナを歩く"]))
    ck("(3) 便りが7日前ちょうど → 鳴らない（境目は超えたとき）",
       c.waiting == 0, (c.urgent, c.later))
    c = uw.count(d, late, state=make_state(updatedAt="2026-10-02",
                                           week=["10/14 ティラナを歩く"]))
    ck("(3) 便りが8日前 → **急ぐ**側に1件",
       len(c.urgent) == 1 and "place" in c.urgent[0], (c.urgent, c.later))

    # 章より前に打たれていれば、日数の内側でも鳴る（足は2本）
    c = uw.count(d, TODAY, state=make_state(updatedAt="2026-09-27",
                                            week=["10/4 ティラナを歩く"]))
    ck("(3) 日数の内側でも、いまの章より前に打たれていれば鳴る",
       len(c.urgent) == 1 and "place" in c.urgent[0], (c.urgent, c.later))

    # **`week` に過ぎた日の行。** これが 2026-10-06 の本番で、
    # `/now` が「9/27 ストックホルムを発つ」を今週の予定として出していた
    c = uw.count(d, TODAY, state=make_state(
        updatedAt="2026-10-02",
        week=["9/27 ストックホルムを発つ", "9/28 アルバニア着", "回る先はこれから"]))
    ck("(3) week に過ぎた日の行 → **急ぐ**側に1件",
       len(c.urgent) == 1 and "week" in c.urgent[0], (c.urgent, c.later))
    ck("(3) 過ぎた行の数が出る", "2行" in c.urgent[0], c.urgent[0])
    ck("(3) **週の字そのものは出さない**",
       "ストックホルム" not in c.urgent[0], "出さない")

    # 日付の付いていない行は数えない（「回る先はこれから」だけ）
    c = uw.count(d, TODAY, state=make_state(updatedAt="2026-10-02",
                                            week=["回る先はこれから"]))
    ck("(3) 日付の無い行は数えない", c.waiting == 0, (c.urgent, c.later))

    # 打たれた日が読めない／無い
    c = uw.count(d, TODAY, state=make_state(updatedAt="", week=["10/4 歩く"]))
    ck("(3) 打たれた日が無ければ鳴る",
       len(c.urgent) == 1 and "読めません" in c.urgent[0], c.urgent)

    # **章が長く続いても、永久に「新しい」と言わない。**
    # これが `placeOutdated` に空いていた穴そのもの——章の始まりだけを見ると、
    # 章が始まった日に打った便りは**何ヶ月たっても新しい**
    far = date(2027, 1, 1)
    c = uw.count(d, far, state=make_state(updatedAt="2026-09-28",
                                          week=["12/31 どこかにいる"]))
    ck("(3) **章の始まりに打った便りも、3ヶ月たてば鳴る**",
       any("place" in x for x in c.urgent), c.urgent)

    # 届かなければ「数えられない」。**「ありません」と書かない**
    c = uw.count(d, TODAY, state=uw.StateRead(error="島の便りに届きません: 仕込み"))
    ck("(3) 便りに届かなければ数えられない", not c.countable, c.blind)

    # --- (4) `/about` の年表に、いまの章の行が無い -------------------------
    d = make_content(tmp / "c14g", about=ABOUT_NO_NOW)
    c = uw.count(d, TODAY)
    ck("(4) 年表にいまの章の行が無い → **急がない**側に1件",
       len(c.later) == 1 and "STORY" in c.later[0], (c.urgent, c.later))
    ck("(4) どの島の行が要るかが出る", "albania" in c.later[0], c.later[0])

    c = uw.count(make_content(tmp / "c14h", about=ABOUT_FULL), TODAY)
    ck("(4) 章から引いた行が在れば鳴らない", c.waiting == 0, (c.urgent, c.later))
    c = uw.count(make_content(tmp / "c14i", about=ABOUT_BY_DATE), TODAY)
    ck("(4) 日付そのもので置いた行でも鳴らない", c.waiting == 0, (c.urgent, c.later))

    # --- 日数は `site/lib/place.ts` から読む。**2か所に置かない** -----------
    #
    # 数をこちらに書き写すと、画面（`placeOutdated`）と札が別の境目を持つ日が来る。
    # **本当にあちらから読んでいるか**を、あちらの数を変えて当てる
    d = make_content(tmp / "c14j",
                     place="export const PLACE_STALE_DAYS = 3;\n")
    # 2026-09-28 は**いまの章が始まった日**（章の足では鳴らない）。
    # `TODAY` の5日前なので、日数の足だけで両側を作れる
    c = uw.count(d, TODAY, state=make_state(updatedAt="2026-09-28",
                                            week=["10/4 歩く"]))
    ck("place.ts の数を 3 にすると、5日前の便りが鳴る",
       len(c.urgent) == 1 and "3日を超えたら" in c.urgent[0], c.urgent)
    c = uw.count(make_content(tmp / "c14k"), TODAY,
                 state=make_state(updatedAt="2026-09-28", week=["10/4 歩く"]))
    ck("既定（7日）では、同じ便りで鳴らない", c.waiting == 0, (c.urgent, c.later))

    # 読めなければ「数えられない」。**既定値で代わりにしない**
    d = make_content(tmp / "c14l", place="export const SOMETHING = 7;\n")
    c = uw.count(d, TODAY)
    ck("place.ts から数を読めなければ数えられない",
       not c.countable and any("PLACE_STALE_DAYS" in x for x in c.blind), c.blind)

    # --- 読めなかったものを、空で通さない ----------------------------------
    for label, kw, want in (
        ("国の表を読み落とす", {"countries": COUNTRIES_MISSED}, "読み落とし"),
        ("国の表が空", {"countries": "export const X = 1;\n"}, "名乗っていません"),
        ("年表が読めない", {"about": "const OTHER = [];\n"}, "STORY"),
    ):
        c = uw.count(make_content(tmp / f"c14m{len(label)}", **kw), TODAY)
        ck(f"{label} → 数えられない", not c.countable and any(want in x for x in c.blind),
           c.blind or "数えられてしまった")

    # --- わざと壊すと赤くなる（引き金を1本ずつ外す）-------------------------
    #
    # 落ちない確かめは何も見ていない。上の ○ が「効いている証拠」になるのは、
    # 外したときに ✕ になるから（`docs/island-misses.md` #99）
    broke = (
        ("閉じた章の滞在", make_content(tmp / "c14n", countries=COUNTRIES_SWEDEN_OPEN), None),
        ("いまの章の滞在", make_content(tmp / "c14o", countries=COUNTRIES_NO_ALBANIA), None),
        ("島の便り", make_content(tmp / "c14p"),
         make_state(updatedAt="2026-01-01", week=["9/27 発つ"])),
        ("年表のいま", make_content(tmp / "c14q", about=ABOUT_NO_NOW), None),
    )
    real = uw.TRIGGERS
    for name, d, st in broke:
        before = uw.count(d, TODAY, state=st).waiting
        try:
            uw.TRIGGERS = tuple(t for t in real if t.name != name)
            after = uw.count(d, TODAY, state=st).waiting
        finally:
            uw.TRIGGERS = real
        ck(f"引き金「{name}」を外すと、空いた欄が見えなくなる",
           before > 0 and after < before, f"{before}件 → {after}件")


def case12_real():
    """**本番の `site/content` を食わせて、いま何件出るかを印字する。**

    件数そのものは合否にしない（人が欄を埋めれば減るのが正しい）。
    合否にするのは「いま数えられること」と、**本番のデータで振り分けが
    効くこと**の2つ。
    """
    print("\n[12] 本番の site/content を食わせる")

    # **島の便りは、取れれば本物。取れなければ写し。** どちらを使ったかを印字する。
    # 取れなかっただけで落とさない——毎 PR の対照を本番の口に縛ると、本番が
    # 返らない日に関係のない PR が赤くなる（`watch_excuses.py` の `cardgo.mjs`）。
    # **黙って写しに落ちない**ところが肝心で、印字が「写し」なら、
    # ここから下の件数は本番の便りを見ていない
    live = REAL_FETCH(tries=1, timeout=10)
    if live.error:
        live = make_state()
        print(f"    島の便り: **写し**（本物に届きませんでした）")
    else:
        said = str(live.current.get("updatedAt") or "?")
        week = uw.week_days(live.current.get("week"), date.today())
        print(f"    島の便り: 本物（打たれた日 {said} / "
              f"`week` の日付つきの行 {len(week)}行、うち過ぎたのが "
              f"{sum(1 for d in week if d < date.today())}行）")

    c = uw.count(CONTENT, date.today(), state=live)
    print(f"    きょう（{date.today()}）の本番: "
          f"手入れ待ち {c.waiting}件（急ぐ {len(c.urgent)} / 急がない {len(c.later)}）、"
          f"仕組みの側 {len(c.system)}件")
    for line in c.urgent + c.later:
        print(f"      [整備] {line[:110]}")
    for line in c.system:
        print(f"      [仕組み] {line[:110]}")
    ck("本番をいま数えられる（blind 0本）", c.countable, c.blind or "0本")

    # **本番の焼き込みを、ずっと先の日で測る。** 人が書く本は全部古くなるので、
    # 振り分けが本番のデータで効いているかを、人が欄を埋めても動かない形で見られる
    # **引き金ごとに、いま立つか立たないか。** 合計だけだと、4本足した
    # うちどれが効いているのか分からない（§15 の分母）
    w = uw.World(
        today=date.today(),
        rows=uw.read_chapters((CONTENT / "chapters.ts").read_text(encoding="utf-8")).rows,
        countries=uw.read_countries(
            (CONTENT / "countries.ts").read_text(encoding="utf-8")).rows,
        itineraries={r["slug"] for r in uw.read_chapters(
            (CONTENT / "chapters.ts").read_text(encoding="utf-8")).rows
            if (CONTENT / f"{r['slug']}.ts").is_file()},
        about=uw.read_about_steps(
            (ROOT / "site" / "app" / "about" / "page.tsx").read_text(encoding="utf-8")),
        current=live.current,
        stale_days=uw.read_place_stale_days(
            (ROOT / "site" / "lib" / "place.ts").read_text(encoding="utf-8")),
    )
    print(f"    引き金 {len(uw.TRIGGERS)}本の、いまの本番での立ちかた:")
    for t in uw.TRIGGERS:
        got = t.find(w)
        print(f"      {'立つ' if got else '立たない'}  {t.name}"
              f"（{'急ぐ' if t.urgent else '急がない'}）… {len(got)}件")
    ck("`PLACE_STALE_DAYS` を本番の place.ts から読めている", w.stale_days > 0,
       w.stale_days)
    ck("本番の `countries.ts` を読み落としていない",
       uw.read_countries((CONTENT / "countries.ts").read_text(encoding="utf-8")).missed == 0,
       uw.read_countries((CONTENT / "countries.ts").read_text(encoding="utf-8")).missed)
    ck("本番の年表（`STORY`）を読めている", len(w.about) > 0, len(w.about))

    far = date(2030, 1, 1)
    c2 = uw.count(CONTENT, far, state=live)
    print(f"    {far} で測ると: 整備 {c2.waiting}件 / 仕組み {len(c2.system)}件")
    joined = "".join(c2.urgent + c2.later)
    ck("先の日で測ると、人の持ち分が整備に出る", c2.waiting > 0, c2.waiting)
    ck("そこに機械の持ち分（shorts.ts）が混ざらない",
       "shorts.ts" not in joined, "混ざらない")
    ck("機械の持ち分は仕組みの側で数えられている",
       any("shorts.ts" in s for s in c2.system), len(c2.system))
    # 分母が0ではないこと（§15）。表に 人 と 機械 の両方が在るのが前提
    who = {b.who for b in stale.BOOKS.values()}
    ck("仕分けの表に「人」と「機械」の両方が在る",
       stale.HUMAN in who and stale.MACHINE in who, sorted(who))
    print(f"    （`BOOKS` {len(stale.BOOKS)}本 / 引き金 {len(uw.TRIGGERS)}本を見た）")


def case13_yaml():
    """**ワークフローの YAML と突き合わせる。**

    偽の GitHub を何通り回しても、それは全部「Python の中」で、
    **ワークフローの YAML を1行も読んでいない。** `#105` で外したのが
    まさにそれ（確かめた面がどれも同じ側だった）。

    見るのはどれも**壊れても赤くならない**もの:

    - 繋ぎ先が、実在するワークフローの `name:` か（名前を変えると黙って切れる）
    - 保険の cron が置いてあるか
    - `issues: write` が宣言されているか（無いと**本当に要る朝に 403**）
    - 素性の見張りが、口より**手前の同じ job**に在るか
    """
    print("\n[13] ワークフローの YAML と突き合わせる")
    import yaml

    flow = ROOT / ".github" / "workflows"
    names = {}
    docs = {}
    for f in sorted(os.listdir(flow)):
        if not f.endswith((".yml", ".yaml")):
            continue
        with open(flow / f, encoding="utf-8") as fh:
            d = yaml.safe_load(fh) or {}
        docs[f] = d
        if isinstance(d, dict) and d.get("name"):
            names[f] = d["name"]
    print(f"    （`.github/workflows/` の {len(docs)}本を読んだ）")

    me = docs.get(SELF_YML) or {}
    ck("この係のワークフローが在る", bool(me), SELF_YML)

    # PyYAML は `on:` を真偽値の True として読む（YAML 1.1）ので、両方引く
    trig = me.get("on") if isinstance(me.get("on"), dict) else me.get(True) or {}
    linked = (trig.get("workflow_run") or {}).get("workflows") or []
    ck("繋ぎ先が空ではない", len(linked) > 0, linked)
    for want in linked:
        ck(f"繋ぎ先の name: が実在する — {want}", want in names.values(),
           [f for f, n in names.items() if n == want] or "見つからない")
    ck("保険の cron が置いてある", bool(trig.get("schedule")), trig.get("schedule"))

    perm = me.get("permissions") or {}
    ck("issue を書く権限が宣言されている", perm.get("issues") == "write",
       perm.get("issues"))

    # 素性の見張りが、口より**手前の同じ job**に在るか
    steps = []
    for job in (me.get("jobs") or {}).values():
        steps = [{"name": st.get("name"), "run": st.get("run") or ""}
                 for st in (job.get("steps") or [])]
        break
    guard = [i for i, st in enumerate(steps)
             if "logsafe_selftest.py" in st["run"]]
    mouth = [i for i, st in enumerate(steps)
             if "upkeep_watch.py" in st["run"] and "_selftest" not in st["run"]]
    ck("素性の見張りが同じ job に在る", len(guard) == 1, guard)
    ck("口が1つだけ在る", len(mouth) == 1, mouth)
    ck("見張りが口より手前", guard and mouth and guard[0] < mouth[0],
       (guard, mouth))

    # 振り分けの確かめも、口より手前で回っているか
    drill = [i for i, st in enumerate(steps)
             if "upkeep_watch_selftest.py" in st["run"]]
    ck("振り分けの確かめが口より手前", drill and mouth and drill[0] < mouth[0],
       (drill, mouth))


def case_grep():
    """**出た字を探す。** 袋を読むので、ほかの確かめのあとに回す。"""
    print("\n[素性] 本文にもログにも、名前・どねID・チャンネルID・メールが出ない")

    cid = "UCzzFAKE0000000000000002"
    bait = f"{cid} / @ふしぎな-fake2 / 1000000002 / someone@example.com"
    got = logident.count(bait)
    for k in ("channel_id", "handle", "doneru_id", "email"):
        ck(f"探し方が当たる — {k}", got[k] > 0, got[k])

    # 本番の字で作った区画（公開の issue に残るのはこちらが先）
    text = uw.section(uw.count(CONTENT, date(2030, 1, 1)))
    n = logident.count(text)
    for k in logident.KINDS:
        ck(f"区画に出た数 — {k}", n[k] == 0, n[k])
    print(f"    （見た区画は {len(text)} 文字）")

    log = BUF.getvalue().split("[素性の結果]")[0]
    n = logident.count(log)
    for k in logident.KINDS:
        ck(f"ログに出た数 — {k}", n[k] == 0, n[k])
    print(f"    （見たログは {len(log)} 文字）")


def main() -> int:
    # **毎晩これが走るのは Actions の中。** 同じ条件で回して、その出力を数える
    os.environ["GITHUB_ACTIONS"] = "true"
    print("=== 偽の GitHub で、手入れ待ちの映し方を動かす ===")
    print("（GitHub には1バイトも出ません）")

    import tempfile
    with tempfile.TemporaryDirectory() as t:
        tmp = Path(t)
        case1_human(tmp)
        case2_machine(tmp)
        case3_upstream(tmp)
        case4_chapters(tmp)
        case5_zero(tmp)
        case6_hand(tmp)
        case7_dry(tmp)
        case8_wrong_target(tmp)
        case9_blind(tmp)
        case10_unreachable(tmp)
        case11_break(tmp)
        case14_new_triggers(tmp)
    case12_real()
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
