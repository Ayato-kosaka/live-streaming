"""**`chatgpt._menu` が、押す鍵の字が付いた項目（"Rename\\nR"）を名前「Rename」で当てて押すことの見張り。**
本物の ChatGPT・EC2・ブラウザには触らない。node の上に偽の画面（要素の木と、使う形だけの CSS の探し方）を作り、
本物の `.claude/skills/chatgpt/chatgpt.py` を読み込んで、その `_menu` / `logged_in` / `NAME_OF` をそのまま当てる。

    python3 python/chatgpt_menu_selftest.py

終了コード 0=通った / 1=落ちた / **2=回せない（node が無い・外す字が chatgpt.py に無い・
偽の画面が知らない探し方をされた）**（`docs/island-standards.md` §15）。

## なぜ要るか（2026-11-23）

ChatGPT の会話の右上メニューで、項目の innerText に押す鍵の字が2行目として付くようになった（"Rename\\nR"）。
`_menu` は innerText 全体を完全一致で比べていたので「Rename」が見つからず、`rename()` が RuntimeError で落ちた
（EC2 の Chrome で実際に起きた）。名前は innerText の1行目で比べる（`chatgpt.NAME_OF`）。
集める側（`item in items`）と押す側（`.find(...)`）の片方だけ直すと「在るのに押せない」になり、
前方一致に逃げると「Rename」で "Rename project" を押す。どれも本物の画面でしか出ないので、ここで先に見る。

`.claude/skills/chatgpt/wait_reply_selftest.py` は Chromium が要って回し役が降りない置き場にあるので、
こちらは `python/` に置いて、毎 PR の回し役（`python/selftest_runner.py`）から拾わせる。

## 足

| 足 | 偽の画面 | 通る条件 |
| --- | --- | --- |
| `name_of` | 要素1つずつに `NAME_OF` を当てる | "Rename\\nR"→"Rename"・"Rename"→"Rename"・"Rename project\\nP"→"Rename project" ほか |
| `hint` | 右上メニューの項目がすべて鍵の字つき（"Rename\\nR" …） | `_menu(t, "Rename")` が「Chat actions」を返し、"Rename\\nR" の項目を押す |
| `plain` | 鍵の字の無い古い形（"Rename" …） | "Rename" の項目を押す |
| `prefix_only` | "Rename project\\nP" はあるが "Rename" は無い | 何も押さずに RuntimeError |
| `prefix_first` | "Rename project\\nP" が "Rename\\nR" より上 | 上の "Rename project" ではなく "Rename\\nR" を押す |
| `logged_in` | 「Log in」のボタンが無い／"Log in"／"Log in\\nL" | 順に True／False／False |

## 対照（§15）

`CUTS` が `chatgpt.py` の字を1か所だけ書き換えた写しで足を回し、**外した守りの足が落ちる**ことを確かめる。
外す字が本物に1か所だけ無ければ 2。

| 対照 | 外す守り | 落ちる足 |
| --- | --- | --- |
| `whole_text` | 直す前の比べ方（innerText 全体を trim） | `name_of`・`hint`・`prefix_first`・`logged_in` |
| `press_whole` | 押す側だけ直す前の比べ方 | `hint`・`prefix_first`・`logged_in` |
| `list_whole` | 集める側だけ直す前の比べ方 | `hint`・`prefix_first` |
| `prefix` | 押す側を前方一致にする | `prefix_first` |
"""

from __future__ import annotations

import importlib.util
import json
import shutil
import subprocess
import sys
import tempfile
import time
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
SKILL = REPO / ".claude" / "skills" / "chatgpt"
CDP = REPO / ".claude" / "skills" / "ec2-chrome" / "cdp.py"

# 写しを読み込むたびに pyc を残さない（同じ長さの書き換えで古い pyc を読む穴を踏まない。CLAUDE.md「検証のしかた」）
sys.dont_write_bytecode = True

# ------------------------------------------------------------------ 偽の画面（node）

