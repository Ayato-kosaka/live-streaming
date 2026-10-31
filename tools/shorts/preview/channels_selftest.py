"""**下見のチャンネルの片づけ（`channels.py`）の見張り。Hosting には1度も触らない。**

    python3 tools/shorts/preview/channels_selftest.py

終了コード 0=通った / 1=落ちた / **2=数えるものが無い**（`docs/island-standards.md` §15）。
回し役（`python/selftest_runner.py`）が `tools/shorts/` を降りて拾う。要るのは Python だけ。

## 何を見るか

2026-10-31 に、版ごとに作ったチャンネルが上限（下見 50本）に当たり、両方の道で配りが続けて落ちた。
片づけは「消しすぎ」と「消さなすぎ」の両方が壊れうる。消さなすぎると同じ日にまた上限に当たる。
消しすぎると、**あやとが見ている最新の版**や本番（live）が消える。だから両方を足にする。
一覧・札・消すは偽の API（手元の表）で回す。

| 足 | 確かめること |
| --- | --- |
| `names` | 名前から回・版・種類を読む（`edinburgh-p2B-v8` は版8、`-v4d1` `-d2` は下書き、形の違うものは other） |
| `expires` | 下書きは1日、ほかは7日で置く |
| `supersede_rules` | 同じ回の版が以下なら置き換える。違う回・新しい版・other・下書きが本番の版を、は置き換えない |
| `dead_only_expired` | 期限切れは下見の形のものだけ。期限前・本番（live）・形の違うものは数えない |
| `room_below_cap` | 上限まで余裕があれば、下書きも古い版も消さない |
| `room_order` | 上限が近いと、下書き → 古い版の順に古いものから、要る数だけ選ぶ。最新の版・札なし・live は選ばない |
| `retire_older_only` | 配った版は、同じ回の前に作った古い版だけを消す。違う回・新しい版・札なしは残す |
| `retire_twins` | 同じ版を2本同時に配っても、互いに消し合って両方消える、にならない（後から作ったほうが残る） |
| `tidy_fake_api` | 配る前の片づけ: 期限切れはいつも消し、上限が近いときだけ下書きを消す。1本消せなくても続ける |
| `delete_guard` | `Api.delete` は live と形の違う名前を、偽の通信に1本も送らずに断る。札も同じ |
| `redact` | 落ちた理由の字から URL・チャンネル名・アカウント・トークン・鍵・長い字を伏せ、理由（429・quota）は残す |
| `error_of_json` | firebase-tools の `--json` の error と、stderr の要る行を拾う |
| `census_counts` | 数（全部・下見・ほか・期限切れ）を数え、名前と URL を出さない |
"""

from __future__ import annotations

import datetime as dt
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import channels as ch  # noqa: E402

NOW = dt.datetime(2026, 10, 31, 3, 0, tzinfo=dt.timezone.utc)
FAILS: list[str] = []


def check(leg: str, cond: bool, what: str) -> None:
    if not cond:
        FAILS.append(f"{leg}: {what}")


def t(h: float) -> str:
    """NOW から h 時間ずらした時刻（Hosting と同じナノ秒つきの字）。"""
    return (NOW + dt.timedelta(hours=h)).strftime("%Y-%m-%dT%H:%M:%S.123456789Z")


def chan(i: int, name: str | None, made_h: float, life_h: float = 24 * 7, cid: str | None = None) -> dict:
    c = cid or f"sp-{i:020x}"
    d = {"name": f"sites/{ch.SITE}/channels/{c}", "url": f"https://{ch.SITE}--{c}-abcd1234.web.app",
         "createTime": t(made_h), "expireTime": t(made_h + life_h)}
    if name:
        d["labels"] = ch.labels_for(name)
    return d


LIVE = {"name": f"sites/{ch.SITE}/channels/live", "url": f"https://{ch.SITE}.web.app",
        "createTime": "2025-02-07T11:39:00Z"}


class FakeApi:
    def __init__(self, chans: list[dict], refuse: set[str] = frozenset()):
        self.chans = [dict(c) for c in chans]
        self.deleted: list[str] = []
        self.refuse = set(refuse)

    def list(self) -> list[dict]:
        return [dict(c) for c in self.chans]

    def delete(self, c: str) -> None:
        if c in self.refuse:
            raise RuntimeError("断られた")
        self.deleted.append(c)
        self.chans = [x for x in self.chans if ch.cid(x) != c]

    def label(self, c: str, labels: dict) -> None:
        for x in self.chans:
            if ch.cid(x) == c:
                x["labels"] = dict(labels)


