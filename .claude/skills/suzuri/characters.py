#!/usr/bin/env python3
"""EC2 の上で動く。あやと島のキャラクターと SUZURI の住人グッズを突き合わせる。

    import sys; sys.path.insert(0, "/home/ubuntu/cdp")
    from characters import diff
    d = diff(t)   # t は suzuri_ops.fresh_tab()
    d["new"]      # 島に居て、グッズになっていない人   [{char, emoji, src}]
    d["changed"]  # 同じ絵文字で、島の絵が描き直された人 [{mid, char, emoji, src, sim}]
    d["gone"]     # SUZURI に在って、島に居ない人      [{mid, title}]
    d["opaque"]   # 背景なしの絵に透過が無い人（作らない）[{char, emoji}]
    d["short"]    # 品目が5つそろっていない住人（Actions が3品目で作った人など）[{mid, char, emoji, src, items}]

## 何で突き合わせるか

**絵文字**と、**絵そのもの**（24x24 に縮めた濃淡の相関）の両方で見る。

- 絵文字だけだと、島で絵が描き直された人（☕ 🎭 🐘 は相関 0.53〜0.67 で別の絵だった）を見落とす
- 絵だけだと、絵文字が付け替わった人を取り違える
- 絵文字は異体字セレクタ（U+FE0F）と ZWJ・性別記号を落として比べる。
  SUZURI の 🧘 と島の 🧘‍♂️ は同じ人だった（相関 1.00。あやと 2026-10-09「残して直す」）

相関 0.9 以上を「同じ絵」とした（同じ絵は 0.95〜1.00、描き直しは 0.53〜0.67 で、間は空いている）。
"""
import io
import json
import math
import os
import re
import sys
import urllib.request

sys.path.insert(0, "/home/ubuntu/cdp")
from suzuri_ops import ORDER, list_ids, prep, read, transparent  # noqa: E402

API = "https://live-streaming-d3cac.web.app/island-api/characters"
WORK = "/home/ubuntu/suzuri"
SERIES = "カサ・アヤトの住人"
SAME = 0.9


def norm(e):
    return "".join(ch for ch in (e or "") if ch not in "️‍♂♀ ")


def emoji_of(title):
    """「カサ・アヤトの住人 🦔 一周年㊗️」→ 🦔。題の残りの字（一周年など）は落とす"""
    t = (title or "").replace(SERIES, "").strip()
    return re.split(r"\s+", t)[0] if t else ""


def feat(img):
    from PIL import Image
    im = img.convert("RGBA")
    bg = Image.new("RGBA", im.size, (230, 230, 230, 255))
    bg.alpha_composite(im)
    px = list(bg.convert("L").resize((24, 24)).getdata())
    mu = sum(px) / len(px)
    return [v - mu for v in px]


def sim(a, b):
    num = sum(x * y for x, y in zip(a, b))
    den = math.sqrt(sum(x * x for x in a) * sum(y * y for y in b)) or 1
    return num / den


def island():
    """島のキャラクター全員。背景なしの元絵を plain/ に落とし、余白を落とした版を prep/ に作る"""
    from PIL import Image
    os.makedirs(f"{WORK}/plain", exist_ok=True)
    os.makedirs(f"{WORK}/prep", exist_ok=True)
    chars = json.load(urllib.request.urlopen(API, timeout=60))["characters"]
    out = []
    for c in chars:
        raw, src = f"{WORK}/plain/{c['id']}.png", f"{WORK}/prep/{c['id']}.png"
        if not os.path.exists(raw):
            open(raw, "wb").write(urllib.request.urlopen(c["plain"]["full"], timeout=60).read())
        ok = transparent(raw)
        if ok and not os.path.exists(src):
            prep(raw, src)
            os.chmod(src, 0o644)
        out.append({"char": c["id"], "emoji": c["emoji"], "raw": raw, "src": src if ok else None,
                    "transparent": ok, "createdAt": c.get("createdAt")})
    return out


def diff(t):
    from PIL import Image
    chars = island()
    by_emoji = {norm(c["emoji"]): c for c in chars}
    # SUZURI に上げてあるのは余白を落とした絵なので、島のほうも余白を落とした版で比べる。
    # 余白の有る元絵と比べると、同じ絵でも枠の取り方がずれて相関が下がる
    feats = {c["char"]: feat(Image.open(c["src"] or c["raw"])) for c in chars}
    have, changed, gone, short = set(), [], [], []
    for mid in list_ids(t):
        m, ps = read(t, mid)
        if not m or not m.get("title") or SERIES not in m["title"]:
            continue
        tex = feat(Image.open(io.BytesIO(urllib.request.urlopen(m["textureUrl"], timeout=60).read())))
        c = by_emoji.get(norm(emoji_of(m["title"])))
        if not c:
            # 絵文字が当たらなくても、同じ絵が別の絵文字で居るかもしれない
            best = max(chars, key=lambda x: sim(tex, feats[x["char"]]))
            s = sim(tex, feats[best["char"]])
            if s >= SAME:
                have.add(best["char"])
                changed.append({"mid": mid, "char": best["char"], "emoji": best["emoji"], "src": best["src"],
                                "sim": round(s, 2), "why": f"絵文字が変わった（{emoji_of(m['title'])} → {best['emoji']}）"})
            else:
                gone.append({"mid": mid, "title": m["title"]})
            continue
        have.add(c["char"])
        pub = sorted(p["item"]["name"] for p in ps if p["published"])
        if pub != sorted(ORDER):
            short.append({"mid": mid, "char": c["char"], "emoji": c["emoji"], "src": c["src"], "items": pub})
        s = sim(tex, feats[c["char"]])
        if s < SAME:
            changed.append({"mid": mid, "char": c["char"], "emoji": c["emoji"], "src": c["src"],
                            "sim": round(s, 2), "why": "島で絵が描き直された"})
    new = [c for c in chars if c["char"] not in have and c["transparent"]]
    new.sort(key=lambda c: c.get("createdAt") or "")
    opaque = [{"char": c["char"], "emoji": c["emoji"]} for c in chars if not c["transparent"]]
    return {"new": [{"char": c["char"], "emoji": c["emoji"], "src": c["src"]} for c in new],
            "changed": changed, "gone": gone, "opaque": opaque, "short": short, "island": len(chars)}


if __name__ == "__main__":
    from suzuri_ops import fresh_tab
    d = diff(fresh_tab())
    json.dump(d, open(f"{WORK}/diff.json", "w"), ensure_ascii=False, indent=1)
    print(f"島 {d['island']} 人 / 新しく作る {len(d['new'])} / 絵が変わった {len(d['changed'])} / 島に居ない {len(d['gone'])} / 透過なし {len(d['opaque'])} / 品目が足りない {len(d['short'])}")
    for k in ("changed", "gone", "opaque", "short"):
        for x in d[k]:
            print(k, json.dumps(x, ensure_ascii=False))
    print("new:", " ".join(x["emoji"] for x in d["new"]))
