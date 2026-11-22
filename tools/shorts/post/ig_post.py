#!/usr/bin/env python3
"""EC2 の上で動く。Instagram（web）にショートをリールとして上げる・予約する。

`ec2-chrome` の cdp.py の上に乗る。Instagram（ayato.arigato）にログインしてあるのは `~/cdp-instagram` の Chrome
（あやとが既定のプロファイルで入っていたものを、2026-11-22 に `up("instagram")` で複製した）。列も `instagram`。
手元から `ec2.py put` で `~/cdp/ig_post.py` に置き、手元の `post.py ig-post` から呼ぶ（README.md）。

    python3 ig_post.py check                                                   # ログインしているか
    python3 ig_post.py post <mp4> <caption.txt> --cover-at <秒> --at 2026-11-22T12:30 --dry     # 押す手前まで（欄を入れて読み直し、捨てる）
    python3 ig_post.py post <mp4> <caption.txt> --cover-at <秒> --at 2026-11-22T12:30 --probe   # 予約の欄を開いて中身を書き出すだけ
    python3 ig_post.py post <mp4> <caption.txt> --cover-at <秒> --at 2026-11-22T12:30           # 予約する（--at が無ければ今すぐ出す）
    python3 ig_post.py scheduled <題の行> 2026-11-22T12:30:00Z                  # 予約の一覧で読み直す

どれも最後の行に結果を `RESULT {...}` の1行で出す。

## 押す前に必ず確かめること（ずれていたら押さない）

- キャプションの字が、渡した字と1字も違わない（編集欄の段を改行で繋いで読む）
- 「AI ラベル」と「Facebook にもシェア」がオフ（あやとの頼みは Instagram だけ。TikTok と同じく AI の印は付けない）
- 予約なら「Schedule content」がオンで、欄の日時が --at と同じ（EC2 の Chrome の時計は UTC。欄もその時刻）
- 押すボタンの字が、予約なら Schedule、今すぐなら Share

## キャプションは貼り付けで入れる

編集欄は Lexical。1字ずつ打つと `#` と `@` で候補が開き、そのあとの改行で候補を選んでしまう（TikTok と同じ）。
貼り付け（paste のイベント）なら候補を通らない。
"""
import datetime, json, os, re, sys, time, urllib.request
sys.path.insert(0, os.path.expanduser("~ubuntu/cdp"))
from cdp import Tab, up, pages, where, _port  # noqa: E402

NAME = "instagram"
ME = "ayato.arigato"
SHOTS = os.path.expanduser("~ubuntu/shots/ig")
HOME = "https://www.instagram.com/"
VIS = "(e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; })"
DLG = f"[...document.querySelectorAll('[role=dialog]')].filter({VIS})"
ED = "document.querySelector('[role=dialog] [contenteditable=true]')"


def log(*a):
    print(time.strftime("%T"), *a, flush=True)


def result(d):
    print("RESULT " + json.dumps(d, ensure_ascii=False), flush=True)


def shot(t, name):
    os.makedirs(SHOTS, exist_ok=True)
    t.shot(f"{SHOTS}/{name}.jpg")


def fresh_tab(timeout=90):
    """新しいタブを1枚作り、ほかを閉じる（前の send-command のタブは固まることがある。2026-11-22 に1回固まった）"""
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


def find_btn(t, rx, scope="document"):
    """字（無ければ aria-label）が rx に合う、いちばん小さい見えている押せるものの中心。無ければ None"""
    return t.js(f"""(() => {{ const es = [...{scope}.querySelectorAll('button, [role=button], a, [role=menuitem], span, svg[aria-label]')].filter({VIS})
        .filter(e => {rx}.test(((e.innerText || '').trim() || e.getAttribute('aria-label') || '').trim()));
        es.sort((a, b) => a.getBoundingClientRect().width * a.getBoundingClientRect().height - b.getBoundingClientRect().width * b.getBoundingClientRect().height);
        const e = es[0]; if (!e) return null; const r = e.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; }})()""")


