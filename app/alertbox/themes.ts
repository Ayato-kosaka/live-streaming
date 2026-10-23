/**
 * アラートの季節テーマ。**次の季節を足すのは、下の `THEMES` に1件足すだけ。**
 *
 * テーマが持つのは4つ。
 *
 *   1. 期間（JST）。`from` から `until` の**手前まで**
 *   2. 絵の置き場（`dir`）。名前の決まりは下の `bankFrameUrl` / `fxUrl`
 *   3. 貯金箱の字の色
 *   4. アラート中に後ろで出す小物の並び（`fx`）と、締めの群れ（`finale`）
 *
 * テーマが無い日（期間外）は、いつもの豚の貯金箱のまま。何も足さない。
 *
 * ## 今日のテーマは、画面が出てから決める
 *
 * 書き出し（`output: "static"`）は日付を焼くので、ここでは決めない。
 * 決めるのは `season/useSeason.ts`。OBS は開きっぱなしなので、1分ごとに見直す。
 */

/** 小物が出てくる場所。画面の真ん中は使わない（配信画面とキャラを塞がない）。 */
export type FxPlace =
  /** 上の角。左右どちらか */
  | "corner"
  /** 下の端から生えてくる。左右の 1/4 の中 */
  | "bottom"
  /** 横から入ってきて漂う。上半分の左右の端 */
  | "side";

/**
 * 小物の動き。`season/seasonFx.css.ts` の keyframes の名前と1対1。
 * 同じ動きを次の季節でも使い回せるように、動きは絵の名前ではなく**動き方**で呼ぶ。
 */
export type FxMotion =
  /** 角から広がって、ゆらゆら（蜘蛛の巣） */
  | "unfurl"
  /** 下からぴょこっと出て、もう1回跳ねる（かぼちゃ） */
  | "pop"
  /** 下からどすんと出て、少し傾く（墓） */
  | "thud"
  /** 下からのそっと出て、左右に揺れる（ゾンビ） */
  | "shamble"
  /** 横から入ってきて、上下にふわふわ（おばけ） */
  | "float"
  /** 下から跳ね上がって、くるっと回る（お菓子） */
  | "hop";

export type FxDef = {
  /** `dir` の中のファイル名 */
  file: string;
  place: FxPlace;
  motion: FxMotion;
  /** 画面の短辺に対する大きさ（長いほうの辺）。**0.2 を超えない**（背景を塞がない） */
  size: number;
  /**
   * 絵が向いている向き。横を向いている絵は、画面の内側を向くように左右反転する。
   * 正面（既定）は反転しない（墓の十字やゾンビの顔が鏡写しにならないように）。
   * 角（`corner`）は「左上の角に置く絵」として描いてある前提で、右上では反転する。
   */
  facing?: "left" | "right" | "front";
};

export type FxSlot = {
  place: FxPlace;
  side: "l" | "r";
  /** 下端の枠だけ。0 がいちばん外側（画面の端寄り） */
  lane?: number;
};

export type FxTier = {
  /** この額（JPY）以上でこの段 */
  min: number;
  /** 使う枠の数（`slots` の頭から） */
  slots: number;
  /** この段で出してよい小物（`fx` の `file`） */
  files: string[];
  /** 締めの群れ。1波の匹数と波の数 */
  bats: number;
  waves: number;
};

export type TextTone = {
  color: string;
  shadow: string;
};

export type SeasonTheme = {
  id: string;
  /** JST の開始（含む）。`YYYY-MM-DDTHH:mm` */
  from: string;
  /** JST の終わり（含まない）。`YYYY-MM-DDTHH:mm` */
  until: string;
  /** 絵の置き場（公開側のパス。`public/` の下） */
  dir: string;
  bank: {
    /** コマの枚数（`bank-base-0..n-1.png` / `bank-fill-0..n-1.png`） */
    frames: number;
    /**
     * コマの出し方。`[コマの番号, ms]` を順に出して、最後まで行ったら頭に戻る。
     * **等間隔にしない。** 4コマを 0.15秒ずつ回すと、表情が絶えず変わって
     * 忙しく見える。ふだんの顔（0）で長く休んで、ときどき笑う・揺れる・まばたく
     */
    sequence: [number, number][];
    /** `manifest.json` が読めないときの絵の大きさ（中身の外接矩形は絵の全体とみなす） */
    fallbackSize: { width: number; height: number };
  };
  /** 貯金箱の字。上（目標）・中（いまの額）・下（ラベル） */
  text: { top: TextTone; center: TextTone; bottom: TextTone };
  /** 出しうる小物ぜんぶ。どれを出すかは段（`tiers`）が決める */
  fx: FxDef[];
  /**
   * 小物を置く枠。**上から順に使う**ので、段が上がるほど枠が増えて、
   * 四隅と下端が埋まっていく。枠1つにつき、その場所に合う小物が
   * 「出る → 短く動く → 消える → 少しして次が出る」を繰り返す。
   * 真ん中に寄る枠は作らない（`lane` 2 でも画面の幅の 3 割まで）。
   */
  slots: FxSlot[];
  /**
   * 金額の段（JPY。**下から順に `min` 以上で決まる**）。段差がはっきり分かるように、
   * 枠の数・出る小物・締めの群れの数を段ごとに持つ。
   */
  tiers: FxTier[];
  /** アラートの終わりに画面を横切る群れ（2コマの羽ばたき）。無ければ null */
  finale: {
    files: [string, string];
    /** 羽ばたき1回（2コマ）の長さ（ms） */
    flapMs: number;
    /** 短辺に対する大きさ */
    size: number;
    /** どちらへ飛ぶか。絵が向いている向きに合わせる */
    toward: "left" | "right";
  } | null;
};

