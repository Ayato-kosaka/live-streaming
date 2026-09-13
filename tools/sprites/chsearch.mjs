/**
 * 図鑑で**名前を打ったのに誰も当たらなかったとき**を撮って、字の濃さを測る。
 *
 * `mesweep.mjs` も `meink.mjs` も、札を押したところまでしか行かない。
 * さがす欄に打った先は **0人のときとは別の札**（「その名前の人はいません」）に
 * なるので、あの2本では1度も撮られない。**書いた字は全部測る**という
 * 決めごと（`docs/island-standards.md` 出す前のチェック）に穴が空くので、
 * ここだけ別に撮る。
 *
 *   SPORT=4900 node tools/sprites/chsearch.mjs
 *   python3 tools/sprites/inkpx.py chsearch _desk-chara
 *
 * 出るもの:
 *   /tmp/chsearch/desk-chara-<幅>.png      … 面ぜんぶ（目で見るぶん）
 *   /tmp/ink/chsearch/_desk-chara.{shot,bg,json} … 濃さを測る2枚組
 *
 * 撮りかたは `meink.mjs` と同じ（1枚目そのまま／2枚目は字の色だけ透明。
 * `text-shadow` は透明にしても残るので、2枚目が「その字が乗っている地」になる）。
 */
import { chromium } from "playwright-core";
import { mkdirSync, writeFileSync } from "fs";
import { seed } from "./meseed.mjs";
import { offline } from "./route.mjs";

const PORT = process.env.SPORT || "4900";
const DPR = Number(process.env.DPR || 3);
/** 誰にも当たらない字。**本番の名前と当たらないもの**を打つ */
const Q = process.env.CHQ || "だれもいないなまえ";
const SHOTS = "/tmp/chsearch";
const OUT = "/tmp/ink/chsearch";
mkdirSync(SHOTS, { recursive: true });
mkdirSync(OUT, { recursive: true });

const b = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--no-sandbox"],
});

for (const W of [360, 390]) {
  const ctx = await b.newContext({
    viewport: { width: W, height: 844 },
    deviceScaleFactor: DPR,
    isMobile: true,
    hasTouch: true,
    reducedMotion: "reduce",
  });
  await seed(ctx, { admin: true, mode: "ok" });
  await offline(ctx).catch(() => {});
  const p = await ctx.newPage();
  await p.goto(`http://localhost:${PORT}/me/desk.html`, { waitUntil: "networkidle", timeout: 60000 }).catch(() => {});
  await p.waitForTimeout(1400);
  await p.locator(".mp-tab", { hasText: /^キャラ/ }).first().click({ timeout: 5000 }).catch(() => {});
  await p.waitForTimeout(1200);
  await p.locator(".ch-find").fill(Q);
  await p.waitForTimeout(800);

  const over = await p.evaluate(() => {
    const de = document.documentElement;
    return { over: de.scrollWidth - de.clientWidth, height: de.scrollHeight };
  });
  await p.screenshot({ path: `${SHOTS}/desk-chara-${W}.png`, fullPage: true });
  console.log(`${W}px  高さ ${over.height}px  横あふれ ${over.over}px`);

  if (W !== 390) {
    await ctx.close();
    continue;
  }

  /* ---- 濃さの2枚組。`meink.mjs` と同じ手順 ---- */
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
      out.push({
        t: t.slice(0, 24),
        c: el.className?.baseVal ?? (typeof el.className === "string" ? el.className : ""),
        tag: el.tagName,
        color: cs.color,
        opacity: cs.opacity,
        size: cs.fontSize,
        x: r.x + window.scrollX, y: r.y + window.scrollY, w: r.width, h: r.height,
      });
      el.setAttribute("data-inkmark", String(out.length - 1));
    }
    return out;
  });
  await p.screenshot({ path: `${OUT}/_desk-chara.shot.png`, fullPage: true });
  await p.evaluate(() => {
    for (const el of document.querySelectorAll("[data-inkmark]")) {
      el.style.setProperty("color", "transparent", "important");
      el.style.setProperty("text-shadow", "none", "important");
      el.style.setProperty("-webkit-text-stroke-color", "transparent", "important");
    }
  });
  await p.screenshot({ path: `${OUT}/_desk-chara.bg.png`, fullPage: true });
  writeFileSync(`${OUT}/_desk-chara.json`, JSON.stringify({ dpr: DPR, boxes }, null, 1));
  console.log(`字 ${boxes.length}か所 → python3 tools/sprites/inkpx.py chsearch _desk-chara`);
  await ctx.close();
}
await b.close();
