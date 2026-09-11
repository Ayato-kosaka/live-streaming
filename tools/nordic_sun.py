#!/usr/bin/env python3
"""旅の日ごとに、日の出と日の入りを計算して焼く。**手で直さない。**

  python3 tools/nordic_sun.py --check    … 突き合わせだけ（1行も書かない）
  python3 tools/nordic_sun.py            … site/content/nordicSun.ts を作り直す
  python3 tools/nordic_sun.py --golden   … 突き合わせ相手を取り直す（要ネット）

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
import subprocess
import sys

#: 街の緯度経度と、9月の時差（夏時間。ポーランドとスウェーデンは +2、
#: バルト三国とフィンランドは +3。冬時間に戻るのは10月25日なので旅の外）。
#: タイムゾーン名は `--golden` で open-meteo に渡すためだけに持つ。
CITIES = {
    "カトヴィツェ": (50.2649, 19.0238, 2, "Europe/Warsaw"),
    "ワルシャワ": (52.2297, 21.0122, 2, "Europe/Warsaw"),
    "ビャウィストク": (53.1325, 23.1688, 2, "Europe/Warsaw"),
    "ヴィリニュス": (54.6872, 25.2797, 3, "Europe/Vilnius"),
    "リガ": (56.9496, 24.1052, 3, "Europe/Riga"),
    "タリン": (59.4370, 24.7536, 3, "Europe/Tallinn"),
    "ヘルシンキ": (60.1699, 24.9384, 3, "Europe/Helsinki"),
    "ストックホルム": (59.3293, 18.0686, 2, "Europe/Stockholm"),
}

#: 太陽の上辺が地平線にかかるときの天頂角（90度 + 大気差 34分 + 視半径 16分）
ZENITH = 90.833

#: 旅の初日と最終日（`site/content/nordic.ts` の DAYS の端）
FIRST, LAST = dt.date(2026, 9, 11), dt.date(2026, 9, 27)

HERE = os.path.dirname(os.path.abspath(__file__))
GOLDEN = os.path.join(HERE, "nordic_sun_golden.json")
OUT = os.path.join(HERE, "..", "site", "content", "nordicSun.ts")


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


def check() -> None:
    """外から取った値（`nordic_sun_golden.json`）と突き合わせる。

    **1分は許す**（理由は先頭の説明）。いちばん大きい差も必ず出すので、
    「ぎりぎり通っている」のか「余裕で合っている」のかが見える。
    """
    if not os.path.exists(GOLDEN):
        raise SystemExit(f"{GOLDEN} がありません。--golden で取ってください")
    want = json.load(open(GOLDEN, encoding="utf-8"))
    bad, n, worst = [], 0, 0
    for city, (lat, lon, tz, _z) in CITIES.items():
        for date, (wr, ws) in sorted(want.get(city, {}).items()):
            r, s, _ = _sun(lat, lon, dt.date.fromisoformat(date), tz)
            n += 1
            dr, ds = _mins(r) - _mins(wr), _mins(s) - _mins(ws)
            worst = max(worst, abs(dr), abs(ds))
            if abs(dr) > TOL or abs(ds) > TOL:
                bad.append(f"{city} {date}: 計算 {r} {s} / open-meteo {wr} {ws}")
    for b in bad:
        print(b)
    print(f"{n}件中 {len(bad)}件ちがいます" if bad
          else f"{n}件すべて合いました（いちばん大きい差 {worst}分 / {TOL}分まで）")
    raise SystemExit(1 if bad else 0)


#: 突き合わせに許す差（分）
TOL = 1


def _mins(t: str) -> int:
    """「06:16」「6:16」→ 376。"""
    h, m = t.split(":")
    return int(h) * 60 + int(m)


def golden() -> None:
    """open-meteo から突き合わせ相手を取り直す。**ネットが要る。**"""
    out = {}
    for city, (lat, lon, _tz, zone) in CITIES.items():
        url = (
            f"https://api.open-meteo.com/v1/forecast?latitude={lat}&longitude={lon}"
            f"&daily=sunrise,sunset&timezone={zone}"
            f"&start_date={FIRST}&end_date={LAST}"
        )
        # 先の日付は16日ぶんしか返らないので、断られたら末尾を切って取り直す
        for end in (LAST, LAST - dt.timedelta(days=1)):
            u = url.replace(f"end_date={LAST}", f"end_date={end}")
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
 * 出どころと確かめかたは `tools/nordic_sun.py` の先頭に書いてある。
 * open-meteo の値と8街16日ぶん、1分以内で合わせてある。
 */

export type Sun = { rise: string; set: string };

"""


def bake() -> None:
    """`site/content/nordicSun.ts` を書き出す。"""
    days = [FIRST + dt.timedelta(days=i) for i in range((LAST - FIRST).days + 1)]
    w = [HEAD]
    w.append("/** 日の出を持っている街。**その日いる街を引く鍵。** */\n")
    w.append("export const SUN_CITIES: string[] = [\n")
    w += [f'  "{c}",\n' for c in CITIES]
    w.append("];\n\n")
    w.append("/** 日付 → 街 → その日の明けと暮れ。 */\n")
    w.append("export const SUN_BY_DAY: Record<string, Record<string, Sun>> = {\n")
    for d in days:
        w.append(f'  "{d}": {{\n')
        for city, (lat, lon, tz, _z) in CITIES.items():
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
    with open(OUT, "w", encoding="utf-8") as f:
        f.write("".join(w))
    print(f"{len(days)}日 x {len(CITIES)}街 を書きました → site/content/nordicSun.ts")


def main() -> None:
    """エントリポイント。"""
    if "--golden" in sys.argv:
        golden()
        return
    if "--check" in sys.argv:
        check()
        return
    bake()


main()
