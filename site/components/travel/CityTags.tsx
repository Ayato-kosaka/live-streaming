import Tags from "@/components/ui/Tags";
import { tagsOfCity } from "@/lib/tags";

/**
 * 街の面（街のガイド）の札の段。いつ居たか・どの旅で・ここでやった企画・ここで作った料理（#1357）。
 *
 * **札を選ぶのは `lib/tags.ts`**。滞在の表がその街を slug で指している滞在から引く（名前の字では結ばない。M-6）。
 * まだ街を書いていない滞在（歩いている最中の国）の街は、札が0件なので何も出ない。
 *
 * ガイドの本文（番号の付いた節と目次）の外に置く。節にすると目次とガイドの型が変わる。
 */
export default function CityTags({ country, city, name }: { country: string; city: string; name: string }) {
  const rows = tagsOfCity(country, city);
  if (!rows.length) return null;
  return (
    <section className="gb-tags" aria-labelledby="gb-tags-h">
      <h2 id="gb-tags-h">{name}とつながっているもの</h2>
      <Tags rows={rows} />
    </section>
  );
}
