import { blob } from "@/components/island/geometry";
import { Sprite } from "@/components/island/Sprite";
import { ISLAND_ART, islandRadius, plants, type IslandArt } from "./shapes";

/**
 * 連なりの画面に出す、島ひとつの絵。
 *
 * いまの島（`components/island/IslandScene.tsx`）は 1200四方の世界に
 * 300要素を置いた1枚もので、章ごとに輪郭も草木も変える作りになっていない。
 * **使い回したのは輪郭を描く道具（`geometry.ts`）とスプライトの置き方（`Sprite.tsx`）だけ。**
 * 絵そのものは、ここで小さく作り直している。
 *
 * ## 動かさない
 *
 * 連なりには島が5つ出る。1枚ずつ揺らすと、画面ぜんぶを覆う SVG が5枚、
 * 毎フレーム描き直されることになる（`docs/island-atlas.md` の外にある、
 * 島の描画の決まり）。ここは静止画。押したときの反応は板の厚みが持つ。
 */

/** 島の絵の外枠（絵の単位）。列の中で島どうしの比を保つのに使う */
export function islandBox(art: IslandArt, r: number) {
  const maxR = r * Math.max(...art.radii);
  const padX = r * 0.12;
  // 上は、いちばん高い草木のぶんだけ空ける。下は波の輪のぶん
  const top = -(maxR * art.squash + r * 0.52);
  const bottom = maxR * art.squash + r * 0.26;
  return { x: -(maxR + padX), y: top, w: 2 * (maxR + padX), h: bottom - top };
}

/**
 * 次の島の建ちぐあい（`docs/island-atlas.md` 5章）。
 * 0% 更地 → 10% 鉄筋 → 50% 壁と屋根 → 100% 完成。
 */
export type BuildStage = "bare" | "frame" | "walls" | "done";

export function buildStage(pct: number): BuildStage {
  if (pct >= 100) return "done";
  if (pct >= 50) return "walls";
  if (pct >= 10) return "frame";
  return "bare";
}

export default function IslandMark({
  slug,
  days,
  stage,
}: {
  slug: string;
  /** 滞在日数。島の大きさはここだけで決まる */
  days: number;
  /** 次の島だけ。建設のぐあい。渡さなければ、できあがった島として描く */
  stage?: BuildStage;
}) {
  const art = ISLAND_ART[slug];
  if (!art) return null;
  const r = islandRadius(days);
  const box = islandBox(art, r);

  const sand = art.radii.map((v) => v * r);
  // 浜の幅。**小さい島でも浜が見える太さを残す。**
  // 割合だけで決めると、10日の島の浜が 1px を切って「茶色い粒」になる。
  // 絵の単位あたりの px はどの島でも同じ（--ci-px）ので、下限は単位で置ける
  const grass = sand.map((v) => v - Math.max(r * 0.13, 9));
  // 更地は草が生えていない。砂と土だけ
  const bare = stage === "bare" || stage === "frame";
  const green = plants(art, r);

  return (
    <svg
      className="ci"
      viewBox={`${box.x.toFixed(1)} ${box.y.toFixed(1)} ${box.w.toFixed(1)} ${box.h.toFixed(1)}`}
      // 島どうしの比は、この幅がそのまま持つ。1単位あたりの px は CSS が決める
      style={{ width: `calc(var(--ci-px) * ${box.w.toFixed(1)})` }}
      role="img"
      aria-hidden
    >
      {/* 浅瀬。島の下に敷く輪。海の色は連なりの板が持っている */}
      <path d={blob(0, 0, sand.map((v) => v + r * 0.14), art.squash)} className="ci-shelf" />
      <path d={blob(0, 0, sand, art.squash)} className="ci-sand" />
      <path
        d={blob(0, 0, grass, art.squash)}
        className={bare ? "ci-dirt" : "ci-grass"}
      />
      {art.plateau && !stage && (
        // 山のある土地。高台を1段だけ乗せる。崖の落差は島の大きさに比例させる
        <>
          <path
            d={blob(r * 0.1, -r * 0.16 + r * 0.05, grass.map((v) => v * 0.42), art.squash)}
            className="ci-cliff"
          />
          <path
            d={blob(r * 0.1, -r * 0.16, grass.map((v) => v * 0.42), art.squash)}
            className="ci-grass2"
          />
        </>
      )}

      {stage ? <Build r={r} stage={stage} /> : null}

      {/* 草木。できあがった島と、100%まで建った次の島にだけ生える */}
      {(!stage || stage === "done") &&
        green.map((p, i) => (
          <Sprite key={i} name={p.n} x={p.x} y={p.y} size={p.s} flip={p.flip} />
        ))}
    </svg>
  );
}

/**
 * 建設中の絵。
 *
 * **進捗バーではない**（`docs/island-atlas.md` 5章）。棒を伸ばすのではなく、
 * 行った先の景色そのものを育てる。だから杭・鉄筋・壁と屋根・家、と絵を差し替える。
 */
function Build({ r, stage }: { r: number; stage: BuildStage }) {
  const w = r * 0.62;
  const h = r * 0.5;
  const x = -w / 2;
  const y = -h * 0.5;

  if (stage === "done") {
    return <Sprite name="hut-home" x={0} y={r * 0.1} size={r * 0.52} />;
  }

  if (stage === "bare") {
    // 更地。杭を4本打っただけ。ここに何か建つ、ということだけが分かる
    return (
      <g className="ci-build">
        {[
          [x, y],
          [x + w, y],
          [x, y + h],
          [x + w, y + h],
        ].map(([px, py], i) => (
          <line key={i} x1={px} y1={py} x2={px} y2={py - r * 0.14} className="ci-stake" />
        ))}
        <path
          d={`M${x},${y} L${x + w},${y} L${x + w},${y + h} L${x},${y + h} Z`}
          className="ci-plot"
        />
      </g>
    );
  }

  if (stage === "frame") {
    // 鉄筋。柱と梁だけ。まだ屋根も壁も無い
    return (
      <g className="ci-build">
        <path
          d={`M${x},${y + h} L${x + w},${y + h} L${x + w},${y} L${x},${y} Z`}
          className="ci-plot"
        />
        {[x, x + w / 2, x + w].map((px, i) => (
          <line key={i} x1={px} y1={y + h} x2={px} y2={y - r * 0.3} className="ci-rebar" />
        ))}
        <line x1={x} y1={y - r * 0.3} x2={x + w} y2={y - r * 0.3} className="ci-rebar" />
        <line x1={x} y1={y - r * 0.08} x2={x + w} y2={y - r * 0.08} className="ci-rebar" />
      </g>
    );
  }

  // 壁と屋根。まだ塗っていないので、木の色のまま
  const top = y - r * 0.34;
  return (
    <g className="ci-build">
      <path d={`M${x},${y + h} L${x + w},${y + h} L${x + w},${top} L${x},${top} Z`} className="ci-wall" />
      <path
        d={`M${x - r * 0.08},${top} L${0},${top - r * 0.22} L${x + w + r * 0.08},${top} Z`}
        className="ci-roof"
      />
      <line x1={x + w * 0.5} y1={y + h} x2={x + w * 0.5} y2={top} className="ci-rebar" />
    </g>
  );
}
