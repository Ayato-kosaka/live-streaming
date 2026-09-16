"""偽の Firestore ＋ 偽の BigQuery で、`build_residents` を**実際に動かす。**

    python3 python/build_residents_selftest.py

**本番には1バイトも出ない。** 資格情報も要らない（`google.cloud` の
`firestore` / `bigquery` を、読み込む前に偽物に差し替えてある）。
焼き先（`site/content/residents.ts`）も一時ファイルに向け替えてあるので、
リポジトリのファイルは1つも変わらない。

## 何を見ているか

  1. **名簿（`islandCharacter`）に居て、直近90日に出席がある人が候補に入る。**
     日数もチャンネルも、名乗りから引いたものが入る
  2. **名乗りの当たらない人も候補に入る**（`days` は 0）。ここが今回の直しの
     本体。前は手書きの表に載っている22人しか島を歩けなかった
  3. **`python/residents_map.json` を1回も開かない。**
     開いたら落ちるように `open` と `Path.read_text` を塞いである
     （塞ぎが効いていることは、わざと開いてみせる対照で確かめる）
  4. **同じ鍵が2人に付いていたら、どちらも候補にしない。**
     どちらの絵か決められないまま立たせると、別人の絵が島を歩く
  5. **1つの絵に2つのチャンネルが当たっても、どちらにも決めない**
  6. **名簿が読めなかったとき、空の `residents.ts` を焼かない。**
     空で焼くと島から人が消える＝「今日は誰も来ていない」と同じ絵になる
  7. `--report` は `residents.ts` を触らない（既存の作法を壊していない）
  8. 公開の場（`GITHUB_ACTIONS=true`）で、書類IDが素で出ない
  9. **えらばれやすさ（`score`）が、額の順位と出席の順位の足し算でできている。**
     額0・出席0の人も候補には入る（点は最低）／**額1位と出席1位の点が同じ**／
     **同じ総額なら、何回に分けて投げても点が変わらない**（頻度を見ていない証拠）
 10. **生の金額が `residents.ts` に1文字も出ない**（このリポジトリは公開）
 11. 通貨が混ざっていたらログに出る。**円に直さない**
 12. 台帳の窓は直近90日。**古い投げ銭も、先の日付の投げ銭も数えない**

## 壊した写しで落ちるところまで見る（`docs/island-misses.md` #99 #100）

`BUILD_RESIDENTS_PY` に壊した写しの道を渡すと、そちらを読み込む。

    cp python/build_residents.py /tmp/broken.py   # 守りを1つ外す
    BUILD_RESIDENTS_PY=/tmp/broken.py python3 python/build_residents_selftest.py
"""

import builtins
import importlib.util
import io
import logging
import os
import re
import sys
import tempfile
import types
from datetime import datetime, timedelta, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE / "admin"))

# `config.py` は環境変数が無いと読み込みの時点で落ちる。ここで作るクライアントは
# 偽物なので**本物の名前は要らない**が、無いと確かめそのものが起動できない
# （#99 の「回らない診断」）。**手元の値は上書きしない**
os.environ.setdefault("BQ_PROJECT_ID", "build-residents-selftest")

# ------------------------------------------------------- 偽の google.cloud
#
# `google-cloud-firestore` / `google-cloud-bigquery` はこの箱に入っていない。
# **本体は import 文を持ったままでよい**ので、読み込む前に偽物を置く。
import google.cloud  # noqa: E402

for _name in ("firestore", "bigquery"):
    _mod = types.ModuleType(f"google.cloud.{_name}")
    sys.modules[f"google.cloud.{_name}"] = _mod
    setattr(google.cloud, _name, _mod)
sys.modules["google.cloud.firestore"].Client = lambda **kw: None
sys.modules["google.cloud.bigquery"].Client = lambda **kw: None

# ------------------------------------------- residents_map.json を塞ぐ（#3）
#
# **「読んでいない」は、何も動いていなくても通る。** だから読んだら落ちる形に
# しておいて、塞ぎそのものが効くことを対照（下の 3b）で見る。
BANNED = "residents_map"
_real_open = builtins.open
_real_read_text = Path.read_text
_real_path_open = Path.open


class Opened(Exception):
    """手書きの表を開きにいった。"""


