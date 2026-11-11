#!/usr/bin/env python3
"""EC2 の上で動く。fish の Chrome（~/cdp-fish）を、fish.audio の「Googleで続行」から入り直す。入っていれば何もしない。

    python3 /home/ubuntu/cdp/fish_login.py                  # 入っていなければ入り直す（列 fish の札は up() が pid で取る）
    python3 /home/ubuntu/cdp/fish_login.py --check          # 入っているかを見るだけ（何も押さない）
    python3 /home/ubuntu/cdp/fish_login.py --name fishtest  # 使い捨ての写し（~/cdp-fishtest）で試す

`ec2.py put` で `~/cdp/` に `cdp.py`・`google_login.py` と並べて置く。最後の行は `RESULT <結果>`:
`in`（もともと入っていた。何も押していない）/ `ok`（入り直せた）/ `out`（--check で入っていない）/
`password`・`challenge`・`dp-timeout`・`no-account`（あやとの手が要る。`google_login.py`）/ `stuck` / `unknown`。
終了コードは 0＝入っている・1＝入っていない（入れなかった）・2＝入っているかを決められない。

- あやとの決め（2026-10-28 #1044）: kosaka.ayato@gmail.com で入る。パスワードが要らない所はこちらで押す。
  パスワード欄・dp 以外の本人確認で止まるのは `google_login.py` の決まりのまま。スマホの数字は
  /tmp/fish_challenge.txt に書くので、別の SSM コマンドで読んであやとに伝える（待つ秒は `--wait-dp`）
- **`up("fish", reseed=True)` で複製し直さない。** ~/cdp-fish には TikTok の下書き（IndexedDB 約564MB）が
  あり、複製し直すと消える。ログインだけをこの Chrome の中で取り直す
- **Google の窓が開いているあいだは判定しない**（fish.audio を開き直さない）。2026-10-28 に、Google の選択の窓が
  開く前に「入れた」と読んだことがある

## 入っているかは、画面の字ではなく、画面自身が送る要求の返事で決める（2026-11-11 から）

`/ja/app/` を開くと、入っている画面は `api.fish.audio` に `authorization` の見出し付きの要求を20本ほど送り
（`GET /user/self`・`/team`・`/wallet/<team>/package` …）、どれも 200 が返る。入っていない画面は見出しの無い要求
（`/pricing/plans`・`/tutorials/`）しか送らない。だから CDP の Network でそれを数えて決める（`judge`）:

1. `GET /user/self` の返事があれば、それで決める（2xx なら入っている。401/403 は切れた札）
2. 無ければ、見出し付きの要求に 2xx があって 401 が無ければ入っている
3. `api.fish.audio` の返事が1本も無い（読み込めていない）ときだけ、ログインした人にしか出ないリンク
   （行き先が `/app/team/`・`/app/my-voices/` など。字は見ない）を見る。それも無ければ「決められない」で止まる

見るのは見出しが**在るか**と状態コードと道だけで、cookie・`authorization`・localStorage の**値は読まない**。
押す相手（右上の入口・「Googleで続行」）は画面の要素から探すが、入っているかの判定にはその字を使わない。

## 2026-11-11 に止まった理由

- 入口が変わっていた。`https://fish.audio/ja/` に「ログイン」が無く、入口は `/ja/app/` の右上のボタン。
  押すと窓（`role=dialog`）が開き、「メールアドレスで続行」の下に Google・GitHub・Apple の丸いボタンが並ぶ
- 「Googleで続行」は**字の無いアイコンのボタン**になっていた。名前は `aria-label` にだけ残り、innerText は空。
  前の作りは innerText が「Googleで続行」と一致するボタンを探していたので、見つからずに止まった
- 入っているかを「ログイン」の字が無いことで見ていたので、字が変わるたびに判定ごと外れる作りだった

いまの探しかたは、窓の中で名前（aria-label・title・字・絵の alt）に Google を含むもの、無ければ Google の G の
ロゴの色（4色のうち3つ以上）を持つものを押す。窓の外のリンク（「Google Play」など）は押さない。
見張りは `fish_login_selftest.py`（偽の画面と偽の要求で回す。EC2 にも fish.audio にも触らない）。
"""
from __future__ import annotations

import argparse
import json
import re
import sys
import time

# EC2 の ubuntu のホーム。SSM のコマンドは root で走るので `~` に頼らず、ここから組む（fish_web.py と同じ）
EC2_HOME = "/home/ubuntu"
sys.path.insert(0, f"{EC2_HOME}/cdp")
from cdp import pages, tab, up, where  # noqa: E402

APP = "https://fish.audio/ja/app/"
API = "https://api.fish.audio/"
CHALLENGE = "/tmp/fish_challenge.txt"
NAME = "fish"

