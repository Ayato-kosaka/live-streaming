/**
 * 段の「演出の台本」。時刻つきの出来事の並びで、**何が・いつ起きるか**だけを持つ。
 * どう描くかは演出ごとの振付け（`season/show/dracula.ts` など）が持つ。
 *
 * - 時刻はアラートが出た瞬間から数える（秒）。**負の時刻は終わりから数える**
 *   （締めは「終わりの4秒前」と書けば、アラートの長さが変わっても付いてくる）
 * - `hitstop` は**それより後の出来事を全部その長さだけ後ろへずらす**（一瞬止めるので）。
 *   ずらしたあとの時刻は `resolveScript` が出す。札（`NamePlate`）と振付けの両方が
 *   同じ時刻表を見るので、止めたぶん札だけ先に出る、が起きない
 */

export type CueKind =
  /** 画面ぜんぶを暗くする（`to` まで） */
  | "darken"
  /** 縁の色がどくんと脈打つ（`n` が強さ 0..1） */
  | "pulse"
  /** 画面いっぱいの閃光 */
  | "flash"
  /** 演出の層だけ揺らす（その人の絵と札は揺らさない） */
  | "shake"
  /** 一瞬止める（`dur` 秒） */
  | "hitstop"
  /** こうもりが四方から湧いて渦を巻く（`n` 匹） */
  | "batVortex"
  /** 満月が昇る・後光が回り出す */
  | "moonRise"
  /** 棺が落ちてくる（着地は at + dur） */
  | "coffinDrop"
  /** ふたがガタガタ */
  | "lidRattle"
  /** ふたが開いて金の光が噴き出す */
  | "lidOpen"
  /** 金貨の噴水（`n` 枚を `dur` 秒かけて） */
  | "coinFountain"
  /** 主役が起き上がる */
  | "rise"
  /** マントをばさっと開く */
  | "capeOpen"
  /** キラーン */
  | "glint"
  /** 鬼火が四方から集まる（段5の前兆。`n` 個） */
  | "wisps"
  /** 足元から霧が湧く */
  | "mist"
  /** 主役が霧の中から現れる */
  | "appear"
  /** 大鎌を振り抜く。斬撃の光が走る */
  | "slash"
  /** 紫の稲光（段6の前兆。`n` はどこに落ちるか: 0 左 / 1 右 / 2 両方） */
  | "lightning"
  /** 地鳴り（演出の層だけ細かく震える） */
  | "rumble"
  /** 墓石が次々せり上がる */
  | "graves"
  /** 土を割って手が出る */
  | "hand"
  /** 跳び出して決めポーズ、踊り出す */
  | "dance"
  /** 仲間が出てきて並んで弾む */
  | "friends"
  /** 名前の札が出る */
  | "plateIn"
  /** 額を回る数字で数え上げる（`dur` 秒） */
  | "count"
  /** 金貨の雨 */
  | "coinRain"
  /** 額が止まって「ドン」 */
  | "don"
  /** 一礼 */
  | "bow"
  /** その人のキャラ絵が出る（読み上げもここから） */
  | "reveal"
  /** 退く（暗さを緩め、月と主役が札の端へ） */
  | "retreat"
  /** 滞在（主役が札の端で小芸） */
  | "stay"
  /** 締め */
  | "finale"
  /** 行進して入ってくる（段3。止まり際に行き過ぎて戻る）。札は歩いたぶんだけ巻物のように広がる */
  | "marchIn"
  /** 字が1字ずつ弾んで出る（運ばれず、書かれず） */
  | "textIn"
  /** 字を杖の光で書き始める（段4。書くのは振付け） */
  | "write"
  /** 金のきらめきが画面を走る（段4の前兆） */
  | "glimmer"
  /** 魔法陣が開く */
  | "circle"
  /** 弧を描いて飛び込んでくる */
  | "flyIn"
  /** ポーズを切り替える（一瞬つぶして弾ける。`pose` の名前は振付けが決める） */
  | "cast"
  /** みんなで「ジャン！」 */
  | "tada"
  /** お菓子を放る（`n` 粒） */
  | "candyBurst"
  /** ランタンがぽんっと出る（段1） */
  | "lanternIn"
  /** 「ばあ！」（段1。ふたが飛んで、おばけが飛び出す） */
  | "boo"
  /** 落ち着く（段1） */
  | "settle"
  /** ほうきのクロが飛び込み、こうもりが追いかけて入ってくる（段2） */
  | "batsIn"
  /** 古城と満月が昇る・後光が回り出す（段7） */
  | "castleRise"
  /** 赤じゅうたんが転がって伸びる（段7。`dur` 秒） */
  | "carpetRoll"
  /** 金の花火（`n` 発） */
  | "fireworks"
  /** 金の紙吹雪（`n` 枚を `dur` 秒かけて） */
  | "confetti";

