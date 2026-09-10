"use client";

import { firstLetter } from "@/lib/firstLetter";
import { RESIDENTS } from "@/content/residents";
import { useResidentDays } from "@/lib/residentDays";

/** キャラクターの絵は Google ドライブに置いてある。s の後ろが取り出す大きさ。 */
const drive = (id: string, size: number) =>
  `https://lh3.googleusercontent.com/d/${id}=s${size}`;

/**
 * 開いた瞬間に、じぶんの島での立ち位置が分かる1枚。
 *
 * ## なぜ1枚にまとめたか
 *
 * 前はこれが3か所に割れていた。看板の下の「いま入っている人」の1行、
 * 面のまん中の「島にいる、じぶん」の紙、そのどちらにも書いてあった
 * 「島に名前を出しています」。**同じ人のことを3回言って 700px 使っていた。**
 * 顔・キャラクター・名前・いた日数は、ぜんぶ「あなたは誰か」の答えなので、
 * 1枚に寄せる。
 *
 * ## 顔は2つ出す。役目が違う
 *
 * 島を歩いているのはキャラクターの絵で、投げ銭やコメントに付いてくるのは
 * YouTube の顔。**どちらも「島でのあなた」**なので、キャラクターの上に
 * 顔を小さく重ねて1つの絵にする。並べると、どちらが自分なのか読ませることになる。
 *
 * 顔に出すのは `channelPhoto`（毎晩 islandChannels から入れ直る）。
 * ログインした日のまま止まる `photo` は使わない（`docs/island-misses.md` #1）。
 *
 * ## 数字は1つだけ
 *
 * 「一緒にいた日数」は、この島で唯一「積み上がったもの」を言える数字
 * （#91。毎晩 BigQuery から数え直す）。付箋やカードの数は下の札が持っている
 * ので、ここで二度言わない（`docs/island-design.md` 4章「飾りの数字を置かない」）。
 */
export default function MeHero({
  name,
  face,
  channelId,
}: {
  /** 島に出す名前。決めていなければログインの名前 */
  name: string;
  /** 毎晩入れ直る顔。まだ入っていない人は空 */
  face: string;
  channelId?: string;
}) {
  const live = useResidentDays();
  const chara = channelId ? RESIDENTS.find((r) => r.channel === channelId) : undefined;
  /* 焼き込みの `days` は Git を出さないと変わらない。毎晩数え直したほうが
     読めていれば、そちらを出す（`lib/residentDays.ts`）。 */
  const days = (channelId ? live[channelId] : 0) || chara?.days || 0;

  return (
    <div className="mh">
      <span className="mh-pics">
        {chara?.icon ? (
          <img className="mh-chara" src={drive(chara.icon, 256)} alt="" />
        ) : null}
        {face ? (
          <img className={`mh-face${chara?.icon ? " is-badge" : ""}`} src={face} alt="" />
        ) : (
          <span
            className={`mh-face mh-face-none${chara?.icon ? " is-badge" : ""}`}
            aria-hidden
          >
            {firstLetter(name)}
          </span>
        )}
      </span>
      <span className="mh-t">
        <b>{name}</b>
        {days > 0 && (
          <i>
            <em>{days}</em>日、いっしょにいる
          </i>
        )}
      </span>
    </div>
  );
}
