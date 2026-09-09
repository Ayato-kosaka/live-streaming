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
 * 全部描いて、旧市街と川に日本語の名前を書く。焼くのは `tools/nordic/citymap.py`。
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
type Far = { id: string; cat: string; t: string; km: number; dir: string };
type Mark = { x: number; y: number; k: string };
type Label = { x: number; y: number; t: string; k: string };
type CityMapData = {
  slug: string; w: number; h: number; km: number;
  pins: Pin[]; marks: Mark[]; labels: Label[]; far: Far[];
};

/** 見どころの種類。**この4つ以外は来ない**（`nordic/*.json` の `cat`）。 */
const CATS = [
  { k: "see", label: "見たい" },
  { k: "eat", label: "食べたい" },
  { k: "do", label: "やりたい" },
  { k: "buy", label: "買いたい" },
] as const;

/**
 * 目印の絵。**24×24 の中に、上が明るい2〜3色で描く**（`island-design.md` 2章）。
 * 絵文字は使わない。11px で出るので、線は引かず面だけで形を作る。
 */
const GLYPHS: Record<string, React.ReactNode> = {
  castle: (
    <>
      <path className="g-roof" d="M3 9l2.5-4L8 9zM16 9l2.5-4L21 9z" />
      <path className="g-wall" d="M3 9h5v11H3zM16 9h5v11h-5zM8 12h8v8H8z" />
      <path className="g-roof" d="M8 12l4-4 4 4z" />
      <path className="g-dark" d="M10.6 15h2.8v5h-2.8z" />
    </>
  ),
  church: (
    <>
      <path className="g-dark" d="M11.2 1h1.6v4h-1.6z" />
      <path className="g-dark" d="M9.8 2.4h4.4V4H9.8z" />
      <path className="g-roof" d="M12 5l4 5H8z" />
      <path className="g-wall" d="M8.6 10h6.8v10H8.6z" />
      <path className="g-roof" d="M3 13l3-3 3 3zM15 13l3-3 3 3z" />
      <path className="g-wall" d="M3.4 13h5.2v7H3.4zM15.4 13h5.2v7h-5.2z" />
      <path className="g-dark" d="M10.6 14.5h2.8V20h-2.8z" />
    </>
  ),
  museum: (
    <>
      <path className="g-roof" d="M12 3l9 5H3z" />
      <path className="g-wall" d="M4 8h16v2H4zM3 18h18v2.5H3z" />
      <path className="g-wall" d="M5.5 10h2.4v8H5.5zM10.8 10h2.4v8h-2.4zM16.1 10h2.4v8h-2.4z" />
    </>
  ),
  market: (
    <>
      <path className="g-roof" d="M3 5h4.5v5H3zM12 5h4.5v5H12z" />
      <path className="g-wall" d="M7.5 5H12v5H7.5zM16.5 5H21v5h-4.5z" />
      <path className="g-wall" d="M5 10h14v10H5z" />
      <path className="g-dark" d="M8 13h8v7H8z" />
    </>
  ),
  station: (
    <>
      <path className="g-roof" d="M2.5 6h19v2.6h-19z" />
      <path className="g-wall" d="M5.5 8.6h13V17h-13z" />
      <path className="g-dark" d="M7.5 10.4h9V14h-9z" />
      <path className="g-dark" d="M6.5 18h3v2h-3zM14.5 18h3v2h-3z" />
    </>
  ),
  tower: (
    <>
      <path className="g-roof" d="M12 1.5l3.4 5.5H8.6z" />
      <path className="g-wall" d="M9.2 7h5.6v13H9.2z" />
      <path className="g-dark" d="M10.6 10h2.8v4h-2.8z" />
      <path className="g-wall" d="M6.5 17.5h11V20h-11z" />
    </>
  ),
  park: (
    <>
      <path className="g-trunk" d="M11.1 13h1.8v7h-1.8z" />
      <circle className="g-leaf" cx="12" cy="8.6" r="6" />
      <circle className="g-leafhi" cx="10.2" cy="6.6" r="2.8" />
    </>
  ),
  food: (
    <>
      <path className="g-wall" d="M3.5 11h17a8.5 8.5 0 0 1-17 0z" />
      <path className="g-dark" d="M2 19.4h20V21H2z" />
      <path className="g-roof" d="M7.5 3h1.6v6H7.5zM14.9 3h1.6v6h-1.6z" />
    </>
  ),
  arena: (
    <>
      <path className="g-roof" d="M2.5 12a9.5 8 0 0 1 19 0z" />
      <path className="g-wall" d="M2.5 12h19v7h-19z" />
      <path className="g-dark" d="M6 14.5h12V19H6z" />
    </>
  ),
  sauna: (
    <>
      <path className="g-roof" d="M12 6l9 5H3z" />
      <path className="g-wall" d="M5 11h14v9H5z" />
      <path className="g-dark" d="M8 14h8v6H8z" />
      <path className="g-steam" d="M8.5 1.5c1.6 1.2 1.6 2.4 0 3.6M15.5 1.5c1.6 1.2 1.6 2.4 0 3.6" />
    </>
  ),
  ship: (
    <>
      <path className="g-wall" d="M2.5 15h19l-3 5H5.5z" />
      <path className="g-roof" d="M12.8 2.5l6 10h-6z" />
      <path className="g-dark" d="M11.2 2.5h1.4v10h-1.4zM4 9.5h6.4v3H4z" />
    </>
  ),
  house: (
    <>
      <path className="g-roof" d="M12 4l8.5 6.5h-17z" />
      <path className="g-wall" d="M5.5 10.5h13V20h-13z" />
      <path className="g-dark" d="M10.6 14h2.8v6h-2.8z" />
    </>
  ),
  spot: (
    <>
      <circle className="g-roof" cx="12" cy="12" r="7" />
      <circle className="g-wall" cx="12" cy="12" r="3" />
    </>
  ),
};
const GLYPH_KEYS = Object.keys(GLYPHS);

