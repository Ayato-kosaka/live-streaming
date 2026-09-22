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
| `public/review/manifest.json` | 日付ごとの写真・立っている人・立ち位置・枚数 |
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

    python3 tools/build_deck_photos.py            # 本番から取って焼く
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

# 画面（`cardPlace`）と焼き（`stampBox`）が使っている寸法。manifest にも入れて、
# 資料の JS がこの値を見るようにする（3か所で別々に書かないため）。
PLACE = {
    "byWidth": 0.34,
    "byHeight": 0.2,
    "right": 0.02,
    "bottom": 0.05,
    "tilt": 0,
}


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
    for c in cards:
        pid = c.get("photoId")
        icon = c.get("icon")
        if not pid or not icon:
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

    icons = sorted({p2["icon"] for p in photos.values() for p2 in p["people"].values()})

    # 日ごとに棚を作る。**昇順。** 資料は旅の順に進むので、新しい順ではない
    days: dict[str, list[dict]] = {}
    for p in photos.values():
        days.setdefault(p["day"], []).append(p)
    for lst in days.values():
        lst.sort(key=lambda p: (p["at"], p["id"]))

    # 代表（大きい1枚）は、**その日いちばん多くの人に渡った写真。**
    # 同着は ID 順にして、何度回しても同じ1枚が選ばれるようにする
    heroes = {
        day: sorted(lst, key=lambda p: (-len(p["people"]), p["id"]))[0]["id"]
        for day, lst in days.items()
    }

    print(f"カード {len(cards)}枚 / 写真 {len(photos)}枚 / キャラクター {len(icons)}人 / {len(days)}日")
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
        chars[icon] = {"src": f"review/c/{icon}-{CHAR_W}.webp", "w": im.width, "h": im.height}

    out_days = []
    for day in sorted(days):
        rows = []
        for p in days[day]:
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
        "cardCount": len(cards),
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

    print(f"焼いた: 写真 {len(photos)} + 代表 {len(heroes)} + キャラクター {len(icons)} = {total / 1e6:.2f}MB")
    if total > 6_000_000:
        print("6MB を超えた。品質（--quality）を下げる", file=sys.stderr)
        return 1
    return 0


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--api", default=API, help="カードの口")
    ap.add_argument("--cards", help="取りに行かず、この JSON を読む（口の応答をそのまま）")
    ap.add_argument("--out", default=OUT_DIR, help="焼き先")
    ap.add_argument("--cache", default="/tmp/deck_photos_cache", help="取ってきた元を置いておくところ（空で無効）")
    ap.add_argument("--quality", type=int, default=QUALITY, help=f"webp の品質（既定 {QUALITY}）")
    ap.add_argument("--dry-run", action="store_true", help="焼かずに数だけ見る")
    return build(ap.parse_args())


if __name__ == "__main__":
    raise SystemExit(main())
