/**
 * 章ごとの人数・配信の本数と、**その章にいた住人**。
 * **自動生成。手で直さない。**
 * 作り直す: `BQ_PROJECT_ID=... python python/build_chapter_stats.py`
 *
 * `people` はその章のあいだにチャットを1回でも書いた人の数（重複なし）。
 * `streams` はその章のあいだに配信して取り込めたものの数。
 *
 * `residents` は、そのうち**キャラクターの絵が分かっている人**だけ。
 * 絵とチャンネルの対応は `python/residents_map.json`（alertbox の Viewers 表）。
 * だから `residents.length` は `people` よりずっと少ない。**この2つは別のものを数えている。**
 *
 * **同じ人が複数の島に出てよい**（`docs/island-atlas.md` 3章）。
 * 島ごとに重複を消さない。ずっと来てくれている人は、ずっと島にいる。
 *
 * 数えた日: 2026-09-05
 */
export type ChapterResident = {
  /** キャラクターの絵（Google Drive の id）。`content/residents.ts` の icon と同じ */
  icon: string;
  /** その章のあいだ、チャットを書いた日の数。多い順に並んでいる */
  days: number;
};

export type ChapterStat = {
  /** その章のあいだに来てくれた人の数 */
  people: number;
  /** その章のあいだの配信の本数 */
  streams: number;
  /** そのうち、絵の分かっている住人。多く来た順 */
  residents: ChapterResident[];
};

export const CHAPTER_STATS: Record<string, ChapterStat> = {
  // ヨーロッパ周遊
  "europe": {
    people: 258,
    streams: 121,
    residents: [
      { icon: "1NLsB-D-jeUxQ3viqwhJu2GkRRXsYXAaQ", days: 68 },
      { icon: "1wQzpWPNZKnty7DIiEkrSyib145QIWy4K", days: 50 },
      { icon: "1b0Xiz4G4ITGoNeTsNFkzUTXO_xNQd-LU", days: 33 },
      { icon: "1LtULnvCDROj6p-_lVx6_QaSgfVxDuUEx", days: 4 },
    ],
  },
  // 中東周遊
  "middle-east": {
    people: 177,
    streams: 110,
    residents: [
      { icon: "1NLsB-D-jeUxQ3viqwhJu2GkRRXsYXAaQ", days: 78 },
      { icon: "1wQzpWPNZKnty7DIiEkrSyib145QIWy4K", days: 77 },
      { icon: "1b0Xiz4G4ITGoNeTsNFkzUTXO_xNQd-LU", days: 43 },
      { icon: "1bGJUOx4NJU112oix9BwSVrZQJgsakGIq", days: 9 },
      { icon: "11ygwplCCuzh5OItBynAVyglM1eZyVUO-", days: 5 },
      { icon: "1LtULnvCDROj6p-_lVx6_QaSgfVxDuUEx", days: 3 },
    ],
  },
  // コーカサス周遊
  "caucasus": {
    people: 1893,
    streams: 436,
    residents: [
      { icon: "1wQzpWPNZKnty7DIiEkrSyib145QIWy4K", days: 272 },
      { icon: "1NLsB-D-jeUxQ3viqwhJu2GkRRXsYXAaQ", days: 238 },
      { icon: "1FQFqrRn7Rx8mTT4KOs36_-H2LHeA4uWz", days: 159 },
      { icon: "1b0Xiz4G4ITGoNeTsNFkzUTXO_xNQd-LU", days: 119 },
      { icon: "18okO58dwMaci-9R1go0Rj1dTqliSWlz3", days: 103 },
      { icon: "11ygwplCCuzh5OItBynAVyglM1eZyVUO-", days: 101 },
      { icon: "1bGJUOx4NJU112oix9BwSVrZQJgsakGIq", days: 81 },
      { icon: "1XUYZEts8lz9SFqQmKuBd4G8KMRfBmPL-", days: 65 },
      { icon: "1oRv9hYOkvlbBvDepLcDWEd6CWm19BJkS", days: 60 },
      { icon: "1rJ2HWtuTb6yME_OSJ4mK6jipz08cJlXq", days: 58 },
      { icon: "1y17p0D56itwNXWWEzo94jF4ThNETczQg", days: 53 },
      { icon: "1Exzjd1XGvm_kzdNpjY2z8GxSanZ4u_Bp", days: 42 },
      { icon: "1L3c-p3QtcO5HLqCPUtGisxI-_SpwEaZt", days: 38 },
      { icon: "1kxRf8LuchvjgHBbWJ0Kjm0N2Ho3FOOfm", days: 37 },
      { icon: "1t-p13QOO6AKU1hfzLERn9UtQi7KaCkj_", days: 29 },
      { icon: "1LtULnvCDROj6p-_lVx6_QaSgfVxDuUEx", days: 24 },
      { icon: "1ekFUI08fLxau-_-f3YOlizDLLYpYi21x", days: 24 },
      { icon: "1pnLoE5eN_KBshkVkc-im25pkffjC3mwc", days: 17 },
      { icon: "1qh1cX0_JBfrJ5DcoLY2ZmRVdRRSOGLRh", days: 17 },
      { icon: "1kzs_Lm8VmHXkfcW3_7LfssXu2P6sDA47", days: 16 },
      { icon: "1E8Qm7sgAKmznob7FNDzBEB78zvPfJi86", days: 13 },
      { icon: "1jwbRGK_RzFoeH1ndJhetdc9U9_0oS_vz", days: 12 },
    ],
  },
  // イランまで歩く
  "iran-walk": {
    people: 502,
    streams: 9,
    residents: [
      { icon: "1NLsB-D-jeUxQ3viqwhJu2GkRRXsYXAaQ", days: 7 },
      { icon: "1wQzpWPNZKnty7DIiEkrSyib145QIWy4K", days: 6 },
      { icon: "1rJ2HWtuTb6yME_OSJ4mK6jipz08cJlXq", days: 4 },
      { icon: "1b0Xiz4G4ITGoNeTsNFkzUTXO_xNQd-LU", days: 3 },
      { icon: "1Exzjd1XGvm_kzdNpjY2z8GxSanZ4u_Bp", days: 3 },
      { icon: "1jwbRGK_RzFoeH1ndJhetdc9U9_0oS_vz", days: 3 },
      { icon: "11ygwplCCuzh5OItBynAVyglM1eZyVUO-", days: 2 },
      { icon: "1XUYZEts8lz9SFqQmKuBd4G8KMRfBmPL-", days: 2 },
      { icon: "1kxRf8LuchvjgHBbWJ0Kjm0N2Ho3FOOfm", days: 2 },
      { icon: "1ekFUI08fLxau-_-f3YOlizDLLYpYi21x", days: 2 },
      { icon: "1qh1cX0_JBfrJ5DcoLY2ZmRVdRRSOGLRh", days: 2 },
      { icon: "1bGJUOx4NJU112oix9BwSVrZQJgsakGIq", days: 1 },
    ],
  },
};
