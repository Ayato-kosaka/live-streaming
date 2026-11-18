import type { Guidebook } from "@/content/guidebook/types";
import { JsonLd, attractionListLd } from "@/lib/jsonld";

import { sheetId } from "./parts";

/**
 * 見たいものの名札（`ItemList` ＋ `TouristAttraction`）。**画面には何も出ない。** #1262
 *
 * 見たいものの点（マイマップ）は埋め込みの中だけにあって、検索の読み手には見えない。名前・座標・窓への錨を
 * 字で渡す。組み立ては `lib/jsonld.tsx` の `attractionListLd`。
 *
 * - 座標は見たいもの（`Item.geo`）が材料から持っている。**持たない街は出さない**（スコピエはまだ持たない）
 * - **一部だけ座標が欠けていたら書き出しを止める。** 黙って抜くと、面の「見たいもの22か所」と名札の数が食い違う
 * - 並びは面の札と同じ（星の順。同じ星は材料の順。`Items.tsx` の `See` と同じ並べかた）
 */
export default function SpotsLd({ g, path }: { g: Guidebook; path: string }) {
  const items = g.see.items;
  const has = items.filter((it) => it.geo);
  if (!has.length) return null;
  if (has.length !== items.length) {
    const miss = items.filter((it) => !it.geo).map((it) => it.name);
    throw new Error(`components/guidebook/SpotsLd.tsx: ${g.city} の見たいもの ${items.length} のうち、座標が無いもの（${miss.join("、")}）`);
  }
  const ordered = [...items].sort((a, b) => (a.rank ?? 3) - (b.rank ?? 3));
  return (
    <JsonLd
      data={attractionListLd({
        path,
        name: `${g.name}の見どころ`,
        items: ordered.map((it) => ({
          anchor: sheetId("see", it.id),
          name: it.name,
          lat: it.geo!.lat,
          lon: it.geo!.lon,
          alternateName: [it.local?.text, it.local?.roman].filter((x): x is string => !!x),
          description: it.body || undefined,
          /* 窓の写真（借りた写真）。描いた絵や色の札は場所そのものではないので渡さない */
          image: it.pic?.kind === "photo" ? (it.pic.big ?? it.pic.src) : undefined,
        })),
      })}
    />
  );
}
