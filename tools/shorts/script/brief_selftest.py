"""**作文者・批評役に渡す1枚（`brief.py`）の見張り。** 要るのは Python だけ。

    python3 tools/shorts/script/brief_selftest.py
    BREAK=holdout python3 tools/shorts/script/brief_selftest.py   # 守りを1つ外した版で回す（対照の子）

終了コード 0=通った / 1=落ちた / 2=数えるものが無い・外す字が見つからない（`docs/island-standards.md` §15）。

1枚が崩れると、担当は「前に言われたこと」を知らないまま書く・採点する（帳面を全文で読ませるのをやめたので、1枚が唯一の道）。
2026-10-23 の棚卸しでは、約束26個のうち10個が作文者の1枚に中身ごと入っていなかった（帳面を題と例の頭に縮めていた）。
だから「全部が・全文で・先頭に」入っているかを、帳面の字と突き合わせて見る（#1019、帳面 F-048〜F-050）。

| 足 | 確かめること |
| --- | --- |
| `cards` | 約束のカードは、帳面の題・言い回し・事実・構成の項目に、字に効く F-014（画）・F-019（音）・F-050（進め方）と帳面の外の X2 を足したもの。F-044（進め方・往復の上限）と画・音・投稿だけの項目は入らない |
| `full` | カードの決まり（する／しない）と直す前 → 直した後が、帳面の字と1字も違わずに入る（前は題と例の頭を90字で切っていた）。作文者・批評役とも |
| `replaced` | 帳面で「置き換わった」へ移した古い字（F-043「別の字でよい」・F-004「足りないところだけ同じ口調で足す」・F-035「少なく」）が、カードに出ない |
| `grows` | 帳面に項目を1つ足すと、手で直さずにカードに入る |
| `holdout` | 批評役の1枚では、見ている原稿の行を引く直しの例（銅像 p2 → F-039 の例）を伏せ、決まりは残す。ほかの原稿では例を残す。作文者の1枚では伏せない |
| `ranges` | 書き起こしは、区間に掛かる30秒の行だけ |
| `fill` | 雛形の {{…}} が1つでも残れば止まる |
| `ayato` | spec の why が「あやとの題」「あやとの書き足し」「あやとの添削」「あやと #NNN「…」」「あやと #NNN の題」「あやと #NNN の骨」の行に【あやと】、言い換えの「あやとの言葉 #976 を…」には付けない。`orig_voice` のある行に【元の声】（F-051） |
| `c_source` | 批評役の1枚に、`--video` の配信の字幕が入る（フォカッチャの下書きなら、作文者が根拠に挙げた 2:44:00 の行）。`--video` が無ければ「渡していない」と書く（#1014、F-047） |
| `c_ranges` | 字幕の区間は、spec の why・src に書いた時刻の前後30秒。重なる区間は1つにまとめ、src の小数の秒も読む |
| `c_leak` | 批評役の雛形は、対照の原稿の行を8字以上そのまま引かない（終わりの形「アーカイブ見てね」は数えない）。引いた字をこしらえると拾い、1枚を作らずに止まる |
| `c_cards` | 批評役の1枚に、作文者と同じカード（ID の見出しが全部）と「当てる ID」の並びが入る |
| `rows_stop` | spec が `rows` でなく `lines` で書いてあれば、批評役の1枚を作らずに止まる（滝の回 p1 は、画の列が空のまま回っていた） |
| `w_fixed` | 作文者の1枚に、`--title` の題の札（1行目でそのまま読む）と `--next` の次の配信を書き、表の1行目に札の字を入れる。札に助詞の抜けがあれば、直す字と一緒に書く（F-049）。無ければ「指定なし」。表は4欄（4欄目が「選んだ理由」。あやと #1019） |
| `w_order` | 作文者の1枚は、約束のカード → 方針 → 書く形 → 当て表 → 材料（配信の字幕）の順。カードが先頭で、字幕はいちばん後ろ |
| `w_nochat` | 作文者の1枚にチャットの本文が1行も入らない（同じ区間のチャットがあっても、本人が読み上げて自動字幕に入っていても。読み上げは〔コメントの読み上げ〕に伏せる）。`--chat` を渡すと止まる（F-048） |
| `w_read` | 本人が読み上げた書き込みを伏せる（こしらえた字幕とチャットで）: 6字のそのまま・かな ↔ 漢字（漢字の側まで伏せる）・長音と句読点と絵文字の名前・1行に2回・長い書き込みの一部（切れ目なく12字）・5字のめずらしい字・6字の頭4字（末尾の笑いの w を除いて 2/3）。伏せないもの: 書き込みから80秒を越えた読み上げ（4字の書き込みも）・本人が先に言った字（前の行・同じ行の前のほう。5字の書き込みも）・3字と挨拶・合う字が少ない書き込み・8字の書き込みの半分だけ。伏せた所の前後の本人の言葉は残す |
| `w_real` | クラムチャウダーの回（E2oGYjnVQSA）の本物の字幕とチャットで、1:11:29・1:16:48 の書き込みを本人が読み上げた 1:12:00・1:17:00 の行が伏せられ、行の残りの字は残る（字は写さない。2026-11-04 に作文者が本人の言葉として拾った所） |
| `w_short` | マトカ渓谷の回（eHBAnQF56-E）の本物で、6字に満たない書き込み（1:38:00 の5字・1:38:52 の5字）と、7字の書き込みの頭4字（1:37:48。末尾は笑いの w）を本人が読み上げた 1:38:00・1:39:00 の行が伏せられ、行の残りの字は残る（2026-11-12 に C 案の原稿に2回入った所） |
| `w_keep` | 同じ回で、4〜5字の書き込みと同じ字を本人が窓の中で言った所のうち、ありふれた相づち・反応（ほかの回の1割を越える回に出る字。0:15:00・2:23:00・2:59:30）と、本人がこの回のほかの所でも言う字（1:25:00）は伏せない |
| `w_corpus` | ほかの回の字幕を畳んだ字の控え（一時置き場）は、字幕が同じあいだは使い、1本でも変われば読み直す（控えるのは、対照の子が起き直すたびに1秒あまり読み直して、回し役の上限を越えたから） |
| `w_multi` | 作文者の1枚に、`--video` 2本ぶんの字幕が回ごとの見出しで入り、2本目の回の読み上げも伏せる。区間の頭の `<videoId>@` で回を名指し、書かない区間は最初の回。区間の無い回は止まる。表の行の数は `--lines` のまま（伏せた数で上書きしない） |
| `c_multi` | 批評役の1枚: spec の why・src の「videoId H:MM:SS」「videoId@H:MM:SS」から回ごとに区間を切る（回を書かない時刻は最初の回）。why で名指した、`--video` に無い回も入る。2本目にも伏せ字が効く |
| `c_extra` | 批評役の1枚に `--extra` の写しが入る。`<videoId>=<道>` ならその回のチャットで伏せ、回を書かなければ「伏せていない」と書く |
| `c_pending` | spec の画に「確認中」のある行に【画は確認中】の印。批評役の1枚の表の印の列にも出て、雛形の (h) に「確認中は当てない・回に無い画は『回に無い:』で挙げる」の線引きがある |
| `w_ate` | 当て表の雛形（表と spec の promises の形）に、カードの ID が全部・1回ずつ並ぶ |
| `w_watch` | 字幕に配信の中の呼び名（ポチ）・コメントへの言及・前の回の事情（先週・リベンジ。L-PREV）があれば、時刻と言葉だけを書く（字幕の文は写さない） |
| `w_pairs` | あやとの書き直しの差の表（`references/rewrite_diff_*.md`）: 本物の表が読めて、組の種類が全部「種類」の表にある。こしらえた2組の表で、いま書いている回（`--video`）の組は「あやとの目で直す」にも、カードの並びの数にも入らず、ほかの回の組は入る。知らない種類の組は止まる。カードは直された数の多い順に先頭へ並び、見出しに数が付く（数が無ければ帳面の順）。**雛形の字と「種類」の表の言い方に、差の表のあやとの行（8字の窓）が1つも無い**（どの回にも出る字なので、書くとその回で答えが漏れる）。作文者の1枚に節と数の行が入る |
| `w_stay` | あやとが残した行の表（2026-11-13 の2回目）: 本物に10行以上あり、教会を書くときの「残した」と戻した字は、消す種類の例と同じくらいの数。こしらえた表で、いま書いている回の残した行は入らず、ほかの回の残した行は見かけの消す種類の下に「残した」で入る。見かけの無い戻した字は「残す — 削りすぎ」にまとめて消す種類のすぐあとに。直された数には数えない。見かけに知らない種類・名前に空白のある組の見出しは止まる。本物で、教会を書くときは入り直しの景色が入らず、マトカ渓谷を書くときは「答えのあとの行」の下に入る。パソコン p2 の戻した字が「削りすぎ」に入る |
| `c_retouch` | 批評役の1枚に、カードのあとで「あやとの目で直す」（作文者と同じ節。「残した」と、消す側で挙げない線引きつき）が入る。いま見る原稿の行を引く例は伏せて数を書き、`--video` の回の組は入れない |

本編集の担当の1枚（`brief.py edit`）。担当はこれ1枚と企画の名指した小節だけを読む（#1011）ので、1枚から落ちたものは担当に届かない。
本物の回（フランス周遊 A・銅像・地下鉄・城塞）で組んで確かめる。

| 足 | 確かめること |
| --- | --- |
| `e_ledger` | 帳面の画・音・投稿の項目と、題の札の項目（F-015・F-030・F-043）が全部入る。原稿の段・進め方の項目は入らない。足した画の項目は手で直さずに入る |
| `e_check` | 当てる場所が `check:` だけの項目（F-013・F-027・F-028）は「検査が見る」の1行に名前だけ。人の目が要る項目は「する」の1行つき |
| `e_lines` | フランス A の原稿の13行が、全部・順に表に入る |
| `e_secs` | 前の版の指示書があれば、表の秒とカットは指示書の実際の値。行の数が原稿と違う指示書は使わない |
| `e_plan` | 企画の地図と取り込みの表は、その案（A）の節と共通の節だけ。B・C の節を名指さない |
| `e_streams` | 配信の videoId は spec の時間軸の割り当て（`2:=…`）から重ねずに。「使わない」と書いた配信は入れない |
| `e_fill` | 雛形の {{…}} が残らず、フランス A で 2万字以下 |
| `e_others` | 銅像・地下鉄・城塞の回でも、落ちずに2万字以下で出て、その回の原稿の1行目が表に入る |
| `e_pick` | 案を付けない回はいちばん新しい版（銅像は p2）。案が要る回で案が無い・無い案は止まる |
| `e_cmds` | 雛形に書いた道具と `--引数` が今の道具に在る。無い引数・無い道具は止まる。同じ行の別の道具の引数は通す |
| `e_clips` | 配信ごとの clips を「作業枝に在る・コマ一覧の封あり／古い形」「下ろしてある（在った木のコミット）」「記録が無い」に分ける |
| `e_name` | 勧める書き出しの名前は、作業枝に頼んだことのある名前（`shorts/render/<名前>.json` の今と履歴）と重ならない。担当の枝で足して下ろした依頼も数える |

`e_clips` の「下ろしてある」と `e_name` は、本物の履歴ではなく、その場で作る小さな git（`git_fixture`）で見る。CI は浅い checkout（履歴1つ）で、本物の履歴に頼ると CI だけで落ちる（#1012 で落ちた）。
| `e_voice` | 声に渡す字の雛形は、spec の `tts_text`（無ければ行の字）・key は `<id>/NN`・bytes は UTF-8 のバイト数 |
"""
from __future__ import annotations

import json
import os
import re
import subprocess
import sys
import tempfile
import unicodedata
from difflib import SequenceMatcher
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
FIX = HERE / "fixtures"
sys.path.insert(0, str(HERE.parent / "feedback"))
import legs  # noqa: E402

