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

Studio では **動画 → アナリティクス → エンゲージメント**のカードに出る。
`creator/list_creator_videos` の mask には**入っていない**（あれは一覧の列で、
高評価もリアクションも持たない）。アナリティクス側の口から取る。

## 口の名前を決め打ちにしない

アナリティクスの youtubei は、Studio の版で名前も形も変わる。
だから**先に `capture()` で拾って、返事の中からリアクションらしい数を探す。**
見つからなければ**数を出さずに、拾った候補を並べて 2 で帰る。**

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

# リアクションらしい値の見分け方。**日本語の画面と、英語の鍵の両方を見る。**
# Studio の言語はプロファイル次第で変わるので、片方だけだと取りこぼす。
WORDS = re.compile(r"リアクション|reaction", re.I)

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


def _numbers_near(obj, found: list, path: str = "") -> None:
    """JSON を歩いて、**リアクションらしい言葉の近くにある数**を集める。

    Args:
        obj: 返事（辞書・配列・値）
        found: 見つけたものを足していく先（`{"path", "n", "why"}`）
        path: いまいる場所
    """
    if isinstance(obj, dict):
        hit = any(WORDS.search(str(k)) for k in obj) or WORDS.search(json.dumps(
            {k: v for k, v in obj.items() if isinstance(v, str)}, ensure_ascii=False))
        if hit:
            for k, v in obj.items():
                n = _as_int(v)
                if n is not None and n > 0:
                    found.append({"path": f"{path}.{k}", "n": n, "why": "リアクションの近く"})
        for k, v in obj.items():
            _numbers_near(v, found, f"{path}.{k}")
    elif isinstance(obj, list):
        for i, v in enumerate(obj[:200]):
            _numbers_near(v, found, f"{path}[{i}]")


def _as_int(v):
    """数として読めれば int、読めなければ None。"""
    if isinstance(v, bool):
        return None
    if isinstance(v, int):
        return v
    if isinstance(v, str) and v.isdigit():
        return int(v)
    return None


def reactions(t, video_id: str) -> dict:
    """1本ぶんのリアクション数。

    **決め打ちの口を叩かない。** アナリティクスのエンゲージメントを開いて、
    そのとき飛んだ youtubei をぜんぶ拾い、リアクションらしい数を探す。

    Args:
        t: `studio()` で開いたタブ
        video_id: 動画 id

    Returns:
        `{"id", "n", "how", "candidates"}`。
        決められなければ `n` は None で、`candidates` に拾ったものが入る
    """
    url = url_of(f"video/{video_id}/analytics/tab-engagement/period-default")
    got = capture(t, url=url, wait=14)
    found = []
    for r in got:
        try:
            body = r.get("body")
            _numbers_near(json.loads(body) if isinstance(body, str) else body, found,
                          r.get("url", "")[-48:])
        except (TypeError, ValueError):
            continue
    # 画面の字からも読む。カードに「ライブのリアクション 84,893」と出ている
    txt = t.js("document.body.innerText") or ""
    m = re.search(r"(?:ライブの)?リアクション[^\d]{0,24}([\d,]{3,})", txt)
    if m:
        n = int(m.group(1).replace(",", ""))
        return {"id": video_id, "n": n, "how": "画面の字", "candidates": found[:20]}
    # 口の返事だけで決まるのは、候補がちょうど1つに絞れたときだけ
    uniq = sorted({f["n"] for f in found})
    if len(uniq) == 1:
        return {"id": video_id, "n": uniq[0], "how": found[0]["path"], "candidates": found[:20]}
    return {"id": video_id, "n": None, "how": "決められない", "candidates": found[:20]}


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
