/**
 * 面の終わりの**帰り道**（`.chain-foot a` / `.chap-note a`）だけを狙って、
 * 当たり判定を測って、**測った矩形をそのまま絵に塗る**。
 *
 *   SPORT=4210 W=390 OUT=/tmp/backreport/after node tools/sprites/backhit.mjs
 *   SPORT=4210 W=1440 SEL=".chain-foot a,.chap-note a" node tools/sprites/backhit.mjs
 *
 * ## なぜ作ったか
 *
 * `pchit.mjs` は数を返すが、**48px に届いているのが目で分からない。**
 * 「19px」は測定であって、押しにくいかどうかは絵を見ないと言えない
 * （`docs/island-misses.md` #78）。ここは**測った当たり判定を、その面の絵に
 * 半透明で重ねて**出す。48px に届いていれば緑、割れていれば赤。
 *
 * ## 測りかたは `hitbox.mjs` と同じ
 *
 * **見た目の箱（`getBoundingClientRect`）では測らない。** `::after` で広げた
 * 当たり判定はそこに出ないし、隣に取られている場所も出ない。中心から1pxずつ
 * 外へ伸ばして `elementFromPoint` がまだ自分を返すかで測る
 * （`CLAUDE.md`「押しどころは、見た目の箱で測らない」）。
 *
 * ## 撮り方
 *
 * **丸ごと撮らない。** 背の高い面（`/island/caucasus/streams` は 390px で
 * 48,037px）を丸ごと撮ると、絵の端が白く抜ける（#80 の追記）。
 * 帰り道のまわり（上下 180px）だけを切り取る。
 */
import { chromium } from "playwright-core";
import { offline } from "./route.mjs";
import { mkdirSync, writeFileSync } from "fs";

const SPORT = process.env.SPORT || "4210";
const W = Number(process.env.W || 390);
const H = Number(process.env.H || 900);
const OUT = process.env.OUT || "/tmp/backreport/hit";
const SEL = process.env.SEL || ".chain-foot a,.chap-note a";
const MIN = Number(process.env.MIN || 48);
const PAGES = (
  process.env.PAGES ||
  "/atlas," +
    "/island/albania,/island/caucasus,/island/europe,/island/iran-walk,/island/middle-east,/island/nordic," +
    "/island/caucasus/streams,/island/europe/streams,/island/iran-walk/streams,/island/middle-east/streams"
).split(",");

mkdirSync(OUT, { recursive: true });
const b = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--no-sandbox"],
});
const ctx = await b.newContext({
  viewport: { width: W, height: H },
  deviceScaleFactor: 2,
  isMobile: W < 900,
  hasTouch: W < 900,
  reducedMotion: "reduce",
});
await offline(ctx);
await ctx.addInitScript(() => {
  try {
    localStorage.setItem("ayato-island-arrived", "2026-09-04");
    localStorage.setItem("ayato-island-walked", "1");
  } catch {}
});
/* **島の地の色は時刻で変わる**（`app/css/tokens.css` の `[data-time]`）。
   前と後を別の時間に撮ると、直していないものが動いて見える
   （`docs/island-misses.md` #81）。前後で同じ帯に固定する。 */
const TIME = process.env.TIME || "day";
const p = await ctx.newPage();

