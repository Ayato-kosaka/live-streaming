/**
 * **表紙の「これから」が、滞在の表から居場所を出し、過去のものを「これから」として出さないか。**
 *
 *     node site/selftest/leadplan_selftest.mjs
 *
 * ## なぜ要るか
 *
 * (A) 前の告知の札の表（`content/plans.ts`。#1277 で畳んだ）の `nextPlan()` は、まだ来ていない企画が
 * 1件も無くなると**もう行ってきた北欧旅を返した。** 2026-10-07 まで**25日ぶん**、表紙に
 * 「行ってきた／ヒッチハイクで北欧へ」が出ていた（あやと 2026-10-07 / #673）。
 * **先の予定が0件なのは正常な状態**なので、見張るのは「0件のときに画面が過去のものを出すか」。
 *
 * (B) 国を移る日も企画の行（「ブルガリア・ソフィアへ移動」）だったので、表紙は着いたあとも
 * 「へ移動」「進行中」と言い続けた（あやと 2026-11-18「移動はもうしちゃってる」。#1276）。
 * いまは居場所を滞在の表（`content/stays.ts`）から引く。［いまここ］は**日付で消えず**、
 * **つぎの行が着いた日に入れ替わる**（`docs/spec/model.md` M-22・6章「引きかた」）。
 * 3段目（これからの企画・定例の配信のつぎの回）は企画の表と日を持つお題から引く（M-32。#1277）。
 *
 * ## 何を見ているか
 *
 *  1. **本番の表 × 本番の今日** —— 先の回が0件なら先頭が無い。行ってきた企画は数で出る
 *  2. 先の予定を1件足したら、それが先頭（**いままでの合格が変わらない**）
 *  3. いま行っている企画があれば、まだ来ていないものより先。期間のある本物の企画は、期間の中の日に「いま」
 *  4. どんな日に当てても、**行ってきた企画は先頭にならない**
 *  5. **対照**——行ってきたものを混ぜた並びなら、同じ日に何かが出る（§15）
 *  5b. **滞在から引く**——移動は「これから」に入らない／［いまここ］は着いた日に入れ替わり、
 *     その前の日は前の国／翌年も消えない／つぎの行が先に足されても着くまではいまの国／
 *     日本時間の0時で替わる／「あと何日」は同じ表から。対照は「終わりの空いた行」と「日付で閉じる」の2つの読みかた
 *  6. （「今週、なにをするんだろう」の過ぎた行。`/now` の島だよりごと畳んだので外した。#1278）
 *  7. **畳んだ表を画面が読んでいない**。表紙の部品が「へ移動」「進行中」「企画を、ぜんぶ見る」を持たない
 *  8. **名刺と `/about` の「いま」が、［いまここ］と同じ1本**（`hereNow`。#1278）。押した先はいまの旅の島で、
 *     `/now` へ送らない。畳んだ部品・表（`/now` の面・`NowLive`・`lib/place`・`lib/week`・島の景色）を
 *     画面が読んでいない。画面が Firestore の `current` の欄（place・theme・word・week）を読んでいない
 *
 * ## 壊した写しで落ちることまで見る（`docs/island-misses.md` #99 #100）
 *
 * 写しの作りかたは下の `BREAK_HINT` に書いてある（`--hint` で出る）。
 */
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdtempSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
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

