#!/usr/bin/env python3
"""公開したショートの数字（24時間・72時間・7日・14日）を Studio から読み、EC2 の JSON に貯め、Actions に BigQuery へ入れてもらう。#921

    M=tools/shorts/metrics/shorts_metrics.py
    python3 $M plan                          # 台帳から、どの動画を聞くか（EC2 に触らない）
    python3 $M collect                       # EC2 の Chrome（列 ytstudio）で Studio を読み、EC2 の JSON に貯める
    python3 $M ship --key <秘密鍵.pem> --work <リポジトリの外>
                                             # EC2 の JSON を、Actions（shorts_metrics.yml）に BigQuery へ入れてもらう
    python3 $M summary-sql                   # 中央値との比を出す SELECT（公開側に書くのはこの比だけ）

手元の画面に出るのは、どの入口も**件数と成否だけ**。

## 生の数字の置き場

リポジトリは公開で、Actions のログも誰でも読める。生の数字が置かれるのは次の3つだけ:

| 置き場 | 何 | 書くのは |
| --- | --- | --- |
| EC2 の `~/shorts-metrics/rows.json`（ubuntu のホーム） | 行の正の写し（鍵ごとに1行）。Studio から読んだ生の返事は同じ置き場の `raw/` | `collect`（EC2 の上の `remote`） |
| GCS の非公開バケットの `transfer/metrics/` | Actions へ渡すあいだだけ。入れたら消す（消し損ねても1日で消える。`preview/gcs.py` の TRANSFER） | EC2 が、Actions の作った署名付き URL へ PUT |
| BigQuery `youtube_chat.shorts_metrics` | 集計する置き場 | Actions（`serve.py`）だけ |

**この箱から BigQuery には書かない**（MCP の execute_sql も bq も使わない）。Actions は既存の
`FIREBASE_SERVICE_ACCOUNT` で届く。Actions から EC2 へは届かない（AWS の鍵が無い）ので、
上げる URL を Actions に作らせ、依頼の公開鍵で包んで作業枝に置かせ（`ingest/seal.py` の形）、
ここで開いて EC2 に PUT させる。URL も数字も git には平文で入らない。

公開側（playbook.md・issue）には中央値との比と学びだけを書く。`ship --work` がリポジトリの中を
指していたら断る（開いた URL をうっかり commit しないように）。

## 同じ動画・同じ時点は1行

鍵は（platform, video_id, checkpoint）。EC2 の JSON は鍵ごとに上書きし、BigQuery は MERGE なので、
何回回しても行は増えない。締切から48時間たつまでに取った行は `provisional`（Studio があとで直す）で、
次に回したとき取り直して上書きする。48時間を過ぎてから取った行は確定で、以後は上書きせず、Studio にも
聞き直さない。`checkpoint = lifetime` の行は「取った時点の全期間」で、維持率カーブ（3→8秒の残り）は
ここにしか入らない（期間で切れないため。`studio_metrics.py` の頭）。毎回上書きする。
Studio の要求が落ちた行は、前に取れた行があれば前のほうを残す（取れた値を NULL で消さない）。

取れなかった指標は NULL のまま、`missing` に（指標, 理由）で残す。0 や推測で埋めない。

EC2 は列 `ytstudio` の札を持って触る（`ec2-chrome` 2.5）。Studio には読む要求だけを送る（`studio_metrics.READ_ONLY`）。
"""
import argparse, json, os, re, secrets, shlex, subprocess, sys, tempfile, time
from pathlib import Path

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
sys.path.insert(0, HERE)
import studio_metrics as sm  # noqa: E402

