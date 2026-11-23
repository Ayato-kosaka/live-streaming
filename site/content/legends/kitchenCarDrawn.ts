import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import type { Pic } from "@/content/guidebook/types";

import type { KitchenCarBook } from "./kitchenCarTypes";

/**
 * **ノマドキッチンカーの面の描いた絵**（`public/legends/nomad-kitchen-car/`。置き場の決まりは材料の README「絵の置き場」）。
 * 書き出すときに1回だけ読む。**ファイルが無い絵は使わない**（壊れた絵の枠を出さない。絵が無いあいだは枠ごと出さない）。
 *
 * 置き場は3つに分かれていて、書く人が1人ずつ:
 *
 * | 何 | 置き場 | 書く人 |
 * | --- | --- | --- |
 * | 紙面の絵（表紙・絵地図・景色・食べ物・車の候補） | `manifest.json`（形はインドの `drawn.ts` の頭と同じ。組は cover map views foods vehicles） | 絵の道具の finalize |
 * | 外装と内装の型（3D に貼る1枚）と色 | `skins.json`（`{ <組>: { src, src1024, w, h, alt, interior: { src, w, h, alt }, colors, valance } }`） | `tools/van3d/skin_pack.py` |
 * | 3D の静止画 | 名前の決まり `stills/<組>-<day｜open｜dusk｜peek>.webp`（800×600。一覧のファイルを持たない） | Actions |
 *
 * finalize は manifest.json を知っている鍵だけで毎回書き直すので、外装・内装・静止画の鍵を manifest.json に足さない（足すと消える）。
 * manifest.json に無い紙面の絵は、決まった名前のファイル（`views/<id>.webp` など）が在れば使う。
 */
export type KcStill = "day" | "open" | "dusk" | "peek";
export const STILLS: KcStill[] = ["day", "open", "dusk", "peek"];

/** 外装と内装の組1つの絵（3D の舞台にそのまま渡せる形。無い欄は無地の色だけになる） */
export type KcLookArt = {
  id: string;
  exterior?: string;
  exterior1024?: string;
  interior?: string;
  colors?: { body: string; accent: string; awning: string[] };
  valance?: string;
  /** 静止画（在る姿だけ） */
  stills: Partial<Record<KcStill, string>>;
};

export type KitchenDrawn = {
  cover?: Pic;
  map?: Pic;
  views: Record<string, Pic>;
  foods: Record<string, Pic>;
  vehicles: Record<string, Pic>;
  looks: Record<string, KcLookArt>;
};

type Raw = Record<string, unknown>;
const isObj = (v: unknown): v is Raw => typeof v === "object" && v !== null && !Array.isArray(v);
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);

/** 置き場の JSON を読む。**無ければ空、壊れていれば止める**（黙って絵なしに落とさない。直すのは書いた道具） */
function readJson(file: string, name: string): Raw {
  if (!existsSync(file)) return {};
  try {
    const j = JSON.parse(readFileSync(file, "utf8"));
    return isObj(j) ? j : {};
  } catch (e) {
    throw new Error(`content/legends/kitchenCarDrawn.ts: ${name} が読めない（${String(e)}）`);
  }
}