def press(t, rx, scope="document", wait=2.5):
    c = find_btn(t, rx, scope)
    if c:
        t.click_at(c[0], c[1])
        time.sleep(wait)
    return bool(c)


def dialogs(t):
    return t.js(f"{DLG}.map(d => d.innerText.trim().replace(/\\s+/g, ' ').slice(0, 400))") or []


def wait_dialog(t, rx, timeout=60):
    """見えている窓の字が rx に合うまで待つ"""
    end = time.time() + timeout
    while time.time() < end:
        if t.js(f"{DLG}.some(d => {rx}.test(d.innerText || ''))"):
            return True
        time.sleep(1.5)
    return False


def signed_in(t):
    """ログインの欄が無く、自分のプロフィールへのリンクが在る"""
    return bool(t.js(f"""!document.querySelector('input[name=username]') &&
        [...document.querySelectorAll('a[href="/{ME}/"]')].length > 0"""))


def switches(t):
    """最後の段のスイッチ（AI ラベル・予約・Facebook にもシェア）を、行の字と一緒に読む"""
    return t.js(f"""[...document.querySelectorAll('[role=dialog] input[type=checkbox], [role=dialog] [role=switch]')].map(s => {{
        let p = s; for (let i = 0; i < 6 && p && (p.innerText || '').trim().length < 4; i++) p = p.parentElement;
        const box = (s.getBoundingClientRect().width ? s : s.parentElement).getBoundingClientRect();
        return [(p ? p.innerText : '').trim().replace(/\\s+/g, ' ').slice(0, 60), s.getAttribute('aria-checked') ?? String(s.checked),
                [Math.round(box.x + box.width / 2), Math.round(box.y + box.height / 2)], box.width > 0]; }})""") or []


def switch_state(sw, rx):
    """switches() の並びから、行の字が rx に合うものの (on か, 座標)。無ければ (None, None)"""
    for label, on, xy, vis in sw:
        if re.search(rx, label):
            return on == "true", xy
    return None, None


def parse_at(at):
    """--at（UTC）を読む。分が5の倍数でない・読めないものは None（近い時刻に化けさせない）"""
    m = re.fullmatch(r"(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::00)?Z?", at or "")
    if not m or int(m.group(5)) % 5:
        return None
    try:
        return datetime.datetime(*map(int, m.groups()))
    except ValueError:
        return None


def paste_caption(t, cap):
    t.js(f"{ED}.focus()")
    time.sleep(0.5)
    t.js(f"""(() => {{ const e = {ED}; const dt = new DataTransfer(); dt.setData('text/plain', {json.dumps(cap)});
        e.dispatchEvent(new ClipboardEvent('paste', {{clipboardData: dt, bubbles: true, cancelable: true}})); }})()""")
    time.sleep(2)
    return read_caption(t)


def read_caption(t):
    """段（p）の字を改行で繋ぐ。innerText は空の段を改行2つに読む（TikTok の Draft.js と同じ落とし穴）"""
    return t.js(f"""(() => {{ const e = {ED}; if (!e) return null; const ps = [...e.querySelectorAll('p')];
        const txt = p => {{ const c = p.cloneNode(true); c.querySelectorAll('br').forEach(b => b.replaceWith('\\n')); return c.textContent; }};
        return ps.length ? ps.map(txt).join('\\n') : e.innerText; }})()""")


