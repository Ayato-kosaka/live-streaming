import Icon from "@/components/ui/Icon";
import type { Drawn } from "@/content/guidebook/manifest";
import type { Area, Guidebook, Item } from "@/content/guidebook/types";

import Sheet from "./Sheet";
import { WentBox } from "./Videos";
import { Ext, Picture, Sec, SrcLine, sheetId, shortName } from "./parts";

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

      <h3 className="gb-sub">エリア</h3>
      <AreaMap areas={areas} drawn={drawn} />

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
    const placed = spread(
      areas.filter((a) => at.has(a.id)).map((a) => ({ id: a.id, name: a.name, ...at.get(a.id)! })),
      am.w && am.h ? am.h / am.w : 1,
    );
    return (
      <figure className="gb-amap" data-gb="areamap">
        <div className="gb-amap-art" style={{ aspectRatio: am.w && am.h ? `${am.w} / ${am.h}` : "1 / 1" }}>
          <img src={am.src} width={am.w} height={am.h} alt={`イラスト：${am.alt || "エリアの地図"}`} loading="lazy" decoding="async" />
          <i className="gb-pic-tag">イラスト・位置は目安</i>
          {areas
            .filter((a) => at.has(a.id))
            .map((a) => {
              const p = placed.get(a.id)!;
              const o = at.get(a.id)!;
              return (
                <a
                  key={a.id}
                  className="gb-amap-pin"
                  /* 描いた絵の上の元の位置（manifest）。ずらしたあとでも、どこから動かしたかを見張りが読む */
                  data-x={o.x}
                  data-y={o.y}
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

/** 札を置く位置を決める、いちばん狭い絵の幅（px）。390px の画面で絵は 366px。それより少し狭い端末も見込む */
const NARROW = 340;
/** 札の高さ（`.gb-amap-pin` の min-height 40px）と、札どうしの間 */
const PIN_H = 40;
const PIN_GAP = 6;

/** 札の幅の見積もり（px）。字の幅は 13px の太字で、全角 14px・半角 8px に、左右の余白 24px と少しの遊び */
const pinW = (name: string) => [...name].reduce((w, ch) => w + (/[\x20-\x7e]/.test(ch) ? 8 : 14), 0) + 24 + 8;

/**
 * **エリアの札どうしを重ねない。** 札の位置は描いた絵の割合（manifest の `areas` の x・y）で、札の大きさは px なので、
 * 狭い画面ほど札が大きく見えて隣と重なる（ソフィアの「中心・セルディカ」と「ネフスキー大聖堂まわり」が 390px で重なった）。
 *
 * いちばん狭い絵（`NARROW`）で札の箱を見積もり、重なったら**上下にずらす**（横は位置の意味が強いので動かさない）。
 * 絵の外にはみ出す札は、絵の内側へ寄せる。広い画面では札が相対的に小さくなるので、狭い画面で重ならなければ重ならない。
 * 書き出すときに1回だけ決める（JS を使わない。画面が出た瞬間から押せる）
 */
function spread(pins: { id: string; name: string; x: number; y: number }[], aspect: number) {
  const H = NARROW * aspect;
  const box = pins.map((p) => {
    const w = pinW(p.name) / NARROW;
    const h = (PIN_H + PIN_GAP) / H;
    return { ...p, w, h, x: Math.min(Math.max(p.x, w / 2), 1 - w / 2), y: Math.min(Math.max(p.y, h / 2), 1 - h / 2) };
  });
  const hit = (a: (typeof box)[number], b: (typeof box)[number]) =>
    Math.abs(a.x - b.x) < (a.w + b.w) / 2 && Math.abs(a.y - b.y) < (a.h + b.h) / 2;
  /* 上から順に置き、先に置いた札と重なったら、離れる向きへ必要なぶんだけ動かす。動かした先でまた重なれば繰り返す */
  const done: typeof box = [];
  for (const p of [...box].sort((a, b) => a.y - b.y)) {
    for (let i = 0; i < 12; i++) {
      const o = done.find((q) => hit(p, q));
      if (!o) break;
      const down = p.y >= o.y;
      const ny = down ? o.y + (o.h + p.h) / 2 : o.y - (o.h + p.h) / 2;
      /* 絵の端に当たったら、反対の向きへ */
      p.y = ny > 1 - p.h / 2 || ny < p.h / 2 ? (down ? o.y - (o.h + p.h) / 2 : o.y + (o.h + p.h) / 2) : ny;
      p.y = Math.min(Math.max(p.y, p.h / 2), 1 - p.h / 2);
    }
    done.push(p);
  }
  return new Map(done.map((p) => [p.id, { x: p.x, y: p.y }]));
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
          <i>
            {a.see.length > 0 && `見たいもの ${a.see.length}`}
            {a.went && <span className="gb-went">歩いた</span>}
          </i>
        </a>
      ))}
    </div>
  );
}
