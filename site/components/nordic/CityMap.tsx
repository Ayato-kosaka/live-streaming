import MAPS from "@/content/nordic/citymaps.json";

/**
 * 街を拡大した地図。**OpenStreetMap の実データで描く。**
 *
 * あやとの言葉（2026-09-09）:
 *
 * > なにこのカスみたいな地図。作り途中でデプロイしたら？それとも仕事舐めてる？
 * > 任天堂のどう森レベルまで持っていく必要あるって言ったよな？
 * > こんなカスみたいな地図で誰がワクワクするねん？誰がワルシャワってわかるねん？
 *
 * 前の版（`CityZoom`）はベージュの四角に丸が4つ乗っただけで、**道路が1本も
 * 無かった。** 道路の無いものは地図ではない。ここは道・鉄道・川・公園・街区を
 * 全部描いて、旧市街を塗り分け、川と地区に日本語の名前を書く。
 * 焼くのは `tools/nordic/citymap.py`。
 *
 * ## 土台は外だし、点と名前は中
 *
 * 道・川・緑・街区は `public/nordic/city/<街>.svg` に焼いて `<img>` で読む。
 * ページの中に直に描くと、Next が同じものを HTML と RSC の積み荷に**2度**書く。
 * ヴィリニュスの 17KB が 54KB になった（実測）。外に出せば1度で済み、
 * 同じ街に何日か居る日程では**2日目からは取りに行かない。**
 *
 * 点・目印・名前だけは中に描く。`<img>` の中の字は選べないし、
 * 濃さも測れないし（`tools/sprites/inkpx.mjs`）、押しても何も起きない。
 *
 * `"use client"` は付けない。押した点を光らせるのは CSS の `:target` でやる。
 * JavaScript を1行も足さずに、一覧と地図を結べる。
 */

type Pin = {
  id: string; n: number; x: number; y: number; ax: number; ay: number;
  cat: string; t: string; k: string;
};
type Far = { id: string; cat: string; t: string; km: number; dir: string; deg: number };
type Mark = { x: number; y: number; k: string };
type Label = { x: number; y: number; t: string; k: string; w: number; fs: number };
/** 拡大の紙。点が固まりすぎている街だけ持つ（`tools/nordic/citymap.py`）。 */
type Inset = {
  slug: string; w: number; h: number; km: number; t: string;
  /** 本図のどこを拡大したか。本図の座標で `[x, y, 幅, 高さ]` */
  rect: number[];
  /** 四角に付ける名前の札。幅も置き場所も焼くときに決めてある */
  tab: { x: number; y: number; w: number; fs: number };
  pins: Pin[]; marks: Mark[]; labels: Label[];
};
type CityMapData = {
  slug: string; w: number; h: number; km: number;
  pins: Pin[]; marks: Mark[]; labels: Label[]; far: Far[]; inset?: Inset;
};

/** 見どころの種類。**この4つ以外は来ない**（`nordic/*.json` の `cat`）。 */
const CATS = [
  { k: "see", label: "見たい" },
  { k: "eat", label: "食べたい" },
  { k: "do", label: "やりたい" },
  { k: "buy", label: "買いたい" },
] as const;

/* ── 目印の絵 ─────────────────────────────────────────────
   **絵文字は使わない**（`island-design.md` 1章）。11px で出るので、
   輪郭線は引かず、面だけで形を作る（2章1）。上を明るく、屋根に色を置いて、
   どの建物かを色でも読めるようにする。

   色は `<use>` で呼ばれた先でも効くように、**インラインの style で書く。**
   外側のセレクタ（`.cm-mark .g-roof`）は `<use>` の中まで届かない。 */
const C = {
  wall: "var(--wall)",
  hi: "var(--wall-lo)",
  dark: "var(--frame-deep)",
  trunk: "var(--trunk)",
  leaf: "var(--leaf-a)",
  leafhi: "var(--leaf-b)",
  coral: "var(--roof-coral)",
  gold: "var(--roof-gold)",
  sky: "var(--roof-sky)",
  mint: "var(--roof-mint)",
  sea: "var(--sea-mid)",
} as const;

type Part = [d: string, fill: keyof typeof C] | [d: string, fill: keyof typeof C, "s"];

