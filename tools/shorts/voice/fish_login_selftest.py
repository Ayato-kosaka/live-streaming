"""**fish.audio に入っているかの判定と、「Googleで続行」の探しかた（`fish_login.py`）の見張り。EC2 にも fish.audio にも触らない。**

    python3 tools/shorts/voice/fish_login_selftest.py
    BREAK=logo python3 tools/shorts/voice/fish_login_selftest.py   # 守りを1つ外した版で回す（対照の子）

終了コード 0=通った / 1=落ちた / **2=数えるものが無い・外す字が見つからない**（`docs/island-standards.md` §15）。
回し役（`python/selftest_runner.py`）が `tools/shorts/` を降りて拾う。要るのは Python だけ。
頭なしの Chrome（`chrome-headless-shell`。`/opt/pw-browsers` か `$CHROME`）があれば、偽の画面に**本物の
`OUTLINE`（画面から写し取る JS）**も当てる（`.js` の足）。無い箱では `.js` の足と、JS だけを外す対照を回さない（そう出す）。

## なぜ要るか（2026-11-11）

ログインが切れた日に `fish_login.py` が止まった。`https://fish.audio/ja/` に「ログイン」が無くなり、「Googleで続行」は
**字の無いアイコンのボタン**（名前は `aria-label` だけ）になっていた。前の作りは innerText の一致で探し、入っているかも
「ログイン」の字が無いことで見ていたので、字が変わるたびに止まる。直した作りは、入っているかを**画面自身が
api.fish.audio に送る要求の返事**（`authorization` の見出しの有無と状態コード）で決め、押す相手は名前（aria-label まで）か
G のロゴの色で探す。ここでは、その2つを偽の要求と偽の画面で当てる。

偽の画面は 2026-11-11 に本物の `/ja/app/` で写した形（入っている・入っていない・ログインの窓）を縮めたもの。
偽の要求は同じ日に CDP で見た並び（入っている画面は見出し付きが20本ほど・入っていない画面は見出し無しが3本・
切れた札は `GET /user/self` が 401）。

| 足 | 確かめること |
| --- | --- |
| `page_out` | 入っていない画面: 入口（右上の「ログイン」）が見つかる・ログインした人のリンクは0（`display:none` のものは数えない）・窓の外の「Google Play」は押さない |
| `page_dialog` | 今日の窓: 字の無い Google のボタン（aria-label・ロゴ）を押す。GitHub・Apple は押さない |
| `page_label` | ロゴの色が無くても（単色のアイコン）、aria-label「Google で続行」で見つかる |
| `page_logo` | 名前が消えても、G のロゴの4色で見つかる（色は小文字でも） |
| `page_no_google` | 窓に Google が無ければ、窓の外の「Google で続行」の字のリンクは押さない |
| `page_in` | 入っている画面: ログインした人のリンク（`/app/team/` など）を数え、入口は無い |
| `api_in` / `api_out` | 入っている／入っていない画面が送る要求の並びで、in / out |
| `api_expired` | 2026-11-11 の本物の `~/cdp-fish`: `/user/self` が 401（ほかに見出し付きの 200 が1本あっても）→ out |
| `api_self_wins` | `/user/self` が 200 なら、ほかの要求に 401 があっても in |
| `api_expired_noself` | `/user/self` が無く、見出し付きに 401 が混ざれば out |
| `api_no_self` | `/user/self` の道が変わっても、見出し付きの 2xx で in（見出しの字の大小も問わない） |
| `api_unloaded` | api.fish.audio の返事が無いときだけ画面のリンクを見る。リンクも無ければ unknown |
| `api_beats_screen` | 返事があれば画面より返事を信じる（入口の字が見えていても in・古いリンクが残っていても out） |

## 守りを1つずつ外す（§15「対照は、足の数だけ用意する」）

`CUTS` が `fish_login.py` の**本物の字**を1か所だけ書き換えた写しで足を全部回し、**外した守りの足だけが落ちる**ことを
確かめる。外す字が本物に見つからなければ 2 で落ちる。
"""

