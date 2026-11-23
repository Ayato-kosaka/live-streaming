/**
 * **企画の表。島じゅうで1つ**（`docs/spec/model.md` M-3・M-4・M-16・M-20・M-21、`docs/adr/0004-projects-one-table.md`）。
 *
 * 企画は、名前のついた挑戦・祭り・節目。始まりと終わりが在って、旅の上に重なる。
 * **伝説は企画に付く印**（殿堂入り）で、別の表にしない。印が付いた行だけが `/legends` に並ぶ
 * （面の形に組むのは `content/legends.ts`）。
 *
 * **移動と滞在は、ここに書かない**（M-4）。いつどの国に居たかは滞在の表（`content/stays.ts`）。
 * 定例の配信の回（月末配信）も企画ではない。日付を持つお題（`content/themes.ts`）が受ける（M-32）。
 *
 * **企画の話（なぜ・決まり・名場面・結果）と、その数字（日数・距離・台数）の持ち主はここ**（M-20・M-21）。
 * 国・旅・あやとのこと の面は、ここを読んで出す。書き写さない。
 * ただし、旅の記録から数えられる数（北欧の台数・距離・国の数）は、記録から数える（`count`）。
 *
 * **この表は軽く保つ。** 表紙の「これから」・掲示板・お題の棚（client）がここを読む（`lib/leadPlan.ts`・`content/themes.ts`）。
 * 旅程の表（`content/nordic.ts`、109KB）をここで読むと、それがぜんぶ付いてくる。
 * 記録から数える数とリンク先は、面の側（`content/legends.ts`）で引く。
 *
 * **並び**: 伝説の印が付いた行どうしは、`/legends` に並ぶ順（先頭が「いちばん語られている」）。
 * 印の無い行が先。同じ日に何本も立つ日（9月11日は3本）は、カードと便りがこの並びのまま読む。
 */
/**
 * 一撃で伝わる数字。
 * `n` は数字でなくてもいい（「運まかせ」のように言葉のこともある）。
 * その場合は画面側で小さめに出す。
 */
export type Figure = { n: string; unit?: string; cap: string };

/**
 * 企画の表に数を書かず、**旅の記録から数える数**。数えるのは `content/legends.ts` の `counted`。
 *
 * 北欧の台数は `NORDIC_RIDES`（バスと船は数えない）、距離は `HITCH_KM`（`ROUTE` の hitch 区間の合計）、
 * 国は北欧周遊の滞在の国（`content/nordic.ts` と `content/stayChapters.ts`）。
 * 前はここに「18」「1,377」と手で写してあって、注に「向こうを直したらこちらも直す」と書いてあった
 * （`docs/island-misses.md` #38）。
 */
export type Counted = "nordic-rides" | "nordic-km" | "nordic-countries";

/** 表に書く数字。字で書くか、旅の記録から数えるか */
export type FigureSrc = Figure | (Omit<Figure, "n"> & { count: Counted });

/**
 * その企画のために作った、島の中の面。**道（`href`）は書かない**（M-6）。
 * 企画が指す旅（`trip`）から引く:
 * - `trip`  … その旅の島（`/island/<旅>`）
 * - `guide` … その旅のしおり（いまは北欧周遊だけが持つ）
 */
export type ProjectPage = { of: "trip" | "guide"; title: string; note: string };

/**
 * 歩いて行った企画の道のり（いまは「イランまで歩く」だけ）。
 * 国・旅・あやとのこと の面は、この値を読んで字にする。
 */
export type Course = {
  /** 歩き始めた街 */
  from: string;
  /** 歩いて着いた街 */
  to: string;
  /** 起点からゴールまでの道のり（km。地図の上の道のりで、峠ではヒッチハイクも使っている） */
  km: number;
  /** 企画の日数（帰り道を含む） */
  days: number;
  /** ゴールに着いたのが何日目か */
  arriveDay: number;
};

