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
| `approved/2EKBYEnv850_p1_v5` | 2026-11-25「ブラッシュアップ完璧だと思います」（#1441 の書き置き。温泉 v5 の L＝輪の版。spec は字・根拠・種類・開け閉め・画・本人の声だけ） | 今日（当て表 L-ATE は外す） |
| `approved/bg-boza_p1_v9` | 同じ（ボザ v9 の L の版） | 今日（当て表 L-ATE は外す） |

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
| `retired` | 2026-11-26（#1457）に退かせた4つ（当て表 L-ATE・15字に割る L-WIDE・2行目の前置き L-CLIFF・8秒までの数 L-NUM38）は、今日の決まりでは当てず「退かせた」と書く。退かせる前の日なら当てる（この4つの足は 2026-11-25 で当てる） |
| `approved` | 出してよいと言われた6本が、言われた時点の決まりで ✕ 0（城塞はコメントの時点、フォカッチャの添削版は添削の時点） |
| `later_rule_live` | ホステル p2 を 10-22 の決まりで当てると、T-FLAG だけが落ちる（承認のあとにできた決まりが効いている） |
| `miete` | 「地下鉄1回に見えてきた」を 15行目で拾う。「海が見えてきた！」は拾わない |
| `title_real` | 「銅像だらけの国で、僕まで銅像にされた」を拾う。あやとが書いた題4本（「海外キッチンで…」を含む）と、アプリの回の題は通す |
| `title_metaphor` | 「〜みたいだった」の題を拾う。あやとの題は通す。「〜に行ったら天国みたいな世界だった！」（#1451。本当にした行動のあとの気持ちのたとえ）は △ だけ |
| `flag` | 国旗が無い・違う国・国の名前の後ろ、を拾う。正しい旗と、国の名前が無い題は通す。「〜行きのバス」の行き先には旗を求めない（#1446 のあやとの題）。「ルーマニアに行ったら」には求める |
| `narrator` `phrase` `yen` | 10-16 に直された p1 の行（あやとは・本人いわく・だそうです／国を出る／280レク。約550円）を拾い、言い換えた行は通す |
| `length` | 391字で落ち、390字で通る |
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
| `desu` | 銅像 p2（17行）の10・12行目を △。城塞 p1 の「」の中の「閉まってますよ」は見ない。語の途中（「別茹でする」「別茹でした」「僕ですら」「ますます」）は拾わず、「茹でます」「〜なんです」「〜でした」は拾う（L-DESU） |
| `title_read` | フォカッチャの下書きの1行目（札と違う字）を ✕。あやとの添削版・城塞 p1（札は国旗と改行つき）は通す。札が無ければ「見ていない」。10-22 の決まりでは当てない（T-READ） |
| `next_time` | 下書きの最後「…配信見にきてね！」（時刻なし）を ✕。添削版（22時）は通す。spec の next_stream と違う時刻・「3時間」（時刻ではない）は ✕。アーカイブの1行・問いの終わりは見ない（L-NEXT） |
| `inner` | 滝の回 p1 の8行目「配信のコメントで…」・銅像 p2 の6行目・「チャットで」・題の札の「リスナー」を ✕。締めの問い・アーカイブ・次の配信への誘いは見ない。本人が人の動画に「コメントした（ら）」は見ず、「コメントしてくれた」「コメントした人」「みんながコメントしたら」「コメントしてね」は ✕（L-INNER） |
| `nick` | 滝の回 p1 の2・10・12行目「ポチ」を ✕。城塞 p1 の13行目は今日の決まりで ✕・承認の時点では当てない。「ポチっと」「ポチった」・直した「野良犬」は見ない。帳面に `呼び名「…」→「…」` を足すと辞書が増え、帳面に1つも無ければ「見ていない」（L-NICK） |
| `particle` | 題「滝観に」「ストックホルム来たら」を ✕（札が無ければ1行目を題として ✕）。直した題・「乗り放題」「花見に」「パリ行き」は見ない。行の「路線バス乗るの」は △ だけ（L-PARTICLE） |
| `ate` | 当て表（spec の promises）にカードの ID が全部あれば通る。1つ欠ける・note が「なし」・行の番号が原稿の外・promises が無い、をそれぞれ ✕。spec が無ければ「見ていない」（L-ATE） |
| `as_of_id` | `--as-of 2026-10-23:6354242835`（朝のフォカッチャの添削）では夕方の4規則を当てず、日付だけの T-READ・L-NEXT は当てる。夕方のコメントの時点・日付だけなら当てる |
| `spec_rows` | spec が `rows` でなく `lines` で書いてある・行の数が原稿と違う、なら当てずに止まる（何の鍵で書いてあるかを言う）。`--no-spec` なら当てる |
| `wide` | 16字の行は △、15字の行は何も出さない。数えかたは `build_edit.py` の `spoken_chars` と同じ（「ー」を数える。読み込んで突き合わせる）。1行目の題・本人の声の行（`orig_voice`・`voice_src`）は見ない。✕ にはしない（L-WIDE。仮説 N5） |
| `width_median` | 行の字数の中央値を1行で出す（題の1行目も入れ、本人の声の行は外す。偶数の行は真ん中2つの間）。L-WIDE を当てない日付でも出す |
| `prev` | 十字架の登山の原稿 A の4行目「先週は雨で流れたリベンジや！」と、行の途中の「前回の配信で」を ✕。フォカッチャの添削版の締め「リベンジにワンパンピザを本日22時から…」・問いの前の締めの行・題が「リベンジ」を言っている回の本文・1行目の題は見ない。「昨日こねた生地」は前の回の事情ではないので見ない。あやとの書き直し（「…十字架まで歩きたい！」）は通す。11-13 のコメントより前の決まりでは当てない（L-PREV） |
| `tenki` | 風邪の回 p4 の「今日は天気やから、外に出ることにした！」を ✕。あやとの直し「良い天気やから」は通す（L-TENKI。#1450・F-103） |
| `pickwhy` | 揚げパンの回 A の6行目「ヌテラは全部ヌテラ味になるから、蜂蜜ナッツにした。」と B の8行目「…ヌテラ味やから、蜂蜜ナッツにした。」を ✕。あやとの直し（行を消した12行）・頼んだ物だけの「蜂蜜ナッツにした。」・行の頭のつなぎ「だから、全部を歩ける島にした。」・題・締めは見ない。11-25 のコメントより前の時点では当てない（L-PICKWHY。#1447・F-056） |
| `hypo_link` | 規則はどれも、帳面の ID か仮説の台帳（`playbook.md`）の番号か出どころの issue（`#1403`）を持つ。台帳の番号は台帳の行にあり、その行が規則の名前を書いている。L-WIDE は帳面に足していない（あやとの指摘ではない）。L-RUN・L-ANSNEXT と 11-25 の5つ（L-CLIFF・T-HOOK・L-NUM38・L-VOICE0・L-BANG）は帳面にも台帳にも無く、出どころ #1403 だけを持つ |
| `run` | spec の行の種類（`kind`）で、出来事・引っ張り・数の無い行が3行続いたら3行目から △（前置き・説明・前置き → 4行目、反応・反応・味・味 → 8・9行目）。題の1行目・締めの行（最後の問い、問い → 誘いの問いの行も）は数えない。数は続きを切る。付録A の書きかた（題読み・値段・数・締めの問い）でも読む。種類の無い行・決まりに無い種類・開け閉めの字は △。どの行にも kind が無ければ「見ていない」。診断の付録A の屋根裏25人部屋の種類で、診断の「続」と同じ 8・9・10・17行目。✕ にはしない（L-RUN。#1403） |
| `ansnext` | 題の答え（【答】）の次が反応の行で、3秒のうちに次を開かなければ、その行を △。次がすぐ締め（問い・問い → アーカイブ・問い → 誘い）・出来事・引っ張り・turn に o（o・oc）なら出さない。短い反応（「わお、人がいっぱい！」）のあと3秒のうちに引っ張りが始まれば出さず、長い反応のあとなら出す。spec の why の【答】も読む。kind が無い・【答】が無ければ「見ていない」（L-ANSNEXT。#1403） |
| `cliff` | 題の直後の行（2行目）が前置きの決まり文句なら ✕: ヨーグルト「やってきたのは、…」・屋根裏「…へバス移動！」ほか、出した本の2行目7つ。出来事（「街なかの蛇口から、温泉が出てた。」）・頭が「まずは」でも「〜たら……」で終わる引っ張り・常識と逆の言い切り（IKEA）は通す。温泉 v5・ボザ v9 には当たらない。3行目より後は見ない（L-CLIFF。#1403 Q2・F-093） |
| `hook` | 題の行の画（spec の visual）の頭（最初の「→」「／」まで）がカード・横断歩道・青空なら △。頭が最中で写真が1.5秒目からなら通す。`hook` に「最中」と書けば通し、「景色」なら △。visual も hook も無ければ「見ていない」（T-HOOK。#1403 Q4） |
| `num38` | 題の直後から8秒（見込み）までに数（漢字の数も）が無ければ2行目に △。題の数は数えない。ボザ v9（4行目の1L）は通す（L-NUM38。#1403 Q5） |
| `voice0` | 0〜8秒（見込み）に本人の声（orig_voice）の行が無ければ △。4行目（7.7秒）なら通し、7行目だけなら出す。spec が無ければ「見ていない」（L-VOICE0。#1403） |
| `bang` | 山でない行の「！」が6行で △、5行は通す。題・【答】・本人の声・【大】の「！」は数えない（L-BANG。#1403） |
| `new_fixtures` | 温泉 v5・ボザ v9（`approved/2EKBYEnv850_p1_v5`・`approved/bg-boza_p1_v9`。あやと #1441「ブラッシュアップ完璧」）が今日の決まりで ✕ 0（当て表 L-ATE と、書く前の persona・baseline の L-BASE は控えに入れていないので外す。ボザの「捨てる覚悟で買った！」の L-BUY は、承認 11-25 のあとの F-102（11-26）なので外す） |
| `base` | spec に persona（ペルソナ3つのどれかを名指す）と baseline（5〜7行）があれば通す。persona が無い・3つのどれも名指さない・基本線が4行・8行なら ✕。spec が無ければ「見ていない」。11-26 のあやとのコメントより前の時点では当てない（L-BASE。#1446・F-099） |
| `voicen` | 本人の声（orig_voice・voice_src）の行が3つなら通し、2つなら △（✕ にはしない）。spec が無ければ「見ていない」（L-VOICEN。#1445・F-078） |
| `kind_turn` | spec の全部の行に種類（kind）と問いの開け閉め（turn）が決まりの字で無ければ ✕（L-KIND。2026-11-27、帳面 F-093 を控えから出した）。spec が無ければ「見ていない」 |
| `shape` | spec に回の型（shape）が無ければ ✕（L-SHAPE。帳面 F-052）。「配信」でない型の回には、配信の回の型の規則（終わりの問い・です調・語り手・題の札・次の配信）を当てず、ほかの規則は当てる |
| `gourmet` | グルメの回の題「行列店に並んだら、大当たりやった！」と「AIに聞いたら、名物は」を ✕。あやとの直し（大衆食堂を食べてみた）・グルメでない回は見ない（L-GOURMET。F-055） |
| `town` | 「エディンバラで、羊の内臓料理ハギスを食べてみた！」を街と内臓で ✕。あやとの直し・知られた街（パリ）は通し、街歩きの題（あやとが通したエディンバラの1日）は △ だけ（T-TOWN。F-057）。街の名前は `cityStreams.ts` の街だけ見える（ヨークは拾えない） |
| `easy` | 題が「簡単」の回の「うわあ、最悪や！」と、温度・時間・分量の数の無い原稿を ✕。あやとの直し（1時間・230℃で30分）は通す（T-EASY。F-061） |
| `pitch` | 「海外でも日本を感じたくて、宿で一から挑戦！」を ✕。あやとの直し「そろそろ日本が恋しい！」・締めの行は見ない（L-PITCH。F-070） |
| `setup` | ago-a-v4 の「名物のムサカ、食べたかったんよ。」（あとの「まさかの、食べたかったムサカや！」の前ふり）を ✕。あやとが通した A の「伝統料理が食べたい」・看板にあっただけの行は見ない（L-SETUP。F-095） |
| `buy` | p4 の「ボザも購入！」（値段なし）を ✕。あやとの直し（500mlで80円ぐらい）・「まだ買ってない」・spec の no_price は通す（L-BUY。F-102） |
| `four` | plan.md の3案の比べで、案の土台・山・結末・終わりのどれかが無ければ ✕。案が列でも行でも、前の書きかた（オチ・問い）・「土台・山・結末」の1つの欄と案の節の終わりも読む。plan.md が無い・案の列が無ければ「見ていない」（L-FOUR。F-022） |
| `mood` | 感情の字（mood）が17行で9行なら ✕、16行で8行は通す。様式に無い名前（anxious）は △ だけ（通した回に残っている）。spec が無ければ「見ていない」（L-MOOD。F-011） |
| `shout` | 「ああっ！沼にはまった！」を AI の声で読むと ✕、本人の声（orig_voice）なら通す。「うまっ！」は叫びに数えない（L-SHOUT。F-051） |
| `passed7` | あやとが通した7本（①〜④・p5 の3本。`approved/passed7/`。spec は lint が読む欄だけ、why は【答】の印だけ）が、通した時点で 2026-11-27 の規則の ✕ 0。今日の決まりで当たるのは④ホットワインの L-BUY だけ（承認 7191788789 が F-102 の 7202945549 より前） |
"""
from __future__ import annotations

import json
import re
import subprocess
import sys
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
FIX = HERE / "fixtures"
PLAYBOOK = ROOT / ".claude/skills/viral-shorts-creator/references/playbook.md"
LEDGER_MD = ROOT / ".claude/skills/viral-shorts-creator/references/ayato_feedback.md"
sys.path.insert(0, str(HERE.parent / "feedback"))
import legs  # noqa: E402

TODAY = "2099-12-31"   # 「いまある決まり全部」の代わり（日付で切らない）
BEFORE = "2026-11-25"  # 退かせた規則を当てる日（#1457 の前の日）
RETIRED = ("L-ATE", "L-WIDE", "L-CLIFF", "L-NUM38")   # 2026-11-26 に退かせた（新しい頼む文と食い違う）
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
    "hide": ("lint.py", '    m = HIDE.search(t.replace("\\n", ""))\n', "    m = None\n",
             {"title_hide"}, "題が結果を伏せても拾わない"),
    "hide_hard": ("lint.py", '"そうでなければ本当に起きたこと（出来事・数）で言い切る（F-031）", look=True)]',
                  '"そうでなければ本当に起きたこと（出来事・数）で言い切る（F-031）", look=False)]',
                  {"title_hide"}, "あやとの「まさかの事態に」（F-071）まで ✕ で落とす"),
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
    # L-END は △ になった（F-091）ので、誘い・アーカイブの許しを外しても、通した原稿（approved は ✕ 0 を見る）は落ちない
    "end_invite": ("lint.py", "    if invites(last):\n        return []\n", "", {"end"}, "次の配信への誘いで終える形を拾う"),
    "end_any": ("lint.py", '    return [Hit("L-END", len(c.lines), last,', '    return [] and [Hit("L-END", len(c.lines), last,',
                {"end"}, "どんな終わりも通す"),
    "end_archive": ("lint.py", '    if "アーカイブ" in last:\n        return []\n', "",
                    {"end"}, "アーカイブの1行で終える形を拾う"),
    "ashi_rows": ("lint.py", '        if "【足】" in (r.get("why") or ""):\n            rows.add(i)\n', "        pass\n",
                  {"ashi"}, "spec の【足】の印を読まない"),
    "as_of": ("lint.py", "        if not in_force(r.since, as_of):\n", "        if False:\n",
              {"as_of", "approved", "title_read", "as_of_id", "later_rule_live", "nick", "prev", "pickwhy", "base", "passed7"}, "決まりの日を見ない"),
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
                    {"after", "ask", "prev"}, "問い → アーカイブの終わりで、問いを締めに数えない"),
    "answer_mark": ("lint.py", '        if "【答】" in s:\n            answer.add(len(lines) + 1)\n', "",
                    {"after"}, "原稿の字の【答】を読まない"),
    "answer_spec": ("lint.py", '            if "【答】" in (r.get("why") or ""):\n                answer.add(i)\n', "            pass\n",
                    {"after", "ansnext"}, "spec の why の【答】を読まない"),
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
    # ---- 2026-11-04: 語の途中の「です」「でした」（別茹でする・僕ですら） ----
    "desu_word": ("lint.py", 'DESU = re.compile(r"(?<![茹撫奏愛詣秀])で(?:す(?![るら])|した|しょう)|(?<!ます)ます(?!ます)|ました|ません")\n',
                  'DESU = re.compile(r"です|ます|でした|ました|ません|でしょう")\n', {"desu"}, "語の途中の「です」「でした」まで拾う（前の形）"),
    "desu_stem": ("lint.py", '(?<![茹撫奏愛詣秀])で(?:す', '(?<![茹撫奏愛詣秀])(?:で|茹で)(?:す', {"desu"},
                  "「茹で」のあとでも、です・でしたを拾う"),
    # ---- 2026-10-23（#1014、F-047）に足した規則 ----
    "read_any": ("lint.py", "    if card == first:\n", "    if True:\n", {"title_read"}, "1行目が題の札と違っても通す"),
    "read_norm": ("lint.py", '    return TITLE_NOISE.sub("", FLAG_PAIR.sub("", s or ""))\n', '    return s or ""\n',
                  {"title_read", "approved", "particle", "new_fixtures"}, "国旗・改行・句読点の置きかたの違いまで ✕ にする"),
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
    "inner": ("lint.py", "        m = next((x for x in INNER.finditer(ln) if not self_comment(ln, x)), None)\n", "        m = None\n",
              {"inner"}, "内輪の言葉を拾わない"),
    # ---- 2026-11-04: 本人が人の動画に「コメントした」は内輪ではない ----
    "inner_self": ("lint.py", "    return bool(SELF_COMMENT.match(ln, m.start())) and not OTHERS.search(ln[: m.start()])\n",
                   "    return False\n", {"inner"}, "本人がした「コメントした」まで内輪にする（前の形）"),
    "inner_others": ("lint.py", "    return bool(SELF_COMMENT.match(ln, m.start())) and not OTHERS.search(ln[: m.start()])\n",
                     "    return bool(SELF_COMMENT.match(ln, m.start()))\n", {"inner"}, "みんなが「コメントした」まで本人の言葉として通す"),
    "inner_person": ("lint.py", 'SELF_COMMENT = re.compile(r"コメントした(?!人|ひと|方|かた|子|奴|やつ)")\n',
                     'SELF_COMMENT = re.compile(r"コメントした")\n', {"inner"}, "「コメントした人」まで本人の言葉として通す"),
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
    "as_of_cid": ("lint.py", "    return sc is None or ac is None or sc <= ac\n", "    return True\n", {"as_of_id", "approved", "prev", "pickwhy", "base", "passed7"},
                  "同じ日の決まりの前後をコメントID で分けない"),
    "rows_missing": ("lint.py", "        if not isinstance(rows, list):\n", "        if False:\n", {"spec_rows"}, "rows の無い spec を黙って読む"),
    "rows_count": ("lint.py", "        if len(rows) != len(lines):\n", "        if False:\n", {"spec_rows"}, "行の数の違う spec を黙って読む"),
    # ---- 2026-11-11（#1173、8章の論点9）: 出した本の数字から足した規則（仮説 N5） ----
    "wide_off": ("lint.py", "            for i, n in got if i > 1 and n > WIDE_MAX]\n", "            for i, n in got if False]\n",
                 {"wide", "retired"}, "16字以上の行を出さない"),
    "wide_title": ("lint.py", "            for i, n in got if i > 1 and n > WIDE_MAX]\n", "            for i, n in got if n > WIDE_MAX]\n",
                   {"wide"}, "1行目の題（札の字のまま読む行）まで出す"),
    "wide_count": ("lint.py", "    return [(i, spoken_chars(ln)) for i, ln in", "    return [(i, chars(ln)) for i, ln in",
                   {"wide"}, "L-SEC の数えかた（「ー」を数えない）で数える"),
    "wide_voice": ("lint.py", '    return isinstance(r, dict) and bool(r.get("orig_voice") or r.get("voice_src"))\n', "    return False\n",
                   {"wide", "width_median", "voice0", "bang", "voicen", "shout", "passed7", "new_fixtures"}, "本人の声の行まで読み上げる行に数える（L-VOICE0・L-BANG・L-VOICEN も同じ見分けを使う）"),
    "wide_vsrc": ("lint.py", 'bool(r.get("orig_voice") or r.get("voice_src"))', 'bool(r.get("orig_voice"))',
                  {"wide", "new_fixtures"}, "声だけ別の秒から取る本人の声（voice_src）を読み上げる行に数える"),
    "width_line": ("lint.py", "    if wl:\n        out.append(wl)\n", "", {"width_median"}, "行の字数の中央値を出さない"),
    "retire": ("lint.py", "    if until and when(as_of or date.today().isoformat())[0] >= until:\n", "    if False:\n", {"retired"},
               "退かせた規則も今日の決まりで当てる"),
    "hypo": ("lint.py", '         hypo=("N5",), until=RETIRE),\n', "         hypo=(), until=RETIRE),\n", {"hypo_link"}, "L-WIDE が仮説の台帳の番号を持たない"),
    # ---- 2026-11-23（#1403）: 研究から足した規則（行の種類 kind・問いの開け閉め turn。どれも △） ----
    "run_off": ("lint.py", "        if run >= RUN_MAX:\n", "        if False:\n", {"run"}, "出来事の無い行が続いても出さない"),
    "run_keep": ("lint.py", 'RUN_KEEP = ("出来事", "引っ張り", "数")', 'RUN_KEEP = ("出来事", "引っ張り")', {"run"},
                 "数の行で続きを切らない"),
    "run_title": ("lint.py", "    for i in range(2, close_at(c, ks)):\n", "    for i in range(1, close_at(c, ks)):\n", {"run"},
                  "題の1行目まで続きに数える"),
    "run_close": ("lint.py", "    for i in range(2, close_at(c, ks)):\n", "    for i in range(2, len(c.lines) + 1):\n", {"run"},
                  "締めの行まで続きに数える"),
    "close_kind": ("lint.py", "    return min(closing_index(c.lines), first)\n", "    return closing_index(c.lines)\n",
                   {"run", "ansnext"}, "問い → 次の配信への誘いの終わりで、問いの行を締めに数えない"),
    "kind_alias": ("lint.py", 'KIND_ALIAS = {"題読み": "題", "値段・数": "数", "値段": "数", "締めの問い": "締め", "配信へ": "締め"}',
                   "KIND_ALIAS = {}", {"run"}, "付録A の書きかた（題読み・値段・数・締めの問い）を読まない"),
    "kind_missing": ("lint.py", '        if k is None:\n            out.append(Hit("L-RUN"', '        if False:\n            out.append(Hit("L-RUN"',
                     {"run"}, "種類の抜けた行を黙って読み飛ばす"),
    "kind_unknown": ("lint.py", "        elif k not in KINDS:\n", "        elif False:\n", {"run"}, "決まりに無い種類を黙って読み飛ばす"),
    "turn_unknown": ("lint.py", "        if t is not None and t not in TURNS:\n", "        if False:\n", {"run"},
                     "決まりに無い開け閉めの字を黙って読み飛ばす"),
    "kinds_none": ("lint.py", "    if not any(ks):\n        return None\n", "", {"run", "ansnext"},
                   "kind の無い spec を「見ていない」にせず、全部の行を欄の抜けにする"),
    "ans_off": ("lint.py", '            out.append(Hit("L-ANSNEXT", nxt,', '            [] and out.append(Hit("L-ANSNEXT", nxt,', {"ansnext"},
                "答えの次が開かなくても出さない"),
    "ans_open": ("lint.py", "        while j < end and t <= ANS_WINDOW:\n", "        while False:\n", {"ansnext"},
                 "答えの次が開いていても出す"),
    "ans_close": ("lint.py", "        if nxt in c.answer_marked or nxt >= end:\n", "        if nxt in c.answer_marked:\n", {"ansnext", "passed7"},
                  "答えのすぐあとが締めでも出す"),
    "ans_turn": ("lint.py", ' or "o" in (turn_of(row_at(c, j)) or ""):\n', ":\n", {"ansnext"}, "turn の o（問いを開く）を見ない"),
    "ans_window": ("lint.py", "ANS_WINDOW = 3.0", "ANS_WINDOW = 0.0", {"ansnext"}, "短い反応のあと3秒のうちに開いても出す"),
    "ans_opens": ("lint.py", 'OPENS = ("出来事", "引っ張り")', 'OPENS = ("出来事",)', {"ansnext"}, "引っ張り（〜たら……）を、開く行に数えない"),
    "src": ("lint.py", '         l_run, src=("#1403",)),\n', "         l_run),\n", {"hypo_link"}, "L-RUN が出どころの issue を持たない"),
    # ---- 2026-11-25（#1403・#1441、帳面 F-093）: 温泉 v5・ボザ v9 の作りかたを全部の回へ ----
    "cliff_off": ("lint.py", "    if not m:\n        return []\n    return [Hit(\"L-CLIFF\"", "    if True:\n        return []\n    return [Hit(\"L-CLIFF\"",
                  {"cliff"}, "題の直後の前置きを拾わない"),
    "cliff_head": ("lint.py", "    m = CLIFF.search(ln) or (None if PULL_END.search(ln) else CLIFF_HEAD.search(ln))\n",
                   "    m = CLIFF.search(ln)\n", {"cliff"}, "頭の決まり文句（最近・明日・まずは）を拾わない"),
    "cliff_pull": ("lint.py", "    m = CLIFF.search(ln) or (None if PULL_END.search(ln) else CLIFF_HEAD.search(ln))\n",
                   "    m = CLIFF.search(ln) or CLIFF_HEAD.search(ln)\n", {"cliff"}, "「まずは嗅いでみたら……」（引っ張り）まで前置きにする"),
    "cliff_look": ("lint.py", "題の札・出来事の行の中・最初の出来事のあとへ（#1403 Q2）\")]",
                   "題の札・出来事の行の中・最初の出来事のあとへ（#1403 Q2）\", look=True)]", {"cliff"}, "前置きを ✕ にせず △ にする（前の案）"),
    "hook_off": ("lint.py", "    if not hook and not m:\n        return []\n", "    if True:\n        return []\n", {"hook"}, "0秒目の景色・写真を拾わない"),
    "hook_head": ("lint.py", '    head = re.split(r"→|／", vis, maxsplit=1)[0]\n', "    head = vis\n", {"hook"},
                  "題の行の画の頭でなく、後ろ（1.5秒目からの写真）まで見る"),
    "hook_ok": ("lint.py", "    if hook in HOOK_OK:\n        return []\n", "", {"hook"}, "hook に「最中」と書いても通さない"),
    "num38_off": ("lint.py", "if st[i - 1] < EARLY):\n        return []\n    return [Hit(\"L-NUM38\"", "if True):\n        return []\n    return [Hit(\"L-NUM38\"",
                  {"num38"}, "8秒より後の数でも、題の直後の数に数える"),
    "num38_word": ("lint.py", 'NUM_ANY = re.compile(r"[0-9０-９]|', 'NUM_ANY = re.compile(r"[0-9０-９]|(?!)', {"num38"},
                   "漢字の数（百度・三人）を数に数えない"),
    "voice0_off": ("lint.py", "    if any(own_voice(row_at(c, i)) for i in range(1, len(c.lines) + 1) if st[i - 1] < EARLY):\n",
                   "    if any(own_voice(row_at(c, i)) for i in range(1, len(c.lines) + 1)):\n", {"voice0"}, "8秒より後の本人の声でも通す"),
    "bang_off": ("lint.py", "    if len(got) <= BANG_MAX:\n", "    if True:\n", {"bang"}, "「！」の多さを見ない"),
    "bang_peak": ("lint.py", '        if i == 1 or i in c.answer_marked or own_voice(r) or r.get("big") or "【大】" in str(r.get("why") or ""):\n',
                  "        if i == 1:\n", {"bang"}, "山（【答】・【大】・本人の声）の「！」まで数える"),
    "src_cliff": ("lint.py", "l_cliff,\n         src=(\"#1403\",), until=RETIRE),\n", "l_cliff, until=RETIRE),\n", {"hypo_link"}, "L-CLIFF が出どころの issue を持たない"),
    # ---- 2026-11-13（#1186、F-008 の5回目）: 前の回の事情の補足 ----
    "prev": ("lint.py", "        m = next((x for x in PREV.finditer(ln) if x.group(0) not in said), None)\n", "        m = None\n",
             {"prev"}, "前の回の事情（先週・リベンジ）を拾わない"),
    "prev_close": ("lint.py", "    for i, ln in enumerate(c.lines[1:end - 1], 2):\n", "    for i, ln in enumerate(c.lines[1:], 2):\n",
                   {"prev"}, "締めの行（次の配信への誘いの「リベンジに…」）まで拾う"),
    "prev_title": ("lint.py", "    said = {m.group(0) for m in PREV.finditer(c.title)}\n", "    said = set()\n",
                   {"prev"}, "題の約束が「リベンジ」の回の本文まで拾う"),
    # ---- 2026-11-26（#1450、F-103）: 天気やから ----
    "tenki": ("lint.py", "            if any(ln[:m.start()].endswith(w) for w in TENKI_OK):\n", "            if True:\n",
              {"tenki"}, "「天気やから」を拾わない"),
    # ---- 2026-11-25（#1447、F-056）: 選んだ訳 ----
    "pickwhy": ("lint.py", "        m = next((x for x in PICKWHY.finditer(ln) if not head or x.start() >= head.end()), None)\n",
                "        m = None\n", {"pickwhy"}, "選んだ訳（〜から、…にした）を拾わない"),
    "pickwhy_head": ("lint.py", "        head = HEAD_CONJ.match(ln)\n", "        head = None\n",
                     {"pickwhy"}, "行の頭のつなぎ（だから、…にした）まで拾う"),
    # ---- 2026-11-26（#1446・#1451・#1445、F-099・F-078）----
    "base_who": ("lint.py", "    if not who or not any(k in who for k in PERSONAS):\n", "    if not who:\n",
                 {"base"}, "ペルソナ3つのどれも名指さない persona を通す"),
    "base_len": ("lint.py", "    if not BASE_MIN <= len(base) <= BASE_MAX:\n", "    if not base:\n",
                 {"base"}, "基本線の行の数を見ない"),
    "voicen": ("lint.py", "    if n >= VOICE_MIN:\n", "    if True:\n", {"voicen"}, "本人の声の数を見ない"),
    "metaphor_feel": ("lint.py", "    if FEEL.match(m.group(0)) and DID.search(t[:m.start()]):\n", "    if False:\n",
                      {"title_metaphor"}, "本当にした行動のあとの気持ちのたとえ（あやとの題）まで ✕ で落とす"),
    "flag_dest": ("lint.py", " and not card.startswith(DEST, p[0] + len(p[1]))]\n", "]\n",
                  {"flag"}, "「〜行きのバス」の行き先にも旗を求める"),
    # ---- 2026-11-27（あやと「同じ指摘がないように永続化してください」）: 2回以上言われたのに人の目だけだった項目 ----
    "kind_need": ("lint.py", "        if k is None or k not in KINDS:\n            bad_k.append",
                  "        if k is not None and k not in KINDS:\n            bad_k.append", {"kind_turn"}, "種類（kind）の無い行を ✕ にしない（F-093）"),
    "turn_need": ("lint.py", "        if t is None or t not in TURNS:\n            bad_t.append",
                  "        if t is not None and t not in TURNS:\n            bad_t.append", {"kind_turn"},
                  "開け閉め（turn）の無い行を ✕ にしない（F-093）"),
    "kind_odd": ("lint.py", "        if k is None or k not in KINDS:\n            bad_k.append", "        if k is None:\n            bad_k.append",
                 {"kind_turn"}, "決まりに無い種類の字を通す"),
    "shape_need": ("lint.py", "    if str(c.shape or \"\").strip():\n        return []\n", "    if True:\n        return []\n", {"shape"},
                   "回の型（shape）の無い spec を通す（F-052）"),
    "shape_off": ("lint.py", "        if c.shape and c.shape != STREAM_SHAPE and stream_only(r):\n", "        if False:\n", {"shape"},
                  "型の違う回にも、配信の回の型の規則（問い・関西弁・札）を当てる（F-052）"),
    "shape_read": ("lint.py", '        shape = str(s.get("shape") or "").strip() or None\n', "        shape = None\n", {"shape"},
                   "spec の shape を読まない"),
    "gourmet_eval": ("lint.py", "    m = EVAL_ONLY.search(t)\n", "    m = None\n", {"gourmet"}, "グルメの回の題の「大当たり」を拾わない"),
    "gourmet_ai": ("lint.py", "        m = AI_MENU.search(ln)\n", "        m = None\n", {"gourmet"}, "AI に聞いたメニューを拾わない"),
    "gourmet_scope": ("lint.py", "    if not GOURMET.search(t):\n        return []\n", "", {"gourmet"}, "グルメでない回の題まで拾う"),
    "town_city": ("lint.py", "        if name in COUNTRY_NAMES or name == HOME or name in WELL_KNOWN:\n", "        if True:\n",
                  {"town"}, "題の知られていない街を拾わない"),
    "town_known": ("lint.py", "        if name in COUNTRY_NAMES or name == HOME or name in WELL_KNOWN:\n",
                   "        if name in COUNTRY_NAMES or name == HOME:\n", {"town"}, "パリのような知られた街まで拾う"),
    "town_food": ("lint.py", "（F-057）\", look=not food))", "（F-057）\", look=True))", {"town"},
                  "グルメの題の知られていない街を ✕ にしない"),
    "town_putoff": ("lint.py", "    m = PUTOFF.search(t)\n", "    m = None\n", {"town"}, "題の引く言葉（内臓）を拾わない"),
    "easy_fail": ("lint.py", "        m = FAIL_WORD.search(ln)\n", "        m = None\n", {"easy"}, "「簡単」の回の失敗の行を拾わない"),
    "easy_num": ("lint.py", "    if not any(RECIPE_NUM.search(ln) for ln in c.lines[1:]):\n", "    if False:\n", {"easy"},
                 "「簡単」の回のレシピの数を見ない"),
    "pitch": ("lint.py", "        m = PITCH.search(ln)\n", "        m = None\n", {"pitch"}, "企画の都合の言い回しを拾わない"),
    "pitch_close": ("lint.py", "    for i in range(2, closing_index(c.lines)):\n        ln = c.lines[i - 1]\n        m = PITCH",
                    "    for i in range(2, len(c.lines) + 1):\n        ln = c.lines[i - 1]\n        m = PITCH", {"pitch"}, "締めの行まで見る"),
    "setup": ("lint.py", "            shared = sorted(w for w in words if w in prev)\n", "            shared = []\n", {"setup"},
              "落ちの物の前ふりを拾わない"),
    "setup_wish": ("lint.py", "            if not WISH.search(prev):\n                continue\n", "", {"setup"},
                   "願いでない行（看板にあった）まで前ふりに数える"),
    "buy": ("lint.py", "    if not got or any(YEN.search(ln) for ln in c.lines):\n", "    if not got:\n", {"buy", "passed7"}, "値段があっても落とす"),
    "buy_off": ("lint.py", "    if not got or any(YEN.search(ln) for ln in c.lines):\n", "    if True:\n", {"buy", "passed7"}, "買った物の値段を見ない"),
    "buy_why": ("lint.py", "    if c.no_price:\n        return []\n", "", {"buy"}, "配信で値段を言っていない訳（no_price）を読まない"),
    "buy_neg": ("lint.py", "買(った|うた|って(?!(ない|へん|なかった)))", "買(った|うた|って)", {"buy"}, "「買ってない」まで買った物に数える"),
    "four": ("lint.py", '    miss = [p for p in PILLARS if got.get(p, "").strip().strip("*") in EMPTY]\n', "    miss = []\n", {"four"},
             "案の柱の抜けを見ない"),
    "four_alias": ("lint.py", "    name = PILLAR_ALIAS.get(name, name)\n", "", {"four"}, "前の書きかた（問い・オチ）を柱に数えない"),
    "four_joint": ("lint.py", '    if all(p in name for p in ("土台", "山", "結末")):\n', "    if False:\n", {"four"},
                   "「土台・山・結末」の1つの欄を分けない"),
    "mood_count": ("lint.py", "    if len(moved) > len(c.lines) * MOOD_SHARE:\n", "    if False:\n", {"mood"}, "感情の字の行の数を見ない"),
    "mood_family": ("lint.py", "感情を出すなら2系統のどちらかに（F-011）\", look=True)", "感情を出すなら2系統のどちらかに（F-011）\", look=False)",
                    {"mood"}, "様式に無い名前（anxious）を ✕ で落とす（通した回に残っている）"),
    "shout": ("lint.py", "        if m and not own_voice(row_at(c, i)):\n", "        if False:\n", {"shout"}, "叫びを AI の声で読む行を拾わない"),
    "shout_own": ("lint.py", "        if m and not own_voice(row_at(c, i)):\n", "        if m:\n", {"shout", "passed7", "new_fixtures"},
                  "本人の声の叫びまで落とす"),
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
    book = "🇷🇴ルーマニアの光溢れる本屋さんに行ったら天国みたいな世界だった！"   # #1451 のあやとの題
    out += [("あやとの題「…本屋さんに行ったら天国みたいな世界だった！」は ✕ にせず △ だけ",
             not title_hits(L, book, "T-METAPHOR") and bool(title_looks(L, book, "T-METAPHOR"))),
            ("行動の無い「ルーマニアの本屋、天国みたいな世界だった」は ✕",
             bool(title_hits(L, "🇷🇴ルーマニアの本屋、天国みたいな世界だった", "T-METAPHOR")))]
    return out


def title_looks(L, card, rule):
    """△（look）だけ。✕ にはならないことを別に見る。"""
    return [h for h in L.lint(ctx(L, ["題", "みんなは？"], title_card=card), TODAY)["hits"] if h.rule == rule and h.look]


AYATO_HIDE = ("海外キッチンでワンパンチーズフォカッチャ\n作ったらまさかの事態に！",          # F-071 と同じ形（フォカッチャ）
              "🇲🇰北マケドニア旅行中にパソコンを送ったら、まさかの事態に！",               # #1171 あやとの題
              "🇲🇰北マケドニアでハードパン3種の実験をしたらまさかの事態に！")             # F-071（#1171）


def leg_title_hide(L):
    """T-HIDE: 題が結果を伏せる言い方を △ で拾う。あやとの「まさかの事態に」（F-071）は ✕ にしない。"""
    out = [("「乗り物に乗ろうとしたら、まさかの事態に！」を △ で拾う",
            bool(title_looks(L, "🇧🇬ブルガリアのクリスマスマーケットで、乗り物に乗ろうとしたら、まさかの事態に！", "T-HIDE"))),
           ("「衝撃の結末」「〜した結果…」も拾う",
            bool(title_looks(L, "🇬🇧ロンドンで衝撃の結末", "T-HIDE")) and bool(title_looks(L, "🇬🇧ロンドンで紅茶を頼んだ結果…", "T-HIDE"))),
           ("言い切った「乗り物に乗ろうとしたら、大行列やった！」は拾わない",
            not title_hits(L, "🇧🇬ブルガリアのクリスマスマーケットで、乗り物に乗ろうとしたら、大行列やった！", "T-HIDE")
            and not title_looks(L, "🇧🇬ブルガリアのクリスマスマーケットで、乗り物に乗ろうとしたら、大行列やった！", "T-HIDE"))]
    for t in AYATO_HIDE:
        out.append((f"あやとの題「{t.splitlines()[0]}…」は △ 止まり（✕ にしない。F-071）",
                    bool(title_looks(L, t, "T-HIDE")) and not title_hits(L, t, "T-HIDE")))
    for t in AYATO_TITLES[:3]:
        out.append((f"伏せていないあやとの題「{t.splitlines()[0]}」は拾わない", not title_looks(L, t, "T-HIDE")))
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
        ("あやとの題「🇧🇬ブルガリアからルーマニア行きのバス移動してみた！」は通す（行き先に旗を求めない）",
         not title_hits(L, "🇧🇬ブルガリアからルーマニア行きのバス移動してみた！", "T-FLAG")),
        ("「🇧🇬ブルガリアからルーマニアに行ったら…」は 🇷🇴 が無いので拾う",
         bool(title_hits(L, "🇧🇬ブルガリアからルーマニアに行ったら、寒すぎた！", "T-FLAG"))),
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
    return [("391字で落ちる", bool(n_hits(391))), ("390字は通る", not n_hits(390))]


def leg_end(L):
    # L-END は △（F-091 で、終わりは臨機応変になった）。拾うかどうかは △ も含めて見て、落とさないことは別の足で見る
    def hits(lines):
        return [h for h in L.lint(ctx(L, lines), TODAY)["hits"] if h.rule == "L-END"]
    return [("問いで切る（「みんなは、この宿、泊まれる？」）は通す", not hits(["題", "宿", "みんなは、この宿、泊まれる？"])),
            ("次の配信への誘い（あやと #1014「…本日22時から作るので配信見にきてね！」）で終えるのも通す",
             not hits(["題", "うまい！", "リベンジにワンパンピザを本日22時から作るので配信見にきてね！"])),
            ("問い → 「…アーカイブ見てね！」は通す（#977）", not hits(["題", "みんなやったら、ケバブ守る？あげる？", "この国で見た爆焼夕日は配信のアーカイブ見てね！"])),
            ("問いを置かずにアーカイブの1行で終えるのも通す（#975。途中の「どっち？」は終わりの問いではない）",
             not hits(["題", "どっち？……乗っちゃお！", "船も乗れるねん！", "……船酔いしてるわな。", "続きはアーカイブ見てな！"])),
            ("問いのあとの「ありがとう！」を拾う", bool(hits(["題", "みんなは？", "見てくれてありがとう！"]))),
            ("問い → アーカイブ → 挨拶（アーカイブのあとにも足した）を拾う",
             bool(hits(["題", "みんなは？", "続きは配信のアーカイブ見てね！", "またね！"]))),
            ("問いもアーカイブも無い終わりを拾う", bool(hits(["題", "ほんまに楽しかった。"]))),
            ("落ちで切る終わり（F-091）は、拾っても △ で、落とさない",
             bool(hits(["題", "さっきの7分、僕はこの絵の真下で突っ立ってた。"]))
             and all(h.look for h in hits(["題", "さっきの7分、僕はこの絵の真下で突っ立ってた。"])))]


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


def hits_of(L, c, rule, as_of=None):
    """規則の当たり。退かせた規則（L-ATE・L-WIDE・L-CLIFF・L-NUM38）は、退かせる前の日で当てる。"""
    return [h for h in L.lint(c, as_of or (BEFORE if rule in RETIRED else TODAY))["hits"] if h.rule == rule]


def leg_retired(L):
    """2026-11-26（#1457）に退かせた4つは、今日の決まりでは当てず「退かせた」と書き、退かせる前の日なら当てる。"""
    c = ctx(L, ["題", "あ" * 16, "みんなは？"])
    now, before = L.lint(c, TODAY), L.lint(c, BEFORE)
    rep = L.report("足", c, now, TODAY)
    return [("今日の決まりでは L-ATE・L-WIDE・L-CLIFF・L-NUM38 を当てず、退かせた並びに入れる",
             sorted(now["retired"]) == sorted(RETIRED) and not set(RETIRED) & set(now["ran"] + now["blind"])),
            ("退かせる前の日（2026-11-25）なら当てる（16字の行に L-WIDE の △）",
             not before["retired"] and any(h.rule == "L-WIDE" for h in before["hits"])),
            ("報告に「退かせた決まり」の1行が出る", "退かせた決まり" in rep)]


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
    # 語の途中（2026-11-04 のクラムチャウダーの回の「別茹で」、バゲットの回の「僕ですら」）。こしらえた行で見る
    word = hits_of(L, ctx(L, ["題", "鶏だけ別茹でする！", "鶏は冷凍のまま別茹でした。", "僕ですら作れた。", "ますます寒くなった。",
                              "みんなは？"]), "L-DESU")
    still = hits_of(L, ctx(L, ["題", "鶏を茹でます。", "うまそうなんですけど！", "大雨でした。", "スープは別茹でです。", "みんなは？"]), "L-DESU")
    return [("銅像 p2（17行）の10・12行目を △", [h.line for h in p2] == [10, 12] and all(h.look for h in p2)),
            ("城塞 p1 の「」の中の「閉まってますよ」は見ない", not castle),
            ("語の途中「別茹でする」「別茹でした」「僕ですら」「ますます」は拾わない", not word),
            ("「茹でます」「〜なんですけど」「大雨でした」「別茹でです」は今までどおり △",
             [h.line for h in still] == [2, 3, 4, 5] and all(h.look for h in still))]


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
    # 本人が書き込んだ話（こしらえた行）と、書いたのが本人でない・頼む形・名詞の「コメント」
    mine = hits_of(L, ctx(L, ["題", "相手の動画に、うちの近所は1個10円やでってコメントしたら、", "僕がコメントした動画。", "みんなは？"]),
                   "L-INNER")
    others = hits_of(L, ctx(L, ["コメントしてくれた人がいて、", "コメントした人が教えてくれた店。", "みんながコメントしたら、",
                                "コメントしてね！", "コメントで教えてもらった。", "みんなは？"]), "L-INNER")
    return [("滝の回 p1 の8行目「配信のコメントで…」を ✕", [(h.line, h.look) for h in wf] == [(8, False)]),
            ("銅像 p2（17行・公開済み）の6行目「配信のコメントで…」も今日の決まりでは ✕", [h.line for h in statue] == [6]),
            ("締めの「みんなやったら…？」「配信のアーカイブ見てね」は内輪ではない", not closing),
            ("次の配信への誘い「…配信見にきてね！」も内輪ではない", not invite),
            ("「チャットで」を ✕", [h.line for h in chat] == [2]),
            ("題の札の「リスナー」も ✕（行 0）", [h.line for h in card] == [0]),
            ("本人が人の動画に「コメントした（ら）」は内輪ではない（ワルテミスさんとの対談の回）", not mine),
            ("「コメントしてくれた」「コメントした人」「みんながコメントしたら」「コメントしてね」「コメントで」は ✕ のまま",
             [h.line for h in others] == [1, 2, 3, 4, 5])]


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


