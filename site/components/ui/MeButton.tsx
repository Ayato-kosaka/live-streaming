"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { firstLetter } from "@/lib/firstLetter";

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
 * ## 出すのは **YouTube の顔写真**。それだけ
 *
 * あやとの言葉（2026-09-10）:
 *
 * > YouTube の顔写真がキャラクターより優先で、無いことはないので、
 * > 住人の絵の見切れを考慮してるのが意味分からない。
 * > **私が今まで住人キャラクターを右上に出すって話一度でもしました？**
 *
 * 言われていない。**こちらが勝手に入れた**（#234）。
 * ログインは YouTube なので顔写真は必ずある。だから島のキャラクターを
 * 先に出す枝そのものが要らず、「全身の絵が丸で切れる」も
 * 「透けている絵は縮める」も、**存在しない問題を自分で作って3回直していた**。
 *
 * 顔写真は不透明な真四角なので、丸に満たす（`object-fit: cover`）だけでよい。
 * 頭の1文字は、絵が落ちたときだけの受け皿。
 */

export default function MeButton() {
  const { user } = useAuth();
  const path = usePathname();
  /* 絵が落ちたかどうか。**落ちたら頭の1文字に戻す。** 旅先の電波では
     `lh3.googleusercontent.com` が落ちてくるとは限らない。丸く切っていた
     ころは絵が地を隠していたが、いまは絵の周りに紙が見えるので、
     字を出したままにすると絵と字が重なる。 */
  const [drop, setDrop] = useState(false);
  const img = useRef<HTMLImageElement>(null);
  /* 画面が出るより前に落ちた絵は、React が付ける前に `error` が済んでいる。
     付いた時点でもう1度だけ見る。 */
  useEffect(() => {
    const el = img.current;
    if (el && el.complete && el.naturalWidth === 0) setDrop(true);
  }, []);
  if (!user) return null;
  const initial = firstLetter(user.name);
  /* 出すのは顔写真だけ。**無いことはない**（ログインが YouTube なので）が、
     旅先の電波で絵が落ちることはあるので、そのときだけ字に落ちる。 */
  const pic = user.channelPhoto ? { src: user.channelPhoto } : null;
  const shown = pic && !drop;
  return (
    <Link
      href="/me"
      prefetch={false}
      className={`ih-me${path === "/me" ? " is-on" : ""}${shown ? " has-pic" : ""}`}
      aria-label="じぶんのこと"
      aria-current={path === "/me" ? "page" : undefined}
    >
      <span className="ih-me-i" aria-hidden>
        {initial}
      </span>
      {/* 落ちたら**要素ごと外す。** 残すと、Chrome が壊れた絵の記号を
          字の上に重ねて出す（島のものが1つ「バグって見える」ことになる。
          `docs/island-misses.md` #7）。 */}
      {shown && (
        <img ref={img} src={pic.src} alt="" onError={() => setDrop(true)} />
      )}
    </Link>
  );
}
