#!/usr/bin/env python3
"""企画1案の仕様（spec_X.json）から、書き出しの編集指示書（edit_X.json）を組む。

    python3 tools/shorts/plan/build_edit.py <spec_A.json> --clips <clips/index.json> --out <edit_A.json>
        [--voice <voice/lines.json> --plan A]    # 本番の声（無ければ open_jtalk で尺の下書き）
        [--bgm <bgm.mp3>] [--overrides <ov_A.json>] [--speed 1.15] [--tail 0.5]

## 何をどう決めるか

- **1行の長さ ＝ その行のナレーション（頭と尻の無音を詰めた声）＋ 0.25秒 ＋ hold。**
  最後の行だけ `--tail` 秒足す（声が終わってから、字幕の消えた絵を少し見せて終わる）
- ナレーションはその行の頭から話す。字幕は render.py が声の長さから出す
- 元動画の時刻が2つある行は、行の時間を2つのカットに分ける。ナレーションが2文なら、
  **1文目が終わった声の間で切る**（「北マケドニア行きの看板。｜乗るのは、このミニバン。」）。1文なら半分で
- 「上（全編）: …」はタイトル、「中央: …」はその行のテロップ（行の頭から終わりまで）
- 演出の「寄る」は、ゆっくり寄る（1.0→1.12倍）。「A → B」の形なら、寄るのは「寄る」と書いた側のカット
- カットの入りは spec の時刻を、取り込んだ窓（clips/index.json）の頭からのコマ数に直したもの。
  窓の終わりを越えるなら、越えないところまで入りを前にずらす（ずらしたら知らせる）
- spec に `narration_cps_target` があれば、声を動画に1つの倍率で速める。倍率の上限は様式の
  `narration.max_tempo`。要る倍率が上限を越えたら上限で読ませ、**そのときの尺が `FIT_S` 秒を越えるなら
  指示書を書かずに終了コード 2 で止める**（字を何%・何字減らすかを出す）。越えなければ注意を1行出して組む
- spec の行に `orig_voice` があれば**元の声の行**（帳面 F-051: 叫びは配信の本人の声で流してよい）。声の一覧に
  その行のぶんは要らない。カット（overrides の `cuts` か `src`）と同じコマの元の音をつないだ wav を作業の置き場に作り、
  声の行の `file`（詰めない・速めない声）にする。画と声は同じ秒から取るので、カットごとに `len` か区間の `t` が要り、
  窓や `until` に合わせて入りをずらさない（越えるなら止まる）。行の間と hold のぶんは最後のカットの画を延ばす。
  喋る速さの倍率はこの行を数えずに決める。字幕は原稿の字（叫びの字）

## 人が決めること（overrides）

spec に書けない「どこに寄るか」「誰の顔をぼかすか」は overrides に書く。形は README の「build_edit の overrides」。
時刻は元動画の時刻（`H:MM:SS.s`）で書く。指示書に入るときに、窓の頭からのコマ番号に直す。
"""
from __future__ import annotations

import argparse
import json
import math
import re
import sys
import unicodedata
from pathlib import Path

HERE = Path(__file__).resolve().parent
RENDER = HERE.parent / "render"

FPS = 30
GAP_S = 0.25          # 行と行の間（声が終わってから次の行まで）
ZOOM_TO = 1.12        # 「寄る」の終わりの倍率。3〜5秒でこれくらいだと、寄っていると気づくが酔わない
MIN_CUT = 12          # 1カットの最短（0.4秒）。これより短い画は、何が写ったか分からない
# 上限の倍率で読ませた尺がこれを越えたら、組まずに止める。決まりは60秒未満（qa の container.py）。
# 見積もりは組み立てと同じ足しかた（row_frames）なので、上限のまま組めば指示書の尺と同じになる。
# 1秒手前で止めるのは、組んだあとの手直し（hold・末尾を足す）と、--max-pause で倍率を下げ直したときに
# 伸びるぶんの余裕。組んでから60秒を越えたと分かると、声の作り直しから書き出しまでやり直しになる（#916）
FIT_S = 59.0


# ---------------------------------------------------------------- 時刻と文

def sec(s: str) -> float:
    """'0:53:10' / '1:09:43.5' / '53:10' → 秒。"""
    p = [float(x) for x in s.strip().split(":")]
    while len(p) < 3:
        p.insert(0, 0.0)
    return p[0] * 3600 + p[1] * 60 + p[2]


def src_span(s: str) -> tuple[float, float | None]:
    """spec の元動画の時刻。'0:53:10–0:53:13' は区間、'0:51:00' は点（終わりは None）。"""
    parts = re.split(r"\s*[–—\-~〜]\s*", s.strip())
    if len(parts) == 2 and parts[1]:
        return sec(parts[0]), sec(parts[1])
    return sec(parts[0]), None


def parse_telop(s: str) -> tuple[str | None, str | None]:
    """「上（全編）: タイトル ／ 中央: 強調」→（タイトル, 強調）。"""
    title = center = None
    for part in re.split(r"\s*／\s*", s or ""):
        m = re.match(r"\s*(上|中央)[^:：]*[:：]\s*(.*)$", part)
        if not m:
            continue
        if m.group(1) == "上":
            title = m.group(2).strip() or None
        else:
            center = m.group(2).strip() or None
    return title, center


def zoom_segments(fx: str, n: int) -> list[bool]:
    """演出の欄から、どのカットで「寄る」か。'看板の旗に寄る → カット' は1本目だけ。"""
    segs = [x.strip() for x in re.split(r"→", fx or "")]
    if n == 1:
        return ["寄る" in (fx or "")]
    if len(segs) == n:
        return ["寄る" in s for s in segs]
    return ["寄る" in (fx or "")] + [False] * (n - 1)


def telop_parts(telop: str, line: str, start: int, voice_frames: int) -> list[dict]:
    """演出が「順に出す」のテロップを、言葉ごとに分けて、ナレーションでその言葉を言うコマに置く。

    'ケバブ屋 ＋ スタバ ＋ マクド → プレス' → ケバブ屋 /＋ スタバ /＋ マクド /→ プレス。
    記号だけの塊は次の言葉にくっつける。言うコマは、ナレーションの文の中のその言葉の位置を、
    読みの重さ（漢字は仮名の約1.7拍）で声の長さに割り当てて見積もる。原稿に無い言葉は等間隔。
    """
    sys.path.insert(0, str(RENDER))
    import render as R  # noqa: E402
    parts, pre = [], ""
    for tok in telop.split():
        if not re.sub(r"[＋+→＝=/・]", "", tok):
            pre = (pre + " " + tok).strip()
            continue
        parts.append((pre + " " + tok).strip())
        pre = ""
    if pre and parts:
        parts[-1] += " " + pre
    total = R.reading_weight(line)
    out = []
    for k, ptxt in enumerate(parts):
        word = re.sub(r"[\s＋+→＝=/・]", "", ptxt)
        idx = line.find(word)
        if k == 0:
            at = start
        elif idx >= 0:
            at = start + round(voice_frames * R.reading_weight(line[:idx]) / total)
        else:
            at = start + round(voice_frames * k / len(parts))
        out.append({"text": ptxt, "at": max(at, out[-1]["at"] + 6 if out else start)})
    return out