# 編集の段の「Cover photo」の、選んだコマの枠（小さい video）と、コマの帯の左右。枠の video の currentTime が選んだ秒
COVER_SEL = f"""(() => {{ const d = {DLG}[0]; if (!d) return null;
    const v = [...d.querySelectorAll('video')].filter({VIS}).find(v => v.getBoundingClientRect().width < 150); if (!v) return null;
    const r = v.getBoundingClientRect();
    const th = [...d.querySelectorAll('div')].filter({VIS}).filter(e => getComputedStyle(e).backgroundImage.startsWith('url')
        && Math.abs(e.getBoundingClientRect().y - r.y) < 6 && e.getBoundingClientRect().width < 150).map(e => e.getBoundingClientRect());
    if (!th.length) return null;
    return {{x: r.x, y: r.y, w: r.width, h: r.height, t: v.currentTime, dur: v.duration,
             left: Math.min(...th.map(b => b.x)), right: Math.max(...th.map(b => b.x + b.width))}}; }})()"""
COVER_TOL = 0.25


def drag(t, x0, y, x1, steps=8, over=15):
    """x0 から x1 へ引く。行き過ぎてから戻る（数 px だけ動かすと、引いたとみなされずに枠が動かない）"""
    xo = x1 + (over if x1 >= x0 else -over)
    path = [x0 + (xo - x0) * i / steps for i in range(1, steps + 1)] + [xo + (x1 - xo) * i / 4 for i in range(1, 5)]
    t.call("Input.dispatchMouseEvent", type="mouseMoved", x=x0, y=y)
    t.call("Input.dispatchMouseEvent", type="mousePressed", x=x0, y=y, button="left", clickCount=1)
    for x in path:
        t.call("Input.dispatchMouseEvent", type="mouseMoved", x=x, y=y, button="left", buttons=1)
        time.sleep(0.05)
    t.call("Input.dispatchMouseEvent", type="mouseReleased", x=x1, y=y, button="left", clickCount=1)


def cover_step(s, sec):
    """選んだコマの枠を何 px 動かすか。帯の幅から枠の幅を引いた長さが、動画の頭から尻までに当たる見立て"""
    span = s["right"] - s["left"] - s["w"]
    return (sec - s["t"]) / s["dur"] * span if s["dur"] and span > 0 else None


def set_cover_frame(t, sec):
    """カバーを、動画の sec 秒のコマにする。「Select from computer」に絵を渡しても Instagram は受け取らなかった
    （2026-11-22。欄に直に渡しても、ファイル選びの窓を横取りして渡しても、カバーの欄は替わらなかった）ので、
    人と同じく「Cover photo」のコマの枠を引いて選び、枠の video の currentTime で読み直す"""
    s = None
    for _ in range(10):
        s = t.js(COVER_SEL)
        if s and s.get("dur"):
            break
        time.sleep(1)
    if not s or not s.get("dur"):
        return {"ok": False, "error": "cover_selector_not_found"}
    if sec > s["dur"]:
        return {"ok": False, "error": "cover_after_end", "dur": s["dur"]}
    per_px = None  # 1 px で何秒動いたか（引いた結果から測り直す。最初は帯の幅からの見立て）
    seen = []
    for _ in range(8):
        seen.append(round(s["t"], 2))
        if abs(s["t"] - sec) <= COVER_TOL:
            return {"ok": True, "t": round(s["t"], 2), "want": sec, "tries": seen}
        dx = (sec - s["t"]) / per_px if per_px else cover_step(s, sec)
        if dx is None:
            return {"ok": False, "error": "cover_strip_unexpected"}
        if abs(dx) < 6:
            # 数 px だけ引いても、放した所が押した所に近いと押しただけになり、枠が動かない（0.5秒は 2px。2026-11-22）。
            # いったん的を越えて 30px 先へ引き、次の回に大きく引き戻す
            dx += 30 if s["x"] - s["left"] < 40 else -30
        cx, cy = s["x"] + s["w"] / 2, s["y"] + s["h"] / 2
        drag(t, cx, cy, cx + dx)
        time.sleep(1.5)
        s2 = t.js(COVER_SEL) or s
        moved = s2["t"] - s["t"]
        if abs(moved) > 0.01 and moved * dx > 0:
            per_px = moved / dx
        s = s2
    return {"ok": abs(s["t"] - sec) <= COVER_TOL, "t": round(s["t"], 2), "want": sec, "tries": seen,
            **({} if abs(s["t"] - sec) <= COVER_TOL else {"error": "cover_frame_mismatch"})}


