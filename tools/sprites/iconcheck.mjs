/** 看板の右はしと、じぶんのことの顔を、**絵のある人と無い人の両方で**見る。
    NOCHARA=1 はあやと自身（住人の表に居ないので絵が無い）を再現する。 */
import { chromium } from "playwright-core";
import { apply } from "./asme.mjs";
import { offline } from "./route.mjs";
const PORT = process.env.SPORT || 4150;
const b = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--no-sandbox"],
});
for (const nochara of [false, true]) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  await apply(ctx, { nochara });
  await offline(ctx).catch(() => {});
  const p = await ctx.newPage();
  await p.goto(`http://localhost:${PORT}/me.html`, { waitUntil: "networkidle" });
  await p.waitForTimeout(1200);
  const r = await p.evaluate(() => {
    const me = document.querySelector(".ih-me");
    const img = me?.querySelector("img");
    const face = document.querySelector(".mp-face");
    return {
      看板の字: me?.querySelector(".ih-me-i")?.textContent ?? "(無し)",
      看板の絵: img ? (img.naturalWidth > 0 ? "出ている" : "落ちた") : "無し",
      中部: face ? (face.tagName === "IMG"
        ? (face.naturalWidth > 0 ? "写真" : "写真が落ちた") : `字「${face.textContent}」`) : "(無し)",
    };
  });
  console.log(`${nochara ? "絵の無い人(あやと)" : "絵のある人      "} 看板=「${r.看板の字}」絵:${r.看板の絵} / 中部=${r.中部}`);
  await ctx.close();
}
await b.close();
