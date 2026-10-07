#!/usr/bin/env python3
"""旅の日ごとに、日の出と日の入りを計算して焼く。**手で直さない。**

  python3 tools/nordic_sun.py            … site/content/nordicSun.ts を作り直す
  python3 tools/nordic_sun.py --check    … 突き合わせだけ（1バイトも書かない）
  python3 tools/nordic_sun.py --golden   … 突き合わせ相手を取り直す（要ネット）
  python3 tools/nordic_sun.py --content /tmp/写し   … 置き場を差し替える（対照用）

終了コード **0=通った / 1=合わないものが在った（`--check`）/
2=数えられなかった**（`docs/island-standards.md` §15）。

## 焼くのは機械の仕事。**人が決めるのは旅程だけ**

この表の中身は、**緯度経度と日付から計算で出る。** 外の口にも BigQuery にも
繋がない。人の頭の中にしか無いのは「**どの街に、いつからいつまでいるか**」で、
それは旅程（`site/content/nordic.ts`）に書いてある。

だから**焼く日と焼く街を、ここに書かない。**

| 何 | どこから |
| --- | --- |
| 焼く日（初日〜最終日） | 旅程の `DAYS` の日付の端（`plan()`） |
| 焼く街 | 旅程の `ROUTE` と `DAYS` に出てくる街（`plan()`） |
| 街の緯度経度と時差 | `CITY_GEO`（**街の事実**。旅が変わっても変わらない） |
| 焼かない名前 | `NO_SUN`（**理由を書かないと足せない**） |

2026-10-07 まで、初日・最終日・街の並びが**このファイルに手で書いてあった**。
計算で出るものを焼いているのに、**旅程がのびたら人が来て書き換えるまで
表が止まる**作りだった。毎晩の焼き直し（`.github/workflows/rebake.yml`）に
乗せられなかったのも、乗せたところで同じ17日を焼き直すだけだったから。

いまは旅程から引くので、**旅程が1日のびた晩に、ひとりでに1日のびる。**

## 知らない名前は、黙って飛ばさない

旅程に出てくる名前のうち、`CITY_GEO` にも `NO_SUN` にも無いものが1つでも
あったら、**1バイトも書かずに 2 で引き下がる。** 黙って飛ばすと、
新しい街の日の面から明るさの欄が**静かに消えるだけ**で、誰も赤くならない。
（`docs/island-standards.md` §15「いつでも通る見張り」の、焼く側の形）

## なぜ日ごとに要るか

`site/content/nordic.ts` の `SUN` は **2026年9月15日の値ひとつ**を街ごとに
持っていた。「9月中旬なら1週間で15分ほどしか動かないので、月の半ばの1つで
足りる」と書いてあり、**旅が9日で終わる前提なら、それで合っていた。**

2026-09-11 に、ストックホルムの7泊を7日ぶんの面に割った（day-10 … day-16）。
**旅の最後は9月27日で、9月15日から12日ある。** ストックホルムでは

    9/15  6:16 明け / 19:09 暮れ  … 12時間53分
    9/27  6:43 明け / 18:33 暮れ  … 11時間50分

**1時間ちがう。** 「12時間53分」と分まで出しておいて1時間ずれるのは、
概算ですと断っていても通らない。日ごとに出す。

## 計算

NOAA の式（Julian day → 均時差と太陽赤緯 → 時角）。太陽の上辺が地平線に
かかる瞬間なので、高度は **-0.833度**（大気差 34分 + 視半径 16分）。

**南中の赤緯で左右対称に置かない。** 9月の赤緯は1日に 0.4度ちかく動くので、
明けと暮れ（13時間ちがう）では赤緯がちがう。南中の値で両側を出すと、
ストックホルムで暮れが3分おそく出た。**明けと暮れ、それぞれの時刻で
赤緯と均時差を出し直して収束させる**（`_event`）。

## 合っているかの確かめかた（`--check`）

**`--check` は2つ見る。** 式が外の値と合っているかと、**焼いてある表が
いまの旅程を覆っているか**（日と街）。前者だけだと、式は正しいまま
旅程に3日足りない表が「合いました」で通る。

はじめは `nordic.ts` に焼いてある9月15日の値と突き合わせていた。**あれは
確かめ相手にならない。** 同じ式で計算した値なので、式が同じ間違いを
持っていれば仲良く通る（`docs/island-misses.md` #63 と同じ形）。

外から取る。`tools/nordic_sun_golden.json` は **open-meteo** から取った
8街 x 16日 = 128件で、こちらの計算と **128件すべて1分以内**で合う。

**1分は許す。** あちらは秒を切り捨てているらしく（切り捨てで比べると
128件中112件が同じ値になる）、こちらは四捨五入なので、境目で1分ずれる。
**2分ちがったら式がちがう。** 式を壊したときは分ではなく十分の単位でずれる
（南中で左右対称に置いていたときは3分、`+0.5` を足していたときは12時間）。

open-meteo は先の日付を16日までしか返さないので、旅の最終日（9月27日）は
入っていない。**式が128件で合っているので、その先も同じ式で出す。**
（`api.sunrise-sunset.org` とは暮れが2〜3分ちがう。あちらは Almanac for
Computers の粗い式で、太陽の位置そのものが数分ずれる。open-meteo に合わせた）
"""
import datetime as dt
import json
import math
import os
import re
import subprocess
import sys

