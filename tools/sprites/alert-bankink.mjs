/**
 * 投げ銭アラートの**貯金箱の字**（いまの額・目標・旅の名前）の濃さを、本物の配信画面の上で、描かれた画素から測る。
 * 計算は `inkjudge.mjs`（`alert-ink.mjs`・`inkpx.mjs` と同じ式）。
 *
 *   cd tools/sprites
 *   node alert-bankink.mjs --base http://127.0.0.1:4591 --bg-dir <スクラッチ>/bg --themes castle --out /tmp/bankink
 *   node alert-bankink.mjs ... --control flat                # 対照: 字の色を縁取りに近い暗い赤にする。いまの額が割れて 1 で終われば正しい
 *
 * ## いまの額と、控えめな字（11月の城の2版目。あやと 2026-11-02「今の金額以外の文字はよく見たら見えるくらいで良い」）
 *
 * 字に `data-ink-role` が付いていれば、役で分けて数える。
 * - `amount`（いまの額）と、役の付いていない字: **4.5 以上で合格**（今までどおり）
 * - `target`（目標）・`label`（旅の名前）: **控えめにする字なので合否にしない。** 大きさと濃さを、いまの額と並べて出す
 *   （「いまの額より明らかに控えめか」を数で見るため）
 *
 * `alert-ink.mjs` はアラート（投げ銭が来たときの名前・額・メッセージ）だけを測る。貯金箱の字は
 * 測っていなかったので、11月の城（字を絵の台に載せた。#1078）から足した。
 *
 * - `?preview=bank&fill=<%>&theme=<id>` を、本物の配信画面4枚（`prism-<名前>.jpg`）を地に敷いて開く
 * - 字（`[data-ink="fill"]`）のある絵と、字の色だけ透明にした絵（縁取りは残る）の2枚を撮って比べる
 * - 溜まり具合は 0・50・100・120%（`--fills`）。溜まり方で字の下の絵（灯り・ピポ）が変わるので
 * - 動きは止めてから撮る（2枚のあいだに動くと差分が嘘になる）
 *
 * 合格: どの字も、字の芯の中央値が 4.5 以上で、**地のいちばん明るいところ（上位 5%）に対しても**
 * 4.5 以上（`docs/island-standards.md`・CLAUDE.md「地のばらつき」）。
 *
 * PRISM の縮み方は既定で入れる（`prism.mjs`）。`--phone-font` でスマホと同じ字体にする（`phonefont.mjs`）。
 *
 * 終了コード: 0 = 全部 4.5 以上 / 1 = 割れた字がある / 2 = 測れなかった（字を拾えない・2枚が違う）
 */
