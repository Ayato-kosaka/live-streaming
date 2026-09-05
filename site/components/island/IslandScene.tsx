import { memo } from "react";
import { ISLAND, GRASS_INSET, PLACES, PLATEAU, SPOTS, WORLD, type SpotId } from "./layout";
import {
  blob,
  inset,
  insideRadii,
  pointAt,
  radiiToPoints,
  resample,
  ring,
  rng,
  wobble,
  type Pt,
} from "./geometry";

/* ------------------------------------------------------------------ */
/* 地形                                                                */
/* ------------------------------------------------------------------ */

const { cx: CX, cy: CY, squash: SQ } = ISLAND;

/**
 * 楕円を1つ。
 *
 * この絵では小さな粒（砂・泡・石・花びら）を何百も置く。<ellipse> を1つずつ
 * 置くとそのぶん要素が増えて、カメラが動くたびに全部を描き直すことになる。
 * 円弧コマンドで書いておけば、いくつでも1本のパスにつなげられる。
 */
function oval(x: number, y: number, rx: number, ry: number): string {
  const f = (n: number) => n.toFixed(1);
  return `M${f(x - rx)},${f(y)}a${f(rx)},${f(ry)} 0 1,0 ${f(rx * 2)},0a${f(rx)},${f(ry)} 0 1,0 ${f(-rx * 2)},0`;
}

/**
 * 角のある面。石にだけ使う。
 *
 * 石を楕円で描くと、どうしても「じゃがいも」に見える。公式の石は
 * 面で割れていて、角がはっきりある。多角形にして半径をばらすと、
 * 同じ要素数のまま石らしくなる。
 */
function facetPts(x: number, y: number, rx: number, ry: number, n: number, r: () => number): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 - Math.PI / 2 + (r() - 0.5) * 0.42;
    const k = 0.78 + r() * 0.22;
    out.push([x + Math.cos(a) * rx * k, y + Math.sin(a) * ry * k]);
  }
  return out;
}

/** 点列を1本の折れ線に。dx dy だけずらした写しも作れる（石の下面に使う）。 */
function poly(pts: Pt[], dx = 0, dy = 0): string {
  const f = (v: number) => v.toFixed(1);
  return pts.map(([x, y], i) => `${i ? "L" : "M"}${f(x + dx)},${f(y + dy)}`).join("") + "Z";
}

function facet(x: number, y: number, rx: number, ry: number, n: number, r: () => number): string {
  return poly(facetPts(x, y, rx, ry, n, r));
}

/** 草の株。葉を数枚、根元から扇に開く。草むらにも浜の草にも同じ形を使う。 */
function bladeClump(x: number, y: number, s: number, lean: number, n: number, r: () => number): string {
  const f = (v: number) => v.toFixed(1);
  let d = "";
  for (let i = 0; i < n; i++) {
    const dx = (i - (n - 1) / 2) * 2.6 * s;
    const h = (5.5 + r() * 4.5) * s;
    d += `M${f(x + dx)},${f(y)}q${f(dx * 0.4 + lean)},${f(-h * 0.6)} ${f(dx * 0.9 + lean * 2)},${f(-h)}q${f(-dx * 0.2)},${f(h * 0.55)} ${f(-dx * 0.6 - lean * 1.4)},${f(h)}Z`;
  }
  return d;
}

/* ---- 小さな飾り ---------------------------------------------------------
   島にいちばん多く置いてあるのは、石・低木・切り株・きのこ・浜の草。80個あった。

   これを 320px のスプライトで置いていた。島の上では 12〜30px にしか出ないので、
   毎フレーム、元の大きさから引き直すことになる。画像は「小さく出すほど重い」。
   実測すると、この80枚を消すだけでフレーム間隔が 67ms → 17ms になった。
   起動直後がカクついていた原因はここ。

   上から見た石は「影・面・光の当たる面」の3枚でしかない。ベクターで描いて
   色ごとに1本のパスへまとめれば、80枚が10本のパスで済む。絵は変わらない。

   **ただし、このまとめかたは別の速さを1つ殺している。**
   まとめたパスは1本1本が島の全域に広がるので、**ブラウザが「画面の外にある
   ぶんを捨てる」ができなくなる。** 表示する範囲がどれだけ狭くても、
   描き直しのたびに島ぜんぶのパスをなぞることになる。
   実測（390×844・dpr3・1フレームあたりの描画プロセスの CPU）: 26.6ms のうち
   **20ms がこの地面のパス**。スマホは 1200 のうち 340 しか見ていないのに。

   いまは `viewBox` を据え置いて `transform` だけで動かしているので
   （`IslandStage.tsx` の anchor）、描き直し自体がほとんど起きない。
   それで釣り合っている。**もう一度ここを触るなら、順番を間違えないこと。**
   まとめる最適化は、画面外を捨てる最適化と喧嘩する。両方は取れない。
   -------------------------------------------------------------------- */

type DecoKind = "rock" | "bush" | "stump" | "shroom" | "tuft";
export type Deco = { k: DecoKind; x: number; y: number; s: number };

/** 色ごとのバケツ。塗る色が同じものは、何個あっても1本のパスに入る。 */
type DecoPaths = {
  shade: string;
  rockDark: string;
  rock: string;
  rockLit: string;
  bush: string;
  bushLit: string;
  bark: string;
  barkTop: string;
  cap: string;
  stem: string;
  tuft: string;
  tuftLit: string;
};

function bakeDeco(list: Deco[], seed: number): DecoPaths {
  const r = rng(seed);
  const b: DecoPaths = {
    shade: "", rockDark: "", rock: "", rockLit: "", bush: "", bushLit: "",
    bark: "", barkTop: "", cap: "", stem: "", tuft: "", tuftLit: "",
  };
  for (const it of list) {
    const { x, y, s } = it;
    if (it.k === "rock") {
      const w = s * 1.34;
      // 影は光源の反対（右下）へずらす。真下だと物が地面に乗って見えない
      b.shade += oval(x + w * 0.12, y + s * 0.1, w * 0.6, s * 0.3);
      // 同じ形を少し下にずらして暗く敷く。平らな紙に見えなくなる
      const pts = facetPts(x, y - s * 0.42, w * 0.5, s * 0.5, 6, r);
      b.rockDark += poly(pts, w * 0.02, s * 0.12);
      b.rock += poly(pts);
      b.rockLit += facet(x - w * 0.12, y - s * 0.62, w * 0.28, s * 0.26, 5, r);
    } else if (it.k === "bush") {
      const w = s * 1.12;
      b.shade += oval(x + w * 0.12, y + s * 0.07, w * 0.58, s * 0.26);
      // 玉を3つ重ねる。1つだと饅頭に見える
      b.bush +=
        oval(x, y - s * 0.46, w * 0.5, s * 0.48) +
        oval(x - w * 0.3, y - s * 0.3, w * 0.31, s * 0.3) +
        oval(x + w * 0.31, y - s * 0.32, w * 0.29, s * 0.29);
      b.bushLit +=
        oval(x - w * 0.13, y - s * 0.66, w * 0.29, s * 0.23) +
        oval(x + w * 0.17, y - s * 0.56, w * 0.18, s * 0.15);
    } else if (it.k === "stump") {
      const hw = s * 0.44;
      const f = (v: number) => v.toFixed(1);
      b.shade += oval(x + hw * 0.34, y + s * 0.07, hw * 1.32, s * 0.26);
      // 幹の側面。上下を楕円でふさぐと、切り株の「筒」になる
      b.bark += `M${f(x - hw)},${f(y - s * 0.62)}L${f(x - hw)},${f(y - s * 0.16)}a${f(hw)},${f(s * 0.2)} 0 0,0 ${f(hw * 2)},0L${f(x + hw)},${f(y - s * 0.62)}Z`;
      b.barkTop += oval(x, y - s * 0.62, hw, s * 0.21);
      // 年輪。1本あるだけで切り口に見える
      b.bark += oval(x, y - s * 0.62, hw * 0.44, s * 0.09);
    } else if (it.k === "shroom") {
      const f = (v: number) => v.toFixed(1);
      b.shade += oval(x + s * 0.12, y + s * 0.04, s * 0.42, s * 0.17);
      b.stem += `M${f(x - s * 0.15)},${f(y)}L${f(x - s * 0.12)},${f(y - s * 0.42)}h${f(s * 0.24)}L${f(x + s * 0.15)},${f(y)}Z`;
      b.cap += `M${f(x - s * 0.44)},${f(y - s * 0.4)}a${f(s * 0.44)},${f(s * 0.38)} 0 0,1 ${f(s * 0.88)},0Z`;
      b.stem += oval(x - s * 0.14, y - s * 0.56, s * 0.1, s * 0.07) + oval(x + s * 0.16, y - s * 0.5, s * 0.08, s * 0.06);
    } else {
      const k = 1.1 + r() * 1.1;
      const d = bladeClump(x, y, k * (s / 14), (r() - 0.5) * 2.4, 3 + Math.floor(r() * 3), r);
      if (r() < 0.5) b.tuftLit += d;
      else b.tuft += d;
    }
  }
  return b;
}

/** 低木の地の色。草より一段暗くないと、地面に沈んで見えなくなる。 */
const BUSH_DARK = "color-mix(in srgb, var(--grass-lo) 76%, #10361c 24%)";

