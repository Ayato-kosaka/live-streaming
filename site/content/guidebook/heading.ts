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

/**
 * 面のいちばん下の書き手の枠（`components/travel/article/Writer.tsx`）の字。署名は「あやと島案内鳥」。
 * 行く前の街は出どころを確かめてまとめた面、行ったあとの街はそこに配信の「行った」を乗せた面（`docs/guide-design.md` ★1）
 */
export const GUIDE_BY = {
  before: "あやと島案内鳥が、出どころを確かめてまとめています。",
  after: "あやとの配信と、確かめた出どころから、あやと島案内鳥がまとめています。",
};

/**
 * 行った最初の日（配信の facts から焼いた「行った」の日のうち、いちばん早い日）。行っていない街は `undefined`。
 * 表紙の「あやとが◯日いた」（`stay`）は国に入った日から数えるので、こちらは facts の日で別に数える
 */
export function firstWent(g: Pick<Guidebook, "todo" | "see" | "eat" | "buy">): string | undefined {
  const days = [...g.todo, ...g.see.items, ...g.eat.items, ...g.buy.items].flatMap((it) => (it.went?.date ? [it.went.date] : []));
  return days.sort()[0];
}
