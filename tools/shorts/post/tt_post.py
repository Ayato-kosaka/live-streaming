#!/usr/bin/env python3
"""EC2 の上で動く。TikTok Studio（web）にショートを上げる。

`ec2-chrome` の cdp.py の上に乗る。TikTok にログインしてあるのは `~/cdp-fish` の Chrome
（あやとが既定のプロファイルでログインし、Fish Audio の用で複製したもの。2026-10-15）。
手元から `ec2.py put` で `/home/ubuntu/cdp/tt_post.py` に置き、手元の `post.py` から呼ぶ（README.md）。

    python3 tt_post.py check <探す字>                          # ログインしているか・同じ投稿がもう在るか
    python3 tt_post.py post <mp4> <caption.txt> --dry          # 投稿の手前まで（字と設定を確かめて、投稿しない）
    python3 tt_post.py post <mp4> <caption.txt>                # 投稿する
    python3 tt_post.py post <mp4> <caption.txt> --at "2026-10-17 14:00"   # 予約（画面の時刻＝JST）

どれも最後の行に結果を `RESULT {...}` の1行で出す。

## 投稿の前に必ず確かめること（ずれていたら押さない）

- キャプションの字が、渡した字と1字も違わない（編集欄の innerText で読む）
- `@` の後ろがメンション（TikTok の人への札）に化けていない
- 公開範囲が Everyone、AI 生成の印がオフ、「いつ投稿」が Now（予約なら Schedule）

## キャプションは貼り付けで入れる

編集欄は Draft.js。1字ずつ打つと `#` と `@` でハッシュタグ・人の候補が開き、
そのあとの Enter で**候補を選んでしまう**。貼り付け（paste のイベント）なら候補を通らない。
"""
import json, os, re, sys, time, urllib.request
sys.path.insert(0, "/home/ubuntu/cdp")
from cdp import Tab, up, pages, where, _port  # noqa: E402

NAME = "fish"
SHOTS = "/home/ubuntu/shots/post"
UPLOAD = "https://www.tiktok.com/tiktokstudio/upload?from=webapp"
CONTENT = "https://www.tiktok.com/tiktokstudio/content"
ED = "(document.querySelector('.public-DraftEditor-content') || document.querySelector('[contenteditable=true]'))"


def log(*a):
    print(time.strftime("%T"), *a, flush=True)


def result(d):
    print("RESULT " + json.dumps(d, ensure_ascii=False), flush=True)


def shot(t, name):
    os.makedirs(SHOTS, exist_ok=True)
    t.shot(f"{SHOTS}/{name}.jpg")


def fresh_tab(timeout=120):
    """新しいタブを1枚作り、ほかを閉じる（前の send-command のタブは固まることがある）"""
    import websocket
    port = up(NAME)
    v = json.load(urllib.request.urlopen(f"http://localhost:{port}/json/version"))
    b = websocket.create_connection(v["webSocketDebuggerUrl"], timeout=15, suppress_origin=True)
    n = [0]

    def bc(method, **params):
        n[0] += 1
        b.send(json.dumps({"id": n[0], "method": method, "params": params}))
        while True:
            m = json.loads(b.recv())
            if m.get("id") == n[0]:
                return m.get("result", {})
    old = pages(NAME)
    tid = bc("Target.createTarget", url="about:blank")["targetId"]
    for p in old:
        bc("Target.closeTarget", targetId=p["id"])
    b.close()
    time.sleep(1)
    p = next(p for p in pages(NAME) if p["id"] == tid)
    return Tab(_port(NAME), p, timeout=timeout)


def body(t):
    return t.js("document.body ? document.body.innerText : ''") or ""


def signed_in(t):
    u = t.url() or ""
    return "/login" not in u and "Log in to TikTok" not in body(t)


def key(t, k, code, vk, mods=0, text=None):
    p = {"key": k, "code": code, "windowsVirtualKeyCode": vk, "modifiers": mods}
    if text:
        p.update(text=text, unmodifiedText=text)
    t.call("Input.dispatchKeyEvent", type="keyDown", **p)
    t.call("Input.dispatchKeyEvent", type="keyUp", key=k, code=code, windowsVirtualKeyCode=vk, modifiers=mods)


def click_text(t, label, tags="button,div[role=button],span,div,label"):
    """字がちょうど label の、いちばん小さい見えている要素を押す"""
    return t.click(f"""[...document.querySelectorAll('{tags}')].filter(e => {{ const r = e.getBoundingClientRect();
        return r.width > 0 && r.height > 0 && (e.innerText || '').trim() === {json.dumps(label)}; }})
        .sort((a, b) => a.getBoundingClientRect().width * a.getBoundingClientRect().height - b.getBoundingClientRect().width * b.getBoundingClientRect().height)[0]""")


