import { Fragment } from "react";

import { blob } from "@/components/island/geometry";
import { Sprite } from "@/components/island/Sprite";
import { plants, type IslandArt } from "./shapes";
import { CAM, dio, fit, side, type AtlasBuilding } from "./diorama";

/**
 * 島ひとつの模型。
 *
 * 海ごと丸く切り取った円盤に、島が乗っている。寸法の考えかたは
 * `./diorama.ts` の頭に書いた。
 *
 * ## 動かさない（SVG の中では）
 *
 * 島は水面の円盤ぶんの大きさがあるので、**SVG の中で何かを動かすと
 * その外接矩形ぶんが毎フレーム塗り直される**（`CLAUDE.md`）。
 * ぷかぷか浮かせているのは**この SVG を包んだ div の CSS transform** で、
 * あれは合成だけで済む。中は1枚の静止画のまま。
 *
 * ## 塗りは全部 CSS 変数
 *
 * 章ごとの土地の色は `[data-ch]`（`app/css/chain.css`）が持っている。
 * ここに色を書かない。
 */

/** 次の島の建ちぐあい（`docs/island-atlas.md` 5章）。0% 更地 → 10% 鉄筋 → 50% 壁と屋根 → 100% 完成 */
export type BuildStage = "bare" | "frame" | "walls" | "done";

export function buildStage(pct: number): BuildStage {
  if (pct >= 100) return "done";
  if (pct >= 50) return "walls";
  if (pct >= 10) return "frame";
  return "bare";
}

