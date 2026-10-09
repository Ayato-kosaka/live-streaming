/**
 * `components/cards/place.ts` の確かめ。**偽の写真の寸法だけで回す。**
 *
 *     node site/selftest/cardplace_selftest.mjs
 *
 * ## 何を見ているか
 *
 * あやと島カードは、写真の上にキャラクターが立った1枚。立ち位置を本人が
 * 動かせるようにして（`POST /cards/<id>`）、**あやと本人を隣に並べられる**
 * ようにしたので、置き方の計算に守らなければならない決めが増えた。
 *
 *  1. **枠から出ない。** 四隅のどこへ送っても、絵が写真の中に収まる
 *  2. **ブラウザ側の締め方と、サーバーの `shapePlace` が同じ答えを返す。**
 *     ずれると、画面では置けたのに保存して開き直すと別の場所に戻る
 *  3. **2人が重ならない。** いちばん寄る置き方でも隙間が残る
 *  4. **2人の足元がそろう。** 同じ地面に立っていないと、貼った紙に見える
 *  5. **2人とも枠の中。**
 *  6. **「もとにもどす」が、既定と1pxも違わない**
 *  7. **1体のときの箱が、いままでと1pxも変わらない**（下の `GOLD`）
 *
 * 7 がこの確かめのいちばん大事なところ。1体を2体へ広げるときに、**いままで
 * 配ってあるカードの絵が動いたら作り直し**なので、分ける前の実測値を
 * そのまま表にして持っている。
 *
 * ## なぜ写しを置かないか
 *
 * `place.ts` も `functions/src/streamEvents.ts` も、**その場で tsc に通して**
 * 動かす。写しを置くと、本体を直したのに確かめが古いまま通る。
 *
 * `streamEvents.ts` は `firebase-admin` を読み込むので、**偽の admin を
 * 渡して**読み込む（`functions/selftest/cards_mine_selftest.mjs` と同じ手）。
 * 組み立てに使う tsc は `site/node_modules` のほう——この箱には
 * `functions/node_modules` が無いことがあり、**あちらに頼ると確かめごと
 * 回らなくなる。** 型の解決が付かない分の文句は出るが、JS は書き出される。
 *
 * ## わざと壊すと赤くなる（`docs/island-misses.md` #99 #100）
 *
 * `PLACE_TS` に壊した写しの道を渡すと、そちらを組み立てて回す。
 * **守りは別々に落ちる。**
 *
 * ```bash
 * # (a) 枠へ締めるのを抜く → 1（四隅）と 5（2人とも枠の中）が落ちる
 * sed 's/Math.min(pw - w, Math.max(0, place.x \* pw - w \/ 2))/place.x * pw - w \/ 2/' \
 *   site/components/cards/place.ts > /tmp/no-clamp.ts
 * PLACE_TS=/tmp/no-clamp.ts node site/selftest/cardplace_selftest.mjs
 *
 * # (b) 2人のあいだの隙間を無くす → 3（重ならない）が落ちる
 * sed 's/^export const GAP = 0.015;/export const GAP = -0.4;/' \
 *   site/components/cards/place.ts > /tmp/no-gap.ts
 * PLACE_TS=/tmp/no-gap.ts node site/selftest/cardplace_selftest.mjs
 * ```
 */

import {execFileSync} from "node:child_process";
import {copyFileSync, existsSync, mkdtempSync, readFileSync} from "node:fs";
import {createRequire} from "node:module";
import {tmpdir} from "node:os";
import {dirname, join} from "node:path";
import {fileURLToPath} from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const SITE = join(HERE, "..");
const ROOT = join(SITE, "..");
const TSC = join(SITE, "node_modules", ".bin", "tsc");

/** 組み立てる `place.ts`。**落ちることを確かめる写しだけ、ここを差し替える。** */
const SRC = process.env.PLACE_TS || join(SITE, "components", "cards", "place.ts");

let BAD = 0;
let OK = 0;

/**
 * 1つ見る。
 * @param {string} name 何を見たか
 * @param {boolean} good 通ったか
 * @param {string} why 落ちたときに出すもの
 */
