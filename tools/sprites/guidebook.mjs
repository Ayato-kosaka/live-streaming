/**
 * **ガイドブック型の街の面（`components/guidebook/`）を、書き出したもので確かめる。**（#1228）
 *
 *   tools/build.sh 3130
 *   python3 -m http.server 4130 --directory site/.next-3130 &
 *   DIST=site/.next-3130 SPORT=4130 node tools/sprites/guidebook.mjs                 # ソフィア
 *   DIST=… SPORT=… PAGE=/travel/north-macedonia/skopje node tools/sprites/guidebook.mjs
 *   …  BASE_PORT=4131 BASE_PAGE=/bulgaria node tools/sprites/guidebook.mjs       # 字の量を前の面と比べる
 *
 * 終了コード 0＝通った / 1＝見つかった / 2＝数えるものが無い（面が開けない・窓が1つも無い）。
 *
 * ## 見るもの
 *
 * | | |
 * | --- | --- |
 * | 節の並び | #1228 の表の順（表紙 → 目次 → どんな街 → やりたいこと → 見たい → 食べたい → 買いたい → 基本情報 → この街の動画） |
 * | 横あふれ | 390 と 1440 で 0。**窓を開いた状態でも** |
 * | 窓の中身が HTML に在る | 書き出した HTML（JS を動かす前）に、窓の数だけ `<dialog>` があり、題の字が入っている |
 * | ハッシュで直に開く | `#do-<id>` で着くと、その窓が開いていて、フォーカスが窓の中 |
 * | Esc・閉じる・背景・戻る | どれでも閉じて、URL からハッシュが消える |
 * | 元の位置に戻る | 札から開いて閉じると、開く前の高さ（±4px）と、押した札にフォーカス |
 * | 窓から窓へ | 窓の中の札で別の窓に入れ替わり、戻る1回で面に戻る |
 * | 字の量 | 最初に開いた状態（窓と畳みは閉じたまま）で `main` に見えている字の数。前の面と比べる |
 *
 * 撮った絵は `OUT`（既定 `/tmp/guidebook-shots`）に節ごとに置く（390px・dpr 2）。
 *
 * ## 借りた写真は、本物を返す
 *
 * この箱のブラウザからは `upload.wikimedia.org` に届かない（`CLAUDE.md`）。撮った絵が空の枠だらけだと、
 * 見ても何も分からない。**curl では届く**ので、1枚ずつ落として置き場（`WM_CACHE`）に溜め、同じ道で返す。
 * 落とせなかった絵の数は終わりに出す。
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { chromium } from "playwright-core";

const SPORT = process.env.SPORT || "4130";
const PAGE = process.env.PAGE || "/travel/bulgaria/sofia";
const OUT = process.env.OUT || "/tmp/guidebook-shots";
const WM = process.env.WM_CACHE || "/tmp/guidebook-wm";
const EXE = process.env.CHROME || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const ORDER = ["cover", "toc", "about", "todo", "see", "eat", "buy", "basics", "videos"];
const url = (port, path, hash = "") => `http://127.0.0.1:${port}${path}.html${hash}`;

mkdirSync(OUT, { recursive: true });
mkdirSync(WM, { recursive: true });

const bad = [];
const notes = [];
const fail = (what) => bad.push(what);
let wmHit = 0;
let wmMiss = 0;

/** 借りた写真を curl で落として返す（同じ道は1回だけ落とす） */
async function wikimedia(route) {
  const u = route.request().url();
  const f = join(WM, createHash("sha1").update(u).digest("hex"));
  /* **続けて落とすと 429（混んでいる）が HTML で返る。** それを絵として溜めると、撮った絵に壊れた枠が出て
     「写真が壊れている」と読み違える（本番では読む人ごとに別の口から取るので起きない）。
     `-f` で失敗にして、間を空けて取り直す。溜めた中身が絵でなければ捨てる */
  const isPic = () => {
    if (!existsSync(f) || statSync(f).size === 0) return false;
    const head = readFileSync(f).subarray(0, 16).toString("latin1");
    return !/^\s*</.test(head);
  };
  for (let i = 0; i < 5 && !isPic(); i++) {
    try {
      execFileSync("curl", ["-sS", "-f", "-L", "-m", "30", "-A", "ayatojima-guidebook-check/1.0", "-o", f, u], { stdio: "ignore" });
    } catch {
      execFileSync("sleep", [String(2 + i * 3)]);
    }
  }
  if (isPic()) {
    wmHit++;
    const ext = u.split("?")[0].split(".").pop().toLowerCase();
    const type = ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";
    return route.fulfill({ status: 200, contentType: type, body: readFileSync(f) });
  }
  wmMiss++;
  return route.abort();
}

