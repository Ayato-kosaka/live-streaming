/**
 * 字の行き先の押しどころを、**出したい形にしてから**測る。
 *
 *   SPORT=4800 TAG=before node tools/sprites/hitfix.mjs
 *
 * `hitbox.mjs` はページを開いてそのまま測る。それだと
 * **札を押さないと作られないもの**（`/me` のカード）と、
 * **畳みの中にあるもの**（`/friends` の図鑑）が1件も挙がらない。
 * 実際 `SEL=a.akd-plan` は `/me` `/friends` `/cards` のどれでも0件と出た。
 * 「当たりが足りない」ではなく「見に行けていない」なので、
 * そのまま0件で通すと**直っていないものが直って見える**（`docs/island-misses.md` #72）。
 *
 * ここは場面ごとに「開けかた」を持って、開けてから測る。
 * 測り方そのもの（中心から1pxずつ外へ伸ばして `elementFromPoint` が
 * まだ自分を返すか）は `hitbox.mjs` と同じ。見た目の箱では測らない。
 *
 * 出るもの: 標準出力の表と `/tmp/hitfix/<TAG>/*.png`
 */
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";
import { offline } from "./route.mjs";
import { apply } from "./asme.mjs";

const PORT = process.env.SPORT || "4800";
const TAG = process.env.TAG || "before";
const OUT = `/tmp/hitfix/${TAG}`;
mkdirSync(OUT, { recursive: true });

/** 測る場面。`open` はページを開いたあとに走らせる「開けかた」。 */
const SCENES = [
  {
    id: "me-card",
    page: "/me.html",
    sel: "a.akd-plan",
    seed: true,
    // カードは札を押すまで作られない
    async open(p) {
      await p.locator(".mp-tab", { hasText: /^カード/ }).first().click({ timeout: 5000 }).catch(() => {});
      await p.waitForTimeout(1800);
    },
  },
  {
    id: "friends-card",
    page: "/friends.html",
    sel: "a.akd-plan",
    seed: true,
    /* 図鑑は**1人ずつ**めくる面。1人目にカードが無いと0件になるので、
       カードの出る人まで送る。「0件」を「当たりが足りない人はいない」と
       読まないための送り（`docs/island-misses.md` #72）。 */
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
  { id: "cards", page: "/cards.html", sel: "a.akd-day-plan, a.akd-plan", seed: true },
  { id: "foot-board", page: "/board.html", sel: "a.ifoot-privacy" },
  { id: "foot-next", page: "/next.html", sel: "a.ifoot-privacy" },
  { id: "foot-about", page: "/about.html", sel: "a.ifoot-privacy" },
  { id: "foot-me", page: "/me.html", sel: "a.ifoot-privacy", seed: true },
];

/* `hitbox.mjs` と同じ測りかた。折り返した行内リンクは**行ごとの箱**の
   中心から伸ばす（2行を囲む箱の中心は行間に落ちて、親が返る）。 */
const measure = (sel) => {
  const out = [];
  const nm = (e) => (e ? e.tagName + (typeof e.className === "string" && e.className ? "." + e.className.split(/\s+/)[0] : "") : "なし");
  for (const el of document.querySelectorAll(sel)) {
    el.scrollIntoView({ block: "center" });
    const r = el.getBoundingClientRect();
    if (r.width < 1) continue;
    const lines = [...el.getClientRects()].filter((q) => q.width > 0 && q.height > 0);
    const box = lines.length ? lines.reduce((a, q) => (q.width * q.height > a.width * a.height ? q : a)) : r;
    const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
    const t = (el.textContent || "").trim().slice(0, 16);
    if (cx < 0 || cy < 0 || cx > innerWidth || cy > innerHeight) {
      out.push({ t, box: [Math.round(r.width), Math.round(r.height)], why: "画面の外" });
      continue;
    }
    const hits = (x, y) => {
      const e = document.elementFromPoint(x, y);
      return e && (e === el || el.contains(e) || e.closest?.("a,button,label") === el);
    };
    if (!hits(cx, cy)) {
      out.push({ t, box: [Math.round(r.width), Math.round(r.height)], why: `${nm(document.elementFromPoint(cx, cy))} が上にいる` });
      continue;
    }
    const grow = (dx, dy) => { let n = 0; while (n < 80 && hits(cx + dx * (n + 1), cy + dy * (n + 1))) n++; return n; };
    out.push({
      t,
      box: [Math.round(r.width), Math.round(r.height)],
      hit: [grow(-1, 0) + grow(1, 0) + 1, grow(0, -1) + grow(0, 1) + 1],
      /* 同じ日のカードに何本積まれているか。**4本積まれた形で測れているか**を
         数で出す。1本しか出ていない画面で通しても意味がない */
      stack: el.parentElement ? el.parentElement.querySelectorAll("a.akd-plan").length : 0,
    });
  }
  return out;
};

const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox"] });
let ng = 0, all = 0, maxStack = 0;
for (const sc of SCENES) {
  const ctx = await b.newContext({
    viewport: { width: Number(process.env.W || 390), height: 900 },
    deviceScaleFactor: 1, isMobile: true, hasTouch: true, reducedMotion: "reduce",
  });
  if (sc.seed) await apply(ctx);
  await offline(ctx).catch(() => {});
  const p = await ctx.newPage();
  await p.addInitScript(() => { try { localStorage.setItem("ayato-island-arrived", "1"); } catch {} });
  await p.goto(`http://localhost:${PORT}${sc.page}`, { waitUntil: "networkidle", timeout: 60000 }).catch(() => {});
  await p.waitForTimeout(1500);
  if (sc.open) await sc.open(p);
  const rows = await p.evaluate(measure, sc.sel);
  await p.evaluate(() => window.scrollTo(0, 0));
  await p.waitForTimeout(300);
  await p.screenshot({ path: `${OUT}/${sc.id}.png`, fullPage: true });
  await ctx.close();
  if (!rows.length) { console.log(`${sc.id}  0件（開けていないか、出ていない）`); continue; }
  for (const r of rows) {
    all++;
    maxStack = Math.max(maxStack, r.stack || 0);
    const bad = r.why || r.hit[1] < 48 || r.hit[0] < 48;
    if (bad) ng++;
    console.log(
      `${bad ? "否" : "可"} ${sc.id}  「${r.t}」 見た目 ${r.box[0]}x${r.box[1]}  ` +
      (r.why ? `当たり 測れず（${r.why}）` : `当たり ${r.hit[0]}x${r.hit[1]}`) +
      (r.stack ? `  同じ帯に ${r.stack}本` : ""),
    );
  }
}
await b.close();
console.log(`\n[${TAG}] 48px を割っているもの ${ng} / ${all}件。いちばん積まれた帯 ${maxStack}本`);