# 要素の木と、_menu が使う形だけの CSS の探し方（タグ・[属性]・[属性=値]・子孫）。
# 知らない形で探されたら黙って空を返さず、記録して投げる（探し方が変わった日に「見つからない」で緑にならないため）
FAKE_JS = r"""
const readline = require('readline');
let unknown = [], clicked = [];
const ATTR = /\[([\w-]+)(?:=(?:"([^"]*)"|([^\]"]*)))?\]/g;
function bad(sel) { unknown.push(sel); throw new Error('偽の画面が知らない探し方: ' + sel); }
function compile(sel) {
  if (/[,:>+~.#*]/.test(sel)) bad(sel);
  const parts = sel.trim().split(/\s+/).map(part => {
    const m = part.match(/^([a-z]*)((?:\[[^\]]+\])*)$/i);
    if (!m || m[2].replace(ATTR, '') !== '') bad(sel);
    const attrs = [...m[2].matchAll(ATTR)].map(a => [a[1], a[2] !== undefined ? a[2] : a[3]]);
    return e => (!m[1] || e.tagName === m[1].toUpperCase())
      && attrs.every(([n, v]) => v === undefined ? e.hasAttribute(n) : e.getAttribute(n) === v);
  });
  const last = parts.pop();
  return e => {
    if (!last(e)) return false;
    let i = parts.length - 1;
    for (let a = e.parent; a && i >= 0; a = a.parent) if (parts[i](a)) i--;
    return i < 0;
  };
}
class El {
  constructor(tag, attrs = {}, text = '', rect = [0, 0, 0, 0]) {
    this.tagName = tag.toUpperCase(); this.attrs = {...attrs}; this.text = text; this.rect = rect;
    this.children = []; this.parent = null; this.onclick = null;
  }
  append(...cs) { for (const c of cs) { c.parent = this; this.children.push(c); } return this; }
  remove() { if (this.parent) this.parent.children = this.parent.children.filter(c => c !== this); this.parent = null; }
  getAttribute(n) { return Object.hasOwn(this.attrs, n) ? this.attrs[n] : null; }
  hasAttribute(n) { return Object.hasOwn(this.attrs, n); }
  setAttribute(n, v) { this.attrs[n] = String(v); }
  removeAttribute(n) { delete this.attrs[n]; }
  getBoundingClientRect() { const [x, y, width, height] = this.rect; return {x, y, width, height, left: x, top: y}; }
  get innerText() { return this.text; }
  scrollIntoView() {}
  toJSON() { return {}; }
  *walk() { for (const c of this.children) { yield c; yield* c.walk(); } }
  querySelectorAll(sel) { const m = compile(sel); return [...this.walk()].filter(m); }
  querySelector(sel) { return this.querySelectorAll(sel)[0] || null; }
  closest(sel) { const m = compile(sel); for (let e = this; e; e = e.parent) if (m(e)) return e; return null; }
}
const body = new El('body');
const document = {title: 'fake', querySelectorAll: s => body.querySelectorAll(s), querySelector: s => body.querySelector(s)};
// 2026-11-02 に見た形: 帯（main の header）に「Share」と「Chat actions」（aria-haspopup=menu）。サイドバーは nav
function setup(spec) {
  body.children = []; clicked = []; unknown = [];
  const menuBtn = new El('button', {'aria-label': 'Chat actions', 'aria-haspopup': 'menu'}, '', [910, 10, 36, 36]);
  const header = new El('header').append(new El('button', {'aria-label': 'Share'}, 'Share', [820, 10, 80, 36]), menuBtn);
  for (const t of spec.buttons || []) header.append(new El('button', {}, t, [700, 10, 60, 36]));
  body.append(new El('nav').append(new El('button', {'aria-label': 'Open sidebar'}, '', [8, 8, 36, 36])),
              new El('main').append(header, new El('div', {}, '会話')));
  menuBtn.onclick = () => {
    const menu = new El('div', {role: 'menu'});
    menu.append(...(spec.items || []).map((t, i) => {
      const it = new El('div', {role: 'menuitem'}, t, [880, 60 + 36 * i, 220, 32]);
      it.onclick = () => menu.remove();
      return it;
    }));
    body.append(menu);
  };
}
function press(e) { clicked.push(e.getAttribute('aria-label') || e.innerText); if (e.onclick) e.onclick(); }
function escape() { for (const m of body.querySelectorAll('[role=menu]')) m.remove(); }
const run = expr => new Function('document', '__press', 'return (' + expr + ');')(document, press);
readline.createInterface({input: process.stdin}).on('line', line => {
  const q = JSON.parse(line);
  let out;
  try {
    if (q.op === 'setup') { setup(q.spec); out = null; }
    else if (q.op === 'escape') { escape(); out = null; }
    else if (q.op === 'state') out = {clicked, unknown};
    else out = run(q.expr);
    process.stdout.write(JSON.stringify({ok: true, value: out === undefined ? null : out}) + '\n');
  } catch (e) {
    process.stdout.write(JSON.stringify({ok: false, error: String(e && e.message || e)}) + '\n');
  }
});
"""


