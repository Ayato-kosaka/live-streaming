"""選ぶ（docs/card-import.md 4章の 1〜4 と 6）。

台帳（SQLite）に溜まった数だけから、毎回いちから選び直す。**同じ台帳・同じ設定なら
同じ結果**になるよう、並びは全部 sha で決着を付けてある（途中で止めて再開しても同じ）。

1枚ずつの行き先は、上から順に最初に当たったもの（manifest の `counts` の欄）:

| 行き先 | 何で決まるか |
| --- | --- |
| `notImage` | 動画・読めない形式 |
| `exactDup` | 同じ sha が先に出ていた（同じ写真がアルバムのフォルダにも入っている） |
| `broken` | 解けない |
| `outOfRange` | 期間の外・日付が無い |
| `irrelevant` | スクショ・書類・レシート・画面（CLIP の和が `irrelevant.drop` 以上、または名前がスクショ） |
| `lowQuality` | 小さすぎる・ひどいブレ・暗すぎる・白飛び |
| `nearDup` | 似た写真の束で、いちばん良い1枚ではなかった |
| `alreadyCard` | 束が、すでにカードになっている写真と近い |
| `pool` | 残ったもの。ここから日ごとに配る（`selected` `calib`） |

`scanned` = 上の全部の和。見張りはこの和も当てている。
"""

from __future__ import annotations

import json
import math
import time
from collections import defaultdict
from datetime import date, timedelta

from . import guards
from .embed import JA, cos
from .measure import hamming
from .store import keep_path, unpack_vec

STAGES = ["notImage", "exactDup", "broken", "outOfRange", "lowQuality", "irrelevant",
          "nearDup", "alreadyCard"]


# ---------------------------------------------------------------- 1枚の点

def irrelevant_prob(p, cfg) -> float:
    if p["shotname"]:
        return 1.0
    probs = json.loads(p["probs"] or "{}")
    return sum(probs.get(k, 0.0) for k in cfg["irrelevant"]["categories"])


def category(p, cfg) -> str:
    probs = json.loads(p["probs"] or "{}")
    bad = set(cfg["irrelevant"]["categories"])
    if irrelevant_prob(p, cfg) >= cfg["irrelevant"]["drop"]:
        pool = probs
    else:
        pool = {k: v for k, v in probs.items() if k not in bad}
    return max(sorted(pool), key=lambda k: pool[k]) if pool else "daily"


def parts(p, cfg) -> dict:
    q = cfg["quality"]
    lo, hi = math.log(q["blurHard"]), math.log(q["blurGood"])
    sharp = min(1.0, max(0.0, (math.log(max(p["blur"], 1e-6)) - lo) / (hi - lo)))
    expo = 1.0
    if p["dark"] < q["darkSoft"]:
        expo -= 0.6 * (q["darkSoft"] - p["dark"]) / (q["darkSoft"] - q["darkHard"])
    if p["clip"] > q["clipSoft"]:
        expo -= 0.6 * (p["clip"] - q["clipSoft"]) / (q["clipHard"] - q["clipSoft"])
    expo = max(0.0, expo)
    rel = 1.0 - min(1.0, irrelevant_prob(p, cfg))
    w = cfg["score"]
    score = (w["sharp"] * sharp + w["exposure"] * expo + w["aesthetic"] * (p["aesth"] or 0.0)
             + w["relevant"] * rel)
    return {"sharp": sharp, "expo": expo, "rel": rel, "score": score}


def hard_reason(p, cfg, rng: tuple[str, str]) -> str | None:
    """機械で落とす（4章の1）。重複の判定はここではしない（台帳の並びが要るので）。"""
    if p["status"] == "broken":
        return "broken"
    if guards.on("range"):
        if not p["day"] or not (rng[0] <= p["day"] <= rng[1]):
            return "outOfRange"
    # 無関係を先に見る。スマホの画面は白地なので、後にすると「白飛び」に数えてしまう
    # （EC2 の実地で、画面風の PNG が lowQuality に落ちた）
    if guards.on("irrelevant") and irrelevant_prob(p, cfg) >= cfg["irrelevant"]["drop"]:
        return "irrelevant"
    # カメラ（EXIF の機種）の無い絵は、撮った写真ではない。本物の取り込み（2026-11-15）で、
    # 迷う側に出た81枚のうちカメラ無しは67枚、そのうち残すべき写真は4枚だけで、
    # 残りは配信の画面・アプリの画面・地図・AI で描いた絵だった。CLIP は「人の顔が
    # 大きく写った配信の画面」を写真と見分けられない。送ってもらった本物の写真も
    # 少し落ちるが、網羅は求めない（docs 4章）。
    if guards.on("irrelevant") and cfg["irrelevant"].get("requireCamera") and not p["camera"]:
        return "irrelevant"
    q = cfg["quality"]
    if guards.on("quality"):
        if min(p["w0"], p["h0"]) < cfg["read"]["minSide"]:
            return "lowQuality"
        if p["blur"] < q["blurHard"] or p["dark"] < q["darkHard"] or p["clip"] > q["clipHard"]:
            return "lowQuality"
    return None