#: 街の緯度経度と、9月の時差（夏時間。ポーランドとスウェーデンは +2、
#: バルト三国とフィンランドは +3。冬時間に戻るのは10月25日なので旅の外）。
#: タイムゾーン名は `--golden` で open-meteo に渡すためだけに持つ。
#:
#: **ここは「街の事実」だけ。どの街を焼くかはここで決めない。**
#: 焼く街は旅程（`site/content/nordic.ts`）から引く。手で並べた街の表を
#: もう1つ作ると、旅程が変わったときに片方だけ古くなる
#: （`docs/island-misses.md` の決めごと3。シャウレイの地図で一度やった #4）。
CITY_GEO = {
    "カトヴィツェ": (50.2649, 19.0238, 2, "Europe/Warsaw"),
    "ワルシャワ": (52.2297, 21.0122, 2, "Europe/Warsaw"),
    "ビャウィストク": (53.1325, 23.1688, 2, "Europe/Warsaw"),
    "ヴィリニュス": (54.6872, 25.2797, 3, "Europe/Vilnius"),
    "リガ": (56.9496, 24.1052, 3, "Europe/Riga"),
    "タリン": (59.4370, 24.7536, 3, "Europe/Tallinn"),
    "ヘルシンキ": (60.1699, 24.9384, 3, "Europe/Helsinki"),
    "ストックホルム": (59.3293, 18.0686, 2, "Europe/Stockholm"),
}

#: 旅程に出てくるが、**わざと日の出を焼かない名前**と、その理由。
#:
#: 知らない名前をただ黙って飛ばすと、新しい街が旅程に入った晩に
#: **その街の日の面から明るさの欄が消えるだけ**で、誰も赤くならない。
#: だから「知らない名前が1つでもあったら焼かずに落ちる」にしてある。
#: ここはその例外で、**理由を書かないと足せない**
#: （`python/watch_excuses.py` と同じ形。`docs/island-standards.md` §8）。
NO_SUN = {
    "トビリシ": "旅の出発地。北欧の外で、この表は旅先の明るさを出すためのもの（2026-10-07）",
    "クタイシ": "出発の日に空港まで出るだけ。北欧の外（2026-10-07）",
    "船の中": "街ではない。泊まるところが船そのものの晩（2026-10-07）",
    "飛行機の中": "街ではない。泊まるところが機内の晩（2026-10-07）",
}

#: 太陽の上辺が地平線にかかるときの天頂角（90度 + 大気差 34分 + 視半径 16分）
ZENITH = 90.833

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(HERE)
GOLDEN = os.path.join(HERE, "nordic_sun_golden.json")
CONTENT = os.path.join(REPO, "site", "content")

