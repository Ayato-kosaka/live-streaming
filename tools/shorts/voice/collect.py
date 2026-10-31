"""EC2 で作った声を手元で揃える。1文1ファイルに名前を付け直し、48kHz モノラルの wav を作り、
長さ・音量を測り、聞き取り直した字（asr_check.py）と原稿を比べて `lines.json` を書く（手元で動く）。

    python3 tools/shorts/voice/collect.py --lines lines_in.json --attempts attempts.jsonl \
        --asr asr.json --raw <EC2 から持ち帰ったフォルダ> --out <書き出し先>

- `--raw` の下は `fish_web.py` が書いたまま（`A/01_a1.mp3` のように、文ごと・試しごと）
- 1回で2本できるテイクのうち、**聞き取りが原稿と合うもの**を使う（同じなら新しい試し・テイク1）。`--pick A/04=2.1` で選び直せる
- 書き出し: `<out>/<案>/<NN>.<元の拡張子>`・`<out>/<案>/<NN>.wav`（48kHz・モノラル・16bit）・`<out>/lines.json`
- **音量は測るだけで揃えない**（揃えるのは書き出し `tools/shorts/render/` の仕事。ここで触ると二重に掛かる）

## 読みで比べる

字で比べると「鶏」と「とり」、「25分」と「二十五分」が別物になる。なので原稿（声に渡した字）と
聞き取った字の**両方を Open JTalk の読み（カタカナ）にして**比べる。数・カタカナの名前は
字のままでも拾い出して、食い違いを並べる。最後に合否を決めるのは人（同音の書き分けは誤検出になる）。

要るもの: `ffmpeg`・`ffprobe`・`open_jtalk`（`apt-get install open-jtalk open-jtalk-mecab-naist-jdic hts-voice-nitech-jp-atr503-m001`。`tools/shorts/plan/readtime.py` と同じ）
"""
from __future__ import annotations

import argparse
import difflib
import json
import math
import os
import re
import shutil
import subprocess
import tempfile
import unicodedata

DIC = "/var/lib/mecab/dic/open-jtalk/naist-jdic"
VOICE = "/usr/share/hts-voice/nitech-jp-atr503-m001/nitech_jp_atr503_m001.htsvoice"
PUNCT = re.compile(r"[\s、。，．,.!！?？「」『』（）()…・ー〜~―\-“”\"'：:；;]")


def reading(text: str) -> str:
    """Open JTalk の前段（形態素解析）だけ使って、発音のカタカナを返す。長音は母音に開かない"""
    if not norm(text):
        return ""   # 聞き取りが空・記号だけのとき（Open JTalk は空の入力で落ちる）
    with tempfile.TemporaryDirectory() as d:
        src, tr = os.path.join(d, "i.txt"), os.path.join(d, "o.trace")
        open(src, "w", encoding="utf-8").write(text + "\n")
        subprocess.run(["open_jtalk", "-x", DIC, "-m", VOICE, "-ot", tr, "-ow", os.devnull, src],
                       check=True, capture_output=True)
        out = []
        for ln in open(tr, encoding="utf-8"):
            if ln.startswith("[Output label]"):
                break
            f = ln.rstrip("\n").split(",")
            if len(f) > 10 and f[1] != "記号":
                out.append(f[9])
        return PUNCT.sub("", "".join(out).replace("’", ""))


def norm(text: str) -> str:
    # 聞き取りは「1A」を「1a」と書くことがある。英字の大小は読みに関係ないので揃える
    return PUNCT.sub("", unicodedata.normalize("NFKC", text)).upper()


def tokens(text: str) -> list[str]:
    """数と、カタカナ・英字のかたまり（名前になりやすいもの）を拾う"""
    t = unicodedata.normalize("NFKC", text)
    return re.findall(r"\d+[A-Za-z]?|[A-Za-z]+|[ァ-ヴー]{2,}", t)


def probe(path: str) -> float:
    r = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", path],
                       capture_output=True, text=True, check=True)
    return round(float(r.stdout.strip()), 3)


