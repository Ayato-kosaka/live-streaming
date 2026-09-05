"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { todayNewsList, type TodayNews } from "@/lib/todayNews";
import { jstNow } from "@/lib/nightly";
import { countVisit } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Arrow, NewDot, Wedge } from "./art";
import { whenIdle } from "./idle";
import Poll from "./Poll";

/**
 * 今日の島。
 *
 * 島に降りると、板が1枚だけ出る。中身は今日の1行（`lib/todayNews.ts` が決める）。
 * 押すと開いて、見出しと本文と行き先が出る。もう一度押すと閉じる。
 *
 * **これは器である。** ほかの仕掛け（1年前の今日・今夜のおたずね・訪問者数）は
 * 全部この板に載る想定なので、中身の決め方は `lib/todayNews.ts` に外へ出してある。
 * 「今夜のおたずね」は開いた面の下に付く（`./Poll.tsx`）。
 * **おたずねが出ていない日は、代わりに今日の2枚目が付く**（`docs/island-review-2.md` 12.1）。
 *
 * 合図は赤い丸ひとつ。島の合図は「入口＝札」「新しいものがある＝赤い丸」の
 * 2種類しかないので、**3つ目を作らない**（`docs/island-design.md` 3-3）。
 *
 * 静的書き出しなので、サーバー側では**何も描かない**。
 * ここでビルド時の「今日」を焼き込むと、次の日から嘘の板が出る。
 */

/** その日はじめて開いたかどうかを覚えておく鍵。中身は JST の YYYY-MM-DD。 */
const SEEN = "ayato-island-today";

/** 島に降りた日を覚えている鍵。書くのは島のほう（`components/island/IslandStage.tsx`）。 */
const VISITED = "ayato-island-arrived";

/** 中身を数え直す間隔。「あと3時間20分」が止まって見えない程度で足りる。 */
const TICK = 60_000;

/**
 * 「今日、◯人が来ました」を出しはじめる人数。
 *
 * 少ない数を出すと、島が寂れて見える。それは「いま何人います」を作らないと決めた
 * のと同じ理由で（`docs/island-play.md` 仕掛け18）、**日単位にしても数が小さければ同じこと**。
 * 届いていない日は黙る。数を小さく見せないための嘘はつかないが、言わない自由はある。
 */
const VISITS_FLOOR = 12;

/**
 * この読み込みで、板を自分から開いたかどうか。
 *
 * 置き場所が corner と bar で分かれているので、画面幅が変わると部品ごと作り直される。
 * そのたびに localStorage を読み書きすると、**2回目の判定で「今日はもう見た」になり、
 * 自動で開かないまま終わる**。1回の読み込みのあいだは、最初に出した答えを使い回す。
 * （画面が変わっていなくても、開発中は効果が2回走るので同じことが起きる）
 */
let openedThisLoad: boolean | null = null;

/**
 * 前に島へ降りた日。**島が今日の日付で上書きする前に読む必要がある**ので、
 * この読み込みでいちばん最初に読んだ値を、部品が作り直されても持ち回る。
 *
 * `undefined` は「まだ読んでいない」、`null` は「読んだが記録が無かった」＝初めての人。
 */
let lastVisitThisLoad: string | null | undefined;

function readLastVisit(): string | null {
  if (lastVisitThisLoad !== undefined) return lastVisitThisLoad;
  let v: string | null = null;
  try {
    const raw = localStorage.getItem(VISITED);
    // 前の版が入れていた "1" のような、日付になっていない値は無かったことにする
    v = raw && /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : null;
  } catch {
    /* プライベートモードなどで読めなくても、板は出る */
  }
  lastVisitThisLoad = v;
  return v;
}

