"""作り物の `__data.json`・偽の Firestore で、`tip_ngwords_sync` を**実際に動かして確かめる。**

    python3 python/admin/tip_ngwords_sync_selftest.py

**本番には1バイトも出ない。** doneru.jp にも Firestore にも触らない。
語は「りんご」のような作り物だけ（本物の語の一覧はリポジトリに置かない）。

## なぜ、これを書いたか

この道具が間違えたときに壊れるのは、**島の投げ銭の守り。** 0語で上書きすれば、
島の口は「禁止ワードが無い」と読んで全部通す。merge を忘れれば、同じ書類の
`testAlertboxId` が消える。語をログに出せば、公開のログに一覧が残る。
**どれも run は緑で終わる**ので、ここで足ごとに当てる。

## 確かめるもの（足）

  [1] devalue の形の `__data.json` から取れる（同じ添字・未定義・Date が混ざっても）
  [2] 素の形（塊の data が辞書・SvelteKit の外の JSON・区切りの字）からも取れる
  [3] あとから流れてくる塊（`"type":"chunk"`）からも取れる
  [4] `__data.json` に無い・取れないときは、HTML に埋まった data から取れる。
      どちらから取ったかがログに出る
  [5] NFKC・前後の空白・空・重複を揃え、並べ替える
  [6] **0語なら書かない**（終了コード 1）
  [7] 取れない・見つからない・形が読めないときも書かない（終了コード 1）
  [8] 下見は1バイトも書かない（`_fs.readonly` が口ごと塞ぐ）
  [9] apply は **merge で** 3つの欄だけ書き、ほかの欄を消さない
  [10] ログに語が1つも出ない。件数と指紋は出る

## 対照（`BREAK=`。`docs/island-standards.md` §15）

  zero    … 「0語なら書かない」を外す      → [6] だけが落ちる
  leak    … 揃えた語をログに出す           → [10] だけが落ちる
  nomerge … merge を付けずに書く           → [9] だけが落ちる

BREAK を付けずに回すと、最後に [11] で3つとも子として回し、
**落ちるのがその足だけ**であることまで確かめる。

終了コード 0=通った / 1=落ちた / 2=確かめが1つも無い。
"""

import hashlib
import io
import json
import os
import subprocess
import sys
from datetime import datetime

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# **本番には触らない。** `_fs` が `config` を読み込むので名前だけ置く
os.environ.setdefault("BQ_PROJECT_ID", "tip-ngwords-selftest-writes-nothing")
# **公開の場（Actions）と同じ条件で回す。** 手元の条件だと [10] が意味を持たない
os.environ["GITHUB_ACTIONS"] = "true"

BUF = io.StringIO()
REAL_OUT = sys.stdout


class Tee:
    def write(self, s):
        BUF.write(s)
        REAL_OUT.write(s)

    def flush(self):
        REAL_OUT.flush()


# **`_fs` の basicConfig を読み込む前に**二股にする（ログもここに溜まる）
sys.stdout = Tee()
sys.stderr = Tee()

import _fs  # noqa: E402
import tip_ngwords_sync as S  # noqa: E402
from _fake_fs import FakeDb  # noqa: E402

BREAK = os.environ.get("BREAK", "")
FAILED = []      # (足, 名前)
PROBES = []

# 対照それぞれで、落ちてよい足
DRILLS = {"zero": {"6"}, "leak": {"10"}, "nomerge": {"9"}}


def ok(leg, name, got, want):
    PROBES.append(name)
    if got == want:
        print(f"  ○ {name}: {got}")
        return
    FAILED.append((leg, name))
    print(f"  ✕ {name}: {got}（欲しかったのは {want}）")
    print(f"::error::[{leg}] {name}: 出た={got} / 欲しかったのは={want}")


def fp(words):
    """指紋を、道具とは別に組む（道具の `fingerprint` を写しで確かめる）。"""
    return hashlib.sha256("\n".join(words).encode("utf-8")).hexdigest()[:8]


# --- 壊し方 -----------------------------------------------------------------

if BREAK == "zero":
    S.MIN_WORDS = 0
