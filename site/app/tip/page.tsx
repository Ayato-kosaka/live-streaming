import { Suspense } from "react";
import type { Metadata } from "next";
import { share } from "@/lib/share";
import PageShell, { PageHead } from "@/components/ui/PageShell";
import TipDesk from "@/components/tip/TipDesk";
import { TipWaiting } from "@/components/tip/TipPanels";
import "./tip.css";

export const metadata: Metadata = share({
  key: "home",
  title: "あやとに投げ銭",
  description: "メッセージを、あやとの配信のアラートに出す。",
  /* 道具（建物の外）。索引に載せない（R-25。`lib/pages.ts` でも `listed: false`）。
     **公開するまで、島のどこからも繋がない**（#1405 の段1） */
  robots: { index: false, follow: false },
  path: "/tip",
});

/**
 * 島の投げ銭（決定の記録 0017・#1405）。**YouTube のチャンネルを結んだ人が、メッセージつきで投げる。**
 *
 * 中身はぜんぶ画面が出てから決まる（入っているか・チャンネル・額の幅）ので、
 * 静的に出るのは器と見出しと、入力の紙と同じ背の板だけ。
 *
 * `?done=1` は払い終わって戻ってきた印。`useSearchParams` は書き出した面では画面が出てから読むので、
 * Suspense で包む（包まないと書き出しで落ちる。`app/roulette/page.tsx` と同じ）。
 */
export default function TipPage() {
  return (
    <PageShell crumbs={[{ label: "あやとに投げ銭" }]}>
      <PageHead icon="mailbox" title="あやとに投げ銭" lead="メッセージが、配信のアラートに出る。" />
      <Suspense fallback={<TipWaiting />}>
        <TipDesk />
      </Suspense>
    </PageShell>
  );
}
