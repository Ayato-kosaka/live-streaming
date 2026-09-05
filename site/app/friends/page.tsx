import type { Metadata } from "next";
import PageShell, { PageHead } from "@/components/ui/PageShell";
import { GUIDE } from "@/content/voice";
import { LiveNumber } from "@/lib/liveStats";
import { Panel, Stat } from "@/components/ui/Bits";
import { RESIDENTS, ACTIVE_FRIENDS } from "@/content/residents";
import { VOICES } from "@/content/chatter";
import { STATS_FALLBACK, CHARACTER_DRIVE, LINKS } from "@/content/site";
import Icon from "@/components/ui/Icon";
import Fold from "@/components/ui/Fold";
import FriendsWall from "@/components/live/FriendsWall";

export const metadata: Metadata = {
  title: "愉快な仲間達",
  description: "島に住んでいる仲間たち。名前は出しませんが、みんなちゃんといます。",
};

/**
 * 見出しの絵。3人が並んで立っているところ。
 *
 * たき火（あやと島について）と同じ絵を使うと、別の場所に来た気がしない。
 * ここは「人が集まっている」ことだけを描く。
 * 島の絵の決まりごとに合わせて、輪郭線は引かず、面の明暗だけで立体を作る。
 * 光は左上から。だから右下に一段暗い色を残し、接地影も右下へずらす。
 */
