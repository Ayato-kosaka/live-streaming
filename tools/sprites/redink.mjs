/**
 * 「赤い字」を1か所ずつ、**選んだ相手だけ**測る（撮るほう）。
 *
 * `inkpx.mjs` は面の字をぜんぶ拾うので、面に出ている字の合否を見るのには向くが、
 *
 *   - **絵（SVG のハート・投票の印）は字ではないので拾われない**
 *   - 押したあとにしか出ない姿（`.vote.is-on`）や、
 *     まだ大きさの分からない札を**1つずつ**並べて比べられない
 *
 * ので、**セレクタで名指しして測る**ほうを別に持つ。撮り方（2枚撮って差を見る）と
 * 出すファイルの形は `inkpx.mjs` と同じにしてあるので、読むのは `inkpx.py` が使える。
 *
 *   SEL='.wk-days > span.is-today|.is-far .tnow-count-n b' \
 *   PORT=4170 PAGES=/streams.html TAG=red node tools/sprites/redink.mjs
 *   python3 tools/sprites/inkpx.py red _streams 99
 *
 * 大きさと太さも書き出す（`size` / `weight`）。**「大きい字だから読める」は、
 * 実際に描かれている px を見てから言う**（390px 幅では clamp が効いて
 * 42px の宣言が 32.76px になる、というのが実際にあった）。
 *
 * 島は rAF で動くので止めてから撮る（`CLAUDE.md`）。止めないと、2枚のあいだに
 * 住人が歩いて、字と関係ない画素が差に混ざる。
 */
import { chromium } from "playwright-core";
import { offline } from "./route.mjs";
import { mkdirSync, writeFileSync } from "fs";

const PORT = process.env.PORT || "4170";
const PATHS = (process.env.PAGES || "/streams.html").split(",");
const SELS = (process.env.SEL || "").split("|").filter(Boolean);
const TAG = process.env.TAG || "red";
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
if (process.env.SEED) await (await import(process.env.SEED)).apply(ctx);
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
    await p.evaluate(() => { for (const d of document.querySelectorAll("details")) d.open = true; });
  }
  if (process.env.CLICK) {
    const gap = Number(process.env.GAP || 400);
    for (const sel of process.env.CLICK.split("|")) {
      await p.click(sel, { force: true, timeout: 8000 }).catch(() => {});
      await p.waitForTimeout(gap);
    }
  }
  /* 押しただけでは出ない姿（`.count.is-today`、書き込みに失敗したときの `.err`）を
     測るための差し込み口。**本番の CSS をそのままの面の上で当てる**ためのもので、
     見た目を作り替えるために使わない。使ったら報告に「force した」と書く。 */
  if (process.env.JS) await p.evaluate(process.env.JS);
  await p.waitForTimeout(1200);
  // 島は rAF で動く。CSS の animation を止めるだけでは足りない（CLAUDE.md）。
  await p.evaluate(() => { window.requestAnimationFrame = () => 0; });
  /* **長い面は通しで撮らない。** 畳みを全部開いた `/nordic/guide` は
     2万px を超えて、通しの2枚のあいだで版が組み直される。そうなると差に
     字と関係ない画素が混ざり、「字が地より明るい」という値が出る（実際に出た）。
     `VIEW=1` を付けると、1つめの相手を画面の真ん中に送ってから**画面ぶんだけ**
     2枚撮り、画面に入っているものだけを測る。 */
  const VIEW = !!process.env.VIEW;
  if (VIEW && SELS.length) {
    await p.evaluate((sels) => {
      for (const sel of sels) {
        const el = document.querySelector(sel);
        if (el) { el.scrollIntoView({ block: "center" }); return; }
      }
    }, SELS);
  } else {
    await p.evaluate(() => window.scrollTo(0, 0));
  }
  await p.waitForTimeout(400);

  const boxes = await p.evaluate(({ sels, view }) => {
    const out = [];
    const seen = new Set();
    for (const sel of sels) {
      for (const el of document.querySelectorAll(sel)) {
        if (seen.has(el)) continue;
        seen.add(el);
        const r = el.getBoundingClientRect();
        if (r.width < 2 || r.height < 2) continue;
        const cs = getComputedStyle(el);
        if (el.checkVisibility?.({ opacityProperty: true, visibilityProperty: true,
          checkOpacity: true, checkVisibilityCSS: true }) === false) continue;
        const svg = el.tagName.toLowerCase() === "svg" || el.ownerSVGElement != null;
        if (view && (r.top < 0 || r.bottom > innerHeight || r.left < 0 || r.right > innerWidth)) continue;
        out.push({
          sel,
          t: (el.textContent || "").trim().slice(0, 24) || `<${el.tagName.toLowerCase()}>`,
          c: el.className?.baseVal ?? (typeof el.className === "string" ? el.className : ""),
          tag: el.tagName,
          kind: svg ? "絵" : "字",
          color: cs.color,
          opacity: cs.opacity,
          size: cs.fontSize,
          weight: cs.fontWeight,
          x: view ? r.x : r.x + window.scrollX,
          y: view ? r.y : r.y + window.scrollY,
          w: r.width, h: r.height,
        });
        el.setAttribute("data-inkmark", String(out.length - 1));
      }
    }
    return out;
  }, { sels: SELS, view: VIEW });

  const name = path.replace(/\//g, "_").replace(/\.html$/, "") || "_";
  await p.screenshot({ path: `${OUT}/${name}.shot.png`, fullPage: !VIEW });
  await p.evaluate(() => {
    for (const el of document.querySelectorAll("[data-inkmark]")) {
      el.style.setProperty("color", "transparent", "important");
      el.style.setProperty("text-shadow", "none", "important");
      el.style.setProperty("-webkit-text-stroke-color", "transparent", "important");
      // 絵は中の path が currentColor で塗られている。上から fill を消すと
      // path 側の指定に負けるので、中まで下りて消す。
      for (const q of [el, ...el.querySelectorAll("*")]) {
        if (q.ownerSVGElement || q.tagName.toLowerCase() === "svg") {
          q.style.setProperty("fill", "transparent", "important");
          q.style.setProperty("stroke", "transparent", "important");
        }
      }
    }
  });
  await p.screenshot({ path: `${OUT}/${name}.bg.png`, fullPage: !VIEW });
  writeFileSync(`${OUT}/${name}.json`, JSON.stringify({ dpr: DPR, boxes }, null, 1));
  console.log(`${path}  ${boxes.length}か所  ` +
    boxes.map((x) => `${x.kind}:${x.c || x.tag}@${x.size}/${x.weight}`).join("  "));
}
await b.close();
