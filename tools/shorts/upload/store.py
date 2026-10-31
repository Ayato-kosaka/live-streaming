"""録画の受け取り口の、GCS の側（Actions から。`serve.py` が呼ぶ）。

置き場は下見と同じ非公開バケット（`tools/shorts/preview/gcs.py`。#938 であやとが作って、
Actions のサービスアカウントに管理者を付けた）の `uploads/` の下。

    uploads/<name>/<乱数16桁>/00.bin   録画そのもの（ブラウザが細切れに上げる）
    uploads/<name>/<乱数16桁>/00.json  ブラウザが最初に置く控え（元のファイル名・大きさ・頭と尻の指紋）

## なぜ「枠」を先に署名しておくか

ブラウザが上げる名前は、ページを作る時点では分からない。だから決まった名前の枠
（`00.bin` 〜）を本数ぶん先に署名し、元のファイル名は控え（`00.json`）に書かせる。

**控えを置くことが、枠を取ること。** 控えの PUT には `x-goog-if-generation-match: 0` を
署名に入れてあり、もう控えのある枠は 412 で断られるので、ページは次の枠へ進む（上書きしない）。
録画の resumable の始めにも同じ札を入れてあるが、**GCS は始めの時点ではこれを見ない**
（2026-10-18 にランナーで実測。在る名前でも 201 が返る）。こちらは最後の1切れで断られる
（selftest の `again`）。だから枠の取り合いは、始めではなく控えで決める。

## 守り

- 署名は7日（V4 の上限）。ページ（プレビューチャンネル）も7日で消える
- バケットは公開アクセス防止を強制・均一アクセス（`gcs.py` が毎回読み直す）。`uploads/` も同じ
- `uploads/` は30日で消える（寿命の決まり。ほかの道の14日の決まりは `preview/` `render/` に絞る）
- CORS は、配ったページの出どころ（プレビューチャンネル。新しい順に10まで）からの
  PUT・POST・OPTIONS だけ（GET は許さない。ブラウザから読み返す道を作らない）。
  **GCS の CORS は `https://…--*.web.app` のような途中の `*` を読まない**（2026-10-18 に実測。
  形の出どころでは下見が通らなかった）ので、出どころは1つずつ足す
- 署名付き URL・セッションの URL はログに出さない
"""

from __future__ import annotations

import base64
import datetime as dt
import hashlib
import json
import os
import re
import secrets
import subprocess
import sys
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "preview"))
import gcs  # noqa: E402

PREFIX = "uploads/"
KEEP_DAYS = 30
SLOTS = 12
# 細切れの大きさ。GCS は 256KiB の倍数（最後の1切れを除く）しか受けない。
# 携帯の回線で1切れ落ちても、やり直すのは 8MiB ぶんで済む
CHUNK = 8 * 1024 * 1024
# 全編で 5〜10GB（2026-10-18 の依頼）。それより大きいものは枠の始めで断る
MAX_BYTES = 16 * 1024 ** 3
TTL = dt.timedelta(days=7)
# 前に入れていた形（効かなかった）。見つけたらこちらの決まりとして扱い、外す
ORIGIN_PATTERN = f"https://{gcs.PROJECT}--*.web.app"
ORIGIN_RE = re.compile(rf"^https://{re.escape(gcs.PROJECT)}--[a-z0-9-]+\.web\.app$")
CORS_METHODS = ["PUT", "POST", "OPTIONS"]
# ブラウザが送る見出し（枠の始めの署名に入れたもの・細切れの位置）と、読む見出し
# （セッションの URL・どこまで届いたか）。GCS は同じ並びを両方に使う
CORS_HEADERS = ["Content-Type", "Content-Range", "Range", "Location", "x-goog-resumable",
                "x-goog-if-generation-match", "x-goog-content-length-range",
                "X-GUploader-No-308", "X-HTTP-Status-Code-Override"]
CORS_MAX_AGE = 3600
# 残す出どころの数（ページは7日で消えるので、新しい順に十分）
MAX_EXACT = 10


