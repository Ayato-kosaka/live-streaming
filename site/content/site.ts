/** サイト全体の固定情報。日々変わるものは Firestore(/island-api) 側で上書きする。 */

export const SITE = {
  name: "あやと島",
  tagline: "あやとと愉快な仲間達",
  url: "https://live-streaming-d3cac.web.app",
  description:
    "毎晩22時、世界のどこかから生配信。旅とごはんとアプリ作りを、愉快な仲間達と一緒に進めている島です。",
};

/**
 * あやと本人のこと。**本人から聞いた事実だけを置く。推測で足さない。**
 *
 * 日付を3つ持っているのは、どれも別のものを数えるから。
 * 旅した日数は `leftJapan` から、毎日配信の日数は `dailySince` から、
 * 配信本数は `STATS_FALLBACK.since`（＝初回の配信日）から数える。
 * 前はこの3つを全部「初回の配信日」で数えていて、
 * 「旅した日数（日本を出てから）」が 47日ぶん足りていなかった。
 */
export const PROFILE = {
  name: "あやと",
  /** 誕生日。年齢は画面が出てから数え直す（焼き込むと1年ずれたまま止まる） */
  born: "1998-12-06",
  /** 日本を出た日。配信の初回（2024-10-28）より6週間はやい */
  leftJapan: "2024-09-11",
  /** 日本に帰らないと決めた日。**その日から毎日配信していて、1日も休んでいない** */
  dailySince: "2024-12-31",
  lead: "アプリを作りたくて、日本を出た人。目標は食べログ超え。",
  body: [
    "1998年12月6日生まれ。大学からITの学科で、アプリを作るのが好きだった。",
    "2024年9月11日に日本を出て、いまは毎晩22時、旅先から生配信している。",
    "出たのは、会社に勤めていたころに作った旅行計画アプリを広めるため。3ヶ月で帰るつもりだった。",
    "いま作っているのはグルメアプリ「なに食べよ」。機能も文言も、配信のみんなと決めている。",
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

/* 「これから」の予定は content/plans.ts に移した（写真や埋め込みを持たせるため）。 */

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
