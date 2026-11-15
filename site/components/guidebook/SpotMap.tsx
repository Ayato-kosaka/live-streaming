import type { Drawn } from "@/content/guidebook/manifest";
import { inBox, place, project, spotOrder, tagLines } from "@/content/guidebook/spotmap";
import { SPOT_RULE } from "@/content/guidebook/types";
import type { Area, Guidebook, Item, MapBeyond, MapDir, Pic } from "@/content/guidebook/types";
import { mapsSearch } from "@/lib/mapsSearch";

import { sheetId, shortName } from "./parts";

/**
 * **見どころマップ**（どんな街の「エリア」。#1228。あやと 2026-11-15「こんな感じで地区分けして、見どころマップみたいにしたいの」）。
 *
 * 描いた絵地図（字の無いイラスト）の上に、**面の側で**重ねる（字も番号も絵に焼かない。`docs/guide-design.md` 4-2）:
 *
 * - 番号つきの丸い写真のピン（押すと見たいものの窓）。代表の決まりは `types.ts` の `SpotRule`
 * - 地区の名前の札（押すとエリアの窓）
 * - 絵の外の所の、縁の矢印（押すとその所の窓。窓が無ければ Google マップ）
 *
 * 下に**一覧（凡例）**: 地区ごとに、番号と見どころの名前。ピンの立たなかった見どころも、ここには全部出る。
 * 位置はどれも書き出すときに決める（`content/guidebook/spotmap.ts`）。JS を使わないので、画面が出た瞬間から押せる。
 *
 * 絵が無い街は、エリアの色の札を大まかな位置関係（北が上）で並べる——**壊れた絵の枠を出さない**。
 */
