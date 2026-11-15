import { SOFIA } from "./bulgaria-sofia";
import type { Guidebook } from "./types";

/**
 * ガイドブック型の街の名簿（#1228）。**街の面が「どちらの型か」は、ここに在るかで決まる**——
 * 在れば `components/guidebook/`、無ければ前の型（`content/travel/guides.ts`。スコピエ）。
 * スコピエを作り替えたら、ここへ移して前の型を消す。
 */
export const GUIDEBOOKS: Guidebook[] = [SOFIA];

export const guidebookOf = (country: string, city: string) =>
  GUIDEBOOKS.find((g) => g.country === country && g.city === city);
