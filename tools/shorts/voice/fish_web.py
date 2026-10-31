#!/usr/bin/env python3
"""Fish Audio の画面（EC2 のログイン済み Chrome）で、ナレーションを1文ずつ作って持ち帰る（EC2 の上で動く）。

    python3 fish_web.py gen   --model <声のID> --lines lines.json --out ~/voice/out/<動画> [--only A/04,B/03]
                              [--budget-credits 4500] [--attempt-limit 2] [--speed 1.3]
    python3 fish_web.py adopt --model <声のID> --key A/01 --text '<送った字>' --out ...   # 画面で手で作った分を記録に取り込む
    python3 fish_web.py state --model <声のID>        # ログイン・声・モデル・速度・残りのクレジットを見るだけ（作らない）
    python3 fish_web.py speed --model <声のID> --value 1.1   # 速度のスライダーだけ合わせる（戻し用）
    python3 fish_web.py backup                       # 作る前に、あやとの下書き（字と話者）を写す（残りのクレジットも出す）
    python3 fish_web.py restore --backup <下書きの写し.json>   # 入力欄を元の下書き（声と字）に戻す

置き場所は EC2 の `~/cdp/`（ubuntu のホーム。`cdp.py` と並べる）。Chrome は `up("fish")`（`~/cdp-fish`）。
使いかたの全体と、なぜこの形かは `tools/shorts/voice/README.md`。

## 何をしているか（画面の上で）

1. 再生ページ `https://fish.audio/ja/text-to-speech/?modelId=<id>` を開く（→ `/ja/app/text-to-speech/` に移る）
2. 入力欄（`div.tiptap.ProseMirror`）を全部選んで消し、1文を `Input.insertText` で入れる。
   右下の「63 / 500 文字」が **UTF-8 のバイト数**と一致するかを確かめる（無料は1回 500 バイトまで）
3. 「音声を生成する」を押す。画面は `POST api.fish.audio/task` を**2本**送る（「追加料金なしで2パターン」。
   クレジットが付くのは片方だけで、**送った字の UTF-8 バイト数がそのままクレジット**になる）
4. 画面が自分で見に行く `GET api.fish.audio/task/<id>` の返事を CDP で読み、2本とも `finished` になるのを待つ
5. 返事の `result`（`platform.r2.fish.audio/tasks/<日付>/<id>.mp3`）を**ページの中の fetch** で取り、
   ページの中で `decodeAudioData` して長さを測ってから書く
6. 1テイク1行で `attempts.jsonl` に足す（字・バイト・クレジット・長さ・タスク ID・設定）

**押すのは「音声を生成する」だけ。** 設定（モデル・速度・正規化）はアカウントに入っているまま触らない。
例外は `gen --speed`（速度のスライダーを矢印キーで動かし、終わったら元の値に戻す）。速度は下書きの
`audio_settings.prosody.speed` に残るあやとの設定なので、戻すまでが1回ぶん。なお速度は生成された声に効かない
（2026-10-18 に 1.1 と 1.3 で同じ3行を作って長さが同じだった。README の 3）。確かめ直すときのために残してある。
「テイク1が良い」などの評価ボタンも押さない。Cookie・`authorization` の値は読まない・書かない
（要求はページ自身が送り、こちらは返事の本文を CDP で読むだけ）。
"""
from __future__ import annotations

import argparse
import base64
import json
import os
import re
import sys
import time
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
# EC2 の ubuntu のホーム。SSM のコマンドは root で走るので `~` に頼らず、ここから組む
EC2_HOME = "/home/ubuntu"
sys.path.insert(0, f"{EC2_HOME}/cdp")
from cdp import Tab, _port, hold, pages, up  # noqa: E402

NAME = "fish"
PLAY = "https://fish.audio/ja/text-to-speech/?modelId={model}"
ED = "document.querySelector('div.tiptap.ProseMirror[contenteditable=true]')"
GEN = "[...document.querySelectorAll('button')].find(b => /音声を生成/.test(b.innerText || ''))"
LIMIT_BYTES = 500
TASK_RE = re.compile(r"^https://api\.fish\.audio/task/([0-9a-f]{32})$")


