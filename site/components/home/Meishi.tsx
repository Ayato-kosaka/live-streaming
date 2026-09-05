import Link from "next/link";
import Icon from "@/components/ui/Icon";
import Days from "@/components/atlas/Days";
import { LiveNumber } from "@/lib/liveStats";
import { LINKS, NOW_FALLBACK, PROFILE, STATS_FALLBACK } from "@/content/site";
import { ACTIVE_FRIENDS } from "@/content/residents";

/**
 * 名刺。「いま」の章の顔。
 *
 * 切り抜きから飛んできた人が最初に知りたいのは3つだけ
 * （`docs/island-ux.md` 2章A）。この人だれ・何が面白い・いつやってる。
 * 前はここに「絵・題・矢印」の横並びカードが3枚と、配信の型5つの帯と、
 * 小さい入口が2つ並んでいた。**カードが6枚あっても、3つのうち1つも答えていない。**
 * 顔が出るのは `/about` に入ってからだった。
 *
 * だから章まるごとを1枚の名刺にする。顔・名前・3行・数字・押しどころ。
 * 数字は読み物ではなく**入口**にする。「747本」を押すと「配信」、
 * 「17カ国」を押すと道しるべ。読むだけの数字を4つ並べても見応えにはならない。
 *
 * 配信の型5つの帯と、3枚のカードは消した。行き先のページの1画面目を
 * トップで先に読ませていた（`docs/island-ux.md` 3.4）ぶんで、
 * 型は `/streams`、アプリは `/apps` の側にもっと良い形で置いてある。
 */
export default function Meishi() {
  const s = STATS_FALLBACK;
  const youtube = LINKS.find((l) => l.id === "youtube")!;

  return (
    <div className="mei">
      <div className="mei-top">
        {/* 写真は「誰かが紙に貼ったもの」として置く（`docs/island-world.md` 6.2-3）。
            縁を付けてわずかに傾ける。裸で置かない。 */}
        <span className="mei-face">
          <img
            src="/characters/ayato-clay.jpg"
            alt="鍋をかきまぜているあやと"
            width={300}
            height={169}
            loading="lazy"
          />
        </span>
        <div className="mei-word">
          <b className="mei-name">{PROFILE.name}</b>
          <p className="mei-lead">{PROFILE.lead}</p>
          <p className="mei-body">{PROFILE.body[1]}</p>
        </div>
      </div>

      {/* 数字は4つ。押せるので板にする（厚みは押せるものだけ・`docs/island-world.md` 3.4）。
          どれも「その数を持っている面」へ行く。数と行き先が食い違わないようにする。 */}
      <div className="mei-nums">
        <Link className="mei-num" href="/streams">
          <em>
            <LiveNumber statKey="streams" fallback={s.streams} />
          </em>
          <span>本の配信</span>
        </Link>
        <Link className="mei-num" href="/map">
          <em>{s.countries}</em>
          <span>カ国を歩いた</span>
        </Link>
        <Link className="mei-num" href="/kitchen">
          <em>{s.recipes}</em>
          <span>品つくった</span>
        </Link>
        <Link className="mei-num" href="/friends">
          <em>
            <LiveNumber statKey="activeFriends" fallback={ACTIVE_FRIENDS} />
          </em>
          <span>人の住人</span>
        </Link>
      </div>

      {/* 日本を出てからの日数は焼き込めない。Days が画面の出たあとで数え直す。 */}
      <p className="mei-since">
        2024年10月28日に日本を出て、きょうで <Days from={s.since} /> 日目。
      </p>

      <div className="mei-gos">
        <a className="mei-go is-live" href={youtube.href} target="_blank" rel="noopener noreferrer">
          <Icon name="live" size={22} />
          <span>
            <b>今夜の配信を見る</b>
            <i>毎晩22時・YouTube</i>
          </span>
          <Icon name="external" size={14} />
        </a>
        <Link className="mei-go" href="/now">
          <Icon name="pin" size={22} />
          <span>
            <b>いま {NOW_FALLBACK.place}</b>
            <i>今夜まであと何時間か、今週やること</i>
          </span>
          <Icon name="right" size={14} />
        </Link>
        <Link className="mei-go" href="/about">
          <Icon name="cottage" size={22} />
          <span>
            <b>あやとの話をもっと聞く</b>
            <i>ここまでの節目と、島でやっていること</i>
          </span>
          <Icon name="right" size={14} />
        </Link>
      </div>
    </div>
  );
}
