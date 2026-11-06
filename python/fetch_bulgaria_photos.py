#!/usr/bin/env python3
"""ブルガリア案内ページ（/bulgaria）の写真を Wikimedia Commons から集める。

写真は「探す」と「選ぶ」で性質がまるで違う。探すのは機械でできるが、
「баница の欄に別のパイが入っていないか」は人が絵と説明文を見るしかない。
なので2段に分けてある。

  --candidates  … facts.json の各項目を Commons で検索して、候補を一覧で出す（人が読む用）
  （既定）      … 下の CHOICES に書いた「選んだファイル」の URL を取り直して photos.json を書く
  --check       … 書いたものが本当に使えるか（200 で返るか・鍵が facts.json と合うか・
                  ライセンスが出してよいものか）を確かめる

CHOICES を人が手で持っているのは、選び直しの履歴が残るから。
検索の当たり順は Commons 側の都合で日々変わるので、「検索1位を使う」にすると
作り直すたびに写真が入れ替わって、確かめた意味がなくなる。
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent
FACTS = ROOT / "data" / "bulgaria" / "facts.json"
OUT = ROOT / "data" / "bulgaria" / "photos.json"

API = "https://commons.wikimedia.org/w/api.php"
UA = "ayato-island-guide/1.0 (https://github.com/Ayato-kosaka/live-streaming)"

# 出してよいライセンス。CC BY-NC / Fair use は入れない（島は誰でも見られる面なので）
OK_LIC = re.compile(
    r"^(public domain|cc0|cc by(-sa)? ?[1-4]\.[05]?|cc by(-sa)? ?[1-4]\.0 ?[a-z]{0,2}|"
    r"cc by(-sa)? ?[0-9.]+( [a-z]{2})?|pd[- ].*|copyrighted free use|attribution)$",
    re.I,
)
NG_LIC = re.compile(r"(nc|non-?commercial|nd|no ?deriv|fair use|unknown|all rights)", re.I)

SLEEP = 1.2  # 1秒以上あける（急ぐと 429）


# ---------------------------------------------------------------- API


def call(params: dict, tries: int = 6) -> dict | None:
    """Commons の API を叩く。429 が返るのは常態なので、待って何度か試す。"""
    params = dict(params)
    params.setdefault("format", "json")
    params.setdefault("formatversion", "2")
    # maxlag を付けないと、この箱からは素の api.php がほぼ 429 で返る
    params.setdefault("maxlag", "5")
    url = API + "?" + urllib.parse.urlencode(params)
    for t in range(tries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "application/json"})
            with urllib.request.urlopen(req, timeout=90) as r:
                return json.loads(r.read())
        except urllib.error.HTTPError as e:
            if e.code in (429, 503):
                time.sleep(4 * (t + 1))
                continue
            print(f"  ! HTTP {e.code} {url[:90]}", file=sys.stderr)
            return None
        except Exception as e:  # noqa: BLE001
            print(f"  ! {e}", file=sys.stderr)
            time.sleep(3 * (t + 1))
    return None


def strip_html(s: str | None) -> str:
    if not s:
        return ""
    s = re.sub(r"<[^>]+>", " ", s)
    s = (
        s.replace("&nbsp;", " ")
        .replace("&amp;", "&")
        .replace("&quot;", '"')
        .replace("&#039;", "'")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
    )
    return re.sub(r"\s+", " ", s).strip()


def upload_url(u: str | None) -> str:
    """API は thumb.wikimedia.org や ?utm_source= 付きを返すことがある。
    配る先は upload.wikimedia.org に揃えて、クエリは落とす。"""
    if not u:
        return ""
    p = urllib.parse.urlsplit(u)
    host = "upload.wikimedia.org"
    return urllib.parse.urlunsplit(("https", host, p.path, "", ""))


def thumb_at(full_url: str, thumb_url: str, width: int, name: str) -> str:
    """幅ちがいのサムネ URL を組む。
    Commons のサムネは .../thumb/<a>/<ab>/<name>/<W>px-<name> という形で決まっている。"""
    if thumb_url:
        m = re.match(r"^(.*/)(\d+)px-(.+)$", urllib.parse.urlsplit(thumb_url).path)
        if m:
            return upload_url("https://upload.wikimedia.org" + f"{m.group(1)}{width}px-{m.group(3)}")
    p = urllib.parse.urlsplit(full_url).path  # /wikipedia/commons/a/ab/Name.jpg
    m = re.match(r"^(/wikipedia/commons)/([0-9a-f])/([0-9a-f]{2})/(.+)$", p)
    if not m:
        return ""
    fn = m.group(4)
    return upload_url(
        f"https://upload.wikimedia.org{m.group(1)}/thumb/{m.group(2)}/{m.group(3)}/{fn}/{width}px-{fn}"
    )


def info(title: str) -> dict | None:
    """ファイル1枚ぶんの情報（URL3種・出どころ・ライセンス）を取る。"""
    d = call(
        {
            "action": "query",
            "titles": title,
            "prop": "imageinfo",
            "iiprop": "url|extmetadata|size|mime",
            "iiurlwidth": "960",
        }
    )
    if not d:
        return None
    pages = d.get("query", {}).get("pages") or []
    if not pages or pages[0].get("missing"):
        return None
    p = pages[0]
    ii = (p.get("imageinfo") or [None])[0]
    if not ii:
        return None
    em = ii.get("extmetadata", {})
    full = upload_url(ii.get("url"))
    th = ii.get("thumburl") or ""
    name = p["title"].split(":", 1)[-1].replace(" ", "_")
    return {
        "title": p["title"],
        "mime": ii.get("mime", ""),
        "w": ii.get("width"),
        "h": ii.get("height"),
        "thumb": thumb_at(full, th, 400, name),
        "img": thumb_at(full, th, 960, name),
        "big": thumb_at(full, th, 1600, name),
        "cm": ii.get("descriptionurl") or "https://commons.wikimedia.org/wiki/" + p["title"].replace(" ", "_"),
        "by": strip_html(em.get("Artist", {}).get("value")),
        "lic": strip_html(em.get("LicenseShortName", {}).get("value")),
        "desc": strip_html(em.get("ImageDescription", {}).get("value"))[:400],
        "obj": strip_html(em.get("ObjectName", {}).get("value"))[:120],
    }


def search(q: str, limit: int = 8) -> list[dict]:
    d = call(
        {
            "action": "query",
            "generator": "search",
            "gsrsearch": q,
            "gsrnamespace": "6",
            "gsrlimit": str(limit),
            "prop": "imageinfo",
            "iiprop": "url|extmetadata|size|mime",
            "iiurlwidth": "960",
        }
    )
    out = []
    if not d:
        return out
    for p in d.get("query", {}).get("pages") or []:
        ii = (p.get("imageinfo") or [None])[0]
        if not ii:
            continue
        em = ii.get("extmetadata", {})
        out.append(
            {
                "title": p["title"],
                "mime": ii.get("mime", ""),
                "w": ii.get("width"),
                "h": ii.get("height"),
                "lic": strip_html(em.get("LicenseShortName", {}).get("value")),
                "by": strip_html(em.get("Artist", {}).get("value"))[:60],
                "desc": strip_html(em.get("ImageDescription", {}).get("value"))[:200],
                "obj": strip_html(em.get("ObjectName", {}).get("value"))[:100],
            }
        )
    return out


# ---------------------------------------------------------------- 検索語

QUERIES: dict[str, list[str]] = {
    "hero::": ["Sofia Bulgaria panorama Vitosha", "Alexander Nevsky Cathedral Sofia aerial"],
    # spots（facts.json の name をそのまま鍵にする）
    "spots::聖ゲオルギ教会（円堂）": ["Rotunda Saint George Sofia", "Ротонда Свети Георги София"],
    "spots::古代セルディカ遺跡（ラルゴの地下）": ["Ancient Serdica Sofia archaeological complex", "Антична Сердика София"],
    "spots::アレクサンドル・ネフスキー大聖堂": ["Alexander Nevsky Cathedral Sofia", "Храм Свети Александър Невски"],
    "spots::中央鉱泉浴場（ソフィア歴史博物館）と無料の温泉の蛇口": ["Central Mineral Baths Sofia", "Централна минерална баня София"],
    "spots::ボヤナ教会（世界遺産）": ["Boyana Church exterior", "Боянска църква"],
    "spots::聖ネデリャ教会": ["Sveta Nedelya Church Sofia", "Света Неделя София храм"],
    "spots::聖ソフィア教会": ["Saint Sofia Church Sofia Bulgaria", "Църква Света София"],
    "spots::バーニャ・バシ・モスク": ["Banya Bashi Mosque Sofia", "Баня баши джамия"],
    "spots::ソフィア・シナゴーグ": ["Sofia Synagogue", "Софийска синагога"],
    "spots::聖ヨシフ大聖堂": ["St Joseph Cathedral Sofia", "Катедрала Свети Йосиф София"],
    "spots::中央市場ホール（ハリ）": ["Central Sofia Market Hall", "Централни софийски хали"],
    "spots::ヴィトシャ大通り（歩行者区間）": ["Vitosha Boulevard Sofia", "булевард Витоша София"],
    "spots::聖ペトカ地下教会": ["Church St Petka of the Saddlers Sofia", "Света Петка Самарджийска"],
    "spots::国立考古学博物館": ["National Archaeological Museum Sofia", "Национален археологически музей София"],
    "spots::女性市場（ジェンスキ・パザール）": ["Zhenski Pazar Sofia market", "Женски пазар София"],
    "spots::ロシア教会（奇蹟者聖ニコライ聖堂）": ["Russian Church Sofia Saint Nicholas", "Руска църква София"],
    "spots::イヴァン・ヴァゾフ国立劇場と市庭園": ["Ivan Vazov National Theatre Sofia", "Народен театър Иван Вазов"],
    "spots::国立文化宮殿（NDK）": ["National Palace of Culture Sofia", "Национален дворец на културата"],
    "spots::国立歴史博物館（ボヤナ）": ["National Museum of History Bulgaria building", "Национален исторически музей София"],
    "spots::ヴィトシャ山（チェルニ・ヴラフ）": ["Cherni Vrah Vitosha", "Витоша Черни връх"],
    "spots::ボリス公園": ["Borisova gradina Sofia park", "Борисова градина"],
    "spots::リラ修道院（日帰り）": ["Rila Monastery courtyard", "Рилски манастир"],
    # food（facts.json の jp をそのまま鍵にする）
    "food::ショプスカ・サラダ": ["Shopska salad", "шопска салата"],
    "food::バニツァ": ["Banitsa", "баница"],
    "food::ケバプチェ": ["Kebapche Bulgarian", "кебапче"],
    "food::キュフテ": ["Kyufte Bulgarian meatball", "кюфте"],
    "food::タラトル（冷製ヨーグルトスープ）": ["Tarator soup", "таратор"],
    "food::キセロ・ムリャコ（ブルガリアのヨーグルト）": ["Bulgarian yogurt kiselo mlyako", "кисело мляко"],
    "food::ギュヴェチ（土鍋焼き）": ["Gyuvech Bulgarian dish", "гювеч ястие"],
    "food::カヴァルマ": ["Kavarma Bulgarian", "кавърма"],
    "food::ムサカ": ["Moussaka Bulgarian", "мусака"],
    "food::シュケンベ・チョルバ（モツスープ）": ["Shkembe chorba", "шкембе чорба"],
    "food::サルマ（ぶどうの葉の肉巻き）": ["Sarma vine leaves Bulgarian", "сарма лозови листа"],
    "food::リュテニツァ": ["Lyutenitsa", "лютеница"],
    "food::シレネとカシュカヴァル（チーズ2種）": ["Sirene Bulgarian white cheese", "кашкавал сирене"],
    "food::パタトニク（じゃがいものガレット）": ["Patatnik Rhodope potato", "пататник"],
    "food::ミシュ・マシュ": ["Mish-mash Bulgarian dish", "миш-маш ястие"],
    "food::ボブ・チョルバ（白いんげん豆のスープ）": ["Bob chorba bean soup Bulgarian", "боб чорба"],
    "food::メキツァ（揚げパン）": ["Mekitsa", "мекици"],
    "food::ボザ（穀物の発酵飲料）": ["Boza drink", "боза напитка"],
    "food::ラキヤ（果実の蒸留酒）": ["Rakia Bulgarian brandy", "ракия"],
    "food::アイリャン": ["Ayran drink", "айрян"],
    "food::メハナ（大衆食堂・居酒屋）という場所そのもの": ["Mehana Bulgarian tavern interior", "механа ресторант"],
    "food::焼きとうもろこし（街角の屋台）": ["boiled corn street stall Bulgaria", "варена царевица"],
    # buy（facts.json の what をそのまま鍵にする）
    "buy::バラのオイル／ローズウォーター": ["Bulgarian rose oil vial", "розово масло"],
    "buy::リュテニツァ（赤いペースト）": ["Lyutenitsa jar", "лютеница буркан"],
    "buy::トロヤン焼きの陶器": ["Troyan pottery Bulgaria", "троянска керамика"],
    "buy::ラキヤ（果実の蒸留酒）": ["Rakia bottle Bulgaria", "ракия бутилка"],
    "buy::ブルガリアワイン（マヴルッド、メルニク）": ["Bulgarian wine Mavrud bottle", "Мавруд вино"],
    "buy::マルテニツァ（赤と白の紐飾り）": ["Martenitsa", "мартеници"],
    "buy::白チーズとカシュカヴァル（量り売り）": ["Bulgarian cheese market sirene", "кашкавал пазар"],
    "buy::ローズジャムとローズのロクム": ["rose jam Bulgaria lokum", "сладко от рози"],
    "buy::刺繍（シェヴィツァ）の小物": ["Bulgarian embroidery shevitsa", "шевица бродерия"],
}

# ---------------------------------------------------------------- 選んだもの
# 鍵 -> (Commons のファイル名, 日本語の alt)
# alt は「写真に何が写っているか」。ファイル名の直訳にしない（読み上げで意味が通るように）
CHOICES: dict[str, tuple[str, str]] = {
}


# ---------------------------------------------------------------- 口

def load_keys() -> dict[str, list[str]]:
    f = json.loads(FACTS.read_text(encoding="utf-8"))
    return {
        "hero": [""],
        "spots": [s["name"] for s in f["spots"]],
        "food": [s["jp"] for s in f["food"]],
        "buy": [s["what"] for s in f["buy"]],
    }


def cmd_candidates(only: str | None) -> int:
    out = {}
    for key, qs in QUERIES.items():
        if only and only not in key:
            continue
        seen, rows = set(), []
        for q in qs:
            for c in search(q):
                if c["title"] in seen:
                    continue
                seen.add(c["title"])
                c["q"] = q
                rows.append(c)
            time.sleep(SLEEP)
        out[key] = rows
        print(f"{key}  ({len(rows)})", file=sys.stderr)
    print(json.dumps(out, ensure_ascii=False, indent=1))
    return 0


def cmd_build() -> int:
    keys = load_keys()
    data: dict = {}
    missing = []
    for sec in ("hero", "spots", "food", "buy"):
        if sec != "hero":
            data[sec] = {}
        for name in keys[sec]:
            k = f"{sec}::{name}"
            if k not in CHOICES:
                missing.append(k)
                continue
            title, alt = CHOICES[k]
            i = info(title)
            time.sleep(SLEEP)
            if not i or not i["img"]:
                missing.append(k + " (取れず)")
                continue
            rec = {
                "q": QUERIES.get(k, [""])[0],
                "thumb": i["thumb"],
                "img": i["img"],
                "big": i["big"],
                "cm": i["cm"],
                "by": i["by"],
                "lic": i["lic"],
                "alt": alt,
            }
            if sec == "hero":
                data["hero"] = rec
            else:
                data[sec][name] = rec
            print(f"  {k} <- {title}", file=sys.stderr)
    OUT.write_text(json.dumps(data, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    n = (1 if data.get("hero") else 0) + sum(len(data.get(s, {})) for s in ("spots", "food", "buy"))
    print(f"書いた: {OUT} / {n}件", file=sys.stderr)
    if missing:
        print("入らなかったもの:", file=sys.stderr)
        for m in missing:
            print("  -", m, file=sys.stderr)
    return 0


def cmd_check() -> int:
    """出す前の確かめ。鍵・出どころ・ライセンス・URL の4つを見る。"""
    if not OUT.exists():
        print("photos.json が無い")
        return 1
    d = json.loads(OUT.read_text(encoding="utf-8"))
    keys = load_keys()
    bad = []
    recs: list[tuple[str, dict]] = []
    if d.get("hero"):
        recs.append(("hero", d["hero"]))
    else:
        bad.append("hero が無い")
    # 鍵が facts.json と1字違わず同じか
    for sec in ("spots", "food", "buy"):
        want = set(keys[sec])
        got = set(d.get(sec, {}))
        for k in got - want:
            bad.append(f"{sec}: facts.json に無い鍵 {k!r}")
        for k in sorted(got & want):
            recs.append((f"{sec}/{k}", d[sec][k]))
        miss = want - got
        if miss:
            print(f"（{sec}: 入っていない {len(miss)}件）")
            for k in sorted(miss):
                print("   -", k)
    # 出どころ・ライセンス
    lic_count: dict[str, int] = {}
    for label, r in recs:
        for f in ("thumb", "img", "big", "cm", "by", "lic", "alt"):
            if not r.get(f):
                bad.append(f"{label}: {f} が空")
        lic = r.get("lic", "")
        lic_count[lic] = lic_count.get(lic, 0) + 1
        if NG_LIC.search(lic) or not OK_LIC.match(lic):
            bad.append(f"{label}: 出せないライセンス {lic!r}")
        for f in ("thumb", "img", "big"):
            u = r.get(f, "")
            if u and not u.startswith("https://upload.wikimedia.org/"):
                bad.append(f"{label}: {f} が upload.wikimedia.org でない -> {u[:60]}")
            if "?" in u:
                bad.append(f"{label}: {f} にクエリが付いている")
        if r.get("cm") and not r["cm"].startswith("https://commons.wikimedia.org/wiki/File:"):
            bad.append(f"{label}: cm が Commons のファイルページでない")
    # URL が 200 で返るか
    ok = ng = 0
    for label, r in recs:
        for f in ("thumb", "img", "big"):
            u = r.get(f)
            if not u:
                continue
            code = head(u)
            if code == 200:
                ok += 1
            else:
                ng += 1
                bad.append(f"{label}: {f} が {code} -> {u[:80]}")
    print(f"件数: {len(recs)}  / URL: 200 が {ok}件、それ以外 {ng}件")
    print("ライセンスの内訳: " + ", ".join(f"{k} {v}件" for k, v in sorted(lic_count.items())))
    if bad:
        print(f"だめなもの {len(bad)}件:")
        for b in bad:
            print("  -", b)
        return 1
    print("全部とおった")
    return 0


def head(url: str) -> int:
    for t in range(3):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            req.get_method = lambda: "HEAD"  # type: ignore[method-assign]
            with urllib.request.urlopen(req, timeout=60) as r:
                return r.status
        except urllib.error.HTTPError as e:
            if e.code in (429, 503):
                time.sleep(3 * (t + 1))
                continue
            return e.code
        except Exception:  # noqa: BLE001
            time.sleep(2 * (t + 1))
    return 0


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--candidates", action="store_true", help="候補を検索して一覧で出す（人が読む用）")
    ap.add_argument("--only", help="--candidates を一部の鍵だけに絞る")
    ap.add_argument("--check", action="store_true", help="書いたものを確かめる")
    a = ap.parse_args()
    if a.candidates:
        return cmd_candidates(a.only)
    if a.check:
        return cmd_check()
    return cmd_build()


if __name__ == "__main__":
    sys.exit(main())