def init_headers() -> dict[str, str]:
    """枠の始め（resumable の開始）に署名する見出し。ブラウザはこれをそのまま送る。"""
    return {"x-goog-resumable": "start", "x-goog-if-generation-match": "0",
            "x-goog-content-length-range": f"0,{MAX_BYTES}"}


def meta_headers() -> dict[str, str]:
    """控え（＝枠を取る印）の PUT に署名する見出し。もう在れば 412。"""
    return {"x-goog-if-generation-match": "0"}


def sign_init(blob, headers: dict | None = None) -> str:
    return blob.generate_signed_url(version="v4", method="POST", expiration=TTL,
                                    content_type="application/octet-stream",
                                    headers=headers or init_headers())


def sign_meta(blob) -> str:
    return blob.generate_signed_url(version="v4", method="PUT", expiration=TTL,
                                    content_type="application/json", headers=meta_headers())


def sign_slots(bucket, name: str, n: int) -> tuple[str, list[dict], dt.datetime]:
    now = dt.datetime.now(dt.timezone.utc).replace(microsecond=0)
    # 道に乱数を挟む。バケットは非公開なので道を知っても読めないが、名前から当てられる形にしない
    prefix = f"{PREFIX}{name}/{secrets.token_hex(8)}/"
    slots = []
    for i in range(n):
        slots.append({
            "init": sign_init(bucket.blob(f"{prefix}{i:02d}.bin")),
            "meta": sign_meta(bucket.blob(f"{prefix}{i:02d}.json"))})
    return prefix, slots, now + TTL


# ---------------------------------------------------------------- 寿命の決まり

def _covers(rule: dict, path: str) -> bool:
    pre = (rule.get("condition") or {}).get("matchesPrefix")
    return not pre or any(path.startswith(p) for p in pre)


def life_days(b, path: str) -> int | None:
    """その道のものが何日で消えるか（いちばん短い Delete の決まり）。決まりが無ければ None。"""
    ages = [r["condition"]["age"] for r in b.lifecycle_rules
            if (r.get("action") or {}).get("type") == "Delete"
            and (r.get("condition") or {}).get("age") and _covers(r, path)]
    return min(ages) if ages else None


def ensure_lifecycle(b) -> dict:
    """`uploads/` を30日で消す。全体にかかる短い決まり（14日）は、短い道だけに絞る。

    寿命の決まりは「どれか1つに当たれば消す」。全体の14日を残したまま30日を足しても、
    録画は14日で消える。だから全体の決まりを `preview/` `render/` に絞ってから足す。
    """
    b.reload()
    rules, notes = [], []
    for r in b.lifecycle_rules:
        act, cond = dict(r.get("action") or {}), dict(r.get("condition") or {})
        if act.get("type") == "Delete" and set(cond) == {"age"} and cond["age"] < KEEP_DAYS:
            cond["matchesPrefix"] = list(gcs.SHORT_LIVED)
            notes.append(f"全体の{cond['age']}日の決まりを {' '.join(gcs.SHORT_LIVED)} に絞った")
        rules.append({"action": act, "condition": cond})
    if not any(r["action"].get("type") == "Delete" and r["condition"].get("age") == KEEP_DAYS
               and r["condition"].get("matchesPrefix") == [PREFIX] for r in rules):
        rules.append({"action": {"type": "Delete"},
                      "condition": {"age": KEEP_DAYS, "matchesPrefix": [PREFIX]}})
        notes.append(f"{PREFIX} を{KEEP_DAYS}日で消す決まりを足した")
    if notes:
        b.lifecycle_rules = rules
        b.patch()
        b.reload()
    for n in notes:
        print(f"  {n}")
    got = {p: life_days(b, p + "x") for p in (PREFIX, *gcs.SHORT_LIVED)}
    bad = []
    if got[PREFIX] != KEEP_DAYS:
        bad.append(f"{PREFIX} が{KEEP_DAYS}日で消えない（{got[PREFIX]}）")
    bad += [f"{p} が{gcs.KEEP_DAYS}日以内に消えない（{got[p]}）" for p in gcs.SHORT_LIVED
            if not got[p] or got[p] > gcs.KEEP_DAYS]
    print("  寿命: " + "  ".join(f"{p} {d}日" for p, d in got.items()))
    return {"changed": notes, "days": got, "rules": [dict(r) for r in b.lifecycle_rules],
            "problems": bad}


