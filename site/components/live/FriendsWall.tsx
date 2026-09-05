"use client";

import { RESIDENTS } from "@/content/residents";
import { useResidentShow } from "@/lib/liveStats";
import { Pedestal } from "./art";

/** キャラクター画像は Google ドライブに置いてある。s の後ろが取り出す大きさ。 */
const drive = (id: string, size: number) => `https://lh3.googleusercontent.com/d/${id}=s${size}`;

/**
 * 島を歩いている仲間の図鑑。
 *
 * 「投げ銭で作ったキャラクターが並ぶ面」なので、一人ひとりが主役に見えないと意味がない。
 * 丸く小さく切り抜いて敷き詰めると、誰の絵も見えなくなる。
 * だから figure ひとつぶんの枠を大きく取り、絵は切らずに全身を出し、
 * 足元に台座（島の草の切り株）を敷いて、地面に立っているようにする。
 *
 * 名前を出すか出さないかは本人が決める（`docs/island-concept.md`）。
 * `/island-api/state` の residents に載っている人だけ名札を付け、
 * そのほかはキャラクターと「いっしょにいた日数」だけを出す。誰が誰かは、絵だけが示す。
 *
 * ここは紙の型。押すものではないので、厚みも影も付けない。
 */
export default function FriendsWall() {
  const show = useResidentShow();
  const list = RESIDENTS.filter((r) => r.icon);
  // 日数の帯は、いちばん長くいる人を満杯にした割合で描く
  const top = Math.max(...list.map((r) => r.days), 1);
  const named = list.filter((r) => show.get(r.icon!)?.name).length;

  return (
    <>
      <div className="rz">
        {list.map((r, i) => {
          const s = show.get(r.icon!);
          return (
            <figure className={`rz-card${i === 0 ? " is-top" : ""}${s?.name ? "" : " is-blank"}`} key={r.icon}>
              {/* 赤い枠だけだと、何が選ばれているのか分からない。理由を1つ添える */}
              {i === 0 && <span className="rz-top">いちばん長く</span>}
              <span className="rz-shot">
                <Pedestal />
                <img src={drive(r.icon!, 256)} alt="" loading="lazy" />
              </span>
              {/* 名前を出していない人には通し番号を振る。
                  「名前は出していない人」と22回書くと、それだけで面が埋まる。
                  図鑑の番号なら、絵の邪魔をせずに一人ひとりを別のものとして扱える。 */}
              <figcaption className="rz-name">{s?.name ?? `No.${i + 1}`}</figcaption>
              <span className="rz-days">
                <b>{r.days}</b>日いっしょ
              </span>
              <span className="rz-bar">
                <i style={{ width: `${Math.round((r.days / top) * 100)}%` }} />
              </span>
            </figure>
          );
        })}
      </div>
      <p className="pap-note" style={{ marginTop: 12 }}>
        いま{list.length}人ぶんの絵があります。
        {named > 0 ?
          `そのうち${named}人が、島に名前を出すことにしてくれました。` :
          "名前を出すかどうかは本人が決めるので、いまは誰も出していません。"}
        帯の長さは、直近90日でいっしょにいた日数です。
      </p>
    </>
  );
}
