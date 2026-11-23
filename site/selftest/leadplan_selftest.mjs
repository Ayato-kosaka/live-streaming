/**
 * **表紙の「これから」が、滞在の表から居場所を出し、過去のものを「これから」として出さないか。**
 *
 *     node site/selftest/leadplan_selftest.mjs
 *
 * ## なぜ要るか
 *
 * (A) `content/plans.ts` の `nextPlan()` は、まだ来ていない企画が1件も無くなると
 * **`big` の付いた企画（＝もう行ってきた北欧旅）を返す。** 旅は 2026-09-27 に終わって、
 * 2026-10-07 まで**25日ぶん**、表紙に「行ってきた／ヒッチハイクで北欧へ」が出ていた
 * （あやと 2026-10-07 / #673「これからのことで、行ってきたが出てるのはバグかと」）。
 * **先の予定が0件なのは正常な状態**なので、見張るのは「0件のときに画面が過去のものを出すか」。
 *
 * (B) 国を移る日も企画の行（「ブルガリア・ソフィアへ移動」）だったので、表紙は着いたあとも
 * 「へ移動」「進行中」と言い続けた（あやと 2026-11-18「移動はもうしちゃってる」。#1276）。
 * いまは居場所を滞在の表（`content/stays.ts`）から引く。［いまここ］は**日付で消えず**、
 * **つぎの行が着いた日に入れ替わる**（`docs/spec/model.md` M-22・6章「引きかた」）。
 *
 * ## 何を見ているか
 *
 *  1. **本番の表 × 本番の今日** —— 先の回が0件なら `lead` が無い。行ってきた企画は数で出る
 *  2. 先の予定を1件足したら、それが `lead`（**いままでの合格が変わらない**）
 *  3. いま行っている企画があれば、まだ来ていないものより先
 *  4. どんな日に当てても、**行ってきた企画は `lead` にならない**
 *  5. **対照**——同じ表で `nextPlan()` は行ってきた企画を返す（§15）
 *  5b. **滞在から引く**——移動の企画は「これから」に入らない／［いまここ］は着いた日に入れ替わり、
 *     その前の日は前の国／翌年も消えない／つぎの行が先に足されても着くまではいまの国／
 *     日本時間の0時で替わる／「あと何日」は同じ表から。対照は「終わりの空いた行」と「日付で閉じる」の2つの読みかた
 *  6. 「今週、なにをするんだろう」の過ぎた行が落ちる／全部過ぎたら0行／
 *     日付の無い行は残る／年をまたいでも読み違えない
 *  7. **画面が `nextPlan` を読んでいない**。表紙の部品が「へ移動」「進行中」「企画を、ぜんぶ見る」を持たない
 *
 * ## 壊した写しで落ちることまで見る（`docs/island-misses.md` #99 #100）
 *
 * 写しの作りかたは下の `BREAK_HINT` に書いてある（`--hint` で出る）。
 */
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdtempSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import Module, { createRequire } from "node:module";
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

  # 1) 0件のときに big（行ってきた企画）へ落とす。2026-10-07 までの画面 → 2・4・5 が落ちる
  sed 's|?? before\\[0\\],|?? before[0] ?? after.find((p) => p.big),|' \\
    site/lib/leadPlan.ts > /tmp/lead-old.ts
  LEAD_TS=/tmp/lead-old.ts node site/selftest/leadplan_selftest.mjs

  # 2) 「今週やること」の過ぎた行を落とさない。2026-10-07 までの /now → 6 が落ちる
  sed 's|return rows.filter((r) => !weekRowPast(r, now));|return [...rows];|' \\
    site/lib/week.ts > /tmp/week-old.ts
  WEEK_TS=/tmp/week-old.ts node site/selftest/leadplan_selftest.mjs

  # 3) 移動の企画を「これから」に戻す。2026-11-22 までの表紙 → 5b の「移動の企画は入らない」が落ちる
  sed 's|.filter((p) => !isMovePlan(p))||' site/lib/leadPlan.ts > /tmp/lead-move.ts
  LEAD_TS=/tmp/lead-move.ts node site/selftest/leadplan_selftest.mjs

  # 4) ［いまここ］を「終わりの空いた行」で引く → 5b の「つぎの行が先に足されても」が落ちる
  sed 's|const s = pick(open) ?? pick(came);|const s = rows.find((x) => !x.to);|' site/lib/leadPlan.ts > /tmp/lead-open.ts
  LEAD_TS=/tmp/lead-open.ts node site/selftest/leadplan_selftest.mjs

  # 5) ［いまここ］を日付で閉じる → 5b の「日付が過ぎただけでは消えない」が落ちる
  sed 's|const s = pick(open) ?? pick(came);|const s = pick(open);|' site/lib/leadPlan.ts > /tmp/lead-close.ts
  LEAD_TS=/tmp/lead-close.ts node site/selftest/leadplan_selftest.mjs`;

if (process.argv.includes("--hint")) {
  console.log(BREAK_HINT);
  process.exit(0);
}

/* ------------------------------------------------------------------ 組み立て
   本物の木をそのまま組み立てる（`@/…` は tsconfig の paths で引き、require のときに差し替える）。
   **本体は写しを置かずに本物を持ち込む**——写しを置くと、本体を直したのに確かめが古いまま通る。
   落ちることを確かめる写し（`LEAD_TS` `WEEK_TS`）だけ、1本ずつ組み立て直して差し替える。
   `lib/leadPlan.ts` が滞在の表と国の記録まで読むようになったので（#1276）、
   前の「隣に並べてから組む」形では、並べる本数を足すたびにここが古くなる。 */
const WORK = mkdtempSync(join(tmpdir(), "leadplan-src-"));
const OUT = mkdtempSync(join(tmpdir(), "leadplan-out-"));
const TSC = join(SITE, "node_modules", ".bin", "tsc");

writeFileSync(
  join(WORK, "tsconfig.json"),
  JSON.stringify({
    compilerOptions: {
      target: "ES2022",
      lib: ["ES2022", "DOM"],
      module: "commonjs",
      moduleResolution: "node",
      esModuleInterop: true,
      skipLibCheck: true,
      /* 型の粗さは `npx tsc --noEmit` が見る。ここで欲しいのは動く JS だけ */
      strict: false,
      noEmitOnError: false,
      outDir: OUT,
      rootDir: SITE,
      baseUrl: SITE,
      paths: { "@/*": ["./*"] },
      typeRoots: [join(SITE, "node_modules", "@types")],
      types: ["node"],
    },
    files: [join(LIB, "leadPlan.ts"), join(LIB, "week.ts")],
  }),
);
try {
  execFileSync(TSC, ["-p", join(WORK, "tsconfig.json")], { stdio: "pipe" });
} catch {
  /* 型の文句で 1 を返しても、JS は書き出されている（`islechapter_selftest.mjs` と同じ） */
}

function swap(src, rel) {
  const real = join(SITE, `${rel}.ts`);
  if (src === real) return;
  const name = rel.split("/").at(-1);
  const tmp = join(WORK, `${name}.ts`);
  copyFileSync(src, tmp);
  try {
    execFileSync(TSC, [tmp, "--outDir", WORK, "--module", "commonjs", "--target", "es2022", "--skipLibCheck"], {
      stdio: "pipe",
    });
  } catch {
    /* `@/…` の型は引けないが、JS は出る */
  }
  copyFileSync(join(WORK, `${name}.js`), join(OUT, `${rel}.js`));
}
swap(LEAD_SRC, "lib/leadPlan");
swap(WEEK_SRC, "lib/week");

const orig = Module._resolveFilename;
Module._resolveFilename = function (request, ...rest) {
  if (request.startsWith("@/")) return orig.call(this, join(OUT, request.slice(2)), ...rest);
  return orig.call(this, request, ...rest);
};

const req = createRequire(import.meta.url);
const { planBoard, leadPlan, planAheadCount, isMovePlan, stayHere, stayNext, upNext, countdownDay } = req(
  join(OUT, "lib", "leadPlan.js"),
);
const { weekAhead, weekRowPast } = req(join(OUT, "lib", "week.js"));
/** 企画の表と滞在の表は**本物**（`site/content/plans.ts` `stays.ts`）。写しを置かない */
const { PLANS, planPhase, nextPlan } = req(join(OUT, "content", "plans.js"));
const { STAYS } = req(join(OUT, "content", "stays.js"));
if (!PLANS?.length || !STAYS?.length || typeof stayHere !== "function") {
  console.log("\n数えるものが無い: 企画の表・滞在の表・lib/leadPlan.ts の口のどれかが読めなかった");
  process.exit(2);
}

console.log(`# 組み立てた本体: ${LEAD_SRC}`);
console.log(`#               ${WEEK_SRC}`);
console.log(`# 企画の表: ${PLANS.length}件 / 滞在の表: ${STAYS.length}行`);

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
/* 分母は**移動でない企画**。移動の企画は滞在の表が持つ事実の写しで、「これから」に入らない（5b） */
const NOT_MOVE = PLANS.filter((p) => !isMovePlan(p));
check(
  `本番の表を、ぜんぶ仕分けている（移動でない ${NOT_MOVE.length}件。分母が0ではない）`,
  NOT_MOVE.length > 0 && real.during.length + real.before.length + real.after.length === NOT_MOVE.length,
);
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
const plans = req(join(OUT, "content", "plans.js"));
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

