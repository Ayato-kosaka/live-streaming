#!/usr/bin/env python3
"""`stream_notes_writer.py`（議事録を `claude -p` に書かせる道具）の見張り。**本物の `claude -p` は呼ばない。**

    python3 python/stream_notes_writer_selftest.py

空の置き場に streams/ の材料（字幕・チャット・manifest.tsv）と決まり（SKILL.md）をこしらえ、`call_model` を偽物に
差し替えて回す。偽物は「何回目の呼び出しで、どんな下書きを返すか」の筋書きどおりに返し、渡された1枚を控える。
名前は全部こしらえたもの（視聴者さんの名前を見張りに書かない）。

見る足:
 1. 組むだけ（--prompt-only）: 呼ばない・置かない・頭の5行（投げ銭の件数と額）・頼む字数を目安より下げている
 2. 素性を伏せる: チャットの年齢・学年・住んでいる所・勤め先・本名・連絡先・自分の学校、字幕の年齢と本名は 〇〇。
    字幕の本人の話（住んでいる所）と、自分の学校と言っていない学校名は残す
 3. 伏せ残しを別の見かたで探す: 伏せる道具を外すと、呼ばずに 2 で落ちる。出力に字を出さない
 4. 書かせる: 1回で通れば置く。頭は機械の5行に差し替える（場所の行だけ返事の）
 5. 長すぎる: 下書きだけを渡す軽い1回で削らせる（字幕を渡し直さない）
 6. 短すぎる: 同じ会話の続き（--resume）で足させる
 7. 議事録に素性: 消させても残れば置かない（2）。出力に字を出さない
 8. 直らない: 直させるのは1回まで（呼ぶのは2回）で諦めて置かない（1）。見出しの欠け・場所の空も置かない。
    前の議事録が在れば飛ばす・材料が無ければ 2
 9. 字幕の無い回・囲みと前置きの付いた返事
10. 議事録の側の見かた: 自分のことを言った形だけ当たり、ふつうの話（「20代の票」「月に住む」）には当たらない
11. 字幕に無い名前: 字幕（ひらがなの形も）・チャット・場所の名前・ふつうの語に在る名前は数えない。
    NAMES_MAX を越えたら、その名前を添えて直させ、消えなければ置かない。出力に名前を出さない
12. 既定のモデル（比べて決めた値を字で見る）

**守りを1つずつ外して、その守りの対照だけが落ちることも、ここで当てる**（`DRILL`）。外しかたは1件ずつ書いた。
`mutation_drill.py` も隣の `stream_notes_writer.py` の比較をひっくり返して当てる（こちらは、比較では外せない守り——
伏せる・探す・名前を突き合わせる・場所の行・見出しの表・直す回数・既定のモデル——を外したときに落ちるか）。
"""
from __future__ import annotations

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

