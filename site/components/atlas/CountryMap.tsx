import { COUNTRY_MAPS } from "./countryMaps";
import { peakPaths } from "./peak";
import { NOMINAL_W, placeCities, type Rect } from "./labels";
import { Compass } from "./art";
import { bucket } from "./dots";

/**
 * 国ひとつの寄り地図。国のページの頭に敷く。
 *
 * 世界地図を拡大したものではなく、その国の範囲で投影し直して間引きも
 * やり直したもの（`python/build_world_route.py`）。世界の粗さのまま寄ると、
 * キプロスやオランダがただの多角形になる。
 *
 * 動くところが無いので、サーバ側で HTML にしてしまう。
 * この地図のために JavaScript を1バイトも配らない。
 */

const MOVE: Record<string, { c: string; w: number; dash?: string }> = {
  land: { c: "var(--am-route)", w: 7 },
  air: { c: "#ffffff", w: 5, dash: "1 16" },
  sea: { c: "#ffffff", w: 5, dash: "1 12" },
  walk: { c: "var(--am-walk)", w: 9, dash: "0.5 14" },
  hitch: { c: "var(--am-hitch)", w: 6.5, dash: "14 12" },
  side: { c: "#e8be74", w: 4.5, dash: "1 11" },
};

export default function CountryMap({ slug, name }: { slug: string; name: string }) {
  const m = COUNTRY_MAPS[slug];
  if (!m) return null;
  const { w, h } = m.view;
  const mine = m.countries[slug];
  const others = Object.entries(m.countries).filter(([s]) => s !== slug);
  const uid = `cm-${slug}`;
  const peaks = peakPaths(m.peaks);
  const woods = bucket(m.woods ?? [], 3);
  const dunes = bucket(m.dunes ?? [], 2);
  const glints = bucket(m.glints ?? [], 2);

  // 街の名札の置き場所。近い街どうしでぶつからないよう、上下にずらして逃がす。
  // 当たり判定は px。地図の幅の見当を NOMINAL_W にして測る。
  const sc = NOMINAL_W / w;
  const taken: Rect[] = m.cities.map((c) => ({
    x0: c.x * sc - 9,
    y0: c.y * sc - 9,
    x1: c.x * sc + 9,
    y1: c.y * sc + 9,
  }));
  const labels = placeCities(
    m.cities.filter((c) => c.country === slug),
    (x, y) => [x * sc, y * sc],
    taken,
    (c) => c.x > w * 0.68,
  );

  return (
    <div className="amap" style={{ ["--am-ratio" as string]: `${w} / ${h}` }}>
      <div className="amap-stage">
        <svg className="amap-svg" viewBox={`0 0 ${w} ${h}`} role="img" aria-label={`${name}の中を移動したところ`}>
          <defs>
            <linearGradient id={`${uid}-sea`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#2f97d8" />
              <stop offset="1" stopColor="var(--am-sea-deep)" />
            </linearGradient>
            <linearGradient id={`${uid}-off`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="var(--am-off-n)" />
              <stop offset="1" stopColor="var(--am-off-s)" />
            </linearGradient>
            <linearGradient id={`${uid}-on`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="var(--am-on-n)" />
              <stop offset="0.62" stopColor="#c3dd72" />
              <stop offset="1" stopColor="var(--am-on-s)" />
            </linearGradient>
            <filter id={`${uid}-soft`} x="-15%" y="-15%" width="130%" height="130%">
              <feGaussianBlur stdDeviation="6" />
            </filter>
          </defs>

          <rect width={w} height={h} fill={`url(#${uid}-sea)`} />

          {/* 海の白いきらめき */}
          {glints.map(([r, d]) => (
            <path key={`g${r}`} d={d} stroke="#ffffff" strokeWidth={r * 2} strokeLinecap="round" opacity="0.2" fill="none" />
          ))}

          {/* 岸。浅瀬 → 泡 → 濡れ砂 → 乾いた砂 */}
          <path d={m.land} fill="none" stroke="var(--am-shelf)" strokeWidth="30" strokeLinejoin="round" opacity="0.85" filter={`url(#${uid}-soft)`} />
          <path d={m.land} fill="none" stroke="var(--am-shelf-hi)" strokeWidth="14" strokeLinejoin="round" opacity="0.9" />
          <path d={m.land} fill="none" stroke="var(--am-foam)" strokeWidth="8" strokeLinejoin="round" />
          <path d={m.land} fill="none" stroke="var(--am-sand-wet)" strokeWidth="5.5" strokeLinejoin="round" />
          <path d={m.land} fill={`url(#${uid}-off)`} stroke="var(--am-sand)" strokeWidth="3" strokeLinejoin="round" />

          {/* まわりの国はうっすら。主役の国だけ明るく塗る */}
          {others.map(([s, d]) => (
            <path key={s} d={d} fill="#cfdca4" opacity="0.75" />
          ))}
          {mine && <path d={mine} fill={`url(#${uid}-on)`} />}
          {mine && <path d={mine} fill="none" stroke="#3e7c33" strokeWidth="3.4" opacity="0.32" />}

          {/* 山 */}
          <path d={m.ridges} fill="none" stroke="var(--am-ridge)" strokeWidth="22" strokeLinecap="round" opacity="0.26" filter={`url(#${uid}-soft)`} />
          <g>
            <path d={peaks.body} fill="#a2703c" />
            <path d={peaks.face} fill="#cb9c5f" />
            <path d={peaks.cap} fill="#f7ecd2" />
          </g>

          {/* 森と砂丘。更地に見えないように地面に情報量を入れる */}
          {woods.map(([r, d]) => (
            <path key={`w${r}`} d={d} stroke="var(--am-wood)" strokeWidth={r * 2} strokeLinecap="round" opacity="0.26" fill="none" />
          ))}
          {dunes.map(([r, d]) => (
            <path key={`d${r}`} d={d} stroke="var(--am-dune)" strokeWidth={r * 2} strokeLinecap="round" opacity="0.48" fill="none" />
          ))}

          <path d={m.lakes} fill="var(--am-sea-mid)" />
          <path d={m.rivers} fill="none" stroke="#60a0d8" strokeWidth="3.2" strokeLinecap="round" opacity="0.85" />
          <path d={m.grid} fill="none" stroke="#ffffff" strokeWidth="1.6" opacity="0.12" />

          {/* 移動した線 */}
          {m.legs.map((l) => {
            const s = MOVE[l.move] ?? MOVE.land;
            return (
              <g key={`${l.from}-${l.to}`}>
                {!s.dash && <path d={l.d} fill="none" stroke="#0d3f74" strokeWidth={s.w + 4} strokeLinecap="round" opacity="0.22" />}
                <path d={l.d} fill="none" stroke={s.c} strokeWidth={s.w} strokeLinecap="round" strokeDasharray={s.dash} />
              </g>
            );
          })}

          {/* 街。この国の街だけ大きく、まわりの国の街は小さい点 */}
          {m.cities.map((c) => {
            const own = c.country === slug;
            return (
              <g key={c.id}>
                <circle cx={c.x} cy={c.y} r={own ? 11 : 6} fill="#0d3f74" opacity="0.25" transform="translate(1.5 2)" />
                <circle cx={c.x} cy={c.y} r={own ? 10 : 5.5} fill="#fffbf0" />
                {own && <circle cx={c.x} cy={c.y} r={5.5} fill={c.kind === "hub" ? "var(--accent)" : "var(--am-route)"} />}
              </g>
            );
          })}
        </svg>

        {/* 街の名前は HTML。SVG の文字だと、スマホ幅で 8px になって読めない */}
        <div className="amap-pins">
          {labels.map(({ c, dy, left }) => (
            <span
              key={c.id}
              className={`acity${left ? " is-left" : ""}`}
              style={{
                left: `${(c.x / w) * 100}%`,
                top: `${(c.y / h) * 100}%`,
                background: "transparent",
                boxShadow: "none",
                ["--acity-dy" as string]: `${dy}px`,
              }}
            >
              <b>{c.name}</b>
            </span>
          ))}
        </div>

        <Compass size={40} className="amap-rose" />

        <div className="amap-badge">
          <i style={{ width: `calc(${(m.scale.len / w) * 100} * 1cqw)` }} />
          {m.scale.km}km
        </div>
      </div>
    </div>
  );
}