/* **日付では終わらない企画が表に在ると、「ぜんぶ行ってきた日」は来ない。**
   `endsWhen` だけを持つもの（いまは移動の企画。「つぎの国へ移ったら」）は、終わった日が入るまで
   ずっと「いま」なので、`nextPlan()` がそれを返して対照が効かない。**対照は、その企画に仮の
   終わった日を入れてから当てる**——見たいのは「ぜんぶ行ってきた日に2つが違う答えを出すか」。
   仮の日は、当て終わったら外す。 */
const OPEN = PLANS.filter((p) => p.date && p.endsWhen && !p.until && !p.done);
for (const p of OPEN) p.done = p.date;
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
for (const p of OPEN) delete p.done;

/* ----------------------------------------------------- 5b. 滞在から引く（#1276）

   **日を焼かない。** 表のいちばん新しい2行と、表の外の日（翌年）で当てる。 */
const iso = (d) => new Date(d.getTime() + 9 * 3600e3).toISOString().slice(0, 10);
const addDays = (day, n) => {
  const [y, m, d] = day.split("-").map(Number);
  return noon(y, m, d + n);
};

/* (1) 移動の企画は「これから」に入らない。**どの日に当てても。** 分母を先に出す */
const MOVES = PLANS.filter((p) => isMovePlan(p));
check(`移動の企画を見分けている（${MOVES.map((p) => p.id).join(" ")}）`, MOVES.length >= 3, `数えた=${MOVES.length}`);
/* 落とした移動の企画は、滞在の表が持っている（同じ日に着いた行が在る）。無ければ、落とした日に居場所が消える */
const orphan = MOVES.filter((p) => !STAYS.some((x) => x.from === p.date));
check(
  "移動の企画の日は、どれも滞在の表の着いた日に在る（落としても居場所は消えない）",
  orphan.length === 0,
  orphan.map((p) => `${p.id} ${p.date}`).join(" "),
);
const firstMove = MOVES.map((p) => p.date).sort()[0];
const sweep = [];
for (let i = -1; i <= 60; i++) sweep.push(addDays(firstMove, i));
sweep.push(AFTER_ALL);
const leaked = sweep.filter(
  (d) => upNext(d).plans.some((p) => isMovePlan(p)) || isMovePlan(leadPlan(d) ?? { tags: [] }),
);
check(
  `${firstMove} の前の日から60日と翌年、「これから」に移動の企画が1件も入らない（${sweep.length}日）`,
  leaked.length === 0,
  leaked
    .slice(0, 3)
    .map((d) => `${iso(d)}: ${upNext(d).plans.filter(isMovePlan).map((p) => p.id).join(" ")}`)
    .join(" / "),
);
/* どの日も［いまここ］が在る（0件にならない） */
const noHere = sweep.filter((d) => !upNext(d).here);
check(`同じ ${sweep.length}日、どの日も［いまここ］が在る`, noHere.length === 0, noHere.map(iso).slice(0, 3).join(" "));

