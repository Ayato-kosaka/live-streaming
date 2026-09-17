"""**誰でも読める口の返りに、素性が乗っていないか**を数える。

    python python/public_ids_selftest.py                 # 本番を読む（GET だけ）
    python python/public_ids_selftest.py --base http://…  # 手元の写しを読む
    python python/public_ids_selftest.py --file state=/tmp/state.json
    python python/public_ids_selftest.py --offline        # 対照だけ回す

**GET しか投げない。** 本番の Firestore には1バイトも書かない。

## 何を見るか

公開の口は「誰でも」の口で、**キャッシュにも載る。** そこに1つでも
uid やチャンネルIDが乗っていると、**別の口の同じ字と突き合わせるだけで
「これを出したのはこの人」が分かる。** 2026-09-17 に実際にそうなっていて、
`/nextplans` の `byUid` を `/state` の `residents[].uid` で引くと、企画の
画面には名前を出していないのに出した人の名前と顔が出た
（`docs/island-misses.md` #133、`docs/island-incident-2026-09-14-cards.md` 8-2）。

だから数えるのは「読める字」ではなく、**突き合わせの鍵になる字**。

| 種類 | 何 | 合否 |
| --- | --- | --- |
| 身元 | uid・チャンネルID・メール・どねID・名乗り欄の外のハンドル | **0でないと落ちる** |
| 名乗り | `by` / `residents[].name` に入ったハンドル | 数えるが落とさない |

**名乗りで落とさないのは、本人が出すと決めて書いた字だから。**
付箋の欄は「◯◯ として貼ります」と見せてから貼る（`components/live/Notes.tsx`）。
勝手に消すと、署名したつもりの1枚が名無しになる。**ただし欄が違えば落とす**
——`by` 以外のところにハンドルが出るのは、こちらが漏らしている。

## 「0件」を、見ていないから0件と区別する（対照）

守っているのが漏れる側に倒れるものなので、**この検査が寝ていても
出力は満点と同じ顔になる**（`docs/island-standards.md` §15、`#126`）。
だから先に [1] を回す。

1. **わざと素性を混ぜた作り物で、種類ごとに必ず当たること。**
   ここで当たらない種類があれば、その種類は**何も見ていない**
2. **人を指さないもの（指紋・16進の鍵・絵の id・件数・日付・`@v4`）では
   落ちないこと。** 何にでも当たる探し方だと、本当の漏れが赤の海に埋もれる

どちらも**こしらえもの**。本番の値は1つも置かない。

## 数えるのは自前の正規表現ではなく `tools/logident.py`

チャンネルID・ハンドル・メール・どねID の探し方は、毎晩のログを見張って
いるのと同じものを使う。ここで書き直すと探し方が2つになって、片方を
直してもう片方を直し忘れる（`python/logsafe_selftest.py` と同じ理由）。
**uid だけはあちらに無い**ので、ここで足している（下の `UID` の説明）。

## 値は1文字も印字しない

このリポジトリは公開で、Actions のログも誰でも読める。漏れを数える道具が
漏れた値を印字したら、その出力を貼った先が新しい漏れになる。
出すのは**指紋（`#a3f9`）と件数と欄の名前**だけ。

## 終了コード

0=当たり無し / 1=身元の当たりあり / **2=見えていない**
（対照が当たらない・口が1つも答えない・作り物で誤当たり）
"""

import argparse
import hashlib
import json
import re
import sys
import urllib.error
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "tools"))
import logident  # noqa: E402

BASE = "https://live-streaming-d3cac.web.app/island-api"

# 叩く口。**GET だけ。** ログインの要る口（`?mine=1` など）はここに入れない
# ——あれは「呼んだ人ごとに中身が違う」ほうなので、公開の面ではない。
PATHS = [
    "/state",
    "/nextplans",
    "/nextplans?events=1",
    "/stickies",
    "/notes",
    "/poll",
    "/fork",
    "/cards",
    "/fund",
    "/nordic/photos",
    "/characters",
]

# Firebase の uid。**ちょうど28字の英数**（記号は入らない）。
# `tools/logident.py` は毎晩のログを見張るもので、ログに uid は出ない。
# ここでだけ足す。前後を見るのは、長い16進や base64 の一部を28字ぶん
# 切り取って当たりにしないため（切り取ると件数が水増しされる）。
UID = re.compile(r"(?<![A-Za-z0-9_-])[A-Za-z0-9]{28}(?![A-Za-z0-9_-])")

