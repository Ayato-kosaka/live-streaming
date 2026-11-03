#!/usr/bin/env python3
"""ショートの数字取り（studio_metrics.py / shorts_metrics.py / serve.py）の見張り。ネットにも EC2 にも出ない。

偽の Studio（get_creator_videos と get_cards の返事を作る関数）で collect を回し、次を見る:

1. 時点の締切: 公開から h 時間たった瞬間から聞き、1秒前には聞かない。まだの時点を「その時点の値」として入れない
2. 仮と確定: 締切から48時間たつ前に取った行は仮（次の回で取り直す）、過ぎてからは確定
3. 公開していないもの（消した・予約中・非公開・一覧に無い）は聞かず、理由を残す
4. 期間は「公開から N 日」（count = 1/3/7/14）で聞く
5. 読む口しか送らない（書き込みの口は道具の側で断る）
6. 3→8秒の残りの計算（カーブの点は尺の 1%〜100%）
7. 取れなかった指標は NULL と理由で残り、0 で埋めない。維持率は時点の行に入らず、lifetime にだけ入る
8. 同じ鍵は1行。同じ結果を2回 MERGE の元にしても行が増えない（元の行に同じ鍵が出ない）
9. 字のエスケープ（題の札などに ' が入っても SQL が壊れない）
10. 開く置き場がリポジトリ（公開）の中なら断る
11. EC2 の JSON: 同じものを2回重ねても行が増えない・確定は上書きしない・仮は替える・要求の失敗で値を消さない・
    書いて読み直しても同じ
12. 確定した時点は Studio に聞き直さない（lifetime は毎回聞く）
13. Actions の入口: 列が違う・知らない時点・同じ鍵の行は BigQuery に入れる前に断る。MERGE は切っても行が減らない
14. 依頼の読みかた（名前・乱数・公開鍵）と、依頼の置き場だけを拾うこと（結果の置き場は拾わない）

    python3 tools/shorts/metrics/shorts_metrics_selftest.py
"""
import json, os, subprocess, sys, tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import studio_metrics as sm  # noqa: E402
import shorts_metrics as m  # noqa: E402

FAIL = []


def check(cond, what):
    print(("ok   " if cond else "FAIL ") + what)
    if not cond:
        FAIL.append(what)


H = 3600
PUB = 1_790_000_000           # 公開した瞬間（偽）


def fake_studio(videos, totals_for, curve=None, fail_count=None, log=None):
    """videos: get_creator_videos の videos。totals_for(vid, count) → {指標: 合計}"""
    def api(endpoint, body):
        if log is not None:
            log.append((endpoint, body))
        if endpoint == "creator/get_creator_videos":
            want = set(body["videoIds"])
            return {"videos": [v for v in videos if v["videoId"] in want]}
        if endpoint == "yta_web/get_cards":
            sc = body["screenConfig"]
            vid = sc["entity"]["videoId"]
            count = sc["timePeriod"].get("count")
            if fail_count is not None and count == fail_count:
                raise RuntimeError("yta_web/get_cards: HTTP 500: boom")
            tabs = [{"keyMetricTabs": [{"primaryContent": {"metric": k, "total": v,
                                                           "mainSeries": {"timeUnit": "TIME_PERIOD_UNIT_NTH_HOURS"}}}]}
                    for k, v in totals_for(vid, count).items()]
            cards = [{"keyMetricCardData": t} for t in tabs]
            if any("audienceRetentionHighlightsCardConfig" in c for c in body["cardConfigs"]) and curve:
                cards.append({"audienceRetentionHighlightsCardData": {"videosData": [
                    {"videoId": vid, "retentionValues": curve}]}})
            return {"cards": cards}
        raise AssertionError(f"偽の Studio に無い口: {endpoint}")
    return api


