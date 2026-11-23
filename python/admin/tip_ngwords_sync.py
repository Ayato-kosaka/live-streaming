"""**Doneru に設定してある禁止ワードを、島の投げ銭にも写す**（#1405）。

    script: tip_ngwords_sync
    args:   {}                … 下見（取ってきて数えるだけ。**1バイトも書かない**）
            {"apply": true}   … `islandFundConfig/tip` に書く

## なぜ要るか

島で受ける投げ銭のメッセージは、配信のアラートに出る。Doneru では、あやとが
配信者側に禁止ワードを設定していて（2026-11 時点で191語）、島の投げ銭にも
**同じ語を効かせる。** 島の口（Functions）は `islandFundConfig/tip` の
`ngWords` を読み、メッセージに1語でも入っていれば断る。

語は Doneru の送る画面（`https://doneru.jp/ayato_arigato`）が受け取る配信者の
設定の `filtering_word` に入っている。視聴者がみな受け取るものなので、
ログインは要らない。この作業箱からは doneru.jp に届かないので、Actions で回す。

## どこから取るか

1. 送る画面の `__data.json`（SvelteKit の data）。中身は devalue の平たい形
   （値の並びと、添字で指す形）のことが多いので、組み立て直してから探す。
   素の JSON・あとから流れてくる塊（`"type":"chunk"`）でも探す
2. そこに無い・取れないときだけ、**画面の HTML に埋まった data** から探す
   （`<script type="application/json">` の中と、`kit.start` に渡す data の字面）

どちらから取ったかはログに出す。

## 語の揃えかた

NFKC にして前後の空白を落とし、空と重複を除いて**並べ替える。**
並べ替えるのは、Doneru 側の並びが変わっただけで「変わった」に見えないように。

## **0語なら書かない**

取れなかった・`filtering_word` が見つからない・0語だったときは、**書かずに**
終了コード 1 で止める。0語で上書きすると、**島の守りが黙って消える**——
口は「禁止ワードが無いので通す」と読み、誰も気づかない。

## 書きかた

`merge=True` で `ngWords`・`ngWordsSyncedAt`・`ngWordsSource` の3つだけ。
同じ書類の `testAlertboxId` などには触らない。書いたあと読み直して、
入ったことと、ほかの欄が残っていることを確かめる。

## ログ

**語そのものは1つも出さない**（このリポジトリも Actions のログも公開。
語の一覧はリポジトリにも置かない）。出すのは件数と、**並べた語の SHA-256 の
頭8桁**（`fingerprint()`。`"\\n".join(語)` を UTF-8 で）だけ。指紋が同じなら
中身も同じ、と読める。いま置き場に入っているぶんの件数と指紋も並べて出す。

## 終了コード

    0 … 取れた（下見なら数えた／apply なら書いて読み直して合った）
    1 … 取れなかった・見つからない・0語・書いたものが読み直せない
"""

import hashlib
import json
import os
import re
import sys
import unicodedata
from datetime import datetime, timezone

from _fs import args, db, log, notice, readonly

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# あやとの Doneru の送る画面
PAGE = "https://doneru.jp/ayato_arigato"
DATA_URL = PAGE + "/__data.json"

# 書く先。島の口（Functions）がここを読む
COLLECTION = "islandFundConfig"
DOC = "tip"

# 探す欄の名前（Doneru の配信者の設定）
KEY = "filtering_word"

# **これより少なければ書かない。** 0語で上書きすると、守りが黙って消える
MIN_WORDS = 1

TIMEOUT_SEC = 30

# ブラウザから来た要求に見せる最小限の頭。`python/doneru/client.py` と同じ UA
HEADERS = {
    "accept": "application/json, text/html;q=0.9, */*;q=0.8",
    "accept-language": "ja,en;q=0.8",
    "user-agent": (
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36"
    ),
}


class FetchError(Exception):
    """つながらなかった（名前解決・時間切れ・接続断）。"""


class Missing(Exception):
    """禁止ワードの欄が、どこからも取れなかった。"""


def fetch(url: str) -> tuple:
    """1つ取ってくる。**見張りはここを偽物に差し替える。**

    Args:
        url: 取る先

    Returns:
        (HTTP の状態, 本文の字)
    """
    import requests

    try:
        r = requests.get(url, headers=HEADERS, timeout=TIMEOUT_SEC)
    except requests.RequestException as e:
        raise FetchError(type(e).__name__) from e
    # 字コードは推させない。SvelteKit は UTF-8 で返す
    return r.status_code, r.content.decode("utf-8", errors="replace")


# --- devalue（SvelteKit が data を送る形）を組み立て直す --------------------

