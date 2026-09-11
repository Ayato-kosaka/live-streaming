/**
 * 地図の中の字（`svg.nmap` の <text>）の濃さを、閉じた俯瞰と**開いた地図**の
 * 両方で測る。撮るところまで。読むのは `inkpx.py`（同じ形で書き出す）。
 *
 *   PORT=4350 TAG=cmp STATE=both node tools/sprites/compassink.mjs
 *   python3 tools/sprites/inkpx.py cmp _nordic-zoom
 *
 * `inkpx.mjs` は面まるごとを `fullPage` で撮る。**開いた地図（MapZoom）は
 * 全画面の器の中で別に流れている**ので、fullPage の座標と箱の座標が合わない。
 * ここは器を送ってから**画面ぶんだけ**撮って、箱も画面の座標で持つ。
 *
 * 地図は rAF で動かしていないが、島と同じ約束で止めてから撮る
 * （2枚のあいだに1画素でも動くと、差が字でなくなる）。
 */
import { chromium } from "playwright-core";
import { mkdirSync, writeFileSync } from "fs";

const PORT = process.env.PORT || "4350";
const PAGES = (process.env.PAGES || "/nordic.html").split(",");
const TAG = process.env.TAG || "cmp";
const W = Number(process.env.W || 390);
const H = Number(process.env.H || 844);
const DPR = Number(process.env.DPR || 3);
const OUT = `/tmp/ink/${TAG}`;
mkdirSync(OUT, { recursive: true });

const b = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--no-sandbox"],
});
const ctx = await b.newContext({
  viewport: { width: W, height: H },
  deviceScaleFactor: DPR,
  isMobile: W < 700,
  hasTouch: W < 700,
  reducedMotion: "reduce",
});
await ctx.addInitScript(() => {
  try {
    localStorage.setItem("ayato-island-arrived", "2026-09-04");
    localStorage.setItem("ayato-island-walked", "1");
  } catch {}
});
const p = await ctx.newPage();

/** 画面に写っている地図の字だけを拾う。箱は画面の座標。 */
async function grab(page, name) {
  const boxes = await page.evaluate(() => {
    const out = [];
    const svg = [...document.querySelectorAll("svg.nmap")].pop();
    if (!svg) return out;
    const vw = window.innerWidth, vh = window.innerHeight;
    for (const el of svg.querySelectorAll("text")) {
      const t = (el.textContent || "").trim();
      if (!t) continue;
      const cs = getComputedStyle(el);
      if (cs.visibility === "hidden" || cs.display === "none" || cs.opacity === "0") continue;
      if (el.checkVisibility?.({ opacityProperty: true, visibilityProperty: true }) === false) continue;
      const r = el.getBoundingClientRect();
      // 画面の外に出たぶんは切る。**切られた先を測ると、切られたことが消える**
      const x = Math.max(0, r.x), y = Math.max(0, r.y);
      const w = Math.min(vw, r.right) - x, h = Math.min(vh, r.bottom) - y;
      if (w < 2 || h < 2) continue;
      out.push({
        t: t.slice(0, 24), c: el.getAttribute("class") || "", tag: "text",
        color: cs.fill, opacity: cs.opacity, size: cs.fontSize,
        x, y, w, h,
        // 紙（viewBox）からはみ出して切られていないか。切られていたら面積で出る
        cut: +(r.width * r.height - w * h).toFixed(1),
      });
      el.setAttribute("data-inkmark", String(out.length - 1));
    }
    return out;
  });
  await page.screenshot({ path: `${OUT}/${name}.shot.png` });
  await page.evaluate(() => {
    for (const el of document.querySelectorAll("[data-inkmark]")) {
      el.style.setProperty("fill", "transparent", "important");
      el.style.setProperty("stroke", "transparent", "important");
    }
  });
  await page.screenshot({ path: `${OUT}/${name}.bg.png` });
  await page.evaluate(() => {
    for (const el of document.querySelectorAll("[data-inkmark]")) {
      el.style.removeProperty("fill");
      el.style.removeProperty("stroke");
      el.removeAttribute("data-inkmark");
    }
  });
  writeFileSync(`${OUT}/${name}.json`, JSON.stringify({ dpr: DPR, boxes }, null, 1));
  const cut = boxes.filter((x) => x.cut > 1).length;
  console.log(`${name}  ${boxes.length}か所  紙の外で切られている字 ${cut}`);
}

for (const path of PAGES) {
  const name = path.replace(/\//g, "_").replace(/\.html$/, "") || "_";
  await p.goto(`http://localhost:${PORT}${path}`, { waitUntil: "networkidle", timeout: 60000 });
  await p.waitForTimeout(1200);
  await p.evaluate(() => { window.requestAnimationFrame = () => 0; });
  // 閉じた俯瞰。地図が画面の真ん中に来るまで送る
  await p.locator("svg.nmap").first().scrollIntoViewIfNeeded();
  await p.waitForTimeout(700);
  await grab(p, name);
  // 開いた地図。方位磁針は右上なので、器を右上へ戻してから撮る
  await p.click(".mzoom-open");
  await p.waitForTimeout(1200);
  await p.evaluate(() => {
    window.requestAnimationFrame = () => 0;
    const sc = document.querySelector(".mzoom-scroll");
    if (sc) { sc.scrollLeft = sc.scrollWidth; sc.scrollTop = 0; }
  });
  await p.waitForTimeout(700);
  await grab(p, `${name}-zoom`);
  await p.click(".mzoom-close").catch(() => {});
}
await b.close();
