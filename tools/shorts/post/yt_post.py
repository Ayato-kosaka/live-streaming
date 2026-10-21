#!/usr/bin/env python3
"""EC2 の上で動く。YouTube Studio にショートを上げる（非公開で保存 → 確かめる → 公開）。

`ec2-chrome` の cdp.py と `youtube-studio` の yt_studio.py の上に乗る。手元から
`ec2.py put` で `~/cdp/yt_post.py` に置き、手元の `post.py` から呼ぶ（README.md）。

    python3 yt_post.py dup <題>                       # 同じ題のショートがもう在るか
    python3 yt_post.py draft <mp4> <post.json>        # 上げて、題・説明・子ども向けでない・改変なし → 非公開で保存
    python3 yt_post.py resume <動画ID> <post.json>    # 途中で閉じた下書きを開き直して続きから
    python3 yt_post.py related <動画ID> <元の動画ID>   # 「関連動画」に元のアーカイブを付けて保存
    python3 yt_post.py publish <動画ID> [--at <UTC の ISO> [--dry]]  # 公開（--at で一般公開の予約。--dry は欄を入れてキャンセル）
    python3 yt_post.py status <動画ID>                # 題・説明・公開範囲・関連動画を読み直す
    python3 yt_post.py delete <動画ID> <題> [--dry]   # 予約を差し替えるときに、古い（非公開の）動画を完全に削除する

どれも最後の行に結果を `RESULT {...}` の1行で出す（手元はそこだけ読む）。

## なぜ1手ずつ別のコマンドにするか

前の send-command で開いたタブに繋ぎ直すと固まることがある（youtube-studio 4）。
なので手ごとに `studio()` で新しいタブから開き直す。上げたあとは非公開の動画として
Studio に在るので、開き直しても失うものが無い。**公開に切り替えるのは最後の1手だけ。**

## 書き込みは画面を押す

`video_editor/edit_video` を api() から送っても効かなかった（youtube-studio 3）。
メタデータも同じと見て、書き込みは画面で押し、**読み直しは api()（get_creator_videos）で**する。
"""
import json, os, re, sys, time
sys.path.insert(0, os.path.expanduser("~ubuntu/cdp"))
from cdp import where  # noqa: E402
from yt_studio import studio, api, get_videos, url_of, CH, BASE, _wait  # noqa: E402

SHOTS = os.path.expanduser("~ubuntu/shots/post")
SHORTS = {"and": {"operands": [{"channelIdIs": {"value": CH}}, {"contentTypeIs": {"value": "CREATOR_CONTENT_TYPE_SHORTS"}}]}}
# 知らない列を mask に入れても落ちない（黙って返さないだけ）。返ってくるのを確かめた列だけ置く
READ = {"videoId": True, "title": True, "description": True, "privacy": True, "lengthSeconds": True,
        "timePublishedSeconds": True, "scheduledPublishingDetails": {"all": True}, "draftStatus": True,
        "status": True, "contentType": True, "shorts": {"all": True}, "audienceRestriction": {"all": True}}

DLG = "document.querySelector('ytcp-uploads-dialog')"
TITLE = f"{DLG}.querySelector('#title-textarea #textbox')"
DESC = f"{DLG}.querySelector('#description-textarea #textbox')"


def log(*a):
    print(time.strftime("%T"), *a, flush=True)


def result(d):
    print("RESULT " + json.dumps(d, ensure_ascii=False), flush=True)


def shot(t, name):
    os.makedirs(SHOTS, exist_ok=True)
    t.shot(f"{SHOTS}/{name}.jpg")


def guard_login(t):
    # 401 や Google のログイン画面に飛んだら、その先は全部落ちるので止める（ec2-chrome 4）
    if "accounts.google.com" in (t.url() or ""):
        result({"ok": False, "error": "signed_out"})
        sys.exit(3)


def key(t, k, code, vk, text=None):
    p = {"key": k, "code": code, "windowsVirtualKeyCode": vk}
    if text:
        p.update(text=text, unmodifiedText=text)
    t.call("Input.dispatchKeyEvent", type="keyDown", **p)
    t.call("Input.dispatchKeyEvent", type="keyUp", key=k, code=code, windowsVirtualKeyCode=vk)


def set_text(t, box, text):
    """contenteditable の箱を空にして text を打つ。改行は本物の Enter で入れる
    （insertText に \\n を混ぜると、箱によっては字のまま入る）"""
    t.click(box)
    t.js(f"""(() => {{ const e = {box}; e.focus(); const r = document.createRange(); r.selectNodeContents(e);
        const s = getSelection(); s.removeAllRanges(); s.addRange(r); }})()""")
    key(t, "Backspace", "Backspace", 8)
    for i, ln in enumerate(text.split("\n")):
        if i:
            key(t, "Enter", "Enter", 13, "\r")
        if ln:
            t.type(ln)
        time.sleep(0.15)
    time.sleep(0.8)
    # Escape は押さない。アップロードの画面ごと閉じる（2026-10-17 に踏んだ。題を打ったあとで画面が消えた）。
    # ハッシュタグの候補が開いたままでも、次の欄を押せば閉じる。Enter は最後の行のあとに打たないので候補は選ばれない
    return t.js(f"{box}.innerText")


