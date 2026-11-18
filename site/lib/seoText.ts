/**
 * **検索結果に出る題（`<title>`）と一文（`description`）を、面の事実から組む小道具。** #1199 の第2便・#1262
 *
 * 2026-11-18 の本番で、題が15字に届かない面が 89/143（「唐揚げ｜あやと島」の形）、一文が50字に届かない面が
 * 91/143 だった。検索結果では、名前と島の名前だけでは「何の面か」が分からない。
 *
 * ## 決めごと
 *
 * - **足すのは、その面に見えている事実だけ**（いつ・どこで・何本）。言い換えの水増しはしない（#1196）
 * - 題は `title.template`（`app/layout.tsx`）が後ろに「｜あやと島」（6字）を付ける。**付けたあと32字まで**を目安に、
 *   はみ出すなら後ろの添え書きから落とす（Google の検索結果は全角30字前後で切れる）
 * - 一文は 50〜120字。頭に事実、後ろに面の一言。120字を超えるなら頭を落とす（一言だけで 50字に届くなら）
 *
 * 見張りは `python/seo_audit.py` の `title-short` `desc-short`（`--expect prod`）。
 */

const SUFFIX = 6; // 「｜あやと島」
const TITLE_MAX = 32;
const DESC_MAX = 120;
const DESC_MIN = 50;

const len = (s: string) => [...s].length;

/** "2026-05-03" → "2026年5月" */
export function ym(d: string): string {
  const [y, m] = d.split("-");
  return `${y}年${Number(m)}月`;
}

/** "2026-05-03" → "2026年5月3日" */
export function ymd(d: string): string {
  const [y, m, day] = d.split("-");
  return `${y}年${Number(m)}月${Number(day)}日`;
}

/** 期間。同じ年なら後ろの年を省く（"2025年3月〜6月"）。終わりが無ければ「いま」 */
export function span(from: string, to?: string): string {
  if (!to) return `${ym(from)}〜いま`;
  const [fy] = from.split("-");
  const [ty] = to.split("-");
  if (ym(from) === ym(to)) return ym(from);
  return fy === ty ? `${ym(from)}〜${Number(to.split("-")[1])}月` : `${ym(from)}〜${ym(to)}`;
}

/** 題。候補を長い順に並べ、「｜あやと島」を付けて32字に収まる最初のもの（どれも収まらなければ最後） */
export function fitTitle(...cands: string[]): string {
  return cands.find((c) => len(c) + SUFFIX <= TITLE_MAX) ?? cands[cands.length - 1];
}

/**
 * 一文。頭（事実）＋本文。120字を超えるなら、本文だけで50字に届くときに限り頭を落とす。
 * それでも50字に届かなければ、`tail`（その面に在る節の一言）を足す
 */
export function lead(head: string, body: string, tail = ""): string {
  const both = `${head}${body}`;
  if (len(both) > DESC_MAX) return len(body) >= DESC_MIN ? body : both;
  return len(both) < DESC_MIN && tail ? `${both}${tail}` : both;
}