# devalue が値の代わりに置く数（負の添字）
_CONST = {-1: None, -2: None, -3: float("nan"), -4: float("inf"),
          -5: float("-inf"), -6: -0.0}


def unflatten(values):
    """devalue の平たい形（`[根, 値, 値, …]`。入れ物の中身は添字）を組み立て直す。

    入れ物は先に作ってから中身を詰めるので、同じものを指す添字・輪になった
    参照でも止まらない。知らない札（`["Promise", 3]` のような拡張）は、
    中身が添字1つならそれを開き、そうでなければ None にする。

    Args:
        values: `__data.json` の `nodes[i].data`（一覧）

    Returns:
        組み立て直した値

    Raises:
        ValueError: devalue の形ではない
    """
    if isinstance(values, int) and not isinstance(values, bool):
        return _CONST.get(values)
    if not isinstance(values, list) or not values:
        raise ValueError("devalue の形ではない")
    memo = {}

    def at(i):
        if isinstance(i, bool) or not isinstance(i, int):
            raise ValueError("添字ではない")
        if i < 0:
            return _CONST.get(i)
        if i in memo:
            return memo[i]
        v = values[i]
        if isinstance(v, dict):
            obj = {}
            memo[i] = obj
            for k, n in v.items():
                obj[k] = at(n)
            return obj
        if isinstance(v, list):
            if v and isinstance(v[0], str):
                return tagged(i, v)
            arr = []
            memo[i] = arr
            for n in v:
                arr.append(None if n == -2 else at(n))
            return arr
        memo[i] = v
        return v

    def tagged(i, v):
        tag = v[0]
        if tag in ("Date", "RegExp", "Object") and len(v) > 1:
            memo[i] = v[1]
        elif tag == "BigInt" and len(v) > 1:
            memo[i] = int(v[1])
        elif tag == "Set":
            arr = []
            memo[i] = arr
            arr.extend(at(n) for n in v[1:])
        elif tag in ("Map", "null"):
            obj = {}
            memo[i] = obj
            pairs = v[1:]
            for j in range(0, len(pairs) - 1, 2):
                # Map の鍵は添字、null の鍵は字そのもの
                k = at(pairs[j]) if tag == "Map" else pairs[j]
                try:
                    obj[k] = at(pairs[j + 1])
                except TypeError:
                    continue
        elif len(v) == 2 and isinstance(v[1], int) and not isinstance(v[1], bool):
            memo[i] = None
            memo[i] = at(v[1])
        else:
            memo[i] = None
        return memo[i]

    return at(0)


# --- 欄を探す ----------------------------------------------------------------


def find_key(tree, key: str = KEY) -> list:
    """入れ子の中から、名前が `key` の欄の値をぜんぶ拾う。

    字の中に JSON が入っていることがある（HTML に埋まった fetch の写しの
    `body`）ので、`key` を含む字は JSON として開いて中も見る。

    Args:
        tree: 探す塊
        key: 欄の名前

    Returns:
        見つかった値の並び（見つかった順）
    """
    out = []
    seen = set()

    def walk(v, depth):
        if depth > 64:
            return
        if isinstance(v, (dict, list)):
            if id(v) in seen:
                return
            seen.add(id(v))
        if isinstance(v, dict):
            for k, x in v.items():
                if k == key:
                    out.append(x)
                walk(x, depth + 1)
        elif isinstance(v, list):
            for x in v:
                walk(x, depth + 1)
        elif isinstance(v, str) and key in v and v.lstrip()[:1] in ("{", "["):
            try:
                walk(json.loads(v), depth + 1)
            except ValueError:
                pass

    walk(tree, 0)
    return out


def parse_json(text: str) -> list:
    """JSON を読む。1本で読めなければ、1行ずつ（流れてくる塊の形）読む。

    Args:
        text: 本文

    Returns:
        読めた値の並び（1つも読めなければ空）
    """
    try:
        return [json.loads(text)]
    except ValueError:
        pass
    out = []
    for line in text.splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            out.append(json.loads(line))
        except ValueError:
            continue
    return out


def _node(data):
    """1つの塊の data を、探せる形にする。

    Returns:
        (塊, 形の名前)
    """
    if isinstance(data, list):
        try:
            return unflatten(data), "devalue"
        except (ValueError, IndexError, TypeError, KeyError, RecursionError):
            return data, "素の JSON"
    return data, "素の JSON"


