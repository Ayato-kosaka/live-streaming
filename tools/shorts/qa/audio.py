"""音の検査: 音量（LUFS・トゥルーピーク）／声と BGM の差／無音／音割れ／元音声の漏れ。

声と BGM を分けて測れるのは、書き出しが work に音の束（stem_*.f32）を残しているときだけ。
束が無ければ、仕上がりの音から見当をつける（そのときは合格と言い切らず needs-human に倒す）。
"""
from __future__ import annotations

import math
import re
import subprocess

import numpy as np

from common import (FAIL, HUMAN, NA, PASS, SR, Ctx, envelope_db, mono, narration_windows, near,
                    result, rms_db, runs)

# ---------------------------------------------------------------- 線

# 積分ラウドネス。YouTube は再生のとき、だいたい -14 LUFS より大きいものを下げ、小さいものは
# 上げない（広く測られている振る舞い。この箱から YouTube に届かないので自分では確かめていない）。
# だから -14 より小さく作ると、前後のショートより小さく鳴る。大きく作っても下げられるだけで、
# リミッターで潰したぶん音が痩せる。±1.5 は、人が「同じくらい」と聞く幅（1.5dB 未満の差は
# 聞き比べてやっと分かる程度）。
LUFS_TARGET, LUFS_TOL = -14.0, 1.5
# トゥルーピーク。AAC にすると、波形の山が書き出し前より最大 1dB ほど上に出る。-1 dBTP 以下なら、
# 媒体側でもう一度符号化されても割れない（配信向けの推奨でよく使われる値。EBU R128 s1 も同じ）
TP_MAX = -1.0
# 声と BGM の差（ナレーションの間）。行ごとに見る（1行だけ BGM のサビに埋もれる、を拾うため）。
# 初めは 12dB（様式の設計値 18dB から BGM が 6dB 上がったら落とす）にしていたが、あやとが2回
# 「BGM もう少し大きく」と言った（#926、2026-10-16）。参考のショートの差 13.6dB より、あやとの好み
# （話している間で 10.5dB 前後）を取るので、行ごとの線は 9dB に下げる。9 を切るのは、その好みから
# さらに BGM が 1.5dB 以上上がった行（サビに埋もれた行・指示書の bgm.db の付け間違い）
VOICE_OVER_BGM_MIN_DB = 9.0
# 無音: 声も BGM も鳴っていない間が 1.5 秒を超えたら落とす（あやとの決め）
SILENCE_DBFS = -50.0
SILENCE_MAX_SEC = 1.5
# 音割れ: 0dBFS に張り付いたサンプルが 3 つ続いたら割れ（1つは山の頂点でもありうる）
CLIP_LEVEL = 0.999
CLIP_RUN = 3
# ナレーションの元の音声が割れている（平らな頂点）。自然な声が同じ値の頂点を 4 サンプル
# 続けることは、48kHz ではまず無い
FLAT_RUN = 4
# 元音声: ナレーションより 18dB 以上小さいこと。書き出しは元の音を既定で消し、カットに audio_db を書いたときだけ入れる。
# 配信の声はもともとナレーションより数 dB 小さいので、設計どおりなら 24〜30dB 差になる。
# 18 を切るのは「下げ忘れ（0dB のまま）」か「下げ幅を半分以下にした」とき
SOURCE_BELOW_NARRATION_MIN_DB = 18.0


def ebur128(path) -> dict:
    """ffmpeg の ebur128 で、積分ラウドネス・LRA・トゥルーピークを測る。"""
    err = subprocess.run(["ffmpeg", "-hide_banner", "-nostats", "-i", str(path), "-vn",
                          "-af", "ebur128=peak=true:framelog=quiet", "-f", "null", "-"],
                         capture_output=True, text=True).stderr
    tail = err[err.rfind("Summary:"):] if "Summary:" in err else err
    i = re.search(r"I:\s+(-?[\d.]+|-inf) LUFS", tail)
    lra = re.search(r"LRA:\s+(-?[\d.]+) LU", tail)
    tp = re.search(r"True peak:\s+Peak:\s+(-?[\d.]+|-inf) dBFS", tail)

    def num(mm):
        if not mm:
            return None
        return -math.inf if mm.group(1) == "-inf" else float(mm.group(1))
    return {"integrated_lufs": num(i), "lra_lu": num(lra), "true_peak_dbtp": num(tp)}