# ---------------------------------------------------------------- 束ねる

def _near(a, b, ph: int, cl: float) -> bool:
    if a["phash"] and b["phash"] and hamming(a["phash"], b["phash"]) <= ph:
        return True
    return a["vec"] is not None and b["vec"] is not None and cos(a["vec"], b["vec"]) >= cl


def _load(db, root, cfg, rng):
    """台帳の並び（occ）を頭から読み、1件ずつ行き先を決める。束ねる前まで。"""
    photos = {r["sha"]: dict(r) for r in db.execute("SELECT * FROM photos")}
    for p in photos.values():
        p["vec"] = unpack_vec(p["vec"])
        p["has_keep"] = bool(p["keep"]) and keep_path(root, p["sha"]).exists()
        if p["status"] != "broken":
            p.update(parts(p, cfg))
    stage: dict[int, str] = {}
    alive: list[dict] = []
    seen: set[str] = set()
    for o in db.execute("SELECT seq, sha, what FROM occ ORDER BY seq"):
        if o["what"] != "image" or o["sha"] not in photos:
            stage[o["seq"]] = "notImage"
            continue
        if o["sha"] in seen and guards.on("exactDup"):
            stage[o["seq"]] = "exactDup"
            continue
        seen.add(o["sha"])
        p = photos[o["sha"]]
        why = hard_reason(p, cfg, rng)
        if why:
            stage[o["seq"]] = why
            continue
        stage[o["seq"]] = "alive"
        alive.append({**p, "seq": o["seq"]})
    return photos, stage, alive


def group(db, root, cfg, rng):
    """似た写真の束（4章の2）と、既存のカード（4章の3）。

    束は同じ日の中だけで作る。点の高い順に、すでにある束の頭（いちばん点の高い1枚）と
    比べて近ければ入れる。頭とだけ比べるのは、A〜B〜C と少しずつずれて、構図の違う
    写真まで1つの束に連なるのを止めるため（「構図や中身が違えば、同じ場所でも残す」）。
    残すのは束の中で点のいちばん高い、手元に絵のある1枚。
    """
    photos, stage, alive = _load(db, root, cfg, rng)
    g = cfg["group"]
    byday: dict[str, list[dict]] = defaultdict(list)
    for p in alive:
        byday[p["day"] or ""].append(p)
    groups: list[list[dict]] = []
    for day in sorted(byday):
        heads: list[list[dict]] = []
        for p in sorted(byday[day], key=lambda x: (-x["score"], x["sha"], x["seq"])):
            for grp in heads:
                if guards.on("group") and _near(grp[0], p, g["phash"], g["clip"]):
                    grp.append(p)
                    break
            else:
                heads.append([p])
        groups += heads
    existing = _existing(db)
    e = cfg["existing"]
    survivors: list[dict] = []
    for grp in groups:
        # 束の代表は、手元に絵のある中でいちばん点の高い1枚。絵が1枚も無い束
        # （既存のカードに近いので scan のあとの prune が消した）は、頭が代表
        keepers = [p for p in grp if p["has_keep"]]
        best = keepers[0] if keepers else grp[0]
        for p in grp:
            if p is not best:
                stage[p["seq"]] = "nearDup"
        if guards.on("existing") and any(_matches_existing(p, existing, e) for p in grp):
            stage[best["seq"]] = "alreadyCard"
            continue
        if not best["has_keep"]:
            # 絵が無いのは prune で束に負けたものだけ。代表になれないので束の数に入れる
            stage[best["seq"]] = "nearDup"
            continue
        stage[best["seq"]] = "pool"
        survivors.append(best)
    return photos, stage, survivors


