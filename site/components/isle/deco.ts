/**
 * 地面の細かい飾り。**ベクターで描いて、色ごとに1本のパスへまとめる。**
 *
 * いまの島（`components/island/IslandScene.tsx`）が同じことをしている。
 * 花を1輪ずつスプライトで置くと、それだけで `<image>` が40枚になる。
 * 上から見た花は「丸い花びら5枚と芯」でしかないので、ベクターで描いて
 * 色ごとにまとめれば、40枚が5本のパスになる。
 * **要素の数は減るのに、地面の密度は上がる。**
 *
 * あちらの `bakeDeco` は `IslandScene.tsx` の中に閉じていて外から呼べない
 * （あのファイルは触らない約束）。同じ考えでここに書き直したもの。
 *
 * 色は `app/css/chain.css` の `.id-*`。CSS 変数から取るので、
 * 中東の島では乾いた色、北欧の島では寒い色になる。
 */

import { rng } from "@/components/island/geometry";

export type DecoKind = "rock" | "bush" | "tuft" | "shroom" | "stump";
export type Deco = { k: DecoKind; x: number; y: number; s: number };

/** 色ごとのバケツ。塗る色が同じものは、何個あっても1本のパスに入る */
export type DecoPaths = {
  shade: string;
  rock: string;
  rockLit: string;
  bush: string;
  bushHi: string;
  tuft: string;
  stump: string;
  stumpTop: string;
  cap: string;
};

const f = (v: number) => v.toFixed(1);

/** 楕円を1本のパスコマンドで。`<ellipse>` を並べるより文字数が少ない */
export function oval(x: number, y: number, rx: number, ry: number): string {
  return `M${f(x - rx)},${f(y)}a${f(rx)},${f(ry)} 0 1,0 ${f(rx * 2)},0a${f(rx)},${f(ry)} 0 1,0 ${f(-rx * 2)},0Z`;
}

/** 多角形。石は真円にしない（削った面があるほうが石に見える） */
function facet(x: number, y: number, rx: number, ry: number, n: number, r: () => number): string {
  let d = "";
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const k = 0.78 + r() * 0.36;
    d += `${i ? "L" : "M"}${f(x + Math.cos(a) * rx * k)},${f(y + Math.sin(a) * ry * k)}`;
  }
  return d + "Z";
}

/** 草の株。葉を数枚、根元から扇に開く */
function blades(x: number, y: number, s: number, lean: number, n: number, r: () => number): string {
  let d = "";
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 0 : i / (n - 1) - 0.5;
    const h = (7 + r() * 7) * s;
    const w = (1.5 + r() * 1) * s;
    const bx = x + t * 3.4 * s;
    const tipx = bx + t * 5 * s + lean * s;
    d +=
      `M${f(bx - w / 2)},${f(y)}` +
      `Q${f(bx + t * 2 * s)},${f(y - h * 0.6)} ${f(tipx)},${f(y - h)}` +
      `Q${f(bx + t * 2 * s + w * 0.5)},${f(y - h * 0.55)} ${f(bx + w / 2)},${f(y)}Z`;
  }
  return d;
}

/**
 * 飾りをまとめて焼く。
 *
 * 影は必ず入れる。**接地影が無いと、物が地面から浮く**
 * （`docs/island-design.md` 2章の3）。
 */
export function bakeDeco(list: Deco[], seed: number): DecoPaths {
  const r = rng(seed);
  const p: DecoPaths = {
    shade: "",
    rock: "",
    rockLit: "",
    bush: "",
    bushHi: "",
    tuft: "",
    stump: "",
    stumpTop: "",
    cap: "",
  };
  for (const it of list) {
    const { x, y, s } = it;
    if (it.k === "rock") {
      p.shade += oval(x + s * 0.1, y + s * 0.08, s * 0.62, s * 0.26);
      p.rock += facet(x, y - s * 0.28, s * 0.56, s * 0.42, 6, r);
      p.rockLit += facet(x - s * 0.1, y - s * 0.42, s * 0.3, s * 0.2, 5, r);
    } else if (it.k === "bush") {
      p.shade += oval(x + s * 0.12, y + s * 0.06, s * 0.62, s * 0.24);
      p.bush += oval(x, y - s * 0.3, s * 0.6, s * 0.44);
      p.bush += oval(x - s * 0.34, y - s * 0.16, s * 0.36, s * 0.28);
      p.bush += oval(x + s * 0.32, y - s * 0.18, s * 0.34, s * 0.27);
      p.bushHi += oval(x - s * 0.14, y - s * 0.5, s * 0.28, s * 0.18);
    } else if (it.k === "tuft") {
      p.tuft += blades(x, y, s / 12, (r() - 0.5) * 2.2, 3 + Math.floor(r() * 3), r);
    } else if (it.k === "shroom") {
      p.shade += oval(x + s * 0.08, y + s * 0.05, s * 0.4, s * 0.16);
      p.stumpTop += `M${f(x - s * 0.1)},${f(y)}h${f(s * 0.2)}v${f(-s * 0.5)}h${f(-s * 0.2)}Z`;
      p.cap += oval(x, y - s * 0.52, s * 0.46, s * 0.3);
    } else {
      p.shade += oval(x + s * 0.1, y + s * 0.06, s * 0.6, s * 0.24);
      p.stump += `M${f(x - s * 0.42)},${f(y)}v${f(-s * 0.5)}h${f(s * 0.84)}v${f(s * 0.5)}Z`;
      p.stumpTop += oval(x, y - s * 0.5, s * 0.42, s * 0.2);
    }
  }
  return p;
}

/** 花。色ごとに1本ずつ、芯と影はまとめて1本 */
export function bakeFlowers(spots: { x: number; y: number }[], seed: number) {
  const r = rng(seed);
  const petals = ["", "", "", ""];
  let cores = "";
  let shade = "";
  for (const sp of spots) {
    const k = Math.floor(r() * 4);
    const s = 10 + r() * 5;
    const rot = r() * Math.PI * 2;
    shade += oval(sp.x + 1, sp.y + 1.5, s * 0.42, s * 0.22);
    for (let i = 0; i < 5; i++) {
      const a = rot + (i / 5) * Math.PI * 2;
      petals[k] += oval(sp.x + Math.cos(a) * s * 0.31, sp.y + Math.sin(a) * s * 0.26, s * 0.25, s * 0.21);
    }
    cores += oval(sp.x, sp.y, s * 0.15, s * 0.13);
  }
  return { petals, cores, shade };
}

/**
 * 木の根元と道ぎわの土。
 * 一面の緑にわずかな土色が混じるだけで、地面が「ただの塗り」でなくなる。
 */
export function bakeSoil(spots: { x: number; y: number }[], seed: number): string {
  const r = rng(seed);
  let d = "";
  for (const sp of spots) {
    const rx = 18 + r() * 26;
    d += oval(sp.x, sp.y, rx, rx * (0.42 + r() * 0.2));
  }
  return d;
}
