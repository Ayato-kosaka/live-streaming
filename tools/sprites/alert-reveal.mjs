/**
 * 動画の段（`?fx=full`）で、**名前と額の札が、動画が `revealAt` に来る前に見えていないか**・**額が数え上げ前の
 * 「0」のまま見えていないか**を、毎コマ数える（#1117）。
 *
 *   cd tools/sprites
 *   node alert-reveal.mjs --base http://127.0.0.1:4387 --theme castle --fx full --amount 10000 \
 *        --sizes 436x776,664x1180 --rates 1,4,6 --nets off,slow --runs 5 --char <キャラ絵.png> --json <結果.json>
 *   node alert-reveal.mjs ... --control early      # 対照: 札を最初から見せる → 1 で落ちる
 *
 * ## なぜ要るか
 *
 * 札とキャラ絵は、アラートの頭から `revealAt` 秒たったら出る（壁の時計）。動画のほうは、読み込みや展開が
 * 遅れると、その分だけ遅れて流れる。**動画が遅れた日は、主役が出きる前に札が出て、主役の上に「0円」が乗る**
 * （2026-11-05 の alert_check で、段7・664x1180 の 5 秒のコマに写った）。重なりの道具は時計を止めて
 * 間引いて撮るので、この窓（0.5 秒ほど）に当たる回と当たらない回がある。ここは止めずに毎コマ見る。
 *
 * ## 数えるもの（1コマごと）
 *
 * - `early` … 札が見えている（祖先までの opacity の積が 0.05 超で、面の中にある）のに、奥の動画が
 *   まだ流れ始めていない（層に動画はあるが、どれも透明）か、登場の本で `currentTime < revealAt - 0.05`
 * - `zero` … 札が見えていて、額が「0円」
 * - 参考: `band` … 札の上の端が面の上 20%（段4〜7 の主役の帯）にかかっているコマ。合否に入れない
 *
 * 条件は CPU の絞り（`--rates`）× 回線（`--nets`: off = そのまま / slow = 往復 300ms・下り 4Mbps）× 箱の大きさ ×
 * `--runs` 回。試し表示は読み込みの直後に出る（動画を先に落としていない、いちばん遅れやすい形）。
 *
 * PRISM の縮み方（`prism.mjs`）を既定で入れる。
 *
 * 終了コード: 0 = どの回も early・zero が 0 / 1 = どれかが 1 以上 / 2 = 動画の出た回が1つも無い（測れていない）
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { chromium } from "playwright-core";
import { chromePath } from "./chrome.mjs";
import { prism, prismNote } from "./prism.mjs";
import { fxManifest, seasonThemes, tierOf } from "./alertseason.mjs";

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] != null ? process.argv[i + 1] : fallback;
}
function die(msg) {
  console.error(msg);
  process.exit(2);
}

const base = arg("base", "http://127.0.0.1:4387").replace(/\/$/, "");
const season = arg("theme", null) ? null : seasonThemes().find((t) => t.fx);
const theme = arg("theme", null) ?? season?.theme ?? die("動画の段を持つテーマが無い（--theme で名指しする）");
const fx = arg("fx", season?.fx ?? "full");
const amount = Number(arg("amount", "10000"));
const sizes = arg("sizes", "436x776,664x1180").split(",").map((s) => s.split("x").map(Number));
const rates = arg("rates", "1,4,6").split(",").map(Number);
const nets = arg("nets", "off,slow").split(",");
const runs = Math.max(1, Number(arg("runs", "5")));
const jobs = Math.max(1, Number(arg("jobs", "3")));
const control = arg("control", "");
if (control && control !== "early") die(`--control は early（${control}）`);
const charFile = arg("char", "../../site/public/goods/ayato-walk.png");
if (!existsSync(resolve(charFile))) die(`キャラ絵が無い: ${charFile}`);
const charBody = readFileSync(resolve(charFile));
const MSG = "今日はマジ緊急の緊急で疲れてしもたな！パンパンでパンと豆挽こうぜ！！broの食ってる姿見せてくれや！まめまめキューーーン";
const NET = { slow: { offline: false, latency: 300, downloadThroughput: 500_000, uploadThroughput: 125_000 } };
for (const n of nets) if (n !== "off" && !NET[n]) die(`--nets は off・slow（${n}）`);

const exe = chromePath() ?? (existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : null);
if (!exe) die("ブラウザが見つからない（chrome.mjs）");

/* 毎コマの見本。札が DOM に入った瞬間を 0 にする（札の出る秒はそこから数えられる） */
const SAMPLER = `(() => {
  const R = (window.__rv = { t0: null, f: [] });
  const seen = (el) => {
    let op = 1;
    for (let e = el; e && e.nodeType === 1; e = e.parentElement) op *= Number(getComputedStyle(e).opacity);
    return op;
  };
  const loop = () => {
    const plate = document.querySelector('[data-plate="box"]');
    if (plate) {
      if (R.t0 == null) R.t0 = performance.now();
      const r = plate.getBoundingClientRect();
      const vis = seen(plate) > 0.05 && r.bottom > 0 && r.top < innerHeight && r.width > 0 ? 1 : 0;
      const vids = [...document.querySelectorAll('[data-fx-video="back"] video')];
      const shown = vids.find((v) => v.style.opacity !== "0");
      const part = shown ? ((shown.currentSrc || shown.src).match(/-(intro|stay|outro)\\./) || [])[1] || "?" : vids.length ? "wait" : "none";
      // 額の字（数え上げが書き換える字の箱）が「0」。札の字は縁取りの写しと重ねてあり、textContent では「000円円円」になる
      const zero = [...plate.querySelectorAll('[data-ink="fill"]')].some((e) => (e.textContent || "").trim() === "0") || /^[^0-9]*0円/.test(plate.textContent || "") ? 1 : 0;
      R.f.push([+(performance.now() - R.t0).toFixed(1), vis, part, shown ? +shown.currentTime.toFixed(3) : -1, zero, +(r.top / innerHeight).toFixed(3)]);
    }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
})();`;