/* (2) 本番の表のいちばん新しい2行で、着いた日に入れ替わる */
const byFrom = [...STAYS].sort((a, b) => a.from.localeCompare(b.from));
const [prev, last] = byFrom.slice(-2);
const eve = addDays(last.from, -1);
const arrive = addDays(last.from, 0);
check(`${last.from} の前の日、［いまここ］は ${prev.country}`, stayHere(eve)?.country === prev.country, `出た=${stayHere(eve)?.country}`);
check(`その日、［つぎ］は ${last.country}`, stayNext(eve)?.country === last.country, `出た=${stayNext(eve)?.country}`);
check(`${last.from}、［いまここ］は ${last.country}`, stayHere(arrive)?.country === last.country, `出た=${stayHere(arrive)?.country}`);
for (const n of [1, 30]) {
  const d = addDays(last.from, n);
  check(`${iso(d)}（${n}日後）も ${last.country}`, stayHere(d)?.country === last.country, `出た=${stayHere(d)?.country}`);
}
check(
  `翌年（${iso(AFTER_ALL)}）も［いまここ］は ${last.country}（日付で消えない）`,
  stayHere(AFTER_ALL)?.country === last.country,
  `出た=${stayHere(AFTER_ALL)?.country}`,
);
/* 日本時間の0時で替わる（島の札と同じ日。`lib/guideDay.ts`） */
const [ly, lm, ld] = last.from.split("-").map(Number);
const jst0 = new Date(Date.UTC(ly, lm - 1, ld) - 9 * 3600e3);
check(
  `日本時間 ${last.from} 0:00 ちょうどから ${last.country}、その1ミリ秒前は ${prev.country}`,
  stayHere(jst0)?.country === last.country && stayHere(new Date(jst0.getTime() - 1))?.country === prev.country,
  `0:00=${stayHere(jst0)?.country} 1ms前=${stayHere(new Date(jst0.getTime() - 1))?.country}`,
);
/* 名前が引ける（国の記録の名前か、記録の無い国の行の `name`）。slug のままを出さない */
check(
  `［いまここ］に名前がある（${stayHere(arrive)?.place}）`,
  !!stayHere(arrive)?.place && stayHere(arrive)?.place !== last.country,
);

