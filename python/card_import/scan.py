"""読む・数える。源を1つ受け取り、1枚ずつ数えて台帳に書く。

- **途中で落ちても続きから。** 1枚ごとに台帳へ書いて閉じる。読み終えたメンバーは飛ばす
- **同じ sha は2度数えない。** 2度目は「完全重複」として台帳に1行足すだけ（解かない）
- 手元に残す絵（`keep/<sha>.webp`、長辺1600・EXIF なし）は、機械で落ちなかったものだけ。
  落ちたものは数と埋め込みだけ残す（ディスクが小さいので）
- 源を1つ読み終えたら、束で負けた写真の絵を消す（`choose.prune`）
"""

from __future__ import annotations

import json
import shutil
import time

from . import guards
from .choose import hard_reason, parts, prune
from .measure import Broken, measure, resolve_time, sha256, write_webp
from .sources import parse_sidecar, sidecar_media_name
from .store import keep_path, pack_vec


def _source_id(db, src) -> int:
    db.execute("INSERT OR IGNORE INTO sources(kind, name, size) VALUES(?,?,?)",
                (src.kind, src.name, src.size))
    return db.execute("SELECT id FROM sources WHERE kind=? AND name=? AND size=?",
                      (src.kind, src.name, src.size)).fetchone()[0]


def _sidecar_for(db, member: str):
    row = db.execute("SELECT ts, lat, lng FROM sidecars WHERE jkey=?", (member,)).fetchone()
    if row:
        return row
    # 名前が51字で切られた JSON は、写真の名前の前の部分になっている
    d = member.rsplit("/", 1)[0] + "/" if "/" in member else ""
    return db.execute(
        "SELECT ts, lat, lng FROM sidecars WHERE length(jkey) >= ? AND substr(jkey, 1, ?) = ? "
        "AND substr(?, 1, length(jkey)) = jkey ORDER BY length(jkey) DESC LIMIT 1",
        (len(d) + 30, len(d), d, member)).fetchone()


def _shotname(member: str) -> int:
    n = member.rsplit("/", 1)[-1].lower()
    return 1 if ("screenshot" in n or "screen shot" in n or "スクリーンショット" in n) else 0


def refresh_dates(db) -> int:
    """日付の無い写真を、あとから来た横の JSON で埋める（JSON が別の zip に入っていたとき）。"""
    n = 0
    for r in db.execute("SELECT sha, jkey, lng FROM photos WHERE date_src='none' AND status!='broken'").fetchall():
        sc = _sidecar_for(db, r["jkey"])
        if sc and sc["ts"]:
            t = resolve_time(None, None, sc["ts"], sc["lng"] if r["lng"] is None else r["lng"])
            db.execute("UPDATE photos SET taken=?, tz=?, day=?, date_src=?, "
                       "lat=COALESCE(lat, ?), lng=COALESCE(lng, ?) WHERE sha=?",
                       (t["taken"], t["tz"], t["day"], t["date_src"], sc["lat"], sc["lng"], r["sha"]))
            n += 1
    db.commit()
    return n