export default function Today({ place }: { place: "corner" | "bar" }) {
  const [news, setNews] = useState<TodayNews[] | null>(null);
  const [open, setOpen] = useState(false);
  /** まだ今日ぶんを見ていない。赤い丸を出すかどうかの判断に使う */
  const [fresh, setFresh] = useState(false);
  /** 今夜のおたずねが出ていて、まだ押していない。これも赤い丸の理由になる */
  const [asking, setAsking] = useState(false);
  /** 今夜は問いが無い日。空いた場所に今日の2枚目を出す */
  const [noPoll, setNoPoll] = useState(false);
  /** 今日ここに来た人の数。分からない日は null のまま */
  const [visits, setVisits] = useState<number | null>(null);
  const { token } = useAuth();
  /* 問いは島が落ち着いてから読みに行くので、返事が来たときには
     もう板を開いているかもしれない。開いたあとに丸を足さないための見張り。 */
  const seen = useRef(false);

  useEffect(() => {
    const who = { lastVisit: readLastVisit() };
    const list = todayNewsList(new Date(), who);
    setNews(list);

    // その日はじめて来た人には、押させずに開いて渡す。
    // 「起動から今日は何が違うかまでの距離をゼロにする」のがこの板の役目なので、
    // 1回目だけは向こうから口を開く。2回目からは畳んでおく。
    //
    // ただし**開くのは、今日ほんとうに何かある日だけ**にする。
    // 畳んだ札にも1行は出ているので、距離はそれでゼロになっている。
    // 毎日かならず開くと、初めて来た人の第一印象が「島」ではなく
    // 「板が2枚」になってしまう（島がほとんど見えなくなる）。
    let first = openedThisLoad ?? true;
    if (openedThisLoad === null) {
      try {
        first = localStorage.getItem(SEEN) !== jstNow().date;
        localStorage.setItem(SEEN, jstNow().date);
      } catch {
        /* プライベートモードなどで読めなくても、開いて渡すだけなので気にしない */
      }
      openedThisLoad = first;
    }
    setFresh(first);
    // 配信中・企画の当日・きのう料理を作った日・節目の日だけ、向こうから開く。
    // 1年前の今日と「今夜まであとN分」は、畳んだ1行で足りる。
    //
    // **スマホでは開かない。** 390×844 で板と問いが同時に開くと、
    // 島の絵が上端の帯しか見えなくなる（`docs/island-review-2.md` 8.3）。
    // 仕掛け1の狙い（降りた瞬間に今日が分かる）は、畳んだ1行で足りている。
    //
    // **島に初めて降りた人にも開かない。** その人には島のカモメが1回だけ名乗る
    // （IslandStage）。板とカモメを同時に出すと、島が見えないうえに、
    // どちらを読めばいいのか分からなくなる。名乗りのほうが先。
    const worthOpening =
      first &&
      place === "corner" &&
      who.lastVisit !== null &&
      ["live", "plan", "recipe", "milestone"].includes(list[0].kind);
    setOpen(worthOpening);
    // 自動で開いた日は、その時点で今日ぶんを見せたことになる
    if (worthOpening) seen.current = true;

    const id = setInterval(() => setNews(todayNewsList(new Date(), who)), TICK);
    return () => clearInterval(id);
  }, [place]);

  /* ログインの状態は、板が作り直されるたびに新しい入れ物で来ることがある
     （Provider の外にいるとき）。依存に入れると数えに行くのが何度も走るので、
     いちばん新しいものを持つだけにする。 */
  const auth = useRef(token);
  auth.current = token;

  // 今日ここに来た人を数える。**1日1回だけ**（`lib/api.ts` の countVisit）。
  // 島に降りる演出のあいだは走らせない。問いと同じ待ち方をする
  useEffect(() => {
    let alive = true;
    const stop = whenIdle(() => {
      auth
        .current()
        .then((t) => countVisit(t))
        .then((n) => {
          if (alive) setVisits(n);
        })
        .catch(() => {
          /* 数えられなかった日は黙る。島の中でサーバーの失敗を見せない */
        });
    });
    return () => {
      alive = false;
      stop();
    };
  }, []);

  const toggle = useCallback(() => {
    seen.current = true;
    setFresh(false);
    // 押していなくても、一度見た問いは「新しいもの」ではない。
    // 押すまで丸を出し続けると、赤い丸が催促になる。
    setAsking(false);
    setOpen((v) => !v);
  }, []);

  /** 問いが出ているか、押し終わったかの伝言。まだ板を開いていないときだけ丸にする。 */
  const onPoll = useCallback((unanswered: boolean) => {
    setAsking(unanswered && !seen.current);
  }, []);

  const onEmpty = useCallback(() => setNoPoll(true), []);

  // 画面が出るまでは何も置かない。中身が今日のものだと確かめられるまで出さない
  if (!news) return null;

  const top = news[0];
  /** 今日の2枚目。おたずねが無い日にだけ出す */
  const more = news[1];

  return (
    <div className={`today${open ? " is-open" : ""}`} data-place={place} data-kind={top.kind} data-ui>
      <button className="today-tab" onClick={toggle} aria-expanded={open}>
        <img className="today-art" src={`/sprites/${top.icon}.webp`} alt="" width={30} height={30} />
        <span className="today-line">
          <em>今日の島</em>
          <b>{top.line}</b>
        </span>
        {(fresh || asking) && !open && <NewDot />}
        <Wedge />
      </button>

      {/* 畳んでいるあいだも消さずに置いておく。問いを読みに行くのは中の Poll なので、
          消してしまうと板を開くまで赤い丸が出ない。display が戻るときに
          開く動きもやり直される（`app/css/today.css`）。 */}
      <div className="today-fold" hidden={!open}>
        <div className="today-open">
          <Face news={top} />
          {/* 今日ここに来た人。島の絵の上ではなく、板の中の最後に小さく置く。
              **同時接続ではなく日単位**（`docs/island-play.md` 仕掛け16・18）。 */}
          {visits !== null && visits >= VISITS_FLOOR && (
            <p className="today-visits">今日、{visits.toLocaleString()}人がこの島に来た</p>
          )}
        </div>

        {/* 配信中は問いを出さない。島に留めずに外へ出すのが正解なので、
            「見にいく」の隣に押すものを増やさない（`docs/island-play.md` 5章）。 */}
        {top.kind !== "live" && <Poll onCount={onPoll} onEmpty={onEmpty} />}

        {/* 今夜のおたずねが無い日。**板をもう1段深くする。**
            「まだ出ていない」の1行で終わらせると、押すものが1つも増えない。
            ここに出るのは今日の2枚目で、その下に掲示板への橋を1本だけ残す。 */}
        {top.kind !== "live" && noPoll && more && (
          <div className="today-open today-more">
            <b className="poll-ask">もうひとつ</b>
            <Face news={more} />
            <p className="today-nopoll">
              今夜のおたずねは、まだ出ていない。
              <Link className="poll-why" href="/board">
                掲示板に企画を貼る
                <Arrow size={11} />
              </Link>
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

/** 開いた1枚の中身。1枚目も2枚目も同じ形で出す。 */
function Face({ news }: { news: TodayNews }) {
  const go = news.out ? (
    <a className="today-go" href={news.href} target="_blank" rel="noopener noreferrer">
      {news.go}
      <Arrow />
    </a>
  ) : (
    <Link className="today-go" href={news.href}>
      {news.go}
      <Arrow />
    </Link>
  );
  return (
    <>
      <b className="today-title">{news.title}</b>
      {/* 配信のタイトルは引用なので、絵文字が入っていてもそのまま出す
          （`docs/island-design.md` 1章のひとつだけの例外） */}
      {news.quote && <q className="today-quote">{news.quote}</q>}
      <p className="today-body">{news.body}</p>
      {go}
    </>
  );
}
