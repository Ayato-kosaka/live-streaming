import type { Metadata } from "next";
import PageShell, { PageHead } from "@/components/ui/PageShell";
import RouletteBox from "@/components/me/RouletteBox";
import "../me.css";
import "./control.css";

export const metadata: Metadata = {
  title: "ルーレット",
  description: "配信のルーレットを、コメントから選んで回すところ。",
  /* あやとしか開けない面。索引に載せない（`app/sitemap.ts` にも入れていない）。 */
  robots: { index: false, follow: false },
};

/**
 * ルーレットのコントローラー（#164）。**あやとだけ。**
 *
 * 配信に使っていない方の端末で開く。ここで押したものが、スマホ版 OBS の
 * `/roulette?s=…` に並んで、「回す」で回る。
 *
 * **面は紙、押すものと書くものだけが板**（`docs/island-world.md` 2.1）。
 * 中身はぜんぶ画面が出てから読むので、器と見出しだけが静的に出る。
 */
export default function RoulettePage() {
  return (
    <PageShell
      /* 入口はあやとの机の1本だけ（#242）。戻り道もそこへ返す。
         `/me` に返すと、来た道と違うところへ置き去りになる。 */
      crumbs={[
        { label: "じぶんのこと", href: "/me" },
        { label: "島の手入れ", href: "/me/desk" },
        { label: "ルーレット" },
      ]}
    >
      <PageHead
        icon="tower-studio"
        title="ルーレット"
        lead="流れてきたコメントから選んで、回す。"
      />
      <RouletteBox />
    </PageShell>
  );
}