def _guard(path):
    if BANNED in str(path):
        raise Opened(f"{path} を開こうとした。名簿（islandCharacter）から引くはず")


def _open(file, *a, **k):
    _guard(file)
    return _real_open(file, *a, **k)


def _read_text(self, *a, **k):
    _guard(self)
    return _real_read_text(self, *a, **k)


def _path_open(self, *a, **k):
    _guard(self)
    return _real_path_open(self, *a, **k)


builtins.open = _open
Path.read_text = _read_text
Path.open = _path_open

# ------------------------------------------------------------------- 本体
#
# **写しは持たない**（写しを置くと、本体を直したのに古いものが通る）
_PATH = os.environ.get("BUILD_RESIDENTS_PY") or str(HERE / "build_residents.py")
_spec = importlib.util.spec_from_file_location("build_residents_under_test", _PATH)
br = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(br)
print(f"# 読み込んだ本体: {_PATH}")

# ---------------------------------------------------------------- 偽の中身
#
# **ぜんぶ偽の字。** 本番のチャンネルIDも絵のIDも名乗りも1文字も置かない。

def icon(tag: str) -> str:
    """ドライブの画像IDと同じ形（`[A-Za-z0-9_-]{33}`）の偽物。"""
    return (tag + "_" * 33)[:33]


ICON = {k: icon(f"1zz{k}") for k in ("a", "b", "c", "d", "e", "f", "g", "h", "i", "j")}

CH = {
    "a": "UCa1b2c3d4e5f6g7h8i9j0kL",   # 名乗りで当たる。出席20日
    "e": "UCe1e2e3e4e5e6e7e8e9e0eP",   # channelId が入っている人
    "f1": "UCf1f1f1f1f1f1f1f1f1f1fQ",  # 同じ名前を名乗る2つのチャンネル
    "f2": "UCf2f2f2f2f2f2f2f2f2f2fR",
    "g": "UCg1g2g3g4g5g6g7g8g9g0gS",   # 鍵が焼かれていない人（名前だけ）
    "hi": "UCh1h2h3h4h5h6h7h8h9h0hU",  # 同じ channelId が2人に入っている
    "x": "UCx1x2x3x4x5x6x7x8x9x0xT",   # 名簿に居ない人（常連の数には入る）
    "j": "UCj1j2j3j4j5j6j7j8j9j0jV",   # **額1位。出席は0日**（点の足し算を見る）
}

# 偽の投げ銭の額。**本番の値は1つも置かない。**
# `residents.ts` に1文字も出ないことを見るので、**よそに出ない字**にしてある
YEN = {
    "j": 32100,      # 額1位。1回で投げた場合
    "j_split": 5350,  # 同じ総額を6回に分けたときの1回ぶん（6×5350＝32100）
    "e": 7700,       # 2位
    "old": 99999999,  # 90日より前。**数えない**
    "ahead": 88888888,  # 先の日付。**数えない**
}

NAME = {
    "a": "@sakura-no-ki",
    "e": "@hitsuji-9x",
    "f": "ふたごのなまえ",
    "g": "@momo-kaze",
    "x": "@dare-demo-nai",
}


