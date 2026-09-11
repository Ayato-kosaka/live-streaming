/** 直近90日で島に来てくれている仲間のうち、キャラクター登録済みの人。
 *  名前は出さない方針なので、アイコン/絵文字と「一緒にいた日数」だけを持つ。
 *
 *  **手で直さない。** `python/build_residents.py` が BigQuery から焼く。
 *  日ごとに数える。**チャットが取り込めていない日は、出席にも分母にも入れない**
 *  （読めていない日を「居た」ことにすると、1回来ただけの人が常連になる）。
 *
 *  **`days` は、島に出ている人を日替わりで選ぶ重みにもなっている**
 *  （`components/island/villagers.ts` の rosterOf）。よく来てくれている人ほど
 *  島にいる日が多い、という形にするため。
 *
 *  **画面に出る日数は、ここの値ではない（#91）。** `/friends` の図鑑は
 *  `/state` の `residentDays` を出す。あちらは毎晩 `islandChannels` に
 *  入り直すので、旅の途中でも古くならない。**ここの値は、それが読めなかった
 *  ときの受け皿**と、上の抽選の重み（書き出し時に1回決まる）。
 *  数え方が2つあるのは承知のうえ。ここは直近90日、あちらは全期間。
 *
 *  `channel` は YouTube のチャンネル id。**どの絵が誰のものかは、あやとが表で
 *  持っている割り当てだけが決める**（`python/residents_map.json`）。
 *  本人にログイン画面で選ばせない。他人の絵を自分のものにできてしまうため。
 */
export type Resident = { icon?: string; emoji?: string; days: number; channel?: string };

export const RESIDENTS: Resident[] = [
  { icon: "18okO58dwMaci-9R1go0Rj1dTqliSWlz3", emoji: "\ud83d\udc99", days: 82, channel: "UCNTxy7hXktoG4V6jT6A3M9A" },
  { icon: "1wQzpWPNZKnty7DIiEkrSyib145QIWy4K", emoji: "\ud83d\udc1f", days: 76, channel: "UCTXgxriwnTlJ0y1tff0yU5A" },
  { icon: "1oRv9hYOkvlbBvDepLcDWEd6CWm19BJkS", emoji: "\ud83d\udc15", days: 51, channel: "UCEw49OqT87MZEDQJVkjWNRA" },
  { icon: "1y17p0D56itwNXWWEzo94jF4ThNETczQg", emoji: "\ud83c\udf51", days: 44, channel: "UCJPDZ4SQYonw3vZvyxVKrjg" },
  { icon: "1XUYZEts8lz9SFqQmKuBd4G8KMRfBmPL-", emoji: "\ud83c\udf43", days: 44, channel: "UCfhX-rOzBe-QhWPPv03FtQA" },
  { icon: "1NLsB-D-jeUxQ3viqwhJu2GkRRXsYXAaQ", emoji: "\ud83e\udd94", days: 43, channel: "UCHdRx9BTg6q_SF5y-4Wg5WQ" },
  { icon: "1L3c-p3QtcO5HLqCPUtGisxI-_SpwEaZt", emoji: "\ud83d\udc3c", days: 38, channel: "UCceC2uQXoN9wt2POovos37Q" },
  { icon: "1FQFqrRn7Rx8mTT4KOs36_-H2LHeA4uWz", emoji: "\ud83e\ude86", days: 36, channel: "UCbz2F3GGD_EpBzrWb8WM-cg" },
  { icon: "1b0Xiz4G4ITGoNeTsNFkzUTXO_xNQd-LU", emoji: "\ud83e\ude9f", days: 34, channel: "UCaHTatQmUMV4TEkSDIeSzHw" },
  { icon: "11ygwplCCuzh5OItBynAVyglM1eZyVUO-", emoji: "\ud83c\udde8\ud83c\udde6", days: 32, channel: "UCsBjGz8D3lLxUhV_eNxN0CQ" },
  { icon: "1t-p13QOO6AKU1hfzLERn9UtQi7KaCkj_", emoji: "\ud83c\udf44", days: 24, channel: "UCEFc53GW9WOuIauCdV5G3dA" },
  { icon: "1rJ2HWtuTb6yME_OSJ4mK6jipz08cJlXq", emoji: "\ud83e\udebb", days: 22, channel: "UCn4EuDFdAfeYGhuFOxpj-NA" },
  { icon: "1kzs_Lm8VmHXkfcW3_7LfssXu2P6sDA47", emoji: "\ud83d\udc00", days: 22, channel: "UCyct2GK_RiW5Ji3Y0gd9MMg" },
  { icon: "1Exzjd1XGvm_kzdNpjY2z8GxSanZ4u_Bp", emoji: "\ud83d\ude34", days: 14, channel: "UCCfYV72nvXIrU_TL4h-HJtA" },
  { icon: "1pnLoE5eN_KBshkVkc-im25pkffjC3mwc", emoji: "\ud83e\ude90", days: 11, channel: "UCO1YuQIwotwvoS9zad6ZI9w" },
  { icon: "1LtULnvCDROj6p-_lVx6_QaSgfVxDuUEx", emoji: "\ud83e\udd24", days: 7, channel: "UCPPWcswbh9XAkE7CWV0QLUg" },
  { icon: "1ekFUI08fLxau-_-f3YOlizDLLYpYi21x", emoji: "\ud83d\udc2f", days: 7, channel: "UCL08aPtZiZQ5wigmTKlUjeg" },
  { icon: "1bGJUOx4NJU112oix9BwSVrZQJgsakGIq", emoji: "\ud83e\udd84", days: 6, channel: "UCTcaoWz0ZBjeCF07p4YO-oQ" },
  { icon: "1jwbRGK_RzFoeH1ndJhetdc9U9_0oS_vz", emoji: "\ud83c\udf4a", days: 6, channel: "UCwx9wGMxJo8G6Dw-dZH1b-Q" },
  { icon: "1qh1cX0_JBfrJ5DcoLY2ZmRVdRRSOGLRh", emoji: "\ud83e\udde2", days: 4, channel: "UCiCJBaQiVs_78Mdw_gWNjAw" },
  { icon: "1kxRf8LuchvjgHBbWJ0Kjm0N2Ho3FOOfm", emoji: "\ud83d\ude3a", days: 3, channel: "UCa9utHa4ky3ZD2nOP0K0iEQ" },
  { icon: "1E8Qm7sgAKmznob7FNDzBEB78zvPfJi86", emoji: "\ud83c\udff7\ufe0f", days: 2, channel: "UCk18XobqxyNsU9RLJAl21ew" },
];

/** 直近90日で5日以上コメントしてくれた人の総数(キャラ未登録も含む) */
export const ACTIVE_FRIENDS = 59;

/** 出席の分母。期間内に**読めた**配信日の数
 *  （配信はあったのに取り込めていない4日は、出席にも分母にも入れていない） */
export const STREAM_DAYS = 85;
