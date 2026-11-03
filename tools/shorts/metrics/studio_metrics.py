#!/usr/bin/env python3
"""公開したショートの数字を、YouTube Studio の裏の youtubei から**読むだけ**で取る（EC2 の上で動く）。

手元の入口は同じ置き場の `shorts_metrics.py`（台帳を読み、これを EC2 に置いて回し、EC2 の JSON に貯め、
Actions に BigQuery へ入れてもらう）。EC2 では `/home/ubuntu/cdp/studio_metrics.py` に置かれ、
`yt_studio.py` の `api()` で次の2つだけを送る。
ほかの口は `READ_ONLY` で断る（Studio に書き込む要求を、この道具からは1本も出さない）。

- `creator/get_creator_videos` … 公開の状態と公開時刻（予約中・非公開・消したものはここで外す）
- `yta_web/get_cards` … 指標

    cd /home/ubuntu/cdp && python3 studio_metrics.py --ids Do04EoViYdU,rVGC150Y3hA --out /home/ubuntu/shorts-metrics/x.json

## 時点の値は「公開から N 日で区切った期間」で聞く

Studio の分析の期間の選びにある「最初の 24 時間」を押すと、`timePeriod` に
`{"unit": "TIME_PERIOD_UNIT_NTH_DAYS", "count": 1}` が足された（2026-11-02 に画面を押して写した）。
count を 3・7・14 にすると 72時間・7日・14日になる。#921 の98本の取り方（公開からの1時間刻みの累積）と、
再生・エンゲージビュー・高評価が4時点とも1つ残らず一致した（3本で確かめた）。
累積の系列から読むのと違って、継続率・平均視聴時間・コメント・共有・登録者の増減も
その期間で切って返る。区切りは公開時刻からなので、遅れて取っても同じ値が出る。

**まだ過ぎていない時点は聞かない。** 区切りの終わりが今より先だと、Studio は今までの分を黙って返す
（公開9時間の本に count=14 を送ると、全期間と同じ値が返った）。聞けば「14日の値」として入ってしまう。

## 維持率カーブだけは期間で切れない

`audienceRetentionHighlightsCardConfig` は、期間を変えても同じカーブ（公開以降の全期間）を返した。
画面もこのカードに期間を渡していない。なので 3→8秒の残りは時点の行には入れず、
「取った時点の全期間」の行（checkpoint = lifetime）にだけ入れる。時点の行では理由つきで欠ける。
"""
import argparse, json, math, os, sys, time

TOOL_VERSION = "studio_metrics 1"

# 時点の名前と、公開からの時間。名前は BigQuery の行の鍵になるので変えない
CHECKPOINTS = (("24h", 24), ("72h", 72), ("7d", 168), ("14d", 336))
# Studio は直近2日ぶんを「処理中」としてあとから直す（#911 の98本で ANALYTICS_ANOMALY_TYPE_DAILY_DATA_PROCESSING
# の札が付いていた）。締切から48時間たつまでは、取った値を仮として扱い、次に回したときに取り直す
SETTLE_H = 48

# Studio の指標の名前 → 列の名前と、Studio の値を列の単位に直す係数。
# 名前は #911 で1つずつ当てて通ったもの（間違えると要求ぜんぶが 400 になる）
METRICS = {
    "EXTERNAL_VIEWS": ("views", 1),
    "ENGAGED_VIEWS": ("engaged_views", 1),
    "SHORTS_FEED_IMPRESSIONS_VTR": ("stayed_to_watch_pct", 1),   # 視聴を継続した割合（スワイプ = 100 − これ）
    "AVERAGE_WATCH_TIME": ("avg_view_duration_s", 1 / 1000),      # ミリ秒
    "AVERAGE_WATCH_PERCENTAGE": ("avg_view_pct", 1),              # 繰り返し込み。物差しにはしない（playbook）
    "EXTERNAL_WATCH_TIME": ("watch_time_h", 1 / 3600000),         # ミリ秒
    "SHORTS_FEED_IMPRESSIONS": ("shorts_feed_impressions", 1),
    "RATINGS_LIKES": ("likes", 1),
    "COMMENTS": ("comments", 1),
    # 2026-11-03 に19本・69行を取ったら、これだけ全行 0 だった（エンゲージビューが中央値の6倍の本でも）。
    # 名前は通る（400 にならない）が、Studio の「共有」を指していない疑いがある。画面の値と突き合わせるまで物差しにしない
    "SHARINGS": ("shares", 1),
    "SUBSCRIBERS_GAINED": ("subs_gained", 1),
    "SUBSCRIBERS_LOST": ("subs_lost", 1),
    "SUBSCRIBERS_NET_CHANGE": ("subs_net", 1),
}
RETENTION_COLS = ("ret_norm_3s", "ret_norm_8s", "keep_3to8_pct")

READ_ONLY = frozenset({"creator/get_creator_videos", "yta_web/get_cards"})

