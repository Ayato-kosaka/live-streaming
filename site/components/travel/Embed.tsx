"use client";

import { useState, type ReactNode } from "react";

import { hms, jpDate, watchUrl } from "./scene";

/**
 * その街の配信の埋め込み（1本）。**押すまでは軽い絵だけ**で、押すとその場で再生する
 * （`youtube-nocookie` の iframe に差し替える。`docs/guide-design.md` 3章の16）。
 *
 * 押す前から iframe を置くと、開いただけで YouTube の束（1MB 超）を取りに行く。
 * 見る人だけが払えばいい。
 *
 * **題と場面のリンクは、押す前から HTML の字で置く。** iframe の中は読まれない
 * （AI の読み手は JS を動かさないし、iframe の中まで入らない。6章）。
 *
 * 再生の印は面の側（サーバ）で描いて渡す。ここで `Icon` を名前で引くと、
 * 印の束（174KB）が丸ごと JS に入る（`docs/country-guide.md` 8章）。
 */
export default function Embed({
  v,
  t,
  title,
  date,
  play,
}: {
  v: string;
  t: number;
  title: string;
  date: string;
  play: ReactNode;
}) {
  const [on, setOn] = useState(false);
  return (
    <figure className="tg-embed">
      <div className="tg-embed-box">
        {on ? (
          <iframe
            src={`https://www.youtube-nocookie.com/embed/${v}?start=${t}&autoplay=1&rel=0`}
            title={title}
            allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
            allowFullScreen
          />
        ) : (
          <button type="button" className="tg-embed-btn" onClick={() => setOn(true)} aria-label={`ここで再生する（${title}）`}>
            <img src={`https://i.ytimg.com/vi/${v}/hqdefault.jpg`} alt="" width={480} height={360} loading="lazy" />
            <span className="tg-embed-play" aria-hidden>
              {play}
            </span>
          </button>
        )}
      </div>
      <figcaption>
        {/* 実在する題名の引用（island-design 1章の例外。絵文字もそのまま） */}
        <a href={watchUrl({ v, t })} target="_blank" rel="noopener noreferrer">
          <b data-quote="title">{title}</b>
        </a>
        <span>
          <time dateTime={date}>{jpDate(date)}</time>・{hms(t)} から
        </span>
      </figcaption>
    </figure>
  );
}
