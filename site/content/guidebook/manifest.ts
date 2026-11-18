import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import type { Metadata } from "next";

import type { MapBeyond, MapDir, Pic, Todo } from "./types";

/**
 * **描いた絵の置き場（`public/guide/<国>/<街>/manifest.json`）を読む。** 書き出すときに1回だけ。
 *
 * 表紙・エリア地図・やりたいこと・料理・土産の絵は、別の担当が ChatGPT で描いて置く（#1228 Q1 の A）。
 * 置き場の形:
 *
 * ```json
 * {
 *   "cover": { "src": "cover.webp", "w": 1600, "h": 1000, "alt": "…" },
 *   "cover_tall": { "src": "cover-tall.webp", "w": 900, "h": 1200, "alt": "…" },
 *   "areamap": { "src": "areamap.webp", "w": 1200, "h": 1200, "alt": "…",
 *                "areas": [{ "id": "center", "name": "中心（セルディカ）", "x": 0.52, "y": 0.44 }] },
 *   "do": { "<やりたいことの id>": { "src": "…", "src_small": "…", "w": 1200, "h": 1500, "alt": "…" } },
 *   "food": { "<料理の id>": { "src": "…", "src_small": "…", "w": 800, "h": 800, "alt": "…", "kind": "…" } },
 *   "buy": { "<土産の id>": { … } }
 * }
 * ```
 *
 * - `src` は置き場からの相対（`cover.webp`）か、`/` で始まる道。**ファイルが無ければ使わない**
 *   （壊れた絵の枠を出さない。面の側は借りた写真か、色の地の札に落ちる）
 * - エリアの `x` `y` は名前の札を置く位置。0〜1 の割合（100 までなら百分率、それより大きければ絵の画素）
 * - やりたいことの鍵は `Todo.id`、料理と土産の鍵は `Item.id`（ラテン文字）。合わない鍵は使わない
 * - エリア地図の `beyond` は絵の外の所（向きの矢印。形は `types.ts` の `MapBeyond`）。どんな街の地図（`spotmap.ts`）が使う。
 *   `bbox`（緯度経度の範囲）は描く担当の控えで、面は読まない（前は見どころの写真のピンを立てるのに使った。2026-11-16 にやめた）
 *
 * **字は絵に焼かない**（`docs/guide-design.md` 4-2）。エリアの名前・ピン・矢印は面の側で重ねる。
 * **ただし `areamap.baked` の地図は、地区の色と名前を絵に焼いてある**（あやと 2026-11-18 #1262「見どころマップと検索したら、
 * 画像検索の結果に、地区の表示が出て欲しい」。画像検索に出るのは絵だけなので、面の側で重ねた字は写らない）。
 * そのときエリアの `x` `y` `w` `h` は**焼いた札の箱**（中心と幅・高さ。割合）で、面は透明の押しどころを重ねるだけ。
 * 焼くのは `.claude/skills/chatgpt-image/guide_art.py finalize`（`guide_layout.py`）。
 * **表紙も、`cover.titled` の絵は題（街の名前・「観光ガイド」・キャッチ）を焼いてある**（同じ日、#1228。理由は地図と同じ）。
 * `cover.og` はその横の表紙を 1200x630 に切った JPEG（貼られたときの絵）
 */