function check(name, good, why = "") {
  if (good) {
    OK++;
    console.log(`  ok   ${name}`);
    return;
  }
  BAD++;
  console.log(`  NG   ${name}${why ? ` — ${why}` : ""}`);
}

/* ---------------- 本体を組み立てて読み込む ---------------- */

const OUT = mkdtempSync(join(tmpdir(), "cardplace-"));
const WORK = mkdtempSync(join(tmpdir(), "cardplace-src-"));
copyFileSync(SRC, join(WORK, "place.ts"));
execFileSync(TSC, [
  join(WORK, "place.ts"),
  "--outDir", OUT,
  "--module", "commonjs",
  "--target", "es2022",
  "--strict",
  "--skipLibCheck",
], {stdio: "inherit"});

const nodeRequire = createRequire(import.meta.url);
const {stampBox, clampPlace, defaultPlaceFor, layout, aabb,
  placeFromBox, pickAt, TILT_MAX, SCALE_MAX} =
  nodeRequire(join(OUT, "place.js"));
console.log(`# 組み立てた本体: ${SRC}`);

/* ---------------- サーバーの `shapePlace` を、偽の admin で読み込む ---------- */

/**
 * `functions/src/streamEvents.ts` の `shapePlace` を取り出す。
 *
 * 型の解決は付かない（`firebase-admin` を見に行けない）が、**JS は
 * 書き出される。** 書き出されなかったら、それは本体が壊れている。
 * @return {(b: object, now: object) => object} 本物の `shapePlace`
 */
function loadShapePlace() {
  const src = join(ROOT, "functions", "src", "streamEvents.ts");
  const out = mkdtempSync(join(tmpdir(), "streamevents-"));
  try {
    execFileSync(TSC, [
      src, "--outDir", out, "--module", "commonjs", "--target", "es2022",
      "--skipLibCheck", "--noResolve",
    ], {stdio: "pipe"});
  } catch {
    /* 型の解決が付かないぶんの文句は出る。**書き出せたかどうかで見る** */
  }
  const js = join(out, "streamEvents.js");
  if (!existsSync(js)) throw new Error(`${js} が書き出されなかった`);
  const mod = {exports: {}};
  const admin = {
    apps: [],
    initializeApp() {
      admin.apps.push({});
    },
    firestore: () => ({collection: () => ({})}),
  };
  const req = (id) => {
    if (id === "firebase-admin") return admin;
    if (id === "firebase-functions") return {logger: {info() {}, warn() {}}};
    return nodeRequire(id);
  };
  new Function("require", "exports", "module", readFileSync(js, "utf8"))(
    req, mod.exports, mod,
  );
  if (typeof mod.exports.shapePlace !== "function") {
    throw new Error("shapePlace が見つからない（名前が変わった？）");
  }
  return mod.exports.shapePlace;
}

const shapePlace = loadShapePlace();

/* ---------------- 偽の寸法 ----------------
   **本番の写真と同じ形**を並べる。縦・横・正方形の3通りと、
   キャラクターの絵の縦横比を2通り。 */

/** 写真。[横, 縦] */
const SHOTS = [
  [1152, 2048], // スマホの縦
  [2048, 1152], // 横
  [1600, 1600], // 正方形
  [2048, 1365], // あやとの見本と同じ比
];
/** キャラクターの中身。[横, 縦] */
const CHARS = [
  [512, 512],
  [360, 640],
  [640, 360],
];

const near = (a, b, tol) => Math.abs(a - b) <= tol;
const inFrame = (b, pw, ph) =>
  b.x >= -0.5 && b.y >= -0.5 && b.x + b.w <= pw + 0.5 && b.y + b.h <= ph + 0.5;
/** 2つの箱が重なっている面積。0 なら触れていない */
const overlap = (a, b) =>
  Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) *
  Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));

/* ================================================================== 1 */

