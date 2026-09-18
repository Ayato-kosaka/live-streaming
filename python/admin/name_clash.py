"""図鑑の名前が、**配信に映る側（OBS）の目で同じ字になっていないか**数える。

ARGS 例:
  {}                      … 数える（**1バイトも書かない**）
  {"attribute": false}    … 今日ぶんの切り分けをしない（YouTube を引かない）
  {"budget_min": 10}      … 切り分けに使う時間の上限（既定 25分）
  {"show": 60}            … 1件ずつ出す組の数（既定 40）

## なぜ要るのか

同じ「誰の絵か」を引く道は3本あって、**字のそろえかたが道ごとに違う。**

| 誰が引くか | 何を見るか | そろえかた |
| --- | --- | --- |
| 口 / カード | `lookupKeys` に完全一致 | `normKey`（空白も記号も**残す**） |
| 配信の OBS | `channelName` と `aliases` の生の字 | `normalizeName` → **Collator** |

OBS は完全一致で外れると `Intl.Collator("ja", {sensitivity:"base",
usage:"search", ignorePunctuation:true})` に落ちる。これは**空白・記号・
ひらがなとカタカナ・濁点**まで潰す。しかも当たるのは
`prepared.find(...)`＝**先に並んでいた人**なので、2人が Collator の目で
同じ字になっていると、**投げ銭した人と違う人の絵が配信に出る。**

**赤くならない。** あやとから見えるのは「知らない絵が出た」だけで、
ログにも出ない。だから数える。

`#539` で 38人に呼び名（チャンネル名そのもの）を足した。ぶつかりの検査は
`normKey` でしかしていない——**空白も記号も残す側**でしか見ていない。
OBS の側にぶつかりを作った可能性が、そこで空いている。

## 直さない。数えるだけ

ここは**読むだけ**で、`aliases` を1つも消さないし足さない。
何件あって、どれが今日ぶんかを出すところまで。

## 当てる道具は本物を動かす

`app/alertbox/matching.utils.ts` を Python に書き写さない。書き写した
瞬間、本物が変わっても気づけない（`island-misses.md` #147 の決めごと3）。
`node` で**そのファイルそのもの**を読み込んで、`toViewers` と
`matchViewerByNickname` を呼ぶ。動かせなければ、数字を1つも出さずに 2。

## 今日ぶんかどうかの分けかた

`channel_alias` が足したのは **YouTube の表示名そのもの**。同じ引きを
もう一度やれば、その字が出る（鍵は使わない。feed 668バイト）。
引けた人については「その呼び名を取り除いたらぶつからなくなるか」を
数え直す。**引けなかった人は「今日ぶんではない」に混ぜない**——
別枠で「分けられなかった」として出す（`island-standards.md` §10）。

## 対照（本物を1人ぶんも読む前に、毎回）

`run_control()` が**先に**回る。外れたら**本物の数字を1つも出さずに 2**。

  1. ぶつかると分かっている仕込みで、**必ず出る**（空白違い・かな違い）
  2. **同じ人の中のぶつかりを、事故に混ぜない**
  3. **ぶつからない仕込みでは 0件**
  4. 完全一致（`lookupKeys`）の側も、仕込み1件・きれいな仕込み0件
  5. **取り除いたら消える組**を、今日ぶんとして分けられる
  6. **本物の TS を動かしている**（かな違いは `normKey` では出ない）
  7. **読むだけの写しに、1バイトも書けない**

`BREAK=clash|self|clean|keys|today|real|write` で足を1本ずつ抜ける。
抜いたぶんの対照が落ちることまで見るのが `name_clash_selftest.py`。

## 出さないもの

**このリポジトリは公開で、Actions のログも誰でも読める。**
出るのは件数と、`logsafe.mask()` の**指紋**（書類ID・鍵）と、絵文字と、
**「何が潰れたか」の種別**だけ。**名前も呼び名も1文字も出さない。**
ぶつかった組は、どちらも指紋で出す（あとから誰と誰か追えるように）。
"""

import json
import os
import subprocess
import sys
import unicodedata

from _fs import ReadOnly, args, db, log, readonly

sys.path.insert(0, __file__.rsplit("/", 2)[0])

from logsafe import mask  # noqa: E402

sys.path.insert(0, __file__.rsplit("/", 1)[0])
from alertbox_names import keys_of, norm_key  # noqa: E402

CHARACTERS = "islandCharacter"

# Functions 側の MAX_CHARACTERS / MAX_NAME と同じ
MAX_CHARACTERS = 500
MAX_NAME = 80

# 1件ずつ出す組の数の既定。ログが長くなるだけなので頭を打つ
SHOW = 40

# 今日ぶんの切り分けに使う時間の上限（秒）。`channel_alias` と同じ考え
BUDGET = 25 * 60.0

