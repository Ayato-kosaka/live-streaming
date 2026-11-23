import Fold from "@/components/ui/Fold";
import type { Guidebook, Pic, Src } from "@/content/guidebook/types";

/**
 * 面の終わりの出どころの一覧（`docs/guide-design.md` 4-4）。**畳んでおく**——読みたい人だけが開く。
 * 窓の中にも、その1件の出どころがある。ここは全部をまとめて引ける所。
 */
export default function Sources({ g, drawn }: { g: Guidebook; drawn: boolean }) {
  const all: Src[] = [
    ...g.about.cards.flatMap((x) => x.src),
    ...g.about.areas.flatMap((x) => x.src),
    ...g.todo.flatMap((x) => x.src),
    ...g.see.items.flatMap((x) => x.src),
    ...g.eat.items.flatMap((x) => x.src),
    ...g.buy.items.flatMap((x) => x.src),
    ...g.basics.guides.flatMap((x) => x.src),
    ...g.basics.season.src,
    ...g.basics.budget.rows.flatMap((x) => x.src),
    ...g.basics.budget.tips.flatMap((x) => x.src),
    ...g.basics.pack.flatMap((x) => x.src),
    ...g.basics.climate.src,
    ...g.basics.help.embassy.src,
  ];
  const seen = new Set<string>();
  const src = all.filter((s) => !seen.has(s.url) && !!seen.add(s.url));
  const photos: { name: string; p: Pic }[] = [
    { name: `${g.name}の表紙`, p: g.cover },
    ...[...g.see.items, ...g.eat.items, ...g.buy.items].flatMap((it) => (it.pic ? [{ name: it.name, p: it.pic }] : [])),
  ].filter((x) => x.p.kind === "photo" && x.p.credit);
  const shown = new Set<string>();
  const lent = photos.filter((x) => !shown.has(x.p.credit!.page) && !!shown.add(x.p.credit!.page));
  return (
    <section className="gb-sources" aria-labelledby="sources-h" data-gb="sources">
      <h2 id="sources-h" className="sr-only">
        出どころ
      </h2>
      <Fold title="出どころ" note={`${src.length}件・写真${lent.length}枚`}>
        <ul className="gb-src-list">
          {src.map((s) => (
            <li key={s.url}>
              {/* 題は外の記事の題をそのまま引いたもの。`data-quote="src"` は見張りへの目印（`parts.tsx` の `SrcLine` と同じ） */}
              <a
                href={s.url}
                target="_blank"
                rel="noreferrer"
                aria-label={`${s.name}（${s.url.replace(/^https?:\/\//, "").slice(0, 64)}）`}
                data-quote="src"
              >
                {s.name}
              </a>
              <i>{s.url.replace(/^https?:\/\//, "").slice(0, 64)}</i>
            </li>
          ))}
        </ul>
        <ul className="gb-src-list is-photo">
          {lent.map((x) => (
            <li key={x.p.credit!.page}>
              <span>{x.name}</span>
              <a href={x.p.credit!.page} target="_blank" rel="noreferrer" aria-label={`${x.name}の写真（${x.p.credit!.by}）`}>
                {x.p.credit!.by}
              </a>
              <i>{x.p.credit!.lic}</i>
            </li>
          ))}
        </ul>
        {/* 絵の上には「イラスト」の札を乗せない（あやと 2026-11-16「イラストのチップ要らない」）。AI で描いたことはここで1行 */}
        {drawn && <p className="gb-note">写真ではない絵（表紙・地図・料理・お土産などのイラスト）は、あやと島案内鳥が AI で描いたもの。</p>}
      </Fold>
    </section>
  );
}