STEM = "2026-11-03_2200_aaaaaaaaaaa"      # 書かせる回（素性の無い材料）
SECRET = "2026-11-02_2200_eeeeeeeeeee"    # 素性の入った材料（伏せる・伏せ残しの対照）
SHORT = "2026-11-04_2200_bbbbbbbbbbb"
CHATONLY = "2026-11-05_2200_ccccccccccc"
NOMAT = "2026-11-06_2200_ddddddddddd"
SECRETS = ["17歳", "高2", "大阪市", "山田太郎", "桜ヶ丘", "鈴木花子", "090-1234-5678", "フジ商事", "2008年生まれ"]
FAB = "ビッグベンとタワーブリッジとバッキンガムを見た。"   # 字幕に無い名前3つ
WANT_MODEL = "sonnet"


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
    head = ["# 🇧🇬ソフィアを歩く", "# https://www.youtube.com/watch?v=aaaaaaaaaaa", "# 開始: 2026-11-03 22:00"]
    walk = [f"[0:{m:02d}:{s:02d}] 旧市街を歩いて市場でパンを買った話をしている" for m in range(1, 59) for s in (0, 30)][:110]
    tr = head + ["[0:00:05] ブルガリアのソフィアに来ました", "[0:00:30] ユニーク字幕語ヨーグルトの話", "[0:00:40] ばにつぁを買った"]
    (d / f"{STEM}.transcript.txt").write_text("\n".join(tr + walk) + "\n", encoding="utf-8")
    chat = ["# 🇧🇬ソフィアを歩く", "[0:00:35] @b-z3: シャプカ公園きれい",
            "[0:00:45] ¥500 @たろう-x1: お土産代", "[0:00:55] ¥1,000 @花-y2: ヨーグルト代"]
    (d / f"{STEM}.chat.txt").write_text("\n".join(chat) + "\n", encoding="utf-8")
    # 素性の入った回（字幕は同じ長さ）
    tr2 = head + ["[0:00:10] ジョージアに住んでいる頃から気になってた", "[0:00:20] え、17歳なんだ。本名は山田太郎って言ってたね"]
    (d / f"{SECRET}.transcript.txt").write_text("\n".join(tr2 + walk) + "\n", encoding="utf-8")
    chat2 = ["# 🇧🇬ソフィアを歩く",
             "[0:00:15] @たろう-x1: 17歳の高2です。大阪市に住んでます。本名は鈴木花子。桜ヶ丘高校に通ってる",
             "[0:00:25] @花-y2: 090-1234-5678 にかけて！フジ商事に勤めてます。2008年生まれ",
             "[0:00:35] @b-z3: ソフィア大学きれい"]
    (d / f"{SECRET}.chat.txt").write_text("\n".join(chat2) + "\n", encoding="utf-8")
    # 短い回（字幕 1,000字。目安 600・下限なし）
    (d / f"{SHORT}.transcript.txt").write_text("# 短い回\n# https://www.youtube.com/watch?v=bbbbbbbbbbb\n" +
                                               "\n".join(f"[0:0{i}:00] 少しだけ話した" for i in range(9)) + "\n", encoding="utf-8")
    (d / f"{CHATONLY}.chat.txt").write_text("# チャットだけの回\n[0:01:00] @x-1: こんばんは\n[0:59:00] @x-1: おやすみ\n",
                                            encoding="utf-8")
    tsv = ["video_id\tstart_jst\tstem\tcaption\tchars\tchat_count\tfetched_at\ttries\tnote",
           f"eeeeeeeeeee\t2026-11-02 22:00\t2026/11/{SECRET}\tok\t4000\t3\t2026-11-03\t1\t",
           f"aaaaaaaaaaa\t2026-11-03 22:00\t2026/11/{STEM}\tok\t4000\t3\t2026-11-04\t1\t",
           f"bbbbbbbbbbb\t2026-11-04 22:00\t2026/11/{SHORT}\tok\t1000\t0\t2026-11-05\t1\t",
           f"ccccccccccc\t2026-11-05 22:00\t2026/11/{CHATONLY}\tnone\t0\t2\t2026-11-06\t1\t",
           f"ddddddddddd\t2026-11-06 22:00\t2026/11/{NOMAT}\tok\t3000\t0\t2026-11-07\t1\t"]
    (root / "streams/manifest.tsv").write_text("\n".join(tsv) + "\n", encoding="utf-8")
    return root