# Collator が何を同じと見るかの見本。**作り物の字だけ。**
# 本物の名前は1つも入っていない（ログは公開）
PROBE = [
    ("空白あり/なし（英字）", "aoi tori", "aoitori"),
    ("空白あり/なし（かな）", "あおい とり", "あおいとり"),
    ("全角/半角（英数）", "ＡＯＩ12", "aoi12"),
    ("全角/半角（カナ）", "ｱｵｲ", "アオイ"),
    ("ひらがな/カタカナ", "あおい", "アオイ"),
    ("濁点あり/なし", "がぎぐ", "かきく"),
    ("半濁点あり/なし", "ぱぴぷ", "はひふ"),
    ("小書き/並字", "ぁぃぅ", "あいう"),
    ("長音あり/なし", "とーり", "とり"),
    ("大文字/小文字", "AOI", "aoi"),
    ("アンダースコア", "aoi_tori", "aoitori"),
    ("ハイフン", "aoi-tori", "aoitori"),
    ("中黒", "あおい・とり", "あおいとり"),
    ("感嘆符", "aoi!", "aoi"),
    ("丸括弧", "aoi(v)", "aoiv"),
    ("読点", "あおい、とり", "あおいとり"),
    ("星印", "aoi★", "aoi"),
    ("波ダッシュ", "aoi~", "aoi"),
    ("絵文字", "aoi🐦", "aoi"),
    ("別の字（対照）", "aoi", "midori"),
    ("数字ちがい（対照）", "aoi1", "aoi2"),
]

# **この2つだけは、こちらが「そうなっているはず」と思っている行。**
# 外れたら（ICU が変わった、など）数字を出さずに止まる。
# 表そのものは実測で、ここは「本物が動いているか」の印
PROBE_MUST = {
    "空白あり/なし（かな）": True,
    "ひらがな/カタカナ": True,
    "別の字（対照）": False,
}


def _break(name: str) -> bool:
    """対照の足を1本抜く。**`BREAK=` を渡したときだけ。**"""
    return (os.getenv("BREAK") or "") == name


def clean(v, max_len: int) -> str:
    """`islandCharacter.ts` の `clean`。**trim してから字数で切る。**"""
    if not isinstance(v, str):
        return ""
    return v.strip()[:max_len]


def guard(client):
    """**読むだけ**の写し。`if` を書き忘れても書けない。"""
    if _break("write"):
        return client
    return readonly(client)


# ------------------------------------------------------- 本物の OBS を動かす
#
# **写しを作らない。** `app/alertbox/matching.utils.ts` そのものを読み込む。

HARNESS = r"""
const { pathToFileURL } = require("url");

/** 本物の matching.utils.ts を読み込む。**写しは作らない。**
 *  道は2本。node が型を剥がせるならそれで、駄目なら typescript で。
 *  どちらも駄目なら、数字を出さずに落ちる（呼ぶ側が 2 にする）。 */
async function load(src) {
  const tried = [];
  try {
    const m = await import(pathToFileURL(src).href);
    if (m && m.matchViewerByNickname) return { m, how: "node(型剥がし)" };
    tried.push("node: 読めたが関数が無い");
  } catch (e) {
    tried.push("node: " + String(e && e.message).slice(0, 80));
  }
  try {
    const fs = require("fs");
    const ts = require("typescript");
    const js = ts.transpileModule(fs.readFileSync(src, "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020,
      },
    }).outputText;
    const mod = { exports: {} };
    new Function("module", "exports", "require", js)(
      mod, mod.exports, require);
    if (mod.exports.matchViewerByNickname) {
      return { m: mod.exports, how: "typescript@" + ts.version };
    }
    tried.push("typescript: 読めたが関数が無い");
  } catch (e) {
    tried.push("typescript: " + String(e && e.message).slice(0, 80));
  }
  throw new Error(tried.join(" / "));
}

function read() {
  return new Promise((ok) => {
    let b = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (d) => { b += d; });
    process.stdin.on("end", () => ok(JSON.parse(b)));
  });
}

async function main() {
  const src = process.argv[2];
  const inp = await read();
  const { m, how } = await load(src);
  const {
    matchViewerByNickname, toViewers, normalizeName, normalizeNameNoEmoji,
  } = m;

  /* 2つの字が「OBS の目で同じ」か。**本物の当て方そのもの**を使う。
     名簿を1人ぶんにして当てれば、当たったかどうかがそのまま答えになる。 */
  const same = (a, b) => !!matchViewerByNickname(
    [{ name: b, norm: normalizeName(b),
       normNoEmoji: normalizeNameNoEmoji(b) }], a);

  /* 見本の表。**この箱の node が実際に何を同じと見るか。** */
  const probe = (inp.probe || []).map(([label, a, b]) => [
    label, normalizeName(a) === normalizeName(b), same(a, b),
  ]);

  /* 名簿を、口が返す形のまま本物に食わせる。
     **`emoji` に人の番号を入れてある**ので、当たった先の持ち主が分かる。 */
  const viewers = toViewers(inp.chars || []);
  const owner = viewers.map((v) => Number(v.emoji));
  const n = viewers.length;

  /* **表記のゆれた字が来たら、誰が返るか。**
     完全一致（1段目・2段目）で当たるあいだは Collator まで落ちないので、
     名簿にある字をそのまま入れても事故は再現しない。**記号を1つ足す**と
     完全一致からは外れ、Collator は記号を無視するので同じ組に落ちる。
     足した字が別の人と完全一致してしまうときは、**測らない**（-2）。 */
  const sway = (s) => {
    const t = s + "!";
    const tn = normalizeName(t);
    for (const v of viewers) {
      if (v.name === t || v.norm === tn) return -2;
    }
    return viewers.indexOf(matchViewerByNickname(viewers, t));
  };

  /* どの組が「同じ字」になるか。**総当たり。**
     行き帰りの両方を見る（当て方が片道だけ通るなら、そこも出す）。 */
  const pairs = [];
  let oneWay = 0;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const ab = same(viewers[i].name, viewers[j].name);
      const ba = same(viewers[j].name, viewers[i].name);
      if (ab !== ba) oneWay++;
      if (!ab && !ba) continue;
      pairs.push([i, j,
        normalizeName(viewers[i].name) === normalizeName(viewers[j].name),
        sway(viewers[i].name), sway(viewers[j].name),
      ]);
    }
  }

  process.stdout.write(JSON.stringify({
    how, node: process.version, icu: process.versions.icu,
    probe, n, owner, pairs, oneWay,
  }));
}

main().catch((e) => {
  process.stdout.write(JSON.stringify({ error: String(e && e.message) }));
  process.exitCode = 3;
});
"""

