"""月末配信アーカイブの**リアクション数（タップタップ）**を Studio から読む。

**EC2 の `/home/ubuntu/cdp/` に置いて、あちらで走らせる。**
手元から回すのは `tools/youtube_taps.py`。

    cd /home/ubuntu/cdp && timeout 280 python3 - <<'PY'
    import sys; sys.path.insert(0, "/home/ubuntu/cdp")
    from yt_taps import taps_for_day, dump
    print(dump(taps_for_day("2026-09-26"), "/home/ubuntu/shots/taps.json"))
    PY

## リアクションは「高評価」ではない

あやと「その月の月末配信アーカイブのリアクション数」（2026-10-13、#809）。
渡された9ヶ月ぶんは 42,885〜168,062 で、**登録1,100人のチャンネルの高評価では
ありえない桁。** これはライブ中に視聴者が連打する**ライブのリアクション**で、
配信では「タップタップ」と呼んでいる。

Studio では **動画 → アナリティクス → 概要**（`tab-overview`）の、
**ライブ配信のカード**に出る。画面の字は

    ライブ配信中 / 1,010 / チャット メッセージ / 84,893 / リアクション / 0:00

の順で、**数がラベルの前**にある。**エンゲージメント（`tab-engagement`）には出ない。**
最初はそちらを開いていて、一度も数が取れなかった（#847）。
`creator/list_creator_videos` の mask にも**入っていない**（あれは一覧の列で、
高評価もリアクションも持たない）。

## 2つの道で読んで、食い違ったら出さない

1. **画面の字**: 行に割って、「数の行 → 次の行が `リアクション`」を拾う
2. **口の返事**: 概要を開いたときに飛ぶ `yta_web/get_cards` が
   `topLiveReactionsCardData.topReactions[{numberOfReactions, reactionType}]`
   を持っている（種類ごとの内訳）。これを足す

**両方取れて食い違ったら、数を出さない。** 内訳が「上位いくつか」だけで
全部の種類を持っていないかもしれないし、画面の読み違いかもしれない。
どちらが正しいかをこちらで決めずに、両方の値を `how` に並べて 2 で帰る。
片方しか取れなければその片方を使い、どちらで取ったかを `how` に書く。

**当てずっぽうの数を台帳へ入れない。** 台帳はそのまま島の面に出るので、
間違った数が「その月の記録」として何年も残る。

## 分割されていたら合算

あやとの決め（#809）。月末配信は夜から朝まで続くことがあって、
途中で切れると2本3本になる。**同じ配信日のライブを全部足す。**
配信日の境目は 6:00 JST（`docs/island-money.md` 5章）。
"""

import json
import re
import sys
import time

sys.path.insert(0, "/home/ubuntu/cdp")

from yt_studio import LIVE_FILTER, api, capture, dump, list_videos, studio, url_of  # noqa: E402

# 画面でリアクション数の**次の行**に来るラベル。
# Studio の言語はプロファイル次第で変わるので、英語の画面も受ける
LABELS = {"リアクション", "ライブのリアクション", "Reactions", "Live reactions"}
NUM = re.compile(r"^[\d,]+$")

# 1日ぶんのライブを探すときに、一覧をどこまで遡るか。
# 月末配信は月に1回なので、50本もあれば1年半ぶん届く
SCAN = 400


def jst_day(epoch_sec: int) -> str:
    """UNIX 秒を**配信日**（JST、6時が境目）にする。

    Args:
        epoch_sec: 配信の開始時刻（UTC の秒）

    Returns:
        `2026-09-26`
    """
    # JST は UTC+9。そこから6時間引くと、0〜6時の枠が前日へ落ちる
    return time.strftime("%Y-%m-%d", time.gmtime(epoch_sec + 9 * 3600 - 6 * 3600))


def videos_on(t, day: str) -> list:
    """その配信日のライブを、新しい順に全部。

    Args:
        t: `studio()` で開いたタブ
        day: 配信日（JST）

    Returns:
        `{"id", "title", "start"}` の並び
    """
    out = []
    for v in list_videos(t, LIVE_FILTER, limit=SCAN):
        ls = v.get("livestream", {})
        st = int(ls.get("actualStartTimeSeconds") or ls.get("scheduledStartTimeSeconds") or 0)
        if not st:
            continue
        d = jst_day(st)
        if d == day:
            out.append({"id": v["videoId"], "title": v.get("title", ""), "start": st})
        elif d < day:
            # 一覧は新しい順。目当ての日より古くなったら、もう出てこない
            break
    return out


