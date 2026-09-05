/**
 * いま島にいる人（`docs/island-here.md`）。
 *
 * ログインした人の YouTube のアイコンが島に立つ。その人が島を歩けば、
 * 他の人の画面でもその絵が動く。島の外のページを見ているあいだは、
 * そのページの建物のそばに立つ。**押せない。見えるだけ。**
 *
 * ## 島にもともと立っている住人とは別物
 *
 * 住人（`content/residents.ts`）は視聴者さんが作ったキャラクターで、日替わりの
 * 顔ぶれ。その人がいま来ているかどうかとは関係ない。こちらは
 * 「いま、ほんとうにここにいる人」で、丸い YouTube のアイコンで出す。
 *
 * ## なりすまし
 *
 * **`islandHere` には居場所と時刻しか入れない。** 名前とアイコンを書かせると、
 * 他人の名前を名乗れる。誰なのかは islandApi の `/state` が返す `residents`
 * （サーバーが本人確認したもの）から uid で引く。
 *
 * ## 出したくない人を、出さない
 *
 * 名前もアイコンも「出す」と言っていない人は、**いることも出さない。**
 * 「いま見ている」は名前を出すより踏み込んだことなので、同じ同意より
 * 緩くはできない。仕組みの上でもそうなっていて、`residents` に載っていない人は
 * 出す絵も名前も無いので、居場所だけ届いても画面に出しようがない。
 * だから書き込む側も、載っていない人はそもそも書かない。
 * **ただし自分の姿は自分にだけ見える**（それは他の人には届かない）。
 */

import { DOORS, WORLD } from "@/components/island/layout";

/** Firestore のコレクション名。ここだけルールを開けてある。 */
export const HERE_COL = "islandHere";

/** これより古い `seenAt` の人は、画面に出さない。消し忘れたぶんの受け皿。 */
export const HERE_STALE_MS = 60_000;

/** 書き込みの間隔。位置が変わっても、これより短い間隔では書かない。 */
export const HERE_WRITE_MS = 2_000;

/**
 * 誰かが居るときに、居場所を読みにいく間隔。
 *
 * **書く側が2秒に1回しか置かないので、2秒より速く読んでも中身は同じ。**
 * ここを onSnapshot にしても届くものは変わらない（変わるのは遅れだけで、
 * 平均1秒）。そのために 590KB を全員に落とさせない（`lib/hereRest.ts`）。
 */
export const HERE_POLL_MS = 2_000;

/**
 * 誰も居ないときの間隔。
 *
 * **ほとんどの時間帯はこちら。** 0人のときの返りは数百バイトで、
 * 読んだ数も1件ぶんしか付かない。誰か現れたら次の1回で 2秒に切り替わるので、
 * 「最初の1人が見えるまで」がこの長さだけ遅れる。飾りなのでそれでよい。
 */
export const HERE_POLL_IDLE_MS = 20_000;

/**
 * 動いていなくても、これだけ経ったら1回書く。
 *
 * 「位置が変わったときだけ書く」だけだと、`/board` を5分読んでいる人は
 * 最初の1回きりになって、60秒で消える。消えないための下限がこれ。
 * 1分に2回なので、書き込みの数としては小さい。
 */
export const HERE_BEAT_MS = 30_000;

/**
 * 島に建っていないページの人が立つ場所。島の南の浜。
 * `/nordic` や `/atlas` のように、対応する建物が無いページから来た人はここに出る。
 */
const SHORE = { x: 556, y: 928 };

const clamp = (v: number) => Math.min(WORLD, Math.max(0, v));

/**
 * そのページを見ている人が、島のどこに立つか。
 *
 * **同じページを見ている人が同じ点に重なると、1人にしか見えない。**
 * uid から向きと距離を決めて散らす。毎回ふり直すと、読み直すたびに人が
 * ワープするので、同じ人はいつも同じところに立つ。
 * @param path いま見ているページ（"/board" など）
 * @param uid その人の uid
 */
export function hereSpot(path: string, uid: string): { x: number; y: number } {
  const top = `/${path.split("/")[1] ?? ""}`;
  const door = DOORS.find((d) => d.href === top);
  // 建物の足元そのものではなく、少し手前。建物の絵に埋まらないように
  const base = door ? { x: door.x, y: door.y + 24 } : SHORE;
  let h = 2166136261;
  for (let i = 0; i < uid.length; i++) {
    h ^= uid.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const a = ((h >>> 0) % 360) * (Math.PI / 180);
  const r = 24 + ((h >>> 9) % 22);
  // 縦は島が潰れて見える向きなので、横より狭く散らす
  return { x: clamp(base.x + Math.cos(a) * r), y: clamp(base.y + Math.sin(a) * r * 0.55) };
}

/** 島の上に立っている、1人ぶんの印。 */
export type HereMark = {
  uid: string;
  /** 届いた居場所（ワールド座標）。2秒に1回しか来ない */
  tx: number;
  ty: number;
  /** いま描いている場所。tx/ty へ寄せていくので、2秒ごとの飛びが出ない */
  x: number;
  y: number;
  /** 自分。位置は Firestore ではなく、いま動かしているあやとから毎フレーム取る */
  self?: boolean;
  el: HTMLElement | null;
  /** 前に書いた transform。同じなら書かない */
  tf?: string;
};

/**
 * 島の描画と、この仕組みの受け渡し場所。
 *
 * **React の状態にしない。** 島は毎フレーム 160枚のスプライトを抱えていて、
 * 位置が届くたびに setState すると島ぜんぶが描き直される
 * （`docs/island-design.md`「動きは React の外で」）。
 * 誰が居るかが変わったときだけ React が DOM を作り、位置は
 * `IslandStage` の rAF がここを見て直接書く。
 *
 * `marks` が空のときは、島の rAF は長さを見るだけで何もしない。
 * **誰も居ない時間帯の値段はゼロ。**
 */
export const here = {
  marks: [] as HereMark[],
  /** いまあやとが立っている場所。島を開いているあいだだけ live */
  pos: { x: 0, y: 0, live: false },
};
