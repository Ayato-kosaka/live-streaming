import MINI from "@/content/spriteMini.json";

const HAVE = new Set<string>(MINI);

/**
 * 札の頭（`.mini-icon`、24px）に出すスプライトの道。
 *
 * 本体（`/sprites/<名>.webp`）は島に大きく置くための 320px で、伝説の印は1枚 8〜17KB ある。
 * 24px にしか出さない札がそれを取りに行くと、札の並ぶ面の頭がそのぶん重くなる
 * （W10 #1357 で `/travel/latvia` が最初の1画面の上限を超えた）。
 * 72px の小さい版（`tools/sprites/meta.py` の `MINI`）が在る名前はそちらを、無ければ本体を指す
 * ——無い絵を指すと 404 になるので、在るかどうかは焼いたときの名簿（`content/spriteMini.json`）で見る。
 */
export const miniSprite = (name: string): string =>
  HAVE.has(name) ? `/sprites/mini/${name}.webp` : `/sprites/${name}.webp`;
