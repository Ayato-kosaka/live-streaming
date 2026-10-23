/**
 * 季節の小物とコマ送りの動き（CSS の keyframes）。
 *
 * **動かすのは transform と opacity だけ。** どれも小さい要素1つずつに当てるので、
 * 毎フレーム描き直す面積はその小物の大きさで済む（`CLAUDE.md`「島の SVG の中で
 * 動かしたものは、その形の外接矩形ぶんが毎フレーム描き直される」）。
 * 大きいもの（画面いっぱいの入れ物）は動かさない。
 *
 * 時計は CSS が持つ。出る時刻は `animation-delay` で先に全部渡すので、
 * 出ているあいだ JS は何もしない。アラートが消えれば要素ごと消えるので、
 * アラートの無いあいだ（ほぼ一日中）は1つも動いていない。
 *
 * **keyframes に CSS 変数（`var()`）を入れない。** 変数の入った transform は
 * Chrome が合成スレッドへ渡さずメインで回すので、アラート中の CPU が 1秒あたり
 * 2割ほど上がっていた（`ProcessTime` で測った）。左右で向きの変わる動きは、
 * 書くときは `calc(var(--dir) * …)` で1本にしておき、差すときに左（-l）と
 * 右（-r）の2本へ数字を埋めて展開する。
 */

/* コマ送りは opacity ではなく visibility で切り替える。opacity 0 のコマは合成レイヤーとして
   描かれずに置かれ、負荷が高いと出た瞬間に描けていない（`ThemedGauge.tsx` の頭）。
   visibility はふつうの描き直しになるので、描き終わるまで前のコマが出たまま */
const FRAME_STEPS = (n: number) => `
@keyframes ss-frame-${n} {
  0% { visibility: visible; }
  ${(100 / n).toFixed(4)}% { visibility: hidden; }
  100% { visibility: hidden; }
}`;

