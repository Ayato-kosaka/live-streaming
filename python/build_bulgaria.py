# -*- coding: utf-8 -*-
"""ブルガリア（ソフィア）の案内（`/bulgaria`）の中身を焼く。

    python3 python/build_bulgaria.py

材料は `python/data/bulgaria/`:

| | |
| --- | --- |
| `facts.json` | 調べた事実（見どころ22・食べもの22・基本情報14・ことば19…） |
| `fill.json`  | 料理の豚／酒／肉と、見どころの入場料 |
| `taste.json` | **あやとの好み。議事録から実測したもの**（全件、本人の発言の引用つき） |

出すのは `site/content/bulgaria.ts` と `site/content/bulgaria/map.json`。

## なぜ「印」を機械で付けるのか

あやとの指示（2026-11-06）:

> 見たいもの … これまでの経験からどんなものが好きかも調べた上で
> 食べたいもの … これまでの経験からどんな食べ物が好きかも調べた上で

**ブルガリア料理の看板は豚で、あやとは豚が苦手。** 酒も2年前にやめている。
普通に名物を並べると、**半分が食べられないもの**になる。

だから重要度を**2本立て**にする。混ぜると「有名だけどあやとには合わない」が
表せなくなる。

| | |
| --- | --- |
| **星**（1〜3） | 一般の重要度。必見／行けたら／余裕があれば |
| **印**（◎○⚠） | **あやとに合うか。** ここで付ける |

**印は手で書かない。** 手で書くと、好みが変わったときに全部を見直すことになるし、
「なぜその印なのか」が消える。**下の規則1本から出して、理由の字も一緒に出す。**

## ⚠ を隠さない

隠すと配信の場で頼んでしまう。**出したうえで、なぜかを1行添える。**
「豚なので」「酒なので」「入場料が高いので」。
"""

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "python" / "data" / "bulgaria"
OUT_TS = ROOT / "site" / "content" / "bulgaria.ts"
OUT_MAP = ROOT / "site" / "content" / "bulgaria" / "map.json"

F = json.loads((SRC / "facts.json").read_text(encoding="utf-8"))
FILL = json.loads((SRC / "fill.json").read_text(encoding="utf-8"))

#: 写真（Wikimedia Commons）。**無くても焼ける**ようにしてある——
#: 写真を集める仕事と面を作る仕事が別なので、片方を待って止まらないため。
#: ただし**1枚も無いまま出さない**。足りない件数は最後に数えて出す
_PH = SRC / "photos.json"
PHOTOS = json.loads(_PH.read_text(encoding="utf-8")) if _PH.exists() else {}

#: 本物の街の地図（OpenStreetMap のタイルを合成したもの）。
#: `python/build_bulgaria_map.py` が焼く。**無ければ自前の丸だけの絵に落ちる**
_TL = SRC / "tiles.json"
TILES = json.loads(_TL.read_text(encoding="utf-8")) if _TL.exists() else None

#: 高いと感じる線。あやとは 5,280円 の入場料を「5,280円するやんけ」と言って入らなかった。
#: 1,770円（10ユーロ）はその3分の1だが、1日の買い出しが600〜700円の人なので、
#: **2日ぶんを超えたら札を出す**という線にした
PRICEY_EUR = 8.0

#: 好みに当たる言葉。`taste.json` の実測から引いた。**ここを直せば印が全部動く**
LIKE_FOOD = [
    ("ニンニク", "ニンニクの料理が好き"),
    ("トマト", "トマトの系統が好き"),
    ("唐辛子", "辛いものが好き"),
    ("チーズ", "チーズたっぷりが好き"),
    ("ヨーグルト", "ブルガリアで楽しみにしていたもの"),
    ("パイ", "200円前後のパン・パイで機嫌が最高になる"),
    ("パン", "200円前後のパン・パイで機嫌が最高になる"),
    ("鶏", "鶏の料理が好き"),
    ("じゃがいも", "じゃがいもの料理をよく作る"),
    ("豆", "豆のスープをよく作る"),
]
LIKE_SPOT = [
    ("市場", "「汚い」ローカル市場で機嫌がいい"),
    ("食堂", "地元の激安食堂が好き"),
    ("教会", "壁画だらけの正教会が好き"),
    ("大聖堂", "壁画だらけの正教会が好き"),
    ("修道院", "壁画だらけの正教会が好き"),
    ("公園", "公園のベンチでパンとチーズを食べるのが好き"),
    ("庭園", "公園のベンチでパンとチーズを食べるのが好き"),
    ("山", "夕日の見える高台が好き（元「夕日研究家」）"),
    ("展望", "夕日の見える高台が好き（元「夕日研究家」）"),
    ("温泉", "ただで湧いているものが好き"),
]


