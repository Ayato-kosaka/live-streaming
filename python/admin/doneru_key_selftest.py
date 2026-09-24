"""**偽の Firestore で、Doneru の鍵の引っ越し（`doneru_key.py`）を実際に動かす。**

    python3 python/admin/doneru_key_selftest.py

終了コード 0=通った / 1=落ちた / **2=数えるものが無い**
（`docs/island-standards.md` §15）。

**ネットにも本番にも資格情報にも触らない。** 差し替えるのは Firestore だけで、
**判断の側は本物**——`doneru_key.main()` をそのまま呼ぶ。

## 何を見るか

| | 場面 | 欲しい結果 |
| --- | --- | --- |
| 1 | 旧に鍵・新は空・**下見** | **1バイトも書かない**。緑 |
| 2 | 旧に鍵・新は空・`{"apply": true}` | 写す。読み直して一致。緑 |
| 3 | もう写してある | 「一致」。**書き込み0件**。緑 |
| 4 | 新に**別の**鍵が入っている・下見 | **上書きしない**。赤（1） |
| 5 | 旧も新も鍵を持っていない | **2**（数えるものが無い） |
| 6 | 形の違う鍵（31桁・大文字・64桁・空白まじり） | **写さない**。赤（1） |
| 7 | 鍵を ARGS に書いた | **走る前に赤**（1）。公開のログに出さない |
| 8 | 書いたのに読み直せない | 赤（1）。緑で終わらない |
| 9 | 環境変数の取り替え用の鍵 | そちらが勝つ |

**鍵の値はログに出ないこと**も、ここで実測する（9つの場面ぜんぶの出力を
拾って、作りものの鍵が1文字も混ざっていないことを見る）。

## 対照（本物の判定を1つも出す前に、毎回）

`BREAK=` で守りを1本ずつ抜いて、**そのたび、その足の場面だけが落ちる**こと
を見る（`docs/island-standards.md` §15「対照は、足の数だけ用意する」）。
抜きかたは**ソースへの字の当てはめ**で、当たらなければ数字を1つも出さずに 2。

| 足 | 抜くと何が起きるか | 落ちる場面 |
| --- | --- | --- |
| `shape` | 形の違う鍵を写す | 6 |
| `dryrun` | 下見でも書く | 1 と 4（`apply` は両方を止めている） |
| `clobber` | 新しい置き場の別の鍵を黙って上書きする | 4 |
| `verify` | 書いたあと読み直さない | 8 |
| `args` | ARGS に書かれた鍵を受け取る | 7 |
| `nothing` | 写す元が無くても 0 で帰る | 5 |
| `hush` | 鍵の値をログに出す | 「値が出ていない」 |

**壊していない写しが通ること**も先に見る（`docs/island-misses.md` #99）。

## ログに出さないもの

ここで使う鍵は**でたらめな作りもの**だが、形は本物に寄せてある（32桁の16進）。
"""

import io
import logging
import os
import pathlib
import re
import sys
import types

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.dirname(HERE))

# `config.py` は、この環境変数が無いと読み込みの時点で落ちる。
# 下で作るクライアントは偽物なので**本物の名前は要らない**
os.environ.setdefault("BQ_PROJECT_ID", "doneru-key-selftest")
os.environ.pop("ARGS", None)
os.environ.pop("DONERU_GOAL_KEY_NEW", None)

import fund_box as fb  # noqa: E402

SRC = pathlib.Path(HERE, "doneru_key.py").read_text(encoding="utf-8")

# 数えるものが無い
NOTHING = 2

FAILED: list[str] = []
CHECKS = 0
CASE = "0"

# ---------------------------------------------------------------- 作りもの

# 32桁の16進。**本物ではない。** 形だけ本物に寄せてある
KEY_OLD = "0123456789abcdef0123456789abcdef"
KEY_OTHER = "fedcba9876543210fedcba9876543210"
KEY_FRESH = "aaaabbbbccccddddeeeeffff00001111"
# 形が違うもの。**4通りとも別の外れ方**（短い・大文字・長い・空白）
BAD_KEYS = [
    "0123456789abcdef0123456789abcde",
    "0123456789ABCDEF0123456789ABCDEF",
    "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
    "0123456789abcdef 123456789abcdef",
]

OLD_PATH = "islandGoal/2025-10-24"
NEW_PATH = f"{fb.C_CONFIG}/{fb.DONERU_DOC}"