/** 種類 → 形。屋根の色で「宮殿・教会・市場・駅」を読み分ける。 */
const GLYPHS: Record<string, Part[]> = {
  castle: [
    ["M3 9l2.5-4L8 9zM16 9l2.5-4L21 9z", "gold"],
    ["M3 9h5v11H3zM16 9h5v11h-5zM8 12h8v8H8z", "wall"],
    ["M8 12l4-4 4 4z", "gold"],
    ["M10.6 15h2.8v5h-2.8z", "dark"],
  ],
  church: [
    ["M11.2 1h1.6v4h-1.6zM9.8 2.4h4.4V4H9.8z", "dark"],
    ["M12 4.6l4.2 5.4H7.8z", "coral"],
    ["M8.6 10h6.8v10H8.6z", "wall"],
    ["M10.6 14.5h2.8V20h-2.8z", "dark"],
  ],
  museum: [
    ["M12 3l9 5H3z", "sky"],
    ["M4 8h16v2H4zM3 18h18v2.5H3z", "wall"],
    ["M5.5 10h2.4v8H5.5zM10.8 10h2.4v8h-2.4zM16.1 10h2.4v8h-2.4z", "wall"],
    ["M9 18h6v2H9z", "dark"],
  ],
  market: [
    ["M3 5h4.5v5H3zM12 5h4.5v5H12z", "mint"],
    ["M7.5 5H12v5H7.5zM16.5 5H21v5h-4.5z", "wall"],
    ["M5 10h14v10H5z", "wall"],
    ["M8 13h8v7H8z", "dark"],
  ],
  station: [
    ["M2.5 6h19v2.6h-19z", "gold"],
    ["M5.5 8.6h13V17h-13z", "wall"],
    ["M7.5 10.4h9V14h-9zM6.5 18h3v2h-3zM14.5 18h3v2h-3z", "dark"],
  ],
  tower: [
    ["M12 1.5l3.4 5.5H8.6z", "coral"],
    ["M9.2 7h5.6v13H9.2zM6.5 17.5h11V20h-11z", "wall"],
    ["M10.6 10h2.8v4h-2.8z", "dark"],
  ],
  park: [
    ["M11.1 13h1.8v7h-1.8z", "trunk"],
    ["M12 2.6a6 6 0 1 1 0 12 6 6 0 0 1 0-12z", "leaf"],
    ["M10.2 3.8a2.8 2.8 0 1 1 0 5.6 2.8 2.8 0 0 1 0-5.6z", "leafhi"],
  ],
  food: [
    ["M3.5 11h17a8.5 8.5 0 0 1-17 0z", "wall"],
    ["M2 19.4h20V21H2z", "dark"],
    ["M7.5 3h1.6v6H7.5zM14.9 3h1.6v6h-1.6z", "coral"],
  ],
  arena: [
    ["M2.5 12a9.5 8 0 0 1 19 0z", "sky"],
    ["M2.5 12h19v7h-19z", "wall"],
    ["M6 14.5h12V19H6z", "dark"],
  ],
  sauna: [
    ["M12 6l9 5H3z", "mint"],
    ["M5 11h14v9H5z", "wall"],
    ["M8 14h8v6H8z", "dark"],
    ["M8.5 1.5c1.6 1.2 1.6 2.4 0 3.6M15.5 1.5c1.6 1.2 1.6 2.4 0 3.6", "sea", "s"],
  ],
  ship: [
    ["M2.5 15h19l-3 5H5.5z", "wall"],
    ["M12.8 2.5l6 10h-6z", "coral"],
    ["M11.2 2.5h1.4v10h-1.4zM4 9.5h6.4v3H4z", "dark"],
  ],
  house: [
    ["M12 4l8.5 6.5h-17z", "coral"],
    ["M5.5 10.5h13V20h-13z", "wall"],
    ["M10.6 14h2.8v6h-2.8z", "dark"],
  ],
  town: [
    ["M2.5 11.5L8 6.5l5.5 5z", "coral"],
    ["M4.6 11.5h6.8V20H4.6z", "wall"],
    ["M12.5 9.5L17 5.5l4.5 4z", "gold"],
    ["M13.8 9.5h6.4V20h-6.4z", "wall"],
    ["M7 15h2.2v5H7zM16 14h2.4v6H16z", "dark"],
  ],
  spot: [
    ["M12 3.5a8.5 8.5 0 1 1 0 17 8.5 8.5 0 0 1 0-17z", "gold"],
    ["M12 8.6a3.4 3.4 0 1 1 0 6.8 3.4 3.4 0 0 1 0-6.8z", "wall"],
  ],
};

function Glyph({ k }: { k: string }) {
  const parts = GLYPHS[k] ?? GLYPHS.spot;
  return (
    <>
      {parts.map(([d, fill, stroke], i) =>
        stroke ? (
          <path key={i} d={d} style={{ fill: "none", stroke: C[fill], strokeWidth: 1.6 }} />
        ) : (
          <path key={i} d={d} style={{ fill: C[fill] }} />
        ),
      )}
    </>
  );
}

/** 縮尺の棒の長さ。**窓の実寸から出す。** 街ごとに窓の広さが違うので、
    棒が無いと「歩ける旧市街」と「地下鉄で移動する街」を読み違える。 */
