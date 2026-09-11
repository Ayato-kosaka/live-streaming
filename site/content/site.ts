/** サイト全体の固定情報。日々変わるものは Firestore(/island-api) 側で上書きする。 */

import { say } from "./nights";
import { RECIPES } from "./recipes";

export const SITE = {
  name: "あやと島",
  tagline: "あやとと愉快な仲間達",
  url: "https://live-streaming-d3cac.web.app",
  /* **ここに時刻を書かない。** `<meta>` は焼かれたまま出るので、画面が出てから
     差し替えられない。旅のあいだ（`content/nights.ts`）は始まる時刻が決まらないので、
     ここは**いつ読んでも本当のこと**だけにする。 */
  description:
    "世界のどこかから、毎晩生配信。旅とごはんとアプリ作りを、愉快な仲間達と一緒に進めている島です。",
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
  /**
   * 会社に勤めていた期間（本人。2026-09-06、GitHub #121）。
   * 大学で作ろうとしたアプリがうまく作れず、「社会人経験がないと無理や」と勤めに出た3年。
   * ここが無いと、旅行計画アプリを「会社に勤めていたころに作った」と言っている理由が読めない。
   */
  worked: { from: "2021-04", to: "2024-08" },
  /**
   * 大学で作っていたアプリ。**スペリーブの前身ではない。** 別のサービスで、
   * 隙間時間に英会話したい教師と生徒をつなぐもの。開発中に断念している。
   * 名前を出してよい、と本人に確認済み（GitHub #121）。
   */
  firstApp: { name: "Meetup English", what: "隙間時間に英会話したい教師と生徒をマッチングさせるサービス", ended: "開発中に断念" },
  lead: "アプリを作りたくて、日本を出た人。目標は食べログ超え。",
  body: [
    "1998年12月6日生まれ。大学からITの学科で、アプリを作るのが好きだった。在学中に作ろうとした Meetup English は、開発中に断念している。",
    "「社会人経験がないと無理や」と、2021年4月から2024年8月まで会社に勤めた。",
    say("profile"),
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
    note: say("link"),
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

/** 「いま」の初期値。/island-api/state の current で上書きされる。 */
export const NOW_FALLBACK = {
  place: "ジョージア・トビリシ",
  theme: "georgia" as const,
  word: say("word"),
  updatedAt: "2026-09-04",
  // ここは /island-api/state が返るまでの数百ミリ秒しか出ないが、
  // 返らなかった日はこれが1日出しっぱなしになる。**日付を書かない。**
  // 出発を過ぎても「9/11 から北欧へ」と、済んだ予定を先の予定として言い続ける
  //
  // **済んだ予定を書かない。** ここには「ムタツミンダ公園の Food & Wine Fest に
  // 行く」が入っていて、あれは9月6日に終わっている。旅のあいだは電波の細い
  // ところを通るので `/island-api/state` が返らない日が必ず来る。その日に
  // 「今週、なにをするんだろう」の下へ、終わった催しが1日出しっぱなしになる。
  //
  // **旅の17日のあいだ、どの日に出ても本当のことだけを書く。**
  // 日付も、街の名前も、催しの名前も書かない——どれも1日で古くなる。
  // 書けるのは「どうやって進んで、何をしているか」だけ。
  week: ["北へ向かう車を、道ばたで探す", "たどり着いた街から、生配信する"],
};

/* 「これから」の予定は content/plans.ts に移した（写真や埋め込みを持たせるため）。 */

/** サイトに出す数字の初期値。/island-api/state の stats で上書きされる。 */
export const STATS_FALLBACK = {
  streams: 747,
  streamDays: 610,
  comments: 125262,
  people: 2215,
  countries: 17,
  /* **手で書かない。スタンプ帳から数える**（`docs/island-standards.md` 8章）。
     32 と書いてあって、同じ表紙の棚（`components/home/Shelf.tsx`）は
     `RECIPES.length` の 37 を出していた。**1つの面の中で数が2つあった。**
     どちらを押しても行き先は `/kitchen` で、あちらも 37。
     料理が増えるたびに同じことが起きるので、出どころを1つにする。 */
  recipes: RECIPES.length,
  since: "2024-10-28",
  updatedAt: "2026-09-04",
};
