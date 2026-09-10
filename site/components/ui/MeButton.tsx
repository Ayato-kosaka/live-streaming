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
 * **YouTube の顔写真も同じに切らない。** はじめ「顔写真は正方形に収まって
 * いるから丸く切ってよい」で残していたが、**あやと本人の絵が全身のイラスト**で、
 * 丸のふちで足が切れていた。あやとが毎日見ているのはこのアイコンで、
 * 住人の絵を22人ぶん直しても、ここが切れていれば何も直っていない。
 *
 * **顔のアップか全身かは URL からは分からない。** 分けられないものを分けようと
 * すると、また同じことが起きる。**どちらも収める。** 顔のアップの人は絵が
 * 少し小さくなって紙の地が見えるが、島のものは全部「紙の丸に絵が乗っている」形
 * （看板の左の案内鳥がまさにそれ）なので、むしろそちらに揃う。
 */
/** キャラクターを、丸の中にどれくらいの大きさで置くか。
 *
 *  四角い器なら 0.86 まで入るが、**ここは丸**なので、対角のぶんだけ入らない。
 *  22人の描かれた画素を円に当てて、1画素も外に出ない上限が 0.648 だった
 *  （寝そべった絵が横に広くて、いちばん先につかえる）。切り上げない。 */
const IN_CIRCLE = 0.64;
/** 顔写真を、丸の中にどれくらいの大きさで置くか。
 *
 *  こちらは中身を測れない（外から来る絵で、透明な余白も無い）ので、
 *  **絵の四隅が円に触れる**ところが上限になる。真四角なら 1/√2 ≒ 0.707。
 *  `contain` で入れてあるので、縦長・横長の絵の対角はこれより短い。
 *
 *  ちょうど 0.707 だと四隅が円に**乗る**ので、丸く切るときのにじみに
 *  1画素かじられる（真四角の絵を差し込んで撮ると、そこだけ差が出た）。
 *  0.68 まで下げると、切っても切らなくても1バイトも変わらない。 */
const IN_CIRCLE_PHOTO = 0.68;

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
    { src: drive(chara.icon, 96), style: charFit(chara.icon, IN_CIRCLE) } :
    user.channelPhoto ?
      { src: user.channelPhoto, style: { transform: `scale(${IN_CIRCLE_PHOTO})` } } :
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
        <img ref={img} src={pic.src} alt="" onError={() => setDrop(true)} style={pic.style} />
      )}
    </Link>
  );
}