def hold_lane(what: str):
    """列 fish（~/cdp-fish の Chrome。TikTok の投稿も同じ束）の札を、このプロセスの pid で持つ（cdp.py の hold）。
    2人が同じタブで声作りを回すと入力が混ざるので、ほかの人が持っていれば空くまで待つ。
    前は鍵 ~/locks/fish-voice を1文ごとに触っていたが、札は pid が生きているあいだ生きていて、
    このプロセスが終われば（kill -9 でも）次の確かめで消える。札があれば idle-stop も止めない（持てて6時間）"""
    hold(NAME, purpose=f"fish_web.py {what}")


# ---------------------------------------------------------------- タブ

def fresh_tab(timeout=120) -> Tab:
    """新しいタブを1枚作り、ほかを閉じる（前の send-command のタブは固まっていることがある。ec2-chrome 4）"""
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
    return Tab(port, p, timeout=timeout)


def drain(t: Tab, secs=1.0):
    t.ws.settimeout(secs)
    try:
        while True:
            m = json.loads(t.ws.recv())
            if "method" in m:
                t.events.append(m)
    except Exception:
        pass
    t.ws.settimeout(120)


def open_playground(t: Tab, model: str) -> dict:
    t.call("Network.enable", maxPostDataSize=65536)
    t.events.clear()
    t.go(PLAY.format(model=model), wait=8)
    # 初回の案内（「Drama 3 がさらに進化」など）は Close で閉じるだけ
    t.js("(() => { const b = [...document.querySelectorAll('button')].find(b => (b.innerText||'').trim() === 'Close' || b.getAttribute('aria-label') === 'Close'); if (b) b.click(); })()")
    time.sleep(1)
    st = state_of(t)
    st["credits_balance"] = balance(t)
    if st["login_button"]:
        raise SystemExit("ログインしていない（右上に「ログイン」）。列 fish の札を取って fish_login.py（tools/shorts/voice/）で入り直す。reseed しない（~/cdp-fish の TikTok の下書きが消える）")
    if not st["editor"] or not st["generate"]:
        raise SystemExit(f"入力欄か「音声を生成する」が見つからない: {st}")
    return st


def balance(t: Tab):
    """開いたときに画面が読む `GET /wallet/<team>/package` の返事から、残りのクレジットだけ拾う"""
    for _ in range(3):
        drain(t, 1.0)
        got = None
        for e in t.events:
            p = e.get("params", {})
            if e.get("method") == "Network.loadingFinished" and p.get("requestId") in WALLET:
                b = body_of(t, p["requestId"])
                try:
                    got = json.loads(b).get("balance") if b else got
                except Exception:
                    pass
            elif e.get("method") == "Network.responseReceived" and re.search(r"/wallet/[0-9a-f]+/package$", p["response"]["url"].split("?")[0]):
                WALLET.add(p["requestId"])
        if got is not None:
            return got
    return None


WALLET: set = set()


def state_of(t: Tab) -> dict:
    """画面に出ている設定を読む（変えない）"""
    return t.js(r"""(() => {
      const vis = e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
      const txt = e => (e.innerText || '').trim().replace(/\s+/g, ' ');
      // 速度・ボリュームはスライダーの aria 値（速度は 0.7〜1.3、ボリュームは -5〜5）
      const slider = min => { const e = document.querySelector(`[role=slider][aria-valuemin="${min}"]`); return e ? e.getAttribute('aria-valuenow') : null; };
      const model = [...document.querySelectorAll('button,[role=combobox]')].filter(vis).map(txt).find(s => /Fish Audio|Drama|S\d/.test(s) && s.length < 40) || null;
      return {
        login_button: [...document.querySelectorAll('a,button')].some(b => vis(b) && /^(ログイン|Log in|Sign in)$/.test(txt(b))),
        editor: !!document.querySelector('div.tiptap.ProseMirror[contenteditable=true]'),
        generate: [...document.querySelectorAll('button')].some(b => vis(b) && /音声を生成/.test(b.innerText || '')),
        model, speed: slider('0.7'), volume: slider('-5'),
        plan: [...document.querySelectorAll('button,div,span')].filter(vis).map(txt).find(s => /^My Team\s*(Free|Plus|Pro)/.test(s)) || null,
      };
    })()""")


