#!/usr/bin/env node
/**
 * 授賞式の面を、#308 の線で測る（docs/island-misses.md #308・.claude/skills/monthly-review/SKILL.md §8-0）。
 *
 *   node tools/monthly_review/check.mjs                                   # public/202611_monthly_review.html
 *   node tools/monthly_review/check.mjs tools/monthly_review/.out/202611_sample.html --shots <dir>
 *   --shots <dir>   全面を撮る（1920x1080 と、横 900px に縮めた絵）。代表5面の contact sheet も
 *   --no-nav        Enter/Backspace と ctrl の確かめを飛ばす
 *
 * 測るのは、全面を**最後のステップまで出した状態**（`window.__jump(面, 99)`）:
 *   1. 一覧の1行（[data-row]）の高さ 46px 以上
 *   2. 1画面の行 16 まで
 *   3. 「…」やはみ出しで切れている要素 0（scrollWidth - clientWidth > 4）
 *   4. 本文の字 22px 以上
 *   5. 横スクロール 0・枠の外（下は進行のドットの上まで）に出た字 0・紙の札からのはみ出し 0
 *   6. JS エラー 0
 * そのうえで Enter 連打で最後まで → Backspace で先頭まで、ctrl（?role=ctrl）で5タップ＝ちょうど5進む。
 *
 * ブラウザは Playwright の chromium（`playwright install` はしない）。サーバーは python3 -m http.server で
 * 立てて、終わったら落とす。
 */
import { createRequire } from "node:module";
import { spawn, execFileSync } from "node:child_process";
import { dirname, basename, resolve, join } from "node:path";
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import net from "node:net";

// `require('playwright')`（この箱では NODE_PATH の先にある。ESM の import は NODE_PATH を見ない）
const { chromium } = createRequire(import.meta.url)("playwright");
const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "../..");
const args = process.argv.slice(2);
const opt = (n) => {
  const i = args.indexOf(n);
  return i >= 0 ? args[i + 1] : null;
};
const file = resolve(args.find((a, i) => !a.startsWith("--") && !(i > 0 && args[i - 1].startsWith("--shots"))) || join(ROOT, "public/202611_monthly_review.html"));
const SHOTS = opt("--shots") ? resolve(opt("--shots")) : null;
const NAV = !args.includes("--no-nav");
if (!existsSync(file)) {
  console.error(`無い: ${file}`);
  process.exit(1);
}

const LINE = { rowH: 46, rows: 16, font: 22, bottom: 1080 - 48 };

