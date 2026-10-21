"""**原稿の機械の検査（`lint.py`）の見張り。** 要るのは Python だけ。

    python3 tools/shorts/script/lint_selftest.py
    BREAK=miete python3 tools/shorts/script/lint_selftest.py   # 守りを1つ外した版で回す（対照の子）

終了コード 0=通った / 1=落ちた / 2=数えるものが無い・外す字が見つからない（`docs/island-standards.md` §15）。
回し役（`python/selftest_runner.py`）が `tools/shorts/` を降りて拾い、`shorts_selftest.yml` が名指しでも回す。

## 控え（`fixtures/`）

あやとに出してよいと言われた原稿と、直された原稿を、**言われた時点の字のまま**写してある（spec は題の札と
【足】の印だけに削った）。`shorts/videos/` の原稿は、あとで直されることがある。そちらを読むと、
誰かが原稿を直しただけでこの見張りが赤くなる。

| 控え | あやとの返事 | 当てる日 |
| --- | --- | --- |
| `approved/zjHZucyfrq8_p2` | 2026-10-19「それ以外OKなので、動画制作に入ってください」（#959。p1 から2行消した形） | 2026-10-19 |
| `approved/TDArug_te90_p1` | 2026-10-21「これで、進めて」（#977。題と終わりはあやとの字） | 2026-10-21 と今日 |
| `approved/yk-by7R7iPA_p3` | 2026-10-17「A」「B」「C」（#926。3本とも出した） | 2026-10-17 |
| `rejected/nGgoJ753rBw_p1` | 2026-10-21「この原稿めちゃくちゃAI臭い」（#975。「地下鉄1回に見えてきた」） | 今日 |
| `rejected/CKJvprUMOgA_p2` | 2026-10-21「全然現実的じゃなくてつまらん」（#976。題） | 今日 |
| `rejected/CKJvprUMOgA_p2_17` | 2026-10-21「配信になぞりすぎてて、行間が空きすぎてる」「話が二転三転するくらいならない方が良い」（#976。題を直して2行消した17行の版） | 今日 |
| `rejected/yk-by7R7iPA_p1` | 2026-10-16「原稿とか全然ダメですね」（チャット。#275 #276 #277） | 2026-10-16 |

## 足

| 足 | 確かめること |
| --- | --- |
| `approved` | 出してよいと言われた5本が、言われた日の決まりで ✕ 0（TDArug は今日の決まりでも） |
| `later_rule_live` | ホステル p2 を今日の決まりで当てると、T-FLAG だけが落ちる（承認のあとにできた決まりが効いている） |
| `miete` | 「地下鉄1回に見えてきた」を 15行目で拾う。「海が見えてきた！」は拾わない |
| `title_real` | 「銅像だらけの国で、僕まで銅像にされた」を拾う。あやとが書いた題3本と、アプリの回の題は通す |
| `title_metaphor` | 「〜みたいだった」の題を拾う。あやとの題は通す |
| `flag` | 国旗が無い・違う国・国の名前の後ろ、を拾う。正しい旗と、国の名前が無い題は通す |
| `narrator` `phrase` `yen` | 10-16 に直された p1 の行（あやとは・本人いわく・だそうです／国を出る／280レク。約550円）を拾い、言い換えた行は通す |
| `length` | 351字で落ち、350字で通る |
| `end` | 最後の行が問い・問い → アーカイブ・アーカイブだけ（#975）は通す。問いのあとの別の行・どちらも無い終わりを拾う |
| `ashi` | 【足】の行を全部 △ で出す（数では落とさない）。原稿の字の印も拾う。spec も印も無ければ「見ていない」 |
| `sorry` | 銅像 p2（17行）の12行目「すいません」を △ で出す（落とさない）。城塞 p1 には出さない。「ごめん」も拾う |
| `as_of` | 決まりの日より前の日を渡すと、その規則を当てない |
| `cli` | 終了コード: 当たる 1・通る 0・空 2 |
"""
from __future__ import annotations

import subprocess
import sys
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
FIX = HERE / "fixtures"
sys.path.insert(0, str(HERE.parent / "feedback"))
import legs  # noqa: E402

