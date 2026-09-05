import { chromium } from "playwright-core";
const SPORT = process.env.SPORT || "4170";
const OUT = process.env.OUT || "/tmp/shots";
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox"] });
async function shoot(name, w, h, path, act) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, isMobile: w < 700, hasTouch: w < 700, deviceScaleFactor: 2 });
  await ctx.route(/googleusercontent\.com|upload\.wikimedia\.org|instagram\.com|ytimg\.com|youtube\.com/, r => r.fulfill({ path: "/home/user/live-streaming/site/public/og.png" }));
  await ctx.route(/fonts\.googleapis\.com/, r => r.fulfill({ status: 200, contentType: "text/css", body: "" }));
  const p = await ctx.newPage();
  await p.goto(`http://localhost:${SPORT}` + path, { waitUntil: "domcontentloaded" });
  await p.waitForTimeout(800);
  if (act) await act(p);
  await p.screenshot({ path: `${OUT}/${name}.png` });
  await ctx.close();
}
const jobs = JSON.parse(process.env.JOBS);
for (const j of jobs) await shoot(j[0], j[1], j[2], j[3]);
await b.close();
console.log("ok");