def pub_video(vid, pub=PUB, dur_ms=50_000):
    return {"videoId": vid, "privacy": "VIDEO_PRIVACY_PUBLIC", "timePublishedSeconds": str(pub),
            "videoDurationMs": str(dur_ms), "status": "VIDEO_STATUS_PROCESSED"}


def totals_all(vid, count):
    # 時点が進むほど増える値。count=None（全期間）はいちばん大きい。コメントは返事に無い（取れなかった扱い）
    n = {1: 100, 3: 130, 7: 150, 14: 160, None: 170}[count]
    return {"EXTERNAL_VIEWS": n, "ENGAGED_VIEWS": n // 2, "SHORTS_FEED_IMPRESSIONS_VTR": 40.0 + (count or 20) / 10,
            "AVERAGE_WATCH_TIME": 30500, "RATINGS_LIKES": 3, "SUBSCRIBERS_NET_CHANGE": 0, "SHARINGS": 0}


# ---- 1. 時点の締切 ----
check(sm.due(PUB, PUB + 24 * H - 1) == [], "公開から 24時間の1秒前は、どの時点も聞かない")
check([c for c, _ in sm.due(PUB, PUB + 24 * H)] == ["24h"], "ちょうど24時間で 24h を聞く")
check([c for c, _ in sm.due(PUB, PUB + 72 * H - 1)] == ["24h"], "72時間の1秒前は 24h だけ")
check([c for c, _ in sm.due(PUB, PUB + 168 * H)] == ["24h", "72h", "7d"], "7日ちょうどで 7d まで")
check([c for c, _ in sm.due(PUB, PUB + 336 * H - 1)] == ["24h", "72h", "7d"], "14日の1秒前は 14d を聞かない")
check([c for c, _ in sm.due(PUB, PUB + 400 * H)] == ["24h", "72h", "7d", "14d"], "14日を過ぎれば4時点")

# ---- 2. 仮と確定 ----
check(sm.provisional(PUB, 24, PUB + (24 + 48) * H - 1), "締切から48時間の1秒前に取った値は仮")
check(not sm.provisional(PUB, 24, PUB + (24 + 48) * H), "締切から48時間で確定")
check(sm.provisional(PUB, 336, PUB + 337 * H), "14日の1時間後に取った値は仮")

# ---- 3〜5. collect: 聞く動画・聞く期間・口 ----
videos = [pub_video("PUB_A"),
          {"videoId": "DEL_B", "status": "VIDEO_STATUS_DELETED"},
          {"videoId": "SCH_C", "privacy": "VIDEO_PRIVACY_PRIVATE", "timePublishedSeconds": "0",
           "status": "VIDEO_STATUS_PROCESSED",
           "scheduledPublishingDetails": {"scheduledPublishings": [
               {"scheduledTimeSeconds": str(PUB + 999 * H), "action": "SCHEDULED_PUBLISHING_ACTION_SET_PUBLIC"}]}},
          {"videoId": "PRV_D", "privacy": "VIDEO_PRIVACY_PRIVATE", "timePublishedSeconds": "0",
           "status": "VIDEO_STATUS_PROCESSED"}]
log = []
curve = [130.0 - i for i in range(100)]   # 尺の 1%〜100% の点
now = PUB + 100 * H                       # 24h と 72h だけ過ぎている
res = sm.collect(fake_studio(videos, totals_all, curve=curve, log=log), ["PUB_A", "DEL_B", "SCH_C", "PRV_D", "GONE_E"],
                 now_s=now, sleep=0)