def radio(t, scope, name):
    """name の付いたラジオを押し、選ばれたかを読んで確かめる"""
    sel = f"{scope}.querySelector('tp-yt-paper-radio-button[name=\"{name}\"]')"
    if not t.js(f"!!{sel}"):
        return False
    if t.js(f"{sel}.getAttribute('aria-checked')") != "true":
        t.click(sel)
        time.sleep(0.8)
    return t.js(f"{sel}.getAttribute('aria-checked')") == "true"


def radio_names(t, scope):
    return t.js(f"""[...{scope}.querySelectorAll('tp-yt-paper-radio-button')].map(r =>
        [r.getAttribute('name'), r.getAttribute('aria-checked'), (r.innerText || '').trim().replace(/\\s+/g, ' ').slice(0, 30)])""")


def near(t, word, scope="document"):
    """word を字に持ついちばん小さい要素と、その近くの押せそうなもの（知らない欄の見当をつける用）"""
    return t.js(f"""(() => {{
      const leaf = [...{scope}.querySelectorAll('*')].filter(e => e.offsetParent && e.children.length === 0 && (e.innerText || '').trim().startsWith({json.dumps(word)}));
      return leaf.slice(0, 3).map(e => {{
        let box = e; for (let i = 0; i < 6 && box.parentElement; i++) {{ box = box.parentElement; if (box.querySelector('ytcp-button, button, input, [role=button], ytcp-dropdown-trigger')) break; }}
        const chain = []; let p = e; for (let i = 0; i < 8 && p; i++) {{ chain.push(p.tagName.toLowerCase() + (p.id ? '#' + p.id : '')); p = p.parentElement; }}
        const clickable = [...box.querySelectorAll('ytcp-button, button, input, [role=button], ytcp-dropdown-trigger, ytcp-text-dropdown-trigger')]
          .map(b => b.tagName.toLowerCase() + (b.id ? '#' + b.id : '') + ' "' + ((b.innerText || b.value || b.getAttribute('aria-label') || '').trim().replace(/\\s+/g, ' ').slice(0, 30)) + '"');
        return {{chain, box: box.tagName.toLowerCase() + (box.id ? '#' + box.id : ''), text: box.innerText.trim().replace(/\\s+/g, ' ').slice(0, 200), clickable}};
      }});
    }})()""")


def dup(t, title):
    """同じ題のショート（下書き・非公開を含む）を新しい順に200本まで見る"""
    hits, token, seen = [], None, 0
    while seen < 200:
        body = {"filter": SHORTS, "order": "VIDEO_ORDER_DISPLAY_TIME_DESC", "pageSize": 50,
                "mask": {"videoId": True, "title": True, "privacy": True, "timePublishedSeconds": True}}
        if token:
            body["pageToken"] = token
        r = api(t, "creator/list_creator_videos", body)
        for v in r.get("videos", []):
            seen += 1
            if (v.get("title") or "").strip() == title.strip():
                hits.append({"id": v["videoId"], "privacy": v.get("privacy"), "published": v.get("timePublishedSeconds")})
        token = r.get("nextPageToken")
        if not token:
            break
    return hits, seen


def video_link(t):
    """右の欄の「動画リンク」（ショートなら youtube.com/shorts/<id>）。説明欄の手引きのリンクを拾わないよう、行き先で絞る"""
    for _ in range(60):
        link = t.js(f"(() => {{ const a = [...{DLG}.querySelectorAll('a')].find(a => /youtube\\.com\\/shorts\\/|youtu\\.be\\//.test(a.href || '')); return a ? a.href : null; }})()")
        if link:
            m = re.search(r"(?:shorts/|youtu\.be/)([\w-]{11})", link)
            return link, (m.group(1) if m else None)
        time.sleep(1)
    return None, None


def draft(t, mp4, post):
    title = post["youtube"]["title"]
    if not os.path.exists(mp4):
        raise RuntimeError(f"no file: {mp4}")
    hits, seen = dup(t, title)
    log("dup check", seen, "shorts seen, hits:", hits)
    if hits:
        result({"ok": False, "error": "duplicate", "hits": hits})
        return
    t.go(f"{BASE}/channel/{CH}/videos/upload?d=ud", wait=6)
    guard_login(t)
    _wait(t, f"!!{DLG} && !!{DLG}.querySelector('input[type=file]')", 40)
    t.set_files("ytcp-uploads-dialog input[type=file]", [mp4])
    wizard(t, post)