def compose(t, mp4, cover_at):
    """新しい投稿の窓を開き、動画を渡して、切り抜き → 編集（カバー）→ 最後の段まで進む。ok なら None、だめなら理由"""
    t.go(HOME, wait=6)
    if not signed_in(t):
        return "not_signed_in"
    press(t, "/^Not Now$/")
    if not press(t, "/^New post$/"):
        return "new_post_not_found"
    if not t.js("!!document.querySelector('[role=dialog] input[type=file]')"):
        press(t, "/^Post$/")
    if not t.js("!!document.querySelector('[role=dialog] input[type=file]')"):
        return "file_input_not_found"
    t.set_files("[role=dialog] input[type=file]", [mp4])
    if not wait_dialog(t, "/^Crop|Video posts are now shared as reels/", 90):
        shot(t, "ig_1_upload")
        return "crop_not_shown"
    time.sleep(2)
    press(t, "/^OK$/")
    shot(t, "ig_1_crop")
    if not press(t, "/^Next$/", f"({DLG}[0])", 4) or not wait_dialog(t, "/Cover photo/", 60):
        return "edit_not_shown"
    if cover_at is not None:
        r = set_cover_frame(t, cover_at)
        log("cover frame:", r)
        if not r.get("ok"):
            return r.get("error") or "cover_frame_not_set"
    shot(t, "ig_2_edit")
    if not press(t, "/^Next$/", f"({DLG}[0])", 4) or not wait_dialog(t, "/Add a caption|Write a caption/", 60):
        return "final_not_shown"
    return None


def discard(t):
    t.key("Escape", "Escape", 27)
    time.sleep(2)
    if not press(t, "/^Discard$/"):
        press(t, "/^Close$/")
        press(t, "/^Discard$/")
    return not dialogs(t)


DATE_BOX = f"""(() => {{ const l = [...document.querySelectorAll('[role=dialog] *')].filter({VIS}).find(e => e.children.length === 0 && /^[A-Z][a-z]{{2}}, [A-Z][a-z]{{2}} \\d{{1,2}}, \\d{{4}}$/.test((e.innerText || '').trim()));
    if (!l) return null; let b = l; for (let i = 0; i < 5 && b && b.getAttribute('role') !== 'button' && b.tagName !== 'BUTTON'; i++) b = b.parentElement;
    b = b || l; b.scrollIntoView({{block: 'center'}}); const r = b.getBoundingClientRect(); return [l.innerText.trim(), r.x + r.width / 2, r.y + r.height / 2]; }})()"""
CELLS = f"[...document.querySelectorAll('[role=gridcell]')].filter({VIS}).map(e => [(e.innerText || '').trim(), e.getAttribute('aria-disabled'), e.getAttribute('aria-selected')])"
SPIN = f"""[...document.querySelectorAll('[role=dialog] [role=spinbutton]')].filter(e => /^(Hours|Minutes|AM PM)$/.test(e.getAttribute('aria-label') || ''))
    .map(e => [e.getAttribute('aria-label'), e.value || '', e.getAttribute('aria-valuenow') || '', e.getAttribute('aria-valuetext') || ''])"""


def date_label(d):
    """日付の箱の字（「Sun, Nov 22, 2026」）。暦で押したあと、この字になっているかで読み直す"""
    return f"{d:%a, %b} {d.day}, {d.year}"


