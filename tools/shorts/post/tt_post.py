#!/usr/bin/env python3
"""EC2 の上で動く。TikTok Studio（web）にショートを上げる。

`ec2-chrome` の cdp.py の上に乗る。TikTok にログインしてあるのは `~/cdp-fish` の Chrome
（あやとが既定のプロファイルでログインし、Fish Audio の用で複製したもの。2026-10-15）。
手元から `ec2.py put` で `~/cdp/tt_post.py` に置き、手元の `post.py` から呼ぶ（README.md）。

    python3 tt_post.py check <探す字>                          # ログインしているか・同じ投稿がもう在るか
    python3 tt_post.py post <mp4> <caption.txt> --dry          # 投稿の手前まで（字と設定を確かめて、投稿しない）
    python3 tt_post.py post <mp4> <caption.txt>                # 投稿する
    python3 tt_post.py post <mp4> <caption.txt> --at 2026-10-22T10:00   # 予約（UTC。EC2 の Chrome の時計が UTC で、欄もその時刻。翌日以降は暦を送って日を押す）
    python3 tt_post.py post <mp4> <caption.txt> --at 2026-10-22T10:00 --dry --probe   # 時刻と日付の欄を開いて中身を書き出すだけ
    python3 tt_post.py scheduled <探す字> 2026-10-21T10:00:00Z  # 予約の読み直し（一覧の行に予約の時刻の札が出ているか）
    python3 tt_post.py delete <投稿ID> <探す字> 2026-10-23T10:00:00Z [--probe | --dry]   # 予約を差し替えるときに、古い予約を消す

どれも最後の行に結果を `RESULT {...}` の1行で出す。

## 投稿の前に必ず確かめること（ずれていたら押さない）

- キャプションの字が、渡した字と1字も違わない（編集欄の innerText で読む）
- `@` の後ろがメンション（TikTok の人への札）に化けていない
- 公開範囲が Everyone、AI 生成の印がオフ、「いつ投稿」が Now（予約なら Schedule）

## キャプションは貼り付けで入れる

編集欄は Draft.js。1字ずつ打つと `#` と `@` でハッシュタグ・人の候補が開き、
そのあとの Enter で**候補を選んでしまう**。貼り付け（paste のイベント）なら候補を通らない。
"""
import datetime, json, os, re, sys, time, urllib.request
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


def parse_at(at):
    """--at（UTC。"2026-10-22T10:00" / "2026-10-22T10:00:00Z"）を (日付, 時, 分) にする。読めなければ None。
    分は欄が5分おきなので、5の倍数でなければ None（押せない時刻を受けて、近い時刻に化けさせない）"""
    m = re.fullmatch(r"(\d{4}-\d{2}-\d{2})[T ](\d{2}):(\d{2})(?::00)?Z?", (at or "").strip())
    if not m or int(m.group(2)) > 23 or int(m.group(3)) % 5:
        return None
    try:
        datetime.date.fromisoformat(m.group(1))
    except ValueError:
        return None
    return m.group(1), m.group(2), m.group(3)


MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October",
          "November", "December"]
# 暦の見出し・矢印・日のます（2026-10-21 に写した。見出しは「October / 2026」、左の矢印が前の月）
CAL = ".calendar-wrapper"
CAL_HEAD = f"""(() => {{ const c = document.querySelector('{CAL}'); const r = c && c.getBoundingClientRect(); if (!r || !r.width || !r.height) return null;
  const m = c.querySelector('.month-title'), y = c.querySelector('.year-title');
  return [m ? m.innerText.trim() : null, y ? y.innerText.trim() : null]; }})()"""
CAL_DAYS = f"""[...document.querySelectorAll('{CAL} .day-span-container > span.day')].map(e => [e.innerText.trim(), (e.className || '').toString()])"""
# 時刻の選ぶ欄が開いているか。**幅では見ない。** 閉じた欄もますは DOM に残り、幅 84px のまま高さだけ 0 になる
# （2026-10-21 に写した。幅で見ると、一度も開いていないうちから「開いている」になった）
TIME_OPEN = "[...document.querySelectorAll('.tiktok-timepicker-option-item')].some(e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; })"


