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
    return PUNCT.sub("", unicodedata.normalize("NFKC", text))


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
    ap.add_argument("--asr", required=True)
    ap.add_argument("--raw", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--pick", action="append", default=[], help="A/04=2.1 のように、使う試し.テイクを選び直す")
    ap.add_argument("--accept", action="append", default=[],
                    help="A/09=理由。読みの辞書の誤検出を、聞き取りの字を確かめたうえで合格にする（理由と自動の判定は lines.json に残る）")
    a = ap.parse_args()

    lines = json.load(open(a.lines, encoding="utf-8"))
    att = [json.loads(l) for l in open(a.attempts, encoding="utf-8") if l.strip()]
    asr = json.load(open(a.asr, encoding="utf-8")) if os.path.exists(a.asr) else {}
    pick = dict(p.split("=") for p in a.pick)
    accept = dict(p.split("=", 1) for p in a.accept)
    rows = []
    for ln in lines:
        key = ln["key"]
        mine = [x for x in att if x["key"] == key]
        takes = []
        for x in (x for x in mine if x.get("status") == "ok"):
            heard = (asr.get(x["file"]) or {}).get("text")
            takes.append({**x, "asr_text": heard, **compare(ln["caption"], x["tts_text"], heard)})
        row = {"key": key, "plan": ln["plan"], "n": ln["n"], "caption": ln["caption"],
               # 作った回（タスクのある回）。1回で2本のテイクができる
               "attempts": len({x["group_id"] for x in mine if x.get("task_id")}),
               "takes": [{k: x.get(k) for k in ("attempt", "take", "tts_text", "credit_count", "duration_s", "file", "asr_text", "match")}
                         for x in takes],
               "errors": [x.get("error") for x in mine if x.get("status") != "ok"]}
        if key in pick:
            at, tk = (int(v) for v in pick[key].split("."))
            cand = [x for x in takes if x["attempt"] == at and x["take"] == tk]
        else:
            # 聞き取りが合うもの → 新しい試し → テイク1 の順
            cand = sorted(takes, key=lambda x: (not x["ok"], -x["attempt"], x["take"]))
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
                    "asr_text": use["asr_text"], "match": use["match"], "reading_tts": use.get("reading_tts"),
                    "reading_asr": use.get("reading_asr"), "similarity": use.get("similarity")})
        if key in accept and row["match"] != "yes":
            row["match_auto"] = row["match"]
            row["match"] = f"yes（確かめて合格: {accept[key]}）"
        rows.append(row)
    os.makedirs(a.out, exist_ok=True)
    json.dump(rows, open(os.path.join(a.out, "lines.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    for r in rows:
        print(f"{r['key']}\t{r.get('duration_s')}\t{r['attempts']}\t{r.get('used')}\t{r['match']}\t{r.get('asr_text')}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
