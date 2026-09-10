/**
 * これからやること。島の「これから」テントの中身。
 *
 * 「◯月◯日に◯◯へ行く」だけだと、見ている人にはどんなものか分からない。
 * 写真・公式の紹介・場所の地図・SNSの投稿まで置いて、
 * 行く前から一緒に楽しみにできるようにする。
 */

export type PlanLink = { label: string; href: string; note?: string };

/** 写真。外のものを借りるときは、出どころと使ってよい条件を必ず持たせる。 */
export type PlanPhoto = {
  src: string;
  alt: string;
  credit?: string;
  creditHref?: string;
};

/** SNS などの埋め込み。id は投稿のURLの末尾。 */
export type PlanEmbed = {
  kind: "instagram" | "youtube";
  id: string;
  note?: string;
};

export type Plan = {
  id: string;
  title: string;
  /** 画面に出す日付の言い方 */
  when: string;
  /** その日。あと何日かを数えるのに使う(YYYY-MM-DD) */
  date?: string;
  /**
   * 始まる時刻まで分かっているとき（ISO8601・時差込み）。
   * 「あと1日」だけだと、その日のいつなのかが分からない。
   * 時刻があるものは時間と分まで数える。
   */
  at?: string;
  /**
   * 終わる予定の日(YYYY-MM-DD)。**決まっているものだけ書く。**
   *
   * 書かなければ、`date` のその日1日で終わるものとして扱う。
   * お祭りのように行って帰ってくるものは、それで合っている。
   */
  until?: string;
  /**
   * 終わりの合図。**終わる日が決まっていない企画だけが持つ。**
   *
   * `until` も `done` も無いあいだ、企画は**日付では終わらない**。
   * 「始まったら終わり」にすると、出発当日から「もう行ってきた」と出る
   * （**実際にそうなっていた**）。
   *
   * 北欧の旅は長いあいだこれだけを持っていた。いまは発つ日の切符があるので
   * `until` も持っている。**両方あるときは `until` が勝つ。**
   * ここは「何が起きたら終わりか」を書き残すための字として残す。
   */
  endsWhen?: string;
  /**
   * 実際に終わった日(YYYY-MM-DD)。**終わってから入れる、事実の欄。**
   *
   * `until` は予定で、こちらは事実。両方あるときは、こちらが勝つ。
   */
  done?: string;
  /**
   * 終わった日が、島の様子（`/island-api/state`）から届く企画。
   *
   * **旅の終わりは、旅の途中で起きる。** そのときあやとはヒッチハイクの
   * 途中にいて、Git を編集して commit して Hosting を手で起動する、は回らない
   * （`docs/nordic-depart.md`）。だから Firestore に入れて、画面が出てから読む。
   * **値はここに書かない。** 届いたら `done` として扱う。
   *
   * 北欧旅で読むのは `nordic.endedOn`（ストックホルムを発った日）。
   * `nordic.arrivedOn`（着いた日）ではない。→ `reached`
   */
  doneFromState?: "nordic";

  /**
   * 旅の途中で越える、いちばん大きい節目。**ここでは企画は終わらない。**
   *
   * あやとの言葉（2026-09-06）:
   *
   * > ストックホルム出るまでが北欧旅です。なので、それが企画に盛り込まれてるか心配。
   *
   * 長いあいだ、北欧旅は「ストックホルムに着いたら終わり」だった。
   * 着くのは9月20日で、発つのは27日。**あいだの7泊がまるごと
   * 「もう行ってきた」になっていた。** 着いた日と終わった日は別の出来事で、
   * 着いた日は喜ぶところ、終わった日が締めるところ。
   *
   * `on` は届いたら入る（`fromState` が `nordic` なら `nordic.arrivedOn`）。
   * 予定の日は `when` に持つ。
   */
  reached?: {
    /** 予定の日(YYYY-MM-DD) */
    when: string;
    /** 何が起きるのか。「ストックホルムに着く」 */
    label: string;
    /** 越えたあとに出す一行 */
    say: string;
    /** 実際に越えた日。島から届く */
    on?: string;
    fromState?: "nordic";
  };
  note: string;
  tags: string[];
  place?: { name: string; area?: string; map?: string };
  /** どんなものか。1段落ずつ */
  about?: string[];
  /**
   * まだ決まっていないこと。
   *
   * 「日にちはあやとが決めますが、中身はみんなで」がこの島の企画の作り方なので、
   * どこが空いているのかを先に見せる。空いている場所が分かってはじめて、
   * 付箋に何を書けばいいかが分かる。
   */
  asks?: string[];
  links?: PlanLink[];
  photos?: PlanPhoto[];
  embeds?: PlanEmbed[];
  /** 大きい企画は専用のページを持つ */
  href?: string;
  /** これが今いちばん大きい企画。トップの先頭に大きく出す。 */
  big?: boolean;
};