def leg_prev(L):
    cross = ["北マケドニアで山の上の十字架を見に行ったら、まさかの事態に！", "やってきたのは、首都スコピエ！",
             "街のどこからでも見える十字架。", "先週は雨で流れたリベンジや！", "ただ、日の入りは16時20分。",
             "みんなやったら、クッキーに並ぶ？先を急ぐ？"]
    a = hits_of(L, ctx(L, cross), "L-PREV")
    then = [h for h in L.lint(ctx(L, cross), "2026-11-13:6850635935")["hits"] if h.rule == "L-PREV"]
    fixed = hits_of(L, ctx(L, cross[:2] + ["街のどこからでも見える十字架まで歩きたい！"] + cross[4:]), "L-PREV")
    mid = hits_of(L, ctx(L, ["題", "前回の配信で言うてた店へ！", "みんなは？"]), "L-PREV")
    foc = hits_of(L, fix(L, "approved/VusdZVyjgjQ_p1"), "L-PREV")
    close = hits_of(L, ctx(L, ["題", "焼けた！", "リベンジは来週の配信で見てな？", "続きはアーカイブで！"]), "L-PREV")
    title = hits_of(L, ctx(L, ["北マケドニアで滝にリベンジしたら、まさかの事態に！", "リベンジや！", "みんなは？"]), "L-PREV")
    first = hits_of(L, ctx(L, ["前回の続きや！", "みんなは？"]), "L-PREV")
    day = hits_of(L, ctx(L, ["題", "昨日こねた生地を焼く！", "みんなは？"]), "L-PREV")
    return [("十字架 A の4行目「先週は雨で流れたリベンジや！」を ✕（行 4）", [(h.line, h.look) for h in a] == [(4, False)]),
            ("あやとのコメント（2026-11-13:6850736486）より前の時点では当てない", not then),
            ("あやとの書き直し（「…十字架まで歩きたい！」）は通す", not fixed),
            ("行の途中の「前回の配信で」も ✕", [h.line for h in mid] == [2]),
            ("フォカッチャの添削版の締め「リベンジにワンパンピザを本日22時から…」は見ない", not foc),
            ("問いのあとにアーカイブの1行がある終わりでは、問いの行も締めとして見ない", not close),
            ("題が「リベンジ」を言っている回の本文の「リベンジ」は見ない", not title),
            ("1行目（読み上げる題）は見ない", not first),
            ("「昨日こねた生地」（その日の話の中の昨日）は見ない", not day)]


