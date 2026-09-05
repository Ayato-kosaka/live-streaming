/**
 * あやとが作ってきたアプリ。
 *
 * **`APPS` は「配信で作っているところを見せてきたアプリ」。** `/apps`（アプリ）に並ぶのはこの2本。
 * 日本を出るまえに作っていた3本目（Spelieve）は、配信が1本も無いので `PAST_APPS` に分けた。
 * 同じ型にしてあるので、工房に並べたくなったら `[...APPS, ...PAST_APPS]` で足りる。
 * ただし `/apps` は「いちばん新しくやったこと」に配信の動画があることを前提にしているので、
 * 足すときはそこを先に直す。
 */
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
  status: "運営中" | "公開済み" | "サポート終了";
  /** アプリの中身。配信で作ってきた機能のうち、いま画面にあるものだけ書く。 */
  features: { title: string; note: string }[];
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
    features: [
      { title: "気分から絞る", note: "何が食べたいか決まっていなくても、気分と条件から進める" },
      { title: "好き嫌い投票", note: "みんなの投票が、次に出てくる料理に効く" },
      { title: "深掘り検索", note: "条件を足して、もっと細かく探す" },
      { title: "料理の写真と文言", note: "視聴者さんと一緒に、1枚ずつ選んで整えた" },
    ],
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
      { date: "2025-09-02", kind: "release", title: "リリース", note: "クタイシから報告", videoId: "LjE5Zen0f7g" },
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
    // App Store の公式アイコン（iTunes Search API の artworkUrl512 を 144px に焼いた）
    logo: "/logos/nanikore.webp",
    name: "なにこれオーディオガイド",
    emoji: "🎧",
    tagline: "旅先で「これ何？」を音声で教えてくれるガイド",
    status: "サポート終了",
    features: [
      { title: "目の前のものを説明", note: "「これ何？」に、読むのではなく耳で答える" },
      { title: "歩きながら聞く", note: "画面を見ずに済むので、旅の足を止めない" },
    ],
    links: [{ label: "App Store", href: "https://apps.apple.com/jp/app/id6745103291" }],
    summary:
      "「なに食べよ」より前に作っていたアプリ。旅をしながら、目の前のものが何なのか分からないという自分の困りごとから作った。エジプト滞在中にお試し版を公開し、そのままリリースした。「なに食べよ」を作り始めたころにサポートを終了している。",
    milestones: [
      { date: "2025-04-29", kind: "build", title: "お試し版を公開", note: "エジプトぷらり配信で", videoId: "Y-EvbeBomrU" },
      { date: "2025-05-11", kind: "release", title: "リリース", videoId: "cisSYeOGDUE" },
      { date: "2025-07-09", kind: "update", title: "大型アップデート", videoId: "-gaULSsv63Y" },
      { date: "2025-07-12", kind: "trouble", title: "不具合が直った", videoId: "4fOkTVpRVpo" },
    ],
  },
];

/**
 * 配信を始めるまえに作っていたアプリ。
 *
 * **島の話がここから始まる。** 日本を出たのは、このアプリを広めるため。
 * 自分の作ったアプリで計画しながら旅する様子をショート動画で撮る、というのが出発の理由だった
 * （本人の話）。日付とストアの名前は App Store（iTunes Search API）から取っている。
 * 配信より前の話なので節目に動画は無い。
 */
export const PAST_APPS: AppEntry[] = [
  {
    slug: "spelieve",
    icon: "signpost",
    logo: "/logos/spelieve.webp",
    name: "スペリーブ",
    emoji: "",
    tagline: "旅行の計画を、数分で1枚のしおりにするアプリ",
    status: "サポート終了",
    features: [
      { title: "しおりを作る", note: "行きたい場所を並べると、旅程が1枚になる" },
      { title: "時間の自動調整", note: "1つ動かすと、あとの予定の時間がついてくる" },
      { title: "移動時間の計算", note: "地点と地点のあいだを、歩きと車で自動計算" },
    ],
    links: [{ label: "App Store", href: "https://apps.apple.com/jp/app/id1660453134" }],
    summary:
      "会社に勤めていたころに作っていた旅行計画アプリ。ストアでの名前は Spelieve。これをヒットさせるために、自分のアプリで計画しながら海外を旅する様子をショート動画で撮ろうとして、日本を出た。プロモーションはうまくいかず、「なに食べよ」を作り始めたころにサポートを終了した。",
    milestones: [
      { date: "2023-01-09", kind: "release", title: "App Store に出した" },
      { date: "2023-12-05", kind: "update", title: "最後のアップデート", note: "バージョン 2.5.0" },
    ],
  },
];

/**
 * slug からアプリを引く。**`PAST_APPS` も含めて探す。**
 *
 * ここを `APPS` だけにしていたので、`/apps/spelieve` が 404 だった。
 * 3本目は「配信より前」というだけで、無かったことにしていいアプリではない
 * （日本を出た理由そのもの）。
 */
export const appBySlug = (slug: string) =>
  APPS.find((a) => a.slug === slug) ?? PAST_APPS.find((a) => a.slug === slug);

/** 作った順に3本。`/about` の「作ってきたアプリ」はこれを見る。 */
export const ALL_APPS: AppEntry[] = [...APPS, ...PAST_APPS].sort(
  (a, b) => (a.milestones[0]?.date ?? "").localeCompare(b.milestones[0]?.date ?? ""),
);
