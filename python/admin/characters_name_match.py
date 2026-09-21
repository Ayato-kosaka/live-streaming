"""図鑑の**チャンネルIDが空の人**を、**表示名どうしの突き合わせ**で当てる。

ARGS 例:
  {}                          … 下見。**1バイトも書かない**
  {"apply": true}             … 当たったぶんだけ `channelId` を入れる
  {"apply": true, "limit": 3} … 先に少しだけ
  {"budget_min": 10}          … 表示名を引くのに使う時間の上限（既定 25分）

## なぜ要るのか ── 字の種類が違うので、当たりようがなかった

図鑑の18人は「一緒にいた日数 0日 / よく歩く点 0.000」で固定されている
（#553）。**手がかりが無いからではない。** 突き合わせる相手が無いだけ。

| どこに | 何の字が入っているか |
| --- | --- |
| 図鑑（`islandCharacter` の `aliases`） | **YouTube の表示名** |
| チャット（BigQuery `chat_messages.author_name`） | **ハンドル**（`@…`） |

図鑑に表示名が入っているのは、`characters_migrate.py:344-352` が
スプシの `name` のうち **`@` で始まるものだけを `channelName`** に入れ、
**残りを全部 `aliases`** に入れたから。チャットのほうは
**145,381件すべてがハンドル**で、表示名は1件も無い（2026-09-21 実測）。

`build_residents.py` は正しく動いている。**片方が表示名で、もう片方が
ハンドル**なので、どれだけ当てにいっても当たらない。

足りないのは **「チャンネルID → 表示名」の対応表**ひとつ。それは
YouTube に訊けば分かる（`channels.list?part=snippet&id=…` は**50件ずつ**
引けるので、チャットに出ている 2,303チャンネルなら 47回で揃う）。
揃えば**表示名どうし**で突き合わせられる。

## 訊きかたは新しく作らない

`python/admin/characters_link.py` の `youtube_finder` が、同じ口を
**逆向き**に叩いている（ハンドル → チャンネルID）。鍵の取り方
（`youtube_api.client` の Doneru トークン）と、叩けなかったときに
**道具を止めずにその出どころを使わないだけにする**構えは、そちらのまま。

時間の上限（`budget_min`／既定25分）と、**引けなかったものを
「無かった」に畳まない**数え方は `channel_alias.py` のまま。

## 字のそろえかたも、写しを作らない

`app/alertbox/matching.utils.ts` の `normalizeName` /
`normalizeNameNoEmoji` を、**そのファイルごと `node` で読み込んで**呼ぶ
（`name_clash.py` と同じ作法）。しっぽ落としは `python/name_tail.py` の
`strip_tail`。写しを作った瞬間、本物が変わっても気づけない
（`docs/island-misses.md` #147 の決めごと3）。

**Collator（`Intl.Collator`）までは落とさない。** OBS の当て方は完全一致で
外れると Collator に落ちて、**ひらがなとカタカナ・濁点・空白・記号**まで
潰す。あれは「その場で絵を出す」ための広げ方で、ここは
**`channelId` を人に結び付ける**——間違えると、その人の投げ銭が
**別人の絵で出続ける。** だから使うのは完全一致の側だけ
（`normalizeName` どうし・`normalizeNameNoEmoji` どうし。生の字が
同じなら `normalizeName` も同じなので、そこは含んでいる）。

しっぽ落としだけは広げる。YouTube が付ける `-r9z` や4桁の数字は
**本人が名乗っている字ではない**ので、落とした形でも突き合わせる
（`@かつお節1234` の人は、図鑑に「かつお節」で入っている。#553）。
落としてよい形は `name_tail.py` が数えて決めてあるので、そのまま借りる。

## 書かないものを、先に決めてある

- **曖昧なら書かない。** 同じ表示名のチャンネルが2つ以上あったら飛ばす
- **2人の図鑑が同じチャンネルを指したら、両方飛ばす。** どちらが本人かは
  ここでは決められない
- **すでに他の人に結ばれているチャンネルIDは使わない。** 書く前に、
  図鑑の誰かの `channelId` になっていないか必ず見る
- **引けなかったチャンネルが残っているあいだは「当たらない」と言い切らない。**
  別枠（`当たらなかった（見ていないチャンネルが残っている）`）で数える
  （`docs/island-standards.md` §10）

## 触るのは `channelId` の欄1つだけ

`update` で `channelId` ひとつ。`set` は使わない（ほかの欄が消える）。
すでに `channelId` が入っている人は、そもそも候補に入れない。

## 対照（本物を1人ぶんも読む前に、毎回）

`run_control()` が**先に**回る。外れたら**本物の数字を1つも出さずに 2**。

  1. 答えの分かっている仕込みで、**当たるべき人に当たる**
     （全角／絵文字のゆれも、**本物の TS を動かしていれば**揃う）
  2. **曖昧なものを書かない**（同じ表示名が2つ／2人が同じ人を指す）
  3. **他の人に結ばれているチャンネルIDを使わない**
  4. **引けなかったチャンネルを「当たらない」に混ぜない**
  5. **下見が本当に1バイトも書かない**

`BREAK=ambig|taken|blind|real|write` で足を1本ずつ抜ける。
抜いたぶんの対照が落ちることまで見るのが `characters_name_match_selftest.py`。

## 終了コード

  0 … 通った（当たるものが無かった／`apply` で書き終えた）
  1 … **下見で、当たるものが在る**（`{"apply": true}` で入る）
  2 … **測れていない**（対照が落ちた／図鑑が読めない／チャットが0件／
      表示名を1つも引けない／本物の TS を動かせない／書いたのに
      入った人数が増えていない）

## 出さないもの

**このリポジトリは公開で、Actions のログも誰でも読める。**
出すのは**件数**と、`logsafe.mask()` の**指紋**（元に戻せない）と、
**絵文字**（図鑑が誰にでも返していて、#553 の表にも出ている値）だけ。
**名前・呼び名・表示名・ハンドル・チャンネルID・書類IDは1文字も出さない。**
ARGS にも名前を取らない（ARGS はログに出る）。
"""

