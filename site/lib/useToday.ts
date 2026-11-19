import { useEffect, useState } from "react";

/**
 * 画面が出るまでの「数のかわり」。**改行しない空白1文字。**
 *
 * 1行ぶんの背だけ取って、字は出さない（`components/ui/Say.tsx` と同じ取り方）。
 * 何も置かないと、札の大きい数字の段（`.stat b`）が 0px に潰れて、
 * 数が届いた瞬間に札が伸びる（`docs/island-misses.md` #146）。
 */
export const NOT_YET = " ";

/**
 * 今日。**焼いた HTML と、画面が出た最初の1枚では `null`。**
 *
 * 「旅に出て ◯日目」「旅した日数 ◯」のような**今日から数える数**は、
 * `null` のあいだ出さない。`BUILT_AT`（焼いた日）で数えたものを先に出すと、
 * その字が本当なのは**焼いた日のうちだけ**——翌日に開いた人の JS が動く前の
 * 1瞬と、JS を読まない読み手（OGP・検索の下見）には、きのうの数が出る
 * （`docs/island-misses.md` #337。焼いてから数える前に日付をまたいだ晩、
 * 重い見張りの `preclaim.mjs` が `/travel` の「旅に出て 53日目」で赤くなった）。
 *
 * **段（旅のとちゅうか・終わったか）は別。** あちらは焼いた日の段で焼いてよい
 * （#336 の決めごと4）。数だけが、焼いた日の答えを持ち出してはいけない。
 *
 * 1回で終わらせず、1分に1度引き直す。配信のあいだ開きっぱなしの面が、
 * 日付をまたいだ瞬間から1日ずれるので（`components/isle/ChapDays.tsx` と同じ刻み）。
 */
export function useToday(): Date | null {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    const tick = () => setNow(new Date());
    tick();
    const id = setInterval(tick, 60_000);
    return () => clearInterval(id);
  }, []);
  return now;
}
