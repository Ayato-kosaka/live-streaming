/**
 * 国旗。
 *
 * 絵文字の国旗（🇵🇱）は Windows で文字化けし、端末ごとに形も色も変わるので使わない
 * （`docs/island-design.md`）。帯・十字・カントンといった単純な形の組み合わせで描く。
 *
 * 島の絵にそろえて、角は丸く、細い縁をつける。国章のような細かい絵は入れない。
 * 遠目に「あの国だ」と分かればいい。
 */

type Spec =
  /** 横縞。上から順に */
  | { k: "h"; bands: string[] }
  /** 縦縞。左から順に */
  | { k: "v"; bands: string[] }
  /** 北欧十字。地色・十字の色・（あれば）十字の縁 */
  | { k: "cross"; bg: string; cross: string; edge?: string }
  /**
   * 三日月と星。
   * `bands` を渡すと地が横縞になる（アゼルバイジャンは三色旗のうえに月と星）。
   * `cx` は月の中心の位置（幅に対する比）。トルコは竿寄り、アゼルバイジャンは真ん中。
   */
  | { k: "crescent"; bg: string; fg: string; bands?: string[]; cx?: number }
  /**
   * 自由なパス。地色のうえに重ねる。
   *
   * `s` を付けたパスは**線として**描く（`nf` を付けると塗らない）。
   * これが無いと、枝や十字のような「線の集まり」が塗り潰されて黒い塊になる。
   */
  | { k: "custom"; bg: string; paths: { d: string; c: string; s?: number; nf?: boolean }[] };

const W = 30;
const H = 20;

/**
 * 星。頂点の数まで合わせる。
 *
 * ヨルダンは7つ、トルコとアゼルバイジャンは5つ。20px で出すと差は見えないが、
 * 数を間違えた形をわざわざ描き起こす理由も無いので、ここで作る。
 */
