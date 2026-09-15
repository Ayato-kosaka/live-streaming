/**
 * 今日、島に出る人をえらぶ。
 *
 * ## あやとの決め（2026-09-15）
 *
 * > やっぱり、投げ銭よくしてくれる人が優先されるべき。けど、出席も大事。
 * > 額と出席まで欲しい。**投げ銭の頻度はどうでも良い。**
 * > 少額でも出席し続けてたら良い。**少額頻度高めで出席悪ければ意味ない。**
 * > **相対評価が良いかも。ランクづけを過去3ヶ月でして、スコアリングできそう。
 * > 額1位は皆勤と同じくらい重要**
 *
 * 見るのは2つだけ。**直近90日の投げ銭の総額**と、**直近90日の出席日数**。
 * どちらも**その3ヶ月での順位**を 0〜1 の点に直して、**足す**（掛けない）。
 * 掛けると額0の人の点が0になって、二度と島を歩けなくなる。
 * 足せば「出席だけでも出られる」と「額1位 ≒ 皆勤」が同時に立つ。
 *
 * **何回に分けて投げたかは見ない。** 点は総額の順位から決まるので、
 * 同じ額を10回に分けても1回で投げても同じ点になる。
 *
 * 点そのものを作るのは焼くほう（`python/build_residents.py`）。
 * ここは**焼いてある点を、抽選の重みに直すだけ。**
 */

import { rng } from "./geometry";

/** 抽選にかける人。`score` は `site/content/residents.ts` が焼いた 0〜1 の点。 */
export type Weighted = { days: number; score?: number };

/**
 * 点が満点の人は、点0の人の何倍えらばれやすいか。
 *
 * **測って決めた値。** 候補102人・一度に12人で、90日の窓を2,000本まわした
 * （本番の日数の分布そのままで。公平なら1人あたり10.6日）。
 * 同じ測りかたを200本で回しているのが `site/selftest/roster_selftest.mjs`。
 *
 * | 倍率 | いちばん出る人 | 上位12平均 ÷ 下位12平均 | 90日で0日の人が出た窓 |
 * | --- | --- | --- | --- |
 * | 1（公平） | 18.8日 | 2.71倍 | 0.00% |
 * | 2.5 | 23.9日 | 4.28倍 | 2.00% |
 * | **3** | **25.4日** | **5.04倍** | **3.25%** |
 * | 4 | 28.2日 | 6.69倍 | 6.55% |
 * | 5 | 30.2日 | 8.66倍 | 17.35% |
 * | 前の式（`days` をそのまま指数に） | 75.0日 | 336倍 | **100%（毎窓10.6人）** |
 *
 * 前の式は幅が 1〜80 あって、**90日でひとりも歩けない人が毎回10人前後**いた。
 * 上げるほど「よく来る人がいつもいる」は強くなるが、そのぶん下が90日
 * まるごと出なくなる。**3倍は、上位と下位の差が5倍以内に収まる上限。**
 *
 * **上げ下げはこの1つの数だけで効く。** 点の作り方（焼くほう）は動かさない。
 */
export const TOP_WEIGHT = 3;

/** 0〜1 に収める。焼き込みが壊れていても抽選だけは回るように。 */
function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/**
 * 値の一覧 → 0〜1 の点。**相対評価（順位）で決める。**
 *
 * 点 ＝ 自分より小さい値の人数 ÷ (人数 - 1)。
 *
 * **同着は全員おなじ点で、そのかたまりの「いちばん下」に付ける。**
 * かたまりの上や平均で付けると、投げ銭0円の人が数十人並んでいるだけで
 * その全員が真ん中あたりの点をもらう。それは
 * 「投げ銭よくしてくれる人が優先される」の逆になる。
 *
 * @param {number[]} values 値の一覧
 * @return {number[]} 同じ並びの点
 */
export function rankPoints(values: number[]): number[] {
  const n = values.length;
  if (n <= 1) return values.map(() => 0);
  const sorted = [...values].sort((a, b) => a - b);
  return values.map((v) => {
    // 自分より小さい値が何人いるか（二分探索）
    let lo = 0;
    let hi = n;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (sorted[mid] < v) lo = mid + 1;
      else hi = mid;
    }
    return lo / (n - 1);
  });
}

/**
 * 一人ずつの点（0〜1）。
 *
 * ふだんは焼いてある `score` をそのまま使う。
 * **`score` を持たない人は、出席日数の順位だけで点を付ける。**
 * 焼き直しの前や、島の状態の口から来た受け皿のデータには点が無いので、
 * そこで全員を同じ重みに落とすと「よく来てくれている人ほど島にいる」が
 * 丸ごと消える。額が読めないぶんだけ弱くなる、に留める。
 *
 * @param {Weighted[]} all 候補ぜんぶ
 * @return {number[]} 同じ並びの点
 */
export function pointsOf(all: Weighted[]): number[] {
  const byDays = rankPoints(all.map((p) => p.days));
  return all.map((p, i) => (typeof p.score === "number" ? clamp01(p.score) : byDays[i]));
}

/**
 * 抽選の重み。点0で 1、点1で `TOP_WEIGHT`。
 *
 * @param {Weighted[]} all 候補ぜんぶ
 * @return {number[]} 同じ並びの重み
 */
export function weightsOf(all: Weighted[]): number[] {
  return pointsOf(all).map((s) => 1 + (TOP_WEIGHT - 1) * s);
}

/**
 * 今日、島に出ている人。
 *
 * 全員を毎日ぜんぶ歩かせると島が人で埋まるし、上位から固定で選ぶと
 * **昨日と今日で島がまったく同じ**になる（`docs/island-play.md` 2章）。
 * なので日替わりにする。
 *
 * `乱数^(1/重み)` の大きい順に取ると、**選ばれる回数が重みに比例する**
 * （重み付きの復元なし抽選）。重みが 1〜`TOP_WEIGHT` なので、
 * 上のほうと下のほうで出る日数が5倍ほど違う。
 *
 * @param {T[]} all 候補ぜんぶ
 * @param {number} max 一度に島を歩く人数
 * @param {number} day 日本時間の通算日数
 * @return {T[]} 今日の顔ぶれ
 */
export function rosterOf<T extends Weighted>(all: T[], max: number, day: number): T[] {
  if (all.length <= max) return all;
  const r = rng((day * 2654435761) >>> 0);
  const w = weightsOf(all);
  return all
    .map((who, i) => ({ who, key: Math.pow(Math.max(r(), 1e-9), 1 / w[i]) }))
    .sort((a, b) => b.key - a.key)
    .slice(0, max)
    .map((x) => x.who);
}