if BREAK == "leak":
    _normalize = S.normalize

    def _loud(raw):
        got = _normalize(raw)
        S.log.info("揃えた語: %s", "、".join(got))
        return got

    S.normalize = _loud
if BREAK == "nomerge":
    def _overwrite(client, words, now):
        client.collection(S.COLLECTION).document(S.DOC).set({
            "ngWords": list(words), "ngWordsSyncedAt": now,
            "ngWordsSource": "doneru"})

    S.write = _overwrite


# --- 作り物の取ってくる先 ---------------------------------------------------

def j(v) -> str:
    return json.dumps(v, ensure_ascii=False)


# SvelteKit 2 の `__data.json`。層の塊（null）と、画面の塊（devalue の平たい形）。
# devalue は同じ字を1つの添字にまとめる（6 を2回指す）。-1 は undefined
DEVALUE = j({"type": "data", "nodes": [
    None,
    {"type": "data", "data": [{"user": -1, "locale": 1}, "ja"], "uses": {}},
    {"type": "data", "data": [
        {"streamer": 1, "fetchedAt": 12},                                  # 0
        {"id": 2, "display_name": 3, "min_amount": 4,                      # 1
         "filtering_word": 5, "created": 11, "tags": 13, "memo": -1},
        "stream000",                                                       # 2
        "作り物の配信者",                                                   # 3
        100,                                                               # 4
        [6, 7, 8, 6, 9, 10],                                               # 5
        "りんご",                                                           # 6
        "ＡＢＣ",                                                           # 7 全角
        " バナナ　",                                                    # 8 前後の空白
        "",                                                                # 9 空
        "ｶﾀｶﾅ",                                                            # 10 半角
        ["Date", "2026-11-01T00:00:00.000Z"],                              # 11
        ["Date", "2026-11-23T00:00:00.000Z"],                              # 12
        ["Set", 2],                                                        # 13
    ], "uses": {"params": ["slug"]}},
]})
DEVALUE_RAW = ["りんご", "ＡＢＣ", " バナナ　", "", "ｶﾀｶﾅ"]
DEVALUE_WORDS = ["ABC", "りんご", "カタカナ", "バナナ"]

# 塊の data が辞書のまま（devalue を通していない）
PLAIN_NODE = j({"type": "data", "nodes": [
    {"type": "data", "data": {"streamer": {"filtering_word": ["みかん", "ぶどう"]}}}]})
# SvelteKit の外の JSON。語は1つの字に区切って入っている
PLAIN_STRING = j({"streamer": {"filtering_word": "みかん\nぶどう,もも、 みかん"}})

# 約束（Promise）で、あとから流れてくる塊
CHUNKED = (j({"type": "data", "nodes": [
    None, {"type": "data", "data": [{"streamer": 1}, ["Promise", 2], 1]}]})
    + "\n"
    + j({"type": "chunk", "id": 1,
         "data": [{"filtering_word": 1}, [2, 3], "すもも", "くるみ"]})
    + "\n")

# 画面の HTML。`kit.start` に渡す data の字面（devalue の uneval の形）
HTML_UNEVAL = """<!doctype html><html lang="ja"><head><meta charset="utf-8"></head>
<body><div style="display: contents">
<script>
  {
    __sveltekit_x1 = { base: new URL(".", location).pathname.slice(0, -1) };
    const element = document.currentScript.parentElement;
    const data = [null,{"type":"data","data":{streamer:{id:"stream000",min_amount:100,filtering_word:["くり","かき","くり"],memo:void 0}},"uses":{"params":["slug"]}}];
    Promise.all([import("./_app/immutable/entry/start.js"), import("./_app/immutable/entry/app.js")])
      .then(([kit, app]) => { kit.start(app, element, { node_ids: [0, 2], data, form: null, error: null }); });
  }
</script></div></body></html>"""
HTML_UNEVAL_WORDS = ["かき", "くり"]

# 画面の HTML。fetch の写し（`body` は JSON を字にしたもの）
HTML_FETCHED = (
    '<html><body><script type="application/json" data-sveltekit-fetched '
    'data-url="https://api.example.invalid/streamer/x">'
    + j({"status": 200, "statusText": "", "headers": {},
         "body": j({"id": "stream000", "filtering_word": ["いちご", "ゆず"]})})
    + "</script></body></html>")

