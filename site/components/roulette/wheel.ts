/**
 * ルーレットの寸法と色。**いま配信で使っているものを写したもの。**
 *
 * 出どころは `https://life-game-roulette.nanitabey0.chatgpt.site/`。
 * あちらは Vite で束ねた React の SPA で、この島とは別に建っている。
 * #164 でこちらへ移すにあたって、**色・角度・字の大きさ・イーズを
 * 1つずつ写した。** 見た目が変わると、いまの配信がその日から変わってしまう。
 *
 * **数値を「きれいに」しない。** 246 も 178 も 270 も、あちらの実物の値。
 * 揃えたくなるが、揃えた瞬間に別のルーレットになる。
 */

/** 色の並び。輪はこの順に塗って、足りなくなったら先頭へ戻る。 */
export const WHEEL_COLORS = {
  classic: [
    "#f7df08", "#f39a0d", "#ed4b13", "#ed0a25", "#ec0a70", "#8c198e",
    "#353078", "#17469b", "#1975a8", "#159260", "#42a72d",
  ],
  ocean: [
    "#ffcf3f", "#ff8c42", "#ff5263", "#9457eb", "#346beb", "#00a9ce",
    "#00c2a8", "#65c466",
  ],
  berry: [
    "#ffcc4d", "#ff7a59", "#ed3b8f", "#a942c9", "#5b4ee3", "#2d8fd5",
    "#21af8b",
  ],
  sunset: [
    "#ffe34f", "#ffb12b", "#f47b20", "#ef3e31", "#d92868", "#8a3ffc",
    "#4154c6",
  ],
} as const;

/** 筐体の色。輪の色とは別に持っている。 */
export const SHELL_COLORS = {
  classic: "#17812e",
  ocean: "#087f9b",
  berry: "#842f83",
  sunset: "#d85b22",
} as const;

export type WheelTheme = keyof typeof WHEEL_COLORS;

export const THEMES = Object.keys(WHEEL_COLORS) as WheelTheme[];

/** 色の名前。コントローラーの選択欄に出す。 */
export const THEME_NAME: Record<WheelTheme, string> = {
  classic: "いつもの",
  ocean: "海",
  berry: "ぶどう",
  sunset: "夕やけ",
};

/** 選択肢の上限。これを超えると輪の字が読めなくなる。 */
export const MAX_CANDIDATES = 36;

/**
 * 数のパラメータを、範囲に収める。読めない値は既定に落とす。
 * @param v URL から来た文字列
 * @param def 既定値
 * @param min 下限
 * @param max 上限
 */
export function num(
  v: string | null,
  def: number,
  min: number,
  max: number,
): number {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : def;
}

/**
 * 入／切のパラメータ。`0` `false` `off` `no` だけが「切」。
 * @param v URL から来た文字列
 * @param def 指定が無いときの値
 */
export function flag(v: string | null, def: boolean): boolean {
  if (v === null) return def;
  return !["0", "false", "off", "no"].includes(v.toLowerCase());
}

/**
 * `candidates` を読む。**3通りの書きかたを受ける。**
 * 同じ名前を繰り返す・JSON の配列・区切り文字（`,` `|` `、`）。
 * どれも、いままでの URL がそのまま通るようにするため。
 * @param sp URL のパラメータ
 */
export function parseCandidates(sp: URLSearchParams): string[] {
  const all = sp.getAll("candidates").map((s) => s.trim()).filter(Boolean);
  if (all.length > 1) return all.slice(0, MAX_CANDIDATES);
  if (!all[0]) return [];
  const one = all[0];
  if (one.startsWith("[")) {
    try {
      const j = JSON.parse(one);
      if (Array.isArray(j)) {
        return j.map(String).map((s) => s.trim()).filter(Boolean)
          .slice(0, MAX_CANDIDATES);
      }
    } catch {
      /* JSON に見えて JSON でないときは、下の区切り文字として読む */
    }
  }
  return one.split(/[|,、]/).map((s) => s.trim()).filter(Boolean)
    .slice(0, MAX_CANDIDATES);
}

/** 輪の中心（`viewBox` は 600×600）。 */
const CX = 300;
const CY = 300;

/**
 * 中心から角度と距離で1点。角度は3時方向が 0 度。
 * @param r 中心からの距離
 * @param deg 角度
 */
export function polar(r: number, deg: number): { x: number; y: number } {
  const a = (deg * Math.PI) / 180;
  return { x: CX + r * Math.cos(a), y: CY + r * Math.sin(a) };
}