BLOCKED: list = []


def _node_path() -> str:
    """`node_modules` の在りか。**場所を直書きしない**（#131）。

    worktree から回すと、`node_modules` は本体側にしかない。
    """
    repo = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    repo = os.path.dirname(repo)
    roots = [repo]
    try:
        common = subprocess.run(
            ["git", "-C", repo, "rev-parse", "--path-format=absolute",
             "--git-common-dir"],
            capture_output=True, text=True, timeout=20, check=False,
        ).stdout.strip()
        if common:
            roots.append(os.path.dirname(common))
    except (OSError, subprocess.SubprocessError):
        pass
    # `site` にも typescript が入っている（`selftest.yml` が入れる）
    roots += [os.path.join(repo, "site"), os.path.join(repo, "functions")]
    return os.pathsep.join(os.path.join(r, "node_modules") for r in roots)


def _copy_measure(chars: list, probe=None) -> dict:
    """**写しで測る。** `BREAK=real` のときだけ通る道。

    Python の `norm_key`（＝`normKey` の写し）だけで「同じ字」を決める。
    空白も記号もかなも潰さないので、**Collator が潰す組が全部消える。**
    対照 1 と 6 がここで落ちることを、見張りが確かめる。
    """
    names = []
    owner = []
    for c in chars:
        for nm in [c["channelName"]] + list(c["aliases"]):
            if nm:
                names.append(norm_key(nm))
                owner.append(int(c["emoji"]))
    pairs = [[i, j, True, names.index(names[i]), names.index(names[j])]
             for i in range(len(names)) for j in range(i + 1, len(names))
             if names[i] == names[j]]
    return {"how": "**写し（BREAK=real）**", "node": "-", "icu": "-",
            "probe": [[label, norm_key(a) == norm_key(b),
                       norm_key(a) == norm_key(b)]
                      for label, a, b in (probe or [])],
            "n": len(names), "owner": owner, "pairs": pairs, "oneWay": 0}


