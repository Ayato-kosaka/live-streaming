/**
 * これまでに歩いた国。BigQuery(youtube_chat.videos)の配信タイトルから復元している。
 * 日付は JST の配信日。`videoId` はその話が出てくる配信。
 *
 * **いつどこに居たか（滞在）は、ここに書かない。** 滞在の表（`content/stays.ts`）が持ち主で、
 * `COUNTRIES[].stays` と `AHEAD_COUNTRIES` はそこから引く（#1275）。ここが持つのは国の記録だけ
 * （名前・旗・地方・何カ国目・紹介・見どころ）。
 */
import { STAYS } from "./stays";

export type Highlight = { title: string; note: string; date?: string; videoId?: string };

export type Country = {
  slug: string;
  name: string;
  en: string;
  flag: string;
  region: "ヨーロッパ" | "中東・アフリカ" | "コーカサス";
  order: number;
  /** その国の滞在。**`content/stays.ts` から引く**（ここに書かない） */
  stays: { from: string; to: string; cities: string[] }[];
  summary: string;
  highlights: Highlight[];
};

/** 国の記録。滞在は持たない（`COUNTRIES` が滞在の表から足す） */
type CountryRecord = Omit<Country, "stays">;

const COUNTRY_RECORDS: CountryRecord[] = [
  {
    slug: "france",
    name: "フランス",
    en: "France",
    flag: "🇫🇷",
    region: "ヨーロッパ",
    order: 1,
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
    /* **いつ読んでも合う字にする。** 「いまもここにいる。」と書いてあったので、
       北欧へ出発した日から、この国の面も「いまどこ」の面も嘘になった。
       ここは焼き込みで、旅の17日間あやたは書き替えられない。
       この国であったことだけを書けば、出る前・最中・帰ったあとのどれで読んでも合う
       （`content/chapters.ts` のアルバニアの note と同じ決まり）。 */
    summary:
      "どの国より長く腰を据えた国。チーズパンと山と教会と黒海。ここで自作アプリ「なに食べよ」をリリースし、クッキング配信が定着し、常連さんが増えた。",
    highlights: [
      { title: "ジョージア着いたけど最高すぎた", note: "350本目", date: "2025-07-19", videoId: "YP9D8CihaXg" },
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
    summary:
      "「わけあるめーにぁ」の国。ここからGW企画でイラン国境まで12日間歩いた。帰りはヒッチハイクでエレバンに戻ってきた。",
    highlights: [
      { title: "アルメニアでございます", note: "ジョージアからバスで入国", date: "2026-04-19", videoId: "jTpvux9mM44" },
      { title: "セヴァン湖までセヴァンマスを食べに", note: "13時から6時間", date: "2026-05-20", videoId: "haHAczqMooM" },
      { title: "ジェノサイドミュージアムまで歩く", note: "歩いて向かった日", date: "2026-05-17", videoId: "2y4IbYu-ZeI" },
      // 元は p1-bliAqLJo。消えて戻らないので、**同じ晩の同じ配信の別の枠**に差し替えた
      // （5本に切れていて、うち4本が消えている。2u4HfAvQdsI だけ残っている）
      { title: "友達ともめるショートが100万再生", note: "エレバンで報告", date: "2026-05-19", videoId: "2u4HfAvQdsI" },
    ],
  },
  {
    slug: "iran-border",
    name: "イラン（国境まで）",
    en: "Iran border",
    flag: "🇮🇷",
    region: "コーカサス",
    order: 18,
    summary:
      "「怖いイメージを変えたいので、一緒にご飯を食べにイランまで歩く」というGW企画。アルタシャトから10日間、約380kmを歩いて国境にたどり着いた。",
    highlights: [
      { title: "1日目 アルタシャト 23キロ", note: "12時スタート", date: "2026-04-29", videoId: "M11XX1oeng8" },
      { title: "8日目 タテフ 29キロ", note: "山の中をひたすら", date: "2026-05-06", videoId: "8A-2mqkoAYs" },
      { title: "最終日 メグリ 70キロ", note: "ゴール1時間前の配信もある", date: "2026-05-08", videoId: "TFiFG8lrcpA" },
      { title: "帰路ヒッチハイク①", note: "12日目、ヒッチハイクでエレバンに帰る", date: "2026-05-10", videoId: "rHUoWeMPa1o" },
    ],
  },
  /* ここから下の6カ国は北欧周遊（2026-09-12 〜 09-27）。
     **`region` は6つとも「ヨーロッパ」。** 「北欧」を足すこともできるが、
     `region` は `/map` の年表を地図の寄せボタン（`route.json` の `chapters`）に
     結ぶ鍵で（`app/travel/page.tsx` の `CHAPTER_OF`）、あちらに無い名前を作ると
     **どの段にも入らず、6カ国が年表から黙って消える。**
     地方の名前としてもバルト三国からスウェーデンまでヨーロッパで間違いではない。 */
  {
    slug: "poland",
    name: "ポーランド",
    en: "Poland",
    flag: "🇵🇱",
    region: "ヨーロッパ",
    order: 19,
    summary:
      "ヒッチハイクの旅が始まった国。夜の便でカトヴィツェに降りて、そこから先はぜんぶ人の車。1台目はロータリーをぐるぐる回り、野宿を覚悟したところでカメラマンが停まってくれた。",
    highlights: [
      {
        title: "1日目 ワルシャワまで",
        note: "2台目に降ろされたのは30キロ逆戻りした街。スモーキーチーズをもらい、スープをもらい、最後に夕日を見た",
        date: "2026-09-12",
        videoId: "hrXYXcu9IDE",
      },
      {
        title: "2日目 ビャウィストクまで",
        note: "200キロ出す車と、ロシアの紳士。着いた街では祭りをやっていた。また来たい街だった",
        date: "2026-09-13",
        videoId: "f3W2JxAHsQs",
      },
    ],
  },
  {
    slug: "lithuania",
    name: "リトアニア",
    en: "Lithuania",
    flag: "🇱🇹",
    region: "ヨーロッパ",
    order: 20,
    summary:
      "旧市街ごと世界遺産の街で、初めて動かない日を取った国。着いた晩はギラ（ビールのようでコーラのような飲みもの）で乾杯した。",
    highlights: [
      {
        title: "3日目 リトアニアまで",
        note: "1時間20分1台も停まらず、車に直接声をかけに行った。乗せてくれたおじさんには、降りぎわに金を要求された",
        date: "2026-09-14",
        videoId: "ZuzHKyDfocw",
      },
      {
        title: "4日目 ヴィリニュス観光日",
        note: "高いところから赤い屋根を見下ろした。シャコティスは木の枝のようにとげとげしていた",
        date: "2026-09-15",
        videoId: "wB9ntPJ5_h8",
      },
    ],
  },
  {
    slug: "latvia",
    name: "ラトビア",
    en: "Latvia",
    flag: "🇱🇻",
    region: "ヨーロッパ",
    order: 21,
    summary:
      "1日に6台乗り継いだ国。1本目がいきなり目的地まで行くと言うので、ぬるすぎるとあえて途中で降りた。城を2つ見て、暗くなってからリガに入った。",
    highlights: [
      {
        title: "5日目 リガまで",
        note: "湖のほとりの城、川の向こうの城。5本目で進めたのは20キロだけで、6本目の夫婦がリガまで乗せてくれた",
        date: "2026-09-16",
        videoId: "7puIEFev1a4",
      },
      {
        title: "6日目 リガ観光日",
        note: "一度は入れなかった建物に、おばちゃんに笑われながら通してもらえた。アール・ヌーヴォーの通りまで歩いた",
        date: "2026-09-17",
        videoId: "k4DxGQlkD6U",
      },
    ],
  },
  {
    slug: "estonia",
    name: "エストニア",
    en: "Estonia",
    flag: "🇪🇪",
    region: "ヨーロッパ",
    order: 22,
    summary:
      "この旅で最後の1台が降ろしてくれた国。リガを出る朝にシムが壊れ、バスに乗り遅れ、それでも掲げた札に10分で車が止まった。",
    highlights: [
      {
        title: "7日目 タリンまで",
        note: "乗せてくれたのは最後まで喋らなかったおじさん。検問を越えて13時半に街へ降りた。ヒッチハイクはここで終わった",
        date: "2026-09-18",
        videoId: "kunXt2sXnFQ",
      },
    ],
  },
  {
    slug: "finland",
    name: "フィンランド",
    en: "Finland",
    flag: "🇫🇮",
    region: "ヨーロッパ",
    order: 23,
    summary:
      "船で入って、船で出た国。朝10時に着いて、その日の夕方にはもう次の船に乗っていた。前日のどしゃ降りで死んだ充電まわりを、街で買い直した。",
    highlights: [
      {
        title: "8日目 ヘルシンキまで",
        note: "4時半にタリンで配信を始めて6時に出港。大聖堂は結婚式で貸切だった",
        date: "2026-09-19",
        videoId: "VwUgzKblYyM",
      },
      {
        title: "出港40分前に走って戻る",
        note: "ムーミンカフェの家の形のタピオカ、ルーレットで決めた土産の紅茶。カバンをゲーム屋に置いてきた",
        date: "2026-09-19",
        videoId: "WuA1ZykNUWk",
      },
    ],
  },
  {
    slug: "sweden",
    name: "スウェーデン",
    en: "Sweden",
    flag: "🇸🇪",
    region: "ヨーロッパ",
    order: 24,
    /* **出国の日を空けたままにしない。** 空欄は「まだ、いる」と読まれる。
       焼き込みの側はもっと直接で、`python/build_on_this_day.py` と
       `python/build_country_stats.py` は空欄を `9999-12-31` と読む。つまり
       **開いた滞在が、以後の配信をぜんぶ飲み込む。** 2026-09-28 からの
       アルバニアの配信11本が「スウェーデン・ストックホルム」として焼かれていて、
       `/map/sweden` の街の札に「ストックホルム 18本の配信」と出て、その中に
       「アルバニアつきましたー」が並んでいた。
       2026-09-27 はストックホルムを発った日で、`content/chapters.ts` の北欧の `to`
       と同じ日（あやと 2026-09-06「ストックホルム出るまでが北欧旅です」）。
       ジョージアの最後の滞在と同じ決まりで、**人が手で書き入れるのを待たない**
       ——旅のあいだ、あやとは画面を直せない（`docs/island-misses.md` #24）。 */
    /* **「いまここにいる」と書かない。** 出国したあと読んでも合う字だけを置く
       （ジョージアの summary と同じ決まり）。 */
    summary:
      "会いに行くと決めた街。ポーランドから9日、ぜんぶ人の車と船でつないで降り立った。2023年の夏に出会って3ヶ月で帰ってしまった親友と、その家で再会した。",
    highlights: [
      {
        title: "到着日 ストックホルム",
        note: "朝10時のフェリー。細い道をもったいぶって見せたら「ただの細い道」と言われた。配信を終えてから親友に会った",
        date: "2026-09-20",
        videoId: "GBYHxJQGlCY",
      },
      {
        title: "ストックホルム散策",
        note: "ヒッチハイクの終わった街を、ただ歩く配信",
        date: "2026-09-21",
        videoId: "nGgoJ753rBw",
      },
    ],
  },
  /* ここから下の3カ国はバルカン諸国周遊（`content/chapters.ts` の `balkans`。2026-09-28 から）。
     歩き終わったので `AHEAD_COUNTRIES` から移した（2026-11-22、#664）。**`region` は北欧と同じ
     「ヨーロッパ」**——`/travel` の年表の段と地図の寄せボタンを結ぶ鍵なので、新しい名前を作らない
     （北欧の6カ国の注）。滞在の日と街の決めかたは `content/stays.ts` のバルカンの行の注。 */
  {
    slug: "albania",
    name: "アルバニア",
    en: "Albania",
    flag: "🇦🇱",
    region: "ヨーロッパ",
    order: 25,
    summary:
      "北欧から飛んで、首都ティラナに2週間とどまった国。史上最悪のホステルで始まり、スマホを盗まれて取り返し、髭剃りを盗まれて市場で買い直した。それでも出る朝には、変な人が多いけど憎めない国だと言っていた。",
    highlights: [
      {
        title: "着いた朝 ティラナ",
        note: "宿代を浮かせようと空港の床で寝たが、寒くて眠れなかった。現金だけのカフェで、店主がカードリーダーを出してきてくれた",
        date: "2026-09-28",
        videoId: "HjSLfg57t7E",
      },
      {
        title: "史上最悪のホステル",
        note: "屋外のベッドで受付のおじさんが寝ている宿。一度は2週間で出ると決めた",
        date: "2026-09-28",
        videoId: "zjHZucyfrq8",
      },
      {
        title: "首都の建築を歩く",
        note: "視聴者さんのデートプランのとおりに歩いて、最後は大階段の上で雲ひとつない夕日",
        date: "2026-10-03",
        videoId: "hK0SwIeAxg0",
      },
      {
        title: "スマホが盗まれた",
        note: "ホステルの屋上で盗まれたスマホを、宿の仲間と取り返した。締めは1味200円のジェラート",
        date: "2026-10-05",
        videoId: "XKpFeM0mQ2I",
      },
      {
        title: "暗殺者のパスタ",
        note: "火力の弱いIHで、みんなの指示を聞きながら1時間。「今まで食べたトマトパスタの中で一番うまい」",
        date: "2026-10-06",
        videoId: "GRd0d7d7Ngg",
      },
      {
        title: "最終日 髭剃り探し",
        note: "盗まれた髭剃りの代わりを、雨の市場で。龍の柄の1本を、現金のみ・カード不調・ATM騒ぎを越えて2時間がかりで買った",
        date: "2026-10-11",
        videoId: "2ij1R53ifcU",
      },
    ],
  },
  {
    slug: "north-macedonia",
    name: "北マケドニア",
    en: "North Macedonia",
    flag: "🇲🇰",
    region: "ヨーロッパ",
    order: 26,
    /* 着いたのは 2026-10-12（配信「北マケドニア共和国ついたでーーー」。アルバニアからバスで7時間）。
       出たのは 11-12 の朝7時のバスで、その日はブルガリアの1日 */
    summary:
      "アルバニアからバスで7時間、首都スコピエに1か月とどまった国。銅像だらけの街を歩き、宿のキッチンでパンを焼きつづけ、ここで貯金箱が満タンになってバルカン半島を回ると決まった。日本から送ったパソコンは、最後まで受け取れなかった。",
    highlights: [
      {
        title: "着いた晩 スコピエ",
        note: "本命の宿は満室で、旧市街を抜けて仮押さえの宿へ。キッチンと屋上と鍵つきの、当たりの宿だった",
        date: "2026-10-12",
        videoId: "NY9pzYrA-5o",
      },
      {
        title: "今まで見た夕日の中で一番",
        note: "本配信を終えたら空が真っ赤に焼けていて、6分だけの緊急配信",
        date: "2026-10-16",
        videoId: "WJ8KEi1V-no",
      },
      {
        title: "貯金箱が満タンになった日",
        note: "開始9分で5万770円。バルカン半島を回ることが、ここで決まった。フォカッチャは発酵せず、揚げ焼きで着地",
        date: "2026-10-22",
        videoId: "VusdZVyjgjQ",
      },
      {
        title: "ホステルを追い出された",
        note: "宿が突然閉まり、30分で退去。荷物を2kg捨てて、歩いて30分の新しい宿へ",
        date: "2026-10-23",
        videoId: "vZ2O8pabk1g",
      },
      {
        title: "マトカ渓谷",
        note: "紅葉の渓谷を歩きすぎて、川下りは日没で乗れなかった。帰りのバスも終わっていて、通りがかりの車が街まで乗せてくれた",
        date: "2026-10-24",
        videoId: "eHBAnQF56-E",
      },
      {
        title: "最終日",
        note: "日本から送ったパソコンは通関で止まったまま、日本へ送り返された。翌朝7時のバスでブルガリアへ",
        date: "2026-11-11",
        videoId: "9S3zuyByWgo",
      },
    ],
  },
  {
    slug: "bulgaria",
    name: "ブルガリア",
    en: "Bulgaria",
    flag: "🇧🇬",
    region: "ヨーロッパ",
    order: 27,
    /* 着いたのは 2026-11-12。**本人の知らせを待たずに、配信から読んだ日**——11-12 14:35 JST の
       「ブルガリアいきます」はスコピエのバス停から始まり、同じ日の 20:29 JST（ソフィア 13:29）に
       「ブルガリアついたんやけど」が始まる。日本の暦でも現地の暦でも 11-12。
       出たのは 11-21（ソフィアからバス。配信「ブルガリア出国します」。その日はルーマニアの1日。
       ルーマニアの `entered` の注） */
    summary:
      "スコピエから乗客2人のミニバスで入って、首都ソフィアを歩いた国。飲むヨーグルトとバニツァを試し、街の下に湧く温泉の水を飲んでもだえた。開いた日に行ったクリスマスマーケットへ、最後の日にもう一度行った。",
    highlights: [
      {
        title: "スコピエからソフィアへ",
        note: "大型バスのつもりがミニバスで、乗客は2人だけ。いちばん後ろの席を独り占めした",
        date: "2026-11-12",
        videoId: "4izd3enURM8",
      },
      {
        title: "飲むヨーグルト",
        note: "女性市場の乳製品の店で買ったいちご味のアイランを、公園で。まずいと思っていたら、日本の飲むヨーグルトに近かった",
        date: "2026-11-13",
        videoId: "jnKVIXn4qQs",
      },
      {
        title: "クリスマスマーケットの初日",
        note: "5度まで冷えた日。袖なしダウンを買い、ボザを初めて飲み、山盛りのワッフルバブルで満腹",
        date: "2026-11-14",
        videoId: "zDHHuafmP1A",
      },
      {
        title: "バニツァ",
        note: "チーズパイのバニツァは約638円。物価の高さに驚きながら、おいしかった",
        date: "2026-11-15",
        videoId: "hJ6vFAGX3rI",
      },
      {
        title: "温泉の水を飲む",
        note: "街の下に湧く温泉の蛇口を触って飲み、極まずの味にもだえた。入れる温泉ではなかった",
        date: "2026-11-16",
        videoId: "2EKBYEnv850",
      },
      {
        title: "金色のドームの大聖堂",
        note: "アレクサンドル・ネフスキー大聖堂の中を見て、女性市場の食堂で念願のムサカ",
        date: "2026-11-17",
        videoId: "aGOz5otlEs8",
      },
    ],
  },
];

/**
 * 歩いた国と、その滞在。**滞在は `content/stays.ts` の行から引く**（着いた順）。
 *
 * 表どうしが食い違ったら、ここで書き出しを止める——黙って通すと、国の面の「いつ居たか」が
 * 空になるか、同じ国が「歩いた国」と「いま歩いている国」の両方に数えられる:
 *
 * - 記録のある国に、滞在の行が1つも無い
 * - 滞在の行の国に、記録も `name` も無い（どこからも名前が引けない）
 * - 記録のある国の行が `name` を持つ（名前の持ち主は記録。書き写さない）
 */
export const COUNTRIES: Country[] = COUNTRY_RECORDS.map((c) => {
  const stays = STAYS.filter((s) => s.country === c.slug)
    .sort((a, b) => a.from.localeCompare(b.from))
    .map((s) => ({ from: s.from, to: s.to, cities: s.cities }));
  if (!stays.length) throw new Error(`content/countries.ts: ${c.slug} に滞在の行が無い（content/stays.ts）`);
  // 欄の並びは前と同じ（`stays` は `order` のあと）。書き出しの中の並びを動かさないため
  const { summary, highlights, ...head } = c;
  return { ...head, stays, summary, highlights };
});

/** 滞在の表の行が、国の記録と食い違っていないか（上の3つと、日付が読めるか）。読み込んだときに1度 */
function checkStays(): void {
  const known = new Set(COUNTRY_RECORDS.map((c) => c.slug));
  /* 着いた日が読めない行は、どの面でも数えられない（国に入ったことにならない）。
     黙って落とさずに止める——前は `python/upkeep_watch.py` の引き金「案内している国」が拾っていた形 */
  const day = (d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(Date.parse(`${d}T00:00:00Z`));
  for (const s of STAYS) {
    if (!day(s.from) || (s.to && !day(s.to)))
      throw new Error(`content/stays.ts: ${s.country} の日付が読めない（from: "${s.from}" / to: "${s.to}"）`);
    if (known.has(s.country) && s.name)
      throw new Error(`content/stays.ts: ${s.country} は国の記録があるので name を書かない（記録の名前を引く）`);
    if (!known.has(s.country) && !s.name)
      throw new Error(`content/stays.ts: ${s.country} は国の記録が無いので name が要る`);
  }
}
checkStays();

/**
 * 配信を始めるまえに通った国。
 *
 * **`COUNTRIES` は配信タイトルから復元した一覧なので、配信のない6週間がまるごと抜けている。**
 * 日本を出たのは 2024年9月11日、パリで配信を始めたのは 10月28日。そのあいだに
 * イギリス・バルセロナ・ローマを2週間ずつ回っている（本人の話）。
 *
 * 日付は本人から届いた（2026-09-06、GitHub #121）。**「2週間ずつ」は本人の記憶で、
 * 実際は 16日・12日・12日・15日だった。** 概算を書いておくと、あとから本物が来ても
 * 「だいたい合っている」で流してしまう。届いた日付をそのまま持つ。
 *
 * **パリだけ性格が違う。** 10月22日に着いて、その滞在の途中の10月28日に配信が始まった。
 * つまりこの4つ目は「配信のまえ」に収まりきらない。`streamBegan` で印を付けて、
 * 画面のほうで断る。ここで滞在を10月28日に切ると、本人の言った15日が消える。
 *
 * **スペインとイタリアは `COUNTRIES` に入れない。** 理由は「番号を振り直すことに
 * なるから」ではない（前はそう書いてあったが、数え直したら違った）。
 * `COUNTRIES` の `order` は**配信中に歩いた順**で、フランスが1、イギリスが9。
 * イギリスの `stays` は 2025-01-03 → 2025-03-03 の**配信中の訪問**で、
 * ここに書いてある 2024-09 のロンドンとは別物。スペインとイタリアは
 * **配信中の訪問が1度も無い**ので、振る番号そのものが無い。入れれば嘘になるし、
 * 入れなければ既存18カ国の番号は1つも動かない。
 *
 * **地図には出る**（2026-09-21、GitHub #450 の一部）。世界地図の焼き込みでは
 * `ROUTE` とは別の層（`route.json` の `before`）にして、塗りも縁も名札も
 * 番号付きの国と変えてある（`python/build_world_route.py` の `BEFORE`）。
 *
 * **面は作らないまま、中身だけ入れた**（2026-09-05、GitHub #122）。この6週間には
 * ショート動画が15本ある（`content/shorts.ts` の `before-stream`）ので、
 * `/map` のこの段に並べてある。`/map/<国>` はチャットの集計を出す面なので、
 * 配信が1本も無いこの6週間で面を作っても、本数0・人数0・コメント0になる。
 */
export const BEFORE_STREAM: {
  slug: string;
  name: string;
  city?: string;
  /** 着いた日 */
  from: string;
  /** 発った日 */
  to: string;
  /** 何日いたか。本人の数えかたをそのまま持つ（日付の引き算で出し直さない） */
  days: number;
  /** この滞在の途中で配信が始まったか */
  streamBegan?: boolean;
}[] = [
  { slug: "uk", name: "イギリス", city: "ロンドン", from: "2024-09-12", to: "2024-09-28", days: 16 },
  { slug: "spain", name: "スペイン", city: "バルセロナ", from: "2024-09-28", to: "2024-10-10", days: 12 },
  { slug: "italy", name: "イタリア", city: "ローマ", from: "2024-10-10", to: "2024-10-22", days: 12 },
  { slug: "france", name: "フランス", city: "パリ", from: "2024-10-22", to: "2024-11-06", days: 15, streamBegan: true },
];

/** 日本を出てから、配信が始まるまでの日数。パリに着いてから6日目に始まっている */
export const BEFORE_STREAM_DAYS = 47;

export const countryBySlug = (slug: string) => COUNTRIES.find((c) => c.slug === slug);

/**
 * 名前だけでよいときの引き。**歩き終わった国と、いま歩いている国の両方**から探す。
 *
 * `countryBySlug` は `COUNTRIES`（歩き終わった国）しか見ない。街と滞在と
 * 見どころが要る面はそれでよいが、**名前と旗しか要らない面**がそれを使うと、
 * いま歩いている国だけ名前が消える。
 *
 * 実際に出た（2026-10-14）: アルバニアで作った料理をスタンプ帳に入れた日、
 * 料理の面の「借りたキッチン」が**旗だけで名前が出ず**、スタンプ帳の
 * しぼり込みにも**アルバニアの札が出なかった**。見出しは
 * 「6カ国の宿のキッチンで作った」と数えているのに、押せるのは5カ国。
 * **数える側と、押せる側の出どころが違った。**
 *
 * `AHEAD_COUNTRIES` は `entered` しか持たないので、返すのは
 * `{ slug, name }` だけ。滞在や街が要る面は `countryBySlug` のままにする。
 */
export const countryNameBySlug = (slug: string): { slug: string; name: string } | undefined =>
  COUNTRIES.find((c) => c.slug === slug) ?? AHEAD_COUNTRIES.find((c) => c.slug === slug);

/**
 * これから歩く国。**国の記録（`COUNTRIES`）をまだ持たない国**の、名前と国旗を引く鍵と着いた日。
 * `content/stays.ts` の、`name` を持つ行から引く（ここに書かない）。
 *
 * `COUNTRIES` は「歩いた国」の一覧で、`/map` の国の数も、世界地図の焼き込み
 * （`build_world_route.py`）も、`order`（何カ国目）も、そこから数えている。
 * まだ歩いていない国を混ぜると、**歩く前から歩いたことになる。**
 * 歩き終わったら、記録を `COUNTRY_RECORDS` に足して、滞在の行から `name` を消す。
 *
 * 旅の途中に「ルーマニア・ブカレスト」と書かれた日に、旗を出すのもここ（`content/place.ts`）。
 *
 * **`entered` が先の日付の行も入る**（着く予定）。数える側（`content/walked.ts`）が今日で切る。
 *
 * **前の国の滞在を閉じるのは、つぎの国の `entered`。** 旅程ファイルの無い章は、
 * `python/stays.py` の `chapter_stays()` が、つぎの国が入った前日で前の国を閉じる。
 * だから**記録を足すときは、同じ章で歩き終わった国をまとめて足す。**
 * 1カ国だけ足すと、`read_all()` がその国の終わりを `after` にして、まだ記録の無い
 * それより前の国の滞在をまるごと落とす（2026-11-21 にブルガリアだけで試して、
 * アルバニアと北マケドニアの滞在が消えた）。
 */
export const AHEAD_COUNTRIES: { slug: string; name: string; entered: string }[] = STAYS.flatMap((s) =>
  s.name ? [{ slug: s.country, name: s.name, entered: s.from }] : [],
);

/**
 * 「歩いた国」に数えてよい slug か。**`iran-border` は国ではない。**
 *
 * 「イラン（国境まで）」は国境まで歩いた区間で、入国はしていない。
 * `python/stays.py` の `is_country` と**同じ決めかた**にしてある——
 * あちらが焼き込みの数（`COUNTRIES_WALKED`）を決め、こちらが画面の数を決めるので、
 * 片方だけ違う読み方をすると**同じ面の上と下で数が1つずれる。**
 * 実際にそうなっていた（表紙と `/now` が 20、`/map` の章の合計が 21）。
 */
export const isWalkedCountry = (slug: string) => !slug.endsWith("-border");
