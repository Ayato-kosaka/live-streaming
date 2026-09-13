/**
 * 配信で使う3面の**字の濃さ**を撮る（読むのは `inkpx.py`）。
 *
 *   SPORT=4500 TAG=live node tools/sprites/liveink.mjs
 *   python3 tools/sprites/inkpx.py live rl-cand-1920
 *
 * ## なぜ `inkpx.mjs` そのままではないか
 *
 * 2つ足りない。
 *
 * 1. **欄の中の字を測れない。** あちらは文字ノードを辿るので、閉じた
 *    `<select>` の中の `<option>`（箱が 0x0）と、文字ノードですらない
 *    placeholder が落ちる（`mefield.mjs` の注と同じ）。`/me/roulette` は
 *    回る秒数・何周・色・手で足す・Doneru の鍵と、**欄が5つある。**
 * 2. **動いているものを止めていない。** `/roulette` の「TAP TO SPIN」は
 *    opacity 0.45↔0.9 で息をしている。2枚のあいだに値が変われば、差が嘘になる。
 *    `reducedMotion: reduce` で消すと、こんどは**いちばん薄いときを撮らない**。
 *    ここでは `getAnimations()` を**いちばん薄いところで止めてから**撮る。
 *    止めたものは一覧に出す（何を止めたか分からないまま測らない）。
 *
 * 撮り方そのものは `inkpx.mjs` と同じ2枚。1枚目はそのまま、2枚目は
 * **字の色だけ透明**にする。差の出た画素が字の画素。
 * 合否は**中央値**で決める（下位10%で決めない。`CLAUDE.md`）。
 */
import { chromium } from "playwright-core";
import { mkdirSync, writeFileSync } from "fs";
import { offline } from "./route.mjs";
import { apply as liveseed } from "./liveseed.mjs";

const PORT = process.env.SPORT || "4500";
const TAG = process.env.TAG || "live";
const DPR = Number(process.env.DPR || 3);
const OUT = `/tmp/ink/${TAG}`;
mkdirSync(OUT, { recursive: true });

const CAND = encodeURIComponent(
  "トビリシの温泉,ヒッチハイクで隣の国,24時間クッキング,視聴者の家に泊まる,深夜の市場めぐり,サウナ",
);
/* `/roulette` は **OBS の実寸**で測る。390 で測っても、配信に出るのは
   1080p か 720p のほうなので、そこで読めるかが答えにならない。 */
const SCENES = [
  { id: "rl-cand-1920", url: `/roulette.html?candidates=${CAND}`, w: 1920, h: 1080, dpr: 2 },
  { id: "rl-cand-1280", url: `/roulette.html?candidates=${CAND}`, w: 1280, h: 720, dpr: 2 },
  { id: "rl-sess-1920", url: "/roulette.html?s=0123456789abcdef0123456789abcdef", seed: {}, w: 1920, h: 1080, dpr: 2 },
  { id: "rl-spin-1920", url: "/roulette.html?s=0123456789abcdef0123456789abcdef", seed: { spin: true }, wait: 19000, w: 1920, h: 1080, dpr: 2 },
  { id: "me-remote", url: "/me/remote.html", seed: { admin: true }, open: true, w: 390, h: 844, dpr: 3 },
  { id: "me-roulette", url: "/me/roulette.html", seed: { admin: true }, open: true, w: 390, h: 844, dpr: 3 },
  /* **押せるほうの「足す」も測る。** 何も打っていない `.rc-add button` は
     `disabled`（`opacity: .55`）なので、そのまま測ると薄くて当たり前の
     ものを「字が薄い」と報告することになる。打った状態で撮り直す。 */
  {
    id: "me-roulette-typed", url: "/me/roulette.html", seed: { admin: true }, open: true,
    w: 390, h: 844, dpr: 3,
    act: async (p) => {
      await p.fill(".rc-add input:not([type=password])", "サウナに入る");
      await p.fill(".rc-add input[type=password]", "abcdefgh");
      await p.waitForTimeout(400);
    },
  },
];

/**
 * 動くものを止める。止めたものと、**どの時点で止めたか**を返す。
 *
 * **その場で止める。頭に巻き戻さない。**
 * 一度これを `a.currentTime = 0` にして、終わっている結果の札
 * （`rl-pop` は 0% が `opacity:0; scale(0.28)`）を巻き戻してしまい、
 * 札が 0.28 倍のまま輪に重なった絵で測って、**9か所ぜんぶが 4.5 割れ**と
 * 出た。直したいものではなく、**自分の仕掛けが作った絵**だった
 * （`docs/island-standards.md` 13）。
 *
 * 例外は**ずっと息をしている opacity のもの**だけ。あれは「いま何時か」で
 * 濃さが変わるので、止める場所を決めないと測るたびに答えが動く。
 * keyframes を読んで、**いちばん薄いところ**に合わせる（worst case）。
 */
const FREEZE = () => {
  const stopped = [];
  for (const a of document.getAnimations?.() || []) {
    const t = a.effect?.target;
    const tm = a.effect?.getTiming?.() || {};
    const forever = tm.iterations === Infinity;
    let at = "その場";
    if (forever) {
      const kf = a.effect.getKeyframes?.() || [];
      const dim = kf
        .filter((k) => k.opacity !== undefined)
        .reduce((m, k) => (m === null || Number(k.opacity) < Number(m.opacity) ? k : m), null);
      if (dim) {
        const d = Number(tm.duration) || 0;
        a.currentTime = d * (dim.offset ?? 0);
        at = `いちばん薄いところ（opacity ${dim.opacity}）`;
      }
    }
    a.pause();
    stopped.push(
      `${a.animationName || "?"} on ${t?.tagName ? t.tagName.toLowerCase() : "?"}` +
        `${a.effect?.pseudoElement || ""} … ${at}`,
    );
  }
  // 島は rAF で動く。CSS を止めるだけでは足りない（`CLAUDE.md`）
  window.requestAnimationFrame = () => 0;
  return stopped;
};

