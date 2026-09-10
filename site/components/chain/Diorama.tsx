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

/**
 * 次の島の建ちぐあい（`docs/island-atlas.md` 5章）。
 * 0% 更地 → 10% 鉄筋 → 50% 壁と屋根 → 100% 完成。
 *
 * **`unknown` は「0%」ではない。** 足代がまだ読めていない（読み込み中・
 * 電波が届かない・API が落ちている）ときの姿。更地と同じ絵にすると、
 * 届かなかっただけの日に「まだ1円も集まっていない島」が出る。
 * 出してくれた人に対して嘘になるので、**見分けのつく別の絵にする。**
 */
export type BuildStage = "unknown" | "bare" | "frame" | "walls" | "done";

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

  if (stage === "unknown") {
    /* **足代がまだ読めていない。** 更地（0%）と同じ絵にすると、電波が届かなかった
       だけの日に「まだ1円も集まっていない島」が出て、出してくれた人に嘘をつく。
       額のほうは「読めなかったら出さない」なので、**絵もそろえる。**

       描くのは、島の決まりどおりの**読み込み中の姿**——
       「場所だけ先に取る。中身の形をした薄い板を置く」（`docs/island-design.md` 4章）。
       区画は取ってあって、そこに建つものが**薄く**見えている。
       更地の縄張りとも、鉄筋の骨組みとも、木の色の箱とも、できあがった家とも
       見分けがつく。 */
    const t = r * 0.055;
    const pins: [number, number][] = [];
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      pins.push([Math.cos(a) * w, y0 + Math.sin(a) * h]);
    }
    return (
      <g className="dio-build">
        {/* 縄張りは更地と同じ。**土を剥がしていない**ぶんだけ違う
            （どこまで進んだか分からないので、地面のことも言い切らない） */}
        <path d={poly(quad, t)} className="dio-rope" />
        {pins.map(([px, py], k) => (
          <line key={k} x1={px} y1={py} x2={px} y2={py - t} className="dio-stake" />
        ))}
        <Sprite name="hut-home" x={0} y={y0 + h * 0.45} size={r * 0.4} opacity={0.34} />
      </g>
    );
  }

  /* --- 建つもの ---
     **100% の家（`hut-home`）を測って、そこから引き算で作る。**
     50% を独立に組んだら完成品より大きい家が建って、「建設中のほうが大きい」
     という絵になった（あやとの指摘 2026-09-10）。寸法は完成品の不透明画素を
     1行ずつ数えて出してある（`hut-home.webp` 物体 258×263px）:

       軒は上から 45.2%、底面の左右の角は 71%、いちばん下（手前の角）が 100%。
       つまり **軒の高さ = 全高の 25.8%、てっぺん = 全高の 71%、
       見かけの半幅 = 全高の 48%、底面の半奥行き = 全高の 29%。**
       全高は 100% に渡している `r * 0.5`。

     **向きも 100% に合わせる。** あの絵は角をこちらに向けた見え方で、
     左右2面の壁と、2枚の屋根が見えている。**別の向きで組むと、
     隣に並べたときに別の建物に見える。**

     前に「頂点を1点に集める」形で外した（開いた段ボール箱に見えた）が、
     原因は寄棟にしたことではなく、**頂点を奥の角の上に置いていた**こと。
     まん中の真上に戻すと、手前の角へ下りる稜線がまっすぐ出て、屋根に見える。 */
  const TH = r * 0.5; // 100% と同じ全高
  /* 100% の絵から出した2本の地面の軸。角をこちらに向けた見え方。
     見かけの半幅 0.481 = 0.60 × (棟方向 + 桁方向)、
     手前の角の落ち 0.29 = 0.362 × (同) になるように取ってある */
  const AX = 0.6;
  const AY = 0.362;
  const SA = 0.5 * TH; // 棟にそった半分の長さ
  const SB = 0.302 * TH; // それと直角の半分の長さ
  const OV = 1.04; // 軒の出
  const WALL = 0.258 * TH; // 軒の高さ。**100% と同じ**
  /* 棟の高さ。**100% の「いちばん高いところ」に合わせる。**
     棟は奥へ上がっていくので、奥の端は棟の高さ＋SA*AY まで上がる。
     0.71 をそのまま棟の高さにすると、そのぶん背が高くなって
     完成品より 19% 大きい家が建つ（測って分かった） */
  const TOP = 0.71 * TH - SA * OV * AY;
  // 手前の角が、100% の家の足元と同じところに来るように置く
  const yb = y0 - r * 0.025;

  type P = [number, number];
  /** 棟方向 u・桁方向 v・高さ z を、画面の点にする */
  const pt = (u: number, v: number, z: number): P => [
    (u + v) * AX,
    yb + (-u + v) * AY - z,
  ];
  const pg = (...pts: P[]) => pts.map((q, k) => `${k ? "L" : "M"}${f(q[0])},${f(q[1])}`).join("") + "Z";

  // 足元と、壁のてっぺん
  const bL = pt(-SA, -SB, 0);
  const bN = pt(-SA, SB, 0);
  const bR = pt(SA, SB, 0);
  const bF = pt(SA, -SB, 0);
  const tL = pt(-SA, -SB, WALL);
  const tN = pt(-SA, SB, WALL);
  const tR = pt(SA, SB, WALL);
  const tF = pt(SA, -SB, WALL);
  // 軒
  const eL = pt(-SA * OV, -SB * OV, WALL);
  const eN = pt(-SA * OV, SB * OV, WALL);
  const eR = pt(SA * OV, SB * OV, WALL);
  const eF = pt(SA * OV, -SB * OV, WALL);
  // 棟。両端は軒まで出す
  const kA = pt(-SA * OV, 0, TOP);
  const kB = pt(SA * OV, 0, TOP);
  // 妻のてっぺん（壁の面の上）
  const gA = pt(-SA, 0, TOP);

  if (stage === "frame") {
    /* 鉄筋。**同じ家の骨組みだけ。** 柱・軒桁・棟木・垂木。
       棟木が1本通っているので、この時点で屋根の向きと形が読める */
    const posts: [P, P][] = [
      [bL, tL],
      [bN, tN],
      [bR, tR],
      [bF, tF],
    ];
    const rafters: [P, P][] = [
      [tL, kA],
      [tN, kA],
      [tR, kB],
      [tF, kB],
    ];
    return (
      <g className="dio-build">
        {plot}
        <g className="dio-house">
        <path d={pg(tL, tN, tR, tF)} className="dio-rebar-line" />
        {[...posts, ...rafters].map(([m, n], k) => (
          <line key={k} x1={m[0]} y1={m[1]} x2={n[0]} y2={n[1]} className="dio-rebar" />
        ))}
        {/* 棟木 */}
        <line x1={kA[0]} y1={kA[1]} x2={kB[0]} y2={kB[1]} className="dio-rebar" />
        </g>
      </g>
    );
  }

  /* 壁と屋根。**まだ塗っていないので木の色のまま。**
     見えているのは、手前の桁面の壁・手前の妻・屋根2枚。
     明るさの差だけで立体を見せる（`docs/island-design.md` 2章「輪郭線を引かない」） */
  return (
    <g className="dio-build">
      {plot}
      <g className="dio-house">
      {/* 奥の流れ。棟の向こう側。上に少しだけ覗く */}
      <path d={pg(eL, eF, kB, kA)} className="dio-roof-far" />
      {/* 手前の妻（三角に立ち上がる壁）と、手前の桁面 */}
      <path d={pg(bL, bN, tN, gA, tL)} className="dio-wall-lo" />
      <path d={pg(bN, bR, tR, tN)} className="dio-wall" />
      {/* 手前の流れ */}
      <path d={pg(eN, eR, kB, kA)} className="dio-roof" />
      </g>
    </g>
  );
}
