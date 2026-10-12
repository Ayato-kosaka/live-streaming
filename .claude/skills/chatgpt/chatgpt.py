#!/usr/bin/env python3
"""EC2 の上で動く。ChatGPT（chatgpt.com）を、ログイン済みの Chrome（~/cdp-chatgpt）から触る道具。

`ec2-chrome` の cdp.py の上に乗る。手元から `ec2.py put` で `/home/ubuntu/cdp/chatgpt.py` に置き、

    import sys; sys.path.insert(0, "/home/ubuntu/cdp")
    from chatgpt import *
    t = fresh()                  # ChatGPT のタブを1枚だけ残して返す
"""
import json, sys, time, urllib.request
sys.path.insert(0, "/home/ubuntu/cdp")
from cdp import Tab, up, pages, where, _port

NAME = "chatgpt"
BASE = "https://chatgpt.com"


def _browser(port):
    import websocket
    v = json.load(urllib.request.urlopen(f"http://localhost:{port}/json/version"))
    return websocket.create_connection(v["webSocketDebuggerUrl"], timeout=15, suppress_origin=True)


def _bcall(b, method, **params):
    b.send(json.dumps({"id": 1, "method": method, "params": params}))
    while True:
        m = json.loads(b.recv())
        if m.get("id") == 1:
            return m.get("result", {})


def fresh(url=BASE + "/", wait=6):
    """新しいタブを1枚作り、ほかのタブは全部閉じて、そのタブを返す"""
    port = up(NAME)
    b = _browser(port)
    old = pages(NAME)
    tid = _bcall(b, "Target.createTarget", url="about:blank")["targetId"]
    for p in old:
        _bcall(b, "Target.closeTarget", targetId=p["id"])
    b.close()
    time.sleep(1)
    p = next(p for p in pages(NAME) if p["id"] == tid)
    t = Tab(port, p, timeout=120)
    t.go(url, wait=wait)
    return t


# 会話は <ol aria-label="Conversation"> の <li data-message-role="user|assistant">。
# 書き終わった返事の li には data-message-complete が付く。
# 2026-10 の画面は class が stylex の乱数（x1gnnqk1 …）なので、class では探さない
TURNS = "ol[aria-label=Conversation] > li[data-message-role], li[data-message-role]"


# 返事を Markdown に戻す。innerText だとコードブロックの囲い（```）が落ち、
# 言語名の札（「python」）が本文の1行に混ざる（2026-10-12 に見た）
_MD = r"""
const md = (n, depth = 0) => {
  if (n.nodeType === 3) return n.nodeValue;
  if (n.nodeType !== 1) return '';
  const tag = n.tagName, kids = () => [...n.childNodes].map(c => md(c, depth)).join('');
  if (n.hasAttribute('data-md-skip') || tag === 'BUTTON' || tag === 'svg') return '';
  if (tag === 'PRE') {
    const code = (n.querySelector('code') || n).innerText.replace(/\n$/, '');
    let lang = '', box = n.parentElement;
    for (let k = 0; k < 4 && box && !lang; k++, box = box.parentElement) {
      const lab = [...box.querySelectorAll('*')].find(e => !n.contains(e) && !e.contains(n) && e.childElementCount === 0
        && /^[A-Za-z0-9+#._-]{1,20}$/.test(e.innerText.trim()));
      if (lab) { lang = lab.innerText.trim(); lab.setAttribute('data-md-skip', ''); }
    }
    return '\n```' + lang + '\n' + code + '\n```\n\n';
  }
  if (/^H[1-6]$/.test(tag)) return '#'.repeat(+tag[1]) + ' ' + n.innerText.trim() + '\n\n';
  if (tag === 'P') return kids().trim() + '\n\n';
  if (tag === 'BR') return '\n';
  if (tag === 'STRONG' || tag === 'B') return '**' + kids() + '**';
  if (tag === 'EM' || tag === 'I') return '*' + kids() + '*';
  if (tag === 'CODE') return '`' + n.innerText + '`';
  if (tag === 'A') return '[' + kids() + '](' + n.getAttribute('href') + ')';
  if (tag === 'UL' || tag === 'OL') return [...n.children].map((li, i) =>
      '  '.repeat(depth) + (tag === 'OL' ? (i + 1) + '. ' : '- ') +
      [...li.childNodes].map(c => md(c, depth + 1)).join('').trim().replace(/\n\n+/g, '\n')).join('\n') + '\n\n';
  if (tag === 'TABLE') return [...n.querySelectorAll('tr')].map((tr, i) => {
      const row = '| ' + [...tr.children].map(c => c.innerText.trim()).join(' | ') + ' |';
      return i === 0 ? row + '\n|' + ' --- |'.repeat(tr.children.length) : row;
    }).join('\n') + '\n\n';
  if (tag === 'HR') return '---\n\n';
  if (tag === 'IMG') return '';
  return kids();
};
"""