def resume(t, vid, post):
    """途中で閉じた下書きを開き直して、続きから進める。
    動画の詳細のページに「この動画はドラフト状態です / ドラフトを編集」が出るので、それを押す"""
    t.go(f"{BASE}/video/{vid}/edit", wait=8)
    guard_login(t)
    btn = """[...document.querySelectorAll('ytcp-button, button')].find(b => b.offsetParent && /^(ドラフトを編集|下書きを編集|Edit draft)$/.test((b.innerText || '').trim()))"""
    if not t.js(f"!!{btn}"):
        result({"ok": False, "error": "draft_button_not_found", "video_id": vid, "at": where(t.url())})
        return
    t.click(btn)
    time.sleep(5)
    wizard(t, post)


def wizard(t, post):
    """開いているアップロードの画面（ytcp-uploads-dialog）を、詳細 → 公開設定まで進めて非公開で保存する"""
    title, desc = post["youtube"]["title"], post["youtube"]["description"]
    _wait(t, f"!!{TITLE} && {TITLE}.offsetParent !== null", 120)
    time.sleep(3)
    link, vid = video_link(t)
    log("video link", link, "id", vid)
    log("progress at start:", t.js(f"(() => {{ const p = {DLG}.querySelector('ytcp-video-upload-progress'); return p ? p.innerText.trim().replace(/\\s+/g, ' ') : ''; }})()"))

    got_t = set_text(t, TITLE, title)
    got_d = set_text(t, DESC, desc)
    log("title ok", got_t == title, "| desc ok", got_d.rstrip("\n") == desc)
    kids = radio(t, DLG, "VIDEO_MADE_FOR_KIDS_NOT_MFK")
    log("not made for kids", kids)
    # 「すべて表示」を開くと、改変されたコンテンツの問いが出る
    t.js(f"(() => {{ const b = {DLG}.querySelector('#toggle-button'); if (b && /すべて表示|Show more/.test(b.innerText)) b.click(); }})()")
    time.sleep(2)
    names = radio_names(t, DLG)
    log("radios", names)
    alt_name = next((n for n, _, _ in names if n and "ALTERED" in n and n.endswith("NO")), None)
    altered = radio(t, DLG, alt_name) if alt_name else False
    log("altered content = no", alt_name, altered)
    log("related video field:", json.dumps(near(t, "関連動画", DLG), ensure_ascii=False))
    shot(t, "yt_1_details")
    if not (got_t == title and got_d.rstrip("\n") == desc and kids and altered and vid):
        result({"ok": False, "error": "details_not_set", "video_id": vid, "title_ok": got_t == title,
                "desc_got": got_d, "kids": kids, "altered": altered, "radios": names})
        return
    # 動画の要素 → チェック → 公開設定
    for step in range(3):
        t.click(f"{DLG}.querySelector('#next-button')")
        time.sleep(3)
    _wait(t, f"!!{DLG}.querySelector('tp-yt-paper-radio-button[name=\"PRIVATE\"]')", 30)
    sched = t.js(f"!!{DLG}.querySelector('#second-container-expand-button') || /スケジュール|Schedule/.test({DLG}.innerText)")
    private = radio(t, DLG, "PRIVATE")
    log("visibility PRIVATE", private, "| schedule option present", sched)
    # 上がり切るまで待つ（途中で保存しても上がり続けるが、確かめてから閉じたい）
    prog = ""
    for _ in range(120):
        prog = t.js(f"(() => {{ const p = {DLG}.querySelector('ytcp-video-upload-progress'); return p ? p.innerText.trim().replace(/\\s+/g, ' ') : ''; }})()") or ""
        if not re.search(r"アップロード中|Uploading|%", prog):
            break
        time.sleep(2)
    log("progress", prog)
    shot(t, "yt_2_visibility")
    if not private:
        result({"ok": False, "error": "private_not_selected", "video_id": vid})
        return
    t.click(f"{DLG}.querySelector('#done-button')")
    time.sleep(6)
    shot(t, "yt_3_saved")
    closed = t.js("""(() => { const d = [...document.querySelectorAll('ytcp-dialog, tp-yt-paper-dialog')].find(e => e.offsetParent && /保存|公開|Saved|published/.test(e.innerText));
        if (!d) return 'no dialog'; const b = [...d.querySelectorAll('ytcp-button, button')].find(b => /閉じる|Close/.test(b.innerText) || b.id === 'close-button');
        if (b) { b.click(); return 'closed'; } return 'dialog without close'; })()""")
    log("after save", closed)
    time.sleep(2)
    v = get_videos(t, [vid], mask=READ)[0] if vid else {}
    result({"ok": True, "video_id": vid, "link": link, "schedule_option": sched, "progress": prog,
            "privacy": v.get("privacy"), "title_match": v.get("title") == title,
            "desc_match": v.get("description") == desc, "draft": v.get("draftStatus")})