/**
 * 扇1枚のパス。**12時のまん中が1枚目の中心**になるように半枚ぶんずらす。
 * @param i 何枚目か
 * @param n 全部で何枚か
 * @param r 半径
 */
export function wedgePath(i: number, n: number, r = 246): string {
  const step = 360 / n;
  const from = -90 - step / 2 + i * step;
  const to = from + step;
  const a = polar(r, from);
  const b = polar(r, to);
  return `M ${CX} ${CY} L ${a.x} ${a.y} A ${r} ${r} 0 ${
    +(step > 180)
  } 1 ${b.x} ${b.y} Z`;
}

/* ── 輪の札の置きかた ────────────────────────────────────────────────
   写した元は、札を**半径178に、半径と直角に**置いて、長さを見ていなかった。
   扇に入る幅は `2 × 178 × tan(180/n)` しかないので、6件でも字幅が
   1.3〜1.5倍あふれ、36件では 4〜5倍あふれて**黒い輪1本**になっていた。
   下半分は回す角が180度を超えるので**上下さかさま**でもあった
   （6件で3枚、36件で17枚）。

   直したのは**置きかたそのものではなく、寸法の決めかた**。

   1. 扇に入る大きさを解いてから字を置く（`fitLabel`）。長いものは折る
   2. 回す角は必ず ±90度の中に入れる。**さかさまの札は出得ない**
   3. それでも読める大きさに入らないなら、**小さくせずに番号へ降ろす**

   向きは2通りあって、札ごとではなく**輪ごとに**どちらかを選ぶ。

   | 向き | 字の走る方向 | 得意 |
   | --- | --- | --- |
   | `across` | 半径と直角（写した元と同じ） | 扇が太いとき。**12時の札が水平になる** |
   | `along`  | 半径に沿う | 扇が細いとき。長さに 126 使える |

   12時は**当たりが止まる場所**なので、同じくらい入るなら `across` を採る。
   数はどれも輪の寸法（扇 246・真ん中の円 105＋枠8）から出したもので、
   **輪そのものの寸法は1つも変えていない。** */

/** 札がはみ出してはいけない線。扇の縁（246）から、ふちと落ち影のぶんを引いた値 */
export const R_EDGE = 240;
/** 札の外端の上限。ここより外には置かない */
export const R_OUT = 238;
/** 札の内端。真ん中の円（105＋枠8＝109）に乗らないところまで */
export const R_IN = 112;
/** 行の高さ（字の大きさに対する比） */
export const LINE = 1.06;
/** 扇の幅のうち、字に使ってよい割合。残りは左右の余白 */
const FILL = 0.82;
/** 1枚の札を何行まで折るか。これ以上折ると1行2文字の縦積みになる */
const MAX_LINES = 4;
/** 短い札が大きくなりすぎないための上限 */
export const MAX_SIZE = 56;
/**
 * これを割ったら、輪には**番号だけ**を載せる（viewBox の単位）。
 *
 * 実測で viewBox 1単位は 1920 で 0.84px、1280 で 0.69px。
 * 20 は **1920 で 16.8px、1280 で 13.8px**。配信の画面で、
 * 主役ではない札が読める下限をここに置いた。
 * これより小さくしないと入らないなら、**小さくするのではなく番号に降ろす**。
 */
const MIN_SIZE = 20;

/** 札の向き。`across` は半径と直角、`along` は半径に沿う */
export type Placement = "across" | "along";

/**
 * 字1つぶんの幅（em）。**実測した値**（M PLUS Rounded 1c 900、
 * `letter-spacing: -0.06em` 込み。font-size 100 で測って 100 で割った）。
 *
 *   かな・漢字 0.94 ／ 数字 0.60 ／ ラテン小文字 0.50
 *
 * 見込みでしかないので、描いたあとに `Wheel.tsx` が
 * `getComputedTextLength()` で測り直して合わせる。ここは初手の当たり。
 * @param ch 1文字
 */
function charEm(ch: string): number {
  if (ch === " ") return 0.28;
  const c = ch.codePointAt(0) ?? 0;
  if (c >= 0x30 && c <= 0x39) return 0.6;
  if (c < 0x2e80) return 0.52;
  return 0.94;
}

/** 字の並びの幅（em）。 */
export function advanceEm(text: string): number {
  let w = 0;
  for (const ch of text) w += charEm(ch);
  return w;
}

