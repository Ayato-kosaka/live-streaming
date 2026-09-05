"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import MAP from "@/content/atlas/route.json";
import { COUNTRIES } from "@/content/countries";

/**
 * パリからジョージアまでの1枚の地図。
 *
 * 形は本物。Natural Earth の海岸線をメルカトルで投影して焼いてある
 * （`python/build_world_route.py`）。塗りは島とそろえていて、
 * 輪郭線を引かず、浅瀬・泡・砂の帯で陸と海を分ける。
 *
 * 座標はぜんぶスクリプトが計算ずみ。ここで経度緯度から座標を作らないこと。
 *
 * ## 寄せかたの作り
 *
 * 地形は1枚の `<g>` に入れて CSS の transform で寄せる。
 * 国のピンと街の名前は SVG ではなく **HTML** で地図の上に重ねている。
 * SVG の文字にすると、世界ぜんぶを 360px に収めたときに
 * 8px 以下になって読めない。HTML なら寄せても文字の大きさが変わらない。
 *
 * 線の太さと点の大きさは `1/k` を掛けて、寄せても見た目が変わらないようにする。
 */

type Chapter = { id: string; label: string; box: number[] };

const W = MAP.view.w;
const H = MAP.view.h;

/** 移動のしかたごとの線。歩いた線がいちばん目立つ。 */
const MOVE: Record<string, { c: string; w: number; dash?: string; cap?: "round" | "butt" }> = {
  land: { c: "var(--am-route)", w: 6.5 },
  air: { c: "#ffffff", w: 4.4, dash: "1 15", cap: "round" },
  sea: { c: "#ffffff", w: 4.4, dash: "1 11", cap: "round" },
  walk: { c: "var(--am-walk)", w: 8.5, dash: "0.5 13", cap: "round" },
  hitch: { c: "var(--am-hitch)", w: 6, dash: "13 11", cap: "round" },
  side: { c: "#e8be74", w: 4, dash: "1 10", cap: "round" },
};

/**
 * 点の絵（森・砂丘・山・きらめき）を、半径ごとにまとめて1本のパスにする。
 *
 * 900個を `<circle>` で並べると DOM が重いうえ、寄せたときに大きさを
 * 直せない。長さゼロの線を丸い端で描くと「点」になるので、
 * 太さ（= 半径×2）だけで大きさを変えられる。
 *
 * @param dots [x, y, 半径] の並び
 * @param levels いくつの太さに分けるか
 * @returns [半径, パス] の並び
 */
function bucket(dots: number[][], levels: number): [number, string][] {
  if (!dots.length) return [];
  const rs = dots.map((d) => d[2]);
  const lo = Math.min(...rs);
  const hi = Math.max(...rs);
  const out: [number, string[]][] = [];
  for (let i = 0; i < levels; i += 1) {
    out.push([lo + ((hi - lo) * (i + 0.5)) / levels, []]);
  }
  for (const [x, y, r] of dots) {
    const i = hi === lo ? 0 : Math.min(levels - 1, Math.floor(((r - lo) / (hi - lo)) * levels));
    out[i][1].push(`M${x} ${y}l0 0`);
  }
  return out.filter((b) => b[1].length).map((b) => [b[0], b[1].join("")] as [number, string]);
}

const WOODS = bucket(MAP.woods, 3);
const DUNES = bucket(MAP.dunes, 2);
const PEAKS = bucket(MAP.peaks, 3);
const GLINTS = bucket(MAP.glints, 2);

/** 国の名札を、ピンのどちら側に出すか。隣どうしがぶつからないよう手で決める。 */
const SIDE: Record<string, "l" | "r"> = {
  netherlands: "r",
  belgium: "l",
  germany: "r",
  czech: "r",
  slovakia: "r",
  austria: "l",
  hungary: "r",
  uk: "l",
  france: "l",
  cyprus: "r",
  jordan: "r",
  armenia: "l",
  "iran-border": "r",
};

