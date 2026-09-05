// 3周目・/next /board /friends /now の検品用。撮り終わったら消す。
// 全面を1枚で撮ると PNG が 780×10000 を超えて、混んでいるときに落ちる。
// 画面ぶんだけ切って撮る。
import { chromium } from "playwright-core";
import fs from "node:fs";

const PORT = process.env.PORT || "3020";
const OUT = process.env.OUT || "/tmp/r3nx";
const TAG = process.env.TAG || "a";
const W = +(process.env.W || 390), H = +(process.env.H || 844);
const pages = (process.env.PAGES || "/next").split(",");
/** 撮る画面の番号（0=1画面目）。省略すると測るだけ。 */
const shots = (process.env.SHOTS || "").split(",").filter(Boolean).map(Number);

const IDEAS = [
  { id: "i1", text: "1日だけ、コンビニの新商品だけで生きる配信", name: "たまご", votes: 14, createdAt: "2026-09-01T10:00:00.000Z" },
  { id: "i2", text: "視聴者が決めた道を、地図を見ずに歩ききる", votes: 9, createdAt: "2026-09-02T10:00:00.000Z", status: "picked" },
  { id: "i3", text: "現地の人に聞いて、その日いちばん安い晩ごはんを食べる", name: "きの", votes: 5, createdAt: "2026-09-03T10:00:00.000Z" },
  { id: "i4", text: "食材しばりで、じゃがいもだけの3品", votes: 2, createdAt: "2026-09-04T10:00:00.000Z" },
];
const NOTES = [
  { id: "n1", planId: "food-wine-fest", text: "ケーブルカーは行列するから朝いちがいいよー", createdAt: "2026-09-01T10:00:00.000Z" },
  { id: "n2", planId: "food-wine-fest", text: "ヒンカリは頼みすぎ注意", createdAt: "2026-09-02T10:00:00.000Z" },
  { id: "n3", planId: "nordic", text: "手袋は薄手と厚手の2枚重ねがいい", createdAt: "2026-09-02T11:00:00.000Z" },
];
const POLL = {
  poll: { id: "p1", question: "今夜の1品、どっちが見たい?", total: 138,
    options: [{ id: "a", label: "現地の市場で買ったものだけ", votes: 82 }, { id: "b", label: "ホテルの湯沸かしポットだけ", votes: 56 }],
    openUntil: null },
};

const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox"] });
const ctx = await b.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 2, isMobile: W < 640 });
await ctx.route(/googleusercontent\.com/, r => r.fulfill({ path: "/home/user/live-streaming/site/public/characters/ayato.png" }));
await ctx.route(/upload\.wikimedia\.org/, r => r.fulfill({ path: "/home/user/live-streaming/site/public/og.png" }));
await ctx.route(/\/island-api\/.*/, (r) => {
  const u = r.request().url();
  const j = (o) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(o) });
  if (u.includes("/state")) return j({ ideas: IDEAS, notes: NOTES, residents: [{ icon: "18okO58dwMaci-9R1go0Rj1dTqliSWlz3", name: "あおい" }, { icon: "1NLsB-D-jeUxQ3viqwhJu2GkRRXsYXAaQ", name: "つの" }], stats: {} });
  if (u.includes("/ideas")) return j({ ideas: IDEAS });
  if (u.includes("/poll")) return j(POLL);
  return j({});
});

const rows = [];
for (const path of pages) {
  const p = await ctx.newPage();
  const errs = [];
  p.on("pageerror", e => errs.push(String(e).slice(0, 200)));
  await p.addInitScript(() => localStorage.setItem("ayato-island-arrived", "1"));
  if (process.env.POLLED) await p.addInitScript(() => localStorage.setItem("ayato-island-poll", "p1\ta"));
  await p.goto(`http://localhost:${PORT}${path}`, { waitUntil: "domcontentloaded", timeout: 120000 });
  await p.waitForTimeout(2600);
  const m = await p.evaluate(() => {
    const doc = document.documentElement;
    const h1 = document.querySelector("h1");
    const ph = document.querySelector(".phead");
    const over = [...document.querySelectorAll("main *")]
      .filter(e => e.scrollWidth > e.clientWidth + 2 && !["auto", "scroll"].includes(getComputedStyle(e).overflowX))
      .slice(0, 4).map(e => (e.className || e.tagName) + ":" + e.scrollWidth + ">" + e.clientWidth);
    return {
      height: doc.scrollHeight,
      h1: h1 ? h1.textContent.trim() : "(なし)",
      contentTop: ph ? Math.round(ph.getBoundingClientRect().bottom + window.scrollY) : 0,
      wide: doc.scrollWidth > window.innerWidth,
      over,
    };
  });
  const name = path.replace(/\//g, "_") || "_top";
  for (const i of shots) {
    await p.evaluate((y) => window.scrollTo(0, y), i * H);
    await p.waitForTimeout(500);
    await p.screenshot({ path: `${OUT}/${TAG}${name}_${i}.png` });
  }
  rows.push({ path, ...m, screens: (m.height / H).toFixed(1), errs });
  await p.close();
}
await b.close();
console.log(rows.map(r => `${r.path}\t${r.height}px\t${r.screens}画面\t中身開始 ${r.contentTop}px\th1「${r.h1}」${r.wide ? "\t★横あふれ" : ""}${r.over.length ? "\t" + r.over.join(" | ") : ""}${r.errs.length ? "\tJS:" + r.errs.join(";") : ""}`).join("\n"));
fs.writeFileSync(`${OUT}/${TAG}.json`, JSON.stringify(rows, null, 1));
