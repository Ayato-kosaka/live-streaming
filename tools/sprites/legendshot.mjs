/**
 * **企画の面（`/legends/<企画>`）を、書き出したもので撮って置く。**（`heavy_watch.yml` の `legend`）
 *
 *   python3 -m http.server 4215 --directory site/.next-ci &
 *   DIST=site/.next-ci SPORT=4215 LEGEND=nomad-kitchen-car OUT=/tmp/legend-shots node tools/sprites/legendshot.mjs
 *   …  BEFORE=/tmp/legend/before node tools/sprites/legendshot.mjs   # 前の回の面の HTML（page.norm.html・meta.json の置き場）と比べる
 *   …  BREAK=nofold node tools/sprites/legendshot.mjs                 # 対照: 畳みを開かずに撮る（畳みのある面なら「開いていない畳み」で 1）
 *
 * 終了コード 0＝撮った / 1＝撮ったが約束の姿になっていない（開かない畳み・写らない節） / 2＝撮るものが無い（面が無い・開けない・節が1つも無い）。
 *
 * ## なぜ（2026-11-23）
 *
 * 企画の面（#1418 のキッチンカー・#1404 のインド）は、出す前に 390幅で撮って自分の目で見る（`docs/island-standards.md` の
 * 出す前のチェック）。作業箱では書き出しも撮影も回さない（§19）ので、Actions で撮って枝 `review-media/legend-<企画>` に置き、
 * 担当はそこから**1〜2枚ずつ**読む。街のガイドの `guidebook.mjs` は節の並びや窓を企画の面と違う形で決め打ちしているので、撮るだけの道具を分けた。
 *
 * ## 何を置くか（`OUT`）
 *
 * | ファイル | 何 |
 * | --- | --- |
 * | `00-first.png` | 開いてすぐの1画面（390×844。何も送らない） |
 * | `NN-<節>.png`（長い節は `NN-<節>-k.png`） | 390幅・倍率2。**畳みを全部開いた姿。** 節は `[data-gb]` の外側（`components/guidebook/parts.tsx` の `Sec`・目次・表紙） |
 * | `sim-<節>-k.png` | つまみ（`input[type=range]`・`role=slider`）のまとまり。**押す前の最初の姿** |
 * | `thumb240.png` | 表紙と地図（`public/legends/<企画>/manifest.json`。無ければ `cover.webp`・`map.webp`）を横 240px に縮めて縦に並べた1枚 |
 * | `page.html`・`page.norm.html` | 書き出した HTML と、束を読む `<script>`（構造化データは残す）・束の名前の指紋を落として1タグ1行にしたもの |
 * | `html-compare.txt`・`html-diff.txt` | `BEFORE` の `page.norm.html` と比べた1行と、違った行（直しの前後で HTML が変わってはいけない面を比べる） |
 * | `meta.json` | 企画・コミット・枝・撮ったもの・比べた相手 |
 *
 * ## 撮るための字を面に出さない
 *
 * 面に足すのは見え方を変えない CSS 1行（`content-visibility` を切る。畳みの中と画面の外も描かせる）と、畳みを開くことだけ。
 * 札・番号・枠は焼かない。3D は撮らない（`van3d.mjs` の仕事。WebGL の無いブラウザでは面が静止画のまま出る。その姿を撮る）。
 *
 * ## 見ないもの
 *
 * 横あふれ・JS の例外・リンク切れ（`crawl.mjs`）、押しどころ（`hitbox.mjs`）、字の濃さ（`inkpx.mjs`・`inkband.mjs`）は、
 * 同じ口でそれぞれの道具が見る。ここが落とすのは「約束の姿で撮れたか」だけ。**HTML が前の回と違っても落とさない**
 * （字を直した回は違って当たり前。違いを読むのは人。比べた1行は表に出る）。
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { fromRoot } from "./repo.mjs";

const W = 390;
const H = 844;
const DPR = 2;
/** 1枚に撮る節の高さの上限（CSS px）。これより長い節は `TILE` ずつ割る（倍率2で 3600px。1枚ずつ読める高さ） */
const ONE = 2400;
const TILE = 1800;
/** 1つの節から撮る枚数の上限。長い一覧で数十枚にならないように。撮らなかった高さは書いて残す */
const MAX_TILES = 8;
/** ブラウザから出てよい先。島の配り先と、面が直に読む借りた写真・動画の絵だけ（地図の埋め込みや外の口は止める） */
const ALLOW = /^https?:\/\/(?:127\.0\.0\.1|localhost)(?::\d+)?\/|^https:\/\/(?:upload\.wikimedia\.org|i\.ytimg\.com|lh3\.googleusercontent\.com)\//;
/** この道具が `OUT` に書く名前（撮り直すときに消すのはこれだけ） */
const MINE = /^(?:\d\d-[\w-]+\.png|sim-[\w-]+\.png|thumb240\.png|page(?:\.norm)?\.html|html-(?:compare|diff)\.txt|meta\.json)$/;

