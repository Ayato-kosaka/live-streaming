/**
 * 「島に降りた日」の覚え書き。
 *
 * **鍵の名前を、島ごとに書き写さない。** この1行を読む人が3人いる。
 *
 *   - 手で作った島（`components/island/IslandStage.tsx`）… 到着の演出を出すかどうか
 *   - 章から組む島（`components/isle/IsleStage.tsx`）… 表紙のときだけ書き留める
 *   - 今日の板（`components/today/Today.tsx`）… 「前に来てから、あったこと」を出すかどうか
 *
 * 島が入れ替わっても、島に降りたことは同じ1つの事実。**書く側が2つに分かれたときに、
 * 片方だけが書くと、旅のあいだ「前に来てから」が二度と出なくなる。**
 * 出どころをここ1つにして、どちらの島から降りても同じ鍵に同じ形で入るようにする。
 */

import { jstNow } from "@/lib/nightly";

/** 最後に島へ降りた日（JST の YYYY-MM-DD）。 */
export const VISITED = "ayato-island-arrived";

/**
 * 「今日、島に降りた」を書き留める。
 *
 * **読ませてから書く。** 今日の板はこの値を見て「初めての人には自分から開かない」を
 * 決めているので、板が読む前に書くと、初めて来た人が2回目の人に見える
 * （`components/today/Today.tsx`）。React は子の効果を先に走らせるので、
 * 島（親）の効果から呼べば順番は守られる。
 */
export function rememberVisit(): void {
  try {
    localStorage.setItem(VISITED, jstNow().date);
  } catch {
    /* プライベートモードなどで書けなくても、次にもう一度演出が出るだけ */
  }
}
