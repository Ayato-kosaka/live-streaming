/**
 * 直した面の**押しどころを全部**測って、直す前と後を同じ回の中で突き合わせる。
 *
 * 同じ書き出し・同じブラウザ・同じ時刻のまま、`.chain-foot a` / `.chap-note a` の
 * `padding-block` だけを 0 に戻した姿（＝直す前）と、そのままの姿（＝直した後）を
 * 交互に測る。**変えたのはその1行だけ**なので、これで前後が揃う。
 * 1条件ずつ別に測ると、住人が歩いているぶん前後がひっくり返る。
 *
 *   SPORT=4210 W=390 node tools/sprites/hitab.mjs
 *   SPORT=4210 W=1440 UNDO=".chain-foot a{padding-block:16px!important}" node tools/sprites/hitab.mjs
 *
 * **押しどころを広げたときは、必ずこれを通す。** 広げた先が隣の押しどころなら、
 * こちらが 48px になったぶん、あちらが削れる。`pchit.mjs` は 48px を割ったものしか
 * 出さないので、**56px が 50px になったことは出ない。** ここは全部の寸法を
 * 前後で突き合わせるので、減ったものが1個でもあれば名前で出る。
 */
import { chromium } from "playwright-core";
import { offline } from "./route.mjs";
import { writeFileSync } from "fs";

const SPORT = process.env.SPORT || "4210";
const W = Number(process.env.W || 390);
const H = Number(process.env.H || 900);
const OUT = process.env.OUT || `/tmp/backreport/abhit-${W}.json`;
const PAGES = (
  process.env.PAGES ||
  "/atlas,/island/albania,/island/caucasus,/island/europe,/island/iran-walk,/island/middle-east,/island/nordic," +
    "/island/caucasus/streams,/island/europe/streams,/island/iran-walk/streams,/island/middle-east/streams"
).split(",");
const SEL = 'a[href],button,[role="button"],input,select,textarea,summary,[tabindex]:not([tabindex="-1"])';
/** 直す前に戻す1行。**これ以外は何も変えない。**
    別の値を試すときは `UNDO=` で渡す（16px にしたら隣が削れるか、など）。 */
const UNDO = process.env.UNDO || ".chain-foot a,.chap-note a{padding-block:0!important}";

const MEASURE = (sel) => {
  const key = (el) => {
    const p = [];
    for (let e = el; e && e !== document.body; e = e.parentElement)
      p.push(e.tagName + ":" + [...(e.parentElement?.children || [])].indexOf(e));
    return p.join("/");
  };
  const out = [];
  for (const el of document.querySelectorAll(sel)) {
    const cs = getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden" || el.disabled) continue;
    if (el.tagName === "LABEL") continue;
    let target = el;
    if (el.tagName === "INPUT" || el.tagName === "SELECT") {
      const byFor = el.id ? document.querySelector(`label[for="${CSS.escape(el.id)}"]`) : null;
      const lb = byFor || el.closest("label");
      if (lb && (cs.opacity === "0" || cs.position === "absolute" || el.getBoundingClientRect().width < 4)) target = lb;
    }
    const det = el.closest("details");
    if (det && !det.open && !det.querySelector("summary")?.contains(el)) continue;
    target.scrollIntoView({ block: "center" });
    const r = target.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) continue;
    const lines = [...target.getClientRects()].filter((q) => q.width > 0 && q.height > 0);
    const box = lines.length ? lines.reduce((a, q) => (q.width * q.height > a.width * a.height ? q : a)) : r;
    const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
    const t = (el.textContent || el.getAttribute("aria-label") || "").trim().slice(0, 14);
    const k = key(el);
    if (cx < 0 || cy < 0 || cx > innerWidth || cy > innerHeight) { out.push({ k, t, why: "画面の外" }); continue; }
    const hits = (x, y) => {
      const e = document.elementFromPoint(x, y);
      return e && (e === target || target.contains(e) || e.closest?.("a,button,label,summary") === target);
    };
    if (!hits(cx, cy)) { out.push({ k, t, why: "覆われている" }); continue; }
    const grow = (dx, dy) => { let n = 0; while (n < 80 && hits(cx + dx * (n + 1), cy + dy * (n + 1))) n++; return n; };
    out.push({ k, t, w: grow(-1, 0) + grow(1, 0) + 1, h: grow(0, -1) + grow(0, 1) + 1,
      c: typeof el.className === "string" ? el.className.split(/\s+/)[0] : "" });
  }
  return out;
};

