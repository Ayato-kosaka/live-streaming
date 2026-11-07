"""Wikimedia Commons から、面に貼れる写真の候補を集める。

    python3 python/commons_photos.py 'varena tsarevitsa' 'boiled corn bulgaria'
    QUERIES='{"焼きとうもろこし":"varena tsarevitsa|boiled corn street"}' \
        OUT=/tmp/out.json python3 python/commons_photos.py

**なぜ Actions から回すのか。** 作業箱から `upload.wikimedia.org`（絵そのもの）は
curl で取れるのに、**検索の口（`commons.wikimedia.org/w/api.php` と
`api.wikimedia.org`）は 429 で断られる。** 断っているのは Wikimedia 側の
枚数制限で、見えている出口の住所が他の作業と共用だからこちらでは減らせない。
Actions のランナーは住所が別なので通る（`stickies_pull.yml` と同じ理由で、
**届かない先は Actions に回す**）。

国の案内ページを1枚増やすたびに写真を50枚ほど集める（`docs/country-guide.md`）。
次の国でも同じ壁に当たるので、その場しのぎの curl ではなく道具にした。

## 出すもの

問いごとに、候補を上から順に。**面に貼れる形のまま**出す——
`python/data/<国>/photos.json` の欄（`img` `thumb` `big` `cm` `by` `lic` `alt`）に
そのまま移せる。

**載せてよい許諾だけを通す。** public domain / CC0 / CC BY / CC BY-SA。
NC（非営利のみ）と fair use は**出さない**。島は投げ銭で回っているので、
非営利とは言い切れない。

**原寸の URL を出さない。** 5MB の JPEG をそのまま貼ると、面の転送量が
一気に増える（1枚目のブルガリアの面で12本やって直した）。縮尺つきの
`.../thumb/.../500px-<名前>` を出す。
"""

import json
import os
import sys
import time
import urllib.parse
import urllib.request

API = "https://commons.wikimedia.org/w/api.php"

# Wikimedia が求める名乗り。**付けないと弾かれる**
UA = "ayato-island-guide/1.0 (https://github.com/Ayato-kosaka/live-streaming)"

# 載せてよい許諾。**ここに無いものは落とす。** `extmetadata.LicenseShortName` の字で見る
OK_LIC = ("public domain", "cc0", "cc by", "cc-by", "cc by-sa", "cc-by-sa")

# 出さない許諾の印。先に弾く（"CC BY-NC" は "cc by" を含むので、順番ではなくこちらで見る）
NG_LIC = ("nc", "nd", "fair use", "non-commercial")

PACE = float(os.getenv("PACE", "1.2"))


def get(params: dict) -> dict:
    """API を1回叩く。**間をあける**——続けて投げると断られる。"""
    url = API + "?" + urllib.parse.urlencode({**params, "format": "json"})
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=30) as r:
        body = r.read()
    time.sleep(PACE)
    return json.loads(body)


def lic_ok(short: str) -> bool:
    s = (short or "").lower()
    if not s:
        return False
    if any(x in s.split() or x in s for x in NG_LIC):
        return False
    return any(s.startswith(x) or x in s for x in OK_LIC)


def shot(info: dict, title: str) -> dict:
    """1枚ぶんを、`photos.json` の欄の形で返す。"""
    meta = info.get("extmetadata") or {}

    def m(k):
        v = (meta.get(k) or {}).get("value") or ""
        # 出どころの欄には <a> が入っていることがある。字だけにする
        out, keep = [], True
        for ch in v:
            if ch == "<":
                keep = False
            elif ch == ">":
                keep = True
            elif keep:
                out.append(ch)
        return " ".join("".join(out).split())

    full = info.get("url") or ""
    # 縮尺つきの道は `thumburl` が持っている。幅だけ差し替えて3つ作る
    th = info.get("thumburl") or ""
    def at(px):
        return th.replace("/500px-", f"/{px}px-") if "/500px-" in th else ""

    return {
        "file": title,
        "img": at(960) or th,
        "thumb": at(500) or th,
        "big": at(1920) or full,
        "cm": info.get("descriptionurl") or "",
        "by": m("Artist"),
        "lic": m("LicenseShortName"),
        "alt": "",
        "note": m("ImageDescription")[:160],
    }


def search(q: str, limit: int) -> list:
    """問い1つ。**検索と中身の取得を1回にまとめる**（generator）。"""
    d = get({
        "action": "query",
        "generator": "search",
        "gsrnamespace": 6,          # ファイルだけ
        "gsrsearch": q,
        "gsrlimit": limit,
        "prop": "imageinfo",
        "iiprop": "url|extmetadata",
        "iiurlwidth": 500,
    })
    out = []
    for page in (d.get("query") or {}).get("pages", {}).values():
        ii = (page.get("imageinfo") or [{}])[0]
        s = shot(ii, page.get("title", ""))
        if not lic_ok(s["lic"]):
            continue
        if not (s["img"] and s["cm"]):
            continue
        out.append(s)
    return out


def main() -> int:
    raw = (os.getenv("QUERIES") or "").strip()
    if raw:
        qs = json.loads(raw)
        if not isinstance(qs, dict):
            print("QUERIES は {\"名前\": \"探す言葉\"} の形で渡してください", file=sys.stderr)
            return 2
    else:
        qs = {q: q for q in sys.argv[1:]}
    if not qs:
        print("探す言葉がありません", file=sys.stderr)
        return 2

    limit = int(os.getenv("LIMIT", "8"))
    res = {}
    bad = 0
    for name, q in qs.items():
        try:
            res[name] = search(q, limit)
        except Exception as e:                      # noqa: BLE001
            # **「探せなかった」を「見つからなかった」にしない。**
            # 空の JSON を緑で返すと、読む人には 0枚 が「無い」のか
            # 「見に行けていない」のか見分けがつかない（CLAUDE.md）
            res[name] = []
            bad += 1
            print(f"× {name}: {e}", file=sys.stderr)
        print(f"{name}: {len(res[name])}枚")

    out = os.getenv("OUT") or "/tmp/commons_photos.json"
    with open(out, "w", encoding="utf-8") as f:
        json.dump(res, f, ensure_ascii=False, indent=1)
    print(f"→ {out}")
    if bad:
        print(f"{bad}件の問いが、口に届きませんでした", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