type Base = {
  slug: string;
  title: string;
  /**
   * 企画の日（始まった日。1日で終わったものはその日）。
   *
   * **島にどの旅で建つかは、ここでは決めない**（`trip` か、本線の旅の期間で決まる。
   * `components/isle/spec.ts` の `legendsOf`）。
   */
  date: string;
  /**
   * その企画が続いていた期間（UTC の日付。`[はじまり, おわり]`）。
   *
   * **`streams` は見どころの抜き書きで、その期間の配信ぜんぶではない。**
   * イランまで歩いた12日間は、抜き書きだと6本しか無いが、実際には15本ある。
   * ここに期間を書いておくと `python/build_legend_days.py` が
   * その期間の配信をぜんぶ数えて `content/legendDays.ts` に焼く。
   * 期間の無い企画（1日で終わったもの）は書かない。
   */
  range?: [string, string];
  /**
   * **旅そのものが企画のとき**の、その旅（`content/chapters.ts` の `slug`）。名前の鍵（M-6・M-16）。
   *
   * 日付の重なりでも、slug が同じ字であることでも結ばない。伝説はこの旅の島にだけ建つ
   * （枝の旅の伝説が、親の旅の島にも建たない）。旅1つにつき、指す企画は多くて1つ（M-16）。
   * 企画の期間（`range`）と旅の期間は別の事実なので、違っていてよい。違う理由は行の注に書く。
   */
  trip?: string;
};

/** 伝説の印が付いた企画。`/legends` に並ぶ中身を持つ */
export type LegendProject = Base & {
  /** **伝説の印**（殿堂入り）。M-3 */
  legend: true;
  /**
   * 一覧に出す絵。`site/public/sprites` のスプライト名。
   *
   * **企画1つに絵1つ。看板や石碑を使い回さない。** 丘に並ぶのは
   * 「380km歩いた」「エジプトの遺跡を5日」のように性格の違う企画で、
   * 汎用の絵を配ると、どれがどれだか分からない棚になる。
   * 焼くところは `tools/sprites/manifest.mjs` の「丘の記念碑」（島の建物は丘の館のまま。札の名前だけ「伝説の企画」にした）。
   */
  icon: string;
  emoji: string;
  span?: string;
  lead: string;
  /** 見出しの真下に大きく出す1つ。ここだけで何の企画か伝わる数にする。 */
  figure: FigureSrc;
  /** 数字をもう2つまで。図鑑の「記録」の欄にあたる。 */
  facts?: FigureSrc[];
  body: string[];
  /**
   * その企画の見どころの配信。
   *
   * **`videoId` は無いことがある。** 録画そのものが残らなかった回や、
   * 消えてしまった回（`docs/island-misses.md` #139）。そこへ送ると行き止まりに
   * なるので、リンクだけ外して日付と題名を残す。**その日があったことは消さない。**
   * 画面は押せない札として出す（`components/streams/Vid.tsx` の `VidGone`）。
   */
  streams: { date: string; videoId?: string; title: string }[];
  /**
   * **その企画のために作った、島の中の面。**
   *
   * あやと（2026-10-14）:
   *
   * > この時の作ったページを良い感じにリンクして欲しいの。
   * > せっかくみんなで意見出してページ作ったから導線作りたい。
   *
   * 配信（`streams`）は**その日に何があったか**の記録で、こちらは
   * **企画のために作って、いまも読めるもの**。別のものなので欄を分けてある。
   * 道は書かず、`trip` から引く（上の `ProjectPage`）。
   *
   * 無い企画のほうが多いので省略できる。**無いときは欄ごと出さない**
   * ——「作ったページはありません」とは書かない（`docs/island-standards.md` 6章）。
   */
  pages?: ProjectPage[];
  /** 歩いて行った企画の道のり（上の `Course`） */
  course?: Course;
};

/** 伝説の印の無い企画（単発の祭り・節目）。話の中身は持たず、声はその企画に結んだお題（`content/themes.ts`）が受ける */
export type EventProject = Base & { legend?: undefined };

export type Project = LegendProject | EventProject;

