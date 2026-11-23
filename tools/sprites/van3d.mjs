/**
 * **キッチンカーの 3D を撮って、合格の数で測る。**（`heavy_watch.yml` の `legend` から。3D を持つ企画だけ）
 *
 *   python3 -m http.server 4215 --directory site/.next-ci &
 *   DIST=site/.next-ci SPORT=4215 LEGEND=nomad-kitchen-car PAGE=/legends/nomad-kitchen-car OUT=/tmp/v3 STILLS=/tmp/stills node tools/sprites/van3d.mjs
 *   TARGET=http://127.0.0.1:4317/index.html DIST=<試しの台> … node tools/sprites/van3d.mjs   # 作業箱の試しの台（束ねた手元の html）
 *
 * 終了コード 0＝撮れて、合格の数を全部満たした / 1＝撮れたが、どれかの数が外れた（下の表）/ 2＝撮るものが無い
 * （面か組が無い・面が開けない・撮るブラウザに WebGL が無い）。
 *
 * ## 開きかた（面に撮るための字を出さない）
 *
 * 面を `?van=<組>&state=<day|open|dusk|peek>&still=1`（`w`・`h`・`view` も）で開き、`window.__vanReady` を待つ。
 * 3D の部品（`components/legends/kitchen/VanStage.tsx`）がその姿で止め、測る口 `window.__van`（`van3d/probe.ts`）を立てる。
 * 数は画面の中で数え、絵は外へ運ばない（静止画の webp と、確かめの絵の1枚だけ）。
 *
 * ## 合格の数（build-plan ⑥。`docs/island-design.md` 2章の「どう森の見え方」を数にしたもの）
 *
 * | 何 | 数 | 対照 |
 * | --- | --- | --- |
 * | 横から見た長さ÷高さ | ≦ 1.9 | — |
 * | 運転席の段（箱の屋根 − 運転席の屋根） | ≧ 0.25m | — |
 * | 無地の外装で、日なたの面の下20%÷上20% の明るさ（下ほど暗い陰があるか） | ≦ 0.92 | — |
 * | 同じく、影の面÷日なたの面（影の側も明るいか） | ≧ 0.80 | — |
 * | 390幅・倍率2の斜め前（窓口を開けた姿）で、庇の厚み | ≧ 8px | — |
 * | 同じ絵で、庇の垂れの縞が2色に見えるか | 2色 | — |
 * | 型の検査: 各面を正射影で撮り、型の区画との色差（ΔE76 の平均） | ＜ 8 | 左右を取り違えて貼ると左右が落ちる（落ちなければ測れていない） |
 * | 描く回数・三角形（影を焼く回も入れて、4つの姿の最大） | ≦ 30・≦ 60,000 | — |
 * | console の誤り（全部の開きかた・WebGL の無いブラウザも） | 0 | — |
 * | 3D の束（three を含む。近づいて読んだ JS を gzip で） | ≦ 200KB | — |
 * | 絵の大きさ（外装 ≦ 250KB・1024版 ≦ 150KB・内装 ≦ 150KB・静止画 ≦ 60KB） | — | — |
 *
 * 「下20%÷上20%」: 直しの表（build-plan ⑥）は「上20%÷下20% ≦ 0.92」と書くが、同じ表の直しは「下25% を ×0.86」で、
 * 下が暗い向き。字のままでは上が暗いときに通るので、下÷上で測る。
 *
 * ## 置くもの
 *
 * `STILLS/<組>-<姿>.webp`（800×600。面の静止画。積むのは呼ぶ側）、`OUT/report.json`（数の全部）、
 * `OUT/sheet.png`（組×姿の静止画を並べた1枚）、`OUT/ortho-<面>.png`（型の検査の絵）、`OUT/awning-390.png`。
 */
import { gzipSync } from "node:zlib";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { fromRoot } from "./repo.mjs";

const SPORT = process.env.SPORT || "4215";
const ORIGIN = `http://127.0.0.1:${SPORT}`;
const LEGEND = process.env.LEGEND || "nomad-kitchen-car";
const PAGE = process.env.PAGE || `/legends/${LEGEND}`;
const OUT = fromRoot(process.env.OUT || "/tmp/van3d");
const STILLS = process.env.STILLS ? fromRoot(process.env.STILLS) : "";
const DIST = fromRoot(process.env.DIST || "site/.next-ci");
const EXE = process.env.CHROME || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const STATES = ["day", "open", "dusk", "peek"];
const GL = ["--no-sandbox", "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--disable-dev-shm-usage"];