st = {v["video_id"]: v for v in res["videos"]}
check(st["PUB_A"]["status"] == "public", "公開した動画は聞く")
check(st["DEL_B"]["status"] == "skip" and "消して" in st["DEL_B"]["reason"], "消した動画は聞かず、理由を残す")
check(st["SCH_C"]["status"] == "skip" and "予約中" in st["SCH_C"]["reason"], "予約中は聞かず、理由を残す")
check(st["PRV_D"]["status"] == "skip" and st["PRV_D"]["reason"] == "非公開", "非公開は聞かない")
check(st["GONE_E"]["status"] == "skip" and "一覧に無い" in st["GONE_E"]["reason"], "Studio に無い ID は理由つきで外す")
counts = [b["screenConfig"]["timePeriod"].get("count") for ep, b in log if ep == "yta_web/get_cards"]
check(counts == [1, 3, None], f"過ぎた時点（count 1, 3）と全期間だけを聞く（実際: {counts}）")
check(all(b["screenConfig"]["timePeriod"].get("unit", "TIME_PERIOD_UNIT_NTH_DAYS") == "TIME_PERIOD_UNIT_NTH_DAYS"
          for ep, b in log if ep == "yta_web/get_cards"), "期間は公開からの日数（NTH_DAYS）で区切る")
check({ep for ep, _ in log} <= sm.READ_ONLY, "送ったのは読む口だけ")
try:
    sm.guarded(lambda e, b: {})("video_editor/edit_video", {})
    check(False, "書き込みの口は道具の側で断る")
except PermissionError:
    check(True, "書き込みの口は道具の側で断る")

# ---- 6. 3→8秒の残り ----
# 尺 50秒: 3秒 = 6% の点（i=5）、8秒 = 16% の点（i=15）。頭 = 130
ret, why = sm.retention_summary(curve, 50.0)
check(why is None and ret["keep_3to8_pct"] == round(100 * 115 / 125, 2),
      f"3→8秒の残り = 8秒 ÷ 3秒 × 100（実際: {ret}）")
check(ret["ret_norm_3s"] == round(100 * 125 / 130, 2), "3秒の値は頭を100に直す")
check(sm.retention_summary(None, 50)[1] == "維持率カーブがまだ出ていない", "カーブが無ければ理由を残す")
check(sm.retention_summary(curve, 6.0)[1] == "尺が8秒より短い", "8秒より短い尺は出さない")

# ---- 7. 行: 取れなかったものは NULL と理由 ----
plans = {"PUB_A": "vid/p1"}
rows = m.build_rows(res, plans)
by = {r["checkpoint"]: r for r in rows}
check(sorted(by) == ["24h", "72h", "lifetime"], f"過ぎた2時点と lifetime の3行（実際: {sorted(by)}）")
r24 = by["24h"]
check(r24["views"] == 100 and r24["engaged_views"] == 50, "時点の行には、その期間の値が入る")
check(r24["avg_view_duration_s"] == 30.5, "平均視聴時間はミリ秒から秒に直す")
check(r24["comments"] is None and ("comments", "Studio の返事に無かった") in r24["missing"],
      "返事に無い指標は NULL と理由で残す（0 で埋めない）")
check(r24["keep_3to8_pct"] is None and ("keep_3to8_pct", m.NO_PERIOD) in r24["missing"],
      "維持率は時点の行に入れない（期間で切れない）")
check(by["lifetime"]["keep_3to8_pct"] == ret["keep_3to8_pct"], "維持率は lifetime の行にだけ入る")
# 取ったのは公開から100時間: 24h の締切から76時間（確定）、72h の締切から28時間（仮）
check(not r24["provisional"] and by["72h"]["provisional"], "締切から48時間たって取った行は確定、たたずに取った行は仮")
check(by["lifetime"]["provisional"], "lifetime の行は毎回取り直す")
check(r24["checkpoint_at"] == m._iso(PUB + 24 * H) and r24["plan"] == "vid/p1", "締切の時刻と plan が入る")
check(all(r["video_id"] == "PUB_A" for r in rows), "公開していない動画の行は作らない")

# 1時点の要求が失敗したとき: 行は理由つきで入り、仮のまま（次の回で取り直す）
res_fail = sm.collect(fake_studio([pub_video("PUB_A", pub=PUB - 1000 * H)], totals_all, curve=curve, fail_count=3),
                      ["PUB_A"], now_s=now, sleep=0)
