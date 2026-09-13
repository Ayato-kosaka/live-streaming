/**
 * **看板の6つの札が、幅いくつから「名前を最後まで出したまま」1段に収まるか**を測る。
 *
 *   SPORT=5600 node navfit.mjs
 *   SPORT=5600 FROM=700 TO=960 node navfit.mjs
 *
 * いまの境目は 900px だが、これは丸い数字を置いただけで、**測って決めた値ではない。**
 * 下げられるなら下げたいが、下げすぎると札の名前が切れる。
 * `.ih-link` は `white-space: nowrap; overflow: hidden` なので、**切れても横あふれに出ない。
 * 字が黙って消えるだけ**（`docs/island-misses.md` #19「数え方が届いていない場所は0件に見える」）。
 *
 * だから箱の幅ではなく **`scrollWidth > clientWidth`（中身が箱から出ているか）** で見る。
 * ついでに、札が2段に折り返していないか（帯の高さが 1段ぶんか）も見る。
 *
 * 測るために `.ih-nav` を `display: grid` に、`.ih-here` を `display: none` に
 * 差し込む。**差し込みは本番には無いもの**なので、いまの境目（900px）で
 * 差し込み無しと同じ数が出ることを毎回確かめる（`docs/island-standards.md` 13）。
 */
import { chromium } from "playwright-core";
import { offline } from "./route.mjs";

const SPORT = process.env.SPORT || "5600";
const PAGE = process.env.PAGE || "/kitchen/gyoza";
const FROM = Number(process.env.FROM || 700);
const TO = Number(process.env.TO || 960);
const STEP = Number(process.env.STEP || 4);

const b = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--no-sandbox"],
});

const look = async (W, force) => {
  const ctx = await b.newContext({
    viewport: { width: W, height: 900 },
    deviceScaleFactor: 1,
    isMobile: W < 900,
    hasTouch: W < 900,
    reducedMotion: "reduce",
  });
  await offline(ctx);
  await ctx.addInitScript(() => {
    try {
      localStorage.setItem("ayato-island-arrived", "2026-09-04");
      localStorage.setItem("ayato-island-walked", "1");
    } catch {}
  });
  const p = await ctx.newPage();
  await p.goto(`http://localhost:${SPORT}${PAGE === "/" ? "/index" : PAGE}.html`, {
    waitUntil: "domcontentloaded",
    timeout: 60000,
  });
  await p.waitForTimeout(400);
  const got = await p.evaluate((force) => {
    if (force) {
      const s = document.createElement("style");
      s.textContent =
        ".ih-nav{display:grid !important;grid-template-columns:repeat(auto-fit,minmax(96px,1fr))}" +
        ".ih-here{display:none !important}.ih-in{flex-wrap:nowrap !important}";
      document.head.appendChild(s);
    }
    const bar = document.querySelector(".ih");
    const nav = document.querySelector(".ih-nav");
    if (!bar || !nav) return null;
    const links = [...nav.querySelectorAll(".ih-link")];
    const cut = [];
    let rows = new Set();
    for (const a of links) {
      const r = a.getBoundingClientRect();
      rows.add(Math.round(r.top));
      // 中身が箱から出ていたら、名前が切れている（nowrap + overflow:hidden）
      if (a.scrollWidth > a.clientWidth + 1)
        cut.push(`${(a.textContent || "").trim()}(+${a.scrollWidth - a.clientWidth})`);
    }
    const de = document.documentElement;
    return {
      band: Math.round(bar.getBoundingClientRect().height),
      n: links.length,
      w: links.length ? Math.round(links[0].getBoundingClientRect().width) : 0,
      rows: rows.size,
      cut,
      over: de.scrollWidth - de.clientWidth,
    };
  }, force);
  await ctx.close();
  return got;
};

console.log(`${PAGE} — 看板の6つが「名前を切らずに1段」で収まる幅（差し込みあり）`);
console.log("| 幅 | 帯 | 札の数 | 札1枚 | 段 | 名前が切れた札 | 横あふれ |");
console.log("| --- | ---: | ---: | ---: | ---: | --- | ---: |");
let firstOk = null;
for (let W = FROM; W <= TO; W += STEP) {
  const g = await look(W, true);
  if (!g) { console.log(`| ${W} | — | 帯も札も無い | | | | |`); continue; }
  const ok = g.n === 6 && g.rows === 1 && g.cut.length === 0 && g.over <= 1;
  if (ok && firstOk === null) firstOk = W;
  if (!ok) firstOk = null;
  console.log(`| ${W} | ${g.band} | ${g.n} | ${g.w} | ${g.rows} | ${g.cut.join(" ") || "なし"} | ${g.over > 1 ? "+" + g.over : "0"} |`);
}
console.log(`\n名前を切らずに1段で収まる、いちばん狭い幅: ${firstOk ?? "この範囲には無い"}`);

// 差し込みが本番の絵を変えていないことの確認（`docs/island-standards.md` 13）
const a900 = await look(900, false), b900 = await look(900, true);
console.log(
  `\n差し込みの裏取り（900px）: 差し込み無し 札${a900.n}枚 ${a900.w}px ${a900.rows}段 切れ${a900.cut.length} / 差し込みあり 札${b900.n}枚 ${b900.w}px ${b900.rows}段 切れ${b900.cut.length}`,
);
console.log(
  JSON.stringify(a900) === JSON.stringify(b900)
    ? "  → 同じ。差し込みは 900px の絵を変えていない"
    : "  !! 違う。この道具の数は当てにしない",
);
await b.close();