const BREAK_HINT = `わざと壊して、ここが落ちることを見るには:

  # 1) 0件のときに行ってきた企画まで並べる。2026-10-07 までの画面 → 2・4・5 が落ちる
  sed 's|plans: \\[...during, ...before\\] }|plans: [...during, ...before, ...ahead.filter((a) => phaseOf(a, today) === "after")] }|' \\
    site/lib/leadPlan.ts > /tmp/lead-old.ts
  LEAD_TS=/tmp/lead-old.ts node site/selftest/leadplan_selftest.mjs

  # 2) 名刺の「いま」を［いまここ］から引かない（前の受け皿の字に戻す）→ 8 が落ちる
  sed 's|place: stayHere(today, rows)?.place ?? ""|place: "世界のどこか"|' site/lib/leadPlan.ts > /tmp/lead-here.ts
  LEAD_TS=/tmp/lead-here.ts node site/selftest/leadplan_selftest.mjs

  # 3) 企画の期間を読まない（始まった日1日で終わる）→ 3 の「期間の中の日に、いま」が落ちる
  sed 's|...(p.range && p.range\\[1\\] > p.date ? { until: p.range\\[1\\] } : {}),||' site/lib/leadPlan.ts > /tmp/lead-range.ts
  LEAD_TS=/tmp/lead-range.ts node site/selftest/leadplan_selftest.mjs

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
   落ちることを確かめる写し（`LEAD_TS`）だけ、1本ずつ組み立て直して差し替える。
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
    files: [join(LIB, "leadPlan.ts")],
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

const orig = Module._resolveFilename;
Module._resolveFilename = function (request, ...rest) {
  if (request.startsWith("@/")) return orig.call(this, join(OUT, request.slice(2)), ...rest);
  return orig.call(this, request, ...rest);
};

const req = createRequire(import.meta.url);
const { AHEAD, phaseOf, leadPlan, stayHere, stayNext, upNext, countdownDay, hereNow } = req(join(OUT, "lib", "leadPlan.js"));
const { chapterNow } = req(join(OUT, "content", "chapters.js"));
/** 企画の表と滞在の表は**本物**（`site/content/projects.ts` `stays.ts`）。写しを置かない */
const { PROJECTS } = req(join(OUT, "content", "projects.js"));
const { STAYS } = req(join(OUT, "content", "stays.js"));
if (!AHEAD?.length || !PROJECTS?.length || !STAYS?.length || typeof stayHere !== "function") {
  console.log("\n数えるものが無い: 企画の表・滞在の表・lib/leadPlan.ts の口のどれかが読めなかった");
  process.exit(2);
}

console.log(`# 組み立てた本体: ${LEAD_SRC}`);
console.log(`# これから の元: ${AHEAD.length}件（企画 ${PROJECTS.length}件＋日を持つお題） / 滞在の表: ${STAYS.length}行`);

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
/** 表を仕分ける。**`phaseOf` は本物のまま**——3つの状態の決めかたを写しで持つと、本体を直しても確かめが古いまま通る */
const board = (rows, today) => {
  const of = (a) => phaseOf(a, today);
  return {
    during: rows.filter((a) => of(a) === "during"),
    before: rows.filter((a) => of(a) === "before"),
    after: rows.filter((a) => of(a) === "after"),
  };
};
const real = board(AHEAD, TODAY);
const realLead = upNext(TODAY).plans[0];
console.log(
  `  本番: いま行っている ${real.during.length} / まだ来ていない ${real.before.length} / ` +
    `行ってきた ${real.after.length}（きょう ${TODAY.toISOString().slice(0, 10)}）`,
);
/* **分母を印字してから読む**（§15）。先が0件なのは正常な状態なので、
   「0件だった」だけでは、数えたのか数え損ねたのか分からない */
check(
  `本番の表を、ぜんぶ仕分けている（${AHEAD.length}件。分母が0ではない）`,
  AHEAD.length > 0 && real.during.length + real.before.length + real.after.length === AHEAD.length,
);
check(
  "企画の表の行は、どれも「これから」の元に入っている",
  PROJECTS.every((p) => AHEAD.some((a) => a.kind === "project" && a.id === p.slug)),
);
check(
  "日を持つお題（定例の配信の回）も入っている（10月の月末配信）",
  AHEAD.some((a) => a.kind === "stream" && a.id === "monthly-2026-10"),
);
if (real.during.length + real.before.length === 0) {
  check("先が0件の日、先頭に出す企画は無い", realLead === undefined, `出た=${realLead?.id}`);
  check("そのとき、`upNext` の3段目も0件", upNext(TODAY).plans.length === 0);
  check("行ってきた企画は、数として出せる（0件の証拠）", real.after.length > 0);
} else {
  check("先が在る日は、先頭に出す企画も在る", realLead !== undefined);
  check("先頭に出す企画は、行ってきたものではない", phaseOf(realLead, TODAY) !== "after");
}

