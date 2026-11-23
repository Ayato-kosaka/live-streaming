/**
 * 12月のクリスマスの貯金箱（`XmasBank.tsx`）の寸法と、部品の約束（`<variant>.json`）の読み方。
 * 描くことはしない（試験から呼べるように、DOM に触らない）。
 *
 * ## 案が2つある（#1034、あやと 2026-11-23「貯金箱は案3か案4で迷っている」）
 *
 * - `sleigh`（案3 ソリのプレゼント袋）: 貯まるほど袋がふくらみ、25/50/75% で袋の口からプレゼントが 1→3→5 個のぞき、
 *   ソリのランタンが1つずつ灯る。100% で袋の首に金のリボン・金のほのかな光。超えたら、プレゼントがあふれてソリの前に積み上がり、
 *   ピポがその上でバンザイ。ピポのふだんの居場所は、ソリの前の渦巻きの上（袋のふちではない。下の「ピポの居場所」）
 * - `globe`（案4 スノードーム）: 0% は町が暗く、貯まるほど窓とツリーの電球が下から灯る（0% の絵の上に、同じ構図の 100% の絵を
 *   下から切り抜いて重ねる。11月の城と同じ作り）。100% でツリーの星と台座の金の帯が光る。超えたら、ドームの中に金の雪が渦を巻き、
 *   ピポが台座の上でバンザイ
 *
 * どちらも試し表示の `?bank=sleigh|globe` で切り替える（オーナーが選ぶまで）。選ばれたほうを `themes.ts` の既定にする。
 *
 * ## 座標
 *
 * 部品の置き場は**場面の座標**（`canvas`。幅 1000）で書く。場面の座標は、豚の 1.6 倍の四角（`castleBox`。Dimensions の幅だけで
 * 決まる）に、縦横比を保って下の端をそろえて拡げる（`xmasLayout`）。PRISM の % が何でも豚との比は同じ（11月の城と同じ物差し）。
 * 絵の中の目印（ランタン・ドーム・灯りの範囲）は、その絵の幅・高さに対する割合で書く（絵を縮め直しても書き直さない）。
 */
import { BREATH, CASTLE_FONT, castleBox, type PipoSprite } from "./castle";

export { castleBox as xmasBox };

/**
 * 字の大きさ（場面の幅に対する割合）。11月の城と同じ: **目立たせるのは いまの額だけ**（豚の字 20px くらい）、
 * 目標と旅の名前はその半分ほど（あやと 2026-11-02「今の金額以外の文字はよく見たら見えるくらいで良い」）
 */
export const XMAS_FONT = CASTLE_FONT;

export type XmasVariant = "sleigh" | "globe";
export const XMAS_VARIANTS: readonly XmasVariant[] = ["sleigh", "globe"];

/** `?bank=` を読む。知らない名前・付いていなければ `fallback`（テーマの既定） */
export function pickVariant(raw: string | null | undefined, fallback: XmasVariant): XmasVariant {
  const v = String(raw ?? "").trim().toLowerCase();
  return (XMAS_VARIANTS as readonly string[]).includes(v) ? (v as XmasVariant) : fallback;
}

/**
 * ピポのポーズ。**選ぶための録画では 座る・手を振る・バンザイ（と金貨を受け取る）だけ**（#1034）。
 * くじで動く全部の動き（歩く・眠る・小芸）は、選ばれたほうにあとで入れる
 */
export const XMAS_POSES = ["sit", "wave", "cheer", "catch"] as const;
export type XmasPose = (typeof XMAS_POSES)[number];

type XY = [number, number];
/** 左・上・幅・高さ */
type Box4 = [number, number, number, number];

type Common = {
  /** 場面の座標の幅と高さ */
  canvas: XY;
  /** アラート明けに飛び込む金貨 */
  coin: string;
  /** 字の帯。`rect` は場面の座標、`text` は帯の絵に対する割合（左・上・右・下） */
  band: { file: string; rect: Box4; text: [number, number, number, number] };
  pipo: {
    /** 顔の幅（場面の幅に対する割合）。どのポーズもこの幅で描く（ポーズを替えても顔が跳ねない） */
    face: number;
    poses: Record<XmasPose, PipoSprite>;
  };
};