#: 旅程の在りか。**この1本が、焼く日と焼く街の唯一の出どころ。**
TRIP_TS = "nordic.ts"
OUT_TS = "nordicSun.ts"

sys.path.insert(0, os.path.join(REPO, "python"))

# **`site/content/*.ts` を字で読むのは、このリポジトリで1本だけ**（`python/ts_read.py`）。
# 旅程を自分で正規表現で読むと、見張り（`python/stale_content_watch.py`）と
# 別の読み方になって、片方からだけ日が落ちる
from ts_read import read_trip  # noqa: E402


class Unreadable(Exception):
    """旅程から焼く中身を決められなかった。**1バイトも書かずに引き下がる。**"""


def plan(content: str = CONTENT):
    """旅程から「どの日の、どの街を焼くか」を決める。**ファイルは書かない。**

    Args:
        content: `site/content`（仕込みの写しを渡してもよい）

    Returns:
        (日の並び, 街の並び, 見送った名前と理由)

    Raises:
        Unreadable: 旅程が読めない・日が0件・座標も断りも無い名前が在る
    """
    path = os.path.join(content, TRIP_TS)
    if not os.path.isfile(path):
        raise Unreadable(f"{path} がありません")
    got = read_trip(open(path, encoding="utf-8").read())
    if got.missed:
        raise Unreadable(
            f"{TRIP_TS} の DAYS が名乗っている {got.declared}日のうち "
            f"{got.missed}日を読めていません（読めたのは {len(got.days)}日）。"
            f"`python/ts_read.py` の読み方か、{TRIP_TS} の書き方が合っていません"
        )
    if not got.days:
        raise Unreadable(f"{TRIP_TS} の DAYS に日が1つもありません")

    try:
        dates = sorted(dt.date.fromisoformat(d.date) for d in got.days)
    except ValueError as e:
        raise Unreadable(f"{TRIP_TS} の日付が読めません: {e}") from e

    # **知らない名前が1つでもあれば、焼かずに落ちる。** 黙って飛ばすと、
    # 新しい街の日の面から明るさの欄が静かに消える
    unknown = [c for c in got.cities if c not in CITY_GEO and c not in NO_SUN]
    if unknown:
        raise Unreadable(
            "旅程に、座標も断りも無い名前があります: " + "、".join(unknown)
            + f"。{os.path.relpath(__file__, REPO)} の `CITY_GEO` に緯度経度と"
            "9月の時差を足すか、焼かない名前なら `NO_SUN` に理由を添えて足してください"
        )

    cities = [c for c in got.cities if c in CITY_GEO]
    if not cities:
        raise Unreadable(f"{TRIP_TS} の街が、1つも `CITY_GEO` に載っていません")

    skipped = [(c, NO_SUN[c]) for c in got.cities if c in NO_SUN]
    first, last = dates[0], dates[-1]
    days = [first + dt.timedelta(days=i) for i in range((last - first).days + 1)]
    return days, cities, skipped


def _solar(jd: float) -> tuple[float, float]:
    """その瞬間の (太陽赤緯[度], 均時差[分])。"""
    t = (jd - 2451545.0) / 36525.0
    l0 = (280.46646 + t * (36000.76983 + t * 0.0003032)) % 360
    m = 357.52911 + t * (35999.05029 - 0.0001537 * t)
    e = 0.016708634 - t * (0.000042037 + 0.0000001267 * t)
    c = (
        math.sin(math.radians(m)) * (1.914602 - t * (0.004817 + 0.000014 * t))
        + math.sin(math.radians(2 * m)) * (0.019993 - 0.000101 * t)
        + math.sin(math.radians(3 * m)) * 0.000289
    )
    omega = 125.04 - 1934.136 * t
    # 見かけの黄経（章動と光行差を入れる）
    app = l0 + c - 0.00569 - 0.00478 * math.sin(math.radians(omega))
    eps0 = 23 + (26 + (21.448 - t * (46.815 + t * (0.00059 - t * 0.001813))) / 60) / 60
    eps = eps0 + 0.00256 * math.cos(math.radians(omega))
    dec = math.degrees(
        math.asin(math.sin(math.radians(eps)) * math.sin(math.radians(app)))
    )
    y = math.tan(math.radians(eps / 2)) ** 2
    eq = 4 * math.degrees(
        y * math.sin(2 * math.radians(l0))
        - 2 * e * math.sin(math.radians(m))
        + 4 * e * y * math.sin(math.radians(m)) * math.cos(2 * math.radians(l0))
        - 0.5 * y * y * math.sin(4 * math.radians(l0))
        - 1.25 * e * e * math.sin(2 * math.radians(m))
    )
    return dec, eq


