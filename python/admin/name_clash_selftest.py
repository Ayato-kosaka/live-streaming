"""偽の図鑑と偽の YouTube で、`name_clash` を**動かして確かめる。**

    python3 python/admin/name_clash_selftest.py

**本番には1バイトも出ない。** Firestore も資格情報も要らない。
ただし **`node` と本物の `app/alertbox/matching.utils.ts` は要る**——
そこが動かないなら、この道具は「通った」と言ってはいけないので 2 で落ちる。

## なぜ、これを書いたか

数えるほうの道具が壊れると、**「ぶつかり 0組」という嘘が出る。**
しかも赤くならない。0組はいちばん出てほしい答えなので、
**何も測っていなくても合格に見える**（`island-standards.md` §15）。

だから見るのは、数えられることだけではない。

  1. ぶつかると分かっている仕込みで、**必ず出る**
  2. **ぶつからない仕込みでは 0組**（終了コード 0）
  3. **同じ人の中**と**違う人どうし**を、取り違えない
  4. 今日ぶん（チャンネル名そのものの呼び名）を**抜いたら消える**
  5. 読めなかったとき（図鑑が空・本物を動かせない）は、
     **数字を1つも出さずに 2**
  6. **名前も呼び名も1文字も出ない**（ログは公開）

## 対照の対照

`name_clash.run_control()` は本番でも毎回、**図鑑を1人も読む前に**回る。
それが本当に落ちられるのかを、ここで足を1本ずつ抜いて（`BREAK=`）見る。
「壊し方を7通り当てた」は、7通りが同じ足を折っているなら1通り。
**その前に「壊していない写しが通ること」を先に見る**（`island-misses.md` #99）。
"""

import io
import json
import os
import subprocess
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# 出力を丸ごと溜める袋。**`_fs` の basicConfig を読み込む前に**二股にする
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

os.environ.setdefault("BQ_PROJECT_ID", "name-clash-selftest")

import channel_alias as ca  # noqa: E402
import name_clash as nc  # noqa: E402
from _fs import readonly  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))

# ---------------------------------------------------------------- 偽の図鑑
#
# **本物の名前もハンドルもチャンネルIDも1つも使わない。** 形だけ似せてある。
#
# 鍵 -> (チャンネル名, 呼び名, YouTube から返る表示名)

PEOPLE = {
    # 空白1つ違いでぶつかる2人。**呼び名のほうが今日ぶん**
    "space1": ("@shirokuma0001", ["しろくま ひめ"], "しろくま ひめ"),
    "space2": ("しろくまひめ", [], None),
    # ひらがな/カタカナでぶつかる2人。**今日ぶんではない**
    "kana1": ("@aozora0002", ["あおぞら"], "あおぞら せんせい"),
    "kana2": ("アオゾラ", [], None),
    # 同じ人の中でぶつかる（無害）
    "self": ("@nagisa0003", ["なぎさ びより", "なぎさびより"], None),
    # ぶつからない2人
    "ok1": ("@tsukikage0004", ["つきかげ"], "つきかげ"),
    "ok2": ("@himawari0005", ["ひまわり ばたけ"], "ひまわり ばたけ"),
}

# 書類ID。**並び順がそのまま OBS の並び**になるので、順に振る
DOC = {k: f"{i:x}" + "0123456789abcdef" * 2 for i, k in enumerate(PEOPLE)}
CID = {k: "UC" + f"{i:02d}" + "channeliddummy00000000"[:20]
       for i, k in enumerate(PEOPLE)}
EMOJI = {k: e for k, e in zip(PEOPLE, "🐻🐾🌌🌠🏖🌙🌻")}

# ぶつからないほうだけの図鑑（終了コード 0 を見るため）
CLEAN = ("self", "ok1", "ok2")

FAILED: list = []
BLOCKED: list = []


def ck(name: str, cond: bool, got) -> None:
    print(f"    {'○' if cond else '✕'} {name}: {got}")
    if not cond:
        FAILED.append(name)


def make_store(keys=None) -> dict:
    chars = {}
    for key in (keys or PEOPLE):
        channel, aliases, _name = PEOPLE[key]
        chars[DOC[key]] = {
            "channelName": channel,
            "emoji": EMOJI[key],
            "aliases": list(aliases),
            "lookupKeys": nc.keys_of([channel] + list(aliases)),
            "channelKeys": nc.keys_of([channel]),
            "channelId": CID[key],
        }
    return {"islandCharacter": chars}


