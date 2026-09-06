/**
 * 島を押しつづけて落ちるかを見る。
 *
 * あやとの言葉:「ちょっと性能に懸念があって押してると落ちる」。
 * 何が落ちるのかを推測で決めないための道具。次を全部拾う。
 *
 *   - タブのクラッシュ（`page.on("crash")`）
 *   - JS の例外（`page.on("pageerror")`）と console のエラー
 *   - 伸びつづける数（CDP `Performance.getMetrics` の JSHeapUsedSize /
 *     Nodes / JSEventListeners）。**押すたびに増えて戻らないもの**を疑う
 *   - rAF が二重に走っていないか（`requestAnimationFrame` を包んで、
 *     1フレームに何本のループが回っているかを数える）
 *
 * 使い方:
 *   SPORT=4140 TAPS=400 W=390 H=844 DPR=3 node mash.mjs
 *   SPORT=4140 PC=1 node mash.mjs        # PC（1440x900・dpr2）
 *   SPORT=4140 URL=/island/nordic.html node mash.mjs
 *
 * **壁の時計で速さを測る道具ではない**（`CLAUDE.md`）。落ちるかどうかと、
 * 戻らない数だけを見る。
 */
import { chromium } from "playwright-core";
import { offline } from "./route.mjs";

const SPORT = process.env.SPORT || "4321";
const URLPATH = process.env.URL || "/index.html";
const TAPS = Number(process.env.TAPS || 300);
const PC = !!process.env.PC;
const W = Number(process.env.W || (PC ? 1440 : 390));
const H = Number(process.env.H || (PC ? 900 : 844));
const DPR = Number(process.env.DPR || (PC ? 2 : 3));
const SEED = Number(process.env.SEED || 7);

/** 同じ順番で押せるように、乱数は自前で持つ */
let seed = SEED;
const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);

const b = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--no-sandbox", "--js-flags=--expose-gc"],
});
const ctx = await b.newContext({
  viewport: { width: W, height: H },
  deviceScaleFactor: DPR,
  isMobile: !PC,
  hasTouch: !PC,
});
await offline(ctx);

const page = await ctx.newPage();

/* rAF が何本走っているかを、**1秒あたりの呼び出し回数**で見る。
   島のループは1本で 60fps なので毎秒60回前後。寄り引きの切り替えで
   ループが二重に立つと、そのまま倍になる。包んでから開く。 */
await page.addInitScript(() => {
  const w = window;
  w.__raf = { calls: 0, t0: 0 };
  const orig = w.requestAnimationFrame.bind(w);
  w.requestAnimationFrame = (cb) => {
    w.__raf.calls++;
    if (!w.__raf.t0) w.__raf.t0 = performance.now();
    return orig(cb);
  };
});

const errs = [];
let crashed = false;
page.on("pageerror", (e) => errs.push("JS: " + String(e).slice(0, 300)));
page.on("crash", () => {
  crashed = true;
  errs.push("CRASH: タブが落ちた");
});
page.on("console", (m) => {
  if (m.type() === "error" && !/Failed to load resource|island-api/.test(m.text()))
    errs.push("console: " + m.text().slice(0, 200));
});

const cdp = await ctx.newCDPSession(page);
await cdp.send("Performance.enable");
const metrics = async () => {
  const { metrics: m } = await cdp.send("Performance.getMetrics");
  const g = (n) => m.find((x) => x.name === n)?.value ?? 0;
  return {
    heapMB: +(g("JSHeapUsedSize") / 1048576).toFixed(1),
    nodes: g("Nodes"),
    listeners: g("JSEventListeners"),
    docs: g("Documents"),
    frames: g("Frames"),
    layouts: g("LayoutCount"),
    recalcs: g("RecalcStyleCount"),
  };
};

await page.goto(`http://localhost:${SPORT}${URLPATH}`, { waitUntil: "load", timeout: 45000 });
await page.waitForTimeout(2500);

const stage = await page.$(".stage, .isle");
if (!stage) {
  console.log("島が見つからない:", URLPATH);
  await b.close();
  process.exit(1);
}
const box = await stage.boundingBox();
// 到着演出（カモメの名乗り）を閉じる。島の左上の隅なら、押しても入口に当たらない
if (!PC) await page.touchscreen.tap(box.x + 12, box.y + 12);
else await page.mouse.click(box.x + 12, box.y + 12);
await page.waitForTimeout(700);

const rows = [];
const snap = async (label) => {
  const m = await metrics();
  const raf = await page.evaluate(() => {
    const r = window.__raf;
    const s = (performance.now() - (r.t0 || performance.now())) / 1000;
    return { calls: r.calls, perSec: s > 0.5 ? Math.round(r.calls / s) : 0 };
  });
  rows.push({ label, ...m, rafCalls: raf.calls, rafPerSec: raf.perSec });
  return m;
};
await snap("0");

/** 「島ぜんぶ」と「島にもどる」の切り替え */
const toggleView = async () => {
  const t = await page.$(".stage-view, .isle-view");
  if (t) await t.click({ timeout: 2000 }).catch(() => {});
};

let done = 0;
for (let i = 1; i <= TAPS && !crashed; i++) {
  const x = box.x + 10 + rnd() * (box.width - 20);
  const y = box.y + 10 + rnd() * (box.height - 20);
  // ページから出てしまったら戻す（島の外の面を押しつづけても意味がない）
  if (!page.url().endsWith(URLPATH)) {
    await page.goBack({ waitUntil: "load" }).catch(() => {});
    await page.waitForTimeout(600);
  }
  if (!PC) await page.touchscreen.tap(x, y).catch((e) => errs.push("tap: " + e.message.slice(0, 120)));
  else await page.mouse.click(x, y).catch((e) => errs.push("click: " + e.message.slice(0, 120)));
  // 20回に1回、寄り引きを切り替える（rAF が二重に立たないかを見る）
  if (i % 20 === 0) await toggleView();
  await page.waitForTimeout(40);
  done = i;
  if (i % 50 === 0) await snap(String(i));
}
await page.waitForTimeout(1200);
if (!crashed) await snap("end");

console.log(`\n${URLPATH}  ${W}x${H} dpr${DPR}  taps=${done}/${TAPS}`);
console.log("tap   heapMB  nodes  listeners  docs  frames  rafCalls  raf/秒");
for (const r of rows)
  console.log(
    `${r.label.padEnd(5)} ${String(r.heapMB).padStart(6)} ${String(r.nodes).padStart(6)} ${String(
      r.listeners,
    ).padStart(10)} ${String(r.docs).padStart(5)} ${String(r.frames).padStart(7)} ${String(
      r.rafCalls,
    ).padStart(9)} ${String(r.rafPerSec).padStart(7)}`,
  );
console.log("\ncrashed:", crashed);
console.log("errors:", errs.length);
for (const e of [...new Set(errs)].slice(0, 30)) console.log("  " + e);

await b.close();
