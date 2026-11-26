"""**配信の文字起こしとチャットの整え方（`python/stream_text.py`）が、字を落とさず・重ねず・時刻を外さないか。**

    python3 python/stream_text_selftest.py

ネットワークも鍵も要らない。小さな json3 / vtt の見本と、こしらえたチャットの行だけで当てる。

## なぜ要るか

`streams/` の文字起こしは、AI が「その配信で何を話したか」を読むための元になる。
ここが黙って崩れると、**読む側には崩れたことが分からない。**

- 流れる字幕の重なりを落とせないと、同じ文が2回並ぶ → 2回言ったことになる
- 落としすぎると、本当に2回言った言葉（「そうそう」）が消える
- 30秒の箱の境目を外すと、チャットと突き合わせたときに時刻がずれる
- 行の頭の `[T]` は30秒の窓の頭で、言った秒ではない。読む側（ショートの区間・brief.py の前後30秒）は
  `[T]` を言った秒として使い、0〜30秒ずれていた。字幕の区切りごとに入れた言った秒の印（`‹h:mm:ss›`）が
  本当の秒か（2026-11-13 の本物の5分を whisper の語の時刻と比べる）・印を外すと前と同じ字か・曲の区間の伏せ（#969）を
  壊さないかを見る。**守りを1つずつ外すと、その足だけが落ちる**ことも、ここで当てる（`check_mark_drill`）
- 曲の区間（`[音楽]` / `♪` のある30秒）を伏せ損ねると、公開リポジトリに歌詞が載る（#969）
- チャットの時刻を「書いた時刻 − 開始」だけで出すと、動画の 0 秒と開始時刻のずれぶん
  まるごとずれる。アーカイブの時刻（`videoOffsetTimeMsec` / `timestampText`）を先に使う

## 対照

`python3 python/mutation_drill.py python/stream_text_selftest.py` が、隣の
`stream_text.py` の比較をひっくり返して赤くなるかを見る。
"""

from __future__ import annotations

import contextlib
import datetime as dt
import io
import json
import statistics
import sys
import tempfile
import unicodedata
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import stream_text as st  # noqa: E402

ok: list[str] = []
ng: list[str] = []


def check(name: str, got, want) -> None:
    if got == want:
        ok.append(name)
        print(f"  ok  {name}")
    else:
        ng.append(f"{name}: 欲しい {want!r} / 出た {got!r}")
        print(f"  NG  {name}\n       欲しい {want!r}\n       出た   {got!r}")


def json3_sample() -> dict:
    """自動字幕の json3 を小さくしたもの。改行だけの aAppend の行も混ぜてある。"""
    def ev(ms, dur, *words):
        return {"tStartMs": ms, "dDurationMs": dur, "wWinId": 1,
                "segs": [{"utf8": w, "tOffsetMs": i * 200} for i, w in enumerate(words)]}
    return {"events": [
        {"tStartMs": 0, "dDurationMs": 999999, "id": 1},           # 窓の定義（segs 無し）
        ev(1200, 4000, "こんにちは", "みなさん"),
        {"tStartMs": 5000, "dDurationMs": 10, "aAppend": 1, "segs": [{"utf8": "\n"}]},
        ev(5200, 4000, "今日は", "アルバニア"),
        ev(29900, 3000, "です"),                                   # 30秒の箱の手前
        ev(30000, 3000, "ピザ", "食べます"),                         # ちょうど次の箱の頭
        ev(95000, 2000, "そうそう"),
        ev(97000, 2000, "そうだね"),                                 # 「そう」は重なりではない
        ev(3725000, 2000, "OK"),
        ev(3726000, 2000, "Google"),                                 # 英字どうしは空白で継ぐ
    ]}


VTT = """WEBVTT

00:00:01.000 --> 00:00:04.000
<c>今日はアルバニアに来ました</c>

00:00:04.000 --> 00:00:07.000
今日はアルバニアに来ました
これから首都を歩きます

00:00:07.000 --> 00:00:10.000
これから首都を歩きます
"""