LEDGER = os.path.join(ROOT, "tools", "shorts", "post", "posted.json")
PROJECT = "live-streaming-d3cac"
BQ_TABLE = f"{PROJECT}.youtube_chat.shorts_metrics"
EC2_HOME = "/home/ubuntu"
CDP = f"{EC2_HOME}/cdp"
REMOTE_DIR = f"{EC2_HOME}/shorts-metrics"
STORE = f"{REMOTE_DIR}/rows.json"
STORE_FORMAT = "shorts-metrics/1"
# 依頼と結果を置く作業枝の道。`shorts/requests/` は取り込みが見ているので使わない
REQ_DIR = "shorts/metrics/"
WORK = "shorts/.work/metrics"
BRANCH = "claude/serene-darwin-sf09tt"
# 1回の MERGE に載せる行の数。行ごとに維持率カーブ（100点）が入るので、字が BigQuery の上限（1MB）に近づかないよう切る
MERGE_ROWS = 100

# 比べる相手: 2026年に公開したショート33本の中央値（2026-10-15 に Studio から。#911・playbook.md の物差し）。
# 3→8秒の残りだけは playbook に無かったので、同じ33本の維持率カーブから studio_metrics.retention_summary で出した
BASELINE = {
    "stayed_to_watch_pct": 34.48,
    "views_24h": 1883, "views_7d": 2441,
    "engaged_views_24h": 554, "engaged_views_7d": 604,
    "avg_view_duration_s": 25.3,
    "keep_3to8_pct": 69.21,
}

# BigQuery の列（この順で表を作り、MERGE もこの順で書く）。EC2 の JSON の行も同じ列を持つ
COLUMNS = [
    ("platform", "STRING"), ("video_id", "STRING"), ("plan", "STRING"),
    ("checkpoint", "STRING"), ("checkpoint_hours", "INT64"),
    ("published_at", "TIMESTAMP"), ("checkpoint_at", "TIMESTAMP"), ("fetched_at", "TIMESTAMP"),
    ("provisional", "BOOL"), ("duration_s", "FLOAT64"),
    ("views", "INT64"), ("engaged_views", "INT64"), ("stayed_to_watch_pct", "FLOAT64"),
    ("avg_view_duration_s", "FLOAT64"), ("avg_view_pct", "FLOAT64"), ("watch_time_h", "FLOAT64"),
    ("shorts_feed_impressions", "INT64"), ("likes", "INT64"), ("comments", "INT64"), ("shares", "INT64"),
    ("subs_gained", "INT64"), ("subs_lost", "INT64"), ("subs_net", "INT64"),
    ("ret_norm_3s", "FLOAT64"), ("ret_norm_8s", "FLOAT64"), ("keep_3to8_pct", "FLOAT64"),
    ("retention_curve", "ARRAY<FLOAT64>"),
    ("missing", "ARRAY<STRUCT<metric STRING, reason STRING>>"),
    ("source", "STRING"), ("tool_version", "STRING"),
]
KEY = ("platform", "video_id", "checkpoint")
TYPES = dict(COLUMNS)
CHECKPOINT_NAMES = tuple(c for c, _ in sm.CHECKPOINTS) + ("lifetime",)
# 維持率カーブは期間で切れない（Studio は公開以降の全期間だけを返す）。理由は短く（MERGE の字に行の数だけ入る）
NO_PERIOD = "期間で切れない（lifetime の行にある）"
FAILED = "Studio の要求が失敗した"
# YouTube は11字、TikTok は19桁。道や SQL に混ざって困る字（. / ' など）を通さないのが目当て
VIDEO_ID = re.compile(r"^[A-Za-z0-9_-]{3,32}$")


# ---- 台帳 ----

def ledger_plans(path=LEDGER):
    """台帳の YouTube の done から {動画ID: plan}。同じ ID が2行あれば先の行"""
    out = {}
    for e in json.load(open(path)):
        if e.get("place") == "youtube" and e.get("state") == "done" and e.get("id"):
            out.setdefault(e["id"], e.get("plan") or "")
    return out


# ---- 置き場の守り ----

def outside_repo(path, root=ROOT):
    """リポジトリ（公開）の中なら False"""
    p, r = os.path.realpath(path), os.path.realpath(root)
    return not (p == r or p.startswith(r + os.sep))


# ---- 行を組む ----

def _iso(s):
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(int(s))) if s is not None else None


