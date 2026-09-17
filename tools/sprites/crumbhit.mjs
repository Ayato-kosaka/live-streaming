/**
 * パンくず（`.crumbs`）の押しどころを、全面ぶん測る。
 *
 *   SPORT=4230 DIST=site/.next-3230 node tools/sprites/crumbhit.mjs
 *   W=1000 SPORT=4230 ... node tools/sprites/crumbhit.mjs        # 広い画面で
 *
 * **見た目の箱では測らない。** `::after` で広げた当たりは
 * `getBoundingClientRect` に出ないし、隣に取られている場所も出ない。
 * 中心から1pxずつ外へ伸ばして `elementFromPoint` が自分を返すかで測る。
 *
 * **伸ばす上限に当たった値を実寸として読まない。** 上限まで伸びたものは
 * `飽和` と出す。上限を実寸と読んで「合格」と誤判定した前例がある。
 *
 * かぶりは、伸ばした結果ではなく **`::after` の箱どうしの重なり**で数える。
 * 伸ばした結果は、あとから描かれたほうが勝つので原理的に重ならない
 * ——つまり「重なっていない」としか出ない。盗られているかは、
 * 意図した箱（`::after`）が隣と重なっているかで見る。
 */
import { chromium } from "playwright-core";
import { readdirSync, statSync } from "fs";
import { join } from "path";
import { repoPath, fromRoot } from "./repo.mjs";

const SPORT = process.env.SPORT || "4230";
const root = fromRoot(process.env.DIST || "site/.next-3230");
const W = Number(process.env.W || 390);
const MIN = Number(process.env.MIN || 48);

function walk(d, base = "") {
  let out = [];
  for (const f of readdirSync(d)) {
    if (f === "_next" || f === "cache" || f === "server" || f === "static") continue;
    const p = join(d, f);
    if (statSync(p).isDirectory()) out = out.concat(walk(p, base + "/" + f));
    else if (f.endsWith(".html")) out.push(base + "/" + f);
  }
  return out;
}
const only = process.env.PAGES ? process.env.PAGES.split(",") : null;
const pages = (only || walk(root)).sort();

const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox"] });
const ctx = await b.newContext({ viewport: { width: W, height: 900 }, deviceScaleFactor: 1, isMobile: W < 700, hasTouch: W < 700, reducedMotion: "reduce" });
await ctx.route(/googleusercontent\.com|upload\.wikimedia\.org|instagram\.com|ytimg\.com|youtube\.com/,
  (r) => r.fulfill({ path: repoPath("site/public/og.png") }));
await ctx.route(/fonts\.googleapis\.com/, (r) => r.fulfill({ status: 200, contentType: "text/css", body: "" }));
const p = await ctx.newPage();
await p.addInitScript(() => localStorage.setItem("ayato-island-arrived", "1"));
/* `OLD=1` で、直す前の余白に差し戻して測る。**絵だけ差し戻して並べると、
   その絵が本当に「直す前」かを誰も確かめていないことになる。** 同じ
   差し戻しで測って、直す前の数字（島 40px / 46px）が出るかを見るための口。 */
const OLDCSS = `
  .crumbs { column-gap: var(--sp-2) !important; }
  .crumbs i, .crumbs > span:first-of-type:has(> a) > i { margin: 0 var(--sp-1) !important; }
`;