import { mkdirSync, readFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { chromium } from "playwright-core";
import { chromePath } from "./chrome.mjs";
import { prism, prismNote } from "./prism.mjs";
import { phoneFont } from "./phonefont.mjs";
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

const base = arg("base", "http://127.0.0.1:4591").replace(/\/$/, "");
const bgDir = resolve(arg("bg-dir", process.env.ALERT_BG_DIR ?? ""));
const BGS = ["street", "face", "alert-now", "alert-fish"];
for (const b of BGS) if (!existsSync(join(bgDir, `prism-${b}.jpg`))) die(`配信画面が無い: ${join(bgDir, `prism-${b}.jpg`)}`);
const themes = arg("themes", "castle").split(",");
const fills = arg("fills", "0,50,100,120").split(",").map(Number);
const [W, H] = arg("size", "436x776").split("x").map(Number);
const DPR = Number(arg("dpr", "2"));
const out = resolve(arg("out", "/tmp/alert-bankink"));
const phone = process.argv.includes("--phone-font");
/** `--control flat`: 字の色を縁取りに近い暗い赤にして撮る（道具が字の画素を見ているかの対照。全部落ちれば正しい） */
const control = arg("control", "") === "flat";
const LIM = 4.5;
mkdirSync(out, { recursive: true });

const exe = chromePath() ?? (existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : null);
if (!exe) die("ブラウザが見つからない（chrome.mjs）");

async function one(browser, judgePage, shots, { theme, fill, bg }) {
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: DPR });
  try {
    await prism(ctx);
    if (phone) await phoneFont(ctx);
    await ctx.route("**/*", (r) => {
      const u = r.request().url();
      return u.startsWith(base) || u.includes("__phonefont") || u.startsWith("data:") || u.startsWith("blob:") ? r.fallback() : r.abort();
    });
    const data = `data:image/jpeg;base64,${readFileSync(join(bgDir, `prism-${bg}.jpg`)).toString("base64")}`;
    // 配信画面を、面の地として敷く（面は透過）。貯金箱は面の下の真ん中なので、写真の下の真ん中が字の地になる
    await ctx.addInitScript((d) => {
      document.addEventListener("DOMContentLoaded", () => {
        document.documentElement.style.background = `url(${d}) center bottom/cover no-repeat`;
      });
    }, data);
    const p = await ctx.newPage();
    const q = new URLSearchParams({ preview: "bank", fill: String(fill), theme });
    await p.goto(`${base}/alertbox/?${q}`, { waitUntil: "load" });
    await p.waitForSelector('[data-ink="fill"]', { timeout: 20000 });
    // 灯りが上がりきって（0.3 + 1.5 秒）、数え上げが終わるまで
    await p.waitForTimeout(3000);
    await p.evaluate(() => (document.fonts ? document.fonts.ready : null));
    await p.evaluate(() => {
      document.getAnimations().forEach((x) => x.pause());
      window.requestAnimationFrame = () => 0;
    });
    if (control) {
      // 対照: 字の色を、縁取り（濃いこげ茶）に近い暗い赤にする（比は 2 前後）。全部 4.5 を割らないといけない。
      // 縁取りと同じ色にすると、字の画素そのものが拾えずに「測れない」になって対照にならない
      await p.addStyleTag({ content: '[data-ink="fill"]{color:#8A1A1A!important}' });
    }
    await p.waitForTimeout(200);
    const boxes = await p.evaluate(() => {
      const res = [];
      document.querySelectorAll('[data-ink="fill"]').forEach((el, i) => {
        const r = el.getBoundingClientRect();
        if (r.width < 2 || r.height < 2) return;
        el.setAttribute("data-inkmark", String(i));
        res.push({ t: (el.textContent || "").trim().slice(0, 14), c: el.getAttribute("data-ink-role") || "", tag: el.tagName, color: getComputedStyle(el).color, size: getComputedStyle(el).fontSize, x: r.x, y: r.y, w: r.width, h: r.height });
      });
      return res;
    });
    if (!boxes.length) throw new Error("字を1つも拾えなかった");
    const nm = `${theme}-${fill}-${bg}`;
    await p.screenshot({ path: join(out, `${nm}.shot.png`) });
    await p.addStyleTag({ content: "[data-inkmark]{color:transparent!important;-webkit-text-fill-color:transparent!important}" });
    await p.waitForTimeout(120);
    await p.screenshot({ path: join(out, `${nm}.bg.png`) });
    const j = await judgeInk(judgePage, { shotUrl: `${shots.base}/${nm}.shot.png`, bgUrl: `${shots.base}/${nm}.bg.png`, boxes, dpr: DPR, lim: LIM });
    if (j.err) throw new Error(j.err);
    if (j.rows.length !== boxes.length) throw new Error(`拾えなかった字がある ${JSON.stringify(j.dropped)}`);
    return j.rows.map((r) => ({ key: theme, role: r.c || "", fill, bg, t: r.t, size: r.size, mid: r.mid, rhi: Math.min(r.rhi, r.rlo) }));
  } finally {
    await ctx.close();
  }
}