# 画面に出ている押せるもの（リンク・ボタン）を、決めるのに要る形だけ写し取る。決めるのは Python 側（下の find_*）。
# name は aria-label・title・字・絵の alt を並べたもの（アイコンだけのボタンは字が空で、名前は aria-label にしか無い）。
# fills は中の絵の塗りの色（Google の G のロゴを、名前が消えても見分けるため）
OUTLINE = r"""(() => {
  const vis = e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  const dialogs = [...document.querySelectorAll('[role=dialog],[role=alertdialog],dialog[open]')].filter(vis);
  return [...document.querySelectorAll('a[href],button,[role=button]')].filter(vis).map(e => {
    const r = e.getBoundingClientRect();
    const name = [e.getAttribute('aria-label'), e.getAttribute('title'), e.innerText,
                  ...[...e.querySelectorAll('img')].map(i => i.getAttribute('alt'))]
      .filter(Boolean).join(' ').replace(/\s+/g, ' ').trim().slice(0, 80);
    return {tag: e.tagName.toLowerCase(), id: e.id || e.getAttribute('data-testid') || '', href: e.getAttribute('href') || '', name,
            fills: [...new Set([...e.querySelectorAll('[fill]')].map(p => (p.getAttribute('fill') || '').toUpperCase()))],
            dialog: dialogs.some(d => d.contains(e)), x: r.x + r.width / 2, y: r.y + r.height / 2};
  });
})()"""

GOOGLE_FILLS = {"#4285F4", "#EA4335", "#FBBC05", "#34A853"}
# 窓の外で押してよい Google の名前（窓の外には「Google Play」などのリンクも並ぶので、ただの google では押さない）
GOOGLE_PAGE_RE = re.compile(r"google\s*で|with google|google\s*(ログイン|login|sign)", re.I)
ENTRY_RE = re.compile(r"^(ログイン|サインイン|ログイン\s*/\s*新規登録|log\s?in|sign\s?in)$", re.I)
# ログインした人にしか出ない行き先（2026-11-11 に入っている画面と入っていない画面のリンクを突き合わせた）
ACCOUNT_RE = re.compile(r"/app/(team|my-voices|generation-history|assets|billing)(/|\?|$)")


def _logo(e) -> bool:
    return len(GOOGLE_FILLS & {f.upper() for f in e.get("fills") or []}) >= 3


def find_google(outline: list) -> dict | None:
    """「Googleで続行」。窓の中を先に、名前に Google → G のロゴの色の順。窓の外は名前が Google のログインのものだけ"""
    inside = [e for e in outline if e.get("dialog")]
    hit = next((e for e in inside if re.search(r"google", e.get("name") or "", re.I)), None) \
        or next((e for e in inside if _logo(e)), None)
    if hit or inside:
        return hit
    return next((e for e in outline if GOOGLE_PAGE_RE.search(e.get("name") or "")), None) \
        or next((e for e in outline if e.get("tag") != "a" and _logo(e)), None)


def find_entry(outline: list) -> dict | None:
    """右上の入口（押すと Google のボタンが並ぶ窓が開く）。窓が開いていれば要らない"""
    return next((e for e in outline if not e.get("dialog") and ENTRY_RE.match(e.get("name") or "")), None)


def account_links(outline: list) -> int:
    return sum(1 for e in outline if ACCOUNT_RE.search(e.get("href") or ""))


def api_facts(events: list) -> dict:
    """CDP の Network の出来事から、api.fish.audio への要求を数える。見るのは見出しの有無・状態コード・道だけ（値は読まない）"""
    reqs: dict = {}
    for e in events:
        p = e.get("params") or {}
        if e.get("method") == "Network.requestWillBeSent":
            r = p.get("request") or {}
            if (r.get("url") or "").startswith(API) and r.get("method") != "OPTIONS":
                reqs[p.get("requestId")] = {"path": where(r["url"]), "status": None, "method": r.get("method"),
                                            "auth": any(k.lower() == "authorization" for k in (r.get("headers") or {}))}
        elif e.get("method") == "Network.responseReceived" and p.get("requestId") in reqs:
            reqs[p["requestId"]]["status"] = (p.get("response") or {}).get("status")
    got = [r for r in reqs.values() if r["status"] is not None]
    me = [r for r in got if r["method"] == "GET" and r["path"] == "api.fish.audio/user/self"]
    return {"api": len(got),
            "authed_ok": sum(1 for r in got if r["auth"] and 200 <= r["status"] < 300),
            "authed_401": sum(1 for r in got if r["auth"] and r["status"] == 401),
            "self": me[-1]["status"] if me else None}


def judge(f: dict) -> str:
    """'in' / 'out' / 'unknown'。画面自身が api.fish.audio を叩いた返事で決める（頭の「入っているかは…」）"""
    if f.get("api"):
        if f.get("self") is not None:
            return "in" if 200 <= f["self"] < 300 else "out"
        return "in" if f.get("authed_ok") and not f.get("authed_401") else "out"
    # 返事が1本も無い（画面が読み込めていない）ときだけ、ログインした人にしか出ないリンクを見る
    return "in" if f.get("account_links") else "unknown"


