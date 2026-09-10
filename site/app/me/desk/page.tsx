import type { Metadata } from "next";
import PageShell, { PageHead } from "@/components/ui/PageShell";
import Desk from "@/components/me/Desk";
import "../me.css";

export const metadata: Metadata = {
  title: "島の手入れ",
  description: "島を手入れする道具を、1つずつ出す机。",
  /* あやとしか開けない面。索引に載せない（`app/sitemap.ts` にも入れていない）。 */
  robots: { index: false, follow: false },
};

/**
 * 島の手入れ（机）。**あやとだけ。**
 *
 * 旅の道具・付箋への返事・企画の段・投げ銭の紐付け・アラートボックスを
 * ここへ集めた。前は全部が `/me` に縦に積んであって、あやとの画面は
 * 390px 幅で 8,336px あった（`components/me/Desk.tsx` に経緯）。
 *
 * `/me/roulette`・`/me/remote` と同じ並びの面。**面は紙、押すものと
 * 書くものだけが板**（`docs/island-world.md` 2.1）。中身はぜんぶ画面が
 * 出てから読むので、器と見出しだけが静的に出る。
 */
export default function DeskPage() {
  return (
    <PageShell crumbs={[{ label: "じぶんのこと", href: "/me" }, { label: "島の手入れ" }]}>
      <PageHead icon="hut-home" title="島の手入れ" lead="道具を1つ出して、使う。" />
      <Desk />
    </PageShell>
  );
}
