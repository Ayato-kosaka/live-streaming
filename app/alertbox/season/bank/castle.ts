/**
 * 11月のブラン城の貯金箱（`CastleBank.tsx`）の寸法と、部品の約束（`castle.json`）の読み方。
 * 描くことはしない（試験から呼べるように、DOM に触らない）。
 *
 * ## 大きさは豚と同じ物差しで決める（#1078、あやと 2026-11-02）
 *
 * あやとの指定は「100%のときに、豚を160%にした大きさが良い」＝**豚の 1.6 倍**（縦横とも。動く範囲と字を含めて）。
 *
 * 豚（`PiggyGauge`）は react-native-web の Dimensions の幅（`<html>` の幅 × `visualViewport.scale`）で大きさを
 * 決める。PRISM ではこの scale が % に比例して変わる（100% で 0.36、140% で 0.5）ので、`<html>` の幅で
 * 大きさを決める部品（ハロウィンの貯金箱）は、% によって豚との比が変わってしまう（100% では 140% のときの
 * 1.4 倍、豚より大きく見える。`docs/island-misses.md` #311）。
 *
 * なのでこの城は、**Dimensions の幅（`useStableWindow`）だけから大きさを決める。** PRISM の % が何でも、
 * いつも豚の 1.6 倍になる（`tools/sprites/alert-banksize.mjs` が scale 0.5 と 0.36 の両方で確かめる）。
 *
 * ## 2版目（あやと 2026-11-02、#1078「ピポもうちょっと大きくしないと見えない」「文字が貯金箱より目立ってる」）
 *
 * - 字の帯（リボン）を細く短くして、空いたぶん城を大きくした。ピポは城よりさらに大きく（顔の幅が前の版の 1.5 倍以上）
 * - ピポの居場所は、場面の下の両隅（リボンの横の空き）と門の前。門から城に入って屋根ごしに顔を出し、門の脇の岩山に
 *   跳び乗り、隅で丸くなって眠る。どこへ行っても、豚の 1.6 倍の四角の外へは出ない（`pipoStage` が決め、試験が確かめる）
 * - 屋根の上で眠らせる案は外した: ピポを大きくしたので、城のてっぺんが場面の上の端に来ていて、屋根に載せると
 *   丸くなった背中が場面の外へ出る
 * - 字は いまの額だけを目立たせ、目標と旅の名前は小さく控えめに（`CASTLE_FONT`）
 */

/**
 * 豚が描かれる外接矩形（字を含む）を、Dimensions の幅に対する割合で。
 * `alert-banksize.mjs` で測った: Dimensions の幅 218 のとき 178×113px（PRISM 140%・箱 436×776 でも、
 * 100%・箱 606×1078 でも同じ）。下の端は面の下の端、横は真ん中
 */
export const PIG_BOX = { w: 178 / 218, h: 113 / 218 } as const;

/** 豚に対する大きさ（あやとの「豚を160%にした大きさ」） */
export const CASTLE_TIMES = 1.6;

/**
 * 貯金箱の場面の大きさ（CSS px）。動くもの・字を全部この中に収める。
 * `dimW` は Dimensions の幅（`useStableWindow().width`）。**`<html>` の幅を渡さない**
 */
export function castleBox(dimW: number): { width: number; height: number } {
  return {
    width: Math.round(dimW * PIG_BOX.w * CASTLE_TIMES),
    height: Math.round(dimW * PIG_BOX.h * CASTLE_TIMES),
  };
}

/** ピポのポーズの名前。絵はどれも右向き（左へ動くときは左右を返す） */
export const PIPO_POSES = [
  "wait", // 座ってランタンを持つ（空のとき）
  "sit", // 座ってこちらを見て笑う
  "walk0", // 歩く（足 その1）
  "walk1", // 歩く（足 その2）
  "jump", // 跳ぶ
  "peek", // 屋根ごしに顔を出す（頭と前足だけ。絵の下の辺が屋根の線）
  "peekWave", // 同じで、手を振る
  "flag", // 小さな国旗を振る
  "yawn", // あくび
  "sleep", // 丸くなって眠る
  "catch", // 巾着袋を差し出して金貨を受け取る
  "cheer", // バンザイ
] as const;
export type PipoPose = (typeof PIPO_POSES)[number];