def obs_measure(chars: list, probe=None):
    """**本物の `app/alertbox/matching.utils.ts`** に、名簿ごと食わせる。

    Args:
        chars: 口が返す形（`AlertboxCharacter[]`）。`emoji` は人の番号
        probe: 見本の組（表を作るため）

    Returns:
        node が返した辞書。動かせなければ None（理由は `BLOCKED` へ）
    """
    if _break("real"):
        return _copy_measure(chars, probe)
    repo = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    repo = os.path.dirname(repo)
    src = os.path.join(repo, "app", "alertbox", "matching.utils.ts")
    if not os.path.isfile(src):
        BLOCKED.append("matching.utils.ts が見つからない")
        return None
    tmp = os.environ.get("RUNNER_TEMP") or os.environ.get("TMPDIR") or "/tmp"
    hpath = os.path.join(tmp, "_name_clash_harness.cjs")
    with open(hpath, "w", encoding="utf-8") as f:
        f.write(HARNESS)
    # **名前は引数にもファイルにも置かない。** 標準入力で渡す
    payload = json.dumps({"chars": chars, "probe": probe or []},
                         ensure_ascii=False)
    env = dict(os.environ, NODE_PATH=_node_path())
    try:
        r = subprocess.run(
            ["node", hpath, src], input=payload, env=env,
            capture_output=True, text=True, timeout=900, check=False)
    except (OSError, subprocess.SubprocessError) as e:
        BLOCKED.append(f"node を動かせない（{type(e).__name__}）")
        return None
    out = (r.stdout or "").strip()
    if not out:
        why = (r.stderr.strip().splitlines() or [""])[-1][:160]
        BLOCKED.append("node が何も返さなかった: " + why)
        return None
    try:
        got = json.loads(out)
    except json.JSONDecodeError:
        BLOCKED.append("node の返事が読めない")
        return None
    if got.get("error"):
        BLOCKED.append("本物を読み込めない: " + str(got["error"])[:160])
        return None
    return got


# ------------------------------------------------------------ 何が潰れたか
#
# **決めているのは本物の TS。** ここは「どう違うのか」を人に言うための札で、
# 同じかどうかの判定には使わない。

_VOICED = {0x3099, 0x309A}


def _no_space(s: str) -> str:
    return "".join(s.split())


def _no_mark(s: str) -> str:
    return "".join(c for c in s
                   if not unicodedata.category(c).startswith(("P", "S")))


def _kana(s: str) -> str:
    """カタカナをひらがなに寄せる。長音はそのまま（Collator も潰さない）。"""
    return "".join(chr(ord(c) - 0x60) if "ァ" <= c <= "ヶ" else c for c in s)


def _flat(s: str) -> str:
    """濁点・半濁点を落とす。"""
    d = unicodedata.normalize("NFD", s)
    return "".join(c for c in d if ord(c) not in _VOICED)


_WHY = [
    ("空白", _no_space),
    ("記号", _no_mark),
    ("かな", _kana),
    ("濁点", _flat),
]


def why_same(a: str, b: str) -> str:
    """2つの字の**違いの種別**。判定ではなく、読む人への札。"""
    na, nb = norm_key(a), norm_key(b)
    if na == nb:
        return "正規化で同じ（Collator を通る前）"
    for label, fn in _WHY:
        if fn(na) == fn(nb):
            return label

    def allf(s):
        for _, fn in _WHY:
            s = fn(s)
        return s
    if allf(na) == allf(nb):
        return "複合（空白・記号・かな・濁点のいくつか）"
    return "その他（Collator の重みが同じ）"


# ------------------------------------------------------------ 図鑑を読む


def roster(src) -> dict:
    """図鑑を1回だけ全件読む。**並び順は書類ID順。**

    口（`GET /alertbox/…/characters`）は `orderBy` を付けずに
    `limit(MAX_CHARACTERS).get()` するので、OBS が受け取る並びも書類ID順。
    **先に並んだ人が勝つ**ので、ここの並びは本番と同じにしておく。

    Args:
        src: Firestore クライアント（読むだけの写し）

    Returns:
        書類ID -> {emoji, channel, aliases, lookup, chkeys}
    """
    out: dict = {}
    q = (
        src.collection(CHARACTERS)
        .select(["channelName", "aliases", "lookupKeys", "channelKeys",
                 "emoji"])
        .limit(MAX_CHARACTERS)
    )
    for d in q.get():
        v = d.to_dict() or {}
        aliases = [clean(a, MAX_NAME) for a in (v.get("aliases") or [])
                   if isinstance(a, str)]
        out[d.id] = {
            "emoji": clean(v.get("emoji"), 16),
            "channel": clean(v.get("channelName"), MAX_NAME),
            "aliases": [a for a in aliases if a],
            "lookup": [k for k in (v.get("lookupKeys") or [])
                       if isinstance(k, str) and k],
            "chkeys": [k for k in (v.get("channelKeys") or [])
                       if isinstance(k, str) and k],
        }
    return dict(sorted(out.items()))