def _existing(db) -> dict:
    out: dict = {"all": [], "byday": defaultdict(list)}
    for r in db.execute("SELECT day, phash, vec FROM existing"):
        x = {"day": r["day"], "phash": r["phash"], "vec": unpack_vec(r["vec"])}
        out["all"].append(x)
        out["byday"][r["day"]].append(x)
    return out


def _matches_existing(p, ex, e) -> bool:
    for x in ex["all"]:
        if p["phash"] and x["phash"] and hamming(p["phash"], x["phash"]) <= e["phash"]:
            return True
    # CLIP は前後3日だけ（カードの日は写真の日なので、ふつうは同じ日に居る）
    if p["day"] and p["vec"] is not None:
        d0 = date.fromisoformat(p["day"])
        for k in range(-3, 4):
            for x in ex["byday"].get((d0 + timedelta(days=k)).isoformat(), []):
                if x["vec"] is not None and cos(p["vec"], x["vec"]) >= e["clip"]:
                    return True
    return False


def prune(db, root, cfg, rng) -> int:
    """束で負けた写真と既存のカードに近い写真の、手元の絵を消す（ディスクが小さいので）。

    台帳の数と埋め込みは残す。消すのは `keep/` の webp だけ。
    """
    photos, stage, survivors = group(db, root, cfg, rng)
    alive = {p["sha"] for p in survivors}
    n = 0
    for o in db.execute("SELECT seq, sha FROM occ WHERE what='image'").fetchall():
        if stage.get(o["seq"]) in ("nearDup", "alreadyCard"):
            p = photos.get(o["sha"])
            if p and p["has_keep"] and p["sha"] not in alive:
                keep_path(root, p["sha"]).unlink(missing_ok=True)
                db.execute("UPDATE photos SET keep=0 WHERE sha=?", (p["sha"],))
                p["has_keep"] = False
                n += 1
    db.commit()
    return n


# ---------------------------------------------------------------- 認識合わせの答え

def _label_adjust(pool: list[dict], db, photos, cfg) -> dict[str, float]:
    """答えのある写真に CLIP が近いものを、答えの側へ寄せる（4章の6。単純な k 近傍）。"""
    if not guards.on("labels"):
        return {}
    c = cfg["calib"]
    labeled = []
    for r in db.execute("SELECT sha, answer FROM labels"):
        p = photos.get(r["sha"])
        if p is not None and p["vec"] is not None:
            labeled.append((p["vec"], 1.0 if r["answer"] == "yes" else -1.0, r["sha"]))
    adj: dict[str, float] = {}
    if not labeled:
        return adj
    for p in pool:
        if p["vec"] is None:
            continue
        near = sorted(((cos(p["vec"], v), s, sha) for v, s, sha in labeled if sha != p["sha"]),
                      reverse=True)
        near = [x for x in near[: c["k"]] if x[0] >= c["sim"]]
        if near:
            adj[p["sha"]] = c["gain"] * sum(w * s for w, s, _ in near) / sum(w for w, _, _ in near)
    return adj


# ---------------------------------------------------------------- 日ごとに配る

def _meters(a, b) -> float | None:
    if None in (a.get("lat"), a.get("lng"), b.get("lat"), b.get("lng")):
        return None
    la1, la2 = math.radians(a["lat"]), math.radians(b["lat"])
    dla, dlo = la2 - la1, math.radians(b["lng"] - a["lng"])
    h = math.sin(dla / 2) ** 2 + math.cos(la1) * math.cos(la2) * math.sin(dlo / 2) ** 2
    return 2 * 6371000 * math.asin(math.sqrt(h))


def quota(good: int, any_eligible: bool, cfg) -> int:
    d = cfg["day"]
    if good <= 0:
        return d["min"] if any_eligible else 0
    return min(d["max"], d["min"] + int(d["sqrtGain"] * math.sqrt(good)))


def _penalty(p, chosen, cfg) -> float:
    if not guards.on("diversity") or not chosen:
        return 0.0
    dv = cfg["diversity"]
    pen = 0.0
    if p["vec"] is not None:
        sims = [cos(p["vec"], s["vec"]) for s in chosen if s["vec"] is not None]
        if sims:
            pen += dv["similar"] * max(0.0, max(sims) - dv["similarFrom"]) / (1 - dv["similarFrom"])
    pen += dv["sameCategory"] * sum(1 for s in chosen if s["cat"] == p["cat"])
    if any((m := _meters(p, s)) is not None and m <= dv["nearMeters"] for s in chosen):
        pen += dv["samePlace"]
    return pen


