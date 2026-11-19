import Icon from "@/components/ui/Icon";
import type { Drawn } from "@/content/guidebook/manifest";
import { SITE } from "@/content/site";
import { place, tagLines } from "@/content/guidebook/spotmap";
import type { Area, Guidebook, MapBeyond, MapDir } from "@/content/guidebook/types";
import { travelCity } from "@/content/travel";
import { JsonLd, abs } from "@/lib/jsonld";
import { mapsSearch } from "@/lib/mapsSearch";

import LateArt from "./LateArt";
import { sheetId, widthOf } from "./parts";

/**
 * **どんな街の地図**（#1228）。どのあたりが、どんな地区か——**概要だけ**を1枚で伝える。
 *
 * 描いた絵地図（字の無いイラスト）の上に、**面の側で**重ねる（字は絵に焼かない。`docs/guide-design.md` 4-2）:
 *
 * - 地区の名前の札（押すとエリアの窓）
 * - 絵の外の所の、縁の矢印（押すとその所の窓。窓が無ければ Google マップ）
 *
 * 下に、地区ごとの**雰囲気のひとこと**。その下に、詳しい場所を見る「見たいもの」の地図への案内を1つ。
 *
 * ## 写真のピンと番号の一覧は、やめた（あやと 2026-11-16「見どころマップがダサい」）
 *
 * 前は番号つきの写真のピンを本当の位置に立て、地区ごとの番号の一覧を下に置いていた。マイマップと用途が違う——
 * 詳しい場所はマイマップの役目で、ここは概要を伝えるのが目的（`docs/island-misses.md` #327）。
 *
 * 位置は書き出すときに決める（`content/guidebook/spotmap.ts`）。JS を使わないので、画面が出た瞬間から押せる。
 * 絵が無い街は、エリアの色の札を大まかな位置関係（北が上）で並べる——**壊れた絵の枠を出さない**。
 *
 * ## 名前を焼いた地図（`am.baked`。ソフィア。#1262）
 *
 * あやと（2026-11-18）「見どころマップと検索したら、画像検索の結果に、地区の表示が出て欲しい」。画像検索に出るのは
 * 絵だけなので、地区の色と名前を**絵に焼いた**（`.claude/skills/chatgpt-image/guide_layout.py`）。面の側は:
 *
 * - 札を重ねない。焼いた札の上に**透明の押しどころ**だけ置く（押すとエリアの窓。前と同じ）
 * - 見出しを「<街>の見どころマップ（地区分け）」にし、絵の名前・alt と同じ語にそろえる（検索の側が絵と語を結ぶ）
 * - 大きい版（横 1200px）を `src`、小さい版を `srcSet` に。ImageObject（構造化データ）にも大きい版を載せる。
 *   画像のサイトマップは `app/sitemap.ts`
 */
/** 地図のすぐ上の見出し（`About.tsx`）。名前を焼いた地図は、絵の名前・alt・構造化データと同じ語 */
export const mapTitle = (g: Guidebook, drawn: Drawn) =>
  drawn.areamap?.baked ? `${g.name}の見どころマップ（地区分け）` : "どのあたりに何がある？";

