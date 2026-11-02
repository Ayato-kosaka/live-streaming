/**
 * 11月のブラン城の貯金箱（`CastleBank.tsx`）の寸法と、部品の約束（`castle.json`）の読み方。
 * 描くことはしない（試験から呼べるように、DOM に触らない）。
 *
 * ## 大きさは豚と同じ物差しで決める（#1078、あやと 2026-11-02）
 *
 * あやとの指定は「100%のときに、豚を160%にした大きさが良い」＝**豚の 1.6 倍**（縦横とも。動く範囲と字を含めて）。
 *
 * 豚（`PiggyGauge`）は react-native-web の Dimensions の幅（`<html>` の幅 × `visualViewport.scale`）で大きさを
 * 決める。PRISM ではこの scale が % に比例して変わる（100% で 0.36、140% で 0.5）ので、`<html>` の幅で
 * 大きさを決める部品（ハロウィンの貯金箱）は、% によって豚との比が変わってしまう（100% では 140% のときの
 * 1.4 倍、豚より大きく見える。`docs/island-misses.md` #311）。
 *
 * なのでこの城は、**Dimensions の幅（`useStableWindow`）だけから大きさを決める。** PRISM の % が何でも、
 * いつも豚の 1.6 倍になる（`tools/sprites/alert-banksize.mjs` が scale 0.5 と 0.36 の両方で確かめる）。
 */

/**
 * 豚が描かれる外接矩形（字を含む）を、Dimensions の幅に対する割合で。
 * `alert-banksize.mjs` で測った: Dimensions の幅 218 のとき 178×113px（PRISM 140%・箱 436×776 でも、
 * 100%・箱 606×1078 でも同じ）。下の端は面の下の端、横は真ん中
 */
export const PIG_BOX = { w: 178 / 218, h: 113 / 218 } as const;

/** 豚に対する大きさ（あやとの「豚を160%にした大きさ」） */
export const CASTLE_TIMES = 1.6;

/**
 * 貯金箱の場面の大きさ（CSS px）。動くもの・字を全部この中に収める。
 * `dimW` は Dimensions の幅（`useStableWindow().width`）。**`<html>` の幅を渡さない**
 */
export function castleBox(dimW: number): { width: number; height: number } {
  return {
    width: Math.round(dimW * PIG_BOX.w * CASTLE_TIMES),
    height: Math.round(dimW * PIG_BOX.h * CASTLE_TIMES),
  };
}

/** 絵1枚の置き方（城の 0% の絵の px で） */
export type CastleSprite = {
  file: string;
  /** 足もと（下の辺の真ん中）の位置。`peek` は x だけ使う（y は灯りの境目） */
  x: number;
  y: number;
  /** 描く高さ（城の絵の px） */
  h: number;
};

/** 字を載せる台（リボン・銘板）。字を置く四角は台の絵に対する割合 */
export type CastlePlate = {
  file: string;
  /** 字を置く四角（台の絵の幅・高さに対する割合。左・上・右・下） */
  text: [number, number, number, number];
};

/** `castle.json` の中身。座標は城の 0% の絵（`bank-base-0.png`）の px */
export type CastleDef = {
  /** 城の 0% の絵の大きさ。読んだ絵と違えば、比で直す */
  size: [number, number];
  /** 城の中身の四角（ふちを含む。左・上・幅・高さ） */
  content: [number, number, number, number];
  /** 灯りが上がる範囲。0% で `bottom`（壁の下の端）、100% で `top`（いちばん上の壁の上の端） */
  light: { bottom: number; top: number };
  /** 旗竿。旗の竿側の辺の x と、旗の上の端が 0% / 100% で来る y */
  pole: { x: number; bottom: number; top: number };
  flag: { file: string; h: number };
  pipo: { wait: CastleSprite; peek: CastleSprite; cheer: CastleSprite };
  plates: Partial<Record<"ribbon" | "plaque", CastlePlate>>;
};