console.log("\n# 1. 枠の外へ送っても、枠の中に収まる（四隅ぜんぶ）");
{
  /** 四隅と、そのさらに外。**0〜1 の外も通す**（締めるのは place.ts の仕事） */
  const CORNERS = [
    [0, 0], [1, 0], [0, 1], [1, 1],
    [-9, -9], [9, -9], [-9, 9], [9, 9], [0.5, 0.5],
  ];
  let out = 0;
  let n = 0;
  for (const [pw, ph] of SHOTS) {
    for (const [cw, ch] of CHARS) {
      for (const [x, y] of CORNERS) {
        /* **倍率も傾きも、いちばん端まで振る。** ひねりを指で回せるように
           した日（2026-10-09）に傾きの幅を 20 → 45 度へ広げたので、
           広げた端でも枠から出ないことをここで見る。 */
        for (const scale of [0.4, 1, SCALE_MAX, 9]) {
          const at = stampBox(pw, ph, cw, ch, {x, y, rot: 0, scale});
          n += 1;
          if (!inFrame(at, pw, ph)) out += 1;
        }
      }
    }
  }
  check(`${n} 通りぜんぶ枠の中`, out === 0, `${out} 通りが外へ出た`);
  // 探し方が当たることを見る。**締めを外した式では落ちる**はず
  const loose = (pw, ph, w, x) => ({x: x * pw - w / 2, w});
  const bad = loose(1000, 1000, 340, 1);
  check("（対照）締めない式なら外へ出る", bad.x + bad.w > 1000.5);
}

/* ================================================================== 2 */

console.log("\n# 2. ブラウザ側の締め方と、サーバーの shapePlace が同じ答え");
{
  const NOW = {x: 0.8, y: 0.95, rot: 0, scale: 1};
  /** 送られてくる値。**壊れたものも通す**（欠け・字・無限・範囲の外） */
  const SENT = [
    {x: 0.5, y: 0.5, rot: 0, scale: 1},
    {x: -3, y: 4, rot: -900, scale: 99},
    {x: 0.12345678, y: 0.87654321, rot: 12.345, scale: 1.23456},
    {x: "0.4", y: "0.6", rot: "10", scale: "1.5"},
    {x: "いち", y: null, rot: undefined, scale: NaN},
    {},
    {x: 0},
    {y: 1, scale: 0.0001},
    {rot: 180, scale: 3},
    {x: Infinity, y: -Infinity, rot: Infinity, scale: -Infinity},
  ];
  let diff = 0;
  for (const sent of SENT) {
    const mine = clampPlace(sent, NOW);
    const theirs = shapePlace(sent, NOW);
    if (JSON.stringify(mine) !== JSON.stringify(theirs)) {
      diff += 1;
      console.log(`       ${JSON.stringify(sent)}`);
      console.log(`        画面: ${JSON.stringify(mine)}`);
      console.log(`        口  : ${JSON.stringify(theirs)}`);
    }
  }
  check(`${SENT.length} 通りとも同じ答え`, diff === 0, `${diff} 通りで割れた`);
  // 探し方が当たることを見る。**違う値なら違うと言える**こと
  check("（対照）違う入力なら答えも違う",
    JSON.stringify(clampPlace({x: 0.1}, NOW)) !==
    JSON.stringify(shapePlace({x: 0.9}, NOW)));
}

/* ================================================================== 3-5 */

