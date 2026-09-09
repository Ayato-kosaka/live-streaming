/** じぶんのことの上部を撮る。**数字ではなく、見た目を見るため。** */
import { chromium } from "playwright-core";
import { apply } from "./asme.mjs";
import { offline } from "./route.mjs";
const PORT = process.env.SPORT || 4180;
const b = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--no-sandbox"],
});
for (const nochara of [true, false]) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 700 }, deviceScaleFactor: 3 });
  await apply(ctx, { nochara });
  await offline(ctx).catch(() => {});
  const p = await ctx.newPage();
  await p.goto(`http://localhost:${PORT}/me.html`, { waitUntil: "networkidle" });
  await p.waitForTimeout(1200);
  await p.screenshot({ path: `/tmp/claude-0/me-${nochara ? "ayato" : "chara"}.png`, clip: { x: 0, y: 0, width: 390, height: 420 } });
  await ctx.close();
}
await b.close();
console.log("撮った");
