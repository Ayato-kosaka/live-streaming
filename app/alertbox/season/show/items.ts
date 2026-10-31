/**
 * 段の小物（1枚絵。古城と満月・赤じゅうたん・金の紙吹雪・墓石…）を読む。**形を確かめるだけで、描かない。**
 *
 * 置き場は `<テーマ>/items/<仮装>/items.json` と、そこに書いてある絵（絵の担当の取り決め）:
 *
 *   { items: { <名前>: { file, size: [W, H], content: [x0, y0, x1, y1], about } } }
 *
 * - content は透明でない画素の外接矩形（絵の左上からの px）。置くときは中身の大きさで合わせる
 * - 読み方はポーズ絵と同じ: 開いたときは落とすだけ、その段の投げ銭が来たら展開する（`useSeason.ts`）
 */
import type { LoadedImage } from "../useSeason";

type Vec = [number, number];
type Box = [number, number, number, number];

export type ItemDef = { file: string; size: Vec; content: Box };

/** 読み終わった小物の組（絵はみな解読済み） */
export type LoadedItems = {
  base: string;
  items: ReadonlyMap<string, ItemDef & { img: LoadedImage }>;
};

const vec = (v: unknown): v is Vec => Array.isArray(v) && v.length === 2 && v.every((n) => typeof n === "number" && Number.isFinite(n));
const box = (v: unknown): v is Box => Array.isArray(v) && v.length === 4 && v.every((n) => typeof n === "number" && Number.isFinite(n));

/** items.json を読む。形が違う小物は捨てる。1つも無ければ null */
export function parseItems(json: unknown): Record<string, ItemDef> | null {
  if (!json || typeof json !== "object") return null;
  const raw = (json as Record<string, unknown>).items;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const out: Record<string, ItemDef> = {};
  for (const [name, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!v || typeof v !== "object") continue;
    const p = v as Record<string, unknown>;
    if (typeof p.file !== "string" || !p.file || !vec(p.size)) continue;
    // 中身の外接矩形が無ければ絵の全体
    const content: Box = box(p.content) ? p.content : [0, 0, p.size[0], p.size[1]];
    out[name] = { file: p.file, size: p.size, content };
  }
  return Object.keys(out).length ? out : null;
}
