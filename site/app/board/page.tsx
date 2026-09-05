import type { Metadata } from "next";
import PageShell, { PageHead } from "@/components/ui/PageShell";
import { GUIDE } from "@/content/voice";
import Board from "@/components/live/Board";
import type { NotePlace } from "@/components/live/NoteBoards";
import { PLANS } from "@/content/plans";
import { NORDIC_COUNTRIES } from "@/content/nordic";

export const metadata: Metadata = {
  title: "企画をだす",
  description: "こういうことやってほしい、を出せる掲示板。ログイン不要。票が集まった企画は企画会議に上がります。",
};

/**
 * 付箋の棚割り。**順番はここで決まる。**
 *
 * 企画は日付の早い順、国は旅で通る順。**枚数では動かさない**
 * （`docs/island-play.md` の「順位表を作らない」）。
 * 中身が増えても棚の並びが変わらないので、
 * 「いつもの3つ目」で覚えたところに、次も同じものがある。
 *
 * ここ（サーバー側）で組んでから渡すのは、`content/nordic.ts` が
 * 44KB の JSON を抱えているから。棚に要るのは名前と行き先だけなので、
 * ブラウザまで運ぶのはそのぶんで足りる。
 */
const NOTE_PLACES: NotePlace[] = [
  ...[...PLANS]
    .sort((a, b) => (a.date ?? "9999").localeCompare(b.date ?? "9999"))
    .map((p) => ({
      key: p.id,
      name: p.title,
      group: "これからの企画",
      // 企画の付箋は `/next` のその企画の中にある。畳んであっても id で開く
      href: `/next#${p.id}-notes`,
      by: "plan" as const,
    })),
  {
    key: "北欧旅",
    name: "北欧旅ぜんぶ",
    group: "北欧の旅",
    href: "/nordic#say",
    by: "tag" as const,
  },
  ...NORDIC_COUNTRIES.map((c) => ({
    key: c.name,
    name: c.name,
    group: "北欧の旅",
    href: `/nordic/${c.slug}`,
    by: "tag" as const,
  })),
];

export default function BoardPage() {
  return (
    <PageShell current="board" crumbs={[{ label: "企画をだす" }]}>
      <PageHead
        icon="signboard"
        title="企画をだす"
        lead="「こういうことやってほしい」を貼る板。むちゃな企画ほど、だいたい通る。"
        say={GUIDE.board}
      />
      <Board places={NOTE_PLACES} />
    </PageShell>
  );
}