/**
 * 落ち影の色。
 *
 * 公式の落ち影を、影のかかっていない同じ地面で割ると **青だけ残る**
 * （草の上で R×0.53 G×0.58 B×0.76。`docs/ac-reference.md` 3章）。
 * 屋外の影は空の青を拾うので、物理的にもこちらが正しい。
 * 暖かい灰緑の影にすると、屋内の照明で撮ったように見える。
 *
 * 島の上に落ちる影は、全部この色にそろえる。紙の型のページだけは暖色のまま。
 */
const SHADOW = "#0c0e34";

/** 影の濃さ。砂の上の影は草の上より薄い（実測で ×0.72 と ×0.53）。 */
const SHADE_GRASS = 0.4;
const SHADE_SAND = 0.26;

/** 飾りを描く。色は島のテーマ変数に付いていくので、北欧に行っても浮かない。 */
function DecoLayer({ p, shade }: { p: DecoPaths; shade: number }) {
  return (
    <g aria-hidden>
      <path d={p.shade} fill={SHADOW} opacity={shade} />
      <path d={p.tuft} fill="var(--grass-lo)" opacity="0.75" />
      <path d={p.tuftLit} fill="var(--grass-hi)" opacity="0.88" />
      <path d={p.bush} fill={BUSH_DARK} />
      <path d={p.bushLit} fill="var(--grass-hi)" />
      <path d={p.bark} fill="#8a5c36" />
      <path d={p.barkTop} fill="#c69a63" />
      <path d={p.rockDark} fill="#6f7c84" />
      <path d={p.rock} fill="#8d9aa0" />
      <path d={p.rockLit} fill="#c3ccd0" />
      <path d={p.cap} fill="#e2522d" />
      <path d={p.stem} fill="#f6efe0" />
    </g>
  );
}

/* ---- 島の形 -------------------------------------------------------------
   まん丸に近い輪郭は「島」に見えない。実際の島には、海へ突き出した岬と、
   海が食い込んだ入り江がある。ここでその2つを足す。

   ただし歩ける範囲は layout.ts の ISLAND.radii から決まっていて、こちらでは
   動かせない。そこで、

     ・岬（砂だけ）… 草地は動かさず、砂州だけを沖へ伸ばす。歩ける範囲の外なので安全
     ・入り江      … 波打ち際はわずかにへこませ、草地を大きく後退させる。
                     結果として「砂浜が広い三日月の湾」になる。歩ける範囲より
                     内側に緑が下がるだけなので、こちらも安全

   という作り方にしてある。**草地の半径を ISLAND.radii - GRASS_INSET より
   外へ出してはいけない。** 出すと、歩けない場所に緑が生えることになる。
   -------------------------------------------------------------------- */

/** 輪郭を何点で持つか。少ないと起伏を足しても角が丸まって消える。 */
const COAST_N = 128;

/** 岬・入り江。t は北から時計回りの割合、w は広がり、amp は沖(+)/陸(-)への深さ。 */
type Feature = { t: number; w: number; amp: number };

/** 入り江。建物のそばに置くと建物が海に落ちるので、空いている向きにだけ置く。 */
const COVES: Feature[] = [
  { t: 0.545, w: 0.05, amp: -78 }, // 南。掲示板と桟橋のあいだの砂浜を広げる
  { t: 0.052, w: 0.042, amp: -60 }, // 北北東
  { t: 0.3, w: 0.044, amp: -54 }, // 東南東
];
/** 砂州。草地は動かさないので、緑の生えていない砂の岬になる。 */
const CAPES: Feature[] = [
  { t: 0.425, w: 0.03, amp: 64 },
  { t: 0.72, w: 0.032, amp: 52 },
  { t: 0.155, w: 0.026, amp: 44 },
  { t: 0.905, w: 0.028, amp: 38 },
];

/** 山なりの盛り上がりを重ねる。角を作らないよう、階段ではなく釣鐘型で足す。 */
function bumps(list: Feature[], t: number): number {
  let v = 0;
  for (const f of list) {
    let dt = ((((t - f.t) % 1) + 1) % 1);
    dt = Math.min(dt, 1 - dt);
    v += f.amp * Math.exp(-((dt / f.w) ** 2));
  }
  return v;
}

/** -1〜1 の、なめらかで不規則な起伏。周期の違う正弦波を3本重ねる。 */
function ripple(n: number, seed: number, waves: [number, number, number]): number[] {
  const r = rng(seed);
  const ph = [r() * Math.PI * 2, r() * Math.PI * 2, r() * Math.PI * 2];
  const w = [0.55, 0.3, 0.15];
  return Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2;
    return w.reduce((s, k, j) => s + Math.sin(a * waves[j] + ph[j]) * k, 0);
  });
}

const baseR = resample(ISLAND.radii, COAST_N);
const rip = ripple(COAST_N, 5150, [3, 7, 13]);
const rip2 = ripple(COAST_N, 991, [4, 9, 17]);

/**
 * 草地。入り江のぶんだけ内側へ下がる。起伏は必ずマイナス側に振って、
 * ISLAND.radii - GRASS_INSET より外へは絶対に出さない。
 */
const grassR = baseR.map((r, i) => {
  const t = i / COAST_N;
  return r - GRASS_INSET + Math.min(0, bumps(COVES, t)) - 5 + rip[i] * 5;
});

/**
 * 波打ち際。岬はそのまま沖へ、入り江はほんの少しだけへこませる。
 * 入り江でへこませすぎると、歩ける範囲が海にはみ出す。
 */
const sandR = baseR.map((r, i) => {
  const t = i / COAST_N;
  const v = r + bumps(CAPES, t) + bumps(COVES, t) * 0.18 + rip2[i] * 9;
  // 砂浜が細くなりすぎると、濡れ砂と乾いた砂を描き分けられない
  return Math.max(grassR[i] + 26, v);
});

/**
 * 岸は5本の帯でできている（`docs/ac-reference.md` 2章）。
 * 海から陸へ「深い青 → 明るいターコイズの浅瀬 → 真っ白な泡 → 濡れた砂 → 乾いた砂」。
 * 2 と 3 が無いと、境がただの色の切り替わりになって水辺に見えない。
 *
 * 数字は砂浜の輪郭からの距離。マイナスが沖、プラスが陸。
 * 公式の写真では、浅瀬も泡も「思ったより細い」。深い青がすぐそこまで来ている。
 */
const SHORE = {
  /* 深い青から浅瀬へ移るところ。

     **公式は、ここがほとんど無い。** ビーチの公式絵（`ref_Summer_Beach_NH_Artwork`）を
     横に切って測ると、平らな深い青がそのまま続いて、**6〜15px**で
     セージと白の入り混じった帯に変わる。段は付いていない。
     段に見えないのは、浅瀬そのものの縁がぎざぎざだからで、
     あいだに帯を挟んで色をなじませているからではない。

     こちらは 1280 幅で **54px** 取っていた（27 + 27）。公式の4〜9倍。
     引きで見ると島のまわりに淡い輪が広がって、島が水に浮いた皿に見える。
     幅を 8 単位ずつまで詰めて、深い青を岸まで持ってくる。
     ぶれ幅（wobble）も一緒に詰める。帯より大きいと隣を突き抜ける。 */
  fade1: -120,
  fade2: -112,
  /** 明るいターコイズの浅瀬 */
  shallow: -104,
  /** いちばん明るい、砂のすぐ沖 */
  shelf: -44,
  /** 泡の外側と内側。細くしないと、せっかくの浅瀬を白が食べてしまう。
      公式の波打ち際は、白と浅瀬の色が交互に見えている。ベタ塗りにしない。 */
  foamOut: -15,
  foamIn: 2,
  /** 濡れた砂の内側の縁 */
  wet: 14,
};

/**
 * 岸の色。
 *
 * 公式のビーチ写真を測ると、浅瀬は水色（シアン）ではなく
 * **`#95cab6` のセージ**だった。水の色に砂の色が透けているからで、
 * ここを純粋なシアンにすると、島のまわりだけネオンのように浮く。
 *
 * だから海の色に砂の色を混ぜて作る。`color-mix` にしておけば、
 * 北欧や砂漠に移ったときも海と砂の両方に付いていく。
 */
const SEA_FADE1 = "color-mix(in srgb, var(--sea-deep) 62%, var(--sea-shallow) 38%)";
const SEA_FADE2 = "color-mix(in srgb, var(--sea-deep) 28%, var(--sea-shallow) 72%)";
const SEA_SHALLOW = "color-mix(in srgb, var(--sea-shallow) 55%, var(--sand-wet) 45%)";
const SEA_SHELF = "color-mix(in srgb, var(--sea-shelf) 62%, var(--sand) 38%)";
/** 濡れた砂。公式は乾いた砂より「暗い」のではなく「濃い黄色」。灰色を混ぜない。 */
const SAND_WET = "color-mix(in srgb, var(--sand-wet) 68%, var(--gold) 32%)";
/** いちばん沖。深い青をさらに沈めた色。画面のふちで海が抜けて見えないように。 */
const SEA_ABYSS = "color-mix(in srgb, var(--sea-deep) 84%, #0b3f86 16%)";

