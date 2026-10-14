import type { Metadata } from "next";
import { share } from "@/lib/share";
import Link from "next/link";
import PageShell, { PageHead } from "@/components/ui/PageShell";
import { H, Rec, Sheet, Zone } from "@/components/streams/Sheet";
import { ArtMedal, ArtMeeting } from "@/components/streams/Art";
import Icon from "@/components/ui/Icon";
import { MONTHS, TAP_GOAL } from "@/content/months";
import { Face, man, md, yen } from "@/components/months/parts";

export const metadata: Metadata = share({
  key: "months",
  title: "月ごとのふりかえり",
  description:
    "ひと月ずつの記録。その月の流れ、出席ランキング、投げ銭ありがとう、タップタップ。月末配信の日で区切ってある。",
  path: "/months",
});

/**
 * 月ごとのふりかえりの棚。
 *
 * ## 入口の札に、時制も件数も置かない
 *
 * `docs/island-standards.md` 16章。ここは月が1つずつ増える棚なので、
 * 「今月」「最新」「9ヶ月ぶん」を札にすると、焼いた日の字がそのまま残る。
 * **札が言うのは「何の置き場か」だけ。** 数は中身の側が数える。
 *
 * ## 棒の目盛り
 *
 * タップは 4万〜17万 まで開きがある。5万（目標）を基準にすると
 * 16万の月が画面から出るので、**いちばん多かった月を満タン**にして、
 * 5万のところに線を引く。どの月が線を越えたかが一目で分かる。
 */
export default function MonthsPage() {
  const top = Math.max(...MONTHS.map((m) => m.taps ?? 0), TAP_GOAL);
  const hit = MONTHS.filter((m) => (m.taps ?? 0) >= TAP_GOAL).length;
  const withTaps = MONTHS.filter((m) => m.taps !== undefined);
  const streams = MONTHS.reduce((n, m) => n + m.streams.length, 0);
  const tips = MONTHS.reduce((n, m) => n + m.tipTotal, 0);
  // 古い月が左。棒を並べるときだけは、時間が左から右へ流れるほうが読める
  const bars = [...MONTHS].reverse();

  return (
    <PageShell crumbs={[{ label: "ふりかえり" }]}>
      <PageHead
        icon="stage-award"
        title="月ごとのふりかえり"
        lead="ひと月ぶんの配信をぜんぶ並べて、出席と投げ銭とタップを数えたもの。月末配信の日で区切ってある。"
      />

      <Sheet>
        <Zone tight>
          <Rec
            items={[
              { n: MONTHS.length, unit: "ヶ月", label: "ならんでいる" },
              { n: streams, unit: "本", label: "この中の配信" },
              { n: yen(tips), unit: "円", label: "投げ銭ありがとう" },
              { n: `${hit}/${withTaps.length}`, label: "5万タップに届いた月" },
            ]}
          />
        </Zone>

        <Zone>
          <H art={<ArtMedal size={32} />} note="点線が5万">
            タップタップ、どこまで行ったか
          </H>
          <div className="mbars">
            {/* 5万の線。棒の柱（150px）の中に引く。**li にすると列を1つ食う** */}
            <span className="mbars-goal" style={{ bottom: `${Math.round((TAP_GOAL / top) * 150)}px` }} aria-hidden />
            <ul className="mbars-row">
              {bars.map((m) => (
                <li key={m.key}>
                  {/* **押せない。** 390px に9本並べると1本 35px しか取れず、
                      指で押せる最小 48px（`docs/island-design.md` 3-2）を割る。
                      押せる合図（厚み）も付けない。行き先はすぐ下のマス。 */}
                  <span className="mbar">
                    <span className="mbar-col">
                      <b
                        className={`mbar-fill${(m.taps ?? 0) >= TAP_GOAL ? " is-hit" : ""}`}
                        style={{ height: `${Math.round(((m.taps ?? 0) / top) * 100)}%` }}
                      />
                    </span>
                    {/* 390px で9本並ぶと、6桁の数字が隣とくっつく。万で出す */}
                    <span className="mbar-v">{m.taps !== undefined ? man(m.taps) : "—"}</span>
                    <span className="mbar-m">{m.month}月</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </Zone>

        <Zone tight>
          <H art={<ArtMeeting size={32} />}>ひと月ずつ</H>
        </Zone>

        <Zone flush>
          <div className="mcards">
            {MONTHS.map((m) => {
              const first = m.tips[0];
              const perfect = m.attend.filter((a) => a.d >= m.denom).length;
              return (
                <Link className="mcard" key={m.key} prefetch={false} href={`/months/${m.key}`}>
                  <span className="mcard-h">
                    <b>
                      {m.month}
                      <i>月</i>
                    </b>
                    <span className="mcard-y">{m.year}</span>
                  </span>
                  <span className="mcard-b">
                    <time>
                      {md(m.from)}〜{md(m.to)}
                    </time>
                    <span className="mcard-f">
                      <span>
                        <b>{m.streams.length}</b>
                        <i>本</i>
                      </span>
                      <span>
                        <b>{m.people}</b>
                        <i>人</i>
                      </span>
                      {m.taps !== undefined && (
                        <span>
                          <b>{yen(m.taps)}</b>
                          <i>タップ</i>
                        </span>
                      )}
                    </span>
                    {first && (
                      <span className="mcard-top">
                        <Face icon={first.i} name={first.n} size={28} />
                        <em>{first.n}</em>
                        <b>{yen(first.y)}円</b>
                      </span>
                    )}
                    <span className="mcard-tags">
                      {perfect > 0 && (
                        <em className="zk-chip">
                          <Icon name="crown" size={13} />
                          皆勤 {perfect}人
                        </em>
                      )}
                      {m.review && (
                        <em className="zk-chip is-soft">
                          <Icon name="trophy" size={13} />
                          授賞式あり
                        </em>
                      )}
                    </span>
                  </span>
                  <Icon name="right" size={15} className="mcard-go" />
                </Link>
              );
            })}
          </div>
        </Zone>
      </Sheet>

      <div className="tiles">
        <Link prefetch={false} className="tile" href="/streams/monthly" style={{ ["--tile" as string]: "var(--roof-gold)" }}>
          <img className="tile-icon" src="/sprites/stage-award.webp" alt="" />
          <span className="tile-text">
            <b>月末配信って何をやってるの</b>
            <i>1ヶ月ぶんのチャットを読み返して、表彰する夜</i>
          </span>
          <Icon name="right" size={15} className="tile-go" />
        </Link>
        <Link prefetch={false} className="tile" href="/friends" style={{ ["--tile" as string]: "var(--roof-mint)" }}>
          <img className="tile-icon" src="/sprites/tent-small.webp" alt="" />
          <span className="tile-text">
            <b>住んでる人</b>
            <i>島を歩いているみんなの図鑑</i>
          </span>
          <Icon name="right" size={15} className="tile-go" />
        </Link>
      </div>
    </PageShell>
  );
}
