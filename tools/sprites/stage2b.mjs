/* はじめての5分を1手ずつ歩く。確かめ用の一時スクリプト（終わったら消す）。 */
import { chromium } from "playwright-core";

const PORT = process.env.PORT || "3012";
const OUT = "/tmp/r2b";
const b = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--no-sandbox"],
});
const ctx = await b.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
});
await ctx.route(/googleusercontent\.com/, (r) =>
  r.fulfill({ path: "/home/user/live-streaming/site/public/characters/ayato.png" }),
);
const p = await ctx.newPage();
p.on("pageerror", (e) => console.log("[pageerror]", String(e).slice(0, 300)));
await p.goto(`http://localhost:${PORT}/`, { waitUntil: "domcontentloaded", timeout: 60000 });

const look = async (tag) =>
  console.log(
    tag,
    JSON.stringify(
      await p.evaluate(() => ({
        talk: document.querySelector(".talkbox p")?.textContent?.slice(0, 24) ?? null,
        hint: document.querySelector(".walk-hint")?.textContent ?? null,
        barH: Math.round(document.querySelector(".island-bar")?.getBoundingClientRect().height ?? 0),
        barOpen: !!document.querySelector(".island-bar.is-open"),
        toggle: document.querySelector(".bar-toggle")?.textContent ?? null,
        vb: document.querySelector(".stage-svg")?.getAttribute("viewBox"),
      })),
    ),
  );

await p.waitForSelector(".talkbox", { timeout: 15000 });
await p.waitForTimeout(600);
await look("0:04 降りた");
// 名乗りを押して閉じる
await p.mouse.click(195, 500);
await p.waitForSelector(".talkbox", { state: "detached", timeout: 8000 });
await p.waitForTimeout(400);
await look("閉じた");
await p.screenshot({ path: `${OUT}/afterGreet.png` });

// 行き先をひらく
await p.click(".bar-toggle");
await p.waitForTimeout(500);
await look("行き先ひらいた");
await p.screenshot({ path: `${OUT}/barOpen.png` });
const spots = await p.$$eval(".bar-spot", (n) =>
  n.map((e) => ({
    t: e.textContent,
    href: e.getAttribute("href"),
    h: Math.round(e.getBoundingClientRect().height),
    w: Math.round(e.getBoundingClientRect().width),
  })),
);
console.log("行き先:", JSON.stringify(spots));

// 押したら入るか
await p.waitForTimeout(2600);
await p.$$eval(".bar-spot", (n) => n[3].click());
await p.waitForTimeout(1600);
console.log("入った先:", p.url(), "|", await p.$eval("h1", (e) => e.textContent).catch(() => "?"));
await b.close();