def to_chars(book: dict, drop=None) -> tuple:
    """図鑑を、口が返す形にする。**`emoji` に人の番号を入れる。**

    Args:
        book: `roster()` の返り
        drop: 書類ID -> 外す呼び名の集合（今日ぶんを抜いて数え直すため）

    Returns:
        (chars, 番号 -> 書類ID, (書類ID, 名前) の並び)
    """
    drop = drop or {}
    chars = []
    ids = []
    names = []
    for i, (doc_id, v) in enumerate(book.items()):
        gone = drop.get(doc_id) or set()
        alias = [a for a in v["aliases"] if a not in gone]
        chars.append({
            "id": doc_id, "emoji": str(i), "channelName": v["channel"],
            "aliases": alias, "plain": None, "scene": None,
        })
        ids.append(doc_id)
        if v["channel"]:
            names.append((doc_id, v["channel"]))
        names += [(doc_id, a) for a in alias]
    return chars, ids, names


def count_pairs(got: dict, ids: list, names: list) -> tuple:
    """node の返事を、**同じ人の中／違う人どうし**に分ける。

    Returns:
        (同じ人の中の組, 違う人どうしの組,
         そのうち**正規化しても同じ字**の組,
         表記がゆれた字で**別人が返る**名前の並び)
    """
    owner = got["owner"]
    mine: list = []
    cross: list = []
    exact: list = []
    risk: list = []
    for i, j, norm_eq, pi, pj in got["pairs"]:
        if owner[i] == owner[j] and not _break("self"):
            mine.append((i, j))
            continue
        cross.append((i, j))
        if norm_eq:
            # **送られた字がそのままでも別人が返る。** 完全一致の段で
            # 先に並んだ人に当たるので、Collator まで落ちない
            exact.append((i, j))
        for k, hit in ((i, pi), (j, pj)):
            if hit >= 0 and owner[hit] != owner[k]:
                risk.append((k, hit))
    if _break("clean"):
        # ぶつかっていない組を1つ、事故として数える（対照 3 が落ちる）
        cross.append((0, 0))
    if _break("clash"):
        cross, exact, risk = [], [], []
    return mine, cross, exact, risk


def key_clash(book: dict, field: str) -> list:
    """完全一致の側。**2人以上が同じ鍵を持っていないか。**

    Args:
        book: `roster()` の返り
        field: `lookup`（口・カード）か `chkeys`（スパチャ）

    Returns:
        (鍵, 持っている人の書類ID の並び) の並び
    """
    if _break("keys"):
        return []
    owner: dict = {}
    for doc_id, v in book.items():
        for k in set(v[field]):
            owner.setdefault(k, []).append(doc_id)
    return sorted((k, sorted(w)) for k, w in owner.items() if len(w) > 1)


# ---------------------------------------------------------------- 対照
#
# **本物を1人ぶんも読む前に、毎回回る。** 仕込みの名前は作り物で、
# 本物のハンドルも呼び名も1つも入っていない。

_C_DOC = {k: f"{i}" + "0123456789abcdef" * 2 for i, k in enumerate(
    ["space1", "space2", "kana1", "kana2", "self", "clean1", "clean2",
     "key1", "key2"])}

# 書類ID の**並び順**がそのまま OBS の並びになるので、仕込みも並べておく。
# (鍵, チャンネル名, 呼び名, 今日足した形とみなす呼び名)
_C_BOOK = {
    # 1. 空白1つ違い。**違う人どうし。今日足した呼び名が原因**
    "space1": ("@shirokuma0001", ["しろくま ひめ"], "しろくま ひめ"),
    "space2": ("しろくまひめ", [], None),
    # 2. ひらがな/カタカナ違い。**`normKey` では出ない**（対照 6）。
    #    ここは今日ぶんではない——**抜いても残る**ことで対照 5 が立つ
    "kana1": ("@aozora0002", ["あおぞら"], None),
    "kana2": ("アオゾラ", [], None),
    # 3. 同じ人の中。**どちらに当たっても同じ人なので無害**
    "self": ("@nagisa0003", ["なぎさ びより", "なぎさびより"], None),
    # 4. ぶつからない2人（対照 3）
    "clean1": ("@tsukikage0004", ["つきかげ"], "つきかげ"),
    "clean2": ("@himawari0005", ["ひまわり ばたけ"], "ひまわり ばたけ"),
    # 5. 完全一致の側だけがぶつかる2人（対照 4）
    "key1": ("@kagerou0006", ["かげろう"], None),
    "key2": ("@kagerou0007", ["かげろう"], None),
}

# きれいな仕込み（対照 3）。ここだけで数え直すと 0件でなければならない
_C_CLEAN = ("clean1", "clean2")

# **出てほしい組**（対照 1）。空白違い・かな違い・完全一致でぶつかる2人。
# 数ではなく、この組そのものが出ることを見る
_C_CROSS = (("space1", "space2"), ("kana1", "kana2"), ("key1", "key2"))

# 今日ぶん（チャンネル名そのものの呼び名）を抜いたあとに**残る**組（対照 5）
_C_AFTER = (("kana1", "kana2"), ("key1", "key2"))


