/**
 * 国旗。
 *
 * 絵文字の国旗（🇵🇱）は Windows で文字化けし、端末ごとに形も色も変わるので使わない
 * （`docs/island-design.md`）。帯・十字・カントンといった単純な形の組み合わせで描く。
 *
 * 島の絵にそろえて、角は丸く、細い縁をつける。国章のような細かい絵は入れない。
 * 遠目に「あの国だ」と分かればいい。
 */

type Band = { c: string };
type Spec =
  /** 横縞。上から順に */
  | { k: "h"; bands: string[] }
  /** 縦縞。左から順に */
  | { k: "v"; bands: string[] }
  /** 北欧十字。地色・十字の色・（あれば）十字の縁 */
  | { k: "cross"; bg: string; cross: string; edge?: string }
  /** 三日月と星。地色・模様の色 */
  | { k: "crescent"; bg: string; fg: string }
  /** 自由なパス。地色のうえに重ねる */
  | { k: "custom"; bg: string; paths: { d: string; c: string }[] };

const W = 30;
const H = 20;

/** 国旗の定義。slug は content/countries.ts と content/nordic の slug に合わせる。 */
const FLAGS: Record<string, Spec> = {
  // --- これまで歩いた国 ---
  france: { k: "v", bands: ["#0b4ea2", "#ffffff", "#e1233a"] },
  netherlands: { k: "h", bands: ["#ae1c28", "#ffffff", "#21468b"] },
  belgium: { k: "v", bands: ["#231f20", "#fae042", "#ed2939"] },
  germany: { k: "h", bands: ["#1a1a1a", "#dd0000", "#ffce00"] },
  austria: { k: "h", bands: ["#ed2939", "#ffffff", "#ed2939"] },
  czech: {
    k: "custom",
    bg: "#ffffff",
    paths: [
      { d: `M0 ${H / 2}h${W}v${H / 2}H0z`, c: "#d7141a" },
      { d: `M0 0 ${W * 0.45} ${H / 2} 0 ${H}z`, c: "#11457e" },
    ],
  },
  slovakia: { k: "h", bands: ["#ffffff", "#0b4ea2", "#ee1c25"] },
  hungary: { k: "h", bands: ["#cd2a3e", "#ffffff", "#436f4d"] },
  uk: {
    k: "custom",
    bg: "#012169",
    paths: [
      { d: `M0 0 ${W} ${H}M${W} 0 0 ${H}`, c: "#ffffff" },
      { d: `M${W / 2} 0v${H}M0 ${H / 2}h${W}`, c: "#ffffff" },
      { d: `M${W / 2} 0v${H}M0 ${H / 2}h${W}`, c: "#c8102e" },
    ],
  },
  turkey: { k: "crescent", bg: "#e30a17", fg: "#ffffff" },
  cyprus: {
    k: "custom",
    bg: "#ffffff",
    paths: [
      { d: `M9 6.4c2.4-1.5 6.6-1.7 9.6-.4 1.6.7 2.6 1.9 2 3-.5.9-1.9 1-2.9.6-1.6-.6-2.4-.2-4 .3-2.2.7-4 .5-4.7-1.2-.4-1 0-1.8 0-2.3z`, c: "#d57800" },
      { d: `M10.5 14.5c.8-.6 1.8-.2 2.2.5M15.6 14.5c.8-.6 1.8-.2 2.2.5M13 15.6c.8-.6 1.8-.2 2.2.5`, c: "#4e5b31" },
    ],
  },
  egypt: {
    k: "custom",
    bg: "#ffffff",
    paths: [
      { d: `M0 0h${W}v${H / 3}H0z`, c: "#ce1126" },
      { d: `M0 ${(H / 3) * 2}h${W}v${H / 3}H0z`, c: "#1a1a1a" },
      { d: `M${W / 2 - 2} ${H / 2 - 2.4}h4v4.8h-4z`, c: "#c09300" },
    ],
  },
  jordan: {
    k: "custom",
    bg: "#ffffff",
    paths: [
      { d: `M0 0h${W}v${H / 3}H0z`, c: "#1a1a1a" },
      { d: `M0 ${(H / 3) * 2}h${W}v${H / 3}H0z`, c: "#007a3d" },
      { d: `M0 0 ${W * 0.42} ${H / 2} 0 ${H}z`, c: "#ce1126" },
    ],
  },
  uae: {
    k: "custom",
    bg: "#ffffff",
    paths: [
      { d: `M0 0h${W}v${H / 3}H0z`, c: "#00732f" },
      { d: `M0 ${(H / 3) * 2}h${W}v${H / 3}H0z`, c: "#1a1a1a" },
      { d: `M0 0h${W * 0.26}v${H}H0z`, c: "#ce1126" },
    ],
  },
  azerbaijan: { k: "crescent", bg: "#0092bc", fg: "#ffffff" },
  georgia: {
    k: "custom",
    bg: "#ffffff",
    paths: [
      { d: `M${W / 2 - 2.2} 0h4.4v${H}h-4.4zM0 ${H / 2 - 2.2}h${W}v4.4H0z`, c: "#ff0000" },
      {
        d: `M6 4.2h1.1v1.4h1.4v1.1H7.1v1.4H6V6.7H4.6V5.6H6zM21.9 4.2H23v1.4h1.4v1.1H23v1.4h-1.1V6.7h-1.4V5.6h1.4zM6 13.4h1.1v1.4h1.4v1.1H7.1v1.4H6v-1.4H4.6v-1.1H6zM21.9 13.4H23v1.4h1.4v1.1H23v1.4h-1.1v-1.4h-1.4v-1.1h1.4z`,
        c: "#ff0000",
      },
    ],
  },
  armenia: { k: "h", bands: ["#d90012", "#0033a0", "#f2a800"] },
  "iran-border": { k: "h", bands: ["#239f40", "#ffffff", "#da0000"] },

  // --- これから行く国 ---
  poland: { k: "h", bands: ["#ffffff", "#dc143c"] },
  lithuania: { k: "h", bands: ["#fdb913", "#006a44", "#c1272d"] },
  latvia: {
    k: "custom",
    bg: "#9e3039",
    paths: [{ d: `M0 ${H * 0.4}h${W}v${H * 0.2}H0z`, c: "#ffffff" }],
  },
  estonia: { k: "h", bands: ["#0072ce", "#1a1a1a", "#ffffff"] },
  finland: { k: "cross", bg: "#ffffff", cross: "#002f6c" },
  sweden: { k: "cross", bg: "#006aa7", cross: "#fecc02" },
  denmark: { k: "cross", bg: "#c8102e", cross: "#ffffff" },
  norway: { k: "cross", bg: "#ba0c2f", cross: "#00205b", edge: "#ffffff" },
  canada: {
    k: "custom",
    bg: "#ffffff",
    paths: [
      { d: `M0 0h${W * 0.25}v${H}H0zM${W * 0.75} 0h${W * 0.25}v${H}h-${W * 0.25}z`, c: "#d80621" },
      { d: `M15 4.6l1 2.2 2.1-.9-.8 2.4 2.2.3-1.7 1.6.6 2.3-2.3-1v2.9h-2.2v-2.9l-2.3 1 .6-2.3-1.7-1.6 2.2-.3-.8-2.4 2.1.9z`, c: "#d80621" },
    ],
  },
  japan: {
    k: "custom",
    bg: "#ffffff",
    paths: [{ d: `M${W / 2} ${H / 2}m-5 0a5 5 0 1 0 10 0a5 5 0 1 0 -10 0`, c: "#bc002d" }],
  },
};

