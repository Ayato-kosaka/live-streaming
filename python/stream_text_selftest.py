"""**配信の文字起こしとチャットの整え方（`python/stream_text.py`）が、字を落とさず・重ねず・時刻を外さないか。**

    python3 python/stream_text_selftest.py

ネットワークも鍵も要らない。小さな json3 / vtt の見本と、こしらえたチャットの行だけで当てる。

## なぜ要るか

`streams/` の文字起こしは、AI が「その配信で何を話したか」を読むための元になる。
ここが黙って崩れると、**読む側には崩れたことが分からない。**

- 流れる字幕の重なりを落とせないと、同じ文が2回並ぶ → 2回言ったことになる
- 落としすぎると、本当に2回言った言葉（「そうそう」）が消える
- 30秒の箱の境目を外すと、チャットと突き合わせたときに時刻がずれる
- チャットの時刻を「書いた時刻 − 開始」だけで出すと、動画の 0 秒と開始時刻のずれぶん
  まるごとずれる。アーカイブの時刻（`videoOffsetTimeMsec` / `timestampText`）を先に使う

## 対照

`python3 python/mutation_drill.py python/stream_text_selftest.py` が、隣の
`stream_text.py` の比較をひっくり返して赤くなるかを見る。
"""

from __future__ import annotations

import datetime as dt
import json
import sys
import tempfile
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
    check("箱の頭の行", bins[0][1], "こんにちはみなさん今日はアルバニアです")
    check("30.0秒ちょうどは次の箱", bins[1][1], "ピザ食べます")
    check("本当に2回言った「そう」を落とさない", bins[2][1], "そうそうそうだね")
    check("英字どうしは空白で継ぐ", bins[3][1], "OK Google")
    check("1時間を越えた時刻", st.hms(bins[3][0]), "1:02:00")

    print("文字起こし（vtt の流れる字幕）")
    with tempfile.TemporaryDirectory() as d:
        p = Path(d) / "src.ja.vtt"
        p.write_text(VTT, encoding="utf-8")
        bins = st.bin_captions(st.read_captions(p))
    check("前の行の繰り返しを落とす", bins, [(0, "今日はアルバニアに来ましたこれから首都を歩きます")])
    check("重なりの尻だけ落とす", st.strip_overlap("きょうはいい天気ですね", "いい天気ですね本当に"),
          "本当に")
    check("重なりが短ければ落とさない", st.strip_overlap("そうそう", "そうだね"), "そうだね")

    head = {"video_id": "abcdefghijk", "title": "テスト\n配信",
            "start": dt.datetime(2026, 10, 18, 11, 3, tzinfo=dt.timezone.utc),
            "caption_desc": "ja-orig（自動・json3）"}
    body = st.transcript_text(head, [(0, "やあ"), (30, "どうも")]).splitlines()
    check("ヘッダ（題名の改行は詰める・開始は JST）", body[:5],
          ["# テスト 配信", "# https://www.youtube.com/watch?v=abcdefghijk",
           "# 開始: 2026-10-18 20:03 JST", "# 字幕: ja-orig（自動・json3）", "# 行数: 2（30秒ごと）"])
    check("本文", body[6:], ["[0:00:00] やあ", "[0:00:30] どうも"])
    check("ファイル名の stem（JST）", st.stem_for("abcdefghijk", head["start"]),
          "2026-10-18_2003_abcdefghijk")
    check("置き場（JST の年/月）",
          st.rel_dir(dt.datetime(2026, 10, 31, 16, 0, tzinfo=dt.timezone.utc)), "2026/11")


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
