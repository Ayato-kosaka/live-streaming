import Link from "next/link";
import MAP from "@/content/nordic/map.json";
import { NORDIC_COUNTRIES } from "@/content/nordic";

/**
 * 北欧ルートの地図。
 *
 * 形は本物。Natural Earth の海岸線を切り出して、ランベルト正角円錐で投影してある
 * （`python/build_nordic_map.py`）。塗りと線は島とそろえていて、
 * 輪郭線を引かず、砂の縁と浅瀬の帯で陸と海を分ける。
 *
 * 街とルートの座標も同じスクリプトで焼き込んである。
 * ここで経度緯度から座標を計算し直すと必ずズレるので、やらないこと。
 */

/** 街の名札をどちらに出すか。近い街どうしがぶつからないよう手で決める。 */
const LABEL: Record<string, { dx: number; dy: number; at: "start" | "middle" | "end" }> = {
  katowice: { dx: -18, dy: -12, at: "end" },
  krakow: { dx: 20, dy: 12, at: "start" },
  oswiecim: { dx: -14, dy: 34, at: "end" },
  warszawa: { dx: 20, dy: 8, at: "start" },
  bialystok: { dx: 20, dy: 8, at: "start" },
  vilnius: { dx: 20, dy: 10, at: "start" },
  siauliai: { dx: -18, dy: 6, at: "end" },
  riga: { dx: 20, dy: 6, at: "start" },
  tallinn: { dx: 20, dy: 12, at: "start" },
  helsinki: { dx: 20, dy: -10, at: "start" },
  stockholm: { dx: -20, dy: 4, at: "end" },
};

/**
 * 国の塗り。島の草地と同じ緑で、南から北へ少しずつ寒色に寄せる。
 * 国ごとのブランド色（青や赤）で塗ると政治地図になってしまい、島の世界から浮く。
 */
const FILL: Record<string, string> = {
  poland: "#a8d466",
  lithuania: "#8ac773",
  latvia: "#a0cf7c",
  estonia: "#79bd8b",
  finland: "#93c98a",
  sweden: "#6ab89b",
};

/**
 * 国名の置き場所。重心だと海や隣国に出るので、地図を見て手で決める。
 * [x, y, 文字の大きさ]
 */
const COUNTRY_AT: Record<string, [number, number, number]> = {
  poland: [268, 800, 36],
  lithuania: [528, 578, 25],
  latvia: [592, 432, 25],
  estonia: [600, 268, 25],
  finland: [656, 96, 28],
  sweden: [196, 336, 30],
};

const LEG_STYLE: Record<string, { stroke: string; width: number; dash?: string }> = {
  hitch: { stroke: "var(--route-hitch, #f0a530)", width: 9 },
  ferry: { stroke: "var(--route-ferry, #ffffff)", width: 7, dash: "3 16" },
  side: { stroke: "var(--route-side, #e2b46a)", width: 5, dash: "2 12" },
};