CUTS = {
    # 約束のカード（#1019、帳面 F-048〜F-050）。選びかたは帳面の読み手（ledger.py）にある
    "cards_place": ("ledger.py", '    return it.category in SCRIPT_CATS or bool(it.lint) or WRITE in it.place or "批評役" in it.place\n',
                    "    return it.category in SCRIPT_CATS\n", {"cards"}, "分類だけで選ぶ（F-014・F-019・F-050 が落ちる）"),
    "cards_own": ("ledger.py", "    return [it for it in led.items.values() if for_script(it)] + list(OWN)\n",
                  "    return [it for it in led.items.values() if for_script(it)]\n", {"cards"}, "帳面の外の約束（X2）を入れない"),
    "full_rule": ("brief.py", "        body = [head, \"\", f\"- **決まり**: {flat(it.fields.get('決まり', ''))}\",\n",
                  "        body = [head, \"\", f\"- **決まり**: {flat(it.fields.get('決まり', ''))[:90]}\",\n", {"full", "holdout"},
                  "決まりを90字で切る（前の形）"),
    "full_fix": ("brief.py", '        fix = flat(it.fields.get("直す前 → 直した後", ""))\n',
                 '        fix = flat(it.fields.get("直す前 → 直した後", "")).split(" ／ ")[0]\n', {"full"},
                 "直しの例を最初の1組だけにする（前の形）"),
    "holdout": ("brief.py", "        if avoid and quotes_script(fix, avoid):\n", "        if False:\n",
                {"holdout"}, "見ている原稿の行を引く例も渡す"),
    "rows_stop": ("lint.py", "        if not isinstance(rows, list):\n", "        if False:\n", {"rows_stop"},
                  "rows の無い spec を黙って読む（lint.build が止めている）"),
    "c_cards": ("brief.py", '        "cards": cards(avoid=c.lines) + "\\n\\n" + critic_retouch(mine, c.lines),\n',
                '        "cards": critic_retouch(mine, c.lines),\n', {"c_cards"}, "批評役の1枚にカードを入れない"),
    "w_chat": ("brief.py", "    if chat:\n        raise ValueError", "    if False:\n        raise ValueError", {"w_nochat"},
               "--chat を黙って受け取る"),
    "w_particle": ("brief.py", "        if drops:\n", "        if False:\n", {"w_fixed"}, "題の札の助詞の抜けを作文者に書かない"),
    "w_reason": ("brief.py", ' | 残した本人の言葉 | 選んだ理由 |\",\n', ' | 残した本人の言葉 |\",\n', {"w_fixed"},
                 "表の4欄目（選んだ理由）を外す"),
    "orig_voice": ("brief.py", '    if r.get("orig_voice"):\n', "    if False:\n", {"ayato"}, "元の声の行に印を付けない"),
    "w_mask": ("brief.py", "        for a, b2 in sorted(spans):\n", "        for a, b2 in sorted([]):\n",
               {"w_nochat", "w_read", "w_real", "w_short", "w_multi", "c_multi", "c_extra"}, "字幕の中のコメントの読み上げを伏せない"),
    # 読み上げの伏せ字（2026-11-04。クラムチャウダーの回で、6字・かな ↔ 漢字・絵文字の名前つきの書き込みが素通りした）
    # 6〜7字は、めずらしい字の決まり（本人がほかで言う字・ありふれた字は当てない）でも拾える。下限を上げると、本人がこの回の
    # ほかの所で言う字を読み上げた所（こしらえた字幕の 0:01:30）が残る
    "read_min": ("brief.py", "READ_MIN = 6        #", "READ_MIN = 8        #", {"w_read"},
                 "6〜7字の書き込みを、めずらしい字の決まりでしか当てない（前の形は8字から）"),
    "read_cover": ("brief.py", "    need = n if short_ else max(READ_MIN, math.ceil(n * READ_COVER))\n", "    need = n\n", {"w_read"},
                   "長い書き込みも、字幕にそのまま入っているときだけ伏せる（かな ↔ 漢字の聞き取りを落とす）"),
    "read_emoji": ("brief.py", "    return LAUGH.sub(\"\", folded(EMOJI_NAME.sub(\"\", body)))\n", "    return LAUGH.sub(\"\", folded(body))\n", {"w_read", "w_real"},
                   "書き込みの絵文字の名前（:smiling_face:）を落とさずに比べる"),
    # 書き込みの字がカタカナのまま残ると、ひらがなに畳んだほかの回の字幕で見つからず、ありふれた反応まで「めずらしい」に見える
    "read_kana": ("brief.py", "            if \"ァ\" <= c <= \"ヶ\":\n", "            if False:\n", {"w_read", "w_keep"},
                  "カタカナとひらがなの違いを吸わない"),
    "read_lag": ("brief.py", "for lag, s0, s1, left, right in got if lag < hi]", "for lag, s0, s1, left, right in got]", {"w_read"},
                 "書き込みから80秒を越えた読み上げまで伏せる"),
    "read_first": ("brief.py", "                first[k] = any(end <= c and b in x for _, end, x in said)\n", "                first[k] = False\n",
                   {"w_read"}, "本人が先に言った字（視聴者さんが本人の口ぐせを返した字）まで伏せる"),
    "read_sameline": ("brief.py", "            if any(lag < lo for lag, *_ in got):\n", "            if False:\n", {"w_read"},
                      "同じ行の前のほうで本人がもう言っている字まで伏せる"),
    "read_greet": ("brief.py", "            core = GREET.sub(\"\", b)   #", "            core = b   #", {"w_read"},
                   "挨拶だけの書き込みも当てる（本人の挨拶まで伏せる）"),
    "read_part": ("brief.py", "            part = not short_ and top >= READ_PART\n", "            part = False\n", {"w_read"},
                  "長い書き込みの一部だけを読んだ所を伏せない"),
    "read_widen": ("brief.py", "    budget, j = min(left, READ_EDGE), o0 - 1\n", "    return o0, o1\n", {"w_read"},
                   "かな ↔ 漢字の端（「ひとり」↔「一人」）を伏せ残す"),
    # 6字に満たない書き込み・頭だけ読んだ書き込み（2026-11-12。マトカ渓谷の回で、5字の書き込みと7字の書き込みの頭4字が素通りした）
    "read_rare": ("brief.py", "for s0, s1, left, right, m in rare_spans(core, s)]", "for s0, s1, left, right, m in ()]",
                  {"w_read", "w_short"}, "めずらしい字の決まりを丸ごと外す"),
    "read_laugh": ("brief.py", "    return LAUGH.sub(\"\", folded(EMOJI_NAME.sub(\"\", body)))\n", "    return folded(EMOJI_NAME.sub(\"\", body))\n",
                   {"w_read", "w_short"}, "書き込みの末尾の笑いの w を残して比べる（7字になり、頭4字では 2/3 に届かない）"),
    "read_common": ("brief.py", "                if not own[k, m] and not common(m, video):\n", "                if not own[k, m]:\n", {"w_keep"},
                    "ありふれた相づち・反応（ほかの回の1%を越える回に出る字）まで伏せる"),
    "read_own": ("brief.py", "                    own[k, m] = any(m in x for st, end, x in said if end <= c or st >= c + hi)\n",
                 "                    own[k, m] = False\n", {"w_keep"}, "本人がこの回のほかの所でも言う字まで伏せる"),
    "read_floor3": ("brief.py", "READ_FLOOR = 4      #", "READ_FLOOR = 3      #", {"w_read"},
                    "3字の書き込みまで当てる（本人の受け答えと見分けがつかない）"),
    "read_ratio": ("brief.py", "READ_RARE = 2 / 3   #", "READ_RARE = 1 / 2   #", {"w_read"}, "書き込みの半分を読んだだけで伏せる"),
    "read_early": ("brief.py", "                if not lo <= lag < hi or m in early:\n", "                if not lo <= lag < hi:\n", {"w_read"},
                   "同じ行の前のほうで本人が先に言った短い字まで伏せる"),
    "corpus_sig": ("brief.py", "            text = body if head == sig and body.count(", "            text = body if True and body.count(", {"w_corpus"},
                   "字幕が変わっても、ほかの回の字幕の控えを使い続ける"),
    "read_rare_lag": ("brief.py", "                if not lo <= lag < hi or m in early:\n", "                if m in early:\n", {"w_read"},
                      "短い書き込みから80秒を越えた所まで伏せる"),
    # 回をまたぐ原稿（2026-11-04。夫婦の車の回・バゲットの回）
    "w_multi": ("brief.py", "    for v, rs in per.items():\n", "    for v, rs in list(per.items())[:1]:\n", {"w_multi"},
                "2本目からの回の字幕を作文者の1枚に入れない（前の形）"),
    "w_prefix": ("brief.py", "        vid, sep, rest = r.rpartition(\"@\")\n", "        vid, sep, rest = \"\", \"\", r\n", {"w_multi"},
                 "区間の頭の <videoId>@ を読まない"),
    "w_bare": ("brief.py", "    if bare:\n        raise ValueError", "    if False:\n        raise ValueError", {"w_multi"},
               "区間の無い回を黙って落とす"),
    "w_table_n": ("brief.py", "        note = f\"。{masked_note(k)}\" if k else \"\"\n", "        note, n = (f\"。{masked_note(k)}\" if k else \"\"), k\n",
                  {"w_multi"}, "表の行の数を伏せた数で上書きする（2026-11-04 まで）"),
    "c_token": ("brief.py", "                    if videos and (v in videos or VID.fullmatch(v)):\n", "                    if False:\n", {"c_multi"},
                "why・src の回の名前を読まず、全部の時刻を最初の回のものにする"),
    "c_named": ("brief.py", "    named = [v for v in cited if v not in videos]", "    named = []", {"c_multi"},
                "why・src で名指した、--video に無い回を入れない"),
    "c_extra_mask": ("brief.py", "    if vid:\n        lines, n = mask_read", "    if False:\n        lines, n = mask_read", {"c_extra"},
                     "回を書いた写しも伏せない"),
    # 1次の原稿の画（2026-11-04。批評役が「画は確認中」の行を F-014 の ✕ に当てた）
    "c_pending": ("brief.py", "    if pending_visual(r):\n", "    if False:\n", {"c_pending"}, "画が確認中の行に印を付けない"),
    "w_watch": ("brief.py", "        at = [ln.split(\"]\", 1)[0].lstrip(\"[\") for ln in lines if lint_mod.nick_at(ln, bad)]\n",
                "        at = []\n", {"w_watch"}, "字幕の呼び名を作文者に書かない"),
    "w_prev": ("brief.py", "        m = lint_mod.PREV.search(ln)\n", "        m = None\n", {"w_watch"}, "字幕の前の回の事情（先週・リベンジ）を作文者に書かない"),
    # あやとの書き直しの差の表（2026-11-13 #1192）
    "pairs_holdout": ("brief.py", '    use = [p for p in pairs if not vs & set(p["videos"])]\n', "    use = list(pairs)\n",
                      {"w_pairs", "w_stay", "c_retouch"},
                      "いま書いている回の組も、手本と数に入れる（答えを渡す）"),
    "pairs_first": ("brief.py", "        items = sorted(items, key=lambda it: (-first.get(it.id, 0), pos[it.id]))\n", "        items = items\n",
                    {"w_pairs"}, "カードを、書き直しで直された数の順に並べない"),
    "pairs_unknown": ("brief.py", "    if unknown:\n        raise ValueError(f\"差の表の組に", "    if False:\n        raise ValueError(f\"差の表の組に",
                      {"w_pairs", "w_stay"}, "種類の表に無い種類の組を黙って読む"),
    # あやとが残した行（2026-11-13 の2回目。1回目は消した例だけで、作文者が題の約束を閉じる景色まで消した）
    "stay_holdout": ("brief.py", '    stays = [p for p in use if p.get("kept")]\n', '    stays = [p for p in pairs if p.get("kept")]\n',
                     {"w_stay"}, "いま書いている回の、あやとが残した行も手本に入れる（答えを渡す）"),
    "stay_show": ("brief.py", '            lines.append(f"   - **残した**: {_kept(p)}")\n', "            pass\n", {"w_stay", "c_retouch"},
                  "あやとが残した行を、消す種類の下に出さない（1回目の形。作文者・批評役の両方の1枚から消える）"),
    "stay_loose": ("brief.py", '    loose = [p for p in stays if not p["kinds"] and shown(p)]\n', "    loose = []\n", {"w_stay"},
                   "作文者が削って戻させた字（見かけの種類の無い行）を出さない"),
    "stay_count": ("brief.py", '        if p.get("kept"):   # 残した行は、直された所ではない\n            continue\n', "", {"w_stay"},
                   "残した行まで、カードの並びの「直された数」に数える"),
    "stay_head": ("brief.py", '(None if ln.startswith(("## ", "### ")) else group)', '(None if ln.startswith("## ") else group)', {"w_stay"},
                  "組の見出しの形でない「### 」のあとの表を、前の組のまま読む"),
    # 批評役の1枚の「あやとの目で直す」（2026-11-13 の2回目）
    "c_retouch": ("brief.py", '        "cards": cards(avoid=c.lines) + "\\n\\n" + critic_retouch(mine, c.lines),\n',
                  '        "cards": cards(avoid=c.lines),\n', {"c_retouch"}, "批評役の1枚に「あやとの目で直す」を入れない（1回目の形）"),
    "c_retouch_hide": ("brief.py", "        return not (avoid and quotes_script(f\"{p['ours']} {p['ayato']}\", avoid))\n",
                       "        return True\n", {"c_retouch"}, "いま見る原稿の行を引いている例も、批評役に見せる"),
    "c_retouch_mine": ("brief.py", '    mine = videos_of(video) + [p.partition("=")[0] for p in extra or [] if "=" in p]\n', "    mine = []\n",
                       {"c_retouch"}, "批評役の1枚に、いま見ている回の組も入れる"),
    "ranges": ("brief.py", "        if not any(a - step < t <= b for a, b in ranges):\n", "        if False:\n",
               {"ranges", "c_source"}, "区間の外の行まで入れる"),
    "fill": ("brief.py", "    if left:\n", "    if False:\n", {"fill"}, "埋めていない所を見逃す"),
    "ayato": ("brief.py", '    if AYATO.search(why):\n', "    if False:\n", {"ayato"}, "【あやと】を付けない"),
    "ayato_num": ("brief.py", r"(?:\s*#\d+\s*)?の(題|骨|", "の(題|", {"ayato"},
                  "「あやと #1187 の題」「あやと #1187 の骨」に【あやと】を付けない（2026-11-13 まで）"),
    # 批評役の1枚の配信の字幕（#1014、F-047）
    "c_video": ("brief.py", "    if not videos and not extra:\n", "    if True:\n", {"c_source", "c_multi", "c_extra"},
                "批評役の1枚に配信の字幕を入れない"),
    "c_cited": ("brief.py", '                pts.setdefault(cur, []).append(hms(m.group("t")))\n', "                pass\n",
                {"c_ranges", "c_source", "c_multi"}, "spec の why・src の時刻を読まない"),
    "c_merge": ("brief.py", "        if out and a <= out[-1][1]:\n", "        if False:\n", {"c_ranges"}, "重なる区間をまとめない"),
    "c_leak": ("brief.py", "            if any(n[i:i + k] in body for i in range(len(n) - k + 1)):\n", "            if False:\n",
               {"c_leak"}, "雛形が対照の行を引いても見逃す"),
    "w_title": ("brief.py", "    if title:\n", "    if False:\n", {"w_fixed"}, "題の札を作文者の1枚に書かない"),
    # 本編集の1枚
    "e_item": ("brief.py", "    items = edit_items(led)\n", "    items = edit_items(led)[1:]\n", {"e_ledger"},
               "帳面の画の項目を1つ落とす"),
    "e_machine": ("brief.py", "    machine = [it for it in items if check_only(it)]\n", "    machine = []\n", {"e_check"},
                  "検査が落とす項目も全文で渡す"),
    "e_line": ("brief.py", "    for i, (ln, r) in enumerate(zip(c.lines, rows), 1):\n",
               "    for i, (ln, r) in enumerate(zip(c.lines[:-1], rows), 1):\n", {"e_lines"}, "原稿の1行を表から落とす"),
    "e_real": ("brief.py", '    real = edit_rows(files["指示書"], len(c.lines))\n', "    real = None\n", {"e_secs"},
               "前の版の指示書の秒を使わない"),
    "e_scope": ("brief.py", "        if pattern and owner and owner != pattern:\n", "        if False:\n", {"e_plan"},
                "ほかの案の節まで名指す"),
    "e_axis": ("brief.py", '    axis = re.findall(r"\\d+:=(" + VID.pattern + ")", note)\n', "    axis = []\n", {"e_streams"},
               "時間軸の割り当てを見ずに、_note の videoId を全部拾う"),
    "e_pickv": ("brief.py", "            ep = max(vers, key=lambda d: int(d.name[1:]))\n",
                "            ep = min(vers, key=lambda d: int(d.name[1:]))\n", {"e_pick"}, "いちばん古い版を選ぶ"),
    "e_stale": ("brief.py", "    if stale:\n", "    if False:\n", {"e_cmds"}, "雛形の古い呼び出しを見逃す"),
    "e_tts": ("brief.py", '        t = r.get("tts_text") or r["line"]\n', '        t = r["line"]\n', {"e_voice"},
              "声に渡す字を、かなに直した字でなく字幕の字にする"),
    "e_origv": ("brief.py", '        if r.get("orig_voice"):  # 元の声の行（帳面 F-051）\n',
                '        if False:  # 元の声の行（帳面 F-051）\n', {"e_voice"}, "元の声の行の声まで Fish で作らせる"),
    "e_name": ("brief.py", '    while f"{head}{v}" in used:\n', "    while False:\n", {"e_name"},
               "頼んだことのある書き出しの名前を勧める"),
    "e_hist": ("brief.py", '"log", "--full-history", "--format=", "--name-only", "--",\n', '"log", "--format=", "--name-only", "--",\n',
               {"e_name"}, "担当の枝で足して下ろした書き出しの依頼を、既定の省略のまま数えない"),
    "e_seal": ("brief.py", 'SHEETS = re.compile(r"/sheets\\.enc(\\.\\d{3})?$")\n', 'SHEETS = re.compile(r"$^")\n', {"e_clips"},
               "コマ一覧の小さな封を見分けない"),
}

