/**
 * **いま出ている島の根っこを、名前を決め打ちせずに見つける。**
 *
 * 表紙の島は章で入れ替わる（`site/components/isle/Cover.tsx`）。
 * 手で作った島（`components/island/IslandStage.tsx`）は `.stage`、
 * 章から組み上げる島（`components/isle/IsleStage.tsx`）は `.isle` で、
 * **どちらが焼かれるかはビルドした日の章で決まる。**
 *
 * 道具の中にどちらか一方を書くと、入れ替わった日から落ちる。実際に
 * `island.mjs` と `og.mjs` が `.stage` を待ったまま止まっていた
 * （`docs/island-misses.md` #132）。だから**名前を書かず、出ているほうを探す。**
 *
 * 2つ以上の道具が同じ探し方を持つとそこで散るので、ここ1か所に置く
 * （#131 の決めごと3）。
 */

/** 島ごとの、道具が触るところの名前。**上から順に探して、最初に見つかったものを使う。** */
export const STAGES = [
  {
    kind: "isle",
    root: ".isle",
    mark: ".isle-mark",
    badge: ".isle-badge",
    zoom: ".isle-view",
    /** 共有画像には要らないもの（隅の道具・案内・吹き出し・今日の板） */
    chrome: ".isle-tools,.isle-hint,.isle-talk,.isle-today,.today,.scroll-cue",
  },
  {
    kind: "island",
    root: ".stage",
    mark: ".spot-mark",
    badge: ".spot-badge",
    zoom: ".stage-view",
    chrome: ".island-bar,.walk-hint,.scroll-cue,.chatter,.who-call,.stage-tools,.today",
  },
];

/**
 * 島が出るまで待って、その島の名前の表を返す。
 *
 * **見つからなかったら投げる。** 黙って null を返すと、呼んだ側が
 * 「島が無い」と「島を見ていない」を区別できない（`docs/island-standards.md` §15）。
 * 投げる文には**探した名前を全部**入れる——次に島の名前が変わったとき、
 * 何を探して駄目だったかがログに残らないと、また同じ半日が要る。
 */
export async function findStage(page, timeout = 20000) {
  /* **直す前の測りかたを再現する。** `BREAK=stageonly` を渡すと `.stage` しか
     探さない＝落ちていたころの島の探し方に戻る。いまの島（`.isle`）に当てると
     必ず 2 で落ちるので、「探し方を直したから通った」ことを両側から見られる
     （`docs/island-standards.md` §15 の対照）。 */
  const list = process.env.BREAK === "stageonly" ? STAGES.filter((s) => s.root === ".stage") : STAGES;
  const found = await Promise.race([
    ...list.map((s) =>
      page
        .waitForSelector(s.root, { timeout, state: "attached" })
        .then(() => s)
        .catch(() => new Promise(() => {})),
    ),
    new Promise((res) => setTimeout(() => res(null), timeout + 500)),
  ]);
  if (!found) {
    throw new Error(
      `島が見つかりません。探した名前: ${list.map((s) => s.root).join(" / ")}。` +
        `島の根っこの class が変わったなら tools/sprites/stage.mjs の STAGES に足す`
    );
  }
  return found;
}