def check_captions() -> None:
    print("文字起こし（json3）")
    with tempfile.TemporaryDirectory() as d:
        p = Path(d) / "src.ja-orig.json3"
        p.write_text(json.dumps(json3_sample(), ensure_ascii=False), encoding="utf-8")
        bins = st.bin_captions(st.read_captions(p))
    check("30秒ごとに1行（空の箱は作らない）", [t for t, _ in bins], [0, 30, 90, 3720])
    check("箱の頭の行", st.unmark(bins[0][1]), "こんにちはみなさん今日はアルバニアです")
    check("30.0秒ちょうどは次の箱", st.unmark(bins[1][1]), "ピザ食べます")
    check("本当に2回言った「そう」を落とさない", st.unmark(bins[2][1]), "そうそうそうだね")
    check("英字どうしは空白で継ぐ", st.unmark(bins[3][1]), "OK Google")
    check("言った秒の印は字幕の区切りごと・秒は切り捨て（29.9秒は 0:00:29。窓 0:00:00〜の中）", bins[0][1],
          "‹0:00:01›こんにちはみなさん‹0:00:05›今日はアルバニア‹0:00:29›です")
    check("印は継ぎ目の空白のあと・字の前", bins[3][1], "‹1:02:05›OK ‹1:02:06›Google")
    check("印を（秒, 字）に分ける", st.said_at(bins[0][1], 0),
          [(1, "こんにちはみなさん"), (5, "今日はアルバニア"), (29, "です")])
    check("印の無い古い行は丸ごと行の頭の秒", st.said_at("やあどうも", 30), [(30, "やあどうも")])
    check("印の無い字は unmark でそのまま", st.unmark("[0:00:30] 10:30に集合"), "[0:00:30] 10:30に集合")
    check("1時間を越えた時刻", st.hms(bins[3][0]), "1:02:00")

    print("文字起こし（vtt の流れる字幕）")
    with tempfile.TemporaryDirectory() as d:
        p = Path(d) / "src.ja.vtt"
        p.write_text(VTT, encoding="utf-8")
        bins = st.bin_captions(st.read_captions(p))
    check("前の行の繰り返しを落とす", [(t, st.unmark(x)) for t, x in bins], [(0, "今日はアルバニアに来ましたこれから首都を歩きます")])
    check("vtt は cue の頭の秒（重なりを落とした cue も）", bins[0][1], "‹0:00:01›今日はアルバニアに来ました‹0:00:04›これから首都を歩きます")
    rows = [{"start": 6.0, "text": "きょうはいい天気ですね", "words": [{"t": 6.0, "w": "きょうは"}, {"t": 7.0, "w": "いい天気ですね"}]},
            {"start": 10.0, "text": "いい天気ですね本当に",
             "words": [{"t": 10.0, "w": "いい"}, {"t": 10.3, "w": "天気"}, {"t": 10.6, "w": "ですね"}, {"t": 11.5, "w": "本当に"}]}]
    check("重なりを落とした区切りの印は、残った字の頭の語の秒（10.0 ではなく 11.5）", st.bin_captions(rows),
          [(0, "‹0:00:06›きょうはいい天気ですね‹0:00:11›本当に")])
    check("句読点だけの区切りには印を付けない", st.bin_captions([{"start": 3.0, "text": "やあ"}, {"start": 5.0, "text": "。"}]),
          [(0, "‹0:00:03›やあ。")])
    check("重なりの尻だけ落とす", st.strip_overlap("きょうはいい天気ですね", "いい天気ですね本当に"),
          "本当に")
    check("重なりが短ければ落とさない", st.strip_overlap("そうそう", "そうだね"), "そうだね")

    head = {"video_id": "abcdefghijk", "title": "テスト\n配信",
            "start": dt.datetime(2026, 10, 18, 11, 3, tzinfo=dt.timezone.utc),
            "caption_desc": "ja-orig（自動・json3）"}
    body = st.transcript_text(head, [(0, "やあ"), (30, "どうも")]).splitlines()
    check("ヘッダ（題名の改行は詰める・開始は JST・言った秒の印の読みかた）", body[:7],
          ["# テスト 配信", "# https://www.youtube.com/watch?v=abcdefghijk",
           "# 開始: 2026-10-18 20:03 JST", "# 字幕: ja-orig（自動・json3）", "# 行数: 2（30秒ごと）",
           "# 曲の区間（音楽の印のある30秒）は伏せてある", st.MARK_HEADER])
    check("本文", body[8:], ["[0:00:00] やあ", "[0:00:30] どうも"])
    check("ヘッダに印そのもの（‹0:00:00› の形）を書かない", st.MARK_RE.search(st.MARK_HEADER), None)
    check("ファイル名の stem（JST）", st.stem_for("abcdefghijk", head["start"]),
          "2026-10-18_2003_abcdefghijk")
    check("置き場（JST の年/月）",
          st.rel_dir(dt.datetime(2026, 10, 31, 16, 0, tzinfo=dt.timezone.utc)), "2026/11")