# ---------------------------------------------------------------- テロップは「言っていないこと」だけ

TELOP_DUP = 0.6  # テロップの字のこの割合以上が、その行の字幕かタイトルに出ているなら、同じことの繰り返し
_DROP = set(" 　「」『』（）()[]【】、。，．,.!！?？…‥・~〜→⇒＝=≒≈＋+/／:：")
_SPLIT = re.compile(r"[\s　＋+→⇒＝=≒≈/／・「」『』（）()?？!！…‥:：]+")


def _norm_map(s: str) -> tuple[str, list[int]]:
    """比べるための形（NFKC・小文字・記号と「約」を落とす）と、各字が元のどこから来たか。"""
    out, idx = [], []
    for i, ch in enumerate(s):
        for c in unicodedata.normalize("NFKC", ch).lower():
            if c in _DROP or c == "約":
                continue
            out.append(c)
            idx.append(i)
    return "".join(out), idx


def coverage(telop: str, refs: list[str]) -> float:
    """テロップの字のうち、どれかの参照（字幕・タイトル）にも出てくる字の割合。

    テロップを記号と空白で言葉に分け、言葉ごとに「3字以上（短い言葉はその長さ）続けて参照に出てくる所」
    だけを数える。2字の偶然の一致（「北マケドニア」の「ニア」と「アルバニア」）で、
    言っていない地名を言ったことにしない。
    """
    rs = [_norm_map(r)[0] for r in refs]
    total = hit = 0
    for tok in _SPLIT.split(telop):
        t, _ = _norm_map(tok)
        if not t:
            continue
        m = min(3, len(t))
        cov = [False] * len(t)
        for i in range(len(t)):
            L = 0
            for r in rs:
                j = m
                while i + j <= len(t) and t[i:i + j] in r:
                    j += 1
                L = max(L, j - 1 if j > m else 0)
            for k in range(i, i + L):
                cov[k] = True
        total += len(t)
        hit += sum(cov)
    return hit / total if total else 1.0


def highlight_phrases(telop: str, caption: str, limit: int = 3) -> list[str]:
    """消したテロップの代わりに、字幕の中で強調する言葉（字幕の中の元の書き方で返す）。

    テロップを記号と空白で言葉に分け、字幕に出てくる所を探す（そのままか、いちばん長く重なる所）。
    数字を含む言葉があれば、それだけにする（値段・時間・数がいちばん目に入れたいもの）。
    字幕の言葉の直前が「約」なら、強調に含める。
    """
    cn, cmap = _norm_map(caption)
    spans = []
    for tok in _SPLIT.split(telop):
        tn, _ = _norm_map(tok)
        if len(tn) < 1:
            continue
        k = cn.find(tn)
        L = len(tn)
        if k < 0:
            best = (0, -1)
            for i in range(len(tn)):
                for j in range(len(tn), i + 1, -1):
                    p = cn.find(tn[i:j])
                    if p >= 0 and j - i > best[0]:
                        best = (j - i, p)
                        break
            L, k = best
            if L < 2:
                continue
        a, b = cmap[k], cmap[k + L - 1] + 1
        if a > 0 and caption[a - 1] == "約":
            a -= 1
        # 言葉の続きの漢字1字までは含める（「ビッグマックの」＋「味」）。かなの助詞は含めない
        if b < len(caption) and "一" <= caption[b] <= "鿿" and (
                b + 1 >= len(caption) or caption[b + 1] in "、。 　」』！？!?"):
            b += 1
        spans.append((a, b))
    phrases = []
    for a, b in sorted(set(spans)):
        p = caption[a:b].strip("、。 　")
        if p and p not in phrases:
            phrases.append(p)
    digits = [p for p in phrases if any(ch.isdigit() for ch in unicodedata.normalize("NFKC", p))]
    return (digits or phrases)[:limit]


def sentence_split_ratio(text: str) -> float | None:
    """2文の行で、1文目が全体の何割か（読みの重さで）。1文なら None。"""
    sys.path.insert(0, str(RENDER))
    import render as R  # noqa: E402
    ss = R.sentences(text)
    if len(ss) < 2:
        return None
    first = R.reading_weight(ss[0])
    return first / sum(R.reading_weight(s) for s in ss)


# ---------------------------------------------------------------- 入力

def load_clips(paths: list[Path] | Path) -> list[dict]:
    """取り込んだ窓の一覧。clips[] = {n, start, end（元動画の秒）, file, fps, frames, ok}。

    一覧は複数渡せる（あとから足した区間を別の置き場 clips2/ に取り込んだとき）。窓の番号 n は一覧ごとに
    1 から振られるので、指示書の素材の名前は2つ目から一覧の番号を付けて分ける（c03 と c2_03）。
    """
    out = []
    for k, path in enumerate([paths] if isinstance(paths, Path) else paths):
        d = json.loads(path.read_text())
        clips = d["clips"] if isinstance(d, dict) else d
        for c in clips:
            if c.get("ok") is False:
                continue
            f = Path(c["file"])
            if not f.is_absolute():
                f = (path.parent / f).resolve()
            n = int(c.get("n", len(out) + 1))
            out.append({**c, "path": str(f), "start": float(c["start"]), "end": float(c["end"]),
                        "key": f"c{n:02d}" if k == 0 else f"c{k + 1}_{n:02d}"})
    return sorted(out, key=lambda c: c["start"])


def load_voice(path: Path, plan_id: str) -> list[dict]:
    """声の一覧（caption・tts_text・file・duration）から、その案のぶんを行の順に。"""
    d = json.loads(path.read_text())
    if isinstance(d, dict) and plan_id in d:
        items = d[plan_id]
    elif isinstance(d, dict) and isinstance(d.get("plans"), dict):
        items = d["plans"][plan_id]
    else:
        items = d["lines"] if isinstance(d, dict) else d
        items = [x for x in items
                 if x.get("plan") == plan_id or str(x.get("file", "")).replace("\\", "/").startswith(f"{plan_id}/")]
    out = []
    for x in items:
        # wav があればそちら（mp3 は復号のたびに頭の数ミリ秒が版で揺れる。wav は揺れない）
        f = Path(x.get("wav") or x["file"])
        if not f.is_absolute():
            f = (path.parent / f).resolve()
        out.append({**x, "file": str(f)})
    return out


