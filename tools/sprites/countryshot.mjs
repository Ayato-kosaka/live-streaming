/**
 * **国の寄り地図と世界地図を、1枚ずつ撮る。枠を変える前と後で撮り比べるためのもの。**
 *
 *   tools/build.sh 3170
 *   python3 -m http.server 4321 --directory site/.next-3170 &
 *   SPORT=4321 OUT=/tmp/shots/before node tools/sprites/countryshot.mjs
 *   …枠を変えて焼き直して、もう一度…
 *   SPORT=4321 OUT=/tmp/shots/after  node tools/sprites/countryshot.mjs
 *
 *   SLUGS=poland,sweden  … 国を絞る
 *
 * ## なぜ要るか
 *
 * `python/build_world_route.py` の `LON_MIN` `LAT_MAX` を動かすと、
 * **世界地図の縦横比が変わって、既存の国のピンも札も寄せ枠も全部動く。**
 * 2026-09-22 に北欧の6カ国を入れるため北を 60.5 → 70.5 にしたとき、
 * 実際に3つ出た——絵だけが縦に潰れる（額縁の比が CSS に直書きだった）、
 * 北極海に偽の陸が出る（日付変更線の継ぎ目）、
 * 地球を一周する紙きれが海岸線の帯として滲む。
 * **どれも数字では出ない。撮って並べないと見えない。**
 *
 * 出した絵は `pngjs` で画素を引き算すれば、変わった面だけを数えられる。
 *
 * 住人の絵は `offline(ctx)` で本物に差し替える（CLAUDE.md「このサンドボックスから
 * 出られない先」）。先に `python3 tools/sprites/avatars.py` を回しておくこと。
 */
import { chromium } from "playwright-core";
import { mkdirSync } from "fs";
import { offline } from "./route.mjs";

const SPORT = process.env.SPORT || "4321";
const OUT = process.env.OUT || "/tmp/shots";
const SLUGS = (process.env.SLUGS || "").split(",").filter(Boolean);

/** 撮る国。**手で並べているのは `countries.ts` の順を保ちたいから**で、
    増えたら足す。抜けていても落ちず「地図なし」と言う。 */
const ALL = [
  "france", "netherlands", "belgium", "hungary", "austria", "slovakia", "czech",
  "germany", "uk", "turkey", "cyprus", "egypt", "jordan", "uae", "azerbaijan",
  "georgia", "armenia", "iran-border",
  "poland", "lithuania", "latvia", "estonia", "finland", "sweden",
];

mkdirSync(OUT, { recursive: true });
const b = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--no-sandbox"],
});
const ctx = await b.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 2 });
await offline(ctx);
const p = await ctx.newPage();

for (const slug of (SLUGS.length ? SLUGS : ALL)) {
  const r = await p.goto(`http://127.0.0.1:${SPORT}/map/${slug}.html`, { waitUntil: "networkidle" });
  if (!r || r.status() !== 200) {
    console.log(`${slug.padEnd(12)} ${r ? r.status() : "返事なし"}`);
    continue;
  }
  // 地図は `CountryMap`。焼いた JSON が無ければ `null` を返すので、要素ごと無い
  const el = await p.$(".apass-top svg");
  if (!el) {
    console.log(`${slug.padEnd(12)} 地図なし（content/atlas/c/${slug}.json が無い）`);
    continue;
  }
  await el.screenshot({ path: `${OUT}/c-${slug}.png` });
  const box = await el.boundingBox();
  console.log(`${slug.padEnd(12)} ${Math.round(box.width)}x${Math.round(box.height)}`);
}

// 世界地図。寄せボタンを押さない「ぜんぶ」の状態
await p.goto(`http://127.0.0.1:${SPORT}/map.html`, { waitUntil: "networkidle" });
await p.evaluate(() => new Promise((r) => setTimeout(r, 1200)));
const w = await p.$("svg.amap-svg");
await w.screenshot({ path: `${OUT}/world.png` });
const wb = await w.boundingBox();
console.log(`world        ${Math.round(wb.width)}x${Math.round(wb.height)}`);

await b.close();