def pick_day(cells, want):
    """暦のます（[字, aria-disabled, aria-selected]）から、want の日を押す位置。(位置, None) か (None, 理由)。
    頭に前の月の日・尻に次の月の日が並ぶことがあるので、字だけで探さない。「1」の最初の位置からその月の日数ぶんを今月とみなし、
    その並びが 1〜月末で切れていて、押す位置の字が日と同じで、押せる（aria-disabled が false）ときだけ押す"""
    nxt = (want.replace(day=28) + datetime.timedelta(days=4)).replace(day=1)
    ndays = (nxt - datetime.timedelta(days=1)).day
    texts = [c[0] for c in cells]
    if "1" not in texts:
        return None, "calendar_grid_unexpected"
    i0 = texts.index("1")
    month = texts[i0:i0 + ndays]
    if month != [str(d) for d in range(1, ndays + 1)] or (len(texts) > i0 + ndays and texts[i0 + ndays] != "1"):
        return None, "calendar_grid_unexpected"
    k = i0 + want.day - 1
    if cells[k][1] != "false":
        return None, "date_not_selectable"
    return k, None


def month_steps(shown, want):
    """日付の箱の字（いま選ばれている日）から、暦を何か月送るか。読めなければ None"""
    try:
        d = datetime.datetime.strptime(shown, "%a, %b %d, %Y")
    except (TypeError, ValueError):
        return None
    return (want.year - d.year) * 12 + want.month - d.month


def type_keys(t, text):
    for ch in text:
        code = f"Digit{ch}" if ch.isdigit() else f"Key{ch.upper()}"
        t.call("Input.dispatchKeyEvent", type="keyDown", key=ch, code=code, text=ch, unmodifiedText=ch, windowsVirtualKeyCode=ord(ch.upper()))
        t.call("Input.dispatchKeyEvent", type="keyUp", key=ch, code=code, windowsVirtualKeyCode=ord(ch.upper()))
        time.sleep(0.2)


def want_time(want):
    """時刻の欄に入る字（12時間制）。(時, 分, AM/PM)"""
    return str(want.hour % 12 or 12), f"{want.minute:02d}", "AM" if want.hour < 12 else "PM"


def read_time(t):
    """時刻の欄を (時, 分, AM/PM) で読む。値は value・aria-valuetext・aria-valuenow のうち字の在るもの"""
    got = {}
    for label, v, now, txt in t.js(SPIN) or []:
        got[label] = (v or txt or now).strip()
    if not got:
        return None
    h, m, ap = got.get("Hours", ""), got.get("Minutes", ""), got.get("AM PM", "").upper()
    return (str(int(h)) if h.isdigit() else h, m.zfill(2) if m.isdigit() else m, ap)


def set_schedule(t, want, sw):
    """「Schedule content」をオンにし、暦で日を押し、時刻を打つ。読み直して --at と同じでなければ ok にしない"""
    on, xy = switch_state(sw, r"^Schedule content")
    if on is None:
        return {"ok": False, "error": "schedule_switch_not_found"}
    if not on:
        t.click_at(*xy)
        time.sleep(3)
    box = t.js(DATE_BOX)
    if not box:
        return {"ok": False, "error": "date_box_not_found"}
    want_label = date_label(want)
    if box[0] != want_label:
        steps = month_steps(box[0], want)
        if steps is None or steps < 0 or steps > 2:
            return {"ok": False, "error": "date_too_far", "shown": box[0]}
        t.click_at(box[1], box[2])
        time.sleep(2)
        for _ in range(steps):
            if not press(t, "/^Next month$/", wait=1.5):
                return {"ok": False, "error": "next_month_not_found"}
        cells = t.js(CELLS) or []
        k, why = pick_day(cells, want)
        if why:
            t.key("Escape", "Escape", 27)
            return {"ok": False, "error": why, "cells": len(cells)}
        c = t.center(f"[...document.querySelectorAll('[role=gridcell]')].filter({VIS})[{k}]")
        t.click_at(*c)
        time.sleep(2)
        if t.js(CELLS):
            # 押しても暦が閉じなければ、日付の箱を押し直して閉じる
            b2 = t.js(DATE_BOX)
            if b2:
                t.click_at(b2[1], b2[2])
                time.sleep(1.5)
        box = t.js(DATE_BOX)
    hh, mm, ap = want_time(want)
    for label, text in (("Hours", hh.zfill(2)), ("Minutes", mm), ("AM PM", ap[0])):
        c = t.center(f"document.querySelector('[role=dialog] [role=spinbutton][aria-label=\"{label}\"]')")
        if not c:
            return {"ok": False, "error": "time_input_not_found", "which": label}
        t.click_at(*c)
        time.sleep(0.5)
        type_keys(t, text)
        time.sleep(0.8)
    got_time = read_time(t)
    box = t.js(DATE_BOX)
    still_open = bool(t.js(CELLS))
    ok = bool(box) and box[0] == want_label and got_time == (hh, mm, ap) and not still_open
    return {"ok": ok, "date": box[0] if box else None, "want_date": want_label, "time": got_time, "want_time": [hh, mm, ap],
            "calendar_open": still_open, **({} if ok else {"error": "schedule_readback_mismatch"})}