export const PLANS: Plan[] = [
  {
    id: "food-wine-fest",
    title: "Food & Wine Fest @ ムタツミンダ公園",
    when: "2026年9月6日(日)",
    date: "2026-09-06",
    note: "トビリシの山の上の公園でやるフード＆ワインのお祭り。行ってきます。",
    tags: ["ジョージア", "祭り"],
    place: {
      name: "ムタツミンダ公園",
      area: "トビリシ・ムタツミンダ山の上",
      map: "https://maps.google.com/?q=Mtatsminda+Park+Tbilisi",
    },
    about: [
      "トビリシの街を見下ろす標高770mの山の上にある遊園地。ケーブルカーで登る。",
      "ワインの試飲、ジョージア料理と各国料理の屋台、工芸品の出店、シェフとソムリエの実演が並ぶ。生演奏もある。",
      "ジョージアはワイン発祥の地とされていて、8000年前のクヴェヴリ（素焼きの甕）仕込みが今も現役。祭りではその飲み比べができる。",
    ],
    asks: [
      "屋台のどれを食べるか。ジョージア料理以外も並ぶ",
      "クヴェヴリ仕込みのワインを、どれと飲み比べるか",
      "ケーブルカーで登るか、歩いて登るか",
    ],
    links: [
      { label: "Mtatsminda Park 公式", href: "https://mtatsminda.ge/en/" },
      { label: "イベント情報（YOLO）", href: "https://yolo.ge/en/poster/food-wine-fest-tbilisi5858" },
    ],
    embeds: [
      { kind: "instagram", id: "Dcku99gDfv9", note: "去年の様子。こんな感じのお祭りです。" },
    ],
    photos: [
      {
        src: "https://upload.wikimedia.org/wikipedia/commons/thumb/3/31/Tbilisi_-_Mtatsminda_Park_%289460953464%29.jpg/960px-Tbilisi_-_Mtatsminda_Park_%289460953464%29.jpg",
        alt: "ムタツミンダ公園の観覧車",
        credit: "Wikimedia Commons (CC BY-SA 2.0)",
        creditHref: "https://commons.wikimedia.org/wiki/File:Tbilisi_-_Mtatsminda_Park_(9460953464).jpg",
      },
      {
        src: "https://upload.wikimedia.org/wikipedia/commons/thumb/6/6a/Mtatsminda_park_January_2013_01.jpg/960px-Mtatsminda_park_January_2013_01.jpg",
        alt: "山の上から見たトビリシの街",
        credit: "Jonathan Cardy / Wikimedia Commons (CC BY-SA 3.0)",
        creditHref: "https://commons.wikimedia.org/wiki/File:Mtatsminda_park_January_2013_01.jpg",
      },
    ],
  },
  /* あやとが `/next/new` から出して、「これから」に上げた企画（2026-09-06）。
     **数はこの表で持たない。** 384日も730日も619日も、`content/countries.ts` と
     `PROFILE` から数えたものを字にして焼いてある。焼いた数は日が経つと古くなるので、
     ここに置いてよいのは「その日までに確定していて、もう動かない数」だけ。
     9月11日を過ぎたら動かなくなる数なので、ここでは焼いてある。 */
  {
    id: "georgia-bye",
    title: "ジョージアバイバイ",
    when: "2026年9月11日(金)",
    date: "2026-09-11",
    note: "1年住んだジョージアと、この日でお別れ。トビリシからクタイシへ出て、そのまま北欧へ発つ。",
    tags: ["ジョージア", "お別れ"],
    place: {
      name: "トビリシ",
      area: "ジョージア",
      map: "https://maps.google.com/?q=Tbilisi+Georgia",
    },
    about: [
      "2025年7月19日にトビリシへ着いてから、384日をこの国で過ごした（途中、35日だけ離れている）。17カ国のどこよりも長い。",
      "配信は378本、来てくれた人は1,242人、書き込みは63,815。いちばん長くいた国が、いちばん喋った国になった。",
      "ここでクッキング配信が定着して、クタイシから「なに食べよ」をリリースした。トビリシ・クタイシ・ズグディディ・メスティア・カズベキ・ボルジョミ・バトゥミと歩いた。",
      "9月11日、トビリシからクタイシへマシュルートカで出る。夜の便でポーランドへ飛ぶので、この日がジョージア最後の日になる。",
    ],
    /* この札から「付箋で教える」で下の欄へ降りるので、**ここで聞くものと、
       欄で集めるものを揃える。** 欄は1年の思い出を集める（`content/themes.ts`）
       のに、ここが「どこへ行くべきか」だけだと、降りた先で聞かれることが変わる。
       あやとが決めていないことのまま、答えると思い出になる形にする。 */
    asks: [
      "1年の配信のうち、また観たい回はどれ",
      "最後の日に、もう一度だけ映しておきたいもの",
      "ジョージアで最後に食べておくべきものは、なに",
    ],
    /* `links` は外へ出る口（target=_blank）なので、島の中の面はここに置かない。
       行き先は `href` 1本にする。 */
    href: "/map/georgia",
  },
  {
    id: "japan-2years",
    title: "海外出発二周年記念日",
    when: "2026年9月11日(金)",
    date: "2026-09-11",
    note: "関西国際空港から日本を出た日から、ちょうど2年。その日の夜に、北欧へ発つ。",
    tags: ["周年", "節目"],
    about: [
      "2024年9月11日、関西国際空港から日本を出た。会社に勤めていたころに作った旅行計画アプリを広めるための、3ヶ月の予定だった。",
      "2026年9月11日で、ちょうど730日。歩いた国は17、毎日配信は619日つづいている。帰らないと決めた2024年12月31日から、1日も休んでいない。",
      "3ヶ月で帰るはずが2年になった理由は、たぶんこの島に全部書いてある。",
      "そしてこの日の23時30分、クタイシから北欧へ発つ。2年目の最後の日が、そのまま3年目の初日になる。",
    ],
    asks: [
      "この2年で、いちばん記憶に残っている回はどれ",
      "3年目に、やってほしいこと",
    ],
    href: "/about",
  },
  {
    id: "nordic",
    title: "ヒッチハイクで北欧へ",
    when: "2026年9月11日(金) 23:30 出発",
    date: "2026-09-11",
    // クタイシ発の便の時刻。ジョージア時間(UTC+4)。`content/nordic.ts` の DEPART と同じ。
    at: "2026-09-11T23:30:00+04:00",
    /* **旅はストックホルムに着いて終わりではない。**
       あやとの言葉（2026-09-06）「ストックホルム出るまでが北欧旅です」。
       着くのは9月20日で、そこから7泊して27日にティラナへ発つ。
       発つ便には切符があるので、終わる日は `until` で言い切れる。
       実際に発った日は旅の途中で Firestore に入る（`doneFromState`）。 */
    until: "2026-09-27",
    endsWhen: "ストックホルムを発ったら",
    doneFromState: "nordic",
    /* 着いた日。**節目であって、終わりではない。** */
    reached: {
      when: "2026-09-20",
      label: "ストックホルムに着く",
      say: "会いたい人のいる街に着きました。ここから7泊して、27日に発ちます。",
      fromState: "nordic",
    },
    note: "スウェーデンに、会いたい人がいる。飛行機が高いのでポーランドまで飛んで、そこから先はヒッチハイク。",
    tags: ["北欧", "バルト", "ヒッチハイク", "会いに行く"],
    href: "/nordic",
    /** いちばん近くて、いちばん大きい企画。トップの先頭に出す。 */
    big: true,
    /* ここは `/nordic` の「会いに行く理由」の要約。**向こうを直したらここも直す。**
       出どころが2つあると、片方だけ古くなる（実際に一度そうなった）。 */
    about: [
      "2023年8月1日に出会った友だちが、スウェーデンにいる。3ヶ月だけ日本に留学に来ていて、帰ってしまった。",
      "そのあと何度もヨーロッパに来て、すぐ手前まで行ったのに会えなかった。今回「ぜひ会いに来てよ」と言ってもらえた。",
      "スウェーデンまでの飛行機は高い。だから安いポーランド行きで飛んで、そこから先は車に乗せてもらってつなぐ。",
      "9月12日にカトヴィツェへ降りて、ワルシャワ、ビャウィストク、ヴィリニュス、リガ、タリンと北へ。ヴィリニュスで1日休んで、タリンからは船でヘルシンキ。トゥルクまでヒッチハイクして、夜行フェリーで9月20日の朝にストックホルムに着く。",
      "着いて終わりではない。友だちの家に7泊して、9月27日にストックホルムを発つまでが北欧旅。",
    ],
    asks: [
      "9月15日の休息日、ヴィリニュスで何をするか",
      "バルト三国で、これだけは食べておくべきもの",
      "ヒッチハイクの札に、なんて書くか",
    ],
  },
];