function freePort() {
  return new Promise((ok) => {
    const s = net.createServer();
    s.listen(0, "127.0.0.1", () => {
      const p = s.address().port;
      s.close(() => ok(p));
    });
  });
}
async function waitPort(port) {
  for (let i = 0; i < 50; i++) {
    const up = await new Promise((ok) => {
      const c = net.connect(port, "127.0.0.1", () => {
        c.end();
        ok(true);
      });
      c.on("error", () => ok(false));
    });
    if (up) return;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error("サーバーが起きない");
}

/** 面1枚を測る（ページの中で回る） */
function measure(LINE) {
  const stage = document.getElementById("stage");
  const vis = (el) => {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return false;
    for (let n = el; n && n !== document.body; n = n.parentElement) {
      const cs = getComputedStyle(n);
      if (cs.display === "none" || cs.visibility === "hidden" || parseFloat(cs.opacity) === 0) return false;
    }
    return true;
  };
  const label = (el) => {
    const t = (el.textContent || "").trim().replace(/\s+/g, " ").slice(0, 24);
    return `${el.tagName.toLowerCase()}.${[...el.classList].join(".")} "${t}"`;
  };
  const rows = [...stage.querySelectorAll("[data-row]")].filter(vis);
  const rowH = rows.map((r) => Math.round(r.getBoundingClientRect().height));
  const cut = [];
  const small = [];
  const outside = [];
  let minFont = Infinity;
  for (const el of stage.querySelectorAll("*")) {
    if (el.closest(".deco") || el.closest("svg") || el.tagName === "IMG") continue;
    if (!vis(el)) continue;
    if (el.scrollWidth - el.clientWidth > 4) cut.push(label(el));
    const own = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
    if (!own) continue;
    const fs = parseFloat(getComputedStyle(el).fontSize);
    minFont = Math.min(minFont, fs);
    if (fs < LINE.font) small.push(`${label(el)} ${fs}px`);
    const r = el.getBoundingClientRect();
    if (r.left < -1 || r.top < -1 || r.right > 1921 || r.bottom > LINE.bottom) outside.push(`${label(el)} [${Math.round(r.left)},${Math.round(r.top)},${Math.round(r.right)},${Math.round(r.bottom)}]`);
  }
  const over = [...stage.querySelectorAll(".panel")].filter((p) => p.scrollHeight - p.clientHeight > 4).map(label);
  /* 紙の札がリボン（頭）にかぶる・進行のドットまで下りる、も「見切れ」に数える。
     札は .body の中で真ん中に寄せているので、背が高すぎると上下に同じだけはみ出す */
  const ribbon = stage.querySelector(".head .ribbon");
  const headBottom = ribbon ? ribbon.getBoundingClientRect().bottom : 0;
  for (const p of stage.querySelectorAll(".panel, .lead, .drum, .kk, .tp")) {
    if (!vis(p) && !p.classList.contains("panel")) continue;
    const r = p.getBoundingClientRect();
    if (r.height === 0) continue;
    if (r.top < headBottom - 1) over.push(`${label(p)} 頭にかぶる top=${Math.round(r.top)} < ${Math.round(headBottom)}`);
    if (r.bottom > LINE.bottom) over.push(`${label(p)} 下に出る bottom=${Math.round(r.bottom)}`);
  }
  const se = document.scrollingElement;
  return {
    tag: (stage.querySelector(".tag")?.textContent || stage.querySelector(".title")?.textContent || "").trim(),
    rows: rows.length,
    rowMin: rowH.length ? Math.min(...rowH) : null,
    cut,
    small,
    outside,
    over,
    minFont: Number.isFinite(minFont) ? minFont : null,
    hscroll: se.scrollWidth > window.innerWidth || document.body.scrollWidth > window.innerWidth,
  };
}

const port = await freePort();
const server = spawn("python3", ["-m", "http.server", String(port), "--bind", "127.0.0.1", "--directory", dirname(file)], { stdio: "ignore" });
let browser;
let failed = false;
try {
  await waitPort(port);
  const url = `http://127.0.0.1:${port}/${encodeURIComponent(basename(file))}`;
  browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  await page.goto(url, { waitUntil: "load" });
  await page.evaluate(() => document.fonts.ready);
  const n = await page.evaluate(() => window.__sceneCount);
  const corners = await page.evaluate(() => window.__cornerOf);
  if (SHOTS) mkdirSync(SHOTS, { recursive: true });

  const res = [];
  for (let i = 0; i < n; i++) {
    await page.evaluate((i) => {
      document.getElementById("confetti-layer").innerHTML = "";
      window.__jump(i, 99);
    }, i);
    await page.waitForTimeout(2100); // 面の入れ替え 0.28s ＋ ステップ 0.45s ＋ 城の灯り 1.6s
    const m = await page.evaluate(measure, LINE);
    m.i = i;
    m.corner = corners[i];
    res.push(m);
    if (SHOTS) {
      // 紙吹雪は本番では5秒で落ちきる。撮る絵は字が読めるかを見るものなので、落としてから撮る
      await page.evaluate(() => (document.getElementById("confetti-layer").innerHTML = ""));
      await page.screenshot({ path: join(SHOTS, `s${String(i).padStart(2, "0")}.png`) });
    }
  }

  /* ---- 表 ---- */
  const bad = (m) => (m.rowMin != null && m.rowMin < LINE.rowH) || m.rows > LINE.rows || m.cut.length || m.small.length || m.outside.length || m.over.length || m.hscroll;
  console.log(`面 ${n}  （${file.replace(ROOT + "/", "")}）`);
  for (const m of res) {
    const flag = bad(m) ? "NG" : "ok";
    console.log(
      `${flag} #${String(m.i).padStart(2, "0")} c${m.corner} ${m.tag.slice(0, 22).padEnd(22, "　")} 行${m.rows}${m.rowMin != null ? ` 高さ${m.rowMin}` : ""} 切れ${m.cut.length} 字${m.minFont} 枠外${m.outside.length} はみ出し${m.over.length}${m.hscroll ? " 横スクロール" : ""}`
    );
    for (const x of [...m.cut, ...m.small, ...m.outside, ...m.over].slice(0, 4)) console.log(`     ${x}`);
  }
  const rowMins = res.map((m) => m.rowMin).filter((v) => v != null);
  const sum = {
    scenes: n,
    rowMin: rowMins.length ? Math.min(...rowMins) : null,
    rowsMax: Math.max(...res.map((m) => m.rows)),
    cut: res.reduce((a, m) => a + m.cut.length, 0),
    fontMin: Math.min(...res.map((m) => m.minFont ?? Infinity)),
    outside: res.reduce((a, m) => a + m.outside.length, 0),
    over: res.reduce((a, m) => a + m.over.length, 0),
    hscroll: res.filter((m) => m.hscroll).length,
    jsErrors: errors.length,
  };
  if (errors.length) console.log("JS エラー:\n  " + errors.slice(0, 5).join("\n  "));
  if (res.some(bad) || errors.length) failed = true;

  /* ---- Enter 連打で最後まで → Backspace で先頭まで ---- */
  if (NAV) {
    const totals = await page.evaluate(() => window.__totals);
    const expect = [];
    for (let s = 0; s < n; s++) for (let t = 0; t <= totals[s]; t++) expect.push(`${s}:${t}`);
    await page.goto(url, { waitUntil: "load" });
    const st = async () => page.evaluate(() => {
      const x = window.__state();
      return `${x.scene}:${x.step}`;
    });
    let fwd = 0;
    for (let k = 1; k < expect.length; k++) {
      await page.keyboard.press("Enter");
      if ((await st()) === expect[k]) fwd++;
    }
    await page.keyboard.press("Enter"); // 最後でもう1回押しても動かない
    const endOk = (await st()) === expect[expect.length - 1];
    let bwd = 0;
    for (let k = expect.length - 2; k >= 0; k--) {
      await page.keyboard.press("Backspace");
      if ((await st()) === expect[k]) bwd++;
    }
    sum.nav = `Enter ${fwd}/${expect.length - 1}・最後で止まる ${endOk ? "ok" : "NG"}・Backspace ${bwd}/${expect.length - 1}`;
    if (fwd !== expect.length - 1 || bwd !== expect.length - 1 || !endOk) failed = true;

    /* ---- ctrl: 5タップ＝ちょうど5進む（グローバルの pointerdown を登録していないこと） ---- */
    const mctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    const cp = await mctx.newPage();
    await cp.goto(url + "?role=ctrl", { waitUntil: "load" });
    await cp.waitForTimeout(500);
    const before = await cp.evaluate(() => window.__state());
    for (let k = 0; k < 5; k++) {
      await cp.locator("#c-next").tap();
      await cp.waitForTimeout(120);
    }
    const after = await cp.evaluate(() => `${window.__state().scene}:${window.__state().step}`);
    const want = expect[expect.indexOf(`${before.scene}:${before.step}`) + 5];
    sum.ctrl = `5タップ → ${after}（期待 ${want}）${after === want ? " ok" : " NG"}`;
    if (after !== want) failed = true;
    await mctx.close();
  }

  /* ---- 900px に縮めた絵と、代表5面の contact sheet ---- */
  if (SHOTS) {
    const first = (c) => corners.indexOf(c);
    const pick = [
      ["オープニング", first(0)],
      ["出席リスト", first(2)],
      ["クイズ1問", first(5)],
      ["投げ銭4位以下", first(11)],
      ["手紙", first(12)],
    ].filter(([, i]) => i >= 0);
    const py = `
import sys, glob, os
from PIL import Image, ImageDraw, ImageFont
d = sys.argv[1]
for f in sorted(glob.glob(os.path.join(d, 's[0-9][0-9].png'))):
    im = Image.open(f).convert('RGB')
    im.resize((900, round(im.height * 900 / im.width)), Image.LANCZOS).save(f.replace('.png', '_900.png'))
pick = [p.split('=', 1) for p in sys.argv[2:]]
tiles = [Image.open(os.path.join(d, 's%02d_900.png' % int(i))) for _, i in pick]
W, H, pad, cap = 900, tiles[0].height, 16, 34
cols = 2
rows = (len(tiles) + cols - 1) // cols
sheet = Image.new('RGB', (cols * W + (cols + 1) * pad, rows * (H + cap) + (rows + 1) * pad), (34, 30, 52))
dr = ImageDraw.Draw(sheet)
font = None
for f in ['/usr/share/fonts/opentype/ipafont-gothic/ipag.ttf', '/usr/share/fonts/truetype/fonts-japanese-gothic.ttf']:
    if os.path.exists(f):
        font = ImageFont.truetype(f, 22)
        break
for k, ((name, i), t) in enumerate(zip(pick, tiles)):
    x = pad + (k % cols) * (W + pad)
    y = pad + (k // cols) * (H + cap + pad)
    dr.text((x + 4, y + 6), '#%s %s' % (i, name), fill=(255, 244, 220), font=font)
    sheet.paste(t, (x, y + cap))
sheet.save(os.path.join(d, 'contact.png'))
`;
    execFileSync("python3", ["-c", py, SHOTS, ...pick.map(([nm, i]) => `${nm}=${i}`)]);
    sum.shots = SHOTS;
  }
  console.log(JSON.stringify(sum));
  const outDir = SHOTS || join(HERE, ".out");
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, "check.json"), JSON.stringify({ sum, res }, null, 1));
} catch (err) {
  console.error(err);
  failed = true;
} finally {
  if (browser) await browser.close();
  server.kill();
}
process.exit(failed ? 1 : 0);