def check_loudness(ctx: Ctx) -> dict:
    r = ctx.memo("ebur128", lambda: ebur128(ctx.mp4))
    th = {"integrated_lufs": f"{LUFS_TARGET}±{LUFS_TOL}", "true_peak_dbtp_max": TP_MAX}
    if r["integrated_lufs"] is None or r["true_peak_dbtp"] is None:
        return result("loudness", "音量（LUFS・ピーク）", NA, "ebur128 の結果が読めなかった",
                      measured=r, thresholds=th)
    problems = []
    if abs(r["integrated_lufs"] - LUFS_TARGET) > LUFS_TOL:
        problems.append(f"積分ラウドネス {r['integrated_lufs']} LUFS（{LUFS_TARGET}±{LUFS_TOL}）")
    if r["true_peak_dbtp"] > TP_MAX:
        problems.append(f"トゥルーピーク {r['true_peak_dbtp']} dBTP（{TP_MAX} 以下）")
    return result("loudness", "音量（LUFS・ピーク）", FAIL if problems else PASS,
                  f"{r['integrated_lufs']} LUFS / TP {r['true_peak_dbtp']} dBTP / LRA {r['lra_lu']} LU",
                  measured=r, thresholds=th, problems=problems)


# ---------------------------------------------------------------- 声と BGM