def note(body: int, place="ブルガリア・ソフィア（旧市街）", extra="", head_paid="- 投げ銭 9件（でたらめ）",
         drop: str | None = None) -> str:
    """本文がおよそ body 字の議事録。頭の投げ銭はわざと違えて返す（機械の頭に差し替わるかを見る）。drop は抜く見出し"""
    top = ["# 2026-11-03 22:00 でたらめな題", "- URL: でたらめ", f"- 場所: {place}", "- チャット 1件", head_paid]
    parts = ["", "## ひとことで", "旧市街を歩いた。" + extra, "", "## 流れ", "### [0:00:10] 歩き出し"]
    tail = ["", "## 視聴者さん", "- @たろう-x1 よく話した", "", "## 持ち越し・決まったこと", "なし"]
    if drop:
        tail = [l for l in tail if l != drop]
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
        self.seen.append({"prompt": prompt, "model": model, "resume": resume, "keep": keep, "cwd": cwd})
        r = self.script.pop(0) if self.script else None
        if r is None:
            return {"is_error": True, "result": "筋書きが尽きた"}
        return {"result": r, "session_id": "sess-1", "total_cost_usd": 0.01, "duration_ms": 1000,
                "modelUsage": {"m": {"inputTokens": 10, "outputTokens": 20}}}


def go(root: Path, out: Path, fake, *args, clean: bool = True) -> tuple[int, str]:
    """道具を1回。clean なら前の対照が置いた議事録を消してから（1つの守りを外したとき、置かれたものが次の対照に響かないように）"""
    if clean:
        for md in (root / "streams").glob("*/*/*.md"):
            md.unlink()
    keep = sw.call_model
    sw.call_model = fake
    buf = io.StringIO()
    try:
        with redirect_stdout(buf):
            rc = sw.main(["--root", str(root), "--out", str(out), *args])
    finally:
        sw.call_model = keep
    return rc, buf.getvalue()


