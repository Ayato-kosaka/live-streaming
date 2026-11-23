/**
 * **下書きの企画が、どの面からも引かれていないか。印を外せば出るか。**（M-33・`docs/adr/0018-upcoming-project-page.md`）
 *
 *     node site/selftest/draftproject_selftest.mjs
 *
 * 終了コード 0=通った / 1=下書きの企画がどこかに出ている（か、印を外しても出ない） / 2=数えるものが無い。
 *
 * ## なぜ要るか
 *
 * 企画の表（`content/projects.ts`）は、表紙の「これから」・便り・掲示板・伝説の丘・カードの日・札・島の上・
 * 索引・`/all`・llms.txt が読む。**足した時点で、ぜんぶに出る**。インド屋台飯100食（#1404）は
 * 「まだ動線をつなげるのは待ってほしい」（あやと 2026-11-23）ので、面は建てるが、どこからも引かない。
 *
 * 引く所ごとに印を見る作りにすると、引く所が増えた日に1か所だけ見落とす。だから下書きの行は、島じゅうが読む `PROJECTS` ではなく
 * `content/projectDrafts.ts` の `DRAFT_PROJECTS` に置き、下書きまで読むのは面の名簿と面だけにした（`PROJECT_ROWS`・`BOOK_PROJECTS`）。
 * 企画の表は client の束にも入るので、下書きの行をあちらに置くと、出す前の企画の名前が全部の面の JS に乗る（5 で見る）。
 * ここは、その形が崩れていないかを**本物の口で**見る。
 *
 * ## 何を見ているか
 *
 *  1. 分母: 表に下書きの企画が在る（無ければ 2。0件で緑にしない）
 *  2. 下書きの企画が、次のどこにも出ない（本物の表のまま）
 *     島じゅうの企画（`PROJECTS`）・表紙の「これから」と便り（`AHEAD`・`upNext`・`aheadOn`）・伝説の丘と島の上と掲示板と表紙の棚
 *     （`LEGENDS`・`legendsOf`）・カードの日（`DAY_BRIEFS`）・お題（`THEMES`）・索引と `/all`（`listedPages`）・llms.txt
 *  3. 面は在る: 面の一覧（`pagesOf("/legends/<企画>")`）に、索引に出さない面として並ぶ。面の `robots` は `index: false`
 *  5. 企画の表（client の束に入る `content/projects.ts`）に、下書きの企画の名前が1字も無い
 *  4. **対照**——同じ表の写しで、出す日の手順（`draft: true` を消して、行を `PROJECTS` へ移す）をして組み直すと、
 *     表紙の「これから」・便り・索引・llms.txt に出て、`robots` が外れる（「何も見ていない緑」でないこと。`docs/island-standards.md` §15）。
 *     **下書きの企画ごとに**組み直す。始まる日の決まっていない企画（M-30。`content/projects.ts` の `UndatedProject`）は、
 *     便り（その日の企画）には出ず、表紙の「これから」で日のある企画のあとに並ぶ
 *
 * 壊しかたは `--hint`。
 */
import { cpSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import Module, { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, sep } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const SITE = join(HERE, "..");
const TSC = join(SITE, "node_modules", ".bin", "tsc");
/** 組み立てる企画の表と下書きの並び。**落ちることを確かめる写しだけ、ここを差し替える** */
const PROJECTS_SRC = process.env.PROJECTS_TS || join(SITE, "content", "projects.ts");
const DRAFTS_SRC = process.env.DRAFTS_TS || join(SITE, "content", "projectDrafts.ts");

const BREAK_HINT = `わざと壊して、ここが落ちることを見るには:

  # 1) 表紙の「これから」が下書きまで読む（PROJECTS ではなく PROJECT_ROWS を引く）→ 2 が落ちる（PROJECT_ROWS は content/projectDrafts.ts から）
  cp site/lib/leadPlan.ts /tmp/lead.keep.ts
  sed -i 's|...PROJECTS.map(ofProject)|...PROJECT_ROWS.map(ofProject)|; 1i import { PROJECT_ROWS } from "@/content/projectDrafts";' site/lib/leadPlan.ts
  node site/selftest/draftproject_selftest.mjs; cp /tmp/lead.keep.ts site/lib/leadPlan.ts

  # 2) 面の名簿が面の印を読まない → 3 と 4 が落ちる
  sed 's|...BOOK_PROJECTS.map|...[].map|' site/lib/pages.ts > /tmp/pages.ts && cp site/lib/pages.ts /tmp/pages.keep.ts && cp /tmp/pages.ts site/lib/pages.ts
  node site/selftest/draftproject_selftest.mjs; cp /tmp/pages.keep.ts site/lib/pages.ts`;

if (process.argv.includes("--hint")) {
  console.log(BREAK_HINT);
  process.exit(0);
}

function stop(why) {
  console.log(`\n数えるものが無い: ${why}`);
  process.exit(2);
}

/** 置き場の写しを作って組み立てる。企画の表と下書きの並びだけ、渡した字に差し替える */
function build(projectsSrc, draftsSrc) {
  const work = mkdtempSync(join(tmpdir(), "draftproject-"));
  process.on("exit", () => rmSync(work, { recursive: true, force: true }));
  for (const d of ["content", "lib", "components", "app"]) cpSync(join(SITE, d), join(work, d), { recursive: true });
  symlinkSync(join(SITE, "node_modules"), join(work, "node_modules"));
  writeFileSync(join(work, "content", "projects.ts"), projectsSrc);
  writeFileSync(join(work, "content", "projectDrafts.ts"), draftsSrc);
  const out = join(work, "out");
  writeFileSync(
    join(work, "tsconfig.json"),
    JSON.stringify({
      compilerOptions: {
        target: "ES2022",
        lib: ["dom", "dom.iterable", "ES2022"],
        module: "commonjs",
        moduleResolution: "node",
        esModuleInterop: true,
        resolveJsonModule: true,
        skipLibCheck: true,
        /* 型の粗さは `npx tsc --noEmit` が見る。ここで欲しいのは動く JS だけ */
        strict: false,
        jsx: "react-jsx",
        noEmitOnError: false,
        outDir: out,
        rootDir: work,
        baseUrl: work,
        paths: { "@/*": ["./*"] },
      },
      files: [
        "lib/leadPlan.ts",
        "lib/pages.ts",
        "lib/cardDays.ts",
        "content/legends.ts",
        "content/legends/index.ts",
        "content/themes.ts",
        "components/isle/spec.ts",
        "app/llms.txt/route.ts",
      ].map((f) => join(work, f)),
    }),
  );
  try {
    execFileSync(TSC, ["-p", join(work, "tsconfig.json")], { stdio: "pipe" });
  } catch {
    /* 型の文句で 1 を返しても、JS は書き出されている（`tags_selftest.mjs` と同じ） */
  }
  return out;
}

const orig = Module._resolveFilename;
const OUTS = [];
Module._resolveFilename = function (request, parent, ...rest) {
  const out = OUTS.find((o) => parent?.filename?.startsWith(o + sep));
  if (out && request.startsWith("@/")) return orig.call(this, join(out, request.slice(2)), parent, ...rest);
  return orig.call(this, request, parent, ...rest);
};
const req = createRequire(import.meta.url);

/** 組み立てたものから、引く口を全部読む */
function load(out) {
  OUTS.push(out);
  const r = (p) => req(join(out, p));
  try {
    return {
      P: { ...r("content/projects.js"), ...r("content/projectDrafts.js") },
      L: r("lib/leadPlan.js"),
      G: r("lib/pages.js"),
      D: r("lib/cardDays.js"),
      LG: r("content/legends.js"),
      B: r("content/legends/index.js"),
      T: r("content/themes.js"),
      I: r("components/isle/spec.js"),
      C: r("content/chapters.js"),
      llms: r("app/llms.txt/route.js"),
    };
  } catch (e) {
    stop(`組み立てて読めない: ${String(e?.message ?? e).split("\n")[0]}`);
  }
}

let BAD = 0;
let OK = 0;
function check(name, good, why = "") {
  if (good) {
    OK++;
    console.log(`  ok   ${name}`);
    return;
  }
  BAD++;
  console.log(`  NG   ${name}${why ? ` — ${why}` : ""}`);
  console.log(`::error::${name}${why ? ` — ${why}` : ""}`);
}

/** 便りと表紙を見る日。下書きの企画の日より前（「これから」に出るはずの日）で、本番の今日に依らない */
const BEFORE = new Date(Date.UTC(2026, 11, 1, 3, 0, 0));

/** 1つの組み立てについて、その企画がどこに出ているかを数える */
async function where(m, slug) {
  const path = `/legends/${slug}`;
  const at = [];
  if (m.P.PROJECTS.some((p) => p.slug === slug)) at.push("島じゅうの企画（PROJECTS）");
  if (m.L.AHEAD.some((a) => a.id === slug)) at.push("これからの元（AHEAD）");
  if (m.L.upNext(BEFORE).plans.some((a) => a.id === slug)) at.push("表紙の「これから」（upNext）");
  const row = m.P.PROJECT_ROWS.find((p) => p.slug === slug);
  if (row?.date && m.L.aheadOn(row.date).some((a) => a.id === slug)) at.push("その日の便り（aheadOn）");
  /* 日の決まっていない企画（M-30）は、どの日の便りにも来ないはず。来ていれば出ている所に数える */
  const aheadDays = [...new Set(m.L.AHEAD.map((a) => a.date).filter(Boolean))];
  if (!row?.date && aheadDays.some((d) => m.L.aheadOn(d).some((a) => a.id === slug))) at.push("どこかの日の便り（aheadOn）");
  if (m.LG.LEGENDS.some((l) => l.slug === slug)) at.push("伝説の丘・島の上・表紙の棚（LEGENDS）");
  if (m.C.CHAPTERS.some((c) => m.I.legendsOf(c, BEFORE).some((l) => l.slug === slug))) at.push("島の上（legendsOf）");
  const days = Object.values(m.D.DAY_BRIEFS.byDay ?? {}).flat();
  if (days.some((d) => d?.href === path)) at.push("カードの日（DAY_BRIEFS）");
  if (m.T.THEMES.some((t) => t.project === slug)) at.push("お題（THEMES）");
  if (m.G.listedPages().some((p) => p.path === path)) at.push("索引と /all（listedPages）");
  const txt = await (await m.llms.GET()).text();
  if (txt.includes(path)) at.push("llms.txt");
  return at;
}

// ------------------------------------------------------------------ 本物の表
const realSrc = readFileSync(PROJECTS_SRC, "utf8");
const draftSrc = readFileSync(DRAFTS_SRC, "utf8");
const real = load(build(realSrc, draftSrc));
const drafts = real.P.PROJECT_ROWS.filter((p) => p.draft);
console.log(`# 組み立てた企画の表: ${PROJECTS_SRC}（下書き: ${DRAFTS_SRC}）`);
console.log(`# 企画の行 ${real.P.PROJECT_ROWS.length}・うち下書き ${drafts.length}（${drafts.map((p) => p.slug).join(", ")}）`);
if (!drafts.length) stop("下書きの企画が1つも無い（無いなら、この見張りは何も見ていない）");

console.log("[1-3] 本物の表: 下書きの企画はどこにも出ず、面だけが在る");
for (const p of drafts) {
  const at = await where(real, p.slug);
  check(`${p.slug} がどの面からも引かれていない`, at.length === 0, `出ている所: ${at.join("・")}`);
  const pg = real.G.pagesOf("/legends/<企画>").find((x) => x.path === `/legends/${p.slug}`);
  check(`${p.slug} の面は在る（面の一覧に、索引に出さない面として）`, !!pg && pg.unlisted === true, pg ? `unlisted=${pg.unlisted}` : "面の一覧に無い");
  const robots = real.B.bookRobots(p.slug);
  check(`${p.slug} の面は検索に出さない（robots の index が false）`, robots?.index === false, JSON.stringify(robots));
  check(`${p.slug} の名前が、client の束に入る企画の表に無い`, !realSrc.includes(p.slug) && !realSrc.includes(p.title), "content/projects.ts に字が在る");
}

// ------------------------------------------------------------------ 対照
console.log("[4] 対照: 出す日の手順（印を消して、行を PROJECTS へ移す）をした写しでは、出る側へ倒れる（下書きの企画ごと）");
const head = "export const PROJECTS: Project[] = [";
for (const d of drafts) {
  const slug = d.slug;
  /* その行（`{ … slug: "<slug>" … }`）を下書きの並びから切り出し、印を消して、企画の表の頭へ移す（ほかの行に触らない） */
  const at = draftSrc.indexOf(`slug: "${slug}"`);
  const begin = draftSrc.lastIndexOf("{", at);
  const end = draftSrc.indexOf("}", at) + 1;
  const row = draftSrc.slice(begin, end);
  if (at < 0 || !/\n\s*draft: true,/.test(row) || !realSrc.includes(head)) stop(`写しが作れない（${slug} の行か、PROJECTS の頭が見つからない）`);
  const openDrafts = draftSrc.slice(0, begin) + draftSrc.slice(end).replace(/^,/, "");
  const openSrc = realSrc.replace(head, `${head}\n  ${row.replace(/\n\s*draft: true,/, "")},`);
  const open = load(build(openSrc, openDrafts));
  const shown = await where(open, slug);
  /* 始まる日の決まっていない企画（M-30）は、その日の便りを持たない（どの日にも来ない） */
  const dated = !!d.date;
  const wants = ["島じゅうの企画（PROJECTS）", "表紙の「これから」（upNext）", ...(dated ? ["その日の便り（aheadOn）"] : []), "索引と /all（listedPages）", "llms.txt"];
  for (const want of wants) {
    check(`${slug}: 印を外すと ${want} に出る`, shown.includes(want), `出た所: ${shown.join("・") || "どこにも"}`);
  }
  const plans = open.L.upNext(BEFORE).plans;
  const lead = plans.find((a) => a.id === slug);
  check(`${slug}: 印を外すと、表紙の「これから」から面へ送る`, lead?.href === `/legends/${slug}`, lead?.href);
  if (!dated) {
    const i = plans.findIndex((a) => a.id === slug);
    const lastDated = plans.reduce((n, a, k) => (a.date ? k : n), -1);
    check(`${slug}: 日の決まっていない企画は、表紙の「これから」で日のある企画のあとに並ぶ（M-30）`, i > lastDated, `並び ${i}・日のある最後 ${lastDated}`);
    check(`${slug}: 日の決まっていない企画は、どの日の便りにも出ない`, !shown.includes("どこかの日の便り（aheadOn）"), `出た所: ${shown.join("・")}`);
  }
  check(`${slug}: 印を外すと、面の robots が外れる`, open.B.bookRobots(slug) === undefined, JSON.stringify(open.B.bookRobots(slug)));
  check(`${slug}: 印を外しても、伝説の丘には並ばない（面の印は伝説の印ではない。M-8）`, !shown.includes("伝説の丘・島の上・表紙の棚（LEGENDS）"));
}

console.log(`\n${OK}件 ok / ${BAD}件 NG`);
process.exit(BAD ? 1 : 0);
