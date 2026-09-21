"""偽の図鑑・偽の BigQuery・偽の YouTube で、`characters_name_match` を
**動かして確かめる。**

    python3 python/admin/characters_name_match_selftest.py

**本番には1バイトも出ない。BigQuery にも YouTube にも訊きに行かない。**
Firestore も資格情報も要らない。

`node` と本物の `app/alertbox/matching.utils.ts` は要る——**字をそろえるのは
本物**なので、動かせなければ「通った」と言わずに落ちる。

## なぜ、これを書いたか

ここが書くのは `channelId` ひとつ。**間違って結ぶと、その人の投げ銭が
別人の絵で配信に出る。** しかも赤くならない。あやとから見えるのは
「知らない絵が出た」だけで、いつ結んだかも分からない。

だから見るのは5つ。**どれか1つでも外れたら、本物に触らずに 2。**

  1. 答えの分かっている仕込みで、**当たるべき人に当たる**
     （全角・絵文字・しっぽのゆれも、**本物の TS を動かしていれば**揃う）
  2. **曖昧なものを書かない**（同じ表示名が2つ／2人が同じ人を指す）
  3. **他の人に結ばれている channelId を使わない**（いちばん危ない）
  4. **引けなかったチャンネルを「当たらない」に混ぜない**
  5. **下見が本当に1バイトも書かない**（走らせる前後で数える）

## 対照の対照

`characters_name_match.run_control()` は本番でも毎回回る。**それが本当に
落ちられるのか**を、ここで足を1本ずつ抜いて（`BREAK=`）見る。
「壊し方を5通り当てた」は、5通りが同じ足を折っているなら1通り
（`docs/island-standards.md` §15）。

**その前に「壊していない写しが通ること」を先に見る**（`island-misses.md` #99）。
写しを作る途中で壊れても終了コードは同じなので、そこを見ないと対照にならない。
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

os.environ.setdefault("BQ_PROJECT_ID", "name-match-selftest")

import characters_name_match as nm  # noqa: E402
from _fs import readonly  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))

# ---------------------------------------------------------------- 偽の中身
#
# **本物の名前も表示名もチャンネルIDも1つも使わない。** 形だけ似せてある。

# 書類の鍵 -> (channelName, aliases, 当たってほしいチャンネルの鍵)
PEOPLE = {
    # そのまま当たる
    "plain": ("", ["なみのり"], "c_plain"),
    # **全角のゆれ。** 本物の `normalizeName`（NFKC）でしか揃わない
    "wide": ("", ["ＮＡＭＩ 12"], "c_wide"),
    # **絵文字のゆれ。** 本物の `normalizeNameNoEmoji` でしか揃わない
    "emoji": ("", ["そらとぶ ひと"], "c_emoji"),
    # **しっぽのゆれ。** `name_tail.strip_tail` でしか揃わない
    "tail": ("", ["しっぽおとし"], "c_tail"),
    # `channelName` に `@` 無しで入っている人（移行がここへ入れたぶん）
    "bare": ("なまえのひと", [], "c_bare"),
    # 同じ表示名のチャンネルが2つ。**決められない**
    "ambig": ("", ["ふたりめ"], None),
    # 当たった先が、**もう別の人に結ばれている**
    "taken": ("", ["もちぬし"], None),
    # **2人が同じ1つのチャンネルを指す。** 両方飛ばす
    "share1": ("", ["おなじじ"], None),
    "share2": ("", ["おなじじ"], None),
    # どこにも居ない
    "miss": ("", ["だれもいない"], None),
}

# `channelId` がもう入っている人。**候補にも入らない**
BOUND = {"owner": ("@nushidesu1234", [], "c_taken")}

# ハンドルしか持っていない人。**表示名が1つも無いので候補に入らない**
HANDLE_ONLY = {"handle": ("@tedukuri1234", [], None)}

ALL = dict(PEOPLE, **BOUND, **HANDLE_ONLY)

DOC = {k: f"{i:x}" + "0123456789abcdef" * 2 for i, k in enumerate(ALL)}
EMOJI = {k: e for k, e in zip(ALL, "🐚🌊🌫🕳🫙🪞🧺🐡🐟🌱🌿🍩")}

# チャンネルの鍵 -> (channelId, YouTube が返す表示名。None なら返さない)
CHANS = {
    "c_plain": ("UCsf01naminoridummy0000", "なみのり"),
    "c_wide": ("UCsf02namidummy00000000", "nami 12"),
    "c_emoji": ("UCsf03soratobudummy0000", "そらとぶ ひと🐦"),
    "c_tail": ("UCsf04shippodummy000000", "しっぽおとし-r9z"),
    "c_bare": ("UCsf05namaedummy0000000", "なまえのひと"),
    "c_amb1": ("UCsf06futarimedummy0001", "ふたりめ"),
    "c_amb2": ("UCsf07futarimedummy0002", "ふたりめ"),
    "c_taken": ("UCsf08mochinushidummy00", "もちぬし"),
    "c_share": ("UCsf09onajijidummy00000", "おなじじ"),
    "c_other": ("UCsf10dokanodaredummy00", "どこかのだれか"),
    # **向こうが返さないチャンネル。** 「引けなかった」とは別物
    "c_gone": ("UCsf11kietadummy0000000", None),
}
CID = {k: v[0] for k, v in CHANS.items()}

# 当たるはずの人。**手で数を書かず、ここから数える**
CAN_HIT = [k for k, v in PEOPLE.items() if v[2]]
NO_HIT = [k for k in ALL if k not in CAN_HIT]

# 名前の字ぜんぶ（漏れていないかを見るため）
SECRETS = ([c for c, _a, _t in ALL.values() if c]
           + [x for _c, a, _t in ALL.values() for x in a]
           + [t for _i, t in CHANS.values() if t]
           + list(CID.values()) + list(DOC.values()))


def make_store() -> dict:
    chars = {}
    for key, (channel, aliases, _t) in ALL.items():
        chars[DOC[key]] = {
            "channelName": channel,
            "emoji": EMOJI[key],
            "aliases": list(aliases),
            "channelId": CID[BOUND[key][2]] if key in BOUND else "",
            # 絵。**触っていないことを見るために、入れておく**
            "images": {"plain": {"full": "plain.webp"}},
        }
    return {"islandCharacter": chars}


def fake_rows() -> list:
    """偽の BigQuery。**訊きに行かない。** コメントの多い順に並べて返す。"""
    return [(cid, 100 - i) for i, (cid, _t) in enumerate(CHANS.values())]


def fake_ask(cids: list) -> dict:
    """偽の YouTube。**ネットに1回も出ない。**"""
    if len(cids) > nm.YT_CHUNK:
        raise AssertionError("50件より多く渡しました")
    by_cid = {cid: title for cid, title in CHANS.values()}
    out = {}
    for c in cids:
        if c not in by_cid:
            raise AssertionError("知らないチャンネルIDを引きに行きました")
        if by_cid[c] is not None:
            out[c] = by_cid[c]
    return out


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
        # ここを親切にすると、`select("channelId")` の踏み抜きが手元で通る
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
        self.client, self.col, self.key = client, col, key

    def set(self, data, **kw):
        self.client.writes += 1

    def update(self, data):
        self.client.writes += 1

    def delete(self):
        self.client.writes += 1


class Col(Query):
    def document(self, key):
        return DocRef(self.client, self.col, key)


class Batch:
    """まとめ書きのかわり。**何をどう書いたかを覚えておく。**"""

    def __init__(self, client):
        self.client = client
        self.ops: list = []

    def update(self, ref, data):
        self.ops.append(("update", ref.key, dict(data)))

    def set(self, ref, data, **kw):
        self.ops.append(("set", ref.key, dict(data)))

    def commit(self):
        for kind, key, data in self.ops:
            self.client.writes += 1
            self.client.ops.append((kind, key, data))
            if kind == "update":
                self.client.store["islandCharacter"][key].update(data)
            else:
                self.client.store["islandCharacter"][key] = data
        self.ops = []


class Fake:
    """偽の Firestore。読んだ回数と、書かれた回数を数える。"""

    def __init__(self, store):
        self.store = store
        self.reads = 0
        self.writes = 0
        self.ops: list = []

    def collection(self, name):
        return Col(self, name)

    def batch(self):
        return Batch(self)


# ---------------------------------------------------------------- 確かめる

FAILED: list = []


def ck(name: str, cond: bool, got) -> None:
    print(f"    {'○' if cond else '✕'} {name}: {got}")
    if not cond:
        FAILED.append(name)


def run(store: dict, a: dict = None, rows=None, ask=None):
    """`characters_name_match.main()` を1回通す。**外には出ない。**"""
    client = Fake(store)
    was = (nm.db, nm.readonly, nm.chat_channels, nm.ask_titles)
    nm.db = lambda: client
    nm.readonly = readonly
    nm.chat_channels = (lambda *x, **k: list(rows)) if rows is not None \
        else (lambda *x, **k: fake_rows())
    nm.ask_titles = ask or fake_ask
    os.environ["ARGS"] = json.dumps(a or {}, ensure_ascii=False)
    here = BUF.tell()
    code = 0
    try:
        nm.main()
    except SystemExit as e:
        code = e.code or 0
    finally:
        (nm.db, nm.readonly, nm.chat_channels, nm.ask_titles) = was
    return BUF.getvalue()[here:], code, client


def num(out: str, needle: str) -> str:
    line = next((x for x in out.splitlines() if needle in x), "")
    return "".join(c for c in line.rsplit("…", 1)[-1] if c.isdigit())


def main() -> None:
    os.environ["GITHUB_ACTIONS"] = "true"   # 公開の場として回す
    os.environ.pop("BREAK", None)

    print("[0] **壊していない写しが通る**（対照の対照の、その前）")
    bad = nm.run_control()
    ck("対照5つが通る", not bad, bad or "通った")

    print("\n[1] 下見 —— 仕分けの件数が仕込みどおり")
    out, code, client = run(make_store())
    ck("対照が通ったと言っている", "対照 5つ、通りました" in out, True)
    ck("字をそろえたのは本物", "字をそろえたのは本物です" in out
       and "写し" not in out, True)
    ck("表示名が取れた個数",
       num(out, "  取れた  ") == str(len([1 for _c, t in CHANS.values() if t])),
       num(out, "  取れた  "))
    ck("向こうが返さなかった個数", num(out, "返さなかった") == "1",
       num(out, "返さなかった"))
    ck("**引けなかった**個数", num(out, "**引けなかった**") == "0",
       num(out, "**引けなかった**"))
    ck(f"**当たった**人数は {len(CAN_HIT)}",
       num(out, "**当たった**") == str(len(CAN_HIT)), num(out, "**当たった**"))
    ck("曖昧（同じ表示名が2つ以上）", num(out, "同じ表示名が2つ") == "1",
       num(out, "同じ表示名が2つ"))
    ck("曖昧（2人が同じ人を指した）", num(out, "2人が同じ人を指した") == "2",
       num(out, "2人が同じ人を指した"))
    ck("**もう他の人に結ばれている**", num(out, "他の人に結ばれている") == "1",
       num(out, "他の人に結ばれている"))
    ck("当たらない（ぜんぶ見たうえで）",
       num(out, "ぜんぶ見たうえで") == "1", num(out, "ぜんぶ見たうえで"))
    ck("当たらない（見ていないのが残る）",
       num(out, "見ていないのが残る") == "0", num(out, "見ていないのが残る"))
    ck("結ぶ人を1人ずつ出している",
       out.count("  結ぶ: ") == len(CAN_HIT), out.count("  結ぶ: "))
    ck("**当たるものが在るので 1**", code == 1, code)

    print("\n[2] **下見では、1回も書いていない**（前後で数える）")
    ck("Firestore に書かれた回数 0", client.writes == 0, client.writes)
    ck("下見だと言っている", "1バイトも書いていません" in out, True)
    ck("入れかたを出している", '{"apply": true}' in out, True)

    print("\n[3] apply —— 当たった人にだけ入れる")
    store = make_store()
    out2, code2, client2 = run(store, {"apply": True})
    ck("終了コード 0", code2 == 0, code2)
    ck(f"書いた人数は {len(CAN_HIT)}",
       f"書きました: {len(CAN_HIT)}人" in out2, len(client2.ops))
    wrote = {key: data for _k, key, data in client2.ops}
    for k in CAN_HIT:
        want = CID[PEOPLE[k][2]]
        ck(f"{EMOJI[k]} に正しい channelId が入った",
           wrote.get(DOC[k], {}).get("channelId") == want,
           "入った" if wrote.get(DOC[k]) else "入っていない")
    ck("入った人数が増えたと言っている", "図鑑（おわり）" in out2, True)

    print("\n[4] **入れてはいけない人には、1件も書いていない**")
    for k in NO_HIT:
        ck(f"{EMOJI[k]} に書いていない", DOC[k] not in wrote, DOC[k] in wrote)
    ck("もう結ばれている人の channelId が変わっていない",
       store["islandCharacter"][DOC["owner"]]["channelId"]
       == CID[BOUND["owner"][2]], "そのまま")

    print("\n[5] **触った欄は `channelId` ひとつだけ**（`set` を使っていない）")
    ck("ぜんぶ update", all(k == "update" for k, _d, _v in client2.ops),
       sorted({k for k, _d, _v in client2.ops}))
    ck("送った欄は channelId だけ",
       all(set(v) == {"channelId"} for _k, _d, v in client2.ops),
       sorted({x for _k, _d, v in client2.ops for x in v}))
    ck("絵（images）に触っていない",
       store["islandCharacter"][DOC["plain"]].get("images")
       == {"plain": {"full": "plain.webp"}}, "そのまま")
    ck("呼び名に触っていない",
       store["islandCharacter"][DOC["plain"]]["aliases"]
       == PEOPLE["plain"][1], "そのまま")

    print("\n[6] 名前も表示名もチャンネルIDも書類IDも1文字も出ていない")
    both = out + out2
    leaked = sorted({v for v in SECRETS if v and v in both})
    ck("出力に素の字が無い", not leaked, leaked or "無し")
    bare = sorted({v.lstrip("@") for v in SECRETS
                   if v.startswith("@") and v.lstrip("@") in both})
    ck("`@` を落とした形も出ていない", not bare, bare or "無し")

    print("\n[7] 図鑑が1件も返らないとき（読めていないのに 0 と言わない）")
    out3, code3, client3 = run({"islandCharacter": {}})
    ck("終了コード 2 で止まる", code3 == 2, code3)
    ck("**件数を1つも出していない**", "図鑑 " not in out3,
       "出していない" if "図鑑 " not in out3 else "出してしまった")
    ck("何も書いていない", client3.writes == 0, client3.writes)

    print("\n[8] 表示名を1つも引けないとき（0件と言わない）")

    def dead(cids):
        raise RuntimeError("口が答えません（仕込み）")

    out4, code4, client4 = run(make_store(), ask=dead)
    ck("終了コード 2 で止まる", code4 == 2, code4)
    ck("「当たらない」を1つも数えていない", "突き合わせ（" not in out4,
       "数えていない" if "突き合わせ（" not in out4 else "数えてしまった")
    ck("引けなかった個数は出している",
       num(out4, "**引けなかった**") == str(len(CHANS)),
       num(out4, "**引けなかった**"))
    ck("何も書いていない", client4.writes == 0, client4.writes)

    print("\n[9] チャットに1つも出ていないとき（引けていないのと分ける）")
    out5, code5, client5 = run(make_store(), rows=[])
    ck("終了コード 2 で止まる", code5 == 2, code5)
    ck("何も書いていない", client5.writes == 0, client5.writes)

    print("\n[10] 引きかた —— 50件ずつ・打ち切りは「引けなかった」に積む")
    seen: list = []

    def counting(cids):
        seen.append(len(cids))
        return fake_ask(cids) if len(cids) <= nm.YT_CHUNK else {}

    many = [f"UCsf{i:04d}kazudummy00000000"[:24] for i in range(120)]
    got = nm.fetch_titles(many, ask=lambda c: {}, budget=60.0)
    ck("50件ずつに割っている",
       nm.fetch_titles(many, ask=counting, budget=60.0) is not None
       and seen == [50, 50, 20], seen)
    ck("返らなかったものは『向こうが返さなかった』",
       all(v[0] == nm.GONE for v in got.values()),
       sorted({v[0] for v in got.values()}))
    cut = nm.fetch_titles(many, ask=counting, budget=-1.0)
    ck("時間切れのぶんは『引けなかった』",
       all(v[0] == nm.BLIND for v in cut.values()),
       sorted({v[0] for v in cut.values()}))
    ck("**『消えている』に畳んでいない**",
       not any(v[0] == nm.GONE for v in cut.values()), "畳んでいない")
    ck("時間切れのときは1回も訊いていない", seen == [50, 50, 20], seen)
    blind = nm.fetch_titles(list(CID.values()), ask=dead, budget=60.0)
    ck("訊けなかったぶんも『引けなかった』",
       all(v[0] == nm.BLIND for v in blind.values()),
       sorted({v[0] for v in blind.values()}))

    print("\n[11] 字をそろえているのは**本物**（写しでは揃わない）")
    pair = ["ＮＡＭＩ 12", "nami 12", "そらとぶ ひと🐦", "そらとぶ ひと"]
    real = nm.normalize(pair)
    ck("本物を読み込めた", real is not None and "写し" not in real["how"],
       real and real["how"])
    if real:
        t = real["map"]
        ck("全角と半角が同じ形になる", t[pair[0]][0] == t[pair[1]][0], "同じ")
        ck("絵文字あり/なしが同じ形になる（絵文字落とし側）",
           t[pair[2]][1] == t[pair[3]][1], "同じ")
        ck("別の字は同じ形にならない", t[pair[0]][0] != t[pair[2]][0], "別")
    os.environ["BREAK"] = "real"
    try:
        copy = nm.normalize(pair)
    finally:
        os.environ.pop("BREAK", None)
    ck("**写しだと全角が揃わない**（だから写しを作らない）",
       copy["map"][pair[0]][0] != copy["map"][pair[1]][0], "揃わない")
    ck("**写しだと絵文字が揃わない**",
       copy["map"][pair[2]][1] != copy["map"][pair[3]][1], "揃わない")
    ck("しっぽ落としが効いている",
       nm.variants("しっぽおとし-r9z") == ["しっぽおとし-r9z", "しっぽおとし"],
       nm.variants("しっぽおとし-r9z"))

    print("\n[12] limit —— 先に少しだけ")
    store6 = make_store()
    out6, code6, client6 = run(store6, {"apply": True, "limit": 2})
    ck("終了コード 0", code6 == 0, code6)
    ck("2人ぶんだけ書いた", len(client6.ops) == 2, len(client6.ops))
    ck("2人と言っている", "書きました: 2人" in out6, True)

    print("\n[13] **対照の足を1本ずつ抜く。抜いたら 2 で止まる**")
    # 本物の書き方（`python ＜名前＞.py`）で、別のプロセスとして回す。
    # 同じプロセスで環境変数を立てると、前の回の状態が残る
    for brk, why in (("ambig", "曖昧なものを書きに行く"),
                     ("taken", "他の人に結ばれているIDを使う"),
                     ("blind", "引けなかったのを『当たらない』に混ぜる"),
                     ("real", "本物の TS ではなく写しで字をそろえる"),
                     ("write", "下見で書けてしまう")):
        env = dict(os.environ, BREAK=brk, ARGS="{}",
                   BQ_PROJECT_ID="name-match-selftest")
        r = subprocess.run(
            [sys.executable, "-c",
             "import sys; sys.path.insert(0, %r)\n"
             "import characters_name_match as nm\n"
             "bad = nm.run_control()\n"
             "print('\\n'.join(bad))\n"
             "sys.exit(2 if bad else 0)\n" % HERE],
            capture_output=True, text=True, env=env, timeout=120)
        ck(f"BREAK={brk}（{why}）→ 2 で止まる", r.returncode == 2,
           f"終了コード {r.returncode}")
        ck(f"BREAK={brk} の理由が出る", bool(r.stdout.strip()),
           len(r.stdout.strip().splitlines()))

    print("\n[14] 抜いた足で、本物の `main()` も 2 で止まる")
    os.environ["BREAK"] = "taken"
    try:
        out7, code7, client7 = run(make_store())
    finally:
        os.environ.pop("BREAK", None)
    ck("終了コード 2", code7 == 2, code7)
    ck("**本物の数字を1つも出していない**", "図鑑 " not in out7,
       "出していない" if "図鑑 " not in out7 else "出してしまった")
    ck("Firestore を1回も読んでいない", client7.reads == 0, client7.reads)
    ck("何も書いていない", client7.writes == 0, client7.writes)

    print()
    if FAILED:
        print(f"✕ {len(FAILED)} 件落ちた: {', '.join(FAILED)}")
        raise SystemExit(1)
    print("○ ぜんぶ通った")


if __name__ == "__main__":
    main()
