#!/usr/bin/env python3
"""EC2 の上で動く。TikTok Studio（web）にショートを上げる。

`ec2-chrome` の cdp.py の上に乗る。TikTok にログインしてあるのは `~/cdp-fish` の Chrome
（あやとが既定のプロファイルでログインし、Fish Audio の用で複製したもの。2026-10-15）。
手元から `ec2.py put` で `~/cdp/tt_post.py` に置き、手元の `post.py` から呼ぶ（README.md）。

    python3 tt_post.py check <探す字>                          # ログインしているか・同じ投稿がもう在るか
    python3 tt_post.py post <mp4> <caption.txt> --dry          # 投稿の手前まで（字と設定を確かめて、投稿しない）
    python3 tt_post.py post <mp4> <caption.txt>                # 投稿する
    python3 tt_post.py post <mp4> <caption.txt> --at 2026-10-21T10:00   # 予約（UTC。EC2 の Chrome の時計が UTC で、欄もその時刻）
    python3 tt_post.py post <mp4> <caption.txt> --at 2026-10-21T10:00 --dry --probe   # 時刻の欄を開いて中身を書き出すだけ
    python3 tt_post.py scheduled <探す字> 2026-10-21T10:00:00Z  # 予約の読み直し（一覧の行に予約の時刻の札が出ているか）

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
sys.path.insert(0, os.path.expanduser("~ubuntu/cdp"))
from cdp import Tab, up, pages, where, _port  # noqa: E402

NAME = "fish"
SHOTS = os.path.expanduser("~ubuntu/shots/post")
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


SCHED_INPUTS = r"""(() => { const ins = [...document.querySelectorAll('input[type=text]')].filter(i => i.getBoundingClientRect().width > 0);
  const tm = ins.find(i => /^\d{2}:\d{2}$/.test(i.value)), dt = ins.find(i => /^\d{4}-\d{2}-\d{2}$/.test(i.value));
  return {time: tm ? tm.value : null, date: dt ? dt.value : null}; })()"""


def schedule_label(at_utc):
    """一覧の行に出る時刻の札の字（EC2 の Chrome の時計＝UTC で出る）。2026-10-21T10:00:00Z なら Oct 21, 10:00 AM"""
    import datetime as dt
    w = dt.datetime.strptime(at_utc[:16], "%Y-%m-%dT%H:%M")
    h12 = w.hour % 12 or 12
    return f"{w.strftime('%b')} {w.day}, {h12}:{w.minute:02d} {'AM' if w.hour < 12 else 'PM'}"


def scheduled_row(t, needle, at_utc):
    """投稿の一覧（find_posts で開いた画面）で、needle を含む行に、予約の時刻の札（未来の時刻）が出ているか。
    予約の行は公開範囲の札が灰色で、作った日の代わりに時計の印と予約の時刻が出る（2026-10-21 に見た）。
    出した行にも「Oct 18, 7:59 PM」のような時刻が出るが、それは過去なので、未来の予約の時刻と一致するかで見分ける"""
    label = schedule_label(at_utc)
    # 時刻と AM のあいだは細い空白（U+202F）のことがあるので、空白をそろえてから比べる
    row = t.js(f"""(() => {{ const norm = s => (s || '').replace(/[\\s\\u00a0\\u202f]+/g, ' ');
      const els = [...document.querySelectorAll('div,tr,li')].filter(e => e.getBoundingClientRect().width > 0
        && norm(e.innerText).includes({json.dumps(needle)}) && norm(e.innerText).includes({json.dumps(label)}));
      els.sort((a, b) => a.innerText.length - b.innerText.length);
      return els[0] ? norm(els[0].innerText).trim().slice(0, 300) : null; }})()""")
    if not row:
        # 見つからないときは、題の行の字をそのまま返して人が見られるようにする
        seen = t.js(f"""(() => {{ const els = [...document.querySelectorAll('div,tr,li')].filter(e => e.getBoundingClientRect().width > 0
            && (e.innerText || '').includes({json.dumps(needle)}) && /\\d{{1,2}}:\\d{{2}}/.test(e.innerText || ''));
          els.sort((a, b) => a.innerText.length - b.innerText.length);
          return els[0] ? JSON.stringify(els[0].innerText.trim().slice(0, 300)) : null; }})()""")
        log("schedule row not matched; nearest row:", seen, "| want label:", label)
    return {"label": label, "row": row} if row else None


def picker_dump(t):
    """開いている選ぶ欄（時刻・日付）の、数字だけの字を持つ要素（見当をつける用）"""
    return t.js(r"""[...document.querySelectorAll('body *')].filter(e => { const r = e.getBoundingClientRect();
        return r.width > 0 && r.height > 0 && e.children.length === 0 && /^\d{1,2}$/.test((e.innerText || '').trim()); })
      .slice(0, 120).map(e => { const r = e.getBoundingClientRect(); return [e.innerText.trim(), e.tagName.toLowerCase(), (e.className || '').toString().slice(0, 50),
        (e.parentElement && e.parentElement.className || '').toString().slice(0, 50), Math.round(r.x), Math.round(r.y)]; })""")


def set_schedule(t, at, probe=False):
    """「When to post」を Schedule にして、日付と時刻の欄を at（EC2 の Chrome の時計＝UTC。"2026-10-21T10:00"）に合わせる。
    合わせた値を欄から読み直して返す。probe なら時刻の欄を開いて中身を書き出すだけ"""
    off = t.js("new Date().getTimezoneOffset()")
    if off != 0:
        return {"ok": False, "error": "chrome_clock_not_utc", "offset_min": off}
    m = re.fullmatch(r"(\d{4}-\d{2}-\d{2})[T ](\d{2}):(\d{2})(?::00)?Z?", at.strip())
    if not m:
        return {"ok": False, "error": "bad_at", "at": at}
    want_date, hh, mm = m.group(1), m.group(2), m.group(3)
    t.click("document.querySelector('input[type=radio][value=schedule]')")
    time.sleep(2)
    before = t.js(SCHED_INPUTS)
    log("schedule fields before", before)
    if not before.get("time"):
        return {"ok": False, "error": "schedule_fields_missing", "before": before}
    time_in = r"""[...document.querySelectorAll('input[type=text]')].find(i => /^\d{2}:\d{2}$/.test(i.value))"""
    t.click(time_in)
    time.sleep(1.5)
    if probe:
        shot(t, "tt_sched_time_open")
        return {"ok": True, "before": before, "time_picker": picker_dump(t)}
    if before.get("date") != want_date:
        # 日付の欄（暦）はまだ押すところまで作っていない。今日の日付だけ（欄の既定が今日）
        return {"ok": False, "error": "date_picker_not_implemented", "before": before, "want": want_date}
    # 時刻の欄は左の列が時（00〜23）、右の列が分（5分おき）。どちらも .tiktok-timepicker-option-item の中の字
    for side, val in (("le", hh), ("ri", mm)):
        opt = f"""[...document.querySelectorAll('.tiktok-timepicker-option-item')].find(e => {{ const s = e.querySelector('span');
            return s && (s.className || '').toString().includes('tiktok-timepicker-{side}') && s.innerText.trim() === {json.dumps(val)}; }})"""
        if not t.js(f"!!({opt})"):
            return {"ok": False, "error": f"time_option_missing_{side}", "want": val, "before": before}
        t.js(f"({opt}).scrollIntoView({{block: 'center'}})")
        time.sleep(0.5)
        t.click(opt)
        time.sleep(1)
    # 選ぶ欄を閉じる（blur だけでは開いたまま残った。キャプションを貼ったあとと同じく Escape で閉じる）
    t.js("document.activeElement && document.activeElement.blur()")
    key(t, "Escape", "Escape", 27)
    time.sleep(1)
    log("time picker still open:", t.js("[...document.querySelectorAll('.tiktok-timepicker-option-item')].some(e => e.getBoundingClientRect().width > 0)"))
    after = t.js(SCHED_INPUTS)
    radio_on = t.js("(() => { const r = document.querySelector('input[type=radio][value=schedule]'); return !!(r && r.checked); })()")
    shot(t, "tt_sched_set")
    ok = after.get("time") == f"{hh}:{mm}" and after.get("date") == want_date and radio_on
    return {"ok": ok, "error": None if ok else "schedule_not_set", "before": before, "after": after, "schedule_radio": radio_on,
            "utc": f"{want_date}T{hh}:{mm}:00Z"}


def post(t, mp4, caption, dry=False, at=None, cover=None, probe=False):
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
    # Linux の Chrome では、CDP の Ctrl+A（modifiers だけ）が全選択にならない（ファイル名「A」が残った）。
    # 全選択の命令を付けて送り、残ったら末尾から字数ぶん Backspace で消す
    t.call("Input.dispatchKeyEvent", type="keyDown", key="a", code="KeyA", windowsVirtualKeyCode=65, modifiers=2, commands=["selectAll"])
    t.call("Input.dispatchKeyEvent", type="keyUp", key="a", code="KeyA", windowsVirtualKeyCode=65, modifiers=2)
    key(t, "Backspace", "Backspace", 8)
    time.sleep(0.8)
    for _ in range(3):
        left = t.js(f"{ED}.innerText").strip()
        if not left:
            break
        key(t, "End", "End", 35, mods=2)
        for _ in range(len(left) + 2):
            key(t, "Backspace", "Backspace", 8)
        time.sleep(0.5)
    left = t.js(f"{ED}.innerText").strip()
    log("after clear:", repr(left[:40]))
    # 消し切れなかった字（2026-10-21 はファイル名「p2」が残った）は、範囲で選んでから貼る。貼り付けが選んだ字を置き換える
    select_all = f"""(() => {{ const e = {ED}; e.focus(); const r = document.createRange(); r.selectNodeContents(e);
        const s = getSelection(); s.removeAllRanges(); s.addRange(r); return s.toString().length; }})()"""
    if left:
        log("selected to replace:", t.js(select_all))
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
    if cover:
        # サムネイル（カバー）は題の札が見えるコマにする（あやと 2026-10-17）。コマを選ぶ窓より、
        # 書き出しから切り出した絵を上げるほうが、どのコマになるかが確か
        opened = click_text(t, "Edit cover") or click_text(t, "カバーを編集")
        time.sleep(3)
        log("cover modal opened", opened, "|", (t.js("(() => { const m = [...document.querySelectorAll('[role=dialog], .TUXModal, [class*=modal], [class*=Modal]')].find(e => e.offsetParent); return m ? m.innerText.trim().slice(0, 200) : null; })()") or ""))
        click_text(t, "Upload cover") or click_text(t, "カバーをアップロード")
        time.sleep(2)
        try:
            t.set_files("input[type=file][accept*='image']", [cover])
            log("cover file set")
        except Exception as e:
            log("cover file input not found", e)
            shot(t, "tt_cover_fail")
            result({"ok": False, "error": "cover_input"})
            return
        time.sleep(5)
        shot(t, "tt_cover_set")
        # 窓の右上の「Save」は button ではなく div のことがある。字で探し、見つからなければ止める
        done = None
        for label in ("Save", "保存", "Confirm", "確認"):
            try:
                done = click_text(t, label)
                break
            except RuntimeError:
                continue
        if not done:
            shot(t, "tt_cover_nosave")
            result({"ok": False, "error": "cover_save"})
            return
        time.sleep(3)
        log("cover confirmed", done)
        shot(t, "tt_cover_done")
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
        sc = set_schedule(t, at, probe=probe)
        log("schedule", json.dumps(sc, ensure_ascii=False))
        if probe or not sc.get("ok"):
            result(dict(sc, ok=False if not probe else sc.get("ok", False), probe=probe))
            return
    # ラジオ2つの字が同じ（"Now\nSchedule"）になるので dict にすると後ろが勝つ。並びの先頭が Now
    # 予約なら「Schedule」が選ばれて日時が合っていること（set_schedule が欄から読み直した値）。予約でなければ Now
    now_ok = bool(sc["ok"]) if at else (bool(st["radios"]) and st["radios"][0][1] is True)
    shot(t, "tt_2_ready")
    ok = norm == caption and not mention and not ai_on and not disc_on and everyone and now_ok and up_ok
    info = {"caption_match": norm == caption, "entities": mention, "ai_on": ai_on, "disclose_on": disc_on,
            "everyone": everyone, ("schedule" if at else "now"): now_ok, "uploaded": up_ok}
    if at:
        info["schedule_utc"] = sc.get("utc")
        info["schedule_fields"] = sc.get("after")
    if not ok or dry:
        result(dict(info, ok=ok and dry, error=None if ok else "not_ready", dry=dry))
        return
    btn = """(document.querySelector('button[data-e2e="post_video_button"]') || [...document.querySelectorAll('button')].find(b => /^(Post|Schedule)$/.test((b.innerText || '').trim())))"""
    label = t.js(f"({btn}) ? ({btn}).innerText.trim() : null")
    log("post button label:", label)
    if at and label != "Schedule":
        # 予約のつもりで「Post」を押すと、その場で出てしまう。字が Schedule でなければ押さない
        result(dict(info, ok=False, error="button_not_schedule", label=label))
        return
    if t.js(f"!{btn} || {btn}.disabled || {btn}.getAttribute('aria-disabled') === 'true'"):
        result(dict(info, ok=False, error="post_button_disabled"))
        return
    t.click(btn)
    log("clicked", label)
    t0 = time.time()
    for _ in range(60):
        time.sleep(2)
        u = t.url() or ""
        if "/tiktokstudio/content" in u or "/tiktokstudio/upload" not in u:
            break
        # 「投稿してよいか」の念押しが出たら、内容を出して止まる（字が読めないものは押さない）
        modal = t.js("(() => { const m = [...document.querySelectorAll('[role=dialog], .TUXModal, [class*=modal]')].find(e => e.offsetParent); return m ? m.innerText.trim().slice(0, 300) : null; })()")
        if modal and not re.search(r"Uploading|Posting|投稿中|Scheduling", modal):
            log("modal:", modal)
            if at:
                # 予約のときは念押しの窓を押さない（「Post now」は今すぐ出す）。何の窓かを残して止まる
                shot(t, "tt_sched_modal")
                break
            if re.search(r"Post now|今すぐ投稿", modal):
                click_text(t, "Post now", "button")
    log("after post", where(t.url()), int(time.time() - t0), "s")
    shot(t, "tt_3_after")
    time.sleep(8)
    hits, n, any_hit = find_posts(t, caption.split("\n")[0])
    shot(t, "tt_4_content")
    sched_row = scheduled_row(t, caption.split("\n")[0], sc.get("utc")) if at else None
    result(dict(info, ok=bool(hits) or bool(at and sched_row), posted=not at, scheduled=bool(at and sched_row),
                schedule_row=sched_row, urls=hits, rows=n, text_hit=any_hit))


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else ""
    if cmd == "check":
        t = fresh_tab()
        hits, n, any_hit = find_posts(t, sys.argv[2])
        result({"ok": True, "signed_in": signed_in(t), "at": where(t.url()), "hits": hits, "rows": n, "text_hit": any_hit})
    elif cmd == "scheduled":
        # 予約の読み直し: python3 tt_post.py scheduled <探す字> <UTC の ISO>
        t = fresh_tab()
        hits, n, any_hit = find_posts(t, sys.argv[2])
        row = scheduled_row(t, sys.argv[2], sys.argv[3])
        result({"ok": bool(row), "hits": hits, "rows": n, "scheduled": row})
    elif cmd == "post":
        args = sys.argv[2:]
        at = args[args.index("--at") + 1] if "--at" in args else None
        cover = args[args.index("--cover") + 1] if "--cover" in args else None
        t = fresh_tab()
        post(t, args[0], open(args[1], encoding="utf-8").read(), dry="--dry" in args, at=at, cover=cover,
             probe="--probe" in args)
    else:
        sys.exit(__doc__)