export const THEMES: SeasonTheme[] = [
  {
    id: "halloween",
    from: "2026-10-01T00:00",
    // 10/31 23:59 まで。11/1 0:00 からは豚に戻る
    until: "2026-11-01T00:00",
    dir: "/alert/themes/halloween",
    bank: {
      frames: 4,
      /* 0 ふつう / 1 にっこり（灯りが明るい）/ 2 ヘタが揺れる / 3 まばたき。
         1周 4.2秒。録画で見て、忙しくなく、止まって見えもしない間にした */
      sequence: [
        [0, 1300],
        [1, 320],
        [0, 650],
        [2, 260],
        [0, 900],
        [3, 140],
        [0, 480],
        [2, 160],
      ],
      fallbackSize: { width: 1200, height: 562 },
    },
    text: {
      top: { color: "rgba(255,246,232,0.97)", shadow: "#1B0B2E" },
      /* いまの額はかぼちゃの橙。**地が何色でも読めるように、濃い紫の縁を付ける**
         （豚の桃色は白い縁だったが、橙に白い縁は字が膨らんで読みにくい） */
      center: { color: "#FF8A1E", shadow: "#1B0B2E" },
      bottom: { color: "rgba(255,246,232,0.97)", shadow: "#1B0B2E" },
    },
    fx: [
      { file: "fx-web.png", place: "corner", motion: "unfurl", size: 0.2 },
      { file: "fx-pumpkin.png", place: "bottom", motion: "pop", size: 0.17 },
      { file: "fx-ghost.png", place: "side", motion: "float", size: 0.17, facing: "left" },
      { file: "fx-grave.png", place: "bottom", motion: "thud", size: 0.17 },
      { file: "fx-candy.png", place: "bottom", motion: "hop", size: 0.12 },
      { file: "fx-zombie.png", place: "bottom", motion: "shamble", size: 0.19 },
    ],
    slots: [
      { place: "corner", side: "l" },
      { place: "bottom", side: "r", lane: 0 },
      { place: "bottom", side: "l", lane: 0 },
      { place: "side", side: "r" },
      { place: "corner", side: "r" },
      { place: "bottom", side: "l", lane: 1 },
      { place: "bottom", side: "r", lane: 1 },
      { place: "side", side: "l" },
      { place: "bottom", side: "l", lane: 2 },
      { place: "bottom", side: "r", lane: 2 },
    ],
    /* 段の中身は #1022 で決めたもの。**どの段でも真ん中は空いている**
       （枠がそもそも真ん中に無い）。 */
    tiers: [
      {
        min: 0,
        slots: 3,
        files: ["fx-web.png", "fx-pumpkin.png", "fx-candy.png"],
        bats: 2,
        waves: 1,
      },
      {
        min: 1000,
        slots: 5,
        files: ["fx-web.png", "fx-pumpkin.png", "fx-candy.png", "fx-ghost.png"],
        bats: 4,
        waves: 1,
      },
      {
        min: 5000,
        slots: 7,
        files: [
          "fx-web.png",
          "fx-pumpkin.png",
          "fx-candy.png",
          "fx-ghost.png",
          "fx-grave.png",
          "fx-zombie.png",
        ],
        bats: 7,
        waves: 1,
      },
      {
        min: 10000,
        slots: 10,
        files: [
          "fx-web.png",
          "fx-pumpkin.png",
          "fx-candy.png",
          "fx-ghost.png",
          "fx-grave.png",
          "fx-zombie.png",
        ],
        bats: 12,
        waves: 2,
      },
    ],
    finale: {
      files: ["fx-bat-0.png", "fx-bat-1.png"],
      flapMs: 220,
      size: 0.11,
      toward: "right",
    },
  },
];

/** JST の `YYYY-MM-DDTHH:mm` を、いつの瞬間か（ms）に直す。 */
export function jstToMs(s: string): number {
  return Date.parse(`${s}:00+09:00`);
}