async function ctxOf(b, width) {
  const ctx = await b.newContext({
    viewport: { width, height: width < 720 ? 844 : 900 },
    deviceScaleFactor: 2,
    isMobile: width < 720,
    hasTouch: width < 720,
  });
  await ctx.route(/^https:\/\/(upload\.wikimedia\.org|i\.ytimg\.com)\//, wikimedia);
  /* 島の外へは出さない。**地図の埋め込み（Google）も止める**——半分だけ読めた埋め込みが投げる例外
     （`_startApp is not defined`）が、面の JS の例外に混ざる。地図はこの道具の見る物ではない */
  await ctx.route(/^https?:\/\/(?!127\.0\.0\.1|upload\.wikimedia\.org|i\.ytimg\.com)/, (r) => r.abort());
  return ctx;
}

const openId = (p) => p.evaluate(() => document.querySelector("dialog.gb-dlg[open]")?.id ?? null);
const hashOf = (p) => p.evaluate(() => location.hash);
const settle = (p, ms = 350) => p.waitForTimeout(ms);

async function main() {
  const b = await chromium.launch({ executablePath: EXE, args: ["--no-sandbox"] });
  try {
    // ---- 0. 書き出した HTML（JS を動かす前）に、窓の中身が在るか
    const raw = await fetch(url(SPORT, PAGE)).then((r) => (r.ok ? r.text() : ""));
    if (!raw) {
      console.error(`開けなかった: ${url(SPORT, PAGE)}`);
      return 2;
    }
    const rawDialogs = [...raw.matchAll(/<dialog id="([^"]+)"[^>]*class="gb-dlg[^"]*"[\s\S]*?<\/dialog>/g)];
    if (!rawDialogs.length) {
      console.error("書き出した HTML に窓（dialog.gb-dlg）が1つも無い");
      return 2;
    }
    const empty = rawDialogs.filter((m) => m[0].replace(/<[^>]+>/g, "").replace(/\s/g, "").length < 20).map((m) => m[1]);
    if (empty.length) fail(`中身の無い窓: ${empty.slice(0, 5).join(" ")}`);
    const todoIds = rawDialogs.map((m) => m[1]).filter((id) => id.startsWith("do-"));
    notes.push(`書き出した HTML の窓 ${rawDialogs.length}（やりたいこと ${todoIds.length}）`);
    if (!todoIds.length) fail("やりたいことの窓（#do-…）が無い");
    if (todoIds.length > 8) fail(`やりたいことが ${todoIds.length}（最大8）`);

    // ---- 1. 390px: 並び・横あふれ・字の量・撮る
    const ctx = await ctxOf(b, 390);
    const p = await ctx.newPage();
    const errors = [];
    p.on("pageerror", (e) => errors.push(String(e).slice(0, 200)));
    await p.goto(url(SPORT, PAGE), { waitUntil: "domcontentloaded" });
    await p.waitForLoadState("networkidle").catch(() => {});
    await settle(p, 800);
    const chars = await p.evaluate(() => document.querySelector("main").innerText.replace(/\s/g, "").length);
    const order = await p.evaluate(() => [...document.querySelectorAll("[data-gb]")].map((e) => e.getAttribute("data-gb")));
    const seq = order.filter((x) => ORDER.includes(x));
    if (JSON.stringify(seq) !== JSON.stringify(ORDER)) fail(`節の並びが違う: ${seq.join(" → ")}`);
    const domDialogs = await p.evaluate(() => document.querySelectorAll("dialog.gb-dlg").length);
    if (domDialogs !== rawDialogs.length) fail(`窓の数が HTML（${rawDialogs.length}）と画面（${domDialogs}）で違う`);

    /* 下まで送って、遅れて読む絵を呼ぶ */
    await p.evaluate(async () => {
      for (let y = 0; y < document.body.scrollHeight; y += 600) {
        window.scrollTo(0, y);
        await new Promise((r) => setTimeout(r, 60));
      }
      window.scrollTo(0, 0);
    });
    await p.waitForLoadState("networkidle").catch(() => {});
    await settle(p, 600);
    const over = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    if (over > 0) fail(`390px で横あふれ ${over}px`);
    const height = await p.evaluate(() => document.documentElement.scrollHeight);
    for (const id of order) {
      const el = await p.$(`[data-gb="${id}"]`);
      if (el) await el.screenshot({ path: join(OUT, `${String(ORDER.indexOf(id) + 1).padStart(2, "0")}-${id}.png`) });
    }

    // ---- 2. 札から開いて、閉じるボタンで閉じる → 元の位置
    const first = todoIds[0];
    const card = p.locator(`main a[href="#${first}"]`).first();
    await card.scrollIntoViewIfNeeded();
    await p.evaluate(() => window.scrollBy(0, -120));
    await settle(p);
    const y0 = await p.evaluate(() => window.scrollY);
    await card.click();
    await settle(p);
    if ((await openId(p)) !== first) fail(`札を押しても ${first} が開かない`);
    if ((await hashOf(p)) !== `#${first}`) fail(`開いたのに URL が #${first} にならない（${await hashOf(p)}）`);
    const overOpen = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    if (overOpen > 0) fail(`窓を開くと横あふれ ${overOpen}px`);
    const dlgOver = await p.evaluate((id) => {
      const d = document.getElementById(id).querySelector(".gb-dlg-in");
      return d.scrollWidth - d.clientWidth;
    }, first);
    if (dlgOver > 0) fail(`窓の中で横あふれ ${dlgOver}px（${first}）`);
    await p.locator(`#${first}`).screenshot({ path: join(OUT, "modal-todo.png") });
    await p.locator(`#${first} .gb-dlg-x`).click();
    await settle(p, 600);
    if (await openId(p)) fail("閉じるボタンで閉じない");
    if ((await hashOf(p)) !== "") fail(`閉じたのに URL にハッシュが残る（${await hashOf(p)}）`);
    const y1 = await p.evaluate(() => window.scrollY);
    if (Math.abs(y1 - y0) > 4) fail(`閉じたあと元の位置に戻らない（${y0} → ${y1}）`);
    const focused = await p.evaluate((id) => document.activeElement?.getAttribute("href") === `#${id}`, first);
    if (!focused) fail("閉じたあと、押した札にフォーカスが戻らない");

    // ---- 3. Esc
    await card.click();
    await settle(p);
    await p.keyboard.press("Escape");
    await settle(p, 600);
    if (await openId(p)) fail("Esc で閉じない");
    if ((await hashOf(p)) !== "") fail("Esc で閉じたのに URL にハッシュが残る");

    // ---- 4. 背景を押す（狭い画面の窓は下から立ち上がる1枚なので、いちばん上の帯が背景）
    await card.click();
    await settle(p);
    await p.mouse.click(195, 8);
    await settle(p, 600);
    if (await openId(p)) fail("背景を押しても閉じない");

    // ---- 5. ブラウザの戻る
    await card.click();
    await settle(p);
    await p.goBack();
    await settle(p, 600);
    if (await openId(p)) fail("戻るで閉じない");
    if (!p.url().includes(PAGE)) fail(`戻ると面から出てしまう（${p.url()}）`);

    // ---- 6. 窓から窓へ（戻る1回で面に戻る）
    await card.click();
    await settle(p);
    const inner = p.locator(`#${first} a[href^="#see-"]`).first();
    if (await inner.count()) {
      const to = (await inner.getAttribute("href")).slice(1);
      await inner.click();
      await settle(p);
      if ((await openId(p)) !== to) fail(`窓の中の札で ${to} に入れ替わらない`);
      await p.locator(`#${to}`).screenshot({ path: join(OUT, "modal-see.png") });
      await p.goBack();
      await settle(p, 600);
      if (await openId(p)) fail("窓から窓へ入れ替えたあと、戻る1回で面に戻らない");
    } else {
      notes.push(`${first} の窓に見たいものへの札が無い（窓から窓へは見ていない）`);
    }

    // ---- 7. 食べたいものの窓を撮る
    /* 面の上の札だけ（やりたいことの窓の中にも食べたいものへの札がある。閉じた窓の中の札は押せない） */
    const eat = p.locator('main a.gb-tile[href^="#eat-"]').first();
    if (await eat.count()) {
      await eat.scrollIntoViewIfNeeded();
      await eat.click();
      await settle(p, 600);
      const eid = await openId(p);
      if (eid) await p.locator(`#${eid}`).screenshot({ path: join(OUT, "modal-eat.png") });
      await p.keyboard.press("Escape");
      await settle(p);
    }
    const guide = p.locator('main a[href^="#guide-"]').first();
    if (await guide.count()) {
      await guide.scrollIntoViewIfNeeded();
      await guide.click();
      await settle(p, 600);
      const gid = await openId(p);
      if (gid) await p.locator(`#${gid}`).screenshot({ path: join(OUT, "modal-guide.png") });
      await p.keyboard.press("Escape");
      await settle(p);
    }
    if (errors.length) fail(`JS の例外: ${errors.slice(0, 3).join(" / ")}`);
    await ctx.close();

    // ---- 8. ハッシュで直に開く（新しい窓で）
    const ctx2 = await ctxOf(b, 390);
    const p2 = await ctx2.newPage();
    const last = todoIds[todoIds.length - 1];
    await p2.goto(url(SPORT, PAGE, `#${last}`), { waitUntil: "domcontentloaded" });
    await settle(p2, 1500);
    if ((await openId(p2)) !== last) fail(`#${last} で直に着いても、その窓が開かない（開いているのは ${await openId(p2)}）`);
    const inside = await p2.evaluate((id) => !!document.activeElement?.closest(`#${id}`), last);
    if (!inside) fail("直に開いた窓に、フォーカスが入っていない");
    await p2.keyboard.press("Escape");
    await settle(p2, 600);
    if (await openId(p2)) fail("直に開いた窓が Esc で閉じない");
    const near = await p2.evaluate((id) => {
      const a = document.querySelector(`main a[href="#${id}"]`);
      const r = a?.getBoundingClientRect();
      return r ? r.bottom > 0 && r.top < window.innerHeight : false;
    }, last);
    if (!near) fail("直に開いた窓を閉じても、その札の所に着かない");
    await ctx2.close();

    // ---- 9. 1440px の横あふれ
    const ctx3 = await ctxOf(b, 1440);
    const p3 = await ctx3.newPage();
    await p3.goto(url(SPORT, PAGE), { waitUntil: "domcontentloaded" });
    await settle(p3, 800);
    const over3 = await p3.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    if (over3 > 0) fail(`1440px で横あふれ ${over3}px`);
    await p3.locator(`main a[href="#${first}"]`).first().click();
    await settle(p3, 600);
    await p3.locator(`#${first}`).screenshot({ path: join(OUT, "modal-todo-1440.png") });
    await ctx3.close();

    // ---- 10. 字の量を、前の面と比べる
    let base = null;
    if (process.env.BASE_PORT && process.env.BASE_PAGE) {
      const ctx4 = await ctxOf(b, 390);
      const p4 = await ctx4.newPage();
      const r = await p4.goto(url(process.env.BASE_PORT, process.env.BASE_PAGE), { waitUntil: "domcontentloaded" }).catch(() => null);
      if (r?.ok()) {
        await settle(p4, 800);
        base = await p4.evaluate(() => ({
          chars: document.querySelector("main").innerText.replace(/\s/g, "").length,
          height: document.documentElement.scrollHeight,
        }));
      } else notes.push(`前の面（${process.env.BASE_PAGE}）が開けない`);
      await ctx4.close();
    }
    console.log(`面 ${PAGE}（390px）: 最初に見える字 ${chars}字・高さ ${height}px${base ? `／前の面 ${process.env.BASE_PAGE}: ${base.chars}字・${base.height}px（${Math.round((chars / base.chars) * 100)}%）` : ""}`);
    if (base && chars >= base.chars) fail(`最初に見える字が前の面より減っていない（${base.chars} → ${chars}）`);
  } finally {
    await b.close();
  }
  for (const n of notes) console.log(`  — ${n}`);
  console.log(`  — 借りた写真: 本物で返した ${wmHit}・落とせなかった ${wmMiss}`);
  console.log(`  — 撮った絵: ${OUT}`);
  if (bad.length) {
    for (const x of bad) console.log(`  ✗ ${x}`);
    return 1;
  }
  console.log("  ✓ 並び・横あふれ・窓（HTML に在る・直に開く・閉じる4通り・元の位置・窓から窓へ）");
  return 0;
}

main()
  .then((c) => process.exit(c))
  .catch((e) => {
    console.error(e);
    process.exit(2);
  });