/** ピポの絵1枚（絵の px） */
export type PipoSprite = {
  file: string;
  /** 絵の大きさ。読んだ絵と違えば、比で直す */
  size: [number, number];
  /** 足もと（置く点）。絵の幅・高さに対する割合。`peek` は下の辺の真ん中（屋根の線に合わせる点） */
  foot: [number, number];
  /** 顔の四角（絵の px。左・上・右・下）。**顔の幅をそろえて**大きさを決める（ポーズを替えても顔が跳ねない） */
  face: [number, number, number, number];
};

/** 屋根ごしに顔を出す所（城の絵の px）。`x` は顔の真ん中、`y` は屋根の線（ここより下は城の後ろに隠れる） */
export type PeekSpot = { x: number; y: number };

/** 字を載せる台（リボン）。字を置く四角は台の絵に対する割合 */
export type CastlePlate = {
  file: string;
  /** 字を置く四角（台の絵の幅・高さに対する割合。左・上・右・下） */
  text: [number, number, number, number];
};

/** `castle.json` の中身。座標は城の 0% の絵（`bank-base-0.png`）の px */
export type CastleDef = {
  /** 城の 0% の絵の大きさ。読んだ絵と違えば、比で直す */
  size: [number, number];
  /** 城の中身の四角（ふちを含む。左・上・幅・高さ） */
  content: [number, number, number, number];
  /** 灯りが上がる範囲。0% で `bottom`（壁の下の端）、100% で `top`（いちばん上の壁の上の端） */
  light: { bottom: number; top: number };
  /** 旗竿。旗の竿側の辺の x と、旗の上の端が 0% / 100% で来る y */
  pole: { x: number; bottom: number; top: number };
  flag: { file: string; h: number };
  /** 金貨（アラート明けに城へ飛び込む） */
  coin: { file: string };
  pipo: {
    /** 顔の幅（場面の幅に対する割合）。どのポーズもこの幅で描く */
    face: number;
    poses: Record<PipoPose, PipoSprite>;
    /** 門（城の絵の px。足もと）。ここから城に入り、ここで金貨を受け取る */
    gate: { x: number; y: number };
    /** 金貨が飛び込む巾着袋の口（`catch` の絵の幅・高さに対する割合） */
    coinIn: [number, number];
    /** 跳び乗って座る岩山（城の絵の px。足もと）。門の左右 */
    ledges: { x: number; y: number }[];
    /** 屋根ごしに顔を出す所 */
    peeks: PeekSpot[];
  };
  ribbon: CastlePlate;
};

const num = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const nums = (v: unknown, n: number): v is number[] => Array.isArray(v) && v.length === n && v.every(num);
const obj = (v: unknown): Record<string, unknown> | null => (v && typeof v === "object" ? (v as Record<string, unknown>) : null);

function readSprite(v: unknown): PipoSprite | null {
  const o = obj(v);
  if (!o || typeof o.file !== "string" || !nums(o.size, 2) || !nums(o.foot, 2) || !nums(o.face, 4)) return null;
  const [w, h] = o.size as number[];
  const [l, t, r, b] = o.face as number[];
  if (!(w > 0 && h > 0 && r > l && b > t)) return null;
  return { file: o.file, size: [w, h], foot: o.foot as [number, number], face: o.face as [number, number, number, number] };
}

function readXY(v: unknown): { x: number; y: number } | null {
  const o = obj(v);
  return o && num(o.x) && num(o.y) ? { x: o.x, y: o.y } : null;
}

/**
 * `castle.json` を読む。**欠けていれば null**（片方の部品だけで城を出さない。使う側はコマ送りに落ちる）
 */
