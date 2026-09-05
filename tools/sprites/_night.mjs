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
  ["b-violet", `[data-time="night"]{--grass-hi:#8b96ad;--grass:#707c94;--grass-lo:#5a6680;--grass2-hi:#98a2b8;--grass2:#7d88a0;}`],
  ["c-violet-deep", `[data-time="night"]{--grass-hi:#7f8ba8;--grass:#65718c;--grass-lo:#4f5b78;--grass2-hi:#8b96b2;--grass2:#717d9a;--sand:#a9a8c0;--sand-wet:#9291ab;--sand-edge:#7d7c96;}`],
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
