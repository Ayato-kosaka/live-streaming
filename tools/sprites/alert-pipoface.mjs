/**
 * 11月の城の貯金箱の**ピポの顔の幅**を、配信の実寸（PRISM の条件）で数え、前の版と並べる（#1078）。
 *
 *   cd tools/sprites
 *   node alert-pipoface.mjs --base http://127.0.0.1:4610 --old-base http://127.0.0.1:4611            # 今の版と前の版（PR #1090）
 *   node alert-pipoface.mjs --base ... --old-base ... --fills 0,60,120 --seconds 90                 # 溜まり具合ごと
 *
 * ## なぜ要るか
 *
 * あやと（2026-11-02）「ピポもうちょっと大きくしないと見えない」。合格の条件は「配信の実寸で、ピポの顔の幅が
 * 前の版の何倍になったかを数で出す（目安 1.5 倍以上）」。絵を見て「大きくなった」と言わずに数える。
 *
 * ## 数え方
 *
 * - `/alertbox/?preview=bank&theme=castle&fill=<%>` を PRISM の条件（`prism.mjs`。scale 0.5・箱 436×776）で開き、
 *   `--every` ms おきに `--seconds` 秒、**出ているピポの絵**（`/alert/themes/castle/pipo-*.png` の img のうち、
 *   見えていて（`checkVisibility`）、不透明が 0.5 より上のもの）の画面上の幅を取る
 * - 顔の幅 = 絵の画面上の幅 × （顔の幅 ÷ 絵の幅）。今の版は `castle.json` の `pipo.poses[*].face`、前の版は
 *   下の `OLD_FACES`（前の版の絵を `faces.py` と同じやり方で測った値。前の版の castle.json は顔を持っていない）
 * - 屋根ごしに顔を出しているときは、顔の一部が城の後ろに隠れていても、描いた顔の幅で数える
 * - **配信の px** は、CSS px × 1.39（PRISM 140%。ウィジェット 436 の箱が配信の 607px に出る。SKILL.md 1）。
 *   比（今 ÷ 前）は倍率に依らない
 * - 出す数: 溜まり具合ごとに、時間で均した顔の幅（ピポが見えているコマだけ）・ポーズごとの幅・見えていた割合と、
 *   今 ÷ 前 の比
 *
 * ## 12月から（`--theme christmas`）
 *
 * 12月の貯金箱（`season/bank/XmasBank.tsx`）は、ピポの絵に `data-pipo-face`（顔の幅 ÷ 絵の幅）を持たせてあるので、
 * それを読んで数える（城の castle.json も前の版も要らない）。前の版が無いので比ではなく、**顔の幅 ÷ 場面の幅**
 * （場面＝豚の 1.6 倍の四角）を出し、`--face-min`（例 0.13。決まりは 13.5%）を下回れば 1
 *
 *   node alert-pipoface.mjs --base ... --theme christmas --fills 0,60,120 --seconds 30 --face-min 0.13
 *
 * 終了コード: 0 = どの溜まり具合でも 今 ÷ 前 が `--min`（既定 1.5）以上（`--face-min` を渡したら、顔 ÷ 場面がそれ以上） /
 * 1 = 下回った / 2 = 測れなかった
 */
import { chromium } from "playwright-core";
import { chromePath } from "./chrome.mjs";
import { boxAt, prism, prismNote, PRISM_SCALE } from "./prism.mjs";

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] != null ? process.argv[i + 1] : fallback;
}
function die(msg) {
  console.error(msg);
  process.exit(2);
}

const base = arg("base", null)?.replace(/\/$/, "");
const oldBase = arg("old-base", null)?.replace(/\/$/, "");
if (!base) die("--base（今の版を静的に配っている先）が要る");
const fills = arg("fills", "60").split(",").map(Number);
const seconds = Number(arg("seconds", "90"));
const every = Number(arg("every", "250"));
const MIN = Number(arg("min", "1.5"));
const query = arg("query", "");
const theme = arg("theme", "castle");
const faceMin = arg("face-min", null) != null ? Number(arg("face-min")) : null;
/** CSS px → 配信の px（PRISM 140%） */
const STREAM = 1.39;

/**
 * 前の版（PR #1090）の絵の、顔の幅 ÷ 絵の幅。前の版の絵（git の 991d49b6）を、頭の黒い毛のふちからふちまで測った
 * （`pipo-peek` は上げた手が頭に掛かるので、頬のふちまでを手で決めた）
 */
const OLD_FACES = {
  "pipo-wait.png": 91 / 136,
  "pipo-peek.png": 72 / 162,
  "pipo-cheer.png": 86 / 156,
};

const exe = chromePath() ?? "/opt/pw-browsers/chromium";

