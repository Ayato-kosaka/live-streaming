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
import { NEXT_MOVE, daysUntil, livePlans, planPhase, type Plan, type PlanPhase } from "@/content/plans";
import { countryNameBySlug } from "@/content/countries";
import { STAYS, type Stay } from "@/content/stays";
import { guideDay } from "@/lib/guideDay";

/**
 * 国から国へ移る企画か。**表紙・島の「あと何日」・今日の便りは、これを読まない**（#1276）。
 *
 * 移動は滞在（`content/stays.ts`）が持つ事実で、企画の表の行は写し（`docs/spec/model.md` の M-4・M-20）。
 * 企画の表から読むと、題（「ブルガリア・ソフィアへ移動」）と「進行中」がそのまま出て、
 * 着いたあとも「へ移動」と言い続けた（あやと 2026-11-18「移動はもうしちゃってる」）。
 *
 * 見分けは2つのどちらか——**札の `移動`**（北マケドニア・ブルガリア・ルーマニアの3行が持つ）と、
 * **終わりの合図 `NEXT_MOVE`**（「つぎの国へ移ったら」。移る企画しか持たない字）。
 * 日付が滞在の着いた日と同じか、では見分けない。着いた日に別の企画（祭りなど）が立つと、
 * それまで落ちる。行そのものを消すのは W3・W9（`plans.ts` の中身はここでは触らない）。
 */
export const isMovePlan = (p: Pick<Plan, "tags" | "endsWhen">): boolean =>
  p.endsWhen === NEXT_MOVE || p.tags.includes("移動");

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
  const sorted = livePlans(facts)
    .filter((p) => !isMovePlan(p))
    .sort(byDate);
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

/* ------------------------------------------------------------------ 滞在から引く
   表紙の「これから」の上2段（［いまここ］［つぎ］）は、企画ではなく滞在の表から引く
   （`docs/spec/model.md` 6章「引きかた」・M-22・M-30。#1276）。 */

/** 滞在1行を、表紙で呼ぶ名前つきで。 */
export type StayCard = Stay & {
  /** 国の名前（「ルーマニア」）。名前の持ち主は国の記録、記録の無い国だけ滞在の行（`stays.ts` の `name`） */
  countryName: string;
  /** 「ルーマニア」「ブルガリア・ソフィア」。**街が分からなければ国だけ**（推測で埋めない） */
  place: string;
};

const withPlace = (s: Stay): StayCard => {
  const countryName = s.name ?? countryNameBySlug(s.country)?.name ?? s.country;
  /* 街が2つ以上なら国だけ。並べると、どこに「いる」のかが言えない */
  return { ...s, countryName, place: s.cities.length === 1 ? `${countryName}・${s.cities[0]}` : countryName };
};

/**
 * ［いまここ］。**着いた日が今日より前（今日を含む）の行のうち、いちばん新しく着いた行。**
 *
 * - ふつうは「終わりの日が空の行」（M-13）と同じ1行になる
 * - つぎの国の行が先に足されていても（前の行の `to` が入り、つぎの行の `to` が空）、
 *   **着く日まではいまの国**。つぎの行の着いた日に入れ替わる（M-22）
 * - **日付が過ぎただけでは消えない**（M-22）。`to` が過ぎても、つぎの行が始まっていなければ、
 *   その行のまま。どの日に開いても0件にならない
 * - 枝の行が本線の行の中に重なっているとき（アルメニアとイラン国境。M-12 の残り、W8）は、
 *   **その日に終わっていない行**を先に見る（終わった枝の行に、いまの国を取られない）
 *
 * 日は日本時間で切る（`lib/guideDay.ts` の `guideDay`。島の札と同じ日に替わる）。
 */
export function stayHere(today: Date, rows: readonly Stay[] = STAYS): StayCard | undefined {
  const day = guideDay(today);
  const came = rows.filter((s) => s.from <= day);
  const open = came.filter((s) => !s.to || day <= s.to);
  const pick = (xs: Stay[]) => xs.reduce<Stay | undefined>((a, s) => (!a || s.from >= a.from ? s : a), undefined);
  const s = pick(open) ?? pick(came);
  return s && withPlace(s);
}

/** ［つぎ］。**着く日が今日より先の行のうち、いちばん近いもの。**無ければ `undefined`（6章「引きかた」） */
export function stayNext(today: Date, rows: readonly Stay[] = STAYS): StayCard | undefined {
  const day = guideDay(today);
  const s = rows
    .filter((x) => x.from > day)
    .reduce<Stay | undefined>((a, x) => (!a || x.from < a.from ? x : a), undefined);
  return s && withPlace(s);
}

/** 表紙の「これから」に出すもの、上から順に（M-32）。 */
export type UpNext = {
  here: StayCard | undefined;
  next: StayCard | undefined;
  /** 日にちの決まった回（いま行っている → まだ来ていない）。**移動の企画は入らない** */
  plans: Plan[];
};

export function upNext(today: Date, facts?: PlanFacts, rows: readonly Stay[] = STAYS): UpNext {
  const b = planBoard(today, facts);
  return { here: stayHere(today, rows), next: stayNext(today, rows), plans: [...b.during, ...b.before] };
}

/**
 * 島の「これから」のテントに貼る「あと◯日」の日（`YYYY-MM-DD`）。**無ければ `undefined`。**
 *
 * つぎの滞在の着く日と、まだ来ていない回の日のうち、**今日から数えていちばん近い日。**
 * 表紙の段と同じもの（`upNext`）から引く——テントだけ企画を読んでいると、
 * 段は「ルーマニア」なのにテントが「ルーマニアへ移動」の日から数える（#1276 の前の形）。
 * 今日の日は入る（「今日」と出る）。過ぎた日は入らない。
 */
export function countdownDay(today: Date, facts?: PlanFacts, rows: readonly Stay[] = STAYS): string | undefined {
  const u = upNext(today, facts, rows);
  return [u.next?.from, ...u.plans.map((p) => p.date)]
    .filter((d): d is string => !!d && (daysUntil(d, today) ?? -1) >= 0)
    .sort()[0];
}
