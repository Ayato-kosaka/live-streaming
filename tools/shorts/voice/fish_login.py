#!/usr/bin/env python3
"""EC2 の上で動く。fish の Chrome（~/cdp-fish）を、fish.audio の「Googleで続行」から入り直す。

    python3 ~/cdp/fish_login.py      # ec2.py put で ~/cdp/ に置き、列 fish の札を取って回す

- あやとの決め（2026-10-28 #1044）: kosaka.ayato@gmail.com で入る。パスワードが要らない所はこちらで押す。
  パスワード欄・dp 以外の本人確認で止まるのは `google_login.py` の決まりのまま。スマホの数字は
  /tmp/fish_challenge.txt に書くので、別の SSM コマンドで読んであやとに伝える
- **`up("fish", reseed=True)` で複製し直さない。** ~/cdp-fish には TikTok の下書き（IndexedDB 約564MB）が
  あり、複製し直すと消える。ログインだけをこの Chrome の中で取り直す
- 入れたかは「Google の窓が残っていない・fish.audio を開き直して『ログイン』が無い」で見る。
  「ログイン」が無いだけで見ると、Google の選択の窓が開く前に入れたと読んでしまう（2026-10-28 に1回踏んだ）
"""
import sys, time, json
# EC2 の ubuntu のホーム。SSM のコマンドは root で走るので `~` に頼らず、ここから組む（fish_web.py と同じ）
EC2_HOME = "/home/ubuntu"
sys.path.insert(0, f"{EC2_HOME}/cdp")
from cdp import up, where, pages, Tab, _port
from google_login import run, _click

LOGIN_BTN = """(() => { const b = [...document.querySelectorAll('button')].find(b => b.getBoundingClientRect().width > 0 && (b.innerText||'').trim() === %s); if (!b) return null; const q = b.getBoundingClientRect(); return {x: q.x + q.width/2, y: q.y + q.height/2}; })()"""
HAS_LOGIN = """[...document.querySelectorAll('a,button')].some(b => b.getBoundingClientRect().width > 0 && /^(ログイン|Log in|Sign in)$/.test((b.innerText||'').trim()))"""

def fish_tab():
    ps = [p for p in pages("fish") if "fish.audio" in p["url"]]
    return Tab(_port("fish"), ps[0], strict=False) if ps else None

def start(t):
    # Google の窓がもう開いていれば、そこから進める（押し直さない）
    if any("accounts.google.com" in p["url"] for p in pages("fish")):
        print("start: Google の窓が開いている", flush=True)
        return
    f = fish_tab() or t
    f.go("https://fish.audio/ja/", wait=8)
    for label in ("ログイン", "Googleで続行"):
        r = f.js(LOGIN_BTN % json.dumps(label))
        print("start: press", label, bool(r), flush=True)
        if r:
            _click(f, r["x"], r["y"])
        time.sleep(6)

def done(t):
    # Google の窓が残っているうちは入れていない。fish.audio を読み直して「ログイン」が無ければ入れた
    if any("accounts.google.com" in p["url"] for p in pages("fish")):
        return False
    f = fish_tab()
    if not f:
        return False
    f.go("https://fish.audio/ja/app/", wait=8)
    return "fish.audio" in (f.js("location.href") or "") and not f.js(HAS_LOGIN)

up("fish")
print("RESULT", run("fish", start, done, "/tmp/fish_challenge.txt"), flush=True)
