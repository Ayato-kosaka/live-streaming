/**
 * お店の行を**実際に押して**、地図アプリの行き先へ出るところまで見る。
 *
 *   SPORT=4220 node tools/sprites/shopmap.mjs
 *
 * 「リンクを書いた」と「押したら開く」は別のこと。押しどころの上に別の要素が
 * 乗っていれば押せないし、`target="_blank"` が効かなければ面を離れてしまう。
 * **書いた字ではなく、押した結果で見る。**
 *
 * 見るのは3つ:
 *
 *   1. 押すと**新しい窓**が開くか（面を離れていないか）
 *   2. その窓の行き先が、**その店の座標**になっているか
 *   3. 出た先が本当に地図か（外へは出られない箱なので、**要求を横取りして
 *      どの URL を取りに行ったか**を見る。中身は Google からは取れない）
 *
 * iPhone と Android の見分けは、行き先の形で決まる。`?api=1` の形は
 * **どちらでもアプリがあればアプリ、無ければブラウザの地図**に開く決まりなので、
 * ここでは「その URL へ出ようとしたか」までを見て、その先は URL の形で担保する。
 */
import { chromium, devices } from "playwright-core";

const PORT = process.env.SPORT || "4220";
const PATH = process.env.PAGE || "/nordic/day/3";
const b = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--no-sandbox"],
});

for (const [label, dev] of [
  ["iPhone 13", devices["iPhone 13"]],
  ["Pixel 5", devices["Pixel 5"]],
]) {
  const ctx = await b.newContext({ ...dev });
  const asked = [];
  // 外へは出られないので、行き先だけ受け取って空の紙を返す
  await ctx.route(/google\.com\/maps/, (r) => {
    asked.push(r.request().url());
    return r.fulfill({ status: 200, contentType: "text/html", body: "<title>map</title>" });
  });
  const p = await ctx.newPage();
  await p.goto(`http://127.0.0.1:${PORT}${PATH}.html`, { waitUntil: "load" });
  await p.waitForTimeout(600);

  const row = p.locator(".nsp-go").first();
  await row.scrollIntoViewIfNeeded();
  const name = (await row.locator(".nsp-name").textContent())?.trim();
  const href = await row.getAttribute("href");

  const [popup] = await Promise.all([
    ctx.waitForEvent("page", { timeout: 8000 }).catch(() => null),
    row.click(),
  ]);
  await p.waitForTimeout(500);

  console.log(`\n== ${label}  ${PATH}`);
  console.log(`  押した行: ${name}`);
  console.log(`  href    : ${href}`);
  console.log(`  新しい窓: ${popup ? popup.url() : "開かなかった"}`);
  console.log(`  元の面  : ${p.url().endsWith(`${PATH}.html`) ? "そのまま" : `離れた（${p.url()}）`}`);
  console.log(`  取りに行った先: ${asked[0] ?? "（無し）"}`);
  const ok =
    popup &&
    popup.url().startsWith("https://www.google.com/maps/search/?api=1&query=") &&
    /query=-?\d+\.\d+,-?\d+\.\d+$/.test(popup.url());
  console.log(`  判定: ${ok ? "座標つきで地図が開いた" : "開いていない"}`);
  await ctx.close();
}
await b.close();
