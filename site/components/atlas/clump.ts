/**
 * 近すぎるピンを、1つのまとまりにたたむ。
 *
 * **なぜ要るか。** 世界ぜんぶを1枚に収めると、18カ国のピンは 390px の
 * 画面で 340px の中に入る。オーストリアとスロバキアは中心どうしが
 * 3.7px しか離れない。ここに 48px の口を2つ置くと、必ずどちらかが
 * どちらかの真ん中を覆う。実測すると 18本中 12本が**自分の中心を
 * 隣に取られていて**、オーストリアは自分の箱の 2% しか自分に届かなかった。
 *
 * 口を小さくすれば重なりは消えるが、今度は 48px（`docs/island-design.md`
 * 3-2）を割る。**押しどころを小さくするのではなく、的の数を減らす。**
 * 入らないぶんは1つにたたんで、押したらそこへ寄る。寄れば離れる。
 *
 * 距離はチェビシェフ（縦と横の大きいほう）で測る。的は正方形なので、
 * ユークリッドで 50px 離れていても斜めなら箱は重なる（35, 35 は距離 49 でも
 * 縦横とも 48 未満）。**四角の重なりを測るなら、四角の物差しで測る。**
 */

/**
 * たたむ前の1つ。
 *
 * `sx` `sy` は**押しどころの箱の中心**（ステージの中の px）。
 * 地図のいちばん端にある国は、点そのものに 48px の箱を置くと箱が枠から
 * はみ出して、見えているぶんしか押せない（アラブ首長国連邦が 48x47 だった）。
 * 箱だけ枠の中へ押し戻して、絵のほうは `ox` `oy` で元の場所へ戻す。
 * ずれるのはアラブ首長国連邦の 8px だけで、それ以外は 0。
 */
export type Spot = {
  slug: string; order: number; x: number; y: number;
  sx: number; sy: number; ox: number; oy: number;
};

/** たたんだあとの1つ。`members` が1つなら、ふつうのピン。 */
export type Clump = { members: Spot[]; sx: number; sy: number };

/**
 * 中心どうしが `min` px より近いものを、無くなるまでたたむ。
 *
 * いちばん近い組から順にたたむ。手前から順に見てたたむと、
 * 「たまたま先に見た組」が勝って、離れているほうが先にくっつく。
 * @param {Spot[]} spots たたむ前のピン
 * @param {number} min これ以上は近づけない距離（px）
 * @return {Clump[]} たたんだあと。どの2つも `min` 以上離れている
 */
export function clump(spots: Spot[], min: number): Clump[] {
  const gs: Clump[] = spots.map((s) => ({ members: [s], sx: s.sx, sy: s.sy }));
  for (;;) {
    let a = -1;
    let b = -1;
    let near = min;
    for (let i = 0; i < gs.length; i++) {
      for (let j = i + 1; j < gs.length; j++) {
        const d = Math.max(Math.abs(gs[i].sx - gs[j].sx), Math.abs(gs[i].sy - gs[j].sy));
        if (d < near) {
          near = d;
          a = i;
          b = j;
        }
      }
    }
    if (a < 0) return gs;
    const members = [...gs[a].members, ...gs[b].members];
    gs[a] = {
      members,
      sx: members.reduce((t, m) => t + m.sx, 0) / members.length,
      sy: members.reduce((t, m) => t + m.sy, 0) / members.length,
    };
    gs.splice(b, 1);
  }
}