/**
 * 書き出した HTML を、**束が変わっても揺れない形**にする。
 *
 * 束の名前には中身の指紋が付き、`<script>` には束の目録（RSC）が入るので、面の字が1字も変わらなくても
 * ほかの面の直しで揺れる。比べたいのは読む人と検索が受け取る HTML なので、それを落とす。
 * 構造化データ（`application/ld+json`）は中身なので残す。1タグ1行にして、違った行を数えられるようにする。
 */
export function normHtml(html) {
  return html
    .replace(/<script\b(?![^>]*\btype=["']?application\/ld\+json)[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<link\b(?=[^>]*(?:\bas=["']?script\b|\brel=["']?modulepreload\b))[^>]*>/gi, "")
    .replace(/\/_next\/static\/[^"'\s)>,]+/g, "/_next/static/…")
    .replace(/>\s*</g, ">\n<");
}

/**
 * 前の回の `page.norm.html` と比べる。→ { line 表に出す1行, same, diff html-diff.txt の中身 }
 *
 * 行は**数で**比べる（並びの入れ替えは「並びだけ違う」）。違った行は先頭から40行ずつだけ書く。
 */
export function compareHtml(norm, dir) {
  const f = dir ? join(dir, "page.norm.html") : "";
  if (!f || !existsSync(f)) return { line: "前の回が無い（この回が、次に比べる相手になる）", same: null, diff: "" };
  const prev = readFileSync(f, "utf8");
  let who = "前の回";
  try {
    const m = JSON.parse(readFileSync(join(dir, "meta.json"), "utf8"));
    who = `前の回（${m.ref || "?"} ${String(m.sha || "").slice(0, 7) || "?"}）`;
  } catch {
    /* 印が無くても比べられる。誰の回かが書けないだけ */
  }
  if (prev === norm) return { line: `${who}と同じ`, same: true, diff: "" };
  const a = prev.split("\n");
  const b = norm.split("\n");
  const tally = (xs) => xs.reduce((m, x) => m.set(x, (m.get(x) || 0) + 1), new Map());
  const ta = tally(a);
  const tb = tally(b);
  const only = (x, y) => {
    const out = [];
    for (const [s, n] of x) for (let i = (y.get(s) || 0); i < n; i++) out.push(s);
    return out;
  };
  const gone = only(ta, tb);
  const added = only(tb, ta);
  const at = a.findIndex((s, i) => s !== b[i]);
  const line = gone.length || added.length
    ? `${who}と違う（消えた行 ${gone.length}・増えた行 ${added.length}。html-diff.txt）`
    : `${who}と行の並びだけ違う（html-diff.txt）`;
  const cut = (s) => (s.length > 200 ? `${s.slice(0, 199)}…` : s);
  const diff = [
    `# ${line}`,
    "",
    `最初に違う行: ${at + 1} 行目`,
    ...a.slice(Math.max(0, at - 2), at + 3).map((s) => `  前: ${cut(s)}`),
    ...b.slice(Math.max(0, at - 2), at + 3).map((s) => `  今: ${cut(s)}`),
    "",
    `## 消えた行（前の回にだけ在る。${gone.length}）`,
    ...gone.slice(0, 40).map((s) => `- ${cut(s)}`),
    "",
    `## 増えた行（この回にだけ在る。${added.length}）`,
    ...added.slice(0, 40).map((s) => `+ ${cut(s)}`),
    "",
  ].join("\n");
  return { line, same: false, diff };
}

/** ファイル名に使える形（節の id はそのまま使えるはずだが、念のため） */
const safe = (s) => String(s || "sec").replace(/[^a-z0-9_-]+/gi, "-").slice(0, 40) || "sec";
const nn = (i) => String(i).padStart(2, "0");

/** 表紙と地図の置き場（`content/legends/drawn.ts` と同じ読みかた。manifest の `src`、無ければ決まった名前） */
function drawnPics(dist, slug) {
  const base = `/legends/${slug}`;
  let man = {};
  try {
    man = JSON.parse(readFileSync(join(dist, base, "manifest.json"), "utf8")) || {};
  } catch {
    /* manifest が無い企画は、決まった名前だけ見る */
  }
  const out = [];
  for (const [slot, fallback] of [["cover", "cover.webp"], ["map", "map.webp"]]) {
    const src = typeof man?.[slot]?.src === "string" && man[slot].src.trim() ? man[slot].src.trim() : fallback;
    if (/^https?:/.test(src)) continue;
    const p = src.startsWith("/") ? src : `${base}/${src}`;
    if (existsSync(join(dist, p))) out.push([slot, p]);
  }
  return out;
}

/** 面を下まで送って、近づいてから読む絵（`loading=lazy`・`LateArt`）を読ませ、絵が揃うまで待つ */
async function settleAll(p) {
  await p.evaluate(async () => {
    for (let y = 0; y < document.documentElement.scrollHeight; y += 500) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 90));
    }
    window.scrollTo(0, 0);
  });
  await p.waitForLoadState("networkidle", { timeout: 20000 }).catch(() => {});
  await p.waitForFunction(() => [...document.images].every((i) => i.complete), null, { timeout: 20000 }).catch(() => {});
  await p.evaluate(() => document.fonts.ready);
  await p.waitForTimeout(400);
}

