/**
 * 12月のクリスマスの貯金箱（スノードーム。`XmasBank.tsx`）の寸法と、部品の約束（`globe.json`）の読み方。
 * 描くことはしない（試験から呼べるように、DOM に触らない）。
 *
 * ## スノードーム（#1034、あやとが案4 を選んだ 2026-11-23）
 *
 * 0% はドームの中の町の灯りが**全部消えて**いて、貯まるほど窓とツリーの電球が下から灯る（0% の絵の上に、同じ構図の 100% の
 * 絵を下から切り抜いて重ねる。11月の城と同じ作り）。100% でツリーの星と台座の帯が光る。**超えたら**ドームの中に金の雪が渦を巻き、
 * ドームのまわりが金色に光る。
 *
 * ## ピポの動き（11月の城と同じ決まり）
 *
 * 次の動きは城の `castleBrain.ts` がくじで決める（歩く・止まって座る・小芸・顔を出す・跳び乗る・眠る・あふれたら踊る）。
 * ここに別の動きの一覧は持たない。城の「場所」をスノードームの場所に置き換えるだけ（`GlobeStage`）:
 *
 * | 城 | スノードーム |
 * | --- | --- |
 * | 左の隅（地面） | ドームの左の雪の上（積んだプレゼントの前） |
 * | 右の隅（地面） | 台座の上の右の端 |
 * | リボンの後ろの道 | 台座の上（ドームの前） |
 * | 門の前（入る・金貨を受け取る） | 台座の上の真ん中。入ると帯の陰へ沈む |
 * | 屋根ごしに顔を出す | 帯ごしに顔を出す（帯の陰から） |
 * | 岩山に跳び乗る | 積んだプレゼントのてっぺんに跳び乗る |
 * | 隅で丸くなって眠る | 帯の陰に入って、耳だけ帯の上に出して眠る |
 * | 旗を振る・あくび | 手を振る絵で振る・バンザイの絵で「のび」 |
 *
 * 隅と道の高さが違う所（左の雪の上 ↔ 台座）は、歩かずに跳んで移る（坂を歩いて上がるように見えないように）。
 *
 * ## 座標
 *
 * 部品の置き場は**場面の座標**（`canvas`。幅 1000）で書く。場面の座標は、豚の 1.6 倍の四角（`castleBox`。Dimensions の幅だけで
 * 決まる）に、縦横比を保って下の端をそろえて拡げる（`xmasLayout`）。PRISM の % が何でも豚との比は同じ。
 * 絵の中の目印（ドーム・灯りの範囲・星）は、その絵の幅・高さに対する割合で書く。
 */
import { BREATH, CASTLE_FONT, PIPO_POSES, castleBox, type PipoPose, type PipoSet, type PipoSprite } from "./castle";

export { castleBox as xmasBox };

/**
 * 字の大きさ（場面の幅に対する割合）。11月の城と同じ: **目立たせるのは いまの額だけ**（豚の字 20px くらい）、
 * 目標と旅の名前はその半分ほど（あやと 2026-11-02「今の金額以外の文字はよく見たら見えるくらいで良い」）
 */
export const XMAS_FONT = CASTLE_FONT;

type XY = [number, number];
/** 左・上・幅・高さ */
type Box4 = [number, number, number, number];

/** ピポの居場所（場面の座標。足もと）。城の `pipoStage` に当たる */
export type GlobeStage = {
  /** 左の隅（ドームの左の雪の上）と、右の隅（台座の上の右の端） */
  left: XY;
  right: XY;
  /** 台座の上の道（足もとの高さと、歩ける x の範囲）。隅から隅へは、この道を通る */
  lane: { y: number; x: [number, number] };
  /** 門（台座の上の真ん中）。ここから帯の陰へ入り、ここで金貨を見上げる */
  gate: XY;
  /** 跳び乗って座る所（積んだプレゼントのてっぺん） */
  ledges: XY[];
  /** 帯ごしに顔を出す所（`x` 顔の真ん中・`y` 帯の上のふち。ここより下は帯に隠れる） */
  peeks: XY[];
};

