"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { RESIDENTS } from "@/content/residents";
import { useResidentShow } from "@/lib/liveStats";
import { createVillagers } from "@/components/island/villagers";
import { placeById } from "@/components/island/layout";
import Icon from "@/components/ui/Icon";
import { Pedestal } from "./art";

/** キャラクター画像は Google ドライブに置いてある。s の後ろが取り出す大きさ。 */
const drive = (id: string, size: number) => `https://lh3.googleusercontent.com/d/${id}=s${size}`;

/**
 * 今日、島に出ている人。
 *
 * 顔ぶれは日替わりで、よく来てくれている人ほど島にいる日が多い
 * （`components/island/villagers.ts`）。**その選び方をここで写さない。**
 * 島と図鑑で別々に抽選すると、図鑑に「今日いる」と書いてある人が島にいない。
 * 島を作っているのと同じ関数を呼んで、同じ答えをもらう。
 *
 * 静的書き出しなので、今日が何日かはビルド時には決められない。
 * 画面が出てから数える（出るまでは誰にも印が付かない）。
 */
function useOnIslandToday(): Map<string, string> {
  const [m, setM] = useState<Map<string, string>>(() => new Map());
  useEffect(() => {
    const out = new Map<string, string>();
    for (const v of createVillagers(RESIDENTS)) {
      if (v.icon) out.set(v.icon, placeById(v.post).label);
    }
    setM(out);
  }, []);
  return m;
}

/**
 * 島を歩いている仲間の図鑑。
 *
 * 「投げ銭で作ったキャラクターが並ぶ面」なので、一人ひとりが主役に見えないと意味がない。
 * 丸く小さく切り抜いて敷き詰めると、誰の絵も見えなくなる。
 * だから figure ひとつぶんの枠を大きく取り、絵は切らずに全身を出し、
 * 足元に台座（島の草の切り株）を敷いて、地面に立っているようにする。
 *
 * 同じ大きさのマスを22個並べると、それはそれで「一覧」に戻ってしまう。
 * いちばん長くいる人だけ横いっぱいの1枚にして、面に主役を1人つくる。
 *
 * **今日どこに立っているかを、その人の欄に書く。** 図鑑を名簿で終わらせない。
 * 島の顔ぶれは日替わりなので、ここも毎日書きかわる。
 *
 * 名前を出すか出さないかは本人が決める（`docs/island-concept.md`）。
 * `/island-api/state` の residents に載っている人だけ名札を付け、
 * そのほかはキャラクターと「いっしょにいた日数」だけを出す。誰が誰かは、絵だけが示す。
 *
 * ここは紙の型。押すものではないので、厚みも影も付けない。
 */
export default function FriendsWall() {
  const show = useResidentShow();
  const here = useOnIslandToday();
  const list = RESIDENTS.filter((r) => r.icon);
  // 日数の帯は、いちばん長くいる人を満杯にした割合で描く
  const top = Math.max(...list.map((r) => r.days), 1);
  const named = list.filter((r) => show.get(r.icon!)?.name).length;
  const [star, ...rest] = list;
  const starSpot = star?.icon ? here.get(star.icon) : undefined;

  return (
    <>
      {star && (
        <figure className="rz-star">
          <span className="rz-shot">
            <Pedestal w={124} />
            <img src={drive(star.icon!, 384)} alt="" />
          </span>
          <figcaption>
            <span className="rz-star-tag">いちばん長くいる人</span>
            <b>{show.get(star.icon!)?.name ?? "No.1"}</b>
            {/* 「80日」だけでは長いのか短いのか分からない。数えている幅ごと出す */}
            <span className="rz-star-n">
              直近90日のうち<b>{star.days}</b>日
            </span>
            <span className="rz-bar">
              <i style={{ width: `${Math.round((star.days / 90) * 100)}%` }} />
            </span>
            {starSpot && (
              <span className="rz-here">
                <Icon name="pin" size={12} />
                今日は{starSpot}のあたりにいます
              </span>
            )}
          </figcaption>
        </figure>
      )}

      {/* 島へ戻る道。図鑑で顔を覚えた人に会いに行けるのが、この面のいちばんの用事。 */}
      {here.size > 0 && (
        <p className="rz-today">
          <b>今日、島を歩いているのは{here.size}人。</b>
          顔ぶれは毎日入れ替わります。近くまで行くと、その人のほうから話しかけてくれます。
          <Link href="/">
            島へ会いに行く
            <Icon name="right" size={12} />
          </Link>
        </p>
      )}

      <div className="rz">
        {rest.map((r, i) => {
          const s = show.get(r.icon!);
          const spot = here.get(r.icon!);
          return (
            <figure className={`rz-card${s?.name ? "" : " is-blank"}`} key={r.icon}>
              <span className="rz-no">No.{i + 2}</span>
              <span className="rz-shot">
                <Pedestal />
                <img src={drive(r.icon!, 256)} alt="" loading="lazy" />
              </span>
              {/* 名前を出していない人の欄は、通し番号だけを上の隅に置いて空けておく。
                  「名前は出していない人」と21回書くと、それだけで面が埋まる。 */}
              {s?.name && <figcaption className="rz-name">{s.name}</figcaption>}
              <span className="rz-days">
                <b>{r.days}</b>日いっしょ
              </span>
              <span className="rz-bar">
                <i style={{ width: `${Math.round((r.days / top) * 100)}%` }} />
              </span>
              {/* 今日どこに立っているか。いない人の欄には何も書かない
                  （「今日はいません」と21回書くと、留守の札が並ぶだけになる） */}
              {spot && (
                <span className="rz-here">
                  <Icon name="pin" size={11} />
                  {spot}
                </span>
              )}
            </figure>
          );
        })}
      </div>
      <p className="pap-note" style={{ marginTop: "var(--sp-3)" }}>
        いま{list.length}人ぶんの絵があります。
        {named > 0 ?
          `そのうち${named}人が、島に名前を出すことにしてくれました。` :
          "名前を出すかどうかは本人が決めるので、いまは誰も出していません。"}
        帯の長さは、直近90日でいっしょにいた日数です。
      </p>
    </>
  );
}
