/**
 * 旅の章＝島の一覧。
 *
 * **島の連なりは、ここが唯一の出どころ。** 大きさも、住人も、船の道も、これを見て決める
 * （`docs/island-atlas.md`）。
 *
 * 章の切りかたは、`content/countries.ts` の滞在と、BigQuery の配信タイトルから決めた。
 * **手で「この島は大きめ」と決めない。** 大きさは滞在日数から計算する。
 */

export type Chapter = {
  slug: string;
  /** 島の名前。章の名前そのもの */
  name: string;
  /** 始まった日（JST） */
  from: string;
  /** 終わった日。いまも続いている章は空 */
  to: string;
  /** この章で回った国（`content/countries.ts` の slug） */
  countries: string[];
  /**
   * 本線から逸れた枝か。
   *
   * イランは、ジョージア／アルメニアから歩いて国境まで行って**また戻ってきた**。
   * 西から東への流れの中の1歩ではないので、本線の島と同じ列に置かない。
   */
  branchOf?: string;
  /** 島の性格。1行で。連なりの画面に出る */
  note: string;
  /**
   * まだ始まっていない章が、いつから「いまいる島」になるか（ISO の日時）。
   *
   * **`from` は事実の欄で、ここは予定の欄。** 出発してみたら1日ずれた、
   * ということが起きるので、実際に始まったら `from` に日付を入れて
   * ここは消す。両方あるときは `from` が勝つ。
   */
  opensAt?: string;
  /**
   * まだ始まっていない章の、予定の日数。
   *
   * 島の大きさは日数から出す決まりなので（`docs/island-atlas.md` 3章）、
   * 始まっていない章にも日数が要る。**手で大きさを決めているのではない。**
   *
   * **`content/nordic.ts` の ROUTE から数えない。** あれは区間の表で、
   * 1日に何区間進むかを持っていない（数えると18日になる）。
   * ここに入れるのは**あやとの見立て**。
   */
  plannedDays?: number;
};

export const CHAPTERS: Chapter[] = [
  {
    slug: "europe",
    name: "ヨーロッパ周遊",
    from: "2024-10-28",
    to: "2025-03-29",
    countries: ["france", "netherlands", "belgium", "hungary", "austria", "slovakia", "czech", "germany", "uk"],
    note: "配信が始まった島。週3から毎日になった",
  },
  {
    slug: "middle-east",
    name: "中東周遊",
    from: "2025-03-30",
    to: "2025-06-28",
    countries: ["turkey", "cyprus", "egypt", "jordan", "uae"],
    note: "祭りが生まれた島",
  },
  {
    slug: "caucasus",
    name: "コーカサス周遊",
    from: "2025-06-29",
    to: "",
    countries: ["azerbaijan", "georgia", "armenia"],
    note: "いまいる島。腰を据えて、なに食べよを作った",
  },
  {
    slug: "iran-walk",
    name: "イランまで歩く",
    from: "2026-04-29",
    to: "2026-05-08",
    countries: ["iran-border"],
    branchOf: "caucasus",
    note: "先へ進んだのではなく、歩いて国境まで行って戻ってきた",
  },
  {
    slug: "nordic",
    name: "北欧周遊",
    from: "",
    to: "",
    countries: [],
    note: "次の島。まだ建っていない",
    // 出発の日時。**`content/nordic.ts` の DEPART と同じ値**（ジョージア時間 23:30）。
    // あちらを読みに行かないのは、`chapters.ts` は島の連なりの画面（クライアント）が
    // 読むもので、そこに旅程の表ぜんぶ（500行＋JSON 6本）を連れてきてしまうから。
    // **DEPART を動かしたら、ここも動かす。**
    opensAt: "2026-09-11T23:30:00+04:00",
    // アウシュビッツ（クラクフ泊）→ ワルシャワ → ビャウィストク → ビリニュス →
    // リガ、タリン、ヘルシンキ経由でストックホルムまで7日。雨とヒッチハイクのために
    // 2日ぶんの余裕を持たせて9日（2026-09-05 に本人が日を言い切った）。
    plannedDays: 9,
  },
];

