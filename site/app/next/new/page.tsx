import type { Metadata } from "next";
import PageShell, { PageHead } from "@/components/ui/PageShell";
import PlanDraftEditor from "@/components/live/PlanDraftEditor";

export const metadata: Metadata = {
  title: "企画のページを作る",
  description: "これからの企画のページを、視聴者さんも作れます。骨組みを書けば、あやとが仕上げます。",
  robots: { index: false },
};

/**
 * 企画ページの下書きを書くところ。
 *
 * 「これからの企画のページは毎回きれいに作りたい」というのが元の要望で、
 * それを、あやと1人の作業にしないための入口。
 * 認可された視聴者さんが骨組みを書き、あやとが Claude Code で仕上げる。
 */
export default function NewPlanPage() {
  return (
    <PageShell
      current="next"
      crumbs={[{ label: "これから", href: "/next" }, { label: "企画のページを作る" }]}
    >
      <PageHead
        icon="signboard"
        title="企画のページを作る"
        lead="骨組みだけ書いてくれれば、あとはあやとが仕上げる。書いた形は、そのまま下に出る。"
      />
      <PlanDraftEditor />
    </PageShell>
  );
}
