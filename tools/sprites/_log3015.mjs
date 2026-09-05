import { chromium } from "playwright-core";
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox"] });
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await ctx.route(/upload\.wikimedia\.org/, r => r.fulfill({ path: "/home/user/live-streaming/site/public/og.png" }));
const p = await ctx.newPage();
p.on("pageerror", e => console.log("[pageerror]", String(e.stack || e).slice(0, 400)));
await p.goto("http://localhost:3015/nordic", { waitUntil: "domcontentloaded", timeout: 90000 });
await p.waitForTimeout(2600);
await p.evaluate(() => {
  const h = [...document.querySelectorAll(".rlegs [data-leg]")].find(e => e.dataset.leg === "vilnius-riga");
  h.closest("details").open = true;
  h.closest("details").scrollIntoView({ block: "start" });
});
await p.waitForTimeout(600);
await p.screenshot({ path: "/tmp/n2/logseat.png" });
await b.close();
