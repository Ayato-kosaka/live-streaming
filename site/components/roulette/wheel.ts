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

/**
 * 扇に載せる字の大きさ。**枚数で決めてから、字数で縮める。**
 * @param text 出す字
 * @param n 全部で何枚か
 */
export function labelSize(text: string, n: number): number {
  const base =
    n <= 6 ? 66 : n <= 8 ? 60 : n <= 10 ? 54 : n <= 12 ? 46 :
      n <= 16 ? 36 : n <= 24 ? 27 : 21;
  const len = Array.from(text).length;
  if (len <= 2) return base;
  const k = (2.6 / Math.min(len, 9)) ** 0.48;
  return Math.max(n <= 12 ? 27 : 18, Math.round(base * k));
}

/** 扇に出せる字数。これより長いものは切って「…」を付ける。 */
export function labelText(text: string): string {
  const cs = Array.from(text);
  return cs.length > 9 ? `${cs.slice(0, 8).join("")}…` : text;
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