TODAY = "2099-12-31"   # 「いまある決まり全部」の代わり（日付で切らない）

# 外す守り: 名前 → (ファイル, 本物の字, 書き換えた字, 落ちるはずの足, 何を外すか)
CUTS = {
    # `cli` の足は本物の lint.py を別に起こすので、ここで外した字の影響を受けない（mutation_drill の側で当たる）
    "miete": ("lint.py", "        m = MIETE.search(ln)\n", "        m = None\n",
              {"miete"}, "見立てを拾わない"),
    "real": ("lint.py", "    if places_in(t) or REAL_NUM.search(t):\n", "    if True:\n",
             {"title_real"}, "題の現実の手がかりを見ない"),
    "metaphor": ("lint.py", "    m = METAPHOR.search(t)\n", "    m = None\n",
                 {"title_metaphor"}, "題の見立てを拾わない"),
    "flag_none": ("lint.py", '        return [Hit("T-FLAG", 0, card, f"題の札に国旗が無い', '        return [] and [Hit("T-FLAG", 0, card, f"題の札に国旗が無い',
                  {"flag", "later_rule_live"}, "国旗が無くても通す"),
    "flag_wrong": ("lint.py", "        if code and code not in codes:\n", "        if False:\n",
                   {"flag"}, "違う国の旗を通す"),
    "flag_order": ("lint.py", "    if flags[0][0] > where[0][0]:\n", "    if False:\n",
                   {"flag"}, "国の名前の後ろの旗を通す"),
    "narrator": ("lint.py", "        m = NARRATOR.search(ln)\n", "        m = None\n",
                 {"narrator"}, "外の語り手を拾わない"),
    "phrase": ("lint.py", "        for pat, good in PHRASES:\n", "        for pat, good in ():\n",
               {"phrase"}, "直された言い回しを拾わない"),
    "yen": ("lint.py", "        m = CURRENCY.search(ln)\n", "        m = None\n",
            {"yen"}, "現地の通貨を拾わない"),
    "length": ("lint.py", "    if n <= MAX_CHARS:\n", "    if True:\n",
               {"length"}, "字数を見ない"),
    "end_any": ("lint.py", '    return [Hit("L-END", len(c.lines), last,', '    return [] and [Hit("L-END", len(c.lines), last,',
                {"end"}, "どんな終わりも通す"),
    "end_archive": ("lint.py", '    if "アーカイブ" in last:\n        return []\n', "",
                    {"end", "approved"}, "アーカイブの1行で終える形を落とす"),
    "ashi_rows": ("lint.py", '        if "【足】" in (r.get("why") or ""):\n            rows.add(i)\n', "        pass\n",
                  {"ashi"}, "spec の【足】の印を読まない"),
    "as_of": ("lint.py", "        if as_of and r.since > as_of:\n", "        if False:\n",
              {"as_of", "approved"}, "決まりの日を見ない"),
    "sorry": ("lint.py", "        m = SORRY.search(ln)\n", "        m = None\n",
              {"sorry"}, "謝る行を拾わない"),
    "spec_title": ("lint.py", '            card, came = s["title_card"], f"{sp.name} の title_card"\n', "            pass\n",
                   {"later_rule_live"}, "spec の題の札を読まない"),
}


def setup(cut):
    c = CUTS[cut] if cut else None
    return legs.load(HERE / "lint.py", "lint", (c[1], c[2]) if c else None)


def fails(L, c, as_of=TODAY):
    return [h for h in L.lint(c, as_of)["hits"] if not h.look]


def ctx(L, lines, title_card=None, rows=None):
    return L.Ctx(lines=list(lines), title_card=title_card, title_from="足", rows=rows)


def fix(L, rel, script="script.txt"):
    return L.build(FIX / rel / script)


