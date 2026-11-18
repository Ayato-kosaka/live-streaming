import Icon from "@/components/ui/Icon";
import type { Drawn } from "@/content/guidebook/manifest";
import type { Guidebook, Item } from "@/content/guidebook/types";

import Sheet from "./Sheet";
import SpotMap from "./SpotMap";
import { WentBox } from "./Videos";
import { Ext, LocalName, Picture, Sec, SrcLine, sheetId, shortName } from "./parts";

/**
 * 3 どんな街。**短い問いと、2〜3文の答え**（「歴史は？」「どんな雰囲気？」）。その下に**どのあたりに何がある？**の地図。
 *
 * ## 大きな数の札は、やめた（あやと 2026-11-16「どんな街の大きな数字は AI 臭い」）
 *
 * 前は「前7000年ごろから」「49の温泉」のような大きい数1つと題の札で、本文は窓に入っていた。数を大きく見せても
 * 街の姿は伝わらない。問いに短く答える形にして、答えは面にそのまま出す（窓を開かなくても読める長さ）。
 * 「よく言われること」（標語・ヨーグルト・安い・バラ）の札も消した——ヨーグルトとバラはやりたいことに入っている
 * （`docs/island-misses.md` #327）。
 *
 * 地図は概要だけ（`SpotMap.tsx`）。地区の札を押すと、そのエリアの窓。
 */
export default function About({ g, drawn, n }: { g: Guidebook; drawn: Drawn; n: number }) {
  const { cards, areas } = g.about;
  const byId = new Map(g.see.items.map((s) => [s.id, s]));
  return (
    <Sec id="about" n={n} icon="oldtown" title={`${g.name}は、どんな街？`}>
      <div className="gb-qa">
        {cards.map((c) => (
          <section key={c.id} className="gb-qa-one" aria-labelledby={`about-${c.id}-q`}>
            <h3 id={`about-${c.id}-q`} className="gb-qa-q">
              {c.icon && <Icon name={c.icon} size={30} />}
              {c.q}
            </h3>
            <Ext>
              <p className="gb-qa-a">{c.a}</p>
              <SrcLine src={c.src} of={c.q} />
            </Ext>
          </section>
        ))}
      </div>

      <h3 className="gb-sub">どのあたりに何がある？</h3>
      <SpotMap g={g} drawn={drawn} />

      {areas.map((a) => (
        <Sheet key={a.id} id={sheetId("area", a.id)} kicker="エリア" title={a.name} tone={a.color}>
          {a.local && (
            <p className="gb-name-row">
              <LocalName l={a.local} full />
            </p>
          )}
          {a.went && <WentBox w={a.went} of={a.name} label="歩いた" />}
          <Ext>
            <p className="gb-lead">{a.lead}</p>
            {a.body && <p>{a.body}</p>}
            <SrcLine src={a.src} of={a.name} />
          </Ext>
          {a.see.length > 0 && (
            <>
              <h4 className="gb-h4">このエリアの見たいもの</h4>
              <MiniTiles items={a.see.flatMap((id) => (byId.has(id) ? [{ kind: "see" as const, it: byId.get(id)! }] : []))} />
            </>
          )}
        </Sheet>
      ))}
    </Sec>
  );
}

/** 窓の中の小さな札の1枚。どの節の窓へ繋ぐか（`kind`）と、その品 */
export type Mini = { kind: "see" | "eat" | "buy"; it: Item };

/** 窓の中の小さな札（見たいもの・食べたいもの・買いたいものへ）。押すと、その窓に入れ替わる */
export function MiniTiles({ items }: { items: Mini[] }) {
  return (
    <ul className="gb-minis">
      {items.map(({ kind, it }) => (
        <li key={`${kind}-${it.id}`}>
          <a href={`#${sheetId(kind, it.id)}`}>
            <Picture pic={it.pic} sizes="96px" ratio="1 / 1" label={shortName(it.name).slice(0, 1)} />
            <span>{shortName(it.name)}</span>
          </a>
        </li>
      ))}
    </ul>
  );
}