def cases() -> dict[str, bool]:
    """対照の名前 → 通ったか。DRILL からも同じものを回す"""
    got: dict[str, bool] = {}

    def ok(cond, what):
        got[what] = got.get(what, True) and bool(cond)

    tmp = Path(tempfile.mkdtemp(prefix="notes-writer-selftest-"))
    try:
        root = fixture(tmp)
        out = tmp / "out"
        md = root / f"streams/2026/11/{STEM}.md"

        # 1. 組むだけ
        f = Fake([])
        rc, log = go(root, out, f, STEM, "--prompt-only")
        p = (out / f"{STEM}.prompt.txt").read_text(encoding="utf-8")
        ok(rc == 0 and not f.seen and not md.exists(), "組む: --prompt-only で呼ばない・置かない")
        ok("- 投げ銭 2件（¥1,500）: たろう-x1 ¥500／花-y2 ¥1,000" in p, "組む: 頭の投げ銭の行が chat.txt の額付きの行と合う")
        ok("- URL: https://www.youtube.com/watch?v=aaaaaaaaaaa / 長さ 0:55:30" in p, "組む: 頭の URL と長さ（字幕の最後）")
        tgt, lo, hi, ask = sw.limits({"chars_i": 4000})
        ok((tgt, lo, hi) == (1000, 850, 1200) and lo <= ask < tgt and f"およそ {ask}字" in p, "組む: 頼む字数を目安より下げる")
        ok("ユニーク字幕語" in p and "## 2. 議事録の形" not in p and "書くときの決まり" in p, "組む: 字幕と決まり（SKILL.md §2）が1枚に入る")

        # 2. 素性を伏せる
        rc, log = go(root, out, Fake([]), SECRET, "--prompt-only")
        p = (out / f"{SECRET}.prompt.txt").read_text(encoding="utf-8")
        ok(rc == 0 and not [s for s in SECRETS if s in p], "伏せる: 1枚にチャットと字幕の素性が残らない")
        ok("ジョージアに住んでいる" in p, "伏せる: 字幕の本人の話（住んでいる所）は残す")
        ok("ソフィア大学きれい" in p, "伏せる: 自分の学校と言っていない学校名は残す")
        ok("@たろう-x1: " in p and "本名は〇〇" in p, "伏せる: 名前（議事録に要る）は残し、本名は 〇〇 に")
        ok(sw.mask_identity("20代の票", chat=True) == "〇〇代の票" and sw.mask_identity("2◯歳です", chat=True) == "〇〇歳です",
           "伏せる: 年代と、丸で隠した年齢")
        ok(sw.mask_identity("日本名は平茸", chat=True) == "日本名は平茸", "伏せる: 「日本名」を本名として伏せない")

        # 3. 伏せ残しを別の見かたで探す
        keep = sw.mask_identity
        sw.mask_identity = lambda s, chat: s
        try:
            f = Fake([note(900)])
            rc, log = go(root, out, f, SECRET)
        finally:
            sw.mask_identity = keep
        ok(rc == 2 and not f.seen and "素性" in log and "年齢" in log and not [s for s in SECRETS if s in log],
           "探す: 伏せる道具が外れたら呼ばずに 2・札だけ出して字は出さない")
        ok(sw.identity_leaks("1 7 歳です\n本名：佐藤") == ["年齢", "本名"], "探す: 空白や記号で崩した素性も見つける")
        ok(sw.identity_leaks("3\n歳をとった") == [], "探す: 前の行の数字と次の行の「歳」をくっつけない")
        ok(sw.mask_transcript("# 題\n[0:46:00] ‹0:46:19›やばい‹0:46:24›ちょい焦げ\n")[0] == "# 題\n[0:46:00] やばいちょい焦げ\n",
           "伏せる: 字幕の言った秒の印（‹h:mm:ss›）は外して渡す（印の数字を年齢・日付に見ない・トークンを食わない）")

        # 4. 書かせる
        f = Fake([note(900, head_paid="- 投げ銭 9件（でたらめ）")])
        rc, log = go(root, out, f, STEM)
        text = md.read_text(encoding="utf-8") if md.exists() else ""
        ok(rc == 0 and len(f.seen) == 1 and md.exists(), "書く: 1回で通る下書きを置く")
        ok(text.startswith("# 2026-11-03 22:00 🇧🇬ソフィアを歩く\n") and "- 投げ銭 2件（¥1,500）" in text
           and "- 場所: ブルガリア・ソフィア（旧市街）" in text, "書く: 頭を機械の5行に差し替える（場所の行は返事の）")
        ok(md.exists() and sn.check_one(md, 4000) == [], "書く: 置いたものが stream_notes.py check を通る")
        ok(f.seen and f.seen[0]["resume"] is None and f.seen[0]["keep"], "書く: 1回目は続きを頼める形（会話を残す）で呼ぶ")
        rc, log = go(root, out, Fake([note(900)]), STEM, clean=False)
        ok(rc == 0 and "もう在る" in log, "書く: 前の議事録が在れば書き直さない")
        md.unlink(missing_ok=True)

        # 5. 長すぎる
        f = Fake([note(1500), note(950)])
        rc, log = go(root, out, f, STEM, "--runs", str(tmp / "runs.jsonl"))
        ok(rc == 0 and len(f.seen) == 2 and md.exists(), "長い: 直させて置く")
        ok(len(f.seen) == 2 and "# 下書き" in f.seen[1]["prompt"] and "ユニーク字幕語" not in f.seen[1]["prompt"]
           and not f.seen[1]["keep"] and f.seen[1]["resume"] is None, "長い: 削る直しは下書きだけの軽い1回（字幕を渡し直さない）")
        runs = [json.loads(l) for l in (tmp / "runs.jsonl").read_text(encoding="utf-8").splitlines()]
        ok(len(runs) == 1 and runs[0]["calls"][0]["body"] > 1200, "長い: 控え（runs.jsonl）に呼んだ回が残る")
        md.unlink(missing_ok=True)

        # 6. 短すぎる
        f = Fake([note(400), note(900)])
        rc, log = go(root, out, f, STEM)
        ok(rc == 0 and len(f.seen) == 2 and f.seen[1]["resume"] == "sess-1" and f.seen[1]["cwd"] == f.seen[0]["cwd"],
           "短い: 同じ会話の続き（同じ置き場で --resume）で足させる")
        md.unlink(missing_ok=True)

        # 7. 議事録に素性
        bad = note(900, extra="@たろう-x1「今日誕生日で17才」")
        f = Fake([bad, bad])
        rc, log = go(root, out, f, STEM)
        ok(rc == 2 and not md.exists() and len(f.seen) == 2 and "素性（年齢）" in log and "17才" not in log,
           "議事録の素性: 消させても残れば置かない（2）・札だけ出して字は出さない")
        f = Fake([bad, note(900)])
        rc, log = go(root, out, f, STEM)
        ok(rc == 0 and md.exists() and len(f.seen) == 2 and "素性（年齢）" in f.seen[1]["prompt"],
           "議事録の素性: 直す理由を渡して消させ、消えれば置く")
        md.unlink(missing_ok=True)

        # 8. 直らない・形の崩れ・飛ばす・材料が無い
        f = Fake([note(1500)] * 3)
        rc, log = go(root, out, f, STEM)
        ok(rc == 1 and len(f.seen) == 2 and not md.exists(), "直らない: 直させるのは1回まで（呼ぶのは2回）で諦めて置かない")
        rc, log = go(root, out, Fake([note(900, drop="## 視聴者さん")] * 3), STEM)
        ok(rc == 1 and not md.exists() and "視聴者さん" in log, "直らない: 型の見出しが欠けた議事録を置かない")
        rc, log = go(root, out, Fake([note(900, place="（ここを埋める）")] * 3), STEM)
        ok(rc == 1 and not md.exists(), "直らない: 場所の埋まっていない議事録を置かない")
        head = sw.header(root, STEM, sw.rows_of(root)[STEM])[0]
        ok(sw.place_ng(sw.tidy(note(900).replace("- 場所: ブルガリア・ソフィア（旧市街）\n", ""), head))
           == ["頭の「場所」が埋まっていない"], "直らない: 返事に場所の行が無ければ空として数える")
        rc, log = go(root, out, Fake([]), NOMAT)
        ok(rc == 2 and "材料が無い" in log, "材料: 材料の無い回は 2")
        rc, log = go(root, out, Fake([]))
        ok(rc == 2, "材料: 書く回が1本も無ければ 2")

        # 9. 字幕の無い回・囲みの付いた返事
        f = Fake(["はい、書きました。\n```markdown\n" + note(150, place="不明").replace("# 2026-11-03 22:00 でたらめな題\n", "") + "```\n"])
        rc, log = go(root, out, f, CHATONLY)
        cm = root / f"streams/2026/11/{CHATONLY}.md"
        t = cm.read_text(encoding="utf-8") if cm.exists() else ""
        ok(rc == 0 and t.startswith("# 2026-11-05 22:00 チャットだけの回\n") and "## ひとことで" in t and "```" not in t,
           "整える: 字幕の無い回・題の無い返事・囲みと前置きを整えて置く")
        ok(f.seen and "字幕なし" in f.seen[0]["prompt"] and "長さ 0:59:00" in t, "整える: 字幕の無い回はチャットだけから・長さはチャットの最後")
        rc, log = go(root, out, Fake([note(500, place="不明")]), SHORT, "--no-write")
        ok(rc == 0 and not (root / f"streams/2026/11/{SHORT}.md").exists() and "置かない" in log, "整える: --no-write で置かない")

        # 10. 議事録の側の見かた
        for s in ("@a「20代の票がおおい」", "@a「月に住む未来」", "@a「ジョージアのどこに住んでるの？」", "@a「3歳から習って」",
                  "@a「本名が出る仕組み」", "@a「日本名:平茸」", "@a「大学生なの？！」"):
            ok(sw.note_leaks(s) == [], "議事録の見かた: ふつうの話を素性として当てない")
        for s, tag in (("@a「今日で17歳」", "年齢"), ("@a は大阪に住んでます", "住んでいる所"), ("@a「高2です」", "学年"),
                       ("@a「本名は佐藤」", "本名"), ("@a「桜ヶ丘高校に通ってる」", "学校"), ("@a はスロバキア在住", "住んでいる所")):
            ok(tag in sw.note_leaks(s), "議事録の見かた: 自分の素性を言った形を見つける")

        # 11. 字幕に無い名前
        known = sw.known_text(root, STEM, sw.rows_of(root))
        good = note(900, extra="バニツァとヨーグルトを食べ、シャプカ公園とヴィトシャ大通りを見た。@ヨシダ-x9「カメラ」")
        ok(sw.unknown_names(good, known, {sw.fold("カメラ")}) == [],
           "名前: 字幕（ひらがなの形も）・チャット・場所の名前・ふつうの語・@名前は数えない")
        ok(sw.fold("コヴェントガーデン") == sw.fold("コベントガーデン") and sw.fold("ヴィ・トシャー") == sw.fold("びとしや"),
           "名前: ヴァ行はバ行・中黒と長音は落として比べる")
        ok(sw.unknown_names(note(900, extra=FAB), known, set()) == ["タワーブリッジ", "バッキンガム", "ビッグベン"],
           "名前: 字幕に無い名前を拾う")
        ok(sw.unknown_names(note(900, place="イギリス・ロンドン"), known, set()) == ["イギリス", "ロンドン"],
           "名前: 頭の「場所」の行も突き合わせる")
        f = Fake([good.replace("@ヨシダ-x9「カメラ」", "")])
        rc, log = go(root, out, f, STEM)
        ok(rc == 0 and len(f.seen) == 1 and md.exists(), "名前: 字幕に在る名前だけなら直させずに置く")
        md.unlink(missing_ok=True)
        f = Fake([note(900, extra=FAB), note(900)])
        rc, log = go(root, out, f, STEM)
        ok(rc == 0 and len(f.seen) == 2 and md.exists() and "ビッグベン" in f.seen[1]["prompt"]
           and "字幕・チャット" in f.seen[1]["prompt"] and "ユニーク字幕語" not in f.seen[1]["prompt"],
           "名前: 越えたら、その名前を添えて下書きだけの1回で直させ、消えれば置く")
        md.unlink(missing_ok=True)
        f = Fake([note(900, extra=FAB)] * 3)
        rc, log = go(root, out, f, STEM, "--runs", str(tmp / "runs2.jsonl"))
        r2 = (tmp / "runs2.jsonl").read_text(encoding="utf-8") if (tmp / "runs2.jsonl").exists() else ""
        ok(rc == 1 and not md.exists() and "字幕に無い名前 3個" in log and "ビッグベン" not in log + r2,
           "名前: 消えなければ置かない（1）・数だけ出して名前は出力にも控えにも出さない")

        # 12. 既定のモデル
        f = Fake([note(900)])
        go(root, out, f, STEM, "--force", "--no-write")
        ok(f.seen and f.seen[0]["model"] == WANT_MODEL, f"モデル: 省けば {WANT_MODEL}（SKILL.md §5 で比べて決めた値）")
        f = Fake([note(900)])
        go(root, out, f, STEM, "--force", "--no-write", "--model", "haiku")
        ok(f.seen and f.seen[0]["model"] == "haiku", "モデル: --model で替えられる")
    finally:
        shutil.rmtree(tmp, ignore_errors=True)
    return got