def leg_names() -> None:
    cases = {"edinburgh-p2B-v8": ("edinburgh-p2B", 8, "final"),
             "edinburgh-p2B-v8g": ("edinburgh-p2B", 8, "final"),
             "edinburgh-p2-v4d1": ("edinburgh-p2", 4, "draft"),
             "leeds-p3-v1d1": ("leeds-p3", 1, "draft"),
             "edinburgh-p2B-d2": ("edinburgh-p2B", 0, "draft"),
             "york-p2-v12": ("york-p2", 12, "final"),
             "yk-tempo-1": ("yk-tempo-1", 0, "other"),
             "hc-p2b": ("hc-p2b", 0, "other")}
    for n, (b, v, k) in cases.items():
        p = ch.parse_name(n)
        check("names", (p["base"], p["ver"], p["kind"]) == (b, v, k), f"{n} → {p}")
    lab = ch.labels_for("Edinburgh-p2B-v8")
    check("names", lab == {ch.L_NAME: "edinburgh-p2b-v8", ch.L_BASE: "edinburgh-p2b", ch.L_VER: "8",
                           ch.L_KIND: "final"}, f"札 {lab}")
    check("names", ch.slug("a.b C/" + "x" * 80) == "a_b_c_" + "x" * 57, f"札の字の整えかた: {ch.slug('a.b C/')}")


def leg_expires() -> None:
    check("expires", ch.expires_for("leeds-p3-v1d1") == "1d", "下書きが1日でない")
    check("expires", ch.expires_for("edinburgh-p2B-d2") == "1d", "版の無い下書きが1日でない")
    check("expires", ch.expires_for("york-p2-v6") == "7d", "本番の版が7日でない")
    check("expires", ch.expires_for("yk-tempo-1") == "7d", "形の違う名前が7日でない")


def leg_supersede_rules() -> None:
    L = ch.labels_for
    yes = [("york-p2-v7", "york-p2-v6"), ("york-p2-v6", "york-p2-v6"), ("york-p2-v7", "york-p2-v6d1"),
           ("york-p2-v7", "york-p2-d2"), ("york-p2-v4d2", "york-p2-v4d1")]
    no = [("york-p2-v6", "york-p2-v7"), ("york-p2-v7", "edinburgh-p2A-v4"),
          ("edinburgh-p2B-v9", "edinburgh-p2A-v4"), ("york-p2-v7d1", "york-p2-v6"),
          ("yk-tempo-2", "yk-tempo-1"), ("york-p2-v7", "york-p2"), ("york-p2-v4d1", "york-p2-v5d1")]
    for new, old in yes:
        check("supersede_rules", ch.supersedes(L(new), L(old)), f"{new} が {old} を置き換えない")
    for new, old in no:
        check("supersede_rules", not ch.supersedes(L(new), L(old)), f"{new} が {old} を置き換えた")
    check("supersede_rules", not ch.supersedes(L("york-p2-v7"), {}), "札の無いものを置き換えた")
    check("supersede_rules", not ch.supersedes({}, {}), "札が無いもの同士で置き換えた")
    bad = dict(L("york-p2-v5"), **{ch.L_VER: "x"})
    check("supersede_rules", not ch.supersedes(L("york-p2-v7"), bad), "版が数でない札を置き換えた")


def leg_dead_only_expired() -> None:
    gone = chan(1, "a-v1", -24 * 8)          # 1日前に期限切れ
    edge = dict(chan(2, "a-v2", -24 * 7), expireTime=NOW.strftime("%Y-%m-%dT%H:%M:%SZ"))  # ちょうどいま期限
    alive = chan(3, "a-v3", -24 * 6)         # まだ1日ある
    other = chan(4, "a-v4", -24 * 8, cid="pr12-feature")
    live = dict(LIVE, expireTime=t(-100))
    got = {ch.cid(c) for c in ch.dead([gone, edge, alive, other, live], NOW)}
    check("dead_only_expired", got == {ch.cid(gone), ch.cid(edge)}, f"期限切れの選びかた: {sorted(got)}")
    check("dead_only_expired", ch.dead([chan(5, "a-v5", -1, life_h=0.5)], NOW) != [], "30分前に切れたものを数えない")
    check("dead_only_expired", ch.dead([dict(chan(6, "a-v6", -1), expireTime=None)], NOW) == [],
          "期限の無いものを期限切れにした")


def fill(n: int, start: int = 100) -> list[dict]:
    """最新の版だけを n 本（どれも違う回）。"""
    return [chan(start + i, f"ep{i}-p1-v1", -48 + i * 0.01) for i in range(n)]


