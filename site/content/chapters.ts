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
    // 旅に出た日から、ここは「いまいる島」ではなくなる（いまいる島は日付で決まる）。
    // 焼いた字は日付で書き換わらないので、**いつ読んでも本当のこと**だけを書く。
    note: "腰を据えた島。なに食べよを作った",
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
    // 出発したあとも焼かれたまま出る字なので、「次の島」「まだ建っていない」と
    // 書かない。旅の中身そのものなら、出る前・最中・終わったあとのどれで読んでも合う。
    note: "会いたい人に、ポーランドから1,542kmヒッチハイクで",
    // 出発の日時。**`content/nordic.ts` の DEPART と同じ値**（ジョージア時間 23:30）。
    // あちらを読みに行かないのは、`chapters.ts` は島の連なりの画面（クライアント）が
    // 読むもので、そこに旅程の表ぜんぶ（500行＋JSON 6本）を連れてきてしまうから。
    // **DEPART を動かしたら、ここも動かす。**
    opensAt: "2026-09-11T23:30:00+04:00",
    // クタイシ→カトヴィツェ→ワルシャワ→ビャウィストク→ヴィリニュス（休息1日）→
    // リガ→タリン→ヘルシンキ→トゥルク→ストックホルム。9月20日に着いて、そこから
    // 7泊して27日に発つ。**着いた日ではなく、発つ日までが北欧旅**
    // （あやと 2026-09-06「ストックホルム出るまでが北欧旅です」）。9/11〜9/27 で17日。
    plannedDays: 17,
  },
  {
    /* **中身はまだ何も決まっていない。** 決まっているのは「北欧のあとはここ」
       ということだけなので、欄も**分かっていることしか埋めない。**

       ここが空でも島は建つ。歩いた国が無ければ道しるべは立たないし、配信が
       無ければやぐらも立たない（`components/isle/spec.ts`／
       `docs/island-atlas.md` 4章）。行き先が決まったら、countries と
       opensAt と plannedDays を入れる。 */
    slug: "albania",
    name: "アルバニア",
    from: "",
    to: "",
    /* **行っていない国を「歩いた国」に足さない。** アルバニアは
       `content/countries.ts` にまだ無い。あそこに足すと「◯カ国目」を
       全部振り直すことになり、世界地図の焼き込みと食い違う
       （`content/countries.ts` の BEFORE_STREAM）。歩いてから足す。 */
    countries: [],
    /* 出る前・最中・終わったあとの**どれで読んでも合う字**にする（北欧と同じ決まり）。
       「つぎの島」「まだ建っていない」と書くと、着いた日から嘘になる。
       ここに書いてあるのは、旅の順番と、その国がどこにあるかだけ。 */
    note: "北欧のつぎ。アドリア海をはさんで、イタリアの向かい",
    /* **`opensAt` を入れない。** 日どりが決まっていないので、入れれば嘘の日付になる。
       しかも「いまいる島」は日付で決まるので（`chapterNow`）、嘘の日付を置くと
       その日に島が勝手に入れ替わる。`chapterNext()` は `opensAt` の無い章も
       「まだ始まっていない章」として拾うので、無くても次の島として出る。

       `plannedDays` も同じ。島の大きさは日数から出るので、見立てを入れると
       「◯日の旅」が事実として絵に出る。入れないあいだは浜のぶんだけの島
       （半径 26）になる。 */
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
/**
 * 章が始まった時刻（ms）。事実（`from`）が先で、まだなら予定（`opensAt`）。
 *
 * 日数も、期間の字も、いまいる島も、ぜんぶこの1つの決めかたを見る。
 * ばらばらに書くと、島の札が「これから」なのに日数だけ数えはじめる、
 * という食い違いが出る（実際に出た）。
 */
function began(c: Chapter): number {
  if (c.from) return Date.parse(`${c.from}T00:00:00+09:00`);
  return c.opensAt ? Date.parse(c.opensAt) : Number.POSITIVE_INFINITY;
}

/**
 * 終わりの日が入っていない章の、事実上の終わり。
 *
 * **本線の次の章が始まったら、そこで終わり。** そうしないと、北欧へ出たあとも
 * コーカサスが毎日1日ずつ増えつづける（出発の10日後に「455日 〜 いま」と出た）。
 * 誰も居ない章が2つ同時に「〜 いま」になるのも、これで消える。
 */
function nextBegan(c: Chapter): number {
  const mine = began(c);
  return Math.min(
    ...CHAPTERS.filter((x) => !x.branchOf && x !== c && began(x) > mine).map(began),
  );
}

export function chapterNow(now: Date = new Date()): Chapter {
  const t = now.getTime();
  const begun = CHAPTERS.filter((c) => !c.branchOf && began(c) <= t).sort(
    (a, b) => began(b) - began(a),
  );
  // 終わった章は、いまいる島ではない
  const open = begun.filter((c) => !c.to || Date.parse(`${c.to}T23:59:59+09:00`) >= t);
  /* **どれも開いていない時間帯がありうる。**
     出発の日に `caucasus.to` を入れると、その日の 23:59:59（日本時間）から
     北欧が始まる 9/12 04:30 までの4時間半、開いている章が1つも無くなる。
     前はそこで `undefined` が返って、島の連なりも表紙も落ちていた
     （型は Chapter と言っているので、誰も気づかないまま落ちる）。
     いちばん最後に始まった章を出す。旅の途中に一瞬だけ前の島に見えるのは、
     画面が落ちるよりずっとよい。 */
  return open[0] ?? begun[0] ?? CHAPTERS.find((c) => !c.branchOf && c.from)!;
}

/**
 * ビルドしたときの「いまいる島」。
 *
 * **画面の出しわけにこれを使わない。** 静的書き出しに焼かれた答えなので、
 * 出発の日をまたいでも変わらない。`chapterNow(new Date())` を呼ぶこと。
 * ここが要るのは、まだ画面が出ていないところ（生成する面の一覧など）だけ。
 */
export const NOW_CHAPTER = chapterNow();

/**
 * 次の島。**日付で決める。**
 *
 * `from` の空欄だけで決めていたころ、出発しても誰かが `chapters.ts` に
 * 日付を書き入れるまで、北欧が「次の島」のままだった。旅の4日目に
 * 島の連なりが「4日の予定」と出す（`chapterDays` は出発を過ぎたら
 * 実際に数えはじめるのに、札のほうは予定と言い続ける）のがそれで、
 * **経過日数を予定と言う**という、いちばん分かりにくい嘘になっていた。
 *
 * 始まっていない = `from` がまだ空で、かつ出発の日時にもまだ届いていない。
 * **日どりの決まっていない章（`opensAt` が無い）も、始まっていない章として拾う。**
 * 行き先だけ決まっていて日はこれから、という島がいちばん先にある状態なので、
 * ここで外すと「次の島」がある日から消える。
 * どれも始まっていれば `undefined`（次の島はもう無い）。
 *
 * **画面が出てから呼ぶこと。** `chapterNow` と同じで、焼くと出発の日を
 * またいでも変わらない。
 */
export function chapterNext(now: Date = new Date()): Chapter | undefined {
  return CHAPTERS.find(
    (c) => !c.from && (!c.opensAt || Date.parse(c.opensAt) > now.getTime()),
  );
}

/** 本線の島だけ（枝を抜いたもの）。 */
const MAIN_CHAPTERS = CHAPTERS.filter((c) => !c.branchOf);

/**
 * ビルドしたときの「次の島」。**画面の出しわけに使わない**（`NOW_CHAPTER` と同じ理由）。
 *
 * **`chapterNext()` とは、わざと別の決めかたにしてある。** こちらが見るのは
 * `from` の空欄だけで、出発の日時は見ない。理由は、これを使っているのが
 * **表紙の入れ替え**（`components/isle/Cover.tsx`）だから。焼いた HTML には
 * 「入れ替わる先の島」が要る。出発の日時で外してしまうと、出発した日から
 * `from` を書き入れるまでのあいだ、表紙が前の島のまま止まる。
 *
 * **`!` を外した。** 前は `CHAPTERS.find((c) => !c.from)!` で、
 * 全部の章に `from` が入った瞬間 `undefined` を `Chapter` と偽って配っていた。
 * 型が Chapter と言っているので誰も `undefined` を疑わず、受け取った先
 * （表紙・島の連なり）が丸ごと落ちる。**旅が終わるたびに同じ日が来る。**
 *
 * 次の島を足し忘れても落ちないように、いちばん新しい本線の島で受ける。
 * 「次の島がもう無い」を知りたい画面は、`chapterNext()`（`undefined` を返す）を
 * 呼ぶこと。**受けているだけで、足さなくてよくなったわけではない。**
 */
export const NEXT_CHAPTER: Chapter =
  CHAPTERS.find((c) => !c.from) ?? MAIN_CHAPTERS[MAIN_CHAPTERS.length - 1];

/**
 * 日数。いまも続いている章は「今日まで」で数える。画面が出てから数え直す。
 *
 * 始まっていない章は見立ての日数（`plannedDays`）。**出発の日を過ぎたら、
 * `from` がまだ空でも実際に数えはじめる。** そうしないと、旅に出た当日から
 * 誰かが `from` を書き入れるまで、島が「9日の予定」のまま止まる。
 */
export function chapterDays(c: Chapter, today = new Date()): number {
  const from = began(c);
  if (!Number.isFinite(from) || from > today.getTime()) return c.plannedDays ?? 0;
  const end = c.to
    ? Date.parse(`${c.to}T00:00:00+09:00`)
    : Math.min(today.getTime(), nextBegan(c));
  return Math.max(1, Math.round((end - from) / 86_400_000) + 1);
}

/**
 * 章の期間。**画面に出す「2025年6月 〜 いま」はここから作る。**
 *
 * `to` は事実の欄で、旅に出た日に手で入れる。入れ忘れているあいだも、
 * 次の章が始まっていれば終わったものとして返す。
 * まだ始まっていない章は `from` が null（画面は「これから」と書く）。
 */
export function chapterSpan(
  c: Chapter,
  today = new Date(),
): { from: number | null; to: number | null } {
  const from = began(c);
  if (!Number.isFinite(from) || from > today.getTime()) return { from: null, to: null };
  const to = c.to ? Date.parse(`${c.to}T00:00:00+09:00`) : nextBegan(c);
  return { from, to: Number.isFinite(to) && to <= today.getTime() ? to : null };
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