# 欄の名前そのものが素性を言っているもの。**値の形が変わっても当たる。**
# 形だけ見ていると、uid を base64 にして返した日に 0 件で通ってしまう。
ID_KEYS = {"uid", "byuid", "channelid", "cid", "email", "viewerpk",
           "donorid", "doneruid", "authoruid"}

# 名乗りの欄。**本人が出すと決めて書いた字**が入る（上の説明）。
# ここに入ったハンドルは数えるが、落とさない。
NAME_KEYS = {"by", "name", "nickname", "channelname", "nameSnapshot".lower()}


def fp(s: str) -> str:
    """値の指紋。**値そのものは返さない。**

    Args:
        s: 指紋を取る字

    Returns:
        `#a3f9` の形（4字）
    """
    return "#" + hashlib.sha256(s.encode()).hexdigest()[:4]


def walk(node, path="", out=None):
    """JSON を端まで歩いて、(欄の道, 字) を並べる。

    **鍵も字として見る。** カードの書類IDが `<画像>__<チャンネル>` だった
    ように、値ではなく鍵の側に素性が入ることがある
    （`docs/island-api.md` 3章）。

    Args:
        node: JSON の節
        path: ここまでの道
        out: ためる先

    Returns:
        [(道, 字)] の一覧
    """
    if out is None:
        out = []
    if isinstance(node, dict):
        for k, v in node.items():
            out.append((f"{path}.<key>", str(k)))
            walk(v, f"{path}.{k}" if path else k, out)
    elif isinstance(node, list):
        for x in node:
            walk(x, f"{path}[]", out)
    elif isinstance(node, str):
        out.append((path, node))
    return out


def scan(body):
    """1つの返りを見て、当たりを種類ごとに分ける。

    Args:
        body: JSON にした返り

    Returns:
        (身元の当たり, 名乗りの当たり, 見た字の数)。当たりは
        [(種類, 欄の道, 指紋)]。**値は入らない**
    """
    ident, named = [], []
    leaves = walk(body)
    for path, text in leaves:
        leaf = path.split(".")[-1].lower().rstrip("[]")
        # 1. 欄の名前が素性を言っている（値の形は問わない）
        if leaf in ID_KEYS and text.strip():
            ident.append(("欄の名前", path, fp(text)))
            continue
        # 2. 値の形。**探し方は毎晩のログと同じもの**（`tools/logident.py`）。
        #    `__` で切ったものも見る。**欄を消しても書類IDから読める**形が
        #    実際にあった（`<画像のID>__<チャンネルID>`。2026-09-14 の障害）。
        #    あちらの探し方は前後に `_` が来ると当たらないので、ここで割る。
        counts = logident.count(text.replace("__", " "))
        for kind in ("channel_id", "doneru_id", "email"):
            for _ in range(counts[kind]):
                ident.append((kind, path, fp(text)))
        for _ in range(counts["handle"]):
            # 名乗りの欄に入ったハンドルは、本人が出すと決めた字
            (named if leaf in NAME_KEYS else ident).append(
                ("handle", path, fp(text)))
        for _ in UID.findall(text):
            ident.append(("uid", path, fp(text)))
    return ident, named, len(leaves)


def report(label, body):
    """1つの口ぶんを1行で出す。**値は出さない。**

    Args:
        label: 口の名前
        body: JSON にした返り

    Returns:
        身元の当たりの数
    """
    ident, named, n = scan(body)
    mark = "OK  " if not ident else "HIT "
    kinds = {}
    for kind, path, _ in ident:
        kinds[f"{kind}@{path}"] = kinds.get(f"{kind}@{path}", 0) + 1
    tail = ("  " + " ".join(f"{k}={v}" for k, v in sorted(kinds.items()))
            if kinds else "")
    print(f"{mark}{label}: 身元 {len(ident)} / 見た字 {n}"
          f"（名乗り {len(named)}）{tail}")
    for kind, path, mark2 in ident:
        print(f"       - {kind} {path} {mark2}")
    return len(ident)


# ---------------- 対照 ----------------

# **当たらなければならない作り物。** 本番の形に合わせる（形が違うと、
# 探し方が本番では効かないまま通る。`#79` と同じ形）。
DIRTY = {
    # 欄の名前が言っているもの
    "residents": [{
        "uid": "abcdefghijklmnopqrstuvwxyz12",        # 28字の英数
        "channelId": "UCaaaaaaaaaaaaaaaaaaaaaa",      # UC + 22字
        "name": "@handle_one",
        "photo": "https://example.invalid/a.png",
    }],
    "plans": [{"byUid": "ABCDEFGHIJKLMNOPQRSTUVWXYZ78", "by": "@handle_two"}],
    # 欄の名前では言っていないもの。**形だけが手がかり**
    "cards": [{
        # 書類IDの中のチャンネルID。**欄を消しても id から読める**形
        # （`docs/island-api.md` 3章。2026-09-14 の障害がこれ）
        "id": "img_0000001__UCbbbbbbbbbbbbbbbbbbbbbb",
        "note": "someone@example.invalid",
    }],
    "notes": [{"id": "n1", "where": "@handle_three"}],   # 名乗りでない欄
    "tips": [{"label": "1234567890"}],                   # どねID（10桁）
    "session": {"key": "ABCDEFGHIJKLMNOPQRSTUVWXYZ90"},  # uid の形
}

