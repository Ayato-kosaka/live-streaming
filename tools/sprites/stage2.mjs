/* 島のステージ2周目の実測。確かめ用の一時スクリプト（終わったら消す）。 */
import { chromium } from "playwright-core";

const PORT = process.env.PORT || "3012";
const OUT = process.env.OUT || "/tmp/r2b";
const FRESH = process.env.FRESH === "1"; // 初めて来た人（localStorage を空のまま）
const TIME = process.env.TIME || ""; // "night" などを ?t= で渡す

const b = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--no-sandbox"],
});
const ctx = await b.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
});
await ctx.route(/googleusercontent\.com/, (r) =>
  r.fulfill({ path: "/home/user/live-streaming/site/public/characters/ayato.png" }),
);
const p = await ctx.newPage();
p.on("pageerror", (e) => console.log("[pageerror]", String(e).slice(0, 300)));
if (!FRESH) {
  await p.addInitScript(() => {
    localStorage.setItem("ayato-island-arrived", "2026-09-05");
    localStorage.setItem("ayato-island-walked", "1");
    localStorage.setItem("ayato-island-today", "2026-09-05");
  });
}
const url = `http://localhost:${PORT}/${TIME ? `?t=${TIME}` : ""}`;
await p.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
await p.waitForTimeout(FRESH ? 5200 : 2600);

const m = await p.evaluate(() => {
  const st = document.querySelector(".stage");
  const r = st.getBoundingClientRect();
  const area = r.width * r.height;
  // ステージの上に乗っている道具ぜんぶ
  const sel = [".island-bar", ".today", ".stage-view", ".hero-ui .hero-copy", ".walk-hint", ".talkbox"];
  const parts = [];
  let covered = 0;
  for (const s of sel) {
    for (const el of document.querySelectorAll(s)) {
      const q = el.getBoundingClientRect();
      if (!q.width || !q.height) continue;
      const x0 = Math.max(q.left, r.left), x1 = Math.min(q.right, r.right);
      const y0 = Math.max(q.top, r.top), y1 = Math.min(q.bottom, r.bottom);
      if (x1 <= x0 || y1 <= y0) continue;
      const a = (x1 - x0) * (y1 - y0);
      covered += a;
      parts.push({ s, top: Math.round(q.top), h: Math.round(q.height), w: Math.round(q.width), pct: +(a / area * 100).toFixed(1) });
    }
  }
  return {
    stage: { w: Math.round(r.width), h: Math.round(r.height) },
    pct: +(covered / area * 100).toFixed(1),
    parts,
    barH: Math.round(document.querySelector(".island-bar")?.getBoundingClientRect().height ?? 0),
    todayOpen: !!document.querySelector(".today.is-open"),
    text: [...document.querySelectorAll(".stage, .hero-ui")]
      .map((e) => e.innerText.replace(/\s+/g, " ").trim())
      .join(" | ")
      .slice(0, 400),
  };
});
console.log(JSON.stringify(m, null, 1));

await p.screenshot({ path: `${OUT}/${FRESH ? "fresh" : "return"}${TIME || ""}.png` });
await b.close();
