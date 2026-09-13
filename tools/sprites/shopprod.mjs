/**
 * **お店の区画を、本番そのもので見る。**
 *
 *   node tools/sprites/shopprod.mjs
 *   W=1280 node tools/sprites/shopprod.mjs
 *   NOW=2026-09-14T11:00:00+03:00 node tools/sprites/shopprod.mjs
 *
 * ローカルの書き出しではなく、**出したバイト列**を開く（`docs/island-standards.md` 4）。
 * この箱のブラウザは本番に届かないので、`prod.mjs` の `viaCurl` で横取りする。
 *
 * 撮る順番は、**あやとが路上でやる順番**に合わせてある:
 *
 *   top    … 島のトップ。「いま、旅のとちゅう」がどこを指しているか
 *   head   … 日ページを開いた瞬間（`scrollY=0`）。近道の札が見えているか
 *   jump   … 近道を押した直後。買う節の見出しが**固定ヘッダの下に潜っていないか**
 *   shop   … 買う節を開き切ったところ
 *
 * 絵だけで済ませない。同時に出す数:
 *
 *   - 横あふれ（面ぜんぶ。`scrollWidth - clientWidth`）
 *   - 押しどころの実寸（`elementFromPoint` で1pxずつ。見た目の箱では測らない）
 *   - 絵文字の有無
 *   - 開いている店／閉じている店の札の数
 *
 * `NOW=` を渡すと、その時刻の時計を差し込んで開く。**本番の値ではない**ので、
 * 「開いている店の姿」を見るためだけに使う。判定に使う数はここから取らない。
 */
import { chromium } from "playwright-core";
import { mkdirSync, writeFileSync } from "fs";
import { viaCurl, ORIGIN } from "./prod.mjs";
import { offline } from "./route.mjs";

/* 出す前に、直したものを自分の箱で見るための口。
   `BASE=http://127.0.0.1:4210` を渡すと、書き出したものを静的に配ったほうを開く
   （`.html` が要るので付ける）。**渡さなければ本番。** 判定の数はこちらで取る。 */
const BASE = process.env.BASE || "";

const W = Number(process.env.W || 390);
const OUT = process.env.OUT || `/tmp/shopprod/${W}`;
const NOW = process.env.NOW || "";
const PAGES = (process.env.PAGES || "/,/nordic/day/2,/nordic/day/3,/nordic/day/6,/nordic/guide").split(",");
mkdirSync(OUT, { recursive: true });

/** 押しどころの実寸。中心から1pxずつ外へ伸ばして、まだ自分が返るかで測る。
 *
 * **伸ばす上限に当たった値を、実寸として読まない。** 片側 300px で止めて
 * いるので、それより広い押しどころは必ず「601px」と出る。1280px の
 * お店の行を「幅 601px」と読んだが、実物は 842px あった（紙の幅ぶん）。
 * 上限に当たったら `sat`（saturated）を立てて、数のほうで分かるようにする。
 */
const HIT = `(el) => {
  const CAP = 300;
  const r = el.getBoundingClientRect();
  const cx = Math.round(r.left + r.width / 2), cy = Math.round(r.top + r.height / 2);
  const mine = (x, y) => { const e = document.elementFromPoint(x, y); return !!e && (e === el || el.contains(e)); };
  if (!mine(cx, cy)) return null;
  const grow = (dx, dy) => { let n = 0; while (n < CAP && mine(cx + dx * (n + 1), cy + dy * (n + 1))) n += 1; return n; };
  const l = grow(-1, 0), rt = grow(1, 0), u = grow(0, -1), d = grow(0, 1);
  const out = { w: l + rt + 1, h: u + d + 1 };
  if (l === CAP || rt === CAP || u === CAP || d === CAP) out.sat = true;
  return out;
}`;

/** 絵文字。記号（→ ① ◎）は絵文字ではないので数えない（`island-design.md` 1章）。 */
const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{1F000}-\u{1F0FF}\u{FE0F}]/u;

const b = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--no-sandbox"],
});

