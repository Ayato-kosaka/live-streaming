/**
 * 6つの島を同じ条件で撮って、**色づかいがどれだけ似ているか**を数で出す。
 *
 *   SPORT=4310 OUT=/tmp/isleart/before node islehue.mjs
 *   SPORT=4311 OUT=/tmp/isleart/after  node islehue.mjs
 *
 * 出すもの:
 *
 *  1. 島ごとの1枚（`<slug>.png`）
 *  2. **6島を並べた1枚**（`grid.png`）。どれがどの島か当てられるかを目で見る用
 *  3. **どの2島を取っても何%同じ色づかいか**（`hist.json` と標準出力）
 *
 * ## 似ているかの測りかた
 *
 * 色相12×明度4＋無彩色4の**52の棚**に画素を配って、島ごとに割合にする。
 * 2島の一致率は、棚ごとの小さいほうを足したもの（ヒストグラム交差）。
 * 100% なら「同じ色を同じ割合で使っている」、0% なら「1画素も色が重ならない」。
 *
 * 棚をこの粗さにしてあるのは、**にじみ（アンチエイリアス）や住人の服で
 * 数字が動かないようにする**ため。1色ずつ数えると、同じ島を2回撮っただけで
 * 数%ずれる。
 *
 * ## 撮る前に島を止める
 *
 * CSS の animation を切るだけでは足りない（島は rAF で動く）。
 * 2.6秒ほど動かして絵を作らせてから、`requestAnimationFrame` を黙らせて撮る。
 * 止めずに撮ると、住人の居場所とカメラの寄りが毎回変わって、
 * 色の割合まで動く。
 *
 * 住人の絵は先に `python3 avatars.py` / `chars.py` で落としておくこと。
 * 落とさずに撮ると**12人が全員おなじ顔**で写る（`route.mjs` の注）。
 */
import { chromium } from "playwright-core";
import { mkdirSync, writeFileSync, readFileSync } from "fs";
import { join } from "path";
import { PNG } from "pngjs";
import { offline } from "./route.mjs";
import { repoPath } from "./repo.mjs";

const SPORT = process.env.SPORT || "4310";
const BASE = `http://localhost:${SPORT}`;
const OUT = process.env.OUT || "/tmp/isleart/shot";
/** 時間帯。**既定は昼**（色を比べるときは昼、と決まっている） */
const TIME = process.env.TIME || "day";
/** 撮る島。**トップページ（`/`）がアルバニアの島** */
const PAGES = (process.env.PAGES ||
  "europe=/island/europe,middle-east=/island/middle-east,caucasus=/island/caucasus," +
  "iran-walk=/island/iran-walk,nordic=/island/nordic,albania=/").split(",");

mkdirSync(OUT, { recursive: true });

/** 無彩色とみなす彩度。これを下回る画素は明度だけの棚へ入れる */
const GRAY_S = 0.12;

/** 1枚ぶんの棚（12×4 + 4 = 52）。割合で返す */
function hist(buf) {
  const png = PNG.sync.read(buf);
  const bins = new Float64Array(52);
  let n = 0;
  for (let i = 0; i < png.data.length; i += 4) {
    const r = png.data[i] / 255, g = png.data[i + 1] / 255, b = png.data[i + 2] / 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    const v = mx;
    const s = mx === 0 ? 0 : (mx - mn) / mx;
    let k;
    if (s < GRAY_S) {
      k = 48 + Math.min(3, Math.floor(v * 4));
    } else {
      let h;
      if (mx === mn) h = 0;
      else if (mx === r) h = ((g - b) / (mx - mn) + 6) % 6;
      else if (mx === g) h = (b - r) / (mx - mn) + 2;
      else h = (r - g) / (mx - mn) + 4;
      const hi = Math.min(11, Math.floor((h / 6) * 12));
      const vi = Math.min(3, Math.floor(v * 4));
      k = hi * 4 + vi;
    }
    bins[k]++;
    n++;
  }
  for (let i = 0; i < 52; i++) bins[i] /= n;
  return Array.from(bins);
}