export type SleighDef = Common & {
  kind: "sleigh";
  /** 空のソリ（ランタンが消えた絵と灯った絵。同じ構図）。`rect` は場面の座標 */
  sleigh: {
    file: string;
    lit: string;
    rect: Box4;
    /** 袋より手前に描く所（ソリの側面）。絵の幅・高さに対する割合の多角形 */
    front: XY[];
    /**
     * ランタン（真ん中と、横・縦の半径。絵の幅・高さに対する割合）。左から順に灯る。灯った絵をこの楕円で切り抜いて重ねる
     * （消えた絵は、灯った絵のこの楕円の中だけを暗くして作ってあるので、楕円の外は2枚で同じ。継ぎ目が出ない）
     */
    lanterns: [number, number, number, number][];
  };
  /**
   * 袋。しぼんだ・半分・ぱんぱんの3枚を、溜まり具合で重ねて継ぐ（`bagMorph`）。
   * `base` は袋の底の真ん中（場面の座標）。`w` は3枚それぞれを描く幅。`mouth` は口の真ん中（それぞれの絵に対する割合）。
   * `neck` はぱんぱんの絵の首（リボンを結ぶ所。割合）。`sizes` は3枚の絵の大きさ（px。縦横比だけを使う）
   */
  bag: { files: [string, string, string]; sizes: [XY, XY, XY]; base: XY; w: [number, number, number]; mouth: [XY, XY, XY]; neck: XY };
  /** 袋の口からのぞくプレゼント。`spots` は口の真ん中からのずれ（場面の座標）と傾き（度）。1・3・5 個目までを順に出す */
  gifts: { files: string[]; w: number; spots: [number, number, number][] };
  bow: { file: string; w: number };
  /** あふれたプレゼントの山。`top` はピポが立つ所（場面の座標） */
  pile: { file: string; rect: Box4; top: XY };
  /** ピポのふだんの足もと（ソリの前の渦巻きの上。場面の座標） */
  seat: XY;
};

export type GlobeDef = Common & {
  kind: "globe";
  globe: {
    /** 0% の絵（町が暗い）と 100% の絵（全部灯る）。同じ構図 */
    base: string;
    lit: string;
    rect: Box4;
    /** 灯りが上がる範囲（絵の高さに対する割合）。0% で `[0]`、100% で `[1]` */
    light: XY;
    /** ドームの楕円（真ん中・横の半径・縦の半径。絵の幅・高さに対する割合） */
    dome: [number, number, number, number];
    /** ツリーの星（真ん中と半径。絵の幅に対する割合） */
    star: [number, number, number];
  };
  /** ピポの足もと（場面の座標）。ふだんはドームの横、あふれたら（バンザイのとき）台座の上 */
  side: XY;
  ped: XY;
  /**
   * ドームの横に置く小物（場面の座標の 左・上・幅・高さ と傾き）。ピポの後ろ。
   * ドームの絵は縦横がほぼ同じで、豚の 1.6 倍の四角（横長）の左に空きが出る。ピポだけだと、ピポとドームのあいだが空く
   */
  deco: { file: string; rect: Box4; rot: number }[];
};

export type XmasDef = SleighDef | GlobeDef;

const num = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const nums = (v: unknown, n: number): boolean => Array.isArray(v) && v.length === n && v.every(num);
const obj = (v: unknown): Record<string, unknown> | null => (v && typeof v === "object" ? (v as Record<string, unknown>) : null);
const str = (v: unknown): v is string => typeof v === "string" && v.length > 0;
const list = (v: unknown, n: number): boolean => Array.isArray(v) && v.length > 0 && v.every((p) => nums(p, n));

function readSprite(v: unknown): PipoSprite | null {
  const o = obj(v);
  if (!o || !str(o.file) || !nums(o.size, 2) || !nums(o.foot, 2) || !nums(o.face, 4)) return null;
  const [w, h] = o.size as number[];
  const [l, t, r, b] = o.face as number[];
  if (!(w > 0 && h > 0 && r > l && b > t)) return null;
  return { file: o.file, size: [w, h], foot: o.foot as XY, face: o.face as [number, number, number, number] };
}