/** 行の頭に置かない字（小書きのかな・長音・閉じ括弧・句読点）。 */
const NO_HEAD = "ぁぃぅぇぉっゃゅょゎァィゥェォッャュョヮーヽヾ々、。，．!?！？）」』】〕〉》〟”";

/**
 * 字を k 行に割る。**幅がなるべく揃うように**割る。
 * 日本語は分かち書きしないので区切りは字の位置で決めるが、
 * 小書きのかなや長音が行頭に来る割りかたは避ける。
 * @param text 割る字
 * @param k 何行にするか
 */
export function splitLines(text: string, k: number): string[] {
  const cs = Array.from(text);
  if (k <= 1 || cs.length <= 1) return [text];
  const w = cs.map(charEm);
  const total = w.reduce((a, b) => a + b, 0);
  const lines: string[] = [];
  let cur = "";
  let acc = 0;
  let used = 0;
  for (let i = 0; i < cs.length; i++) {
    const left = k - lines.length;
    const target = (total - used) / left;
    const room = cs.length - i >= left; // 残りの行数ぶんの字が残っているか
    if (cur && left > 1 && acc + w[i] > target && room && !NO_HEAD.includes(cs[i])) {
      lines.push(cur);
      used += acc;
      cur = "";
      acc = 0;
    }
    cur += cs[i];
    acc += w[i];
  }
  lines.push(cur);
  return lines.map((t) => t.trim()).filter(Boolean);
}

/** 1枚の札の、行の割りかたと字の大きさ。 */
export type FitLabel = {
  lines: string[];
  /** viewBox の単位での字の大きさ */
  size: number;
  /** 札の外端（中心からの距離）。扇の縁に角が当たらないところまで内に寄せてある */
  rOut: number;
};

/**
 * 1つの向きで、扇に収まる大きさと、札の外端を解く。
 *
 * 見るのは2つ。
 *
 * 1. **扇の幅**。扇の幅は半径に比例するので、いちばん内側で入るかを見る。
 *    大きくするほど内へ伸びて幅が減るので、その釣り合いを1次式で解く
 * 2. **扇の縁（円）**。札は四角いので、**角が縁をいちばん先に越える**。
 *    角までの距離は `√(外端² + 横幅の半分²)`。これを 240 に収める。
 *    角を見ずに外端だけ見ていたときは、5件で r=259（縁は 246）まで
 *    出ていて、札の角が外の白い輪に乗っていた
 *
 * 2は外端と大きさが互いに効くので、3回くり返して落ち着かせる。
 * @param m いちばん長い行の幅（字の大きさ1あたり）
 * @param k 行数
 * @param tw 扇の幅の係数（`2 × tan(180/n) × FILL`）
 * @param place 向き
 */
export function solveSize(
  m: number,
  k: number,
  tw: number,
  place: Placement,
): { size: number; rOut: number } {
  const depth = R_OUT - R_IN;
  let rOut = R_OUT;
  let size = 0;
  for (let i = 0; i < 4; i++) {
    size =
      place === "along"
        ? Math.min(MAX_SIZE, depth / m, (tw * rOut) / (k * LINE + tw * m))
        : Math.min(MAX_SIZE, depth / (k * LINE), (tw * rOut) / (m + tw * (k - 0.5) * LINE));
    // 札の横幅の半分（`across` は行の長さ、`along` は行を積んだ厚み）
    const half = ((place === "across" ? m : k * LINE) * size) / 2;
    rOut = Math.min(R_OUT, Math.sqrt(Math.max(1, R_EDGE * R_EDGE - half * half)));
  }
  return { size, rOut };
}

/**
 * 札1枚を、扇に収まる行数と大きさに落とす。
 * @param text 出す字
 * @param tw 扇の幅の係数
 * @param place 向き
 */
function fitOne(text: string, tw: number, place: Placement): FitLabel {
  const chars = Array.from(text).length || 1;
  const kMax = Math.min(MAX_LINES, chars);
  const tries: FitLabel[] = [];
  for (let k = 1; k <= kMax; k++) {
    const lines = splitLines(text, k);
    if (lines.length !== k) continue;
    const m = Math.max(...lines.map(advanceEm));
    tries.push({ lines, ...solveSize(m, k, tw, place) });
  }
  if (!tries.length) return { lines: [text], size: 0, rOut: R_OUT };
  const best = tries.reduce((a, b) => (b.size > a.size ? b : a));
  /* **行を増やして稼げるのがわずかなら、行の少ないほうを採る。**
     3文字×4行より4文字×3行のほうが読みやすい。6% を境にした */
  return tries.find((t) => t.size >= best.size * 0.94) ?? best;
}

