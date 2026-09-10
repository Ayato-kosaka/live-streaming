import type { Metadata } from "next";
import PageShell, { PageHead } from "@/components/ui/PageShell";
import RemoteBox from "@/components/me/RemoteBox";
import "../me.css";
import "./remote.css";

export const metadata: Metadata = {
  title: "島の遠隔操作",
  description: "配信に映している島を、手元から動かすところ。",
  /* あやとしか開けない面。索引に載せない（`app/sitemap.ts` にも入れていない）。 */
  robots: { index: false, follow: false },
};

/**
 * 島の遠隔操作のコントローラー（#165）。**あやとだけ。**
 *
 * 配信に使っていない方の端末で開く。ここで押したものが、スマホ版 OBS で
 * `?remote=…` を付けて開いてある島に届く。ルーレット（`/me/roulette`）と
 * 同じ端末・同じ手ざわりにそろえてある。
 *
 * **面は紙、押すものと書くものだけが板**（`docs/island-world.md` 2.1）。
 * 中身はぜんぶ画面が出てから読むので、器と見出しだけが静的に出る。
 */
export default function RemotePage() {
  return (
    <PageShell
      /* 入口はあやとの机の1本だけ（#242）。戻り道もそこへ返す。
         `/me` に返すと、来た道と違うところへ置き去りになる。 */
      crumbs={[
        { label: "じぶんのこと", href: "/me" },
        { label: "島の手入れ", href: "/me/desk" },
        { label: "島の遠隔操作" },
      ]}
    >
      <PageHead
        icon="signpost"
        title="島の遠隔操作"
        lead="配信に映している島を、手元から動かす。"
      />
      <RemoteBox />
    </PageShell>
  );
}
