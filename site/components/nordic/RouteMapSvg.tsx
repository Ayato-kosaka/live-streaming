import Link from "next/link";
import MAP from "@/content/nordic/map.json";
import { NORDIC_COUNTRIES, ROUTE } from "@/content/nordic";

/**
 * 北欧ルートの地図。
 *
 * 形は本物。Natural Earth の海岸線を切り出して、ランベルト正角円錐で投影してある
 * （`python/build_nordic_map.py`）。街・ルート・国名・縮尺・方位も、ぜんぶ
 * あのスクリプトが座標まで計算して焼き込んでいる。
 * **ここで経度緯度から座標を計算し直さないこと。必ずズレる。**
 *
 * 塗りは島と同じ作り。輪郭線を引かず、
 *   深い海 → 浅瀬 → 白い泡 → 濡れた砂 → 砂浜 → 草
 * の帯で陸と海を分ける（docs/ac-reference.md 2章）。
 * 色はぜんぶ CSS 変数。生の色をここに書くと、島の色を変えたときに
 * 地図だけ取り残されて浮く。
 */

/**
 * 街の名札をどちらに出すか。
 * 近い街どうしがぶつからないよう、実際に描いた絵を見て手で決める。
 * w は当たり判定の幅。指で押せる大きさを名札のぶんだけ稼ぐために使う。
 */
const LABEL: Record<string, { dx: number; dy: number; at: "start" | "middle" | "end" }> = {
  katowice: { dx: -20, dy: -16, at: "end" },
  krakow: { dx: 24, dy: 24, at: "start" },
  oswiecim: { dx: -18, dy: 42, at: "end" },
  warszawa: { dx: 26, dy: 10, at: "start" },
  bialystok: { dx: 26, dy: 10, at: "start" },
  vilnius: { dx: 26, dy: 12, at: "start" },
  siauliai: { dx: -24, dy: 8, at: "end" },
  riga: { dx: -26, dy: 4, at: "end" },
  tallinn: { dx: 26, dy: 14, at: "start" },
  helsinki: { dx: 26, dy: -10, at: "start" },
  stockholm: { dx: -26, dy: 6, at: "end" },
};

/** 区間の線の描き方。太さだけここで決めて、色は CSS 変数に逃がす。 */
const LEG: Record<string, { cls: string; width: number; dash?: string }> = {
  hitch: { cls: "is-hitch", width: 11 },
  ferry: { cls: "is-ferry", width: 8, dash: "4 20" },
  side: { cls: "is-side", width: 6, dash: "3 14" },
};

/** ピンの大きさ。泊まる街を大きく、通るだけの街を小さく。 */
const PIN: Record<string, number> = { goal: 15, stay: 12, pass: 9, side: 8, land: 9 };

/** 凡例。地図の中に置くぶんは、線の見分けだけに絞る。 */
const KEYS: { cls: string; label: string; dash?: string; width: number }[] = [
  { cls: "is-hitch", label: "ヒッチハイク", width: 11 },
  { cls: "is-ferry", label: "フェリー", width: 8, dash: "4 20" },
  { cls: "is-side", label: "寄り道", width: 6, dash: "3 14" },
];

