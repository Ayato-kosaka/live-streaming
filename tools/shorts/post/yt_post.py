#!/usr/bin/env python3
"""EC2 の上で動く。YouTube Studio にショートを上げる（非公開で保存 → 確かめる → 公開）。

`ec2-chrome` の cdp.py と `youtube-studio` の yt_studio.py の上に乗る。手元から
`ec2.py put` で `/home/ubuntu/cdp/yt_post.py` に置き、手元の `post.py` から呼ぶ（README.md）。

    python3 yt_post.py dup <題>                       # 同じ題のショートがもう在るか
    python3 yt_post.py draft <mp4> <post.json>        # 上げて、題・説明・子ども向けでない・改変なし → 非公開で保存
    python3 yt_post.py resume <動画ID> <post.json>    # 途中で閉じた下書きを開き直して続きから
    python3 yt_post.py related <動画ID> <元の動画ID>   # 「関連動画」に元のアーカイブを付けて保存
    python3 yt_post.py publish <動画ID> [--at <ISO>]  # 公開（--at で予約）にして保存
    python3 yt_post.py status <動画ID>                # 題・説明・公開範囲・関連動画を読み直す

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
sys.path.insert(0, "/home/ubuntu/cdp")
from cdp import where  # noqa: E402
from yt_studio import studio, api, get_videos, url_of, CH, BASE, _wait  # noqa: E402

SHOTS = "/home/ubuntu/shots/post"
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


def publish(t, vid, at=None):
    """詳細のページの「公開設定」から公開にして保存し、読み直す"""
    v = get_videos(t, [vid], mask=READ)[0]
    log("before", v.get("privacy"), v.get("draftStatus"))
    if v.get("privacy") == "VIDEO_PRIVACY_PUBLIC":
        result({"ok": True, "video_id": vid, "privacy": v.get("privacy"), "changed": False})
        return
    if at:
        result({"ok": False, "error": "schedule_not_implemented"})
        return
    t.go(f"{BASE}/video/{vid}/edit", wait=8)
    guard_login(t)
    sel = "(document.querySelector('ytcp-video-metadata-visibility #select-button') || document.querySelector('ytcp-video-metadata-visibility'))"
    _wait(t, f"!!{sel}", 30)
    t.click(sel)
    time.sleep(3)
    d = VISIBLE_DLG
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
    t.js(f"""(() => {{ const b = [...({d}).querySelectorAll('ytcp-button, button')].find(b => b.offsetParent && /^(完了|Done)$/.test((b.innerText || '').trim())); if (b) b.click(); }})()""")
    time.sleep(2)
    t.click(SAVE)
    time.sleep(8)
    shot(t, "yt_7_saved_public")
    v = get_videos(t, [vid], mask=READ)[0]
    result({"ok": v.get("privacy") == "VIDEO_PRIVACY_PUBLIC", "video_id": vid, "privacy": v.get("privacy"),
            "published": v.get("timePublishedSeconds"), "title": v.get("title"), "changed": True})


def status(t, vid):
    v = get_videos(t, [vid], mask=READ)[0]
    result({"ok": True, "video": v})


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
        publish(t, sys.argv[2], at=sys.argv[sys.argv.index("--at") + 1] if "--at" in sys.argv else None)
    elif cmd == "status":
        t = studio(url_of("videos/short"), wait=6)
        guard_login(t)
        status(t, sys.argv[2])
    else:
        sys.exit(__doc__)