/** 名前の札の幅を、字の数から出す。全角は1、半角は 0.5 で数える。 */
function chipWidth(t: string, fs: number) {
  let n = 0;
  for (const ch of t) n += /[ -ÿ]/.test(ch) ? 0.55 : 1;
  return Math.round(n * fs + fs * 1.1);
}

export default function CityMap({ city }: { city: string }) {
  const m = (MAPS as Record<string, CityMapData>)[city];
  if (!m || !m.pins.length) return null;
  const uid = (k: string) => `cm-${m.slug}-${k}`;

  const byCat = CATS.map((c) => ({
    ...c,
    rows: m.pins.filter((p) => p.cat === c.k),
    far: m.far.filter((f) => f.cat === c.k),
  })).filter((g) => g.rows.length || g.far.length);

  /* 縮尺の棒。**窓の実寸から出す。** 街ごとに窓の広さが違う（2〜4.8km）ので、
     棒が無いと「歩ける旧市街」と「地下鉄で移動する街」を読み違える。 */
  const barKm = m.km > 3.6 ? 1 : m.km > 2.4 ? 0.5 : 0.3;
  const barW = Math.round((barKm / m.km) * m.w);

  return (
    <div className="cmap">
      <div className="cmap-frame" style={{ aspectRatio: `${m.w} / ${m.h}` }}>
      {/* 土台。**先に読み込まれてほしいので `loading` を遅らせない。**
          地図が後から出ると、点だけが宙に浮いた絵をいちど見せることになる */}
      <img
        className="cmap-base"
        src={`/nordic/city/${m.slug}.svg`}
        width={m.w}
        height={m.h}
        alt=""
      />
      <svg
        className="cmap-svg"
        viewBox={`0 0 ${m.w} ${m.h}`}
        role="img"
        aria-label={`${city}の街の地図。道路と川と公園、見どころ${m.pins.length}か所`}
      >
        <defs>
          {GLYPH_KEYS.map((k) => (
            <symbol key={k} id={uid(`g-${k}`)} viewBox="0 0 24 24">
              {GLYPHS[k]}
            </symbol>
          ))}
        </defs>

        {/* 名前のついていない目印。**街の顔ぶれを見せるためだけ**に置く。
            押せないので、厚みは付けない（`island-design.md` 3章3） */}
        {m.marks.map((k, i) => (
          <use
            key={i}
            className="cm-mark"
            href={`#${uid(`g-${GLYPHS[k.k] ? k.k : "spot"}`)}`}
            x={k.x - 19}
            y={k.y - 19}
            width="38"
            height="38"
          />
        ))}

        {/* どけた丸から、本当の場所へ引く線。丸より先に描く */}
        {m.pins.map((p) =>
          Math.hypot(p.x - p.ax, p.y - p.ay) > 4 ? (
            <g key={`l${p.id}`} className="cm-lead">
              <line x1={p.ax} y1={p.ay} x2={p.x} y2={p.y} />
              <circle cx={p.ax} cy={p.ay} r="6" />
            </g>
          ) : null,
        )}
        {m.pins.map((p) => (
          <g key={p.id} id={uid(`p${p.n}`)} className={`cm-pin cm-${p.cat}`}>
            <circle className="cm-dot" cx={p.x} cy={p.y} r="36" />
            <text className="cm-num" x={p.x} y={p.y + 13}>
              {p.n}
            </text>
          </g>
        ))}

        {/* 地図の上の名前。**日本語で書く。** 読めない字を並べても
            「ここがどこか」は伝わらない。地の色は場所によって変わるので、
            札（紙）を敷いてから字を乗せる（縁取りだけだと道の上で読めない） */}
        {m.labels.map((l, i) => {
          const fs = l.k === "district" ? 40 : 36;
          const w = chipWidth(l.t, fs);
          return (
            <g key={i} className={`cm-label cm-lb-${l.k}`}>
              <rect
                x={l.x - w / 2}
                y={l.y - fs * 0.78}
                width={w}
                height={fs * 1.5}
                rx={fs * 0.62}
              />
              <text x={l.x} y={l.y + fs * 0.36} style={{ fontSize: fs }}>
                {l.t}
              </text>
            </g>
          );
        })}

        {/* 縮尺と方角。**歩ける距離かどうかは、これが無いと読めない** */}
        <g className="cm-scale" transform={`translate(26 ${m.h - 30})`}>
          <rect x="-12" y="-46" width={barW + 24} height="62" rx="16" />
          <line x1="0" y1="0" x2={barW} y2="0" />
          <line x1="0" y1="-8" x2="0" y2="8" />
          <line x1={barW} y1="-8" x2={barW} y2="8" />
          <text x={barW / 2} y="-16">
            {barKm < 1 ? `${barKm * 1000}m` : `${barKm}km`}
          </text>
        </g>
        <g className="cm-north" transform={`translate(${m.w - 54} 54)`}>
          <circle r="36" />
          <path d="M0 -24L9 8L0 1L-9 8Z" />
          <text y="30">N</text>
        </g>
      </svg>
      </div>

      <ul className="cmap-key">
        {byCat.map((g) => (
          <li key={g.k}>
            <b className={`cm-key-b cm-${g.k}`}>{g.label}</b>
            <span>
              {g.rows.map((p) => (
                <a key={p.id} className={`cm-row cm-${p.cat}`} href={`#${uid(`p${p.n}`)}`}>
                  <i>
                    <svg viewBox="0 0 24 24" aria-hidden="true" className="cm-rowg">
                      {GLYPHS[p.k] ?? GLYPHS.spot}
                    </svg>
                    <b>{p.n}</b>
                  </i>
                  {p.t}
                </a>
              ))}
              {/* 窓に入らなかったもの。**消さずに、どっちへ何km かを言う。** */}
              {g.far.map((f) => (
                <span key={f.id} className="cm-far">
                  {f.t}
                  <em>
                    中心から{f.dir}へ{f.km}km
                  </em>
                </span>
              ))}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