NO_KEY_JSON = j({"type": "data", "nodes": [
    {"type": "data", "data": [{"streamer": 1}, {"id": 2}, "stream000"]}]})
NO_KEY_HTML = "<html><body><p>投げ銭</p></body></html>"

EMPTY = j({"type": "data", "nodes": [
    {"type": "data", "data": [{"streamer": 1}, {"filtering_word": 2}, []]}]})
BLANKS = j({"type": "data", "nodes": [
    {"type": "data", "data": {"streamer": {"filtering_word": ["", "　", " "]}}}]})
UNREADABLE = j({"streamer": {"filtering_word": {"a": 1}}})

# 置き場に元からある、ほかの欄。**消えてはいけない**
OTHERS = {"testAlertboxId": "alertbox-test-000", "tipMinYen": 100}
OLD = ["古いことば"]

ALL_WORDS = sorted(set(
    DEVALUE_RAW + DEVALUE_WORDS + ["みかん", "ぶどう", "もも", "すもも", "くるみ",
                                   "いちご", "ゆず"] + HTML_UNEVAL_WORDS + OLD) - {""})

# この道具自身が出した字だけを溜める。**自分の `ok()` の字を混ぜない**
TOOL_OUT = []


def run(pages, apply, data=None):
    """`main()` を1回まわす。**外へは1バイトも出ない。**

    Args:
        pages: {URL: (状態, 本文) か 例外}。無い URL は 404
        apply: 書くか
        data: 偽の Firestore の中身

    Returns:
        (終了コード, 偽の Firestore)
    """
    def fake_fetch(url):
        got = pages.get(url, (404, "Not Found"))
        if isinstance(got, Exception):
            raise got
        return got

    S.fetch = fake_fetch
    fake = FakeDb(data)
    os.environ["ARGS"] = '{"apply": true}' if apply else "{}"
    mark = len(BUF.getvalue())
    try:
        rc = S.main(client=fake)
    finally:
        TOOL_OUT.append(BUF.getvalue()[mark:])
    return rc, fake


def stored(fake):
    return fake.data.get(S.COLLECTION, {}).get(S.DOC) or {}


def data_only(text):
    return {S.DATA_URL: (200, text)}


def with_others(words=None):
    doc = dict(OTHERS)
    if words is not None:
        doc["ngWords"] = list(words)
    return {S.COLLECTION: {S.DOC: doc}}


print("=== 禁止ワードの写し役を、作り物の __data.json と偽の Firestore で確かめる ===")
print("（doneru.jp にも Firestore にも1バイトも触りません）"
      + (f"  対照 BREAK={BREAK}" if BREAK else ""))

print("\n[1] devalue の形の __data.json から取れる")
ok("1", "組み立て直すと欄の値が出る", S.from_data_json(DEVALUE),
   [(["りんご", "ＡＢＣ", " バナナ\u3000", "りんご", "", "ｶﾀｶﾅ"], "devalue")])
rc, db = run(data_only(DEVALUE), apply=True)
ok("1", "終了コード 0", rc, 0)
ok("1", "書いた語", stored(db).get("ngWords"), DEVALUE_WORDS)

print("\n[2] 素の形からも取れる")
rc, db = run(data_only(PLAIN_NODE), apply=True)
ok("2", "塊の data が辞書（終了コード）", rc, 0)
ok("2", "塊の data が辞書（語）", stored(db).get("ngWords"), ["ぶどう", "みかん"])
rc, db = run(data_only(PLAIN_STRING), apply=True)
ok("2", "区切りの字（終了コード）", rc, 0)
ok("2", "区切りの字（語）", stored(db).get("ngWords"), ["ぶどう", "みかん", "もも"])

print("\n[3] あとから流れてくる塊からも取れる")
rc, db = run(data_only(CHUNKED), apply=True)
ok("3", "終了コード 0", rc, 0)
ok("3", "書いた語", stored(db).get("ngWords"), ["くるみ", "すもも"])

