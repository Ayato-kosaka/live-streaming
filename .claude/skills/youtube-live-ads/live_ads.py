#!/usr/bin/env python3
"""EC2 の上で動く。ライブアーカイブの申し立てに対応し、収益化を戻す見回りを1回ぶん回す。

    python3 /home/ubuntu/cdp/live_ads.py <台帳.json> <書き出し.json> [--dry] [--all]

台帳（リポジトリの `.claude/skills/youtube-live-ads/ledger.json`）を読み、
1. 前回見た最新の配信より新しいもの（と、その前 LOOKBACK 日ぶん）を一覧から拾う
2. 台帳で「対応中」「保留」の動画を id で取り直す
3. 1本ずつ、いまの状態で振り分ける（SKILL.md の表）
4. 台帳を書き出す。手元に持ち帰ってコミットするのは呼んだ側

--dry は何も送らず、振り分けだけを出す。--all は前回の続きではなく全件を見る。
"""
import json, sys, time, datetime
sys.path.insert(0, "/home/ubuntu/cdp")
from yt_studio import (studio, url_of, list_videos, get_videos, summarize, claims, claim_summary,
                       mute_claim)

# 申し立ては配信が終わってから数日おくれて付くことがある。前回の続きだけを見ると、
# 見たあとに付いた申し立てを取りこぼすので、少しさかのぼって見直す
LOOKBACK = 14 * 86400
JST = datetime.timezone(datetime.timedelta(hours=9))


def jst(sec):
    return datetime.datetime.fromtimestamp(sec, JST).strftime("%Y-%m-%d %H:%M")


def today():
    return datetime.datetime.now(JST).strftime("%Y-%m-%d")


def classify(s, active, hold):
    """いまの状態から、することを1つ決める。戻り値は (状態, 理由)"""
    if s["stage"] != "PAST":
        return "skip", "配信がまだ終わっていない"
    if s["edit"] == "VIDEO_PROCESSING_STATUS_PROCESSING":
        return "editing", "動画編集が進行中"
    if s["m10n"] == "MONETIZING":
        return "done", ""
    if s["m10n"] == "MONETIZING_WITH_REVSHARE":
        return "hold", hold.get(s["id"], "収益を権利者と分け合っている")
    if active:
        if s["id"] in hold:
            return "hold", hold[s["id"]]
        ok = [c for c in active if "ERASE_SONG" in c["options"] and c["mute_ok"] == "ELIGIBLE"]
        if not ok:
            return "manual", "ミュートで対応できない申し立て: " + ", ".join(c["type"] + "/" + c["title"] for c in active)
        return "mute", ok[0]["claim"]
    if s["m10n"] == "NOT_MONETIZING_OFF":
        return "enable", "申し立てが無いのに収益化がオフ"
    return "manual", f"申し立て以外の理由で収益化されていない: {s['m10n']}"


def main():
    src, dst = sys.argv[1], sys.argv[2]
    dry, full = "--dry" in sys.argv, "--all" in sys.argv
    led = json.load(open(src))
    hold = led.get("hold", {})
    since = 0 if full else led.get("checked_through", {}).get("start", 0)
    t = studio(url_of("videos/live"))

    floor = since - LOOKBACK if since else 0
    seen = list_videos(t, stop=lambda v: floor and int(v.get("livestream", {}).get("actualStartTimeSeconds") or 0) <= floor)
    known = {v["videoId"] for v in seen}
    again = [i for i in led.get("videos", {}) if i not in known]
    seen += get_videos(t, again)

    log, videos = [], {}
    newest = led.get("checked_through", {})
    for v in seen:
        s = summarize(v)
        active = []
        if s["causes"] or s["m10n"] not in ("MONETIZING",):
            active = [claim_summary(c) for c in claims(t, s["id"])]
            active = [c for c in active if c["status"] == "ACTIVE"]
        state, why = classify(s, active, hold)
        prev = led.get("videos", {}).get(s["id"], {})
        row = {"title": s["title"][:60], "start": jst(s["start"]), "state": state,
               "claims_left": len(active), "history": prev.get("history", [])}
        if state == "mute":
            c = next(c for c in active if c["claim"] == why)
            if dry:
                row["state"], why = "to-mute", f"{c['title']} / {', '.join(c['artists'])}"
            else:
                try:
                    segs = mute_claim(t, s["id"], c["claim"])
                    row["state"] = "editing"
                    why = f"{c['title']} / {', '.join(c['artists'])}"
                    row["history"].append({"date": today(), "claim": c["claim"], "song": why, "action": "mute",
                                           "segments": [[int(x["startMillis"]) // 1000, int(x["endMillis"]) // 1000] for x in segs]})
                    time.sleep(2)
                except Exception as ex:
                    row["state"], why = "error", str(ex)[:200]
        row["why"] = why
        log.append(dict(id=s["id"], **{k: row[k] for k in ("start", "state", "claims_left", "why")}, title=s["title"][:30]))
        if row["state"] not in ("done", "skip"):
            videos[s["id"]] = row
        if s["stage"] == "PAST" and s["start"] > newest.get("start", 0):
            newest = {"start": s["start"], "jst": jst(s["start"]), "id": s["id"]}

    out = {"checked_through": newest, "last_run": today(), "hold": hold,
           "videos": dict(sorted(videos.items(), key=lambda kv: kv[1]["start"], reverse=True))}
    json.dump(out, open(dst, "w"), ensure_ascii=False, indent=1)
    json.dump(log, open(dst + ".log.json", "w"), ensure_ascii=False, indent=1)
    from collections import Counter
    print(len(seen), "videos;", dict(Counter(x["state"] for x in log)))


if __name__ == "__main__":
    main()