def month_steps(month_title, year_title, want_date):
    """暦がいま見せている月から、want_date の月まで、矢印を何回押すか（正なら次の月へ、負なら前の月へ）。
    見出しが読めなければ None"""
    if month_title not in MONTHS or not str(year_title or "").isdigit():
        return None
    w = datetime.date.fromisoformat(want_date)
    return (w.year * 12 + w.month) - (int(year_title) * 12 + MONTHS.index(month_title) + 1)


def pick_day(cells, want_date):
    """暦のます（[字, class] を左上から順に。頭に前の月の日が並ぶ）から、want_date の日を押す番号を決める。
    返すのは (番号, None) か (None, 理由)。

    - 字だけで探さない。前の月・次の月の日が同じ数字で並ぶ（10月の頭の「27〜30」は9月）。
      週は日曜はじまり（見出しが Sun … Sat）なので、1日の曜日ぶんだけずらした位置が、その日
    - その位置の字が日と違えば、並びが写したときと違う（月曜はじまり等）ので押さない
    - 押せる日は class に valid が付く（過去と、先すぎる日には付かない）"""
    w = datetime.date.fromisoformat(want_date)
    lead = (w.replace(day=1).weekday() + 1) % 7  # 日曜=0
    idx = lead + w.day - 1
    if len(cells) <= idx or cells[idx][0] != str(w.day):
        return None, "calendar_grid_unexpected"
    if "valid" not in cells[idx][1].split():
        return None, "date_not_selectable"
    return idx, None


def set_date(t, want_date):
    """日付の欄の暦を開き、want_date の月まで矢印で送って、その日を押す。欄から読み直した値を返す"""
    dt_in = r"""[...document.querySelectorAll('input[type=text]')].find(i => /^\d{4}-\d{2}-\d{2}$/.test(i.value))"""
    if not t.js(CAL_HEAD):
        t.click(dt_in)
        time.sleep(1.5)
    head = t.js(CAL_HEAD)
    for _ in range(4):
        steps = month_steps(*(head or [None, None]), want_date)
        if steps is None:
            return {"ok": False, "error": "calendar_header", "head": head}
        if steps == 0:
            break
        if abs(steps) > 2:
            # TikTok が予約できるのは先の数日だけ。暦を何か月も送る指定は、--at の書き違いとみて押さない
            return {"ok": False, "error": "date_too_far", "head": head, "want": want_date}
        arrow = f"[...document.querySelectorAll('{CAL} .month-header-wrapper .arrow')][{0 if steps < 0 else 1}]"
        if not t.js(f"!!({arrow}) && document.querySelectorAll('{CAL} .month-header-wrapper .arrow').length === 2"):
            return {"ok": False, "error": "calendar_arrow", "head": head}
        t.click(arrow)
        time.sleep(1)
        head = t.js(CAL_HEAD)
    else:
        return {"ok": False, "error": "calendar_header", "head": head}
    cells = t.js(CAL_DAYS) or []
    idx, why = pick_day(cells, want_date)
    if why:
        shot(t, "tt_sched_date_fail")
        return {"ok": False, "error": why, "head": head, "cells": cells}
    t.click(f"[...document.querySelectorAll('{CAL} .day-span-container > span.day')][{idx}]")
    time.sleep(1.5)
    if t.js(CAL_HEAD):
        # 押しても暦が開いたままなら閉じる（時刻の欄と同じく Escape）
        key(t, "Escape", "Escape", 27)
        time.sleep(0.8)
    got = t.js(SCHED_INPUTS).get("date")
    return {"ok": got == want_date, "error": None if got == want_date else "date_not_set", "head": head, "date": got}


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
    parsed = parse_at(at)
    if not parsed:
        return {"ok": False, "error": "bad_at", "at": at}
    want_date, hh, mm = parsed
    t.click("document.querySelector('input[type=radio][value=schedule]')")
    time.sleep(2)
    before = t.js(SCHED_INPUTS)
    log("schedule fields before", before)
    if not before.get("time"):
        return {"ok": False, "error": "schedule_fields_missing", "before": before}
    time_in = r"""[...document.querySelectorAll('input[type=text]')].find(i => /^\d{2}:\d{2}$/.test(i.value))"""
    if probe:
        t.click(time_in)
        time.sleep(1.5)
        shot(t, "tt_sched_time_open")
        tp = picker_dump(t)
        key(t, "Escape", "Escape", 27)
        time.sleep(0.8)
        t.click(r"""[...document.querySelectorAll('input[type=text]')].find(i => /^\d{4}-\d{2}-\d{2}$/.test(i.value))""")
        time.sleep(1.5)
        shot(t, "tt_sched_date_open")
        return {"ok": True, "before": before, "time_picker": tp, "calendar": t.js(CAL_HEAD), "days": t.js(CAL_DAYS)}
    date_r = None
    if before.get("date") != want_date:
        # 欄の既定は今日。違う日なら、暦を送ってその日を押す（日を先に決める。時刻の欄はそのあと）
        date_r = set_date(t, want_date)
        log("date", json.dumps({k: v for k, v in date_r.items() if k != "cells"}, ensure_ascii=False))
        if not date_r.get("ok"):
            return {"ok": False, "error": date_r.get("error") or "date_not_set", "before": before, "date_step": date_r}
    t.click(time_in)
    time.sleep(1.5)
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
    if t.js(TIME_OPEN):
        # 翌日の日を押してから時刻を入れた回（2026-10-21）は、Escape でも開いたまま残った（写しで見た）。
        # 欄をもう一度押すと閉じる（外を押しても閉じた）。開いたまま「Schedule」を押すと、1回目が欄を閉じるだけに
        # なりうるので、閉じたのを見てから先へ進む
        t.click(time_in)
        time.sleep(1)
    still_open = bool(t.js(TIME_OPEN))
    log("time picker still open:", still_open)
    after = t.js(SCHED_INPUTS)
    radio_on = t.js("(() => { const r = document.querySelector('input[type=radio][value=schedule]'); return !!(r && r.checked); })()")
    shot(t, "tt_sched_set")
    ok = after.get("time") == f"{hh}:{mm}" and after.get("date") == want_date and radio_on and not still_open
    return {"ok": ok, "error": None if ok else "schedule_not_set", "before": before, "after": after, "schedule_radio": radio_on,
            "time_picker_open": still_open, "date_step": date_r and {k: v for k, v in date_r.items() if k != "cells"},
            "utc": f"{want_date}T{hh}:{mm}:00Z"}


