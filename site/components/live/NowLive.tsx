"use client";

import { useEffect, useState, type ReactNode } from "react";
import { getState, type IslandCurrent } from "@/lib/api";
import { NOW_FALLBACK, LINKS } from "@/content/site";
import { nextPlan, planDaysLeft, planPhase, type PlanPhase } from "@/content/plans";
import { placeCountry } from "@/content/place";
import Icon from "@/components/ui/IconCore";
import Flag from "@/components/ui/Flag";
import Link from "next/link";
import { NoticeBell } from "./art";
import { stayNow, travelNow, tripAsPlace, tripDayWord, type StayNow, type TravelNow } from "@/lib/stay";
import { readNight } from "@/lib/nightly";
import Say from "@/components/ui/Say";
import { nights } from "@/content/nights";

/** いまの日本時間。端末の時計がどこの国に合っていても、日本を基準に見せる。 */
function jstParts(now: Date) {
  const t = new Date(now.getTime() + now.getTimezoneOffset() * 60000 + 9 * 3600000);
  return { h: t.getHours(), m: t.getMinutes() };
}

type Clock = { onAir: boolean; mins: number; loose: boolean; jst: string };

/**
 * 今夜の配信まであと何分か。
 *
 * **数え方は `lib/nightly.ts` に1つだけ置いてある。** ここに写しを持っていたころ、
 * 旅のあいだかどうかの判断が2つになって、板とこの札で違うことを言う形になっていた。
 * ここが自前で持つのは、画面に出す日本時間の時計の字だけ。
 */
function readClock(now: Date): Clock {
  const { h, m } = jstParts(now);
  return { ...readNight(now), jst: `${h}:${String(m).padStart(2, "0")}` };
}

