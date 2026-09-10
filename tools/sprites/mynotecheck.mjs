/**
 * 付箋に返す一覧に、**あやと自身の付箋が混ざっていないか。**
 *
 *   SPORT=4501 node tools/sprites/mynotecheck.mjs
 *
 * あやとの言葉「付箋返しのリストに私の付箋を載せるのはやめてほしい」。
 * 自分の付箋に自分で返す用事は無いのに、返していない数に入って赤いままになる。
 *
 * **名前では突き合わせない。** 表示名は本人が決めるもので、同じ名前の人が
 * 2人いた事故がこの島で実際にある。差し込み（`asme.mjs`）は自分のぶんの
 * 本文を分かる形で入れてあるので、その本文が一覧に出たら失敗。
 * 「ぜんぶ見る」を押したときは**出るのが正しい**（しまう道を残すため）。
 */
import { chromium } from "playwright-core";
import { apply } from "./asme.mjs";
import { offline } from "./route.mjs";

const PORT = process.env.SPORT || 4501;
/** 差し込みで、あやと自身が名乗っている名前（`asme.mjs` の NAME）。
    **本文では見分けない。** 差し込みは同じ本文を他の人の付箋にも使っていて、
    本文で数えると他人のぶんまで「自分の」と数える（実際にそう出た）。 */
const ME = "ゆずたつ";
const b = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--no-sandbox"],
});
const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
await apply(ctx, { admin: true });
await offline(ctx).catch(() => {});
const p = await ctx.newPage();
await p.goto(`http://localhost:${PORT}/me/desk.html`, { waitUntil: "networkidle" });
await p.waitForTimeout(900);
await p.click(".mp-tabs.is-4 .mp-tab:nth-child(5)");
await p.waitForTimeout(1600);
// 最後まで出してから見る。畳んだままだと、下に混ざっていても気づけない
for (let i = 0; i < 40; i++) {
  const more = await p.$(".longer");
  if (!more || /たたむ/.test(await more.innerText())) break;
  await more.click();
  await p.waitForTimeout(150);
}
const rows = (li) =>
  li.map((x) => ({
    text: x.querySelector(".mp-care-text")?.textContent?.trim() || "",
    by: [...x.querySelectorAll(".chip")].map((c) => c.textContent?.trim()),
  }));
const got = await p.$$eval(".mp-care > li", rows);
const leaked = got.filter((r) => r.by.includes(ME));
console.log(`返す一覧 ${got.length} 枚、自分のぶん ${leaked.length} 枚`);
if (leaked.length) console.log("  " + leaked.map((r) => r.text).join(" / "));

// 「ぜんぶ見る」では出るのが正しい（しまう道を残してある）
await p.click(".mp-care-acts .nt-obtn");
await p.waitForTimeout(900);
for (let i = 0; i < 40; i++) {
  const more = await p.$(".longer");
  if (!more || /たたむ/.test(await more.innerText())) break;
  await more.click();
  await p.waitForTimeout(150);
}
const all = await p.$$eval(".mp-care > li", rows);
const back = all.filter((r) => r.by.includes(ME)).length;
console.log(`ぜんぶ見る ${all.length} 枚、自分のぶん ${back} 枚（ここには出るのが正）`);
await b.close();
console.log(leaked.length === 0 && back > 0 ? "よい" : "だめ");