def leg_tenki(L):
    bad = hits_of(L, ctx(L, ["題", "宿で休むつもりやったけど、今日は天気やから、外に出ることにした！", "みんなは？"]), "L-TENKI")
    good = hits_of(L, ctx(L, ["題", "宿で休むつもりやったけど、良い天気やから、外に出ることにした！", "みんなは？"]), "L-TENKI")
    return [("風邪の回 p4 の「今日は天気やから、外に出ることにした！」を ✕（行 2）", [(h.line, h.look) for h in bad] == [(2, False)]),
            ("あやとの直し「良い天気やから」は通す", not good)]


def leg_pickwhy(L):
    a = ["ブルガリアのめちゃくちゃ美味しい揚げパンを食べてみた！", "行列店って書いてあった揚げパン屋に来たら……", "お客さん、僕1人やん！",
         "ソフィアで甘いもんが欲しくて、頼んだのは名物のメキツァ。", "おばちゃんが、ヨーグルト入りの生地を揚げてくれてる。",
         "ヌテラは全部ヌテラ味になるから、蜂蜜ナッツにした。", "揚げたてに、蜂蜜がデロンデロン！", "持ち上げたら、蜂蜜こぼした。",
         "かぶりついたら……うま！", "結局、蜂蜜の味しかせえへん！", "けど、噛んでたら奥から揚げパンの味がして……",
         "給食で食べた揚げパン、めっちゃ思い出すわ！", "みんなも、ブルガリアで給食の揚げパンを食べてみたい？"]
    got = hits_of(L, ctx(L, a), "L-PICKWHY")
    then = [h for h in L.lint(ctx(L, a), "2026-11-25:7173883008")["hits"] if h.rule == "L-PICKWHY"]
    fixed = hits_of(L, ctx(L, a[:5] + a[6:]), "L-PICKWHY")
    b = hits_of(L, ctx(L, ["題", "ヌテラかけたら全部ヌテラ味やから、蜂蜜ナッツにした。", "みんなは？"]), "L-PICKWHY")
    plain = hits_of(L, ctx(L, ["題", "トッピングは、蜂蜜ナッツにした。", "みんなは？"]), "L-PICKWHY")
    head = hits_of(L, ctx(L, ["題", "だから、全部を歩ける島にした。", "みんなは？"]), "L-PICKWHY")
    edge = hits_of(L, ctx(L, ["高いから、安い宿にした！", "みんなは、高いから安い宿にする？"]), "L-PICKWHY")
    act = hits_of(L, ctx(L, ["題", "宿で休むつもりやったけど、今日は天気やから、外に出ることにした！", "みんなは？"]), "L-PICKWHY")
    return [("揚げパンの回 A の6行目「ヌテラは全部ヌテラ味になるから、蜂蜜ナッツにした。」を ✕（行 6）",
             [(h.line, h.look) for h in got] == [(6, False)]),
            ("あやとのコメント（2026-11-25:7173925743）より前の時点では当てない", not then),
            ("あやとの直し（6行目を消した12行）は通す", not fixed),
            ("B の「…ヌテラ味やから、蜂蜜ナッツにした。」も ✕", [h.line for h in b] == [2]),
            ("動きを決めた「〜から、外に出ることにした」（あやとの直し #1450 issuecomment-7198925596）は見ない", not act),
            ("頼んだ物だけの「トッピングは、蜂蜜ナッツにした。」は見ない", not plain),
            ("行の頭のつなぎ「だから、全部を歩ける島にした。」は見ない", not head),
            ("題（1行目）と締めの問いは見ない", not edge)]


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
        return [h for h in fails(L, L.build(tmp_script(["題", "みんなは？"], spec)), BEFORE) if h.rule == "L-ATE"]
    miss = {k: v for k, v in full.items() if k != "F-048"}
    short = {**full, "F-049": {"lines": [1], "note": "なし"}}
    outside = {**full, "F-031": {"lines": [5], "note": "題の札に場所と出来事を入れた"}}
    blind = L.lint(ctx(L, ["題", "みんなは？"]), BEFORE)["blind"]
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


