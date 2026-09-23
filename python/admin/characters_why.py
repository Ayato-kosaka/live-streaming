"""図鑑の**チャンネルIDが空の人**について、**残すか消すかを決める材料**を並べる。

ARGS 例:
  {}                    … 材料を出す。**1バイトも書かない**
  {"budget_min": 10}    … 表示名を引くのに使う時間の上限（既定 25分）

## なぜ要るのか ── 「0人」と「選べない」が、いま同じ顔をしている

`characters_name_match.py` は **完全一致**でしか突き合わせていない
（`keys_of()` が `normalizeName` / `normalizeNameNoEmoji` の3段だけを使い、
Collator まで落ちないのは意図したとおり。あちらは `channelId` を**書く**
道具なので、広げると人違いをそのまま本番に書き込む）。

その結果、空いている人はどれも「当たらない」に落ちる。だが

- **本当にチャットに1人も居ない**（＝もう来ていない見込み）
- **かな／カナ・濁点・空白の違いで外れているだけで、目の前に1人居る**

は、あやとにとって**まったく別の話**なのに、いまは見分けがつかない。
ここを割るのがこの道具の仕事。**割るだけで、1バイトも書かない。**

## ゆるい鍵は、写さずに**本物を動かして**作る

広げるのに使うのは、配信の OBS が完全一致で外れたときに落ちる先
——`Intl.Collator("ja", {sensitivity:"base", usage:"search",
ignorePunctuation:true})` ——そのもの。空白・記号・ひらがなとカタカナ・
濁点・長音まで潰す。

**Python に書き写さない。** `app/alertbox/matching.utils.ts` を
`node` で読み込んで、**`matchViewerByNickname` をそのまま呼ぶ**
（`name_clash.py` と同じ作法。写しを作った瞬間、本物が変わっても
気づけない。`docs/island-misses.md` #147 の決めごと3）。

`name_clash.py` の HARNESS と似た形をしているが、**訊いていることが違う。**
あちらは名簿の中の総当たり（誰と誰がぶつかるか）で、こちらは
**図鑑の1人 × チャットの表示名ぜんぶ**（何人が近いか）。当て方そのものは
どちらも本物の関数を呼ぶだけなので、写しているのは「本物を読み込む手順」
だけにしてある。

**ゆるい鍵は材料であって、結ぶ根拠ではない。** ここで 1人 と出ても、
その1人を `channelId` に書くのはこの道具の仕事ではない（広げた鍵で書くと、
その人の投げ銭が別人の絵で出続ける）。決めるのはあやと。

## 表に出る列

| 列 | 何の役に立つか |
| --- | --- |
| 絵文字 | **あやとが図鑑の画面で照合する鍵。**行の見出し |
| 指紋 | 絵文字が無い人・同じ絵文字の人を見分ける（`logsafe.mask()`） |
| 載 | 図鑑に載った日（`createdAt`）。古い＝もう来ていない見込み |
| 直 | 最後に画面から直された日（`editedAt`）。生きている書類か |
| 絵 | 絵の枚数（`images.plain` / `images.scene`）。手をかけて送ってくれた人か |
| 名 | 呼び名の件数（`aliases` ＋ `@` で始まらない `channelName`） |
| 島 | `site/content/residents.ts` に居るか（＝島に立っているか） |
| 完全 | **完全一致**でチャットに当たる人数（いまの道具と同じ見方） |
| ゆる | **ゆるい一致**でチャットに近い人数。**0 なら本当に居ない** |
| 近 | ゆるい一致の相手のうち、**いちばんよく来ている1人**の
       コメント件数 / 一緒にいた日数 / 最後に喋った日 |
| 銭 | 投げ銭の台帳（`islandTips`）に、**名前で**近い行が何件あるか |

**`銭` は名前でしか当たらない。** この人たちは `channelId` を持たないので、
台帳とは名前以外に繋がる道が無い。**「たぶんこの人」は混ぜない**ので、
近い行が1件も無ければ `銭0` と出るだけ。当たった行に `channelId` が
入っていれば `(ch1)` のように添える——**そこが、結べるかもしれない唯一の糸。**

## 何を出さないか

**このリポジトリは公開で、Actions のログも誰でも読める。**
出すのは **絵文字** と **日付** と **件数** と `logsafe.mask()` の**指紋**だけ。
**名前・呼び名・表示名・ハンドル・チャンネルID・チャット本文は1文字も出さない。**
ARGS にも名前を取らない（ARGS はログに出る）。

**入力で切り替えられる形にしていない。** `firestore_read.py` の頭にあるとおり、
入力で安全を選ぶ形にすると、選び間違えた1回で漏れる。ここは
**そもそも名前を行に入れる道が無い**（行を作るのは `lines()` 1か所だけで、
そこへ名前は渡っていない）。そのうえで、**本物を1人ぶんも読む前に**
対照 (5) が「仕込んだ名前が行に1文字も出ない」ことを毎回確かめる。

## 対照（本物を1人ぶんも読む前に、毎回）

`run_control()` が**先に**回る。外れたら**本物の数字を1つも出さずに 2**。

  1. **ゆるい鍵が、完全一致では外れる字を当てる**（かな／カナ・濁点・空白）。
     かつ **別人どうしは当てない**（広すぎない）
  2. **呼び名を1つも持たない人も、表から落とさない**（欠けない）
  3. **引けなかったチャンネルを「居ない」に混ぜない**
  4. **ゆるい一致が片側に寄ったら、材料として出さずに 1 で落ちる**
  5. **出す行に、仕込んだ名前が1文字も出ない**
  6. **読むだけの写しに、1バイトも書けない**

`BREAK=loose|keep|blind|split|secret|write` で足を1本ずつ抜ける。
抜いたぶんの対照が落ちることまで見るのが `characters_why_selftest.py`。

## 終了コード

  0 … 材料を出した（ゆるい一致が **0人と1人以上に割れた**）
  1 … **全員が同じ側に寄った**（鍵が広すぎるか狭すぎる。材料にならない）
  2 … **測れていない**（対照が落ちた／図鑑が読めない／空いている人が居ない／
      チャットが0件／表示名を1つも引けない／本物の TS を動かせない／
      `residents.ts` が見つからない）
"""