def find_clip(clips: list[dict], t0: float, dur: float) -> tuple[dict, float]:
    """t0 から dur 秒を取れる窓と、取り始める時刻。窓の終わりを越えるなら前にずらす。

    一覧が2つあって窓が重なるときは、t0 から dur 秒をまるごと含む窓を先に選ぶ（前にずらさずに済む）。
    """
    for c in clips:
        if c["start"] - 1e-6 <= t0 and t0 + dur <= c["end"] + 1e-6:
            return c, t0
    for c in clips:
        if c["start"] - 1e-6 <= t0 < c["end"]:
            if t0 + dur <= c["end"] + 1e-6:
                return c, t0
            t1 = c["end"] - dur
            if t1 >= c["start"] - 1e-6:
                print(f"  注意: {fmt(t0)} から {dur:.2f}秒は窓（〜{fmt(c['end'])}）を越えるので、"
                      f"{fmt(t1)} からにした", file=sys.stderr)
                return c, max(t1, c["start"])
            sys.exit(f"窓が短すぎる: {fmt(t0)} から {dur:.2f}秒（窓 {fmt(c['start'])}–{fmt(c['end'])}）")
    sys.exit(f"{fmt(t0)} を含む窓が無い（clips/index.json に足して取り込み直す）")


def fmt(t: float) -> str:
    h, r = divmod(t, 3600)
    m, s = divmod(r, 60)
    return f"{int(h)}:{int(m):02d}:{s:04.1f}"


def fmt_exact(t: float) -> str:
    """コマの境目まで落とさない時刻（「同上」の続きを、前のカットの次のコマから取るため）。"""
    h, r = divmod(t, 3600)
    m, s = divmod(r, 60)
    return f"{int(h)}:{int(m):02d}:{s:09.6f}"


def spoken_chars(text: str) -> int:
    """喋る速さの物差しにする字数（句読点・記号・空白を数えない。長音の「ー」は数える）。"""
    return sum(1 for ch in unicodedata.normalize("NFKC", text) if unicodedata.category(ch)[0] in "LN")


def bare_text(text: str) -> str:
    """字と数だけにそろえる（国旗・空白・改行・句読点・記号を落とす）。

    題の札とその行の読み上げが同じ言葉かを見る。札は国旗と改行と句読点の打ち方だけ違うのがふつうで
    （「🇸🇪 ストックホルム来たら、\\n地下鉄が高すぎた！」と「ストックホルム来たら、地下鉄が高すぎた！」）、
    そこで別の言葉と読むと、札と字幕に同じ言葉が2回出る。
    """
    return "".join(ch for ch in unicodedata.normalize("NFKC", text or "") if unicodedata.category(ch)[0] in "LN")


# ---------------------------------------------------------------- 組み立て

def narration_frames(lines: list[dict], narr: dict, work: Path) -> list[tuple[int, list[tuple[int, int]]]]:
    """行ごとの（声のコマ数, 声の間）。render.py と同じ詰め方で測る（字幕と同じ物差し）。"""
    sys.path.insert(0, str(RENDER))
    import render as R  # noqa: E402
    spf = R.SR // FPS
    out = []
    for ln in lines:
        wav = R.narration_wav(ln, narr, Path("/"), work)
        x = R.decode_audio(wav, 1)[:, 0]
        out.append((math.ceil(len(x) / spf), R.speech_onsets(x, spf)))
    return out


def big_looks_for(rows: list[dict], card_row: int | None, big_order: list[str], big_looks: dict) -> list[str | None]:
    """行ごとの【大】の見た目の名前（【大】でない行は None）。

    spec の big_style（様式の big.looks の名前）。書いていなければ様式の order の順に替える（同じ形が続くと
    目が慣れる）。題の札の行は【大】にしない。
    """
    out: list[str | None] = []
    n_big = 0
    for i, r in enumerate(rows):
        if not r.get("big") or i == card_row:
            out.append(None)
            continue
        look = r.get("big_style") or big_order[n_big % len(big_order)]
        if look not in big_looks:
            sys.exit(f"{i}行目: big_style {look!r} は様式の big.looks に無い（{', '.join(big_looks)}）")
        n_big += 1
        out.append(look)
    return out


def row_frames(voice_frames: int, hold: float, pre: int, last: bool, args) -> int:
    """1行の長さ（コマ）＝ 声 ＋ 行の間 ＋ hold ＋【大】の字が出きるまでの間 ＋（最後の行だけ）末尾。

    組み立ても、上限で読ませたときの尺の見積もりも、これ1つで数える（足しかたが2つあると、
    見積もりでは入るのに組むと60秒を越える、が起きる）。
    """
    n = voice_frames + round((args.gap + hold) * FPS) + pre
    if last:
        n += round(args.tail * FPS)
    return n


def over_cap_message(cap: float, video_s: float, voice_s: float, chars: int) -> str:
    """上限の倍率でも尺に入らないときの、止まる知らせ。字を何%・何字減らせば FIT_S 秒に入るか。

    減らすのは声だけで、行の間と末尾は行の数で決まるので残る。声は字の数にほぼ比例するとみて、
    声に使える秒（FIT_S − 声のほか）に入るまでの割合を出す。割合は切り上げ、字数はその割合から出す
    （2つの数が食い違わない。行ごとの声はコマに切り上がるので、ちょうどの割合だと入りきらないことがある）。
    """
    room = FIT_S - (video_s - voice_s)
    head = f"上限 {cap:g} でも {video_s:.1f} 秒になる。"
    if room <= 0:
        return (head + f"行の間と末尾だけで {video_s - voice_s:.1f} 秒あり、字を減らしても60秒未満にならない。"
                "行の数を減らす（viral-shorts-creator の script_writing.md 6）")
    pct = math.ceil((1 - room / voice_s) * 100)
    return (head + f"60秒未満にするには、字を約 {pct}% 減らす（あと {-(-chars * pct // 100)} 字）\n"
            f"  倍率は上げない（早送りに聞こえる）。原稿を減らして声を作り直し、組み直す。"
            f"見込みで {FIT_S:.1f} 秒までに入れる（viral-shorts-creator の script_writing.md 6）")


