#!/usr/bin/env python3
"""EC2 の上で動く。YouTube Studio を、ログイン済みの Chrome（~/cdp-ytstudio）から触る道具。

`ec2-chrome` の cdp.py の上に乗る。手元から `ec2.py put` で `/home/ubuntu/cdp/yt_studio.py` に置き、

    import sys; sys.path.insert(0, "/home/ubuntu/cdp")
    from yt_studio import *
    t = studio()                                   # Studio のタブを1枚だけ残して返す
    reqs = capture(t, url_of("videos/live"))       # 画面が裏で送る youtubei の要求と返事を全部拾う
    r = api(t, "creator/list_creator_videos", body) # 同じ要求をページの中から送る

## なぜ画面の字ではなく youtubei を読むか

Studio は画面の字を何段もの custom element の中に描く。字は言語設定で変わるし、
一覧は送らないと読み込まれない。**画面が裏で送っている `youtubei/v1/...` の要求は
JSON で、全部の列が揃っている。** 画面を開いて要求を拾い（capture）、
同じ形の要求をページの中から送り直す（api）ほうが確実。
"""
import json, sys, time, urllib.request
sys.path.insert(0, "/home/ubuntu/cdp")
from cdp import Tab, up, pages, where, _port

NAME = "ytstudio"
CH = "UCCwutAH6ieHNvdyJAfSld7w"
BASE = "https://studio.youtube.com"


def url_of(path=""):
    """`videos/live` → チャンネルのライブ一覧。`video/<id>/copyright` などは BASE 直下"""
    if path.startswith("video/"):
        return f"{BASE}/{path}"
    return f"{BASE}/channel/{CH}/{path}".rstrip("/")


def _browser(port):
    import websocket
    v = json.load(urllib.request.urlopen(f"http://localhost:{port}/json/version"))
    return websocket.create_connection(v["webSocketDebuggerUrl"], timeout=15, suppress_origin=True)


def _bcall(b, method, **params):
    b.send(json.dumps({"id": 1, "method": method, "params": params}))
    while True:
        m = json.loads(b.recv())
        if m.get("id") == 1:
            return m.get("result", {})


def current():
    """前の send-command で開いたタブの続きを触る（ダイアログを開いたまま次の手を打つとき）。
    5秒で返事が無ければ固まっているので None"""
    ps = [p for p in pages(NAME) if "studio.youtube.com" in p["url"]]
    if not ps:
        return None
    try:
        t = Tab(_port(NAME), ps[0], timeout=5)
        t.js("1")
        t.ws.settimeout(60)
        return t
    except Exception:
        return None


def studio(url=None, wait=8):
    """**毎回新しいタブを1枚作り、ほかのタブは全部閉じて**、そのタブを返す。

    前の send-command で開いたタブに繋ぎ直すと、Page.enable も Runtime.evaluate も
    返らないことがある（2026-10-10 に2回。誰も繋いでいないあいだに描画プロセスが固まる。
    ダイアログは出ていなかった）。固まったタブは Target.closeTarget なら閉じられる。
    最初の up はプロファイルの複製（1.2GB）で数分かかる"""
    port = up(NAME)
    b = _browser(port)
    old = pages(NAME)
    tid = _bcall(b, "Target.createTarget", url="about:blank")["targetId"]
    for p in old:
        _bcall(b, "Target.closeTarget", targetId=p["id"])
    b.close()
    time.sleep(1)
    # 閉じた直後の /json/list には閉じたタブが残るので、id で選ぶ
    p = next(p for p in pages(NAME) if p["id"] == tid)
    t = Tab(port, p, timeout=60)
    t.go(url or url_of(), wait=wait)
    return t


def drain(t, secs=3):
    """WebSocket に溜まっているイベントを吸い取る"""
    t.ws.settimeout(secs)
    try:
        while True:
            t.events.append(json.loads(t.ws.recv()))
    except Exception:
        pass
    t.ws.settimeout(60)


def capture(t, url=None, match="youtubei/v1/", wait=10, act=None):
    """url を開く（または act(t) を実行する）あいだに出た要求のうち、match を含むものを
    [{url, post, status, resp}] で返す。resp は JSON なら dict"""
    t.call("Network.enable", maxPostDataSize=500000)
    t.events.clear()
    if url:
        t.go(url, wait=wait)
    if act:
        act(t)
        time.sleep(wait)
    drain(t)
    reqs, status = {}, {}
    for e in t.events:
        m, p = e.get("method"), e.get("params", {})
        if m == "Network.requestWillBeSent" and match in p["request"]["url"]:
            reqs[p["requestId"]] = {"url": p["request"]["url"].split("?")[0].split("youtubei/v1/")[-1],
                                    "post": p["request"].get("postData", "")}
        elif m == "Network.responseReceived":
            status[p["requestId"]] = p["response"]["status"]
    out = []
    for rid, r in reqs.items():
        try:
            body = t.call("Network.getResponseBody", requestId=rid).get("body", "")
        except Exception as ex:
            body = f"ERR {str(ex)[:80]}"
        try:
            body = json.loads(body)
        except Exception:
            pass
        try:
            r["post"] = json.loads(r["post"])
        except Exception:
            pass
        out.append(dict(r, status=status.get(rid), resp=body))
    t.call("Network.disable")
    return out