def _metric_cols(totals, err):
    vals, missing = {}, []
    for m, (col, k) in sm.METRICS.items():
        if err:
            missing.append((col, f"{FAILED}: {err}"))
        elif m in totals:
            v = totals[m] * k
            vals[col] = int(round(v)) if TYPES[col] == "INT64" else round(float(v), 4)
        else:
            missing.append((col, "Studio の返事に無かった"))
    return vals, missing


def build_rows(res, plans):
    """studio_metrics.collect の結果 → 行。鍵が同じ行は1つにまとめる（MERGE の元に重複があると落ちる）"""
    fetched = int(res["fetched_at"])
    rows = {}
    for v in res.get("videos", []):
        if v.get("status") != "public":
            continue
        vid, pub = v["video_id"], int(v["published"])
        base = {"platform": "youtube", "video_id": vid, "plan": plans.get(vid, ""),
                "published_at": _iso(pub), "fetched_at": _iso(fetched), "duration_s": v.get("duration_s"),
                "tool_version": res.get("tool", sm.TOOL_VERSION)}
        for p in v.get("points", []):
            h = int(p["hours"])
            vals, missing = _metric_cols(p.get("totals") or {}, p.get("error"))
            missing += [(c, NO_PERIOD) for c in sm.RETENTION_COLS]
            # 要求が失敗した行は、48時間たっていても仮にしておく（次に回したとき取り直す）
            prov = bool(p.get("error")) or sm.provisional(pub, h, fetched)
            rows[(base["platform"], vid, p["checkpoint"])] = dict(
                base, checkpoint=p["checkpoint"], checkpoint_hours=h, checkpoint_at=_iso(pub + h * 3600),
                provisional=prov, retention_curve=[], missing=missing,
                source=f"studio yta_web/get_cards SINCE_PUBLISH NTH_DAYS count={h // 24}", **vals)
        life = v.get("lifetime") or {}
        vals, missing = _metric_cols(life.get("totals") or {}, life.get("error"))
        ret, why = sm.retention_summary(life.get("curve"), v.get("duration_s"))
        if why or life.get("error"):
            missing += [(c, why or f"{FAILED}: {life.get('error')}") for c in sm.RETENTION_COLS]
        rows[(base["platform"], vid, "lifetime")] = dict(
            base, checkpoint="lifetime", checkpoint_hours=None, checkpoint_at=None, provisional=True,
            retention_curve=[round(x, 2) for x in (life.get("curve") or [])], missing=missing,
            source="studio yta_web/get_cards SINCE_PUBLISH（取った時点の全期間）", **vals, **ret)
    out = []
    for r in rows.values():
        out.append({c: r.get(c) for c, _ in COLUMNS})
    return out


def skipped(res):
    """公開していないので行を作らなかった動画と、その理由"""
    return [(v["video_id"], v.get("reason", "")) for v in res.get("videos", []) if v.get("status") != "public"]


# ---- EC2 の JSON（行の正の写し） ----

def row_key(r):
    return tuple(r[k] for k in KEY)


def _sort_key(r):
    return (r.get("published_at") or "", r["video_id"], r.get("checkpoint_hours") or 10 ** 6)


def failed(r):
    """Studio の要求が落ちて取れなかった行"""
    return any(str(why).startswith(FAILED) for _, why in (r.get("missing") or []))


def merge_rows(old, new):
    """鍵ごとに1行にする。→ (行, {added, replaced, kept})。
    確定した行は上書きしない（Studio はもう直さない）。仮の行と lifetime は新しいほうに替える。
    ただし新しい行が要求の失敗なら、前の行を残す（取れた値を NULL で消さない）"""
    by = {row_key(r): r for r in old}
    st = {"added": 0, "replaced": 0, "kept": 0}
    for r in new:
        k = row_key(r)
        o = by.get(k)
        if o is None:
            by[k] = r
            st["added"] += 1
        elif o.get("provisional") and not failed(r):
            by[k] = r
            st["replaced"] += 1
        else:
            st["kept"] += 1
    return sorted(by.values(), key=_sort_key), st


