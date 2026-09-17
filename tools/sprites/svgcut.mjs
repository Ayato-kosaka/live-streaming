/**
 * **紙の外で切られている字**を、全面から数える。
 *
 *   DIST=/tmp/wt/site/.next-3350 SPORT=4350 node tools/sprites/svgcut.mjs
 *
 * **131面で 3分40秒（220秒）かかる**（2026-09-17 実測。1面あたり 1.7秒）。
 * 面ごとに `networkidle` を待ち、畳みを開いてもう一度待つので、面の数ぶん素直に伸びる。
 * **止まっているのではない。** 200秒で打ち切られたことがあるので、途中経過を出す
 * （`PROGRESS=0` で黙らせられる）。急ぐときは `ONLY=nordic,map` で面を絞る。
 *
 * viewBox のある `<svg>` は、はみ出したものを既定で切る（UA の `overflow: hidden`）。
 * 切られた字は「薄い字」ではなく**無い字**なのに、`getBoundingClientRect` は
 * 切られる前の箱を返す。だから濃さを測る道具（`inkpx`）から見ると、
 * ただの**薄い字**として出てくる。北欧の地図の方位磁針の N がそれで、
 * 「2.79」という数字だけが残って、**なぜ薄いのか（切られている）は出なかった。**
 * 色を濃くしても直らない種類の 4.5 割れが、世の中にはある。
 *
 * だから**濃さとは別に、切られているかを数える。**
 *
 * **数え方が届いているかは、道具じたいが確かめる**（`SELFTEST=1`）。
 * `/nordic` の方位磁針を、直す前の形（`translate(826 46)` / 回さない `text y=-44`）に
 * 画面の中だけで戻して数え直す。届いていれば「のこり 36%」と出る。
 * 0 と出たときに「無い」のか「数えていないだけ」なのかを分けられないと、
 * この道具そのものが嘘になる（`docs/island-misses.md` #19）。
 *
 * **終了コード**: 0＝切られた字なし / 1＝あった / 2＝数えるものが無い
 * （面が1枚も無い・1枚も開けなかった）。**印字された合否は合否ではない**
 * （`docs/island-misses.md` #128 の決めごと4）。`| tail` を挟むと消える。
 */
import { chromium } from "playwright-core";
import { readdirSync, statSync } from "fs";
import { join } from "path";
import { repoPath, fromRoot } from "./repo.mjs";

const SPORT = process.env.SPORT || "4321";
const root = fromRoot(process.env.DIST || "site/.next-verify");

function walk(d, base = "") {
  let out = [];
  for (const f of readdirSync(d)) {
    const p = join(d, f);
    if (["_next", "cache", "server", "static"].includes(f)) continue;
    if (statSync(p).isDirectory()) out = out.concat(walk(p, base + "/" + f));
    else if (f.endsWith(".html")) out.push(base + "/" + f);
  }
  return out;
}

/** 画面に出ている SVG の字のうち、紙（viewBox の窓）から欠けているものを返す。 */
const count = (page) =>
  page.evaluate(() => {
    const out = [];
    for (const svg of document.querySelectorAll("svg[viewBox]")) {
      // 切らない svg（overflow: visible）は、はみ出しても読める。数に入れない
      if (getComputedStyle(svg).overflow === "visible") continue;
      const sr = svg.getBoundingClientRect();
      if (sr.width < 2 || sr.height < 2) continue;
      for (const t of svg.querySelectorAll("text")) {
        if (!(t.textContent || "").trim()) continue;
        const cs = getComputedStyle(t);
        if (cs.visibility === "hidden" || cs.display === "none" || cs.opacity === "0") continue;
        if (t.checkVisibility?.({ opacityProperty: true, visibilityProperty: true }) === false) continue;
        const r = t.getBoundingClientRect();
        if (r.width < 1 || r.height < 1) continue;
        const iw = Math.max(0, Math.min(sr.right, r.right) - Math.max(sr.left, r.left));
        const ih = Math.max(0, Math.min(sr.bottom, r.bottom) - Math.max(sr.top, r.top));
        const keep = (iw * ih) / (r.width * r.height);
        // 1% でも欠けたら出す。字は1画ぶん欠けるだけで別の字になる
        if (keep < 0.99) {
          out.push({ t: (t.textContent || "").trim().slice(0, 14), c: t.getAttribute("class") || "", keep: +keep.toFixed(2) });
        }
      }
    }
    return out;
  });

