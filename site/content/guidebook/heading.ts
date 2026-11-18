import type { Guidebook } from "./types";

/**
 * 街のガイドの面の見出しの字（h1・`<title>`・表紙に焼く題で同じ字を使う）。
 *
 * あやと（2026-11-18、#1228）:「この面は『やりたいこと8選』の面ではない」。前の題と h1 は「ソフィア観光でやりたいこと8選」で、
 * 中身（見どころマップ・やりたいこと・見たい・食べたい・買いたい・基本情報）より狭い1節の名前だった。
 * いまは**「〈街〉観光ガイド」が頭**（主な検索の意図「〈街〉 観光」を頭に残したまま、ガイドの面だと分かる形）で、
 * 後ろに面が答える語を並べる。題は `〈街〉観光ガイド【年】${GUIDE_TOPICS}｜〈国〉`。
 * 「やりたいこと◯選」は節の見出し（`Todo.tsx`）にだけ残す
 */
export const GUIDE_LABEL = "観光ガイド";
export const GUIDE_TOPICS = "見どころマップ・やりたいこと・グルメ";

/**
 * 街の面へのリンクの字（国の面の「行った街」のカード）。h1 と同じ「観光ガイド」と、地図の節が在れば「見どころマップ」。
 * 島の足もとのリンク（`components/ui/PageShell.tsx`）と同じ形。前のカードは「やりたいこと8選と見どころマップ」で、
 * 面の題を直した日に古い字が残った（#1228）
 */
export function guideCardLabel(g: Pick<Guidebook, "about" | "see">): string {
  return g.about.areas.length || g.see.map ? `${GUIDE_LABEL}・見どころマップ` : GUIDE_LABEL;
}