def _from_screen(txt: str) -> list:
    """画面の字から、`リアクション` の直前の行にある数を全部拾う。

    **行で見る。** 字を1本につなげて正規表現で探すと、ラベルの後ろの
    別の数（配信の長さの `0:00` や次のカードの数）を拾う。

    Args:
        txt: `document.body.innerText`

    Returns:
        見つけた数の並び（重複はそのまま）
    """
    lines = [x.strip() for x in txt.splitlines() if x.strip()]
    return [int(lines[i - 1].replace(",", "")) for i in range(1, len(lines))
            if lines[i] in LABELS and NUM.match(lines[i - 1])]


def _cards(obj, out: list) -> None:
    """返事を歩いて、`topLiveReactionsCardData` を全部集める。"""
    if isinstance(obj, dict):
        if isinstance(obj.get("topLiveReactionsCardData"), dict):
            out.append(obj["topLiveReactionsCardData"])
        for v in obj.values():
            _cards(v, out)
    elif isinstance(obj, list):
        for v in obj:
            _cards(v, out)


def _from_api(got: list) -> tuple:
    """口の返事から、リアクションの内訳を足した数。

    Args:
        got: `capture()` の返り（返事は `resp`）

    Returns:
        `(合計の並び, 内訳)`。合計はカード1枚につき1つ。内訳は最初のカードの
        `[(種類, 数)]`
    """
    found = []
    for r in got:
        _cards(r.get("resp"), found)
    sums, parts = [], []
    for c in found:
        top = c.get("topReactions") or []
        try:
            kinds = [(x.get("reactionType", "?"), int(x["numberOfReactions"])) for x in top]
        except (KeyError, TypeError, ValueError):
            continue
        if kinds:
            sums.append(sum(n for _, n in kinds))
            parts = parts or kinds
    return sums, parts


def _one(vals: list):
    """同じ道で複数取れたときは、全部同じ値のときだけ採る。"""
    return vals[0] if vals and len(set(vals)) == 1 else None


def reactions(t, video_id: str) -> dict:
    """1本ぶんのリアクション数。

    概要タブを開いて、**画面の字**と**口の返事の内訳の合計**の両方で読む。

    Args:
        t: `studio()` で開いたタブ
        video_id: 動画 id

    Returns:
        `{"id", "n", "how", "screen", "api", "kinds"}`。
        決められなければ `n` は None で、`how` に理由と両方の値が入る
    """
    url = url_of(f"video/{video_id}/analytics/tab-overview/period-default")
    got = capture(t, url=url, wait=14)
    screen = _from_screen(t.js("document.body.innerText") or "")
    sums, kinds = _from_api(got)
    a, b = _one(screen), _one(sums)
    base = {"id": video_id, "screen": screen, "api": sums, "kinds": kinds}
    if a is not None and b is not None:
        if a == b:
            return dict(base, n=a, how="画面の字と内訳の合計が一致")
        return dict(base, n=None, how=f"食い違い: 画面の字 {a} / 内訳の合計 {b}")
    if a is not None:
        return dict(base, n=a, how="画面の字（内訳は取れず: %s）" % (sums or "無し"))
    if b is not None:
        return dict(base, n=b, how="内訳の合計（画面の字は取れず: %s）" % (screen or "無し"))
    return dict(base, n=None, how=f"決められない: 画面の字 {screen or '無し'} / 内訳の合計 {sums or '無し'}")


def taps_for_day(day: str) -> dict:
    """その配信日のライブを全部足して、タップ数を出す。

    Args:
        day: 月末配信の日（JST、`2026-09-26`）

    Returns:
        `{"day", "taps", "parts": [...], "ok": bool}`
    """
    t = studio(url_of("videos/live"))
    vids = videos_on(t, day)
    parts = [dict(v, **reactions(t, v["id"])) for v in vids]
    ok = bool(parts) and all(p["n"] is not None for p in parts)
    return {
        "day": day,
        # **分割されていたら合算**（あやと 2026-10-13、#809）
        "taps": sum(p["n"] for p in parts) if ok else None,
        "parts": parts,
        "ok": ok,
    }


if __name__ == "__main__":
    out = taps_for_day(sys.argv[1])
    dump(out, sys.argv[2] if len(sys.argv) > 2 else "/home/ubuntu/shots/taps.json")
    print(json.dumps({k: v for k, v in out.items() if k != "parts"}, ensure_ascii=False))
    sys.exit(0 if out["ok"] else 2)