/* ---- 空と水平線 ----------------------------------------------------------
   4周目レビュー14章「本物には空があり、水平線がある。あやと島は上が海で終わる」。

   **島は真上から見た板なので、画面の上は「北」であって「遠く」ではない。**
   それでも、世界の北のはしに水平線を引いて向こうを空にすると、
   板が「場所」に見えるかどうか。試して、引きの絵では効いたので置いてある。

   置く高さは 170。島の北の浜（y≈288）より沖で、沖を行く舟（y=208）より奥。
   **あやとは草地から出られない**（clampToIsland）ので、
   歩いていって水平線の向こうへ回り込むことは起きない。

   色は本物の実測（`/tmp/acref/ref_NH_Plaza_Exercise.jpg`）。
   上 rgb(100,147,255) → 水平線ぎわ rgb(112,178,254)。雲は rgb(149,190,253)。
   青が強い。空を水色にすると、芝の緑と喧嘩して絵が濁る。 */
const SKY_Y = 170;
/* 空の色。本物の値に海の色を少しだけ混ぜる。
   混ぜておくと、時間帯（夕・夜）や別の島に移ったときに、空も一緒に動く。
   混ぜずに置くと、海が紫になった夕方に空だけ真昼の青で残る。 */
const SKY_HI = "color-mix(in srgb, #6491ff 80%, var(--sea-mid) 20%)";
const SKY_MID = "color-mix(in srgb, #74aefe 80%, var(--sea-mid) 20%)";
const SKY_LO = "color-mix(in srgb, #8fc6fe 78%, var(--sea-shallow) 22%)";
/** 雲。空より明るく、白すぎない（白にすると波のしぶきと同じ強さになる） */
const CLOUD = "color-mix(in srgb, #d7e6ff 76%, var(--foam) 24%)";
/** 雲。丸を重ねただけの、輪郭のない塊（`island-design.md` 2章-1） */
const CLOUDS: [number, number, number][] = [
  [120, -30, 0.9],
  [430, -150, 1.3],
  [760, 20, 0.72],
  [1030, -80, 1.05],
  [1290, 30, 0.8],
];

const sandPath = blob(CX, CY, sandR, SQ);
const grassPath = blob(CX, CY, grassR, SQ);

/** 浅瀬。輪郭をそのまま外へ出すと機械的に見えるので、帯ごとに違う起伏を足す。 */
const fade1Path = blob(CX, CY, wobble(inset(sandR, SHORE.fade1), 71, 8), SQ);
const fade2Path = blob(CX, CY, wobble(inset(sandR, SHORE.fade2), 72, 6), SQ);
const shallowPath = blob(CX, CY, wobble(inset(sandR, SHORE.shallow), 73, 15), SQ);
const shelfPath = blob(CX, CY, wobble(inset(sandR, SHORE.shelf), 74, 9), SQ);

/**
 * 濡れた砂。乾いた砂より一段濃い帯を、波打ち際の側に敷く。
 * 乾いた砂に外へ向かう暗いグラデをかけると、こちらのほうが明るくなって逆になる。
 * だから乾いた砂は平らな明るい色にして、濃さはこの帯だけで作る。
 */
const wetRing = ring(CX, CY, sandR, wobble(inset(sandR, SHORE.wet), 75, 5), SQ);
/** 波が引いたばかりのところ。いちばん濃い。 */
const wetEdgeRing = ring(CX, CY, sandR, wobble(inset(sandR, 5), 76, 2.5), SQ);

/**
 * 泡。ぼかさず、真っ白でくっきり描く。
 *
 * 1本の線にすると縫い目のように見えてしまうので、
 *   ・不規則な幅の帯（レースの土台）
 *   ・大小の弧をびっしり重ねたふち（レースの縁）
 *   ・ちぎれた泡の粒
 * の3つを重ねる。弧の向きは、その位置での外向きに合わせる。
 */
const foamBand = ring(
  CX,
  CY,
  wobble(inset(sandR, SHORE.foamOut), 81, 7, [5, 11, 19]),
  wobble(inset(sandR, SHORE.foamIn), 82, 5, [4, 9, 17]),
  SQ,
);
/** 泡の外へにじむぶん。ぼかす代わりに、薄い帯をもう1本外に置く。 */
const foamHaze = ring(
  CX,
  CY,
  wobble(inset(sandR, SHORE.foamOut - 13), 83, 9, [5, 11, 19]),
  wobble(inset(sandR, SHORE.foamOut), 81, 7, [5, 11, 19]),
  SQ,
);

/**
 * 波打ち際のレース。
 *
 * 弧を1本ずつ <path> にすると数百要素になって、
 * カメラを動かすたび（viewBox が毎フレーム変わる）に全部を描き直すことになる。
 * 見た目は同じなので、置き場所と向きを座標に焼き込んで
 * 「太さの違う3本のパス」にまとめる。
 */
function foamLace(
  count: number,
  seed: number,
  offMin: number,
  offMax: number,
  sizeMin: number,
  sizeMax: number,
): string[] {
  const r = rng(seed);
  const buckets = ["", "", ""];
  for (let i = 0; i < count; i++) {
    const t = (i + r() * 0.9) / count;
    const [x, y] = pointAt(CX, CY, sandR, SQ, t, offMin + r() * (offMax - offMin));
    const w = sizeMin + r() * (sizeMax - sizeMin);
    const h = w * (0.14 + r() * 0.22); // 平たい弧。丸いとバネの落書きに見える
    // ふくらみが沖を向く角度。輪郭の位置 t がそのまま回転角になる。
    const a = t * Math.PI * 2;
    const c = Math.cos(a);
    const sn = Math.sin(a);
    const f = (n: number) => n.toFixed(1);
    buckets[i % 3] +=
      `M${f(x - w * c)},${f(y - w * sn)}` +
      `Q${f(x + h * sn)},${f(y - h * c)} ${f(x + w * c)},${f(y + w * sn)}`;
  }
  return buckets;
}

/**
 * 波が寄せたときと引いたときの、2組のレース。
 *
 * 交互に濃さを入れ替えると、水が上がって下がっているように見える。
 * 動かしているのは opacity だけなので、形を毎フレーム作り直さずに済む。
 */
const LACE_BACK = [...foamLace(64, 8801, -30, -16, 15, 32), ...foamLace(96, 8802, -18, -4, 7, 17)];
const LACE_FRONT = [...foamLace(64, 8811, -18, -5, 15, 32), ...foamLace(96, 8812, -6, 8, 7, 17)];

/** 6本それぞれの太さと濃さ。ばらけていないとレースに見えない。 */
const LACE_STYLE: [number, number][] = [
  [3.4, 0.9],
  [2.4, 0.7],
  [1.7, 0.5],
  [2.6, 0.85],
  [1.9, 0.62],
  [1.3, 0.44],
];

/**
 * 波が引いたあとの筋と、砂粒。
 *
 * 公式の砂浜は無地ではない。波が上がりきったところに弧の跡が残っていて、
 * 全体にざらっとした粒が乗っている。これが無いと、砂が板に見える。
 * レースと同じで、位置を焼き込んで数本のパスにまとめる。
 */
const tideMarks = foamLace(52, 9301, 12, 26, 18, 40);
const beachGrains = (() => {
  const r = rng(9401);
  const buckets = ["", ""];
  for (let i = 0; i < 150; i++) {
    const t = (i + r() * 0.9) / 150;
    const [x, y] = pointAt(CX, CY, sandR, SQ, t, 6 + r() * 34);
    const rad = 0.9 + r() * 1.6;
    buckets[i % 2] += oval(x, y, rad, rad * 0.7);
  }
  return buckets;
})();

/**
 * 沖に頭を出している岩。
 *
 * 水面に何も無いと、海が「島のまわりの塗り」に見えてしまう。
 * 岩が数個あるだけで、そこに水面があることが分かる。
 * スプライトだと画像が増えるので、影・岩・当たった波の3本のパスで描く。
 */
const seaRocks = (() => {
  const r = rng(7788);
  let under = "";
  let body = "";
  let top = "";
  let wash = "";
  for (const t of [0.08, 0.205, 0.375, 0.5, 0.615, 0.79, 0.865]) {
    const [x, y] = pointAt(CX, CY, sandR, SQ, t + (r() - 0.5) * 0.02, -(52 + r() * 46));
    const w = 9 + r() * 13;
    const h = w * (0.62 + r() * 0.2);
    under += oval(x + 2, y + 3, w * 1.25, h * 0.8);
    body += oval(x, y, w, h);
    top += oval(x - w * 0.22, y - h * 0.3, w * 0.5, h * 0.4);
    wash += oval(x, y + h * 0.35, w * 1.5, h * 0.62);
  }
  return { under, body, top, wash };
})();

/** ちぎれた泡の粒。円をひとつずつ置かず、円弧コマンドで1本のパスにまとめる。 */
const foamDots = (() => {
  const r = rng(8803);
  const buckets = ["", ""];
  for (let i = 0; i < 74; i++) {
    const t = (i + r() * 0.9) / 74;
    const [x, y] = pointAt(CX, CY, sandR, SQ, t, -36 + r() * 26);
    const rad = 1.4 + r() * 2.8;
    buckets[i % 2] += oval(x, y, rad, rad);
  }
  return buckets;
})();

/**
 * 海面の白い模様。
 *
 * 細い線を散らすと点描に見えて、水面にならない。公式の海には
 * 「平たい白のかたまり」が大小まばらに浮いていて、それが水の質感を作っている。
 * 形は平たい楕円。円弧コマンドでまとめて、濃さごとの3本のパスにする。
 */
