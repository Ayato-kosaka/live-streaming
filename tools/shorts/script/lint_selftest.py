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
| `approved/VusdZVyjgjQ_p1` | 2026-10-23 あやとの添削そのもの（#1014。5f1a3008 の19行） | 添削の時点（2026-10-23:6354242835） |
| `rejected/LdgTh1DC3Jk_p1` | 2026-10-23「字幕をつなげてるだけ」「『配信のコメントで』は使わない約束」「何度も言ってます」（#1019。滝の回 p1 の17行。帳面 F-048〜F-050） | 今日 |

フォカッチャの2本は、批評役の対照（`script_writing.md` 7.7）にも使うので、spec に `why`（作文者が挙げた配信の時刻）と
`visual`（画）を残してある。下書きの spec は当時まだ無かったので、作文者の表（7c008c3d の `script_table.md`）から組んだ。
添削版の spec は `shorts/videos/` の spec から削り、あやとが書き換えた・足した10行の why に「あやとの添削」を付け（城塞・地下鉄の
控えの【あやと】と同じ扱い）、まとめ役が渡すはずの `next_stream`（本日22時）を足した。

滝の回 p1 の spec は、作文者が `rows` ではなく `lines` の鍵で書いていた（lint が黙って読み飛ばした元）。控えでは鍵だけ `rows` に直し、
8行目の視聴者さんの書き込みの字を「……」に伏せた（規則は字ではなく「コメント」で当たるので、伏せても同じ所で落ちる）。

**承認済みの原稿は、承認の時点（`--as-of <日付>:<あやとの返事のコメントID>`）で当てる。** 2026-10-23 の夕方にできた規則（L-INNER・L-NICK・
L-PARTICLE・L-ATE）は、城塞 p1（ポチ・「夕日見に行ったら」）・地下鉄 p1（「ストックホルム来たら」）・銅像 p2（「配信のコメントで」）に今日の決まりで当たる。
承認より後の決まりで落ちたものを、原稿の誤りと取り違えない（`later_rule_live` と `nick`・`particle` が、今日の決まりでは当たることを見る）。

## 足

