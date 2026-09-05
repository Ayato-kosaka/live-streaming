"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import MAP from "@/content/atlas/route.json";
import { peakPaths } from "./peak";
import { hits, NOMINAL_W, placeCities, type Rect } from "./labels";
import { Compass } from "./art";
import { bucket } from "./dots";
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

/** 凡例に出す移動のしかた。多い順に並べる。 */
const LEGEND: [string, string][] = [
  ["land", "電車・バス"],
  ["air", "飛行機"],
  ["sea", "船"],
  ["walk", "歩いた"],
  ["hitch", "ヒッチハイク"],
  // 「日帰り」だけだと、隣に出る距離の合計が何の数字か通じない。
  // 拠点から出て戻ってきた往復ぶん、と読める言い方にする。
  ["side", "近くまで往復"],
];

/** 国の名札の逃がし先 [左右, 上下]。上に置くのを本命に、順に空きを探す。 */
const PIN_SLOTS: [number, number][] = [
  [0, 0], [-44, 0], [44, 0], [0, -23], [-44, -23], [44, -23],
  [0, 47], [-48, 47], [48, 47], [0, -46], [0, 70],
];

type City = { id: string; name: string; x: number; y: number; country: string; kind: string };

const W = MAP.view.w;
const H = MAP.view.h;

/** 移動のしかたごとの線。歩いた線がいちばん目立つ。 */
const MOVE: Record<string, { c: string; w: number; dash?: string; cap?: "round" | "butt" }> = {
  land: { c: "var(--am-route)", w: 6.5 },
  air: { c: "#ffffff", w: 4.4, dash: "1 15", cap: "round" },
  sea: { c: "#ffffff", w: 4.4, dash: "1 11", cap: "round" },
  walk: { c: "var(--am-walk)", w: 8.5, dash: "0.5 13", cap: "round" },
  hitch: { c: "var(--am-hitch)", w: 6, dash: "13 11", cap: "round" },
  side: { c: "var(--am-side)", w: 5, dash: "2 9", cap: "round" },
};

/** 移動のしかたごとの距離(km)。スクリプトが大円距離で出したもの。 */
const moved = MAP.moved as Record<string, number>;

const WOODS = bucket(MAP.woods, 3);
const DUNES = bucket(MAP.dunes, 2);
const GLINTS = bucket(MAP.glints, 2);

