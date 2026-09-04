/**
 * これまでに歩いた国。BigQuery(youtube_chat.videos)の配信タイトルから復元している。
 * 日付は JST の配信日。`videoId` はその話が出てくる配信。
 */
export type Highlight = { title: string; note: string; date?: string; videoId?: string };

export type Country = {
  slug: string;
  name: string;
  en: string;
  flag: string;
  region: "ヨーロッパ" | "中東・アフリカ" | "コーカサス";
  order: number;
  stays: { from: string; to: string; cities: string[] }[];
  summary: string;
  highlights: Highlight[];
};

export const COUNTRIES: Country[] = [
  {
    slug: "france",
    name: "フランス",
    en: "France",
    flag: "🇫🇷",
    region: "ヨーロッパ",
    order: 1,
    stays: [
      { from: "2024-10-28", to: "2024-11-07", cities: ["パリ"] },
      { from: "2025-03-04", to: "2025-03-19", cities: ["ルーアン", "モン・サン・ミシェル", "南フランス", "パリ"] },
    ],
    summary:
      "配信のいちばん最初の国。「日本語を話したい」というタイトルで始まった。半年後にもう一度戻ってきて、今度は南仏まで下りていった。",
    highlights: [
      { title: "配信第1回", note: "「【ヨーロッパひとり旅】日本語を話したい...」ここから全部が始まった", date: "2024-10-28", videoId: "Tbzv8ZWnZ-I" },
      { title: "モン・サン・ミシェルが海に浮いてた", note: "青空の下、海に浮かぶ姿が見られた日", date: "2025-03-05", videoId: "Lmk2lp9iFQ8" },
      { title: "レ・ボー＝ド＝プロヴァンスの三ツ星", note: "フレンチの三ツ星は別格だった", date: "2025-03-10", videoId: "hB1jT4Nl4II" },
      { title: "パリを歩き尽くす神回", note: "エッフェル塔から蚤の市、カヌレまで", date: "2025-03-15", videoId: "RFpKH_hIKcw" },
    ],
  },
  {
    slug: "netherlands",
    name: "オランダ",
    en: "Netherlands",
    flag: "🇳🇱",
    region: "ヨーロッパ",
    order: 2,
    stays: [{ from: "2024-11-07", to: "2024-11-12", cities: ["アムステルダム"] }],
    summary: "運河のクルーズから配信した。まだ配信を始めて2週間の頃。",
    highlights: [{ title: "クルーズなう", note: "船の上から少しだけ", date: "2024-11-07", videoId: "9d5fKfP0XCU" }],
  },
  {
    slug: "belgium",
    name: "ベルギー",
    en: "Belgium",
    flag: "🇧🇪",
    region: "ヨーロッパ",
    order: 3,
    stays: [
      { from: "2024-11-13", to: "2024-11-18", cities: ["ブリュッセル"] },
      { from: "2025-03-21", to: "2025-03-27", cities: ["リエージュ"] },
    ],
    summary: "1度目は「暇や！」と言っていた。2度目のリエージュで、ワッフル発祥の焼きたてにたどり着いた。",
    highlights: [
      { title: "焼きたてリエージュワッフル", note: "本物の味に出会う旅", date: "2025-03-22", videoId: "V6lxgRozDJk" },
      { title: "トルティーヤを作った日", note: "スネちゃま誕生日おめでとう回", date: "2025-03-26", videoId: "mnI9zAyPBTU" },
    ],
  },
  {
    slug: "hungary",
    name: "ハンガリー",
    en: "Hungary",
    flag: "🇭🇺",
    region: "ヨーロッパ",
    order: 4,
    stays: [{ from: "2024-11-19", to: "2024-11-24", cities: ["ブダペスト"] }],
    summary: "「クソ陽キャな国」と言い切った国。寒さにやられながらも最高だと言っていた。",
    highlights: [
      { title: "ハンガリーってクソ陽キャな国…", note: "国の空気にあてられた回", date: "2024-11-21", videoId: "uJo3u6CRyMo" },
      { title: "別れはいつも突然に", note: "ハンガリー最終日", date: "2024-11-24", videoId: "aencgvAwwn4" },
    ],
  },
  {
    slug: "austria",
    name: "オーストリア",
    en: "Austria",
    flag: "🇦🇹",
    region: "ヨーロッパ",
    order: 5,
    stays: [{ from: "2024-11-26", to: "2024-12-02", cities: ["ウィーン"] }],
    summary: "「一生住みたい」と言った街で、スリにも遭った。卵を茹でながら喋る配信が定番になった時期。",
    highlights: [
      { title: "ウィーンに一生住みたい", note: "そして卵を茹でる", date: "2024-11-29", videoId: "PwnIyPj2tj4" },
      { title: "スリに遭った", note: "それでも卵は茹でる", date: "2024-11-27", videoId: "6RFpzPt0mt0" },
      { title: "2ヶ月ぶりにリア友に会えた", note: "涙が止まらなかった回", date: "2024-11-29", videoId: "8WG7ilvRePs" },
    ],
  },
  {
    slug: "slovakia",
    name: "スロバキア",
    en: "Slovakia",
    flag: "🇸🇰",
    region: "ヨーロッパ",
    order: 6,
    stays: [{ from: "2024-12-02", to: "2024-12-03", cities: ["ブラチスラバ"] }],
    summary: "通過するように立ち寄った国。",
    highlights: [{ title: "スロバキアに行くので", note: "チャンネル登録してください回", date: "2024-12-02", videoId: "SkOXq_X94zg" }],
  },
  {
    slug: "czech",
    name: "チェコ",
    en: "Czechia",
    flag: "🇨🇿",
    region: "ヨーロッパ",
    order: 7,
    stays: [{ from: "2024-12-03", to: "2024-12-10", cities: ["プラハ"] }],
    summary: "夜景が綺麗すぎた国。ここでアラサーになった。",
    highlights: [
      { title: "アラサーになった日", note: "日本時間でバースデーを跨ごう", date: "2024-12-05", videoId: "OoEq3gKRcKM" },
      { title: "カサ・アヤトの住人たち集合", note: "常連さんという言葉が生まれ始めた頃", date: "2024-12-05", videoId: "bvAnOtEPXls" },
    ],
  },
  {
    slug: "germany",
    name: "ドイツ",
    en: "Germany",
    flag: "🇩🇪",
    region: "ヨーロッパ",
    order: 8,
    stays: [
      { from: "2024-12-10", to: "2024-12-25", cities: ["ベルリン"] },
      { from: "2025-03-28", to: "2025-03-30", cities: ["ケルン"] },
    ],
    summary: "ベルリンの壁を並走し、変な髪型にされ、スイーツをお裾分けした。3ヶ月後にケルンでヨーロッパ編を締めた。",
    highlights: [
      { title: "ベルリンの壁を並走した", note: "歩きながら喋った回", date: "2024-12-12", videoId: "dv6acJbB49A" },
      { title: "ケルン大聖堂が想像の3倍デカかった", note: "チョコ博物館から始まった1日", date: "2025-03-28", videoId: "W5Q-wKTzflY" },
      { title: "ヨーロッパ周遊完了", note: "半年間ありがとうございました", date: "2025-03-29", videoId: "8WsaJ2j_iHk" },
    ],
  },
  {
    slug: "uk",
    name: "イギリス",
    en: "United Kingdom",
    flag: "🇬🇧",
    region: "ヨーロッパ",
    order: 9,
    stays: [
      {
        from: "2025-01-03",
        to: "2025-03-03",
        cities: ["ロンドン", "エディンバラ", "グラスゴー", "リバプール", "チェスター", "バーミンガム", "バース", "ブリストル"],
      },
    ],
    summary:
      "2ヶ月かけて縦断した、いちばん長く滞在した国。幽霊ホステル、ネズミホステル、一生に一度の嵐。ここで配信が毎日のリズムになった。",
    highlights: [
      { title: "衛兵交代式", note: "ロンドンが奇跡的に晴れた日", date: "2025-01-03", videoId: "1SyclE3VJ08" },
      { title: "グラスゴーの幽霊ホステル", note: "一生に一度の嵐で大災害", date: "2025-01-24", videoId: "bW2PJln-5mA" },
      { title: "ブリストルのバンクシー巡り", note: "絶景の吊橋が映えすぎた", date: "2025-02-22", videoId: "iI35QPmp8x8" },
      { title: "イギリス鶏を丸ごと焼いた", note: "クッキング配信の原型", date: "2025-02-10", videoId: "5D_7RU9cX8A" },
      { title: "2ヶ月周ったイギリスの総括", note: "今までありがとうございました", date: "2025-03-03", videoId: "n9FK4SYbcpA" },
    ],
  },
  {
    slug: "turkey",
    name: "トルコ",
    en: "Türkiye",
    flag: "🇹🇷",
    region: "中東・アフリカ",
    order: 10,
    stays: [{ from: "2025-03-30", to: "2025-04-13", cities: ["イスタンブール"] }],
    summary: "ヨーロッパを出て最初の国。アヤソフィア、ブルーモスク、グランドバザール。「ウザすぎる」と言いながら結局14日いた。",
    highlights: [
      { title: "アヤソフィアに行った", note: "初日から圧倒された", date: "2025-04-03", videoId: "Far6D8kifM4" },
      { title: "祝500人・ブルーモスク", note: "登録者500人を祝いながら", date: "2025-04-04", videoId: "x8Kbm9dDpYg" },
      { title: "スパチャ開始", note: "ニコシアでコーヒーとケーキでお祝い", date: "2025-04-16", videoId: "zB7LHQkGmXM" },
    ],
  },
  {
    slug: "cyprus",
    name: "キプロス",
    en: "Cyprus",
    flag: "🇨🇾",
    region: "中東・アフリカ",
    order: 11,
    stays: [
      { from: "2025-04-14", to: "2025-04-23", cities: ["ニコシア", "ラルナカ"] },
      { from: "2025-05-22", to: "2025-05-26", cities: ["ラルナカ", "パフォス"] },
    ],
    summary: "ヨーロッパ最後の分断都市ニコシア。エジプトの後にもう一度寄って「一ヶ月ぶりのヨーロッパに涙が止まらない」と言っていた。",
    highlights: [
      { title: "分断都市ニコシアをガチで歩く", note: "古代遺物と絶品グリル", date: "2025-04-19", videoId: "VB1x0w4ejdo" },
      { title: "エジプトとヨーロッパの違いを100個探す", note: "戻ってきた喜びの回", date: "2025-05-22", videoId: "QrgoRk4F-D4" },
      { title: "パフォスの地中海サンセット", note: "古代遺跡から夕陽まで", date: "2025-05-24", videoId: "GEthwfE5_vU" },
    ],
  },
  {
    slug: "egypt",
    name: "エジプト",
    en: "Egypt",
    flag: "🇪🇬",
    region: "中東・アフリカ",
    order: 12,
    stays: [{ from: "2025-04-24", to: "2025-05-21", cities: ["カイロ", "ルクソール", "アスワン", "アブ・シンベル", "シワ"] }],
    summary:
      "着いた初日からトラブルだらけ、詐欺にも遭った。それでもGWの5日間ぶっ通しの「エジプト祭り」でピラミッドから王家の谷、アブ・シンベルまで走り抜けた1ヶ月。",
    highlights: [
      { title: "ラクダで行くピラミッド", note: "エジプト料理で謝肉祭、博物館で古代ロマン", date: "2025-04-26", videoId: "hwJOAa5Kt8U" },
      { title: "GWエジプト祭り 1日目", note: "ルクソール西岸・王家の谷", date: "2025-05-03", videoId: "2zzbFQe52cc" },
      { title: "GWエジプト祭り 最終日", note: "アブ・シンベル神殿", date: "2025-05-06", videoId: "EulWB4cVngk" },
      { title: "シワの隠れ塩湖とサハラの夕焼け", note: "神回と呼ばれた回", date: "2025-05-11", videoId: "x6s9FF_lNlI" },
      { title: "ツタンカーメンに会ってきた", note: "夜のハーン・ハリーリまで7時間", date: "2025-05-17", videoId: "mdua-Zf4tGU" },
    ],
  },
  {
    slug: "jordan",
    name: "ヨルダン",
    en: "Jordan",
    flag: "🇯🇴",
    region: "中東・アフリカ",
    order: 13,
    stays: [{ from: "2025-05-27", to: "2025-06-25", cities: ["アンマン", "ペトラ", "死海"] }],
    summary:
      "ペトラ遺跡で限界まで歩き、死海に浮かび、大家族に飯を食わせてもらった国。ここで「みんなで外食の悩みを解決するアプリを作ろう」が始まった。",
    highlights: [
      { title: "ペトラ遺跡で限界街歩き", note: "シークを抜け、秘境モナストリー、夕日まで", date: "2025-05-31", videoId: "tQvjhxMivZQ" },
      { title: "死海×絶景リゾート", note: "贅沢ランチLIVE", date: "2025-06-14", videoId: "Gj9w3wu3jfQ" },
      { title: "投げ銭が止まらなくて泣いた", note: "中東飯を食べていた夜", date: "2025-06-19", videoId: "cnlL6aSh1xI" },
      { title: "アプリ作りが始まった", note: "みんなで外食のお悩みを考えて、解決するアプリを作ろう", date: "2025-06-06", videoId: "NRQKj5-QcmQ" },
    ],
  },
  {
    slug: "uae",
    name: "アラブ首長国連邦",
    en: "UAE",
    flag: "🇦🇪",
    region: "中東・アフリカ",
    order: 14,
    stays: [{ from: "2025-06-26", to: "2025-06-28", cities: ["アブダビ"] }],
    summary: "着いた瞬間に携帯が壊れた国。サウナのような暑さの中、白モスクとローカル飯とビーチを駆け足で回った。",
    highlights: [
      { title: "アブダビ街歩き", note: "白モスク→ローカル飯→夕暮れビーチ", date: "2025-06-27", videoId: "UbbfjRJ6KTM" },
      { title: "携帯がぶっ壊れた", note: "着いた初日の悲鳴", date: "2025-06-26", videoId: "aNWaUilNWbU" },
    ],
  },
  {
    slug: "azerbaijan",
    name: "アゼルバイジャン",
    en: "Azerbaijan",
    flag: "🇦🇿",
    region: "コーカサス",
    order: 15,
    stays: [{ from: "2025-06-29", to: "2025-07-18", cities: ["バクー"] }],
    summary:
      "「天国です」と言って入った国。親日すぎるし物価も安い。ここで「もくもくアプリ作り」配信が生まれ、アプリ作りが配信の柱になった。",
    highlights: [
      { title: "アゼルバイジャンが親日すぎます", note: "緊急配信", date: "2025-07-01", videoId: "scPjfmFsnrk" },
      { title: "もくもくアプリ作り 第一話", note: "アプリデザインをAIで作ってみる", date: "2025-06-13", videoId: "BW__7O79z9M" },
      { title: "ニンニクましましましましましトマト", note: "クッキング企画の原点", date: "2025-07-06", videoId: "9Q1ghbbZDqs" },
      { title: "詐欺に遭った", note: "最後の長時間配信は断念", date: "2025-07-05", videoId: "YvdLoprqbqE" },
    ],
  },
  {
    slug: "georgia",
    name: "ジョージア",
    en: "Georgia",
    flag: "🇬🇪",
    region: "コーカサス",
    order: 16,
    stays: [
      {
        from: "2025-07-19",
        to: "2026-04-18",
        cities: ["トビリシ", "クタイシ", "ズグディディ", "メスティア", "カズベキ", "ボルジョミ", "バトゥミ"],
      },
      { from: "2026-05-23", to: "", cities: ["トビリシ", "カズベキ"] },
    ],
    summary:
      "いちばん長くいる国。チーズパンと山と教会と黒海。ここで自作アプリ「なに食べよ」をリリースし、クッキング配信が定着し、常連さんが増えた。いまもここにいる。",
    highlights: [
      { title: "ジョージア着いたけど最高すぎた", note: "㊗️350本目", date: "2025-07-19", videoId: "YP9D8CihaXg" },
      { title: "ゲルゲティ三位一体教会", note: "カズベキの絶景", date: "2025-08-08", videoId: "PaxO-Ywl2C4" },
      { title: "なに食べよ がリリースされました", note: "クタイシから", date: "2025-09-02", videoId: "LjE5Zen0f7g" },
      { title: "バトゥミで年越し7時間", note: "W年越し配信", date: "2025-12-31", videoId: "ri120z7_4Ic" },
      { title: "アリロ。ジョージア正教会のクリスマス", note: "行列を追いかけた", date: "2026-01-07", videoId: "M1RvClI7mDg" },
      { title: "世界で一番天国に近い教会", note: "カズベキ遠征", date: "2026-08-09", videoId: "53OdLlM6VIU" },
    ],
  },
  {
    slug: "armenia",
    name: "アルメニア",
    en: "Armenia",
    flag: "🇦🇲",
    region: "コーカサス",
    order: 17,
    stays: [{ from: "2026-04-19", to: "2026-05-23", cities: ["エレバン", "セヴァン湖", "ゴリス", "タテフ", "カパン", "メグリ"] }],
    summary:
      "「わけあるめーにぁ」の国。ここからGW企画でイラン国境まで12日間歩いた。帰りはヒッチハイクでエレバンに戻ってきた。",
    highlights: [
      { title: "アルメニアでございます", note: "ジョージアからバスで入国", date: "2026-04-19", videoId: "jTpvux9mM44" },
      { title: "セヴァン湖までセヴァンマスを食べに", note: "13時から6時間", date: "2026-05-20", videoId: "haHAczqMooM" },
      { title: "ジェノサイドミュージアムまで歩く", note: "歩いて向かった日", date: "2026-05-17", videoId: "2y4IbYu-ZeI" },
      { title: "友達ともめるショートが100万再生", note: "エレバンで報告", date: "2026-05-19", videoId: "p1-bliAqLJo" },
    ],
  },
  {
    slug: "iran-border",
    name: "イラン（国境まで）",
    en: "Iran border",
    flag: "🇮🇷",
    region: "コーカサス",
    order: 18,
    stays: [{ from: "2026-04-29", to: "2026-05-08", cities: ["メグリ（国境）"] }],
    summary:
      "「怖いイメージを変えたいので、一緒にご飯を食べにイランまで歩く」というGW企画。アルタシャトから10日間、約380kmを歩いて国境にたどり着いた。",
    highlights: [
      { title: "1日目 アルタシャト 23キロ", note: "12時スタート", date: "2026-04-29", videoId: "M11XX1oeng8" },
      { title: "8日目 タテフ 29キロ", note: "山の中をひたすら", date: "2026-05-06", videoId: "8A-2mqkoAYs" },
      { title: "最終日 メグリ 70キロ", note: "ゴール1時間前の配信もある", date: "2026-05-08", videoId: "TFiFG8lrcpA" },
      { title: "帰路ヒッチハイク①", note: "12日目、ヒッチハイクでエレバンに帰る", date: "2026-05-10", videoId: "rHUoWeMPa1o" },
    ],
  },
];

export const countryBySlug = (slug: string) => COUNTRIES.find((c) => c.slug === slug);