VIDEO_MASK = {"videoId": True, "privacy": True, "lengthSeconds": True, "videoDurationMs": True,
              "timePublishedSeconds": True, "contentType": True, "status": True,
              "scheduledPublishingDetails": {"all": True}}


def due(pub_s, now_s):
    """もう過ぎた時点だけを返す。公開から h 時間たった瞬間から聞いてよい"""
    return [(label, h) for label, h in CHECKPOINTS if pub_s + h * 3600 <= now_s]


def provisional(pub_s, hours, fetched_s):
    """締切から SETTLE_H 時間たつ前に取った値は仮（あとで Studio が直すかもしれない）"""
    return fetched_s < pub_s + (hours + SETTLE_H) * 3600


def classify(v):
    """get_creator_videos の1本 → ("public", 公開時刻の秒) か ("skip", 理由)"""
    if not v:
        return "skip", "Studio の一覧に無い"
    status = v.get("status") or ""
    if status.endswith("DELETED"):
        return "skip", "消してある（差し替えなどで消した）"
    privacy = (v.get("privacy") or "").replace("VIDEO_PRIVACY_", "")
    pub = int(v.get("timePublishedSeconds") or 0)
    if privacy == "PUBLIC" and pub > 0:
        return "public", pub
    sched = [s for s in ((v.get("scheduledPublishingDetails") or {}).get("scheduledPublishings") or [])
             if "PUBLIC" in (s.get("action") or "")]
    if sched:
        at = int(sched[0].get("scheduledTimeSeconds") or 0)
        return "skip", "予約中（公開 " + time.strftime("%Y-%m-%dT%H:%MZ", time.gmtime(at)) + "）"
    return "skip", {"PRIVATE": "非公開", "UNLISTED": "限定公開"}.get(privacy, f"公開していない（{privacy or '不明'}）")


def cards_body(vid, count=None, retention=False):
    """count=None なら公開以降の全期間、count=N なら公開から N×24時間で区切った期間"""
    card = lambda m: {"autoUpdateInterval": "ANALYTICS_AUTO_UPDATE_INTERVAL_NEVER",
                      "keyMetricCardConfig": {"timePeriod": {}, "metricTabConfigs": [{"metric": m}]},
                      "failureMode": "ANALYTICS_CARD_FAILURE_MODE_HIDE"}
    cfgs = [card(m) for m in METRICS]
    if retention:
        cfgs.append({"autoUpdateInterval": "ANALYTICS_AUTO_UPDATE_INTERVAL_NEVER",
                     "audienceRetentionHighlightsCardConfig": {}, "failureMode": "ANALYTICS_CARD_FAILURE_MODE_HIDE"})
    tp = {"referencePoint": "TIME_PERIOD_REFERENCE_POINT_SINCE_PUBLISH",
          "timePeriodType": "ANALYTICS_TIME_PERIOD_TYPE_SINCE_PUBLISH", "entity": {"videoId": vid}}
    if count is not None:
        tp = dict({"unit": "TIME_PERIOD_UNIT_NTH_DAYS", "count": int(count)}, **tp)
    return {"screenConfig": {"entity": {"videoId": vid}, "timePeriod": tp, "currency": "JPY", "timeZoneOffsetSecs": 0},
            "cardConfigs": cfgs, "fetchingType": "FETCHING_TYPE_FOREGROUND"}


def parse_totals(resp):
    """get_cards の返事 → ({指標: 合計}, {指標: 系列の刻み})。返事に無い指標は入れない（0 で埋めない）"""
    totals, units = {}, {}
    for c in (resp or {}).get("cards", []):
        for tb in (c.get("keyMetricCardData") or {}).get("keyMetricTabs", []):
            pc = tb.get("primaryContent") or {}
            m = pc.get("metric")
            if m in METRICS and pc.get("total") is not None:
                totals[m] = pc["total"]
                ms = pc.get("mainSeries") or {}
                units[m] = (ms.get("timeUnit") or "").replace("TIME_PERIOD_UNIT_", "")
    return totals, units


def parse_curve(resp, vid):
    """維持率カーブ（100点）。まだ出ていなければ None"""
    for c in (resp or {}).get("cards", []):
        for vd in (c.get("audienceRetentionHighlightsCardData") or {}).get("videosData", []):
            if vd.get("videoId") == vid and vd.get("retentionValues"):
                return [float(x) for x in vd["retentionValues"]]
    return None


def curve_at(curve, dur_s, t):
    """t 秒の維持率。カーブの i 番目（0から）は尺の (i+1)% の点（Analytics の elapsedVideoTimeRatio と同じ 0.01〜1.00）。
    点のあいだは直線でつなぐ"""
    pos = t / dur_s * 100 - 1
    if pos <= 0:
        return curve[0]
    i = int(math.floor(pos))
    if i + 1 >= len(curve):
        return curve[-1]
    f = pos - i
    return curve[i] * (1 - f) + curve[i + 1] * f


