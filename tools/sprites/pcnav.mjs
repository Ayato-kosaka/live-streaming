/**
 * **幅を1pxずつ動かして、島の入口（看板の6つ）が出たり消えたりする境目を出す。**
 *
 *   SPORT=5400 node pcnav.mjs
 *   SPORT=5400 PAGE=/kitchen/gyoza FROM=360 TO=1600 node pcnav.mjs
 *
 * なぜ要るか。820（タブレットの縦）で頭のバーを見たら、**「あやと島」1つだけ**が
 * 左にいて、右に 680px の空きがあった。1440 では同じバーに7つ並ぶ。
 * どこかに境目があって、**その手前ではどこへも行けないバーが出ている。**
 *
 * 絵で見ただけでは「下に固定のバーがあるのを見落としているだけ」かもしれない
 * （`docs/island-misses.md` #72「壊れていると読んだものが、3回とも測り方の
 * 間違いだった」）。だから**画面に出ている入口の数を数える。**
 * 数えるのは「見えていて、押せる大きさがある」ものだけ。
 *
 * 出るもの: 幅 → 頭のバーの入口数 / 画面に貼りついた下のバーの入口数 / 足元の入口数。
 */
import { chromium } from "playwright-core";
import { offline } from "./route.mjs";

const SPORT = process.env.SPORT || "5400";
const PAGE = process.env.PAGE || "/kitchen/gyoza";
const FROM = Number(process.env.FROM || 360);
const TO = Number(process.env.TO || 1920);
const STEP = Number(process.env.STEP || 20);

const b = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--no-sandbox"],
});

const rows = [];
for (let W = FROM; W <= TO; W += STEP) {
  const ctx = await b.newContext({
    viewport: { width: W, height: 900 }, deviceScaleFactor: 1,
    isMobile: W < 900, hasTouch: W < 900, reducedMotion: "reduce",
  });
  await offline(ctx);
  await ctx.addInitScript(() => {
    try {
      localStorage.setItem("ayato-island-arrived", "2026-09-04");
      localStorage.setItem("ayato-island-walked", "1");
    } catch {}
  });
  const p = await ctx.newPage();
  await p.goto(`http://localhost:${SPORT}${PAGE === "/" ? "/index" : PAGE}.html`,
    { waitUntil: "domcontentloaded", timeout: 60000 });
  await p.waitForTimeout(500);
  const got = await p.evaluate(() => {
    // 「画面に貼りついている」= 自分か先祖が fixed / sticky
    const stuck = (el) => {
      for (let a = el; a && a !== document.body; a = a.parentElement) {
        const q = getComputedStyle(a).position;
        if (q === "fixed" || q === "sticky") return true;
      }
      return false;
    };
    const links = [...document.querySelectorAll("a[href^='/']")].filter((a) => {
      const cs = getComputedStyle(a);
      if (cs.display === "none" || cs.visibility === "hidden") return false;
      if (a.checkVisibility?.({ checkOpacity: true, checkVisibilityCSS: true }) === false) return false;
      const r = a.getBoundingClientRect();
      return r.width > 8 && r.height > 8;
    });
    const half = document.documentElement.scrollHeight / 2;
    let top = 0, bottom = 0, foot = 0;
    const names = { top: [], bottom: [] };
    for (const a of links) {
      const r = a.getBoundingClientRect();
      const y = r.top + window.scrollY;
      const t = (a.textContent || "").trim().slice(0, 8);
      if (stuck(a)) {
        // 貼りついているものは、画面の上半分にいるか下半分にいるかで分ける
        if (r.top < innerHeight / 2) { top++; names.top.push(t); }
        else { bottom++; names.bottom.push(t); }
      } else if (y > half) foot++;
    }
    return { top, bottom, foot, names };
  });
  rows.push({ W, ...got });
  await ctx.close();
}
await b.close();

console.log(`${PAGE} — 幅ごとの入口の数`);
console.log("| 幅 | 頭の貼りつきバー | 下の貼りつきバー | 足元 | 頭に並ぶもの |");
console.log("| --- | --- | --- | --- | --- |");
let prev = null;
for (const r of rows) {
  const sig = `${r.top}/${r.bottom}`;
  const mark = prev !== null && prev !== sig ? "  ←ここで変わる" : "";
  console.log(`| ${r.W} | ${r.top} | ${r.bottom} | ${r.foot} | ${r.names.top.join(" ") || "（なし）"} |${mark}`);
  prev = sig;
}
// 境目だけ抜き出す
const edges = [];
for (let i = 1; i < rows.length; i++)
  if (rows[i].top !== rows[i - 1].top || rows[i].bottom !== rows[i - 1].bottom)
    edges.push(`${rows[i - 1].W}px(頭${rows[i - 1].top}/下${rows[i - 1].bottom}) → ${rows[i].W}px(頭${rows[i].top}/下${rows[i].bottom})`);
console.log("\n境目:", edges.length ? edges.join(" / ") : "この幅のあいだでは変わらない");
