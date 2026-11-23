import { TIRANA } from "./albania-tirana";
import { SOFIA } from "./bulgaria-sofia";
import { SKOPJE } from "./north-macedonia-skopje";
import { BUCHAREST } from "./romania-bucharest";
import { BELGRADE } from "./serbia-belgrade";
import type { Guidebook } from "./types";

/**
 * ガイドブック型の街の名簿（#1228）。街の面・国の面の入口・索引（sitemap）は、ここから中身を引く。
 *
 * ソフィアは手で組んだもの（`bulgaria-sofia.ts`）、スコピエは焼いたもの（`north-macedonia-skopje.ts`。
 * `python/guidebook_bake.py` が材料から焼く）。どちらも同じ型なので、面の部品は同じものを使う。
 */
export const GUIDEBOOKS: Guidebook[] = [SOFIA, SKOPJE, BUCHAREST, BELGRADE, TIRANA];

export const guidebookOf = (country: string, city: string) =>
  GUIDEBOOKS.find((g) => g.country === country && g.city === city);