class Unrunnable(Exception):
    """回せない（2）。落ちた（1）と同じ顔にしない"""


class Page:
    """偽の画面を持つ node。1本の node を足のあいだで使い回し、足の頭で setup し直す"""

    def __init__(self):
        node = shutil.which("node")
        if not node:
            raise Unrunnable("node が無い")
        self.p = subprocess.Popen([node, "-e", FAKE_JS], stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                                  text=True, encoding="utf-8")

    def _ask(self, **q):
        self.p.stdin.write(json.dumps(q, ensure_ascii=False) + "\n")
        self.p.stdin.flush()
        line = self.p.stdout.readline()
        if not line:
            raise Unrunnable("偽の画面（node）が止まった")
        return json.loads(line)

    def eval(self, expr):
        r = self._ask(op="eval", expr=expr)
        if not r["ok"]:
            # 本物の cdp.Tab.js と同じく、ページの中の例外は RuntimeError
            raise RuntimeError("js: " + r["error"])
        return r["value"]

    def setup(self, **spec):
        self._ask(op="setup", spec=spec)

    def escape(self):
        self._ask(op="escape")

    def state(self):
        return self._ask(op="state")["value"]

    def close(self):
        self.p.stdin.close()
        self.p.wait(10)


class FakeTab:
    """`_menu` / `logged_in` が使うぶんだけの cdp.Tab。押すのは本物と同じく「要素を返す JS の式」を受けて、無ければ RuntimeError"""

    def __init__(self, page):
        self.page = page

    def js(self, expr, await_promise=False):
        return self.page.eval(expr)

    def click(self, selector_js):
        if not self.page.eval(f"(() => {{ const e = {selector_js}; if (!e) return false; __press(e); return true; }})()"):
            raise RuntimeError(f"not found: {selector_js[:120]}")

    def key(self, key, code=None, vk=None):
        if key == "Escape":
            self.page.escape()

    def url(self):
        return "https://chatgpt.com/c/fake"


class _NoSleep:
    """chatgpt.py の `time` の代わり。待ちだけ飛ばす（本物の画面の描き直しを待つ秒は、偽の画面では要らない）"""

    @staticmethod
    def sleep(_s):
        return None

    def __getattr__(self, name):
        return getattr(time, name)


def load(src: str, tag: str):
    """chatgpt.py の字（src）を読み込んだモジュールを返す。cdp は同じ置き場に写して解く"""
    d = Path(tempfile.mkdtemp(prefix=f"cgmenu-{tag}-"))
    try:
        (d / "chatgpt.py").write_text(src, encoding="utf-8")
        shutil.copy(CDP, d / "cdp.py")
        sys.path.insert(0, str(d))
        sys.modules.pop("cdp", None)
        spec = importlib.util.spec_from_file_location(f"chatgpt_{tag}", d / "chatgpt.py")
        mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)
    finally:
        if str(d) in sys.path:
            sys.path.remove(str(d))
        shutil.rmtree(d, ignore_errors=True)
    mod.time = _NoSleep()
    return mod


# ------------------------------------------------------------------ 足

NAME_CASES = [
    ("Rename\nR", "Rename"),
    ("Rename", "Rename"),
    ("Rename project\nP", "Rename project"),
    ("\n  Rename  \n  ⌘R\n", "Rename"),
    ("", ""),
    (None, ""),
]


def leg_name_of(cg, page):
    got = [page.eval(f"{cg.NAME_OF}({{innerText: {json.dumps(text)}}})") for text, _ in NAME_CASES]
    want = [w for _, w in NAME_CASES]
    return got == want, f"{got}（欲しいのは {want}）"


def _menu_leg(cg, page, items, want_item):
    """items の右上メニューで _menu(t, "Rename") を押す。want_item が None なら RuntimeError を待つ"""
    page.setup(items=items)
    t = FakeTab(page)
    try:
        ret = cg._menu(t, "Rename")
        err = None
    except RuntimeError as e:
        ret, err = None, str(e)
    clicked = page.state()["clicked"]
    if want_item is None:
        ok = err is not None and "Rename" in err and clicked == ["Chat actions"]
        return ok, f"例外 {err!r:.80}・押したもの {clicked}"
    ok = err is None and ret == "Chat actions" and clicked == ["Chat actions", want_item]
    return ok, f"戻り値 {ret!r}・押したもの {clicked}" + (f"・例外 {err!r:.120}" if err else "")


