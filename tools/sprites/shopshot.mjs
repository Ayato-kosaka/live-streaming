/**
 * お店の区画（`components/nordic/Shops.tsx`）を、**あやとが見るのと同じ 390px で**撮る。
 *
 *   SPORT=4220 node tools/sprites/shopshot.mjs
 *
 * 撮るのは4通り。1枚では足りないから:
 *
 *   head    … 面の頭。**近道の札が出ているか**（路上で開く人が最初に見るところ）
 *   closed  … 区画を畳んだまま。**最初に目に入る姿**
 *   open    … 「あと◯軒だす」を全部押したあと。**押した先が空でないか**
 *   today   … 街の時計を今日にして、開閉の札が出ている姿
 *
 * あわせて数も出す。**絵を見て「良さそう」で済ませない**:
 *
 *   - 区画ごとの軒数と、出ている行の数
 *   - 行の当たり判定（`elementFromPoint` で実測。48px 以上か）
 *   - 横あふれ（`scrollWidth - clientWidth`）
 *   - 地図の行き先が本当に座標を持っているか（1行目だけ字で出す）
 */
import { chromium } from "playwright-core";
import { mkdirSync } from "fs";
import { offline } from "./route.mjs";

const PORT = process.env.SPORT || "4220";
const OUT = process.env.OUT || "/tmp/shopreport";
const W = Number(process.env.W || 390);
/* 撮る面。**その日の街が違うものを並べる。**
   2 は今日（ビャウィストク）、3 は明日（ヴィリニュス）、
   lithuania は国から入ってきた人の道。 */
const PAGES = (process.env.PAGES || "/nordic/day/2,/nordic/day/3,/nordic/lithuania").split(",");

mkdirSync(OUT, { recursive: true });
const b = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--no-sandbox"],
});

/** 押しどころの実寸。**見た目の箱では測らない**（`CLAUDE.md`）。 */
const HIT = `(el) => {
  const r = el.getBoundingClientRect();
  const cx = Math.round(r.left + r.width / 2), cy = Math.round(r.top + r.height / 2);
  const mine = (x, y) => { const e = document.elementFromPoint(x, y); return !!e && (e === el || el.contains(e)); };
  if (!mine(cx, cy)) return null;
  const grow = (dx, dy) => { let n = 0; while (n < 200 && mine(cx + dx * (n + 1), cy + dy * (n + 1))) n += 1; return n; };
  return { w: grow(-1, 0) + grow(1, 0) + 1, h: grow(0, -1) + grow(0, 1) + 1 };
}`;

for (const path of PAGES) {
  const tag = path.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  const ctx = await b.newContext({
    viewport: { width: W, height: 900 },
    deviceScaleFactor: 2,
    isMobile: W < 700,
    hasTouch: W < 700,
  });
  await offline(ctx).catch(() => {});
  const p = await ctx.newPage();
  const errs = [];
  p.on("pageerror", (e) => errs.push(String(e)));
  await p.goto(`http://127.0.0.1:${PORT}${path}.html`, { waitUntil: "load" });
  await p.waitForTimeout(900);

  console.log(`\n== ${path}`);
  // 面の頭。近道の札が出ているか
  await p.screenshot({ path: `${OUT}/${tag}-head.png` });
  const jump = await p.$eval(".nday-jump a", (a) => a.textContent?.trim()).catch(() => null);
  console.log(`  頭の近道: ${jump ?? "（無し）"}`);

  /* 国の面では畳んで置いてある（街が3つ並ぶので）。**開けてから測る。**
     閉じたまま数えると「0行」と出て、出ていないのか畳んであるのか分からない。 */
  await p.$$eval("section.nshop details", (ds) => ds.forEach((d) => (d.open = true)));
  await p.waitForTimeout(300);
  const panels = await p.$$("section.nshop");
  console.log(`  お店の区画 ${panels.length}枚`);
  for (let i = 0; i < panels.length; i += 1) {
    const sec = panels[i];
    // 見出しは `h2`（日の面）か、畳みの題（国の面）のどちらか
    const h2 = await sec.$eval("h2, .fold b", (e) => e.textContent?.trim());
    await sec.scrollIntoViewIfNeeded();
    await p.waitForTimeout(250);
    await sec.screenshot({ path: `${OUT}/${tag}-${i}-closed.png` });
    const groups = await sec.$$eval(".nshop-g", (gs) =>
      gs.map((g) => [g.querySelector("h3")?.textContent?.trim(), g.querySelectorAll(".nsp").length]),
    );
    console.log(`  [${h2}]  ${groups.map(([n, c]) => `${n}:${c}`).join("  ")}`);
    // 1行目の行き先を字で見る。**座標で開いているか**
    const href = await sec.$eval(".nsp-go", (a) => a.getAttribute("href")).catch(() => null);
    console.log(`    1行目の行き先: ${href}`);
    /* 押しどころの実寸。**1行ずつ画面の中へ送ってから測る。**
       `elementFromPoint` は画面の中しか答えないので、送らずに測ると
       下のほうの行が全部 `null` になり、「48px割れ 9件」と嘘の数が出る。 */
    const rows = await sec.$$(".nsp-go");
    const hits = [];
    for (const row of rows) {
      await row.scrollIntoViewIfNeeded();
      hits.push(await row.evaluate((el, fn) => eval(fn)(el), HIT));
    }
    const bad = hits.filter((h) => !h || h.h < 48 || h.w < 48);
    const hs = hits.filter(Boolean).map((h) => h.h);
    console.log(`    行 ${hits.length}件  高さ ${Math.min(...hs)}〜${Math.max(...hs)}px  48px割れ ${bad.length}件`);
  }

  // 畳みを全部開く。**押した先が空でないか**
  for (let i = 0; i < 12; i += 1) {
    const more = await p.$$("section.nshop .longer");
    let pushed = 0;
    for (const btn of more) {
      const t = (await btn.textContent()) || "";
      if (!t.includes("だす")) continue;
      await btn.click();
      pushed += 1;
    }
    if (pushed === 0) break;
    await p.waitForTimeout(150);
  }
  const opened = await p.$$eval("section.nshop", (ss) =>
    ss.map((s) => [
      s.querySelector("h2, .fold b")?.textContent?.trim(),
      s.querySelectorAll(".nsp").length,
    ]),
  );
  for (const [h, n] of opened) console.log(`  ぜんぶ開いて [${h}] ${n}行`);
  const p0 = await p.$("section.nshop");
  if (p0) {
    await p0.scrollIntoViewIfNeeded();
    await p.waitForTimeout(250);
    await p0.screenshot({ path: `${OUT}/${tag}-open.png` });
  }

  const over = await p.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  console.log(`  横あふれ ${over}px  JSエラー ${errs.length}件`);
  if (errs.length) console.log("   ", errs.slice(0, 3).join(" / "));
  await ctx.close();
}
await b.close();
