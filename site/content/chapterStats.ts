/**
 * 章ごとの人数と配信の本数。**自動生成。手で直さない。**
 * 作り直す: `BQ_PROJECT_ID=... python python/build_chapter_stats.py`
 *
 * 人数は、その章のあいだにチャットを1回でも書いた人の数（重複なし）。
 * 本数は、その章のあいだに配信して取り込めたものの数。
 *
 * 数えた日: 2026-09-05
 */
export type ChapterStat = {
  /** その章のあいだに来てくれた人の数 */
  people: number;
  /** その章のあいだの配信の本数 */
  streams: number;
};

export const CHAPTER_STATS: Record<string, ChapterStat> = {
  "europe": { people: 258, streams: 121 }, // ヨーロッパ周遊
  "middle-east": { people: 177, streams: 110 }, // 中東周遊
  "caucasus": { people: 1893, streams: 436 }, // コーカサス周遊
  "iran-walk": { people: 502, streams: 9 }, // イランまで歩く
};
