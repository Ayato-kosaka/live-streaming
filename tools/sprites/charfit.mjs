/**
 * 住人のキャラクターが、**どの面でも同じ大きさで、切れずに**出ているかを数える。
 *
 *   SPORT=4502 node charfit.mjs            # 島・図鑑・章の島をまとめて
 *   SPORT=4502 PAGES=/index.html node charfit.mjs
 *   SPORT=4502 ME=1 node charfit.mjs       # 看板の右はし（22人に化けて1人ずつ）
 *
 * **看板の右はしは1人ぶんしか出ない。** ログインした人のキャラクターだけを
 * 出すところなので、一覧のように「1枚の絵の中でばらつきを数える」ができない。
 * 22人に化けて撮り直し、**別々の絵を並べて**ばらつきを見る。
 * 並べた1枚は /tmp/hdrfit/sheet.png に置く（**出す前に自分で開いて見ること**）。
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
 * 器が**丸い**とき（看板の右はし）は、矩形で見ても切れているか分からない。
 * 円の外は器の矩形の中にあるからで、`getBoundingClientRect` では出ない。
 * **切ったものと切らないものの2枚を撮って、絵が変わるかで見る**（`overflow` を
 * 外して撮り直し、1バイトでも違えば、その差ぶんが円で切られていた画素）。
 *
 * 絵は `python3 tools/sprites/avatars.py` で先に落としておくこと。
 * 落とさずに撮ると全員が同じ1枚になって、ばらつきを数えても意味が無い。
 */
import { chromium } from "playwright-core";
import { offline } from "./route.mjs";
import { apply } from "./asme.mjs";
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";

const SPORT = process.env.SPORT || "4502";
const PAGES = (process.env.PAGES || "/index.html,/friends.html,/island/nordic.html").split(",");
const AV = "/tmp/avatars";

/** 元の絵の中で、描かれている部分がどこか。`charbox.py` が測って置いていく。 */
const box = JSON.parse(readFileSync(`${AV}/box.json`, "utf8"));
const inkBox = new Map(
  Object.entries(box).map(([k, [x, y, w, h, ar]]) => [k, { x0: x, y0: y, fw: w, fh: h, ar }]),
);

/**
 * 器の中で、絵の**描かれた部分**が画面のどこに来るか。
 *
 * contain / meet なら収まる最大の相似形、cover / slice なら覆う最小、
 * `none` は枠そのまま。`transform` は `getBoundingClientRect` に既に
 * 入っているので、ここでは見なくてよい。
 */
function drawn(f, ink) {
  const cover = f.fit.includes("slice") || f.fit === "cover";
  const none = f.fit === "none" || f.fit === "fill";
  const kx = f.w, ky = f.h / ink.ar; // 枠の幅を1としたときの尺度
  const fw = none ? f.w : cover ? Math.max(kx, ky) : Math.min(kx, ky);
  const fh = none ? f.h : fw / ink.ar;
  const dw = ink.fw * fw, dh = ink.fh * fh;
  // 枠の左上（object-position は中央、下ぞろえのものだけ下端に合わせる）
  const bottom = f.fit.includes("YMax") || f.fit.includes("bottom");
  const fx = f.x + (f.w - fw) / 2;
  const fy = bottom ? f.y + f.h - fh : f.y + (f.h - fh) / 2;
  const L = fx + ink.x0 * fw, T = fy + ink.y0 * fh;
  return { L, T, R: L + dw, B: T + dh, dw, dh };
}

const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox"] });

