/**
 * **共有画像の枠に島をどう置くか**（`ogframe.mjs`）を、ブラウザ無しで当てる。
 *
 *     node tools/sprites/ogframe_selftest.mjs
 *
 * 終了コード 0=ぜんぶ通った / 1=落ちた / 2=数えるものが無い。
 *
 * ## なぜ要るか（2026-10-03）
 *
 * 置き方は「陸の横幅が枠の 45% になる大きさ」の一本だった。これは**縦に細い
 * 島でしか枠が埋まらない。** 9/28 に章がアルバニア（丸い島）へ移った翌晩から、
 * 毎晩の焼き直しが「海 70.2% / 陸 13.3%」で5日続けて赤かった。
 *
 * 気づけなかったのは、**置き方を当てる道具が無かった**から。`og.mjs` は開く
 * だけでブラウザを起こすので毎 PR では回せず、`ogcheck.py` は撮れた絵しか
 * 見られない。**撮る前に言えることを、ここで言う。**
 *
 * ## 何を見るか
 *
 * 1. 実測した2つの章の形で、置き方が狙いどおりになる（**本番の判定**）
 * 2. **下側の挟み** — 高さの決まりを弱めると、丸い島が枠を埋めなくなる
 * 3. **上側の挟み** — 高さの決まりを強めると、縦に細い島の置き方まで動く
 * 4. 幅の止めが効く（横に長い島で、左右の海が消えない）
 * 5. `framingFaults` 自身の対照——通る箱と、落ちる箱を3通り
 *
 * **2 と 3 の両方を持つのが肝。** 片側だけだと、決まりが緩みすぎても
 * 締まりすぎても気づけない（`docs/island-standards.md` §15）。
 */
import {
  isleHeight,
  framingFaults,
  FRAME,
  LAND_W,
  LAND_H,
  LAND_W_MAX,
  ISLE_MIN,
  ISLE_MAX,
} from "./ogframe.mjs";

const PROBE = 780;

/**
 * **実測。** 同じ書き出し・同じ道具・同じ日（2026-10-03）に、ブラウザの時計
 * だけずらして撮り分けたときの、置いた高さと陸（`.ig-sand`）の箱。
 * 測りの高さ（`PROBE`）での箱は、ここから比で戻す（どちらも高さに比例する）。
 */
const SHOTS = {
  // `OG_NOW=2026-09-20`。古いほうの決まりで撮って 海 50.4% / 陸 24.8%（通る）
  北欧: { isle: 897, sand: { w: 540, h: 829 } },
  // いまの章。古いほうの決まりでは 海 70.2% / 陸 13.3%（落ちる）
  アルバニア: { isle: 552, sand: { w: 540, h: 463 } },
};

/** 測りの高さに戻した陸の箱 */
const probeBox = (s) => ({ w: (s.sand.w * PROBE) / s.isle, h: (s.sand.h * PROBE) / s.isle });

let OK = 0, BAD = 0, SEEN = 0;
const check = (name, cond, note = "") => {
  SEEN++;
  if (cond) { OK++; console.log(`  ○ ${name}`); }
  else { BAD++; console.log(`::error::✕ ${name}${note ? `（${note}）` : ""}`); }
};

console.log(`枠 ${FRAME.w}x${FRAME.h} / 陸の下限 ${LAND_W}px / 高さの狙い ${LAND_H}px / 幅の止め ${LAND_W_MAX}px`);
console.log("");

console.log("# 1. 実測した章の形で、狙いどおりに置けるか");
{
  const n = isleHeight(probeBox(SHOTS.北欧));
  console.log(`  北欧: 高さ ${n.isle}px（${n.by}で決定）陸 ${Math.round(n.sand.w)}x${Math.round(n.sand.h)}`);
  // **縦に細い島は、置き方が1pxも変わってはいけない。**
  // 変わったら、通っていた絵（海 50.4%）まで作り直すことになる
  check("北欧は幅で決まる（高さの決まりは効かない）", n.by === "幅");
  check(`北欧の置き方が実測（${SHOTS.北欧.isle}px）と変わらない`,
    Math.abs(n.isle - SHOTS.北欧.isle) <= 2, `${n.isle}px`);
  check("北欧は枠として成り立つ", framingFaults(n.sand).length === 0, framingFaults(n.sand).join(" / "));

  const a = isleHeight(probeBox(SHOTS.アルバニア));
  console.log(`  アルバニア: 高さ ${a.isle}px（${a.by}で決定）陸 ${Math.round(a.sand.w)}x${Math.round(a.sand.h)}`);
  check("アルバニアは高さで決まる", a.by === "高さ");
  check("アルバニアの陸が枠の高さに届く", a.sand.h >= FRAME.h * 0.98, `${Math.round(a.sand.h)}px`);
  check("アルバニアの陸が幅の止めを越えない", a.sand.w <= LAND_W_MAX, `${Math.round(a.sand.w)}px`);
  check("アルバニアは枠として成り立つ", framingFaults(a.sand).length === 0, framingFaults(a.sand).join(" / "));
}