const COLLECT = () => {
  const out = [];
  const push = (el, t, color, extra = {}) => {
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return;
    out.push({
      t: String(t).slice(0, 24),
      c: el.className?.baseVal ?? (typeof el.className === "string" ? el.className : ""),
      tag: el.tagName,
      color,
      opacity: getComputedStyle(el).opacity,
      size: getComputedStyle(el).fontSize,
      x: r.x + window.scrollX, y: r.y + window.scrollY, w: r.width, h: r.height,
      ...extra,
    });
    el.setAttribute("data-inkmark", String(out.length - 1));
  };

  /* --- 1. 文字ノード（`inkpx.mjs` と同じ辿り方） --- */
  const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const seen = new Set();
  for (let n = walk.nextNode(); n; n = walk.nextNode()) {
    const t = (n.textContent || "").trim();
    if (!t) continue;
    const el = n.parentElement;
    if (!el || seen.has(el)) continue;
    seen.add(el);
    const cs = getComputedStyle(el);
    if (cs.visibility === "hidden" || cs.display === "none" || cs.opacity === "0") continue;
    if (el.checkVisibility?.({ opacityProperty: true, visibilityProperty: true, checkOpacity: true, checkVisibilityCSS: true }) === false) continue;
    const r = el.getBoundingClientRect();
    // 畳んであるものの中身は箱だけ残る。画面に出ていない字を拾わない
    let clipped = false;
    for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
      const ac = getComputedStyle(a);
      if (ac.overflow === "visible" && ac.overflowY === "visible" && ac.overflowX === "visible") continue;
      const ar = a.getBoundingClientRect();
      if (r.bottom <= ar.top + 1 || r.top >= ar.bottom - 1 || r.right <= ar.left + 1 || r.left >= ar.right - 1) { clipped = true; break; }
    }
    if (clipped) continue;
    const svg = el.ownerSVGElement != null || el.tagName === "text";
    push(el, t, svg ? cs.fill : cs.color);
  }

  /* --- 2. 欄の中（`mefield.mjs` の方式。欄そのものを1箱として渡す） --- */
  for (const el of document.querySelectorAll("input, select, textarea")) {
    if (el.offsetParent === null) continue;
    if (el.hasAttribute("data-inkmark")) continue;
    const cs = getComputedStyle(el);
    const t = el.tagName === "SELECT" ? (el.selectedOptions[0]?.textContent || "") : (el.value || el.placeholder || "");
    if (!String(t).trim()) continue;
    push(el, t, cs.color, { field: 1 });
  }
  return out;
};

const b = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--no-sandbox"],
});

for (const sc of SCENES) {
  const dpr = sc.dpr ?? DPR;
  const ctx = await b.newContext({
    viewport: { width: sc.w, height: sc.h },
    deviceScaleFactor: dpr,
    isMobile: sc.w < 700,
    hasTouch: sc.w < 700,
    /* **`reducedMotion` を渡さない。** 渡すと `.rl-hint` の息が規則ごと
       消えて、いちばん薄いところを測れなくなる。止めるのは `FREEZE()`。 */
  });
  await offline(ctx);
  if (sc.seed) await liveseed(ctx, sc.seed);
  const p = await ctx.newPage();
  await p.goto(`http://localhost:${PORT}${sc.url}`, { waitUntil: "networkidle", timeout: 60000 });
  await p.waitForTimeout(sc.wait ?? 2200);
  if (sc.open) {
    await p.evaluate(() => { for (const d of document.querySelectorAll("details")) d.open = true; });
    await p.waitForTimeout(600);
  }
  if (sc.act) await sc.act(p);
  const stopped = await p.evaluate(FREEZE);
  await p.evaluate(() => window.scrollTo(0, 0));
  await p.waitForTimeout(400);
  const boxes = await p.evaluate(COLLECT);
  const full = sc.w < 700;
  await p.screenshot({ path: `${OUT}/${sc.id}.shot.png`, fullPage: full });
  await p.evaluate(() => {
    for (const el of document.querySelectorAll("[data-inkmark]")) {
      el.style.setProperty("color", "transparent", "important");
      el.style.setProperty("text-shadow", "none", "important");
      el.style.setProperty("-webkit-text-stroke-color", "transparent", "important");
      if (el.ownerSVGElement || el.tagName === "text") {
        el.style.setProperty("fill", "transparent", "important");
        el.style.setProperty("stroke", "transparent", "important");
      }
    }
  });
  // placeholder は文字ノードではないので、規則のほうで消す
  await p.addStyleTag({
    content:
      "input,select,textarea{color:transparent !important;text-shadow:none !important}" +
      "input::placeholder,textarea::placeholder{color:transparent !important}",
  });
  await p.waitForTimeout(300);
  await p.screenshot({ path: `${OUT}/${sc.id}.bg.png`, fullPage: full });
  writeFileSync(`${OUT}/${sc.id}.json`, JSON.stringify({ dpr, boxes }, null, 1));
  console.log(`${sc.id.padEnd(14)} ${boxes.length}か所（うち欄 ${boxes.filter((x) => x.field).length}）  止めた動き ${stopped.length}`);
  for (const s of [...new Set(stopped)]) console.log(`                止めた: ${s}`);
  await ctx.close();
}
await b.close();
console.log(`\npython3 tools/sprites/inkpx.py ${TAG} <上の名前>`);