rf = {r["checkpoint"]: r for r in m.build_rows(res_fail, plans)}
check(rf["72h"]["views"] is None and rf["72h"]["provisional"]
      and any("失敗" in why for _, why in rf["72h"]["missing"]),
      "失敗した時点は NULL・理由つき・仮（48時間を過ぎていても）")
check(not rf["24h"]["provisional"], "ほかの時点は確定のまま")

# ---- 8. 鍵は1行・MERGE ----
sql = m.merge_sql(rows)
check("ON T.platform = S.platform AND T.video_id = S.video_id AND T.checkpoint = S.checkpoint" in sql,
      "MERGE の鍵は platform, video_id, checkpoint")
check("WHEN MATCHED AND T.provisional THEN UPDATE" in sql, "確定した行は上書きしない（仮の行だけ取り直す）")
check(sql.count("\n('youtube',") == len(rows), "元の行の数 = 行の数")
twice = m.build_rows({"fetched_at": res["fetched_at"], "videos": res["videos"] + res["videos"]}, plans)
check(len(twice) == len(rows), "同じ動画が結果に2回あっても、鍵ごとに1行")
try:
    m.merge_sql(rows + rows)
    check(False, "同じ鍵の行が2つあれば SQL を出さない")
except ValueError:
    check(True, "同じ鍵の行が2つあれば SQL を出さない")

# ---- 9. エスケープ ----
check(m.lit("it's \\ ok", "STRING") == "'it\\'s \\\\ ok'", "' と \\ をエスケープする")
check(m.lit(None, "INT64") == "NULL" and m.lit([], "ARRAY<FLOAT64>") == "[]", "NULL と空の配列")
check(m.lit([("a", "b")], "ARRAY<STRUCT<metric STRING, reason STRING>>") == "[('a','b')]", "missing の配列")

# ---- 10. 置き場の守り ----
check(not m.outside_repo(os.path.join(m.ROOT, "tools", "shorts", "metrics", "out")), "リポジトリの中は断る")
check(m.outside_repo(tempfile.gettempdir()), "リポジトリの外は通す")
check(m.main(["ship", "--key", "x.pem", "--work", os.path.join(m.ROOT, "x_metrics_out")]) == 2,
      "ship はリポジトリの中を指されたら 2 で帰る（URL を開く場所）")
check(not os.path.exists(os.path.join(m.ROOT, "x_metrics_out")), "断ったときは置き場を作らない")

# ---- 11. EC2 の JSON ----
store, st = m.merge_rows([], rows)
check(st == {"added": len(rows), "replaced": 0, "kept": 0}, f"空に重ねると全部足す（実際: {st}）")
again, st2 = m.merge_rows(store, m.build_rows(res, plans))
check(len(again) == len(store), "同じ結果をもう一度重ねても行が増えない")
check(st2 == {"added": 0, "replaced": 2, "kept": 1},
      f"確定の 24h は残し、仮の 72h と lifetime は替える（実際: {st2}）")
# 確定した行は、違う値が来ても上書きしない
changed = [dict(r, views=999) for r in m.build_rows(res, plans)]
kept, _ = m.merge_rows(store, changed)
kb = {r["checkpoint"]: r for r in kept}
check(kb["24h"]["views"] == 100 and kb["72h"]["views"] == 999, "確定の行は上書きせず、仮の行は新しい値に替える")
# 仮の行に、要求が落ちた行が来ても前の値を残す
fail_rows = m.build_rows(res_fail, plans)   # 72h が落ちた結果
after_fail, st3 = m.merge_rows(store, fail_rows)
af = {r["checkpoint"]: r for r in after_fail}
check(af["72h"]["views"] == by["72h"]["views"] and st3["kept"] >= 1,
      "要求が落ちた行では、前に取れた値を NULL で消さない")