def _want(pairs) -> set:
    """仕込みの鍵の組を、書類IDの組に直す。"""
    return {tuple(sorted((_C_DOC[a], _C_DOC[b]))) for a, b in pairs}


def _control_book(keys) -> dict:
    book: dict = {}
    for key in keys:
        channel, aliases, _today = _C_BOOK[key]
        book[_C_DOC[key]] = {
            "emoji": "🐚", "channel": channel, "aliases": list(aliases),
            "lookup": keys_of([channel] + list(aliases)),
            "chkeys": keys_of([channel]),
        }
    return dict(sorted(book.items()))


class _Counter:
    """偽の Firestore。**書かれた回数を数えるだけ。**"""

    def __init__(self):
        self.writes = 0

    def collection(self, name):
        return self

    def document(self, key):
        return self

    def set(self, *a, **k):
        self.writes += 1

    def update(self, *a, **k):
        self.writes += 1

    def delete(self, *a, **k):
        self.writes += 1


def run_control() -> tuple:
    """**対照。** (落ちた理由の並び, 見本の表) を返す。理由が空なら通った。"""
    bad: list = []

    # --- 全部入りの仕込みで測る
    book = _control_book(_C_BOOK.keys())
    chars, ids, names = to_chars(book)
    got = obs_measure(chars, PROBE)
    if got is None:
        return (["(0) 本物の OBS を動かせない: " + " / ".join(BLOCKED)], [])

    # 6. 本物が動いているか。**かな違いは `normKey` では出ない**
    table = {row[0]: row for row in (got.get("probe") or [])}
    probe = got.get("probe") or []
    for label, want in PROBE_MUST.items():
        row = table.get(label)
        if not row:
            bad.append(f"(6) 見本の表に「{label}」が無い")
        elif bool(row[2]) != want:
            bad.append(f"(6) 「{label}」が {'同じ' if want else 'ちがう'}"
                       "になっていない（本物が動いていない / ICU が違う）")

    mine, cross, exact, risk = count_pairs(got, ids, names)
    cross_docs = {tuple(sorted(names[i][0] for i in (a, b)))
                  for a, b in cross}
    mine_docs = [tuple(sorted(names[i][0] for i in (a, b))) for a, b in mine]

    # 1. ぶつかると分かっている仕込みで、必ず出る。
    #    **数ではなく、どの組かで見る。** 数だけ合っていても中身が
    #    入れ替わっていたら測れていない
    if cross_docs != _want(_C_CROSS):
        bad.append("(1) 出てほしい組と、出た組が違う"
                   f"（{len(cross_docs)}組 出た / 欲しいのは"
                   f" {len(_C_CROSS)}組）")
    if not risk:
        bad.append("(1) 表記のゆれた字で別人が返る名前が、1件も出ていない")
    if len(exact) != 1:
        bad.append(f"(1) 正規化しても同じ字の組が {len(exact)}"
                   "（欲しいのは 1。完全一致でぶつかる2人）")
    # **先に並んだ人が勝つ。** 並び順を取り違えていないことまで見る
    early = {_C_DOC[k] for k in ("space1", "kana1", "key1")}
    late = [names[k][0] for k, _hit in risk]
    if any(d in early for d in late):
        bad.append("(1) 先に並んでいる人のほうが、取り違えられる側に出た")

    # 2. 同じ人の中を、事故に混ぜない
    selfpair = (_C_DOC["self"], _C_DOC["self"])
    if selfpair not in mine_docs:
        bad.append("(2) 同じ人の中のぶつかりを拾えていない")
    if any(a == b for a, b in cross_docs):
        bad.append("(2) 同じ人の中のぶつかりを、事故に数えた")

    # 3. ぶつからない仕込みでは 0件
    cbook = _control_book(_C_CLEAN)
    cchars, cids, cnames = to_chars(cbook)
    cgot = obs_measure(cchars)
    if cgot is None:
        bad.append("(3) きれいな仕込みを測れなかった")
    else:
        _m, ccross, cexact, crisk = count_pairs(cgot, cids, cnames)
        if ccross:
            bad.append(f"(3) ぶつからない仕込みで {len(ccross)}組 出た")
        if crisk or cexact:
            bad.append("(3) ぶつからない仕込みで 別人が返ると出た")

    # 4. 完全一致（lookupKeys）の側
    kc = key_clash(book, "lookup")
    if len(kc) != 1:
        bad.append(f"(4) 完全一致のぶつかりが {len(kc)}件（欲しいのは 1）")
    if cgot is not None and key_clash(cbook, "lookup"):
        bad.append("(4) きれいな仕込みで、完全一致のぶつかりが出た")

    # 5. 取り除いたら消える組を、今日ぶんとして分けられる
    drop = {}
    for key, (_c, _a, today) in _C_BOOK.items():
        if today and not _break("today"):
            drop.setdefault(_C_DOC[key], set()).add(today)
    dchars, dids, dnames = to_chars(book, drop)
    dgot = obs_measure(dchars)
    if dgot is None:
        bad.append("(5) 今日ぶんを抜いた仕込みを測れなかった")
    else:
        _m2, dcross, _e2, _r2 = count_pairs(dgot, dids, dnames)
        after = {tuple(sorted(dnames[i][0] for i in (x, y)))
                 for x, y in dcross}
        # 空白の組だけが今日ぶんで消え、かなと完全一致の組は残る
        if after != _want(_C_AFTER):
            bad.append("(5) 今日ぶんを抜いたあとに残る組が違う"
                       f"（{len(after)}組 残った / 欲しいのは"
                       f" {len(_C_AFTER)}組）")
        gone = len(cross) - len(dcross)
        if gone != 1:
            bad.append(f"(5) 今日ぶんで消える組が {gone}（欲しいのは 1）")

    # 7. 読むだけの写しに書けない
    probe_db = _Counter()
    src = guard(probe_db)
    try:
        src.collection(CHARACTERS).document("x").set({"a": 1})
    except ReadOnly:
        pass
    except Exception as e:  # noqa: BLE001
        bad.append(f"(7) 読むだけの写しが思わぬ落ち方をした（{type(e)}）")
    else:
        bad.append("(7) 読むだけの写しに書けてしまった")
    if probe_db.writes:
        bad.append(f"(7) 読むだけのはずが {probe_db.writes} 回書かれた")

    return bad, probe


