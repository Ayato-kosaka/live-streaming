"use client";

import { useState } from "react";
import MAPS from "@/content/nordic/citymaps.json";

/** 見どころの種類。**この4つ以外は来ない**（`nordic/*.json` の `cat`）。 */
const CATS = [
  { k: "see", label: "見たい" },
  { k: "eat", label: "食べたい" },
  { k: "do", label: "やりたい" },
  { k: "buy", label: "買いたい" },
] as const;

type Pin = { id: string; n: number; x: number; y: number; ax: number; ay: number; cat: string; t: string };
type Far = { id: string; cat: string; t: string; km: number; dir: string };
type CityMap = {
  w: number; h: number; km: number;
  layers: Record<string, string[]>;
  pins: Pin[]; far: Far[];
};

/**
 * 街を拡大した地図。**首都の中が分かるもの。**
 *
 * あやとの言葉（2026-09-09）:
 *
 * > もっと首都を拡大した首都の中がわかるような地図を配置してほしい。
 * > その首都の中に例えばワルシャワだったら旧市街とか、なんかこの建物、
 * > この宮殿みたいなのをピンで指して、これが見るべき、これが食べるべき、
 * > これを体験するべきみたいなのを、その都市を拡大した地図で案内してほしい
 *
 * 前は国の地図を切り取った 361km 四方の窓だった。**拡大しても街の中は
 * 何も見えない。** ここは幅 1〜5km で、旧市街や宮殿が別々の点になる。
 *
 * ## 土台は4層だけ
 *
 * 水・緑・旧市街と、点。道路は描かない。この箱から Overpass に届かないので
 * 1本ずつ取れないし、**島の絵は元から線が少ない。** ガイドブックの街地図も、
 * 読ませているのは川と旧市街と点で、道路の名前は読んでいない。
 *
 * ## 番号で結ぶ
 *
 * 地図の点と下の一覧を、同じ番号にする。**押すと相手が光る。** 名前を
 * 地図に書き込むと、点が10個あるところで字が重なって読めなくなる
 * （ガイドブックが番号で逃がしているのと同じ理由）。
 */
export default function CityZoom({ city }: { city: string }) {
  const m = (MAPS as Record<string, CityMap>)[city];
  const [on, setOn] = useState<string | null>(null);
  if (!m || !m.pins.length) return null;

  const byCat = CATS.map((c) => ({
    ...c,
    rows: m.pins.filter((p) => p.cat === c.k),
    far: m.far.filter((f) => f.cat === c.k),
  })).filter((g) => g.rows.length || g.far.length);

  /* 縮尺の棒。**窓の実寸から出す。** 街ごとに窓の広さが違う（1km〜5km）ので、
     棒が無いと「旧市街が広い街」と「点が散っている街」を読み違える。 */
  const barKm = m.km > 4 ? 1 : m.km > 2 ? 0.5 : 0.2;
  const barW = (barKm / m.km) * m.w;

  return (
    <div className="czoom">
      <svg
        className="czoom-map"
        viewBox={`0 0 ${m.w} ${m.h}`}
        role="img"
        aria-label={`${city}の地図。見どころ${m.pins.length}か所`}
      >
        <rect className="cz-bg" x="0" y="0" width={m.w} height={m.h} />
        {m.layers.green?.map((d, i) => <path key={`g${i}`} className="cz-green" d={d} />)}
        {m.layers.water?.map((d, i) => <path key={`w${i}`} className="cz-water" d={d} />)}
        {m.layers.old?.map((d, i) => <path key={`o${i}`} className="cz-old" d={d} />)}

        {/* 縮尺 */}
        <g className="cz-scale" transform={`translate(24 ${m.h - 26})`}>
          <line x1="0" y1="0" x2={barW} y2="0" />
          <line x1="0" y1="-6" x2="0" y2="6" />
          <line x1={barW} y1="-6" x2={barW} y2="6" />
          <text x={barW / 2} y="-12">{barKm < 1 ? `${barKm * 1000}m` : `${barKm}km`}</text>
        </g>

        {/* 丸をどけたぶんの引き出し線。**本当の場所を先に、全部引く。**
            丸より下に敷かないと、線が丸の上を横切って読みにくい。 */}
        {m.pins.map((p) =>
          Math.hypot(p.x - p.ax, p.y - p.ay) > 3 ? (
            <g key={`l${p.id}`} className={`cz-lead${on === p.id ? " is-on" : ""}`}>
              <line x1={p.ax} y1={p.ay} x2={p.x} y2={p.y} />
              <circle cx={p.ax} cy={p.ay} r="5" />
            </g>
          ) : null,
        )}
        {m.pins.map((p) => (
          <g
            key={p.id}
            className={`cz-pin cz-${p.cat}${on === p.id ? " is-on" : ""}`}
            transform={`translate(${p.x} ${p.y})`}
          >
            <circle className="cz-dot" r="32" />
            <text className="cz-n" y="12">{p.n}</text>
          </g>
        ))}
      </svg>

      <ul className="czoom-key">
        {byCat.map((g) => (
          <li key={g.k}>
            <b className={`cz-key-b cz-${g.k}`}>{g.label}</b>
            <span>
              {g.rows.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className={`cz-row${on === p.id ? " is-on" : ""}`}
                  onClick={() => setOn(on === p.id ? null : p.id)}
                >
                  <i className={`cz-${p.cat}`}>{p.n}</i>
                  {p.t}
                </button>
              ))}
              {/* 窓に入らなかったもの。**消さずに、どっちへ何km かを言う。** */}
              {g.far.map((f) => (
                <span key={f.id} className="cz-far">
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