def chars(full: bool = True) -> list:
    """偽の名簿。"""
    out = [
        # a: 名乗りで当たる。出席もある → 候補に入り、days が付く
        {
            "id": ICON["a"], "emoji": "🐟", "channelName": NAME["a"], "aliases": [],
            "lookupKeys": ["@sakura-no-ki", "sakura-no-ki"],
            "channelKeys": ["@sakura-no-ki", "sakura-no-ki"], "channelId": "",
        },
        # b: 名乗りが当たらない（チャットに居ない）→ 候補には入る。days は 0。
        #    **ここが今回の直しの本体。** 前はこの人が島を歩けなかった
        {
            "id": ICON["b"], "emoji": "🦔", "channelName": "@shizuka-na-hito", "aliases": [],
            "lookupKeys": ["@shizuka-na-hito", "shizuka-na-hito"],
            "channelKeys": [], "channelId": "",
        },
        # c / d: **同じ鍵**を持つ2人 → どちらも候補にしない
        {
            "id": ICON["c"], "emoji": "🐼", "channelName": "@futago-1",
            "aliases": ["ふたごのなまえ"],
            "lookupKeys": ["@futago-1", "futago-1", "ふたごのなまえ"],
            "channelKeys": [], "channelId": "",
        },
        {
            "id": ICON["d"], "emoji": "🐯", "channelName": "@futago-2",
            "aliases": ["ふたごのなまえ"],
            "lookupKeys": ["@futago-2", "futago-2", "ふたごのなまえ"],
            "channelKeys": [], "channelId": "",
        },
        # e: channelId が入っている（名乗りは1つも当たらない）
        {
            "id": ICON["e"], "emoji": "🐑", "channelName": "むかしのなまえ", "aliases": [],
            "lookupKeys": ["むかしのなまえ"], "channelKeys": ["むかしのなまえ"],
            "channelId": CH["e"],
        },
        # f: 同じ名前を名乗る2つのチャンネルが当たる → どちらにも決めない
        {
            "id": ICON["f"], "emoji": "🐰", "channelName": "おなじなまえ", "aliases": [],
            "lookupKeys": ["おなじなまえ"], "channelKeys": ["おなじなまえ"], "channelId": "",
        },
        # h / i: **同じ channelId が2人に入っている** → どちらも候補にしない
        {
            "id": ICON["h"], "emoji": "🐸", "channelName": "@onaji-id-1", "aliases": [],
            "lookupKeys": ["@onaji-id-1", "onaji-id-1"], "channelKeys": [],
            "channelId": CH["hi"],
        },
        {
            "id": ICON["i"], "emoji": "🐢", "channelName": "@onaji-id-2", "aliases": [],
            "lookupKeys": ["@onaji-id-2", "onaji-id-2"], "channelKeys": [],
            "channelId": CH["hi"],
        },
        # g: **鍵が焼かれていない**（移行のとりこぼし）。名前から作り直して当てる
        {
            "id": ICON["g"], "emoji": "🍑", "channelName": NAME["g"], "aliases": [],
            "lookupKeys": [], "channelKeys": [], "channelId": "",
        },
        # j: **投げ銭の額1位。ただしチャットには1日も来ていない**（days 0）。
        #    「額1位 ≒ 皆勤」が効いているかは、この人と a を見比べて決まる
        {
            "id": ICON["j"], "emoji": "🐬", "channelName": "@kingaku-ichii", "aliases": [],
            "lookupKeys": ["@kingaku-ichii", "kingaku-ichii"], "channelKeys": [],
            "channelId": CH["j"],
        },
    ]
    return out if full else []


def rows() -> list:
    """偽の BigQuery。`SQL` が返す形と同じ列だけ持つ。"""
    base = {"denom": 83, "lost_days": 4, "first_day": "2026-07-01"}
    return [
        {"cid": CH["a"], "name": NAME["a"], "attend": 20, **base},
        {"cid": CH["e"], "name": NAME["e"], "attend": 12, **base},
        {"cid": CH["f1"], "name": "おなじなまえ", "attend": 9, **base},
        {"cid": CH["f2"], "name": "おなじなまえ", "attend": 8, **base},
        {"cid": CH["g"], "name": NAME["g"], "attend": 7, **base},
        {"cid": CH["x"], "name": NAME["x"], "attend": 6, **base},
        {"cid": CH["f1"] + "z", "name": "ふたごのなまえ", "attend": 5, **base},
    ]


def day_ago(n: int) -> str:
    """いまから n 日前の日付（日本時間）。台帳の `day` と同じ形。"""
    return (
        (datetime.now(timezone.utc) + timedelta(hours=9)) - timedelta(days=n)
    ).strftime("%Y-%m-%d")


