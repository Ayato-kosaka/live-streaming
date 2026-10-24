/**
 * 名前の札の文面。いまの文面の型（`config.ts` の `messageTemplate`、
 * `{名前} 様 {金額}{単位} ありやとう！！`）を**2行に割る**。
 *
 *   1行目: `{名前} 様`               … 名前のまとまり
 *   2行目: `{金額}{単位} ありやとう！！` … 額から後ろ
 *
 * 割り目は「`{金額}` の手前」。型が変わっても（語尾が変わっても）付いていく。
 * `{金額}` の無い型は1行のまま。
 */

export type PlateSeg =
  | { kind: "text"; text: string }
  | { kind: "name"; text: string }
  | { kind: "amount"; text: string; value: number }
  | { kind: "unit"; text: string };

export type PlateLines = { name: PlateSeg[]; amount: PlateSeg[] };

export function splitPlateText(
  template: string,
  v: { name: string; amount: number; unit: string }
): PlateLines {
  const parts = template.split(/(\{.*?\})/).filter((p) => p !== "");
  const seg = (p: string): PlateSeg => {
    if (p === "{名前}") return { kind: "name", text: v.name };
    if (p === "{金額}") return { kind: "amount", text: v.amount.toLocaleString("ja-JP"), value: v.amount };
    if (p === "{単位}") return { kind: "unit", text: v.unit };
    return { kind: "text", text: p };
  };
  const cut = parts.indexOf("{金額}");
  const head = (cut < 0 ? parts : parts.slice(0, cut)).map(seg);
  const tail = cut < 0 ? [] : parts.slice(cut).map(seg);
  return { name: trimEnds(head), amount: trimEnds(tail) };
}

/** 行の頭と終わりの空白を落とす（割り目に残った1字の空白） */
function trimEnds(segs: PlateSeg[]): PlateSeg[] {
  const out = segs.map((s) => ({ ...s }));
  if (out.length && out[0].kind === "text") out[0].text = out[0].text.replace(/^\s+/, "");
  const last = out[out.length - 1];
  if (last && last.kind === "text") last.text = last.text.replace(/\s+$/, "");
  return out.filter((s) => s.kind !== "text" || s.text !== "");
}

/** 行をただの字にする（読み上げ・確かめ用） */
export const plainLine = (segs: PlateSeg[]) => segs.map((s) => s.text).join("");
