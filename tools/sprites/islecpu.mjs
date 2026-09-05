/**
 * 2つの**面**を交互に測って、比だけを読む。
 *
 * `_abport.mjs` は「同じ面を、2つの書き出しで」だが、こちらは
 * 「同じ書き出しで、2つの面を」。歩ける島が5つに増えたときに知りたいのは
 * **「島1つぶんの代金を、どの島でも払っているか」**なので、
 * いまの島（`/`）と、章の島（`/island/<章>`）を並べる。
 *
 * 交互に測るのは、この箱が混むから（同じ条件を2回で 33ms と 116ms が出る）。
 * 混み具合は A にも B にも同じだけ乗るので、比だけが読める。
 *
 *   SPORT=4140 A=/index.html B=/island/europe.html node islecpu.mjs
 *   SPORT=4140 WIDE=1 ... node islecpu.mjs      PC 幅で
 *   SPORT=4140 WALK=1 ... node islecpu.mjs      歩かせて（カメラが動くのがいちばん重い）
 */
import { chromium } from "playwright-core";
import { offline } from "./route.mjs";

const SPORT = process.env.SPORT || "4140";
const A = process.env.A || "/index.html";
const B = process.env.B || "/island/europe.html";
const N = Number(process.env.N || 3);
const SECS = Number(process.env.SECS || 6);
const WIDE = process.env.WIDE === "1";
const WALK = process.env.WALK === "1";

const b = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--no-sandbox"],
});
const ctx = await b.newContext(
  WIDE
    ? { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 }
    : { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 },
);
await offline(ctx, { photo: "/home/user/live-streaming/tools/sprites/photo-480.jpg" });

async function once(path) {
  const p = await ctx.newPage();
  const cdp = await ctx.newCDPSession(p);
  await cdp.send("Performance.enable");
  await p.addInitScript(() => {
    try {
      localStorage.setItem("ayato-island-arrived", "2026-09-04");
      localStorage.setItem("ayato-island-walked", "1");
      localStorage.setItem("ayato-island-today", "2026-09-05");
    } catch {}
    window.__f = 0;
    const tick = () => {
      window.__f++;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  await p.goto(`http://localhost:${SPORT}${path}`, { waitUntil: "load", timeout: 60000 });
  await p.waitForTimeout(4000);
  const m = async () =>
    Object.fromEntries((await cdp.send("Performance.getMetrics")).metrics.map((x) => [x.name, x.value]));
  const a = await m();
  const f0 = await p.evaluate(() => window.__f);
  const w0 = Date.now();
  if (WALK)
    await p.evaluate(() => {
      const el = document.querySelector(".isle, .stage");
      if (!el) return;
      let n = 0;
      const id = setInterval(() => {
        const r = el.getBoundingClientRect();
        el.dispatchEvent(
          new MouseEvent("click", {
            bubbles: true,
            clientX: r.left + r.width * (0.24 + 0.5 * (n % 2)),
            clientY: r.top + r.height * (0.34 + 0.2 * (n % 3)),
          }),
        );
        if (++n > 11) clearInterval(id);
      }, 500);
    });
  await p.waitForTimeout(SECS * 1000);
  const wall = Date.now() - w0;
  const z = await m();
  const f1 = await p.evaluate(() => window.__f);
  const info = await p.evaluate(() => ({
    svg: document.querySelectorAll("svg *").length,
    dom: document.querySelectorAll("*").length,
  }));
  await p.close();
  const frames = Math.max(1, f1 - f0);
  return {
    fps: (frames * 1000) / wall,
    cpuPerSec: ((z.ProcessTime - a.ProcessTime) * 1000) / (wall / 1000),
    cpu: ((z.ProcessTime - a.ProcessTime) * 1000) / frames,
    main: ((z.ThreadTime - a.ThreadTime) * 1000) / frames,
    ...info,
  };
}

const ra = [];
const rb = [];
for (let i = 0; i < N; i++) {
  ra.push(await once(A));
  rb.push(await once(B));
}
await b.close();
const med = (r, k) => {
  const s = r.map((x) => x[k]).sort((x, y) => x - y);
  return s[Math.floor(s.length / 2)];
};
const line = (n, r) =>
  console.log(
    `  ${n.padEnd(26)} 1秒のCPU ${med(r, "cpuPerSec").toFixed(0)} ms  fps ${med(r, "fps").toFixed(1)}  ` +
      `1フレーム ${med(r, "cpu").toFixed(1)}ms(主 ${med(r, "main").toFixed(1)})  SVG要素 ${r[0].svg}  ` +
      `[1秒: ${r.map((x) => x.cpuPerSec.toFixed(0)).join(" ")}]`,
  );
console.log(`■ ${WIDE ? "1440×900" : "390×844"} ${WALK ? "歩かせて" : "放置"}${SECS}秒 ${N}往復`);
line(A, ra);
line(B, rb);
console.log(`  B/A  1秒のCPU ×${(med(rb, "cpuPerSec") / med(ra, "cpuPerSec")).toFixed(2)}`);