export const planById = (id: string) => PLANS.find((p) => p.id === id);

/** カードに添える、その日の企画(#173)。名前と、その企画の話がある面。 */
export type PlanBrief = { title: string; href: string };

/* 日付 → その日の企画の表（あやと島カードが引くもの）は
   `content/planDays.ts` へ移した。**企画は `PLANS` だけではない。**
   #202 で「北欧◯日目」も企画になり、9月11日は4本立つ。旅程表を
   ここから読むと輪になる（あちらがここを読んでいる）ので、
   両方を知っている表を外に1枚置いてある。 */

/**
 * 島から届いた事実を、企画に貼ったもの。
 *
 * 貼るのは2つ。**「着いた日」と「終わった日」を取り違えない。**
 * 北欧旅は9月20日にストックホルムへ着いて、27日に発つまで続く。
 * 長いあいだ着いた日を `done` に貼っていて、着いた瞬間に企画が
 * 「行ってきた」になっていた（あいだの7泊がまるごと消えていた）。
 *
 * 旅の終わりは旅の途中に起きるので、Git にも静的書き出しにも入らない。
 * **画面が出てから貼る。**
 *
 * 貼るところが2つある（`/next` の一覧と、トップの「いちばん近い企画」）ので、
 * 貼り方はここ1か所に置く。片方だけ古くなるのを防ぐ。
 */