def fake_fetch(cid: str) -> "ca.Got":
    """偽の YouTube。**ネットに1回も出ない。**"""
    for key in PEOPLE:
        if CID[key] == cid:
            name = PEOPLE[key][2]
            if name is None:
                return ca.Got(ca.GONE, why="404")
            return ca.Got(ca.GOT, name)
    raise AssertionError("知らないチャンネルIDを引きに行きました")


# ------------------------------------------------------- 偽の Firestore


class Snap:
    def __init__(self, key, data, fields):
        self.id = key
        self._data = {k: v for k, v in (data or {}).items()
                      if fields is None or k in fields}

    def to_dict(self):
        return dict(self._data)


class Query:
    """Query のかわり。この道具が使うのは `select` / `limit` だけ。"""

    def __init__(self, client, col, fields=None, cap=None):
        self.client, self.col = client, col
        self.fields, self.cap = fields, cap

    def select(self, fields):
        # **本物と同じように、字を渡されたら1文字ずつの欄として扱う。**
        return Query(self.client, self.col, list(fields), self.cap)

    def limit(self, n):
        return Query(self.client, self.col, self.fields, n)

    def get(self):
        self.client.reads += 1
        out = [Snap(k, v, self.fields)
               for k, v in self.client.store.get(self.col, {}).items()]
        return out[:self.cap] if self.cap is not None else out


class DocRef:
    """**書く口は本物どおり生やしておく。**

    生やしておかないと、`_fs.readonly()` が塞いでいるのか、
    そもそも口が無いだけなのかが分からない。
    """

    def __init__(self, client, col, key):
        self.client = client

    def set(self, data, **kw):
        self.client.writes += 1

    def update(self, data):
        self.client.writes += 1

    def delete(self):
        self.client.writes += 1


class Col(Query):
    def document(self, key):
        return DocRef(self.client, self.col, key)


class Fake:
    """偽の Firestore。読んだ回数と、書かれた回数を数える。"""

    def __init__(self, store):
        self.store = store
        self.reads = 0
        self.writes = 0

    def collection(self, name):
        return Col(self, name)


def run(store: dict, a=None, fetch=None):
    """`name_clash.main()` を1回通す。**ネットには出ない。**"""
    client = Fake(store)
    was = (nc.db, nc.readonly, ca.fetch_one, ca.GAP)
    nc.db = lambda: client
    nc.readonly = readonly
    ca.fetch_one = fetch or fake_fetch
    ca.GAP = 0.0
    os.environ["ARGS"] = json.dumps(a or {}, ensure_ascii=False)
    here = BUF.tell()
    code = 0
    try:
        nc.main()
    except SystemExit as e:
        code = e.code or 0
    finally:
        (nc.db, nc.readonly, ca.fetch_one, ca.GAP) = was
    return BUF.getvalue()[here:], code, client


def num(out: str, needle: str) -> str:
    line = next((x for x in out.splitlines() if needle in x), "")
    return "".join(c for c in line.rsplit("…", 1)[-1] if c.isdigit())