print("\n[4] __data.json で取れなければ HTML から。どちらから取ったかが出る")
rc, db = run({S.PAGE: (200, HTML_UNEVAL)}, apply=True)
ok("4", "__data.json が 404 → HTML の data（終了コード）", rc, 0)
ok("4", "__data.json が 404 → HTML の data（語）", stored(db).get("ngWords"),
   HTML_UNEVAL_WORDS)
ok("4", "取った先が HTML とログに出る", "取った先: HTML（HTML の data" in TOOL_OUT[-1], True)
rc, db = run({S.DATA_URL: (200, NO_KEY_JSON), S.PAGE: (200, HTML_FETCHED)}, apply=True)
ok("4", "__data.json に欄が無い → HTML の JSON（語）", stored(db).get("ngWords"),
   ["いちご", "ゆず"])
ok("4", "見つからなかった理由は数えず先へ進む（終了コード）", rc, 0)
rc, db = run({S.DATA_URL: S.FetchError("ConnectionError"), S.PAGE: (200, HTML_UNEVAL)},
             apply=True)
ok("4", "__data.json につながらない → HTML（語）", stored(db).get("ngWords"),
   HTML_UNEVAL_WORDS)
rc, db = run({S.DATA_URL: (200, DEVALUE), S.PAGE: (200, HTML_UNEVAL)}, apply=True)
ok("4", "両方あれば __data.json が先", stored(db).get("ngWords"), DEVALUE_WORDS)
ok("4", "取った先が __data.json とログに出る",
   "取った先: __data.json（devalue・配列" in TOOL_OUT[-1], True)

print("\n[5] 揃えかた")
ok("5", "NFKC・空白・空・重複・並べ替え",
   S.normalize(["ＡＢＣ", "ABC", " バナナ　", "", "  ", "ｶﾀｶﾅ", "カタカナ", "りんご"]),
   ["ABC", "りんご", "カタカナ", "バナナ"])
ok("5", "並びが変わっても同じ指紋",
   S.fingerprint(S.normalize(["りんご", "ABC"])), S.fingerprint(S.normalize(["ABC", "りんご"])))
ok("5", "指紋は SHA-256 の頭8桁", S.fingerprint(DEVALUE_WORDS), fp(DEVALUE_WORDS))

print("\n[6] **0語なら書かない**")
rc, db = run(data_only(EMPTY), apply=True, data=with_others(OLD))
ok("6", "空の配列: 終了コード 1", rc, 1)
ok("6", "空の配列: 1回も書いていない", db.writes, [])
ok("6", "空の配列: 前の語が残っている", stored(db).get("ngWords"), OLD)
rc, db = run(data_only(BLANKS), apply=True)
ok("6", "揃えると空だけ: 終了コード 1", rc, 1)
ok("6", "揃えると空だけ: 1回も書いていない", db.writes, [])

print("\n[7] 取れない・見つからない・形が読めないときも書かない")
rc, db = run({S.DATA_URL: S.FetchError("ConnectTimeout"), S.PAGE: (403, "<html>")},
             apply=True, data=with_others(OLD))
ok("7", "つながらない・403: 終了コード 1", rc, 1)
ok("7", "つながらない・403: 書いていない", db.writes, [])
ok("7", "理由がログに出る", "HTTP 403" in TOOL_OUT[-1] and "ConnectTimeout" in TOOL_OUT[-1],
   True)
rc, db = run({S.DATA_URL: (200, NO_KEY_JSON), S.PAGE: (200, NO_KEY_HTML)}, apply=True)
ok("7", "どこにも欄が無い: 終了コード 1", rc, 1)
ok("7", "どこにも欄が無い: 書いていない", db.writes, [])
rc, db = run({S.DATA_URL: (200, UNREADABLE), S.PAGE: (200, NO_KEY_HTML)}, apply=True)
ok("7", "欄の形が読めない: 終了コード 1", rc, 1)
ok("7", "欄の形が読めない: 書いていない", db.writes, [])
rc, db = run({S.DATA_URL: (200, "<html>Just a moment...</html>")}, apply=True)
ok("7", "JSON でない本文: 終了コード 1", rc, 1)

