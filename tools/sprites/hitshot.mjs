/**
 * 直す前と直したあとを**並べて見るための絵**を撮る。
 *
 *   SPORT=4800 TAG=after node tools/sprites/hitshot.mjs
 *
 * 面ぜんぶを撮ると、4,000px の中のどこが変わったのか分からない。
 * ここは**変わったところの箱だけ**を切り出す（カードの帯・足元・
 * 押せないときのボタン）。dpr2。
 *
 * 出るもの: /tmp/hitshot/<TAG>/*.png
 */
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";
import { offline } from "./route.mjs";
import { apply } from "./asme.mjs";

const PORT = process.env.SPORT || "4800";
const TAG = process.env.TAG || "after";
const OUT = `/tmp/hitshot/${TAG}`;
mkdirSync(OUT, { recursive: true });

const SCENES = [
  {
    id: "me-card", page: "/me.html", admin: false,
    // 4本積まれた日のカード。帯だけでなく、絵と日付ごと切る
    pick: ".akd:has(a.akd-plan + a.akd-plan)",
    async open(p) {
      await p.locator(".mp-tab", { hasText: /^カード/ }).first().click({ timeout: 5000 }).catch(() => {});
      await p.waitForTimeout(1800);
    },
  },
  {
    id: "friends-card", page: "/friends.html", admin: false,
    pick: ".rzk-cards",
    async open(p) {
      for (let i = 0; i < 25; i++) {
        if (await p.$$eval(".akd", (e) => e.length)) break;
        const ok = await p.locator(".rzk-pager button").last().click({ timeout: 2000 }).then(() => true).catch(() => false);
        if (!ok) break;
        await p.waitForTimeout(700);
      }
      await p.waitForTimeout(800);
    },
  },
  { id: "cards-day", page: "/cards.html", admin: false, pick: ".akd-day" },
  { id: "foot-board", page: "/board.html", pick: ".ifoot" },
  { id: "foot-about", page: "/about.html", pick: ".ifoot" },
  {
    id: "off-desk-video", page: "/me/desk.html", tab: "配信", pick: ".mp-tool-body, .mp-tool",
    dis: true,
  },
  { id: "off-desk-donor", page: "/me/desk.html", tab: "投げ銭", pick: ".mp-donor-hints", dis: true, hints: true },
  { id: "off-desk-fund", page: "/me/desk.html", tab: "スパチャ", pick: ".mp-sc-more", dis: true },
  {
    id: "off-cards-sheet", page: "/cards.html", pick: ".akd-sheet-foot, .akd-drop", dis: true,
    async open(p) {
      await p.locator(".akd-tile").first().click({ timeout: 5000 }).catch(() => {});
      await p.waitForTimeout(2000);
      await p.locator(".akd-drop-open").first().click({ timeout: 3000 }).catch(() => {});
      await p.waitForTimeout(800);
    },
  },
];

const DIS = ".mp-send,.mp-donor-hint,.mp-sc-more,.nph-post-go,.trip-week-plus,.nstudio-go,.akd-drop-yes,.akd-drop-no";

const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox"] });
for (const sc of SCENES) {
  const ctx = await b.newContext({
    viewport: { width: 390, height: 900 }, deviceScaleFactor: 2,
    isMobile: true, hasTouch: true, reducedMotion: "reduce",
  });
  await apply(ctx, { admin: sc.admin !== false });
  await offline(ctx).catch(() => {});
  if (sc.hints) {
    /* 「近い名前の人」は `/donors` の `hints` から出る。本番と同じ形で足す
       （`inkdis.mjs` と同じ理由） */
    await ctx.addInitScript(() => {
      const HINT = [
        { channelId: "UCNTxy7hXktoG4V6jT6A3M9A", name: "ゆずたつ", days: 41, lastAt: new Date().toISOString() },
        { channelId: "UCTXgxriwnTlJ0y1tff0yU5A", name: "ゆうひ", days: null, lastAt: null },
      ];
      const f = window.fetch;
      window.fetch = async (...a) => {
        const res = await f(...a);
        const url = String(typeof a[0] === "string" ? a[0] : a[0]?.url || "");
        if (!/\/island-api\/donors(\?|$)/.test(url)) return res;
        const body = await res.clone().json().catch(() => null);
        if (!body || !Array.isArray(body.donors)) return res;
        body.donors = body.donors.map((d) => (d.state === "new" ? { ...d, hints: HINT } : d));
        return new Response(JSON.stringify(body), { status: res.status, headers: { "content-type": "application/json" } });
      };
    });
  }
  const p = await ctx.newPage();
  await p.addInitScript(() => { try { localStorage.setItem("ayato-island-arrived", "1"); } catch {} });
  await p.goto(`http://localhost:${PORT}${sc.page}`, { waitUntil: "networkidle", timeout: 60000 }).catch(() => {});
  await p.waitForTimeout(1500);
  if (sc.tab) {
    await p.locator(".mp-tab", { hasText: new RegExp(`^${sc.tab}`) }).first().click({ timeout: 5000 }).catch(() => {});
    await p.waitForTimeout(1600);
  }
  if (sc.open) await sc.open(p);
  await p.evaluate(() => { for (const d of document.querySelectorAll("details")) d.open = true; });
  await p.waitForTimeout(600);
  // 押せない姿を撮る回。**押せる姿で撮ると、直っていなくても読める**
  if (sc.dis) await p.evaluate((s) => { for (const el of document.querySelectorAll(s)) el.disabled = true; }, DIS);
  await p.evaluate(() => { window.requestAnimationFrame = () => 0; for (const a of document.getAnimations()) a.pause(); });
  await p.waitForTimeout(400);
  const el = p.locator(sc.pick).first();
  const ok = await el.count().then((n) => n > 0).catch(() => false);
  if (!ok) { console.log(`${sc.id}  ${sc.pick} が無い`); await ctx.close(); continue; }
  await el.scrollIntoViewIfNeeded().catch(() => {});
  await p.waitForTimeout(300);
  await el.screenshot({ path: `${OUT}/${sc.id}.png` }).catch(async (e) => {
    console.log(`${sc.id}  撮れず ${String(e).slice(0, 60)}`);
  });
  console.log(`${sc.id}  ${OUT}/${sc.id}.png`);
  await ctx.close();
}
await b.close();