def _event(lat: float, lon: float, day: dt.date, tz: int, rising: bool) -> float:
    """明け（`rising`）か暮れの、その日の現地時刻[分]。

    **求める時刻で赤緯を出す**ので、答えを初期値に戻して数回まわす。
    6時／18時から始めて3回で 0.01分まで動かなくなる（5回まわしている）。
    """
    jd0 = day.toordinal() + 1721424.5  # その日の 00:00 UT の Julian day
    minute = (6 if rising else 18) * 60
    for _ in range(5):
        dec, eq = _solar(jd0 + minute / 1440 - tz / 24)
        cos_ha = math.cos(math.radians(ZENITH)) / (
            math.cos(math.radians(lat)) * math.cos(math.radians(dec))
        ) - math.tan(math.radians(lat)) * math.tan(math.radians(dec))
        # **極夜・白夜では解が無い**（北欧の9月では起きないが、断っておく）
        if abs(cos_ha) > 1:
            raise SystemExit(f"{day} の {lat},{lon} は日が出ないか沈みません")
        ha = math.degrees(math.acos(cos_ha))
        noon = 720 - 4 * lon - eq + tz * 60
        minute = noon - ha * 4 if rising else noon + ha * 4
    return minute


def _sun(lat: float, lon: float, day: dt.date, tz: int) -> tuple[str, str, int]:
    """その日の (明ける, 暮れる, 明るい分数)。"""
    rm = round(_event(lat, lon, day, tz, True))
    sm = round(_event(lat, lon, day, tz, False))
    hhmm = lambda m: f"{m // 60}:{m % 60:02d}"  # noqa: E731
    return hhmm(rm), hhmm(sm), sm - rm


def golden_gaps() -> tuple[list[str], int, int]:
    """外から取った値（`nordic_sun_golden.json`）と突き合わせる。

    **1分は許す**（理由は先頭の説明）。

    Returns:
        （合わなかった行, 見た件数, いちばん大きい差[分]）
    """
    want = json.load(open(GOLDEN, encoding="utf-8"))
    bad, n, worst = [], 0, 0
    for city, (lat, lon, tz, _z) in CITY_GEO.items():
        for date, (wr, ws) in sorted(want.get(city, {}).items()):
            r, s, _ = _sun(lat, lon, dt.date.fromisoformat(date), tz)
            n += 1
            dr, ds = _mins(r) - _mins(wr), _mins(s) - _mins(ws)
            worst = max(worst, abs(dr), abs(ds))
            if abs(dr) > TOL or abs(ds) > TOL:
                bad.append(f"{city} {date}: 計算 {r} {s} / open-meteo {wr} {ws}")
    return bad, n, worst


#: 焼いた表の日の鍵（`  "2026-09-11": {`）。**見張りと同じ形で読む**
#: （`python/stale_content_watch.py` の `KEY_RE`）
DAY_KEY_RE = re.compile(r'^\s+"(\d{4}-\d\d-\d\d)": \{', re.M)

#: 焼いた表の街の鍵（`    ストックホルム: { rise: …`）
CITY_KEY_RE = re.compile(r'^\s+([^\s:"]+): \{ rise: "', re.M)


