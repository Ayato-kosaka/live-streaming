/**
 * 引き（島ぜんぶ）の札を、**建物のそばに置く**ための決めごと。
 *
 * 手で作った島（`components/island/IslandStage.tsx`）と章の島
 * （`components/isle/IsleStage.tsx`）が、同じ逃がし方を別々に持っていた。
 * 直すなら両方（`docs/island-misses.md` 決めごと5）なので、判断はここに1つ置く。
 *
 * ## なぜ要るか
 *
 * 逃がし方が「上下へずらす」だけだったので、混んでいる島では札が
 * **建物から離れたところまで運ばれていた。** 実測（390px・引き・章の島）:
 *
 *     企画をだす 49px / これから 49px / アプリ 49px / となりの島へ 49px / 配信 61px
 *     歩いた国  148px（建物のはるか上、木の上）
 *     あやとのこと 249px（島から外れた海の上。差し棒は何も指していない）
 *
 * `docs/island-design.md` 3-1 は「押す場所は物そのもの。ヒットエリアが絵から
 * ずれていると、人は壊れていると感じる」と決めている。**海に浮いた札は、
 * 名前が読めても行き先を指していない。**
 *
 * ## 決めたこと
 *
 * 1. ふさがっていたら、**まず建物のまわりを回る**（上・下・右・左）。
 *    上下へ運ぶのは、まわりが全部ふさがっていたときだけ
 * 2. それでも建物から `MAX_LEAD` より遠くなるなら、**その札は出さない。**
 *    出さないぶん、建物そのものは押せるように戻す（`data-far`）
 */

export type Box = { x: number; y: number; w: number; h: number };

/**
 * 札が建物から離れてよい上限（札の中心 → 建物の足元。px）。
 *
 * 建物の真上に出たときの距離が、引きでは 40〜50px。まわりへ回した札で
 * 70〜100px になる。**そこから先は、指している先が読み取れない。**
 * 実測でいちばん遠かった「あやとのこと」は 220px（島の外の海）だった。
 *
 * ここを 92 まで詰めたら、390px の引きで6枚のうち3枚が消えた。
 * **消すのは最後の手**なので、まわりを回れる場所を増やして（下の `around`）、
 * 上限は「隣の建物1つぶん」に置く。
 */
export const MAX_LEAD = 108;

/** 箱どうしが重なっているか */
export function hits(a: Box, b: Box): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

/** 札の中心から、建物の足元までの距離 */
export function lead(b: Box, fx: number, fy: number): number {
  return Math.hypot(b.x + b.w / 2 - fx, b.y + b.h / 2 - fy);
}

/**
 * 建物のまわりの置き場所を、近い順に返す。
 *
 * `rect` は「建物の真上」（既定の置き場所）。そこがふさがっているときに、
 * 下・右・左の順で試す。**離れるのではなく、回る。**
 *
 * @param rect 既定の置き場所（建物の真上）
 * @param fx,fy 建物の足元
 * @param artW 建物の絵の幅（px）
 * @param mh   建物の絵の高さ（px。札はこの上に出ている）
 */
export function around(rect: Box, fx: number, fy: number, artW: number, mh: number): Box[] {
  /* 建物の当たりは指で押せる最小（48px）まで広げてあるので、絵が小さくても
     **半分（24px）は必ず空ける。** 空けないと、横へ回した札の上に隣の建物の
     見えない当たりが乗って、札が 40x26px まで削られる（実測） */
  const gapX = Math.max(artW / 2, 24) + 10;
  const midY = fy - mh / 2 - rect.h / 2;
  const below = fy + 10;
  // 斜めにずらす量。札半分ぶん。真上・真下が埋まっていても、肩なら空いていることが多い
  const sx = rect.w / 2 + 6;
  return [
    rect,
    // 建物の肩（真上の左右）。いちばん近い逃げ場
    { ...rect, x: rect.x - sx },
    { ...rect, x: rect.x + sx },
    // 建物の下。足元から少し下げる（接地影とかぶらない程度）
    { ...rect, y: below },
    { ...rect, x: rect.x - sx, y: below },
    { ...rect, x: rect.x + sx, y: below },
    // 右と左。建物の胴の高さに合わせる
    { ...rect, x: fx + gapX, y: midY },
    { ...rect, x: fx - gapX - rect.w, y: midY },
  ];
}

