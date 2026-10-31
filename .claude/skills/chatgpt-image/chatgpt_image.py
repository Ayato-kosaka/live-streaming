#!/usr/bin/env python3
"""EC2 の上で動く。ChatGPT に絵を渡して（または渡さずに）頼み、できた絵を持ち帰る。

`chatgpt.py`（`chatgpt` スキル）の上に乗る。手元から `ec2.py put` で `/home/ubuntu/cdp/chatgpt_image.py` に置き、

    python3 chatgpt_image.py <頼みごとを書いたファイル> <書き出しの頭> <会話の題> [渡す絵 …]

書き出しは `<頭>-0.png` `<頭>-1.png` …。最後に会話の URL を出す（直しを頼むときは、そこへ戻る）。

    python3 chatgpt_image.py --more <会話のURL> <頼みごとのファイル> <書き出しの頭> [会話の題]

で、同じ会話の続きとして直しを頼む。
"""
import json, os, sys, time
sys.path.insert(0, "/home/ubuntu/cdp")
from chatgpt import fresh, attach, send, turns, wait_reply, images, save_image, logged_in, where, in_project, rename, PROJECT


def make(prompt, out_prefix, title, files=(), url=PROJECT, timeout=600):
    """title は会話の題（chatgpt スキル 1 の形）。返事が来たら付け直す"""
    t = fresh(url, wait=8)
    if not logged_in(t):
        raise SystemExit("ログインしていない。chatgpt スキルの 3 を見る（こちらからログインしに行かない）")
    if not in_project(t):
        raise SystemExit(f"プロジェクトの外を開いている: {where(t.url())}（chatgpt スキル 0）")
    t0 = time.time()
    if files:
        attach(t, list(files))
    n = len(turns(t))
    tries = send(t, prompt)
    text = wait_reply(t, n, timeout=timeout, want_images=True)
    if title:
        rename(t, title)
    out = []
    for k, (src, w, h) in enumerate(images(t)):
        path = f"{out_prefix}-{k}.png"
        kind, size = save_image(t, src, path)
        out.append({"path": path, "w": w, "h": h, "type": kind, "bytes": size})
    r = {"url": where(t.url()), "title": t.js("document.title"), "seconds": round(time.time() - t0, 1), "send_tries": tries,
         "text": text[:500], "images": out}
    print(json.dumps(r, ensure_ascii=False, indent=1))
    return r


if __name__ == "__main__":
    a = sys.argv[1:]
    if a[:1] == ["--more"] and len(a) >= 4:
        u = a[1] if a[1].startswith("http") else "https://" + a[1]
        make(open(a[2], encoding="utf-8").read().strip(), a[3], a[4] if len(a) > 4 else None, url=u)
    elif len(a) >= 3:
        make(open(a[0], encoding="utf-8").read().strip(), a[1], a[2], a[3:])
    else:
        print(__doc__)
