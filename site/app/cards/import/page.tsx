import type { Metadata } from "next";
import { share } from "@/lib/share";
import PageShell, { PageHead } from "@/components/ui/PageShell";
import ImportDesk from "@/components/cards/ImportDesk";
import "./import.css";

export const metadata: Metadata = share({
  key: "cards",
  title: "写真をまとめて登録",
  description: "旅の写真をまとめて、あやと島カードに登録する。",
  /* あやとしか開けない面。索引に載せない（`app/sitemap.ts` にも入れない） */
  robots: { index: false, follow: false },
  path: "/cards/import",
});

/**
 * 写真の取り込み（`docs/card-import.md`）。**あやとだけ。**
 *
 * 中身はぜんぶ画面が出てから読む（口はあやとの ID トークンを見る）ので、
 * 静的に出るのは器と見出しだけ。あやと以外には、見出しの下に何も出ない。
 *
 * パンくずは `/cards` の子。登録した写真は手で貼った写真とまったく同じ扱いで、
 * `/cards` の貼る道具の、まとめて版だから。
 */
export default function CardImportPage() {
  return (
    <PageShell crumbs={[{ label: "あやと島カード", href: "/cards" }, { label: "写真をまとめて登録" }]}>
      <PageHead icon="tent-small" title="写真をまとめて登録" />
      <ImportDesk />
    </PageShell>
  );
}