def retention_summary(curve, dur_s):
    """→ ({列: 値}, 欠けの理由 or None)。
    頭（カーブの最初の点）を100に直したときの 3秒・8秒の値と、3秒にいた人のうち8秒まで残った割合"""
    if not curve:
        return {}, "維持率カーブがまだ出ていない"
    if not dur_s or dur_s < 8:
        return {}, "尺が8秒より短い"
    head, v3, v8 = curve[0], curve_at(curve, dur_s, 3), curve_at(curve, dur_s, 8)
    if head <= 0 or v3 <= 0:
        return {}, "維持率カーブの頭が0"
    return {"ret_norm_3s": round(100 * v3 / head, 2), "ret_norm_8s": round(100 * v8 / head, 2),
            "keep_3to8_pct": round(100 * v8 / v3, 2)}, None


def guarded(api_fn):
    """読む口だけを通す。書き込みの口を誤って足しても、ここで止まる"""
    def call(endpoint, body):
        if endpoint not in READ_ONLY:
            raise PermissionError(f"読むだけの道具から {endpoint} は送らない")
        return api_fn(endpoint, body)
    return call


def collect(api_fn, ids, now_s=None, sleep=1.0, skip=()):
    """ids の動画について、公開済みなら過ぎた時点ぶんと全期間を取る。戻り値はそのまま JSON にできる dict。

    skip は (動画ID, 時点) の集まり。もう確定した時点（締切から48時間たってから取った値）は Studio が
    直さないので聞き直さない。Studio へ送る要求を減らすため（同じログインを何度も叩くと切れやすい。ec2-chrome 4）"""
    call = guarded(api_fn)
    skip = set(skip)
    now_s = int(now_s if now_s is not None else time.time())
    ids = list(dict.fromkeys(i for i in ids if i))
    got = call("creator/get_creator_videos", {"videoIds": ids, "mask": VIDEO_MASK}).get("videos", [])
    by_id = {v.get("videoId"): v for v in got}
    out = {"tool": TOOL_VERSION, "fetched_at": now_s, "videos": []}
    for vid in ids:
        v = by_id.get(vid)
        kind, val = classify(v)
        row = {"video_id": vid, "status": kind}
        if kind == "skip":
            row["reason"] = val
            out["videos"].append(row)
            continue
        dur_ms = int((v or {}).get("videoDurationMs") or 0)
        row.update(published=val, duration_s=round(dur_ms / 1000, 2) if dur_ms else None, points=[], kept=[])
        for label, hours in due(val, now_s):
            if (vid, label) in skip:
                row["kept"].append(label)
                continue
            p = {"checkpoint": label, "hours": hours}
            try:
                p["totals"], p["units"] = parse_totals(call("yta_web/get_cards", cards_body(vid, hours // 24)))
            except Exception as e:  # 1時点の失敗で、ほかの時点と動画を止めない。行は仮で入り、次に回したとき取り直す
                if "401" in str(e) or "accounts.google.com" in str(e):
                    raise
                p["error"] = str(e)[:200]
            row["points"].append(p)
            time.sleep(sleep)
        life = {}
        try:
            r = call("yta_web/get_cards", cards_body(vid, None, retention=True))
            life["totals"], life["units"] = parse_totals(r)
            life["curve"] = parse_curve(r, vid)
        except Exception as e:
            if "401" in str(e) or "accounts.google.com" in str(e):
                raise
            life["error"] = str(e)[:200]
        row["lifetime"] = life
        out["videos"].append(row)
        time.sleep(sleep)
    return out


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--ids", required=True, help="動画 ID をカンマで")
    ap.add_argument("--out", required=True)
    a = ap.parse_args(argv)
    sys.path.insert(0, "/home/ubuntu/cdp")
    from yt_studio import api, studio, url_of
    t = studio(url_of("videos/short"), wait=6)
    if "accounts.google.com" in t.url():
        print('RESULT {"ok": false, "error": "login_redirect"}')
        return 3
    try:
        res = collect(lambda ep, body: api(t, ep, body), a.ids.split(","))
    except Exception as e:
        print("RESULT " + json.dumps({"ok": False, "error": str(e)[:300]}, ensure_ascii=False))
        return 4
    os.makedirs(os.path.dirname(os.path.abspath(a.out)), exist_ok=True)
    with open(a.out, "w") as f:
        json.dump(res, f, ensure_ascii=False)
    n_pub = sum(1 for v in res["videos"] if v["status"] == "public")
    n_pts = sum(len(v.get("points", [])) for v in res["videos"])
    # 標準出力には数字そのものを出さない（SSM の出力は手元の画面に流れる）。件数だけ
    print("RESULT " + json.dumps({"ok": True, "out": a.out, "videos": len(res["videos"]), "public": n_pub,
                                  "points": n_pts}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())