async function one(browser, { W, H, rate, net, i }, revealAt, introDur) {
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  try {
    await prism(ctx);
    await ctx.route("**/*", (r) => {
      const u = r.request().url();
      if (u.includes("cloudfront.net")) return r.fulfill({ contentType: "image/png", body: charBody, headers: { "access-control-allow-origin": "*" } });
      return u.startsWith(base) || u.startsWith("data:") || u.startsWith("blob:") ? r.continue() : r.abort();
    });
    await ctx.addInitScript(SAMPLER);
    /* 対照: 「0円」の札を、ページが開いたときから面の上のほうに置く（動画の頭より先に札が見えている形）。
       アプリの札は動画が revealAt に来るまで組まれないので、札の側を CSS で見せる対照は効かない。
       数え方（見えているか・動画の秒・0円）が落ちるときに落ちるかを見る */
    if (control === "early")
      await ctx.addInitScript(() => {
        document.addEventListener("DOMContentLoaded", () => {
          const d = document.createElement("div");
          d.setAttribute("data-plate", "box");
          d.textContent = "aoi 様 0円 ありやとう！！";
          Object.assign(d.style, { position: "fixed", left: "10%", top: "8%", width: "70%", height: "60px", color: "#fff", fontSize: "24px", zIndex: "9" });
          document.body.appendChild(d);
        });
      });
    const page = await ctx.newPage();
    const cdp = await ctx.newCDPSession(page);
    await cdp.send("Emulation.setCPUThrottlingRate", { rate });
    if (net !== "off") {
      await cdp.send("Network.enable");
      await cdp.send("Network.emulateNetworkConditions", NET[net]);
    }
    const q = new URLSearchParams({ preview: "1", theme, amount: String(amount), name: "aoi", msg: MSG });
    if (fx) q.set("fx", fx);
    await page.goto(`${base}/alertbox/?${q}`, { waitUntil: "domcontentloaded", timeout: 60000 });
    // 札が入ってから、動画で revealAt + 2.5 秒まで（動画が遅れても、壁の時計で 30 秒まで）
    await page.waitForFunction(() => window.__rv && window.__rv.t0 != null, null, { timeout: 60000, polling: 100 });
    await page
      .waitForFunction(
        ({ r }) => {
          const f = window.__rv.f;
          const last = f[f.length - 1];
          return (last && last[2] === "intro" && last[3] >= r + 2.5) || (last && (last[2] === "stay" || last[2] === "outro")) || (last && last[0] > 30000);
        },
        { r: Math.min(revealAt, introDur) },
        { timeout: 90000, polling: 200 }
      )
      .catch(() => {});
    const f = await page.evaluate(() => window.__rv.f);
    const video = f.some((x) => x[2] === "intro" || x[2] === "stay");
    let early = 0;
    let zero = 0;
    let band = 0;
    let first = null;
    let worst = 0;
    for (const [t, vis, part, vt, z, top] of f) {
      if (!vis) continue;
      if (!first) first = { t, part, vt };
      const before = part === "wait" || (part === "intro" && vt < revealAt - 0.05);
      if (before) {
        early++;
        if (part === "intro") worst = Math.max(worst, revealAt - vt);
        else worst = Math.max(worst, revealAt);
      }
      if (z) zero++;
      if (top < 0.2 && (part === "intro" || part === "stay")) band++;
    }
    return { size: `${W}x${H}`, rate, net, i, frames: f.length, video, early, zero, band, first, worst: +worst.toFixed(2) };
  } finally {
    await ctx.close();
  }
}

