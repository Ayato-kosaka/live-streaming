/**
 * 島の26面を一度に回して、**押しどころ 48px** と **字の濃さ 4.5** の合否を返す。
 *
 *   PORT=4150 node tools/sprites/tapink.mjs
 *   PORT=4150 ONLY=hit node tools/sprites/tapink.mjs     # 押しどころだけ
 *   PORT=4150 W=1000 node tools/sprites/tapink.mjs       # PC の幅で
 *
 * 終了コード: 0＝通った / 1＝見つかった / 2＝数えるものが無い。
 *
 * `docs/island-standards.md` の「出す前のチェック」は、この2つを**26面ぜんぶ**に
 * 求めている。ところが 2026-09-17 まで、`hitbox.mjs` は**2面・`SEL=.crumbs a`
 * だけ**、`inkpx.mjs` は**3面だけ**しか回っていなかった。手で回す道具のままだと、
 * 「どこまで測ったか」が人の記憶に残るだけで、次のセッションには残らない。
 *
 * ## 測り方は書かない。**2本を呼ぶ**
 *
 * ここには判定を1行も持たせない。`hitbox.mjs` `shotstable.mjs` `inkpx.mjs`
 * `inkband.mjs` を子として起こして、**終了コードだけを読む。** 同じ測り方を3か所目に書くと、直したときに
 * 直るのは1か所だけになる（`docs/island-misses.md` #83）。
 * 子は自分の対照（`hitboxfix/` 8件＋台1、`inkpxfix/` 14件）を先に通してから
 * 本物の面を測るので、**対照落ちは 2 としてそのまま上がってくる。**
 *
 * ## この走らせ役にも対照が要る
 *
 * 子の合否を読み違えたら、26面ぜんぶが「緑」になる。だから本物を測る前に、
 * **わざと落ちる子を1本ずつ起こして、2 が返ってくることを見る**
 * （`hitbox` に `BREAK=allsmall`、`inkpx` に `BREAK=nolim`）。
 * ここで 0 が返ったら、この走らせ役は数字を1つも出さずに 2 で落ちる。
 * あわせて、子が「対照 N件中 N件 一致」を**印字したこと**も見る。
 * 印字が無いのは、対照を通らずに数字だけ出てきたということ。
 *
 * ## 分母を出す
 *
 * 「48px 割れ 0」「4.5 割れ 0」だけを読まない（`docs/island-standards.md` §15）。
 * **何面・何か所を見てそのうち0件か**を、子から拾って並べる。
 * 見た面が 26 に足りなければ、割れ0 は合格ではない。
 */
import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PUBLIC_PAGES, ME_PAGES, PAGES, checkAgainstPopcheck } from "./islepages.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || "4150";
const W = process.env.W || "390";
const DPR = process.env.DPR || "2";
const ONLY = process.env.ONLY || "";
/** 押しどころとみなす札。`hitbox.mjs` の `SEL_ALL` と同じもの（あちらから読む） */
const { SEL_ALL } = await import("./hitbox.mjs");

