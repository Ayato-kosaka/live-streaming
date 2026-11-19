import { COUNTRY_MAPS } from "./countryMaps";
import { chrome, NOMINAL_W, placeCities, type Rect } from "./labels";
import { Compass } from "./art";
import { MOVE, countryArtInner } from "./countryArt";
import { countryMapArt, mapAlt } from "./mapArt";

/**
 * 国ひとつの寄り地図。国のページの頭に敷く。
 *
 * 世界地図を拡大したものではなく、その国の範囲で投影し直して間引きも
 * やり直したもの（`python/build_world_route.py`）。世界の粗さのまま寄ると、
 * キプロスやオランダがただの多角形になる。
 *
 * 動くところが無いので、サーバ側で HTML にしてしまう。
 * この地図のために JavaScript を1バイトも配らない。
 *
 * 絵の部分は `./countryArt.ts`（焼く道具と同じ1本）、焼いた絵は `./mapArt.ts`。
 * 街の名札・方位・縮尺はここで HTML のまま重ねる。
 */

/** 凡例に出す言葉。世界地図と同じ言い方にそろえる。 */
const MOVE_LABEL: Record<string, string> = {
  land: "電車・バス",
  air: "飛行機",
  sea: "船",
  walk: "歩いた",
  hitch: "ヒッチハイク",
  side: "近くまで往復",
};
const LEGEND_ORDER = ["land", "air", "sea", "walk", "hitch", "side"];

export default function CountryMap({ slug, name }: { slug: string; name: string }) {
  const m = COUNTRY_MAPS[slug];
  if (!m) return null;
  const { w, h } = m.view;
  const art = countryMapArt(slug, name);

  // 街の名札の置き場所。近い街どうしでぶつからないよう、上下にずらして逃がす。
  // 当たり判定は px。地図の幅の見当を NOMINAL_W にして測る。
  const sc = NOMINAL_W / w;
  const fr = { w: NOMINAL_W, h: (NOMINAL_W * h) / w };
  const taken: Rect[] = chrome(fr.w, fr.h).concat(m.cities.map((c) => ({
    x0: c.x * sc - 9,
    y0: c.y * sc - 9,
    x1: c.x * sc + 9,
    y1: c.y * sc + 9,
  })));
  // この国の地図に実際に引いてある線だけを凡例に出す。
  // 距離は出さない。ここの座標はメルカトルなので、緯度で伸び縮みする。
  // 正しい距離は世界地図（大円距離で足しあげたもの）が持っている。
  const used = LEGEND_ORDER.filter((k) => m.legs.some((l) => (MOVE[l.move] ? l.move : "land") === k));
  const labels = placeCities(
    m.cities.filter((c) => c.country === slug),
    (x, y) => [x * sc, y * sc],
    taken,
    (c) => c.x > w * 0.68,
    fr,
  );

  return (
    <>
      <div className="amap" style={{ ["--am-ratio" as string]: `${w} / ${h}` }}>
        <div className="amap-stage">
          {/* 絵（海・陸・山・線・街の点）は、焼いた1枚の絵（`./mapArt.ts`）。画像検索に出せて、alt とファイル名に
              「〈国〉の地図」を持てる（面に直に描いた SVG は、検索の機械から見ると絵ではない。#1262・#332）。
              焼いた絵が無い・古い国は、前のとおり同じ絵を SVG で直に描く（見た目は同じ。`./countryArt.ts`） */}
          {art ? (
            <img
              className="amap-svg"
              src={art.src}
              srcSet={art.srcSet}
              sizes="(min-width: 720px) 640px, 100vw"
              width={art.w}
              height={art.h}
              alt={art.alt}
              decoding="async"
            />
          ) : (
            <svg
              className="amap-svg"
              viewBox={`0 0 ${w} ${h}`}
              role="img"
              aria-label={mapAlt(slug, name)}
              dangerouslySetInnerHTML={{ __html: countryArtInner(m, slug) }}
            />
          )}

          {/* 街の名前は HTML。SVG の文字だと、スマホ幅で 8px になって読めない */}
          <div className="amap-pins">
              {labels.filter((v) => !v.hide).map(({ c, dy, left }) => (
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

      {/* どの線が何なのか。線の太さも刻みも、地図に引いてあるものを写す。
          **線の無い地図（いま歩いている旅の国）には置かない**——空の帯が地図の下に隙間として残る */}
      {used.length > 0 && <div className="amap-foot">
        {used.map((k) => {
          const st = MOVE[k];
          return (
            <span className="amap-key" data-move={k} key={k}>
              <svg width="30" height="12" viewBox="0 0 30 12" aria-hidden>
                <path
                  d="M1 6h28"
                  stroke={st.c}
                  strokeWidth={Math.min(7, st.w)}
                  strokeLinecap="round"
                  strokeDasharray={st.dash}
                  fill="none"
                />
              </svg>
              {MOVE_LABEL[k]}
            </span>
          );
        })}
      </div>}
    </>
  );
}
