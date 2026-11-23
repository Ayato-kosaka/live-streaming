import type { KitchenDrawn } from "@/content/legends/kitchenCarDrawn";
import type { KitchenCarBook } from "@/content/legends/kitchenCarTypes";
import { JsonLd, articleLd } from "@/lib/jsonld";

/**
 * 面の名札。**画面には何も出ない。** `Article`（題・説明は book.json の meta。絵は表紙の1枚 `cover.webp` が在るときだけ。
 * インドの面の `BookLd` と同じ。16:9・4:3・1:1 に切った版は作らない）。パンくず（`BreadcrumbList`）は `PageShell` が出す。
 * FAQ・ItemList は持たない（build-plan ①）
 */
export default function KitchenLd({ b, drawn, path }: { b: KitchenCarBook; drawn: KitchenDrawn; path: string }) {
  return (
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
  );
}
