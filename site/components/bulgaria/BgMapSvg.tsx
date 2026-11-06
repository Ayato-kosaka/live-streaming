import MAP from "@/content/bulgaria/map.json";

/**
 * ソフィア中心部の地図。
 *
 * **記号（A・B・C…）が、一覧とコースと地図で同じ字を指す。**
 * るるぶの見開きがやっているのはこれで、地図を開かなくても位置関係が分かる。
 * 番号ではなく英字にしてあるのは、星（重要度 1〜3）と混ざらないようにするため。
 *
 * 座標は `python/build_bulgaria.py` が緯度経度から焼いている。
 * **ここで出し直さない。必ずズレる**（`components/macedonia/NmMapSvg.tsx` と同じ決まり）。
 *
 * **歩ける範囲（中心から3km）だけを載せている。** リラ修道院は62km南にあって、
 * 同じ絵に入れると紙が 1000x10359 になり、中心部の印が1本の線に潰れた（実測）。
 * 遠い4つは地図の下に「中心から◯km」で出す。
 */
export default function BgMapSvg() {
  return (
    <figure className="bgmap">
      <svg
        viewBox={`0 0 ${MAP.w} ${MAP.h}`}
        role="img"
        aria-label={`ソフィア中心部の見どころ ${MAP.pins.length} か所の位置関係。記号は一覧と同じ A から。`}
      >
        <rect x="0" y="0" width={MAP.w} height={MAP.h} className="bgm-ground" />
        {/* 中心（聖ネデリャ教会）から 300m・600m の輪。
            **縮尺の代わり。** 棒の縮尺より、「ここから何分か」が直に読める。
            半径は焼いた紙の幅から出す——緯度1度=111km で割り戻した値を
            焼くほうが 1000px の幅に収めているので、ここは比だけ。 */}
        {[0.3, 0.6].map((r) => (
          <circle
            key={r}
            className="bgm-ring"
            cx={MAP.cx}
            cy={MAP.cy}
            r={(r / MAP.kmPerPx) || 0}
          />
        ))}
        {MAP.pins.map((p) => (
          /* **丸は小さめにする。** 中心部は 57m（E と G）まで寄っている印が
             あって、r=30 だと丸どうしが重なって1つに見えた（実測）。
             r=22 と、地の色の縁取りで「重なって前後にいる」と読めるようにする */
          <g key={p.id} className={`bgm-pin is-${p.mark} star-${p.star}`}>
            <circle cx={p.x} cy={p.y} r={22} />
            <text x={p.x} y={p.y + 9} textAnchor="middle" fontSize={26}>
              {p.letter}
            </text>
          </g>
        ))}
      </svg>
      <figcaption>
        中心（A・聖ネデリャ教会）からの輪は 300m と 600m。
        丸の色は印で、濃い丸が◎（あやとの好みに合うもの）。
        記号は下の一覧とコース表の記号と同じ。
        {MAP.far.length > 0 && (
          <>
            {" "}この絵に入らないものが{MAP.far.length}か所——
            {MAP.far.map((f) => `${f.name} 中心から${f.km}km`).join("、")}。
            近い順で、1〜2km なら歩ける。それより先はバスか車。
          </>
        )}
      </figcaption>
    </figure>
  );
}
