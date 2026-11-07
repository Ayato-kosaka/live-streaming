import MAP from "@/content/bulgaria/map.json";

/**
 * ソフィア中心部の地図。
 *
 * ## 本物の地図を敷く（2026-11-06）
 *
 * 1枚目は自前の SVG で、灰色の紙に丸が16個散っているだけだった。
 * あやと:「写真もgoogle mapもなくて、ほかの人が見てワクワクしない」。
 * いまは **OpenStreetMap のタイルを合成した絵**（`python/build_bulgaria_map.py`）を
 * 敷いて、その上に記号だけを重ねている。通りも公園も名前が読める。
 *
 * **記号（A・B・C…）が、一覧とコースと地図で同じ字を指す。** るるぶの見開きが
 * やっているのはこれで、押さなくても位置関係が分かる。番号ではなく英字にしてあるのは、
 * 星（重要度 1〜3）と混ざらないようにするため。
 *
 * 座標は `python/build_bulgaria.py` が、絵の枠（`python/data/bulgaria/tiles.json` の
 * 緯度経度）から焼いている。**ここで出し直さない。必ずズレる**
 * （`components/macedonia/NmMapSvg.tsx` と同じ決まり）。
 * 緯度は **web-mercator** で引いてある——線形で割ると、焼いた絵と合わない。
 *
 * **歩ける範囲（中心から1km）だけを載せている。** 外へ広げるほど中心の印が潰れる。
 * 入らないものは絵の下に「中心から◯km」で出す。
 */
export default function BgMapSvg() {
  const art = MAP.art as { png?: string; png2x?: string; credit?: string; licence?: string };
  const pins = (
    <svg
      viewBox={`0 0 ${MAP.w} ${MAP.h}`}
      role="img"
      aria-label={`ソフィア中心部の見どころ ${MAP.pins.length} か所の位置関係。記号は一覧と同じ A から。`}
    >
      {!art.png && <rect x="0" y="0" width={MAP.w} height={MAP.h} className="bgm-ground" />}
      {/* **輪（300m・600m）は、地の絵が無いときだけ。** 本物の地図の上に重ねると、
          通りの線とぶつかって読みにくくなるだけだった（実測して外した）。
          距離は一覧の「中心から徒歩◯分」が全件持っている */}
      {!art.png &&
        [0.3, 0.6].map((r) => (
          <circle key={r} className="bgm-ring" cx={MAP.cx} cy={MAP.cy} r={r / MAP.kmPerPx || 0} />
        ))}
      {MAP.pins.map((p) => (
        <g key={p.id} className={`bgm-pin is-${p.mark} star-${p.star}`}>
          {/* 地図の上に置くので、丸は**地の絵より強く**する。
              縁取りを白にして、通りの線と見分けがつくようにした */}
          <circle cx={p.x} cy={p.y} r={26} />
          <text x={p.x} y={p.y + 10} textAnchor="middle" fontSize={30}>
            {p.letter}
          </text>
        </g>
      ))}
    </svg>
  );

  return (
    <figure className="bgmap">
      {art.png ? (
        <div className="bgmap-box">
          <img
            src={art.png}
            srcSet={art.png2x ? `${art.png} 1x, ${art.png2x} 2x` : undefined}
            width={MAP.w}
            height={MAP.h}
            alt="ソフィア中心部の地図。中央が聖ネデリャ教会の広場で、南へヴィトシャ大通りがのびる。"
            loading="lazy"
            decoding="async"
          />
          {pins}
        </div>
      ) : (
        pins
      )}
      <figcaption>
        <b>A</b> が中心（聖ネデリャ教会）。記号は上の一覧とコース表と同じで、
        緑の丸が◎（あやとの好みに合うもの）。
        {art.credit && (
          <>
            {" "}
            <a href={art.licence} target="_blank" rel="noreferrer">
              {art.credit}
            </a>
          </>
        )}
      </figcaption>
      {MAP.far.length > 0 && (
        /* **この絵に入らないもの。** 字の塊にすると読み飛ばされるので、
            名前と距離の組を1つずつの札にする */
        <ul className="bgfar">
          {MAP.far.map((f) => (
            <li key={f.name}>
              <b>{f.name}</b>
              <i>中心から {f.km}km</i>
            </li>
          ))}
        </ul>
      )}
    </figure>
  );
}
