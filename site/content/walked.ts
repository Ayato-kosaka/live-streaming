import { AHEAD_COUNTRIES, COUNTRIES, isWalkedCountry } from "./countries";
import { tripDate } from "./chapters";

/**
 * 「これまで歩いた国」の数。**画面が出てから数え直す。**
 *
 * ## なぜ焼き込みではだめか
 *
 * この数は `content/countryStats.ts` の `COUNTRIES_WALKED` に毎晩焼かれていた。
 * 焼くほう（`python/build_country_stats.py` の `walked()`）は**旅程を今日で切って**
 * 数えるので、**日付が変われば答えが変わる数**を、日に1度だけ焼いていたことになる。
 * 国境を越えた日の 00:00 から、その晩の焼き直しが配られるまでのあいだ、
 * 表紙と `/now` が1つ少ない数を言う。CLAUDE.md の「あと何日」「いちばん近い企画」
 * 「配信本数」と同じ組——**画面が出てから計算し直すもの**だった。
 *
 * ## 何を正にしたか
 *
 * **「歩いた国」の面（`/map`）に並んでいて、数えられる国**を正とした。
 * 島の住人が「『歩いた国』から、これまで歩いた◯カ国をたどれるよー」と言う以上、
 * 行った先で数えられる数と違ってはいけない。
 *
 * その並びは2つでできている。**両方ともここで数える。**
 *
 *   1. 歩き終わった国（`content/countries.ts` の `COUNTRIES`）
 *   2. いま歩いている旅のうち、**今日までに入った国**（`AHEAD_COUNTRIES`）
 *
 * **`iran-border` は数えない**（`isWalkedCountry`）。「イラン（国境まで）」は
 * 国境まで歩いた区間で、入国はしていない。`/map` の章の見出しはこれを1カ国として
 * 数えていて、表紙の 20 に対して章の合計が 21 になっていた。
 *
 * ## 日付は旅の土地の暦で切る
 *
 * `tripDate`（中央ヨーロッパ夏時間）。日本時間で切ると、日本の夜のあいだじゅう
 * 翌日の国を数える（`components/nordic/where.ts`）。
 *
 * ## 旅程は「予定」であることを承知で使う
 *
 * `AHEAD_COUNTRIES` の `entered` は旅程の日付なので、ヒッチハイクが進まなければ
 * 実際の入国はずれる。**それでも `/map` の並びと同じ数**になるほうを取った。
 * 面の中で数が2つあるほうが悪い（`docs/island-standards.md` 8章）。
 * 歩き終わった国が `COUNTRIES` に書き込まれたら、そちらが勝つ（下の `known`）。
 */
export function countriesWalked(now: Date = new Date()): number {
  const done = COUNTRIES.filter((c) => isWalkedCountry(c.slug));
  const known = new Set(done.map((c) => c.slug));
  const day = tripDate(now);
  const ahead = AHEAD_COUNTRIES.filter(
    (c) => isWalkedCountry(c.slug) && !known.has(c.slug) && c.entered <= day,
  );
  return done.length + ahead.length;
}

/**
 * 歩き終わった国の数。**旅の国は入らない。**
 *
 * `/map` の年表で、旅の国に振る通し番号の起点に使う。`COUNTRIES.length` を
 * 使っていたので、国ではない `iran-border` が1つぶん番号を食って、
 * ラトビアが「21番目の国」として出ていた。
 */
export const WALKED_DONE = COUNTRIES.filter((c) => isWalkedCountry(c.slug)).length;