function star(cx: number, cy: number, ro: number, ri: number, n: number) {
  const p: string[] = [];
  for (let i = 0; i < n * 2; i++) {
    const r = i % 2 ? ri : ro;
    const a = (Math.PI * i) / n - Math.PI / 2;
    p.push(`${(cx + r * Math.cos(a)).toFixed(2)} ${(cy + r * Math.sin(a)).toFixed(2)}`);
  }
  return `M${p.join("L")}z`;
}

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
  slovakia: {
    k: "custom",
    bg: "#ffffff",
    paths: [
      { d: `M0 ${H / 3}h${W}v${H / 3}H0z`, c: "#0b4ea2" },
      { d: `M0 ${(H / 3) * 2}h${W}v${H / 3}H0z`, c: "#ee1c25" },
      // 紋章。これが無いとロシアと同じ絵になる。盾と二重十字だけに省く
      { d: `M8 4.6h6.4v6.2c0 3.2-3.2 4.6-3.2 4.6S8 14 8 10.8z`, c: "#ee1c25" },
      { d: `M9 5.6h4.4v5.4c0 2.2-2.2 3.2-2.2 3.2S9 13.2 9 11z`, c: "#ffffff" },
      { d: `M10.6 6.2h1.2v1.3h1.3v1h-1.3v1.3h1.7v1h-1.7v2.1h-1.2v-2.1H8.9v-1h1.7V8.5H9.3v-1h1.3z`, c: "#ee1c25" },
    ],
  },
  hungary: { k: "h", bands: ["#cd2a3e", "#ffffff", "#436f4d"] },
  // 白の斜め十字 → 赤の斜め十字 → 白の十字 → 赤の十字、の順に重ねる。
  // 赤の斜めを抜かすと、青地に白い×が乗っただけの旗になる
  uk: {
    k: "custom",
    bg: "#012169",
    paths: [
      { d: `M0 0 ${W} ${H}M${W} 0 0 ${H}`, c: "#ffffff", s: 3.8, nf: true },
      { d: `M0 0 ${W} ${H}M${W} 0 0 ${H}`, c: "#c8102e", s: 1.7, nf: true },
      { d: `M${W / 2} 0v${H}M0 ${H / 2}h${W}`, c: "#ffffff", s: 6.4, nf: true },
      { d: `M${W / 2} 0v${H}M0 ${H / 2}h${W}`, c: "#c8102e", s: 3.8, nf: true },
    ],
  },
  turkey: { k: "crescent", bg: "#e30a17", fg: "#ffffff", cx: 0.38 },
  cyprus: {
    k: "custom",
    bg: "#ffffff",
    paths: [
      // 島の形。北東へ細く伸びる尾（カルパス半島）が有るかどうかで、あの島だと分かる。
      // 本体は横長で、南の岸がまっすぐ、北の岸が波打つ
      {
        d: `M7.6 8.9c.3-1.1 1.6-1.9 3.3-2.1 1.5-.2 2.6.2 3.8.2 1.1 0 1.9-.4 3-.3.8.1 1.4.4 2.1.9l3.5 2.3c.5.33.3.95-.3.85l-4-.65c-.9-.15-1.4.15-2.2.6-1.1.65-2.3 1.15-4 1.2-2.5.07-4.8-.55-6-1.5-.85-.65-1.35-1.35-1.2-1.5z`,
        c: "#d57800",
      },
      // オリーブの枝。2本を下で交差させる。
      // **塗らずに線で描く。**塗ると枝の内側が埋まって、緑の塊になる
      {
        d: `M15 16.4c-2.2-.1-4.1-1.1-5.4-2.9M15 16.4c2.2-.1 4.1-1.1 5.4-2.9`,
        c: "#4e5b31",
        s: 0.8,
        nf: true,
      },
      // 葉。枝の左右に3枚ずつ。丸い点にすると、遠目でも枝だと分かる
      {
        d: `M11.2 13.9a.85.85 0 1 0 .01 0zM12.6 15.5a.85.85 0 1 0 .01 0zM10.2 15.2a.85.85 0 1 0 .01 0zM18.8 13.9a.85.85 0 1 0 .01 0zM17.4 15.5a.85.85 0 1 0 .01 0zM19.8 15.2a.85.85 0 1 0 .01 0z`,
        c: "#4e5b31",
      },
    ],
  },
  egypt: {
    k: "custom",
    bg: "#ffffff",
    paths: [
      { d: `M0 0h${W}v${H / 3}H0z`, c: "#ce1126" },
      { d: `M0 ${(H / 3) * 2}h${W}v${H / 3}H0z`, c: "#1a1a1a" },
      // サラディンの鷲。四角い金の板に見えていたので、翼と尾の形にする。
      // 細部は入れない。20px では「金色の鳥が居る」ところまでしか出ない
      {
        d: `M15 7.6c.7 0 1.2.5 1.2 1.1 0 .3-.1.6-.4.8l3.6.5c.5.1.5.7 0 .8l-3.1.6.5 1.9c.1.4-.1.6-.4.6h-2.8c-.3 0-.5-.2-.4-.6l.5-1.9-3.1-.6c-.5-.1-.5-.7 0-.8l3.6-.5a1 1 0 0 1-.4-.8c0-.6.5-1.1 1.2-1.1z`,
        c: "#c09300",
      },
    ],
  },
  jordan: {
    k: "custom",
    bg: "#ffffff",
    paths: [
      { d: `M0 0h${W}v${H / 3}H0z`, c: "#1a1a1a" },
      { d: `M0 ${(H / 3) * 2}h${W}v${H / 3}H0z`, c: "#007a3d" },
      { d: `M0 0 ${W * 0.42} ${H / 2} 0 ${H}z`, c: "#ce1126" },
      // 白い七稜星。これが無いとパレスチナの旗と同じ絵になる
      { d: star(W * 0.145, H / 2, 2, 0.95, 7), c: "#ffffff" },
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
  // 三色旗のうえに白い月と星。青一色に描いていたのは誤り
  azerbaijan: {
    k: "crescent",
    bg: "#00b5e2",
    fg: "#ffffff",
    bands: ["#00b5e2", "#ef3340", "#509e2f"],
    cx: 0.46,
  },
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
      {
        // 星に見えていたので、切れ込みのある葉と幹の形にする
        d: `M15 3.6l1.05 2.1c.12.23.34.2.56.09l.76-.4-.57 3.05c-.12.55.27.55.46.32l1.32-1.5.43 1.02c.05.12.18.1.36.07l1.35-.28-.4 1.48c-.08.31-.15.44.09.53l.5.24-2.4 1.96c-.24.19-.16.25-.08.53l.21.7-2.28-.28c-.28-.04-.47-.04-.46.16l.1 2.66h-.85l.1-2.66c0-.2-.18-.2-.46-.16l-2.28.28.21-.7c.08-.28.16-.34-.08-.53L9.7 11.7l.5-.24c.24-.09.17-.22.09-.53l-.4-1.48 1.35.28c.18.03.31.05.36-.07l.43-1.02 1.32 1.5c.19.23.58.23.46-.32l-.57-3.05.76.4c.22.11.44.14.56-.09z`,
        c: "#d80621",
      },
    ],
  },
  japan: {
    k: "custom",
    bg: "#ffffff",
    paths: [{ d: `M${W / 2} ${H / 2}m-6 0a6 6 0 1 0 12 0a6 6 0 1 0 -12 0`, c: "#bc002d" }],
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
      // ノルウェーの白い縁は、青い十字の**半分の幅**。1.7 倍だと縁が細くて灰色に潰れる
      const e = f.edge ? t * 2 : 0;
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
      const cx = (f.cx ?? 0.4) * W;
      // 月の内側は地の色で塗りつぶすのが簡単だが、縞のうえだと1色では抜けない。
      // だから月そのものを mask で作って、縞をそのまま透けさせる。
      const inner = f.bands ? null : <circle cx={cx + W * 0.06} cy={H / 2} r={H * 0.24} fill={f.bg} />;
      const id = `cm-${slug}`;
      return (
        <>
          {f.bands ? (
            f.bands.map((c, i) => (
              <rect
                key={i}
                x={0}
                y={(H / f.bands!.length) * i}
                width={W}
                height={H / f.bands!.length + 0.02}
                fill={c}
              />
            ))
          ) : (
            <rect x={0} y={0} width={W} height={H} fill={f.bg} />
          )}
          <defs>
            <mask id={id}>
              <rect x={0} y={0} width={W} height={H} fill="#000" />
              <circle cx={cx} cy={H / 2} r={H * 0.3} fill="#fff" />
              <circle cx={cx + W * 0.055} cy={H / 2} r={H * 0.235} fill="#000" />
            </mask>
          </defs>
          <rect x={0} y={0} width={W} height={H} fill={f.fg} mask={`url(#${id})`} />
          {inner}
          <path d={star(cx + W * 0.235, H / 2, 3, 1.25, 5)} fill={f.fg} />
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
            fill={p.nf ? "none" : p.c}
            stroke={p.s ? p.c : "none"}
            strokeWidth={p.s}
            strokeLinecap="round"
            strokeLinejoin="round"
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
