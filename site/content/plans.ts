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
    title: "北欧とバルト三国へ",
    when: "2026年9月から",
    date: "2026-09-14",
    note: "トビリシを出て、ポーランドからバルト三国を北上して、北欧へ抜ける。",
    tags: ["北欧", "バルト", "移動"],
    href: "/nordic",
    about: [
      "ジョージアに戻ってくる往復ではなく、そのまま次の拠点へ抜ける一方向の旅。",
      "飛行機は2区間だけ。あとは長距離バスとフェリーでつなぐ。",
    ],
  },
];

export const planById = (id: string) => PLANS.find((p) => p.id === id);

/** その日まであと何日か。過ぎていればマイナス。 */
export function daysUntil(date: string | undefined, today = new Date()): number | null {
  if (!date) return null;
  const t = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  const [y, m, d] = date.split("-").map(Number);
  return Math.round((Date.UTC(y, m - 1, d) - t) / 86400000);
}
