#!/usr/bin/env python3
"""北欧ふりかえり資料（public/nordic_review.html）に差し込む旅の写真を焼く。

## なぜ焼くのか

**配信の本番中に、外の置き場へ絵を取りに行かせないため。**

あやと島カードの写真は Firebase Storage（`firebasestorage.googleapis.com`）に
あり、キャラクターの絵は Functions の口（`/island-api/characters/...`）が返す。
資料は OBS のブラウザソースが1枚開くだけのもので、**開いている最中に
1枚でも落ちたら、その場で画面が欠ける。** 配信中にやり直しは効かない。
外の置き場は落ちるときに落ちるし、Functions は冷えていれば数秒かかる。

同じオリジン（`/review/...`）に焼いておけば、Hosting が配るだけになる。
資料の HTML と同じ便で載るので、**資料が出ているなら絵も必ず出ている。**

ついでに軽くなる。元の写真は1枚 892KB（1200x1600）で、69枚そのままでは
60MB を超える。資料が使うのは一覧の小さいマスと、日ごとの大きい1枚だけなので、
その2つの寸法に焼き直す。

## 何を焼くか

| 出すもの | 何に使うか |
| --- | --- |
| `public/review/p/<photoId>-w400.webp` | カードの壁（一覧）。長辺 400 |
| `public/review/p/<photoId>-w960.webp` | 日ごとの大きい1枚。長辺 960。**日に1枚（代表）だけ** |
| `public/review/c/<icon>-128.webp` | 写真の上に立つキャラクター22人。透過を保つ |
| `public/review/manifest.json` | 日付ごとの写真・立っている人・立ち位置・枚数・**人ごとの score** |
| `public/review/manifest.js` | 同じ中身を `window.DECK_PHOTOS = {...}` で置いたもの |

手形が2つあるのは、**資料に `fetch` をさせないため。** 資料は OBS が1枚
開くだけのもので、`file://` で開いて確かめることもある（`tools/sprites` の
道具がそうしている）。`fetch("review/manifest.json")` は `file://` では
落ちるし、`http` でも返事を待つあいだ画面が組み上がらない。
`<script src="review/manifest.js">` なら、資料の HTML と同じ便で載って、
組み立てが始まるときにはもう手元にある（`nordic_review_mapdata.js` と同じ形）。
`manifest.json` は人が読む用・突き合わせ用に残す。

**何度回しても同じものが出る。** 日は昇順、1日の中は貼った順（同着は ID 順）、
人は icon 順。代表はカードの多い1枚（同着は ID 順）。

## 誰を立てるかの物差し（score）

**カードに立つ人は、投げ銭と出席の順位が高い人を優先する**（あやと・2026-09-22
「表紙のあやと島カードは投げ銭順位や出席順位が高い人を優先して」）。
順位はここで組まない。**島がもう持っている** `site/content/residents.ts` の
`score`（0〜1。直近90日の投げ銭の総額の順位と出席日数の順位を足して2で割ったもの。
島を歩く人の日替わり抽選と同じ重み）を icon 引きで焼き込むだけ。
**並べ替えるのは資料の側**（`public/nordic_review.html`）。

名簿に載っていない人（90日より前の人など）は `score: 0`。**順番が後ろになるだけで、
カードには立てる。** 名簿そのものが読めなければ**焼かずに止める**
（全員 0 は「順位を見ていない」と同じなのに、赤くならないため）。

## 立ち位置は、画面と同じ値を使う

`docs/nordic-photos.md` 5章 と `site/components/cards/cards.ts` の `cardPlace`
と同じ。既定は右下ひとところ・**縦の写真は横幅の34%**・右端から2%・下端から5%・
傾き0。台帳の `x/y/rot/scale` を使うのは**本人が動かしたもの（`moved`）だけ**
（既定のまま使うと右端を越えて絵が切れ、1人ずつ大きさが変わる。
あやと・2026-09-10「キャラクターが見切れてる。あと大きさも不揃い」）。

キャラクターの絵だけは**足元より下の透明な余白を落としてから**焼く。
落とさないと「下端から5%」がその余白ぶんずれて、**足が地面から浮く**
（`site/components/nordic/stamp.ts` の `opaqueBox` が焼くときに同じことをしている
理由がこれ）。左右と上は触らないので、横幅を基準にした34%・右2%は画面と一致する。

## 人を指す値は持ち出さない

manifest に入れるのは `icon`（キャラクターの書類ID）だけ。**名前も
チャンネルIDも入れない。** カードは投げ銭からしか作られないので、人を指す値を
並べると「誰がどの日に投げ銭したか」の一覧になる
（`docs/island-incident-2026-09-14-cards.md` 8-2）。`icon` は公開の口
`GET /island-api/cards` がすでに誰にでも返していて、カードの壁にも出ている。

    python3 tools/build_deck_photos.py            # 本番から取って焼く（旅の期間だけ）
    python3 tools/build_deck_photos.py --dry-run  # 焼かずに数だけ見る
"""