const report = {};
for (const path of PAGES) {
  const tag = path.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "top";
  const ctx = await b.newContext({
    viewport: { width: W, height: 844 },
    deviceScaleFactor: 2,
    isMobile: W < 700,
    hasTouch: W < 700,
  });
  if (BASE) await offline(ctx).catch(() => {});
  else await viaCurl(ctx);
  if (NOW) {
    /* 時計の差し込み。**閉まっている時間帯にしか撮れない札**を見るため。
       `Date.now()` も `new Date()` も同じ嘘をつかないと、
       1分ごとの数え直しで本物の時刻に戻ってしまう。 */
    await ctx.addInitScript(`(() => {
      const T = ${JSON.stringify(NOW)};
      const base = new Date(T).getTime();
      const Real = Date;
      class Fake extends Real {
        constructor(...a) { super(...(a.length ? a : [base])); }
        static now() { return base; }
      }
      window.Date = Fake;
    })()`);
  }
  const p = await ctx.newPage();
  const errs = [];
  p.on("pageerror", (e) => errs.push(String(e).slice(0, 140)));
  await p.goto(BASE ? `${BASE}${path === "/" ? "/index" : path}.html` : `${ORIGIN}${path}`,
    { waitUntil: "domcontentloaded" });
  await p.waitForTimeout(BASE ? 3000 : 9000);

  /* 島は rAF で動く。止めないと、2枚のあいだで住人が歩いて絵が変わる。 */
  await p.evaluate(() => {
    window.requestAnimationFrame = () => 0;
  });

  await p.evaluate(() => window.scrollTo(0, 0));
  await p.waitForTimeout(400);
  await p.screenshot({ path: `${OUT}/${tag}-head.png` });

  const head = await p.evaluate(
    ({ hitSrc }) => {
      const hit = eval(hitSrc);
      const vh = window.innerHeight;
      const seen = (el) => {
        const r = el.getBoundingClientRect();
        return r.top < vh && r.bottom > 0;
      };
      const jump = document.querySelector(".nday-jump a");
      const trip = document.querySelector("a.htrip");
      return {
        // 最初の画面に、買う節への近道が見えているか
        近道: jump
          ? { 字: jump.textContent.trim(), 行き先: jump.getAttribute("href"), 上端: Math.round(jump.getBoundingClientRect().top), 見えている: seen(jump), 当たり: hit(jump) }
          : null,
        旅の札: trip
          ? { 字: trip.textContent.trim().replace(/\s+/g, " "), 行き先: trip.getAttribute("href"), 上端: Math.round(trip.getBoundingClientRect().top), 見えている: seen(trip), 当たり: hit(trip) }
          : null,
        画面の高さ: vh,
      };
    },
    { hitSrc: HIT },
  );

  /* 近道を押す。**押したあとに見出しがどこへ来るか**が合否
     （固定ヘッダの下に潜っていたら、押した人は何も起きていないと読む）。 */
  let jump = null;
  const jumpEl = await p.$(".nday-jump a");
  if (jumpEl) {
    await jumpEl.click();
    await p.waitForTimeout(1200);
    await p.screenshot({ path: `${OUT}/${tag}-jump.png` });
    jump = await p.evaluate(() => {
      const h = document.querySelector(".nshop h2, .nshop summary");
      if (!h) return null;
      const r = h.getBoundingClientRect();
      /* 画面の上に貼りついている帯の厚み。
         **見出しの上を下りて探す測り方は間違っていた。** 見出しが画面の外
         （`top` が負）に出ていると、探す範囲が0になって「かぶり0」と返る。
         1280px では 93px の看板が貼りついているのに「かぶっていない」と
         出ていた（`docs/island-standards.md` 13。判定のほうを疑う）。
         **貼りついている帯そのものを数える。** 見出しの位置とは無関係に測る。 */
      let cover = 0;
      for (const el of document.querySelectorAll("body *")) {
        const pos = getComputedStyle(el).position;
        if (pos !== "fixed" && pos !== "sticky") continue;
        const b = el.getBoundingClientRect();
        // 画面の上辺に触れていて、上半分より浅いものだけ。下の帯は数えない
        if (b.top <= 1 && b.bottom > 0 && b.bottom < window.innerHeight / 2 && b.width > window.innerWidth / 2) {
          cover = Math.max(cover, Math.round(b.bottom));
        }
      }
      return { 見出し: h.textContent.trim().slice(0, 24), 上端: Math.round(r.top), 貼りつきの厚み: cover, 見出しが隠れている: r.top < cover };
    });
  }

  /* 買う節を開き切る。「あと◯軒だす」を押せなくなるまで押す。 */
  const shop = await p.$(".nshop");
  let counts = null;
  if (shop) {
    await p.evaluate(() => {
      for (const d of document.querySelectorAll(".nshop details")) d.open = true;
    });
    await p.waitForTimeout(600);
    for (let i = 0; i < 40; i++) {
      const btns = await p.$$(".nshop .longer");
      let pressed = false;
      for (const btn of btns) {
        const t = (await btn.textContent()) || "";
        if (/だす/.test(t)) { await btn.click().catch(() => {}); pressed = true; }
      }
      if (!pressed) break;
      await p.waitForTimeout(250);
    }
    await p.waitForTimeout(600);
    counts = await p.evaluate(
      ({ hitSrc }) => {
        const hit = eval(hitSrc);
        const box = document.querySelector(".nshop");
        const gs = [...box.querySelectorAll(".nshop-g")].map((g) => ({
          見出し: g.querySelector("h3")?.textContent.trim(),
          軒: g.querySelectorAll(".nsp").length,
          印: g.querySelector("h3 .ic")?.outerHTML.match(/<path[^>]*d="([^"]{0,18})/)?.[1] || "",
        }));
        const rows = [...box.querySelectorAll(".nsp-go")];
        const hits = [];
        for (const el of rows) {
          el.scrollIntoView({ block: "center" });
          const h = hit(el);
          if (h) hits.push(h);
        }
        const live = [...box.querySelectorAll(".nsp-live")];
        return {
          区画: gs,
          行: rows.length,
          当たり最小: hits.length ? Math.min(...hits.map((h) => h.h)) : null,
          当たり最小幅: hits.length ? Math.min(...hits.map((h) => h.w)) : null,
          当たり48未満: hits.filter((h) => h.h < 48 || h.w < 48).length,
          開いてる札: live.filter((e) => e.classList.contains("is-open")).length,
          閉まってる札: live.filter((e) => e.classList.contains("is-shut")).length,
          時間不明: box.querySelectorAll(".nsp-open.is-none").length,
          住所なし: rows.length - box.querySelectorAll(".nsp-at").length,
        };
      },
      { hitSrc: HIT },
    );
    /* 区画の絵。**4つが区別つくか**を見るので、頭から2画面ぶん。 */
    await p.evaluate(() => document.querySelector(".nshop").scrollIntoView({ block: "start" }));
    await p.waitForTimeout(500);
    await p.screenshot({ path: `${OUT}/${tag}-shop.png` });
    await p.evaluate(() => window.scrollBy(0, window.innerHeight - 40));
    await p.waitForTimeout(400);
    await p.screenshot({ path: `${OUT}/${tag}-shop2.png` });
  }

  /* 面ぜんぶを下まで送る。**畳んだまま測ると背も横あふれも嘘になる**（`CLAUDE.md`）。 */
  const page = await p.evaluate(() => {
    const s = document.scrollingElement;
    return { 背: s.scrollHeight, 横あふれ: s.scrollWidth - s.clientWidth, 幅: s.clientWidth };
  });
  /* 横にあふれている要素を名指しする。**数だけ出して終わりにしない**
     （`docs/island-standards.md` 13。SVG の中の path はページを動かさない）。 */
  const spill = await p.evaluate(() => {
    const out = [];
    const lim = document.scrollingElement.clientWidth;
    for (const el of document.querySelectorAll("body *")) {
      if (el.ownerSVGElement) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) continue;
      if (r.right > lim + 1 || r.left < -1) {
        out.push({
          tag: el.tagName,
          c: (typeof el.className === "string" ? el.className : "").slice(0, 34),
          l: Math.round(r.left), r: Math.round(r.right),
        });
      }
    }
    return out.slice(0, 12);
  });
  const emoji = await p.evaluate(
    (re) => {
      const rx = new RegExp(re, "u");
      const out = [];
      const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      for (let n = w.nextNode(); n; n = w.nextNode()) {
        const t = (n.textContent || "").trim();
        if (t && rx.test(t)) out.push(t.slice(0, 30));
      }
      return out.slice(0, 10);
    },
    EMOJI.source,
  );

  report[path] = { head, jump, counts, page, spill, emoji, errs };
  console.log(`\n### ${path}  (W=${W}${NOW ? ` NOW=${NOW}` : ""})`);
  console.log(JSON.stringify(report[path], null, 1));
  await ctx.close();
}
writeFileSync(`${OUT}/report.json`, JSON.stringify(report, null, 1));
console.log(`\n絵は ${OUT}/`);
await b.close();
