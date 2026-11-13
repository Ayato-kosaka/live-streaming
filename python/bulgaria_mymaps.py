"""My Maps に取り込む元（CSV）を、焼く前の材料から作る。

    python3 python/bulgaria_mymaps.py

**なぜ要るか。** あやと（2026-11-13）:

> Googleマップのマイマップを使って、それをブログに埋め込んだりするのはOKらしいので、
> それでいきたいんですよね。ちょっと今のやつGoogleマップと違って見慣れてなくて見にくい。

My Maps は Google 自身が「埋め込む」を用意していて、**鍵も請求先も要らない。**
本物の Google マップの見た目のまま、こちらのピンが載る。

ただし**My Maps を作る口は画面しか無い**ので、ログイン済みの Chrome が要る。
この箱からは触れない（`.claude/skills/ec2-chrome/SKILL.md`）。

**だから、手で置かせない。** ピンを24個を手で置くと、やる人が1時間溶かす。
My Maps は CSV を取り込めるので、**取り込む元をこちらで作って渡す。**
向こうの仕事は「取り込む → 公開 → 埋め込みの id をコピー」の3手になる。

## 出すもの

`python/data/bulgaria/mymaps/` に3枚。節と1対1にする（My Maps の層で分けない
——埋め込みの URL から層を選べないので、節ごとに別の地図にするほうが確実）。

| ファイル | 中身 |
| --- | --- |
| `see.csv` | 見たいもの22か所（遠いものも入れる。My Maps は引けるので、絵と違って切らなくていい） |
| `eat.csv` | 食べたいものがひもづく実在の店・市場 |
| `buy.csv` | 買いたいものがひもづく店・市場 |

**欄は My Maps の取り込み画面がそのまま読める形**（緯度・経度・名前・説明）。
`印` は ◎○⚠ の代わりに言葉で入れる——My Maps の色分けに使えるので。
"""

import csv
import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, "data", "bulgaria")
OUT = os.path.join(DATA, "mymaps")

#: `src` の OSM の道から緯度経度を取る。`places.json` は座標を別の欄に持たず、
#: 引いたときの道をそのまま控えてある（出どころが消えないように）
MLAT = re.compile(r"mlat=([-\d.]+)")
MLON = re.compile(r"mlon=([-\d.]+)")

MARK = {"good": "あやとの好みに合う", "ok": "たぶん合う", "warn": "注意（豚・酒・高い入場料）"}


def load(name):
    with open(os.path.join(DATA, name), encoding="utf-8") as f:
        return json.load(f)


def gmap(lat, lon):
    return f"https://www.google.com/maps/search/?api=1&query={lat},{lon}&hl=ja"


def rows_see():
    """見たいもの22か所。

    **印は焼くほうの規則から取る**（`build_bulgaria.py` の `mark_spot`）。
    ここで書き直すと、規則が2か所になって片方だけ古くなる——面と地図で
    ◎と⚠ が食い違うのがいちばん悪い。材料（`facts.json`）には印が無く、
    入場料と名前から毎回決まる、というのが元々の決まり。
    """
    sys.path.insert(0, HERE)
    from build_bulgaria import mark_spot

    facts = load("facts.json")
    fee = {x["name"]: x.get("fee", "") for x in load("fill.json").get("spots", [])}
    out = []
    for s in facts["spots"]:
        lat, lon = s.get("lat"), s.get("lon")
        if lat is None or lon is None:
            continue
        mark, _why = mark_spot({**s, "fee": fee.get(s["name"], "")})
        f = {"mark": mark}
        out.append({
            "名前": s["name"],
            "緯度": lat,
            "経度": lon,
            "説明": (s.get("what") or "")[:240],
            "現地表記": s.get("cyr", ""),
            "印": MARK.get(f.get("mark", ""), ""),
            "Googleマップ": gmap(lat, lon),
        })
    return out


def rows_places(kind):
    """`kind`（food / buy）の品がひもづく店・市場を、重複なしで返す。

    `places.json` の `food` / `buy` は **品 → 店の名前の一覧**で、店そのものは
    `places` に1回だけ書いてある。**同じ店を2回ピンにしない**ように、
    出てきた順で名寄せしてから引く。
    """
    p = load("places.json")
    bykey = {x.get("key"): x for x in p.get("places", [])}
    want = []
    for names in (p.get(kind) or {}).values():
        for n in names:
            if n not in want:
                want.append(n)
    src = [bykey[n] for n in want if n in bykey]
    out = []
    for x in src or []:
        u = x.get("src") or ""
        mlat, mlon = MLAT.search(u), MLON.search(u)
        if not (mlat and mlon):
            continue
        lat, lon = mlat.group(1), mlon.group(1)
        out.append({
            "名前": x.get("label") or x.get("key") or "",
            "緯度": lat,
            "経度": lon,
            "説明": (x.get("what") or "")[:240],
            "現地表記": x.get("cyr", ""),
            "印": "",
            "Googleマップ": gmap(lat, lon),
        })
    return out


def write(name, rows):
    if not rows:
        raise SystemExit(f"{name}: 1件も作れませんでした（材料の欄が変わった？）")
    os.makedirs(OUT, exist_ok=True)
    path = os.path.join(OUT, name)
    with open(path, "w", encoding="utf-8-sig", newline="") as f:
        # **BOM 付きで書く。** My Maps の取り込みは、無いと日本語が化ける
        w = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
        w.writeheader()
        w.writerows(rows)
    print(f"{name}: {len(rows)}件 → {path}")


def main():
    pl = load("places.json")
    write("see.csv", rows_see())
    # 料理と土産は、どの店に結びつくかを `places.json` が持っている。
    # 入れ物の名前が増えても落ちないように、在るものだけ拾う
    write("eat.csv", rows_places("food"))
    write("buy.csv", rows_places("buy"))
    print(f"（places.json の入れ物: {', '.join(k for k in pl if not k.startswith('_'))}）")
    return 0


if __name__ == "__main__":
    sys.exit(main())
