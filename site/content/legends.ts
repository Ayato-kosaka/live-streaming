/** 語り継がれている大きい企画・大きい日。 */
/**
 * 一撃で伝わる数字。
 * `n` は数字でなくてもいい（「運まかせ」のように言葉のこともある）。
 * その場合は画面側で小さめに出す。
 */
export type Figure = { n: string; unit?: string; cap: string };

export type Legend = {
  slug: string;
  title: string;
  emoji: string;
  /**
   * 一覧に出す絵。`site/public/sprites` のスプライト名。
   *
   * **企画1つに絵1つ。看板や石碑を使い回さない。** 丘に並ぶのは
   * 「380km歩いた」「エジプトの遺跡を5日」のように性格の違う企画で、
   * 汎用の絵を配ると、どれがどれだか分からない棚になる。
   * 焼くところは `tools/sprites/manifest.mjs` の「丘の記念碑」（島の建物は丘の館のまま。札の名前だけ「伝説の企画」にした）。
   */
  icon: string;
  date: string;
  span?: string;
  lead: string;
  /** 見出しの真下に大きく出す1つ。ここだけで何の企画か伝わる数にする。 */
  figure: Figure;
  /** 数字をもう2つまで。図鑑の「記録」の欄にあたる。 */
  facts?: Figure[];
  body: string[];
  streams: { date: string; videoId: string; title: string }[];
};

