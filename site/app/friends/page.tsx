import type { Metadata } from "next";
import PageShell, { PageHead } from "@/components/ui/PageShell";
import { LiveNumber } from "@/lib/liveStats";
import { RESIDENTS, ACTIVE_FRIENDS } from "@/content/residents";
import { VOICES } from "@/content/chatter";
import { STATS_FALLBACK, CHARACTER_DRIVE, LINKS } from "@/content/site";
import Icon from "@/components/ui/Icon";
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
  // セリフは口調がばらけるように、離れた人から3つ取る。並びは固定（毎回変わると落ち着かない）。
  const says = [0, 6, 13].map((i) => VOICES[i]).filter(Boolean);

  return (
    <PageShell current="friends" crumbs={[{ label: "あやと島について", href: "/about" }, { label: "愉快な仲間達" }]}>
      <PageHead
        mark={<FriendsMark />}
        title="愉快な仲間達"
        lead="毎晩22時に集まってくる人たち。名前は出しませんが、ちゃんとここにいます。"
        say="自分のキャラクターも作れるよ。作った絵は、そのまま島を歩くんだ。"
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
            <h2 className="pap-h">島を歩いている仲間</h2>
            <p className="pap-note">
              自分で作ったキャラクターが、そのまま島の中を歩いています。借り物の人形ではなくて、本人です。
            </p>
            <FriendsWall />
          </section>

          <section className="pap-sec">
            <h2 className="pap-h">島で何を言われるか</h2>
            <p className="pap-note">
              島を歩いていると、住人が話しかけてきます。しゃべり方は、その人が配信で書いてきたコメントから写しています。
            </p>
            <div className="pap-quotes">
              {says.map((v) => (
                <figure className="pap-quote" key={v.icon}>
                  <img src={`https://lh3.googleusercontent.com/d/${v.icon}=s128`} alt="" loading="lazy" />
                  <blockquote>{v.lines[0]}</blockquote>
                </figure>
              ))}
            </div>
          </section>

          <section className="pap-sec">
            <h2 className="pap-h">キャラクターを作りたい人へ</h2>
            <p>
              キャラクターは、100円から投げ銭してくれた方にお作りしています。作ったキャラクターは、投げ銭の演出のときに画面に出てきます。この島も歩きます。
            </p>
            <p>
              できあがった画像は、下のGoogleドライブから自由に持っていけます。アイコンに使ってもらって大丈夫です。
            </p>
            <div className="pap-gos" style={{ marginTop: 12 }}>
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
            {/* 決まりが2通りあるのに、これまでログインした人の話しか書いていなかった。
                自分がどちらなのかで読む行が変わるので、2つ並べて先に選ばせる。 */}
            <ul className="pap-rule">
              <li>
                <b>ログインしないで使う</b>
                <i>
                  企画掲示板は名前もログインも要りません。名前の欄はありますが、
                  空のままでも貼れます。書けば、その名前だけが札に出ます。
                </i>
              </li>
              <li>
                <b>YouTubeでログインする</b>
                <i>
                  名前とアイコンが出るようになります。出したくないものは
                  「島での見え方」で片方ずつ消せます。両方消しても、企画は出せます。
                </i>
              </li>
            </ul>
            <p className="pap-note">
              「島の住人」は、直近90日のあいだに5日以上コメントしてくれた人の数です。
              個人ごとのコメント数や順位は出しません。出席日数は月末配信のほうで表彰しています。
            </p>
            <div className="pap-gos" style={{ marginTop: 12 }}>
              <Link className="pap-go" href="/board">
                <img src="/sprites/signboard.webp" alt="" />
                <span>
                  <b>島での見え方を決める</b>
                  <i>企画掲示板の下。ログインすると出てきます</i>
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