| 足 | 確かめること |
| --- | --- |
| `approved` | 出してよいと言われた6本が、言われた時点の決まりで ✕ 0（城塞はコメントの時点、フォカッチャの添削版は添削の時点） |
| `later_rule_live` | ホステル p2 を 10-22 の決まりで当てると、T-FLAG だけが落ちる（承認のあとにできた決まりが効いている） |
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
| `quote` | 城塞 p1 の「」2つ（って・言うたら）は出さない。前の行が「返事」なら出さない。印の無い「全然似てへん」を △。2字の札「1A」は見ない。「コメント」は印に数えない（L-QUOTE） |
| `ask` | 銅像 p2（17行）の終わり「…あり？なし？」を △。城塞 p1（みんな → アーカイブ）・地下鉄の形（アーカイブだけ）は出さない。アーカイブの前の「どっち派？」は △（L-ASK） |
| `desu` | 銅像 p2（17行）の10・12行目を △。城塞 p1 の「」の中の「閉まってますよ」は見ない（L-DESU） |
| `title_read` | フォカッチャの下書きの1行目（札と違う字）を ✕。あやとの添削版・城塞 p1（札は国旗と改行つき）は通す。札が無ければ「見ていない」。10-22 の決まりでは当てない（T-READ） |
| `next_time` | 下書きの最後「…配信見にきてね！」（時刻なし）を ✕。添削版（22時）は通す。spec の next_stream と違う時刻・「3時間」（時刻ではない）は ✕。アーカイブの1行・問いの終わりは見ない（L-NEXT） |
| `inner` | 滝の回 p1 の8行目「配信のコメントで…」・銅像 p2 の6行目・「チャットで」・題の札の「リスナー」を ✕。締めの問い・アーカイブ・次の配信への誘いは見ない（L-INNER） |
| `nick` | 滝の回 p1 の2・10・12行目「ポチ」を ✕。城塞 p1 の13行目は今日の決まりで ✕・承認の時点では当てない。「ポチっと」「ポチった」・直した「野良犬」は見ない。帳面に `呼び名「…」→「…」` を足すと辞書が増え、帳面に1つも無ければ「見ていない」（L-NICK） |
| `particle` | 題「滝観に」「ストックホルム来たら」を ✕（札が無ければ1行目を題として ✕）。直した題・「乗り放題」「花見に」「パリ行き」は見ない。行の「路線バス乗るの」は △ だけ（L-PARTICLE） |
| `ate` | 当て表（spec の promises）にカードの ID が全部あれば通る。1つ欠ける・note が「なし」・行の番号が原稿の外・promises が無い、をそれぞれ ✕。spec が無ければ「見ていない」（L-ATE） |
| `as_of_id` | `--as-of 2026-10-23:6354242835`（朝のフォカッチャの添削）では夕方の4規則を当てず、日付だけの T-READ・L-NEXT は当てる。夕方のコメントの時点・日付だけなら当てる |
| `spec_rows` | spec が `rows` でなく `lines` で書いてある・行の数が原稿と違う、なら当てずに止まる（何の鍵で書いてあるかを言う）。`--no-spec` なら当てる |
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
CASTLE_AT = "2026-10-21:6306110329"     # 城塞 p1 の承認（あやと #977「これで、進めて」）
FOCACCIA_AT = "2026-10-23:6354242835"   # フォカッチャのあやとの添削（#1014）
WF = "rejected/LdgTh1DC3Jk_p1"          # 滝の回 p1（#1019「字幕をつなげてるだけ」）

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
    "as_of": ("lint.py", "        if not in_force(r.since, as_of):\n", "        if False:\n",
              {"as_of", "approved", "title_read", "as_of_id", "later_rule_live", "nick"}, "決まりの日を見ない"),
    "sorry": ("lint.py", "        m = SORRY.search(ln)\n", "        m = None\n",
              {"sorry"}, "謝る行を拾わない"),
    "spec_title": ("lint.py", '            card, came = s["title_card"], f"{sp.name} の title_card"\n', "            pass\n",
                   {"later_rule_live", "title_read", "as_of_id", "particle"}, "spec の題の札を読まない"),
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
    "ask": ("lint.py", '    if not ("？" in ln or "?" in ln) or "アーカイブ" in ln or "みんな" in ln:\n', "    if True:\n",
            {"ask"}, "終わりの問いの「みんな」を見ない"),
    "desu": ("lint.py", '        m = DESU.search(QUOTE.sub("", ln))\n', "        m = None\n", {"desu"}, "です・ます調を拾わない"),
    "desu_quote": ("lint.py", '        m = DESU.search(QUOTE.sub("", ln))\n', "        m = DESU.search(ln)\n",
                   {"desu"}, "「」の中のです・ますまで拾う"),
    # ---- 2026-10-23（#1014、F-047）に足した規則 ----
    "read_any": ("lint.py", "    if card == first:\n", "    if True:\n", {"title_read"}, "1行目が題の札と違っても通す"),
    "read_norm": ("lint.py", '    return TITLE_NOISE.sub("", FLAG_PAIR.sub("", s or ""))\n', '    return s or ""\n',
                  {"title_read", "approved", "particle"}, "国旗・改行・句読点の置きかたの違いまで ✕ にする"),
    "next_none": ("lint.py", "    if invites(last) and not TIME.search(last):\n", "    if False:\n", {"next_time"}, "時刻の無い誘いを通す"),
    "next_spec": ("lint.py", "        if miss:\n", "        if False:\n", {"next_time"}, "spec の next_stream の時刻を見ない"),
    "next_spec_read": ("lint.py", '        nxt = s.get("next_stream") or None\n', "        nxt = None\n", {"next_time"},
                       "spec の next_stream を読まない"),
    "time_hours": ("lint.py", "時(?!間)|(?<![0-9])", "時|(?<![0-9])", {"next_time"}, "「3時間」を時刻に数える"),
    "invite_archive": ("lint.py", '    return "アーカイブ" not in line and bool(INVITE.search(line))\n',
                       "    return bool(INVITE.search(line))\n", {"next_time"}, "アーカイブの1行を次の配信への誘いに数える"),
    "quote_comment": ("lint.py", 'ATTR = re.compile(r"って|言われ|', 'ATTR = re.compile(r"コメント|って|言われ|', {"quote"},
                      "「コメント」を、誰の言葉かの印に数える（前の形）"),
    # ---- 2026-10-23（#1019、F-048・F-049・F-050）に足した規則 ----
    "inner": ("lint.py", "        m = INNER.search(ln)\n", "        m = None\n", {"inner"}, "内輪の言葉を拾わない"),
    "card_lines": ("lint.py", '    return ([(0, c.title_card.replace("\\n", ""))] if c.title_card else []) + list(enumerate(c.lines, 1))\n',
                   "    return list(enumerate(c.lines, 1))\n", {"inner", "nick"}, "題の札の内輪・呼び名を見ない"),
    "nick": ("lint.py", "            if nick_at(ln, bad):\n", "            if False:\n", {"nick"}, "呼び名を拾わない"),
    "nick_ledger": ("lint.py", '        for bad, good in NICK_PAIR.findall(it.fields.get("直す前 → 直した後", "")):\n',
                    '        for bad, good in NICK_PAIR.findall(""):\n', {"nick"}, "帳面の直しから辞書を作らない"),
    "nick_verb": ("lint.py", "(?![ァ-ヶーっッるりらろれゃャ])", "(?![ァ-ヶー])", {"nick"}, "「ポチっと」「ポチった」まで呼び名に数える"),
    "particle_see": ("lint.py", "    for m in SEE.finditer(text):\n", "    for m in ():\n", {"particle"}, "「滝観に」を拾わない"),
    "particle_place": ("lint.py", "        if PLACE_GO.match(rest):\n", "        if False:\n", {"particle"}, "「ストックホルム来たら」を拾わない"),
    "particle_ride": ("lint.py", "    for m in RIDE.finditer(text):\n", "    for m in ():\n", {"particle"}, "「路線バス乗る」を拾わない"),
    "particle_noun": ("lint.py", "(?<!花)", "", {"particle"}, "「花見に」まで助詞の抜けに数える"),
    "particle_look": ("lint.py", '声だけで一度で分かるか", look=True))', '声だけで一度で分かるか", look=False))', {"particle"},
                      "行の助詞の抜けまで ✕ にする（関西の話し言葉で自然に抜く所がある）"),
    "particle_card": ("lint.py", "    title_line = 0 if c.title_card is not None else 1\n", "    title_line = 1\n", {"particle"},
                      "札の助詞の抜けを1行目の行に付ける"),
    "ate_miss": ("lint.py", "    if miss:\n        out.append(Hit(\"L-ATE\"", "    if False:\n        out.append(Hit(\"L-ATE\"", {"ate"},
                 "当て表の欠けた ID を見ない"),
    "ate_note": ("lint.py", "        if len(note) < NOTE_MIN:\n", "        if False:\n", {"ate"}, "空の note を通す"),
    "ate_lines": ("lint.py", "and 0 <= x <= n for x in lines):\n", "for x in lines):\n", {"ate"}, "原稿の外の行の番号を通す"),
    "ate_none": ("lint.py", "    if c.promises is None:\n", "    if False:\n", {"ate"}, "当て表の無い spec を、形の違いと区別しない"),
    "ate_read": ("lint.py", '        has_spec, promises = True, s.get("promises")\n', "        has_spec, promises = True, None\n", {"ate"},
                 "spec の promises を読まない"),
    "as_of_cid": ("lint.py", "    return sc is None or ac is None or sc <= ac\n", "    return True\n", {"as_of_id", "approved"},
                  "同じ日の決まりの前後をコメントID で分けない"),
    "rows_missing": ("lint.py", "        if not isinstance(rows, list):\n", "        if False:\n", {"spec_rows"}, "rows の無い spec を黙って読む"),
    "rows_count": ("lint.py", "        if len(rows) != len(lines):\n", "        if False:\n", {"spec_rows"}, "行の数の違う spec を黙って読む"),
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
                               ("approved/TDArug_te90_p1", "script.txt", CASTLE_AT),
                               ("approved/yk-by7R7iPA_p3", "script_A.txt", "2026-10-17"),
                               ("approved/yk-by7R7iPA_p3", "script_B.txt", "2026-10-17"),
                               ("approved/yk-by7R7iPA_p3", "script_C.txt", "2026-10-17"),
                               ("approved/VusdZVyjgjQ_p1", "script.txt", FOCACCIA_AT)):
        f = fails(L, fix(L, rel, script), as_of)
        out.append((f"{rel}/{script}（{as_of}の決まり）は ✕ 0"
                    + (f" ← {[h.rule for h in f]}" if f else ""), not f))
    return out