# ---- 関連動画（ショートから元のアーカイブへ飛べる札）----
# 上げる画面には無い（2026-10-17。ショートの詳細のページにだけ在る）。読み直しは videoLinkageShortsAttribution
TRIGGER = "document.querySelector('ytcp-shorts-content-links-picker #linked-video-editor-link')"
VISIBLE_DLG = """[...document.querySelectorAll('ytcp-dialog, tp-yt-paper-dialog, ytcp-video-pick-dialog')].filter(e => e.offsetParent && e.getBoundingClientRect().width > 200).pop()"""
SAVE = "[...document.querySelectorAll('ytcp-button')].find(b => b.offsetParent && (b.innerText || '').trim() === '保存')"


def linked(t, vid):
    v = api(t, "creator/get_creator_videos", {"failOnError": True, "videoIds": [vid], "criticalRead": False,
                                               "mask": {"videoId": True, "videoLinkageShortsAttribution": {"all": True}}})["videos"][0]
    return [x.get("targetExternalVideoId") for x in (v.get("videoLinkageShortsAttribution") or {}).get("links", [])]


def related(t, vid, target, dry=False):
    before = linked(t, vid)
    log("linked before", before)
    if before == [target]:
        result({"ok": True, "video_id": vid, "linked": before, "changed": False})
        return
    title = get_videos(t, [target], mask={"videoId": True, "title": True})[0]["title"]
    t.go(f"{BASE}/video/{vid}/edit", wait=8)
    guard_login(t)
    _wait(t, f"!!{TRIGGER}", 30)
    t.click(TRIGGER)
    time.sleep(3)
    d = VISIBLE_DLG
    log("picker:", t.js(f"(() => {{ const d = {d}; return d ? d.tagName + ' ' + d.innerText.trim().replace(/\\s+/g, ' ').slice(0, 300) : null; }})()"))
    inputs = t.js(f"(() => {{ const d = {d}; return d ? [...d.querySelectorAll('input, textarea')].filter(i => i.offsetParent).map(i => [i.id, i.placeholder || i.getAttribute('aria-label')]) : []; }})()")
    log("picker inputs:", inputs)
    if inputs:
        t.click(f"[...({d}).querySelectorAll('input, textarea')].filter(i => i.offsetParent)[0]")
        t.type(title)
        key(t, "Enter", "Enter", 13, "\r")
        time.sleep(4)
    shot(t, "yt_4_picker")
    item = f"""(() => {{ const d = {d}; if (!d) return null;
        const hit = [...d.querySelectorAll('*')].filter(e => e.offsetParent && e.children.length === 0 && (e.innerText || '').trim() === {json.dumps(title)});
        if (!hit.length) return null; let e = hit[0];
        for (let i = 0; i < 8 && e.parentElement; i++) {{ if (/^(YTCP-ENTITY-CARD|TP-YT-PAPER-ITEM|BUTTON)$/.test(e.tagName) || e.getAttribute('role') === 'button' || e.getAttribute('tabindex') === '0') break; e = e.parentElement; }}
        return e; }})()"""
    log("item:", t.js(f"(() => {{ const e = {item}; return e ? e.tagName + ' ' + e.innerText.trim().replace(/\\s+/g, ' ').slice(0, 80) : null; }})()"))
    if not t.js(f"!!{item}"):
        result({"ok": False, "error": "archive_not_in_picker", "title": title,
                "dialog": t.js(f"(() => {{ const d = {d}; return d ? d.innerText.slice(0, 1500) : null; }})()")})
        return
    t.click(item)
    time.sleep(3)
    # 選んだあとに確定の押しどころがあれば押す
    t.js(f"""(() => {{ const d = {d}; if (!d) return; const b = [...d.querySelectorAll('ytcp-button, button')].find(b => b.offsetParent && /^(完了|選択|保存|Done|Select)$/.test((b.innerText || '').trim())); if (b) b.click(); }})()""")
    time.sleep(2)
    trig = t.js(f"{TRIGGER}.innerText.trim().replace(/\\s+/g, ' ')")
    log("trigger now:", trig)
    shot(t, "yt_5_related_selected")
    if title not in (trig or ""):
        result({"ok": False, "error": "not_selected", "trigger": trig})
        return
    if dry:
        result({"ok": True, "dry": True, "trigger": trig})
        return
    t.click(SAVE)
    time.sleep(6)
    after = linked(t, vid)
    log("linked after", after)
    result({"ok": after == [target], "video_id": vid, "linked": after, "changed": True})


