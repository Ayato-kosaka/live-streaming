import type { Metadata } from "next";
import PageShell, { PageHead } from "@/components/ui/PageShell";
import MyPage from "@/components/me/MyPage";
import { PLAN_BY_DAY } from "@/content/planDays";
import "./me.css";

export const metadata: Metadata = {
  title: "じぶんのこと",
  description: "貼った付箋、出した企画、島にいるじぶん。ログインした人のところ。",
  /* 検索から来ても、他人の画面には何も出ない面。索引に載せない
     （`app/sitemap.ts` にも入れていない）。 */
  robots: { index: false, follow: false },
};

/**
 * じぶんのこと（#163）。
 *
 * **入口は看板の自分のアイコン**（`components/ui/MeButton.tsx`）。
 * ログインしていない人には出さないが、URL を直に叩いて来る人はいるので、
 * この面はログインしていなくても開ける。開けたら入る道を出す。
 *
 * 中身はぜんぶ画面が出てから読む。焼き込めるものが1つも無い
 * （どれも「その人の」もの）ので、器と見出しだけが静的に出る。
 */
export default function MePage() {
  return (
    <PageShell crumbs={[{ label: "じぶんのこと" }]}>
      <PageHead
        icon="hut-home"
        title="じぶんのこと"
        /* 1行に収める。**旅の道具はこの下に来る。** 2文書くと 390×844 の
           1画面から送りのボタンが押し出される（撮って決めた）。 */
        lead="貼った付箋、出した企画、島にいるじぶん。"
      />
      {/* 企画の表は面（server）で引いて値だけ渡す。カードに出る「その日の
          企画」はこれで引く。client から `content/plans.ts`（20KB）を
          読ませないため。 */}
      <MyPage planDays={PLAN_BY_DAY} />
    </PageShell>
  );
}