/* ───────── 看板の右はし（1人ぶんしか出ないところ） ───────── */
if (process.env.ME === "1") {
  const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
  const PAGE = process.env.MEPAGE || "/board.html";
  const OUT = "/tmp/hdrfit";
  mkdirSync(OUT, { recursive: true });
  /* 誰の絵があるかは名簿だけが持っている。**ここで並べ直さない**
     （`docs/island-misses.md` 決めごと3）。 */
  const src = readFileSync(`${ROOT}/site/content/residents.ts`, "utf8");
  const folk = [...src.matchAll(/icon:\s*"([^"]+)"[^}]*channel:\s*"([^"]+)"/g)]
    .map((m) => ({ icon: m[1], channel: m[2] }));

  const shots = [];
  let cut = 0;
  for (const [i, who] of folk.entries()) {
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3 });
    await apply(ctx, { channel: who.channel });
    await offline(ctx);
    const p = await ctx.newPage();
    await p.goto(`http://localhost:${SPORT}${PAGE}`, { waitUntil: "load", timeout: 60000 });
    await p.waitForFunction(
      () => {
        const im = document.querySelector(".ih-me img");
        return !!im && im.complete && im.naturalWidth > 0;
      },
      { timeout: 20000 },
    ).catch(() => {});
    await p.waitForTimeout(400);
    const m = await p.evaluate(() => {
      const a = document.querySelector(".ih-me");
      const im = a?.querySelector("img");
      if (!a || !im) return null;
      const ra = a.getBoundingClientRect(), ri = im.getBoundingClientRect();
      const cs = getComputedStyle(im), ca = getComputedStyle(a);
      const sm = /googleusercontent\.com\/d\/([^=?/]+)/.exec(im.getAttribute("src") || "");
      return {
        id: sm ? sm[1] : "",
        fit: cs.objectFit,
        x: ri.x, y: ri.y, w: ri.width, h: ri.height,
        bx: ra.x, by: ra.y, bw: ra.width, bh: ra.height,
        round: ca.borderRadius,
        字: a.querySelector(".ih-me-i") ? getComputedStyle(a.querySelector(".ih-me-i")).visibility : "無し",
      };
    });
    if (!m || !m.id) { console.log(`  ${i + 1}人目 看板に絵が出ていない`); await ctx.close(); continue; }
    const ink = inkBox.get(m.id);
    const d = ink ? drawn(m, ink) : null;
    /* 丸で切られた画素があるか。**切るのを外して撮り直し、絵が変わるかで見る。**
       矩形で測ると、円の外・器の中にある画素が「切れていない」と出る。 */
    const clip = { x: m.bx - 6, y: m.by - 6, width: m.bw + 12, height: m.bh + 12 };
    const a1 = await p.screenshot({ clip });
    await p.evaluate(() => {
      const a = document.querySelector(".ih-me");
      if (a) a.style.overflow = "visible";
    });
    const a2 = await p.screenshot({ clip });
    const clipped = !a1.equals(a2);
    if (clipped) cut++;
    writeFileSync(`${OUT}/${String(i + 1).padStart(2, "0")}-${m.id}.png`, a1);
    /* じぶんのこと（`/me`）の、島のキャラクター。**看板と同じ人の絵**なので
       ついでに測る。ここも1人ぶんしか出ないので、一覧では数えられない。 */
    let mh = 0;
    await p.goto(`http://localhost:${SPORT}/me.html`, { waitUntil: "load", timeout: 60000 }).catch(() => {});
    await p.waitForFunction(
      () => {
        const im = document.querySelector(".mh-chara");
        return !!im && im.complete && im.naturalWidth > 0;
      },
      { timeout: 20000 },
    ).catch(() => {});
    const mm = await p.evaluate(() => {
      const im = document.querySelector(".mh-chara");
      if (!im) return null;
      const r = im.getBoundingClientRect();
      const sm = /googleusercontent\.com\/d\/([^=?/]+)/.exec(im.getAttribute("src") || "");
      return { id: sm ? sm[1] : "", fit: getComputedStyle(im).objectFit + " " + getComputedStyle(im).objectPosition,
        x: r.x, y: r.y, w: r.width, h: r.height };
    });
    if (mm && inkBox.has(mm.id)) {
      const dd = drawn(mm, inkBox.get(mm.id));
      mh = Math.sqrt(dd.dw * dd.dh);
    }
    shots.push({ n: i + 1, id: m.id, size: d ? Math.sqrt(d.dw * d.dh) : 0, mh, clipped, png: a1.toString("base64"), 字: m.字 });
    await ctx.close();
  }
  /* キャラクターの無い人（あやと）の、YouTube の顔写真。
     **こちらは丸で切るのが正しい。** 一度「切らない」に揃えたら、
     あやとから「円の中に正方形になっちゃってる」（2026-09-10）。
     不透明な真四角を縮めて丸に入れると、四角が浮いて見える。
     不透明な絵を丸に入れる方法は、丸で切り抜く以外に無い。

     つまりここは**切れているのが合格**。判定の向きを、いまの目的に合わせる
     （`docs/island-standards.md` 4・13）。見るのは「四角が見えていないか」で、
     真四角の絵を差し込んで、**丸の外にはみ出していないこと**を確かめる。 */
  const FACE = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200">
    <rect width="200" height="200" fill="#2f6f8f"/>
    <circle cx="100" cy="104" r="82" fill="#f0c9a4"/>
    <circle cx="72" cy="92" r="10" fill="#2b2118"/><circle cx="128" cy="92" r="10" fill="#2b2118"/>
    <path d="M64 132 q36 30 72 0" stroke="#2b2118" stroke-width="9" fill="none" stroke-linecap="round"/>
    <text x="100" y="192" font-size="22" text-anchor="middle" fill="#ffffff">かお</text></svg>`;
  for (const [tag, square] of [["あやとの顔写真", false], ["真四角の顔写真", true]]) {
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3 });
    await apply(ctx, { nochara: true });
    await offline(ctx);
    // **あとから登録した route が先に効く。** offline の後に書かないと差し替わらない
    if (square) {
      await ctx.route(/ggpht\.com|googleusercontent\.com\/ytc/, (r) =>
        r.fulfill({ status: 200, contentType: "image/svg+xml", body: FACE }));
    }
    const p = await ctx.newPage();
    await p.goto(`http://localhost:${SPORT}${PAGE}`, { waitUntil: "load", timeout: 60000 });
    await p.waitForFunction(
      () => {
        const im = document.querySelector(".ih-me img");
        return !!im && im.complete && im.naturalWidth > 0;
      },
      { timeout: 20000 },
    ).catch(() => {});
    await p.waitForTimeout(400);
    const r = await p.evaluate(() => {
      const a = document.querySelector(".ih-me");
      const im = a?.querySelector("img");
      const b = a?.getBoundingClientRect();
      return a ? { x: b.x, y: b.y, w: b.width, h: b.height, 絵: im ? (im.naturalWidth > 0 ? "出ている" : "落ちた") : "無し" } : null;
    });
    if (r) {
      const clip = { x: r.x - 6, y: r.y - 6, width: r.w + 12, height: r.h + 12 };
      const a1 = await p.screenshot({ clip });
      await p.evaluate(() => {
        const a = document.querySelector(".ih-me");
        if (a) a.style.overflow = "visible";
      });
      const a2 = await p.screenshot({ clip });
      const clipped = !a1.equals(a2);
      if (clipped) cut++;
      writeFileSync(`${OUT}/00-${square ? "square" : "youtube"}.png`, a1);
      shots.push({ n: 0, id: tag, size: 0, clipped, png: a1.toString("base64"), 字: r.絵 });
    }
    await ctx.close();
  }

  const sizes = shots.filter((x) => x.size > 0).map((x) => x.size).sort((x, y) => x - y);
  const lo = sizes[0], hi = sizes[sizes.length - 1];
  for (const x of shots) {
    /* 顔写真（`n` を持たない行）は、丸で切るのが正しい。
       キャラクターだけ「切れている」を失点として出す。 */
    const ok = x.n ? (x.clipped ? "★切れている" : "収まっている") : (x.clipped ? "丸に満ちている" : "★四角が見えている");
    console.log(`   ${String(x.n || "顔").padStart(2)}  ${x.size ? x.size.toFixed(1).padStart(5) + "px" : "     －"}  ${ok}  ${x.id}`);
  }
  /* 失点は**キャラクターの切れ**だけ。顔写真の切れは正しい姿なので数えない */
  const cutChara = shots.filter((x) => x.n && x.clipped).length;
  const sqPhoto = shots.filter((x) => !x.n && !x.clipped).length;
  console.log(`\n看板  ${shots.filter((x) => x.size > 0).length}人  描かれた大きさ ${lo.toFixed(1)}〜${hi.toFixed(1)}px  ばらつき ${(hi / lo).toFixed(2)}倍  キャラクターの切れ ${cutChara}人  顔写真に四角が見えている ${sqPhoto}件`);
  const ms = shots.filter((x) => x.mh > 0).map((x) => x.mh).sort((x, y) => x - y);
  if (ms.length) {
    console.log(`じぶんのこと（.mh-chara）  ${ms.length}人  描かれた大きさ ${ms[0].toFixed(1)}〜${ms[ms.length - 1].toFixed(1)}px  ばらつき ${(ms[ms.length - 1] / ms[0]).toFixed(2)}倍`);
  }

  /* 並べた1枚。**作って終わりにしない。開いて見る。** */
  const sheet = await b.newContext({ viewport: { width: 1180, height: 900 }, deviceScaleFactor: 2 });
  const sp = await sheet.newPage();
  await sp.setContent(`<style>
    body { margin:0; padding:18px; background:#efe6cf; font:13px/1.4 sans-serif; color:#3a3222; }
    .g { display:grid; grid-template-columns:repeat(6,1fr); gap:12px; }
    figure { margin:0; display:grid; justify-items:center; gap:4px; }
    img { width:132px; height:132px; image-rendering:auto; }
    b { font-weight:700; }
    em { font-style:normal; color:#8a2f1f; }
  </style><div class="g">${shots
    .map(
      (x) => `<figure><img src="data:image/png;base64,${x.png}"><b>${x.n === 0 ? x.id : x.n + "人目"}</b>` +
        `<span>${x.size ? x.size.toFixed(1) + "px" : ""}${x.clipped ? " <em>切れ</em>" : ""}</span></figure>`,
    )
    .join("")}</div>`);
  await sp.waitForTimeout(300);
  await sp.screenshot({ path: `${OUT}/sheet.png`, fullPage: true });
  console.log(`      並べた1枚 → ${OUT}/sheet.png`);
  await b.close();
  process.exit(0);
}

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
    const { L, T, R, B, dw, dh } = drawn(f, ink);
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
