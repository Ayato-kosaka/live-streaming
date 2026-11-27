#!/usr/bin/env node
/**
 * 授賞式の面を、docs/spec/monthly-review.md 6章（MR-22〜27）の線で測る。
 *
 *   node tools/monthly_review/check.mjs                                   # public/202611_monthly_review.html
 *   node tools/monthly_review/check.mjs tools/monthly_review/.out/202611_sample.html --shots <dir>
 *   --shots <dir>   面ごとに撮る（1080x1080 と、横 540px に縮めた絵）。代表6面の contact.png と、全面の sheet-N.png も
 *   --no-nav        Enter/Backspace・ctrl・大写しの動き・OBS の枠の確かめを飛ばす
 *
 * 測るのは **1080x1080 で、全面・全ステップ**（`window.__jump(面, ステップ)`。動きを切った窓で出し替える）:
 *   1. 一覧の1行（[data-row]）の高さ 56px 以上・1画面の行 12 まで（MR-24）
 *   2. 「…」やはみ出しで切れている要素 0（scrollWidth - clientWidth > 4）（MR-25）
 *   3. 字 24px 以上。**大写しの札の中は 30px 以上、本文（.b-body）40px 以上、名前（.b-name）48px 以上**（MR-23）
 *   4. 横スクロール 0・枠の外（下は進行のドットの上まで）に出た字 0・紙の札と大写しの札からのはみ出し 0
 *   5. 画面の字に `Claude` 0（書き出した HTML の字からも数える）（MR-9）
 *   6. JS エラー 0
 * そのうえで（動きを切らない窓で）Enter 連打で最後まで → Backspace で先頭まで、
 * ctrl（?role=ctrl）で5タップ＝ちょうど5進む、大写しが真ん中に出て・戻って・次が出る（MR-22・27）、
 * OBS（?role=view）の縦長の枠で正方形が真ん中・外が夜空の地（MR-6）。
 *
 * ブラウザは Playwright の chromium（`playwright install` はしない）。サーバーは python3 -m http.server で
 * 立てて、終わったら落とす。
 */
import { createRequire } from "node:module";
import { spawn, execFileSync } from "node:child_process";
import { dirname, basename, resolve, join } from "node:path";
import { mkdirSync, writeFileSync, existsSync, readFileSync } from "node:fs";
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
const file = resolve(args.find((a, i) => !a.startsWith("--") && !(i > 0 && args[i - 1] === "--shots")) || join(ROOT, "public/202611_monthly_review.html"));
const SHOTS = opt("--shots") ? resolve(opt("--shots")) : null;
const NAV = !args.includes("--no-nav");
if (!existsSync(file)) {
  console.error(`無い: ${file}`);
  process.exit(1);
}

const SIDE = 1080;
const LINE = { rowH: 56, rows: 12, font: 24, bigFont: 30, body: 40, name: 48, side: SIDE, bottom: SIDE - 40 };

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

