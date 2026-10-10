#!/usr/bin/env python3
"""EC2 の上で動く。「Google でログイン」の画面を押して進める共通の道具。

Doneru（`doneru-cookie/remote_refresh.sh`）で組んだ手順を、SUZURI でも使えるように
取り出したもの。サイトごとに違うのは「どこから始めるか」と「入れたかの見分け方」だけ。

    import sys; sys.path.insert(0, "/home/ubuntu/cdp")
    from google_login import run
    ok = run("suzuri", start=lambda t: ..., done=lambda t: ..., challenge_file="/tmp/suzuri_challenge.txt")

## 決めごと（Doneru で踏んだもの）

- **パスワードは打たない。** パスワード欄が出たら止まる
- `/challenge/dp`（スマホに「はい」＋数字の照合）だけは待つ。画面の数字を
  `challenge_file` に書くので、手元から別の SSM コマンドで読んで、あやとに伝える
- それ以外の本人確認（SMS・認証アプリ…）は止まる。開いた時点であやとのスマホが鳴る
- アカウントは位置で選ばない。メールを小文字にした SHA-256 で当てる（公開リポジトリなのでメールは置かない）
- 規約・ポリシーのリンクは押さない（「Googleプライバシーポリシー」を15回押した回がある）
- 押すのは JS の .click() ではなく座標のクリック（GSI の iframe の中のボタンにも届く）
"""
import hashlib, os, sys, time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from cdp import Tab, _port, pages, where  # noqa: E402

# kosaka.ayato@gmail.com（Doneru も SUZURI も同じアカウント。あやと 2026-10-10）
AYATO_SHA256 = "fc610098750871be3c2dbc1490ffff5de0e60d720b520366f993698fa8bb4adc"

FIND = r"""(() => {
  const vis = e => { if (!e) return false; const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && e.offsetParent !== null; };
  const at = (e, kind) => { e.scrollIntoView({block: 'center'}); const r = e.getBoundingClientRect(); return {kind, x: r.x + r.width / 2, y: r.y + r.height / 2}; };
  if ([...document.querySelectorAll('input[type=password]')].some(vis)) return {kind: 'PASSWORD'};
  const txt = e => (e.innerText || e.value || e.getAttribute('aria-label') || e.getAttribute('alt') || '').trim().replace(/\s+/g, ' ');
  const NG = /ポリシー|規約|policy|terms|ヘルプ|help|プライバシー|privacy/i;
  const clickables = () => [...document.querySelectorAll('button,a,[role=button],[role=link],input[type=submit],[data-identifier]')].filter(vis).filter(e => !NG.test(txt(e)));
  const diag = 'clickables=[' + clickables().map(e => e.tagName.toLowerCase() + ':' + txt(e).slice(0, 25)).slice(0, 25).join(' | ').replace(/\S+@\S+/g, '<mail>') + ']';
  if (!location.host.includes('accounts.google.com')) return {kind: 'site', diag};
  const acct = [...document.querySelectorAll('[data-identifier]')].filter(vis);
  if (acct.length) return {kind: 'chooser', accounts: acct.map(e => { const r = e.getBoundingClientRect(); return {id: (e.getAttribute('data-identifier') || '').toLowerCase(), x: r.x + r.width / 2, y: r.y + r.height / 2}; })};
  const b = clickables().find(e => /^(続行|次へ|許可|同意する|Continue|Allow|Next|I agree)$/i.test(txt(e)));
  if (b) return at(b, 'button:' + txt(b));
  return {kind: 'none', diag};
})()"""

# challenge/dp の画面に出る、スマホで選ぶ数字
NUMS = r"""[...document.querySelectorAll('body *')].filter(e => e.children.length === 0 && e.offsetParent !== null && /^\d{1,3}$/.test((e.innerText || '').trim())).map(e => e.innerText.trim())"""


def _click(t, x, y):
    for typ in ("mouseMoved", "mousePressed", "mouseReleased"):
        t.call("Input.dispatchMouseEvent", type=typ, x=x, y=y, button="left", clickCount=1)


def _front(name):
    """Google の画面が別窓で開くことがある。accounts.google.com の窓があればそちら"""
    ps = pages(name)
    g = [p for p in ps if "accounts.google.com" in p["url"]]
    return Tab(_port(name), (g or ps)[-1], strict=False)


def run(name, start, done, challenge_file, account_sha256=AYATO_SHA256, wait_dp=300, steps=25, on_site=None):
    """start(t) で「Google でログイン」を押すところまで進め、done(t) が True になるまで押し進める。

    on_site(t, url) は、Google から戻ったサイト側の画面（SUZURI のメールの確認コードなど）を
    サイトごとに片づける口。片づけたら True、止めるなら文字列（戻り値になる）を返す。

    戻り値: "ok" / "password" / "challenge"（dp 以外の本人確認）/ "dp-timeout" / "no-account" / "stuck"
    """
    t = _front(name)
    start(t)
    time.sleep(6)
    for step in range(steps):
        t = _front(name)
        if done(t):
            return "ok"
        url = t.js("location.href") or ""
        r = t.js(FIND) or {"kind": "none"}
        print(f"step {step}: {where(url)} -> {r['kind']}", flush=True)
        if r["kind"] == "PASSWORD":
            print("STOP: パスワードを求められた。何も打たずに止める（あやとの手が要る）")
            return "password"
        if "accounts.google.com" in url and "/challenge/dp" in url:
            nums = t.js(NUMS) or []
            with open(challenge_file, "w") as f:
                f.write(f"{int(time.time())} numbers={nums}\n")
            os.chmod(challenge_file, 0o644)
            print(f"  challenge/dp: 画面の数字 {nums}。{wait_dp}秒待つ", flush=True)
            t0 = time.time()
            while time.time() - t0 < wait_dp:
                time.sleep(5)
                if not [p for p in pages(name) if "/challenge/dp" in p["url"]]:
                    break
            with open(challenge_file, "a") as f:
                f.write("done\n")
            if [p for p in pages(name) if "/challenge/dp" in p["url"]]:
                print("STOP: 本人確認が通らなかった（窓が切れた）")
                return "dp-timeout"
            print(f"  challenge/dp: {int(time.time() - t0)}秒で通った", flush=True)
            time.sleep(4)
            continue
        if "accounts.google.com" in url and "/challenge/" in url:
            print(f"STOP: dp 以外の本人確認（{where(url)}）。何も押さずに止める")
            return "challenge"
        if r["kind"] == "chooser":
            hit = [a for a in r["accounts"] if hashlib.sha256(a["id"].encode()).hexdigest() == account_sha256]
            print(f"  account chooser: {len(r['accounts'])} 件、一致 {len(hit)}", flush=True)
            if not hit:
                print("STOP: あやとのアカウントが選択肢に無い。何も押さずに止める")
                return "no-account"
            _click(t, hit[0]["x"], hit[0]["y"])
        elif "x" in r:
            _click(t, r["x"], r["y"])
        elif r["kind"] == "site" and on_site:
            h = on_site(t, url)
            if isinstance(h, str):
                return h
            if not h:
                print("  diag:", r.get("diag"), flush=True)
        elif r["kind"] in ("none", "site"):
            print("  diag:", r.get("diag"), flush=True)
        time.sleep(6)
    return "ok" if done(_front(name)) else "stuck"
