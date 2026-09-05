/**
 * 「コメントがいちばん重なったところ」の言い方と行き先。
 *
 * 中身の表（212本ぶん）は `content/streamPeaks.ts` にあって、サーバー側でしか読まない。
 * ここに置いてあるのは字と URL を作るだけの2つで、こちらはブラウザにも降りる
 * （「1年前の今日」の板が使う。そのぶんの秒は `content/onThisDay.ts` に焼いてある）。
 *
 * 分けてあるのは、表をブラウザに配らないため。
 * 同じファイルに置くと、字を1つ使うために 8KB の表が一緒に落ちてくる。
 */

/**
 * 「1時間12分」。1時間に満たなければ分だけ。
 *
 * **秒は出さない。** 3分の窓で数えているので、秒まで言うと精度を偽ることになる。
 */
export function atText(sec: number): string {
  const m = Math.round(sec / 60);
  const h = Math.floor(m / 60);
  return h > 0 ? `${h}時間${m % 60}分` : `${m}分`;
}

/** その時刻から開く YouTube の URL。 */
export const watchAt = (videoId: string, sec: number) =>
  `https://www.youtube.com/watch?v=${videoId}&t=${sec}s`;