/** 面1枚・1ステップを測る（ページの中で回る） */
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
    const t = (el.textContent || "").trim().replace(/\s+/g, " ").slice(0, 20);
    return `${el.tagName.toLowerCase()}.${[...el.classList].join(".")} "${t}"`;
  };
  const rows = [...stage.querySelectorAll("[data-row]")].filter(vis);
  const rowH = rows.map((r) => Math.round(r.getBoundingClientRect().height));
  const cut = [];
  const small = [];
  const outside = [];
  const over = [];
  let minFont = Infinity;
  const bigCards = [...stage.querySelectorAll(".big-card:not(.leaving)")].filter(vis);
  let bigMin = null;
  let bodyMin = null;
  let nameMin = null;
  for (const el of stage.querySelectorAll("*")) {
    if (el.closest(".deco") || el.closest("svg") || el.tagName === "IMG") continue;
    if (!vis(el)) continue;
    if (el.scrollWidth - el.clientWidth > 4) cut.push(label(el));
    const own = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
    if (!own) continue;
    const fs = parseFloat(getComputedStyle(el).fontSize);
    const inBig = !!el.closest(".big-card");
    minFont = Math.min(minFont, fs);
    if (fs < LINE.font) small.push(`${label(el)} ${fs}px`);
    if (inBig) {
      bigMin = Math.min(bigMin ?? Infinity, fs);
      if (fs < LINE.bigFont) small.push(`大写し ${label(el)} ${fs}px`);
      const body = el.closest(".b-body");
      const name = el.closest(".b-name");
      if (name) {
        nameMin = Math.min(nameMin ?? Infinity, fs);
        if (fs < LINE.name - 0.5) small.push(`大写しの名前 ${label(el)} ${fs}px`);
      } else if (body) {
        bodyMin = Math.min(bodyMin ?? Infinity, fs);
        if (fs < LINE.body - 0.5) small.push(`大写しの本文 ${label(el)} ${fs}px`);
      }
    }
    const r = el.getBoundingClientRect();
    if (r.left < -1 || r.top < -1 || r.right > LINE.side + 1 || r.bottom > LINE.bottom)
      outside.push(`${label(el)} [${Math.round(r.left)},${Math.round(r.top)},${Math.round(r.right)},${Math.round(r.bottom)}]`);
  }
  for (const p of stage.querySelectorAll(".panel")) if (vis(p) && p.scrollHeight - p.clientHeight > 4) over.push(`${label(p)} 札の中で溢れる`);
  for (const c of bigCards) {
    if (c.scrollHeight - c.clientHeight > 4) over.push(`${label(c)} 大写しの札で溢れる ${c.scrollHeight - c.clientHeight}px`);
    const r = c.getBoundingClientRect();
    if (r.top < -1 || r.left < -1 || r.right > LINE.side + 1 || r.bottom > LINE.bottom) over.push(`${label(c)} 大写しが枠の外 [${Math.round(r.top)},${Math.round(r.bottom)}]`);
  }
  /* 紙の札がリボン（頭）にかぶる・進行のドットまで下りる、も「見切れ」に数える */
  const ribbon = stage.querySelector(".head .ribbon");
  const headBottom = ribbon ? ribbon.getBoundingClientRect().bottom : 0;
  for (const p of stage.querySelectorAll(".panel, .lead, .drum, .kk-wrap, .tp")) {
    if (!vis(p)) continue;
    const r = p.getBoundingClientRect();
    if (r.top < headBottom - 1) over.push(`${label(p)} 頭にかぶる top=${Math.round(r.top)} < ${Math.round(headBottom)}`);
    if (r.bottom > LINE.bottom) over.push(`${label(p)} 下に出る bottom=${Math.round(r.bottom)}`);
  }
  const se = document.scrollingElement;
  const st = window.__state();
  return {
    tag: (stage.querySelector(".tag")?.textContent || stage.querySelector(".title")?.textContent || "").trim(),
    step: st.step,
    spot: bigCards.length > 0,
    rows: rows.length,
    rowMin: rowH.length ? Math.min(...rowH) : null,
    cut,
    small,
    outside,
    over,
    minFont: Number.isFinite(minFont) ? minFont : null,
    bigMin,
    bodyMin,
    nameMin,
    claude: (stage.innerText.match(/claude/gi) || []).length,
    hscroll: se.scrollWidth > window.innerWidth || document.body.scrollWidth > window.innerWidth,
  };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function jumpTo(page, i, t, wait) {
  await page.evaluate(
    ([i, t]) => {
      document.getElementById("confetti-layer").innerHTML = "";
      window.__jump(i, t);
    },
    [i, t]
  );
  await page.waitForFunction(([i, t]) => window.__state().scene === i && window.__state().step === t, [i, t]);
  await sleep(wait);
}

