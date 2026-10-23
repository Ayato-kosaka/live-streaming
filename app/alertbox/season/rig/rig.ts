/**
 * 切り絵の部品（rig.json）を読む。**ここは形を確かめて並べ直すだけで、描かない。**
 *
 * 約束（絵の担当と取り決めたもの）:
 *
 *   { name, size: [W, H], parts: [
 *       { id, file | swaps, parent, pivot: [x, y], at: [x, y], z, mirror? } ] }
 *
 * - `pivot` … その部品の絵の中の関節の点（絵の左上から px）。**左右反転（mirror）した部品は、
 *   反転したあとの絵で数える**（組み上がりを見ながら書けるように）
 * - `at` … 関節が、親の絵の中のどこに来るか（親の左上から px）。親が無ければ台紙の座標
 * - `z` … 描く順（大きいほど手前）
 * - `swaps` … 差し替える絵（目・口）。最初の名前が既定
 *
 * 描く側（`RigView.ts`）は部品を**親の中に入れ子**にして組む。親を回せば子も一緒に回る
 * ので、関節を動かすのに JS の計算が要らない（Web Animations に任せられる）。
 * そのかわり **z は兄弟どうしと親の絵とのあいだでしか効かない**（入れ子のぶんだけ
 * 描く順が括られる）。約束の「全体で比べる」と食い違う並びは `zConflicts` が挙げる。
 */

export type Vec = [number, number];

export type RigPart = {
  id: string;
  /** 1枚の絵。`swaps` を持つ部品は持たない */
  file?: string;
  /** 差し替えの絵（名前 → ファイル）。並びの最初が既定 */
  swaps?: Record<string, string>;
  parent: string | null;
  pivot: Vec;
  at: Vec;
  z: number;
  mirror?: boolean;
};

export type RigDef = {
  name: string;
  size: Vec;
  parts: RigPart[];
};

const isVec = (v: unknown): v is Vec =>
  Array.isArray(v) && v.length === 2 && v.every((n) => typeof n === "number" && Number.isFinite(n));

/**
 * rig.json を読む。**形が違えば null**（壊れた部品で組むより、出さないほうがよい）。
 * 親が見つからない・親子が輪になっている、も null。
 */
export function parseRig(json: unknown): RigDef | null {
  if (!json || typeof json !== "object") return null;
  const o = json as Record<string, unknown>;
  if (!isVec(o.size) || !Array.isArray(o.parts)) return null;
  const parts: RigPart[] = [];
  for (const raw of o.parts) {
    if (!raw || typeof raw !== "object") return null;
    const p = raw as Record<string, unknown>;
    const id = typeof p.id === "string" ? p.id : "";
    if (!id || !isVec(p.pivot) || !isVec(p.at)) return null;
    const file = typeof p.file === "string" && p.file ? p.file : undefined;
    let swaps: Record<string, string> | undefined;
    if (p.swaps && typeof p.swaps === "object" && !Array.isArray(p.swaps)) {
      const entries = Object.entries(p.swaps as Record<string, unknown>).filter(
        (e): e is [string, string] => typeof e[1] === "string" && !!e[1]
      );
      if (entries.length) swaps = Object.fromEntries(entries);
    }
    if (!file && !swaps) return null;
    parts.push({
      id,
      file,
      swaps,
      parent: typeof p.parent === "string" && p.parent ? p.parent : null,
      pivot: p.pivot,
      at: p.at,
      z: typeof p.z === "number" && Number.isFinite(p.z) ? p.z : 0,
      mirror: p.mirror === true,
    });
  }
  const ids = new Set(parts.map((p) => p.id));
  if (ids.size !== parts.length) return null;
  for (const p of parts) if (p.parent && !ids.has(p.parent)) return null;
  // 親子が輪になっていないか（たどって根に着くか）
  const byId = new Map(parts.map((p) => [p.id, p]));
  for (const p of parts) {
    let cur: RigPart | undefined = p;
    for (let i = 0; cur && i <= parts.length; i++) cur = cur.parent ? byId.get(cur.parent) : undefined;
    if (cur) return null;
  }
  return {
    name: typeof o.name === "string" ? o.name : "",
    size: o.size,
    parts,
  };
}

/** 部品が使う絵のファイルぜんぶ（重複なし）。先に全部読むために使う */
export function rigFiles(rig: RigDef): string[] {
  const out = new Set<string>();
  for (const p of rig.parts) {
    if (p.file) out.add(p.file);
    if (p.swaps) Object.values(p.swaps).forEach((f) => out.add(f));
  }
  return [...out];
}

/** 部品の、回していないときの台紙の上での左上（px）。組み上がりの確かめと、関節の点を台紙で知るのに使う */
export function restOrigin(rig: RigDef, id: string): Vec | null {
  const byId = new Map(rig.parts.map((p) => [p.id, p]));
  const first = byId.get(id);
  if (!first) return null;
  let x = first.at[0] - first.pivot[0];
  let y = first.at[1] - first.pivot[1];
  let cur: RigPart = first;
  while (cur.parent) {
    const q: RigPart | undefined = byId.get(cur.parent);
    if (!q) break;
    x += q.at[0] - q.pivot[0];
    y += q.at[1] - q.pivot[1];
    cur = q;
  }
  return [x, y];
}

/** 部品の関節の点の、台紙の上での位置 */
export function restPivot(rig: RigDef, id: string): Vec | null {
  const o = restOrigin(rig, id);
  const p = rig.parts.find((q) => q.id === id);
  return o && p ? [o[0] + p.pivot[0], o[1] + p.pivot[1]] : null;
}

/**
 * 入れ子で組んだときに、実際に描かれる順（奥 → 手前）。
 * 親の中では「親の絵と子の部品」を z で並べ、子はその中身ごと1つの塊として描かれる。
 */
export function drawOrder(rig: RigDef): string[] {
  const kids = new Map<string | null, RigPart[]>();
  for (const p of rig.parts) {
    const k = kids.get(p.parent) ?? [];
    k.push(p);
    kids.set(p.parent, k);
  }
  const out: string[] = [];
  const walk = (p: RigPart) => {
    // 自分の絵（z = 自分の z）と子の塊を、z の順に並べる。同じ z なら自分の絵が先（奥）
    const items: { z: number; self: boolean; part: RigPart }[] = [
      { z: p.z, self: true, part: p },
      ...(kids.get(p.id) ?? []).map((c) => ({ z: c.z, self: false, part: c })),
    ];
    items.sort((a, b) => a.z - b.z || (a.self === b.self ? 0 : a.self ? -1 : 1));
    for (const it of items) {
      if (it.self) out.push(p.id);
      else walk(it.part);
    }
  };
  [...(kids.get(null) ?? [])].sort((a, b) => a.z - b.z).forEach(walk);
  return out;
}

/**
 * 約束の z（全体で比べる）と、入れ子で組んだときの描く順が食い違う組。
 * `[奥に描かれてしまうもの, 手前に描かれてしまうもの]`。空なら食い違いなし。
 * 絵の担当に返す（部品の親を付け替えるか、z を揃えてもらう）。
 */
export function zConflicts(rig: RigDef): [string, string][] {
  const order = drawOrder(rig);
  const z = new Map(rig.parts.map((p) => [p.id, p.z]));
  const out: [string, string][] = [];
  for (let i = 0; i < order.length; i++) {
    for (let j = i + 1; j < order.length; j++) {
      // order[i] は order[j] より奥に描かれる。z がそれと逆なら食い違い
      if (z.get(order[i])! > z.get(order[j])!) out.push([order[i], order[j]]);
    }
  }
  return out;
}
