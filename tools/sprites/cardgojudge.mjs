/**
 * `cardgo.mjs` の**判定だけ**。ブラウザも書き出しも本番の口も要らない。
 *
 * ここを別の本にしてあるのは、**毎 PR で当てるため。**
 * `cardgo.mjs` は本番の口とブラウザが要って PR には載せられないが、
 * 判定の正規表現は1文字直せば黙って穴が開き、穴が開いても出るのは「0件」で、
 * **0件はいちばん合格に見える**（`docs/island-standards.md` §15）。
 * 当てるのは `cardgo_selftest.mjs`（`python/selftest_runner.py` が拾う）。
 *
 * 足を1本ずつ折る `BREAK=` を持つ（`nolabel` / `nogap`）。
 */

/**
 * 欄の中の行き先が、**その人のカード以外**へ送っていないか。
 *
 * 欄は「その人がもらったカード」なので、そこに置いた
 * 「カードを、ぜんぶ見る」は**その人のぶん**と読まれる。だから、
 *
 *   - 行き先が**人を指していない**（合言葉を持たない一覧）で、
 *   - 字が**誰のぶんかを先に名乗っていない**
 *
 * ものを落とす。島ぜんぶへ送りたいなら、**字のほうで先に名乗る**
 * （「島のカードを、ぜんぶ見る」）。「あやと島カード」は品物の名前なので、
 * 名乗りにはならない——ここが、本番に出ていた字そのもの。
 *
 * @param {{字:string, 先:string}} a 欄の中の行き先1つ
 * @returns {boolean} 落とすなら true
 */
export function goesElsewhere(a) {
  // 判定の足を1本抜く（対照）。抜くと「見つからない」側へ倒れる
  if (process.env.BREAK === "nolabel") return false;
  const t = String(a?.字 ?? "").replace(/\s+/g, "");
  const ぜんぶ見せると言っている = /カード/.test(t) && /(ぜんぶ|すべて|全部|一覧)/.test(t);
  if (!ぜんぶ見せると言っている) return false;
  // 誰のぶんかを先に名乗っている。その人のぶんとは読めない
  if (/^(島の|みんなの|ほかの人の|全員の)/.test(t)) return false;
  // 行き先が人を指している（合言葉を持っている）。その人のぶんへ行ける
  if (/\?[A-Za-z0-9_-]+=[^&]+/.test(String(a?.先 ?? ""))) return false;
  return true;
}

/**
 * たどれた枚数と、口の言う枚数の食い違い。
 * @param {number} want 口（`GET /cards`）の言う枚数
 * @param {number} got 押せるだけ押して、見えた枚数
 * @returns {boolean} 食い違っていれば true
 */
export function reachGap(want, got) {
  if (process.env.BREAK === "nogap") return false;
  return want !== got;
}

/**
 * 終わりの終了コード。**0件と「数えていない」を混ぜない**
 * （`docs/island-standards.md` §15）。
 * @param {{missing:string[], bad:string[]}} x
 * @returns {0|1|2}
 */
export function verdict({ missing = [], bad = [] } = {}) {
  if (missing.length) return 2;
  if (bad.length) return 1;
  return 0;
}