def publish(t, vid, at=None, dry=False):
    """詳細のページの「公開設定」から公開にして保存し、読み直す"""
    v = get_videos(t, [vid], mask=READ)[0]
    log("before", v.get("privacy"), v.get("draftStatus"))
    if v.get("privacy") == "VIDEO_PRIVACY_PUBLIC":
        result({"ok": True, "video_id": vid, "privacy": v.get("privacy"), "changed": False})
        return
    if at:
        schedule(t, vid, at, dry=dry)
        return
    t.go(f"{BASE}/video/{vid}/edit", wait=8)
    guard_login(t)
    sel = "(document.querySelector('ytcp-video-metadata-visibility #select-button') || document.querySelector('ytcp-video-metadata-visibility'))"
    _wait(t, f"!!{sel}", 30)
    t.click(sel)
    time.sleep(3)
    # 公開設定の窓は position: fixed の tp-yt-paper-dialog の中にあり、offsetParent が null になる。
    # VISIBLE_DLG（offsetParent で絞る）では拾えないので、中身の ytcp-video-visibility-select を直に見る
    d = "(document.querySelector('ytcp-video-visibility-select') || null)"
    pub = f"({d}).querySelector('tp-yt-paper-radio-button[name=\"PUBLIC\"]')"
    if not t.js(f"!!({d}) && !!{pub}"):
        result({"ok": False, "error": "visibility_dialog", "radios": t.js(f"(() => {{ const d = {d}; return d ? [...d.querySelectorAll('tp-yt-paper-radio-button')].map(r => r.getAttribute('name')) : null; }})()")})
        return
    ok = radio(t, f"({d})", "PUBLIC")
    log("PUBLIC selected", ok)
    shot(t, "yt_6_public_selected")
    if not ok:
        result({"ok": False, "error": "public_not_selected"})
        return
    t.js(f"""(() => {{ const root = ({d}).closest('tp-yt-paper-dialog') || ({d}); const b = [...root.querySelectorAll('ytcp-button, button')].find(b => /^(完了|Done)$/.test((b.innerText || '').trim())); if (b) b.click(); }})()""")
    time.sleep(2)
    t.click(SAVE)
    time.sleep(8)
    shot(t, "yt_7_saved_public")
    v = get_videos(t, [vid], mask=READ)[0]
    result({"ok": v.get("privacy") == "VIDEO_PRIVACY_PUBLIC", "video_id": vid, "privacy": v.get("privacy"),
            "published": v.get("timePublishedSeconds"), "title": v.get("title"), "changed": True})


def scheduled_public_at(v):
    """Studio の返事から、一般公開の予約の秒（UTC の epoch）を読む。予約が無ければ None。
    形は {"scheduledPublishings": [{"scheduledTimeSeconds": "…", "action": "SCHEDULED_PUBLISHING_ACTION_SET_PUBLIC",
    "status": "SCHEDULED_PUBLISHING_STATUS_SCHEDULED"}]}（2026-10-21 に見た）"""
    for x in (v.get("scheduledPublishingDetails") or {}).get("scheduledPublishings") or []:
        if x.get("action") == "SCHEDULED_PUBLISHING_ACTION_SET_PUBLIC" and x.get("status") == "SCHEDULED_PUBLISHING_STATUS_SCHEDULED" \
                and str(x.get("scheduledTimeSeconds", "")).isdigit():
            return int(x["scheduledTimeSeconds"])
    return None