/* =========================================================
   押しどころの取り合い
   ---------------------------------------------------------
   当たりを 48px まで広げた者どうしが重なると、**あとから描かれたほうが勝ち、
   先に描かれたほうが痩せる。** 広げた側は盗んだ覚えが無いので気づけない。
   実測（390px・`tools/sprites/foldsweep.mjs`）で、島の「話しかける」が
   12x60 / 36x60 / 41x15 まで削られていた。相手はぜんぶ建物の当たり。

   島は絵なので、**余白を足して解けない。** 建物の位置は絵の都合で決まって
   いるし、住人は歩くので、いまどこに立っているかを先に決められない。
   重なり順も変えない——建物は行き先で、会話はおまけなので、
   住人が建物を塞いだら島の行き先が消える（`docs/island-design.md` 3-7）。

   **決めたのは、負けたほうの畳み方。** 痩せたまま残さない。

   1. 上にいるものに食われたら、**空いているほうへ寄る**（`cuts`）。
      建物は前の建物に下半分を隠されるが、見えている上半分は押せる
   2. 寄せても 48px に足りなければ、**空いているほうへ伸ばして取り戻す**（`widen`）
   3. それでも取れなければ、**引っ込む**（`fitHit` が null）。
      12px の帯を残すより、無いほうがいい

   **引っ込めた建物に、代わりの入口があるとは限らない。**
   ここには「引っ込んでも札から入れる」と書いてあったが、それが正しいのは
   **引き（島をながめる）で、その建物が看板の6つのとき**だけ。

   - 寄り（降り立った画面）では `.isle-spot:not(.is-on) .isle-mark` が
     `opacity: 0` なので、**近づいている1軒以外の札は出ていない。**
     引っ込んだ建物の逃げ道は「歩いて近づく」「島をながめるを押す」
     「下の紙まで送る」の3つで、札ではない
   - 引きでも、看板でない建物（表紙なら6軒）には札が出ない。
     そこを引っ込めると**入口がまるごと無くなる**

   なので `fitHit` が null を返したとき、**呼ぶ側は代わりの入口があるかを
   自分で見る。** 無いなら、それは取り合いの解き方のほうを直す合図
   （`IsleStage` の `takesTap`。指を取らない当たりを取り合いに入れない）。

   札の逃がし方（上の `around`）と同じ考えで、**ずらす → 駄目なら出さない**。

   ## ここで解けないもの — 建物がまるごと板の下に入ったとき

   `cuts` も `widen` も、**空いている場所があるときにしか効かない。**
   上に乗っているのが横いっぱいの板だと、切っても伸ばしても 48px は残らず、
   引っ込めるしかない。引っ込めた建物に代わりの入口が無ければ、
   **そこで島の入口が1つ消える。**

   実測（2026-09-14・幅390・表紙の引き）で、旅の板（`.htrip`、横 358px）の下に
   「伝説の企画」の当たり 48x48 がまるごと入って、そうなっていた。
   直したのは**この関数ではなく、板の置き場所**（島の外へ出した。
   `docs/island-design.md` 6章「島の上に置く板は、入口の立っていない帯に1枚だけ」）。
   **ここで直そうとしない。** 島は絵で、建物の位置は動かせないので、
   板を島の上に置いたままでは、どう畳んでも入口が1つ消える。
   ========================================================= */

/** 指で押せる最小（`docs/island-design.md` 3-2） */
export const TAP = 48;

/**
 * 当たりを決めるときに狙う大きさ。**48 ではなく 49。**
 *
 * 測るほうは中心から1pxずつ外へ伸ばして数えるので、48.0px ちょうどの箱は
 * 47 と出ることがある（端の1画素が半分ずつに割れる）。1px 多く取っておけば、
 * 数え方の丸めで落ちない。**足りない側へ1px 寄せるほうが、
 * 「取れているのに割れと出る」より安い。**
 */
export const TAP_FIT = 49;

/**
 * `a` から `b` に取られているぶんを切り落とした残りを、**広いほうから順に**返す。
 * 前の建物に下を隠された建物なら、上半分がいちばん広い。
 *
 * **1つに決めない。** 前は「いちばん多く残るほう」の1つだけを返していたが、
 * 残りが広いことと、そこから 48px に戻せることは別。実測（390px・表紙の引き）で
 * 「これから」は上に 15.2px・左に 13px 残っていて、広い上を選んだが**上は板が
 * ふさいでいて伸ばせず**、狭い左なら 49px に戻せていた。1px 広いほうを選んだ
 * だけで、入口が1つ消えた（`fitHit` が順に試す）。
 */