def confirmed(rows):
    """もう聞き直さない (動画ID, 時点)。確定した時点の行だけ（lifetime は毎回取る）"""
    return {(r["video_id"], r["checkpoint"]) for r in rows
            if r.get("platform") == "youtube" and not r.get("provisional") and r.get("checkpoint") != "lifetime"}


def counts(rows):
    """時点ごとの行の数（中身の数字は出さない）"""
    c = {cp: 0 for cp in CHECKPOINT_NAMES}
    for r in rows:
        c[r["checkpoint"]] = c.get(r["checkpoint"], 0) + 1
    return {"by_checkpoint": c, "rows": len(rows), "videos": len({r["video_id"] for r in rows}),
            "provisional": sum(1 for r in rows if r.get("provisional") and r["checkpoint"] != "lifetime"),
            "with_missing": sum(1 for r in rows if any(why != NO_PERIOD for _, why in (r.get("missing") or [])))}


def rows_of(doc):
    if not isinstance(doc, dict) or doc.get("format") != STORE_FORMAT or not isinstance(doc.get("rows"), list):
        raise ValueError(f"{STORE_FORMAT} の形ではない")
    return doc["rows"]


def load_store(path):
    if not os.path.exists(path):
        return []
    with open(path) as f:
        return rows_of(json.load(f))


def save_store(path, rows):
    """書きかけを読まれないよう、隣に書いてから置き換える。中身は持ち主だけが読める"""
    os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
    tmp = f"{path}.tmp.{os.getpid()}"
    with open(tmp, "w") as f:
        json.dump({"format": STORE_FORMAT, "updated_at": _iso(time.time()), "rows": rows}, f, ensure_ascii=False)
    os.chmod(tmp, 0o600)
    os.replace(tmp, path)


def check_rows(rows):
    """BigQuery に入れる前に形を見る（Actions の入口。届いたものを信じない）"""
    seen = set()
    for i, r in enumerate(rows):
        if not isinstance(r, dict) or set(r) != set(TYPES):
            raise ValueError(f"{i}行目: 列が違う")
        if r["platform"] not in ("youtube", "tiktok") or not VIDEO_ID.match(str(r["video_id"])):
            raise ValueError(f"{i}行目: platform か video_id の形が違う")
        if r["checkpoint"] not in CHECKPOINT_NAMES:
            raise ValueError(f"{i}行目: 知らない時点")
        if not isinstance(r["provisional"], bool):
            raise ValueError(f"{i}行目: provisional が真偽でない")
        for c, t in COLUMNS:
            v = r[c]
            if v is None or t in ("STRING", "TIMESTAMP", "BOOL"):
                continue
            if t.startswith("ARRAY<STRUCT"):
                if not all(isinstance(x, (list, tuple)) and len(x) == 2 for x in v):
                    raise ValueError(f"{i}行目: {c} の形が違う")
            elif t.startswith("ARRAY<"):
                if not all(isinstance(x, (int, float)) and not isinstance(x, bool) for x in v):
                    raise ValueError(f"{i}行目: {c} に数でないもの")
            elif not isinstance(v, (int, float)) or isinstance(v, bool):
                raise ValueError(f"{i}行目: {c} が数でない")
        k = row_key(r)
        if k in seen:
            raise ValueError(f"{i}行目: 同じ鍵が2行")
        seen.add(k)
    return rows


# ---- SQL ----

def _q(s):
    return "'" + str(s).replace("\\", "\\\\").replace("'", "\\'").replace("\n", "\\n") + "'"


def _num(x):
    x = float(x)
    if x != x or x in (float("inf"), float("-inf")):
        raise ValueError(f"数でない値: {x}")
    return repr(round(x, 4))


def lit(value, typ):
    """値 → 型つきの配列（ARRAY<STRUCT<…>>）の中の1つの字。型は外側に1回だけ書くので、ここでは値だけ
    （行ごとに型を繰り返さないので、MERGE の字が短く済む）"""
    if typ.startswith("ARRAY<STRUCT"):
        return "[" + ",".join(f"({_q(m)},{_q(r)})" for m, r in (value or [])) + "]"
    if typ.startswith("ARRAY<"):
        return "[" + ",".join(_num(x) for x in (value or [])) + "]"
    if value is None:
        return "NULL"
    if typ in ("STRING", "TIMESTAMP"):
        return _q(value)
    if typ == "BOOL":
        return "TRUE" if value else "FALSE"
    if typ == "INT64":
        return str(int(value))
    return _num(value)