def leg_later_rule_live(L):
    f = fails(L, fix(L, "approved/zjHZucyfrq8_p2"), "2026-10-22")
    return [(f"ホステル p2 を 10-22 の決まりで当てると T-FLAG だけ ← {[h.rule for h in f]}",
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
    lines_key = tmp_script(["題", "みんなは？"], {"title_card": "題", "lines": [{"line": "題"}, {"line": "みんなは？"}]})
    return [("地下鉄 p1 は 1", rc(FIX / "rejected/nGgoJ753rBw_p1/script.txt") == 1),
            ("城塞 p1（承認の時点の決まり）は 0", rc(FIX / "approved/TDArug_te90_p1/script.txt", "--as-of", CASTLE_AT) == 0),
            ("空の原稿は 2", r_empty == 2),
            ("spec が rows でなく lines で書いてあれば 2", rc(lines_key) == 2),
            ("--as-of の形が違えば 2（2026-10-23:abc）", rc(FIX / "approved/TDArug_te90_p1/script.txt", "--as-of", "2026-10-23:abc") == 2)]


_TMP = tempfile.TemporaryDirectory(prefix="lint-selftest-")   # 終わるときに消える（対照の子ごとに1つ）


def tmp_script(lines, spec=None):
    """一時の置き場に script.txt（と spec.json）を書いて、L.build に読ませる道を返す。"""
    td = tempfile.mkdtemp(dir=_TMP.name)
    sp = Path(td) / "script.txt"
    sp.write_text("\n".join(lines) + "\n", encoding="utf-8")
    if spec is not None:
        (Path(td) / "spec.json").write_text(json.dumps(spec, ensure_ascii=False), encoding="utf-8")
    return sp


ROWS2 = [{"line": "題"}, {"line": "みんなは？"}]


def hits_of(L, c, rule):
    return [h for h in L.lint(c, TODAY)["hits"] if h.rule == rule]


def leg_card(L):
    long_ = L.build(tmp_script(["題", "みんなは？"], {"title_card": "題", "title_card_seconds": 4.9, "rows": ROWS2}))
    ok_ = L.build(tmp_script(["題", "みんなは？"], {"title_card": "題", "title_card_seconds": 4.0, "rows": ROWS2}))
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
    comment = hits_of(L, ctx(L, ["題", "ほんまに「最高や」とコメント。", "みんなは？"]), "L-QUOTE")
    return [("城塞 p1 の「」（って・言うたら）は出さない", not castle),
            ("前の行が「返事」なら出さない", not reply),
            ("印の無い「全然似てへん」を △", [h.line for h in bare] == [2] and all(h.look for h in bare)),
            ("2字の札「1A」は見ない", not label),
            ("「コメント」は誰の言葉かの印に数えない（視聴者の書き込みは印を付けても持ち出さない。F-048）", [h.line for h in comment] == [2])]


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
                               {"next_stream": "本日22時", "rows": [{}, {}, {}]}))
    return [("下書きの最後「明日はワンパンピザ作るので配信見にきてね！」（時刻なし）を ✕",
             [(h.line, h.look) for h in ng] == [(21, False)]),
            ("添削版の最後（本日22時から）は通す（spec の next_stream「本日22時」とも合う）", not ok),
            ("spec の next_stream と違う時刻（22時 → 21時）は ✕", bool(hits_of(L, other, "L-NEXT"))),
            ("「3時間配信するから見にきてね！」は時刻ではないので ✕", bool(last("3時間配信するから見にきてね！"))),
            ("「続きはアーカイブ配信見てね！」は誘いではない（時刻を求めない）", not last("続きはアーカイブ配信見てね！")),
            ("問いで終える回には時刻を求めない", not last("みんなは、これ食べたい？"))]