export default function WorldRoute({ here = "georgia" }: { here?: string }) {
  const [chap, setChap] = useState(0);
  const chapters = MAP.chapters as Chapter[];
  const box = chapters[chap].box;
  const wide = chap === 0;

  const { k, tx, ty } = useMemo(() => {
    const kk = W / box[2];
    return { k: kk, tx: -box[0] * kk, ty: -box[1] * kk };
  }, [box]);

  /** 地図の中の座標を、重ねている HTML の位置（%）に直す。 */
  const pos = (x: number, y: number) => ({
    left: `${((x * k + tx) / W) * 100}%`,
    top: `${((y * k + ty) / H) * 100}%`,
  });

  const name = Object.fromEntries(COUNTRIES.map((c) => [c.slug, c.name]));
  const anchors = MAP.anchors as Record<string, { x: number; y: number; order: number; city: string }>;
  const cities = MAP.cities as { id: string; name: string; x: number; y: number; country: string; kind: string }[];

  // 章の中に入っている街だけ名前を出す。外の街まで出すと、地図の縁に
  // 半分だけ見えている名前が並んで汚くなる。
  const inBox = (x: number, y: number) =>
    x > box[0] + 8 && x < box[0] + box[2] - 8 && y > box[1] + 8 && y < box[1] + box[3] - 8;

  return (
    <div>
      <div className="amap-tabs" role="tablist" aria-label="地図を寄せる">
        {chapters.map((c, i) => (
          <button
            key={c.id}
            type="button"
            role="tab"
            aria-selected={i === chap}
            className={`amap-tab${i === chap ? " is-on" : ""}`}
            onClick={() => setChap(i)}
          >
            {c.label}
          </button>
        ))}
      </div>

      <div className="amap">
        <div className="amap-stage">
          <svg className="amap-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="パリからジョージアまで、これまでに歩いた17カ国の地図">
            <defs>
              <linearGradient id="amSea" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="#2f97d8" />
                <stop offset="0.55" stopColor="var(--am-sea-deep)" />
                <stop offset="1" stopColor="#0f57ad" />
              </linearGradient>
              <linearGradient id="amOff" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="var(--am-off-n)" />
                <stop offset="1" stopColor="var(--am-off-s)" />
              </linearGradient>
              <linearGradient id="amOn" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="var(--am-on-n)" />
                <stop offset="0.62" stopColor="#c3dd72" />
                <stop offset="1" stopColor="var(--am-on-s)" />
              </linearGradient>
              <filter id="amSoft" x="-15%" y="-15%" width="130%" height="130%">
                <feGaussianBlur stdDeviation="7" />
              </filter>
              <filter id="amRidge" x="-15%" y="-15%" width="130%" height="130%">
                <feGaussianBlur stdDeviation="5" />
              </filter>
            </defs>

            {/* 海。上が明るく、下へ行くほど深い青 */}
            <rect width={W} height={H} fill="url(#amSea)" />

            <g className="amap-move" style={{ transform: `translate(${tx}px, ${ty}px) scale(${k})` }}>
              {/* 海の白いきらめき */}
              {GLINTS.map(([r, d]) => (
                <path key={`g${r}`} d={d} stroke="#ffffff" strokeWidth={(r * 2) / k} strokeLinecap="round" opacity="0.2" fill="none" />
              ))}

              {/* 岸。浅瀬 → 泡 → 濡れ砂 → 乾いた砂。島の砂浜と同じ重ね方 */}
              <path d={MAP.land} fill="none" stroke="var(--am-shelf)" strokeWidth={34 / k} strokeLinejoin="round" opacity="0.85" filter="url(#amSoft)" />
              <path d={MAP.land} fill="none" stroke="var(--am-shelf-hi)" strokeWidth={16 / k} strokeLinejoin="round" opacity="0.9" />
              <path d={MAP.land} fill="none" stroke="var(--am-foam)" strokeWidth={9 / k} strokeLinejoin="round" />
              <path d={MAP.land} fill="none" stroke="var(--am-sand-wet)" strokeWidth={6.5 / k} strokeLinejoin="round" />
              <path d={MAP.land} fill="url(#amOff)" stroke="var(--am-sand)" strokeWidth={3.5 / k} strokeLinejoin="round" />

              {/* 通った国。まわりより明るく、彩度も高く */}
              {Object.entries(MAP.countries).map(([slug, d]) => (
                <path key={slug} d={d as string} fill="url(#amOn)" />
              ))}
              {/* 国の境。かたい線は引かない。内側に落ちる淡い影で分ける */}
              {Object.entries(MAP.countries).map(([slug, d]) => (
                <path key={`e${slug}`} d={d as string} fill="none" stroke="#3e7c33" strokeWidth={3 / k} opacity="0.3" />
              ))}

              {/* 山脈。やわらかい帯の上に丸い山の印 */}
              <path d={MAP.ridges} fill="none" stroke="var(--am-ridge)" strokeWidth={26 / k} strokeLinecap="round" opacity="0.3" filter="url(#amRidge)" />
              {PEAKS.map(([r, d]) => (
                <g key={`p${r}`}>
                  <path d={d} stroke="#9a7040" strokeWidth={(r * 2) / k} strokeLinecap="round" opacity="0.55" fill="none" />
                  <path d={d} stroke="#e0c08a" strokeWidth={(r * 1.1) / k} strokeLinecap="round" opacity="0.8" fill="none" transform={`translate(0 ${-r * 0.35})`} />
                </g>
              ))}

              {/* 森と砂丘 */}
              {WOODS.map(([r, d]) => (
                <path key={`w${r}`} d={d} stroke="var(--am-wood)" strokeWidth={(r * 2) / k} strokeLinecap="round" opacity="0.28" fill="none" />
              ))}
              {DUNES.map(([r, d]) => (
                <path key={`d${r}`} d={d} stroke="var(--am-dune)" strokeWidth={(r * 2) / k} strokeLinecap="round" opacity="0.5" fill="none" />
              ))}

              {/* 湖と川 */}
              <path d={MAP.lakes} fill="var(--am-sea-mid)" />
              <path d={MAP.rivers} fill="none" stroke="#60a0d8" strokeWidth={2.6 / k} strokeLinecap="round" opacity="0.85" />

              {/* 経緯線。うっすら出すだけで「地図を見ている」感じが出る */}
              <path d={MAP.grid} fill="none" stroke="#ffffff" strokeWidth={1.4 / k} opacity="0.12" />

              {/* 海の名前 */}
              {(MAP.seas as { name: string; x: number; y: number; size: number; rot: number }[]).map((s) => (
                <text
                  key={s.name}
                  className="am-sea"
                  x={s.x}
                  y={s.y}
                  fontSize={s.size / Math.sqrt(k)}
                  strokeWidth={4 / k}
                  textAnchor="middle"
                  transform={s.rot ? `rotate(${s.rot} ${s.x} ${s.y})` : undefined}
                >
                  {s.name}
                </text>
              ))}

              {/* ルート。下に濃い影を敷いてから本線を重ねる */}
              {(MAP.legs as { from: string; to: string; move: string; d: string }[]).map((l) => {
                const s = MOVE[l.move] ?? MOVE.land;
                return (
                  <g key={`${l.from}-${l.to}`}>
                    {!s.dash && (
                      <path d={l.d} fill="none" stroke="#0d3f74" strokeWidth={(s.w + 4) / k} strokeLinecap="round" opacity="0.22" />
                    )}
                    <path
                      d={l.d}
                      fill="none"
                      stroke={s.c}
                      strokeWidth={s.w / k}
                      strokeLinecap={s.cap ?? "round"}
                      strokeDasharray={s.dash ? s.dash.split(" ").map((n) => Number(n) / k).join(" ") : undefined}
                    />
                  </g>
                );
              })}
            </g>
          </svg>

          {/* 国のピンと街。HTML で重ねているので、寄せても文字が小さくならない */}
          <div className={`amap-pins${wide ? " is-wide" : ""}`}>
            {cities
              .filter((c) => c.kind !== "hub" && inBox(c.x, c.y))
              .map((c) => (
                <span key={c.id} className={`acity${c.x > box[0] + box[2] * 0.72 ? " is-left" : ""}`} style={pos(c.x, c.y)}>
                  <b>{c.name}</b>
                </span>
              ))}
            {Object.entries(anchors).map(([slug, a]) => (
              <Link
                key={slug}
                href={`/map/${slug}`}
                className={`apin${slug === here ? " is-here" : ""}${!wide && inBox(a.x, a.y) ? " is-named" : ""}`}
                style={pos(a.x, a.y)}
              >
                <span className="apin-dot">
                  <span>{a.order}</span>
                </span>
                <span className="apin-name" style={SIDE[slug] === "l" ? { left: "auto", right: "50%", transform: "translateX(24px)" } : undefined}>
                  {name[slug]}
                </span>
              </Link>
            ))}
          </div>

          <div className="amap-badge">
            <i
              style={{
                display: "block",
                width: `${((MAP.scale.len * k) / W) * 100}%`,
                minWidth: 22,
                height: 7,
                borderRadius: 2,
                border: "2.5px solid currentColor",
                borderTop: 0,
              }}
            />
            {MAP.scale.km}km
          </div>
        </div>
      </div>

      <div className="amap-foot">
        <span className="amap-key">
          <i style={{ background: "var(--am-route)" }} />
          電車・バス
        </span>
        <span className="amap-key">
          <i style={{ background: "#fff", boxShadow: "0 0 0 1px rgba(90,66,34,.25)" }} />
          飛行機・船
        </span>
        <span className="amap-key">
          <i style={{ background: "var(--am-walk)" }} />
          歩いた
        </span>
        <span className="amap-key">
          <i style={{ background: "var(--am-hitch)" }} />
          ヒッチハイク
        </span>
      </div>
    </div>
  );
}
