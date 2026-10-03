/**
 * 共有画像（1200×630）の枠に、**島をどれだけの大きさで置くか**だけを決める。
 *
 * `og.mjs` から切り出してある。あちらは開くだけでブラウザを起こすので、
 * 置き方の決まりを見張り（`ogframe_selftest.mjs`）から当てられない。
 * **計算だけをここに置けば、ブラウザ無しで両側から挟める。**
 *
 * ## なぜ幅だけでは足りなかったか（2026-10-03）
 *
 * もとの決まりは「**陸の横幅が枠の 45%（540px）になる大きさで置く**」の一本
 * だった。引きの倍率は島の縦幅を画面の高さに合わせるので（`IsleStage` の
 * `wideSpan`）、横幅は置いた高さにほぼ比例する——という理屈はいまも正しい。
 *
 * 外れたのは**島の形が章で変わる**ところ。実測（同じ書き出し・同じ道具・
 * 同じ日。ブラウザの時計だけずらして撮り分けた）:
 *
 * | 章 | 陸（`.ig-sand`）を 540px 幅で置いたとき | 海 | 陸 |
 * | --- | --- | --- | --- |
 * | 北欧（縦に細い） | 540×829 — **枠（630）より高い。上下が切れて枠が埋まる** | 50.4% | 24.8% |
 * | アルバニア（丸い） | 540×463 — **枠より低い。上下に 167px の海が余る** | 70.2% | 13.3% |
 *
 * 9/28 に章がアルバニアへ移った翌晩から、毎晩の焼き直しが
 * 「海が 70.2%（68% 超）／陸が 13.3%（16% 未満）」で赤い。
 * **判定（`ogcheck.py`）は正しく、置き方のほうが片側しか見ていなかった。**
 *
 * ## いまの決まり
 *
 * **幅で決めた大きさと、高さで決めた大きさの、大きいほうを採る。**
 *
 * - 縦に細い島は幅のほうが大きいので、**置き方は1pxも変わらない**
 * - 丸い島は高さのほうが大きくなり、陸が枠の高さまで伸びて海が引く
 *
 * 伸ばしっぱなしにはしない。横に長い島を高さで合わせると陸が枠の幅を越えて、
 * **左右から海が消える**（それは島ではなく陸地の絵になる）。だから陸の横幅に
 * 止め（`LAND_W_MAX`）を置く。
 */

/** 共有カードの枠。`og.mjs` の W, H と同じ */
export const FRAME = { w: 1200, h: 630 };

/**
 * 陸（浜まで含めた `.ig-sand`）を、枠の幅の何割に置くか。**ここが下限。**
 * 45%。これより細いと、島が枠の中で点に見える
 */
export const LAND_W = 540;

/**
 * 陸の縦幅が枠の高さに届かないとき、ここまで引き伸ばす。
 * **枠の高さちょうど**（630）。余白を残す理由が無い——
 * 上下に余った海はそのまま「島より海を配っている」になる
 */
export const LAND_H = FRAME.h;

/**
 * 引き伸ばしの止め。陸の横幅がこれを越えたら、そこで止める。
 * 70%（840px）＝ 左右に 180px ずつ海が残る。実測の並び（同じ島を
 * 大きさだけ変えて撮った）では、陸 780px で海 48.6%・陸 26.2% なので、
 * 840px でも `ogcheck.py` の海の下限（12%）には遠い
 */
export const LAND_W_MAX = 840;

/** 置く高さの止め。島が枠の外まで伸びると海が1本も写らない（`og.mjs` から移設） */
export const ISLE_MIN = 520;
export const ISLE_MAX = 1400;

/** どれだけ外れたら「狙いに届かなかった」と言うか */
const SLACK = 0.08;

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/**
 * 測った陸の箱から、島を置く高さ（`--og-isle`）を出す。
 *
 * @param {{w:number,h:number}} land 高さ `probe` で置いたときの陸の箱
 * @param {object} o 決まりの差し替え（見張りが片側ずつ折るために開けてある）
 * @returns {{isle:number, by:"幅"|"高さ", sand:{w:number,h:number}, capped:boolean}}
 */
export function isleHeight(land, o = {}) {
  const probe = o.probe ?? 780;
  const landW = o.landW ?? LAND_W;
  const landH = o.landH ?? LAND_H;
  const landWMax = o.landWMax ?? LAND_W_MAX;
  const isleMin = o.isleMin ?? ISLE_MIN;
  const isleMax = o.isleMax ?? ISLE_MAX;

  // 陸の横幅・縦幅は、どちらも置いた高さにほぼ比例する（`wideSpan`）。
  // だから「狙いの寸法 ÷ いまの寸法」で、要る高さがそのまま出る
  const byW = (probe * landW) / land.w;
  const byH = (probe * landH) / land.h;
  // **止めは幅で掛ける。** 高さで伸ばした結果、陸が枠の幅を越えるのを防ぐ
  const cap = (probe * landWMax) / land.w;

  const want = Math.max(byW, byH);
  const capped = want > cap;
  const isle = Math.round(clamp(Math.min(want, cap), isleMin, isleMax));
  const k = isle / probe;
  return {
    isle,
    by: byH > byW ? "高さ" : "幅",
    sand: { w: land.w * k, h: land.h * k },
    capped,
  };
}

/**
 * 置いたあとの陸の箱が、**枠として成り立っているか**。
 * 通ったら空の一覧（`ogcheck.py` の `judge` と同じ形）。
 *
 * ここで見るのは画素ではなく箱なので、**撮る前に言える。**
 * 画素のほうは `ogcheck.py` が撮ったあとに見る。
 */
export function framingFaults(sand, o = {}) {
  const frame = o.frame ?? FRAME;
  const landW = o.landW ?? LAND_W;
  const landWMax = o.landWMax ?? LAND_W_MAX;
  const bad = [];
  if (sand.w < landW * (1 - SLACK)) {
    bad.push(`陸が ${Math.round(sand.w)}px（狙いの下限 ${landW}px に届かない。止めに当たっています）`);
  }
  if (sand.w > landWMax * (1 + SLACK)) {
    bad.push(`陸が ${Math.round(sand.w)}px（止め ${landWMax}px 超。左右から海が消えます）`);
  }
  // **枠が埋まっているか。** 高さで埋まっているか、幅の止めまで伸びているかの
  // どちらか。どちらでもないなら、上下に海が余ったまま出すことになる
  const fillsH = sand.h >= frame.h * (1 - SLACK);
  const atCap = sand.w >= landWMax * (1 - SLACK);
  if (!fillsH && !atCap) {
    bad.push(
      `陸が ${Math.round(sand.w)}x${Math.round(sand.h)}px で枠（${frame.w}x${frame.h}）を埋めていない` +
        `（上下に ${Math.round(frame.h - sand.h)}px の海が余ります）`,
    );
  }
  return bad;
}
