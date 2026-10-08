/**
 * **先の企画が0件の日に、画面が過去のものを「これから」として出さないか。**
 *
 *     node site/selftest/leadplan_selftest.mjs
 *
 * ## なぜ要るか
 *
 * `content/plans.ts` の `nextPlan()` は、まだ来ていない企画が1件も無くなると
 * **`big` の付いた企画（＝もう行ってきた北欧旅）を返す。** 次の大物を先に
 * 告知しておくための受けだったが、受けが働いた日に画面がそれを
 * 「いま、いちばん近い企画」として出す。
 *
 * 旅は 2026-09-27 に終わって、2026-10-07 まで**25日ぶん**、表紙の見出しの下に
 * 「行ってきた／ヒッチハイクで北欧へ」が出ていた。`/now` の札も同じものを
 * 指していた。あやとの言葉（2026-10-07 / #673）:
 *
 * > 「いま、いちばん近い企画」が、もう行ってきた北欧旅
 * > → とくになし。これからのことで、行ってきたが出てるのはバグかと。
 *
 * **先の予定が0件なのは正常な状態。** だから見張るのは「企画の表が古いか」
 * ではなく「0件のときに画面が過去のものを出すか」。前は
 * `python/stale_content_watch.py` が表の日付を見ていたが、あれは
 * **人が何をしても消せない赤**になった（消しようのない赤は、鳴らない見張りと
 * 同じだけ悪い。`docs/island-standards.md` §13 §15）。
 *
 * ## 何を見ているか
 *
 *  1. **本番の表 × 本番の今日** —— `lead` が無い（0件）。行ってきた企画は数で出る
 *  2. 先の予定を1件足したら、それが `lead`（**いままでの合格が変わらない**）
 *  3. いま行っている企画があれば、まだ来ていないものより先
 *  4. どんな日に当てても、**行ってきた企画は `lead` にならない**
 *  5. **対照**——同じ表で `nextPlan()` は行ってきた企画を返す
 *     （直したものが効いている、を数で見る。§15）
 *  6. 「今週、なにをするんだろう」の過ぎた行が落ちる／全部過ぎたら0行／
 *     日付の無い行は残る／年をまたいでも読み違えない
 *  7. **画面が `nextPlan` を読んでいない**（`site/app` `site/components`）。
 *     戻ってきたらここが落ちる
 *
 * ## 壊した写しで落ちることまで見る（`docs/island-misses.md` #99 #100）
 *
 * ```bash
 * # 0件のときに big へ落とす写し（＝2026-10-07 までの画面）
 * LEAD_TS=/tmp/lead-old.ts node site/selftest/leadplan_selftest.mjs
 *
 * # 過ぎた行を落とさない写し（＝2026-10-07 までの `/now`）
 * WEEK_TS=/tmp/week-old.ts node site/selftest/leadplan_selftest.mjs
 * ```
 *
 * 写しの作りかたは下の `BREAK_HINT` に書いてある（`--hint` で出る）。
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const SITE = join(HERE, "..");
const LIB = join(SITE, "lib");
const CONTENT = join(SITE, "content");

/** 組み立てる本体。**落ちることを確かめる写しだけ、ここを差し替える。** */
const LEAD_SRC = process.env.LEAD_TS || join(LIB, "leadPlan.ts");
const WEEK_SRC = process.env.WEEK_TS || join(LIB, "week.ts");

const BREAK_HINT = `わざと壊して、ここが落ちることを見るには:

  # 1) 0件のときに big（行ってきた企画）へ落とす。2026-10-07 までの画面
  sed 's|?? before\\[0\\],|?? before[0] ?? after.find((p) => p.big),|' \\
    site/lib/leadPlan.ts > /tmp/lead-old.ts
  LEAD_TS=/tmp/lead-old.ts node site/selftest/leadplan_selftest.mjs

  # 2) 「今週やること」の過ぎた行を落とさない。2026-10-07 までの /now
  sed 's|return rows.filter((r) => !weekRowPast(r, now));|return [...rows];|' \\
    site/lib/week.ts > /tmp/week-old.ts
  WEEK_TS=/tmp/week-old.ts node site/selftest/leadplan_selftest.mjs`;

