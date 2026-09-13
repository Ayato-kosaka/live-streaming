/**
 * 帰り道（`.chain-foot a` / `.chap-note a`）の**字の濃さ**を、描かれた画素から測る。
 *
 *   SPORT=4210 W=390 TAG=before node tools/sprites/backink.mjs
 *
 * やり方は `pcink.mjs` と同じ。1枚そのまま撮り、2枚目は**その字だけ透明**にして
 * 撮り、差の出た画素を「字」として、その下の地と比べる。縁取りも影も字と
 * いっしょに消すので、比を水増ししない。読むのは `backink.py`。
 *
 * `pcink.mjs` と違うのは2つ。
 *
 *  1. **丸ごと撮らない。見えている窓だけ撮る。** `/island/caucasus/streams` は
 *     390px で 48,037px あり、dpr2 の丸ごとは 96,074px になって**絵の端が
 *     白く抜ける**（`docs/island-misses.md` #80 の追記）。
 *  2. **落ちたものだけでなく、測った全部の値を出す。** ここは「前と後で
 *     変わっていないこと」を見る道具なので、通ったものの値も要る。
 *
 * **dpr は 2 以上で撮る。** dpr1 だと同じ字が 2〜3割低く出る。
 * **合否は中央値で決める。**
 */
import { chromium } from "playwright-core";
import { offline } from "./route.mjs";
import { mkdirSync, writeFileSync, unlinkSync } from "fs";
import { execFileSync } from "child_process";

const SPORT = process.env.SPORT || "4210";
const W = Number(process.env.W || 390);
const H = Number(process.env.H || 900);
const DPR = Number(process.env.DPR || 2);
const TAG = process.env.TAG || "ink";
const OUT = process.env.OUT || `/tmp/backreport/ink-${TAG}-${W}`;
const SEL = process.env.SEL || ".chain-foot a,.chap-note a";
const PAGES = (
  process.env.PAGES ||
  "/atlas," +
    "/island/albania,/island/caucasus,/island/europe,/island/iran-walk,/island/middle-east,/island/nordic," +
    "/island/caucasus/streams,/island/europe/streams,/island/iran-walk/streams,/island/middle-east/streams"
).split(",");

mkdirSync(OUT, { recursive: true });
const b = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--no-sandbox"],
});
const ctx = await b.newContext({
  viewport: { width: W, height: H },
  deviceScaleFactor: DPR,
  isMobile: W < 900,
  hasTouch: W < 900,
  reducedMotion: "reduce",
});
await offline(ctx);
await ctx.addInitScript(() => {
  try {
    localStorage.setItem("ayato-island-arrived", "2026-09-04");
    localStorage.setItem("ayato-island-walked", "1");
  } catch {}
});
/* **島の地の色は時刻で変わる**（`[data-time]`）。前と後を別の時間に測ると、
   直していないものが動く（`docs/island-misses.md` #81）。帯を固定する。 */
const TIME = process.env.TIME || "day";
const p = await ctx.newPage();

const all = [];
for (const path of PAGES) {
  await p.goto(`http://localhost:${SPORT}${path === "/" ? "/index" : path}.html`, {
    waitUntil: "domcontentloaded",
    timeout: 60000,
  });
  await p.waitForTimeout(800);
  await p.evaluate((t) => { document.documentElement.dataset.time = t; }, TIME);
  /* **止めてから撮る。** 2枚のあいだに何かが動くと、差分に字と関係ない画素が
     混ざる。CSS の animation を止めるだけでは足りない（島は rAF で動く）。 */
  await p.evaluate(() => {
    window.requestAnimationFrame = () => 0;
    const st = document.createElement("style");
    st.textContent = "*,*::before,*::after{animation-play-state:paused!important;transition:none!important}";
    document.head.appendChild(st);
  });

  const links = await p.$$(SEL);
  for (let i = 0; i < links.length; i++) {
    const el = links[i];
    await el.evaluate((e) => e.scrollIntoView({ block: "center" }));
    await p.waitForTimeout(200);
    const box = await el.evaluate((e) => {
      const r = e.getBoundingClientRect();
      return { x: r.x, y: r.y, w: r.width, h: r.height, t: (e.textContent || "").trim().slice(0, 24),
        c: typeof e.className === "string" ? e.className : "", size: getComputedStyle(e).fontSize };
    });
    const name = `${path.replace(/\//g, "_").replace(/^_/, "") || "index"}-${i}`;
    const base = `${OUT}/${name}`;
    writeFileSync(`${base}.json`, JSON.stringify({ dpr: DPR, boxes: [box] }));
    await p.screenshot({ path: `${base}.shot.png` });
    await el.evaluate((e) => {
      e.style.setProperty("color", "transparent", "important");
      e.style.setProperty("text-shadow", "none", "important");
      e.style.setProperty("-webkit-text-stroke-color", "transparent", "important");
      // 下線も字の一部。残すと「地」に混ざる
      e.style.setProperty("text-decoration-color", "transparent", "important");
    });
    await p.waitForTimeout(120);
    await p.screenshot({ path: `${base}.bg.png` });
    await el.evaluate((e) => {
      e.style.removeProperty("color");
      e.style.removeProperty("text-shadow");
      e.style.removeProperty("-webkit-text-stroke-color");
      e.style.removeProperty("text-decoration-color");
    });

    const res = JSON.parse(
      execFileSync("python3", ["/home/user/live-streaming/tools/sprites/backink.py", base], {
        encoding: "utf8",
        maxBuffer: 1 << 26,
      }),
    )[0];
    unlinkSync(`${base}.shot.png`);
    unlinkSync(`${base}.bg.png`);
    all.push({ path, w: W, ...res });
    console.log(
      `${path}  ${W}px  「${res.t}」  ${res.why ?? `中央値 ${res.mid}  暗い地 ${res.lo}  明るい地 ${res.hi}  字 ${res.ink} / 地 ${res.bg}  ${res.mid >= 4.5 && res.lo >= 4.5 ? "OK" : "** 4.5割れ **"}`}`,
    );
  }
}
writeFileSync(`${OUT}/ink.json`, JSON.stringify(all, null, 1));
const bad = all.filter((r) => !r.why && !(r.mid >= 4.5 && r.lo >= 4.5));
console.log(`\n測った ${all.length}か所 / 4.5割れ ${bad.length}か所  →  ${OUT}/ink.json`);
await b.close();