def _pick_day(items: list[dict], cfg) -> list[dict]:
    d = cfg["day"]
    forced = sorted((p for p in items if p["force"] == "keep"), key=lambda p: p["sha"])
    elig = [p for p in items if p["force"] is None and p["final"] >= d["floor"]]
    good = sum(1 for p in items if p["force"] != "drop" and p["final"] >= d["good"])
    q = quota(good, bool(elig or forced), cfg) if guards.on("quota") else len(elig) + len(forced)
    chosen = list(forced)
    rest = sorted(elig, key=lambda p: p["sha"])
    while len(chosen) < q and rest:
        best = max(rest, key=lambda p: (p["final"] - _penalty(p, chosen, cfg), p["sha"]))
        rest.remove(best)
        chosen.append(best)
    for p in chosen:
        p["day_good"], p["day_quota"] = good, q
    return chosen


def _loose_groups(chosen: list[dict], cfg) -> None:
    """一覧で並べて比べる束（manifest の `group`）。同じ日の、見た目の近いもの同士。"""
    th = cfg["group"]["looseClip"]
    n = 0
    byday: dict[str, list[dict]] = defaultdict(list)
    for p in chosen:
        byday[p["day"]].append(p)
    for day in sorted(byday):
        heads: list[dict] = []
        for p in sorted(byday[day], key=lambda x: (x["taken"] or "", x["sha"])):
            for h in heads:
                if p["vec"] is not None and h["vec"] is not None and cos(p["vec"], h["vec"]) >= th:
                    p["group"] = h["group"]
                    break
            else:
                n += 1
                p["group"] = f"g{n:04d}"
                heads.append(p)


def _reasons(p, cfg) -> list[str]:
    out = [JA.get(p["cat"], p["cat"])]
    if p["sharp"] >= 0.8:
        out.append("くっきり")
    if p["expo"] < 0.7:
        out.append("暗め・白飛び気味")
    if p.get("adj"):
        out.append("答えに寄せた" + ("（上げ）" if p["adj"] > 0 else "（下げ）"))
    if p["force"] == "keep":
        out.append("一覧で残すと決めた")
    out.append(f"その日の良い写真 {p['day_good']}枚から")
    if p["ambiguous"]:
        out.append("迷う: " + p["amb_why"])
    return out


def _calib(pool: list[dict], chosen: set[str], cfg, labeled: set[str]) -> list[dict]:
    """認識合わせの24枚。採りそう・迷う・落としそうを同じ数ずつ、日がばらけるように。"""
    n = cfg["calib"]["count"]
    m, good = cfg["ambiguous"]["margin"], cfg["day"]["good"]
    cand = [p for p in pool if p["sha"] not in labeled and p["force"] is None]
    yes = sorted((p for p in cand if p["sha"] in chosen and not p["ambiguous"]),
                 key=lambda p: (-p["final"], p["sha"]))
    mid = sorted((p for p in cand if abs(p["final"] - good) < 2 * m),
                 key=lambda p: (abs(p["final"] - good), p["sha"]))
    no = sorted((p for p in cand if p["sha"] not in chosen), key=lambda p: (p["final"], p["sha"]))
    out: list[dict] = []
    used: set[str] = set()

    def take(bucket, k):
        days: set[str] = set()
        got = 0
        for rnd in (0, 1):   # 1周目は日が重ならないように、2周目は重なってもよい
            for p in bucket:
                if got >= k:
                    return
                if p["sha"] in used or (rnd == 0 and p["day"] in days):
                    continue
                used.add(p["sha"])
                days.add(p["day"])
                out.append(p)
                got += 1

    each = n // 3
    take(yes, each)
    take(mid, each)
    take(no, n - 2 * each)
    for bucket in (mid, yes, no):   # 足りない箱のぶんを、ほかの箱から
        take(bucket, n - len(out))
    return out[:n]


