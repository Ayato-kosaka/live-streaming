import type { Metadata } from "next";
import PageShell, { PageHead } from "@/components/ui/PageShell";
import { LiveNumber } from "@/lib/liveStats";
import { RESIDENTS, ACTIVE_FRIENDS } from "@/content/residents";
import { STATS_FALLBACK, CHARACTER_DRIVE, LINKS } from "@/content/site";
import Icon from "@/components/ui/Icon";
import Fold from "@/components/ui/Fold";
import Link from "next/link";
import FriendsWall from "@/components/live/FriendsWall";
import { FriendsMark } from "@/components/live/art";

export const metadata: Metadata = {
  title: "愉快な仲間達",
  description: "島に住んでいる仲間たち。名前は出しませんが、みんなちゃんといます。",
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
    <PageShell crumbs={[{ label: "仲間のテント" }]}>
      {/* h1 は場所の名前。島に立っている札（`components/island/layout.ts`）と
          パンくずが「仲間のテント」なので、h1 もそれに合わせる。
          「愉快な仲間達」は、そのテントに集まっている人たちの呼び名なので1行下へ。
          カモメは遊び方のある面だけに出す決まりなので、ここには出さない
          （`docs/island-ux.md` 5.2）。 */}
      <PageHead
        mark={<FriendsMark />}
        title="仲間のテント"
        lead="毎晩22時に集まってくる、愉快な仲間達。名前は出しませんが、ちゃんとここにいます。"
      />

      <div className="pap-mat">
        <div className="pap">
          <b className="pap-tag">住民図鑑</b>

          <section className="pap-sec">
            <div className="pap-nums">
              <div>
                <b>
                  <LiveNumber statKey="activeFriends" fallback={ACTIVE_FRIENDS} />
                </b>
                <span>いまの島の住人</span>
                <i>直近90日で5日以上</i>
              </div>
              <div>
                <b>{RESIDENTS.length}</b>
                <span>キャラクターができた人</span>
                <i>投げ銭で1人ずつ</i>
              </div>
              <div>
                <b>
                  <LiveNumber statKey="people" fallback={STATS_FALLBACK.people} />
                </b>
                <span>のべ参加人数</span>
                <i>2024/10から</i>
              </div>
              <div>
                <b>
                  <LiveNumber statKey="comments" fallback={STATS_FALLBACK.comments} />
                </b>
                <span>みんなのコメント</span>
                <i>ぜんぶ読んでます</i>
              </div>
            </div>
          </section>

          <section className="pap-sec">
            <h2 className="pap-h">島を歩いているのは、誰なんだろう</h2>
            <p className="pap-note">
              自分で作ったキャラクターが、そのまま島の中を歩いています。借り物の人形ではなくて、本人です。
              マスを押すと、その人の1枚が開きます。しゃべり方は、その人が配信で書いてきたコメントから写しています。
              しばらく来ていなかった人には「久しぶり」と言いますが、空いた日数は数えていません。
            </p>
            <FriendsWall />
          </section>

          <section className="pap-sec">
            <h2 className="pap-h">自分のキャラクターも作れる?</h2>
            <p>
              100円から投げ銭してくれた方に、1人ずつ描いています。描いた絵は投げ銭の演出に出てきて、そのままこの島を歩きます。
            </p>
            <p>
              できた絵は、下のGoogleドライブから持っていけます。アイコンに使ってもらって大丈夫。
            </p>
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
            {/* 決まりの本文は、読む人が自分の側だけ読めば済むもの。
                図鑑を見に来た人の前に3段落ぶん広げておく理由が無いので畳む
                （`docs/island-design.md` 4章）。行き先の札だけは畳まず外に出す。 */}
            <Fold title="決まりは2通り。どちらでも企画は出せる" lead="ログインしないで使う / YouTubeでログインする">
              <ul className="pap-rule">
                <li>
                  <b>ログインしないで使う</b>
                  <i>
                    企画掲示板は名前もログインも要りません。名前の欄は空のままでも貼れて、
                    書けばその名前だけが札に出ます。
                  </i>
                </li>
                <li>
                  <b>YouTubeでログインする</b>
                  <i>
                    名前とアイコンが札に出ます。出したくないほうは「島での見え方」で
                    片方ずつ消せて、両方消しても企画は出せます。
                  </i>
                </li>
              </ul>
              <p className="pap-note">
                「島の住人」は、直近90日のあいだに5日以上コメントしてくれた人の数です。
                個人ごとのコメント数や順位は出しません。出席日数は月末配信のほうで表彰しています。
                図鑑の番号も、並べるための通し番号であって順位ではありません。
              </p>
            </Fold>
            <div className="pap-gos" style={{ marginTop: "var(--sp-3)" }}>
              <Link className="pap-go" href="/board">
                <img src="/sprites/signboard.webp" alt="" />
                <span>
                  <b>島での見え方を決める</b>
                  <i>ログインすると、企画掲示板の下に出てくる</i>
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
