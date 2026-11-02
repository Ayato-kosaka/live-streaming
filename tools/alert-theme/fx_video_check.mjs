/**
 * 光の演出を動画で流す試し（#1079。`public/alert/fxtest/`）を、この箱のブラウザで流して確かめる道具。
 * 合否は出さない（数と撮った絵を出して、人が見る）。
 *
 *   node tools/alert-theme/fx_video_check.mjs alpha --base http://127.0.0.1:4417 --frames <コマの置き場> --out <置き場>
 *   node tools/alert-theme/fx_video_check.mjs perf  --base http://127.0.0.1:4417 --rounds 3 --out <置き場>
 *   node tools/alert-theme/fx_video_check.mjs scene --base http://127.0.0.1:4417 --out <置き場>
 *
 * `--base` は Expo の書き出しに `public/alert` を重ねて静的に配ったもの（`/alertbox/` と `/alert/perf.html` が開ける）。
 *
 * ## alpha … 透明が抜けているか（1秒おき × 3通り）
 *
 * `perf.html` の `<style>` と `<svg>`（重ね方そのもの）を読み、同じ組み方で動画を1本だけ置いたページを作って、
 * 1〜6 秒に止めて撮る。撮り方は2つ:
 *
 * - **ページの外に色**（`omitBackground` で透明つきに撮り、外で色に重ねる）… PRISM と同じ。
 *   PRISM はウィジェットの透明なページを、カメラの絵の**上に**重ねる。カメラはページの中に無い
 * - **ページの下地に色**（`Emulation.setDefaultBackgroundColorOverride`）… 参考。下地はページの中なので、
 *   `mix-blend-mode: screen` はここと混ざる。**この撮り方で黒地が抜けて見えても、配信では抜けない**
 *
 * 出すもの: `<置き場>/alpha/<種類>-<秒>-{out,in-m,in-g}.png` と、種類ごとの表（透明 ≤3/255 の画素の割合・
 * 不透明 ≥250 の割合・焼いたコマの透明度との差の平均）。地の色を替えた2枚は、外で重ねるので Python で並べる
 * （`fx_video.py checksheet`）。
 *
 * ## perf … この箱でのコマ・CPU・GPU（比べ合い。スマホの代わりにはならない）
 *
 * `perf.html?only=video` を PRISM の条件（箱 436×776・密度3・`visualViewport.scale` 0.5）で流し、
 * 場面ごと（`perf.html` が測っている間だけ `<body data-measuring>` を立てる）に、プロセスの種類ごとの
 * CPU 秒（CDP の `SystemInfo.getProcessInfo`）を割る。**この箱は合成も動画の展開もソフトウェア
 * （SwiftShader・CPU）なので、スマホ（動画をハードウェアで展開する）の重さはここからは分からない。**
 *
 * ## scene … 配信にどう写るか
 *
 * `perf.html?only=video` を流しながら、動画の場面ごとに2回（投げ銭から約2.3秒・4.3秒）、透明つきで撮る。
 * 配信画面に重ねるのは `fx_video.py scenesheet`。
 */
import { mkdirSync, writeFileSync, appendFileSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { chromium } from "../sprites/node_modules/playwright-core/index.mjs";
import { chromePath } from "../sprites/chrome.mjs";
import { prism, prismNote } from "../sprites/prism.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const { PNG } = createRequire(join(here, "../sprites/x.js"))("pngjs");

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] != null ? process.argv[i + 1] : fallback;
}
function die(msg) {
  console.error(msg);
  process.exit(1);
}

const mode = process.argv[2];
const base = arg("base", "http://127.0.0.1:4417").replace(/\/$/, "");
const out = arg("out", "");
if (!["alpha", "perf", "scene"].includes(mode) || !out) die("使い方: fx_video_check.mjs alpha|perf|scene --base <URL> --out <置き場>（頭の説明）");
mkdirSync(out, { recursive: true });
const exe = chromePath();
if (!exe) die("ブラウザが見つからない（tools/sprites/chrome.mjs）");