from __future__ import annotations

import glob
import html
import importlib.util
import json
import os
import re
import subprocess
import sys
import tempfile
from html.parser import HTMLParser
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
SKILL = ROOT / ".claude" / "skills" / "ec2-chrome"   # cdp.py・google_login.py（頭は標準の道具だけで読める）
BREAK = os.environ.get("BREAK", "")

G_LOGO = ('<svg viewBox="0 0 20 21" aria-hidden="true"><path d="M4 11" fill="{a}"></path><path d="M10 5" fill="{b}"></path>'
          '<path d="M10 16" fill="{c}"></path><path d="M19 10" fill="{d}"></path></svg>')
LOGO_UP = G_LOGO.format(a="#FBBC05", b="#EA4335", c="#34A853", d="#4285F4")
LOGO_LOW = G_LOGO.format(a="#fbbc05", b="#ea4335", c="#34a853", d="#4285f4")
MONO = '<svg viewBox="0 0 22 22" aria-hidden="true"><path d="M11 1" fill="currentColor"></path></svg>'
HEADER_OUT = ('<header><a href="/ja/app/">Fish Audio</a><button aria-label="テーマ">' + MONO + '</button>'
              '<button id="entry" class="rounded-full">ログイン</button></header>')
NAV_OUT = ('<nav><a href="/ja/app/">ホーム</a><a href="/ja/app/voice-library/">ボイスライブラリ</a>'
           '<a href="/ja/app/text-to-speech/">音声を生成する</a><a href="/ja/plan/">今すぐアップグレード</a>'
           '<a href="/ja/app/help/">サポート</a><a href="/ja/app/team/" style="display:none">チーム設定</a></nav>')
FOOT = '<footer><a href="https://play.google.com/store/apps">Google Play で入手</a></footer>'


def dialog(google: str) -> str:
    return ('<div role="dialog" data-state="open"><h2>すべての機能を有効化</h2>'
            '<p>ログインまたは<button type="button">新規登録</button>して、ボイス生成を心ゆくまでお楽しみください</p>'
            '<button><span class="sr-only">閉じる</span></button>'
            '<input type="email" name="email" aria-label="メールアドレス">'
            '<button type="submit">メールアドレスで続行</button>' + google +
            '<button id="gh" type="button" aria-label="GitHub で続行">' + MONO + '</button>'
            '<button id="ap" type="button" aria-label="Appleで続ける">' + MONO + '</button>'
            '<a href="/ja/terms/">サービス利用規約</a></div>')


# 名前 → (偽の画面の body, 確かめ)。確かめは outline と fish_login のモジュールを受けて [(何を, 合否)] を返す
PAGES = {
    "page_out": (HEADER_OUT + NAV_OUT + '<main><a href="/ja/app/create-voice/">ボイスを作成</a></main>' + FOOT,
                 lambda o, m: [("入口（右上の「ログイン」）が見つかる", (m.find_entry(o) or {}).get("id") == "entry"),
                               ("ログインした人のリンクは0（隠れたものは数えない）", m.account_links(o) == 0),
                               ("窓の外の「Google Play」は押さない", m.find_google(o) is None)]),
    "page_dialog": (HEADER_OUT + NAV_OUT + dialog('<button id="g" type="button" aria-label="Googleで続行"><span>'
                                                  + LOGO_UP + '</span></button>') + FOOT,
                    lambda o, m: [("字の無い「Googleで続行」を押す", (m.find_google(o) or {}).get("id") == "g")]),
    "page_label": (HEADER_OUT + dialog('<button id="g" type="button" aria-label="Google で続行">' + MONO + '</button>'),
                   lambda o, m: [("単色のアイコンでも aria-label で見つかる", (m.find_google(o) or {}).get("id") == "g")]),
    "page_logo": (HEADER_OUT + dialog('<button id="g" type="button">' + LOGO_LOW + '</button>'),
                  lambda o, m: [("名前が無くても G のロゴの色で見つかる", (m.find_google(o) or {}).get("id") == "g")]),
    "page_no_google": (HEADER_OUT + '<section><a id="promo" href="/ja/app/?via=google">Google で続行して特典を受け取る</a></section>'
                       + dialog(''),
                       lambda o, m: [("窓に Google が無ければ、窓の外のリンクは押さない", m.find_google(o) is None)]),
    "page_in": ('<header><a href="/ja/app/">Fish Audio</a><button>My Team Plus</button></header>'
                '<nav><a href="/ja/app/">ホーム</a><a href="/ja/app/my-voices/">カスタムボイス</a>'
                '<a href="/ja/app/generation-history/">音声生成履歴</a><a href="/ja/app/team/?tab=plans">お支払い</a>'
                '<a href="/ja/app/team/">チーム設定</a><a href="/ja/app/billing/">今すぐアップグレード</a>'
                '<a href="/ja/app/support/">サポート</a></nav>',
                lambda o, m: [("ログインした人のリンクを数える", m.account_links(o) >= 4),
                              ("入口は無い", m.find_entry(o) is None)]),
}