export function readCastleDef(json: unknown): CastleDef | null {
  const o = obj(json);
  if (!o) return null;
  const light = obj(o.light);
  const pole = obj(o.pole);
  const flag = obj(o.flag);
  const coin = obj(o.coin);
  const pipo = obj(o.pipo);
  const ribbon = obj(o.ribbon);
  if (!nums(o.size, 2) || !nums(o.content, 4)) return null;
  if (!light || !num(light.bottom) || !num(light.top) || light.top >= light.bottom) return null;
  if (!pole || !num(pole.x) || !num(pole.bottom) || !num(pole.top) || pole.top >= pole.bottom) return null;
  if (!flag || typeof flag.file !== "string" || !num(flag.h)) return null;
  if (!coin || typeof coin.file !== "string") return null;
  if (!ribbon || typeof ribbon.file !== "string" || !nums(ribbon.text, 4)) return null;
  if (!pipo || !num(pipo.face) || pipo.face <= 0) return null;
  const ps = obj(pipo.poses);
  if (!ps) return null;
  const poses = {} as Record<PipoPose, PipoSprite>;
  for (const name of PIPO_POSES) {
    const sp = readSprite(ps[name]);
    if (!sp) return null;
    poses[name] = sp;
  }
  const gate = readXY(pipo.gate);
  if (!gate) return null;
  const list = (v: unknown): { x: number; y: number }[] | null => {
    if (!Array.isArray(v) || !v.length) return null;
    const out = v.map(readXY);
    return out.every(Boolean) ? (out as { x: number; y: number }[]) : null;
  };
  const peeks = list(pipo.peeks);
  const ledges = list(pipo.ledges);
  if (!peeks || !ledges || !nums(pipo.coinIn, 2)) return null;
  return {
    size: o.size as [number, number],
    content: o.content as [number, number, number, number],
    light: { bottom: light.bottom, top: light.top },
    pole: { x: pole.x, bottom: pole.bottom, top: pole.top },
    flag: { file: flag.file, h: flag.h },
    coin: { file: coin.file },
    pipo: { face: pipo.face, poses, gate, coinIn: pipo.coinIn as [number, number], ledges, peeks },
    ribbon: { file: ribbon.file, text: ribbon.text as [number, number, number, number] },
  };
}

/** 城が使う絵のファイル名ぜんぶ（城の 0%・100% の絵は `bank` のコマなので入れない） */
export function castleFiles(def: CastleDef): string[] {
  const out = [def.flag.file, def.coin.file, def.ribbon.file];
  for (const name of PIPO_POSES) out.push(def.pipo.poses[name].file);
  return [...new Set(out)];
}

/** 溜まり具合（0〜1）で、灯りの境目の y（城の絵の px） */
export function lightY(def: CastleDef, level: number): number {
  const k = Math.max(0, Math.min(1, level));
  return def.light.bottom + (def.light.top - def.light.bottom) * k;
}

/** 溜まり具合で、旗の上の端の y（城の絵の px） */
export function flagY(def: CastleDef, level: number): number {
  const k = Math.max(0, Math.min(1, level));
  return def.pole.bottom + (def.pole.top - def.pole.bottom) * k;
}

type Rect = { x: number; y: number; w: number; h: number };

/**
 * 字の大きさ（場面の幅に対する割合）。**目立たせるのは いまの額だけ**（あやと 2026-11-02「今の金額以外の文字は
 * よく見たら見えるくらいで良い」）。いまの額は豚の字（20px）と同じくらい、目標と旅の名前はその半分。
 * 場面の幅は Dimensions の幅 218 のとき 285px
 */
export const CASTLE_FONT = { amount: 0.068, target: 0.034, label: 0.035 } as const;

/** リボンの幅（場面の幅に対する割合）。城より狭く。両脇の空きはピポの居場所 */
export const RIBBON_W = 0.64;

/**
 * リボンが城の足もとに重なる割合（リボンの高さに対して）。リボンの上の 3/4 が城の石畳と門の下の端に掛かる。
 * 深く重ねるほど城が大きくなる（0.6 で初版の 1.11 倍、0.75 で 1.16 倍）。門のアーチは見えたままにする
 */
const RIBBON_OVERLAP = 0.75;

/** 場面の中の並び（場面の px） */
export type CastleLayout = {
  /** 城の中身の四角（`content` がここに来る） */
  castle: Rect;
  /** 城の絵の px → 場面の px の倍率 */
  s: number;
  /** 城の絵の (0,0) を場面のどこに置くか */
  ox: number;
  oy: number;
  /** リボン */
  plate: Rect;
  /** 字を置く四角 */
  text: Rect;
  /** 字の大きさ（場面の px） */
  font: { amount: number; target: number; label: number };
};

/**
 * 場面の並びを決める。すべて `box`（豚の 1.6 倍の四角）の中に収める。
 * `ribbonAspect` はリボンの絵の 幅/高さ
 */