def scan(db, root, cfg, src, embedder, rng: tuple[str, str], limit: int | None = None,
         log=print) -> dict:
    """源を1つ読む。`limit` 枚の新しいメンバーを読んだら途中で返す（見張りの「途中で止める」）。"""
    sid = _source_id(db, src)
    # 1周目: 横の JSON だけ（小さい）。写真より後ろに並んでいることがあるので先に全部読む
    for e in src.entries():
        if e.kind != "json":
            continue
        media = sidecar_media_name(e.name)
        sc = parse_sidecar(e.read()) if media else None
        if sc:
            key = (e.dir + "/" if e.dir else "") + media
            db.execute("INSERT OR REPLACE INTO sidecars VALUES(?,?,?,?)", (key, sc["ts"], sc["lat"], sc["lng"]))
    db.commit()

    st = {"new": 0, "skipped": 0, "images": 0, "dup": 0, "broken": 0, "notImage": 0, "kept": 0}
    t0 = time.monotonic()
    members = 0
    for e in src.entries():
        if e.kind == "json":
            continue
        members += 1
        if guards.on("resume") and db.execute(
                "SELECT 1 FROM occ WHERE source_id=? AND member=?", (sid, e.member)).fetchone():
            st["skipped"] += 1
            continue
        if limit is not None and st["new"] >= limit:
            return {**st, "done": False, "sec": time.monotonic() - t0}
        # 空きが無くなる前に、きれいに止まる（同じ命令で続きから回る）。2GB の zip を
        # 抱えたまま手元の絵が溜まると、6.8GB の箱はすぐ埋まる
        if st["new"] % 50 == 0 and shutil.disk_usage(root).free < cfg["read"]["minFreeGB"] * 1e9:
            log(f"  ディスクの空きが {cfg['read']['minFreeGB']} GB を切ったので止めた（prune してから続きを）")
            return {**st, "done": False, "sec": time.monotonic() - t0, "diskFull": True}
        st["new"] += 1
        if e.kind != "image":
            db.execute("INSERT OR REPLACE INTO occ(source_id, member, sha, what) VALUES(?,?,NULL,'notImage')",
                       (sid, e.member))
            db.commit()
            st["notImage"] += 1
            continue
        raw = e.read()
        sha = sha256(raw)
        if guards.on("exactDup") and db.execute("SELECT 1 FROM photos WHERE sha=?", (sha,)).fetchone():
            db.execute("INSERT OR REPLACE INTO occ(source_id, member, sha, what) VALUES(?,?,?,'image')",
                       (sid, e.member, sha))
            db.commit()
            st["dup"] += 1
            continue
        _one(db, root, cfg, embedder, rng, e.member, raw, sha, st)
        db.execute("INSERT OR REPLACE INTO occ(source_id, member, sha, what) VALUES(?,?,?,'image')",
                   (sid, e.member, sha))
        db.commit()
        if st["new"] % 200 == 0:
            log(f"  {st['new']} 枚目（{(time.monotonic() - t0) / st['new']:.2f} 秒/枚）")
    db.execute("UPDATE sources SET members=?, done_at=? WHERE id=?", (members, time.time(), sid))
    db.commit()
    if cfg["prune"]["afterEachSource"]:
        st["pruned"] = prune(db, root, cfg, rng)
    return {**st, "done": True, "sec": time.monotonic() - t0}


def _one(db, root, cfg, embedder, rng, member, raw, sha, st) -> None:
    st["images"] += 1
    sc = _sidecar_for(db, member)
    try:
        m, keep = measure(raw, cfg["read"]["keepLong"], cfg["read"]["maxPixels"])
    except Broken:
        db.execute("INSERT OR REPLACE INTO photos(sha, jkey, status, date_src) VALUES(?,?,'broken','none')",
                   (sha, member))
        st["broken"] += 1
        return
    lat, lng = m["lat"], m["lng"]
    if lat is None and sc and sc["lat"] is not None:
        lat, lng = sc["lat"], sc["lng"]
    t = resolve_time(m["exif_dt"], m["exif_off"], sc["ts"] if sc else None, lng)
    vec, probs, aesth = embedder.analyze(keep)
    row = {"sha": sha, "jkey": member, "w0": m["w0"], "h0": m["h0"], "taken": t["taken"],
           "tz": t["tz"], "day": t["day"], "date_src": t["date_src"], "lat": lat, "lng": lng,
           "camera": m["camera"], "shotname": _shotname(member), "blur": m["blur"],
           "dark": m["dark"], "clip": m["clip"], "phash": m["phash"],
           "probs": json.dumps({k: round(v, 4) for k, v in probs.items()}), "aesth": round(aesth, 4),
           "status": "measured"}
    row.update(parts(row, cfg))
    # 日付がまだ無い（JSON が別の zip）ものは、期間の判定を待って絵を残しておく
    why = hard_reason(row, cfg, rng) if row["day"] else hard_reason({**row, "day": rng[0]}, cfg, rng)
    keep_flag, kw, kh = 0, None, None
    if why is None:
        kw, kh = write_webp(keep, keep_path(root, sha), cfg["read"]["webpQuality"])
        keep_flag = 1
        st["kept"] += 1
    db.execute(
        "INSERT OR REPLACE INTO photos(sha, jkey, w0, h0, taken, tz, day, date_src, lat, lng, camera, "
        "shotname, blur, dark, clip, phash, vec, probs, aesth, status, keep, kw, kh) "
        "VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
        (sha, member, row["w0"], row["h0"], row["taken"], row["tz"], row["day"], row["date_src"],
         lat, lng, row["camera"], row["shotname"], row["blur"], row["dark"], row["clip"],
         row["phash"], pack_vec(vec), row["probs"], row["aesth"], "measured", keep_flag, kw, kh))
