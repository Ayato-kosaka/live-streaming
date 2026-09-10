/**
 * 直す前と後を、**2つのポートで交互に**測る。**時計を進めた時点でも測れる。**
 *
 *   A=4502 B=4503 WHEN=2026-09-18T20:00:00Z node abcover.mjs
 *
 * `abport.mjs` に時計の差し込みを足しただけのもの。表紙は日付で島が入れ替わるので
 * （`components/isle/Cover.tsx`）、いまの時計で測ると**入れ替わったあとの表紙を
 * 一度も測らないまま**「重くなっていない」と言うことになる。
 *
 * `_ab.mjs` は同じ書き出しに CSS を足して比べる道具なので、
 * コードを直した前後は比べられない。ここは書き出しを2つ配っておいて、
 * A→B→A→B… と交互に開く。この箱は担当が何人も動いていて混み具合が
 * 秒単位で変わるので（`CLAUDE.md`）、**同じ回の A と B の比だけ**を読む。
 *
 * 出すのは4つ。
 *   FCP / LCP  … 最初の絵・いちばん大きい絵が出るまで（CPU 4倍遅で）
 *   起動CPU    … 開いてから落ち着くまでに使った CPU
 *   1秒のCPU   … 何も押さずに置いたときの CPU（と、そのときの fps）
 *   転送        … 落としたバイト数。混み具合に左右されないので、そのまま読める
 */
import { chromium } from "playwright-core";
import { offline } from "./route.mjs";

/** 比べる2つ。**時計は片方ずつ変えられる**（いまの表紙と、入れ替わったあとの表紙を並べる） */
const PORTS = [
  ["前", process.env.A || "4502", process.env.AWHEN || process.env.WHEN || ""],
  ["後", process.env.B || "4503", process.env.BWHEN || process.env.WHEN || ""],
];
const PAGE = process.env.PAGE || "/index.html";
const WIDE = process.env.WIDE === "1";
const N = Number(process.env.N || 3);
const IDLE = Number(process.env.IDLE || 5);
/** 読み込みを見るときだけ絞る。絞り自体が1フレーム 13ms の下駄になる */
const THROTTLE = Number(process.env.THROTTLE || 4);
/** 見る時点。空なら、いまの時計のまま。**AWHEN / BWHEN で片方ずつ変えられる** */
const clockOf = (when) =>
  when
    ? `(() => {
        const F = ${Date.parse(when)}, R = Date, s = R.now();
        class D extends R {
          constructor(...a) { a.length ? super(...a) : super(F + (R.now() - s)); }
          static now() { return F + (R.now() - s); }
        }
        D.parse = R.parse; D.UTC = R.UTC; globalThis.Date = D;
      })();`
    : "";

const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox"] });
const ctx = await b.newContext(WIDE
  ? { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 }
  : { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 });
await offline(ctx, { photo: "/home/user/live-streaming/tools/sprites/photo-480.jpg" });
const m = async (cdp) => Object.fromEntries((await cdp.send("Performance.getMetrics")).metrics.map((x) => [x.name, x.value]));

