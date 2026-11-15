#!/usr/bin/env python3
"""EC2 の上で動く。ログイン済みの Chrome（~/cdp-ytstudio）で Google マイマップを取り込み直す・作る・共有する・フォルダへ移す。

手元の mymaps.py が毎回 /home/ubuntu/cdp/ へ置き直して呼ぶ。手で呼ぶのは、画面が変わって道具が落ちたときの見当つけだけ:

    python3 mymaps_ec2.py job <job.json> <state.json>   # job の地図を順に。済んだ手は state に書き、もう一度流すと続きから
    python3 mymaps_ec2.py look <url>                    # 画面の押せそうなものとダイアログの字を出す（何も押さない）

## 画面の手（2026-11-15 に1手ずつ確かめた）

- 取り込み: 「レイヤを追加」→ 新しいレイヤの「インポート」→ ファイル選び（docs.google.com/picker の iframe）の
  「アップロード」→ 隠れた <input type=file> に CSV を渡す → 「目印を配置する列」で 緯度・経度 に印を付け、
  出てくる吹き出しでそれぞれ 緯度・経度 を選ぶ → 続行 →「タイトルとして使用する列」で 名前 → 完了
  - **吹き出しを選ばずに次の列の印を押すと、前の列の印が外れる。** 1列ずつ、印 → 吹き出し → 次の列
  - 取り込んだレイヤの名前はファイル名（「見たいもの.csv」）になる。終わりに「見たいもの」へ付け直す
- **レイヤは「足してから消す」。** 先に消すと、取り込みが途中で落ちたときに地図が空のまま残る（面の埋め込みが空の枠になる）
- ファイル選びは www.google.com と同じサイトなので別のタブ（target）にならない。中の要素は
  DOM.getDocument(pierce) と、その枠の隔離ワールドで触る
- 共有: 「共有」→ `#linksharing`（リンクを知っている人なら誰でも表示できる）を押す。入っているかは
  スイッチではなく、ログインしていない側から KML が読めるかで決める（public()）。`#discoverability` は触らない
"""
import json, os, re, sys, time, urllib.error, urllib.parse, urllib.request

sys.path.insert(0, "/home/ubuntu/cdp")
from cdp import Tab, pages, up, where  # noqa: E402

LANE = "ytstudio"   # Google にログイン済みのプロファイル（~/cdp-ytstudio）。札の列も同じ名前
EDIT = "https://www.google.com/maps/d/u/0/edit?mid={}&hl=ja"
HOME = "https://www.google.com/maps/d/u/0/?hl=ja"
DRIVE_FOLDER = "https://drive.google.com/drive/u/0/folders/{}?hl=ja"


def say(*a):
    print(time.strftime("%H:%M:%S"), *a, flush=True)


def q(s):
    return json.dumps(s, ensure_ascii=False)


# ---------------------------------------------------------------- タブ

def _browser(port):
    import websocket
    v = json.load(urllib.request.urlopen(f"http://localhost:{port}/json/version"))
    return websocket.create_connection(v["webSocketDebuggerUrl"], timeout=20, suppress_origin=True)


def _bcall(b, method, **params):
    b.send(json.dumps({"id": 1, "method": method, "params": params}))
    while True:
        m = json.loads(b.recv())
        if m.get("id") == 1:
            return m.get("result", {})


class LoginNeeded(RuntimeError):
    pass


CUR = {"t": None}   # いま触っているタブ（落ちたときに、その画面を撮る）


def fresh(url, wait=6):
    """**新しいタブを1枚作り、ほかは全部閉じる。** 前の send-command で開いたタブに繋ぎ直すと
    固まっていることがある（ドライブの画面で 2026-11-15 に1回。ec2-chrome の 4）"""
    port = up(LANE)
    b = _browser(port)
    old = pages(LANE)
    tid = _bcall(b, "Target.createTarget", url="about:blank")["targetId"]
    for p in old:
        _bcall(b, "Target.closeTarget", targetId=p["id"])
    b.close()
    time.sleep(1)
    p = next(p for p in pages(LANE) if p["id"] == tid)
    t = Tab(port, p, timeout=90)
    CUR["t"] = t
    t.call("Page.navigate", url=url)
    t.wait_ready(40)
    time.sleep(wait)
    if "accounts.google.com" in (t.url() or ""):
        # ログインが切れている。ここで止める（押さない・パスワードは打たない・本人確認の画面は開かない）
        t.shot("/home/ubuntu/shots/mymaps-login.jpg")
        raise LoginNeeded(f"ログインの画面で止まった: {where(t.url())}（{t.js('document.title')}）")
    return t