def check_voice_vs_bgm(ctx: Ctx) -> dict:
    title = "声と BGM の差"
    th = {"min_db_each_line": VOICE_OVER_BGM_MIN_DB}
    plan = ctx.plan
    if not plan or not plan.get("narration"):
        return result("voice_vs_bgm", title, NA, "時間割（plan.json）にナレーションが無い", thresholds=th)
    spf = int(round(SR / plan["fps"]))
    ok, why = ctx.stems_usable()
    if ok:
        st, fit = ctx.stems(), ctx.stem_fit()
        narr = mono(st["narration"]) * fit["gain_narration"]
        bgm = mono(st["bgm"]) * fit["gain_bgm"]
        rows, worst = [], None
        for i, ln in enumerate(plan["narration"]):
            s, e = ln["at"] * spf, (ln["at"] + ln["frames"]) * spf
            n_db, b_db = rms_db(narr[s:e]), rms_db(bgm[s:e])
            d = round(n_db - b_db, 2)
            rows.append({"line": i, "at": ln["at"], "narration_dbfs": round(n_db, 2),
                         "bgm_dbfs": round(b_db, 2), "margin_db": d})
            worst = d if worst is None else min(worst, d)
        inside = narration_windows(plan, len(narr), spf)
        m = {"method": "stems", "narration_dbfs": round(rms_db(narr[inside]), 2),
             "bgm_during_narration_dbfs": round(rms_db(bgm[inside]), 2),
             "bgm_without_narration_dbfs": round(rms_db(bgm[~near(inside, SR // 2)]), 2),
             "worst_line_margin_db": worst, "gains_in_mix": {"narration": round(fit["gain_narration"], 3),
                                                             "bgm": round(fit["gain_bgm"], 3)},
             "lines": rows}
        bad = [r_ for r_ in rows if r_["margin_db"] < VOICE_OVER_BGM_MIN_DB]
        problems = [f"{r_['line']}行目（{r_['at']}コマ目〜）: 声 {r_['narration_dbfs']} / BGM {r_['bgm_dbfs']} dBFS、"
                    f"差 {r_['margin_db']}dB" for r_ in bad]
        # 話している間ぜんぶでの差（声の間をつないで測る。あやとの好みの 10.5dB 前後と比べる値）
        m["overall_margin_db"] = round(m["narration_dbfs"] - m["bgm_during_narration_dbfs"], 2)
        return result("voice_vs_bgm", title, FAIL if bad else PASS,
                      f"話している間 {m['overall_margin_db']}dB・いちばん小さい行 {worst}dB（{len(rows)}行）",
                      measured=m, thresholds=th, problems=problems)

    # 束が無い: 仕上がりの音の、ナレーションの間の 50ms ごとの音量から見当をつける。
    # 声の切れ目（息継ぎ・語の間）には BGM と元音声だけが残るので、下から 10% の音量は
    # 「BGM ＋ 元音声」より小さくはならない。だから 声 − 下10% は本当の差より小さく出る
    # （片側の見積もり）。これが線を越えていれば合格と言えるが、越えなければ分からない。
    mix = mono(ctx.mix)
    inside = narration_windows(plan, len(mix), spf)
    seg = mix[inside]
    env = envelope_db(seg, SR // 20)
    if len(env) < 10:
        return result("voice_vs_bgm", title, NA, f"ナレーションの間が短すぎて測れない（{why}）", thresholds=th)
    speech, floor = rms_db(seg), float(np.percentile(env, 10))
    est = round(speech - floor, 2)
    m = {"method": "mix_estimate", "why_no_stems": why, "speech_dbfs": round(speech, 2),
         "floor_p10_dbfs": round(floor, 2), "margin_lower_bound_db": est}
    if est >= VOICE_OVER_BGM_MIN_DB:
        return result("voice_vs_bgm", title, PASS, f"見積もりで {est}dB 以上（束が無いので下限の見積もり）",
                      measured=m, thresholds=th)
    return result("voice_vs_bgm", title, HUMAN,
                  f"見積もりの下限 {est}dB（束が無く、線 {VOICE_OVER_BGM_MIN_DB}dB を越えているか言い切れない。耳で聞く）",
                  measured=m, thresholds=th, problems=[why])


# ---------------------------------------------------------------- 無音

def check_silence(ctx: Ctx) -> dict:
    title = "無音"
    th = {"silent_below_dbfs": SILENCE_DBFS, "max_sec": SILENCE_MAX_SEC, "window_ms": 50}
    win = SR // 20
    mix = mono(ctx.mix)
    env_mix = envelope_db(mix, win)
    long_mix = [(a * 0.05, b * 0.05) for a, b in runs(env_mix < SILENCE_DBFS) if (b - a) * 0.05 > SILENCE_MAX_SEC]
    m = {"longest_silent_mix_sec": round(max([(b - a) * 0.05 for a, b in runs(env_mix < SILENCE_DBFS)] or [0]), 2)}
    problems = [f"仕上がりの音が {a:.2f}〜{b:.2f} 秒（{b - a:.2f} 秒）ほぼ無音" for a, b in long_mix]
    ok, why = ctx.stems_usable()
    if ok:
        # 「声も BGM も無い」を束で測る（元音声だけが小さく鳴っている間も、ここでは無音に数える）
        st, fit = ctx.stems(), ctx.stem_fit()
        vb = mono(st["narration"]) * fit["gain_narration"] + mono(st["bgm"]) * fit["gain_bgm"]
        env = envelope_db(vb, win)
        rr = runs(env < SILENCE_DBFS)
        m["longest_no_voice_no_bgm_sec"] = round(max([(b - a) * 0.05 for a, b in rr] or [0]), 2)
        m["method"] = "stems+mix"
        problems += [f"声も BGM も無い間が {a * 0.05:.2f}〜{b * 0.05:.2f} 秒（{(b - a) * 0.05:.2f} 秒）"
                     for a, b in rr if (b - a) * 0.05 > SILENCE_MAX_SEC]
    else:
        m["method"] = "mix"
        m["why_no_stems"] = why
    return result("silence", title, FAIL if problems else PASS,
                  f"いちばん長い無音 {max(m.get('longest_no_voice_no_bgm_sec', 0), m['longest_silent_mix_sec'])} 秒",
                  measured=m, thresholds=th, problems=problems)


# ---------------------------------------------------------------- 音割れ

def flat_runs(x: np.ndarray, min_len: int) -> int:
    """|x| が区間の最大値に張り付いて、同じ値が min_len サンプル以上続く所の数（割れた頂点）。"""
    if len(x) == 0:
        return 0
    peak = float(np.max(np.abs(x)))
    if peak < 1e-4:
        return 0
    hot = np.abs(x) >= 0.999 * peak
    same = np.concatenate([[False], np.abs(np.diff(x)) <= 1e-6 * peak])
    return sum(1 for a, b in runs(hot & same) if (b - a) + 1 >= min_len)


def check_clipping(ctx: Ctx) -> dict:
    title = "音割れ"
    th = {"full_scale": CLIP_LEVEL, "run_samples": CLIP_RUN, "narration_flat_top_samples": FLAT_RUN}
    mix = ctx.mix
    problems, m = [], {}
    n_full = int(np.sum(np.abs(mix) >= CLIP_LEVEL))
    clip_runs = sum(1 for ch in range(mix.shape[1])
                    for a, b in runs(np.abs(mix[:, ch]) >= CLIP_LEVEL) if b - a >= CLIP_RUN)
    m["mix_samples_at_full_scale"] = n_full
    m["mix_clipped_runs"] = clip_runs
    m["mix_peak_dbfs"] = round(20 * math.log10(max(float(np.max(np.abs(mix))), 1e-9)), 2)
    if clip_runs:
        problems.append(f"仕上がりの音が 0dBFS に張り付いた所が {clip_runs} か所")
    st = ctx.stems()
    if st is not None and ctx.plan:
        spf = int(round(SR / ctx.plan["fps"]))
        narr = st["narration"][:, 0]
        per = []
        for i, ln in enumerate(ctx.plan.get("narration", [])):
            k = flat_runs(narr[ln["at"] * spf:(ln["at"] + ln["frames"]) * spf], FLAT_RUN)
            per.append(k)
            if k:
                problems.append(f"ナレーション {i}行目の音声が割れている（平らな頂点 {k} か所。元の音声ファイルを見る）")
        m["narration_flat_tops_per_line"] = per
    else:
        m["narration_flat_tops_per_line"] = None
        m["note"] = "束が無いので、ナレーションの元の割れは見ていない（仕上がりの張り付きだけ）"
    return result("clipping", title, FAIL if problems else PASS,
                  f"0dBFS の張り付き {clip_runs} か所 / ピーク {m['mix_peak_dbfs']} dBFS"
                  + (f" / 声の平らな頂点 {sum(m['narration_flat_tops_per_line'])}"
                     if m["narration_flat_tops_per_line"] is not None else ""),
                  measured=m, thresholds=th, problems=problems)


# ---------------------------------------------------------------- 元音声の漏れ

def check_original_audio(ctx: Ctx) -> dict:
    title = "元音声の漏れ"
    th = {"source_below_narration_min_db": SOURCE_BELOW_NARRATION_MIN_DB}
    plan = ctx.plan
    ok, why = ctx.stems_usable()
    if not ok or not plan or not plan.get("narration"):
        return result("original_audio", title, NA,
                      f"確かめられない: {why or 'ナレーションが無い'}（元音声の大きさは束と比べないと分からない）",
                      thresholds=th)
    st, fit = ctx.stems(), ctx.stem_fit()
    spf = int(round(SR / plan["fps"]))
    narr = mono(st["narration"]) * fit["gain_narration"]
    inside = narration_windows(plan, len(narr), spf)
    n_db = rms_db(narr[inside])
    m = {"narration_dbfs": round(n_db, 2), "lag_samples": fit["lag"], "corr": fit["corr"],
         "gains": {"narration": round(fit["gain_narration"], 3), "bgm": round(fit["gain_bgm"], 3)}}
    if "source" in st and fit.get("gain_source") is not None:
        # 書き出しが元音声の束を残している: そのまま測る（いちばん確か）。
        # 仕上がりに混ざっている量は、最小二乗の係数で直す（束より大きく混ぜていれば、そのぶん大きい）
        src = mono(st["source"]) * max(fit["gain_source"], 0.0)
        s_db = rms_db(src)
        m.update({"method": "stem_source", "source_dbfs": round(s_db, 2),
                  "source_during_narration_dbfs": round(rms_db(src[inside]), 2),
                  "gain_source": round(fit["gain_source"], 3)})
    else:
        # 元音声の束が無い: 仕上がり − (a·声 + b·BGM) の残りを、ナレーションから 0.5 秒以上
        # 離れた所で測る。声の間はリミッターと AAC の誤差が声の -20dB ほど残る（例の指示書で
        # 実測 -37dBFS）ので使えない。声の無い所の誤差は -63dBFS ほどで、元音声がよく見える
        res = fit["resid"]
        off = fit["offset"]
        ins = inside[off:off + len(res)]
        far = ~near(ins, SR // 2)
        far[-SR:] = False  # 最後の1秒（BGM のフェードとリミッターの戻り）は除く
        sec = float(np.sum(far)) / SR
        m.update({"method": "residual", "far_from_narration_sec": round(sec, 2),
                  "residual_during_narration_dbfs": round(rms_db(res[ins]), 2)})
        if sec < 1.0:
            return result("original_audio", title, HUMAN,
                          f"ナレーションの無い間が {sec:.1f} 秒しかなく、残りで測れない（耳で聞く）",
                          measured=m, thresholds=th,
                          problems=["元音声の束（stem_source.f32）があれば測れる"])
        s_db = rms_db(res[far])
        m["source_dbfs"] = round(s_db, 2)
    margin = round(n_db - s_db, 2)
    m["narration_minus_source_db"] = margin
    status = PASS if margin >= SOURCE_BELOW_NARRATION_MIN_DB else FAIL
    problems = [] if status == PASS else [
        f"元音声がナレーションより {margin}dB 小さいだけ（{SOURCE_BELOW_NARRATION_MIN_DB}dB 以上下げること）"]
    return result("original_audio", title, status,
                  f"元音声 {m['source_dbfs']} dBFS（ナレーションより {margin}dB 小さい・{m['method']}）",
                  measured=m, thresholds=th, problems=problems)