export type AreaPin = { id?: string; name?: string; x: number; y: number; w?: number; h?: number };
export type Drawn = {
  cover?: Pic;
  coverTall?: Pic;
  /**
   * 表紙に題（街の名前・「観光ガイド」・キャッチ）を焼いてある（あやと 2026-11-18 #1228「画像検索で水彩のイラストだけが出て、
   * 誰も押さない」）。そのとき面は表紙の上に字を重ねず、見出しを絵の下に置く（`components/guidebook/Cover.tsx`）。
   * 横と縦の**両方**が焼けているときだけ true（狭い画面で字の無い縦の絵が出て、見出しが絵の外だけになるのを防ぐ）
   */
  coverTitled: boolean;
  /** 貼られたときの絵（1200x630 の JPEG。焼いた横の表紙の真ん中）。`coverShare` が og:image にする */
  og?: { src: string; w: number; h: number };
  /** `baked`: 地区の名前を絵に焼いた地図。`small` は面で使う小さい版（`src` は画像検索に出す大きい版） */
  areamap?: Pic & { areas: AreaPin[]; beyond: MapBeyond[]; baked: boolean };
  /** やりたいことの絵（`Todo.id` の鍵）。無いあいだは、データの写真か色の地 */
  do: Record<string, Pic>;
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
  const empty: Drawn = { coverTitled: false, do: {}, food: {}, buy: {} };
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

  const cover = pic(raw.cover);
  const coverTall = pic(raw.cover_tall);
  const titledOf = (v: unknown) => isObj(v) && v.titled === true;
  const ogRaw = isObj(raw.cover) && isObj(raw.cover.og) ? raw.cover.og : undefined;
  const ogSrc = ogRaw && url(ogRaw.src);
  const out: Drawn = {
    cover,
    coverTall,
    coverTitled: !!cover && titledOf(raw.cover) && (!coverTall || titledOf(raw.cover_tall)),
    og: ogRaw && ogSrc ? { src: ogSrc, w: num(ogRaw.w) ?? 1200, h: num(ogRaw.h) ?? 630 } : undefined,
    do: dict(raw.do),
    food: dict(raw.food),
    buy: dict(raw.buy),
  };
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
      const bw = num(a.w);
      const bh = num(a.h);
      return [{ id: str(a.id), name: str(a.name), x: unit(x, w), y: unit(y, h), ...(bw && bh ? { w: bw, h: bh } : {}) }];
    });
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
    const baked = am.baked === true;
    /* 焼いた地図は、札の箱が無いと押しどころを重ねられない。**黙って押せない地図にしない** */
    if (baked && areas.some((a) => !a.w || !a.h))
      throw new Error(`content/guidebook/manifest.ts: ${base}/manifest.json の areamap は名前を焼いてあるのに、札の箱（w・h）の無い地区がある`);
    out.areamap = { ...amPic, areas, beyond, baked };
  }
  return out;
}

/**
 * 街の面の、貼られたときの顔。**題を焼いた表紙があれば、og:image をその絵にする**（あやと 2026-11-18 #1228）。
 * 無ければ渡された `meta`（国の1枚）のまま。題・一文・居場所・robots は `travelCityShare` のものを変えない
 */
export function coverShare(meta: Metadata, d: Drawn, alt: string): Metadata {
  if (!d.og || !d.coverTitled) return meta;
  const img = { url: encodeURI(d.og.src), width: d.og.w, height: d.og.h, alt };
  return {
    ...meta,
    openGraph: { ...meta.openGraph, images: [img] },
    twitter: { ...meta.twitter, images: [img.url] },
  };
}

/**
 * やりたいことの札の絵。**描いたもの（`do.<id>`）が先。** 無いあいだは、その体験に出てくる料理・土産の描いた絵
 * （同じ温かいトーンの絵。ヨーグルトの体験ならキセロ・ムリャコの絵）。どちらも無ければ `undefined`——データの写真のまま、
 * 写真も無ければ色の地（`components/guidebook/Todo.tsx`）。
 *
 * 料理の写真より、描いた料理の絵のほうが「おいしそう」が伝わった（2026-11-16。あやと「おいしそう！かわいい！楽しそう！と
 * 感情が動く画像」）
 */
export function todoPic(d: Drawn, t: Pick<Todo, "id" | "eat" | "buy">): Pic | undefined {
  return d.do[t.id] ?? (t.eat ?? []).map((id) => d.food[id]).find(Boolean) ?? (t.buy ?? []).map((id) => d.buy[id]).find(Boolean);
}
