/**
 * 投げ銭1件ぶんの「どの段で、どう出すか」を決める。**決めるだけで、描かない。**
 *
 * - 段は額（JPY）で決まる（`tierFor`）
 * - 段が台本（`show`）を持っていて、その部品が全部読めていれば台本どおりに出す。
 *   読めていなければ、前の小物の演出に落ちる（何も出ない、にしない）
 * - 台本どおりに出すときだけ、その人のキャラ絵と読み上げを遅らせる（`reveal` の秒）。
 *   **落ちたときは遅らせない**（主役が出ないのに、その人の絵だけ待たせることになる）
 * - 名前の札の時刻（出る・数え上げ・ドン）も台本から取る
 */
import { tierFor, type FxTier, type PlateStyle, type SeasonTheme, type TierShow } from "../../themes";
import { cueOf, resolveScript, type TimedCue } from "./script";

export type AlertStage = {
  tier: FxTier;
  /** 台本どおりに出すなら、その台本。落ちたら null */
  show: TierShow | null;
  plate: PlateStyle | null;
  /** その人のキャラ絵と読み上げを出す秒（0 なら今どおり、すぐ） */
  revealSec: number;
  /** ヒットストップのぶんをずらした時刻表（札が使う）。台本が無ければ null */
  cues: TimedCue[] | null;
};

/** 札がいつ出て、いつ数え上げて、いつ「ドン」か */
export type PlateTiming = {
  appearAt: number;
  carried: boolean;
  count: { at: number; dur: number } | null;
  donAt: number | null;
};

/** 台本の無い段で、札が出る秒（前の作りでキャラ絵がフェードインし終わるころ） */
const PLATE_DEFAULT_AT = 0.8;

export function stageFor(
  theme: SeasonTheme | null,
  yen: number,
  durationSec: number,
  rigLoaded: (name: string) => boolean
): AlertStage | null {
  if (!theme) return null;
  const tier = tierFor(theme, yen);
  const show = tier.show && tier.show.rigs.every(rigLoaded) ? tier.show : null;
  const cues = show ? resolveScript(show.script, durationSec) : null;
  const reveal = cues ? cueOf(cues, "reveal") : null;
  const revealSec = show && show.revealSec > 0 ? reveal?.t ?? show.revealSec : 0;
  return { tier, show, plate: tier.plate ?? null, revealSec, cues };
}

export function plateTiming(st: AlertStage): PlateTiming {
  const appear = st.cues ? cueOf(st.cues, "plateIn") : null;
  const count = st.cues ? cueOf(st.cues, "count") : null;
  const don = st.cues ? cueOf(st.cues, "don") : null;
  return {
    appearAt: appear?.t ?? st.plate?.appearAt ?? PLATE_DEFAULT_AT,
    carried: !!appear,
    count: count ? { at: count.t, dur: count.dur ?? 1 } : null,
    donAt: don?.t ?? null,
  };
}
