import Link from "next/link";

import Icon from "@/components/ui/Icon";
import { LINKS, PROFILE } from "@/content/site";
import { AYATO_SRC } from "@/lib/ayatoArt";

import { jpDate } from "./scene";
import "./writer.css";

/**
 * 書き手の枠。**文を書いているのは案内鳥、体験はあやと**（guide-design 9章の1）。
 *
 * 記事（物価など）と街のガイドで同じ枠を使う。検索の上位の面の 71% が書き手を見せていて、街のガイドには無かった
 * （`docs/seo.md` 7章・#1262）。署名は「あやと島案内鳥」（視聴者さんに見せる所で別の名を名乗らない。`CLAUDE.md`）。
 * 構造化データの書き手は変えない（島が author・あやとが founder。`lib/jsonld.tsx` の `articleLd`。#1287）
 *
 * - `by`: 誰が・何からまとめたかの1行。既定は記事の「あやとの配信から」。行く前に調べて書いたガイドは出どころから
 * - `went`: 行った街なら、街の名前と行った最初の日（配信の facts から焼いた「行った」の日のうち、いちばん早い日）
 */
export default function Writer({
  by = "あやとの配信から、あやと島案内鳥がまとめています。",
  went,
}: {
  by?: string;
  went?: { city: string; from: string };
}) {
  const yt = LINKS.find((l) => l.id === "youtube");
  return (
    <aside className="ta-writer" aria-label="書き手">
      <img className="ta-writer-face" src={AYATO_SRC} alt={`${PROFILE.name}（あやと島の絵）`} width={66} height={96} loading="lazy" />
      <div className="ta-writer-b">
        <p className="ta-writer-name">
          <b>{PROFILE.name}</b>
        </p>
        <p className="ta-writer-sign">毎晩22時、世界のどこかから生配信</p>
        <p className="ta-writer-sub">旅して、食べて、グルメアプリを作る、夜の居場所</p>
        {went && (
          <p className="ta-writer-went">
            {went.city}は、あやとが<time dateTime={went.from}>{jpDate(went.from)}</time>〜に行った街
          </p>
        )}
        <p className="ta-writer-by">{by}</p>
        <div className="ta-writer-go">
          {yt && (
            <a className="ta-go" href={yt.href} target="_blank" rel="noopener noreferrer">
              <Icon name="youtube" size={20} />
              YouTube チャンネル
            </a>
          )}
          <Link className="ta-go" href="/about" prefetch={false}>
            <Icon name="island" size={20} />
            あやとのこと
          </Link>
          <Link className="ta-go" href="/" prefetch={false}>
            <Icon name="home" size={20} />
            あやと島へ
          </Link>
        </div>
      </div>
    </aside>
  );
}