import json
import os
import subprocess
import sys
import time

from _fs import ReadOnly, args, db, log, readonly

sys.path.insert(0, __file__.rsplit("/", 2)[0])

from config import (  # noqa: E402
    BQ_DATASET,
    BQ_PROJECT_ID,
    BQ_TABLE_CHAT_MESSAGES,
)
from logsafe import mask  # noqa: E402
from name_tail import strip_tail  # noqa: E402

sys.path.insert(0, __file__.rsplit("/", 1)[0])
from name_clash import _node_path  # noqa: E402

CHARACTERS = "islandCharacter"

# Functions 側の MAX_CHARACTERS / MAX_NAME と同じ
MAX_CHARACTERS = 500
MAX_NAME = 80

# BigQuery に流す前の見積もりの上限。**超えたら引かずに止める**（あやとの決め）
MAX_BYTES = 1024 ** 3

# `channels.list` が 1回で受け取る `id` の数。**向こうの決まりが 50**
YT_CHUNK = 50

# 何回まで訊くか。`characters_link` の MAX_YT と同じ考えで頭を打つ。
# 200回 × 50件 ＝ 10,000チャンネルぶん（いまチャットに出ているのは 2,303）
MAX_CALLS = 200

# 1回と1回のあいだ（秒）。`channels.list` は1回1ユニットなので枠は問題に
# ならないが、**続けざまに叩かない**のは `channel_alias` と同じ構え
GAP = 0.2

# **引きに使ってよい時間ぜんたい（秒）。** 打ち切ったぶんは「引けなかった」に
# 積む。`GOT` に畳まない（`channel_alias.BUDGET` と同じ 25分）
BUDGET = 25 * 60.0

# まとめ書きの1回ぶん（Firestore の上限は 500）
WRITE_BATCH = 400

# --- チャンネル1つを引きに行った結果。**混ぜない** ---
GOT = "GOT"      # 表示名が取れた
GONE = "GONE"    # 向こうが返さなかった（消えている・非公開）
BLIND = "BLIND"  # **引けなかった**（訊けない・時間切れ・口が答えない）


def _break(name: str) -> bool:
    """対照の足を1本抜く。**`BREAK=` を渡したときだけ。**

    抜いた足のぶんだけ `run_control()` が落ちて、本物の数字を出さずに
    2 で止まる——ということを、見張りが確かめるために要る。
    """
    return (os.getenv("BREAK") or "") == name


def clean(v, max_len: int) -> str:
    """`islandCharacter.ts` の `clean`。**trim してから字数で切る。**"""
    if not isinstance(v, str):
        return ""
    return v.strip()[:max_len]


def guard(client, apply: bool):
    """下見のあいだは**書く口ごと塞ぐ。** `if apply:` を書き忘れても止まる。"""
    if _break("write"):
        return client
    return client if apply else readonly(client)


# ------------------------------------------------------------ 図鑑を読む


