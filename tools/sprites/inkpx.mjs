/**
 * 字の濃さを、計算ではなく**描かれた画素**から測る（1/2。撮るほう）。
 *
 * 3周続けて手で数えている（`docs/island-review-3.md` 17章 23）ので、道具にした。
 *
 *   PORT=3180 OPEN=1 PAGES=/map,/friends node tools/sprites/inkpx.mjs
 *   python3 tools/sprites/inkpx.py <TAG> <_map など>
 *
 * OPEN=1 で畳んであるものを全部開く。CLICK に "|" 区切りで押す先を渡せる。
 *
 * 1. 字を持つ要素をぜんぶ拾って、位置と字の色を書き出す
 * 2. そのまま1枚撮る（shot.png）
 * 3. 字だけ消してもう1枚撮る（bg.png）
 *
 * 2枚の差が「字が乗っている画素」。その下の地の色と比べるのが `_ink.py`。
 * 縁取りは字といっしょに消えるので、比を水増ししない。
 */
import { chromium } from "playwright-core";
import { offline } from "./route.mjs";
import { mkdirSync, writeFileSync } from "fs";

const PORT = process.env.PORT || "3180";
const PATHS = (process.env.PAGES || "/map").split(",");
const TAG = process.env.TAG || "ink";
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
await offline(ctx);
/* 2回撮って差を見る道具なので、**2枚のあいだに消えるものがあると差が嘘になる。**
   歩きかたの案内は 5.6 秒で消える。1枚目には写って2枚目には写らないので、
   その下の札が動いて、動いたぶんが「字の画素」として数えられていた
   （札の字を「クリーム色の字が海に乗っている」と報告した）。
   ほかの測り道具（framecpu / _abport / isleshot）と同じ鍵を置いて、
   **2回目以降に来た人**の画面で測る。案内が出ている数秒は別に見る。 */
await ctx.addInitScript(() => {
  try {
    localStorage.setItem("ayato-island-arrived", "2026-09-04");
    localStorage.setItem("ayato-island-walked", "1");
  } catch {}
});
const p = await ctx.newPage();

for (const path of PATHS) {
  await p.goto(`http://localhost:${PORT}${path}`, { waitUntil: "networkidle", timeout: 60000 });
  await p.waitForTimeout(1500);
  if (process.env.OPEN) {
    // 畳んであるものを全部開く。開いた中身も測らないと、
    // 面の半分を見ないまま「読める」と言うことになる。
    await p.evaluate(() => {
      for (const d of document.querySelectorAll("details")) d.open = true;
    });
  }
  if (process.env.CLICK) {
    for (const sel of process.env.CLICK.split("|")) await p.click(sel).catch(() => {});
  }
  await p.waitForTimeout(1400);
  // 押したときに画面が動いていると、通しで撮った1枚と箱の座標がずれる
  // （固定ヘッダのある面で、貼り合わせがずれる）。先に頭まで戻す。
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
      // 親が透明なもの（地図の「ぜんぶ」の街の名前は .acity ごと opacity:0）は、
      // 画面に出ていない。自分だけ見ても分からないので、上まで見る。
      const vis = el.checkVisibility?.({
        opacityProperty: true, visibilityProperty: true,
        checkOpacity: true, checkVisibilityCSS: true,
      });
      if (vis === false) continue;
      // 畳んである折りたたみの中身は、`overflow: hidden` で切られているだけで
      // 箱の大きさは残っている。そのまま測ると、画面には出ていない字を拾う。
      let clipped = false;
      for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
        const ac = getComputedStyle(a);
        if (ac.overflow === "visible" && ac.overflowY === "visible" && ac.overflowX === "visible") continue;
        const ar = a.getBoundingClientRect();
        if (r.bottom <= ar.top + 1 || r.top >= ar.bottom - 1 || r.right <= ar.left + 1 || r.left >= ar.right - 1) {
          clipped = true;
          break;
        }
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

  const name = path.replace(/\//g, "_").replace(/\.html$/, "") || "_";
  await p.screenshot({ path: `${OUT}/${name}.shot.png`, fullPage: true });
  // 字だけ消す。`visibility: hidden` にすると、その要素の**地まで**消えて
  // ボタンの上の白い字が「クリームの上の白」に化ける。色を透明にして、
  // 縁取り・影も消す（縁取りは比を上げないので、いっしょに消すのが正しい）。
  await p.evaluate(() => {
    for (const el of document.querySelectorAll("[data-inkmark]")) {
      el.style.setProperty("color", "transparent", "important");
      el.style.setProperty("text-shadow", "none", "important");
      el.style.setProperty("-webkit-text-stroke-color", "transparent", "important");
      // fill / stroke は SVG の字にだけ効かせる。ふつうの要素に掛けると、
      // 中に入っている図（凡例の線）まで消えて、地の色を取り違える。
      if (el.ownerSVGElement || el.tagName === "text") {
        el.style.setProperty("fill", "transparent", "important");
        el.style.setProperty("stroke", "transparent", "important");
      }
    }
  });
  await p.screenshot({ path: `${OUT}/${name}.bg.png`, fullPage: true });
  writeFileSync(`${OUT}/${name}.json`, JSON.stringify({ dpr: DPR, boxes }, null, 1));
  console.log(`${path}  ${boxes.length}か所`);
}
await b.close();
