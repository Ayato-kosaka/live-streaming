/**
 * 投げ銭アラートの1件を、**本番と同じ道**（`?k=` ＋ 名簿・額・どねるの WebSocket を偽物で返す）で流して、
 * 描画の CPU・メインスレッド・**GPU の手**（合成とラスタ）の ms/秒と、1秒あたりのコマ数を測る。
 * 版（旗の違い）を**交互に**回す（AB / BA）。部品を1つずつ外して効き目を割るときは `--tcss` で CSS を足す。
 *
 *   cd tools/sprites
 *   node alert-gpu.mjs --base http://127.0.0.1:4391 --chars /path/to/chars \
 *        --variants now:,lux:fx=lux --amount 1500 --rounds 3 --out /tmp/gpu.jsonl
 *   node alert-gpu.mjs ... --variants now:,lux:fx=lux,lux-noback:fx=lux \
 *        --tcss '{"lux-noback":"[data-show=\"layer\"]:nth-child(2) *{visibility:hidden!important}"}'
 *
 * - `--variants 名前:クエリ,…` … 版の名前と、URL に足すクエリ（`fx=lux` など）。空なら旗なし（いまの段）
 * - 窓は投げ銭から 0〜8 秒（登場）と 12〜20 秒（滞在）。`--windows 0-8,12-20` で変えられる
 * - 条件は PRISM（箱 436×776・`visualViewport.scale` 0.5・密度 3）。`prism.mjs` を通す
 * - GPU の数は CDP の `SystemInfo.getProcessInfo` で取った GPU プロセスの CPU 秒（描画プロセスの
 *   `ProcessTime` には入らない）。**この箱の合成はソフトウェア（SwiftShader）なので、数は比べ合いとして読む**
 * - 部品を外すのは `visibility:hidden`。`display:none` は使わない（振付けが位置を測る所が 0 を読んで、
 *   動きそのものが変わる。`.claude/skills/alert-season/SKILL.md`「重さの決まり」）
 *
 * 出力: 1回ごとの行（`--out` に JSON Lines）と、最後に版ごとの中央値の表。合否は出さない
 * （この箱の数は比べ合いでしか読めないので、決めるのは人。読み方は SKILL.md の「重さの決まり」）。
 */