def tips(split: bool = False, mixed: bool = True) -> list:
    """偽の台帳（`islandTips`）。

    Args:
        split: True なら**額1位のぶんを6回に分ける**（総額は同じ）。
            点が変わらないことを見るための対。
        mixed: 円以外の通貨を1件混ぜるか

    Returns:
        書類の一覧
    """
    out = []
    if split:
        # **同じ総額を6回に分けて投げた**。頻度を見ていないなら点は動かない
        for i in range(6):
            out.append({
                "id": f"t-j-{i}", "channelId": CH["j"], "day": day_ago(3 + i),
                "amount": YEN["j_split"], "currency": "JPY",
            })
    else:
        out.append({
            "id": "t-j", "channelId": CH["j"], "day": day_ago(3),
            "amount": YEN["j"], "currency": "JPY",
        })
    out += [
        # 2位。**窓の内側の端**（90日前ちょうど）に置いて、端が落ちないか見る
        {"id": "t-e", "channelId": CH["e"], "day": day_ago(90),
         "amount": YEN["e"], "currency": "JPY"},
        # **90日より前。数えない。** ここを数えると a が額1位になってしまう
        {"id": "t-old", "channelId": CH["a"], "day": "2020-01-01",
         "amount": YEN["old"], "currency": "JPY"},
        # **先の日付。数えない**（台帳の窓の上は手元で切っている）
        {"id": "t-ahead", "channelId": CH["a"], "day": day_ago(-10),
         "amount": YEN["ahead"], "currency": "JPY"},
        # どねID が表に無い人。誰のものか読めないので額には足さない
        {"id": "t-nobody", "channelId": None, "day": day_ago(5),
         "amount": 1234, "currency": "JPY"},
        # 金額が読めなかった1件
        {"id": "t-noamount", "channelId": CH["g"], "day": day_ago(6),
         "amount": None, "currency": "JPY"},
    ]
    if mixed:
        # **円以外。円に直さないので額には足さない。** ログには出す
        out.append({"id": "t-ils", "channelId": CH["g"], "day": day_ago(7),
                    "amount": 6.0, "currency": "ILS"})
    return out


# ------------------------------------------------------------- 偽の Firestore


class Snap:
    def __init__(self, doc_id, v):
        self.id = doc_id
        self._v = v

    def to_dict(self):
        return self._v


class Col:
    """コレクション。`limit()` `where()` `get()` `stream()` だけ。

    **`where` は本物と同じで、当たらないものを返さない。** ここを素通り
    させると、本体が窓で切らずに全部足していても緑のまま通る。
    """

    def __init__(self, docs, boom):
        self._docs = docs
        self._boom = boom

    def limit(self, n):
        return Col(self._docs[:n], self._boom)

    def where(self, field, op, value):
        keep = {
            ">=": lambda v: v is not None and v >= value,
            "<=": lambda v: v is not None and v <= value,
            "==": lambda v: v == value,
        }[op]
        return Col([d for d in self._docs if keep(d.get(field))], self._boom)

    def _snaps(self):
        if self._boom:
            raise RuntimeError("Firestore に届かない（偽の故障）")
        return [Snap(d["id"], {k: v for k, v in d.items() if k != "id"}) for d in self._docs]

    def get(self):
        return self._snaps()

    def stream(self):
        return iter(self._snaps())


class FakeDb:
    def __init__(self, docs, boom=False, tip_docs=None):
        self._docs = docs
        self._boom = boom
        self._tips = tips() if tip_docs is None else tip_docs

    def collection(self, name):
        if name == "islandTips":
            # **台帳は名簿と別の故障をする。** 名簿が読めないときは焼かないが、
            # 台帳が読めないときは出席だけで焼く。同じ `boom` に乗せない
            return Col(self._tips, False)
        assert name == "islandCharacter", name
        return Col(self._docs, self._boom)


class FakeQuery:
    def __init__(self, out):
        self._out = out

    def result(self):
        return self._out


class FakeBq:
    def __init__(self, out):
        self._out = out

    def query(self, sql):
        return FakeQuery(self._out)


SENTINEL = "// 焼く前の中身。1バイトも動いてはいけない\n"