import json
import os
import subprocess
import sys

from _fs import ReadOnly, args, db, log, readonly

sys.path.insert(0, __file__.rsplit("/", 2)[0])

from logsafe import mask  # noqa: E402

sys.path.insert(0, __file__.rsplit("/", 1)[0])

# **道具を写さずに借りる。** 図鑑の読み方・チャットの引き方・表示名の
# 引き方・完全一致の鍵は、すでに `characters_name_match` が持っている。
# ここで2本目を書くと、片方だけ直した日にこちらが別の答えを出す
import characters_name_match as nm  # noqa: E402
from name_clash import _node_path  # noqa: E402

CHARACTERS = nm.CHARACTERS
MAX_NAME = nm.MAX_NAME
MAX_CHARACTERS = nm.MAX_CHARACTERS

# 台帳を読む上限。本番は 1,357件（`docs/island-db.md`）。
# **超えたら黙って切らずに、切ったことを行に出す**
MAX_TIPS = 5000

# 「近い人」を1人ぶん調べに行く上限。ゆるい一致が何十人も出た人は、
# いちばん喋っている人だけ見れば足りる（全部引くと読み込みが増えるだけ）
MAX_PEEK = 10


def _break(name: str) -> bool:
    """対照の足を1本抜く。**`BREAK=` を渡したときだけ。**

    Args:
        name: 抜く足の名前

    Returns:
        その足を抜くなら True
    """
    return (os.getenv("BREAK") or "") == name


def guard(client):
    """**読むだけ**の写し。`if` を書き忘れても書けない。

    Args:
        client: `db()` で作ったクライアント

    Returns:
        書く口を塞いだ写し
    """
    if _break("write"):
        return client
    return readonly(client)


def wpad(s: str, n: int) -> str:
    """見た目の幅で右に詰める。**字数で詰めない。**

    絵文字と日本語は1字で2桁ぶん幅を取るので、`ljust` で揃えると
    表の列がずれる。ずれた表は、読む人が列を数え直すことになる。

    Args:
        s: 詰める字
        n: 欲しい幅（半角いくつぶん）

    Returns:
        右に空白を足した字
    """
    import unicodedata

    w = 0
    for ch in s:
        w += 2 if unicodedata.east_asian_width(ch) in "WF" else 1
        # 絵文字は `east_asian_width` が `N` を返すものが多いが、
        # 端末では2桁で出る。記号の面に居るものは2桁として数える
        if 0x1F000 <= ord(ch) <= 0x1FAFF or 0x2600 <= ord(ch) <= 0x27BF:
            w += 1
    return s + " " * max(0, n - w)


def day_of(v) -> str:
    """ISO8601 の頭10文字（＝日付）だけ取る。無ければ `-`。

    **時刻まで出さない。** 日付があれば「古いか／最近か」は読めるし、
    時刻は誰が何時に来たかに近づく。

    Args:
        v: `createdAt` / `editedAt` に入っていた値

    Returns:
        `YYYY-MM-DD` か `-`
    """
    if not isinstance(v, str) or len(v) < 10:
        return "-"
    head = v[:10]
    return head if head[4] == "-" and head[7] == "-" else "-"


# ------------------------------------------------------------ 図鑑を読む