def roster(src) -> tuple:
    """図鑑を1回だけ全件読む。**空いている人と、ふさがっているIDを分けて返す。**

    `select` には**一覧**を渡す。字（`select("channelId")`）を渡すと
    1文字ずつの欄を頼んだことになり、1件も返らないのに問い合わせは通る
    （`characters_freeze` が本番で2回踏んでいる）。

    Args:
        src: Firestore クライアント（下見では読むだけの写し）

    Returns:
        （空いている人 書類ID -> {emoji, names}, すでに使われている channelId の集合,
          図鑑の人数）
    """
    blanks: dict = {}
    taken: set = set()
    total = 0
    q = (
        src.collection(CHARACTERS)
        .select(["channelName", "aliases", "emoji", "channelId"])
        .limit(MAX_CHARACTERS)
    )
    for d in q.get():
        v = d.to_dict() or {}
        total += 1
        cid = clean(v.get("channelId"), 64)
        if cid:
            taken.add(cid)
            continue
        channel = clean(v.get("channelName"), MAX_NAME)
        names = [clean(a, MAX_NAME) for a in (v.get("aliases") or [])
                 if isinstance(a, str)]
        # **`channelName` も、`@` で始まらなければ表示名。**
        # `characters_migrate` が `@` 付きだけを `channelName` に入れたので、
        # ここに `@` 無しが残っている人は「表示名を持っている人」
        if channel and not channel.startswith("@"):
            names.append(channel)
        names = [x for x in dict.fromkeys(names) if x]
        if not names:
            continue
        blanks[d.id] = {"emoji": clean(v.get("emoji"), 16), "names": names}
    return blanks, taken, total


# ------------------------------------------------- チャットに出たチャンネル


