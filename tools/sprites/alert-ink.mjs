/**
 * 投げ銭アラートの字（名前・額・メッセージ）の濃さを、**本物の配信画面の上で**、描かれた画素から測る。
 * 計算は `inkjudge.mjs`（`inkpx.mjs` と同じ式）。
 *
 *   cd tools/sprites
 *   node alert-ink.mjs --base http://localhost:4338 --bg-dir /path/to/bg --chars /path/to/chars \
 *        --amounts 100,300,700,1500,3000,7000,10000 --out /tmp/alert-ink
 *
 * 字は背景の箱を持たず、キャラ絵の上下中央に重なる（2026-10-24 オーナー）。読ませるのは字の
 * 縁取り。なので**本物の配信画面4枚（`prism-<名前>.jpg`）× 名簿の本物のキャラ絵**の上で、
 * 字のある絵と、字の色の層だけを透明にした絵（縁取りは残る）の2枚を撮り、字の画素とその下の地の
 * 濃さの比を出す。
 *
 * 合格: どの字も、字の芯の中央値が 4.5 以上で、**地のいちばん明るいところ（上位 5%）に対しても**
 * 4.5 以上。季節の段（`--theme halloween`）と季節の外（`none`）の両方を回す。
 *
 * PRISM の縮み方（`visualViewport.scale = 0.5`。豚だけが半分に描かれ、雨の落ちる先も半分の高さ）を
 * **既定で入れて撮る**（`prism.mjs`。`docs/island-misses.md` #311）。`--no-prism` で外すのは、
 * 外したときの数を見る対照だけ。外した数で判断しない。
 *
 * 終了コード: 0 = 全部 4.5 以上 / 1 = 割れた字がある / 2 = 測れなかった（字を拾えない・2枚が違う）
 */
import { mkdirSync, readFileSync, readdirSync, existsSync } from "node:fs";
import { join, resolve, basename, extname } from "node:path";
import { chromium } from "playwright-core";
import { chromePath } from "./chrome.mjs";
import { prism, prismNote } from "./prism.mjs";
import { judgeInk } from "./inkjudge.mjs";
import { serveDirectory } from "./fixserve.mjs";

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] != null ? process.argv[i + 1] : fallback;
}
function die(msg) {
  console.error(msg);
  process.exit(2);
}

const base = arg("base", "http://localhost:4338").replace(/\/$/, "");
const bgDir = resolve(arg("bg-dir", process.env.ALERT_BG_DIR ?? ""));
const BGS = ["street", "face", "alert-now", "alert-fish"];
for (const b of BGS) if (!existsSync(join(bgDir, `prism-${b}.jpg`))) die(`配信画面が無い: ${join(bgDir, `prism-${b}.jpg`)}`);
const charDir = resolve(arg("chars", ""));
if (!existsSync(charDir)) die(`キャラ絵の置き場が無い: ${charDir}`);
const chars = readdirSync(charDir)
  .filter((f) => /\.png$/i.test(f))
  .sort()
  .map((f) => ({ id: basename(f, extname(f)), body: readFileSync(join(charDir, f)) }));
if (!chars.length) die("キャラ絵が1枚も無い");
const amounts = arg("amounts", "100,300,700,1500,3000,7000,10000").split(",").map(Number);
const themes = arg("themes", "halloween,none").split(",");
const [W, H] = arg("size", "436x776").split("x").map(Number);
const DPR = Number(arg("dpr", "2"));
const out = resolve(arg("out", "/tmp/alert-ink"));
const jobs = Math.max(1, Number(arg("jobs", "3")));
const LIM = 4.5;
mkdirSync(out, { recursive: true });

/* 字が出そろって止まる秒（キャラ絵が出たあと）。段7は数え上げ「ドン」のあと、段4は書き終えたあと、
   段5（死神）・段6（ゾンビ）はキャラ絵がふくらみ終えたあと */
const settleAt = (theme, a) =>
  theme !== "halloween"
    ? 2.5
    : a >= 10000
      ? 12
      : a >= 5000
        ? 9
        : a >= 2000
          ? 7.5
          : a >= 1000
            ? 7
            : a >= 500
              ? 4
              : 3;
const NAME = "もっと豆挽けコーヒー商店";
const MSG = "今日はマジ緊急の緊急で疲れてしもたな！パンパンでパンと豆挽こうぜ！！";

const exe = chromePath() ?? (existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : null);
if (!exe) die("ブラウザが見つからない（chrome.mjs）");

