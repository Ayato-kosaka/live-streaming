import type { Metadata } from "next";

import { CountryRecordPage, mustRecord, recordMetadata } from "../record";

/**
 * ルーマニアの国の面（`/travel/romania`）。**型はほかの国と同じ1つ**（`../record.tsx`）。
 *
 * 入った日（2026-11-21）に建てた。それまではブカレストの面だけで、パンくずは 島 › 歩いた国 › ブカレスト
 * （`content/travel.ts` の `CITY_ONLY` の `before`）。ブルガリアは入ってから6日、国の面が無く
 * `/travel/bulgaria` が 404 だった（#1262）ので、こちらは入った日に建てる。
 *
 * 国の案内（ことば・通貨・ビザ）はブカレストの面が持っている。ここに書き写さない
 * （同じ字の面が2枚になると、検索の評価が割れる。#1262）。
 *
 * 道が固定の面なのは、`./bucharest/` が同じ段に在るから。歩き終わって `COUNTRIES` へ移ったら、
 * ここを消して `[slug]` の面に任せる（中身は同じ型なので、見た目は変わらない）。
 */
const R = mustRecord("romania");

export const metadata: Metadata = recordMetadata(R);

export default function RomaniaPage() {
  return <CountryRecordPage r={R} />;
}