LINE16 = "そしたら、男の子が追い払ってくれた！"   # タリンのハトの回 p1 の11行目。読み上げる字で16字
LINE15 = "したら、男の子が追い払ってくれた！"     # 頭の1字を落とした15字
LONG_BAR = "スーパーのレジでカードが通らへん"      # 「ー」を数えて16字（L-SEC の数えかたなら13字）


def leg_wide(L):
    def lines_of(c):
        return [(h.line, h.look) for h in hits_of(L, c, "L-WIDE")]
    be = legs.load(ROOT / "tools/shorts/plan/build_edit.py", "build_edit")
    samples = (LINE16, LINE15, LONG_BAR, "🇪🇪エストニアでハトに", "小麦粉４００ｇと塩水200ml……", "「おいおいおい！」誰やこれ？")
    same = [s for s in samples if L.spoken_chars(s) != be.spoken_chars(s)]
    voice = L.build(tmp_script(["題", LINE16, LINE16, LINE16, "みんなは？"], {"rows": [
        {"line": "題"}, {"line": LINE16, "orig_voice": "0:10:18〜0:10:21"},
        {"line": LINE16, "voice_src": "kunXt2sXnFQ 6:40:47.66〜6:40:49.24"}, {"line": LINE16}, {"line": "みんなは？"}]}))
    return [(f"数えかたが build_edit.py の spoken_chars と同じ（{len(samples)}つの字）" + (f" ← {same}" if same else ""), not same),
            (f"16字の行（「{LINE16}」）は △", lines_of(ctx(L, ["題", LINE16, "みんなは？"])) == [(2, True)]),
            (f"15字の行（「{LINE15}」）は何も出さない", not lines_of(ctx(L, ["題", LINE15, "みんなは？"]))),
            (f"「ー」を数える（「{LONG_BAR}」は16字で △）", lines_of(ctx(L, ["題", LONG_BAR, "みんなは？"])) == [(2, True)]),
            ("1行目の題（30字）は見ない", not lines_of(ctx(L, ["あ" * 30, "みんなは？"]))),
            ("本人の声の行（orig_voice・voice_src）は見ず、AI が読む行だけ △", lines_of(voice) == [(4, True)])]