# ページの中で SAPISIDHASH を作って youtubei を叩く。
# Studio の要求は Authorization に「SAPISIDHASH <時刻>_<sha1(時刻 SAPISID origin)>」を載せている。
# SAPISID は HttpOnly ではないので document.cookie から読める
_API_JS = r"""
(async (endpoint, body) => {
  const c = Object.fromEntries(document.cookie.split('; ').map(s => [s.split('=')[0], s.slice(s.indexOf('=') + 1)]));
  const sid = c['SAPISID'] || c['__Secure-3PAPISID'];
  const ts = Math.floor(Date.now() / 1000), origin = location.origin;
  const buf = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(`${ts} ${sid} ${origin}`));
  const hash = [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
  const ctx = ytcfg.get('INNERTUBE_CONTEXT');
  const full = Object.assign({context: ctx}, body);
  if (body.context) full.context = Object.assign({}, ctx, body.context);
  const headers = {'Content-Type': 'application/json', 'Authorization': `SAPISIDHASH ${ts}_${hash}`,
                   'X-Origin': origin, 'X-Goog-AuthUser': String(ytcfg.get('SESSION_INDEX') || 0)};
  const pid = ytcfg.get('DELEGATED_SESSION_ID'); if (pid) headers['X-Goog-PageId'] = pid;
  const r = await fetch(`/youtubei/v1/${endpoint}?alt=json&key=${ytcfg.get('INNERTUBE_API_KEY')}`,
                        {method: 'POST', credentials: 'include', headers, body: JSON.stringify(full)});
  return [r.status, await r.text()];
})
"""


def api(t, endpoint, body):
    """youtubei/v1/<endpoint> に body を送る。context は ytcfg のもので補う。戻り値は dict（失敗は例外）"""
    st, text = t.js(f"({_API_JS})({json.dumps(endpoint)}, {json.dumps(body)})", await_promise=True)
    if st != 200:
        raise RuntimeError(f"{endpoint}: HTTP {st}: {text[:300]}")
    return json.loads(text)


def dump(obj, path):
    with open(path, "w") as f:
        json.dump(obj, f, ensure_ascii=False, indent=1)
    return path


# ---- 動画の一覧（creator/list_creator_videos）----
# 画面の「コンテンツ > ライブ」が送っている filter をそのまま写した（2026-10-10）。
# mask は画面のものから要るものだけに絞った（画面のままだと 30件で 650KB ある）
LIVE_FILTER = {"and": {"operands": [
    {"channelIdIs": {"value": CH}},
    {"and": {"operands": [
        {"videoOriginIs": {"value": "VIDEO_ORIGIN_LIVESTREAM"}},
        {"not": {"operand": {"and": {"operands": [{"isLcrAutoDashboard": {}},
                                                   {"livestreamStageIs": {"value": "VIDEO_LIVESTREAM_STAGE_FUTURE"}}]}}}},
        {"not": {"operand": {"isTvfilmLive": {}}}}]}}]}}
MASK = {"videoId": True, "title": True, "privacy": True, "lengthSeconds": True, "timePublishedSeconds": True,
        "livestream": {"all": True}, "monetization": {"all": True}, "allRestrictions": {"all": True},
        "status": True, "inlineEditProcessingStatus": True}


def list_videos(t, flt=LIVE_FILTER, order="VIDEO_ORDER_LIVESTREAM_DISPLAY_TIME_DESC", page_size=50, limit=None, stop=None):
    """新しい順に全部たどる。stop(v) が真を返したらそこで止める（差分だけ見るとき）"""
    out, token = [], None
    while True:
        body = {"filter": flt, "order": order, "pageSize": page_size, "mask": MASK}
        if token:
            body["pageToken"] = token
        r = api(t, "creator/list_creator_videos", body)
        for v in r.get("videos", []):
            if stop and stop(v):
                return out
            out.append(v)
            if limit and len(out) >= limit:
                return out
        token = r.get("nextPageToken")
        if not token:
            return out


