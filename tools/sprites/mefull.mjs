/** じぶんのこと（/me）を、上から下まで1枚に撮る。ADMIN=1 であやと。 */
import { chromium } from "playwright-core";
import { apply } from "./asme.mjs";
import { offline } from "./route.mjs";
const PORT = process.env.SPORT || 4501;
const admin = process.env.ADMIN === "1";
const path = process.env.PAGE || "/me";
const out = process.env.OUT || `/tmp/claude-0/me/${admin ? "ayato" : "guest"}.png`;
const b = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--no-sandbox"],
});
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
await apply(ctx, { admin });
await offline(ctx).catch(() => {});
const p = await ctx.newPage();
await p.goto(`http://localhost:${PORT}${path}.html`, { waitUntil: "networkidle" });
await p.waitForTimeout(1000);
for (let i = 0; i < 60; i++) {
  await p.evaluate(() => window.scrollBy(0, 2000));
  await p.waitForTimeout(40);
}
await p.evaluate(() => window.scrollTo(0, 0));
await p.waitForTimeout(300);
await p.screenshot({ path: out, fullPage: true });
console.log(out, await p.evaluate(() => document.documentElement.scrollHeight));
await b.close();
