/**
 * 島に降りたときの1画面に、いくつのものが載っていて、何文字出ているかを数える。
 *
 * 「ごちゃごちゃしている」を主観で言わないための道具。
 *   ものの数 … 画面の中に見えている、独立した板・札・バッジ・ボタン・字の塊
 *   文字数   … 見えているテキストノードの合計（空白と改行は除く）
 *   面積     … UI（島の絵の上に載っている DOM）の外接矩形の和 ÷ 画面
 *
 * 本物のあつ森は、島を歩いているあいだ**画面に字が1文字も無い**
 * （`/tmp/acref/ref_NH_Plaza_Exercise.jpg` と `ref_Player_at_Plaza_NH.jpg`）。
 * そこが上限の目安。
 *
 *   SPORT=4141 node clutter.mjs                  島に降りたところ
 *   SPORT=4141 STATE=1 node clutter.mjs          住人の名前が出ている日（本番はこちら）
 *   SPORT=4141 OPENBAR=1 node clutter.mjs        行き先をひらいたところ
 *   SPORT=4141 FRESH=1 node clutter.mjs          初めて来た人
 *   SPORT=4141 WIDE=1 node clutter.mjs           PC(1440×900)
 *   SPORT=4141 TIME=day SHOT=/tmp/a.png node clutter.mjs   並べて撮るとき
 *
 * 読み上げにだけ残してある字（1px に切り抜いてあるもの）は数えない。
 */
import { chromium } from "playwright-core";
import { offline } from "./route.mjs";

const SPORT = process.env.SPORT || "4140";
const WIDE = process.env.WIDE === "1";
const SHOT = process.env.SHOT || "";
const FRESH = process.env.FRESH === "1";
const OPENBAR = process.env.OPENBAR === "1";

const STATE = process.env.STATE === "1";

const b = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--no-sandbox"],
});
const ctx = await b.newContext(
  WIDE
    ? { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 }
    : { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 },
);
await offline(ctx, { photo: "/home/user/live-streaming/tools/sprites/photo-480.jpg" });
// 本番では live の /state が返ってきて、住人の名札が出る。
// 出ている状態を見ないと「1画面に何個」を数えたことにならない
if (STATE) {
  const { readFileSync } = await import("fs");
  const src = readFileSync("/home/user/live-streaming/site/content/residents.ts", "utf8");
  const chans = [...src.matchAll(/channel:\s*"([^"]+)"/g)].map((m) => m[1]);
  const names = ["ゆき", "たかし", "みどり", "こうへい", "さくら", "けんた", "あおい", "りょう", "なな", "だいち", "ひなた", "しょう", "まゆ", "とおる", "えみ", "かい", "つばさ", "のぞみ", "はると", "りん", "そら", "みなと"];
  await ctx.route(/island-api\/state/, (r) =>
    r.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ residents: chans.map((c, i) => ({ channelId: c, name: names[i % names.length] })) }),
    }),
  );
}
const p = await ctx.newPage();
await p.addInitScript((fresh) => {
  try {
    if (!fresh) {
      localStorage.setItem("ayato-island-arrived", "2026-09-04");
      localStorage.setItem("ayato-island-walked", "1");
      localStorage.setItem("ayato-island-today", "2026-09-05");
    }
  } catch {}
}, FRESH);
await p.goto(`http://localhost:${SPORT}/index.html`, { waitUntil: "load", timeout: 60000 });
await p.waitForTimeout(5000);
if (OPENBAR) {
  await p.click(".bar-toggle").catch(() => {});
  await p.waitForTimeout(600);
}
// 時間帯の色。並べて比べるときは同じ時間に揃える（既定は実時刻のまま）
if (process.env.TIME) await p.evaluate((t) => { document.documentElement.dataset.time = t; }, process.env.TIME);
// 島は rAF で動くので、撮る前に止める
await p.evaluate(() => {
  window.requestAnimationFrame = () => 0;
  for (const el of document.querySelectorAll("*")) el.style.animationPlayState = "paused";
});
await p.waitForTimeout(300);

