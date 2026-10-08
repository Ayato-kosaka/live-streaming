/**
 * 島の面ぜんぶを回して、**押しどころ 48px** と **字の濃さ 4.5** の合否を返す。
 *
 *   DIST=site/.next-3180 PORT=4180 node tools/sprites/tapink.mjs
 *   PORT=4180 ONLY=hit   node tools/sprites/tapink.mjs   # 押しどころだけ
 *   PORT=4180 ONLY=shots node tools/sprites/tapink.mjs   # 撮りの安定だけ
 *   PORT=4180 ONLY=px    node tools/sprites/tapink.mjs   # 濃さ（1枚に撮る）だけ
 *   PORT=4180 ONLY=band  node tools/sprites/tapink.mjs   # 濃さ（送りながら）だけ
 *   PORT=4180 ONLY=ink   node tools/sprites/tapink.mjs   # 濃さ3本（shots+px+band）
 *   PORT=4180 W=1000     node tools/sprites/tapink.mjs   # PC の幅で
 *
 * 終了コード: 0＝通った / 1＝見つかった / 2＝数えるものが無い。
 *
 * **ひと回り（138面 × 4とおり）で1時間45分**かかる。時間で切られる所から
 * 回すときは `ONLY=` で1本ずつ。4本ぜんぶの終了コードを見るまで
 * 「島を測った」とは言えない。
 *
 * `docs/island-standards.md` の「出す前のチェック」は、この2つを**面ぜんぶ**に
 * 求めている。ところが 2026-09-17 まで、`hitbox.mjs` は**2面・`SEL=.crumbs a`
 * だけ**、`inkpx.mjs` は**3面だけ**しか回っていなかった。手で回す道具のままだと、
 * 「どこまで測ったか」が人の記憶に残るだけで、次のセッションには残らない。
 *
 * ## 面の一覧を、ここでも手で持たない（2026-10-07）
 *
 * この道具は 2026-09-17 に「26面ぜんぶ」を名乗って作られた。**26 が全部では
 * なかった。** 書き出すと島は **138面**ある（料理33・歩いた国25・北欧26・
 * 過去の島11・伝説9…）。一覧を手で並べていたので、面が増えても増えなかった。
 * つまり「26面ぜんぶ緑」は、**112面を一度も測らずに出した緑**だった。
 * いまは `islepages.mjs` が**書き出したものを歩いて**数える。
 *
 * ## 測り方は書かない。**4本を呼ぶ**
 *
 * ここには判定を1行も持たせない。`hitbox.mjs` `shotstable.mjs` `inkpx.mjs`
 * `inkband.mjs` を子として起こして、**終了コードだけを読む。** 同じ測り方を
 * 3か所目に書くと、直したときに直るのは1か所だけになる
 * （`docs/island-misses.md` #83）。
 * 子は自分の対照（`hitboxfix/` 8件＋台1、`inkpxfix/` 14件、`inkbandfix/` 25件）を
 * 先に通してから本物の面を測るので、**対照落ちは 2 としてそのまま上がってくる。**
 *
 * ## この走らせ役にも対照が要る
 *
 * 子の合否を読み違えたら、面ぜんぶが「緑」になる。だから本物を測る前に、
 * **わざと落ちる子を1本ずつ起こして、2 が返ってくることを見る**
 * （`hitbox` に `BREAK=allsmall`、`inkpx` に `BREAK=nolim` など）。
 * ここで 0 が返ったら、この走らせ役は数字を1つも出さずに 2 で落ちる。
 * あわせて、子が「対照 N件中 N件 一致」を**印字したこと**も見る。
 * 印字が無いのは、対照を通らずに数字だけ出てきたということ。
 *
 * ## 分母を出す
 *
 * 「48px 割れ 0」「4.5 割れ 0」だけを読まない（`docs/island-standards.md` §15）。
 * **何面・何か所を見てそのうち0件か**を、子から拾って並べる。
 * 見た面が一覧の数に足りなければ、割れ0 は合格ではない。
 */
import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  PUBLIC_PAGES, ME_PAGES, PAGES, SKIP, DIST,
  checkAgainstPopcheck, checkAgainstSitemap,
} from "./islepages.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || "4150";
const W = process.env.W || "390";
const DPR = process.env.DPR || "2";
const ONLY = process.env.ONLY || "";
/**
 * 子1本に渡す面の数。**一息に134面渡すと、途中でブラウザごと落ちる。**
 *
 * 2026-10-07 の初回。`inkpx` は 75面目のあとで、`shotstable` は 28面目のあとで
 * `browserContext.newPage: Target page, context or browser has been closed`。
 * どちらも**それまでに測った数を1つも出さずに**死んだ（捕まらない例外）。
 * 子の側でも受けるようにしたが、ブラウザが死んでいれば残りの面も全部
 * 「測れなかった」になるので、**それだけでは数が戻らない。**
 *
 * 小分けにすると、落ちた回に失われるのは**その小分けだけ**で、ほかの
 * 小分けの数は出る。落ちた小分けは `分母の行が出ていない` として並び、
 * 全体は 2 で落ちる——**測れなかったことが数で見える。**
 * ついでに、ブラウザが短命になるので落ちにくくなる（35面で実測 0回）。
 */