VIDEOS = ROOT / "shorts/videos"
FR = VIDEOS / "france-2025/p1"
OTHERS = {"銅像": "CKJvprUMOgA", "地下鉄": "nGgoJ753rBw", "城塞": "TDArug_te90"}
_MEMO: dict = {}


def edit_brief(B, ep: str, pattern: str | None = None) -> str:
    """1枚を組む（足ごとに同じ回を何度も組まない。対照の子はプロセスが別なので、覚えは混ざらない）。"""
    k = (id(B), ep, pattern)
    if k not in _MEMO:
        _MEMO[k] = B.build_edit_brief(Path(ep), pattern, "", None, None)
    return _MEMO[k]


def has_id(block: str, fid: str) -> bool:
    return re.search(rf"(?<![\d-]){fid}(?!\d)", block) is not None


def setup(cut):
    """対照の子では、外す字のある道具を先に読み込む。brief.py は `import ledger`・`import lint` で、読み込み済みのものを使う。"""
    c = CUTS[cut] if cut else None
    if c and c[0] == "ledger.py":
        legs.load(HERE.parent / "feedback/ledger.py", "ledger", (c[1], c[2]))
    if c and c[0] == "lint.py":
        legs.load(HERE / "lint.py", "lint", (c[1], c[2]))
    return once_lint(legs.load(HERE / "brief.py", "brief", (c[1], c[2]) if c and c[0] == "brief.py" else None))


def once_lint(B):
    """批評役の1枚の lint（lint.py を子のプロセスで起こす。1回 0.1秒あまり）を、同じ字の原稿・spec では1度だけにする。

    対照の子は足を全部回し直すので、1本の子が同じ原稿で lint を10回起こしていた（違う字は4つ）。2026-11-12 に対照を足して
    回し役の1本の上限（300秒）の8割に届いたので、ここで畳む。子のプロセスの lint は外した字を読まない（対照は読み込んだ
    道具にだけ当たる）ので、畳んでも足の結果は変わらない。
    """
    real, memo = B.lint_block, {}

    def lint_block(script, spec, as_of=None):
        sp = spec or B.lint_mod.spec_for(script)   # spec を渡さなければ、lint は原稿の隣の spec を読む
        k = (script.read_text(encoding="utf-8"), sp.read_text(encoding="utf-8") if sp.exists() else None, as_of)
        if k not in memo:
            memo[k] = real(script, spec, as_of)
        return memo[k]
    B.lint_block = lint_block
    return B


# 帳面のどの直しの例も引いていない原稿（批評役の1枚で、例が伏せられないことを見る）
NEUTRAL = ["スイスに来たら、牛のほうが多かった！", "みんなは？"]


def card_part(block: str, fid: str) -> str:
    """カードの塊のうち、その ID の1枚ぶん（見出しから次の見出しまで）。"""
    if f"### {fid} " not in block:
        return ""
    return block.split(f"### {fid} ", 1)[1].split("\n### ", 1)[0]


def leg_cards(B):
    led = B.ledger_mod.load()
    ids = B.card_ids()
    cats = ("題", "言い回し", "事実", "構成")

    def names_stage(it):
        # 当てる場所が原稿の段（lint・批評役・書く段）を名指すか。選ぶ側（ledger.for_script）とは別に、帳面の字から読む
        return bool(re.search(r"`lint:|批評役|書く段", it.place))
    script_cats = [it.id for it in led.items.values() if it.category in cats]
    staged = [it.id for it in led.items.values() if it.category not in cats and names_stage(it)]
    other = [it.id for it in led.items.values() if it.category not in cats and not names_stage(it)]
    block = B.cards()
    return [(f"題・言い回し・事実・構成の {len(script_cats)} 項目が全部入る", bool(script_cats) and all(i in ids for i in script_cats)),
            (f"分類は別でも原稿の段を名指す {len(staged)} 項目（F-014 画・F-019 音・F-050 進め方ほか）と、帳面の外の X2 も入る",
             {"F-014", "F-019", "F-050"} <= set(staged) and all(i in ids for i in staged) and "X2" in ids),
            # 作文者が spec の題の行の画を決めるので、当てる場所に書く段を足した（2026-11-13）
            ("F-073（題の札の行も、題の前半・後半で画を割る。分類は画）は、当てる場所が書く段なので入る", "F-073" in staged and "F-073" in ids),
            ("F-044（往復の上限）・画や音だけの項目（F-012・F-028 ほか）は入らない",
             "F-044" in other and "F-012" in other and not any(i in ids for i in other)),
            (f"1枚に、全部の ID の見出しが1枚ずつ（{len(ids)}枚）", all(block.count(f"### {i} ") == 1 for i in ids))]


def flat(s):
    return re.sub(r"\s+", " ", s or "").strip()


def leg_full(B):
    led = B.ledger_mod.load()
    writer = B.cards()
    critic = B.cards(avoid=NEUTRAL)
    bad_rule = [it.id for it in led.items.values() if it.id in B.card_ids() and flat(it.fields["決まり"]) not in card_part(writer, it.id)]
    bad_fix = [it.id for it in led.items.values()
               if it.id in B.card_ids() and flat(it.fields["直す前 → 直した後"]) not in card_part(writer, it.id)]
    f047 = flat(led.items["F-047"].fields["決まり"])
    return [("作文者の1枚: 決まりが帳面の字と1字も違わずに入る" + (f" ← {bad_rule}" if bad_rule else ""), not bad_rule),
            ("作文者の1枚: 直す前 → 直した後が全部の組で入る（最初の1組で切らない）" + (f" ← {bad_fix}" if bad_fix else ""), not bad_fix),
            ("いちばん長い F-047 の決まり（400字を越える）も切らない", len(f047) > 400 and f047 in card_part(writer, "F-047")),
            ("批評役の1枚も同じ全文（いま見る原稿の行を引いていない項目）", f047 in card_part(critic, "F-047")
             and flat(led.items["F-031"].fields["直す前 → 直した後"]) in card_part(critic, "F-031"))]


def leg_replaced(B):
    led = B.ledger_mod.load()
    block = B.cards()
    olds = {"F-043": "別の字でよい", "F-004": "足りないところだけ同じ口調で足す", "F-035": "少なく"}
    return [(f"{fid} の置き換わった字「{old}」がカードに出ない（帳面の「置き換わった」には残る）",
             old not in card_part(block, fid) and old in led.items[fid].fields.get(B.ledger_mod.REPLACED, ""))
            for fid, old in olds.items()] + [("「置き換わった」の欄は1枚に出さない", "置き換わった" not in block)]


def leg_grows(B):
    led = B.ledger_mod.load()
    text = B.ledger_mod.PATH.read_text(encoding="utf-8")
    add = ("### F-998 見張り用の決まり（足した項目）\n\n- **言われた:**\n  - 2026-10-21 チャット（見張り）\n- **分類:** 構成\n"
           "- **あやとの言葉:**\n  > 見張り\n- **決まり:** する — 見張り。しない — 無い\n- **直す前 → 直した後:** 前 → 後\n"
           "- **当てる場所:** 批評役 (h)\n\n## 指摘ではないコメント")
    led2 = B.ledger_mod.parse(text.replace("## 指摘ではないコメント", add, 1))
    return [("足した F-998 がカードに入る（決まりの全文つき）", "見張り。しない — 無い" in card_part(B.cards(led2), "F-998")),
            ("足す前は入っていない", "F-998" not in B.cards(led))]


def leg_holdout(B):
    p2 = (FIX / "rejected/CKJvprUMOgA_p2_17/script.txt").read_text(encoding="utf-8").splitlines()
    other = NEUTRAL
    hidden = "いま見る原稿の行を引いているので"

    def ex(block, fid):
        return hidden not in card_part(block, fid)
    ng = (FIX / "rejected/VusdZVyjgjQ_p1/script.txt").read_text(encoding="utf-8").splitlines()
    ok = (FIX / "approved/VusdZVyjgjQ_p1/script.txt").read_text(encoding="utf-8").splitlines()
    led = B.ledger_mod.load()
    return [("銅像 p2 を見るときは、F-039 の例（銅像の行そのもの）を伏せる", not ex(B.cards(avoid=p2), "F-039")),
            ("ほかの原稿では F-039 の例を残す", ex(B.cards(avoid=other), "F-039")),
            ("伏せても、決まり（全文）は残す", flat(led.items["F-039"].fields["決まり"]) in card_part(B.cards(avoid=p2), "F-039")),
            ("フォカッチャの下書きと添削版を見るときは、F-047 の例（どちらの行も引いている）を伏せる",
             not ex(B.cards(avoid=ng), "F-047") and not ex(B.cards(avoid=ok), "F-047")),
            ("ほかの原稿では F-047 の例を残す", ex(B.cards(avoid=other), "F-047")),
            ("作文者の1枚（avoid なし）では伏せない", hidden not in B.cards())]


def leg_ranges(B):
    with tempfile.TemporaryDirectory() as td:
        p = Path(td) / "x.transcript.txt"
        p.write_text("# 頭\n[0:00:00] a\n[0:00:30] b\n[0:01:00] c\n[0:01:30] d\n[0:02:00] e\n", encoding="utf-8")
        got = B.cut(p, B.parse_ranges(["0:00:50-0:01:20"]))
    return [("0:00:50〜0:01:20 に掛かる30秒の行（0:00:30・0:01:00）だけ", [g.split("] ")[1] for g in got] == ["b", "c"])]