class _Tree(HTMLParser):
    """偽の画面を木にする。`OUTLINE`（JS）と同じ形の写しを Python でも作り、ブラウザの無い箱でも判定を当てる"""
    VOID = {"input", "img", "br", "hr", "meta", "link"}

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.root = {"tag": "#root", "attrs": {}, "kids": [], "up": None}
        self.cur = self.root

    def handle_starttag(self, tag, attrs):
        n = {"tag": tag, "attrs": {k: (v or "") for k, v in attrs}, "kids": [], "up": self.cur}
        self.cur["kids"].append(n)
        if tag not in self.VOID:
            self.cur = n

    def handle_startendtag(self, tag, attrs):
        self.cur["kids"].append({"tag": tag, "attrs": {k: (v or "") for k, v in attrs}, "kids": [], "up": self.cur})

    def handle_endtag(self, tag):
        n = self.cur
        while n is not self.root and n["tag"] != tag:
            n = n["up"]
        if n is not self.root:
            self.cur = n["up"]

    def handle_data(self, data):
        self.cur["kids"].append(data)


def _walk(n):
    for k in n["kids"]:
        if isinstance(k, dict):
            yield k
            yield from _walk(k)


def _hidden(n) -> bool:
    while n is not None:
        a = n.get("attrs", {})
        if "hidden" in a or re.search(r"display\s*:\s*none", a.get("style", "")):
            return True
        n = n["up"]
    return False


def _text(n) -> str:
    out = []
    for k in n["kids"]:
        if isinstance(k, str):
            out.append(k)
        elif not _hidden(k):
            out.append(_text(k))
    return "".join(out)


def outline_py(body: str) -> list:
    t = _Tree()
    t.feed(body)
    nodes = list(_walk(t.root))
    dialogs = [n for n in nodes if (n["attrs"].get("role") in ("dialog", "alertdialog") or (n["tag"] == "dialog" and "open" in n["attrs"]))
               and not _hidden(n)]
    out = []
    for n in nodes:
        a = n["attrs"]
        if not ((n["tag"] == "a" and "href" in a) or n["tag"] == "button" or a.get("role") == "button") or _hidden(n):
            continue
        sub = list(_walk(n))
        name = " ".join(x for x in [a.get("aria-label"), a.get("title"), _text(n)] + [s["attrs"].get("alt") for s in sub if s["tag"] == "img"] if x)
        inside = False
        for d in dialogs:
            p = n
            while p is not None and p is not d:
                p = p["up"]
            inside = inside or p is d
        out.append({"tag": n["tag"], "id": a.get("id") or a.get("data-testid") or "", "href": a.get("href", ""),
                    "name": re.sub(r"\s+", " ", name).strip()[:80],
                    "fills": sorted({s["attrs"]["fill"].upper() for s in sub if "fill" in s["attrs"]}),
                    "dialog": inside, "x": 0, "y": 0})
    return out


# ---------------------------------------------------------------- 頭なしの Chrome（あれば）