console.log("\n# 3〜5. 2体。重ならない・足元がそろう・両方とも枠の中");
{
  let over = 0;
  let outside = 0;
  let unlevel = 0;
  let n = 0;
  let worst = Infinity;
  /** いちばん寄る置き方をわざと作る。真ん中・端・大きいの全部 */
  const XS = [0, 0.25, 0.5, 0.75, 1, 0.49, 0.51];
  const YS = [0.3, 0.7, 1];
  const SCALES = [0.4, 1, 1.6, 2];
  /* **広げた端まで振る。** 45 度の人の頭は箱の外へ出るので、
     隣に立つ連れがそこへ食い込まないことを見る（重なりは `aabb` で見る） */
  const ROTS = [0, 20, -20, TILT_MAX, -TILT_MAX];
  for (const [pw, ph] of SHOTS) {
    for (const [cw, ch] of CHARS) {
      for (const [mw, mh] of CHARS) {
        for (const x of XS) {
          for (const y of YS) {
            for (const scale of SCALES) {
              for (const rot of ROTS) {
                const place = {x, y, rot, scale};
                const [you, mate] = layout(pw, ph, [
                  {w: cw, h: ch, place},
                  {w: mw, h: mh},
                ]);
                n += 1;
                const a = aabb(you.box, you.rot);
                const b = aabb(mate.box, mate.rot);
                if (overlap(a, b) > 0.01) over += 1;
                if (!inFrame(mate.box, pw, ph)) outside += 1;
                const footA = you.box.y + you.box.h;
                const footB = mate.box.y + mate.box.h;
                if (!near(footA, footB, 0.5)) unlevel += 1;
                // いちばん近かったときの隙間（横の空き）
                const gap = Math.max(a.x - (b.x + b.w), b.x - (a.x + a.w));
                if (gap < worst) worst = gap;
              }
            }
          }
        }
      }
    }
  }
  check(`${n} 通りで、2人が1度も重ならない`, over === 0, `${over} 通りで重なった`);
  check("いちばん寄ったときでも隙間が残る", worst > 0, `いちばん狭い隙間 ${worst.toFixed(2)}px`);
  check(`連れが ${n} 通りとも枠の中`, outside === 0, `${outside} 通りで外へ出た`);
  check("足元の高さが、どの通りでもそろう", unlevel === 0, `${unlevel} 通りでずれた`);
  console.log(`       いちばん狭かった隙間: ${worst.toFixed(2)}px`);

  // 本人の箱が枠の中であることも、同じ条件で見る
  let youOut = 0;
  for (const [pw, ph] of SHOTS) {
    for (const x of XS) {
      for (const scale of SCALES) {
        const [you] = layout(pw, ph, [
          {w: 512, h: 512, place: {x, y: 1, rot: 0, scale}},
          {w: 512, h: 512},
        ]);
        if (!inFrame(you.box, pw, ph)) youOut += 1;
      }
    }
  }
  check("本人も枠の中", youOut === 0, `${youOut} 通りで外へ出た`);
}

console.log("\n# 3b. 連れは、本人を押しのけない");
{
  // ふつうの大きさなら、本人の箱は1体のときとまったく同じ
  let moved = 0;
  for (const [pw, ph] of SHOTS) {
    for (const x of [0.2, 0.5, 0.8]) {
      const place = {x, y: 0.95, rot: 0, scale: 1};
      const alone = stampBox(pw, ph, 512, 512, place);
      const [you] = layout(pw, ph, [
        {w: 512, h: 512, place},
        {w: 512, h: 512},
      ]);
      if (JSON.stringify(alone) !== JSON.stringify(you.box)) moved += 1;
    }
  }
  check("ふつうの大きさなら、本人は1pxも動かない", moved === 0, `${moved} 通りで動いた`);

  // 本人が大きすぎて並べられないときだけ、2人そろって縮む（連れだけ豆粒にしない）
  const [big, small] = layout(1000, 1000, [
    {w: 512, h: 512, place: {x: 0.5, y: 1, rot: 0, scale: 2}},
    {w: 512, h: 512},
  ]);
  check("並べられないときは2人そろって縮む",
    small.box.w > big.box.w * 0.45,
    `本人 ${big.box.w.toFixed(0)}px / 連れ ${small.box.w.toFixed(0)}px`);
  check("そのときも重ならない",
    overlap(aabb(big.box, big.rot), aabb(small.box, small.rot)) === 0);
}

