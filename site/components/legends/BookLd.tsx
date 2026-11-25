import { sheetId } from "@/components/guidebook/parts";
import type { BookDrawn } from "@/content/legends/drawn";
import type { LegendBook } from "@/content/legends/types";
import { JsonLd, abs, articleLd } from "@/lib/jsonld";

/**
 * 企画の面の名札。**画面には何も出ない。** `Article`（題・説明は book.json の meta）・`ItemList`（食べるべき100品）・
 * `FAQPage`（よくある質問）。パンくず（`BreadcrumbList`）は `PageShell` が出す。
 *
 * - 欄は面に見えている字だけ: 品の名前・現地のつづり・一行・窓の錨（`#dish-<id>`。直に開くと窓が開く）。絵は描いた絵が在るときだけ
 * - 並びは面の札と同じ（材料の順）
 * - 問いと答えは面にそのまま見えている字（窓の中ではない）
 */
export default function BookLd({ b, drawn, path }: { b: LegendBook; drawn: BookDrawn; path: string }) {
  const page = abs(path);
  const items = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: b.sections.dishes,
    url: page,
    numberOfItems: b.dishes.length,
    itemListElement: b.dishes.map((d, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: d.name,
      url: `${page}#${sheetId("dish", d.id)}`,
      item: {
        "@type": "Thing",
        name: d.name,
        alternateName: d.local?.text,
        description: d.lead,
        url: `${page}#${sheetId("dish", d.id)}`,
        ...(drawn.dishes[d.id] ? { image: abs(drawn.dishes[d.id].src) } : {}),
      },
    })),
  };
  const faq = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    url: page,
    inLanguage: "ja",
    mainEntity: b.faq.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
  };
  return (
    <>
      <JsonLd
        data={articleLd({
          path,
          headline: b.meta.title,
          description: b.meta.description,
          datePublished: b.updated,
          dateModified: b.updated,
          ...(drawn.cover ? { image: drawn.cover.src } : {}),
        })}
      />
      <JsonLd data={items} />
      <JsonLd data={faq} />
    </>
  );
}