# ---------- 2026-10-23（#1019、F-048・F-049・F-050） ----------

def leg_inner(L):
    wf = hits_of(L, fix(L, WF), "L-INNER")
    statue = hits_of(L, fix(L, "rejected/CKJvprUMOgA_p2_17"), "L-INNER")
    closing = hits_of(L, ctx(L, ["題", "みんなやったら、それでも行く？", "続きは配信のアーカイブ見てね！"]), "L-INNER")
    invite = hits_of(L, ctx(L, ["題", "うまい！", "リベンジに本日22時から作るので配信見にきてね！"]), "L-INNER")
    chat = hits_of(L, ctx(L, ["題", "チャットで教えてもらった店。", "みんなは？"]), "L-INNER")
    card = hits_of(L, ctx(L, ["題", "みんなは？"], title_card="リスナーさんに言われて来た店"), "L-INNER")
    return [("滝の回 p1 の8行目「配信のコメントで…」を ✕", [(h.line, h.look) for h in wf] == [(8, False)]),
            ("銅像 p2（17行・公開済み）の6行目「配信のコメントで…」も今日の決まりでは ✕", [h.line for h in statue] == [6]),
            ("締めの「みんなやったら…？」「配信のアーカイブ見てね」は内輪ではない", not closing),
            ("次の配信への誘い「…配信見にきてね！」も内輪ではない", not invite),
            ("「チャットで」を ✕", [h.line for h in chat] == [2]),
            ("題の札の「リスナー」も ✕（行 0）", [h.line for h in card] == [0])]