const num = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const nums = (v: unknown, n: number): v is number[] => Array.isArray(v) && v.length === n && v.every(num);

function readSprite(v: unknown): CastleSprite | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  if (typeof o.file !== "string" || !num(o.x) || !num(o.y) || !num(o.h) || o.h <= 0) return null;
  return { file: o.file, x: o.x, y: o.y, h: o.h };
}

function readPlate(v: unknown): CastlePlate | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  if (typeof o.file !== "string" || !nums(o.text, 4)) return null;
  return { file: o.file, text: o.text as [number, number, number, number] };
}

/**
 * `castle.json` を読む。**欠けていれば null**（片方の部品だけで城を出さない。使う側はコマ送りに落ちる）。
 * 字の台は、無いものは無いまま（その載せ方を選んでいなければ要らない）
 */
export function readCastleDef(json: unknown): CastleDef | null {
  if (!json || typeof json !== "object") return null;
  const o = json as Record<string, unknown>;
  const light = o.light as Record<string, unknown> | undefined;
  const pole = o.pole as Record<string, unknown> | undefined;
  const flag = o.flag as Record<string, unknown> | undefined;
  const pipo = o.pipo as Record<string, unknown> | undefined;
  if (!nums(o.size, 2) || !nums(o.content, 4)) return null;
  if (!light || !num(light.bottom) || !num(light.top) || light.top >= light.bottom) return null;
  if (!pole || !num(pole.x) || !num(pole.bottom) || !num(pole.top) || pole.top >= pole.bottom) return null;
  if (!flag || typeof flag.file !== "string" || !num(flag.h)) return null;
  if (!pipo) return null;
  const wait = readSprite(pipo.wait);
  const peek = readSprite(pipo.peek);
  const cheer = readSprite(pipo.cheer);
  if (!wait || !peek || !cheer) return null;
  const plates: CastleDef["plates"] = {};
  const ps = (o.plates ?? {}) as Record<string, unknown>;
  for (const k of ["ribbon", "plaque"] as const) {
    const p = readPlate(ps[k]);
    if (p) plates[k] = p;
  }
  return {
    size: o.size as [number, number],
    content: o.content as [number, number, number, number],
    light: { bottom: light.bottom, top: light.top },
    pole: { x: pole.x, bottom: pole.bottom, top: pole.top },
    flag: { file: flag.file, h: flag.h },
    pipo: { wait, peek, cheer },
    plates,
  };
}

/** 城が使う絵のファイル名ぜんぶ（城の 0%・100% の絵は `bank` のコマなので入れない） */
export function castleFiles(def: CastleDef, text: CastleText): string[] {
  const out = [def.flag.file, def.pipo.wait.file, def.pipo.peek.file, def.pipo.cheer.file];
  if (text !== "sky" && def.plates[text]) out.push(def.plates[text]!.file);
  return out;
}

/** 溜まり具合（0〜1）で、灯りの境目の y（城の絵の px） */
export function lightY(def: CastleDef, level: number): number {
  const k = Math.max(0, Math.min(1, level));
  return def.light.bottom + (def.light.top - def.light.bottom) * k;
}

/** 溜まり具合で、旗の上の端の y（城の絵の px） */
export function flagY(def: CastleDef, level: number): number {
  const k = Math.max(0, Math.min(1, level));
  return def.pole.bottom + (def.pole.top - def.pole.bottom) * k;
}

/**
 * 顔を出す窓（ピポの絵の上の端。城の絵の px）。**灯りの境目のすぐ下の、灯った窓から**顔を出す
 * （窓の上の 15% だけ境目より上に出る）。城の絵の上の端より上へは出ず、壁の下の端より下へも沈まない
 * （溜まり始めは、灯った壁がまだ細いので、窓は暗い壁に掛かる）。`peek.y` は使わない
 */
