#!/usr/bin/env python3
"""`stream_notes_writer.py`（議事録を `claude -p` に書かせる道具）の見張り。**本物の `claude -p` は呼ばない。**

    python3 python/stream_notes_writer_selftest.py

空の置き場に streams/ の材料（字幕・チャット・manifest.tsv）と決まり（SKILL.md）をこしらえ、`call_model` を偽物に
差し替えて回す。偽物は「何回目の呼び出しで、どんな下書きを返すか」の筋書きどおりに返し、渡された1枚を控える。

見る足:
 1. 組むだけ（--prompt-only）: 呼ばない・置かない・頭の5行（投げ銭の件数と額）・頼む字数を目安より下げている
 2. 素性を伏せる: チャットの年齢・学年・住んでいる所・勤め先・本名・連絡先・自分の学校、字幕の年齢と本名は 〇〇。
    字幕の本人の話（住んでいる所）と、自分の学校と言っていない学校名は残す
 3. 伏せ残しを別の見かたで探す: 伏せる道具を外すと、呼ばずに 2 で落ちる。出力に字を出さない
 4. 書かせる: 1回で通れば置く。頭は機械の5行に差し替える（場所の行だけ返事の）
 5. 長すぎる: 下書きだけを渡す軽い1回で削らせる（字幕を渡し直さない）
 6. 短すぎる: 同じ会話の続き（--resume）で足させる
 7. 議事録に素性: 消させても残れば置かない（2）。出力に字を出さない
 8. 直らない: 3回で諦めて置かない（1）。前の議事録が在れば飛ばす・材料が無ければ 2
 9. 字幕の無い回・囲みと前置きの付いた返事
10. 議事録の側の見かた: 自分のことを言った形だけ当たり、ふつうの話（「20代の票」「月に住む」）には当たらない
"""
from __future__ import annotations

import argparse
import io
import json
import shutil
import sys
import tempfile
from contextlib import redirect_stdout
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parent
sys.path.insert(0, str(HERE))
import stream_notes_writer as sw  # noqa: E402
import stream_notes as sn  # noqa: E402

FAILS: list[str] = []
N = 0
STEM = "2026-11-03_2200_aaaaaaaaaaa"
SHORT = "2026-11-04_2200_bbbbbbbbbbb"
CHATONLY = "2026-11-05_2200_ccccccccccc"
NOMAT = "2026-11-06_2200_ddddddddddd"
SECRET = ["17歳", "高2", "大阪市", "山田太郎", "桜ヶ丘", "鈴木花子", "090-1234-5678", "フジ商事", "2008年生まれ"]


def ok(cond, what):
    global N
    N += 1
    if not cond:
        FAILS.append(what)
        print(f"  ✕ {what}")