/** 要素の箱（面の頭からの位置。CSS px） */
const boxOf = (h) =>
  h.evaluate((e) => {
    const r = e.getBoundingClientRect();
    return { x: Math.max(0, r.left + window.scrollX), y: r.top + window.scrollY, w: r.width, h: r.height };
  });

/** 1つの要素を撮る。長ければ `TILE` ずつ割る。→ { files, h, cut 撮らなかった高さ } */
async function shoot(p, h, name, width) {
  await h.scrollIntoViewIfNeeded().catch(() => {});
  await p.waitForTimeout(250);
  const r = await boxOf(h);
  if (!(r.h > 0 && r.w > 0)) return { files: [], h: 0, cut: 0 };
  if (r.h <= ONE) {
    const f = `${name}.png`;
    await h.screenshot({ path: join(OUT, f) });
    return { files: [f], h: Math.round(r.h), cut: 0 };
  }
  const files = [];
  const n = Math.min(MAX_TILES, Math.ceil(r.h / TILE));
  for (let k = 0; k < n; k++) {
    const y = r.y + k * TILE;
    await p.evaluate((top) => window.scrollTo(0, top), Math.max(0, y - 40));
    await p.waitForTimeout(250);
    const f = `${name}-${k + 1}.png`;
    await p.screenshot({ path: join(OUT, f), fullPage: true, clip: { x: 0, y, width, height: Math.min(TILE, r.h - k * TILE) } });
    files.push(f);
  }
  return { files, h: Math.round(r.h), cut: Math.max(0, Math.round(r.h - n * TILE)) };
}

const SPORT = process.env.SPORT || "4215";
const ORIGIN = `http://127.0.0.1:${SPORT}`;
const LEGEND = process.env.LEGEND || "";
const OUT = fromRoot(process.env.OUT || "/tmp/legend-shots");
const BREAK = process.env.BREAK || "";

