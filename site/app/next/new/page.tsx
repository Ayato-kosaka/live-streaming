import type { Metadata } from "next";
import Link from "next/link";
import PageShell from "@/components/ui/PageShell";
import GoTo from "@/components/ui/GoTo";
import Icon from "@/components/ui/Icon";

export const metadata: Metadata = {
  title: "企画のページを作る",
  description: "やってほしいことは、掲示板の付箋から。",
  alternates: { canonical: "/board" },
  robots: { index: false, follow: true },
};

/**
 * 企画のページを書くところ。**畳んだ（2026-10-01）。送るだけ。**
 *
 * あやとの言葉:
 *
 * > 企画と付箋がわかりにくいので 企画は消しましょう。付箋だけ集めて、
 * > 「スニーカー探したい」があれば、私があなたにお願いして企画を作る導線に
 * > するので企画提案機能はいらなくない？ どうせ企画提案してもあなたに
 * > お願いしないと行けないよね？
 *
 * 段を「これから」に上げても、企画のページは `site/content/plans.ts`（Git）に
 * しか立たない。**提案の口があっても、あやとがこちらに言う工程は消えない。**
 *
 * ## 面ごと消さない理由
 *
 * `output: "export"` なので、面を消すと `dist` からファイルが消える。
 * Firebase の受け皿（`firebase.json` の `"source": "**"`）は、見つからない
 * URL に**島の玄関を 200 で返す。** 404 にすらならないので、貼られていた
 * URL を踏んだ人は、なぜ違う面が出たのか分からない。
 * `?id=…` 付きのリンクを持っている人と、`/me` の「続きを書く」がここへ来る。
 *
 * **`redirect()` は使えない。** 静的な書き出しでは `NEXT_REDIRECT` を
 * 抱えた `__next_error__` の殻が焼かれるだけで、h1 も中身も無い白い面になる
 * （実際に焼いて確かめた）。島に先例のある形（`app/nordic/photos`）に合わせて、
 * **中身のある1枚＋`GoTo`** にする。本筋は Hosting の 301。
 */
export default function NewPlanPage() {
  return (
    <PageShell
      current="board"
      crumbs={[{ label: "やってほしいこと", href: "/board" }, { label: "企画のページを作る" }]}
    >
      <GoTo to="/board" />
      <section className="panel paper">
        <h1>企画のページを作る</h1>
        <p className="muted">やってほしいことは、掲示板の付箋から。</p>
        <Link prefetch={false} className="tile" href="/board">
          <img className="tile-icon" src="/sprites/signboard.webp" alt="" />
          <span className="tile-text">
            <b>やってほしいこと</b>
            <i>ひとことでいい。名前もログインも要らない</i>
          </span>
          <Icon name="right" size={16} className="tile-go" />
        </Link>
      </section>
    </PageShell>
  );
}