const r = await p.evaluate(() => {
  const W = innerWidth;
  const H = innerHeight;
  const vis = (el) => {
    const s = getComputedStyle(el);
    if (s.display === "none" || s.visibility === "hidden" || +s.opacity === 0) return false;
    const b = el.getBoundingClientRect();
    return b.width > 0 && b.height > 0 && b.bottom > 0 && b.top < H && b.right > 0 && b.left < W;
  };
  const shown = (el) => {
    const s = getComputedStyle(el);
    if (s.display === "none" || s.visibility === "hidden" || +s.opacity === 0) return false;
    // 読み上げにだけ残してある字（1px に切り抜いてあるもの）は「出ていない」
    if (s.clipPath && s.clipPath !== "none") {
      const b = el.getBoundingClientRect();
      if (b.width <= 2 || b.height <= 2) return false;
    }
    return true;
  };
  const onScreen = (el) => {
    let n = el;
    while (n && n !== document.body) {
      if (!shown(n)) return false;
      n = n.parentElement;
    }
    const b = el.getBoundingClientRect();
    return b.width > 0 && b.height > 0 && b.bottom > 0 && b.top < H && b.right > 0 && b.left < W;
  };

  // ---- 文字数。見えているテキストノードだけ
  let chars = 0;
  const texts = [];
  const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n = w.nextNode(); n; n = w.nextNode()) {
    const t = (n.nodeValue || "").replace(/\s+/g, "");
    if (!t) continue;
    const el = n.parentElement;
    if (!el || el.closest(".sr-only") || el.closest("[aria-hidden='true']") === el.closest("body")) {
      /* aria-hidden は見えているので数える。sr-only だけ除く */
    }
    if (el.closest(".sr-only")) continue;
    if (!onScreen(el)) continue;
    // 画面の外にはみ出した部分は数えない（範囲の矩形で判定）
    const rg = document.createRange();
    rg.selectNodeContents(n);
    const rc = rg.getBoundingClientRect();
    if (rc.width === 0 || rc.bottom <= 0 || rc.top >= H || rc.right <= 0 || rc.left >= W) continue;
    chars += t.length;
    texts.push(t);
  }

  // ---- ものの数。島の絵の上に載っている、独立した部品
  const SEL = [
    ".spot-mark", // 建物の札
    ".spot-bang",
    ".spot-badge",
    ".who-name", // 住人の名札
    ".here", // いまここに居る人
    ".today", // 今日の島
    ".bar-toggle",
    ".bar-spot",
    ".stage-view",
    ".stage-atlas",
    ".stage-index",
    ".talkbox",
    ".walk-hint",
    ".hero-logo",
    ".scroll-cue",
  ];
  const parts = [];
  for (const s of SEL) {
    for (const el of document.querySelectorAll(s)) {
      if (!onScreen(el)) continue;
      const b = el.getBoundingClientRect();
      parts.push({ sel: s, w: Math.round(b.width), h: Math.round(b.height), t: (el.textContent || "").replace(/\s+/g, " ").trim().slice(0, 24) });
    }
  }

  // ---- UI が覆っている面積（重なりは1回だけ数える。8px の格子で塗る）
  const G = 4;
  const cols = Math.ceil(W / G);
  const rows = Math.ceil(H / G);
  const grid = new Uint8Array(cols * rows);
  const paint = (el) => {
    const b = el.getBoundingClientRect();
    const x0 = Math.max(0, Math.floor(b.left / G));
    const x1 = Math.min(cols, Math.ceil(b.right / G));
    const y0 = Math.max(0, Math.floor(b.top / G));
    const y1 = Math.min(rows, Math.ceil(b.bottom / G));
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) grid[y * cols + x] = 1;
  };
  for (const s of SEL) for (const el of document.querySelectorAll(s)) if (onScreen(el)) paint(el);
  let filled = 0;
  for (const v of grid) filled += v;

  return { W, H, chars, texts, parts, cover: filled / grid.length };
});

console.log(`■ ${r.W}×${r.H}${OPENBAR ? "（行き先をひらいた）" : ""}${FRESH ? "（初めて来た人）" : ""}${STATE ? "（住人の名前が出ている日）" : ""}`);
console.log(`  1画面のもの   ${r.parts.length} 個`);
console.log(`  1画面の文字   ${r.chars} 文字`);
console.log(`  UI が覆う面積 ${(r.cover * 100).toFixed(1)}%  （残り ${(100 - r.cover * 100).toFixed(1)}% が島の絵）`);
const by = {};
for (const q of r.parts) by[q.sel] = (by[q.sel] || 0) + 1;
console.log("  内訳:", Object.entries(by).map(([k, v]) => `${k}×${v}`).join(" "));
console.log("  字:", r.texts.join(" / "));
if (SHOT) await p.screenshot({ path: SHOT });
await b.close();