# 本番の `island/state` に近い形。**`fund.total` は無い**（無いことが 503 の足）
STATE = {"fund": {"people": 58, "superchat": 999, "box": {"goal": {"yen": 50000}}}}


# ---------------------------------------------------------------- 偽 Firestore

class FakeSnap:
    def __init__(self, data):
        self._d = data

    @property
    def exists(self) -> bool:
        return self._d is not None

    def to_dict(self):
        return dict(self._d or {})


class FakeDoc:
    def __init__(self, store, key):
        self.store = store
        self.key = key

    def get(self):
        return FakeSnap(self.store.docs.get(self.key))

    def set(self, data, merge=False):
        self.store.writes.append((self.key, dict(data)))
        if self.store.swallow:
            # 「書けたつもりで、入っていない」回。**8 の場面**
            return
        cur = dict(self.store.docs.get(self.key) or {}) if merge else {}
        cur.update(data)
        self.store.docs[self.key] = cur


class FakeCol:
    def __init__(self, store, name):
        self.store = store
        self.name = name

    def document(self, doc_id):
        return FakeDoc(self.store, f"{self.name}/{doc_id}")


class FakeClient:
    """入れ物と書類だけの Firestore。**来た書き込みを全部覚える。**"""

    def __init__(self, docs=None, swallow: bool = False):
        self.docs = dict(docs or {})
        self.docs.setdefault("island/state", dict(STATE))
        self.writes: list[tuple[str, dict]] = []
        self.swallow = swallow

    def collection(self, name):
        return FakeCol(self, name)

    def key(self) -> str:
        return str((self.docs.get(NEW_PATH) or {}).get("goalKey") or "")


# ---------------------------------------------------------------- 壊しかた

# `BREAK=` の名前 → （ソースに当てる形, 差し替える字）。
# **当たらなければ 2 で落ちる。** 当たらない細工は、壊していない字を測る
BREAKS = {
    "shape": (
        re.compile(r"    if not fb\.DONERU_KEY\.match\(want\):\n"),
        "    if False:\n",
    ),
    "dryrun": (
        re.compile(r"    apply = bool\(a\.get\(\"apply\", False\)\)\n"),
        "    apply = True\n",
    ),
    "clobber": (
        re.compile(r"    if new and new != want:\n"),
        "    if False:\n",
    ),
    "verify": (
        re.compile(r"    back = fb\.read_doneru_key\(client\)\n"),
        "    back = want\n",
    ),
    "args": (
        re.compile(r"    if \"key\" in a or \"goalKey\" in a:\n"),
        "    if False:\n",
    ),
    "nothing": (
        re.compile(r"        return NOTHING\n"),
        "        return 0\n",
    ),
    "hush": (
        re.compile(r"    return f\"\{len\(v\)\}文字 / \{ok\}\"\n"),
        "    return f\"{v} / {ok}\"\n",
    ),
}


def load(breaks: set):
    """守りを外した（外していない）`doneru_key.py` を、その場で組み立てる。

    **写しを持たない。** 写しを置くと、本体を直したのに見張りが古いまま通る。

    Args:
        breaks: 外す足の名前

    Returns:
        読み込んだモジュール
    """
    src = SRC
    for name in sorted(breaks):
        pat, to = BREAKS[name]
        after, n = pat.subn(to, src, count=1)
        if n != 1:
            nothing(f"BREAK={name} が当たらなかった")
        src = after
    mod = types.ModuleType("doneru_key_under_test")
    mod.__dict__["__file__"] = os.path.join(HERE, "doneru_key.py")
    exec(compile(src, "doneru_key.py", "exec"), mod.__dict__)  # noqa: S102
    return mod


def nothing(why: str) -> None:
    """数えるものが無いまま終わる。**数字を1つも出さずに落ちる。**"""
    print(f"数えるものが無い: {why}", file=sys.stderr)
    sys.exit(NOTHING)


# ---------------------------------------------------------------- 回す