def until(t, expr, timeout=40, what=""):
    # 要素を返す式は returnByValue で {} になり、Python では偽に読める（2026-11-15 に3枚とも
    # 「編集画面を待ちきれない」で落ちた）。要素は true に直してから返す
    wrapped = f"(() => {{ const v = ({expr}); return (v instanceof Node) ? true : v; }})()"
    end = time.time() + timeout
    while time.time() < end:
        try:
            v = t.js(wrapped)
        except Exception:
            v = None
        if v:
            return v
        time.sleep(0.5)
    raise RuntimeError(f"待ちきれなかった（{timeout}秒）: {what or expr[:100]}")


def gone(t, expr, timeout=40, what=""):
    return until(t, f"!({expr})", timeout, what)


def press(t, expr, tries=6):
    """要素を本物のマウスで押す。**送ってから少し待って測り直し、その点に本当にその要素が居るかを見てから押す。**
    レイヤが3枚を超えると左の板が送られ、送った直後に測った座標が隣のレイヤの箱を指して、
    「インポート」を押したつもりで何も起きなかった（2026-11-15）"""
    c = None
    for i in range(tries):
        t.js(f"(() => {{ const e = ({expr}); if (e) e.scrollIntoView({{block: 'center', behavior: 'instant'}}); }})()")
        time.sleep(0.7)
        c = t.js(f"""(() => {{ const e = ({expr}); if (!e) return null; const b = e.getBoundingClientRect();
            const x = b.x + b.width / 2, y = b.y + b.height / 2; const h = document.elementFromPoint(x, y);
            return [x, y, !!h && (h === e || e.contains(h))]; }})()""")
        if c and c[2]:
            break
    if not c:
        raise RuntimeError(f"not found: {expr[:120]}")
    t.click_at(c[0], c[1])
    return c


def frame_eval(t, url_part, expr):
    """同じサイトの iframe（ファイル選び）の中で JS を回す。枠ごとの隔離ワールドを作って評価する"""
    def frames(node):
        yield node["frame"]
        for c in node.get("childFrames", []):
            yield from frames(c)
    tree = t.call("Page.getFrameTree")["frameTree"]
    for f in frames(tree):
        if url_part in f.get("url", ""):
            ctx = t.call("Page.createIsolatedWorld", frameId=f["id"], worldName="mymaps")["executionContextId"]
            r = t.call("Runtime.evaluate", expression=expr, contextId=ctx, returnByValue=True)
            return r.get("result", {}).get("value")
    return None


def file_inputs(t):
    doc = t.call("DOM.getDocument", depth=-1, pierce=True)["root"]
    out = []

    def walk(n):
        at = n.get("attributes", [])
        a = dict(zip(at[::2], at[1::2]))
        if n.get("nodeName") == "INPUT" and a.get("type") == "file":
            out.append(n["backendNodeId"])
        for c in n.get("children", []) + ([n["contentDocument"]] if "contentDocument" in n else []) + n.get("shadowRoots", []):
            walk(c)
    walk(doc)
    return out


VIS = "(e => { const b = e.getBoundingClientRect(); return b.width > 0 && b.height > 0; })"


def dlg_button(label):
    return (f"[...document.querySelectorAll('[role=dialog] button,[role=alertdialog] button')]"
            f".find(e => {VIS}(e) && e.innerText.trim() === {q(label)})")


def dialogs(t):
    return t.js(f"[...document.querySelectorAll('[role=dialog],[role=alertdialog]')].filter({VIS})"
                ".map(e => e.innerText.trim().replace(/\\s+/g, ' ').slice(0, 300))") or []


