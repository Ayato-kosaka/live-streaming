import { memo } from "react";

import { blob, ring, rng, wobble } from "@/components/island/geometry";
import type { IsleWorld } from "./world";

/**
 * 島の地面。**動かない。**
 *
 * 色は `app/css/tokens.css` の変数から取る（`app/css/chain.css` の `.ig-*`）。
 * だから北欧の島は寒い色に、中東の島は乾いた色になる。
 * **島ごとに色を書かない**（`docs/island-world.md` 3.1「色で分けていいのは
 * 配信の型だけ。章に色を割りあてない」）。ここで変わるのは章の色ではなく、
 * その土地の色。
 *
 * ## 何枚描くか
 *
 * 島の地面は「島ぜんぶに広がるパス」なので、1枚足すたびに、**画面に映って
 * いない部分まで含めて**毎フレーム塗り直される可能性がある（いまの島は
 * 地面26層で1フレーム 20ms 払っていた。`app/css/island.css` の実測）。
 * なので枚数を絞ってある。浅瀬2・波1・浜1・濡れた砂1・草2・道1の8枚。
 *
 * カメラは `viewBox` を書き換えずに `transform` で動かすので、
 * ここが塗り直されるのは**焼き直すときだけ**になっている（`IsleStage`）。
 */
function IsleGroundRaw({ w }: { w: IsleWorld }) {
  const g = { cx: w.cx, cy: w.cy };
  const s = (v: number[]) => blob(g.cx, g.cy, v, w.squash);
  const out = (d: number) => w.sand.map((v) => v + d);
  const inn = (d: number) => w.sand.map((v) => Math.max(6, v - d));
  const r = w.r;
  const pat = `ig-grass-${w.slug}`;

  return (
    <g>
      <defs>
        <GrassTile id={pat} seed={w.art.seed} />
      </defs>
      {/* 海の模様。**動かさない**（島を囲む形を動かすと、画面ぜんぶを塗り直す） */}
      {w.sea.map((d, i) => (
        <path key={i} className="ig-sea" d={d} opacity={[0.34, 0.22, 0.13][i]} />
      ))}
      {/* 浅瀬。輪郭をそのまま外へ出すと機械的に見えるので、帯ごとに違う起伏を足す */}
      <path className="ig-shelf" d={s(wobble(out(r * 0.2), 71, r * 0.02))} />
      <path className="ig-shallow" d={s(wobble(out(r * 0.08), 72, r * 0.016))} />
      {/* 波打ち際。浜のふちの外に、白い輪を1本 */}
      <path
        className="ig-foam"
        d={ring(g.cx, g.cy, wobble(out(r * 0.012), 73, r * 0.008), inn(r * 0.006), w.squash)}
        fillRule="evenodd"
      />
      <path className="ig-sand" d={s(w.sand)} />
      {/* 濡れた砂。乾いた砂より「暗い」のではなく「濃い黄色」（灰色を混ぜない） */}
      <path
        className="ig-wet"
        d={ring(g.cx, g.cy, w.sand, wobble(inn(r * 0.045), 75, r * 0.01), w.squash)}
        fillRule="evenodd"
      />
      <path className="ig-grass" d={s(w.grass)} />
      {/* 草地の内側。同じ緑の1枚板にすると、島のまん中が広いだけの面になる */}
      <path className="ig-grass2" d={s(wobble(w.grass.map((v) => v * 0.72), 77, r * 0.05))} />
      <path className="ig-grass-tex" d={s(w.grass)} fill={`url(#${pat})`} />
      {/* 道。建物どうしをつながず、まん中の広場から放射に引いてある */}
      <path className="ig-trail" d={w.trail} />
    </g>
  );
}

/**
 * 草の手ざわり。
 *
 * 1本ずつ置くと、大きい島で数千本になる。**タイル1枚を作って敷く。**
 * タイルは大きいほど繰り返しが目につきにくいが、その中の線の数だけ
 * 焼き直しが重くなる。200四方に48株で、いまの島（208四方に268株）の
 * 5分の1にしてある——歩ける島は5つあるので、1枚ずつは軽くしておく。
 */
function GrassTile({ id, seed }: { id: string; seed: number }) {
  const r = rng(seed + 7);
  const d: string[] = [];
  for (let i = 0; i < 48; i++) {
    const x = r() * 200;
    const y = r() * 200;
    const h = 5 + r() * 6;
    const lean = (r() - 0.5) * 4;
    d.push(`M${x.toFixed(1)},${y.toFixed(1)}q${lean.toFixed(1)},${(-h / 2).toFixed(1)} ${(lean * 1.6).toFixed(1)},${(-h).toFixed(1)}`);
  }
  return (
    <pattern id={id} width={200} height={200} patternUnits="userSpaceOnUse">
      <path className="ig-blade" d={d.join("")} />
    </pattern>
  );
}

/**
 * 建設中の島（`docs/island-atlas.md` 5章）。
 *
 * **進捗バーではない。** 棒を伸ばすのではなく、行った先の景色そのものが育つ。
 * 0% 更地（杭だけ）→ 10% 鉄筋 → 50% 壁と屋根 → 100% 家。
 * 出発したらこの絵は消えて、ふつうの島になる（もう「これから建つ島」ではない）。
 */
export function Building({ x, y, r, stage }: { x: number; y: number; r: number; stage: string }) {
  const w = r * 0.34;
  const h = r * 0.2;
  const x0 = x - w / 2;
  const y0 = y - h;

  if (stage === "bare")
    return (
      <g className="ig-build">
        <path className="ig-plot" d={`M${x0},${y0} L${x0 + w},${y0} L${x0 + w},${y0 + h} L${x0},${y0 + h} Z`} />
        {[
          [x0, y0],
          [x0 + w, y0],
          [x0, y0 + h],
          [x0 + w, y0 + h],
        ].map(([px, py], i) => (
          <line key={i} className="ig-stake" x1={px} y1={py} x2={px} y2={py - r * 0.07} />
        ))}
      </g>
    );
  if (stage === "frame")
    return (
      <g className="ig-build">
        <path className="ig-plot" d={`M${x0},${y0} L${x0 + w},${y0} L${x0 + w},${y0 + h} L${x0},${y0 + h} Z`} />
        {[x0, x0 + w / 2, x0 + w].map((px, i) => (
          <line key={i} className="ig-rebar" x1={px} y1={y0 + h} x2={px} y2={y0 - r * 0.16} />
        ))}
        <line className="ig-rebar" x1={x0} y1={y0 - r * 0.16} x2={x0 + w} y2={y0 - r * 0.16} />
        <line className="ig-rebar" x1={x0} y1={y0 - r * 0.04} x2={x0 + w} y2={y0 - r * 0.04} />
      </g>
    );
  const top = y0 - r * 0.18;
  return (
    <g className="ig-build">
      <path className="ig-wall" d={`M${x0},${y0 + h} L${x0 + w},${y0 + h} L${x0 + w},${top} L${x0},${top} Z`} />
      <path className="ig-roof" d={`M${x0 - r * 0.04},${top} L${x},${top - r * 0.12} L${x0 + w + r * 0.04},${top} Z`} />
      <line className="ig-rebar" x1={x} y1={y0 + h} x2={x} y2={top} />
    </g>
  );
}

/** 地面は島に置いたら二度と動かない。同じ島なら作り直さない */
export default memo(IsleGroundRaw);
