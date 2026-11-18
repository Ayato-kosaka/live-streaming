import type { Metadata } from "next";

import { CountryRecordPage, mustRecord, recordMetadata } from "../record";

/**
 * ブルガリアの国の面（`/travel/bulgaria`）。**型はほかの国と同じ1つ**（`../record.tsx`）。
 *
 * 前は街のガイドの一覧だけの面で、押すと「どの街へ行った？」しか出なかった。あやと（2026-11-18）:
 * 「イギリスみたいに」。国名・一言・地図・いつ・配信の数と人数・行った街（ソフィアはガイドへ）を、
 * 歩き終わった国と同じ並びで出す。
 *
 * 国の案内（ことば・通貨・ビザ）はソフィアの面が持っている（#1228）。ここに書き写さない
 * （同じ字の面が2枚になると、検索の評価が割れる。#1262）。
 *
 * 道が固定の面なのは、`./sofia/` が同じ段に在るから。歩き終わって `COUNTRIES` へ移ったら、
 * ここを消して `[slug]` の面に任せる（中身は同じ型なので、見た目は変わらない）。
 */
const R = mustRecord("bulgaria");

export const metadata: Metadata = recordMetadata(R);

export default function BulgariaPage() {
  return <CountryRecordPage r={R} />;
}