def run(mod, fs: FakeClient, args_json: str = "{}", fresh: str = ""):
    """1回ぶん押す。**ログも拾う**（鍵が混ざっていないかを見るため）。

    Args:
        mod: 読み込んだ `doneru_key`
        fs: 偽 Firestore
        args_json: ARGS
        fresh: 環境変数で渡す取り替え用の鍵

    Returns:
        （終了コード, 出たログ）
    """
    buf = io.StringIO()
    h = logging.StreamHandler(buf)
    mod.log.addHandler(h)
    # **出たものを、この箱の外へ出さない。** 拾うのは「鍵が混ざっていないか」を
    # 見るためで、素通しにすると対照を回すあいだ画面が9回ぶん埋まる
    mod.log.propagate = False
    os.environ["ARGS"] = args_json
    if fresh:
        os.environ["DONERU_GOAL_KEY_NEW"] = fresh
    try:
        code = mod.main(client=fs)
    finally:
        mod.log.removeHandler(h)
        os.environ.pop("ARGS", None)
        os.environ.pop("DONERU_GOAL_KEY_NEW", None)
    return code, buf.getvalue()


def ck(name: str, ok: bool, saw) -> None:
    global CHECKS
    CHECKS += 1
    print(f"  {'OK  ' if ok else 'NG  '} [{CASE}] {name}（{saw}）")
    if not ok:
        FAILED.append(f"[{CASE}] {name}")


def case(n: str) -> None:
    global CASE
    CASE = n


def cases(mod) -> list:
    """9つの場面を回す。

    Args:
        mod: 読み込んだ `doneru_key`

    Returns:
        出たログを全部つないだもの
    """
    logs = []

    case("1")
    print("\n[1] 旧に鍵・新は空・下見")
    fs = FakeClient({OLD_PATH: {"doneruGoalKey": KEY_OLD, "startAmount": -1}})
    code, out = run(mod, fs)
    logs.append(out)
    ck("終了コード 0", code == 0, code)
    ck("**1バイトも書かない**", fs.writes == [], f"書き込み {len(fs.writes)} 件")

    case("2")
    print("\n[2] 旧に鍵・新は空・{\"apply\": true}")
    fs = FakeClient({OLD_PATH: {"doneruGoalKey": KEY_OLD}})
    code, out = run(mod, fs, '{"apply": true}')
    logs.append(out)
    ck("終了コード 0", code == 0, code)
    ck("新しい置き場に写る", fs.key() == KEY_OLD, "一致" if fs.key() == KEY_OLD else "ちがう")
    ck("書いたのは1書類だけ",
       [k for k, _ in fs.writes] == [NEW_PATH], f"{[k for k, _ in fs.writes]}")

    case("3")
    print("\n[3] もう写してある")
    fs = FakeClient({OLD_PATH: {"doneruGoalKey": KEY_OLD},
                     NEW_PATH: {"goalKey": KEY_OLD}})
    code, out = run(mod, fs, '{"apply": true}')
    logs.append(out)
    ck("終了コード 0", code == 0, code)
    ck("**書き込み0件**", fs.writes == [], f"書き込み {len(fs.writes)} 件")

    case("4")
    print("\n[4] 新に別の鍵が入っている・下見")
    fs = FakeClient({OLD_PATH: {"doneruGoalKey": KEY_OLD},
                     NEW_PATH: {"goalKey": KEY_OTHER}})
    code, out = run(mod, fs)
    logs.append(out)
    ck("終了コード 1（**黙って上書きしない**）", code == 1, code)
    ck("1バイトも書かない", fs.writes == [], f"書き込み {len(fs.writes)} 件")
    ck("置き場の鍵は動かない", fs.key() == KEY_OTHER, "動かない")

    case("5")
    print("\n[5] 旧も新も鍵を持っていない")
    fs = FakeClient({OLD_PATH: {"startAmount": -1}})
    code, out = run(mod, fs, '{"apply": true}')
    logs.append(out)
    ck("終了コード 2（数えるものが無い）", code == NOTHING, code)
    ck("1バイトも書かない", fs.writes == [], f"書き込み {len(fs.writes)} 件")

    case("6")
    print("\n[6] 形の違う鍵（4通り）")
    for bad in BAD_KEYS:
        fs = FakeClient({OLD_PATH: {"doneruGoalKey": bad}})
        code, out = run(mod, fs, '{"apply": true}')
        logs.append(out)
        ck(f"終了コード 1（{len(bad)}文字）", code == 1, code)
        ck(f"写さない（{len(bad)}文字）", fs.writes == [], f"書き込み {len(fs.writes)} 件")

    case("7")
    print("\n[7] 鍵を ARGS に書いた")
    fs = FakeClient({OLD_PATH: {"doneruGoalKey": KEY_OLD}})
    code, out = run(mod, fs, '{"apply": true, "key": "%s"}' % KEY_FRESH)
    ck("終了コード 1（走る前に止まる）", code == 1, code)
    ck("Firestore を1回も引かない", fs.writes == [], f"書き込み {len(fs.writes)} 件")
    # **この回のログだけは logs に入れない。** ARGS に書かれた鍵は
    # `_fs.args()` を通らずに弾いているので、こちらが出していなくても
    # 入力そのものが公開のログに出る。ここで見たいのは「出さないこと」ではなく
    # 「走らせないこと」
    ck("弾いた理由に鍵が混ざらない", KEY_FRESH not in out, "混ざらない")

    case("8")
    print("\n[8] 書いたのに読み直せない")
    fs = FakeClient({OLD_PATH: {"doneruGoalKey": KEY_OLD}}, swallow=True)
    code, out = run(mod, fs, '{"apply": true}')
    logs.append(out)
    ck("終了コード 1（**緑で終わらない**）", code == 1, code)
    ck("書きには行っている", len(fs.writes) == 1, f"書き込み {len(fs.writes)} 件")

    case("9")
    print("\n[9] 環境変数の取り替え用の鍵が勝つ")
    fs = FakeClient({OLD_PATH: {"doneruGoalKey": KEY_OLD},
                     NEW_PATH: {"goalKey": KEY_OLD}})
    code, out = run(mod, fs, '{"apply": true}', fresh=KEY_FRESH)
    logs.append(out)
    ck("終了コード 0", code == 0, code)
    ck("取り替え用の鍵が入る", fs.key() == KEY_FRESH, "入った" if fs.key() == KEY_FRESH else "入らない")

    return logs