def summary(f: dict) -> str:
    return (f"api={f.get('api')} authed_ok={f.get('authed_ok')} authed_401={f.get('authed_401')} "
            f"user/self={f.get('self')} account_links={f.get('account_links')}")


# ---------------------------------------------------------------- ここから下は EC2 の上（本物の Chrome）

TAB = None
RETRIES = [1]


def _gl():
    """google_login は入り直すときだけ要る。fish_web.py は判定（judge ほか）だけを借りるので、読み込んだだけでは呼ばない"""
    import google_login
    return google_login


def drain(t, secs=2.0):
    t.ws.settimeout(secs)
    try:
        while True:
            m = json.loads(t.ws.recv())
            if "method" in m:
                t.events.append(m)
    except Exception:
        pass
    t.ws.settimeout(60)


def probe(t, wait=10) -> dict:
    """/ja/app/ を開き直し、画面自身が送った要求の返事と、画面のリンクを数える"""
    t.call("Network.enable")
    t.events.clear()
    t.go(APP, wait=wait)
    drain(t)
    f = api_facts(t.events)
    t.events.clear()
    f["account_links"] = account_links(t.js(OUTLINE) or [])
    return f


def google_open() -> bool:
    return any("accounts.google.com" in p["url"] for p in pages(NAME))


def settle(t, limit=30):
    """Google から戻った直後（コールバックの途中）は開き直さない。道が3秒変わらなくなるまで待つ"""
    last, same = None, 0
    for _ in range(limit):
        u = where(t.js("location.href") or "")
        same = same + 1 if u == last else 0
        last = u
        if same >= 3 and not re.search(r"callback|oauth|/auth", u):
            return
        time.sleep(1)


def diag(outline):
    names = [(e["tag"] + ":" + (e["name"] or e["href"])[:25]) for e in outline][:30]
    return re.sub(r"\S+@\S+", "<mail>", " | ".join(names))


def start(_t=None):
    # Google の窓がもう開いていれば、そこから進める（押し直さない）
    if google_open():
        print("start: Google の窓が開いている", flush=True)
        return
    t = TAB
    if "fish.audio/ja/app" not in where(t.js("location.href") or ""):
        t.go(APP, wait=8)
    g = find_google(t.js(OUTLINE) or [])
    if not g:
        e = find_entry(t.js(OUTLINE) or [])
        print("start: 入口", "あり" if e else "無し", flush=True)
        if not e:
            print("  diag:", diag(t.js(OUTLINE) or []), flush=True)
            return
        _gl()._click(t, e["x"], e["y"])
        time.sleep(3)
        g = find_google(t.js(OUTLINE) or [])
    print("start: Googleで続行", f"あり（{g['name'] or 'ロゴ'}）" if g else "無し", flush=True)
    if not g:
        print("  diag:", diag(t.js(OUTLINE) or []), flush=True)
        return
    _gl()._click(t, g["x"], g["y"])


def on_site(_t, url):
    """Google の窓が無いのに入れていない（窓が開かなかった・閉じられた）。1回だけ押し直す"""
    if RETRIES[0] <= 0:
        return None
    RETRIES[0] -= 1
    print("  押し直す（Google の窓が無い）", flush=True)
    start()
    return True


def done(_t=None) -> bool:
    # Google の窓が残っているうちは開き直さない（窓の中で選んでいる途中）
    if google_open():
        return False
    time.sleep(3)
    settle(TAB)
    f = probe(TAB)
    st = judge(f)
    print(f"  done? {summary(f)} -> {st}", flush=True)
    return st == "in"


def main(argv=None) -> int:
    global NAME, TAB
    ap = argparse.ArgumentParser()
    ap.add_argument("--name", default="fish", help="Chrome の束（~/cdp-<名前>）。試すときは使い捨ての写しの名前")
    ap.add_argument("--check", action="store_true", help="入っているかを見るだけ（何も押さない）")
    ap.add_argument("--wait-dp", type=int, default=300, help="スマホの確認（数字）を待つ秒")
    a = ap.parse_args(argv)
    NAME = a.name
    up(NAME)
    TAB = tab(NAME, new=True)
    f = probe(TAB)
    st = judge(f)
    if st == "unknown":
        f = probe(TAB, wait=15)
        st = judge(f)
    print(f"probe: {summary(f)} -> {st}", flush=True)
    if st == "unknown":
        print("  diag:", diag(TAB.js(OUTLINE) or []), flush=True)
        print("RESULT unknown", flush=True)
        return 2
    if st == "in":
        print("入っている。何もしない", flush=True)
        TAB.call("Page.close")
        print("RESULT in", flush=True)
        return 0
    if a.check:
        print("RESULT out", flush=True)
        return 1
    r = _gl().run(NAME, start, done, CHALLENGE, wait_dp=a.wait_dp, steps=15, on_site=on_site)
    print("RESULT", r, flush=True)
    if r == "ok":
        TAB.call("Page.close")
    return 0 if r == "ok" else 1


if __name__ == "__main__":
    sys.exit(main())