/**
 * 「イランまで歩く」の道のりと日数。**島じゅうで、ここ1か所にだけ書く**（M-20）。
 * 国（アルメニア）・旅（イランまで歩く）・あやとのこと・丘の館の札は、ここを読む。
 *
 * 前は面によって違っていた（12日間と10日間、起点がエレバンとアルタシャト）。
 * 配信の議事録と文字起こし（`streams/2026/04` `streams/2026/05`）で確かめた（2026-11-23）:
 * - **起点はエレバン。** 1日目①（2026-04-29、M11XX1oeng8）の場所が「エレバン（市内の公園・銅像→郊外）→…→アルタシャトの手前」。
 *   アルタシャトは1日目の行き先で、起点ではない。6日目①（05-04、v9geddQY-24）3:11:30「エレバンていうところから出発してます」
 * - **道のりは約380km。** 1日目① 0:05:00「エレバンから国境までの384km合計」、6日目① 3:11:30「合計380kmぐらい」、
 *   総集編の回（05-12、1blvBceH_SE）0:30:30「イランまで380km」。地図の上の道のりで、峠ではヒッチハイクも使っている
 *   （3日目の議事録。9日目①（05-07、ed8voejW_3M）4:39:00「合計360kmぐらいですね。ヒッチ込みで」）
 * - **企画は12日間。ゴールは10日目。** 1日目① 0:06:00「合計12日ぐらいかけて、4月の29日から5月の10日まで」。
 *   国境の町メグリに着いたのは10日目（05-08「【ゴール1時間前】…10日目、メグリ到着」HfH1RooVuEQ）、
 *   11日目が国境でピスタチオ（05-09、yj1lPCg5e20）、12日目がヒッチハイクの帰り道（05-10「12日目ヒッチハイクでエレバンに帰る」rHUoWeMPa1o）。
 *   議事録（05-11、ey_pIoeVo_8）も「イランまで歩いた12日間」
 */
const IRAN_WALK: Course = { from: "エレバン", to: "メグリ", km: 380, days: 12, arriveDay: 10 };