const LIMIT = {
  ratio: 1.9,
  step: 0.25,
  bottomOverTop: 0.92,
  shadeOverSun: 0.8,
  thickPx: 8,
  de: 8,
  calls: 30,
  triangles: 60000,
  bundle: 200 * 1024,
  skin: 250 * 1024,
  skin1024: 150 * 1024,
  interior: 150 * 1024,
  still: 60 * 1024,
};

async function chromiumOf() {
  try {
    return (await import("playwright-core")).chromium;
  } catch (e) {
    // 作業箱: tools/sprites/node_modules が無い。入っている playwright-core を名指しで読む
    if (!process.env.PW_CORE) throw e;
    return (await import(pathToFileURL(process.env.PW_CORE).href)).chromium;
  }
}

function looksOf() {
  if (process.env.LOOKS) return process.env.LOOKS.split(",").filter(Boolean);
  const p = fromRoot(`python/data/legends/${LEGEND}/book.json`);
  if (!existsSync(p)) return [];
  return (JSON.parse(readFileSync(p, "utf8")).looks || []).map((l) => l.id).filter(Boolean);
}

async function target() {
  if (process.env.TARGET) return process.env.TARGET;
  for (const u of [`${ORIGIN}${PAGE}.html`, `${ORIGIN}${PAGE}`]) {
    try {
      const r = await fetch(u);
      if (r.ok && /<html/i.test(await r.text())) return u;
    } catch {
      /* 次の綴り */
    }
  }
  return "";
}

const errors = [];
function watch(p, tag) {
  p.on("console", (m) => {
    if (m.type() === "error") errors.push(`${tag} console: ${m.text().slice(0, 200)}`);
  });
  p.on("pageerror", (e) => errors.push(`${tag} JS: ${String(e?.message || e).slice(0, 200)}`));
}

async function openStill(browser, url, q, { w = 800, h = 600, dpr = 1 } = {}) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: dpr, reducedMotion: "reduce" });
  const p = await ctx.newPage();
  watch(p, q);
  await p.goto(`${url}?${q}&still=1&w=${w}&h=${h}`, { waitUntil: "load", timeout: 120000 });
  await p.waitForFunction(() => window.__vanReady === true && !!window.__van, null, { timeout: 180000 });
  await p.waitForTimeout(200);
  return { p, ctx };
}

function sizeOf(dir, re) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => re.test(f))
    .map((f) => ({ f, b: statSync(join(dir, f)).size }));
}

