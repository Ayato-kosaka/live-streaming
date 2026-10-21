"""**作文者・批評役に渡す1枚（`brief.py`）の見張り。** 要るのは Python だけ。

    python3 tools/shorts/script/brief_selftest.py
    BREAK=cats python3 tools/shorts/script/brief_selftest.py   # 守りを1つ外した版で回す（対照の子）

終了コード 0=通った / 1=落ちた / 2=数えるものが無い・外す字が見つからない（`docs/island-standards.md` §15）。

1枚が崩れると、担当は「前に言われたこと」を知らないまま書く・採点する（帳面を全文で読ませるのをやめたので、1枚が唯一の道）。

| 足 | 確かめること |
| --- | --- |
| `cats` | 帳面の項目のうち、題・言い回し・事実・構成だけが入る（画・音・投稿・進め方は入らない）。項目は1つ以上 |
| `grows` | 帳面に項目を1つ足すと、手で直さずに1枚に入る |
| `machine` | 批評役の1枚では、当てる場所が lint だけの項目（F-032）を名前だけにする。作文者の1枚では全文 |
| `holdout` | 見ている原稿の行を引く帳面の例（銅像 p2 → F-039 の例）は、題だけ残して例を落とす。ほかの原稿では例を残す |
| `pair` | 「直す前 → 直した後」は、組と組の区切り（前後に空白の「／」）でだけ切る。引用の中の「／」では切らない |
| `chat` | チャットは名前を落として本文だけ（投げ銭の額は残す） |
| `ranges` | 書き起こしは、区間に掛かる30秒の行だけ |
| `fill` | 雛形の {{…}} が1つでも残れば止まる |
| `ayato` | spec の why が「あやとの題」「あやとの書き足し」「あやと #NNN「…」」の行に【あやと】、言い換えの「あやとの言葉 #976 を…」には付けない |

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
| `e_voice` | 声に渡す字の雛形は、spec の `tts_text`（無ければ行の字）・key は `<id>/NN`・bytes は UTF-8 のバイト数 |
"""
from __future__ import annotations

import json
import re
import sys
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
FIX = HERE / "fixtures"
sys.path.insert(0, str(HERE.parent / "feedback"))
import legs  # noqa: E402