/* 小物の動き。`--dir` は書くときだけの印（左の枠で 1、右の枠で -1）。差す前に数字にする */
const MOTIONS = `
/* 下からぴょこっと出て、もう1回跳ねて、引っ込む（かぼちゃ） */
@keyframes ss-pop {
  0%   { transform: translateY(110%) scale(1, 1); opacity: 0; }
  5%   { opacity: 1; }
  13%  { transform: translateY(-12%) scale(0.92, 1.1); }
  19%  { transform: translateY(0) scale(1.12, 0.88); }
  25%  { transform: translateY(0) scale(0.97, 1.04); }
  30%  { transform: translateY(0) scale(1, 1); }
  46%  { transform: translateY(0) scale(1.07, 0.93); }
  53%  { transform: translateY(-16%) scale(0.94, 1.07); }
  60%  { transform: translateY(0) scale(1.09, 0.91); }
  66%  { transform: translateY(0) scale(1, 1); }
  84%  { transform: translateY(0) scale(1, 1); opacity: 1; }
  90%  { transform: translateY(-6%) scale(0.96, 1.05); }
  100% { transform: translateY(115%) scale(1, 1); opacity: 0; }
}

/* 下からどすんと出て、少し傾いてから沈む（墓） */
@keyframes ss-thud {
  0%   { transform: translateY(110%) rotate(0deg) scale(1, 1); opacity: 0; }
  4%   { opacity: 1; }
  11%  { transform: translateY(-5%) rotate(0deg) scale(1, 1); }
  15%  { transform: translateY(0) rotate(0deg) scale(1.08, 0.92); }
  21%  { transform: translateY(0) rotate(0deg) scale(1, 1); }
  38%  { transform: translateY(0) rotate(calc(var(--dir) * -5deg)); }
  54%  { transform: translateY(0) rotate(calc(var(--dir) * 3deg)); }
  68%  { transform: translateY(0) rotate(calc(var(--dir) * -2deg)); }
  84%  { transform: translateY(0) rotate(0deg); opacity: 1; }
  100% { transform: translateY(112%) rotate(0deg); opacity: 0; }
}

/* 下からのそっと出て、左右に揺れる（ゾンビ） */
@keyframes ss-shamble {
  0%   { transform: translateY(100%) rotate(0deg); opacity: 0; }
  6%   { opacity: 1; }
  24%  { transform: translateY(5%) rotate(-6deg); }
  31%  { transform: translateY(0) rotate(5deg); }
  43%  { transform: translateY(0) rotate(-6deg); }
  55%  { transform: translateY(-3%) rotate(6deg); }
  67%  { transform: translateY(0) rotate(-5deg); }
  79%  { transform: translateY(0) rotate(4deg); opacity: 1; }
  100% { transform: translateY(106%) rotate(0deg); opacity: 0; }
}

/* 下から跳ね上がって、くるっと回る（お菓子） */
@keyframes ss-hop {
  0%   { transform: translateY(110%) rotate(0deg) scale(1, 1); opacity: 0; }
  4%   { opacity: 1; }
  15%  { transform: translateY(-55%) rotate(calc(var(--dir) * 200deg)) scale(1, 1); }
  25%  { transform: translateY(0) rotate(calc(var(--dir) * 360deg)) scale(1.12, 0.88); }
  31%  { transform: translateY(0) rotate(calc(var(--dir) * 360deg)) scale(1, 1); }
  48%  { transform: translateY(0) rotate(calc(var(--dir) * 360deg)) scale(1, 1); }
  57%  { transform: translateY(-26%) rotate(calc(var(--dir) * 380deg)) scale(1, 1); }
  65%  { transform: translateY(0) rotate(calc(var(--dir) * 360deg)) scale(1.08, 0.92); }
  71%  { transform: translateY(0) rotate(calc(var(--dir) * 360deg)) scale(1, 1); }
  86%  { transform: translateY(0) rotate(calc(var(--dir) * 360deg)); opacity: 1; }
  100% { transform: translateY(115%) rotate(calc(var(--dir) * 360deg)); opacity: 0; }
}

/* 角から広がって、ゆらゆら（蜘蛛の巣）。原点は角 */
@keyframes ss-unfurl {
  0%   { transform: scale(0.15) rotate(calc(var(--dir) * -16deg)); opacity: 0; }
  9%   { transform: scale(1.07) rotate(calc(var(--dir) * 3deg)); opacity: 1; }
  15%  { transform: scale(0.97) rotate(calc(var(--dir) * -1deg)); }
  21%  { transform: scale(1) rotate(0deg); }
  40%  { transform: scale(1) rotate(calc(var(--dir) * -3deg)); }
  60%  { transform: scale(1) rotate(calc(var(--dir) * 2.5deg)); }
  78%  { transform: scale(1) rotate(calc(var(--dir) * -1.5deg)); }
  88%  { transform: scale(1) rotate(0deg); opacity: 1; }
  100% { transform: scale(0.8) rotate(calc(var(--dir) * -8deg)); opacity: 0; }
}

/* 横から入ってきて、上下にふわふわ、斜め上へ抜ける（おばけ） */
@keyframes ss-float {
  0%   { transform: translate(calc(var(--dir) * -120%), 0); opacity: 0; }
  16%  { transform: translate(calc(var(--dir) * 14%), -8%); opacity: 0.95; }
  31%  { transform: translate(calc(var(--dir) * 9%), 7%); }
  47%  { transform: translate(calc(var(--dir) * 15%), -8%); }
  63%  { transform: translate(calc(var(--dir) * 10%), 7%); }
  79%  { transform: translate(calc(var(--dir) * 13%), -5%); opacity: 0.95; }
  100% { transform: translate(calc(var(--dir) * -45%), -45%); opacity: 0; }
}

`;

/** `MOTIONS` を左右2本に展開する（`ss-pop` → `ss-pop-l` / `ss-pop-r`） */
function sided(dir: 1 | -1, tag: "l" | "r"): string {
  return MOTIONS.replace(
    /calc\(var\(--dir\) \* (-?[\d.]+)(deg|%)\)/g,
    (_, n: string, unit: string) => `${Number(n) * dir}${unit}`
  ).replace(/@keyframes ss-([a-z]+)/g, `@keyframes ss-$1-${tag}`);
}

const CSS = `${FRAME_STEPS(2)}
${FRAME_STEPS(4)}
${sided(1, "l")}
${sided(-1, "r")}`;

const ID = "season-fx-css";

/** 1ページに1回だけ差す。2回目からは何もしない */
export function ensureSeasonCss() {
  if (typeof document === "undefined") return;
  if (document.getElementById(ID)) return;
  const el = document.createElement("style");
  el.id = ID;
  el.textContent = CSS;
  document.head.appendChild(el);
}

/**
 * コマ送りの1枚に付ける animation。`n` 枚を `ms` ずつ出す。
 * 遅れを負にして、全部のコマが最初から同じ周回に乗るようにする
 * （下地と中身のコマが、同じ時刻に同じ番号になる）。
 */
export function frameAnimation(n: number, i: number, ms: number): string {
  const lag = ((n - i) % n) * ms;
  return `ss-frame-${n} ${n * ms}ms step-end ${-lag}ms infinite`;
}