export function peekTop(def: CastleDef, level: number): number {
  const h = def.pipo.peek.h;
  const top = lightY(def, level) - h * 0.15;
  return Math.max(def.content[1], Math.min(def.light.bottom - h, top));
}

/**
 * ピポの居場所。空のあいだは門の前でランタンを持って待つ、溜まっているあいだは灯りのついた窓から
 * 顔を出す、満タン（100% 以上）なら門の前でバンザイ
 */
export function pipoPose(level: number): "wait" | "peek" | "cheer" {
  if (level >= 1) return "cheer";
  if (level <= 0) return "wait";
  return "peek";
}

/** 字の載せ方（`themes.ts` の `castleBank.text`） */
export type CastleText = "ribbon" | "plaque" | "sky";

type Rect = { x: number; y: number; w: number; h: number };

/** 場面の中の並び（場面の px）。字の大きさは場面の幅に対する割合 */
export type CastleLayout = {
  /** 城の中身の四角（`content` がここに来る） */
  castle: Rect;
  /** 字の台（リボン・銘板）。夜空なら null */
  plate: Rect | null;
  /** 城の後ろの夜空（"sky" のときだけ） */
  sky: Rect | null;
  /** 字を置く四角 */
  text: Rect;
  font: { amount: number; target: number; label: number };
  /** 旅の名前を上の行に置くか（夜空。下は額） */
  labelFirst: boolean;
};

/**
 * 字の大きさ（場面の幅に対する割合）。**豚の字を基準にする**（ハロウィンは額の字が大きすぎた）。
 * 豚は いまの額 20px・目標 16px・旅の名前 14px で、場面の幅（Dimensions の幅 218 のとき 285px）に対して
 * 0.070・0.056・0.049。城も同じくらいにし、いまの額だけ少し大きくする
 */
export const CASTLE_FONT = { amount: 0.078, target: 0.052, label: 0.052 } as const;

/** 台が城の足もとに重なる割合（台の高さに対して）。台の上半分が城の岩山に掛かる */
const PLATE_OVERLAP = 0.55;

/**
 * 場面の並びを決める。すべて `box`（豚の 1.6 倍の四角）の中に収める。
 * `plateAspect` は台の絵の 幅/高さ（夜空なら null）
 */
export function castleLayout(
  text: CastleText,
  box: { width: number; height: number },
  def: CastleDef,
  plateAspect: number | null
): CastleLayout {
  const W = box.width;
  const H = box.height;
  const aspect = def.content[2] / def.content[3];
  const fit = (bottom: number, maxH: number): Rect => {
    let h = Math.min(maxH, bottom);
    let w = h * aspect;
    if (w > W) {
      w = W;
      h = w / aspect;
    }
    return { x: (W - w) / 2, y: bottom - h, w, h };
  };
  if (text !== "sky" && plateAspect && def.plates[text]) {
    const pw = text === "ribbon" ? W : W * 0.94;
    const ph = pw / plateAspect;
    const plate = { x: (W - pw) / 2, y: H - ph, w: pw, h: ph };
    const castle = fit(plate.y + ph * PLATE_OVERLAP, H);
    const [l, t, r, b] = def.plates[text]!.text;
    return {
      castle,
      plate,
      sky: null,
      text: { x: plate.x + pw * l, y: plate.y + ph * t, w: pw * (r - l), h: ph * (b - t) },
      font: CASTLE_FONT,
      labelFirst: false,
    };
  }
  // 夜空: 城の後ろに丸い窓の夜空を敷き、城の上の空に字を置く（旅の名前が上、額が下）
  const sky = { x: 0, y: 0, w: W, h: H };
  const castle = fit(H * 0.985, H * 0.7);
  return {
    castle,
    plate: null,
    sky,
    text: { x: W * 0.12, y: H * 0.07, w: W * 0.76, h: H * 0.26 },
    font: CASTLE_FONT,
    labelFirst: true,
  };
}