async function main() {
  const DIST = fromRoot(process.env.DIST || "site/.next-ci");
  const BEFORE = process.env.BEFORE ? fromRoot(process.env.BEFORE) : "";
  const EXE = process.env.CHROME || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(LEGEND)) {
    console.log("LEGEND= に企画の slug（例 nomad-kitchen-car）を渡す。**撮るものが決まらない**");
    return 2;
  }
  const path = `/legends/${LEGEND}`;
  const file = join(DIST, `${path}.html`);
  if (!existsSync(file)) {
    console.log(`書き出しに面が無い: ${file}（書き出しが落ちたか、面がまだ無い）`);
    return 2;
  }
  /* 前の回の絵を残さない（節の数が減った回に、前の節の絵が混ざって見える）。消すのはこの道具が書く名前だけ
     （置き場を取り違えて渡されても、ほかのファイルと下の置き場は消さない） */
  mkdirSync(OUT, { recursive: true });
  for (const f of readdirSync(OUT)) if (MINE.test(f)) rmSync(join(OUT, f), { force: true });

  // ---- 面の HTML（ブラウザは要らない）
  const html = readFileSync(file, "utf8");
  const norm = normHtml(html);
  writeFileSync(join(OUT, "page.html"), html);
  writeFileSync(join(OUT, "page.norm.html"), norm);
  const cmp = compareHtml(norm, BEFORE);
  writeFileSync(join(OUT, "html-compare.txt"), `${cmp.line}\n`);
  if (cmp.diff) writeFileSync(join(OUT, "html-diff.txt"), cmp.diff);
  console.log(`面の HTML: ${html.length}字（落とした形 ${norm.length}字）。${cmp.line}`);

  const { chromium } = await import("playwright-core");
  const { openFolds } = await import("./hitbox.mjs");
  const { openChecked } = await import("./served.mjs");
  const bad = [];
  const meta = {
    slug: LEGEND, page: path, sha: process.env.GITHUB_SHA || "", ref: process.env.GITHUB_REF_NAME || "",
    run: process.env.GITHUB_RUN_ID || "", at: new Date().toISOString(), width: W, dpr: DPR,
    html: { chars: html.length, norm: norm.length, compare: cmp.line, same: cmp.same },
    first: "", sections: [], sims: [], thumbs: [], folds: null, images: null, errors: 0,
  };
  const b = await chromium.launch({ executablePath: EXE, args: ["--no-sandbox"] });
  try {
    const ctx = await b.newContext({
      viewport: { width: W, height: H }, deviceScaleFactor: DPR, isMobile: true, hasTouch: true, reducedMotion: "reduce",
    });
    /* 止めた外の要求は、行き先ごとに数えて出す（止めたものが絵に写らないことを、数で残す。§24.3） */
    const stopped = new Map();
    await ctx.route(/^https?:\/\//, (r) => {
      const u = r.request().url();
      if (ALLOW.test(u)) return r.continue();
      const host = new URL(u).host;
      stopped.set(host, (stopped.get(host) || 0) + 1);
      return r.abort();
    });
    const p = await ctx.newPage();
    const errors = [];
    p.on("pageerror", (e) => errors.push(String(e?.message || e)));
    const got = await openChecked(p, ORIGIN, path, { waitUntil: "networkidle", timeout: 60000, tries: 3 });
    if (!got.ok) {
      console.log(`面が開けない: ${path}（${got.why}）`);
      return 2;
    }
    await p.evaluate(() => document.fonts.ready);
    await p.waitForTimeout(600);

    // ---- 開いてすぐの1画面（何も送らない・畳みも開かない）
    await p.screenshot({ path: join(OUT, "00-first.png") });
    meta.first = "00-first.png";

    // ---- 畳みを開いて、画面の外も描かせて、絵が揃うまで待つ
    await p.addStyleTag({ content: "*,*::before,*::after{content-visibility:visible!important}" });
    const folds = BREAK === "nofold"
      ? { opened: 0, stillClosed: await p.evaluate(() => document.querySelectorAll("details:not([open])").length), folds: -1 }
      : await openFolds(p);
    await settleAll(p);
    const closed = await p.evaluate(() => document.querySelectorAll("details:not([open])").length);
    meta.folds = { opened: folds.opened, stillClosed: closed };
    if (closed) bad.push(`開いていない畳みが ${closed}（撮った絵は「畳みを開いた姿」になっていない）${BREAK ? `（BREAK=${BREAK}）` : ""}`);
    meta.images = await p.evaluate(() => ({
      all: document.images.length,
      broken: [...document.images].filter((i) => i.complete && !i.naturalWidth).length,
    }));

    // ---- 節（[data-gb] のいちばん外側）
    const secs = await p.evaluateHandle(() => {
      const all = [...document.querySelectorAll("[data-gb]")];
      return all.filter((e) => !all.some((o) => o !== e && o.contains(e)));
    });
    const handles = [...(await secs.getProperties()).values()].map((v) => v.asElement()).filter(Boolean);
    if (!handles.length) {
      console.log(`節（[data-gb]）が1つも無い: ${path}。**撮るものが無い**`);
      return 2;
    }
    let i = 0;
    for (const h of handles) {
      i++;
      const id = (await h.getAttribute("data-gb")) || (await h.getAttribute("id")) || `sec${i}`;
      const s = await shoot(p, h, `${nn(i)}-${safe(id)}`, W);
      meta.sections.push({ n: i, id, h: s.h, files: s.files, cut: s.cut });
      if (!s.files.length) bad.push(`節「${id}」が写らない（高さ 0）`);
      console.log(`  ${nn(i)} ${id.padEnd(12)} 高さ ${String(s.h).padStart(5)}px  ${s.files.length}枚${s.cut ? `（下の ${s.cut}px は撮っていない）` : ""}`);
    }

    // ---- つまみのまとまり（押す前の最初の姿）
    const sims = await p.evaluateHandle(() => {
      const roots = [];
      for (const c of document.querySelectorAll('input[type="range"], [role="slider"]')) {
        const sec = c.closest("[data-gb]");
        let r = null;
        /* 答え（`output`・`aria-live`）とつまみを一緒に持つ、いちばん近いまとまり */
        for (let a = c.parentElement; a && a !== sec && a !== document.body; a = a.parentElement) {
          if (a.querySelector("output, [aria-live]")) {
            r = a;
            break;
          }
        }
        /* 無ければ、節のすぐ下のまとまり */
        if (!r) {
          r = c;
          while (r.parentElement && r.parentElement !== sec && r.parentElement !== document.body) r = r.parentElement;
        }
        if (!roots.includes(r)) roots.push(r);
      }
      return roots.filter((r) => !roots.some((o) => o !== r && o.contains(r)));
    });
    const simHandles = [...(await sims.getProperties()).values()].map((v) => v.asElement()).filter(Boolean);
    const perSec = new Map();
    for (const h of simHandles) {
      const sec = await h.evaluate((e) => e.closest("[data-gb]")?.getAttribute("data-gb") || "page");
      const k = (perSec.get(sec) || 0) + 1;
      perSec.set(sec, k);
      const s = await shoot(p, h, `sim-${safe(sec)}-${k}`, W);
      meta.sims.push({ sec, k, h: s.h, files: s.files });
      console.log(`  つまみ ${sec}-${k}  高さ ${s.h}px  ${s.files.length}枚`);
    }
    if (!simHandles.length) console.log("  つまみ（input[type=range]・role=slider）は、この面に無い");
    meta.errors = errors.length;
    meta.stopped = Object.fromEntries(stopped);
    await ctx.close();

    // ---- 表紙と地図を横 240px に（画像検索の一覧の大きさ。`python/guide_thumb.py` と同じ見かた。読めるかは人が見る）
    const pics = drawnPics(DIST, LEGEND);
    if (pics.length) {
      const tp = await b.newPage({ viewport: { width: 264, height: 200 }, deviceScaleFactor: 1 });
      const imgs = pics.map(([slot, s]) => `<img alt="${slot}" src="${ORIGIN}${s}" style="display:block;width:240px;height:auto;margin:0 0 12px">`).join("");
      await tp.setContent(`<!doctype html><html><body style="margin:12px;background:#fff">${imgs}</body></html>`);
      await tp.waitForFunction(() => [...document.images].every((x) => x.complete), null, { timeout: 20000 }).catch(() => {});
      await tp.screenshot({ path: join(OUT, "thumb240.png"), fullPage: true });
      meta.thumbs = pics.map(([slot, s]) => ({ slot, src: s }));
      await tp.close();
      console.log(`  240px: ${pics.map(([slot]) => slot).join("・")}（thumb240.png）`);
    } else {
      console.log("  240px: 表紙も地図もまだ無い（描いていない）");
    }
  } finally {
    await b.close();
  }

  writeFileSync(join(OUT, "meta.json"), `${JSON.stringify(meta, null, 1)}\n`);
  const shots = meta.sections.reduce((n, s) => n + s.files.length, 0);
  console.log(`\n── 撮ったもの（幅 ${W}px・倍率 ${DPR}）`);
  console.log(`  節 ${meta.sections.length}（${shots}枚）・つまみ ${meta.sims.length}・240px ${meta.thumbs.length}・開いた畳み ${meta.folds.opened}`);
  console.log(`  絵 ${meta.images.all}枚（壊れた絵 ${meta.images.broken}）・JS の例外 ${meta.errors}（合否は crawl.mjs）`);
  const st = Object.entries(meta.stopped || {});
  console.log(`  止めた外の要求 ${st.reduce((n, [, k]) => n + k, 0)}件${st.length ? `（${st.map(([h, k]) => `${h} ${k}`).join("・")}）` : ""}。絵には写っていない`);
  console.log(`  置き場 ${OUT}`);
  if (bad.length) {
    for (const x of bad) console.log(`  ✗ ${x}`);
    return 1;
  }
  return 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main()
    .then((c) => process.exit(c))
    .catch((e) => {
      console.error(e);
      process.exit(2);
    });
}