def summarize(v):
    """1本を、棚卸しに要る列だけにする"""
    ls = v.get("livestream", {})
    m = v.get("monetization", {}).get("adMonetization", {})
    causes = []
    for c in (v.get("allRestrictions") or {}).get("restrictions", []):
        cp = c.get("copyright", {})
        causes.append({"reason": c.get("reason", "").replace("VIDEO_RESTRICTION_REASON_", ""),
                       "detail": cp.get("detail", "").replace("COPYRIGHT_RESTRICTION_DETAIL_", ""),
                       "m10n": c.get("monetizationEffect", "").replace("VIDEO_RESTRICTION_EFFECT_", ""),
                       "view": c.get("visibilityEffect", "").replace("VIDEO_RESTRICTION_EFFECT_", ""),
                       "blocked": cp.get("properties", {}).get("localizedBlockedCountries")})
    return {"id": v["videoId"], "title": v.get("title", ""),
            "start": int(ls.get("actualStartTimeSeconds") or ls.get("scheduledStartTimeSeconds") or 0),
            "len": int(v.get("lengthSeconds") or 0),
            "privacy": v.get("privacy", "").replace("VIDEO_PRIVACY_", ""),
            "stage": ls.get("stage", "").replace("VIDEO_LIVESTREAM_STAGE_", ""),
            "user_m10n": m.get("userSetMonetization", "").replace("VIDEO_USER_SET_MONETIZATION_", ""),
            "m10n": m.get("effectiveStatus", "").replace("VIDEO_MONETIZING_STATUS_", ""),
            "edit": v.get("inlineEditProcessingStatus"),
            "causes": causes}


# ---- 申し立て（creator/list_creator_received_claims）----
def claims(t, video_id):
    """その動画が受けている申し立てを全部返す（画面の「申し立て」と同じもの）"""
    r = api(t, "creator/list_creator_received_claims",
            {"videoId": video_id, "criticalRead": False, "includeLicensingOptions": False, "isCreatorMusicV2": True})
    return r.get("receivedClaims", [])


def claim_summary(c):
    """1件を棚卸し用の列にする。territories（国の一覧）は長いだけなので落とす"""
    md = c.get("asset", {}).get("metadata", {})
    kind = next(iter(md), "")
    meta = md.get(kind, {})
    act = c.get("nontakedownClaimActions", {})
    m = c.get("matchDetails", {})
    return {"claim": c.get("claimId"), "type": c.get("type", "").replace("CLAIM_TYPE_", ""),
            "status": c.get("status", "").replace("RECEIVED_CLAIM_STATUS_", ""),
            "kind": kind, "title": meta.get("title") or meta.get("customId") or "",
            "artists": meta.get("artists", []),
            "policy": c.get("claimPolicy", {}).get("primaryPolicy", {}).get("policyType", "").replace("POLICY_TYPE_", ""),
            "manual": m.get("isManualMatch"), "at": int(m.get("longestMatchStartTimeSeconds") or 0),
            "dur": int(m.get("longestMatchDurationSeconds") or 0),
            "options": [o.replace("NON_TAKEDOWN_CLAIM_OPTION_", "") for o in act.get("options", [])],
            "mute_ok": act.get("claimResolutionEligibility", {}).get("segmentMuteEligibility", "").replace("EFFECT_ELIGIBILITY_", ""),
            "not_actionable": act.get("claimNotActionableReason", "").replace("CLAIM_NOT_ACTIONABLE_REASON_", "")}


def get_videos(t, ids, mask=None):
    """id を指定して取り直す（一覧をたどらずに、控えてある動画の今を見る）。50本ずつ"""
    out = []
    for i in range(0, len(ids), 50):
        r = api(t, "creator/get_creator_videos",
                {"failOnError": True, "videoIds": ids[i:i + 50], "mask": mask or MASK, "criticalRead": False})
        out += r.get("videos", [])
    return out


def claim_segments(t, video_id, claim_id):
    """申し立てが一致した区間を全部返す。画面の「曲を消去する」は、この区間をそのまま送っている"""
    r = api(t, "copyright/get_creator_received_claim_matches",
            {"videoId": video_id, "claimId": claim_id, "channelId": CH})
    return [m["videoSegment"] for m in r.get("matches", {}).get("claimMatches", [])
            if m.get("matchType") == "CLAIM_MATCH_TYPE_AUDIO" and "videoSegment" in m]


def mute_claim(t, video_id, claim_id):
    """申し立て1件を「申し立てを受けたセグメントのすべての音をミュート」で対応する。

    画面の 対応する → 曲を消去する → 次へ → 「…すべての音をミュートします」→ 保存 →
    「恒久的であることを理解しました」→ 変更を確定 が送っているものと同じ（2026-10-10 に画面で押して写した）。
    **元に戻せない。** 送ると動画は「動画編集が進行中です…」になり、終わるまで次の申し立てに触れない。
    戻り値は送った区間"""
    segs = claim_segments(t, video_id, claim_id)
    if not segs:
        raise RuntimeError(f"{video_id} {claim_id}: 一致した区間が無い")
    r = api(t, "video_editor/edit_video", {"externalVideoId": video_id, "videoEdit": {"claimEditChange": {
        "addRemoveSongEdit": {"claimId": claim_id, "method": "REMOVE_SONG_METHOD_MUTE",
                              "muteSegments": segs, "allKnownMatchesCovered": True}}}})
    if r.get("executionStatus") != "EDIT_EXECUTION_STATUS_SCHEDULED":
        raise RuntimeError(f"{video_id} {claim_id}: {json.dumps(r)[:300]}")
    return segs