function bar(km: number, w: number) {
  const barKm = km > 3.6 ? 1 : km > 2.4 ? 0.5 : km > 1.4 ? 0.3 : 0.2;
  return { barKm, barW: Math.round((barKm / km) * w) };
}

/**
 * 地図1枚。**本図も拡大図もこれで描く。**
 *
 * 拡大図を別の作りにすると、片方だけ縮尺を直したり、片方だけ札の色が
 * 変わったりする。同じ紙・同じ札・同じ縮尺の棒で出す。
 */
function Frame({
  d, uid, alt, zoom,
}: {
  d: { slug: string; w: number; h: number; km: number;
       pins: Pin[]; marks: Mark[]; labels: Label[] };
  uid: (k: string) => string;
  alt: string;
  /** 本図にだけ載る「ここを拡大した」の四角 */
  zoom?: { rect: number[]; t: string;
           tab: { x: number; y: number; w: number; fs: number } };
}) {
  const marks = d.marks.filter((k) => GLYPHS[k.k]);
  const kinds = [...new Set(marks.map((k) => k.k))];
  /* 絵の `<symbol>` の id は**その紙ごと。** 本図と拡大図で同じ id を置くと、
     1枚のページに同じ id が2つ出て、2枚目の絵が1枚目のほうを指す。
     点の id（`uid`）は街で1つ。点はどちらか片方の紙にしか居ない */
  const gid = (k: string) => `cm-${d.slug}-${k}`;
  const { barKm, barW } = bar(d.km, d.w);

  return (
    <div className="cmap-frame" style={{ aspectRatio: `${d.w} / ${d.h}` }}>
      {/* 土台。道・川・緑・街区・旧市街。`tools/nordic/citymap.py` が焼く */}
      <img className="cmap-base" src={`/nordic/city/${d.slug}.svg`} width={d.w} height={d.h} alt="" />
      <svg className="cmap-svg" viewBox={`0 0 ${d.w} ${d.h}`} role="img" aria-label={alt}>
        <defs>
          {kinds.map((k) => (
            <symbol key={k} id={gid(`g-${k}`)} viewBox="0 0 24 24">
              <Glyph k={k} />
            </symbol>
          ))}
        </defs>

        {/* どこを拡大したか。**四角だけ置いても伝わらない**ので、名前を付ける */}
        {zoom && (
          <g className="cm-zoom">
            <rect x={zoom.rect[0]} y={zoom.rect[1]} width={zoom.rect[2]} height={zoom.rect[3]} rx="18" />
            <g className="cm-zoom-tab">
              <rect
                x={zoom.tab.x - zoom.tab.w / 2}
                y={zoom.tab.y - zoom.tab.fs * 1.16}
                width={zoom.tab.w}
                height={zoom.tab.fs * 1.5}
                rx={zoom.tab.fs * 0.62}
              />
              <text x={zoom.tab.x} y={zoom.tab.y - zoom.tab.fs * 0.02} style={{ fontSize: zoom.tab.fs }}>
                {zoom.t}
              </text>
            </g>
          </g>
        )}

        {/* 名前のついていない目印。宮殿・教会・市場が「そこにある」ことだけ
            を言う。押せないので厚みは付けない（`island-design.md` 3章3） */}
        {marks.map((k, i) => (
          <g key={i} className="cm-mark">
            {/* 紙の下敷き。**壁の白い絵が、クリームの地に沈むのを止める。**
                丸ではなく角丸の四角にして、番号の点（丸）と役目を分ける */}
            <rect x={k.x - 28} y={k.y - 28} width="56" height="56" rx="17" />
            <use href={`#${gid(`g-${k.k}`)}`} x={k.x - 23} y={k.y - 23} width="46" height="46" />
          </g>
        ))}

        {/* 地図の上の名前。**日本語で書く。** 読めない字を並べても
            「ここがどこか」は伝わらない。地の色は場所によって変わるので、
            札（紙）を敷いてから字を乗せる。置き場所は焼くときに、点とも
            ほかの札とも重ならないところを探してある */}
        {d.labels.map((l, i) => (
          <g key={i} className={`cm-label cm-lb-${l.k}`}>
            <rect
              x={l.x - l.w / 2}
              y={l.y - l.fs * 0.78}
              width={l.w}
              height={l.fs * 1.5}
              rx={l.fs * 0.62}
            />
            <text x={l.x} y={l.y + l.fs * 0.36} style={{ fontSize: l.fs }}>
              {l.t}
            </text>
          </g>
        ))}

        {/* どけた丸から、本当の場所へ引く線。丸より先に描く */}
        {d.pins.map((p) =>
          Math.hypot(p.x - p.ax, p.y - p.ay) > 4 ? (
            <g key={`l${p.id}`} className="cm-lead">
              <line x1={p.ax} y1={p.ay} x2={p.x} y2={p.y} />
              <circle cx={p.ax} cy={p.ay} r="6" />
            </g>
          ) : null,
        )}
        {d.pins.map((p) => (
          <g key={p.id} id={uid(`p${p.n}`)} className={`cm-pin cm-${p.cat}`}>
            <circle className="cm-dot" cx={p.x} cy={p.y} r="36" />
            <text className="cm-num" x={p.x} y={p.y + 13}>
              {p.n}
            </text>
          </g>
        ))}

        {/* 縮尺と方角。**歩ける距離かどうかは、これが無いと読めない** */}
        <g className="cm-scale" transform={`translate(26 ${d.h - 30})`}>
          <rect x="-12" y="-46" width={barW + 24} height="62" rx="16" />
          <line x1="0" y1="0" x2={barW} y2="0" />
          <line x1="0" y1="-8" x2="0" y2="8" />
          <line x1={barW} y1="-8" x2={barW} y2="8" />
          <text x={barW / 2} y="-16">
            {barKm < 1 ? `${barKm * 1000}m` : `${barKm}km`}
          </text>
        </g>
        <g className="cm-north" transform={`translate(${d.w - 54} 54)`}>
          <circle r="36" />
          <path d="M0 -24L9 8L0 1L-9 8Z" />
          <text y="30">N</text>
        </g>
      </svg>
    </div>
  );
}

