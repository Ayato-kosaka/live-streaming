/**
 * **面の中の錨（`href="#…"`）を全部押して、着地が看板の下に潜っていないかを見る。**
 *
 *   BASE=http://127.0.0.1:4220 W=1280 node tools/sprites/guideanchors.mjs
 *
 * しおりの章が、押しても看板の下に潜っていた（本番の 1280px で実測）。
 * **同じ形がほかの面にも残っていないか**を探すための掃き出し
 * （`docs/island-standards.md` 5「1件直したら横に展開する」）。
 *
 * 貼りついている帯そのものを数える。**見出しの上を下りて探す測り方は間違い**で、
 * 見出しが画面の外に出ていると「かぶり0」と返る（`shopprod.mjs` に同じ注）。
 */
import { chromium } from "playwright-core";
import { readdirSync, statSync } from "fs";
import { join } from "path";
import { offline } from "./route.mjs";
import { fromRoot } from "./repo.mjs";
const BASE = process.env.BASE || "http://127.0.0.1:4220";
const ROOT = fromRoot(process.env.DIST || "site/.next-3220");
const W = Number(process.env.W || 1280);
function walk(d, base = "") {
  let out = [];
  for (const f of readdirSync(d)) {
    if (["_next", "cache", "server", "static"].includes(f)) continue;
    const p = join(d, f);
    if (statSync(p).isDirectory()) out = out.concat(walk(p, base + "/" + f));
    else if (f.endsWith(".html")) out.push(base + "/" + f);
  }
  return out;
}
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox"] });
const ctx = await b.newContext({ viewport: { width: W, height: 844 }, isMobile: W < 700, hasTouch: W < 700 });
await offline(ctx).catch(() => {});
const p = await ctx.newPage();
let bad = 0, n = 0;
for (const page of walk(ROOT).sort()) {
  await p.goto(`${BASE}${page}`, { waitUntil: "domcontentloaded" }).catch(() => {});
  await p.waitForTimeout(700);
  const ids = await p.evaluate(() =>
    [...new Set([...document.querySelectorAll('a[href^="#"]')].map((a) => a.getAttribute("href").slice(1)).filter((h) => h && document.getElementById(decodeURIComponent(h))))],
  );
  for (const id of ids) {
    n++;
    const r = await p.evaluate((i) => {
      window.scrollTo(0, 0);
      const el = document.getElementById(decodeURIComponent(i));
      el.scrollIntoView({ block: "start" });
      const rc = el.getBoundingClientRect();
      let cover = 0;
      for (const e of document.querySelectorAll("body *")) {
        const pos = getComputedStyle(e).position;
        if (pos !== "fixed" && pos !== "sticky") continue;
        const bb = e.getBoundingClientRect();
        if (bb.top <= 1 && bb.bottom > 0 && bb.bottom < window.innerHeight / 2 && bb.width > window.innerWidth / 2) cover = Math.max(cover, Math.round(bb.bottom));
      }
      return { top: Math.round(rc.top), cover, hid: rc.top < cover - 1 };
    }, id);
    if (r.hid) { bad++; console.log(`潜った ${page}#${id}  上端=${r.top}px  貼りつき=${r.cover}px`); }
  }
}
console.log(`\n錨 ${n}本 / 潜ったの ${bad}本（W=${W}）`);
await b.close();