def leg_fill(B):
    try:
        B.fill("<!-- ここから下が、担当に渡る字 -->\n{{a}} {{b}}", {"a": "x"})
        stopped = False
    except KeyError:
        stopped = True
    return [("{{b}} が残れば止まる", stopped), ("全部埋めれば通る", B.fill("{{a}}", {"a": "x"}) == "x")]


def leg_ayato(B):
    return [("「あやとの題（#977）」に【あやと】", "【あやと】" in B.marks({"why": "あやとの題（#977 2026-10-21）"})),
            # issue の番号を挟む形（2026-11-13、パソコン p2 の題の行。spec の why の字のまま）
            ("「あやと #1187 の題」に【あやと】", "【あやと】" in B.marks({"why": "題の札をそのまま読む（あやと #1187 の題）"})),
            ("「あやと #1187 の骨」に【あやと】", "【あやと】" in B.marks({"why": "【足】【答】配信に無い結末（11/11 以降）。あやと #1187 の骨。"})),
            ("「あやと #975「日本の三倍や！…」」に【あやと】", "【あやと】" in B.marks({"why": "あやと #975「日本の三倍や！とかでいいんじゃ無い？」"})),
            ("「あやとの添削（#1014）」に【あやと】", "【あやと】" in B.marks({"why": "あやとの添削（#1014 2026-10-23）。2:47:30「ちょっと待つわ」"})),
            ("言い換え「あやとの言葉 #976 を、まとめ役が言い換えた」には付けない",
             "【あやと】" not in B.marks({"why": "題（あやとの言葉 #976 を、まとめ役が言い換えた案 B）"})),
            ("【足】も印になる", B.marks({"why": "【足】ツッコミ"}) == "【足】"),
            ("配信の本人の声を流す行（orig_voice）に【元の声】（F-051）", B.marks({"why": "0:10:20 叫び", "orig_voice": "0:10:18〜0:10:21"}) == "【元の声】")]


# ---------- 批評役の1枚の配信の字幕（#1014、F-047） ----------

VUSD_NG = FIX / "rejected/VusdZVyjgjQ_p1/script.txt"
SOURCE_HEAD = "配信の字幕（原稿が使った場面）"


def leg_c_source(B):
    with_ = B.build_critic(VUSD_NG, None, [], "x", "VusdZVyjgjQ")
    without = B.build_critic(VUSD_NG, None, [], "x")
    part = with_.split(SOURCE_HEAD, 1)[1].split("\n## ", 1)[0] if SOURCE_HEAD in with_ else ""
    return [("--video で、作文者が根拠に挙げた 2:44:00 の字幕の行が入る", "[2:44:00]" in part),
            ("挙げていない 1:00:00 の行は入らない", "[1:00:00]" not in part),
            ("--video が無ければ「渡していない」と書く", "配信の字幕は渡していない" in without and "[2:44:00]" not in without)]


def leg_c_ranges(B):
    rows = [{"why": "2:39:30「くそ」＋2:40:00「挽回」"}, {"why": "根拠なし", "src": ["2:49:53.7"]}, {"why": "【足】"}]
    got = B.cited_ranges(rows)
    return [("2:39:30 と 2:40:00 は前後30秒で重なるので1つにまとめる", got[:1] == [(B.hms("2:39:00"), B.hms("2:40:30"))]),
            ("src の「2:49:53.7」も読む", (B.hms("2:49:23"), B.hms("2:50:23")) in got),
            ("時刻の無い行からは区間を作らない（全部で2つ）", len(got) == 2)]


def leg_c_leak(B):
    body = B.CRITIC_TMPL.read_text(encoding="utf-8").split(B.MARK, 1)[-1]
    fab = body + "\n例: 1,200億かけて、中身スカスカやないかい！\n"
    try:
        B.build_critic(VUSD_NG, None, [], "x")
        stopped = False
    except KeyError:
        stopped = True
    return [("いまの雛形は、対照の行を引いていない（終わりの形「アーカイブ見てね」は数えない）", not B.leaks(body)),
            ("銅像 p2 の行をこしらえて足すと拾う", "CKJvprUMOgA_p2_17" in {n for n, _ in B.leaks(fab)}),
            ("いまの雛形なら1枚は作れる（止まらない）", not stopped)]


def leg_c_cards(B):
    text = B.build_critic(VUSD_NG, None, [], "x")
    ids = B.card_ids()
    line = [ln for ln in text.splitlines() if ln.startswith("当てる ID:")]
    return [(f"批評役の1枚に、カード {len(ids)} 枚の見出しが全部ある", all(f"### {i} " in text for i in ids)),
            ("「当てる ID」の並びに、全部の ID がある", bool(line) and all(i in line[0] for i in ids))]


def leg_rows_stop(B):
    with tempfile.TemporaryDirectory() as td:
        sc = Path(td) / "script.txt"
        sc.write_text("題\nみんなは？\n", encoding="utf-8")
        (Path(td) / "spec.json").write_text(json.dumps({"title_card": "題", "lines": [{"line": "題"}, {"line": "みんなは？"}]},
                                                       ensure_ascii=False), encoding="utf-8")
        try:
            B.build_critic(sc, None, [], "x")
            err = ""
        except ValueError as e:
            err = str(e)
    return [("spec が rows でなく lines で書いてあれば、批評役の1枚を作らずに止まる（lines と言う）", "lines" in err)]


def leg_w_fixed(B):
    t = "海外キッチンで\nまさかの事態に！"
    w = B.build_writer(None, [], [], "x", 3, False, [], t, "本日22時")
    bare = B.build_writer(None, [], [], "x", 3, False, [])
    drop = B.build_writer(None, [], [], "x", 3, False, [], "🇬🇪ジョージアで滝観に行こうと思ったら大惨事に！")
    fixed = B.build_writer(None, [], [], "x", 3, False, [], "🇬🇪ジョージアで滝を観に行こうと思ったら大惨事に！")
    return [("--title の札を「1行目はそのまま読む」と書く", "1行目は、この札の字をそのまま読む" in w and "海外キッチンで ／ まさかの事態に！" in w),
            ("--next の時刻を「最後の行で言う」と書く", "本日22時" in w and "この時刻まで言う" in w),
            ("表の1行目に札の字（改行を外して）が入る", "| 1 | 題の札をそのまま読む | 海外キッチンでまさかの事態に！ |" in w),
            ("札に助詞の抜け（滝観に）があれば、直す字（滝を観に）と一緒に書く（F-049）", "「滝観に行」→「滝を観に行」" in drop),
            ("直した札には書かない", "助詞の抜けがある" not in fixed),
            ("表は4欄で、4欄目が「選んだ理由」（あやと #1019「なぜそれを選んだか理由付きで」）",
             "| # | 元の出来事（配信の時刻） | 見る人に届く文（読み上げる字） | 残した本人の言葉 | 選んだ理由 |" in w),
            ("無ければ「指定なし」", "（指定なし。" in bare)]


def fake_streams(B, td: Path):
    """本物の配信の代わりに、字幕とチャットの写しを置く（チャットの字は、こしらえたもの）。"""
    d = td / "2026/08"
    d.mkdir(parents=True)
    (d / "2026-08-04_2159_ZZZZZZZZZZ1.transcript.txt").write_text(
        "[0:00:00] ここはポチだらけの草原です。\n[0:00:30] いま配信のコメントで道を教えてもらいました。こしらえたチャットの本文その一。\n"
        "[0:01:00] 水が多すぎて渡れへん。\n",
        encoding="utf-8")
    (d / "2026-08-04_2159_ZZZZZZZZZZ1.chat.txt").write_text(
        "[0:00:10] みはりやく: こしらえたチャットの本文その一\n[0:00:40] ¥500 みはりやく: こしらえたチャットの本文その二\n", encoding="utf-8")
    # 読み上げの伏せ字を当てる2本目（`w_read`・`w_multi`・`c_multi`・`c_extra`）。字幕もチャットも、こしらえた字
    (d / "2026-08-05_2200_Zzzzzzzzzz2.transcript.txt").write_text("# 見張りの回\n" + "\n".join(READ_TR) + "\n", encoding="utf-8")
    (d / "2026-08-05_2200_Zzzzzzzzzz2.chat.txt").write_text("\n".join(READ_CHAT) + "\n", encoding="utf-8")


# 読み上げの伏せ字の、こしらえた字幕（30秒ごと）とチャット。行の頭の時刻 → (伏せる所の数, 伏せたあとに残る本人の言葉)
READ_TR = [
    "[0:00:00] 今日はカレーを作ります。ここ最高やな。",
    "[0:00:30] 玉ねぎを切っていきます。",
    "[0:01:00] 鍋に油を入れて、",
    "[0:01:30] こうね。じっくり煮る。こうね、弱めにする。",               # 6字をそのまま（0:01:20 の書き込み）
    "[0:02:00] 一人で鍋を全部食べきった。もう少し待つ。",                 # かな ↔ 漢字（0:01:40）
    "[0:02:30] スープ全部飲みたい。いや、まだ熱い。",                     # ひらがな ↔ カタカナ・長音・句読点・絵文字の名前（0:02:20）
    "[0:03:00] よいしょ。ことこと煮込む。ことこと煮込む。いい感じ。",     # 1行に2回（0:02:50）
    "[0:03:30] 玉ねぎは飴色になるまで炒めると。へえ、そうなんや。",       # 長い書き込みの一部（0:03:20）
    "[0:04:30] ここ最高やな。",                                           # 本人が 0:00:00 に先に言った（0:04:10）
    "[0:05:00] 大丈夫？ほんまに大丈夫？おやすみなさい。",                 # 5字以下・挨拶（0:04:40・0:04:50）
    "[0:05:30] 火を止めた。混ぜるで。",                                   # 合う字が少ない（0:05:10）
    "[0:06:00] あとはじっくり煮る。",                                     # 0:01:20 の書き込みから4分あと
    "[0:06:30] この鍋でかい。ほんまにでかい鍋やなあ、びっくりしたわ。",   # 同じ行の前のほうで本人が先に言った（0:06:55）
    "[0:07:00] この鍋でかい。",
    "[0:07:30] 卵は半熟がいちばんうまい。せやな。",                       # 長い書き込みをそのまま（0:07:20。回をまたぐ足もここを見る）
    "[0:10:00] ずっと混ぜてたらいい感じになってきた。とろとろの卵。",     # 書き込み（0:08:41）から80秒を越えた所
    # 6字に満たない書き込み・頭だけ読んだ書き込み（めずらしい字。2026-11-12）。どの字も、この回のほかの所と1本目の回に無い
    "[0:11:30] ルウは甘口。ほな、そうしよか。",                           # 5字をそのまま（0:11:10）
    "[0:13:00] 隠し味はみそやって。ほんまに？",                           # 6字の頭4字・残りはかな ↔ 漢字（0:12:40）
    "[0:14:30] 鍋の底がな、まだ大丈夫や。",                               # 8字の半分だけ（0:14:10）
    "[0:16:00] 塩少々。ええ感じ。",                                       # 3字（0:15:40）
    "[0:17:00] 焦がし醤油でいこか。うん、焦がし醤油。",                   # 同じ行の前のほうで本人が先に言った5字（0:17:20）
    "[0:20:00] 火加減を見ながら、ゆっくり待ちます。ふっくら。",           # 4字の書き込み（0:18:50）から80秒を越えた所
    "[0:22:00] 玉ねぎは弱火でじっくりいためると甘い。ほんまや。",         # 長い書き込みの真ん中だけ、かな ↔ 漢字（0:21:40）
]
READ_CHAT = [
    "[0:01:20] @みはり1: じっくり煮る",
    "[0:01:40] @みはり2: ひとりで鍋を全部食べきった！",
    "[0:02:20] ¥300 @みはり3: すーぷ、全部飲みたーい:smiling_face:",
    "[0:02:50] @みはり1: ことこと煮込む",
    "[0:03:20] @みはり2: 玉ねぎは飴色になるまで炒めるとコクが出て甘くなるよ",
    "[0:04:10] @みはり3: ここ最高やな",
    "[0:04:40] @みはり1: 大丈夫？",
    "[0:04:50] @みはり2: おやすみなさい:sparkles:",
    "[0:05:10] @みはり3: 火を止めてからゆっくり混ぜてね",
    "[0:06:55] @みはり1: この鍋でかい",
    "[0:07:20] @みはり3: 卵は半熟がいちばんうまい",
    "[0:08:41] @みはり2: とろとろの卵",
    "[0:11:10] @みはり1: ルウは甘口",
    "[0:12:40] @みはり2: 隠し味は味噌ｗｗ",
    "[0:14:10] @みはり3: 鍋の底が焦げてる",
    "[0:15:40] @みはり1: 塩少々",
    "[0:17:20] @みはり2: 焦がし醤油",
    "[0:18:50] @みはり3: ふっくら",
    "[0:21:40] @みはり1: 玉ねぎは弱火でじっくり炒めると甘い",
]
READ_WANT = {
    "0:01:30": (1, "こうね。〔コメントの読み上げ〕。こうね、弱めにする。"),
    "0:02:00": (1, "〔コメントの読み上げ〕。もう少し待つ。"),
    "0:02:30": (1, "〔コメントの読み上げ〕。いや、まだ熱い。"),
    "0:03:00": (2, "よいしょ。〔コメントの読み上げ〕。〔コメントの読み上げ〕。いい感じ。"),
    "0:03:30": (1, "〔コメントの読み上げ〕。へえ、そうなんや。"),
    "0:07:30": (1, "〔コメントの読み上げ〕。せやな。"),
    "0:11:30": (1, "〔コメントの読み上げ〕。ほな、そうしよか。"),
    "0:13:00": (1, "〔コメントの読み上げ〕やって。ほんまに？"),
    "0:22:00": (1, "〔コメントの読み上げ〕。ほんまや。"),
}
PLAIN = "〔コメントの読み上げ〕。せやな。"   # 0:07:30 の伏せたあと（字数の下限・合いかた・窓のどれを動かしても変わらない所）