async function main() {
  console.log(prismNote());
  const man = await fxManifest(base, theme);
  const tier = man?.tiers?.[String(tierOf(amount))];
  if (!tier) die(`${theme} の manifest に段${tierOf(amount)} が無い（--fx の動画の段で回す道具）`);
  console.log(`テーマ ${theme}・旗 fx=${fx}・${amount}円（段${tierOf(amount)}・revealAt ${tier.revealAt}秒）${control ? `・対照 ${control}` : ""}`);
  const browser = await chromium.launch({ executablePath: exe, args: ["--no-sandbox", "--no-proxy-server", "--autoplay-policy=no-user-gesture-required"] });
  const queue = [];
  for (const [W, H] of sizes) for (const rate of rates) for (const net of nets) for (let i = 1; i <= runs; i++) queue.push({ W, H, rate, net, i });
  const rows = [];
  const errs = [];
  await Promise.all(
    Array.from({ length: jobs }, async () => {
      for (let job = queue.shift(); job; job = queue.shift()) {
        try {
          const r = await one(browser, job, tier.revealAt, tier.introDur);
          rows.push(r);
          console.log(
            `${r.size} CPU${r.rate}倍 回線 ${r.net} #${r.i}: 動画 ${r.video ? "○" : "×"}  札が先 ${r.early}コマ（最大 ${r.worst}秒早い）  0円 ${r.zero}コマ  帯 ${r.band}  ` +
              `札が出た: ${r.first ? `${(r.first.t / 1000).toFixed(2)}s ${r.first.part} ${r.first.vt}` : "-"}`
          );
        } catch (e) {
          errs.push(`${job.W}x${job.H} CPU${job.rate} ${job.net} #${job.i}: ${String(e).slice(0, 160)}`);
        }
      }
    })
  );
  await browser.close();
  const withVideo = rows.filter((r) => r.video);
  const bad = rows.filter((r) => r.early || r.zero);
  const by = {};
  for (const r of rows) {
    const k = `${r.size} CPU${r.rate} ${r.net}`;
    by[k] ??= { runs: 0, video: 0, earlyRuns: 0, zeroRuns: 0, early: 0, zero: 0, worst: 0 };
    const b = by[k];
    b.runs++;
    b.video += r.video ? 1 : 0;
    b.earlyRuns += r.early ? 1 : 0;
    b.zeroRuns += r.zero ? 1 : 0;
    b.early += r.early;
    b.zero += r.zero;
    b.worst = Math.max(b.worst, r.worst);
  }
  console.log(`\n${rows.length} 回（動画の出た回 ${withVideo.length}）。札が先に見えたコマ ${rows.reduce((s, r) => s + r.early, 0)}・0円が見えたコマ ${rows.reduce((s, r) => s + r.zero, 0)}`);
  for (const [k, b] of Object.entries(by)) console.log(`  ${k}: 動画 ${b.video}/${b.runs}  札が先 ${b.earlyRuns}回 ${b.early}コマ（最大 ${b.worst}秒）  0円 ${b.zeroRuns}回 ${b.zero}コマ`);
  if (errs.length) console.log("測れなかった:", errs.slice(0, 5));
  const code = !withVideo.length ? 2 : bad.length ? 1 : 0;
  const json = arg("json", "");
  if (json)
    writeFileSync(
      resolve(json),
      JSON.stringify(
        {
          tool: "alert-reveal", exit: code, theme, fx, amount, revealAt: tier.revealAt, control, runs: rows.length, video: withVideo.length,
          frames: rows.reduce((s, r) => s + r.frames, 0), early: rows.reduce((s, r) => s + r.early, 0), zero: rows.reduce((s, r) => s + r.zero, 0),
          band: rows.reduce((s, r) => s + r.band, 0), by, bad: bad.slice(0, 20), errs,
        },
        null,
        1
      )
    );
  process.exit(code);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