def find_chrome() -> str | None:
    cands = [os.environ.get("CHROME", "")]
    for pat in ("/opt/pw-browsers/chromium_headless_shell-*/chrome-headless-shell-linux64/chrome-headless-shell",
                os.path.expanduser("~/.cache/ms-playwright/chromium_headless_shell-*/chrome-headless-shell-linux64/chrome-headless-shell")):
        cands += sorted(glob.glob(pat), reverse=True)
    for c in cands:
        if c and os.access(c, os.X_OK):
            try:
                if outline_js("<button>x</button>", "(() => 1)()", c) == 1:
                    return c
            except Exception:
                continue
    return None


def outline_js(body: str, expr: str, chrome: str):
    """偽の画面の最後で expr を評価し、--dump-dom で吐かせた DOM から結果を拾う"""
    page = ('<!doctype html><html><head><meta charset="utf-8"></head><body>' + body +
            '<pre id="__out"></pre><script>document.getElementById("__out").textContent = JSON.stringify(' + expr +
            ');</script></body></html>')
    with tempfile.TemporaryDirectory() as td:
        p = Path(td) / "page.html"
        p.write_text(page, encoding="utf-8")
        r = subprocess.run([chrome, "--no-sandbox", "--disable-gpu", "--window-size=1280,900", f"--user-data-dir={td}/udd",
                            "--dump-dom", p.as_uri()], capture_output=True, text=True, timeout=30, check=False)
    m = re.search(r'<pre id="__out">(.*?)</pre>', r.stdout, re.S)
    if not m:
        raise RuntimeError(f"dump-dom に結果が無い（rc={r.returncode}）")
    return json.loads(html.unescape(m.group(1)))


# ---------------------------------------------------------------- 偽の要求（CDP の Network の出来事）

def ev(rid, method, path, auth, status, header="authorization"):
    url = "https://api.fish.audio" + path + "?team=abc"
    headers = {"accept": "application/json", **({header: "Bearer <偽>"} if auth else {})}
    return [{"method": "Network.requestWillBeSent", "params": {"requestId": rid, "type": "Fetch",
                                                               "request": {"url": url, "method": method, "headers": headers}}},
            {"method": "Network.responseReceived", "params": {"requestId": rid, "response": {"url": url, "status": status}}}]


def evs(*rows):
    out = [{"method": "Network.requestWillBeSent", "params": {"requestId": "doc", "type": "Document",
                                                              "request": {"url": "https://fish.audio/ja/app/", "method": "GET", "headers": {}}}}]
    for i, r in enumerate(rows):
        out += ev(f"r{i}", *r)
    return out


LOGGED_IN = evs(("OPTIONS", "/user/self", False, 200), ("GET", "/pricing/plans", False, 200), ("GET", "/user/self", True, 200),
                ("OPTIONS", "/team", False, 200), ("GET", "/team", True, 200), ("GET", "/wallet/abc/package", True, 200),
                ("PATCH", "/user/self/config/locale", True, 200))
LOGGED_OUT = evs(("GET", "/pricing/plans", False, 200), ("GET", "/tutorials/", False, 200), ("GET", "/tutorials/tags", False, 200))


def facts(m, events, links=0):
    f = m.api_facts(events)
    f["account_links"] = links
    return f


