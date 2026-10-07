/**
 * 画面の先頭に出す企画を、1つ選ぶ。**無ければ「無い」と返す。**
 *
 * ## なぜ `content/plans.ts` の `nextPlan()` を画面から外したか
 *
 * あちらは、まだ来ていない企画が1件も無くなると
 * **`big` の付いた大きい企画（＝もう行ってきた北欧旅）を返す。**
 * 「次の大物を先に告知しておきたい」ための受けだったが、受けが働いた日に
 * 画面がそれを「いま、いちばん近い企画」として出す。
 *
 * 実際にそうなっていた。2026-09-12 に北欧旅が始まり、9/27 に終わり、
 * **10/07 まで25日ぶん、表紙が「行ってきた／ヒッチハイクで北欧へ」を
 * 「いま、いちばん近い企画」の見出しの下に出していた。** `/now` の札も
 * 同じものを指していた。あやとの言葉（2026-10-07 / #673）:
 *
 * > 「いま、いちばん近い企画」が、もう行ってきた北欧旅
 * > → とくになし。これからのことで、行ってきたが出てるのはバグかと。
 *
 * **先の予定が0件なのは、正常な状態。** 足すものは無い。だから直すのは
 * 「0件のときに過去のものを出す」側で、**0件のときは何も返さない**のが正しい。
 *
 * ## 0件は、画面の側で「数えた証拠」と一緒に出す
 *
 * ここが `undefined` を返した日に、画面がただ消えると「読めていない」と
 * 同じ絵になる（`docs/island-standards.md` §10 §15）。だから
 * `pastPlans()` で**行ってきた企画の数**も出せるようにしてある。
 * 0 を、何件見てそうなったかと並べて置けるようにするため。
 *
 * ## `nextPlan()` は残してある。**画面から読まない**
 *
 * 企画の表（`site/content/*.ts`）は島のデータで、ここから書き換えない。
 * 代わりに、**画面が `nextPlan` を読んでいないこと**を
 * `site/selftest/leadplan_selftest.mjs` が数える。戻ってきたら赤くなる。
 */
import { livePlans, planPhase, type Plan, type PlanPhase } from "@/content/plans";

/** 島から届く2つの日（着いた日・旅が終わった日）。`content/plans.ts` の `livePlans`。 */
export type PlanFacts = { arrived?: string | null; ended?: string | null } | null;

/** 日付の早い順。日付の無いものは後ろ。 */
const byDate = (a: Plan, b: Plan) => (a.date ?? "9999").localeCompare(b.date ?? "9999");

/**
 * 企画を、3つの状態に仕分けたもの。
 *
 * **`lead` は `during` → `before` の順。** 旅の最中に「次はこれ」と別のものを
 * 出すと、いま起きていることが画面から消える（`nextPlan()` の注と同じ決め）。
 * どちらも無ければ `undefined`——**`after` は1件も混ざらない。**
 */
export type PlanBoard = {
  /** 先頭に出す1件。**先の予定が0件なら `undefined`** */
  lead: Plan | undefined;
  /** いま行っているもの */
  during: Plan[];
  /** まだ来ていないもの */
  before: Plan[];
  /** 行ってきたもの。**0件のときに「何件見たか」として出す** */
  after: Plan[];
};

/**
 * その日の企画の仕分け。
 *
 * @param today 数える日。**画面が出るまでは焼いた日**（`BUILT_AT`）を渡す。
 *   `new Date()` を既定にすると、焼いた HTML とブラウザの最初の描画が
 *   別の企画を指して水あわせが落ちる
 * @param facts 島から届いた日（`/island-api/state` の `nordic`）
 */
export function planBoard(today: Date, facts?: PlanFacts): PlanBoard {
  const sorted = [...livePlans(facts)].sort(byDate);
  const of = (p: Plan): PlanPhase => planPhase(p, today);
  const during = sorted.filter((p) => of(p) === "during");
  const before = sorted.filter((p) => of(p) === "before");
  const after = sorted.filter((p) => of(p) === "after");
  return { lead: during[0] ?? before[0], during, before, after };
}

/**
 * 画面の先頭に出す企画。**無ければ `undefined`。**
 *
 * `content/plans.ts` の `nextPlan()` との違いはここ1点で、
 * **行ってきた企画に落ちない。**
 */
export function leadPlan(today: Date, facts?: PlanFacts): Plan | undefined {
  return planBoard(today, facts).lead;
}

/** これから（いま行っている＋まだ来ていない）の件数。 */
export function planAheadCount(today: Date, facts?: PlanFacts): number {
  const b = planBoard(today, facts);
  return b.during.length + b.before.length;
}