def with_streams(B, fn):
    real = B.STREAMS
    try:
        with tempfile.TemporaryDirectory() as td:
            fake_streams(B, Path(td))
            B.STREAMS = Path(td)
            return fn()
    finally:
        B.STREAMS = real


def leg_w_order(B):
    w = with_streams(B, lambda: B.build_writer("ZZZZZZZZZZ1", ["0:00:00-0:01:30"], [], "x", 3, False, [], "題"))
    at = [w.find(h) for h in ("## 1. 約束のカード", "## 2. 何を作るか", "## 3. 方針", "## 4. 書く形", "## 5. 当て表", "## 6. 材料")]
    return [("約束のカード → 何を作るか → 方針 → 書く形 → 当て表 → 材料 の順", all(a >= 0 for a in at) and at == sorted(at)),
            ("カードが1枚の先頭（最初の見出し）", w.find("## ") == at[0]),
            ("字幕はいちばん後ろの「材料」の節にだけある", w.find("[0:00:00]") > at[-1])]


def leg_w_nochat(B):
    w = with_streams(B, lambda: B.build_writer("ZZZZZZZZZZ1", ["0:00:00-0:01:30"], [], "x", 3, False, [], "題"))
    try:
        with_streams(B, lambda: B.build_writer("ZZZZZZZZZZ1", ["0:00:00-0:01:30"], [], "x", 3, True, [], "題"))
        stopped = False
    except ValueError:
        stopped = True
    return [("同じ区間にチャットがあっても、本文は1行も入らない", "こしらえたチャットの本文" not in w and "みはりやく" not in w),
            ("本人が読み上げて字幕に入ったコメントは〔コメントの読み上げ〕に伏せ、伏せた数を書く",
             "〔コメントの読み上げ〕" in w and "コメント 1 か所は" in w),
            ("--chat を渡すと止まる（F-048）", stopped)]


def read_lines(B) -> dict:
    """こしらえた2本目の字幕を、伏せ字を当てて {時刻: 行の字}。"""
    got = with_streams(B, lambda: B.masked_lines("Zzzzzzzzzz2", [(0, 1800)]))[1]
    return {ln.split("]")[0].lstrip("["): ln.split("] ", 1)[1] for ln in got}


def leg_w_read(B):
    got = read_lines(B)
    src = {ln.split("]")[0].lstrip("["): ln.split("] ", 1)[1] for ln in READ_TR}
    kept = ("0:04:30", "0:05:00", "0:05:30", "0:06:00", "0:06:30", "0:07:00", "0:10:00", "0:14:30", "0:16:00", "0:17:00", "0:20:00")
    names = {"0:01:30": "6字をそのまま", "0:02:00": "かな ↔ 漢字（漢字の側まで）", "0:02:30": "ひらがな ↔ カタカナ・長音・句読点・絵文字の名前",
             "0:03:00": "1行に2回", "0:03:30": "長い書き込みの一部（切れ目なく12字）", "0:07:30": "長い書き込みをそのまま",
             "0:11:30": "5字のめずらしい字をそのまま", "0:13:00": "6字の頭4字（2/3）・末尾の笑いの w・残りのかな ↔ 漢字の端",
             "0:22:00": "長い書き込みの真ん中だけ、かな ↔ 漢字（切れ目の無い所は 2/3 に届かず、合う字は 3/4 を越える）"}
    why = {"0:04:30": "本人が前の行で先に言った字", "0:05:00": "3字と挨拶", "0:05:30": "合う字が少ない書き込み",
           "0:06:00": "書き込みから4分あと", "0:06:30": "同じ行の前のほうで本人が先に言った字", "0:07:00": "その続きの行",
           "0:10:00": "書き込みから80秒を越えた読み上げ", "0:14:30": "8字の書き込みの半分だけ（2/3 に届かない）",
           "0:16:00": "3字のめずらしい字（本人の受け答えと見分けがつかない）", "0:17:00": "同じ行の前のほうで本人が先に言った5字",
           "0:20:00": "4字の書き込みから80秒を越えた所"}
    return ([(f"伏せる: {names[t]}（{t}。{k} か所・前後の本人の言葉は残る）",
              got.get(t, "").count(B.READ_MARK) == k and got.get(t) == want) for t, (k, want) in READ_WANT.items()]
            + [(f"伏せない: {why[t]}（{t}）", got.get(t) == src[t]) for t in kept])


# クラムチャウダーの回（E2oGYjnVQSA）。1:11:29・1:16:48 の書き込みを、本人が 1:12:00・1:17:00 の行で読み上げた（2026-11-04 に
# 作文者が本人の言葉として原稿に入れた所）。本物の字幕とチャットで当てる。字は写さず、伏せた所の数と残りの字の数だけを見る
REAL = ("E2oGYjnVQSA", "1:11:00-1:18:00", ("1:12:00", "1:17:00"))


REAL_POSTS = (("1:11:29", "1:12:00"), ("1:16:48", "1:17:00"))   # 書き込みの時刻 → 読み上げた行


def leg_w_real(B):
    vid, rng, _ = REAL
    _, got, _ = B.masked_lines(vid, B.parse_ranges([rng]))
    rows = {ln.split("]")[0].lstrip("["): ln.split("] ", 1)[1] for ln in got}
    chat = {}
    for ln in B.stream_file(vid, "chat").read_text(encoding="utf-8").splitlines():
        m = B.TIME.match(ln)
        if m:
            chat.setdefault(f"{int(m.group(1))}:{m.group(2)}:{m.group(3)}", B.post_body(m.group(4)))
    out = []
    for at, t in REAL_POSTS:
        rest = B.folded(rows.get(t, "").replace(B.READ_MARK, "／"))
        b = chat.get(at, "")
        # 伏せ残りは、伏せる側（read_spans）とは別の物差しで見る: 書き込みと行の残りに、切れ目なく6字の同じ字があるか
        left = SequenceMatcher(None, b, rest, autojunk=False).find_longest_match(0, len(b), 0, len(rest)).size if b else 99
        out.append((f"{vid} の {at} の書き込みを {t} の行で読み上げた字が残らない（残った切れ目の無い字 {left}）・行の残りの本人の言葉は残る",
                    len(b) >= 6 and left < 6 and len(rest) >= 10))
    return out


def plain(text: str) -> str:
    """足の物差しで畳んだ字（絵文字の名前・記号・空白・長音・末尾の笑いの w を落とし、カタカナをひらがなに）。

    道具の `fold`・`post_body` を使わない。畳みかたを1つ外した対照で、足の物差しまで一緒に動くと、伏せ残りを見逃す
    （絵文字の名前を残す対照で、反応を残す足まで落ちた）。
    """
    s = unicodedata.normalize("NFKC", re.sub(r":[A-Za-z0-9_+\-]+:", "", text)).lower()
    s = "".join(chr(ord(c) - 0x60) if "ァ" <= c <= "ヶ" else c for c in s)
    return re.sub(r"(?<=[^\x00-\x7f])w+$", "", re.sub(r"[\W_ー]+", "", s))


def chat_at(B, vid: str) -> dict:
    """その回のチャットを {時刻: 足の物差しで畳んだ本文}（同じ秒は最初の1件）。字は比べるだけで、どこにも出さない。"""
    out = {}
    for ln in B.stream_file(vid, "chat").read_text(encoding="utf-8").splitlines():
        m = re.match(r"^\[(\d+):(\d\d):(\d\d)\]\s*(?:[¥$€£][\d,.]+\s+)?(?:[^:]*?: )?(.*)$", ln)
        if m:
            out.setdefault(f"{int(m.group(1))}:{m.group(2)}:{m.group(3)}", plain(m.group(4)))
    return out


def masked_rows(B, vid: str, rng: str) -> dict:
    """その回の字幕を区間で切って伏せ字を当て、{時刻: 行の字}。"""
    _, got, _ = B.masked_lines(vid, B.parse_ranges([rng]))
    return {ln.split("]")[0].lstrip("["): ln.split("] ", 1)[1] for ln in got}


# マトカ渓谷の回（eHBAnQF56-E）。6字の下限の下と「まるごと切れ目なく」の外で素通りし、2026-11-12 に C 案の原稿に2回入った読み上げ
# （と、同じ窓のもう1件）。書き込みの時刻 → 読み上げた行。字は写さない
SHORT = ("eHBAnQF56-E", "1:36:00-1:39:30",
         (("1:37:48", "1:38:00", "7字（末尾の笑いの w を除いて6字）の頭4字。続きは字幕が聞き違えた"),
          ("1:38:00", "1:38:00", "5字をそのまま、13秒あと"),
          ("1:38:52", "1:39:00", "5字をそのまま、32秒あと")))


def leg_w_short(B):
    vid, rng, posts = SHORT
    rows, chat = masked_rows(B, vid, rng), chat_at(B, vid)
    out = []
    for at, t, what in posts:
        b = chat.get(at, "")
        pieces = [plain(x) for x in rows.get(t, "").split(B.READ_MARK)]
        # 伏せ残りは、伏せる側（rare_spans）とは別の物差しで見る: 伏せ字で切れた残りの1切れずつと、書き込みとの切れ目の無い同じ字
        left = max((SequenceMatcher(None, b, x, autojunk=False).find_longest_match(0, len(b), 0, len(x)).size for x in pieces), default=99)
        out.append((f"{vid} の {at} の書き込み（{what}）を {t} の行で読み上げた字が残らない（残った切れ目の無い字 {left}）・"
                    f"行の残りの本人の言葉は残る", 4 <= len(b) <= 6 and left < 4 and sum(map(len, pieces)) >= 30))
    return out


# 同じ回で、4〜5字の書き込みと同じ字を、本人が書き込みのすぐあと（窓の中）で言った所。読み上げかもしれないが、本人の相づち・反応でもある。
# 書き込みの時刻 → 本人が言った行・残す理由。字は写さない
KEEP = ("eHBAnQF56-E", (("0:14:57", "0:15:00", "ありふれた4字の反応（本人のほかの回の1割を越える回に出る）"),
                        ("2:22:56", "2:23:00", "ありふれた5字の反応"),
                        ("2:58:59", "2:59:30", "ありふれた4字の擬音"),
                        ("1:24:33", "1:25:00", "本人がこの回のほかの所でも言う4字。ほかの回では1%以下")))


def leg_w_keep(B):
    vid, posts = KEEP
    chat, out = chat_at(B, vid), []
    _, got, _ = B.masked_lines(vid, B.parse_ranges([f"{t}-{t}" for _, t, _ in posts]))   # 行ごとに1回ずつ組まない（対照の子の数だけ回る）
    rows = {ln.split("]")[0].lstrip("["): ln.split("] ", 1)[1] for ln in got}
    for at, t, what in posts:
        b = chat.get(at, "")
        row = rows.get(t, "")
        kept = any(b in plain(x) for x in row.split(B.READ_MARK))
        out.append((f"{vid} の {at} の書き込み（{len(b)}字。{what}）と同じ本人の言葉が、{t} の行に伏せずに残る", 4 <= len(b) <= 5 and kept))
    return out


def leg_w_corpus(B):
    """ほかの回の字幕を畳んだ字の控え（一時置き場）は、字幕が同じあいだは使い、1本でも変われば読み直す。"""
    real, keep = B.STREAMS, None
    try:
        with tempfile.TemporaryDirectory() as td:
            d = Path(td) / "2026/08"
            d.mkdir(parents=True)
            for i in range(B.CORPUS_KEEP + 1):
                (d / f"2026-08-01_2200_K{i:010d}.transcript.txt").write_text("[0:00:00] ふつうの字。\n", encoding="utf-8")
            B.STREAMS = Path(td)
            keep = B.corpus_keep()   # こしらえた置き場の控え（本物の控えは消さない）
            B._CORPUS.clear()
            first = B.corpus()[0]
            head = keep.read_text(encoding="utf-8").split("\n", 1)[0] if keep.exists() else ""
            keep.write_text(f"{head}\n{first.replace('ふつう', 'ひかえ')}", encoding="utf-8")   # 控えだけを書き換える
            B._CORPUS.clear()
            used = B.corpus()[0]
            (d / "2026-08-01_2200_K0000000000.transcript.txt").write_text("[0:00:00] 書き足した字。\n", encoding="utf-8")
            B._CORPUS.clear()
            fresh = B.corpus()[0]
    finally:
        B.STREAMS = real
        B._CORPUS.clear()
        if keep:
            keep.unlink(missing_ok=True)
    return [(f"{B.CORPUS_KEEP + 1}本あれば控えを書き、字幕が同じあいだは控えを使う", bool(head) and "ひかえ" in used),
            ("字幕が1本でも変われば、控えを使わずに読み直す", "書き足した字" in fresh and "ひかえ" not in fresh)]


