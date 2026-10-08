/**
 * カードのキャラクターを、どこに・どれだけの大きさで立たせるか。
 *
 * **ブラウザの要らない式だけを置く。** `document` も `Image` も触らない。
 * 焼くところ（`components/nordic/stamp.ts`）はここを呼ぶだけにしてある。
 * 分けてあるのは、**置き方の計算を `tsc` に通して node から回せるようにする**
 * ため（`site/selftest/cardplace_selftest.mjs`）。canvas の中に閉じていると、
 * 「枠から出ないか」「2人が重ならないか」を確かめる手が無くなる。
 *
 * ここが持っているのは4つ。
 *
 *   1. 寸法の定数（`STAMP`）。見本から測った値
 *   2. 1体の置きどころ（`stampBox`）。**値も式も、分ける前から変えていない**
 *   3. 送られてきた置き方を締める（`clampPlace`）。**サーバーの `shapePlace`
 *      と同じ答えを返す**こと。ずれると、画面では出せたのに保存したら
 *      戻る、が起きる
 *   4. 2体の置きどころ（`layout`）。連れが本人を押しのけない形で並べる
 */

/** 寸法。`docs/nordic-photos.md` 5章の表と1対1で対応する。 */
export const STAMP = {
  /** 縦の写真。キャラクターの横幅は、写真の横幅のこれだけ */
  byWidth: 0.34,
  /** 横の写真。横幅で決めると大きすぎるので、高さを基準にする */
  byHeight: 0.2,
  /** 右端からの空き（写真の横幅に対して） */
  right: 0.02,
  /** 下端からの空き（写真の高さに対して） */
  bottom: 0.05,
  /** 傾き。見本は0度だった */
  tilt: 0,
} as const;

/** 2人のあいだに必ず空ける幅（写真の横幅に対して）。 */
export const GAP = 0.015;

/**
 * 連れを縮めてよい下限（本人に対する比）。
 *
 * これを下回るまで縮めないと並ばないときは、**2人とも同じ割合で縮める**。
 * 片方だけ豆粒になるくらいなら、2人そろって小さいほうがまだ絵になる。
 */
export const MATE_MIN = 0.45;

export type Box = { x: number; y: number; w: number; h: number };

/**
 * 本人が動かした置き方。**動かしていないカードは渡さない。**
 * 割合（0〜1）で、`y` は足元の高さ（`docs/island-cards.md` 5章）。
 */
export type Place = { x: number; y: number; rot: number; scale: number };

/**
 * 置き場所と、傾きと、左右を返すか。焼くほうも画面のほうもこれを受け取る。
 *
 * `flip` が立つのは**連れが本人の左に立ったとき**だけ。キャラクターの絵は
 * どれも左を向いているので、左に立つと**本人に背を向ける。** 返せば
 * 向き合う。本人（先頭）には立たない——1体のときの絵を変えないため。
 *
 * **字や標識の入った絵は返さない**（`Actor.canFlip` が `false`）。
 * 返すと字が裏返って読めなくなる。
 */
export type Placed = { box: Box; rot: number; flip: boolean };

/** 1体ぶんの、絵の中身の大きさと、本人が動かした置き方。 */
export type Actor = {
  w: number;
  h: number;
  place?: Place | null;
  /**
   * 左右を返してよい絵か。**既定は返してよい**（`undefined` は `true`）。
   *
   * 連れが本人の左に立つと、返さないかぎり背を向ける。キャラクターの絵は
   * どれも左を向いているので、ふだんは返してよい。**返してはいけないのは、
   * 字や標識の入った絵**——返すと字が裏返って読めなくなる
   * （あやとステッカーの「STOP」が実際にそうなった。2026-10-08）。
   */
  canFlip?: boolean;
};

const clamp = (n: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, n));

/**
 * 送られてきた置き方を、置いてよい形にする。
 *
 * **`functions/src/streamEvents.ts` の `shapePlace` と同じ答えを返すこと。**
 * 締め方が片方だけ違うと、**画面では置けたのに、保存して開き直すと別の
 * 場所に戻る。** 直したつもりが直っていない、のいちばん出やすい形なので、
 * 同じ入力を両方へ通して突き合わせる対照を置いてある
 * （`site/selftest/cardplace_selftest.mjs` の 2）。
 *
 * 丸めの桁まで同じにしてあるのは、**送る前と送ったあとで値が動かない**
 * ようにするため。ここで丸めずに出すと、保存のたびに絵がわずかに跳ねる。
 */
