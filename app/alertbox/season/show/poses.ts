/**
 * あやとの仮装の「ポーズ絵」（1枚まるごとの透過 PNG）を読む。**形を確かめるだけで、描かない。**
 *
 * 段4〜7のあやとは、部品の切り絵ではなく見せ場ごとの1枚絵を**絵ごと**動かす（オーナーの指摘:
 * 切り絵の魔法使いは顔がつぶれ、ほうきにも乗れていなかった）。置き場は
 * `<テーマ>/poses/<仮装>/poses.json` と、そこに書いてある絵。
 *
 *   { faceW, poses: { <名前>: { file, size: [W, H], content: [x0, y0, x1, y1],
 *                              face: [x0, y0, x1, y1], faceCenter: [x, y], bottom: [x, y],
 *                              facing: "left" | "right" } } }
 *
 * - どのポーズも顔の幅を `faceW` にそろえてある（絵の担当の道具 `tools/alert-theme/poses.py`）。
 *   切り替えても顔の大きさが変わらないので、**顔の中心を合わせて**置き換える
 * - `facing` はほうきの進む向き。振付けは右向きにそろえて使う（左向きの絵は左右反転）
 */
import type { LoadedImage } from "../useSeason";

type Vec = [number, number];
type Box = [number, number, number, number];

export type PoseDef = {
  file: string;
  size: Vec;
  content: Box;
  face: Box;
  faceCenter: Vec;
  bottom: Vec;
  facing: "left" | "right";
};

/** 読み終わったポーズの組（絵はみな解読済み） */
export type LoadedPoses = {
  base: string;
  faceW: number;
  poses: ReadonlyMap<string, PoseDef & { img: LoadedImage }>;
};

const vec = (v: unknown): v is Vec => Array.isArray(v) && v.length === 2 && v.every((n) => typeof n === "number" && Number.isFinite(n));
const box = (v: unknown): v is Box => Array.isArray(v) && v.length === 4 && v.every((n) => typeof n === "number" && Number.isFinite(n));

/** poses.json を読む。形が違うポーズは捨てる。1つも無ければ null */
export function parsePoses(json: unknown): { faceW: number; poses: Record<string, PoseDef> } | null {
  if (!json || typeof json !== "object") return null;
  const o = json as Record<string, unknown>;
  const raw = o.poses;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const out: Record<string, PoseDef> = {};
  for (const [name, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!v || typeof v !== "object") continue;
    const p = v as Record<string, unknown>;
    if (typeof p.file !== "string" || !p.file) continue;
    if (!vec(p.size) || !box(p.content) || !box(p.face) || !vec(p.faceCenter) || !vec(p.bottom)) continue;
    out[name] = {
      file: p.file,
      size: p.size,
      content: p.content,
      face: p.face,
      faceCenter: p.faceCenter,
      bottom: p.bottom,
      facing: p.facing === "left" ? "left" : "right",
    };
  }
  if (!Object.keys(out).length) return null;
  const faceW = typeof o.faceW === "number" && o.faceW > 0 ? o.faceW : 300;
  return { faceW, poses: out };
}
