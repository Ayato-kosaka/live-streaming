/**
 * 6つの島の**輪郭だけ**を抜き出して、どれだけ同じ形かを数で出す。
 *
 *   SPORT=4360 OUT=/tmp/isleshape/before node isleshape.mjs
 *
 * 出すもの:
 *
 *  1. **輪郭だけを6つ並べた1枚**（`outlines.png`）。色も草木も建物も無い、線だけ。
 *     「どれがどの島か当てられるか」を目で見るのはこれ
 *  2. **どの2島を取っても何%同じ形か**（`shape.json` と標準出力）
 *
 * ## 似ているかの測りかた
 *
 * 浜のふち（`path.ig-sand`）の `d` をブラウザに実測させて（`getPointAtLength`）、
 * **面積を1にそろえ、重心を原点に置いてから**重ねる。重なった面積 ÷ 合わせた面積（IoU）。
 * 100% なら「大きさを別にすれば同じ形」、0% なら「1画素も重ならない」。
 *
 * **向きは直さない。** 島は地図と同じで北が上に決まっているので、
 * 回して合わせてしまうと「東西に長い島」と「南北に長い島」が同じ形になる。
 *
 * 大きさをそろえるのは、島の大小が**滞在日数**で決まっていて（`shapes.ts` の
 * `islandRadius`）、形の話ではないから。
 *
 * ## 島は止めてから読む
 *
 * 浜は動かないが、同じ頁に rAF で動くもの（住人・カメラ）がいる。
 * 止めずに読むと `getPointAtLength` が重くなるだけなので先に黙らせる。
 */
import { chromium } from "playwright-core";
import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";

const SPORT = process.env.SPORT || "4360";
const BASE = `http://localhost:${SPORT}`;
const OUT = process.env.OUT || "/tmp/isleshape/shot";
/** 撮る島。**トップページ（`/`）がアルバニアの島** */
const PAGES = (process.env.PAGES ||
  "europe=/island/europe,middle-east=/island/middle-east,caucasus=/island/caucasus," +
  "iran-walk=/island/iran-walk,nordic=/island/nordic,albania=/").split(",");
/** 輪郭を何点で読むか。多いほど細かい刻みまで拾う */
const N = Number(process.env.N || 512);

mkdirSync(OUT, { recursive: true });

const b = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--no-sandbox"],
});
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
await ctx.addInitScript(() => {
  try {
    localStorage.setItem("ayato-island-arrived", "2026-09-04");
    localStorage.setItem("ayato-island-walked", "1");
    localStorage.setItem("ayato-island-today", "2026-09-05");
  } catch {}
});

/** 島ごとの輪郭（点列）。ワールド座標のまま */
const SHAPE = {};
for (const spec of PAGES) {
  const [slug, path] = spec.split("=");
  const p = await ctx.newPage();
  await p.goto(BASE + (path === "/" ? "/index.html" : `${path}.html`), { waitUntil: "load", timeout: 60000 });
  await p.evaluate(() => { window.requestAnimationFrame = () => 0; });
  await p.waitForSelector("path.ig-sand", { timeout: 30000 });
  SHAPE[slug] = await p.evaluate((n) => {
    const el = document.querySelector("path.ig-sand");
    const L = el.getTotalLength();
    const out = [];
    for (let i = 0; i < n; i++) {
      const q = el.getPointAtLength((i / n) * L);
      out.push([q.x, q.y]);
    }
    return out;
  }, N);
  await p.close();
}
await b.close();

const slugs = Object.keys(SHAPE);

/** 面積を1に、重心を原点に。**向きは直さない** */
function norm(P) {
  let A = 0, cx = 0, cy = 0;
  for (let i = 0; i < P.length; i++) {
    const [ax, ay] = P[i], [bx, by] = P[(i + 1) % P.length];
    const c = ax * by - bx * ay;
    A += c; cx += (ax + bx) * c; cy += (ay + by) * c;
  }
  A /= 2; cx /= 6 * A; cy /= 6 * A;
  const k = 1 / Math.sqrt(Math.abs(A));
  return P.map(([x, y]) => [(x - cx) * k, (y - cy) * k]);
}
/** 升目で塗る。IoU はこの升目の数で出す */
const G = 320;
function mask(P) {
  const q = P.map(([x, y]) => [x * G * 0.42 + G / 2, y * G * 0.42 + G / 2]);
  const m = new Uint8Array(G * G);
  for (let gy = 0; gy < G; gy++) {
    const y = gy + 0.5, xi = [];
    for (let i = 0; i < q.length; i++) {
      const [ax, ay] = q[i], [bx, by] = q[(i + 1) % q.length];
      if ((ay <= y && by > y) || (by <= y && ay > y)) xi.push(ax + ((y - ay) / (by - ay)) * (bx - ax));
    }
    xi.sort((a, b) => a - b);
    for (let t = 0; t + 1 < xi.length; t += 2)
      for (let gx = Math.ceil(xi[t]); gx < xi[t + 1]; gx++) if (gx >= 0 && gx < G) m[gy * G + gx] = 1;
  }
  return m;
}
const NM = Object.fromEntries(slugs.map((s) => [s, norm(SHAPE[s])]));
const M = Object.fromEntries(slugs.map((s) => [s, mask(NM[s])]));