export function castleLayout(box: { width: number; height: number }, def: CastleDef, ribbonAspect: number): CastleLayout {
  const W = box.width;
  const H = box.height;
  const aspect = def.content[2] / def.content[3];
  const pw = W * RIBBON_W;
  const ph = pw / ribbonAspect;
  const plate = { x: (W - pw) / 2, y: H - ph, w: pw, h: ph };
  let ch = Math.min(H, plate.y + ph * RIBBON_OVERLAP);
  let cw = ch * aspect;
  if (cw > W) {
    cw = W;
    ch = cw / aspect;
  }
  const castle = { x: (W - cw) / 2, y: plate.y + ph * RIBBON_OVERLAP - ch, w: cw, h: ch };
  const s = cw / def.content[2];
  const [l, t, r, b] = def.ribbon.text;
  return {
    castle,
    s,
    ox: castle.x - def.content[0] * s,
    oy: castle.y - def.content[1] * s,
    plate,
    text: { x: plate.x + pw * l, y: plate.y + ph * t, w: pw * (r - l), h: ph * (b - t) },
    font: { amount: W * CASTLE_FONT.amount, target: W * CASTLE_FONT.target, label: W * CASTLE_FONT.label },
  };
}

/** ピポの絵1枚を場面に描く大きさ（場面の px） */
export function pipoSize(def: CastleDef, box: { width: number }, pose: PipoPose): { w: number; h: number; k: number } {
  const sp = def.pipo.poses[pose];
  const k = (def.pipo.face * box.width) / (sp.face[2] - sp.face[0]);
  return { w: sp.size[0] * k, h: sp.size[1] * k, k };
}

/** 足もとを (x, y) に置いたときの、絵の四角（場面の px） */
export function pipoRect(def: CastleDef, box: { width: number }, pose: PipoPose, x: number, y: number): Rect {
  const sp = def.pipo.poses[pose];
  const { w, h } = pipoSize(def, box, pose);
  return { x: x - w * sp.foot[0], y: y - h * sp.foot[1], w, h };
}

/** 足もとを (x, y) に置いたときの、顔の四角（場面の px） */
export function pipoFace(def: CastleDef, box: { width: number }, pose: PipoPose, x: number, y: number): Rect {
  const sp = def.pipo.poses[pose];
  const r = pipoRect(def, box, pose, x, y);
  const k = r.w / sp.size[0];
  return { x: r.x + sp.face[0] * k, y: r.y + sp.face[1] * k, w: (sp.face[2] - sp.face[0]) * k, h: (sp.face[3] - sp.face[1]) * k };
}

/** 地面に立つポーズ（両隅・門で使う） */
export const GROUND_POSES: PipoPose[] = ["wait", "sit", "walk0", "walk1", "flag", "yawn", "catch", "cheer"];

/**
 * ピポの舞台（場面の px）。どこも、そこで取るポーズの絵が場面の中に収まるように決める。
 *
 * - `ground`: 両隅で立つ足もとの高さ（場面の下の端のすぐ上）
 * - `left` / `right`: 両隅の足もとの x（リボンの横の空き。いちばん幅の広い地面のポーズが、場面の端に掛からない所）
 * - `gate`: 門の前の足もと（城の絵の `pipo.gate`）。下はリボンの後ろに隠れる
 * - `ledges`: 跳び乗って座る岩山の足もと（門の左右）
 * - `peeks`: 屋根ごしに顔を出す所（`x` 顔の真ん中・`y` 絵の下の辺。ここより下は城の後ろに隠れる）
 */
export type PipoStage = {
  ground: number;
  left: number;
  right: number;
  gate: { x: number; y: number };
  ledges: { x: number; y: number }[];
  peeks: { x: number; y: number }[];
};

/** 隅で座るポーズ（隅の足もとは、これが場面の端に来る所。歩く・旗を振るなど幅の広いポーズは `fitPipoX` で内へ寄せる） */
export const CORNER_POSES: PipoPose[] = ["sit", "wait"];

