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
                       resolve_claim_ui)

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
    # 権利者と分け合っている（MONETIZING_WITH_REVSHARE）ものも、申し立てを消して全額に戻す（#757 Q2）
    if active:
        if s["id"] in hold:
            return "hold", hold[s["id"]]
        # 対応は「曲を消去する」（声は残す）。区間を全部ミュートはしない（#757、あやと 2026-10-12）
        # 曲を消したあと、申し立ての付け直しが終わるまでは「再処理中」で選べない。待てば片づく
        if any("BEING_REPROCESSED" in c["erase_ok"] for c in active):
            return "editing", "申し立てを再処理中（曲の消去のあと）"
        ok = [c for c in active if "ERASE_SONG" in c["options"] and c["erase_ok"] == "ELIGIBLE"]
        if ok:
            return "erase", ok[0]["claim"]
        # 曲の消去が選べない申し立て（一致した箇所が多すぎる・作曲への申し立て）は、区間をミュートする（#757 Q4: A）
        mu = [c for c in active if "ERASE_SONG" in c["options"] and c["mute_ok"] == "ELIGIBLE"]
        if mu:
            return "mute", mu[0]["claim"]
        return "manual", "曲の消去でもミュートでも対応できない申し立て: " + ", ".join(c["type"] + "/" + c["title"] for c in active)
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

    # 前回の台帳を下敷きにして1本ずつ上書きし、毎回書き出す。途中で落ちても、
    # 見ていない動画は前回のまま残り、同じコマンドをもう一度流せば続きから進む
    log, videos = [], dict(led.get("videos", {}))
    newest = led.get("checked_through", {})

    def save():
        out = {"checked_through": newest, "last_run": today(), "hold": hold,
               "videos": dict(sorted(videos.items(), key=lambda kv: kv[1]["start"], reverse=True))}
        json.dump(out, open(dst, "w"), ensure_ascii=False, indent=1)
        json.dump(log, open(dst + ".log.json", "w"), ensure_ascii=False, indent=1)

    for v in seen:
        s = summarize(v)
        prev = led.get("videos", {}).get(s["id"], {})
        row = {"title": s["title"][:60], "start": jst(s["start"]), "state": "error",
               "claims_left": prev.get("claims_left", 0), "history": prev.get("history", [])}
        try:
            active = []
            if s["causes"] or s["m10n"] not in ("MONETIZING",):
                active = [claim_summary(c) for c in claims(t, s["id"])]
                active = [c for c in active if c["status"] == "ACTIVE"]
            state, why = classify(s, active, hold)
            row.update(state=state, claims_left=len(active))
            if state in ("erase", "mute"):
                c = next(c for c in active if c["claim"] == why)
                why = f"{c['title']} / {', '.join(c['artists'])}"
                if dry:
                    row["state"] = "to-" + state
                else:
                    resolve_claim_ui(t, s["id"], c["title"], state)
                    row["state"] = "editing"
                    row["history"].append({"date": today(), "claim": c["claim"], "song": why, "action": state})
                    time.sleep(2)
        except Exception as ex:
            row["state"], why = "error", f"{type(ex).__name__}: {str(ex)[:180]}"
            # ログインが切れると、以後は全部落ちる。台帳を書いて止める（#768）
            # （Studio が 401 を返すか、ログイン画面に飛ばされて ytcfg が無くなる）
            if "HTTP 401" in str(ex) or "ytcfg is not defined" in str(ex) or "REAUTH" in str(ex):
                row["why"] = why
                videos[s["id"]] = row
                save()
                sys.exit("ログインが切れたか、本人確認を求められた。あやとに EC2 の Chrome で通してもらう（#768）")
            # 画面が返らなくなったタブは、そのあと何を投げても返らない（2026-10-12 に1本の
            # タイムアウトから残り全部が落ちた）。タブを作り直して次へ進む
            for _ in range(3):
                try:
                    t = studio(url_of("videos/live"))
                    break
                except Exception:
                    time.sleep(20)
        row["why"] = why
        # EC2 の上で切り離して流すので、1本ずつ書き出して進み具合を外から読めるようにする
        with open(dst + ".progress", "a") as f:
            f.write(json.dumps({"id": s["id"], "state": row["state"], "why": why[:120]}, ensure_ascii=False) + "\n")
        log.append(dict(id=s["id"], **{k: row[k] for k in ("start", "state", "claims_left", "why")}, title=s["title"][:30]))
        if row["state"] in ("done", "skip"):
            videos.pop(s["id"], None)
        else:
            videos[s["id"]] = row
        if s["stage"] == "PAST" and s["start"] > newest.get("start", 0):
            newest = {"start": s["start"], "jst": jst(s["start"]), "id": s["id"]}
        save()

    from collections import Counter
    print(len(seen), "videos;", dict(Counter(x["state"] for x in log)))


if __name__ == "__main__":
    main()
