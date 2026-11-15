"""**座標の道の見張り（`python/maps_coord_watch.py`）が、座標の道をその形ごとに落とすか。**

    python3 python/maps_coord_watch_selftest.py
    BREAK=num python3 python/maps_coord_watch_selftest.py   # 足を1本抜く（下の表）

終了コード 0=通った / 1=落ちた / **2=数えるものが無い**（`docs/island-standards.md` §15）。

ネットワークも書き出しも要らない。座標の道を形ごとにこしらえて食わせ、最後に本物の置き場を読む
（本物に座標の道が戻っていれば、ここが赤くなる——これが見張りの本体）。

## 足を1本ずつ抜く（§15「対照は、足の数だけ用意する」）

| `BREAK=` | 抜く守り | 赤くなる所 |
| --- | --- | --- |
| `num` | 欄の字が数どうしの座標 | `query=42.68,23.31` |
| `encoded` | 欄の字の %xx を戻してから読む | `query=42.68%2C23.31` |
| `tpl` | 面を組む字の座標（`${…},${…}`） | `query=${s.lat},${s.lon}` |
| `at` | `/maps/@緯度,経度` の形 | `maps/@42.68,23.31,15z` |
| `escape` | HTML の `&amp;` と埋め込み JSON の `\\u0026` を戻す | 書き出した面の中の座標の道 |

それぞれ**その足の確かめだけ**が落ちることまで見る（`num` だけは `encoded` `escape` も一緒に落ちる。
どちらも戻したあとの字を「数どうしの座標か」で判じるので、土台を抜けば上も立たない）。
"""

from __future__ import annotations

import contextlib
import io
import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import maps_coord_watch as mw  # noqa: E402
import maps_link as ml  # noqa: E402

CHECKED = 0
FAILED: list[tuple[str, str]] = []


def check(leg: str, name: str, ok: bool) -> None:
    global CHECKED
    CHECKED += 1
    print(f"  {'○' if ok else '✕'} {name}")
    if not ok:
        FAILED.append((leg, name))


# 座標はこしらえたもの（ソフィアの真ん中あたり）
BAD = {
    "num": "https://www.google.com/maps/search/?api=1&query=42.689948,23.327621&hl=ja",
    "encoded": "https://www.google.com/maps/search/?api=1&query=42.689948%2C23.327621&hl=ja",
    "tpl": "export const mapHref = (s: Shop) =>\n  `https://www.google.com/maps/search/?api=1&query=${s.lat},${s.lon}`;",
    "at": "https://www.google.com/maps/@42.69,23.32,15z",
    "escape": '<a href="https://www.google.com/maps/search/?api=1&amp;query=42.69,23.32&amp;hl=ja">',
    "escape2": '"href":"https://www.google.com/maps/search/?api=1\\u0026query=42.69,23.32\\u0026hl=ja"',
}

print("[1] 座標の道を、形ごとに落とすか")
for key, text in BAD.items():
    leg = key.rstrip("2")
    coords, _ = mw.scan_text(text)
    check(leg, f"{key}: 座標の道を1本と数える", len(coords) == 1)

print("[2] 落としすぎないか（名前の道・埋め込み・ふつうの検索）")
good = ml.search("Ротонда „Свети Георги“", "София")
coords, names = mw.scan_text(f'<a href="{good.replace("&", "&amp;")}">')
check("", "名前で探す道は通して、名前の道として1本数える", coords == [] and names == 1)
coords, names = mw.scan_text(ml.search("Q-Ftetaria ул. Ангел Кънчев 1", "София"))
check("", "番地の数が入った名前を座標と読まない", coords == [] and names == 1)
coords, _ = mw.scan_text("https://www.google.com/maps/d/embed?mid=abc&hl=ja&ll=42.69,23.32&z=15")
check("", "埋め込みの開いたときの中心（ll）は押して飛ぶ先ではない", coords == [])
coords, names = mw.scan_text("https://www.google.com/search?q=42.69,23.32")
check("", "ふつうの Google 検索は Google マップの道として数えない", coords == [] and names == 0)

print("[3] 組む道具が座標を受け取らない")
try:
    ml.search("42.689948,23.327621")
    check("", "maps_link.search が座標を断る", False)
except ValueError:
    check("", "maps_link.search が座標を断る", True)
try:
    ml.search("", None)
    check("", "maps_link.search が空の字を断る", False)