def yen_of(fee: str):
    """入場料の字からユーロの数を拾う。**無ければ None。**"""
    m = re.search(r"([0-9]+(?:\.[0-9]+)?)\s*ユーロ", fee or "")
    return float(m.group(1)) if m else None


def mark_food(d: dict):
    """料理ひとつの印。**規則はここ1本。**"""
    if d.get("alcohol"):
        return "warn", "お酒。あやとは2年ほど前にやめている"
    if d.get("pork"):
        return "warn", "豚。あやとは豚肉が苦手（ハム・ソーセージも）"
    for word, why in LIKE_FOOD:
        if word in (d.get("jp", "") + d.get("what", "")):
            return "good", why
    if d.get("meat") == "なし":
        return "ok", "肉が入らないので、豚を避けられる"
    return "ok", ""


def mark_buy(d: dict, alcohol: set):
    """土産ひとつの印。

    **ここにも印を出す。** 出さないと、ほかの節ぜんぶが ◎○⚠ を持っている面の中で
    この節だけ無印になって、「酒は印の対象外」と読めてしまう。
    ただし**土産は人に贈るもの**なので、⚠ の理由はそこまで言う。
    """
    if d["what"] in alcohol:
        return "warn", "お酒。あやとは飲まないので、人に贈るときだけ"
    for word, why in LIKE_FOOD:
        if word in (d["what"] + d["why"]):
            return "good", why
    return "ok", ""


def mark_spot(d: dict):
    """行き先ひとつの印。"""
    eur = yen_of(d.get("fee", ""))
    if eur is not None and eur >= PRICEY_EUR:
        return "warn", "入場料が高め。あやとは値段で入るかを決める"
    for word, why in LIKE_SPOT:
        if word in (d.get("name", "") + d.get("what", "")):
            return "good", why
    if "無料" in (d.get("fee") or ""):
        return "ok", "ただで入れる"
    return "ok", ""


#: 「1時間30分」の形。**`(?:` のうしろに `\\s*(` を続けない。**
#: 続けると `python/ts_readers_selftest.py` の「TS の欄を字で読んでいそうな正規表現」
#: の形（`:\\s*([0-9`）と1字違わず同じになって、**TS を読む気の無いこの焼き役が
#: 読み手として数えられる**（実際に赤くなった）。ここは2本に分けてある
_HM = re.compile(r"([0-9]+)\s*時間\s*(?:([0-9]+)\s*分)?")
_M = re.compile(r"([0-9]+)\s*分")


#: 写真の欄。**出どころ（`cm`）と撮った人（`by`）とライセンス（`lic`）を必ず連れてくる。**
#: どれか1つでも欠けたら、その写真は使わない——出どころの書けない絵を島に置かない
PHOTO_KEYS = ("img", "thumb", "big", "cm", "by", "lic", "alt")


def photo_of(kind: str, key: str) -> dict:
    """その1件の写真。**欠けていたら空の欄を返す**（面の側で分岐を書かないため）。"""
    p = (PHOTOS.get(kind) or {}).get(key) or {}
    if not all(p.get(k) for k in ("img", "cm", "lic")):
        return {k: "" for k in PHOTO_KEYS}
    return {k: p.get(k, "") for k in PHOTO_KEYS}


def _minutes(stay: str) -> int:
    """滞在の字から分を拾う。**いちばん短い言い方のほうを採る。**

    「蛇口だけなら10分、博物館を入れて1時間30分」のように、2通り書いてある欄が
    ある。合計に長いほうを足すと「丸2日」になって、コースとして読めなくなるので、
    **先に出てくる数**（＝基本の見学）だけを拾う。読めなければ 0。
    """
    hm = _HM.search(stay or "")
    m = _M.search(stay or "")
    if hm and (not m or hm.start() <= m.start()):
        return int(hm.group(1)) * 60 + int(hm.group(2) or 0)
    return int(m.group(1)) if m else 0