print("\n[8] 下見は1バイトも書かない")
rc, db = run(data_only(DEVALUE), apply=False, data=with_others(OLD))
ok("8", "終了コード 0", rc, 0)
ok("8", "1回も書いていない", db.writes, [])
ok("8", "置き場はそのまま", stored(db), {**OTHERS, "ngWords": OLD})
ok("8", "変わることは言う", "**変わる**" in TOOL_OUT[-1], True)
try:
    S.write(_fs.readonly(FakeDb()), ["りんご"], datetime.now())
    blocked = False
except _fs.ReadOnly:
    blocked = True
ok("8", "読み専用のクライアントに書くと止まる", blocked, True)

print("\n[9] apply は merge で3つの欄だけ。ほかの欄を消さない")
rc, db = run(data_only(DEVALUE), apply=True, data=with_others(OLD))
doc = stored(db)
ok("9", "終了コード 0", rc, 0)
ok("9", "書いたのは1回", len(db.writes), 1)
ok("9", "merge で書いた", [w["merge"] for w in db.writes], [True])
ok("9", "書いた欄は3つだけ", sorted(db.writes[0]["patch"]) if db.writes else None,
   ["ngWords", "ngWordsSource", "ngWordsSyncedAt"])
ok("9", "testAlertboxId が残る", doc.get("testAlertboxId"), OTHERS["testAlertboxId"])
ok("9", "ほかの欄も残る", doc.get("tipMinYen"), OTHERS["tipMinYen"])
ok("9", "語は入れ替わる", doc.get("ngWords"), DEVALUE_WORDS)
ok("9", "出どころは doneru", doc.get("ngWordsSource"), "doneru")
when = doc.get("ngWordsSyncedAt")
ok("9", "写した時刻は時差つき", isinstance(when, datetime) and when.tzinfo is not None, True)
rc, db = run(data_only(DEVALUE), apply=True)
ok("9", "書類が無くても作れる", (rc, stored(db).get("ngWords")), (0, DEVALUE_WORDS))

print("\n[10] ログに語が1つも出ない。件数と指紋は出る")
out = "".join(TOOL_OUT)
leaked = [w for w in ALL_WORDS if w in out]
ok("10", f"作り物の語 {len(ALL_WORDS)} 個がどれもログに出ない", len(leaked), 0)
ok("10", "件数と指紋は出る", f"→ 4 語（空 1・重複 1 を除いた）・指紋 {fp(DEVALUE_WORDS)}" in out,
   True)
ok("10", "注記にも件数と指紋", f"::notice::禁止ワード 4 語・指紋 {fp(DEVALUE_WORDS)}" in out,
   True)
ok("10", "前の置き場も件数と指紋で出る", f"ngWords 1 語・指紋 {fp(OLD)}" in out, True)

if not BREAK:
    print("\n[11] 対照: 守りを1つずつ外すと、その足だけが落ちる")
    for name, want in DRILLS.items():
        r = subprocess.run([sys.executable, os.path.abspath(__file__)],
                           env={**os.environ, "BREAK": name},
                           capture_output=True, text=True, timeout=120, check=False)
        legs = set()
        for line in r.stdout.splitlines():
            if line.startswith("落ちた足="):
                legs = {x for x in line.split("=", 1)[1].split(",") if x}
        ok("11", f"BREAK={name}: 終了コード 1 で、落ちたのは [{','.join(sorted(want))}] だけ",
           (r.returncode, sorted(legs)), (1, sorted(want)))

print()
if not PROBES:
    print("✕ 確かめが1つもありませんでした（数えるものが無い）")
    sys.exit(2)
legs = sorted({leg for leg, _ in FAILED}, key=int)
print(f"落ちた足={','.join(legs)}")
if FAILED:
    print(f"✕ 通らなかった確かめ {len(FAILED)} 件: {', '.join(n for _, n in FAILED)}")
    sys.exit(1)
print(f"○ {len(PROBES)} 件ぜんぶ通りました")
sys.exit(0)