def from_data_json(text: str) -> list:
    """`__data.json` の本文から、禁止ワードの欄を探す。

    Args:
        text: 本文

    Returns:
        `[(欄の値, 形の名前)]`。見つからなければ空
    """
    found = []
    raw_docs = parse_json(text)
    for doc in raw_docs:
        trees = []
        if isinstance(doc, dict) and isinstance(doc.get("nodes"), list):
            for node in doc["nodes"]:
                if isinstance(node, dict) and "data" in node:
                    trees.append(_node(node["data"]))
        elif isinstance(doc, dict) and doc.get("type") == "chunk" and "data" in doc:
            trees.append(_node(doc["data"]))
        else:
            trees.append((doc, "素の JSON"))
        for tree, form in trees:
            found += [(v, form) for v in find_key(tree)]
    # SvelteKit の形に見えたが、組み立て直した中に無かった。**素のまま**も見る
    # （添字のままの値は `words_of` が「形が読めない」で外す）
    if not found:
        for doc in raw_docs:
            found += [(v, "素の JSON") for v in find_key(doc)]
    return found


_SCRIPT_JSON = re.compile(
    r"<script\b[^>]*\btype=[\"']application/json[\"'][^>]*>(.*?)</script>",
    re.S | re.I)
_KEY_IN_TEXT = re.compile(re.escape(KEY) + r"[\"']?\s*:\s*")


def from_html(text: str) -> list:
    """画面の HTML に埋まった data から、禁止ワードの欄を探す。

    1. `<script type="application/json">`（fetch の写し）を JSON として開く
    2. 無ければ、`kit.start` に渡す data の字面（`filtering_word:[…]`）を
       そこから JSON として読む

    Args:
        text: HTML

    Returns:
        `[(欄の値, 形の名前)]`。見つからなければ空
    """
    found = []
    for m in _SCRIPT_JSON.finditer(text):
        for doc in parse_json(m.group(1).strip()):
            found += [(v, "HTML の JSON") for v in find_key(doc)]
    if found:
        return found
    dec = json.JSONDecoder()
    for m in _KEY_IN_TEXT.finditer(text):
        try:
            v, _ = dec.raw_decode(text, m.end())
        except ValueError:
            continue
        found.append((v, "HTML の data"))
    return found


# --- 語にする ----------------------------------------------------------------

# 1つの字で来たときの区切り（改行・カンマ・読点）
_SPLIT = re.compile(r"[\r\n,、，]+")


def words_of(v):
    """欄の値を、語の並びにする。

    Args:
        v: `filtering_word` の値

    Returns:
        (語の並び, 並びの形)。形が読めなければ (None, 形)
    """
    if v is None:
        return [], "空(null)"
    if isinstance(v, str):
        return _SPLIT.split(v), "区切りの字"
    if isinstance(v, list):
        out = []
        for x in v:
            if isinstance(x, str):
                out.append(x)
            elif isinstance(x, (int, float)) and not isinstance(x, bool):
                out.append(str(x))
            elif isinstance(x, dict):
                for k in ("word", "text", "value"):
                    if isinstance(x.get(k), str):
                        out.append(x[k])
                        break
        return out, "配列"
    return None, type(v).__name__


def normalize(raw) -> list:
    """NFKC・前後の空白を落とす・空と重複を除く・並べ替える。

    Args:
        raw: 語の並び（元のまま）

    Returns:
        揃えた語の並び
    """
    out = set()
    for w in raw:
        w = unicodedata.normalize("NFKC", str(w)).strip()
        if w:
            out.add(w)
    return sorted(out)


def fingerprint(words) -> str:
    """並べた語の SHA-256 の頭8桁。**ログに出してよいのはこれと件数だけ。**

    Args:
        words: `normalize()` の返り値（並べ替え済み）

    Returns:
        16進8桁
    """
    return hashlib.sha256("\n".join(words).encode("utf-8")).hexdigest()[:8]


def collect() -> tuple:
    """取ってきて、禁止ワードの欄を探す。`__data.json` → HTML の順。

    Returns:
        (元の語の並び, 取った先, 見つかった場所の数, 並びの形)

    Raises:
        Missing: どこからも取れなかった（理由つき。**語は入れない**）
    """
    why = []
    for url, name, parse in ((DATA_URL, "__data.json", from_data_json),
                             (PAGE, "HTML", from_html)):
        try:
            status, text = fetch(url)
        except FetchError as e:
            why.append(f"{name}: つながらない（{e}）")
            continue
        if status != 200:
            why.append(f"{name}: HTTP {status}")
            continue
        found = parse(text)
        if not found:
            why.append(f"{name}: {KEY} が見つからない")
            continue
        raw, forms, places, bad = [], [], 0, []
        for v, form in found:
            ws, shape = words_of(v)
            if ws is None:
                bad.append(shape)
                continue
            raw += ws
            places += 1
            forms.append(f"{form}・{shape}")
        if not places:
            why.append(f"{name}: {KEY} はあったが形が読めない（{'/'.join(sorted(set(bad)))}）")
            continue
        return raw, name, places, " / ".join(sorted(set(forms)))
    raise Missing("; ".join(why))