# ---- 足 ----
def leg_approved(L):
    out = []
    for rel, script, as_of in (("approved/zjHZucyfrq8_p2", "script.txt", "2026-10-19"),
                               ("approved/TDArug_te90_p1", "script.txt", "2026-10-21"),
                               ("approved/TDArug_te90_p1", "script.txt", TODAY),
                               ("approved/yk-by7R7iPA_p3", "script_A.txt", "2026-10-17"),
                               ("approved/yk-by7R7iPA_p3", "script_B.txt", "2026-10-17"),
                               ("approved/yk-by7R7iPA_p3", "script_C.txt", "2026-10-17")):
        f = fails(L, fix(L, rel, script), as_of)
        out.append((f"{rel}/{script}（{as_of if as_of != TODAY else '今日'}の決まり）は ✕ 0"
                    + (f" ← {[h.rule for h in f]}" if f else ""), not f))
    return out


def leg_later_rule_live(L):
    f = fails(L, fix(L, "approved/zjHZucyfrq8_p2"))
    return [(f"ホステル p2 を今日の決まりで当てると T-FLAG だけ ← {[h.rule for h in f]}",
             [h.rule for h in f] == ["T-FLAG"])]


def leg_miete(L):
    f = fails(L, fix(L, "rejected/nGgoJ753rBw_p1"))
    hit = [h for h in f if h.rule == "L-MIETE"]
    ok1 = len(hit) == 1 and hit[0].line == 15 and "地下鉄1回に見えてきた" in hit[0].text
    ok2 = not [h for h in fails(L, ctx(L, ["ストックホルム来たら、地下鉄が高すぎた！", "海が見えてきた！", "日本の三倍や！", "みんなはどっち？"]))
               if h.rule == "L-MIETE"]
    return [("地下鉄 p1 の 15行目「地下鉄1回に見えてきた。」を拾う", ok1),
            ("「海が見えてきた！」（本当に見えた）・「日本の三倍や！」は拾わない", ok2)]


AYATO_TITLES = ("🇲🇰 北マケドニアの夕日見に行ったら、野良犬に襲われた！",
                "🇸🇪 ストックホルム来たら、地下鉄が高すぎた！",
                "🇲🇰 北マケドニアに来たら、銅像に1,200億円かけてる国だった",
                "アプリ作り始めて1年、\nついに1日4700人突破！")


def title_hits(L, card, rule):
    return [h for h in fails(L, ctx(L, ["題", "みんなは？"], title_card=card)) if h.rule == rule]


def leg_title_real(L):
    out = [("「銅像だらけの国で、僕まで銅像にされた」を拾う",
            bool([h for h in fails(L, fix(L, "rejected/CKJvprUMOgA_p2")) if h.rule == "T-REAL"])),
           ("「夕日待ってたら、野良犬にケバブ狙われた」を拾う",
            bool(title_hits(L, "🇲🇰 夕日待ってたら、野良犬にケバブ狙われた", "T-REAL")))]
    for t in AYATO_TITLES:
        out.append((f"あやとの題「{t.splitlines()[0]}…」は通す", not title_hits(L, t, "T-REAL")))
    return out


def leg_title_metaphor(L):
    out = [("「ストックホルムの地下鉄、迷路みたいだった」を拾う",
            bool(title_hits(L, "🇸🇪 ストックホルムの地下鉄、迷路みたいだった", "T-METAPHOR")))]
    for t in AYATO_TITLES:
        out.append((f"あやとの題「{t.splitlines()[0]}…」は通す", not title_hits(L, t, "T-METAPHOR")))
    return out


def leg_flag(L):
    return [
        ("国旗の無い「アルバニアの1泊1400円ホステルが、異常すぎた」を拾う",
         bool(title_hits(L, "アルバニアの1泊1400円ホステルが、\n異常すぎた", "T-FLAG"))),
        ("街の名前だけの「ストックホルム来たら…」も、国旗が無ければ拾う",
         bool(title_hits(L, "ストックホルム来たら、地下鉄が高すぎた！", "T-FLAG"))),
        ("違う国の旗（🇲🇪 北マケドニア）を拾う", bool(title_hits(L, "🇲🇪 北マケドニアに来たら、銅像だらけ", "T-FLAG"))),
        ("国の名前の後ろの旗（北マケドニア🇲🇰）を拾う", bool(title_hits(L, "北マケドニア🇲🇰に来たら、銅像だらけ", "T-FLAG"))),
        ("正しい旗（🇦🇱アルバニアの…）は通す", not title_hits(L, "🇦🇱アルバニアの1泊1400円ホステルが、\n異常すぎた", "T-FLAG")),
        ("国の名前の無い題（アプリの回）は通す", not title_hits(L, "アプリ作り始めて1年、\nついに1日4700人突破！", "T-FLAG")),
        ("「日本」だけの題は国旗を求めない", not title_hits(L, "日本の3倍の値段のコーヒー", "T-FLAG")),
    ]