function seaPatches(count: number, seed: number, wMin: number, wMax: number, flat: number): string[] {
  const r = rng(seed);
  const shallowEdge = inset(sandR, SHORE.shallow);
  const buckets = ["", "", ""];
  let n = 0;
  let guard = 0;
  while (n < count && guard++ < count * 40) {
    const x = -140 + r() * (WORLD + 280);
    const y = -140 + r() * (WORLD + 280);
    // 浅瀬より内側には出さない。島の縁で光っていると泡と喧嘩する。
    if (insideRadii(CX, CY, shallowEdge, x, y, SQ, -14)) continue;
    const w = wMin + r() * (wMax - wMin);
    buckets[n % 3] += oval(x, y, w, Math.max(1.2, w * flat * (0.7 + r() * 0.6)));
    n++;
  }
  return buckets;
}

/** 大きめのかたまりと、細長い筋。2種類ないと水面が単調になる。 */
const seaBlobs = seaPatches(96, 6161, 7, 26, 0.3);
const seaStreaks = seaPatches(56, 6162, 22, 62, 0.055);
/** 3本それぞれの濃さ。ばらけていないと「点を撒いた」ように見える。 */
const SEA_OPACITY = [0.5, 0.32, 0.18];

/**
 * 草の地模様。
 *
 * 本物の草地は一面に細かい葉が入っていて、のっぺりした面がどこにも無い。
 * 葉を1枚ずつ置くと数百要素になるので、タイル1枚に焼いて敷く。
 *
 * 前は大きさの違うタイルを2枚重ねて、繰り返しを隠していた。ただしそれは
 * 草地ぜんぶを2回塗るということで、しかも片方は patternTransform で回して
 * いた（回したパターンは、そのぶん引き直しが要る）。
 * タイル1枚を大きくして中身を増やせば、1回塗るだけで同じだけばらける。
 *
 * 中身は公式の広場の芝（`ref_NH_Plaza_Exercise` の 60,560〜800,700）を
 * 拡大して測り直した。分かったのは3つ。
 *
 *   1. **ほぼ全部が同じ向きの三角**。丸い葉やクローバーは入っていない
 *   2. 明暗の付きかたが左右で違う。
 *      地 #5cc664 V0.78 に対して、**暗い三角 #449d59 V0.62（差 0.16）**、
 *      明るい三角 #64d06d V0.82（差 0.04）。**暗いほうが主役**
 *   3. 黄色い株は散らばっていない。**数株ずつ固まって生えている**
 *
 * 前のタイルはこの3つが全部逆だった（丸が混ざり、明るいほうが濃く、
 * 黄が均等に散り、さらに砂色の薄い粒を撒いていた）。
 * 薄い粒は公式には無く、拡大すると芝の上の染みに見えていたのでやめる。
 * 塗る面も1枚減る。
 */
function grassTile(seed: number, count: number, size: number) {
  const r = rng(seed);
  const f = (n: number) => n.toFixed(1);
  const SHAPES = [
    // 三角の葉。公式の芝はほとんどこれ
    (x: number, y: number, s: number) => `M${x},${y}l${f(-3.4 * s)},${f(-6.2 * s)}h${f(6.8 * s)}Z`,
    // 二股の草
    (x: number, y: number, s: number) =>
      `M${x},${y}l${f(-2.6 * s)},${f(-6.6 * s)}l${f(2.6 * s)},${f(3.2 * s)}l${f(2.6 * s)},${f(-3.2 * s)}Z`,
    // 三つ葉。1割だけ形の違うものを混ぜると、繰り返しが目につかなくなる
    (x: number, y: number, s: number) =>
      `M${x},${y}l${f(-1.6 * s)},${f(-4 * s)}l${f(1.6 * s)},${f(1.4 * s)}l${f(1.6 * s)},${f(-1.4 * s)}Z` +
      oval(x - 2.6 * s, y - 4.4 * s, 1.5 * s, 1.2 * s) +
      oval(x + 2.6 * s, y - 4.4 * s, 1.5 * s, 1.2 * s),
  ];
  /** 黄みの強い株が固まって生えるところ。タイル1枚につき数か所。 */
  const patches = Array.from({ length: 4 }, () => ({
    x: r() * size,
    y: r() * size,
    r: 22 + r() * 20,
  }));
  let hi = "";
  let lo = "";
  /** 黄みの強い株。公式の広場の草地には、緑の三角に混じって黄色い三角が必ず入っている。
      これが無いと、地面が「緑一色の絨毯」になって暖かみが出ない。 */
  let dry = "";
  for (let i = 0; i < count; i++) {
    // 継ぎ目に葉がまたがらないよう、ふちから少し内側にだけ置く
    const x = +(6 + r() * (size - 12)).toFixed(1);
    const y = +(8 + r() * (size - 12)).toFixed(1);
    const k = r();
    const d = SHAPES[k < 0.66 ? 0 : k < 0.9 ? 1 : 2](x, y, 0.8 + r() * 0.9);
    // 黄色い株は、上で決めた数か所のまわりにだけ生やす
    const inPatch = patches.some((p) => Math.hypot(p.x - x, p.y - y) < p.r);
    if (inPatch && r() < 0.62) dry += d;
    else if (r() < 0.62) lo += d;
    else hi += d;
  }
  return { hi, lo, dry, size };
}
/** 枯れかけの草の色。テーマが変わっても草と金色の中間に付いていく。 */
const GRASS_DRY = "color-mix(in srgb, var(--grass-hi) 52%, var(--gold) 48%)";

/** タイル1枚。大きいほど繰り返しが目につきにくい。 */
const GRASS_TILE = grassTile(1207, 268, 208);

const plateauTopPath = blob(PLATEAU.cx, PLATEAU.cy - PLATEAU.drop, PLATEAU.radii, PLATEAU.squash);

/** 高台の崖。手前側の弧だけを帯にして、そこに岩肌を描く。 */
const cliff = (() => {
  const lower = radiiToPoints(PLATEAU.cx, PLATEAU.cy, PLATEAU.radii, PLATEAU.squash);
  const upper = radiiToPoints(PLATEAU.cx, PLATEAU.cy - PLATEAU.drop, PLATEAU.radii, PLATEAU.squash);
  const n = lower.length;
  const seq: number[] = [];
  for (let i = 0; i < n; i++) {
    const k = (i + Math.floor(n / 4)) % n; // 右→下→左 の順に見る
    if (upper[k][1] >= PLATEAU.cy - PLATEAU.drop - 2) seq.push(k);
  }
  if (seq.length < 2) return { band: "", lines: [] as Pt[] };
  let d = `M${upper[seq[0]][0].toFixed(1)},${upper[seq[0]][1].toFixed(1)}`;
  for (const i of seq.slice(1)) d += `L${upper[i][0].toFixed(1)},${upper[i][1].toFixed(1)}`;
  for (let k = seq.length - 1; k >= 0; k--) d += `L${lower[seq[k]][0].toFixed(1)},${lower[seq[k]][1].toFixed(1)}`;
  return { band: d + "Z", lines: seq.map((i) => upper[i]) };
})();

/** 川。高台の滝から浜へ流れ落ちる。 */
const RIVER = "M812 500 C856 566 826 640 862 702 C892 754 918 786 956 806";
/** 池 */
const POND = { x: 452, y: 806, rx: 66, ry: 32 };

/* ------------------------------------------------------------------ */
/* 置くもの                                                            */
/* ------------------------------------------------------------------ */

export type Item = {
  n: string;
  x: number;
  y: number;
  s: number;
  flip?: boolean;
  /** そよ風で揺らす。値は揺れ始めをずらすための秒数 */
  sway?: number;
  /** 入口になっている建物。押せるようにするため、どの場所かを持たせる。 */
  spot?: SpotId;
  /** 揺らさない。地面の細かい飾りまで揺らすと、毎フレーム動かす要素が一気に増える。 */
  still?: boolean;
};

/** 揺れるもの(草木)かどうか。建物や岩は揺れない。 */
const SWAYS = /^(tree|bush|grass|flower|mushroom|lily)/;

const P = Object.fromEntries(PLACES.map((s) => [s.id, s])) as Record<SpotId, (typeof PLACES)[number]>;

/** 建物。押せる範囲と絵がズレると「押したのに反応しない」になるので、
    絵は PLACES の定義そのものから作る。ここが唯一の出どころ。
    押せるのは入口の6つだけ。残りは景色として建っているだけで、spot を付けない。 */
const ENTRANCES = new Set(SPOTS.map((s) => s.id));
const BUILDINGS: Item[] = PLACES.map((sp) => ({
  n: sp.icon,
  x: sp.x,
  y: sp.y,
  s: sp.size,
  spot: ENTRANCES.has(sp.id) ? sp.id : undefined,
}));

