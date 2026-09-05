import { memo } from "react";

import { blob, ring, rng, wobble } from "@/components/island/geometry";
import type { DecoPaths } from "./deco";
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
      {/* 波打ち際。**輪1本だと定規で引いた岸になる。**
          太さと濃さの違う輪を3本かさねて、レースに見せる（いまの島と同じ考え）。
          動かさない——島をぐるりと囲む形なので、動かすと画面ぜんぶを塗り直す */}
      <path
        className="ig-foam"
        d={ring(g.cx, g.cy, wobble(out(r * 0.02), 73, r * 0.014), wobble(out(r * 0.004), 78, r * 0.01), w.squash)}
        fillRule="evenodd"
        opacity={0.34}
      />
      <path
        className="ig-foam"
        d={ring(g.cx, g.cy, wobble(out(r * 0.012), 79, r * 0.009), inn(r * 0.004), w.squash)}
        fillRule="evenodd"
      />
      <path
        className="ig-foam"
        d={ring(g.cx, g.cy, wobble(inn(r * 0.01), 81, r * 0.007), inn(r * 0.028), w.squash)}
        fillRule="evenodd"
        opacity={0.42}
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
      {/* 木の根元と道ぎわの土。一面の緑にわずかな土色が混じるだけで、
          地面が「ただの塗り」でなくなる */}
      <path className="ig-soil" d={w.soil} />
      {/* 道。**建物と建物をつなぐ**（まん中の何も無いところに集めない） */}
      <path className="ig-trail" d={w.trail} />
      <path className="ig-trail-in" d={w.trail} />
      {/* 浜と草地の細かい飾り。**色ごとに1本のパスにまとまっている。**
          1つずつスプライトで置くと、密度を上げたぶんだけ画像が増える */}
      <DecoLayer p={w.sandDeco} shade={0.26} />
      <DecoLayer p={w.deco} shade={0.4} />
      {/* 花。色ごとに1本ずつ */}
      <path className="ig-fl-shade" d={w.flowers.shade} />
      {w.flowers.petals.map((d, i) => (
        <path key={i} d={d} fill={FLOWER[i]} />
      ))}
      <path className="ig-fl-core" d={w.flowers.cores} />
    </g>
  );
}

/** 花の色。本物の花壇に合わせて、白・黄・赤・紫の4色 */
const FLOWER = ["#ffffff", "#ffd93f", "#f4595f", "#b47bea"];

/**
 * 焼いた飾りを描く。**順番が大事。**
 * 影 → 本体 → 明るい面、の順でないと、影が本体の上に乗る。
 */
function DecoLayer({ p, shade }: { p: DecoPaths; shade: number }) {
  return (
    <g>
      <path className="id-shade" d={p.shade} opacity={shade} />
      <path className="id-stump" d={p.stump} />
      <path className="id-stump-top" d={p.stumpTop} />
      <path className="id-rock" d={p.rock} />
      <path className="id-rock-lit" d={p.rockLit} />
      <path className="id-bush" d={p.bush} />
      <path className="id-bush-hi" d={p.bushHi} />
      <path className="id-cap" d={p.cap} />
      <path className="id-tuft" d={p.tuft} />
    </g>
  );
}

/**
 * 草の手ざわり。
 *
 * 1本ずつ置くと、大きい島で数千本になる。**タイル1枚を作って敷く。**
 * パターンはブラウザが1回だけ焼いて敷き詰めるので、中の線を増やしても
 * 敷く面積ぶんの値段は増えない。
 *
 * **本数はいまの島に合わせた。** 208四方に268株のところ、はじめ 200四方に48株
 * （5分の1）にしていたら、並べて撮ったときに**こちらだけ地面が素の芝**に見えた。
 * 「歩ける島は5つあるので軽くしておく」と書いていたが、
 * **見えている島はいつも1つ**なので、そこを削る理由が無かった。
 */
function GrassTile({ id, seed }: { id: string; seed: number }) {
  const r = rng(seed + 7);
  const d: string[] = [];
  for (let i = 0; i < 250; i++) {
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
