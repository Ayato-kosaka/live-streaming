"use client";

import Link from "next/link";
import Icon from "@/components/ui/IconCore";
import { byPhoto, useCards } from "./cards";

/**
 * 最近のあやと島カードを数枚（#173）。**`/about` の「住んでる人」の下。**
 *
 * あやとの言葉:「導線は /about の住んでる人の下で一覧見れると良いかも」。
 * ここは島の紹介の面なので、**カード置き場にしない。** 出すのは最近の
 * 写真数枚と、`/cards` への行き先1つだけ。
 *
 * ## 代表の1人を埋めない（2026-09-10）
 *
 * 前はここに、キャラクターを1人焼き込んだ絵を出していた。本番の写真1枚には
 * いま4人ぶんあるので、**そのうちの1人だけが写真の代表のように見える。**
 * あやとの言葉:「代表でキャラクターを埋めるのはやめて欲しい」。
 * 出すのは素の写真で、誰を入れるかは開いた先（`/cards`）で選ぶ。
 *
 * まだ1枚も無いあいだ（旅の前・名簿が入る前）は、絵の代わりに1行だけ置く。
 * 行き先の札は消さない。**「まだ何も無い」で終わらせない**という決まりの、
 * いちばん軽い形（`docs/island-design.md` 4章）。
 */
export default function CardStrip({
  max = 2,
}: {
  /** ここに出す枚数。**この面の主役ではない。**
     3枚にすると 390px で2段になり、あやとの紹介の途中に
     カード置き場が挟まる。1段で終わる枚数にする */
  max?: number;
}) {
  const { cards } = useCards();
  /* **写真でまとめてから出す。** 素の並びの先頭を2枚取ると、同じ写真が
     2つ出る（本番の 9/6 の夜景が、いま4人ぶんある）。 */
  const some = byPhoto(cards ?? []).slice(0, max);

  return (
    <div className="akd-strip">
      <p className="akd-strip-h">
        <b>あやと島カード</b>
        その日の写真に、キャラクターを1人だけ入れて持って帰れます。
      </p>

      {cards === null && (
        <div className="wait is-card" aria-hidden>
          <span />
          <span />
        </div>
      )}

      {/* 読めなかったときも、まだ1枚も無いときも、同じこの1行でよい。
          この面に来た人には、どちらの話も関係が無い */}
      {cards !== null && cards.length === 0 && (
        <p className="muted akd-note">
          まだ1枚もありません。旅のその日の写真が貼られると、ここに並びます。
        </p>
      )}

      {cards !== null && some.length > 0 && (
        <div className="akd-shelf akd-strip-shelf">
          {some.map((g) => (
            /* 押せるのは1か所だけにする。マスそれぞれを行き先にすると、
               すぐ下の札と合わせて同じところへ行く口が3つ並ぶ */
            <span className="akd-tile is-flat" key={g.photoId}>
              <img src={g.url} alt="" loading="lazy" />
            </span>
          ))}
        </div>
      )}

      <Link className="tile" href="/cards">
        <span className="tile-mark">
          <Icon name="island" size={24} />
        </span>
        <span className="tile-text">
          <b>あやと島カード</b>
          <i>その日の写真ぜんぶ</i>
        </span>
        <Icon name="right" size={16} className="tile-go" />
      </Link>
    </div>
  );
}
