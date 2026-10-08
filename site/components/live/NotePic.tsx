"use client";

import { useState } from "react";
import type { StickyPic } from "@/lib/api";

/**
 * 付箋に貼られた絵1枚（2026-10-08）。
 *
 * あやとの言葉:
 *
 * > でなんか見るときは邪魔にならないようにしてほしいんですけど。
 *
 * ## 閉じているあいだは、写真の切手1枚ぶん
 *
 * 板は付箋が並ぶ面なので、1枚が背を持つと**貼られるほど下が遠くなる**
 * （`docs/island-standards.md` 7章）。だから閉じているあいだの背は
 * **決まった高さ**（`--nt-pic-h`）で、中身の縦横によらない。
 * 落ちてくるのも小さいほう（`thumb`。長辺480）だけ。
 *
 * ## 押すと、その場で大きくなる
 *
 * 別の面にも、覆いの中にも出さない。**押した場所で開いて、もう一度押すと
 * 戻る。** 覆い（全画面）にすると、板を読んでいた場所が分からなくなるし、
 * 閉じる押しどころを探すことになる。
 *
 * 開いたときに初めて大きいほう（`url`。長辺1200）を落とす。
 * **押されるまで1バイトも落とさない。**
 *
 * ## 厚みを付ける
 *
 * 押せるので、下に厚みが要る（`docs/island-design.md` 3-3。
 * 合図は厚み1種類だけ）。紙に貼った写真の台紙に見えるので、
 * 付箋の上に乗っていても浮かない。
 */
export default function NotePic({ pic }: { pic: StickyPic }) {
  const [open, setOpen] = useState(false);
  /* 縦横を `<img>` の属性で渡す。**入るまでの場所を先に取る**ため
     （無いと絵が入った瞬間に下の付箋がまとめて飛ぶ）。 */
  const w = open ? pic.w : pic.tw;
  const h = open ? pic.h : pic.th;
  return (
    <button
      type="button"
      className={`nt-pic${open ? " is-open" : ""}`}
      aria-expanded={open}
      aria-label={open ? "絵を小さくする" : "絵を大きく見る"}
      onClick={() => setOpen((v) => !v)}
    >
      <img
        src={open ? pic.url : pic.thumb}
        width={w || undefined}
        height={h || undefined}
        alt=""
        loading="lazy"
        decoding="async"
      />
    </button>
  );
}