def rules_at(L, rel, script, rule):
    return sorted(h.line for h in fails(L, fix(L, rel, script), "2026-10-16") if h.rule == rule)


def leg_narrator(L):
    p1 = "rejected/yk-by7R7iPA_p1"
    return [("p1 A の3行目「…この日、…あやとは、…」を拾う", rules_at(L, p1, "script_A.txt", "L-NARRATOR") == [3]),
            ("p1 B の7・8行目「本人いわく」「……だそうです」を拾う", rules_at(L, p1, "script_B.txt", "L-NARRATOR") == [7, 8]),
            ("p1 C の8行目「本人いわく」を拾う", rules_at(L, p1, "script_C.txt", "L-NARRATOR") == [8]),
            ("一人称の「僕は…」は拾わない", not [h for h in fails(L, ctx(L, ["僕は路線バスに乗った。", "みんなは？"])) if h.rule == "L-NARRATOR"])]


def leg_phrase(L):
    return [("p1 B の1行目「国を出る前に」を拾う", rules_at(L, "rejected/yk-by7R7iPA_p1", "script_B.txt", "L-PHRASE") == [1]),
            ("「出国前に」「この国は2週間で出るって決めた」は拾わない",
             not [h for h in fails(L, ctx(L, ["出国前に、ケバブ。", "もう嫌すぎて、この国は2週間で出るって決めた。", "みんなは？"]))
                  if h.rule == "L-PHRASE"])]


def leg_yen(L):
    p1 = "rejected/yk-by7R7iPA_p1"
    return [("p1 A の4行目「280レク。約550円」を拾う", rules_at(L, p1, "script_A.txt", "L-YEN") == [4]),
            ("p1 C の3行目「40レク、約80円」を拾う", rules_at(L, p1, "script_C.txt", "L-YEN") == [3]),
            ("「550円のケバブ」「アイドル」「リラックス」は拾わない",
             not [h for h in fails(L, ctx(L, ["選んだのは、550円のケバブ。", "アイドルみたいな犬。", "リラックスしすぎ。", "みんなは？"]))
                  if h.rule == "L-YEN"])]


def leg_length(L):
    def n_hits(n):
        return [h for h in fails(L, ctx(L, ["あ" * (n - 4), "みんなは？"])) if h.rule == "L-LENGTH"]
    return [("351字で落ちる", bool(n_hits(351))), ("350字は通る", not n_hits(350))]


def leg_end(L):
    def hits(lines):
        return [h for h in fails(L, ctx(L, lines)) if h.rule == "L-END"]
    return [("問いで切る（「みんなは、この宿、泊まれる？」）は通す", not hits(["題", "宿", "みんなは、この宿、泊まれる？"])),
            ("問い → 「…アーカイブ見てね！」は通す（#977）", not hits(["題", "みんなやったら、ケバブ守る？あげる？", "この国で見た爆焼夕日は配信のアーカイブ見てね！"])),
            ("問いを置かずにアーカイブの1行で終えるのも通す（#975。途中の「どっち？」は終わりの問いではない）",
             not hits(["題", "どっち？……乗っちゃお！", "船も乗れるねん！", "……船酔いしてるわな。", "続きはアーカイブ見てな！"])),
            ("問いのあとの「ありがとう！」を拾う", bool(hits(["題", "みんなは？", "見てくれてありがとう！"]))),
            ("問い → アーカイブ → 挨拶（アーカイブのあとにも足した）を拾う",
             bool(hits(["題", "みんなは？", "続きは配信のアーカイブ見てね！", "またね！"]))),
            ("問いもアーカイブも無い終わりを拾う", bool(hits(["題", "ほんまに楽しかった。"])))]


