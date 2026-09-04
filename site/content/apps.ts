/** 旅先で作ってきたアプリ。配信で作っているところをそのまま見せている。 */
export type AppMilestone = { date: string; title: string; note?: string; videoId?: string; kind: "release" | "update" | "build" | "trouble" | "milestone" };

export type AppEntry = {
  slug: string;
  name: string;
  emoji: string;
  /** 一覧に出す絵。site/public/sprites のスプライト名 */
  icon: string;
  /** 公式のアプリアイコン(あれば、こちらを優先して出す) */
  logo?: string;
  tagline: string;
  status: "運営中" | "公開済み";
  links: { label: string; href: string }[];
  summary: string;
  milestones: AppMilestone[];
};

export const APPS: AppEntry[] = [
  {
    slug: "nanitabeyo",
    icon: "food-plate-dinner",
    logo: "/logos/nanitabeyo.png",
    name: "なに食べよ",
    emoji: "🍽️",
    tagline: "「今日なに食べよ」を、ストレスなく決められるグルメアプリ",
    status: "運営中",
    links: [
      { label: "App Store", href: "https://apps.apple.com/jp/app/id6751139648" },
      { label: "Google Play", href: "https://play.google.com/store/apps/details?id=com.nanitabeyo" },
    ],
    summary:
      "「外食を決めるのがしんどい」をなくすために作っているアプリ。目標は食べログ超え。設計も、料理の文言も、ランキングも、配信でみんなに意見をもらいながら決めてきた。いまも毎週アップデートしている。",
    milestones: [
      { date: "2025-06-06", kind: "build", title: "みんなで外食のお悩みを考えて、解決するアプリを作ろう", note: "ヨルダンで始まった", videoId: "NRQKj5-QcmQ" },
      { date: "2025-06-13", kind: "build", title: "もくもくアプリ作り配信を始めた", videoId: "P83YQna7Rns" },
      { date: "2025-07-24", kind: "build", title: "ストレスなく「食べたい」を選ぶには？を真剣議論", videoId: "5w4lCuWpeWQ" },
      { date: "2025-07-31", kind: "build", title: "アプリデザイン完成。このアプリの思いを話した", videoId: "cq4f4hH-1ak" },
      { date: "2025-08-16", kind: "build", title: "英語名が決まった", videoId: "QieWHVc69q8" },
      { date: "2025-08-17", kind: "build", title: "アプリアイコン完成", videoId: "6bi2gCN4_dQ" },
      { date: "2025-08-31", kind: "milestone", title: "Android 審査通過", videoId: "3YtMCGsAcRo" },
      { date: "2025-09-02", kind: "release", title: "リリース🎉", note: "クタイシから報告", videoId: "LjE5Zen0f7g" },
      { date: "2025-11-14", kind: "release", title: "サーバーリリース完了", videoId: "Gr4RW4u9IFs" },
      { date: "2025-11-21", kind: "milestone", title: "広告を開始", videoId: "VQKtu8xsAM0" },
      { date: "2025-12-18", kind: "build", title: "料理文言をみんなで整えた", note: "「みんなの感性の結晶」と言っていた", videoId: "w_kql8jnB30" },
      { date: "2025-12-27", kind: "update", title: "料理提案がアップデート", videoId: "ugR8frPW7gY" },
      { date: "2026-01-24", kind: "release", title: "リリース。1月の団結を出し切った", videoId: "SbeFAEeSyM0" },
      { date: "2026-02-11", kind: "build", title: "料理画像を綺麗にしよう 第二弾", note: "視聴者さんが大量に協力した回", videoId: "u2bIxRNKa6g" },
      { date: "2026-02-26", kind: "update", title: "バージョンアップ", videoId: "Wz4N7mwAof8" },
      { date: "2026-06-08", kind: "trouble", title: "アプリ存続の危機！？打開策を絞り出した", videoId: "wxaQlQHchYQ" },
      { date: "2026-06-25", kind: "build", title: "好き嫌い投票機能を1日で作る", note: "作り切るまで終われません", videoId: "zflWFzFKQeE" },
      { date: "2026-07-07", kind: "build", title: "新条件＋深堀検索を1日で作る", videoId: "qfktydDGtIk" },
      { date: "2026-07-17", kind: "milestone", title: "自作グルメアプリの食べログ越えなるか！？", videoId: "Hc-z52fs108" },
      { date: "2026-07-25", kind: "build", title: "チュートリアル機能と機能改善40件", videoId: "iOSWFRFuAQ4" },
      { date: "2026-08-22", kind: "build", title: "アプリの第一印象をめっちゃよくする", videoId: "rzPoxwfm5lI" },
    ],
  },
  {
    slug: "nanikore",
    icon: "signpost",
    name: "なにこれオーディオガイド",
    emoji: "🎧",
    tagline: "旅先で「これ何？」を音声で教えてくれるガイド",
    status: "公開済み",
    links: [],
    summary:
      "「なに食べよ」より前に作っていたアプリ。旅をしながら、目の前のものが何なのか分からないという自分の困りごとから作った。エジプト滞在中にお試し版を公開し、そのままリリースした。",
    milestones: [
      { date: "2025-04-29", kind: "build", title: "お試し版を公開", note: "エジプトぷらり配信で", videoId: "Y-EvbeBomrU" },
      { date: "2025-05-11", kind: "release", title: "リリース🎊", videoId: "cisSYeOGDUE" },
      { date: "2025-07-09", kind: "update", title: "大型アップデート", videoId: "-gaULSsv63Y" },
      { date: "2025-07-12", kind: "trouble", title: "不具合が直った", videoId: "4fOkTVpRVpo" },
    ],
  },
];

export const appBySlug = (slug: string) => APPS.find((a) => a.slug === slug);
