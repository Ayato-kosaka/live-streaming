/**
 * 島を歩くあやとの絵。**初めて歩くまでは1枚、歩き出したら 3向き×4コマのぱらぱら漫画。**
 *
 * 島2枚（`IsleStage.tsx` / `components/island/IslandStage.tsx`）は、主人公を
 * `<g className="ayato" transform="translate(x y) scale(±1 1)">` に置いていて、
 * その中身がここ。足元が原点（0, 0）、左を向いた絵を左右反転で右へ向ける。
 * **外側の `<g>` の置き方は変えない**（`island.css` の `.ayato`、`island-misses.md` #256）。
 *
 * ## React の state を通さない
 *
 * 歩いているかは、島の毎フレームの手続きが `.walking` を付け外ししている。
 * ここでも React の state は持たない（`docs/island-design.md`「動きは React の外で」）。
 * 島がするのは3つだけ。
 *
 *   1. `setAyatoWalking(g, on)` — `.walking` を付け外しする。**初めて歩いたときだけ**
 *      シートを読みにいき、読めたら `.walk-ready` を付ける
 *   2. `ayatoTurn(状態, vx, vy, dt)` で向きを決めて、`setAyatoDir(g, 向き)` で書く
 *      （段を選ぶ属性を、**変わったときだけ**書く）
 *   3. 外側の `<g>` の左右反転に `ayatoFlip(g, 向き, facing)` を使う
 *      （正面・背中の段は反転しない）
 *
 * 見た目の入れ替え（1枚 ⇄ シート）は `island.css` がクラスで決める。コマ送りだけは
 * Web Animations（`play`。理由はそこ）で、これも React の state は通らない。
 *
 * ## 止まったら、最後に歩いた向きのまま立つ
 *
 * シートを読んだあとは、止まっても1枚（`ayato.webp`）に戻さない。1枚は横向き
 * しか無いので、下へ歩いて止まった人がいきなり横を向く。止まったら、
 * **その向きの段の2コマ目**（`AYATO_WALK_REST`）を動かさずに出す。
 *
 * ## シートは、初めて歩いたときに読む
 *
 * 島を開いただけの人に、1バイトも足さない（スマホの最初の1画面の量を
 * 測って削った #876 を崩さない）。読み終わるまでは、いまの1枚＋ `hop` のまま歩く。
 * 読めなかったら、ずっとそのまま（歩けなくなるわけではないので、黙って1枚に倒す）。
 */
import type { CSSProperties } from "react";

import {
  AYATO_ASPECT,
  AYATO_SRC,
  AYATO_WALK_BODY_H,
  AYATO_WALK_FH,
  AYATO_WALK_FRAMES,
  AYATO_WALK_FW,
  AYATO_WALK_LIFT,
  AYATO_WALK_REST,
  AYATO_WALK_ROW,
  AYATO_WALK_ROWS,
  AYATO_WALK_SRC,
} from "@/lib/ayatoArt";

/** 歩く向き。シートの段（`AYATO_WALK_ROW`）と同じ名前。 */
export type AyatoDir = keyof typeof AYATO_WALK_ROW;

/** コマの縁から内側へ切る画素（シートの px）。`AyatoSprite` の窓の注記。 */
const INSET = 1;

/** 4コマを1周する秒数。 */
const CYCLE_S = 0.5;

/**
 * 横 ⇄ 上下を切り替えるのに要る、縦横の差。
 *
 * 大きいほうの向きをそのまま取ると、斜め45度あたりで1フレームごとに
 * 横と正面が入れ替わる（キーの斜め押し・指で斜めに押したとき）。
 * **いまの向きから離れるときだけ 1.3倍を要求する**ので、ちょうど斜めでは
 * どちらにも倒れず、いまの向きのまま歩く。
 */
const TURN = 1.3;

/**
 * シートの読み込みは、ページに1回。**島が2枚あっても、開き直しても1回。**
 * 済んだあとに出てきた島は、待たずにそのまま `.walk-ready` になる。
 */
let sheet: "idle" | "loading" | "ready" | "failed" = "idle";
const waiting = new Set<SVGGElement>();

