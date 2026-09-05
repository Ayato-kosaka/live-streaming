/**
 * 地面の飾りの密度を数える。**目で見て「増やした」と言わないため。**
 *
 *   SPORT=4150 node isledensity.mjs
 *
 * 数えるのは2つ。どちらも**同じ数え方をいまの島にも当てる。**
 *
 *   図形の数 … 地面のパスに入っている「M」の数（＝独立した形の数）。
 *              いまの島もこの島も、小さい飾りはベクターで描いて色ごとに
 *              1本のパスへまとめてあるので、要素の数では比べられない
 *   絵の数   … `<image>`（木・建物・住人）
 *
 * 面積は、草地のパスの外接矩形から出す（楕円とみなして πab/4）。
 * 島の大きさが違うので、**1000平方単位あたり**に直さないと比べられない。
 */
import { chromium } from "playwright-core";
import { offline } from "./route.mjs";

const SPORT = process.env.SPORT || "4150";
/* 草地の面積（ワールド単位）。**絵からは測れないので、輪郭の式から出す。**
   いまの島  = 平均半径 399.5 − 浜 34 → π·365.5²·0.9
   章の島    = isleRadius(日数)·輪郭の平均比 − 浜 40 → π·r²·0.9
   ここを書きかえるときは、`layout.ts` / `world.ts` の値と必ず合わせる。 */
const AREA = {
  "/index.html": 377718,
  "/island/europe.html": 236614,
  "/island/middle-east.html": 176941,
  "/island/iran-walk.html": 75470,
  "/island/nordic.html": 67710,
};
const PAGES = (process.env.PAGES || Object.keys(AREA).join(",")).split(",");

const b = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--no-sandbox"],
});
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
await offline(ctx);
await ctx.addInitScript(() => {
  try {
    localStorage.setItem("ayato-island-arrived", "2026-09-04");
    localStorage.setItem("ayato-island-walked", "1");
  } catch {}
});

console.log("面                    図形   絵   草地の面積     図形/1000  絵/1000");
for (const path of PAGES) {
  const p = await ctx.newPage();
  await p.goto(`http://localhost:${SPORT}${path}`, { waitUntil: "load", timeout: 60000 });
  await p.waitForTimeout(2500);
  const r = await p.evaluate(() => {
    const svg = document.querySelector(".isle-svg, .stage-svg");
    if (!svg) return null;
    let shapes = 0;
    for (const el of svg.querySelectorAll("path")) {
      const d = el.getAttribute("d") || "";
      shapes += (d.match(/M/g) || []).length;
    }
    const images = svg.querySelectorAll("image").length;
    return { shapes, images };
  });
  await p.close();
  if (!r) {
    console.log(`${path.padEnd(24)} 島が無い`);
    continue;
  }
  const k = (AREA[path] ?? 0) / 1000;
  console.log(
    `${path.padEnd(22)}${String(r.shapes).padStart(5)}${String(r.images).padStart(6)}   ` +
      `${Math.round(k * 1000).toLocaleString().padStart(9)}   ${(r.shapes / k).toFixed(2).padStart(8)}  ${(r.images / k).toFixed(3).padStart(7)}`,
  );
}
await b.close();