# ---------------------------------------------------------------- CORS

def _ours(rule: dict) -> bool:
    o = rule.get("origin") or []
    return bool(o) and all(x == ORIGIN_PATTERN or ORIGIN_RE.match(x) for x in o)


def ensure_cors(b, origin: str) -> dict:
    """配ったページの出どころから、PUT・POST・OPTIONS だけを許す。ほかの決まりには触らない。

    出どころはページごとに1つずつ足し、新しい順に MAX_EXACT まで残す（`*` の形は GCS が読まない）。
    """
    if not ORIGIN_RE.match(origin):
        raise ValueError("ページの出どころがプレビューチャンネルの形ではない")
    b.reload()
    rules = [dict(r) for r in (b.cors or [])]
    others = [r for r in rules if not _ours(r)]
    exact = [origin]
    for r in rules:
        if _ours(r):
            exact += [o for o in r.get("origin", []) if o != ORIGIN_PATTERN and o not in exact]
    rule = {"origin": exact[:MAX_EXACT], "method": CORS_METHODS,
            "responseHeader": CORS_HEADERS, "maxAgeSeconds": CORS_MAX_AGE}
    new = others + [rule]
    changed = new != rules
    if changed:
        b.cors = new
        b.patch()
        b.reload()
    print(f"  CORS: {'書き換えた' if changed else 'そのまま'}（ほかの決まり {len(others)}本・"
          f"出どころ {len(exact[:MAX_EXACT])}つ・{'/'.join(CORS_METHODS)}）")
    return {"changed": changed, "others": len(others), "methods": CORS_METHODS,
            "headers": CORS_HEADERS, "exact": len(exact[:MAX_EXACT])}


# ---------------------------------------------------------------- 配った直後に、ブラウザと同じ要求を送って見る

def _h(r, name: str) -> str:
    return r.headers.get(name) or ""


def _exposed(r, name: str) -> bool:
    return name.lower() in [x.strip().lower() for x in _h(r, "Access-Control-Expose-Headers").split(",")]


def preflight(url: str, origin: str, method: str, headers: list[str], wait: float = 0) -> dict:
    """CORS の下見（OPTIONS）。決まりを書き換えた直後は効くまで間があるので、wait 秒まで待つ。"""
    import requests

    t0 = time.time()
    while True:
        r = requests.options(url, timeout=30, headers={
            "Origin": origin, "Access-Control-Request-Method": method,
            "Access-Control-Request-Headers": ",".join(h.lower() for h in headers)})
        allow_h = [x.strip().lower() for x in _h(r, "Access-Control-Allow-Headers").split(",")]
        ok = (r.status_code == 200 and _h(r, "Access-Control-Allow-Origin") == origin
              and method in _h(r, "Access-Control-Allow-Methods")
              and all(h.lower() in allow_h for h in headers))
        if ok or time.time() - t0 >= wait:
            return {"ok": ok, "status": r.status_code, "allow_origin": _h(r, "Access-Control-Allow-Origin") == origin,
                    "methods": _h(r, "Access-Control-Allow-Methods"), "sec": round(time.time() - t0, 1)}
        time.sleep(5)


