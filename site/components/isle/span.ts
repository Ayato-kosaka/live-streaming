/**
 * 島の期間を、字にする。
 *
 * **「〜いま」は、次の章が始まった日で閉じる。** 閉じ方を持っているのは
 * `content/chapters.ts` の `chapterSpan()` ひとつだけで、ここはその答えを
 * 字にするだけ。前は面ごとに `c.to` を直に見ていたので、旅に出た瞬間から
 * **過去の島が「2025年6月からいままでいた島。」と言い続けていた。**
 *
 * サーバ（焼き込み）とクライアント（画面が出てから）の両方が呼ぶので、
 * どちらでもないこのファイルに置く（`docs/island-misses.md` #22）。
 * `components/isle/spec.ts` に置くと、あちらは配信の一覧やアプリの年表まで
 * 連れているので、島の面のJSがまるごと太る。
 */

import { chapterSpan, type Chapter } from "@/content/chapters";

/** 「2025年6月」。日本時間で読む */
function ym(t: number): string {
  const d = new Date(t + 9 * 3600000);
  return `${d.getUTCFullYear()}年${d.getUTCMonth() + 1}月`;
}

/** 紙の見出しの添え字。「2025年6月 〜 2026年9月」 */
export function isleSpanNote(c: Chapter, today: Date = new Date()): string {
  const { from, to } = chapterSpan(c, today);
  if (from == null) return "これから";
  return `${ym(from)} 〜 ${to == null ? "いま" : ym(to)}`;
}

/**
 * 「2025年6月から2026年9月まで」。まだ始まっていない島は空。
 *
 * **`c.from` を直に割らない。** 章の表に日付が入るのは、旅から帰ってきたとき。
 * 空欄のまま `"".split("-")` を数にすると「年NaN月」が出る。
 */
export function isleSpanRange(c: Chapter, today: Date = new Date()): string {
  const { from, to } = chapterSpan(c, today);
  if (from == null) return "";
  return to == null ? `${ym(from)}からいままで` : `${ym(from)}から${ym(to)}まで`;
}

/** 島の1行目。「2025年6月から2026年9月までいた島。」 */
export function isleLead(c: Chapter, today: Date = new Date()): string {
  const r = isleSpanRange(c, today);
  /* まだ始まっていない島。**時点を言わない。** 「まだ誰も上陸していない」と書くと、
     出発した日から章の表に日付が入るまで、歩いている島が空き島に読める（#140）。 */
  return r ? `${r}いた島。` : "これから建っていく島。";
}
