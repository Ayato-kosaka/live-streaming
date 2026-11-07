"""`commons_photos.py` の**選り分けと形**を当てる。口は叩かない。

    python3 python/commons_photos_selftest.py

終了コード **0=全部合っている / 1=合っていないものが在った /
2=当てられなかった**（道具が読めない、など）。

## 何を守っているか

道具の仕事は2つで、どちらも**間違えても赤くならない**種類の間違いをする。

1. **許諾の選り分け。** `CC BY-NC` を通すと、島に貼れない絵が面に出る。
   見た目では気づけない——絵は出るので。
2. **URL の縮尺。** 原寸（5MB の JPEG）を貼ると面の転送量が跳ねるが、
   これも絵は出るので気づけない。1枚目のブルガリアの面で12本やった。

だから**字で当てる。** Commons に繋がなくていい（繋ぐと、この箱では 429 で
落ちるだけになり、見張りが「口の調子」を見る道具に化ける）。
"""

import sys
import os

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))


def main() -> int:
    try:
        import commons_photos as c
    except Exception as e:                          # noqa: BLE001
        print(f"道具が読めません: {e}")
        return 2

    ng = []

    # 許諾。**NC と ND と fair use は落ちる**
    for s, want in [
        ("Public domain", True), ("CC0", True), ("CC BY 4.0", True),
        ("CC BY-SA 3.0", True), ("cc by-sa 4.0", True),
        ("CC BY-NC 2.0", False), ("CC BY-NC-SA 4.0", False),
        ("CC BY-ND 4.0", False), ("Fair use", False), ("", False),
    ]:
        if c.lic_ok(s) is not want:
            ng.append(f"許諾 {s!r} を {'通せ' if want else '落とせ'}なかった")

    # 形。縮尺つきの3本と、出どころの字から札を外すところ
    ii = {
        "url": "https://upload.wikimedia.org/wikipedia/commons/a/ab/C.jpg",
        "thumburl": "https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/C.jpg/500px-C.jpg",
        "descriptionurl": "https://commons.wikimedia.org/wiki/File:C.jpg",
        "extmetadata": {
            "Artist": {"value": '<a href="/wiki/User:X">Petar Mi</a>'},
            "LicenseShortName": {"value": "CC BY-SA 3.0"},
            "ImageDescription": {"value": "Boiled <b>corn</b> in a cup"},
        },
    }
    s = c.shot(ii, "File:C.jpg")
    for key, want in (("thumb", "/500px-"), ("img", "/960px-"), ("big", "/1920px-")):
        if want not in s[key]:
            ng.append(f"{key} が {want} になっていない: {s[key]}")
    if "/wikipedia/commons/a/ab/C.jpg" == s["img"]:
        ng.append("原寸をそのまま出している")
    if s["by"] != "Petar Mi":
        ng.append(f"撮った人の字に札が残っている: {s['by']!r}")
    if "<" in s["note"]:
        ng.append(f"説明に札が残っている: {s['note']!r}")

    # 欠けているものは出さない（出どころの無い絵は貼れない）
    bare = c.shot({"url": "", "thumburl": "", "descriptionurl": "", "extmetadata": {}}, "File:X")
    if bare["cm"] or bare["lic"]:
        ng.append("空の中身から、出どころや許諾を作っている")

    for line in ng:
        print(f"NG {line}")
    print(f"{'NG' if ng else 'OK'} commons_photos: 合わないもの {len(ng)}件")
    return 1 if ng else 0


if __name__ == "__main__":
    sys.exit(main())