def run(argv=None, docs=None, bq=None, boom=False, public=False, tip_docs=None):
    """本体を1回まわす。

    Returns:
        (終了コード, 焼き先の中身, 出力ぜんぶ)
    """
    db = FakeDb(chars() if docs is None else docs, boom, tip_docs)
    sys.modules["google.cloud.firestore"].Client = lambda **kw: db
    sys.modules["google.cloud.bigquery"].Client = lambda **kw: FakeBq(
        rows() if bq is None else bq
    )

    tmp = Path(tempfile.mkdtemp(prefix="residents-selftest-")) / "residents.ts"
    _real_open(tmp, "w", encoding="utf-8").write(SENTINEL)
    br.OUT_TS = tmp

    had = os.environ.get("GITHUB_ACTIONS")
    if public:
        os.environ["GITHUB_ACTIONS"] = "true"
    else:
        os.environ.pop("GITHUB_ACTIONS", None)

    buf = io.StringIO()
    real_out, real_err, old_argv = sys.stdout, sys.stderr, sys.argv
    sys.stdout, sys.stderr = buf, buf
    sys.argv = ["build_residents.py"] + (argv or [])
    for h in list(logging.getLogger().handlers):
        h.stream = buf
    try:
        code = br.main()
    finally:
        sys.argv, sys.stdout, sys.stderr = old_argv, real_out, real_err
        for h in list(logging.getLogger().handlers):
            h.stream = sys.stderr
        if had is None:
            os.environ.pop("GITHUB_ACTIONS", None)
        else:
            os.environ["GITHUB_ACTIONS"] = had
    return code, _real_read_text(tmp, encoding="utf-8"), buf.getvalue()


BAD = 0
OK = 0


def check(name, good, why=""):
    global BAD, OK
    if good:
        OK += 1
        print(f"  ok   {name}")
        return
    BAD += 1
    print(f"  NG   {name}" + (f" — {why}" if why else ""))


def line(ts, who):
    """焼いたものから、その人の行を1本取る。"""
    for ln in ts.splitlines():
        if f'icon: "{who}"' in ln:
            return ln.strip()
    return ""


def score(ts, who):
    """焼いたものから、その人の点を取る。無ければ None。"""
    m = re.search(r"score: ([0-9.]+)", line(ts, who))
    return float(m.group(1)) if m else None


print("\n# 0. 名簿から焼ける（対照。ここが動かないと下は全部「空振りで通る」）")
code, ts, out = run()
check("終了コード 0", code == 0, str(code))
check("焼き先が書き換わった", ts != SENTINEL, ts[:80])
check("候補の人数が出ている", "（5人）" in out, out[-300:])

print("\n# 1. 名簿に居て、直近90日に出席がある人が候補に入る")
la = line(ts, ICON["a"])
check("候補に入っている", bool(la), la)
check("出席日数が入る（days: 20）", "days: 20" in la, la)
check("チャンネルが結ばれている", f'channel: "{CH["a"]}"' in la, la)
check("絵文字も名簿から来る", 'emoji: "🐟"' in la, la)

print("\n# 2. 名乗りの当たらない人も候補に入る（**80人が歩けなかった原因**）")
lb = line(ts, ICON["b"])
check("候補に入っている", bool(lb), lb)
check("days は 0", "days: 0" in lb, lb)
check("チャンネルは付けない（当てずっぽうで結ばない）", "channel:" not in lb, lb)

print("\n# 3. `python/residents_map.json` を1回も開かない")
check("開かずに焼けた（開いていれば上の 0 で落ちている）", code == 0, str(code))
# **字の上でも見る。** 動かしていない枝に道が残っていると、次の人が読む。
# 冒頭の説明文（なぜ切ったかの経緯）だけは残してよいので、そこは外して見る
import ast  # noqa: E402

src = _real_read_text(Path(_PATH), encoding="utf-8")
_doc = ast.get_docstring(ast.parse(src)) or ""
check(
    "冒頭の経緯より後に `residents_map` が1文字も残っていない",
    BANNED not in src.replace(_doc, "", 1),
)

print("\n# 3b. 塞ぎが効いていることの対照（開けば落ちる）")
try:
    open(HERE / "residents_map.json")
    check("開いたら落ちる", False, "落ちなかった。塞ぎが効いていない")
except Opened:
    check("開いたら落ちる", True)
except FileNotFoundError:
    check("開いたら落ちる", False, "塞ぎの前にファイルが無いと言われた")

print("\n# 4. 同じ鍵が2人に付いている → どちらも候補にしない")
check("片方（c）が入っていない", not line(ts, ICON["c"]), line(ts, ICON["c"]))
check("もう片方（d）も入っていない", not line(ts, ICON["d"]), line(ts, ICON["d"]))
check("黙って落としていない（件数を出している）", "同じ鍵が2人に付いている" in out, out[-400:])

print("\n# 5. 1つの絵に2つのチャンネルが当たる → どちらにも決めない")
check("候補に入っていない", not line(ts, ICON["f"]), line(ts, ICON["f"]))