console.log("# 2. 下側の挟み（高さの狙いを下げると、丸い島が枠を埋めなくなる）");
{
  // `landH: 0` ＝ もとの「幅だけ」の決まり。**5日赤かった置き方そのもの**
  const old = isleHeight(probeBox(SHOTS.アルバニア), { landH: 0 });
  check(`幅だけで決めるとアルバニアは ${SHOTS.アルバニア.isle}px に戻る`,
    old.isle === SHOTS.アルバニア.isle, `${old.isle}px`);
  check("そのとき枠が埋まらない（＝この見張りが捕まえる）", framingFaults(old.sand).length > 0);
  console.log(`    → ${framingFaults(old.sand).join(" / ")}`);
  // **下の縁は 580px（枠の 92%）。** 遊び（8%）のぶんだけ余白を許すので、
  // そこを割ると丸い島が海を抱えたまま出る
  const below = isleHeight(probeBox(SHOTS.アルバニア), { landH: 575 });
  check("高さの狙いを 575px まで下げるとアルバニアが落ちる",
    framingFaults(below.sand).length > 0, `陸 ${Math.round(below.sand.w)}x${Math.round(below.sand.h)}`);
  const justAbove = isleHeight(probeBox(SHOTS.アルバニア), { landH: 585 });
  check("585px なら通る（＝縁が 580px あたりに在る）", framingFaults(justAbove.sand).length === 0);
}

console.log("# 3. 上側の挟み（高さの狙いを上げると、通っていた島まで動く）");
{
  // **上の縁は 829px。** 北欧の陸は 540px 幅のとき 829px 高い（実測）ので、
  // 狙いがそれを越えた瞬間に、いままで幅で決まっていた島が高さで決まり出す
  const above = isleHeight(probeBox(SHOTS.北欧), { landH: 835 });
  check("高さの狙いを 835px に上げると、北欧が高さで決まってしまう", above.by === "高さ");
  check("そのとき北欧の置き方が実測から動く",
    Math.abs(above.isle - SHOTS.北欧.isle) > 2, `${above.isle}px`);
  const justBelow = isleHeight(probeBox(SHOTS.北欧), { landH: 825 });
  check("825px なら北欧は動かない（＝縁が 829px あたりに在る）",
    justBelow.by === "幅" && Math.abs(justBelow.isle - SHOTS.北欧.isle) <= 2, `${justBelow.isle}px`);
  // 幅の下限を上げすぎても、北欧が動く
  const wide = isleHeight(probeBox(SHOTS.北欧), { landW: LAND_W * 1.2 });
  check("陸の下限を1.2倍にしても北欧が動く", Math.abs(wide.isle - SHOTS.北欧.isle) > 2, `${wide.isle}px`);
  // **いまの 630px が、その窓のまん中あたりに在ること。**
  // 片方の縁に貼り付いていたら、島の形が少し変わるだけでまた赤くなる
  check(`いまの狙い ${LAND_H}px が 580〜829px の窓の中に在る`, LAND_H > 580 && LAND_H < 829);
}

console.log("# 4. 幅の止め（横に長い島でも、左右の海が消えない）");
{
  // 枠よりさらに横長の島。高さで合わせると陸が枠の幅を越える
  const flat = isleHeight({ w: 900, h: 300 });
  check("横に長い島は止めに当たる", flat.capped === true);
  check(`そのとき陸の幅が止め（${LAND_W_MAX}px）を越えない`, flat.sand.w <= LAND_W_MAX + 1,
    `${Math.round(flat.sand.w)}px`);
  check("止めに当たっても枠として成り立つ（左右に海が残る）",
    framingFaults(flat.sand).length === 0, framingFaults(flat.sand).join(" / "));
  // 止めを外すと陸が枠の幅を越え、落ちる
  const nocap = isleHeight({ w: 900, h: 300 }, { landWMax: 99999 });
  check("止めを外すと陸が枠の幅を越えて落ちる",
    nocap.sand.w > FRAME.w && framingFaults(nocap.sand, { landWMax: 99999 }).length > 0,
    `陸 ${Math.round(nocap.sand.w)}px`);
}

console.log("# 5. 置く高さの止め");
{
  // 極端に小さい島＝置く高さが上限に当たり、陸が狙いに届かない
  const tiny = isleHeight({ w: 60, h: 60 });
  check(`小さすぎる島は上限（${ISLE_MAX}px）に当たる`, tiny.isle === ISLE_MAX, `${tiny.isle}px`);
  check("そのとき陸が狙いに届かず落ちる", framingFaults(tiny.sand).length > 0);
  // 極端に大きい島＝下限に当たる
  const huge = isleHeight({ w: 4000, h: 4000 });
  check(`大きすぎる島は下限（${ISLE_MIN}px）に当たる`, huge.isle === ISLE_MIN, `${huge.isle}px`);
}

console.log("# 6. 判定そのものの対照（通る箱と、落ちる箱）");
{
  check("枠を埋めた箱は通る", framingFaults({ w: 735, h: 630 }).length === 0);
  check("細すぎる箱は落ちる", framingFaults({ w: 300, h: 630 }).length === 1);
  check("広すぎる箱は落ちる", framingFaults({ w: 1100, h: 630 }).length === 1);
  check("上下に海が余る箱は落ちる", framingFaults({ w: 540, h: 463 }).length === 1);
  // 8% の遊びが効いているか（両側）
  check("狙いの8%内なら通る", framingFaults({ w: LAND_W * 0.95, h: FRAME.h * 0.95 }).length === 0);
  check("狙いの8%を外れたら落ちる", framingFaults({ w: LAND_W * 0.9, h: FRAME.h * 0.9 }).length === 2);
}

console.log("");
if (SEEN === 0) {
  console.log("::error::数えるものが1つも無かった。");
  process.exit(2);
}
if (BAD) {
  console.log(`NG が ${BAD} 件（通ったのは ${OK} 件 / 見たのは ${SEEN} 件）。`);
  process.exit(1);
}
console.log(`${SEEN} 件ぜんぶ通った。`);