# ---------------------------------------------------------------- マイマップ

LAYERS = (f"[...document.querySelectorAll('[id$=-layer-header]')].filter(e => {VIS}(e) && e.id !== 'sr-layer-header')"
          ".map(e => [e.id.replace(/-layer-header$/, ''), e.innerText.trim()])")


def layers(t):
    return t.js(LAYERS) or []


def mid_of(t):
    m = re.search(r"[?&]mid=([\w-]+)", t.url() or "")
    return m.group(1) if m else None


def open_map(mid):
    t = fresh(EDIT.format(mid))
    until(t, "document.querySelector('#map-action-add-layer')", 60, "マイマップの編集画面")
    if mid_of(t) != mid:
        raise RuntimeError(f"開いた地図が違う: {where(t.url())}")
    return t


def create_map(title):
    """新しい地図を作って題を付ける。戻り値はタブ（mid は mid_of で読む）"""
    t = fresh(HOME)
    # 「新しい地図を作成」は一覧の上のボタン。字で当てる（class は毎回変わる）
    press(t, f"[...document.querySelectorAll('button,[role=button],a')].find(e => {VIS}(e) && /新しい地図を作成|地図を新規作成/.test(e.innerText || e.getAttribute('aria-label') || ''))")
    # 「マイマップを作ると題・サムネイルなどがドライブに上がる」の確かめが出る（2026-11-15。英語のまま）。CREATE を押す
    ok = "/[?&]mid=/.test(location.href) && !!document.querySelector('#map-action-add-layer')"
    agree = (f"[...document.querySelectorAll('[role=dialog] button,[role=dialog] [role=button],[role=alertdialog] button')]"
             f".find(e => {VIS}(e) && /^(create|作成)$/i.test((e.innerText || '').trim()))")
    end = time.time() + 90
    while time.time() < end and not t.js(ok):
        if t.js(f"!!({agree})"):
            press(t, agree)
            say("  ドライブに上がる確かめに CREATE")
        time.sleep(2)
    until(t, ok, 30, "新しい地図の編集画面")
    # 題はここで付けない。mid を控えてから付ける（題で落ちて mid を控えずに抜けると、
    # 次の回が地図をもう1枚作り「無題の地図」が溜まる。2026-11-15 に3枚溜めた）
    return t


TITLE_EL = ("(b => b && [...b.querySelectorAll('*')].find(e => e.childElementCount === 0 && (e.innerText || '').trim()"
            " && (e.innerText || '').trim() === (b.innerText || '').trim().split('\\n')[0].trim()))(document.querySelector('#map-title-desc-bar'))")


def set_title(t, title):
    # 押すのは題の字そのもの。箱（#map-title-desc-bar）の真ん中は「表示回数・最終編集」の行で、押しても開かない
    cur = t.js("(document.querySelector('#map-title-desc-bar') || {innerText: ''}).innerText.trim().split('\\n')[0].trim()")
    box = f"[...document.querySelectorAll('input')].find(e => {VIS}(e) && e.value.trim() === {q(cur)})"
    for _ in range(3):
        press(t, TITLE_EL)
        try:
            until(t, box, 10, "題の欄")
            break
        except RuntimeError:
            continue
    until(t, box, 5, f"題の欄（いまの題 {cur}）")
    t.js(f"(() => {{ const i = {box}; i.focus(); i.select(); }})()")
    t.type(title)
    time.sleep(0.5)
    press(t, dlg_button("保存"))
    until(t, f"(document.querySelector('#map-title-desc-bar') || {{}}).innerText.trim().startsWith({q(title)})", 20, "題が付いた")


def layer_menu(t, ly, label):
    press(t, f"document.querySelector('#{ly}-layer-header [aria-label=\"レイヤ オプション\"]')")
    until(t, f"[...document.querySelectorAll('[role=menuitem]')].find(e => {VIS}(e) && e.innerText.trim() === {q(label)})", 10, label)
    press(t, f"[...document.querySelectorAll('[role=menuitem]')].find(e => {VIS}(e) && e.innerText.trim() === {q(label)})")