def main() -> int:
    """エントリポイント。

    Returns:
        0=通った / 1=落ちた / 2=数えるものが無い
    """
    global CHECKS, FAILED

    print("# 1. 壊していない写しが、全部通ること（先に見る）")
    mod = load(set())
    logs = cases(mod)

    case("鍵")
    joined = "\n".join(logs)
    leaked = [k for k in [KEY_OLD, KEY_OTHER, KEY_FRESH] + BAD_KEYS if k in joined]
    ck("**鍵の値が1文字もログに出ない**", not leaked, f"出た鍵 {len(leaked)} 件")

    print(f"\n  見た確かめ: {CHECKS}件")
    if CHECKS < 20:
        nothing(f"確かめが {CHECKS}件しか無い")
    if FAILED:
        print("\n壊していない写しが落ちた。対照はここで止める", file=sys.stderr)
        for f in FAILED:
            print(f"  {f}", file=sys.stderr)
        return 1

    # ---- 対照 ----
    # どの細工が、どの場面を折るか。**1つの細工が折ってよいのはここだけ**
    expect = {
        "shape": {"6"},
        # **`apply` は下見の足ひとつで、効いている場所が2つある。**
        # 1（写す）と 4（上書き）のどちらも「下見なら書かない」で止めている
        "dryrun": {"1", "4"},
        "clobber": {"4"},
        "verify": {"8"},
        "args": {"7"},
        "nothing": {"5"},
        "hush": {"鍵"},
    }
    print("\n# 2. 守りを1本ずつ外すと、その足の場面だけが落ちること")
    bad = 0
    for name, want in expect.items():
        FAILED = []
        CHECKS = 0
        buf = io.StringIO()
        keep = sys.stdout
        sys.stdout = buf
        try:
            m = load({name})
            ls = cases(m)
            case("鍵")
            j = "\n".join(ls)
            ck("鍵の値が1文字もログに出ない",
               not [k for k in [KEY_OLD, KEY_OTHER, KEY_FRESH] + BAD_KEYS if k in j],
               "")
        finally:
            sys.stdout = keep
        got = {f.split("]")[0].lstrip("[") for f in FAILED}
        # **外したのに1つも落ちなければ、その守りは最初から効いていない。**
        # それは「落ちた」ではなく数えるものが無い（§15）
        if not got:
            nothing(f"BREAK={name} を当てても1つも落ちない")
        ok = got == want
        print(f"  {'OK  ' if ok else 'NG  '} BREAK={name} → 落ちた場面 [{'/'.join(sorted(got))}]"
              f"（欲しいのは [{'/'.join(sorted(want))}]）")
        if not ok:
            bad += 1

    print("\nNG %d件" % bad if bad else "\nぜんぶ通った")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