/* (3) 作った表で、つぎの行が先に足された日。**本番の表には触らない**（別の表を渡す） */
const row = (country, from, to = "", extra = {}) => ({ country, name: country, cities: [], from, to, ...extra });
const A = row("a", "2026-11-12", "2026-11-20");
const B = row("b", "2026-11-21", "2026-12-05");
const C = row("c", "2026-12-05", "");
const ahead = [A, B, C];
const at = (day) => addDays(day, 0);
check(
  "つぎの行が先に足されても、着く前の日はいまの国（b）",
  stayHere(at("2026-12-04"), ahead)?.country === "b",
  `出た=${stayHere(at("2026-12-04"), ahead)?.country}`,
);
check("その日の［つぎ］は c", stayNext(at("2026-12-04"), ahead)?.country === "c");
check(
  "着いた日（境目の日は入った国が取る）は c",
  stayHere(at("2026-12-05"), ahead)?.country === "c",
  `出た=${stayHere(at("2026-12-05"), ahead)?.country}`,
);
check("着いた日からは［つぎ］が無い", stayNext(at("2026-12-05"), ahead) === undefined);
/* 対照: 「終わりの空いた行」をそのまま［いまここ］にすると、着く前から c になる */
check("対照：終わりの空いた行は、着く前の日に c を指す（＝これで引くと早く替わる）", ahead.find((x) => !x.to)?.country === "c");

/* (4) 日付が過ぎただけでは消えない（M-22）。`to` が過ぎても、つぎの行が無ければその行 */
const closedRows = [A];
check(
  "終わりの日が過ぎても、つぎの行が無ければ［いまここ］のまま",
  stayHere(at("2027-02-01"), closedRows)?.country === "a",
  `出た=${stayHere(at("2027-02-01"), closedRows)?.country}`,
);
/* 対照: 日付で閉じる読みかただと、ここで0件になる */
const byDate = closedRows.filter((x) => x.from <= "2027-02-01" && (!x.to || "2027-02-01" <= x.to));
check("対照：日付で閉じる読みかたでは、同じ日に0件になる", byDate.length === 0);

/* (5) 枝の行が本線の行に重なっていても、終わった枝に取られない（アルメニアとイラン国境。W8 まで） */
const branch = [row("main", "2026-04-19", "2026-05-23"), row("branch", "2026-04-29", "2026-05-08")];
check(
  "枝の行の中の日は枝、枝が終わったあとは本線",
  stayHere(at("2026-05-01"), branch)?.country === "branch" && stayHere(at("2026-05-10"), branch)?.country === "main",
  `05-10=${stayHere(at("2026-05-10"), branch)?.country}`,
);