const KINDS = ["webm", "screen", "pack"];
const SRC = { webm: "/alert/fxtest/glow-720.webm", screen: "/alert/fxtest/glow-720-black.mp4", pack: "/alert/fxtest/glow-720-pack.mp4" };

/** 試し表示の投げ銭の人の絵（本番は cloudfront。この箱からは出られないので、手元の絵で返す） */
const charPath = arg("char", join(here, "../../site/public/characters/ayato.webp"));
const charImg = readFileSync(charPath);

/** 外の宛先には出ない。試し表示の人の絵だけ手元の絵で返し、ほかは止めて数える */
async function local(ctx, aborted) {
  await ctx.route("**/*", (r) => {
    const u = r.request().url();
    if (u.startsWith(base) || u.startsWith("data:") || u.startsWith("blob:")) return r.continue();
    if (u.includes("cloudfront.net/assets/images/"))
      return r.fulfill({ status: 200, contentType: "image/webp", body: charImg, headers: { "access-control-allow-origin": "*" } });
    aborted.push(u.slice(0, 120));
    return r.abort();
  });
}

// ------------------------------------------------------------------ alpha
async function alpha(browser) {
  const frames = arg("frames", "");
  const secs = arg("secs", "1,2,3,4,5,6").split(",").map(Number);
  const perfHtml = await (await fetch(`${base}/alert/perf.html`)).text();
  const style = perfHtml.match(/<style>[\s\S]*?<\/style>/)?.[0];
  const svg = perfHtml.match(/<svg[\s\S]*?<\/svg>/)?.[0];
  if (!style || !svg) die("perf.html から <style> か <svg> が読めない");
  const dir = join(out, "alpha");
  mkdirSync(dir, { recursive: true });
  const rows = [];
  for (const kind of KINDS) {
    // perf.html の makePlayer と同じ組み方（class の名前・入れ子）
    const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">${style}</head>
<body>${svg}<div id="tag"></div><script>
const kind = ${JSON.stringify(kind)};
const v = document.createElement("video");
v.muted = true; v.playsInline = true; v.preload = "auto";
let shown = v;
if (kind === "pack") { shown = document.createElement("div"); shown.className = "fxpack"; shown.appendChild(v); }
else v.className = "fx" + (kind === "screen" ? " screen" : "");
document.body.insertBefore(shown, document.getElementById("tag"));
shown.style.opacity = "1";
v.src = ${JSON.stringify(SRC[kind])};
window.seek = (t) => new Promise((res) => {
  const done = () => requestAnimationFrame(() => requestAnimationFrame(() => res(v.currentTime)));
  v.addEventListener("seeked", done, { once: true });
  v.currentTime = t;
});
window.ready = new Promise((res) => v.addEventListener("loadeddata", () => res(true), { once: true }));
</script></body></html>`;
    const ctx = await browser.newContext({ viewport: { width: 360, height: 640 }, deviceScaleFactor: 2 });
    const aborted = [];
    await local(ctx, aborted);
    await ctx.route(`${base}/__fxview`, (r) => r.fulfill({ contentType: "text/html", body: html }));
    const p = await ctx.newPage();
    const cdp = await ctx.newCDPSession(p);
    await p.goto(`${base}/__fxview`);
    await p.evaluate(() => window.ready);
    for (const s of secs) {
      const at = await p.evaluate((t) => window.seek(t), s);
      const shot = await p.screenshot({ omitBackground: true });
      writeFileSync(join(dir, `${kind}-${s}-out.png`), shot);
      for (const [tag, c] of [["in-m", { r: 255, g: 0, b: 255, a: 1 }], ["in-g", { r: 0, g: 255, b: 0, a: 1 }]]) {
        await cdp.send("Emulation.setDefaultBackgroundColorOverride", { color: c });
        writeFileSync(join(dir, `${kind}-${s}-${tag}.png`), await p.screenshot());
      }
      await cdp.send("Emulation.setDefaultBackgroundColorOverride", {});
      const png = PNG.sync.read(shot);
      let clear = 0, solid = 0, sum = 0, err = 0, nErr = 0;
      const ref = frames ? PNG.sync.read(readFileSync(join(frames, "rgba", `${String(Math.round(at * 30)).padStart(4, "0")}.png`))) : null;
      for (let i = 0; i < png.width * png.height; i++) {
        const a = png.data[i * 4 + 3];
        if (a <= 3) clear++;
        if (a >= 250) solid++;
        sum += a;
        if (ref && ref.width === png.width) {
          err += Math.abs(a - ref.data[i * 4 + 3]);
          nErr++;
        }
      }
      const n = png.width * png.height;
      rows.push({ kind, sec: s, at, clear: clear / n, solid: solid / n, mean: sum / n / 255, alphaErr: nErr ? err / nErr / 255 : null });
    }
    if (aborted.length) console.log(`${kind}: 外へ出ようとした ${aborted.length} 件（止めた）: ${aborted.slice(0, 3).join(" ")}`);
    await ctx.close();
  }
  console.log("| 種類 | 秒 | 透明（≤3/255）の画素 | 不透明（≥250）の画素 | 透明度の平均 | 焼いたコマとの差（平均） |");
  console.log("| --- | --- | --- | --- | --- | --- |");
  for (const r of rows)
    console.log(`| ${r.kind} | ${r.at.toFixed(2)} | ${(r.clear * 100).toFixed(1)}% | ${(r.solid * 100).toFixed(1)}% | ${r.mean.toFixed(3)} | ${r.alphaErr == null ? "-" : r.alphaErr.toFixed(4)} |`);
  writeFileSync(join(dir, "alpha.json"), JSON.stringify(rows, null, 1));
}

// ------------------------------------------------------------------ perf / scene
async function perfContext(browser) {
  const ctx = await browser.newContext({ viewport: { width: 436, height: 776 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  await prism(ctx);
  return ctx;
}

async function cpuByType(bcdp) {
  const { processInfo } = await bcdp.send("SystemInfo.getProcessInfo");
  const o = {};
  for (const x of processInfo) o[x.type] = (o[x.type] ?? 0) + x.cpuTime;
  return o;
}

async function perfOnce(browser, bcdp) {
  const ctx = await perfContext(browser);
  const aborted = [];
  await local(ctx, aborted);
  const p = await ctx.newPage();
  const errors = [];
  p.on("pageerror", (e) => errors.push(String(e).slice(0, 160)));
  await p.goto(`${base}/alert/perf.html?only=video`);
  const windows = {};
  let cur = null;
  let c0 = null;
  let s0 = 0;
  const deadline = Date.now() + 180_000;
  while (Date.now() < deadline) {
    const st = await p.evaluate(() => ({ m: document.body.getAttribute("data-measuring"), done: !!window.__perf }));
    if (st.m && st.m !== cur) {
      cur = st.m;
      c0 = await cpuByType(bcdp);
      s0 = Date.now();
    } else if (!st.m && cur) {
      const c1 = await cpuByType(bcdp);
      const sec = (Date.now() - s0) / 1000;
      windows[cur] = Object.fromEntries(Object.keys(c1).map((k) => [k, ((c1[k] - (c0[k] ?? 0)) * 1000) / sec]));
      cur = null;
    }
    if (st.done) break;
    await p.waitForTimeout(100);
  }
  const res = await p.evaluate(() => window.__perf);
  if (!res) die("表が出なかった（180秒）");
  const card = await p.screenshot();
  await ctx.close();
  return { res: res.map((x) => ({ ...x, cpu: windows[x.name] ?? {} })), errors, aborted, card };
}

const median = (xs) => {
  const s = xs.filter(Number.isFinite).sort((a, b) => a - b);
  return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : NaN;
};

async function perf(browser) {
  const rounds = Math.max(1, Number(arg("rounds", "3")));
  console.log(prismNote());
  console.log(`箱 436x776・密度 3・perf.html?only=video を ${rounds} 回`);
  const bcdp = await browser.newBrowserCDPSession();
  const all = [];
  for (let r = 0; r < rounds; r++) {
    const { res, errors, aborted, card } = await perfOnce(browser, bcdp);
    writeFileSync(join(out, `perf-card-${r}.png`), card);
    appendFileSync(join(out, "perf.jsonl"), JSON.stringify({ round: r, res, errors, aborted, load: loadavg() }) + "\n");
    for (const x of res) {
      all.push(x);
      const v = x.video;
      console.log(
        `r${r} ${x.name.padEnd(12)} fps ${x.fps.toFixed(1)} カクつき ${x.stutter} 最長 ${Math.round(x.max)}ms ` +
          `描画 ${Math.round(x.cpu.renderer ?? NaN)} GPU ${Math.round(x.cpu.GPU ?? NaN)} 全体 ${Math.round(sumCpu(x.cpu))}` +
          (v ? ` 動画 ${v.failed || "出た"} 動き出し ${v.playing == null ? "-" : Math.round(v.playing) + "ms"} 落ち ${v.dropped}/${v.frames}` : "")
      );
    }
    if (errors.length) console.log(`  例外 ${errors.length}: ${errors[0]}`);
    if (aborted.length) console.log(`  外へ出ようとした ${aborted.length} 件（止めた）`);
  }
  const names = [...new Set(all.map((x) => x.name))];
  console.log("\n| 場面 | コマ/秒 | カクつき | 最長コマ | 描画 CPU ms/秒 | GPU ms/秒 | 全プロセス ms/秒 | 動画 | 落ちたコマ |");
  console.log("| --- | --- | --- | --- | --- | --- | --- | --- | --- |");
  for (const n of names) {
    const xs = all.filter((x) => x.name === n);
    const m = (f) => median(xs.map(f));
    const v = xs.map((x) => x.video).filter(Boolean);
    console.log(
      `| ${n} | ${m((x) => x.fps).toFixed(1)} | ${m((x) => x.stutter)} | ${Math.round(m((x) => x.max))}ms | ${Math.round(m((x) => x.cpu.renderer))} | ${Math.round(m((x) => x.cpu.GPU))} | ${Math.round(m((x) => sumCpu(x.cpu)))} | ` +
        `${v.length ? v.map((y) => y.failed || "出た").join("・") : "-"} | ${v.length ? v.map((y) => `${y.dropped}/${y.frames}`).join("・") : "-"} |`
    );
  }
}

const sumCpu = (c) => Object.values(c).reduce((a, b) => a + b, 0);
const loadavg = () => {
  try {
    return Number(readFileSync("/proc/loadavg", "utf8").split(" ")[0]);
  } catch {
    return null;
  }
};

async function scene(browser) {
  const ctx = await perfContext(browser);
  const aborted = [];
  await local(ctx, aborted);
  const p = await ctx.newPage();
  await p.goto(`${base}/alert/perf.html?only=video`);
  const dir = join(out, "scene");
  mkdirSync(dir, { recursive: true });
  const seen = new Set();
  const deadline = Date.now() + 180_000;
  while (Date.now() < deadline) {
    const st = await p.evaluate(() => ({ m: document.body.getAttribute("data-measuring"), done: !!window.__perf }));
    if (st.done) break;
    if (st.m && !seen.has(st.m)) {
      seen.add(st.m);
      // 測り始めは、動画が始まってから約1.5秒（perf.html の LEAD_MS）。投げ銭は動画の 0.8 秒あと
      for (const [i, wait] of [[0, 1500], [1, 2000]]) {
        await p.waitForTimeout(wait);
        writeFileSync(join(dir, `${[...seen].length - 1}-${i}.png`), await p.screenshot({ omitBackground: true }));
      }
      writeFileSync(join(dir, `${[...seen].length - 1}.txt`), st.m);
    }
    await p.waitForTimeout(100);
  }
  console.log(`撮った場面: ${[...seen].join(" / ")}（${dir}）`);
  await ctx.close();
}

const browser = await chromium.launch({ executablePath: exe, args: ["--no-sandbox", "--no-proxy-server"] });
try {
  if (mode === "alpha") await alpha(browser);
  else if (mode === "perf") await perf(browser);
  else await scene(browser);
} finally {
  await browser.close();
}
