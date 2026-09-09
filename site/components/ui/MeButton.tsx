"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { RESIDENTS } from "@/content/residents";
import { firstLetter } from "@/lib/firstLetter";

/** 島のキャラクターの絵。`MyPage` と同じ引き方。 */
const drive = (id: string, size: number) =>
  `https://lh3.googleusercontent.com/d/${id}=s${size}`;

/**
 * 看板の右はしの、自分のアイコン。**じぶんのこと（`/me`）への入口。**
 *
 * **ログインしていない人には出さない。** 押しても自分のものが1つも無い
 * 面へ連れていくことになるし、島は名前もログインも要らずに遊べる場所
 * なので、看板に「入っていない」を毎回言わない。
 *
 * 出るのはアイコン1つだけ。字を足すと、狭い画面（`.ih-in` は
 * `flex-wrap: nowrap`）で「いま、どこ」の行が押し出される。
 * 何のアイコンかは、読み上げのための名前で言う。
 *
 * 絵が読めなかったときは、頭の1文字に落ちる。旅先の電波では
 * `lh3.googleusercontent.com` が落ちてくるとは限らない。
 *
 * ## 出すのは島のキャラクター。YouTube の写真ではない
 *
 * あやとの言葉（2026-09-09）「右上のマイページ画像が古い。**そのカラムは
 * 使わないで欲しい**」。ここは `user.photo`（Google の写真）を出していた。
 * あれは本人が YouTube で替えないかぎり古いままで、実際に古かった。
 *
 * `/me` の中はもう島のキャラクターを出している（`MyPage` の `chara`）ので、
 * **看板だけ別の顔が出ていた。** 同じ人の顔が2つあるほうが、片方が
 * 古いことより分かりにくい。島の中はキャラクターでそろえる。
 *
 * 割り当ては**あやとの表だけが決める**（`content/residents.ts` の `channel`）。
 * キャラクターの無い人は、いままでどおり頭の1文字。
 */
export default function MeButton() {
  const { user } = useAuth();
  const path = usePathname();
  if (!user) return null;
  const initial = firstLetter(user.name);
  /* 島にいるじぶん。**チャンネルで引く。** 本人に選ばせない（他人の絵を
     自分のものにできてしまう）ので、表に無ければ絵は出さない。 */
  const chara = user.channelId
    ? RESIDENTS.find((r) => r.channel === user.channelId)
    : undefined;
  return (
    <Link
      href="/me"
      prefetch={false}
      className={`ih-me${path === "/me" ? " is-on" : ""}`}
      aria-label="じぶんのこと"
      aria-current={path === "/me" ? "page" : undefined}
    >
      <span className="ih-me-i" aria-hidden>
        {initial}
      </span>
      {chara?.icon && <img src={drive(chara.icon, 96)} alt="" />}
    </Link>
  );
}