export default function CityMap({ city }: { city: string }) {
  const m = (MAPS as Record<string, CityMapData>)[city];
  if (!m || !(m.pins.length || m.inset)) return null;
  const uid = (k: string) => `cm-${m.slug}-${k}`;

  const byCat = CATS.map((c) => ({
    ...c,
    rows: [...m.pins, ...(m.inset?.pins ?? [])]
      .filter((p) => p.cat === c.k)
      .sort((a, b) => a.n - b.n),
  })).filter((g) => g.rows.length);

  return (
    <div className="cmap">
      <Frame
        d={m}
        uid={uid}
        alt={`${city}の街の地図。道路と川と公園、見どころ${m.pins.length}か所`}
        zoom={m.inset ? { rect: m.inset.rect, t: m.inset.t, tab: m.inset.tab } : undefined}
      />

      {/* 見どころが1か所に固まっている街は、そこだけをもう一枚に拡大する。
          **本図の上で番号を押しのけると、番号が読めなくなる**（タリンは
          1km 四方に15個ある）。紙を増やして、どちらも大きいまま出す。 */}
      {m.inset && (
        <>
          {/* 2枚目が本図のどこなのかを、**紙の上でも言う。**
              本図の四角に付けた札と同じ言葉にして、2枚を結ぶ */}
          <b className="cmap-cap">{m.inset.t}</b>
          <Frame
            d={m.inset}
            uid={uid}
            alt={`${city}の${m.inset.t}を拡大した地図。見どころ${m.inset.pins.length}か所`}
          />
        </>
      )}

      <ul className="cmap-key">
        {byCat.map((g) => (
          <li key={g.k}>
            <b className={`cm-key-b cm-${g.k}`}>{g.label}</b>
            <span>
              {g.rows.map((p) => (
                <a key={p.id} className={`cm-row cm-${p.cat}`} href={`#${uid(`p${p.n}`)}`}>
                  <i>
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <Glyph k={p.k} />
                    </svg>
                    <b>{p.n}</b>
                  </i>
                  {p.t}
                </a>
              ))}
            </span>
          </li>
        ))}

        {/* 窓に入らなかったもの。**消さない。** 旅程に入っている以上、
            その日に行く場所なので、地図に載らないだけ。
            方角と距離を持っているので、**その向きへ矢印を向けて**渡す。
            押せないので、**完全に平ら**にする。厚み（真下の影）は
            「押せる」の合図なので、押せないものには付けない
            （`island-design.md` 3章3）。 */}
        {m.far.length > 0 && (
          <li>
            <b className="cm-key-b cm-key-out">足をのばす</b>
            <span>
              {m.far.map((f) => (
                <span key={f.id} className={`cm-far cm-${f.cat}`}>
                  <i aria-hidden="true">
                    <svg viewBox="0 0 24 24">
                      <path
                        d="M12 2.6l6.2 18.4L12 16.6 5.8 21z"
                        transform={`rotate(${f.deg} 12 12)`}
                      />
                    </svg>
                  </i>
                  <span>
                    {f.t}
                    <em>
                      {f.dir}へ{f.km}km
                    </em>
                  </span>
                </span>
              ))}
            </span>
          </li>
        )}
      </ul>
    </div>
  );
}
