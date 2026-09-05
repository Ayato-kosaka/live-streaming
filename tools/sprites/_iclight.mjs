/**
 * 「上からの光」が、同じ印が何度も出ても・先に出たほうが消えても残るかを確かめる。一時のもの。
 *
 * 見るのは3つ。
 *   1. 光が実際に効いているか（抜き型ごと外した絵と見比べて、絵が変わるか）
 *   2. 同じ名前の印が並んでいるとき、2つ目も光っているか
 *   3. **1つ目を DOM から消したあと、2つ目がまだ光っているか**（これが直したかった不具合）
 */
import { chromium } from "playwright-core";

const PORT = process.env.PORT || "3016";
const NAME = process.argv[2] || "pot";

const b = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--no-sandbox"],
});
const p = await b.newPage({ viewport: { width: 900, height: 1000 }, deviceScaleFactor: 2 });
await p.goto(`http://localhost:${PORT}/design`, { waitUntil: "domcontentloaded", timeout: 600000 });
await p.waitForTimeout(1500);

// 名前の付いたますめの中の svg を、大きいほうだけ集める
const n = await p.evaluate((name) => {
  const cells = [...document.querySelectorAll("main.page section > div > div")].filter(
    (c) => c.querySelector("i")?.textContent === name,
  );
  const svgs = cells.flatMap((c) => [...c.querySelectorAll("svg")]).filter((s) => s.width.baseVal.value > 20);
  svgs.forEach((s, i) => s.setAttribute("data-t", `t${i}`));
  return svgs.length;
}, NAME);
console.log(`${NAME}: 大きい svg ${n} 枚`);

await p.evaluate(() => document.fonts.ready);
const shot = async (sel) => (await p.locator(sel).screenshot({ timeout: 120000 })).toString("base64");

const before2 = await shot('[data-t="t1"]');
// 1つ目を消す。id を持っていた抜き型ごと消える
await p.evaluate(() => document.querySelector('[data-t="t0"]').remove());
await p.waitForTimeout(200);
const after2 = await shot('[data-t="t1"]');
// 光の膜そのものを外した絵（比べる相手）
await p.evaluate(() => document.querySelectorAll("svg rect[mask]").forEach((r) => r.remove()));
await p.waitForTimeout(200);
const nolight = await shot('[data-t="t1"]');

console.log("1つ目を消す前後で 2つ目は同じか:", before2 === after2 ? "同じ（直っている）" : "変わった（まだ落ちる）");
console.log("光を外すと絵は変わるか:", before2 === nolight ? "変わらない（光が効いていない）" : "変わる（効いている）");
await b.close();