except ValueError:
    check("", "maps_link.search が空の字を断る", True)



def run(*argv: str) -> int:
    """見張りの main を回して終了コードだけ受け取る。**中の ✕ の行は飲む**
    （こしらえた置き場の ✕ が、このログでは落ちたように読める）"""
    with contextlib.redirect_stdout(io.StringIO()):
        return mw.main(list(argv))


print("[4] 置き場ごと回す（終了コード）")
with tempfile.TemporaryDirectory() as td:
    t = Path(td)
    (t / "root/site/content").mkdir(parents=True)
    (t / "dist").mkdir()
    (t / "empty/site/content").mkdir(parents=True)
    (t / "root/site/content/a.json").write_text(json.dumps({"maps": good}), encoding="utf-8")
    rc = run(*["--root", str(t / "root")])
    check("", "名前の道だけの置き場は 0", rc == 0)
    rc = run(*["--root", str(t / "empty")])
    check("", "道が1本も無い置き場は 2（「0本でした」と言わない）", rc == 2)
    (t / "dist/bulgaria.html").write_text(f'<a href="{good}">x</a>', encoding="utf-8")
    rc = run(*["--root", str(t / "root"), "--dist", str(t / "dist"), "--pages", "bulgaria.html"])
    check("", "名前の道だけの書き出しは 0", rc == 0)
    (t / "dist/skopje.html").write_text(BAD["escape"], encoding="utf-8")
    rc = run(*["--root", str(t / "root"), "--dist", str(t / "dist")])
    check("escape", "書き出しに座標の道が1本在れば 1", rc == 1)
    (t / "root/site/content/b.ts").write_text(BAD["num"], encoding="utf-8")
    rc = run(*["--root", str(t / "root")])
    check("num", "焼いたものに座標の道が1本在れば 1", rc == 1)
    rc = run(*["--root", str(t / "empty"), "--dist", str(t / "empty")])
    check("", "書き出しに道が1本も無ければ 2", rc == 2)

print("[5] 本物の置き場を読む（座標の道が戻っていれば、ここが赤くなる）")
real = mw.files_of(mw.ROOT)
bad = sum(len(mw.scan_text(p.read_text(encoding="utf-8"))[0]) for p in real)
names = sum(mw.scan_text(p.read_text(encoding="utf-8"))[1] for p in real)
print(f"  （{len(real)}ファイル・名前で探す道 {names}本・座標で開く道 {bad}本）")
check("", "本物に座標で開く道が0本", bad == 0)
check("", "本物に名前で探す道が在る（置き場を見失って0本、を通さない）", names > 0)

if not os.environ.get("BREAK") and not os.environ.get("MAPS_SELFTEST_INNER"):
    print("[6] 対照（足を1本ずつ抜くと、その足の確かめだけが赤くなるか）")
    # `num` だけは3つ一緒に赤くなるのが正しい。%xx を戻した字も、HTML から戻した字も、
    # 最後は「数どうしの座標か」で判じる——土台の足を抜けば、上に乗った足も立たない
    EXPECT = {"num": {"num", "encoded", "escape"}, "encoded": {"encoded"}, "tpl": {"tpl"},
              "at": {"at"}, "escape": {"escape"}}
    for leg, want in EXPECT.items():
        r = subprocess.run([sys.executable, __file__], capture_output=True, text=True,
                           env={**os.environ, "BREAK": leg, "MAPS_SELFTEST_INNER": "1"}, timeout=120)
        line = [x for x in r.stdout.splitlines() if x.startswith("FAILED_LEGS=")]
        got = set(json.loads(line[-1].split("=", 1)[1])) if line else set()
        good_leg = r.returncode == 1 and got == want
        check(leg if not good_leg else "", f"BREAK={leg} → 終了コード {r.returncode}・赤くなった足 {sorted(got)}",
              good_leg)

print()
print("FAILED_LEGS=" + json.dumps(sorted({leg for leg, _ in FAILED})))
if CHECKED == 0:
    print("✕ 1つも数えなかった。**「通りました」とは言わない**")
    sys.exit(2)
if FAILED:
    print(f"✕ {CHECKED}件みて、{len(FAILED)}件 落ちた")
    for leg, n in FAILED:
        print(f"   - [{leg}] {n}")
    sys.exit(1)
print(f"○ {CHECKED}件ぜんぶ通った")
sys.exit(0)