function readCommon(o: Record<string, unknown>): Common | null {
  const band = obj(o.band);
  const pipo = obj(o.pipo);
  if (!nums(o.canvas, 2) || !str(o.coin)) return null;
  if (!band || !str(band.file) || !nums(band.rect, 4) || !nums(band.text, 4)) return null;
  if (!pipo || !num(pipo.face) || pipo.face <= 0) return null;
  const ps = obj(pipo.poses);
  if (!ps) return null;
  const poses = {} as Record<XmasPose, PipoSprite>;
  for (const name of XMAS_POSES) {
    const sp = readSprite(ps[name]);
    if (!sp) return null;
    poses[name] = sp;
  }
  return {
    canvas: o.canvas as XY,
    coin: o.coin,
    band: { file: band.file, rect: band.rect as Box4, text: band.text as [number, number, number, number] },
    pipo: { face: pipo.face, poses },
  };
}

/** `<variant>.json` を読む。**欠けていれば null**（使う側はコマ送りに落ちる。片方の部品だけで出さない） */
export function readXmasDef(json: unknown): XmasDef | null {
  const o = obj(json);
  if (!o) return null;
  const c = readCommon(o);
  if (!c) return null;
  if (o.kind === "sleigh") {
    const sl = obj(o.sleigh);
    const bag = obj(o.bag);
    const gifts = obj(o.gifts);
    const bow = obj(o.bow);
    const pile = obj(o.pile);
    if (!sl || !str(sl.file) || !str(sl.lit) || !nums(sl.rect, 4) || !list(sl.front, 2) || !list(sl.lanterns, 4)) return null;
    if (!bag || !Array.isArray(bag.files) || bag.files.length !== 3 || !bag.files.every(str)) return null;
    if (!nums(bag.base, 2) || !nums(bag.w, 3) || !list(bag.mouth, 2) || (bag.mouth as unknown[]).length !== 3 || !nums(bag.neck, 2)) return null;
    if (!list(bag.sizes, 2) || (bag.sizes as unknown[]).length !== 3) return null;
    if (!gifts || !Array.isArray(gifts.files) || gifts.files.length < 5 || !gifts.files.every(str) || !num(gifts.w) || !list(gifts.spots, 3)) return null;
    if ((gifts.spots as unknown[]).length < 5) return null;
    if (!bow || !str(bow.file) || !num(bow.w)) return null;
    if (!pile || !str(pile.file) || !nums(pile.rect, 4) || !nums(pile.top, 2) || !nums(o.seat, 2)) return null;
    return {
      ...c,
      kind: "sleigh",
      sleigh: { file: sl.file, lit: sl.lit, rect: sl.rect as Box4, front: sl.front as XY[], lanterns: sl.lanterns as [number, number, number, number][] },
      bag: {
        files: bag.files as [string, string, string],
        sizes: bag.sizes as [XY, XY, XY],
        base: bag.base as XY,
        w: bag.w as [number, number, number],
        mouth: bag.mouth as [XY, XY, XY],
        neck: bag.neck as XY,
      },
      gifts: { files: gifts.files as string[], w: gifts.w, spots: gifts.spots as [number, number, number][] },
      bow: { file: bow.file, w: bow.w },
      pile: { file: pile.file, rect: pile.rect as Box4, top: pile.top as XY },
      seat: o.seat as XY,
    };
  }
  if (o.kind === "globe") {
    const g = obj(o.globe);
    if (!g || !str(g.base) || !str(g.lit) || !nums(g.rect, 4) || !nums(g.light, 2) || !nums(g.dome, 4) || !nums(g.star, 3)) return null;
    const light = g.light as XY;
    if (!(light[1] < light[0])) return null;
    if (!nums(o.side, 2) || !nums(o.ped, 2)) return null;
    const deco = Array.isArray(o.deco) ? o.deco.map(obj) : [];
    if (!deco.every((d) => d && str(d.file) && nums(d.rect, 4) && num(d.rot))) return null;
    return {
      ...c,
      kind: "globe",
      globe: {
        base: g.base,
        lit: g.lit,
        rect: g.rect as Box4,
        light,
        dome: g.dome as [number, number, number, number],
        star: g.star as [number, number, number],
      },
      side: o.side as XY,
      ped: o.ped as XY,
      deco: deco.map((d) => ({ file: d!.file as string, rect: d!.rect as Box4, rot: d!.rot as number })),
    };
  }
  return null;
}

/** 案が使う絵のファイル名ぜんぶ */
export function xmasFiles(def: XmasDef): string[] {
  const out = [def.coin, def.band.file, ...XMAS_POSES.map((p) => def.pipo.poses[p].file)];
  if (def.kind === "sleigh") out.push(def.sleigh.file, def.sleigh.lit, ...def.bag.files, ...def.gifts.files, def.bow.file, def.pile.file);
  else out.push(def.globe.base, def.globe.lit, ...def.deco.map((d) => d.file));
  return [...new Set(out)];
}