def import_csv(t, path):
    """新しいレイヤを足して CSV を取り込む。戻り値は新しいレイヤの id（ly3 など）"""
    if not os.path.isfile(path):
        # 無いパスを渡すと Chrome は黙って空のファイルを渡す（ec2-chrome の 4）
        raise RuntimeError(f"CSV が無い: {path}")
    before = {ly for ly, _ in layers(t)}
    press(t, "document.querySelector('#map-action-add-layer')")
    ly = until(t, f"(() => {{ const b = new Set({q(sorted(before))}); const n = ({LAYERS}).find(x => !b.has(x[0])); return n && n[0]; }})()",
               20, "足したレイヤ")
    # 足した直後は「インポート」がまだ幅0のことがある。その座標（左上の 0,0）を押すと地図のピンを押してしまう
    imp = f"(e => e && {VIS}(e) && e)(document.querySelector('#{ly}-layerview-import-link'))"
    until(t, imp, 20, "足したレイヤの「インポート」")
    time.sleep(1)
    press(t, imp)
    until(t, f"[...document.querySelectorAll('iframe')].find(f => /docs\\.google\\.com\\/picker/.test(f.src) && {VIS}(f))", 30, "ファイル選び")
    # 「アップロード」を開くまで input は無い。**JS の click() では開かない**（2026-11-15。押した扱いにならず
    # input が出なかった）。枠の中の字の位置に、枠の位置を足して、本物のマウスで押す
    frame_box = t.js(f"(() => {{ const f = [...document.querySelectorAll('iframe')].find(f => /docs\\.google\\.com\\/picker/.test(f.src) && {VIS}(f));"
                     " const b = f.getBoundingClientRect(); return [b.x, b.y]; })()")
    end = time.time() + 40
    while time.time() < end and not file_inputs(t):
        # 字は葉の要素に入っていない（アイコンと並んだ字の節）。字の節そのものの位置を Range で測る
        r = frame_eval(t, "docs.google.com/picker",
                       "(() => { const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); let n;"
                       " while ((n = w.nextNode())) { if (/^(アップロード|Upload)$/.test(n.data.trim())) {"
                       " const g = document.createRange(); g.selectNodeContents(n); const b = g.getBoundingClientRect();"
                       " if (b.width) return [b.x + b.width / 2, b.y + b.height / 2]; } } return null; })()")
        if r:
            t.click_at(frame_box[0] + r[0], frame_box[1] + r[1])
            time.sleep(2)
        else:
            time.sleep(1)
    ids = file_inputs(t)
    if not ids:
        raise RuntimeError("ファイル選びの「アップロード」に input が出ない")
    t.call("DOM.setFileInputFiles", backendNodeId=ids[-1], files=[path])
    until(t, "document.querySelector('[id^=upload-checkbox-label-]')", 60, "目印を配置する列の選択")
    for col in ("緯度", "経度"):
        lab = f"[...document.querySelectorAll('[id^=upload-checkbox-label-]')].find(e => e.innerText.trim() === {q(col)})"
        chk = f"({lab}).previousElementSibling.querySelector('[role=checkbox]')"
        if not t.js(f"!!({lab})"):
            raise RuntimeError(f"CSV に {col} の列が無い")
        done = f"{chk}.getAttribute('aria-checked') === 'true' && ({lab}).parentElement.innerText.includes('({col})')"
        # 吹き出しは列ごとに出る。前の列の吹き出しが閉じる途中で残っていると、そちらの radio を押してしまう
        # （2026-11-15 に1枚それで落ちた）。いちばん新しい（最後の）吹き出しの中だけを見て、効くまで3回
        radio = (f"(() => {{ const d = [...document.querySelectorAll('[role=alertdialog]')].filter({VIS}).pop();"
                 f" return d && [...d.querySelectorAll('[role=radio]')].find(e => {VIS}(e) && e.innerText.trim() === {q(col)}); }})()")
        for _ in range(3):
            if t.js(done):
                break
            if t.js(f"{chk}.getAttribute('aria-checked') !== 'true'"):
                press(t, f"({lab}).previousElementSibling")
            until(t, radio, 10, f"{col} の吹き出し")
            time.sleep(1)
            press(t, radio)
            try:
                until(t, done, 5, f"{col} に印")
            except RuntimeError:
                continue
        if not t.js(done):
            raise RuntimeError(f"{col} の列に印が付かない")
    press(t, dlg_button("続行"))
    title_radio = (f"[...document.querySelectorAll('[role=dialog] [role=radio]')]"
                   f".find(e => {VIS}(e) && e.innerText.trim() === '名前')")
    until(t, title_radio, 20, "タイトルとして使用する列")
    press(t, title_radio)
    time.sleep(0.5)
    press(t, dlg_button("完了"))
    name = os.path.basename(path)
    until(t, f"(({LAYERS}).find(x => x[0] === {q(ly)}) || [])[1] === {q(name)}", 90, "取り込みが終わる")
    gone(t, f"[...document.querySelectorAll('[role=dialog]')].find({VIS})", 30, "ダイアログが閉じる")
    err = t.js(f"(() => {{ const e = document.querySelector('#{ly}-layerview-error-infobox'); return e && {VIS}(e) ? e.innerText.trim() : ''; }})()")
    if err:
        raise RuntimeError(f"取り込めなかった行がある: {err[:200]}")
    return ly