export function livePlans(facts?: { arrived?: string | null; ended?: string | null } | null): Plan[] {
  const arrived = facts?.arrived ?? null;
  const ended = facts?.ended ?? null;
  if (!arrived && !ended) return PLANS;
  return PLANS.map((p) => {
    let out = p;
    // 終わった日。**着いた日ではない。** ここを取り違えると、
    // ストックホルムでの7泊がまるごと「もう行ってきた」になる
    if (ended && p.doneFromState && !p.done) out = { ...out, done: ended };
    if (arrived && p.reached?.fromState && !p.reached.on) {
      out = { ...out, reached: { ...p.reached, on: arrived } };
    }
    return out;
  });
}

/**
 * 企画の3つの状態。**これから / いま行っている / 行ってきた。**
 *
 * 長いあいだ、企画は「始まる日」しか持っていなかった。始まる日を過ぎたら
 * 終わったことになる作りで、**出発の当日から9日間ずっと `/next` が
 * 「もう行ってきた」「おわった」と言っていた**（時計を進めて撮って見つけた）。
 * パンくずが「これから > 北欧ヒッチハイク」なので、旅を見に来た人は
 * 必ずここを通る。旅の最中に「終わった」と書いてある面を通ることになる。
 *
 * 3つに分けるのに要るのは、始まる日のほかに**終わり**だけ。
 * 終わりは3通りある。どれも「決まっていないものを決まったことにしない」ために要る。
 *
 * | 何を持っているか | いつ「行ってきた」になるか |
 * | --- | --- |
 * | `done`（実際に終わった日） | その日を過ぎたら。**事実なので、いちばん強い** |
 * | `until`（終わる予定の日） | その日を過ぎたら |
 * | `endsWhen` だけ（`until` が無い） | **日付では終わらない。`done` が入るまでずっと「いま」** |
 * | どれも無い | `date` のその日1日で終わる |
 *
 * **`reached`（途中の節目）はここに効かない。** ストックホルムに着いても、
 * 発つまでは「いま行っている」のまま。
 */