const CHUNK = Number(process.env.CHUNK || 35);

/** 面を小分けにする。`[["/a","/b"], ["/c"]]` */
const chunks = (list) => {
  const out = [];
  for (let i = 0; i < list.length; i += CHUNK) out.push(list.slice(i, i + CHUNK));
  return out.length ? out : [[]];
};
/** 小分けの札。`公開134面(2/4)`。**全体の分母を札に残す**（1枚ずつの数に見えないように） */
const tag = (what, list, i, n) => `${what}${list.length}面${n > 1 ? `(${i + 1}/${n})` : ""}`;

/**
 * 1とおりの見かたを、小分けにして回す。子の出力はそのまま流れる。
 *
 * @param {string} tool 子の名前
 * @param {string[]} list 面
 * @param {string} what 札の頭（「押しどころ 公開」など）
 * @param {object} env 子に渡すもの（`PAGES` はここで入れる）
 */
async function sweep(tool, list, what, env) {
  const cs = chunks(list);
  for (let i = 0; i < cs.length; i++) {
    console.log(`\n════ ${what}${list.length}面${cs.length > 1 ? `  ${i + 1}/${cs.length}（${cs[i].length}面）` : ""}`);
    runs.push(await run(tool, { ...env, PAGES: cs[i].join(",") }, { label: tag(what, list, i, cs.length) }));
  }
}
/** どの見かたを回すか。`ONLY=` で1本ずつに絞れる（138面あるので時間で切られる） */
const want = {
  hit: !ONLY || ONLY === "hit",
  shots: !ONLY || ONLY === "ink" || ONLY === "shots",
  px: !ONLY || ONLY === "ink" || ONLY === "px",
  band: !ONLY || ONLY === "ink" || ONLY === "band",
};
/** 押しどころとみなす札。`hitbox.mjs` の `SEL_ALL` と同じもの（あちらから読む） */
const { SEL_ALL } = await import("./hitbox.mjs");

/** 子の回ぶんの結果。`sweep()` が積む */
const runs = [];

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

/* ── 0. 面の一覧。**手で並べたものではないことを、ここで見せる** ───────── */
{
  console.log("── 面の一覧（書き出したものを歩いて数えた）");
  console.log(`  置き場 ${DIST}`);
  console.log(`  面 ${PAGES.length}（だれでも開ける ${PUBLIC_PAGES.length} / 入った人 ${ME_PAGES.length}）`);
  for (const s of SKIP) console.log(`  測らない ${s.path} … ${s.why}`);
  if (!PAGES.length)
    bail("\n書き出したものが見つかりません（DIST= を渡してください）。**0面を測って合格にはしない。**（docs/island-standards.md §15）");

  const sm = checkAgainstSitemap();
  console.log(`  ${sm.ok ? "○" : "×"} sitemap.xml ${sm.locs}件 … ぜんぶ一覧に入っている`
    + `（検索に出さない面 ${sm.noindex.length}: ${sm.noindex.join(" ")}）`);
  if (!sm.ok) {
    if (sm.why) console.log("  " + sm.why);
    if (sm.missing.length) console.log("  sitemap にあって一覧に無い: " + sm.missing.join(" , "));
    bail("\n`sitemap.xml` が名乗っている面を、一覧が持っていない。**歩き方が壊れている。**（docs/island-standards.md §8）");
  }

  const v = checkAgainstPopcheck();
  console.log(`  ${v.ok ? "○" : "×"} popcheck.mjs も同じ一覧を読んでいる`);
  if (!v.ok) bail(`\n${v.why}。**写しが増えると、片方だけ数えない日が来る。**（docs/island-misses.md #83）`);
}