/** 場面の座標 → 貯金箱の四角の px。縦横比を保って収め、横は真ん中・下の端をそろえる */
export type XmasLayout = { s: number; ox: number; oy: number };

export function xmasLayout(box: { width: number; height: number }, def: { canvas: XY }): XmasLayout {
  const [cw, ch] = def.canvas;
  const s = Math.min(box.width / cw, box.height / ch);
  return { s, ox: (box.width - cw * s) / 2, oy: box.height - ch * s };
}

/* ------------------------------------------------------------------ 溜まり具合で決まるもの */

/** 段の切れ目。プレゼント・ランタンは、ここをまたいだときに1つずつ出る（目で段が分かる） */
export const STEPS = [0.25, 0.5, 0.75, 1] as const;
const EPS = 1e-6;

/** 袋の口からのぞくプレゼントの数（25% で1、50% で3、75% から5） */
export function giftsAt(level: number): number {
  if (level >= 0.75 - EPS) return 5;
  if (level >= 0.5 - EPS) return 3;
  if (level >= 0.25 - EPS) return 1;
  return 0;
}

/** 灯っているランタンの数（25% ごとに1つ。100% で4つ） */
export function lanternsAt(level: number, n = 4): number {
  let k = 0;
  for (const s of STEPS) if (level >= s - EPS) k++;
  return Math.min(n, k);
}

/** 満タン（100% ちょうどを含む）。リボン・金の光・星 */
export const isFull = (level: number) => level >= 1 - EPS;

/** 100% を**超えた**か（100% ちょうどは満タンで、あふれではない。100% と 120% を違って見せるため） */
export const isOver = (amount: number, target: number) => target > 0 && amount > target;

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
/** 継ぎ目をなめらかに（0 と 1 で傾きが 0） */
const smooth = (t: number) => t * t * (3 - 2 * t);

/**
 * 袋のふくらみ。3枚（しぼんだ・半分・ぱんぱん）を、溜まり具合で**継いで**見せる。
 *
 * - 袋の外形（幅・高さ）は、0% → 50% で1枚目から2枚目へ、50% → 100% で2枚目から3枚目へ、続けて伸びる
 * - どの絵も、その外形に合わせて底の真ん中を軸に伸び縮みさせる（外形がそろうので、重ねても二重に見えない）
 * - 下の絵は不透明のまま、上の絵を溜まり具合で濃くする（2枚を半分ずつ透かすと、継ぎ目で袋が透ける）
 *
 * 返すのは、絵ごとの 濃さ・横の倍率・縦の倍率、袋の外形（場面の座標）、口の真ん中と首（場面の座標）
 */
export function bagMorph(def: SleighDef, level: number) {
  const lv = clamp01(level);
  const seg = lv < 0.5 ? 0 : 1;
  const t = seg === 0 ? lv / 0.5 : (lv - 0.5) / 0.5;
  const dims = def.bag.sizes.map(([w, h], i) => ({ w: def.bag.w[i], h: (def.bag.w[i] * h) / w }));
  const a = dims[seg];
  const b = dims[seg + 1];
  const W = lerp(a.w, b.w, t);
  const H = lerp(a.h, b.h, t);
  const sprites = dims.map((d, i) => {
    const op = i === seg ? 1 : i === seg + 1 ? smooth(t) : 0;
    return { opacity: op, sx: W / d.w, sy: H / d.h };
  });
  const ma = def.bag.mouth[seg];
  const mb = def.bag.mouth[seg + 1];
  const fx = lerp(ma[0], mb[0], t);
  const fy = lerp(ma[1], mb[1], t);
  const [bx, by] = def.bag.base;
  const left = bx - W / 2;
  const top = by - H;
  return {
    sprites,
    rect: { x: left, y: top, w: W, h: H },
    mouth: { x: left + W * fx, y: top + H * fy },
    // 首はぱんぱんの絵の目印。外形に合わせて伸ばす
    neck: { x: left + W * def.bag.neck[0], y: top + H * def.bag.neck[1] },
  };
}

/** スノードームの灯りの境目（絵の高さに対する割合）。溜まるほど上がる */
export function globeLightY(def: GlobeDef, level: number): number {
  const [bottom, top] = def.globe.light;
  return lerp(bottom, top, clamp01(level));
}