from __future__ import annotations

import argparse
import io
import json
import os
import sys
import time
import urllib.error
import urllib.request

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(ROOT, "public", "review")

API = "https://live-streaming-d3cac.web.app/island-api/cards"
CHAR_API = "https://live-streaming-d3cac.web.app/island-api/characters/{icon}/plain-640.webp"

# 焼く寸法（長辺）。一覧のマスは 1920 幅の資料で 150px 前後なので、
# 高解像度の画面ぶんを見ても 400 あれば足りる。大きい1枚は資料の半分を使う。
SMALL_LONG = 400
BIG_LONG = 960

# キャラクターの横幅。写真の横幅の34%に置くので、いちばん大きく出る
# 「大きい1枚（960の縦写真＝720幅）」でも 245px。128 で足りる。
CHAR_W = 128

# webp の品質。q58〜q90 を並べて 400px の実寸で見比べて決めた（2026-09-21）。
# q58 は花壇や木立がはっきり滲む。q82 と q90 は見分けがつかない。
# その手前の 80 を採る。69枚 + 代表11枚 + 22人で 3MB ほど（上限は 6MB）。
QUALITY = 80

# キャラクターの絵は端に近いところまで色が乗っている。8 以下を「透明」として
# 数えると、にじみの1〜2画素まで落としてしまう。焼くほう（`stamp.ts` の
# `opaqueBox`）と同じしきい値にそろえる。
ALPHA_MIN = 8

# 焼く期間。**旅のあいだの日だけ。**
#
# 口（`/island-api/cards`）は島のカードを全部返すので、旅の前の日
# （配信はしていたので投げ銭もカードもある）が混ざる。振り返り資料に
# 旅の外の日を混ぜると、**画面に出る「配られた枚数」が旅と関係ない枚数ぶん増え、
# 表紙の帯の先頭に旅の前の夜の写真が来る**（2026-09-06 が実際にそうなっていた）。
# 焼いたものを手で削らず、ここで落とす。
#
# 日付は資料そのものの `DECK.days`（9/11 クタイシ 〜 9/20 ストックホルム）と同じ。
# **資料の日と焼きの日がずれると、日ごとの区画に写真が出なくなる。**
TRIP_FROM = "2026-09-11"
TRIP_TO = "2026-09-20"

# 画面（`cardPlace`）と焼き（`stampBox`）が使っている寸法。manifest にも入れて、
# 資料の JS がこの値を見るようにする（3か所で別々に書かないため）。
PLACE = {
    "byWidth": 0.34,
    "byHeight": 0.2,
    "right": 0.02,
    "bottom": 0.05,
    "tilt": 0,
}


# 住人の名簿（自動生成）。**ここから読むのは `icon` と `score` の2つだけ。**
RESIDENTS_TS = os.path.join(ROOT, "site", "content", "residents.ts")


class ResidentsParseError(ValueError):
    """名簿が読めなかった。**黙って0人に畳まない**ための例外。"""