def media_from_network(t):
    """押したあとの応答（configure_to_clips）から、できたリールの media の pk と符号を拾う。字（キャプション）は出さない。
    予約のときは符号（/reel/<符号>/）が返らず pk だけ（2026-11-22 ヨーグルトの回）"""
    pks, codes = set(), set()
    for ev in t.events:
        if ev.get("method") != "Network.responseReceived":
            continue
        u = ev["params"]["response"]["url"]
        if not re.search(r"/api/v1/media/configure", u):
            continue
        try:
            b = t.call("Network.getResponseBody", requestId=ev["params"]["requestId"]).get("body") or ""
        except Exception:
            continue
        try:
            j = json.loads(re.sub(r"^for \(;;\);", "", b)) or {}
        except ValueError:
            j = {}
        m = j.get("media") if isinstance(j.get("media"), dict) else {}
        log("configure:", re.sub(r"[?#].*", "", u)[-40:], "keys", sorted(j)[:12], "media keys", sorted(m)[:12])
        # media の id は「<media の pk>_<人の pk>」。人の pk と取り違えないよう、まずこれから読む
        got = set(re.findall(r'"id"\s*:\s*"(\d{15,25})_\d+"', b))
        if not got and re.fullmatch(r"\d{15,25}", str(m.get("pk") or "")):
            got = {str(m["pk"])}
        if not got:
            got = set(re.findall(r'"pk"\s*:\s*"?(\d{15,25})"?', b))
        pks |= got
        codes |= set(re.findall(r'"code"\s*:\s*"([\w-]{8,15})"', b))
    return sorted(pks), sorted(codes)


