/**
 * 書き出した時刻。**焼いた HTML の「今日」。**
 *
 * `output: "export"` なので、画面が出るまでは本物の今日が分からない。
 * そのあいだを `new Date()` で埋めると、**焼いた HTML とブラウザの最初の描画で
 * 答えが変わる**（焼いたのが「440日」、開いた日は「441日」）。字が食い違うので
 * React が水あわせに失敗して、面ごと描き直す（`Minified React error #418`）。
 *
 * 分からないなりに、いちばん近い答えは**焼いた日**なので、最初の描画はこれで出す。
 * 本物の今日で描き直すのは、画面が出てから（`useEffect`）。
 *
 * 値は `next.config.mjs` が埋める。埋まっていない（開発サーバ）ときは 1970年で、
 * これまでどおり「全部これから」に落ちる。
 *
 * ## なぜ、これだけで1つのファイルなのか
 *
 * **`lib/nightly.ts` に置いていたら、輪ができた。**
 * `content/chapters.ts` が焼いた日を読み（`NOW_CHAPTER`）、
 * `lib/nightly.ts` が旅の期間を読む（`looseStartNow`）ので、
 * chapters ⇄ nightly の輪になる。輪の中の `const` は、読み込む順によっては
 * まだ値の入っていないところを見にいって落ちる
 * （`ReferenceError: Cannot access 'u' before initialization`。
 * 実際に `/nordic/lithuania` が真っ白になった）。
 *
 * **どちらからも読まれる値は、どちらでもないファイルに置く**
 * （`docs/island-misses.md` #22 と同じ形）。ここは何も import しない。
 */
export const BUILT_AT = new Date(process.env.NEXT_PUBLIC_BUILT_AT ?? 0);
