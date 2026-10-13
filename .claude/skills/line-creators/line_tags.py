#!/usr/bin/env python3
"""EC2 の上で動く。LINE Creators Market のタグを、枠ごとに付ける。

    python3 line_tags.py <スタンプID> <tags.json> [枠 …]
    # tags.json は {"01": ["やっほー", "こんにちは", …], …}（日本語のタグの字。1枠9個まで）

タグは**押したその場で保存される**（画面に「Changes saved」）。外すのも同じ「押す」なので、
すでに付いているものをもう一度押すと外れる。押すたびに「n/9」の数が1つ増えたかで確かめ、
増えていなければ押し直さずに数えて報告する。

タグは**枠の番号に付く。** 並びを決めてから付ける（SKILL.md の 8）。
"""
import json, re, sys, time
sys.path.insert(0, "/home/ubuntu/cdp")
from cdp import tab

VIS = "e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 }"


def count(t):
    m = re.search(r"(\d+)/9", t.js("document.body.innerText") or "")
    return int(m.group(1)) if m else -1


def label_js(word):
    return (f"[...document.querySelectorAll('label.cm-product-image-tag')].filter({VIS})"
            f".find(l => l.innerText.trim().replace(/\\n?\\s*\\(\\d+\\)$/, '').trim() === {json.dumps(word)})")


def selected(t):
    """いま付いているタグの字。選んだタグは、右上の箱に「×」付きで並ぶ"""
    return t.js(f"""[...document.querySelectorAll('label.cm-product-image-tag')].filter(l => l.querySelector('input:checked'))
        .map(l => l.innerText.trim().replace(/\\n?\\s*\\(\\d+\\)$/, '').trim())""") or []


def search(t, word):
    box = "document.querySelector('input[type=search]')"
    t.click(box)
    t.js(f"(() => {{ const e = {box}; e.focus(); e.select(); }})()")
    t.key("Backspace", vk=8)
    t.type(word)
    time.sleep(1.5)


def one(t, base, sticker, slot, words):
    t.go(f"{base}/sticker/{sticker}/tag#/{slot}", wait=1)
    t.call("Page.reload")
    t.wait_ready()
    time.sleep(4)
    t.js("""(() => { const s = document.querySelector('select[name=language]'); if (!s || s.value === 'ja') return;
        s.value = 'ja'; s.dispatchEvent(new Event('input', {bubbles: true})); s.dispatchEvent(new Event('change', {bubbles: true})) })()""")
    time.sleep(2)
    have = set(selected(t))
    miss = []
    for w in words[:9]:
        if w in have:
            continue
        n0 = count(t)
        if not t.js(f"!!({label_js(w)})"):
            search(t, w)
        if not t.js(f"!!({label_js(w)})"):
            miss.append(w)
            continue
        t.click(label_js(w))
        time.sleep(1.2)
        if count(t) != n0 + 1:
            miss.append(w + "(数が増えない)")
        have.add(w)
    got = sorted(set(selected(t)))
    return {"slot": slot, "count": count(t), "miss": miss, "got": got}


if __name__ == "__main__":
    sticker, path = sys.argv[1], sys.argv[2]
    want = json.load(open(path, encoding="utf-8"))
    only = sys.argv[3:]
    t = tab("line")
    t.go("https://creator.line.me/my/", wait=4)
    base = t.url().split("/sticker/")[0]
    for slot, words in want.items():
        if only and slot not in only:
            continue
        print(json.dumps(one(t, base, sticker, slot, words), ensure_ascii=False), flush=True)