/** 子を1本起こして、出力と終了コードを持ち帰る。出力はそのまま流す */
function run(tool, env, { quiet = false, label = "" } = {}) {
  return new Promise((done) => {
    const ch = spawn(process.execPath, [join(HERE, tool)], {
      env: { ...process.env, ...env },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let out = "";
    ch.stdout.on("data", (d) => { out += d; if (!quiet) process.stdout.write(d); });
    ch.stderr.on("data", (d) => { out += d; if (!quiet) process.stderr.write(d); });
    ch.on("close", (code) => done({ code, out, label: label || tool }));
  });
}

/** 子の出力のうち、**最後の「── 数えたもの」から下**だけを読む。
    面ごとの行にも同じ語が出るので、上から拾うと1面目の数を全体の数と読む */
const tally = (out) => { const i = out.lastIndexOf("── 数えたもの"); return i < 0 ? "" : out.slice(i); };
const num = (out, re) => { const m = tally(out).match(re); return m ? m.slice(1).map(Number) : null; };
/** 子が対照を通ったと印字したか。**印字が無い回の数字は読まない** */
const sawControl = (out) => /対照 (\d+)件中 \1件 一致/.test(out);

const bail = (msg) => { console.log(msg); process.exit(2); };

/* ── 0. 面の一覧が、他の道具とずれていないか ────────────────────── */
{
  const v = checkAgainstPopcheck();
  console.log("── 面の一覧");
  console.log(`  ${v.ok ? "○" : "×"} islepages.mjs ${PAGES.length}面 / popcheck.mjs ${v.there}面`);
  if (!v.ok) {
    if (v.why) console.log("  " + v.why);
    if (v.only_here?.length) console.log("  こちらにしか無い: " + v.only_here.join(" , "));
    if (v.only_there?.length) console.log("  向こうにしか無い: " + v.only_there.join(" , "));
    bail("\n面の一覧が食い違っている。**どちらかが数えていない面がある。**（docs/island-standards.md §15）");
  }
}

/* ── 1. 走らせ役の対照。落ちる子を、落ちたと読めるか ────────────── */
{
  console.log("\n── 対照（わざと落ちる子を起こして、2 が返るか）");
  const checks = [];
  if (ONLY !== "ink")
    checks.push(await run("hitbox.mjs", {
      PORT, W, SEL: SEL_ALL, PAGES: PUBLIC_PAGES[1], BREAK: "allsmall",
    }, { quiet: true, label: "hitbox BREAK=allsmall" }));
  if (ONLY !== "hit")
    checks.push(await run("shotstable.mjs", {
      PORT, W, DPR, PAGES: PUBLIC_PAGES[1], BREAK: "nodiff",
    }, { quiet: true, label: "shotstable BREAK=nodiff" }));
  if (ONLY !== "hit")
    checks.push(await run("inkband.mjs", {
      PORT, W, DPR, PAGES: PUBLIC_PAGES[1], BREAK: "noband",
    }, { quiet: true, label: "inkband BREAK=noband" }));
  if (ONLY !== "hit")
    checks.push(await run("inkpx.mjs", {
      PORT, W, DPR, TAG: "tapink-ctl", OPEN: "1", SEED: join(HERE, "freeze.mjs"),
      PAGES: PUBLIC_PAGES[1], BREAK: "nolim",
    }, { quiet: true, label: "inkpx BREAK=nolim" }));
  let miss = 0;
  for (const c of checks) {
    const ok = c.code === 2;
    if (!ok) miss++;
    console.log(`  ${ok ? "○" : "×"} ${c.label.padEnd(24)} 終了コード ${c.code}（2 のはず）`);
  }
  console.log(`  対照 ${checks.length}件中 ${checks.length - miss}件 一致`);
  if (!checks.length) bail("\n対照を1本も起こしていない。ONLY= の値を見てください。");
  if (miss) bail("\n落ちる子を落ちたと読めていない。**本物の面の数字は出さない。**（docs/island-standards.md §15）");
}

/* ── 2. 本物の26面 ──────────────────────────────────────────────── */
const runs = [];
if (ONLY !== "ink") {
  console.log("\n════ 押しどころ（48px）: だれでも開ける24面");
  runs.push(await run("hitbox.mjs", { PORT, W, SEL: SEL_ALL, PAGES: PUBLIC_PAGES.join(",") }, { label: "押しどころ 公開24面" }));
  console.log("\n════ 押しどころ（48px）: 入った人の2面");
  runs.push(await run("hitbox.mjs", { PORT, W, SEL: SEL_ALL, PAGES: ME_PAGES.join(","), SEED: join(HERE, "asme.mjs") }, { label: "押しどころ じぶん2面" }));
}
if (ONLY !== "hit") {
  /* **字の濃さを測る前に、撮りが安定していることを見る。**
     `inkpx` は2枚の差を「字の画素」と読むので、2枚が揃わない面では
     地と地を比べることになって、濃さの足りている字が大量に割れる
     （`docs/island-misses.md` #130）。ここが落ちたら、濃さの数字は読まない。 */
  console.log("\n════ 撮りが安定しているか: だれでも開ける24面");
  runs.push(await run("shotstable.mjs", { PORT, W, DPR, PAGES: PUBLIC_PAGES.join(",") }, { label: "撮りの安定 公開24面" }));
  console.log("\n════ 撮りが安定しているか: 入った人の2面");
  runs.push(await run("shotstable.mjs", { PORT, W, DPR, PAGES: ME_PAGES.join(","), SEED: join(HERE, "frozenme.mjs") }, { label: "撮りの安定 じぶん2面" }));
  console.log("\n════ 字の濃さ（4.5）: だれでも開ける24面");
  runs.push(await run("inkpx.mjs", {
    PORT, W, DPR, TAG: "tapink-pub", OPEN: "1", SEED: join(HERE, "freeze.mjs"), PAGES: PUBLIC_PAGES.join(","),
  }, { label: "字の濃さ 公開24面" }));
  console.log("\n════ 字の濃さ（4.5）: 入った人の2面");
  runs.push(await run("inkpx.mjs", {
    PORT, W, DPR, TAG: "tapink-me", OPEN: "1", SEED: join(HERE, "frozenme.mjs"), PAGES: ME_PAGES.join(","),
  }, { label: "字の濃さ じぶん2面" }));
  /* **もう1回、送りながら測る。** 1枚に撮る側は `content-visibility: auto` の段を
     描かないので、24面で 284か所が「測れなかった」に落ちる。
     そこを測って初めて出たのが `/nordic/finland` の札4件（`island-misses.md` #130）。
     **どちらか片方では、測っていない場所が「割れ 0」に化ける。** */
  console.log("\n════ 字の濃さ（4.5・送りながら）: だれでも開ける24面");
  runs.push(await run("inkband.mjs", { PORT, W, DPR, TAG: "tapink-band", PAGES: PUBLIC_PAGES.join(",") }, { label: "濃さ(送り) 公開24面" }));
  console.log("\n════ 字の濃さ（4.5・送りながら）: 入った人の2面");
  runs.push(await run("inkband.mjs", {
    PORT, W, DPR, TAG: "tapink-bandme", SEED: join(HERE, "frozenme.mjs"), PAGES: ME_PAGES.join(","),
  }, { label: "濃さ(送り) じぶん2面" }));
}

/* ── 3. 分母から読む ───────────────────────────────────────────── */
const t = { pages: 0, want: 0, taps: 0, small: 0, unmeasured: 0, boxes: 0, inked: 0, faint: 0, shaky: 0,
  bBoxes: 0, bInked: 0, bFaint: 0 };
let broken = 0;
console.log("\n── 数えたもの（幅 " + W + "px / dpr " + DPR + "）");
for (const r of runs) {
  const seen = num(r.out, /見た面\s+(\d+) \/ (\d+)/);
  const hit = num(r.out, /押しどころ\s+(\d+) 個/);
  const small = num(r.out, /px 割れ\s+(\d+) 個/);
  const unmeas = num(r.out, /当たりが測れず\s+(\d+) 個/);
  const boxes = num(r.out, /拾った字\s+(\d+) か所/);
  const inked = num(r.out, /測れた字\s+(\d+) か所/);
  const faint = num(r.out, /割れ\s+(\d+) か所/);
  const shaky = num(r.out, /2枚が揃わない面\s+(\d+) 面/);
  if (!seen) { console.log(`  × ${r.label}  分母の行が出ていない（終了コード ${r.code}）`); broken++; continue; }
  if (!sawControl(r.out)) { console.log(`  × ${r.label}  対照を通った印字が無い（終了コード ${r.code}）`); broken++; continue; }
  t.pages += seen[0]; t.want += seen[1];
  if (hit) t.taps += hit[0];
  if (small) t.small += small[0];
  if (unmeas) t.unmeasured += unmeas[0];
  /* **1枚に撮る側と、送りながら測る側を、同じ数に混ぜない。**
     混ぜると「拾った字」が2倍に見えて、分母が意味を失う（§15） */
  const band = r.label.includes("送り");
  if (boxes) t[band ? "bBoxes" : "boxes"] += boxes[0];
  if (inked) t[band ? "bInked" : "inked"] += inked[0];
  if (faint) t[band ? "bFaint" : "faint"] += faint[0];
  if (shaky) t.shaky += shaky[0];
  console.log(`  ${r.code === 0 ? "○" : r.code === 1 ? "!!" : "×"} ${r.label.padEnd(18)} 見た面 ${seen[0]}/${seen[1]}  終了コード ${r.code}`);
  if (r.code === 2) broken++;
}
/** 何とおりの見かたで26面を回ったか（押しどころ / 撮りの安定 / 字の濃さ） */
const views = (ONLY === "ink" ? 0 : 1) + (ONLY === "hit" ? 0 : 3);
const allPages = PAGES.length * views;
console.log(`\n  見た面       ${t.pages} / ${allPages}（26面 × ${views}とおりの見かた）`);
if (ONLY !== "ink") {
  console.log(`  押しどころ   ${t.taps} 個`);
  console.log(`  48px 割れ    ${t.small} 個`);
  console.log(`  当たりが測れず ${t.unmeasured} 個（上に何かがいる・画面の外。**小さいものではない**）`);
}
if (ONLY !== "hit") {
  console.log(`  2枚が揃わない面 ${t.shaky} 面（ここが0でないと、下の濃さは読めない）`);
  console.log(`  字（1枚に撮る）  拾った ${t.boxes} / 測れた ${t.inked} / 4.5 割れ ${t.faint} か所`);
  console.log(`  字（送りながら）  拾った ${t.bBoxes} / 測れた ${t.bInked} / 4.5 割れ ${t.bFaint} か所`);
}
console.log(`  見ていないもの: 押しどころに当たらない札 / 欄の中の字（placeholder と閉じた <select>。それは liveink.mjs）`);

if (broken || t.pages !== allPages) {
  console.log(`\n数えられなかった回が ${broken} 本。見た面も ${t.pages}/${allPages}。**この数字は当てになりません。**`);
  process.exit(2);
}
if (!t.taps && ONLY !== "ink") bail("\n押しどころを1つも測れませんでした。数えるものがありません。");
if ((!t.inked || !t.bInked) && ONLY !== "hit") bail("\n字を1か所も測れませんでした。数えるものがありません。");
const bad = t.small + t.faint + t.bFaint + t.shaky;
if (bad) {
  console.log(`\nだめ: 48px 割れ ${t.small} 個 / 4.5 割れ ${t.faint}（1枚）・${t.bFaint}（送り）か所 / 撮りが揃わない面 ${t.shaky} 面。`);
  process.exit(1);
}
console.log(`\n26面、48px 割れも 4.5 割れも見つかりませんでした。`);
process.exit(0);
