import type { Metadata } from "next";
import PageShell, { PageHead } from "@/components/ui/PageShell";
import NextPlanEditor from "@/components/live/NextPlanEditor";
// 下見に出る企画の札は「これから」の面と同じ部品。見た目も同じ1枚から取る
import "../next.css";

export const metadata: Metadata = {
  title: "企画のページを作る",
  description: "出した企画を、ページ1枚まで育てられます。題・日付・場所・本文・リンク・写真。ログイン不要。",
};

/**
 * 企画のページを書くところ。
 *
 * **掲示板で出した企画の、続きを書く場所でもある**（#161）。
 * `?id=…` を付けて来ると、その企画を持ってきて続きから書ける。
 * 前はここが「あやとが声をかけた人だけ・ログイン必須」の下書き置き場で、
 * 掲示板の一言とは別の入れ物だった。入れ物が1つになったので、
 * 一言から下書きへ、道が1本につながっている。
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
        lead="題ひとつでもいい。日にちも場所も写真も、あとから足せる。書いた形は、そのまま下に出る。"
      />
      <NextPlanEditor />
    </PageShell>
  );
}
