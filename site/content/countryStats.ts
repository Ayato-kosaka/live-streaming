/**
 * 国ごとの、その国での数。**手で直さない。**
 * `python/build_country_stats.py` が BigQuery から焼く。
 *
 * `content/cityStreams.ts` は街ごとの**代表**なので、本数を数える台には使えない
 * （ジョージアが 6本と出ていた。実物は 378本）。数えるならこちら。
 *
 * `top` の題名は YouTube のもの。引用なので書き換えない。
 */

/** [配信日(UTC), videoId, 題名, その配信で書いた人の数] */
export type CountryTop = [string, string, string, number];

export type CountryStat = {
  /** その国から出した配信の本数 */
  lives: number;
  /** その国にいたあいだに来ていた人。のべではない */
  people: number;
  /** その国で飛んだコメント */
  msgs: number;
  /** 配信のあった日 */
  days: number;
  /** その国でいちばん人が集まった配信 */
  top: CountryTop;
};

const COUNTRY_STATS: Record<string, CountryStat> = {
  "armenia": { lives: 35, people: 777, msgs: 11435, days: 28, top: ["2026-05-06", "8A-2mqkoAYs", "【8日目】怖いイメージを変えたいので 一緒にご飯食べにイランまで歩く。 8日目 Tatev 29キロ", 211] },
  "austria": { lives: 6, people: 16, msgs: 113, days: 6, top: ["2024-11-30", "A-5gn9cQM34", "日本は深夜やけど、オーストリアは良い時間なので靴磨きします", 6] },
  "azerbaijan": { lives: 19, people: 27, msgs: 2183, days: 18, top: ["2025-07-04", "I-9ORIGJG-w", "なにこれの新バージョンの紹介します。スーパー行きました。", 9] },
  "belgium": { lives: 12, people: 46, msgs: 1816, days: 10, top: ["2025-03-22", "_Crl6Z-HlBA", "後編【神回】ベルギーのワッフルはここから始まった！？リエージュで本物の味に出会う旅🧇", 16] },
  "cyprus": { lives: 13, people: 53, msgs: 4000, days: 13, top: ["2025-05-24", "GEthwfE5_vU", "【神回】キプロス・パフォス街歩き！古代遺跡から地中海サンセットまで🌅パフォスの名所ぜんぶ詰め込んで歩いてみた", 17] },
  "czech": { lives: 5, people: 19, msgs: 158, days: 5, top: ["2024-12-09", "QzkTER4Tml4", "チェコ最終日なので、質問コーナーします", 7] },
  "egypt": { lives: 36, people: 67, msgs: 9298, days: 26, top: ["2025-05-04", "cK0tttTZ3as", "GWエジプト祭り2日目 - ルクソール東側 神殿巡りとラクダ飯", 15] },
  "france": { lives: 18, people: 65, msgs: 2019, days: 16, top: ["2025-03-13", "2fdbFpZgWVs", "ひとり旅が再び始まりました。パリを少し歩きます。", 12] },
  "georgia": { lives: 378, people: 1242, msgs: 63815, days: 360, top: ["2025-12-23", "xud2lfBsF48", "電波良し、気分良し、活気よし", 63] },
  "germany": { lives: 12, people: 48, msgs: 1552, days: 10, top: ["2025-03-28", "W5Q-wKTzflY", "前編【神回】ドイツのケルン街歩き！チョコ博物館から始めたら、ケルン大聖堂が想像の3倍デカかった件！ライブも見れて1日が濃すぎた…", 17] },
  "hungary": { lives: 4, people: 6, msgs: 34, days: 4, top: ["2024-11-21", "p-3tglZzEiw", "【ヨーロッパ週3ひとり旅】 ハンガリー最高だぜ", 3] },
  "iran-border": { lives: 9, people: 513, msgs: 4779, days: 7, top: ["2026-05-06", "8A-2mqkoAYs", "【8日目】怖いイメージを変えたいので 一緒にご飯食べにイランまで歩く。 8日目 Tatev 29キロ", 211] },
  "jordan": { lives: 36, people: 49, msgs: 5948, days: 28, top: ["2025-05-31", "Jk8jWqh1iQU", "【神回】ペトラ遺跡で限界街歩き！ペトラでシークを抜け、秘境モナストリー、ペトラ飯、夕日まで全部盛り！！", 14] },
  "slovakia": { lives: 1, people: 3, msgs: 23, days: 1, top: ["2024-12-02", "SkOXq_X94zg", "スロバキアに行くので、チャンネル登録してください", 3] },
  "turkey": { lives: 15, people: 68, msgs: 5438, days: 14, top: ["2025-04-11", "UULcHjBHSJM", "【神回】トルコ🇹🇷イスタンブールでアジア側にいってみた", 25] },
  "uae": { lives: 2, people: 12, msgs: 743, days: 2, top: ["2025-06-27", "UbbfjRJ6KTM", "【神回】🇦🇪アブダビ街歩き！白モスク→ローカル飯→夕暮れビーチまで🌇", 10] },
  "uk": { lives: 50, people: 120, msgs: 17480, days: 44, top: ["2025-02-01", "nKTakrtzWM8", "イギリスの古都チェスターを歩く！城壁に囲まれた、黒白の美しい街並み、絶景リバーサイド散歩！", 25] },};

export const countryStat = (slug: string): CountryStat | undefined => COUNTRY_STATS[slug];
