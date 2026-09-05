"use client";

import { useEffect, useState, type ReactNode } from "react";
import { getState, type IslandCurrent } from "@/lib/api";
import { NOW_FALLBACK, LINKS } from "@/content/site";
import { PLANS, planDaysLeft } from "@/content/plans";
import Icon from "@/components/ui/Icon";
import Flag from "@/components/ui/Flag";
import Link from "next/link";
import { NoticeBell } from "./art";

/** 配信は日本時間の22時から、だいたい2〜3時間。 */
const START_H = 22;
const HOURS = 3;

/** いまの日本時間。端末の時計がどこの国に合っていても、日本の22時を基準に数える。 */
function jstParts(now: Date) {
  const t = new Date(now.getTime() + now.getTimezoneOffset() * 60000 + 9 * 3600000);
  return { h: t.getHours(), m: t.getMinutes() };
}

type Clock = { onAir: boolean; mins: number; jst: string };

/** 今夜の配信まであと何分か。22時から3時間のあいだは onAir。 */
function readClock(now: Date): Clock {
  const { h, m } = jstParts(now);
  const jst = `${h}:${String(m).padStart(2, "0")}`;
  const end = (START_H + HOURS) % 24; // 25時 = 1時
  const onAir = h >= START_H || h < end;
  if (onAir) return { onAir, mins: 0, jst };
  let mins = (START_H - h) * 60 - m;
  if (mins <= 0) mins += 24 * 60;
  return { onAir: false, mins, jst };
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
 * letter を付けるのは「いまのポスト」の面だけ。
 * あやと島についての面では板の中に入るので、紙を持ち込まない。
 */
export default function NowLive({ letter, children }: { letter?: boolean; children?: ReactNode }) {
  const [cur, setCur] = useState<IslandCurrent>({ ...NOW_FALLBACK });
  const [fresh, setFresh] = useState(false);
  const [clock, setClock] = useState<Clock | null>(null);
  /** 便りを書いた日からの日数。画面が出るまでは出さない（焼き込みの日数を見せない） */
  const [ago, setAgo] = useState<string | null>(null);
  const [next, setNext] = useState<{ title: string; days: number } | null>(null);
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
      const ahead = PLANS.map((p) => ({ p, d: planDaysLeft(p, now) }))
        .filter((x) => x.d !== null && x.d >= 0)
        .sort((a, b) => a.d! - b.d!)[0];
      setNext(ahead ? { title: ahead.p.title, days: ahead.d! } : null);
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

  // 場所のテーマが国の slug なら、国旗を添える。文章としては出さない符丁なので、絵にだけ使う
  const flag = cur.theme && SLUG.test(cur.theme) ? cur.theme : null;

  return (
    <>
      <section className="panel now-hero">
        <img className="now-pin" src="/sprites/signpost.webp" alt="" />
        <b className="now-place">
          {flag && <Flag slug={flag} size={30} className="now-flag" />}
          {cur.place}
        </b>
        <p className="np-word">{cur.word}</p>

        {/* 今夜あるのか、次はいつなのか。開いて1秒で分かるべき2つを、札にして並べる。 */}
        {clock && (
          <div className="tiles" style={{ marginTop: "var(--sp-4)", textAlign: "left" }}>
            {clock.onAir ? (
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
            {next && (
              <Link className="tile" href="/next">
                {/* しらせの合図はサイト全体でこのベル1種類。予定の入口には必ず付ける */}
                <span className="tile-mark">
                  <NoticeBell size={32} />
                </span>
                <span className="tile-text">
                  <b>次の企画まで {next.days === 0 ? "今日" : `あと${next.days}日`}</b>
                  <i>{next.title}</i>
                </span>
                <Icon name="right" size={15} className="tile-go" />
              </Link>
            )}
          </div>
        )}

        <div className="chips" style={{ justifyContent: "center", marginTop: "var(--sp-3)" }}>
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
