"use client";

import Link from "next/link";
import { cardIcon, cardPlace, cardWhen, type PlanBrief, type ShownCard } from "./cards";

/**
 * あやと島カード1枚（#173）。
 *
 * その日の写真の上に、その日そこにいた人が1人立っている。
 * 順位でも点数でもなく、**いたという事実だけ**が絵になっている
 * （`docs/nordic-photos.md` 2章と同じ考え）。
 *
 * ## 立ち位置は焼かない。その場で重ねる
 *
 * 焼いた1枚を置き場に貯めない理由は #173 のコメントの3つ
 * （同じ写真に何人も乗る／あとから動かせる／軽い）。
 *
 * ## どこに、どれだけの大きさで立つか
 *
 * 決めるのは `cardPlace`（`./cards.ts`）。**既定は写真の右下ひとところ、
 * 大きさも1つ。** 台帳が持っている `x/y/rot/scale` をそのまま使うと、
 * 散らした先が右端を越えて絵が切れ、`scale` のばらつきが1人ずつ違う
 * 大きさになる（あやと・2026-09-10「キャラクターが見切れてる。
 * あと大きさも不揃い」）。本人が動かしたものだけ、その値で置く。
 *
 * 寸法は `docs/nordic-photos.md` 5章の表そのまま。**縦の写真は横幅の34%、
 * 横の写真は高さの20%。** 焼く1枚（`components/nordic/stamp.ts`）も
 * 同じ寸法・同じ右下なので、**画面で見えている絵と持って帰る絵が同じ**になる。
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
  plans,
  showName = true,
  showWhen = true,
}: {
  card: ShownCard;
  /** その日の企画。**1日に何本でも立つ。** 無い日は何も出さない */
  plans?: PlanBrief[];
  /**
   * 名前を出すか。**誰のカードかがもう分かっている並びでは出さない。**
   * 図鑑（`/friends`）とじぶんのこと（`/me`）は、その人のカードしか
   * 並んでいないので、1枚ずつに同じ名前が付くと字が増えるだけ。
   */
  showName?: boolean;
  /**
   * 日付とその日の企画を出すか。**まとめた並びの中では出さない。**
   * 写真でまとめた一覧（`CardWall`）は、日付も企画も棚の見出しが1回だけ
   * 言う。同じ写真から出たカードは日付も企画も同じなので、1枚ずつに
   * 付けると人数ぶん同じ字が並ぶ（あやとの「一覧画面が散らかる」）。
   */
  showWhen?: boolean;
}) {
  const at = cardPlace(card);
  // 帯に出すものが1つも無ければ、帯ごと出さない。字の無い罫だけが残るため
  const foot = showWhen || (showName && card.name);
  return (
    <article className="akd">
      <div
        className="akd-shot"
        style={{ aspectRatio: card.w && card.h ? `${card.w} / ${card.h}` : "3 / 4" }}
      >
        {/* **crossOrigin を付ける。** ここと `CardSheet` の canvas は同じ
            URL を読む。片方を素で先に読むと、CORS のヘッダを持たない絵が
            キャッシュに残る端末があり、あとから焼こうとすると汚れて落ちる。 */}
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
          style={at}
        />
      </div>
      {foot && (
        <div className="akd-foot">
          {showWhen && <b>{cardWhen(card.day)}</b>}
          {/* その日の企画（あやとの「フードワインフェスの企画に紐つけて欲しい」）。

              **1日に企画は何本でも立つ。** 9月11日がそれで、「北欧旅の
              出発日」「海外出発二周年」「ジョージアバイバイ」の3本が同じ
              配信に乗っている。1本しか出さないと、残りは黙って消える。 */}
          {showWhen &&
            plans?.map((p) => (
              <Link key={p.href} className="akd-plan" href={p.href} prefetch={false}>
                {p.title}
              </Link>
            ))}
          {/* 名前が出るのは、島に名前を出してよいと言った人だけ。
              出していない人も絵は出る。自分の絵は自分で分かる。 */}
          {showName && card.name && <i className="akd-who">{card.name}</i>}
        </div>
      )}
    </article>
  );
}