export default function RouteMapSvg({ here }: { here?: string }) {
  const { view, land, countries, cities, legs, fly } = MAP;
  const { lakes, rivers, grid, woods, glints, labels, seas, scale, north } = MAP;
  const name = Object.fromEntries(NORDIC_COUNTRIES.map((c) => [c.slug, c.name]));
  const cityName = Object.fromEntries(cities.map((c) => [c.id, c.name]));

  // 距離は content/nordic.ts のルートが持っているものをそのまま使う。
  // 地図の側にもう一組 km を書くと、片方だけ直したときに黙って食い違う。
  // 街の名前で引き当てる（「オシフィエンチム（アウシュヴィッツ）」のような
  // 補足つきの表記があるので、括弧から先は落として比べる）。
  const bare = (s: string) => s.replace(/（.*$/, "");
  const km = new Map(ROUTE.map((l) => [`${bare(l.from)}|${bare(l.to)}`, l.km]));

  // 凡例の板。左上はノルウェー沖で、ルートからいちばん遠い。
  // 左下に置くとカトヴィツェとオシフィエンチムの名札にぶつかる。
  const lg = { x: 24, y: 24, w: 330, h: 234 };

  return (
    <svg
      className="nmap"
      viewBox={`0 0 ${view.w} ${view.h}`}
      role="img"
      aria-label="ジョージアを出て、ポーランドからバルト三国を北上し、フェリーで北欧へ抜けるルートの地図"
    >
      <defs>
        <linearGradient id="nmSea" x1="0.1" y1="0" x2="0.35" y2="1">
          <stop className="nm-sea-a" offset="0" />
          <stop className="nm-sea-b" offset="0.52" />
          <stop className="nm-sea-c" offset="1" />
        </linearGradient>
        <linearGradient id="nmLand" x1="0" y1="0" x2="0.2" y2="1">
          <stop className="nm-land-a" offset="0" />
          <stop className="nm-land-b" offset="1" />
        </linearGradient>
        <radialGradient id="nmGlint">
          <stop className="nm-glint-a" offset="0" />
          <stop className="nm-glint-b" offset="1" />
        </radialGradient>
        {/* 浅瀬はふちをぼかす。かたい切り替わりを作らない（島の絵の原則） */}
        <filter id="nmShelf" x="-8%" y="-8%" width="116%" height="116%">
          <feGaussianBlur stdDeviation="11" />
        </filter>
        <filter id="nmDrop" x="-30%" y="-30%" width="160%" height="180%">
          <feDropShadow dx="0" dy="4" stdDeviation="4" floodOpacity="0.28" />
        </filter>
        <clipPath id="nmLandClip">
          <path d={land} />
        </clipPath>
      </defs>

      {/* ---- 海 ---------------------------------------------------- */}
      <rect width={view.w} height={view.h} fill="url(#nmSea)" />
      {/* うねり。島の海と同じ、うっすら流れる線 */}
      <g className="nm-swell">
        {Array.from({ length: 17 }, (_, i) => {
          const y = 30 + i * 58;
          return (
            <path
              key={i}
              d={`M${(i % 3) * 96 - 60} ${y}q46 -13 92 0t92 0t92 0t92 0t92 0t92 0t92 0t92 0t92 0t92 0t92 0t92 0`}
            />
          );
        })}
      </g>
      {/* きらめき。陸から離れた開いた海にだけ置いてある（ac-reference 1章） */}
      <g className="nm-glints">
        {glints.map(([x, y, r], i) => (
          <ellipse key={i} cx={x} cy={y} rx={r} ry={r * 0.42} fill="url(#nmGlint)" />
        ))}
      </g>

      {/* ---- 岸。沖から順に 浅瀬 → 泡 → 濡れた砂 ------------------- */}
      <path className="nm-shelf" d={land} filter="url(#nmShelf)" />
      <path className="nm-shallow" d={land} />
      <path className="nm-foam-lace" d={land} />
      <path className="nm-foam" d={land} />

      {/* ---- 陸 ---------------------------------------------------- */}
      {/* 通らない国どうしの境は描かない。描くと政治の地図になって、
          通る6カ国が主役だということが伝わらなくなる。 */}
      <path className="nm-land" d={land} fill="url(#nmLand)" />
      {Object.entries(countries).map(([slug, d]) => (
        <path key={slug} className={`nm-c nm-c-${slug}`} d={d} />
      ))}
      {/* 国の境。かたい線は引かず、両側に落ちる淡い影だけで分ける。 */}
      {Object.entries(countries).map(([slug, d]) => (
        <path key={`s${slug}`} className="nm-seam" d={d} />
      ))}
      {/* 砂浜。陸の内側にだけ出す（外は濡れた砂と泡が受け持つ） */}
      <g clipPath="url(#nmLandClip)">
        <path className="nm-sand" d={land} />
        <path className="nm-sand-wet" d={land} />
      </g>

      {/* ---- 地面の情報量 ------------------------------------------ */}
      {/* 森。海岸から離れたところにだけ散らしてある。北の国ほど濃い。 */}
      <g className="nm-woods">
        {woods.map(([x, y, r], i) => (
          <ellipse key={i} cx={x} cy={y} rx={r} ry={r * 0.78} />
        ))}
      </g>
      <path className="nm-lake" d={lakes} />
      <path className="nm-river" d={rivers} />
      <path className="nm-grid" d={grid} />

      {/* ---- 名前 -------------------------------------------------- */}
      {seas.map((s) => (
        <text key={s.name} className="nm-sea-name" x={s.x} y={s.y} fontSize={s.size} textAnchor="middle">
          {s.name}
        </text>
      ))}
      {Object.entries(labels).map(([slug, l]) => (
        <text key={slug} className="nm-country" x={l.x} y={l.y} fontSize={l.size} textAnchor="middle">
          {name[slug]}
        </text>
      ))}

      {/* ---- ジョージアからの飛行機。画面の外から入ってくる -------- */}
      <path className="nm-fly" d={fly.d} />
      <g className="nm-chip" transform={`translate(${fly.chip[0]} ${fly.chip[1]})`}>
        <rect x="-172" y="-25" width="344" height="50" rx="25" />
        <text x="0" y="8" textAnchor="middle">
          クタイシから 3時間35分
        </text>
      </g>

      {/* ---- ルート ------------------------------------------------ */}
      {legs.map((l) => {
        const s = LEG[l.move] ?? LEG.hitch;
        return (
          <g key={`${l.from}-${l.to}`} className={`nm-leg ${s.cls}`}>
            <path className="nm-leg-case" d={l.d} strokeWidth={s.width + 7} />
            <path className="nm-leg-line" d={l.d} strokeWidth={s.width} strokeDasharray={s.dash} />
            {l.marks.map(([mx, my, ang], i) => (
              <path
                key={i}
                className="nm-arrow"
                d="M-5 -7L7 0L-5 7Z"
                transform={`translate(${mx} ${my}) rotate(${ang})`}
              />
            ))}
            {l.kmAt && km.get(`${cityName[l.from]}|${cityName[l.to]}`) && (
              <text className="nm-km" x={l.kmAt[0]} y={l.kmAt[1]} textAnchor="middle">
                {km.get(`${cityName[l.from]}|${cityName[l.to]}`)}km
              </text>
            )}
          </g>
        );
      })}

      {/* ---- 街 ---------------------------------------------------- */}
      {cities.map((c) => {
        const lb = LABEL[c.id] ?? { dx: 24, dy: 8, at: "start" as const };
        const big = c.kind === "stay" || c.kind === "goal";
        const r = PIN[c.kind] ?? 9;
        const fs = big ? 32 : 26;
        // 名札の当たり判定。文字幅はカタカナなので、字数×文字サイズでほぼ合う。
        const tw = c.name.length * fs + 12;
        const tx = lb.at === "end" ? c.x + lb.dx - tw : c.x + lb.dx;
        return (
          <Link key={c.id} href={`/nordic/${c.country}`} className={`nmap-pin is-${c.kind}`}>
            {/* 指で押せる幅を稼ぐ。絵は小さくても、押せる場所は絵とピンの周り。 */}
            <rect className="nm-hit" x={c.x - 34} y={c.y - 34} width="68" height="68" rx="34" />
            <rect className="nm-hit" x={tx} y={c.y + lb.dy - fs} width={tw} height={fs + 14} rx="10" />
            <ellipse className="nm-pin-shadow" cx={c.x} cy={c.y + r * 0.5} rx={r * 1.15} ry={r * 0.5} />
            <circle className="nm-pin-ring" cx={c.x} cy={c.y} r={r} />
            <circle className="nm-pin-dot" cx={c.x} cy={c.y} r={r - 5} />
            <text
              className={`nm-city${big ? " is-big" : ""}`}
              x={c.x + lb.dx}
              y={c.y + lb.dy}
              fontSize={fs}
              textAnchor={lb.at}
            >
              {c.name}
            </text>
            {here === c.id && (
              <g className="nm-here">
                <circle cx={c.x} cy={c.y} r={r + 14} fill="none">
                  <animate attributeName="r" values={`${r + 6};${r + 30}`} dur="2s" repeatCount="indefinite" />
                  <animate attributeName="opacity" values="0.95;0" dur="2s" repeatCount="indefinite" />
                </circle>
                <g className="nm-chip is-here" transform={`translate(${c.x} ${c.y - r - 44})`}>
                  <rect x="-76" y="-24" width="152" height="48" rx="24" />
                  <text x="0" y="9" textAnchor="middle">
                    いま ここ
                  </text>
                </g>
              </g>
            )}
          </Link>
        );
      })}

      {/* ---- 方位 -------------------------------------------------- */}
      {/* 正角円錐なので真北は場所で傾く。傾きも焼き込んである。 */}
      <g className="nm-compass" transform={`translate(${north.x} ${north.y})`}>
        <circle className="nm-compass-disc" r="46" />
        <g transform={`rotate(${north.deg})`}>
          <path className="nm-compass-n" d="M0 -36L11 6L0 -3L-11 6Z" />
          <path className="nm-compass-s" d="M0 36L11 6L0 -3L-11 6Z" />
        </g>
        <text className="nm-compass-t" x="0" y="-46" textAnchor="middle">
          N
        </text>
      </g>

      {/* ---- 凡例と縮尺 -------------------------------------------- */}
      <g className="nm-legend" transform={`translate(${lg.x} ${lg.y})`}>
        <rect x="0" y="0" width={lg.w} height={lg.h} rx="28" filter="url(#nmDrop)" />
        {KEYS.map((k, i) => (
          <g key={k.label} className={`nm-leg ${k.cls}`} transform={`translate(22 ${40 + i * 42})`}>
            <path className="nm-leg-case" d="M0 0h70" strokeWidth={k.width + 7} />
            <path className="nm-leg-line" d="M0 0h70" strokeWidth={k.width} strokeDasharray={k.dash} />
            <text className="nm-legend-t" x="86" y="10">
              {k.label}
            </text>
          </g>
        ))}
        <g transform={`translate(22 ${40 + 3 * 42})`}>
          <path className="nm-fly" d="M0 0h70" />
          <text className="nm-legend-t" x="86" y="10">
            飛行機
          </text>
        </g>
        {/* 縮尺。km は投影から計算して焼いてある。 */}
        <g transform={`translate(22 ${lg.h - 32})`}>
          <path className="nm-scale-bar" d={`M0 0h${scale.len}`} />
          <path className="nm-scale-tick" d={`M0 -8v16M${scale.len} -8v16M${scale.len / 2} -5v10`} />
          <text className="nm-scale-t" x={scale.len + 12} y="9">
            {scale.km}km
          </text>
        </g>
      </g>
    </svg>
  );
}
