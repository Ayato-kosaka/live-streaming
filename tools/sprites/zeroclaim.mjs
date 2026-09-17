/**
 * **「読めていない」を「0」と言い切っている場所**を、面ぜんぶから洗い出す。
 *
 *   DIST=site/.next-3230 SPORT=4230 node tools/sprites/zeroclaim.mjs
 *   BREAK=plain node tools/sprites/zeroclaim.mjs    # わざと壊す（対照が落ちる）
 *
 * ## やりかた
 *
 * `docs/island-standards.md` 10 が書いている確かめかたを、そのまま機械にした。
 *
 * > 確かめかたは、**API を落とした状態で撮って、0のときと並べて見比べる。**
 * > 見分けがつかなければ直っていない
 *
 * 面を **2回** 開く。
 *
 * 1. **口を落として**（`/island-api/*` を全部 abort）
 * 2. **口を通して**（curl で本番の返事を流し込む）
 *
 * どちらでも同じ「0◯」が出ているなら、その面は**読めなかった日に「0でした」と
 * 言い切っている。** 落としたときにだけ出るものも同じ（読めないから0に落ちた）。
 *
 * **口を通したときにだけ出る0を、「読めた上での0」として黙って通さない。**
 * 2026-09-17 の図鑑がまさにそれだった。`/friends` の「0日」は口が落ちていると
 * **出ない**（名簿ごと読めないので札が1枚も出ない）。口が通ったときにだけ、
 * 「名簿は読めた。でもこの人の日数は上位60人の外だった」が 0 になって出ていた。
 * **落とす／通すの2回だけでは、これは合格に見える。** so 数えて別枠で出す。
 * 落ちはしないが、**「0件」の横に必ず並べて、人が読む。**
 *
 * ## 数える前に対照を通す
 *
 * 「違反0件」は**見ていないから0件**かもしれない（§15）。だから、
 * 拾い手をいきなり面に当てない。まず作り物の札を7通り植えて、
 * **拾ってほしい5件を全部拾い、拾ってはいけない2件を拾わないこと**を見る。
 * 外したら**面の数字を1つも出さずに**終了コード2で落ちる。
 *
 * 終了コード: 0＝通った / 1＝落としても0と言う場所があった / 2＝数えるものが無い。
 */
import { chromium } from "playwright-core";
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { offline } from "./route.mjs";
import { openChecked, reportMissing } from "./served.mjs";
import { fromRoot } from "./repo.mjs";

const run = promisify(execFile);
const PROD = "https://live-streaming-d3cac.web.app";
const SPORT = process.env.SPORT || "4230";
const ORIGIN = `http://127.0.0.1:${SPORT}`;
const DIST = fromRoot(process.env.DIST || "site/.next-3230");
const WIDTH = parseInt(process.env.WIDTH || "390", 10);
/** わざと壊す。`plain`＝字の並びだけ見て、隠れているものを外さない */
const BREAK = process.env.BREAK || "";
const WAIT_MS = parseInt(process.env.WAIT_MS || "5000", 10);
/** 面を絞る（`ONLY=/friends.html`）。直す前と後を突き合わせるときに使う */
const ONLY = (process.env.ONLY || "").split(",").filter(Boolean);

/** 0と言い切っている字。**単位を持つものだけ。** 「0」単体は番号にも出る */
const UNITS = "人|日|件|枚|本|回|円|個|品|杯|kg|km|カ国|ヶ国|ポイント|pt";

/**
 * 面から「0◯」を拾う。**画面に出ているものだけ。**
 *
 * 渡すのは単位の並びと、わざと壊すときの名前。
 * 返すのは当たった字（`t`）と、どの要素だったか（`where`）の一覧。
 */