export function pipoStage(def: CastleDef, box: { width: number; height: number }, L: CastleLayout): PipoStage {
  // 両隅: 隅で座る・歩くポーズのうち、足もとから左・右へいちばん張り出すものが、場面の端の 1px 内側に来る所。
  // 座ったピポが場面の端まで来るので、貯金箱の幅はいつも豚の 1.6 倍まで使う（旗を振る・バンザイのような幅の広い
  // ポーズを基準にすると、座っているあいだは端が空いて、90 秒のうちに幅の広いポーズが隅で出ないと幅が 1.5 倍を割る）
  let padL = 0;
  let padR = 0;
  for (const p of CORNER_POSES) {
    // 左へ動くときは左右を返すので、どちら向きでも収まるよう、張り出しの大きいほうを取る（息の広がりも入れる）
    const { l, r } = pipoReach(def, box, p);
    padL = Math.max(padL, l, r);
    padR = Math.max(padR, l, r);
  }
  // 地面: どのポーズでも、足の下のふち（絵のまわりのキャラメル色）が場面の下の端に掛からない高さ
  let padB = 0;
  for (const p of [...GROUND_POSES, "sleep" as PipoPose, "jump" as PipoPose]) {
    const { h } = pipoSize(def, box, p);
    padB = Math.max(padB, h * (1 - def.pipo.poses[p].foot[1]));
  }
  const ground = box.height - padB - 1;
  const X = (x: number) => L.ox + x * L.s;
  const Y = (y: number) => L.oy + y * L.s;
  return {
    ground,
    left: Math.ceil(padL) + 1,
    right: Math.floor(box.width - padR) - 1,
    gate: { x: X(def.pipo.gate.x), y: Y(def.pipo.gate.y) },
    ledges: def.pipo.ledges.map((p) => ({ x: X(p.x), y: Y(p.y) })),
    peeks: def.pipo.peeks.map((p) => ({ x: X(p.x), y: Y(p.y) })),
  };
}

/** いつも掛かっている息の大きさ（`CastleBank` の breath。足もとを軸に横へ 1.2% 広がる） */
export const BREATH = 1.012;

/**
 * ポーズ `pose` の絵が、足もとから左・右へどこまで張り出すか（場面の px。右向き）。
 * 足もとを軸に ±`sway` 度傾け、`scale` 倍に広げても収まる幅（旗を振る・首をかしげる・着地の「ぽよん」）
 */
export function pipoReach(def: CastleDef, box: { width: number }, pose: PipoPose, sway = 0, scale = BREATH): { l: number; r: number } {
  const sp = def.pipo.poses[pose];
  const { w, h } = pipoSize(def, box, pose);
  const xs = [-w * sp.foot[0] * scale, w * (1 - sp.foot[0]) * scale];
  const ys = [-h * sp.foot[1] * scale, h * (1 - sp.foot[1]) * scale];
  let l = 0;
  let r = 0;
  for (const deg of sway ? [-sway, 0, sway] : [0]) {
    const c = Math.cos((deg * Math.PI) / 180);
    const s = Math.sin((deg * Math.PI) / 180);
    for (const x of xs)
      for (const y of ys) {
        const rx = x * c - y * s;
        l = Math.min(l, rx);
        r = Math.max(r, rx);
      }
  }
  return { l: -l, r };
}

/**
 * 足もと `x` でポーズ `pose` を取ったとき、絵が場面の左右の端から出るなら、出ないところまで内へ寄せた x を返す。
 * `dir` は向き（-1 なら左右を返して描く。足もとを軸に鏡写し）。`sway`・`scale` はそのポーズで掛ける傾き（度）と広がり
 */
export function fitPipoX(
  def: CastleDef,
  box: { width: number; height: number },
  pose: PipoPose,
  x: number,
  dir: 1 | -1,
  sway = 0,
  scale = BREATH
): number {
  const reach = pipoReach(def, box, pose, sway, scale);
  const l = x - (dir === 1 ? reach.l : reach.r);
  const r = x + (dir === 1 ? reach.r : reach.l);
  if (l < 0) return x - l + 0.5;
  if (r > box.width) return x - (r - box.width) - 0.5;
  return x;
}

/**
 * 跳ぶ道（場面の px）。`a` から `b` へ、いちばん高い所が `peak`（場面の上の端から何 px 下か）までの放物線を、
 * `n` 点に分けて返す。Web Animations の keyframes にそのまま使う（rAF を回さない）
 */
export function arcPoints(a: { x: number; y: number }, b: { x: number; y: number }, lift: number, n = 9): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    // 直線に、真ん中で lift だけ持ち上げる放物線を足す
    out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t - lift * 4 * t * (1 - t) });
  }
  return out;
}