/** 読み込み（絞りあり）。 */
async function load(port, when) {
  const p = await ctx.newPage();
  // 時計は**いちばん先に**差し込む。あとから入れると、島が本当の今日で組まれる
  if (when) await p.addInitScript(clockOf(when));
  const cdp = await ctx.newCDPSession(p);
  await cdp.send("Performance.enable");
  if (THROTTLE) await cdp.send("Emulation.setCPUThrottlingRate", { rate: THROTTLE });
  let bytes = 0, reqs = 0;
  const pend = [];
  // 数えるのは自分のところから落としたものだけ。外の差し替えぶんは本番では出ない
  p.on("response", (r) => { if (new URL(r.url()).hostname !== "localhost") return; pend.push(r.body().then((x) => { bytes += x.length; reqs++; }).catch(() => {})); });
  await p.addInitScript(() => {
    try { localStorage.setItem("ayato-island-arrived", "2026-09-04"); localStorage.setItem("ayato-island-walked", "1"); } catch {}
    window.__lcp = 0;
    try { new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__lcp = e.startTime; }).observe({ type: "largest-contentful-paint", buffered: true }); } catch {}
  });
  await p.goto(`http://localhost:${port}${PAGE}`, { waitUntil: "load", timeout: 90000 });
  await p.waitForTimeout(6000);
  const z = await m(cdp);
  const w = await p.evaluate(() => ({
    fcp: (performance.getEntriesByType("paint").find((e) => e.name === "first-contentful-paint") || { startTime: 0 }).startTime,
    lcp: window.__lcp,
  }));
  await Promise.all(pend);
  await p.close();
  return { ...w, cpu: z.ProcessTime * 1000, main: z.ThreadTime * 1000, bytes: bytes / 1024, reqs };
}

/** 置いたまま（絞りなし）。 */
async function idle(port, when) {
  const p = await ctx.newPage();
  if (when) await p.addInitScript(clockOf(when));
  const cdp = await ctx.newCDPSession(p);
  await cdp.send("Performance.enable");
  await p.addInitScript(() => {
    try { localStorage.setItem("ayato-island-arrived", "2026-09-04"); localStorage.setItem("ayato-island-walked", "1"); } catch {}
    window.__f = 0; const t = () => { window.__f++; requestAnimationFrame(t); }; requestAnimationFrame(t);
  });
  await p.goto(`http://localhost:${port}${PAGE}`, { waitUntil: "load", timeout: 90000 });
  await p.waitForTimeout(4000);
  const a = await m(cdp);
  const f0 = await p.evaluate(() => window.__f);
  const w0 = Date.now();
  await p.waitForTimeout(IDLE * 1000);
  const wall = Date.now() - w0;
  const z = await m(cdp);
  const f1 = await p.evaluate(() => window.__f);
  await p.close();
  return { cpuPerSec: ((z.ProcessTime - a.ProcessTime) * 1000) / (wall / 1000), fps: ((f1 - f0) * 1000) / wall };
}

const out = PORTS.map(() => ({ load: [], idle: [] }));
for (let i = 0; i < N; i++) {
  for (let j = 0; j < PORTS.length; j++) out[j].load.push(await load(PORTS[j][1], PORTS[j][2]));
  for (let j = 0; j < PORTS.length; j++) out[j].idle.push(await idle(PORTS[j][1], PORTS[j][2]));
}
await b.close();
const med = (r, k) => { const s = r.map((x) => x[k]).sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
console.log(`■ ${PAGE} ${WIDE ? "PC" : "スマホ"}  ${N}往復（中央値）`);
for (let j = 0; j < PORTS.length; j++) {
  const L = out[j].load, I = out[j].idle;
  console.log(`  ${PORTS[j][0]}(:${PORTS[j][1]}${PORTS[j][2] ? ` 時計 ${PORTS[j][2]}` : ""})  FCP ${med(L, "fcp").toFixed(0)}ms  LCP ${med(L, "lcp").toFixed(0)}ms  起動CPU ${med(L, "cpu").toFixed(0)}ms(主 ${med(L, "main").toFixed(0)})  転送 ${med(L, "bytes").toFixed(0)}KB/${med(L, "reqs")}本`);
  console.log(`               置いたまま 1秒のCPU ${med(I, "cpuPerSec").toFixed(0)}ms  fps ${med(I, "fps").toFixed(1)}`);
}
const r = (k, w) => (med(out[1][w], k) / med(out[0][w], k)).toFixed(2);
console.log(`  比（後÷前）  LCP ×${r("lcp", "load")}  起動CPU ×${r("cpu", "load")}  主 ×${r("main", "load")}  転送 ×${r("bytes", "load")}  置いたままのCPU ×${r("cpuPerSec", "idle")}`);