print("\n# 5b. 同じ channelId が2人に入っている → どちらも候補にしない")
check("片方（h）が入っていない", not line(ts, ICON["h"]), line(ts, ICON["h"]))
check("もう片方（i）も入っていない", not line(ts, ICON["i"]), line(ts, ICON["i"]))

print("\n# 6. `channelId` が入っている人は、それで結ぶ")
le = line(ts, ICON["e"])
check("候補に入っている", bool(le), le)
check("channelId がそのまま入る", f'channel: "{CH["e"]}"' in le, le)
check("その出席日数が付く（days: 12）", "days: 12" in le, le)

print("\n# 7. 鍵が焼かれていない人は、名前から作り直して当てる")
lg = line(ts, ICON["g"])
check("候補に入っている", bool(lg), lg)
check("チャンネルが結ばれている", f'channel: "{CH["g"]}"' in lg, lg)
check("出席日数が付く（days: 7）", "days: 7" in lg, lg)

print("\n# 8. 名簿が読めなかったら、空の residents.ts を焼かない")
code, ts2, out2 = run(docs=[])
check("終了コード 1", code == 1, str(code))
check("焼き先に1バイトも書いていない", ts2 == SENTINEL, ts2[:80])
check("理由を言っている", "名簿" in out2, out2[-300:])

code, ts3, out3 = run(boom=True)
check("Firestore が落ちたときも終了コード 1", code == 1, str(code))
check("そのときも1バイトも書いていない", ts3 == SENTINEL, ts3[:80])

print("\n# 9. BigQuery が1行も返さないときも焼かない（もとからある守り）")
code, ts4, out4 = run(bq=[])
check("終了コード 1", code == 1, str(code))
check("1バイトも書いていない", ts4 == SENTINEL, ts4[:80])

print("\n# 10. `--report` は residents.ts を触らない（既存の作法）")
rep = Path(tempfile.mkdtemp(prefix="residents-report-")) / "attend.json"
code, ts5, out5 = run(["--report", str(rep)])
check("終了コード 0", code == 0, str(code))
check("residents.ts は焼いていない", ts5 == SENTINEL, ts5[:80])
check("数えた結果は書き出している", rep.exists() and rep.stat().st_size > 0)

print("\n# 11. 公開の場では、書類IDが素で出ない")
_, _, priv = run(public=False)
_, _, pub = run(public=True)
check("手元では書類IDが素で出る（対照）", ICON["c"] in priv, priv[-300:])
check("公開の場では出ない", ICON["c"] not in pub and ICON["d"] not in pub, pub[-300:])
check("指紋は出る（何も見ていないのではない）", "候補に入れなかった: #" in pub, pub[-300:])

# =====================================================================
#  えらばれやすさ（`score`）。あやとの決め（2026-09-15）:
#    額と出席の2つだけ・**頻度は見ない**・相対評価・額1位 ≒ 皆勤
# =====================================================================

print("\n# 12. 点は、額の順位と出席の順位の足し算")
# 候補5人。出席は a=20 / e=12 / g=7 / b=0 / j=0、額は j が1位・e が2位
sa, sb, se, sg, sj = (score(ts, ICON[k]) for k in ("a", "b", "e", "g", "j"))
check("全員に点が焼かれている", None not in (sa, sb, se, sg, sj), f"{sa} {sb} {se} {sg} {sj}")
check("点は 0〜1 に収まる", all(0 <= v <= 1 for v in (sa, sb, se, sg, sj)),
      f"{sa} {sb} {se} {sg} {sj}")

print("\n# 12a. 額0・出席0の人も**候補には入る**（点は最低）")
check("b は候補に入っている", bool(line(ts, ICON["b"])), line(ts, ICON["b"]))
check("b の点が最低（0.000）", sb == 0.0, str(sb))
check("それでも他の人より低いだけで、居なくなってはいない",
      min(sa, se, sg, sj) > sb, f"{sa} {se} {sg} {sj} / {sb}")

