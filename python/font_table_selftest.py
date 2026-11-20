"""`python/font_table.py` の見張り（ブラウザも書き出しも要らない）。

    python3 python/font_table_selftest.py

終了コード 0=通った / 1=差し込みかたがずれた / 2=本物の表が読めない。

当てる場面:

1. 字が増えた面・新しい面だけ差し込む。字が減っただけの面・同じ面は触らない（並行する PR をぶつけない）
2. 名指しの面（`--only`）は、増えていなくても差し替える
3. 表の並びを保つ（足した面は後ろ）
4. 鍵の作りかた（`/index.html` → `index`、`/travel/a/b.html` → `travel/a/b`）
5. 本物の `tools/fonts/weights.json` が読めて、面が100枚以上ある（置き場が動いたら 2）
"""

from __future__ import annotations

import json
import sys
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

import font_table as ft  # noqa: E402


def main() -> int:
    ng = 0
    table = {"index": {"400": "あい", "700": "", "900": ""},
             "travel/x": {"400": "街", "700": "旅", "900": ""},
             "now": {"400": "月火", "700": "", "900": ""}}
    got = {"index": {"400": "あい", "700": "", "900": ""},            # 同じ
           "travel/x": {"400": "街", "700": "旅", "900": "記"},       # 900 に1字増えた
           "now": {"400": "月", "700": "", "900": ""},                # 減っただけ
           "travel/y": {"400": "新", "700": "", "900": ""}}           # 新しい面
    new, hit = ft.merge(table, got, [])
    got["travel/x"] = {"400": "", "700": "旅", "900": "記"}               # 400 の「街」は測り落とした
    new, hit = ft.merge(table, got, [])
    if (hit == ["travel/x", "travel/y"] and new["now"] == table["now"] and new["travel/x"]["900"] == "記"
            and new["travel/x"]["400"] == "街"):
        print("[1] ○ 字が増えた面と新しい面だけ、字を足す（和。測り落とした字を表から消さない）。減っただけ・同じ面は触らない")
    else:
        print(f"[1] ✕ 差し込んだ面 {hit} / now {new['now']}")
        ng += 1

    new2, hit2 = ft.merge(table, got, ["now"])
    if "now" in hit2 and new2["now"] == got["now"]:
        print("[2] ○ 名指しの面は、減っただけでも差し替える")
    else:
        print(f"[2] ✕ 名指しの now が {new2['now']}")
        ng += 1

    if list(new) == ["index", "travel/x", "now", "travel/y"]:
        print("[3] ○ 表の並びを保ち、新しい面は後ろに足す")
    else:
        print(f"[3] ✕ 並び {list(new)}")
        ng += 1

    keys = [ft.page_key(x) for x in ("/index.html", "/travel/a/b.html", "/next.html")]
    if keys == ["index", "travel/a/b", "next"]:
        print("[4] ○ 面の鍵は fontweigh.mjs と同じ形")
    else:
        print(f"[4] ✕ 鍵 {keys}")
        ng += 1

    # 道具として回す（書く・書かない・名指しが答えに無ければ 2）
    # 下敷きの字（かな）が増えただけの面は差し込まない。1字も描いていなかった太さに出たら差し込む
    base = ft.core()
    kana_only = ft.gained({"400": "街", "700": "旅", "900": ""}, {"400": "街", "700": "旅ブカレスト", "900": ""})
    new_weight = ft.gained({"400": "街", "700": "", "900": ""}, {"400": "街", "700": "ブ", "900": ""})
    kanji = ft.gained({"400": "街", "700": "旅", "900": ""}, {"400": "街", "700": "旅首", "900": ""})
    if "ブ" in base and "首" not in base and not kana_only and new_weight and kanji:
        print("[4b] ○ かなが増えただけの面は差し込まない。漢字が増えた面・描く太さが増えた面は差し込む")
    else:
        print(f"[4b] ✕ かなだけ {kana_only} / 太さが増えた {new_weight} / 漢字 {kanji}")
        ng += 1

    with tempfile.TemporaryDirectory() as d:
        t, g = Path(d) / "w.json", Path(d) / "got.json"
        t.write_text(json.dumps(table, ensure_ascii=False), encoding="utf-8")
        g.write_text(json.dumps(got, ensure_ascii=False), encoding="utf-8")
        rc = ft.main(["--got", str(g), "--table", str(t)])
        wrote = json.loads(t.read_text(encoding="utf-8"))
        rc2 = ft.main(["--got", str(g), "--table", str(t), "--only", "/nothere.html"])
        if rc == 0 and wrote["travel/y"]["400"] == "新" and rc2 == 2:
            print("[5] ○ 回すと表に書く。名指しの面が答えに無ければ 2")
        else:
            print(f"[5] ✕ rc {rc} / rc2 {rc2} / 書いた面 {sorted(wrote)}")
            ng += 1

    try:
        real = json.loads(ft.TABLE.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as e:
        print(f"!! 本物の表が読めない: {e}")
        return 2
    if len(real) < 100:
        print(f"!! 本物の表の面が {len(real)} 枚しかない")
        return 2
    print(f"[6] ○ 本物の表 {len(real)} 面")
    return 1 if ng else 0


if __name__ == "__main__":
    sys.exit(main())