const port = await freePort();
const server = spawn("python3", ["-m", "http.server", String(port), "--bind", "127.0.0.1", "--directory", dirname(file)], { stdio: "ignore" });
let browser;
let failed = false;
try {
  await waitPort(port);
  const url = `http://127.0.0.1:${port}/${encodeURIComponent(basename(file))}`;
  browser = await chromium.launch();
  /* 測る窓は動きを切る（出し替えるだけ）。動きは下の「大写しの動き」で別に確かめる */
  const ctx = await browser.newContext({ viewport: { width: SIDE, height: SIDE }, reducedMotion: "reduce" });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  await page.goto(url, { waitUntil: "load" });
  await page.evaluate(() => document.fonts.ready);
  const n = await page.evaluate(() => window.__sceneCount);
  const totals = await page.evaluate(() => window.__totals);
  const keys = await page.evaluate(() => window.__cornerKeys);
  const spotInfo = await page.evaluate(() => window.__spotInfo);
  if (SHOTS) mkdirSync(SHOTS, { recursive: true });

  /* ---- 全面・全ステップ ---- */
  const res = [];
  const shots = [];
  for (let i = 0; i < n; i++) {
    for (let t = 0; t <= totals[i]; t++) {
      await jumpTo(page, i, t, 90);
      const m = await page.evaluate(measure, LINE);
      m.i = i;
      m.key = keys[i];
      res.push(m);
    }
    if (SHOTS) {
      /* 面ごとに撮るのは、全部が出た最後のステップと、大写しの1件目（2段なら2段目） */
      const want = [totals[i]];
      const sp = spotInfo[i];
      if (sp) {
        let last = sp.steps.findIndex((x) => x && x.j === 0);
        while (last >= 0 && sp.steps[last + 1] && sp.steps[last + 1].j === 0) last++;
        if (last >= 0) want.unshift(last);
      }
      for (const t of want) {
        await jumpTo(page, i, t, 120);
        const name = `s${String(i).padStart(2, "0")}_${t}`;
        await page.screenshot({ path: join(SHOTS, `${name}.png`) });
        shots.push({ i, t, key: keys[i], name });
      }
    }
  }

  /* ---- 表（面ごとに1行。NG のステップは2つまで中身を出す） ---- */
  const bad = (m) =>
    (m.rowMin != null && m.rowMin < LINE.rowH) || m.rows > LINE.rows || m.cut.length || m.small.length || m.outside.length || m.over.length || m.hscroll || m.claude;
  console.log(`面 ${n}・ステップ ${res.length}  （${file.replace(ROOT + "/", "")}・${SIDE}x${SIDE}）`);
  for (let i = 0; i < n; i++) {
    const ms = res.filter((m) => m.i === i);
    const ng = ms.filter(bad);
    const big = ms.filter((m) => m.spot);
    const rowMins = ms.map((m) => m.rowMin).filter((v) => v != null);
    const mn = (k) => {
      const v = ms.map((m) => m[k]).filter((x) => x != null);
      return v.length ? Math.min(...v) : null;
    };
    console.log(
      `${ng.length ? "NG" : "ok"} #${String(i).padStart(2, "0")} ${ms[0].key.padEnd(6)} ${ms[0].tag.slice(0, 18).padEnd(18, "　")} 段${ms.length}` +
        `${rowMins.length ? ` 行${Math.max(...ms.map((m) => m.rows))}・高さ${Math.min(...rowMins)}` : ""} 字${mn("minFont")}` +
        `${big.length ? ` 大写し${big.length}段（本文${mn("bodyMin") ?? "-"}・名前${mn("nameMin") ?? "-"}・最小${mn("bigMin")}）` : ""}`
    );
    for (const m of ng.slice(0, 2)) for (const x of [...m.cut, ...m.small, ...m.outside, ...m.over].slice(0, 3)) console.log(`     段${m.step}: ${x}`);
  }
  const all = (k) => res.map((m) => m[k]).filter((v) => v != null);
  const html = readFileSync(file, "utf8").replace(/data:[a-z/+.-]+;base64,[A-Za-z0-9+/=]+/g, "");
  const sum = {
    scenes: n,
    steps: res.length,
    ng: res.filter(bad).length,
    rowMin: all("rowMin").length ? Math.min(...all("rowMin")) : null,
    rowsMax: Math.max(...res.map((m) => m.rows)),
    cut: res.reduce((a, m) => a + m.cut.length, 0),
    fontMin: Math.min(...all("minFont")),
    spotSteps: res.filter((m) => m.spot).length,
    bigBodyMin: all("bodyMin").length ? Math.min(...all("bodyMin")) : null,
    bigNameMin: all("nameMin").length ? Math.min(...all("nameMin")) : null,
    outside: res.reduce((a, m) => a + m.outside.length, 0),
    over: res.reduce((a, m) => a + m.over.length, 0),
    hscroll: res.filter((m) => m.hscroll).length,
    claude: res.reduce((a, m) => a + m.claude, 0) + (html.match(/claude/gi) || []).length,
    jsErrors: errors.length,
  };
  if (sum.ng || sum.claude) failed = true;

  if (NAV) {
    const nctx = await browser.newContext({ viewport: { width: SIDE, height: SIDE } });
    const np = await nctx.newPage();
    np.on("pageerror", (e) => errors.push(String(e)));
    np.on("console", (m) => m.type() === "error" && errors.push(m.text()));
    const st = async () => np.evaluate(() => `${window.__state().scene}:${window.__state().step}`);

    /* ---- 大写しの動き: 1押しで真ん中に出る → 次の1押しで元の位置へ戻り、次の1件が出る（MR-22） ---- */
    const si = spotInfo.findIndex((s) => s && s.count >= 3 && s.steps.filter((x) => x).every((x) => x.phase === 0));
    if (si >= 0) {
      await np.goto(url, { waitUntil: "load" });
      await np.evaluate(() => document.fonts.ready);
      await np.evaluate((i) => window.__jump(i, 0), si);
      await sleep(700);
      for (let k = 0; k < spotInfo[si].from; k++) await np.keyboard.press("Enter");
      await sleep(80);
      const moving = await np.evaluate(() => {
        const c = document.querySelector(".spot-layer .big-card");
        return c ? c.getAnimations().length : -1;
      });
      await sleep(700);
      const first = await np.evaluate(() => {
        const c = document.querySelector(".spot-layer .big-card");
        if (!c) return null;
        const r = c.getBoundingClientRect();
        return {
          j: c.dataset.j,
          cx: Math.round(r.left + r.width / 2),
          dim: document.querySelector(".spot-layer").classList.contains("on"),
          lifted: !!document.querySelector('.spot-item[data-spot="0"].lifted'),
        };
      });
      await np.keyboard.press("Enter");
      await sleep(100);
      const mid = await np.evaluate(() => document.querySelectorAll(".spot-layer .big-card").length);
      await sleep(700);
      const second = await np.evaluate(() => ({
        cards: [...document.querySelectorAll(".spot-layer .big-card")].map((c) => c.dataset.j),
        back0: !document.querySelector('.spot-item[data-spot="0"].lifted'),
      }));
      const ok = moving > 0 && first && first.j === "0" && Math.abs(first.cx - SIDE / 2) < 4 && first.dim && first.lifted && mid === 2 && second.cards.join() === "1" && second.back0;
      sum.spot = `#${si} 1件目が動いて真ん中に出る・次の1押しで戻って2件目が出る ${ok ? "ok" : `NG ${JSON.stringify({ moving, first, mid, second })}`}`;
      if (!ok) failed = true;
    }

    /* ---- Enter 連打で最後まで → Backspace で先頭まで（MR-27） ---- */
    const expect = [];
    for (let s = 0; s < n; s++) for (let t = 0; t <= totals[s]; t++) expect.push(`${s}:${t}`);
    await np.goto(url, { waitUntil: "load" });
    let fwd = 0;
    for (let k = 1; k < expect.length; k++) {
      await np.keyboard.press("Enter");
      if ((await st()) === expect[k]) fwd++;
    }
    await np.keyboard.press("Enter"); // 最後でもう1回押しても動かない
    const endOk = (await st()) === expect[expect.length - 1];
    let bwd = 0;
    for (let k = expect.length - 2; k >= 0; k--) {
      await np.keyboard.press("Backspace");
      if ((await st()) === expect[k]) bwd++;
    }
    sum.nav = `Enter ${fwd}/${expect.length - 1}・最後で止まる ${endOk ? "ok" : "NG"}・Backspace ${bwd}/${expect.length - 1}`;
    if (fwd !== expect.length - 1 || bwd !== expect.length - 1 || !endOk) failed = true;
    await sleep(800);
    const leftover = await np.evaluate(() => document.querySelectorAll(".spot-layer .big-card").length);
    if (leftover) {
      sum.nav += `・先頭に大写しが残る ${leftover}`;
      failed = true;
    }
    await nctx.close();

    /* ---- ctrl: 5タップ＝ちょうど5進む（グローバルの pointerdown を登録していないこと） ---- */
    const mctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    const cp = await mctx.newPage();
    // 本番の進行（Firestore）を読みに行かない。読むと、途中で届いた本番の位置に飛んで数が合わない
    await cp.route(/gstatic\.com/, (r) => r.abort());
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

    /* ---- OBS（?role=view）の縦長の枠: 正方形が真ん中、外は夜空の地（透明にしない）（MR-6） ---- */
    const vctx = await browser.newContext({ viewport: { width: SIDE, height: 1920 } });
    const vp = await vctx.newPage();
    await vp.route(/gstatic\.com/, (r) => r.abort()); // 同期の SDK は取りに行かない（つながらないときはローカルのまま）
    await vp.goto(url + "?role=view", { waitUntil: "load" });
    await vp.waitForTimeout(300);
    const v = await vp.evaluate(() => {
      const r = document.getElementById("world").getBoundingClientRect();
      const bg = getComputedStyle(document.body);
      return { top: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height), img: bg.backgroundImage !== "none", color: bg.backgroundColor };
    });
    const vOk = v.w === SIDE && v.h === SIDE && v.top === (1920 - SIDE) / 2 && v.img && v.color !== "rgba(0, 0, 0, 0)";
    sum.view = `1080x1920 の枠で 正方形 ${v.w}x${v.h}・上から ${v.top}px・外の地 ${v.img ? "夜空" : "なし"} ${vOk ? "ok" : "NG"}`;
    if (!vOk) failed = true;
    await vctx.close();
  }
  sum.jsErrors = errors.length;
  if (errors.length) {
    console.log("JS エラー:\n  " + errors.slice(0, 5).join("\n  "));
    failed = true;
  }

  /* ---- 540px に縮めた絵（縦長の配信に載ったときの大きさ）と、代表6面の contact.png・全面の sheet ---- */
  if (SHOTS) {
    const lastStep = (s) => s.t === totals[s.i];
    const firstOf = (k, pred) => shots.find((s) => s.key === k && (!pred || pred(s)));
    const fusenGP = shots.filter((s) => s.key === "fusen" && !spotInfo[s.i] && lastStep(s)).pop();
    const tips1 = shots.filter((s) => s.key === "tips" && lastStep(s)).pop();
    const pick = [
      ["オープニング", firstOf("open")],
      ["6分割の大写し", firstOf("recap", (s) => spotInfo[s.i] && !lastStep(s))],
      ["クイズ1問", firstOf("quiz")],
      ["付箋大賞", fusenGP || firstOf("fusen", (s) => !lastStep(s))],
      ["投げ銭1位", tips1],
      ["エンディング", firstOf("end")],
    ].filter(([, s]) => s);
    const py = `
import sys, glob, os, json
from PIL import Image, ImageDraw, ImageFont
d = sys.argv[1]
pick = json.loads(sys.argv[2])
allshots = json.loads(sys.argv[3])
for f in sorted(glob.glob(os.path.join(d, 's[0-9][0-9]_*.png'))):
    if f.endswith('_540.png'):
        continue
    Image.open(f).convert('RGB').resize((540, 540), Image.LANCZOS).save(f.replace('.png', '_540.png'))
font = None
for f in ['/usr/share/fonts/opentype/ipafont-gothic/ipag.ttf', '/usr/share/fonts/truetype/fonts-japanese-gothic.ttf', '/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc']:
    if os.path.exists(f):
        font = ImageFont.truetype(f, 22)
        break
def sheet(items, out, cols):
    T, pad, cap = 540, 16, 34
    rows = (len(items) + cols - 1) // cols
    im = Image.new('RGB', (cols * T + (cols + 1) * pad, rows * (T + cap) + (rows + 1) * pad), (34, 30, 52))
    dr = ImageDraw.Draw(im)
    for k, (title, name) in enumerate(items):
        x = pad + (k % cols) * (T + pad)
        y = pad + (k // cols) * (T + cap + pad)
        dr.text((x + 4, y + 6), title, fill=(255, 244, 220), font=font)
        im.paste(Image.open(os.path.join(d, name + '_540.png')), (x, y + cap))
    im.save(out)
sheet(pick, os.path.join(d, 'contact.png'), 3)
for n in range(0, len(allshots), 12):
    sheet(allshots[n:n + 12], os.path.join(d, 'sheet-%d.png' % (n // 12 + 1)), 4)
`;
    execFileSync("python3", [
      "-c",
      py,
      SHOTS,
      JSON.stringify(pick.map(([nm, s]) => [`#${s.i} ${nm}（段${s.t}）`, s.name])),
      JSON.stringify(shots.map((s) => [`#${s.i} ${s.key} 段${s.t}`, s.name])),
    ]);
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