def check_music() -> None:
    """曲の区間を伏せる（#969）。歌詞を公開リポジトリに置かないための口なので、
    「伏せ漏れ」と「伏せすぎ」の両方を当てる。字は架空のもの（本物の歌詞を見本に置かない）。"""
    print("曲の区間を伏せる")
    bins = [(0, "[音楽]"),
            (30, "こんばんは[音楽]らららの歌詞みたいな字"),
            (60, "♪ららら♪"),
            (90, "今日はピザを食べます"),
            (120, "おんがくの話をしよう"),          # 「音楽」と言っただけの話は伏せない
            (150, "[歌声]らららの字")]               # 歌っている区間がいちばん歌詞が入りやすい
    got, n = st.mask_music(bins)
    check("[音楽]だけの行・[音楽]＋話の行・♪ の行は [音楽] だけ、印の無い行はそのまま", got,
          [(0, "[音楽]"), (30, "[音楽]"), (60, "[音楽]"), (90, "今日はピザを食べます"),
           (120, "おんがくの話をしよう"), (150, "[音楽]")])
    check("曲の区間の行数", n, 4)
    check("2回かけても同じ", st.mask_music(got), (got, 4))

    head = {"video_id": "abcdefghijk", "title": "t",
            "start": dt.datetime(2026, 10, 18, 11, 3, tzinfo=dt.timezone.utc), "caption_desc": "x"}
    body = st.transcript_text(head, bins)
    check("書き出しにも伏せが効く（mask_music を通し忘れても）",
          [l for l in body.splitlines() if l.startswith("[")],
          ["[0:00:00] [音楽]", "[0:00:30] [音楽]", "[0:01:00] [音楽]",
           "[0:01:30] 今日はピザを食べます", "[0:02:00] おんがくの話をしよう",
           "[0:02:30] [音楽]"])

    # 置いてあるファイルへの後がけ（python/stream_mask_music.py の中身）
    old = "\n".join(["# t", "# 字幕: x", "# 行数: 3（30秒ごと）", "",
                     "[0:00:00] やあ", "[0:00:30] 話と[音楽]と字", "[1:02:00] ♪"]) + "\n"
    new, n = st.mask_transcript(old)
    check("後がけ: ヘッダの1行を # 行数 の下に足し、印の行を伏せる", new.splitlines(),
          ["# t", "# 字幕: x", "# 行数: 3（30秒ごと）", st.MUSIC_HEADER, "",
           "[0:00:00] やあ", "[0:00:30] [音楽]", "[1:02:00] [音楽]"])
    check("後がけ: 行数", n, 2)
    check("後がけ: 2回かけても同じ", st.mask_transcript(new), (new, 2))
    check("ヘッダに印そのものを書かない（grep で数えられるように）",
          st.has_music(st.MUSIC_HEADER), False)

    check("note に足す", st.music_note("ja-orig（自動・json3）", 4), "ja-orig（自動・json3）・曲の区間 4行を伏せた")
    check("note の数は差し替える", st.music_note("ja・曲の区間 4行を伏せた", 5), "ja・曲の区間 5行を伏せた")
    check("0行なら足さない", st.music_note("ja", 0), "ja")