def has_text(t, label, tags="button,div[role=button],span,div,label"):
    return t.js(f"""[...document.querySelectorAll('{tags}')].some(e => {{ const r = e.getBoundingClientRect();
        return r.width > 0 && r.height > 0 && (e.innerText || '').trim() === {json.dumps(label)}; }})""")


def find_posts(t, needle):
    """TikTok Studio の投稿の一覧（新しい順）で needle を含む行の動画 URL を拾う"""
    t.go(CONTENT, wait=10)
    for _ in range(3):
        rows = t.js(f"""[...document.querySelectorAll('a[href*="/video/"]')].map(a => {{
            let r = a; for (let i = 0; i < 8 && r && !(r.innerText || '').includes({json.dumps(needle)}); i++) r = r.parentElement;
            return [a.href, !!(r && (r.innerText || '').includes({json.dumps(needle)}))]; }})""") or []
        if rows:
            break
        time.sleep(4)
    hits = sorted({h for h, ok in rows if ok})
    return hits, len(rows), needle in body(t)


def settings(t):
    """公開範囲・いつ投稿・スイッチ（AI 生成ほか）を字と一緒に読む"""
    return t.js(r"""(() => {
      const vis = [...document.querySelectorAll('div,span,button')].filter(e => e.getBoundingClientRect().width > 0 && /^(Everyone|Friends|Only you|全員|友達|自分のみ)$/.test((e.innerText || '').trim())).map(e => e.innerText.trim());
      const radios = [...document.querySelectorAll('input[type=radio]')].map(r => { let p = r; for (let i = 0; i < 3 && p; i++) p = p.parentElement; return [(p ? p.innerText : '').trim().slice(0, 20), r.checked]; });
      const sw = [...document.querySelectorAll('[role=switch], input[type=checkbox]')].map(s => {
        let p = s; for (let i = 0; i < 5 && p && (p.innerText || '').trim().length < 4; i++) p = p.parentElement;
        return [(p ? p.innerText : '').trim().replace(/\s+/g, ' ').slice(0, 50), s.getAttribute('aria-checked') ?? String(s.checked)]; });
      return {visibility: [...new Set(vis)], radios, switches: sw};
    })()""")