def leg_nick(L):
    wf = hits_of(L, fix(L, WF), "L-NICK")
    castle = fix(L, "approved/TDArug_te90_p1")
    now = hits_of(L, castle, "L-NICK")
    then = [h for h in L.lint(castle, CASTLE_AT)["hits"] if h.rule == "L-NICK"]
    verb = hits_of(L, ctx(L, ["題", "ボタンをポチっと押したら、", "ネットでポチった。", "みんなは？"]), "L-NICK")
    good = hits_of(L, ctx(L, ["題", "野良犬だらけの草原からスタート！", "みんなは？"]), "L-NICK")
    card = hits_of(L, ctx(L, ["題", "みんなは？"], title_card="ポチと歩いた草原"), "L-NICK")
    led_mod, led = L._ledger()
    text = led_mod.PATH.read_text(encoding="utf-8")
    grown = led_mod.parse(text.replace("（呼び名「ポチ」→「野良犬」）", "（呼び名「ポチ」→「野良犬」・呼び名「タマ」→「野良猫」）", 1))
    empty = led_mod.parse(text.replace("呼び名「", "名「"))
    saved = list(L._LED)
    try:
        L._LED[:] = [(led_mod, empty)]
        blind = L.lint(ctx(L, ["題", "みんなは？"]), TODAY)["blind"]
    finally:
        L._LED[:] = saved
    return [("滝の回 p1 の2・10・12行目「ポチ」を ✕", [(h.line, h.look) for h in wf] == [(2, False), (10, False), (12, False)]),
            ("城塞 p1 の13行目「ポチ、あかんよ」は、今日の決まりでは ✕", [h.line for h in now] == [13]),
            ("同じ城塞 p1 も、承認の時点（2026-10-21:6306110329）では当てない", not then),
            ("「ポチっと」「ポチった」（ボタン・買い物）は呼び名に数えない", not verb),
            ("直した「野良犬」は通す", not good),
            ("題の札の呼び名も ✕（行 0）", [h.line for h in card] == [0]),
            ("帳面に `呼び名「タマ」→「野良猫」` を足すと、手で直さずに辞書が増える",
             L.nicknames(grown).get("タマ") == "野良猫" and "タマ" not in L.nicknames(led)),
            ("帳面に呼び名の直しが1つも無ければ「見ていない」（0件を緑にしない）", "L-NICK" in blind)]


def leg_particle(L):
    def card_hits(card):
        return hits_of(L, ctx(L, ["題", "みんなは？"], title_card=card), "L-PARTICLE")
    wf = hits_of(L, fix(L, WF), "L-PARTICLE")
    ride = hits_of(L, ctx(L, ["題", "アルバニアで路線バス乗るの今日が初めて", "みんなは？"]), "L-PARTICLE")
    free = hits_of(L, ctx(L, ["題", "1週間乗り放題、7800円課金や！", "花見に行こ。", "パリ行きのバスに乗った。", "みんなは？"]),
                   "L-PARTICLE")
    no_card = hits_of(L, ctx(L, ["ストックホルム来たら、地下鉄が高すぎた！", "みんなは？"]), "L-PARTICLE")
    return [("滝の回 p1 の題の札「滝観に」を ✕（行 0）", [(h.line, h.look) for h in wf] == [(0, False)]),
            ("直した題「滝を観に」は通す", not card_hits("🇬🇪ジョージアで滝を観に行こうと思ったら大惨事に！")),
            ("あやとの題「ストックホルム来たら」も ✕（題も訂正する。F-049）",
             [(h.line, h.look) for h in card_hits("🇸🇪 ストックホルム来たら、地下鉄が高すぎた！")] == [(0, False)]),
            ("「ストックホルムに来たら」は通す", not card_hits("🇸🇪 ストックホルムに来たら、地下鉄が高すぎた！")),
            ("札が無ければ、1行目（読み上げる題）を ✕", [(h.line, h.look) for h in no_card] == [(1, False)]),
            ("行の「路線バス乗るの」は △ だけ（あやとが通した話し言葉）", [(h.line, h.look) for h in ride] == [(2, True)]),
            ("「乗り放題」「花見に」「パリ行きの」は見ない", not free)]