def leg_w_multi(B):
    vids = ["ZZZZZZZZZZ1", "Zzzzzzzzzz2"]

    def build(rng, n=3):
        return with_streams(B, lambda: B.build_writer(vids, rng, [], "x", n, False, [], "題"))
    w = build(["0:00:00-0:01:30", "Zzzzzzzzzz2@0:01:00-0:08:00"])
    src = w.split("## 6. 材料", 1)[-1]
    one = src.split("### ZZZZZZZZZZ1", 1)[-1].split("### Zzzzzzzzzz2", 1)[0]
    two = src.split("### Zzzzzzzzzz2", 1)[-1]
    try:
        build(["ZZZZZZZZZZ1@0:00:00-0:01:30"])   # 2本目の回の区間が無い
        stopped = False
    except ValueError:
        stopped = True
    rows = [ln for ln in w.split("## 4. 書く形", 1)[-1].split("## 5.", 1)[0].splitlines() if re.match(r"^\| \d+ \|", ln)]
    return [("2本の字幕が回ごとの見出しで入る（回を書かない区間は最初の回）", "[0:00:30]" in one and "[0:01:30]" in two
             and "### ZZZZZZZZZZ1（" in src and "### Zzzzzzzzzz2（見張りの回）" in src),
            ("2本目の回の読み上げも伏せる（0:07:30）", f"[0:07:30] {PLAIN}" in two),
            ("区間の無い回（Zzzzzzzzzz2）があれば止まる", stopped),
            (f"表の行の数は --lines の 3 のまま（伏せた数で上書きしない。いま {len(rows)}）", len(rows) == 3)]


def critic_with(B, rows: list, videos: list, extra: list | None = None) -> str:
    """こしらえた原稿と spec（rows）で批評役の1枚を組み、配信の字幕の節だけを返す。"""
    with tempfile.TemporaryDirectory() as td:
        sc = Path(td) / "script.txt"
        sc.write_text("題\nうまい！\nみんなは？\n", encoding="utf-8")
        spec = Path(td) / "spec.json"
        spec.write_text(json.dumps({"title_card": "題", "rows": rows}, ensure_ascii=False), encoding="utf-8")
        text = with_streams(B, lambda: B.build_critic(sc, spec, [], "x", videos, [], None, extra))
    return text.split(SOURCE_HEAD, 1)[-1]


MULTI_ROWS = [{"why": "0:00:30「道を教えてもらいました」", "visual": "草原"},
              {"why": "Zzzzzzzzzz2 0:01:30「じっくり煮る」", "src": ["Zzzzzzzzzz2@0:07:30"], "visual": "鍋"},
              {"why": "【足】問い", "visual": "顔"}]


def leg_c_multi(B):
    pts = B.cited_points(MULTI_ROWS, ["ZZZZZZZZZZ1", "Zzzzzzzzzz2"])
    both = critic_with(B, MULTI_ROWS, ["ZZZZZZZZZZ1", "Zzzzzzzzzz2"])
    named = critic_with(B, MULTI_ROWS, ["ZZZZZZZZZZ1"])
    two = both.split("### Zzzzzzzzzz2", 1)[-1]
    return [("回を書かない時刻は最初の回、「Zzzzzzzzzz2 0:01:30」「Zzzzzzzzzz2@0:07:30」は2本目",
             pts == {"ZZZZZZZZZZ1": [30], "Zzzzzzzzzz2": [90, 450]}),
            ("--video 2本で、回ごとの見出しの下に、その回の時刻の行が入る",
             "### ZZZZZZZZZZ1" in both and "[0:00:30]" in both.split("### Zzzzzzzzzz2", 1)[0] and "[0:01:30]" in two),
            ("2本目にも読み上げの伏せ字が効く", f"[0:07:30] {PLAIN}" in two),
            ("--video が1本でも、why で名指した回（Zzzzzzzzzz2）の字幕が入る", "### Zzzzzzzzzz2" in named and "[0:01:30]" in named)]


def leg_c_extra(B):
    with tempfile.TemporaryDirectory() as td:
        ex = Path(td) / "day2.txt"
        ex.write_text("[0:07:30] 卵は半熟がいちばんうまい。せやな。\n[0:07:40] 鍋を見る。\n", encoding="utf-8")
        named = critic_with(B, MULTI_ROWS[:1] + [{}, {}], ["ZZZZZZZZZZ1"], [f"Zzzzzzzzzz2={ex}"])
        bare = critic_with(B, MULTI_ROWS[:1] + [{}, {}], ["ZZZZZZZZZZ1"], [str(ex)])
    return [("--extra <videoId>=<道> の写しが入り、その回のチャットで伏せる", "day2.txt（Zzzzzzzzzz2 の写し。" in named
             and f"[0:07:30] {PLAIN}" in named and "[0:07:40] 鍋を見る。" in named),
            ("回を書かない写しは伏せず、「伏せていない」と書く", "伏せていない" in bare and "半熟がいちばんうまい" in bare)]


def leg_c_pending(B):
    rows = [{"why": "x", "visual": "【画は確認中】0:01:00 鍋の中"}, {"why": "x", "visual": "鍋の前の顔（画は確認中。顔が写ればぼかす）"},
            {"why": "x", "visual": "0:02:00 鍋をかき混ぜる手元"}]
    text = critic_with(B, rows, [])
    full = None
    with tempfile.TemporaryDirectory() as td:
        sc = Path(td) / "script.txt"
        sc.write_text("題\nうまい！\nみんなは？\n", encoding="utf-8")
        (Path(td) / "spec.json").write_text(json.dumps({"title_card": "題", "rows": rows}, ensure_ascii=False), encoding="utf-8")
        full = B.build_critic(sc, None, [], "x")
    table = [ln for ln in full.split("## 3. 原稿の表", 1)[-1].split("\n## ", 1)[0].splitlines() if re.match(r"^\| \d+ \|", ln)]
    h = full.split("### (h)", 1)[-1].split("\n### ", 1)[0]
    return [("画に「確認中」のある行に【画は確認中】の印（頭でも、括弧の中でも）",
             "【画は確認中】" in B.marks(rows[0]) and "【画は確認中】" in B.marks(rows[1]) and "【画は確認中】" not in B.marks(rows[2])),
            ("批評役の1枚の表の印の列に出る（1・2行目だけ）", [ln.rstrip(" |").endswith("【画は確認中】") for ln in table] == [True, True, False]),
            ("雛形の (h) に、F-014 は確認中の行を当てず、その回に無い画は「回に無い:」で挙げる線引き",
             "**F-014" in h and "【画は確認中】の行" in h and "「回に無い:」" in h and "渡していない" in text)]


def leg_w_ate(B):
    ids = B.card_ids()
    a = B.ate_template()
    table = a.split("```", 1)[0]
    skel = a.split("```json", 1)[1] if "```json" in a else ""
    return [(f"当て表の表に、カード {len(ids)} 枚の ID が1回ずつ", all(table.count(f"| {i} |") == 1 for i in ids)),
            ("spec の promises の形にも、全部の ID が1回ずつ", all(skel.count(f'"{i}"') == 1 for i in ids))]


def leg_w_watch(B):
    lines = ["[0:00:00] ここはポチだらけの草原です。", "[0:00:30] いま配信のコメントで道を教えてもらいました。",
             "[0:01:00] ボタンをポチっと押した。"]
    got = B.watch_block(lines)
    prev = B.watch_block(["[0:03:00] 先週は雨で流れたから、今日はリベンジや。", "[0:03:30] 昨日こねた生地を焼く。"])
    return [("字幕の呼び名「ポチ」を、時刻（0:00:00）と直す言葉（野良犬）つきで書く", "「ポチ」が 1 か所（0:00:00）" in got and "野良犬" in got),
            ("前の回の事情（先週）を、時刻（0:03:00）と L-PREV つきで書く。「昨日こねた」は数えない",
             "前の回・ほかの日の事情に触れている所が 1 か所（0:03:00「先週」）" in prev and "L-PREV" in prev and "前の回" not in got),
            ("「ポチっと」は数えない", "（0:01:00" not in got),
            ("コメントに触れた時刻（0:00:30）を書く", "0:00:30「コメント」" in got),
            ("伏せた読み上げ（〔コメントの読み上げ〕）は「読み上げ」として数え、印の中の「コメント」は数えない",
             "0:02:00「読み上げ」" in B.watch_block(["[0:02:00] それ〔コメントの読み上げ〕やな"])),
            ("字幕の文はそのまま写さない", "道を教えてもらいました" not in got and "草原です" not in got)]


PAIRS_FAKE = """# 差の表（見張り）

## 2. 種類

| 種類 | 向き | 帳面 | 作文者が自分で直す言い方 |
| --- | --- | --- | --- |
| みはり消す | 消す | F-056 | みはりの言い方その一 |
| みはり足す | 足す | 新 | みはりの言い方その二 |

## 4. 組ごとの差

### 一の回 — Xxxxxxxxxx1

| # | 種類 | こちらの案 | あやとの書き直し |
| ---: | --- | --- | --- |
| 1 | みはり消す | いちのかいのこちらのぎょう | （消す） |
| 2 | みはり足す・みはり消す | いちのかいのもとのぎょう | いちのかいのあやとのぎょう |

### 二の回 — Yyyyyyyyyy2・Wwwwwwwwww3

| # | 種類 | こちらの案 | あやとの書き直し |
| ---: | --- | --- | --- |
| 1 | みはり消す | にのかいのこちらのぎょう | にのかいのあやとのぎょう |
"""


def _norm8(s: str) -> str:
    return re.sub(r"[\s「」『』（）()…、。！？!?・ー〜,，【】／]", "", s)


def _windows(s: str, k: int = 8) -> set:
    # 題の決まり文句（F-071「まさかの事態に」）は、どの回の題にも出る型なので窓に数えない
    n = _norm8(s).replace("まさかの事態に", "|")
    return {w for w in (n[i:i + k] for i in range(len(n) - k + 1)) if "|" not in w}


def leg_w_pairs(B):
    with tempfile.TemporaryDirectory() as td:
        f = Path(td) / "rewrite_diff_2099-01-01.md"
        f.write_text(PAIRS_FAKE, encoding="utf-8")
        data = B.rewrites([f])
        bad = Path(td) / "rewrite_diff_2099-01-02.md"
        bad.write_text(PAIRS_FAKE.replace("| 1 | みはり消す | にのかい", "| 1 | 知らない種類 | にのかい"), encoding="utf-8")
        try:
            B.rewrites([bad])
            stopped = False
        except ValueError:
            stopped = True
    one = B.retouch_block(["Xxxxxxxxxx1"], data)
    two = B.retouch_block(["Wwwwwwwwww3"], data)
    both = B.retouch_block(["ZZZZZZZZZZ1"], data)
    kinds, pairs = B.rewrites()
    # あやとが残した行は「こちらの案」の欄があやとの字（2026-11-13 の2回目から）
    ayato = set().union(*(_windows(p["ayato"]) for p in pairs if not p["ayato"].startswith("（")),
                        *(_windows(p["ours"]) for p in pairs if p.get("kept")))
    tmpl = B.WRITER_TMPL.read_text(encoding="utf-8").split(B.MARK, 1)[-1]
    in_tmpl = sorted(w for w in ayato if w in _norm8(tmpl))
    in_say = sorted(w for w in ayato if any(w in _norm8(k["say"]) for k in kinds.values()))
    first = B.rewrite_counts(["ZZZZZZZZZZ1"], data)
    block = B.cards(first={"F-056": 3, "F-008": 5})
    heads = re.findall(r"^### (\S+) ", block, re.M)
    plain = re.findall(r"^### (\S+) ", B.cards(), re.M)
    w = with_streams(B, lambda: B.build_writer("ZZZZZZZZZZ1", ["0:00:00-0:01:30"], [], "x", 3, False, [], "題"))
    return [(f"本物の差の表が読める（種類 {len(kinds)}・組の行 {len(pairs)}）。どの組の行も videoId を持つ",
             bool(kinds) and bool(pairs) and all(p["videos"] for p in pairs)),
            ("いま書いている回（一の回）の行は「あやとの目で直す」に入らず、ほかの回（二の回）の行は入る",
             "いちのかい" not in one and "にのかいのあやとのぎょう" in one and "この回の組（一の回）は入れていない" in one),
            ("見出しの videoId のどれか1本（Wwwwwwwwww3）と重なっても、その組を外す", "にのかい" not in two and "いちのかいのあやとのぎょう" in two),
            ("重ならない回なら、両方の組が入る", "いちのかい" in both and "にのかい" in both and "入れていない" not in both),
            ("カードの並びの数も、いま書いている回の組を数えない（F-056: 3組ぶん → 一の回を外すと1）",
             first == {"F-056": 3} and B.rewrite_counts(["Xxxxxxxxxx1"], data) == {"F-056": 1}),
            ("種類の表に無い種類の組は止まる", stopped),
            ("カードは直された数の多い順に先頭へ（F-008 → F-056）、見出しに数が付く",
             heads[:2] == ["F-008", "F-056"] and "あやとの書き直しで5か所直された" in block),
            ("数を渡さなければ帳面の順（見出しに数が付かない）", plain[:1] == ["F-004"] and "書き直しで" not in B.cards()),
            ("雛形の字に、差の表のあやとの行（8字の窓）が無い" + (f" ← {in_tmpl[:3]}" if in_tmpl else ""), not in_tmpl),
            ("「種類」の表の言い方に、差の表のあやとの行（8字の窓）が無い" + (f" ← {in_say[:3]}" if in_say else ""), not in_say),
            ("作文者の1枚に「あやとの目で直す」の節と、カードの並びの数の行が入る",
             "### あやとの目で直す" in w and "直された数の多い順" in w and "{{" not in w)]