def selftest(bucket, prefix: str, origin: str) -> dict:
    """ページの JS と同じ順で、小さなものを上げてみる（ランナーから。Origin を付けて）。

    控えで枠を取る（2回目は 412）→ 始める → 1切れ目 → どこまで届いたかを聞く（＝再開）→ 残り →
    届いたものの md5 → 同じ名前でもう1本上げると最後で 412（上書きしない）→ 署名なしでは読めない。
    大きさの上限（x-goog-content-length-range）が効くかも、小さな上限で見る（合否には入れない）。
    """
    import requests

    out: dict = {}
    blob = bucket.blob(prefix + "selftest.bin")
    meta = bucket.blob(prefix + "selftest.json")
    cap = bucket.blob(prefix + "selftest-cap.bin")
    init = sign_init(blob)
    H = dict(init_headers(), **{"Content-Type": "application/octet-stream"})
    MH = dict(meta_headers(), **{"Content-Type": "application/json"})
    piece = 2 * 256 * 1024
    data = os.urandom(3 * 256 * 1024)
    total = len(data)
    resume = -1
    try:
        out["preflight_init"] = preflight(init, origin, "POST", list(H), wait=120)
        murl = sign_meta(meta)
        out["preflight_meta"] = preflight(murl, origin, "PUT", list(MH), wait=60)
        claim = [requests.put(murl, data=b'{"selftest":true}', timeout=30,
                              headers=dict(MH, Origin=origin)).status_code for _ in range(2)]
        out["claim"] = {"first": claim[0], "second": claim[1]}
        r = requests.post(init, headers=dict(H, Origin=origin), data=b"", timeout=30)
        session = _h(r, "Location")
        out["init"] = {"status": r.status_code, "location": bool(session),
                       "allow_origin": _h(r, "Access-Control-Allow-Origin") == origin,
                       "expose_location": _exposed(r, "Location")}
        if not session:
            out["ok"] = False
            return out
        put_h = ["Content-Range", "X-GUploader-No-308"]
        out["preflight_session"] = preflight(session, origin, "PUT", put_h, wait=60)
        no308 = {"X-GUploader-No-308": "yes", "Origin": origin}
        r = requests.put(session, data=data[:piece], timeout=60,
                         headers=dict(no308, **{"Content-Range": f"bytes 0-{piece - 1}/{total}"}))
        out["piece"] = {"status": r.status_code, "override": _h(r, "X-HTTP-Status-Code-Override"),
                        "range": _h(r, "Range"), "expose_range": _exposed(r, "Range"),
                        "expose_override": _exposed(r, "X-HTTP-Status-Code-Override")}
        r = requests.put(session, data=b"", timeout=30,
                         headers=dict(no308, **{"Content-Range": f"bytes */{total}"}))
        out["ask"] = {"status": r.status_code, "override": _h(r, "X-HTTP-Status-Code-Override"),
                      "range": _h(r, "Range")}
        # X-GUploader-No-308 を付けないときの答え（308 のまま。ブラウザによっては扱えない）
        r = requests.put(session, data=b"", timeout=30, allow_redirects=False,
                         headers={"Origin": origin, "Content-Range": f"bytes */{total}"})
        out["ask_plain"] = {"status": r.status_code, "range": _h(r, "Range")}
        m = re.match(r"bytes=0-(\d+)$", out["ask"]["range"])
        resume = int(m.group(1)) + 1 if m else 0
        r = requests.put(session, data=data[resume:], timeout=60,
                         headers=dict(no308, **{"Content-Range": f"bytes {resume}-{total - 1}/{total}"}))
        out["last"] = {"status": r.status_code, "override": _h(r, "X-HTTP-Status-Code-Override"),
                       "from": resume}
        blob.reload()
        md5 = base64.b64encode(hashlib.md5(data).digest()).decode()
        out["stored"] = {"bytes": blob.size, "md5_ok": blob.md5_hash == md5}
        # 同じ名前でもう1本。始めは通る（GCS は始めでは札を見ない）が、最後の1切れで 412 になるはず
        other = os.urandom(total)
        r = requests.post(init, headers=dict(H, Origin=origin), data=b"", timeout=30)
        again = {"init": r.status_code}
        if _h(r, "Location"):
            again["final"] = requests.put(_h(r, "Location"), data=other, timeout=60, headers=dict(
                no308, **{"Content-Range": f"bytes 0-{total - 1}/{total}"})).status_code
        blob.reload()
        again["kept"] = blob.md5_hash == md5
        out["again"] = again
        # 大きさの上限が resumable で効くか（上限 512KiB−1 で 768KiB を上げてみる）
        small = dict(init_headers(), **{"x-goog-content-length-range": f"0,{piece - 1}"})
        r = requests.post(sign_init(cap, small), data=b"", timeout=30,
                          headers=dict(small, **{"Content-Type": "application/octet-stream"}, Origin=origin))
        c = {"init": r.status_code}
        if _h(r, "Location"):
            c["final"] = requests.put(_h(r, "Location"), data=data, timeout=60, headers=dict(
                no308, **{"Content-Range": f"bytes 0-{total - 1}/{total}"})).status_code
        c["stored"] = cap.exists()
        out["cap"] = dict(c, enforced=not c["stored"])
        out["plain_get"] = requests.get(f"https://storage.googleapis.com/{bucket.name}/{blob.name}",
                                        timeout=30).status_code
    finally:
        for x in (blob, meta, cap):
            try:
                x.delete()
            except Exception:  # noqa: BLE001  無いものは消せないだけ
                pass
    out["ok"] = (out["preflight_init"]["ok"] and out["preflight_meta"]["ok"]
                 and out["claim"] == {"first": 200, "second": 412}
                 and out["init"]["status"] in (200, 201)
                 and out["init"]["allow_origin"] and out["init"]["expose_location"]
                 and out["preflight_session"]["ok"]
                 and out["piece"]["override"] == "308" and out["piece"]["expose_range"]
                 and out["piece"]["expose_override"]
                 and out["ask"]["override"] == "308" and resume == piece
                 and out["last"]["status"] in (200, 201) and not out["last"]["override"]
                 and out["stored"]["bytes"] == total and out["stored"]["md5_ok"]
                 and out["again"].get("final") == 412 and out["again"]["kept"]
                 and out["plain_get"] in (401, 403))
    return out


