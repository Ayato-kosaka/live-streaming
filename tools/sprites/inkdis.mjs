/**
 * **押せないとき（`:disabled`）の字の濃さ**を、描かれた画素から測る（撮るほう）。
 *
 *   SPORT=4800 TAG=dis-before node tools/sprites/inkdis.mjs
 *   python3 tools/sprites/inkpx.py dis-before desk-video
 *
 * `inkpx.mjs` は開いた面をそのまま撮る。押しどころは**押せる姿**で出ているので、
 * それで測ると `:disabled` の規則が1つも当たらないまま「合格」と出る。
 * 実際 `.mp-send` は押せる姿なら 12 を超え、押せない姿で 2.95 だった。
 *
 * ここは、その面に実際にある押しどころを**押せない姿にしてから**撮る。
 * 見た目を作り変えているのではなく、`disabled` を立てているだけなので、
 * 当たる CSS は本番で押せないときと同じもの（`docs/island-misses.md` #72 ——
 * 測るための仕掛けが、測る対象を変えていないこと）。
 * もともと押せない姿で出ているものは「そのまま」と出す。
 *
 * 2枚組（字あり／字だけ透明）の作り方は `inkpx.mjs` と同じ。読むのは `inkpx.py`。
 */
import { chromium } from "playwright-core";
import { mkdirSync, writeFileSync } from "node:fs";
import { offline } from "./route.mjs";
import { apply } from "./asme.mjs";

const PORT = process.env.SPORT || "4800";
const TAG = process.env.TAG || "dis";
const W = Number(process.env.W || 390);
const DPR = Number(process.env.DPR || 3);
const OUT = `/tmp/ink/${TAG}`;
mkdirSync(OUT, { recursive: true });

/** 押せないときの規則を持っている押しどころ。**機械で数えた9件から、字のあるもの。** */
const SEL = [
  ".mp-send", ".mp-donor-hint", ".mp-sc-more",
  ".nph-post-go", ".trip-week-plus",
  ".nstudio-go", ".akd-drop-yes", ".akd-drop-no",
].join(",");

/** 測る場面。`/me/desk` の道具は札を押さないと作られない（`mesweep.mjs` と同じ）。 */
const SCENES = [
  { id: "desk-place", page: "/me/desk.html", tab: "いまどこ", seed: true },
  { id: "desk-video", page: "/me/desk.html", tab: "配信", seed: true },
  { id: "desk-plan", page: "/me/desk.html", tab: "企画", seed: true },
  {
    id: "desk-donor", page: "/me/desk.html", tab: "投げ銭", seed: true,
    /* 「近い名前の人」（`.mp-donor-hint`）は、名前を打つまで1件も出ない。
       打たずに撮ると、その規則だけ**測れていないのに0件で通る。** */
    /* 「近い名前の人」は `/donors` が返す `hints` から出る（`functions/src/donors.ts`
       の `hintsFor`）。`asme.mjs` の表には入っていないので、**本番と同じ形**で
       足してから撮る。足さないとこの規則だけ0件になり、
       測れていないものが合格に見える（`docs/island-misses.md` #72）。 */
    async init(ctx) {
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
    },
  },
  { id: "desk-chara", page: "/me/desk.html", tab: "キャラ", seed: true },
  { id: "desk-fund", page: "/me/desk.html", tab: "スパチャ", seed: true },
  { id: "desk-photo", page: "/me/desk.html", tab: "写真", seed: true },
  { id: "desk-sticky", page: "/me/desk.html", tab: "付箋", seed: true },
  { id: "me-plan", page: "/me.html", tab: "企画", seed: true, admin: false },
  { id: "nordic-photos", page: "/nordic/photos.html", seed: true },
  { id: "nordic-day2", page: "/nordic/day/2.html", seed: true },
  { id: "nordic", page: "/nordic.html", seed: true },
  // カードを1枚ひらいたところ（`.nstudio-go` と `.akd-drop-yes` はここ）
  {
    id: "cards-sheet", page: "/cards.html", seed: true,
    async open(p) {
      await p.locator(".akd-tile").first().click({ timeout: 5000 }).catch(() => {});
      await p.waitForTimeout(2000);
      /* 消す確かめ（`.akd-drop-yes` / `.akd-drop-no`）は、**あやとにしか出ない**
         札を1回押してから作られる。押さずに撮ると、この2つが測れない。 */
      await p.locator(".akd-drop-open").first().click({ timeout: 3000 }).catch(() => {});
      await p.waitForTimeout(800);
    },
  },
];