export default function SpotMap({ g, drawn }: { g: Guidebook; drawn: Drawn }) {
  const areas = g.about.areas;
  const am = drawn.areamap;
  if (!am) {
    return (
      <figure className="gb-amap" data-gb="areamap">
        <AreaPlan areas={areas} />
        <figcaption>位置は目安（上が北）</figcaption>
      </figure>
    );
  }
  const aspect = am.w && am.h ? am.h / am.w : 1;

  /* 地区の札は、manifest の位置に id か名前で合わせる。合わない地区は札を出さず、一覧の見出しにだけ出る */
  const tagIn = areas.flatMap((a) => {
    const p = am.areas.find((x) => x.id === a.id || x.name === a.name);
    return p ? [{ id: a.id, name: a.name, x: p.x, y: p.y }] : [];
  });
  const order = spotOrder(g.see.items, g.todo, areas.map((a) => a.id));
  const pos = new Map<string, { x: number; y: number }>();
  if (am.bbox) for (const it of g.see.items) if (it.at) pos.set(it.id, project(am.bbox, it.at.lat, it.at.lon));
  const onMap = (it: Item) => pos.has(it.id) && inBox(pos.get(it.id)!);
  const lay = place(
    aspect,
    /* 写真の無いものは立てない（写真のピンの地図に、頭の1字だけの丸を混ぜない。`SpotRule` の 1） */
    order.filter((it) => onMap(it) && it.pic).map((it) => ({ id: it.id, ...pos.get(it.id)! })),
    tagIn,
    am.beyond,
    am.bbox ? SPOT_RULE.max : 0,
  );
  const pinOf = new Map(lay.pins.map((p) => [p.id, p]));

  /* 一覧の組み。地区の並び → その中はピン（番号つき）が先、残りは選ぶ順。**番号は一覧の並びで1から** */
  const color = new Map(areas.map((a) => [a.id, a.color]));
  const groups: { area?: Area; rows: Item[] }[] = areas.map((a) => ({ area: a, rows: order.filter((it) => it.area === a.id) }));
  const loose = order.filter((it) => onMap(it) && !(it.area && color.has(it.area)));
  if (loose.length) groups.push({ rows: loose });
  for (const gr of groups) gr.rows.sort((a, b) => Number(pinOf.has(b.id)) - Number(pinOf.has(a.id)));
  const num = new Map<string, number>();
  for (const gr of groups) for (const it of gr.rows) if (pinOf.has(it.id)) num.set(it.id, num.size + 1);

  /* 地図の外は矢印（絵の縁）だけを一覧に並べる。座標が絵の外の見たいもの（日帰りなど）は、見たいものの節の
     「中心から離れた所」に出ている——ここにも並べると、一覧が地図の倍の長さになった（スコピエで 1,600px） */
  const seeIds = new Map(g.see.items.map((it) => [it.id, it]));
  const todoIds = new Map(g.todo.map((t) => [t.id, t]));
  const goTo = (b: MapBeyond) =>
    seeIds.has(b.id)
      ? { href: `#${sheetId("see", b.id)}`, line: seeIds.get(b.id)!.line }
      : todoIds.has(b.id)
        ? { href: `#${sheetId("do", b.id)}`, line: undefined }
        : { href: mapsSearch(b.local ?? b.name, g.local.text), line: "マップで見る", ext: true };
  const at =(p: { x: number; y: number }) => ({ left: `${p.x * 100}%`, top: `${p.y * 100}%` });
  const leads = lay.pins.filter((p) => p.leader);
  const H = 100 * aspect;

  return (
    <figure className="gb-amap" data-gb="areamap">
      <div className="gb-amap-art" style={{ aspectRatio: am.w && am.h ? `${am.w} / ${am.h}` : "1 / 1" }}>
        <img src={am.src} width={am.w} height={am.h} alt={`イラスト：${am.alt || "エリアの地図"}`} loading="lazy" decoding="async" />
        {leads.length > 0 && (
          <svg className="gb-amap-lines" viewBox={`0 0 100 ${H}`} preserveAspectRatio="none" aria-hidden="true">
            {leads.map((p) => (
              <g key={p.id}>
                <line className="is-halo" x1={p.tx * 100} y1={p.ty * H} x2={p.x * 100} y2={p.y * H} />
                <line x1={p.tx * 100} y1={p.ty * H} x2={p.x * 100} y2={p.y * H} />
              </g>
            ))}
          </svg>
        )}
        {leads.map((p) => (
          <i key={p.id} className="gb-amap-dot" style={at({ x: p.tx, y: p.ty })} aria-hidden="true" />
        ))}
        {lay.arrows.map((a) => {
          const b = am.beyond.find((x) => x.id === a.id)!;
          const to = goTo(b);
          return (
            <a
              key={a.id}
              className="gb-amap-out"
              data-dir={b.dir}
              href={to.href}
              {...(to.ext ? { target: "_blank", rel: "noreferrer", "aria-label": `${b.name}（地図の外・${dirName(b.dir)}）をマップで見る` } : {})}
              style={at(a)}
            >
              <Arrow dir={b.dir} />
              <span>{b.name}</span>
            </a>
          );
        })}
        {lay.tags.map((t) => {
          const a = areas.find((x) => x.id === t.id)!;
          const o = tagIn.find((x) => x.id === t.id)!;
          const ls = tagLines(a.name);
          return (
            <a
              key={a.id}
              className={`gb-amap-pin${ls.length > 1 ? " is-2" : ""}`}
              /* 描いた絵の上の元の位置（manifest）。ずらしたあとでも、どこから動かしたかを見張りが読む */
              data-x={o.x}
              data-y={o.y}
              href={`#${sheetId("area", a.id)}`}
              style={{ ...at(t), ["--c" as string]: a.color }}
            >
              {ls.map((l, i) => (
                <span key={i}>{l}</span>
              ))}
            </a>
          );
        })}
        {lay.pins.map((p) => {
          const it = seeIds.get(p.id)!;
          return (
            <a
              key={p.id}
              className="gb-amap-spot"
              /* 本当の位置（絵の上の割合）。引き出し線でずらしたあとでも、見張りが元の位置を読む */
              data-tx={p.tx}
              data-ty={p.ty}
              href={`#${sheetId("see", p.id)}`}
              style={{ ...at(p), ["--c" as string]: (it.area && color.get(it.area)) || undefined }}
            >
              <img src={tiny(it.pic!)} alt="" width={44} height={44} loading="lazy" decoding="async" referrerPolicy="no-referrer" />
              <b className="gb-amap-n" aria-hidden="true">
                {num.get(p.id)}
              </b>
              <span className="sr-only">
                {num.get(p.id)} {it.name}
              </span>
            </a>
          );
        })}
        <i className="gb-pic-tag">イラスト・位置は目安</i>
      </div>

      <div className="gb-maplg">
        {groups.map((gr) => (
          <section key={gr.area?.id ?? "loose"} className="gb-lg" style={gr.area ? { ["--c" as string]: gr.area.color } : undefined}>
            {gr.area ? (
              <a className="gb-lg-h" href={`#${sheetId("area", gr.area.id)}`}>
                <b>
                  {gr.area.name}
                  {gr.area.local?.kana && <small>{gr.area.local.kana}</small>}
                </b>
                <span>{gr.area.lead}</span>
              </a>
            ) : (
              <h4 className="gb-lg-h is-plain">
                <b>そのほか</b>
              </h4>
            )}
            <LegendRows rows={gr.rows.filter((it) => num.has(it.id))} num={num} />
            {/* ピンの立たなかったものは畳む。開けば同じ札で並ぶ（全部広げると、一覧が地図の3倍の長さになった） */}
            {gr.rows.some((it) => !num.has(it.id)) && (
              <details className="gb-lg-more">
                <summary>ほかに{gr.rows.filter((it) => !num.has(it.id)).length}か所</summary>
                <LegendRows rows={gr.rows.filter((it) => !num.has(it.id))} num={num} />
              </details>
            )}
          </section>
        ))}
        {am.beyond.length > 0 && (
          <section className="gb-lg is-out">
            <h4 className="gb-lg-h is-plain">
              <b>地図の外</b>
            </h4>
            <ul className="gb-lg-list">
              {am.beyond.map((b) => {
                const to = goTo(b);
                return (
                  <li key={b.id}>
                    <a href={to.href} {...(to.ext ? { target: "_blank", rel: "noreferrer" } : {})}>
                      <Arrow dir={b.dir} />
                      <span>
                        {b.name}
                        {to.line && <small>{to.line}</small>}
                      </span>
                    </a>
                  </li>
                );
              })}
            </ul>
          </section>
        )}
      </div>
    </figure>
  );
}

