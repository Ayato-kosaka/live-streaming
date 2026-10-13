"use client";

import Link from "next/link";
import Longer from "@/components/ui/Longer";
import { cardWhen, type DayShelf, type PhotoGroup, type PlanBrief } from "./cards";

/**
 * 1日ぶんの紙。**日付・その日の企画・写真のマス。**
 *
 * **並び（`CardWall`）とカレンダー（`CardMonth`）の両方が、ここを使う。**
 * 2つの見かたで紙の形が違うと、切り替えたときに別の面に見える。
 * 写真を押したあとに開く紙（`CardSheet`）も同じものなので、
 * **見かたを足しても、押したあとの道は1本のまま。**
 */
export default function DayPanel({
  day,
  plans,
  onOpen,
}: {
  day: DayShelf;
  /** その日の企画。**1日に何本でも立つ**ので配列 */
  plans?: PlanBrief[];
  onOpen: (g: PhotoGroup) => void;
}) {
  return (
    <section className="panel paper akd-day">
      <h2>{cardWhen(day.day)}</h2>
      {/* その日の企画（あやとの「フードワインフェスの企画に紐つけて欲しい」）。
          **1日に企画は何本でも立つ。** 9月11日はそれが4本ある。
          1本に絞ると、残りは黙って消える。 */}
      {plans && plans.length > 0 && (
        <div className="akd-day-plans">
          {plans.map((p) => (
            <Link key={p.href} className="akd-day-plan" href={p.href} prefetch={false}>
              {p.title}
            </Link>
          ))}
        </div>
      )}
      {/* その日の写真も畳む。**日を畳むだけでは足りない**
          （`docs/island-standards.md` 7「増えるものを縦に積まない」）。
          1つの企画にカード画像は何枚でも貼れるので（`PHOTOS_PER_DAY`
          は1日120枚）、日の側だけ畳んでも**1枚の紙が伸びきる。**
          390px では2列なので、30枚貼ると紙1枚が 2,676px（スマホ3画面）
          になり、次の日へ行くまでに送りつづけることになる。

          はじめの6枚は「1件の背」で決めてある。390px で2列 × 3段、
          1200px で6列 × 1段。**本番でいちばん多い日（5枚）は畳まれない**
          ので、いまの見た目は変わらない。 */}
      <Longer items={day.photos} first={6} step={12} unit="枚" as="div" className="akd-shelf">
        {(g) => (
          <button
            key={g.photoId}
            type="button"
            className="akd-tile"
            onClick={() => onOpen(g)}
            aria-label={g.note || "その日の写真をひらく"}
          >
            {/* **crossOrigin を付ける。** 開いた先の canvas が同じ URL を
                読む。片方を素で先に読むと、CORS のヘッダを持たない絵が
                キャッシュに残る端末があり、あとから焼こうとすると
                汚れて落ちる。 */}
            {/* **`width`/`height` の欄を書かない。** 書くと `height` が
                そのまま効いて（HTML の欄は CSS の height になる）、
                `aspect-ratio: 1` が無視される。1600 の写真がマスの中で
                1,639px の背になっていた。形はマスの側が決める */}
            <img src={g.url} alt="" loading="lazy" crossOrigin="anonymous" />
          </button>
        )}
      </Longer>
    </section>
  );
}
