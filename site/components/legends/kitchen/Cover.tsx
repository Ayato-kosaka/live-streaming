import { Picture, jpDate } from "@/components/guidebook/parts";
import type { KitchenDrawn } from "@/content/legends/kitchenCarDrawn";
import type { KitchenCarBook } from "@/content/legends/kitchenCarTypes";

/**
 * 表紙。**題を焼いた絵（16:9）→ 見出し → 見出しの下の一行 → 本人の言葉2つ（大きく。日付だけ。場面のリンクを持たない）→
 * 開始の目標 → 小さな注 → 最終更新**（build-plan ①の1）。表紙の頭の形はインドの面と同じ（`legends.css` の `lb-cover`）。
 * 絵が無いあいだは枠ごと出さない（空のマスを置かない。`docs/guide-design.md` 4-1）
 */
export default function Cover({ b, drawn }: { b: KitchenCarBook; drawn: KitchenDrawn }) {
  return (
    <header className="lb-cover kc-cover" data-gb="cover">
      {drawn.cover && (
        <div className="lb-cover-art">
          <Picture pic={drawn.cover} sizes="(min-width: 960px) 900px, 100vw" ratio="16 / 9" eager />
        </div>
      )}
      <h1 className="lb-h1">{b.meta.h1}</h1>
      <p className="lb-sub">{b.meta.sub}</p>
      <div className="kc-quotes">
        {b.cover.quotes.map((q) => (
          <figure className="kc-quote" key={q.id}>
            <blockquote>「{q.text}」</blockquote>
            <figcaption>
              <time dateTime={q.date}>{q.cite}</time>
            </figcaption>
          </figure>
        ))}
      </div>
      <p className="lb-start">{b.meta.goal}</p>
      <p className="kc-note">{b.cover.note}</p>
      <p className="lb-updated">
        {b.ui.updated} <time dateTime={b.updated}>{jpDate(b.updated)}</time>
      </p>
    </header>
  );
}
