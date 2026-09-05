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
  note: string;
  tags: string[];
  place?: { name: string; area?: string; map?: string };
  /** どんなものか。1段落ずつ */
  about?: string[];
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
  {
    id: "nordic",
    title: "ヒッチハイクで北欧へ",
    when: "2026年9月11日(金) 23:30 出発",
    date: "2026-09-11",
    // クタイシ発の便の時刻。ジョージア時間(UTC+4)。`content/nordic.ts` の DEPART と同じ。
    at: "2026-09-11T23:30:00+04:00",
    note: "ジョージアを出て、ポーランドからバルト三国を北上し、北欧へ抜ける。陸路はぜんぶヒッチハイク。",
    tags: ["北欧", "バルト", "ヒッチハイク", "一方通行"],
    href: "/nordic",
    /** いちばん近くて、いちばん大きい企画。トップの先頭に出す。 */
    big: true,
    about: [
      "ジョージアに戻ってくる往復ではなく、そのまま次の拠点へ抜ける一方向の旅。",
      "飛行機はクタイシ→カトヴィツェの1本だけ。そこから先の陸路は、ぜんぶヒッチハイクでつなぐ。バスに逃げないのが企画の芯。",
      "ワルシャワからヴィリニュスまで513km。ここが最初の山場で、途中で一泊はさむ。",
      "9月のバルトは3日に1日くらい雨。寒さと雨のなかで、どこまで人の親切に乗れるか。",
    ],
  },
];

export const planById = (id: string) => PLANS.find((p) => p.id === id);

/**
 * いま、いちばん近い企画。
 * まだ来ていないもののうち、いちばん日が近いもの。
 * 全部終わっていれば big を付けたものを出す（次の大物は先に告知しておきたいので）。
 */
export function nextPlan(today = new Date()): Plan | undefined {
  const ahead = PLANS.filter((p) => {
    const d = daysUntil(p.date, today);
    return d !== null && d >= 0;
  }).sort((a, b) => (a.date! < b.date! ? -1 : 1));
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
export function planDaysLeft(p: Plan, now = new Date()): number | null {
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