def leg_room_below_cap() -> None:
    # 配ったあと（＋1本）の数が CAP - ROOM を超えないように選ぶ。消せるもの（下書き1・古い版1）は2本
    spare = [chan(1, "york-p2-v1d1", -5), chan(2, "york-p2-v1", -4), chan(3, "york-p2-v2", -3)]
    for n_before, want in ((ch.CAP - ch.ROOM - 1, 0), (ch.CAP - ch.ROOM, 1), (ch.CAP - ch.ROOM + 1, 2),
                           (ch.CAP + 3, 2)):
        chans = [LIVE] + fill(n_before - len(spare)) + spare
        got = len(ch.make_room(chans))
        check("room_below_cap", got == want, f"下見 {n_before}本のとき {got}本を選んだ（{want}本のはず）")
    check("room_below_cap", ch.make_room([LIVE] * 3) == [], "live だけで何か選んだ")
    check("room_below_cap", ch.make_room(fill(ch.CAP), cap=ch.CAP * 2) == [], "上限を渡しても既定の上限で数えた")


def leg_room_order() -> None:
    d_old = chan(1, "york-p2-v1d1", -50)
    d_new = chan(2, "leeds-p3-v1d1", -10)
    v1 = chan(3, "york-p2-v1", -40)
    v2 = chan(4, "york-p2-v2", -30)
    v3 = chan(5, "york-p2-v3", -20)          # 最新
    raw = chan(6, None, -60)                 # 札なし（前の仕組みのもの）
    a4 = chan(7, "edinburgh-p2A-v4", -45)    # 別の回の最新
    base = [LIVE, d_old, d_new, v1, v2, v3, raw, a4]
    chans = base + fill(ch.CAP - len(base) + 1)
    pick = ch.make_room(chans)
    ids = [ch.cid(c) for c in pick]
    want = [ch.cid(c) for c in (d_old, d_new, v1, v2)]
    need = len(ch.used(chans)) - (ch.CAP - ch.ROOM) + 1
    check("room_order", ids == want[:need], f"順と数が違う: {ids}（要る {need}本・期待 {want[:need]}）")
    many = [LIVE, d_old, d_new, v1, v2, v3, raw, a4] + fill(ch.CAP + 10)
    ids = [ch.cid(c) for c in ch.make_room(many)]
    check("room_order", ids == want, f"足りないときに選べるだけ選ばない・選んではいけないものを選んだ: {ids}")
    for keep in (v3, raw, a4, LIVE):
        check("room_order", ch.cid(keep) not in ids, f"{ch.cid(keep)} を選んだ")


def leg_retire_older_only() -> None:
    v5 = chan(1, "york-p2-v5", -30)
    v6 = chan(2, "york-p2-v6", -20)
    d1 = chan(3, "york-p2-v7d1", -15)
    v8 = chan(4, "york-p2-v8", -5)           # あとから作った新しい版（今回より新しい）
    raw = chan(5, None, -40)
    a4 = chan(6, "edinburgh-p2A-v4", -25)
    me = chan(7, "york-p2-v7", -10)
    chans = [LIVE, v5, v6, d1, v8, raw, a4, me]
    got = {ch.cid(c) for c in ch.to_retire(chans, "york-p2-v7", ch.cid(me))}
    check("retire_older_only", got == {ch.cid(v5), ch.cid(v6), ch.cid(d1)},
          f"消す先が違う: {sorted(got)}")
    check("retire_older_only", ch.to_retire(chans, "york-p2-v7", "sp-" + "f" * 20) == [],
          "一覧に無いチャンネルで消した")
    fake = FakeApi(chans)
    r = ch.retire(fake, "york-p2-v7", ch.cid(me))
    check("retire_older_only", set(fake.deleted) == got and len(r["retired"]) == 3 and r["failed"] == 0,
          f"retire が消したもの {fake.deleted} / {r}")
    check("retire_older_only", "live" not in fake.deleted, "live を消した")


def leg_retire_twins() -> None:
    a = chan(1, "leeds-p3-v1", -1)
    b = chan(2, "leeds-p3-v1", -1 + 5 / 3600)   # 5秒あとに作った同じ版
    fake = FakeApi([LIVE, a, b])
    ch.retire(fake, "leeds-p3-v1", ch.cid(a))   # 先に作ったほうの確かめが、あとから終わる
    ch.retire(fake, "leeds-p3-v1", ch.cid(b))
    left = {ch.cid(c) for c in fake.list()}
    check("retire_twins", ch.cid(b) in left and ch.cid(a) not in left,
          f"同じ版の2本: 残ったもの {sorted(left)}（後から作った {ch.cid(b)} が残るはず）")
    fake = FakeApi([LIVE, a, b])
    ch.retire(fake, "leeds-p3-v1", ch.cid(b))
    ch.retire(fake, "leeds-p3-v1", ch.cid(a))
    left = {ch.cid(c) for c in fake.list()}
    check("retire_twins", left == {"live", ch.cid(b)}, f"逆の順でも: 残ったもの {sorted(left)}")