export type GlobeDef = PipoSet & {
  /** 場面の座標の幅と高さ */
  canvas: XY;
  /** アラート明けに飛び込む金貨 */
  coin: string;
  /** 字の帯。`rect` は場面の座標、`text` は帯の絵に対する割合（左・上・右・下） */
  band: { file: string; rect: Box4; text: [number, number, number, number] };
  globe: {
    /** 0% の絵（町の灯りが全部消えている）と 100% の絵（全部灯る）。同じ構図 */
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
  /** ドームの左に積んだプレゼント（場面の座標の 左・上・幅・高さ と傾き）。ピポの後ろ。てっぺんは跳び乗る所 */
  deco: { file: string; rect: Box4; rot: number }[];
  stage: GlobeStage;
};

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

/** `globe.json` を読む。**欠けていれば null**（使う側はコマ送りに落ちる。片方の部品だけで出さない） */
export function readGlobeDef(json: unknown): GlobeDef | null {
  const o = obj(json);
  if (!o) return null;
  const band = obj(o.band);
  const pipo = obj(o.pipo);
  const g = obj(o.globe);
  const st = obj(o.stage);
  if (!nums(o.canvas, 2) || !str(o.coin)) return null;
  if (!band || !str(band.file) || !nums(band.rect, 4) || !nums(band.text, 4)) return null;
  if (!pipo || !num(pipo.face) || pipo.face <= 0) return null;
  const ps = obj(pipo.poses);
  if (!ps) return null;
  const poses = {} as Record<PipoPose, PipoSprite>;
  for (const name of PIPO_POSES) {
    const sp = readSprite(ps[name]);
    if (!sp) return null;
    poses[name] = sp;
  }
  if (!g || !str(g.base) || !str(g.lit) || !nums(g.rect, 4) || !nums(g.light, 2) || !nums(g.dome, 4) || !nums(g.star, 3)) return null;
  const light = g.light as XY;
  if (!(light[1] < light[0])) return null;
  const deco = Array.isArray(o.deco) ? o.deco.map(obj) : [];
  if (!deco.every((d) => d && str(d.file) && nums(d.rect, 4) && num(d.rot))) return null;
  const lane = obj(st?.lane);
  if (!st || !nums(st.left, 2) || !nums(st.right, 2) || !nums(st.gate, 2) || !list(st.ledges, 2) || !list(st.peeks, 2)) return null;
  if (!lane || !num(lane.y) || !nums(lane.x, 2)) return null;
  return {
    canvas: o.canvas as XY,
    coin: o.coin,
    band: { file: band.file, rect: band.rect as Box4, text: band.text as [number, number, number, number] },
    pipo: { face: pipo.face, poses },
    globe: {
      base: g.base,
      lit: g.lit,
      rect: g.rect as Box4,
      light,
      dome: g.dome as [number, number, number, number],
      star: g.star as [number, number, number],
    },
    deco: deco.map((d) => ({ file: d!.file as string, rect: d!.rect as Box4, rot: d!.rot as number })),
    stage: {
      left: st.left as XY,
      right: st.right as XY,
      lane: { y: lane.y, x: lane.x as [number, number] },
      gate: st.gate as XY,
      ledges: st.ledges as XY[],
      peeks: st.peeks as XY[],
    },
  };
}

/** 使う絵のファイル名ぜんぶ */
export function globeFiles(def: GlobeDef): string[] {
  const out = [def.coin, def.band.file, def.globe.base, def.globe.lit, ...def.deco.map((d) => d.file)];
  for (const p of PIPO_POSES) out.push(def.pipo.poses[p].file);
  return [...new Set(out)];
}

/** 場面の座標 → 貯金箱の四角の px。縦横比を保って収め、横は真ん中・下の端をそろえる */
export type XmasLayout = { s: number; ox: number; oy: number };

export function xmasLayout(box: { width: number; height: number }, def: { canvas: XY }): XmasLayout {
  const [cw, ch] = def.canvas;
  const s = Math.min(box.width / cw, box.height / ch);
  return { s, ox: (box.width - cw * s) / 2, oy: box.height - ch * s };
}

/** 場面の座標の箱（`castle.ts` のピポの関数に、場面の座標のまま渡す） */
export const canvasBox = (def: { canvas: XY }) => ({ width: def.canvas[0], height: def.canvas[1] });

const EPS = 1e-6;

/** 満タン（100% ちょうどを含む）。星と帯の光 */
export const isFull = (level: number) => level >= 1 - EPS;

/** 100% を**超えた**か（100% ちょうどは満タンで、あふれではない。100% と 120% を違って見せるため） */
export const isOver = (amount: number, target: number) => target > 0 && amount > target;

/** 灯りの境目（絵の高さに対する割合）。溜まるほど上がる */
export function globeLightY(def: GlobeDef, level: number): number {
  const [bottom, top] = def.globe.light;
  return bottom + (top - bottom) * Math.max(0, Math.min(1, level));
}

/** バンザイで跳ねる高さ（場面の高さに対する割合）と、跳ねるときの広がり（城の hop と同じ） */
export const HOP = { lift: 0.09, scale: BREATH * 1.07 } as const;
