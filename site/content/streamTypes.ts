/** 配信の5つの型。押すとそれぞれの深掘りページに行く。 */
export type StreamType = {
  slug: string;
  name: string;
  emoji: string;
  /** 島に置いてあるスプライト名。UIの絵はこちらを使う。 */
  icon: string;
  color: string;
  when: string;
  lead: string;
  body: string[];
  /** カードに出す一行。lead は長いので、一覧ではこちらを出す。 */
  short: string;
  /**
   * 1週間のどこに出るか。`when` を絵にするためだけの位置で、決まりではない。
   * 0=月 … 6=日。曜日に貼りつかないものは "any"(天気しだい) / "monthend"(月末)。
   */
  week: { from: number; to: number } | "any" | "monthend";
  /** よくある流れ。3つまで。番号を振って順番が見えるようにする。 */
  beat: string[];
  /** その型の代表的な配信 */
  samples: { date: string; videoId: string; title: string }[];
  /** さらに深く見るリンク */
  deeper?: { label: string; href: string };
};

export const STREAM_TYPES: StreamType[] = [
  {
    slug: "cooking",
    name: "クッキング配信",
    emoji: "🍳",
    icon: "hut-kitchen",
    color: "var(--roof-coral)",
    when: "だいたい週の後半",
    short: "何を作るかから一緒に決める、3日がかりの連続ドラマ。",
    week: { from: 3, to: 5 },
    beat: ["何を作るか決める", "市場へ買い出し", "作って、食べる"],
    lead: "「何を作るか」から一緒に決めて、買い出しに行って、作って食べる。3日がかりの連続ドラマみたいなクッキング。",
    body: [
      "1日目に企画会議で作るものを決め、2日目に市場やスーパーへ買い出し、3日目に調理して食べる。この3日構成が定着している。",
      "現地の食材で日本の料理を再現したり、逆に現地の料理を作ってみたり。ジョージア風◯◯というメニューがどんどん増えていった。",
      "南蛮漬け5種やイワシ3連戦のように、1つの食材で何日も引っぱる回もある。",
    ],
    samples: [
      { date: "2026-08-21", videoId: "xo1eYfB4RyU", title: "ジョージア料理オジャフリつくろーー！！" },
      { date: "2026-07-16", videoId: "c6FFPcY8Tac", title: "ジョージア風南蛮漬け5種をついに食べます！" },
      { date: "2026-07-31", videoId: "ZcchwhRE_Ks", title: "本気のクッキングや！！唐揚げ定食つくるぞ！！" },
    ],
    deeper: { label: "作ってきた料理を全部見る", href: "/kitchen" },
  },
  {
    slug: "walk",
    name: "おさんぽ・絶景配信",
    emoji: "🚶",
    icon: "tree-palm",
    color: "var(--roof-mint)",
    when: "天気がいい日",
    short: "目的地に着くまでの道のりごと、そのまま流す。",
    week: "any",
    beat: ["行き先を決める", "歩きながら喋る", "着く（着かない日もある）"],
    lead: "湖まで歩く、滝を見に行く、教会に登る。目的地に着くまでの道のりごと配信する。",
    body: [
      "トビリシ海まで歩く、リシ湖に行く、ロープウェイに乗る、山の上の湖まで歩く。歩きながら喋る時間がいちばん長い配信。",
      "「世界で一番天国に近い教会」「ジョージアの本当は言いたくない散歩ルート」など、その土地でしか撮れないものが多い。",
      "たどり着けない日や、電波が切れる日もそのまま配信になる。",
    ],
    samples: [
      { date: "2026-08-23", videoId: "v3L539GafQo", title: "海外の山の上の湖まで歩きます" },
      { date: "2026-08-09", videoId: "53OdLlM6VIU", title: "世界で一番天国に近い教会行こ" },
      { date: "2026-07-11", videoId: "Pnbi01M0t0I", title: "土曜やしトビリシ海まで歩こか！" },
    ],
    deeper: { label: "歩いてきた17カ国を見る", href: "/map" },
  },
  {
    slug: "making",
    name: "アプリ作り配信",
    emoji: "💻",
    icon: "hut-workshop",
    color: "var(--roof-sky)",
    when: "だいたい金曜",
    short: "「なに食べよ」を、目の前で作っていく。",
    week: { from: 4, to: 4 },
    beat: ["今日のゴールを宣言", "目の前で作る", "できるまで終わらない"],
    lead: "自作のグルメアプリ「なに食べよ」を、目の前で作る。「作り切るまで終われません」と宣言して長時間やる日もある。",
    body: [
      "画面デザイン、料理の文言、検索条件、チュートリアル。何をどう作るかを配信で相談しながら決めている。",
      "「好き嫌い投票機能を1日で作ります」「機能改善40件出来るまで終われません」のように、その日のゴールを先に宣言する形が多い。",
      "料理画像やランキングの整備は、視聴者さんが実際に手を動かして手伝ってくれた回もある。",
    ],
    samples: [
      { date: "2026-08-22", videoId: "rzPoxwfm5lI", title: "アプリ作り配信や！アプリの第一印象をめっちゃよくする！" },
      { date: "2026-07-07", videoId: "qfktydDGtIk", title: "新機能（新条件＋深堀検索）を1日で作ります" },
      { date: "2026-07-25", videoId: "iOSWFRFuAQ4", title: "チュートリアル機能と機能改善４０件出来るまで終われません！" },
    ],
    deeper: { label: "アプリの歴史を見る", href: "/apps" },
  },
  {
    slug: "meeting",
    name: "今週の企画会議",
    emoji: "🗣️",
    icon: "signboard",
    color: "var(--roof-gold)",
    when: "週のはじめ",
    short: "来週なにをするかを、コメントと一緒に決める会。",
    week: { from: 0, to: 1 },
    beat: ["「今日なにしよかー！」", "コメントの案を拾う", "来週の予定になる"],
    lead: "来週なにをするかを、視聴者さんと一緒に決める会。この島でいちばん大事な回。",
    body: [
      "「今日なにしよかー！」から始まって、コメントで出たアイデアを拾って予定にしていく。クッキングのメニューも、旅先も、ここで決まることが多い。",
      "ルーレットで行くぶらり旅も、イワシ祭りも、イランまで歩く企画も、もとは企画会議で出た話。",
      "月末配信の中身も、月末が近づくと企画会議で決めている。",
    ],
    samples: [
      { date: "2026-08-24", videoId: "w5cSdSGRJ2E", title: "今週の企画会議や！月末配信なにしよー！" },
      { date: "2026-08-11", videoId: "dRXae0mJw8M", title: "企画会議や！！" },
      { date: "2026-07-29", videoId: "ri3_F6zhtDA", title: "今週の企画会議や！おもろい一週間にしよう！！！" },
    ],
    deeper: { label: "企画を提案する", href: "/board" },
  },
  {
    slug: "monthly",
    name: "月末配信",
    emoji: "🏆",
    icon: "fountain",
    color: "#c79bff",
    when: "毎月末",
    short: "1ヶ月ぶんのチャットを全部読んで選ぶ、授賞式。",
    week: "monthend",
    beat: ["1ヶ月ぶんを読み返す", "表彰するものを選ぶ", "授賞式（朝まで）"],
    lead: "1ヶ月をふりかえる授賞式。出席リスナー表彰、名言アワード、おもしろコメント大賞、投げ銭ありがとう。1ヶ月分のチャットを全部読んで作っている。",
    body: [
      "その月に流れたコメントを全部読み返して、名言や流行語、盛り上がった瞬間を選んで表彰する。",
      "皆勤賞の発表や、初見さんの紹介、常連さん表彰もこの回。",
      "翌日には「タップタップ結果発表」がセットになっていることが多い。",
    ],
    samples: [
      { date: "2026-07-26", videoId: "d8UwWnFhjwY", title: "7月の月末配信や！！アツい1ヶ月だった！朝日みるぞ！" },
      { date: "2026-06-28", videoId: "anL82TSPG4c", title: "６月末配信！なかなか素晴らしい1ヶ月やったんちゃう？" },
      { date: "2026-05-31", videoId: "zLIQ9yySAas", title: "5月の月末配信！良い1ヶ月だった！" },
    ],
  },
];

export const streamTypeBySlug = (slug: string) => STREAM_TYPES.find((s) => s.slug === slug);