export const LEGENDS: Legend[] = [
  {
    slug: "iran-walk",
    icon: "legend-iran-walk",
    title: "イランまで歩く",
    emoji: "🚶",
    date: "2026-04-29",
    span: "2026/4/29 – 5/11（12日間・約380km）",
    lead: "「怖いイメージを変えたいので、一緒にご飯を食べにイランまで歩く」。GWの12日間、アルメニアの首都エレバンからイラン国境のメグリまで、ほぼ歩いて向かった企画。",
    figure: { n: "380", unit: "km", cap: "歩いた距離" },
    facts: [
      { n: "12", unit: "日間", cap: "毎日13時から" },
      { n: "70", unit: "km", cap: "最終日に歩いた" },
    ],
    body: [
      "毎日13時に配信を始めて、その日歩いた距離をタイトルに入れていった。23キロ、29キロ、50キロ、46キロ、37キロ、29キロ、45キロ、そして最終日70キロ。",
      "5日目には道中の祭りに寄り道し、9日目は1日2本立てになった。最終日はゴール1時間前にも配信を立てている。",
      "帰りはヒッチハイクで3本立て。乗せてくれた人と話しながらエレバンに戻ってきた。",
    ],
    streams: [
      { date: "2026-04-27", videoId: "nwhLr4AuS1M", title: "【作戦会議】GW にイランまで歩こうと思います" },
      { date: "2026-04-29", videoId: "M11XX1oeng8", title: "【1日目①】アルタシャト 23キロ" },
      { date: "2026-05-03", videoId: "WaKv25Z-r18", title: "【5日目②】祭り見る" },
      { date: "2026-05-08", videoId: "TFiFG8lrcpA", title: "【最終日】メグリ 70キロ" },
      { date: "2026-05-08", videoId: "HfH1RooVuEQ", title: "【ゴール１時間前】" },
      { date: "2026-05-10", videoId: "rHUoWeMPa1o", title: "【帰路ヒッチハイク①】" },
    ],
  },
  {
    slug: "egypt-festival",
    icon: "legend-egypt-festival",
    title: "GWエジプト祭り",
    emoji: "🏛️",
    date: "2025-05-03",
    span: "2025/5/3 – 5/7（5日間）",
    lead: "ゴールデンウィークの5日間、ルクソール西岸の王家の谷からアスワン、アブ・シンベル神殿まで、エジプトの遺跡を毎日ぶっ通しで回った企画。",
    figure: { n: "5", unit: "日間", cap: "遺跡をまわり続けた" },
    facts: [
      { n: "4", unit: "都市", cap: "ルクソールからアブ・シンベルまで" },
    ],
    body: [
      "1日目は王家の谷エリア、2日目はルクソール東側の神殿巡りとラクダ飯、3日目はアスワン巡り、最終日はアブ・シンベル神殿。",
      "前夜には「GWエジプト祭前夜」と題してピザを食べる配信もしている。",
    ],
    streams: [
      { date: "2025-05-02", videoId: "iLNWFjrdVFw", title: "GWエジプト祭前夜！エジプト🇪🇬ピザ🍕食べました" },
      { date: "2025-05-03", videoId: "2zzbFQe52cc", title: "1日目 - ルクソール西岸 王家の谷エリア" },
      { date: "2025-05-04", videoId: "cK0tttTZ3as", title: "2日目 - ルクソール東側 神殿巡りとラクダ飯" },
      { date: "2025-05-05", videoId: "zlgM1S0yl2Q", title: "3日目 - アスワン巡り" },
      { date: "2025-05-06", videoId: "EulWB4cVngk", title: "最終日 - アブ・シンベル神殿" },
    ],
  },
  {
    slug: "newyear-24h",
    icon: "legend-newyear-24h",
    title: "年越し24時間配信",
    emoji: "🎍",
    date: "2024-12-31",
    lead: "イギリスから、日本の年越しとイギリスの年越しの両方をまたいで24時間配信した回。「全ての応援してくださった方に感謝を言わせてください」というタイトルだった。",
    figure: { n: "24", unit: "時間", cap: "つなぎっぱなし" },
    facts: [
      { n: "2", unit: "回", cap: "日本とイギリス、年越しの数" },
    ],
    body: [
      "イギリスの年越しは日本時間で元旦の朝9時。日本の年越しから9時間、ずっと繋いでいた。",
      "翌年はジョージアのバトゥミから7時間の「W年越し配信」をやっている。",
    ],
    streams: [
      { date: "2024-12-31", videoId: "LfUJ25h2f44", title: "【年越し】24時間配信するので、全ての応援してくださった方に感謝を言わせてください🥳" },
      { date: "2025-12-31", videoId: "ri120z7_4Ic", title: "今年のW年越し配信は、ジョージア🇬🇪バトゥミで7時間" },
    ],
  },
  {
    slug: "million-views",
    icon: "legend-million-views",
    title: "ショート動画100万再生",
    emoji: "📈",
    date: "2026-03-23",
    lead: "毎日のショート動画作りが実を結んだ日。「鬼嫁」シリーズが10万、そして100万再生に届いた。",
    figure: { n: "100", unit: "万回", cap: "ショート動画の再生" },
    facts: [
      { n: "12", unit: "日", cap: "10万から100万まで" },
    ],
    body: [
      "3月11日に10万再生、17日に2本目の10万再生、23日に100万再生。24日には「1アカウントしかバズらない壁」を超えた。",
      "5月19日には「友達ともめる」ショートが再び100万再生を超えている。",
    ],
    streams: [
      { date: "2026-03-11", videoId: "aWFNSGUPGjg", title: "㊗️10万再生行ってた笑 時代は鬼嫁かぁ" },
      { date: "2026-03-23", videoId: "47-oT3RFBd0", title: "100万再生いったぞ〜〜〜" },
      { date: "2026-05-19", videoId: "p1-bliAqLJo", title: "友達ともめるショート動画が100万再生越えたよーん！" },
    ],
  },
  {
    slug: "roulette-georgia",
    icon: "legend-roulette-georgia",
    title: "ルーレットで行くジョージアぶらり旅",
    emoji: "🎡",
    date: "2026-07-19",
    lead: "行き先をルーレットで決めて、出たところに行く新企画。偶然に身をまかせる旅。",
    figure: { n: "運まかせ", cap: "行き先の決め方" },
    body: ["視聴者さんと一緒に回して、出た目の場所に向かう。企画会議で生まれて、その週のうちに実行された。"],
    streams: [{ date: "2026-07-19", videoId: "8FwBXXD97Ik", title: "新企画！ルーレットで行く！ジョージアぶらり旅" }],
  },
  {
    slug: "kazbegi",
    icon: "legend-kazbegi",
    title: "カズベキ遠征",
    emoji: "⛰️",
    date: "2026-08-02",
    span: "2026/8/2 – 8/16",
    lead: "ジョージアの山の中、カズベキに2週間こもった。バカでかい山、山の中の滝、世界で一番天国に近い教会、そして山の上の湖まで歩いた。",
    figure: { n: "2", unit: "週間", cap: "山にこもった" },
    facts: [
      { n: "2", unit: "品", cap: "山の宿でも作った料理" },
    ],
    body: [
      "滞在中もクッキングは続いていて、アクアパッツァとマルゲリータピザを山の宿で作っている。",
      "企画会議もホステル紹介もカズベキから配信した。",
    ],
    streams: [
      { date: "2026-08-02", videoId: "v1PRwv1CWO0", title: "ジョージアのバカでか山までいきます" },
      { date: "2026-08-04", videoId: "LdgTh1DC3Jk", title: "ジョージアの山の中の滝行こ" },
      { date: "2026-08-09", videoId: "53OdLlM6VIU", title: "世界で一番天国に近い教会行こ" },
      { date: "2026-08-12", videoId: "lPCx2VMe4pc", title: "カズベキの滝見に行こ！カズ滝" },
      { date: "2026-08-23", videoId: "v3L539GafQo", title: "海外の山の上の湖まで歩きます" },
    ],
  },
  {
    slug: "iwashi-festival",
    icon: "legend-iwashi-festival",
    title: "ジョージアイワシ祭り",
    emoji: "🐟",
    date: "2026-07-22",
    span: "2026/7/22 – 7/24（3日間）",
    lead: "イワシを3日連続で食べ続けた祭り。冷やし中華、塩焼き、パエリア。",
    figure: { n: "3", unit: "日連続", cap: "イワシを食べた" },
    facts: [
      { n: "3", unit: "品", cap: "冷やし中華・塩焼き・パエリア" },
    ],
    body: ["企画会議で「イワシで3日いける」となって始まった、いちばんばかばかしくて楽しかったクッキング企画のひとつ。"],
    streams: [
      { date: "2026-07-21", videoId: "n-BJIqSuH9M", title: "ジョージアでクッキング企画会議や！" },
      { date: "2026-07-22", videoId: "lAzVgZ_DdTw", title: "イワシの冷やし中華" },
      { date: "2026-07-23", videoId: "SQXQOF1_Qhg", title: "イワシの塩焼き" },
      { date: "2026-07-24", videoId: "EjRXQuzubLo", title: "イワシのパエリア" },
    ],
  },
  {
    slug: "thousand-subs",
    icon: "legend-thousand-subs",
    title: "チャンネル登録1,000人",
    emoji: "🎊",
    date: "2025-12-16",
    lead: "配信を始めて1年2ヶ月。1,000人を超えた日。",
    figure: { n: "1,000", unit: "人", cap: "チャンネル登録" },
    facts: [
      { n: "1", unit: "年2ヶ月", cap: "配信を始めてから" },
    ],
    body: [
      "2025年4月に500人、8月に700人、10月に800人、12月8日に900人、そして12月16日に1,000人。",
      "1月28日には1,100人を突破している。",
    ],
    streams: [
      { date: "2025-12-15", videoId: "hJW3dD7yOT0", title: "超えるぞーーーー" },
      { date: "2025-12-16", videoId: "h-MRAFyj3Yc", title: "㊗️チャンネル登録者１,000人超えました" },
    ],
  },
];

export const legendBySlug = (slug: string) => LEGENDS.find((l) => l.slug === slug);