def post(t, mp4, caption, cover_at=None, at=None, dry=False, probe=False):
    if not os.path.isfile(mp4):
        result({"ok": False, "error": "mp4_missing"})
        return
    want = parse_at(at) if at else None
    if at and not want:
        result({"ok": False, "error": "bad_at", "at": at})
        return
    if want:
        lead = (want - datetime.datetime.now(datetime.timezone.utc).replace(tzinfo=None)).total_seconds() / 60
        # Instagram の予約は少し先から（近すぎると今すぐ出る・断られる）。75日より先は選べない
        if lead < 15:
            result({"ok": False, "error": "too_soon", "minutes": round(lead)})
            return
        if lead > 60 * 24 * 60:
            result({"ok": False, "error": "too_far", "minutes": round(lead)})
            return
    why = compose(t, mp4, cover_at)
    if why:
        shot(t, "ig_x_compose")
        result({"ok": False, "error": why, "dialogs": dialogs(t)})
        return
    if want and t.js("new Date().getTimezoneOffset()") != 0:
        discard(t)
        result({"ok": False, "error": "browser_tz_not_utc"})
        return
    got = paste_caption(t, caption)
    cap_ok = got == caption
    log("caption match:", cap_ok, "| len", len(got or ""), "/", len(caption))
    sw = switches(t)
    # AI ラベルと Facebook にもシェアは、オンなら外す（あやとの頼みは Instagram だけ）
    for rx in (r"^Add AI label", r"Facebook"):
        on, xy = switch_state(sw, rx)
        if on:
            t.click_at(*xy)
            time.sleep(1.5)
    sw = switches(t)
    ai, _ = switch_state(sw, r"^Add AI label")
    fb, _ = switch_state(sw, r"Facebook")
    log("switches:", [(s[0][:30], s[1]) for s in sw])
    sched = set_schedule(t, want, sw) if want else None
    if not want:
        on, xy = switch_state(sw, r"^Schedule content")
        if on:
            t.click_at(*xy)
            time.sleep(2)
    sw = switches(t)
    sched_on, _ = switch_state(sw, r"^Schedule content")
    label = "Schedule" if want else "Share"
    btn = find_btn(t, f"/^{label}$/", f"({DLG}[0])")
    shot(t, "ig_3_final")
    checks = {"caption_match": cap_ok, "ai_label_off": ai is False, "facebook_off": fb is False,
              "schedule": sched, "schedule_switch": sched_on, "button": label if btn else None}
    ok = cap_ok and ai is False and fb is False and bool(btn) and (sched["ok"] and sched_on is True if want else sched_on is False)
    log("checks:", json.dumps(checks, ensure_ascii=False))
    if not ok or dry or probe:
        res = dict(checks, ok=ok and (dry or probe), dry=dry, probe=probe)
        if not ok:
            res["error"] = ("caption_mismatch" if not cap_ok else (sched or {}).get("error") or "not_ready")
            if not cap_ok:
                res["got_head"] = (got or "")[:120]
        discard(t)
        result(res)
        return
    t.call("Network.enable")
    t.click_at(*btn)
    log("clicked", label)
    end, said = time.time() + 300, []
    while time.time() < end:
        said = dialogs(t)
        txt = " ".join(said)
        if re.search(r"scheduled|been shared|Reel shared|Your reel has been", txt, re.I) or (not said and time.time() > end - 240):
            break
        if re.search(r"couldn.t|went wrong|Try again|failed", txt, re.I):
            break
        time.sleep(3)
    time.sleep(3)
    shot(t, "ig_4_after")
    pks, codes = media_from_network(t)
    txt = " ".join(said)
    done = bool(re.search(r"scheduled|been shared|Reel shared|Your reel has been", txt, re.I))
    log("after:", said, pks, codes)
    result({"ok": done and len(pks) == 1, "media_id": pks[0] if len(pks) == 1 else None, "media_ids": pks,
            "code": codes[0] if len(codes) == 1 else None, "said": txt[:200], "at": at, **checks})
    press(t, "/^Close$/")


SCHEDULED = "https://www.instagram.com/scheduled_content/"
# 予約の一覧（web の「Scheduled content」。左の ≡ More の中）は週の暦で、列の頭が「Sun 22」、札に題と時刻（「12:30 PM」）。
# 札の中心の x が入る列の頭で日を、札の字の中の時刻で時を読む。月は見出しの「November 2026」
SCHED_CARDS = f"""(needle => {{ const heads = [...document.querySelectorAll('*')].filter(e => e.children.length === 0 && /^(Sun|Mon|Tue|Wed|Thu|Fri|Sat) \\d{{1,2}}$/.test((e.textContent || '').trim()))
      .map(e => {{ const r = e.getBoundingClientRect(); return [e.textContent.trim(), r.x, r.x + r.width]; }});
    const cards = [...document.querySelectorAll('[role=button]')].filter({VIS}).filter(e => (e.innerText || '').includes(needle));
    const month = ((document.body.innerText || '').match(/(January|February|March|April|May|June|July|August|September|October|November|December) \\d{{4}}/) || [''])[0];
    return {{month, heads: heads.map(h => h[0]), cards: cards.map(c => {{ const r = c.getBoundingClientRect(), cx = r.x + r.width / 2;
      const h = heads.find(h => cx >= h[1] && cx <= h[2]); const tm = ((c.innerText || '').match(/\\d{{1,2}}:\\d{{2}}\\s?[AP]M/i) || [''])[0];
      return [h ? h[0] : null, tm.replace(/\\s+/, ' ').toUpperCase()]; }})}}; }})"""


