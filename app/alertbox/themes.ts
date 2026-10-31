/**
 * アラートの季節テーマ。**次の季節を足すのは、下の `THEMES` に1件足すだけ。**
 *
 * テーマが持つのは5つ。
 *
 *   1. 期間（JST）。`from` から `until` の**手前まで**
 *   2. 絵の置き場（`dir`）。名前の決まりは下の `bankFrameUrl` / `fxUrl` / `rigDir`
 *   3. 貯金箱。切り絵の部品で動かすもの（`rigBank`）と、読めなかったときのコマ送り（`bank`）
 *   4. 金額の段（`tiers`）。段ごとに、後ろで出す小物（`fx`）か、**演出の台本**（`show`）と、
 *      名前の札の飾り（`plate`）を持つ
 *   5. 締めの群れ（`finale`）
 *
 * ## 段は「台本」を持てる
 *
 * 段に `show` を書くと、その段は小物の代わりに台本どおりの演出になる（暗転・主役の登場・
 * 札・数え上げ…）。台本は時刻つきの出来事の並び（`season/show/script.ts`）。
 * 部品の絵が読めなかった日は、その段は小物の演出に落ちる（何も出ない、にしない）。
 *
 * テーマが無い日（期間外）は、いつもの豚の貯金箱のまま。何も足さない。
 *
 * ## 今日のテーマは、画面が出てから決める
 *
 * 書き出し（`output: "static"`）は日付を焼くので、ここでは決めない。
 * 決めるのは `season/useSeason.ts`。OBS は開きっぱなしなので、1分ごとに見直す。
 */

import type { Cue } from "./season/show/script";

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

/**
 * アラートの字（名前・額・メッセージ）の飾り。**背景の箱は持たない**（2026-10-24、オーナー:
 * 字はキャラ絵の上下中央に重ね、箱は使わずに字そのものをリッチに）。描くのは `season/plate/RichText.tsx`。
 * 字の大きさはどの段も同じで、RichText が面の幅に比例して決める（2版目。段で変えるのは色と縁と飾り）
 */
export type PlateStyle = {
  /** "gold" は段7の金の縁と光（ほかは濃い縁だけ） */
  frame: "round" | "gold";
  /** 段の色。縁の光・「ドン」の光 */
  edge: string;
  /** 字の縁取りの色（濃い色。明るい地・キャラ絵の柄の上でも字を読ませる） */
  ink: string;
  /** 縁取りの太さ（em。外に見えるのはこの半分）。段が上がるほど太い */
  stroke: number;
  /** 縁の光の強さ（0..1）。段が上がるほど強い */
  glow: number;
  nameColor: string;
  /** 名前と額のあいだの字（「様」「ありやとう！！」）とメッセージの色。無ければ名前の色・白 */
  textColor?: string;
  /** 額のグラデーション（上 → 下） */
  amountColor: string;
  amountColor2?: string;
  /** 台本が無いとき、字が出る秒 */
  appearAt?: number;
};

/** 段の演出（台本つき） */
export type TierShow = {
  /**
   * 振付けの名前（`season/show/` の中）。"ghost" 段1 ちびおばけ / "broom" 段2 ほうきのクロとこうもり /
   * "march" 段3 かぼちゃ坊やの行進 / "wizard" 段4 魔法使いのあやと / "reaper" 段5 死神のあやと /
   * "zombie" 段6 ゾンビのあやと / "dracula" 段7 ドラキュラのあやと
   */
  kind: "ghost" | "broom" | "march" | "wizard" | "reaper" | "zombie" | "dracula";
  /** 使う切り絵（`rigDir` の名前）。1つでも読めなければ、この段は小物の演出に落ちる */
  rigs: string[];
  /** 使うポーズ絵の組（`posesDir` の名前。あやとの仮装）。読めなければ同じく小物の演出に落ちる */
  poses?: string[];
  /** 使う小物の組（`itemsDir` の名前。古城・じゅうたん・紙吹雪…）。読めなければ同じく小物の演出に落ちる */
  items?: string[];
  /**
   * その人のキャラ絵と読み上げを出す秒。**0 なら今どおり（すぐ）**。
   * 主役が「どうぞ」と見せる時刻に合わせる（台本の `reveal` と同じ秒）
   */
  revealSec: number;
  /**
   * 名前の札の上に空ける高さ（面の高さに対する割合）。主役が札の上の縁に立つ・乗るぶん。
   * 札とキャラ絵の組はこの下に置く（index.tsx）
   */
  headroom: number;
  /** 台本 */
  script: Cue[];
};