/** 2つの棚の一致率（0〜1） */
const overlap = (a, b) => a.reduce((s, v, i) => s + Math.min(v, b[i]), 0);

const b = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--no-sandbox"],
});
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
await offline(ctx, { photo: repoPath("tools/sprites/photo-480.jpg") });
await ctx.addInitScript(() => {
  try {
    localStorage.setItem("ayato-island-arrived", "2026-09-04");
    localStorage.setItem("ayato-island-walked", "1");
    localStorage.setItem("ayato-island-today", "2026-09-05");
  } catch {}
});

const H = {};
const shots = [];
for (const spec of PAGES) {
  const [slug, path] = spec.split("=");
  const p = await ctx.newPage();
  const errs = [];
  p.on("pageerror", (e) => errs.push(String(e)));
  await p.goto(BASE + (path === "/" ? "/index.html" : `${path}.html`), { waitUntil: "load", timeout: 60000 });
  await p.waitForTimeout(2600);
  /* **昼で撮る。** `app/layout.tsx` は見ている人の時計で `data-time` を決めるので、
     この箱（UTC）で撮ると真夜中の島になる。夜は `--tint` の乗算が 0.55 掛かって
     **何色を置いても似た色に集まる**（`tokens.css` の夜の注）。
     色を比べるのは昼、と決まっている（`CLAUDE.md`）。 */
  await p.evaluate((t) => { document.documentElement.dataset.time = t; }, TIME);
  // 島を止める。CSS だけでは足りない（島は rAF で動く）
  await p.evaluate(() => { window.requestAnimationFrame = () => 0; });
  await p.addStyleTag({ content: "*,*::before,*::after{animation:none!important;transition:none!important}" });
  await p.waitForTimeout(400);
  const file = join(OUT, `${slug}.png`);
  const buf = await p.screenshot();
  writeFileSync(file, buf);
  H[slug] = hist(buf);
  shots.push({ slug, file });
  if (errs.length) console.log(`  !! ${slug}: ${errs[0]}`);
  await p.close();
}

// ---- 6島を並べた1枚 -------------------------------------------------------
/* 絵は data: で埋める。`setContent` の頁は about:blank なので、
   `file://` の絵は**黙って出ない**（並べた1枚が真っ黒になる。1度やった）。 */
const cells = shots
  .map(
    (s) =>
      `<figure><img src="data:image/png;base64,${readFileSync(s.file).toString("base64")}">` +
      `<figcaption>${s.slug}</figcaption></figure>`,
  )
  .join("");
const grid = await ctx.newPage();
await grid.setContent(
  `<style>body{margin:0;background:#13223a;font:700 26px system-ui;color:#fff}
   .g{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;padding:10px}
   figure{margin:0}img{width:100%;display:block;border-radius:8px}
   figcaption{padding:6px 2px 0}</style><div class="g">${cells}</div>`,
);
await grid.waitForTimeout(600);
writeFileSync(join(OUT, "grid.png"), await grid.screenshot({ fullPage: true }));

// ---- どの2島が、どれだけ同じ色づかいか -----------------------------------
const slugs = shots.map((s) => s.slug);
const pairs = [];
for (let i = 0; i < slugs.length; i++)
  for (let j = i + 1; j < slugs.length; j++)
    pairs.push({ a: slugs[i], b: slugs[j], pct: +(overlap(H[slugs[i]], H[slugs[j]]) * 100).toFixed(1) });
pairs.sort((x, y) => y.pct - x.pct);
for (const p of pairs) console.log(`${String(p.pct).padStart(5)}%  ${p.a} vs ${p.b}`);
console.log(`いちばん似ている2島: ${pairs[0].pct}%  -> ${join(OUT, "grid.png")}`);
writeFileSync(join(OUT, "hist.json"), JSON.stringify({ hist: H, pairs }, null, 1));

await b.close();