def split_row(n_frames: int, n_cuts: int, voice_frames: int, pauses, text: str, shares) -> list[int]:
    """行の長さ n_frames を n_cuts 本に分ける（各カットのコマ数）。"""
    if n_cuts == 0:
        return []
    if n_cuts == 1:
        return [n_frames]
    if shares:
        tot = sum(shares)
        b, acc, out = 0, 0.0, []
        for s in shares[:-1]:
            acc += s
            nb = round(n_frames * acc / tot)
            out.append(nb - b)
            b = nb
        return out + [n_frames - b]
    if n_cuts == 2:
        r = sentence_split_ratio(text)
        if r is not None:
            guess = round(voice_frames * r)
            # 1文目の終わりの「間」のあと、2文目の声が出るコマで切る（画と声が同時に変わる）
            near = [j for _, j in pauses if abs(j - guess) <= 15]
            b = min(near, key=lambda j: abs(j - guess)) if near else guess
        else:
            b = n_frames // 2
        b = max(MIN_CUT, min(n_frames - MIN_CUT, b))
        return [b, n_frames - b]
    base = n_frames // n_cuts
    return [base] * (n_cuts - 1) + [n_frames - base * (n_cuts - 1)]


def blur_regions(regs: list[dict], clip: dict) -> list[dict]:
    """overrides のぼかし（元動画の時刻）→ 指示書のぼかし（窓の頭からのコマ番号）。"""
    out = []
    for r in regs or []:
        o = {k: v for k, v in r.items() if k not in ("keys", "from_t", "to_t", "note")}
        if "keys" in r:
            o["keys"] = [{"f": round((sec(k["t"]) - clip["start"]) * FPS), "rect": k["rect"]} for k in r["keys"]]
        if "from_t" in r:
            o["from"] = round((sec(r["from_t"]) - clip["start"]) * FPS)
        if "to_t" in r:
            o["to"] = round((sec(r["to_t"]) - clip["start"]) * FPS)
        if r.get("note"):
            o["note"] = r["note"]
        out.append(o)
    return out


def library_for(lib: list[dict], clip: dict, t0: float, t1: float) -> list[dict]:
    """ぼかしの帳面（元動画の時刻で書いた顔の箱）のうち、このカット [t0, t1) に掛かるもの。

    顔は「元動画のこの時刻に、この人が写っている」という事実なので、案ごとではなく動画ごとに1冊にする。
    同じ店・同じバスを3案が使い回しても、1回決めた箱がどの案にも効く。カットの入りを動かしても外れない。
    """
    out = []
    for r in lib:
        a, b = sec(r["from_t"]), sec(r["to_t"])
        if a < t1 and b > t0:
            out.append(r)
    return blur_regions(out, clip)


def orig_pieces(i: int, specs: list[dict], clips: list[dict]) -> list[dict]:
    """元の声の行（spec の `orig_voice`。帳面 F-051）の、声と画に使う元動画の区間。

    叫びのような本人の声を、AI の声で読まずにその秒の元の音で流す行。画と声は同じ秒から取る
    （どちらかをずらすと、叫びと画の動きがずれる）ので、カットごとの長さが先に決まっていないといけない。
    長さは `len`（秒）か、`t` を区間（'0:10:24.0–0:10:25.6'）で書く。`until` は画の上限のまま
    （行の間のぶん延ばした画が越えたら止める。orig_place）。返すのは [{"clip", "in", "frames"}]。
    """
    out = []
    for k, cs in enumerate(specs):
        t0, t1 = src_span(cs["t"])
        if cs.get("len"):
            m = round(float(cs["len"]) * FPS)
        elif t1 is not None:
            m = round((t1 - t0) * FPS)
        else:
            sys.exit(f"{i}行目は元の声の行（orig_voice）: カット {k} の長さを len か区間の t で書く"
                     f"（画と声を同じ秒から取るので、声の長さが先に要る）")
        if m < MIN_CUT:
            sys.exit(f"{i}行目（元の声）: カット {k} が {m}コマ（{MIN_CUT}コマより短い）")
        clip = next((c for c in clips if c["start"] - 1e-6 <= t0 and t0 + m / FPS <= c["end"] + 1e-6), None)
        if clip is None:
            sys.exit(f"{i}行目（元の声）: {fmt(t0)} から {m / FPS:.2f}秒をまるごと含む窓が無い"
                     f"（窓に合わせて入りをずらすと、声と画が合わなくなる）")
        out.append({"clip": clip, "in": round((t0 - clip["start"]) * FPS), "frames": m})
    return out


def orig_place(i: int, k: int, cs: dict, p: dict, m: int) -> tuple[dict, float]:
    """元の声の行のカットの入り。声と同じコマから取り、ふつうの行のように前へずらさない。

    行の間と hold のぶん、最後のカットの画は声より長い。その画が窓や until を越えるなら止める
    （ずらして収めると、そのカットの画が声より前の秒になる）。
    """
    clip = p["clip"]
    t0 = clip["start"] + p["in"] / FPS
    end = t0 + m / FPS
    if end > clip["end"] + 1e-6:
        sys.exit(f"{i}行目（元の声）: カット {k} の画（{m / FPS:.2f}秒）が窓の終わり {fmt(clip['end'])} を越える"
                 f"（ずらすと声と画が合わない。len を短くする）")
    if cs.get("until") and end > sec(cs["until"]) + 1e-6:
        sys.exit(f"{i}行目（元の声）: カット {k} の画（行の間を足して {m / FPS:.2f}秒）が until {cs['until']} を越える"
                 f"（ずらすと声と画が合わない。len を短くする）")
    return clip, t0


# 元の声を wav に書くときの頂点。wav は 16bit なので、1.0 を越えた所は平らに割れる（滝の回の叫びは、
# 配信の AAC を復号すると 1.048 まで出て、5サンプル張り付いた。検査の clipping が「声の平らな頂点」で落とした）
ORIG_PEAK = 0.9


def orig_gain(peak: float) -> float:
    """元の声の wav に掛ける倍率。頂点が ORIG_PEAK を越えるときだけ、そこまで下げる。

    上げはしない（大きさは書き出しが行ごとに「話している間の RMS」で揃えるので、ここで下げても仕上がりは同じ）。
    """
    return ORIG_PEAK / peak if peak > ORIG_PEAK else 1.0