# ---------------------------------------------------------------- 今日ぶん


def fetch_today(src, book: dict, budget: float) -> tuple:
    """図鑑の `channelId` から表示名を引き直して、今日の形を割り出す。

    Returns:
        (書類ID -> 外す呼び名の集合, 引けた人数,
         名前が無い・消えている人数, **引けなかった**人数)
    """
    import channel_alias as ca

    q = (src.collection(CHARACTERS).select(["channelId"])
         .limit(MAX_CHARACTERS))
    cid = {d.id: clean((d.to_dict() or {}).get("channelId"), 64)
           for d in q.get()}
    small = {doc: {"channelId": cid.get(doc, "")} for doc in book}
    got = ca.fetch_all(small, budget=budget)
    drop: dict = {}
    ok = none = blind = 0
    for doc, v in book.items():
        g = got.get(doc)
        if g is None or g.kind == ca.BLIND:
            # **読めなかった。** この人の呼び名が今日ぶんかは分けられない
            blind += 1
            continue
        if g.kind != ca.GOT:
            # 消えている・名前が空・channelId が無い。**今日は足されていない**
            # （`channel_alias` は GOT のときしか足さない）
            none += 1
            continue
        ok += 1
        want = norm_key(g.name)
        if not want or want == norm_key(v["channel"]):
            continue
        for a in v["aliases"]:
            if norm_key(a) == want:
                drop.setdefault(doc, set()).add(a)
    return drop, ok, none, blind


# ---------------------------------------------------------------- 本体


