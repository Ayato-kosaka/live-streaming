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
import sys
import tempfile
import types
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


ICON = {k: icon(f"1zz{k}") for k in ("a", "b", "c", "d", "e", "f", "g", "h", "i")}

CH = {
    "a": "UCa1b2c3d4e5f6g7h8i9j0kL",   # 名乗りで当たる。出席20日
    "e": "UCe1e2e3e4e5e6e7e8e9e0eP",   # channelId が入っている人
    "f1": "UCf1f1f1f1f1f1f1f1f1f1fQ",  # 同じ名前を名乗る2つのチャンネル
    "f2": "UCf2f2f2f2f2f2f2f2f2f2fR",
    "g": "UCg1g2g3g4g5g6g7g8g9g0gS",   # 鍵が焼かれていない人（名前だけ）
    "hi": "UCh1h2h3h4h5h6h7h8h9h0hU",  # 同じ channelId が2人に入っている
    "x": "UCx1x2x3x4x5x6x7x8x9x0xT",   # 名簿に居ない人（常連の数には入る）
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


# ------------------------------------------------------------- 偽の Firestore


class Snap:
    def __init__(self, doc_id, v):
        self.id = doc_id
        self._v = v

    def to_dict(self):
        return self._v


class Col:
    """コレクション。`limit()` と `get()` だけ。"""

    def __init__(self, docs, boom):
        self._docs = docs
        self._boom = boom

    def limit(self, n):
        return Col(self._docs[:n], self._boom)

    def get(self):
        if self._boom:
            raise RuntimeError("Firestore に届かない（偽の故障）")
        return [Snap(d["id"], {k: v for k, v in d.items() if k != "id"}) for d in self._docs]


class FakeDb:
    def __init__(self, docs, boom=False):
        self._docs = docs
        self._boom = boom

    def collection(self, name):
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


def run(argv=None, docs=None, bq=None, boom=False, public=False):
    """本体を1回まわす。

    Returns:
        (終了コード, 焼き先の中身, 出力ぜんぶ)
    """
    db = FakeDb(chars() if docs is None else docs, boom)
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


print("\n# 0. 名簿から焼ける（対照。ここが動かないと下は全部「空振りで通る」）")
code, ts, out = run()
check("終了コード 0", code == 0, str(code))
check("焼き先が書き換わった", ts != SENTINEL, ts[:80])
check("候補の人数が出ている", "（4人）" in out, out[-300:])

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

print("")
if BAD:
    print(f"NG が {BAD} 件（通ったのは {OK} 件）。")
    raise SystemExit(1)
print(f"{OK} 件ぜんぶ通った。")
