/**
 * 投げ銭アラートの道具（`alert-textfit.mjs`・`alert-ink.mjs`・`alert-decode.mjs`）が、**どのテーマを・どの段で・
 * 何秒待って**測るかを1か所で決める（#1117）。
 *
 *   import { seasonThemes, tiered, settleFor, fxManifest } from "./alertseason.mjs";
 *
 * ## なぜ要るか
 *
 * 道具はどれもハロウィンを決め打ちしていた（`theme === "halloween"` で段を回す・待つ秒の表・`theme: "halloween"`）。
 * 10月が終わると、毎 PR で**終わったテーマを測って緑**になり、いま配信に出る11月の段は1つも見ていなかった。
 *
 * - **テーマ**は「期間がいま効いている、または 60 日以内に始まるテーマ」（`tools/alert-theme/ci/run.py themes`。
 *   themes.ts を字で読むのは `python/ts_read.py` だけの決まりなので、ここでは読まない）。豚（`none`）は呼ぶ側が足す。
 *   来年のハロウィンは、themes.ts に日付が足されれば 60 日前からひとりでに戻る
 * - **段**は 7 段の切れ目（0・200・500・1,000・2,000・5,000・10,000円。ハロウィンも11月の城も同じ）
 * - **動画の段**（`?fx=full`）の待つ秒は、書き出しの `/alert/themes/<id>/fx/manifest.json` から。字はキャラ絵と同時に
 *   `revealAt` に出て、段7 の数え上げも 1.5 秒で終わる（`season/show/stage.ts` の `videoCues`）
 */
import { execFileSync } from "node:child_process";
import { repoPath } from "./repo.mjs";

export const CUTS = [0, 200, 500, 1000, 2000, 5000, 10000];
/** 額 → 段（1〜7） */
export const tierOf = (a) => CUTS.filter((c) => a >= c).length;

/** 期間がいま効いている・60日以内に始まるテーマ（豚は入れない）。[{ theme, fx }] */
export function seasonThemes() {
  const out = execFileSync("python3", [repoPath("tools/alert-theme/ci/run.py"), "themes"], { encoding: "utf-8" });
  return JSON.parse(out);
}

/** 書き出しから動画の段の manifest を読む。無ければ null（動画の段を持たないテーマ） */
export async function fxManifest(base, theme) {
  try {
    const r = await fetch(`${base}/alert/themes/${theme}/fx/manifest.json`);
    return r.ok ? await r.json() : null;
  } catch {
    return null;
  }
}

/** そのテーマを段ごとに回すか（ハロウィンは台本の段・動画の旗が付いて manifest があれば動画の段）。ほかは1段 */
export const tiered = (theme, fx, man) => theme === "halloween" || (!!fx && !!man?.tiers);

/**
 * 字が出そろって止まる秒（アラートの頭から）。
 * `halloween` は道具ごとに持っていた表（呼ぶ側が渡す）、動画の段は manifest から、ほかは `plain` 秒
 */
export function settleFor({ theme, fx, man, amount, halloween, plain }) {
  if (theme === "halloween") return halloween(amount);
  const t = fx && man?.tiers?.[String(tierOf(amount))];
  if (t) return Math.max(t.revealAt + 2.5, t.introDur + 0.5);
  return plain;
}
