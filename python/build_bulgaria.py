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


def _minutes(stay: str) -> int:
    """滞在の字から分を拾う。**いちばん短い言い方のほうを採る。**

    「蛇口だけなら10分、博物館を入れて1時間30分」のように、2通り書いてある欄が
    ある。合計に長いほうを足すと「丸2日」になって、コースとして読めなくなるので、
    **先に出てくる数**（＝基本の見学）だけを拾う。読めなければ 0。
    """
    m = re.search(r"([0-9]+)\s*時間(?:\s*([0-9]+)\s*分)?|([0-9]+)\s*分", stay or "")
    if not m:
        return 0
    if m.group(1):
        return int(m.group(1)) * 60 + int(m.group(2) or 0)
    return int(m.group(3))


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
        spots.append({**s, "fee": g.get("fee", ""), "mark": m, "why": why})
    # 距離は下で地図を組むときに出す（同じ計算を2回書かない）
    for d in F["food"]:
        g = fill_food[d["jp"]]
        m, why = mark_food({**d, **g})
        food.append({**d, **{k: g[k] for k in ("pork", "alcohol", "meat", "note")},
                     "mark": m, "why": why})

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

    # **中心から1km の中だけを街の地図に載せる。** 外へ広げるほど、中心の印が
    # 潰れる——リラ修道院（62km）まで入れた最初の版は 1000x10359 の紙になり、
    # 中心部が1本の線になった。3kmでも、絵の半分以上が空いて印が左上に固まった（実測）。
    #
    # **1.0 は恣意的な線ではない。** 中心からの距離を並べると
    # 0.95km（ネフスキー大聖堂）と 1.34km（NDK）のあいだに**切れ目がある**。
    # ここで切ると、徒歩圏の16か所がちょうど絵いっぱいに散る。
    # 入らないものは「中心から◯km」で出す（歩けない距離だとは言わない）
    WALK_KM = 1.0
    near = [s for s in spots if km(s) <= WALK_KM]
    # **近い順。** 絵の下に出す1行が「近いものから」で読めるようにする
    far = sorted(({**s, "km": round(km(s), 1)} for s in spots if km(s) > WALK_KM),
                 key=lambda s: s["km"])

    # ---- 記号（A・B・C…）。**一覧と地図と道順が同じ字で対応する**のが、るるぶの要。
    # 歩くコースの順に振るので、コースの札がそのまま A→B→C… と読める。
    # コースに入らない近場は、そのあとに続けて振る（遠いものには振らない——
    # 地図に載らない印に記号があると、絵の中を探すことになる）
    order = {n: i for i, n in enumerate(FILL["course"])}
    near.sort(key=lambda s: (order.get(s["name"], 999), s["rank"], s["name"]))
    for i, s in enumerate(near):
        s["letter"] = chr(ord("A") + i) if i < 26 else ""
    by_name = {s["name"]: s for s in near}

    # ---- 歩くコース。**距離はここで1回だけ出す。**
    # 直線距離に 1.3 を掛けて道のりの目安にし、分速 80m で割る（不動産の
    # 「徒歩1分＝80m」と同じ）。**概算だと面の側に書く**こと
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
    walk_min = sum(c["min"] for c in course)
    stay_min = sum(_minutes(c["stay"]) for c in course)
    course_note = ("12か所ぜんぶで 約%d時間%d分（歩き %d分＋見学 %d分）。"
                   "まる1日ぶんなので、Eで西へ折れるところか、Jのあとで切って"
                   "2日に分けてもいい。歩きの分は直線距離に1.3を掛けた概算を"
                   "分速80mで割ったもの、見学の分は各所の目安のうち短いほう"
                   % ((walk_min + stay_min) // 60, (walk_min + stay_min) % 60,
                      walk_min, stay_min))
    xs = [(s["lon"] - c["lon"]) * k for s in near]
    ys = [-(s["lat"] - c["lat"]) for s in near]
    pad = 0.12
    x0, x1 = min(xs) - (max(xs) - min(xs)) * pad, max(xs) + (max(xs) - min(xs)) * pad
    y0, y1 = min(ys) - (max(ys) - min(ys)) * pad, max(ys) + (max(ys) - min(ys)) * pad
    W = 1000.0
    H = W * (y1 - y0) / (x1 - x0)
    pins = [{"id": s["roman"], "letter": s["letter"], "name": s["name"],
             "mark": s["mark"], "star": s["rank"],
             "x": round((x - x0) / (x1 - x0) * W, 1),
             "y": round((y - y0) / (y1 - y0) * H, 1)}
            for s, x, y in zip(near, xs, ys)]
    OUT_MAP.parent.mkdir(parents=True, exist_ok=True)
    OUT_MAP.write_text(json.dumps(
        # **縮尺も焼く。** 絵の側で「1kmは何px」を出し直すと、紙の大きさを
        # 変えたときに輪だけ取り残される（`BgMapSvg.tsx`）
        {"w": round(W), "h": round(H), "center": c,
         "kmPerPx": round((x1 - x0) * 111.0 * k / W, 8),
         # 中心（聖ネデリャ教会）が紙のどこに来るか。**紙の真ん中ではない**
         # ——印の散らばりで枠を決めているので、中心は寄る
         "cx": round((0 - x0) / (x1 - x0) * W, 1),
         "cy": round((0 - y0) / (y1 - y0) * H, 1), "pins": pins,
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
         "what", "how", "walk", "stay", "fee", "advice", "maps"])
    ts.append('export const BG_COURSE_NOTE = "%s";' % esc(course_note))
    ts.append("")
    arr("BG_COURSE", course, ["letter", "name", "mark", "stay", "m", "min"])
    arr("BG_FOOD", food,
        ["jp", "cyr", "roman", "kana", "rank", "mark", "why", "what", "where",
         "price", "meat", "note"])
    # **「ここでしたいこと」は、好みの実測と現地の事実を突き合わせた結論**なので、
    # 事実（`facts.json`）ではなくこちら（`fill.json`）が持つ。印も手で置いてある
    # ——規則1本では「市場でパイを買って公園で食べる」のような**組み合わせ**が出せない
    arr("BG_TODO", FILL["todo"], ["what", "where", "why", "mark"])
    arr("BG_BUY", F["buy"], ["what", "why", "where", "price"])
    arr("BG_EVENTS", F["events"], ["what", "when", "body"])
    arr("BG_WORDS", F["words"], ["cyr", "roman", "kana", "jp"])

    OUT_TS.write_text("\n".join(ts), encoding="utf-8")
    g = sum(1 for x in food if x["mark"] == "good")
    w = sum(1 for x in food if x["mark"] == "warn")
    print("焼いた %s（見どころ %d・食べもの %d／◎%d ⚠%d）"
          % (OUT_TS.name, len(spots), len(food), g, w))
    print("焼いた %s（街の地図に %d本・%dx%d／遠いもの %d件）"
          % (OUT_MAP.name, len(pins), W, round(H), len(far)))


if __name__ == "__main__":
    main()