def create_sql(table=BQ_TABLE):
    cols = ",\n  ".join(f"{c} {t}" for c, t in COLUMNS)
    return (f"CREATE TABLE IF NOT EXISTS `{table}` (\n  {cols}\n)\n"
            "OPTIONS (description = 'ショートの公開後の数字（Studio から読んだもの）。鍵は platform, video_id, checkpoint。"
            "入れるのは .github/workflows/shorts_metrics.yml（tools/shorts/metrics/）。#921');")


def merge_sql(rows, table=BQ_TABLE):
    if not rows:
        return ""
    keys = [row_key(r) for r in rows]
    if len(set(keys)) != len(keys):
        # MERGE の元に同じ鍵が2行あると、BigQuery は落ちる（どちらで上書きするか決まらない）
        raise ValueError("同じ鍵の行が2つある")
    typ = "ARRAY<STRUCT<" + ", ".join(f"{c} {t}" for c, t in COLUMNS) + ">>"
    tuples = ["(" + ",".join(lit(r[c], t) for c, t in COLUMNS) + ")" for r in rows]
    on = " AND ".join(f"T.{k} = S.{k}" for k in KEY)
    upd = ", ".join(f"{c} = S.{c}" for c, _ in COLUMNS if c not in KEY)
    cols = ", ".join(c for c, _ in COLUMNS)
    vals = ", ".join(f"S.{c}" for c, _ in COLUMNS)
    # 確定した行（provisional = FALSE）は上書きしない。仮の行と lifetime の行だけ取り直す
    return (f"MERGE `{table}` T\nUSING (SELECT * FROM UNNEST({typ}[\n" + ",\n".join(tuples) + "\n])) S\n"
            f"ON {on}\nWHEN MATCHED AND T.provisional THEN UPDATE SET {upd}\n"
            f"WHEN NOT MATCHED THEN INSERT ({cols}) VALUES ({vals});")


def merge_sqls(rows, table=BQ_TABLE, per=MERGE_ROWS):
    """MERGE を MERGE_ROWS 行ずつに切る（元が鍵ごとに1行なので、切れ目をまたいで鍵は重ならない）"""
    return [merge_sql(rows[i:i + per], table) for i in range(0, len(rows), per)]


def count_sql(table=BQ_TABLE):
    return f"SELECT checkpoint, COUNT(*) AS n FROM `{table}` GROUP BY checkpoint"


def table_counts(client, table=BQ_TABLE):
    got = {r["checkpoint"]: int(r["n"]) for r in client.query(count_sql(table)).result()}
    return {cp: got.get(cp, 0) for cp in CHECKPOINT_NAMES}


def load_rows(client, rows, table=BQ_TABLE):
    """表を作り（無ければ）、MERGE で入れ、入れる前と後の時点ごとの行の数を返す。数字そのものは返さない。
    呼ぶのは Actions（serve.py）だけ。この箱には BigQuery に書く資格情報が無く、書かない決まり"""
    check_rows(rows)
    client.query(create_sql(table)).result()
    before = table_counts(client, table)
    for sql in merge_sqls(rows, table):
        client.query(sql).result()
    return {"before": before, "after": table_counts(client, table)}