/** その瞬間のテーマ。期間外なら null。 */
export function themeAt(
  now: Date,
  themes: SeasonTheme[] = THEMES
): SeasonTheme | null {
  const t = now.getTime();
  for (const th of themes) {
    if (jstToMs(th.from) <= t && t < jstToMs(th.until)) return th;
  }
  return null;
}

/** 金額（JPY）の段。額が負・数でないときはいちばん下の段。 */
export function tierFor(th: SeasonTheme, yen: number): FxTier {
  const y = Number.isFinite(yen) ? yen : 0;
  let hit = th.tiers[0];
  for (const t of th.tiers) if (y >= t.min) hit = t;
  return hit;
}

/**
 * URL の `theme=` を読む（試し見のため）。
 *
 * - `undefined` … 付いていない。日付で決める
 * - `null` … `theme=none`。豚に固定
 * - テーマ … そのテーマに固定（期間外でも）
 *
 * 知らない名前は「付いていない」と同じに扱う。打ち間違えで豚に固定されて、
 * 本番の季節が出ないまま気づかない、を避ける。
 */
export function themeFromParam(
  raw: string | string[] | undefined,
  themes: SeasonTheme[] = THEMES
): SeasonTheme | null | undefined {
  const v = String((Array.isArray(raw) ? raw[0] : raw) ?? "")
    .trim()
    .toLowerCase();
  if (!v) return undefined;
  if (v === "none" || v === "off") return null;
  return themes.find((t) => t.id === v) ?? undefined;
}

export const bankFrameUrl = (
  th: SeasonTheme,
  layer: "base" | "fill",
  i: number
) => `${th.dir}/bank-${layer}-${i}.png`;

export const fxUrl = (th: SeasonTheme, file: string) => `${th.dir}/${file}`;

export const manifestUrl = (th: SeasonTheme) => `${th.dir}/manifest.json`;

/** 絵の中で、中身が描かれている四角（px。絵の左上が原点） */
export type Rect = { x: number; y: number; width: number; height: number };

/** `manifest.json` から拾えたもの。拾えなかったものは入っていない */
export type ThemeManifest = Record<
  string,
  { width?: number; height?: number; bbox?: Rect }
>;

const num = (v: unknown): number | undefined =>
  typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : undefined;

function readRect(v: unknown): Rect | undefined {
  if (!v || typeof v !== "object") return undefined;
  const o = v as Record<string, unknown>;
  // [x, y, w, h] の並びでも受ける
  if (Array.isArray(v) && v.length === 4) {
    const [x, y, w, h] = v.map(num);
    return x != null && y != null && w && h ? { x, y, width: w, height: h } : undefined;
  }
  const x = num(o.x ?? o.left);
  const y = num(o.y ?? o.top);
  const w = num(o.width ?? o.w);
  const h = num(o.height ?? o.h);
  if (x != null && y != null && w && h) return { x, y, width: w, height: h };
  // right / bottom で来たとき
  const r = num(o.right);
  const b = num(o.bottom);
  if (x != null && y != null && r != null && b != null && r > x && b > y) {
    return { x, y, width: r - x, height: b - y };
  }
  return undefined;
}

/**
 * `manifest.json` を読む。**形が少し違っても拾えるだけ拾う。**
 *
 * 絵は別の担当が描いて置くので、書き方の細部（`files` で包むか、
 * 外接矩形の名前が `bbox` か `content` か）までは決め打ちしない。
 * 拾えなかったものは既定値（絵の全体）で描くので、読めなくても壊れない。
 */
export function readManifest(json: unknown): ThemeManifest {
  const out: ThemeManifest = {};
  if (!json || typeof json !== "object") return out;
  const root = json as Record<string, unknown>;
  // 貯金箱の全コマを合わせた中身の四角（コマごとの四角より、こちらを使う）
  const bankContent = readRect(root.bankContent);
  if (bankContent) out.bank = { bbox: bankContent };
  const files =
    root.files && typeof root.files === "object" ? root.files : root;
  const entries: [string, unknown][] = Array.isArray(files)
    ? (files as unknown[]).map((f) => [
        String((f as Record<string, unknown>)?.file ?? (f as Record<string, unknown>)?.name ?? ""),
        f,
      ])
    : Object.entries(files as Record<string, unknown>);
  for (const [name, v] of entries) {
    if (!name || !v || typeof v !== "object") continue;
    const o = v as Record<string, unknown>;
    const bbox =
      readRect(o.bbox) ?? readRect(o.content) ?? readRect(o.contentBox) ?? readRect(o.box);
    out[name.replace(/^.*\//, "")] = {
      width: num(o.width ?? o.w),
      height: num(o.height ?? o.h),
      ...(bbox ? { bbox } : {}),
    };
  }
  return out;
}
