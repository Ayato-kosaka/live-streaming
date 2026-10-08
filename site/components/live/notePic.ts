/**
 * 付箋に貼る絵を、送れる形に焼く（2026-10-08）。
 *
 * あやとの言葉:
 *
 * > 付箋に画像も貼れるようにしてほしくて。（略）
 * > でなんか見るときは邪魔にならないようにしてほしいんですけど。
 *
 * ## なぜ2枚焼くのか
 *
 * 板（`/board`）は付箋が並ぶ面で、1枚ずつ絵を持つ。**閉じているあいだに
 * 大きい絵を落とすと、貼られるほど重くなる面**になる
 * （`docs/island-standards.md` 7章）。だから
 *
 *   - 閉じているあいだに並ぶ1枚 … 長辺 480（`PIC_THUMB`）
 *   - 押して開いたときの1枚     … 長辺 1200（`PIC_LONG`）
 *
 * を**貼るときに2枚とも焼いて**送る。サーバーは2枚とも中身を見てから置く
 * （片方だけ送ると 400。省ける道を開けると、そこが必ず使われる）。
 *
 * ## 焼くのはブラウザ
 *
 * Functions で縮めるには画像を解く道具が要るし、スマホから送るバイト数も
 * 減らない。**旅先の細い電波から貼るのは視聴者さんのほう**なので、
 * 送る前に小さくする（写真の口と同じ考え。`components/nordic/stamp.ts`）。
 *
 * 焼く仕事そのものは `shrink` ひとつに寄せてある。**写しを作らない**——
 * Exif の回転・webp の出ない端末（iOS Safari は
 * `toDataURL("image/webp")` を黙って png に落とす）の受けが、
 * あちらに全部書いてある。
 */

import { shrink } from "@/components/nordic/stamp";

/** 押して開いたときの長辺。付箋の中で見るものなので、写真（1600）より小さい */
export const PIC_LONG = 1200;
/** 閉じているあいだに並ぶ長辺。板に出る大きさ（約270px）の dpr2 ぶん */
export const PIC_THUMB = 480;

/**
 * 焼いたあとの上限。**サーバー側の `MAX_PIC_BYTES` と同じ4MB。**
 *
 * 長辺1200の webp がここに届くことはない（相場は 100〜300KB）。
 * それでも見るのは、**断られる前に言う**ため——届いてから 400 で返ると、
 * 貼った人には電波の話に見える。
 */
export const MAX_PIC_BYTES = 4 * 1024 * 1024;

/** 焼けた2枚と、画面に出す見本。 */
export type PickedPic = {
  /** 開いたときの1枚（base64） */
  image: string;
  w: number;
  h: number;
  /** 板に並ぶ1枚（base64） */
  thumb: string;
  tw: number;
  th: number;
  /** 貼る前に見せる見本。**選んだ元の絵**（`URL.createObjectURL`） */
  preview: string;
};

/** 焼いた結果。**駄目だった理由は、画面に出せる日本語で返す。** */
export type PickResult =
  | { ok: true; pic: PickedPic }
  | { ok: false; why: string };

/** base64 が元のバイト数でいくつか。`=` の埋めぶんを引く */
const bytesOf = (b64: string): number =>
  Math.floor((b64.length * 3) / 4) - (b64.endsWith("==") ? 2 : b64.endsWith("=") ? 1 : 0);

/**
 * 選ばれた1枚を、送れる形に焼く。
 *
 * **絵として読めなかったものは、ここで止まる。** 拡張子を見ないのは
 * サーバーと同じ理由で、読んでみるのがいちばん確か（読めなければ絵ではない）。
 * @param file 選ばれたファイル
 */
export async function pickPic(file: File): Promise<PickResult> {
  let big: Awaited<ReturnType<typeof shrink>> = null;
  let small: Awaited<ReturnType<typeof shrink>> = null;
  try {
    big = await shrink(file, PIC_LONG);
    small = await shrink(file, PIC_THUMB);
  } catch {
    /* canvas が汚れた・解けなかった。**理由は言わない**（中の話）ので、
       次にできることだけ言う */
    return { ok: false, why: "この絵は読めなかった。ほかの絵でためしてみて" };
  }
  if (!big || !small) {
    return { ok: false, why: "この絵は読めなかった。ほかの絵でためしてみて" };
  }
  if (bytesOf(big.image) > MAX_PIC_BYTES) {
    return { ok: false, why: "この絵は大きすぎた。小さいものをえらんでみて" };
  }
  return {
    ok: true,
    pic: {
      image: big.image,
      w: big.w,
      h: big.h,
      thumb: small.image,
      tw: small.w,
      th: small.h,
      preview: URL.createObjectURL(file),
    },
  };
}
