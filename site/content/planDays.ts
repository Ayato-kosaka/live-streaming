import { PLANS, type PlanBrief } from "./plans";
import { DAY_PAGES, dayHref, dayName } from "./nordic";

/**
 * 日付 → その日の企画。**あやと島カードが引く表（#173・#202）。**
 *
 * カードは「その日の画像 × その日に投げてくれた人」でできていて、
 * 企画とは日付で結んでいる。ここは、その日付から名前を引くための表。
 *
 * ## なぜ `plans.ts` から出したか
 *
 * **企画は `content/plans.ts` だけにあるのではない。** #202 で
 * 「北欧◯日目」も企画になった（`islandStreamEvent` に1日1件ある）。
 * 9月11日は運営側の企画が**4本**立っていて、内訳はこう。
 *
 * | 企画 | どこから |
 * | --- | --- |
 * | ジョージアバイバイ | `PLANS` |
 * | 海外出発二周年記念日 | `PLANS` |
 * | ヒッチハイクで北欧へ | `PLANS` |
 * | 北欧旅 出発 | `DAYS`（旅程表） |
 *
 * `plans.ts` の中で旅程表を読むことはできない。**旅程表のほうが
 * `plans.ts` を読んでいる**ので、逆向きに読ませると輪になる。
 * 2つを知っている表として、外に1枚置く。
 *
 * ## 1日に何本でも立つ
 *
 * 前は `Object.fromEntries` で1日1本にしていた。**同じ日の企画は
 * 最後の1本が勝って、残りは黙って消えていた**（9/11 は `nordic` だけが
 * 残り、あとの2本がどこにも出なかった）。消えたことは画面に出ないので、
 * 見て気づけない。配列で持つ。
 *
 * **`until` を持つ長い企画は、始まった日にしか付かない。**
 * 10日ものを毎日に付けると、旅の写真ぜんぶに同じ名前が並ぶ。
 * 全部に付く名前は、何も言っていないのと同じ。旅程表のほうは
 * 1日ずつ中身が違うので、こちらは日ごとに付ける。
 *
 * ここを画面（client）から直に読まない。この表を作るために `PLANS`
 * （20KB）と旅程表（44KB）を連れていくことになる。
 * **面（server）で引いて、値だけ渡す。**
 */
export const PLAN_BY_DAY: Record<string, PlanBrief[]> = (() => {
  const out: Record<string, PlanBrief[]> = {};
  const put = (date: string | undefined, brief: PlanBrief) => {
    if (!date) return;
    (out[date] ??= []).push(brief);
  };
  for (const p of PLANS) {
    // 専用の面があるものはそちら、無ければ一覧のその行へ
    put(p.date, { title: p.title, href: p.href ?? `/next#${p.id}` });
  }
  /* 旅の1日ずつ。**ページのある日だけ。** ストックホルムの7泊には道が
     無く（`DAY_PAGES`）、札にすると開けない行き先になる。
     名前は「北欧旅 出発」「北欧旅 3日目」。旅程表の中では「3日目」で
     足りるが、カードは島じゅうの並びに出るので、何の3日目かを付ける。 */
  for (const d of DAY_PAGES) {
    put(d.date, { title: `北欧旅 ${dayName(d)}`, href: dayHref(d) });
  }
  return out;
})();