def turns(t):
    """会話を [(role, 本文, 書き終わったか)] で返す"""
    # 何度も呼ぶので、const md が二重に宣言されないよう関数で包む
    return t.js("(() => {" + _MD + f"""return [...document.querySelectorAll({json.dumps(TURNS)})].map(li => {{
        // 返事は本文の section だけを読む。問いは「You said:」の見出しを外して読む
        const body = li.querySelector('section[aria-label="DIL content"]');
        let text = body ? md(body).replace(/\\n{3,}/g, '\\n\\n') : li.innerText;
        const h = li.querySelector('[data-message-attribution]');
        if (!body && h) text = text.replace(h.innerText, '');
        return [li.dataset.messageRole, text.trim(), li.hasAttribute('data-message-complete')];
    }}); }})()""") or []


def busy(t):
    """返事を書いている途中か（送るボタンが「Stop generating」に変わっている）"""
    return bool(t.js("!!document.querySelector('button[aria-label=\"Stop generating\"]')"))


def send(t, text):
    """入力欄に字を入れて送る。改行は Input.insertText がそのまま入れる"""
    t.click("document.querySelector('textarea[name=prompt]')")
    t.type(text)
    time.sleep(0.6)
    t.click("document.querySelector('button[aria-label=\"Send message\"]')")


def wait_reply(t, n_before, timeout=180, poll=1.5):
    """n_before 本より後ろに、書き終わった返事が来るまで待って本文を返す"""
    end = time.time() + timeout
    while time.time() < end:
        time.sleep(poll)
        ts = turns(t)
        new = [x for x in ts[n_before:] if x[0] == "assistant"]
        if new and new[-1][2] and not busy(t):
            return new[-1][1]
    raise TimeoutError(f"{timeout}秒待っても返事が書き終わらない: {where(t.url())}")


def ask(t, text, timeout=180):
    """1往復。返事の本文を返す。同じタブで続けて呼べば、同じ会話の続きになる"""
    n = len(turns(t))
    send(t, text)
    return wait_reply(t, n, timeout)


def logged_in(t):
    """ログインしているか。未ログインの画面は右上と左下に「Log in」のボタンを出す"""
    return not t.js("[...document.querySelectorAll('button')].some(b => b.innerText.trim() === 'Log in')")


if __name__ == "__main__":
    # python3 chatgpt.py ask <問いを書いたファイル>   … 新しい会話で1往復して、返事を標準出力へ
    # 問いはファイルで渡す（SSM のコマンドに日本語や引用符を直に入れると崩れる）
    if len(sys.argv) >= 3 and sys.argv[1] == "ask":
        t = fresh()
        print(ask(t, open(sys.argv[2], encoding="utf-8").read().strip(), timeout=int(sys.argv[3]) if len(sys.argv) > 3 else 180))
    else:
        print("usage: chatgpt.py ask <file> [timeout]")
