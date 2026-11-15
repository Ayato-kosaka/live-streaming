import Icon from "@/components/ui/Icon";
import type { Drawn } from "@/content/guidebook/manifest";
import type { Area, Guidebook, Item } from "@/content/guidebook/types";

import Sheet from "./Sheet";
import { Picture, Sec, SrcLine, sheetId, shortName } from "./parts";

/**
 * 3 どんな街。**歴史と街の性格を4枚の小さな札で**、その下に**エリア地図**。
 *
 * 札は大きい数1つと題だけを見せて、本文は窓へ（あやと「文字文字しくならないように」）。
 *
 * ## エリア地図
 *
 * 描いた絵（`manifest.json` の `areamap`）があれば、その上に**エリアの名前を面の側で重ねる**
 * （字を絵に焼かない。`docs/guide-design.md` 4-2）。名前の札を押すと、そのエリアの窓。
 * 絵が無いあいだは、エリアの色の札を大まかな位置関係（北が上）で並べる——**壊れた絵の枠を出さない**。
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
            <span className="gb-about-l">{c.lead}</span>
          </a>
        ))}
      </div>

      <h3 className="gb-sub">よく言われること</h3>
      <div className="gb-chips">
        {more.map((m) => (
          <a key={m.id} className="gb-chip" href={`#${sheetId("more", m.id)}`}>
            <Icon name={m.icon} size={22} />
            <span>{m.title}</span>
          </a>
        ))}
      </div>

      <h3 className="gb-sub">エリア</h3>
      <AreaMap areas={areas} drawn={drawn} />

      {cards.map((c) => (
        <Sheet key={c.id} id={sheetId("about", c.id)} kicker="どんな街" title={c.title}>
          <p className="gb-bignum">
            <b>{c.num}</b>
            <i>{c.unit}</i>
          </p>
          <p>{c.body}</p>
          <SrcLine src={c.src} of={c.title} />
        </Sheet>
      ))}
      {more.map((m) => (
        <Sheet key={m.id} id={sheetId("more", m.id)} kicker="よく言われること" title={m.title}>
          {m.parts.map((p, i) => (
            <p key={i}>{p.text}</p>
          ))}
          <SrcLine src={m.src} of={m.title} />
        </Sheet>
      ))}
      {areas.map((a) => (
        <Sheet key={a.id} id={sheetId("area", a.id)} kicker="エリア" title={a.name} tone={a.color}>
          <p className="gb-lead">{a.lead}</p>
          <p>{a.body}</p>
          <h4 className="gb-h4">このエリアの見たいもの</h4>
          <MiniTiles items={a.see.map((id) => byId.get(id)).filter((x): x is Item => !!x)} />
          <SrcLine src={a.src} of={a.name} />
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

function AreaMap({ areas, drawn }: { areas: Area[]; drawn: Drawn }) {
  const am = drawn.areamap;
  if (am) {
    /* 絵の上の札は、id か名前で合わせる。**合わないエリアは、絵の下に札で並べる**（黙って落とさない） */
    const at = new Map<string, { x: number; y: number }>();
    for (const a of areas) {
      const p = am.areas.find((x) => x.id === a.id || x.name === a.name);
      if (p) at.set(a.id, p);
    }
    const rest = areas.filter((a) => !at.has(a.id));
    return (
      <figure className="gb-amap" data-gb="areamap">
        <div className="gb-amap-art" style={{ aspectRatio: am.w && am.h ? `${am.w} / ${am.h}` : "1 / 1" }}>
          <img src={am.src} width={am.w} height={am.h} alt={`イラスト：${am.alt || "エリアの地図"}`} loading="lazy" decoding="async" />
          <i className="gb-pic-tag">イラスト・位置は目安</i>
          {areas
            .filter((a) => at.has(a.id))
            .map((a) => {
              const p = at.get(a.id)!;
              return (
                <a
                  key={a.id}
                  className="gb-amap-pin"
                  href={`#${sheetId("area", a.id)}`}
                  style={{ left: `${p.x * 100}%`, top: `${p.y * 100}%`, ["--c" as string]: a.color }}
                >
                  {a.name}
                </a>
              );
            })}
        </div>
        {rest.length > 0 && <AreaPlan areas={rest} />}
      </figure>
    );
  }
  return (
    <figure className="gb-amap" data-gb="areamap">
      <AreaPlan areas={areas} />
      <figcaption>位置は目安（上が北）</figcaption>
    </figure>
  );
}

/** 絵の無いあいだの、色の札のエリア地図。**並びは大まかな位置関係**（`Area.plan`。北が上） */
function AreaPlan({ areas }: { areas: Area[] }) {
  return (
    <div className="gb-plan">
      {areas.map((a) => (
        <a
          key={a.id}
          className="gb-plan-a"
          href={`#${sheetId("area", a.id)}`}
          style={{ gridColumn: `${a.plan[0]} / span ${a.plan[2]}`, gridRow: a.plan[1], ["--c" as string]: a.color }}
        >
          <b>{a.name}</b>
          <span>{a.lead}</span>
          <i>見たいもの {a.see.length}</i>
        </a>
      ))}
    </div>
  );
}