def select(db, root, cfg, batch: str, rng: tuple[str, str], calib: bool | None = None) -> dict:
    """選んで `picks` と `runs` に書き、manifest の形（寸法を除く）を返す。"""
    # 日付の無い写真は、別の zip に入っていた横の JSON から引き直す
    from .scan import refresh_dates
    refresh_dates(db)

    photos, stage, pool = group(db, root, cfg, rng)
    adj = _label_adjust(pool, db, photos, cfg)
    labels = {r["sha"]: r["answer"] for r in db.execute("SELECT sha, answer FROM labels")}
    decisions = {r["sha"]: r["decision"] for r in db.execute("SELECT sha, decision FROM decisions")}
    for p in pool:
        p["adj"] = adj.get(p["sha"], 0.0)
        p["final"] = p["score"] + p["adj"]
        p["cat"] = category(p, cfg)
        ans = labels.get(p["sha"]) if guards.on("labels") else None
        dec = decisions.get(p["sha"])
        p["force"] = ("keep" if (dec == "keep" or (dec is None and ans == "yes")) else
                      "drop" if (dec == "drop" or (dec is None and ans in ("no", "excluded"))) else None)
    byday: dict[str, list[dict]] = defaultdict(list)
    for p in pool:
        byday[p["day"]].append(p)
    chosen: list[dict] = []
    for day in sorted(byday):
        chosen += _pick_day(byday[day], cfg)

    m, good = cfg["ambiguous"]["margin"], cfg["day"]["good"]
    irr = cfg["irrelevant"]
    for p in pool:
        p["ambiguous"], p["amb_why"] = False, ""
        if p["force"] is not None:
            continue
        ip = irrelevant_prob(p, cfg)
        if abs(p["final"] - good) < m:
            p["ambiguous"], p["amb_why"] = True, "点が境目"
        elif irr["doubt"] <= ip < irr["drop"]:
            p["ambiguous"], p["amb_why"] = True, "書類・画面かもしれない"

    picked = {p["sha"] for p in chosen}
    if calib is None:
        calib = not labels
    cal = _calib(pool, picked, cfg, set(labels)) if calib else []
    cal_set = {p["sha"] for p in cal}
    cands = [p for p in chosen if p["sha"] not in cal_set]
    for p in cal:
        p.setdefault("day_good", 0)
    _loose_groups(cands + cal, cfg)

    counts = {k: 0 for k in ["scanned", "notImage", "outOfRange", "exactDup", "broken",
                             "lowQuality", "irrelevant", "nearDup", "alreadyCard",
                             "pool", "selected", "calib"]}
    for st in stage.values():
        counts["scanned"] += 1
        if st in counts:
            counts[st] += 1
    counts["selected"], counts["calib"] = len(cands), len(cal)

    items = []
    for kind, lst in (("candidate", cands), ("calib", cal)):
        for p in lst:
            if kind == "calib":
                p["ambiguous"] = False
            items.append({
                "sha": p["sha"], "day": p["day"], "takenAt": (p["taken"] or "") + (p["tz"] or ""),
                "category": p["cat"], "score": round(p["final"], 3), "group": p["group"],
                "kind": kind, "ambiguous": bool(p["ambiguous"]), "reasons": _reasons(p, cfg),
            })
    items.sort(key=lambda x: (x["day"], x["takenAt"], x["sha"]))
    missing = _missing(photos, rng, cfg)

    db.execute("DELETE FROM picks WHERE batch=?", (batch,))
    for it in items:
        db.execute("INSERT INTO picks VALUES(?,?,?,?,?,?,?,?,?,?)",
                   (batch, it["sha"], it["kind"], int(it["ambiguous"]), it["group"], it["score"],
                    it["category"], json.dumps(it["reasons"], ensure_ascii=False), it["day"],
                    it["takenAt"]))
    db.execute("INSERT OR REPLACE INTO runs VALUES(?,?,?,?,?,?)",
               (batch, rng[0], rng[1], json.dumps(counts), json.dumps(missing, ensure_ascii=False),
                time.time()))
    db.commit()
    return {"batch": batch, "range": {"from": rng[0], "to": rng[1]}, "missing": missing,
            "counts": counts, "items": items}


def _missing(photos, rng, cfg) -> list[dict]:
    """期間の中で、写真が1枚も無い日が `missing.minDays` 日以上続いたところ。"""
    have = {p["day"] for p in photos.values() if p.get("day")}
    out = []
    d, end = date.fromisoformat(rng[0]), date.fromisoformat(rng[1])
    run_start = None
    while d <= end + timedelta(days=1):
        empty = d <= end and d.isoformat() not in have
        if empty and run_start is None:
            run_start = d
        if not empty and run_start is not None:
            last = d - timedelta(days=1)
            if (last - run_start).days + 1 >= cfg["missing"]["minDays"]:
                out.append({"from": run_start.isoformat(), "to": last.isoformat(),
                            "why": "この期間の写真が1枚も無い（書き出しの抜けか、撮っていない）"})
            run_start = None
        d += timedelta(days=1)
    return out
