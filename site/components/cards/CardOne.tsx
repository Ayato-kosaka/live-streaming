"use client";

import Link from "next/link";
import { cardIcon, cardWhen, type PlanBrief, type ShownCard } from "./cards";

/**
 * あやと島カード1枚（#173）。
 *
 * その日の写真の上に、その日そこにいた人が1人立っている。
 * 順位でも点数でもなく、**いたという事実だけ**が絵になっている
 * （`docs/nordic-photos.md` 2章と同じ考え）。
 *
 * ## 立ち位置は焼かない。割合で持つ
 *
 * 置き方（x/y/rot/scale）は数として来る。写真の大きさが変わってもずれない
 * ように 0〜1 の割合で、`y` は**足元**の高さ。CSS の `left` / `bottom` に
 * そのまま入れて、絵は毎回その場で重ねる。焼いた1枚を置き場に貯めない理由は
 * #173 のコメントの3つ（同じ写真に何人も乗る／あとから動かせる／軽い）。
 *
 * ## 大きさの決め方
 *
 * `docs/nordic-photos.md` 5章の表そのまま。**縦の写真は横幅の34%、
 * 横の写真は高さの20%。** 基準にする辺が写真の向きで変わるので、
 * どちらの辺を書くかも切り替える（もう片方は絵の縦横比に任せる）。
 *
 * ## 押せない
 *
 * カードは見るもので、行き先ではない。**厚みを付けない**
 * （`docs/island-design.md` 3章。厚みは「押せる」の合図なので、
 * 押せないものに付けると合図が2つになる）。中で押せるのは、
 * その日の企画への字の行き先だけ。
 */
export default function CardOne({
  card,
  plan,
  showName = true,
}: {
  card: ShownCard;
  /** その日の企画。無い日は何も出さない */
  plan?: PlanBrief;
  /**
   * 名前を出すか。**誰のカードかがもう分かっている並びでは出さない。**
   * 図鑑（`/friends`）とじぶんのこと（`/me`）は、その人のカードしか
   * 並んでいないので、1枚ずつに同じ名前が付くと字が増えるだけ。
   */
  showName?: boolean;
}) {
  const tall = card.h > card.w;
  return (
    <article className="akd">
      <div
        className="akd-shot"
        style={{ aspectRatio: card.w && card.h ? `${card.w} / ${card.h}` : "3 / 4" }}
      >
        {/* **crossOrigin を付ける。** ここと `PhotoStudio` の canvas は同じ
            URL を読む。片方を素で先に読むと、CORS のヘッダを持たない絵が
            キャッシュに残る端末があり、あとから焼こうとすると汚れて落ちる
            （`components/nordic/PhotoWall.tsx` に同じ用心がある）。 */}
        <img
          className="akd-photo"
          src={card.url}
          alt={card.note || "旅のその日の写真"}
          loading="lazy"
          crossOrigin="anonymous"
        />
        <img
          className="akd-chr"
          src={cardIcon(card.icon, 256)}
          alt=""
          loading="lazy"
          crossOrigin="anonymous"
          style={{
            left: `${card.x * 100}%`,
            bottom: `${(1 - card.y) * 100}%`,
            // 縦の写真は横幅、横の写真は高さ（nordic-photos.md 5章）
            width: tall ? `${34 * card.scale}%` : "auto",
            height: tall ? "auto" : `${20 * card.scale}%`,
            transform: `translateX(-50%) rotate(${card.rot}deg)`,
          }}
        />
      </div>
      <div className="akd-foot">
        <b>{cardWhen(card.day)}</b>
        {/* その日の企画（あやとの「フードワインフェスの企画に紐つけて欲しい」）。
            **紐は日付1本。** カードにも写真にも企画の欄は無い。 */}
        {plan && (
          <Link className="akd-plan" href={plan.href} prefetch={false}>
            {plan.title}
          </Link>
        )}
        {/* 名前が出るのは、島に名前を出してよいと言った人だけ。
            出していない人も絵は出る。自分の絵は自分で分かる。 */}
        {showName && card.name && <i className="akd-who">{card.name}</i>}
      </div>
    </article>
  );
}