export default function Diorama({
  slug,
  days,
  art,
  buildings = [],
  stage,
  detail = true,
}: {
  slug: string;
  /** 滞在日数。**島の大きさはここだけで決まる**（`docs/island-atlas.md` 3章） */
  days: number;
  art: IslandArt;
  /** その島に建っているもの。歩ける島と同じ並びで置く */
  buildings?: AtlasBuilding[];
  /** 次の島だけ。建設のぐあい */
  stage?: BuildStage;
  /** 草木と建物まで描くか。**選ばれていない島は地形だけ**にして枚数を抑える */
  detail?: boolean;
}) {
  const d = dio(art, days);
  const { r, D, Dh, y1, y2, D2, yB, yG, sand, grass, box } = d;

  /* 草木。**模型は島が1つだけ大きく出る**ので、連なりの絵より濃く撒く。
     選ばれていない島は 0 にする（小さく写っていて、1本ずつは見えない） */
  /* 草木。**建設中でも生やす。**
     `docs/island-atlas.md` 5章は「歩ける島では草木まで消さない。育つのは建物の
     ほうで、島そのものは最初からそこにある。0% は『まだ杭しか打っていない区画』が
     島のまん中にある姿」と決めている。土だけで描くのは**連なりの小さな絵**の
     決まりで、あれはもう無い。ここは主役の1枚なので、歩ける島のほうに合わせる
     （土だけの島を大きく出すと、島ではなく茶色い塊に見える。あやとの指摘）。 */
  const green = detail
    ? plants({ ...art, squash: CAM }, r, { density: 1.9, cap: 26, gap: 0.15 }).map((p) => ({
        /* **草木は連なりの絵より小さく描く。** `props` の大きさは島を数cmで
           描く連なり用に決めてあって、そのまま模型に持ってくると木が建物より
           高くなる（撮って分かった）。島に対する背の比は、歩ける島に寄せる */
        ...p,
        s: p.s * 0.7,
      }))
    : [];

  /* 建物。歩ける島（`components/isle/world.ts`）で決めた並びをそのまま縮めて置く。
     **押した先に建っているものが、押す前に見えている。**
     小さい島は建物どうしが重なるので、大きいものから3つだけにする */
  /* 建設中の島でも、**船着き場だけは建てる。**
     どの島の浜にも船着き場があって舟がつないである（`docs/island-atlas.md` 6章）。
     あれは足代で建てるものではなく、そこへ着くための場所なので、
     0% の島から消すと「行けない島」になる */
  const bs = !detail
    ? []
    : stage
      ? buildings.filter((x) => x.icon === "pier")
      : r < 52
        ? [...buildings].sort((a, b) => b.size - a.size).slice(0, 3)
        : buildings;
  const built = bs.map((b) => ({
    n: b.icon,
    x: b.nx * r,
    y: yG + b.ny * r * CAM,
    // 島に対する背の比は歩ける島のまま。ただし小さい島で島を覆わないように頭を押さえる
    s: Math.min(b.size * r * 1.15, r * 0.4),
    flip: false,
  }));
  const things = [...green.map((p) => ({ ...p, y: yG + p.y })), ...built].sort((a, b) => a.y - b.y);
  /* 建設中のものは、区画の**いちばん手前の角**の奥行きで列に入る */
  const buildY = stage && detail ? yG + r * 0.42 * CAM : null;

  return (
    <svg
      className="dio"
      viewBox={`${box.x.toFixed(1)} ${box.y.toFixed(1)} ${box.w.toFixed(1)} ${box.h.toFixed(1)}`}
      /* **枠いっぱいまで寄る。** どの島も同じくらい枠を埋める。
         島どうしの大きさの比は、下の航路の丸が持っている（`./diorama.ts` の fit） */
      style={{ width: `calc(var(--dio-u) * ${(box.w * fit(box)).toFixed(2)})` }}
      role="img"
      aria-hidden
    >
      <defs>
        <radialGradient id={`dio-sea-${slug}`} cx="50%" cy="46%" r="58%">
          <stop offset="46%" style={{ stopColor: "var(--ci-shelf)" }} />
          <stop offset="78%" style={{ stopColor: "var(--dio-sea)" }} />
          <stop offset="100%" style={{ stopColor: "var(--dio-sea-deep)" }} />
        </radialGradient>
        <linearGradient id={`dio-soil-${slug}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" style={{ stopColor: "var(--dio-soil-hi)" }} />
          <stop offset="100%" style={{ stopColor: "var(--dio-soil)" }} />
        </linearGradient>
        <linearGradient id={`dio-rock-${slug}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" style={{ stopColor: "var(--dio-rock)" }} />
          <stop offset="100%" style={{ stopColor: "var(--dio-rock-lo)" }} />
        </linearGradient>
        {/* 模型の下に落ちる影。**filter を使わない。**
            ぼかしフィルタは島ぜんぶの大きさで走るので、静止画でも高くつく */}
        <radialGradient id={`dio-sh-${slug}`} cx="50%" cy="50%" r="50%">
          {/* **rgba() を stop-color に書かない。** SVG は読まないので真っ黒になる */}
          <stop offset="34%" stopColor="#16324a" stopOpacity="0.26" />
          <stop offset="70%" stopColor="#16324a" stopOpacity="0.1" />
          <stop offset="100%" stopColor="#16324a" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* 落ち影。円盤の底より下、地面に落ちているように置く */}
      <ellipse
        cx={0}
        cy={y2 + D2 * CAM + D * 0.045}
        rx={D * 0.86}
        ry={D * 0.86 * CAM * 0.4}
        fill={`url(#dio-sh-${slug})`}
      />

      {/* 円盤の側面。上が土、下が岩。底は丸くすぼめる */}
      <path d={side(D, 0, D * 0.9, y1)} fill={`url(#dio-soil-${slug})`} />
      <path d={side(D * 0.9, y1, D2, y2)} fill={`url(#dio-rock-${slug})`} />
      <ellipse cx={0} cy={y2} rx={D2} ry={D2 * CAM} className="dio-keel" />
      {/* 岩の層に、地層の線を1本だけ。多く引くと縞模様になって石に見えなくなる */}
      <path d={side(D * 0.9, y1, D * 0.78, y1 + D * 0.055)} className="dio-strata" />

      {/* 水面 */}
      <ellipse cx={0} cy={0} rx={D} ry={Dh} fill={`url(#dio-sea-${slug})`} />
      {/* 水面のふち。上を明るくする（`docs/island-design.md` 2章の「上からの光」） */}
      <ellipse cx={0} cy={0} rx={D - 1.5} ry={Dh - 1.5} className="dio-rim" />

      {/* 浅瀬と波打ち際。**動かさない**（島を囲む大きさの形なので、動かすと高い） */}
      <path d={blob(0, 0, sand.map((v) => v + r * 0.26), CAM)} className="dio-shelf" />
      <path d={blob(0, 0, sand.map((v) => v + r * 0.04), CAM)} className="dio-foam" />

      {/* 島。**同じ輪郭を下にずらして2枚描く**と、はみ出した三日月が側面になる */}
      <path d={blob(0, 0, sand, CAM)} className="dio-wet" />
      <path d={blob(0, yB, sand, CAM)} className="dio-sand" />
      <path d={blob(0, yB, grass, CAM)} className="dio-cliff" />
      <path d={blob(0, yG, grass, CAM)} className="dio-grass" />
      {/* てっぺんだけ明るく。輪郭線を引かずに面の向きを見せる。
          **更地にも入れる。** 入れないと、土の島が1色の板になって平らに見える */}
      <path d={blob(0, yG - r * 0.02, grass.map((v) => v * 0.86), CAM)} className="dio-grass-hi" />

      {art.plateau && !stage && (
        // 山のある土地。高台を1段だけ乗せる
        <>
          <path
            d={blob(r * 0.08, yG, grass.map((v) => v * 0.44), CAM)}
            className="dio-cliff"
          />
          <path
            d={blob(r * 0.08, yG - r * 0.15, grass.map((v) => v * 0.44), CAM)}
            className="dio-grass"
          />
        </>
      )}

      {/* 建設中のものも、**草木と同じ列に並べて奥から手前へ描く。**
          先にまとめて描くと、奥にある木が家の手前に出て、家が地面に埋まって見える */}
      {things.map((p, i) => (
        <Fragment key={i}>
          {buildY !== null && (i === 0 || things[i - 1].y < buildY) && p.y >= buildY && (
            <Build r={r} y={yG} stage={stage!} />
          )}
          <Sprite name={p.n} x={p.x} y={p.y} size={p.s} flip={p.flip} />
        </Fragment>
      ))}
      {/* いちばん手前まで来ても出番が無ければ、最後に置く（全部が区画より奥） */}
      {buildY !== null && (things.length === 0 || things[things.length - 1].y < buildY) && (
        <Build r={r} y={yG} stage={stage!} />
      )}
    </svg>
  );
}