# ---------------------------------------------------------------- 言った秒の印（本物の5分）
#
# 2026-11-13 jnKVIXn4qQs の 1:35:00〜1:40:00（`python/data/stream_text/jnKVIXn4qQs_1h35.json`）。
# 本人の発話だけ（視聴者さんの名前・チャットの字は入れていない）。YouTube の自動字幕と、同じ音声の whisper の語の時刻。
# 字幕の区切りごとに、印のあとの字の頭6字（畳んだ字）を whisper の字の並びから探し（印の秒の前後40秒でいちばん近い所）、
# 秒の差を測る。回まるごと（1,211区切り）で測ると、印は中央値 0.5秒・90%点 2.4秒、行の頭 `[T]` は 14.1秒・26.2秒。
FIXTURE = Path(__file__).resolve().parent / "data/stream_text/jnKVIXn4qQs_1h35.json"
MARK_MED, MARK_P90, MARK_N = 1.0, 7.0, 20   # 印の秒と whisper の差の中央値・90%点の上限と、測れた区切りの数の下限
KEY, NEAR = 6, 40


def fold(s: str) -> str:
    out = []
    for c in unicodedata.normalize("NFKC", s).lower():
        if unicodedata.category(c)[0] in "PSZC" or c == "ー":
            continue
        out.append(chr(ord(c) - 0x60) if "ァ" <= c <= "ヶ" else c)
    return "".join(out)


def fixture() -> dict:
    d = json.loads(FIXTURE.read_text(encoding="utf-8"))
    d["rows"] = [{**r, "words": [{"t": t, "w": w} for t, w in r["words"]]} for r in d["captions"]]
    return d


def gaps(bins: list[tuple[int, str]], whisper: list) -> tuple[list[float], list[float]]:
    """（印の秒と whisper の差, 行の頭の秒と whisper の差）。区切りの字の頭 KEY 字が whisper に見つかったものだけ。"""
    chars, times = [], []
    for t, w in whisper:
        for c in fold(w):
            chars.append(c)
            times.append(t)
    text = "".join(chars)
    mk, hd = [], []
    for head, line in bins:
        for at, piece in st.said_at(line, head):
            key = fold(piece)[:KEY]
            if len(key) < KEY:
                continue
            best, i = None, text.find(key)
            while i >= 0:
                if abs(times[i] - at) <= NEAR and (best is None or abs(times[i] - at) < abs(best - at)):
                    best = times[i]
                i = text.find(key, i + 1)
            if best is not None:
                mk.append(abs(best - at))
                hd.append(abs(best - head))
    return mk, hd


def p90(xs: list[float]) -> float:
    xs = sorted(xs)
    return xs[min(len(xs) - 1, int(0.9 * len(xs)))]