def loudness(path: str) -> dict:
    """ebur128 の要約（統合ラウドネス・ラウドネスレンジ・真のピーク）"""
    r = subprocess.run(["ffmpeg", "-hide_banner", "-nostats", "-i", path, "-af", "ebur128=peak=true",
                        "-f", "null", "-"], capture_output=True, text=True)
    s = r.stderr[r.stderr.rfind("Summary:"):]
    g = lambda k: (lambda m: float(m.group(1)) if m else None)(re.search(k + r":\s+(-?[\d.]+|-inf)", s))
    return {"integrated_lufs": g("I"), "lra_lu": g("LRA"), "true_peak_dbfs": g("Peak")}


def silences(path: str, dur: float) -> dict:
    """無音（-45dB 以下が0.25秒以上）を拾い、頭・お尻・途中の無音の秒数を返す。
    聞き取りでは「平板に読んだ」「問いを平叙で読んだ」は分からないが、間の取りすぎ・言い淀みは長さに出る"""
    r = subprocess.run(["ffmpeg", "-hide_banner", "-nostats", "-i", path, "-af", "silencedetect=n=-45dB:d=0.25",
                        "-f", "null", "-"], capture_output=True, text=True)
    st = [float(x) for x in re.findall(r"silence_start: (-?[\d.]+)", r.stderr)]
    en = [float(x) for x in re.findall(r"silence_end: (-?[\d.]+)", r.stderr)]
    spans = list(zip(st, en + [dur] * (len(st) - len(en))))
    head = next((e - max(s0, 0) for s0, e in spans if s0 <= 0.05), 0.0)
    tail = next((e - s0 for s0, e in spans if e >= dur - 0.05 and s0 > 0.05), 0.0)
    inner = sum(e - s0 for s0, e in spans if s0 > 0.05 and e < dur - 0.05)
    return {"head_s": round(head, 2), "tail_s": round(tail, 2), "inner_s": round(inner, 2)}


QUESTION = re.compile(r"[？?][」』）)]*$")
RISE_MIN = 1.0   # これより上がっていない問いに印を付ける（半音）


