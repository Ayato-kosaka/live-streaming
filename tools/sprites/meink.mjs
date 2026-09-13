/**
 * `/me` と `/me/desk` の**字の濃さ**を、道具1つずつ撮る（`inkpx.py` に渡す2枚）。
 *
 * `inkpx.mjs` は1つの面を1回撮る道具なので、**机の札を押した先は撮れない。**
 * 開いていない道具はそもそも作られていない（`Desk.tsx`）ので、押さずに
 * 撮ると9つのうち1つしか測らないまま「/me/desk を測った」ことになる。
 *
 *   tools/build.sh 3600
 *   python3 -m http.server 4600 --directory site/.next-3600 &
 *   SPORT=4600 node tools/sprites/meink.mjs
 *   for t in me-note desk-place …; do python3 tools/sprites/inkpx.py meink _$t; done
 *
 * 撮りかたは `inkpx.mjs` と同じ（1枚目そのまま／2枚目は字の色だけ透明）。
 * **欄の中の字は測れない**（閉じた `<select>` の中身と placeholder は
 * 文字ノードではない）。そちらは `mefield.mjs` の方式で別に撮る。
 *
 * dpr は 3。dpr1 だと同じ字が2〜3割低く出る（`CLAUDE.md`）。
 */
import { chromium } from "playwright-core";
import { mkdirSync, writeFileSync } from "fs";
import { seed } from "./meseed.mjs";
import { offline } from "./route.mjs";

const PORT = process.env.SPORT || "4600";
const MODE = process.env.MEMODE || "ok";
const TAG = process.env.TAG || "meink";
const W = Number(process.env.W || 390);
const DPR = Number(process.env.DPR || 3);
const OUT = `/tmp/ink/${TAG}`;
mkdirSync(OUT, { recursive: true });

const SCENES = [
  { id: "me-note", page: "/me.html", tab: "付箋" },
  { id: "me-plan", page: "/me.html", tab: "企画" },
  { id: "me-card", page: "/me.html", tab: "カード" },
  { id: "me-islandme", page: "/me.html", open: true },
  { id: "desk-photo", page: "/me/desk.html", tab: "写真" },
  { id: "desk-place", page: "/me/desk.html", tab: "いまどこ" },
  { id: "desk-video", page: "/me/desk.html", tab: "配信" },
  { id: "desk-sticky", page: "/me/desk.html", tab: "付箋" },
  { id: "desk-plan", page: "/me/desk.html", tab: "企画" },
  { id: "desk-donor", page: "/me/desk.html", tab: "投げ銭" },
  { id: "desk-chara", page: "/me/desk.html", tab: "キャラ" },
  { id: "desk-fund", page: "/me/desk.html", tab: "スパチャ" },
  { id: "desk-obs", page: "/me/desk.html", tab: "OBS" },
];
const ONLY = process.env.ONLY ? process.env.ONLY.split(",") : null;

const b = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--no-sandbox"],
});