/** 建物のまわりの飾り。場所ごとに「何をしている所か」が伝わるように置く。 */
const DRESSING: Item[] = [
  // 配信(やぐら): 見物用のベンチ
  { n: "bench", x: P.streams.x - 62, y: P.streams.y + 26, s: 26 },
  { n: "bench", x: P.streams.x + 66, y: P.streams.y + 30, s: 26, flip: true },
  // 作った料理(台所の小屋): 畑の柵
  { n: "fence", x: P.kitchen.x - 62, y: P.kitchen.y + 34, s: 22 },
  { n: "fence", x: P.kitchen.x - 22, y: P.kitchen.y + 40, s: 22 },
  // アプリ(工房): 作業台と丸太
  { n: "stall", x: P.apps.x + 62, y: P.apps.y + 26, s: 26 },
  { n: "log", x: P.apps.x - 58, y: P.apps.y + 30, s: 15 },
  // 伝説の企画(丘の館): 記念碑
  { n: "statue", x: P.legends.x - 62, y: P.legends.y + 16, s: 54 },
  { n: "statue-head", x: P.legends.x + 66, y: P.legends.y + 20, s: 40 },
  // これから: たきぎ(旅立ちの支度)
  { n: "log", x: P.next.x + 40, y: P.next.y + 18, s: 14 },
  // あやとのこと(あやとの家): 庭の丸太
  { n: "log", x: P.friends.x - 44, y: P.friends.y + 6, s: 15 },
  { n: "log", x: P.friends.x + 46, y: P.friends.y + 10, s: 15, flip: true },
  { n: "bench", x: P.friends.x + 4, y: P.friends.y + 42, s: 26 },
  // 企画をだす(掲示板): 立ち読み用の灯り
  { n: "lantern", x: P.board.x + 74, y: P.board.y + 6, s: 52 },
  { n: "bench", x: P.now.x - 56, y: P.now.y + 24, s: 26 },
  // 歩いた国(道しるべ): 舟
  { n: "canoe", x: 214, y: 916, s: 20, flip: true },
  // 池
  { n: "lily", x: POND.x - 24, y: POND.y + 4, s: 8 },
  { n: "lily", x: POND.x + 26, y: POND.y + 10, s: 7 },
  { n: "bridge", x: 872, y: 716, s: 22 },
];

/** 場所のそばに手で置く飾り。種類はスプライトと同じでも、描き方はベクター。 */
const DRESS_DECO: Deco[] = [
  { k: "stump", x: P.kitchen.x + 52, y: P.kitchen.y + 20, s: 20 },
  { k: "shroom", x: P.kitchen.x + 74, y: P.kitchen.y + 34, s: 16 },
  { k: "bush", x: P.next.x - 44, y: P.next.y + 14, s: 20 },
  { k: "rock", x: 300, y: 906, s: 12 },
  { k: "rock", x: POND.x + 56, y: POND.y + 16, s: 16 },
];

/** 木のふち飾り。浜に近い外周はヤシ、内側は広葉樹。 */
const shoreTrees: Item[] = (() => {
  const r = rng(9901);
  const out: Item[] = [];
  for (let i = 0; i < 26; i++) {
    const t = i / 26 + (r() - 0.5) * 0.012;
    const [x, y] = pointAt(ISLAND.cx, ISLAND.cy, grassR, ISLAND.squash, t, 6 + r() * 16);
    if (PLACES.some((s) => Math.hypot(s.x - x, s.y - y) < 92)) continue;
    const palm = y > ISLAND.cy - 40 && r() < 0.55;
    out.push({
      n: palm ? "tree-palm" : r() < 0.34 ? "tree-fat" : r() < 0.6 ? "tree-round" : "tree-tall",
      x,
      y,
      s: (palm ? 96 : 88) + r() * 26,
      flip: r() < 0.5,
    });
  }
  return out;
})();

/** 島の中の散らし。道と建物を避けて置く。 */
function scatter(
  count: number,
  seed: number,
  radii: number[],
  margin: number,
  pick: (r: () => number) => Item | null,
  spread = 46,
) {
  const r = rng(seed);
  const out: Item[] = [];
  let guard = 0;
  while (out.length < count && guard++ < count * 80) {
    const x = ISLAND.cx + (r() - 0.5) * 900;
    const y = ISLAND.cy + (r() - 0.5) * 840;
    if (!insideRadii(ISLAND.cx, ISLAND.cy, radii, x, y, ISLAND.squash, margin)) continue;
    if (PLACES.some((s) => Math.hypot(s.x - x, s.y - y) < 78)) continue;
    if (Math.hypot(POND.x - x, (POND.y - y) * 1.8) < 84) continue;
    if (out.some((p) => Math.hypot(p.x - x, p.y - y) < spread)) continue;
    const it = pick(r);
    if (!it) continue;
    out.push({ ...it, x, y });
  }
  return out;
}

const innerTrees = scatter(
  15,
  20260904,
  inset(grassR, 60),
  10,
  (r) => ({
    n: r() < 0.3 ? "tree-round" : r() < 0.55 ? "tree-fat" : r() < 0.78 ? "tree-tall" : "tree-thin",
    x: 0,
    y: 0,
    s: 80 + r() * 24,
    flip: r() < 0.5,
  }),
  120,
);

/**
 * 低木・石・切り株の散らし。
 *
 * ここはベクターで描く（上の「小さな飾り」を見よ）。置き場所の決め方は
 * 木と同じなので、scatter をそのまま使って、あとから種類を読み替える。
 */
const shrubs: Deco[] = scatter(
  30,
  4477,
  grassR,
  22,
  (r) => {
    const k = r();
    if (k < 0.34) return { n: "bush", x: 0, y: 0, s: 22 + r() * 8 };
    if (k < 0.62) return { n: "bush-small", x: 0, y: 0, s: 17 + r() * 6 };
    if (k < 0.86) return { n: "rock", x: 0, y: 0, s: 16 + r() * 8 };
    return { n: "stump", x: 0, y: 0, s: 17 };
  },
  62,
).map((it) => ({
  k: (it.n === "rock" ? "rock" : it.n === "stump" ? "stump" : "bush") as DecoKind,
  x: it.x,
  y: it.y,
  s: it.n === "bush-small" ? it.s * 0.9 : it.s,
}));

/** 高台の上は針葉樹と岩。 */
const plateauItems: Item[] = (() => {
  const r = rng(313);
  const out: Item[] = [];
  const top = { ...PLATEAU, cy: PLATEAU.cy - PLATEAU.drop };
  for (let i = 0; i < 14; i++) {
    const t = r();
    const [x, y] = pointAt(top.cx, top.cy, top.radii, top.squash, t, 16 + r() * 46);
    if (Math.hypot(P.legends.x - x, P.legends.y - y) < 96) continue;
    if (out.some((p) => Math.hypot(p.x - x, p.y - y) < 46)) continue;
    const k = r();
    out.push({
      n: k < 0.5 ? "tree-pine" : k < 0.78 ? "tree-pine-tall" : "rock-tall",
      x,
      y,
      s: k < 0.78 ? 78 + r() * 26 : 34,
      flip: r() < 0.5,
    });
  }
  return out;
})();

/** 浜辺の岩。波打ち際に置くと島の縁が締まる。 */
const shoreRocks: Deco[] = (() => {
  const r = rng(555);
  const out: Deco[] = [];
  for (let i = 0; i < 14; i++) {
    const t = r();
    const [x, y] = pointAt(ISLAND.cx, ISLAND.cy, sandR, ISLAND.squash, t, -6 + r() * 22);
    if (out.some((p) => Math.hypot(p.x - x, p.y - y) < 60)) continue;
    out.push({ k: "rock", x, y, s: 14 + r() * 16 });
  }
  return out;
})();

/* ------------------------------------------------------------------ */
/* 土の道                                                              */
/* ------------------------------------------------------------------ */

/**
 * 場所と場所をつなぐ道。
 *
 * 前は飛び石のスプライトを 42px おきに並べていて、これだけで <image> が
 * 60枚を超えていた。カメラを動かすと SVG ぜんぶを描き直すので、
 * 小さな絵が何十枚もあるだけで起動直後が目に見えてカクつく。
 *
 * 見た目は「踏み固めた土の帯＋その上の石」なので、
 *   ・土の帯 … 全ルートを1本の d にまとめて、太さの違う線で2回引く
 *   ・石     … 楕円を明暗2本のパスにまとめる
 * で描く。要素は4つで済み、絵としてはむしろ道らしくなる。
 */
type Route = { a: Pt; b: Pt; bend: number };

const foot = (id: SpotId, dy = 16): Pt => [P[id].x, P[id].y + dy];

const ROUTES: Route[] = [
  { a: foot("streams", 34), b: foot("kitchen"), bend: 30 },
  { a: foot("streams", 34), b: foot("apps"), bend: -32 },
  { a: foot("streams", 34), b: foot("board", 8), bend: 24 },
  { a: foot("streams", 34), b: foot("now", 10), bend: -16 },
  { a: foot("now", 10), b: foot("next", 10), bend: 20 },
  { a: foot("kitchen"), b: foot("map", 6), bend: -18 },
  { a: foot("apps"), b: foot("friends", 10), bend: 24 },
  // 丘の館は高台の上。道を丘の上まで引くと、崖の面に土が塗られたように見える。
  // 崖のふもとで止めて、そこから上は登るものとして残す。
  { a: foot("friends", 10), b: [PLATEAU.cx + 2, PLATEAU.cy + 100], bend: -26 },
];

/** ルートの中央の制御点。曲げないと格子になって、島が公園に見える。 */
function control({ a, b, bend }: Route): Pt {
  const nx = -(b[1] - a[1]);
  const ny = b[0] - a[0];
  const len = Math.hypot(nx, ny) || 1;
  return [(a[0] + b[0]) / 2 + (nx / len) * bend, (a[1] + b[1]) / 2 + (ny / len) * bend];
}

/** 土の帯。全ルートを1本の d にまとめる。 */
const TRAIL_D = ROUTES.map((rt) => {
  const c = control(rt);
  const f = (n: number) => n.toFixed(1);
  return `M${f(rt.a[0])},${f(rt.a[1])}Q${f(c[0])},${f(c[1])} ${f(rt.b[0])},${f(rt.b[1])}`;
}).join("");