const all = [];
for (const path of PAGES) {
  const url = `http://localhost:${SPORT}${path === "/" ? "/index" : path}.html`;
  try {
    await p.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
  } catch (e) {
    console.log(`測れず ${path} ${String(e).slice(0, 80)}`);
    continue;
  }
  await p.waitForTimeout(500);
  await p.evaluate((t) => { document.documentElement.dataset.time = t; }, TIME);

  const rows = await p.evaluate(
    ({ SEL, MIN }) => {
      const out = [];
      for (const el of document.querySelectorAll(SEL)) {
        el.scrollIntoView({ block: "center" });
        const lines = [...el.getClientRects()].filter((q) => q.width > 0 && q.height > 0);
        if (!lines.length) continue;
        const box = lines.reduce((a, q) => (q.width * q.height > a.width * a.height ? q : a));
        const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
        const hits = (x, y) => {
          const e = document.elementFromPoint(x, y);
          return e && (e === el || el.contains(e) || e.closest?.("a,button,label,summary") === el);
        };
        if (!hits(cx, cy)) {
          out.push({ t: (el.textContent || "").trim().slice(0, 16), why: "覆われている" });
          continue;
        }
        const grow = (dx, dy) => { let k = 0; while (k < 80 && hits(cx + dx * (k + 1), cy + dy * (k + 1))) k++; return k; };
        const l = grow(-1, 0), r = grow(1, 0), u = grow(0, -1), d = grow(0, 1);
        /* **塗るのは、いま測った矩形そのもの。** 別に引き直すと、絵と数が
           別のものになる。`elementFromPoint` が自分を返した範囲を、そのまま置く。 */
        const hit = { x: cx - l, y: cy - u, w: l + r + 1, h: u + d + 1 };
        out.push({
          t: (el.textContent || "").trim().slice(0, 16),
          box: [Math.round(box.width), Math.round(box.height)],
          hit: [hit.w, hit.h],
          ok: hit.w >= MIN && hit.h >= MIN,
          rect: { ...hit, top: hit.y + scrollY },
        });
      }
      return out;
    },
    { SEL, MIN },
  );

  for (const r of rows) {
    if (r.why) { console.log(`${path}  ${r.t}  ${r.why}`); continue; }
    console.log(`${path}  ${W}px  「${r.t}」  見た目 ${r.box[0]}x${r.box[1]}  当たり ${r.hit[0]}x${r.hit[1]}  ${r.ok ? "OK" : "** 48px割れ **"}`);
    all.push({ path, w: W, ...r, rect: undefined });
  }

  // 当たり判定を塗る。48px に届いていれば緑、割れていれば赤。
  await p.evaluate(
    ({ rows }) => {
      for (const r of rows) {
        if (!r.rect) continue;
        const d = document.createElement("div");
        d.style.cssText =
          `position:absolute;left:${r.rect.x}px;top:${r.rect.top}px;` +
          `width:${r.rect.w}px;height:${r.rect.h}px;z-index:99999;pointer-events:none;` +
          `background:${r.ok ? "rgba(28,170,90,0.26)" : "rgba(220,20,60,0.30)"};` +
          `outline:2px solid ${r.ok ? "#118a48" : "#c0102f"};`;
        const lab = document.createElement("span");
        lab.textContent = `${r.hit[0]}x${r.hit[1]}`;
        lab.style.cssText =
          `position:absolute;left:0;top:-15px;font:900 11px/15px system-ui;padding:0 4px;` +
          `color:#fff;background:${r.ok ? "#118a48" : "#c0102f"};white-space:nowrap;`;
        d.appendChild(lab);
        document.body.appendChild(d);
      }
    },
    { rows },
  );

  /* 帰り道のまわりだけを切る。**丸ごと撮ると、背の高い面で端が白く抜ける**
     （`docs/island-misses.md` #80 の追記）。 */
  const first = rows.find((r) => r.rect);
  if (first) {
    const y = Math.max(0, Math.round(first.rect.top - 170));
    await p.evaluate((yy) => window.scrollTo(0, yy), y);
    await p.waitForTimeout(250);
    const name = `${path.replace(/\//g, "_").replace(/^_/, "") || "index"}-${W}.png`;
    await p.screenshot({ path: `${OUT}/${name}` });
  }
}
writeFileSync(`${OUT}/hit-${W}.json`, JSON.stringify(all, null, 1));
console.log(`\n測った ${all.length}か所 / 48px割れ ${all.filter((r) => !r.ok).length}か所  →  ${OUT}`);
await b.close();