export const PROJECTS: Project[] = [
  {
    slug: "food-wine-fest",
    title: "Food & Wine Fest @ ムタツミンダ公園",
    date: "2026-09-06",
  },
  {
    slug: "georgia-bye",
    title: "ジョージアバイバイ",
    date: "2026-09-11",
  },
  {
    slug: "japan-2years",
    title: "海外出発二周年記念日",
    date: "2026-09-11",
  },
  {
    slug: "iran-walk",
    legend: true,
    /* **旅と1対1。** 枝の旅「イランまで歩く」（`content/chapters.ts` の `iran-walk`）。
       伝説はこの旅の島にだけ建つ——前は日付で章を引いていて、コーカサス周遊の島にも建っていた。

       **企画の期間（`range`）と旅の期間は別のもの。** 旅は歩いた日（04-29〜05-08。国境の町メグリに着いた10日目まで）で、
       企画は作戦会議の回（04-27）から、国境でピスタチオを食べた11日目と、ヒッチハイクで
       エレバンへ戻った12日目（05-10。最後の枠は日本時間の 05-11）までを含む。 */
    trip: "iran-walk",
    course: IRAN_WALK,
    icon: "legend-iran-walk",
    title: "イランまで歩く",
    emoji: "🚶",
    date: "2026-04-29",
    span: `2026/4/29 – 5/11（${IRAN_WALK.days}日間・約${IRAN_WALK.km}km）`,
    range: ["2026-04-27", "2026-05-11"],
    lead: `「怖いイメージを変えたいので、一緒にご飯を食べにイランまで歩く」。GWの${IRAN_WALK.days}日間、アルメニアの首都${IRAN_WALK.from}からイラン国境の${IRAN_WALK.to}まで、ほぼ歩いて向かった企画。`,
    figure: { n: String(IRAN_WALK.km), unit: "km", cap: "歩いた距離" },
    facts: [
      { n: String(IRAN_WALK.days), unit: "日間", cap: "毎日13時から" },
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
    legend: true,
    icon: "legend-egypt-festival",
    title: "GWエジプト祭り",
    emoji: "🏛️",
    date: "2025-05-03",
    span: "2025/5/3 – 5/7（5日間）",
    range: ["2025-05-03", "2025-05-07"],
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
    legend: true,
    icon: "legend-newyear-24h",
    title: "年越し24時間配信",
    emoji: "🎍",
    date: "2024-12-31",
    range: ["2025-12-31", "2026-01-01"],
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
      // **この回は録画が残っていない**（YouTube の頁は在るが、押すと見られない）。
      // 同じ日に他の配信は無く、そもそもこの企画はこの1本のことなので、
      // 消さずに `videoId` だけ外した。日付と題名は残る
      { date: "2024-12-31", title: "【年越し】24時間配信するので、全ての応援してくださった方に感謝を言わせてください🥳" },
      { date: "2025-12-31", videoId: "ri120z7_4Ic", title: "今年のW年越し配信は、ジョージア🇬🇪バトゥミで7時間" },
    ],
  },
  {
    slug: "million-views",
    legend: true,
    icon: "legend-million-views",
    title: "ショート動画100万再生",
    emoji: "📈",
    date: "2026-03-23",
    range: ["2026-03-11", "2026-03-24"],
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
      // 元は p1-bliAqLJo。消えて戻らないので、**同じ晩の同じ配信の別の枠**に差し替えた
      // （5本に切れていて、うち4本が消えている。2u4HfAvQdsI だけ残っている）
      { date: "2026-05-19", videoId: "2u4HfAvQdsI", title: "友達ともめるショート動画が100万再生越えたよーん！" },
    ],
  },
  {
    slug: "roulette-georgia",
    legend: true,
    icon: "legend-roulette-georgia",
    title: "ルーレットで行くジョージアぶらり旅",
    emoji: "🎡",
    date: "2026-07-19",
    range: ["2026-07-19", "2026-07-20"],
    lead: "行き先をルーレットで決めて、出たところに行く新企画。偶然に身をまかせる旅。",
    figure: { n: "運まかせ", cap: "行き先の決め方" },
    body: ["視聴者さんと一緒に回して、出た目の場所に向かう。企画会議で生まれて、その週のうちに実行された。"],
    streams: [{ date: "2026-07-19", videoId: "8FwBXXD97Ik", title: "新企画！ルーレットで行く！ジョージアぶらり旅" }],
  },
  {
    slug: "kazbegi",
    legend: true,
    icon: "legend-kazbegi",
    title: "カズベキ遠征",
    emoji: "⛰️",
    date: "2026-08-02",
    span: "2026/8/2 – 8/16",
    range: ["2026-08-02", "2026-08-23"],
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
    legend: true,
    icon: "legend-iwashi-festival",
    title: "ジョージアイワシ祭り",
    emoji: "🐟",
    date: "2026-07-22",
    span: "2026/7/22 – 7/24（3日間）",
    range: ["2026-07-21", "2026-07-24"],
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
    legend: true,
    icon: "legend-thousand-subs",
    title: "チャンネル登録1,000人",
    emoji: "🎊",
    date: "2025-12-16",
    range: ["2025-12-15", "2025-12-16"],
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
  {
    slug: "nordic",
    legend: true,
    /* **旅と1対1。** 北欧周遊（`content/chapters.ts` の `nordic`）。伝説はこの旅の島に建つ。

       **企画の期間（`range`）は、旅より1日ひろい。** 旅は 09-12 から（コーカサス周遊が
       クタイシを発った 09-11 で閉じているので、その翌日）。企画は出発した晩（09-11、
       ジョージア時間 23:30 の便）から——その晩の3本は旅の外だが、この企画の配信
       （`legendDays.ts` が数える）。終わりはどちらも、ストックホルムを発った 09-27
       （あやと 2026-09-06「ストックホルム出るまでが北欧旅です」）。
       前は島に建つかどうかを `date` が章の期間に入るかで決めていたので、ここを 09-12 にずらしてあった。
       いまは `trip` で建つので、企画の日は出発の日のまま。 */
    trip: "nordic",
    icon: "legend-nordic",
    title: "北欧ヒッチハイク",
    emoji: "🚗",
    date: "2026-09-11",
    /* **km を入れない。** 丘のマス（`/legends` の札）は幅が狭く、
       「（16日間・1,377km）」だと日付が2行に折れて、そこだけ重く見える。
       距離は下の `facts` に在る。 */
    span: "2026/9/12 – 9/27（16日間）",
    /* **字で書く**（名前で書かない）。期間は島の道具が字で読む（`python/build_legend_days.py`
       が `legendDays.ts` を焼く。名前で書くと、読めるのが頭の日1つになって北欧の期間が消える） */
    range: ["2026-09-11", "2026-09-27"],
    /* 会いに行った相手の**名前も素性も出さない**（`content/nordic.ts` の FRIEND、
       GitHub #106）。その人はこの企画に応募していない。 */
    lead: "2023年に東京で出会って、それきり会えていなかった親友に会いに、スウェーデンまで。スウェーデン行きの飛行機は高かったので、安かったポーランドまで飛んで、そこから先は停まってくれた車に乗せてもらって北へ上がった。",
    /* 数字は3つとも旅の記録から数える（上の `Counted`。数えるのは `content/legends.ts`）。 */
    figure: { count: "nordic-rides", unit: "台", cap: "乗せてくれた車" },
    facts: [
      { count: "nordic-km", unit: "km", cap: "人の車で進んだ" },
      { count: "nordic-countries", unit: "カ国", cap: "ポーランドからスウェーデンまで" },
    ],
    body: [
      "9月11日の夜にクタイシを発って、ポーランドのカトヴィツェへ。そこからワルシャワ、ビャウィストク、ヴィリニュス、リガ、タリン。道ばたで手を挙げて、停まってくれた車を乗り継いで、7日でバルト海の北の端まで上がった。",
      "タリンからヘルシンキ、ヘルシンキからストックホルムは船。夜行船の出港40分前に、カバンをゲーム屋へ置いてきたことに気づいて、走って取りに戻って駆け込んだ。",
      "9月20日にストックホルム着。そこから7泊して、スカンセンと湖と市庁舎を回って、9月27日に北欧を出た。",
    ],
    streams: [
      { date: "2026-09-11", videoId: "kyzCpe5Znyk", title: "【出発】海外二周年、ジョージアにバイバイ" },
      { date: "2026-09-12", videoId: "hrXYXcu9IDE", title: "【1日目】ワルシャワまで" },
      { date: "2026-09-14", videoId: "ZuzHKyDfocw", title: "【3日目】リトアニアまで" },
      { date: "2026-09-18", videoId: "kunXt2sXnFQ", title: "【7日目】エストニア・タリンまで" },
      { date: "2026-09-20", videoId: "GBYHxJQGlCY", title: "【到着】ストックホルム" },
      { date: "2026-09-22", videoId: "zNpq6Z-uN3Y", title: "北欧旅の振り返り" },
      { date: "2026-09-27", videoId: "IQvqpxcbf0c", title: "バイバイスウェーデン、バイバイ北欧旅" },
    ],
    pages: [
      {
        of: "guide",
        title: "旅のしおり",
        note: "島のみんなが教えてくれたことを、行く前に読むところと歩きながら引くところに分けて1枚に。",
      },
      {
        of: "trip",
        title: "北欧ヒッチハイク",
        note: "16日の旅程。どの街で誰に乗せてもらったかが日ごとに残っている。",
      },
    ],
  },
];

/** 伝説の印が付いているか */
export const isLegend = (p: Project): p is LegendProject => p.legend === true;

export const projectBySlug = (slug: string): Project | undefined => PROJECTS.find((p) => p.slug === slug);

/**
 * slug から企画を引く。**無い slug は投げる**（M-15。名前の鍵の指す先が在る）。
 * 面が企画を名指しする所（あやとのこと の年表・丘の館の札）は、ここを通す。
 */
export function projectOf(slug: string): Project {
  const p = projectBySlug(slug);
  if (!p) {
    throw new Error(
      `content/projects.ts に企画 "${slug}" がありません。いまの企画: ${PROJECTS.map((x) => x.slug).join(", ")}`,
    );
  }
  return p;
}

/** 歩いて行った企画の道のり。持っていない企画は投げる（面が数を黙って落とさないように） */
export function courseOf(slug: string): Course {
  const p = projectOf(slug);
  if (!isLegend(p) || !p.course) throw new Error(`企画 "${slug}" は道のり（course）を持っていません`);
  return p.course;
}

/** その旅が指されている企画（旅と1対1。M-16）。無ければ `undefined` */
export const projectOfTrip = (trip: string): Project | undefined => PROJECTS.find((p) => p.trip === trip);
