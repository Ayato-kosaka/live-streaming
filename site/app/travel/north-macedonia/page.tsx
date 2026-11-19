import type { Metadata } from "next";

/* 付箋の板。名前は前の面に合わせて `StickyNotes`（`Notes` は読みものの部品と取り違える） */
import StickyNotes from "@/components/live/Notes";
import { CountryRecordPage, mustRecord, recordMetadata } from "../record";

/**
 * 北マケドニアの国の面（`/travel/north-macedonia`）。**型はほかの国と同じ1つ**（`../record.tsx`）。
 *
 * 前は行く前の読みもの（どんな国か・街の外・食べもの・ことば・お金と足）と付箋の板の面だった。
 * あやと（2026-11-18）:「配信で回った話が無いし、『どんな国か』は要らない。同じ形にそろえる」。
 * 国名・一言・地図・いつ・配信の数と人数・行った街・作ったごはんを、歩き終わった国と同じ並びで出す。
 *
 * 行く前に調べた中身（`content/northMacedonia.ts`）は消していない。出どころの URL を足してから
 * スコピエのガイドへ流す予定のもの（`docs/guide-design.md` 4章・12）。
 *
 * 「行った街」のスコピエはガイドへのカード（2026-11-19 にスコピエの公開前の印を外した。`content/travel.ts` の `publicCities`）。
 * 配信35本は街の畳みから「この国であったこと」へ移り、議事録の一言が添う（`../record.tsx` の `stayStreams`）。
 */
const R = mustRecord("north-macedonia");

export const metadata: Metadata = recordMetadata(R);

export default function NorthMacedoniaPage() {
  return (
    <CountryRecordPage r={R}>
      {/* 付箋の板（あやと 2026-10-11「北マケドニアのボード欲しい。北マケドニアのページにも表示すること」）。
          **型の外だが残す。** 掲示板の宛先（`content/themes.ts` の `north-macedonia`）がこの面を指していて、
          外すと棚から押して来た人が書く欄の無い面に着く（`site/selftest/notedest_selftest.mjs`）。
          貼られた付箋は「この国で何を頼まれたか」なので、国の記録の終わりに置いて意味が通る。
          **宛先は決まっているので、選ばせない**（`theme`）。 */}
      <StickyNotes theme="north-macedonia" title="北マケドニアでこれやって" />
    </CountryRecordPage>
  );
}