def add_sound(t, title, artist):
    """編集画面の「Sounds」で、曲名が title・歌い手が artist の音源を1本だけ敷いて保存する。

    曲を動画に入れられない回（市販の曲。2026-10-24 の北欧×蜃気楼）は、TikTok の音源から付ける。
    敷いた音源は動画の頭から、音源の頭から鳴る（ずらす手は置いていない。動画のほうを音源の拍に合わせて書き出す）。
    曲名の行はいちばん上とは限らないので、字で当てる。当たらなければ何も押さずに止める
    """
    if not (click_text(t, "Sounds", "button,div[role=button]")):
        return {"ok": False, "error": "no_sounds_button"}
    time.sleep(5)
    if has_text(t, "Got it", "button"):
        click_text(t, "Got it", "button")
        time.sleep(1)
    box = "document.querySelector(\"input[placeholder='Search sounds']\")"
    if not t.js(f"!!{box}"):
        return {"ok": False, "error": "no_search_box"}
    t.js(f"(() => {{ const i = {box}; i.focus(); i.select(); return 1; }})()")
    t.call("Input.insertText", text=f"{artist} {title}")
    key(t, "Enter", "Enter", 13)
    time.sleep(6)
    head = f"{title}\n"
    # 行: 字が「<曲名>\n<長さ> · <歌い手>」で始まる、いちばん小さい要素
    row = f"""[...document.querySelectorAll('div')].filter(e => e.offsetParent && (e.innerText || '').startsWith({json.dumps(head)})
        && (e.innerText || '').split('\\n')[1]?.endsWith({json.dumps('· ' + artist)}))
        .sort((a, b) => a.innerText.length - b.innerText.length)[0]"""
    c = t.js(f"(() => {{ const e = {row}; if (!e) return null; const r = e.getBoundingClientRect(); return [r.x + 40, r.y + r.height / 2, e.innerText.split('\\n').slice(0, 2).join(' / ')]; }})()")
    if not c:
        return {"ok": False, "error": "sound_not_found"}
    log("sound row", c[2])
    t.call("Input.dispatchMouseEvent", type="mouseMoved", x=c[0], y=c[1])
    time.sleep(1.2)
    # 行に載せると出る丸いボタンのうち、いちばん右が「＋」（足す）。左は保存・置き換え
    plus = t.js(f"""(() => {{ const e = {row}; let p = e; for (let k = 0; k < 4 && p; k++) {{ const bs = [...p.querySelectorAll('button')].filter(b => b.offsetParent);
        if (bs.length) {{ const b = bs.sort((a, b) => b.getBoundingClientRect().x - a.getBoundingClientRect().x)[0]; const r = b.getBoundingClientRect();
        return [r.x + r.width / 2, r.y + r.height / 2]; }} p = p.parentElement; }} return null; }})()""")
    if not plus:
        return {"ok": False, "error": "no_add_button"}
    for ty in ("mousePressed", "mouseReleased"):
        t.call("Input.dispatchMouseEvent", type=ty, x=plus[0], y=plus[1], button="left", clickCount=1)
    time.sleep(5)
    shot(t, "tt_sound_added")
    on_track = t.js(f"document.body.innerText.split('\\n').filter(s => s.trim() === {json.dumps(title)}).length")
    if not click_text(t, "Save", "button"):
        return {"ok": False, "error": "no_editor_save"}
    time.sleep(6)
    # 保存すると音を合わせた動画が書き出し直されて上げ直る。曲名の札は「Original sound」のまま出る（2026-10-24 に見た）ので、
    # 札では見ない。敷いた直後にトラックに曲名が在ったことと、上げ直しが終わって編集欄が戻ったことで見る
    reup = False
    for _ in range(90):
        time.sleep(2)
        if t.js(f"!!{ED}") and re.search(r"Uploaded|アップロード済み|アップロード完了", body(t)) and not has_text(t, "Cancel", "button"):
            reup = True
            break
    shot(t, "tt_sound_saved")
    return {"ok": bool(on_track) and reup, "row": c[2], "on_track_labels": on_track, "reuploaded": reup}


