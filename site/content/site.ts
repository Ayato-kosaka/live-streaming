/** サイト全体の固定情報。日々変わるものは Firestore(/island-api) 側で上書きする。 */

export const SITE = {
  name: "あやと島",
  tagline: "あやとと愉快な仲間達",
  url: "https://live-streaming-d3cac.web.app",
  description:
    "毎晩22時、世界のどこかから生配信。旅とごはんとアプリ作りを、愉快な仲間達と一緒に進めている島です。",
};

export const PROFILE = {
  name: "あやと",
  lead: "本気でアプリを作りたい人。目標は食べログ超え。",
  body: [
    "2024年の秋に日本を出て、ヨーロッパから中東、コーカサスへと旅を続けている。",
    "毎晩22時から配信していて、旅先で自作のグルメアプリ「なに食べよ」を作っている。",
    "配信のみんなと一緒に旅行するのが好き。行き先も、作る料理も、アプリの機能も、だいたい一緒に決めている。",
  ],
};

/** サイトから外へ出るリンク。logo があれば公式のアイコンを出す。 */
export type LinkItem = {
  id: string;
  label: string;
  note: string;
  href: string;
  emoji: string;
  icon: string;
  logo?: string;
};

export const LINKS: LinkItem[] = [
  {
    id: "youtube",
    icon: "tower-studio",
    label: "YouTube チャンネル",
    note: "毎晩22時から生配信",
    href: "https://youtube.com/channel/UCCwutAH6ieHNvdyJAfSld7w",
    emoji: "▶️",
  },
  {
    id: "app",
    icon: "food-plate-dinner",
    logo: "/logos/nanitabeyo.png",
    label: "なに食べよ（App Store）",
    note: "iPhone / iPad",
    href: "https://apps.apple.com/jp/app/id6751139648",
    emoji: "🍽️",
  },
  {
    id: "app-android",
    icon: "food-plate-dinner",
    logo: "/logos/nanitabeyo.png",
    label: "なに食べよ（Google Play）",
    note: "Android",
    href: "https://play.google.com/store/apps/details?id=com.nanitabeyo",
    emoji: "🤖",
  },
  {
    id: "doneru",
    icon: "stall",
    logo: "/logos/doneru.png",
    label: "投げ銭（Doneru）",
    note: "100円から。キャラクターも作れます",
    href: "https://doneru.jp/ayato_arigato",
    emoji: "🐷",
  },
];

/** キャラクター置き場（視聴者さんが自由にダウンロードできる） */
export const CHARACTER_DRIVE = "https://drive.google.com/drive/folders/1S-EFPuayr8p73_Yi6mRf4OkN91qHdzXn";

/** 「いま」の初期値。/island-api/state の current で上書きされる。 */
export const NOW_FALLBACK = {
  place: "ジョージア・トビリシ",
  theme: "georgia" as const,
  word: "トビリシに戻ってきて、毎晩22時から配信してます。",
  updatedAt: "2026-09-04",
  week: [
    "9/6(日) Food & Wine Fest @ ムタツミンダ公園に行く",
    "9/11 から北欧へ",
  ],
};

/** 「これから」の初期値。 */
export const NEXT_FALLBACK = [
  {
    id: "food-wine-fest",
    when: "2026年9月6日(日)",
    title: "Food & Wine Fest @ ムタツミンダ公園",
    note: "トビリシの山の上の公園でやるフード＆ワインのお祭り。行ってきます。",
    tags: ["ジョージア", "祭り"],
  },
  {
    id: "nordic",
    when: "2026年9月11日から",
    title: "北欧へ行く",
    note: "中身はこれから決めます。どこで何をするか、企画会議で一緒に考えたいです。",
    tags: ["北欧", "移動"],
  },
];

/** サイトに出す数字の初期値。/island-api/state の stats で上書きされる。 */
export const STATS_FALLBACK = {
  streams: 747,
  streamDays: 610,
  comments: 125262,
  people: 2215,
  countries: 17,
  recipes: 32,
  since: "2024-10-28",
  updatedAt: "2026-09-04",
};
