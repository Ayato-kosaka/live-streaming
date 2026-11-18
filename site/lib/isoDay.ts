/**
 * **`<time>` に、機械が読める日付（`dateTime`）を添えるための1つ。**
 *
 * ## なぜ要るか
 *
 * 2026-11-13 に本番の 149面を JS なしで読んだら、`<time>` を持つのに `dateTime` が
 * 1つも無い面が **104/149** あった（`python/seo_audit.py`）。画面の字は `2026/08/21` で、
 * 人には読めるが、`<time>` の中身としては決まりの形ではない。`dateTime` が無い `<time>` は
 * 「中の字がそのまま日付として読めること」が条件なので、**読めない日付を名乗っていた。**
 *
 * ## 通すのは、データが持っている日付だけ
 *
 * `2026-08-21`（日）・`2026-08`（月）・`2026`（年）の3つの形で、暦に在る日だけを返す。
 * それ以外（空・`2026/8/2 – 8/16` のような期間の字・暦に無い日）は `undefined` を返す
 * ——React は `undefined` の属性を書き出さないので、**分からない日付は付かない。**
 * 嘘の日付を機械に渡すより、無いほうがよい。
 *
 * ## サーバとブラウザで同じ字になる
 *
 * 時計を読まない。渡された字だけを見る。焼いた HTML と、ブラウザの最初の描画で
 * 答えが変わらないので、水あわせは崩れない（`lib/builtAt.ts` の頭と同じ心配）。
 *
 * ## 期間を1つの `<time>` に入れている所には、付けない
 *
 * `dateTime` は1つの時点しか言えない。期間の頭の日を入れると、
 * 見えている字（「10/1〜10/30」）と機械に渡す値（10/1）が食い違う。
 * 期間は `<time>` を2つに割る直しが要るので、見た目を動かさない便では触らない。
 */
export function isoDay(s: string | null | undefined): string | undefined {
  if (!s) return undefined;
  const m = /^(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?$/.exec(s);
  if (!m) return undefined;
  const [y, mo, d] = [Number(m[1]), Number(m[2] ?? 1), Number(m[3] ?? 1)];
  // 暦に在るか。`Date.UTC` は 2月30日を3月2日に繰り上げるので、戻して同じかで見る
  const at = new Date(Date.UTC(y, mo - 1, d));
  if (at.getUTCFullYear() !== y || at.getUTCMonth() !== mo - 1 || at.getUTCDate() !== d) return undefined;
  return s;
}
