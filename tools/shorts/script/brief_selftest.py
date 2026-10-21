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
"""
from __future__ import annotations

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
}


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


LEGS = {"cats": leg_cats, "grows": leg_grows, "machine": leg_machine, "holdout": leg_holdout, "pair": leg_pair,
        "chat": leg_chat, "ranges": leg_ranges, "fill": leg_fill, "ayato": leg_ayato}

if __name__ == "__main__":
    sys.exit(legs.main(Path(__file__).resolve(), LEGS, CUTS, setup))
