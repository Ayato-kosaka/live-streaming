/**
 * **キーボードだけで島を一周できるか**と、**読み上げで意味が通るか**を、
 * 書き出した面ぜんぶで数える。
 *
 *   tools/build.sh 3209
 *   python3 -m http.server 4209 --directory site/.next-3209 &
 *   DIST=site/.next-3209 SPORT=4209 node tools/sprites/reachkeys.mjs
 *
 *   ONLY=/cards,/map     面を絞る
 *   LIST=1               見つけたものを面ごとに全部並べる（既定は上から30件）
 *   BREAK=noring         わざと1本の足を抜く（対照が落ちる。下の表）
 *
 * 終了コード: **0＝通った / 1＝見つかった / 2＝数えるものが無い**
 * （対照が外れた・面が0枚・開けなかった面がある・React の印が1つも無い）。
 * **`| tail` を挟まない**——終了コードが消える。
 *
 * ## 誰も指摘していない面なので、分母を先に出す
 *
 * 「違反0件」は、**見ていないから0件**かもしれない（`docs/island-standards.md` §15）。
 * だからこの道具は、見つけた数より先に
 * **何面・何個の押せるもの・何回の Tab・何枚の絵を見たか**を出す。
 * 分母が 0 の足があったら、数字を出さずに 2 で落ちる。
 *
 * ## 数える8つ
 *
 * | 印 | 何を見るか |
 * | --- | --- |
 * | `とどかない` | 押せば何か起きるのに、Tab で到達できない |
 * | `わからない` | Tab で止まったのに、画面が1画素も変わらない（いまどこにいるか見えない） |
 * | `じゅんばん` | `tabindex` が正（並びを書き換える）／Tab が画面の上へ大きく飛び戻る |
 * | `とじこめ` | 出ているダイアログが Esc で閉じない |
 * | `なまえ` | Tab で止まれるのに、読み上げる名前が無い（絵だけのボタン） |
 * | `え` | `<img>` に `alt` が無い／`alt="画像"` のように中身を言っていない |
 * | `みだし` | 見出しの段が飛んでいる（h1 のつぎに h3） |
 * | `おなじ字` | 同じ字のリンクが、別の行き先を指している |
 *
 * **`reachwatch.mjs` と名前が近いが、重なりは1つも無い。** あちらは**指**
 * （押しどころの覆い・48px割れ）。こちらは**キーボードと読み上げ**。
 * どちらも `selftest.yml` の自分の job から毎 PR で走る（2026-10-15 / #883）。
 *
 * ## 「押せる」をどう見分けるか
 *
 * React は手当て（`onClick`）を付けた DOM に `__reactProps$…` を生やす。
 * そこを読む——**`addEventListener` で付けたものは見えない**ので、
 * **島ぜんぶで React の印が1つも見つからなかったら 2 で落ちる**
 * （0件が「手当てが無い」なのか「読めていない」なのか、区別がつかなくなるため）。
 * 素の `onclick=` 属性（対照の台がそれ）と、`role="button"` のような
 * 押せると名乗っている印も足す。
 *
 * ## 「到達できた」をどう見分けるか
 *
 * **実際に Tab を押して歩く。** `tabindex` の字面から推し量らない——
 * 隠れている・`disabled`・親が `inert`、どれも字面では出ない。
 *
 * 押せるものが Tab の行き先に出てこなくても、次のどちらかなら**届いている**:
 *
 * - **先祖が Tab で止まれる** … 押すと泡が上がるので、同じ手当てが動く
 * - **中に、Tab で止まれて押せるもの（`a[href]` / `button` / `summary` /
 *   `onClick` 持ち）がある** … Enter がそこで click を起こし、泡が親まで上がる
 *
 * ## 畳みは開いてから歩く
 *
 * 閉じた `<details>` と `content-visibility: auto` の中は、閉じたままだと
 * Tab の行き先に出てこない（`CLAUDE.md`「畳んだままの中を数えない」）。
 * 歩く前に全部開いて、いちばん下まで送る。
 *
 * ## 対照（`reachkeysfix/`）
 *
 * 本物の面に当てる前に、壊し方を1枚に1つずつ植てた台を1周する。
 * **1つでも外したら、本物の面の数字を1つも出さずに 2 で落ちる。**
 *
 *   BREAK=nopress  押せるのに届かないものを見ない
 *   BREAK=noring   フォーカスの見え方を見ない
 *   BREAK=noorder  Tab の順を見ない
 *   BREAK=notrap   Esc で閉じるかを見ない
 *   BREAK=noname   読み上げる名前を見ない
 *   BREAK=noalt    絵の `alt` を見ない
 *   BREAK=nohead   見出しの段を見ない
 *   BREAK=nodup    同じ字のリンクを見ない
 *   BREAK=nofold   畳みを開かずに歩く（**直す前の姿**。畳みの中が届かないのに 0件 になる）
 *   BREAK=noretry  止まった面を取り直さない（「一度だけ止まる面」が開けないままになる）
 *   BREAK=noreopen 止まったタブを捨てずに使い回す（「止まった次の面」が1回目に開けない。#963 の姿）
 */
