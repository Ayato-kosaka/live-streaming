"use client";

import { firstLetter } from "@/lib/firstLetter";
import { RESIDENTS } from "@/content/residents";
import { charFit } from "@/content/characterBox";
import { useResidentDays } from "@/lib/residentDays";
import { charImg } from "@/lib/charImg";

/* キャラクターの絵は `lib/charImg.ts`（口ごしに置き場から）。
   ドライブから移した（#284）ので、URL を組み立てるところはもう無い。 */

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
 * キャラクターは**枠ではなく、中に描かれた部分**でそろえる
 * （`content/characterBox.ts`。島・図鑑・台所と同じ）。枠に合わせて詰めると、
 * 同じ 84px の器でも、描かれた大きさが人によって 1.50 倍ちがう
 * （寝そべった絵は枠の高さの 59% しか使っていない）。
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
          <img
            className="mh-chara"
            src={charImg(chara.icon, 256)}
            alt=""
            /* 0.72 は、84px の器から**誰も出ない**上限（0.73）のすぐ下。
               ここを 0.8 にすると、寝そべった絵（横に 1.37 倍広い）が
               紙の左の縁まで届いて、切れているように見える。撮って戻した。 */
            style={charFit(chara.icon, 0.72, true)}
          />
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
