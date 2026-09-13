/**
 * 触った規則が、**どの面に当たるか**を数える。
 *
 *   SPORT=4800 node tools/sprites/hitspan.mjs
 *
 * `tokens.css` と `cards.css` は島の全面に読まれる。だから
 * 「1行だけ直した」つもりでも、**巻き添えになる面が何枚あるか**を
 * 数えずに触ってはいけない。ここはその数を出すためだけの道具。
 *
 * **書き出した HTML を grep しない。** ここで数える押しどころは
 * ほとんどが画面の中で作られるもの（カード・机の道具・消す確かめ）なので、
 * 焼いた HTML には1つも出てこない。開いて数える。
 *
 * 畳みは開ける。机の札は1つずつ押す。`/me` `/me/desk` は差し込みで開ける。
 */
import { chromium } from "playwright-core";
import { offline } from "./route.mjs";
import { apply } from "./asme.mjs";

const PORT = process.env.SPORT || "4800";
/** 数える規則。触ったものと、触っていないが同じ書き方の残りを並べる。 */
const CLS = [
  ".mp-send", ".mp-donor-hint", ".mp-sc-more", ".nph-post-go", ".trip-week-plus",
  ".nstudio-go", ".akd-drop-yes", ".akd-drop-no",
  ".akd-plan", ".ifoot-privacy",
  // 触っていない残り（報告に数で出すため）
  ".rc-spin", ".rc-quiet", ".rc-line", ".atrace-step > button",
];

/** 面の一覧は `popcheck.mjs` と同じ並び＋机とカードの中。 */
const PAGES = [
  "/", "/about", "/streams", "/streams/cooking", "/kitchen", "/kitchen/egg-sandwich",
  "/legends", "/legends/iran-walk", "/apps", "/apps/nanitabeyo", "/next", "/next/new",
  "/board", "/map", "/map/france", "/atlas", "/nordic", "/nordic/guide", "/nordic/finland",
  "/nordic/photos", "/nordic/day/2", "/cards", "/all", "/friends", "/now", "/design",
  "/privacy", "/me", "/me/desk", "/me/roulette", "/me/remote", "/roulette",
];
/** 机の道具は札を押さないと作られない。1面の中で9つ押して回る。 */
const TABS = ["付箋", "企画", "カード", "写真", "いまどこ", "配信", "投げ銭", "キャラ", "スパチャ", "OBS"];

const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox"] });
const ctx = await b.newContext({ viewport: { width: 390, height: 900 }, isMobile: true, hasTouch: true, reducedMotion: "reduce" });
await apply(ctx, { admin: true });
await offline(ctx).catch(() => {});
const p = await ctx.newPage();
await p.addInitScript(() => { try { localStorage.setItem("ayato-island-arrived", "1"); } catch {} });

const hit = Object.fromEntries(CLS.map((c) => [c, []]));
for (const path of PAGES) {
  const url = `http://localhost:${PORT}${path === "/" ? "/index.html" : path + ".html"}`;
  const ok = await p.goto(url, { waitUntil: "networkidle", timeout: 60000 }).then(() => true).catch(() => false);
  if (!ok) { console.log(`${path}  取れず`); continue; }
  await p.waitForTimeout(1200);
  const seen = new Set();
  const count = async () => {
    await p.evaluate(() => { for (const d of document.querySelectorAll("details")) d.open = true; });
    await p.waitForTimeout(300);
    for (const c of CLS) if (await p.$$eval(c, (e) => e.length).catch(() => 0)) seen.add(c);
  };
  await count();
  // 札のある面は、札を1つずつ押して中を見る
  if (await p.$$eval(".mp-tab", (e) => e.length).catch(() => 0)) {
    for (const t of TABS) {
      const c = await p.locator(".mp-tab", { hasText: new RegExp(`^${t}`) }).first().click({ timeout: 1500 }).then(() => true).catch(() => false);
      if (!c) continue;
      await p.waitForTimeout(900);
      await count();
    }
  }
  // カードを1枚ひらく（`.nstudio-go` と消す確かめはこの中）
  if (await p.$$eval(".akd-tile", (e) => e.length).catch(() => 0)) {
    await p.locator(".akd-tile").first().click({ timeout: 3000 }).catch(() => {});
    await p.waitForTimeout(1500);
    await p.locator(".akd-drop-open").first().click({ timeout: 2000 }).catch(() => {});
    await p.waitForTimeout(600);
    await count();
  }
  for (const c of seen) hit[c].push(path);
  console.log(`${path}  ${[...seen].join(" ") || "-"}`);
}
await b.close();
console.log("\n-- 規則ごとの、当たる面の数");
for (const c of CLS) console.log(`  ${c.padEnd(22)} ${String(hit[c].length).padStart(2)}面  ${hit[c].join(" ")}`);