export default function RouteMapSvg({ here }: { here?: string }) {
  const { view, land, context, countries, cities, legs, fly } = MAP;
  const name = Object.fromEntries(NORDIC_COUNTRIES.map((c) => [c.slug, c.name]));

  return (
    <svg
      className="nmap"
      viewBox={`0 0 ${view.w} ${view.h}`}
      role="img"
      aria-label="ジョージアを出て、ポーランドからバルト三国を北上し、北欧へ抜けるルートの地図"
    >
      <defs>
        <linearGradient id="nmSea" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#5aa8c0" />
          <stop offset="1" stopColor="#2f7391" />
        </linearGradient>
        <linearGradient id="nmLand" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#d7e2ae" />
          <stop offset="1" stopColor="#c6d59c" />
        </linearGradient>
        <filter id="nmSoft" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="6" />
        </filter>
      </defs>

      {/* 海 */}
      <rect width={view.w} height={view.h} fill="url(#nmSea)" />
      {/* 島と同じ、うっすら流れる波 */}
      <g opacity="0.16" fill="none" stroke="#fffdf6" strokeWidth="3" strokeLinecap="round">
        {Array.from({ length: 14 }, (_, i) => {
          const y = 40 + i * 70;
          return (
            <path
              key={i}
              d={`M${(i % 3) * 90 - 40} ${y}q40 -12 80 0t80 0t80 0t80 0t80 0t80 0t80 0t80 0t80 0t80 0`}
            />
          );
        })}
      </g>

      {/* 浅瀬 → 砂 → 陸。島の砂浜とおなじ重ね方。 */}
      <path d={land} fill="none" stroke="#8fd0dd" strokeWidth="30" strokeLinejoin="round" opacity="0.5" filter="url(#nmSoft)" />
      <path d={land} fill="none" stroke="#f1dcaa" strokeWidth="13" strokeLinejoin="round" />
      <path d={land} fill="url(#nmLand)" />
      <path d={context} fill="#c8d49b" />

      {/* 通る国。島の草地と同じ緑で、北へ行くほど寒色に寄せる。 */}
      {Object.entries(countries).map(([slug, d]) => (
        <path key={slug} d={d} fill={FILL[slug] ?? "#8fc95e"} />
      ))}
      {/* 国の境。かたい線は引かず、内側にだけ落ちる淡い影で分ける。 */}
      {Object.entries(countries).map(([slug, d]) => (
        <path
          key={`e${slug}`}
          d={d}
          fill="none"
          stroke="#35704a"
          strokeWidth="4"
          opacity="0.38"
        />
      ))}

      {/* 国名。塗りの上、ルートの下。 */}
      {Object.entries(COUNTRY_AT).map(([slug, at]) => (
        <text
          key={slug}
          className="nmap-country"
          x={at[0]}
          y={at[1]}
          fontSize={at[2]}
          textAnchor="middle"
        >
          {name[slug]}
        </text>
      ))}

      {/* ジョージアからの飛行機。画面の外から入ってくる。 */}
      <path d={fly.d} fill="none" stroke="#fffdf6" strokeWidth="5" strokeDasharray="14 12" opacity="0.75" strokeLinecap="round" />
      <g className="nmap-chip" transform={`translate(${view.w - 372} ${view.h * 0.86 - 54})`}>
        <rect x="0" y="0" width="352" height="48" rx="24" />
        <text x="176" y="32" textAnchor="middle">
          クタイシから 3時間35分
        </text>
      </g>

      {/* ルート。ヒッチハイクの区間だけ太く濃く。 */}
      {legs.map((l) => {
        const s = LEG_STYLE[l.move] ?? LEG_STYLE.hitch;
        return (
          <g key={`${l.from}-${l.to}`}>
            <path d={l.d} fill="none" stroke="#20536b" strokeWidth={s.width + 5} strokeLinecap="round" opacity="0.28" />
            <path
              d={l.d}
              fill="none"
              stroke={s.stroke}
              strokeWidth={s.width}
              strokeLinecap="round"
              strokeDasharray={s.dash}
            />
          </g>
        );
      })}

      {/* 街 */}
      {cities.map((c) => {
        const lb = LABEL[c.id] ?? { dx: 16, dy: 6, at: "start" as const };
        const big = c.kind === "stay" || c.kind === "goal";
        const r = c.kind === "goal" ? 13 : big ? 10 : 7;
        return (
          <Link key={c.id} href={`/nordic/${c.country}`} className="nmap-pin">
            <circle cx={c.x} cy={c.y} r={r + 4} fill="#20536b" opacity="0.3" />
            <circle cx={c.x} cy={c.y} r={r} fill="#fffdf6" />
            <circle
              cx={c.x}
              cy={c.y}
              r={r - 4}
              fill={c.kind === "goal" ? "#e0603c" : c.kind === "side" ? "#b9924e" : "#f0a530"}
            />
            <text
              className={`nmap-city${big ? " is-big" : ""}`}
              x={c.x + lb.dx}
              y={c.y + lb.dy}
              textAnchor={lb.at}
            >
              {c.name}
            </text>
            {here === c.id && (
              <g>
                <circle cx={c.x} cy={c.y} r={r + 12} fill="none" stroke="#fffdf6" strokeWidth="4" opacity="0.9">
                  <animate attributeName="r" values={`${r + 6};${r + 20}`} dur="1.8s" repeatCount="indefinite" />
                  <animate attributeName="opacity" values="0.9;0" dur="1.8s" repeatCount="indefinite" />
                </circle>
                <g className="nmap-chip is-here" transform={`translate(${c.x - 62} ${c.y - r - 58})`}>
                  <rect x="0" y="0" width="124" height="42" rx="21" />
                  <text x="62" y="29" textAnchor="middle">
                    いま ここ
                  </text>
                </g>
              </g>
            )}
          </Link>
        );
      })}
    </svg>
  );
}