for (const sc of SCENES) {
  if (ONLY && !ONLY.includes(sc.id)) continue;
  const ctx = await b.newContext({
    viewport: { width: W, height: 844 },
    deviceScaleFactor: DPR,
    isMobile: true,
    hasTouch: true,
    reducedMotion: "reduce",
  });
  await seed(ctx, { admin: true, mode: MODE });
  await offline(ctx).catch(() => {});
  const p = await ctx.newPage();
  await p.goto(`http://localhost:${PORT}${sc.page}`, { waitUntil: "networkidle", timeout: 60000 }).catch(() => {});
  await p.waitForTimeout(1500);
  if (sc.tab) {
    await p.locator(".mp-tab", { hasText: new RegExp(`^${sc.tab}`) }).first().click({ timeout: 5000 }).catch(() => {});
    await p.waitForTimeout(1600);
  }
  if (sc.open) {
    await p.evaluate(() => {
      for (const d of document.querySelectorAll("details")) d.open = true;
    });
    await p.waitForTimeout(600);
  }
  // 畳んだままの高さで撮らない（`content-visibility: auto`）
  for (let i = 0; i < 30; i++) {
    await p.evaluate(() => window.scrollBy(0, 2000));
    await p.waitForTimeout(50);
  }
  await p.evaluate(() => window.scrollTo(0, 0));
  await p.waitForTimeout(500);

  const boxes = await p.evaluate(() => {
    const out = [];
    const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const seen = new Set();
    for (let n = walk.nextNode(); n; n = walk.nextNode()) {
      const t = (n.textContent || "").trim();
      if (!t) continue;
      const el = n.parentElement;
      if (!el || seen.has(el)) continue;
      seen.add(el);
      const r = el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) continue;
      const cs = getComputedStyle(el);
      if (cs.visibility === "hidden" || cs.display === "none" || cs.opacity === "0") continue;
      if (el.checkVisibility?.({ opacityProperty: true, visibilityProperty: true, checkOpacity: true, checkVisibilityCSS: true }) === false) continue;
      // 畳んだ中身・読み上げ用に潰してあるものは、画面に出ていない
      let clipped = false;
      for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
        const ac = getComputedStyle(a);
        const ar = a.getBoundingClientRect();
        if ((ar.width <= 1 || ar.height <= 1) && (ac.overflow === "hidden" || ac.clipPath !== "none")) { clipped = true; break; }
        if (ac.overflow === "visible" && ac.overflowY === "visible" && ac.overflowX === "visible") continue;
        if (r.bottom <= ar.top + 1 || r.top >= ar.bottom - 1 || r.right <= ar.left + 1 || r.left >= ar.right - 1) { clipped = true; break; }
      }
      if (clipped) continue;
      const svg = el.ownerSVGElement != null || el.tagName === "text";
      out.push({
        t: t.slice(0, 24),
        c: el.className?.baseVal ?? (typeof el.className === "string" ? el.className : ""),
        tag: el.tagName,
        color: svg ? cs.fill : cs.color,
        opacity: cs.opacity,
        size: cs.fontSize,
        x: r.x + window.scrollX, y: r.y + window.scrollY, w: r.width, h: r.height,
      });
      el.setAttribute("data-inkmark", String(out.length - 1));
    }
    return out;
  });

  await p.screenshot({ path: `${OUT}/_${sc.id}.shot.png`, fullPage: true });
  await p.evaluate(() => {
    for (const el of document.querySelectorAll("[data-inkmark]")) {
      el.style.setProperty("color", "transparent", "important");
      el.style.setProperty("text-shadow", "none", "important");
      el.style.setProperty("-webkit-text-stroke-color", "transparent", "important");
      if (el.ownerSVGElement || el.tagName === "text") {
        el.style.setProperty("fill", "transparent", "important");
        el.style.setProperty("stroke", "transparent", "important");
      }
    }
  });
  await p.screenshot({ path: `${OUT}/_${sc.id}.bg.png`, fullPage: true });
  writeFileSync(`${OUT}/_${sc.id}.json`, JSON.stringify({ dpr: DPR, boxes }, null, 1));

  /* ---- 欄の中の字 ----------------------------------------------------
     上の2枚では**測れない**。閉じた `<select>` の中の `<option>` は箱が
     0x0 で、placeholder はそもそも文字ノードではないので、どちらも
     `TreeWalker` に出てこない（`mefield.mjs` の docstring）。
     欄そのものを1箱として撮り直して、別の名前で渡す。 */
  await p.reload({ waitUntil: "networkidle", timeout: 60000 }).catch(() => {});
  await p.waitForTimeout(1400);
  if (sc.tab) {
    await p.locator(".mp-tab", { hasText: new RegExp(`^${sc.tab}`) }).first().click({ timeout: 5000 }).catch(() => {});
    await p.waitForTimeout(1500);
  }
  if (sc.open) {
    await p.evaluate(() => { for (const d of document.querySelectorAll("details")) d.open = true; });
    await p.waitForTimeout(500);
  }
  await p.evaluate(() => window.scrollTo(0, 0));
  await p.waitForTimeout(300);
  const fields = await p.evaluate(() => {
    const out = [];
    for (const el of document.querySelectorAll("input, select, textarea")) {
      const cs = getComputedStyle(el);
      if (el.offsetParent === null || cs.opacity === "0") continue;
      const r = el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) continue;
      out.push({
        t: (el.tagName === "SELECT" ? el.value : el.value || el.placeholder || "").slice(0, 24),
        c: (el.className || el.tagName.toLowerCase()) + `[${el.type || ""}]`,
        tag: el.tagName,
        color: cs.color,
        opacity: cs.opacity,
        size: cs.fontSize,
        x: r.x + window.scrollX, y: r.y + window.scrollY, w: r.width, h: r.height,
      });
    }
    return out;
  });
  if (fields.length) {
    await p.screenshot({ path: `${OUT}/_${sc.id}-field.shot.png`, fullPage: true });
    /* 字だけ透明にする。**`visibility` で消さない**（彫った溝まで消えて、
       字が乗っている地を取り違える）。placeholder は規則のほうで消す。 */
    await p.addStyleTag({
      content:
        "input,select,textarea{color:transparent !important;text-shadow:none !important}" +
        "input::placeholder,textarea::placeholder{color:transparent !important}",
    });
    await p.waitForTimeout(250);
    await p.screenshot({ path: `${OUT}/_${sc.id}-field.bg.png`, fullPage: true });
    writeFileSync(`${OUT}/_${sc.id}-field.json`, JSON.stringify({ dpr: DPR, boxes: fields }, null, 1));
  }
  console.log(`${sc.id}  字 ${boxes.length}か所 / 欄 ${fields.length}`);
  await ctx.close();
}
await b.close();