/** 道の上かどうかを見るための等間隔の点。飾りを道の上に置かないために使う。 */
const TRAIL_PTS: Pt[] = ROUTES.flatMap((rt) => {
  const c = control(rt);
  const n = Math.max(6, Math.round(Math.hypot(rt.b[0] - rt.a[0], rt.b[1] - rt.a[1]) / 24));
  return Array.from({ length: n + 1 }, (_, i) => {
    const t = i / n;
    const u = 1 - t;
    return [
      u * u * rt.a[0] + 2 * u * t * c[0] + t * t * rt.b[0],
      u * u * rt.a[1] + 2 * u * t * c[1] + t * t * rt.b[1],
    ] as Pt;
  });
});

/** 道の上の石。明るい面と、右下の影の2本。 */
const TRAIL_STONES = (() => {
  const r = rng(2025);
  let top = "";
  let shade = "";
  for (const rt of ROUTES) {
    const c = control(rt);
    const len = Math.hypot(rt.b[0] - rt.a[0], rt.b[1] - rt.a[1]);
    const steps = Math.max(4, Math.round(len / 30));
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const u = 1 - t;
      // 道の中心から少しずらす。真ん中に一列だと縫い目に見える
      const off = (r() - 0.5) * 15;
      const x = u * u * rt.a[0] + 2 * u * t * c[0] + t * t * rt.b[0] + off;
      const y = u * u * rt.a[1] + 2 * u * t * c[1] + t * t * rt.b[1] + (r() - 0.5) * 9;
      const rx = 5.5 + r() * 3.5;
      const ry = rx * (0.52 + r() * 0.16);
      shade += oval(x + 1.2, y + 1.6, rx, ry);
      top += oval(x, y, rx, ry);
    }
  }
  return { top, shade };
})();

/* ------------------------------------------------------------------ */
/* 地面の飾り                                                          */
/* ------------------------------------------------------------------ */

/**
 * 草地に置く場所を、重ならないように選ぶ。
 * 建物・入口のまわり 92 と、道の上には置かない。押す場所を飾りで隠さないため。
 */
function groundSpots(count: number, seed: number, gap: number, avoid: { x: number; y: number }[]) {
  const r = rng(seed);
  const out: { x: number; y: number; r: () => number }[] = [];
  const pts: Pt[] = [];
  let guard = 0;
  while (pts.length < count && guard++ < count * 220) {
    const x = ISLAND.cx + (r() - 0.5) * 940;
    const y = ISLAND.cy + (r() - 0.5) * 880;
    if (!insideRadii(ISLAND.cx, ISLAND.cy, grassR, x, y, ISLAND.squash, 14)) continue;
    if (PLACES.some((s) => Math.hypot(s.x - x, s.y - y) < 92)) continue;
    if (Math.hypot(POND.x - x, (POND.y - y) * 1.8) < 78) continue;
    // 高台の足元。ここに置くと、崖の下に花が咲いているように見える
    if (insideRadii(PLATEAU.cx, PLATEAU.cy, PLATEAU.radii, x, y, PLATEAU.squash, -26)) continue;
    if (insideRadii(PLATEAU.cx, PLATEAU.cy - PLATEAU.drop, PLATEAU.radii, x, y, PLATEAU.squash, -26)) continue;
    if (TRAIL_PTS.some((p) => Math.hypot(p[0] - x, p[1] - y) < 26)) continue;
    if (pts.some((p) => Math.hypot(p[0] - x, p[1] - y) < gap)) continue;
    if (avoid.some((p) => Math.hypot(p.x - x, p.y - y) < 22)) continue;
    pts.push([x, y]);
    out.push({ x, y, r });
  }
  return out;
}

/**
 * 花。
 *
 * 前はスプライトを1輪ずつ置いていて、これだけで <image> が40枚あった。
 * 上から見た花は「丸い花びら5枚と芯」でしかないので、ベクターで描いて
 * 色ごとに1本のパスへまとめる。40枚の画像が5本のパスになる。
 *
 * 色は本物の花壇に合わせて、白・黄・赤・紫の4色。
 */
const FLOWER_COLORS = ["#ffffff", "#ffd93f", "#f4595f", "#b47bea"];
const flowers = (() => {
  const petals = ["", "", "", ""];
  let cores = "";
  let shade = "";
  for (const sp of groundSpots(46, 770311, 26, shrubs)) {
    const k = Math.floor(sp.r() * 4);
    const s = 11 + sp.r() * 5;
    const rot = sp.r() * Math.PI * 2;
    shade += oval(sp.x + 1, sp.y + 1.5, s * 0.42, s * 0.22);
    for (let i = 0; i < 5; i++) {
      const a = rot + (i / 5) * Math.PI * 2;
      petals[k] += oval(sp.x + Math.cos(a) * s * 0.31, sp.y + Math.sin(a) * s * 0.26, s * 0.25, s * 0.21);
    }
    cores += oval(sp.x, sp.y, s * 0.15, s * 0.13);
  }
  return { petals, cores, shade };
})();

/** 草むら。パターンより一段大きい株を散らして、地面に高さの差を作る。 */
const tufts = (() => {
  let hi = "";
  let lo = "";
  for (const sp of groundSpots(54, 55021, 24, shrubs)) {
    const d = bladeClump(sp.x, sp.y, 1.2 + sp.r() * 1.1, (sp.r() - 0.5) * 2.4, 3 + Math.floor(sp.r() * 3), sp.r);
    if (sp.r() < 0.5) hi += d;
    else lo += d;
  }
  return { hi, lo };
})();

/** 小石ときのこ。草地のいちばん細かい飾り。 */
const groundDetail: Deco[] = groundSpots(22, 8802211, 34, shrubs).map((sp) => {
  const k = sp.r();
  return {
    k: (k < 0.62 ? "rock" : k < 0.82 ? "shroom" : "stump") as DecoKind,
    x: sp.x,
    y: sp.y,
    s: k < 0.62 ? 9 + sp.r() * 5 : k < 0.82 ? 10 + sp.r() * 4 : 14,
  };
});

/**
 * 木の根元と道ぎわの土。
 * 一面の緑にわずかな土色が混じるだけで、地面が「ただの塗り」でなくなる。
 */
const soilPatches = (() => {
  const r = rng(31771);
  let d = "";
  for (const sp of groundSpots(26, 60613, 70, [])) {
    const rx = 22 + r() * 30;
    d += oval(sp.x, sp.y, rx, rx * (0.42 + r() * 0.2));
  }
  return d;
})();

/**
 * 浜に打ち上がるもの。砂の帯だけが無地だと、岸が板に見える。
 * 濡れた砂の帯を避けて、乾いた砂の側に置く。
 */
const beachDetail = (() => {
  const r = rng(4130);
  const deco: Deco[] = [];
  const logs: Item[] = [];
  for (let i = 0; i < 20; i++) {
    const t = (i + r() * 0.8) / 20;
    const [x, y] = pointAt(ISLAND.cx, ISLAND.cy, sandR, ISLAND.squash, t, 17 + r() * 13);
    if (PLACES.some((s) => Math.hypot(s.x - x, s.y - y) < 92)) continue;
    if (deco.some((p) => Math.hypot(p.x - x, p.y - y) < 34) || logs.some((p) => Math.hypot(p.x - x, p.y - y) < 34)) continue;
    const k = r();
    // 流木だけはスプライトのまま。数が少ないうえ、形がベクターだと出しにくい
    if (k >= 0.88) logs.push({ n: "log", x, y, s: 9 + r() * 4, flip: r() < 0.5, still: true });
    else deco.push({ k: k < 0.72 ? "rock" : "tuft", x, y, s: k < 0.72 ? 8 + r() * 6 : 12 + r() * 5 });
  }
  return { deco, logs };
})();

/**
 * 夜にともる灯り。[x, y, 半径]。
 * 島の絵に混ぜると時間帯の色かぶせに沈むので、その上の層で描く。
 */
export const LAMPS: [number, number, number][] = [
  [P.friends.x, P.friends.y - 10, 104],
  [P.board.x + 74, P.board.y - 36, 60],
  [P.now.x, P.now.y - 32, 52],
  [P.kitchen.x + 14, P.kitchen.y - 30, 70],
  [P.apps.x + 12, P.apps.y - 30, 70],
  [P.streams.x + 4, P.streams.y - 80, 72],
  [P.legends.x + 8, P.legends.y - 28, 72],
];

/**
 * 島に置いてある物。手前(y が大きい)ほど後に描く。
 * 住人やあやとと重ね順を混ぜたいので、絵ではなく配列のまま外へ出す。
 */
/**
 * 飾りを2組に焼き分ける。砂の上と草の上とで、影に混ぜる色が違うため。
 * 砂に緑がかった影を落とすと、そこだけ黴（かび）が生えたように見える。
 */
const SAND_DECO = bakeDeco([...shoreRocks, ...beachDetail.deco], 5501);
const GRASS_DECO = bakeDeco([...shrubs, ...groundDetail, ...DRESS_DECO], 5502);

export const PROPS: Item[] = [
  ...shoreTrees,
  ...plateauItems,
  ...innerTrees,
  ...beachDetail.logs,
  ...BUILDINGS,
  ...DRESSING,
]
  /**
   * そよ風。
   *
   * 前は木も草も全部揺らしていて、揺れる <g> が73個あった。SVG の中で
   * 画像を回すと、そのたびに画素を取り直すことになる。しかもカメラが動くと
   * SVG ぜんぶを描き直すので、そこに73個の回転が重なって起動直後が落ちていた。
   *
   * 風は本来まだらに吹くものなので、大きな木を3本に1本だけ揺らす。
   * 見た目はむしろ自然になって、揺れる要素は5分の1で済む。
   */
  .map((p, i) => (SWAYS.test(p.n) && !p.still && p.s >= 60 && i % 3 === 0 ? { ...p, sway: (i % 13) * 0.36 } : p))
  .sort((a, b) => a.y - b.y);