def old_bins(rows: list[dict], width: int = st.BIN_SEC) -> list[tuple[int, str]]:
    """印を入れる前の bin_captions（2026-11-25 まで）。印を外した字がこれと同じかを見る。"""
    bins: dict[int, str] = {}
    prev = ""
    for r in sorted(rows, key=lambda r: r["start"]):
        t = st.strip_overlap(prev, r["text"].strip())
        if not t:
            continue
        prev = (prev + t)[-200:]
        k = int(max(0, r["start"]) // width) * width
        bins[k] = st.join_text(bins.get(k, ""), t)
    return sorted(bins.items())


def leg_seconds() -> list[tuple[str, bool]]:
    mk, hd = gaps(st.bin_captions(fixture()["rows"]), fixture()["whisper"])
    if not mk:
        return [("印の秒を whisper と比べられた区切りがある", False)]
    med, top = statistics.median(mk), p90(mk)
    print(f"       （測れた区切り {len(mk)}。印: 中央値 {med:.1f}秒・90%点 {top:.1f}秒 ／ 行の頭: 中央値 "
          f"{statistics.median(hd):.1f}秒・90%点 {p90(hd):.1f}秒）")
    return [(f"測れた区切りが {MARK_N} 以上（{len(mk)}）", len(mk) >= MARK_N),
            (f"印の秒と whisper の差の中央値が {MARK_MED}秒以下（{med:.1f}）", med <= MARK_MED),
            (f"印の秒と whisper の差の90%点が {MARK_P90}秒以下（{top:.1f}）", top <= MARK_P90)]


def leg_unmark() -> list[tuple[str, bool]]:
    out = []
    with tempfile.TemporaryDirectory() as d:
        p3, pv = Path(d) / "src.ja-orig.json3", Path(d) / "src.ja.vtt"
        p3.write_text(json.dumps(json3_sample(), ensure_ascii=False), encoding="utf-8")
        pv.write_text(VTT, encoding="utf-8")
        for name, rows in (("本物の5分", fixture()["rows"]), ("json3 の見本", st.read_captions(p3)),
                           ("vtt の見本", st.read_captions(pv))):
            got = [(t, st.unmark(x)) for t, x in st.bin_captions(rows)]
            out.append((f"印を外すと、印を入れる前と同じ字（{name}）", got == old_bins(rows)))
    marked = st.bin_captions(fixture()["rows"])
    out.append(("本物の5分の行に印が入っている（区切りの数だけ）",
                sum(len(st.MARK_RE.findall(x)) for _, x in marked) >= len(fixture()["rows"]) * 0.9))
    return out


def leg_music() -> list[tuple[str, bool]]:
    # 印の秒の決めかた（seconds の足）とは別に見るので、印つきの行は手で書く。字は架空のもの
    bins = [(0, "‹0:00:01›こんばんは‹0:00:12›[音楽]‹0:00:20›らららの字"), (30, "‹0:00:31›今日はピザ‹0:00:45›♪ららら♪"),
            (60, "‹0:01:02›おいしい")]
    masked, n = st.mask_music(bins)
    head = {"video_id": "abcdefghijk", "title": "t",
            "start": dt.datetime(2026, 10, 18, 11, 3, tzinfo=dt.timezone.utc), "caption_desc": "x"}
    body = [l for l in st.transcript_text(head, bins).splitlines() if l.startswith("[")]
    old = "\n".join(["# t", "# 行数: 3（30秒ごと）", "", "[0:00:00] ‹0:00:01›やあ‹0:00:12›[音楽]",
                     "[0:00:30] ‹0:00:31›話と‹0:00:40›♪", "[0:01:00] ‹0:01:02›おいしい"]) + "\n"
    after = st.mask_transcript(old)[0].splitlines()
    return [("印の入った行も、音楽の印があれば [音楽] だけ（印ごと伏せる）", masked == [(0, "[音楽]"), (30, "[音楽]"), (60, "‹0:01:02›おいしい")]),
            ("曲の区間の行数は印があっても同じ", n == 2),
            ("書き出しにも伏せが効く", body == ["[0:00:00] [音楽]", "[0:00:30] [音楽]", "[0:01:00] ‹0:01:02›おいしい"]),
            ("置いてある印つきの行への後がけも伏せ、印の無い曲でない行はそのまま",
             after[-3:] == ["[0:00:00] [音楽]", "[0:00:30] [音楽]", "[0:01:00] ‹0:01:02›おいしい"])]


MARK_LEGS = {"seconds": leg_seconds, "unmark": leg_unmark, "music": leg_music}


def check_marks() -> None:
    print("言った秒の印（2026-11-13 の本物の5分）")
    for name, leg in MARK_LEGS.items():
        for what, good in leg():
            check(f"{name}: {what}", good, True)


# 守りを1つずつ外した形。（外すもの, 落ちてほしい足, 何をしたことになるか）
def _floor_head(r, kept):
    return int(r["start"] // st.BIN_SEC) * st.BIN_SEC


def _drop_nothing(text):
    return text


def _no_music(text):
    return False


MARK_CUTS = {
    "head_time": ("head_time", _floor_head, {"seconds"}, "印の秒を行の頭（30秒の窓の頭）にする（前の読みかた）"),
    "unmark": ("unmark", _drop_nothing, {"unmark"}, "印を外さない"),
    "has_music": ("has_music", _no_music, {"music"}, "音楽の印のある30秒を伏せない（#969 の前）"),
}


def check_mark_drill() -> None:
    print("対照: 守りを1つずつ外すと、その足だけが落ちる")
    for cut, (attr, fake, want, why) in MARK_CUTS.items():
        real = getattr(st, attr)
        setattr(st, attr, fake)
        try:
            with contextlib.redirect_stdout(io.StringIO()):
                fell = {name for name, leg in MARK_LEGS.items() if not all(good for _, good in leg())}
        finally:
            setattr(st, attr, real)
        check(f"{cut}（{why}）→ 落ちた足", sorted(fell), sorted(want))


def check_chat() -> None:
    print("チャット")
    start = dt.datetime(2026, 10, 18, 11, 0, 0, tzinfo=dt.timezone.utc)
    at = lambda s: start + dt.timedelta(seconds=s)  # noqa: E731
    check("msec を先に使う", st.chat_offset("65432", "9:99", at(10), start), (65.432, "msec"))
    check("無ければ timestampText", st.chat_offset(None, "1:02:03", at(10), start), (3723.0, "clock"))
    check("配信前は負", st.chat_offset(None, "-0:30", at(10), start), (-30.0, "clock"))
    check("どちらも無ければ 書いた時刻−開始", st.chat_offset(None, None, at(125), start), (125.0, "diff"))
    check("開始が無ければ出さない", st.chat_offset(None, None, at(5), None), (None, "none"))
    check("負の時刻の書き方", st.hms(-30), "-0:00:30")

    msgs = [
        {"event_type": "TEXT", "author_name": "@b", "message_text": "二番目", "clock": "0:45",
         "published_at": at(47)},
        {"event_type": "PAID", "author_name": "@c", "message_text": "応援\nしてます",
         "purchase_amount_text": "¥500", "clock": "1:00", "published_at": at(61)},
        {"event_type": "TEXT", "author_name": "@a", "message_text": "一番目", "clock": None,
         "published_at": at(12)},
        {"event_type": "TEXT", "author_name": "@d", "message_text": "", "clock": "0:50",
         "published_at": at(50)},
        {"event_type": "MEMBERSHIP", "author_name": "@e", "message_text": "ようこそ", "clock": "2:00",
         "published_at": at(120)},
    ]
    lines, src = st.chat_lines(msgs, start)
    check("時刻順・投げ銭は額つき・空の本文は落とす", lines,
          ["[0:00:12] @a: 一番目", "[0:00:45] @b: 二番目", "[0:01:00] ¥500 @c: 応援 してます",
           "[0:02:00] （メンバー）@e: ようこそ"])
    check("時刻の出どころの内訳", src, {"msec": 0, "clock": 4, "diff": 1, "none": 0})


def check_manifest() -> None:
    print("一覧（manifest.tsv）")
    check("未登録は取る", st.wanted(None), True)
    check("字幕 ok は済み", st.wanted({"caption": "ok", "tries": "1"}), False)
    check("取れなかったものは3回まで", [st.wanted({"caption": "error", "tries": str(n)})
                                for n in (0, 2, 3)], [True, True, False])
    with tempfile.TemporaryDirectory() as d:
        p = Path(d) / "manifest.tsv"
        rows = {"old": {"video_id": "old", "start_jst": "2026-01-01 20:00", "caption": "ok"},
                "new": {"video_id": "new", "start_jst": "2026-10-18 20:00", "caption": "none",
                        "note": "ja の\t字幕が無い"}}
        st.write_manifest(p, rows)
        back = st.read_manifest(p)
        text = p.read_text(encoding="utf-8").splitlines()
    check("新しい順に書く", [l.split("\t")[0] for l in text[1:]], ["new", "old"])
    check("列の頭", text[0].split("\t"), st.MANIFEST_COLS)
    check("タブを含む字を詰めて読み戻せる", back["new"]["note"], "ja の 字幕が無い")


def main() -> int:
    check_captions()
    check_music()
    check_marks()
    check_mark_drill()
    check_chat()
    check_manifest()
    print(f"\n対照 {len(ok) + len(ng)}件中 {len(ok)}件通った")
    for line in ng:
        print(f"::error::{line}")
    if not ok:
        print("::error::対照が0件です")
        return 1
    return 1 if ng else 0


if __name__ == "__main__":
    sys.exit(main())
