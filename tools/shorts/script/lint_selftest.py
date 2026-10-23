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
| `rejected/VusdZVyjgjQ_p1` | 2026-10-23「ちょっと台本の品質が悪い」（#1014。7c008c3d の下書き21行。帳面 F-047） | 今日 |
| `approved/VusdZVyjgjQ_p1` | 2026-10-23 あやとの添削そのもの（#1014。5f1a3008 の19行） | 今日 |

フォカッチャの2本は、批評役の対照（`script_writing.md` 7.7）にも使うので、spec に `why`（作文者が挙げた配信の時刻）と
`visual`（画）を残してある。下書きの spec は当時まだ無かったので、作文者の表（7c008c3d の `script_table.md`）から組んだ。
添削版の spec は `shorts/videos/` の spec から削り、あやとが書き換えた・足した10行の why に「あやとの添削」を付け（城塞・地下鉄の
控えの【あやと】と同じ扱い）、まとめ役が渡すはずの `next_stream`（本日22時）を足した。

## 足

| 足 | 確かめること |
| --- | --- |
| `approved` | 出してよいと言われた6本が、言われた日の決まりで ✕ 0（TDArug とフォカッチャの添削版は今日の決まりでも） |
| `later_rule_live` | ホステル p2 を今日の決まりで当てると、T-FLAG だけが落ちる（承認のあとにできた決まりが効いている） |
| `miete` | 「地下鉄1回に見えてきた」を 15行目で拾う。「海が見えてきた！」は拾わない |
| `title_real` | 「銅像だらけの国で、僕まで銅像にされた」を拾う。あやとが書いた題4本（「海外キッチンで…」を含む）と、アプリの回の題は通す |
| `title_metaphor` | 「〜みたいだった」の題を拾う。あやとの題は通す |
| `flag` | 国旗が無い・違う国・国の名前の後ろ、を拾う。正しい旗と、国の名前が無い題は通す |
| `narrator` `phrase` `yen` | 10-16 に直された p1 の行（あやとは・本人いわく・だそうです／国を出る／280レク。約550円）を拾い、言い換えた行は通す |
| `length` | 351字で落ち、350字で通る |
| `end` | 最後の行が問い・問い → アーカイブ・アーカイブだけ（#975）は通す。問いのあとの別の行・どちらも無い終わりを拾う |
| `ashi` | 【足】の行を全部 △ で出す（数では落とさない）。原稿の字の印も拾う。spec も印も無ければ「見ていない」 |
| `sorry` | 銅像 p2（17行）の12行目「すいません」を △ で出す（落とさない）。城塞 p1 には出さない。「ごめん」も拾う |
| `as_of` | 決まりの日より前の日を渡すと、その規則を当てない |
| `cli` | 終了コード: 当たる 1・通る 0・空 2 |
| `card` | spec の題の札が 4.9秒なら ✕（T-CARD）、4.0秒は通る、秒が無ければ「見ていない」 |
| `sec` | 36字の行は ✕、35字は △ だけ、27字は何も出さない。あやとの1行目（29字・4.3秒）は △ だけ（L-SEC） |
| `after` | 【答】から締めまで3行で ✕、2行で △ が2つ、0行で何も出さない。問い → アーカイブの終わりは問いを締めに数える。原稿の字の【答】も spec の why の【答】も読む。印が無ければ「見ていない」（L-AFTER） |
| `num` | 銅像 p2（17行）の15行目「101体目」を △。「1回目」のあとの「2回目」・「30体」のあとの「31体目」は出さない。✕ にはしない（L-NUM） |
| `quote` | 城塞 p1 の「」2つ（って・言うたら）は出さない。前の行が「返事」なら出さない。印の無い「全然似てへん」を △。2字の札「1A」は見ない（L-QUOTE） |
| `ashirate` | 【足】7/13・5/13 は △、4/13 は出さない。城塞 p1 は出さない（L-ASHIRATE） |
| `ask` | 銅像 p2（17行）の終わり「…あり？なし？」を △。城塞 p1（みんな → アーカイブ）・地下鉄の形（アーカイブだけ）は出さない。アーカイブの前の「どっち派？」は △（L-ASK） |
| `desu` | 銅像 p2（17行）の10・12行目を △。城塞 p1 の「」の中の「閉まってますよ」は見ない（L-DESU） |
| `title_read` | フォカッチャの下書きの1行目（札と違う字）を ✕。あやとの添削版・城塞 p1（札は国旗と改行つき）は通す。札が無ければ「見ていない」。10-22 の決まりでは当てない（T-READ） |
| `next_time` | 下書きの最後「…配信見にきてね！」（時刻なし）を ✕。添削版（22時）は通す。spec の next_stream と違う時刻・「3時間」（時刻ではない）は ✕。アーカイブの1行・問いの終わりは見ない（L-NEXT） |
"""
from __future__ import annotations

import json
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
    "real": ("lint.py", "    if places_in(t) or REAL_NUM.search(t) or REAL_PLACE.search(t):\n", "    if True:\n",
             {"title_real"}, "題の現実の手がかりを見ない"),
    "real_place": ("lint.py", "    if places_in(t) or REAL_NUM.search(t) or REAL_PLACE.search(t):\n",
                   "    if places_in(t) or REAL_NUM.search(t):\n", {"title_real", "approved"}, "あやとが題の場所に使った「海外」を場所に数えない"),
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
    "end_invite": ("lint.py", "    if invites(last):\n        return []\n", "", {"end", "approved"}, "次の配信への誘いで終える形を落とす"),
    "end_any": ("lint.py", '    return [Hit("L-END", len(c.lines), last,', '    return [] and [Hit("L-END", len(c.lines), last,',
                {"end"}, "どんな終わりも通す"),
    "end_archive": ("lint.py", '    if "アーカイブ" in last:\n        return []\n', "",
                    {"end", "approved"}, "アーカイブの1行で終える形を落とす"),
    "ashi_rows": ("lint.py", '        if "【足】" in (r.get("why") or ""):\n            rows.add(i)\n', "        pass\n",
                  {"ashi"}, "spec の【足】の印を読まない"),
    "as_of": ("lint.py", "        if as_of and r.since > as_of:\n", "        if False:\n",
              {"as_of", "approved", "title_read"}, "決まりの日を見ない"),
    "sorry": ("lint.py", "        m = SORRY.search(ln)\n", "        m = None\n",
              {"sorry"}, "謝る行を拾わない"),
    "spec_title": ("lint.py", '            card, came = s["title_card"], f"{sp.name} の title_card"\n', "            pass\n",
                   {"later_rule_live", "title_read"}, "spec の題の札を読まない"),
    # ---- 2026-10-21（#1011）に足した規則 ----
    "card": ("lint.py", "    if c.card_seconds <= CARD_MAX:\n", "    if True:\n", {"card"}, "題の札の秒を見ない"),
    "card_spec": ("lint.py", '        secs = s.get("title_card_seconds")\n', "        secs = None\n",
                  {"card"}, "spec の札の秒を読まない"),
    "sec_hard": ("lint.py", "        if n > LINE_HARD:\n", "        if False:\n", {"sec"}, "35字を越える行を落とさない"),
    "sec_soft": ("lint.py", "        elif sec > LINE_SOFT:\n", "        elif False:\n", {"sec"}, "4秒を越える行を出さない"),
    "after_hard": ("lint.py", "    if len(between) >= AFTER_HARD:\n", "    if False:\n", {"after"}, "答えのあとの3行を落とさない"),
    "after_close": ("lint.py", '    if n >= 2 and "アーカイブ" in lines[-1] and ("？" in lines[-2] or "?" in lines[-2]):\n        return n - 1\n', "",
                    {"after", "ask"}, "問い → アーカイブの終わりで、問いを締めに数えない"),
    "answer_mark": ("lint.py", '        if "【答】" in s:\n            answer.add(len(lines) + 1)\n', "",
                    {"after"}, "原稿の字の【答】を読まない"),
    "answer_spec": ("lint.py", '            if "【答】" in (r.get("why") or ""):\n                answer.add(i)\n', "            pass\n",
                    {"after"}, "spec の why の【答】を読まない"),
    "num": ("lint.py", "            if v is not None and v >= 2 and v - 1 not in said and v not in said:\n", "            if False:\n",
            {"num"}, "序数の手前の数を見ない"),
    "num_said": ("lint.py", "                said.add(v)\n", "                pass\n", {"num"}, "前の行で言った数を覚えない"),
    "quote": ("lint.py", "        if ATTR.search(rest) or ATTR.search(prev):\n            continue\n", "",
              {"quote"}, "誰の言葉かの印を見ない"),
    "quote_prev": ("lint.py", "        if ATTR.search(rest) or ATTR.search(prev):\n", "        if ATTR.search(rest):\n",
                   {"quote"}, "1つ前の行の印を見ない"),
    "ashirate": ("lint.py", "    if not n or len(rows) / n <= ASHI_SHARE:\n", "    if True:\n", {"ashirate"}, "【足】の割合を見ない"),
    "ask": ("lint.py", '    if not ("？" in ln or "?" in ln) or "アーカイブ" in ln or "みんな" in ln:\n', "    if True:\n",
            {"ask"}, "終わりの問いの「みんな」を見ない"),
    "desu": ("lint.py", '        m = DESU.search(QUOTE.sub("", ln))\n', "        m = None\n", {"desu"}, "です・ます調を拾わない"),
    "desu_quote": ("lint.py", '        m = DESU.search(QUOTE.sub("", ln))\n', "        m = DESU.search(ln)\n",
                   {"desu"}, "「」の中のです・ますまで拾う"),
    # ---- 2026-10-23（#1014、F-047）に足した規則 ----
    "read_any": ("lint.py", "    if card == first:\n", "    if True:\n", {"title_read"}, "1行目が題の札と違っても通す"),
    "read_norm": ("lint.py", '    return TITLE_NOISE.sub("", FLAG_PAIR.sub("", s or ""))\n', '    return s or ""\n',
                  {"title_read", "approved", "later_rule_live"}, "国旗・改行・句読点の置きかたの違いまで ✕ にする"),
    "next_none": ("lint.py", "    if invites(last) and not TIME.search(last):\n", "    if False:\n", {"next_time"}, "時刻の無い誘いを通す"),
    "next_spec": ("lint.py", "        if miss:\n", "        if False:\n", {"next_time"}, "spec の next_stream の時刻を見ない"),
    "next_spec_read": ("lint.py", '        nxt = s.get("next_stream") or None\n', "        nxt = None\n", {"next_time"},
                       "spec の next_stream を読まない"),
    "time_hours": ("lint.py", "時(?!間)|(?<![0-9])", "時|(?<![0-9])", {"next_time"}, "「3時間」を時刻に数える"),
    "invite_archive": ("lint.py", '    return "アーカイブ" not in line and bool(INVITE.search(line))\n',
                       "    return bool(INVITE.search(line))\n", {"next_time"}, "アーカイブの1行を次の配信への誘いに数える"),
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
                               ("approved/yk-by7R7iPA_p3", "script_C.txt", "2026-10-17"),
                               ("approved/VusdZVyjgjQ_p1", "script.txt", TODAY)):
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
                "アプリ作り始めて1年、\nついに1日4700人突破！",
                "海外キッチンでワンパンチーズフォカッチャ\n作ったらまさかの事態に！")


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
            ("次の配信への誘い（あやと #1014「…本日22時から作るので配信見にきてね！」）で終えるのも通す",
             not hits(["題", "うまい！", "リベンジにワンパンピザを本日22時から作るので配信見にきてね！"])),
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


_TMP = tempfile.TemporaryDirectory(prefix="lint-selftest-")   # 終わるときに消える（対照の子ごとに1つ）


def tmp_script(lines, spec=None):
    """一時の置き場に script.txt（と spec.json）を書いて、L.build に読ませる道を返す。"""
    td = tempfile.mkdtemp(dir=_TMP.name)
    sp = Path(td) / "script.txt"
    sp.write_text("\n".join(lines) + "\n", encoding="utf-8")
    if spec is not None:
        (Path(td) / "spec.json").write_text(json.dumps(spec, ensure_ascii=False), encoding="utf-8")
    return sp


def hits_of(L, c, rule):
    return [h for h in L.lint(c, TODAY)["hits"] if h.rule == rule]


def leg_card(L):
    long_ = L.build(tmp_script(["題", "みんなは？"], {"title_card": "題", "title_card_seconds": 4.9, "rows": []}))
    ok_ = L.build(tmp_script(["題", "みんなは？"], {"title_card": "題", "title_card_seconds": 4.0, "rows": []}))
    blind = L.lint(ctx(L, ["題", "みんなは？"]), TODAY)["blind"]
    h = hits_of(L, long_, "T-CARD")
    return [("spec の題の札が 4.9秒なら ✕（題の札の行 0）", len(h) == 1 and not h[0].look and h[0].line == 0),
            ("4.0秒は通る", not hits_of(L, ok_, "T-CARD")),
            ("秒が無ければ「見ていない」", "T-CARD" in blind)]


def leg_sec(L):
    def hs(line):
        return hits_of(L, ctx(L, ["題", line, "みんなは？"]), "L-SEC")
    h36, h35, h27 = hs("あ" * 36), hs("あ" * 35), hs("あ" * 27)
    ayato = hs("フランスに行ったら、10日でモンサンミッシェルも南仏も回れた！")
    return [("36字の行は ✕", any(not h.look for h in h36)),
            ("35字は ✕ にせず △ だけ（5.1秒）", h35 and all(h.look for h in h35)),
            ("27字（4.0秒）は何も出さない", not h27),
            ("あやとの1行目（29字・4.3秒）は △ だけ", ayato and all(h.look for h in ayato))]


def leg_after(L):
    def c_(lines, ans):
        return L.Ctx(lines=list(lines), title_card=None, title_from="足", rows=None, answer_marked=set(ans))
    three = hits_of(L, c_(["題", "a", "船も乗れるねん！", "x", "y", "z", "みんなは？"], {3}), "L-AFTER")
    two = hits_of(L, c_(["題", "a", "船も乗れるねん！", "x", "y", "みんなは？"], {3}), "L-AFTER")
    zero = hits_of(L, c_(["題", "a", "船も乗れるねん！", "みんなは？"], {3}), "L-AFTER")
    arch = hits_of(L, c_(["題", "a", "船も乗れるねん！", "乗りたかったんよ、船！", "……船酔いしてるわな。", "続きはアーカイブ見てな！"], {3}), "L-AFTER")
    ask_arch = hits_of(L, c_(["題", "犬が食べたんはキュウリ。", "みんなやったら、守る？あげる？", "続きは配信のアーカイブ見てね！"], {2}), "L-AFTER")
    inline = L.build(tmp_script(["題", "a", "【答】船も乗れるねん！", "x", "y", "z", "みんなは？"]))
    in_spec = L.build(tmp_script(["題", "a", "船も乗れるねん！", "x", "y", "z", "みんなは？"],
                                 {"rows": [{"line": "題"}, {"line": "a"}, {"line": "船", "why": "【答】題の答え"}, {}, {}, {}, {}]}))
    blind = L.lint(ctx(L, ["題", "みんなは？"]), TODAY)["blind"]
    return [("【答】から締めまで3行で ✕", len(three) == 1 and not three[0].look),
            ("2行は ✕ にせず △ が2つ（4・5行目）", [h.line for h in two if h.look] == [4, 5] and all(h.look for h in two)),
            ("答えのすぐあとが締めなら何も出さない", not zero),
            ("アーカイブだけの終わり（#975 の直す前）は、答えのあとの2行を △", [h.line for h in arch] == [4, 5]),
            ("問い → アーカイブの終わりは、問いを締めに数える（答えのすぐあと）", not ask_arch),
            ("原稿の字の【答】を読む", any(not h.look for h in hits_of(L, inline, "L-AFTER"))),
            ("spec の why の【答】を読む", any(not h.look for h in hits_of(L, in_spec, "L-AFTER"))),
            ("【答】が無ければ「見ていない」", "L-AFTER" in blind)]


def leg_num(L):
    p2 = hits_of(L, fix(L, "rejected/CKJvprUMOgA_p2_17"), "L-NUM")
    seq = hits_of(L, ctx(L, ["題", "1回目は迷った。", "2回目で着いた！", "みんなは？"]), "L-NUM")
    nxt = hits_of(L, ctx(L, ["題", "スーツの銅像だけで、30体。", "31体目、僕。", "みんなは？"]), "L-NUM")
    own = hits_of(L, ctx(L, ["題", "人生3回目のフランス！", "みんなは？"]), "L-NUM")
    return [("銅像 p2（17行）の15行目「101体目」を △", [h.line for h in p2] == [15] and all(h.look for h in p2)),
            ("「1回目」のあとの「2回目」は出さない", not seq),
            ("「30体」のあとの「31体目」は出さない", not nxt),
            ("「人生3回目」も △ で出すが、✕ にはしない（拾う前提かは批評役が読む）", own and all(h.look for h in own))]


def leg_quote(L):
    castle = hits_of(L, fix(L, "approved/TDArug_te90_p1"), "L-QUOTE")
    reply = hits_of(L, ctx(L, ["次の日の返事、たった3行。", "「ハロー。請求はキャンセルします。良い旅を」", "みんなは？"]), "L-QUOTE")
    bare = hits_of(L, ctx(L, ["題", "「全然似てへん」。", "みんなは？"]), "L-QUOTE")
    label = hits_of(L, ctx(L, ["題", "来たのは「1A」。……これ、違う？", "みんなは？"]), "L-QUOTE")
    return [("城塞 p1 の「」（って・言うたら）は出さない", not castle),
            ("前の行が「返事」なら出さない", not reply),
            ("印の無い「全然似てへん」を △", [h.line for h in bare] == [2] and all(h.look for h in bare)),
            ("2字の札「1A」は見ない", not label)]


def leg_ashirate(L):
    def c_(n, k):
        return L.Ctx(lines=[f"行{i}" for i in range(n)], title_card=None, title_from="足", rows=None,
                     ashi_marked=set(range(1, k + 1)))
    castle = hits_of(L, fix(L, "approved/TDArug_te90_p1"), "L-ASHIRATE")
    return [("【足】7/13（あやとの A の形）は △", bool(hits_of(L, c_(13, 7), "L-ASHIRATE"))),
            ("【足】5/13 は △", bool(hits_of(L, c_(13, 5), "L-ASHIRATE"))),
            ("【足】4/13 は出さない", not hits_of(L, c_(13, 4), "L-ASHIRATE")),
            ("城塞 p1 は出さない", not castle)]


def leg_ask(L):
    p2 = hits_of(L, fix(L, "rejected/CKJvprUMOgA_p2_17"), "L-ASK")
    castle = hits_of(L, fix(L, "approved/TDArug_te90_p1"), "L-ASK")
    arch = hits_of(L, ctx(L, ["題", "船も乗れるねん！", "続きはアーカイブ見てな！"]), "L-ASK")
    before = hits_of(L, ctx(L, ["題", "x", "どっち派？", "続きはアーカイブ見てね！"]), "L-ASK")
    return [("銅像 p2（17行）の終わり「…あり？なし？」を △", [h.line for h in p2] == [17] and all(h.look for h in p2)),
            ("城塞 p1（みんな → アーカイブ）は出さない", not castle),
            ("アーカイブだけの終わりは出さない", not arch),
            ("アーカイブの前の「どっち派？」は △", [h.line for h in before] == [3])]


def leg_desu(L):
    p2 = hits_of(L, fix(L, "rejected/CKJvprUMOgA_p2_17"), "L-DESU")
    castle = hits_of(L, fix(L, "approved/TDArug_te90_p1"), "L-DESU")
    return [("銅像 p2（17行）の10・12行目を △", [h.line for h in p2] == [10, 12] and all(h.look for h in p2)),
            ("城塞 p1 の「」の中の「閉まってますよ」は見ない", not castle)]


VUSD_NG = "rejected/VusdZVyjgjQ_p1"   # フォカッチャの下書き（あやと「台本の品質が悪い」#1014）
VUSD_OK = "approved/VusdZVyjgjQ_p1"   # あやとの添削版


def leg_title_read(L):
    ng = hits_of(L, fix(L, VUSD_NG), "T-READ")
    ok = hits_of(L, fix(L, VUSD_OK), "T-READ")
    castle = hits_of(L, fix(L, "approved/TDArug_te90_p1"), "T-READ")
    blind = L.lint(ctx(L, ["題", "みんなは？"]), TODAY)["blind"]
    before = L.lint(fix(L, VUSD_NG), "2026-10-22")
    return [("フォカッチャの下書きの1行目（札と違う字）を ✕", [(h.line, h.look) for h in ng] == [(1, False)]),
            ("あやとの添削版（札の改行と1行目の句読点だけが違う）は通す", not ok),
            ("城塞 p1（札は国旗と改行つき）は通す", not castle),
            ("札が無ければ「見ていない」", "T-READ" in blind),
            ("10-22 の決まりでは当てない", "T-READ" in before["later"] and not [h for h in before["hits"] if h.rule == "T-READ"])]


def leg_next_time(L):
    def last(line, nxt=None):
        c = L.Ctx(lines=["題", "うまい！", line], title_card=None, title_from="足", rows=None, next_stream=nxt)
        return hits_of(L, c, "L-NEXT")
    ng = hits_of(L, fix(L, VUSD_NG), "L-NEXT")
    ok = hits_of(L, fix(L, VUSD_OK), "L-NEXT")
    other = L.build(tmp_script(["題", "うまい！", "明日は21時から作るので配信見にきてね！"],
                               {"next_stream": "本日22時", "rows": []}))
    return [("下書きの最後「明日はワンパンピザ作るので配信見にきてね！」（時刻なし）を ✕",
             [(h.line, h.look) for h in ng] == [(21, False)]),
            ("添削版の最後（本日22時から）は通す（spec の next_stream「本日22時」とも合う）", not ok),
            ("spec の next_stream と違う時刻（22時 → 21時）は ✕", bool(hits_of(L, other, "L-NEXT"))),
            ("「3時間配信するから見にきてね！」は時刻ではないので ✕", bool(last("3時間配信するから見にきてね！"))),
            ("「続きはアーカイブ配信見てね！」は誘いではない（時刻を求めない）", not last("続きはアーカイブ配信見てね！")),
            ("問いで終える回には時刻を求めない", not last("みんなは、これ食べたい？"))]


LEGS = {
    "approved": leg_approved, "later_rule_live": leg_later_rule_live, "miete": leg_miete,
    "title_real": leg_title_real, "title_metaphor": leg_title_metaphor, "flag": leg_flag,
    "narrator": leg_narrator, "phrase": leg_phrase, "yen": leg_yen, "length": leg_length,
    "end": leg_end, "ashi": leg_ashi, "sorry": leg_sorry, "as_of": leg_as_of, "cli": leg_cli,
    "card": leg_card, "sec": leg_sec, "after": leg_after, "num": leg_num, "quote": leg_quote,
    "ashirate": leg_ashirate, "ask": leg_ask, "desu": leg_desu,
    "title_read": leg_title_read, "next_time": leg_next_time,
}

if __name__ == "__main__":
    sys.exit(legs.main(Path(__file__).resolve(), LEGS, CUTS, setup))
