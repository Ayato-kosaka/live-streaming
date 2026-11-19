import { peakPaths } from "./peak";
import { bucket } from "./dots";
import type { CountryMapData } from "./countryMaps";

/**
 * **国の寄り地図の「絵」の部分（海・陸・山・森・線・街の点）を、SVG の字で組む。**（#1262・#332）
 *
 * 前は `CountryMap.tsx` が JSX で面に直に描いていた。面に描いた SVG は、検索の機械から見ると**絵ではない**
 * （画像検索に出ない・画像のサイトマップに載せられない・alt もファイル名も持てない）。国の面が
 * 「地図の絵 0枚」と数えられていたのはそれ。だから同じ絵を**1枚の絵のファイルに焼いて**面に置く
 * （`tools/sprites/countrymap_bake.mjs` → `site/public/travel/<国>/<国名>の地図-<幅>.webp`）。
 *
 * ## なぜ JSX ではなく字で組むか
 *
 * 焼く道具（Node）と面（Next）の**両方が同じ1本**を読むため。Node は TS の型を剥がして読める
 * （22.18 から既定）が、JSX と `@/` の道は読めない。ここは `./peak` `./dots` だけを読む。
 *
 * ## 色は字で持つ（CSS の変数を使わない）
 *
 * 絵のファイルの中では、面の CSS の変数が効かない。色を字で持つと、**この関数が返す字そのものが絵の中身の全部**になり、
 * その字の指紋（`artHash`）で「焼いた絵が古いか」を言い切れる。値は `app/css/atlas.css` `tokens.css` と同じ
 * （ずれたら `tools/sprites/countrymap_selftest.mjs` が落ちる）。街の名札・方位・縮尺は面の HTML のまま
 * （絵に焼くと、スマホ幅で 8px になって読めない）。
 */

/** 地図の色。`app/css/atlas.css` の `--am-*` と `tokens.css` の2つ。名前は CSS の変数の名前そのまま */
export const ART_COLORS = {
  "--am-sea-deep": "#1466c8",
  "--am-sea-mid": "#2f97d8",
  "--am-shelf": "#4fc8d2",
  "--am-shelf-hi": "#7fe0d8",
  "--am-foam": "#ffffff",
  "--am-sand": "#f5e0a8",
  "--am-sand-wet": "#e4c684",
  "--am-off-n": "#bcd39a",
  "--am-off-s": "#ddd3a2",
  "--am-on-n": "#8cd85a",
  "--am-on-s": "#e3d383",
  "--am-wood": "#4b9c46",
  "--am-dune": "#d9bd7a",
  "--am-ridge": "#b08a5a",
  "--am-route": "#ff8a1f",
  "--am-walk": "#ff4f6d",
  "--am-hitch": "#ffcf4d",
  "--am-side": "#ffc07a",
  "--paper-out": "#f4efcf",
  "--accent": "#ff7092",
} as const;

const C = (k: keyof typeof ART_COLORS) => ART_COLORS[k];

/** 移動の線の描きかた。凡例（`CountryMap.tsx`）も同じ表を読む */
export const MOVE: Record<string, { c: string; w: number; dash?: string }> = {
  land: { c: C("--am-route"), w: 7 },
  air: { c: "#ffffff", w: 5, dash: "1 16" },
  sea: { c: "#ffffff", w: 5, dash: "1 12" },
  walk: { c: C("--am-walk"), w: 9, dash: "0.5 14" },
  hitch: { c: C("--am-hitch"), w: 6.5, dash: "14 12" },
  side: { c: C("--am-side"), w: 5.5, dash: "2 10" },
};

