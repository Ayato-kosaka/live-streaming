#!/usr/bin/env python3
"""EC2 の上で動く。SUZURI に「Google でログイン」で入り直す（Doneru と同じアカウント）。

    python3 /home/ubuntu/cdp/login.py          # 入っていなければ押してログインする
    python3 /home/ubuntu/cdp/login.py check    # 入っているかだけ見る（押さない。あやとのスマホを鳴らさない）

手元からは `login_ec2.sh` で回す（数字やコードを待つあいだに手元から読み書きするため、EC2 では切り離して走らせる）。

## 道すじ（2026-10-10 の実測）

1. `suzuri.jp/login` の Google のボタン（`a[href="/auth/google"]`。ログイン欄と新規登録欄に2つある）
2. Google のアカウント選択（3件並ぶ。メールの SHA-256 で当てる）。この日は Google のスマホ確認は出なかった
3. **SUZURI の `show_confirmation_code`**: SUZURI が**あやとのメールに確認コード**を送り、
   `authentication_code` の欄に打って「Authenticate」を押す。コードはあやとにしか見えないので、
   画面に来たら `/tmp/suzuri_challenge.txt` に `code-needed` と書き、手元が
   `/tmp/suzuri_code.txt` にコードを置くまで待つ（`login_ec2.sh code <6桁>`）
4. `suzuri.jp/account/materials` に戻る

**パスワードは打たない。** 打つのは、あやとがその場で教えてくれた確認コードだけ。
"""
import os, re, sys, time

sys.path.insert(0, "/home/ubuntu/cdp")
from cdp import Tab, _port, pages, up, where  # noqa: E402
from google_login import run  # noqa: E402

SHOP = "ayato_arigato"
CHALLENGE = "/tmp/suzuri_challenge.txt"
CODE = "/tmp/suzuri_code.txt"
WAIT_CODE = 600

# SUZURI のページの中から、デザインの一覧が自分の店として読めるかを見る。
# 「Log Out」のボタンは入っていなくても DOM に残っている画面があるので、それでは決めない
SIGNED_IN = r"""(async () => {
  if (!location.host.endsWith('suzuri.jp')) return false;
  const r = await fetch('/account/materials', {credentials: 'include'});
  if (r.url.includes('/login') || !r.ok) return false;
  return (await r.text()).includes('%s');
})()""" % SHOP


def signed_in(t):
    try:
        return bool(t.call("Runtime.evaluate", expression=SIGNED_IN, awaitPromise=True, returnByValue=True)
                    .get("result", {}).get("value"))
    except Exception:
        return False


def start(t):
    t.call("Page.navigate", url="https://suzuri.jp/login")
    time.sleep(6)
    # ログイン画面には「Google」のボタンが2つ（ログイン欄と新規登録欄）。上のログイン欄を押す
    c = t.js("""(() => { const e = [...document.querySelectorAll('a[href="/auth/google"]')]
        .find(a => { const r = a.getBoundingClientRect(); return r.width > 0 && r.height > 0; });
        if (!e) return null; e.scrollIntoView({block: 'center'}); const r = e.getBoundingClientRect();
        return [r.x + r.width / 2, r.y + r.height / 2]; })()""")
    if not c:
        raise SystemExit("STOP: ログイン画面に Google のボタンが無い")
    print("press: suzuri.jp/login の Google", flush=True)
    for typ in ("mouseMoved", "mousePressed", "mouseReleased"):
        t.call("Input.dispatchMouseEvent", type=typ, x=c[0], y=c[1], button="left", clickCount=1)


def on_site(t, url):
    """SUZURI 側の画面。メールの確認コードだけを片づける"""
    if "show_confirmation_code" not in url:
        return False
    if not os.path.exists(CODE):
        with open(CHALLENGE, "w") as f:
            f.write(f"{int(time.time())} code-needed\n")
        os.chmod(CHALLENGE, 0o644)
        print(f"  confirmation code: あやとのメールに届いたコードを待つ（{WAIT_CODE}秒）", flush=True)
        t0 = time.time()
        while not os.path.exists(CODE) and time.time() - t0 < WAIT_CODE:
            time.sleep(3)
        if not os.path.exists(CODE):
            return "code-timeout"
    code = open(CODE).read().strip()
    os.remove(CODE)
    if not re.fullmatch(r"\d{4,8}", code):
        print("STOP: コードの形が違う（数字4〜8桁ではない）")
        return "bad-code"
    t.click("document.querySelector('input[name=authentication_code]')")
    t.js("document.querySelector('input[name=authentication_code]').value = ''")
    t.type(code)
    time.sleep(1)
    t.click("[...document.querySelectorAll('button')].find(b => /Authenticate|認証/.test(b.innerText))")
    with open(CHALLENGE, "a") as f:
        f.write("done\n")
    print("  confirmation code: 打って Authenticate を押した", flush=True)
    time.sleep(6)
    return True


if __name__ == "__main__":
    up("suzuri", "https://suzuri.jp/")
    t = Tab(_port("suzuri"), pages("suzuri")[0], strict=False)
    if "suzuri.jp" not in (t.js("location.href") or ""):
        t.call("Page.navigate", url="https://suzuri.jp/"); time.sleep(5)
    now = signed_in(t)
    print("signed in:", now, flush=True)
    if now or (sys.argv[1:] == ["check"]):
        sys.exit(0 if now else 4)
    for f in (CHALLENGE, CODE):
        if os.path.exists(f):
            os.remove(f)
    r = run("suzuri", start, signed_in, CHALLENGE, on_site=on_site)
    t = Tab(_port("suzuri"), pages("suzuri")[0], strict=False)
    print("result:", r, "| at:", where(t.js("location.href")), "| signed in:", signed_in(t), flush=True)
    sys.exit(0 if r == "ok" else 3)