def leg_width_median(L):
    def line_of(c, as_of=TODAY):
        rep = L.report("足", c, L.lint(c, as_of), as_of)
        return next((ln for ln in rep.splitlines() if ln.startswith("1行の字数")), "")
    odd = ctx(L, ["あ" * 20, "あ" * 10, "あ" * 12, "あ" * 16, "あ" * 14])
    even = ctx(L, ["あ" * 10, "あ" * 17])
    voice = L.build(tmp_script(["あ" * 20, "あ" * 10, "あ" * 30, "あ" * 12], {"rows": [
        {"line": "あ" * 20}, {"line": "あ" * 10}, {"line": "あ" * 30, "orig_voice": "0:10:18〜0:10:21"}, {"line": "あ" * 12}]}))
    return [("5行（20・10・12・16・14字）なら「中央値 14字（読み上げる5行」。題の1行目も入れる", "中央値 14字（読み上げる5行" in line_of(odd)),
            ("2行（10・17字）なら真ん中の 13.5字", "中央値 13.5字" in line_of(even)),
            ("本人の声の行（30字）は外す（20・10・12字で 12字・3行）", "中央値 12字（読み上げる3行" in line_of(voice)),
            ("L-WIDE を当てない日付（2026-10-21）でも出す", "中央値 14字" in line_of(odd, "2026-10-21"))]


def kctx(L, lines, ks, ans=(), turns=None):
    """行と種類（と開け閉め）から原稿を組む（spec の rows の kind・turn と同じ形。None はその欄を書かない）。"""
    rows = [{"line": ln, **({"kind": k} if k else {}), **({"turn": t} if t else {})}
            for ln, k, t in zip(lines, ks, turns or [None] * len(lines))]
    return L.Ctx(lines=list(lines), title_card=None, title_from="足", rows=rows, answer_marked=set(ans))


def numbered(n, last="みんなは？"):
    return [f"{i}行目の字" for i in range(1, n)] + [last]


# 診断（`references/diagnosis_2026-11-23.md`）の付録A の、屋根裏25人部屋の行の種類（書きかたも付録A のまま）。診断の「続」は 8・9・10・17行目
ROOF = ("題読み", "前置き", "引っ張り", "出来事", "引っ張り", "反応", "説明", "前置き", "前置き", "反応",
        "値段・数", "引っ張り", "出来事", "値段・数", "反応", "反応", "反応", "締めの問い")


def leg_run(L):
    def got(lines, ks, turns=None):
        hs = hits_of(L, kctx(L, lines, ks, turns=turns), "L-RUN")
        return ([h.line for h in hs if "続いた" in h.note], [(h.line, h.note.split("。")[0]) for h in hs if "続いた" not in h.note],
                all(h.look for h in hs))
    base = got(numbered(10), ["題", "前置き", "説明", "前置き", "出来事", "反応", "反応", "味", "味", "締め"])
    title = got(numbered(5), ["題", "反応", "反応", "出来事", "締め"])
    close = got(numbered(5), ["題", "出来事", "反応", "反応", "締め"])
    invite = got(numbered(5) + ["本日22時から配信見にきてね！"], ["題", "出来事", "反応", "反応", "締め", "締め"])
    num = got(numbered(6), ["題", "説明", "数", "説明", "説明", "締め"])
    alias = got(numbered(6), ["題読み", "前置き", "値段・数", "反応", "反応", "締めの問い"])
    missing = got(numbered(5), ["題", "出来事", None, "反応", "締め"])
    unknown = got(numbered(5), ["題", "出来事", "オチ", "反応", "締め"])
    turn_bad = got(numbered(5), ["題", "出来事", "出来事", "反応", "締め"], [None, "x", "oc", "ー", "-"])
    roof = got(numbered(len(ROOF)), list(ROOF))
    blind = L.lint(kctx(L, numbered(4), [None] * 4), TODAY)["blind"]
    return [(f"前置き・説明・前置き → 4行目、反応・反応・味・味 → 8・9行目を △（{base[0]}）", base[0] == [4, 8, 9] and base[2] and not base[1]),
            (f"題の1行目は数えない（題・反応・反応 で出さない。{title[0]}）", not title[0]),
            (f"締めの行は数えない（反応・反応・締め で出さない。{close[0]}）", not close[0]),
            (f"問い → 次の配信への誘いの終わりも、問いの行を締めに数える（{invite[0]}）", not invite[0]),
            (f"数の行は続きを切る（説明・数・説明・説明 で出さない。{num[0]}）", not num[0]),
            (f"付録A の書きかた（題読み・値段・数・締めの問い）で読む（{alias}）", not alias[0] and not alias[1]),
            (f"種類の無い行を「種類が無い」で △（{missing[1]}）", [(n, "が無い" in w) for n, w in missing[1]] == [(3, True)] and missing[2]),
            (f"決まりに無い種類（オチ）を △（{unknown[1]}）", [(n, "「オチ」" in w) for n, w in unknown[1]] == [(3, True)] and unknown[2]),
            (f"決まりに無い開け閉め（x）を △。oc・ー・- は通す（{turn_bad[1]}）", [(n, "「x」" in w) for n, w in turn_bad[1]] == [(2, True)]),
            (f"付録A の屋根裏25人部屋で、診断の「続」と同じ 8・9・10・17行目（{roof[0]}）", roof[0] == [8, 9, 10, 17] and not roof[1]),
            ("どの行にも kind が無ければ「見ていない」", "L-RUN" in blind)]