const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox"] });
const found = {};
for (const sc of SCENES) {
  const ctx = await b.newContext({
    viewport: { width: W, height: 844 },
    deviceScaleFactor: DPR, isMobile: W < 700, hasTouch: W < 700, reducedMotion: "reduce",
  });
  if (sc.seed) await apply(ctx, { admin: sc.admin !== false });
  /* **あとから登録した route が先に当たる**（Playwright）。場面ごとの足しは
     `asme.apply` の**あと**に置く。逆にすると asme の受け皿に全部持っていかれる。 */
  if (sc.init) await sc.init(ctx);
  await offline(ctx).catch(() => {});
  await ctx.addInitScript(() => {
    try {
      localStorage.setItem("ayato-island-arrived", "2026-09-04");
      localStorage.setItem("ayato-island-walked", "1");
    } catch {}
  });
  const p = await ctx.newPage();
  await p.goto(`http://localhost:${PORT}${sc.page}`, { waitUntil: "networkidle", timeout: 60000 }).catch(() => {});
  await p.waitForTimeout(1500);
  if (sc.tab) {
    await p.locator(".mp-tab", { hasText: new RegExp(`^${sc.tab}`) }).first().click({ timeout: 5000 }).catch(() => {});
    await p.waitForTimeout(1600);
  }
  if (sc.open) await sc.open(p);
  await p.evaluate(() => { for (const d of document.querySelectorAll("details")) d.open = true; });
  await p.waitForTimeout(700);

  /* **止めてから撮る。** 2枚のあいだに何かが動くと、差分に字と関係ない画素が
     混ざる。CSS の animation を止めるだけでは足りない（`CLAUDE.md`）。
     **頭へ巻き戻さない**（終わっている絵が巻き戻って、自分の仕掛けが作った絵を
     測ることになる。`docs/island-misses.md` #13）。 */
  await p.evaluate(() => {
    window.requestAnimationFrame = () => 0;
    for (const a of document.getAnimations()) a.pause();
  });

  const hits = await p.evaluate((sel) => {
    const out = [];
    for (const el of document.querySelectorAll(sel)) {
      const r = el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) continue;
      const was = el.disabled === true;
      if (!was) el.disabled = true;
      out.push({ cls: el.className, was, t: (el.textContent || "").trim().slice(0, 20) });
      el.setAttribute("data-dis", "1");
    }
    return out;
  }, SEL);
  if (!hits.length) { console.log(`${sc.id}  この面には無い`); await ctx.close(); continue; }
  for (const h of hits) (found[h.cls.split(/\s+/)[0]] ??= []).push(`${sc.id}${h.was ? "（もともと押せない）" : ""}`);
  await p.waitForTimeout(400);
  await p.evaluate(() => window.scrollTo(0, 0));
  await p.waitForTimeout(300);

  /* 字を持つ要素を、**押せなくした押しどころの中だけ**拾う。 */
  const boxes = await p.evaluate(() => {
    const out = [];
    const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const seen = new Set();
    for (let n = walk.nextNode(); n; n = walk.nextNode()) {
      const t = (n.textContent || "").trim();
      if (!t) continue;
      const el = n.parentElement;
      if (!el || seen.has(el) || !el.closest("[data-dis]")) continue;
      seen.add(el);
      const r = el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) continue;
      const cs = getComputedStyle(el);
      if (cs.visibility === "hidden" || cs.display === "none" || cs.opacity === "0") continue;
      if (el.checkVisibility?.({ opacityProperty: true, visibilityProperty: true, checkOpacity: true, checkVisibilityCSS: true }) === false) continue;
      out.push({
        t: t.slice(0, 24),
        c: el.closest("[data-dis]").className.split(/\s+/)[0] + (el.closest("[data-dis]") === el ? "" : ">" + (el.className || el.tagName)),
        tag: el.tagName,
        color: cs.color, opacity: cs.opacity, size: cs.fontSize,
        x: r.x + window.scrollX, y: r.y + window.scrollY, w: r.width, h: r.height,
      });
      el.setAttribute("data-inkmark", String(out.length - 1));
    }
    return out;
  });

  await p.screenshot({ path: `${OUT}/${sc.id}.shot.png`, fullPage: true });
  await p.evaluate(() => {
    for (const el of document.querySelectorAll("[data-inkmark]")) {
      el.style.setProperty("color", "transparent", "important");
      el.style.setProperty("text-shadow", "none", "important");
      el.style.setProperty("-webkit-text-stroke-color", "transparent", "important");
    }
  });
  await p.screenshot({ path: `${OUT}/${sc.id}.bg.png`, fullPage: true });
  writeFileSync(`${OUT}/${sc.id}.json`, JSON.stringify({ dpr: DPR, boxes }, null, 1));
  console.log(`${sc.id}  押せなくした ${hits.length}件 / 字 ${boxes.length}か所  [${hits.map((h) => h.t).join(" ")}]`);
  await ctx.close();
}
await b.close();
console.log("\n-- どの規則を、どの面で測れたか");
for (const [cls, where] of Object.entries(found)) console.log(`  .${cls}  ${where.join(" , ")}`);
for (const cls of [".mp-send", ".mp-donor-hint", ".mp-sc-more", ".nph-post-go", ".trip-week-plus", ".nstudio-go", ".akd-drop-yes", ".akd-drop-no"]) {
  if (!found[cls.slice(1)]) console.log(`  ${cls}  **どの面でも出せていない**（測れていないので、合格と読まない）`);
}
