/**
 * スマホ幅で島を触ってみる。
 *   node tools/sprites/mobile.mjs
 * 目印を押す・住人を押す・「島をながめる」を押す、それぞれの見た目を撮る。
 */
import { chromium } from "playwright-core";
import fs from "node:fs";

const b = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--no-sandbox"],
});
const p = await b.newPage({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
});
await p.route(/fonts\.googleapis\.com/, (r) => r.fulfill({ status: 200, contentType: "text/css", body: "" }));
await p.route(/i\.ytimg\.com|fonts\.gstatic\.com/, (r) => r.abort());
// この環境からは Drive の画像に届かないので、手元に落としてある本物の
// キャラクター画像を返して、島に立った姿を確かめる
const sample = fs.readdirSync("/tmp").filter((f) => f.startsWith("r-") && f.endsWith(".png")).map((f) => "/tmp/" + f);
let n = 0;
await p.route(/lh3\.googleusercontent\.com/, (r) =>
  r.fulfill({ status: 200, contentType: "image/png", body: fs.readFileSync(sample[n++ % sample.length]) }));
const shot = async (name) => {
  const cdp = await p.context().newCDPSession(p);
  const { data } = await cdp.send("Page.captureScreenshot", { format: "png" });
  fs.writeFileSync(`/tmp/m-${name}.png`, Buffer.from(data, "base64"));
  console.log(name);
};
await p.goto("http://localhost:3111/", { waitUntil: "load", timeout: 60000 });
await p.waitForTimeout(5000);
await shot("01-first");

// 目印の大きさを測る
const pins = await p.$$eval(".spot-pin", (els) => els.map((e) => {
  const r = e.getBoundingClientRect();
  return { label: e.getAttribute("aria-label"), x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
}));
console.log("目印:", JSON.stringify(pins));

// 一番下の目印を押す
const target = pins.sort((a, b2) => b2.y - a.y)[0];
if (target) {
  await p.mouse.click(target.x + target.w / 2, target.y + target.h / 2);
  await p.waitForTimeout(900);
  await shot("02-sheet");
  console.log("押した:", target.label);
}
// 島をながめる
const wide = await p.$(".bar-zoom");
if (!wide) throw new Error(".bar-zoom がない");
await wide.click(); await p.waitForTimeout(2600); await shot("03-wide");
// 住人チップの大きさ
const cast = await p.$$eval(".stage-svg image", (els) => {
  const people = els.filter((e) => (e.getAttribute("href") || "").includes("googleusercontent"));
  const r = people[0] && people[0].getBoundingClientRect();
  return { people: people.length, size: r && [Math.round(r.width), Math.round(r.height)] };
});
console.log("島に住んでいる人:", JSON.stringify(cast));
await b.close();