/* --------------------------- 2〜4. 作った日で、5通りを当てる（両側を見る） */

/** 1件ぶんの型の最小。**本番の表には触らない**（別の表を渡して当てる） */
const plan = (id, date, extra = {}) => ({ id, kind: "project", title: id, date, href: "/board", ...extra });
const leadWith = (rows, today) => upNext(today, STAYS, rows).plans[0];

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
    rows: [plan("soon", "2026-10-08"), plan("now", "2026-10-01", { until: "2026-10-20" })],
    want: "now",
  },
  {
    label: "ぜんぶ行ってきた（＝いまの本番）",
    rows: [plan("past", "2026-09-11"), plan("long-past", "2026-09-11", { until: "2026-09-27" })],
    want: undefined,
  },
  {
    label: "行ってきた長い企画が在っても、先の予定を飛ばさない",
    rows: [plan("long-past", "2026-09-11", { until: "2026-09-27" }), plan("soon", "2026-10-08")],
    want: "soon",
  },
];
for (const c of CASES) {
  const got = leadWith(c.rows, T);
  check(`${c.label} → ${c.want ?? "（出さない）"}`, got?.id === c.want, `出た=${got?.id}`);
}

/* 本物の企画の期間（`range`）が効いているか。**期間のある企画ぜんぶ**の、始まった翌日に「いま」 */
const ranged = PROJECTS.filter((p) => p.range && p.range[1] > p.date);
const dayAfter = (p) => {
  const [y, m, d] = p.date.split("-").map(Number);
  return noon(y, m, d + 1);
};
const notDuring = ranged.filter((p) => {
  const d = dayAfter(p);
  return !upNext(d).plans.some((a) => a.id === p.slug && phaseOf(a, d) === "during");
});
check(
  `期間のある企画（${ranged.length}件）は、始まった翌日も「いま」として「これから」に出る`,
  ranged.length >= 3 && notDuring.length === 0,
  notDuring.map((p) => p.slug).join(" "),
);

/* ------------------------------------------- 5. 対照。直したものが効いているか

   **日を焼かない。** 表のいちばん後ろの日の、その翌年に当てる（`docs/island-misses.md` #193 の決めごと4）。 */
const LAST = AHEAD.map((a) => a.until ?? a.date).sort().at(-1);
const AFTER_ALL = noon(Number(LAST.slice(0, 4)) + 1, 1, 15);
check(
  `ぜんぶ行ってきた日（${LAST} の翌年）に、先頭は出ない`,
  leadPlan(AFTER_ALL) === undefined,
  `出た=${leadPlan(AFTER_ALL)?.id}`,
);
/* 対照: 行ってきたものも混ぜた並び（前の `nextPlan()` の受け）なら、同じ日に何かが出る。
   ここが空なら、上の「出ない」は表が空なだけで何も言っていない */
check("対照：行ってきたものを混ぜた並びなら、同じ日に1件以上ある", board(AHEAD, AFTER_ALL).after.length > 0);

/* ----------------------------------------------------- 5b. 滞在から引く（#1276）

   **日を焼かない。** 表のいちばん新しい2行と、表の外の日（翌年）で当てる。 */
const iso = (d) => new Date(d.getTime() + 9 * 3600e3).toISOString().slice(0, 10);
const addDays = (day, n) => {
  const [y, m, d] = day.split("-").map(Number);
  return noon(y, m, d + n);
};

