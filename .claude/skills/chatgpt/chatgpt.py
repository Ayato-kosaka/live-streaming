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
    """会話を [(role, 本文, 書き終わったか)] で返す。

    画面のつくりがログインの有無で違う（2026-10-12 に両方を見た）:
      未ログイン: <li data-message-role> の並び。書き終わると data-message-complete
      ログイン:   1往復ごとに <div data-talvt-turn-state="in_progress|complete">。
                  問いは [data-user-message-bubble]、返事は h4[data-conversation-role=assistant] の次の箱
    """
    # 何度も呼ぶので、const md が二重に宣言されないよう関数で包む
    return t.js("(() => {" + _MD + f"""
      const tidy = s => s.replace(/\\n{{3,}}/g, '\\n\\n').trim();
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
        return out;
      }}
      return [...document.querySelectorAll({json.dumps(TURNS)})].map(li => {{
        // 返事は本文の section だけを読む。問いは「You said:」の見出しを外して読む
        const body = li.querySelector('section[aria-label="DIL content"]');
        let text = body ? tidy(md(body)) : li.innerText;
        const h = li.querySelector('[data-message-attribution]');
        if (!body && h) text = text.replace(h.innerText, '');
        return [li.dataset.messageRole, text.trim(), li.hasAttribute('data-message-complete')];
      }});
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


def wait_reply(t, n_before, timeout=600, poll=3, reload_every=45, want_images=False):
    """n_before 本より後ろに、書き終わった返事が来るまで待って本文を返す。

    **タブの上の返事は途中で止まることがある。** ログインして考える型（Thinking）で頼むと、
    サーバーでは書き終わっているのに、タブは「Thinking」のまま7分動かなかった（2026-10-12）。
    なので reload_every 秒ごとにページを読み直して確かめる。返事はサーバーに残るので、読み直しても消えない
    （ログインしていて、ふつうの会話かプロジェクトのとき。未ログインの会話は読み直すと消える）。
    want_images=True なら、絵が出そろうまで待つ"""
    end = time.time() + timeout
    url = None
    last_reload = time.time()
    while time.time() < end:
        time.sleep(poll)
        u = t.url()
        if "/c/" in u:
            url = u
        ts = turns(t)
        new = [x for x in ts[n_before:] if x[0] == "assistant"]
        if new and new[-1][2] and not busy(t) and (not want_images or images(t)):
            return new[-1][1]
        if url and time.time() - last_reload > reload_every:
            t.call("Page.reload", ignoreCache=True)
            t.wait_ready()
            time.sleep(4)
            last_reload = time.time()
    raise TimeoutError(f"{timeout}秒待っても返事が書き終わらない: {where(url or t.url())}")


def ask(t, text, timeout=600, want_images=False):
    """1往復。返事の本文を返す。同じタブで続けて呼べば、同じ会話の続きになる"""
    n = len(turns(t))
    send(t, text)
    return wait_reply(t, n, timeout, want_images=want_images)


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


def images(t, min_px=256):
    """いちばん後ろの返事に入っている絵を [(src, 幅, 高さ)] で返す。読み込み中の絵（幅0）は数えない。
    作った絵は [data-testid=generated-image-gallery] の中の img（alt「Generated image N」）。
    src は blob: なので、取るときは save_image でページの中から取る"""
    return t.js(f"""(() => {{
        const boxes = [...document.querySelectorAll('[data-talvt-turn-state], li[data-message-role=assistant]')];
        const last = boxes.pop();
        if (!last) return [];
        return [...last.querySelectorAll('[data-testid=generated-image-gallery] img, img[alt^="Generated image"]')]
            .filter((i, k, a) => a.indexOf(i) === k && i.complete && i.naturalWidth >= {min_px})
            .map(i => [i.currentSrc || i.src, i.naturalWidth, i.naturalHeight]);
    }})()""") or []


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
