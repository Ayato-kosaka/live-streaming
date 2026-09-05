/**
 * 面の頭の費用を測る。
 *
 *   contentStart … 中身の1つ目が始まる y（文書座標）。ヘッダー＋現在地の行＋前置きの合計
 *   docH         … いちばん下まで送ってからの高さ（畳みは畳んだまま報告すると 1,100px 違う）
 *   nav          … ヘッダーと砂浜の一覧の合計（行き先の一覧が1面に何 px 使っているか）
 *   hero         … 1画面目でいちばん大きい絵の高さ ÷ 844
 *
 * 使い方: DIST=... SPORT=4170 node topcost.mjs [面のパス...]
 */
import { chromium } from "playwright-core";
import { readdirSync, statSync } from "fs";
import { join } from "path";

const SPORT = process.env.SPORT || "4170";
const root = process.env.DIST || "/home/user/live-streaming/site/.next-3170";
function walk(d, base = "") {
  let out = [];
  for (const f of readdirSync(d)) {
    const p = join(d, f);
    if (f === "_next" || f === "cache" || f === "server" || f === "static") continue;
    if (statSync(p).isDirectory()) out = out.concat(walk(p, base + "/" + f));
    else if (f.endsWith(".html")) out.push(base + "/" + f);
  }
  return out;
}
const only = process.argv.slice(2);
const pages = (only.length ? only : walk(root)).sort();

const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox"] });
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
await ctx.route(/googleusercontent\.com|upload\.wikimedia\.org|instagram\.com|ytimg\.com|youtube\.com/,
  r => r.fulfill({ path: "/home/user/live-streaming/site/public/og.png" }));
await ctx.route(/fonts\.googleapis\.com/, r => r.fulfill({ status: 200, contentType: "text/css", body: "" }));
const p = await ctx.newPage();
const rows = [];
for (const page of pages) {
  await p.goto(`http://localhost:${SPORT}` + page, { waitUntil: "domcontentloaded", timeout: 45000 });
  await p.waitForTimeout(500);
  // 畳んだまま測らない。いちばん下まで送ってから高さを読む。
  await p.evaluate(async () => {
    for (let y = 0; y < document.body.scrollHeight; y += 700) { window.scrollTo(0, y); await new Promise(r => setTimeout(r, 30)); }
    window.scrollTo(0, document.body.scrollHeight);
    await new Promise(r => setTimeout(r, 300));
    window.scrollTo(0, 0);
    await new Promise(r => setTimeout(r, 200));
  });
  const info = await p.evaluate(() => {
    const y = (el) => el ? el.getBoundingClientRect().top + window.scrollY : null;
    const h = (el) => el ? Math.round(el.getBoundingClientRect().height) : 0;
    const ih = document.querySelector(".ih");
    const way = document.querySelector(".wayrow");
    const phead = document.querySelector(".phead");
    void h; void y;
    const main = document.querySelector("main.page") || document.querySelector("main");
    // 中身が始まる y = 前置き（.phead）の下端。無ければ現在地の行の下端。
    // **要素の入れ子で探さない。** PageHead を包んでいる面があり、
    // 包みの上端を返すと前置きぶんが数から落ちる（/kitchen/* で 246 と出た）。
    let contentStart = null;
    const anchor = phead || way;
    if (anchor) contentStart = Math.round(anchor.getBoundingClientRect().bottom + window.scrollY);
    else if (main) contentStart = Math.round(main.getBoundingClientRect().top + window.scrollY);
    const foot = document.querySelector(".ifoot");
    // 1画面目でいちばん大きい絵
    let hero = 0;
    for (const el of document.querySelectorAll("img, svg, canvas, video, .phead-mark")) {
      const r = el.getBoundingClientRect();
      if (r.top > 844 || r.bottom < 0 || r.width < 24) continue;
      hero = Math.max(hero, Math.min(r.height, 844));
    }
    return {
      ihH: h(ih),
      wayH: h(way),
      pheadH: h(phead),
      contentStart,
      docH: Math.round(document.documentElement.scrollHeight),
      footH: h(foot),
      hero: Math.round(hero),
    };
  });
  const path = page.replace(/\.html$/, "").replace(/\/index$/, "") || "/";
  rows.push({ path, ...info });
}
rows.sort((a, b) => (b.docH || 0) - (a.docH || 0));
console.log("path\tcontentStart\tdocH\tscreens\tih\tway\tphead\tfoot\thero%");
for (const r of rows) {
  console.log([r.path, r.contentStart, r.docH, (r.docH / 844).toFixed(1), r.ihH, r.wayH, r.pheadH, r.footH, Math.round(r.hero / 844 * 100)].join("\t"));
}
const cs = rows.map(r => r.contentStart).filter(x => x != null).sort((a, b) => a - b);
console.log("\n面の頭 中央値:", cs[cs.length >> 1], "最小:", cs[0], "最大:", cs[cs.length - 1], "面数:", rows.length);
const sc = rows.map(r => r.docH / 844).sort((a, b) => a - b);
console.log("画面数 中央値:", sc[sc.length >> 1].toFixed(2), "3画面超え:", sc.filter(x => x > 3).length, "/", sc.length);
await b.close();