/**
 * 書き出した時刻。**焼いた HTML の「今日」。**
 *
 * `output: "export"` なので、画面が出るまでは本物の今日が分からない。
 * そのあいだを「全部これから」で埋めると、**終わった企画が
 * 「これからの企画」に並んだまま**の HTML が配られる（実際にそうなっていた）。
 * 分からないなりに、いちばん近い答えは**焼いた日**なので、それを使う。
 * 古くなるのは「焼いてから終わった企画」だけで、しかも画面が出た時点で直る。
 *
 * 値は `next.config.mjs` が埋める。埋まっていない（開発サーバ）ときは 1970年で、
 * これまでどおり「全部これから」に落ちる。
 */
export const BUILT_AT = new Date(process.env.NEXT_PUBLIC_BUILT_AT ?? 0);

export type PlanPhase = "before" | "during" | "after";

export function planPhase(p: Plan, now = new Date()): PlanPhase {
  // 日にちがまだ決まっていない企画は、いつまでも「これから」
  if (!p.date && !p.at) return "before";
  // 始まる前。時刻まで決まっていれば、その時刻まで待つ
  const notYet = p.at ? Date.parse(p.at) > now.getTime() : (daysUntil(p.date, now) ?? 0) > 0;
  if (notYet) return "before";
  /* 終わりの日。事実（`done`）が先。
     `endsWhen` を持つものは、`done` が入るまで日付では終わらせない。 */
  /* 終わりの日。事実（`done`）が先、次に終わる予定の日（`until`）。
     どちらも無いときだけ、`endsWhen` が「日付では終わらない」を効かせる。 */
  const end = p.done || p.until || (p.endsWhen ? "" : p.date);
  if (end && (daysUntil(end, now) ?? 0) < 0) return "after";
  return "during";
}

/**
 * いま、いちばん近い企画。
 *
 * **いま行っているものがあれば、それがいちばん近い。** 旅の最中に
 * 「次はこれ」と別のものを出すと、いま起きていることが画面から消える。
 * 無ければ、まだ来ていないもののうちいちばん日が近いもの。
 * 全部終わっていれば big を付けたものを出す（次の大物は先に告知しておきたいので）。
 */
export function nextPlan(today = new Date()): Plan | undefined {
  const now = PLANS.filter((p) => planPhase(p, today) === "during").sort((a, b) =>
    (a.date ?? "9999").localeCompare(b.date ?? "9999"),
  );
  if (now.length > 0) return now[0];
  const ahead = PLANS.filter((p) => planPhase(p, today) === "before" && p.date).sort((a, b) =>
    a.date! < b.date! ? -1 : 1,
  );
  return ahead[0] ?? PLANS.find((p) => p.big) ?? PLANS[0];
}

/**
 * その企画まで、あと何日か。
 *
 * 時刻まで決まっているもの（`at`）は、その時刻までを実際に数える。
 * 決まっていないものは「その日まであと何日」という数え方にする。
 * ここを1か所にしておかないと、しらせの帯が「あと1日」で
 * 時計が「あと0日23時間」になる、という食い違いが出る。
 */
export function planDaysLeft(p: Pick<Plan, "date" | "at">, now = new Date()): number | null {
  if (p.at) return Math.floor((new Date(p.at).getTime() - now.getTime()) / 86400000);
  return daysUntil(p.date, now);
}

/** その日まであと何日か。過ぎていればマイナス。 */
export function daysUntil(date: string | undefined, today = new Date()): number | null {
  if (!date) return null;
  const t = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  const [y, m, d] = date.split("-").map(Number);
  return Math.round((Date.UTC(y, m - 1, d) - t) / 86400000);
}
