#!/usr/bin/env python3
"""EC2 の上で動く。ChatGPT（chatgpt.com）を、ログイン済みの Chrome（~/cdp-chatgpt）から触る道具。

`ec2-chrome` の cdp.py の上に乗る。手元から `ec2.py put` で `/home/ubuntu/cdp/chatgpt.py` に置き、

    import sys; sys.path.insert(0, "/home/ubuntu/cdp")
    from chatgpt import *
    t = fresh()                  # ChatGPT のタブを1枚だけ残して返す
"""
import json, os, sys, time, urllib.request
sys.path.insert(0, "/home/ubuntu/cdp")
from cdp import Tab, up, pages, where, _port

NAME = "chatgpt"
BASE = "https://chatgpt.com"
# 島の作業はここに入れる（#780 Q2: C）。あやとの履歴・メモリに混ぜないため。
# 新しい会話は、この URL を開いて入力欄から送ると、プロジェクトの中に作られる
PROJECT = BASE + "/g/g-p-6acd4f935b848191ba03fdbf6c8eedd2/project"


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


# 同じ Chrome（~/cdp-chatgpt）を、いくつものセッションが使う。fresh() はほかのタブを全部閉じるので、
# 2つのセッションが同じ時間に使うとタブを閉じ合う（2026-10-13 12:54〜12:59 UTC に、LINE スタンプの
# セッションと実際にそうなった）。使っているあいだは鍵を置き、fresh() は他人の鍵があれば止まる。
LOCK = "/home/ubuntu/chatgpt/LOCK"
# LINE スタンプの一括（#716）が先に使っていた置き場も見る
OTHER_LOCKS = ["/home/ubuntu/stamp/RUNNING"]
STALE = 4 * 3600   # これより古い鍵は、置いた人が消し忘れたものとみなす


class Busy(RuntimeError):
    pass