/* ------------------------------------------------------------------ ピポ */

/** ピポの絵1枚を場面の座標で描く大きさ */
export function xmasPipoSize(def: XmasDef, pose: XmasPose): { w: number; h: number; k: number } {
  const sp = def.pipo.poses[pose];
  const k = (def.pipo.face * def.canvas[0]) / (sp.face[2] - sp.face[0]);
  return { w: sp.size[0] * k, h: sp.size[1] * k, k };
}

/** 足もとを (x, y) に置いたときの絵の四角（場面の座標） */
export function xmasPipoRect(def: XmasDef, pose: XmasPose, x: number, y: number) {
  const sp = def.pipo.poses[pose];
  const { w, h } = xmasPipoSize(def, pose);
  return { x: x - w * sp.foot[0], y: y - h * sp.foot[1], w, h };
}

/** 足もとを (x, y) に置いたときの顔の四角（場面の座標） */
export function xmasPipoFace(def: XmasDef, pose: XmasPose, x: number, y: number) {
  const sp = def.pipo.poses[pose];
  const r = xmasPipoRect(def, pose, x, y);
  const k = r.w / sp.size[0];
  return { x: r.x + sp.face[0] * k, y: r.y + sp.face[1] * k, w: (sp.face[2] - sp.face[0]) * k, h: (sp.face[3] - sp.face[1]) * k };
}

/** バンザイで跳ねる高さ（場面の高さに対する割合）と、跳ねるときの広がり */
export const HOP = { lift: 0.07, scale: BREATH * 1.07 } as const;

/**
 * ピポの居場所（足もと。場面の座標）。`over` は 100% を超えたか、`pose` はそこで取るポーズ。
 *
 * ## ピポの居場所（なぜ袋のふちではないか）
 *
 * 顔の幅を場面の幅の 13.5% にすると（城と同じ。あやと「ピポもうちょっと大きくしないと見えない」）、座ったピポの背丈は
 * 場面の高さの 4 割ほどになる。ぱんぱんの袋の口に座らせると、頭が豚の 1.6 倍の四角の上に出る。なのでふだんは
 * **ソリの前の渦巻きの上**（スノードームは**ドームの左の雪の上**）に座り、場面の左の端まで使う（幅が豚の 1.6 倍に届く）。
 * **超えたら、バンザイのときだけ**あふれたプレゼントの山の上（スノードームは台座の上）へ跳び乗り、座る・手を振るときは
 * いつもの所へ戻る（跳び移りが「あふれた」のお祝いになる。ずっと山の上に居ると、左の端が空いて幅が 1.6 倍を割る）
 */
export function pipoSpot(def: XmasDef, over: boolean, pose: XmasPose): { x: number; y: number } {
  const up = over && pose === "cheer";
  const p = def.kind === "globe" ? (up ? def.ped : def.side) : up ? def.pile.top : def.seat;
  return { x: p[0], y: p[1] };
}

export type XmasAct = { pose: "sit" | "wave" | "cheer"; ms: number; look: boolean; hops: number };

/**
 * ピポが次に何をするか（くじ）。選ぶための録画で見せる 座る・手を振る・バンザイ だけ。
 * - ふだん: 座る（ときどき首をかしげる）と、手を振るを混ぜる。手を振るを2回続けない
 * - 100% を超えたら: バンザイで跳ねるのを半分ほど混ぜる。バンザイを3回続けない
 */
export function nextXmasAct(r: () => number, over: boolean, last: XmasAct | null, streak = 0): XmasAct {
  const sit = (): XmasAct => ({ pose: "sit", ms: 2200 + r() * 2000, look: r() < 0.45, hops: 0 });
  const wave = (): XmasAct => ({ pose: "wave", ms: 1700 + r() * 600, look: false, hops: 0 });
  const cheer = (): XmasAct => ({ pose: "cheer", ms: 0, look: false, hops: 2 + Math.floor(r() * 2) });
  const x = r();
  if (!over) {
    if (last?.pose === "wave") return sit();
    return x < 0.45 ? wave() : sit();
  }
  if (last?.pose === "cheer" && streak >= 2) return x < 0.5 ? wave() : sit();
  if (x < 0.55) return cheer();
  if (x < 0.8 && last?.pose !== "wave") return wave();
  return sit();
}