/**
 * 建設中の絵（`docs/island-atlas.md` 5章）。
 *
 * **進捗バーではない。** 棒を伸ばすのではなく、行った先の景色そのものを育てる。
 * 杭 → 鉄筋 → 壁と屋根 → 家、と絵が差し替わる。
 */
function Build({ r, y, stage }: { r: number; y: number; stage: BuildStage }) {
  if (stage === "done") return <Sprite name="hut-home" x={0} y={y + r * 0.1} size={r * 0.5} />;

  /* 区画は**ひし形**に置く。真四角に描くと、地面ではなく「立っている枠」に見える
     （斜め見下ろしの絵で、地面の四角がひし形になるのはそういうもの）。
     建つものも同じひし形の上に、**面を2つ見せる立体**として組む。
     カメラに正対した板を1枚置くと、窓か扉に見える（撮って分かった）。 */
  const w = r * 0.42;
  const h = w * CAM;
  const y0 = y - r * 0.02;
  const f = (v: number) => v.toFixed(1);
  // ひし形の角。北・東・南・西
  const N: [number, number] = [0, y0 - h];
  const E: [number, number] = [w, y0];
  const S: [number, number] = [0, y0 + h];
  const W: [number, number] = [-w, y0];
  const quad = [N, E, S, W];
  const poly = (pts: [number, number][], dy = 0) =>
    pts.map(([px, py], k) => `${k ? "L" : "M"}${f(px)},${f(py - dy)}`).join("") + "Z";
  // 草を剥がして均した土。**ここだけが更地**
  const plot = <path d={poly(quad)} className="dio-plot" />;

  if (stage === "bare") {
    // 更地。**均した地面と、低い杭と縄だけ。** 背の高いものを立てない
    const t = r * 0.055;
    const pins: [number, number][] = [];
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      pins.push([Math.cos(a) * w, y0 + Math.sin(a) * h]);
    }
    return (
      <g className="dio-build">
        {plot}
        {/* 掘り返した土の山。**これから工事をするところ**、と言う */}
        <ellipse cx={w * 1.5} cy={y0 + h * 1.5} rx={r * 0.1} ry={r * 0.1 * CAM} className="dio-mound" />
        <ellipse cx={-w * 1.6} cy={y0 - h * 0.9} rx={r * 0.075} ry={r * 0.075 * CAM} className="dio-mound" />
        <path d={poly(quad, t)} className="dio-rope" />
        {pins.map(([px, py], k) => (
          <line key={k} x1={px} y1={py} x2={px} y2={py - t} className="dio-stake" />
        ))}
      </g>
    );
  }

  const H = r * 0.36; // 立ち上がりの高さ

  if (stage === "frame") {
    // 鉄筋。**四隅の柱と、上の梁だけ。** 壁も屋根もまだ無い
    return (
      <g className="dio-build">
        {plot}
        <path d={poly(quad, H)} className="dio-rebar-line" />
        <path d={poly(quad, H * 0.52)} className="dio-rebar-line" />
        {quad.map(([px, py], k) => (
          <line key={k} x1={px} y1={py} x2={px} y2={py - H} className="dio-rebar" />
        ))}
      </g>
    );
  }

  /* 壁と屋根。**まだ塗っていないので木の色のまま。**
     手前の2面だけを見せて、奥の2面は描かない（隠れているので） */
  const R = r * 0.13; // 屋根の高さ。とがらせすぎると家ではなくテントに見える
  const A: [number, number] = [0, y0 - h - H - R];
  return (
    <g className="dio-build">
      {plot}
      {/* 左の面（暗いほう）と右の面。**明るさの差だけで立体を見せる**
          （`docs/island-design.md` 2章「輪郭線を引かない」） */}
      <path
        d={`M${f(W[0])},${f(W[1])}L${f(S[0])},${f(S[1])}L${f(S[0])},${f(S[1] - H)}L${f(W[0])},${f(W[1] - H)}Z`}
        className="dio-wall-lo"
      />
      <path
        d={`M${f(S[0])},${f(S[1])}L${f(E[0])},${f(E[1])}L${f(E[0])},${f(E[1] - H)}L${f(S[0])},${f(S[1] - H)}Z`}
        className="dio-wall"
      />
      {/* 屋根。てっぺんの1点へ寄せる。手前の2枚だけ */}
      <path
        d={`M${f(W[0])},${f(W[1] - H)}L${f(S[0])},${f(S[1] - H)}L${f(A[0])},${f(A[1])}Z`}
        className="dio-roof-lo"
      />
      <path
        d={`M${f(S[0])},${f(S[1] - H)}L${f(E[0])},${f(E[1] - H)}L${f(A[0])},${f(A[1])}Z`}
        className="dio-roof"
      />
    </g>
  );
}