const PICK = (units, broken) => {
  const re = new RegExp(`(^|[^\\d.,])0\\s*(${units})(?![\\d])`);
  const out = [];
  const seen = new Set();
  const all = document.body ? [...document.body.querySelectorAll("*")] : [];
  /* **「葉だけ見る」にしない。** 図鑑の日数は `<b>0</b>日` で、数と単位が
     別の要素に割れている。葉（`<b>`）の字は「0」だけなので単位に当たらず、
     親（`<dd>`）は子に字があるので飛ばされて、**どこにも引っかからない。**
     対照がこれを捕まえた（`0枚（入れ子）` が拾えなかった）。
     当たった要素のうち、**中にもっと小さい当たりを持たないもの**だけ残す。 */
  const match = all.filter((el) => {
    const t = (el.textContent || "").replace(/\s+/g, " ").trim();
    return t && t.length <= 120 && re.test(t);
  });
  const inner = new Set(match);
  for (const el of match) {
    for (const o of match) {
      if (o !== el && el.contains(o)) {
        inner.delete(el);
        break;
      }
    }
  }
  for (const el of inner) {
    const t = (el.textContent || "").replace(/\s+/g, " ").trim();
    // 壊しかた `plain`: 見えているかを見ない（隠れている字まで数える）
    if (!broken) {
      if (!el.offsetParent && getComputedStyle(el).position !== "fixed") continue;
      const cs = getComputedStyle(el);
      if (cs.visibility === "hidden" || Number(cs.opacity) === 0) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) continue;
    }
    const where = (el.className && typeof el.className === "string" ? "." + el.className.split(" ")[0] : el.tagName.toLowerCase());
    const key = where + "|" + t;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ t: t.slice(0, 80), where });
  }
  return out;
};

/** 対照。**拾ってほしい5件と、拾ってはいけない2件。** 3つめが期待する字。 */
const CASES = [
  ["0人", `<p>きのうは0人でした</p>`, "きのうは0人でした", true],
  ["0日（数と単位が別の要素）", `<p><b>0</b>日そこにいた</p>`, "0日そこにいた", true],
  ["0件", `<span>のこり0件です</span>`, "のこり0件です", true],
  ["0枚（入れ子）", `<div><span>あと<b>0</b>枚だけ</span></div>`, "あと0枚だけ", true],
  ["0円", `<p>ぜんぶで0 円ぶん</p>`, "ぜんぶで0 円ぶん", true],
  ["隠れている0人", `<p style="display:none">かくれた0人ぶん</p>`, "かくれた0人ぶん", false],
  ["20人（0で終わる数）", `<p>ちょうど20人いた</p>`, "ちょうど20人いた", false],
];

function walk(d, base = "") {
  let out = [];
  for (const f of readdirSync(d)) {
    if (["_next", "cache", "server", "static"].includes(f)) continue;
    const p = join(d, f);
    if (statSync(p).isDirectory()) out = out.concat(walk(p, base + "/" + f));
    else if (f.endsWith(".html")) out.push(base + "/" + f);
  }
  return out;
}

const pages = walk(DIST)
  .sort()
  .filter((x) => !ONLY.length || ONLY.includes(x));
if (!pages.length) {
  console.log(`${DIST} に面が無い。先に書き出してください。`);
  process.exit(2);
}

const b = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--no-sandbox"],
});

/** ブラウザの文脈をひとつ。`down` が真なら口を落とす。 */
async function makeCtx(down) {
  const ctx = await b.newContext({ viewport: { width: WIDTH, height: 900 }, deviceScaleFactor: 1 });
  await ctx.route(/\/island-api\//, async (r) => {
    if (down) return r.abort();
    const u = new URL(r.request().url());
    try {
      const { stdout } = await run("curl", ["-fsS", "--max-time", "40", PROD + u.pathname + u.search], {
        maxBuffer: 1 << 28,
        encoding: "buffer",
      });
      await r.fulfill({ status: 200, contentType: "application/json", body: stdout });
    } catch {
      await r.abort().catch(() => {});
    }
  });
  await offline(ctx);
  return ctx;
}

