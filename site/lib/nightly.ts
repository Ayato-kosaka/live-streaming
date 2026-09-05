/**
 * 日本時間の「いま」。
 *
 * 静的書き出し（`output: "export"`）なので、ビルドしたときの日付が焼き込まれる。
 * 「今日」「今夜まであと何分」「1年前の今日」は、**画面が出てから**ここで数え直す。
 * 端末の時計がどこの国に合っていても、基準はいつも日本時間にする。
 * 配信が日本時間の22時からと決まっていて、それが島でいちばん大事な時刻だから。
 *
 * `components/live/NowLive.tsx` にもほぼ同じ時計がある。あちらは別の担当が
 * 触っているので、いまは写した状態のままにしてある。片方を直したらもう片方も直す。
 */

/** 配信は日本時間の22時から、だいたい2〜3時間。 */
export const START_H = 22;
export const HOURS = 3;

export type JstNow = {
  y: number;
  /** 1〜12 */
  m: number;
  d: number;
  h: number;
  min: number;
  /** "MM-DD"。1年前の今日を引くのに使う */
  md: string;
  /** "YYYY-MM-DD" */
  date: string;
};

/** その瞬間の日本時間を、部品に分けて返す。 */
export function jstNow(now: Date = new Date()): JstNow {
  const t = new Date(now.getTime() + now.getTimezoneOffset() * 60000 + 9 * 3600000);
  const y = t.getFullYear();
  const m = t.getMonth() + 1;
  const d = t.getDate();
  const p2 = (n: number) => String(n).padStart(2, "0");
  return { y, m, d, h: t.getHours(), min: t.getMinutes(), md: `${p2(m)}-${p2(d)}`, date: `${y}-${p2(m)}-${p2(d)}` };
}

/** 日本時間で n 日ずらした日付（YYYY-MM-DD）。きのう作った料理を引くのに使う。 */
export function jstShift(now: Date, days: number): string {
  const j = jstNow(now);
  const t = new Date(Date.UTC(j.y, j.m - 1, j.d + days));
  return t.toISOString().slice(0, 10);
}

export type Night = {
  /** いま配信の時間か（JST 22:00〜25:00） */
  onAir: boolean;
  /** 今夜の配信まであと何分。onAir のときは 0 */
  mins: number;
};

/** 今夜の配信まで、あと何分か。 */
export function readNight(now: Date = new Date()): Night {
  const { h, min } = jstNow(now);
  const end = (START_H + HOURS) % 24; // 25時 = 1時
  if (h >= START_H || h < end) return { onAir: true, mins: 0 };
  let mins = (START_H - h) * 60 - min;
  if (mins <= 0) mins += 24 * 60;
  return { onAir: false, mins };
}

/** 「3時間20分」。1時間を切ったら分だけ、ちょうどなら「3時間」。 */
export function spanText(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h <= 0) return `${m}分`;
  // ちょうどの時刻に「10時間0分」と出ると、機械が数えている感じがする
  return m > 0 ? `${h}時間${m}分` : `${h}時間`;
}