def delete_layer(t, ly):
    layer_menu(t, ly, "このレイヤを削除")
    until(t, dlg_button("削除"), 10, "削除の確かめ")
    press(t, dlg_button("削除"))
    gone(t, f"({LAYERS}).find(x => x[0] === {q(ly)})", 20, f"{ly} が消える")


def rename_layer(t, ly, name):
    layer_menu(t, ly, "このレイヤの名前を変更")
    until(t, f"[...document.querySelectorAll('[role=dialog] input')].find({VIS})", 10, "レイヤ名の欄")
    t.js(f"(() => {{ const i = [...document.querySelectorAll('[role=dialog] input')].find({VIS}); i.focus(); i.select(); }})()")
    t.type(name)
    time.sleep(0.4)
    press(t, dlg_button("保存"))
    until(t, f"(({LAYERS}).find(x => x[0] === {q(ly)}) || [])[1] === {q(name)}", 20, "レイヤ名が変わる")


KML = "https://www.google.com/maps/d/kml?mid={}&forcekml=1"


def public(mid):
    """**ログインしていない側から** KML が読めるか（200 = リンクを知っている人なら誰でも見られる・403 = 非公開）。
    共有のダイアログのスイッチ（#linksharing の checked）は当てにならない: 開き直すと、入っていても「切」と読める
    （2026-11-15。それを信じて押し、入っていた共有を2回切った。埋め込みは非公開でも 200 を返すので、そちらでも見えない）"""
    try:
        with urllib.request.urlopen(urllib.request.Request(KML.format(mid), headers={"User-Agent": "Mozilla/5.0"}), timeout=30) as r:
            return r.status == 200
    except urllib.error.HTTPError:
        return False


def share_link(t, mid):
    """リンクを知っている全員が閲覧可にする。外から読めるときは何も押さない。戻り値は (前, 後)"""
    before = public(mid)
    if before:
        return before, before
    for _ in range(2):
        press(t, "document.querySelector('#map-action-share')")
        until(t, "document.querySelector('#linksharing')", 20, "共有のダイアログ")
        time.sleep(3)
        press(t, "document.querySelector('#linksharing')")
        end = time.time() + 40
        while time.time() < end and not public(mid):
            time.sleep(3)
        press(t, dlg_button("閉じる"))
        time.sleep(2)
        if public(mid):
            return before, True
    return before, public(mid)


def saved(t, timeout=30):
    """「最終編集: 数秒前」かそれに近い字が出るまで待つ（保存が済んでからタブを閉じる）"""
    try:
        until(t, "/最終編集|すべての変更をドライブに保存しました|Last edit|saved/.test((document.querySelector('#map-title-desc-bar') || {}).innerText || '')", timeout, "保存")
    except RuntimeError:
        pass
    time.sleep(3)


# ---------------------------------------------------------------- 1枚ぶん