CUTS = {
    "cats": ("brief.py", 'SCRIPT_CATS = ("題", "言い回し", "事実", "構成")\n',
             'SCRIPT_CATS = ("題", "言い回し", "事実", "構成", "画", "音", "投稿", "進め方")\n', {"cats"}, "原稿の段に効かない項目まで入れる"),
    "machine": ("brief.py", "    machine = [it for it in items if machine_only(it)] if for_critic else []\n", "    machine = []\n",
                {"machine"}, "lint だけの項目も批評役に全文で渡す"),
    "holdout": ("brief.py", "        if avoid and quotes_script(raw, avoid):\n", "        if False:\n",
                {"holdout"}, "見ている原稿の行を引く例も渡す"),
    "pair": ("brief.py", '    s = re.split(r"\\s+／\\s+", text.strip())[0]\n', '    s = re.split(r"\\s*／\\s*", text.strip())[0]\n',
             {"pair"}, "引用の中の「／」でも切る"),
    "chat": ("brief.py", '            rest = rest.split(": ", 1)[1] if ": " in rest else rest\n', "",
             {"chat"}, "チャットの名前を残す"),
    "ranges": ("brief.py", "        if not any(a - step < t <= b for a, b in ranges):\n", "        if False:\n",
               {"ranges"}, "区間の外の行まで入れる"),
    "fill": ("brief.py", "    if left:\n", "    if False:\n", {"fill"}, "埋めていない所を見逃す"),
    "ayato": ("brief.py", '    if AYATO.search(why):\n', "    if False:\n", {"ayato"}, "【あやと】を付けない"),
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
    c = CUTS[cut] if cut else None
    return legs.load(HERE / "brief.py", "brief", (c[1], c[2]) if c else None)


def leg_cats(B):
    items = B.ledger_items()
    cats = {it.category for it in items}
    return [("題・言い回し・事実・構成だけ", cats <= set(B.SCRIPT_CATS) and {"題", "構成"} <= cats),
            ("画（F-014）・進め方（F-044）は入らない", "F-014" not in B.ledger_block(False) and "F-044" not in B.ledger_block(False)),
            ("項目が1つ以上", len(items) > 0)]


def leg_grows(B):
    led = B.ledger_mod.load()
    text = B.ledger_mod.PATH.read_text(encoding="utf-8")
    add = ("### F-998 見張り用の決まり（足した項目）\n\n- **言われた:**\n  - 2026-10-21 チャット（見張り）\n- **分類:** 構成\n"
           "- **あやとの言葉:**\n  > 見張り\n- **決まり:** する — 見張り。しない — 無い\n- **直す前 → 直した後:** 前 → 後\n"
           "- **当てる場所:** 批評役 (h)\n\n## 指摘ではないコメント")
    led2 = B.ledger_mod.parse(text.replace("## 指摘ではないコメント", add, 1))
    return [("足した F-998 が1枚に入る", "F-998" in B.ledger_block(False, led2)),
            ("足す前は入っていない", "F-998" not in B.ledger_block(False, led))]


def leg_machine(B):
    critic, writer = B.ledger_block(True), B.ledger_block(False)
    return [("批評役の1枚では F-032（lint だけ）を「機械だけが見る」に名前だけ", "**F-032**" not in critic and "F-032" in critic),
            ("作文者の1枚では F-032 を全文で", "**F-032**" in writer)]


def leg_holdout(B):
    p2 = (FIX / "rejected/CKJvprUMOgA_p2_17/script.txt").read_text(encoding="utf-8").splitlines()
    other = ["ストックホルム来たら、地下鉄が高すぎた！", "みんなは？"]

    def ex(block, fid):
        part = block.split(f"**{fid}**", 1)[1].split("\n- **", 1)[0]
        return "例:" in part
    return [("銅像 p2 を見るときは、F-039 の例（銅像の行そのもの）を落とす", not ex(B.ledger_block(True, avoid=p2), "F-039")),
            ("ほかの原稿では F-039 の例を残す", ex(B.ledger_block(True, avoid=other), "F-039")),
            ("題（決まりの1行）は残す", "**F-039**" in B.ledger_block(True, avoid=p2))]


def leg_pair(B):
    s = B.first_pair("地下鉄「船も乗れるねん！／乗りたかったんよ、船！」→「船も乗れるねん！」 ／ 銅像「30体」→ 消す", 200)
    return [("引用の中の「／」では切らない", "乗りたかったんよ" in s), ("組の区切りでは切る", "銅像" not in s)]


def leg_chat(B):
    with tempfile.TemporaryDirectory() as td:
        p = Path(td) / "x.chat.txt"
        p.write_text("[0:01:00] たろう: こんばんは\n[0:01:10] ¥500 はなこ: 応援してます\n", encoding="utf-8")
        got = B.cut(p, [(0, 120)], 0, chat=True)
    return [("名前を落とす", got[0] == "[0:01:00] こんばんは"), ("投げ銭の額は残し、名前は落とす", got[1] == "[0:01:10] ¥500 応援してます")]


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
            ("言い換え「あやとの言葉 #976 を、まとめ役が言い換えた」には付けない",
             "【あやと】" not in B.marks({"why": "題（あやとの言葉 #976 を、まとめ役が言い換えた案 B）"})),
            ("【足】も印になる", B.marks({"why": "【足】ツッコミ"}) == "【足】")]


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
    return [("13文・key は A/01 から", len(v) == 13 and v[0]["key"] == "A/01" and v[-1]["key"] == "A/13" and v[0]["plan"] == "A"),
            ("声に渡す字は spec の tts_text（かなに直した字）", v[0]["tts_text"] == spec["rows"][0]["tts_text"] != spec["rows"][0]["line"]),
            ("字幕は行の字・bytes は UTF-8 のバイト数", v[0]["caption"] == spec["rows"][0]["line"]
             and all(x["bytes"] == len(x["tts_text"].encode("utf-8")) for x in v)),
            ("tts_text の無い行は、行の字をそのまま", bare[0]["tts_text"] == "みんなは？" and bare[0]["key"] == "p1/01")]


LEGS = {"cats": leg_cats, "grows": leg_grows, "machine": leg_machine, "holdout": leg_holdout, "pair": leg_pair,
        "chat": leg_chat, "ranges": leg_ranges, "fill": leg_fill, "ayato": leg_ayato,
        "e_ledger": leg_e_ledger, "e_check": leg_e_check, "e_lines": leg_e_lines, "e_secs": leg_e_secs,
        "e_plan": leg_e_plan, "e_streams": leg_e_streams, "e_fill": leg_e_fill, "e_others": leg_e_others,
        "e_pick": leg_e_pick, "e_cmds": leg_e_cmds, "e_voice": leg_e_voice}

if __name__ == "__main__":
    sys.exit(legs.main(Path(__file__).resolve(), LEGS, CUTS, setup))
