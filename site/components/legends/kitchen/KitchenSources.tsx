import type { Src } from "@/content/guidebook/types";
import Fold from "@/components/ui/Fold";
import type { KitchenCarBook } from "@/content/legends/kitchenCarTypes";

/** 面の出どころぜんぶ（同じ URL は1つ）。窓や行の中にも、その1件の出どころがある */
export function kitchenSources(b: KitchenCarBook): Src[] {
  const all: Src[] = [
    ...b.foods.flatMap((x) => x.src),
    ...b.fillings.flatMap((x) => x.src),
    ...b.places.flatMap((x) => x.src),
    ...b.money.inputs.flatMap((x) => x.src),
    ...Object.values(b.money.fixed).flatMap((x) => x.src),
    ...b.rate.src,
    ...b.looks.flatMap((x) => x.interior.src),
    ...b.vehicles.flatMap((x) => x.src),
    ...b.buyOrRent.flatMap((x) => x.src),
    ...b.issues.permit.layers.flatMap((x) => x.src),
    ...b.issues.permit.compare.flatMap((x) => x.src),
    ...b.issues.life.flatMap((g) => g.items.flatMap((x) => x.src)),
    ...b.facts.flatMap((g) => g.items.flatMap((x) => x.src)),
  ];
  const seen = new Set<string>();
  return all.filter((s) => !seen.has(s.url) && !!seen.add(s.url));
}

/**
 * 面の終わりの出どころの一覧（畳む）と、描いた絵の1行（「写真ではない絵は、あやと島案内鳥が AI で描いたもの。」。絵が1枚も無いあいだは出さない）。
 * 出どころの名前は URL の置き場の名前（焼く道具が URL から読む。運営の決め 2026-11-23 の5）。写真は撮った人と許諾を写真の下に添えてある
 */
export default function KitchenSources({ b, drew }: { b: KitchenCarBook; drew: boolean }) {
  const src = kitchenSources(b);
  const short = (u: string) => u.replace(/^https?:\/\//, "").slice(0, 64);
  return (
    <section className="gb-sources" aria-labelledby="sources-h" data-gb="sources">
      <h2 id="sources-h" className="sr-only">
        {b.ui.sources}
      </h2>
      <Fold title={b.ui.sources} note={String(src.length)}>
        <ul className="gb-src-list">
          {src.map((s) => (
            <li key={s.url}>
              <a href={s.url} target="_blank" rel="noreferrer" aria-label={`${s.name}（${short(s.url)}）`} data-quote="src">
                {s.name}
              </a>
              <i>{short(s.url)}</i>
            </li>
          ))}
        </ul>
        {drew && <p className="gb-note">{b.ui.drew}</p>}
      </Fold>
    </section>
  );
}