async function main() {
  console.log(prismNote());
  const browser = await chromium.launch({ executablePath: exe, args: ["--no-sandbox", "--no-proxy-server"] });
  const shots = await serveDirectory(out);
  const judgePage = await (await browser.newContext()).newPage();
  await judgePage.goto(`${shots.base}/`).catch(() => {});
  const queue = [];
  for (const theme of themes) for (const a of theme === "halloween" ? amounts : [amounts[0]]) for (const bg of BGS) for (const ch of chars) queue.push({ theme, a, bg, ch });
  console.log(`${queue.length} 枚（${themes.join("・")} × 段 × 配信画面 ${BGS.length} × キャラ ${chars.length}）`);
  const rows = [];
  const fails = [];
  const errs = [];
  let done = 0;
  async function worker() {
    while (queue.length) {
      const job = queue.shift();
      try {
        rows.push(...(await one(browser, judgePage, shots, job)));
      } catch (e) {
        errs.push(`${job.theme} ${job.a} ${job.bg} ${job.ch.id}: ${String(e).slice(0, 160)}`);
      }
      done++;
      if (done % 20 === 0) console.log(`  ${done} 枚`);
    }
  }
  await Promise.all(Array.from({ length: jobs }, worker));
  shots.close();
  await browser.close();
  for (const r of rows) if (r.mid < LIM || r.rhi < LIM) fails.push(r);
  const by = (k) => {
    const m = new Map();
    for (const r of rows) {
      const key = r[k];
      const v = m.get(key) ?? { n: 0, mid: Infinity, rhi: Infinity };
      v.n++;
      v.mid = Math.min(v.mid, r.mid);
      v.rhi = Math.min(v.rhi, r.rhi);
      m.set(key, v);
    }
    return m;
  };
  console.log(`\n測れた字 ${rows.length}`);
  for (const [k, v] of by("tier")) console.log(`  ${k}: 字 ${v.n} / 中央値のいちばん低い ${v.mid.toFixed(2)} / 明るい地に対していちばん低い ${v.rhi.toFixed(2)}`);
  for (const [k, v] of by("bg")) console.log(`  ${k}: 中央値の最小 ${v.mid.toFixed(2)} / 明るい地に対して ${v.rhi.toFixed(2)}`);
  if (fails.length) {
    console.log(`4.5 割れ ${fails.length}:`);
    for (const f of fails.slice(0, 30)) console.log(`  ${f.tier} ${f.bg} ${f.char} 「${f.t}」 中央値 ${f.mid.toFixed(2)} 明るい地 ${f.rhi.toFixed(2)}`);
  }
  if (errs.length) {
    console.log(`測れなかった ${errs.length}:`);
    for (const e of errs.slice(0, 10)) console.log("  " + e);
  }
  process.exit(errs.length || !rows.length ? 2 : fails.length ? 1 : 0);
}

async function one(browser, judgePage, shots, { theme, a, bg, ch }) {
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: DPR });
  try {
    await prism(ctx);
    await ctx.route("**/*", (r) => {
      const u = r.request().url();
      if (u.includes("cloudfront.net")) return r.fulfill({ contentType: "image/png", body: ch.body, headers: { "access-control-allow-origin": "*" } });
      return u.startsWith(base) || u.startsWith("data:") ? r.continue() : r.abort();
    });
    const data = `data:image/jpeg;base64,${readFileSync(join(bgDir, `prism-${bg}.jpg`)).toString("base64")}`;
    // 配信画面を、アラートの面の地として敷く（アラートの面は透過）
    await ctx.addInitScript((d) => {
      document.addEventListener("DOMContentLoaded", () => {
        document.documentElement.style.background = `url(${d}) center/cover no-repeat`;
      });
    }, data);
    const p = await ctx.newPage();
    const q = new URLSearchParams({ preview: "1", theme, amount: String(a), name: NAME, msg: MSG });
    await p.goto(`${base}/alertbox/?${q}`, { waitUntil: "load" });
    await p.waitForSelector('[data-char="box"]', { timeout: 20000 });
    await p.waitForTimeout(settleAt(theme, a) * 1000);
    // 全部止める（2枚のあいだに動くと差分が嘘になる）
    await p.evaluate(() => {
      document.getAnimations().forEach((x) => x.pause());
      window.requestAnimationFrame = () => 0;
    });
    await p.waitForTimeout(200);
    const boxes = await p.evaluate(() => {
      const out = [];
      document.querySelectorAll('[data-ink="fill"]').forEach((el, i) => {
        const r = el.getBoundingClientRect();
        if (r.width < 2 || r.height < 2) return;
        el.setAttribute("data-inkmark", String(i));
        out.push({ t: (el.textContent || "").trim().slice(0, 14), c: "", tag: el.tagName, color: getComputedStyle(el).color, size: getComputedStyle(el).fontSize, x: r.x, y: r.y, w: r.width, h: r.height });
      });
      return out;
    });
    if (!boxes.length) throw new Error("字を1つも拾えなかった");
    const nm = `${theme}-${a}-${bg}-${ch.id}`;
    await p.screenshot({ path: join(out, `${nm}.shot.png`) });
    await p.addStyleTag({
      content: '[data-inkmark]{color:transparent!important;background-image:none!important;-webkit-text-fill-color:transparent!important}',
    });
    await p.waitForTimeout(120);
    await p.screenshot({ path: join(out, `${nm}.bg.png`) });
    const j = await judgeInk(judgePage, { shotUrl: `${shots.base}/${nm}.shot.png`, bgUrl: `${shots.base}/${nm}.bg.png`, boxes, dpr: DPR, lim: LIM });
    if (j.err) throw new Error(j.err);
    if (!j.rows.length) throw new Error(`測れた字が無い ${JSON.stringify(j.dropped)}`);
    const tier = theme === "halloween" ? `${a}円` : "季節の外";
    return j.rows.map((r) => ({ tier, bg, char: ch.id, t: r.t, mid: r.mid, rhi: Math.min(r.rhi, r.rlo) }));
  } finally {
    await ctx.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