def save_draft(t):
    """「Save draft」を押して、下書きに入ったかを読む。投稿のボタンは押さない"""
    if not has_text(t, "Save draft", "button"):
        return {"ok": False, "error": "no_draft_button"}
    click_text(t, "Save draft", "button")
    for _ in range(30):
        time.sleep(2)
        u = t.url() or ""
        if "/tiktokstudio/upload" not in u or re.search(r"Saved to drafts|下書きに保存|Draft saved", body(t)):
            break
    shot(t, "tt_draft_saved")
    return {"ok": True, "at": where(t.url()), "toast": bool(re.search(r"Saved to drafts|下書きに保存|Draft saved", body(t)))}


def post(t, mp4, caption, dry=False, at=None, cover=None, probe=False, sound=None, draft=False):
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
    if sound:
        # 編集画面で保存すると、音を合わせた動画が書き出し直されて上げ直り、キャプションが消える（2026-10-24）。
        # なので音源はキャプションより先に敷く
        snd = add_sound(t, *sound)
        log("sound", json.dumps(snd, ensure_ascii=False))
        if not snd.get("ok"):
            result(dict(snd, ok=False))
            return
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
        # 窓の中身は遅れて出る。3秒ではまだ「Upload cover」が無い回があり、click_text が投げて
        # 段ごと止まった（2026-10-29 グルメの回で5回中3回）。字が出るまで待ち、出なければ止めて返す
        up = None
        for _ in range(20):
            up = next((l for l in ("Upload cover", "カバーをアップロード") if has_text(t, l)), None)
            if up:
                break
            time.sleep(1)
        if not up:
            shot(t, "tt_cover_noupload")
            result({"ok": False, "error": "cover_upload_tab"})
            return
        click_text(t, up)
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
    if draft:
        # 下書きで止める（あやとが音や字を見てから出す回）。投稿・予約のボタンは押さない
        dr = save_draft(t)
        result(dict(info, **dr, draft=True, sound=bool(sound)))
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


# ---- 予約の差し替え（古い予約を消す）----
# 予約中の版を直すときは、古い予約を消してから入れ直す（逆だと、消し損ねたときに2本出る）
VISIBLE = "(e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; })"
CLICKABLE = "button, [role=button], [role=menuitem], [data-e2e], [aria-label], a, svg"