def leg_tidy_fake_api() -> None:
    gone = chan(1, "old-p1-v1", -24 * 8)
    gone_raw = chan(2, None, -24 * 7.5)
    draft = chan(3, "york-p2-v1d1", -10)
    latest = chan(4, "york-p2-v1", -9)
    few = [LIVE, gone, gone_raw, draft, latest]
    fake = FakeApi(few)
    r = ch.tidy(fake, NOW)
    check("tidy_fake_api", set(fake.deleted) == {ch.cid(gone), ch.cid(gone_raw)},
          f"余裕のあるときに消したもの: {fake.deleted}")
    check("tidy_fake_api", r["dead"] == 2 and r["room"] == [] and r["before"] == 4 and r["after"] == 2,
          f"数: {r}")
    crowded = few + fill(ch.CAP - ch.ROOM - 2)
    fake = FakeApi(crowded, refuse={ch.cid(gone)})
    r = ch.tidy(fake, NOW)
    check("tidy_fake_api", ch.cid(draft) in fake.deleted and ch.cid(gone_raw) in fake.deleted,
          f"上限が近いのに下書きか期限切れを消さない: {fake.deleted}")
    check("tidy_fake_api", ch.cid(latest) not in fake.deleted and "live" not in fake.deleted,
          f"最新の版か live を消した: {fake.deleted}")
    check("tidy_fake_api", r["failed"] == 1 and r["after"] == r["before"] - 2,
          f"1本断られたときの数: {r}")


class Resp:
    def __init__(self, code: int = 200, body: dict | None = None):
        self.status_code = code
        self.content = json.dumps(body or {}).encode()
        self.text = self.content.decode()

    def json(self):
        return json.loads(self.text)


class Session:
    def __init__(self):
        self.calls: list[tuple] = []

    def delete(self, url, **kw):
        self.calls.append(("DELETE", url))
        return Resp()

    def patch(self, url, **kw):
        self.calls.append(("PATCH", url, kw.get("json")))
        return Resp()

    def get(self, url, **kw):
        self.calls.append(("GET", url, kw.get("params")))
        page = (kw.get("params") or {}).get("pageToken")
        if not page:
            return Resp(body={"channels": [LIVE], "nextPageToken": "p2"})
        return Resp(body={"channels": [chan(1, "york-p2-v1", -1)]})


def leg_delete_guard() -> None:
    s = Session()
    api = ch.Api(session=s)
    for bad in ("live", "sp-123", "sp-" + "g" * 20, "pr12-feature", "sp-" + "a" * 20 + "/../live", ""):
        try:
            api.delete(bad)
            check("delete_guard", False, f"{bad!r} を消そうとした")
        except RuntimeError:
            pass
        try:
            api.label(bad, {})
            check("delete_guard", False, f"{bad!r} に札を付けようとした")
        except RuntimeError:
            pass
    check("delete_guard", s.calls == [], f"断るはずなのに通信した: {s.calls}")
    api.delete("sp-" + "a" * 20)
    check("delete_guard", s.calls and s.calls[-1][0] == "DELETE" and s.calls[-1][1].endswith(
        f"/sites/{ch.SITE}/channels/sp-" + "a" * 20), f"下見の形のものを消しに行かない: {s.calls}")
    got = api.list()
    check("delete_guard", [ch.cid(c) for c in got] == ["live", ch.cid(chan(1, 'x', 0))],
          f"一覧の2ページ目を読まない: {[ch.cid(c) for c in got]}")

    class Err(Session):
        def delete(self, url, **kw):
            return Resp(429, {"error": {"message": "quota https://x.web.app/?sig=" + "Z" * 50}})

    try:
        ch.Api(session=Err()).delete("sp-" + "b" * 20)
        check("delete_guard", False, "HTTP 429 を通した")
    except RuntimeError as e:
        check("delete_guard", "429" in str(e) and "sig=" not in str(e) and "Z" * 40 not in str(e),
              f"失敗の字に URL が残る: {e}")