def main() -> None:
    os.environ["GITHUB_ACTIONS"] = "true"   # 公開の場として回す
    os.environ.pop("BREAK", None)

    print("[0] **壊していない写しが通る**（対照の対照の、その前）")
    bad, probe = nc.run_control()
    ck("対照 7つが通る", not bad, bad or "通った")
    if not probe:
        # 本物を動かせないなら、**ここから先は何を測っても意味がない**
        BLOCKED.append("本物の matching.utils.ts を動かせない")
        print("\n！ " + BLOCKED[0])
        raise SystemExit(2)
    ck("見本の表が出ている（21行）", len(probe) == len(nc.PROBE), len(probe))
    rows = {r[0]: r for r in probe}
    ck("空白は潰れる", rows["空白あり/なし（かな）"][2] is True, "潰れる")
    ck("正規化だけでは潰れない",
       rows["空白あり/なし（かな）"][1] is False, "潰れない")
    ck("別の字は潰れない", rows["別の字（対照）"][2] is False, "潰れない")

    print("\n[1] ぶつかる図鑑 —— **必ず出る**")
    out, code, client = run(make_store(), {"attribute": False})
    ck("終了コード 1（見つかった）", code == 1, code)
    ck("対照が通ったと言っている", "対照 7つ、通りました" in out, True)
    ck("違う人どうし 2組", num(out, "違う人どうし（事故）") == "2",
       num(out, "違う人どうし（事故）"))
    ck("同じ人の中 1組", num(out, "同じ人の中（無害）") == "1",
       num(out, "同じ人の中（無害）"))
    ck("正規化しても同じ字の組は 0組（送られた字そのままでは事故らない）",
       "別人が返る**） … 0組" in out,
       [x for x in out.splitlines() if "そのままで" in x])
    ck("Collator でだけ同じ 2組", "でだけ同じ（表記がゆれた字で当たる） … 2組"
       in out, [x for x in out.splitlines() if "でだけ同じ" in x])
    ck("表記がゆれた字で別人が返る名前 2件",
       "別人が返る名前** … 2件 / 13件中" in out,
       [x for x in out.splitlines() if "別人が返る名前" in x])
    ck("何が潰れたかを出している", "空白 " in out and "かな " in out,
       [x.strip() for x in out.splitlines() if "… 1組" in x])
    ck("1件ずつ、両方を指紋で出している",
       out.count(" ↔ ") >= 2, out.count(" ↔ "))

    print("\n[2] **1バイトも書いていない**")
    ck("Firestore に書かれた回数 0", client.writes == 0, client.writes)
    ck("読むだけだと言っている", "1バイトも書いていません" in out, True)

    print("\n[3] 完全一致（lookupKeys）の側は 0件")
    ck("口・カードの鍵は 0件", "lookupKeys） で 2人以上に当たる鍵 … 0件"
       in out, num(out, "lookupKeys） で 2人以上"))
    ck("スパチャの鍵も 0件", "channelKeys） で 2人以上に当たる鍵 … 0件"
       in out, num(out, "channelKeys） で 2人以上"))

    print("\n[4] **ぶつからない図鑑では 0組**（終了コード 0）")
    out2, code2, _c2 = run(make_store(CLEAN), {"attribute": False})
    ck("終了コード 0", code2 == 0, code2)
    ck("違う人どうし 0組", num(out2, "違う人どうし（事故）") == "0",
       num(out2, "違う人どうし（事故）"))
    ck("同じ人の中は 1組のまま（無害は消さない）",
       num(out2, "同じ人の中（無害）") == "1",
       num(out2, "同じ人の中（無害）"))
    ck("別人が返る名前 0件", "別人が返る名前** … 0件" in out2,
       [x for x in out2.splitlines() if "別人が返る名前" in x])
    ck("正規化しても同じ字 0組", "別人が返る**） … 0組" in out2, "0組")

    print("\n[5] 今日ぶんを抜いたら、空白の組だけ消える")
    out3, code3, _c3 = run(make_store())
    ck("終了コード 1", code3 == 1, code3)
    ck("表示名を引けた 4人 / 消えている 3人 / 引けなかった 0人",
       "引けた … 4人 / 名前が無い・消えている … 3人"
       " / **引けなかった** … 0人" in out3,
       [x for x in out3.splitlines() if "引けた" in x])
    ck("チャンネル名そのものの呼び名 3件 / 3人",
       "呼び名 … 3件 / 3人" in out3,
       [x for x in out3.splitlines() if "そのものの呼び名" in x])
    ck("抜いたあとは 1組", "抜いたあと: 違う人どうし … 1組" in out3,
       [x for x in out3.splitlines() if "抜いたあと" in x])
    ck("**取り除いたら消える組 1組**", "消える組** … 1組" in out3,
       [x for x in out3.splitlines() if "消える組" in x])

    print("\n[6] 引けなかった人は「今日ぶんではない」に混ぜない")
    out4, code4, _c4 = run(
        make_store(), fetch=lambda cid: ca.Got(ca.BLIND, why="届かない"))
    ck("終了コード 1", code4 == 1, code4)
    ck("**引けなかった** 7人", "**引けなかった** … 7人" in out4,
       [x for x in out4.splitlines() if "引けた" in x])
    ck("抜いても組は減らない", "消える組** … 0組" in out4,
       [x for x in out4.splitlines() if "消える組" in x])
    ck("分けられていないと言っている", "分けられていません" in out4, True)

    print("\n[7] 読めなかったときは、数字を1つも出さずに 2")
    out5, code5, client5 = run({"islandCharacter": {}})
    ck("図鑑が空 → 終了コード 2", code5 == 2, code5)
    ck("**件数を1つも出していない**", "違う人どうし" not in out5,
       "出していない" if "違う人どうし" not in out5 else "出してしまった")
    was_measure = nc.obs_measure
    try:
        nc.obs_measure = lambda chars, probe=None: None
        out6, code6, client6 = run(make_store())
    finally:
        nc.obs_measure = was_measure
    ck("本物を動かせない → 終了コード 2", code6 == 2, code6)
    ck("**図鑑を1人も読んでいない**", client6.reads == 0, client6.reads)
    ck("件数を1つも出していない", "違う人どうし" not in out6,
       "出していない" if "違う人どうし" not in out6 else "出してしまった")

    print("\n[8] 名前も呼び名もチャンネルIDも書類IDも1文字も出ていない")
    both = out + out2 + out3 + out4 + out5 + out6
    names = [c for c, _a, _n in PEOPLE.values()]
    names += [x for _c, a, _n in PEOPLE.values() for x in a]
    names += [n for _c, _a, n in PEOPLE.values() if n]
    leaked = sorted({v for v in names if v and v in both})
    ck("出力に名前が無い", not leaked, leaked or "無し")
    bare = sorted({v.lstrip("@") for v in names
                   if v.startswith("@") and v.lstrip("@") in both})
    ck("`@` を落とした形も出ていない", not bare, bare or "無し")
    ck("チャンネルIDも出ていない",
       not any(v in both for v in CID.values()), "無し")
    ck("書類IDも生では出ていない",
       not any(v in both for v in DOC.values()), "無し")

    print("\n[9] 何が潰れたかの札")
    for a, b, want in (
        ("しろくま ひめ", "しろくまひめ", "空白"),
        ("あおぞら", "アオゾラ", "かな"),
        ("aoi-tori", "aoitori", "記号"),
        ("がぎぐ", "かきく", "濁点"),
        ("あおい", "あおい", "正規化で同じ（Collator を通る前）"),
    ):
        ck(f"{want}", nc.why_same(a, b) == want, nc.why_same(a, b))

    print("\n[10] **対照の足を1本ずつ抜く。抜いたら 2 で止まる**")
    # 本物の書き方（別のプロセス）で回す。同じプロセスで環境変数を立てると、
    # 前の回の状態が残る
    for brk, why in (("clash", "ぶつかりを見つけられない"),
                     ("self", "同じ人の中を事故に混ぜる"),
                     ("clean", "ぶつからないものをぶつかったと言う"),
                     ("keys", "完全一致の側を数えない"),
                     ("today", "今日ぶんを分けられない"),
                     ("real", "**写し**で測る（本物を動かさない）"),
                     ("write", "読むだけの写しに書ける")):
        env = dict(os.environ, BREAK=brk, ARGS="{}",
                   BQ_PROJECT_ID="name-clash-selftest")
        r = subprocess.run(
            [sys.executable, "-c",
             "import sys; sys.path.insert(0, %r)\n"
             "import name_clash as nc\n"
             "bad, _p = nc.run_control()\n"
             "print('\\n'.join(bad))\n"
             "sys.exit(2 if bad else 0)\n" % HERE],
            capture_output=True, text=True, env=env, timeout=300)
        ck(f"BREAK={brk}（{why}）→ 2 で止まる", r.returncode == 2,
           f"終了コード {r.returncode}")
        ck(f"BREAK={brk} の理由が出る", bool(r.stdout.strip()),
           len(r.stdout.strip().splitlines()))

    print("\n[11] 抜いた足で、本物の `main()` も 2 で止まる")
    os.environ["BREAK"] = "clash"
    try:
        out7, code7, client7 = run(make_store())
    finally:
        os.environ.pop("BREAK", None)
    ck("終了コード 2", code7 == 2, code7)
    ck("**本物の数字を1つも出していない**", "違う人どうし" not in out7,
       "出していない" if "違う人どうし" not in out7 else "出してしまった")
    ck("Firestore を1回も読んでいない", client7.reads == 0, client7.reads)
    ck("何も書いていない", client7.writes == 0, client7.writes)

    print()
    if BLOCKED:
        print("！ 確かめられませんでした: " + " / ".join(BLOCKED))
        raise SystemExit(2)
    if FAILED:
        print(f"✕ {len(FAILED)} 件落ちた: {', '.join(FAILED)}")
        raise SystemExit(1)
    print("○ ぜんぶ通った")


if __name__ == "__main__":
    main()