console.log("\n# 3c. 連れは、本人に背を向けない（左に立ったら左右を返す）");
{
  const [, left] = layout(1000, 1000, [
    {w: 512, h: 512, place: {x: 0.85, y: 1, rot: 0, scale: 1}},
    {w: 512, h: 512},
  ]);
  const [, right] = layout(1000, 1000, [
    {w: 512, h: 512, place: {x: 0.15, y: 1, rot: 0, scale: 1}},
    {w: 512, h: 512},
  ]);
  check("本人の左に立ったら返す", left.flip === true);
  check("右に立ったら返さない", right.flip === false);
  const [only] = layout(1000, 1000, [{w: 512, h: 512}]);
  check("1体のときは返さない", only.flip === false);

  /* **字の入った絵は、左に立っても返さない**（2026-10-08）。
     あやと島カードに貼れるあやとを `content/goods.ts` の `STICKERS` から
     選べるようにしたら、「STOP」の標識が入った1枚が左に立って
     **字ごと裏返った。** 返してよいかは絵のほうが持っている。 */
  const [, 字] = layout(1000, 1000, [
    {w: 512, h: 512, place: {x: 0.85, y: 1, rot: 0, scale: 1}},
    {w: 512, h: 512, canFlip: false},
  ]);
  check("返さない絵は、左に立っても返らない", 字.flip === false);
  /* 対照: 同じ置きかたで `canFlip` を渡さなければ返る。
     **返す道そのものが死んでいたら、上の ok は何も言っていない** */
  check("（対照）渡さなければ、いままでどおり返る", left.flip === true);
  /* 置く場所は `canFlip` で変わらない。返すのは描くときの話で、
     **箱の位置まで動いたら、いままでのカードが動く** */
  check("返さなくても、立つところは同じ",
    near(字.box.x, left.box.x, 0.001) && near(字.box.w, left.box.w, 0.001),
    `返す ${left.box.x.toFixed(1)} / 返さない ${字.box.x.toFixed(1)}`);
}

/* ================================================================= 3d */

console.log("\n# 3d. 連れを自分で置いたら、機械が動かさない");
{
  /* あやと（2026-10-09）「離せない・大きさを変えられない・向きも選べない」。
     連れに `place` を渡したら、**`stampBox` がそのまま効く**こと
     ——押しのけも、足元そろえも、隣に寄せるのもしない。 */
  let moved = 0;
  let youMoved = 0;
  let n = 0;
  for (const [pw, ph] of SHOTS) {
    for (const [mw, mh] of CHARS) {
      for (const x of [0.05, 0.5, 0.95]) {
        for (const y of [0.3, 1]) {
          for (const scale of [0.4, 1, SCALE_MAX]) {
            const mine = {x, y, rot: 30, scale};
            const want = stampBox(pw, ph, mw, mh, mine);
            const soloYou = layout(pw, ph, [{w: 512, h: 512}]);
            const [you, mate] = layout(pw, ph, [
              {w: 512, h: 512},
              {w: mw, h: mh, place: mine},
            ]);
            n += 1;
            for (const k of ["x", "y", "w", "h"]) {
              if (!near(mate.box[k], want[k], 0.001)) moved += 1;
            }
            // **本人のほうも動かない。** 連れを置いたせいで2人そろって縮む道へ
            // 落ちていたら、ここで出る
            for (const k of ["x", "y", "w", "h"]) {
              if (!near(you.box[k], soloYou[0].box[k], 0.001)) youMoved += 1;
            }
            if (!near(mate.rot, 30, 0.001)) moved += 1;
          }
        }
      }
    }
  }
  check(`${n} 通りとも、置いたところに立つ`, moved === 0, `${moved} か所ずれた`);
  check("連れを置いても、本人は1pxも動かない", youMoved === 0, `${youMoved} か所ずれた`);
  // 探し方が当たることを見る。**渡さなければ、いままでどおり機械が並べる**
  const [, auto] = layout(1152, 2048, [{w: 512, h: 512}, {w: 512, h: 512}]);
  const self = stampBox(1152, 2048, 512, 512, null);
  check("（対照）渡さなければ、連れは本人の隣へ寄る",
    !near(auto.box.x, self.x, 0.5),
    `どちらも x=${auto.box.x.toFixed(1)}`);
}

/* ================================================================= 3e */

console.log("\n# 3e. 向きは、押した人が決めたときだけ返る");
{
  const 右 = layout(1152, 2048, [
    {w: 512, h: 512},
    {w: 512, h: 512, place: {x: 0.2, y: 1, rot: 0, scale: 1}, flip: true},
  ])[1];
  check("連れ: 返すと言えば返る", 右.flip === true);
  const 素 = layout(1152, 2048, [
    {w: 512, h: 512},
    {w: 512, h: 512, place: {x: 0.2, y: 1, rot: 0, scale: 1}},
  ])[1];
  check("連れ: 言わなければ返らない", 素.flip === false);
  const 字 = layout(1152, 2048, [
    {w: 512, h: 512},
    {w: 512, h: 512, place: {x: 0.2, y: 1, rot: 0, scale: 1}, flip: true, canFlip: false},
  ])[1];
  check("連れ: 字の入った絵は、返すと言っても返らない", 字.flip === false);
  const 本人 = layout(1152, 2048, [{w: 512, h: 512, flip: true}])[0];
  check("本人: 返すと言えば返る", 本人.flip === true);
  const 本人素 = layout(1152, 2048, [{w: 512, h: 512}])[0];
  check("本人: 言わなければ返らない（いままでと同じ）", 本人素.flip === false);
  // 返しても、立つところは1pxも変わらない（箱は左右対称に作る）
  let diff = 0;
  for (const k of ["x", "y", "w", "h"]) {
    if (!near(本人.box[k], 本人素.box[k], 0.001)) diff += 1;
  }
  check("返しても、立つところは同じ", diff === 0, `${diff} か所ずれた`);
}