# 残した行の表（2026-11-13 の2回目）。一の回・二の回に1行ずつ、二の回には見かけの種類の無い「戻した字」も
STAY_FAKE = PAIRS_FAKE.replace("| 2 | みはり足す・みはり消す | いちのかいのもとのぎょう | いちのかいのあやとのぎょう |\n", """\
| 2 | みはり足す・みはり消す | いちのかいのもとのぎょう | いちのかいのあやとのぎょう |

あやとが残した行:

| # | 見かけ | こちらの案 | あやとの書き直し | 残る訳 |
| ---: | --- | --- | --- | --- |
| 1 | みはり消す | いちのかいののこしたぎょう | （そのまま） | いちのわけ |
""").replace("| 1 | みはり消す | にのかいのこちらのぎょう | にのかいのあやとのぎょう |\n", """\
| 1 | みはり消す | にのかいのこちらのぎょう | にのかいのあやとのぎょう |
| 2 | みはり足す | にのかいのたすまえ | にのかいのたしたあと |
""") + """
あやとが残した行:

| # | 見かけ | こちらの案 | あやとの書き直し | 残る訳 |
| ---: | --- | --- | --- | --- |
| 1 | みはり消す | にのかいののこしたぎょう | （そのまま） | にのわけ |
| 2 | — | にのかいのけずったじ | にのかいのもどしたじ | にのもどしたわけ |
"""


def _item(block: str, text: str) -> str:
    """「あやとの目で直す」の、text を含む例の行が属する種類の見出し（`N. **向き — 種類**`）。無ければ空。"""
    head = ""
    for ln in block.splitlines():
        if re.match(r"^\d+\. \*\*", ln):
            head = re.sub(r"^\d+\. \*\*(.+?)\*\*.*$", r"\1", ln)
        elif text in ln:
            return head
    return ""


def leg_w_stay(B):
    with tempfile.TemporaryDirectory() as td:
        f = Path(td) / "rewrite_diff_2099-01-01.md"
        f.write_text(STAY_FAKE, encoding="utf-8")
        data = B.rewrites([f])

        def stops(text):
            g = Path(td) / "rewrite_diff_2099-01-02.md"
            g.write_text(text, encoding="utf-8")
            try:
                B.rewrites([g])
            except ValueError:
                return True
            return False
        unknown = stops(STAY_FAKE.replace("| 1 | みはり消す | にのかいののこした", "| 1 | 知らない種類 | にのかいののこした"))
        spaced = stops(STAY_FAKE.replace("### 二の回 — ", "### 二の 回 — "))
    one = B.retouch_block(["Xxxxxxxxxx1"], data)
    counts = B.rewrite_counts(["ZZZZZZZZZZ1"], data)
    kinds, pairs = B.rewrites()
    kept = [p for p in pairs if p.get("kept")]
    church = B.retouch_block(["DNLVmUpew48"])
    matoka = B.retouch_block(["eHBAnQF56-E"])

    def tally(block):
        """（消す種類の、消した・直した例の数, 残した例と戻した字の数）"""
        cut = stay = 0
        head = ""
        for ln in block.splitlines():
            if re.match(r"^\d+\. \*\*", ln):
                head = ln
            elif ln.startswith("   - ") and ("**残した**" in ln or "**残す —" in head):
                stay += 1
            elif ln.startswith("   - ") and "**消す —" in head:
                cut += 1
        return cut, stay
    cut_n, stay_n = tally(church)
    order = [re.sub(r"^\d+\. \*\*(\S+) — .*$", r"\1", ln) for ln in one.splitlines() if re.match(r"^\d+\. \*\*", ln)]
    return [(f"本物の差の表に、あやとが残した行が {len(kept)} 行（10行以上）。どれも組の videoId を持つ",
             len(kept) >= 10 and all(p["videos"] for p in kept)),
            ("いま書いている回（一の回）の残した行は入らず、ほかの回（二の回）の残した行が、見かけの種類（みはり消す）の下に「残した」で入る",
             "いちのかいののこした" not in one and _item(one, "にのかいののこしたぎょう") == "消す — みはり消す"
             and "**残した**: 「にのかいののこしたぎょう」（二の回。にのわけ）" in one),
            ("見かけの種類の無い戻した字は「残す — 削りすぎ」にまとめ、消す種類のすぐあと（足す種類の前）に置く",
             _item(one, "にのかいのもどしたじ").startswith("残す — 削りすぎ") and order == ["消す", "残す", "足す"]),
            ("残した行は、カードの並びの「直された数」に数えない（F-056 は直された3組ぶんのまま）", counts == {"F-056": 3}),
            ("残した行の見かけに、種類の表に無い種類があれば止まる", unknown),
            ("組の見出しの形でない「### 」（名前に空白）のあとの表は、前の組のまま読まずに止まる", spaced),
            (f"本物で、教会を書くときの「残した」と戻した字（{stay_n}）は、消す種類の例（{cut_n}）と同じくらい（半分から2倍）",
             cut_n > 0 and cut_n / 2 <= stay_n <= cut_n * 2),
            ("教会を書くときは、教会の入り直しの景色（残した行）が入らず、マトカ渓谷を書くときは「答えのあとの行」の下に入る",
             "天井も壁も" not in church and _item(matoka, "天井も壁も") == "消す — 答えのあとの行"),
            ("パソコン p2 の戻した字（筋の段・助詞）が、教会を書くときの「残す — 削りすぎ」に入る",
             _item(church, "日本で買い替えて").startswith("残す — 削りすぎ") and _item(church, "安いらしいから").startswith("残す — 削りすぎ"))]


def leg_c_retouch(B):
    plain = B.build_critic(VUSD_NG, None, [], "x")
    sec = plain.split("### あやとの目で直す", 1)[1].split("\n## ", 1)[0] if "### あやとの目で直す" in plain else ""
    with tempfile.TemporaryDirectory() as td:
        sc = Path(td) / "script.txt"
        # 本物の差の表の残した行（十字架）と、直された行（パン3種のこちらの案）を、そのまま引いた原稿
        sc.write_text(f"{NEUTRAL[0]}\nカントリーマームに近いけど、サクサク！\n"
                      "でも僕は、入れすぎると生地が弱るって疑ってる！\nみんなは？\n", encoding="utf-8")
        quoted = B.build_critic(sc, None, [], "x")
    church = B.build_critic(VUSD_NG, None, [], "x", "DNLVmUpew48")
    qsec = quoted.split("### あやとの目で直す", 1)[1].split("\n## ", 1)[0] if "### あやとの目で直す" in quoted else ""
    return [("批評役の1枚の約束のカードのあとに「あやとの目で直す」の節があり、「残した」と、消す側で挙げない線引きが入る",
             bool(sec) and "**残した**" in sec and "消す側で挙げない" in sec and plain.find("### F-008 ") < plain.find("### あやとの目で直す")),
            ("いま見る原稿の行を引いていなければ、その例（十字架の残した行・パン3種の直した行）は出る",
             "カントリーマームに近い" in sec and "生地が弱るって疑ってる" in sec),
            ("いま見る原稿の行を引いている例は伏せ、伏せた数を書く",
             bool(qsec) and "カントリーマームに近い" not in qsec and "生地が弱るって疑ってる" not in qsec and "この1枚では伏せた" in qsec),
            ("--video の回（教会）の組は入れない（直した例「ゴリゴリにガチ勢」が、ほかの回では出て、教会では出ない）",
             "ゴリゴリにガチ勢" in sec and "ゴリゴリにガチ勢" not in church and "この回の組（教会）は入れていない" in church)]


# ---------- 本編集の1枚 ----------

def leg_e_ledger(B):
    block = B.edit_ledger_block()
    led = B.ledger_mod.load()
    want = [it.id for it in led.items.values() if it.category in ("画", "音", "投稿")]
    other = [it.id for it in led.items.values() if it.category in ("言い回し", "事実", "構成", "進め方")]
    text = B.ledger_mod.PATH.read_text(encoding="utf-8")
    add = ("### F-997 見張り用の決まり（足した画の項目）\n\n- **言われた:**\n  - 2026-10-21 チャット（見張り）\n- **分類:** 画\n"
           "- **あやとの言葉:**\n  > 見張り\n- **決まり:** する — 見張りの画。しない — 無い\n- **直す前 → 直した後:** 前 → 後\n"
           "- **当てる場所:** 人の目（見張り）\n\n## 指摘ではないコメント")
    led2 = B.ledger_mod.parse(text.replace("## 指摘ではないコメント", add, 1))
    return [(f"画・音・投稿の {len(want)} 項目が全部入る", len(want) > 0 and all(has_id(block, i) for i in want)),
            ("題の札の項目（F-015・F-030・F-043）が入る", all(has_id(block, i) for i in ("F-015", "F-030", "F-043"))),
            ("原稿の段・進め方の項目（F-031・F-039・F-044 ほか）は入らない", bool(other) and not any(has_id(block, i) for i in other)),
            ("足した画の項目 F-997 が、手で直さずに入る", "**F-997**" in B.edit_ledger_block(led2))]


def leg_e_check(B):
    block = B.edit_ledger_block()
    line = [ln for ln in block.splitlines() if ln.startswith("- 検査が見る")]
    return [("check: だけの F-013・F-027・F-028 は「検査が見る」の1行に名前だけ",
             bool(line) and all(i in line[0] for i in ("F-013", "F-027", "F-028"))
             and not any(f"**{i}**" in block for i in ("F-013", "F-027", "F-028"))),
            ("人の目が要る F-014・F-029 は「する」の1行つき",
             "**F-014**" in block and "**F-029**" in block and "する: 書き出したコマで行ごとに" in block)]


def table_rows(text: str) -> list:
    part = text.split("\n## 原稿", 1)[1].split("\n## ", 1)[0]
    return [r for r in part.splitlines() if re.match(r"^\| \d+ \|", r)]


def leg_e_lines(B):
    lines = B.lint_mod.read_script(FR / "script_A.txt")[0]
    rows = table_rows(edit_brief(B, str(FR), "A"))
    return [(f"原稿の {len(lines)} 行が全部・順に表に入る", [r.split(" | ")[2] for r in rows] == lines),
            ("表の行の数が原稿と同じ（13）", len(rows) == len(lines) == 13)]


def leg_e_secs(B):
    text = edit_brief(B, str(FR), "A")
    rows = table_rows(text)
    return [("1行目は指示書の実際の秒（0.0–3.9）とカット（2:14:47.0+2.77s）", rows and rows[0].startswith("| 1 | 0.0–3.9 |")
             and "2:14:47.0+2.77s" in rows[0]),
            ("4行目は指示書の 9.1–12.2秒", any(r.startswith("| 4 | 9.1–12.2 |") for r in rows)),
            ("行の数が原稿と違う指示書は使わない", B.edit_rows(FR / "edit_A.json", 12) is None)]


def leg_e_plan(B):
    text = edit_brief(B, str(FR), "A")
    where = text.split("## この回の置き場", 1)[1].split("\n## ", 1)[0]
    lines = (FR / "plan.md").read_text(encoding="utf-8").splitlines()
    b_at = next(i for i, ln in enumerate(lines) if ln.startswith("## B "))
    c_end = next(i for i, ln in enumerate(lines) if ln.startswith("## 確かめた事実"))
    heads = B.plan_heads(lines, "A")
    return [("A の節の「似た見た目」「本編集」を名指す", "似た見た目の続き（h7）" in where and "本編集（2026-10-21" in where),
            ("B・C の節の見出しは1つも拾わない", not any(b_at <= i < c_end for i, *_ in heads)),
            ("B の「書き出しへの指定」・C の「録画」を名指さない", "書き出しへの指定" not in where and "録画" not in where),
            ("素材は A の取り込みの表（コリウールの3区間）", "| コリウール | u64xGgMIvh4 |" in text),
            ("案の無い企画（銅像 p2）は見出しを全部見る",
             len(B.plan_heads((VIDEOS / "CKJvprUMOgA/p2/plan.md").read_text(encoding="utf-8").splitlines(), None))
             == sum(1 for ln in (VIDEOS / "CKJvprUMOgA/p2/plan.md").read_text(encoding="utf-8").splitlines() if B.HEAD.match(ln)))]