/* (6) 街が1つなら「国・街」、分からなければ国だけ（推測で埋めない） */
check(
  "街が1つの行は「国・街」",
  stayHere(at("2026-11-13"), [row("x", "2026-11-12", "", { name: "ブルガリア", cities: ["ソフィア"] })])?.place ===
    "ブルガリア・ソフィア",
);
check(
  "街が空の行は国だけ",
  stayHere(at("2026-11-13"), [row("x", "2026-11-12", "", { name: "ルーマニア" })])?.place === "ルーマニア",
);

/* (7) 「あと何日」は同じ表から。つぎの滞在の着く日 */
check(
  "「あと何日」の日は、つぎの滞在の着く日",
  countdownDay(at("2026-12-01"), undefined, ahead) === "2026-12-05",
  `出た=${countdownDay(at("2026-12-01"), undefined, ahead)}`,
);
check(
  "つぎの滞在も先の回も無い日（翌年）は、数えない",
  countdownDay(AFTER_ALL, undefined, ahead) === undefined,
  `出た=${countdownDay(AFTER_ALL, undefined, ahead)}`,
);
/* 本番の表で: 移動の企画の日しか無い日に、その日から数えない（＝企画の表を読んでいない） */
const cdBad = sweep.filter((d) => {
  const c = countdownDay(d);
  return c && !STAYS.some((x) => x.from === c && x.from > iso(d)) && !NOT_MOVE.some((p) => p.date === c);
});
check(
  `${sweep.length}日、「あと何日」の日は、つぎの滞在か移動でない回の日だけ`,
  cdBad.length === 0,
  cdBad.slice(0, 3).map((d) => `${iso(d)}→${countdownDay(d)}`).join(" "),
);

/* (8) 企画の表の中の、移動の企画どうしの閉じかた（`closeStays`）。**表紙はもう読まないが、
   `/next` の札（「行ってきた」へ下がる日）はまだこれで決まる**（W3 で畳むまで）。
   2026-11-19 にルーマニアを足した日、ブルガリアの1件は人が `done` を入れる形で、
   移った日に先頭が前の国のままだった（#1308）。作った表で、入れかたそのものを当てる */
const { closeStays, NEXT_MOVE } = plans;
const stayRows = [
  plan("a", "2026-11-12", { endsWhen: NEXT_MOVE }),
  plan("b", "2026-11-21", { endsWhen: NEXT_MOVE }),
];
const closedPlans = closeStays(stayRows);
check("前の移動の企画は、つぎの移動の企画の前の日で終わる", closedPlans[0].until === "2026-11-20", `出た=${closedPlans[0].until}`);
check("いちばん新しい移動の企画には、終わりを入れない", closedPlans[1].until === undefined, `出た=${closedPlans[1].until}`);
check(
  "人が書いた終わりには触らない",
  closeStays([{ ...stayRows[0], done: "2026-11-18" }, stayRows[1]])[0].until === undefined,
);
check(
  "月をまたぐ前の日も読める（12-01 → 11-30）",
  closeStays([stayRows[0], plan("c", "2026-12-01", { endsWhen: NEXT_MOVE })])[0].until === "2026-11-30",
);
check(
  "移った日、前の移動の企画は「行ってきた」",
  planPhase(closedPlans[0], noon(2026, 11, 21)) === "after" && planPhase(closedPlans[0], noon(2026, 11, 20)) === "during",
);
check(
  "対照：`closeStays` を通さない表では、移った日も前の移動の企画が「いま」",
  planPhase(stayRows[0], noon(2026, 11, 21)) === "during",
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

/* 表紙の部品が、言わない字を持っていない（あやと 2026-11-18。#1276）。**注を落としてから見る**——
   経緯の注には、その字そのものが出てくる */
const NEXTUP = process.env.NEXTUP_TSX || join(SITE, "components", "live", "NextUp.tsx");
const upCode = readFileSync(NEXTUP, "utf8")
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/^\s*\/\/.*$/gm, "");
const said = ["へ移動", "進行中", "ぜんぶ見る"].filter((w) => upCode.includes(w));
check("表紙の「これから」（NextUp.tsx）が「へ移動」「進行中」「ぜんぶ見る」を字に持たない", said.length === 0, said.join(" "));
check("表紙の「これから」が、滞在から引く口（upNext）を読んでいる", /\bupNext\s*\(/.test(upCode));

console.log(`\n${OK + BAD}件中 ${OK}件通った`);
if (BAD) {
  console.log(`\n${BREAK_HINT}`);
  process.exit(1);
}