def schedule(t, vid, at, dry=False):
    """詳細のページの「公開設定」→「スケジュールを設定」で、at（UTC の ISO。"2026-10-21T10:00:00Z"）に一般公開を予約して保存する。

    - 予約の時刻は、窓の「タイムゾーン」で選ばれている地域の時刻で入れる。EC2 の Chrome の既定は「（GMT+0000）現地時間」
      （2026-10-21 に見た）。なので Chrome の時計が UTC であることを確かめてから、UTC のまま入れる
    - 入れたあと、Studio の返事（scheduledPublishingDetails）の秒を at と突き合わせる。1秒でも違えば ok にしない
    """
    import datetime as dt
    m = re.fullmatch(r"(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::00)?Z?", at.strip())
    if not m:
        result({"ok": False, "error": "bad_at", "at": at})
        return
    when = dt.datetime(*map(int, m.groups()), tzinfo=dt.timezone.utc)
    want = int(when.timestamp())
    if want < time.time() + 15 * 60:
        result({"ok": False, "error": "too_soon", "at": at})
        return
    off = t.js("new Date().getTimezoneOffset()")
    if off != 0:
        result({"ok": False, "error": "chrome_clock_not_utc", "offset_min": off})
        return
    date_s, time_s = when.strftime("%Y/%m/%d"), f"{when.hour}:{when.minute:02d}"
    v = get_videos(t, [vid], mask=READ)[0]
    if scheduled_public_at(v) == want:
        result({"ok": True, "video_id": vid, "privacy": v.get("privacy"), "scheduled_utc": when.isoformat(), "changed": False})
        return
    t.go(f"{BASE}/video/{vid}/edit", wait=8)
    guard_login(t)
    sel = "(document.querySelector('ytcp-video-metadata-visibility #select-button') || document.querySelector('ytcp-video-metadata-visibility'))"
    _wait(t, f"!!{sel}", 30)
    t.click(sel)
    time.sleep(3)
    d = "document.querySelector('ytcp-video-visibility-select')"
    if not t.js(f"!!{d}"):
        result({"ok": False, "error": "visibility_dialog"})
        return
    t.click(f"{d}.querySelector('#second-container-expand-button')")
    time.sleep(2)
    # タイムゾーンの札（窓を開かずに読めないので、窓を開いて選ばれている行を読み、閉じる）
    tzb = f"[...{d}.querySelectorAll('ytcp-button, button')].find(b => /タイムゾーン|Time zone/.test(b.innerText || ''))"
    t.click(tzb)
    time.sleep(2)
    tzd = "[...document.querySelectorAll('tp-yt-paper-dialog, ytcp-dialog')].filter(e => e.getBoundingClientRect().width > 0 && /GMT/.test(e.innerText || '')).pop()"
    tz = t.js(f"(() => {{ const e = {tzd}; if (!e) return null; return [...e.querySelectorAll('[aria-selected=true], [aria-checked=true], .iron-selected')].map(x => x.innerText.trim().slice(0, 40)); }})()")
    log("time zone selected:", tz)
    if not tz or not any(re.search(r"GMT\+0000|GMT\+00:00|UTC", z) for z in tz):
        result({"ok": False, "error": "timezone_not_utc", "timezone": tz})
        return
    # 選び直さずに閉じる（選ばれている行をもう一度押す）
    t.click(f"[...({tzd}).querySelectorAll('[aria-selected=true], [aria-checked=true], .iron-selected')][0]")
    time.sleep(1.5)
    # 日付: 欄を開き、「日付を入力」の箱に打って Enter
    t.click(f"{d}.querySelector('#datepicker-trigger')")
    time.sleep(2)
    box = "document.querySelector('ytcp-date-picker tp-yt-paper-input#textbox input')"
    if not t.js(f"!!{box}"):
        result({"ok": False, "error": "date_input"})
        return
    t.js(f"(() => {{ const i = {box}; i.focus(); i.select(); }})()")
    t.type(date_s)
    key(t, "Enter", "Enter", 13, "\r")
    time.sleep(1.5)
    got_date = t.js(f"{d}.querySelector('#datepicker-trigger').innerText.trim()")
    # 時刻: 時刻の欄（ytcp-datetime-picker の中の、値が H:MM の箱）に打って Enter
    tin = f"[...{d}.querySelectorAll('ytcp-datetime-picker tp-yt-paper-input input')].find(i => /^\\d{{1,2}}:\\d{{2}}$/.test(i.value))"
    if not t.js(f"!!({tin})"):
        result({"ok": False, "error": "time_input", "date": got_date})
        return
    t.click(tin)
    time.sleep(1)
    t.js(f"(() => {{ const i = {tin}; i.focus(); i.select(); }})()")
    t.type(time_s)
    key(t, "Enter", "Enter", 13, "\r")
    time.sleep(1.5)
    got_time = t.js(f"(() => {{ const i = {tin}; return i ? i.value : null; }})()")
    log("schedule fields:", got_date, got_time, "| want", date_s, time_s)
    shot(t, "yt_8_schedule_set")
    if got_date != date_s or got_time != time_s:
        result({"ok": False, "error": "schedule_fields", "date": got_date, "time": got_time, "want": [date_s, time_s]})
        return
    if dry:
        # 確かめだけ。窓は「キャンセル」で閉じ、ページも保存しない
        t.js(f"""(() => {{ const root = {d}.closest('tp-yt-paper-dialog') || {d}; const b = [...root.querySelectorAll('ytcp-button, button')].find(b => /^(キャンセル|Cancel)$/.test((b.innerText || '').trim())); if (b) b.click(); }})()""")
        result({"ok": True, "dry": True, "video_id": vid, "date": got_date, "time": got_time, "timezone": tz, "want_utc": when.isoformat()})
        return
    t.js(f"""(() => {{ const root = {d}.closest('tp-yt-paper-dialog') || {d}; const b = [...root.querySelectorAll('ytcp-button, button')].find(b => /^(完了|Done)$/.test((b.innerText || '').trim())); if (b) b.click(); }})()""")
    time.sleep(2)
    t.click(SAVE)
    time.sleep(8)
    shot(t, "yt_9_saved_scheduled")
    v = get_videos(t, [vid], mask=READ)[0]
    sp = v.get("scheduledPublishingDetails") or {}
    secs = scheduled_public_at(v)
    log("read back", v.get("privacy"), json.dumps(sp, ensure_ascii=False))
    result({"ok": secs == want, "video_id": vid, "privacy": v.get("privacy"), "scheduled": sp, "scheduled_utc":
            dt.datetime.fromtimestamp(secs, dt.timezone.utc).isoformat() if secs else None, "want_utc": when.isoformat()})