def fixture(tmp: Path) -> Path:
    root = tmp / "repo"
    d = root / "streams/2026/11"
    d.mkdir(parents=True)
    skill = root / ".claude/skills/stream-notes"
    skill.mkdir(parents=True)
    shutil.copy(REPO / ".claude/skills/stream-notes/SKILL.md", skill / "SKILL.md")
    (root / "python/data/guide").mkdir(parents=True)
    (root / "python/data/guide/cities.json").write_text(json.dumps(
        {"countries": {"bg": {"cities": {"sofia": {"places": {"旧市街": {}, "ヴィトシャ大通り": {}}}}}}}, ensure_ascii=False))
    # 字幕は 4,000字前後（目安 1,000字・下限 850・上限 1,200）
    lines = ["# 🇧🇬ソフィアを歩く", "# https://www.youtube.com/watch?v=aaaaaaaaaaa", "# 開始: 2026-11-03 22:00"]
    lines += ["[0:00:10] ジョージアに住んでいる頃から気になってた", "[0:00:20] え、17歳なんだ。本名は山田太郎って言ってたね",
              "[0:00:30] ユニーク字幕語ヨーグルトの話"]
    lines += [f"[0:{m:02d}:{s:02d}] 旧市街を歩いて市場でパンを買った話をしている" for m in range(1, 59) for s in (0, 30)][:110]
    (d / f"{STEM}.transcript.txt").write_text("\n".join(lines) + "\n", encoding="utf-8")
    chat = ["# 🇧🇬ソフィアを歩く",
            "[0:00:15] @たろう-x1: 17歳の高2です。大阪市に住んでます。本名は鈴木花子。桜ヶ丘高校に通ってる",
            "[0:00:25] @花-y2: 090-1234-5678 にかけて！フジ商事に勤めてます。2008年生まれ",
            "[0:00:35] @b-z3: ソフィア大学きれい",
            "[0:00:45] ¥500 @たろう-x1: お土産代",
            "[0:00:55] ¥1,000 @花-y2: ヨーグルト代"]
    (d / f"{STEM}.chat.txt").write_text("\n".join(chat) + "\n", encoding="utf-8")
    # 短い回（字幕 1,000字。目安 600・下限なし）
    (d / f"{SHORT}.transcript.txt").write_text("# 短い回\n# https://www.youtube.com/watch?v=bbbbbbbbbbb\n" +
                                               "\n".join(f"[0:0{i}:00] 少しだけ話した" for i in range(9)) + "\n", encoding="utf-8")
    (d / f"{CHATONLY}.chat.txt").write_text("# チャットだけの回\n[0:01:00] @x-1: こんばんは\n[0:59:00] @x-1: おやすみ\n",
                                            encoding="utf-8")
    tsv = ["video_id\tstart_jst\tstem\tcaption\tchars\tchat_count\tfetched_at\ttries\tnote",
           f"aaaaaaaaaaa\t2026-11-03 22:00\t2026/11/{STEM}\tok\t4000\t5\t2026-11-04\t1\t",
           f"bbbbbbbbbbb\t2026-11-04 22:00\t2026/11/{SHORT}\tok\t1000\t0\t2026-11-05\t1\t",
           f"ccccccccccc\t2026-11-05 22:00\t2026/11/{CHATONLY}\tnone\t0\t2\t2026-11-06\t1\t",
           f"ddddddddddd\t2026-11-06 22:00\t2026/11/{NOMAT}\tok\t3000\t0\t2026-11-07\t1\t"]
    (root / "streams/manifest.tsv").write_text("\n".join(tsv) + "\n", encoding="utf-8")
    return root


def note(body: int, place="ブルガリア・ソフィア（旧市街）", extra="", head_paid="- 投げ銭 9件（でたらめ）") -> str:
    """本文がおよそ body 字の議事録。頭の投げ銭はわざと違えて返す（機械の頭に差し替わるかを見る）"""
    top = ["# 2026-11-03 22:00 でたらめな題", "- URL: でたらめ", f"- 場所: {place}", "- チャット 1件", head_paid]
    parts = ["", "## ひとことで", "旧市街を歩いた。" + extra, "", "## 流れ", "### [0:00:10] 歩き出し"]
    tail = ["", "## 視聴者さん", "- @たろう-x1 よく話した", "", "## 持ち越し・決まったこと", "なし"]
    text = "\n".join(top + parts + tail) + "\n"
    while sn.body_chars(text) < body:
        parts.append("- [0:00:20] 市場でパンを買い、値段を話した。")
        text = "\n".join(top + parts + tail) + "\n"
    return text


class Fake:
    """筋書き（返す下書きの列）どおりに返す偽の claude -p。渡された1枚と引数を控える"""

    def __init__(self, script):
        self.script = list(script)
        self.seen: list[dict] = []

    def __call__(self, prompt, model, timeout, cwd, resume=None, keep=True):
        self.seen.append({"prompt": prompt, "resume": resume, "keep": keep, "cwd": cwd})
        r = self.script.pop(0) if self.script else None
        if r is None:
            return {"is_error": True, "result": "筋書きが尽きた"}
        return {"result": r, "session_id": "sess-1", "total_cost_usd": 0.01, "duration_ms": 1000,
                "modelUsage": {"m": {"inputTokens": 10, "outputTokens": 20}}}


def go(root: Path, out: Path, fake, *args) -> tuple[int, str]:
    keep = sw.call_model
    sw.call_model = fake
    buf = io.StringIO()
    try:
        with redirect_stdout(buf):
            rc = sw.main(["--root", str(root), "--out", str(out), *args])
    finally:
        sw.call_model = keep
    return rc, buf.getvalue()