def orig_audio(pieces: list[dict], work: Path, name: str) -> Path:
    """元の声の行の声: カットと同じコマの元の音をつないだ1本の wav（48kHz・1ch）。

    取り方は書き出しが元の音を入れるとき（render.py の audio_stems の audio_db）と同じ
    （入りの1秒前から開いて、コマの境目で切る）。つなぎ目は 12ms ずつ上げ下げして、プツッと鳴らさない。
    声の行の `file`（詰めない・速めない声）として渡すので、ナレーションと同じ大きさに揃い、BGM もその間は下がる。
    """
    sys.path.insert(0, str(RENDER))
    import numpy as np  # noqa: E402
    import render as R  # noqa: E402
    spf = R.SR // FPS
    fade = int(R.SR * 0.012)
    parts = []
    for p in pieces:
        ss = max(0, math.floor(p["in"] / FPS) - 1)
        rel = p["in"] - ss * FPS
        m = p["frames"] * spf
        x = R.decode_audio(Path(p["clip"]["path"]), 1, ss=ss)[rel * spf:rel * spf + m, 0]
        if len(x) < m:
            x = np.concatenate([x, np.zeros(m - len(x), dtype=np.float32)])
        env = np.ones(m, dtype=np.float32)
        env[:fade] = np.linspace(0, 1, fade, dtype=np.float32)
        env[-fade:] = np.linspace(1, 0, fade, dtype=np.float32)
        parts.append(x * env)
    y = np.concatenate(parts)
    y = y * orig_gain(float(np.max(np.abs(y))) if len(y) else 0.0)
    out = work / f"{name}.wav"
    out.parent.mkdir(parents=True, exist_ok=True)
    return R.write_wav(y[:, None], out)