async function measure(browser, root, fill) {
  const [W, H] = boxAt(PRISM_SCALE, [436, 776]);
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  try {
    await prism(ctx, { scale: PRISM_SCALE });
    await ctx.route("**/*", (r) => {
      const u = r.request().url();
      return u.startsWith(root) || u.startsWith("data:") || u.startsWith("blob:") ? r.continue() : r.abort();
    });
    const page = await ctx.newPage();
    const q = new URLSearchParams({ preview: "bank", theme, fill: String(fill) });
    for (const [k, v] of new URLSearchParams(query)) q.set(k, v);
    await page.goto(`${root}/alertbox/?${q}`, { waitUntil: "load", timeout: 30000 });
    // 顔の割合: 今の版は castle.json から、前の版は OLD_FACES
    const def = await page.evaluate(async () => {
      try {
        return await (await fetch("/alert/themes/castle/castle.json")).json();
      } catch {
        return null;
      }
    });
    const frac = { ...OLD_FACES };
    let isNew = theme !== "castle";
    if (theme === "castle" && def?.pipo?.poses) {
      isNew = true;
      for (const p of Object.values(def.pipo.poses)) frac[p.file] = (p.face[2] - p.face[0]) / p.size[0];
    }
    // 描かれ始めるまで待つ
    // 12月からは、ピポの絵が `data-pipo-face` を持つ（城は持たないので、置き場の名前で探す）
    const SEL = 'img[data-pipo-face], img[src*="/alert/themes/castle/pipo-"]';
    await page.waitForFunction((sel) => document.querySelectorAll(sel).length > 0, SEL, { timeout: 20000 });
    const samples = [];
    const t0 = Date.now();
    for (let i = 0; i * every < seconds * 1000; i++) {
      const wait = t0 + i * every - Date.now();
      if (wait > 0) await page.waitForTimeout(wait);
      const seen = await page.evaluate((sel) => {
        const out = [];
        for (const im of document.querySelectorAll(sel)) {
          if (im.checkVisibility && !im.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) continue;
          let o = 1;
          for (let e = im; e; e = e.parentElement) o *= Number(getComputedStyle(e).opacity);
          if (o < 0.5) continue;
          const r = im.getBoundingClientRect();
          if (r.width < 1) continue;
          const f = im.getAttribute("data-pipo-face");
          out.push({ file: im.src.split("/").pop().split("?")[0], w: r.width, frac: f != null ? Number(f) : null });
        }
        // 場面（豚の 1.6 倍の四角）の幅
        const host = document.querySelector("[data-xmas-bank], [data-castle-phase]");
        return { imgs: out, scene: host ? host.getBoundingClientRect().width : 0 };
      }, SEL);
      samples.push(seen);
    }
    return { samples, frac, isNew };
  } finally {
    await ctx.close();
  }
}

function summarize({ samples, frac }) {
  const per = new Map();
  let sum = 0;
  let n = 0;
  let scene = 0;
  for (const { imgs: s, scene: sw } of samples) {
    if (sw) scene = sw;
    // 1コマに2枚見えるのは、歩きの2枚が入れ替わる瞬間だけ。大きいほうを1つ数える
    let best = null;
    for (const v of s) {
      const f = v.frac ?? frac[v.file];
      if (f == null) continue;
      const face = v.w * f;
      if (!best || face > best.face) best = { file: v.file, face };
    }
    if (!best) continue;
    sum += best.face;
    n++;
    const e = per.get(best.file) ?? { n: 0, sum: 0 };
    e.n++;
    e.sum += best.face;
    per.set(best.file, e);
  }
  return { mean: n ? sum / n : 0, seen: n / samples.length, per, scene };
}

const px = (v) => `${v.toFixed(1)}px（配信 ${(v * STREAM).toFixed(1)}px）`;

async function main() {
  console.log(prismNote(false, PRISM_SCALE));
  console.log(`箱 436×776・Dimensions の幅 218。${every}ms おき ${seconds} 秒。顔の幅は CSS px（配信の px は ×${STREAM}、PRISM 140%）`);
  const browser = await chromium.launch({ executablePath: exe, args: ["--no-sandbox", "--no-proxy-server"] });
  let bad = 0;
  try {
    for (const fill of fills) {
      const runs = await Promise.all([measure(browser, base, fill), oldBase ? measure(browser, oldBase, fill) : null]);
      const [now, old] = runs.map((r) => (r ? summarize(r) : null));
      if (!runs[0].isNew) die(`${base} の castle.json に pipo.poses が無い（今の版ではない？）`);
      if (!now.mean) die(`ピポが1コマも見えなかった（${theme} ${query}）`);
      console.log(`\n■ 溜まり ${fill}%`);
      const line = (tag, s) => {
        console.log(`  ${tag}: 顔の幅 ${px(s.mean)}（ピポが見えていたコマ ${(s.seen * 100).toFixed(0)}%）`);
        for (const [f, e] of [...s.per].sort((a, b) => b[1].n - a[1].n))
          console.log(`      ${f.padEnd(22)} ${px(e.sum / e.n)}  ${((e.n / Math.max(1, s.per.size && [...s.per.values()].reduce((a, b) => a + b.n, 0))) * 100).toFixed(0)}%`);
      };
      line("今の版", now);
      if (now.scene) {
        const k = now.mean / now.scene;
        console.log(`  顔の幅 ÷ 場面の幅（${now.scene.toFixed(0)}px）= ${(k * 100).toFixed(1)}%${faceMin != null && k < faceMin ? `  ← ${(faceMin * 100).toFixed(1)}% に届かない` : ""}`);
        if (faceMin != null && (k < faceMin || !now.mean)) bad++;
      } else if (faceMin != null) die("場面（data-xmas-bank / data-castle-phase）が見つからない");
      if (old) {
        line("前の版", old);
        if (!old.mean) die(`前の版でピポが1コマも見えなかった（${oldBase}）`);
        const k = now.mean / old.mean;
        console.log(`  今 ÷ 前 = ${k.toFixed(2)} 倍${k < MIN ? `  ← ${MIN} 倍に届かない` : ""}`);
        if (k < MIN) bad++;
      }
    }
  } finally {
    await browser.close();
  }
  process.exit(bad ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