const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox"] });
const ctx = await b.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1,
  isMobile: W < 900, hasTouch: W < 900, reducedMotion: "reduce" });
await offline(ctx);
await ctx.addInitScript(() => {
  try { localStorage.setItem("ayato-island-arrived", "2026-09-04"); localStorage.setItem("ayato-island-walked", "1"); } catch {}
});
const p = await ctx.newPage();
const all = [];
for (const path of PAGES) {
  await p.goto(`http://localhost:${SPORT}${path === "/" ? "/index" : path}.html`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await p.waitForTimeout(700);
  /* 住人は歩く。2回測るあいだに動くと、前後の差が「島の住人が動いた」になる。
     rAF を止めてから測る（`docs/island-misses.md` #80）。 */
  await p.evaluate(() => {
    window.requestAnimationFrame = () => 0;
    const st = document.createElement("style");
    st.textContent = "*,*::before,*::after{animation-play-state:paused!important;transition:none!important}";
    document.head.appendChild(st);
  });
  await p.evaluate(async () => {
    for (let y = 0; y < document.body.scrollHeight; y += 600) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 25)); }
    window.scrollTo(0, 0);
  });
  await p.waitForTimeout(500);

  // 直す前（padding を 0 に戻した姿）
  await p.evaluate((css) => {
    const st = document.createElement("style"); st.id = "undo"; st.textContent = css; document.head.appendChild(st);
  }, UNDO);
  const before = await p.evaluate(MEASURE, SEL);
  // 直した後（そのまま）
  await p.evaluate(() => document.getElementById("undo")?.remove());
  const after = await p.evaluate(MEASURE, SEL);

  const bm = new Map(before.map((r) => [r.k, r]));
  const shrunk = [], grew = [], gone = [];
  for (const a of after) {
    const b0 = bm.get(a.k);
    if (!b0) { gone.push({ side: "後だけ", ...a }); continue; }
    bm.delete(a.k);
    if (b0.why || a.why) { if (b0.why !== a.why) gone.push({ k: a.k, t: a.t, b: b0.why, a: a.why }); continue; }
    if (a.w < b0.w || a.h < b0.h) shrunk.push({ t: a.t, c: a.c, b: [b0.w, b0.h], a: [a.w, a.h] });
    else if (a.w > b0.w || a.h > b0.h) grew.push({ t: a.t, c: a.c, b: [b0.w, b0.h], a: [a.w, a.h] });
  }
  for (const [, r] of bm) gone.push({ side: "前だけ", ...r });
  all.push({ path, n: after.length, shrunk, grew, gone });
  console.log(`${path}  押しどころ ${before.length}→${after.length}  減った ${shrunk.length}  増えた ${grew.length}  片方だけ ${gone.length}`);
  for (const s of shrunk) console.log(`   ** 減った ** 「${s.t}」 ${s.c}  ${s.b[0]}x${s.b[1]} → ${s.a[0]}x${s.a[1]}`);
  for (const s of grew) console.log(`      増えた  「${s.t}」 ${s.c}  ${s.b[0]}x${s.b[1]} → ${s.a[0]}x${s.a[1]}`);
  for (const s of gone) console.log(`      片方だけ ${JSON.stringify(s)}`);
}
writeFileSync(OUT, JSON.stringify(all, null, 1));
const S = all.reduce((a, r) => a + r.shrunk.length, 0), G = all.reduce((a, r) => a + r.grew.length, 0);
console.log(`\n幅 ${W}: ${all.length}面 / 押しどころ ${all.reduce((a, r) => a + r.n, 0)}個  減った ${S}個  増えた ${G}個`);
await b.close();