def post_row(vid):
    """一覧の中で、その投稿 ID へのリンクを持つ行。リンクから上へ、**ほかの投稿へのリンクを含まない**いちばん大きい箱まで
    たどる（行の右の操作の印は、題の欄とは別の欄にあるので、題の欄で止めると拾えない）"""
    return f"""(() => {{ const a = [...document.querySelectorAll('a[href*="/video/{vid}"]')][0]; if (!a) return null;
      const other = e => [...e.querySelectorAll('a[href*="/video/"]')].some(x => !(x.href || '').includes('/video/{vid}'));
      let r = a; while (r.parentElement && r.parentElement !== document.body && !other(r.parentElement)) r = r.parentElement;
      const h = r.getBoundingClientRect().height;
      return (h > 40 && h < 400 && /\\d{{1,2}}:\\d{{2}}/.test(r.innerText || '')) ? r : null; }})()"""


def clickables(t, scope):
    return t.js(f"""[...({scope}).querySelectorAll('{CLICKABLE}')].filter({VISIBLE}).slice(0, 60).map(e => {{ const r = e.getBoundingClientRect();
        return [e.tagName.toLowerCase(), e.getAttribute('data-e2e'), e.getAttribute('aria-label'), (e.innerText || '').trim().slice(0, 30),
                (e.className && e.className.toString ? e.className.toString() : '').slice(0, 60), Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)]; }})""")