/** 属性の字。値に `"` `<` `&` は来ない（焼いた道と色だけ）が、来たら書き出しを止める */
function attrs(o: Record<string, string | number | undefined>): string {
  return Object.entries(o)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => {
      const s = String(v);
      if (/["<&]/.test(s)) throw new Error(`countryArt: 属性 ${k} に使えない字（${s.slice(0, 40)}）`);
      return ` ${k}="${s}"`;
    })
    .join("");
}
const el = (tag: string, o: Record<string, string | number | undefined>, inner?: string) =>
  inner === undefined ? `<${tag}${attrs(o)}/>` : `<${tag}${attrs(o)}>${inner}</${tag}>`;

/** 絵の中身（`<defs>` から街の点まで）。並びと値は前の JSX と同じ */
export function countryArtInner(m: CountryMapData, slug: string): string {
  const { w, h } = m.view;
  const mine = m.countries[slug];
  const others = Object.entries(m.countries).filter(([s]) => s !== slug);
  const uid = `cm-${slug}`;
  const peaks = peakPaths(m.peaks);
  const woods = bucket(m.woods ?? [], 3);
  const dunes = bucket(m.dunes ?? [], 2);
  const glints = bucket(m.glints ?? [], 2);
  const out: string[] = [];

  /* 主役の国だけ穴が空いている膜。まわりを一段沈ませて、「どこがこの国か」を線ではなく明るさで言う。
     **同じかたちを2度書かない**——岸の帯は陸の線を `<use>` で5枚、主役の国は膜・塗り・ふちで3枚重ねる。
     名前は defs のほかのものとぶつけない（`uid` を頭に付ける） */
  out.push(
    el(
      "defs",
      {},
      [
        el("linearGradient", { id: `${uid}-sea`, x1: 0, y1: 0, x2: 0, y2: 1 }, [
          el("stop", { offset: 0, "stop-color": C("--am-sea-mid") }),
          el("stop", { offset: 1, "stop-color": C("--am-sea-deep") }),
        ].join("")),
        el("linearGradient", { id: `${uid}-off`, x1: 0, y1: 0, x2: 0, y2: 1 }, [
          el("stop", { offset: 0, "stop-color": C("--am-off-n") }),
          el("stop", { offset: 1, "stop-color": C("--am-off-s") }),
        ].join("")),
        el("linearGradient", { id: `${uid}-on`, x1: 0, y1: 0, x2: 0, y2: 1 }, [
          el("stop", { offset: 0, "stop-color": C("--am-on-n") }),
          el("stop", { offset: 0.62, "stop-color": "#c3dd72" }),
          el("stop", { offset: 1, "stop-color": C("--am-on-s") }),
        ].join("")),
        el("filter", { id: `${uid}-soft`, x: "-15%", y: "-15%", width: "130%", height: "130%" }, el("feGaussianBlur", { stdDeviation: 6 })),
        mine
          ? el("mask", { id: `${uid}-focus` }, [
              el("rect", { width: w, height: h, fill: "#ffffff" }),
              el("use", { href: `#${uid}-mine`, fill: "#000000" }),
            ].join(""))
          : "",
        el("path", { id: `${uid}-land`, d: m.land }),
        mine ? el("path", { id: `${uid}-mine`, d: mine }) : "",
      ].join(""),
    ),
  );

  out.push(el("rect", { width: w, height: h, fill: `url(#${uid}-sea)` }));

  /* 海の白いきらめき */
  for (const [r, d] of glints) {
    out.push(el("path", { d, stroke: "#ffffff", "stroke-width": r * 2, "stroke-linecap": "round", opacity: 0.2, fill: "none" }));
  }

  /* 岸。浅瀬 → 泡 → 濡れ砂 → 乾いた砂 */
  const land = `#${uid}-land`;
  out.push(
    el("use", { href: land, fill: "none", stroke: C("--am-shelf"), "stroke-width": 30, "stroke-linejoin": "round", opacity: 0.85, filter: `url(#${uid}-soft)` }),
    el("use", { href: land, fill: "none", stroke: C("--am-shelf-hi"), "stroke-width": 14, "stroke-linejoin": "round", opacity: 0.9 }),
    el("use", { href: land, fill: "none", stroke: C("--am-foam"), "stroke-width": 8, "stroke-linejoin": "round" }),
    el("use", { href: land, fill: "none", stroke: C("--am-sand-wet"), "stroke-width": 5.5, "stroke-linejoin": "round" }),
    el("use", { href: land, fill: `url(#${uid}-off)`, stroke: C("--am-sand"), "stroke-width": 3, "stroke-linejoin": "round" }),
  );

  /* まわりの国はうっすら。主役の国だけ明るく塗る */
  for (const [, d] of others) out.push(el("path", { d, fill: "#cfdca4", opacity: 0.75 }));
  if (mine) out.push(el("use", { href: `#${uid}-mine`, fill: `url(#${uid}-on)` }));

  /* 山 */
  out.push(
    el("path", { d: m.ridges, fill: "none", stroke: C("--am-ridge"), "stroke-width": 22, "stroke-linecap": "round", opacity: 0.26, filter: `url(#${uid}-soft)` }),
    el("g", {}, [
      el("path", { d: peaks.body, fill: "#a2703c" }),
      el("path", { d: peaks.face, fill: "#cb9c5f" }),
      el("path", { d: peaks.cap, fill: "#f7ecd2" }),
    ].join("")),
  );

  /* 森と砂丘。更地に見えないように地面に情報量を入れる */
  for (const [r, d] of woods) {
    out.push(el("path", { d, stroke: C("--am-wood"), "stroke-width": r * 2, "stroke-linecap": "round", opacity: 0.26, fill: "none" }));
  }
  for (const [r, d] of dunes) {
    out.push(el("path", { d, stroke: C("--am-dune"), "stroke-width": r * 2, "stroke-linecap": "round", opacity: 0.48, fill: "none" }));
  }

  out.push(
    el("path", { d: m.lakes, fill: C("--am-sea-mid") }),
    el("path", { d: m.rivers, fill: "none", stroke: "#60a0d8", "stroke-width": 3.2, "stroke-linecap": "round", opacity: 0.85 }),
    el("path", { d: m.grid, fill: "none", stroke: "#ffffff", "stroke-width": 1.6, opacity: 0.12 }),
  );

  /* 地形をぜんぶ描いたあとで、国の外だけを紙の色で薄く覆う。移動の線と街はこのあとに描くので、沈まない。
     国のふちは、かたい線を引かず、内側に落ちる淡い影で分ける */
  if (mine) {
    out.push(
      el("rect", { width: w, height: h, fill: C("--paper-out"), opacity: 0.4, mask: `url(#${uid}-focus)` }),
      el("use", { href: `#${uid}-mine`, fill: "none", stroke: "#3e7c33", "stroke-width": 4, opacity: 0.3 }),
    );
  }

  /* 移動した線 */
  for (const l of m.legs) {
    const s = MOVE[l.move] ?? MOVE.land;
    out.push(
      el("g", {}, [
        s.dash ? "" : el("path", { d: l.d, fill: "none", stroke: "#0d3f74", "stroke-width": s.w + 4, "stroke-linecap": "round", opacity: 0.22 }),
        el("path", { d: l.d, fill: "none", stroke: s.c, "stroke-width": s.w, "stroke-linecap": "round", "stroke-dasharray": s.dash }),
      ].join("")),
    );
  }

  /* 街。この国の街だけ大きく、まわりの国の街は小さい点 */
  for (const c of m.cities) {
    const own = c.country === slug;
    out.push(
      el("g", {}, [
        el("circle", { cx: c.x, cy: c.y, r: own ? 11 : 6, fill: "#0d3f74", opacity: 0.25, transform: "translate(1.5 2)" }),
        el("circle", { cx: c.x, cy: c.y, r: own ? 10 : 5.5, fill: "#fffbf0" }),
        own ? el("circle", { cx: c.x, cy: c.y, r: 5.5, fill: c.kind === "hub" ? C("--accent") : C("--am-route") }) : "",
      ].join("")),
    );
  }
  return out.join("");
}

/** 1枚の絵のファイルとしての SVG（焼く道具が読む）。**この字の指紋が `artHash`** */
export function countryArtSvg(m: CountryMapData, slug: string): string {
  const { w, h } = m.view;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${countryArtInner(m, slug)}</svg>`;
}

/**
 * 焼いた絵の置き場（面の道）。**ファイル名に「〈国〉の地図」**——画像検索は絵の名前も読む
 * （`docs/seo.md` 7章・Google の画像の手引き「ファイル名は短く中身を言う。日本語は %XX で可」）。
 * 見どころマップ（`ソフィア-見どころマップ-地区分け-1200.webp`）と同じく、道には日本語のまま置く
 */
export const artSrc = (slug: string, name: string, width: number) => `/travel/${slug}/${name}の地図-${width}.webp`;

/** 焼く幅。面の地図は PC で 560px ほど、スマホで 358px ほど（dpr 2〜3 で 1,074px）なので、この2枚で足りる */
export const ART_WIDTHS = [600, 1200] as const;