async function main() {
  const looks = looksOf();
  if (!looks.length) {
    console.log(`組が無い（python/data/legends/${LEGEND}/book.json の looks）。**撮るものが無い**`);
    return 2;
  }
  const url = await target();
  if (!url) {
    console.log(`面が開けない: ${ORIGIN}${PAGE}(.html)。書き出しに面が無いか、配っていない`);
    return 2;
  }
  mkdirSync(OUT, { recursive: true });
  if (STILLS) mkdirSync(STILLS, { recursive: true });
  const chromium = await chromiumOf();
  const browser = await chromium.launch({ executablePath: existsSync(EXE) ? EXE : undefined, args: GL });
  const R = { url, looks, at: new Date().toISOString(), sha: process.env.GITHUB_SHA || "", limit: LIMIT, stills: [], checks: {}, errors };
  const fail = [];
  const ok = (name, pass, detail) => {
    R.checks[name] = { pass, ...detail };
    if (!pass) fail.push(name);
  };
  try {
    // ---- 静止画（組×姿）と、姿ごとの描く回数 ----
    const sheet = [];
    let calls = 0;
    let tris = 0;
    for (const id of looks) {
      for (const s of STATES) {
        const { p, ctx } = await openStill(browser, url, `van=${id}&state=${s}`);
        const gl = await p.evaluate(() => !!document.querySelector(".kc-van-canvas, canvas"));
        if (!gl) {
          await ctx.close();
          console.log("撮るブラウザに WebGL が無い（3D が立たない）。**撮れない**");
          return 2;
        }
        const st = await p.evaluate(() => window.__van.stats());
        calls = Math.max(calls, st.calls);
        tris = Math.max(tris, st.triangles);
        let data = "";
        let q = 0.86;
        for (; q >= 0.5; q -= 0.08) {
          data = await p.evaluate((qq) => window.__van.webp(qq), q);
          if (Buffer.from(data.split(",")[1], "base64").length <= LIMIT.still) break;
        }
        const buf = Buffer.from(data.split(",")[1], "base64");
        R.stills.push({ id, state: s, bytes: buf.length, q: +q.toFixed(2), calls: st.calls, triangles: st.triangles });
        if (STILLS) writeFileSync(join(STILLS, `${id}-${s}.webp`), buf);
        sheet.push({ label: `${id} ${s}`, data });
        await ctx.close();
      }
    }
    ok("描く回数・三角形", calls <= LIMIT.calls && tris <= LIMIT.triangles, { calls, triangles: tris });
    const bigStill = R.stills.filter((x) => x.bytes > LIMIT.still);
    ok("静止画の大きさ", bigStill.length === 0, { max: Math.max(...R.stills.map((x) => x.bytes)), over: bigStill.map((x) => `${x.id}-${x.state}`) });

    // ---- 形・光・型（最初の組で） ----
    let { p, ctx } = await openStill(browser, url, `van=${looks[0]}&state=day`);
    const shape = await p.evaluate(() => window.__van.shape());
    ok("横から見た長さ÷高さ", shape.ratio <= LIMIT.ratio, { ratio: shape.ratio, length: shape.length, height: shape.height });
    ok("運転席の段", shape.step >= LIMIT.step, { step: shape.step, box: shape.boxTop, cab: shape.cabTop });
    await p.evaluate(() => window.__van.skin("flat"));
    const light = await p.evaluate(() => window.__van.light());
    ok("面の中の陰（下÷上）", light.bottomOverTop <= LIMIT.bottomOverTop && light.n[0] > 20 && light.n[1] > 20, light);
    ok("影の面÷日なたの面", light.shadeOverSun >= LIMIT.shadeOverSun && light.nShade[1] > 20, { shadeOverSun: light.shadeOverSun, sun: light.sun, shade: light.shade, n: light.nShade });
    await p.evaluate(() => window.__van.skin("test"));
    const ortho = {};
    for (const f of ["left", "right", "front", "back", "roof"]) {
      const o = await p.evaluate((ff) => window.__van.ortho(ff), f);
      ortho[f] = { de: o.de, cover: o.cover };
      writeFileSync(join(OUT, `ortho-${f}.png`), Buffer.from(o.shot.split(",")[1], "base64"));
    }
    await p.evaluate(() => window.__van.mirror(true));
    const mirror = {};
    for (const f of ["left", "right", "front", "back", "roof"]) {
      const o = await p.evaluate((ff) => window.__van.ortho(ff), f);
      mirror[f] = { de: o.de, cover: o.cover };
    }
    const okFaces = Object.values(ortho).every((o) => o.de < LIMIT.de && o.cover > 0.5);
    const ctl = mirror.left.de >= LIMIT.de && mirror.right.de >= LIMIT.de && ["front", "back", "roof"].every((f) => mirror[f].de < LIMIT.de);
    ok("型の検査（各面の色差）", okFaces && ctl, { ortho, mirror, control: ctl ? "左右を取り違えると左右だけ落ちる" : "対照が効いていない（測れていない）" });
    await ctx.close();

    // ---- 庇（390幅・倍率2・斜め前・開いた姿・無地） ----
    ({ p, ctx } = await openStill(browser, url, `van=${looks[0]}&state=open&view=front`, { w: 390, h: 293, dpr: 2 }));
    await p.evaluate(() => window.__van.skin("flat"));
    const aw = await p.evaluate(() => window.__van.awning());
    ok("庇の厚み", aw.thickPx >= LIMIT.thickPx, { px: aw.thickPx, dpr: aw.dpr });
    ok("垂れの縞が2色", aw.twoColors, { colors: aw.colors, stripes: aw.stripes });
    await p.screenshot({ path: join(OUT, "awning-390.png") });
    await ctx.close();

    // ---- 3D の束（近づいて読んだ JS を gzip で）----
    ({ p, ctx } = await (async () => {
      const c = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
      const pg = await c.newPage();
      watch(pg, "束");
      return { p: pg, ctx: c };
    })());
    const js = new Map();
    let phase = "first";
    p.on("response", async (r) => {
      const u = r.url();
      if (!/\.m?js(\?|$)/.test(u) || r.status() !== 200) return;
      try {
        const b = await r.body();
        js.set(u, { phase, raw: b.length, gz: gzipSync(b, { level: 9 }).length });
      } catch {
        /* 体の無い応答 */
      }
    });
    await p.goto(url, { waitUntil: "networkidle", timeout: 120000 });
    const stage = await p.$(".kc-van");
    let picked = [];
    if (stage) {
      phase = "3d";
      await stage.scrollIntoViewIfNeeded();
      await p.waitForFunction(() => document.querySelector(".kc-van")?.getAttribute("data-mode") === "live", null, { timeout: 180000 });
      await p.waitForTimeout(500);
      picked = [...js.entries()].filter(([, v]) => v.phase === "3d");
    } else {
      // 試しの台: 開いてすぐ 3D を読む（測る口の束は数えない）
      await p.waitForFunction(() => window.__vanReady === true, null, { timeout: 180000 });
      picked = [...js.entries()].filter(([u]) => !/probe/i.test(u));
    }
    const gz = picked.reduce((a, [, v]) => a + v.gz, 0);
    ok("3D の束（gzip）", picked.length > 0 && gz <= LIMIT.bundle, {
      gzip: gz,
      files: picked.map(([u, v]) => ({ file: u.replace(/^https?:\/\/[^/]+/, ""), raw: v.raw, gzip: v.gz })),
    });
    await ctx.close();

    // ---- WebGL の無いブラウザ: 誤りを出さずに静止画のまま ----
    const nogl = await chromium.launch({ executablePath: existsSync(EXE) ? EXE : undefined, args: ["--no-sandbox", "--disable-3d-apis", "--disable-gpu"] });
    try {
      const c = await nogl.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
      const pg = await c.newPage();
      const before = errors.length;
      watch(pg, "WebGL なし");
      await pg.goto(url, { waitUntil: "networkidle", timeout: 120000 });
      const st = await pg.$(".kc-van");
      let mode = "";
      if (st) {
        await st.scrollIntoViewIfNeeded();
        const b = await pg.$(".kc-van-btn");
        if (b) await b.click();
        await pg.waitForTimeout(1500);
        mode = (await pg.evaluate(() => document.querySelector(".kc-van")?.getAttribute("data-mode") ?? "消えた")) || "";
      }
      ok("WebGL が無いとき", errors.length === before && mode !== "live", { mode: st ? mode : "舞台の無い台（見ない）", errors: errors.length - before });
      await c.close();
    } finally {
      await nogl.close();
    }

    ok("console の誤り", errors.length === 0, { count: errors.length, samples: errors.slice(0, 5) });

    // ---- 絵の大きさ ----
    const pub = join(DIST, "legends", LEGEND);
    const skins = sizeOf(join(pub, "skins"), /\.webp$/);
    const inner = sizeOf(join(pub, "interiors"), /\.webp$/);
    const over = [
      ...skins.filter((x) => x.b > (/-1024\.webp$/.test(x.f) ? LIMIT.skin1024 : LIMIT.skin)).map((x) => `skins/${x.f}`),
      ...inner.filter((x) => x.b > LIMIT.interior).map((x) => `interiors/${x.f}`),
    ];
    ok("型の絵の大きさ", over.length === 0, { skins, interiors: inner, over });

    // ---- 並べた1枚 ----
    const c = await browser.newContext({ viewport: { width: 1600, height: 300 * Math.ceil(sheet.length / 4) + 40 } });
    const pg = await c.newPage();
    await pg.setContent("<body style='margin:0;background:#fffbea'><canvas id=c></canvas></body>");
    const png = await pg.evaluate(async (cells) => {
      const cv = document.getElementById("c");
      cv.width = 1600;
      cv.height = 330 * Math.ceil(cells.length / 4);
      const x = cv.getContext("2d");
      x.fillStyle = "#fffbea";
      x.fillRect(0, 0, cv.width, cv.height);
      x.font = "16px sans-serif";
      x.fillStyle = "#6b4f33";
      for (let i = 0; i < cells.length; i++) {
        const im = new Image();
        im.src = cells[i].data;
        await im.decode();
        const cx = (i % 4) * 400;
        const cy = Math.floor(i / 4) * 330;
        x.drawImage(im, cx, cy + 26, 400, 300);
        x.fillText(cells[i].label, cx + 8, cy + 18);
      }
      return cv.toDataURL("image/png");
    }, sheet);
    writeFileSync(join(OUT, "sheet.png"), Buffer.from(png.split(",")[1], "base64"));
    await c.close();
  } finally {
    await browser.close();
    writeFileSync(join(OUT, "report.json"), JSON.stringify(R, null, 1));
  }
  // ---- 表 ----
  for (const [k, v] of Object.entries(R.checks)) {
    const { pass, ...rest } = v;
    console.log(`${pass ? "○" : "×"} ${k}  ${JSON.stringify(rest).slice(0, 220)}`);
  }
  console.log(`静止画 ${R.stills.length}枚${STILLS ? `（${STILLS}）` : "（積まない）"}・数の全部は ${join(OUT, "report.json")}`);
  return fail.length ? 1 : 0;
}

main().then(
  (code) => {
    process.exitCode = code;
  },
  (e) => {
    console.log(`撮れなかった: ${String(e?.stack || e).slice(0, 600)}`);
    process.exitCode = 2;
  },
);
