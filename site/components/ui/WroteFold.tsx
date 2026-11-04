"use client";

import { useEffect, useId, useRef, useState, type ElementType } from "react";

import Icon from "./IconCore";
import Wrote from "./Wrote";

/**
 * 打ったままの字（`Wrote`）を、**長いときだけ数行で畳む。**
 *
 * ## なぜ要るのか
 *
 * 付箋の本文は 2026-11-04 に 120字から 2,000字になった
 * （あやと:「1枚に書ききれない時があるから、もっと文字数入れられるようにして欲しい」）。
 * 120字のころは、1枚の背がいちばん長くても8行ほどで止まっていた。
 * 2,000字を素で出すと、掲示板の付箋1枚がスマホで 130行を超えて、
 * **その下の付箋が1枚も見えなくなる**（`docs/island-standards.md` 7章
 * 「溜まるものは、溜まっても背が変わらない形にする」の、1枚の中の話）。
 *
 * ## 畳みかた
 *
 * - 字は**全部 DOM に置いたまま**、見た目だけ `lines` 行で切る
 *   （`-webkit-line-clamp`）。ページ内検索でも読み上げでも全文が届く
 * - 押しどころは並びの畳み（`Longer.tsx`）と**同じ形・同じ言い方**
 *   （`.longer`・「たたむ」）。同じ「畳んである」が面ごとに違う形をしない
 * - **本当に切れているときだけ**押しどころを出す。字数で決めると、
 *   幅の広い面では収まっている字に「つづき」が付き、狭い面では
 *   切れている字に付かない。描いたあとの背（`scrollHeight`）で決める
 * - 畳み直したら、その1枚が画面に入るところまで戻す。2,000字を読み終えた
 *   ところで畳むと、紙の頭はもう画面の上に抜けている
 */
export default function WroteFold({
  t,
  lines = 8,
  as,
  className,
}: {
  /** 書いてくれた字。空・未定義なら何も出さない */
  t?: string | null;
  /** 畳んだときに見せる行数 */
  lines?: number;
  /** 包む札（`Wrote` と同じ） */
  as?: ElementType;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [over, setOver] = useState(false);
  const box = useRef<HTMLDivElement | null>(null);
  const id = useId();

  useEffect(() => {
    const wrap = box.current;
    const el = wrap?.firstElementChild as HTMLElement | null;
    if (!wrap || !el) return;
    // 開いているあいだは切れていないので、測り直さない（押しどころは「たたむ」のまま）
    if (open) return;
    const measure = () => setOver(el.scrollHeight > el.clientHeight + 1);
    measure();
    /* 幅が変わると折れ方が変わる（回転・窓の幅・書体が届いた）。
       紙そのものの幅を見張る */
    const ro = new ResizeObserver(measure);
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [t, open, lines]);

  if (!String(t ?? "").trim()) return null;
  return (
    <>
      <div
        ref={box}
        id={id}
        className={`wr-fold${open ? " is-open" : ""}`}
        style={{ ["--wr-lines" as string]: lines }}
      >
        <Wrote t={t} as={as} className={className} />
      </div>
      {(over || open) && (
        <button
          type="button"
          className="longer wr-more"
          aria-expanded={open}
          aria-controls={id}
          onClick={() => {
            if (!open) {
              setOpen(true);
              return;
            }
            setOpen(false);
            // 畳んだあとの背で測るので、描き直しを1枚待ってから戻す
            requestAnimationFrame(() => box.current?.scrollIntoView({ block: "nearest" }));
          }}
        >
          {open ? "たたむ" : "つづきを読む"}
          <Icon name={open ? "up" : "chevron"} size={14} />
        </button>
      )}
    </>
  );
}