/**
 * いまいる島。**日付から決まる。**
 *
 * 前はここが `to` の空欄を見て決めていた。それだと北欧に出発しても、
 * 誰かが `chapters.ts` を書きかえるまで島が入れ替わらない。
 * 旅は日付で進むので、**判定も日付でやる。**
 *
 * 出発の日を過ぎた章があれば、そのいちばん新しいものが「いまいる島」。
 * どれも過ぎていなければ、始まっていて終わっていない章。
 *
 * **画面が出てから呼ぶこと。** 静的書き出し（`output: "export"`）なので、
 * 引数を省いて焼き込むと、ビルドした日の答えがそのまま HTML に入る
 * （`CLAUDE.md` の「静的書き出し」）。焼くのは `NOW_CHAPTER` 1つだけにして、
 * 画面では必ず `chapterNow(new Date())` で引き直す。
 */
export function chapterNow(now: Date = new Date()): Chapter {
  const t = now.getTime();
  const began = (c: Chapter): number => {
    // 事実（from）が入っていればそちら。まだなら予定（opensAt）
    if (c.from) return Date.parse(`${c.from}T00:00:00+09:00`);
    return c.opensAt ? Date.parse(c.opensAt) : Number.POSITIVE_INFINITY;
  };
  const open = CHAPTERS.filter((c) => !c.branchOf && began(c) <= t)
    // 終わった章は、いまいる島ではない
    .filter((c) => !c.to || Date.parse(`${c.to}T23:59:59+09:00`) >= t)
    .sort((a, b) => began(b) - began(a));
  return open[0] ?? CHAPTERS.find((c) => !c.to && !c.branchOf && c.from)!;
}

/**
 * ビルドしたときの「いまいる島」。
 *
 * **画面の出しわけにこれを使わない。** 静的書き出しに焼かれた答えなので、
 * 出発の日をまたいでも変わらない。`chapterNow(new Date())` を呼ぶこと。
 * ここが要るのは、まだ画面が出ていないところ（生成する面の一覧など）だけ。
 */
export const NOW_CHAPTER = chapterNow();

/** 次の島。まだ始まっていないもの */
export const NEXT_CHAPTER = CHAPTERS.find((c) => !c.from)!;

/**
 * 日数。いまも続いている章は「今日まで」で数える。画面が出てから数え直す。
 *
 * 始まっていない章は見立ての日数（`plannedDays`）。**出発の日を過ぎたら、
 * `from` がまだ空でも実際に数えはじめる。** そうしないと、旅に出た当日から
 * 誰かが `from` を書き入れるまで、島が「9日の予定」のまま止まる。
 */
export function chapterDays(c: Chapter, today = new Date()): number {
  const from = c.from
    ? Date.parse(`${c.from}T00:00:00+09:00`)
    : c.opensAt
      ? Date.parse(c.opensAt)
      : NaN;
  if (!Number.isFinite(from) || from > today.getTime()) return c.plannedDays ?? 0;
  const end = c.to ? Date.parse(`${c.to}T00:00:00+09:00`) : today.getTime();
  return Math.max(1, Math.round((end - from) / 86_400_000) + 1);
}

/**
 * 連なりの並び順。**本線は日付順の一列、枝はその親のすぐ下**
 * （`docs/island-atlas.md` 2章）。並べ替えの規則をここに1つだけ置いて、
 * 画面はこれを受け取るだけにする。章を足しても画面を直さずに済む。
 */
export const CHAIN: Chapter[] = (() => {
  const main = CHAPTERS.filter((c) => !c.branchOf).sort((a, b) =>
    // 始まっていない章（北欧）は、いちばん最後
    (a.from || "9999").localeCompare(b.from || "9999"),
  );
  const out: Chapter[] = [];
  for (const c of main) {
    out.push(c);
    for (const b of CHAPTERS.filter((x) => x.branchOf === c.slug)) out.push(b);
  }
  return out;
})();

/**
 * 豚の貯金箱の目標額（円）。**次の島がどこまで建つかは、これに対する割合で決まる**
 * （`docs/island-atlas.md` 5章）。
 *
 * **5万円で確定している。** あやとの言葉:
 * 「今の投げ銭の目標が北欧回りたいっていうので5万円目標でやってるんですけど、
 * それが貯まれば貯まるほどどんどんその建設が進んでいく」。
 *
 * `docs/nordic-fund.md` は「積み上げた足代の合計をそのまま目標にする」案を
 * 書いているが、実際に配信で言っているのはこの額。**画面はこちらに従う。**
 */
export const FUND_GOAL_YEN = 50_000;