import { readFileSync, appendFileSync, writeFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
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

const base = arg("base", "http://127.0.0.1:4391").replace(/\/$/, "");
const variants = arg("variants", "now:,lux:fx=lux")
  .split(",")
  .filter(Boolean)
  .map((s) => {
    const i = s.indexOf(":");
    return { key: i < 0 ? s : s.slice(0, i), query: i < 0 ? "" : s.slice(i + 1) };
  });
const amount = Number(arg("amount", "1500"));
const theme = arg("theme", "halloween");
const rounds = Math.max(1, Number(arg("rounds", "3")));
const DSF = Number(arg("dsf", "3"));
const [W, H] = arg("size", "436x776").split("x").map(Number);
const sendAt = Number(arg("send-at", "8"));
const out = arg("out", "");
const charDir = resolve(arg("chars", ""));
const wins = arg("windows", "0-8,12-20").split(",").map((w) => w.split("-").map(Number));
const msg = arg("msg", "あやとさんこんばんは！いつも楽しい配信ありがとうございます");
/** 版ごとに足す CSS（部品を1つずつ外して効き目を測る）。{"版の名前":"…"} */
const tcss = JSON.parse(arg("tcss", "{}"));
const exe = chromePath() ?? (existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : null);
if (!exe) die("ブラウザが見つからない（chrome.mjs）");
if (!existsSync(join(charDir, "panda.png"))) die(`キャラ絵が無い: ${charDir}/panda.png（--chars）`);

const panda = readFileSync(join(charDir, "panda.png"));
const ICON = "https://firebasestorage.googleapis.com/v0/b/fake/o/panda.png?alt=media";
const K = "0123456789abcdef0123456789abcdef";
const WSS = "wss://fake-doneru.invalid/ws";
const roster = {
  characters: [{ id: "c1", emoji: "", channelName: "ぱんだ", aliases: [], plain: { full: ICON, sizes: {}, w: 1255, h: 1255 }, scene: null, videoUrl: null }],
};

let bcdp = null;
/** GPU の手（合成・ラスタ）が使った CPU 秒。描画プロセスの ProcessTime には入らない */
async function gpuTime() {
  try {
    const { processInfo } = await bcdp.send("SystemInfo.getProcessInfo");
    return processInfo.filter((x) => x.type === "GPU").reduce((a, x) => a + x.cpuTime, 0);
  } catch {
    return NaN;
  }
}

async function once(browser, v) {
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: DSF, isMobile: true, hasTouch: true });
  await prism(ctx);
  const img = (body) => ({ status: 200, contentType: "image/png", body, headers: { "access-control-allow-origin": "*", "cache-control": "max-age=3600" } });
  await ctx.route("**/*", (r) => {
    const u = r.request().url();
    if (u.includes("/island-api/")) {
      if (u.endsWith("/wss")) return r.fulfill({ json: { wss: WSS } });
      if (u.endsWith("/characters")) return r.fulfill({ json: roster });
      if (u.endsWith("/fund")) return r.fulfill({ json: { currentAmount: 30000, targetAmount: 50000, label: "なに食べよの広告費" } });
      if (u.endsWith("/replay")) return r.fulfill({ json: { seq: 0 } });
      return r.fulfill({ status: 404, body: "" });
    }
    if (u.startsWith(ICON) || u.includes("cloudfront.net")) return r.fulfill(img(panda));
    if (u.startsWith(base) || u.startsWith("data:") || u.startsWith("blob:")) return r.continue();
    return r.abort();
  });
  const holder = { ws: null };
  const p = await ctx.newPage();
  const errors = [];
  p.on("pageerror", (e) => errors.push(String(e).slice(0, 160)));
  await p.routeWebSocket(WSS, (ws) => {
    holder.ws = ws;
    ws.onMessage(() => {});
  });
  await p.addInitScript((css) => {
    if (css)
      document.addEventListener("DOMContentLoaded", () => {
        const st = document.createElement("style");
        st.textContent = css;
        document.head.appendChild(st);
      });
    // fps と、コマの間が 34ms を超えた数。どの版にも同じだけ乗る
    const pf = (window.__pf = { n: 0, l34: 0, max: 0, last: 0 });
    window.__pfReset = () => Object.assign(pf, { n: 0, l34: 0, max: 0, last: 0 });
    const tick = (ts) => {
      if (pf.last) {
        const d = ts - pf.last;
        if (d > 34) pf.l34++;
        if (d > pf.max) pf.max = d;
      }
      pf.last = ts;
      pf.n++;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, tcss[v.key] ?? "");
  const cdp = await ctx.newCDPSession(p);
  await cdp.send("Performance.enable");
  const met = async () => Object.fromEntries((await cdp.send("Performance.getMetrics")).metrics.map((m) => [m.name, m.value]));

  const q = new URLSearchParams(`k=${K}&source=doneru&theme=${theme}${v.query ? `&${v.query}` : ""}`);
  await p.goto(`${base}/alertbox/?${q}`, { waitUntil: "load" });
  const tLoad = Date.now();
  const res = { variant: v.key, query: v.query, amount, windows: {} };
  const wsWait = tLoad + sendAt * 1000 - Date.now();
  if (wsWait > 0) await p.waitForTimeout(wsWait);
  if (!holder.ws) throw new Error(`${v.key}: WebSocket に繋がっていない`);
  holder.ws.send(JSON.stringify({ id: `gpu-${Date.now()}`, type: "donation", amount, assetID: null, message: msg, messageType: 1, nickname: "ぱんだ", test: true }));
  const tSend = Date.now();
  for (const [a, z] of wins) {
    const wait = tSend + a * 1000 - Date.now();
    if (wait > 0) await p.waitForTimeout(wait);
    await p.evaluate(() => window.__pfReset());
    const m0 = await met();
    const g0 = await gpuTime();
    const s0 = Date.now();
    await p.waitForTimeout((z - a) * 1000);
    const m1 = await met();
    const g1 = await gpuTime();
    const pf = await p.evaluate(() => ({ ...window.__pf }));
    const sec = (Date.now() - s0) / 1000;
    const d = (k) => ((m1[k] - m0[k]) * 1000) / sec;
    res.windows[`${a}-${z}`] = { cpu: d("ProcessTime"), main: d("ThreadTime"), gpu: ((g1 - g0) * 1000) / sec, fps: pf.n / sec, l34: pf.l34, max: pf.max, nodes: m1.Nodes };
  }
  // 演出が本当に出ていたか（出ていない版を測って「軽い」と読まない）
  res.check = await p.evaluate(() => ({
    plate: !!document.querySelector('[data-plate="box"]'),
    layers: document.querySelectorAll('[data-show="layer"]').length,
    lux: [...document.querySelectorAll("img")].filter((i) => i.src.includes("/lux/")).length,
  }));
  res.errors = errors;
  await ctx.close();
  return res;
}

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : NaN;
};

async function main() {
  console.log(prismNote());
  console.log(`箱 ${W}x${H}・密度 ${DSF}・${amount}円・テーマ ${theme}・各 ${rounds} 回（版を交互に）`);
  if (out && !existsSync(out)) writeFileSync(out, "");
  const browser = await chromium.launch({ executablePath: exe, args: ["--no-sandbox", "--no-proxy-server"] });
  bcdp = await browser.newBrowserCDPSession();
  const all = [];
  for (let r = 0; r < rounds; r++) {
    const order = r % 2 === 0 ? variants : [...variants].reverse();
    for (const v of order) {
      const res = await once(browser, v);
      res.round = r;
      res.load = Number(readFileSync("/proc/loadavg", "utf8").split(" ")[0]);
      all.push(res);
      if (out) appendFileSync(out, JSON.stringify(res) + "\n");
      const w = Object.entries(res.windows)
        .map(([k, x]) => `${k}: cpu ${x.cpu.toFixed(0)} main ${x.main.toFixed(0)} gpu ${x.gpu.toFixed(0)} fps ${x.fps.toFixed(1)} 34ms超 ${x.l34}`)
        .join(" | ");
      console.log(`r${r} ${v.key.padEnd(12)} ${w} ${JSON.stringify(res.check)} load ${res.load}${res.errors.length ? ` 例外 ${res.errors.length}` : ""}`);
    }
  }
  await browser.close();
  console.log("\n| 版 | 窓（秒） | CPU ms/秒 | メイン ms/秒 | GPU ms/秒 | コマ/秒 | 34ms超 | 回数 |");
  console.log("| --- | --- | --- | --- | --- | --- | --- | --- |");
  for (const v of variants) {
    const rs = all.filter((x) => x.variant === v.key);
    for (const [a, z] of wins) {
      const k = `${a}-${z}`;
      const m = (f) => median(rs.map((x) => x.windows[k][f]));
      console.log(`| ${v.key} | ${k} | ${m("cpu").toFixed(0)} | ${m("main").toFixed(0)} | ${m("gpu").toFixed(0)} | ${m("fps").toFixed(1)} | ${m("l34").toFixed(0)} | ${rs.length} |`);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