def _skip_gap(s: str, i: int) -> int:
    """空白とコメントを飛ばす。自動生成とはいえ、頭に注釈が付く形なので。"""
    while i < len(s):
        c = s[i]
        if c in " \t\r\n":
            i += 1
        elif s.startswith("//", i):
            j = s.find("\n", i)
            i = len(s) if j < 0 else j + 1
        elif s.startswith("/*", i):
            j = s.find("*/", i)
            if j < 0:
                raise ResidentsParseError("閉じていないコメントがある")
            i = j + 2
        else:
            break
    return i


def _read_string(s: str, i: int) -> tuple[str, int]:
    q = s[i]
    i += 1
    out: list[str] = []
    while i < len(s):
        c = s[i]
        if c == "\\":
            nxt = s[i + 1]
            out.append({"n": "\n", "t": "\t", "r": "\r"}.get(nxt, nxt))
            i += 2
            continue
        if c == q:
            return "".join(out), i + 1
        out.append(c)
        i += 1
    raise ResidentsParseError("閉じていない文字列がある")


def _read_value(s: str, i: int):
    """JS のリテラルを1つ読む。**正規表現で値を抜かない。**

    `residents.ts` は TypeScript で、`icon: "..."`, `score: 0.936` のような
    素直な並びだが、**行の形に頼ると黙って外れる**（値に `}` が入った・
    1行に2件並んだ・書式が変わった、のどれでも気づけない）。
    出てくる形（文字列・数・真偽・null・配列・オブジェクト）だけを読む
    小さな読み手を置いて、読めなかったら**投げる**。
    """
    i = _skip_gap(s, i)
    if i >= len(s):
        raise ResidentsParseError("値の手前で終わっている")
    c = s[i]
    if c in "\"'`":
        return _read_string(s, i)
    if c == "{":
        obj: dict[str, object] = {}
        i = _skip_gap(s, i + 1)
        while i < len(s) and s[i] != "}":
            if s[i] in "\"'`":
                key, i = _read_string(s, i)
            else:
                j = i
                while j < len(s) and (s[j].isalnum() or s[j] in "_$"):
                    j += 1
                if j == i:
                    raise ResidentsParseError(f"鍵が読めない: ...{s[i:i + 20]!r}")
                key, i = s[i:j], j
            i = _skip_gap(s, i)
            if i >= len(s) or s[i] != ":":
                raise ResidentsParseError(f"`{key}` のあとに : が無い")
            val, i = _read_value(s, i + 1)
            obj[key] = val
            i = _skip_gap(s, i)
            if i < len(s) and s[i] == ",":
                i = _skip_gap(s, i + 1)
        if i >= len(s):
            raise ResidentsParseError("閉じていない { がある")
        return obj, i + 1
    if c == "[":
        arr: list[object] = []
        i = _skip_gap(s, i + 1)
        while i < len(s) and s[i] != "]":
            val, i = _read_value(s, i)
            arr.append(val)
            i = _skip_gap(s, i)
            if i < len(s) and s[i] == ",":
                i = _skip_gap(s, i + 1)
        if i >= len(s):
            raise ResidentsParseError("閉じていない [ がある")
        return arr, i + 1
    j = i
    while j < len(s) and (s[j].isalnum() or s[j] in "+-._$"):
        j += 1
    word = s[i:j]
    if not word:
        raise ResidentsParseError(f"読めない値: ...{s[i:i + 20]!r}")
    if word == "true":
        return True, j
    if word == "false":
        return False, j
    if word == "null" or word == "undefined":
        return None, j
    try:
        return float(word) if ("." in word or "e" in word or "E" in word) else int(word), j
    except ValueError as e:
        raise ResidentsParseError(f"読めない値: {word!r}") from e


