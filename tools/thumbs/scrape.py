"""日本の YouTube で実際に伸びている動画のサムネを集める。型を見て決めたいので、
検索結果の JSON から videoId と再生数を拾って、再生数の多い順にサムネを落とす。"""
import os, re, json, sys, urllib.request, urllib.parse
from concurrent.futures import ThreadPoolExecutor
ph = urllib.request.ProxyHandler({"https": os.environ.get("HTTPS_PROXY","")})
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/120.0 Safari/537.36")
def get(u, binary=False):
    op = urllib.request.build_opener(ph)
    op.addheaders = [("User-Agent", UA), ("Accept-Language","ja-JP,ja;q=0.9")]
    with op.open(u, timeout=35) as r: 
        b = r.read()
    return b if binary else b.decode("utf-8","replace")

def parse_views(t):
    m = re.search(r"([\d,\.]+)\s*(万|億)?回視聴", t or "")
    if not m: return 0
    n = float(m.group(1).replace(",",""))
    return int(n * {"万":10000, "億":100000000}.get(m.group(2), 1))

def search(q, sort_views=True):
    u = "https://www.youtube.com/results?search_query=" + urllib.parse.quote(q)
    if sort_views: u += "&sp=CAMSAhAB"   # 再生数の多い順
    html = get(u)
    m = re.search(r"var ytInitialData = (\{.*?\});</script>", html)
    if not m: return []
    data = json.loads(m.group(1))
    out = []
    def walk(o):
        if isinstance(o, dict):
            if "videoRenderer" in o:
                v = o["videoRenderer"]
                try:
                    out.append(dict(
                        vid=v["videoId"],
                        title="".join(r.get("text","") for r in v["title"]["runs"]),
                        ch=v.get("ownerText",{}).get("runs",[{}])[0].get("text",""),
                        views=parse_views(v.get("viewCountText",{}).get("simpleText","")),
                        age=v.get("publishedTimeText",{}).get("simpleText",""),
                        q=q))
                except Exception: pass
            for x in o.values(): walk(x)
        elif isinstance(o, list):
            for x in o: walk(x)
    walk(data)
    return out

QUERIES = json.load(open(sys.argv[1]))
rows = []
with ThreadPoolExecutor(max_workers=6) as ex:
    for r in ex.map(search, QUERIES): rows += r
seen = {}
for r in rows:
    if r["vid"] not in seen or r["views"] > seen[r["vid"]]["views"]: seen[r["vid"]] = r
rows = sorted(seen.values(), key=lambda r: -r["views"])
json.dump(rows, open("ref/index.json","w"), ensure_ascii=False, indent=1)
print(len(rows), "件")
for r in rows[:15]: print(f"{r['views']:>10,} {r['ch'][:16]:16} {r['title'][:44]}")
