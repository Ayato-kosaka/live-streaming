"use client";

import { useState, type ReactNode } from "react";

/**
 * ショート1本。**縦の枠で、押すまではサムネイルだけ。** 押したらその場で `youtube-nocookie` の iframe に差し替える
 * （#1228）。最初から iframe を並べると、開いただけで YouTube の束（1MB 超）を本数ぶん取りに行く。
 *
 * 題と YouTube へのリンクは、押す前から HTML の字で置く（iframe の中は検索にも AI にも読まれない）。
 * 再生の印は面の側（サーバ）で描いて渡す（`"use client"` の部品から `Icon` を名前で引かない）。
 */
export default function ShortPlayer({ id, title, play }: { id: string; title: string; play: ReactNode }) {
  const [on, setOn] = useState(false);
  return (
    <div className="gb-short-box">
      {on ? (
        <iframe
          src={`https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0&playsinline=1`}
          title={title}
          allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
          allowFullScreen
        />
      ) : (
        <button type="button" className="gb-short-btn" onClick={() => setOn(true)} aria-label={`ここで再生する（${title}）`}>
          <img src={`https://i.ytimg.com/vi/${id}/hqdefault.jpg`} alt="" width={480} height={360} loading="lazy" decoding="async" />
          <span className="gb-short-play" aria-hidden="true">
            {play}
          </span>
        </button>
      )}
    </div>
  );
}