SPEED = "document.querySelector('[role=slider][aria-valuemin=\"0.7\"]')"


def set_speed(t: Tab, want: float) -> float:
    """画面の「速度」のスライダーを want に合わせる（キーボードの矢印で1刻みずつ。押すのはスライダーだけ）。

    速度は下書きの `audio_settings.prosody.speed` としてサーバーに残る（あやとの設定でもある）ので、
    変えたら必ず戻す（`gen --speed` は終わりに元へ戻す）。画面の幅は 0.7〜1.3 で、それより外は選べない。
    """
    lo, hi = 0.7, 1.3
    if not lo - 1e-9 <= want <= hi + 1e-9:
        raise SystemExit(f"速度 {want} は画面で選べない（{lo}〜{hi}）")
    t.js(f"{SPEED}.focus()")
    for _ in range(40):
        now = float(t.js(f"{SPEED}.getAttribute('aria-valuenow')"))
        if abs(now - want) < 1e-6:
            break
        key, vk = ("ArrowRight", 39) if now < want else ("ArrowLeft", 37)
        t.key(key, vk=vk)
        time.sleep(0.15)
        nxt = float(t.js(f"{SPEED}.getAttribute('aria-valuenow')"))
        if (now < want < nxt) or (nxt < want < now):
            raise SystemExit(f"速度の刻みが {want} に合わない（{now} → {nxt}）")
    else:
        raise SystemExit(f"速度を {want} にできなかった（いま {now}）")
    time.sleep(2.0)   # 下書きへの書き戻し（PUT /tts-draft）を待つ
    return float(t.js(f"{SPEED}.getAttribute('aria-valuenow')"))


# ---------------------------------------------------------------- 入力

def set_text(t: Tab, text: str):
    n = len(text.encode("utf-8"))
    if n > LIMIT_BYTES:
        raise ValueError(f"{n} バイト。1回 {LIMIT_BYTES} バイトまで（無料プラン）。文を分ける")
    t.click(ED)
    time.sleep(0.2)
    for typ in ("keyDown", "keyUp"):   # Ctrl+A（入力欄の中だけ全部選ぶ）
        t.call("Input.dispatchKeyEvent", type=typ, key="a", code="KeyA", windowsVirtualKeyCode=65, modifiers=2)
    t.key("Backspace", vk=8)
    time.sleep(0.2)
    t.type(text)
    time.sleep(0.8)
    got = t.js(r"""(() => { const ed = document.querySelector('div.tiptap.ProseMirror[contenteditable=true]');
      const c = [...document.querySelectorAll('div,span,p')].filter(e => /^\s*\d+\s*\/\s*500\s*文字\s*$/.test(e.innerText || ''))
                .sort((a, b) => a.innerText.length - b.innerText.length)[0];
      return {text: ed.innerText, counter: c ? parseInt(c.innerText) : null}; })()""")
    if got["text"].strip() != text:
        raise RuntimeError(f"入力欄の字が違う: {got['text']!r}")
    if got["counter"] is not None and got["counter"] != n:
        raise RuntimeError(f"画面の数 {got['counter']} と UTF-8 のバイト数 {n} が合わない")
    return n


def set_text_lines(t: Tab, lines: list[str]):
    """改行（Shift+Enter の強制改行）を含む字を入れる。下書きを元に戻すとき用"""
    t.click(ED)
    for typ in ("keyDown", "keyUp"):
        t.call("Input.dispatchKeyEvent", type=typ, key="a", code="KeyA", windowsVirtualKeyCode=65, modifiers=2)
    t.key("Backspace", vk=8)
    for i, ln in enumerate(lines):
        if i:
            for typ in ("keyDown", "keyUp"):
                t.call("Input.dispatchKeyEvent", type=typ, key="Enter", code="Enter", windowsVirtualKeyCode=13, modifiers=8)
        if ln:
            t.type(ln)
    time.sleep(0.8)
    return t.js(f"{ED}.innerText")


# ---------------------------------------------------------------- 生成と回収

def body_of(t: Tab, rid: str):
    try:
        return t.call("Network.getResponseBody", requestId=rid).get("body", "")
    except Exception:
        return None


