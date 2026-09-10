"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { RESIDENTS } from "@/content/residents";
import { charFit } from "@/content/characterBox";
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
 *
 * ## 絵は、丸く切り抜かない。**顔写真もふくめて**
 *
 * あやとの言葉（2026-09-10）「キャラクターが見切れてる。あと大きさも不揃い」。
 * ここは 48px の丸に `object-fit: cover` で押し込んでいたので、**全身の絵の
 * 頭と足が落ちていた**（22人とも）。しかも枠に合わせて詰めるので、
 * 描かれた大きさが人によって 1.56 倍ちがった。
 *
 * キャラクターは、島と図鑑と同じ `charFit`（`content/characterBox.ts`）を
 * 通して、**描かれた部分の面積**でそろえる。丸の中に収める寸法は、22人の絵の
 * 不透明な画素を測って決めた（`tools/sprites/charfit.mjs` の `ME=1`）。
 *
 * ## 顔写真は、丸に**満たす**（縮めない）
 *
 * 一度ここも縮めて「切らない」に揃えたが、あやとから
 * 「cover がバグってる。**円の中に正方形になっちゃってる**」（2026-09-10）。
 * そのとおりだった。
 *
 * **分かれ目は「顔のアップか全身か」ではなく、「透けているか、不透明か」。**
 *
 * - 住人の絵は**背景が透けている**。縮めれば、紙の地の上に絵だけが浮く
 * - YouTube の顔写真は**不透明な真四角**。縮めると、四隅まで色のある四角が
 *   丸の中に浮いて、**紙の丸に四角が貼ってあるように見える**
 *
 * 不透明な四角を丸に入れる方法は、**丸で切り抜く以外にない。**
 * それが世の中のアイコンが全部そうしている理由でもある。
 *
 * 代わりに全身のイラストは端が落ちるが、**四角が見えるほうがずっと壊れて見える。**
 * 「切らない」を先に置いたのがこちらの判断ミス。透けているものだけ収める。
 */
/** キャラクターを、丸の中にどれくらいの大きさで置くか。
 *
 *  四角い器なら 0.86 まで入るが、**ここは丸**なので、対角のぶんだけ入らない。
 *  22人の描かれた画素を円に当てて、1画素も外に出ない上限が 0.648 だった
 *  （寝そべった絵が横に広くて、いちばん先につかえる）。切り上げない。 */
const IN_CIRCLE = 0.64;


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
  /* 島にいるじぶん。**チャンネルで引く。** 本人に選ばせない（他人の絵を
     自分のものにできてしまう）ので、表に無ければ絵は出さない。 */
  const chara = user.channelId
    ? RESIDENTS.find((r) => r.channel === user.channelId)
    : undefined;
  /* 何を出すか。**キャラクター → YouTube の顔 → 頭の1文字**の順は変えない。
     どちらの絵も、丸からはみ出さない寸法まで縮めてから置く。 */
  const pic = chara?.icon ?
    /* 透けている絵。**丸の中に収める**（縮めても紙の地が透けて見えるだけ） */
    { src: drive(chara.icon, 96), cls: " is-art", style: charFit(chara.icon, IN_CIRCLE) } :
    user.channelPhoto ?
      /* 不透明な真四角。**丸に満たす。** 縮めると四角が見える（`is-art` を付けない） */
      { src: user.channelPhoto, cls: "", style: undefined } :
      null;
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
        <img
          ref={img}
          className={pic.cls.trim() || undefined}
          src={pic.src}
          alt=""
          onError={() => setDrop(true)}
          style={pic.style}
        />
      )}
    </Link>
  );
}
