/**
 * お店の区画を、**4つの幅で**測る（390 / 820 / 1440 / 1920）。
 *
 *   SPORT=4220 node tools/sprites/shopwide.mjs
 *
 * 見るのは3つ:
 *
 *   1. 横あふれ … `scrollWidth - clientWidth`。**`getBoundingClientRect` では見ない**
 *      （SVG の中の path が外へ出ていてもページは動かない。`island-misses.md` #72）
 *   2. 押しどころ … 行の当たり判定。`elementFromPoint` で実測（48px 以上か）
 *   3. 1行の字数 … PC 幅で本文が伸びきっていないか（45字まで）。
 *      **行ごとの箱**から出す。要素の外接矩形で割ると、2行に折り返した段落が
 *      「1行ぶんの倍の字数」と出る（`pcsweep.mjs` と同じ数え方）
 */
import { chromium } from "playwright-core";
import { offline } from "./route.mjs";

const PORT = process.env.SPORT || "4220";
const PAGES = (process.env.PAGES || "/nordic/day/2,/nordic/day/3,/nordic/lithuania,/nordic/poland").split(",");
const WIDTHS = (process.env.WIDTHS || "390x844,820x1180,1440x900,1920x1080")
  .split(",")
  .map((s) => s.split("x").map(Number));

const b = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--no-sandbox"],
});

const HIT = `(el) => {
  const r = el.getBoundingClientRect();
  const cx = Math.round(r.left + r.width / 2), cy = Math.round(r.top + r.height / 2);
  const mine = (x, y) => { const e = document.elementFromPoint(x, y); return !!e && (e === el || el.contains(e)); };
  if (!mine(cx, cy)) { const e = document.elementFromPoint(cx, cy); return { w: 0, h: 0, fail: (e ? e.tagName + "." + (e.className || "") : "null") + "@" + cx + "," + cy + " rect=" + Math.round(r.top) + "x" + Math.round(r.height) }; }
  const grow = (dx, dy) => { let n = 0; while (n < 400 && mine(cx + dx * (n + 1), cy + dy * (n + 1))) n += 1; return n; };
  return { w: grow(-1, 0) + grow(1, 0) + 1, h: grow(0, -1) + grow(0, 1) + 1 };
}`;

/** お店の区画の中の字だけを、**行ごとの箱**で数える。
 *
 * **字の流れている箱だけを数える**（`pcsweep.mjs` と同じ除き方）。
 * 中の子に `display:grid` のものがあると、Range の箱が**行ぜんぶの幅**になる。
 * この除き方を入れる前は、1行 53字（実物は 21字）と出ていた。
 * 押しどころの行（`li.nsp`）は中身が grid なので、ここでは数えない。 */
const CHARS = `() => {
  const out = [];
  const SEL = "section.nshop p, section.nshop li, section.nshop h2, section.nshop h3, section.nshop b, section.nshop i, section.nshop em";
  for (const el of document.querySelectorAll(SEL)) {
    const t = (el.textContent || "").trim();
    if (t.length < 8) continue;
    const cs = getComputedStyle(el);
    if (cs.display === "none") continue;
    let flow = true;
    for (const c of el.children) {
      const d = getComputedStyle(c).display;
      if (!d.startsWith("inline") && d !== "ruby" && d !== "contents") { flow = false; break; }
    }
    if (!flow) continue;
    const rng = document.createRange();
    rng.selectNodeContents(el);
    const rects = [...rng.getClientRects()].filter((r) => r.width > 4 && r.height > 4);
    if (!rects.length) continue;
    const fs = parseFloat(cs.fontSize) || 14;
    const wide = Math.max(...rects.map((r) => r.width));
    out.push({ ch: Math.round(wide / fs), t: t.slice(0, 22), c: el.className || el.tagName });
  }
  return out.sort((a, b) => b.ch - a.ch).slice(0, 3);
}`;

for (const [W, H] of WIDTHS) {
  console.log(`\n###### ${W}x${H}`);
  for (const path of PAGES) {
    const ctx = await b.newContext({
      viewport: { width: W, height: H },
      deviceScaleFactor: 1,
      isMobile: W < 700,
      hasTouch: W < 700,
      reducedMotion: "reduce",
    });
    await offline(ctx).catch(() => {});
    const p = await ctx.newPage();
    await p.goto(`http://127.0.0.1:${PORT}${path}.html`, { waitUntil: "load" });
    await p.waitForTimeout(600);
    // 畳んである国の面は開けてから測る（閉じたままだと中身を一度も見ない）
    await p.$$eval("section.nshop details", (ds) => ds.forEach((d) => (d.open = true)));
    await p.waitForTimeout(200);

    const over = await p.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    const rows = await p.$$("section.nshop .nsp-go");
    const hits = [];
    for (const row of rows) {
      await row.scrollIntoViewIfNeeded();
      /* **頭の帯の下から出す。** `scrollIntoViewIfNeeded` は「見えていれば動かない」
         ので、行が固定の帯の裏に入ったままになることがある。そこで測ると
         `elementFromPoint` が帯を返して「測れず」になり、**押せる行が
         「48px割れ」として挙がる**（国の面で、区画の1行目だけ3件そう出た）。 */
      await row.evaluate((el) => {
        const r = el.getBoundingClientRect();
        if (r.top < 150) window.scrollBy(0, r.top - 150);
      });
      /* **送ったあと、1フレーム待ってから測る。**
         `elementFromPoint` が見ているのは最後に合成された絵の当たり判定で、
         `getBoundingClientRect` はその場で組み直した値。送っている最中に測ると、
         **1フレームぶんずれた相手**が返って「測れず」になる。
         国の面で、区画の1行目だけ3件そう出た（実物は 298x121 で押せている）。 */
      await row.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
      hits.push(await row.evaluate((el, fn) => eval(fn)(el), HIT));
    }
    const badRows = [];
    for (let i = 0; i < hits.length; i += 1) {
      const h = hits[i];
      if (h && h.h >= 48 && h.w >= 48) continue;
      badRows.push(`${h ? (h.fail ? `測れず[${h.fail}]` : `${h.w}x${h.h}`) : "null"}:${(await rows[i].textContent())?.trim().slice(0, 12)}`);
    }
    const bad = badRows.length;
    const hs = hits.filter((h) => h && !h.fail).map((h) => h.h);
    const chars = await p.evaluate((fn) => eval(fn)(), CHARS);
    console.log(
      `${path.padEnd(20)} あふれ ${String(over).padStart(3)}px  行 ${String(rows.length).padStart(3)}件 ` +
        `高さ ${Math.min(...hs)}〜${Math.max(...hs)}px 48px割れ ${bad}  ` +
        `いちばん長い行 ${chars.map((c) => `${c.ch}字(${String(c.c).split(" ")[0]})`).join(" ")}`,
    );
    if (bad) console.log(`    48px割れ: ${badRows.join(" / ")}`);
    await ctx.close();
  }
}
await b.close();