export type Cue = {
  /** 秒。負なら終わりから */
  at: number;
  do: CueKind;
  /** 続く長さ（秒） */
  dur?: number;
  /** 数・強さ */
  n?: number;
  /** 行き先の値（暗さなど） */
  to?: number;
  color?: string;
};

/** ずらし終えた出来事。`t` は頭から数えた秒 */
export type TimedCue = Cue & { t: number };

/**
 * 台本の時刻を決める。負の時刻を終わりから数えに直し、`hitstop` のぶん後ろをずらし、
 * 時刻の順に並べる（同じ時刻は書いた順）。
 *
 * `shift: false` は、ずらさない（止めているあいだ進まない時計で出来事を起こす振付け用。
 * その時計は止めたぶん勝手に遅れるので、ここでもずらすと二重になる）。
 */
export function resolveScript(
  script: readonly Cue[],
  durationSec: number,
  shift = true
): TimedCue[] {
  /* 終わりから数える出来事は、終わりに付いていく（ずらさない）。ずらさない時計
     （止めたぶん遅れる時計）で見るときは、止めた合計だけ手前に置けば、壁の時計で
     ちょうど同じ所に来る */
  const stopped = script.reduce((a, c) => a + (c.do === "hitstop" ? c.dur ?? 0 : 0), 0);
  const base = script
    .map((c, i) => ({
      ...c,
      t: c.at < 0 ? durationSec + c.at - (shift ? 0 : stopped) : c.at,
      fromEnd: c.at < 0,
      i,
    }))
    .sort((a, b) => a.t - b.t || a.i - b.i);
  let delay = 0;
  const out: TimedCue[] = [];
  for (const c of base) {
    const { i: _i, fromEnd, ...cue } = c;
    out.push({ ...cue, t: fromEnd ? cue.t : cue.t + delay });
    if (c.do === "hitstop" && shift) delay += c.dur ?? 0;
  }
  return out.sort((a, b) => a.t - b.t);
}

/** その出来事の時刻（無ければ null） */
export const cueTime = (cues: readonly TimedCue[], kind: CueKind): number | null =>
  cues.find((c) => c.do === kind)?.t ?? null;

/** その出来事（無ければ null） */
export const cueOf = (cues: readonly TimedCue[], kind: CueKind): TimedCue | null =>
  cues.find((c) => c.do === kind) ?? null;

/**
 * 台本の決まりを確かめる。**破れている決まりの説明を返す**（空なら通る）。
 *
 * 1. どの出来事もアラートの中（0 秒から終わりまで）に収まる
 * 2. `reveal`（その人の絵）は演出の `revealSec` ちょうど
 * 3. 額は札が出てから数え上がり、数え終わった瞬間に「ドン」
 * 4. 締めは終わりまでに終わる
 */
export function scriptProblems(
  script: readonly Cue[],
  durationSec: number,
  revealSec: number
): string[] {
  const cues = resolveScript(script, durationSec);
  const out: string[] = [];
  for (const c of cues) {
    if (c.t < 0) out.push(`${c.do} が始まる前（${c.t}秒）`);
    if (c.t + (c.dur ?? 0) > durationSec + 1e-6) out.push(`${c.do} が終わりを越える（${c.t}+${c.dur ?? 0}秒）`);
  }
  const reveal = cueOf(cues, "reveal");
  if (revealSec > 0 && !reveal) out.push("reveal が無い（その人の絵が出ない）");
  if (reveal && Math.abs(reveal.t - revealSec) > 0.11) {
    out.push(`reveal（${reveal.t}秒）が revealSec（${revealSec}秒）と合わない`);
  }
  const plate = cueOf(cues, "plateIn");
  const count = cueOf(cues, "count");
  const don = cueOf(cues, "don");
  if (count && plate && count.t < plate.t) out.push("札が出る前に数え始める");
  if (count && !don) out.push("数え上げたのに「ドン」が無い");
  if (count && don && Math.abs(count.t + (count.dur ?? 0) - don.t) > 0.05) {
    out.push(`数え終わり（${count.t + (count.dur ?? 0)}秒）と「ドン」（${don.t}秒）がずれている`);
  }
  if (reveal && plate && reveal.t < plate.t) out.push("札より先にその人の絵が出る");
  return out;
}