def chat_channels() -> list:
    """チャットに出ている**全チャンネルID**を、件数の多い順に返す。

    **期間で切らない。** 3年前に喋った人でも `channelId` は変わらないので、
    切ると当てられる人が減るだけ。集約1回で済む。

    件数の多い順に並べるのは、**時間切れで打ち切られたときに、
    先に見たほうが当たりやすいから**。図鑑のキャラクターは、あやとが
    覚えているくらい来ている人に対して作られている。

    **流す前に見積もる。** 1GB を超えたら引かずに止める。

    Returns:
        [(channelId, その人のコメント数)] を件数の多い順に
    """
    from google.cloud import bigquery

    client = bigquery.Client(project=BQ_PROJECT_ID)
    sql = f"""
        SELECT author_channel_id AS cid, COUNT(*) AS n
        FROM `{BQ_PROJECT_ID}.{BQ_DATASET}.{BQ_TABLE_CHAT_MESSAGES}`
        WHERE author_channel_id IS NOT NULL AND author_channel_id != ''
        GROUP BY cid
        ORDER BY n DESC
        """
    est = client.query(
        sql, job_config=bigquery.QueryJobConfig(dry_run=True)
    ).total_bytes_processed or 0
    log.info("BigQuery の見積もり: %.1f MB（上限 %d GB）",
             est / 1048576, MAX_BYTES // 1024 ** 3)
    if est > MAX_BYTES:
        log.error("**見積もりが上限を超えました。引かずに止めます**")
        raise SystemExit(2)

    return [(str(r["cid"]), int(r["n"]))
            for r in client.query(sql).result()]


# ------------------------------------------------------- 表示名を引きに行く

_yt: dict = {"client": None, "dead": False}


def ask_titles(cids: list) -> dict:
    """`channels.list?part=snippet&id=…` を**1回**叩く。最大50件。

    **訊けなかったときに道具を止めない**（`characters_link.youtube_finder`
    と同じ構え）。返せなかったぶんは呼んだ側が「引けなかった」に積む。

    Args:
        cids: チャンネルIDの一覧（50件まで）

    Returns:
        channelId -> 表示名（返らなかったIDは入っていない）

    Raises:
        RuntimeError: 訊きに行けなかった（鍵が無い・口が答えない）
    """
    if _yt["dead"]:
        raise RuntimeError("YouTube に訊けません")
    if _yt["client"] is None:
        try:
            from youtube_api.client import get_youtube_client

            _yt["client"] = get_youtube_client(log)
        except Exception as e:  # noqa: BLE001 止めない。使わないだけ
            _yt["dead"] = True
            raise RuntimeError(f"鍵が取れません（{type(e).__name__}）") from e
    from youtube_api.client import execute_api_request

    try:
        r = execute_api_request(
            _yt["client"].channels().list(part="snippet", id=",".join(cids)),
            logger=log,
        )
    except Exception as e:  # noqa: BLE001 1回の失敗で全部を捨てない
        # **チャンネルIDそのものはログに出さない**（ログは公開）
        raise RuntimeError(f"口が答えません（{type(e).__name__}）") from e
    out: dict = {}
    for it in (r.get("items") or []):
        cid = str(it.get("id") or "")
        title = clean((it.get("snippet") or {}).get("title"), MAX_NAME)
        if cid and title:
            out[cid] = title
    return out


def fetch_titles(cids: list, ask=None, budget: float = BUDGET) -> dict:
    """チャンネルIDぜんぶぶんの表示名。**50件ずつ、順に。**

    **時間で打ち切る。** 打ち切ったぶんは `BLIND`＝**引けなかった**に積む。
    `GONE`（向こうが返さなかった）に畳むと、**見ていないものが
    「消えている」に化ける**（`channel_alias.fetch_all` と同じ決め）。

    Args:
        cids: チャンネルIDの一覧（当てたい順に並んでいること）
        ask: 1回ぶんを訊く関数（差し込み用。既定は `ask_titles`）
        budget: 引きに使ってよい時間（秒）

    Returns:
        channelId -> (種別, 表示名)
    """
    ask = ask or ask_titles
    out: dict = {}
    end = time.monotonic() + budget
    calls = 0
    total = len(cids)
    for i in range(0, total, YT_CHUNK):
        chunk = cids[i:i + YT_CHUNK]
        if time.monotonic() >= end or calls >= MAX_CALLS:
            # **打ち切った。** 見ていないのであって、消えているのではない
            why = "時間切れ" if calls < MAX_CALLS else "訊いた回数の上限"
            for c in chunk:
                out[c] = (BLIND, why)
            continue
        if calls:
            time.sleep(GAP)
        calls += 1
        try:
            got = ask(chunk)
        except Exception as e:  # noqa: BLE001 その50件を諦めるだけ
            why = str(e) if isinstance(e, RuntimeError) else type(e).__name__
            for c in chunk:
                out[c] = (BLIND, why)
            continue
        for c in chunk:
            name = got.get(c)
            out[c] = (GOT, name) if name else (GONE, "")
        if calls % 10 == 0:
            # **数は出さない。** 途中の数を読まれると、測り終える前に
            # 結論を書く相手が出る（`channel_alias.fetch_all` と同じ）
            print(f"  ...表示名を引いています {min(i + YT_CHUNK, total)}/{total}",
                  file=sys.stderr, flush=True)
    return out


# ------------------------------------------------ 字をそろえる（本物を動かす）
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
    if (m && m.normalizeName && m.normalizeNameNoEmoji) {
      return { m, how: "node(型剥がし)" };
    }
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
    if (mod.exports.normalizeName && mod.exports.normalizeNameNoEmoji) {
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
  const { normalizeName, normalizeNameNoEmoji } = m;
  /* 字の並びのまま返す。**辞書にすると、同じ字が畳まれて順が崩れる。** */
  const norm = (inp.names || []).map(
    (s) => [normalizeName(s), normalizeNameNoEmoji(s)]);
  process.stdout.write(JSON.stringify({
    how, node: process.version, icu: process.versions.icu, norm,
  }));
}

main().catch((e) => {
  process.stdout.write(JSON.stringify({ error: String(e && e.message) }));
  process.exitCode = 3;
});
"""

BLOCKED: list = []


def _copy_norm(names: list) -> dict:
    """**写しで揃える。** `BREAK=real` のときだけ通る道。

    NFKC も絵文字落としもしない、ただの前後空白落とし＋小文字化。
    全角のゆれ（`ＡＯＩ 12`）と絵文字のゆれ（`…🐦`）が揃わなくなるので、
    対照 1 がここで落ちる。それを見張りが確かめる。
    """
    return {"how": "**写し（BREAK=real）**", "node": "-", "icu": "-",
            "norm": [[s.strip().lower(), s.strip().lower()] for s in names]}


def normalize(names: list):
    """**本物の `matching.utils.ts`** に字を食わせて、そろえた形を貰う。

    Args:
        names: そろえたい字の一覧

    Returns:
        {"how": …, "map": {字 -> (normalizeName, normalizeNameNoEmoji)}}。
        動かせなければ None（理由は `BLOCKED` へ）
    """
    uniq = list(dict.fromkeys(names))
    if not uniq:
        return {"how": "（そろえる字が無い）", "node": "-", "icu": "-", "map": {}}
    if _break("real"):
        got = _copy_norm(uniq)
    else:
        repo = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        repo = os.path.dirname(repo)
        src = os.path.join(repo, "app", "alertbox", "matching.utils.ts")
        if not os.path.isfile(src):
            BLOCKED.append("matching.utils.ts が見つからない")
            return None
        tmp = (os.environ.get("RUNNER_TEMP") or os.environ.get("TMPDIR")
               or "/tmp")
        hpath = os.path.join(tmp, "_name_match_harness.cjs")
        with open(hpath, "w", encoding="utf-8") as f:
            f.write(HARNESS)
        # **字は引数にもファイルにも置かない。** 標準入力で渡す
        payload = json.dumps({"names": uniq}, ensure_ascii=False)
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
    pairs = got.get("norm") or []
    if len(pairs) != len(uniq):
        BLOCKED.append("そろえた字の数が合わない")
        return None
    got["map"] = {s: (p[0], p[1]) for s, p in zip(uniq, pairs)}
    return got


def variants(name: str) -> list:
    """1つの字から、突き合わせに使う**元の字**を並べる。

    しっぽ（`@なまえ-r9z` の `-r9z`）は YouTube が勝手に付けるもので、
    人が名乗るときには打たない。`python/name_tail.py` の `strip_tail` は
    **落としてよい形を数えて決めてある**ので、そのまま借りる。

    Args:
        name: 図鑑の呼び名、または YouTube の表示名

    Returns:
        元の字の一覧（しっぽが無ければ1つだけ）
    """
    out = [name]
    t = strip_tail(name)
    if t and t[0] and t[0] != name:
        out.append(t[0])
    return out


def keys_of(name: str, table: dict) -> set:
    """突き合わせに使う鍵。**完全一致の3段だけ。**

    `matchViewerByNickname` の 1)生の字 2)`normalizeName` 3)`normalizeNameNoEmoji`
    に当たる。**Collator（2段目と4段目）は使わない**——あれは
    ひらがなとカタカナ・濁点まで潰すので、`channelId` を結ぶには広すぎる。

    `n:` と `e:` に分けてあるのは本物と同じで、`norm` は `norm` とだけ、
    `normNoEmoji` は `normNoEmoji` とだけ突き合わせるため。

    Args:
        name: 図鑑の呼び名、または YouTube の表示名
        table: `normalize()` が返した `map`

    Returns:
        鍵の集合（そろえると何も残らない字なら空）
    """
    out: set = set()
    for v in variants(name):
        pair = table.get(v)
        if not pair:
            continue
        n, e = pair
        if n:
            out.add("n:" + n)
        if e:
            out.add("e:" + e)
    return out


# ------------------------------------------------------------ 当てる先を決める


def plan(blanks: dict, taken: set, titles: dict, table: dict) -> tuple:
    """当たったものだけ残す。**読むだけ。**

    Args:
        blanks: `roster()` の空いている人
        taken: すでに図鑑の誰かに結ばれている channelId
        titles: `fetch_titles()` の結果（channelId -> (種別, 表示名)）
        table: `normalize()` が返した `map`

    Returns:
        （書類ID -> channelId, 数えたもの）
    """
    n = {"people": len(blanks), "hit": 0, "ambig": 0, "shared": 0,
         "taken": 0, "miss": 0, "unsure": 0, "nokey": 0,
         "ch_got": 0, "ch_gone": 0, "ch_blind": 0}

    # 鍵 -> その鍵を持つ channelId。**引けたチャンネルぶんだけ**
    by_key: dict = {}
    for cid, (kind, name) in titles.items():
        if kind == GOT:
            n["ch_got"] += 1
        elif kind == GONE:
            n["ch_gone"] += 1
        else:
            n["ch_blind"] += 1
            continue
        if kind != GOT:
            continue
        for k in keys_of(name, table):
            by_key.setdefault(k, set()).add(cid)

    # **見ていないチャンネルが残っているか。** 残っているあいだは
    # 「当たらない」と言い切らない（`island-standards.md` §10）
    unseen = 0 if _break("blind") else n["ch_blind"]

    hit: dict = {}
    for doc_id, v in sorted(blanks.items()):
        keys: set = set()
        for nm in v["names"]:
            keys |= keys_of(nm, table)
        if not keys:
            # そろえると何も残らない字しか持っていない。**引きようが無い**
            n["nokey"] += 1
            continue
        cids: set = set()
        for k in keys:
            cids |= by_key.get(k, set())
        if not cids:
            if unseen:
                n["unsure"] += 1
            else:
                n["miss"] += 1
            continue
        if len(cids) > 1 and not _break("ambig"):
            # 同じ表示名のチャンネルが2つ以上。**どちらか決められない**
            n["ambig"] += 1
            continue
        cid = sorted(cids)[0]
        if cid in taken and not _break("taken"):
            # **すでに他の人のもの。** 結ぶと、その人の投げ銭が別人の絵で出る
            n["taken"] += 1
            continue
        hit[doc_id] = cid

    # **2人以上が同じチャンネルを指したら、どちらにも書かない**
    seen: dict = {}
    for doc_id, cid in hit.items():
        seen.setdefault(cid, []).append(doc_id)
    out: dict = {}
    for cid, docs in seen.items():
        if len(docs) > 1 and not _break("ambig"):
            n["shared"] += len(docs)
            continue
        for doc_id in docs:
            out[doc_id] = cid
    n["hit"] = len(out)
    return out, n


# ---------------------------------------------------------------- 対照
#
# **本物に1行も書く前に、毎回回る。** 仕込みの字は形だけ似せた作り物で、
# 本物の名前も表示名もチャンネルIDも1つも入っていない。

# 図鑑の呼び名 -> YouTube の表示名。**どうなってほしいか**を添える
_C_CASE = {
    # 1. そのまま当たる
    "plain": (["なみのり"], {"plain1": "なみのり"}, "当たる"),
    # 1b. **全角のゆれ。** 本物の `normalizeName`（NFKC）でしか揃わない
    "wide": (["ＡＯＩ 12"], {"wide1": "aoi 12"}, "当たる"),
    # 1c. **絵文字のゆれ。** 本物の `normalizeNameNoEmoji` でしか揃わない
    "emoji": (["そらとぶ ひと"], {"emoji1": "そらとぶ ひと🐦"}, "当たる"),
    # 2a. 同じ表示名のチャンネルが2つ。**決められない**
    "ambig": (["ふたりめ"], {"ambig1": "ふたりめ", "ambig2": "ふたりめ"},
              "曖昧"),
    # 3. 当たった先が、**もう別の人に結ばれている**
    "taken": (["もちぬし"], {"taken1": "もちぬし"}, "他の人のもの"),
    # 4. どこにも居ない
    "miss": (["だれもしらない"], {}, "当たらない"),
    # 4b. **引けなかったチャンネル。** 「当たらない」に混ぜない
    "unsure": (["ひけなかった"], {}, "見ていないのが残っている"),
}

# 2b. **2人の図鑑が、同じ1つのチャンネルを指す。** 両方飛ばす
_C_SHARED = (["おなじじ", "おなじじ"], "shared1", "おなじじ")

_C_DOC = {k: f"{i}" + "0123456789abcdef" * 2
          for i, k in enumerate(list(_C_CASE) + ["share1", "share2", "owner"])}
_C_CID = {k: "UCxx" + f"{i:02d}" + "seibutsudummy000000"
          for i, k in enumerate(
              [x for v in _C_CASE.values() for x in v[1]]
              + ["shared1", "blind1", "gone1", "ownercid"])}


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

    def batch(self):
        self.writes += 1
        return self

    def commit(self, *a, **k):
        self.writes += 1


def _control_input() -> tuple:
    """仕込みの図鑑・引けた表示名・ふさがっているIDを作る。"""
    blanks: dict = {}
    titles: dict = {}
    for key, (names, chans, _want) in _C_CASE.items():
        blanks[_C_DOC[key]] = {"emoji": "🐚", "names": list(names)}
        for ck, title in chans.items():
            titles[_C_CID[ck]] = (GOT, title)
    # 2人が同じ字 → 同じ1つのチャンネルを指す
    names, ck, title = _C_SHARED
    blanks[_C_DOC["share1"]] = {"emoji": "🐚", "names": [names[0]]}
    blanks[_C_DOC["share2"]] = {"emoji": "🐚", "names": [names[1]]}
    titles[_C_CID[ck]] = (GOT, title)
    # **引けなかったチャンネルが1つある**（`unsure` が言い切らない理由）
    titles[_C_CID["blind1"]] = (BLIND, "（仕込み）")
    # 向こうが返さなかったチャンネルも1つ
    titles[_C_CID["gone1"]] = (GONE, "")
    taken = {_C_CID["taken1"], _C_CID["ownercid"]}
    return blanks, taken, titles


def run_control() -> list:
    """**対照。** 落ちた理由を並べて返す。空なら通った。"""
    bad: list = []
    blanks, taken, titles = _control_input()
    names = [x for v in blanks.values() for x in v["names"]]
    names += [t for k, t in titles.values() if k == GOT]
    names = [x for nm in names for x in variants(nm)]
    got = normalize(names)
    if got is None:
        return ["(0) 本物の matching.utils.ts を動かせない: "
                + " / ".join(BLOCKED[-2:])]
    todo, n = plan(blanks, taken, titles, got["map"])

    # 1. 当たるべき人に当たる（全角・絵文字のゆれも、本物なら揃う）
    for key, want_cid in (("plain", "plain1"), ("wide", "wide1"),
                          ("emoji", "emoji1")):
        if todo.get(_C_DOC[key]) != _C_CID[want_cid]:
            bad.append(f"(1) {key} が当たっていない")
    if n["hit"] != 3:
        bad.append(f"(1) 当たった人数が違う（{n['hit']}、欲しいのは 3）")

    # 2. 曖昧なものを書かない。**いちばん危ない足**
    if _C_DOC["ambig"] in todo:
        bad.append("(2) 同じ表示名が2つあるのに書こうとした")
    elif n["ambig"] != 1:
        bad.append(f"(2) 曖昧の数え方が違う（{n['ambig']}、欲しいのは 1）")
    if _C_DOC["share1"] in todo or _C_DOC["share2"] in todo:
        bad.append("(2) 2人が同じ人を指しているのに書こうとした")
    elif n["shared"] != 2:
        bad.append(f"(2) 同じ人を指した数え方が違う"
                   f"（{n['shared']}、欲しいのは 2）")

    # 3. 他の人に結ばれている channelId を使わない
    if _C_DOC["taken"] in todo:
        bad.append("(3) すでに他の人に結ばれているIDを使おうとした")
    elif n["taken"] != 1:
        bad.append(f"(3) ふさがりの数え方が違う（{n['taken']}、欲しいのは 1）")

    # 4. 引けなかったチャンネルを「当たらない」に混ぜない
    if n["ch_blind"] != 1:
        bad.append(f"(4) 引けなかったチャンネル数が違う"
                   f"（{n['ch_blind']}、欲しいのは 1）")
    if n["unsure"] != 2 or n["miss"] != 0:
        # 引けていないものが残っているあいだは、**2人とも言い切らない**
        bad.append(f"(4) 言い切らない人数が違う（言い切らない {n['unsure']} / "
                   f"当たらない {n['miss']}、欲しいのは 2 / 0）")

    # 5. 下見が1バイトも書かない
    probe = _Counter()
    src = guard(probe, apply=False)
    try:
        src.collection(CHARACTERS).document("x").update({"channelId": "y"})
    except ReadOnly:
        pass
    except Exception as e:  # noqa: BLE001
        bad.append(f"(5) 下見の写しが思わぬ落ち方をした（{type(e).__name__}）")
    else:
        bad.append("(5) 下見の写しに書けてしまった")
    try:
        src.batch()
    except ReadOnly:
        pass
    except Exception as e:  # noqa: BLE001
        bad.append(f"(5) まとめ書きが思わぬ落ち方をした（{type(e).__name__}）")
    else:
        bad.append("(5) 下見なのにまとめ書きを作れてしまった")
    if probe.writes:
        bad.append(f"(5) 下見で {probe.writes} 回書かれた")
    return bad


# ---------------------------------------------------------------- 書く


def fill(client, todo: dict) -> int:
    """`channelId` の欄だけを、まとめ書きで入れる。

    `update` を使うのは、**ほかの欄を1つも触らないため**（`set` は
    置き換えになる）。渡す欄は `channelId` ひとつだけ。

    Args:
        client: Firestore クライアント（本物）
        todo: 書類ID -> channelId

    Returns:
        書いた件数
    """
    items = sorted(todo.items())
    done = 0
    col = client.collection(CHARACTERS)
    for i in range(0, len(items), WRITE_BATCH):
        chunk = items[i:i + WRITE_BATCH]
        batch = client.batch()
        for doc_id, cid in chunk:
            batch.update(col.document(doc_id), {"channelId": cid})
        batch.commit()
        done += len(chunk)
        log.info("  %d / %d", done, len(items))
    return done


# ---------------------------------------------------------------- 本体


def main() -> None:
    a = args()
    apply = a.get("apply") is True
    limit = a.get("limit")
    limit = int(limit) if isinstance(limit, (int, float)) else None
    budget = a.get("budget_min")
    budget = float(budget) * 60 if isinstance(budget, (int, float)) else BUDGET

    # **対照が先。** 外れたら、本物の数字を1つも出さずに 2 で止まる
    bad = run_control()
    if bad:
        log.error("対照が落ちました。**本物には1バイトも触っていません**")
        for line in bad:
            log.error("  %s", line)
        raise SystemExit(2)
    log.info("対照 5つ、通りました"
             "（当たる／曖昧／ふさがり／引けなかった／書かない）")

    client = db()
    src = guard(client, apply)

    blanks, taken, total = roster(src)
    if not total:
        # 0人と「読めていない」を同じ顔で返さない
        log.error("図鑑が1件も返りませんでした。**何も書いていません**")
        raise SystemExit(2)
    log.info("図鑑 %d人 / channelId が入っている %d人 / "
             "空いていて表示名を持つ %d人", total, len(taken), len(blanks))
    if not blanks:
        log.info("当てる相手がいません。**何もしません**")
        return

    rows = chat_channels()
    if not rows:
        log.error("チャットにチャンネルが1つも出ていません。"
                  "**0件なのか、引けていないのかが分けられません**")
        raise SystemExit(2)
    log.info("チャットに出ているチャンネル: %d個（コメントの多い順に引きます）",
             len(rows))

    titles = fetch_titles([c for c, _n in rows], budget=budget)

    # そろえる字は、**図鑑の呼び名と引けた表示名の両方**を一度に渡す
    names = [x for v in blanks.values() for x in v["names"]]
    names += [t for k, t in titles.values() if k == GOT]
    names = [x for nm in names for x in variants(nm)]
    got = normalize(names)
    if got is None:
        log.error("本物の `matching.utils.ts` を動かせませんでした。"
                  "**数字を1つも出さずに止まります**")
        for line in BLOCKED:
            log.error("  %s", line)
        raise SystemExit(2)
    log.info("字をそろえたのは本物です: %s / node %s / ICU %s",
             got.get("how"), got.get("node"), got.get("icu"))

    todo, n = plan(blanks, taken, titles, got["map"])

    log.info("表示名を引きに行った結果")
    log.info("  取れた                   … %d個", n["ch_got"])
    log.info("  向こうが返さなかった     … %d個", n["ch_gone"])
    log.info("  **引けなかった**         … %d個", n["ch_blind"])
    if not n["ch_got"]:
        # **1つも引けていないのに「当たりません」と言わない**
        log.error("表示名を1つも引けませんでした。"
                  "**0件だったのか、訊けなかったのかが分けられません**")
        raise SystemExit(2)

    log.info("突き合わせ（空いている %d人）", n["people"])
    log.info("  **当たった**                       … %d人", n["hit"])
    log.info("  曖昧（同じ表示名が2つ以上）        … %d人", n["ambig"])
    log.info("  曖昧（2人が同じ人を指した）        … %d人", n["shared"])
    log.info("  **もう他の人に結ばれている**       … %d人", n["taken"])
    log.info("  当たらない（ぜんぶ見たうえで）     … %d人", n["miss"])
    log.info("  当たらない（見ていないのが残る）   … %d人", n["unsure"])
    if n["nokey"]:
        log.info("  そろえると何も残らない字だけ       … %d人", n["nokey"])

    if limit is not None and limit >= 0:
        todo = dict(sorted(todo.items())[:limit])
        log.info("limit=%d のぶんだけにしました", limit)

    for doc_id in sorted(todo):
        # **名前もチャンネルIDも1文字も出さない。** 出すのは指紋と絵文字だけ。
        # あやとが `/me` の図鑑で見分けられるだけの手がかりは残す
        log.info("  結ぶ: %s %s", mask(doc_id),
                 blanks[doc_id]["emoji"] or "（絵文字なし）")

    if apply and todo:
        done = fill(client, todo)
        log.info("書きました: %d人", done)
        after_blanks, after_taken, after_total = roster(src)
        log.info("図鑑（おわり）: %d人 / channelId が入っている %d人"
                 "（はじめは %d人）", after_total, len(after_taken), len(taken))
        if len(after_taken) <= len(taken):
            # 書いたと言えない。**「入った」と報告しないで止まる**
            log.error("書いたのに、channelId の入った人数が増えていません。"
                      "**入ったかどうかを確かめられませんでした**")
            raise SystemExit(2)
        return

    if apply:
        log.info("当たるものはありません。**何も書いていません**")
        return

    if not apply:
        log.info("---- 下見です。1バイトも書いていません ----")
        if todo:
            log.info('入れるには {"apply": true} を付けてください')
            raise SystemExit(1)
        log.info("当たるものはありません")


if __name__ == "__main__":
    main()