# **当たってはいけない作り物。** 人を指さないものばかり。
CLEAN = {
    "residents": [{
        "here": "0123456789abcdef",                  # 潰した鍵（16字の16進）
        "icon": "char_sakura",
        "name": "さくら",
        "photo": "https://example.invalid/b.png",
    }],
    "plans": [{"id": "AbCdEfGhIjKlMnOpQrSt", "byLogin": True,
               "createdAt": "2026-09-17T00:00:00.000Z", "hearts": 3}],
    "stats": {"videos": 412, "days": 1234567, "note": "actions/checkout@v4"},
    "residentDays": {"char_sakura": 88},
}


def control():
    """対照。**両側から当てる。**

    Returns:
        0=対照が効いている / 2=効いていない（＝この検査は何も見ていない）
    """
    print("[1] 対照（本番の値は1つも置かない）")
    ident, named, n = scan(DIRTY)
    kinds = {k for k, _, _ in ident}
    want = {"欄の名前", "channel_id", "handle", "email", "doneru_id", "uid"}
    miss = want - kinds
    print(f"  {'○' if not miss else '✕'} 素性を混ぜた作り物で当たった種類 "
          f"{len(kinds & want)}/{len(want)}、当たり {len(ident)} 件 / 見た字 {n}"
          + (f"（見えていない種類 {len(miss)} 件）" if miss else ""))
    # 名乗りの欄のハンドルは、身元ではなく名乗りに分かれること
    ok_named = len(named) == 2
    print(f"  {'○' if ok_named else '✕'} 名乗りの欄（`by` `name`）の"
          f"ハンドルは名乗りに分かれた {len(named)}/2 件")
    ident2, named2, n2 = scan(CLEAN)
    print(f"  {'○' if not ident2 else '✕'} 人を指さない作り物では"
          f"当たらない（当たり {len(ident2)} 件 / 見た字 {n2}）")
    return 0 if (not miss and ok_named and not ident2) else 2


def fetch(path, base):
    """口を1つ叩く。**GET だけ。**

    Args:
        path: 口
        base: 入口

    Returns:
        JSON にした返り。読めなければ None
    """
    try:
        with urllib.request.urlopen(base + path, timeout=20) as r:
            return json.loads(r.read().decode())
    except (urllib.error.URLError, ValueError, TimeoutError) as e:
        print(f"--  {path}: 読めなかった（{type(e).__name__}）")
        return None


def main() -> int:
    """入口。

    Returns:
        終了コード（0/1/2）
    """
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default=BASE, help="口の入口")
    ap.add_argument("--file", action="append", default=[],
                    help="名前=ファイル。叩かずに、控えた返りを見る")
    ap.add_argument("--offline", action="store_true", help="対照だけ回す")
    a = ap.parse_args()

    print("=== 誰でも読める口に、素性が乗っていないか ===")
    if control() != 0:
        print("✕ 対照が効いていない。**この検査は何も見ていない**（§15）")
        return 2
    if a.offline:
        print("○ 対照だけ回した（口は叩いていない）")
        return 0

    print(f"\n[2] 口（GET だけ。base={a.base}）")
    hits, seen = 0, 0
    for spec in a.file:
        name, _, f = spec.partition("=")
        with open(f, encoding="utf-8") as fh:
            hits += report(name, json.load(fh))
        seen += 1
    if not a.file:
        for p in PATHS:
            body = fetch(p, a.base)
            if body is None:
                continue
            hits += report(p, body)
            seen += 1

    print()
    # **1つも答えなければ「0件」ではない。** 見えていないだけ（§15）
    if seen == 0:
        print("✕ 答えた口が1つもありませんでした（数えるものが無い）")
        return 2
    if hits:
        print(f"✕ 身元の当たり {hits} 件（{seen} 口を見た）")
        return 1
    print(f"○ {seen} 口を見て、身元の当たり 0 件"
          "（作り物では6種類とも当たるところまで見た）")
    return 0


if __name__ == "__main__":
    sys.exit(main())
