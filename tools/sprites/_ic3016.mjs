/**
 * 印の検品台（/design）を撮る道具。一時のもの。
 *
 *   node _ic3016.mjs                 … まとまり（紙）ごとに全部撮る
 *   node _ic3016.mjs pot knife cloud … 名前を指定した印だけ、大きく撮る
 *
 * 全部を1枚にすると縦 14,000px を超えて目で追えないので紙1枚ずつに割る。
 * 木のヘッダーは `position: sticky` で紙の頭にかぶるので、撮る前に消す。
 */
import { chromium } from "playwright-core";
import fs from "node:fs";

const PORT = process.env.PORT || "3016";
const OUT = process.env.OUT || "/tmp/shots/ic";
const names = process.argv.slice(2);
fs.mkdirSync(OUT, { recursive: true });

const b = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--no-sandbox"],
});
const ctx = await b.newContext({
  viewport: { width: 900, height: 1000 },
  deviceScaleFactor: names.length ? 5 : 2,
});
const p = await ctx.newPage();
p.on("pageerror", (e) => console.log("[pageerror]", String(e).slice(0, 300)));
await p.goto(`http://localhost:${PORT}/design`, { waitUntil: "domcontentloaded", timeout: 600000 });
await p.addStyleTag({ content: ".ih{display:none!important}" });
await p.waitForTimeout(2000);

if (names.length) {
  // 名前の付いたますめを拾って、指定ぶんだけ横に並べて撮る
  const got = await p.evaluate((want) => {
    const cells = [...document.querySelectorAll("main.page section > div > div")];
    const box = document.createElement("div");
    box.id = "pick";
    box.style.cssText =
      "position:fixed;left:0;top:0;z-index:9;display:flex;flex-wrap:wrap;width:900px;background:#f4efcf;padding:6px";
    const hit = [];
    for (const n of want) {
      const cell = cells.find((c) => c.querySelector("i")?.textContent === n);
      if (!cell) continue;
      box.appendChild(cell.cloneNode(true));
      hit.push(n);
    }
    document.body.appendChild(box);
    return hit;
  }, names);
  console.log("撮れた:", got.join(" "));
  await p.waitForTimeout(300);
  await p.locator("#pick").screenshot({ path: `${OUT}/pick.png` });
} else {
  const secs = await p.$$("main.page section");
  console.log("紙の数:", secs.length);
  for (let i = 0; i < secs.length; i++) {
    const t = (await secs[i].$eval("h2", (n) => n.textContent.trim()).catch(() => `s${i}`)).replace(/\d+$/, "");
    await secs[i].scrollIntoViewIfNeeded();
    await p.waitForTimeout(120);
    await secs[i].screenshot({ path: `${OUT}/${String(i).padStart(2, "0")}-${t}.png` });
    console.log(i, t);
  }
}
await b.close();