if (process.argv.includes("--hint")) {
  console.log(BREAK_HINT);
  process.exit(0);
}

/* ------------------------------------------------------------------ 組み立て
   `@/lib/…` `@/content/…` は tsc が道に直してくれないので、隣に並べてから
   組み立てる。**本体は写しを置かずに本物を持ち込む**——写しを置くと、
   本体を直したのに確かめが古いまま通る。 */
const WORK = mkdtempSync(join(tmpdir(), "leadplan-src-"));
const OUT = mkdtempSync(join(tmpdir(), "leadplan-out-"));

/** 1本持ち込む。`@/` を隣への道に直す。 */
function bring(src, name) {
  const code = readFileSync(src, "utf8")
    .replace(/@\/lib\//g, "./")
    .replace(/@\/content\//g, "./");
  writeFileSync(join(WORK, name), code);
}

bring(join(LIB, "builtAt.ts"), "builtAt.ts");
bring(join(CONTENT, "chapters.ts"), "chapters.ts");
bring(join(LIB, "nightly.ts"), "nightly.ts");
bring(join(CONTENT, "plans.ts"), "plans.ts");
bring(LEAD_SRC, "leadPlan.ts");
bring(WEEK_SRC, "week.ts");

execFileSync(
  join(SITE, "node_modules", ".bin", "tsc"),
  [
    join(WORK, "leadPlan.ts"),
    join(WORK, "week.ts"),
    "--outDir",
    OUT,
    "--module",
    "commonjs",
    "--target",
    "es2022",
    "--strict",
    "--skipLibCheck",
    /* `lib/builtAt.ts` が `process.env` を読む。型は **`site` のものを使う**
       （組み立て先は /tmp なので、そこから上に登っても見つからない） */
    "--typeRoots",
    join(SITE, "node_modules", "@types"),
    "--types",
    "node",
  ],
  { stdio: "inherit" },
);

const req = createRequire(import.meta.url);
const { planBoard, leadPlan, planAheadCount } = req(join(OUT, "leadPlan.js"));
const { weekAhead, weekRowPast } = req(join(OUT, "week.js"));
/** 企画の表は**本物**（`site/content/plans.ts`）。写しを置かない */
const { PLANS, planPhase, nextPlan } = req(join(OUT, "plans.js"));

console.log(`# 組み立てた本体: ${LEAD_SRC}`);
console.log(`#               ${WEEK_SRC}`);
console.log(`# 企画の表: ${PLANS.length}件`);

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
}

/** 日本時間の正午。日をまたぐ境目で数えないため */
const noon = (y, m, d) => new Date(Date.UTC(y, m - 1, d, 3, 0, 0));

/* ------------------------------------------------- 1. 本番の表 × 本番の今日 */

const TODAY = new Date();
const real = planBoard(TODAY);
console.log(
  `  本番: いま行っている ${real.during.length} / まだ来ていない ${real.before.length} / ` +
    `行ってきた ${real.after.length}（きょう ${TODAY.toISOString().slice(0, 10)}）`,
);
/* **分母を印字してから読む**（§15）。先が0件なのは正常な状態なので、
   「0件だった」だけでは、数えたのか数え損ねたのか分からない */
check("本番の表を、ぜんぶ仕分けている（分母が0ではない）", real.during.length + real.before.length + real.after.length === PLANS.length);
if (real.during.length + real.before.length === 0) {
  check("先が0件の日、先頭に出す企画は無い", real.lead === undefined, `出た=${real.lead?.id}`);
  check("そのとき、これから分の数も0", planAheadCount(TODAY) === 0);
  check("行ってきた企画は、数として出せる（0件の証拠）", real.after.length > 0);
} else {
  check("先が在る日は、先頭に出す企画も在る", real.lead !== undefined);
  check("先頭に出す企画は、行ってきたものではない", planPhase(real.lead, TODAY) !== "after");
}

/* --------------------------- 2〜4. 作った日で、4通りを当てる（両側を見る） */

/** 企画1件ぶんの型の最小。**本番の表には触らない**（別の表を渡して当てる） */
const plan = (id, date, extra = {}) => ({
  id,
  title: id,
  when: date,
  date,
  note: "",
  tags: [],
  ...extra,
});

/**
 * 表を差し替えて仕分ける。
 *
 * `planBoard` は `livePlans()`（＝本番の `PLANS`）を読むので、表を差し替えるには
 * そこを置き換える。**`planPhase` は本物のまま**にする——3つの状態の決めかたを
 * 写しで持つと、本体を直しても確かめが古いまま通る。
 */
const plans = req(join(OUT, "plans.js"));
const realLivePlans = plans.livePlans;
function boardWith(rows, today) {
  plans.livePlans = () => rows;
  try {
    return planBoard(today);
  } finally {
    plans.livePlans = realLivePlans;
  }
}

const T = noon(2026, 10, 7);
const CASES = [
  {
    label: "先の予定が1件ある（あすの日付）",
    rows: [plan("past", "2026-09-11"), plan("soon", "2026-10-08")],
    want: "soon",
  },
  {
    label: "先の予定がきょうの日付だけ",
    rows: [plan("past", "2026-09-11"), plan("today", "2026-10-07")],
    want: "today",
  },
  {
    label: "いま行っている企画があれば、先の予定より先",
    rows: [
      plan("now", "2026-10-01", { until: "2026-10-20" }),
      plan("soon", "2026-10-08"),
    ],
    want: "now",
  },
  {
    label: "ぜんぶ行ってきた（＝いまの本番）",
    rows: [plan("past", "2026-09-11"), plan("big-past", "2026-09-11", { until: "2026-09-27", big: true })],
    want: undefined,
  },
  {
    label: "行ってきた big が在っても、先の予定を飛ばさない",
    rows: [
      plan("big-past", "2026-09-11", { until: "2026-09-27", big: true }),
      plan("soon", "2026-10-08"),
    ],
    want: "soon",
  },
];

for (const c of CASES) {
  const b = boardWith(c.rows, T);
  check(`${c.label} → ${c.want ?? "（出さない）"}`, b.lead?.id === c.want, `出た=${b.lead?.id}`);
}

/* 日付の無い企画は、いつまでも「これから」（`planPhase` の決め）。
   **0件の枝に落ちない**ことを別に当てる——落ちると、日が決まっていない
   企画を足した日から画面が空になる */
check(
  "日にちの決まっていない企画は、先頭に出る",
  boardWith([{ ...plan("undated", "2026-01-01"), date: undefined, when: "日にち未定" }], T).lead?.id ===
    "undated",
);

/* ------------------------------------------- 5. 対照。直したものが効いているか */

/* **`nextPlan()` は同じ表で行ってきた企画を返す。** ここが undefined になったら
   対照が効いていない（＝どちらを使っても同じ）ので、上の合格が何も言っていない

   **日を焼かない。** ここは長く `2026-10-07`（＝この見張りを書いた日の本番）
   だったので、**先の予定を1件足した日にこの対照が落ちた**（北マケドニアへの
   移動を足して実際に落ちた）。見たいのは「ぜんぶ行ってきた日に2つが違う答えを
   出すか」であって特定の日ではないので、**表のいちばん後ろの予定の、その先の日**を
   その場で出す（`docs/island-misses.md` #193 の決めごと4——見張りが赤いときは、
   まず見張りの前提が崩れていないかを見る）。 */
const LAST = PLANS.map((p) => p.done || p.until || p.date || "0000-00-00").sort().at(-1);
const AFTER_ALL = noon(Number(LAST.slice(0, 4)) + 1, 1, 15);
const allPast = nextPlan(AFTER_ALL);
check(
  `対照：ぜんぶ行ってきた日（${LAST} の翌年）に、\`nextPlan()\` は行ってきた企画を返す`,
  allPast !== undefined && planPhase(allPast, AFTER_ALL) === "after",
  `出た=${allPast?.id}`,
);
check(
  "対照：`leadPlan()` は、同じ日に何も返さない",
  leadPlan(AFTER_ALL) === undefined,
  `出た=${leadPlan(AFTER_ALL)?.id}`,
);

/* -------------------------------------------- 6. 今週、なにをするんだろう */

/** **本番の `week`**（`curl .../island-api/state` 2026-10-07）。作った字ではない */
const PROD_WEEK = [
  "9/27 ストックホルムを発つ",
  "9/28 アルバニア着",
  "回る先はこれから。島の風船に貼ってもらったものから決める",
];
const kept = weekAhead(PROD_WEEK, T);
check("本番の week から、過ぎた2行が落ちる", kept.length === 1, `残った=${JSON.stringify(kept)}`);
check("日付を持たない行は残る", kept[0] === PROD_WEEK[2]);
check(
  "ぜんぶ過ぎていたら0行（箱ごと出ない）",
  weekAhead(PROD_WEEK.slice(0, 2), T).length === 0,
);
check(
  "これからの行は残る",
  weekAhead(["10/9 アルバニアを出る", "9/28 アルバニア着"], T).join("|") === "10/9 アルバニアを出る",
);
check("空の week は0行", weekAhead([], T).length === 0 && weekAhead(undefined, T).length === 0);
check("きょうの行は残る（当日はまだ過ぎていない）", !weekRowPast("10/7 配信する", T));
check("きのうの行は落ちる", weekRowPast("10/6 配信した", T));
/* 1行に日付が2つあるときは、**いちばん遅いほう**で決める。
   頭の日付で決めると、まだ続いている予定が初日を過ぎた瞬間に消える */
check("またがる行は、終わりの日で決める", !weekRowPast("10/1〜10/20 アルバニアにいる", T));
/* 年をまたぐ日。**`M/D` に年は書いていない**ので、今日にいちばん近い年で読む */
check("年またぎ：1/3 に読んだ 12/30 は、過ぎている", weekRowPast("12/30 大みそかの前", noon(2027, 1, 3)));
check("年またぎ：12/28 に読んだ 1/10 は、まだ来ていない", !weekRowPast("1/10 どこかへ", noon(2026, 12, 28)));
/* 日付に見えるが日付ではない数。**ありえない日を作らない** */
check("13/40 のような数は、日付として読まない", !weekRowPast("13/40 これは日付ではない", T));

/* --------------------------- 7. 画面が `nextPlan` を読んでいないこと */

/* **ここが構造の見張り。** `nextPlan()` は表に残してあるので（島のデータは
   ここから書き換えない）、画面が読み直したら同じ不具合が戻る。
   コメントの中の名前は数えない——経緯は各所に書いてあるので、
   **`import` の行だけを見る。** */
const ROOTS = [join(SITE, "app"), join(SITE, "components")];
function walk(dir, out = []) {
  for (const n of readdirSync(dir)) {
    if (n === "node_modules") continue;
    const p = join(dir, n);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(n)) out.push(p);
  }
  return out;
}
const files = ROOTS.flatMap((r) => walk(r));
const importers = files.filter((f) => {
  const src = readFileSync(f, "utf8");
  // `import { … nextPlan … } from "@/content/plans"` の形だけを拾う
  return /import\s*\{[^}]*\bnextPlan\b[^}]*\}\s*from\s*["']@\/content\/plans["']/.test(src);
});
check(`画面（${files.length}本）は \`nextPlan\` を読んでいない`, importers.length === 0,
  importers.map((f) => f.slice(SITE.length + 1)).join(" "));
/* **分母が0ではない**（§15）。`site/app` と `site/components` を読めていなければ、
   「1本も無い」は何も言っていない */
check("画面の .ts/.tsx を読めている（分母が0ではない）", files.length > 100, `数えた=${files.length}`);
/* 画面が代わりに読んでいる口（`lib/leadPlan.ts`）が、本当に使われているか。
   ここが0なら、上の「読んでいない」は「企画を出す画面が1つも無い」と同じ */
const leadUsers = files.filter((f) =>
  /from\s*["']@\/lib\/leadPlan["']/.test(readFileSync(f, "utf8")),
);
check(`画面は \`lib/leadPlan\` を読んでいる（${leadUsers.length}本）`, leadUsers.length >= 3,
  leadUsers.map((f) => f.slice(SITE.length + 1)).join(" "));

console.log(`\n${OK + BAD}件中 ${OK}件通った`);
if (BAD) {
  console.log(`\n${BREAK_HINT}`);
  process.exit(1);
}