def cover_gaps(content: str = CONTENT) -> tuple[list[str], int, int]:
    """焼いてある表が、**いまの旅程を覆っているか**。

    **外の口も git も引かない。** 旅程と焼き込みの2枚を読むだけ。

    Returns:
        （足りない行, 旅程が要る日数, 旅程が要る街の数）

    Raises:
        Unreadable: 旅程から要るものが決まらない（`plan()` と同じ）
    """
    days, cities, _skipped = plan(content)
    out = os.path.join(content, OUT_TS)
    if not os.path.isfile(out):
        return [f"{OUT_TS} がありません"], len(days), len(cities)
    src = open(out, encoding="utf-8").read()
    have_days = set(DAY_KEY_RE.findall(src))
    have_cities = set(CITY_KEY_RE.findall(src))
    gaps = []
    miss_d = [d.isoformat() for d in days if d.isoformat() not in have_days]
    miss_c = [c for c in cities if c not in have_cities]
    if miss_d:
        gaps.append(f"焼かれていない日が {len(miss_d)}日: " + "、".join(miss_d[:10]))
    if miss_c:
        gaps.append(f"焼かれていない街が {len(miss_c)}件: " + "、".join(miss_c))
    return gaps, len(days), len(cities)


def check(content: str = CONTENT) -> int:
    """突き合わせだけ。**1バイトも書かない。**

    見るのは2つ。**どちらも分母を出す**（`docs/island-standards.md` §15）。

    1. 式が外の値と合っているか（`nordic_sun_golden.json` の128件）
    2. 焼いてある表が、いまの旅程を覆っているか（日と街）

    Returns:
        0=合っていた / 1=合わないものが在った / 2=数えられなかった
    """
    if not os.path.exists(GOLDEN):
        print(f"::error::{GOLDEN} がありません。--golden で取ってください")
        return 2
    bad, n, worst = golden_gaps()
    if n == 0:
        print("::error::突き合わせ相手が0件です。式が合っているとは言いません")
        return 2
    for b in bad:
        print(b)
    print(f"式と外の値: {n}件中 {len(bad)}件ちがいます" if bad
          else f"式と外の値: {n}件すべて合いました"
               f"（いちばん大きい差 {worst}分 / {TOL}分まで）")

    try:
        gaps, nd, nc = cover_gaps(content)
    except Unreadable as e:
        print(f"::error::旅程から要るものが決まりません: {e}")
        return 2
    for g in gaps:
        print(f"::error::{g}")
    print(f"旅程との突き合わせ: {nd}日 x {nc}街 を見て、"
          f"{'足りないものはありません' if not gaps else f'足りないもの {len(gaps)}件'}")
    return 1 if (bad or gaps) else 0


#: 突き合わせに許す差（分）
TOL = 1


def _mins(t: str) -> int:
    """「06:16」「6:16」→ 376。"""
    h, m = t.split(":")
    return int(h) * 60 + int(m)


def golden(content: str = CONTENT) -> None:
    """open-meteo から突き合わせ相手を取り直す。**ネットが要る。**

    取る期間も街も、焼くのと同じ旅程から引く（`plan()`）。
    """
    days, cities, _skipped = plan(content)
    first, last = days[0], days[-1]
    out = {}
    for city in cities:
        lat, lon, _tz, zone = CITY_GEO[city]
        url = (
            f"https://api.open-meteo.com/v1/forecast?latitude={lat}&longitude={lon}"
            f"&daily=sunrise,sunset&timezone={zone}"
            f"&start_date={first}&end_date={last}"
        )
        # 先の日付は16日ぶんしか返らないので、断られたら末尾を切って取り直す
        for end in (last, last - dt.timedelta(days=1)):
            u = url.replace(f"end_date={last}", f"end_date={end}")
            r = subprocess.run(["curl", "-sS", "--max-time", "40", u],
                               capture_output=True, text=True)
            if r.stdout.startswith("{") and '"daily"' in r.stdout:
                break
        d = json.loads(r.stdout)["daily"]
        out[city] = {
            t: [a[11:], b[11:]]
            for t, a, b in zip(d["time"], d["sunrise"], d["sunset"])
        }
        print(f"{city:8} {len(out[city])}日")
    json.dump(out, open(GOLDEN, "w", encoding="utf-8"),
              ensure_ascii=False, indent=1, sort_keys=True)