API_LEGS = {
    "api_in": lambda m: [("入っている画面の要求 → in", m.judge(facts(m, LOGGED_IN)) == "in")],
    "api_out": lambda m: [("見出しの無い要求だけ → out", m.judge(facts(m, LOGGED_OUT)) == "out")],
    "api_expired": lambda m: [("/user/self が 401（見出し付きの 200 が1本あっても）→ out", m.judge(facts(m, evs(
        ("GET", "/pricing/plans", False, 200), ("GET", "/tutorials/", False, 200), ("GET", "/user/self", True, 401),
        ("GET", "/model", True, 200)))) == "out")],
    "api_self_wins": lambda m: [("/user/self が 200 なら、ほかに 401 があっても in", m.judge(facts(m, evs(
        ("GET", "/user/self", True, 200), ("GET", "/enterprise/contract", True, 401), ("GET", "/team", True, 200)))) == "in")],
    "api_expired_noself": lambda m: [("/user/self が無く、見出し付きに 401 が混ざる → out", m.judge(facts(m, evs(
        ("GET", "/model", True, 200), ("GET", "/team", True, 401)))) == "out")],
    "api_no_self": lambda m: [("/user/self の道が変わっても、見出し付きの 2xx で in（見出しが Authorization でも）", m.judge(facts(m, evs(
        ("GET", "/user/whoami", True, 200, "Authorization"), ("GET", "/team", True, 200, "Authorization")))) == "in")],
    "api_unloaded": lambda m: [("返事が無く、リンクも無い → unknown", m.judge(facts(m, evs())) == "unknown"),
                               ("返事が無く、ログインした人のリンクがある → in", m.judge(facts(m, evs(), links=3)) == "in")],
    "api_beats_screen": lambda m: [("返事が入っているなら、リンクが見えなくても in", m.judge(facts(m, LOGGED_IN, links=0)) == "in"),
                                   ("返事が入っていないなら、古いリンクが残っていても out", m.judge(facts(m, LOGGED_OUT, links=5)) == "out")],
}

# 外す守り: 名前 → (本物の字, 書き換えた字, 落ちるはずの足, 何を外すか, JS だけか)
CUTS: dict[str, tuple[str, str, set[str], str, bool]] = {
    "auth": ('"auth": any(k.lower() == "authorization" for k in (r.get("headers") or {}))', '"auth": True',
             {"api_out", "api_beats_screen"}, "authorization の見出しの有無を見ない（見出しの無い 200 も入っている扱い）", False),
    "self": ('        if f.get("self") is not None:\n', '        if False:\n', {"api_self_wins"},
             "/user/self の返事で決めない", False),
    "no401": ('"in" if f.get("authed_ok") and not f.get("authed_401") else "out"', '"in" if f.get("authed_ok") else "out"',
              {"api_expired_noself"}, "見出し付きの 401（切れた札）を見ない", False),
    "api_first": ('    if f.get("api"):\n', '    if False:\n',
                  {"api_in", "api_out", "api_expired", "api_self_wins", "api_expired_noself", "api_no_self", "api_beats_screen"},
                  "要求の返事で決めず、画面のリンクだけで決める", False),
    "logo": ("GOOGLE_FILLS & {f.upper() for f in e.get(\"fills\") or []}) >= 3", "GOOGLE_FILLS & {f.upper() for f in e.get(\"fills\") or []}) >= 5",
             {"page_logo", "page_logo.js"}, "G のロゴの色で見分けない", False),
    "scope": ("    if hit or inside:\n", "    if hit:\n", {"page_no_google", "page_no_google.js"},
              "窓に Google が無いとき、窓の外のリンクまで探す", False),
    "href": ("(team|my-voices|generation-history|assets|billing)", "(nothing-here)", {"page_in", "page_in.js"},
             "ログインした人にしか出ないリンクを数えない", False),
    "aria": ("[e.getAttribute('aria-label'), e.getAttribute('title'), e.innerText,", "[e.getAttribute('title'), e.innerText,",
             {"page_label.js"}, "画面から名前を写すときに aria-label を拾わない（前の作りと同じく字だけ）", True),
    "vis": (".filter(vis).map(e => {", ".map(e => {", {"page_out.js"}, "画面から写すときに、見えていないものも拾う", True),
}