def status(t, vid):
    v = get_videos(t, [vid], mask=READ)[0]
    result({"ok": True, "video": v})


# ---- 予約の差し替え（古い動画を消す）----
# YouTube は上げた動画のファイルを差し替えられない。予約中の版を直すときは、古い動画を消してから上げ直す。
# 消すのは一覧の行の「オプション」→「完全に削除」→ 窓の「理解しました」にチェック →「完全に削除」（元に戻せない）
VISIBLE = "(e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; })"
ROW = "[...document.querySelectorAll('ytcp-video-row')].find(r => [...r.querySelectorAll('a')].some(a => (a.href || '').includes('/video/{vid}/')))"
DEL_LABEL = r"/^(完全に削除|Delete forever)$/"


def still_there(t, vid, title):
    """消したあとの読み直し。ショートの一覧（下書き・非公開を含む）に、その ID の行がまだ在るか"""
    hits, seen = dup(t, title)
    return [h for h in hits if h["id"] == vid], seen


def delete(t, vid, title, dry=False):
    """古い動画（非公開・予約中）を消す。

    - **公開済みは消さない**（見た人のいる動画。差し替えの対象ではない）
    - **題が控えと1字でも違えば消さない**（ID の書き違いで別の動画を消さない）
    - 行は ID（行の中のリンク）で探す。窓の字に題が無ければ押さない
    - 消したあとは一覧で読み直し、その ID の行が無いのを見てから ok にする"""
    try:
        v = get_videos(t, [vid], mask=READ)
        v = v[0] if v else {}
    except RuntimeError as e:
        # 消えた動画は get_creator_videos が失敗で返ることがある。一覧で読み直して決める
        log("get_creator_videos failed:", str(e)[:200])
        v = {}
    log("before", v.get("videoId"), v.get("privacy"), json.dumps(v.get("scheduledPublishingDetails"), ensure_ascii=False))
    if v.get("videoId") != vid:
        left, seen = still_there(t, vid, title)
        result({"ok": not left, "video_id": vid, "error": None if not left else "not_readable", "already_gone": not left, "seen": seen})
        return
    if (v.get("title") or "").strip() != title.strip():
        result({"ok": False, "error": "title_mismatch", "video_id": vid, "title": v.get("title")})
        return
    if v.get("privacy") == "VIDEO_PRIVACY_PUBLIC":
        result({"ok": False, "error": "public_video", "video_id": vid})
        return
    t.go(url_of("videos/short"), wait=8)
    guard_login(t)
    row = ROW.replace("{vid}", vid)
    _wait(t, "document.querySelectorAll('ytcp-video-row').length > 0", 40)
    if not t.js(f"!!({row})"):
        result({"ok": False, "error": "row_not_found", "video_id": vid,
                "rows": t.js("[...document.querySelectorAll('ytcp-video-row')].slice(0, 10).map(r => r.innerText.trim().slice(0, 60))")})
        return
    # 行の上に指を置くと、行の右に操作の印（オプションほか）が出る
    c = t.center(row)
    t.call("Input.dispatchMouseEvent", type="mouseMoved", x=c[0], y=c[1])
    time.sleep(1.5)
    btns = t.js(f"""[...({row}).querySelectorAll('ytcp-icon-button, button, [role=button]')].filter({VISIBLE})
        .map(b => [b.tagName.toLowerCase(), b.id, b.getAttribute('aria-label') || (b.innerText || '').trim().slice(0, 20)])""")
    log("row buttons:", btns)
    opt = f"[...({row}).querySelectorAll('ytcp-icon-button, button, [role=button]')].filter({VISIBLE}).find(b => /^(オプション|Options)$/.test(b.getAttribute('aria-label') || ''))"
    if not t.js(f"!!({opt})"):
        shot(t, "yt_del_0_row")
        result({"ok": False, "error": "options_not_found", "buttons": btns})
        return
    t.click(opt)
    time.sleep(1.5)
    items = t.js(f"[...document.querySelectorAll('tp-yt-paper-item, [role=menuitem], ytcp-ve')].filter({VISIBLE}).map(e => (e.innerText || '').trim()).filter(s => s && s.length < 30)")
    log("menu:", items)
    item = f"[...document.querySelectorAll('tp-yt-paper-item, [role=menuitem]')].filter({VISIBLE}).find(e => {DEL_LABEL}.test((e.innerText || '').trim()))"
    if not t.js(f"!!({item})"):
        shot(t, "yt_del_1_menu")
        result({"ok": False, "error": "delete_item_not_found", "menu": items})
        return
    t.click(item)
    time.sleep(2.5)
    dlg = f"[...document.querySelectorAll('ytcp-dialog, tp-yt-paper-dialog, ytcp-confirmation-dialog')].filter({VISIBLE}).filter(e => [...e.querySelectorAll('ytcp-button, button')].some(b => {DEL_LABEL}.test((b.innerText || '').trim()))).pop()"
    text = t.js(f"(() => {{ const d = {dlg}; return d ? d.innerText.trim().replace(/\\s+/g, ' ').slice(0, 600) : null; }})()")
    log("dialog:", text)
    shot(t, "yt_del_2_dialog")
    # 窓には動画の題が出る（長い題は途中で切れて見えるが、innerText は全部）。題の頭が無ければ別の動画の窓とみて押さない
    if not text or title.strip()[:12] not in text:
        result({"ok": False, "error": "dialog_not_for_this_video", "dialog": text})
        return
    box = f"({dlg}).querySelector('ytcp-checkbox-lit, #checkbox, [role=checkbox]')"
    if not t.js(f"!!({box})"):
        result({"ok": False, "error": "confirm_checkbox_not_found", "dialog": text})
        return
    checked = f"(() => {{ const b = {box}; return b.hasAttribute('checked') || b.getAttribute('aria-checked') === 'true' || !!b.querySelector('[aria-checked=true]'); }})()"
    if not t.js(checked):
        t.click(box)
        time.sleep(1)
    btn = f"[...({dlg}).querySelectorAll('ytcp-button, button')].find(b => {DEL_LABEL}.test((b.innerText || '').trim()))"
    enabled = t.js(f"(() => {{ const b = {btn}; return !!b && !b.hasAttribute('disabled') && b.getAttribute('aria-disabled') !== 'true'; }})()")
    log("confirm checked", t.js(checked), "| button enabled", enabled)
    shot(t, "yt_del_3_checked")
    if not (t.js(checked) and enabled):
        result({"ok": False, "error": "confirm_not_ready", "checked": t.js(checked), "enabled": enabled})
        return
    if dry:
        t.js(f"(() => {{ const b = [...({dlg}).querySelectorAll('ytcp-button, button')].find(b => /^(キャンセル|Cancel)$/.test((b.innerText || '').trim())); if (b) b.click(); }})()")
        result({"ok": True, "dry": True, "video_id": vid, "dialog": text})
        return
    t.click(btn)
    log("clicked delete forever")
    left, seen = [vid], 0
    for _ in range(12):
        time.sleep(5)
        left, seen = still_there(t, vid, title)
        if not left:
            break
    shot(t, "yt_del_4_after")
    result({"ok": not left, "video_id": vid, "deleted": not left, "left": left, "seen": seen})


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else ""
    if cmd == "dup":
        t = studio(url_of("videos/short"), wait=6)
        guard_login(t)
        hits, seen = dup(t, sys.argv[2])
        result({"ok": True, "hits": hits, "seen": seen})
    elif cmd == "draft":
        t = studio(url_of("videos/short"), wait=6)
        guard_login(t)
        draft(t, sys.argv[2], json.load(open(sys.argv[3])))
    elif cmd == "resume":
        t = studio(url_of("videos/short"), wait=6)
        guard_login(t)
        resume(t, sys.argv[2], json.load(open(sys.argv[3])))
    elif cmd == "related":
        t = studio(url_of("videos/short"), wait=6)
        guard_login(t)
        related(t, sys.argv[2], sys.argv[3], dry="--dry" in sys.argv)
    elif cmd == "publish":
        t = studio(url_of("videos/short"), wait=6)
        guard_login(t)
        publish(t, sys.argv[2], at=sys.argv[sys.argv.index("--at") + 1] if "--at" in sys.argv else None, dry="--dry" in sys.argv)
    elif cmd == "status":
        t = studio(url_of("videos/short"), wait=6)
        guard_login(t)
        status(t, sys.argv[2])
    elif cmd == "delete":
        # python3 yt_post.py delete <動画ID> <題> [--dry]（題は控えの post_*.json の youtube.title）
        t = studio(url_of("videos/short"), wait=6)
        guard_login(t)
        delete(t, sys.argv[2], sys.argv[3], dry="--dry" in sys.argv)
    else:
        sys.exit(__doc__)