def leg_ansnext(L):
    def got(lines, ks, ans=(3,), turns=None):
        return [(h.line, h.look) for h in hits_of(L, kctx(L, lines, ks, ans, turns), "L-ANSNEXT")]
    head, head_k = ["題", "鍋のふたを開けたら、", "中が空っぽ！"], ["題", "引っ張り", "出来事"]
    react = got(head + ["あ、なんか嫌や！", "みんなは？"], head_k + ["反応", "締め"])
    to_close = got(head + ["みんなは？"], head_k + ["締め"])
    to_archive = got(head + ["みんなは？", "続きはアーカイブ見てね！"], head_k + ["締め", "締め"])
    to_invite = got(head + ["みんなは？", "本日22時から配信見にきてね！"], head_k + ["締め", "締め"])
    to_event = got(head + ["と思ったら、底に手紙！", "みんなは？"], head_k + ["出来事", "締め"])
    to_pull = got(head + ["裏を見てみたら……", "みんなは？"], head_k + ["引っ張り", "締め"])
    ask = head + ["じゃあ、誰が食べたん？", "みんなは？"]
    turn_o = got(ask, head_k + ["反応", "締め"], turns=[None, "o", "c", "o", None])
    turn_oc = got(ask, head_k + ["反応", "締め"], turns=[None, "o", "c", "oc", None])
    turn_no = got(ask, head_k + ["反応", "締め"], turns=[None, "o", "c", "-", None])
    short = got(head + ["わお、人がいっぱい！", "屋台を1軒ずつ見て回ったら、", "全部盛りにしてくれた！", "みんなは？"],
                head_k + ["反応", "引っ張り", "出来事", "締め"])
    long_ = got(head + ["甘くてドロドロやから、1本飲んだらたぶん死ぬ！", "裏を見てみたら……", "手紙！", "みんなは？"],
                head_k + ["反応", "引っ張り", "出来事", "締め"])
    in_spec = L.build(tmp_script(head + ["あ、なんか嫌や！", "みんなは？"], {"rows": [
        {"line": "題", "kind": "題"}, {"line": "a", "kind": "引っ張り"}, {"line": "b", "kind": "出来事", "why": "【答】題の答え"},
        {"line": "c", "kind": "反応"}, {"line": "d", "kind": "締め"}]}))
    no_kind = L.lint(kctx(L, head + ["あ、なんか嫌や！", "みんなは？"], [None] * 5, {3}), TODAY)["blind"]
    no_ans = L.lint(kctx(L, head + ["あ、なんか嫌や！", "みんなは？"], head_k + ["反応", "締め"], ()), TODAY)["blind"]
    return [(f"答え → 反応 → 締め なら、反応の行（4行目）を △（{react}）", react == [(4, True)]),
            ("答えのすぐあとが締め（問い・問い → アーカイブ・問い → 誘い）なら出さない", not (to_close or to_archive or to_invite)),
            ("答えの次が出来事・引っ張りなら出さない", not (to_event or to_pull)),
            ("答えの次が反応でも、turn に o（o・oc）があれば出さず、- なら出す", not turn_o and not turn_oc and turn_no == [(4, True)]),
            (f"短い反応のあと3秒のうちに引っ張りが始まれば出さない（{short}）", not short),
            (f"長い反応（3秒を越える）のあとなら出す（{long_}）", long_ == [(4, True)]),
            ("spec の why の【答】を読む", [h.line for h in hits_of(L, in_spec, "L-ANSNEXT")] == [4]),
            ("kind が無い・【答】が無ければ「見ていない」", "L-ANSNEXT" in no_kind and "L-ANSNEXT" in no_ans)]


V5, V9 = "approved/2EKBYEnv850_p1_v5", "approved/bg-boza_p1_v9"   # あやと #1441「ブラッシュアップ完璧」の2本
NEW = ("L-CLIFF", "T-HOOK", "L-NUM38", "L-VOICE0", "L-BANG")          # 2026-11-25 に足した規則
# 直近の古い原稿（ヨーグルト・屋根裏25人部屋）の2行目と、出した本の2行目（診断 1.3.1）
OLD2 = ("やってきたのは、ブルガリアの首都ソフィア！", "北マケドニアから、ブルガリアの首都ソフィアへバス移動！",
        "首都からバスで、紅葉のマトカ渓谷へ！", "海外に住んで二年になるけど、そろそろ日本が恋しい！", "最近、パン作りにハマってるんやけど、",
        "ヒッチハイクでタリンに着いて、パン休憩！", "明日焼くのは、こねたら一晩ほったらかすだけのパン！")


def new_hits(L, c):
    return [(h.rule, h.line, h.look) for h in L.lint(c, BEFORE)["hits"] if h.rule in NEW]


def leg_cliff(L):
    def got(second):
        return [(h.line, h.look) for h in hits_of(L, ctx(L, ["題", second, "みんなは？"]), "L-CLIFF")]
    old = {s: got(s) for s in OLD2}
    ok = {s: got(s) for s in ("街なかの蛇口から、温泉が出てた。", "ヨーグルトの棚で、麦の絵の瓶を見つけた。", "まずは嗅いでみたら……",
                              "7年愛用したパソコンの画面が壊れた！", "この国、物価がぶっ壊れてんねん。")}
    v = {rel: [x for x in new_hits(L, fix(L, rel)) if x[0] == "L-CLIFF"] for rel in (V5, V9)}
    return [(f"古い2行目（ヨーグルト・屋根裏ほか {len(OLD2)}本）を2行目で ✕"
             + (f" ← {[s for s, h in old.items() if h != [(2, False)]]}" if any(h != [(2, False)] for h in old.values()) else ""),
             all(h == [(2, False)] for h in old.values())),
            (f"出来事・引っ張り（「まずは〜たら……」）・常識と逆の言い切りの2行目は通す（{[s for s, h in ok.items() if h]}）",
             not any(ok.values())),
            ("温泉 v5・ボザ v9 には当たらない", not any(v.values())),
            ("3行目より後の前置きは見ない", not hits_of(L, ctx(L, ["題", "鍋を開けたら……", "やってきたのは、ソフィア！", "みんなは？"]), "L-CLIFF"))]


def leg_hook(L):
    def got(visual=None, hook=None):
        row = {"line": "題", **({"visual": visual} if visual is not None else {}), **({"hook": hook} if hook else {})}
        c = L.Ctx(lines=["題", "みんなは？"], title_card=None, title_from="足", rows=[row, {"line": "みんなは？"}])
        res = L.lint(c, TODAY)
        return [(h.line, h.look) for h in res["hits"] if h.rule == "T-HOOK"], "T-HOOK" in res["blind"]
    card = got("前半= あやと島カード 11-13（いちごの瓶）／後半= 配信 1:37:23（瓶を傾けて飲む）")
    cross = got("前半= 配信 0:15:55（広場へ渡る横断歩道・青空）／後半= 配信 1:35:05")
    later = got("0.0〜1.3 配信 0:29:08（蛇口の湯が口に入る）→ 1.5〜2.8 ガイドの写真")
    v = {rel: [x for x in new_hits(L, fix(L, rel)) if x[0] == "T-HOOK"] for rel in (V5, V9)}
    return [("頭がカード・横断歩道の画を △（✕ にしない）", card == ([(1, True)], False) and cross == ([(1, True)], False)),
            ("頭が最中の画で、写真が1.5秒目からなら通す", later == ([], False)),
            ("hook に「最中」と書けば、頭の字にかかわらず通す", got("あやと島カード", "最中") == ([], False)),
            ("hook が「景色」なら △", got("配信 0:01:00", "景色") == ([(1, True)], False)),
            ("visual も hook も無ければ「見ていない」", got() == ([], True)),
            ("温泉 v5・ボザ v9 には当たらない", not any(v.values()))]


def leg_num38(L):
    def got(lines):
        return [(h.line, h.look) for h in hits_of(L, ctx(L, lines), "L-NUM38")]
    t = "ブルガリアで温泉を飲んでみたら、激まずすぎた！"
    return [("題の直後の行に数（100度）があれば通す", not got([t, "100度とかあったらどうしよう……", "みんなは？"])),
            ("漢字の数（百度）も数える", not got([t, "百度とかあったらどうしよう……", "みんなは？"])),
            ("8秒までに数が無ければ2行目に △", got([t, "街なかの蛇口から、温泉が出てた。", "まずは嗅いでみたら……", "なんか、コケの匂い",
                                            "100度とかあったらどうしよう……"]) == [(2, True)]),
            ("題の数は数えない", got(["温泉を3回飲んでみた！", "街なかの蛇口から、温泉が出てた。"]) == [(2, True)]),
            ("ボザ v9（4行目の1L）は通す", not [x for x in new_hits(L, fix(L, V9)) if x[0] == "L-NUM38"])]


def leg_voice0(L):
    def got(voice_at):
        lines = ["ブルガリアで温泉を飲んでみたら、激まずすぎた！", "街なかの蛇口から、温泉が出てた。", "まずは嗅いでみたら……",
                 "なんか、コケの匂い", "100度とかあったらどうしよう……", "思い切って触ってみたら……", "あちあちちあちちちちち！"]
        rows = [{"line": ln, **({"orig_voice": "0:22:00〜0:22:02"} if i == voice_at else {})} for i, ln in enumerate(lines, 1)]
        c = L.Ctx(lines=lines, title_card=None, title_from="足", rows=rows, has_spec=True)
        return [h.look for h in hits_of(L, c, "L-VOICE0")]
    blind = L.lint(ctx(L, ["題", "みんなは？"]), TODAY)["blind"]
    return [("4行目（見込み 7.7秒）の本人の声なら通す", got(4) == []),
            ("7行目（8秒より後）の本人の声だけなら △", got(7) == [True]),
            ("spec が無ければ「見ていない」", "L-VOICE0" in blind),
            ("温泉 v5（4行目が本人の声）は通す", not [x for x in new_hits(L, fix(L, V5)) if x[0] == "L-VOICE0"])]


def leg_bang(L):
    def got(n_bang, peak=None):
        lines = ["題！"] + [f"{i}行目！" if i <= n_bang + 1 else f"{i}行目。" for i in range(2, 12)] + ["みんなは？"]
        rows = [{"line": ln} for ln in lines]
        ans = set()
        if peak == "答":
            ans = {2}
        elif peak == "声":
            rows[1]["orig_voice"] = "0:10:00〜0:10:02"
        elif peak == "大":
            rows[1]["big"] = True
        c = L.Ctx(lines=lines, title_card=None, title_from="足", rows=rows, answer_marked=ans)
        return [(h.line, h.look) for h in hits_of(L, c, "L-BANG")]
    return [("山でない「！」が5行なら通す（題の「！」は数えない）", got(5) == []),
            ("6行なら △", got(6) == [(None, True)]),
            ("6行のうち1行が【答】・本人の声・【大】なら通す", got(6, "答") == [] and got(6, "声") == [] and got(6, "大") == []),
            ("温泉 v5・ボザ v9 は通す", not [x for x in new_hits(L, fix(L, V5)) + new_hits(L, fix(L, V9)) if x[0] == "L-BANG"])]


BASELINE = ["東欧を回ってる", "ブルガリアでバスに乗る", "お菓子を買って気分を上げる", "景色が綺麗", "着いたら夜で疲れた",
            "ルーマニアは綺麗らしいから楽しみ"]   # #1446 のあやとの基本線


