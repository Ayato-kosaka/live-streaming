/** **引っ込んだ建物に、別の入口があるかを実際に押して確かめる。**
 *
 *   node tools/sprites/islereachpress.mjs
 *   P=/island/middle-east node tools/sprites/islereachpress.mjs
 *
 * `islereach.mjs` は「指が届くか」を数えるだけで、**押した先で何が起きるかは見ない。**
 * `components/isle/plates.ts` の `fitHit` は 48px を取れない当たりを引っ込める作りで、
 * その前提は「引っ込んでも札から入れる」。**前提が本当かは、押さないと分からない。**
 *
 * ここでは引き（島をながめる）にしてから、札と建物の当たりを1つずつ押して、
 * **板（`.isle-sheet`）が開いたか・どの建物の板か・外へ出たか**を出す。
 * 開いた板は毎回閉じる（閉じずに次を押すと、以降ぜんぶ同じ板の名前が出て、
 * 「全部入れた」に見える。1回そう出した）。
 */
import { chromium } from "playwright-core";
import { viaCurl, ORIGIN } from "./prod.mjs";
import { offline } from "./route.mjs";
const W = Number(process.env.W || 390);
const PATH = process.env.P || "/island/caucasus";
const b = await chromium.launch({ executablePath:"/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args:["--no-sandbox"] });
const ctx = await b.newContext({ viewport:{width:W,height:844}, deviceScaleFactor:2 });
await viaCurl(ctx); await offline(ctx);
const pg = await ctx.newPage();
const state = async () => pg.evaluate(() => ({
  sheet: !!document.querySelector(".isle-sheet"),
  sheetTitle: document.querySelector(".isle-sheet")?.getAttribute("aria-label") || "",
  url: location.pathname,
  cam: document.querySelector(".isle")?.getAttribute("data-cam"),
  talk: document.querySelector(".isle")?.classList.contains("is-talking"),
}));
await pg.goto(ORIGIN+PATH,{waitUntil:"networkidle",timeout:60000}).catch(()=>{});
await pg.waitForTimeout(2500);
const shut = async () => { for(let i=0;i<20;i++){ const t=await pg.evaluate(()=>document.querySelector(".isle")?.classList.contains("is-talking")??false); if(!t)break; await pg.mouse.click(4,4); await pg.waitForTimeout(300);} };
await shut();
// 引きへ
await (await pg.$('.isle-view')).click(); await pg.waitForTimeout(2000);
console.log("引きに切替:", JSON.stringify(await state()));
await pg.screenshot({ path: "/tmp/press-wide.png" });
// 札をひとつずつ押す（押せる状態のものだけ）
const marks = await pg.$$(".isle-mark");
for (let i=0;i<marks.length;i++){
  const m = marks[i];
  const info = await m.evaluate((el)=>({ t: el.textContent.trim().slice(0,24), pe: getComputedStyle(el).pointerEvents, opa: getComputedStyle(el).opacity }));
  if (info.pe === "none" || info.opa === "0") { console.log(`札${i} ${info.t} … 出ていない（pe=${info.pe} opa=${info.opa}）`); continue; }
  await m.click({ timeout: 3000 }).catch((e)=>console.log("  クリック失敗", String(e).slice(0,60)));
  await pg.waitForTimeout(1200);
  const s = await state();
  console.log(`札${i} ${info.t} → sheet=${s.sheet} "${s.sheetTitle}" url=${s.url} cam=${s.cam}`);
  await pg.screenshot({ path: `/tmp/press-mark${i}.png` });
  if (s.url !== PATH) { await pg.goBack({waitUntil:"networkidle"}); await pg.waitForTimeout(2000); await shut(); await (await pg.$('.isle-view')).click(); await pg.waitForTimeout(1500); }
  else { await pg.click(".isle-sheet-x").catch(()=>{}); await pg.waitForTimeout(900);
    const s2 = await state(); if (s2.cam !== "wide") { await (await pg.$('.isle-view')).click(); await pg.waitForTimeout(1500); } }
}
// 引きで当たりが生きている建物も押す
const hits = await pg.$$(".isle-hit");
for (let i=0;i<hits.length;i++){
  const info = await hits[i].evaluate((el)=>({ l: el.getAttribute("aria-label"), pe: getComputedStyle(el).pointerEvents }));
  if (info.pe === "none") { console.log(`建${i} ${info.l} … 当たりは止めてある（札のほう）`); continue; }
  await hits[i].click({ timeout: 3000, force: false }).catch((e)=>console.log("  クリック失敗", String(e).slice(0,60)));
  await pg.waitForTimeout(1500);
  const s = await state();
  console.log(`建${i} ${info.l} → sheet=${s.sheet} "${s.sheetTitle}" url=${s.url} cam=${s.cam}`);
  if (s.url !== PATH) { await pg.goBack({waitUntil:"networkidle"}); await pg.waitForTimeout(2000); await shut(); }
  else await pg.click(".isle-sheet-x").catch(()=>{});
  await pg.waitForTimeout(700);
  const s3 = await state(); if (s3.cam !== "wide") { await (await pg.$('.isle-view')).click(); await pg.waitForTimeout(1500); }
}
await ctx.close(); await b.close();