def summary_sql(table=BQ_TABLE):
    """動画 × 時点ごとの、中央値との比。公開側に書いてよいのはこの比だけ（生の数は書かない）"""
    b = BASELINE
    return f"""SELECT plan, video_id, checkpoint, provisional,
  ROUND(stayed_to_watch_pct / {b['stayed_to_watch_pct']}, 2) AS stayed_x,
  ROUND(SAFE_DIVIDE(views, CASE checkpoint WHEN '24h' THEN {b['views_24h']} WHEN '7d' THEN {b['views_7d']} END), 2) AS views_x,
  ROUND(SAFE_DIVIDE(engaged_views, CASE checkpoint WHEN '24h' THEN {b['engaged_views_24h']} WHEN '7d' THEN {b['engaged_views_7d']} END), 2) AS engaged_x,
  ROUND(avg_view_duration_s / {b['avg_view_duration_s']}, 2) AS avg_view_x,
  ROUND(keep_3to8_pct / {b['keep_3to8_pct']}, 2) AS keep_3to8_x,
  ROUND(duration_s, 0) AS duration_s,
  ARRAY_LENGTH(missing) AS n_missing
FROM `{table}`
WHERE platform = 'youtube'
ORDER BY published_at, video_id, IFNULL(checkpoint_hours, 99999)"""


# ---- EC2 の上（remote） ----

def cmd_remote(a):
    """EC2 の上で: Studio を読む → 生の返事を raw/ に → 行を EC2 の JSON にまとめる。標準出力は件数だけ"""
    sys.path.insert(0, CDP)
    plans = json.load(open(a.plans))
    rows = load_store(a.store)
    from yt_studio import api, studio, url_of
    t = studio(url_of("videos/short"), wait=6)
    if "accounts.google.com" in t.url():
        print('RESULT {"ok": false, "error": "login_redirect"}')
        return 3
    try:
        res = sm.collect(lambda ep, body: api(t, ep, body), list(plans), skip=confirmed(rows))
    except Exception as e:
        print("RESULT " + json.dumps({"ok": False, "error": str(e)[:300]}, ensure_ascii=False))
        return 4
    raw_dir = os.path.join(os.path.dirname(os.path.abspath(a.store)), "raw")
    os.makedirs(raw_dir, exist_ok=True)
    raw = os.path.join(raw_dir, time.strftime("studio_%Y%m%dT%H%M%SZ.json", time.gmtime(res["fetched_at"])))
    with open(raw, "w") as f:
        json.dump(res, f, ensure_ascii=False)
    os.chmod(raw, 0o600)
    merged, st = merge_rows(rows, build_rows(res, plans))
    save_store(a.store, merged)
    pub = [v for v in res["videos"] if v["status"] == "public"]
    print("RESULT " + json.dumps({
        "ok": True, "store": a.store, "raw": raw, "asked": len(res["videos"]), "public": len(pub),
        "points_fetched": sum(len(v.get("points", [])) for v in pub),
        "points_kept": sum(len(v.get("kept", [])) for v in pub),
        "point_errors": sum(1 for v in pub for p in v.get("points", []) if p.get("error")),
        "skipped": skipped(res), "merge": st, "counts": counts(merged)}, ensure_ascii=False))
    return 0


# ---- 手元: collect ----

def _ec2():
    sys.path.insert(0, os.path.join(ROOT, ".claude", "skills", "ec2-chrome"))
    import ec2
    return ec2


def _result(out):
    res = [ln[7:] for ln in out.splitlines() if ln.startswith("RESULT ")]
    return json.loads(res[-1]) if res else None


def remote_sh(plans, timeout):
    """EC2 で回す sh。台帳から引いた {動画ID: 企画} だけを渡す（リポジトリの公開物と同じ中身）"""
    plans_json = json.dumps(plans, ensure_ascii=False)
    if "PLANS_EOF" in plans_json:
        raise ValueError("台帳に PLANS_EOF の字がある")
    return (f"mkdir -p {REMOTE_DIR} && chmod 700 {REMOTE_DIR} && cat > {REMOTE_DIR}/plans.json <<'PLANS_EOF'\n"
            f"{plans_json}\nPLANS_EOF\n"
            f"cd {CDP} && timeout {timeout - 60} python3 shorts_metrics.py remote --plans {REMOTE_DIR}/plans.json "
            f"--store {STORE} 2>&1 | tail -5\n")