def load(src: Path):
    """src の fish_login.py を読み込む（cdp・google_login は手元の ec2-chrome の本物。頭は標準の道具だけ）"""
    if str(SKILL) not in sys.path:
        sys.path.insert(0, str(SKILL))
    name = f"fish_login_under_test_{abs(hash(str(src)))}"
    spec = importlib.util.spec_from_file_location(name, src / "fish_login.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def run_legs(src: Path, chrome: str | None, quiet: bool) -> tuple[list[str], int]:
    m = load(src)
    failed, checked = [], 0
    legs = []
    for name, (body, check) in PAGES.items():
        legs.append((name, lambda body=body, check=check: check(outline_py(body), m)))
        if chrome:
            legs.append((name + ".js", lambda body=body, check=check: check(outline_js(body, m.OUTLINE, chrome), m)))
    legs += [(name, lambda fn=fn: fn(m)) for name, fn in API_LEGS.items()]
    for name, fn in legs:
        try:
            res = fn()
        except Exception as e:  # 足の中で落ちたら、その足の負け
            res = [(f"例外: {e!r}"[:160], False)]
        checked += len(res)
        if any(not ok for _, ok in res):
            failed.append(name)
        if not quiet:
            print(f"[{name}]")
            for what, ok in res:
                print(f"  {'○' if ok else '✕'} {what}")
    return failed, checked


def cut_copy(name: str, dst: Path) -> None:
    old, new = CUTS[name][:2]
    text = (HERE / "fish_login.py").read_text(encoding="utf-8")
    if text.count(old) != 1:
        print(f"✕ BREAK={name}: 外す字が fish_login.py に {text.count(old)} か所（1か所のはず）。字を直したら CUTS も直す")
        sys.exit(2)
    (dst / "fish_login.py").write_text(text.replace(old, new), encoding="utf-8")


def child(name: str, chrome: str | None) -> int:
    if name not in CUTS:
        print(f"✕ BREAK={name} という守りは無い（{' / '.join(CUTS)}）")
        return 2
    with tempfile.TemporaryDirectory() as td:
        cut_copy(name, Path(td))
        failed, checked = run_legs(Path(td), chrome, quiet=False)
    print("LEGS_FAILED " + json.dumps(sorted(failed)))
    if checked == 0:
        return 2
    return 1 if failed else 0


def drill(chrome: str | None) -> list[str]:
    print("[対照] 守りを1つずつ外すと、その足だけが落ちるか")
    bad = []
    for name, (_, _, want, why, js_only) in CUTS.items():
        if js_only and not chrome:
            print(f"  - BREAK={name}（{why}）は回さない: 頭なしの Chrome が無いので .js の足が無い")
            continue
        want = want if chrome else {w for w in want if not w.endswith(".js")}
        env = dict(os.environ, BREAK=name, FISH_LOGIN_CHROME=chrome or "")
        r = subprocess.run([sys.executable, str(Path(__file__).resolve())], capture_output=True, text=True,
                           env=env, timeout=300, check=False)
        line = [ln for ln in r.stdout.splitlines() if ln.startswith("LEGS_FAILED ")]
        got = set(json.loads(line[-1][len("LEGS_FAILED "):])) if line else None
        hit = got == want and r.returncode == 1
        print(f"  {'○' if hit else '✕'} BREAK={name}（{why}）→ 落ちた足 "
              f"{sorted(got) if got is not None else '（読めない: ' + (r.stdout + r.stderr).strip()[-200:] + '）'}"
              f"（欲しいのは {sorted(want)}）")
        if not hit:
            bad.append(name)
    return bad


def main() -> int:
    if BREAK:
        # 親が見つけた Chrome をそのまま使う（子ごとに探し直さない）
        return child(BREAK, os.environ.get("FISH_LOGIN_CHROME") or None)
    chrome = find_chrome()
    print(f"頭なしの Chrome: {chrome or '無い（.js の足と、JS だけを外す対照は回さない）'}")
    failed, checked = run_legs(HERE, chrome, quiet=False)
    print()
    bad = drill(chrome)
    print()
    if checked == 0:
        print("✕ 1つも数えなかった。**「通りました」とは言わない**")
        return 2
    if failed or bad:
        if failed:
            print(f"✕ 落ちた足: {' / '.join(failed)}")
        if bad:
            print(f"✕ 対照が外れた: {' / '.join(bad)}（外しても、その足だけが落ちる形になっていない）")
        return 1
    n_legs = len(PAGES) * (2 if chrome else 1) + len(API_LEGS)
    print(f"○ {n_legs}本の足（{checked}件）が通り、守りを1つずつ外すと、その足だけが落ちた")
    return 0


if __name__ == "__main__":
    sys.exit(main())
