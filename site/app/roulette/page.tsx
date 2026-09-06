import { Suspense } from "react";
import type { Metadata } from "next";
import Display from "@/components/roulette/Display";
import "./roulette.css";

export const metadata: Metadata = {
  title: "ルーレット",
  description: "配信で回すルーレット。",
  /* 配信の画面。人が読みに来る面ではないので、索引に載せない
     （`app/sitemap.ts` にも入れていない）。 */
  robots: { index: false, follow: false },
};

/**
 * ルーレットの表示側（#164）。**スマホ版 OBS が、これを1枚開く。**
 *
 * ## ここは島ではない
 *
 * 島の紙でも板でもなく、配信の画面にそのまま映るもの。だから看板も
 * 砂浜も付けず、面ぜんぶを覆う（`docs/island-world.md` 2章の表）。
 * 見た目は、いま配信で使っているルーレットを写してある。**島に
 * 寄せない。** 寄せた日から、配信の絵が変わってしまう。
 *
 * ## 開きかたは2通り
 *
 * - `?s=<セッション>` … コントローラー（`/me/roulette`）から回る
 * - `?candidates=…` … **いままでどおり**、URL だけで回る
 *
 * `useSearchParams` は書き出した面では画面が出てから読むので、
 * Suspense で包む（包まないと書き出しで落ちる）。
 */
export default function RoulettePage() {
  return (
    <main className="rl-page">
      <h1 className="rl-h1">ルーレット</h1>
      <div className="rl-path rl-path-a" aria-hidden />
      <div className="rl-path rl-path-b" aria-hidden />
      <div className="rl-glow" aria-hidden />
      <Suspense fallback={null}>
        <Display />
      </Suspense>
    </main>
  );
}
