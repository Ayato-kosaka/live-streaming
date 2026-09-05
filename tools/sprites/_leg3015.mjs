import { chromium } from "playwright-core";
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox"] });
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await ctx.route(/upload\.wikimedia\.org/, r => r.fulfill({ path: "/home/user/live-streaming/site/public/og.png" }));
const p = await ctx.newPage();
p.on("pageerror", e => console.log("[pageerror]", String(e.stack || e).slice(0, 400)));
await p.goto("http://localhost:3015/nordic", { waitUntil: "domcontentloaded", timeout: 90000 });
await p.waitForTimeout(2600);
// 3つめの区間カードを開いて、地図の線に帯が付くか見る
await p.evaluate(() => {
  const h = document.querySelectorAll(".rlegs [data-leg]")[3];
  h.closest("details").open = true;
});
await p.waitForTimeout(500);
console.log("data-leg の数（板側）", await p.evaluate(() => document.querySelectorAll(".rlegs [data-leg]").length));
console.log("data-leg の数（地図側）", await p.evaluate(() => document.querySelectorAll(".nmap .nm-leg[data-leg]").length));
console.log("is-look", await p.evaluate(() => [...document.querySelectorAll(".nmap .nm-leg.is-look")].map(e => e.dataset.leg)));
console.log("is-tied", await p.evaluate(() => [...document.querySelectorAll(".nmap .nm-leg.is-tied")].map(e => e.dataset.leg)));
// 明るい芯が出るか、手で付けて見る
await p.evaluate(() => {
  document.querySelectorAll(".nmap .nm-leg").forEach((g, i) => { if (i < 4) g.classList.add("is-tied"); });
});
// 地図を撮る
const box = await p.locator("svg.nmap").boundingBox();
await p.evaluate(y => window.scrollTo(0, y), box.y - 60);
await p.waitForTimeout(400);
await p.screenshot({ path: "/tmp/n2/tie-map.png" });
await b.close();