export function readKitchenDrawn(b: KitchenCarBook): KitchenDrawn {
  const base = `/legends/${b.slug}`;
  const pub = join(process.cwd(), "public");
  const manifest = readJson(join(pub, base, "manifest.json"), `${base}/manifest.json`);
  const skins = readJson(join(pub, base, "skins.json"), `${base}/skins.json`);
  /** 置き場の中の道。外の URL と、ファイルの無い道は使わない */
  const url = (v: unknown) => {
    const s = str(v);
    if (!s || /^https?:/.test(s)) return undefined;
    const p = s.startsWith("/") ? s : `${base}/${s}`;
    return existsSync(join(pub, p)) ? p : undefined;
  };
  const pic = (v: unknown, fallback: string, alt: string): Pic | undefined => {
    const o = isObj(v) ? v : {};
    const src = url(o.src) ?? url(fallback);
    if (!src) return undefined;
    return { src, small: url(o.src_small) ?? url(fallback.replace(/\.webp$/, "-small.webp")), w: num(o.w), h: num(o.h), alt: str(o.alt) ?? alt, kind: "illust" };
  };
  const group = (key: "views" | "foods" | "vehicles", rows: { id: string; name: string }[]) => {
    const raw = isObj(manifest[key]) ? (manifest[key] as Raw) : {};
    const out: Record<string, Pic> = {};
    for (const r of rows) {
      const p = pic(raw[r.id], `${key}/${r.id}.webp`, r.name);
      if (p) out[r.id] = p;
    }
    return out;
  };
  const looks: Record<string, KcLookArt> = {};
  for (const l of b.looks) {
    const s = isObj(skins[l.id]) ? (skins[l.id] as Raw) : {};
    const inner = isObj(s.interior) ? (s.interior as Raw) : {};
    const c = isObj(s.colors) ? (s.colors as Raw) : undefined;
    const awning = c && Array.isArray(c.awning) ? c.awning.filter((x): x is string => typeof x === "string") : [];
    const stills: Partial<Record<KcStill, string>> = {};
    for (const st of STILLS) {
      const p = url(`stills/${l.id}-${st}.webp`);
      if (p) stills[st] = p;
    }
    looks[l.id] = {
      id: l.id,
      ...(url(s.src) ? { exterior: url(s.src) } : {}),
      ...(url(s.src1024) ? { exterior1024: url(s.src1024) } : {}),
      ...(url(inner.src) ? { interior: url(inner.src) } : {}),
      ...(c && str(c.body) && str(c.accent) ? { colors: { body: str(c.body)!, accent: str(c.accent)!, awning } } : {}),
      ...(str(s.valance) ? { valance: str(s.valance) } : {}),
      stills,
    };
  }
  return {
    cover: pic(manifest.cover, "cover.webp", b.meta.h1),
    map: pic(manifest.map, "map.webp", b.sections.route),
    views: group("views", b.views.map((v) => ({ id: v.id, name: v.title }))),
    foods: group("foods", b.foods),
    vehicles: group("vehicles", b.vehicles),
    looks,
  };
}

/** 描いた絵（紙面の絵・外装と内装の柄）が1枚でも在るか（出どころの欄の「AI で描いた」1行を出すか） */
export const drewAny = (d: KitchenDrawn) =>
  !!(d.cover || d.map || Object.keys(d.views).length || Object.keys(d.foods).length || Object.keys(d.vehicles).length) ||
  Object.values(d.looks).some((l) => l.exterior || l.interior);

/**
 * **絵の無い紙面を、下書きのあいだだけ許す**（インドの `drawn.ts` の `mustBeDrawn` と同じ決まり）。
 * 下書きの面は検索にも島のどこにも出ない（M-33）ので、絵が来るまでは枠ごと出さずに組み立てる。
 * **印を外す日に、表紙・絵地図・景色・食べ物・車の候補の1枚でも無ければ、書き出しを止める**
 */
export function mustBeDrawnKitchen(b: KitchenCarBook, d: KitchenDrawn, draft: boolean) {
  if (draft) return;
  const lost = [
    ...(d.cover ? [] : ["cover"]),
    ...(d.map ? [] : ["map"]),
    ...b.views.filter((x) => !d.views[x.id]).map((x) => `views/${x.id}`),
    ...b.foods.filter((x) => !d.foods[x.id]).map((x) => `foods/${x.id}`),
    ...b.vehicles.filter((x) => !d.vehicles[x.id]).map((x) => `vehicles/${x.id}`),
  ];
  if (lost.length) {
    throw new Error(
      `content/legends/kitchenCarDrawn.ts: ${b.slug} は下書きの印を外したのに、絵が${lost.length}枚無い（${lost.slice(0, 5).join(", ")}…）。` +
        `public/legends/${b.slug}/ に描いてから外す`,
    );
  }
}