def collect_remote(plans, timeout=840):
    """EC2 の Chrome（列 ytstudio の札を持って）で Studio を読み、EC2 の JSON に貯める。戻り値は件数だけ"""
    ec2 = _ec2()
    sh = remote_sh(plans, timeout)
    with ec2.lease("ytstudio", who=f"shorts_metrics {ec2.default_who()}",
                   purpose="ショートの数字を Studio から読む（読むだけ・#921）"):
        ec2.put(os.path.join(ROOT, ".claude", "skills", "ec2-chrome", "cdp.py"), f"{CDP}/cdp.py")
        ec2.put(os.path.join(ROOT, ".claude", "skills", "youtube-studio", "yt_studio.py"), f"{CDP}/yt_studio.py")
        ec2.put(os.path.join(HERE, "studio_metrics.py"), f"{CDP}/studio_metrics.py")
        ec2.put(os.path.join(HERE, "shorts_metrics.py"), f"{CDP}/shorts_metrics.py")
        st, out = ec2.run(sh, timeout, quiet=True)
    r = _result(out)
    return r if r else {"ok": False, "error": f"結果の行が無い（ssm {st}）: {out.strip()[-300:]}"}


# ---- 手元: ship（Actions に BigQuery へ入れてもらう） ----

def _pubkey(priv):
    return subprocess.run(["openssl", "pkey", "-in", priv, "-pubout"], check=True, capture_output=True, text=True).stdout


def _open(br, decrypt, sha, rel, priv, work):
    """作業枝の暗号文を開く。開いた先（work の下）を返す"""
    with tempfile.TemporaryDirectory(dir=work) as td:
        d = br.extract(sha, rel, Path(td))
        ok, msg = decrypt.open_one(d, Path(priv), decrypt.pub_fp(Path(priv)), Path(work))
    if not ok:
        raise SystemExit(f"!! 開けない: {msg}")
    return os.path.join(work, rel[len("shorts/.work/"):])


def put_sh(url, path=STORE):
    """EC2 から署名付き URL へ JSON を PUT する sh。URL は EC2 の SSM のログに残る（寿命1時間・入れたら消す。
    ec2-chrome 4 の send.py と同じ扱い）。標準出力に出すのは HTTP の番号と大きさと sha256 だけ"""
    return (f"f={shlex.quote(path)}\n"
            "if [ ! -s \"$f\" ]; then echo 'PUTRESULT nofile'; exit 0; fi\n"
            "code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 300 -X PUT "
            f"-H 'Content-Type: application/json' --upload-file \"$f\" {shlex.quote(url)})\n"
            "echo \"PUTRESULT $code $(stat -c %s \"$f\") $(sha256sum \"$f\" | cut -c1-64)\"\n")