# ---------------------------------------------------------------- 届いたものを見る（ffprobe）

def uploads(client, bucket, name: str) -> list[dict]:
    """`uploads/<name>/` の録画と控え。selftest は数えない。"""
    blobs = list(client.list_blobs(bucket, prefix=f"{PREFIX}{name}/"))
    side = {b.name[:-len(".json")]: b for b in blobs if b.name.endswith(".json")}
    out = []
    for b in sorted(blobs, key=lambda x: x.name):
        if not b.name.endswith(".bin") or Path(b.name).name.startswith("selftest"):
            continue
        meta = {}
        s = side.get(b.name[:-len(".bin")])
        if s is not None:
            try:
                meta = json.loads(s.download_as_bytes())
            except (ValueError, UnicodeDecodeError):
                meta = {"error": "控えが JSON として読めない"}
        out.append({"blob": b, "meta": meta})
    return out


# 位置（GPS）は解析に要らない。暗号化した結果にも入れない
def _drop_location(tags: dict | None) -> dict:
    return {k: v for k, v in (tags or {}).items() if "location" not in k.lower()}


def _rate(s: str | None) -> float | None:
    try:
        n, d = (s or "").split("/")
        return round(int(n) / int(d), 3) if int(d) else None
    except ValueError:
        return None


def _int(x) -> int | None:
    try:
        return int(x)
    except (TypeError, ValueError):
        return None


def _float(x) -> float | None:
    try:
        return round(float(x), 3)
    except (TypeError, ValueError):
        return None