fresh, _ = m.merge_rows([], fail_rows)
check({r["checkpoint"]: r for r in fresh}["72h"]["views"] is None, "前が無ければ、落ちた行も理由つきで入る")
with tempfile.TemporaryDirectory() as td:
    p = os.path.join(td, "sm", "rows.json")
    check(m.load_store(p) == [], "JSON がまだ無ければ空から始める")
    m.save_store(p, store)
    back = m.load_store(p)
    check(back == json.loads(json.dumps(store)), "書いて読み直しても同じ行")
    check(oct(os.stat(p).st_mode & 0o777) == "0o600", "JSON は持ち主だけが読める")
    m.save_store(p, m.merge_rows(back, m.build_rows(res, plans))[0])
    check(len(m.load_store(p)) == len(store), "書いた JSON に同じものをもう一度重ねても行が増えない")
    check(not [f for f in os.listdir(os.path.dirname(p)) if ".tmp." in f], "書きかけのファイルを残さない")
c = m.counts(store)
check(c["by_checkpoint"] == {"24h": 1, "72h": 1, "7d": 0, "14d": 0, "lifetime": 1} and c["videos"] == 1,
      f"時点ごとの数（実際: {c['by_checkpoint']}）")
check(set(c) == {"by_checkpoint", "rows", "videos", "provisional", "with_missing"}
      and all(type(v) is int for v in list(c["by_checkpoint"].values()) + [c[k] for k in c if k != "by_checkpoint"]),
      "数え上げは行の数だけ（列の値は1つも載らない）")

# ---- 12. 確定した時点は聞き直さない ----
log2 = []
res2 = sm.collect(fake_studio(videos, totals_all, curve=curve, log=log2), ["PUB_A"], now_s=now, sleep=0,
                  skip=m.confirmed(store))
asked = [b["screenConfig"]["timePeriod"].get("count") for ep, b in log2 if ep == "yta_web/get_cards"]
check(asked == [3, None], f"確定の 24h は聞かず、仮の 72h と全期間だけ聞く（実際: {asked}）")
check(res2["videos"][0]["kept"] == ["24h"], "聞かなかった時点を控える")
skipped_merge, st4 = m.merge_rows(store, m.build_rows(res2, plans))
check(len(skipped_merge) == len(store) and st4["added"] == 0, "聞かなかった時点の行は JSON に残る")
check(m.confirmed(store) == {("PUB_A", "24h")}, "lifetime と仮の行は「確定」に数えない")

# ---- 13. Actions の入口: 入れる前に形を見る ----
check(m.check_rows(store) is store, "build_rows の行はそのまま通る")
for bad, why in ((dict(store[0], extra=1), "列が多い"), ({k: v for k, v in store[0].items() if k != "views"}, "列が欠けた"),
                 (dict(store[0], checkpoint="30d"), "知らない時点"), (dict(store[0], video_id="../x"), "動画 ID の形"),
                 (dict(store[0], views="100"), "数でない値"), (dict(store[0], provisional=1), "真偽でない provisional")):
    try:
        m.check_rows([bad])
        check(False, f"断る: {why}")
    except ValueError:
        check(True, f"断る: {why}")
try:
    m.check_rows(store + store[:1])
    check(False, "同じ鍵の行が2つあれば断る")
except ValueError:
    check(True, "同じ鍵の行が2つあれば断る")
try:
    m.rows_of({"format": "x", "rows": []})
    check(False, "知らない形の JSON は断る")
except ValueError:
    check(True, "知らない形の JSON は断る")
many = [dict(store[0], video_id=f"VID{i:05d}") for i in range(m.MERGE_ROWS * 2 + 5)]
parts = m.merge_sqls(many)
check(len(parts) == 3 and sum(s.count("\n('youtube',") for s in parts) == len(many),
      f"MERGE は {m.MERGE_ROWS}行ずつに切り、行は1つも落とさない")