export function clampPlace(
  got: Partial<Place> | Record<string, unknown>,
  now: Place,
): Place {
  const num = (v: unknown, fall: number): number => {
    const n = Number(v);
    return Number.isFinite(n) ? n : fall;
  };
  const b = got as Record<string, unknown>;
  return {
    x: Math.round(clamp(num(b.x, now.x), 0, 1) * 1000) / 1000,
    y: Math.round(clamp(num(b.y, now.y), 0, 1) * 1000) / 1000,
    rot: Math.round(clamp(num(b.rot, now.rot), -180, 180) * 10) / 10,
    scale: Math.round(clamp(num(b.scale, now.scale), 0.2, 3) * 1000) / 1000,
  };
}

/**
 * キャラクターを置くところ。返るのは**見えている中身**の矩形。
 *
 * 縦の写真は横幅で、横の写真は高さで決める（`docs/nordic-photos.md` 5章）。
 * 縦の写真で高さを基準にすると小さすぎ、横の写真で横幅を基準にすると
 * 画面の3分の1がキャラクターになる。
 *
 * **既定は右下ひとところ、大きさも1つ。** 台帳の `x/y/scale` を素直に
 * 使うと、散らした先が右端を越えて絵が切れ、1人ずつ大きさが変わる
 * （あやと・2026-09-10）。本人が動かしたぶんだけ `place` で受けて、
 * そのときも枠から出さない。**画面側（`components/cards/cards.ts` の
 * `cardPlace`）と同じ決め方にしてある。** 片方だけ直すと、見えている絵と
 * 持って帰る絵がずれる。
 *
 * @param pw 写真の横幅 @param ph 写真の高さ
 * @param cw キャラクターの中身の横幅 @param ch 同じく高さ
 */
export function stampBox(
  pw: number,
  ph: number,
  cw: number,
  ch: number,
  place?: Place | null,
): Box {
  const aspect = cw / Math.max(1, ch);
  const k = place ? Math.min(2, Math.max(0.4, place.scale || 1)) : 1;
  const w = (ph > pw ? pw * STAMP.byWidth : ph * STAMP.byHeight * aspect) * k;
  const h = w / aspect;
  if (!place) {
    return { x: pw - pw * STAMP.right - w, y: ph - ph * STAMP.bottom - h, w, h };
  }
  const x = Math.min(pw - w, Math.max(0, place.x * pw - w / 2));
  const y = Math.min(ph - h, Math.max(0, place.y * ph - h));
  return { x, y, w, h };
}

/** 焼くときの傾き。**`place` が無ければ見本の0度。** */
export const tiltOf = (place?: Place | null): number =>
  place ? clamp(place.rot || 0, -20, 20) : STAMP.tilt;

/**
 * 既定（右下）とまったく同じところに立つ `place`。
 *
 * 「もとにもどす」で使う。**`stampBox(..., null)` と1pxも違わない箱を返す**
 * 値でないと、戻したのに少しずれる（対照は自己点検の 6）。
 */
export function defaultPlaceFor(
  pw: number,
  ph: number,
  cw: number,
  ch: number,
): Place {
  const at = stampBox(pw, ph, cw, ch, null);
  return {
    x: (at.x + at.w / 2) / Math.max(1, pw),
    y: (at.y + at.h) / Math.max(1, ph),
    rot: 0,
    scale: 1,
  };
}

/**
 * 傾けたあと、その形が占める外接矩形。
 *
 * 傾きの原点は**足元**（焼くほうもそうしている）。重なっているかどうかは
 * 傾ける前の箱ではなく、こちらで見る——20度傾けた人の頭は、箱の外へ出る。
 */
export function aabb(box: Box, rot: number): Box {
  if (!rot) return { ...box };
  const px = box.x + box.w / 2;
  const py = box.y + box.h;
  const s = Math.sin((rot * Math.PI) / 180);
  const c = Math.cos((rot * Math.PI) / 180);
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const [cx, cy] of [
    [box.x, box.y],
    [box.x + box.w, box.y],
    [box.x, box.y + box.h],
    [box.x + box.w, box.y + box.h],
  ]) {
    const dx = cx - px;
    const dy = cy - py;
    const rx = px + dx * c - dy * s;
    const ry = py + dx * s + dy * c;
    if (rx < x0) x0 = rx;
    if (rx > x1) x1 = rx;
    if (ry < y0) y0 = ry;
    if (ry > y1) y1 = ry;
  }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/** 足元を動かさずに、大きさだけ変える。 */
