import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import type { MapBBox, MapBeyond, MapDir, Pic } from "./types";

/**
 * **描いた絵の置き場（`public/guide/<国>/<街>/manifest.json`）を読む。** 書き出すときに1回だけ。
 *
 * 表紙・エリア地図・料理・土産の絵は、別の担当が ChatGPT で描いて置く（#1228 Q1 の A）。
 * 置き場の形:
 *
 * ```json
 * {
 *   "cover": { "src": "cover.webp", "w": 1600, "h": 1000, "alt": "…" },
 *   "cover_tall": { "src": "cover-tall.webp", "w": 900, "h": 1200, "alt": "…" },
 *   "areamap": { "src": "areamap.webp", "w": 1200, "h": 1200, "alt": "…",
 *                "areas": [{ "id": "center", "name": "中心（セルディカ）", "x": 0.52, "y": 0.44 }] },
 *   "food": { "<料理の id>": { "src": "…", "src_small": "…", "w": 800, "h": 800, "alt": "…", "kind": "…" } },
 *   "buy": { "<土産の id>": { … } }
 * }
 * ```
 *
 * - `src` は置き場からの相対（`cover.webp`）か、`/` で始まる道。**ファイルが無ければ使わない**
 *   （壊れた絵の枠を出さない。面の側は借りた写真か、色の地の札に落ちる）
 * - エリアの `x` `y` は名前の札を置く位置。0〜1 の割合（100 までなら百分率、それより大きければ絵の画素）
 * - 料理と土産の鍵は、データの `Item.id`（ラテン文字）。合わない鍵は使わない（面の側で数えて出す）
 * - エリア地図の `bbox`（北・南・東・西の緯度経度）が在れば、見たいものの座標を絵の上に直して**写真のピン**を立てる。
 *   `beyond` は絵の外の所（向きの矢印。形は `types.ts` の `MapBeyond`）。どちらも見どころマップ（`spotmap.ts`）が使う
 *
 * **字は絵に焼かない**（`docs/guide-design.md` 4-2）。エリアの名前・ピン・矢印は面の側で重ねる。
 */
export type AreaPin = { id?: string; name?: string; x: number; y: number };
export type Drawn = {
  cover?: Pic;
  coverTall?: Pic;
  areamap?: Pic & { areas: AreaPin[]; bbox?: MapBBox; beyond: MapBeyond[] };
  food: Record<string, Pic>;
  buy: Record<string, Pic>;
};

const DIRS: MapDir[] = ["n", "ne", "e", "se", "s", "sw", "w", "nw"];

type Raw = Record<string, unknown>;

const isObj = (v: unknown): v is Raw => typeof v === "object" && v !== null && !Array.isArray(v);
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);

export function readDrawn(country: string, city: string): Drawn {
  const base = `/guide/${country}/${city}`;
  const pub = join(process.cwd(), "public");
  const empty: Drawn = { food: {}, buy: {} };
  const file = join(pub, base, "manifest.json");
  if (!existsSync(file)) return empty;
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(file, "utf8"));
  } catch (e) {
    /* **黙って絵なしに落とさない。** 置き場が壊れているのは、描く担当が直すべきこと */
    throw new Error(`content/guidebook/manifest.ts: ${base}/manifest.json が読めない（${String(e)}）`);
  }
  if (!isObj(raw)) return empty;

  /** 置き場の道を、面から読める道へ。**ファイルが在るときだけ** */
  const url = (v: unknown) => {
    const s = str(v);
    if (!s || /^https?:/.test(s)) return undefined;
    const p = s.startsWith("/") ? s : `${base}/${s}`;
    return existsSync(join(pub, p)) ? p : undefined;
  };
  const pic = (v: unknown): Pic | undefined => {
    if (!isObj(v)) return undefined;
    const src = url(v.src);
    if (!src) return undefined;
    return {
      src,
      small: url(v.src_small) ?? undefined,
      w: num(v.w),
      h: num(v.h),
      alt: str(v.alt) ?? "",
      kind: "illust",
    };
  };
  const dict = (v: unknown) => {
    const out: Record<string, Pic> = {};
    if (isObj(v)) for (const [k, x] of Object.entries(v)) {
      const p = pic(x);
      if (p) out[k] = p;
    }
    return out;
  };

  const out: Drawn = { cover: pic(raw.cover), coverTall: pic(raw.cover_tall), food: dict(raw.food), buy: dict(raw.buy) };
  const am = isObj(raw.areamap) ? raw.areamap : undefined;
  const amPic = pic(am);
  if (am && amPic) {
    const w = amPic.w ?? 1;
    const h = amPic.h ?? 1;
    /* 位置の単位は3通り読む（割合・百分率・画素）。**描く側の書きかたに、面を縛られない** */
    const unit = (v: number, size: number) => (v <= 1 ? v : v <= 100 ? v / 100 : v / size);
    const areas = (Array.isArray(am.areas) ? am.areas : []).flatMap((a): AreaPin[] => {
      if (!isObj(a)) return [];
      const x = num(a.x);
      const y = num(a.y);
      if (x === undefined || y === undefined) return [];
      return [{ id: str(a.id), name: str(a.name), x: unit(x, w), y: unit(y, h) }];
    });
    /* 範囲は4つ揃って、北＞南・東＞西のときだけ使う。**崩れた範囲でピンを打たない**（違う所を指すピンは、無いより悪い） */
    const b = isObj(am.bbox) ? am.bbox : undefined;
    const bb = b && { north: num(b.north), south: num(b.south), east: num(b.east), west: num(b.west) };
    const bbox =
      bb && bb.north !== undefined && bb.south !== undefined && bb.east !== undefined && bb.west !== undefined && bb.north > bb.south && bb.east > bb.west
        ? (bb as MapBBox)
        : undefined;
    if (b && !bbox) throw new Error(`content/guidebook/manifest.ts: ${base}/manifest.json の areamap.bbox が崩れている`);
    const beyond = (Array.isArray(am.beyond) ? am.beyond : []).flatMap((a): MapBeyond[] => {
      if (!isObj(a)) return [];
      const id = str(a.id);
      const name = str(a.name);
      const x = num(a.x);
      const y = num(a.y);
      const dir = DIRS.find((d) => d === a.dir);
      /* 欠けた矢印は**黙って落とさない**（描く担当が直すべきこと） */
      if (!id || !name || x === undefined || y === undefined || !dir)
        throw new Error(`content/guidebook/manifest.ts: ${base}/manifest.json の areamap.beyond に欠けた所がある（${JSON.stringify(a)}）`);
      return [{ id, name, local: str(a.local), lat: num(a.lat), lon: num(a.lon), x: unit(x, w), y: unit(y, h), dir }];
    });
    out.areamap = { ...amPic, areas, bbox, beyond };
  }
  return out;
}