def main() -> int:
    tmp = Path(tempfile.mkdtemp(prefix="notes-writer-selftest-"))
    try:
        root = fixture(tmp)
        out = tmp / "out"
        md = root / f"streams/2026/11/{STEM}.md"

        print("1. 組むだけ")
        f = Fake([])
        rc, log = go(root, out, f, STEM, "--prompt-only")
        p = (out / f"{STEM}.prompt.txt").read_text(encoding="utf-8")
        ok(rc == 0 and not f.seen and not md.exists(), "--prompt-only で呼んだ・置いた")
        ok("- 投げ銭 2件（¥1,500）: たろう-x1 ¥500／花-y2 ¥1,000" in p, "頭の投げ銭の行が chat.txt の額付きの行と合わない")
        ok("- URL: https://www.youtube.com/watch?v=aaaaaaaaaaa / 長さ 0:55:30" in p, "頭の URL と長さ（字幕の最後）が違う")
        tgt, lo, hi, ask = sw.limits({"chars_i": 4000})
        ok((tgt, lo, hi) == (1000, 850, 1200) and lo <= ask < tgt and f"およそ {ask}字" in p,
           f"頼む字数を目安より下げていない（目安 {tgt}・頼む {ask}）")
        ok("ユニーク字幕語" in p and "## 2. 議事録の形" not in p and "書くときの決まり" in p,
           "字幕か決まり（SKILL.md §2）が1枚に入っていない")

        print("2. 素性を伏せる")
        ok(not [s for s in SECRET if s in p], f"伏せていない素性が1枚に残った: {[s for s in SECRET if s in p]}")
        ok("ジョージアに住んでいる" in p, "字幕の本人の話（住んでいる所）まで伏せた")
        ok("ソフィア大学きれい" in p, "自分の学校と言っていない学校名まで伏せた")
        ok("@たろう-x1: " in p and "本名は〇〇" in p, "名前（議事録に要る）まで伏せた・本名を伏せた形が違う")
        ok(sw.mask_identity("20代の票", chat=True) == "〇〇代の票" and sw.mask_identity("2◯歳です", chat=True) == "〇〇歳です",
           "年代と、丸で隠した年齢の伏せかたが違う")
        ok(sw.mask_identity("日本名は平茸", chat=True) == "日本名は平茸", "「日本名」を本名として伏せた")

        print("3. 伏せ残しを別の見かたで探す")
        keep = sw.mask_identity
        sw.mask_identity = lambda s, chat: s
        try:
            f = Fake([note(900)])
            rc, log = go(root, out, f, STEM)
        finally:
            sw.mask_identity = keep
        ok(rc == 2 and not f.seen and not md.exists(), "伏せる道具が外れても、呼んでしまった")
        ok("素性" in log and "年齢" in log and not [s for s in SECRET if s in log], "伏せ残しの札が出ない・字が出力に出た")
        ok(sw.identity_leaks("1 7 歳です\n本名：佐藤") == ["年齢", "本名"], "空白や記号で崩した素性を見落とす")
        ok(sw.identity_leaks("3\n歳をとった") == [], "前の行の数字と次の行の「歳」をくっつけて当てた")

        print("4. 書かせる")
        f = Fake([note(900, head_paid="- 投げ銭 9件（でたらめ）")])
        rc, log = go(root, out, f, STEM)
        text = md.read_text(encoding="utf-8") if md.exists() else ""
        ok(rc == 0 and len(f.seen) == 1 and md.exists(), f"1回で通る下書きを置かなかった（rc {rc}）: {log.strip()[-200:]}")
        ok(text.startswith("# 2026-11-03 22:00 🇧🇬ソフィアを歩く\n") and "- 投げ銭 2件（¥1,500）" in text
           and "- 場所: ブルガリア・ソフィア（旧市街）" in text, "頭を機械の5行に差し替えていない（場所の行は返事のを使う）")
        ok(sn.check_one(md, 4000) == [], "置いたものが stream_notes.py check を通らない")
        ok(f.seen[0]["resume"] is None and f.seen[0]["keep"], "1回目を、続きを頼めない形（会話を残さない）で呼んだ")
        rc, log = go(root, out, Fake([note(900)]), STEM)
        ok(rc == 0 and "もう在る" in log, "前の議事録が在るのに書き直した")
        md.unlink()

        print("5. 長すぎる")
        f = Fake([note(1500), note(950)])
        rc, log = go(root, out, f, STEM, "--runs", str(tmp / "runs.jsonl"))
        ok(rc == 0 and len(f.seen) == 2 and md.exists(), "長すぎる下書きを直させて置く、になっていない")
        ok("# 下書き" in f.seen[1]["prompt"] and "ユニーク字幕語" not in f.seen[1]["prompt"] and not f.seen[1]["keep"]
           and f.seen[1]["resume"] is None, "削る直しに字幕を渡し直した（軽い1回になっていない）")
        runs = [json.loads(l) for l in (tmp / "runs.jsonl").read_text(encoding="utf-8").splitlines()]
        ok(len(runs) == 1 and [c["body"] for c in runs[0]["calls"]][0] > 1200, "控え（runs.jsonl）に呼んだ回が残らない")
        md.unlink()

        print("6. 短すぎる")
        f = Fake([note(400), note(900)])
        rc, log = go(root, out, f, STEM)
        ok(rc == 0 and len(f.seen) == 2 and f.seen[1]["resume"] == "sess-1" and f.seen[1]["cwd"] == f.seen[0]["cwd"],
           "足りない下書きを、同じ会話の続き（同じ置き場で --resume）で足させていない")
        md.unlink()

        print("7. 議事録に素性")
        bad = note(900, extra="@たろう-x1「今日誕生日で17才」")
        f = Fake([bad, bad, bad])
        rc, log = go(root, out, f, STEM)
        ok(rc == 2 and not md.exists() and len(f.seen) == 3, "素性の残った議事録を置いた・直させずに諦めた")
        ok("素性（年齢）" in log and "17才" not in log, "素性の札が出ない・字が出力に出た")
        f = Fake([bad, note(900)])
        rc, log = go(root, out, f, STEM)
        ok(rc == 0 and md.exists() and "素性（年齢）" in f.seen[1]["prompt"], "素性を消させた下書きを置かない・直す理由を渡していない")
        md.unlink()

        print("8. 直らない・飛ばす・材料が無い")
        f = Fake([note(1500)] * 3)
        rc, log = go(root, out, f, STEM)
        ok(rc == 1 and len(f.seen) == 3 and not md.exists(), "直らない下書きを置いた・3回で諦めない")
        f = Fake([note(900, place="（ここを埋める）")] * 3)
        rc, log = go(root, out, f, STEM)
        ok(rc == 1 and not md.exists(), "場所の埋まっていない議事録を置いた")
        rc, log = go(root, out, Fake([]), NOMAT)
        ok(rc == 2 and "材料が無い" in log, "材料の無い回が 2 で落ちない")
        rc, log = go(root, out, Fake([]))
        ok(rc == 2, "書く回が1本も無いのに 2 で落ちない")

        print("9. 字幕の無い回・囲みの付いた返事")
        f = Fake(["はい、書きました。\n```markdown\n" + note(150).replace("# 2026-11-03 22:00 でたらめな題\n", "") + "```\n"])
        rc, log = go(root, out, f, CHATONLY)
        cm = root / f"streams/2026/11/{CHATONLY}.md"
        t = cm.read_text(encoding="utf-8") if cm.exists() else ""
        ok(rc == 0 and t.startswith("# 2026-11-05 22:00 チャットだけの回\n") and "## ひとことで" in t and "```" not in t,
           f"字幕の無い回・題の無い返事・囲みと前置きを整えて置けない（rc {rc}）")
        ok("字幕なし" in f.seen[0]["prompt"] and "長さ 0:59:00" in t, "字幕の無い回に、チャットだけから書くと伝えていない・長さがチャットの最後でない")
        rc, log = go(root, out, Fake([note(500)]), SHORT, "--no-write")
        ok(rc == 0 and not (root / f"streams/2026/11/{SHORT}.md").exists() and "置かない" in log, "--no-write で置いた")

        print("10. 議事録の側の見かた")
        for s in ("@a「20代の票がおおい」", "@a「月に住む未来」", "@a「ジョージアのどこに住んでるの？」", "@a「3歳から習って」",
                  "@a「本名が出る仕組み」", "@a「日本名:平茸」", "@a「大学生なの？！」"):
            ok(sw.note_leaks(s) == [], f"ふつうの話を素性として当てた: {s}")
        for s, tag in (("@a「今日で17歳」", "年齢"), ("@a は大阪に住んでます", "住んでいる所"), ("@a「高2です」", "学年"),
                       ("@a「本名は佐藤」", "本名"), ("@a「桜ヶ丘高校に通ってる」", "学校"), ("@a はスロバキア在住", "住んでいる所")):
            ok(tag in sw.note_leaks(s), f"自分の素性を言った形を見落とす: {s}")
    finally:
        shutil.rmtree(tmp, ignore_errors=True)

    print(f"\n{N - len(FAILS)}/{N} 通った")
    if N == 0:
        return 2
    return 1 if FAILS else 0


if __name__ == "__main__":
    sys.exit(main())