export type FxTier = {
  /** この額（JPY）以上でこの段 */
  min: number;
  /**
   * 段の色（YouTube のスパチャの色の切れ目と色に揃える）。札のふち・光・粒の色の元。
   * 見ている人はスパチャの色で額の大きさを知っているので、色で段が分かるようにする
   */
  accent: string;
  /** 名前の札。無ければ今までどおりの字（画面の真ん中） */
  plate?: PlateStyle;
  /** 演出の台本。あれば小物（`slots` / `files`）の代わりにこれを出す */
  show?: TierShow;
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

/** 切り絵の貯金箱。どの部品を使うか */
export type RigBankDef = {
  /** 振付けの名前（`season/bank/` の中。今は "kuro" だけ） */
  kind: "kuro";
  /** 走り回る子・器・ときどき横切るもの（`rigDir` の名前） */
  mascot: string;
  bucket: string;
  visitor?: string;
};

export type SeasonTheme = {
  id: string;
  /** JST の開始（含む）。`YYYY-MM-DDTHH:mm` */
  from: string;
  /** JST の終わり（含まない）。`YYYY-MM-DDTHH:mm` */
  until: string;
  /**
   * `false` なら期間中でも配信には出さない（`?theme=` の試し見だけで出る）。
   * 届いていない出来のものを、作り直しのあいだ下ろしておくため。
   */
  live?: boolean;
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
  /**
   * 切り絵の貯金箱。あればこちらを先に使う。部品が1つでも読めなければ、
   * 下の `bank`（コマ送り）に落ちる。それも読めなければ豚
   */
  rigBank?: RigBankDef;
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

/**
 * ちびおばけ（段1、〜199円）の台本。前兆なし（2版目）。左下のランタンのふたが2回カタカタ（溜め）→
 * 3回目で「ばあ！」→ おばけが右上の帯へ弧を描いて飛ぶ。その人のキャラ絵は最初から出ている（段1〜3）
 */
const GHOST: Cue[] = [
  { at: 0.0, do: "lanternIn", dur: 0.3 },
  { at: 0.45, do: "lidRattle", dur: 0.32 },
  { at: 0.95, do: "lidRattle", dur: 0.32 },
  { at: 1.45, do: "boo" },
  { at: 1.6, do: "textIn" },
  { at: 1.85, do: "settle", dur: 0.9 },
  { at: 2.9, do: "stay" },
  { at: -2.8, do: "finale", dur: 2.6 },
];

/**
 * ほうきのクロとこうもりの追いかけっこ（段2、200〜499円）の台本。前兆なし（2版目）。
 * クロが左の外から飛び込み、帯を左右に往復し続ける（往復は振付けが自分で回す）。こうもりが追う
 */
const BROOM_CHASE: Cue[] = [
  { at: 0.0, do: "batsIn", dur: 1.6 },
  { at: 1.5, do: "textIn" },
  { at: -2.8, do: "finale", dur: 2.6 },
];

/**
 * かぼちゃ坊や3人組の行進（段3、500〜999円）の台本。登場 2.5 秒・前兆なし（設計書 v3）。
 * その人のキャラ絵は最初から出ている（段1〜3）ので、坊やは面の上の端の帯だけを歩く
 */
const MARCH: Cue[] = [
  { at: 0.0, do: "marchIn", dur: 1.7 },
  { at: 1.9, do: "tada" },
  // 字は「ジャン！」と同時に1字ずつ弾んで出る
  { at: 1.9, do: "textIn" },
  { at: 2.0, do: "candyBurst", n: 34, dur: 0.3 },
  { at: 2.6, do: "stay" },
  // 締め（終わりの 3 秒前から）。右へ行進して去る
  { at: -3.0, do: "finale", dur: 2.6 },
];

/**
 * 魔法使いのあやと（段4、1,000〜1,999円）の台本。登場 4 秒・前兆は金のきらめき 0.5 秒（設計書 v3）。
 * その人のキャラ絵は、あやとが札の上へ退いてから出る
 */
const WIZARD: Cue[] = [
  { at: 0.0, do: "glimmer", dur: 0.5 },
  { at: 0.45, do: "circle", dur: 0.5 },
  { at: 0.8, do: "flyIn", dur: 1.5 },
  { at: 2.35, do: "cast" },
  { at: 2.6, do: "write", dur: 0.9 },
  { at: 3.6, do: "don" },
  { at: 4.0, do: "retreat", dur: 0.8 },
  { at: 4.3, do: "reveal" },
  { at: 5.2, do: "stay" },
  // 締め（終わりの 3 秒前から）。大きな弧で右上へ飛び去る
  { at: -3.0, do: "finale", dur: 2.6 },
];

/**
 * 死神のあやと（段5、2,000〜4,999円）の台本。登場 5 秒・前兆は端の暗さと鬼火 0.8 秒（構成 v3）。
 * 振り抜いた瞬間に一瞬止める。字は斬撃の跡から切り出される（`write`。振付けが左から広げる）。
 * その人のキャラ絵は、死神が上の帯の左の角へ退いてから出る
 */
const REAPER: Cue[] = [
  { at: 0.0, do: "darken", to: 0.9, dur: 0.5 },
  { at: 0.05, do: "wisps", n: 6, dur: 0.75 },
  { at: 0.75, do: "mist", dur: 0.7 },
  { at: 1.05, do: "appear", dur: 0.7 },
  { at: 2.1, do: "slash" },
  // 斬撃の光が伸びきって、閃光がいちばん明るいところで止める
  { at: 2.28, do: "hitstop", dur: 0.07 },
  { at: 2.28, do: "shake", dur: 0.22 },
  { at: 2.3, do: "write", dur: 0.32 },
  { at: 3.0, do: "don" },
  { at: 3.45, do: "cast" },
  { at: 4.15, do: "retreat", dur: 0.8 },
  { at: 4.9, do: "reveal" },
  { at: 5.6, do: "stay" },
  // 締め（終わりの 3 秒前から）。フードをひるがえして霧に消える
  { at: -3.0, do: "finale", dur: 2.6 },
];

/**
 * ゾンビのあやと（段6、5,000〜9,999円）の台本。登場 6.5 秒・前兆は端の暗さ＋紫の稲光2回＋地鳴り
 * 1.2 秒（構成 v3）。墓から這い出した瞬間に一瞬止める。字は踊り出してから1字ずつ弾んで出る。
 * その人のキャラ絵は、ゾンビが上の帯の右の角へ跳んでから出る
 */
const ZOMBIE: Cue[] = [
  { at: 0.0, do: "darken", to: 0.92, dur: 0.5 },
  { at: 0.1, do: "rumble", dur: 1.05 },
  { at: 0.3, do: "lightning", n: 0 },
  { at: 0.85, do: "lightning", n: 1 },
  { at: 1.2, do: "graves", dur: 0.9 },
  { at: 2.2, do: "hand", dur: 0.65 },
  { at: 2.9, do: "rise", dur: 0.45 },
  // 土から伸び上がりきったところで止める
  { at: 3.08, do: "hitstop", dur: 0.06 },
  { at: 3.08, do: "shake", dur: 0.25 },
  { at: 3.65, do: "dance" },
  { at: 3.75, do: "lightning", n: 2 },
  { at: 3.8, do: "friends", dur: 0.5 },
  { at: 4.35, do: "textIn" },
  { at: 5.25, do: "don" },
  { at: 5.7, do: "retreat", dur: 0.8 },
  { at: 6.3, do: "reveal" },
  { at: 6.9, do: "stay" },
  // 締め（終わりの 3 秒前から）。墓へずぼっと戻る
  { at: -3.0, do: "finale", dur: 2.6 },
];

/**
 * ドラキュラのあやと（段7、10,000円〜）の台本。いちばん上の段なので「超絶リッチ」:
 * 紫の前兆 → 古城と満月 → 赤じゅうたんが転がって伸びる → 棺 → 起き上がる →
 * **マントばさっ**（紫から赤へ。金の閃光・紙吹雪・花火）→ 数え上げ「ドン」→ その人の番
 */
const DRACULA: Cue[] = [
  // 前兆（紫）。ほかのものは何も出ていない
  { at: 0.0, do: "darken", to: 0.82, dur: 0.4 },
  { at: 0.4, do: "pulse", n: 0.55 },
  { at: 0.8, do: "pulse", n: 1 },
  { at: 0.9, do: "batVortex", n: 20, dur: 0.6 },
  { at: 1.5, do: "flash" },
  // 登場: 古城と満月 → 赤じゅうたん → 棺
  { at: 1.6, do: "castleRise", dur: 0.7 },
  { at: 1.75, do: "carpetRoll", dur: 0.6 },
  // じゅうたんが敷き終わってから棺が落ちる
  { at: 2.55, do: "coffinDrop", dur: 0.3 },
  { at: 2.85, do: "shake", dur: 0.25 },
  { at: 2.85, do: "hitstop", dur: 0.08 },
  { at: 3.05, do: "lidRattle", dur: 0.36 },
  { at: 3.41, do: "lidOpen" },
  { at: 3.41, do: "coinFountain", n: 60, dur: 0.6 },
  { at: 3.55, do: "rise", dur: 0.6 },
  // マントばさっ（紫から赤へ）
  { at: 4.2, do: "capeOpen", dur: 0.35 },
  { at: 4.2, do: "hitstop", dur: 0.06 },
  { at: 4.25, do: "confetti", n: 44, dur: 2.2 },
  { at: 4.3, do: "fireworks", n: 3 },
  { at: 4.4, do: "plateIn", dur: 0.6 },
  { at: 4.45, do: "glint" },
  { at: 4.9, do: "count", dur: 1.0 },
  { at: 4.9, do: "coinRain", n: 50, dur: 1.0 },
  { at: 5.9, do: "don" },
  { at: 5.9, do: "fireworks", n: 2 },
  // その人の番（字はキャラ絵の上下中央へ落ちる）。ヒットストップ2回（0.14 秒）ぶん後ろへずれて 6.5 秒
  { at: 6.36, do: "reveal", dur: 0.8 },
  { at: 6.36, do: "retreat", to: 0.16, dur: 2.5 },
  { at: 8.9, do: "stay" },
  // 締め（終わりの4秒前から）
  { at: -4.0, do: "finale", dur: 4 },
];

export const THEMES: SeasonTheme[] = [
  {
    id: "halloween",
    /* 10/23 に 20点で下ろし、7段に作り直して 10/24 に出し直した（#1022）。
       下ろすときは live: false（`?theme=halloween` の試し見では出る） */
    from: "2026-10-01T00:00",
    // 10/31 23:59 まで。11/1 0:00 からは豚に戻る
    until: "2026-11-01T00:00",
    dir: "/alert/themes/halloween",
    /* 黒猫のクロが、かぼちゃのお菓子バケツのまわりを走り回る（設計書 §3.1 案A） */
    rigBank: { kind: "kuro", mascot: "kuro", bucket: "bucket", visitor: "bat" },
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
    /* 段は7つ（構成 v3、2026-10-24）。切れ目と色は YouTube のスパチャに揃える
       （〜199 青 / 〜499 水色 / 〜999 緑 / 〜1,999 黄 / 〜4,999 橙 / 〜9,999 マゼンタ / 1万〜 赤）。
       999 と 1,000 の差をいちばん大きく: 段1〜3 は脇役たち、段4 から あやとが主役。
       下の slots / files は台本（show）が無い段・部品が読めなかった日の小物。
       **どの段でも真ん中は空いている**（枠がそもそも真ん中に無い）。 */
    tiers: [
      {
        min: 0,
        accent: "#1565C0",
        plate: {
          frame: "round",
          edge: "#42A5F5",
          ink: "#020A18",
          stroke: 0.18,
          glow: 0.0,
          nameColor: "#FFFFFF",
          amountColor: "#E3F2FD",
          amountColor2: "#64B5F6",
          appearAt: 0.8,
        },
        /* ちびおばけがランタンから「ばあ！」。小物（下の slots / files）は、部品が読めなかった日の控え */
        show: {
          kind: "ghost",
          rigs: ["ghost", "bat"],
          revealSec: 0,
          headroom: 0.17,
          script: GHOST,
        },
        slots: 2,
        files: ["fx-web.png", "fx-pumpkin.png", "fx-candy.png"],
        bats: 1,
        waves: 1,
      },
      {
        min: 200,
        accent: "#00B8D4",
        plate: {
          frame: "round",
          edge: "#00E5FF",
          ink: "#00141A",
          stroke: 0.19,
          glow: 0.0,
          nameColor: "#FFFFFF",
          amountColor: "#E0F7FA",
          amountColor2: "#26C6DA",
          appearAt: 0.8,
        },
        /* ほうきに乗ったクロを、こうもりの子が追いかける（クロは貯金箱のマスコット。先に読めている）。
           小物は控え */
        show: {
          kind: "broom",
          rigs: ["kuro", "broom", "bat"],
          revealSec: 0,
          headroom: 0.22,
          script: BROOM_CHASE,
        },
        slots: 3,
        files: ["fx-web.png", "fx-pumpkin.png", "fx-candy.png"],
        bats: 2,
        waves: 1,
      },
      {
        min: 500,
        accent: "#00C853",
        plate: {
          frame: "round",
          edge: "#1DE9B6",
          ink: "#01160C",
          stroke: 0.2,
          glow: 0.25,
          nameColor: "#FFFFFF",
          amountColor: "#E8F5E9",
          amountColor2: "#69F0AE",
          appearAt: 0.8,
        },
        /* かぼちゃ坊や3人組が面の上の端を、竿の小旗を振りながら行進してくる。
           小物（下の slots / files）は、部品が読めなかった日の控え */
        show: {
          kind: "march",
          // バケツは貯金箱のマスコットの絵（先に読めている）。お菓子を撒くときに掲げる
          rigs: ["pumpkin_kid", "bat", "bucket"],
          revealSec: 0,
          headroom: 0.2,
          script: MARCH,
        },
        slots: 4,
        files: ["fx-web.png", "fx-pumpkin.png", "fx-candy.png"],
        bats: 3,
        waves: 1,
      },
      {
        min: 1000,
        accent: "#FFCA28",
        plate: {
          frame: "round",
          edge: "#FFCA28",
          ink: "#1C1300",
          stroke: 0.21,
          glow: 0.4,
          nameColor: "#FFFFFF",
          amountColor: "#FFFDE7",
          amountColor2: "#FFCA28",
          appearAt: 0.8,
        },
        /* 魔法使いのあやとがほうきで飛び込み、杖の光で札を書く。小物（下の slots / files）は、
           ポーズ絵が読めなかった日の控え */
        show: {
          kind: "wizard",
          rigs: [],
          poses: ["wizard"],
          revealSec: 4.3,
          headroom: 0.2,
          script: WIZARD,
        },
        slots: 5,
        files: ["fx-web.png", "fx-pumpkin.png", "fx-candy.png", "fx-ghost.png"],
        bats: 4,
        waves: 1,
      },
      {
        min: 2000,
        accent: "#FF9100",
        plate: {
          frame: "round",
          edge: "#FF9100",
          ink: "#1C0B00",
          stroke: 0.22,
          glow: 0.55,
          nameColor: "#FFFFFF",
          amountColor: "#FFF3E0",
          amountColor2: "#FFA726",
          appearAt: 0.8,
        },
        /* 死神のあやとが霧の中から現れ、大鎌の斬撃で字を切り出す。小物（下の slots / files）は、
           ポーズ絵が読めなかった日の控え。止めた 0.07 秒のぶん、その人の絵は 4.97 秒 */
        show: {
          kind: "reaper",
          rigs: ["bat"],
          poses: ["reaper"],
          items: ["reaper"],
          revealSec: 4.97,
          headroom: 0.2,
          script: REAPER,
        },
        slots: 6,
        files: ["fx-web.png", "fx-pumpkin.png", "fx-candy.png", "fx-ghost.png", "fx-grave.png"],
        bats: 6,
        waves: 1,
      },
      {
        min: 5000,
        accent: "#E91E63",
        plate: {
          frame: "round",
          edge: "#FF4081",
          ink: "#1A0109",
          stroke: 0.23,
          glow: 0.75,
          nameColor: "#FFFFFF",
          amountColor: "#FCE4EC",
          amountColor2: "#FF5C93",
          appearAt: 0.8,
        },
        /* ゾンビのあやとが墓から這い出し、かぼちゃ坊やとちびおばけと踊る。小物（下の slots / files）は、
           ポーズ絵か仲間の部品が読めなかった日の控え。止めた 0.06 秒のぶん、その人の絵は 6.36 秒 */
        show: {
          kind: "zombie",
          rigs: ["pumpkin_kid", "ghost", "bat"],
          poses: ["zombie"],
          items: ["zombie"],
          revealSec: 6.36,
          headroom: 0.2,
          script: ZOMBIE,
        },
        slots: 8,
        files: [
          "fx-web.png",
          "fx-pumpkin.png",
          "fx-candy.png",
          "fx-ghost.png",
          "fx-grave.png",
          "fx-zombie.png",
        ],
        bats: 8,
        waves: 1,
      },
      {
        min: 10000,
        accent: "#D50000",
        plate: {
          frame: "gold",
          edge: "#F4C24E",
          ink: "#2A0208",
          stroke: 0.24,
          glow: 1.0,
          nameColor: "#FFF1C9",
          amountColor: "#FFF8E1",
          amountColor2: "#FFC107",
        },
        /* 紫の前兆 → 古城と満月 → 赤じゅうたん → 棺 → ドラキュラのあやと（マントばさっで赤へ）→
           数え上げ「ドン」。小物（下の slots / files）は、絵が読めなかった日の控え */
        show: {
          kind: "dracula",
          rigs: ["bat", "props"],
          poses: ["dracula"],
          items: ["dracula"],
          revealSec: 6.5,
          headroom: 0.2,
          script: DRACULA,
        },
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
    if (th.live === false) continue;
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

/** 切り絵の部品の置き場（`<dir>/rig/<名前>/rig.json` と部品の絵） */
export const rigDir = (th: SeasonTheme, name: string) => `${th.dir}/rig/${name}`;
/** あやとの仮装のポーズ絵の置き場（`poses.json` と絵） */
export const posesDir = (th: SeasonTheme, name: string) => `${th.dir}/poses/${name}`;

/** 段の小物の置き場（`items.json` と絵） */
export const itemsDir = (th: SeasonTheme, name: string) => `${th.dir}/items/${name}`;

/** テーマが読む小物の組ぜんぶ */
export function themeItems(th: SeasonTheme): string[] {
  const out = new Set<string>();
  th.tiers.forEach((t) => t.show?.items?.forEach((p) => out.add(p)));
  return [...out];
}

/** テーマが読むポーズ絵の組ぜんぶ */
export function themePoses(th: SeasonTheme): string[] {
  const out = new Set<string>();
  th.tiers.forEach((t) => t.show?.poses?.forEach((p) => out.add(p)));
  return [...out];
}

/** テーマが使う切り絵の名前ぜんぶ（貯金箱と、段の演出の両方） */
export function themeRigs(th: SeasonTheme): string[] {
  const out = new Set<string>();
  if (th.rigBank) {
    out.add(th.rigBank.mascot);
    out.add(th.rigBank.bucket);
    if (th.rigBank.visitor) out.add(th.rigBank.visitor);
  }
  th.tiers.forEach((t) => t.show?.rigs.forEach((r) => out.add(r)));
  return [...out];
}

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
