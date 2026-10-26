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
| `ayato` | spec の why が「あやとの題」「あやとの書き足し」「あやとの添削」「あやと #NNN「…」」の行に【あやと】、言い換えの「あやとの言葉 #976 を…」には付けない。`orig_voice` のある行に【元の声】（F-051） |
| `c_source` | 批評役の1枚に、`--video` の配信の字幕が入る（フォカッチャの下書きなら、作文者が根拠に挙げた 2:44:00 の行）。`--video` が無ければ「渡していない」と書く（#1014、F-047） |
| `c_ranges` | 字幕の区間は、spec の why・src に書いた時刻の前後30秒。重なる区間は1つにまとめ、src の小数の秒も読む |
| `c_leak` | 批評役の雛形は、対照の原稿の行を8字以上そのまま引かない（終わりの形「アーカイブ見てね」は数えない）。引いた字をこしらえると拾い、1枚を作らずに止まる |
| `c_cards` | 批評役の1枚に、作文者と同じカード（ID の見出しが全部）と「当てる ID」の並びが入る |
| `rows_stop` | spec が `rows` でなく `lines` で書いてあれば、批評役の1枚を作らずに止まる（滝の回 p1 は、画の列が空のまま回っていた） |
| `w_fixed` | 作文者の1枚に、`--title` の題の札（1行目でそのまま読む）と `--next` の次の配信を書き、表の1行目に札の字を入れる。札に助詞の抜けがあれば、直す字と一緒に書く（F-049）。無ければ「指定なし」。表は4欄（4欄目が「選んだ理由」。あやと #1019） |
| `w_order` | 作文者の1枚は、約束のカード → 方針 → 書く形 → 当て表 → 材料（配信の字幕）の順。カードが先頭で、字幕はいちばん後ろ |
| `w_nochat` | 作文者の1枚にチャットの本文が1行も入らない（同じ区間のチャットがあっても、本人が読み上げて自動字幕に入っていても。読み上げは〔コメントの読み上げ〕に伏せる）。`--chat` を渡すと止まる（F-048） |
| `w_ate` | 当て表の雛形（表と spec の promises の形）に、カードの ID が全部・1回ずつ並ぶ |
| `w_watch` | 字幕に配信の中の呼び名（ポチ）・コメントへの言及があれば、時刻と言葉だけを書く（字幕の文は写さない） |

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
    "c_cards": ("brief.py", '        "cards": cards(avoid=c.lines),\n', '        "cards": "",\n', {"c_cards"}, "批評役の1枚にカードを入れない"),
    "w_chat": ("brief.py", "    if chat:\n        raise ValueError", "    if False:\n        raise ValueError", {"w_nochat"},
               "--chat を黙って受け取る"),
    "w_particle": ("brief.py", "        if drops:\n", "        if False:\n", {"w_fixed"}, "題の札の助詞の抜けを作文者に書かない"),
    "w_reason": ("brief.py", ' | 残した本人の言葉 | 選んだ理由 |\",\n', ' | 残した本人の言葉 |\",\n', {"w_fixed"},
                 "表の4欄目（選んだ理由）を外す"),
    "orig_voice": ("brief.py", '    if r.get("orig_voice"):\n', "    if False:\n", {"ayato"}, "元の声の行に印を付けない"),
    "w_mask": ("brief.py", "            if b in ln:\n", "            if False:\n", {"w_nochat"}, "字幕の中のコメントの読み上げを伏せない"),
    "w_watch": ("brief.py", "        at = [ln.split(\"]\", 1)[0].lstrip(\"[\") for ln in lines if lint_mod.nick_at(ln, bad)]\n",
                "        at = []\n", {"w_watch"}, "字幕の呼び名を作文者に書かない"),
    "ranges": ("brief.py", "        if not any(a - step < t <= b for a, b in ranges):\n", "        if False:\n",
               {"ranges", "c_source"}, "区間の外の行まで入れる"),
    "fill": ("brief.py", "    if left:\n", "    if False:\n", {"fill"}, "埋めていない所を見逃す"),
    "ayato": ("brief.py", '    if AYATO.search(why):\n', "    if False:\n", {"ayato"}, "【あやと】を付けない"),
    # 批評役の1枚の配信の字幕（#1014、F-047）
    "c_video": ("brief.py", "    if not video:\n", "    if True:\n", {"c_source"}, "批評役の1枚に配信の字幕を入れない"),
    "c_cited": ("brief.py", '        pts += [hms(t) for t in CITED.findall(text)]\n', "        pass\n", {"c_ranges", "c_source"},
                "spec の why・src の時刻を読まない"),
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
    return legs.load(HERE / "brief.py", "brief", (c[1], c[2]) if c and c[0] == "brief.py" else None)


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
    return [("字幕の呼び名「ポチ」を、時刻（0:00:00）と直す言葉（野良犬）つきで書く", "「ポチ」が 1 か所（0:00:00）" in got and "野良犬" in got),
            ("「ポチっと」は数えない", "（0:01:00" not in got),
            ("コメントに触れた時刻（0:00:30）を書く", "0:00:30「コメント」" in got),
            ("伏せた読み上げ（〔コメントの読み上げ〕）は「読み上げ」として数え、印の中の「コメント」は数えない",
             "0:02:00「読み上げ」" in B.watch_block(["[0:02:00] それ〔コメントの読み上げ〕やな"])),
            ("字幕の文はそのまま写さない", "道を教えてもらいました" not in got and "草原です" not in got)]


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
