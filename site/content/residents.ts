/** 直近90日で島に来てくれている仲間のうち、キャラクター登録済みの人。
 *  名前は出さない方針なので、アイコン/絵文字と「一緒にいた日数」だけを持つ。
 *  日次ジョブで Firestore から更新される想定の初期値。 */
export type Resident = { icon?: string; emoji?: string; days: number };

export const RESIDENTS: Resident[] = [
  { icon: "18okO58dwMaci-9R1go0Rj1dTqliSWlz3", emoji: "\ud83d\udc99", days: 80 },
  { icon: "1wQzpWPNZKnty7DIiEkrSyib145QIWy4K", emoji: "\ud83d\udc1f", days: 73 },
  { icon: "1NLsB-D-jeUxQ3viqwhJu2GkRRXsYXAaQ", emoji: "\ud83e\udd94", days: 53 },
  { icon: "1y17p0D56itwNXWWEzo94jF4ThNETczQg", emoji: "\ud83c\udf51", days: 51 },
  { icon: "1oRv9hYOkvlbBvDepLcDWEd6CWm19BJkS", emoji: "\ud83d\udc15", days: 48 },
  { icon: "1XUYZEts8lz9SFqQmKuBd4G8KMRfBmPL-", emoji: "\ud83c\udf43", days: 44 },
  { icon: "1FQFqrRn7Rx8mTT4KOs36_-H2LHeA4uWz", emoji: "\ud83e\ude86", days: 43 },
  { icon: "1rJ2HWtuTb6yME_OSJ4mK6jipz08cJlXq", emoji: "\ud83e\udebb", days: 36 },
  { icon: "1L3c-p3QtcO5HLqCPUtGisxI-_SpwEaZt", emoji: "\ud83d\udc3c", days: 33 },
  { icon: "11ygwplCCuzh5OItBynAVyglM1eZyVUO-", emoji: "\ud83c\udde8\ud83c\udde6", days: 31 },
  { icon: "1t-p13QOO6AKU1hfzLERn9UtQi7KaCkj_", emoji: "\ud83c\udf44", days: 28 },
  { icon: "1b0Xiz4G4ITGoNeTsNFkzUTXO_xNQd-LU", emoji: "\ud83e\ude9f", days: 27 },
  { icon: "1Exzjd1XGvm_kzdNpjY2z8GxSanZ4u_Bp", emoji: "\ud83d\ude34", days: 26 },
  { icon: "1kxRf8LuchvjgHBbWJ0Kjm0N2Ho3FOOfm", emoji: "\ud83d\ude3a", days: 16 },
  { icon: "1pnLoE5eN_KBshkVkc-im25pkffjC3mwc", emoji: "\ud83e\ude90", days: 12 },
  { icon: "1ekFUI08fLxau-_-f3YOlizDLLYpYi21x", emoji: "\ud83d\udc2f", days: 10 },
  { icon: "1E8Qm7sgAKmznob7FNDzBEB78zvPfJi86", emoji: "\ud83c\udff7\ufe0f", days: 9 },
  { icon: "1kzs_Lm8VmHXkfcW3_7LfssXu2P6sDA47", emoji: "\ud83d\udc00", days: 8 },
  { icon: "1LtULnvCDROj6p-_lVx6_QaSgfVxDuUEx", emoji: "\ud83e\udd24", days: 8 },
  { icon: "1jwbRGK_RzFoeH1ndJhetdc9U9_0oS_vz", emoji: "\ud83c\udf4a", days: 6 },
  { icon: "1qh1cX0_JBfrJ5DcoLY2ZmRVdRRSOGLRh", emoji: "\ud83e\udde2", days: 5 },
  { icon: "1bGJUOx4NJU112oix9BwSVrZQJgsakGIq", emoji: "\ud83e\udd84", days: 5 },
];

/** 直近90日で5日以上コメントしてくれた人の総数(キャラ未登録も含む) */
export const ACTIVE_FRIENDS = 61;