/* ── 1. 走らせ役の対照。落ちる子を、落ちたと読めるか ────────────── */
{
  console.log("\n── 対照（わざと落ちる子を起こして、2 が返るか）");
  const one = PUBLIC_PAGES[0];
  const checks = [];
  if (want.hit)
    checks.push(await run("hitbox.mjs", {
      PORT, W, SEL: SEL_ALL, PAGES: one, BREAK: "allsmall",
    }, { quiet: true, label: "hitbox BREAK=allsmall" }));
  if (want.shots)
    checks.push(await run("shotstable.mjs", {
      PORT, W, DPR, PAGES: one, BREAK: "nodiff",
    }, { quiet: true, label: "shotstable BREAK=nodiff" }));
  if (want.band)
    checks.push(await run("inkband.mjs", {
      PORT, W, DPR, PAGES: one, BREAK: "noband",
    }, { quiet: true, label: "inkband BREAK=noband" }));
  if (want.px)
    checks.push(await run("inkpx.mjs", {
      PORT, W, DPR, TAG: "tapink-ctl", OPEN: "1", SEED: join(HERE, "freeze.mjs"),
      PAGES: one, BREAK: "nolim",
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

/* ── 2. 本物の面 ────────────────────────────────────────────────── */
if (want.hit) {
  await sweep("hitbox.mjs", PUBLIC_PAGES, "押しどころ（48px）公開", { PORT, W, SEL: SEL_ALL });
  await sweep("hitbox.mjs", ME_PAGES, "押しどころ（48px）じぶん", { PORT, W, SEL: SEL_ALL, SEED: join(HERE, "asme.mjs") });
}
if (want.shots) {
  /* **字の濃さを測る前に、撮りが安定していることを見る。**
     `inkpx` は2枚の差を「字の画素」と読むので、2枚が揃わない面では
     地と地を比べることになって、濃さの足りている字が大量に割れる
     （`docs/island-misses.md` #130）。ここが落ちたら、濃さの数字は読まない。

     **止めかたは濃さ側と同じにする。** 公開面に `freeze.mjs` を渡していな
     かったので、こちらは島が動いたまま、あちらは止めて測っていた。
     **関門が、関門をかける相手と違う条件で測っていた。** */
  await sweep("shotstable.mjs", PUBLIC_PAGES, "撮りの安定 公開", { PORT, W, DPR, SEED: join(HERE, "freeze.mjs") });
  await sweep("shotstable.mjs", ME_PAGES, "撮りの安定 じぶん", { PORT, W, DPR, SEED: join(HERE, "frozenme.mjs") });
}
if (want.px) {
  await sweep("inkpx.mjs", PUBLIC_PAGES, "字の濃さ（4.5）公開",
    { PORT, W, DPR, TAG: "tapink-pub", OPEN: "1", SEED: join(HERE, "freeze.mjs") });
  await sweep("inkpx.mjs", ME_PAGES, "字の濃さ（4.5）じぶん",
    { PORT, W, DPR, TAG: "tapink-me", OPEN: "1", SEED: join(HERE, "frozenme.mjs") });
}
if (want.band) {
  /* **もう1回、送りながら測る。** 1枚に撮る側は `content-visibility: auto` の段を
     描かないので、26面の回で 284か所が「測れなかった」に落ちた。
     そこを測って初めて出たのが `/nordic/finland` の札4件（`island-misses.md` #130）。
     **どちらか片方では、測っていない場所が「割れ 0」に化ける。** */
  await sweep("inkband.mjs", PUBLIC_PAGES, "濃さ(送り) 公開", { PORT, W, DPR, TAG: "tapink-band" });
  await sweep("inkband.mjs", ME_PAGES, "濃さ(送り) じぶん",
    { PORT, W, DPR, TAG: "tapink-bandme", SEED: join(HERE, "frozenme.mjs") });
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
/** 何とおりの見かたで面を回ったか（押しどころ / 撮りの安定 / 濃さ1枚 / 濃さ送り） */
const views = Object.values(want).filter(Boolean).length;
const allPages = PAGES.length * views;
console.log(`\n  見た面       ${t.pages} / ${allPages}（${PAGES.length}面 × ${views}とおりの見かた）`);
if (want.hit) {
  console.log(`  押しどころ   ${t.taps} 個`);
  console.log(`  48px 割れ    ${t.small} 個`);
  console.log(`  当たりが測れず ${t.unmeasured} 個（上に何かがいる・画面の外。**小さいものではない**）`);
}
if (want.shots) console.log(`  2枚が揃わない面 ${t.shaky} 面（ここが0でないと、下の濃さは読めない）`);
if (want.px) console.log(`  字（1枚に撮る）  拾った ${t.boxes} / 測れた ${t.inked} / 4.5 割れ ${t.faint} か所`);
if (want.band) console.log(`  字（送りながら）  拾った ${t.bBoxes} / 測れた ${t.bInked} / 4.5 割れ ${t.bFaint} か所`);
console.log(`  見ていないもの: 押しどころに当たらない札 / 欄の中の字（placeholder と閉じた <select>。それは liveink.mjs）`);
if (ONLY) console.log(`  **ONLY=${ONLY} で回したので、これは島の一部です。** 4本ぜんぶの終了コードを見るまで「測った」と言わない`);

if (broken || t.pages !== allPages) {
  console.log(`\n数えられなかった回が ${broken} 本。見た面も ${t.pages}/${allPages}。**この数字は当てになりません。**`);
  process.exit(2);
}
if (!t.taps && want.hit) bail("\n押しどころを1つも測れませんでした。数えるものがありません。");
if (!t.inked && want.px) bail("\n字を1か所も測れませんでした（1枚に撮る側）。数えるものがありません。");
if (!t.bInked && want.band) bail("\n字を1か所も測れませんでした（送りながら）。数えるものがありません。");
const bad = t.small + t.faint + t.bFaint + t.shaky;
if (bad) {
  console.log(`\nだめ: 48px 割れ ${t.small} 個 / 4.5 割れ ${t.faint}（1枚）・${t.bFaint}（送り）か所 / 撮りが揃わない面 ${t.shaky} 面。`);
  process.exit(1);
}
console.log(`\n${PAGES.length}面、48px 割れも 4.5 割れも見つかりませんでした。`);
process.exit(0);