function scaleFoot(box: Box, k: number): Box {
  const cx = box.x + box.w / 2;
  const foot = box.y + box.h;
  const w = box.w * k;
  const h = box.h * k;
  return { x: cx - w / 2, y: foot - h, w, h };
}

/**
 * 1体または2体の置きどころを決める。
 *
 * **1体のときは `stampBox` そのまま。** 2体に広げたときに、いままでの
 * カードが1pxでも動いたら作り直しなので、ここは分岐の頭で返している。
 *
 * 2体目（連れ。いまのところ「あやと本人」）の決め:
 *
 *   1. **本人を押しのけない。** 動かした位置があるならそれが先で、
 *      連れは空いているほうへ立つ
 *   2. **足元の高さをそろえる。** 同じ地面に立っていないと、貼った紙に見える
 *   3. **重ならない。** 傾きまで入れた外接矩形どうしで、必ず隙間を空ける
 *   4. **枠から出ない。** 空いているほうに入り切らなければ連れを縮め、
 *      それでも足りなければ**2人そろって**縮める（`MATE_MIN`）
 *
 * @param pw 写真の横幅 @param ph 写真の高さ
 * @param actors 立たせる人。**先頭が本人**で、2人目が連れ
 */
export function layout(pw: number, ph: number, actors: Actor[]): Placed[] {
  if (actors.length === 0) return [];
  const a = actors[0];
  const you: Placed = {
    box: stampBox(pw, ph, a.w, a.h, a.place),
    rot: tiltOf(a.place),
    flip: false,
  };
  if (actors.length === 1) return [you];

  const m = actors[1];
  const gap = pw * GAP;
  /* 連れの大きさは**本人と同じ決め方**。横幅の基準も倍率もそろえて、
     「2人のうち1人だけ大きい」が起きないようにする（置く場所は下で決める）。 */
  let mate = stampBox(pw, ph, m.w, m.h, a.place);
  const foot = you.box.y + you.box.h;

  /** 足元をそろえて置き直す。**高さが余らなければ、そのぶん縮める。** */
  const standAt = (box: Box): Box => {
    let out = box;
    if (out.h > foot) out = scaleFoot(out, foot / Math.max(1, out.h));
    return { ...out, y: foot - out.h };
  };
  mate = standAt(mate);

  const occ = aabb(you.box, you.rot);
  const left = Math.max(0, Math.min(pw, occ.x));
  const right = Math.max(0, Math.min(pw, occ.x + occ.w));
  const freeL = left;
  const freeR = pw - right;
  const toRight = freeR >= freeL;
  const avail = (toRight ? freeR : freeL) - gap;

  /** 返してよい絵か。**渡していなければ返してよい**（いままでと同じ） */
  const canFlip = m.canFlip !== false;

  if (avail >= mate.w * MATE_MIN) {
    // 空いているほうへ。**本人の隣に立たせる**（離して置くと、連れに見えない）
    if (mate.w > avail) mate = standAt(scaleFoot(mate, avail / mate.w));
    mate.x = toRight ? right + gap : left - gap - mate.w;
    return [you, { box: mate, rot: 0, flip: !toRight && canFlip }];
  }

  /* どちらへ寄せても入らない。**2人そろって縮める。**
     連れだけを豆粒にするより、2人とも小さいほうがまだ絵になる。
     本人は**もともと居た側の端**へ寄せて、動かした意図を残す。 */
  const k = Math.max(0.05, (pw - gap) / Math.max(1, occ.w + mate.w));
  you.box = scaleFoot(you.box, k);
  mate = standAt(scaleFoot(mate, k));
  const occ2 = aabb(you.box, you.rot);
  const stayRight = occ2.x + occ2.w / 2 >= pw / 2;
  const dx = stayRight ? pw - occ2.w - occ2.x : -occ2.x;
  you.box = { ...you.box, x: you.box.x + dx };
  occ2.x += dx;
  mate.x = stayRight ? occ2.x - gap - mate.w : occ2.x + occ2.w + gap;
  return [you, { box: mate, rot: 0, flip: stayRight && canFlip }];
}