/** 「3時間20分」。1時間を切ったら分だけ。 */
function span(mins: number) {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h}時間${m}分` : `${m}分`;
}

/**
 * この便りを、いつ書いたか。
 *
 * 日付だけ出しても、それが古いのかどうかは読む人が引き算する。
 * 「今週なにをするか」と書いてある紙が2週間前のものだったら、
 * それは今週の話ではない。**古いことは古いと言う。**
 * 静的書き出しなので、画面が出てから数え直す。
 */
function wroteAgo(updatedAt: string | undefined, now: Date): string | null {
  if (!updatedAt) return null;
  const [y, m, d] = updatedAt.split("-").map(Number);
  if (!y || !m || !d) return null;
  const days = Math.round(
    (Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) - Date.UTC(y, m - 1, d)) / 86400000,
  );
  if (days < 0) return null;
  if (days === 0) return "今日書いた";
  if (days === 1) return "きのう書いた";
  if (days <= 8) return `${days}日前に書いた`;
  return "しばらく書けていません";
}

/** 場所の色テーマ（georgia / nordic …）は島の景色を変えるための符丁。文章としては出さない。 */
const SLUG = /^[a-z0-9-]+$/;

/**
 * いま、どこで何をしているか。
 *
 * 開いた人がまず知りたいのは「いまどこ」と「今夜あるのか」の2つ。
 * だから場所とひとことのすぐ下に、今夜の配信までの残り時間を置く。
 * 場所と今週やることは Firestore の current から来る。無ければ焼き込みの値のまま出す。
 *
 * 上の「いまどこ・今夜あるか」は板の型（押すもの・しらせ）。
 * 下の「今週やること」は紙の型（記録）。本物のUIもこの2つを分けている
 * （`docs/ac-reference.md` の 7章）。混ざらないよう、台紙ごと分けて置く。
 *
 * letter を付けるのは「いまどこ」の面だけ。
 * あやと島についての面では板の中に入るので、紙を持ち込まない。
 */
export default function NowLive({ letter, children }: { letter?: boolean; children?: ReactNode }) {
  const [cur, setCur] = useState<IslandCurrent>({ ...NOW_FALLBACK });
  const [fresh, setFresh] = useState(false);
  const [clock, setClock] = useState<Clock | null>(null);
  /** 便りを書いた日からの日数。画面が出るまでは出さない（焼き込みの日数を見せない） */
  const [ago, setAgo] = useState<string | null>(null);
  const [next, setNext] = useState<{ title: string; days: number | null; phase: PlanPhase } | null>(
    null,
  );
  /** いまいる国に、今日で何日目か。画面が出るまでは出さない（焼き込みの日数を見せない） */
  const [stay, setStay] = useState<StayNow | null>(null);
  /** 人の書いた「いまどこ」が古くなった日、かわりに出す旅（`lib/stay.ts`） */
  const [trip, setTrip] = useState<TravelNow | null>(null);
  /** いま歩いている旅。**人の字が勝っている日も、旅は進んでいる**（日数の札に使う） */
  const [travel, setTravel] = useState<TravelNow | null>(null);
  const youtube = LINKS.find((l) => l.id === "youtube")!;

  useEffect(() => {
    let alive = true;
    getState()
      .then((s) => {
        if (!alive || !s.current) return;
        setCur((prev) => ({ ...prev, ...s.current } as IslandCurrent));
        setFresh(true);
      })
      .catch(() => {
        /* API がまだ無い/落ちている時は焼き込みの値のまま出す */
      });

    // 静的書き出しなので、残り時間をビルド時に数えるわけにいかない。
    // 画面が出てから数えて、1分ごとに数え直す。
    const tick = () => {
      const now = new Date();
      setClock(readClock(now));
      /* いちばん近い企画。**「あと何日」で選ばない。**
         旅は出発の日を過ぎると日数がマイナスになるので、残り日数で絞ると
         17日間そのあいだ、いま行っている旅がここから丸ごと落ちる
         （実測：旅の4日目の `/now` に企画の札が1枚も無い）。
         いま行っているものを先に出す決めかたは、島の1画面目と同じものを見る
         （`content/plans.ts` の `nextPlan`）。 */
      const p = nextPlan(now);
      setNext(p ? { title: p.title, days: planDaysLeft(p, now), phase: planPhase(p, now) } : null);
      setStay(stayNow(now));
      setTravel(travelNow(now));
    };
    tick();
    const id = setInterval(tick, 60000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  /* 便りを書いた日からの日数だけは、便りが Firestore から届いたあとに数え直す。
     上の useEffect に混ぜると、日付が変わるたびに便りを取りに行く輪になる。 */
  useEffect(() => setAgo(wroteAgo(cur.updatedAt, new Date())), [cur.updatedAt]);

  /* 「いまどこ」を、人の字で言うか旅で言うか。**便りの日付で決まる**ので、
     便りが届いたあとにもう一度見る。 */
  useEffect(() => setTrip(tripAsPlace(cur.updatedAt, new Date())), [cur.updatedAt]);

  /* 国旗は、**人が書いた場所の字**から引く（`content/place.ts`）。
     島の景色（`theme`）から引いていたころ、景色に入れてよい3つのうち
     `nordic` は国ではないので、リトアニアの街の上でジョージアの旗が出るか、
     景色を替えると旗ごと消えるかの2つしかなかった（実測 2026-09-15）。
     旅を出しているとき（`trip`）はテントの絵が場所を言うので、旗は添えない。 */
  const here = placeCountry(cur.place);
  const flag = trip ? null : here?.slug ?? null;

  return (
    <>
      {/* この箱そのものは押せない。押せるのは中の札2枚だけなので、
          箱は紙にして、板は押せるものだけに残す。
          厚み8pxの板を、押せないまま紙の地に積んでいた
          （`docs/island-review-2` 3章）。 */}
      <section className="panel paper now-hero">
        {/* **いちばん大きい絵が、いちばん大きい嘘になりうる。**
            旅に出るとあやとはこの欄を書き替えられないので、書き替えられないあいだ
            260px のジョージアの国旗が「いまここ」と言い続ける。
            誰も書けていない日は、旅そのものを出す（`lib/stay.ts` の `tripAsPlace`）。
            あやとが旅先で書き替えたら、そちらのほうが細かいので人の字が勝つ。 */}
        <b className="now-place">
          {trip ? (
            <img className="now-trip-art" src="/sprites/tent.webp" alt="" width={304} height={249} />
          ) : (
            flag && <Flag slug={flag} size={30} className="now-flag" />
          )}
          {trip ? `${trip.name}のとちゅう` : cur.place}
        </b>
        {/* 旅を出している日は旅の一言が勝つ（master 側）。人の字を出す日は、
            そこに「毎晩22時」が混ざりうるので `Say` を通す（旅のあいだだけ言い方が変わる）。 */}
        <p className="np-word">{trip ? `${trip.note}。` : cur.word ? <Say t={cur.word} /> : null}</p>

        {/* 今夜あるのか、次はいつなのか。開いて1秒で分かるべき2つを、札にして並べる。 */}
        {clock && (
          <div className="tiles" style={{ marginTop: "var(--sp-4)", textAlign: "left" }}>
            {clock.loose ? (
              /* 旅のあいだ。始まる時刻がその日の道で決まるので、時刻も残りも言わない。
                 **無い数字を出すくらいなら、その欄ごと出さない。**
                 置き場所と形は同じにして、中身だけ入れ替える。 */
              <a className="tile" href={youtube.href} target="_blank" rel="noopener noreferrer">
                <img className="tile-icon" src="/sprites/tower-studio.webp" alt="" />
                <span className="tile-text">
                  <b>{nights(new Date()).tonight}</b>
                  <i>{nights(new Date()).span}</i>
                </span>
                <Icon name="external" size={15} className="tile-go" />
              </a>
            ) : clock.onAir ? (
              <a
                className="tile"
                href={youtube.href}
                target="_blank"
                rel="noopener noreferrer"
                style={{ ["--tile" as string]: "var(--accent)" }}
              >
                <img className="tile-icon" src="/sprites/tower-studio.webp" alt="" />
                <span className="tile-text">
                  <b>いま、配信の時間です</b>
                  <i>日本時間 {clock.jst}。22時から、だいたい2〜3時間</i>
                </span>
                <Icon name="external" size={15} className="tile-go" />
              </a>
            ) : (
              // 配信の時間でなくても置き場所と形は変えない。時間が来たら中身だけ入れ替わる。
              // 押せない板を押せる板に混ぜない決まりなので、待ち時間のあいだも行き先は持たせる。
              <a className="tile" href={youtube.href} target="_blank" rel="noopener noreferrer">
                <img className="tile-icon" src="/sprites/tower-studio.webp" alt="" />
                <span className="tile-text">
                  <b>今夜の配信まで あと{span(clock.mins)}</b>
                  <i>日本時間22時から。いま日本は {clock.jst}。前回の配信はここから</i>
                </span>
                <Icon name="external" size={15} className="tile-go" />
              </a>
            )}
            {/* 旅のあいだだけ。「いまどこ ＝ 北欧周遊のとちゅう」と読んだ人が
                次に行きたいのはこの島（旅の中身がぜんぶある）。 */}
            {trip && (
              <Link className="tile" href={trip.href} prefetch={false}>
                <img className="tile-icon" src="/sprites/signpost-flags.webp" alt="" />
                <span className="tile-text">
                  <b>{trip.name}の島へ</b>
                  <i>この旅のこと、旅の6カ国、旅のしおり</i>
                </span>
                <Icon name="right" size={15} className="tile-go" />
              </Link>
            )}
            {next && (
              <Link className="tile" href="/next">
                {/* しらせの合図はサイト全体でこのベル1種類。予定の入口には必ず付ける */}
                <span className="tile-mark">
                  <NoticeBell size={32} />
                </span>
                <span className="tile-text">
                  <b>
                    {next.phase === "during"
                      ? "いま、この企画のとちゅう"
                      : /* **行ってきた企画を「次の企画」と呼ばない。**
                           まだ来ていない企画が1つも無くなると、`nextPlan()` は
                           終わった企画を返す（次の大物を先に告知するための受け）。
                           日数で言うとマイナスになるので、旅から帰った 9/28 から
                           「次の企画まで あと-19日」と出ていた。**新しい企画を
                           足すまで消えない**ので、日数ではなく位置づけで言う。
                           字は島の1画面目（`components/live/NextUp.tsx`）と揃える。 */
                        next.phase === "after"
                        ? "行ってきた"
                        : next.days === null
                          ? "次の企画"
                          : `次の企画まで ${next.days === 0 ? "今日" : `あと${next.days}日`}`}
                  </b>
                  <i>{next.title}</i>
                </span>
                <Icon name="right" size={15} className="tile-go" />
              </Link>
            )}
          </div>
        )}

        <div className="chips" style={{ justifyContent: "center", marginTop: "var(--sp-3)" }}>
          {/* いまいる国に何日いるか（`docs/island-play.md` 仕掛け10）。
              上の「いまどこ」はあやとが手で書いたものなので、週に1度しか動かない。
              この1つだけは毎日1ずつ増えるので、旅が止まっていないことがここに出る。
              静的書き出しなので、画面が出てから数える（`lib/stay.ts`）。 */}
          {stay && (
            <span className="chip">
              <Icon name="clock" size={12} />
              {stay.name}に来て {stay.days.toLocaleString()}日目
            </span>
          )}
          {/* 国が引けない日も、旅が止まっていないことはここに出る。
              **字は `lib/stay.ts` の `tripDayWord` から。** 数え方も言い方も
              旅程表（`/nordic` の「2日目」）と1つにしてある。 */}
          {travel && (
            <span className="chip">
              <Icon name="clock" size={12} />
              {tripDayWord(travel.days)}
            </span>
          )}
          {cur.theme && !SLUG.test(cur.theme) && (
            <span className="chip">
              <Icon name="light" size={12} />
              今月のテーマ｜{cur.theme}
            </span>
          )}
          {/* 同じ日付を、上の札と下の便りのスタンプで2回出していた。
              ここは「どれくらい前の話か」だけを言う。日付は便りの右上にある。 */}
          {ago && (
            <span className="chip">
              <Icon name={fresh ? "live" : "clock"} size={12} />
              {ago}
            </span>
          )}
        </div>
      </section>

      {letter ? (
        // 島だより。ここから下は紙の型。押すものではなく、読むもの。
        <div className="pap-mat">
          <div className="pap">
            <b className="pap-tag">島だより</b>
            <span className="np-stamp">{cur.updatedAt?.replace(/-/g, ".")}</span>
            {cur.week?.length > 0 && (
              <section className="pap-sec">
                <h2 className="pap-h">今週、なにをするんだろう</h2>
                <ul className="pap-rows">
                  {cur.week.map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                </ul>
              </section>
            )}
            {children}
          </div>
        </div>
      ) : (
        cur.week?.length > 0 && (
          <section className="panel">
            <h2>今週やること</h2>
            <ul className="week">
              {cur.week.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          </section>
        )
      )}
    </>
  );
}