/** 動きを減らす設定の人には、コマも送らないし、シートも読まない。 */
function still(): boolean {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

/** 読めたシートを、その島の主人公に差す。 */
function arm(g: SVGGElement) {
  if (!g.isConnected || g.classList.contains("walk-ready")) return;
  const img = g.querySelector<SVGImageElement>(".ayato-walk-sheet");
  if (!img) return;
  /* `href` を入れてから、**その `<image>` が描ける状態になるのを待って**印を付ける。
     先に印を付けると、1枚目が消えてシートがまだ空の1フレームが出る（あやとが一瞬消える）。
     解読は `new Image()` の側で済んでいて、同じ道なので2本目の要求は出ない。 */
  img.addEventListener(
    "load",
    () => {
      g.classList.add("walk-ready");
      // 読み終わったときにまだ歩いていれば、そのままコマ送りに入る
      if (g.classList.contains("walking")) play(g);
    },
    { once: true },
  );
  img.setAttribute("href", AYATO_WALK_SRC);
}

/**
 * コマ送りと弾み。**CSS の animation ではなく、Web Animations で回す。**
 *
 * 島は奥行きの並び（足元の y）が変わるたびに React が `<g>` を並べ替える。
 * あやとが下へ歩いて何かを追い越すと、React は**あやとの `<g>` のほうを
 * 抜いて差し直す。** CSS の animation は抜かれた瞬間に終わり、差し直すと
 * 1コマ目からやり直すので、下へ歩くあいだだけ足が「1→2→3→1→2…」と途中で
 * 巻き戻っていた（実測。上へ歩くときは React が相手のほうを動かすので起きない）。
 * スクリプトで作った animation は、要素が抜き差しされても時計を持ち続ける。
 *
 * 2本回す。シート（X。どのコマか）と、窓の外の `<g>`（Y。体の弾み）。
 * **同じ長さ・同じ段数・同じ遅れで、始まる時刻を同じ1つの値にそろえる**ので、
 * 弾みがコマからずれることはない（`startTime` を待たずに決める。決めないと、
 * 2本がそれぞれ「次のフレーム」で始まり、1フレームずれることがある）。
 *
 * 始まりは**立つコマの次**（負の遅れで1周の途中から）。立つコマ（index 1）は
 * 弾むコマなので、そこから始めると歩き出した瞬間に体が浮く。次のコマなら
 * 足は地面のまま一歩目が出る。
 */
const runs = new WeakMap<SVGGElement, Animation[]>();
function play(g: SVGGElement) {
  if (runs.has(g) || still()) return;
  const img = g.querySelector<SVGImageElement>(".ayato-walk-sheet");
  const bob = g.querySelector<SVGGElement>(".ayato-bob");
  if (!img || !bob || typeof img.animate !== "function") return;
  const ms = CYCLE_S * 1000;
  const n = AYATO_WALK_FRAMES;
  const timing = {
    duration: ms,
    iterations: Infinity,
    delay: (-ms * ((AYATO_WALK_REST + 1) % n)) / n,
  };
  const lift = Number(bob.dataset.lift || 0);
  /* Y はコマごとに値を持たせて、区間ごとに `step-end`（次のコマまで同じ値）。
     X の `steps(n)` と同じところで切り替わる */
  const ys: Keyframe[] = [];
  for (let i = 0; i <= n; i++) {
    ys.push({
      offset: i / n,
      transform: `translateY(${i % 2 === 1 && i < n ? -lift : 0}px)`,
      easing: "step-end",
    });
  }
  const pair = [
    img.animate(
      [{ transform: "translateX(0)" }, { transform: "translateX(-100%)" }],
      {
        ...timing,
        easing: `steps(${n})`,
      },
    ),
    bob.animate(ys, timing),
  ];
  const t0 = document.timeline.currentTime;
  for (const a of pair) a.startTime = t0;
  runs.set(g, pair);
}
/** 止める。止まったあとは CSS の `--ayato-rest`（立つコマ）に戻る */
function halt(g: SVGGElement) {
  for (const a of runs.get(g) ?? []) a.cancel();
  runs.delete(g);
}

/**
 * 島の毎フレームの手続きから、歩き出した・止まったの変わり目でだけ呼ぶ。
 */
export function setAyatoWalking(g: SVGGElement | null, on: boolean) {
  if (!g) return;
  g.classList.toggle("walking", on);
  if (!on) return halt(g);
  if (g.classList.contains("walk-ready")) return play(g);
  if (sheet === "ready") return arm(g);
  if (sheet === "failed" || still()) return;
  waiting.add(g);
  if (sheet === "loading") return;
  sheet = "loading";
  const img = new Image();
  img.decoding = "async";
  img.src = AYATO_WALK_SRC;
  img.decode().then(
    () => {
      sheet = "ready";
      for (const w of waiting) arm(w);
      waiting.clear();
    },
    () => {
      sheet = "failed";
      waiting.clear();
    },
  );
}

/**
 * 歩いている向きから、見せる段を決める。`vx` `vy` は世界座標の向き（y は下へ増える）。
 * 動いていなければ、いまの向きのまま（止まった向きのまま立つ）。
 */
export function ayatoDir(cur: AyatoDir, vx: number, vy: number): AyatoDir {
  const ax = Math.abs(vx);
  const ay = Math.abs(vy);
  if (!ax && !ay) return cur;
  const upDown = cur === "side" ? ay > ax * TURN : !(ax > ay * TURN);
  if (!upDown) return "side";
  return vy > 0 ? "front" : vy < 0 ? "back" : cur;
}

/**
 * 向きを変えるまでに、新しい向きが続いていなければならない時間（ms）。
 *
 * 斜めに押していた2つのキーを離すとき、指は同時には離れない。先に上を離すと、
 * 残った左だけの1〜2フレームで横を向き、**止まった姿が横向きになる**（実測。
 * 斜め左上に歩いて止まると、背中ではなく横で立った）。1.3倍の差（`TURN`）は
 * 「ちょうど斜め」の揺れを抑えるが、こちらは**一瞬だけの別の向き**を抑える。
 * 90ms は 60fps で5フレーム。曲がるときに遅れて見えない長さ。
 */
const TURN_MS = 90;

/** 島ごとに1つ持つ、向きの状態。 */
export type AyatoTurn = { dir: AyatoDir; want: AyatoDir; ms: number };
export function newAyatoTurn(): AyatoTurn {
  return { dir: "side", want: "side", ms: 0 };
}

/**
 * 1フレームぶん進める。動いているフレームでだけ呼ぶ（止まったら最後の向きのまま）。
 * 返すのは見せる向き（`s.dir`）。
 */
export function ayatoTurn(s: AyatoTurn, vx: number, vy: number, dt: number): AyatoDir {
  const next = ayatoDir(s.dir, vx, vy);
  if (next === s.dir) {
    s.want = next;
    s.ms = 0;
    return s.dir;
  }
  if (next !== s.want) {
    s.want = next;
    s.ms = 0;
  }
  s.ms += dt;
  if (s.ms >= TURN_MS) {
    s.dir = next;
    s.ms = 0;
  }
  return s.dir;
}

/**
 * 段を選ぶ。**向きが変わったときだけ** DOM を触る（毎フレーム呼んでよい）。
 * `data-dir` は外から向きを読むための印（撮る道具が見る）。
 */
export function setAyatoDir(g: SVGGElement | null, dir: AyatoDir) {
  if (!g || g.dataset.dir === dir) return;
  g.dataset.dir = dir;
  g.querySelector(".ayato-walk-row")?.setAttribute(
    "transform",
    `translate(0 ${-AYATO_WALK_ROW[dir] * AYATO_WALK_FH})`,
  );
}

/**
 * 外側の `<g>` の左右反転。**横の段（と、シートを読む前の1枚）だけ**が `facing` に従う。
 * 正面・背中の絵を反転すると、スマホを持つ手が入れ替わる。
 */
export function ayatoFlip(
  g: SVGGElement | null,
  dir: AyatoDir,
  facing: number,
): number {
  return dir !== "side" && g?.classList.contains("walk-ready") ? 1 : facing;
}

/**
 * 絵の中身。`h` は島の世界座標での背（島ごとに持っている `AYATO_H`）。
 */
export default function AyatoSprite({ h }: { h: number }) {
  const w = h * AYATO_ASPECT;
  /* コマの絵は、**立っているときの背**（`AYATO_WALK_BODY_H`）が止まった絵の背 `h` に
     なる倍率で置く。枠の上の余白（弾むぶん）は、そのまま頭の上に出る。
     枠の下端＝足の下端なので、`y = -枠の高さ` で足が止まった絵と同じ行に乗る。 */
  const k = h / AYATO_WALK_BODY_H;
  /* 窓は、コマの枠より**上と左右を1画素ずつ内側**に切る。枠ちょうどで切ると、
     絵を縮めて描くときの補間で**となりのコマ・上の段の画素が窓の縁ににじむ。**
     足は枠の下端に接しているので、上の段の足が頭の上に1本の線になって出る
     （実測: 仮のシートで、正面・背中を白地に撮った背が 3.5px 伸びた。横の段は上に段が無いので 0.5px）。
     いまのシートは横の段の頭が枠の上端に接しているので、上の1画素ぶん髪の先が切れる
     （背の 1/192。白地に撮って、止まった1枚との背の差 0.5px）。
     下は切らない——足がそこにあり、下の段の上端は弾むための余白（空）だから */
  const ix = INSET;
  const iy = INSET;
  const fw = (AYATO_WALK_FW - 2 * ix) * k;
  const fh = (AYATO_WALK_FH - iy) * k;
  return (
    <>
      <image
        className="ayato-still"
        href={AYATO_SRC}
        x={-w / 2}
        y={-h}
        width={w}
        height={h}
        preserveAspectRatio="xMidYMax meet"
      />
      {/* 1コマぶんの窓。中のシートを縦（段＝向き）と横（コマ）にずらして、窓に入った1コマだけを見せる。
          **窓は入れ子の `<svg>` で切る**（`clipPath` を島の中に足すと、
          動くたびに切り抜きの計算が増える。入れ子の svg なら枠の矩形で切るだけ）。
          ずらすのは中の `<image>` の transform だけで、窓そのものは動かさない
          ——描き直されるのは窓の大きさぶん（`CLAUDE.md`「外接矩形ぶん」）。 */}
      {/* 弾み（`play` の Y）。窓の外に置くので、上げても頭が窓で切れない。
          反転の `<g>` の内側なので、左右どちらを向いても同じだけ上がる */}
      <g className="ayato-bob" data-lift={AYATO_WALK_LIFT * k}>
        <svg
          className="ayato-walk"
          x={-fw / 2}
          y={-fh}
          width={fw}
          height={fh}
          viewBox={`${ix} ${iy} ${AYATO_WALK_FW - 2 * ix} ${AYATO_WALK_FH - iy}`}
          overflow="hidden"
          aria-hidden="true"
        >
          {/* 段（向き）は外の `<g>` の `transform` 属性で、コマは中の `<image>` の
            transform（`play` の animation）でずらす。**1つの要素に両方を載せない**
            （animation が属性の transform を上書きして、段が1段目に戻る）。
            段は `setAyatoDir` が変わったときだけ書く */}
          <g className="ayato-walk-row" transform="translate(0 0)">
            {/* `href` は最初は持たない（空文字にすると、ページそのものを読みにいく）。
              初めて歩いたときに `setAyatoWalking` が入れる。
              止まっているあいだの立つコマ（`--ayato-rest`）はコマの数から組む
              （CSS に 4 を写さない）。`data-frames` は外から段数を読むための印 */}
            <image
              className="ayato-walk-sheet"
              x={0}
              y={0}
              width={AYATO_WALK_FW * AYATO_WALK_FRAMES}
              height={AYATO_WALK_FH * AYATO_WALK_ROWS}
              preserveAspectRatio="none"
              data-frames={AYATO_WALK_FRAMES}
              style={
                {
                  "--ayato-rest": `${(-100 * AYATO_WALK_REST) / AYATO_WALK_FRAMES}%`,
                } as CSSProperties
              }
            />
          </g>
        </svg>
      </g>
    </>
  );
}
