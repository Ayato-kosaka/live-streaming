/** 看板の右はしと、じぶんのことの顔を、**絵のある人と無い人の両方で**見る。
 *
 * NOCHARA=1 はあやと自身（住人の表に居ないので島のキャラクターが無い）。
 *
 * **yt3.ggpht.com（YouTube の顔写真）を1枚でも取りに行ったら失敗**とする。
 * 「そのカラムは使わないで欲しい」（あやと・2026-09-09）を、描画結果ではなく
 * **通信で**確かめる。前は差し替えた絵で撮っていたので、消えたと誤認した。
 */
import { chromium } from "playwright-core";
import { apply } from "./asme.mjs";
import { offline } from "./route.mjs";

const PORT = process.env.SPORT || 4150;
const b = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--no-sandbox"],
});
let bad = 0;
for (const nochara of [false, true]) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  await apply(ctx, { nochara });
  await offline(ctx).catch(() => {});
  const p = await ctx.newPage();
  const yt = [];
  p.on("request", (r) => { if (/yt3\.ggpht\.com|googleusercontent\.com\/ytc/.test(r.url())) yt.push(r.url()); });
  await p.goto(`http://localhost:${PORT}/me.html`, { waitUntil: "networkidle" });
  await p.waitForTimeout(1500);
  const r = await p.evaluate(() => {
    const me = document.querySelector(".ih-me");
    const img = me?.querySelector("img");
    const face = document.querySelector(".mp-face");
    const chara = document.querySelector(".mp-chara img");
    return {
      看板字: me?.querySelector(".ih-me-i")?.textContent ?? "(無し)",
      看板絵: img ? (img.naturalWidth > 0 ? "出ている" : "落ちた") : "無し",
      中部: face ? (face.tagName === "IMG" ? "写真" : `字「${face.textContent}」`) : "(無し)",
      島のじぶん: chara ? "キャラクター" : "（絵なし）",
    };
  });
  const ng = yt.length > 0 || r.中部 === "写真";
  if (ng) bad++;
  console.log(
    `${nochara ? "絵の無い人(あやと)" : "絵のある人      "} 看板=「${r.看板字}」${r.看板絵} / ` +
      `中部=${r.中部} / 島のじぶん=${r.島のじぶん} / YouTubeの顔を取りに行った回数=${yt.length}${ng ? "  ← だめ" : ""}`,
  );
  await ctx.close();
}
await b.close();
console.log(bad ? `だめ ${bad}件` : "YouTube の顔は1枚も出していない");