export default function WorldRoute({ here = "georgia" }: { here?: string }) {
  const [chap, setChap] = useState(0);
  const chapters = MAP.chapters as Chapter[];
  const box = chapters[chap].box;
  const wide = chap === 0;

  const { k, z, tx, ty, peaks } = useMemo(() => {
    const kk = W / box[2];
    const z = Math.sqrt(kk);
    // 山は塗りなので、寄せた倍率のぶんだけ形を縮めておかないと巨大化する
    return { k: kk, z, tx: -box[0] * kk, ty: -box[1] * kk, peaks: peakPaths(MAP.peaks, 1 / z) };
  }, [box]);

  /** 地図の中の座標を、重ねている HTML の位置（%）に直す。 */
  const pos = (x: number, y: number) => ({
    left: `${((x * k + tx) / W) * 100}%`,
    top: `${((y * k + ty) / H) * 100}%`,
  });

  const name = Object.fromEntries(COUNTRIES.map((c) => [c.slug, c.name]));
  const anchors = MAP.anchors as Record<string, { x: number; y: number; order: number; city: string }>;
  const cities = MAP.cities as City[];

  // 章の中に入っている街だけ名前を出す。外の街まで出すと、地図の縁に
  // 半分だけ見えている名前が並んで汚くなる。余白は寄せぐあいに比例させる。
  const pad = box[2] * 0.035;
  const inBox = (x: number, y: number) =>
    x > box[0] + pad && x < box[0] + box[2] - pad && y > box[1] + pad && y < box[1] + box[3] - pad;

  /**
   * 名札を、重ならない場所に置く。
   *
   * 地図の点にそのまま置くと、近いものどうしで名前が重なって読めなくなる
   * （オーストリアとスロバキア、ゴリスとタテフ）。上下左右に少しずらし、
   * それでも空かなければ最後の候補に置く。
   *
   * 名札は寄せても大きさが変わらないので、当たり判定も px で測る。
   * 実際の幅は画面で決まるが、ここでは見当（620px）で計算する。
   * 少しずれても「重なって読めない」よりはるかにましなので、これでよい。
   *
   * 国の名札を先に置く。国のほうが行き先なので、街に譲らせる。
   */
  const labels = useMemo(() => {
    const SW = NOMINAL_W;
    const SH = (SW * H) / W;
    const px = (x: number) => ((x * k + tx) / W) * SW;
    const py = (y: number) => ((y * k + ty) / H) * SH;
    const taken: Rect[] = [];

    // ピンの丸そのもの。ここには何も置かせない。
    const pins = Object.entries(anchors).map(([slug, a]) => ({ slug, a, x: px(a.x), y: py(a.y) }));
    for (const p of pins) taken.push({ x0: p.x - 14, y0: p.y - 14, x1: p.x + 14, y1: p.y + 14 });

    const country: Record<string, { dx: number; dy: number }> = {};
    if (!wide) {
      for (const p of pins.filter((v) => inBox(v.a.x, v.a.y)).sort((a, b) => a.a.order - b.a.order)) {
        const w = (name[p.slug]?.length ?? 3) * 12 + 20;
        let put: { dx: number; dy: number; box: Rect } | null = null;
        for (const [dx, dy] of PIN_SLOTS) {
          const box2: Rect = { x0: p.x + dx - w / 2, y0: p.y - 32 + dy, x1: p.x + dx + w / 2, y1: p.y - 8 + dy };
          if (!taken.some((t) => hits(t, box2))) {
            put = { dx, dy, box: box2 };
            break;
          }
        }
        const last = PIN_SLOTS[PIN_SLOTS.length - 1];
        const dx = put?.dx ?? last[0];
        const dy = put?.dy ?? last[1];
        country[p.slug] = { dx, dy };
        taken.push(put?.box ?? { x0: p.x + dx - w / 2, y0: p.y - 32 + dy, x1: p.x + dx + w / 2, y1: p.y - 8 + dy });
      }
    }

    const city = placeCities(
      cities.filter((v) => v.kind !== "hub" && inBox(v.x, v.y)),
      (x, y) => [px(x), py(y)],
      taken,
      (c) => c.x > box[0] + box[2] * 0.74,
    );
    return { country, city };
  }, [box, k, tx, ty, wide]);

  // 縮尺。寄せると 1000km の棒が地図からはみ出すので、
  // 地図の幅の2割ぐらいに収まる「1・2・5 の切りのいい距離」を選び直す。
  const bar = useMemo(() => {
    const wantKm = box[2] * MAP.scale.kmPerUnit * 0.22;
    const p10 = 10 ** Math.floor(Math.log10(wantKm));
    const km = [1, 2, 5, 10].map((m) => m * p10).reduce((a, b) => (Math.abs(b - wantKm) < Math.abs(a - wantKm) ? b : a));
    return { km, pct: ((km / MAP.scale.kmPerUnit) * k * 100) / W };
  }, [box, k]);

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
              <linearGradient id="amOff" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2={H}>
                <stop offset="0" stopColor="var(--am-off-n)" />
                <stop offset="1" stopColor="var(--am-off-s)" />
              </linearGradient>
              <linearGradient id="amOn" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2={H}>
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
                <path key={`g${r}`} d={d} stroke="#ffffff" strokeWidth={(r * 2) / z} strokeLinecap="round" opacity="0.2" fill="none" />
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
              <path d={MAP.ridges} fill="none" stroke="var(--am-ridge)" strokeWidth={26 / z} strokeLinecap="round" opacity="0.3" filter="url(#amRidge)" />
              <g className="am-peaks">
                <path d={peaks.body} fill="#a2703c" />
                <path d={peaks.face} fill="#cb9c5f" />
                <path d={peaks.cap} fill="#f7ecd2" />
              </g>

              {/* 森と砂丘 */}
              {WOODS.map(([r, d]) => (
                <path key={`w${r}`} d={d} stroke="var(--am-wood)" strokeWidth={(r * 2) / z} strokeLinecap="round" opacity="0.28" fill="none" />
              ))}
              {DUNES.map(([r, d]) => (
                <path key={`d${r}`} d={d} stroke="var(--am-dune)" strokeWidth={(r * 2) / z} strokeLinecap="round" opacity="0.5" fill="none" />
              ))}

              {/* 湖と川 */}
              <path d={MAP.lakes} fill="var(--am-sea-mid)" />
              <path d={MAP.rivers} fill="none" stroke="#60a0d8" strokeWidth={2.6 / z} strokeLinecap="round" opacity="0.85" />

              {/* 経緯線。うっすら出すだけで「地図を見ている」感じが出る */}
              <path d={MAP.grid} fill="none" stroke="#ffffff" strokeWidth={1.4 / k} opacity="0.12" />

              {/* 海の名前 */}
              {(MAP.seas as { name: string; x: number; y: number; size: number; rot: number }[])
                .filter((s) => inBox(s.x, s.y))
                .map((s) => (
                <text
                  key={s.name}
                  className="am-sea"
                  x={s.x}
                  y={s.y}
                  fontSize={s.size / k}
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
            {labels.city.map(({ c, dy, left }) => (
              <span
                key={c.id}
                className={`acity${left ? " is-left" : ""}`}
                style={{ ...pos(c.x, c.y), ["--acity-dy" as string]: `${dy}px` }}
              >
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
                <span
                  className="apin-name"
                  style={{
                    ["--apin-dx" as string]: `${labels.country[slug]?.dx ?? 0}px`,
                    ["--apin-dy" as string]: `${labels.country[slug]?.dy ?? 0}px`,
                  }}
                >
                  {name[slug]}
                </span>
              </Link>
            ))}
          </div>

          {/* 方位。北がどちらかを言わない地図は、地図の顔をしていない */}
          <Compass size={44} className="amap-rose" />

          {/* 縮尺。棒の長さは地図の幅に対する割合なので、札の幅ではなく
              ステージの幅（1cqw = ステージ幅の1%）で測る */}
          <div className="amap-badge">
            <i style={{ width: `calc(${bar.pct} * 1cqw)` }} />
            {bar.km}km
          </div>
        </div>
      </div>

      <div className="amap-foot">
        {LEGEND.filter(([move]) => moved[move]).map(([move, label]) => {
          const st = MOVE[move];
          return (
            <span className="amap-key" data-move={move} key={move}>
              {/* 凡例の線は、地図に引いてある線そのものを写す。
                  太さも点線の刻みも同じにしないと、凡例が別のものを指してしまう */}
              <svg width="30" height="12" viewBox="0 0 30 12" aria-hidden>
                <path
                  d="M1 6h28"
                  stroke={st.c}
                  strokeWidth={Math.min(7, st.w)}
                  strokeLinecap={st.cap ?? "round"}
                  strokeDasharray={st.dash}
                  fill="none"
                />
              </svg>
              {label}
              {/* 距離は街と街の大円距離の足しあげ（build_world_route.py）。
                  凡例が「どの線か」だけでなく「どれだけ動いたか」も言う */}
              {moved[move] ? <em>{moved[move].toLocaleString()}km</em> : null}
            </span>
          );
        })}
      </div>
    </div>
  );
}