export default function SpotMap({ g, drawn }: { g: Guidebook; drawn: Drawn }) {
  const areas = g.about.areas;
  const am = drawn.areamap;
  const toMap = g.see.map && (
    <p className="gb-amap-more">
      <a href="#see-mymap">
        <Icon name="map" size={20} />
        詳しい場所は「見たいもの」の地図で
      </a>
    </p>
  );
  if (!am) {
    return (
      <figure className="gb-amap" data-gb="areamap">
        <AreaPlan areas={areas} />
        <figcaption>位置は目安（上が北）</figcaption>
        {toMap}
      </figure>
    );
  }
  const aspect = am.w && am.h ? am.h / am.w : 1;

  /* 地区の札は、manifest の位置に id か名前で合わせる。合わない地区は札を出さず、下のひとことにだけ出る */
  const tagIn = areas.flatMap((a) => {
    const p = am.areas.find((x) => x.id === a.id || x.name === a.name);
    return p ? [{ id: a.id, name: a.name, x: p.x, y: p.y, w: p.w ?? 0, h: p.h ?? 0 }] : [];
  });
  if (am.baked) {
    /* 絵に焼いた名前と、面の地区の名前が食い違ったら止める（絵は読み直せない。名前を直したら焼き直す） */
    const off = areas.filter((a) => !am.areas.some((x) => x.id === a.id && x.name === a.name));
    if (off.length)
      throw new Error(`SpotMap: 地図の絵に焼いた地区の名前が、面の地区と合わない（${off.map((a) => a.name).join("・")}）。guide_art.py finalize で焼き直す`);
  }
  const lay = am.baked ? place(aspect, [], am.beyond, tagIn, am.painted) : place(aspect, tagIn, am.beyond);

  const seeIds = new Set(g.see.items.map((it) => it.id));
  const todoIds = new Set(g.todo.map((t) => t.id));
  const goTo = (b: MapBeyond) =>
    seeIds.has(b.id)
      ? { href: `#${sheetId("see", b.id)}` }
      : todoIds.has(b.id)
        ? { href: `#${sheetId("do", b.id)}` }
        : { href: mapsSearch(b.local ?? b.name, g.local.text), ext: true };
  const at = (p: { x: number; y: number }) => ({ left: `${p.x * 100}%`, top: `${p.y * 100}%` });

  const smallW = am.small && am.small !== am.src ? widthOf(am.small) : undefined;
  const page = travelCity(g.country, g.city).href;

  return (
    <figure className="gb-amap" data-gb="areamap">
      {am.baked && (
        <JsonLd
          data={{
            "@context": "https://schema.org",
            "@type": "ImageObject",
            /* 道に日本語が入る（絵の名前に「見どころマップ」）。機械に渡す URL は %XX にしておく */
            contentUrl: encodeURI(abs(am.src)),
            url: encodeURI(abs(am.src)),
            name: mapTitle(g, drawn),
            caption: am.alt,
            ...(am.w && am.h ? { width: am.w, height: am.h } : {}),
            encodingFormat: "image/webp",
            inLanguage: "ja",
            contentLocation: { "@type": "Place", name: g.name },
            mainEntityOfPage: abs(page),
            creditText: SITE.name,
            creator: { "@type": "Organization", name: SITE.name, url: abs("/") },
            copyrightNotice: `地図のデータ ${MAP_DATA}`,
          }}
        />
      )}
      {/* `data-gb-late`: 絵は画面に近づいてから読む（`LateArt.tsx`）。札と矢印は字なので、はじめから出る */}
      <div className="gb-amap-art" data-gb-late="" style={{ aspectRatio: am.w && am.h ? `${am.w} / ${am.h}` : "1 / 1" }}>
        <img
          src={am.src}
          {...(am.baked && smallW && am.w ? { srcSet: `${am.small} ${smallW}w, ${am.src} ${am.w}w`, sizes: "(min-width: 720px) 640px, 100vw" } : {})}
          width={am.w}
          height={am.h}
          alt={`イラスト：${am.alt || "エリアの地図"}`}
          loading="lazy"
          decoding="async"
        />
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
          if (am.baked)
            /* 焼いた札の上の、透明の押しどころ。字は絵に在るので、ここは読み上げにだけ名前を渡す */
            return (
              <a
                key={a.id}
                className="gb-amap-pin is-baked"
                data-x={o.x}
                data-y={o.y}
                href={`#${sheetId("area", a.id)}`}
                style={{ ...at(t), width: `${o.w * 100}%`, height: `${o.h * 100}%` }}
              >
                <span className="gb-amap-vh">{a.name}</span>
              </a>
            );
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
        {/* 「イラスト」の字は乗せない（出どころの欄に1行。`docs/island-misses.md` #328）。位置が目安なことだけ */}
        <i className="gb-pic-tag">位置は目安</i>
      </div>

      {/* 地区の雰囲気のひとこと。札と同じ窓へ（地図の札は小さいので、指で押しやすい所をもう1つ） */}
      <ul className="gb-amap-lg">
        {areas.map((a) => (
          <li key={a.id} style={{ ["--c" as string]: a.color }}>
            <a href={`#${sheetId("area", a.id)}`}>
              <b>{a.name}</b>
              <span>{a.lead}</span>
            </a>
          </li>
        ))}
      </ul>
      {toMap}
      <LateArt />
    </figure>
  );
}

/** 地図の下敷きのデータの出どころ（manifest の `base`。ここでは構造化データの字に使う） */
const MAP_DATA = "© OpenStreetMap contributors";

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
          {a.went && (
            <i>
              <span className="gb-went">歩いた</span>
            </i>
          )}
        </a>
      ))}
    </div>
  );
}