function FriendsMark() {
  const skin = "#ffdfba";
  const skinLo = "#f0c496";
  return (
    <svg viewBox="0 0 64 64" width={60} height={60} aria-hidden>
      {/* 立っている地面。島と同じ草の色。丸く切って、板の上に乗っている感じにする */}
      <ellipse cx="32" cy="52" rx="27" ry="9" fill="#63b043" />
      <ellipse cx="32" cy="50.5" rx="27" ry="8.4" fill="#8ed35f" />
      <ellipse cx="31" cy="49" rx="24" ry="6.6" fill="#a5e074" />
      {/* 足元の影。暖かい灰緑を、光の反対（右下）へずらす */}
      <ellipse cx="17.5" cy="49.5" rx="7.5" ry="2.4" fill="#5c9440" opacity="0.4" />
      <ellipse cx="47" cy="49.5" rx="7.5" ry="2.4" fill="#5c9440" opacity="0.4" />
      <ellipse cx="33" cy="52.6" rx="10.5" ry="3" fill="#5c9440" opacity="0.45" />

      {/* 左の子。おだんご頭。手を上げている */}
      <g>
        <ellipse cx="10.6" cy="38.5" rx="2.7" ry="4.4" fill="#4f9e77" transform="rotate(-24 10.6 38.5)" />
        <rect x="9.5" y="34" width="16" height="15" rx="7" fill="#4f9e77" />
        <rect x="9.5" y="33.4" width="14.6" height="14.4" rx="6.8" fill="#6fc79a" />
        <circle cx="17.5" cy="24.6" r="9" fill={skinLo} />
        <circle cx="16.8" cy="23.9" r="8.3" fill={skin} />
        <circle cx="17.5" cy="12.6" r="3.4" fill="#7a5136" />
        <path d="M8.6 24.2a8.9 8.9 0 0 1 17.8 0c-2.3-3.4-5.4-5.1-8.9-5.1s-6.6 1.7-8.9 5.1z" fill="#7a5136" />
        <circle cx="14.4" cy="25.6" r="1.25" fill="#4a3527" />
        <circle cx="20.6" cy="25.6" r="1.25" fill="#4a3527" />
        <circle cx="11.9" cy="28.2" r="1.7" fill="#ffb3ba" opacity="0.8" />
        <circle cx="23" cy="28.2" r="1.7" fill="#ffb3ba" opacity="0.8" />
      </g>

      {/* 右の子。短い髪 */}
      <g>
        <ellipse cx="55.6" cy="42" rx="2.6" ry="4.2" fill="#3f9ac6" transform="rotate(16 55.6 42)" />
        <rect x="39" y="34" width="16" height="15" rx="7" fill="#3f9ac6" />
        <rect x="39" y="33.4" width="14.6" height="14.4" rx="6.8" fill="#63bfe8" />
        <circle cx="47" cy="24.6" r="9" fill={skinLo} />
        <circle cx="46.3" cy="23.9" r="8.3" fill={skin} />
        <path d="M38.1 24.6a8.9 8.9 0 0 1 17.8 0c-1.2-2.2-2.5-3.4-4-3.7-1.5 1.3-3.1 2-4.9 2-2.9 0-5.2-1.1-6.9-3.2a8.9 8.9 0 0 0-2 4.9z" fill="#5c4030" />
        <circle cx="43.9" cy="25.6" r="1.25" fill="#4a3527" />
        <circle cx="50.1" cy="25.6" r="1.25" fill="#4a3527" />
        <circle cx="41.4" cy="28.2" r="1.7" fill="#ffb3ba" opacity="0.8" />
        <circle cx="52.5" cy="28.2" r="1.7" fill="#ffb3ba" opacity="0.8" />
      </g>

      {/* 手前のひとり。いちばん大きく、いちばん明るい */}
      <g>
        <ellipse cx="21.4" cy="44" rx="2.9" ry="4.6" fill="#d95e75" transform="rotate(18 21.4 44)" />
        <ellipse cx="42.6" cy="44" rx="2.9" ry="4.6" fill="#d95e75" transform="rotate(-18 42.6 44)" />
        <rect x="22" y="36" width="20" height="17" rx="8.5" fill="#d95e75" />
        <rect x="22" y="35.2" width="18.4" height="16.4" rx="8.2" fill="#f0798d" />
        <circle cx="32" cy="24.4" r="11" fill={skinLo} />
        <circle cx="31.2" cy="23.6" r="10.2" fill={skin} />
        {/* 前髪。輪郭線は引かず、面のかたちだけで髪型を出す */}
        <path d="M21.1 24.4a10.9 10.9 0 0 1 21.8 0c-1-4-2.9-6.4-5.7-7.4-1.5 2-3.2 3-5.2 3s-3.7-1-5.2-3c-2.8 1-4.7 3.4-5.7 7.4z" fill="#6b4a35" />
        <path d="M24.3 19.6a10.9 10.9 0 0 1 5.6-4.2c-2 1.3-3.7 2.8-4.7 4.6z" fill="#8a6247" />
        <circle cx="27.9" cy="25.4" r="1.45" fill="#4a3527" />
        <circle cx="36.1" cy="25.4" r="1.45" fill="#4a3527" />
        <circle cx="24.6" cy="28.4" r="2" fill="#ffb3ba" opacity="0.85" />
        <circle cx="39.4" cy="28.4" r="2" fill="#ffb3ba" opacity="0.85" />
      </g>
    </svg>
  );
}

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
        say={GUIDE.friends}
      />
      <div className="stats" style={{ marginBottom: 18 }}>
        <Stat value={<LiveNumber statKey="activeFriends" fallback={ACTIVE_FRIENDS} />} label="いまの島の住人" sub="直近90日で5日以上" />
        <Stat value={<LiveNumber statKey="people" fallback={STATS_FALLBACK.people} />} label="のべ参加人数" sub="2024/10から" />
        <Stat value={RESIDENTS.length} label="キャラクターができた人" />
        <Stat value={<LiveNumber statKey="comments" fallback={STATS_FALLBACK.comments} />} label="みんなのコメント" />
      </div>

      <Panel>
        <h2>島を歩いている仲間</h2>
        <p className="muted">
          自分で作ったキャラクターが、そのまま島の中を歩いています。借り物の人形ではなくて、本人です。
        </p>
        <FriendsWall />
      </Panel>

      <Panel>
        <h2>島で何を言われるか</h2>
        <p className="muted">
          島を歩いていると、住人が話しかけてきます。しゃべり方は、その人が配信で書いてきたコメントから写しています。
        </p>
        <div style={{ display: "grid", gap: 16, marginTop: 16 }}>
          {says.map((v) => (
            <div className="gsay" key={v.icon}>
              <span className="crowd-one gsay-bird" style={{ width: 52, height: 52 }}>
                <img src={`https://lh3.googleusercontent.com/d/${v.icon}=s128`} alt="" loading="lazy" />
              </span>
              <p className="gsay-bubble">{v.lines[0]}</p>
            </div>
          ))}
        </div>
      </Panel>

      <Panel>
        <h2>キャラクターを作りたい人へ</h2>
        <p>
          キャラクターは、100円から投げ銭してくれた方にお作りしています。作ったキャラクターは、投げ銭の演出のときに画面に出てきます。この島も歩きます。
        </p>
        <p>
          できあがった画像は、下のGoogleドライブから自由に持っていけます。アイコンに使ってもらって大丈夫です。
        </p>
        <div className="tiles" style={{ marginTop: 14 }}>
          <a className="tile" href={doneru.href} target="_blank" rel="noopener noreferrer">
            <img className="tile-logo" src={doneru.logo} alt="" />
            <span className="tile-text">
              <b>投げ銭してキャラクターを作る</b>
              <i>{doneru.note}</i>
            </span>
            <Icon name="external" size={15} className="tile-go" />
          </a>
          <a className="tile" href={CHARACTER_DRIVE} target="_blank" rel="noopener noreferrer">
            <img className="tile-icon" src="/sprites/stall.webp" alt="" />
            <span className="tile-text">
              <b>キャラクター置き場</b>
              <i>Googleドライブ・自由にダウンロードOK</i>
            </span>
            <Icon name="external" size={15} className="tile-go" />
          </a>
        </div>
      </Panel>

      <Fold title="住人の数え方" lead="「島の住人」が何を数えた数字か">
        <p>
          直近90日のあいだに、5日以上コメントしてくれた人の数です。個人ごとのコメント数や順位は出しません。
          出席日数は月末配信のほうで表彰しています。
        </p>
        <p className="muted">
          名前とアイコンを島に出すかどうかは、本人が決めます。何もしなければ、キャラクターだけが歩いていて名前は出ません。
        </p>
      </Fold>
    </PageShell>
  );
}