def read_resident_scores(path: str = RESIDENTS_TS) -> dict[str, float]:
    """`site/content/residents.ts` の `score`（0〜1）を icon 引きで返す。

    **自前で順位を組まない。** 「直近90日の投げ銭の総額の順位」と「同じ期間の
    出席日数の順位」を足して2で割ったものが、もう島にある（島の日替わりの
    抽選 `components/island/roster.ts` が使っている重み）。カードに誰を立てるかも
    同じ物差しで決める。**名簿は手で直さない**（`python/build_residents.py` が焼く）。

    **生の金額はここにも無い。** このリポジトリは公開なので、名簿に焼いてあるのは
    0〜1 に直した点だけ。手形にもその点しか持ち出さない。
    """
    with open(path, encoding="utf-8") as f:
        src = f.read()
    # 配列の頭を見つけるところだけ。中身は上の読み手が読む
    head = src.find("export const RESIDENTS")
    if head < 0:
        raise ResidentsParseError(f"RESIDENTS が見つからない: {path}")
    start = src.find("[", src.find("=", head))
    if start < 0:
        raise ResidentsParseError("RESIDENTS の [ が見つからない")
    arr, _ = _read_value(src, start)
    if not isinstance(arr, list) or not arr:
        raise ResidentsParseError("RESIDENTS が空、または配列ではない")
    out: dict[str, float] = {}
    for row in arr:
        if not isinstance(row, dict):
            raise ResidentsParseError(f"住人が読めない: {row!r}")
        icon = row.get("icon")
        score = row.get("score")
        if not isinstance(icon, str) or not icon:
            continue  # 絵を持たない人（絵文字だけ）。カードには出てこない
        if not isinstance(score, (int, float)):
            raise ResidentsParseError(f"score が数ではない: {icon[:12]} → {score!r}")
        if not 0 <= float(score) <= 1:
            raise ResidentsParseError(f"score が 0〜1 の外: {icon[:12]} → {score}")
        out[icon] = round(float(score), 3)
    if not out:
        raise ResidentsParseError("icon を持つ住人が1人も読めなかった")
    return out

def fetch(url: str, tries: int = 4) -> bytes:
    """落ちたら少し待って取り直す。

    69枚 + 22人ぶんを続けて取ると、**何もしていなくても1本は落ちる**
    （実際に22人のうち1人が1回目で落ちた）。1本の取りこぼしで
    焼き直しごとやり直すのは高くつくので、ここで拾う。
    """
    last: Exception | None = None
    for i in range(tries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "island-deck-photos/1"})
            with urllib.request.urlopen(req, timeout=60) as r:
                return r.read()
        except (urllib.error.URLError, TimeoutError, OSError) as e:  # noqa: PERF203
            last = e
            time.sleep(1.5 * (i + 1))
    raise RuntimeError(f"取れなかった: {url} ({last})")


def cached(cache_dir: str, name: str, url: str) -> bytes:
    """一度取ったものは置いておく。焼き直しのたびに 47MB を引かないため。"""
    if not cache_dir:
        return fetch(url)
    os.makedirs(cache_dir, exist_ok=True)
    path = os.path.join(cache_dir, name)
    if os.path.exists(path) and os.path.getsize(path) > 0:
        with open(path, "rb") as f:
            return f.read()
    raw = fetch(url)
    with open(path, "wb") as f:
        f.write(raw)
    return raw


def save_webp(im: Image.Image, path: str, quality: int, lossless_alpha: bool = False) -> int:
    """webp で書き出して、書いた大きさを返す。

    `method=6` は**書き出しが遅いかわりにいちばん小さくなる**設定。
    焼くのは1日1回も無いので、遅いほうを採る（配信で配るのは毎回なので）。
    """
    os.makedirs(os.path.dirname(path), exist_ok=True)
    buf = io.BytesIO()
    opts = {"quality": quality, "method": 6}
    if lossless_alpha:
        # 透過の境目は、色より形が効く。ふちが溶けると「紙を切り抜いて
        # 貼った」ようになるので、アルファだけは落とさない
        opts["exact"] = True
    im.save(buf, "WEBP", **opts)
    data = buf.getvalue()
    with open(path, "wb") as f:
        f.write(data)
    return len(data)