/* (1) 移動は「これから」に入らない。移動は企画ではない（M-4）——企画の表にも、日を持つお題にも、移る行が無い */
const moveLike = AHEAD.filter((a) => /移動/.test(a.title) || STAYS.some((x) => x.country === a.id && x.from === a.date));
check(`「これから」の元（${AHEAD.length}件）に、国を移る行が1件も無い`, moveLike.length === 0, moveLike.map((a) => a.id).join(" "));
/* 当てる日は、滞在の表の新しいほうから3つ目の着いた日の前の日から60日（国を2度移る）と、翌年 */
const firstMove = [...STAYS].sort((a, b) => a.from.localeCompare(b.from)).at(-3).from;
const sweep = [];
for (let i = -1; i <= 60; i++) sweep.push(addDays(firstMove, i));
sweep.push(AFTER_ALL);
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
  countdownDay(at("2026-12-01"), ahead, []) === "2026-12-05",
  `出た=${countdownDay(at("2026-12-01"), ahead, [])}`,
);
check(
  "つぎの滞在も先の回も無い日（翌年）は、数えない",
  countdownDay(AFTER_ALL, ahead, []) === undefined,
  `出た=${countdownDay(AFTER_ALL, ahead, [])}`,
);
/* 本番の表で: 「あと何日」の日は、つぎの滞在の着く日か「これから」の元の日だけ */
const cdBad = sweep.filter((d) => {
  const c = countdownDay(d);
  return c && !STAYS.some((x) => x.from === c && x.from > iso(d)) && !AHEAD.some((a) => a.date === c);
});
check(
  `${sweep.length}日、「あと何日」の日は、つぎの滞在か「これから」の回の日だけ`,
  cdBad.length === 0,
  cdBad.slice(0, 3).map((d) => `${iso(d)}→${countdownDay(d)}`).join(" "),
);

/* --------------------------- 7. 畳んだ表を、画面が読んでいないこと

   **ここが構造の見張り。** 告知の札の表（`content/plans.ts`）と日→企画の表（`content/planDays.ts`）は
   #1277 で消した。誰かが戻して画面が読み直したら、移動の行と「行ってきた」の受けが一緒に戻る。
   コメントの中の名前は数えない——経緯は各所に書いてあるので、**`import` の行だけを見る。** */