def leg_base(L):
    def got(persona="将来の海外旅の情報として見たい人", baseline=BASELINE, as_of=TODAY, spec=True):
        lines = ["🇧🇬ブルガリアからルーマニア行きのバス移動してみた！", "みんなは乗ってみたい？"]
        c = L.Ctx(lines=lines, title_card=None, title_from="足", rows=[{"line": ln} for ln in lines], has_spec=spec,
                  persona=persona, baseline=baseline)
        res = L.lint(c, as_of)
        return "L-BASE" in res["blind"], [(h.line, h.look) for h in res["hits"] if h.rule == "L-BASE"]
    return [("persona（情報）と基本線6行があれば通す", got() == (False, [])),
            ("persona が無ければ ✕", got(persona=None)[1] == [(0, False)]),
            ("ペルソナ3つのどれも名指さない persona（「旅好き」）は ✕", got(persona="旅好き")[1] == [(0, False)]),
            ("基本線が4行・8行なら ✕", got(baseline=BASELINE[:4])[1] == [(None, False)]
             and got(baseline=BASELINE + ["宿に着いた", "寝た"])[1] == [(None, False)]),
            ("spec が無ければ「見ていない」", got(spec=False)[0]),
            ("あやとのコメント（2026-11-26:7192063851）より前の時点では当てない",
             got(persona=None, as_of="2026-11-26:7191788789")[1] == [])]


def leg_kind_turn(L):
    """F-093 spec の全部の行に kind と turn。無い・決まりに無い字は ✕。spec が無ければ「見ていない」。"""
    lines = ["🇧🇬ブルガリアの温泉に行ってみた！", "入ったら……", "みんなは入ってみたい？"]
    good = [{"line": lines[0], "kind": "題", "turn": "o"}, {"line": lines[1], "kind": "引っ張り", "turn": "o"},
            {"line": lines[2], "kind": "締め", "turn": "c"}]

    def got(rows, spec=True):
        c = L.Ctx(lines=lines, title_card=None, title_from="足", rows=rows, has_spec=spec)
        res = L.lint(c, TODAY)
        return "L-KIND" in res["blind"], sorted((h.line, h.look) for h in res["hits"] if h.rule == "L-KIND")
    no_kind = [dict(good[0]), {"line": lines[1], "turn": "o"}, dict(good[2])]
    no_turn = [dict(good[0]), dict(good[1]), {"line": lines[2], "kind": "締め"}]
    odd = [dict(good[0]), {"line": lines[1], "kind": "ひっぱり", "turn": "x"}, dict(good[2])]
    return [("全部の行に kind と turn があれば通す", got(good) == (False, [])),
            ("kind の無い2行目を ✕", got(no_kind)[1] == [(2, False)]),
            ("turn の無い3行目を ✕", got(no_turn)[1] == [(3, False)]),
            ("決まりに無い kind と turn は2つとも ✕", got(odd)[1] == [(2, False), (2, False)]),
            ("全部の行に無くても、欄ごとに1つの ✕ にまとめる", got([{"line": ln} for ln in lines])[1] == [(1, False), (1, False)]),
            ("spec が無ければ「見ていない」", got(None, spec=False)[0])]


def leg_shape(L):
    """F-052 spec に回の型（shape）が無ければ ✕。「配信」でない型の回には、配信の回の型の規則（L-END・L-ASK・L-DESU…）を当てない。"""
    lines = ["🇸🇪スウェーデンの親友に会いに行ったお話", "ポーランドから1,377km、ヒッチハイクだけで旅をしました。",
             "僕にとって一生忘れられない宝物になった。"]

    def got(shape, spec=True):
        c = L.Ctx(lines=lines, title_card=None, title_from="足", rows=[{"line": ln} for ln in lines], has_spec=spec, shape=shape)
        res = L.lint(c, TODAY)
        return {h.rule for h in res["hits"]}, res
    none_rules, _ = got(None)
    stream_rules, stream = got("配信")
    novel_rules, novel = got("小説の語り")
    built = L.build(FIX / "approved/passed7/ro-move_p5" / "script.txt")
    with tempfile.TemporaryDirectory() as td:
        sc = Path(td) / "script.txt"
        sc.write_text("\n".join(lines) + "\n", encoding="utf-8")
        (Path(td) / "spec.json").write_text(json.dumps({"shape": "小説の語り", "rows": [{"line": ln} for ln in lines]},
                                                       ensure_ascii=False), encoding="utf-8")
        read = L.build(sc).shape
    return [("shape の無い spec は L-SHAPE ✕", "L-SHAPE" in none_rules),
            ("shape「配信」なら L-SHAPE は通り、配信の回の型の規則も外さない",
             "L-SHAPE" not in stream_rules and not stream["off"]),
            ("shape「小説の語り」なら、配信の回の型の規則（L-END・L-ASK・L-DESU・L-NARRATOR・T-CARD・T-READ・L-NEXT）を当てない",
             "L-SHAPE" not in novel_rules and not set(novel["ran"]) & {"L-END", "L-ASK", "L-DESU"}
             and {"L-END", "L-ASK", "L-DESU", "L-NARRATOR", "T-CARD", "T-READ", "L-NEXT"} <= set(novel["off"])),
            ("配信の回の型でない規則（L-LENGTH・L-INNER）は、型が違っても当てる", {"L-LENGTH", "L-INNER"} <= set(novel["ran"])),
            (f"spec の shape を読む（「{read}」。無い本物の spec は None）", read == "小説の語り" and built.shape is None),
            ("spec が無ければ「見ていない」", "L-SHAPE" in L.lint(L.Ctx(lines=lines, title_card=None, title_from="足", rows=None), TODAY)["blind"])]


def leg_voicen(L):
    def got(n, spec=True):
        lines = [f"{i}行目" for i in range(1, 9)]
        rows = [{"line": ln, **({"orig_voice": "0:10:00〜0:10:02"} if 2 <= i < 2 + n else {})} for i, ln in enumerate(lines, 1)]
        c = L.Ctx(lines=lines, title_card=None, title_from="足", rows=rows, has_spec=spec)
        res = L.lint(c, TODAY)
        return "L-VOICEN" in res["blind"], [h.look for h in res["hits"] if h.rule == "L-VOICEN"]
    return [("本人の声の行が3つなら通す", got(3) == (False, [])),
            ("2つなら △（✕ にはしない）", got(2) == (False, [True])),
            ("spec が無ければ「見ていない」", got(0, spec=False)[0])]


def leg_new_fixtures(L):
    """温泉 v5・ボザ v9 は今日の決まりで ✕ 0（当て表 L-ATE は控えに入れていないので外す）。"""
    out = []
    for rel in (V5, V9):
        # L-SHAPE（回の型。2026-11-27）は2本が通ったあとの決まり。2本の spec は配信の回の型のまま shape の欄を持たない
        f = [h.rule for h in fails(L, fix(L, rel)) if h.rule not in ("L-ATE", "L-BASE", "L-BUY", "L-SHAPE")]
        out.append((f"{rel} は今日の決まりで ✕ 0" + (f" ← {f}" if f else ""), not f))
    return out


def hypo_problems(rules, playbook: str) -> list:
    """規則と仮説の台帳の名指しの崩れ。台帳の行は「| N5 | …」で始まり、その行に規則の名前がある。研究の規則は出どころの issue（#1403）を持つ。"""
    out = []
    for r in rules:
        if not (r.ledger or r.hypo or r.src):
            out.append(f"{r.id} が帳面の ID も仮説の番号も出どころの issue も持たない")
        out += [f"{r.id} の出どころ {s} が issue の形（#1403）でない" for s in r.src if not re.fullmatch(r"#\d+", s)]
        for h in r.hypo:
            row = next((ln for ln in playbook.splitlines() if ln.startswith(f"| {h} |")), None)
            if row is None:
                out.append(f"{r.id} が指す {h} が playbook.md の台帳に無い")
            elif r.id not in row:
                out.append(f"playbook.md の {h} の行に {r.id} が書いてない")
    return out


def leg_hypo_link(L):
    pb = PLAYBOOK.read_text(encoding="utf-8")
    got = hypo_problems(L.RULES, pb)
    wide = next((r for r in L.RULES if r.id == "L-WIDE"), None)
    stray = hypo_problems([L.Rule("L-NONE", (), "2026-11-11", "x", lambda _: [], hypo=("N99",))], pb)
    bare = hypo_problems([L.Rule("L-BARE", (), "2026-11-11", "x", lambda _: [])], pb)
    odd = hypo_problems([L.Rule("L-ODD", (), "2026-11-23", "x", lambda _: [], src=("1403",))], pb)
    ids = ("L-RUN", "L-ANSNEXT") + NEW
    research = [r for r in L.RULES if r.id in ids]
    led = LEDGER_MD.read_text(encoding="utf-8")
    return [(f"規則 {len(L.RULES)} がどれも帳面の ID か台帳の番号か出どころの issue を持ち、台帳の行が規則の名前を書いている"
             + (f" ← {got}" if got else ""), not got),
            ("L-WIDE は帳面の ID を持たず、台帳の N5 を持つ", wide is not None and wide.ledger == () and wide.hypo == ("N5",)),
            ("帳面（ayato_feedback.md）に L-WIDE が無い（あやとの指摘ではない）", "L-WIDE" not in led),
            (f"{'・'.join(ids)} は帳面の ID も台帳の番号も持たず、出どころ #1403 だけを持つ（研究の決まり）",
             len(research) == len(ids) and all(r.ledger == () and r.hypo == () and r.src == ("#1403",) for r in research)),
            ("帳面にこれらの規則の名前が無い（帳面の当てる場所から名指さない）", not any(f"lint:{i}" in led for i in ids)),
            ("台帳に無い番号（N99）を指す規則を拾う", any("N99" in p for p in stray)),
            ("どれも持たない規則を拾う", any("L-BARE" in p for p in bare)),
            ("issue の形でない出どころ（1403）を拾う", any("L-ODD" in p for p in odd))]


# ---- 2026-11-27: 2回以上言われたのに人の目だけだった項目の規則 ----
def rows_of(lines, over=None):
    """原稿の行の数だけの spec の行（over は 行番号 → 欄）。"""
    return [dict({"line": ln}, **(over or {}).get(i, {})) for i, ln in enumerate(lines, 1)]


def sctx(L, lines, rows=None, **kw):
    """spec を読んだ形の Ctx。"""
    return L.Ctx(lines=list(lines), title_card=kw.pop("title_card", None), title_from="足", rows=rows or rows_of(lines),
                 has_spec=True, **kw)


def leg_gourmet(L):
    bad = hits_of(L, ctx(L, ["北マケドニアの行列店に並んだら、大当たりやった！", "AIに聞いたら、名物はチェバピ", "みんなは？"]), "L-GOURMET")
    good = hits_of(L, ctx(L, ["北マケドニアの行列店の大衆食堂を食べてみた！", "この炭で焼いてるチェバピって言うのが食べたい！", "みんなは？"]), "L-GOURMET")
    other = hits_of(L, ctx(L, ["ルーマニア行きのバスが大当たりやった！", "AIに聞いたら、7時間かかるらしい。", "みんなは？"]), "L-GOURMET")
    return [("題「行列店に並んだら、大当たりやった！」（行 1）と「AIに聞いたら、名物は」（行 2）を ✕",
             [(h.line, h.look) for h in bad] == [(1, False), (2, False)]),
            ("あやとの直し（大衆食堂を食べてみた・炭で焼いてるチェバピが食べたい）は通す", not good),
            ("グルメでない回（バス）は見ない", not other)]


