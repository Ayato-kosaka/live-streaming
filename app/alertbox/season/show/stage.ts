/**
 * 投げ銭1件ぶんの「どの段で、どう出すか」を決める。**決めるだけで、描かない。**
 *
 * - 段は額（JPY）で決まる（`tierFor`）
 * - 段が台本（`show`）を持っていて、その部品が全部読めていれば台本どおりに出す。
 *   読めていなければ、前の小物の演出に落ちる（何も出ない、にしない）
 * - 台本どおりに出すときだけ、その人のキャラ絵と読み上げを遅らせる（`reveal` の秒）。
 *   **落ちたときは遅らせない**（主役が出ないのに、その人の絵だけ待たせることになる）
 * - 名前の札の時刻（出る・数え上げ・ドン）も台本から取る
 * - 段が動画（`video`。11月から）を持っていて、その動画が用意できていれば、動画で流す。キャラ絵と字は
 *   動画の `revealAt` 秒に出す（台本の代わりに、`reveal` と字の出来事だけの時刻表を作る）。
 *   用意できていなければ動画なしで、字とキャラ絵をすぐ出す（台本が読めなかった段と同じ）
 */
import { tierFor, type FxTier, type PlateStyle, type SeasonTheme, type TierShow } from "../../themes";
import { cueOf, resolveScript, type TimedCue } from "./script";
import type { VideoPlan } from "./fxVideo";

export type AlertStage = {
  tier: FxTier;
  /** 台本どおりに出すなら、その台本。落ちたら null */
  show: TierShow | null;
  plate: PlateStyle | null;
  /** その人のキャラ絵と読み上げを出す秒（0 なら今どおり、すぐ） */
  revealSec: number;
  /** ヒットストップのぶんをずらした時刻表（札が使う）。台本が無ければ null */
  cues: TimedCue[] | null;
  /** 動画で流すなら、その段取り（要素ごと）。動画の段でない・用意できていなければ null */
  video: VideoPlan | null;
  /** キャラ絵の箱の上に空ける高さ（面の高さに対する割合）。台本か動画で流すときはその段の値、ほかは 0.02 */
  headroom: number;
};

/** 台本も動画も無いときの、キャラ絵の箱の上の空き（index.tsx の前からの値） */
export const PLAIN_HEADROOM = 0.02;

/** 札がいつ出て、いつ数え上げて、いつ「ドン」か */
export type PlateTiming = {
  appearAt: number;
  carried: boolean;
  /**
   * 振付けが字を左から広げる（段4 は杖の光で書くように）。字は閉じた形で待つ。
   * null なら字が自分で出る（1字ずつ弾む・運ばれてくる）
   */
  wipe: "write" | null;
  count: { at: number; dur: number } | null;
  donAt: number | null;
};

/** 台本の無い段で、札が出る秒（前の作りでキャラ絵がフェードインし終わるころ） */
const PLATE_DEFAULT_AT = 0.8;

export function stageFor(
  theme: SeasonTheme | null,
  yen: number,
  durationSec: number,
  loaded: (name: string, kind: "rig" | "pose" | "item") => boolean,
  /** 動画の段の段取り（用意できていれば）。渡さなければ動画は使わない */
  videoPlan?: (tier: FxTier) => VideoPlan | null
): AlertStage | null {
  if (!theme) return null;
  const tier = tierFor(theme, yen);
  /* 切り絵・ポーズ絵・小物の組が全部展開できているときだけ台本に乗る。ポーズ絵と小物は
     同じ仮装の名前（"dracula"）を使うので、どの種類かも渡す */
  const s = tier.show;
  const ready =
    !!s &&
    s.rigs.every((n) => loaded(n, "rig")) &&
    (s.poses ?? []).every((n) => loaded(n, "pose")) &&
    (s.items ?? []).every((n) => loaded(n, "item"));
  const show = ready ? s : null;
  // 動画は台本の無い段だけ（両方を持つ段は作らない。持っていたら台本が先）
  const video = !show && tier.video && videoPlan ? videoPlan(tier) : null;
  if (video) {
    return { tier, show: null, plate: tier.plate ?? null, revealSec: video.revealAt, cues: videoCues(video), video, headroom: video.headroom };
  }
  const cues = show ? resolveScript(show.script, durationSec) : null;
  const reveal = cues ? cueOf(cues, "reveal") : null;
  const revealSec = show && show.revealSec > 0 ? reveal?.t ?? show.revealSec : 0;
  return { tier, show, plate: tier.plate ?? null, revealSec, cues, video: null, headroom: show ? show.headroom : PLAIN_HEADROOM };
}

/**
 * 動画の段の時刻表（札が使う）。キャラ絵と字は `revealAt` に同時に出る。字の出し方はハロウィン2版目の同じ段に
 * 合わせる（段4〜6 は弾んだ 0.9 秒あとに「ドン」、段7 は札が上から降りて揺れ、0.5 秒あとから 1 秒で額を数え上げて
 * 「ドン」。ハロウィン2版目の段6・段7 と同じ間）。
 *
 * 段7 を「1字ずつ弾む＋数え上げ」にしないのは、`RichText` の数え上げの額が弾む字に入っておらず、
 * **字が出る前から「0」だけが見えてしまう**から（この箱で、アラートの頭から額の字が見えていたのを測って見つけた）。
 * 札ごと降りる出し方（ハロウィン2版目の段7 のもの。こうもりは振付けが描いていたので、ここでは札だけが降りる）なら、
 * 札の箱ごと `revealAt` まで隠れている
 */
export function videoCues(v: Pick<VideoPlan, "revealAt" | "text">): TimedCue[] {
  const r = v.revealAt;
  const out: TimedCue[] = [{ at: r, t: r, do: "reveal" }];
  if (v.text === "count") {
    out.push({ at: r, t: r, do: "plateIn", dur: 0.6 });
    out.push({ at: r + 0.5, t: r + 0.5, do: "count", dur: 1.0 });
    out.push({ at: r + 1.5, t: r + 1.5, do: "don" });
    return out;
  }
  out.push({ at: r, t: r, do: "textIn" });
  if (v.text === "don") out.push({ at: r + 0.9, t: r + 0.9, do: "don" });
  return out;
}

/**
 * 動画が動かなかったとき（3 秒動かない・止められた）の出し方。動画を外し、**キャラ絵と字がまだ出ていなければ
 * 今すぐ出す**（台本が読めなかった段と同じ出し方。index.tsx はキャラ絵と字を組み直す）。
 * もう出ていれば、並べ方はそのまま（キャラ絵が跳ねない）で動画だけを外す
 */
export function withoutVideo(st: AlertStage, elapsedSec: number): AlertStage {
  if (!st.video) return st;
  if (elapsedSec >= st.revealSec) return { ...st, video: null };
  return { ...st, video: null, revealSec: 0, cues: null, headroom: PLAIN_HEADROOM };
}

export function plateTiming(st: AlertStage): PlateTiming {
  const appear = st.cues ? cueOf(st.cues, "plateIn") : null;
  const textIn = st.cues ? cueOf(st.cues, "textIn") : null;
  const write = st.cues ? cueOf(st.cues, "write") : null;
  const count = st.cues ? cueOf(st.cues, "count") : null;
  const don = st.cues ? cueOf(st.cues, "don") : null;
  return {
    appearAt: appear?.t ?? textIn?.t ?? write?.t ?? st.plate?.appearAt ?? PLATE_DEFAULT_AT,
    carried: !!appear,
    wipe: appear ? null : write ? "write" : null,
    count: count ? { at: count.t, dur: count.dur ?? 1 } : null,
    donAt: don?.t ?? null,
  };
}