async function main() {
  console.log(prismNote());
  console.log(phone ? "字体: スマホと同じ（--phone-font）" : "字体: この箱のまま（スマホと同じにするなら --phone-font）");
  const browser = await chromium.launch({ executablePath: exe, args: ["--no-sandbox", "--no-proxy-server"] });
  const shots = await serveDirectory(out);
  const judgePage = await (await browser.newContext()).newPage();
  await judgePage.goto(`${shots.base}/`).catch(() => {});
  const queue = [];
  for (const theme of themes) for (const fill of fills) for (const bg of BGS) queue.push({ theme, fill, bg });
  console.log(`${queue.length} 枚（${themes.join("・")} × 溜まり ${fills.join("・")}% × 配信画面 ${BGS.length}）`);
  const rows = [];
  const errs = [];
  const jobs = 3;
  async function worker() {
    while (queue.length) {
      const job = queue.shift();
      try {
        rows.push(...(await one(browser, judgePage, shots, job)));
      } catch (e) {
        errs.push(`${job.theme} ${job.fill}% ${job.bg}: ${String(e).slice(0, 160)}`);
      }
    }
  }
  await Promise.all(Array.from({ length: jobs }, worker));
  shots.close();
  await browser.close();
  /** 合否にするのは、いまの額と役の付いていない字（目標・旅の名前は控えめにする字なので並べて出すだけ） */
  const judged = (r) => r.role === "" || r.role === "amount";
  const fails = rows.filter((r) => judged(r) && (r.mid < LIM || r.rhi < LIM));
  console.log(`\n測れた字 ${rows.length}`);
  // 役ごとに、大きさと濃さを並べる（いまの額だけが目立っているか）
  const roles = [...new Set(rows.map((r) => r.role).filter(Boolean))];
  if (roles.length) {
    const NAME = { amount: "いまの額", target: "目標", label: "旅の名前" };
    const med = (xs) => {
      const s = [...xs].sort((a, b) => a - b);
      return s.length ? s[Math.floor(s.length / 2)] : NaN;
    };
    console.log("役ごと（大きさは CSS px、濃さは字の芯と地の比。中央値の 中央値 / いちばん低い / いちばん高い）:");
    const amt = rows.filter((r) => r.role === "amount");
    const amtSize = med(amt.map((r) => parseFloat(r.size)));
    const amtInk = med(amt.map((r) => r.mid));
    for (const role of roles) {
      const rs = rows.filter((r) => r.role === role);
      const size = med(rs.map((r) => parseFloat(r.size)));
      const ink = med(rs.map((r) => r.mid));
      const rel = role === "amount" ? "" : `  ← いまの額に対して 大きさ ${(size / amtSize).toFixed(2)} 倍・濃さ ${(ink / amtInk).toFixed(2)} 倍`;
      console.log(
        `  ${(NAME[role] ?? role).padEnd(5)} ${rs.length} 枚: 大きさ ${size.toFixed(1)}px / 濃さ ${ink.toFixed(2)}・${Math.min(...rs.map((r) => r.mid)).toFixed(2)}・${Math.max(...rs.map((r) => r.mid)).toFixed(2)}` +
          `${judged(rs[0]) ? "（4.5 以上で合格）" : "（控えめにする字。合否にしない）"}${rel}`
      );
    }
  }
  const keys = [...new Set(rows.map((r) => r.key))];
  for (const k of keys) {
    for (const t of [...new Set(rows.filter((r) => r.key === k).map((r) => r.t.replace(/[\d,]+/g, "#")))]) {
      const rs = rows.filter((r) => r.key === k && r.t.replace(/[\d,]+/g, "#") === t);
      const mid = Math.min(...rs.map((r) => r.mid));
      const rhi = Math.min(...rs.map((r) => r.rhi));
      console.log(`  ${k} 「${t}」（${rs[0].size}）: ${rs.length} 枚 / 中央値のいちばん低い ${mid.toFixed(2)} / 地の明るい・暗いところに対していちばん低い ${rhi.toFixed(2)}`);
    }
  }
  if (fails.length) {
    console.log(`4.5 割れ ${fails.length}:`);
    for (const f of fails.slice(0, 30)) console.log(`  ${f.key} ${f.fill}% ${f.bg} 「${f.t}」 中央値 ${f.mid.toFixed(2)} 地 ${f.rhi.toFixed(2)}`);
  }
  if (errs.length) {
    console.log(`測れなかった ${errs.length}:`);
    for (const e of errs.slice(0, 10)) console.log("  " + e);
  }
  process.exit(errs.length || !rows.length ? 2 : fails.length ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