# 守りを1つずつ外す。(何を外すか, {(モジュール, 名前): 差し替え}, そのとき落ちるはずの対照)
NAMES = {"名前: 字幕に無い名前を拾う", "名前: 頭の「場所」の行も突き合わせる",
         "名前: 越えたら、その名前を添えて下書きだけの1回で直させ、消えれば置く",
         "名前: 消えなければ置かない（1）・数だけ出して名前は出力にも控えにも出さない"}
DRILL = [
    ("字幕とチャットの素性を伏せない（mask_identity を素通しに）", {(sw, "mask_identity"): lambda s, chat: sw.norm(s)},
     {"伏せる: 1枚にチャットと字幕の素性が残らない", "伏せる: 年代と、丸で隠した年齢", "伏せる: 名前（議事録に要る）は残し、本名は 〇〇 に"}),
    ("伏せ残しを探さない（identity_leaks が何も見つけない）", {(sw, "identity_leaks"): lambda text: []},
     {"探す: 伏せる道具が外れたら呼ばずに 2・札だけ出して字は出さない", "探す: 空白や記号で崩した素性も見つける"}),
    ("議事録の素性を探さない（note_leaks が何も見つけない）", {(sw, "note_leaks"): lambda md: []},
     {"議事録の素性: 消させても残れば置かない（2）・札だけ出して字は出さない",
      "議事録の素性: 直す理由を渡して消させ、消えれば置く", "議事録の見かた: 自分の素性を言った形を見つける"}),
    ("字幕に無い名前を数えない（unknown_names が何も返さない）", {(sw, "unknown_names"): lambda d, k, c: []}, NAMES),
    ("直しの1枚に名前を渡さない（fix_prompt が names を捨てる）",
     {(sw, "fix_prompt"): (lambda f: lambda d, w, r, names=None: f(d, w, r))(sw.fix_prompt)},
     {"名前: 越えたら、その名前を添えて下書きだけの1回で直させ、消えれば置く"}),
    ("字幕に無い名前を5個まで許す（NAMES_MAX）", {(sw, "NAMES_MAX"): 5},
     {"名前: 越えたら、その名前を添えて下書きだけの1回で直させ、消えれば置く",
      "名前: 消えなければ置かない（1）・数だけ出して名前は出力にも控えにも出さない"}),
    ("場所の行を見ない（place_ng が何も返さない）", {(sw, "place_ng"): lambda d: []},
     {"直らない: 場所の埋まっていない議事録を置かない", "直らない: 返事に場所の行が無ければ空として数える"}),
    ("型の見出しを見ない（stream_notes.HEADINGS を空に）", {(sn, "HEADINGS"): []},
     {"直らない: 型の見出しが欠けた議事録を置かない"}),
    ("字数の上限を見ない（stream_notes.HIGH を 99 倍に）", {(sn, "HIGH"): 99},
     {"長い: 直させて置く", "長い: 削る直しは下書きだけの軽い1回（字幕を渡し直さない）",
      "直らない: 直させるのは1回まで（呼ぶのは2回）で諦めて置かない", "組む: 頼む字数を目安より下げる"}),
    ("直させる回数を2回に（FIXES）", {(sw, "FIXES"): 2},
     {"直らない: 直させるのは1回まで（呼ぶのは2回）で諦めて置かない",
      "議事録の素性: 消させても残れば置かない（2）・札だけ出して字は出さない"}),
    ("既定のモデルを haiku にする（MODEL）", {(sw, "MODEL"): "haiku"},
     {f"モデル: 省けば {WANT_MODEL}（SKILL.md §5 で比べて決めた値）"}),
]


def main() -> int:
    fails: list[str] = []
    got = cases()
    for name, passed in got.items():
        if not passed:
            fails.append(name)
            print(f"  ✕ {name}")
    n = len(got)
    for label, patch, want in DRILL:
        keep = {k: getattr(*k) for k in patch}
        try:
            for (mod, attr), v in patch.items():
                setattr(mod, attr, v)
            fell = {k for k, v in cases().items() if not v}
        finally:
            for (mod, attr), v in keep.items():
                setattr(mod, attr, v)
        n += 1
        if fell != want:
            fails.append(label)
            print(f"  ✕ 外す: {label} → 落ちたのは {sorted(fell)}／待ったのは {sorted(want)}")
    print(f"\n{n - len(fails)}/{n} 通った（対照 {len(got)}・外しかた {len(DRILL)}）")
    if len(got) < 30 or not DRILL:
        print("::error::対照が少なすぎる（何も見ていない緑を出さない）")
        return 2
    return 1 if fails else 0

if __name__ == "__main__":
    sys.exit(main())