/* 対照が先。落ちたら面の数字は出さない */
{
  const ctx = await makeCtx(true);
  const p = await ctx.newPage();
  await p.goto(`${ORIGIN}/404.html`).catch(() => {});
  const got = await p.evaluate(
    ({ cases, units, broken, src }) => {
      const pick = new Function("return " + src)();
      const out = [];
      for (const [name, html, want, wantHit] of cases) {
        const box = document.createElement("div");
        box.innerHTML = html;
        document.body.appendChild(box);
        const hit = pick(units, broken).some((x) => x.t.includes(want));
        box.remove();
        out.push({ name, want: wantHit, hit });
      }
      return out;
    },
    { cases: CASES, units: UNITS, broken: BREAK, src: PICK.toString() },
  );
  let bad = 0;
  console.log("── 対照（作り物の字を、拾い手が拾えるか／拾わずにいられるか）");
  for (const c of got) {
    const ok = c.hit === c.want;
    if (!ok) bad++;
    console.log(`  ${ok ? "○" : "×"} ${c.name}: ${c.want ? "拾ってほしい" : "拾ってはいけない"} / ${c.hit ? "拾った" : "拾わなかった"}`);
  }
  console.log(`  対照 ${got.length}件中 ${got.length - bad}件 一致`);
  await ctx.close();
  if (bad) {
    console.log(`対照が ${bad}件 外れた。**面の数字は出さない。**`);
    await b.close();
    process.exit(2);
  }
}

const miss = [];
const result = [];
for (const down of [true, false]) {
  const ctx = await makeCtx(down);
  const p = await ctx.newPage();
  for (const page of pages) {
    const o = await openChecked(p, ORIGIN, page, { miss });
    if (!o.ok) continue;
    await p.waitForTimeout(WAIT_MS);
    // 畳んだ中は数えない決まりだが、0と言う字は畳みの中にもある。開いてから拾う
    await p.evaluate(() => document.querySelectorAll("details").forEach((d) => (d.open = true)));
    await p.waitForTimeout(250);
    const hits = await p.evaluate(
      ({ units, broken, src }) => new Function("return " + src)()(units, broken),
      { units: UNITS, broken: BREAK, src: PICK.toString() },
    );
    result.push({ page, down, hits });
  }
  await ctx.close();
}
await b.close();

reportMissing(miss);

const byPage = new Map();
for (const r of result) {
  const e = byPage.get(r.page) || { down: [], up: [] };
  e[r.down ? "down" : "up"] = r.hits;
  byPage.set(r.page, e);
}

console.log(`\n── 洗い出し（${pages.length}面 × 口を落とす/通す の2回・幅 ${WIDTH}px）`);
let bad = 0;
let clean = 0;
/** 口を通したときだけ出る0。落としはしないが、**必ず人が読む** */
let look = 0;
for (const [page, e] of byPage) {
  if (!e.down.length && !e.up.length) {
    clean++;
    continue;
  }
  const upKeys = new Set(e.up.map((x) => x.where + "|" + x.t));
  console.log(`\n  ${page}`);
  for (const h of e.down) {
    const both = upKeys.has(h.where + "|" + h.t);
    bad++;
    console.log(`    × 落としても「${h.t}」（${h.where}）${both ? " ← 通しても同じ字" : " ← 落としたときだけ"}`);
  }
  const downKeys = new Set(e.down.map((x) => x.where + "|" + x.t));
  for (const h of e.up) {
    if (downKeys.has(h.where + "|" + h.t)) continue;
    look++;
    console.log(`    ? 通したときだけ「${h.t}」（${h.where}）← 読めた上での0か、口が返さなかっただけか`);
  }
}
console.log(`\n  0と言う字のなかった面: ${clean} / ${byPage.size}`);
console.log(`  落としても0と言う場所: ${bad}件`);
console.log(`  通したときだけ出る0（**目で読む**）: ${look}件`);
process.exit(bad ? 1 : process.exitCode || 0);