def main() -> None:
    a = args()
    show = a.get("show")
    show = int(show) if isinstance(show, (int, float)) else SHOW
    budget = a.get("budget_min")
    budget = float(budget) * 60 if isinstance(budget, (int, float)) else BUDGET
    attribute = a.get("attribute") is not False

    # **対照が先。** 外れたら、本物の数字を1つも出さずに 2 で止まる
    bad, probe = run_control()
    if bad:
        log.error("対照が落ちました。**本物の名簿は1人も見ていません**")
        for line in bad:
            log.error("  %s", line)
        raise SystemExit(2)
    log.info("対照 7つ、通りました"
             "（出る／混ぜない／0件／完全一致／今日ぶん／本物／読むだけ）")

    log.info("Collator の目（実測。**作り物の字だけ**）")
    log.info("  %-22s %-14s %s", "見本", "正規化で同じ", "OBS で同じ")
    for label, norm_eq, obs_eq in probe:
        log.info("  %-22s %-14s %s", label,
                 "はい" if norm_eq else "いいえ",
                 "**はい**" if obs_eq else "いいえ")

    client = db()
    src = guard(client)
    book = roster(src)
    if not book:
        # 0人と「読めていない」を同じ顔で返さない
        log.error("図鑑が1件も返りませんでした。**数えられていません**")
        raise SystemExit(2)

    chars, ids, names = to_chars(book)
    got = obs_measure(chars)
    if got is None:
        log.error("本物の OBS を動かせませんでした: %s", " / ".join(BLOCKED))
        raise SystemExit(2)
    log.info("本物を動かしました: %s / node %s / ICU %s",
             got.get("how"), got.get("node"), got.get("icu"))
    n_alias = sum(len(v["aliases"]) for v in book.values())
    log.info("図鑑: %d人 / 名前 %d件（チャンネル名 %d ＋ 呼び名 %d）",
             len(book), got["n"], got["n"] - n_alias, n_alias)
    if got["n"] != len(names):
        log.error("名前の数が食い違いました（%d と %d）。数えていません",
                  got["n"], len(names))
        raise SystemExit(2)
    if got.get("oneWay"):
        log.info("  片道だけ当たる組: %d（当て方が左右で違う）",
                 got["oneWay"])

    mine, cross, exact, risk = count_pairs(got, ids, names)
    log.info("OBS（app/alertbox）の目で同じ字になる組")
    log.info("  同じ人の中（無害）        … %d組", len(mine))
    log.info("  **違う人どうし（事故）**  … %d組", len(cross))
    log.info("    うち、正規化しても同じ字（**送られた字そのままで"
             "別人が返る**） … %d組", len(exact))
    log.info("    Collator でだけ同じ（表記がゆれた字で当たる） … %d組",
             len(cross) - len(exact))
    log.info("  表記がゆれた字で来たとき、**別人が返る名前** … %d件 / %d件中",
             len(risk), got["n"])

    kinds: dict = {}
    for i, j in cross:
        k = why_same(names[i][1], names[j][1])
        kinds[k] = kinds.get(k, 0) + 1
    if kinds:
        log.info("  何が潰れたか")
        for k, c in sorted(kinds.items(), key=lambda x: -x[1]):
            log.info("    %-32s … %d組", k, c)

    for i, j in cross[:show]:
        da, dbb = names[i][0], names[j][0]
        log.info("    %s %s ↔ %s %s / %s / 鍵 %s ↔ %s",
                 mask(da), book[da]["emoji"] or "（絵文字なし）",
                 mask(dbb), book[dbb]["emoji"] or "（絵文字なし）",
                 why_same(names[i][1], names[j][1]),
                 mask(norm_key(names[i][1])), mask(norm_key(names[j][1])))
    if len(cross) > show:
        log.info("    （ほか %d組）", len(cross) - show)

    # ---- 完全一致（lookupKeys / channelKeys）の側
    for field, whom in (("lookup", "口・カード（lookupKeys）"),
                        ("chkeys", "スパチャ（channelKeys）")):
        kc = key_clash(book, field)
        log.info("完全一致 %s で 2人以上に当たる鍵 … %d件", whom, len(kc))
        for k, who in kc[:show]:
            log.info("    鍵 %s ← %s", mask(k),
                     " / ".join(mask(w) for w in who))

    # ---- 今日ぶんの切り分け
    if not attribute:
        log.info("今日ぶんの切り分けはしていません"
                 '（{"attribute": true} で引き直します）')
    else:
        # **ぶつかりが 0組 でも引き直す。** 「今日ぶんの呼び名が図鑑に
        # 何件入っているか」は、0組を読むときの分母になる。
        # 引かずに「0組だから切り分けは要らない」と書くと、
        # **何も測っていないことが合格に見える**（`island-standards.md` §15）
        log.info("今日ぶん（チャンネル名そのものの呼び名）を"
                 "抜いて数え直します")
        drop, ok, none, blind = fetch_today(src, book, budget)
        n_drop = sum(len(v) for v in drop.values())
        log.info("  表示名を引けた … %d人 / 名前が無い・消えている … %d人"
                 " / **引けなかった** … %d人", ok, none, blind)
        log.info("  チャンネル名そのものの呼び名 … %d件 / %d人",
                 n_drop, len(drop))
        dchars, dids, dnames = to_chars(book, drop)
        dgot = obs_measure(dchars)
        if dgot is None:
            log.error("抜いたほうを測れませんでした: %s", " / ".join(BLOCKED))
            raise SystemExit(2)
        _m, dcross, dexact, drisk = count_pairs(dgot, dids, dnames)
        log.info("  抜いたあと: 違う人どうし … %d組"
                 "（うち同じ字 %d組 / 別人が返る名前 %d件）",
                 len(dcross), len(dexact), len(drisk))
        log.info("  **その呼び名を取り除いたら消える組** … %d組",
                 len(cross) - len(dcross))
        if blind:
            log.info("  ただし %d人は表示名を引けていないので、"
                     "その人ぶんは**分けられていません**", blind)

    log.info("---- 読むだけです。1バイトも書いていません ----")
    after = roster(src)
    if len(after) != len(book):
        log.error("数えているあいだに図鑑の人数が変わりました")
        raise SystemExit(2)
    if cross:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