def sched_label(at):
    """一覧の札で読む日と時刻（UTC。EC2 の Chrome の時計）。2026-11-22T12:30 は ("Sun 22", "12:30 PM")"""
    h, m, ap = want_time(at)
    return f"{at:%a} {at.day}", f"{h}:{m} {ap}"


def scheduled(t, needle, at):
    """予約の一覧で、題の字を持つ札が --at の日と時刻に1枚だけ在るか。週を3つまで先へ送って探す"""
    want = parse_at(at)
    if not want:
        result({"ok": False, "error": "bad_at", "at": at})
        return
    day, tm = sched_label(want)
    month = f"{want:%B %Y}"
    t.call("Network.enable")
    t.go(SCHEDULED, wait=8)
    seen = []
    for _ in range(4):
        r = t.js(f"({SCHED_CARDS})({json.dumps(needle)})") or {}
        seen.append(r)
        if r.get("cards") or day in r.get("heads", []) and r.get("month") == month:
            break
        if not press(t, "/^Next week$/", wait=4):
            break
    shot(t, "ig_sched_list")
    cards = seen[-1].get("cards", []) if seen else []
    ok = len(cards) == 1 and cards[0] == [day, tm] and seen[-1].get("month") == month
    ids = sched_media_ids(t, needle)
    result({"ok": ok, "want": [month, day, tm], "month": seen[-1].get("month") if seen else None, "cards": cards,
            "media_ids": ids, "media_id": ids[0] if len(ids) == 1 else None})


def sched_media_ids(t, needle):
    """予約の一覧を開いたときの応答（/api/graphql。JSON が何本も続くので1本としては読めない）から、題の行が needle の
    media の pk を拾う。並びは「…キャプションの字…","carousel_children":[],"media":{"__typename":"XDTClipsMedia","id":"<pk>_<人の pk>"」
    （2026-11-22 にヨーグルトの回の pk で当てた）。題の字のあとで最初に出る media の id を、その札の pk とみなす"""
    keys = {json.dumps(needle, ensure_ascii=False)[1:-1], json.dumps(needle)[1:-1]}
    ids = set()
    for ev in t.events:
        if ev.get("method") != "Network.responseReceived" or "/graphql" not in ev["params"]["response"]["url"]:
            continue
        try:
            b = t.call("Network.getResponseBody", requestId=ev["params"]["requestId"]).get("body") or ""
        except Exception:
            continue
        for k in keys:
            for m in re.finditer(re.escape(k), b):
                hit = re.search(r'"id"\s*:\s*"(\d{15,25})_\d+"', b[m.end():m.end() + 20000])
                if hit:
                    ids.add(hit.group(1))
    return sorted(ids)


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else ""
    if cmd == "check":
        t = fresh_tab()
        t.go(HOME, wait=6)
        result({"ok": signed_in(t), "at": where(t.url())})
    elif cmd == "post":
        args = sys.argv[2:]
        at = args[args.index("--at") + 1] if "--at" in args else None
        cover_at = float(args[args.index("--cover-at") + 1]) if "--cover-at" in args else None
        t = fresh_tab()
        post(t, args[0], open(args[1], encoding="utf-8").read(), cover_at=cover_at, at=at, dry="--dry" in args, probe="--probe" in args)
    elif cmd == "scheduled":
        # 予約の読み直し: python3 ig_post.py scheduled <題の行> <UTC の ISO>
        t = fresh_tab()
        scheduled(t, sys.argv[2], sys.argv[3])
    else:
        sys.exit(__doc__)