import { chromium } from "playwright-core";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { dirname, extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { fromRoot } from "./repo.mjs";
import { discover, checkAgainstSitemap } from "./islepages.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const SPORT = process.env.SPORT || "4321";
const BASE = `http://localhost:${SPORT}`;
const DIST = fromRoot(process.env.DIST || "site/.next-verify");
const WIDTH = parseInt(process.env.WIDTH || "390", 10);
const HEIGHT = parseInt(process.env.HEIGHT || "844", 10);
const BREAK = process.env.BREAK || "";
const LIST = process.env.LIST === "1";
const ONLY = (process.env.ONLY || "").split(",").filter(Boolean);
/**
 * Tab を押す上限。
 *
 * **ここで足りないと、届かないものを数えたことにならない。** * 160 にして
 * いたころ、止まれるところが 160個ある `/island/<章>/streams` は一周できず、
 * **面の足にある4本のリンクが「押せるのに Tab で届かない」として挙がった**
 * ——本当は、こちらが途中でやめていただけ（`docs/island-standards.md` §13）。
 * いまは一周しなかった面があれば、数字を出さずに 2 で落ちる。
 */
const MAXTAB = parseInt(process.env.MAXTAB || "900", 10);
/** ダイアログを開かせるために Enter を押してみるボタンの上限（面ごと） */
const MAXOPEN = parseInt(process.env.MAXOPEN || "8", 10);

const skip = {
  press: BREAK === "nopress",
  ring: BREAK === "noring",
  order: BREAK === "noorder",
  trap: BREAK === "notrap",
  name: BREAK === "noname",
  alt: BREAK === "noalt",
  head: BREAK === "nohead",
  dup: BREAK === "nodup",
  fold: BREAK === "nofold",
};

/** この箱から出られない宛先（`crawl.mjs` と同じ）。絵は差し替える */
const STUB = /googleusercontent\.com|ggpht\.com|upload\.wikimedia\.org|instagram\.com|ytimg\.com|youtube\.com|storage\.googleapis\.com/;

/* ── ブラウザの中で走らせる関数たち ───────────────────────────────────
   `page.evaluate` に文字列で渡すので、外の変数を掴まない。1つの塊にまとめて
   おいて、必要な入口だけ呼ぶ。 */
const LIB = () => {
  const W = window;
  if (W.__rk) return W.__rk;

  /** 印を1つずつ付けて、評価をまたいで同じものを指せるようにする */
  let n = 0;
  const mark = (el) => {
    if (!el.dataset.rk) el.dataset.rk = String(++n);
    return el.dataset.rk;
  };

  /* 見えているか。**`getBoundingClientRect` だけでは足りない。**
     閉じた `<details>` の中は、Chromium では箱の大きさが返ってくる
     （実測で 1264x18）。`checkVisibility()` は `content-visibility: hidden`
     の中を false にするので、そちらを先に見る。`content-visibility: auto`
     は**見えている側**に数える（送れば出るし、焦点が当たれば描かれる） */
  const vis = (el) => {
    if (el.checkVisibility && !el.checkVisibility()) return false;
    const cs = getComputedStyle(el);
    if (cs.visibility === "hidden" || cs.display === "none") return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };

  const where = (el) => {
    const t = el.tagName.toLowerCase();
    const c = typeof el.className === "string" && el.className.trim() ? "." + el.className.trim().split(/\s+/).slice(0, 2).join(".") : "";
    const id = el.id ? "#" + el.id : "";
    return t + id + c;
  };

  /**
   * React が生やす手当て。**`addEventListener` は見えない**。
   *
   * `for...in` ではなく `Object.keys`。あちらは原型の鎖まで登るので、
   * 1面 5,000要素 × 約300個の鍵を毎回なめることになる（`/all` で数秒）。
   * React が差す `__reactProps$…` は要素そのものの鍵なので、ここで足りる。
   */
  const reactProps = (el) => {
    for (const k of Object.keys(el)) if (k.startsWith("__reactProps$")) return el[k];
    return null;
  };

  const PRESS_ROLE = /^(button|link|tab|checkbox|radio|switch|menuitem|menuitemcheckbox|menuitemradio|option|combobox|slider|treeitem)$/;

  /** 押せば何か起きるか */
  const pressable = (el) => {
    const p = reactProps(el);
    if (p && (p.onClick || p.onMouseDown || p.onPointerDown || p.onMouseUp || p.onPointerUp)) return "react";
    if (el.onclick) return "onclick";
    const role = (el.getAttribute("role") || "").toLowerCase();
    if (PRESS_ROLE.test(role)) return "role=" + role;
    return "";
  };

  /** Enter で click を起こせる（中に居れば、親の手当ても泡で動く） */
  const activatable = (el) => {
    const t = el.tagName.toLowerCase();
    if (t === "button" || t === "summary") return true;
    if ((t === "a" || t === "area") && el.hasAttribute("href")) return true;
    return !!pressable(el);
  };

  /** 読み上げる名前。完全な算法ではないが、**空かどうか**は十分に出る */
  const accName = (el, depth = 0) => {
    if (depth > 3) return "";
    if (el.getAttribute("aria-hidden") === "true") return "";
    const by = el.getAttribute("aria-labelledby");
    if (by) {
      const t = by
        .split(/\s+/)
        .map((id) => document.getElementById(id))
        .filter(Boolean)
        .map((e) => accName(e, depth + 1))
        .join(" ")
        .trim();
      if (t) return t;
    }
    const lab = (el.getAttribute("aria-label") || "").trim();
    if (lab) return lab;
    const t = el.tagName.toLowerCase();
    if (t === "img") return (el.getAttribute("alt") || "").trim();
    /* 打つ欄は、**自分の中に字を持たない。** 名前は包んでいる `<label>` か
       `label[for]` から来る。ここを `input` だけにしていたころ、
       `<label><span>書くこと</span><textarea/></label>` が
       「名前が無い」に挙がった（実際には読み上げられる） */
    if (t === "input" || t === "textarea" || t === "select") {
      const ty = (el.getAttribute("type") || "").toLowerCase();
      if (t === "input" && (ty === "button" || ty === "submit" || ty === "reset")) return (el.value || "").trim();
      const id = el.id && document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
      if (id) return accName(id, depth + 1);
      const up = el.closest("label");
      if (up) return accName(up, depth + 1);
      return (el.getAttribute("placeholder") || "").trim();
    }
    // 中の字。`aria-hidden` は飛ばし、絵の alt と SVG の <title> を足す
    let out = "";
    const walk = (node) => {
      if (node.nodeType === 3) {
        out += node.nodeValue;
        return;
      }
      if (node.nodeType !== 1) return;
      if (node.getAttribute("aria-hidden") === "true") return;
      const tn = node.tagName.toLowerCase();
      if (tn === "img") {
        out += " " + (node.getAttribute("alt") || "");
        return;
      }
      if (tn === "svg") {
        const ti = node.querySelector("title");
        out += " " + (ti ? ti.textContent : "") + " " + (node.getAttribute("aria-label") || "");
        return;
      }
      const lab2 = node.getAttribute("aria-label");
      if (lab2) {
        out += " " + lab2;
        return;
      }
      for (const ch of node.childNodes) walk(ch);
    };
    for (const ch of el.childNodes) walk(ch);
    // CSS の `content:` で置いた字も読み上げに乗る
    for (const ps of ["::before", "::after"]) {
      const c = getComputedStyle(el, ps).content;
      if (c && c !== "none" && c !== "normal" && /^["']/.test(c)) out += " " + c.slice(1, -1);
    }
    const title = (el.getAttribute("title") || "").trim();
    out = out.replace(/\s+/g, " ").trim();
    return out || title;
  };

  /** 名前として中身のある字か（記号だけ・1文字の飾りは名前ではない） */
  const named = (s) => !!s.replace(/[\s .,:;!?・…‥　\-–—‐/|>＞<＜«»"'“”「」『』()（）[\]{}+*#%]/g, "").length;

  /** 画面の見え方の指紋。**枠が子や擬似要素に出る面がある**ので、下も見る */
  const PROPS = [
    "outlineStyle", "outlineWidth", "outlineColor", "outlineOffset",
    "boxShadow", "backgroundColor", "backgroundImage", "borderColor", "borderWidth",
    "color", "transform", "scale", "filter", "opacity", "textDecorationLine", "fill", "stroke",
  ];
  const one = (el, ps) => {
    let cs;
    try {
      cs = getComputedStyle(el, ps);
    } catch {
      return "";
    }
    let s = "";
    for (const p of PROPS) s += cs[p] + "|";
    return s;
  };
  /* 自分は擬似要素まで見る（`.dish:focus-visible::after` のように、枠を
     `::after` で描いている面がある）。中は本体だけ、24個まで
     （`.nm-go:focus-visible .nm-cc` のように子の塗りが変わる面がある）。
     全部に擬似要素まで当てると、止まるところ155個の面で
     `getComputedStyle` を1万8千回呼ぶことになって、1面で数秒かかった */
  const look = (el) => {
    let s = one(el, null) + one(el, "::before") + one(el, "::after");
    const kids = el.querySelectorAll("*");
    for (let i = 0; i < kids.length && i < 24; i++) s += one(kids[i], null);
    return s;
  };

  W.__rk = { mark, vis, where, reactProps, pressable, activatable, accName, named, look };
  return W.__rk;
};

/**
 * 畳みを開く。**閉じたままの中は Tab の行き先に出てこない**
 * （`CLAUDE.md`「畳んだ中の絵を数えない」と同じ理由）。
 *
 * `content-visibility: auto` の段も開く。あちらは画面の外にいるあいだ
 * 中身の配置を飛ばすので、**中の要素の箱が 0x0 で返る**——そのまま数えると
 * 押せるものも絵も見出しも、画面の下にあるぶんが丸ごと分母から消える。
 * 焦点が当たればブラウザが描くので、**届くかどうかの話としては「見えている」
 * が正しい。** 送って回る代わりに、その場で開いてしまう。
 */
const OPENFOLDS = () => {
  let n = 0;
  for (const d of document.querySelectorAll("details:not([open])")) {
    d.open = true;
    n++;
  }
  const st = document.createElement("style");
  st.id = "rk-unfold";
  /* ついでに**動きを止める。** 島は毎フレーム描き直しているので、
     測っているあいだ絵が走り続けると、4コアの箱では面を1枚開くだけで
     何秒も持っていかれる（並列で作業していると load average が40を超える）。
     止めても、届くかどうか・名前があるかどうかは1つも変わらない。
     CSS だけでは足りない——島は rAF で動かしているので、そちらも止める
     （`CLAUDE.md`「島を止めてから撮る」と同じ手） */
  st.textContent = "*{content-visibility:visible !important;animation:none !important;transition:none !important;}";
  document.head.appendChild(st);
  window.requestAnimationFrame = () => 0;
  window.scrollTo(0, 0);
  return n;
};

/** 押せるものと、絵と、見出しと、リンクを集める */
const COLLECT = () => {
  const { mark, vis, where, pressable, accName, named } = window.__rk;
  const press = [];
  /* React の印が、この面でいくつ見つかったか。**0 ばかりなら読めていない**。
     要素を2度なめないよう、押せるものと同じ1周で数える */
  let react = 0;
  for (const el of document.querySelectorAll("*")) {
    for (const k of Object.keys(el)) {
      if (k.startsWith("__reactProps$")) { react++; break; }
    }
    const how = pressable(el);
    if (!how) continue;
    if (!vis(el)) continue;
    if (el.closest("[aria-hidden='true'],[inert]")) continue;
    press.push({ rk: mark(el), how, at: where(el), name: accName(el).slice(0, 40) });
  }
  const imgs = [];
  for (const im of document.querySelectorAll("img")) {
    const role = (im.getAttribute("role") || "").toLowerCase();
    imgs.push({
      at: where(im),
      src: (im.getAttribute("src") || "").split("/").pop().slice(0, 50),
      has: im.hasAttribute("alt"),
      alt: (im.getAttribute("alt") || "").trim(),
      deco: role === "presentation" || role === "none" || im.getAttribute("aria-hidden") === "true",
    });
  }
  const heads = [...document.querySelectorAll("h1,h2,h3,h4,h5,h6")]
    .filter((h) => vis(h))
    .map((h) => ({ lv: +h.tagName[1], t: (h.textContent || "").replace(/\s+/g, " ").trim().slice(0, 30) }));
  const links = [];
  for (const a of document.querySelectorAll("a[href]")) {
    if (!vis(a)) continue;
    if (a.closest("[aria-hidden='true']")) continue;
    const nm = accName(a).replace(/\s+/g, " ").trim();
    if (!named(nm)) continue;
    /* **切らずに持つ。** 40字で切って突き合わせていたころ、頭の40字だけ
       同じで続きが違う配信の題名（「…パート1／2／3」）が
       「同じ字が3か所」に化けた。切るのは出すときだけ */
    links.push({ name: nm, href: a.getAttribute("href") });
  }
  const dialogs = [...document.querySelectorAll("[role='dialog'],[aria-modal='true'],dialog[open]")]
    .filter((d) => vis(d))
    .map((d) => ({ rk: mark(d), at: where(d) }));
  return { press, imgs, heads, links, dialogs, react };
};

/**
 * Tab の行き先を、**面の中で控える。**
 *
 * 1回押すたびに外から読みに行くと、往復だけで面1枚あたり何秒もかかる
 * （160回 Tab する面で実測 33秒／1面）。`focusin` を1つ仕掛けておいて
 * **押すだけ押してから、まとめて1度だけ読む。**
 */
const WATCH = () => {
  const { mark, where, look, accName, named } = window.__rk;
  const log = [];
  const seen = new Set();
  window.__rkLog = log;
  window.__rkLeft = 0;
  document.addEventListener(
    "focusin",
    () => {
      const el = document.activeElement;
      if (!el || el === document.body || el === document.documentElement) return;
      const rk = mark(el);
      if (seen.has(rk)) {
        log.push({ rk, again: true });
        return;
      }
      seen.add(rk);
      const r = el.getBoundingClientRect();
      const nm = accName(el).replace(/\s+/g, " ").trim();
      log.push({
        rk,
        at: where(el),
        name: nm.slice(0, 40),
        named: named(nm),
        look: look(el),
        top: Math.round(r.top + window.scrollY),
        tag: el.tagName.toLowerCase(),
        ti: el.getAttribute("tabindex"),
      });
    },
    true,
  );
  // 面の外（ブラウザの枠）へ出た＝一周した
  document.addEventListener("focusout", (e) => { if (!e.relatedTarget) window.__rkLeft++; }, true);
};

/** 控えを読む。`left` は「面の外へ出た回数」＝一周した印 */
const READLOG = () => ({
  log: window.__rkLog.map((x) => (x.again ? { rk: x.rk, again: true } : x)),
  left: window.__rkLeft,
});

/** Tab を離したあとの見え方を、同じものについてもう一度読む */
const BLURRED = (rks) => {
  const { look } = window.__rk;
  if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
  const out = {};
  for (const rk of rks) {
    const el = document.querySelector(`[data-rk="${rk}"]`);
    if (el) out[rk] = look(el);
  }
  return out;
};

/* ── 面を1枚見る ──────────────────────────────────────────────────── */
async function visit(p, base, path) {
  let status = 0;
  let why = "";
  for (let i = 0; i < 2; i++) {
    try {
      const r = await p.goto(base + path, { waitUntil: "domcontentloaded", timeout: 45000 });
      status = r ? r.status() : 0;
      break;
    } catch (e) {
      why = String(e).slice(0, 80);
      if (i === 0) await p.waitForTimeout(1000);
    }
  }
  if (status !== 200) return { open: false, why: why || `HTTP ${status}` };

  /* ── 水あわせ（hydration）が終わるまで待つ ─────────────────────────
     **ここを待たずに数えると、押せるものが丸ごと消える。**
     `/all` を 700ms で数えた回は「押せる 143個」、箱が混んでいた回は
     **「押せる 1個」**だった（実測: 300ms で 88要素、700ms で 1,201要素）。
     押せるものはほとんどが React の手当てなので、水あわせの途中で数えると
     **「とどかない 0件」が黙って出る**（`docs/island-standards.md` §15）。

     決まった時間を待つのではなく、**数が2回つづけて同じになるまで**待つ。
     Next の面かどうかは `self.__next_f` で分かる（対照の台には無い）ので、
     素の HTML はそのまま通す。終わらなければ**面ごと「見ていない」に送る。** */
  /* 見るのは2段。**軽いほうを何度も、重いほうを2度だけ。**
     全要素をなめる数えかたを30回まわすと、絵が500枚ある面では数えるだけで
     何秒もかかる。`<body>` に React の印が付くのは根が水あわせを終えた
     合図なので（実測: 300ms で付かず、700ms で付く）、そこまでは軽いほうで
     待って、**そのあとに全部を2回数えて同じ数になることを見る。** */
  const MARK = () => ({
    next: Array.isArray(self.__next_f),
    body: Object.keys(document.body).some((k) => k.startsWith("__react")),
  });
  const HYD = () => {
    let n = 0;
    for (const el of document.querySelectorAll("*"))
      for (const k of Object.keys(el)) { if (k.startsWith("__reactProps$")) { n++; break; } }
    return n;
  };
  const mark = await p.evaluate(`(${MARK.toString()})()`);
  if (mark.next) {
    let rooted = mark.body;
    for (let i = 0; i < 40 && !rooted; i++) {
      await p.waitForTimeout(150);
      rooted = (await p.evaluate(`(${MARK.toString()})()`)).body;
    }
    if (!rooted) return { open: false, why: "水あわせが始まらない（<body> に React の印が付かない）" };
    let n = await p.evaluate(`(${HYD.toString()})()`);
    let ok = false;
    for (let i = 0; i < 12; i++) {
      await p.waitForTimeout(200);
      const m = await p.evaluate(`(${HYD.toString()})()`);
      if (m > 0 && m === n) { ok = true; break; }
      n = m;
    }
    if (!ok) return { open: false, why: `水あわせが終わらない（React の手当て ${n}個のまま）` };
  }
  await p.waitForTimeout(200);

  await p.evaluate(`(${LIB.toString()})()`);
  const folds = skip.fold ? 0 : await p.evaluate(`(${OPENFOLDS.toString()})()`);
  await p.waitForTimeout(250);
  await p.evaluate(`(${LIB.toString()})()`);
  const got = await p.evaluate(`(${COLLECT.toString()})()`);

  /* ── Tab で歩く ──────────────────────────────────────────────────
     字面から推し量らず、**実際に押す**。上から入りたいので、まず
     いちばん上の見えない所に焦点を戻してから始める */
  await p.evaluate(() => {
    window.scrollTo(0, 0);
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
  });
  await p.evaluate(`(${WATCH.toString()})()`);
  /* **20回ずつまとめて押して、そのあと1度だけ読む。**
     1回ごとに読みに行くと往復だけで面1枚 33秒かかった（実測） */
  let stops = [];
  let wrapped = false;
  for (let i = 0; i < MAXTAB; i += 20) {
    for (let k = 0; k < 20 && i + k < MAXTAB; k++) await p.keyboard.press("Tab");
    const { log, left } = await p.evaluate(`(${READLOG.toString()})()`);
    stops = log.filter((x) => !x.again);
    // 一周した＝面の外へ出たか、1つめへ戻ってきたか
    if (left > 0) { wrapped = true; break; }
    if (log.length && log[0].rk && log.slice(1).some((x) => x.rk === log[0].rk)) { wrapped = true; break; }
  }
  const blurred = stops.length ? await p.evaluate(`(${BLURRED.toString()})(${JSON.stringify(stops.map((s) => s.rk))})`) : {};

  /* ── 押せるのに届かないもの ────────────────────────────────────────
     **ここで出しておく。** 下のダイアログ探しは Enter を押すので、面が
     入れ替わると `data-rk` の印ごと消える。あとで数えると、入れ替わった面
     だけ黙って「0件」になる（`docs/island-standards.md` §15） */
  const okpress = skip.press
    ? []
    : (await p.evaluate(`(${UNREACHED.toString()})(${JSON.stringify(stops.map((s) => s.rk))})`)).map(
        (rk) => got.press.find((q) => q.rk === rk) || { rk, how: "?", at: "?", name: "" },
      );

  /* ── ダイアログが Esc で閉じるか ───────────────────────────────────
     出ているものを見る。出ていなければ、**押すと出るもの**を探す
     （行き先へ飛ばない `button` / `role=button` だけに Enter を当てる） */
  const dialogs = [];
  /* Esc を押して、**閉じるまで待つ。**
     閉じるのは React が描き直してからなので、決め打ちの待ちだと混んだ箱で
     「閉じない」に化ける（`MapZoom` は Esc の手当てを持っているのに、
     load average 40 の回だけ7面で赤くなった。`docs/island-standards.md` §13）。

     **「節点が消えたか」で見ない。「まだダイアログか」で見る。**
     React は開いた姿と閉じた姿が同じ札（どちらも `<div>`）なら、
     **同じ DOM の節点を使い回して属性だけ書き替える**（`MapZoom` が
     `div.mzoom-sheet` → `div.mzoom`）。消えるのを待つと、閉じているのに
     「残っている・大きさもある」と読めて、**Esc が効いている7面が
     赤くなっていた**（2026-10-15 の実測。`docs/island-misses.md` #265。これが2度目の同じ誤り）。
     `role` / `aria-modal` / `<dialog open>` が落ちていれば、閉じている。 */
  const check = async (d) => {
    await p.keyboard.press("Escape");
    const closed = () =>
      p.evaluate((rk) => {
        const el = document.querySelector(`[data-rk="${rk}"]`);
        if (!el || !el.isConnected) return true;
        const isDialog =
          (el.getAttribute("role") || "").toLowerCase() === "dialog" ||
          el.getAttribute("aria-modal") === "true" ||
          (el.tagName === "DIALOG" && el.hasAttribute("open"));
        if (!isDialog) return true;
        const cs = getComputedStyle(el);
        if (cs.display === "none" || cs.visibility === "hidden") return true;
        const r = el.getBoundingClientRect();
        return r.width === 0 || r.height === 0;
      }, d.rk);
    let gone = false;
    for (let i = 0; i < 10 && !gone; i++) {
      await p.waitForTimeout(150);
      gone = await closed();
    }
    dialogs.push({ at: d.at, gone });
  };
  for (const d of got.dialogs) await check(d);
  if (!skip.trap) {
    const keys = stops.filter((s) => s.tag === "button" || (s.tag !== "a" && s.ti !== null)).slice(0, MAXOPEN);
    for (const s of keys) {
      const ok = await p.evaluate((rk) => {
        const el = document.querySelector(`[data-rk="${rk}"]`);
        if (!el || !el.isConnected) return false;
        el.focus();
        return document.activeElement === el;
      }, s.rk);
      if (!ok) continue;
      await p.keyboard.press("Enter");
      await p.waitForTimeout(100);
      if (!p.url().endsWith(path)) {
        await p.goto(base + path, { waitUntil: "domcontentloaded", timeout: 30000 });
        await p.waitForTimeout(500);
        await p.evaluate(`(${LIB.toString()})()`);
        break;
      }
      const open = await p.evaluate(() => {
        const { mark, vis, where } = window.__rk;
        const d = [...document.querySelectorAll("[role='dialog'],[aria-modal='true'],dialog[open]")].filter(vis)[0];
        return d ? { rk: mark(d), at: where(d) } : null;
      });
      if (open) {
        await check(open);
        // 1枚見つかれば、この面のダイアログの作りは分かる。残りは押さない（時間）
        break;
      }
    }
  }

  return { open: true, folds, got, stops, blurred, wrapped, dialogs, okpress };
}

/* ── 見つけたものを並べる ────────────────────────────────────────── */
/** `alt` が、その絵が何なのかを言っていない字 */
const JUNK_ALT = /^(画像|イメージ|写真|しゃしん|絵|図|アイコン|ロゴ|マーク|バナー|サムネ(イル)?|image|img|photo|picture|pic|icon|logo|banner|thumb(nail)?|graphic|undefined|null|none|spacer)$/i;

function findings(v) {
  const f = [];

  /* とどかない — 押せるのに Tab で止まれない。
     先祖が止まれる（泡で同じ手当てが動く）／中に押せて止まれるものがある、
     のどちらかなら届いている。
     **一周していない面では数えない**——こちらが途中でやめたせいで、
     まだ回っていない先が全部「届かない」に化ける（§13） */
  if (!skip.press && v.wrapped) {
    for (const q of v.okpress) f.push({ kind: "とどかない", t: `押せるのに Tab で届かない（${q.how}）: ${q.at}${q.name ? " 「" + q.name + "」" : ""}` });
  }

  /* わからない — 止まったのに画面が1画素も変わらない */
  if (!skip.ring) {
    for (const s of v.stops) {
      const b = v.blurred[s.rk];
      if (b === undefined) continue;
      if (b === s.look) f.push({ kind: "わからない", t: `Tab で止まるのに、見た目が変わらない: ${s.at}${s.name ? " 「" + s.name + "」" : ""}` });
    }
  }

  /* じゅんばん — `tabindex` が正（並びを書き換える）／画面の上へ大きく飛び戻る。
     正でない限り Tab は DOM の順に進むので、**飛び戻りは「DOM の並びが
     画面の並びと違う」ときだけ出る。** 1.5画面ぶんを超えた戻りだけ数える
     （少し戻るのは段組みでふつうに起きる） */
  if (!skip.order) {
    for (const s of v.stops) {
      const ti = s.ti === null ? 0 : parseInt(s.ti, 10);
      if (ti > 0) f.push({ kind: "じゅんばん", t: `tabindex="${s.ti}" が並びを書き換えている: ${s.at}` });
    }
    for (let i = 1; i < v.stops.length; i++) {
      const back = v.stops[i - 1].top - v.stops[i].top;
      if (back > HEIGHT * 1.5)
        f.push({
          kind: "じゅんばん",
          t: `Tab が画面の上へ ${Math.round(back)}px 飛び戻る: ${v.stops[i - 1].at} → ${v.stops[i].at}`,
        });
    }
  }

  /* とじこめ — 出ているダイアログが Esc で閉じない */
  if (!skip.trap) for (const d of v.dialogs) if (!d.gone) f.push({ kind: "とじこめ", t: `ダイアログが Esc で閉じない: ${d.at}` });

  /* なまえ — 止まれるのに読み上げる名前が無い */
  if (!skip.name) for (const s of v.stops) if (!s.named) f.push({ kind: "なまえ", t: `Tab で止まるのに、読み上げる名前が無い: ${s.at}` });

  /* え — `alt` が無い／中身を言っていない */
  if (!skip.alt)
    for (const im of v.got.imgs) {
      if (im.deco) continue;
      if (!im.has) f.push({ kind: "え", t: `alt が無い: ${im.at} ← ${im.src}` });
      else if (im.alt && (JUNK_ALT.test(im.alt) || /\.(png|jpe?g|webp|svg|gif|avif)$/i.test(im.alt)))
        f.push({ kind: "え", t: `alt がその絵を言っていない（alt="${im.alt}"）: ${im.at}` });
    }

  /* みだし — 段が飛んでいる */
  if (!skip.head) {
    let prev = 0;
    for (const h of v.got.heads) {
      if (prev && h.lv > prev + 1) f.push({ kind: "みだし", t: `見出しの段が h${prev} から h${h.lv} へ飛んでいる: 「${h.t}」` });
      prev = h.lv;
    }
  }

  /* おなじ字 — 同じ字のリンクが別の行き先を指している */
  if (!skip.dup) {
    const by = new Map();
    for (const l of v.got.links) {
      if (!by.has(l.name)) by.set(l.name, new Set());
      by.get(l.name).add(l.href);
    }
    for (const [nm, hrefs] of by)
      if (hrefs.size > 1)
        f.push({
          kind: "おなじ字",
          t: `「${nm.slice(0, 40)}${nm.length > 40 ? "…" : ""}」が ${hrefs.size} か所ちがう先を指している: ${[...hrefs].slice(0, 4).join(" , ")}${hrefs.size > 4 ? " …" : ""}`,
        });
  }

  return f;
}

/**
 * 押せるのに届かないものを選り分ける（ブラウザの中で、先祖と中を見る）。
 *
 * **届いていないように見えて、正しいものが3つある。** どれも外す:
 *
 * 1. **効かなくしてある**（`disabled` / `aria-disabled`）… いま押せないので、
 *    Tab の列から外れているのが正しい。`/map` の「ひとつ前の国」が
 *    はじめの1件目でこれだった（まだ1カ国目なので戻れない）
 * 2. **札の持ち回し**（`role="tab"` などで、いま選ばれている1枚だけが
 *    `tabindex=0`。残りは矢印で動く）… 同じ役の仲間が1つでも届いていれば、
 *    その並びには届いている
 * 3. **先祖か中に、届いて押せるものがある** … 泡で同じ手当てが動く（下）
 */
const UNREACHED = (reached) => {
  const { pressable, activatable } = window.__rk;
  const hit = new Set(reached);
  const ROVE = /^(tab|option|menuitem|menuitemcheckbox|menuitemradio|radio|treeitem|gridcell)$/;
  const out = [];
  for (const el of document.querySelectorAll("[data-rk]")) {
    const rk = el.dataset.rk;
    if (hit.has(rk)) continue;
    const how = pressable(el);
    if (!how) continue;
    if (el.disabled || el.getAttribute("aria-disabled") === "true" || el.closest("[inert]")) continue;
    const role = (el.getAttribute("role") || "").toLowerCase();
    if (ROVE.test(role)) {
      const mates = [...document.querySelectorAll(`[role="${role}"][data-rk]`)];
      if (mates.some((m) => hit.has(m.dataset.rk))) continue;
    }
    // 先祖が止まれるなら、泡で同じ手当てが動く
    let up = el.parentElement;
    let ok = false;
    while (up) {
      if (up.dataset.rk && hit.has(up.dataset.rk)) { ok = true; break; }
      up = up.parentElement;
    }
    if (ok) continue;
    // 中に、止まれて押せるものがあるなら、そこから泡が上がる
    for (const kid of el.querySelectorAll("[data-rk]")) {
      if (hit.has(kid.dataset.rk) && activatable(kid)) { ok = true; break; }
    }
    if (ok) continue;
    out.push(rk);
  }
  return out;
};

/* ── 回す ─────────────────────────────────────────────────────────── */
/** 1x1 の透明な PNG。絵の代わりに返す（生死は見ないので中身は何でもよい） */
const PX = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

const b = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--no-sandbox"],
});

function fail(msg) {
  console.log(msg);
  return b.close().then(() => process.exit(2));
}

/** 1枚にかける上限（ミリ秒）。切れたら、その面を名指しして取り直しに回す */
const PAGE_MS = Number(process.env.PAGE_MS || 120000);
/** 対照の台は小さいので、5秒で止まったとみなす */
const CTL_MS = Number(process.env.CTL_MS || 5000);

/**
 * 約束に砂時計を付ける。**切れたら投げる。**
 * `page.evaluate()` には時間切れが無いので、描画の手が固まると永久に帰ってこない
 * （`reachwatch.mjs` の同じ名前の関数と同じ。#944）。
 */
function withDeadline(pr, ms, what) {
  let t;
  const bell = new Promise((_, no) => {
    t = setTimeout(() => no(new Error(`${what} が ${Math.round(ms / 1000)}秒 返ってこない`)), ms);
  });
  return Promise.race([Promise.resolve(pr).finally(() => clearTimeout(t)), bell]);
}
const short = (e) => String(e?.message || e).split("\n")[0].slice(0, 120);

/** 捨てる。閉じるのにも砂時計を付ける（固まったタブは閉じるのも遅い） */
async function discard(thing) {
  try { await withDeadline(thing.close(), 15000, "閉じる"); return true; } catch { return false; }
}

async function newCtx() {
  const ctx = await b.newContext({ viewport: { width: WIDTH, height: HEIGHT } });
  /* **絵は、いちばん小さいもの1枚で返す。**
     ここが見るのは `alt` の字と、Tab で届くかどうか。絵が描けているかを
     見るのは `crawl.mjs` の仕事で、こちらは1枚も判定しない。
     `/island/<章>/streams` には `<img>` が497枚あって、本物を配ると
     面を開くだけで何秒もかかる（この箱は4コアで、いつも誰かが使っている）。
     箱の大きさは `width`/`height` が持っているので、並びは崩れない。 */
  await ctx.route(/\.(png|jpe?g|webp|gif|avif|ico|bmp)(\?|$)/i, (r) => r.fulfill({ status: 200, contentType: "image/png", body: PX }));
  await ctx.route(STUB, (r) => r.fulfill({ status: 200, contentType: "image/png", body: PX }));
  await ctx.route(/fonts\.googleapis\.com/, (r) => r.fulfill({ status: 200, contentType: "text/css", body: "" }));
  return ctx;
}

/**
 * 1枚を砂時計つきで見る。戻り: `visit()` の答え、または `{ stall: 理由 }`。
 *
 * `visit()` が「開けなかった」と返しても、理由が Playwright の失敗
 * （時間切れ・`Page crashed`・タブが外れた）なら、それは**止まった側**。
 * 404 や「水あわせが終わらない」は面の答えなので、そのまま返す。
 */
async function guarded(p, base, path, ms) {
  try {
    const v = await withDeadline(visit(p, base, path), ms, path);
    if (!v.open && /Timeout|crash|detached|closed|Target/i.test(v.why)) return { stall: short(v.why) };
    return v;
  } catch (e) {
    return { stall: short(e) };
  }
}

/**
 * 面の並びを1枚ずつ歩く。**本物の面と対照の台が、同じこれを通る。**
 *
 * ## 1枚が止まったら（2026-10-23。#963）
 *
 * CI で `/me` のあと `/me/desk` の `goto` が45秒×2回切れ、**同じタブを
 * 使い回したので残り43面がぜんぶ `Page crashed`** になった（直近100回のうち5回、
 * 5回とも同じ所）。1面の事故で43面ぶんの数字が消えていた。だから:
 *
 *   1. 止まったタブは捨てて、**次の面は新しいタブで開く**（`BREAK=noreopen` で外れる）
 *   2. 止まった面は、**新しい入れ物で1回だけ**取り直す（`BREAK=noretry` で外れる）。
 *      2回目も止まったら「開けなかった面」に名指しで積む（→ 2 で落ちる）
 *   3. **取り直した面は、緑の回でも印字する**（Actions では `::warning::` にも出す）
 *
 * ## 面が開いた別窓は、その面を見終わったら閉じる
 *
 * `/me` の「YouTubeでログイン」に Enter を当てると（ダイアログ探しは押すと出る
 * ものを探して Enter を押す）、CI では Google の入口が**別窓で開く。**
 * この箱では `apis.google.com` に届かないので開かず、ここが CI と手元の違いとして
 * 残っている（#963 が CI でだけ起きる理由の、いちばん近い候補。まだ確かめていない）。
 * 開いた別窓をそのまま次の面へ持ち越さないように閉じて、**何枚閉じたかを出す。**
 *
 * 戻り: { per, unseen, sum, retried, popped }
 */
async function sweep(base, pages, { quiet = false, ms = PAGE_MS } = {}) {
  const ctx = await newCtx();
  let p = await ctx.newPage();
  const per = new Map();
  const unseen = [];
  const retried = [];
  const popped = [];
  const sum = { press: 0, stops: 0, imgs: 0, links: 0, heads: 0, folds: 0, react: 0, dialogs: 0, nowrap: [] };
  for (const page of pages) {
    /* 見る前から在ったタブ（捨てそこねた古いタブを含む）は、別窓に数えない */
    const had = new Set(ctx.pages());
    let v = await guarded(p, base, page, ms);
    if (v.stall) {
      const why = v.stall;
      console.log(`!! ${page} で止まりました: ${why}`);
      /* **止まったタブで次の面を開かない**（#963 の43面はこれで消えた） */
      if (BREAK !== "noreopen") {
        await discard(p);
        p = await ctx.newPage();
      }
      if (BREAK === "noretry") {
        v = { open: false, why: `止まった（${why}）` };
      } else {
        const c2 = await newCtx();
        try {
          const v2 = await guarded(await c2.newPage(), base, page, ms);
          if (v2.stall) {
            v = { open: false, why: `1回目: ${why} / 取り直し: ${v2.stall}` };
            console.log(`!! ${page} は、取り直しても返ってきません: ${v2.stall}`);
          } else {
            v = v2;
            retried.push({ page, why });
            console.log(`↻ ${page} は、新しい入れ物で取り直して見られました（1回目: ${why}）`);
          }
        } finally {
          await discard(c2);
        }
      }
    }
    /* 面が開いた別窓（ログインの入口など）を、次の面へ持ち越さない */
    for (const extra of ctx.pages()) {
      if (extra === p || had.has(extra)) continue;
      popped.push(page);
      await discard(extra);
    }
    if (!v.open) {
      unseen.push(`${page}（${v.why}）`);
      continue;
    }
    sum.press += v.got.press.length;
    sum.stops += v.stops.length;
    sum.imgs += v.got.imgs.length;
    sum.links += v.got.links.length;
    sum.heads += v.got.heads.length;
    sum.folds += v.folds;
    sum.react += v.got.react;
    sum.dialogs += v.dialogs.length;
    if (!v.wrapped) sum.nowrap.push(page);
    per.set(page, { v, f: findings(v) });
    if (!quiet) {
      const f = per.get(page).f;
      console.log(`${f.length ? "NG" : "ok"} ${page}  押せる${v.got.press.length} / 止まれた${v.stops.length} / 絵${v.got.imgs.length}` + (f.length ? "\n      " + f.slice(0, LIST ? 9999 : 30).map((x) => x.t).join("\n      ") + (!LIST && f.length > 30 ? `\n      … ほか ${f.length - 30} 件（LIST=1 で全部）` : "") : ""));
    }
  }
  await discard(p);
  await discard(ctx);
  return { per, unseen, sum, retried, popped };
}

/* ── 対照が先。落ちたら本物の面の数字は出さない ────────────────────── */
const FIXTURES = [
  ["/ok.html", []],
  ["/nopress.html", ["とどかない"]],
  ["/blind.html", ["わからない"]],
  ["/order.html", ["じゅんばん"]],
  ["/esc.html", ["とじこめ"]],
  /* 閉じても**同じ節点が残る**ダイアログ（React の使い回し）。**拾ってはいけない。**
     消えるのを待つ測りかただと、Esc の効いている `MapZoom` の7面が赤くなる */
  ["/escswap.html", []],
  ["/noname.html", ["なまえ"]],
  ["/badalt.html", ["え"]],
  ["/skiphead.html", ["みだし"]],
  ["/samename.html", ["おなじ字"]],
  /* 畳みの中にしか無い「押せるのに届かないもの」。**開いて歩いて初めて出る。**
     `BREAK=nofold` で開くのをやめると、ここが落ちる＝直す前の姿 */
  ["/fold.html", ["とどかない"]],
  /* 中に押せるボタンが在る `div onclick`。**拾ってはいけない**
     （Enter がボタンで click を起こし、泡が親まで上がる） */
  ["/bubble.html", []],
  /* いま効かなくしてあるボタン。**拾ってはいけない**（押せないのだから、
     Tab の列から外れているのが正しい。これが1件目の偽の赤だった） */
  ["/disabled.html", []],
  /* 包んだ `<label>` から名前が来る欄。**拾ってはいけない**
     （欄そのものは字を持たないが、読み上げには名前が出る） */
  ["/label.html", []],
  /* 札の持ち回し（選ばれた1枚だけが止まる）。**拾ってはいけない** */
  ["/rove.html", []],
  /* 同じ形で、**どれも止まれない**並び。持ち回しの見のがしを止める */
  ["/rovedead.html", ["とどかない"]],
];

{
  const dir = join(HERE, "reachkeysfix");
  const TYPES = { ".html": "text/html; charset=utf-8", ".png": "image/png", ".md": "text/plain" };
  /* **返ってこない面の対照。** 何回目に何を返すかは、ここが持つ
       /once.html   … 1回目だけ stall.html、2回目からは calm.html
       /always.html … 何回でも stall.html
       /after.html  … calm.html。**止まった面のすぐ次に置く**（立て直しを見る） */
  const asked = new Map();
  const STALL = { "once.html": (n) => (n === 1 ? "stall.html" : "calm.html"), "always.html": () => "stall.html", "after.html": () => "calm.html" };
  const srv = createServer(async (req, res) => {
    let name = decodeURIComponent(req.url.split("?")[0]).replace(/^\/+/, "");
    if (STALL[name]) {
      const n = (asked.get(name) || 0) + 1;
      asked.set(name, n);
      name = STALL[name](n);
    }
    try {
      const body = await readFile(join(dir, name));
      res.writeHead(200, { "content-type": TYPES[extname(name)] || "application/octet-stream" });
      res.end(body);
    } catch {
      res.writeHead(404, { "content-type": "text/plain" });
      res.end("no");
    }
  });
  await new Promise((r) => srv.listen(0, "127.0.0.1", r));
  const cbase = `http://127.0.0.1:${srv.address().port}`;
  const got = await sweep(cbase, FIXTURES.map(([f]) => f), { quiet: true });
  /* 止まる台は、本物と同じ `sweep()` に流す。always → once → after の順に
     1つのタブで歩くので、「止まったタブを使い回したか」が after に必ず出る */
  const st = await sweep(cbase, ["/always.html", "/once.html", "/after.html"], { quiet: true, ms: CTL_MS });
  srv.close();
  console.log("── 対照（わざと壊した台を、拾えるか／拾わずにいられるか）");
  let miss = 0;
  for (const [page, want] of FIXTURES) {
    const e = got.per.get(page);
    const kinds = [...new Set((e?.f || []).map((x) => x.kind))].sort();
    const ok = e && kinds.join(",") === [...want].sort().join(",");
    if (!ok) miss++;
    console.log(`  ${ok ? "○" : "×"} ${page.padEnd(16)} 拾ってほしい[${want.join(",") || "なし"}] / 拾った[${kinds.join(",") || "なし"}]` + (e ? "" : " ← 開けなかった"));
  }
  /* **一周できたかの見分けが生きているか。** ここが壊れると、本物の面で
     「まだ回っていない先」が全部「届かない」に化ける（`/island/<章>/streams`
     の4本が実際にそれだった）。台はどれも小さいので、必ず一周する */
  if (got.sum.nowrap.length) {
    miss++;
    console.log(`  × 一周の見分けが効いていない（台 ${got.sum.nowrap.length}枚 が一周しなかった: ${got.sum.nowrap.join(" , ")}）`);
  } else {
    console.log(`  ○ 台 ${FIXTURES.length}枚とも、Tab で一周して戻ってきた`);
  }
  /* 返ってこない面の3件。**止まる台が1回目に本当に止まったか**まで見る
     （止まらない台で「取り直しが効いた」と言っても、何も守っていない） */
  const unseenOf = (pg) => st.unseen.some((u) => u.startsWith(pg));
  const retriedOf = (pg) => st.retried.some((r) => r.page === pg);
  const stallChecks = [
    ["何度でも止まる面 /always.html", "名指しで「開けなかった」に積む", unseenOf("/always.html")],
    ["一度だけ止まる面 /once.html", "取り直して見られた", !unseenOf("/once.html") && retriedOf("/once.html") && (asked.get("once.html") || 0) >= 2],
    ["止まった次の面 /after.html", "1回目で見られた（止まったタブを使い回していない）", !unseenOf("/after.html") && !retriedOf("/after.html")],
  ];
  for (const [name, want, ok] of stallChecks) {
    if (!ok) miss++;
    console.log(`  ${ok ? "○" : "×"} ${name.padEnd(30)} ${want}`);
  }
  const total = FIXTURES.length + stallChecks.length;
  console.log(`  対照 ${total}件中 ${total - miss}件 一致${BREAK ? `（BREAK=${BREAK}）` : ""}`);
  if (got.unseen.length) console.log(`  開けなかった対照: ${got.unseen.join(" , ")}`);
  if (miss) await fail(`\n対照が ${miss}件 外れた。**本物の面の数字は出さない。**（docs/island-standards.md §15）`);
}

/* ── 本物の面 ─────────────────────────────────────────────────────── */
const everyPage = discover(DIST);
if (!everyPage.length) await fail(`\n${DIST} に面が無い。先に書き出してください（tools/build.sh）。`);
const sm = checkAgainstSitemap(DIST);
if (!sm.ok) await fail(`\n面の一覧が sitemap より少ない（${sm.why || sm.missing.join(" , ")}）。歩き方が壊れている。`);

const pages = (ONLY.length ? everyPage.filter((x) => ONLY.includes(x)) : everyPage).map((x) => (x === "/" ? "/index.html" : x + ".html"));
console.log(`\n── 面を歩く（幅 ${WIDTH}px・${pages.length}面）`);
const { per, unseen, sum, retried, popped } = await sweep(BASE, pages);
await b.close();

/* **取り直した面は、緑の回でも出す。** 同じ面が毎回ここに出るなら、たまたまではない */
console.log(`\n取り直した面 ${retried.length}件（1回目に止まり、新しい入れ物で1回だけ見直せたもの）`);
for (const r of retried) {
  console.log(`  ↻ ${r.page}  1回目: ${r.why}`);
  if (process.env.GITHUB_ACTIONS) console.log(`::warning::reachkeys: ${r.page} は1回目に止まり、取り直して見た（${r.why}）`);
}
console.log(`別窓を閉じた面 ${popped.length}件${popped.length ? `: ${[...new Set(popped)].join(" , ")}` : ""}`);

if (unseen.length) {
  console.log(`\n開けなかった面が ${unseen.length} 件あります。**下の数字は当てになりません**:`);
  for (const u of unseen) console.log("  - " + u);
}

console.log(`\n── 数えたもの（幅 ${WIDTH}px）`);
console.log(`  見た面                        ${per.size} / ${pages.length}`);
console.log(`  押せるもの                    ${sum.press}個`);
console.log(`  Tab で止まれたところ           ${sum.stops}個`);
console.log(`  開いた畳み                    ${sum.folds}個${skip.fold ? "（BREAK=nofold。**開いていない**）" : ""}`);
console.log(`  見た絵（<img>）               ${sum.imgs}枚`);
console.log(`  見た見出し                    ${sum.heads}個`);
console.log(`  見たリンク（名前のあるもの）     ${sum.links}本`);
console.log(`  Esc を当てたダイアログ          ${sum.dialogs}枚`);
console.log(`  React の手当てが見えた要素      ${sum.react}個`);
if (sum.nowrap.length) console.log(`  ${MAXTAB}回 Tab しても一周しなかった面  ${sum.nowrap.length}面: ${sum.nowrap.slice(0, 6).join(" , ")}${sum.nowrap.length > 6 ? " …" : ""}`);

/* 分母が 0 の足があったら、数字を出さずに落ちる（§15）。
   **React の印が1つも見えないのがいちばん危ない**——押せるものの大半が
   React の手当てなので、見えないと「とどかない 0件」が自動で出る */
const empty = [];
if (!sum.react) empty.push("React の手当てが1つも見えない（__reactProps$ が読めていない。押せるものを数えられない）");
if (!sum.press) empty.push("押せるものが1つも見つからない");
if (!sum.stops) empty.push("Tab で1度も止まれない（キーボードが効いていない）");
if (!skip.alt && !sum.imgs) empty.push("絵が1枚も無い");
if (!skip.head && !sum.heads) empty.push("見出しが1つも無い");
if (unseen.length) empty.push(`開けなかった面が ${unseen.length} 件ある`);
/* **一周しなかった面は、届かないものを数えていない。** 0件に混ぜない。
   `MAXTAB=` を上げてもう一度回す（`docs/island-standards.md` §15） */
if (sum.nowrap.length)
  empty.push(`${MAXTAB}回 Tab しても一周しなかった面が ${sum.nowrap.length} 件ある（MAXTAB= を上げる）: ${sum.nowrap.join(" , ")}`);
if (empty.length) {
  console.log("\n数えるものが無い:");
  for (const e of empty) console.log("  - " + e);
  process.exit(2);
}

const byKind = new Map();
for (const e of per.values()) for (const x of e.f) byKind.set(x.kind, (byKind.get(x.kind) || 0) + 1);
const total = [...byKind.values()].reduce((a, c) => a + c, 0);
console.log("\n── 見つけたもの");
for (const k of ["とどかない", "わからない", "じゅんばん", "とじこめ", "なまえ", "え", "みだし", "おなじ字"])
  console.log(`  ${k.padEnd(8)} ${byKind.get(k) || 0}件`);
console.log(`  ${"あわせて".padEnd(8)} ${total}件（${[...per.values()].filter((e) => e.f.length).length} 面）`);
process.exit(total ? 1 : 0);