HEAD = """/* 自動生成。**手で直さない。** `python3 tools/nordic_sun.py` で作り直す。
 *
 * 旅の日ごとの、日の出と日の入り。**ヒッチハイクは明るいうちしかできない。**
 * その日がどんなふうになるのかを決めているのは、距離より先にこれ。
 *
 * 前は9月15日の値ひとつを街ごとに持っていた。旅が9日で終わる前提なら
 * それで足りたが、ストックホルムの7泊を日ごとの面に割って、最終日が
 * 9月27日になった。ストックホルムの明るさは9月15日の12時間53分から
 * 9月27日の11時間50分まで **1時間ちぢむ。** 分まで出しておいて1時間
 * ずれるのは、概算ですと断っても通らない。
 *
 * **どの日の、どの街を焼くかは旅程（`content/nordic.ts`）から引いている。**
 * 旅程が1日のびたら、次の焼き直しでこの表も1日のびる。
 *
 * 出どころと確かめかたは `tools/nordic_sun.py` の先頭に書いてある。
 * open-meteo の値と8街16日ぶん、1分以内で合わせてある。
 */

export type Sun = { rise: string; set: string };

"""


def bake(content: str = CONTENT) -> int:
    """`site/content/nordicSun.ts` を書き出す。

    Returns:
        0=書いた / 2=旅程から決まらないので1バイトも書かなかった
    """
    try:
        days, cities, skipped = plan(content)
    except Unreadable as e:
        # **書かずに引き下がる。** 中途半端に焼いた表を配ると、旅の面から
        # 明るさの欄が静かに消える（赤くならない。消えるだけ）
        print(f"::error::{e}")
        print("1バイトも書いていません。前の表のままです")
        return 2
    for city, why in skipped:
        print(f"焼かない名前: {city} …… {why}")
    w = [HEAD]
    w.append("/** 日の出を持っている街。**その日いる街を引く鍵。** */\n")
    w.append("export const SUN_CITIES: string[] = [\n")
    w += [f'  "{c}",\n' for c in cities]
    w.append("];\n\n")
    w.append("/** 日付 → 街 → その日の明けと暮れ。 */\n")
    w.append("export const SUN_BY_DAY: Record<string, Record<string, Sun>> = {\n")
    for d in days:
        w.append(f'  "{d}": {{\n')
        for city in cities:
            lat, lon, tz, _z = CITY_GEO[city]
            r, s, _ = _sun(lat, lon, d, tz)
            w.append(f'    {city}: {{ rise: "{r}", set: "{s}" }},\n')
        w.append("  },\n")
    w.append("};\n\n")
    w.append(
        "/**\n"
        " * その街の、その日の明けと暮れ。\n"
        " *\n"
        " * 旅の外の日や、持っていない街なら `undefined`。**呼ぶ側で出し分ける。**\n"
        " * 近い日の値で代わりを出さない。それをやると「1時間ちがう値を分まで\n"
        " * 出す」に戻る。\n"
        " */\n"
        "export const sunOn = (city?: string, date?: string): Sun | undefined =>\n"
        "  city && date ? SUN_BY_DAY[date]?.[city] : undefined;\n"
    )
    with open(os.path.join(content, OUT_TS), "w", encoding="utf-8") as f:
        f.write("".join(w))
    print(f"{len(days)}日（{days[0]}〜{days[-1]}）x {len(cities)}街 を書きました "
          f"→ {os.path.join(os.path.basename(content), OUT_TS)}")
    return 0


def main(argv: list[str] | None = None) -> int:
    """エントリポイント。"""
    argv = sys.argv[1:] if argv is None else argv
    content = CONTENT
    if "--content" in argv:
        content = argv[argv.index("--content") + 1]
    if "--golden" in argv:
        golden(content)
        return 0
    if "--check" in argv:
        return check(content)
    return bake(content)


if __name__ == "__main__":
    raise SystemExit(main())
