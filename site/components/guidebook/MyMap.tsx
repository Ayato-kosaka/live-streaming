"use client";

import { useState } from "react";

import type { MyMap as MyMapT } from "@/content/guidebook/types";

/**
 * 節の下の地図。**Google マイマップの埋め込み**（`docs/mymaps.md`）。前の `/bulgaria` の `BgMyMap` を、
 * どの街でも使える形にしたもの。決まりはそのまま:
 *
 * - **押すまで触らせない。** スマホで地図がページの送りを飲む（指を置いた所が地図だと、下へ送るつもりが
 *   地図が動く）。覆いを1枚かけて、押されたときだけ外す。押すまでは絵として見える
 * - **押すまで Tab から外す。** 中に Google の操作子が何十個も並んでいて、Tab がそこから出てこない
 *   （`reachkeys` が17件で捕まえた）
 * - `&hl=ja`（付けないと現地の言葉で開く）・中心と縮尺（`ll` `z`）は**ピンの広がりから焼いたもの**を渡す
 *   （渡さないと全部のピンが入る縮尺で開き、62km 先のリラ修道院に引っぱられて県ごと写る）
 * - `loading="lazy"`（地図1枚が Google の地図を丸ごと読む。3枚を最初に読むとスマホで重い）
 *
 * この箱からは、撮っても枠が空で写ることがある（`CLAUDE.md`「このサンドボックスから出られない先」）。
 */
export default function MyMap({ m, caption }: { m: MyMapT; caption: string }) {
  const [live, setLive] = useState(false);
  return (
    <figure className="gb-mm">
      <div className={`gb-mm-box${live ? " is-live" : ""}`}>
        <iframe
          src={`https://www.google.com/maps/d/embed?mid=${m.mid}&hl=ja&ll=${m.ll}&z=${m.z}`}
          title={m.title}
          loading="lazy"
          tabIndex={live ? 0 : -1}
          sandbox="allow-scripts allow-same-origin allow-popups"
          referrerPolicy="no-referrer-when-downgrade"
        />
        {!live && (
          <button type="button" className="gb-mm-tap" onClick={() => setLive(true)}>
            <span>地図を動かす</span>
          </button>
        )}
      </div>
      <figcaption>{caption}</figcaption>
    </figure>
  );
}
