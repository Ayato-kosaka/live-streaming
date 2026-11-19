"""一時の確かめ（枝 claude/seo-yt-probe だけ。master には入れない）: Actions から YouTube の説明欄が読めるか"""
import json
import re
import sys
import urllib.error
import urllib.request

IDS = ["4izd3enURM8", "-oDWI23uBgc", "jnKVIXn4qQs"]
NEEDLE = "ayato-arigato.com/travel/bulgaria/sofia"
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36"


def get(url, headers=None, data=None, method=None):
    req = urllib.request.Request(url, data=data, method=method, headers={"User-Agent": UA, "Accept-Language": "ja,en;q=0.5", **(headers or {})})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return r.status, r.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode("utf-8", "replace")[:300]
    except Exception as e:  # noqa: BLE001
        return 0, type(e).__name__


print("== 1. API（サービスアカウント・youtube.readonly）")
try:
    import google.auth
    import google.auth.transport.requests
    creds, _ = google.auth.default(scopes=["https://www.googleapis.com/auth/youtube.readonly"])
    creds.refresh(google.auth.transport.requests.Request())
    st, body = get("https://www.googleapis.com/youtube/v3/videos?part=snippet&id=" + ",".join(IDS),
                   {"Authorization": f"Bearer {creds.token}", "Accept": "application/json"})
    print("status", st)
    try:
        d = json.loads(body)
        items = d.get("items", [])
        print("items", len(items), [(i["id"], NEEDLE in i["snippet"].get("description", "")) for i in items])
        if "error" in d:
            print("error", d["error"].get("message", "")[:200], [e.get("reason") for e in d["error"].get("errors", [])])
    except ValueError:
        print("not json", body[:200])
except Exception as e:  # noqa: BLE001
    print("auth failed", type(e).__name__)

print("== 2. 動画の頁")
for v in IDS[:2]:
    st, h = get(f"https://www.youtube.com/watch?v={v}&hl=ja")
    m = re.search(r'"shortDescription":"((?:[^"\\]|\\.)*)"', h)
    print(v, st, len(h), "shortDescription" if m else "なし", (NEEDLE in json.loads(f'"{m.group(1)}"')) if m else None,
          "bot" if "confirm you" in h or "not a bot" in h else "", "consent" if "consent.youtube" in h else "")

print("== 3. RSS")
st, x = get("https://www.youtube.com/feeds/videos.xml?channel_id=UCCwutAH6ieHNvdyJAfSld7w")
ent = re.findall(r"<yt:videoId>([\w-]{11})</yt:videoId>", x)
print(st, len(x), "entries", len(ent), [(v, v in ent) for v in IDS])
for v in IDS:
    blk = re.search(rf"<yt:videoId>{re.escape(v)}</yt:videoId>.*?</entry>", x, re.S)
    if blk:
        print(v, "desc has needle", NEEDLE in blk.group(0))

print("== 4. youtubei player（鍵なし）")
body = json.dumps({"context": {"client": {"clientName": "WEB", "clientVersion": "2.20251101.00.00", "hl": "ja"}}, "videoId": IDS[0]}).encode()
st, r = get("https://www.youtube.com/youtubei/v1/player?prettyPrint=false", {"Content-Type": "application/json"}, body, "POST")
try:
    d = json.loads(r)
    vd = d.get("videoDetails", {})
    print(st, "playability", d.get("playabilityStatus", {}).get("status"), "desc" if "shortDescription" in vd else "なし", NEEDLE in vd.get("shortDescription", ""))
except ValueError:
    print(st, r[:150])

print("== 5. youtubei next（鍵なし）")
body = json.dumps({"context": {"client": {"clientName": "WEB", "clientVersion": "2.20251101.00.00", "hl": "ja"}}, "videoId": IDS[0]}).encode()
st, r = get("https://www.youtube.com/youtubei/v1/next?prettyPrint=false", {"Content-Type": "application/json"}, body, "POST")
print(st, len(r), NEEDLE in r)
sys.exit(0)
