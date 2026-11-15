import Icon from "@/components/ui/Icon";
import type { Drawn } from "@/content/guidebook/manifest";
import type { Guidebook, Item } from "@/content/guidebook/types";

import Sheet from "./Sheet";
import SpotMap from "./SpotMap";
import { WentBox } from "./Videos";
import { Ext, LocalName, Picture, Sec, SrcLine, sheetId, shortName } from "./parts";

/**
 * 3 どんな街。**歴史と街の性格を4枚の小さな札で**、その下に**見どころマップ**。
 *
 * 札は大きい数1つと題だけを見せて、本文は窓へ（あやと「文字文字しくならないように」）。
 *
 * ## 見どころマップ
 *
 * 描いた絵地図の上に、地区の名前・番号つきの写真のピン・地図の外の矢印を面の側で重ね、下に地区ごとの一覧を置く
 * （`SpotMap.tsx`。#1228 あやと 2026-11-15「見どころマップみたいにしたいの」）。地区の札を押すと、そのエリアの窓。
 */
export default function About({ g, drawn, n }: { g: Guidebook; drawn: Drawn; n: number }) {
  const { cards, more, areas } = g.about;
  const byId = new Map(g.see.items.map((s) => [s.id, s]));
  return (
    <Sec id="about" n={n} icon="oldtown" title={`${g.name}は、どんな街？`}>
      <div className="gb-about">
        {cards.map((c) => (
          <a key={c.id} className="gb-about-card" href={`#${sheetId("about", c.id)}`}>
            <span className="gb-about-num">
              <b>{c.num}</b>
              <i>{c.unit}</i>
            </span>
            <span className="gb-about-t">{c.title}</span>
            {c.lead && <span className="gb-about-l">{c.lead}</span>}
          </a>
        ))}
      </div>

      {more.length > 0 && (
        <>
          <h3 className="gb-sub">よく言われること</h3>
          <div className="gb-chips">
            {more.map((m) => (
              <a key={m.id} className="gb-chip" href={`#${sheetId("more", m.id)}`}>
                <Icon name={m.icon} size={22} />
                <span>{m.title}</span>
              </a>
            ))}
          </div>
        </>
      )}

      <h3 className="gb-sub">見どころマップ</h3>
      <SpotMap g={g} drawn={drawn} />

      {cards.map((c) => (
        <Sheet key={c.id} id={sheetId("about", c.id)} kicker="どんな街" title={c.title}>
          <p className="gb-bignum">
            <b>{c.num}</b>
            <i>{c.unit}</i>
          </p>
          <Ext>
            <p>{c.body}</p>
            <SrcLine src={c.src} of={c.title} />
          </Ext>
        </Sheet>
      ))}
      {more.map((m) => (
        <Sheet key={m.id} id={sheetId("more", m.id)} kicker="よく言われること" title={m.title}>
          <Ext>
            {m.parts.map((p, i) => (
              <p key={i}>{p.text}</p>
            ))}
            <SrcLine src={m.src} of={m.title} />
          </Ext>
        </Sheet>
      ))}
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
              <MiniTiles items={a.see.map((id) => byId.get(id)).filter((x): x is Item => !!x)} />
            </>
          )}
        </Sheet>
      ))}
    </Sec>
  );
}

/** 窓の中の小さな札（見たいものへ）。押すと、その見たいものの窓に入れ替わる */
export function MiniTiles({ items }: { items: Item[] }) {
  return (
    <ul className="gb-minis">
      {items.map((s) => (
        <li key={s.id}>
          <a href={`#${sheetId("see", s.id)}`}>
            <Picture pic={s.pic} sizes="96px" ratio="1 / 1" label={shortName(s.name).slice(0, 1)} />
            <span>{shortName(s.name)}</span>
          </a>
        </li>
      ))}
    </ul>
  );
}
