import type { ReactNode } from "react";


/**
 * **開く窓（見開き）。** 一覧の札を押すと開く詳しい中身（#1228。参考のパリのガイドブックの「見開き」）。
 *
 * ## 中身は、書き出しの HTML に最初から入れておく
 *
 * 窓の中の字は `<dialog>` の中に**焼いてある**。押してから取りに行く・描く作りにしない——
 * 検索と AI の読み手は JS を動かさない（`docs/guide-design.md` 6章「生の HTML に本文」）。
 * 閉じている窓は見えないだけで、DOM にもページ内検索の元にも在る。
 *
 * 開け閉めは `SheetHost`（面に1つ）が持つ。ここは形だけ。
 *
 * ## 見出しの段
 *
 * 窓の題は h3（節の見出しが h2）。窓の中の小見出しは h4。窓は節の中に置くので、段は飛ばない。
 */
export default function Sheet({
  id,
  title,
  kicker,
  tone,
  wide,
  hero,
  children,
  foot,
}: {
  id: string;
  title: ReactNode;
  /** 題の上の小さな字（「やりたいこと 3」など） */
  kicker?: ReactNode;
  /** 頭の帯の色（エリアの色） */
  tone?: string;
  /** 広い画面で見開き（左に絵・右に字）にする */
  wide?: boolean;
  /** 題の上に置く絵（見開きの左の頁） */
  hero?: ReactNode;
  children: ReactNode;
  /** 窓の下の帯（前へ・次へ） */
  foot?: ReactNode;
}) {
  return (
    <dialog id={id} className={`gb-dlg${wide ? " is-wide" : ""}`} aria-labelledby={`${id}-t`}>
      <div className="gb-dlg-in" style={tone ? ({ "--gb-tone": tone } as React.CSSProperties) : undefined}>
        <div className="gb-dlg-bar">
          {kicker ? <span className="gb-dlg-k">{kicker}</span> : <span />}
          {/* ×は CSS で描く（窓は82枚。1枚ずつ SVG を焼くと、それだけで重くなる） */}
          <button type="button" className="gb-dlg-x" data-gb-close="" aria-label="閉じる" />
        </div>
        {hero && <div className="gb-dlg-hero">{hero}</div>}
        <h3 id={`${id}-t`} className="gb-dlg-t">
          {title}
        </h3>
        <div className="gb-dlg-body">{children}</div>
        <div className="gb-dlg-foot">
          {foot}
          <button type="button" className="gb-dlg-done" data-gb-close="">
            閉じる
          </button>
        </div>
      </div>
    </dialog>
  );
}