def one(m, st, save):
    """m = {key, title, layer, csv, sha, mid?}。st は state の中の m["key"] の入れ物（済んだ手を書く）"""
    if st.get("sha") != m.get("sha"):
        # CSV が変わった（焼き直した）なら、取り込みからやり直す。作った mid と共有は持ち越す
        st.pop("imported", None)
        st["sha"] = m.get("sha")
    mid = st.get("mid") or m.get("mid")
    if mid:
        t = open_map(mid)
    else:
        t = create_map(m["title"])
        mid = mid_of(t)
        st["mid"] = mid
        st["created"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
        save()
        say(f"{m['key']}: 作った mid={mid}")
    if not (t.js("(document.querySelector('#map-title-desc-bar') || {}).innerText") or "").strip().startswith(m["title"]):
        set_title(t, m["title"])
        say(f"{m['key']}: 題を付け直した")
    if not st.get("imported"):
        old = [ly for ly, _ in layers(t)]
        ly = import_csv(t, m["csv"])
        say(f"{m['key']}: 取り込んだ（{ly}）")
        for o in old:
            delete_layer(t, o)
        say(f"{m['key']}: 前のレイヤ {len(old)}枚を消した")
        rename_layer(t, ly, m["layer"])
        saved(t)
        st["imported"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
        st["layers"] = layers(t)
        save()
    else:
        say(f"{m['key']}: 取り込みは済んでいる（{st['imported']}）")
    # 共有は毎回読む（入っていれば押さない）。控えを信じて飛ばすと、切れた共有に気づけない
    if m.get("share"):
        b, a = share_link(t, mid)
        say(f"{m['key']}: 外から読めるか {b} → {a}")
        if not a:
            raise RuntimeError("リンクの共有が入らなかった")
        st["shared"] = True
        save()
    return mid


def job(job_path, state_path):
    jb = json.load(open(job_path, encoding="utf-8"))
    state = json.load(open(state_path, encoding="utf-8")) if os.path.exists(state_path) else {}

    def save():
        tmp = state_path + ".new"
        json.dump(state, open(tmp, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
        os.replace(tmp, state_path)

    bad = 0
    for m in jb["maps"]:
        st = state.setdefault(m["key"], {})
        try:
            one(m, st, save)
        except LoginNeeded as e:
            say(f"LOGIN_NEEDED {e}")
            print("STATE " + json.dumps(state, ensure_ascii=False))
            return 3
        except Exception as e:
            bad += 1
            st["error"] = str(e)[:300]
            save()
            say(f"{m['key']}: 落ちた: {e}")
            try:
                CUR["t"].shot(f"/home/ubuntu/shots/mymaps-{m['key']}.jpg")
                print("  dialogs:", dialogs(CUR["t"]))
            except Exception:
                pass
            continue
        st.pop("error", None)
        save()
    print("STATE " + json.dumps(state, ensure_ascii=False))
    return 1 if bad else 0


# ---------------------------------------------------------------- ドライブ

def each_frame(t, expr):
    """表の枠と、同じサイトの子の枠ぜんぶで expr を回す。[(枠の url, 値)]（値が空のものは除く）"""
    def frames(node):
        yield node["frame"]
        for c in node.get("childFrames", []):
            yield from frames(c)
    out = []
    for f in frames(t.call("Page.getFrameTree")["frameTree"]):
        try:
            ctx = t.call("Page.createIsolatedWorld", frameId=f["id"], worldName="mymaps")["executionContextId"]
            v = t.call("Runtime.evaluate", expression=expr, contextId=ctx, returnByValue=True).get("result", {}).get("value")
        except Exception:
            v = None
        if v:
            out.append((f.get("url", ""), v))
    return out


def first(t, expr, timeout=40, what=""):
    end = time.time() + timeout
    while time.time() < end:
        r = each_frame(t, expr)
        if r:
            return r[0][1]
        time.sleep(1)
    raise RuntimeError(f"待ちきれなかった（{timeout}秒）: {what or expr[:100]}")


def folder_items(folder):
    """フォルダを開いて、中の [(id, 題)] と、フォルダの名前を返す"""
    t = fresh(DRIVE_FOLDER.format(folder), 10)
    until(t, "document.querySelector('[data-id]')", 40, "フォルダの中身")
    time.sleep(3)
    items = t.js("""(() => { const m = new Map(); for (const e of document.querySelectorAll('[data-id]')) {
        const b = e.getBoundingClientRect(); const s = (e.innerText || '').trim().split('\\n')[0].replace(/ More actions$/, '');
        // 上のパンくず（My Drive > Travel > …）にも data-id がある。中身の数に入れない
        if (e.closest('nav,[role=navigation],[aria-label*=readcrumb],[role=heading]')) continue;
        if (b.width && s && !m.has(e.getAttribute('data-id'))) m.set(e.getAttribute('data-id'), s); }
      return [...m.entries()]; })()""") or []
    name = re.sub(r"\s*-\s*Google (Drive|ドライブ)$", "", t.js("document.title") or "")
    return items, name, t


# 移動のダイアログの中で回す JS。ダイアログは表の枠の [role=dialog] ではない（2026-11-15 に見た）ので、
# 枠ごとに「Move “…”」の見出しを探し、見出しから「Cancel」を含むところまで登った箱の中だけを触る
# （下の検索結果に同じ名前の字があっても押さない）
BOX = r"""const vis = e => { const b = e.getBoundingClientRect(); return b.width > 0 && b.height > 0; };
  const h = [...document.querySelectorAll('*')].find(e => e.childElementCount === 0 && vis(e)
    && /^(Move|移動)\s*[“「"]/.test((e.textContent || '').trim()));
  let box = h; while (box && ![...box.querySelectorAll('button,[role=button]')].some(b => /^(Cancel|キャンセル)$/.test((b.innerText || '').trim()))) box = box.parentElement;"""
MOVE_OPEN = "(() => { " + BOX + " return box ? h.textContent.trim().slice(0, 80) : null; })()"


def move_pick(folder, name):
    # 行に data-id（フォルダの id）があればそれで当てる。無ければ名前の字で
    return ("(() => { " + BOX + """ if (!box) return null;
    let row = [...box.querySelectorAll('[data-id=%s]')].find(vis);
    if (!row) { const leaf = [...box.querySelectorAll('*')].find(e => e.childElementCount === 0 && vis(e) && (e.textContent || '').trim() === %s);
      row = leaf && (leaf.closest('[role=option],[role=row],[role=listitem],[role=gridcell],[role=treeitem],li,[tabindex]') || leaf); }
    if (!row) return null; row.scrollIntoView({block: 'center'}); row.click();
    return (row.getAttribute('data-id') || '-') + '|' + (row.innerText || '').trim().slice(0, 40); })()""" % (q(folder), q(name)))


MOVE_GO = "(() => { " + BOX + """ if (!box) return null;
    const b = [...box.querySelectorAll('button,[role=button]')].find(b => /^(Move|移動|Move here|ここに移動)$/.test((b.innerText || '').trim())
      && vis(b) && !b.disabled && b.getAttribute('aria-disabled') !== 'true');
    if (!b) return null; b.click(); return b.innerText.trim(); })()"""
# 共有のあるフォルダへ移すと出ることがある確かめ（見出しは「Move」で始まらない）。表の枠の [role=dialog] の中の「Move」
CONFIRM = r"""(() => { const d = [...document.querySelectorAll('[role=dialog],[role=alertdialog]')].find(e => e.getBoundingClientRect().width);
  if (!d) return null; const b = [...d.querySelectorAll('button')].find(b => /^(Move|移動)$/.test((b.innerText || '').trim()) && !b.disabled);
  if (!b) return null; const s = d.innerText.trim().replace(/\s+/g, ' ').slice(0, 120); b.click(); return s; })()"""


def move_one(mid, title, folder, name):
    tile = f"[...document.querySelectorAll('[data-id=\"{mid}\"]')].find(e => {VIS}(e) && e.innerText.trim())"
    # 題で検索する。全角の「｜」で語が切れずに出ないときは、街の名前だけで引き直す
    for qq in dict.fromkeys([title, title.split("｜")[0]]):
        t = fresh("https://drive.google.com/drive/u/0/search?q=" + urllib.parse.quote(qq) + "&hl=ja", 8)
        try:
            until(t, tile, 30, f"検索に {title} が出る")
            break
        except RuntimeError:
            if qq == title.split("｜")[0]:
                raise
    c = t.js(f"(() => {{ const b = ({tile}).getBoundingClientRect(); return [b.x + Math.min(80, b.width / 3), b.y + Math.min(25, b.height / 2)]; }})()")
    t.click_at(*c)
    btn = "[...document.querySelectorAll('[aria-label]')].find(e => {0}(e) && /^(Move|移動)\\b/.test(e.getAttribute('aria-label')))".format(VIS)
    until(t, btn, 15, "選んだ札の「Move」")
    b = t.js(f"(() => {{ const b = ({btn}).getBoundingClientRect(); return [b.x + b.width / 2, b.y + b.height / 2]; }})()")
    t.click_at(*b)
    say(f"  移動のダイアログ: {first(t, MOVE_OPEN, 60, '移動のダイアログ')}")
    time.sleep(2)
    picked = first(t, move_pick(folder, name), 30, f"移動先 {name}")
    say(f"  移動先を選んだ: {picked}")
    time.sleep(1.5)
    say(f"  押した: {first(t, MOVE_GO, 20, '移動ボタン')}")
    time.sleep(4)
    again = each_frame(t, CONFIRM)
    if again:
        say(f"  確かめに答えた: {again[0][1]}")
        time.sleep(4)
    t.shot("/home/ubuntu/shots/mymaps-move.jpg")


def move(folder, mids_titles):
    items, name, _ = folder_items(folder)
    say(f"フォルダ「{name}」: 前は {len(items)}件")
    ids = {i for i, _ in items}
    bad = 0
    for mid, title in mids_titles:
        if mid in ids:
            say(f"{title}: もうフォルダにある")
            continue
        try:
            move_one(mid, title, folder, name)
        except Exception as e:
            bad += 1
            say(f"{title}: 落ちた: {e}")
            try:
                CUR["t"].shot(f"/home/ubuntu/shots/mymaps-move-{mid[:6]}.jpg")
                for u, v in each_frame(CUR["t"], "document.body && document.body.innerText.trim().replace(/\\s+/g, ' ').slice(0, 400)"):
                    print("   ", u[:50], v)
            except Exception:
                pass
    items, name, _ = folder_items(folder)
    have = {i for i, _ in items}
    miss = [t for m, t in mids_titles if m not in have]
    print(f"フォルダ「{name}」の中身（{len(items)}件）:")
    for i, s in sorted(items, key=lambda x: x[1]):
        print(f"  - {s}{'  ← 今回' if i in {m for m, _ in mids_titles} else ''}")
    if miss or bad:
        print(f"MOVE_NG 入っていない: {miss}")
        return 1
    print("MOVE_OK")
    return 0


def look(url):
    t = fresh(url, 8)
    print(where(t.url()), t.js("document.title"))
    print(t.texts(60))
    print(dialogs(t))
    t.shot("/home/ubuntu/shots/mymaps-look.jpg")


if __name__ == "__main__":
    a = sys.argv[1:]
    if a[:1] == ["job"] and len(a) == 3:
        sys.exit(job(a[1], a[2]))
    if a[:1] == ["move"] and len(a) == 3:
        # move <フォルダの id> <mid>,<mid>…（題は state ではなく地図の題を引くので、mids.json の題を mid@題 で渡す）
        pairs = [x.split("@", 1) if "@" in x else (x, "") for x in a[2].split(",") if x]
        sys.exit(move(a[1], pairs))
    if a[:1] == ["folder"] and len(a) == 2:
        items, name, _ = folder_items(a[1])
        print(f"フォルダ「{name}」（{len(items)}件）")
        for i, s in sorted(items, key=lambda x: x[1]):
            print(f"  - {s}  {i}")
        sys.exit(0)
    if a[:1] == ["look"] and len(a) == 2:
        look(a[1])
        sys.exit(0)
    print(__doc__)
    sys.exit(2)