def roster_all(src) -> tuple:
    """図鑑を1回だけ全件読む。**空いている人を、1人も落とさずに返す。**

    `characters_name_match.roster()` は**呼び名を1つも持たない人を落とす。**
    あちらは当てる道具なので、それで正しい（当てようが無い）。ここは
    **「10人ぜんぶが表に出る」が合格の条件**なので、落とさずに理由ごと持つ。

    Args:
        src: Firestore クライアント（読むだけの写し）

    Returns:
        （空いている人 書類ID -> 材料, 使われている channelId の数, 図鑑の人数）
    """
    blanks: dict = {}
    taken = 0
    total = 0
    q = (
        src.collection(CHARACTERS)
        .select(["channelName", "aliases", "emoji", "channelId",
                 "createdAt", "editedAt", "images"])
        .limit(MAX_CHARACTERS)
    )
    for d in q.get():
        v = d.to_dict() or {}
        total += 1
        if nm.clean(v.get("channelId"), 64):
            taken += 1
            continue
        channel = nm.clean(v.get("channelName"), MAX_NAME)
        names = [nm.clean(a, MAX_NAME) for a in (v.get("aliases") or [])
                 if isinstance(a, str)]
        # **`@` で始まらない `channelName` も表示名。**
        # `characters_migrate` が `@` 付きだけを `channelName` に入れた
        if channel and not channel.startswith("@"):
            names.append(channel)
        names = [x for x in dict.fromkeys(names) if x]
        im = v.get("images") if isinstance(v.get("images"), dict) else {}
        pics = sum(1 for r in ("plain", "scene") if isinstance(im.get(r), dict))
        blanks[d.id] = {
            "emoji": nm.clean(v.get("emoji"), 16),
            "names": names,
            "created": day_of(v.get("createdAt")),
            "edited": day_of(v.get("editedAt")),
            "pics": pics,
            # `@` しか持っていない人は「呼び名が無い」ではなく
            # 「ハンドルしか無い」。**理由を分けて持つ**
            "handle_only": bool(channel and channel.startswith("@")),
        }
    return blanks, taken, total


# ------------------------------------------------------------ 島に出ているか


def island_icons(root: str) -> set:
    """`site/content/residents.ts` に並んでいる**キャラクターの書類ID**。

    島に立つ候補はここが決める（`residents.ts` の頭にそう書いてある）。
    焼き込みなので、**読めなかったら 0件 に畳まず投げる**——
    「島に1人も居ない」と「ファイルが無い」を同じ顔にしない。

    Args:
        root: リポジトリの根

    Returns:
        書類IDの集合

    Raises:
        FileNotFoundError: 焼き込みが無い
    """
    import re

    path = os.path.join(root, "site", "content", "residents.ts")
    with open(path, encoding="utf-8") as f:
        text = f.read()
    return set(re.findall(r'icon:\s*"([^"]+)"', text))


def repo_root() -> str:
    """リポジトリの根。**場所を直書きしない**（`island-misses.md` #129 #131）。

    Returns:
        根の絶対パス
    """
    here = os.path.dirname(os.path.abspath(__file__))
    return os.path.dirname(os.path.dirname(here))


# ------------------------------------------------ ゆるい鍵（本物の OBS を動かす）
#
# **写しを作らない。** `app/alertbox/matching.utils.ts` そのものを読み込む。
# 読み込む手順は `name_clash.py` の HARNESS と同じ（本物を動かす道は
# node の型剥がしと typescript の2本しかない）。数えているものは別物。

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
    matchViewerByNickname, normalizeName, normalizeNameNoEmoji,
  } = m;

  /* 図鑑の1人ぶんを、名簿1つぶんの形にする。**口が返す形と同じ。**
     ここへ当てて返ってきたら「その字は、この人の絵で出る」。
     ＝ OBS がその名乗りを見たときに実際にすることそのもの。 */
  const prep = (names) => names.map((s) => ({
    name: s, norm: normalizeName(s), normNoEmoji: normalizeNameNoEmoji(s),
  }));

  /* どの人に、どの字が近いか。**人ごとに当てる**——
     名簿をまとめて渡すと `find` が先に並んだ1人しか返さないので、
     「何人が近いか」が数えられない。 */
  const out = {};
  for (const [key, names] of Object.entries(inp.people || {})) {
    const viewers = prep(names);
    const hits = {};
    for (const [pool, items] of Object.entries(inp.pools || {})) {
      const got = [];
      for (let i = 0; i < items.length; i++) {
        /* 1つの字につき、しっぽを落とした形まで見る（呼ぶ側が並べている）。
           どれか1つでも当たれば、その字はこの人に近い。 */
        let hit = false;
        for (const s of items[i]) {
          if (matchViewerByNickname(viewers, s)) { hit = true; break; }
        }
        if (hit) got.push(i);
      }
      hits[pool] = got;
    }
    out[key] = hits;
  }

  process.stdout.write(JSON.stringify({
    how, node: process.version, icu: process.versions.icu, out,
  }));
}