def collect_tasks(t: Tab, seen: dict, groups: dict):
    """溜まった通信から、POST /task の本文（group_id ごと）と GET /task/<id> の返事を拾う"""
    drain(t, 0.5)
    evs, t.events = t.events, []
    for e in evs:
        m, p = e.get("method"), e.get("params", {})
        if m == "Network.requestWillBeSent":
            r = p["request"]
            if r["method"] == "POST" and r["url"].split("?")[0] == "https://api.fish.audio/task" and r.get("postData"):
                try:
                    body = json.loads(r["postData"])
                except Exception:
                    continue
                if body.get("group_id"):
                    # 送った設定を残す。字は別に持つので外し、reCAPTCHA の札は残さない
                    par = {k: v for k, v in (body.get("parameters") or {}).items() if k not in ("text", "references")}
                    groups[body["group_id"]] = {k: v for k, v in body.items() if k not in ("parameters", "recaptcha")} | {"parameters": par}
        elif m == "Network.responseReceived":
            u = p["response"]["url"].split("?")[0]
            mm = TASK_RE.match(u)
            if mm and "json" in (p["response"].get("mimeType") or ""):
                b = body_of(t, p["requestId"])
                if b:
                    try:
                        o = json.loads(b)
                    except Exception:
                        continue
                    seen[mm.group(1)] = o


def task_group(o: dict):
    return (o.get("metadata") or {}).get("group_id") or o.get("group_id")


def generate(t: Tab, timeout=150) -> list[dict]:
    """「音声を生成する」を1回押し、この1回ぶんのタスク（ふつう2本）が終わるまで待って返す"""
    t.events.clear()
    seen, groups = {}, {}
    t.click(GEN)
    t0 = time.time()
    while time.time() - t0 < timeout:
        time.sleep(1.5)
        collect_tasks(t, seen, groups)
        mine = [o for o in seen.values() if task_group(o) in groups]
        done = [o for o in mine if o.get("state") in ("finished", "failed") or o.get("generate_error")]
        # POST の本数ぶん（ふつう2本）返事が揃い、全部終わったら抜ける。片方しか来ないときは60秒待って諦める
        if mine and len(done) == len(mine) and (len(mine) >= 2 or time.time() - t0 > 60):
            for o in mine:
                o["_sent"] = groups.get(task_group(o))
            return sorted(mine, key=lambda o: o.get("created_at") or "")
        if not groups and time.time() - t0 > 20:
            busy = t.js("[...document.querySelectorAll('button')].some(b => /生成中/.test(b.innerText || ''))")
            if not busy:
                raise RuntimeError("押しても POST /task が出ていない（ログイン切れ・reCAPTCHA・上限の窓を疑う）")
    raise RuntimeError(f"{timeout}秒待っても終わらない: {[(k, o.get('state')) for k, o in seen.items()]}")


def fetch_audio(t: Tab, url: str) -> tuple[bytes, float | None, str | None]:
    r = t.js(f"""(async () => {{
      const res = await fetch({json.dumps(url)});
      const buf = await res.arrayBuffer();
      let dur = null;
      try {{ const ac = new OfflineAudioContext(1, 1, 44100); dur = (await ac.decodeAudioData(buf.slice(0))).duration; }} catch (e) {{}}
      const b = new Uint8Array(buf); let s = '';
      for (let i = 0; i < b.length; i += 32768) s += String.fromCharCode.apply(null, b.subarray(i, i + 32768));
      return {{status: res.status, type: res.headers.get('content-type'), dur, b64: btoa(s)}};
    }})()""", await_promise=True)
    if r["status"] != 200:
        raise RuntimeError(f"音声の取得が {r['status']}")
    return base64.b64decode(r["b64"]), r["dur"], r["type"]