/* ================================================================= 3f */

console.log("\n# 3f. 掴んだ瞬間に動かない（placeFromBox）");
{
  /* 機械が置いた連れを**はじめて掴んだ瞬間**、`placeFromBox` で
     「いまのところ」を `place` にする。ここが1pxでもずれると、
     指を置いただけで絵が跳ぶ。 */
  let diff = 0;
  let n = 0;
  for (const [pw, ph] of SHOTS) {
    for (const [cw, ch] of CHARS) {
      for (const scale of [0.4, 0.7, 1, 1.4, SCALE_MAX]) {
        for (const x of [0.1, 0.5, 0.9]) {
          const was = {x, y: 0.9, rot: 0, scale};
          const box = stampBox(pw, ph, cw, ch, was);
          const again = stampBox(pw, ph, cw, ch, placeFromBox(pw, ph, cw, ch, box, 0));
          n += 1;
          for (const k of ["x", "y", "w", "h"]) {
            if (!near(again[k], box[k], 0.5)) diff += 1;
          }
        }
      }
    }
  }
  check(`${n} 通りとも、掴んでも同じ箱`, diff === 0, `${diff} か所ずれた`);
  // 機械が隣に並べた連れでも同じ（こちらが本番で起きるほう）
  const [, auto] = layout(1152, 2048, [{w: 512, h: 512}, {w: 360, h: 640}]);
  const got = stampBox(1152, 2048, 360, 640,
    placeFromBox(1152, 2048, 360, 640, auto.box, auto.rot));
  let d2 = 0;
  for (const k of ["x", "y", "w", "h"]) if (!near(got[k], auto.box[k], 0.5)) d2 += 1;
  check("機械が並べた連れを掴んでも同じ箱", d2 === 0, `${d2} か所ずれた`);
  // 探し方が当たることを見る
  check("（対照）違う箱なら違う答えになる",
    !near(placeFromBox(1152, 2048, 512, 512, {x: 0, y: 0, w: 100, h: 100}, 0).scale,
      placeFromBox(1152, 2048, 512, 512, {x: 0, y: 0, w: 300, h: 300}, 0).scale, 0.01));
}

/* ================================================================= 3g */

console.log("\n# 3g. 押したところに居る人を掴む（pickAt）");
{
  const at = layout(1152, 2048, [
    {w: 512, h: 512, place: {x: 0.3, y: 0.9, rot: 0, scale: 1}},
    {w: 512, h: 512, place: {x: 0.75, y: 0.9, rot: 0, scale: 1}},
  ]);
  const mid = (b) => [b.x + b.w / 2, b.y + b.h / 2];
  check("本人のところを押したら本人", pickAt(at, ...mid(at[0].box)) === 0);
  check("連れのところを押したら連れ", pickAt(at, ...mid(at[1].box)) === 1);
  check("誰も居ないところは -1", pickAt(at, 10, 10) === -1);
  /* **重なっていたら手前（あとに描くほう）。** 札で切り替えないので、
     重なったときにどちらが来るかが決まっていないと掴めない */
  const 重 = layout(1152, 2048, [
    {w: 512, h: 512, place: {x: 0.5, y: 0.9, rot: 0, scale: 1}},
    {w: 512, h: 512, place: {x: 0.5, y: 0.9, rot: 0, scale: 1}},
  ]);
  check("重なっていたら手前の人", pickAt(重, ...mid(重[0].box)) === 1);
  /* 傾いた人は、傾きを戻してから見る。45度に傾けた人の**角の外**は
     箱の中に入っていない */
  const 傾 = layout(1152, 2048, [
    {w: 512, h: 512, place: {x: 0.5, y: 0.9, rot: TILT_MAX, scale: 1}},
  ]);
  check("傾けた人の真ん中は掴める", pickAt(傾, ...mid(傾[0].box)) === 0);
  const aa = aabb(傾[0].box, 傾[0].rot);
  check("（対照）傾けると外接矩形は箱より広い", aa.w > 傾[0].box.w + 1);
  check("外接矩形の角は、掴めない", pickAt(傾, aa.x + 1, aa.y + 1) === -1);
}

