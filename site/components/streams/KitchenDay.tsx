import type { KitchenTalk } from "@/content/kitchenTalk";

/** キャラクターの絵は Google ドライブ。s の後ろが取り出す大きさ（`FriendsWall` と同じ道）。 */
const drive = (id: string, size: number) => `https://lh3.googleusercontent.com/d/${id}=s${size}`;

/** 分を「2時間49分」に。1時間に満たない日は分だけ言う。 */
function span(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h ? `${h}時間${m ? `${m}分` : ""}` : `${m}分`;
}

/**
 * 作った料理の1枚の「この日、台所にいた人」。
 *
 * ## なぜ足したか
 *
 * 32枚の料理の面は、名前と絵と一行の添え書きしか持っていなかった。
 * 面の高さの9割が「よその料理へ行く格子」で、その品について言えているのは
 * 1文だけ（実測 本文40〜120字。`tools/sprites/thin.mjs`）。
 *
 * 足りないのは飾りではなく**その日そこで何があったか**なので、
 * 配信のチャットから引いた（`python/build_kitchen_talk.py`）。
 * 料理は1人で作ったものではなくて、**その晩そこにいた人たちと作ったもの**
 * だった、というのがこの面でいちばん言いたいこと。
 *
 * ## 数字と絵で言い分ける
 *
 * 数字（人数・コメント・長さ）は「どれくらいの晩だったか」。
 * 絵（キャラクター）は「誰がいたか」。
 * 名前は出さない。誰が誰かはキャラクターの絵だけが示す
 * （`docs/island-concept.md` 6章）。
 *
 * `there` に出るのは、その日コメントしていた人のうち**いまも島に絵がある人**
 * だけなので、人数（`people`）とは一致しない。一致しないことを文で言う。
 */
export default function KitchenDay({ t }: { t: KitchenTalk }) {
  // 数が取れていない日（チャットの残っていない配信）は、数字を出さずに黙る。
  // 「0人」と書くのは、待たせるのではなく嘘をつくことになる（island-world.md 4.3 ④）
  if (!t.people) return null;

  return (
    <div className="kd">
      <p className="kd-lead">
        <b>{t.people}</b>
        <i>人</i>
        <span>が、この晩の台所にいた</span>
      </p>
      <p className="kd-sub">
        {span(t.mins)}のあいだに、コメントは{t.msgs.toLocaleString("ja-JP")}。
        {t.msgs >= t.people * 20 && "手が止まるたびに、誰かが口を出していた。"}
      </p>

      {t.there.length > 0 && (
        <>
          <ul className="kd-folks">
            {t.there.map((icon) => (
              <li key={icon}>
                {/* 島を歩いているのと同じ絵。名前は付けない（本人が決めること）。
                    絵が届かないときのために alt は空にする */}
                <img src={drive(icon, 256)} alt="" loading="lazy" referrerPolicy="no-referrer" />
              </li>
            ))}
          </ul>
          <p className="kd-foot">
            いまも島を歩いている人だと、この{t.there.length}人が来ていた。
          </p>
        </>
      )}
    </div>
  );
}