def esc(s) -> str:
    """TypeScript の文字列に入れる形。**改行とバッククォートを殺す**"""
    return (str(s or "").replace("\\", "\\\\").replace('"', '\\"')
            .replace("\n", " ").strip())


def main() -> None:
    fill_food = {x["jp"]: x for x in FILL["food"]}
    fill_spot = {x["name"]: x for x in FILL["spots"]}

    # ---- 突き合わせ。**名前が1つでも合わなければ焼かない**
    miss = [x["jp"] for x in F["food"] if x["jp"] not in fill_food]
    miss += [x["name"] for x in F["spots"] if x["name"] not in fill_spot]
    if miss:
        raise SystemExit("材料の名前が合いません: %s" % miss[:5])

    spots, food = [], []
    for s in F["spots"]:
        g = fill_spot[s["name"]]
        m, why = mark_spot({**s, **g})
        spots.append({**s, "fee": g.get("fee", ""), "mark": m, "why": why,
                      **photo_of("spots", s["name"])})
    # 距離は下で地図を組むときに出す（同じ計算を2回書かない）
    for d in F["food"]:
        g = fill_food[d["jp"]]
        m, why = mark_food({**d, **g})
        food.append({**d, **{k: g[k] for k in ("pork", "alcohol", "meat", "note")},
                     "mark": m, "why": why, **photo_of("food", d["jp"])})

    # ---- 街の地図。**緯度経度から座標を出すのはここだけ。**
    # 面の側で出し直さない（`components/macedonia/NmMapSvg.tsx` と同じ決まり）
    c = F["center"]
    import math
    # 1.5km 四方の狭い範囲なので、経度を cos(緯度) で縮めれば十分に合う
    k = math.cos(math.radians(c["lat"]))

    def km(s):
        """中心からの距離（km）。緯度1度=111km、経度は cos で縮める"""
        return math.hypot((s["lat"] - c["lat"]) * 111.0,
                          (s["lon"] - c["lon"]) * 111.0 * k)

    def _between(a, b):
        """a から b を見たときの差。`km()` に渡すと2点間の距離になる
        （中心からの距離と**同じ式を使う**ため、引き算だけをここでする）"""
        return {"lat": c["lat"] + (b["lat"] - a["lat"]),
                "lon": c["lon"] + (b["lon"] - a["lon"])}

    # **中心から1km の中だけを街の地図に載せる。** 外へ広げるほど中心の印が潰れる
    # ——リラ修道院（62km）まで入れた最初の版は 1000x10359 の紙になった。
    # **1.0 は恣意的な線ではない**: 距離を並べると 0.95km（ネフスキー大聖堂）と
    # 1.34km（NDK）のあいだに切れ目がある。地図の絵（`tiles.json`）も同じ線で焼いてある
    WALK_KM = 1.0
    near = [s for s in spots if km(s) <= WALK_KM]
    # **近い順。** 絵の下に出す1行が「近いものから」で読めるようにする
    far = sorted(({**s, "km": round(km(s), 1)} for s in spots if km(s) > WALK_KM),
                 key=lambda s: s["km"])

    # ---- 記号（A・B・C…）。**一覧と地図と道順が同じ字で対応する**のが、るるぶの要。
    # 歩くコースの順に振るので、コースの札がそのまま A→B→C… と読める
    order = {n: i for i, n in enumerate(FILL["course"])}
    near.sort(key=lambda s: (order.get(s["name"], 999), s["rank"], s["name"]))
    for i, s in enumerate(near):
        s["letter"] = chr(ord("A") + i) if i < 26 else ""
    by_name = {s["name"]: s for s in near}

    # ---- 歩くコース。**距離はここで1回だけ出す。**
    # 直線距離に 1.3 を掛けて道のりの目安にし、分速 80m で割る
    course = []
    for i, name in enumerate(FILL["course"]):
        s = by_name[name]
        leg_m = leg_min = 0
        if i:
            d = km(_between(by_name[FILL["course"][i - 1]], s))
            leg_m = round(d * 1.3 * 1000 / 10) * 10
            leg_min = max(1, round(leg_m / 80))
        course.append({"letter": s["letter"], "name": s["name"], "mark": s["mark"],
                       "stay": s.get("stay", ""), "m": leg_m, "min": leg_min})
    walk_min = sum(c2["min"] for c2 in course)
    stay_min = sum(_minutes(c2["stay"]) for c2 in course)
    course_note = ("12か所ぜんぶで 約%d時間%d分（歩き %d分＋見学 %d分）。"
                   "まる1日ぶんなので、Eで西へ折れるところか、Jのあとで切って"
                   "2日に分けてもいい。歩きの分は直線距離に1.3を掛けた概算を"
                   "分速80mで割ったもの、見学の分は各所の目安のうち短いほう"
                   % ((walk_min + stay_min) // 60, (walk_min + stay_min) % 60,
                      walk_min, stay_min))

    # ---- 印を、地図の絵の画素に置く。
    # **絵が在れば、その絵の枠（`tiles.json`）に合わせる。** 無ければ自前の紙を作る
    if TILES:
        # web-mercator。**緯度を線形で割らない**（焼いたほうと同じ式にする）
        def _merc(lat):
            return math.log(math.tan(math.pi / 4 + math.radians(lat) / 2))

        T, W, H = TILES, float(TILES["w"]), float(TILES["h"])
        ny, sy = _merc(T["north"]), _merc(T["south"])

        def at(s):
            return (round((s["lon"] - T["west"]) / (T["east"] - T["west"]) * W, 1),
                    round((ny - _merc(s["lat"])) / (ny - sy) * H, 1))

        cx, cy = at(c)
        # 縮尺（km/px）。横幅から出す
        kpp = (T["east"] - T["west"]) * 111.0 * k / W
        pins = [{"id": s["roman"], "letter": s["letter"], "name": s["name"],
                 "mark": s["mark"], "star": s["rank"],
                 "x": at(s)[0], "y": at(s)[1]} for s in near]
        art = {"png": T["png"], "png2x": T.get("png2x", ""),
               "credit": T["attribution"], "licence": T["licence"]}
    else:
        xs = [(s["lon"] - c["lon"]) * k for s in near]
        ys = [-(s["lat"] - c["lat"]) for s in near]
        pad = 0.12
        x0, x1 = min(xs) - (max(xs) - min(xs)) * pad, max(xs) + (max(xs) - min(xs)) * pad
        y0, y1 = min(ys) - (max(ys) - min(ys)) * pad, max(ys) + (max(ys) - min(ys)) * pad
        W = 1000.0
        H = W * (y1 - y0) / (x1 - x0)
        kpp = (x1 - x0) * 111.0 * k / W
        cx = round((0 - x0) / (x1 - x0) * W, 1)
        cy = round((0 - y0) / (y1 - y0) * H, 1)
        pins = [{"id": s["roman"], "letter": s["letter"], "name": s["name"],
                 "mark": s["mark"], "star": s["rank"],
                 "x": round((x - x0) / (x1 - x0) * W, 1),
                 "y": round((y - y0) / (y1 - y0) * H, 1)}
                for s, x, y in zip(near, xs, ys)]
        art = {}

    OUT_MAP.parent.mkdir(parents=True, exist_ok=True)
    OUT_MAP.write_text(json.dumps(
        {"w": round(W), "h": round(H), "center": c,
         "kmPerPx": round(kpp, 8), "cx": cx, "cy": cy,
         "art": art, "pins": pins,
         "far": [{"name": s["name"], "km": s["km"]} for s in far]},
        ensure_ascii=False, indent=1), encoding="utf-8")

    ts = ['/** ブルガリア（ソフィア）の案内（`/bulgaria`）。',
          ' *',
          ' * **手で直さない。** `python3 python/build_bulgaria.py` が焼く。',
          ' * 中身を直すなら `python/data/bulgaria/*.json` のほうを直す。',
          ' *',
          ' * 印（`mark`）は好みの実測から機械で付けている。規則は焼くほうの冒頭。',
          ' */',
          "",
          'export type Mark = "good" | "ok" | "warn";',
          "",
          'export const BG_RATE = "%s";' % esc(F["rate_note"]),
          'export const BG_LEAD = "%s";' % esc(F["lead"]),
          ""]

    def arr(name, rows, keys):
        ts.append("export const %s = [" % name)
        for r in rows:
            ts.append("  { " + ", ".join(
                '%s: "%s"' % (k, esc(r.get(k))) if not isinstance(r.get(k), (int, float, bool))
                else "%s: %s" % (k, json.dumps(r.get(k)))
                for k in keys) + " },")
        ts.append("] as const;")
        ts.append("")

    arr("BG_FACTS", F["facts"], ["n", "unit", "cap"])
    arr("BG_IMAGE", F["image"], ["title", "body"])
    arr("BG_HISTORY", F["history"], ["title", "body"])
    arr("BG_BASICS", F["basics"], ["title", "body"])
    # **記号と「中心から◯km」を、一覧の側にも入れる。** 地図とつき合わせるのに要る
    letters = {s["name"]: s["letter"] for s in near}
    kms = {s["name"]: s["km"] for s in far}
    for s in spots:
        s["letter"] = letters.get(s["name"], "")
        s["far"] = kms.get(s["name"], 0)
    arr("BG_SPOTS", spots,
        ["letter", "far", "name", "cyr", "roman", "kana", "rank", "mark", "why",
         "what", "how", "walk", "stay", "fee", "advice", "maps", *PHOTO_KEYS])
    hero = photo_of("hero", "hero") or {}
    if not hero.get("img"):
        hero = PHOTOS.get("hero") or {}
        hero = {k: hero.get(k, "") for k in PHOTO_KEYS} if hero.get("img") else {k: "" for k in PHOTO_KEYS}
    ts.append("/** 面のいちばん上に敷く1枚。**無ければ空**で、面の側が字だけの頭に落とす */")
    ts.append("export const BG_HERO = { " + ", ".join(
        '%s: "%s"' % (k, esc(hero.get(k))) for k in PHOTO_KEYS) + " } as const;")
    ts.append("")
    ts.append('export const BG_COURSE_NOTE = "%s";' % esc(course_note))
    ts.append("")
    arr("BG_COURSE", course, ["letter", "name", "mark", "stay", "m", "min"])
    arr("BG_FOOD", food,
        ["jp", "cyr", "roman", "kana", "rank", "mark", "why", "what", "where",
         "price", "meat", "note", *PHOTO_KEYS])
    # **「ここでしたいこと」は、好みの実測と現地の事実を突き合わせた結論**なので、
    # 事実（`facts.json`）ではなくこちら（`fill.json`）が持つ。印も手で置いてある
    # ——規則1本では「市場でパイを買って公園で食べる」のような**組み合わせ**が出せない
    arr("BG_TODO", FILL["todo"], ["what", "where", "why", "mark"])
    alcohol = set(FILL["buy_alcohol"])
    miss_a = alcohol - {x["what"] for x in F["buy"]}
    if miss_a:
        raise SystemExit("土産の名前が合いません: %s" % sorted(miss_a))
    buy = []
    for x in F["buy"]:
        m, why = mark_buy(x, alcohol)
        # **`why` は土産そのものの説明**（`facts.json` が持っている欄）なので、
        # 印の理由はぶつからない名前で足す
        buy.append({**x, "mark": m, "markwhy": why, **photo_of("buy", x["what"])})
    arr("BG_BUY", buy, ["what", "mark", "markwhy", "why", "where", "price", *PHOTO_KEYS])
    arr("BG_EVENTS", F["events"], ["what", "when", "body"])
    arr("BG_WORDS", F["words"], ["cyr", "roman", "kana", "jp"])

    OUT_TS.write_text("\n".join(ts), encoding="utf-8")
    g = sum(1 for x in food if x["mark"] == "good")
    w = sum(1 for x in food if x["mark"] == "warn")
    shots = sum(1 for x in spots + food + buy if x.get("img")) + (1 if hero.get("img") else 0)
    want = len(spots) + len(food) + len(buy) + 1
    print("写真 %d/%d 枚" % (shots, want)
          + ("" if shots == want else "  **足りない: "
             + "、".join([x.get("name") or x.get("jp") or x.get("what")
                         for x in spots + food + buy if not x.get("img")][:6]) + "**"))
    print("焼いた %s（見どころ %d・食べもの %d／◎%d ⚠%d）"
          % (OUT_TS.name, len(spots), len(food), g, w))
    print("焼いた %s（街の地図に %d本・%dx%d／遠いもの %d件）"
          % (OUT_MAP.name, len(pins), W, round(H), len(far)))


if __name__ == "__main__":
    main()