# --- 置き場 ------------------------------------------------------------------


def read_current(client) -> dict:
    """いま置き場に入っているもの。**語は返すが、出すのは呼ぶ側が件数と指紋だけ。**

    Args:
        client: Firestore クライアント

    Returns:
        `{"exists", "words", "source", "others"}`（others はほかの欄の名前）
    """
    snap = client.collection(COLLECTION).document(DOC).get()
    v = (snap.to_dict() or {}) if snap.exists else {}
    words = v.get("ngWords")
    return {
        "exists": bool(snap.exists),
        "words": list(words) if isinstance(words, list) else None,
        "source": v.get("ngWordsSource"),
        "others": sorted(k for k in v if not k.startswith("ngWords")),
    }


def write(client, words, now) -> None:
    """3つの欄だけ書く。**merge で**（同じ書類のほかの欄を消さない）。

    Args:
        client: Firestore クライアント（読み専用を渡すと止まる）
        words: 揃えた語の並び
        now: 写した時刻
    """
    client.collection(COLLECTION).document(DOC).set({
        "ngWords": list(words),
        "ngWordsSyncedAt": now,
        "ngWordsSource": "doneru",
    }, merge=True)


def _state(cur: dict) -> str:
    """置き場の姿を、件数と指紋だけで言う。"""
    if not cur["exists"]:
        return "書類なし"
    if cur["words"] is None:
        return f"ngWords なし・ほかの欄 {len(cur['others'])} 個"
    ws = normalize(cur["words"])
    return (f"ngWords {len(cur['words'])} 語・指紋 {fingerprint(ws)}・"
            f"ほかの欄 {len(cur['others'])} 個")


def main(client=None) -> int:
    """取ってきて数え、apply なら書いて読み直す。

    Args:
        client: Firestore クライアント。渡さなければ本番につなぐ
            （**見張りが偽物を差し込むためだけ**に開けてある）

    Returns:
        終了コード（頭の「終了コード」）
    """
    a = args()
    apply = bool(a.get("apply"))
    extra = sorted(k for k in a if k != "apply")
    if extra:
        log.warning("使わない入力があります（欄の名前: %s）", ", ".join(extra))

    # **取れるまで Firestore には触らない。** 取れなければ、書く道に入らない
    try:
        raw, source, places, forms = collect()
    except Missing as e:
        log.error("禁止ワードが取れませんでした（%s）。**1バイトも書きません**", e)
        notice(f"禁止ワード: 取れませんでした（{e}）。書いていません")
        return 1

    words = normalize(raw)
    fp = fingerprint(words)
    blank = sum(1 for w in raw if not unicodedata.normalize("NFKC", str(w)).strip())
    log.info("取った先: %s（%s・%d か所）", source, forms, places)
    log.info("禁止ワード: 元 %d 個 → %d 語（空 %d・重複 %d を除いた）・指紋 %s",
             len(raw), len(words), blank, len(raw) - blank - len(words), fp)

    if len(words) < MIN_WORDS:
        log.error("%d 語でした。**書きません**（0語で上書きすると、"
                  "島の守りが黙って消えます）", len(words))
        notice(f"禁止ワード: {len(words)} 語だったので書いていません（{source}）")
        return 1

    live = client if client is not None else db()
    # **下見は書く口ごと塞ぐ**（`_fs.readonly`）
    target = live if apply else readonly(live)

    before = read_current(target)
    log.info("いまの %s/%s: %s", COLLECTION, DOC, _state(before))
    same = (before["words"] is not None and normalize(before["words"]) == words)
    log.info("取ってきたものと比べて: %s", "同じ" if same else "**変わる**")

    if not apply:
        log.info("下見です。**1バイトも書いていません。**"
                 ' 書くには {"apply": true} を付けてください')
        notice(f"下見: 禁止ワード {len(words)} 語・指紋 {fp}（{source}）。"
               f"置き場は {_state(before)}。書いていません")
        return 0

    write(live, words, datetime.now(timezone.utc))

    # **書いたあと、読み直して確かめる。** 書けたことと、入ったことは別
    after = read_current(live)
    lost = sorted(set(before["others"]) - set(after["others"]))
    if after["words"] != words or after["source"] != "doneru":
        log.error("書いたはずの禁止ワードが読み直せません（%s）", _state(after))
        return 1
    if lost:
        log.error("同じ書類のほかの欄が %d 個消えました（merge になっていない）", len(lost))
        return 1
    log.info("書きました。読み直しても合います（%s）", _state(after))
    notice(f"禁止ワード {len(words)} 語・指紋 {fp} を {COLLECTION}/{DOC} に"
           f"写しました（{source}）")
    return 0


if __name__ == "__main__":
    sys.exit(main())