const ROOTS = [join(SITE, "app"), join(SITE, "components"), join(SITE, "lib"), join(SITE, "content")];
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
const importers = files.filter((f) =>
  /from\s*["'](@\/content\/|\.\/|\.\.\/content\/)plan(s|Days)["']/.test(readFileSync(f, "utf8")),
);
check(
  `画面（${files.length}本）は、畳んだ表（plans・planDays）を読んでいない`,
  importers.length === 0,
  importers.map((f) => f.slice(SITE.length + 1)).join(" "),
);
const back = ["plans.ts", "planDays.ts"].filter((n) => files.includes(join(SITE, "content", n)));
check("畳んだ表のファイルが無い（content/plans.ts・planDays.ts）", back.length === 0, back.join(" "));
/* **分母が0ではない**（§15）。読めていなければ、「1本も無い」は何も言っていない */
check("画面の .ts/.tsx を読めている（分母が0ではない）", files.length > 100, `数えた=${files.length}`);
/* 画面が代わりに読んでいる口（`lib/leadPlan.ts`）が、本当に使われているか */
const leadUsers = files.filter((f) => /from\s*["']@\/lib\/leadPlan["']/.test(readFileSync(f, "utf8")));
check(
  `画面は \`lib/leadPlan\` を読んでいる（${leadUsers.length}本）`,
  leadUsers.length >= 3,
  leadUsers.map((f) => f.slice(SITE.length + 1)).join(" "),
);

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

/* --------------------------- 8. 名刺と /about の「いま」（#1278）

   **名刺と `/about` の「いま ◯◯」は、表紙の［いまここ］と同じ1本**（`hereNow`）。前は Firestore の
   `island/state.current.place`（あやとが手で打つ欄）を読み、`/now` へ送っていた。打たれなくなった
   2026-09-28 から、古い字を「古ければ章か国で受ける」継ぎ当てで隠していた。 */
const hereBad = [];
const hrefBad = [];
for (const d of sweep) {
  const h = hereNow(d);
  if (h.place !== (stayHere(d)?.place ?? "")) hereBad.push(`${iso(d)}→${h.place}／［いまここ］${stayHere(d)?.place}`);
  /* 押した先はいまの章の島。**`/now` にも表紙にも送らない**（M-31） */
  if (h.href !== `/island/${chapterNow(d).slug}` || h.trip !== chapterNow(d).name) hrefBad.push(`${iso(d)}→${h.href}`);
}
check(`${sweep.length}日、名刺の「いま」は［いまここ］と同じ字`, sweep.length > 0 && hereBad.length === 0, hereBad.slice(0, 3).join(" "));
check(`${sweep.length}日、押した先はいまの旅の島（/island/<章>）`, hrefBad.length === 0, hrefBad.slice(0, 3).join(" "));
/* 本番の今日。**滞在の表の最後の行**（いまここ）と同じ国が出る */
check(
  `きょう（${iso(TODAY)}）の名刺は「${hereNow(TODAY).place}」で、空ではない`,
  !!hereNow(TODAY).place && hereNow(TODAY).place === stayHere(TODAY)?.place,
);

/* 部品が、Firestore を読まず `hereNow` を読む。**注を落としてから見る**（経緯の注に名前が出てくる） */
const strip = (t) =>
  t
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
const code = (f) => strip(readFileSync(f, "utf8"));
const NOWPLACE = process.env.NOWPLACE_TSX || join(SITE, "components", "home", "NowPlace.tsx");
const npCode = code(NOWPLACE);
check("名刺の「いま」の部品（NowPlace.tsx）が hereNow を読んでいる", /\bhereNow\s*\(/.test(npCode));
const STATE_READ = /\b(loadState|getState)\b|lib\/(liveStats|api)["']/;
check("名刺の「いま」の部品が、島の便り（/island-api/state）を読まない", !STATE_READ.test(npCode));
const cardUsers = [join(SITE, "components", "home", "Meishi.tsx"), join(SITE, "app", "about", "page.tsx")].filter(
  (f) => /from\s*["'](\.\/|@\/components\/home\/)NowPlace["']/.test(readFileSync(f, "utf8")),
);
check("名刺（Meishi.tsx）と /about が、同じ部品（NowPlace）を読んでいる", cardUsers.length === 2, `読んでいる=${cardUsers.length}`);

/* 畳んだ面・部品・表。誰かが戻して画面が読み直したら、`current` の継ぎ当てが一緒に戻る。**`import` の行だけを見る** */
const FOLDED = /from\s*["']@\/(components\/live\/NowLive|components\/me\/TripTools|components\/island\/Theme|content\/tripPlaces|content\/place|lib\/place|lib\/week)["']/;
const foldedUsers = files.filter((f) => FOLDED.test(readFileSync(f, "utf8")));
check("画面は、畳んだ部品と表（NowLive・TripTools・Theme・tripPlaces・place・week）を読んでいない", foldedUsers.length === 0,
  foldedUsers.map((f) => f.slice(SITE.length + 1)).join(" "));
const gone = [
  ["app", "now"], ["components", "live", "NowLive.tsx"], ["components", "me", "TripTools.tsx"],
  ["components", "island", "Theme.tsx"], ["content", "tripPlaces.ts"], ["content", "place.ts"],
  ["lib", "place.ts"], ["lib", "week.ts"],
].filter((p) => existsSync(join(SITE, ...p)));
check("畳んだ面と部品のファイルが無い（app/now ほか8つ）", gone.length === 0, gone.map((p) => p.join("/")).join(" "));
/* 画面が `current` の欄を読む形。**島の便りで残すと決めた欄は無い**（#1278）。数字（`stats`）と旅の事実（`nordic`）は別の箱 */
const CURRENT_READ = /\bcurrent\??\.(place|theme|word|week|updatedAt)\b/;
/* 対照（§15）: 読む形を拾い、注だけのものは拾わない */
check("対照: `s?.current?.place` を拾う", CURRENT_READ.test(strip("const p = (s?.current?.place ?? \"\").trim();")));
check("対照: 注の中の `current.theme` は拾わない", !CURRENT_READ.test(strip("/* current.theme */\n  // current.place\n{/* current.word */}")));
const currentUsers = files.filter((f) => CURRENT_READ.test(code(f)));
check("画面は、島の便りの欄（current.place・theme・word・week）を読んでいない", currentUsers.length === 0,
  currentUsers.map((f) => f.slice(SITE.length + 1)).join(" "));

console.log(`\n${OK + BAD}件中 ${OK}件通った`);
if (BAD) {
  console.log(`\n${BREAK_HINT}`);
  process.exit(1);
}
