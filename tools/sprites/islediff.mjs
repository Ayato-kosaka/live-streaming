/**
 * `islehue.mjs` が撮った2回ぶんを、**直す前と直したあとで1枚に並べる。**
 *
 *   node islediff.mjs /tmp/isleart/before /tmp/isleart/after /tmp/isleart/diff.png
 *
 * 島ごとに上が前・下が後。**数字ではなく、これを見て決める**
 * （「どれがどの島か当てられるか」が合格の条件）。
 */
import { chromium } from "playwright-core";
import { readFileSync, writeFileSync } from "fs";
import { join } from "path";

const [BEFORE, AFTER, OUT] = process.argv.slice(2);
if (!BEFORE || !AFTER || !OUT) {
  console.error("使い方: node islediff.mjs <前のdir> <後のdir> <出す先.png>");
  process.exit(2);
}
const SLUGS = (process.env.SLUGS ||
  "europe,middle-east,caucasus,iran-walk,nordic,albania").split(",");

const uri = (dir, slug) =>
  `data:image/png;base64,${readFileSync(join(dir, `${slug}.png`)).toString("base64")}`;

const b = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--no-sandbox"],
});
const ctx = await b.newContext({ viewport: { width: 1500, height: 900 }, deviceScaleFactor: 1 });
const p = await ctx.newPage();
const cells = SLUGS.map(
  (s) => `<figure>
    <figcaption>${s}</figcaption>
    <div class="p"><span>前</span><img src="${uri(BEFORE, s)}"></div>
    <div class="p"><span>後</span><img src="${uri(AFTER, s)}"></div>
  </figure>`,
).join("");
await p.setContent(`<style>
  body{margin:0;background:#101d31;color:#fff;
       font:700 22px ui-rounded,"Hiragino Maru Gothic ProN",system-ui}
  .g{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;padding:14px}
  figure{margin:0}
  figcaption{padding:0 0 6px 2px;font-size:24px}
  .p{position:relative;margin-bottom:6px}
  .p span{position:absolute;left:8px;top:8px;background:#0009;border-radius:8px;
          padding:2px 10px;font-size:18px}
  img{width:100%;display:block;border-radius:8px}
</style><div class="g">${cells}</div>`);
await p.waitForTimeout(700);
writeFileSync(OUT, await p.screenshot({ fullPage: true }));
await b.close();
console.log(OUT);
