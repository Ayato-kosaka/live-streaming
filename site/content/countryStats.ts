/**
 * 国ごとの、その国での数。**手で直さない。**
 * `python/build_country_stats.py` が BigQuery から焼く。
 *
 * 期間は `python/stays.py`——歩き終わった国は `content/countries.ts`、
 * いま歩いている旅は `content/nordic.ts` の旅程——から出している。
 * **だから旅の途中で入った国も、その晩から数に入る。**
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
  "armenia": { lives: 37, people: 779, msgs: 11663, days: 29, top: ["2026-05-06", "8A-2mqkoAYs", "【8日目】怖いイメージを変えたいので 一緒にご飯食べにイランまで歩く。 8日目 Tatev 29キロ", 211] },
  "austria": { lives: 7, people: 18, msgs: 136, days: 7, top: ["2024-11-30", "A-5gn9cQM34", "日本は深夜やけど、オーストリアは良い時間なので靴磨きします", 6] },
  "azerbaijan": { lives: 21, people: 27, msgs: 2223, days: 19, top: ["2025-07-04", "I-9ORIGJG-w", "なにこれの新バージョンの紹介します。スーパー行きました。", 9] },
  "belgium": { lives: 17, people: 50, msgs: 2147, days: 12, top: ["2025-03-22", "_Crl6Z-HlBA", "後編【神回】ベルギーのワッフルはここから始まった！？リエージュで本物の味に出会う旅🧇", 16] },
  "cyprus": { lives: 17, people: 61, msgs: 4547, days: 15, top: ["2025-05-24", "GEthwfE5_vU", "【神回】キプロス・パフォス街歩き！古代遺跡から地中海サンセットまで🌅パフォスの名所ぜんぶ詰め込んで歩いてみた", 17] },
  "czech": { lives: 6, people: 20, msgs: 204, days: 6, top: ["2024-12-09", "QzkTER4Tml4", "チェコ最終日なので、質問コーナーします", 7] },
  "egypt": { lives: 37, people: 69, msgs: 9366, days: 27, top: ["2025-05-04", "cK0tttTZ3as", "GWエジプト祭り2日目 - ルクソール東側 神殿巡りとラクダ飯", 15] },
  "france": { lives: 19, people: 68, msgs: 2128, days: 17, top: ["2025-03-13", "2fdbFpZgWVs", "ひとり旅が再び始まりました。パリを少し歩きます。", 12] },
  "georgia": { lives: 389, people: 1273, msgs: 67047, days: 368, top: ["2025-12-23", "xud2lfBsF48", "電波良し、気分良し、活気よし", 63] },
  "germany": { lives: 14, people: 51, msgs: 1758, days: 11, top: ["2025-03-28", "W5Q-wKTzflY", "前編【神回】ドイツのケルン街歩き！チョコ博物館から始めたら、ケルン大聖堂が想像の3倍デカかった件！ライブも見れて1日が濃すぎた…", 17] },
  "hungary": { lives: 5, people: 9, msgs: 52, days: 5, top: ["2024-11-24", "aencgvAwwn4", "ハンガリー最終日、別れはいつも突然に😢", 4] },
  "iran-border": { lives: 9, people: 513, msgs: 4779, days: 7, top: ["2026-05-06", "8A-2mqkoAYs", "【8日目】怖いイメージを変えたいので 一緒にご飯食べにイランまで歩く。 8日目 Tatev 29キロ", 211] },
  "jordan": { lives: 37, people: 49, msgs: 5987, days: 29, top: ["2025-05-31", "Jk8jWqh1iQU", "【神回】ペトラ遺跡で限界街歩き！ペトラでシークを抜け、秘境モナストリー、ペトラ飯、夕日まで全部盛り！！", 14] },
  "lithuania": { lives: 2, people: 56, msgs: 2243, days: 2, top: ["2026-09-14", "ZuzHKyDfocw", "【三日目】親友に会いにスウェーデンまでヒッチハイクします、リトアニアまで", 46] },
  "poland": { lives: 6, people: 57, msgs: 2624, days: 2, top: ["2026-09-12", "hrXYXcu9IDE", "【一日目】親友に会いにスウェーデンまで、ワルシャワまで", 44] },
  "slovakia": { lives: 2, people: 7, msgs: 52, days: 2, top: ["2024-12-03", "uylUHvF_1WM", "チェコに着いたので、魅力を探りませう", 5] },
  "turkey": { lives: 16, people: 69, msgs: 5469, days: 15, top: ["2025-04-11", "UULcHjBHSJM", "【神回】トルコ🇹🇷イスタンブールでアジア側にいってみた", 25] },
  "uae": { lives: 3, people: 12, msgs: 879, days: 3, top: ["2025-06-27", "UbbfjRJ6KTM", "【神回】🇦🇪アブダビ街歩き！白モスク→ローカル飯→夕暮れビーチまで🌇", 10] },
  "uk": { lives: 51, people: 120, msgs: 17821, days: 45, top: ["2025-02-01", "nKTakrtzWM8", "イギリスの古都チェスターを歩く！城壁に囲まれた、黒白の美しい街並み、絶景リバーサイド散歩！", 25] },};

export const countryStat = (slug: string): CountryStat | undefined => COUNTRY_STATS[slug];

/**
 * これまでに歩いた国の数。表紙の「◯カ国を歩いた」も住人のセリフもここを読む。
 *
 * **手で書かない。** 前は `content/site.ts` に `countries: 17` と手で書いてあって、
 * 2026-05-06 から4ヶ月動かなかった。ポーランドもリトアニアも歩いたあとに、
 * 表紙も住人も「17カ国」と言い続けた（`docs/island-misses.md` #102）。
 *
 * **`Object.keys(COUNTRY_STATS).length` ではない。** ここは数の付いた国の表で、
 * オランダの6日はチャットが1件も残っていないので載っていないし、リガに着いた日の
 * 配信はその晩まで取り込まれない。**数が無いことと、行っていないことは別。**
 * 数え方は `python/build_country_stats.py` の `walked()` にある。
 *
 * **数そのものを焼いてある。** 上の表を参照する形にすると、この数字を1つ
 * 読むだけの島の吹き出しに、表 4KB ぶんが丸ごと付いてくる。
 */
export const COUNTRIES_WALKED = 20;