/** 一覧の札。ピンの立ったものは番号、立たなかったものは地区の色の点 */
function LegendRows({ rows, num }: { rows: Item[]; num: Map<string, number> }) {
  if (!rows.length) return null;
  return (
    <ul className="gb-lg-list">
      {rows.map((it) => (
        <li key={it.id}>
          <a href={`#${sheetId("see", it.id)}`}>
            {num.has(it.id) ? <b className="gb-amap-n">{num.get(it.id)}</b> : <i aria-hidden="true" />}
            <span>{shortName(it.name)}</span>
          </a>
        </li>
      ))}
    </ul>
  );
}

const ROT: Record<MapDir, number> = { n: 0, ne: 45, e: 90, se: 135, s: 180, sw: 225, w: 270, nw: 315 };
const DIR_NAME: Record<MapDir, string> = { n: "北", ne: "北東", e: "東", se: "南東", s: "南", sw: "南西", w: "西", nw: "北西" };
const dirName = (d: MapDir) => DIR_NAME[d];

/** 向きの矢印（上が北）。読み上げには向きの字で渡す */
function Arrow({ dir }: { dir: MapDir }) {
  return (
    <svg className="gb-amap-arw" viewBox="0 0 14 14" width="14" height="14" role="img" aria-label={`${dirName(dir)}へ`}>
      <path d="M7 1.5 12 7.5H8.6V12.5H5.4V7.5H2Z" transform={`rotate(${ROT[dir]} 7 7)`} />
    </svg>
  );
}

/**
 * ピンの小さい写真。Wikimedia のサムネイルは決まった幅だけ返る（120 / 250 / 330 / 500 / 960 / 1920。`CLAUDE.md`）。
 * ピンは 44px なので、2倍の画面でも 120 で足りる（500 のままだと、10本で 10倍の重さになる）
 */
function tiny(p: Pic) {
  const s = p.small ?? p.src;
  return /upload\.wikimedia\.org\/.+\/\d+px-[^/]+$/.test(s) ? s.replace(/\/\d+px-([^/]+)$/, "/120px-$1") : s;
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
