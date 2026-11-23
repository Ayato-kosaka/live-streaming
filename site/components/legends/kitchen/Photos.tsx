import type { KitchenCarBook } from "@/content/legends/kitchenCarTypes";

/**
 * キッチンカーの実際の様子。**ヨーロッパで走っている本物のキッチンカーの写真**（絵担当の `photos.json` を焼いたもの。
 * Commons の縮尺の URL を指す）。添えるのは撮った人と許諾だけ（#1418 本文3章）。**写真が無いあいだは見出しごと出さない**
 */
export default function Photos({ b }: { b: KitchenCarBook }) {
  if (!b.photos.length) return null;
  return (
    <>
      <h3 className="gb-sub" id="photos">
        {b.subs.photos}
      </h3>
      <ul className="kc-photos">
        {b.photos.map((p) => (
          <li key={p.id}>
            <span className="gb-pic kc-late" data-gb-late="" style={{ aspectRatio: `${p.w} / ${p.h}` }}>
              <img src={p.img} srcSet={`${p.thumb} 500w, ${p.img} 960w`} sizes="(min-width: 640px) 300px, 90vw" width={p.w} height={p.h} alt={p.alt} loading="lazy" decoding="async" />
            </span>
            <p className="gb-credit">
              <a href={p.page} target="_blank" rel="noreferrer" aria-label={`${p.alt}（${p.by}）`}>
                {p.by}
              </a>
              ／{p.lic}
            </p>
          </li>
        ))}
      </ul>
    </>
  );
}