def fit(im: Image.Image, long_side: int) -> Image.Image:
    """長辺を合わせて縮める。**伸ばさない。**"""
    w, h = im.size
    k = long_side / max(w, h)
    if k >= 1:
        return im.copy()
    return im.resize((max(1, round(w * k)), max(1, round(h * k))), Image.LANCZOS)


def trim_bottom(im: Image.Image) -> Image.Image:
    """足元より下の透明な余白だけを落とす。

    **左右と上は触らない。** 横幅を基準に34%と置いているので、左右を詰めると
    画面（`cardPlace`）と大きさが変わってしまう。落としたいのは
    「下端から5%」をずらしている足の下の余白だけ。
    """
    alpha = im.getchannel("A")
    box = alpha.getbbox()
    if not box:
        return im
    # `getbbox` は 0 を透明とみなす。にじみの薄い画素まで拾うので、
    # しきい値を入れて取り直す（`stamp.ts` と同じ 8）
    solid = alpha.point(lambda v: 255 if v > ALPHA_MIN else 0)
    box = solid.getbbox() or box
    bottom = box[3]
    if bottom >= im.height:
        return im
    return im.crop((0, 0, im.width, bottom))


def in_trip(day: str, lo: str, hi: str) -> bool:
    """旅のあいだの日か。**日付は `YYYY-MM-DD` なので文字の大小で比べられる。**"""
    return bool(day) and lo <= day <= hi


def merge_baked(photos: dict, out_dir: str, lo: str, hi: str) -> dict:
    """口が返さなくなったぶんを、**前に焼いたものから足し戻す。**

    `GET /island-api/cards` は**新しい順に 600枚**しか返さない
    （`functions/src/cards.ts` の `MAX_CARDS`）。カードは毎日増えるので、
    素直に焼き直すと**旅の頭のほうが黙って消える。**
    実際 2026-09-22 の時点で、口の 600枚には 9/06・9/11・9/12 の3日が
    入っておらず、そのまま焼くと 11日が8日に、22人が18人に減った
    （消える4人のうち1人は score 0.922 の上位の人だった）。**赤くならない。**

    カードは消えないものなので、**一度焼いたものは残す。** 元の写真は
    もう手元に無くてよい（`public/review/p/*.webp` が焼いてある）。
    足し戻すのは、焼いた絵がファイルとして残っているものだけ。

    返すのは足し戻した数（写真・カード・人）。呼ぶ側が必ず出す。
    """
    mpath = os.path.join(out_dir, "manifest.json")
    if not os.path.exists(mpath):
        return {"photos": 0, "cards": 0, "days": 0}
    with open(mpath, encoding="utf-8") as f:
        old = json.load(f)
    add_p = add_c = 0
    days_back = set()
    dropped = 0
    for d in old.get("days") or []:
        if not in_trip(d.get("day") or "", lo, hi):
            # **前に焼いたものにも同じ物差しを当てる。** 足し戻しは
            # 「口の窓から落ちたぶんを拾う」ためで、期間外を生かす道ではない
            dropped += len(d.get("photos") or [])
            continue
        for row in d.get("photos") or []:
            pid = row.get("id")
            if not pid:
                continue
            people = {w["icon"]: w for w in (row.get("people") or []) if w.get("icon")}
            if pid in photos:
                # 同じ写真でも、**古いカードだけが 600枚の窓から落ちる**ことがある
                for icon, w in people.items():
                    if icon not in photos[pid]["people"]:
                        photos[pid]["people"][icon] = w
                        add_c += 1
                continue
            small = os.path.join(out_dir, "p", f"{pid}-w{SMALL_LONG}.webp")
            if not os.path.exists(small):
                # 焼いた絵も無い。**黙って作らない**（元の写真の在りかは手形に無い）
                print(f"  足し戻せない: {pid}（{small} が無い）", file=sys.stderr)
                continue
            photos[pid] = {
                "id": pid,
                "url": "",
                "w": row.get("w") or 0,
                "h": row.get("h") or 0,
                "note": row.get("note") or "",
                "day": d.get("day") or "",
                # 窓から落ちたということは**その日の古いほう。** 日の中では前に置く
                "at": -1,
                "people": people,
                # 焼き直せない印。**元の写真を取りに行かせない**
                "baked": {
                    "small": row.get("small") or f"review/p/{pid}-w{SMALL_LONG}.webp",
                    "big": row.get("big"),
                },
            }
            add_p += 1
            add_c += len(people)
            days_back.add(d.get("day"))
    return {"photos": add_p, "cards": add_c, "days": len(days_back), "dropped": dropped}

