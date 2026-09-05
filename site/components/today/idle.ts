/**
 * 島が落ち着いてから走らせる。
 *
 * 島に降りる演出は 3.4 秒あって、そのあいだは毎フレーム絵を描いている。
 * ここで fetch と再描画を割り込ませると、起動が目に見えて重くなる。
 * 手が空いたら走らせる（`requestIdleCallback`）。空かなければ、決めた時間で諦めて走らせる。
 *
 * 「今夜のおたずね」と「今日ここに来た人」の2つが同じ待ち方をするので、
 * 待ち方だけをここに出してある。**待つ長さも1か所で決める。**
 * 別々に持つと、島の起動に割り込む時刻が2つできる。
 */

/** 手が空くのを待つ上限。これを過ぎたら、空いていなくても走らせる。 */
const IDLE_WAIT = 5000;

/** `requestIdleCallback` が無い端末（Safari など）で待つ時間。演出の終わりに合わせる。 */
const FALLBACK_WAIT = 3600;

type Ric = {
  requestIdleCallback?: typeof requestIdleCallback;
  cancelIdleCallback?: (h: number) => void;
};

/** 走らせるものを渡すと、やめ方（後片づけ）が返る。 */
export function whenIdle(run: () => void): () => void {
  const w = window as unknown as Ric;
  if (w.requestIdleCallback) {
    const id = w.requestIdleCallback(run, { timeout: IDLE_WAIT });
    return () => w.cancelIdleCallback?.(id);
  }
  const t = setTimeout(run, FALLBACK_WAIT);
  return () => clearTimeout(t);
}
