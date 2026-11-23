/**
 * 型の区画 → 絵の上の位置（UV）。区画は `dims.json` が持ち、型の絵を作る道具（`tools/van3d/template.py`）と
 * 柄を貼り込む道具（`skin_pack.py`）も同じ表を読む。
 *
 * 外装は**外から見たとおりの向き**、内装は**中から見たとおりの向き**で描く。`(s, t)` は区画の中の位置で、
 * s は左→右、t は下→上（0〜1）。面の上の点は、丸める前の平らな位置（運転席は寝かせたあとの位置）から引くので、
 * 丸い角の帯は区画の縁の 45px（角の丸み 0.3m）に乗る。
 */
import D from "./dims.json";

export type Face = "left" | "right" | "front" | "back" | "roof" | "bottom";
export type Rect = [number, number, number, number];
type Sheet = { size: number[]; span: { x: number[]; y: number[]; z: number[] }; regions: Record<string, number[]> };

const EXT = D.exterior as Sheet;
const INT = D.interior as Sheet;

/** 型の検査の対照（`mirror`: 左右の区画を取り違えて貼る）。撮る口からだけ入れる */
let broken = "";
export function setBreak(kind: string): void {
  broken = kind;
}

const rect = (sheet: Sheet, name: string): Rect => {
  const key = broken === "mirror" && sheet === EXT ? ({ left: "right", right: "left" } as Record<string, string>)[name] ?? name : name;
  return sheet.regions[key] as Rect;
};

function toUV(sheet: Sheet, r: Rect, s: number, t: number): [number, number] {
  const [w, h] = sheet.size;
  return [(r[0] + s * r[2]) / w, 1 - (r[1] + (1 - t) * r[3]) / h];
}

const frac = (v: number, a: number[]) => (v - a[0]) / (a[1] - a[0]);

/** 外装の面の上の点 → 区画の中の (s, t)。外から見て s は左→右、t は下→上 */
export function extST(face: Face, x: number, y: number, z: number): [number, number] {
  const { x: X, y: Y, z: Z } = EXT.span;
  const t = frac(y, Y);
  switch (face) {
    case "left":
      return [1 - frac(x, X), t]; // 運転席側を横から。前が左
    case "right":
      return [frac(x, X), t]; // 窓口側を横から。前が右
    case "front":
      return [1 - frac(z, Z), t]; // 前から。左端が車の右
    case "back":
      return [frac(z, Z), t]; // 後ろから。左端が車の左
    case "roof":
      return [frac(x, X), 1 - frac(z, Z)]; // 上から。前が右、上端が車の左
    default:
      return [0.5, 0.5];
  }
}

export function extUV(face: Face, x: number, y: number, z: number): [number, number] {
  if (face === "bottom") return WHITE_UV;
  const [s, t] = extST(face, x, y, z);
  return toUV(EXT, rect(EXT, face), s, t);
}

/** 庇の垂れ: s は窓口の前後（外から見て左→右）、t は下→上 */
export function valanceUV(s: number, t: number): [number, number] {
  return toUV(EXT, rect(EXT, "valance"), s, t);
}

/** 白い小さな区画の真ん中。色は頂点の色が持つ（小物・ガラス・灯りの縁を、絵と同じ材質で1回に描くため） */
export const WHITE_UV = ((): [number, number] => {
  const r = EXT.regions.white as Rect;
  return toUV(EXT, r, 0.5, 0.5);
})();

/** 内装の壁の上の点 → 区画の中の (s, t)。中から見て s は左→右 */
export function innerST(face: Face, x: number, y: number, z: number): [number, number] {
  const { x: X, y: Y, z: Z } = INT.span;
  const t = frac(y, Y);
  switch (face) {
    case "left":
      return [frac(x, X), t]; // 左の壁を中から。前が右
    case "right":
      return [1 - frac(x, X), t]; // 右（窓口）の壁を中から。前が左
    case "back":
      return [1 - frac(z, Z), t]; // 奥の壁を中から。右端が車の左
    case "front":
      return [frac(z, Z), t]; // 運転席の後ろの仕切りを中から。右端が車の右
    default:
      return [0.5, 0.5];
  }
}

export function innerUV(face: Face, x: number, y: number, z: number): [number, number] {
  const [s, t] = innerST(face, x, y, z);
  return toUV(INT, rect(INT, face), s, t);
}

export const INNER_WHITE_UV = ((): [number, number] => {
  const r = INT.regions.white as Rect;
  return toUV(INT, r, 0.5, 0.5);
})();

export const SHEETS = { exterior: EXT, interior: INT };