main().catch((e) => {
  process.stdout.write(JSON.stringify({ error: String(e && e.message) }));
  process.exitCode = 3;
});
"""

BLOCKED: list = []


def _copy_loose(people: dict, pools: dict) -> dict:
    """**写しで広げる。** `BREAK=loose` のときだけ通る道。

    Collator を使わず、前後空白落とし＋小文字化の**完全一致**だけにする。
    かな／カナも濁点も空白も潰さないので、対照 1 がここで落ちる。
    それを見張りが確かめる。

    Args:
        people: 鍵 -> 呼び名の一覧
        pools: 名前 -> [その字のゆれの一覧]

    Returns:
        `loose()` と同じ形
    """
    out: dict = {}
    for key, names in people.items():
        flat = {s.strip().lower() for s in names}
        hits = {}
        for pool, items in pools.items():
            hits[pool] = [i for i, ss in enumerate(items)
                          if any(s.strip().lower() in flat for s in ss)]
        out[key] = hits
    return {"how": "**写し（BREAK=loose）**", "node": "-", "icu": "-",
            "out": out}


def loose(people: dict, pools: dict):
    """**本物の `matchViewerByNickname`** に当てて、近い字の場所を貰う。

    Args:
        people: 鍵 -> 呼び名（しっぽ落としまで並べたもの）
        pools: 名前 -> [その字のゆれの一覧]（順は呼ぶ側が持っている）

    Returns:
        `{"how":…, "out": {鍵: {名前: [場所]}}}`。動かせなければ None
    """
    if _break("loose"):
        return _copy_loose(people, pools)
    src = os.path.join(repo_root(), "app", "alertbox", "matching.utils.ts")
    if not os.path.isfile(src):
        BLOCKED.append("matching.utils.ts が見つからない")
        return None
    tmp = os.environ.get("RUNNER_TEMP") or os.environ.get("TMPDIR") or "/tmp"
    hpath = os.path.join(tmp, "_char_why_harness.cjs")
    with open(hpath, "w", encoding="utf-8") as f:
        f.write(HARNESS)
    # **字は引数にもファイルにも置かない。** 標準入力で渡す
    payload = json.dumps({"people": people, "pools": pools},
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


def spread(names: list) -> list:
    """1つの字から、突き合わせに使う形を並べる（しっぽ落としまで）。

    `characters_name_match.variants` をそのまま借りる。YouTube が付ける
    `-r9z` や4桁の数字は本人が名乗っている字ではない。

    Args:
        names: 元の字の一覧

    Returns:
        ゆれまで並べた字の一覧（重複なし）
    """
    out: list = []
    for s in names:
        for v in nm.variants(s):
            if v and v not in out:
                out.append(v)
    return out


# ------------------------------------------------------------ 材料を組む


def build(blanks: dict, titles: dict, counts: dict, exact: dict,
          near: dict, tips: list, got: dict, unseen: int,
          icons: set) -> list:
    """1人ぶんの材料を組む。**読むだけ。**

    Args:
        blanks: `roster_all()` の空いている人
        titles: channelId -> (種別, 表示名)
        counts: channelId -> チャットの件数
        exact: 書類ID -> 完全一致した channelId の集合
        near: 書類ID -> {"chat": [場所], "tips": [場所]}
        tips: 台帳の行（`channelId` を持つか だけ）
        got: 引けた channelId の並び（`near["chat"]` の場所が指す先）
        unseen: 引けなかったチャンネルの数
        icons: `residents.ts` に並んでいる書類ID

    Returns:
        1人1件の材料
    """
    rows = []
    for doc_id in sorted(blanks):
        v = blanks[doc_id]
        hits = near.get(doc_id) or {}
        chat = [got[i] for i in (hits.get("chat") or []) if i < len(got)]
        tip_at = [i for i in (hits.get("tips") or []) if i < len(tips)]
        rows.append({
            "id": doc_id,
            "emoji": v["emoji"],
            "created": v["created"],
            "edited": v["edited"],
            "pics": v["pics"],
            "names": len(v["names"]),
            "handle_only": v["handle_only"],
            "island": doc_id in icons,
            "exact": len(exact.get(doc_id) or ()),
            "loose": len(chat),
            "near": chat,
            "tips": len(tip_at),
            "tips_ch": sum(1 for i in tip_at if tips[i]),
            # **引けていないチャンネルが残っているあいだは言い切らない**
            # （`docs/island-standards.md` §10）
            "unsure": bool(unseen) and not chat,
            "counts": counts,
            "titles": titles,
        })
    return rows


def peek(src, rows: list) -> None:
    """ゆるい一致の相手のうち、**いちばんよく来ている1人**を見に行く。

    見るのは `islandChannels` の **一緒にいた日数**（`days`）と
    **最後に喋った日**（`lastAt`）。ここが「もう来ていない人」と
    「いまも毎日来ている人」を割る。**名前は読まない。**

    Args:
        src: Firestore クライアント（読むだけの写し）
        rows: `build()` が返した材料。**その場で書き足す**
    """
    for r in rows:
        r["peek"] = None
        if not r["near"]:
            continue
        # コメントの多い順に、上から少しだけ
        order = sorted(r["near"], key=lambda c: -r["counts"].get(c, 0))
        best = None
        for cid in order[:MAX_PEEK]:
            d = src.collection("islandChannels").document(cid).get()
            v = (d.to_dict() or {}) if d.exists else {}
            days = v.get("days") if isinstance(v.get("days"), int) else 0
            last = day_of(v.get("lastAt"))
            cand = {"msgs": r["counts"].get(cid, 0), "days": days,
                    "last": last}
            if best is None or cand["msgs"] > best["msgs"]:
                best = cand
        r["peek"] = best


# ------------------------------------------------------------ 行にする


def lines(rows: list, total: int, taken: int, seen: dict) -> list:
    """表とまとめを、そのまま流せる行にする。

    **出す字を作るのはここ1か所だけ。** 呼ぶ側に「この値は出してよいか」を
    書かせると、書き忘れた1か所から漏れる（`logsafe` の `detail_lines` と
    同じ考え）。**ここに渡ってくるものに名前は入っていない。**

    Args:
        rows: `build()` ＋ `peek()` の材料
        total: 図鑑の人数
        taken: `channelId` が入っている人数
        seen: 引きに行った結果の数え（`ch_got` / `ch_gone` / `ch_blind`）

    Returns:
        流す行の一覧
    """
    out = [
        wpad("指紋", 7) + wpad("絵文字", 8) + wpad("載った日", 12)
        + wpad("直した日", 12) + "絵 名 " + wpad("島", 4)
        + " 完全  ゆる  " + wpad("近い人（件数/日数/最後）", 32)
        + "投げ銭",
        "-" * 104,
    ]
    for r in rows:
        emoji = r["emoji"] or "（無）"
        p = r["peek"]
        if p:
            near = f"{p['msgs']:,}件 / {p['days']}日 / {p['last']}"
        elif r["unsure"]:
            near = "（見ていないのが残る）"
        else:
            near = "—"
        tips = f"{r['tips']}件"
        if r["tips_ch"]:
            tips += f"(ch{r['tips_ch']})"
        if _break("secret"):
            # **守りを1本抜く。** 対照 (5) がここで落ちることを見張りが見る
            emoji = emoji + "/" + str(r.get("leak") or "")
        out.append(
            f"{mask(r['id'])}  "
            + wpad(emoji, 8)
            + f"{r['created']:<10}  {r['edited']:<10}  "
            + f"{r['pics']}  {r['names']}  "
            + ("居る" if r["island"] else "無し")
            + f"  {r['exact']:>3}  {r['loose']:>3}  "
            + wpad(near, 32)
            + tips
        )
    out.append("")
    out.append("[まとめ]")
    out.append(f"  図鑑                       {total:>5}人")
    out.append(f"  channelId が入っている     {taken:>5}人")
    out.append(f"  **空いている（表のぶん）** {len(rows):>5}人")
    out.append(
        f"  表示名を引いた結果  取れた {seen['ch_got']:>5}個"
        f" / 向こうが返さなかった {seen['ch_gone']}個"
        f" / **引けなかった {seen['ch_blind']}個**"
    )
    zero = sum(1 for r in rows if not r["loose"] and not r["unsure"])
    some = sum(1 for r in rows if r["loose"])
    unsure = sum(1 for r in rows if r["unsure"])
    out.append(
        f"  ゆるい一致  **0人（本当に居ない）{zero}人**"
        f" / 1人以上（当てられるかも）{some}人"
        f" / 言い切らない {unsure}人"
    )
    out.append(f"  呼び名を1つも持たない      "
               f"{sum(1 for r in rows if not r['names']):>5}人"
               f"（うちハンドルだけ持っている "
               f"{sum(1 for r in rows if not r['names'] and r['handle_only'])}人）")
    out.append(f"  投げ銭の台帳に名前で当たる {sum(1 for r in rows if r['tips']):>5}人"
               f"（うち channelId 付きの行を持つ "
               f"{sum(1 for r in rows if r['tips_ch'])}人）")
    return out


def verdict(rows: list) -> int:
    """割れているか。**寄ったら材料にならないので 1。**

    全員が 0人 なら鍵が狭すぎるか、本当に誰も居ない。全員が 1人以上 なら
    鍵が広すぎる。どちらも**「0人」と「選べない」を割る**という目的を
    果たしていないので、数字を信じさせない。

    Args:
        rows: 材料

    Returns:
        0＝割れた / 1＝寄った / 2＝数えるものが無い
    """
    if not rows:
        return 2
    zero = sum(1 for r in rows if not r["loose"])
    if len(rows) < 2:
        # 1人しか居なければ「割れている」も何もない。**数えるものが無い**
        return 2
    if _break("split"):
        # **守りを1本抜く。** 寄っていても通す。対照 4 がここで落ちる
        return 0
    return 1 if zero in (0, len(rows)) else 0


def why_skew(rows: list) -> str:
    """寄ったときに、どちらへ寄ったかを言う。

    **`verdict()` は字を出さない。** 対照が1回の確かめで何度も呼ぶので、
    そこで `log.error` を鳴らすと、通っている回まで赤い字が並ぶ。

    Args:
        rows: 材料

    Returns:
        出す字（寄っていなければ空）
    """
    if verdict(rows) != 1:
        return ""
    if all(r["loose"] for r in rows):
        return ("全員に、ゆるい一致で誰かが当たりました。"
                "**鍵が広すぎます。この数字は材料になりません**")
    return ("全員が、ゆるい一致で0人でした。**鍵が狭すぎるか、本当に誰も"
            "居ません。割れていないので、この数字だけでは決められません**")


# ---------------------------------------------------------------- 対照
#
# **本物を1人ぶんも読む前に、毎回回る。** 仕込みの字は形だけ似せた作り物で、
# 本物の名前も表示名もチャンネルIDも1つも入っていない。

# 図鑑の呼び名 -> チャットの表示名。**どうなってほしいか**を添える
_C_CASE = {
    # 1. 完全一致でも当たる
    "plain": (["なみのり"], ["なみのり"], "完全1 / ゆる1"),
    # 1b. **かな／カナ。** 完全一致では外れる。Collator でだけ当たる
    "kana": (["あおいとり"], ["アオイトリ"], "完全0 / ゆる1"),
    # 1c. **濁点。** 同上
    "dakuten": (["がぎぐ"], ["かきく"], "完全0 / ゆる1"),
    # 1d. **空白。** 同上
    "space": (["そら とぶ"], ["そらとぶ"], "完全0 / ゆる1"),
    # 1e. **別人。** 広すぎないことを見る
    "other": (["みどりのかぜ"], [], "完全0 / ゆる0"),
    # 2. **呼び名を1つも持たない人。** 落とさない
    "noname": ([], [], "表に出る"),
}

_C_DOC = {k: f"{i}" + "0123456789abcdef" * 2
          for i, k in enumerate(list(_C_CASE) + ["blindonly"])}

# 仕込みのチャンネル。**`UC…` に似せた作り物**
_C_CID = {k: "UCxx" + f"{i:02d}" + "seibutsudummy000000"
          for i, k in enumerate(list(_C_CASE) + ["blind1", "gone1"])}

# 仕込みの台帳。`(表示名, channelId を持つか)`
_C_TIPS = [("なみのり", True), ("アオイトリ", False), ("だれでもない", False)]


def _control_input() -> tuple:
    """仕込みの図鑑・引けた表示名・台帳を作る。

    Returns:
        （空いている人, 表示名, 件数, 台帳の行, 台帳の表示名）
    """
    blanks: dict = {}
    titles: dict = {}
    counts: dict = {}
    for i, (key, (names, chans, _want)) in enumerate(_C_CASE.items()):
        blanks[_C_DOC[key]] = {
            "emoji": "🐚", "names": list(names),
            "created": "2026-01-02", "edited": "-", "pics": 1,
            "handle_only": key == "noname",
        }
        for t in chans:
            titles[_C_CID[key]] = (nm.GOT, t)
            counts[_C_CID[key]] = 100 - i
    # **引けなかったチャンネルが1つある**（言い切らない理由）
    titles[_C_CID["blind1"]] = (nm.BLIND, "（仕込み）")
    # 向こうが返さなかったチャンネルも1つ
    titles[_C_CID["gone1"]] = (nm.GONE, "")
    return blanks, titles, counts


def _control_run(blanks: dict, titles: dict, counts: dict,
                 tips: list, icons: set) -> tuple:
    """仕込みを、本番とまったく同じ道に通す。

    Args:
        blanks: 仕込みの図鑑
        titles: 仕込みの表示名
        counts: 仕込みのコメント件数
        tips: 仕込みの台帳
        icons: 島に立っている書類ID

    Returns:
        （材料, 理由の一覧）。材料が None なら本物を動かせていない
    """
    got_ids = [c for c, (k, _t) in sorted(titles.items()) if k == nm.GOT]
    unseen = sum(1 for k, _t in titles.values() if k == nm.BLIND)
    chat_pool = [spread([titles[c][1]]) for c in got_ids]
    tips_pool = [spread([t[0]]) for t in tips]
    people = {k: spread(v["names"]) for k, v in blanks.items()}
    res = loose(people, {"chat": chat_pool, "tips": tips_pool})
    if res is None:
        return None, ["(0) 本物の matching.utils.ts を動かせない: "
                      + " / ".join(BLOCKED[-2:])]
    # 完全一致は本番と同じ道具で
    names = [x for v in blanks.values() for x in v["names"]]
    names += [titles[c][1] for c in got_ids]
    names = [x for s in names for x in nm.variants(s)]
    table = nm.normalize(names)
    if table is None:
        return None, ["(0) 完全一致の字をそろえられない"]
    by_key: dict = {}
    for c in got_ids:
        for k in nm.keys_of(titles[c][1], table["map"]):
            by_key.setdefault(k, set()).add(c)
    exact: dict = {}
    for doc_id, v in blanks.items():
        ks: set = set()
        for s in v["names"]:
            ks |= nm.keys_of(s, table["map"])
        exact[doc_id] = {c for k in ks for c in by_key.get(k, set())}
    rows = build(blanks, titles, counts, exact, res["out"],
                 [t[1] for t in tips], got_ids, unseen, icons)
    for r in rows:
        r["peek"] = ({"msgs": counts.get(r["near"][0], 0), "days": 7,
                      "last": "2026-01-03"} if r["near"] else None)
        r["leak"] = blanks[r["id"]]["names"][0] if blanks[r["id"]]["names"] \
            else ""
    return rows, []


def run_control() -> list:
    """**対照。** 落ちた理由を並べて返す。空なら通った。

    Returns:
        落ちた理由の一覧
    """
    bad: list = []
    blanks, titles, counts = _control_input()
    if _break("keep"):
        # **呼び名の無い人を落とす。** 対照 2 がここで落ちる
        blanks = {k: v for k, v in blanks.items() if v["names"]}
    icons = {_C_DOC["plain"]}
    rows, why = _control_run(blanks, titles, counts, _C_TIPS, icons)
    if rows is None:
        return why
    by_id = {r["id"]: r for r in rows}

    # 1. ゆるい鍵が、完全一致では外れる字を当てる。**かつ広すぎない**
    for key in ("kana", "dakuten", "space"):
        r = by_id.get(_C_DOC[key])
        if r is None:
            bad.append(f"(1) {key} が表に出ていない")
        elif r["exact"] or r["loose"] != 1:
            bad.append(f"(1) {key} が ゆるい一致で当たっていない"
                       f"（完全 {r['exact']} / ゆる {r['loose']}、"
                       f"欲しいのは 0 / 1）")
    r = by_id.get(_C_DOC["plain"])
    if not r or r["exact"] != 1 or r["loose"] != 1:
        bad.append("(1) 完全一致で当たるはずの人が当たっていない")
    r = by_id.get(_C_DOC["other"])
    if not r or r["loose"]:
        bad.append("(1) 別人に当たった。**鍵が広すぎる**")

    # 2. 呼び名を1つも持たない人も、表から落とさない
    r = by_id.get(_C_DOC["noname"])
    if r is None:
        bad.append("(2) 呼び名を持たない人が表から落ちた")
    elif r["names"] or not r["handle_only"]:
        bad.append("(2) 呼び名を持たない人の理由が残っていない")

    # 3. 引けなかったチャンネルを「居ない」に混ぜない
    if _break("blind"):
        for x in rows:
            x["unsure"] = False
    if not all(x["unsure"] for x in rows if not x["loose"]):
        bad.append("(3) 引けていないのに「当たらない」と言い切った")

    # 4. 片側に寄ったら 1 で落ちる
    flat = [dict(x, loose=0, unsure=False) for x in rows]
    if verdict(flat) != 1:
        bad.append("(4) 全員0人の寄りを 1 で返さなかった")
    if verdict([dict(x, loose=1) for x in rows]) != 1:
        bad.append("(4) 全員1人以上の寄りを 1 で返さなかった")
    mixed = [dict(rows[0], loose=0, unsure=False),
             dict(rows[0], loose=1, unsure=False)]
    if verdict(mixed) != 0:
        bad.append("(4) 割れているのに材料として通さなかった")

    # 5. **出す行に、仕込んだ名前が1文字も出ない**
    text = "\n".join(lines(rows, 99, 88, {"ch_got": 1, "ch_gone": 1,
                                          "ch_blind": 1}))
    planted = [s for v in _C_CASE.values() for s in (v[0] + v[1])]
    planted += [t[0] for t in _C_TIPS]
    hunt = (lambda t: sorted({s for s in planted if s and s in t}))
    leaked = hunt(text)
    if leaked:
        # **漏れた字そのものは出さない。** 何件かだけ
        bad.append(f"(5) 出す行に、仕込んだ名前が {len(leaked)}件 出た")
    # **0件を信じる前に、その探し方が当たることを見る**（§15）。
    # 仕込みを1つ混ぜた写しで見つからなければ、上の 0件 は
    # 「消えている」ではなく**「そもそも探せていない」**
    if not planted or not hunt(text + "\n" + planted[0]):
        bad.append("(5) 探し方が、わざと混ぜた仕込みにも当たらない")

    # 6. 読むだけの写しに、1バイトも書けない
    probe = _Counter()
    src = guard(probe)
    try:
        src.collection(CHARACTERS).document("x").update({"channelId": "y"})
    except ReadOnly:
        pass
    except Exception as e:  # noqa: BLE001
        bad.append(f"(6) 読むだけの写しが思わぬ落ち方をした（{type(e).__name__}）")
    else:
        bad.append("(6) 読むだけの写しに書けてしまった")
    if probe.writes:
        bad.append(f"(6) 下見で {probe.writes} 回書かれた")
    return bad


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


# ---------------------------------------------------------------- 本体


def collect(src, budget: float) -> tuple:
    """本番の材料を集める。**1バイトも書かない。**

    Args:
        src: Firestore クライアント（読むだけの写し）
        budget: 表示名を引くのに使ってよい時間（秒）

    Returns:
        （材料, 図鑑の人数, 入っている人数, 引いた結果の数え）。
        測れていなければ材料が None
    """
    icons = island_icons(repo_root())
    log.info("島に立っている候補（residents.ts）: %d人", len(icons))

    blanks, taken, total = roster_all(src)
    if not total:
        log.error("図鑑が1件も返りませんでした")
        return None, 0, 0, {}
    log.info("図鑑 %d人 / channelId が入っている %d人 / 空いている %d人",
             total, taken, len(blanks))
    if not blanks:
        log.error("空いている人が1人もいません（**数えるものが無い**）")
        return None, total, taken, {}

    rows_bq = nm.chat_channels()
    if not rows_bq:
        log.error("チャットにチャンネルが1つも出ていません。"
                  "**0件なのか、引けていないのかが分けられません**")
        return None, total, taken, {}
    log.info("チャットに出ているチャンネル: %d個", len(rows_bq))
    counts = {c: n for c, n in rows_bq}

    titles = nm.fetch_titles([c for c, _n in rows_bq], budget=budget)
    seen = {"ch_got": 0, "ch_gone": 0, "ch_blind": 0}
    for kind, _t in titles.values():
        seen["ch_" + kind.lower()] += 1
    log.info("表示名 取れた %d / 返らなかった %d / **引けなかった %d**",
             seen["ch_got"], seen["ch_gone"], seen["ch_blind"])
    if not seen["ch_got"]:
        log.error("表示名を1つも引けませんでした。"
                  "**0件だったのか、訊けなかったのかが分けられません**")
        return None, total, taken, seen

    # --- 投げ銭の台帳。**名前でしか当たらない**（この人たちは ID を持たない）
    tips_name: list = []
    tips_ch: list = []
    q = src.collection("islandTips").select(
        ["displayNameSnapshot", "channelId"]).limit(MAX_TIPS)
    for d in q.get():
        v = d.to_dict() or {}
        s = nm.clean(v.get("displayNameSnapshot"), MAX_NAME)
        if not s:
            continue
        tips_name.append(s)
        tips_ch.append(bool(nm.clean(v.get("channelId"), 64)))
    log.info("投げ銭の台帳のうち、表示名を持つ行: %d件（上限 %d）",
             len(tips_name), MAX_TIPS)

    # --- 完全一致（**いまの道具と同じ見方**）
    got_ids = [c for c, (k, _t) in titles.items() if k == nm.GOT]
    names = [x for v in blanks.values() for x in v["names"]]
    names += [titles[c][1] for c in got_ids]
    names = [x for s in names for x in nm.variants(s)]
    table = nm.normalize(names)
    if table is None:
        log.error("完全一致の字をそろえられませんでした")
        for line in nm.BLOCKED:
            log.error("  %s", line)
        return None, total, taken, seen
    by_key: dict = {}
    for c in got_ids:
        for k in nm.keys_of(titles[c][1], table["map"]):
            by_key.setdefault(k, set()).add(c)
    exact: dict = {}
    for doc_id, v in blanks.items():
        ks: set = set()
        for s in v["names"]:
            ks |= nm.keys_of(s, table["map"])
        exact[doc_id] = {c for k in ks for c in by_key.get(k, set())}

    # --- ゆるい一致（**本物の OBS の当て方**）
    people = {k: spread(v["names"]) for k, v in blanks.items()}
    pools = {"chat": [spread([titles[c][1]]) for c in got_ids],
             "tips": [spread([s]) for s in tips_name]}
    res = loose(people, pools)
    if res is None:
        log.error("本物の `matching.utils.ts` を動かせませんでした。"
                  "**数字を1つも出さずに止まります**")
        for line in BLOCKED:
            log.error("  %s", line)
        return None, total, taken, seen
    log.info("ゆるい鍵を動かしたのは本物です: %s / node %s / ICU %s",
             res.get("how"), res.get("node"), res.get("icu"))

    rows = build(blanks, titles, counts, exact, res["out"], tips_ch,
                 got_ids, seen["ch_blind"], icons)
    peek(src, rows)
    return rows, total, taken, seen


def main() -> int:
    """材料を出す。**1バイトも書かない。**

    Returns:
        終了コード（0＝割れた / 1＝寄った / 2＝測れていない）
    """
    a = args()
    budget = a.get("budget_min")
    budget = float(budget) * 60 if isinstance(budget, (int, float)) \
        else nm.BUDGET

    # **対照が先。** 外れたら、本物の数字を1つも出さずに 2 で止まる
    bad = run_control()
    if bad:
        log.error("対照が落ちました。**本物は1人ぶんも読んでいません**")
        for line in bad:
            log.error("  %s", line)
        return 2
    log.info("対照 6つ、通りました（ゆるい鍵／落とさない／"
             "言い切らない／寄りを弾く／名前を出さない／書かない）")

    try:
        rows, total, taken, seen = collect(guard(db()), budget)
    except FileNotFoundError as e:
        log.error("焼き込みが読めませんでした（%s）。"
                  "**0件に畳まずに止まります**", type(e).__name__)
        return 2
    if rows is None:
        return 2

    for line in lines(rows, total, taken, seen):
        # `log` は stderr へ出る。表と混ぜると Actions のログで順が崩れる
        print(line)
    skew = why_skew(rows)
    if skew:
        log.error("%s", skew)
    return verdict(rows)


if __name__ == "__main__":
    sys.exit(main())