/* ================================================================== 6 */

console.log("\n# 6. 「もとにもどす」が、既定と1pxも違わない");
{
  let diff = 0;
  for (const [pw, ph] of SHOTS) {
    for (const [cw, ch] of CHARS) {
      const base = stampBox(pw, ph, cw, ch, null);
      const back = stampBox(pw, ph, cw, ch, defaultPlaceFor(pw, ph, cw, ch));
      for (const k of ["x", "y", "w", "h"]) {
        if (!near(base[k], back[k], 0.001)) diff += 1;
      }
    }
  }
  check("既定と戻したあとが同じ箱", diff === 0, `${diff} か所ずれた`);
}

/* ================================================================== 7 */

console.log("\n# 7. 1体のときの箱が、いままでと1pxも変わらない");
{
  /* **分ける前（2026-10-06 の master）の `stampBox` で実測した値。**
     ここが動いたら、もう配ってあるカードの絵が動いている。 */
  const GOLD = [
    // [pw, ph, cw, ch, place, x, y, w, h]
    [1152, 2048, 512, 512, null, 737.28, 1553.92, 391.68, 391.68],
    [1152, 2048, 360, 640, null, 737.28, 1249.28, 391.68, 696.32],
    [1152, 2048, 640, 360, null, 737.28, 1725.28, 391.68, 220.32],
    [2048, 1152, 512, 512, null, 1776.64, 864, 230.4, 230.4],
    [2048, 1152, 360, 640, null, 1877.44, 864, 129.6, 230.4],
    [2048, 1152, 640, 360, null, 1597.44, 864, 409.6, 230.4],
    [1600, 1600, 512, 512, null, 1248, 1200, 320, 320],
    [2048, 1365, 512, 512, null, 1734.04, 1023.75, 273, 273],
    [1152, 2048, 512, 512, {x: 0.5, y: 0.5, rot: 0, scale: 1}, 380.16, 632.32, 391.68, 391.68],
    [1152, 2048, 512, 512, {x: 0.1, y: 0.2, rot: 12, scale: 1.5}, 0, 0, 587.52, 587.52],
    [2048, 1152, 640, 360, {x: 0.9, y: 0.8, rot: -5, scale: 0.6}, 1720.32, 783.36, 245.76, 138.24],
  ];
  let diff = 0;
  for (const [pw, ph, cw, ch, place, x, y, w, h] of GOLD) {
    const at = stampBox(pw, ph, cw, ch, place);
    for (const [k, want] of [["x", x], ["y", y], ["w", w], ["h", h]]) {
      if (!near(at[k], want, 0.01)) {
        diff += 1;
        console.log(`       ${pw}x${ph} ${cw}x${ch} ${JSON.stringify(place)}`);
        console.log(`        ${k}: いま ${at[k]} / 前 ${want}`);
      }
    }
  }
  check(`${GOLD.length} 通りとも、分ける前と同じ箱`, diff === 0, `${diff} か所ずれた`);
  // 探し方が当たることを見る。**違う寸法なら違うと言える**こと
  check("（対照）寸法を変えれば気づける",
    !near(stampBox(1152, 2048, 512, 512, null).w, 391.68 * 0.9, 0.01));
}

/* ------------------------------------------------------------------ */

console.log(`\n通った ${OK} / 落ちた ${BAD}`);
if (BAD) {
  console.log("置き方の決めが守れていません。");
  process.exit(1);
}
console.log("置き方の決めは全部守れています。");