def leg_redact() -> None:
    raw = ("Request to https://firebasehosting.googleapis.com/v1beta1/projects/live-streaming-d3cac/sites/"
           "live-streaming-d3cac/channels?channelId=sp-0123456789abcdef0123 had HTTP Error: 429, "
           "Couldn't create channel on `projects/live-streaming-d3cac/sites/live-streaming-d3cac/channels/"
           "sp-0123456789abcdef0123`: channel quota reached.\n"
           "url live-streaming-d3cac--sp-0123456789abcdef0123-x1y2z3w4.web.app "
           "github-action-live-streaming@live-streaming-d3cac.iam.gserviceaccount.com "
           "ya29.a0AfH6SMBabcdefghijk eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.sigsig\n"
           "-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASC\n-----END PRIVATE KEY-----\n"
           "b64 " + "QUJD/+" * 12 + "==\nline5\nline6")
    out = ch.safe_reason(raw, lines=10)
    for bad in ("https://", "sp-0123456789abcdef0123", "@live-streaming-d3cac.iam", "ya29.a0",
                "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9", "MIIEvQIBADANBgkqhkiG9w0BAQEFAASC", "QUJD/+QUJD/+",
                ".web.app"):
        check("redact", bad not in out, f"伏せていない: {bad}")
    for keep in ("HTTP Error: 429", "channel quota reached", "sites/live-streaming-d3cac/channels/sp-<乱数>"):
        check("redact", keep in out, f"理由の字まで消した: {keep}（{out[:200]}）")
    three = ch.safe_reason(raw)
    check("redact", three.count(" / ") == 2, f"3行に切らない: {three.count(' / ') + 1}行")
    check("redact", all(len(x) <= 240 for x in ch.safe_reason("a " * 400).split(" / ")), "1行が長すぎる")
    check("redact", ch.safe_reason("", None) == "", "空の字に何か返した")


def leg_error_of_json() -> None:
    out = json.dumps({"status": "error", "error": "HTTP Error: 429, Couldn't create channel: channel "
                                                  "quota reached. https://x.web.app"})
    err = "[debug] boring\n[info] fine\nError: Request failed HTTP 429 sp-0123456789abcdef0123\n"
    got = ch.error_of(out, err)
    check("error_of_json", "channel quota reached" in got and "Request failed HTTP 429" in got,
          f"理由を拾わない: {got}")
    check("error_of_json", "boring" not in got and "https://" not in got and "0123456789abcdef0123" not in got,
          f"要らない行か秘密を拾った: {got}")
    check("error_of_json", "half" in ch.error_of('not json half', ""), "JSON でない出力を捨てた")
    check("error_of_json", ch.error_of('{"status": "success"}', "") == "", "成功の出力に理由を作った")


def leg_census_counts() -> None:
    chans = [LIVE, chan(1, "york-p2-v1", -24 * 8), chan(2, "york-p2-v1d1", -1), chan(3, None, -1),
             chan(4, "x-v1", -1, cid="pr12-feature")]
    c = ch.census(chans, NOW)
    check("census_counts", (c["all"], c["preview"], c["other"], c["dead"]) == (5, 3, 2, 1), f"数: {c}")
    check("census_counts", c["kinds"] == {"final": 1, "draft": 1, "札なし": 1}, f"内訳: {c['kinds']}")
    blob = json.dumps(c, ensure_ascii=False)
    check("census_counts", "sp-" not in blob and "web.app" not in blob, "数にチャンネル名か URL が混ざる")
    r = ch.row(chans[1])
    check("census_counts", r["channel_sha256"] == ch.sha(ch.cid(chans[1])) and "url" not in r
          and "name" not in r, f"1行に名前か URL が入る: {r}")


LEGS = [leg_names, leg_expires, leg_supersede_rules, leg_dead_only_expired, leg_room_below_cap,
        leg_room_order, leg_retire_older_only, leg_retire_twins, leg_tidy_fake_api, leg_delete_guard,
        leg_redact, leg_error_of_json, leg_census_counts]


def main() -> int:
    if not LEGS:
        print("!! 数える足が無い")
        return 2
    for leg in LEGS:
        before = len(FAILS)
        try:
            leg()
        except Exception as e:  # noqa: BLE001  足が落ちたことも赤に数える
            FAILS.append(f"{leg.__name__[4:]}: {type(e).__name__}: {e}")
        print(f"  {'○' if len(FAILS) == before else '✕'} {leg.__name__[4:]}")
    if FAILS:
        print(f"\n!! {len(FAILS)}件落ちた")
        for f in FAILS:
            print(f"  - {f}")
        return 1
    print(f"\n{len(LEGS)}本とも通った")
    return 0


if __name__ == "__main__":
    sys.exit(main())