def lock(owner, what=""):
    """ChatGPT の Chrome を使い始める。owner はセッションの名前（あとで unlock に同じものを渡す）"""
    held = holder()
    if held and held.get("owner") != owner:
        raise Busy(f"ほかのセッションが使っている: {held}")
    os.makedirs(os.path.dirname(LOCK), exist_ok=True)
    json.dump({"owner": owner, "what": what, "at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())}, open(LOCK, "w"), ensure_ascii=False)


def unlock(owner):
    held = holder()
    if held and held.get("owner") == owner and os.path.exists(LOCK):
        os.remove(LOCK)


def holder():
    """いま鍵を持っている人（無ければ None）。古すぎる鍵は数えない"""
    for path in [LOCK] + OTHER_LOCKS:
        if not os.path.exists(path) or time.time() - os.path.getmtime(path) > STALE:
            continue
        try:
            d = json.load(open(path))
        except Exception:
            d = {"owner": path, "what": open(path).read()[:200]}
        d["path"] = path
        return d
    return None


def fresh(url=PROJECT, wait=6, owner=None):
    """新しいタブを1枚作り、ほかのタブは全部閉じて、そのタブを返す。
    **既定はプロジェクト「あやと島案内鳥」。** chatgpt.com/ を開いて送ると、プロジェクトの外
    （あやとの履歴の本流）に会話ができる（2026-10-13 に別のセッションがそうなった）。
    **ほかのセッションが鍵を置いていたら、タブを閉じる前に止まる**（上の LOCK）。
    自分で鍵を置いたなら owner に同じ名前を渡す（環境変数 CHATGPT_OWNER でもよい）"""
    owner = owner or os.environ.get("CHATGPT_OWNER")
    held = holder()
    if held and held.get("owner") != owner:
        raise Busy(f"ほかのセッションが ChatGPT の Chrome を使っている。終わるまで触らない: {held}")
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
  // 読み上げ用の知らせ（「Loading images…」など）は本文ではない。読み直した直後の絵の返事は、絵が出るまで
  // 数秒これだけになり、本文として返すと絵だけの返事を「Loading images…」という字の返事と読む（2026-11-03）
  if (n.getAttribute('role') === 'status') return '';
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


# 名前（data-* 属性）で当たらないときに、形で拾う手がかり。
# どの会話の画面にも、読み上げ用の見出し（sr-only の h4「You said:」「ChatGPT said:」）が1往復の片側ごとにあり、
# 本文はその見出しの次の箱（2026-11-02 に見た）。役は見出しか先祖の属性（値が user / assistant）から、無ければ見出しの字から決める
ROLE_ATTRS = ["data-conversation-role", "data-message-author-role", "data-message-role"]
USER_HEAD = r"^(You said|You:|あなた)"
ASSISTANT_HEAD = r"^(ChatGPT said|ChatGPT:|ChatGPT の|アシスタント)"


def turns(t):
    """会話を [(role, 本文, 書き終わったか)] で返す。

    画面のつくりがログインの有無で違う（2026-10-12 に両方を見た）:
      未ログイン: <li data-message-role> の並び。書き終わると data-message-complete
      ログイン:   1往復ごとに <div data-talvt-turn-state="in_progress|complete">。
                  問いは [data-user-message-bubble]、返事は h4[data-conversation-role=assistant] の次の箱
    **名前で当たらなければ形で拾う**（2026-11-02 に `data-message-author-role` が無くなって、`turns()` が空を返し
    `wait_reply` が時間切れまで待った）。形は「読み上げ用の見出し（You said: / ChatGPT said:）の次の箱が本文」。
    書き終わったかは、1往復の箱の状態が無ければ「止めるボタンが出ていないか」で見る（`wait_reply` は字が
    落ち着くのも待つ）
    """
    # 何度も呼ぶので、const md が二重に宣言されないよう関数で包む
    return t.js("(() => {" + _MD + f"""
      const tidy = s => s.replace(/\\n{{3,}}/g, '\\n\\n').trim();
      const ROLE_ATTRS = {json.dumps(ROLE_ATTRS)};
      const busyNow = !!document.querySelector({json.dumps(STOP)});
      // 1. 名前で（ログイン）: 1往復ごとの箱
      const boxes = [...document.querySelectorAll('[data-talvt-turn-state]')];
      if (boxes.length) {{
        const out = [];
        for (const c of boxes) {{
          const done = c.getAttribute('data-talvt-turn-state') === 'complete';
          for (const u of c.querySelectorAll('[data-user-message-bubble]'))
            out.push(['user', (u.querySelector('[dir=auto]') || u).innerText.trim(), true]);
          for (const h of c.querySelectorAll('h4[data-conversation-role=assistant]'))
            out.push(['assistant', h.nextElementSibling ? tidy(md(h.nextElementSibling)) : '', done]);
        }}
        if (out.length) return out;
      }}
      // 2. 名前で（前の画面）: data-message-author-role
      const authored = [...document.querySelectorAll('[data-message-author-role]')];
      if (authored.length) {{
        return authored.map((el, i) => {{
          const role = el.getAttribute('data-message-author-role');
          const body = el.querySelector('.markdown, [data-markdown-text-style]') || el;
          return [role, role === 'assistant' ? tidy(md(body)) : el.innerText.trim(), !(busyNow && i === authored.length - 1)];
        }});
      }}
      // 3. 名前で（未ログイン）
      const lis = [...document.querySelectorAll({json.dumps(TURNS)})];
      if (lis.length) {{
        return lis.map(li => {{
          // 返事は本文の section だけを読む。問いは「You said:」の見出しを外して読む
          const body = li.querySelector('section[aria-label="DIL content"]');
          let text = body ? tidy(md(body)) : li.innerText;
          const h = li.querySelector('[data-message-attribution]');
          if (!body && h) text = text.replace(h.innerText, '');
          return [li.dataset.messageRole, text.trim(), li.hasAttribute('data-message-complete')];
        }});
      }}
      // 4. 形で: 会話の中の、読み上げ用の見出しごとに片側
      const root = document.querySelector('[aria-label=Conversation], [data-thread-find-target=conversation]') || document.querySelector('main');
      if (!root) return [];
      const roleOf = h => {{
        for (let e = h, k = 0; e && k < 6; e = e.parentElement, k++)
          for (const a of ROLE_ATTRS) {{
            const v = e.getAttribute && e.getAttribute(a);
            if (v === 'user' || v === 'assistant') return v;
          }}
        const s = (h.innerText || h.textContent || '').trim();
        if (new RegExp({json.dumps(USER_HEAD)}, 'i').test(s)) return 'user';
        if (new RegExp({json.dumps(ASSISTANT_HEAD)}, 'i').test(s)) return 'assistant';
        return null;
      }};
      const out = [];
      for (const h of root.querySelectorAll('h1,h2,h3,h4,h5,h6')) {{
        const box = h.nextElementSibling;
        const role = box && roleOf(h);
        if (!role) continue;
        const state = h.closest('[data-talvt-turn-state]');
        const done = state ? state.getAttribute('data-talvt-turn-state') === 'complete' : true;
        out.push([role, role === 'assistant' ? tidy(md(box)) : (box.querySelector('[dir=auto]') || box).innerText.trim(), done]);
      }}
      // 止めるボタンが出ているあいだは、いちばん後ろの返事は書いている途中
      if (busyNow && out.length && out[out.length - 1][0] === 'assistant') out[out.length - 1][2] = false;
      return out;
    }})()""") or []


# 入力欄と送るボタンは、ログインの有無で作りが違う（2026-10-12 に両方を見た）。
#   未ログイン: <textarea name=prompt>・「Send message」
#   ログイン:   ProseMirror の <div contenteditable>・「Send」
COMPOSER = "textarea[name=prompt], div.ProseMirror[contenteditable=true], [contenteditable=true][aria-label]"
SEND = ('button[aria-label="Send"], button[aria-label="Send message"], button[aria-label="Send prompt"], '
        'button[data-testid=send-button]')
STOP = 'button[aria-label^="Stop"]'


def busy(t):
    """返事を書いている途中か。未ログインは送るボタンが「Stop …」に変わる。
    ログインの画面には止めるボタンが出ないことがあり（考える型の返事）、1往復の箱が in_progress になる"""
    return bool(t.js(f"!!document.querySelector({json.dumps(STOP)}) || "
                     "!!document.querySelector('[data-talvt-turn-state=in_progress]')"))


def _send_button_js():
    """入力欄と同じ form の中で、**画面に見えている**送るボタン。
    document.querySelector で最初の1つを取ると、見えていない別の「Send」を押して
    何も送られないことがある（2026-10-12 にプロジェクトの画面で踏んだ。字も絵も入力欄に残ったまま）"""
    return f"""(() => {{
        const c = document.querySelector({json.dumps(COMPOSER)});
        const scope = (c && c.closest('form')) || document;
        return [...scope.querySelectorAll({json.dumps(SEND)})]
            .find(b => {{ const r = b.getBoundingClientRect(); return r.width > 0 && r.height > 0; }}) || null;
    }})()"""


def send(t, text, ready_timeout=120):
    """入力欄に字を入れて送る。改行は Input.insertText がそのまま入れる。
    ファイルを付けたあとは、上げ終わるまで送るボタンが押せないので待つ。
    送ったかどうかは、入力欄が空になったかで確かめる"""
    if text:
        t.click(f"document.querySelector({json.dumps(COMPOSER)})")
        # 前に送りそこねた下書きが残っていることがある（ChatGPT は下書きを覚えていて、開き直しても戻す）。
        # 残したまま足すと、同じ問いが2回つながって送られる
        t.js(f"(() => {{ const e = document.querySelector({json.dumps(COMPOSER)}); e.focus(); "
             "if (e.select) e.select(); else document.execCommand('selectAll'); document.execCommand('delete'); })()")
        t.type(text)
    end = time.time() + ready_timeout
    while time.time() < end:
        time.sleep(0.8)
        if t.js(f"(() => {{ const b = {_send_button_js()}; return !!b && !b.disabled; }})()"):
            break
    else:
        raise TimeoutError("送るボタンが押せるようにならない（ファイルの上げ待ち？）")
    # 絵を付けた直後の1回目は、押しても黙って無視されることがある（2026-10-12 にプロジェクトの画面で2回。
    # ボタンは押せる見た目のまま、字も絵も入力欄に残る）。入力欄が空になるまで、間をおいて押し直す
    for attempt in range(6):
        t.click(_send_button_js())
        for _ in range(8):
            time.sleep(0.5)
            if not _composer_text(t):
                return attempt + 1
    raise RuntimeError("送るボタンを6回押したが、入力欄に字が残っている（送れていない）")


def _composer_text(t):
    return t.js(f"(() => {{ const e = document.querySelector({json.dumps(COMPOSER)}); "
                "return e ? (e.value ?? e.innerText).trim() : ''; })()")


def attach(t, paths, timeout=120):
    """ファイルを入力欄に付ける（ダイアログを開かない）。パスは EC2 の上のもの。
    **無いパスを渡しても Chrome は黙って空のファイルを渡す**（ec2-chrome 4）ので、先にこちらで確かめる"""
    import os
    for p in paths:
        if not os.path.isfile(p):
            raise FileNotFoundError(p)
    # ファイルの口は入力欄の form に4つある（2026-11-02: Take a photo・Attach photos or videos・Attach photos・
    # Attach files）。絵に限らない口は「Attach files」だけで、accept が空。名前が変わっても拾えるよう、
    # 名前で当たらなければ、入力欄の form の中で accept の無い口を使う（_menu と同じく、名前1つに頼らない）
    if not t.js(f"""(() => {{
        document.querySelectorAll('[data-cg-attach]').forEach(e => e.removeAttribute('data-cg-attach'));
        const c = document.querySelector({json.dumps(COMPOSER)});
        const f = (c && c.closest('form')) || document;
        const e = document.querySelector('input[type=file][aria-label="Attach files"], input#octane-mobile-composer-files-input')
            || [...f.querySelectorAll('input[type=file]')].find(i => !i.getAttribute('accept'));
        if (!e) return false;
        e.setAttribute('data-cg-attach', ''); return true; }})()"""):
        raise RuntimeError("ファイルを付ける口（input[type=file]）が見つからない")
    t.set_files("input[data-cg-attach]", paths)
    # 付けた絵の札（サムネイル）が出るまで待つ
    end = time.time() + timeout
    while time.time() < end:
        time.sleep(1)
        n = t.js("""document.querySelectorAll('form img, [data-testid*=attachment], [aria-label^="Remove file"], button[aria-label^="Remove"]').length""")
        if n:
            return n
    raise TimeoutError("付けたファイルの札が出ない")


# ChatGPT が描いた絵（2026-10〜11 の画面は alt「Generated image N」、[data-testid=generated-image-gallery] の中）
GEN_IMG = '[data-testid=generated-image-gallery] img, img[alt^="Generated image"]'

# 返事の絵を、どの返事のものか・描き終わったかと一緒に読む。
# - **どの返事か**は「いちばん後ろの問いより後ろにあるか」で決める。会話の中の位置で数えない
#   （長い会話は画面の外の往復を外すので、往復の数が送る前と後で同じになることがある）
# - **識別**は src から。署名付きの URL なら id（無ければ origin＋path）、blob: ならそのまま
#   （blob: は読み直すと変わるので、読み直したあとは「問いより後ろか」だけが効く）
# - **描いている途中の絵**は、絵かその先祖が ぼかし（filter / backdrop-filter の blur）か aria-busy のとき、
#   または先祖の兄弟に backdrop-filter のぼかし（絵に重なる覆い）があるとき
# - **描いている途中の箱**（pending）は、問いより後ろ・入力欄の外にある、見えている
#   [data-testid*=loading]・[aria-busy=true]・[role=progressbar]。
#   2026-11-03 の画面は、描いているあいだ絵の img を出さず、`image-gen-loading-game-board`（canvas の遊び）と
#   「Creating image 13%」→「Sketching it out 37%」→「Making the first draft 53%」を出して、描き終わると一度に
#   絵（1536×1024・ぼかし無し）に替わった。止めるボタン（Stop）と in_progress も、そのあいだ出ていた
_REPLY_IMGS = r"""((minPx, GEN, USER_HEAD) => {
  const order = (a, b) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) ? -1 : 1;
  const users = [...document.querySelectorAll('[data-user-message-bubble], [data-message-author-role=user], li[data-message-role=user], h1[data-conversation-role=user], h2[data-conversation-role=user], h3[data-conversation-role=user], h4[data-conversation-role=user], h5[data-conversation-role=user], h6[data-conversation-role=user]')];
  for (const h of document.querySelectorAll('main h1, main h2, main h3, main h4, main h5, main h6'))
    if (new RegExp(USER_HEAD, 'i').test((h.innerText || h.textContent || '').trim())) users.push(h);
  const last = users.sort(order).pop() || null;
  const after = e => !last || (!last.contains(e) && !!(last.compareDocumentPosition(e) & Node.DOCUMENT_POSITION_FOLLOWING));
  const keyOf = i => {
    const s = i.currentSrc || i.src || '';
    try { const u = new URL(s); if (u.protocol === 'blob:') return s;
          return u.searchParams.get('id') || (u.origin + u.pathname); } catch (e) { return s; }
  };
  const blurred = v => /blur\((?!0(px)?\))/.test(v || '');
  const drawing = i => {
    for (let e = i, k = 0; e && e !== document.body && k < 8; e = e.parentElement, k++) {
      const cs = getComputedStyle(e);
      if (blurred(cs.filter) || blurred(cs.backdropFilter)) return 'blur';
      if (e.getAttribute('aria-busy') === 'true') return 'aria-busy';
      // 絵に重なる覆い（兄弟の backdrop-filter）
      if (e.parentElement) for (const s of e.parentElement.children)
        if (s !== e && blurred(getComputedStyle(s).backdropFilter)) return 'overlay';
    }
    return '';
  };
  const shown = e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  const pending = [...document.querySelectorAll('[data-testid*="loading" i], [aria-busy="true"], [role="progressbar"]')]
      .filter(e => after(e) && !e.closest('form') && shown(e))
      .map(e => e.getAttribute('data-testid') || e.getAttribute('role') || 'aria-busy');
  const all = [...new Set(document.querySelectorAll(GEN))];
  return {found: !!last, keys: all.map(keyOf), pending,
          reply: all.filter(after).map(i => ({src: i.currentSrc || i.src, key: keyOf(i), w: i.naturalWidth, h: i.naturalHeight,
                                              ok: i.complete && i.naturalWidth >= minPx, drawing: drawing(i)}))};
})"""


def _reply_imgs(t, min_px=256):
    """{found: 問いが見つかったか, keys: 会話の中の絵の識別ぜんぶ, pending: 描いている途中の箱,
    reply: いちばん後ろの問いより後ろの絵 [{src,key,w,h,ok,drawing}]}"""
    return (t.js(f"{_REPLY_IMGS}({min_px}, {json.dumps(GEN_IMG)}, {json.dumps(USER_HEAD)})")
            or {"found": False, "keys": [], "pending": [], "reply": []})


def _norm(s):
    return "".join((s or "").split())[:300]


def mark(t):
    """**送る前に呼ぶ。** いまの会話の終わり（往復の数・いちばん後ろの問い・もう出ている絵）を控えて返す。
    wait_reply / images に渡すと、送ったあとに出たものだけを返事として見る"""
    ts = turns(t)
    idx = max((i for i, x in enumerate(ts) if x[0] == "user"), default=None)
    return {"n": len(ts), "last_user": _norm(ts[idx][1]) if idx is not None else None,
            "last_reply": _norm(" ".join(x[1] for x in ts[idx + 1:] if x[0] == "assistant")) if idx is not None else None,
            "keys": set(_reply_imgs(t)["keys"])}


def _reply(ts, before):
    """送ったあとの返事（いちばん後ろの問いより後ろの、アシスタントの片側）。まだ自分の問いが画面に出ていなければ None。
    **往復の数では決めない**（長い会話は画面の外の往復を外すので、送る前と後で数が同じになりうる）。
    自分の問いかは、いちばん後ろの問いの字が送る前と違うかで見る。同じ問いを送り直したときだけ、
    往復の数が増えたか・その後ろの返事の字が送る前と違うかで見る"""
    idx = max((i for i, x in enumerate(ts) if x[0] == "user"), default=None)
    if idx is None or before.get("last_user", False) is False:
        # 問いが1つも読めない画面（または last_user の無い控え）。数で見るしかない
        return [x for x in ts[before["n"]:] if x[0] == "assistant"] if len(ts) > before["n"] else None
    after = [x for x in ts[idx + 1:] if x[0] == "assistant"]
    if (before["last_user"] is not None and _norm(ts[idx][1]) == before["last_user"] and len(ts) <= before["n"]
            and _norm(" ".join(x[1] for x in after)) == before.get("last_reply")):
        return None
    return after


def wait_reply(t, before, timeout=600, poll=3, reload_every=45, want_images=False, settle=2):
    """送ったあとの返事が書き終わるまで待って、本文を返す（絵だけの返事なら ""）。
    before は送る前に取った mark(t)。前の呼び方（送る前の往復の数）も受ける。

    **書き終わり**は次のどちらか。どちらも、止めるボタンが出ておらず、1往復の箱が in_progress でなく（busy）、
    問いより後ろに描いている途中の箱（_REPLY_IMGS の pending）が無いとき:
      - 字の返事: 返事の字が空でなく、書き終わりの印があり、前の見回りと同じ。字と絵の両方なら、絵も下の形で描き終わっている
      - 絵の返事: 送る前に無かった絵が、いちばん後ろの問いより後ろにあり、どれも読み込み済み（256px 以上）・
        描いている途中の印（ぼかし・aria-busy・重なった覆い）が無く、settle 回の見回りで変わらない
    **返事を、往復の数で探さない。絵だけの返事を、字で待たない。** 前の作りは返事を「送る前の往復の数より後ろ」で探し、
    「字が空でない」か「いちばん後ろの1往復の箱に絵がある」を待っていた。長い会話は画面の外の往復を外す
    （2026-11-03 に数えた続きの会話は、いちばん下で 10・上へ送って 12・下へ戻して 8）ので、往復の数が送る前を
    超えないことがある。絵だけの返事が時間切れまで待った2回（2026-11-03）は、どちらもその長い会話の続きだった。
    新しい会話なら前の作りでも絵が出た時点で終わりと読めていた（同じ日に画面を2秒ごとに控えて確かめた）。

    **タブの上の返事は途中で止まることがある。** ログインして考える型（Thinking）で頼むと、
    サーバーでは書き終わっているのに、タブは「Thinking」のまま7分動かなかった（2026-10-12）。
    なので reload_every 秒のあいだ返事に何も変わりが無ければ、ページを読み直して確かめる。返事はサーバーに残るので、
    読み直しても消えない（ログインしていて、ふつうの会話かプロジェクトのとき。未ログインの会話は読み直すと消える）。
    want_images=True なら、絵が出そろうまで待つ"""
    if not isinstance(before, dict):
        # 前の呼び方（送る前の往復の数）。数だけで探すと長い会話で待ち続けるので、送ってすぐのいまを控えて足す
        # （問いがもう出ていれば、その後ろの返事の字が変わったら自分の返事。絵は描くのに数十秒かかるので、
        #  いまある絵は「前からあった」とみなせる）
        before = dict(mark(t), n=int(before))
    end = time.time() + timeout
    url = None
    last_reload = last_change = time.time()
    prev, same = None, 0
    while time.time() < end:
        time.sleep(poll)
        u = t.url()
        if "/c/" in u:
            url = u
        reply = _reply(turns(t), before)
        # 返事の絵は「いちばん後ろの問いより後ろ」で、送る前に無かったもの。自分の問いがまだ出ていない一瞬は、
        # 前の問いの後ろにある前の絵が入るが、識別が送る前と同じなので外れる。読み直すと blob: の識別は変わるが、
        # そのときはもう自分の問いが出ていて、前の絵は問いより前に居る
        r = _reply_imgs(t)
        imgs = [i for i in r["reply"] if i["key"] not in before["keys"]]
        # 止めるボタン・in_progress（busy）と、描いている途中の箱（pending）。どちらかが出ているあいだは終わりにしない
        bz = busy(t) or bool(r.get("pending"))
        text = reply[-1][1] if reply else None
        sig = json.dumps([text, [(i["key"], i["w"], i["h"], i["ok"], i["drawing"]) for i in imgs], bz, r.get("pending")],
                         ensure_ascii=False)
        if sig == prev:
            same += 1
        else:
            prev, same, last_change = sig, 0, time.time()
        drawn = bool(imgs) and all(i["ok"] and not i["drawing"] for i in imgs)
        if not bz:
            # 字の返事（考えているあいだは箱が空のまま止まって見えるので、空は字の返事として受け取らない）
            if text and reply[-1][2] and same >= 1 and (not imgs or (drawn and same >= settle)) and (not want_images or drawn):
                return text
            # 絵の返事（字が空でもよい）
            if drawn and same >= settle:
                return text or ""
        if url and time.time() - max(last_change, last_reload) > reload_every:
            t.call("Page.reload", ignoreCache=True)
            t.wait_ready()
            time.sleep(4)
            last_reload = time.time()
    raise TimeoutError(f"{timeout}秒待っても返事が書き終わらない: {where(url or t.url())}")


def ask(t, text, timeout=600, want_images=False):
    """1往復。返事の本文を返す（絵だけの返事なら ""）。同じタブで続けて呼べば、同じ会話の続きになる"""
    m = mark(t)
    send(t, text)
    return wait_reply(t, m, timeout, want_images=want_images)


def in_project(t):
    """いまの会話がプロジェクト「あやと島案内鳥」の中か（URL が /g/g-p-6acd4f93… で始まる）"""
    return "/g/g-p-6acd4f935b848191ba03fdbf6c8eedd2" in (t.url() or "")


# 会話の右上の「…」ボタン。**名前は画面の出し直しで変わる。** 2026-10 は「More」、2026-11-02 には
# 「Chat actions」になっていて、名前1つで探していた題の付け直しが落ち、描けた絵が保存されずに終わった。
# 名前で見つからなければ、会話の上の帯（main の header）でメニューを開くボタンを使う
# （2026-11-02 に見た帯の中は「Chat actions」（aria-haspopup=menu）と「Share」の2つだけ。
#  モードの切り替えは左のサイドバー＝nav の中にあって main の外）。
# どのボタンで開いたかは、開いた中に目当ての項目があるかで確かめ、無ければ閉じて次を試す
MENU_LABELS = ("Chat actions", "More")
MENU_SHAPE = "main header button[aria-haspopup=menu]"


def _menu(t, item):
    """会話の右上のメニューを開いて、項目を押す（Rename / Move to project / Archive …）。
    戻り値は開いたボタンの aria-label。見つからなければ、何を試して何が開いたかを書いて RuntimeError"""
    t.key("Escape")
    # 試す順に印（data-cg-menu）を付ける。名前で当たったものが先、形で当たったものは右から
    cands = t.js(f"""(() => {{
        const shown = b => {{ const r = b.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.y < 60; }};
        const all = [...document.querySelectorAll('button')].filter(shown);
        const byName = {json.dumps(list(MENU_LABELS))}.flatMap(l => all.filter(b => b.getAttribute('aria-label') === l));
        const shape = {json.dumps(MENU_SHAPE or "")};
        const byShape = shape ? [...document.querySelectorAll(shape)].filter(shown)
            .sort((a, b) => b.getBoundingClientRect().x - a.getBoundingClientRect().x) : [];
        const out = [...new Set([...byName, ...byShape])];
        document.querySelectorAll('[data-cg-menu]').forEach(e => e.removeAttribute('data-cg-menu'));
        out.forEach((b, i) => b.setAttribute('data-cg-menu', String(i)));
        return out.map(b => [b.getAttribute('aria-label'), byName.includes(b) ? '名前' : '形']);
    }})()""") or []
    seen = []
    for i, (label, how) in enumerate(cands):
        try:
            t.click(f"document.querySelector('[data-cg-menu=\"{i}\"]')")
        except RuntimeError:
            seen.append(f"{label!r}（{how}）: 押せなかった")
            continue
        time.sleep(1.2)
        items = t.js("[...document.querySelectorAll('[role=menuitem]')].map(e => (e.innerText || '').trim().slice(0, 30))") or []
        if item in items:
            t.click(f"[...document.querySelectorAll('[role=menuitem]')].find(e => (e.innerText || '').trim() === {json.dumps(item)})")
            time.sleep(1.2)
            return label
        seen.append(f"{label!r}（{how}）: {items[:10]}")
        t.key("Escape")
        time.sleep(0.5)
    raise RuntimeError(f"右上のメニューに「{item}」が見つからない（名前 {list(MENU_LABELS)}・形 {MENU_SHAPE!r} で"
                       f"{len(cands)}個のボタンを試した: {'; '.join(seen) or '当たるボタンが無い'}）")


def rename(t, title):
    """会話の題を付け直す。**送って返事が来たあと、毎回呼ぶ**（あやと 2026-10-13「チャット名は毎回わかりやすく」）。
    ChatGPT が自分で付ける題（「背景透過PNG化」「絵の描き直し依頼」）では、あとから何の会話か分からない。
    題の形は SKILL.md 1。戻り値は付け直したあとの題。落ちたら RuntimeError（落ちても先へ進めたいときは rename_or_warn）"""
    if "/c/" not in (t.url() or ""):
        raise RuntimeError("まだ会話ができていない（送って返事が来てから付け直す）")
    _menu(t, "Rename")
    # 「Rename chat」のダイアログの「Chat title」欄に、いまの題が選ばれた状態で入っている。
    # 欄の名前が変わっても拾えるよう、送るボタン（type=submit）のあるダイアログの、ただ1つの字の欄でもよしとする
    # （2026-11-02 に見たダイアログは、欄「Chat title」1つと Cancel・Save（submit）・Close dialog）
    if not t.js("""(() => {
        document.querySelectorAll('[data-cg-title]').forEach(e => e.removeAttribute('data-cg-title'));
        const one = d => { const s = [...d.querySelectorAll('input[type=text], input:not([type])')];
            return d.querySelector('button[type=submit]') && s.length === 1 ? s[0] : null; };
        const e = document.querySelector('[role=dialog] input[aria-label="Chat title"]')
            || [...document.querySelectorAll('[role=dialog]')].map(one).find(Boolean);
        if (!e) return false;
        e.setAttribute('data-cg-title', ''); e.focus(); e.select(); return true; })()"""):
        raise RuntimeError("「Rename」を押したが、題を入れる欄が出ない")
    t.type(title)
    time.sleep(0.5)
    t.click("""(() => { const e = document.querySelector('[data-cg-title]');
        const d = (e && e.closest('[role=dialog]')) || document;
        return [...d.querySelectorAll('button')].find(b => b.innerText.trim() === 'Save') || d.querySelector('button[type=submit]'); })()""")
    for _ in range(10):
        time.sleep(0.8)
        if t.js("document.title") == title:
            return title
    raise RuntimeError(f"題が付け直らない: いまは {t.js('document.title')!r}")


def rename_or_warn(t, title, tries=2):
    """題を付け直す。**落ちても止めずに、何がどう落ちたかを標準エラーに1行出して先へ進む。**
    付け直しの前後にある大事な処理（返事を出す・描けた絵を保存する）を、題のせいで失わないため
    （2026-11-02、右上のボタンの名前が変わって付け直しが落ち、描けた絵が保存されずに終わった）。
    題はあとから会話を引くための大事な手順なので、黙っては捨てない。戻り値は、落ちたときの理由（通れば None）"""
    err = None
    for k in range(tries):
        try:
            rename(t, title)
            return None
        except Exception as e:  # 画面の作りが変わったときに出るのは RuntimeError だけとは限らない
            err = f"{type(e).__name__}: {e}"
            if k + 1 < tries:
                time.sleep(2)
    try:
        now, url = t.js("document.title"), where(t.url())
    except Exception:
        now, url = "?", "?"
    print(f"警告: 会話の題を付け直せなかった（{tries}回）。{err} ／ 付けたかった題 {title!r}・いまの題 {now!r}・"
          f"会話 {url}（あとで fresh(会話のURL) から rename し直す）", file=sys.stderr, flush=True)
    return err


def logged_in(t):
    """ログインしているか。未ログインの画面は右上と左下に「Log in」のボタンを出す"""
    return not t.js("[...document.querySelectorAll('button')].some(b => b.innerText.trim() === 'Log in')")


def ask_once(question, title, timeout=600, url=PROJECT):
    """プロジェクトの新しい会話（url を渡せばその会話の続き）で1往復して、題を付け直し、返事を返す。
    題の付け直しが落ちても返事は返す（警告を1行出す。rename_or_warn）"""
    t = fresh(url)
    if logged_in(t) and not in_project(t):
        raise SystemExit(f"プロジェクトの外を開いている: {where(t.url())}")
    a = ask(t, question, timeout=timeout)
    if logged_in(t):
        rename_or_warn(t, title)
    return a


def images(t, min_px=256, before=None):
    """いちばん後ろの返事の、描き終わった絵を [(src, 幅, 高さ)] で返す。読み込み中・描いている途中の絵は数えない。
    「いちばん後ろの返事」は、いちばん後ろの問いより後ろ（_reply_imgs）。before（mark の戻り値）を渡せば、
    送る前からあった絵も外す。src は blob: のことがあるので、取るときは save_image でページの中から取る"""
    keys = (before or {}).get("keys") or set()
    return [(i["src"], i["w"], i["h"]) for i in _reply_imgs(t, min_px)["reply"]
            if i["ok"] and not i["drawing"] and i["key"] not in keys]


def save_image(t, src, out):
    """絵を**ページの中の fetch で**取ってファイルに書く。戻り値は (形式, バイト数)。
    絵の URL は署名付きで短い時間で切れるうえ、ログインの cookie が要るので、手元からは取りに行けない"""
    import base64, os
    r = t.js(f"""(async () => {{
        const b = await (await fetch({json.dumps(src)}, {{credentials: 'include'}})).blob();
        const d = await new Promise(res => {{ const f = new FileReader(); f.onload = () => res(f.result.split(',')[1]); f.readAsDataURL(b); }});
        return [b.type, d];
    }})()""", await_promise=True)
    data = base64.b64decode(r[1])
    os.makedirs(os.path.dirname(os.path.abspath(out)), exist_ok=True)
    open(out, "wb").write(data)
    return r[0], len(data)


# **いちばん後ろに置く。** 前は images() / save_image() がこの下にあって、`chatgpt.py ask` で返事の字が空のとき
# （絵だけの返事）wait_reply が images() を呼ぶと、まだ定義されていなくて NameError で落ちた
if __name__ == "__main__":
    # python3 chatgpt.py ask <問いを書いたファイル> <会話の題> [待つ秒]
    #   … プロジェクトの新しい会話で1往復して、題を付け直し、返事を標準出力へ
    # 問いと題はファイル・引数で渡す（SSM のコマンドに日本語や引用符を直に入れると崩れる）
    if len(sys.argv) >= 4 and sys.argv[1] == "ask":
        print(ask_once(open(sys.argv[2], encoding="utf-8").read().strip(), sys.argv[3],
                       timeout=int(sys.argv[4]) if len(sys.argv) > 4 else 600))
    elif len(sys.argv) >= 3 and sys.argv[1] == "lock":
        lock(sys.argv[2], " ".join(sys.argv[3:]))
        print("locked", holder())
    elif len(sys.argv) >= 3 and sys.argv[1] == "unlock":
        unlock(sys.argv[2])
        print("unlocked; now", holder())
    elif len(sys.argv) >= 2 and sys.argv[1] == "who":
        print(holder())
    else:
        print("usage: chatgpt.py ask <file> <title> [timeout] | lock <owner> [what] | unlock <owner> | who")