export default function Flag({
  slug,
  size = 22,
  className,
}: {
  /** content の slug。定義がなければ何も出さない。 */
  slug: string;
  /** 横幅(px) */
  size?: number;
  className?: string;
}) {
  const f = FLAGS[slug];
  if (!f) return null;
  const h = (size / W) * H;
  const body = () => {
    if (f.k === "h") {
      const n = f.bands.length;
      return f.bands.map((c, i) => (
        <rect key={i} x={0} y={(H / n) * i} width={W} height={H / n + 0.02} fill={c} />
      ));
    }
    if (f.k === "v") {
      const n = f.bands.length;
      return f.bands.map((c, i) => (
        <rect key={i} x={(W / n) * i} y={0} width={W / n + 0.02} height={H} fill={c} />
      ));
    }
    if (f.k === "cross") {
      // 北欧十字。竿寄りに寄っているのが特徴なので、中心には置かない。
      const cx = W * 0.375;
      const t = H * 0.2;
      const e = f.edge ? t * 1.7 : 0;
      return (
        <>
          <rect x={0} y={0} width={W} height={H} fill={f.bg} />
          {f.edge && (
            <path
              d={`M${cx - e / 2} 0h${e}v${H}h-${e}zM0 ${H / 2 - e / 2}h${W}v${e}H0z`}
              fill={f.edge}
            />
          )}
          <path
            d={`M${cx - t / 2} 0h${t}v${H}h-${t}zM0 ${H / 2 - t / 2}h${W}v${t}H0z`}
            fill={f.cross}
          />
        </>
      );
    }
    if (f.k === "crescent") {
      return (
        <>
          <rect x={0} y={0} width={W} height={H} fill={f.bg} />
          <circle cx={W * 0.4} cy={H / 2} r={H * 0.3} fill={f.fg} />
          <circle cx={W * 0.46} cy={H / 2} r={H * 0.24} fill={f.bg} />
          <path
            d={`M${W * 0.62} ${H / 2 - 3.2}l.9 2.4 2.5.1-2 1.6.7 2.4-2.1-1.4-2.1 1.4.7-2.4-2-1.6 2.5-.1z`}
            fill={f.fg}
          />
        </>
      );
    }
    return (
      <>
        <rect x={0} y={0} width={W} height={H} fill={f.bg} />
        {f.paths.map((p, i) => (
          <path
            key={i}
            d={p.d}
            fill={p.d.includes("M") && p.d.match(/[hv]/) ? p.c : p.c}
            stroke={slug === "uk" || slug === "cyprus" ? p.c : "none"}
            strokeWidth={slug === "uk" ? (i === 0 ? 3.4 : i === 1 ? 5.2 : 3) : 1.4}
            strokeLinecap="butt"
          />
        ))}
      </>
    );
  };

  return (
    <svg
      className={className ? `flag ${className}` : "flag"}
      width={size}
      height={h}
      viewBox={`0 0 ${W} ${H}`}
      aria-hidden
      focusable="false"
    >
      <defs>
        <clipPath id={`fc-${slug}`}>
          <rect x="0" y="0" width={W} height={H} rx="3" />
        </clipPath>
      </defs>
      <g clipPath={`url(#fc-${slug})`}>{body()}</g>
      <rect x="0.6" y="0.6" width={W - 1.2} height={H - 1.2} rx="2.6" fill="none" stroke="rgba(40,30,15,.28)" strokeWidth="1.2" />
    </svg>
  );
}
