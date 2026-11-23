import type { Metadata } from "next";

import { CountryRecordPage, mustRecord, recordMetadata } from "../record";

/**
 * アルバニアの国の面（`/travel/albania`）。**型はほかの国と同じ1つ**（`../record.tsx`）。
 *
 * 前は `[slug]` の面が書き出していた。2026-11-23 にティラナのガイド（`./tirana/`）が同じ段に入り、
 * `app/travel/albania/` が静的な段になったので、`[slug]` はこの国の道を持てなくなった（ブルガリアと同じ）。
 * だから道を固定にした（`content/travel.ts` の `WALKED_FIXED`）。中身は同じ型なので、見た目は変わらない。
 * 共有の絵も `[slug]` のときと同じ地図の1枚（`map`）のまま。
 */
const R = mustRecord("albania");

export const metadata: Metadata = recordMetadata(R);

export default function AlbaniaPage() {
  return <CountryRecordPage r={R} />;
}