def rise_st(path: str):
    """語尾の上がり（半音）。声の出ている最後のフレームを終わりとして、最後の0.2秒の F0 の中央値と、
    その前 0.2〜0.6秒の中央値の差を返す。測れなければ None。

    ピッチは Praat（parselmouth）の既定（75〜600Hz）。聞き取りでは「問いを平叙で読んだ」が分からないので、
    人が聞く前に機械で拾うために測る。オクターブの取り違えで ±12 前後に振れることがあるので目安として読む"""
    try:
        import parselmouth
    except ImportError:
        return None
    with tempfile.TemporaryDirectory() as d:
        w = os.path.join(d, "a.wav")
        subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", path, "-ac", "1", "-ar", "48000", w],
                       check=True)
        p = parselmouth.Sound(w).to_pitch()
    v = [(t, f) for t, f in zip(p.xs(), p.selected_array["frequency"]) if f > 0]
    if len(v) < 5:
        return None
    # 終わりの声がかすれる・息になるところ（きしみ声）は、ピッチが急に半分以下へ落ちて拾われる。
    # 「揚げるん！？」は 430Hz まで上がってから最後の0.1秒で 77Hz に落ち、そのまま測ると上がった問いが −4.9 に出た。
    # 文全体の中央値の 0.65倍より低い末尾のフレームは、抑揚ではないので落としてから測る
    fs = sorted(f for _, f in v)
    m = fs[len(fs) // 2]
    while len(v) > 5 and v[-1][1] < 0.65 * m:
        v = v[:-1]
    end = v[-1][0]
    last = sorted(f for t, f in v if t > end - 0.2)
    prev = sorted(f for t, f in v if end - 0.6 < t <= end - 0.2)
    if len(last) < 2 or len(prev) < 2:
        return None
    med = lambda xs: (xs[len(xs) // 2] + xs[(len(xs) - 1) // 2]) / 2
    return round(12 * math.log2(med(last) / med(prev)), 1)


def flag_rates(rows: list[dict]):
    """読み（カナ）の数 ÷ 喋っている秒数（頭とお尻の無音を除く）が、同じ回の中央値から外れる文に印を付ける"""
    rates = sorted(r["rate_cps"] for r in rows if r.get("rate_cps"))
    if not rates:
        return
    med = rates[len(rates) // 2]
    for r in rows:
        why = []
        if r.get("rate_cps") and r["rate_cps"] < med * 0.7:
            why.append(f"遅い（{r['rate_cps']}カナ/秒、中央値 {med}）")
        if r.get("rate_cps") and r["rate_cps"] > med * 1.4:
            why.append(f"速い（{r['rate_cps']}カナ/秒、中央値 {med}）")
        if (r.get("silence") or {}).get("inner_s", 0) > 1.0:
            why.append(f"途中の無音 {r['silence']['inner_s']}秒")
        r["duration_flag"] = " / ".join(why) or None


def compare(caption: str, sent: str, heard: str | None) -> dict:
    """声に渡した字（sent）と聞き取り（heard）を読みで比べる。字幕（caption）の数・名前が聞き取れたかも見る"""
    if heard is None:
        return {"ok": False, "match": "no: 聞き取りが無い"}
    want_r, got_r = reading(sent), reading(heard)
    ops = difflib.SequenceMatcher(None, want_r, got_r).get_opcodes()
    diffs = [f"{want_r[i1:i2] or '∅'}→{got_r[j1:j2] or '∅'}" for op, i1, i2, j1, j2 in ops if op != "equal"]
    miss = [t for t in tokens(caption) if t not in norm(heard) and reading(t) not in got_r]
    # 字幕の字と聞き取りの字が（記号を除いて）同じなら、読みの辞書の癖（1A→イチアンペア）に関係なく合格
    ok = norm(caption) == norm(heard) or not diffs
    return {"ok": ok, "reading_tts": want_r, "reading_asr": got_r,
            "similarity": round(difflib.SequenceMatcher(None, want_r, got_r).ratio(), 3),
            "match": "yes" if ok else ("no: " + " / ".join(diffs[:6]) + (f"（字幕の {'・'.join(miss)} が聞き取れない）" if miss else ""))}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--lines", required=True)
    ap.add_argument("--attempts", required=True)
    ap.add_argument("--asr", action="append", required=True,
                    help="何回でも。あとに渡したものが前を上書きする（詰めて聞いた結果 → 1本ずつ聞き直した結果、の順に渡す）")
    ap.add_argument("--raw", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--pick", action="append", default=[], help="A/04=2.1 のように、使う試し.テイクを選び直す")
    ap.add_argument("--accept", action="append", default=[],
                    help="A/09=理由。読みの辞書の誤検出を、聞き取りの字を確かめたうえで合格にする（理由と自動の判定は lines.json に残る）")
    a = ap.parse_args()

    lines = json.load(open(a.lines, encoding="utf-8"))
    att = [json.loads(l) for l in open(a.attempts, encoding="utf-8") if l.strip()]
    asr = {}
    for f in a.asr:
        if os.path.exists(f):
            asr.update(json.load(open(f, encoding="utf-8")))
    pick = dict(p.split("=") for p in a.pick)
    accept = dict(p.split("=", 1) for p in a.accept)
    rows = []
    for ln in lines:
        key = ln["key"]
        mine = [x for x in att if x["key"] == key]
        takes = []
        question = bool(QUESTION.search(ln["caption"].strip()))
        for x in (x for x in mine if x.get("status") == "ok"):
            heard = (asr.get(x["file"]) or {}).get("text")
            rise = rise_st(os.path.join(a.raw, x["file"])) if question else None
            takes.append({**x, "asr_text": heard, "rise_st": rise, **compare(ln["caption"], x["tts_text"], heard)})
        row = {"key": key, "plan": ln["plan"], "n": ln["n"], "caption": ln["caption"],
               # 作った回（タスクのある回）。1回で2本のテイクができる
               "attempts": len({x["group_id"] for x in mine if x.get("task_id")}),
               "takes": [{k: x.get(k) for k in ("attempt", "take", "tts_text", "credit_count", "duration_s", "file", "asr_text",
                                                "match", "rise_st")} for x in takes],
               "errors": [x.get("error") for x in mine if x.get("status") != "ok"]}
        if key in pick:
            at, tk = (int(v) for v in pick[key].split("."))
            cand = [x for x in takes if x["attempt"] == at and x["take"] == tk]
        else:
            # 聞き取りが合うもの → （「？」で終わる文なら）語尾が上がっているもの・よく上がっているもの → 新しい試し → テイク1。
            # 上がり方は半音の整数に丸めて比べる（6.6 と 6.8 のような測りの揺れでテイクを替えない）
            def up(x):
                r = x["rise_st"]
                return (r is None or r < RISE_MIN, -round(r) if r is not None else 0) if question else (False, 0)
            cand = sorted(takes, key=lambda x: (not x["ok"], up(x), -x["attempt"], x["take"]))
        if not cand:
            row.update({"file": None, "match": "no: 音声が無い"})
            rows.append(row)
            continue
        use = cand[0]
        src = os.path.join(a.raw, use["file"])
        ext = os.path.splitext(src)[1]
        d = os.path.join(a.out, ln["plan"])
        os.makedirs(d, exist_ok=True)
        dst = os.path.join(d, f"{ln['n']:02d}{ext}")
        shutil.copyfile(src, dst)
        wav = os.path.join(d, f"{ln['n']:02d}.wav")
        subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", dst, "-ar", "48000", "-ac", "1",
                        "-c:a", "pcm_s16le", wav], check=True)
        row.update({"tts_text": use["tts_text"], "file": os.path.relpath(dst, a.out), "wav": os.path.relpath(wav, a.out),
                    "used": f"{use['attempt']}.{use['take']}", "source_file": use["file"], "task_id": use.get("task_id"),
                    "duration_s": probe(dst), "wav_duration_s": probe(wav), "loudness": loudness(wav),
                    "silence": silences(wav, probe(wav)),
                    "asr_text": use["asr_text"], "match": use["match"], "reading_tts": use.get("reading_tts"),
                    "reading_asr": use.get("reading_asr"), "similarity": use.get("similarity")})
        if question:
            row["intonation_rise_st"] = use["rise_st"]
            row["intonation_flag"] = use["rise_st"] is None or use["rise_st"] < RISE_MIN
        if key in accept and row["match"] != "yes":
            row["match_auto"] = row["match"]
            row["match"] = f"yes（確かめて合格: {accept[key]}）"
        rows.append(row)
    for r in rows:
        if r.get("silence"):
            speak = r["wav_duration_s"] - r["silence"]["head_s"] - r["silence"]["tail_s"]
            # 字幕の字数は「20分」が2字になって数の文だけ遅く見えるので、印は読み（カナ）の数で付ける
            r["caption_cps"] = round(len(norm(r["caption"])) / speak, 2) if speak > 0 else None
            r["rate_cps"] = round(len(reading(r["tts_text"])) / speak, 2) if speak > 0 else None
    flag_rates(rows)
    os.makedirs(a.out, exist_ok=True)
    json.dump(rows, open(os.path.join(a.out, "lines.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    for r in rows:
        into = "" if "intonation_rise_st" not in r else f"上がり {r['intonation_rise_st']}st" + (" ⚑" if r["intonation_flag"] else "")
        print(f"{r['key']}\t{r.get('duration_s')}\t{r.get('rate_cps')}\t{r['attempts']}\t{r.get('used')}\t{r['match']}\t"
              f"{r.get('duration_flag') or ''}\t{into}\t{r.get('asr_text')}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