def build(args: argparse.Namespace) -> int:
    raw = (
        open(args.cards, "rb").read()  # noqa: SIM115
        if args.cards
        else fetch(args.api)
    )
    cards = json.loads(raw).get("cards") or []
    if not cards:
        print("カードが1枚も返ってこなかった。焼かずに止める", file=sys.stderr)
        return 1

    # 写真ごとにまとめる。**並べ替えの種は card から取る**（貼った時刻 `at`）
    photos: dict[str, dict] = {}
    out_of_trip = 0
    for c in cards:
        pid = c.get("photoId")
        icon = c.get("icon")
        if not pid or not icon:
            continue
        if not in_trip(c.get("day") or "", args.trip_from, args.trip_to):
            # 旅の外の日。**振り返り資料の数字に入れない**
            out_of_trip += 1
            continue
        p = photos.setdefault(
            pid,
            {
                "id": pid,
                "url": c.get("url"),
                "w": c.get("w") or 0,
                "h": c.get("h") or 0,
                "note": c.get("note") or "",
                "day": c.get("day") or "",
                "at": c.get("at") or 0,
                "people": {},
            },
        )
        # 同じ人が同じ写真に2枚持つことはないが、あっても1人として置く
        p["people"][icon] = {
            "icon": icon,
            "moved": bool(c.get("moved")),
            "x": round(float(c.get("x") or 0), 4),
            "y": round(float(c.get("y") or 0), 4),
            "rot": round(float(c.get("rot") or 0), 2),
            "scale": round(float(c.get("scale") or 1), 3),
        }

    print(f"期間: {args.trip_from} 〜 {args.trip_to}（旅の外のカード {out_of_trip}枚を落とした）")

    back = merge_baked(photos, args.out, args.trip_from, args.trip_to)
    if back["photos"] or back["cards"]:
        print(
            f"足し戻した（口の 600枚から落ちていたぶん）: {back['days']}日 / "
            f"写真 {back['photos']}枚 / カード {back['cards']}枚"
        )
    if back.get("dropped"):
        print(f"前に焼いたもののうち、旅の外の日の写真 {back['dropped']}枚は足し戻さなかった")

    icons = sorted({p2["icon"] for p in photos.values() for p2 in p["people"].values()})

    # **カードに誰を立てるかの物差し。** 自前で順位を組まず、島がもう持っている
    # `residents.ts` の `score`（投げ銭の総額の順位＋出席日数の順位）を引く。
    # 名簿が読めなかったら**ここで止める**（全員 0 で焼くと「順位を見ている」
    # つもりの並びが、ただの icon 順に戻る。しかも赤くならない）。
    scores = read_resident_scores(args.residents)
    missing = [i for i in icons if i not in scores]
    print(
        f"score: 名簿 {len(scores)}人 / カードを持つ {len(icons)}人のうち "
        f"{len(icons) - len(missing)}人ぶん引けた"
    )
    if missing:
        # **落とさない。** 90日より前の人はここに出るが、score 0 として
        # 順番が後ろになるだけで、カードには立てる
        print("  引けなかった（score 0 として後ろに回す）: " + ", ".join(i[:12] for i in missing))
    for icon, sc in sorted(scores.items(), key=lambda kv: (-kv[1], kv[0]))[:5]:
        if icon in icons:
            print(f"  上位: {icon[:12]} {sc:.3f}")

    # 日ごとに棚を作る。**昇順。** 資料は旅の順に進むので、新しい順ではない
    days: dict[str, list[dict]] = {}
    for p in photos.values():
        days.setdefault(p["day"], []).append(p)
    for lst in days.values():
        lst.sort(key=lambda p: (p["at"], p["id"]))

    # 代表（大きい1枚）は、**その日いちばん多くの人に渡った写真。**
    # 同着は ID 順にして、何度回しても同じ1枚が選ばれるようにする
    def hero_ok(p: dict) -> bool:
        """代表（大きい1枚）になれるか。

        足し戻した写真は**焼き直せない**ので、`-w960` が既に焼いてあるものだけ。
        無いまま代表にすると、その日の大きい枠が空になる。
        """
        b = p.get("baked")
        return not b or bool(b.get("big"))

    heroes = {}
    for day, lst in days.items():
        pool = [p for p in lst if hero_ok(p)] or lst
        heroes[day] = sorted(pool, key=lambda p: (-len(p["people"]), p["id"]))[0]["id"]

    card_count = sum(len(p["people"]) for p in photos.values())
    print(f"カード {card_count}枚 / 写真 {len(photos)}枚 / キャラクター {len(icons)}人 / {len(days)}日")
    if args.dry_run:
        for day in sorted(days):
            print(f"  {day}  写真{len(days[day]):3d}枚  代表 {heroes[day]}")
        return 0

    total = 0
    chars: dict[str, dict] = {}
    for icon in icons:
        im = Image.open(io.BytesIO(cached(args.cache, f"c_{icon}.webp", CHAR_API.format(icon=icon))))
        im = im.convert("RGBA")
        # **縮める前に余白を落とす。** 先に縮めると、落とす位置が1画素ぶれる
        im = trim_bottom(im)
        k = CHAR_W / im.width
        im = im.resize((CHAR_W, max(1, round(im.height * k))), Image.LANCZOS)
        path = os.path.join(args.out, "c", f"{icon}-{CHAR_W}.webp")
        total += save_webp(im, path, args.quality, lossless_alpha=True)
        # `score` は 0〜1 の点だけ。**額も日数も名前も入れない**
        # （入れると「誰がいくら投げたか」の一覧になる。
        # docs/island-incident-2026-09-14-cards.md 8-2）
        chars[icon] = {
            "src": f"review/c/{icon}-{CHAR_W}.webp",
            "w": im.width,
            "h": im.height,
            "score": scores.get(icon, 0.0),
        }

    out_days = []
    for day in sorted(days):
        rows = []
        for p in days[day]:
            if p.get("baked"):
                # 足し戻したぶん。**元の写真はもう引けない**ので、焼いてあるものを使う
                small_rel = p["baked"]["small"]
                big = p["baked"]["big"] if p["id"] == heroes[day] else None
                for rel in (small_rel, big):
                    if rel:
                        # 手形の道（`review/p/...`）ではなく、焼き先から組む
                        total += os.path.getsize(os.path.join(args.out, "p", os.path.basename(rel)))
                rows.append(
                    {
                        "id": p["id"],
                        "w": p["w"],
                        "h": p["h"],
                        "note": p["note"],
                        "small": small_rel,
                        "big": big,
                        "people": [p["people"][i] for i in sorted(p["people"])],
                    }
                )
                continue
            src = Image.open(io.BytesIO(cached(args.cache, f"p_{p['id']}.jpg", p["url"])))
            src = src.convert("RGB")
            small = fit(src, SMALL_LONG)
            total += save_webp(small, os.path.join(args.out, "p", f"{p['id']}-w{SMALL_LONG}.webp"), args.quality)
            big = None
            if p["id"] == heroes[day]:
                b = fit(src, BIG_LONG)
                total += save_webp(b, os.path.join(args.out, "p", f"{p['id']}-w{BIG_LONG}.webp"), args.quality)
                big = f"review/p/{p['id']}-w{BIG_LONG}.webp"
            rows.append(
                {
                    "id": p["id"],
                    "w": p["w"],
                    "h": p["h"],
                    "note": p["note"],
                    "small": f"review/p/{p['id']}-w{SMALL_LONG}.webp",
                    "big": big,
                    # icon 順。**人の並びから、その日の順番を読めないようにする**
                    "people": [p["people"][i] for i in sorted(p["people"])],
                }
            )
        out_days.append(
            {
                "day": day,
                "hero": heroes[day],
                "photoCount": len(rows),
                "cardCount": sum(len(r["people"]) for r in rows),
                "photos": rows,
            }
        )

    manifest = {
        "source": args.api,
        "tripFrom": args.trip_from,
        "tripTo": args.trip_to,
        "cardCount": card_count,
        "photoCount": len(photos),
        "charCount": len(icons),
        "place": PLACE,
        "chars": chars,
        "days": out_days,
    }
    os.makedirs(args.out, exist_ok=True)
    mpath = os.path.join(args.out, "manifest.json")
    # 並びを固定する。**差分が出るのは中身が変わったときだけ**にしたい
    text = json.dumps(manifest, ensure_ascii=False, sort_keys=True, indent=1) + "\n"
    with open(mpath, "w", encoding="utf-8") as f:
        f.write(text)
    total += len(text.encode("utf-8"))

    # 資料が読むほう。**`ensure_ascii=True`（\\uXXXX 逃がし）で書く。**
    # この .js が文字コードの宣言を持たずに読まれても、写真の一言が化けない
    js = "window.DECK_PHOTOS = " + json.dumps(manifest, ensure_ascii=True, sort_keys=True) + ";\n"
    with open(os.path.join(args.out, "manifest.js"), "w", encoding="ascii") as f:
        f.write(js)
    total += len(js.encode("ascii"))

    # 手形が指していない絵を数える。**期間を絞ると、前に焼いた絵が宙に浮く。**
    # 消すのは人の判断（別の枝が使っているかもしれない）なので、ここでは名前を出すだけ
    used_files = {os.path.basename(r["small"]) for d in out_days for r in d["photos"]}
    used_files |= {os.path.basename(r["big"]) for d in out_days for r in d["photos"] if r["big"]}
    used_files |= {os.path.basename(c["src"]) for c in chars.values()}
    orphans = []
    for sub in ("p", "c"):
        d = os.path.join(args.out, sub)
        if not os.path.isdir(d):
            continue
        orphans += [os.path.join(sub, f) for f in sorted(os.listdir(d)) if f not in used_files]
    if orphans:
        print(f"手形が指していない絵が {len(orphans)}本ある（消すかどうかは人が決める）:")
        for f in orphans:
            print(f"  {f}")

    print(f"焼いた: 写真 {len(photos)} + 代表 {len(heroes)} + キャラクター {len(icons)} = {total / 1e6:.2f}MB")
    if total > 6_000_000:
        print("6MB を超えた。品質（--quality）を下げる", file=sys.stderr)
        return 1
    return 0


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--api", default=API, help="カードの口")
    ap.add_argument("--cards", help="取りに行かず、この JSON を読む（口の応答をそのまま）")
    ap.add_argument("--trip-from", default=TRIP_FROM, help=f"焼く期間の頭（既定 {TRIP_FROM}）")
    ap.add_argument("--trip-to", default=TRIP_TO, help=f"焼く期間の尻（既定 {TRIP_TO}）")
    ap.add_argument("--residents", default=RESIDENTS_TS, help="score を引く名簿（既定 site/content/residents.ts）")
    ap.add_argument("--out", default=OUT_DIR, help="焼き先")
    ap.add_argument("--cache", default="/tmp/deck_photos_cache", help="取ってきた元を置いておくところ（空で無効）")
    ap.add_argument("--quality", type=int, default=QUALITY, help=f"webp の品質（既定 {QUALITY}）")
    ap.add_argument("--dry-run", action="store_true", help="焼かずに数だけ見る")
    return build(ap.parse_args())


if __name__ == "__main__":
    raise SystemExit(main())
