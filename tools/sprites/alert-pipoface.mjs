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
 * 終了コード: 0 = どの溜まり具合でも 今 ÷ 前 が `--min`（既定 1.5）以上 / 1 = 下回った / 2 = 測れなかった
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
    const q = new URLSearchParams({ preview: "bank", theme: "castle", fill: String(fill) });
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
    let isNew = false;
    if (def?.pipo?.poses) {
      isNew = true;
      for (const p of Object.values(def.pipo.poses)) frac[p.file] = (p.face[2] - p.face[0]) / p.size[0];
    }
    // 描かれ始めるまで待つ
    await page.waitForFunction(() => document.querySelectorAll('img[src*="/alert/themes/castle/pipo-"]').length > 0, null, { timeout: 20000 });
    const samples = [];
    const t0 = Date.now();
    for (let i = 0; i * every < seconds * 1000; i++) {
      const wait = t0 + i * every - Date.now();
      if (wait > 0) await page.waitForTimeout(wait);
      const seen = await page.evaluate(() => {
        const out = [];
        for (const im of document.querySelectorAll('img[src*="/alert/themes/castle/pipo-"]')) {
          if (im.checkVisibility && !im.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) continue;
          let o = 1;
          for (let e = im; e; e = e.parentElement) o *= Number(getComputedStyle(e).opacity);
          if (o < 0.5) continue;
          const r = im.getBoundingClientRect();
          if (r.width < 1) continue;
          out.push({ file: im.src.split("/").pop().split("?")[0], w: r.width });
        }
        return out;
      });
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
  for (const s of samples) {
    // 1コマに2枚見えるのは、歩きの2枚が入れ替わる瞬間だけ。大きいほうを1つ数える
    let best = null;
    for (const v of s) {
      const f = frac[v.file];
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
  return { mean: n ? sum / n : 0, seen: n / samples.length, per };
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
      console.log(`\n■ 溜まり ${fill}%`);
      const line = (tag, s) => {
        console.log(`  ${tag}: 顔の幅 ${px(s.mean)}（ピポが見えていたコマ ${(s.seen * 100).toFixed(0)}%）`);
        for (const [f, e] of [...s.per].sort((a, b) => b[1].n - a[1].n))
          console.log(`      ${f.padEnd(22)} ${px(e.sum / e.n)}  ${((e.n / Math.max(1, s.per.size && [...s.per.values()].reduce((a, b) => a + b.n, 0))) * 100).toFixed(0)}%`);
      };
      line("今の版", now);
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