def ship(priv, work, branch=BRANCH, timeout=1800):
    """依頼を作業枝に積む → Actions が上げる URL を包んで置く → 開いて EC2 から PUT → Actions が BigQuery に入れる。
    戻り値は件数だけの dict"""
    sys.path.insert(0, os.path.join(ROOT, "tools", "shorts", "preview"))
    sys.path.insert(0, os.path.join(ROOT, "tools", "shorts", "ingest"))
    import branch as br
    import decrypt
    ec2 = _ec2()
    name = time.strftime("m%Y%m%dT%H%M%SZ", time.gmtime())
    nonce = secrets.token_hex(12)
    req = {"name": name, "pubkey": _pubkey(priv), "nonce": nonce}
    br.push_change(branch, {f"{REQ_DIR}{name}.json": (json.dumps(req, indent=1) + "\n").encode()}, [],
                   f"ショートの数字 {name} を BigQuery に入れてもらう\n\n"
                   "この箱からは BigQuery に書かないので、Actions に入れてもらう。依頼に置くのは名前・公開鍵・乱数だけ。")
    print(f"依頼を出した（{name}）。上げる URL を待つ", flush=True)
    rel_in = f"{WORK}/{name}/inbox"
    sha, man = br.wait_json(branch, f"{rel_in}/manifest.json", lambda d: d.get("nonce") == nonce, timeout)
    if man.get("status") != "ok":
        raise SystemExit(f"!! Actions が上げる URL を作れなかった（{man.get('run')}）")
    put_file = os.path.join(_open(br, decrypt, sha, rel_in, priv, work), "put.json")
    url = json.load(open(put_file))["url"]
    os.remove(put_file)
    ec2.ensure_running()
    st, out = ec2.run(put_sh(url), 360, quiet=True)
    del url
    words = next((ln.split() for ln in out.splitlines() if ln.startswith("PUTRESULT")), ["PUTRESULT", "noresult"])
    print(f"EC2 から上げた: HTTP {words[1]}" + (f"（{words[2]}バイト・sha256 {words[3][:12]}…）" if len(words) >= 4 else ""),
          flush=True)
    if words[1] != "200":
        raise SystemExit(f"!! 上げられなかった（ssm {st}）。Actions は待ちきって落ちる")
    rel_done = f"{WORK}/{name}/done"
    sha, man = br.wait_json(branch, f"{rel_done}/manifest.json", lambda d: d.get("nonce") == nonce, timeout)
    res = json.load(open(os.path.join(_open(br, decrypt, sha, rel_done, priv, work), "result.json")))
    br.push_change(branch, {}, [f"{WORK}/{name}"], f"ショートの数字 {name} の暗号文を下ろす\n\n"
                   "結果は作業箱で開いて読み終えた。作業枝に溜めない。")
    if res.get("ok") and res.get("sha256") != words[3]:
        res["ok"] = False
        res["error"] = "EC2 で上げたものと Actions が入れたものの sha256 が違う"
    res["run"] = man.get("run")
    return res


# ---- 入口 ----

def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    sub = ap.add_subparsers(dest="cmd", required=True)
    p = sub.add_parser("plan")
    p.add_argument("--ledger", default=LEDGER)
    p = sub.add_parser("collect")
    p.add_argument("--ledger", default=LEDGER)
    p.add_argument("--timeout", type=int, default=840)
    p = sub.add_parser("remote", help="EC2 の上で回す（手元からは collect が呼ぶ）")
    p.add_argument("--plans", required=True)
    p.add_argument("--store", default=STORE)
    p = sub.add_parser("counts", help="JSON の行の数を時点ごとに（中身の数字は出さない）")
    p.add_argument("--store", default=STORE)
    p = sub.add_parser("ship")
    p.add_argument("--key", required=True, help="RSA 秘密鍵（PEM）。公開鍵を依頼に載せ、結果はこれで開く")
    p.add_argument("--work", required=True, help="結果を開く場所（リポジトリの外）")
    p.add_argument("--branch", default=BRANCH)
    p.add_argument("--timeout", type=float, default=1800)
    p = sub.add_parser("summary-sql")
    p.add_argument("--table", default=BQ_TABLE)
    a = ap.parse_args(argv)

    if a.cmd == "plan":
        plans = ledger_plans(a.ledger)
        print(json.dumps({"ids": list(plans), "n": len(plans)}, ensure_ascii=False))
        return 0
    if a.cmd == "collect":
        r = collect_remote(ledger_plans(a.ledger), a.timeout)
        print(json.dumps(r, ensure_ascii=False))
        return 0 if r.get("ok") else 1
    if a.cmd == "remote":
        return cmd_remote(a)
    if a.cmd == "counts":
        print(json.dumps(counts(load_store(a.store)), ensure_ascii=False))
        return 0
    if a.cmd == "ship":
        if not outside_repo(a.work):
            print(f"断った: {a.work} はリポジトリ（公開）の中。上げる URL を開くのはリポジトリの外", file=sys.stderr)
            return 2
        if not a.branch.startswith("claude/"):
            print("断った: 作業枝は claude/ で始まる名前にする", file=sys.stderr)
            return 2
        os.makedirs(a.work, exist_ok=True)
        r = ship(a.key, a.work, a.branch, a.timeout)
        print(json.dumps(r, ensure_ascii=False))
        return 0 if r.get("ok") else 1
    if a.cmd == "summary-sql":
        print(summary_sql(a.table))
        return 0
    return 2


if __name__ == "__main__":
    sys.exit(main())