/**
 * 島の地形と飾り。
 *
 * ここが返すものは、いつ描いても同じ。なのに札を開いたり住人に話しかけたりする
 * たびに、親（IslandStage）の状態が変わって、この 300 要素ぶんを作り直していた。
 * memo で包むと、親が何回描き直しても、ここは1回で済む。
 */
function IslandScene() {
  return (
    <>
      <defs>
        {/* 海。
            前は輪を何枚も重ねて沖から明るくしていたが、輪ごとに縁が立って
            的（まと）のような同心円が見えていた。公式の海は「濃い青一色に、
            岸のすぐそばだけターコイズ」なので、下地はグラデーション1枚にして
            島のまわりだけをほんのり明るくする。輪が2枚減るぶん軽くもなる。 */}
        <radialGradient
          id="seaG"
          gradientUnits="userSpaceOnUse"
          cx={CX}
          cy={CY}
          r={880}
          gradientTransform={`translate(${CX} ${CY}) scale(1 ${SQ}) translate(${-CX} ${-CY})`}
        >
          <stop offset="0.44" stopColor="var(--sea-mid)" />
          <stop offset="0.62" stopColor="var(--sea-deep)" />
          {/* 沖ほど深い。前は濃い青の層をもう1枚かぶせていたが、それだと
              画面いっぱいの面をもう一度塗ることになる。同じ絵は、この
              グラデーションの外側の止め色を濃くするだけで出せる。 */}
          <stop offset="1" stopColor={SEA_ABYSS} />
        </radialGradient>
        {/* 空。本物は上ほど濃い青で、水平線ぎわが明るい */}
        <linearGradient id="skyG" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={SKY_HI} />
          <stop offset="0.72" stopColor={SKY_MID} />
          <stop offset="1" stopColor={SKY_LO} />
        </linearGradient>
        <radialGradient id="grassG" cx="38%" cy="28%">
          <stop offset="0" stopColor="var(--grass-hi)" />
          <stop offset="1" stopColor="var(--grass)" />
        </radialGradient>
        <radialGradient id="grass2G" cx="38%" cy="24%">
          <stop offset="0" stopColor="var(--grass2-hi)" />
          <stop offset="1" stopColor="var(--grass2)" />
        </radialGradient>
        <linearGradient id="cliffG" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--cliff)" />
          <stop offset="1" stopColor="var(--cliff-lo)" />
        </linearGradient>
        {/* 草の地模様。葉を1枚ずつ置かず、タイル1枚を敷いて済ませる。 */}
        <pattern id="grassTex" width={GRASS_TILE.size} height={GRASS_TILE.size} patternUnits="userSpaceOnUse">
          {/* 濃さの配分は公式の実測どおり。暗い三角が主役で、明るいほうは添えるだけ。
              前は逆（明 0.5 / 暗 0.32）で、芝が白茶けて見えていた。 */}
          <path d={GRASS_TILE.lo} fill="var(--grass-lo)" opacity="0.56" />
          <path d={GRASS_TILE.hi} fill="var(--grass-hi)" opacity="0.26" />
          <path d={GRASS_TILE.dry} fill={GRASS_DRY} opacity="0.5" />
        </pattern>
        <clipPath id="grassClip">
          <path d={grassPath} />
        </clipPath>

      </defs>

      {/* ------- 海 ------- */}
      <rect x={-500} y={-500} width={WORLD + 1000} height={WORLD + 1000} fill="url(#seaG)" />

      {/* 水面の白いかたまり。海が塗りに見えないように、大小2種を撒いてある。

          **明滅は外した。** 島の SVG の中で何かを動かすと、その要素の
          外接矩形ぶんが毎フレーム描き直される。この6本は島をぐるりと囲む
          形なので、外接矩形は**画面ぜんぶ**になる。海が画面の1割しか
          写っていなくても、1割ではなく10割ぶんの代金を払っていた。

          実測（1440×900・歩かせて6秒・絞りなし・4往復の中央値）:

            いまのまま                      12.2 fps
            きらめきを止める                19.2 fps
            沖のうねり(swell)を止める        15.5 fps
            **両方止める                    33.8 fps**

          うねりのほうは消した。白 7.5% の輪を3本、島の外に広げていたもので、
          止めても消しても数字が同じ（32.7 / 33.8 fps）＝**見えていなかった**。
          きらめきは見える（濃さが 0.175 ↔ 0.5 で振れる）ので、形は残して
          動きだけ止めた。海の動きは波打ち際のレース（.surf）と舟とカモメが持つ。
          あれらは外接矩形が小さいので、動かしても代金がつかない。

          **ここに動くものを足すときは、その形の外接矩形を先に見ること。**
          小さいものは何個動かしても無料で、島をまたぐものは1個で 20fps 持っていく。 */}
      <g className="sea-glint" fill="#ffffff" aria-hidden>
        {seaBlobs.map((d, i) => (
          <path key={`b${i}`} d={d} opacity={SEA_OPACITY[i] * 0.72} />
        ))}
        {seaStreaks.map((d, i) => (
          <path key={`s${i}`} d={d} opacity={SEA_OPACITY[i] * 0.8 * 0.72} />
        ))}
      </g>

      {/* ------- 空と水平線 -------
          世界の北のはしから向こうを空にする。上の SKY_Y の注を見る。 */}
      <g aria-hidden>
        <rect x={-500} y={-500} width={WORLD + 1000} height={SKY_Y + 500} fill="url(#skyG)" />
        {CLOUDS.map(([cx, cy, k], i) => (
          <g key={i} transform={`translate(${cx} ${cy}) scale(${k})`} fill={CLOUD} opacity={0.7}>
            <ellipse cx={-52} cy={16} rx={54} ry={26} />
            <ellipse cx={30} cy={18} rx={62} ry={24} />
            <ellipse cx={-8} cy={-8} rx={48} ry={34} />
          </g>
        ))}
        {/* 水平線。線を引かずに、際をひと筋明るくして境目を作る。
            線を引くと輪郭になる（`island-design.md` 2章-1「輪郭線を引かない」）。 */}
        <rect x={-500} y={SKY_Y - 9} width={WORLD + 1000} height={18} fill={CLOUD} opacity={0.8} />
        <rect x={-500} y={SKY_Y + 9} width={WORLD + 1000} height={34} fill={SKY_LO} opacity={0.45} />
      </g>
      {/* ------- 浅瀬。岸のすぐそばだけ。
          深い青からいきなり浅瀬に変わると、島に輪がはまって見える。
          あいだに2枚だけ挟んで、段差を目立たなくする。 ------- */}
      <path d={fade1Path} fill={SEA_FADE1} />
      <path d={fade2Path} fill={SEA_FADE2} />
      <path d={shallowPath} fill={SEA_SHALLOW} />
      <path d={shelfPath} fill={SEA_SHELF} />
      {/* 沖に頭を出している岩。水面に何か無いと、海が塗りに見える。 */}
      <g aria-hidden>
        <path d={seaRocks.wash} fill="var(--foam)" opacity="0.5" />
        <path d={seaRocks.under} fill={SHADOW} opacity="0.24" />
        <path d={seaRocks.body} fill="#8d9aa0" />
        <path d={seaRocks.top} fill="#c3ccd0" />
      </g>

      {/* ------- 島 ------- */}
      {/* 影。feGaussianBlur は面積に比例して重くなるので使わない。
          ずらした写しを重ねてぼかしの代わりにしていたが、島ぜんぶを塗る面が
          4枚あることになる。カメラは毎フレーム動くので、そのたび4回塗り直していた。
          外へ広がるぶんは「同じ形を太い線でなぞる」だけで作れるので、塗りは1枚で済む。 */}
      <g aria-hidden>
        <path d={sandPath} transform="translate(0 22)" fill="none" stroke={SHADOW} strokeOpacity="0.07" strokeWidth="26" />
        <path d={sandPath} transform="translate(0 13)" fill={SHADOW} opacity="0.18" />
      </g>
      <g>
        <path d={sandPath} fill="var(--sand)" />
        {/* 濡れた砂は波打ち際の側。内側に敷くと逆になる。 */}
        <path d={wetRing} fill={SAND_WET} fillRule="evenodd" />
        <path d={wetEdgeRing} fill="var(--sand-edge)" fillRule="evenodd" opacity="0.55" />
        {/* 砂粒と、波が上がりきったところに残る弧の跡。砂が板に見えなくなる。 */}
        <g aria-hidden>
          <path d={beachGrains[0]} fill="var(--sand-edge)" opacity="0.34" />
          <path d={beachGrains[1]} fill="#ffffff" opacity="0.3" />
          {tideMarks.map((d, i) => (
            <path
              key={`tm${i}`}
              d={d}
              fill="none"
              stroke="var(--sand-edge)"
              strokeWidth={2.4 - i * 0.6}
              strokeOpacity={0.3 - i * 0.07}
              strokeLinecap="round"
            />
          ))}
        </g>
        {/* 草の落とす影。砂が草に接するところを締める。 */}
        <path d={grassPath} fill="none" stroke="var(--sand-edge)" strokeOpacity="0.45" strokeWidth="4.5" />
        <path d={grassPath} fill="url(#grassG)" />
      </g>

      {/* ------- 泡。島の上に重ねて、砂の縁にかぶせる -------
          「寄せた波」と「引いた波」の2組を交互に濃くする。動かすのは opacity だけ。 */}
      <g fill="var(--foam)" aria-hidden>
        <path d={foamHaze} fillRule="evenodd" opacity="0.24" />
        <path d={foamBand} fillRule="evenodd" opacity="0.68" />
        <path d={foamDots[0]} opacity="0.72" />
        <path d={foamDots[1]} opacity="0.42" />
      </g>
      <g fill="none" stroke="var(--foam)" strokeLinecap="round" aria-hidden>
        <g className="surf surf-back">
          {LACE_BACK.map((d, i) => (
            <path key={`fb${i}`} d={d} strokeWidth={LACE_STYLE[i][0]} strokeOpacity={LACE_STYLE[i][1]} />
          ))}
        </g>
        <g className="surf surf-front">
          {LACE_FRONT.map((d, i) => (
            <path key={`ff${i}`} d={d} strokeWidth={LACE_STYLE[i][0]} strokeOpacity={LACE_STYLE[i][1]} />
          ))}
        </g>
      </g>

      {/* ------- 浜の飾り -------
          泡のあとに置く。波が石の足元まで来ているように見える。 */}
      <DecoLayer p={SAND_DECO} shade={SHADE_SAND} />

      {/* ------- 草地 ------- */}
      <path d={grassPath} fill="none" stroke="#ffffff" strokeOpacity="0.26" strokeWidth="5" strokeDasharray="240 460" strokeDashoffset="-40" />
      <g clipPath="url(#grassClip)">
        <path d={blob(CX, CY + 15, grassR, SQ)} fill="none" stroke={SHADOW} strokeOpacity="0.12" strokeWidth="18" />
        <ellipse cx={430} cy={752} rx={158} ry={74} fill="var(--grass-hi)" opacity="0.3" />
        <ellipse cx={824} cy={846} rx={136} ry={60} fill="var(--grass-lo)" opacity="0.16" />
        <ellipse cx={620} cy={556} rx={120} ry={52} fill="var(--grass-hi)" opacity="0.22" />
        {/* 草の地模様。更地の面をなくす。タイル1枚なので、塗るのも1回で済む。 */}
        <rect x={CX - 480} y={CY - 460} width={960} height={920} fill="url(#grassTex)" />
        {/* 土の混じるところ。緑一色の面をなくす。 */}
        <path d={soilPatches} fill="var(--sand-wet)" opacity="0.2" />
      </g>

      {/* ------- 高台 ------- */}
      <g>
        <path d={blob(PLATEAU.cx, PLATEAU.cy + 12, PLATEAU.radii, PLATEAU.squash)} fill={SHADOW} opacity="0.2" />
        <path d={cliff.band} fill="url(#cliffG)" />
        <g opacity="0.28" stroke="var(--cliff-line)" strokeWidth="2.6" strokeLinecap="round">
          {cliff.lines.map(([lx, ly], i) =>
            i % 2 === 0 ? <line key={i} x1={lx} y1={ly + 5} x2={lx + 2} y2={ly + PLATEAU.drop - 3} /> : null,
          )}
        </g>
        <path d={plateauTopPath} fill="url(#grass2G)" />
        <path d={plateauTopPath} fill="none" stroke="#ffffff" strokeOpacity="0.4" strokeWidth="4" strokeDasharray="130 300" />
        <path d={plateauTopPath} fill="none" stroke="var(--grass-lo)" strokeOpacity="0.5" strokeWidth="2.5" />
      </g>

      {/* ------- 川と池 ------- */}
      <g>
        <path d={RIVER} fill="none" stroke="var(--sea-shallow)" strokeWidth="28" strokeLinecap="round" />
        <path d={RIVER} fill="none" stroke="var(--sea-shelf)" strokeWidth="17" strokeLinecap="round" />
        <path d={RIVER} fill="none" stroke="#e8fbff" strokeWidth="6" strokeLinecap="round" opacity="0.6" />
        <ellipse cx={POND.x} cy={POND.y} rx={POND.rx} ry={POND.ry} fill="var(--sea-shallow)" />
        <ellipse cx={POND.x} cy={POND.y - 3} rx={POND.rx - 13} ry={POND.ry - 10} fill="var(--sea-shelf)" />
        <ellipse cx={POND.x - 14} cy={POND.y - 8} rx={20} ry={7} fill="#e8fbff" opacity="0.55" />
      </g>

      {/* ------- 土の道と、その上の石 -------
          飛び石のスプライトを60枚並べるのをやめて、線1本と楕円2本にした。 */}
      <g className="trail" aria-hidden>
        <path d={TRAIL_D} fill="none" stroke="var(--sand-edge)" strokeOpacity="0.42" strokeWidth="34" strokeLinecap="round" />
        <path d={TRAIL_D} fill="none" stroke="var(--sand-wet)" strokeOpacity="0.82" strokeWidth="26" strokeLinecap="round" />
        <path d={TRAIL_STONES.shade} fill="var(--sand-edge)" opacity="0.5" />
        <path d={TRAIL_STONES.top} fill="var(--sand)" opacity="0.9" />
      </g>

      {/* ------- 草むらと花 -------
          スプライトで置くと <image> が90枚を超えるので、色ごとにまとめて描く。 */}
      <g className="ground" aria-hidden>
        <path d={tufts.lo} fill="var(--grass-lo)" opacity="0.72" />
        <path d={tufts.hi} fill="var(--grass-hi)" opacity="0.85" />
        <path d={flowers.shade} fill={SHADOW} opacity="0.2" />
        {flowers.petals.map((d, i) => (
          <path key={`fl${i}`} d={d} fill={FLOWER_COLORS[i]} />
        ))}
        <path d={flowers.cores} fill="#ffd24a" />
      </g>
      {/* 低木・石・切り株・きのこ。スプライト80枚を、色ごとの11本のパスにした。 */}
      <DecoLayer p={GRASS_DECO} shade={SHADE_GRASS} />

      {/* ------- 沖を行く舟と、空のカモメ ------- */}
      {/* CSS の animation は transform 属性を上書きしてしまうので、
          置き場所は外側の g で決めて、動きは内側の g に持たせる。 */}
      <g transform="translate(-260 208)" aria-hidden>
        <g className="boat">
          <ellipse cx={0} cy={7} rx={26} ry={6} fill={SHADOW} opacity={0.18} />
          <path d="M-26 0 q26 16 52 0 q-7 11 -26 11 q-19 0 -26 -11Z" fill="#f0798d" />
          <path d="M-26 0 q26 16 52 0 q-4 4 -8 6 q-18 5 -36 0 q-4 -2 -8 -6Z" fill="#fff" opacity={0.22} />
          <rect x={-2} y={-26} width={4} height={26} rx={2} fill="#c98d55" />
          <path d="M2 -25 L24 -5 L2 -5 Z" fill="#fffdf6" />
        </g>
      </g>
      {[
        [70, 380, 1, 0],
        [1120, 470, 0.82, 13],
        [40, 900, 0.7, 24],
      ].map(([gx, gy, k, delay], i) => (
        <g key={i} transform={`translate(${gx} ${gy}) scale(${k})`} aria-hidden>
          <g className="skygull" style={{ animationDelay: `${delay}s` }}>
            <path d="M-17 0 q9 -10 17 0 q8 -10 17 0 q-9 -4 -17 3 q-8 -7 -17 -3Z" fill="#fffdf6" opacity={0.85} />
          </g>
        </g>
      ))}

      {/* ------- ちょうちょ ------- */}
      <g className="bugs" aria-hidden>
        {[
          [420, 690, 0, "#ffd35e"],
          [700, 620, 3.1, "#ffffff"],
          [560, 830, 6.2, "#c79bff"],
          [860, 760, 9.4, "#ff9fb6"],
        ].map(([bx, by, delay, color], i) => (
          <g key={i} className="bug" style={{ animationDelay: `${delay}s` }} transform={`translate(${bx} ${by})`}>
            <g className="bug-wing">
              <ellipse cx={-6} cy={-2} rx={6} ry={8} fill={color as string} />
              <ellipse cx={6} cy={-2} rx={6} ry={8} fill={color as string} />
              <ellipse cx={-6} cy={-5} rx={3} ry={3.4} fill="#ffffff" opacity={0.45} />
              <ellipse cx={6} cy={-5} rx={3} ry={3.4} fill="#ffffff" opacity={0.45} />
              <ellipse cx={0} cy={0} rx={1.8} ry={7} fill="#5b4630" />
            </g>
          </g>
        ))}
      </g>

      {/* ------- 桟橋 ------- */}
      <g>
        <ellipse cx={236} cy={882} rx={68} ry={17} fill={SHADOW} opacity={0.2} />
        <g transform="rotate(24 250 866)">
          <rect x={168} y={852} width={172} height={30} rx={7} fill="#d0a068" />
          <rect x={168} y={852} width={172} height={8} rx={4} fill="#e6bb87" />
          {Array.from({ length: 7 }, (_, i) => (
            <rect key={i} x={176 + i * 24} y={852} width={4} height={30} fill="#a9713d" opacity={0.45} />
          ))}
        </g>
      </g>
    </>
  );
}

export default memo(IslandScene);