export function cuts(a: Box, b: Box): Box[] {
  if (!hits(a, b)) return [a];
  const keepL = b.x - a.x;
  const keepR = a.x + a.w - (b.x + b.w);
  const keepU = b.y - a.y;
  const keepD = a.y + a.h - (b.y + b.h);
  return [
    { keep: keepL, box: { ...a, w: keepL } },
    { keep: keepR, box: { x: b.x + b.w, y: a.y, w: keepR, h: a.h } },
    { keep: keepU, box: { ...a, h: keepU } },
    { keep: keepD, box: { x: a.x, y: b.y + b.h, w: a.w, h: keepD } },
  ]
    .filter((c) => c.keep > 0)
    .sort((x, y) => y.keep - x.keep)
    .map((c) => c.box);
}

/**
 * 48px に足りないぶんを、**空いているほうへ伸ばして取り戻す。**
 * まん中へ伸ばすのを先に試し、駄目なら片側ずつ。どこも空いていなければ
 * 足りないまま返す（呼ぶ側が引っ込める）。
 */
export function widen(a: Box, blockers: Box[], min = TAP): Box {
  let r = a;
  if (r.w < min) {
    const need = min - r.w;
    const tries = [
      { ...r, x: r.x - need / 2, w: min },
      { ...r, w: min },
      { ...r, x: r.x - need, w: min },
    ];
    const ok = tries.find((c) => !blockers.some((q) => hits(c, q)));
    if (ok) r = ok;
  }
  if (r.h < min) {
    const need = min - r.h;
    const tries = [
      { ...r, y: r.y - need / 2, h: min },
      { ...r, y: r.y - need, h: min },
      { ...r, h: min },
    ];
    const ok = tries.find((c) => !blockers.some((q) => hits(c, q)));
    if (ok) r = ok;
  }
  return r;
}

/**
 * 当たりを1つ決める。**取れなければ `null`（＝押しどころを出さない）。**
 *
 * `want` は「何も無ければここを取りたい」箱（＝絵の大きさ。48px まで広げたもの）。
 * `blockers` は自分より上にいる押しどころ。
 */
export function fitHit(want: Box, blockers: Box[], min = TAP, bounds?: Box): Box | null {
  let r = want;
  /* **島の外へはみ出したぶんは、はじめから無い。**
     画面の外は突きようが無いので、そこを当たりとして数えても押せない
     （実測で「話しかける」が `≧15(画面端)` と出ていた。左端に立っている人）。
     はみ出しを落としてから 48px を見て、足りなければ引っ込める。 */
  if (bounds) {
    const x = Math.max(r.x, bounds.x);
    const y = Math.max(r.y, bounds.y);
    const w = Math.min(r.x + r.w, bounds.x + bounds.w) - x;
    const h = Math.min(r.y + r.h, bounds.y + bounds.h) - y;
    if (w <= 0 || h <= 0) return null;
    r = { x, y, w, h };
  }
  /* 切るのは最大3回。1回切ると別の相手と重なることがあるので繰り返す。
     **切る向きは、残りの広さでは決めない。** 広い残りが伸ばせず、狭い残りなら
     伸ばせる、ということが起きる（`cuts` に実測）。広いほうから順に試して、
     **49px に戻せた最初の1つ**を採る。戻せる向きが1つも無ければ引っ込める。
     4方向 × 3回で最大 64 通りだが、たいてい1つめで決まるので、
     ふだんの重さは前と変わらない。 */
  const solve = (a: Box, left: number): Box | null => {
    const b = blockers.find((q) => hits(a, q));
    if (!b) {
      const w = widen(a, blockers, min);
      if (w.w < min || w.h < min) return null;
      if (bounds && (w.x < bounds.x || w.y < bounds.y || w.x + w.w > bounds.x + bounds.w || w.y + w.h > bounds.y + bounds.h))
        return null;
      return w;
    }
    if (left <= 0) return null;
    for (const c of cuts(a, b)) {
      const got = solve(c, left - 1);
      if (got) return got;
    }
    return null;
  };
  return solve(r, 3);
}