def leg_ate(L):
    led_mod, led = L._ledger()
    ids = [it.id for it in led_mod.script_items(led)]
    full = {i: {"lines": [], "note": "当たらない: この原稿にその場面が無い"} for i in ids}

    def got(promises, has_key=True):
        spec = {"rows": ROWS2, **({"promises": promises} if has_key else {})}
        return [h for h in fails(L, L.build(tmp_script(["題", "みんなは？"], spec))) if h.rule == "L-ATE"]
    miss = {k: v for k, v in full.items() if k != "F-048"}
    short = {**full, "F-049": {"lines": [1], "note": "なし"}}
    outside = {**full, "F-031": {"lines": [5], "note": "題の札に場所と出来事を入れた"}}
    blind = L.lint(ctx(L, ["題", "みんなは？"]), TODAY)["blind"]
    return [(f"カード {len(ids)} 枚（帳面の項目と、帳面の外の X2）の ID が全部あれば通る",
             len(ids) > 1 and "X2" in ids and "F-050" in ids and not got(full)),
            ("F-048 が欠けたら ✕（欠けた ID を名指す）", any("F-048" in h.note for h in got(miss))),
            ("note が「なし」だけなら ✕", any("F-049" in h.text for h in got(short))),
            ("行の番号が原稿の外（5行目。原稿は2行）なら ✕", any("F-031" in h.text for h in got(outside))),
            ("spec に promises が無ければ ✕（「当て表が無い」と言う）", any("当て表が無い" in h.note for h in got(None, has_key=False))),
            ("spec が無ければ「見ていない」", "L-ATE" in blind)]


def leg_as_of_id(L):
    ok = fix(L, VUSD_OK)
    morning = L.lint(ok, FOCACCIA_AT)
    evening = L.lint(ok, "2026-10-23:6370959237")
    day = L.lint(ok, "2026-10-23")
    late = {"L-INNER", "L-NICK", "L-PARTICLE", "L-ATE"}
    return [("朝のフォカッチャの添削の時点（6354242835）では、夕方の規則（L-INNER ほか4つ）を当てない", late <= set(morning["later"])),
            ("同じ時点でも、日付だけの規則（T-READ・L-NEXT）は当てる", {"T-READ", "L-NEXT"} <= set(morning["ran"])),
            ("夕方の滝の回の直しの時点（6370959237）なら当てる", not late & set(evening["later"])),
            ("日付だけの --as-of 2026-10-23 は、その日の規則を全部当てる（落とす側に倒す）", not late & set(day["later"]))]


def leg_spec_rows(L):
    def stops(spec, lines=("題", "みんなは？")):
        try:
            L.build(tmp_script(list(lines), spec))
            return ""
        except ValueError as e:
            return str(e)
    lines_key = stops({"title_card": "題", "lines": ROWS2})
    short = stops({"rows": ROWS2[:1]})
    no_spec = L.build(tmp_script(["題", "みんなは？"], {"title_card": "題", "lines": ROWS2}), use_spec=False)
    return [("spec が rows でなく lines で書いてあれば止まる（lines で書いてある、と言う）", "lines" in lines_key),
            ("rows の行の数が原稿と違えば止まる", "rows が 1 行" in short),
            ("--no-spec なら spec を読まずに当てる", no_spec.lines == ["題", "みんなは？"] and not no_spec.has_spec)]


LEGS = {
    "approved": leg_approved, "later_rule_live": leg_later_rule_live, "miete": leg_miete,
    "title_real": leg_title_real, "title_metaphor": leg_title_metaphor, "flag": leg_flag,
    "narrator": leg_narrator, "phrase": leg_phrase, "yen": leg_yen, "length": leg_length,
    "end": leg_end, "ashi": leg_ashi, "sorry": leg_sorry, "as_of": leg_as_of, "cli": leg_cli,
    "card": leg_card, "sec": leg_sec, "after": leg_after, "num": leg_num, "quote": leg_quote,
    "ask": leg_ask, "desu": leg_desu,
    "title_read": leg_title_read, "next_time": leg_next_time,
    "inner": leg_inner, "nick": leg_nick, "particle": leg_particle, "ate": leg_ate,
    "as_of_id": leg_as_of_id, "spec_rows": leg_spec_rows,
}

if __name__ == "__main__":
    sys.exit(legs.main(Path(__file__).resolve(), LEGS, CUTS, setup))