def post(t, mp4, caption, dry=False, at=None):
    if not os.path.exists(mp4):
        raise RuntimeError(f"no file: {mp4}")
    first = caption.split("\n")[0]
    hits, n, any_hit = find_posts(t, first)
    log("dup check rows", n, "hits", hits, "text-hit", any_hit)
    if not signed_in(t):
        result({"ok": False, "error": "signed_out", "at": where(t.url())})
        return
    if hits or any_hit:
        result({"ok": False, "error": "duplicate", "hits": hits})
        return
    t.go(UPLOAD, wait=10)
    if not signed_in(t):
        result({"ok": False, "error": "signed_out", "at": where(t.url())})
        return
    t.set_files("input[type=file]", [mp4])
    up_ok = False
    for i in range(90):
        time.sleep(2)
        if t.js(f"!!{ED}") and re.search(r"Uploaded|アップロード済み|アップロード完了", body(t)):
            up_ok = True
            break
    time.sleep(3)
    log("uploaded", up_ok)
    # 「自動のチェックを有効にしますか」が出たら、設定を変えずに閉じる
    if has_text(t, "Turn on automatic content checks?", "div,span,h1,h2,h3"):
        click_text(t, "Cancel", "button")
        time.sleep(1.5)
        log("closed auto-check modal")
    shot(t, "tt_1_uploaded")
    # キャプション: 全部選んで消し、貼り付けで入れる
    t.click(ED)
    time.sleep(0.5)
    key(t, "a", "KeyA", 65, mods=2)
    key(t, "Backspace", "Backspace", 8)
    time.sleep(0.8)
    left = t.js(f"{ED}.innerText").strip()
    log("after clear:", repr(left[:40]))
    pasted = t.js(f"""(() => {{ const e = {ED}; e.focus();
        const dt = new DataTransfer(); dt.setData('text/plain', {json.dumps(caption)});
        const ev = new ClipboardEvent('paste', {{clipboardData: dt, bubbles: true, cancelable: true}});
        e.dispatchEvent(ev); return ev.defaultPrevented; }})()""")
    time.sleep(2)
    key(t, "Escape", "Escape", 27)
    time.sleep(1)
    got = t.js(f"{ED}.innerText")
    norm = re.sub(r"\n+$", "", got or "")
    mention = t.js(f"""[...{ED}.querySelectorAll('*')].filter(e => /mention|hashtag|at-user|user-card/i.test(e.className || '')).map(e => [e.className.slice(0, 40), (e.innerText || '').slice(0, 30)])""")
    log("pasted handled:", pasted, "| caption match:", norm == caption, "| entities:", mention)
    if norm != caption:
        log("GOT:", json.dumps(got, ensure_ascii=False))
    # 「もっと見る」を開いて AI 生成の印などのスイッチを読む
    if has_text(t, "Show more"):
        click_text(t, "Show more")
        time.sleep(1.5)
    st = settings(t)
    log("settings", json.dumps(st, ensure_ascii=False))
    ai_on = [s for s in st["switches"] if re.search(r"AI-generated|AI生成|AI で生成", s[0]) and s[1] == "true"]
    disc_on = [s for s in st["switches"] if re.search(r"Disclose|コンテンツの開示", s[0]) and s[1] == "true"]
    everyone = any(v in ("Everyone", "全員") for v in st["visibility"])
    when = {r[0]: r[1] for r in st["radios"]}
    if at:
        click_text(t, "Schedule")
        time.sleep(2)
        shot(t, "tt_2_schedule")
        sched_ui = t.js("[...document.querySelectorAll('input')].filter(i => i.getBoundingClientRect().width > 0).map(i => [i.type, i.value, i.placeholder])")
        log("schedule inputs", sched_ui)
        result({"ok": False, "error": "schedule_not_implemented", "inputs": sched_ui})
        return
    now_ok = any(k.startswith("Now") and v for k, v in when.items()) or any(k.startswith("今すぐ") and v for k, v in when.items())
    shot(t, "tt_2_ready")
    ok = norm == caption and not mention and not ai_on and not disc_on and everyone and now_ok and up_ok
    info = {"caption_match": norm == caption, "entities": mention, "ai_on": ai_on, "disclose_on": disc_on,
            "everyone": everyone, "now": now_ok, "uploaded": up_ok}
    if not ok or dry:
        result(dict(info, ok=ok and dry, error=None if ok else "not_ready", dry=dry))
        return
    btn = """(document.querySelector('button[data-e2e="post_video_button"]') || [...document.querySelectorAll('button')].find(b => (b.innerText || '').trim() === 'Post'))"""
    if t.js(f"!{btn} || {btn}.disabled || {btn}.getAttribute('aria-disabled') === 'true'"):
        result(dict(info, ok=False, error="post_button_disabled"))
        return
    t.click(btn)
    log("clicked Post")
    t0 = time.time()
    for _ in range(60):
        time.sleep(2)
        u = t.url() or ""
        if "/tiktokstudio/content" in u or "/tiktokstudio/upload" not in u:
            break
        # 「投稿してよいか」の念押しが出たら、内容を出して止まる（字が読めないものは押さない）
        modal = t.js("(() => { const m = [...document.querySelectorAll('[role=dialog], .TUXModal, [class*=modal]')].find(e => e.offsetParent); return m ? m.innerText.trim().slice(0, 300) : null; })()")
        if modal and not re.search(r"Uploading|Posting|投稿中", modal):
            log("modal:", modal)
            if re.search(r"Post now|今すぐ投稿", modal):
                click_text(t, "Post now", "button")
    log("after post", where(t.url()), int(time.time() - t0), "s")
    shot(t, "tt_3_after")
    time.sleep(8)
    hits, n, any_hit = find_posts(t, caption.split("\n")[0])
    shot(t, "tt_4_content")
    result(dict(info, ok=bool(hits), posted=True, urls=hits, rows=n, text_hit=any_hit))


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else ""
    if cmd == "check":
        t = fresh_tab()
        hits, n, any_hit = find_posts(t, sys.argv[2])
        result({"ok": True, "signed_in": signed_in(t), "at": where(t.url()), "hits": hits, "rows": n, "text_hit": any_hit})
    elif cmd == "post":
        args = sys.argv[2:]
        at = args[args.index("--at") + 1] if "--at" in args else None
        t = fresh_tab()
        post(t, args[0], open(args[1], encoding="utf-8").read(), dry="--dry" in args, at=at)
    else:
        sys.exit(__doc__)
