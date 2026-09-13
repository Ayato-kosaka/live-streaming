/**
 * `/me` と `/me/desk` に出てくる**書く欄の顔が、何種類あるか**を数える。
 *
 * `mesweep.mjs` は「ブラウザ既定のまま出ているか」しか見ない。素の顔を
 * していなくても、**島の中で顔が3通りに割れている**なら、それはそれで
 * 「同じことを言う面が2つある」（この仕事の6番）。目で見ると、島の欄には
 * 彫った溝のあるものと無いものが混ざっている。数で出す。
 *
 *   SPORT=4600 node tools/sprites/mefaces.mjs
 *
 * 出るのは、顔（字・地・枠・角・彫り）ごとにまとめた一覧。
 * 同じ用事（字を打つ）の部品が別の顔をしていたら、そこに並ぶ。
 */
import { chromium } from "playwright-core";
import { seed } from "./meseed.mjs";
import { offline } from "./route.mjs";

const PORT = process.env.SPORT || "4600";
const SCENES = [
  ["me-islandme", "/me.html", null, true],
  ["desk-photo", "/me/desk.html", "写真", false],
  ["desk-place", "/me/desk.html", "いまどこ", false],
  ["desk-video", "/me/desk.html", "配信", false],
  ["desk-sticky", "/me/desk.html", "付箋", false],
  ["desk-plan", "/me/desk.html", "企画", false],
  ["desk-donor", "/me/desk.html", "投げ銭", false],
  ["desk-chara", "/me/desk.html", "キャラ", false],
  ["desk-obs", "/me/desk.html", "OBS", false],
];

const b = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--no-sandbox"],
});
const faces = new Map();
for (const [id, page, tab, open] of SCENES) {
  const ctx = await b.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    reducedMotion: "reduce",
  });
  await seed(ctx, { admin: true, mode: "ok" });
  await offline(ctx).catch(() => {});
  const p = await ctx.newPage();
  await p.goto(`http://localhost:${PORT}${page}`, { waitUntil: "networkidle", timeout: 60000 }).catch(() => {});
  await p.waitForTimeout(1400);
  if (tab) {
    await p.locator(".mp-tab", { hasText: new RegExp(`^${tab}`) }).first().click({ timeout: 5000 }).catch(() => {});
    await p.waitForTimeout(1500);
  }
  if (open) {
    await p.evaluate(() => { for (const d of document.querySelectorAll("details")) d.open = true; });
    await p.waitForTimeout(500);
  }
  const rows = await p.evaluate(() => {
    const out = [];
    for (const el of document.querySelectorAll("input, select, textarea")) {
      const cs = getComputedStyle(el);
      if (cs.display === "none" || el.offsetParent === null) continue;
      if (el.type === "checkbox" || el.type === "radio" || el.type === "file") continue;
      out.push({
        what: el.tagName.toLowerCase() + (el.className ? "." + el.className.split(/\s+/).join(".") : ""),
        label: (el.closest("label")?.querySelector("span")?.textContent || "").trim().slice(0, 14),
        face: [
          `地 ${cs.backgroundColor}`,
          `枠 ${cs.borderTopWidth} ${cs.borderTopColor}`,
          `角 ${cs.borderTopLeftRadius}`,
          `彫り ${cs.boxShadow === "none" ? "なし" : "あり"}`,
          `字 ${cs.fontSize}/${cs.fontWeight}`,
        ].join("  "),
      });
    }
    return out;
  });
  for (const r of rows) {
    if (!faces.has(r.face)) faces.set(r.face, []);
    faces.get(r.face).push(`${id} ${r.what}「${r.label}」`);
  }
  await ctx.close();
}
await b.close();

console.log(`書く欄の顔は ${faces.size} 種類\n`);
let i = 0;
for (const [face, who] of faces) {
  console.log(`--- ${++i}）${face}`);
  const uniq = [...new Set(who.map((w) => w.replace(/「.*/, "")))];
  console.log(`    ${who.length}か所 / ${uniq.join(" , ")}`);
}