def leg_town(L):
    t = lambda title: [(h.line, h.look) for h in hits_of(L, ctx(L, [title, "みんなは？"]), "T-TOWN")]  # noqa: E731
    return [("「イギリスのエディンバラで、羊の内臓料理ハギスを食べてみた！」は街と内臓で ✕ 2",
             t("イギリスのエディンバラで、羊の内臓料理ハギスを食べてみた！") == [(1, False), (1, False)]),
            ("あやとの直し「イギリスのめちゃくちゃ美味しい料理、ハギスを食べてみた！」は通す",
             t("イギリスのめちゃくちゃ美味しい料理、ハギスを食べてみた！") == []),
            ("街歩きの題（「エディンバラを、1日で回ったら」。あやとが通した）は △ だけ",
             t("イギリスのエディンバラを、1日で回ったらやばかった！") == [(1, True)]),
            ("知られた街（パリ）の題は見ない", t("パリで本場のクロワッサンを食べてみた！") == [])]


def leg_easy(L):
    bad = ["フォカッチャ、海外の宿でも簡単すぎた！", "あとは2つの生地を鉄板に移すだけやのに", "うわあ、最悪や！", "みんなは作ってみたい？"]
    good = ["フォカッチャ、海外の宿でも簡単すぎた！", "朝起きて打ち粉して1時間2次発酵すると...", "あとは鉄板に移して230℃で30分 Vai! Vai!",
            "みんなは作ってみたい？"]
    other = ["ルーマニアのバスで最悪や！", "みんなは？"]
    got = [(h.line, h.look) for h in hits_of(L, ctx(L, bad), "T-EASY")]
    return [(f"p1 の「うわあ、最悪や！」（行 3）と、数の無い原稿を ✕ ← {got}", got == [(3, False), (None, False)]),
            ("あやとの直し（1時間・230℃で30分）は通す", not hits_of(L, ctx(L, good), "T-EASY")),
            ("題が「簡単」でない回は見ない", not hits_of(L, ctx(L, other), "T-EASY"))]


def leg_pitch(L):
    bad = hits_of(L, ctx(L, ["海外の宿で、うどんを一から作ってみた！", "海外でも日本を感じたくて、宿で一から挑戦！", "みんなは？"]), "L-PITCH")
    good = hits_of(L, ctx(L, ["海外の宿で、うどんを一から作ってみた！", "海外に住んで二年になるけど、そろそろ日本が恋しい！", "みんなは？"]), "L-PITCH")
    close = hits_of(L, ctx(L, ["題", "宿に着いた。", "みんなも、海外で挑戦！"]), "L-PITCH")
    return [("「海外でも日本を感じたくて、宿で一から挑戦！」（行 2）を ✕", [(h.line, h.look) for h in bad] == [(2, False)]),
            ("あやとの直し「そろそろ日本が恋しい！」は通す", not good),
            ("締めの行は見ない", not close)]


def leg_setup(L):
    v4 = ["ブルガリアの食堂でお任せしたら、まさかの料理が出てきた！", "市場の食堂へ。", "名物のムサカ、食べたかったんよ。",
          "おばちゃんにお任せしたら……", "まさかの、食べたかったムサカや！", "みんなは？"]
    a = ["題", "せっかくやし、伝統料理が食べたい。", "おばちゃんにお任せしたら……", "まさかの、食べたかったムサカや！", "みんなは？"]
    sign = ["題", "店の前に、ムサカの看板があった。", "お任せしたら……", "まさかのムサカや！", "みんなは？"]
    got = [(h.line, h.look) for h in hits_of(L, ctx(L, v4), "L-SETUP")]
    return [(f"ago-a-v4 の「名物のムサカ、食べたかったんよ。」（行 3）を ✕ ← {got}", got == [(3, False)]),
            ("あやとが通した A（「伝統料理が食べたい」は落ちの物を名指さない）は通す", not hits_of(L, ctx(L, a), "L-SETUP")),
            ("願いでない行（看板にあった）は前ふりに数えない", not hits_of(L, ctx(L, sign), "L-SETUP"))]


def leg_buy(L):
    p4 = ["題", "ブルガリアでハマった、小麦で作る甘酒のボザも購入！", "みんなは？"]
    p5 = ["題", "ブルガリアでハマった、小麦で作る甘酒のボザも購入！", "500mlで80円ぐらい、安っ！", "みんなは？"]
    neg = ["題", "まだ買ってないけど、ボザが気になる！", "みんなは？"]
    why = L.Ctx(lines=p4, title_card=None, title_from="足", rows=None, no_price="配信 1:00〜1:20 の字幕に値段が無い")
    return [("p4 の「ボザも購入！」（値段なし。行 2）を ✕", [(h.line, h.look) for h in hits_of(L, ctx(L, p4), "L-BUY")] == [(2, False)]),
            ("あやとの直し（500mlで80円ぐらい）は通す", not hits_of(L, ctx(L, p5), "L-BUY")),
            ("買っていない回（「まだ買ってないけど」）は見ない", not hits_of(L, ctx(L, neg), "L-BUY")),
            ("配信で値段を言っていない訳（spec の no_price）があれば通す", not hits_of(L, why, "L-BUY"))]


PLAN_OK = "## 3案の比べ\n\n| | A 揚げパン | B 夢 |\n| --- | --- | --- |\n| 土台 | 2〜4行 | 4行 |\n| 山 | 6〜11行 | 2〜14行 |\n| 結末 | 12 | 15 |\n| 終わり | 問い | 問い |\n"
PLAN_ROWS = "## 3案の比べ\n\n| 案 | 型 | 土台 | 山 | 結末 | 終わり |\n| --- | --- | --- | --- | --- | --- |\n| **A** | グルメ | 2行 | 3〜5行 | 6行 | — |\n"
PLAN_OLD = "## 3案の比べ\n\n| | A |\n| --- | --- |\n| 土台 | 2行 |\n| 山 | 3行 |\n| オチ | 6行 |\n| 問い | みんなは？ |\n"
PLAN_JOINT = "## 3案の比べ\n\n| 案 | 型 |\n| --- | --- |\n| A | グルメ |\n\n## A案 グルメ\n\n| 項目 | 中身 |\n| --- | --- |\n| 土台・山・結末 | 土台 2行／山 3〜5行／結末 6行 |\n| 終わり | question |\n"


def leg_four(L):
    def got(plan, option="A"):
        c = L.Ctx(lines=["題", "みんなは？"], title_card=None, title_from="足", rows=None, plan=plan, option=option)
        res = L.lint(c, TODAY)
        return "L-FOUR" in res["blind"], [(h.line, h.look) for h in res["hits"] if h.rule == "L-FOUR"]
    return [("4つの柱が全部ある案は通す", got(PLAN_OK) == (False, [])),
            ("案が行の表で「終わり」が — なら ✕", got(PLAN_ROWS) == (False, [(None, False)])),
            ("前の書きかた（オチ・問い）も柱に数える", got(PLAN_OLD) == (False, [])),
            ("「土台・山・結末」の1つの欄と、案の節の終わりを読む", got(PLAN_JOINT) == (False, [])),
            ("plan.md が無い・案の列が無い（D）なら「見ていない」", got(None)[0] and got(PLAN_OK, "D")[0])]


def leg_mood(L):
    def got(n, total, name="up_pop"):
        lines = [f"{i}行目" for i in range(1, total + 1)]
        rows = rows_of(lines, {i: {"mood": name} for i in range(2, 2 + n)})
        return [(h.line, h.look) for h in hits_of(L, sctx(L, lines, rows), "L-MOOD")]
    blind = "L-MOOD" in L.lint(ctx(L, ["題", "みんなは？"]), TODAY)["blind"]
    return [("17行で9行（地下鉄 p1 の 0.53）は ✕", got(9, 17) == [(None, False)]),
            ("16行で8行（半分ちょうど）は通す", got(8, 16) == []),
            ("様式に無い名前（anxious）は △ だけ", got(1, 10, "anxious") == [(2, True)]),
            ("spec が無ければ「見ていない」", blind)]


def leg_shout(L):
    lines = ["題", "ああっ！沼にはまった！", "うまっ！めっちゃ濃厚！", "みんなは？"]
    ai = [(h.line, h.look) for h in hits_of(L, sctx(L, lines), "L-SHOUT")]
    own = hits_of(L, sctx(L, lines, rows_of(lines, {2: {"orig_voice": "0:10:20〜0:10:22"}})), "L-SHOUT")
    blind = "L-SHOUT" in L.lint(ctx(L, lines), TODAY)["blind"]
    return [(f"「ああっ！沼にはまった！」を AI の声で読むと ✕（行 2。「うまっ！」は叫びに数えない）← {ai}", ai == [(2, False)]),
            ("配信の本人の声（orig_voice）なら通す", not own),
            ("spec が無ければ「見ていない」", blind)]


NEW27 = ("L-GOURMET", "T-TOWN", "T-EASY", "L-PITCH", "L-SETUP", "L-BUY", "L-FOUR", "L-MOOD", "L-SHOUT")
# あやとが通した7本（①〜④と p5 の3本）。名前 → (原稿, 通した時点。p5 の2本はまだ出していないので今日)
PASSED7 = {"KjB_aBsTIf0_p1_A": ("script_A.txt", "2026-11-26:7188529428"), "sOvaH0tBzSg_p1_C": ("script_C.txt", "2026-11-26:7188422917"),
           "aGOz5otlEs8_p1_A": ("script_A.txt", "2026-11-26:7191714724"), "tr_YBmyLGUc_p1_D": ("script_D.txt", "2026-11-26:7191788789"),
           "ro-move_p5": ("script.txt", "2026-11-27:7205947005"), "vXYYLJy1Uyc_p5": ("script.txt", TODAY),
           "YLda-SgcF6k_p5": ("script.txt", TODAY)}


def leg_passed7(L):
    """通した7本に、2026-11-27 に足した規則の ✕ が出ない（通した時点で）。今日の決まりで当たるのは④の L-BUY だけ（承認が F-102 より前）。"""
    out = []
    for name, (script, at) in PASSED7.items():
        c = fix(L, f"approved/passed7/{name}", script)
        then = [h.rule for h in fails(L, c, at) if h.rule in NEW27]
        now = [h.rule for h in fails(L, c) if h.rule in NEW27]
        want = ["L-BUY"] if name == "tr_YBmyLGUc_p1_D" else []
        out.append((f"{name} は通した時点（{at}）で新しい規則の ✕ 0・今日は {want or '0'}" + (f" ← {then}・{now}" if then or now != want else ""),
                    not then and now == want))
    return out


LEGS = {
    "approved": leg_approved, "later_rule_live": leg_later_rule_live, "miete": leg_miete,
    "title_real": leg_title_real, "title_metaphor": leg_title_metaphor, "title_hide": leg_title_hide, "flag": leg_flag,
    "narrator": leg_narrator, "phrase": leg_phrase, "yen": leg_yen, "length": leg_length,
    "retired": leg_retired, "end": leg_end, "ashi": leg_ashi, "sorry": leg_sorry, "as_of": leg_as_of, "cli": leg_cli,
    "card": leg_card, "sec": leg_sec, "after": leg_after, "num": leg_num, "quote": leg_quote,
    "ask": leg_ask, "desu": leg_desu,
    "title_read": leg_title_read, "next_time": leg_next_time,
    "inner": leg_inner, "nick": leg_nick, "particle": leg_particle, "ate": leg_ate,
    "as_of_id": leg_as_of_id, "spec_rows": leg_spec_rows,
    "wide": leg_wide, "width_median": leg_width_median, "hypo_link": leg_hypo_link,
    "prev": leg_prev, "pickwhy": leg_pickwhy, "tenki": leg_tenki,
    "run": leg_run, "ansnext": leg_ansnext,
    "cliff": leg_cliff, "hook": leg_hook, "num38": leg_num38, "voice0": leg_voice0, "bang": leg_bang, "new_fixtures": leg_new_fixtures,
    "base": leg_base, "voicen": leg_voicen, "kind_turn": leg_kind_turn, "shape": leg_shape,
    "gourmet": leg_gourmet, "town": leg_town, "easy": leg_easy, "pitch": leg_pitch, "setup": leg_setup, "buy": leg_buy,
    "four": leg_four, "mood": leg_mood, "shout": leg_shout, "passed7": leg_passed7,
}

if __name__ == "__main__":
    sys.exit(legs.main(Path(__file__).resolve(), LEGS, CUTS, setup))