class FakeBQ:
    """load_rows が投げる SQL の並びだけを見る（BigQuery に出ない）"""
    def __init__(self):
        self.sqls = []

    def query(self, sql):
        self.sqls.append(sql)
        rows = [{"checkpoint": "24h", "n": 1}] if sql.startswith("SELECT checkpoint") else []
        return type("J", (), {"result": lambda _s: rows})()


fb = FakeBQ()
got = m.load_rows(fb, store)
kinds = [s.split()[0] for s in fb.sqls]
check(kinds == ["CREATE", "SELECT", "MERGE", "SELECT"], f"表を作る → 数える → MERGE → 数える（実際: {kinds}）")
check(set(got) == {"before", "after"} and got["after"]["24h"] == 1 and got["after"]["14d"] == 0,
      "返すのは時点ごとの行の数だけ")
fb2 = FakeBQ()
try:
    m.load_rows(fb2, [dict(store[0], extra=1)])
    check(False, "形の違う行は BigQuery に1本も送らずに断る")
except ValueError:
    check(fb2.sqls == [], "形の違う行は BigQuery に1本も送らずに断る")

# ---- 14. 依頼 ----
import serve  # noqa: E402

check(serve.request_files(["shorts/metrics/m1.json", "shorts/metrics/sub/x.json", "shorts/.work/metrics/m1/inbox/manifest.json",
                           "shorts/upload/m1.json", "shorts/metrics/m1.txt"]) == ["shorts/metrics/m1.json"],
      "拾うのは shorts/metrics/ の直下の .json だけ")
with tempfile.TemporaryDirectory() as td:
    key = os.path.join(td, "k.pem")
    subprocess.run(["openssl", "genpkey", "-algorithm", "RSA", "-pkeyopt", "rsa_keygen_bits:2048", "-out", key],
                   check=True, capture_output=True)
    pub = subprocess.run(["openssl", "pkey", "-in", key, "-pubout"], check=True, capture_output=True, text=True).stdout
ok_req = serve.read_request({"name": "m20261103T160000Z", "pubkey": pub.replace("\n", " "), "nonce": "abcdef0123456789"}, "t")
check(ok_req["pubkey"].startswith("-----BEGIN PUBLIC KEY-----\n") and len(ok_req["pubkey_sha256"]) == 64,
      "1行に化けた公開鍵も読み直す")
for bad, why in (({"name": "../x", "pubkey": pub, "nonce": "abcdef0123456789"}, "名前に .."),
                 ({"name": "m1", "pubkey": pub, "nonce": "short"}, "短い乱数"),
                 ({"name": "m1", "pubkey": "", "nonce": "abcdef0123456789"}, "公開鍵が無い")):
    try:
        serve.read_request(bad, "t")
        check(False, f"依頼を断る: {why}")
    except serve.Bad:
        check(True, f"依頼を断る: {why}")
up = json.dumps({"format": m.STORE_FORMAT, "rows": store}).encode()
check(len(serve.parse_upload(up)) == len(store), "上がってきた JSON から行を読む")
try:
    serve.parse_upload(b"x" * (serve.MAX_BYTES + 1))
    check(False, "大きすぎるものは読まない")
except serve.Bad:
    check(True, "大きすぎるものは読まない")
sh = m.put_sh("https://example.invalid/u?X-Goog-Signature=abc'def")
check("'https://example.invalid/u?X-Goog-Signature=abc'\"'\"'def'" in sh and "echo \"PUTRESULT $code" in sh,
      "PUT の sh は URL を引用符で囲み、出すのは番号と大きさと sha256 だけ")
check("set -x" not in sh and sh.count("$URL") == 0, "PUT の sh は URL を標準出力に出さない")
rs = m.remote_sh({"PUB_A": "vid/p1"}, 840)
check("timeout 780 python3 shorts_metrics.py remote" in rs and f"--store {m.STORE}" in rs,
      "EC2 では remote を、ssm の切れより前に切れる timeout で回す")

print()
if FAIL:
    print(f"{len(FAIL)} 件落ちた")
    sys.exit(1)
print("ぜんぶ通った")
