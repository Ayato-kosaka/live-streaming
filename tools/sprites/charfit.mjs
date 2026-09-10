/**
 * 住人のキャラクターが、**どの面でも同じ大きさで、切れずに**出ているかを数える。
 *
 *   SPORT=4502 node charfit.mjs            # 島・図鑑・章の島をまとめて
 *   SPORT=4502 PAGES=/index.html node charfit.mjs
 *
 * 見るのは3つ。
 *
 *   代表埋め … 同じ面に同じ絵が2枚以上出ていないか（本人の絵が無いところに
 *              誰かの絵を代わりに立てると、必ずどこかで同じ絵が2枚になる）
 *   見切れ   … 器のふちで絵が切られていないか。**器の矩形ではなく、
 *              描かれた画素**で見る。絵の中の余白は人によって違うので、
 *              「器いっぱい」でも切れていないことがあるし、その逆もある
 *   不揃い   … 描かれた figure の高さが、器に対してどれだけばらついているか。
 *              画像の枠ではなく **中身（不透明な画素）の高さ**で測る。
 *              枠が同じ 640×640 でも、中の絵は幅 47% だったり高さ 59% だったりする
 *
 * 絵は `python3 tools/sprites/avatars.py` で先に落としておくこと。
 * 落とさずに撮ると全員が同じ1枚になって、ばらつきを数えても意味が無い。
 */
import { chromium } from "playwright-core";
import { offline } from "./route.mjs";
import { readFileSync } from "fs";

const SPORT = process.env.SPORT || "4502";
const PAGES = (process.env.PAGES || "/index.html,/friends.html,/island/nordic.html").split(",");
const AV = "/tmp/avatars";

/** 元の絵の中で、描かれている部分がどこか。`charbox.py` が測って置いていく。 */
const box = JSON.parse(readFileSync(`${AV}/box.json`, "utf8"));
const inkBox = new Map(
  Object.entries(box).map(([k, [x, y, w, h, ar]]) => [k, { x0: x, y0: y, fw: w, fh: h, ar }]),
);

const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox"] });
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
await offline(ctx);
const p = await ctx.newPage();
await p.addInitScript(() => { try { localStorage.setItem("ayato-island-arrived", "2026-09-04"); localStorage.setItem("ayato-island-walked", "1"); } catch {} });

