import type { Metadata } from "next";
import PageShell, { PageHead } from "@/components/ui/PageShell";
import { CHARACTER_DRIVE, LINKS } from "@/content/site";
import Icon from "@/components/ui/Icon";
import Link from "next/link";
import FriendsWall from "@/components/live/FriendsWall";
import { PLAN_BY_DAY } from "@/content/planDays";
import { FriendsMark } from "@/components/live/art";
import Say from "@/components/ui/Say";
import { say } from "@/content/nights";

export const metadata: Metadata = {
  title: "愉快な仲間達",
  /* `<meta>` は焼かれたまま出るので、時刻を書かない（`content/site.ts` と同じ理由） */
  description: "配信に集まってくる仲間たち。自分で作ったキャラクターが、そのまま島を歩いています。",
};

/**
 * 愉快な仲間達。
 *
 * ここは「投げ銭で作ったキャラクターが並ぶ面」なので、一人ひとりが主役に見えないと意味がない。
 * 同じ形の板を積むのをやめて、紙に刷った図鑑の型にした（`docs/ac-reference.md` の 7章）。
 * 紙の上には影を落とさず、細い罫線で区切って、見出しには蛍光ペンの帯を敷く。
 *
 * 見出しの絵は、たき火（あやと島について）と別のものを描いてある。
 * 同じ絵を2か所で使うと、別の場所に来た気がしない。
 */
export default function FriendsPage() {
  const doneru = LINKS.find((l) => l.id === "doneru")!;

  return (
    <PageShell crumbs={[{ label: "住んでる人" }]}>
      {/* h1 は場所の名前。島に立っている札（`components/island/layout.ts`）と
          パンくずが「住んでる人」なので、h1 もそれに合わせる。
          「愉快な仲間達」は、その人たちの呼び名なので1行下へ。
          カモメは遊び方のある面だけに出す決まりなので、ここには出さない
          （`docs/island-ux.md` 5.2）。 */}
      <PageHead
        mark={<FriendsMark />}
        title="住んでる人"
        lead={<Say t={say("friends")} />}
      />

      <div className="pap-mat">
        <div className="pap">
          <b className="pap-tag">住民図鑑</b>

          {/* 図鑑の1枚を、いちばん先に出す。

              前はここに数字4つと6行の説明が先にあって、住人の絵は 1画面目に
              1画素も入っていなかった（いちばん大きい絵が見出しの印の 60x60、
              面の 1.1%）。**字が主役の図鑑になっていた。**
              本物の図鑑は絵が先で、数字と説明はその下に付いている
              （`docs/ac-reference.md` 7章4）。順番を入れ替えただけなので、
              面の長さは増えていない。

              説明は絵の下へ回した。「マスを押すと1枚が開きます」は、
              絵とマスが目の前にあれば読まなくても分かる。
              しゃべり方の出どころは図鑑の下にもう一度書いてあったので、そちらに任せる。 */}
          <section className="pap-sec">
            <h2 className="pap-h">島を歩いているのは、誰なんだろう</h2>
            {/* 企画の表は面（server）で引いて値だけ渡す。図鑑は client なので、
                ここで渡さないと `content/plans.ts`（20KB）を連れていく。 */}
            <FriendsWall plans={PLAN_BY_DAY} />
            <p className="pap-note" style={{ marginTop: "var(--sp-3)" }}>
              自分で作ったキャラクターが、そのまま島の中を歩いています。借り物の人形ではなくて、本人です。
            </p>
          </section>

          <section className="pap-sec">
            <h2 className="pap-h">自分のキャラクターも作れる?</h2>
            <p>
              100円から投げ銭してくれた方に、1人ずつ描いています。描いた絵は投げ銭の演出に出てきて、そのままこの島を歩きます。
            </p>
            <p>アイコンに使ってもらって大丈夫。</p>
            <div className="pap-gos" style={{ marginTop: "var(--sp-3)" }}>
              <a className="pap-go" href={doneru.href} target="_blank" rel="noopener noreferrer">
                <img src={doneru.logo} alt="" />
                <span>
                  <b>投げ銭してキャラクターを作る</b>
                  <i>{doneru.note}</i>
                </span>
                <Icon name="external" size={14} />
              </a>
              <a className="pap-go" href={CHARACTER_DRIVE} target="_blank" rel="noopener noreferrer">
                <img src="/sprites/stall.webp" alt="" />
                <span>
                  <b>キャラクター置き場</b>
                  <i>Googleドライブ・自由にダウンロードOK</i>
                </span>
                <Icon name="external" size={14} />
              </a>
            </div>
          </section>

          <section className="pap-sec">
            <h2 className="pap-h">名前を出すか、出さないか</h2>
            {/* 決まりを3段落ぶん広げていたところ。読む人がすることは
                「島での見え方を決める」の1つだけなので、その札だけ残す
                （`docs/island-misses.md` 決めごと7）。 */}
            <p>名前もアイコンも、出すか出さないかは自分で決められる。</p>
            <div className="pap-gos" style={{ marginTop: "var(--sp-3)" }}>
              <Link className="pap-go" href="/me">
                <img src="/sprites/signboard.webp" alt="" />
                <span>
                  <b>島での見え方を決める</b>
                  <i>じぶんのことへ</i>
                </span>
                <Icon name="right" size={14} />
              </Link>
            </div>
          </section>
        </div>
      </div>
    </PageShell>
  );
}