def leg_ashi(L):
    ck = L.lint(fix(L, "rejected/CKJvprUMOgA_p2"), TODAY)["hits"]
    ng = L.lint(fix(L, "rejected/nGgoJ753rBw_p1"), TODAY)["hits"]
    blind = L.lint(ctx(L, ["題", "みんなは？"]), TODAY)["blind"]
    marked = L.lint(L.Ctx(lines=["題", "会社の集合写真か！", "みんなは？"], title_card=None, title_from="足",
                          rows=None, ashi_marked={2}), TODAY)["hits"]
    return [("銅像 p2 の【足】5行を、全部 △ で出す（数では落とさない）",
             [h.line for h in ck if h.rule == "L-ASHI" and h.look] == [4, 6, 8, 19, 20]
             and not [h for h in ck if h.rule == "L-ASHI" and not h.look]),
            ("地下鉄 p1 の【足】（14・15・17行目）を △ で出す", [h.line for h in ng if h.rule == "L-ASHI" and h.look] == [14, 15, 17]),
            ("spec が無くても、原稿の字の【足】の印は拾う", [h.line for h in marked if h.rule == "L-ASHI"] == [2]),
            ("spec も印も無ければ L-ASHI は「見ていない」", "L-ASHI" in blind)]


def leg_sorry(L):
    p2 = L.lint(fix(L, "rejected/CKJvprUMOgA_p2_17"), TODAY)["hits"]
    castle = L.lint(fix(L, "approved/TDArug_te90_p1"), TODAY)["hits"]
    soft = L.lint(ctx(L, ["題", "言い過ぎてごめんやけど、やっぱり高い！", "みんなは？"]), TODAY)["hits"]
    return [("銅像 p2（17行）の12行目「北マケドニアさん、すいません。」を △ で出す（落とさない）",
             [h.line for h in p2 if h.rule == "L-SORRY" and h.look] == [12]
             and not [h for h in p2 if h.rule == "L-SORRY" and not h.look]),
            ("城塞 p1 には謝る行が無いので出さない", not [h for h in castle if h.rule == "L-SORRY"]),
            ("向きを変えない謝り（「言い過ぎてごめんやけど、やっぱり高い！」）も △ で出す。どちらかを読むのは批評役",
             [h.line for h in soft if h.rule == "L-SORRY" and h.look] == [2])]


def leg_as_of(L):
    r = L.lint(fix(L, "rejected/nGgoJ753rBw_p1"), "2026-10-20")
    return [("10-21 の決まり（L-MIETE）を 10-20 では当てない", "L-MIETE" in r["later"] and not [h for h in r["hits"] if h.rule == "L-MIETE"]),
            ("10-16 の決まり（L-NARRATOR）は当てる", "L-NARRATOR" in r["ran"])]


def leg_cli(L):
    def rc(*args):
        return subprocess.run([sys.executable, str(HERE / "lint.py"), *map(str, args)], capture_output=True,
                              text=True, timeout=60, check=False).returncode
    with tempfile.TemporaryDirectory() as td:
        empty = Path(td) / "script.txt"
        empty.write_text("\n# 空\n", encoding="utf-8")
        r_empty = rc(empty)
    return [("地下鉄 p1 は 1", rc(FIX / "rejected/nGgoJ753rBw_p1/script.txt") == 1),
            ("城塞 p1 は 0", rc(FIX / "approved/TDArug_te90_p1/script.txt") == 0),
            ("空の原稿は 2", r_empty == 2)]


LEGS = {
    "approved": leg_approved, "later_rule_live": leg_later_rule_live, "miete": leg_miete,
    "title_real": leg_title_real, "title_metaphor": leg_title_metaphor, "flag": leg_flag,
    "narrator": leg_narrator, "phrase": leg_phrase, "yen": leg_yen, "length": leg_length,
    "end": leg_end, "ashi": leg_ashi, "sorry": leg_sorry, "as_of": leg_as_of, "cli": leg_cli,
}

if __name__ == "__main__":
    sys.exit(legs.main(Path(__file__).resolve(), LEGS, CUTS, setup))
