"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { todayNews, type TodayNews } from "@/lib/todayNews";
import { jstNow } from "@/lib/nightly";
import { Arrow, NewDot, Wedge } from "./art";

/**
 * 今日の島。
 *
 * 島に降りると、板が1枚だけ出る。中身は今日の1行（`lib/todayNews.ts` が決める）。
 * 押すと開いて、見出しと本文と行き先が出る。もう一度押すと閉じる。
 *
 * **これは器である。** ほかの仕掛け（1年前の今日・今夜のおたずね・訪問者数）は
 * 全部この板に載る想定なので、中身の決め方は `lib/todayNews.ts` に外へ出してある。
 *
 * 合図は赤い丸ひとつ。島の合図は「入口＝札」「新しいものがある＝赤い丸」の
 * 2種類しかないので、**3つ目を作らない**（`docs/island-design.md` 3-3）。
 *
 * 静的書き出しなので、サーバー側では**何も描かない**。
 * ここでビルド時の「今日」を焼き込むと、次の日から嘘の板が出る。
 */

/** その日はじめて開いたかどうかを覚えておく鍵。中身は JST の YYYY-MM-DD。 */
const SEEN = "ayato-island-today";

/** 中身を数え直す間隔。「あと3時間20分」が止まって見えない程度で足りる。 */
const TICK = 60_000;

export default function Today({ place }: { place: "corner" | "bar" }) {
  const [news, setNews] = useState<TodayNews | null>(null);
  const [open, setOpen] = useState(false);
  /** まだ今日ぶんを見ていない。赤い丸を出すかどうかの判断に使う */
  const [fresh, setFresh] = useState(false);

  useEffect(() => {
    setNews(todayNews());

    // その日はじめて来た人には、押させずに開いて渡す。
    // 「起動から今日は何が違うかまでの距離をゼロにする」のがこの板の役目なので、
    // 1回目だけは向こうから口を開く。2回目からは畳んでおく。
    let first = true;
    try {
      first = localStorage.getItem(SEEN) !== jstNow().date;
      localStorage.setItem(SEEN, jstNow().date);
    } catch {
      /* プライベートモードなどで読めなくても、開いて渡すだけなので気にしない */
    }
    setFresh(first);
    setOpen(first);

    const id = setInterval(() => setNews(todayNews()), TICK);
    return () => clearInterval(id);
  }, []);

  const toggle = useCallback(() => {
    setFresh(false);
    setOpen((v) => !v);
  }, []);

  // 画面が出るまでは何も置かない。中身が今日のものだと確かめられるまで出さない
  if (!news) return null;

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
    <div className={`today${open ? " is-open" : ""}`} data-place={place} data-kind={news.kind} data-ui>
      <button className="today-tab" onClick={toggle} aria-expanded={open}>
        <img className="today-art" src={`/sprites/${news.icon}.webp`} alt="" width={30} height={30} />
        <span className="today-line">
          <em>今日の島</em>
          <b>{news.line}</b>
        </span>
        {fresh && !open && <NewDot />}
        <Wedge />
      </button>

      {open && (
        <div className="today-open">
          <b className="today-title">{news.title}</b>
          {/* 配信のタイトルは引用なので、絵文字が入っていてもそのまま出す
              （`docs/island-design.md` 1章のひとつだけの例外） */}
          {news.quote && <q className="today-quote">{news.quote}</q>}
          <p className="today-body">{news.body}</p>
          {go}
        </div>
      )}
    </div>
  );
}