def build(spec: dict, clips: list[dict], voice: list[dict] | None, args) -> dict:
    ov = json.loads(Path(args.overrides).read_text()) if args.overrides else {}
    lib = json.loads(Path(args.blur).read_text())["regions"] if args.blur else []
    rows_ov = ov.get("rows", {})
    rows = spec["rows"]
    # 元の声の行（帳面 F-051）: AI の声を作らず、その秒の元の音を声の行に置く。声の一覧にはこの行のぶんが無い
    orig_rows = {i for i, r in enumerate(rows) if r.get("orig_voice")}
    orig_specs = {i: rows_ov.get(str(i), {}).get("cuts") or [{"t": s} for s in rows[i]["src"]] for i in orig_rows}
    pieces = {i: orig_pieces(i, orig_specs[i], clips) for i in sorted(orig_rows)}

    if voice is not None:
        if len(voice) != len(rows) - len(orig_rows):
            sys.exit(f"声の数 {len(voice)} と、声を作る行の数 {len(rows) - len(orig_rows)}"
                     f"（行 {len(rows)}・元の声の行 {len(orig_rows)}）が合わない")
        narr = {"engine": "files"}
        vit = iter(voice)
        lines = []
        for i, r in enumerate(rows):
            if i in orig_rows:
                lines.append({"text": r["line"]})
                continue
            v = next(vit)
            lines.append({"text": v.get("caption") or r["line"], "audio": v["file"],
                          **({"tts_text": v["tts_text"]} if v.get("tts_text") else {})})
            if (v.get("caption") or "").replace(" ", "") != r["line"].replace(" ", ""):
                print(f"  注意: {i}行目の字幕が原稿と違う: {v.get('caption')!r} / {r['line']!r}", file=sys.stderr)
    else:
        narr = {"engine": "open_jtalk", "speed": args.speed}
        lines = [{"text": r["line"]} for r in rows]
    work = Path(args.work)
    for i in sorted(orig_rows):
        wav = orig_audio(pieces[i], work, f"orig_{spec.get('id', 'X')}_{i:02d}")
        lines[i] = {"text": rows[i]["line"], "orig_voice": True, "file": str(wav)}
    spoken = [k for k in range(len(rows)) if k not in orig_rows]

    def measure(narr_: dict) -> list[tuple[int, list[tuple[int, int]]]]:
        """行ごとの（声のコマ, 声の間）。元の声の行は区間の長さそのもの（速めない・詰めない）"""
        got = dict(zip(spoken, narration_frames([lines[k] for k in spoken], narr_, work)))
        return [(sum(p["frames"] for p in pieces[k]), []) if k in orig_rows else got[k] for k in range(len(rows))]
    sys.path.insert(0, str(RENDER))
    import render as R  # noqa: E402
    st_all = R.load_style(args.style, Path(args.out).resolve().parent)
    big_st = st_all["big"]
    big_order, big_looks = big_st["order"], big_st["looks"]
    card_row = next((i for i, r in enumerate(rows) if r.get("card")), None) if spec.get("title_card") else None
    looks = big_looks_for(rows, card_row, big_order, big_looks)
    # 頁を分ける行（caption_parts）は、行の頭がふつうの字幕なので、【大】の字が出きるのを待たない。
    # 元の声の行も待たない（声を遅らせると、同じ秒から取った画とずれる）
    pres = [int(big_looks[lk].get("pre_roll_frames", 0)) if lk and not r.get("caption_parts")
            and i not in orig_rows else 0 for i, (lk, r) in enumerate(zip(looks, rows))]
    holds = [float(rows_ov.get(str(i), {}).get("hold", r.get("hold", 0))) for i, r in enumerate(rows)]

    measured = measure(narr)
    speech = None
    cps = spec.get("narration_cps_target")
    if cps and args.max_tempo is None:
        # 上限は様式の narration.max_tempo と同じ値を読む。別の既定（2.2）を持っていると、
        # 渡し忘れた指示書が render.py の上限で止まる
        args.max_tempo = R.tempo_cap(st_all)
    if cps:
        # 喋る速さを、伸びているショートの速さ（毎秒 cps 字）に揃える。倍率は動画に1つ
        # （行ごとに変えると、行の間で速さが揺れて不自然）。声はもとの長さを詰めたものから測る。
        # 元の声の行は速めないので、字にも長さにも数えない（数えると、叫びの長い間で倍率が上がる）
        chars = sum(spoken_chars(lines[k]["text"]) for k in spoken)
        dur = sum(measured[k][0] for k in spoken) / FPS
        raw = dur / (chars / cps)
        tempo = min(max(raw, 1.0), args.max_tempo)
        narr["tempo"] = round(tempo, 3)
        if args.max_pause:
            narr["max_pause_s"] = args.max_pause
        measured = measure(narr)
        voiced = sum(measured[k][0] for k in spoken) / FPS
        if raw > args.max_tempo:
            # 上限で読ませた尺を、組み立てと同じ足しかたで見積もる。入らないなら、ここで止める。
            # 組んで書き出してから60秒を越えたと分かると、声の作り直しから書き出しまでがやり直しになる。
            # 倍率を上げて入れるのはしない（早送りに聞こえる。#285）。減らすのは字
            vfs = [vf for vf, _ in measured]
            fit_s = sum(row_frames(vf, h, p, k == len(vfs) - 1, args)
                        for k, (vf, h, p) in enumerate(zip(vfs, holds, pres))) / FPS
            if fit_s > FIT_S:
                print(over_cap_message(args.max_tempo, fit_s, voiced, chars), file=sys.stderr)
                sys.exit(2)
            print(f"  注意: 毎秒 {cps} 字に要る倍率 {raw:.2f} は上限 {args.max_tempo} を越えるので、上限で止めた"
                  f"（上限で読んで {fit_s:.1f} 秒の見込み）", file=sys.stderr)
        for _ in range(2):
            # 間を縮めたぶん、声の間の速さが目標を越える。倍率を下げて合わせ直す（2回でほぼ止まる）
            want = chars / cps
            if abs(voiced - want) < 1.0 / FPS * len(spoken) / 2:
                break
            narr["tempo"] = round(min(max(narr["tempo"] * voiced / want, 1.0), args.max_tempo), 3)
            measured = measure(narr)
            voiced = sum(measured[k][0] for k in spoken) / FPS
        speech = {"chars": chars, "raw_voice_s": round(dur, 2), "tempo": narr["tempo"], "target_cps": cps,
                  "voiced_s": round(voiced, 2), "cps_voiced": round(chars / voiced, 2)}

    title, _ = parse_telop(rows[0].get("telop", ""))
    title = ov.get("title") or title or spec.get("title_card") or spec["title"]
    # 題の札が、その行の読み上げと別の言葉のとき（あやと F-043: 札は「手段と日数」、1行目は「回れた中身」。
    # フランス周遊の「🇫🇷 フランスを10日レンタカー旅してみた！」）は、札はその行の字幕を兼ねない。
    # 兼ねさせると、読み上げている1行目の字が画面のどこにも出ない
    card_own = card_row is not None and bare_text(title) != bare_text(rows[card_row]["line"])
    if card_row is not None and not card_own:
        # 題の札がその行の字幕を兼ねる（札と字幕に同じ言葉を2回出さない）
        lines[card_row]["caption"] = ""
    mood_looks = (st_all.get("moods") or {}).get("looks", {})
    notes = []
    prev_end: float | None = None  # 1つ前の行の最後のカットが、元動画のどこで終わったか（「同上」の続き）
    prev_spec: dict = {}

    sources: dict[str, dict] = {}
    cuts, telops, meta_rows = [], [], []
    t = 0
    for i, (r, ln, (vf, pauses)) in enumerate(zip(rows, lines, measured)):
        ro = rows_ov.get(str(i), {})
        n = row_frames(vf, holds[i], pres[i], i == len(rows) - 1, args)
        ln["at"] = t
        if r.get("big_split") and not looks[i]:
            sys.exit(f"{i}行目: big_split（人が決めた割れ目）は【大】の行だけに書ける")
        if looks[i]:
            # 【大】の行は字幕そのものを大きく（見た目の選びかたは big_looks_for）
            ln["big"] = looks[i]
            if r.get("big_split"):
                # budoux が見落とす切れ目を人が決める（「1回｜700円やって！」）。確かめるのは書き出し（render.py の manual_split）
                ln["split"] = r["big_split"]
            if pres[i]:
                # 字が薄い所から現れる見た目は、出きってから声を出す（声の頭で字が読めないと、字幕と声がずれる）。
                # 画の切り替えと字の出はじめは行の頭、声はそのあと pre コマ（行の長さに足してある）。
                # オチの前のひと呼吸になる
                ln["caption_from"] = t
                ln["at"] = t + pres[i]
        mood = r.get("mood")
        if mood and mood != "plain" and not r.get("big") and i != card_row:
            # 感情の字幕（書体・色・動きは様式の moods.looks[mood]）。plain・【大】の行・題の札の行には付けない
            if mood not in mood_looks:
                sys.exit(f"{i}行目: mood {mood!r} は様式の moods.looks に無い（plain, {', '.join(mood_looks)}）")
            ln["mood"] = mood
        if r.get("caption_parts"):
            # 1行の字幕を、言う順に見た目の違う頁へ分ける（render.py の narration.lines[].parts）。
            # 例: 前半はふつうの字幕・後半だけ【大】（big: true はこの行の【大】の見た目、名前ならその見た目）、
            # 前置きはふつうの字幕・チャットの文だけコメントの札（mood: "chat"）。行の big・mood は使わない
            parts = []
            for pt in r["caption_parts"]:
                q = {"text": pt["text"]}
                if pt.get("split") and not pt.get("big"):
                    sys.exit(f"{i}行目: caption_parts の split（人が決めた割れ目）は【大】の頁だけに書ける")
                if pt.get("big"):
                    q["big"] = looks[i] if pt["big"] is True else pt["big"]
                    if q["big"] not in big_looks:
                        sys.exit(f"{i}行目: caption_parts の big {q['big']!r} は様式の big.looks に無い")
                    if pt.get("split"):
                        q["split"] = pt["split"]
                elif pt.get("mood") and pt["mood"] != "plain":
                    if pt["mood"] not in mood_looks:
                        sys.exit(f"{i}行目: caption_parts の mood {pt['mood']!r} は様式の moods.looks に無い")
                    q["mood"] = pt["mood"]
                parts.append(q)
            ln["parts"] = parts
            ln.pop("big", None)
            ln.pop("mood", None)
        if r.get("face_overlap_ok"):
            # 顔を避けきれない行の例外（顔が画面いっぱいで、上にも下にも置けない）。重なってよいコマ数と理由。
            # 品質チェックは、書いたコマ数を超えたら落とす（例外が黙って広がらないように）
            fo = r["face_overlap_ok"]
            if not isinstance(fo, dict) or int(fo.get("frames", -1)) < 0 or not fo.get("why"):
                sys.exit(f"{i}行目: face_overlap_ok は {{\"frames\": 重なってよいコマ数, \"why\": 理由}} で書く")
            ln["face_overlap_ok"] = {"frames": int(fo["frames"]), "why": str(fo["why"])}
            if fo.get("keep_size"):
                # 小さくして逃がさない（顔の誤検出のために字が縮むのは逆効果、と人が決めた行。C17 の床と扉）
                ln["face_overlap_ok"]["keep_size"] = True
        if r.get("corner_note"):
            notes.append({"from": t, "to": t + n, "text": r["corner_note"]})
        _, center = parse_telop(r.get("telop", ""))
        center = ro.get("telop", center)
        tel_meta = None
        if center:
            # テロップは「ナレーションもタイトルも言っていないこと」だけを出す（本人の言葉・訳・地図の矢印）。
            # 同じことを字幕とテロップで2回見せると、画面が字だらけになって、どちらも読まれない。
            # 消したテロップの言葉は、字幕の中で黄色にして目に入れる
            cap_text = ln.get("caption") or ln["text"]
            cov = coverage(center, [cap_text, title])
            keep = ro.get("telop_keep", cov < TELOP_DUP)
            tel_meta = {"text": center, "coverage": round(cov, 2), "shown": bool(keep)}
            if not keep:
                hl = ro.get("highlight") or highlight_phrases(center, cap_text)
                if hl:
                    ln["highlight"] = hl
                tel_meta["highlight"] = hl
                center = None
        elif ro.get("highlight"):
            ln["highlight"] = ro["highlight"]
        specs = ro.get("cuts")
        if not specs and r.get("same_as_prev") and prev_end is not None:
            # 「同上」の行は前の行の画をそのまま続ける（切れ目を作らない。元動画の続きのコマから）。
            # 寄り・明るさ・札も引き継ぐ（引き継がないと、つなぎ目で寄りが外れて隠していた顔が出る）
            cont = {"t": fmt_exact(prev_end), "note": "前の行の画の続き"}
            for k in ("gamma", "inset", "focus_x", "focus_y", "audio_db"):
                if k in prev_spec:
                    cont[k] = prev_spec[k]
            if prev_spec.get("zoom"):
                z = dict(prev_spec["zoom"])
                z["from"] = z.get("to", z.get("from", 1.0))
                cont["zoom"] = z
            specs = [cont]
        elif specs and specs[0].get("continue") and prev_end is not None:
            # overrides で「前の行の画の続き」を選んだとき（spec は別の画を指しているが、続けたほうが良い所）
            specs = [{**specs[0], "t": fmt_exact(prev_end)}] + specs[1:]
        specs = specs or [{"t": s} for s in r["src"]]
        if i in orig_rows:
            # 元の声の行は、声を取ったカットそのもの（「同上」で前の行の続きにはしない。声と画の秒がずれる）
            specs = orig_specs[i]
        zooms = zoom_segments(r.get("fx", ""), len(specs))
        # len（秒）を書いたカットはその長さで固定し、残りを書いていないカットで分ける。
        # 元の声の行は、声の区間の長さで固定（行の間と hold のぶんは最後のカットの画を延ばす）
        fixed = {k: round(float(c["len"]) * FPS) for k, c in enumerate(specs) if c.get("len")}
        if i in orig_rows:
            fixed = {k: p["frames"] for k, p in enumerate(pieces[i])}
            fixed[len(specs) - 1] += n - sum(fixed.values())
        free = [k for k in range(len(specs)) if k not in fixed]
        rest = n - sum(fixed.values())
        if free and rest < MIN_CUT * len(free):
            sys.exit(f"{i}行目: len の合計が行の長さ（{n / FPS:.2f}秒）を食いつぶしている")
        if not free and rest:
            # 全部のカットに len を書いた行は、丸めの差（と書き違い）を最後のカットで吸う。
            # 吸わないと行の長さとカットの合計がずれ、後ろの行がみな「画が字幕より1コマ先に替わる」になった
            last = len(specs) - 1
            if fixed[last] + rest < MIN_CUT:
                sys.exit(f"{i}行目: len の合計が行の長さ（{n / FPS:.2f}秒）を越えている")
            if abs(rest) > 3:
                print(f"  注意: {i}行目 len の合計と行の長さが {rest}コマ違うので、最後のカットで合わせた",
                      file=sys.stderr)
            fixed[last] += rest
            rest = 0
        free_specs = [specs[k] for k in free]
        # 文の切れ目で分けるのは、行まるごとを分けるときだけ（固定のカットがあると声の位置がずれる）
        free_lens = split_row(rest, len(free), vf, pauses, "" if fixed else ln["text"],
                              [c.get("share") for c in free_specs] if all(c.get("share") for c in free_specs)
                              else None) if free else []
        lens = [fixed[k] if k in fixed else free_lens[free.index(k)] for k in range(len(specs))]
        assert sum(lens) == n, f"{i}行目: カットの合計 {sum(lens)} コマ ≠ 行の長さ {n} コマ"
        row_cuts = []
        for k, (cs, m) in enumerate(zip(specs, lens)):
            t0, _ = src_span(cs["t"])
            if i in orig_rows:
                clip, t0 = orig_place(i, k, cs, pieces[i][k], m)
            else:
                if cs.get("until") and t0 + m / FPS > sec(cs["until"]) + 1e-6:
                    # ここより後ろは使えない（指が映る・場面が変わる）。足りないぶんは入りを前にずらす
                    t1 = sec(cs["until"]) - m / FPS
                    print(f"  注意: {i}行目 {fmt(t0)} から {m / FPS:.2f}秒は {cs['until']} を越えるので、"
                          f"{fmt(t1)} からにした", file=sys.stderr)
                    t0 = t1
                clip, t0 = find_clip(clips, t0, m / FPS)
            key = clip.get("key") or f"c{int(clip.get('n', len(sources) + 1)):02d}"
            sources.setdefault(key, {"path": clip["path"], "watermark": "prism_live", "t0": clip["start"]})
            fin = round((t0 - clip["start"]) * FPS)
            cut = {"src": key, "in": fin, "out": fin + m, "row": i}
            if "focus_x" in cs:
                cut["focus_x"] = cs["focus_x"]
            if "focus_y" in cs:
                cut["focus_y"] = cs["focus_y"]
            if cs.get("zoom") is not None:
                if cs["zoom"]:
                    cut["zoom"] = {"from": 1.0, "to": ZOOM_TO, **cs["zoom"]}
            elif zooms[k]:
                cut["zoom"] = {"from": 1.0, "to": ZOOM_TO}
            blur = blur_regions(cs.get("blur"), clip) + library_for(lib, clip, t0, t0 + m / FPS)
            if blur:
                cut["blur"] = blur
            if cs.get("audio_db") is not None:
                cut["audio_db"] = cs["audio_db"]
            if cs.get("gamma"):
                cut["gamma"] = cs["gamma"]
            if cs.get("inset"):
                ins = {k: v for k, v in cs["inset"].items() if k != "keys"}
                if cs["inset"].get("keys"):
                    # 元動画の時刻 → 窓の頭からのコマ番号（ぼかしの箱と同じ）
                    ins["keys"] = [{"f": round((sec(k["t"]) - clip["start"]) * FPS), "rect": k["rect"]}
                                   for k in cs["inset"]["keys"]]
                cut["inset"] = ins
            if cs.get("note"):
                cut["note"] = cs["note"]  # なぜこの画にしたか（人が直すときに読む。書き出しは読まない）
            cuts.append(cut)
            row_cuts.append(f"{fmt(t0)}+{m / FPS:.2f}s")
        prev_end = clip["start"] + cuts[-1]["out"] / FPS
        prev_spec = specs[-1]
        if center:
            # テロップを出すカット。既定は行ぜんぶ。inset（札で見せる画）のカットとは同じ帯を取り合うので、
            # 既定ではそこを外す。overrides の telop_cuts で選べる
            bounds = [t] + [t + sum(lens[:k + 1]) for k in range(len(lens))]
            on = ro.get("telop_cuts") or [k for k, cs in enumerate(specs) if not cs.get("inset")]
            if on:
                a, b = bounds[min(on)], bounds[max(on) + 1]
                tp = {"from": a, "to": b, "text": center}
                if "順に" in r.get("fx", "") and len(center.split()) > 1:
                    tp["parts"] = telop_parts(center, ln["text"], t, vf)
                telops.append(tp)
        meta_rows.append({"row": i, "from": t, "frames": n, "voice_frames": vf, "cuts": row_cuts,
                          "line": ln["text"], "telop": tel_meta,
                          **({"big": ln["big"]} if ln.get("big") else {}),
                          **({"parts": ln["parts"]} if ln.get("parts") else {}),
                          **({"orig_voice": True} if i in orig_rows else {}),
                          **({"same_as_prev": True} if r.get("same_as_prev") else {})})
        t += n

    edit = {
        "_note": f"build_edit.py が {Path(args.spec).name} から組んだ。人が直すのは overrides か、この指示書の数字",
        "version": 2,
        "id": f"{args.video}-{spec['id']}" if args.video else spec["id"],
        "style": args.style,
        "sources": sources,
        "cuts": cuts,
        "title": {"text": title},
        "telops": telops,
        "narration": {**narr, "lines": lines},
        "meta": {"spec": str(Path(args.spec).resolve()), "fps": FPS, "frames": t, "seconds": round(t / FPS, 3),
                 "rows": meta_rows},
    }
    if card_row is not None:
        # 題の札は頭の title_card_seconds 秒まで（ずっと出すと、字幕と画の場所を食う）。様式の
        # title_card.end_with_line なら、書き出しが「題の読み上げが終わるコマ」でもっと早く消す
        edit["title"] = {"text": title, "look": "card", "from": 0, "line": card_row,
                         "to": round(float(spec.get("title_card_seconds", 4.0)) * FPS)}
        if card_own:
            # 字幕を兼ねない札は、書き出しが「その行の字幕」として扱わないように line を持たせない。
            # end_with_line も line を見る仕組みなので、消すコマ（題の行の終わり＝次の行の頭）をここで決めて渡す
            row = meta_rows[card_row]
            del edit["title"]["line"]
            edit["title"]["to"] = min(edit["title"]["to"], row["from"] + row["frames"])
    if notes:
        edit["notes"] = notes
    if speech:
        speech["video_s"] = round(t / FPS, 2)
        speech["cps_video"] = round(speech["chars"] / (t / FPS), 2)
        edit["meta"]["speech"] = speech
    audio = {k: v for k, v in (("duck_db", args.duck_db),) if v is not None}
    if audio:
        edit["audio"] = audio
    if args.bgm:
        db_ = args.bgm_db if args.bgm_db is not None else float(ov.get("bgm_db", 0))
        edit["bgm"] = {"path": str(Path(args.bgm).resolve()), "db": db_,
                       **({"start_s": ov["bgm_start_s"]} if "bgm_start_s" in ov else {})}
    return edit


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("spec")
    ap.add_argument("--clips", required=True, type=Path, action="append",
                    help="取り込んだ窓の一覧（index.json）。あとから足した区間の一覧があれば、もう一度 --clips で渡す")
    ap.add_argument("--out", required=True, type=Path)
    ap.add_argument("--voice", type=Path, help="声の一覧（lines.json）。無ければ open_jtalk で下書き")
    ap.add_argument("--plan", help="声の一覧のどの案か（既定: spec の id）")
    ap.add_argument("--bgm")
    ap.add_argument("--overrides")
    ap.add_argument("--blur", help="ぼかしの帳面（動画ごとに1冊。元動画の時刻で書いた顔の箱）")
    ap.add_argument("--speed", type=float, default=1.15, help="open_jtalk の速さ（下書きのとき）")
    ap.add_argument("--tail", type=float, default=0.5,
                    help="最後の行に足す秒。声が終わってから絵を少し見せて終わる（0.25秒の間と合わせて約0.75秒）")
    ap.add_argument("--style", default="style.json",
                    help="様式の JSON（tools/shorts/render/ の名前か、指示書からの相対）。書体・字の見た目・動き・音の大きさ")
    ap.add_argument("--gap", type=float, default=GAP_S,
                    help="行と行の間の秒（声が終わってから次の行まで）。伸びているショートは 0.1〜0.15 秒")
    ap.add_argument("--max-tempo", type=float,
                    help="spec の narration_cps_target に合わせて声を速くするときの、倍率の上限（既定は様式の narration.max_tempo）")
    ap.add_argument("--max-pause", type=float,
                    help="行の中の間をこの秒数までに縮める（速めたあとの時間。伸びているショートはほとんど間を置かない）")
    ap.add_argument("--bgm-db", type=float, help="BGM の大きさの上げ下げ（dB。既定は overrides の bgm_db か 0）")
    ap.add_argument("--duck-db", type=float, help="ナレーションの間に BGM を下げる量（dB。既定は様式の duck_db）")
    ap.add_argument("--video", help="指示書の id の頭（動画 ID）")
    ap.add_argument("--work", help="声の測りの置き場（既定: 出力の横に <名前>.narr）")
    a = ap.parse_args(argv)
    a.work = a.work or str(a.out.with_suffix(".narr"))
    spec = json.loads(Path(a.spec).read_text())
    clips = load_clips(a.clips)
    voice = load_voice(a.voice, a.plan or spec["id"]) if a.voice else None
    edit = build(spec, clips, voice, a)
    a.out.parent.mkdir(parents=True, exist_ok=True)
    a.out.write_text(json.dumps(edit, ensure_ascii=False, indent=1) + "\n")
    print(json.dumps({"out": str(a.out), "rows": len(spec["rows"]), "cuts": len(edit["cuts"]),
                      "frames": edit["meta"]["frames"], "seconds": edit["meta"]["seconds"],
                      "narration": edit["narration"]["engine"], **edit["meta"].get("speech", {})},
                     ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())