print("\n# 12b. **額1位の人と、出席1位の人の点が同じ**（「額1位は皆勤と同じくらい重要」）")
# a = 出席1位・投げ銭0円、j = 額1位・出席0日。掛け算なら j は 0 になる
check("出席1位（a）＝ 0.500", sa == 0.5, str(sa))
check("額1位（j）＝ 0.500", sj == 0.5, str(sj))
check("2人の点が同じ", sa == sj, f"{sa} != {sj}")
check("**掛け算になっていない**（額0の a が 0 になっていない）", sa > 0, str(sa))

print("\n# 12c. 両方そこそこの人が、片方1位より上に来る")
# e は出席2位（0.75）＋額2位（0.75）→ 0.750。少額でも出席し続けている形
check("e（出席2位＋額2位）＝ 0.750", se == 0.75, str(se))
check("片方1位の a / j より上", se > sa and se > sj, f"{se} / {sa} / {sj}")

print("\n# 13. **回数を増やしても点が変わらない**（頻度を見ていない証拠。本命）")
code2, ts_split, out_split = run(tip_docs=tips(split=True))
check("終了コード 0", code2 == 0, str(code2))
# 6回に分けたぶんは同じ総額。**件数だけが増えている**ことを先に見る
check("件数は増えている（対照。5件 → 10件）",
      "台帳 10件" in out_split and "台帳 5件" in out, out_split[-500:])
same = all(score(ts, ICON[k]) == score(ts_split, ICON[k])
           for k in ("a", "b", "e", "g", "j"))
check("点は1つも変わらない", same,
      " ".join(f"{k}:{score(ts, ICON[k])}->{score(ts_split, ICON[k])}"
               for k in ("a", "b", "e", "g", "j")))

print("\n# 14. **生の金額が residents.ts に1文字も出ない**（このリポジトリは公開）")
for tag, v in YEN.items():
    check(f"{tag}（{v}）が焼かれていない", str(v) not in ts, line(ts, ICON["j"]))
check("分けて投げたほうにも出ない", all(str(v) not in ts_split for v in YEN.values()))
check("`amount` `currency` という字も焼かれていない",
      "amount" not in ts and "currency" not in ts)
# **対照。** 点そのものは焼かれている（何も焼いていないから通った、ではない）
check("点は焼かれている（対照）", "score: 0.500" in ts, ts[:200])

print("\n# 15. 通貨が混ざっていたら、ログに出る。**円に直さない**")
check("混ざっていると言っている", "通貨が混ざっている" in out, out[-600:])
check("何がいくつか出ている", "ILS×1" in out and "JPY×4" in out, out[-600:])
check("円に直していないと言っている", "円に直していない" in out, out[-600:])
# **円に直していたら g の点が上がる。** 出ていないことを点でも見る
check("ILS の6.00 を額に足していない（g の点は出席だけ）", sg == 0.25, str(sg))

print("\n# 15b. 混ざっていなければ、その警告は出ない（対照）")
_, _, out_pure = run(tip_docs=tips(mixed=False))
check("円だけなら黙っている", "通貨が混ざっている" not in out_pure, out_pure[-400:])

print("\n# 16. 台帳の窓は直近90日")
# 90日より前の 99999999 も、先の日付の 88888888 も a のもの。
# どちらかを数えていれば a が額1位になって、12b の 0.500 が崩れる
check("90日より前の投げ銭を数えていない", sa == 0.5, str(sa))
check("先の日付の投げ銭も数えていない", sa == 0.5, str(sa))
check("窓の内側の端（90日前ちょうど）は数えている", se == 0.75, str(se))

print("\n# 17. 台帳が読めなくても、島から人は消えない（出席だけで焼く）")
code3, ts_notips, out_notips = run(tip_docs=[])
check("終了コード 0", code3 == 0, str(code3))
check("候補は5人のまま", "（5人）" in out_notips, out_notips[-300:])
# 額が全員0なら、点は出席の順位の半分になる
check("a は出席1位なので 0.500", score(ts_notips, ICON["a"]) == 0.5,
      str(score(ts_notips, ICON["a"])))
check("額1位だった j は、出席0なので 0.000",
      score(ts_notips, ICON["j"]) == 0.0, str(score(ts_notips, ICON["j"])))

print("")
if BAD:
    print(f"NG が {BAD} 件（通ったのは {OK} 件）。")
    raise SystemExit(1)
print(f"{OK} 件ぜんぶ通った。")
