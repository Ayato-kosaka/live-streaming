import { chromium } from "playwright-core";
const SPORT = process.env.SPORT || "4915";
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args:["--no-sandbox"] });
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await ctx.route(/googleusercontent\.com/, r => r.fulfill({ path: "/home/user/live-streaming/site/public/characters/ayato.png" }));
const p = await ctx.newPage();
await p.addInitScript(() => localStorage.setItem("ayato-island-arrived", "1"));
await p.goto(`http://localhost:${SPORT}/index.html`, { waitUntil: "load", timeout: 180000 });
await p.waitForTimeout(5000);
await p.evaluate(() => { document.documentElement.dataset.time = "night"; });
await p.waitForTimeout(1500);
const cases = [
  ["a-now", ""],
  ["d-glow", `[data-time="night"]{--tint:rgba(30,32,96,0.62);--glow:rgba(60,70,255,0.34);}`],
  ["e-glow-soft", `[data-time="night"]{--tint:rgba(28,30,92,0.56);--glow:rgba(64,80,255,0.28);}`],
  ["f-glow-strong", `[data-time="night"]{--tint:rgba(26,28,88,0.66);--glow:rgba(56,66,255,0.38);}`],
];
for (const [name, css] of cases) {
  await p.evaluate((c) => {
    document.getElementById("nt")?.remove();
    if (!c) return;
    const s = document.createElement("style"); s.id = "nt"; s.textContent = c; document.head.appendChild(s);
  }, css);
  await p.waitForTimeout(900);
  await p.screenshot({ path: `/tmp/shots/night-${name}.png`, clip: { x: 0, y: 170, width: 390, height: 520 } });
  const c = await p.evaluate(() => {
    const cv = document.createElement("canvas");
    return null;
  });
  console.log("saved", name);
}
await b.close();