let worst = 1e9, worstAt = "", nbad = 0, nsat = 0, nover = 0, nlinks = 0, npages = 0;
for (const path of pages) {
  await p.goto(`http://localhost:${SPORT}${path}`, { waitUntil: "domcontentloaded", timeout: 45000 });
  await p.waitForTimeout(250);
  if (process.env.OLD === "1") { await p.addStyleTag({ content: OLDCSS }); await p.waitForTimeout(100); }
  const rows = await p.evaluate((LIMIT) => {
    const out = [];
    for (const nav of document.querySelectorAll(".crumbs")) {
      const nr = nav.getBoundingClientRect();
      // 900px 未満で「島 › ○○」1段の面は clip で畳まれている。見えないものは数えない。
      const hidden = nr.width <= 2 || nr.height <= 2;
      const links = [...nav.querySelectorAll("a")];
      // `::after` の箱（意図した押しどころ）。left/top 50% + translate(-50%,-50%) なので
      // 要素の外接矩形の中心に、computed の幅高さで置かれる。
      const afterBox = (el) => {
        const cs = getComputedStyle(el, "::after");
        const r = el.getBoundingClientRect();
        const w = parseFloat(cs.width) || r.width, h = parseFloat(cs.height) || r.height;
        const cx = r.x + r.width / 2, cy = r.y + r.height / 2;
        return { x: cx - w / 2, y: cy - h / 2, w, h };
      };
      const boxes = links.map(afterBox);
      let overlaps = 0;
      for (let i = 0; i + 1 < boxes.length; i++) {
        const a = boxes[i], c = boxes[i + 1];
        const ox = Math.min(a.x + a.w, c.x + c.w) - Math.max(a.x, c.x);
        const oy = Math.min(a.y + a.h, c.y + c.h) - Math.max(a.y, c.y);
        if (ox > 0.01 && oy > 0.01) overlaps++;
      }
      links.forEach((el, i) => {
        const t = (el.textContent || "").trim().slice(0, 14);
        if (hidden) { out.push({ t, hidden: true }); return; }
        el.scrollIntoView({ block: "center" });
        const rects = [...el.getClientRects()].filter((q) => q.width > 0 && q.height > 0);
        const r = el.getBoundingClientRect();
        const box = rects.length ? rects.reduce((a, q) => (q.width * q.height > a.width * a.height ? q : a)) : r;
        const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
        const hits = (x, y) => {
          const e = document.elementFromPoint(x, y);
          return e && (e === el || el.contains(e) || e.closest?.("a,button,label") === el);
        };
        if (cx < 0 || cy < 0 || cx > innerWidth || cy > innerHeight) { out.push({ t, why: "画面の外" }); return; }
        if (!hits(cx, cy)) {
          const top = document.elementFromPoint(cx, cy);
          out.push({ t, why: `${top ? top.tagName : "なし"} が上にいる` });
          return;
        }
        const grow = (dx, dy) => { let n = 0; while (n < LIMIT && hits(cx + dx * (n + 1), cy + dy * (n + 1))) n++; return n; };
        const l = grow(-1, 0), rr = grow(1, 0), u = grow(0, -1), dn = grow(0, 1);
        const sat = [l, rr, u, dn].some((n) => n >= LIMIT);
        out.push({
          t, i,
          box: [Math.round(r.width), Math.round(r.height)],
          hit: [l + rr + 1, u + dn + 1],
          sat,
          overlaps: i === 0 ? overlaps : undefined,
        });
      });
    }
    return out;
  }, 200);
  const shown = rows.filter((r) => !r.hidden);
  if (!shown.length) continue;
  npages++;
  for (const r of rows) {
    if (r.hidden) continue;
    nlinks++;
    if (r.why) { nbad++; console.log(`${path}  ${r.t}  当たり 測れず（${r.why}）`); continue; }
    if (r.sat) nsat++;
    if (r.overlaps) nover += r.overlaps;
    const bad = r.hit[0] < MIN || r.hit[1] < MIN;
    if (bad) nbad++;
    if (r.hit[0] < worst) { worst = r.hit[0]; worstAt = `${path} ${r.t}`; }
    console.log(`${path}  ${r.t}  見た目 ${r.box[0]}x${r.box[1]}  当たり ${r.hit[0]}x${r.hit[1]}${r.sat ? " 【飽和】" : ""}${bad ? "  ← " + MIN + "px 未満" : ""}${r.overlaps !== undefined ? `  かぶり ${r.overlaps}` : ""}`);
  }
}
console.log(`\n== 幅 ${W}px ==  パンくずの出る面 ${npages} / リンク ${nlinks} 本`);
console.log(`${MIN}px 未満 ${nbad} 本 / 飽和 ${nsat} 本 / 隣とのかぶり ${nover} 組`);
console.log(`いちばん狭い横 ${worst}px（${worstAt}）`);
await b.close();
