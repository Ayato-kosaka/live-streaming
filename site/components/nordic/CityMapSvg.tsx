import MAP from "@/content/nordic/map.json";
import { cropPath, type Box } from "./cropPath";

/**
 * 街のまわりの地図。**「この街で見たいもの」の頭に貼る。**
 *
 * あやとの言葉（2026-09-09）:
 *
 * > その日程表のところに「この街で見たいもの」みたいな欄をつけてもらって、
 * > （…）欄を作って地図を貼って、で、見るべきものをポンポンってリストアップしてください
 *
 * ## 全体図と同じ絵から作る
 *
 * 新しい地図データを作らない。`content/nordic/map.json` は
 * `python/build_nordic_map.py` が Natural Earth の海岸線から起こしたもので、
 * 全体図（`RouteMapSvg`）もこれを見ている。**街の地図だけ別の出どころにすると、
 * 旅程が動いたときに片方が古くなる。** 色も `svg.nmap` の CSS をそのまま使う。
 *
 * ## 拡大のしかた
 *
 * `viewBox` は 1000×700 に固定して、中身のほうを 5倍にする。
 * `viewBox` を窓の大きさ（200×140）にすると、線の太さ（浅瀬は 38）が
 * そのまま 5倍に見えてしまう。**中身を拡大して、線だけ拡大しない**のが正しく、
 * それは `vector-effect: non-scaling-stroke` の仕事（CSS 側に置いてある）。
 *
 * 名前・ピン・国境の棒・縮尺は、拡大しない側（`viewBox` の座標）に直接置く。
 * 拡大する側に入れると、字も 5倍になる。
 *
 * ## 押せるものを1つも置かない
 *
 * 全体図は国のかたちを押しどころにしているが、ここは窓が狭くて、
 * 国が1つしか写らないことが多い。**押しどころは地図の下の字が持つ**
 * （「その街の◯件を読む」）。地図は絵として置く。
 */

/** 全体図の何倍で見せるか。窓は 1000/5 × 700/5 ＝ 200×140（約 361×253km）。 */
const Z = 5;
const VIEW = { w: 1000, h: 700 };

/**
 * 切るときの余白（ワールド単位、約 72km）。
 * 浅瀬の線は 38 の太さがあるので、窓のふちで近道させると中へにじむ。
 */
const PAD = 40;

/** 区間の線の描き方。全体図と同じ太さにする（`RouteMapSvg` の LEG）。 */
const LEG: Record<string, { cls: string; width: number; dash?: string }> = {
  hitch: { cls: "is-hitch", width: 12 },
  ferry: { cls: "is-ferry", width: 8, dash: "4 20" },
  side: { cls: "is-side", width: 6, dash: "3 14" },
};

/** ピンの大きさ。全体図と同じ。 */
const PIN: Record<string, number> = { goal: 16, stay: 13, pass: 10, side: 8, land: 10 };

/**
 * 名札をどちらに出すか。全体図（`RouteMapSvg` の LABEL）とは別に持つ。
 * あちらは11の街が一度に写るので逃がし方がぜんぶ違うが、ここは窓が狭くて
 * 写るのは2〜3の街。**右に出して、右端に寄った街だけ左へ返す**で足りる。
 */
const NUDGE = { dx: 26, dy: 12 };

/** 縮尺の棒。50km は 200 単位の窓に対して 3割ちょっとで、目盛りとして読みやすい。 */
const BAR_KM = 50;