def delete(t, vid, needle, at_utc, probe=False, dry=False):
    """予約中の投稿を消す。

    - 行は投稿 ID（行の中のリンク）で探す。題の字と予約の時刻の札（未来の時刻）が両方出ている行だけを消す
      （出た投稿は消さない。差し替えの対象は予約だけ）
    - probe は行の上に指を置いて、押せるものを書き出すだけ（知らない画面の見当をつける）
    - 消したあとは一覧を開き直し、その ID へのリンクが無いのを見てから ok にする"""
    t.go(CONTENT, wait=10)
    if not signed_in(t):
        result({"ok": False, "error": "signed_out", "at": where(t.url())})
        return
    row = post_row(vid)
    for _ in range(4):
        if t.js(f"!!{row}"):
            break
        time.sleep(4)
    if not t.js(f"!!{row}"):
        hits, n, _ = find_posts(t, needle)
        gone = not any(f"/video/{vid}" in h for h in hits)
        result({"ok": gone and not probe, "error": None if gone else "row_not_found", "already_gone": gone, "hits": hits, "rows": n})
        return
    label = schedule_label(at_utc)
    text = t.js(f"(() => {{ const r = {row}; return r ? r.innerText.replace(/[\\s\\u00a0\\u202f]+/g, ' ').trim().slice(0, 300) : null; }})()")
    log("row:", text)
    if needle not in (text or "") or label not in (text or ""):
        result({"ok": False, "error": "row_not_scheduled", "row": text, "want_label": label})
        return
    c = t.center(row)
    t.call("Input.dispatchMouseEvent", type="mouseMoved", x=c[0], y=c[1])
    time.sleep(1.5)
    cl = clickables(t, row)
    log("row clickables:", json.dumps(cl, ensure_ascii=False))
    shot(t, "tt_del_0_row")
    if probe:
        os.makedirs(SHOTS, exist_ok=True)
        open(f"{SHOTS}/tt_del_row.html", "w").write(t.js(f"({row}).outerHTML") or "")
        result({"ok": True, "probe": True, "row": text, "clickables": cl})
        return
    # 行の右の「削除」（ごみ箱の印）。字・aria-label・data-e2e のどれかに Delete / 削除 を持つもの
    del_btn = f"""[...({row}).querySelectorAll('{CLICKABLE}')].filter({VISIBLE}).find(e => /^(delete|削除)$/i.test((e.innerText || '').trim())
        || /delete|削除/i.test(e.getAttribute('aria-label') || '') || /delete/i.test(e.getAttribute('data-e2e') || ''))"""
    if not t.js(f"!!({del_btn})"):
        # 「…」（その他）の中にある形。行の右の「操作」の欄は、鉛筆・グラフ・吹き出し・「…」の4つの丸いボタンで、
        # どれも字・aria-label・data-e2e を持たない（2026-10-21 に写した）。「…」はいちばん右の、字の無いボタン
        more = f"""[...({row}).querySelectorAll('button')].filter({VISIBLE}).filter(b => !(b.innerText || '').trim())
            .sort((a, b) => b.getBoundingClientRect().x - a.getBoundingClientRect().x)[0]"""
        if not t.js(f"!!({more})"):
            result({"ok": False, "error": "delete_control_not_found", "clickables": cl})
            return
        t.click(more)
        time.sleep(1.5)
        menu = t.js(f"""[...document.querySelectorAll('[role=menuitem], [role=menu] *, [class*=Popover] *, [class*=popover] *, [class*=Dropdown] *, [class*=dropdown] *')]
            .filter({VISIBLE}).filter(e => e.children.length === 0).map(e => (e.innerText || '').trim()).filter(s => s && s.length < 40)""")
        log("more menu:", menu)
        shot(t, "tt_del_1_more")
        del_btn = f"""[...document.querySelectorAll('[role=menuitem], li, div, span, button')].filter({VISIBLE}).filter(e => /^(Delete|削除)$/.test((e.innerText || '').trim()))
            .sort((a, b) => a.getBoundingClientRect().width * a.getBoundingClientRect().height - b.getBoundingClientRect().width * b.getBoundingClientRect().height)[0]"""
        if not t.js(f"!!({del_btn})"):
            result({"ok": False, "error": "delete_item_not_found", "clickables": cl, "menu": menu})
            return
    t.click(del_btn)
    time.sleep(2)
    # 念押しの窓は「Delete post? / You won't be able to recover it. / Delete / Cancel」（2026-10-21 に写した）。
    # 窓の題だけを持つ小さい箱も class に modal を持つので、Delete と Cancel の両方のボタンを含むいちばん小さい箱を取る
    dlg = f"""[...document.querySelectorAll('[role=dialog], .TUXModal, [class*=modal], [class*=Modal]')].filter({VISIBLE})
        .filter(e => {{ const bs = [...e.querySelectorAll('button, [role=button]')].map(b => (b.innerText || '').trim());
          return bs.some(s => /^(Delete|削除)$/.test(s)) && bs.some(s => /^(Cancel|キャンセル)$/.test(s)); }})
        .sort((a, b) => a.getBoundingClientRect().width * a.getBoundingClientRect().height - b.getBoundingClientRect().width * b.getBoundingClientRect().height)[0]"""
    dtext = t.js(f"(() => {{ const d = {dlg}; return d ? d.innerText.trim().replace(/\\s+/g, ' ').slice(0, 400) : null; }})()")
    log("confirm dialog:", dtext)
    shot(t, "tt_del_2_dialog")
    ok_btn = f"[...({dlg}).querySelectorAll('button, [role=button]')].filter({VISIBLE}).find(b => /^(Delete|削除)$/.test((b.innerText || '').trim()))"
    if not dtext or not re.search(r"Delete post|投稿を削除", dtext) or not t.js(f"!!({ok_btn})"):
        result({"ok": False, "error": "confirm_not_found", "dialog": dtext})
        return
    if dry:
        t.js(f"(() => {{ const b = [...({dlg}).querySelectorAll('button, [role=button]')].find(b => /^(Cancel|キャンセル)$/.test((b.innerText || '').trim())); if (b) b.click(); }})()")
        result({"ok": True, "dry": True, "dialog": dtext})
        return
    t.click(ok_btn)
    log("clicked delete")
    time.sleep(6)
    gone = False
    for _ in range(4):
        t.go(CONTENT, wait=10)
        time.sleep(3)
        if not t.js(f"!!document.querySelector('a[href*=\"/video/{vid}\"]')") and t.js("document.querySelectorAll('a[href*=\"/video/\"]').length > 0"):
            gone = True
            break
        time.sleep(5)
    shot(t, "tt_del_3_after")
    left = scheduled_row(t, needle, at_utc)
    result({"ok": gone and not left, "deleted": gone, "left_row": left, "dialog": dtext})


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else ""
    if cmd == "delete":
        # python3 tt_post.py delete <投稿ID> <題の行> <予約の UTC の ISO> [--probe | --dry]
        t = fresh_tab()
        delete(t, sys.argv[2], sys.argv[3], sys.argv[4], probe="--probe" in sys.argv, dry="--dry" in sys.argv)
        sys.exit(0)
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
        # --sound "<曲名>" "<歌い手>": TikTok の音源を敷く ／ --draft: 投稿せず下書きで保存
        sound = (args[args.index("--sound") + 1], args[args.index("--sound") + 2]) if "--sound" in args else None
        post(t, args[0], open(args[1], encoding="utf-8").read(), dry="--dry" in args, at=at, cover=cover,
             probe="--probe" in args, sound=sound, draft="--draft" in args)
    else:
        sys.exit(__doc__)