let dup = 0, clipped = 0, shots = 0;
const spread = [];
for (const page of PAGES) {
  const url = `http://localhost:${SPORT}${page}`;
  const res = await p.goto(url, { waitUntil: "load", timeout: 60000 }).catch(() => null);
  if (!res || res.status() >= 400) { console.log(`  （${page} は無い）`); continue; }
  await p.waitForTimeout(5000);
  const found = await p.evaluate(() => {
    const out = [];
    const pick = (el, kind) => {
      const src = el.getAttribute("href") || el.getAttribute("src") || "";
      const m = /googleusercontent\.com\/d\/([^=?/]+)/.exec(src);
      if (!m) return;
      const r = el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) return;
      // 器＝はみ出しを切る、いちばん近い先祖
      let box = null;
      for (let q = el.parentElement; q; q = q.parentElement) {
        const cs = getComputedStyle(q);
        if (cs.overflow !== "visible" || cs.clipPath !== "none") { box = q.getBoundingClientRect(); break; }
      }
      out.push({ id: m[1], kind, x: r.x, y: r.y, w: r.width, h: r.height,
        fit: el instanceof SVGElement ? (el.getAttribute("preserveAspectRatio") || "") : getComputedStyle(el).objectFit,
        box: box && { x: box.x, y: box.y, w: box.width, h: box.height },
        cls: el.getAttribute("class") || el.parentElement?.getAttribute("class") || "" });
    };
    for (const el of document.querySelectorAll("image")) pick(el, "svg");
    for (const el of document.querySelectorAll("img")) pick(el, "img");
    return out;
  });
  /* 同じ絵が2枚出ていないか。**同じ並びの中だけで数える。**
     図鑑は「開いている1人」を大きく出したうえで一覧にも並べるので、
     面ぜんぶで数えると、その1人がいつも重複に見える。 */
  const seen = new Map();
  const rows = [];
  for (const f of found) {
    const key = `${f.cls}|${f.id}`;
    seen.set(key, (seen.get(key) ?? 0) + 1);
    const ink = inkBox.get(f.id);
    if (!ink) continue;
    shots++;
    /* 器の中で、絵の枠がどう置かれるか。contain / meet なら収まる最大の相似形、
       cover / slice なら覆う最小。`none` は枠そのまま。 */
    const cover = f.fit.includes("slice") || f.fit === "cover";
    const none = f.fit === "none" || f.fit === "fill";
    const kx = f.w, ky = f.h / ink.ar; // 枠の幅を1としたときの尺度
    const fw = none ? f.w : cover ? Math.max(kx, ky) : Math.min(kx, ky);
    const fh = none ? f.h : fw / ink.ar;
    // 描かれた部分の大きさ（画面px）
    const dw = ink.fw * fw;
    const dh = ink.fh * fh;
    // 枠の左上（object-position は中央、下ぞろえのものだけ下端に合わせる）
    const bottom = f.fit.includes("YMax") || f.fit.includes("bottom");
    const fx = f.x + (f.w - fw) / 2;
    const fy = bottom ? f.y + f.h - fh : f.y + (f.h - fh) / 2;
    const L = fx + ink.x0 * fw, T = fy + ink.y0 * fh;
    const R = L + dw, B = T + dh;
    let cut = 0;
    if (f.box) {
      const o = f.box;
      cut = Math.max(0, o.x - L) + Math.max(0, R - (o.x + o.w)) + Math.max(0, o.y - T) + Math.max(0, B - (o.y + o.h));
    }
    if (cut > 1) clipped++;
    /* 見た目の大きさは面積で決まるので、幅と高さの相乗平均で比べる。
       **器に対する割合ではなく、画面上の実寸**で比べること。
       器の大きさを1人ずつ変えてそろえているので、割合で見ると直っても動かない。 */
    rows.push({ id: f.id, cls: f.cls.slice(0, 24), boxH: f.h, size: Math.sqrt(dw * dh), cut });
  }
  const dupHere = [...seen].filter(([, n]) => n > 1);
  dup += dupHere.length;
  console.log(`■ ${page}  キャラクター ${found.length}枚（別人 ${new Set(found.map((f) => f.id)).size}人）`);
  if (dupHere.length) for (const [k, n] of dupHere) console.log(`   ★ 同じ並びに同じ絵が ${n}枚: ${k}`);
  // 器ごとにまとめて、描かれた高さの比を見る
  const byCls = new Map();
  for (const r of rows) {
    const a = byCls.get(r.cls) ?? [];
    a.push(r); byCls.set(r.cls, a);
  }
  for (const [cls, a] of byCls) {
    const rs = a.map((r) => r.size).sort((x, y) => x - y);
    const lo = rs[0], hi = rs[rs.length - 1];
    const cuts = a.filter((r) => r.cut > 1);
    spread.push({ page, cls, n: a.length, lo, hi });
    console.log(`   ${cls || "(器なし)"}  ${a.length}枚  描かれた大きさ ${lo.toFixed(0)}〜${hi.toFixed(0)}px  ばらつき ${(hi / lo).toFixed(2)}倍  見切れ ${cuts.length}枚`);
    for (const r of cuts) console.log(`      切れ ${r.cut.toFixed(0)}px  ${r.id}`);
  }
}
console.log(`\n合計  数えた絵 ${shots}枚 / 代表埋め（同じ絵が2枚以上）${dup}件 / 見切れ ${clipped}枚`);
console.log(`      いちばんばらつく器 ${spread.sort((a, x) => x.hi / x.lo - a.hi / a.lo)[0]?.cls} ${(spread[0] ? spread[0].hi / spread[0].lo : 0).toFixed(2)}倍`);
await b.close();