/** 輪に何を載せるか。 */
export type WheelPlan = {
  /** `name` … 字をそのまま載せる ／ `number` … 番号だけ載せて、名前は輪の外へ */
  mode: "name" | "number";
  place: Placement;
  labels: FitLabel[];
};

/** 扇の幅の係数（`2 × tan(180/n) × FILL`）。n が 1 か 2 のときは半周以上あるので tan が使えない */
export const wedgeWidth = (n: number) => 2 * FILL * (n >= 3 ? Math.tan(Math.PI / n) : 3);

/**
 * 輪1枚ぶんの割り付け。
 *
 * 2つの向きを両方解いて、**いちばん小さい札が大きくなるほう**を採る。
 * ほぼ同じなら `across`（写した元と同じ向き。12時の札が水平になる）。
 *
 * **1枚でも読める大きさに収まらなければ、輪ぜんぶを番号に落とす。**
 * 混ぜない理由は、字の札と番号の札が並ぶと「番号のほうは何なのか」を
 * 見た人が考えることになるから。番号に落としたときは、名前を
 * 輪の外の控え（`.rl-legend`）に出す（`Display.tsx`）。
 *
 * **「…」で切らない。** 切ると、当たった札が何だったのか読めない。
 * @param labels 選択肢の字
 */
export function wheelPlan(labels: string[]): WheelPlan {
  const n = labels.length;
  if (!n) return { mode: "name", place: "across", labels: [] };
  const tw = wedgeWidth(n);
  const pick = (texts: string[]): { place: Placement; labels: FitLabel[]; size: number } => {
    const across = texts.map((t) => fitOne(t, tw, "across"));
    const along = texts.map((t) => fitOne(t, tw, "along"));
    const a = Math.min(...across.map((f) => f.size));
    const b = Math.min(...along.map((f) => f.size));
    // 12時に当たりが止まるので、同じくらいなら水平になる across
    return a >= b * 0.96
      ? { place: "across", labels: across, size: a }
      : { place: "along", labels: along, size: b };
  };
  const named = pick(labels);
  if (named.size >= MIN_SIZE) return { mode: "name", place: named.place, labels: named.labels };
  const numbered = pick(labels.map((_, i) => String(i + 1)));
  /* **番号は全部おなじ大きさにする。** 桁が増えると入る大きさが変わるので、
     そのままだと「9」だけ大きい輪になる（実測で 38.6px と 18.0px が混ざった）。
     いちばん小さいものに揃える */
  const small = numbered.labels.reduce((a, b) => (b.size < a.size ? b : a));
  return {
    mode: "number",
    place: numbered.place,
    labels: numbered.labels.map((f) => ({ ...f, size: small.size, rOut: small.rOut })),
  };
}

/**
 * 結果の札の字の大きさ。字数で4段。
 * @param text 当たった字
 */
export function resultSize(text: string): string {
  const len = Array.from(text).length;
  if (len <= 2) return "clamp(5rem, 16vmin, 9.5rem)";
  if (len <= 4) return "clamp(3.8rem, 12.5vmin, 7.6rem)";
  if (len <= 7) return "clamp(3rem, 9vmin, 5.6rem)";
  return "clamp(2.15rem, 6.5vmin, 4.3rem)";
}

/**
 * 回り終わりの角度。
 *
 * **いまの角度から、当たりが真上に来るまでの差**を出して、そこに周回を足す。
 * 途中から見ても最後の向きは同じになるので、OBS を読み込み直しても
 * 同じところで止まる。
 * @param from いまの角度
 * @param index 当たりの番号
 * @param n 選択肢の数
 * @param turns 何周するか
 */
export function spinTo(
  from: number,
  index: number,
  n: number,
  turns: number,
): number {
  const step = n ? 360 / n : 360;
  const now = ((from % 360) + 360) % 360;
  const want = (((-index * step) % 360) + 360) % 360;
  return from + turns * 360 + ((want - now + 360) % 360);
}

/**
 * 回りかた。**5次のイーズアウト。** 最後にゆっくり止まる、あの動き。
 * @param i 0〜1 の進み
 */
export const ease = (i: number): number => 1 - (1 - i) ** 5;
