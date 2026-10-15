/**
 * **締め切った宛先の表。手で直さない。**
 *
 * 正本は島の側（`site/content/themes.ts` の `closed` と、企画あての日付）。
 * ここはその写しで、`functions/tools/shutthemes.mjs` が組み立てる:
 *
 *     node functions/tools/shutthemes.mjs --write
 *
 * ずれたら `functions/selftest/sticky_shut_selftest.mjs` が落ちる。
 *
 * ## 読み方
 *
 * 値は「**この時刻（epoch ms）から書けない**」。`0` はずっと書けない。
 * **ここに名前が無い宛先は、いつでも書ける**——島の表に1行足した日に
 * Functions を配り直さなくても、その宛先に貼れるようにするため
 * （`islandApi.ts` の `THEME_ID` の注と同じ決め）。
 */

/** 宛先の id → その時刻から書けない（epoch ms。`0` はずっと） */
export const SHUT_THEMES: Readonly<Record<string, number>> = {
  /* アルバニアでこれやって — 畳んである（closed） */
  "albania": 0,
  /* 北欧の旅 — 畳んである（closed） */
  "nordic": 0,
  /* ポーランド — 畳んである（closed） */
  "poland": 0,
  /* リトアニア — 畳んである（closed） */
  "lithuania": 0,
  /* ラトビア — 畳んである（closed） */
  "latvia": 0,
  /* エストニア — 畳んである（closed） */
  "estonia": 0,
  /* フィンランド — 畳んである（closed） */
  "finland": 0,
  /* スウェーデン — 畳んである（closed） */
  "sweden": 0,
  /* クタイシ → カトヴィツェ — 畳んである（closed） */
  "leg-kutaisi-katowice": 0,
  /* フード＆ワイン祭り — 2026-09-07 00:00 JST から */
  "food-wine-fest": 1788706800000,
  /* ジョージアバイバイ — 2026-09-12 00:00 JST から */
  "georgia-bye": 1789138800000,
  /* 海外出発二周年 — 2026-09-12 00:00 JST から */
  "japan-2years": 1789138800000,
  /* 10月の月末配信 — 2026-11-01 00:00 JST から */
  "monthly-2026-10": 1793458800000,
  /* カレンダー — 畳んである（closed） */
  "goods-calendar": 0,
  /* LINEスタンプ — 畳んである（closed） */
  "goods-linestamp": 0,
};