def save_takes(t: Tab, tasks: list[dict], key: str, attempt: int, text: str, out: str, settings: dict, log: str) -> list[dict]:
    rows = []
    for i, o in enumerate(tasks, 1):
        row = {"key": key, "attempt": attempt, "take": i, "task_id": o.get("_id"), "group_id": task_group(o),
               "tts_text": text, "bytes": len(text.encode("utf-8")), "credit_count": o.get("credit_count"),
               "backend": o.get("backend"), "model_id": (o.get("model") or {}).get("_id"),
               "model_title": (o.get("model") or {}).get("title"), "format": (o.get("parameters") or {}).get("format"),
               "sent_text": (o.get("parameters") or {}).get("text"), "created_at": o.get("created_at"),
               "finished_at": o.get("finished_at"), "settings": settings, "sent": o.get("_sent"),
               "task_params": {k: v for k, v in (o.get("parameters") or {}).items() if k not in ("text", "references")}, "logged_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())}
        try:
            if o.get("state") != "finished" or not o.get("result"):
                raise RuntimeError(f"state={o.get('state')} error={str(o.get('generate_error'))[:200]}")
            data, dur, typ = fetch_audio(t, o["result"])
            ext = {"audio/mpeg": "mp3", "audio/wav": "wav", "audio/x-wav": "wav", "audio/ogg": "ogg"}.get(typ or "", row["format"] or "bin")
            rel = f"{key}_a{attempt}_t{i}.{ext}"
            path = os.path.join(out, rel)
            os.makedirs(os.path.dirname(path), exist_ok=True)
            open(path, "wb").write(data)
            row.update({"status": "ok", "file": rel, "size": len(data), "duration_s": round(dur, 3) if dur else None})
        except Exception as ex:
            row.update({"status": "error", "error": str(ex)[:300]})
        with open(log, "a", encoding="utf-8") as f:
            f.write(json.dumps(row, ensure_ascii=False) + "\n")
        rows.append(row)
    return rows


def read_log(log: str) -> list[dict]:
    return [json.loads(l) for l in open(log, encoding="utf-8") if l.strip()] if os.path.exists(log) else []


def spent(rows: list[dict]) -> tuple[int, float]:
    """使ったクレジットと、クレジットが付いたテイクの秒数（2本目は無料なので数えない）"""
    c = sum(r.get("credit_count") or 0 for r in rows)
    s = sum(r.get("duration_s") or 0 for r in rows if (r.get("credit_count") or 0) > 0)
    return c, s


# ---------------------------------------------------------------- 入口

def cmd_gen(a):
    lines = json.load(open(a.lines, encoding="utf-8"))
    only = set(a.only.split(",")) if a.only else None
    log = os.path.join(a.out, "attempts.jsonl")
    os.makedirs(a.out, exist_ok=True)
    t = fresh_tab()
    st = open_playground(t, a.model)
    print("state", json.dumps(st, ensure_ascii=False), flush=True)
    speed0 = st.get("speed")
    if a.speed:
        st["speed"] = str(set_speed(t, a.speed))
        st["speed_before"] = speed0
        print("speed", speed0, "->", st["speed"], flush=True)
    try:
        _gen_lines(a, t, st, lines, only, log)
    finally:
        if a.speed and speed0 is not None:
            # 作り直しでタブを替えていても、設定は下書き（サーバー）にあるので開き直して戻す
            t = fresh_tab()
            open_playground(t, a.model)
            print("speed restored", set_speed(t, float(speed0)), flush=True)


def _gen_lines(a, t: Tab, st: dict, lines: list[dict], only, log: str):
    for ln in lines:
        key, text = ln["key"], ln["tts_text"]
        if only is not None and key not in only:
            continue
        rows = read_log(log)
        mine = [r for r in rows if r["key"] == key]
        # 数えるのは本当に作った回（タスクがある回）だけ。押しても要求が出なかった失敗は、クレジットを使っていない
        attempts = len({r["group_id"] for r in mine if r.get("task_id")})
        if only is None and any(r["status"] == "ok" for r in mine):
            continue    # 済んだものは飛ばす（止まっても同じ指示で続きから）
        if attempts >= a.attempt_limit:
            print(f"{key} skip: {attempts} 回作った（--attempt-limit {a.attempt_limit}）", flush=True)
            continue
        c, s = spent(rows)
        n = len(text.encode("utf-8"))
        if a.budget_credits and c + n > a.budget_credits:
            print(f"STOP budget: 使った {c} + この文 {n} > {a.budget_credits} クレジット", flush=True)
            break
        for tries in range(2):   # 要求が出なかったときだけ、タブを作り直してもう1回押す
            try:
                set_text(t, text)
                tasks = generate(t)
                got = save_takes(t, tasks, key, attempts + 1, text, a.out, st, log)
                if any(g.get("model_id") and g["model_id"] != a.model for g in got):
                    raise SystemExit(f"声が違う: {[g.get('model_id') for g in got]}（--model {a.model}）")
                print(key, "attempt", attempts + 1, [(g["take"], g["status"], g.get("duration_s"), g.get("credit_count")) for g in got], flush=True)
                break
            except SystemExit:
                raise
            except Exception as ex:
                shot = os.path.join(a.out, f"err_{key.replace('/', '_')}_{int(time.time())}.jpg")
                seen = None
                try:
                    t.shot(shot)
                    # 何が邪魔をしたか（窓・通知の字）を残す
                    seen = t.js(r"""[...document.querySelectorAll('[role=dialog],[role=alertdialog],[role=alert],[data-sonner-toast],[role=status]')]
                        .map(e => (e.innerText || '').trim().replace(/\s+/g, ' ').slice(0, 200)).filter(s => s)""")
                except Exception:
                    shot = None
                print(key, "ERROR", str(ex)[:300], "seen", seen, flush=True)
                with open(log, "a", encoding="utf-8") as f:
                    f.write(json.dumps({"key": key, "attempt": attempts + 1, "take": 0, "group_id": f"error-{time.time()}",
                                        "tts_text": text, "status": "error", "error": str(ex)[:300], "seen": seen,
                                        "shot": shot}, ensure_ascii=False) + "\n")
                t = fresh_tab()
                open_playground(t, a.model)
    c, s = spent(read_log(log))
    print(f"TOTAL credits={c} charged_seconds={s:.1f}", flush=True)


def cmd_adopt(a):
    """画面で作ったもの（同じ字の、いちばん新しい1回ぶん）を、履歴の返事から拾って記録に足す"""
    log = os.path.join(a.out, "attempts.jsonl")
    t = fresh_tab()
    st = open_playground(t, a.model)
    t.events.clear()
    t.click("[...document.querySelectorAll('button,[role=tab]')].find(b => (b.innerText || '').trim() === '履歴')")
    time.sleep(2)
    t.js(r"""(() => { const sel = [...document.querySelectorAll('button,[role=combobox]')].find(b => /過去\d+日間/.test(b.innerText || ''));
      const r = sel.getBoundingClientRect(); const b = document.elementFromPoint(r.right + 36, r.top + r.height / 2).closest('button'); b && b.click(); })()""")
    time.sleep(4)
    drain(t)
    items = []
    for e in t.events:
        p = e.get("params", {})
        if e.get("method") == "Network.responseReceived" and p["response"]["url"].split("?")[0] == "https://api.fish.audio/task":
            b = body_of(t, p["requestId"])
            if b:
                items += json.loads(b).get("items") or []
    items = list({o["_id"]: o for o in items}.values())   # 開いたときと ↻ の2回ぶん、同じものが載る
    mine = [o for o in items if (o.get("parameters") or {}).get("text") == a.text and (o.get("model") or {}).get("_id") == a.model]
    if not mine:
        raise SystemExit("履歴に同じ字のものが無い")
    g = sorted(mine, key=lambda o: o.get("created_at") or "")[-1]
    grp = [o for o in mine if task_group(o) == task_group(g)]
    attempts = len({r["group_id"] for r in read_log(log) if r["key"] == a.key and r.get("task_id")})
    got = save_takes(t, sorted(grp, key=lambda o: o.get("created_at") or ""), a.key, attempts + 1, a.text, a.out, st, log)
    print(a.key, [(r["take"], r["status"], r.get("duration_s"), r.get("credit_count")) for r in got])


def cmd_speed(a):
    """速度のスライダーだけを合わせる（`gen --speed` が途中で切れて、元の値に戻らなかったときの戻し用）"""
    t = fresh_tab()
    open_playground(t, a.model)
    print("speed", set_speed(t, a.value))


def cmd_state(a):
    t = fresh_tab()
    st = open_playground(t, a.model)
    print(json.dumps(st, ensure_ascii=False, indent=1))


def cmd_backup(a):
    """作る前に、あやとの下書き（入力欄の字と話者）を写す。

    `?modelId=` を付けて開くと話者が替わってしまうので、付けずに開き、画面が読む
    `GET /tts-draft` の返事をそのまま書く。中に利用者の ID などが入るので、置き場は
    権限 700 のフォルダにして、表には話者の名前と字数だけ出す。戻し終えたら消す"""
    os.makedirs(a.dir, exist_ok=True)
    os.chmod(a.dir, 0o700)
    t = fresh_tab()
    t.call("Network.enable", maxPostDataSize=65536)
    t.events.clear()
    t.go("https://fish.audio/ja/app/text-to-speech/", wait=8)
    bal = balance(t)
    body = None
    for e in t.events:
        p = e.get("params", {})
        if e.get("method") == "Network.responseReceived" and p["response"]["url"].split("?")[0] == "https://api.fish.audio/tts-draft":
            body = body_of(t, p["requestId"]) or body
    if not body:
        raise SystemExit("下書き（GET /tts-draft）の返事が拾えない")
    path = os.path.join(a.dir, f"draft_backup_{int(time.time())}.json")
    open(path, "w", encoding="utf-8").write(body)
    os.chmod(path, 0o600)
    seg = (json.loads(body).get("segments") or [{}])[0]
    print(json.dumps({"backup": path, "speaker": seg.get("speaker_title"), "text_chars": len(seg.get("text") or ""),
                      "credits_balance": bal}, ensure_ascii=False))


def cmd_restore(a):
    """入力欄を、写しておいた下書き（GET /tts-draft の返事）に戻す。

    再生ページは `?modelId=<声>` で開くと、字はそのままで話者（声）だけがその声に替わる。
    なので下書きの話者の ID で開いてから字を入れ直すと、声と字の両方が元に戻る"""
    d = json.load(open(a.backup, encoding="utf-8"))
    seg = (d.get("segments") or [{}])[0]
    text = seg.get("text") or ""
    t = fresh_tab()
    open_playground(t, seg.get("speaker_model_id") or a.model)
    got = set_text_lines(t, text.split("\n"))
    print("restored" if got.strip() == text.strip() else "DIFF", json.dumps(got, ensure_ascii=False),
          "speaker", seg.get("speaker_title"))


def main():
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd", required=True)
    g = sub.add_parser("gen")
    g.add_argument("--model", required=True)
    g.add_argument("--lines", required=True, help='[{"key": "A/01", "tts_text": "..."}]')
    g.add_argument("--out", required=True)
    g.add_argument("--only", default="")
    g.add_argument("--budget-credits", type=int, default=0, help="この出力先で使ってよいクレジットの合計（0 は無制限）")
    g.add_argument("--attempt-limit", type=int, default=2)
    g.add_argument("--speed", type=float, default=0,
                   help="画面の速度（0.7〜1.3）をこの値にして作り、終わったら元に戻す（0 は触らない）")
    d = sub.add_parser("adopt")
    d.add_argument("--model", required=True)
    d.add_argument("--key", required=True)
    d.add_argument("--text", required=True)
    d.add_argument("--out", required=True)
    v = sub.add_parser("speed")
    v.add_argument("--model", required=True)
    v.add_argument("--value", type=float, required=True, help="速度（0.7〜1.3）。あやとの設定は 1.1")
    s = sub.add_parser("state")
    s.add_argument("--model", required=True)
    k = sub.add_parser("backup")
    k.add_argument("--dir", default=f"{EC2_HOME}/voice/private")
    r = sub.add_parser("restore")
    r.add_argument("--model", default="", help="写しに話者が無いときだけ使う")
    r.add_argument("--backup", required=True)
    a = ap.parse_args()
    hold_lane(a.cmd + (f" {os.path.basename(a.out.rstrip('/'))}" if getattr(a, "out", None) else ""))
    {"gen": cmd_gen, "adopt": cmd_adopt, "speed": cmd_speed, "state": cmd_state, "backup": cmd_backup,
     "restore": cmd_restore}[a.cmd](a)


if __name__ == "__main__":
    main()