def leg_e_streams(B):
    spec = json.loads((FR / "spec_A.json").read_text(encoding="utf-8"))
    ids = B.stream_ids(FR, spec)
    return [("時間軸の8配信を、重ねずに", len(ids) == 8 == len(set(ids)) and ids[1] == "Lmk2lp9iFQ8"),
            ("「使わない」と書いた空港の回（n9FK4SYbcpA）は入れない", "n9FK4SYbcpA" not in ids),
            ("回の名前（france-2025）は videoId に数えない", "france-2025" not in ids)]


def leg_e_fill(B):
    text = edit_brief(B, str(FR), "A")
    return [("雛形の {{…}} が残らない", "{{" not in text), (f"2万字以下（{len(text):,}字）", len(text) <= B.EDIT_MAX),
            ("道の変数（V）に回の置き場が入る", "`V=shorts/videos/france-2025/p1`" in text and "$V/spec_A.json" in text)]


def leg_e_others(B):
    out = []
    for name, vid in OTHERS.items():
        try:
            text = edit_brief(B, f"shorts/videos/{vid}")
            _, sc, _ = B.pick(Path(f"shorts/videos/{vid}"), None)
            first = B.lint_mod.read_script(sc)[0][0]
            rows = table_rows(text)
            out.append((f"{name}の回（{vid}）: 落ちずに出て、{len(text):,}字・原稿の1行目が表に",
                        len(text) <= B.EDIT_MAX and bool(rows) and rows[0].split(" | ")[2] == first))
        except Exception as e:  # noqa: BLE001
            out.append((f"{name}の回（{vid}）: {type(e).__name__}: {e}", False))
    return out


def leg_e_pick(B):
    def stops(ep, pat):
        try:
            B.pick(Path(ep), pat)
            return False
        except FileNotFoundError as e:
            return "--pattern" in str(e)
    vdir, sc, sfx = B.pick(Path("shorts/videos/CKJvprUMOgA"), None)
    fv, fs, ff = B.pick(Path("shorts/videos/france-2025"), "A")
    return [("銅像は いちばん新しい版 p2 の script.txt", vdir.name == "p2" and sc.name == "script.txt" and sfx == ""),
            ("フランス A は p1 の script_A.txt", fv.name == "p1" and fs.name == "script_A.txt" and ff == "_A"),
            ("案が要る回で案が無い・無い案（Z）は止まる", stops("shorts/videos/france-2025", None) and stops("shorts/videos/france-2025", "Z"))]


def leg_e_cmds(B):
    def raises(t):
        try:
            B.check_tools(t)
            return False
        except KeyError:
            return True
    body = B.EDIT_TMPL.read_text(encoding="utf-8").split(B.MARK, 1)[1]
    return [("雛形の呼び出しは、今の道具と合う", not raises(body)),
            ("無い引数（build_edit.py --no-such-flag）は止まる", raises("`python3 tools/shorts/plan/build_edit.py x --no-such-flag`")),
            ("無い道具（tools/shorts/plan/no_such_tool.py）は止まる", raises("`python3 tools/shorts/plan/no_such_tool.py x`")),
            ("同じ行の別の道具の引数は通す（fish_web.py の --only・collect.py の --accept）",
             not raises("`fish_web.py gen … --only A/04` と `collect.py … --accept A/09=x`"))]


def leg_e_voice(B):
    spec = json.loads((FR / "spec_A.json").read_text(encoding="utf-8"))
    v = B.voice_lines(spec)
    bare = B.voice_lines({"id": "p1", "rows": [{"line": "みんなは？"}]})
    orig = B.voice_lines({"id": "p2", "rows": [{"line": "犬が来た。"}, {"line": "ああーっ！", "orig_voice": "0:10:24〜0:10:29"},
                                                 {"line": "沼や。"}]})
    return [("13文・key は A/01 から", len(v) == 13 and v[0]["key"] == "A/01" and v[-1]["key"] == "A/13" and v[0]["plan"] == "A"),
            ("声に渡す字は spec の tts_text（かなに直した字）", v[0]["tts_text"] == spec["rows"][0]["tts_text"] != spec["rows"][0]["line"]),
            ("字幕は行の字・bytes は UTF-8 のバイト数", v[0]["caption"] == spec["rows"][0]["line"]
             and all(x["bytes"] == len(x["tts_text"].encode("utf-8")) for x in v)),
            ("tts_text の無い行は、行の字をそのまま", bare[0]["tts_text"] == "みんなは？" and bare[0]["key"] == "p1/01"),
            ("元の声の行（F-051）は声を作らない（番号はそのまま欠ける）",
             [x["key"] for x in orig] == ["p2/01", "p2/03"] and "ああーっ！" not in [x["caption"] for x in orig])]


def fixture_env() -> dict:
    """足の小さな git を、箱の git の設定から切り離して動かす（CI の素の git と同じにする）。

    作業箱の ~/.gitconfig は commit に署名させる（commit.gpgsign・gpg.ssh.program=/tmp/code-sign）。署名は箱の外の口に
    頼むので、1回0.1秒かかり（1回の見張りで280回）、口が1回でも返事をしなければ commit が落ちて、守りと関係の無い
    e_clips・e_name が落ちる。対照の子でそれが起きると「その足だけが落ちる」が外れる（2026-10-26 に手元で1回外れた
    BREAK=holdout の見立て。落ちた足は残っていなかった）。
    受け継いだ GIT_*（フックの中から回すと付く GIT_DIR など）も外す。付いたままだと -C の置き場ではなくそちらを書き換える。
    """
    env = {k: v for k, v in os.environ.items() if not k.startswith("GIT_")}
    return {**env, "GIT_CONFIG_GLOBAL": os.devnull, "GIT_CONFIG_NOSYSTEM": "1",
            "GIT_AUTHOR_NAME": "t", "GIT_AUTHOR_EMAIL": "t@example.com",
            "GIT_COMMITTER_NAME": "t", "GIT_COMMITTER_EMAIL": "t@example.com"}


def git_fixture(td: Path) -> str:
    """作業枝の履歴の形だけを持つ git を作る。CI は浅い checkout（履歴1つ）なので、本物の履歴を当てにしない。

    担当の枝（side）で、書き出しの依頼 fra-a-v3 と、配信 DDDDDDDDDd4 の clips（古い形）を足してから下ろし、
    --no-ff で main に入れる。merge の片側で足して消えた道は、git log の既定の省略だと見えない。
    返すのは clips を足したコミット。
    """
    env = fixture_env()

    def git(*a):
        return subprocess.run(["git", "-C", str(td), *a], check=True, capture_output=True, text=True, env=env).stdout.strip()

    git("init", "-q", "-b", "main")
    (td / "README").write_text("x", encoding="utf-8")
    git("add", "README")
    git("commit", "-q", "-m", "0")
    git("checkout", "-q", "-b", "side")
    (td / "shorts/render").mkdir(parents=True)
    (td / "shorts/render/fra-a-v3.json").write_text("{}", encoding="utf-8")
    clips = td / "shorts/.work/DDDDDDDDDd4/clips"
    clips.mkdir(parents=True)
    for f in ("manifest.json", "key.enc", "payload.enc"):
        (clips / f).write_text("x", encoding="utf-8")
    git("add", "shorts")
    git("commit", "-q", "-m", "add")
    added = git("rev-parse", "HEAD")
    git("rm", "-q", "-r", "shorts")
    git("commit", "-q", "-m", "drop")
    git("checkout", "-q", "main")
    git("merge", "-q", "--no-ff", "-m", "merge", "side")
    return added


def leg_e_clips(B):
    real_root = B.ROOT
    try:
        with tempfile.TemporaryDirectory() as td:
            B.ROOT = Path(td)   # git の無い置き場に、作業枝の clips の形だけを作る
            for vid, files in (("AAAAAAAAAa1", ("manifest.json", "sheets.key.enc", "sheets.enc.000")),
                               ("BBBBBBBBBb2", ("manifest.json", "key.enc", "payload.enc"))):
                d = Path(td) / "shorts/.work" / vid / "clips"
                d.mkdir(parents=True)
                for f in files:
                    (d / f).write_text("x", encoding="utf-8")
            new, old, none = B.clips_state("AAAAAAAAAa1"), B.clips_state("BBBBBBBBBb2"), B.clips_state("CCCCCCCCCc3")
        with tempfile.TemporaryDirectory() as td:
            B.ROOT = Path(td)   # 下ろした clips は、履歴の形だけを持つ git で見る
            added = git_fixture(Path(td))
            got = B.clips_state("DDDDDDDDDd4")
    finally:
        B.ROOT = real_root
    return [("作業枝に小さな封（sheets.enc.000）が在れば「コマ一覧の封あり」", new == "作業枝に在る・コマ一覧の封あり"),
            ("mp4 の封だけなら「古い形」", old == "作業枝に在る・古い形"),
            ("どこにも無ければ「取り込みの記録が無い」", none == "取り込みの記録が無い"),
            (f"下ろした配信は、在った木のコミットを名指す（{got}）", got == f"下ろしてある（{added[:8]} の木に在る・古い形）")]


def leg_e_name(B):
    real_root = B.ROOT
    try:
        with tempfile.TemporaryDirectory() as td:
            B.ROOT = Path(td)
            git_fixture(Path(td))
            vdir = Path(td) / "shorts/videos/france-2025/p1"
            vdir.mkdir(parents=True)
            qa = vdir / "qa_A.md"
            qa.write_text("## 本編集（v1 → v2）\n", encoding="utf-8")   # 記録には v2 まで。作業枝ではもう v3 を頼んだ
            used = B.render_names()
            got = B.suggest_name(vdir, "A", qa)
    finally:
        B.ROOT = real_root
    return [("頼んだことのある書き出しの名前（担当の枝で足して下ろした fra-a-v3）を数える", "fra-a-v3" in used),
            (f"勧める名前（{got}）は、頼んだことのある名前を飛ばした次（fra-a-v4）", got == "fra-a-v4")]


LEGS = {
    "cards": leg_cards, "full": leg_full, "replaced": leg_replaced, "grows": leg_grows, "holdout": leg_holdout,
    "ranges": leg_ranges, "fill": leg_fill, "ayato": leg_ayato,
    "c_source": leg_c_source, "c_ranges": leg_c_ranges, "c_leak": leg_c_leak, "c_cards": leg_c_cards, "rows_stop": leg_rows_stop,
    "w_fixed": leg_w_fixed, "w_order": leg_w_order, "w_nochat": leg_w_nochat, "w_ate": leg_w_ate, "w_watch": leg_w_watch,
    "w_read": leg_w_read, "w_real": leg_w_real, "w_short": leg_w_short, "w_keep": leg_w_keep, "w_corpus": leg_w_corpus, "w_multi": leg_w_multi, "c_multi": leg_c_multi, "c_extra": leg_c_extra,
    "c_pending": leg_c_pending, "w_pairs": leg_w_pairs, "w_stay": leg_w_stay, "c_retouch": leg_c_retouch,
    "e_ledger": leg_e_ledger, "e_check": leg_e_check, "e_lines": leg_e_lines, "e_secs": leg_e_secs,
    "e_plan": leg_e_plan, "e_streams": leg_e_streams, "e_fill": leg_e_fill, "e_others": leg_e_others,
    "e_pick": leg_e_pick, "e_cmds": leg_e_cmds, "e_voice": leg_e_voice, "e_clips": leg_e_clips, "e_name": leg_e_name}


class _Tee:
    """出した字をそのまま流しつつ、控える。"""

    def __init__(self, real):
        self.real, self.seen = real, []

    def write(self, s):
        self.seen.append(s)
        return self.real.write(s)

    def flush(self):
        self.real.flush()

    def __getattr__(self, k):
        return getattr(self.real, k)


def main() -> int:
    """回し役（selftest_runner.py）は最後の1行しか出さない。対照が外れたら、どの足が落ちたかを最後の1行に載せる。

    前は「✕ 対照が外れた: holdout」としか残らず、どの足が余計に落ちたのかを後から読めなかった（2026-10-26）。
    """
    if os.environ.get("BREAK"):
        return legs.main(Path(__file__).resolve(), LEGS, CUTS, setup)
    tee, real = _Tee(sys.stdout), sys.stdout
    sys.stdout = tee
    try:
        rc = legs.main(Path(__file__).resolve(), LEGS, CUTS, setup)
    finally:
        sys.stdout = real
    missed = [re.sub(r"^(BREAK=\w+)（.*?）→", r"\1 →", ln.strip()[2:]) for ln in "".join(tee.seen).splitlines()
              if ln.strip().startswith("✕ BREAK=")]
    if missed:
        print("✕ 外れた対照の中身: " + " / ".join(missed))
    return rc


if __name__ == "__main__":
    sys.exit(main())