const pair = {};
let sum = 0, cnt = 0, mx = 0, mxp = "";
console.log(" ".repeat(12) + slugs.map((s) => s.slice(0, 9).padStart(9)).join(""));
for (let i = 0; i < slugs.length; i++) {
  const row = [];
  for (let j = 0; j < slugs.length; j++) {
    if (i === j) { row.push("        -"); continue; }
    const a = M[slugs[i]], b2 = M[slugs[j]];
    let inter = 0, uni = 0;
    for (let k = 0; k < G * G; k++) { if (a[k] & b2[k]) inter++; if (a[k] | b2[k]) uni++; }
    const v = inter / uni;
    row.push((v * 100).toFixed(1).padStart(9));
    if (j > i) {
      pair[`${slugs[i]} vs ${slugs[j]}`] = Math.round(v * 1000) / 10;
      sum += v; cnt++;
      if (v > mx) { mx = v; mxp = `${slugs[i]} vs ${slugs[j]}`; }
    }
  }
  console.log(slugs[i].padEnd(12) + row.join(""));
}
const avg = sum / cnt;
const ge = (t) => Object.values(pair).filter((v) => v >= t).length;
console.log(`\n平均 ${(avg * 100).toFixed(1)}%  最大 ${(mx * 100).toFixed(1)}%（${mxp}）`);
console.log(`70%以上 ${ge(70)}組 / 80%以上 ${ge(80)}組 / 90%以上 ${ge(90)}組（全${cnt}組）`);
writeFileSync(join(OUT, "shape.json"), JSON.stringify({ avg: Math.round(avg * 1000) / 10, max: Math.round(mx * 1000) / 10, maxPair: mxp, pair }, null, 1));

// ---- 輪郭だけを6つ並べた1枚 -----------------------------------------------
/* 大きさはそろえない。**日数で決まる本当の大小も一緒に見たい**ので、
   いちばん大きい島が枠に収まる倍率を全島に共通で掛ける。 */
const b2 = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--no-sandbox"],
});
const ctx2 = await b2.newContext({ viewport: { width: 1320, height: 920 }, deviceScaleFactor: 2 });
const span = Math.max(
  ...slugs.map((s) => Math.max(...SHAPE[s].flatMap(([x, y]) => [Math.abs(x - mid(SHAPE[s])[0]), Math.abs(y - mid(SHAPE[s])[1])]))),
);
function mid(P) {
  const xs = P.map((p) => p[0]), ys = P.map((p) => p[1]);
  return [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2];
}
const cells = slugs.map((s) => {
  const [mx2, my2] = mid(SHAPE[s]);
  const k = 190 / span;
  const d = SHAPE[s].map(([x, y], i) => `${i ? "L" : "M"}${((x - mx2) * k + 200).toFixed(1)},${((y - my2) * k + 200).toFixed(1)}`).join("") + "Z";
  return `<figure><svg viewBox="0 0 400 400"><path d="${d}"/></svg><figcaption>${s}</figcaption></figure>`;
}).join("");
const grid = await ctx2.newPage();
await grid.setContent(
  `<style>body{margin:0;background:#fff;font:600 20px system-ui;color:#111}
   main{display:grid;grid-template-columns:repeat(3,1fr);gap:4px;padding:8px}
   figure{margin:0;text-align:center}svg{width:100%;display:block}
   path{fill:#dfe9f2;stroke:#1d3c56;stroke-width:3}
   figcaption{padding:2px 0 8px}</style><main>${cells}</main>`,
);
await grid.waitForTimeout(200);
writeFileSync(join(OUT, "outlines.png"), await grid.screenshot({ fullPage: true }));
await b2.close();
console.log(`\n書いた: ${join(OUT, "outlines.png")} / ${join(OUT, "shape.json")}`);