export default function CityMapSvg({ city }: { city: string }) {
  const here = MAP.cities.find((c) => c.name === city);
  // 地図に無い街（クタイシなど、この地図の外にある街）。**代わりの絵を出さない。**
  if (!here) return null;

  const w = VIEW.w / Z;
  const h = VIEW.h / Z;
  const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);
  const cx = clamp(here.x, w / 2, MAP.view.w - w / 2);
  const cy = clamp(here.y, h / 2, MAP.view.h - h / 2);
  const box: Box = { x0: cx - w / 2, y0: cy - h / 2, x1: cx + w / 2, y1: cy + h / 2 };
  const cut: Box = {
    x0: box.x0 - PAD,
    y0: box.y0 - PAD,
    x1: box.x1 + PAD,
    y1: box.y1 + PAD,
  };

  const cut1 = (d: string) => cropPath(d, cut);
  // ワールド座標 → 拡大しない側の座標
  const sx = (x: number) => (x - box.x0) * Z;
  const sy = (y: number) => (y - box.y0) * Z;
  const shown = (x: number, y: number) =>
    x >= box.x0 && x <= box.x1 && y >= box.y0 && y <= box.y1;

  const land = cut1(MAP.land);
  const lakes = cut1(MAP.lakes);
  const rivers = cut1(MAP.rivers);
  const woods = cut1(MAP.woods);
  const hills = cut1(MAP.hills);
  const grid = cut1(MAP.grid);
  const countries = Object.entries(MAP.countries)
    .map(([slug, d]) => [slug, cut1(d)] as const)
    .filter(([, d]) => d.length > 0);
  const legs = MAP.legs
    .map((l) => ({ ...l, d: cut1(l.d) }))
    .filter((l) => l.d.length > 0);
  const cities = MAP.cities.filter((c) => shown(c.x, c.y));

  // 同じ面に地図が2枚出る日がある（8日目はヘルシンキとストックホルム）。
  // defs の id がぶつかると、2枚目が1枚目の切り抜きを使う。
  const uid = here.id;
  // 森と山は「同じ形を3枚ずらして重ねる」。ずらす量は拡大する側にあるので、
  // 全体図と同じ見た目にするには Z で割る。
  const off = (n: number) => n / Z;
  const barLen = BAR_KM / (MAP.scale.kmPerUnit / Z);

  return (
    <svg
      className="nmap is-city"
      viewBox={`0 0 ${VIEW.w} ${VIEW.h}`}
      role="img"
      aria-label={`${city}のまわりの地図。${Math.round(w * MAP.scale.kmPerUnit)}km四方`}
    >
      <defs>
        <linearGradient id={`cm-sea-${uid}`} x1="0.1" y1="0" x2="0.35" y2="1">
          <stop className="nm-sea-a" offset="0" />
          <stop className="nm-sea-b" offset="0.52" />
          <stop className="nm-sea-c" offset="1" />
        </linearGradient>
        <linearGradient id={`cm-land-${uid}`} x1="0" y1="0" x2="0.2" y2="1">
          <stop className="nm-land-a" offset="0" />
          <stop className="nm-land-b" offset="1" />
        </linearGradient>
        {/* ぼかしは拡大する側に掛かるので、全体図の値を Z で割る */}
        <filter id={`cm-shelf-${uid}`} x="-8%" y="-8%" width="116%" height="116%">
          <feGaussianBlur stdDeviation={11 / Z} />
        </filter>
        <filter id={`cm-drop-${uid}`} x="-6%" y="-6%" width="112%" height="112%">
          <feGaussianBlur stdDeviation={7 / Z} />
        </filter>
        <clipPath id={`cm-clip-${uid}`}>
          <path d={land} />
        </clipPath>
        {/* 海岸線は、岸の帯を作るのに9回引く（影・浅瀬・泡・濡れ砂・陸・砂浜…）。
            **同じ字を9回書き出しに焼かない。** ここに1本置いて `use` で呼ぶ。
            群島のある街（ヘルシンキ・ストックホルム）は島の数だけ形が長く、
            8日目の面は 533KB あった。1本にして 176KB になっている。

            `vector-effect` は受け継がれない性質なので、CSS ではなく
            この形そのものに付ける（`use` の側に付けても中には届かない）。 */}
        <path id={`cm-l-${uid}`} d={land} vectorEffect="non-scaling-stroke" />
        {countries.map(([slug, d]) => (
          <path key={`d${slug}`} id={`cm-c-${uid}-${slug}`} d={d} vectorEffect="non-scaling-stroke" />
        ))}
      </defs>

      {/* ---- 海。拡大しない側に直接敷く -------------------------- */}
      <rect width={VIEW.w} height={VIEW.h} fill={`url(#cm-sea-${uid})`} />
      <g className="nm-swell">
        {Array.from({ length: 12 }, (_, i) => {
          const y = 26 + i * 58;
          return (
            <path
              key={i}
              d={`M${(i % 3) * 96 - 60} ${y}q46 -13 92 0t92 0t92 0t92 0t92 0t92 0t92 0t92 0t92 0t92 0t92 0t92 0`}
            />
          );
        })}
      </g>

      {/* ---- ここから拡大する側 ---------------------------------- */}
      <g className="nm-zoom" transform={`scale(${Z}) translate(${-box.x0} ${-box.y0})`}>
        {/* 岸。沖から順に 影 → 浅瀬 → 泡 → 濡れた砂（ac-reference 2章） */}
        <use
          className="nm-landdrop"
          href={`#cm-l-${uid}`}
          filter={`url(#cm-drop-${uid})`}
          transform={`translate(${off(3)} ${off(7)})`}
        />
        <use className="nm-shelf" href={`#cm-l-${uid}`} filter={`url(#cm-shelf-${uid})`} />
        <use className="nm-shallow" href={`#cm-l-${uid}`} />
        <use className="nm-foam-lace" href={`#cm-l-${uid}`} />
        <use className="nm-foam" href={`#cm-l-${uid}`} />

        <use className="nm-land" href={`#cm-l-${uid}`} fill={`url(#cm-land-${uid})`} />
        {countries.map(([slug]) => (
          <use key={slug} className={`nm-c nm-c-${slug}`} href={`#cm-c-${uid}-${slug}`} />
        ))}
        {countries.map(([slug]) => (
          <use key={`s${slug}`} className="nm-seam" href={`#cm-c-${uid}-${slug}`} />
        ))}
        <g clipPath={`url(#cm-clip-${uid})`}>
          <use className="nm-sand" href={`#cm-l-${uid}`} />
          <use className="nm-sand-wet" href={`#cm-l-${uid}`} />
          <path className="nm-hill-shade" d={hills} transform={`translate(${off(4)} ${off(4)})`} />
          <path className="nm-hill-hi" d={hills} transform={`translate(${off(-3)} ${off(-4)})`} />
          <path className="nm-hill" d={hills} />
          <path className="nm-wood-shade" d={woods} transform={`translate(${off(1.6)} ${off(2)})`} />
          <path className="nm-wood-hi" d={woods} transform={`translate(${off(-1.4)} ${off(-1.8)})`} />
          <path className="nm-wood" d={woods} />
        </g>

        <path className="nm-lake" d={lakes} />
        <path className="nm-river" d={rivers} />
        <path className="nm-grid" d={grid} />

        {/* 道。全体図と同じ色と太さで、この窓を通る区間だけ */}
        {legs.map((l) => {
          const s = LEG[l.move] ?? LEG.hitch;
          return (
            <g key={`${l.from}-${l.to}`} className={`nm-leg ${s.cls}`}>
              <path className="nm-leg-case" d={l.d} strokeWidth={s.width + 8} />
              <path className="nm-leg-line" d={l.d} strokeWidth={s.width} strokeDasharray={s.dash} />
            </g>
          );
        })}
      </g>

      {/* ---- ここから拡大しない側。字と印は等倍で置く -------------- */}
      {/* 海の名前。**入りきらないなら出さない。**
          窓が狭いので、名前の真ん中が窓の中にあっても字が外へ出る
          （「フィンランド湾」がヘルシンキの窓の右端で切れていた）。
          字幅は 字数 × 大きさ × 字間（0.26em ぶん）でほぼ合う。 */}
      {MAP.seas
        .filter((s) => {
          const half = (s.name.length * s.size * 1.26) / 2;
          return shown(s.x, s.y) && sx(s.x) - half > 0 && sx(s.x) + half < VIEW.w;
        })
        .map((s) => (
          <text
            key={s.name}
            className="nm-sea-name"
            x={sx(s.x)}
            y={sy(s.y)}
            fontSize={s.size}
            textAnchor="middle"
            transform={`rotate(${s.rot} ${sx(s.x)} ${sy(s.y)})`}
          >
            {s.name}
          </text>
        ))}

      {/* 陸の国境。越える向きに直角な、赤白の遮断棒 */}
      {MAP.borders
        .filter((b) => shown(b.x, b.y))
        .map((b) => (
          <g
            key={b.name}
            className="nm-border"
            transform={`translate(${sx(b.x)} ${sy(b.y)}) rotate(${b.deg})`}
          >
            <rect className="nm-border-bar" x="-4" y="-19" width="8" height="38" rx="4" />
            <rect className="nm-border-tip" x="-4" y="-19" width="8" height="13" rx="4" />
            <rect className="nm-border-tip" x="-4" y="6" width="8" height="13" rx="4" />
          </g>
        ))}

      {/* 街。押せない絵として置く（この面の押しどころは地図の下の字） */}
      {cities.map((c) => {
        const big = c.kind === "stay" || c.kind === "goal";
        const r = PIN[c.kind] ?? 9;
        const fs = big ? 34 : 28;
        const x = sx(c.x);
        const y = sy(c.y);
        // 右へ出すと画面からはみ出す街だけ、左へ返す
        const right = x + NUDGE.dx + c.name.length * fs < VIEW.w;
        const tx = right ? x + NUDGE.dx : x - NUDGE.dx;
        const tw = c.name.length * fs + 12;
        const lx = right ? tx : tx - tw;
        return (
          <g
            key={c.id}
            className={`nmap-pin is-${c.kind}${c.cap ? " is-cap" : ""}${
              c.id === here.id ? " is-focus" : ""
            }`}
          >
            {c.id === here.id && <circle className="nm-focus-halo" cx={x} cy={y} r={r + 15} />}
            <ellipse className="nm-pin-shadow" cx={x} cy={y + r * 0.55} rx={r * 1.15} ry={r * 0.5} />
            {c.cap ? (
              <g transform={`translate(${x} ${y}) scale(${r / 13})`}>
                <path
                  className="nm-pin-ring"
                  d="M0 -19L4.6 -6.4L18 -5.9L7.4 2.4L11.1 15.3L0 7.6L-11.1 15.3L-7.4 2.4L-18 -5.9L-4.6 -6.4Z"
                />
                <path
                  className="nm-pin-dot"
                  d="M0 -12L2.9 -4.1L11.4 -3.7L4.7 1.5L7 9.7L0 4.8L-7 9.7L-4.7 1.5L-11.4 -3.7L-2.9 -4.1Z"
                />
              </g>
            ) : (
              <>
                <circle className="nm-pin-ring" cx={x} cy={y} r={r} />
                <circle className="nm-pin-dot" cx={x} cy={y} r={r - 5} />
              </>
            )}
            {/* 緑の陸と青い海では地の明るさが3倍ちがう。字の色をどう選んでも
                4.5 : 1 に届かないので、**字の下に自分で地を敷く**（全体図と同じ）。 */}
            <rect
              className="nm-lab"
              x={lx - 5}
              y={y + NUDGE.dy - fs * 0.82}
              width={tw + 10}
              height={fs * 1.12}
              rx={fs * 0.3}
            />
            <text
              className={`nm-city${big ? " is-big" : ""}`}
              x={tx}
              y={y + NUDGE.dy}
              fontSize={fs}
              textAnchor={right ? "start" : "end"}
            >
              {c.name}
            </text>
          </g>
        );
      })}

      {/* 縮尺。「歩ける距離か、車に乗せてもらう距離か」がこれで分かる */}
      <g className="nm-scale" transform={`translate(60 ${VIEW.h - 44})`}>
        <path className="nm-scale-bar" d={`M0 0h${barLen}`} />
        <path className="nm-scale-tick" d={`M0 -9v18M${barLen} -9v18M${barLen / 2} -6v12`} />
        <rect className="nm-lab" x={barLen / 2 - 46} y="-40" width="92" height="29" rx="9" />
        <text className="nm-scale-t" x={barLen / 2} y="-18" textAnchor="middle">
          {BAR_KM}km
        </text>
      </g>
    </svg>
  );
}