def leg_hint(cg, page):
    return _menu_leg(cg, page, ["Share\nS", "Rename\nR", "Move to project\nM", "Archive\nA", "Delete\n⌘⌫"], "Rename\nR")


def leg_plain(cg, page):
    return _menu_leg(cg, page, ["Share", "Rename", "Move to project", "Archive", "Delete"], "Rename")


def leg_prefix_only(cg, page):
    return _menu_leg(cg, page, ["Rename project\nP", "Archive\nA"], None)


def leg_prefix_first(cg, page):
    return _menu_leg(cg, page, ["Rename project\nP", "Rename\nR", "Archive\nA"], "Rename\nR")


def leg_logged_in(cg, page):
    got = []
    for buttons in ([], ["Log in"], ["Log in\nL"]):
        page.setup(buttons=buttons)
        got.append(cg.logged_in(FakeTab(page)))
    return got == [True, False, False], f"{got}（欲しいのは [True, False, False]）"


LEGS = {
    "name_of": leg_name_of,
    "hint": leg_hint,
    "plain": leg_plain,
    "prefix_only": leg_prefix_only,
    "prefix_first": leg_prefix_first,
    "logged_in": leg_logged_in,
}

# ------------------------------------------------------------------ 対照（守りを1つずつ外す）

CUTS = {
    # 直す前の比べ方: innerText 全体を trim して完全一致 → 鍵の字つきの項目が見つからない
    "whole_text": (r'''NAME_OF = "(e => (e.innerText || '').trim().split('\\n')[0].trim())"''',
                   r'''NAME_OF = "(e => (e.innerText || '').trim())"''',
                   ["name_of", "hint", "prefix_first", "logged_in"]),
    # 押す側だけ直す前の比べ方 → 集める側では在るのに押せない
    "press_whole": ("].find(e => {NAME_OF}(e) === {json.dumps(name)})",
                    "].find(e => (e.innerText || '').trim() === {json.dumps(name)})",
                    ["hint", "prefix_first", "logged_in"]),
    # 集める側だけ直す前の比べ方 → 在るのに「無い」と判断する
    "list_whole": ("].map({NAME_OF})", "].map(e => (e.innerText || '').trim())", ["hint", "prefix_first"]),
    # 押す側を前方一致に → 上にある "Rename project" を押す
    "prefix": ("{NAME_OF}(e) === {json.dumps(name)}", "{NAME_OF}(e).startsWith({json.dumps(name)})", ["prefix_first"]),
}


def run_leg(cg, page, leg):
    try:
        ok, why = LEGS[leg](cg, page)
    except Unrunnable:
        raise
    except Exception as e:  # 足の中で何が落ちても、その足が落ちたとして数える
        ok, why = False, f"{type(e).__name__}: {e}"
    unknown = page.state()["unknown"]
    if unknown:
        raise Unrunnable(f"足 {leg}: 偽の画面が知らない探し方をされた {unknown[:3]}（chatgpt.py の探し方が変わった。FAKE_JS を足す）")
    return ok, why


def main() -> int:
    src = (SKILL / "chatgpt.py").read_text(encoding="utf-8")
    try:
        page = Page()
    except Unrunnable as e:
        print(f"回せない: {e}")
        return 2
    try:
        real = load(src, "real")
        bad = 0
        for leg in LEGS:
            ok, why = run_leg(real, page, leg)
            print(f"{'○' if ok else '×'} {leg}: {why}", flush=True)
            bad += not ok
        if bad:
            return 1
        for name, (old, _new, _legs) in CUTS.items():
            if src.count(old) != 1:
                print(f"対照 {name}: 外す字が chatgpt.py に1か所だけ無い（{src.count(old)}か所）: {old[:60]!r}")
                return 2
        # 対照: 外した守りの足が落ちること（落ちなければ、その足は何も見ていない）
        for name, (old, new, legs) in CUTS.items():
            cut = load(src.replace(old, new), name)
            fell = []
            for leg in legs:
                ok, why = run_leg(cut, page, leg)
                fell.append(not ok)
                print(f"  対照 {name} / {leg}: {'落ちた（よい）' if not ok else '通ってしまった'} — {why}", flush=True)
            if not all(fell):
                bad += 1
        return 1 if bad else 0
    except Unrunnable as e:
        print(f"回せない: {e}")
        return 2
    finally:
        page.close()


if __name__ == "__main__":
    sys.exit(main())
