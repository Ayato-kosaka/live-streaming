/**
 * 投げ銭アラートの段ごとの描画の CPU を、**登場（0〜8秒）と滞在（12〜20秒）**に分けて測る。
 * 貯金箱だけ（`preview=bank`。ふだんの豚と季節の貯金箱）と季節の外（`theme=none`）も同じ物差しで並べる。
 *
 *   cd tools/sprites
 *   node alert-cpu.mjs --base http://localhost:4349 --char /path/to/panda.png
 *   node alert-cpu.mjs ... --amounts 1500,10000 --rounds 3 --throttle 4
 *
 * 測り方は `framecpu.mjs` と同じ CDP の `Performance.ProcessTime`（描画プロセスが実際に使った CPU 秒）。
 * 壁の時計（rAF の間隔）は、この箱の混み具合で 3 倍動くので使わない（CLAUDE.md）。
 * **1秒あたりの CPU（ms/秒）**で読む。rAF でフレームを数えると、それだけで何もしていない面にも
 * フレームを作らせて CPU が増えるので、数えない。
 * 段は**交互に**回す（A B C … C B A …）。混み具合の波を、どの段にも同じだけ乗せる。
 * 絶対値ではなく、段どうし・貯金箱との比で読む。
 *
 * 箱はふだんの大きさ（437×778）、スマホに寄せて画素の密度 3。
 *
 * PRISM の縮み方（`visualViewport.scale = 0.5`。豚だけが半分に描かれ、雨の落ちる先も半分の高さ）を
 * **既定で入れて撮る**（`prism.mjs`。`docs/island-misses.md` #311）。`--no-prism` で外すのは、
 * 外したときの数を見る対照だけ。外した数で判断しない。
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { chromium } from "playwright-core";
import { chromePath } from "./chrome.mjs";
import { prism, prismNote } from "./prism.mjs";

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] != null ? process.argv[i + 1] : fallback;
}
function die(msg) {
  console.error(msg);
  process.exit(2);
}
const base = arg("base", "http://localhost:4338").replace(/\/$/, "");
const charFile = resolve(arg("char", ""));
if (!existsSync(charFile)) die(`キャラ絵が無い: ${charFile}`);
const amounts = arg("amounts", "100,300,700,1500,3000,7000,10000").split(",").map(Number);
const rounds = Math.max(1, Number(arg("rounds", "2")));
const throttle = Number(arg("throttle", "0"));
const [W, H] = arg("size", "437x778").split("x").map(Number);
const DSF = Number(arg("dsf", "3"));
const exe = chromePath() ?? (existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : null);
if (!exe) die("ブラウザが見つからない（chrome.mjs）");

const WINDOWS = [
  ["登場 0〜8秒", 0, 8],
  ["滞在 12〜20秒", 12, 20],
];
// 季節の貯金箱は配信中ずっと出ているので、ふだんの豚と並べて「季節でいくら増えたか」を読む
const targets = [
  { key: "豚の貯金箱", q: { preview: "bank", theme: "none", fill: "60" } },
  { key: "貯金箱だけ", q: { preview: "bank", theme: "halloween", fill: "60" } },
  { key: "季節の外", q: { preview: "1", theme: "none", amount: "1500" } },
  ...amounts.map((a) => ({ key: `${a}円`, q: { preview: "1", theme: "halloween", amount: String(a) } })),
];

async function once(browser, t) {
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: DSF, isMobile: true });
  await prism(ctx);
  const body = readFileSync(charFile);
  await ctx.route("**/*", (r) => {
    const u = r.request().url();
    if (u.includes("cloudfront.net")) return r.fulfill({ contentType: "image/png", body, headers: { "access-control-allow-origin": "*" } });
    return u.startsWith(base) || u.startsWith("data:") ? r.continue() : r.abort();
  });
  const p = await ctx.newPage();
  const cdp = await ctx.newCDPSession(p);
  await cdp.send("Performance.enable");
  if (throttle > 1) await cdp.send("Emulation.setCPUThrottlingRate", { rate: throttle });
  const met = async () => Object.fromEntries((await cdp.send("Performance.getMetrics")).metrics.map((m) => [m.name, m.value]));
  await p.goto(`${base}/alertbox/?${new URLSearchParams(t.q)}`, { waitUntil: "domcontentloaded" });
  // アラートの頭（キャラ絵の箱が置かれた瞬間）から数える。貯金箱だけは開いた瞬間から
  if (t.q.preview !== "bank") await p.waitForSelector('[data-char="box"]', { state: "attached", timeout: 30000 });
  const t0 = Date.now();
  const res = {};
  for (const [name, a, z] of WINDOWS) {
    const wait = a * 1000 - (Date.now() - t0);
    if (wait > 0) await p.waitForTimeout(wait);
    const m0 = await met();
    const s0 = Date.now();
    await p.waitForTimeout((z - a) * 1000);
    const m1 = await met();
    const sec = (Date.now() - s0) / 1000;
    res[name] = {
      cpu: ((m1.ProcessTime - m0.ProcessTime) * 1000) / sec,
      main: ((m1.ThreadTime - m0.ThreadTime) * 1000) / sec,
    };
  }
  await ctx.close();
  return res;
}

async function main() {
  console.log(prismNote());
  const browser = await chromium.launch({ executablePath: exe, args: ["--no-sandbox", "--no-proxy-server"] });
  const all = new Map(targets.map((t) => [t.key, []]));
  for (let r = 0; r < rounds; r++) {
    const order = r % 2 === 0 ? targets : [...targets].reverse();
    for (const t of order) {
      all.get(t.key).push(await once(browser, t));
      process.stdout.write(".");
    }
  }
  await browser.close();
  console.log("");
  const med = (xs) => [...xs].sort((x, y) => x - y)[Math.floor(xs.length / 2)];
  for (const [name] of WINDOWS) {
    console.log(`■ ${name}（${W}×${H} 密度${DSF}${throttle > 1 ? ` CPU ${throttle}倍に絞る` : ""}、${rounds}回の中央値。カッコ内は各回）`);
    for (const t of targets) {
      const rs = all.get(t.key).map((x) => x[name]);
      const f = (k, d = 0) => `${med(rs.map((x) => x[k])).toFixed(d)} (${rs.map((x) => x[k].toFixed(d)).join("/")})`;
      console.log(`  ${t.key.padStart(7)}  CPU ${f("cpu")} ms/秒  うちメイン ${f("main")} ms/秒`);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
