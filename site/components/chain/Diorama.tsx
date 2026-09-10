import { blob } from "@/components/island/geometry";
import { Sprite } from "@/components/island/Sprite";
import { plants, type IslandArt } from "./shapes";
import { CAM, dio, side, type AtlasBuilding } from "./diorama";

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
  // 更地と鉄筋のあいだは、まだ草が生えていない
  const bare = stage === "bare" || stage === "frame";

  /* 草木。**模型は島が1つだけ大きく出る**ので、連なりの絵より濃く撒く。
     選ばれていない島は 0 にする（小さく写っていて、1本ずつは見えない） */
  const green = detail && (!stage || stage === "done")
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
  const bs = !detail || stage ? [] : r < 52 ? [...buildings].sort((a, b) => b.size - a.size).slice(0, 3) : buildings;
  const built = bs.map((b) => ({
    n: b.icon,
    x: b.nx * r,
    y: yG + b.ny * r * CAM,
    // 島に対する背の比は歩ける島のまま。ただし小さい島で島を覆わないように頭を押さえる
    s: Math.min(b.size * r * 1.15, r * 0.4),
    flip: false,
  }));
  const things = [...green.map((p) => ({ ...p, y: yG + p.y })), ...built].sort((a, b) => a.y - b.y);

  return (
    <svg
      className="dio"
      viewBox={`${box.x.toFixed(1)} ${box.y.toFixed(1)} ${box.w.toFixed(1)} ${box.h.toFixed(1)}`}
      /* 島どうしの比は、この幅がそのまま持つ。**1単位あたりの px はどの島でも同じ**
         なので、434日の島は17日の島より本当に大きく出る */
      style={{ width: `calc(var(--dio-px) * ${box.w.toFixed(1)})` }}
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
      <path d={blob(0, yB, grass, CAM)} className={bare ? "dio-dirt-side" : "dio-cliff"} />
      <path d={blob(0, yG, grass, CAM)} className={bare ? "dio-dirt" : "dio-grass"} />
      {!bare && (
        // 草地のてっぺんだけ明るく。輪郭線を引かずに面の向きを見せる
        <path d={blob(0, yG - r * 0.02, grass.map((v) => v * 0.86), CAM)} className="dio-grass-hi" />
      )}

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

      {stage && detail ? <Build r={r} y={yG} stage={stage} /> : null}

      {things.map((p, i) => (
        <Sprite key={i} name={p.n} x={p.x} y={p.y} size={p.s} flip={p.flip} />
      ))}
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

  const w = r * 0.6;
  const h = r * 0.5 * CAM;
  const x = -w / 2;
  const y0 = y - h * 0.4;

  if (stage === "bare") {
    // 更地。杭を4本打っただけ。ここに何か建つ、ということだけが分かる
    return (
      <g className="dio-build">
        <path d={`M${x},${y0} L${x + w},${y0} L${x + w},${y0 + h} L${x},${y0 + h} Z`} className="dio-plot" />
        {[
          [x, y0],
          [x + w, y0],
          [x, y0 + h],
          [x + w, y0 + h],
        ].map(([px, py], i) => (
          <line key={i} x1={px} y1={py} x2={px} y2={py - r * 0.2} className="dio-stake" />
        ))}
      </g>
    );
  }

  if (stage === "frame") {
    // 鉄筋。柱と梁だけ。まだ屋根も壁も無い
    return (
      <g className="dio-build">
        <path d={`M${x},${y0} L${x + w},${y0} L${x + w},${y0 + h} L${x},${y0 + h} Z`} className="dio-plot" />
        {[x, x + w / 2, x + w].map((px, i) => (
          <line key={i} x1={px} y1={y0 + h} x2={px} y2={y0 - r * 0.34} className="dio-rebar" />
        ))}
        <line x1={x} y1={y0 - r * 0.34} x2={x + w} y2={y0 - r * 0.34} className="dio-rebar" />
        <line x1={x} y1={y0 - r * 0.1} x2={x + w} y2={y0 - r * 0.1} className="dio-rebar" />
      </g>
    );
  }

  // 壁と屋根。まだ塗っていないので木の色のまま
  const top = y0 - r * 0.38;
  return (
    <g className="dio-build">
      <path d={`M${x},${y0 + h} L${x + w},${y0 + h} L${x + w},${top} L${x},${top} Z`} className="dio-wall" />
      <path d={`M${x - r * 0.08},${top} L0,${top - r * 0.24} L${x + w + r * 0.08},${top} Z`} className="dio-roof" />
      <line x1={x + w * 0.5} y1={y0 + h} x2={x + w * 0.5} y2={top} className="dio-rebar" />
    </g>
  );
}
