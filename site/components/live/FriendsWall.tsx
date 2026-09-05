"use client";

import { RESIDENTS } from "@/content/residents";
import { useResidentShow } from "@/lib/liveStats";

/** キャラクター画像は Google ドライブに置いてある。s の後ろが取り出す大きさ。 */
const drive = (id: string, size: number) => `https://lh3.googleusercontent.com/d/${id}=s${size}`;

/**
 * 島を歩いている仲間の壁。
 *
 * 名前を出すか出さないかは本人が決める（`docs/island-concept.md`）。
 * `/island-api/state` の residents に載っている人だけ名札を付け、
 * そのほかはキャラクターだけ並べる。誰が誰かは、絵だけが示す。
 */
export default function FriendsWall() {
  const show = useResidentShow();
  const named = RESIDENTS.filter((r) => r.icon && show.get(r.icon)?.name);
  const rest = RESIDENTS.filter((r) => !(r.icon && show.get(r.icon)?.name));

  return (
    <>
      {named.length > 0 && (
        <>
          <h3 className="sub">名前を出してくれている人</h3>
          <div className="stamps">
            {named.map((r) => {
              const s = show.get(r.icon!)!;
              return (
                <div className="stamp" key={r.icon}>
                  <img className="stamp-icon" src={drive(r.icon!, 128)} alt="" loading="lazy" />
                  <b>{s.name}</b>
                  <i>島にいます</i>
                </div>
              );
            })}
          </div>
        </>
      )}

      {named.length > 0 && <h3 className="sub">そのほかの仲間</h3>}
      <div className="crowd">
        {rest.map((r, i) => (
          // 円は 54px だと絵の中身が潰れる。顔が見えるところまで大きくする。
          <span className="crowd-one" key={r.icon ?? i} style={{ width: 62, height: 62 }}>
            {r.icon && <img src={drive(r.icon, 160)} alt="" loading="lazy" />}
          </span>
        ))}
      </div>
      <p className="muted" style={{ marginTop: 14 }}>
        {RESIDENTS.length}人ぶんの絵ができています。押しても何も起きません。眺めるところです。
      </p>
    </>
  );
}