const b = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--no-sandbox"],
});
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
// このサンドボックスからは外の画像に出られないので差し替える（crawl.mjs と同じ）
await ctx.route(/googleusercontent\.com|upload\.wikimedia\.org|instagram\.com|ytimg\.com|youtube\.com/,
  (r) => r.fulfill({ path: repoPath("site/public/og.png") }));
await ctx.route(/fonts\.googleapis\.com/, (r) => r.fulfill({ status: 200, contentType: "text/css", body: "" }));
const p = await ctx.newPage();

if (process.env.SELFTEST) {
  await p.goto(`http://localhost:${SPORT}/nordic.html`, { waitUntil: "networkidle", timeout: 60000 });
  await p.waitForTimeout(800);
  console.log("いまの形         :", JSON.stringify(await count(p)));
  await p.evaluate(() => {
    for (const g of document.querySelectorAll(".nm-compass")) {
      g.setAttribute("transform", "translate(826 46)");
      const t = g.querySelector(".nm-compass-t");
      t.setAttribute("y", "-44");
      g.appendChild(t); // 回す組から出して、紙の真上に固定する（直す前の置きかた）
    }
  });
  await p.waitForTimeout(400);
  console.log("直す前の形に戻すと:", JSON.stringify(await count(p)));
  await b.close();
  process.exit(0);
}

let pages = walk(root).sort();
// 面を絞る（急ぎの確かめ用）。**絞ったことは分母に出す**
const ONLY = (process.env.ONLY || "").split(",").map((s) => s.trim()).filter(Boolean);
if (ONLY.length) pages = pages.filter((x) => ONLY.some((o) => x.includes(o)));
if (!pages.length) {
  console.error(`面が1枚もありません（${root}${ONLY.length ? ` / ONLY=${ONLY.join(",")}` : ""}）`);
  await b.close();
  process.exit(2);
}
const PROGRESS = process.env.PROGRESS !== "0";
const t0 = Date.now();
let bad = 0;
let opened = 0; // **開けた面の数。0件を読むときの分母**（`island-standards.md` §15）
for (const [i, page] of pages.entries()) {
  const ok = await p
    .goto(`http://localhost:${SPORT}${page}`, { waitUntil: "networkidle", timeout: 60000 })
    .then(() => true)
    .catch(() => false);
  if (ok) opened++;
  // 3分40秒かかる道具なので、生きていることを見せる。黙っていると打ち切られる
  if (PROGRESS && (i + 1) % 20 === 0) {
    console.log(`  … ${i + 1}/${pages.length} 面（${Math.round((Date.now() - t0) / 1000)}秒）`);
  }
  await p.waitForTimeout(250);
  // 畳んである中の地図も見る。開かないと、面の半分を見ないまま 0 件になる
  await p.evaluate(() => { for (const d of document.querySelectorAll("details")) d.open = true; });
  await p.waitForTimeout(250);
  const cuts = await count(p);
  if (cuts.length) {
    bad += cuts.length;
    console.log(`NG ${page}`);
    for (const c of cuts) console.log(`   のこり ${(c.keep * 100).toFixed(0)}%  ${c.c} «${c.t}»`);
  }
}
console.log(
  `\npages: ${pages.length}  開けた面: ${opened}  紙の外で切られている字: ${bad}` +
    `  （${Math.round((Date.now() - t0) / 1000)}秒）`
);
await b.close();
// **1枚も開けなかったら 0 にしない。**「切られた字 0」と「見ていないから 0」は別
process.exit(opened === 0 ? 2 : bad ? 1 : 0);