def summarize(ff: dict) -> dict:
    fmt = ff.get("format") or {}
    st = ff.get("streams") or []
    v = next((s for s in st if s.get("codec_type") == "video"
              and not (s.get("disposition") or {}).get("attached_pic")), None)
    a = next((s for s in st if s.get("codec_type") == "audio"), None)
    tags = fmt.get("tags") or {}
    out = {"container": fmt.get("format_name"), "duration": _float(fmt.get("duration")),
           "bit_rate": _int(fmt.get("bit_rate")), "streams": len(st),
           "created": tags.get("com.apple.quicktime.creationdate") or tags.get("creation_time"),
           "device": " ".join(x for x in (tags.get("com.apple.quicktime.make"),
                                          tags.get("com.apple.quicktime.model"),
                                          tags.get("com.apple.quicktime.software")) if x) or None}
    if v:
        rot = next((sd.get("rotation") for sd in v.get("side_data_list") or []
                    if "rotation" in sd), None)
        out["video"] = {"codec": v.get("codec_name"), "profile": v.get("profile"),
                        "width": v.get("width"), "height": v.get("height"),
                        "rotation": rot if rot is not None else _int((v.get("tags") or {}).get("rotate")),
                        "fps": _rate(v.get("r_frame_rate")), "avg_fps": _rate(v.get("avg_frame_rate")),
                        "bit_rate": _int(v.get("bit_rate")), "pix_fmt": v.get("pix_fmt"),
                        "color": {k: v.get(k) for k in ("color_primaries", "color_transfer",
                                                        "color_space", "color_range") if v.get(k)},
                        "frames": _int(v.get("nb_frames")), "duration": _float(v.get("duration"))}
    if a:
        out["audio"] = {"codec": a.get("codec_name"), "sample_rate": _int(a.get("sample_rate")),
                        "channels": a.get("channels"), "layout": a.get("channel_layout"),
                        "bit_rate": _int(a.get("bit_rate")), "duration": _float(a.get("duration"))}
    return out


def ffprobe(url: str) -> tuple[dict | None, str]:
    """署名付き URL のまま読む（範囲の要求で頭と moov だけを取る。全部は落とさない）。"""
    r = subprocess.run(["ffprobe", "-v", "error", "-print_format", "json", "-show_format",
                        "-show_streams", url], capture_output=True, text=True, timeout=600)
    # 落ちたときの文面に URL が混ざりうる。暗号化した結果に入れる前にも伏せる
    err = (r.stderr or "").replace(url, "<url>")[-600:]
    if r.returncode != 0:
        return None, err
    try:
        ff = json.loads(r.stdout)
    except json.JSONDecodeError:
        return None, "ffprobe の出力が JSON ではない"
    ff["format"] = dict(ff.get("format") or {}, tags=_drop_location((ff.get("format") or {}).get("tags")))
    ff["format"].pop("filename", None)
    for s in ff.get("streams") or []:
        s["tags"] = _drop_location(s.get("tags"))
    return ff, err


def hashes(url: str) -> dict:
    """落とし直して sha256 と md5 を出す（md5 は GCS が持っている値と突き合わせる）。"""
    import requests

    sha, md5, n, t0 = hashlib.sha256(), hashlib.md5(), 0, time.time()
    with requests.get(url, stream=True, timeout=(30, 3600)) as r:
        if r.status_code != 200:
            return {"status": r.status_code}
        for b in r.iter_content(8 << 20):
            sha.update(b)
            md5.update(b)
            n += len(b)
    return {"status": 200, "sha256": sha.hexdigest(),
            "md5": base64.b64encode(md5.digest()).decode(), "bytes": n,
            "sec": round(time.time() - t0, 1)}


def probe_one(bucket, item: dict, want_hash: bool) -> dict:
    b = item["blob"]
    url = b.generate_signed_url(version="v4", method="GET", expiration=dt.timedelta(hours=2))
    t0 = time.time()
    ff, err = ffprobe(url)
    res = {"object": f"gs://{bucket.name}/{b.name}", "slot": Path(b.name).stem, "bytes": b.size,
           "md5": b.md5_hash, "crc32c": b.crc32c,
           "uploaded": b.time_created.isoformat() if b.time_created else None,
           "source": {k: item["meta"].get(k) for k in
                      ("name", "size", "type", "lastModified", "fingerprint", "started", "done", "ua")
                      if k in item["meta"]},
           "ffprobe_ok": ff is not None, "ffprobe_sec": round(time.time() - t0, 1)}
    if ff is not None:
        res["summary"] = summarize(ff)
        res["ffprobe"] = ff
    else:
        res["ffprobe_error"] = err
    if want_hash:
        h = hashes(url)
        res["sha256"] = h.get("sha256")
        res["hash"] = {k: h[k] for k in ("status", "bytes", "sec") if k in h}
        res["md5_ok"] = h.get("md5") == b.md5_hash if b.md5_hash else None
    return res
